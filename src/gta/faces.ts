import * as THREE from "three";
import { portraitImage } from "../data/portrait";
import { ZScan } from "../data/zscan";
import { snarkCells } from "../scene/snarkbody";

/**
 * The zkSNARKs' looks for the game (src/gta): each one's own picture (the collection's PNG, exact:
 * not the atlas, whose JPEG smears a dark halo round every figure) read once into its 26 × 26 cells,
 * one request at a time with a pause between, so the image API is never flooded. From the cells:
 * the head in 3D voxels (its silhouette rounded into a volume, the art on the face, the hood's colour
 * round the back), and the colours the body is dressed in (the top, the hood, the skin), with
 * trousers and shoes picked by the number.
 *
 *   faces.want([ids]); faces.ready(id); faces.look(id) → Look | null
 */

const GRID = 26;
type Cells = Int32Array;

/**
 * A zkSNARK in 3D: its bust from its own picture — the hooded head and the shoulders — rounded into
 * a volume (the art on the front, the hood's colour round the sides and the back), in two pieces so
 * the head can turn and nod on the shoulders; the colours for its legs and arms.
 */
export interface Look {
  id: number;
  /** From its own picture (false: a stand-in in the number's colours). */
  real: boolean;
  /** The head (origin at its bottom middle, the neck; facing +z) and the shoulders (origin at their bottom middle). */
  head: THREE.BufferGeometry;
  body: THREE.BufferGeometry;
  headH: number;
  bodyH: number;
  /** Half the shoulders' width (m). */
  halfW: number;
  cloth: number;
  trousers: number;
  skin: number;
  shoes: number;
  sole: number;
  /** A little taller or shorter, by the number. */
  bh: number;
}

/** One voxel of the bust (m): a zkSNARK is about 1.5 m on its legs. */
export const SNARK_VOX = 0.052;
/** The shoulders drawn a little narrower than the art's (its bust is cut by the picture's edges). */
const BODY_SX = 0.84;

const cells = new Map<number, Cells | null>();
/** Read from the collection's atlas (quick, all at once, a little soft): the street's own crowd. */
const quickCells = new Map<number, Cells>();
const quickAsked = new Set<number>();
/** Built looks, the most recently used last (the oldest unpinned ones are freed past a few dozen). */
const looks = new Map<number, Look>();
const pins = new Map<number, number>();
const KEEP = 320;
function trimLooks() {
  if (looks.size <= KEEP) return;
  for (const [id, l] of looks) {
    if (looks.size <= KEEP) break;
    if (pins.get(id)) continue;
    l.head.dispose();
    l.body.dispose();
    looks.delete(id);
  }
}
const queue: number[] = [];
let busy = false;

function next() {
  if (busy) return;
  const id = queue.shift();
  if (id === undefined) return;
  busy = true;
  void read(id)
    .then((c) => cells.set(id, c))
    .catch(() => cells.set(id, null))
    .finally(() => {
      busy = false;
      // a short pause between pictures: a steady trickle, never a burst
      setTimeout(next, 140);
    });
}

async function read(id: number): Promise<Cells | null> {
  const img = await portraitImage(ZScan.zkSnarkImage(id));
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const cell = c.width / GRID;
  const out = new Int32Array(GRID * GRID);
  for (let r = 0; r < GRID; r++)
    for (let q = 0; q < GRID; q++) {
      const k = (Math.floor((r + 0.5) * cell) * c.width + Math.floor((q + 0.5) * cell)) * 4;
      out[r * GRID + q] = d[k + 3] < 128 ? -1 : (d[k] << 16) | (d[k + 1] << 8) | d[k + 2];
    }
  c.width = c.height = 0;
  keyOut(out);
  return out;
}

/** The flat black round the art (black cells joined to the border) is nothing. */
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

/** The atlas's JPEG leaves a dark, noisy halo round the figure: everything dark joined to the border goes. */
function keyHalo(c: Cells) {
  const dark = (i: number) => c[i] >= 0 && 0.2126 * ((c[i] >> 16) & 255) + 0.7152 * ((c[i] >> 8) & 255) + 0.0722 * (c[i] & 255) < 30;
  const stack: number[] = [];
  for (let i = 0; i < GRID; i++) stack.push(i, (GRID - 1) * GRID + i, i * GRID, i * GRID + GRID - 1);
  for (let i = 0; i < GRID * GRID; i++) if (c[i] < 0) stack.push(i);
  const seen = new Uint8Array(GRID * GRID);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    if (c[i] >= 0 && !dark(i)) continue;
    c[i] = -1;
    const x = i % GRID,
      y = (i / GRID) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < GRID - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - GRID);
    if (y < GRID - 1) stack.push(i + GRID);
  }
}

