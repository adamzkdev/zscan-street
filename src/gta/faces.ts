import * as THREE from "three";
import { portraitImage } from "../data/portrait";
import { ZScan } from "../data/zscan";
import { snarkCells } from "../scene/snarkbody";
import { bodyGeo, Fine, headGeo } from "./snarkgeo";
import { artPixels, SLOT_NONE, slotAlloc, slotFree, SLOTS, slotWrite } from "./snarkmat";

/**
 * The zkSNARKs' looks for the game (src/gta): each one's own picture (the collection's PNG, exact:
 * not the atlas, whose JPEG smears a dark halo round every figure) read once into its 26 × 26 cells,
 * one request at a time with a pause between, so the image API is never flooded. From the cells:
 * a sculpted hood shaped to its silhouette with its face set in the opening, its picture (upscaled,
 * in a slot of the shared art atlas: snarkmat.ts) on the front; a hoodie torso; the colours the body
 * is dressed in (the top, the hood, the skin), with trousers and shoes picked by the number
 * (snarkgeo.ts makes the shapes).
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
  /** Its picture's slot in the art atlas (freed with the look). */
  slot: number;
}

/** One voxel of the bust (m): a zkSNARK is about 1.5 m on its legs. */
export const SNARK_VOX = 0.052;
/** The shoulders drawn a little narrower than the art's (its bust is cut by the picture's edges). */
const BODY_SX = 0.84;
/** The head's scale against the picture's (the bust as drawn is all head). */
const HEAD_K = 0.9;

