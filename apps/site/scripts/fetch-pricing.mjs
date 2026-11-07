#!/usr/bin/env node
// Refreshes `data/pricing/<tool>.yml` from the vendors' pricing pages.
//
//   node scripts/fetch-pricing.mjs            re-extract every page whose text changed
//   node scripts/fetch-pricing.mjs --check    only report which pages changed (exit 1 if any)
//   node scripts/fetch-pricing.mjs --only percy --force   re-extract one tool even if unchanged
//   node scripts/fetch-pricing.mjs --accept   record the current page hash without extracting
//   node scripts/fetch-pricing.mjs --dry-run  print the extraction request instead of sending it
//
// Each page is fetched, reduced to text and hashed; the hash is compared with
// `pageHash` in the file. Changed pages go to Claude with a tool definition that
// mirrors the YAML shape, and the file is rewritten with the extracted plans, a
// new `fetchedAt`, `pageHash` and `confidence`. `tool`, `pricingPage`,
// `pageSection` and the hand-written top-level `notes` are kept. Extraction needs ANTHROPIC_API_KEY;
// `--check`, `--accept` and `--dry-run` work without it.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML, { Scalar } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
export const PRICING_DIR = join(here, '..', 'data', 'pricing');
export const MODEL = 'claude-opus-5-5';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const TIMEOUT_MS = 30_000;
// Shorter than this is a bot challenge or an error page, not a pricing page.
const MIN_TEXT_LENGTH = 400;
// Vendor pricing pages run from 2k to 250k characters; cap what goes to the model.
const MAX_TEXT_LENGTH = 400_000;

/** The HTML reduced to the words a reader sees: no scripts, styles, tags or runs of whitespace. */
export const htmlToText = (html) =>
  html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The part of the page between the first `start` and the following `end`
 * marker, for pages that list several products (BrowserStack's lists every
 * product and A/B-tests the copy of the others).
 */
export const sliceSection = (text, section) => {
  if (!section) return text;
  const from = text.indexOf(section.start);
  const to =
    from === -1 ? -1 : text.indexOf(section.end, from + section.start.length);
  if (from === -1 || to === -1) {
    throw new Error(
      `pageSection marker "${from === -1 ? section.start : section.end}" not found on the page`,
    );
  }
  return text.slice(from, to);
};

export const hashText = (text) =>
  createHash('sha256').update(text).digest('hex');

export async function fetchPageText(url, { fetchImpl = fetch, section } = {}) {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*;q=0.8' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = htmlToText(await response.text());
  if (text.length < MIN_TEXT_LENGTH) {
    throw new Error(
      `page text is ${text.length} characters, probably a bot check or an error page`,
    );
  }
  return sliceSection(text, section);
}

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'monthly',
    'annualMonthly',
    'included',
    'overage',
    'notes',
  ],
  properties: {
    name: { type: 'string', description: 'The plan name as printed.' },
    monthly: {
      ...nullable({ type: 'number' }),
      description:
        'Price per month when billed monthly, as a plain number. For seat-metered vendors the price per seat per month. null when the page shows no number for the plan (custom quote, contact sales) or only a yearly price.',
    },
    annualMonthly: {
      ...nullable({ type: 'number' }),
      description:
        'Price per month when billed yearly, when the page offers it (e.g. "$199/month billed annually"). null otherwise.',
    },
    included: {
      type: 'object',
      additionalProperties: false,
      required: ['snapshots', 'seats'],
      properties: {
        snapshots: {
          ...nullable({ type: 'integer' }),
          description:
            'Screenshots or snapshots per month the plan includes. null when the page does not state a number or does not meter screenshots.',
        },
        seats: {
          ...nullable({ type: 'integer' }),
          description:
            'Users or team members the plan allows. null when unlimited or not stated.',
        },
      },
    },
    overage: {
      ...nullable({
        type: 'object',
        additionalProperties: false,
        required: ['per', 'price'],
        properties: {
          per: {
            type: 'integer',
            description:
              'Block size the overage price applies to: 1 for a per-screenshot price, 1000 for a per-thousand price.',
          },
          price: { type: 'number', description: 'Price per block.' },
        },
      }),
      description:
        'Price for screenshots beyond the included amount. null when the page states there is none (usage pauses) or says nothing about it.',
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Short facts from the page the fields above cannot hold: browsers, retention, trial length, add-ons, "per device". Empty when there are none.',
    },
  },
};