export const faces = {
  /** Read these (in this order, after those already asked for; `first`: before them). */
  want(ids: number[], first = false) {
    const fresh = ids.filter((id) => id >= 1 && id <= 10000 && !cells.has(id) && !queue.includes(id));
    if (first) queue.unshift(...fresh);
    else queue.push(...fresh);
    next();
  },
  /** Its picture is in (or could not be read: it gets a stand-in). */
  ready(id: number) {
    return cells.has(id);
  },
  /** zkSNARK #id as a person (built once); null while its picture is on its way. */
  look(id: number): Look | null {
    let l = looks.get(id);
    if (l) {
      looks.delete(id);
      looks.set(id, l);
      return l;
    }
    if (!cells.has(id)) {
      const q = quickCells.get(id);
      if (!q) return null;
      l = build(id, q, true);
      looks.set(id, l);
      trimLooks();
      return l;
    }
    const c = cells.get(id);
    l = build(id, c ?? standIn(id), !!c);
    looks.set(id, l);
    trimLooks();
    return l;
  },
  /** A look can be built for it now (its picture, or the atlas's quick read of it). */
  known(id: number) {
    return cells.has(id) || quickCells.has(id);
  },
  /** Read these from the atlas (the street's crowd: many, quickly). */
  quick(ids: number[]) {
    for (const id of ids) {
      if (id < 1 || id > 10000 || quickAsked.has(id) || cells.has(id)) continue;
      quickAsked.add(id);
      void snarkCells(id).then((c) => {
        if (!c) return;
        const k = new Int32Array(c);
        keyHalo(k);
        quickCells.set(id, k);
        if (quickCells.size > 900) {
          const [old] = quickCells.keys();
          quickCells.delete(old);
          quickAsked.delete(old);
        }
      });
    }
  },
  /** Kept while a figure wears it (its head geometry is drawn as it is). */
  pin(id: number) {
    pins.set(id, (pins.get(id) ?? 0) + 1);
  },
  unpin(id: number) {
    const n = (pins.get(id) ?? 0) - 1;
    if (n > 0) pins.set(id, n);
    else pins.delete(id);
  },
  /** zkSNARK #id now: its own look, or a stand-in until the picture is in. */
  lookNow(id: number): Look {
    return this.look(id) ?? standInLook(id);
  },
  /** When its picture is in. */
  async wait(id: number, ms = 6000): Promise<Look> {
    this.want([id], true);
    const t0 = performance.now();
    while (!cells.has(id) && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 120));
    return this.lookNow(id);
  },
};

const standIns = new Map<number, Look>();
function standInLook(id: number) {
  let l = standIns.get(id);
  if (!l) {
    standIns.set(id, (l = build(id, standIn(id), false)));
    // (a few dozen kept: a stand-in is only for a moment)
    if (standIns.size > 48) {
      const [old] = standIns.keys();
      standIns.delete(old);
    }
  }
  return l;
}

/** A stand-in hood in the number's colours, for the moment before the picture comes. */
function standIn(id: number): Cells {
  let h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  const r = () => ((h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0) / 4294967296);
  const hue = r();
  const hood = new THREE.Color().setHSL(hue, 0.45, 0.4).getHex();
  const face = new THREE.Color().setHSL(0.08, 0.35, 0.72).getHex();
  const eye = new THREE.Color().setHSL((hue + 0.5) % 1, 0.9, 0.62).getHex();
  const c = new Int32Array(GRID * GRID).fill(-1);
  for (let y = 6; y < 26; y++)
    for (let x = 0; x < 26; x++) {
      const head = y < 21 && x >= 9 && x <= 20 && !((y === 6 || y === 20) && (x === 9 || x === 20));
      const body = y >= 21 && x >= 7 - (y - 21) && x <= 20 + Math.min(1, y - 21);
      if (!head && !body) continue;
      let col = hood;
      if (head && y >= 9 && y <= 18 && x >= 12 && x <= 19) col = face;
      if (head && y >= 12 && y <= 13 && (x === 13 || x === 14 || x === 17 || x === 18)) col = eye;
      c[y * GRID + x] = col;
    }
  return c;
}

// ---- the look ----------------------------------------------------------------------------------------

