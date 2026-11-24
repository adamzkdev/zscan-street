import * as THREE from "three";
import { maps } from "../real/tex";
import { treeShape } from "../real/trees";
import { C, hash, palette, rand, VoxelModel, type Paint } from "../voxel/model";

/**
 * The forest's plants as voxel models, instanced: coast redwoods (three heights), Douglas firs,
 * bigleaf maples and alders turning gold and red, coast live oaks, a few grey snags, and the
 * undergrowth (sword ferns, huckleberry, mossy boulders, fallen logs, toadstools). Each kind has a
 * full model for up close and a half-resolution one for afar; instances move between the two as
 * the viewer moves (only the near ones cast shadows). Canopies sway a little in the wind.
 */

export type Species = "redwood" | "redwoodTall" | "redwoodGiant" | "fir" | "maple" | "alder" | "oak" | "snag" | "genesis" | "fern" | "fern2" | "shrub" | "shrub2" | "rock" | "rock2" | "log" | "shroom" | "scrub";

const pick = (ids: number[]): Paint => (x, y, z) => ids[Math.floor(hash(x, y, z, 5) * ids.length)];
const ids = (hexes: string[]) => hexes.map((h) => C(h));
/** Foliage colours: meshed smooth (needles, leaves, fronds). */
const leafIds = (hexes: string[]) => hexes.map((h) => palette.leaf(C(h)));

/** Redwood bark: deep rust with vertical furrows. */
function bark(seed: number): Paint {
  const p = ids(["#7a3a24", "#8a452c", "#6a3020", "#93502f", "#5e2a1c"]);
  return (x, y, z) => p[Math.floor(hash(x, Math.floor(y / 5), z, seed) * p.length)];
}

function redwood(seed: number, H: number, R: number, trunkR: number): VoxelModel {
  const r = rand(seed);
  const W = Math.ceil(R * 2 + 6) & ~1;
  const m = new VoxelModel(W, H + 2, W);
  const cx = W / 2,
    cz = W / 2;
  const b = bark(seed);
  // trunk: flared buttress at the foot, tapering up
  for (let y = 0; y < H - 2; y++) {
    const t = y / H;
    const rr = trunkR * (1 - t * 0.6) + Math.max(0, 4 - y) * 0.55;
    m.cylinder(cx, y, cz, rr, 1, b);
  }
  // dark blue-green sprays, lit tips; the crown is columnar and clumpy, the lower trunk bare
  const leaf = leafIds(["#244a26", "#2b5529", "#1f4022", "#30602e", "#1a3a1e"]);
  const tip = ids(["#3e7434", "#467e38", "#386c32"]);
  const put = (x: number, y: number, z: number, lit: boolean) => {
    const p = lit ? tip : leaf;
    m.set(x, y, z, p[Math.floor(hash(Math.round(x), Math.round(y), Math.round(z), seed) * p.length)]);
  };
  const y0 = Math.floor(H * (0.34 + r() * 0.08));
  // a slim core of foliage hugging the trunk all the way up
  for (let y = y0; y < H; y++) {
    const cr = 1.6 + (1 - (y - y0) / (H - y0)) * 1.2;
    for (let z = Math.floor(cz - cr - 1); z <= cz + cr + 1; z++)
      for (let x = Math.floor(cx - cr - 1); x <= cx + cr + 1; x++)
        if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < cr * (0.7 + 0.4 * hash(x, y, z, seed + 4))) put(x, y, z, hash(x, y, z, seed + 8) > 0.85);
  }
  // branch sprays: flat, drooping clumps reaching out at every height, longest a third of the way up
  for (let y = y0; y < H - 3; y += 2) {
    const t = (y - y0) / (H - y0);
    const reach = R * Math.min(1, 0.55 + 0.9 * (1 - t)) * Math.pow(1 - t, 0.35);
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const L = reach * (0.55 + r() * 0.55);
      const dx = Math.cos(a),
        dz = Math.sin(a);
      for (let k = 1; k <= L; k += 0.7) {
        const f = k / L;
        const w = 1.1 + Math.sin(f * Math.PI) * 1.6;
        const yy = y - f * f * 1.6;
        for (let u = -w; u <= w; u += 0.8)
          for (let v = 0; v < (f < 0.8 ? 2 : 1); v++) {
            const x = cx + dx * k - dz * u,
              z = cz + dz * k + dx * u;
            if (hash(Math.round(x), Math.round(yy), Math.round(z), seed + 11) < 0.12) continue;
            put(x, yy - v, z, v === 0 && (f > 0.6 || hash(Math.round(x), y, Math.round(z), seed + 2) > 0.75));
          }
      }
    }
  }
  // the leader: a narrow spire
  for (let y = H - 6; y < H + 2; y++) {
    const cr = y < H - 3 ? 1.6 : 0.9;
    for (let z = Math.floor(cz - 2); z <= cz + 2; z++) for (let x = Math.floor(cx - 2); x <= cx + 2; x++) if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < cr) put(x, y, z, true);
  }
  return m;
}

