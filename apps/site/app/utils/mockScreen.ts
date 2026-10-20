/**
 * Paints a small, fictional checkout screen on a canvas. The learn demos
 * compare two renders of it, so every knob below is one thing that can make
 * a screenshot differ from its baseline. Coordinates are for a 240×150
 * screen; `scale` shrinks or enlarges the whole thing.
 */
export interface MockScreenOptions {
  scale?: number;
  /** The heading drawn in the fallback font, as if the web font had not loaded. */
  fontFallback?: boolean;
  /** A sub-pixel shift of every text run: another machine's rasterizer. */
  textNudge?: number;
  /** Position of the progress bar animation, 0 to 1. */
  animation?: number;
  /** The clock in the corner. */
  clock?: string;
  /** A caret in the focused input. */
  caret?: boolean;
  /** A scrollbar on the right, which shifts the content left. */
  scrollbar?: boolean;
  /** The main button's color. */
  buttonColor?: string;
  /** The main button's width. */
  buttonWidth?: number;
  /** The price shown in the summary. */
  price?: string;
  /** Hide the clock behind a mask, the way a `mask` option would. */
  maskClock?: boolean;
}

export const MOCK_WIDTH = 240;
export const MOCK_HEIGHT = 150;

export function drawMockScreen(
  ctx: CanvasRenderingContext2D,
  {
    scale = 1,
    fontFallback = false,
    textNudge = 0,
    animation = 1,
    clock = '10:42:07',
    caret = false,
    scrollbar = false,
    buttonColor = '#10b981',
    buttonWidth = 64,
    price = '$42.00',
    maskClock = false,
  }: MockScreenOptions = {},
) {
  const sans = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const serif = 'Georgia, "Times New Roman", serif';
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = 'alphabetic';

  // page
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, MOCK_WIDTH, MOCK_HEIGHT);

  const shift = scrollbar ? -4 : 0;
  ctx.translate(shift, 0);

  // top bar
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, MOCK_WIDTH + 8, 22);
  ctx.fillStyle = '#10b981';
  ctx.fillRect(10, 6, 10, 10);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 8px ${sans}`;
  ctx.fillText('acme', 25 + textNudge, 14);
  ctx.fillStyle = '#a1a1aa';
  ctx.font = `7px ${sans}`;
  ctx.fillText('Shop', 60 + textNudge, 14);
  ctx.fillText('Docs', 84 + textNudge, 14);
  ctx.fillText('Account', 108 + textNudge, 14);
  if (!maskClock) {
    ctx.fillStyle = '#d4d4d8';
    ctx.font = `7px ${sans}`;
    ctx.fillText(clock, 200 + textNudge, 14);
  } else {
    ctx.fillStyle = '#f472b6';
    ctx.fillRect(196, 5, 36, 12);
  }

  // heading
  ctx.fillStyle = '#18181b';
  ctx.font = `bold 13px ${fontFallback ? serif : sans}`;
  ctx.fillText('Checkout', 14 + textNudge, 46);
  ctx.fillStyle = '#71717a';
  ctx.font = `7px ${sans}`;
  ctx.fillText('2 items in your basket', 14 + textNudge, 58);

  // form
  ctx.fillStyle = '#52525b';
  ctx.font = `7px ${sans}`;
  ctx.fillText('Email', 14 + textNudge, 76);
  ctx.strokeStyle = '#d4d4d8';
  ctx.lineWidth = 1;
  ctx.strokeRect(14.5, 80.5, 120, 14);
  ctx.fillStyle = '#18181b';
  ctx.fillText('ada@example.com', 19 + textNudge, 90);
  if (caret) {
    ctx.fillStyle = '#18181b';
    ctx.fillRect(88, 83, 2, 10);
  }
  ctx.fillStyle = '#52525b';
  ctx.fillText('Card', 14 + textNudge, 108);
  ctx.strokeRect(14.5, 112.5, 120, 14);
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText('•••• •••• •••• 4242', 19 + textNudge, 122);

  // summary card
  ctx.fillStyle = '#f4f4f5';
  ctx.fillRect(150, 36, 76, 100);
  ctx.fillStyle = '#52525b';
  ctx.font = `7px ${sans}`;
  ctx.fillText('Total', 158 + textNudge, 52);
  ctx.fillStyle = '#18181b';
  ctx.font = `bold 12px ${sans}`;
  ctx.fillText(price, 158 + textNudge, 68);
  ctx.fillStyle = '#71717a';
  ctx.font = `6px ${sans}`;
  ctx.fillText('incl. VAT', 158 + textNudge, 78);
  // progress bar (the "animation")
  ctx.fillStyle = '#e4e4e7';
  ctx.fillRect(158, 88, 60, 4);
  ctx.fillStyle = '#10b981';
  ctx.fillRect(158, 88, 60 * animation, 4);
  // button
  ctx.fillStyle = buttonColor;
  ctx.fillRect(158, 104, buttonWidth, 18);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 8px ${sans}`;
  ctx.fillText('Buy now', 166 + textNudge, 116);

  ctx.translate(-shift, 0);
  if (scrollbar) {
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(MOCK_WIDTH - 8, 22, 8, MOCK_HEIGHT - 22);
    ctx.fillStyle = '#c4c4c8';
    ctx.fillRect(MOCK_WIDTH - 6, 30, 4, 40);
  }
  ctx.restore();
}

/** Renders the mock screen into a fresh ImageData at the given scale. */
export function renderMockScreen(options: MockScreenOptions = {}): ImageData {
  const scale = options.scale ?? 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(MOCK_WIDTH * scale);
  canvas.height = Math.round(MOCK_HEIGHT * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  drawMockScreen(ctx, options);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
