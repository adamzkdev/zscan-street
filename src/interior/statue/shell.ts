import * as THREE from "three";
import { meshModel, MATERIALS } from "../../scene/voxel/mesher";
import { C, hash, VoxelModel } from "../../scene/voxel/model";
import { statue } from "../../scene/voxel/landmarks/statue";
import type { Kind } from "../../scene/voxel/model";
import type { Rect } from "../types";

/**
 * The statue itself, seen from its balcony, from inside and from its torch: the city's own voxel
 * model of the zkSNARK of Liberty (scene/voxel/landmarks/statue.ts), drawn 1.75× larger than on the
 * street (a place is bigger on the inside) and hollowed out: a two-voxel copper skin, painted the
 * dull brown of the inside with its grid of iron straps, a door in the back of the robe, a deck in
 * the head with a ring of 25 windows and the eyes cut through, a wider balcony round the pedestal
 * and a wider gallery round the torch.
 */

/** Model voxels → metres: 1/6 m a voxel on the street, 1.75× here. */
export const S = 1.75 / 6;
/** The statue model's size and centre (the lot is 18 × 18 m: 108 voxels). */
const W = 108,
  CX = 54,
  CZ = 54;
/** Pedestal top (balcony floor), the head's deck, in model voxels (see statue.ts). */
export const Y0 = 113;
export const CROWN_V = 205;
/** The helix axis (model voxels): between the robe's middle and the head's. */
const AX = 55,
  AZ = 50;
/** The torch: cup centre and gallery level (statue.ts: wrist (86, 246, 54), cup at +16). */
const TX = 86,
  TZ = 52,
  CUP = 262;

export const toWorld = (x: number, y: number, z: number) => new THREE.Vector3((x - CX) * S, y * S, (z - CZ) * S);
export const BALCONY_Y = Y0 * S;
export const CROWN_Y = CROWN_V * S;
export const TORCH_Y = (CUP + 8) * S;
export const AXIS = { x: (AX - CX) * S, z: (AZ - CZ) * S };
export const TORCH = { x: (TX - CX) * S, z: (TZ - CZ) * S };
/** Balcony half size (the walkway's outer rail), metres. */
export const BALC = 34 * S;

export interface Shell {
  object: THREE.Group;
  /** Colliders read from the model: the balcony (robe, rail) and the head's room. */
  balconyRects: Rect[];
  crownRects: Rect[];
  /** Skin distance from the axis along (dx, dz) at height y (metres), for the armature's bars. */
  skinAt(y: number, dx: number, dz: number): number;
  /** The windows (world centres) of the crown, and the eyes. */
  windows: THREE.Vector3[];
  eyes: THREE.Vector3[];
  /** Cells of the model, for a scale model elsewhere. */
  model: VoxelModel;
}

