import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { meshModel, MATERIALS } from "../../scene/voxel/mesher";
import { C, E, shades, VoxelModel, type Kind } from "../../scene/voxel/model";

/**
 * The gallery's furniture, drawn in the city's voxel style (6 voxels per metre). Each model is
 * meshed once; a `Furnisher` stamps copies around a floor and merges them into at most three
 * meshes (solid, glass, light), so a whole floor of benches and lamps costs three draw calls.
 */

const brass = shades(["#9a7224", "#8c6820", "#a67c2a"], 1, 21);
const lacquer = shades(["#141317", "#18161b", "#121115"], 1, 22);
const leather = shades(["#1d1a1f", "#231f25", "#1a171c"], 1, 23);
const marble = shades(["#e6e1d8", "#d9d3c9", "#efeae2", "#cfc8bd"], 1, 24);
const blackMarble = shades(["#1b1a1f", "#24222a", "#16151a", "#2c2a33"], 1, 25);
const steel = shades(["#4a4852", "#53515c", "#44424c"], 1, 26);

/** Gallery bench: tufted black leather on a brass-shod base. `len` in metres. */
export function bench(len = 2) {
  const L = Math.round(len * 6);
  const m = new VoxelModel(L, 3, 4);
  m.box(0, 0, 0, 1, 2, 4, brass);
  m.box(L - 1, 0, 0, L, 2, 4, brass);
  m.box(1, 1, 1, L - 1, 2, 3, lacquer);
  m.box(0, 2, 0, L, 3, 4, leather);
  // tufting: a button every half metre
  for (let x = 2; x < L - 1; x += 3) m.set(x, 2, 0, C("#0e0d10"));
  return m;
}

/** Display plinth: black marble block on a brass-trimmed base, a gold light line under the cap. */
export function plinth(w = 1, h = 0.9) {
  const W = Math.round(w * 6),
    H = Math.round(h * 6);
  const m = new VoxelModel(W + 2, H, W + 2);
  m.box(0, 0, 0, W + 2, 1, W + 2, lacquer);
  m.box(0, 1, 0, W + 2, 2, W + 2, brass);
  m.box(1, 2, 1, W + 1, H - 1, W + 1, blackMarble);
  m.box(1, H - 2, 1, W + 1, H - 1, W + 1, E("#f4b728", 1.3));
  m.box(0, H - 1, 0, W + 2, H, W + 2, blackMarble);
  m.box(1, H - 1, 1, W + 1, H, W + 1, lacquer);
  return m;
}

/** The back of a framed picture standing on a plinth: a brass strut. */
export function strut(h = 1.4) {
  const H = Math.round(h * 6);
  const m = new VoxelModel(2, H, 4);
  for (let y = 0; y < H; y++) m.set(0, y, Math.min(3, Math.floor((H - y) / (H / 4))), brass);
  m.box(0, 0, 0, 2, 1, 4, brass);
  return m;
}

/** Brass stanchion pair with a velvet rope between them. `len` in metres along x. */
export function rope(len = 2, color = "#8a1830") {
  const L = Math.round(len * 6);
  const m = new VoxelModel(L + 1, 6, 1);
  for (const x of [0, L]) {
    m.box(x, 0, 0, x + 1, 6, 1, brass);
    m.set(x, 0, 0, lacquer);
  }
  const velvet = shades([color, "#6e1226", "#9a2038"], 1, 27);
  for (let x = 1; x < L; x++) {
    const t = x / L;
    m.set(x, Math.round(5 - Math.sin(t * Math.PI) * 1.6), 0, velvet);
  }
  return m;
}

/** Andon: a paper floor lantern in a dark wooden frame. */
export function andon() {
  const m = new VoxelModel(4, 9, 4);
  const wood = shades(["#2a1c14", "#322219"], 1, 28);
  m.box(0, 0, 0, 4, 1, 4, wood);
  m.box(0, 1, 0, 4, 8, 4, E("#ffb45e", 0.95));
  m.box(1, 2, 1, 3, 7, 3, 0);
  for (const [x, z] of [[0, 0], [3, 0], [0, 3], [3, 3]]) m.box(x, 0, z, x + 1, 9, z + 1, wood);
  for (const y of [4]) {
    m.box(0, y, 0, 4, y + 1, 1, wood);
    m.box(0, y, 3, 4, y + 1, 4, wood);
  }
  m.box(0, 8, 0, 4, 9, 4, wood);
  return m;
}

/** Potted plant: bamboo stalks (`bamboo`) or a round bonsai-like shrub, in a black glazed pot. */
export function plant(kind: "bamboo" | "shrub", seed = 1) {
  const m = new VoxelModel(8, kind === "bamboo" ? 20 : 10, 8);
  const pot = shades(["#16151a", "#1f1d24"], 1, 29);
  m.box(1, 0, 1, 7, 3, 7, pot);
  m.box(1, 3, 1, 7, 4, 7, brass);
  m.box(2, 3, 2, 6, 4, 6, C("#2a1e16"));
  if (kind === "bamboo") {
    const stalk = shades(["#5f8a3a", "#6e9a42", "#557c34"], 1, seed);
    const leaf = shades(["#2f6b3c", "#3d8a4a", "#285c33", "#4a9a52"], 1, seed + 1);
    for (const [x, z, h] of [[3, 3, 18], [4, 5, 15], [5, 3, 19], [2, 5, 13]]) {
      m.box(x, 4, z, x + 1, h, z + 1, stalk);
      for (let y = 7; y < h; y += 3) m.set(x, y, z, C("#3f5e28"));
      m.blob(x + (x > 3 ? 1.5 : -0.5), h - 1, z + 0.5, 2.2, leaf, 0.45, seed + x);
    }
  } else {
    const leaf = shades(["#2f6b3c", "#3d8a4a", "#285c33"], 1, seed);
    m.box(3, 4, 3, 5, 6, 5, shades(["#4a3426", "#3e2c20"], 1, 8));
    m.blob(4, 7, 4, 3.4, leaf, 0.3, seed);
    m.blob(2.5, 6.5, 5, 2, leaf, 0.3, seed + 3);
  }
  return m;
}

