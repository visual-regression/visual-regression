import { defineCollection, defineContentConfig, z } from '@nuxt/content';
import { useNuxt } from '@nuxt/kit';
import { join } from 'node:path';

const { options } = useNuxt();

/**
 * The comparison data: one YAML file per tool under `data/tools/`. Docus owns
 * the page collections (everything under `content/`); this one is merged in.
 */
export const toolSchema = z.object({
  name: z.string(),
  website: z.string().url(),
  /** One sentence, factual, no adjectives. */
  summary: z.string(),
  category: z.enum(['runner-integration', 'hosted-review', 'mobile-native']),
  /** Further categories the tool is listed under when filtering, besides its own. */
  alsoCategories: z
    .array(z.enum(['runner-integration', 'hosted-review', 'mobile-native']))
    .optional(),
  aliases: z.array(z.string()).optional(),
  /** Set when the project is no longer maintained; shown as a visible notice. */
  discontinued: z
    .object({ message: z.string(), url: z.string().url() })
    .optional(),
  openSource: z.boolean(),
  license: z.string().optional(),
  selfHostable: z.boolean(),
  /** Where the comparison runs. */
  hosting: z.enum(['local', 'self-hosted', 'cloud', 'local-or-cloud']),
  /** Test runners or frameworks it plugs into; `any` for tools that take plain images. */
  runners: z.array(z.string()),
  diffEngine: z.string(),
  /** Where a human reviews the diffs. */
  reviewSurface: z.array(z.enum(['local', 'pr', 'web-app', 'ide'])),
  baselineStorage: z.enum(['repo', 'service', 'repo-or-service']),
  /**
   * The model only. The numbers live in `data/pricing/<tool>.yml` (see
   * `pricingSchema`), dated and refreshed by `scripts/fetch-pricing.mjs`.
   */
  pricingModel: z.enum([
    'free',
    'freemium',
    'per-screenshot',
    'per-seat',
    'custom',
  ]),
  /** What a tool running after the tests can read. */
  machineReadableResults: z.enum([
    'manifest',
    'json-report',
    'images-only',
    'none-cloud',
    'none',
  ]),
  /**
   * `native`: writes the manifest itself. `converter`: a converter in
   * `visual-regression-manifest` reads its output. `generic`: its image
   * files fit the generic image-triple converter. `none`: nothing to read.
   */
  manifestSupport: z.enum(['native', 'converter', 'generic', 'none']),
  notes: z.array(z.string()).optional(),
  /** ISO date of the last time someone checked the sources. */
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sources: z.array(z.string().url()).min(1),
});

/** One plan on a vendor's pricing page. Prices are per month in `currency`. */
export const pricingPlanSchema = z.object({
  name: z.string(),
  /**
   * Price per month when billed monthly. For `unit: seat` the price per seat
   * per month. `null` when the page shows no number (custom quote) or only a
   * yearly price (then `annualMonthly` is set).
   */
  monthly: z.number().nonnegative().nullable(),
  /** Price per month when billed yearly, when the page offers it. */
  annualMonthly: z.number().nonnegative().nullable().optional(),
  included: z
    .object({
      /** Screenshots or snapshots per month; `null` when not stated or not metered. */
      snapshots: z.number().int().nonnegative().nullable().optional(),
      /** Users the plan allows; `null` when unlimited or not stated. */
      seats: z.number().int().positive().nullable().optional(),
    })
    .optional(),
  /**
   * Price for screenshots beyond `included.snapshots`: `price` per `per`
   * screenshots (`per: 1` for a per-screenshot price, `1000` for a
   * per-thousand price). `null` when the page states none (usage pauses) or
   * says nothing.
   */
  overage: z
    .object({
      per: z.number().int().positive(),
      price: z.number().nonnegative(),
    })
    .nullable()
    .optional(),
  /** Facts from the page the fields above cannot hold (browsers, retention). */
  notes: z.array(z.string()).optional(),
});

/**
 * The numbers behind the cost calculator: one YAML file per tool under
 * `data/pricing/`, named like the tool's file in `data/tools/`, only for tools
 * whose `pricingModel` is not `free`. Every number is read from the vendor's
 * pricing page on `fetchedAt`; `scripts/fetch-pricing.mjs` notices when the
 * page changes (`pageHash`) and extracts the plans again. Keep `notes`
 * hand-written; the script preserves them.
 */
export const pricingSchema = z.object({
  /** File stem of the tool in `data/tools/`. */
  tool: z.string(),
  pricingPage: z.string().url(),
  /**
   * For a page that lists several products: only the text from the first
   * `start` to the following `end` is hashed and extracted.
   */
  pageSection: z.object({ start: z.string(), end: z.string() }).optional(),
  currency: z.string().length(3),
  /** ISO date the numbers were taken from the page. */
  fetchedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /**
   * sha256 of the page text the numbers came from, set by the script. `null`
   * when the page cannot be fetched by a script (bot protection) and the
   * numbers were read in a browser.
   */
  pageHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  /**
   * What the vendor meters. `snapshot`/`screenshot`: the plan includes a
   * monthly amount, extra ones cost `overage`. `seat`: `monthly` is per user.
   * `custom`: another unit (checkpoints, devices); the calculator shows the
   * entry price only.
   */
  unit: z.enum(['snapshot', 'screenshot', 'seat', 'custom']),
  plans: z.array(pricingPlanSchema).min(1),
  /** How directly the page states these numbers. */
  confidence: z.enum(['high', 'medium', 'low']),
  /** Hand-written context, preserved by the script. */
  notes: z.array(z.string()).optional(),
});

export default defineContentConfig({
  collections: {
    tools: defineCollection({
      type: 'data',
      source: {
        cwd: join(options.rootDir, 'data'),
        include: 'tools/*.yml',
      },
      schema: toolSchema,
    }),
    pricing: defineCollection({
      type: 'data',
      source: {
        cwd: join(options.rootDir, 'data'),
        include: 'pricing/*.yml',
      },
      schema: pricingSchema,
    }),
  },
});
