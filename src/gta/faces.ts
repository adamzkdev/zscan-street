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
  const shells = new Set<number>();
  for (let y = top; y <= neck; y++) shells.add(shell[y]);
  const faceXs: number[] = [];
  const hcx = (hs.x0 + hs.x1 + 1) / 2;
  for (let y = top + 2; y <= neck - 1; y++) for (let x = Math.floor(hcx) - 1; x <= hs.x1; x++) if (inHead(x, y) && !shells.has(at(x, y)) && lum(at(x, y)) > 50) faceXs.push(at(x, y));
  const skin = faceXs.length > 6 ? mode(faceXs, 0xd8b48c) : 0xd8b48c;
  // both pieces round the shoulders' middle column (the head sits where the art has it)
  const cx = (bs.x0 + bs.x1 + 1) / 2;
  const v = SNARK_VOX;
  const hw = hs.x1 - hs.x0 + 1,
    bw = bs.x1 - bs.x0 + 1;
  const head = inflate(inHead, at, shell, top, neck, cx, v, Math.max(7, Math.round(hw * 0.88)), Math.max(2.2, hw * 0.36));
  const body = inflate(inBody, at, shell, neck + 1, bottom, cx, v, Math.max(6, Math.round(Math.min(hw * 0.8, bw * 0.62))), Math.max(1.8, bw * 0.24));
  let h = Math.imul(id ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0) / 4294967296);
  return {
    id,
    real,
    head,
    body,
    headH: (neck - top + 1) * v,
    bodyH: (bottom - neck) * v,
    halfW: (bw / 2) * v,
    cloth,
    // (the street's look: trousers the clothes a shade darker, dark shoes)
    trousers: shade(cloth, 0.62),
    skin,
    shoes: 0x2a2630,
    sole: 0x4a4650,
    bh: 0.96 + rnd() * 0.08,
  };
}

/**
 * Rows y0..y1 of the art (the cells `inside`), x round column `cx`, rounded into a volume `D` voxels
 * deep in the middle and thinner toward the silhouette's edge over `R` cells (a pillow: the way a
 * head, a pair of shoulders is round). The front of each column is the art; behind it, the row's
 * hood colour. Its origin at the bottom middle, facing +z.
 */
function inflate(inside: (x: number, y: number) => boolean, at: (x: number, y: number) => number, shell: Int32Array, y0: number, y1: number, cx: number, v: number, D: number, R: number) {
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
  const zLo = new Int16Array(W * H),
    zHi = new Int16Array(W * H).fill(-1);
  for (let i = 0; i < W * H; i++) {
    if (!dist[i]) continue;
    const e = Math.min(1, (Math.min(dist[i], 99) - 0.4) / R);
    const k = Math.sqrt(Math.max(0.1, 1 - (1 - e) * (1 - e)));
    const n = Math.max(2, Math.round(D * k));
    zLo[i] = Math.floor((D - n) / 2);
    zHi[i] = zLo[i] + n - 1;
  }
  const color = (x: number, y: number, z: number): number => {
    if (x < 0 || y < 0 || x >= W || y >= H || z < 0 || z >= D) return -1;
    const i = y * W + x;
    if (zHi[i] < 0 || z < zLo[i] || z > zHi[i]) return -1;
    return z === zHi[i] ? at(x, y0 + y) : shell[y0 + y];
  };
  return greedy(color, [W, H, D], (gx, gy, gz) => [(gx - cx) * v, (H - gy) * v, (gz - D / 2) * v]);
}

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