const mode = (xs: number[], fallback: number) => {
  const n = new Map<number, number>();
  let best = fallback,
    bn = 0;
  for (const x of xs) {
    const v = (n.get(x) ?? 0) + 1;
    n.set(x, v);
    if (v > bn) ((bn = v), (best = x));
  }
  return best;
};
/** Two colours close enough to be one (a shade's step in the pixel art). */
const near = (a: number, b: number) => Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255)) < 60;
const lum = (c: number) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
function shade(c: number, k: number) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)),
    g = Math.min(255, Math.round(((c >> 8) & 255) * k)),
    b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/** The largest 4-connected piece of the drawn cells in rows y0..y1 (loose pixels of the trail go). */
function piece(c: Cells, y0: number, y1: number) {
  const lab = new Int32Array(GRID * GRID).fill(-1);
  let best = -1,
    bestN = 0,
    n = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      if (c[i] < 0 || lab[i] >= 0) continue;
      const st = [i];
      lab[i] = n;
      let size = 0;
      while (st.length) {
        const k = st.pop()!;
        size++;
        const kx = k % GRID,
          ky = (k / GRID) | 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = kx + dx,
            ny = ky + dy;
          if (nx < 0 || nx >= GRID || ny < y0 || ny > y1) continue;
          const nk = ny * GRID + nx;
          if (c[nk] >= 0 && lab[nk] < 0) {
            lab[nk] = n;
            st.push(nk);
          }
        }
      }
      if (size > bestN) ((bestN = size), (best = n));
      n++;
    }
  return (x: number, y: number) => y >= y0 && y <= y1 && x >= 0 && x < GRID && c[y * GRID + x] >= 0 && lab[y * GRID + x] === best;
}

