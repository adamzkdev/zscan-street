import * as THREE from "three";
import { portraitImage } from "../data/portrait";
import { ZScan } from "../data/zscan";
import { snarkCells } from "../scene/snarkbody";
import { bodyGeo, Fine, headGeo, lowDetail } from "./snarkgeo";
import { artPixels, SLOT_NONE, slotAlloc, slotFree, SLOTS, slotWrite } from "./snarkmat";

/**
 * The zkSNARKs' looks for the game (src/gta): each one's own picture (the collection's PNG, exact:
 * not the atlas, whose JPEG smears a dark halo round every figure) read once into its 26 × 26 cells,
 * one request at a time with a pause between, so the image API is never flooded. From the cells, the
 * zkSNARK itself in 3D, made from its picture like a vinyl figure from its drawing: its head and its
 * torso shaped to the picture's outline, the whole picture on them as it was drawn (its hood's prints
 * and patterns, its face, its mask, its eyes, its hat's logo, its chest) seen from where the painter
 * stood; its face set back in its hood in the face's own shape; a cap's peak, glasses and a halo made
 * as parts of their own; its eyes and lenses shining (glowing at night); its limbs in its own colours
 * (snarkgeo.ts makes the shapes, snarkmat.ts the one material).
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
  /** The same, far off (snarkgeo.ts lowDetail: about a fifth of the triangles; people3d.ts past ~20 m). */
  headFar: THREE.BufferGeometry;
  bodyFar: THREE.BufferGeometry;
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
function freeGeo(l: Look) {
  l.head.dispose();
  l.body.dispose();
  l.headFar.dispose();
  l.bodyFar.dispose();
}
function drop(id: number, l: Look) {
  freeGeo(l);
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
    freeGeo(l);
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
  // (figtest.html's only: a PNG of every picture read held up the street's frames for up to 3 s)
  if (import.meta.env?.DEV && (globalThis as { __figtest?: boolean }).__figtest) debugOrig.set(id, c.toDataURL());
  c.width = c.height = 0;
  keyOut(out);
  return out;
}
/** (development: the pictures as read — figtest.html's side-by-side sheets) */
export const debugOrig = new Map<number, string>();

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

/** (development: each look's picture as it went to the atlas, what was found in it — figtest.html?art) */
export const debugArt = new Map<
  number,
  {
    src: Int32Array;
    art: Int32Array;
    glow: Uint8Array;
    face: Uint8Array;
    lenses: { y0: number; y1: number; x0: number; x1: number } | null;
    halo: { x: number; y: number; w: number; col: number } | null;
    yaw: number;
    cx: number;
    neck: number;
    top: number;
    hatEnd: number;
    visor: boolean;
  }
