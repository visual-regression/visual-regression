// Lost Pixel in page-shots mode against the harness's static server (E2E_BASE_URL),
// loaded from the working directory. One page per box, with the two other boxes
// masked, so that E2E_VARIANT=b (box-b recolored) changes exactly one shot.
const base = process.env.E2E_BASE_URL;
const variant = process.env.E2E_VARIANT ?? 'a';
const boxes = ['a', 'b', 'c'];

module.exports = {
  pageShots: {
    baseUrl: base,
    pages: boxes.map((box) => ({
      path: `/pages/box.html?variant=${variant}`,
      name: `box-${box}`,
      mask: boxes
        .filter((other) => other !== box)
        .map((other) => ({ selector: `#box-${other}` })),
    })),
  },
  configureBrowser: () => ({
    viewport: { width: 320, height: 200 },
    deviceScaleFactor: 1,
  }),
  generateOnly: true,
  failOnDifference: true,
  threshold: 0,
  waitBeforeScreenshot: 100,
};
