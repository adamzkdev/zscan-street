/**
 * A zkSNARK in 3D voxels: ZK PARTY's players (party/k3.ts Avatar), the podium, the board's crowd.
 *
 * Every zkSNARK is a 26 × 26 pixel-art bust (a hooded head over its shoulders, a speed trail on its
 * left). Here the bust is extruded into voxels: its front is the art cell for cell, a few voxels
 * deep, the sides and back in the hood's own colour (each row takes the colour just inside its
 * back edge, so a face never wraps round the head), the back edges rounded off; the trail is cut
 * at the hood. It is split at the neck (the narrowest row of the lower half) into a head and a
 * body, and given what the art leaves out: two short legs in its trousers (the clothing a shade
 * darker, as the street draws them), shoes, two arms in its sleeves with hands in its skin. Each
 * part is greedy-meshed (one quad per run of a colour) and cached per id; the same cel steps as
 * the party's toon materials, an ink outline round every part.
 *
 *   const b = makeSnarkBody(id);          // zkSNARK #id (1 … 10,000)
 *   scene.add(b.root);                    // feet at y = 0, facing +z, ~1.5 m tall
 *   b.update(dt, { speed, grounded, vy, heading });
 *   b.jump(); b.land(v); b.hit(); b.celebrate(); b.wave(); b.talk(); b.release();
 *   b.armR / b.armL (shoulders, its own right at −x), b.foreArmR/L (elbows), b.handR/L (palms), b.head
 *   b.holdArms(true) to pose the arms yourself; b.dispose()
 *
 * The art comes from ZScan's API (the NFT's own image); until it is in, the body wears a stand-in
 * hood in the id's colours, swapped in place when the picture arrives (`preloadSnarks` first, and
 * nobody sees the swap). `SnarkCrowd` draws many at once for spectators: one instanced draw per
 * zkSNARK for the head and body, one for all the arms, one for all the legs.
 */
import * as THREE from "three";
import { ZScan } from "../data/zscan";
import { portraitImage } from "../data/portrait";

const GRID = 26;
/** One voxel (m). */
export const VOX = 0.058;
/** Hips over the ground (m): the legs' length. */
const LEG = 0.34;
const HEAD_D = 9;
const BODY_D = 7;
const INK = 0x15101f;

// ---- the art as cells ----------------------------------------------------------------------------

/** 26 × 26 cells, row-major from the top: 0xRRGGBB, or −1 for nothing. */
type Cells = Int32Array;

const cellCache = new Map<number, Promise<Cells | null>>();

/** zkSNARK #id's cells (null: the picture could not be read). */
export function snarkCells(id: number): Promise<Cells | null> {
  let p = cellCache.get(id);
  if (!p) {
    p = (async () => {
      try {
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
      } catch {
        cellCache.delete(id);
        return null;
      }
    })();
    cellCache.set(id, p);
    if (cellCache.size > 160) cellCache.delete(cellCache.keys().next().value!);
  }
  return p;
}

/** The flat black round the art (black cells joined to the border) is nothing. */
function keyOut(c: Cells) {
  const black = (i: number) => c[i] >= 0 && ((c[i] >> 16) & 255) < 8 && ((c[i] >> 8) & 255) < 8 && (c[i] & 255) < 8;
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

/** A stand-in hood in the id's colours, for the moment before the art comes (or when it can't). */
function standIn(id: number): Cells {
  let h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  const r = () => ((h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0) / 4294967296);
  const hue = r();
  const hood = new THREE.Color().setHSL(hue, 0.45, 0.32).getHex();
  const face = new THREE.Color().setHSL(0.08, 0.35, 0.72).getHex();
  const eye = new THREE.Color().setHSL((hue + 0.5) % 1, 0.9, 0.62).getHex();
  const c = new Int32Array(GRID * GRID).fill(-1);
  for (let y = 6; y < 26; y++)
    for (let x = 0; x < 26; x++) {
      const head = y < 21 && x >= 9 && x <= 20 && !((y === 6 || y === 20) && (x === 9 || x === 20));
      const body = y >= 21 && x >= 7 - (y - 21) && x <= 20 + Math.min(1, y - 21);
      if (!head && !body) continue;
      let col = hood;
      if (head && y >= 9 && y <= 18 && x >= 12 && x <= 20) col = face;
      if (head && y >= 12 && y <= 13 && (x === 14 || x === 15 || x === 18 || x === 19)) col = eye;
      c[y * GRID + x] = col;
    }
  return c;
}

// ---- the model -------------------------------------------------------------------------------------

interface Model {
  head: THREE.BufferGeometry;
  body: THREE.BufferGeometry;
  /** The neck's height over the hips, and the body's half width (for the shoulders and the legs). */
  neckY: number;
  halfW: number;
  /** The front of the body (m), for what sits on the chest. */
  frontZ: number;
  headTop: number;
  cloth: number;
  trousers: number;
  skin: number;
  /** A count of the bodies using it (the cache frees the unused). */
  users: number;
  real: boolean;
}

const models = new Map<number, Model>();
const loading = new Map<number, Promise<Model>>();
const standIns = new Map<number, Model>();

const mode = (xs: number[]) => {
  const n = new Map<number, number>();
  let best = xs[0] ?? 0x808080,
    bn = 0;
  for (const x of xs) {
    const v = (n.get(x) ?? 0) + 1;
    n.set(x, v);
    if (v > bn) ((bn = v), (best = x));
  }
  return best;
};
const lum = (c: number) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);

