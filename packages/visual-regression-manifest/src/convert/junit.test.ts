import { describe, expect, it } from 'vitest';
import { entry, manifest } from '../../__tests__/helpers';
import { toJUnit } from './junit';

const missing = entry({
  name: 'new',
  status: 'missing-baseline',
  message: '',
  test: { filePath: 'cypress/e2e/home.cy.ts', titlePath: ['home'], retry: 0 },
  images: {
    baseline: { path: 'shots/new.png' },
    actual: { path: 'shots/new.actual.png' },
    diff: { path: null },
  },
});
const passed = entry({
  name: 'about',
  status: 'passed',
  duration: 1250,
  variant: 'dark',
  test: { filePath: 'cypress/e2e/about.cy.ts', titlePath: [], retry: 0 },
  comparison: { diffRatio: 0 },
  images: {
    baseline: { path: 'shots/about.png' },
    actual: { path: null },
    diff: { path: null },
  },
});

describe('toJUnit', () => {
  it('writes a test suite per test file and a test case per entry', () => {
    expect(toJUnit(manifest([entry({ duration: 250 }), missing, passed])))
      .toBe(`<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="@pixsame/cypress-plugin-visual-regression-diff" tests="3" failures="2" errors="0" skipped="0" time="1.500" timestamp="2026-09-22T10:00:00">
  <testsuite name="cypress/e2e/home.cy.ts" tests="2" failures="2" errors="0" skipped="0" time="0.250" timestamp="2026-09-22T10:00:00" file="cypress/e2e/home.cy.ts">
    <testcase name="home &gt; renders &gt; home_#0" classname="cypress/e2e/home.cy.ts" file="cypress/e2e/home.cy.ts" time="0.250">
      <properties>
        <property name="visualRegression.status" value="failed"/>
        <property name="visualRegression.diffRatio" value="0.12"/>
        <property name="visualRegression.maxDiffRatio" value="0.01"/>
      </properties>
      <failure message="Image diff factor (12%) is bigger than maximum threshold option 1%." type="failed">Image diff factor (12%) is bigger than maximum threshold option 1%.</failure>
      <system-out>[[ATTACHMENT|cypress/e2e/__image_snapshots__/home_#0.diff.png]]
[[ATTACHMENT|cypress/e2e/__image_snapshots__/home_#0.actual.png]]
[[ATTACHMENT|cypress/e2e/__image_snapshots__/home_#0.png]]</system-out>
    </testcase>
    <testcase name="home &gt; new" classname="cypress/e2e/home.cy.ts" file="cypress/e2e/home.cy.ts" time="0.000">
      <properties>
        <property name="visualRegression.status" value="missing-baseline"/>
        <property name="visualRegression.diffRatio" value="0.12"/>
        <property name="visualRegression.maxDiffRatio" value="0.01"/>
      </properties>
      <failure message="Screenshot &quot;new&quot; has no baseline to compare against." type="missing-baseline">Screenshot &quot;new&quot; has no baseline to compare against.</failure>
      <system-out>[[ATTACHMENT|shots/new.actual.png]]
[[ATTACHMENT|shots/new.png]]</system-out>
    </testcase>
  </testsuite>
  <testsuite name="cypress/e2e/about.cy.ts" tests="1" failures="0" errors="0" skipped="0" time="1.250" timestamp="2026-09-22T10:00:00" file="cypress/e2e/about.cy.ts">
    <testcase name="about [dark]" classname="cypress/e2e/about.cy.ts" file="cypress/e2e/about.cy.ts" time="1.250">
      <properties>
        <property name="visualRegression.status" value="passed"/>
        <property name="visualRegression.diffRatio" value="0"/>
        <property name="visualRegression.variant" value="dark"/>
      </properties>
      <system-out>[[ATTACHMENT|shots/about.png]]</system-out>
    </testcase>
  </testsuite>
</testsuites>
`);
  });

  it.each(['created', 'updated', 'approved'] as const)(
    'passes a %s entry',
    (status) => {
      const xml = toJUnit(manifest([entry({ status })]));
      expect(xml).toContain('failures="0"');
      expect(xml).not.toContain('<failure');
      expect(xml).toContain(
        `<property name="visualRegression.status" value="${status}"/>`,
      );
    },
  );

  it('says what differs when the entry has no message', () => {
    const xml = toJUnit(
      manifest([
        entry({ message: '' }),
        entry({
          name: 'no limit',
          message: '',
          comparison: { diffRatio: 0.5 },
        }),
      ]),
    );
    expect(xml).toContain(
      'message="Screenshot &quot;home_#0&quot; differs from its baseline: 12% of the pixels (limit 1%)."',
    );
    expect(xml).toContain(
      'message="Screenshot &quot;no limit&quot; differs from its baseline: 50% of the pixels."',
    );
  });

  it('escapes what XML cannot hold as written', () => {
    const xml = toJUnit(
      manifest([
        entry({
          name: `<a & "b">`,
          message: `it's 1 < 2\nsecond line\u0007`,
          test: { filePath: '', titlePath: [], retry: 0 },
        }),
      ]),
    );
    expect(xml).toContain('name="&lt;a &amp; &quot;b&quot;&gt;"');
    expect(xml).toContain(
      'message="it&apos;s 1 &lt; 2&#10;second line" type="failed">it&apos;s 1 &lt; 2\nsecond line</failure>',
    );
    // without a test file the runner names the suite
    expect(xml).toContain('<testsuite name="cypress" tests="1"');
    expect(xml).toContain('classname="cypress" time="0.000"');
  });

  it('writes the attachment paths a reader of the report expects', () => {
    const inSubfolder = manifest([entry()], {
      projectRoot: '/home/runner/work/r/r/apps/web/',
    });
    expect(toJUnit(inSubfolder)).toContain(
      '[[ATTACHMENT|apps/web/cypress/e2e/__image_snapshots__/home_#0.diff.png]]',
    );
    expect(toJUnit(inSubfolder, { attachmentPaths: 'absolute' })).toContain(
      '[[ATTACHMENT|/home/runner/work/r/r/apps/web/cypress/e2e/__image_snapshots__/home_#0.diff.png]]',
    );
    expect(toJUnit(inSubfolder, { attachmentPaths: false })).not.toContain(
      'system-out',
    );
    // a project outside the checked-out repository has no repository path
    expect(
      toJUnit(manifest([entry()], { projectRoot: '/elsewhere' })),
    ).toContain(
      '[[ATTACHMENT|cypress/e2e/__image_snapshots__/home_#0.diff.png]]',
    );
  });

  it('never names a file outside the project, or a second file, in an attachment line', () => {
    const xml = toJUnit(
      manifest([
        entry({
          images: {
            baseline: { path: '/etc/passwd' },
            actual: { path: '../../../etc/hosts' },
            diff: {
              path: 'a.png]]\n[[ATTACHMENT|/var/lib/jenkins/secrets/master.key',
            },
          },
        }),
        entry({
          name: 'kept',
          images: {
            baseline: { path: 'shots/[id].png' },
            actual: { path: 'shots\\win.png' },
            diff: { path: null },
          },
        }),
      ]),
      { attachmentPaths: 'absolute' },
    );
    expect(xml.match(/\[\[ATTACHMENT\|[^\n<]*/g)).toEqual([
      '[[ATTACHMENT|/home/runner/work/r/r/shots/[id].png]]',
    ]);
    expect(
      toJUnit(
        manifest([
          entry({
            images: {
              baseline: { path: '../x.png' },
              actual: { path: null },
              diff: { path: null },
            },
          }),
        ]),
      ),
    ).not.toContain('ATTACHMENT');
  });

  it('refuses an attachment path style it does not know', () => {
    expect(() =>
      toJUnit(manifest([]), { attachmentPaths: 'jenkins' as 'absolute' }),
    ).toThrow(
      /attachmentPaths is "jenkins"; expected "repository", "absolute" or false/,
    );
  });

  it('writes the time in UTC, a tiny ratio as such, and a tab so that it survives', () => {
    const xml = toJUnit(
      manifest(
        [
          entry({
            name: 'a\tb',
            message: '',
            comparison: { diffRatio: 0.00001, maxDiffRatio: 0 },
          }),
        ],
        { createdAt: '2026-09-22T10:00:00.000+02:00' },
      ),
    );
    expect(xml).toContain('timestamp="2026-09-22T08:00:00"');
    expect(xml).toContain('name="home &gt; renders &gt; a&#9;b"');
    expect(xml).toContain('under 0.01% of the pixels (limit 0%)');
    expect(toJUnit(manifest([], { createdAt: 'yesterday' }))).not.toContain(
      'timestamp',
    );
  });

  it('names the report and survives an empty run', () => {
    expect(toJUnit(manifest([]), { name: 'visual' })).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="visual" tests="0" failures="0" errors="0" skipped="0" time="0.000" timestamp="2026-09-22T10:00:00">
</testsuites>
`,
    );
  });
});