export function buildShell(): Shell {
  const b = statue(9000, { kind: "statue", w: 18, d: 18 });
  const m = b.model;
  const H = m.h;
  const idx = (x: number, y: number, z: number) => x + W * (z + W * y);

  // ---- the balcony, wider: a cantilevered gallery on corbels, a fresh rail ---------------------
  const granite = [C("#a89f90"), C("#a0978a"), C("#b0a797")];
  const trim = C("#c8bfae");
  // the old rail round the pedestal's edge goes (the robe's hem stays)
  for (let z = 0; z < W; z++)
    for (let x = 0; x < W; x++) {
      const edge = Math.max(Math.abs(x + 0.5 - CX), Math.abs(z + 0.5 - CZ));
      if (edge > 25.9 && edge < 28) for (let y = Y0; y < Y0 + 4; y++) m.set(x, y, z, 0);
    }
  for (let z = CZ - 34; z < CZ + 34; z++)
    for (let x = CX - 34; x < CX + 34; x++) {
      const edge = Math.max(Math.abs(x + 0.5 - CX), Math.abs(z + 0.5 - CZ));
      if (edge > 27) {
        m.set(x, Y0 - 1, z, (x + z) % 2 ? C("#a8a196") : C("#9e978c"));
        m.set(x, Y0 - 2, z, trim);
        if (edge < 30 && (x + z) % 4 === 0) m.set(x, Y0 - 3, z, granite[0]);
      }
      if (edge > 33) {
        const post = (x + z) % 3 === 0;
        if (post) m.box(x, Y0, z, x + 1, Y0 + 4, z + 1, C("#b3a891"));
        m.set(x, Y0 + 4, z, trim);
        m.set(x, Y0, z, trim);
      }
    }
  // corbels under the overhang
  for (let i = -32; i < 32; i += 4)
    for (const [x, z] of [
      [CX + i, CZ + 32],
      [CX + i, CZ - 33],
      [CX + 32, CZ + i],
      [CX - 33, CZ + i],
    ])
      m.box(x, Y0 - 6, z, x + 2, Y0 - 2, z + 1, granite[2]);

  // ---- hollow the figure: everything deeper than two voxels under the surface goes --------------
  const lo = Y0;
  const dist = new Uint8Array(W * W * H);
  // pass 0: cells touching air are the skin (1); then two more layers inward
  for (let pass = 1; pass <= 2; pass++)
    for (let y = lo; y < H; y++)
      for (let z = 0; z < W; z++)
        for (let x = 0; x < W; x++) {
          const i = idx(x, y, z);
          if (!m.data[i] || dist[i]) continue;
          const near = (dx: number, dy: number, dz: number) => {
            const X = x + dx,
              Y = y + dy,
              Z = z + dz;
            if (X < 0 || Z < 0 || X >= W || Z >= W || Y >= H) return true;
            if (Y < lo) return false;
            const j = idx(X, Y, Z);
            return pass === 1 ? !m.data[j] : dist[j] === pass - 1;
          };
          if (near(1, 0, 0) || near(-1, 0, 0) || near(0, 1, 0) || near(0, -1, 0) || near(0, 0, 1) || near(0, 0, -1)) dist[i] = pass;
        }
  // the robe and the head only: the arms, tablet and torch stay solid castings
  const copper = [C("#6e3f26"), C("#663a23"), C("#76452a"), C("#5e3420")];
  const strap = C("#2c2622");
  const strapLit = C("#3a322c");
  for (let y = lo + 1; y < 250; y++)
    for (let z = 0; z < W; z++)
      for (let x = 0; x < W; x++) {
        const i = idx(x, y, z);
        if (m.data[i] && !dist[i] && Math.hypot(x - AX, z - AZ) < 40 && !(y > 182 && x > 76)) m.data[i] = 0;
      }
  // the inside face of the skin: dull copper, the iron straps' grid riveted to it
  for (let y = lo + 1; y < 250; y++)
    for (let z = 1; z < W - 1; z++)
      for (let x = 1; x < W - 1; x++) {
        const i = idx(x, y, z);
        if (dist[i] !== 2 || !m.data[i]) continue;
        const hollowNear = !m.data[idx(x + 1, y, z)] || !m.data[idx(x - 1, y, z)] || !m.data[idx(x, y, z + 1)] || !m.data[idx(x, y, z - 1)] || !m.data[idx(x, y + 1, z)] || !m.data[idx(x, y - 1, z)];
        if (!hollowNear) continue;
        const a = Math.atan2(z - AZ, x - AX);
        const band = (y - lo) % 9 === 0;
        const rib = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 44) !== Math.floor(((a + Math.PI) / (Math.PI * 2)) * 44 + 0.06);
        m.data[i] = band || rib ? (hash(x, y, z, 3) > 0.5 ? strap : strapLit) : copper[Math.floor(hash(x >> 1, y >> 1, z >> 1, 7) * 4)];
      }

  // ---- the door in the back of the robe ---------------------------------------------------------
  for (let x = AX - 5; x < AX + 5; x++)
    for (let y = Y0; y < Y0 + 11; y++) {
      const u = (x + 0.5 - AX) / 5;
      if (y > Y0 + 8 && y - (Y0 + 8) > 3 * Math.sqrt(Math.max(0, 1 - u * u))) continue;
      for (let z = AZ - 26; z < AZ - 4; z++) m.set(x, y, z, 0);
    }
  // its frame: bronze jambs
  for (let y = Y0; y < Y0 + 11; y++)
    for (const x of [AX - 6, AX + 5])
      for (let z = AZ - 26; z < AZ - 4; z++) if (m.get(x, y, z) && !m.get(x, y, z - 1)) m.set(x, y, z, C("#3a2a1c"));

  // ---- the head: a deck at eye level, the windows, the eyes ------------------------------------
  const deck = [C("#5a4430"), C("#62492f"), C("#523d2a")];
  for (let z = 1; z < W - 1; z++)
    for (let x = 1; x < W - 1; x++) {
      if (m.get(x, CROWN_V - 1, z) || Math.hypot(x - AX, z - AZ) > 22) continue;
      // inside the head: skin on both sides along x and z
      let l = false,
        r = false,
        f = false,
        bk = false;
      for (let d = 1; d < 30; d++) {
        l ||= !!m.get(x - d, CROWN_V, z);
        r ||= !!m.get(x + d, CROWN_V, z);
        f ||= !!m.get(x, CROWN_V, z + d);
        bk ||= !!m.get(x, CROWN_V, z - d);
      }
      if (!(l && r && f && bk)) continue;
      if (Math.hypot(x + 0.5 - AX, z + 0.5 - AZ) < 7.4) continue; // the stair well
      m.set(x, CROWN_V - 1, z, deck[(Math.floor(x / 3) + z) % 3]);
      m.set(x, CROWN_V - 2, z, C("#2c2622"));
    }
  // 25 windows round the head, a band at eye height
  const windows: THREE.Vector3[] = [];
  const WY0 = CROWN_V + 5,
    WY1 = CROWN_V + 10;
  const slots = 25;
  for (let i = 0; i < slots; i++) {
    const ac = ((i + 0.5) / slots) * Math.PI * 2 - Math.PI;
    let rMid = 0;
    for (let a = ac - 0.075; a <= ac + 0.075; a += 0.008)
      for (let y = WY0 - 1; y <= WY1; y++) {
        const frame = y === WY0 - 1 || y === WY1 || Math.abs(a - ac) > 0.068;
        let r = 4;
        while (r < 30 && !m.get(Math.round(AX + Math.cos(a) * r), y, Math.round(AZ + Math.sin(a) * r))) r += 0.5;
        if (r >= 30) continue;
        if (y === WY0 + 2 && Math.abs(a - ac) < 0.01) rMid = r;
        // through the skin: up to four cells deep
        for (let d = 0; d < 4; d += 0.5) {
          const x = Math.round(AX + Math.cos(a) * (r + d)),
            z = Math.round(AZ + Math.sin(a) * (r + d));
          if (!m.get(x, y, z)) break;
          m.set(x, y, z, frame ? C("#5e4a2c") : 0);
          if (frame) break;
        }
      }
    if (rMid) windows.push(toWorld(AX + Math.cos(ac) * rMid, (WY0 + WY1) / 2, AZ + Math.sin(ac) * rMid));
  }
  // the eyes: cut through the void, square, two each side of the brow
  const eyes: THREE.Vector3[] = [];
  for (const ex of [14 * 3 + 14, 18 * 3 + 14]) {
    // portrait columns 14-15 and 18-19 (XP = 14, P = 3), rows 13-14 → y 209..215
    for (let y = 209; y < 215; y++)
      for (let x = ex; x < ex + 6; x++)
        for (let z = AZ; z < W; z++) if (m.get(x, y, z)) m.set(x, y, z, 0);
    eyes.push(toWorld(ex + 3, 212, AZ + 12));
  }

  // ---- the torch: a wider gallery is drawn by the torch floor; the model's rail goes ---------
  for (let y = CUP + 8; y < CUP + 12; y++)
    for (let z = TZ - 13; z <= TZ + 13; z++)
      for (let x = TX - 13; x <= TX + 13; x++) {
        const r = Math.hypot(x + 0.5 - TX, z + 0.5 - TZ);
        if (r > 9.6 && r < 12) m.set(x, y, z, 0);
      }

  // ---- mesh it ---------------------------------------------------------------------------------
  const object = new THREE.Group();
  const geos = meshModel(m);
  for (const [kd, geo] of Object.entries(geos) as [Kind, THREE.BufferGeometry][]) {
    const mesh = new THREE.Mesh(geo, kd === "emit" ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) : MATERIALS[kd]);
    mesh.receiveShadow = mesh.castShadow = false;
    object.add(mesh);
  }
  // meshModel works in street metres (1/6 m a voxel): 1.75× and centred on the lot
  object.scale.setScalar(1.75);
  // (the mesher already centres the footprint on the origin)

  // ---- colliders from the cells: 2 × 2 voxel columns (half a metre) blocked in a height band ----
  const rectsAt = (y0: number, y1: number, keep: (x: number, z: number) => boolean) => {
    const out: Rect[] = [];
    for (let z = 0; z < W; z += 2) {
      let run = -1;
      for (let x = 0; x <= W; x += 2) {
        let hit = false;
        if (x < W && keep(x, z))
          for (let y = y0; y < y1 && !hit; y++) hit = !!(m.get(x, y, z) || m.get(x + 1, y, z) || m.get(x, y, z + 1) || m.get(x + 1, y, z + 1));
        if (hit && run < 0) run = x;
        if (!hit && run >= 0) {
          const a = toWorld(run, 0, z),
            c = toWorld(x, 0, z + 2);
          out.push([a.x, a.z, c.x, c.z]);
          run = -1;
        }
      }
    }
    return out;
  };
  const near = (r: number) => (x: number, z: number) => Math.max(Math.abs(x + 1 - CX), Math.abs(z + 1 - CZ)) < r;
  const balconyRects = rectsAt(Y0 + 1, Y0 + 7, near(36));
  const crownRects = rectsAt(CROWN_V + 1, CROWN_V + 9, (x, z) => Math.hypot(x + 1 - AX, z + 1 - AZ) < 30);

  const skinAt = (y: number, dx: number, dz: number) => {
    const v = Math.round(y / S);
    const l = Math.hypot(dx, dz) || 1;
    for (let r = 4; r < 40; r += 0.5) {
      const x = Math.round(AX + (dx / l) * r),
        z = Math.round(AZ + (dz / l) * r);
      if (m.get(x, v, z)) return r * S;
    }
    return 0;
  };

  return { object, balconyRects, crownRects, skinAt, windows, eyes, model: m };
}