/** The art's cells into a model: the trail cut, the neck found, the head and body meshed. */
function buildModel(cells: Cells, real: boolean): Model {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= GRID || y >= GRID ? -1 : cells[y * GRID + x]);
  // the drawn rows
  let top = GRID,
    bottom = -1;
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++)
      if (at(x, y) >= 0) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (bottom < 0) return buildModel(standIn(1), false);
  // each row's right edge; the neck: the narrowest right edge in the lower part
  const right = (y: number) => {
    for (let x = GRID - 1; x >= 0; x--) if (at(x, y) >= 0) return x;
    return -1;
  };
  let neck = bottom - 5;
  let nr = 99;
  for (let y = Math.max(top + 6, bottom - 8); y <= bottom - 3; y++) {
    const r = right(y);
    if (r >= 0 && r <= nr) ((nr = r), (neck = y));
  }
  // the trail's cut: the first column from which the rows are (nearly) all drawn
  const coreLeft = (y0: number, y1: number, k: number) => {
    const fill = (x: number) => {
      let n = 0;
      for (let y = y0; y <= y1; y++) if (at(x, y) >= 0) n++;
      return n / Math.max(1, y1 - y0 + 1);
    };
    for (let x = 0; x < GRID - 4; x++) if (fill(x) >= k && fill(x + 1) >= k && fill(x + 2) >= k && fill(x + 3) >= k) return x;
    return 0;
  };
  const hl = coreLeft(top, neck, 0.85);
  const bl = Math.min(hl, coreLeft(neck + 1, bottom, 0.8));
  const keep = (x: number, y: number) => at(x, y) >= 0 && x >= (y <= neck ? hl : bl);
  // the body's columns: its centre is the figure's
  let bx0 = GRID,
    bx1 = -1;
  for (let y = neck + 1; y <= bottom; y++)
    for (let x = 0; x < GRID; x++)
      if (keep(x, y)) {
        bx0 = Math.min(bx0, x);
        bx1 = Math.max(bx1, x);
      }
  if (bx1 < 0) ((bx0 = hl), (bx1 = Math.max(hl + 8, right(neck))));
  const cx = (bx0 + bx1 + 1) / 2;
  // each row's shell (the hood's colour just inside its back edge)
  const shell = new Int32Array(GRID).fill(0x404040);
  for (let y = top; y <= bottom; y++) {
    const x0 = y <= neck ? hl : bl;
    const xs: number[] = [];
    for (let x = x0 + 1; x <= x0 + 3; x++) if (keep(x, y)) xs.push(at(x, y));
    if (!xs.length) for (let x = x0; x < GRID && xs.length < 2; x++) if (keep(x, y)) xs.push(at(x, y));
    if (xs.length) shell[y] = mode(xs);
  }
  // the clothing (the last two rows' middle), the skin (the face: the head's commonest colour that is not its shell)
  const clothXs: number[] = [];
  for (let y = bottom - 1; y <= bottom; y++) for (let x = bx0 + 2; x <= bx1 - 1; x++) if (keep(x, y)) clothXs.push(at(x, y));
  const cloth = mode(clothXs);
  const shells = new Set<number>();
  for (let y = top; y <= neck; y++) shells.add(shell[y]);
  const faceXs: number[] = [];
  for (let y = top + 2; y <= neck - 1; y++) for (let x = Math.floor(cx); x < GRID; x++) if (keep(x, y) && !shells.has(at(x, y)) && lum(at(x, y)) > 40) faceXs.push(at(x, y));
  const skin = faceXs.length > 6 ? mode(faceXs) : lighten(cloth, 1.35);
  const trousers = lighten(cloth, 0.62);

  const head = partGeometry(keep, at, shell, top, neck, cx, HEAD_D, (neck + 1 - 0) /* rows from the hips */);
  const body = partGeometry(keep, at, shell, neck + 1, bottom, cx, BODY_D, bottom + 1);
  const neckY = (bottom - neck) * VOX;
  const g = { head, body, neckY, halfW: ((bx1 - bx0 + 1) / 2) * VOX, frontZ: (BODY_D / 2) * VOX, headTop: (bottom - top + 1) * VOX, cloth, trousers, skin, users: 0, real };
  head.computeBoundingBox();
  body.computeBoundingBox();
  head.userData.shared = body.userData.shared = true;
  return g;
}

function lighten(c: number, k: number) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)),
    g = Math.min(255, Math.round(((c >> 8) & 255) * k)),
    b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/**
 * Rows y0..y1 of the art as a voxel slab `depth` deep, x centred on `cx`, its bottom row on y = 0
 * of the hips (rows are counted from `base`: the row under the slab's bottom). The front layer is
 * the art; the layers behind take the row's shell colour; the back two are rounded off.
 */