function build(id: number, src: Cells, real: boolean): Look {
  const c = new Int32Array(src);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= GRID || y >= GRID ? -1 : c[y * GRID + x]);
  let top = GRID,
    bottom = -1;
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++)
      if (at(x, y) >= 0) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (bottom < 0) return build(id, standIn(id), false);
  // the neck: the narrowest right edge in the lower part
  const right = (y: number) => {
    for (let x = GRID - 1; x >= 0; x--) if (at(x, y) >= 0) return x;
    return -1;
  };
  let neck = bottom - 5,
    nr = 99;
  for (let y = Math.max(top + 6, bottom - 8); y <= bottom - 3; y++) {
    const r = right(y);
    if (r >= 0 && r <= nr) ((nr = r), (neck = y));
  }
  // the speed trail: cut where the rows are (nearly) all drawn
  const coreLeft = (y0: number, y1: number, k: number) => {
    const fill = (x: number) => {
      let n = 0;
      for (let y = y0; y <= y1; y++) if (at(x, y) >= 0) n++;
      return n / Math.max(1, y1 - y0 + 1);
    };
    for (let x = 0; x < GRID - 4; x++) if (fill(x) >= k && fill(x + 1) >= k && fill(x + 2) >= k && fill(x + 3) >= k) return x;
    return 0;
  };
  const hl = coreLeft(top, neck, 0.8);
  for (let y = 0; y <= neck; y++) for (let x = 0; x < hl; x++) c[y * GRID + x] = -1;
  const bl = Math.min(hl, coreLeft(neck + 1, bottom, 0.75));
  for (let y = neck + 1; y < GRID; y++) for (let x = 0; x < bl; x++) c[y * GRID + x] = -1;
  const inHead = piece(c, top, neck),
    inBody = piece(c, neck + 1, bottom);
  // the columns of each
  const span = (inside: (x: number, y: number) => boolean, y0: number, y1: number) => {
    let x0 = GRID,
      x1 = -1;
    for (let y = y0; y <= y1; y++)
      for (let x = 0; x < GRID; x++)
        if (inside(x, y)) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
        }
    return x1 < 0 ? null : { x0, x1 };
  };
  const hs = span(inHead, top, neck)!,
    bs = span(inBody, neck + 1, bottom) ?? { x0: hs.x0, x1: hs.x1 };
  // each row's shell: the colour just inside its back (left) edge
  const shell = new Int32Array(GRID).fill(0x505050);
  for (let y = top; y <= bottom; y++) {
    const inside = y <= neck ? inHead : inBody;
    let x0 = -1;
    for (let x = 0; x < GRID; x++)
      if (inside(x, y)) {
        x0 = x;
        break;
      }
    if (x0 < 0) continue;
    const xs: number[] = [];
    for (let x = x0; x <= x0 + 2; x++) if (inside(x, y)) xs.push(at(x, y));
    shell[y] = mode(xs, at(x0, y));
  }
  // the clothes: the bottom rows' middle; the skin: the face's commonest colour that is not the hood
  const clothXs: number[] = [];
  for (let y = Math.max(neck + 1, bottom - 2); y <= bottom; y++) for (let x = bs.x0 + 2; x <= bs.x1 - 1; x++) if (inBody(x, y)) clothXs.push(at(x, y));
  const cloth = mode(clothXs, shell[neck]);
  // round the sides and the back one colour, not a stripe per row (each row's back edge took its own
  // colour: the trail's leftovers, an outline, a highlight striped the back of every head): the hood's
  // commonest edge colour, and a hat's on top when the first rows are another colour all along
  let hatEnd = top - 1;
  {
    const rows: number[] = [];
    for (let y = top; y <= neck; y++) rows.push(shell[y]);
    // (the hood's colour from the lower rows: the top ones may be a hat's)
    const hood = mode(rows.slice(Math.floor(rows.length * 0.55)), shell[neck]);
    const hatCol = shell[top];
    if (hatCol !== hood) {
      let y = top;
      while (y <= neck && (shell[y] === hatCol || near(shell[y], hatCol))) y++;
      // (a band of at least two rows, not the whole head)
      if (y - top >= 2 && y <= top + (neck - top) * 0.6) hatEnd = y - 1;
    }
    for (let y = top; y <= neck; y++) shell[y] = y <= hatEnd ? hatCol : hood;
    for (let y = neck + 1; y <= bottom; y++) shell[y] = cloth;
  }
  const shells = new Set<number>();
  for (let y = top; y <= neck; y++) shells.add(shell[y]);
  const faceXs: number[] = [];
  const hcx = (hs.x0 + hs.x1 + 1) / 2;
  // (not the hood's nor the hat's colour, nor a shade of them: the hands took a beanie's orange)
  const shellish = (c0: number) => [...shells].some((s0) => s0 === c0 || near(s0, c0));
  for (let y = Math.max(top + 2, hatEnd + 2); y <= neck - 1; y++) for (let x = Math.floor(hcx) - 1; x <= hs.x1; x++) if (inHead(x, y) && !shellish(at(x, y)) && lum(at(x, y)) > 50) faceXs.push(at(x, y));
  const skin = faceXs.length > 6 ? mode(faceXs, 0xd8b48c) : 0xd8b48c;
  // both pieces round the shoulders' middle column (the head sits where the art has it)
  const cx = (bs.x0 + bs.x1 + 1) / 2;
  const v = SNARK_VOX;
  const hw = hs.x1 - hs.x0 + 1,
    bw = bs.x1 - bs.x0 + 1;
  // the face: what is inside the hood and not the hood's colour, set a voxel back (the hood's rim
  // stands proud of it, as a hood does)
  const hoodCol = shell[neck];
  const faceIn = (x: number, y: number) => {
    if (!inHead(x, y)) return false;
    const c0 = at(x, y);
    if (c0 === hoodCol || near(c0, hoodCol) || c0 === shell[y]) return false;
    // (inside: hood all round it within a few cells)
    let n = 0;
    for (const [dx, dy] of [
      [-3, 0],
      [3, 0],
      [0, -3],
    ])
      if (inHead(x + dx, y + dy)) n++;
    return n === 3;
  };
  const head = pillow(inHead, at, shell, top, neck, cx, v, Math.max(9, hw * 1.02), Math.max(2.6, hw * 0.42), faceIn);
  // the body: the art's shoulders, then two rows more of the top (its hem a shade darker), a hoodie's depth
  const ext = 3;
  const bodyAt = (x: number, y: number) => (y <= bottom ? at(x, y) : inBody(x, bottom) ? (y === bottom + ext ? shade(cloth, 0.82) : cloth) : -1);
  const bodyIn = (x: number, y: number) => (y <= bottom ? inBody(x, y) : inBody(x, bottom) && x > bs.x0 && x < bs.x1);
  const shellExt = new Int32Array(GRID + ext).fill(cloth);
  for (let y = 0; y < GRID; y++) shellExt[y] = shell[y];
  shellExt[bottom + ext] = shade(cloth, 0.82);
  const body = pillow(bodyIn, bodyAt, shellExt, neck + 1, bottom + ext, cx, v, Math.max(8, Math.min(hw * 0.85, bw * 0.62)), Math.max(1.6, bw * 0.16), undefined, [0.18, 0.02], BODY_SX);
  let h = Math.imul(id ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0) / 4294967296);
  return {
    id,
    real,
    head,
    body,
    headH: (neck - top + 1) * v,
    bodyH: (bottom + ext - neck) * v,
    halfW: (bw / 2) * v * BODY_SX,
    cloth,
    // (the street's look: trousers and sneakers of their own, by the number — denim, black, khaki,
    // grey or the top's own colour darker; white, black or bright trainers on a light sole)
    ...dress(rnd, cloth),
    skin,
    bh: 0.96 + rnd() * 0.08,
  };
}