>();

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
      freeGeo(o);
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
  // (the head's own top: a halo floats over it)
  const top0 = top;
  for (let y = top0; y <= neck; y++) {
    let any = false;
    for (let x = 0; x < GRID && !any; x++) if (inHead(x, y)) any = true;
    if (any) {
      top = y;
      break;
    }
  }
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
  // a halo: a bar of light over the head, apart from it
  let halo: { x: number; y: number; w: number; col: number } | null = null;
  if (top > top0) {
    let x0 = GRID,
      x1 = -1,
      y0 = GRID,
      y1 = -1;
    const cols: number[] = [];
    for (let y = top0; y < top; y++)
      for (let x = Math.max(0, hs.x0 - 1); x <= Math.min(GRID - 1, hs.x1 + 1); x++) {
        if (at(x, y) < 0) continue;
        // (a row of at least three: not a loose spark)
        if (!(at(x - 1, y) >= 0 || at(x + 1, y) >= 0)) continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
        cols.push(at(x, y));
      }
    if (cols.length >= 3 && x1 - x0 >= 2 && y1 - y0 <= 3) {
      // its brightest common colour
      const bright = cols.filter((k) => lum(k) >= Math.max(...cols.map(lum)) * 0.7);
      halo = { x: (x0 + x1 + 1) / 2, y: (y0 + y1 + 1) / 2, w: (x1 - x0 + 1) / 2, col: mode(bright, cols[0]) };
    }
  }
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
  // the clothes: the bottom rows' middle
  const clothXs: number[] = [];
  for (let y = Math.max(neck + 1, bottom - 2); y <= bottom; y++) for (let x = bs.x0 + 2; x <= bs.x1 - 1; x++) if (inBody(x, y)) clothXs.push(at(x, y));
  const cloth = mode(clothXs, shell[neck]);
  // a hat: the first rows another colour all along than the hood's (a band of at least two rows,
  // not the whole head)
  let hatEnd = top - 1;
  {
    const rows: number[] = [];
    for (let y = top; y <= neck; y++) rows.push(shell[y]);
    const hood = mode(rows.slice(Math.floor(rows.length * 0.55)), shell[neck]);
    const hatCol = shell[top];
    if (hatCol !== hood && !near(hatCol, hood)) {
      let y = top;
      while (y <= neck && (shell[y] === hatCol || near(shell[y], hatCol))) y++;
      if (y - top >= 2 && y <= top + (neck - top) * 0.6) {
        hatEnd = y - 1;
        // (a beanie's turned-up band, a cap's brim: a row or two of another colour still the hat's)
        for (let k = 0; k < 2 && hatEnd + 1 < neck - 4 && shell[hatEnd + 1] !== hood && !near(shell[hatEnd + 1], hood); k++) hatEnd++;
      }
    }
    for (let y = top; y <= neck; y++) shell[y] = y <= hatEnd ? hatCol : hood;
  }
  const hoodCol = shell[neck];
  const shells = new Set<number>();
  for (let y = top; y <= neck; y++) shells.add(shell[y]);
  const shellish = (c0: number) => [...shells].some((s0) => s0 === c0 || near(s0, c0));
  // the face's commonest colour (not the hood's nor the hat's, nor a shade of them)
  const faceXs: number[] = [];
  const hcx = (hs.x0 + hs.x1 + 1) / 2;
  for (let y = Math.max(top + 2, hatEnd + 2); y <= neck - 1; y++) for (let x = Math.floor(hcx) - 1; x <= hs.x1; x++) if (inHead(x, y) && !shellish(at(x, y))) faceXs.push(at(x, y));
  const faceCol = faceXs.length > 6 ? mode(faceXs, -1) : -1;
  // the face: what is inside the hood and not the hood's colour (hood all round it within a few cells)
  const faceIn = (x: number, y: number) => {
    if (!inHead(x, y) || y <= hatEnd) return false;
    const c0 = at(x, y);
    if (c0 === hoodCol || near(c0, hoodCol) || c0 === shell[y]) return false;
    let n = 0;
    for (const [dx, dy] of [
      [-3, 0],
      [3, 0],
      [0, -3],
    ])
      if (inHead(x + dx, y + dy)) n++;
    return n === 3;
  };
  // its cells, closed over its features' small gaps (the eyes are face too)
  const faceCells = new Uint8Array(GRID * GRID);
  for (let y = top; y <= neck; y++) for (let x = 0; x < GRID; x++) if (faceIn(x, y)) faceCells[y * GRID + x] = 1;
  const closed = new Uint8Array(faceCells);
  for (let pass = 0; pass < 2; pass++) {
    const prev = new Uint8Array(closed);
    for (let y = top + 1; y < neck; y++)
      for (let x = 1; x < GRID - 1; x++) {
        if (prev[y * GRID + x] || !inHead(x, y)) continue;
        const lr = prev[y * GRID + x - 1] && prev[y * GRID + x + 1],
          ud = prev[(y - 1) * GRID + x] && prev[(y + 1) * GRID + x];
        if (lr || ud) closed[y * GRID + x] = 1;
      }
  }
  // (only the largest piece of it: a stray cell of another colour on the hood is a print, not a face)
  const faceBig = piece(
    Int32Array.from(closed, (k) => (k ? 1 : -1)),
    top,
    neck,
  );
  let fn = 0,
    fx = 0,
    fy = 0;
  for (let y = top; y <= neck; y++)
    for (let x = 0; x < GRID; x++)
      if (faceBig(x, y)) {
        fn++;
        fx += x + 0.5;
        fy += y + 0.5;
      }
  // the opening: the face's piece filled across its rows and down its columns (its own outline, no
  // notches where a feature or a print cut into it)
  const fill = new Uint8Array(GRID * GRID);
  for (let y = top; y <= neck; y++) {
    let a = -1,
      b = -1;
    for (let x = 0; x < GRID; x++) if (faceBig(x, y)) ((a = a < 0 ? x : a), (b = x));
    if (a >= 0) for (let x = a; x <= b; x++) fill[y * GRID + x] = 1;
  }
  for (let x = 0; x < GRID; x++) {
    let a = -1,
      b = -1;
    for (let y = top; y <= neck; y++) if (fill[y * GRID + x]) ((a = a < 0 ? y : a), (b = y));
    if (a >= 0) for (let y = a; y <= b; y++) if (inHead(x, y)) fill[y * GRID + x] = 1;
  }
  // (a face is solid: where the "face" is a pattern on the hood — a check, a camo — half of its
  // piece is the hood's own cells between: no opening)
  {
    let own = 0;
    for (let y = top; y <= neck; y++) for (let x = 0; x < GRID; x++) if (faceBig(x, y) && faceCells[y * GRID + x]) own++;
    if (fn && own / fn < 0.62) fn = 0;
  }
  const isFace = (x: number, y: number) => fn >= 8 && x >= 0 && y >= 0 && x < GRID && y < GRID && fill[y * GRID + x] === 1;
  // glasses: rows across the face where a run of five or more cells is neither the hood nor the face
  // (frames and lenses); a cap's peak: the hat's lowest rows reaching out past the hood below
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
  // (the face's own colour from its chin: the rows over the neck, right of the middle)
  const chinXs: number[] = [];
  for (let y = neck - 3; y <= neck - 1; y++) for (let x = Math.floor(hcx); x <= hs.x1; x++) if (inHead(x, y) && !shellish(at(x, y))) chinXs.push(at(x, y));
  const chin = chinXs.length >= 3 ? mode(chinXs, faceCol) : faceCol;
  const band = (c0: number) => c0 >= 0 && c0 !== hoodCol && !near(c0, hoodCol) && c0 !== shell[top] && (chin < 0 || (c0 !== chin && !near(c0, chin)));
  const bandRows: { y: number; x0: number; x1: number }[] = [];
  for (let y = Math.max(top + 2, hatEnd + 1); y <= neck - 2; y++) {
    let best = { x0: 0, x1: -1 };
    for (let x = hs.x0; x <= hs.x1; x++) {
      if (!inHead(x, y) || !band(at(x, y))) continue;
      let e = x;
      while (e + 1 <= hs.x1 && inHead(e + 1, y) && band(at(e + 1, y))) e++;
      if (e - x > best.x1 - best.x0) best = { x0: x, x1: e };
      x = e;
    }
    if (best.x1 - best.x0 + 1 >= 5) bandRows.push({ y, ...best });
  }
  let lenses: { y0: number; y1: number; x0: number; x1: number } | null = null;
  let lensX0 = GRID,
    lensX1 = -1;
  if (bandRows.length && bandRows.length <= 4) {
    // (one block of rows; frames with lenses in them: two colours at least, not a stripe)
    const ys = bandRows.map((r) => r.y);
    const L = { y0: ys[0], y1: ys[ys.length - 1], x0: Math.min(...bandRows.map((r) => r.x0)), x1: Math.max(...bandRows.map((r) => r.x1)) };
    const inL: number[] = [];
    for (let y = L.y0; y <= L.y1; y++) for (let x = L.x0; x <= L.x1; x++) if (at(x, y) >= 0) inL.push(at(x, y));
    const frame = mode(inL, -1);
    const lensN = inL.filter((k) => k !== frame && !near(k, frame)).length;
    if (ys[ys.length - 1] - ys[0] === ys.length - 1 && lensN >= 2) {
      lenses = L;
      // (the lenses' own columns: the frame may run on to the back as a strap)
      for (let y = L.y0; y <= L.y1; y++)
        for (let x = L.x0; x <= L.x1; x++) {
          const k = at(x, y);
          if (k < 0 || k === frame || near(k, frame)) continue;
          lensX0 = Math.min(lensX0, x);
          lensX1 = Math.max(lensX1, x);
        }
    }
  }
  // the eyes: the few cells of the face (or the head, under the hat, in its front two thirds) unlike
  // its common colours
  const counts = new Map<number, number>();
  for (let y = top; y <= neck; y++) for (let x = 0; x < GRID; x++) if (inHead(x, y)) counts.set(at(x, y), (counts.get(at(x, y)) ?? 0) + 1);
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c0]) => c0);
  const headW = hs.x1 - hs.x0 + 1;
  const eyeSet = new Set<number>();
  let ex = 0,
    en = 0,
    eMin = GRID,
    eMax = -1;
  for (let y = Math.max(top + 1, hatEnd + 1); y <= neck - 2; y++)
    for (let x = Math.floor(hs.x0 + headW * 0.35); x <= hs.x1; x++) {
      if (!inHead(x, y)) continue;
      const c0 = at(x, y);
      if (common.some((k) => k === c0 || near(k, c0)) || near(c0, shell[y])) continue;
      eyeSet.add(y * GRID + x);
      ex += x + 0.5;
      en++;
      eMin = Math.min(eMin, x);
      eMax = Math.max(eMax, x);
    }
  // where it shines: its eyes and its lenses, if bright (a black eye in a pale face does not)
  const shines = (c0: number) => {
    const r = (c0 >> 16) & 255,
      g = (c0 >> 8) & 255,
      b = c0 & 255;
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0;
    return (sat > 0.45 && mx > 120) || lum(c0) > 170;
  };
  const glow = new Uint8Array(GRID * GRID);
  if (en >= 2 && en <= 24)
    for (const i of eyeSet) {
      const c0 = c[i];
      // (brighter than the face round it)
      if (shines(c0) && (faceCol < 0 || lum(c0) > lum(faceCol) + 25 || sat(c0) > sat(faceCol) + 0.3)) glow[i] = 1;
    }
  if (lenses)
    for (let y = lenses.y0; y <= lenses.y1; y++)
      for (let x = lenses.x0; x <= lenses.x1; x++) {
        const c0 = at(x, y);
        if (c0 >= 0 && shines(c0)) glow[y * GRID + x] = 1;
      }
  // the picture for the atlas: the figure (the trail gone), the outline's dark line taken off (a
  // figure in 3D has its own edge); everything else as drawn — its prints, its patterns, its shading
  const art = new Int32Array(GRID * GRID).fill(-1);
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      const inside = y <= neck ? inHead(x, y) : inBody(x, y);
      if (inside) art[y * GRID + x] = at(x, y);
    }
  // sparks of the speed trail that touch the figure (left on its hood's top, its shoulders): a cell
  // on the figure's edge, of a colour the trail has, standing alone among its neighbours (at most one
  // of its eight of that colour) takes its neighbours' colour — an outline's run of one colour stays
  {
    const trail: number[] = [];
    for (let y = top0; y <= bottom; y++)
      for (let x = 0; x < GRID; x++) {
        const c0 = src[y * GRID + x];
        if (c0 >= 0 && art[y * GRID + x] < 0 && !trail.some((t) => near(t, c0))) trail.push(c0);
      }
    const N8 = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    for (let pass = 0; pass < 2 && trail.length; pass++)
      for (let y = 0; y < GRID; y++)
        for (let x = 0; x < GRID; x++) {
          const i = y * GRID + x,
            c0 = art[i];
          if (c0 < 0 || glow[i] || !trail.some((t) => near(t, c0))) continue;
          let edge = false,
            same = 0;
          const votes = new Map<number, number>();
          for (const [dx, dy] of N8) {
            const nx = x + dx,
              ny = y + dy;
            const q = nx < 0 || ny < 0 || nx >= GRID || ny >= GRID ? -1 : art[ny * GRID + nx];
            if (q < 0) {
              if (dx === 0 || dy === 0) edge = true;
              continue;
            }
            if (near(q, c0)) same++;
            else votes.set(q, (votes.get(q) ?? 0) + 1);
          }
          if (!edge || same > 1 || !votes.size) continue;
          let best = -1,
            bn = 0;
          for (const [q, n] of votes) if (n > bn) ((bn = n), (best = q));
          if (bn >= 2) art[i] = best;
        }
  }
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      if (art[i] < 0 || glow[i]) continue;
      const edge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => x + dx < 0 || x + dx >= GRID || y + dy < 0 || y + dy >= GRID || art[(y + dy) * GRID + x + dx] < 0);
      if (!edge) continue;
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
  const slot = takeSlot();
  // (the eyes and the lenses shine; the drawing's steps of shading on cloth blended soft — a shade
  // next to a shade of itself — while what has contrast stays crisp: eyes, a mask, logos, checks,
  // camo, a skeleton's ribs)
  const softCell = new Float32Array(GRID * GRID);
  const unlike = (a: number, b: number) => {
    if (a < 0 || b < 0) return false;
    if (Math.abs(lum(a) - lum(b)) > 55) return true;
    const sa = sat(a),
      sb = sat(b);
    if (sa < 0.18 && sb < 0.18) return false;
    return Math.abs(sa - sb) > 0.3 || hueDist(a, b) > 0.07;
  };
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      if (art[i] < 0 || glow[i] || (y <= neck && isFace(x, y) && fn < 60)) continue;
      let ok = true;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        if (unlike(art[i], x + dx < 0 || x + dx >= GRID || y + dy < 0 || y + dy >= GRID ? -1 : art[(y + dy) * GRID + x + dx])) ok = false;
      softCell[i] = ok ? 1 : 0;
    }
  slotWrite(
    slot,
    artPixels(
      art,
      (mx, my) => glow[Math.min(GRID - 1, Math.floor(my)) * GRID + Math.min(GRID - 1, Math.floor(mx))],
      (mx, my) => softCell[Math.min(GRID - 1, Math.floor(my)) * GRID + Math.min(GRID - 1, Math.floor(mx))],
    ),
  );
  // the head's shape: its cells, a cap's peak and the glasses' ends that stick out cut off (they are
  // parts of their own)
  const lensRight = lenses ? Math.max(rightOf(lenses.y0 - 1), rightOf(lenses.y1 + 1)) : 99;
  const headShape = (x: number, y: number) => inHead(x, y) && !(visor && y <= hatEnd && x > hoodRight + 0.5) && !(lenses && y >= lenses.y0 && y <= lenses.y1 && x > lensRight);
  const shape = new Fine(headShape, 3);
  // the front: the face's middle (or the glasses', the eyes'), as wide round the head as it is drawn
  let fx0 = GRID,
    fx1 = -1;
  for (let y = top; y <= neck; y++)
    for (let x = 0; x < GRID; x++)
      if (isFace(x, y)) {
        fx0 = Math.min(fx0, x);
        fx1 = Math.max(fx1, x);
      }
  // (the head's own right edge at the face: not a cap's peak, not glasses sticking out)
  const edges: number[] = [];
  for (let y = Math.max(top + 1, hatEnd + 1); y <= neck - 1; y++) if (!lenses || y < lenses.y0 || y > lenses.y1) edges.push(rightOf(y) + 1);
  const headRight = edges.length ? [...edges].sort((a, b) => a - b)[Math.floor(edges.length / 2)] : hs.x1 + 1;
  const eyesOk = en >= 2 && en <= 24 && eMax - eMin + 1 <= headW * 0.75 && eMax - eMin >= 2;
  // the front: between the eyes (or the lenses), else the face's middle
  const c0 = lenses && lensX1 >= lensX0 ? (lensX0 + Math.min(lensX1 + 1, headRight)) / 2 : eyesOk ? (eMin + eMax + 1) / 2 : fn >= 8 ? (fx0 + fx1 + 1) / 2 : headRight - headW * 0.3;
  // its right (the far side, foreshortened) out to the head's edge; its left as wide, or wider where
  // the face is drawn wider (up to half as much again); a band of hood left behind it for the back
  // (both eyes, both lenses inside it)
  const feat = lenses && lensX1 >= lensX0 ? [lensX0, lensX1] : eyesOk ? [eMin, eMax] : [c0, c0];
  const fr = Math.max(2, headRight - c0, feat[1] + 1.6 - c0);
  let fl = Math.min(fr * 1.5, Math.max(fr, fn >= 8 ? c0 - fx0 : fr));
  fl = Math.max(2, c0 - feat[0] + 0.8, Math.min(fl, c0 - hs.x0 - 3.2));
  const front = { c: c0, fl, fr };
  // the face's left edge on each row
  const edge = new Float32Array(GRID).fill(c0 - fl);
  for (let y = top; y <= neck; y++)
    for (let x = 0; x < GRID; x++)
      if (isFace(x, y)) {
        edge[y] = Math.min(c0 - fl, x);
        break;
      }
  const headR = ((hs.x1 - hs.x0 + 1) / 2) * SNARK_VOX * HEAD_K * 0.94;
  const phi = Math.min(1.15, Math.max(0.55, (((fl + fr) / 2) * SNARK_VOX * HEAD_K) / headR));
  if (import.meta.env?.DEV) debugArt.set(id, { src: new Int32Array(src), art, glow, face: Uint8Array.from({ length: GRID * GRID }, (_, i) => (isFace(i % GRID, (i / GRID) | 0) ? 1 : 0)), lenses, halo, yaw: phi, cx: front.c, neck, top, hatEnd, visor });
  const v = SNARK_VOX;
  const hv = v * HEAD_K;
  const col = (k: number) => new THREE.Color().setHex(k, THREE.SRGBColorSpace);
  // the peak's colour: the cells it is drawn in
  let visorCol: THREE.Color | null = null;
  if (visor) {
    const xs: number[] = [];
    for (let y = Math.max(top, hatEnd - 1); y <= hatEnd; y++) for (let x = hoodRight + 1; x < GRID; x++) if (inHead(x, y)) xs.push(at(x, y));
    visorCol = col(mode(xs, shell[top]));
  }
  const headIn = {
    art: { slot, c: front.c, fl: front.fl, fr: front.fr, xl: hs.x0 + 1.2, edge, phi, ay: neck + 1, vy: hv },
    shape,
    face: fn >= 8 ? new Fine(isFace, 4) : null,
    faceWide: fn >= 8 ? new Fine(isFace, 9) : null,
    top,
    neck,
    v: hv,
    hatEnd,
    visor: visorCol,
    knit: hatEnd >= top && !visor,
    halo: halo ? { x: halo.x, y: halo.y, w: halo.w, col: col(halo.col) } : null,
    lenses,
  };
  const { geo: head } = headGeo(headIn);
  const { geo: headFar } = lowDetail(() => headGeo(headIn));
  // the torso: as wide as the picture's shoulders (a little narrower), down past them to a hem
  const ext = 3;
  const bw = bs.x1 - bs.x0 + 1;
  const halfW = (bw / 2) * v * BODY_SX;
  const H = (bottom + ext - neck) * v;
  const bodyIn = {
    // (the chest under the face: the picture's body turned as its head is)
    art: torsoWrap(slot, front.c, bs, neck, bottom, H / v),
    halfW,
    H,
    cloth: col(cloth),
  };
  const body = bodyGeo(bodyIn);
  const bodyFar = lowDetail(() => bodyGeo(bodyIn));
  let h = Math.imul(id ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0) / 4294967296);
  // its limbs in its own colours: sleeves of its top, hands of its face (or gloves of its top, a
  // face that is a mask or a void), trousers of its top darker, shoes of its hat, its eyes or its hood
  const eyeCols = [...glow.keys()].filter((i) => glow[i]).map((i) => c[i]);
  const accent = hatEnd >= top ? shell[top] : eyeCols.length ? mode(eyeCols, hoodCol) : -1;
  const skinOk = fn >= 8 && faceCol >= 0 && lum(faceCol) > 70 && !shines(faceCol);
  const shoes = accent >= 0 ? accent : shade(hoodCol, 0.75);
  return {
    id,
    real,
    head,
    body,
    headFar,
    bodyFar,
    headH: (neck - top + 1) * hv,
    bodyH: H,
    halfW,
    cloth,
    trousers: lum(cloth) < 45 ? 0x26262c : shade(cloth, 0.6),
    shoes,
    sole: lum(shoes) > 170 ? 0x34343a : 0xeeeeea,
    skin: skinOk ? faceCol : shade(cloth, 0.85),
    bh: 0.96 + rnd() * 0.08,
    slot,
  };
}