function fir(seed: number, H: number, R: number): VoxelModel {
  const W = Math.ceil(R * 2 + 4) & ~1;
  const m = new VoxelModel(W, H + 2, W);
  const cx = W / 2,
    cz = W / 2;
  m.box(cx - 1, 0, cz - 1, cx + 1, H - 3, cz + 1, pick(ids(["#4a3428", "#55392a", "#3e2c22"])));
  const leaf = leafIds(["#1f4436", "#26503e", "#1a3a2e", "#2c5a44"]);
  const y0 = Math.floor(H * 0.18);
  for (let y = y0; y < H; y++) {
    const t = (y - y0) / (H - y0);
    const tier = (y - y0) % 3;
    const rr = (R * (1 - t) + 1) * (tier === 0 ? 1 : tier === 1 ? 0.72 : 0.5);
    for (let z = Math.floor(cz - rr - 1); z <= cz + rr + 1; z++)
      for (let x = Math.floor(cx - rr - 1); x <= cx + rr + 1; x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d <= rr * (0.8 + 0.25 * hash(x, y, z, seed))) m.set(x, y, z, leaf[Math.floor(hash(x, y, z, seed + 2) * leaf.length)]);
      }
  }
  m.box(cx - 1, H - 1, cz - 1, cx, H + 2, cz, leaf[3]);
  return m;
}

/** A broadleaf: forked trunk, a cloud of blobs in its colours. */
function broadleaf(seed: number, H: number, R: number, leaves: string[], trunk: string[], fallen?: string): VoxelModel {
  const r = rand(seed);
  const W = Math.ceil(R * 2 + 6) & ~1;
  const m = new VoxelModel(W, H + 3, W);
  const cx = W / 2,
    cz = W / 2;
  const tk = pick(ids(trunk));
  const trunkH = Math.floor(H * 0.45);
  m.box(cx - 1, 0, cz - 1, cx + 1, trunkH, cz + 1, tk);
  m.box(cx - 2, 0, cz - 1, cx + 2, 2, cz + 1, tk);
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    for (let k = 0; k < R * 0.7; k++) m.set(cx + Math.cos(a) * k, trunkH - 2 + k * 0.8, cz + Math.sin(a) * k, tk);
  }
  const lp = leafIds(leaves);
  const paint: Paint = (x, y, z) => lp[Math.floor(hash(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2), seed) * lp.length)];
  const top = trunkH + R * 0.55;
  m.blob(cx, top, cz, R * 0.75, paint, 0.3, seed);
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    m.blob(cx + Math.cos(a) * R * 0.55, top - 1 + r() * R * 0.5, cz + Math.sin(a) * R * 0.55, R * (0.42 + r() * 0.18), paint, 0.35, seed + i);
  }
  if (fallen) {
    const f = C(fallen);
    for (let i = 0; i < 26; i++) m.set(Math.floor(cx - R + r() * R * 2), 0, Math.floor(cz - R + r() * R * 2), f);
  }
  return m;
}

function snag(seed: number, H: number): VoxelModel {
  const r = rand(seed);
  const m = new VoxelModel(14, H + 1, 14);
  const g = pick(ids(["#8a8478", "#7a746a", "#9a9488", "#6a645c"]));
  for (let y = 0; y < H; y++) m.cylinder(7, y, 7, 2.2 - (y / H) * 1.2 + Math.max(0, 3 - y) * 0.5, 1, g);
  for (let i = 0; i < 5; i++) {
    const y = Math.floor(H * (0.4 + r() * 0.5));
    const a = r() * Math.PI * 2;
    for (let k = 1; k < 5; k++) m.set(7 + Math.cos(a) * k, y + k * 0.5, 7 + Math.sin(a) * k, g);
  }
  return m;
}