function dress(rnd: () => number, cloth: number) {
  const TROUSERS = [0x2e3a55, 0x3f5d8c, 0x1d1d23, 0x6c6356, 0x8b7b58, 0x4b505b, shade(cloth, 0.58)];
  const SHOES: [number, number][] = [
    [0xeeeeea, 0xb9b9b4],
    [0x1c1c22, 0xe8e8e2],
    [0xeeeeea, 0xd8d2c4],
    [0x2a2a30, 0x2a2a30],
    [0xeeeeea, 0x9a9a96],
    [0x1c1c22, 0xe8e8e2],
    [0xb83434, 0xf0f0ea],
    [0x3a3a40, 0x9a9a96],
  ];
  const [shoes, sole] = SHOES[Math.floor(rnd() * SHOES.length)];
  return { trousers: TROUSERS[Math.floor(rnd() * TROUSERS.length)], shoes, sole };
}

/**
 * Rows y0..y1 of the art (the cells `inside`), x round column `cx`, rounded into a volume `D` voxels
 * deep in the middle and thinner toward the silhouette's edge over `R` cells (a pillow: the way a
 * head, a pair of shoulders is round). The front of each column is the art; behind it, the row's
 * hood colour. Its origin at the bottom middle, facing +z.
 */
function inflate(inside: (x: number, y: number) => boolean, at: (x: number, y: number) => number, shell: Int32Array, y0: number, y1: number, cx: number, v: number, D: number, R: number, recess: (x: number, y: number) => boolean = () => false) {
  const W = GRID,
    H = y1 - y0 + 1;
  // each cell's distance to the outside (a chamfer, two passes each way)
  const dist = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) dist[y * W + x] = inside(x, y0 + y) ? 99 : 0;
  const get = (x: number, y: number) => (x < 0 || x >= W ? 0 : y < 0 || y >= H ? 99 : dist[y * W + x]);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!dist[i]) continue;
        dist[i] = Math.min(dist[i], get(x - 1, y) + 1, get(x, y - 1) + 1, get(x - 1, y - 1) + 1.41, get(x + 1, y - 1) + 1.41);
      }
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        if (!dist[i]) continue;
        dist[i] = Math.min(dist[i], get(x + 1, y) + 1, get(x, y + 1) + 1, get(x + 1, y + 1) + 1.41, get(x - 1, y + 1) + 1.41);
      }
  }
  // (a head is round at the top and the bottom too: rows off the ends count as outside for it)
  // and round all over, not a slab with soft edges: the depth falls off from the middle like a ball's
  let mx = 0,
    my = 0,
    cnt = 0,
    xa = W,
    xb = 0;
  for (let i = 0; i < W * H; i++)
    if (dist[i]) {
      const x = i % W,
        y = Math.floor(i / W);
      mx += x;
      my += y;
      cnt++;
      xa = Math.min(xa, x);
      xb = Math.max(xb, x);
    }
  mx /= Math.max(1, cnt);
  my /= Math.max(1, cnt);
  const hx = Math.max(2, (xb - xa + 1) / 2),
    hy = Math.max(2, H / 2);
  const zLo = new Int16Array(W * H),
    zHi = new Int16Array(W * H).fill(-1);
  for (let i = 0; i < W * H; i++) {
    if (!dist[i]) continue;
    const e = Math.min(1, (Math.min(dist[i], 99) - 0.4) / R);
    const k = Math.sqrt(Math.max(0.1, 1 - (1 - e) * (1 - e)));
    const u = ((i % W) + 0.5 - mx) / hx,
      w = (Math.floor(i / W) + 0.5 - my) / hy;
    const ball = Math.sqrt(Math.max(0.3, 1 - 0.32 * u * u - 0.14 * w * w));
    const n = Math.max(2, Math.round(D * k * ball));
    zLo[i] = Math.floor((D - n) / 2);
    zHi[i] = zLo[i] + n - 1;
    if (recess(i % W, y0 + Math.floor(i / W)) && zHi[i] - zLo[i] > 3) zHi[i]--;
  }
  // the sides and the back: lit from above (a shade lighter at the top, darker toward the bottom)
  const sh = new Int32Array(H);
  for (let y = 0; y < H; y++) sh[y] = shade(shell[y0 + y], 1.06 - 0.2 * (y / Math.max(1, H - 1)));
  const color = (x: number, y: number, z: number): number => {
    if (x < 0 || y < 0 || x >= W || y >= H || z < 0 || z >= D) return -1;
    const i = y * W + x;
    if (zHi[i] < 0 || z < zLo[i] || z > zHi[i]) return -1;
    return z === zHi[i] ? at(x, y0 + y) : sh[y];
  };
  return greedy(color, [W, H, D], (gx, gy, gz) => [(gx - cx) * v, (H - gy) * v, (gz - D / 2) * v]);
}