function partGeometry(keep: (x: number, y: number) => boolean, at: (x: number, y: number) => number, shell: Int32Array, y0: number, y1: number, cx: number, depth: number, base: number) {
  const W = GRID,
    Hn = y1 - y0 + 1;
  // the distance of each cell to the nearest undrawn one (0 on the edge), capped at 3
  const edge = new Int8Array(W * Hn);
  for (let y = 0; y < Hn; y++)
    for (let x = 0; x < W; x++) {
      if (!keep(x, y0 + y)) {
        edge[y * W + x] = -1;
        continue;
      }
      let e = 3;
      for (let d = 1; d <= 3 && e === 3; d++)
        for (let k = -d; k <= d; k++)
          if (!keep(x + k, y0 + y - d) || !keep(x + k, y0 + y + d) || !keep(x - d, y0 + y + k) || !keep(x + d, y0 + y + k) || y + d >= Hn || y - d < 0) {
            e = d - 1;
            break;
          }
      edge[y * W + x] = e;
    }
  // the solid voxels and their colours (z: 0 the back … depth−1 the front)
  const color = (x: number, y: number, z: number): number => {
    if (x < 0 || x >= W || y < 0 || y >= Hn || z < 0 || z >= depth) return -1;
    const e = edge[y * W + x];
    if (e < 0) return -1;
    // (rounded back: the last layers stand in from the edges)
    if (z === 0 && e < 2) return -1;
    if (z === 1 && e < 1) return -1;
    return z === depth - 1 ? at(x, y0 + y) : shell[y0 + y];
  };
  // greedy: each face direction, slice by slice, runs of one colour merged into quads
  const pos: number[] = [],
    nor: number[] = [],
    col: number[] = [];
  const tmp = new THREE.Color();
  const dims = [W, Hn, depth];
  for (let axis = 0; axis < 3; axis++)
    for (let dir = -1; dir <= 1; dir += 2) {
      const u = (axis + 1) % 3,
        v = (axis + 2) % 3;
      const mask = new Int32Array(dims[u] * dims[v]);
      const p = [0, 0, 0],
        q = [0, 0, 0];
      q[axis] = dir;
      for (p[axis] = 0; p[axis] < dims[axis]; p[axis]++) {
        let n = 0;
        for (p[v] = 0; p[v] < dims[v]; p[v]++)
          for (p[u] = 0; p[u] < dims[u]; p[u]++, n++) {
            const a = color(p[0], p[1], p[2]);
            const b = color(p[0] + q[0], p[1] + q[1], p[2] + q[2]);
            mask[n] = a >= 0 && b < 0 ? a : -1;
          }
        n = 0;
        for (let j = 0; j < dims[v]; j++)
          for (let i = 0; i < dims[u]; ) {
            const c = mask[n];
            if (c < 0) {
              i++;
              n++;
              continue;
            }
            let w = 1;
            while (i + w < dims[u] && mask[n + w] === c) w++;
            let h = 1;
            outer: for (; j + h < dims[v]; h++)
              for (let k = 0; k < w; k++)
                if (mask[n + k + h * dims[u]] !== c) break outer;
            // the quad: at p[axis] + (dir > 0 ? 1 : 0), from (i, j) size (w, h) in (u, v)
            const o = [0, 0, 0];
            o[axis] = p[axis] + (dir > 0 ? 1 : 0);
            o[u] = i;
            o[v] = j;
            const du = [0, 0, 0],
              dv = [0, 0, 0];
            du[u] = w;
            dv[v] = h;
            const corners = [
              [o[0], o[1], o[2]],
              [o[0] + du[0], o[1] + du[1], o[2] + du[2]],
              [o[0] + du[0] + dv[0], o[1] + du[1] + dv[1], o[2] + du[2] + dv[2]],
              [o[0] + dv[0], o[1] + dv[1], o[2] + dv[2]],
            ];
            // (wound to face out: in the grid (rows counting down) the +axis face is 0-1-2; the flip of y
            // into the world mirrors every triangle, so the order is the other way round)
            const order = dir > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
            // the light baked in a little: the sides a shade darker, the back and underneath more
            const shade = axis === 2 ? (dir > 0 ? 1 : 0.8) : axis === 1 ? (dir > 0 ? 1.02 : 0.72) : 0.9;
            tmp.setHex(c, THREE.SRGBColorSpace).multiplyScalar(shade);
            for (const k of order) {
              const cc = corners[k];
              // grid → metres: x round the centre column, y up from the hips, z round the slab's middle
              pos.push((cc[0] - cx) * VOX, (base - (y1 + 1) + (Hn - cc[1])) * VOX, (cc[2] - depth / 2) * VOX);
              nor.push(axis === 0 ? dir : 0, axis === 1 ? -dir : 0, axis === 2 ? dir : 0);
              col.push(tmp.r, tmp.g, tmp.b);
            }
            for (let y = 0; y < h; y++) for (let k = 0; k < w; k++) mask[n + k + y * dims[u]] = -1;
            i += w;
            n += w;
          }
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** The model of zkSNARK #id, built once its art is in (a stand-in meanwhile: `modelNow`). */
function loadModel(id: number): Promise<Model> {
  const m = models.get(id);
  if (m) return Promise.resolve(m);
  let p = loading.get(id);
  if (!p) {
    p = snarkCells(id).then((cells) => {
      loading.delete(id);
      const mm = cells ? buildModel(cells, true) : standInModel(id);
      if (cells) models.set(id, mm);
      trim();
      return mm;
    });
    loading.set(id, p);
  }
  return p;
}
function standInModel(id: number) {
  const k = id % 24;
  let m = standIns.get(k);
  if (!m) standIns.set(k, (m = buildModel(standIn(id), false)));
  return m;
}
/** The models no body uses, beyond the 48 most recent, are freed. */
function trim() {
  if (models.size <= 48) return;
  for (const [id, m] of models) {
    if (models.size <= 48) break;
    if (m.users > 0) continue;
    m.head.dispose();
    m.body.dispose();
    models.delete(id);
  }
}

/** Fetch and build these zkSNARKs ahead (a game's four, before its intro): resolves when all are in, or after `wait` ms. */
export function preloadSnarks(ids: number[], wait = 4000): Promise<void> {
  return Promise.race([Promise.all(ids.map((id) => loadModel(id))).then(() => {}), new Promise<void>((r) => setTimeout(r, wait))]);
}

/** A zkSNARK's parts for the game's 3D street people (src/gta/people3d.ts): its head and body merged, colours, proportions. */
export interface SnarkParts {
  geo: THREE.BufferGeometry;
  cloth: number;
  trousers: number;
  skin: number;
  neckY: number;
  halfW: number;
  real: boolean;
  /** Done with it (the model cache may free it). */
  release(): void;
}
export async function snarkParts(id: number): Promise<SnarkParts> {
  const m = await loadModel(id);
  m.users++;
  const geo = mergeHeadBody(m);
  geo.computeBoundingBox();
  let done = false;
  return {
    geo,
    cloth: m.cloth,
    trousers: m.trousers,
    skin: m.skin,
    neckY: m.neckY,
    halfW: m.halfW,
    real: m.real,
    release: () => {
      if (done) return;
      done = true;
      m.users--;
      geo.dispose();
    },
  };
}
/** The body's measures (m), for limbs drawn elsewhere. */
export const SNARK_DIMS = { get LEG() { return LEG; }, get ARM_W() { return ARM_W; }, get UPPER() { return UPPER; }, get FORE() { return FORE; }, get HAND() { return HAND; }, get LEG_W() { return LEG_W; } };
/** The party's cel-shaded steps, for materials drawn elsewhere. */
export const snarkToon = () => toonSteps();

// ---- materials -------------------------------------------------------------------------------------

let steps: THREE.DataTexture | null = null;
/** The party's cel steps (three flat bands of light), as k3's toon materials have them. */
function toonSteps() {
  if (steps) return steps;
  steps = new THREE.DataTexture(new Uint8Array([105, 105, 105, 255, 186, 186, 186, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  steps.minFilter = steps.magFilter = THREE.NearestFilter;
  steps.generateMipmaps = false;
  steps.needsUpdate = true;
  return steps;
}
let inkMat: THREE.MeshBasicMaterial | null = null;
function ink() {
  if (!inkMat) {
    inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    inkMat.userData = { shared: true };
  }
  return inkMat;
}
const SHARED_BOX = new THREE.BoxGeometry(1, 1, 1);
SHARED_BOX.userData = { shared: true };

/** An ink hull round `mesh` (scaled about its geometry's middle by `t` metres a side). */
function inkHull(mesh: THREE.Mesh, t = 0.022) {
  const o = new THREE.Mesh(mesh.geometry, ink());
  o.userData.noShadow = true;
  o.raycast = () => {};
  const fit = () => {
    const g = mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox!;
    const sx = b.max.x - b.min.x || 1,
      sy = b.max.y - b.min.y || 1,
      sz = b.max.z - b.min.z || 1;
    const s = new THREE.Vector3(1 + (2 * t) / sx, 1 + (2 * t) / sy, 1 + (2 * t) / sz);
    const c = new THREE.Vector3((b.max.x + b.min.x) / 2, (b.max.y + b.min.y) / 2, (b.max.z + b.min.z) / 2);
    o.geometry = g;
    o.scale.copy(s);
    o.position.set(c.x * (1 - s.x), c.y * (1 - s.y), c.z * (1 - s.z));
  };
  fit();
  mesh.add(o);
  return fit;
}

// ---- the body --------------------------------------------------------------------------------------

/** What update() takes each frame: ground speed (m/s), on the ground or not, vertical speed, heading (rad). */
export interface MoveInput {
  speed?: number;
  turnRate?: number;
  grounded?: boolean;
  vy?: number;
  heading?: number;
  [k: string]: unknown;
}

/** The motion's state the games read and set (k3's Avatar.angry, the faces some games ask for). */
export class SnarkMotion {
  angry = false;
  /** A face asked for: 2 happy, 3 surprised, 4 angry, 7 hurt (the head reacts). */
  expr = 0;
  /** Sitting: 0 standing; else how far below the seat the floor is (m). */
  sit = 0;
  /** Stride phase (0…1). */
  phase = Math.random();
  t = Math.random() * 10;
  run = 0;
  air = 0;
  vy = 0;
  squash = 0;
  squashV = 0;
  jumpT = -1;
  hitT = 9;
  hitSide = 1;
  spinT = -1;
  cheerFor = 0;
  waveFor = 0;
  talkFor = 0;
  lean = 0;
  bank = 0;
  lastHeading: number | null = null;
  celebrate(s = 2.2) {
    this.cheerFor = Math.max(this.cheerFor, s);
  }
  wave(s = 1.6) {
    this.waveFor = Math.max(this.waveFor, s);
  }
  talk(s = 2) {
    this.talkFor = Math.max(this.talkFor, s);
  }
  hit() {
    this.hitT = 0;
    this.hitSide = Math.random() < 0.5 ? -1 : 1;
  }
  jump() {
    this.jumpT = 0;
    this.squashV -= 3;
  }
  land(v = 4) {
    this.squashV -= Math.min(9, v * 0.9);
  }
  release() {
    this.spinT = 0;
  }
}

export interface SnarkBody {
  /** Feet at y = 0, facing +z. */
  readonly root: THREE.Group;
  readonly id: number;
  /** For the games that dress a body by its kind (Z-BALL CUP's jerseys). */
  readonly look: { species: "snark" };
  /** The head's pivot, at the neck. */
  readonly head: THREE.Object3D;
  /** To the top of the head, about (m). */
  readonly height: number;
  readonly armR: THREE.Object3D;
  readonly armL: THREE.Object3D;
  readonly foreArmR: THREE.Object3D;
  readonly foreArmL: THREE.Object3D;
  readonly handR: THREE.Object3D;
  readonly handL: THREE.Object3D;
  /** The chest (bones[1]: where a jersey goes; its origin at the hips) and its size. */
  readonly chest: { w: number; d: number; h: number };
  /** The head's box in the head's own frame (its origin at the neck): for a headband, a hat. */
  readonly headBox: THREE.Box3;
  readonly puppet: { motion: SnarkMotion; rig: { bones: THREE.Object3D[] } };
  holdArms(on: boolean): void;
  update(dt: number, move?: number | MoveInput): void;
  talk(seconds?: number): void;
  hit(): void;
  jump(): void;
  land(fallSpeed?: number): void;
  release(): void;
  celebrate(seconds?: number): void;
  wave(seconds?: number): void;
  setSelected(on: boolean): void;
  dispose(): void;
}

const ARM_W = 3 * VOX,
  UPPER = 4 * VOX,
  FORE = 3 * VOX,
  HAND = 2 * VOX;
const LEG_W = 3 * VOX;

function limb(color: number, w: number, h: number, d: number, y: number, mat: THREE.Material) {
  const m = new THREE.Mesh(SHARED_BOX, mat);
  m.scale.set(w, h, d);
  m.position.y = y - h / 2;
  m.raycast = () => {};
  m.userData.limbColor = color;
  // (its ink: a box's hull is the box a little bigger)
  const o = new THREE.Mesh(SHARED_BOX, ink());
  o.scale.set(1 + 0.04 / w, 1 + 0.04 / h, 1 + 0.04 / d);
  o.userData.noShadow = true;
  o.raycast = () => {};
  m.add(o);
  return m;
}

/** zkSNARK #id's body (see the top of the file). */
export function makeSnarkBody(id: number): SnarkBody {
  const root = new THREE.Group();
  root.name = "snark";
  const motion = new SnarkMotion();
  // a material of its own (its emissive says angry or selected), the shared colours in the vertices
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonSteps() });
  const limbMats = { cloth: new THREE.MeshToonMaterial({ gradientMap: toonSteps() }), trousers: new THREE.MeshToonMaterial({ gradientMap: toonSteps() }), skin: new THREE.MeshToonMaterial({ gradientMap: toonSteps() }), shoe: new THREE.MeshToonMaterial({ color: 0x2a2630, gradientMap: toonSteps() }) };
  const hips = new THREE.Object3D();
  hips.position.y = LEG;
  root.add(hips);
  const chest = new THREE.Object3D();
  hips.add(chest);
  const bodyMesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  bodyMesh.raycast = () => {};
  chest.add(bodyMesh);
  const neck = new THREE.Object3D();
  chest.add(neck);
  const headMesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  headMesh.raycast = () => {};
  neck.add(headMesh);
  const fitBody = inkHull(bodyMesh, 0.024);
  const fitHead = inkHull(headMesh, 0.026);
  // arms: shoulder → upper arm, elbow → forearm and hand (its own right at −x)
  const arm = (side: number) => {
    const sh = new THREE.Object3D();
    const up = limb(0, ARM_W, UPPER, ARM_W, 0, limbMats.cloth);
    sh.add(up);
    const el = new THREE.Object3D();
    el.position.y = -UPPER;
    sh.add(el);
    el.add(limb(0, ARM_W * 0.95, FORE, ARM_W * 0.95, 0, limbMats.cloth));
    el.add(limb(0, ARM_W * 1.05, HAND, ARM_W * 1.05, -FORE, limbMats.skin));
    const hand = new THREE.Object3D();
    hand.position.y = -FORE - HAND * 0.6;
    el.add(hand);
    chest.add(sh);
    sh.userData.side = side;
    return { sh, el, hand };
  };
  const R = arm(-1),
    L = arm(1);
  // legs: hip → leg and shoe
  const leg = (side: number) => {
    const hp = new THREE.Object3D();
    hp.add(limb(0, LEG_W, LEG - VOX, LEG_W, 0, limbMats.trousers));
    const shoe = limb(0, LEG_W * 1.1, VOX * 1.2, LEG_W * 1.45, -(LEG - VOX), limbMats.shoe);
    shoe.position.z = LEG_W * 0.2;
    hp.add(shoe);
    hips.add(hp);
    hp.userData.side = side;
    return hp;
  };
  const legR = leg(-1),
    legL = leg(1);
  const chestDims = { w: 0.5, d: BODY_D * VOX, h: 0.3 };
  const headBox = new THREE.Box3();
  let model: Model | null = null;
  let disposed = false;
  let held = false;
  const wear = (m: Model) => {
    if (disposed) return;
    if (model && model !== m) model.users--;
    model = m;
    m.users++;
    bodyMesh.geometry = m.body;
    headMesh.geometry = m.head;
    fitBody();
    fitHead();
    neck.position.y = m.neckY;
    limbMats.cloth.color.setHex(m.cloth, THREE.SRGBColorSpace);
    limbMats.trousers.color.setHex(m.trousers, THREE.SRGBColorSpace);
    limbMats.skin.color.setHex(m.skin, THREE.SRGBColorSpace);
    const sx = Math.max(m.halfW * 0.92, 0.2);
    for (const a of [R, L]) a.sh.position.set(a.sh.userData.side * (sx + ARM_W * 0.5), m.neckY - VOX * 1.2, 0);
    const lx = Math.min(Math.max(m.halfW * 0.42, LEG_W * 0.75), m.halfW - LEG_W * 0.5);
    for (const l of [legR, legL]) l.position.set(l.userData.side * lx, 0, 0);
    chestDims.w = m.halfW * 2;
    chestDims.d = m.frontZ * 2;
    chestDims.h = m.neckY;
    headBox.copy(m.head.boundingBox!);
  };
  const now = models.get(id);
  wear(now ?? standInModel(id));
  if (!now) void loadModel(id).then((m) => m.real && wear(m));
  const bones = [hips, chest, neck, R.sh, R.el, L.sh, L.el, legR, legR, legL, legL, hips, legR, legL];
  const height = LEG + (model as Model | null)!.headTop;

  const update = (dt: number, move: number | MoveInput = 0) => {
    const inp: MoveInput = typeof move === "number" ? { speed: move, grounded: true } : move;
    const m = motion;
    dt = Math.min(dt, 0.1);
    m.t += dt;
    const speed = Math.max(0, inp.speed ?? 0);
    const grounded = inp.grounded !== false;
    // (its own scale: a body drawn twice as big strides half as often)
    root.updateWorldMatrix(true, false);
    const e = root.matrixWorld.elements;
    const scale = Math.hypot(e[0], e[1], e[2]) || 1;
    const run = Math.min(1, speed / 6);
    m.run += (run - m.run) * Math.min(1, dt * 10);
    m.air += ((grounded ? 0 : 1) - m.air) * Math.min(1, dt * 12);
    if (grounded) m.phase = (m.phase + (speed / scale) * dt * 0.95) % 1;
    // turning: a bank into the turn
    if (inp.heading !== undefined) {
      if (m.lastHeading !== null && dt > 0) {
        let d = inp.heading - m.lastHeading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        m.bank += (THREE.MathUtils.clamp((-d / dt) * 0.05 * m.run, -0.3, 0.3) - m.bank) * Math.min(1, dt * 6);
      }
      m.lastHeading = inp.heading;
    }
    // squash and stretch: a spring
    m.squashV += (-m.squash * 180 - m.squashV * 16) * dt;
    m.squash += m.squashV * dt;
    if (m.jumpT >= 0) {
      m.jumpT += dt;
      if (m.jumpT > 0.5) m.jumpT = -1;
    }
    const vy = inp.vy ?? 0;
    m.hitT += dt;
    m.cheerFor = Math.max(0, m.cheerFor - dt);
    m.waveFor = Math.max(0, m.waveFor - dt);
    m.talkFor = Math.max(0, m.talkFor - dt);
    const st = Math.sin(m.phase * Math.PI * 2);
    const stride = (0.35 + 0.55 * m.run) * (1 - m.air) * Math.min(1, speed * 1.5);
    // the hips: a bob on each step, lower in a squash, the lean forward when running
    const bob = Math.abs(st) * 0.05 * Math.min(1, speed) * (1 - m.air);
    const cheer = m.cheerFor > 0 ? Math.abs(Math.sin(m.t * 9)) * 0.12 : 0;
    const sit = m.sit > 0 ? m.sit : 0;
    hips.position.y = LEG + bob + cheer - Math.max(0, m.squash) * 0.0 - sit;
    const sq = THREE.MathUtils.clamp(m.squash, -0.35, 0.3) + (m.air > 0.5 ? THREE.MathUtils.clamp(vy * 0.012, -0.08, 0.1) : 0);
    hips.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    m.lean += (0.16 * m.run * (1 - m.air) - m.lean) * Math.min(1, dt * 8);
    let rx = m.lean,
      rz = m.bank;
    // a hit: a flinch back and a wobble
    if (m.hitT < 0.55) {
      const k = 1 - m.hitT / 0.55;
      rx -= 0.45 * k * k;
      rz += Math.sin(m.hitT * 38) * 0.18 * k * m.hitSide;
    }
    if (m.angry || m.expr === 4) rz += Math.sin(m.t * 30) * 0.03;
    chest.rotation.set(rx, 0, rz);
    // the spin (letting go of a rope, a fever pose)
    if (m.spinT >= 0) {
      m.spinT += dt;
      chest.rotation.y = Math.min(1, m.spinT / 0.55) * Math.PI * 2;
      if (m.spinT > 0.55) ((m.spinT = -1), (chest.rotation.y = 0));
    }
    // the head: counters the bob, nods when talking, looks up when cheering, a pop when surprised
    let hx = -m.lean * 0.5 + (m.talkFor > 0 ? Math.sin(m.t * 14) * 0.1 : 0) - (m.cheerFor > 0 ? 0.25 : 0);
    if (m.expr === 7) hx += 0.18;
    neck.rotation.set(hx, m.angry || m.expr === 4 ? Math.sin(m.t * 22) * 0.08 : 0, -m.bank * 0.5);
    const pop = m.expr === 3 ? 1.06 : 1;
    neck.scale.setScalar(pop);
    // the legs: a stride, tucked in the air, forward when sitting
    if (sit > 0) {
      legR.rotation.set(-1.45, 0, 0.05);
      legL.rotation.set(-1.45, 0, -0.05);
    } else {
      const tuck = m.air * (vy > 0 ? 0.7 : 0.35);
      legR.rotation.set(st * stride - tuck, 0, 0);
      legL.rotation.set(-st * stride - tuck * 0.6, 0, 0);
    }
    // the arms (unless a game holds them): a swing against the legs, up in the air, a cheer, a wave
    if (!held) {
      let ar = -st * stride * 0.9,
        al = st * stride * 0.9,
        zr = 0.12,
        zl = -0.12,
        er = -0.25 - m.run * 0.6,
        el = -0.25 - m.run * 0.6;
      if (m.air > 0.05) {
        ar = THREE.MathUtils.lerp(ar, -2.4, m.air * 0.8);
        al = THREE.MathUtils.lerp(al, -2.4, m.air * 0.8);
        zr = THREE.MathUtils.lerp(zr, -0.5, m.air);
        zl = THREE.MathUtils.lerp(zl, 0.5, m.air);
      }
      if (m.hitT < 0.55) {
        const k = 1 - m.hitT / 0.55;
        ar -= 1.6 * k;
        al -= 1.6 * k;
        zr -= 0.6 * k;
        zl += 0.6 * k;
      }
      if (m.cheerFor > 0) {
        const w = Math.sin(m.t * 12);
        ar = -2.9 + w * 0.2;
        al = -2.9 - w * 0.2;
        zr = -0.35;
        zl = 0.35;
        er = el = -0.2;
      } else if (m.waveFor > 0) {
        ar = -2.7;
        zr = -0.35 + Math.sin(m.t * 11) * 0.45;
        er = -0.5;
      }
      if (m.talkFor > 0 && m.cheerFor <= 0 && m.waveFor <= 0) el = -1.1 + Math.sin(m.t * 7) * 0.4;
      R.sh.rotation.set(ar, 0, zr);
      L.sh.rotation.set(al, 0, zl);
      R.el.rotation.set(er, 0, 0);
      L.el.rotation.set(el, 0, 0);
    }
  };
  const body: SnarkBody = {
    root,
    id,
    look: { species: "snark" },
    head: neck,
    height,
    armR: R.sh,
    armL: L.sh,
    foreArmR: R.el,
    foreArmL: L.el,
    handR: R.hand,
    handL: L.hand,
    chest: chestDims,
    headBox,
    puppet: { motion, rig: { bones } },
    holdArms(on) {
      held = on;
    },
    update,
    talk: (s = 2) => motion.talk(s),
    hit: () => motion.hit(),
    jump: () => motion.jump(),
    land: (v = 4) => motion.land(v),
    release: () => motion.release(),
    celebrate: (s = 2.2) => motion.celebrate(s),
    wave: (s = 1.6) => motion.wave(s),
    setSelected(on) {
      mat.emissive.setHex(on ? 0x2a2a2a : 0x000000);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (model) model.users--;
      root.parent?.remove(root);
      mat.dispose();
      for (const m of Object.values(limbMats)) m.dispose();
    },
  };
  update(0, 0);
  return body;
}

// ---- the crowd ---------------------------------------------------------------------------------------

/** A spectator of a SnarkCrowd: set its place, call its motions; the crowd poses it. */
export class CrowdSnark {
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  scale = 1;
  readonly motion = new SnarkMotion();
  constructor(
    readonly id: number,
    readonly slot: number,
  ) {}
}

/**
 * Many zkSNARKs at once, for the stands and the board's villagers: one instanced draw per zkSNARK
 * (its head and body together) and its ink, one for every arm, one for every leg. They cheer, wave,
 * hop, talk and turn; they don't walk.
 */
export class SnarkCrowd {
  readonly group = new THREE.Group();
  private kinds = new Map<number, { mesh: THREE.InstancedMesh | null; inkMesh: THREE.InstancedMesh | null; members: CrowdSnark[]; model: Model | null }>();
  private members: CrowdSnark[] = [];
  private arms: THREE.InstancedMesh | null = null;
  private legs: THREE.InstancedMesh | null = null;
  private mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonSteps() });
  private limbMat = new THREE.MeshToonMaterial({ gradientMap: toonSteps() });
  private built = false;
  private m = new THREE.Matrix4();
  private m2 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(parent: THREE.Object3D) {
    this.group.name = "snark-crowd";
    parent.add(this.group);
  }

  /** A spectator (call before build()). */
  add(id: number, x: number, y: number, z: number, yaw: number, scale = 1) {
    const c = new CrowdSnark(id, this.members.length);
    Object.assign(c, { x, y, z, yaw, scale });
    this.members.push(c);
    let k = this.kinds.get(id);
    if (!k) this.kinds.set(id, (k = { mesh: null, inkMesh: null, members: [], model: null }));
    k.members.push(c);
    return c;
  }

  /** The meshes, once every spectator is in (their art loads behind: a stand-in until then). */
  build() {
    if (this.built) return;
    this.built = true;
    const n = this.members.length;
    if (!n) return;
    for (const [id, k] of this.kinds) {
      const put = (m: Model) => {
        if (k.mesh) {
          k.mesh.removeFromParent();
          k.inkMesh?.removeFromParent();
          k.mesh.dispose();
          k.inkMesh?.dispose();
        }
        if (k.model) k.model.users--;
        k.model = m;
        m.users++;
        // the head on the body (the neck in place): one geometry
        const g = mergeHeadBody(m);
        const mesh = new THREE.InstancedMesh(g, this.mat, k.members.length);
        mesh.frustumCulled = false;
        mesh.raycast = () => {};
        const inkMesh = new THREE.InstancedMesh(g, ink(), k.members.length);
        inkMesh.frustumCulled = false;
        inkMesh.userData.noShadow = true;
        inkMesh.raycast = () => {};
        this.group.add(mesh, inkMesh);
        k.mesh = mesh;
        k.inkMesh = inkMesh;
        for (const c of k.members) {
          const a = c.slot * 2;
          this.arms?.setColorAt(a, this.c.setHex(m.cloth, THREE.SRGBColorSpace));
          this.arms?.setColorAt(a + 1, this.c);
          this.legs?.setColorAt(a, this.c.setHex(m.trousers, THREE.SRGBColorSpace));
          this.legs?.setColorAt(a + 1, this.c);
        }
        if (this.arms?.instanceColor) this.arms.instanceColor.needsUpdate = true;
        if (this.legs?.instanceColor) this.legs.instanceColor.needsUpdate = true;
      };
      this.arms ??= this.limbs(n * 2);
      this.legs ??= this.limbs(n * 2);
      const now = models.get(id);
      put(now ?? standInModel(id));
      if (!now) void loadModel(id).then((m) => m.real && this.group.parent && put(m));
    }
    this.update(0);
  }

  private limbs(count: number) {
    const mesh = new THREE.InstancedMesh(SHARED_BOX, this.limbMat, count);
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    mesh.setColorAt(0, this.c.set(0xffffff));
    this.group.add(mesh);
    return mesh;
  }

  /** Pose every spectator (their motions advanced by dt). */
  update(dt: number) {
    if (!this.built) return;
    const { m, m2, q, e, v, s } = this;
    for (const [, k] of this.kinds) {
      if (!k.mesh || !k.model) continue;
      const md = k.model;
      k.members.forEach((c, i) => {
        const mo = c.motion;
        mo.t += dt;
        mo.cheerFor = Math.max(0, mo.cheerFor - dt);
        mo.waveFor = Math.max(0, mo.waveFor - dt);
        mo.talkFor = Math.max(0, mo.talkFor - dt);
        const hop = mo.cheerFor > 0 ? Math.abs(Math.sin(mo.t * 9)) * 0.14 : 0;
        const nod = mo.talkFor > 0 ? Math.sin(mo.t * 12) * 0.05 : 0;
        // the body: at its place, turned, hopping
        e.set(nod, c.yaw, 0, "YXZ");
        q.setFromEuler(e);
        m.compose(v.set(c.x, c.y + (LEG + hop) * c.scale, c.z), q, s.setScalar(c.scale));
        k.mesh!.setMatrixAt(i, m);
        k.inkMesh!.setMatrixAt(i, m2.copy(m).multiply(inkScale(md)));
        // the arms: down, up in a cheer, one waving
        for (const side of [-1, 1]) {
          const a = c.slot * 2 + (side < 0 ? 0 : 1);
          let rx = -0.1,
            rz = side * -0.12;
          if (mo.cheerFor > 0) ((rx = -2.9 + Math.sin(mo.t * 12 + side) * 0.2), (rz = side * 0.35));
          else if (mo.waveFor > 0 && side < 0) ((rx = -2.7), (rz = -0.35 + Math.sin(mo.t * 11) * 0.45));
          const sx = side * (Math.max(md.halfW * 0.92, 0.2) + ARM_W * 0.5);
          const pivot = new THREE.Matrix4().compose(v.set(sx, md.neckY - VOX * 1.2, 0), q.setFromEuler(e.set(rx, 0, rz)), s.set(1, 1, 1));
          const arm = new THREE.Matrix4().compose(v.set(0, -(UPPER + FORE) / 2, 0), q.identity(), s.set(ARM_W, UPPER + FORE + HAND, ARM_W));
          this.arms!.setMatrixAt(a, m2.copy(m).multiply(pivot).multiply(arm));
          const lx = side * Math.min(Math.max(md.halfW * 0.42, LEG_W * 0.75), md.halfW - LEG_W * 0.5);
          const lg = new THREE.Matrix4().compose(v.set(lx, -LEG / 2 - hop * 0.3, 0), q.identity(), s.set(LEG_W, LEG, LEG_W * 1.1));
          this.legs!.setMatrixAt(a, m2.copy(m).multiply(lg));
        }
      });
      k.mesh.instanceMatrix.needsUpdate = true;
      k.inkMesh!.instanceMatrix.needsUpdate = true;
    }
    if (this.arms) this.arms.instanceMatrix.needsUpdate = true;
    if (this.legs) this.legs.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const [, k] of this.kinds) {
      if (k.model) k.model.users--;
      k.mesh?.dispose();
      k.inkMesh?.dispose();
      k.mesh?.geometry.dispose();
    }
    this.arms?.dispose();
    this.legs?.dispose();
    this.mat.dispose();
    this.limbMat.dispose();
    this.group.removeFromParent();
    this.kinds.clear();
    this.members = [];
  }
}

const inkScales = new WeakMap<Model, THREE.Matrix4>();
/** The crowd's ink hull: the merged body scaled a little about its middle. */
function inkScale(m: Model) {
  let s = inkScales.get(m);
  if (!s) {
    const b = new THREE.Box3().copy(m.body.boundingBox!).union(m.head.boundingBox!.clone().translate(new THREE.Vector3(0, m.neckY, 0)));
    const size = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
    const k = new THREE.Vector3(1 + 0.05 / size.x, 1 + 0.05 / size.y, 1 + 0.05 / size.z);
    s = new THREE.Matrix4().makeTranslation(c.x * (1 - k.x), c.y * (1 - k.y), c.z * (1 - k.z)).multiply(new THREE.Matrix4().makeScale(k.x, k.y, k.z));
    inkScales.set(m, s);
  }
  return s;
}

function mergeHeadBody(m: Model) {
  const head = m.head.clone().translate(0, m.neckY, 0);
  const parts = [m.body, head];
  const g = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "color"]) {
    const arrs = parts.map((p) => p.getAttribute(name).array as Float32Array);
    const out = new Float32Array(arrs.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrs) (out.set(a, o), (o += a.length));
    g.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  head.dispose();
  return g;
}
