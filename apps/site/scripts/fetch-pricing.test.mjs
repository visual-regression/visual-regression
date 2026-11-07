// node --test scripts/fetch-pricing.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import YAML from 'yaml';
import {
  EXTRACT_TOOL,
  buildRequest,
  extractPricing,
  hashText,
  htmlToText,
  mergePricing,
  parseArgs,
  run,
  sliceSection,
  toYaml,
} from './fetch-pricing.mjs';

const PAGE = `<html><head><title>Pricing</title><style>.x{}</style><script>var a = "$999";</script></head>
<body><!-- $1 --><h1>Plans</h1><div>Free <span>$0</span>&nbsp;5,000 screenshots</div>
<div>Pro   $100 / month, 35,000 screenshots, $0.004 each extra</div><svg><text>$5</text></svg>
${'filler text to pass the minimum length '.repeat(20)}</body></html>`;

const current = {
  tool: 'demo',
  pricingPage: 'https://example.test/pricing',
  currency: 'USD',
  fetchedAt: '2026-01-01',
  pageHash: null,
  unit: 'screenshot',
  plans: [{ name: 'Free', monthly: 0 }],
  confidence: 'low',
  notes: ['hand-written note'],
};

const extracted = {
  currency: 'USD',
  unit: 'screenshot',
  confidence: 'high',
  plans: [
    {
      name: 'Free',
      monthly: 0,
      annualMonthly: null,
      included: { snapshots: 5000, seats: null },
      overage: null,
      notes: [],
    },
    {
      name: 'Pro',
      monthly: 100,
      annualMonthly: null,
      included: { snapshots: 35000, seats: null },
      overage: { per: 1, price: 0.004 },
      notes: ['14-day trial'],
    },
  ],
};

const mockFetch =
  (html = PAGE, status = 200) =>
  async () => ({
    ok: status < 400,
    status,
    text: async () => html,
  });

const mockClient = (input = extracted) => {
  const requests = [];
  return {
    requests,
    messages: {
      create: async (request) => {
        requests.push(request);
        return {
          stop_reason: 'tool_use',
          content: [
            { type: 'text', text: 'Recording.' },
            { type: 'tool_use', id: 'toolu_1', name: EXTRACT_TOOL.name, input },
          ],
        };
      },
    },
  };
};

const tempDir = async (record = current) => {
  const dir = await mkdtemp(join(tmpdir(), 'pricing-'));
  await writeFile(join(dir, 'demo.yml'), toYaml(record));
  return dir;
};

const capture = () => {
  const lines = [];
  return {
    lines,
    log: (line) => lines.push(line),
    error: (line) => lines.push(line),
  };
};

test('htmlToText keeps the visible words only', () => {
  const text = htmlToText(PAGE);
  assert.match(
    text,
    /^Pricing Plans Free \$0 5,000 screenshots Pro \$100 \/ month/,
  );
  assert.doesNotMatch(text, /\$999|\$1\b|\$5|\.x\{\}/);
  assert.doesNotMatch(text, /\s{2}/);
  assert.equal(
    hashText(text),
    hashText(htmlToText(PAGE.replace(/\n/g, '\n\n  '))),
  );
});

test('sliceSection keeps the text between the markers and fails on a missing one', () => {
  const text =
    'Other product $5 Percy plans $0 and $100 Trusted by many Percy again';
  assert.equal(
    sliceSection(text, { start: 'Percy plans', end: 'Trusted by' }),
    'Percy plans $0 and $100 ',
  );
  assert.equal(sliceSection(text, undefined), text);
  assert.throws(
    () => sliceSection(text, { start: 'Nope', end: 'Trusted by' }),
    /"Nope" not found/,
  );
  assert.throws(
    () => sliceSection(text, { start: 'Percy plans', end: 'Other product' }),
    /"Other product" not found/,
  );
});

test('the extraction tool mirrors the YAML shape and is strict', () => {
  assert.equal(EXTRACT_TOOL.strict, true);
  const schema = EXTRACT_TOOL.input_schema;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties), [
    'currency',
    'unit',
    'plans',
    'confidence',
  ]);
  const plan = schema.properties.plans.items;
  assert.deepEqual(plan.required, [
    'name',
    'monthly',
    'annualMonthly',
    'included',
    'overage',
    'notes',
  ]);
  assert.deepEqual(plan.properties.included.required, ['snapshots', 'seats']);
});