function fern(seed: number, big: boolean): VoxelModel {
  const r = rand(seed);
  const m = new VoxelModel(16, 8, 16);
  const g = leafIds(big ? ["#3c7a34", "#468a3a", "#33692c", "#55993f"] : ["#4a8a3a", "#5c9a40", "#3e7432", "#6aa646"]);
  const n = big ? 9 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4;
    const L = (big ? 7 : 5.5) + r() * 1.5;
    for (let k = 0; k < L; k++) {
      const y = Math.round(1 + Math.sin((k / L) * Math.PI * 0.9) * (big ? 4.5 : 3.5));
      m.set(8 + Math.cos(a) * k, y, 8 + Math.sin(a) * k, g[(k + i) % g.length]);
      if (k > 1 && k < L - 1 && k % 2 === 0) {
        m.set(8 + Math.cos(a) * k - Math.sin(a), y, 8 + Math.sin(a) * k + Math.cos(a), g[(k + 1) % g.length]);
        m.set(8 + Math.cos(a) * k + Math.sin(a), y, 8 + Math.sin(a) * k - Math.cos(a), g[(k + 2) % g.length]);
      }
    }
  }
  m.box(7, 0, 7, 9, 2, 9, g[2]);
  return m;
}

function shrub(seed: number, berries: string, leaves: string[]): VoxelModel {
  const r = rand(seed);
  const m = new VoxelModel(16, 10, 16);
  const lp = pick(leafIds(leaves));
  m.blob(8, 3.5, 8, 4.5, lp, 0.35, seed);
  m.blob(5 + r() * 2, 3, 6 + r() * 4, 3.4, lp, 0.35, seed + 1);
  m.blob(10 + r() * 2, 2.5, 9 + r() * 3, 3, lp, 0.35, seed + 2);
  const b = C(berries);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(3 + r() * 10),
      z = Math.floor(3 + r() * 10);
    for (let y = 8; y >= 0; y--)
      if (m.get(x, y, z)) {
        m.set(x, y + 1, z, b);
        break;
      }
  }
  return m;
}

function rock(seed: number, w: number, h: number): VoxelModel {
  const m = new VoxelModel(w + 4, h + 2, w + 4);
  const stone = pick(ids(["#7a7680", "#6e6a74", "#86828a", "#625e68"]));
  m.blob((w + 4) / 2, h * 0.35, (w + 4) / 2, w / 2, stone, 0.3, seed);
  m.blob((w + 4) / 2 + 1.5, h * 0.25, (w + 4) / 2 - 1, w / 2.6, stone, 0.3, seed + 4);
  // moss on top
  const moss = pick(ids(["#4f7a36", "#5c8a3c", "#466e30"]));
  for (let z = 0; z < m.d; z++)
    for (let x = 0; x < m.w; x++)
      for (let y = m.h - 1; y >= 0; y--)
        if (m.get(x, y, z)) {
          if (hash(x, y, z, seed) > 0.35) m.set(x, y, z, moss);
          break;
        }
  return m;
}

function log(seed: number): VoxelModel {
  const m = new VoxelModel(40, 8, 10);
  const b = bark(seed);
  for (let x = 2; x < 38; x++) for (let z = 1; z < 9; z++) for (let y = 0; y < 8; y++) if ((z - 4.5) ** 2 + (y - 3.5) ** 2 < 3.6 ** 2) m.set(x, y, z, b);
  // the cut end, moss along the top, a few shelf fungi
  const end = C("#b07a50");
  for (let z = 1; z < 9; z++) for (let y = 0; y < 8; y++) if ((z - 4.5) ** 2 + (y - 3.5) ** 2 < 3.2 ** 2) m.set(38, y, z, end);
  const moss = pick(ids(["#4f8a38", "#5c9a3e"]));
  for (let x = 4; x < 36; x++) if (hash(x, 0, 0, seed) > 0.25) m.set(x, 7, 4 + Math.floor(hash(x, 1, 0, seed) * 2), moss);
  for (const x of [10, 22, 29]) m.box(x, 4, 9, x + 3, 5, 10, C("#e8c890"));
  return m;
}

