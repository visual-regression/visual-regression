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
  /** The model only, never numbers: they rot. */
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
  },
});