test('extractPricing sends the page text and returns the tool input', async () => {
  const client = mockClient();
  const input = await extractPricing(client, {
    tool: 'demo',
    pricingPage: current.pricingPage,
    text: 'Plans $0',
  });
  assert.deepEqual(input, extracted);
  const [request] = client.requests;
  assert.equal(
    request.model,
    buildRequest({ tool: 'demo', pricingPage: '', text: '' }).model,
  );
  assert.deepEqual(request.tools, [EXTRACT_TOOL]);
  assert.match(
    request.system,
    /Every number you record must appear on the page/,
  );
  assert.match(request.messages[0].content, /<page>\nPlans \$0\n<\/page>/);
});

test('extractPricing fails loudly when Claude does not call the tool', async () => {
  const client = {
    messages: {
      create: async () => ({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'No plans here.' }],
      }),
    },
  };
  await assert.rejects(
    extractPricing(client, { tool: 'demo', pricingPage: '', text: '' }),
    /did not call record_pricing.*No plans here/,
  );
});

test('mergePricing keeps the hand-written parts and drops empty fields', () => {
  const merged = mergePricing(current, extracted, {
    pageHash: 'a'.repeat(64),
    fetchedAt: '2026-11-05',
  });
  assert.deepEqual(merged, {
    tool: 'demo',
    pricingPage: current.pricingPage,
    currency: 'USD',
    fetchedAt: '2026-11-05',
    pageHash: 'a'.repeat(64),
    unit: 'screenshot',
    plans: [
      { name: 'Free', monthly: 0, included: { snapshots: 5000, seats: null } },
      {
        name: 'Pro',
        monthly: 100,
        included: { snapshots: 35000, seats: null },
        overage: { per: 1, price: 0.004 },
        notes: ['14-day trial'],
      },
    ],
    confidence: 'high',
    notes: ['hand-written note'],
  });
  assert.match(toYaml(merged), /^fetchedAt: '2026-11-05'$/m);
  assert.equal(YAML.parse(toYaml(merged)).fetchedAt, '2026-11-05');
});