function shrooms(seed: number): VoxelModel {
  const r = rand(seed);
  const m = new VoxelModel(10, 5, 10);
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(1 + r() * 7),
      z = Math.floor(1 + r() * 7);
    const h = 1 + Math.floor(r() * 2);
    m.box(x, 0, z, x + 1, h, z + 1, C("#efe6d6"));
    m.box(x - 1, h, z - 1, x + 2, h + 1, z + 2, C(i % 2 ? "#d8332a" : "#c8762a"));
    m.set(x, h + 1, z, C(i % 2 ? "#d8332a" : "#c8762a"));
    if (i % 2) m.set(x - 1, h, z, C("#f6f0e4"));
  }
  return m;
}

/** The Genesis Tree: the oldest redwood of all, a cathedral of a trunk, burned hollow at the foot. */
function genesis(): VoxelModel {
  const m = redwood(2016, 120, 13, 5.2);
  const cx = m.w / 2,
    cz = m.w / 2;
  // the fire cave on the side facing the trail
  for (let y = 0; y < 9; y++) for (let x = Math.floor(cx - 2); x <= cx + 2; x++) for (let z = Math.floor(cz); z < m.d; z++) if (Math.abs(x + 0.5 - cx) < 2.2 - y * 0.2) m.set(x, y, z, y < 7 ? 0 : C("#2a1a14"));
  for (let y = 0; y < 8; y++) for (let x = Math.floor(cx - 3); x <= cx + 3; x++) if (m.get(x, y, Math.floor(cz) + 1) === 0 && Math.abs(x + 0.5 - cx) < 3) m.set(x, y, Math.floor(cz) - 1, C("#1a100c"));
  return m;
}

/** Each species: its model (built once), the voxel size it's drawn at, whether it sways. */
interface Kind {
  build: () => VoxelModel;
  /** Metres per voxel. */
  s: number;
  sway: number;
  /** Trunk radius in metres for collisions (0: walk through). */
  trunk: number;
  far: boolean;
}
export const KINDS: Record<Species, Kind> = {
  redwood: { build: () => redwood(11, 54, 6, 2.1), s: 1 / 3, sway: 1, trunk: 0.75, far: true },
  redwoodTall: { build: () => redwood(23, 72, 7, 2.6), s: 1 / 3, sway: 1, trunk: 0.9, far: true },
  redwoodGiant: { build: () => redwood(37, 90, 8.5, 3.2), s: 1 / 3, sway: 0.8, trunk: 1.1, far: true },
  genesis: { build: genesis, s: 1 / 3, sway: 0.5, trunk: 1.9, far: true },
  fir: { build: () => fir(5, 52, 6.5), s: 1 / 3, sway: 1, trunk: 0.4, far: true },
  maple: { build: () => broadleaf(7, 30, 9, ["#d9a22a", "#e8b83a", "#c8862a", "#e09a2c", "#b8a03a"], ["#5a4a3a", "#4a3e32"], "#d89a2a"), s: 1 / 3, sway: 1.4, trunk: 0.4, far: true },
  alder: { build: () => broadleaf(19, 28, 7, ["#c8432a", "#d8582e", "#a8382a", "#e07a34", "#8a6a2a"], ["#a8a49a", "#8e8a80"], "#c84a2a"), s: 1 / 3, sway: 1.4, trunk: 0.35, far: true },
  oak: { build: () => broadleaf(29, 22, 9, ["#4a6a2e", "#567a34", "#3e5e28", "#62843a"], ["#4a3a2e", "#3e3028"]), s: 1 / 3, sway: 1, trunk: 0.45, far: true },
  snag: { build: () => snag(3, 46), s: 1 / 3, sway: 0, trunk: 0.5, far: true },
  scrub: { build: () => shrub(41, "#e8d06a", ["#6a7a3a", "#7a8a42", "#5a6a32", "#8a8a4a"]), s: 1 / 4, sway: 1.2, trunk: 0, far: true },
  fern: { build: () => fern(1, true), s: 1 / 7, sway: 1.6, trunk: 0, far: false },
  fern2: { build: () => fern(2, false), s: 1 / 7, sway: 1.6, trunk: 0, far: false },
  shrub: { build: () => shrub(3, "#3a3a8a", ["#2e5a2c", "#386a32", "#2a4e28"]), s: 1 / 6, sway: 1.2, trunk: 0, far: false },
  shrub2: { build: () => shrub(9, "#d8402a", ["#4a7a30", "#5a8a36", "#3e6a2a"]), s: 1 / 6, sway: 1.2, trunk: 0, far: false },
  rock: { build: () => rock(4, 12, 8), s: 1 / 5, sway: 0, trunk: 0.9, far: false },
  rock2: { build: () => rock(8, 8, 5), s: 1 / 5, sway: 0, trunk: 0.6, far: false },
  log: { build: () => log(6), s: 1 / 6, sway: 0, trunk: 0, far: false },
  shroom: { build: () => shrooms(12), s: 1 / 10, sway: 0, trunk: 0, far: false },
};

