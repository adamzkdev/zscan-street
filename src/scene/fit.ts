/**
 * Canvas text that fits: screens and signs come in many shapes, and live figures (prices, heights,
 * hash rates) grow. Text is drawn at the current font size, or smaller so it stays inside the canvas
 * (or inside `maxW`), whatever the alignment.
 */

/** Shrink the current font until `text` is at most `maxW` wide. */
export function shrink(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const m = g.font.match(/([\d.]+)px/);
  if (!m || maxW <= 0) return;
  const tw = g.measureText(text).width;
  if (tw > maxW) g.font = g.font.replace(m[0], `${Math.floor(parseFloat(m[1]) * (maxW / tw) * 100) / 100}px`);
}

/** Room for text at `x` before the canvas edge, given the alignment, keeping a small margin. */
function room(g: CanvasRenderingContext2D, x: number) {
  const W = g.canvas.width,
    pad = W * 0.03;
  const a = g.textAlign;
  if (a === "center") return 2 * Math.min(x, W - x) - pad;
  if (a === "right" || a === "end") return x - pad;
  return W - x - pad;
}

/** fillText that never runs off the canvas (or past `maxW`). Returns the drawn width. */
export function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW = room(g, x)) {
  const font = g.font;
  shrink(g, text, Math.min(maxW, room(g, x)));
  g.fillText(text, x, y);
  const tw = g.measureText(text).width;
  g.font = font;
  return tw;
}