const cells = new Map<number, Cells | null>();
/** Read from the collection's atlas (quick, all at once, a little soft): the street's own crowd. */
const quickCells = new Map<number, Cells>();
const quickAsked = new Set<number>();
/** Built looks, the most recently used last (the oldest unpinned ones are freed past a few dozen). */
const looks = new Map<number, Look>();
const pins = new Map<number, number>();
/** (no more looks kept than the atlas has slots for, with room for the stand-ins and the pinned) */
const KEEP = Math.min(320, SLOTS - 96);
function drop(id: number, l: Look) {
  l.head.dispose();
  l.body.dispose();
  slotFree(l.slot);
  looks.delete(id);
}
function trimLooks(to = KEEP) {
  if (looks.size <= to) return;
  for (const [id, l] of looks) {
    if (looks.size <= to) break;
    if (pins.get(id)) continue;
    drop(id, l);
  }
}
/** A slot for a new look's picture: a free one, or the oldest look nobody wears gives its own up. */
function takeSlot() {
  let s = slotAlloc();
  if (s !== SLOT_NONE) return s;
  for (const [id, l] of looks) {
    if (pins.get(id)) continue;
    drop(id, l);
    s = slotAlloc();
    if (s !== SLOT_NONE) return s;
  }
  for (const [k, l] of standIns) {
    if (pins.get(l.id)) continue;
    standIns.delete(k);
    l.head.dispose();
    l.body.dispose();
    slotFree(l.slot);
    s = slotAlloc();
    if (s !== SLOT_NONE) return s;
  }
  return SLOT_NONE;
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

/** (development: each look's picture as it went to the atlas, the opening — figtest.html?art) */
export const debugArt = new Map<number, { src: Int32Array; art: Int32Array; opening: { x: number; y: number; rx: number; ry: number }; hood: number; neck: number; top: number; hatEnd: number }>();

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
      const o = standIns.get(old)!;
      standIns.delete(old);
      o.head.dispose();
      o.body.dispose();
      slotFree(o.slot);
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
  const bw = bs.x1 - bs.x0 + 1;
  // the face: what is inside the hood and not the hood's colour — set back in the hood's opening
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
  // the face's cells, closed over its features' small gaps (the eyes are face too)
  const faceCells = new Uint8Array(GRID * GRID);
  for (let y = top; y <= neck; y++) for (let x = 0; x < GRID; x++) if (faceIn(x, y)) faceCells[y * GRID + x] = 1;
  const closed = new Uint8Array(faceCells);
  for (let y = top + 1; y < neck; y++)
    for (let x = 1; x < GRID - 1; x++) {
      if (faceCells[y * GRID + x] || !inHead(x, y)) continue;
      const lr = faceCells[y * GRID + x - 1] && faceCells[y * GRID + x + 1],
        ud = faceCells[(y - 1) * GRID + x] && faceCells[(y + 1) * GRID + x];
      if (lr || ud) closed[y * GRID + x] = 1;
    }
  const isFace = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID && y < GRID && closed[y * GRID + x] === 1;
  // the hood's opening: an oval round the face's cells; where the face is the hood's own colour (a
  // white face in a white hood), where a face sits in these pictures — forward and a little low
  let fx0 = GRID,
    fx1 = -1,
    fy0 = GRID,
    fy1 = -1,
    fn = 0;
  for (let y = top; y <= neck; y++)
    for (let x = 0; x < GRID; x++)
      if (isFace(x, y)) {
        fn++;
        fx0 = Math.min(fx0, x);
        fx1 = Math.max(fx1, x);
        fy0 = Math.min(fy0, y);
        fy1 = Math.max(fy1, y);
      }
  const headW = hs.x1 - hs.x0 + 1,
    headHc = neck - top + 1;
  // the eyes: the few cells of the head (under the hat, in its front two thirds) unlike its common
  // colours — the one thing every zkSNARK's face has
  const counts = new Map<number, number>();
  for (let y = top; y <= neck; y++) for (let x = 0; x < GRID; x++) if (inHead(x, y)) counts.set(at(x, y), (counts.get(at(x, y)) ?? 0) + 1);
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c0]) => c0);
  let ex0 = GRID,
    ex1 = -1,
    ey0 = GRID,
    ey1 = -1,
    en = 0;
  const eyeSet = new Set<number>();
  for (let y = Math.max(top + 1, hatEnd + 1); y <= neck - 2; y++)
    for (let x = Math.floor(hs.x0 + headW * 0.35); x <= hs.x1; x++) {
      if (!inHead(x, y)) continue;
      const c0 = at(x, y);
      if (common.some((k) => k === c0 || near(k, c0)) || near(c0, shell[y])) continue;
      eyeSet.add(y * GRID + x);
      en++;
      ex0 = Math.min(ex0, x);
      ex1 = Math.max(ex1, x);
      ey0 = Math.min(ey0, y);
      ey1 = Math.max(ey1, y);
    }
  const eyes = en >= 2 && en <= 18 && ex1 - ex0 <= headW * 0.75 && ey1 - ey0 <= 4;
  let opening =
    fn >= 10
      ? { x: (fx0 + fx1 + 1) / 2, y: (fy0 + fy1 + 1) / 2, rx: Math.min(headW * 0.42, (fx1 - fx0 + 1) / 2 + 0.7), ry: Math.min(headHc * 0.42, (fy1 - fy0 + 1) / 2 + 0.7) }
      : eyes
        ? { x: (ex0 + ex1 + 1) / 2, y: (ey0 + ey1 + 1) / 2 + 1.2, rx: Math.max(headW * 0.3, (ex1 - ex0 + 1) / 2 + 2.2), ry: Math.max(headHc * 0.3, 3.6) }
        : { x: (hs.x0 + hs.x1 + 1) / 2 + headW * 0.1, y: top + headHc * 0.58, rx: headW * 0.32, ry: headHc * 0.3 };
  // (the opening stays under a hat's band)
  if (hatEnd >= top && opening.y - opening.ry < hatEnd + 1.3) {
    const bottom0 = opening.y + opening.ry;
    const top0 = hatEnd + 1.3;
    opening = { ...opening, y: (top0 + bottom0) / 2, ry: Math.max(2.5, (bottom0 - top0) / 2) };
  }
  // a cap's visor: the hat's lowest rows reaching out past the hood below — out of the outline,
  // a peak of its own
  const rightOf = (y: number) => {
    for (let x = GRID - 1; x >= 0; x--) if (inHead(x, y)) return x;
    return -1;
  };
  let visor = false,
    hoodRight = 99;
  if (hatEnd >= top) {
    for (let y = hatEnd + 1; y <= Math.min(neck, hatEnd + 3); y++) hoodRight = Math.min(hoodRight, rightOf(y) < 0 ? 99 : rightOf(y));
    for (let y = Math.max(top, hatEnd - 1); y <= hatEnd; y++) if (rightOf(y) > hoodRight + 1) visor = true;
  }
  const headShape = (x: number, y: number) => inHead(x, y) && !(visor && y <= hatEnd && x > hoodRight + 0.5);
  // the picture for the atlas: the outline's dark line taken off (a figure in 3D has its own edge),
  // eyes that shine marked
  const art = new Int32Array(GRID * GRID).fill(-1);
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      const inside = y <= neck ? inHead(x, y) : inBody(x, y);
      if (inside) art[y * GRID + x] = at(x, y);
    }
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      if (art[i] < 0) continue;
      const edge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => (art[(y + dy) * GRID + x + dx] ?? -1) < 0 || x + dx < 0 || x + dx >= GRID);
      if (!edge) continue;
      // the neighbour toward the middle
      let best = -1;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= GRID || yy >= GRID) continue;
        const v2 = art[yy * GRID + xx];
        if (v2 >= 0 && (best < 0 || lum(v2) > lum(best))) best = v2;
      }
      if (best >= 0 && lum(art[i]) < lum(best) * 0.55) art[i] = best;
    }
  // the drawing's hood shading (its greys, its highlights, its outline) flattened to the hood's own
  // colour: a 3D hood has its own light — only the face, the eyes, a mask stand out of it. The hood's
  // palette is what its back half (the 3/4 view's far side) and its outline are drawn in.
  {
    const pal = new Map<number, number>();
    const outside = (x: number, y: number) => x < 0 || y < 0 || x >= GRID || y >= GRID || !inHead(x, y);
    for (let y = Math.max(top, hatEnd + 1); y <= neck; y++)
      for (let x = 0; x < GRID; x++) {
        if (!inHead(x, y)) continue;
        let edge = false;
        for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2 && !edge; dx++) if (outside(x + dx, y + dy)) edge = true;
        if (!edge) continue;
        pal.set(at(x, y), (pal.get(at(x, y)) ?? 0) + 1);
      }
    const hoodish = [...pal.entries()].filter(([, n]) => n >= 2).map(([c0]) => c0);
    // (a shade of the hood: its own colour lighter or darker — greys round a black hood, a highlight)
    const sat = (c0: number) => {
      const r = (c0 >> 16) & 255,
        g = (c0 >> 8) & 255,
        b = c0 & 255;
      const mx = Math.max(r, g, b),
        mn = Math.min(r, g, b);
      return mx ? (mx - mn) / mx : 0;
    };
    const dist = (a: number, b: number) => Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255));
    const shadeOfHood = (c0: number) => dist(c0, hoodCol) < 110 || (sat(c0) < 0.2 && sat(hoodCol) < 0.2 && Math.abs(lum(c0) - lum(hoodCol)) < 95);
    for (let y = Math.max(top, hatEnd + 1); y <= neck; y++)
      for (let x = 0; x < GRID; x++) {
        const i = y * GRID + x;
        if (art[i] < 0 || !inHead(x, y)) continue;
        // (never the eyes, nor a face plainly unlike its hood)
        if (eyes && eyeSet.has(i)) continue;
        if (isFace(x, y) && dist(art[i], hoodCol) > 140) continue;
        if (hoodish.includes(art[i]) || shadeOfHood(art[i])) art[i] = hoodCol;
      }
  }
  // where the picture shows on the hood: inside its opening (an oval, soft at its edge) and a hat's front
  const sm = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const artMask = (mx: number, my: number) => {
    const e = Math.hypot((mx - opening.x) / opening.rx, (my - opening.y) / opening.ry);
    const inOpening = 1 - sm(0.86, 1.0, e);
    const onHat = hatEnd >= top ? 1 - sm(hatEnd + 0.7, hatEnd + 1.2, my) : 0;
    return Math.max(inOpening, onHat);
  };
  const slot = takeSlot();
  slotWrite(slot, artPixels(art, artMask));
  if (import.meta.env?.DEV) debugArt.set(id, { src: new Int32Array(src), art, opening, hood: hoodCol, neck, top, hatEnd });
  const hood = new THREE.Color().setHex(hoodCol, THREE.SRGBColorSpace);
  const hat = hatEnd >= top ? new THREE.Color().setHex(shell[top], THREE.SRGBColorSpace) : null;
  const { geo: head } = headGeo({
    slot,
    shape: new Fine(headShape, 3),
    opening,
    top,
    neck,
    cx,
    // (the head a little smaller than the picture's: still a big-headed zkSNARK, less of a bobblehead)
    v: v * HEAD_K,
    hood,
    hat,
    hatEnd,
    visor,
  });
  // the torso: as wide as the picture's shoulders (a little narrower), down past them to a hoodie's hem
  const ext = 3;
  const halfW = (bw / 2) * v * BODY_SX;
  const H = (bottom + ext - neck) * v;
  const body = bodyGeo({
    slot,
    shape: new Fine((x, y) => inBody(x, y), 1),
    neck,
    bottom,
    ext,
    cx,
    v,
    sx: BODY_SX,
    halfW,
    H,
    cloth: new THREE.Color().setHex(cloth, THREE.SRGBColorSpace),
  });
  let h = Math.imul(id ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0) / 4294967296);
  return {
    id,
    real,
    head,
    body,
    headH: (neck - top + 1) * v * HEAD_K,
    bodyH: H,
    halfW,
    cloth,
    // (the street's look: trousers and sneakers of their own, by the number — denim, black, khaki,
    // grey or the top's own colour darker; white, black or bright trainers on a light sole)
    ...dress(rnd, cloth),
    skin,
    bh: 0.96 + rnd() * 0.08,
    slot,
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
