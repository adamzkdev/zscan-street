/**
 * The zkSNARKs' pixels for ZK LEGENDS: each NFT's 26 × 26 picture read cell by cell (the black
 * round the figure keyed out), loaded one at a time through the city's portrait queue and kept.
 * `snarkCanvas` draws one on a 26 px canvas the browser scales crisp (`image-rendering: pixelated`).
 */
import { portraitImage } from "../../data/portrait";
import { personImage } from "../../party/people";

const GRID = 26;
type Cells = Int32Array;

// ---- zkSNARK pixels -------------------------------------------------------------------------------------

const cells = new Map<number, Promise<Cells | null>>();
const ready = new Map<number, Cells | null>();

/** The black joined to the border is the backdrop: keyed out. */
function keyOut(c: Cells) {
  const black = (i: number) => c[i] >= 0 && ((c[i] >> 16) & 255) < 10 && ((c[i] >> 8) & 255) < 10 && (c[i] & 255) < 10;
  const stack: number[] = [];
  for (let i = 0; i < GRID; i++) stack.push(i, (GRID - 1) * GRID + i, i * GRID, i * GRID + GRID - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (!black(i)) continue;
    c[i] = -1;
    const x = i % GRID,
      y = (i / GRID) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < GRID - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - GRID);
    if (y < GRID - 1) stack.push(i + GRID);
  }
}

export function snarkPixels(id: number): Promise<Cells | null> {
  let p = cells.get(id);
  if (!p) {
    p = (async () => {
      try {
        const img = await portraitImage(personImage(id));
        const cv = document.createElement("canvas");
        cv.width = img.width;
        cv.height = img.height;
        const g = cv.getContext("2d", { willReadFrequently: true })!;
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        const cell = cv.width / GRID;
        const out = new Int32Array(GRID * GRID);
        for (let r = 0; r < GRID; r++)
          for (let q = 0; q < GRID; q++) {
            const k = (Math.floor((r + 0.5) * cell) * cv.width + Math.floor((q + 0.5) * cell)) * 4;
            out[r * GRID + q] = d[k + 3] < 128 ? -1 : (d[k] << 16) | (d[k + 1] << 8) | d[k + 2];
          }
        cv.width = cv.height = 0;
        keyOut(out);
        ready.set(id, out);
        return out;
      } catch {
        cells.delete(id);
        return null;
      }
    })();
    cells.set(id, p);
  }
  return p;
}

/** Load the pictures of these ids in the background (the deck's, before the game starts). */
export function preload(ids: number[]) {
  for (const id of ids) void snarkPixels(id);
}

function paintCells(cv: HTMLCanvasElement, c: Cells | null, id: number) {
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, GRID, GRID);
  if (!c) {
    // a hooded stand-in in the id's colour, while the picture comes
    const hue = (id * 47) % 360;
    g.fillStyle = `hsl(${hue} 30% 26%)`;
    g.fillRect(9, 7, 11, 14);
    g.fillRect(7, 21, 14, 5);
    g.fillStyle = `hsl(${hue} 20% 60%)`;
    g.fillRect(12, 10, 8, 8);
    return;
  }
  const im = g.createImageData(GRID, GRID);
  for (let i = 0; i < GRID * GRID; i++) {
    const v = c[i];
    if (v < 0) continue;
    im.data[i * 4] = (v >> 16) & 255;
    im.data[i * 4 + 1] = (v >> 8) & 255;
    im.data[i * 4 + 2] = v & 255;
    im.data[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
}

/** A 26 px canvas with zkSNARK #id on it (filled in when the picture comes). */
export function snarkCanvas(id: number, cls = ""): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = GRID;
  if (cls) cv.className = cls;
  const have = ready.get(id);
  paintCells(cv, have ?? null, id);
  if (!have) void snarkPixels(id).then((c) => c && paintCells(cv, c, id));
  return cv;
}

