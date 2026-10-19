/** Replaced with the JSON data of the run, as a `<script type="application/json" id="vrv-data">`. */
export const DATA_MARKER = '<!--vrv:data-->';
/** Replaced with the extra stylesheet (`--css`); without the marker the stylesheet goes before `</head>`. */
export const CSS_MARKER = '<!--vrv:css-->';

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** JSON that is safe inside a `<script>`: no `</script>`, `<!--` or line terminators that end the element or the string. */
const scriptJson = (data: unknown) =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

export type RenderOptions = {
  template: string;
  data: unknown;
  title: string;
  css?: string;
};

/** Fills a page template with the data of a run, the title and the extra stylesheet. */
export const renderPage = ({ template, data, title, css }: RenderOptions) => {
  if (!template.includes(DATA_MARKER)) {
    throw new Error(
      `The template has no ${DATA_MARKER} marker to put the run data at`,
    );
  }
  // replacer functions: the inserted text may contain `$` patterns
  let html = template.replace(
    DATA_MARKER,
    () =>
      `<script type="application/json" id="vrv-data">${scriptJson(data)}</script>`,
  );
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    () => `<title>${escapeHtml(title)}</title>`,
  );
  const style = css
    ? `<style id="vrv-css">${css.replace(/<\/style/gi, '<\\/style')}</style>`
    : '';
  if (html.includes(CSS_MARKER)) {
    html = html.replace(CSS_MARKER, () => style);
  } else if (style) {
    html = /<\/head>/i.test(html)
      ? html.replace(/<\/head>/i, () => `${style}</head>`)
      : html + style;
  }
  return html;
};

/** Where open pages listen for changes of the output directory. */
export const EVENTS_PATH = '__vrv/events';

const RELOAD_SNIPPET = `<script>new EventSource(${JSON.stringify(EVENTS_PATH)}).addEventListener('reload',function(){location.reload()})</script>`;

/** Adds the live-reload client to a page. */
export const injectReload = (html: string) =>
  /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, () => `${RELOAD_SNIPPET}</body>`)
    : html + RELOAD_SNIPPET;