// ---- materials: the voxel look, with a breeze through the canopies --------------------------------
export const WIND = { value: 0 };

export interface Instance {
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  tint: number;
}

// ---- the realistic woods (branch gta-real): each kind drawn from real shapes, not voxels ------------------

/** A drawn part of a kind: its geometry (in metres, scaled to the kind), material, and a tint of its own. */
interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  depth?: THREE.Material;
  tint?: THREE.Color;
  /** Drawn afar too (the trunks and the crowns' first third; not the undergrowth). */
  far: boolean;
}
const realCache = new Map<Species, { parts: Part[]; height: number }>();
const forestMats = new Map<string, THREE.Material>();
function fmat(key: string, make: () => THREE.Material) {
  let m = forestMats.get(key);
  if (!m) forestMats.set(key, (m = make()));
  return m;
}
/** A tree shape of real/trees.ts stretched to `H` metres, `wide` times as wide as the stretch would make it. */
function stretched(sp: "pine" | "maple" | "broad" | "bush", v: number, H: number, wide: number, opts: { barkTint?: string; leafTint?: string; noLeaves?: boolean; flat?: number } = {}) {
  const t = treeShape(sp, v);
  const box = new THREE.Box3();
  for (const g of [t.bark, t.leaves]) {
    if (!g.getAttribute("position")?.count) continue;
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  const h0 = Math.max(0.5, box.max.y);
  const ky = H / h0;
  const kx = ky * wide;
  const parts: Part[] = [];
  if (t.bark.getAttribute("position")?.count) parts.push({ geo: t.bark.clone().scale(kx, ky, kx), mat: t.barkMat, tint: opts.barkTint ? new THREE.Color(opts.barkTint) : undefined, far: true });
  if (!opts.noLeaves) parts.push({ geo: t.leaves.clone().scale(kx, ky * (opts.flat ?? 1), kx), mat: t.leafMat, depth: t.leafDepth, tint: opts.leafTint ? new THREE.Color(opts.leafTint) : undefined, far: true });
  return parts;
}
/** A mossy boulder: a lumpy displaced sphere in the CC0 rock, moss on its top. */
function boulder(seed: number, w: number, h: number): Part[] {
  const r = rand(seed);
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.getAttribute("position");
  const n = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const k = 1 + 0.16 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7) + 0.1 * Math.sin(y * 5.3 + x * 2) + 0.05 * (hash(Math.round(x * 9), Math.round(y * 9), Math.round(z * 9), seed) - 0.5);
    p.setXYZ(i, x * k * (w / 2), Math.max(-0.15, y * k) * h * 0.6 + h * 0.08, z * k * (w / 2) * (0.8 + r() * 0.0));
    // moss on what faces up
    const up = THREE.MathUtils.smoothstep(y, 0.35, 0.75);
    const c = new THREE.Color("#b8b2a8").lerp(new THREE.Color("#5e7a3a"), up * 0.85);
    n.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(n, 3));
  g.computeVertexNormals();
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) / 2.5, p.getY(i) / 2.5);
  const mat = fmat("rock", () => {
    const mp = maps("Rock030");
    return new THREE.MeshStandardMaterial({ vertexColors: true, map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, roughness: 1, color: new THREE.Color(2.1, 2.05, 1.95) });
  });
  return [{ geo: g, mat, far: false }];
}
/** A fallen log along x: barked, its sawn end showing the rings, a strip of moss along its top. */
function fallenLog(): Part[] {
  const L = 6.6,
    R = 0.58;
  const bark = new THREE.CylinderGeometry(R, R * 1.05, L, 18, 1, true).rotateZ(Math.PI / 2).translate(0, R, 0);
  const uv = bark.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 4);
  const end = new THREE.CircleGeometry(R * 0.95, 18).rotateY(Math.PI / 2).translate(L / 2, R, 0);
  const moss = new THREE.CylinderGeometry(R * 1.02, R * 1.06, L * 0.8, 18, 1, true, -0.6, 1.2).rotateZ(Math.PI / 2).translate(0, R, 0);
  const barkM = fmat("logbark", () => {
    const mp = maps("Bark012");
    return new THREE.MeshStandardMaterial({ map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, roughness: 1, color: "#b09a88" });
  });
  return [
    { geo: bark, mat: barkM, far: false },
    { geo: end, mat: fmat("logend", () => new THREE.MeshStandardMaterial({ color: "#b8865a", roughness: 0.9 })), far: false },
    { geo: moss, mat: fmat("moss", () => new THREE.MeshStandardMaterial({ color: "#5c7a34", roughness: 1 })), far: false },
  ];
}
/** A clump of toadstools: pale stems, red and orange caps with their white spots. */
function toadstools(): Part[] {
  const r = rand(12);
  const geos: THREE.BufferGeometry[] = [];
  const col = (g: THREE.BufferGeometry, hex: string) => {
    const c = new THREE.Color(hex);
    const gg = g.index ? g.toNonIndexed() : g;
    const a = new Float32Array(gg.getAttribute("position").count * 3);
    for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i);
    gg.setAttribute("color", new THREE.BufferAttribute(a, 3));
    gg.deleteAttribute("uv");
    return gg;
  };
  for (let i = 0; i < 6; i++) {
    const x = (r() - 0.5) * 0.7,
      z = (r() - 0.5) * 0.7,
      h = 0.08 + r() * 0.12,
      cr = 0.05 + r() * 0.05;
    geos.push(col(new THREE.CylinderGeometry(cr * 0.3, cr * 0.38, h, 8).translate(x, h / 2, z), "#efe6d6"));
    geos.push(col(new THREE.SphereGeometry(cr, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(x, h, z), i % 2 ? "#d8332a" : "#c8762a"));
    for (let k = 0; k < 3; k++) geos.push(col(new THREE.SphereGeometry(cr * 0.16, 5, 3).translate(x + (r() - 0.5) * cr, h + cr * 0.6, z + (r() - 0.5) * cr), "#f6f0e4"));
  }
  const g = new THREE.BufferGeometry();
  for (const k of ["position", "normal", "color"]) {
    const arrs = geos.map((x) => x.getAttribute(k).array as Float32Array);
    const a = new Float32Array(arrs.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of arrs) (a.set(x, o), (o += x.length));
    g.setAttribute(k, new THREE.BufferAttribute(a, 3));
  }
  return [{ geo: g, mat: fmat("shroom", () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })), far: false }];
}