/**
 * The same volume as a smooth surface (an art toy's, not a pile of voxels): the silhouette's cells
 * rows y0..y1, a depth at every cell corner rounded like a ball from the middle and like a pillow
 * toward the edge, the front and the back as smooth sheets — a quad per pixel of the art with its
 * own colour, so the art stays crisp while the light rolls round the volume — joined round the
 * outline by a rim. The face (`recess`) sits a little back in the hood. Origin at the bottom middle,
 * facing +z; vertex colours, smooth normals.
 */
function pillow(inside: (x: number, y: number) => boolean, at: (x: number, y: number) => number, shell: Int32Array, y0: number, y1: number, cx: number, v: number, D: number, R: number, recess: (x: number, y: number) => boolean = () => false, round: [number, number] = [0.3, 0.16], sx = 1) {
  const W = GRID,
    H = y1 - y0 + 1;
  const inC = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && inside(x, y0 + y);
  // each cell's distance to the outside
  const dist = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) dist[y * W + x] = inC(x, y) ? 99 : 0;
  const get = (x: number, y: number) => (x < 0 || x >= W || y < 0 || y >= H ? 0 : dist[y * W + x]);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (dist[i]) dist[i] = Math.min(dist[i], get(x - 1, y) + 1, get(x, y - 1) + 1, get(x - 1, y - 1) + 1.41, get(x + 1, y - 1) + 1.41);
      }
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        if (dist[i]) dist[i] = Math.min(dist[i], get(x + 1, y) + 1, get(x, y + 1) + 1, get(x + 1, y + 1) + 1.41, get(x - 1, y + 1) + 1.41);
      }
  }
  let mx = 0,
    my = 0,
    cnt = 0,
    xa = W,
    xb = 0;
  for (let i = 0; i < W * H; i++)
    if (dist[i]) {
      mx += i % W;
      my += Math.floor(i / W);
      cnt++;
      xa = Math.min(xa, i % W);
      xb = Math.max(xb, i % W);
    }
  mx = mx / Math.max(1, cnt) + 0.5;
  my = my / Math.max(1, cnt) + 0.5;
  const hx = Math.max(2, (xb - xa + 1) / 2),
    hy = Math.max(2, H / 2);
  // the half depth at every cell corner (x, y in 0..W, 0..H): from the cells round it
  const CW = W + 1;
  const half = new Float32Array(CW * (H + 1));
  for (let y = 0; y <= H; y++)
    for (let x = 0; x <= W; x++) {
      let d = 0,
        n = 0;
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ]) {
        const g = get(x + dx, y + dy);
        if (g) ((d += Math.min(g, 99)), n++);
      }
      if (!n) continue;
      // (a corner on the outline: the edge's own thickness)
      const dd = n < 4 ? 0.15 : d / n - 0.5;
      const e = Math.min(1, Math.max(0, dd) / R);
      const k = Math.sqrt(Math.max(0.12, 1 - (1 - e) * (1 - e)));
      const u = (x - mx) / hx,
        w = (y - my) / hy;
      const ball = Math.sqrt(Math.max(0.3, 1 - round[0] * u * u - round[1] * w * w));
      half[y * CW + x] = (D / 2) * k * ball;
    }
  // the face set back in the hood: by corner (the share of face cells round it), so the sheet stays whole
  const sinkC = new Float32Array(CW * (H + 1));
  for (let y = 0; y <= H; y++)
    for (let x = 0; x <= W; x++) {
      let n = 0;
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ])
        if (inC(x + dx, y + dy) && recess(x + dx, y0 + y + dy)) n++;
      sinkC[y * CW + x] = 0.6 * (n / 4);
    }
  const hAt = (x: number, y: number) => half[Math.max(0, Math.min(H, y)) * CW + Math.max(0, Math.min(W, x))];
  // the corner's normal on the front sheet (from the depth's slope), mirrored on the back
  const nrm = (x: number, y: number, out: THREE.Vector3) => {
    const dzdx = (hAt(x + 1, y) - hAt(x - 1, y)) / 2,
      dzdy = (hAt(x, y + 1) - hAt(x, y - 1)) / 2;
    // world: x right, y up (grid y runs down), z out of the front
    return out.set(-dzdx, dzdy, 1).normalize();
  };
  const pos: number[] = [],
    nor: number[] = [],
    col: number[] = [];
  const tmp = new THREE.Color();
  const n0 = new THREE.Vector3();
  const P = (x: number, y: number, z: number) => [(x - cx) * v * sx, (H - y) * v, z * v];
  const push = (p: number[], n: THREE.Vector3, c: number, k = 1) => {
    pos.push(p[0], p[1], p[2]);
    nor.push(n.x, n.y, n.z);
    tmp.setHex(c, THREE.SRGBColorSpace).multiplyScalar(k);
    col.push(tmp.r, tmp.g, tmp.b);
  };
  // the sides and the back: lit from above a little (lighter at the top)
  const shadeAt = (y: number) => 1.05 - 0.16 * (y / Math.max(1, H));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inC(x, y)) continue;
      const art = at(x, y0 + y);
      const back = shell[y0 + y];
      const corners: [number, number][] = [
        [x, y],
        [x + 1, y],
        [x + 1, y + 1],
        [x, y + 1],
      ];
      // front (+z): the art; back (−z): the hood, a shade by height
      for (const side of [1, -1]) {
        const vs = corners.map(([qx, qy]) => P(qx, qy, side * Math.max(0.15, hAt(qx, qy) - (side > 0 ? sinkC[qy * CW + qx] : 0))));
        const ns = corners.map(([qx, qy]) => {
          const nn = nrm(qx, qy, new THREE.Vector3());
          if (side < 0) nn.z = -nn.z;
          return nn;
        });
        const order = side > 0 ? [0, 3, 2, 0, 2, 1] : [0, 1, 2, 0, 2, 3];
        for (const t of order) push(vs[t], ns[t], side > 0 ? art : back, side > 0 ? 1 : shadeAt(corners[t][1]));
      }
      // the rim, where the cell's edge is the outline: from the front sheet to the back one
      const edges: [number, number, number, number, number, number][] = [
        [x, y, x + 1, y, 0, 1],
        [x + 1, y, x + 1, y + 1, 1, 0],
        [x + 1, y + 1, x, y + 1, 0, -1],
        [x, y + 1, x, y, -1, 0],
      ];
      const nb = [
        [x, y - 1],
        [x + 1, y],
        [x, y + 1],
        [x - 1, y],
      ];
      edges.forEach(([ax, ay, bx, by, ex, ey], k) => {
        if (inC(nb[k][0], nb[k][1])) return;
        n0.set(ex, ey, 0);
        const za = Math.max(0.15, hAt(ax, ay)),
          zb = Math.max(0.15, hAt(bx, by));
        const a1 = P(ax, ay, za),
          b1 = P(bx, by, zb),
          b2 = P(bx, by, -zb),
          a2 = P(ax, ay, -za);
        // (the rim takes the art's colour on its front half, the hood's behind)
        const mid1 = P(ax, ay, 0),
          mid2 = P(bx, by, 0);
        for (const [q1, q2, q3, q4, c] of [
          [a1, b1, mid2, mid1, art],
          [mid1, mid2, b2, a2, back],
        ] as [number[], number[], number[], number[], number][]) {
          for (const p0 of [q1, q2, q3, q1, q3, q4]) push(p0, n0, c, c === back ? shadeAt(ay) : 0.92);
        }
      });
    }
  // wind every triangle to face its normal
  const pa = new THREE.Vector3(),
    pb = new THREE.Vector3(),
    pc = new THREE.Vector3(),
    pn = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 9) {
    pa.fromArray(pos, i);
    pb.fromArray(pos, i + 3);
    pc.fromArray(pos, i + 6);
    pn.fromArray(nor, i).add(pn.clone().fromArray(nor, i + 3)).add(pn.clone().fromArray(nor, i + 6));
    if (pb.sub(pa).cross(pc.sub(pa)).dot(pn) < 0)
      for (const arr of [pos, nor, col])
        for (let k = 0; k < 3; k++) {
          const t = arr[i + 3 + k];
          arr[i + 3 + k] = arr[i + 6 + k];
          arr[i + 6 + k] = t;
        }
  }
  return indexed(pos, nor, col);
}