/** Elevator front: steel frame, brushed doors, a lit floor indicator band and call buttons. */
export function elevator(accent: string) {
  const m = new VoxelModel(18, 22, 2);
  m.box(0, 0, 0, 18, 22, 1, steel);
  m.box(1, 0, 1, 17, 21, 2, C("#25232b"));
  m.box(2, 0, 1, 16, 19, 2, shades(["#8a8794", "#93909c", "#7f7c89"], 1, 30));
  m.box(8, 0, 1, 10, 19, 2, C("#3c3a44"));
  m.box(8, 0, 1, 9, 19, 2, C("#2b2932"));
  m.box(3, 20, 1, 15, 21, 2, E(accent, 2.4));
  return m;
}

/** Reception desk with a lit brass band, a terminal, a lucky cat and a bonsai. Faces +z. */
export function desk(len = 4.5) {
  const L = Math.round(len * 6);
  const m = new VoxelModel(L, 12, 6);
  m.box(0, 0, 0, L, 1, 6, lacquer);
  m.box(0, 1, 1, L, 6, 6, lacquer);
  m.box(0, 2, 5, L, 3, 6, brass);
  m.box(0, 6, 0, L, 7, 6, marble);
  m.box(1, 5, 5, L - 1, 6, 6, E("#f4b728", 2.4));
  // pixel "Z" inlaid in the front
  const mid = Math.floor(L / 2);
  const z = E("#f4b728", 2.6);
  m.box(mid - 1, 4, 5, mid + 2, 5, 6, z);
  m.set(mid + 1, 3, 5, z);
  m.set(mid, 3, 5, z);
  m.box(mid - 1, 2, 5, mid + 2, 3, 6, z);
  // terminal
  m.box(4, 7, 1, 9, 8, 4, C("#2a2830"));
  m.box(5, 8, 2, 8, 11, 3, C("#1f1d24"));
  m.box(5, 8, 3, 8, 11, 4, E("#5ad8ff", 1.8));
  // maneki-neko
  const cat = shades(["#e9b84a", "#d9a63a"], 1, 31);
  const cx = L - 6;
  m.box(cx, 7, 2, cx + 3, 10, 4, cat);
  m.box(cx, 10, 2, cx + 3, 12, 4, cat);
  m.set(cx, 12, 3, cat);
  m.set(cx + 2, 12, 3, cat);
  m.set(cx + 2, 11, 4, C("#c42a3a"));
  m.box(cx + 3, 10, 3, cx + 4, 12, 4, cat);
  m.set(cx + 1, 9, 4, C("#c42a3a"));
  // bonsai
  m.box(L - 2, 7, 1, L, 8, 3, C("#1f1d24"));
  m.blob(L - 1, 9, 2, 1.6, shades(["#2f6b3c", "#3d8a4a"], 1, 32), 0.2, 4);
  return m;
}

/** A row of gold balustrade for the lobby's mezzanine. `len` in metres along x. */
export function railing(len: number) {
  const L = Math.round(len * 6);
  const m = new VoxelModel(L, 7, 1);
  m.box(0, 6, 0, L, 7, 1, brass);
  m.box(0, 0, 0, L, 1, 1, brass);
  for (let x = 0; x < L; x += 2) m.box(x, 1, 0, x + 1, 6, 1, C("#2a2730"));
  return m;
}

/** Stamps meshed models around a floor and merges them into one mesh per material kind. */
export class Furnisher {
  private parts: Record<Kind, THREE.BufferGeometry[]> = { solid: [], glass: [], emit: [] };
  private static cache = new Map<string, Partial<Record<Kind, THREE.BufferGeometry>>>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  /** Place `model` (cached under `key`) with its footprint centred on (x, z), turned by `yaw`. */
  add(key: string, make: () => VoxelModel, x: number, y: number, z: number, yaw = 0) {
    let g = Furnisher.cache.get(key);
    if (!g) {
      g = meshModel(make());
      Furnisher.cache.set(key, g);
    }
    this.m.compose(new THREE.Vector3(x, y, z), this.q.setFromAxisAngle(this.up, yaw), new THREE.Vector3(1, 1, 1));
    for (const kind of ["solid", "glass", "emit"] as Kind[]) {
      const geo = g[kind];
      if (geo) this.parts[kind].push(geo.clone().applyMatrix4(this.m));
    }
  }

  build() {
    const group = new THREE.Group();
    for (const kind of ["solid", "glass", "emit"] as Kind[]) {
      if (!this.parts[kind].length) continue;
      const geo = mergeGeometries(this.parts[kind]);
      this.parts[kind].forEach((p) => p.dispose());
      group.add(new THREE.Mesh(geo, MATERIALS[kind]));
    }
    return group;
  }
}