export const EXTRACT_TOOL = {
  name: 'record_pricing',
  description:
    "Records the plans printed on a vendor's pricing page. Every number must appear on the page; anything the page does not state is null.",
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['currency', 'unit', 'plans', 'confidence'],
    properties: {
      currency: {
        type: 'string',
        description: 'ISO 4217 code of the prices on the page, e.g. USD.',
      },
      unit: {
        type: 'string',
        enum: ['snapshot', 'screenshot', 'seat', 'custom'],
        description:
          'What the vendor meters: "snapshot" or "screenshot" (the page\'s own word) when plans include a monthly amount of them, "seat" when the price is per user, "custom" for anything else (checkpoints, devices, pages) or when the page shows no numbers.',
      },
      plans: {
        type: 'array',
        items: PLAN_SCHEMA,
        description:
          'Every plan on the page, in page order, including free plans and plans without a price.',
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description:
          'high: the page states price, included amount and overage for the paid plans. medium: some of these are missing or the product is bundled into another plan. low: the page shows no prices, or they are ambiguous (no billing period, several volumes at one price).',
      },
    },
  },
};

export const SYSTEM_PROMPT = `You extract pricing plans from the text of a software vendor's pricing page into the record_pricing tool.
Rules:
- Use only the page text given. Every number you record must appear on the page. Do not use what you know about the vendor from elsewhere, do not estimate, do not infer a monthly price from a yearly one or the other way round.
- A value the page does not state is null. A plan the page prices as "contact us", "custom" or "inquire" has monthly: null.
- Record prices as plain numbers in the page's currency; "$0.006 per screenshot" is overage {per: 1, price: 0.006}; "$6 per 1,000" is {per: 1000, price: 6}.
- When the page shows both a yearly and a monthly price, monthly is the month-to-month price and annualMonthly the per-month price when billed yearly.
- Keep notes short and factual, quoting the page where a number needs context.
- Ignore other products on the page; record only the plans of the tool named in the request.
- Call the tool exactly once with every plan you find.`;

export const buildRequest = ({ tool, name, pricingPage, text }) => ({
  model: MODEL,
  max_tokens: 16000,
  system: SYSTEM_PROMPT,
  tools: [EXTRACT_TOOL],
  messages: [
    {
      role: 'user',
      content: `Tool: ${name ?? tool}\nPricing page: ${pricingPage}\n\n<page>\n${text.slice(0, MAX_TEXT_LENGTH)}\n</page>\n\nCall record_pricing with every plan of this tool on the page.`,
    },
  ],
});

/** Asks Claude for the plans in `text`; returns the tool input. */
export async function extractPricing(client, input) {
  const response = await client.messages.create(buildRequest(input));
  if (response.stop_reason === 'refusal') {
    throw new Error(
      `Claude declined: ${response.stop_details?.explanation ?? 'no explanation'}`,
    );
  }
  const call = response.content.find(
    (block) => block.type === 'tool_use' && block.name === EXTRACT_TOOL.name,
  );
  if (!call) {
    const said = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(' ');
    throw new Error(
      `Claude did not call ${EXTRACT_TOOL.name} (stop_reason ${response.stop_reason})${said ? `: ${said}` : ''}`,
    );
  }
  return call.input;
}

const cleanPlan = (plan) => {
  const out = { name: plan.name, monthly: plan.monthly ?? null };
  if (plan.annualMonthly != null) out.annualMonthly = plan.annualMonthly;
  const included = plan.included ?? {};
  if (included.snapshots != null || included.seats != null) {
    out.included = {
      snapshots: included.snapshots ?? null,
      seats: included.seats ?? null,
    };
  }
  if (plan.overage)
    out.overage = { per: plan.overage.per, price: plan.overage.price };
  if (plan.notes?.length) out.notes = plan.notes;
  return out;
};

/** The new file content: extracted fields over the current ones, hand-written parts kept. */
export const mergePricing = (current, extracted, { pageHash, fetchedAt }) => ({
  tool: current.tool,
  pricingPage: current.pricingPage,
  ...(current.pageSection ? { pageSection: current.pageSection } : {}),
  currency: extracted.currency ?? current.currency,
  fetchedAt,
  pageHash,
  unit: extracted.unit,
  plans: extracted.plans.map(cleanPlan),
  confidence: extracted.confidence,
  ...(current.notes?.length ? { notes: current.notes } : {}),
});

/** YAML text for a pricing record; the date is quoted so no parser reads it as a timestamp. */
export const toYaml = (record) => {
  const doc = new YAML.Document(record);
  doc.get('fetchedAt', true).type = Scalar.QUOTE_SINGLE;
  return doc.toString({ lineWidth: 0 });
};

export const today = () => new Date().toISOString().slice(0, 10);

export const parseArgs = (argv) => {
  const options = {
    check: false,
    force: false,
    accept: false,
    dryRun: false,
    only: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--accept') options.accept = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--only') options.only.push(argv[++i]);
    else if (arg.startsWith('--only=')) options.only.push(arg.slice(7));
    else throw new Error(`unknown argument ${arg}`);
  }
  if (options.only.some((tool) => !tool))
    throw new Error('--only needs a tool name');
  return options;
};

