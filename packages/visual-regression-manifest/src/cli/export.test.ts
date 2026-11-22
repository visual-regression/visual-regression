import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { entry, manifest, tmpDir, writePng } from '../../__tests__/helpers';
import { ManifestParseError } from '../reader';
import { UsageError } from './convert';
import { FORMATS, exportManifest } from './export';

/** A project with a manifest file and the images of its one entry. */
const project = async () => {
  const root = await tmpDir();
  const run = manifest([entry()], { projectRoot: root, ci: null });
  for (const image of Object.values(run.entries[0].images)) {
    if (image.path) writePng(path.join(root, image.path));
  }
  fs.writeFileSync(
    path.join(root, 'visual-regression-manifest.json'),
    JSON.stringify(run),
  );
  return root;
};

describe('exportManifest', () => {
  it('writes Allure results into allure-results of the working directory', async () => {
    const root = await project();
    const { out, summary } = exportManifest(
      'allure',
      { manifest: 'visual-regression-manifest.json' },
      root,
    );
    expect(out).toBe(path.join(root, 'allure-results'));
    expect(summary).toBe('1 Allure results (2 files)');
    expect(fs.readdirSync(out)).toHaveLength(2);
  });

  it('writes a JUnit report to the file named, creating its folder', async () => {
    const root = await project();
    const { out, summary } = exportManifest(
      'junit',
      {
        manifest: path.join(root, 'visual-regression-manifest.json'),
        out: 'reports/visual.xml',
        options: { name: 'visual', attachmentPaths: false },
      },
      root,
    );
    expect(out).toBe(path.join(root, 'reports', 'visual.xml'));
    expect(summary).toBe('1 test cases, 1 failed');
    const xml = fs.readFileSync(out, 'utf8');
    expect(xml).toContain('<testsuites name="visual" tests="1" failures="1"');
    expect(xml).not.toContain('system-out');
    expect(
      exportManifest(
        'junit',
        { manifest: 'visual-regression-manifest.json' },
        root,
      ).out,
    ).toBe(path.join(root, 'visual-regression-junit.xml'));
  });

  it('reads the images from --project-root when the manifest came from elsewhere', async () => {
    const root = await project();
    const file = path.join(root, 'visual-regression-manifest.json');
    const moved = { ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    fs.writeFileSync(
      file,
      JSON.stringify({ ...moved, projectRoot: '/ci/app' }),
    );
    const warnings: string[] = [];
    const flags = { manifest: 'visual-regression-manifest.json', out: 'a' };

    const lost = exportManifest('allure', flags, root, (w) => warnings.push(w));
    expect(lost.summary).toBe('1 Allure results (1 files)');
    expect(warnings).toHaveLength(3);
    expect(
      exportManifest('allure', { ...flags, out: 'b', projectRoot: '.' }, root)
        .summary,
    ).toBe('1 Allure results (2 files)');
    expect(
      fs.readFileSync(
        exportManifest(
          'junit',
          { ...flags, options: { attachmentPaths: 'absolute' } },
          root,
        ).out,
        'utf8',
      ),
    ).toContain('[[ATTACHMENT|/ci/app/cypress/e2e/');
    // a folder for a report that is one file gets the conventional name
    expect(
      fs.existsSync(path.join(root, 'a/visual-regression-junit.xml')),
    ).toBe(true);
  });

  it('refuses what a format does not take', async () => {
    const root = await project();
    const manifest = 'visual-regression-manifest.json';
    const run = (
      format: string,
      flags: Partial<Parameters<typeof exportManifest>[1]>,
    ) => {
      const call = () => exportManifest(format, { manifest, ...flags }, root);
      expect(call).toThrow(UsageError);
      return expect(call);
    };
    run('junit', { projectRoot: '.' }).toThrow(
      /--project-root does not apply to junit/,
    );
    run('junit', { options: { onWarning: 1 } }).toThrow(
      /--options has "onWarning", which junit does not take; it takes name, attachmentPaths/,
    );
    run('allure', { options: { projectRoot: '/etc' } }).toThrow(
      /--options has "projectRoot", which allure does not take$/,
    );
    run('junit', { options: { attachmentPaths: 'jenkins' } }).toThrow(
      /Cannot write .*visual-regression-junit\.xml: attachmentPaths is "jenkins"/,
    );
    // a file where the results folder is due
    run('allure', { out: manifest }).toThrow(/Cannot write .*EEXIST/);
    expect(
      exportManifest('junit', { manifest, out: 'OUT.XML' }, root).out,
    ).toBe(path.join(root, 'OUT.XML'));
  });

  it('names the formats when asked for an unknown one', () => {
    expect(() => exportManifest('html', { manifest: 'm.json' }, '/')).toThrow(
      new RegExp(`Unknown format "html".*${Object.keys(FORMATS).join(', ')}`),
    );
  });

  it('explains a manifest that is missing or broken, and a project root that is not there', async () => {
    const root = await project();
    const run = (flags: { manifest: string; projectRoot?: string }) =>
      exportManifest('allure', flags, root);
    expect(() => run({ manifest: 'gone.json' })).toThrow(UsageError);
    expect(() => run({ manifest: 'gone.json' })).toThrow(/is not a file/);
    fs.writeFileSync(path.join(root, 'broken.json'), '{}');
    expect(() => run({ manifest: 'broken.json' })).toThrow(ManifestParseError);
    expect(() =>
      run({ manifest: 'visual-regression-manifest.json', projectRoot: 'nope' }),
    ).toThrow(/project root .*nope is not a directory/);
  });
});
