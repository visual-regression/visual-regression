import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Manifest } from 'visual-regression-manifest';
import {
  checkManifest,
  printChecks,
  reportDir,
  viewerReport,
  type Expectation,
} from './assert-manifest.js';
import { sh } from './shell.js';

export type Ctx = { sh: typeof sh };

/** What every `examples/converters/<tool>/scenario.mjs` exports. */
export type Scenario = {
  name: string;
  projectRoot: string;
  /** Compare modes, run in this order on the same recorded baselines. */
  modes: string[];
  expectations: Record<string, Expectation>;
  nameOf?: (base: string) => string;
  reportsDiffRatio?: boolean;
  /** Removes everything the tool wrote in a previous run (the harness removes what it wrote itself). */
  clean(ctx: Ctx): Promise<void>;
  /** Runs the tool in record mode: box-a, box-b and box-c get baselines. */
  record(ctx: Ctx): Promise<void>;
  /** Deletes the baseline of box-c; `compare` recolors box-b. */
  perturb(ctx: Ctx): Promise<void>;
  compare(mode: string, ctx: Ctx): Promise<void>;
  /** Calls the converter on what the tool wrote. */
  convert(mode: string): Manifest;
  /** Copies the tool's output into a unit-test fixture folder. */
  capture?(outDir: string, mode: string): Promise<void>;
};

/** Where `E2E_CAPTURE=1` stores real output for the manifest package's unit tests. */
export const fixturesDir = path.resolve(
  import.meta.dirname,
  '../../../../packages/visual-regression-manifest/__tests__/fixtures',
);

/**
 * Removes what the harness itself left in a previous run: the manifests
 * `viewerReport` writes into the example and the review pages under `test-results`.
 */
export const cleanHarnessOutput = ({ name, projectRoot, modes }: Scenario) => {
  for (const file of fs.readdirSync(projectRoot)) {
    if (/^visual-regression-manifest\..*\.json$/.test(file)) {
      fs.rmSync(path.join(projectRoot, file));
    }
  }
  for (const mode of modes) {
    fs.rmSync(reportDir(`${name}-${mode}`), { recursive: true, force: true });
  }
};

export const runScenario = (scenario: Scenario) => {
  const ctx: Ctx = { sh };
  const nameOf = scenario.nameOf ?? ((base) => base);
  describe(scenario.name, () => {
    beforeAll(async () => {
      cleanHarnessOutput(scenario);
      await scenario.clean(ctx);
      await scenario.record(ctx);
      await scenario.perturb(ctx);
    });
    for (const mode of scenario.modes) {
      it(`${mode}: converts the real output into a valid manifest`, async () => {
        const expectation = scenario.expectations[mode];
        expect(expectation, `expectations for mode ${mode}`).toBeDefined();
        await scenario.compare(mode, ctx);
        const manifest = scenario.convert(mode);
        const checks = checkManifest(manifest, expectation, {
          projectRoot: scenario.projectRoot,
          nameOf,
          reportsDiffRatio: scenario.reportsDiffRatio,
        });
        try {
          const out = viewerReport(
            manifest,
            scenario.projectRoot,
            `${scenario.name}-${mode}`,
          );
          checks.push({ name: `viewer: wrote a review page into ${out}` });
        } catch (error) {
          checks.push({
            name: 'viewer: wrote a review page',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        const failed = printChecks(checks);
        expect(failed, `${failed} check(s) failed, see the FAIL lines`).toBe(0);

        if (process.env.E2E_CAPTURE && scenario.capture) {
          const dir = path.join(fixturesDir, scenario.name, mode);
          fs.rmSync(dir, { recursive: true, force: true });
          fs.mkdirSync(dir, { recursive: true });
          await scenario.capture(dir, mode);
          const resolved = {
            statuses: Object.fromEntries(
              Object.entries(expectation.statuses).map(([base, status]) => [
                nameOf(base),
                status,
              ]),
            ),
            absent: (expectation.absent ?? []).map(nameOf),
            reportsDiffRatio: scenario.reportsDiffRatio ?? true,
          };
          fs.writeFileSync(
            path.join(dir, 'expectations.json'),
            `${JSON.stringify(resolved, null, 2)}\n`,
          );
          console.log(`captured ${mode} into ${dir}`);
        }
      });
    }
  });
};