/**
 * Runs the refresh. `deps` lets tests swap the network, the model and the folder.
 * Returns the exit code.
 */
export async function run(argv, deps = {}) {
  const {
    dir = PRICING_DIR,
    fetchImpl = fetch,
    log = console.log,
    error = console.error,
    env = process.env,
    date = today(),
    createClient,
  } = deps;
  const options = parseArgs(argv);
  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.yml'))
    .sort();
  const selected = files.filter(
    (file) =>
      !options.only.length || options.only.includes(basename(file, '.yml')),
  );
  for (const tool of options.only) {
    if (!files.includes(`${tool}.yml`)) {
      error(`no pricing file for "${tool}" in ${dir}`);
      return 1;
    }
  }

  // Fetch and hash every page first, so --check never touches the API.
  const states = [];
  for (const file of selected) {
    const current = YAML.parse(await readFile(join(dir, file), 'utf8'));
    const state = { file, current, name: basename(file, '.yml') };
    try {
      state.text = await fetchPageText(current.pricingPage, {
        fetchImpl,
        section: current.pageSection,
      });
      state.hash = hashText(state.text);
      state.changed = state.hash !== current.pageHash;
    } catch (cause) {
      state.failure = cause instanceof Error ? cause.message : String(cause);
    }
    states.push(state);
  }

  const changed = states.filter((state) => state.changed);
  const failed = states.filter((state) => state.failure);
  if (options.check) {
    for (const state of states) {
      log(
        `${state.name}: ${state.failure ? `could not read ${state.current.pricingPage} (${state.failure})` : state.changed ? `changed since ${state.current.fetchedAt}` : 'unchanged'}`,
      );
    }
    log(
      `${changed.length} changed, ${states.length - changed.length - failed.length} unchanged, ${failed.length} unreadable`,
    );
    return changed.length ? 1 : 0;
  }

  const todo = states.filter(
    (state) => !state.failure && (options.force || state.changed),
  );
  let client;
  if (todo.length && !options.accept && !options.dryRun) {
    if (!env.ANTHROPIC_API_KEY) {
      error(
        `${todo.length} page(s) changed (${todo.map((state) => state.name).join(', ')}) but ANTHROPIC_API_KEY is not set, so the plans cannot be extracted.\nSet it to extract, use --check to only compare, or --accept to record the new page hash after checking the numbers by hand.`,
      );
      return 1;
    }
    client = createClient
      ? createClient()
      : new (await import('@anthropic-ai/sdk')).default();
  }

  // Unreadable pages are warnings (bot checks come and go); failed extractions fail the run.
  let extractionFailures = 0;
  for (const state of states) {
    if (state.failure) {
      error(
        `${state.name}: could not read ${state.current.pricingPage} (${state.failure}); file kept`,
      );
      continue;
    }
    if (!todo.includes(state)) {
      log(`${state.name}: unchanged since ${state.current.fetchedAt}`);
      continue;
    }
    const input = {
      tool: state.name,
      pricingPage: state.current.pricingPage,
      text: state.text,
    };
    if (options.dryRun) {
      const request = buildRequest(input);
      log(
        `${state.name}: would send ${state.text.length} characters of page text to ${request.model} with tool ${request.tools[0].name}`,
      );
      log(
        JSON.stringify(
          {
            ...request,
            messages: request.messages.map((m) => ({
              ...m,
              content: `${m.content.slice(0, 600)}…`,
            })),
          },
          null,
          2,
        ),
      );
      continue;
    }
    let record;
    if (options.accept) {
      record = { ...state.current, fetchedAt: date, pageHash: state.hash };
      await writeFile(join(dir, state.file), toYaml(record));
      log(
        `${state.name}: accepted the current page (hash ${state.hash.slice(0, 12)}), fetchedAt ${date}`,
      );
      continue;
    }
    try {
      const extracted = await extractPricing(client, input);
      record = mergePricing(state.current, extracted, {
        pageHash: state.hash,
        fetchedAt: date,
      });
      await writeFile(join(dir, state.file), toYaml(record));
      log(
        `${state.name}: page changed, extracted ${record.plans.length} plan(s) (${record.unit}, confidence ${record.confidence}), file written`,
      );
    } catch (cause) {
      extractionFailures++;
      error(
        `${state.name}: extraction failed (${cause instanceof Error ? cause.message : cause}); file kept`,
      );
    }
  }
  return extractionFailures ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (cause) => {
      console.error(cause instanceof Error ? cause.message : cause);
      process.exit(1);
    },
  );
}
