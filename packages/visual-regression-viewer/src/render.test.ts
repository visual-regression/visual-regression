import { describe, expect, it } from 'vitest';
import { CSS_MARKER, DATA_MARKER, injectReload, renderPage } from './render';

const template = `<html><head><title>x</title></head><body>${DATA_MARKER}</body></html>`;

const dataOf = (html: string) => {
  const json = html.match(
    /<script type="application\/json" id="vrv-data">([\s\S]*?)<\/script>/,
  )?.[1];
  return JSON.parse(json ?? 'null');
};

describe('renderPage', () => {
  it('embeds the data as JSON', () => {
    const html = renderPage({ template, data: { a: [1, 'two'] }, title: 'T' });
    expect(dataOf(html)).toEqual({ a: [1, 'two'] });
    expect(html).not.toContain(DATA_MARKER);
  });

  it('keeps data from ending the script element or the string', () => {
    const data = { name: '</script><!-- $&     -->' };
    const html = renderPage({ template, data, title: 'T' });
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(dataOf(html)).toEqual(data);
  });

  it('escapes the title', () => {
    const html = renderPage({ template, data: {}, title: '<b>"A" & B' });
    expect(html).toContain('<title>&lt;b&gt;&quot;A&quot; &amp; B</title>');
  });

  it('adds the stylesheet before </head> without a marker', () => {
    const html = renderPage({
      template,
      data: {},
      title: 'T',
      css: ':root{--vrv-bg:red}</style><b>',
    });
    expect(html).toContain(
      '<style id="vrv-css">:root{--vrv-bg:red}<\\/style><b></style></head>',
    );
  });

  it('puts the stylesheet at the marker when there is one', () => {
    const html = renderPage({
      template: `<head>${CSS_MARKER}</head>${DATA_MARKER}`,
      data: {},
      title: 'T',
      css: 'a{}',
    });
    expect(
      html.startsWith('<head><style id="vrv-css">a{}</style></head>'),
    ).toBe(true);
  });

  it('drops the marker without a stylesheet and appends one to a bare page', () => {
    expect(
      renderPage({
        template: `${CSS_MARKER}${DATA_MARKER}`,
        data: {},
        title: 'T',
      }),
    ).not.toContain(CSS_MARKER);
    expect(
      renderPage({ template: DATA_MARKER, data: {}, title: 'T', css: 'a{}' }),
    ).toMatch(/<style id="vrv-css">a\{\}<\/style>$/);
  });

  it('refuses a template without the data marker', () => {
    expect(() =>
      renderPage({ template: '<html></html>', data: {}, title: 'T' }),
    ).toThrow(DATA_MARKER);
  });
});

describe('injectReload', () => {
  it('adds the client before </body>, or at the end', () => {
    expect(injectReload('<body>x</body>')).toMatch(
      /^<body>x<script>.*EventSource.*<\/script><\/body>$/,
    );
    expect(injectReload('x')).toMatch(/^x<script>/);
  });
});