/** A kind's parts: the redwoods, firs and snags as tall conifers, the broadleaves, the undergrowth, rocks, logs. */
function realKind(kind: Species) {
  let e = realCache.get(kind);
  if (e) return e;
  let parts: Part[];
  switch (kind) {
    case "redwood":
      parts = stretched("pine", 0, 18, 0.72, { barkTint: "#c88a6a" });
      break;
    case "redwoodTall":
      parts = stretched("pine", 1, 24, 0.68, { barkTint: "#c88a6a" });
      break;
    case "redwoodGiant":
      parts = stretched("pine", 2, 30, 0.64, { barkTint: "#c07a5a" });
      break;
    case "genesis":
      parts = stretched("pine", 0, 40, 0.66, { barkTint: "#b06a4a" });
      break;
    case "fir":
      parts = stretched("pine", 1, 17, 0.85, { leafTint: "#a8c8a0" });
      break;
    case "maple":
      parts = stretched("maple", 0, 10, 1.05, { leafTint: "#ffd060" });
      break;
    case "alder":
      parts = stretched("maple", 1, 9.3, 0.95, { leafTint: "#ff8a5a" });
      break;
    case "oak":
      parts = stretched("broad", 1, 7.3, 1.3);
      break;
    case "snag":
      parts = stretched("pine", 2, 15, 0.7, { barkTint: "#a8a49a", noLeaves: true });
      break;
    case "scrub":
      parts = stretched("bush", 0, 2.2, 1.1, { leafTint: "#c8c890" });
      break;
    case "shrub":
      parts = stretched("bush", 1, 1.5, 1.0, { leafTint: "#8ab07a" });
      break;
    case "shrub2":
      parts = stretched("bush", 2, 1.4, 1.1);
      break;
    case "fern":
      parts = stretched("bush", 0, 1.0, 1.5, { leafTint: "#9ad07a", flat: 0.8 });
      break;
    case "fern2":
      parts = stretched("bush", 1, 0.8, 1.6, { leafTint: "#b0d890", flat: 0.8 });
      break;
    case "rock":
      parts = boulder(4, 3.2, 2);
      break;
    case "rock2":
      parts = boulder(8, 2.4, 1.4);
      break;
    case "log":
      parts = fallenLog();
      break;
    default:
      parts = toadstools();
  }
  // the undergrowth near only
  if (!KINDS[kind].far) for (const p of parts) p.far = false;
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    box.union(p.geo.boundingBox!);
  }
  e = { parts, height: box.max.y };
  realCache.set(kind, e);
  return e;
}