/** The torso's wrap: its chest under the face, as far right as the picture's shoulders go, the back from its left. */
function torsoWrap(slot: number, c: number, bs: { x0: number; x1: number }, neck: number, bottom: number, Hc: number) {
  const cc = Math.min(bs.x1 - 1, Math.max(bs.x0 + 3, c));
  const fr = Math.max(2.5, Math.min(bs.x1 + 1 - cc, (bs.x1 - bs.x0 + 1) * 0.4));
  const fl = Math.max(2.5, Math.min(fr * 1.3, cc - bs.x0 - 3));
  return { slot, c: cc, fl, fr, xl: bs.x0 + 1.2, phi: 1.05, ay: neck + 1 + Hc, vy: SNARK_VOX, last: bottom, first: neck + 1 };
}

/** How far apart two colours' hues are (0…0.5 of the wheel). */
function hueDist(a: number, b: number) {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 1 - d);
}
/** A colour's hue (0…1 round the wheel; 0 for a grey). */
function hue(c0: number) {
  const r = ((c0 >> 16) & 255) / 255,
    g = ((c0 >> 8) & 255) / 255,
    b = (c0 & 255) / 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  if (d < 1e-6) return 0;
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h / 6;
}
const sat = (c0: number) => {
  const r = (c0 >> 16) & 255,
    g = (c0 >> 8) & 255,
    b = c0 & 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b);
  return mx ? (mx - mn) / mx : 0;
};