/**
 * Triangles to an indexed geometry: corners that are the same point with the same normal and colour
 * shared (the back's sheet and a run of one colour on the front are most of a bust: about half the
 * vertices of the triangle soup, for the 400 drawn round you).
 */
function indexed(pos: number[], nor: number[], col: number[]) {
  const map = new Map<string, number>();
  const P: number[] = [],
    N: number[] = [],
    C: number[] = [],
    I: number[] = [];
  const r = (x: number, k: number) => Math.round(x * k);
  for (let i = 0; i < pos.length; i += 3) {
    const key = `${r(pos[i], 1e4)},${r(pos[i + 1], 1e4)},${r(pos[i + 2], 1e4)},${r(nor[i], 100)},${r(nor[i + 1], 100)},${r(nor[i + 2], 100)},${r(col[i], 255)},${r(col[i + 1], 255)},${r(col[i + 2], 255)}`;
    let k = map.get(key);
    if (k === undefined) {
      k = P.length / 3;
      map.set(key, k);
      P.push(pos[i], pos[i + 1], pos[i + 2]);
      N.push(nor[i], nor[i + 1], nor[i + 2]);
      C.push(col[i], col[i + 1], col[i + 2]);
    }
    I.push(k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// (the voxel builder, kept: the look before the smooth one)
void inflate;

/** A voxel grid's faces, greedy-merged by colour, as a flat-shaded geometry (vertex colours). */
function greedy(color: (x: number, y: number, z: number) => number, dims: number[], place: (x: number, y: number, z: number) => [number, number, number]) {
  const pos: number[] = [],
    nor: number[] = [],
    col: number[] = [];
  const tmp = new THREE.Color();
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    cc = new THREE.Vector3(),
    n = new THREE.Vector3();
  for (let axis = 0; axis < 3; axis++)
    for (let dir = -1; dir <= 1; dir += 2) {
      const u = (axis + 1) % 3,
        w = (axis + 2) % 3;
      const mask = new Int32Array(dims[u] * dims[w]);
      const p = [0, 0, 0],
        q = [0, 0, 0];
      q[axis] = dir;
      for (p[axis] = 0; p[axis] < dims[axis]; p[axis]++) {
        let m = 0;
        for (p[w] = 0; p[w] < dims[w]; p[w]++)
          for (p[u] = 0; p[u] < dims[u]; p[u]++, m++) {
            const ca = color(p[0], p[1], p[2]);
            mask[m] = ca >= 0 && color(p[0] + q[0], p[1] + q[1], p[2] + q[2]) < 0 ? ca : -1;
          }
        m = 0;
        for (let j = 0; j < dims[w]; j++)
          for (let i = 0; i < dims[u]; ) {
            const c = mask[m];
            if (c < 0) {
              i++;
              m++;
              continue;
            }
            let ww = 1;
            while (i + ww < dims[u] && mask[m + ww] === c) ww++;
            let hh = 1;
            outer: for (; j + hh < dims[w]; hh++) for (let k = 0; k < ww; k++) if (mask[m + k + hh * dims[u]] !== c) break outer;
            const o = [0, 0, 0];
            o[axis] = p[axis] + (dir > 0 ? 1 : 0);
            o[u] = i;
            o[w] = j;
            const du = [0, 0, 0],
              dv = [0, 0, 0];
            du[u] = ww;
            dv[w] = hh;
            const corners = [
              place(o[0], o[1], o[2]),
              place(o[0] + du[0], o[1] + du[1], o[2] + du[2]),
              place(o[0] + du[0] + dv[0], o[1] + du[1] + dv[1], o[2] + du[2] + dv[2]),
              place(o[0] + dv[0], o[1] + dv[1], o[2] + dv[2]),
            ];
            // the face's normal in the world (grid y runs down: flipped)
            n.set(axis === 0 ? dir : 0, axis === 1 ? -dir : 0, axis === 2 ? dir : 0);
            a.fromArray(corners[0]);
            b.fromArray(corners[1]);
            cc.fromArray(corners[2]);
            const flip = b.sub(a).cross(cc.sub(a)).dot(n) < 0;
            const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
            // a touch of light baked in: underneath darker, the top a little brighter
            const k = axis === 1 ? (dir > 0 ? 0.78 : 1.04) : 1;
            tmp.setHex(c, THREE.SRGBColorSpace).multiplyScalar(k);
            for (const t of order) {
              pos.push(...corners[t]);
              nor.push(n.x, n.y, n.z);
              col.push(tmp.r, tmp.g, tmp.b);
            }
            for (let y = 0; y < hh; y++) for (let k2 = 0; k2 < ww; k2++) mask[m + k2 + y * dims[u]] = -1;
            i += ww;
            m += ww;
          }
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