/** One species: its parts instanced near (whole, casting shadows) and afar (trunks and a third of the crown); instances move between them as the viewer does. */
export class Stand {
  readonly near = new THREE.Group();
  readonly far: THREE.Group | null;
  private nearMeshes: { m: THREE.InstancedMesh; tint?: THREE.Color }[] = [];
  private farMeshes: { m: THREE.InstancedMesh; tint?: THREE.Color }[] = [];
  private mats: THREE.Matrix4[] = [];
  private cols: THREE.Color[] = [];
  private pos: THREE.Vector3[] = [];
  /** Height of the model in metres (unscaled), for the hikers' views. */
  readonly height: number;

  constructor(
    readonly kind: Species,
    list: Instance[],
    sphere: THREE.Sphere,
  ) {
    const K = realKind(kind);
    this.height = K.height;
    const n = Math.max(1, list.length);
    const anyFar = K.parts.some((p) => p.far);
    this.far = anyFar ? new THREE.Group() : null;
    for (const p of K.parts) {
      const near = new THREE.InstancedMesh(p.geo, p.mat, n);
      if (p.depth) near.customDepthMaterial = p.depth;
      near.castShadow = true;
      near.receiveShadow = true;
      near.userData.noField = true;
      this.near.add(near);
      this.nearMeshes.push({ m: near, tint: p.tint });
      if (p.far && this.far) {
        // (afar: the same buffers, a shorter draw for the crowns)
        let g = p.geo;
        if (p.depth && p.geo.index) {
          g = new THREE.BufferGeometry();
          for (const [name, a] of Object.entries(p.geo.attributes)) g.setAttribute(name, a);
          // (one leaf card in three, all the way up: the first third of the cards was the lowest
          // tier only, and from the bridge the ridge was a row of bare trunks sticking up)
          const src = p.geo.index.array;
          const keep: number[] = [];
          for (let c = 0; c + 6 <= src.length; c += 6) if ((c / 6) % 3 === 0) for (let k = 0; k < 6; k++) keep.push(src[c + k]);
          g.setIndex(keep);
        }
        const far = new THREE.InstancedMesh(g, p.mat, n);
        far.receiveShadow = true;
        far.userData.noField = true;
        this.far.add(far);
        this.farMeshes.push({ m: far, tint: p.tint });
      }
    }
    const q = new THREE.Quaternion();
    for (const it of list) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
      this.mats.push(new THREE.Matrix4().compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.scale, it.scale, it.scale)));
      this.cols.push(new THREE.Color(1, 1, 1).multiplyScalar(it.tint));
      this.pos.push(new THREE.Vector3(it.x, it.y, it.z));
    }
    for (const { m } of [...this.nearMeshes, ...this.farMeshes]) {
      m.boundingSphere = sphere;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
    }
    this.split(null, 0);
  }

  /** Instances within `r` of `at` drawn in full, the rest in the far model (undergrowth: not at all). */
  split(at: THREE.Vector3 | null, r: number) {
    let a = 0,
      b = 0;
    const r2 = r * r;
    const c = new THREE.Color();
    for (let i = 0; i < this.mats.length; i++) {
      const close = at !== null && this.pos[i].distanceToSquared(at) < r2;
      if (!close && !this.far) continue;
      const list = close ? this.nearMeshes : this.farMeshes;
      const k = close ? a++ : b++;
      for (const { m, tint } of list) {
        m.setMatrixAt(k, this.mats[i]);
        m.setColorAt(k, tint ? c.copy(this.cols[i]).multiply(tint) : this.cols[i]);
      }
    }
    for (const [list, n] of [
      [this.nearMeshes, a],
      [this.farMeshes, b],
    ] as const)
      for (const { m } of list) {
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.visible = n > 0;
      }
  }
}