test('parseArgs', () => {
  assert.deepEqual(parseArgs(['--check', '--only', 'percy', '--only=argos']), {
    check: true,
    force: false,
    accept: false,
    dryRun: false,
    only: ['percy', 'argos'],
  });
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

test('--check reports a changed page and exits 1, without an API key', async () => {
  const dir = await tempDir();
  const out = capture();
  const code = await run(['--check'], {
    dir,
    fetchImpl: mockFetch(),
    env: {},
    ...out,
  });
  assert.equal(code, 1);
  assert.match(out.lines[0], /^demo: changed since 2026-01-01$/);
  assert.match(out.lines[1], /^1 changed, 0 unchanged, 0 unreadable$/);
});

test('--check passes when the hash matches and reports unreadable pages', async () => {
  const hash = hashText(htmlToText(PAGE));
  const dir = await tempDir({ ...current, pageHash: hash });
  const out = capture();
  assert.equal(
    await run(['--check'], { dir, fetchImpl: mockFetch(), env: {}, ...out }),
    0,
  );
  assert.match(out.lines[0], /^demo: unchanged$/);

  const blocked = capture();
  assert.equal(
    await run(['--check'], {
      dir,
      fetchImpl: mockFetch('<p>One moment, please...</p>'),
      env: {},
      ...blocked,
    }),
    0,
  );
  assert.match(blocked.lines[0], /could not read .*bot check/);
});

test('without an API key a changed page is a clear error, not a crash', async () => {
  const dir = await tempDir();
  const out = capture();
  assert.equal(
    await run([], { dir, fetchImpl: mockFetch(), env: {}, ...out }),
    1,
  );
  assert.match(out.lines[0], /ANTHROPIC_API_KEY is not set/);
  assert.equal(
    YAML.parse(await readFile(join(dir, 'demo.yml'), 'utf8')).pageHash,
    null,
  );
});

test('a changed page is extracted and written; an unchanged one is left alone', async () => {
  const dir = await tempDir();
  const client = mockClient();
  const out = capture();
  const code = await run([], {
    dir,
    fetchImpl: mockFetch(),
    env: { ANTHROPIC_API_KEY: 'k' },
    createClient: () => client,
    date: '2026-11-05',
    ...out,
  });
  assert.equal(code, 0);
  assert.equal(client.requests.length, 1);
  assert.match(
    out.lines[0],
    /^demo: page changed, extracted 2 plan\(s\) \(screenshot, confidence high\), file written$/,
  );
  const written = YAML.parse(await readFile(join(dir, 'demo.yml'), 'utf8'));
  assert.equal(written.pageHash, hashText(htmlToText(PAGE)));
  assert.equal(written.fetchedAt, '2026-11-05');
  assert.deepEqual(written.notes, ['hand-written note']);
  assert.equal(written.plans[1].overage.price, 0.004);

  const again = capture();
  assert.equal(
    await run([], { dir, fetchImpl: mockFetch(), env: {}, ...again }),
    0,
  );
  assert.match(again.lines[0], /^demo: unchanged since 2026-11-05$/);
  assert.equal(client.requests.length, 1);
});

test('--only rejects unknown tools, --accept records the hash, --dry-run sends nothing', async () => {
  const dir = await tempDir();
  const out = capture();
  assert.equal(
    await run(['--only', 'nope'], {
      dir,
      fetchImpl: mockFetch(),
      env: {},
      ...out,
    }),
    1,
  );
  assert.match(out.lines[0], /no pricing file for "nope"/);

  const dry = capture();
  assert.equal(
    await run(['--dry-run'], { dir, fetchImpl: mockFetch(), env: {}, ...dry }),
    0,
  );
  assert.match(
    dry.lines[0],
    /^demo: would send \d+ characters of page text to claude-/,
  );
  assert.equal(
    YAML.parse(await readFile(join(dir, 'demo.yml'), 'utf8')).pageHash,
    null,
  );

  const accept = capture();
  assert.equal(
    await run(['--accept', '--only=demo'], {
      dir,
      fetchImpl: mockFetch(),
      env: {},
      date: '2026-11-05',
      ...accept,
    }),
    0,
  );
  const written = YAML.parse(await readFile(join(dir, 'demo.yml'), 'utf8'));
  assert.equal(written.pageHash, hashText(htmlToText(PAGE)));
  assert.deepEqual(written.plans, current.plans);
  assert.equal(written.fetchedAt, '2026-11-05');
});

test('pageSection narrows the hashed text and survives a rewrite', async () => {
  const section = { start: 'Pro', end: 'filler' };
  const dir = await tempDir({ ...current, pageSection: section });
  const client = mockClient();
  const out = capture();
  await run([], {
    dir,
    fetchImpl: mockFetch(),
    env: { ANTHROPIC_API_KEY: 'k' },
    createClient: () => client,
    ...out,
  });
  assert.match(
    client.requests[0].messages[0].content,
    /<page>\nPro \$100 \/ month, 35,000 screenshots, \$0.004 each extra \n<\/page>/,
  );
  const written = YAML.parse(await readFile(join(dir, 'demo.yml'), 'utf8'));
  assert.deepEqual(written.pageSection, section);
  assert.equal(
    written.pageHash,
    hashText(sliceSection(htmlToText(PAGE), section)),
  );

  const missing = capture();
  assert.equal(
    await run(['--check'], {
      dir,
      fetchImpl: mockFetch(PAGE.replace('Pro', 'Max')),
      env: {},
      ...missing,
    }),
    0,
  );
  assert.match(missing.lines[0], /could not read .*marker "Pro" not found/);
});

test('every non-free tool has a pricing file', async () => {
  const dir = (name) => new URL(`../data/${name}/`, import.meta.url);
  const stems = async (name) =>
    (await readdir(dir(name)))
      .filter((f) => f.endsWith('.yml'))
      .map((f) => f.slice(0, -'.yml'.length));
  const priced = new Set(await stems('pricing'));
  // pixsame's hosted renderer is in preparation; the calculator says so.
  const exempt = new Set(['pixsame']);
  const missing = [];
  for (const stem of await stems('tools')) {
    const tool = YAML.parse(
      await readFile(new URL(`${stem}.yml`, dir('tools')), 'utf8'),
    );
    if (
      tool.pricingModel !== 'free' &&
      !exempt.has(stem) &&
      !priced.has(stem)
    ) {
      missing.push(stem);
    }
  }
  assert.deepEqual(missing, []);
});
