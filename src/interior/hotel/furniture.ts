import * as THREE from "three";
import { C, E, G, hash, shades, VoxelModel } from "../../scene/voxel/model";
import { FINE } from "../furniture";

/**
 * The hotel's own voxel furniture (12 voxels a metre, facing +z, standing on y = 0, centred on x and
 * z), plus a few pieces built from plain meshes (chandeliers, the roulette wheel).
 */

const m = (w: number, h: number, d: number) => new VoxelModel(w, h, d);
const metal = C("#b8bcc6");
const black = C("#18161e");
const white = C("#f2eee6");
const gold = C("#c9a227");
const darkWood = (seed = 2) => shades(["#4a3020", "#442c1e", "#503424"], 2, seed);
const wood = (seed = 1) => shades(["#8a6440", "#7e5a38", "#93693f"], 2, seed);
const fabric = (hex: string, seed = 3) => {
  const c = new THREE.Color(hex);
  const d = c.clone().offsetHSL(0, 0, -0.03).getHexString(),
    l = c.clone().offsetHSL(0, 0, 0.03).getHexString();
  return shades([hex, `#${d}`, `#${l}`], 3, seed);
};

// ---- casino -------------------------------------------------------------------------------------------

/** A slot machine: base, cabinet with a recessed screen (a live canvas goes in), button deck, lit topper. */
export function slotMachine(color: string) {
  const v = m(9, 24, 9);
  v.box(0, 0, 0, 9, 7, 8, C("#1c1a22"));
  v.box(0, 7, 0, 9, 21, 7, C(color));
  v.box(0, 7, 6, 9, 9, 9, C("#24222a"));
  for (let x = 1; x < 8; x += 2) v.set(x, 9, 7, E(["#ff3e8a", "#3ee08f", "#f4b728", "#3ef0ff"][(x >> 1) % 4], 1.8));
  v.box(1, 10, 6, 8, 19, 7, black);
  v.box(0, 20, 0, 9, 24, 7, C("#2a2830"));
  v.box(0, 20, 7, 9, 24, 7, E(color, 1.2));
  v.box(0, 7, 7, 1, 20, 7, E("#f4b728", 1.4));
  v.box(8, 7, 7, 9, 20, 7, E("#f4b728", 1.4));
  v.box(9, 12, 3, 9, 16, 4, metal);
  v.box(9, 16, 3, 9, 17, 4, C("#d0303a"));
  return v;
}

/** A card table: a half-moon (blackjack, baccarat) or an oval (poker), felt, padded rail, chips. */
export function cardTable(felt: string, oval = false) {
  const W = 28,
    D = oval ? 18 : 16,
    v = m(W, 11, D);
  const rail = C("#3a2418"),
    pad = C("#1c1418");
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const nx = (x + 0.5 - W / 2) / (W / 2);
      const nz = oval ? (z + 0.5 - D / 2) / (D / 2) : (z + 0.5) / D;
      const r = oval ? nx * nx + nz * nz : nx * nx + nz * nz * 1.0;
      if (r > 1) continue;
      v.box(x, 8, z, x + 1, 9, z + 1, r > 0.78 ? pad : C(felt));
      if (r > 0.86) v.set(x, 9, z, pad);
    }
  if (!oval) v.box(1, 8, 0, W - 1, 10, 1, rail);
  v.box(10, 0, 4, 18, 8, 10, darkWood());
  v.box(8, 0, 3, 20, 1, 11, C("#2a2830"));
  // the chip tray and the shoe on the dealer side, chips and cards on the felt
  if (!oval) {
    v.box(10, 9, 1, 18, 9, 3, black);
    for (let x = 10; x < 18; x++) v.set(x, 9, 2, C(["#d0303a", "#2a78d6", "#3ee08f", "#f4b728", "#ece8e0"][x % 5]));
    v.box(20, 9, 1, 23, 11, 4, C("#5a1a2a"));
  } else v.box(12, 9, 8, 16, 10, 10, C("#f4b728"));
  const spots = oval ? [[5, 9], [9, 3], [19, 3], [23, 9], [9, 15], [19, 15]] : [[4, 7], [8, 10], [14, 12], [20, 10], [24, 7]];
  spots.forEach(([x, z], i) => {
    v.box(x - 1, 9, z, x + 1, 9, z + 1, white);
    v.set(x + 1, 9, z - 1, C(["#d0303a", "#2a78d6", "#f4b728"][i % 3]));
    v.set(x + 1, 10, z - 1, C(["#d0303a", "#2a78d6", "#f4b728"][i % 3]));
  });
  return v;
}

/** The roulette table: wood and felt (the betting layout and the wheel are laid on top in meshes). */
export function rouletteTable() {
  const v = m(36, 10, 16);
  v.box(0, 0, 0, 36, 1, 16, C("#2a2830"));
  for (const [x, z] of [[2, 2], [32, 2], [2, 12], [32, 12]]) v.box(x, 0, z, x + 2, 8, z + 2, darkWood());
  v.box(0, 8, 0, 36, 9, 16, darkWood(6));
  v.box(0, 9, 0, 36, 10, 16, C("#3a2418"));
  v.clear(1, 9, 1, 35, 10, 15);
  v.box(1, 8, 1, 35, 9, 15, C("#1f6a3a"));
  return v;
}

/** A crystal chandelier: tiers of glowing drops round a gold frame (one draw call for the drops). */
export function chandelier(r = 1.2, tiers = 4, color = "#fff2d0") {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: "#c9a227", roughness: 0.3, metalness: 0.85 });
  const drops: THREE.Matrix4[] = [];
  for (let t = 0; t < tiers; t++) {
    const rr = r * (1 - t * 0.22),
      y = -t * 0.32;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.025, 6, 40), frameMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
    const n = Math.round(rr * 22);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const len = 0.12 + hash(i, t, 3) * 0.16;
      drops.push(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * rr, y - len / 2 - 0.03, Math.sin(a) * rr), new THREE.Quaternion(), new THREE.Vector3(1, len / 0.12, 1)));
    }
  }
  const im = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), toneMapped: false }), drops.length);
  drops.forEach((d, i) => im.setMatrixAt(i, d));
  g.add(im);
  const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.3), toneMapped: false }));
  core.position.y = -tiers * 0.2;
  g.add(core);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), frameMat);
  rod.position.y = 0.6;
  g.add(rod);
  return g;
}

// ---- the atrium ------------------------------------------------------------------------------------

/** A long front desk in marble with a gold band and a lit plinth, monitors and a bell. */
export function frontDesk(len: number) {
  const W = Math.round(len * FINE),
    v = m(W, 14, 10);
  v.box(0, 0, 1, W, 1, 10, black);
  v.box(0, 1, 0, W, 13, 9, shades(["#f0ece4", "#e6e0d6", "#f6f2ea"], 2, 7));
  v.box(0, 13, 0, W, 14, 10, C("#2a2630"));
  v.box(0, 9, 9, W, 10, 10, gold);
  v.box(0, 1, 9, W, 2, 10, E("#ffd28a", 1.4));
  for (let x = 6; x < W - 4; x += 16) {
    v.box(x, 14, 1, x + 5, 18, 2, black);
    v.box(x + 1, 15, 2, x + 4, 17, 2, E("#3ef0ff", 1.2));
  }
  v.set(Math.round(W / 2), 14, 6, gold);
  return v;
}

/** A brass luggage trolley with a birdcage top and a stack of suitcases. */
export function trolley(seed = 1) {
  const v = m(12, 24, 18);
  const brass = C("#c9a227");
  v.box(0, 1, 0, 12, 2, 18, C("#7a1a2a"));
  for (const [x, z] of [[0, 0], [11, 0], [0, 17], [11, 17]]) {
    v.box(x, 0, z, x + 1, 1, z + 1, black);
    v.box(x, 2, z, x + 1, 22, z + 1, brass);
  }
  for (let z = 0; z < 18; z++) v.set(0, 22 + Math.round(Math.sin((z / 17) * Math.PI) * 2), z, brass);
  for (let z = 0; z < 18; z++) v.set(11, 22 + Math.round(Math.sin((z / 17) * Math.PI) * 2), z, brass);
  v.box(0, 22, 8, 12, 25, 9, brass);
  const cols = ["#2a4a6a", "#6a3a2a", "#c8b89a", "#3a3a3a", "#8a2a3a"];
  let y = 2;
  for (let k = 0; k < 3; k++) {
    const h = 3 + Math.floor(hash(k, seed, 2) * 4);
    v.box(1 + k, y, 2 + k, 11 - k, y + h, 16 - k, C(cols[(k + seed) % cols.length]));
    v.box(5, y + h, 8, 7, y + h + 1, 9, black);
    y += h;
  }
  v.box(2, 2, 15, 6, 14, 17, C(cols[(seed + 3) % cols.length]));
  return v;
}

/** A plush lounge chair, deep and curved. */
export function clubChair(color: string) {
  const v = m(12, 11, 12);
  const f = fabric(color, 5);
  v.box(1, 0, 1, 11, 1, 11, black);
  v.box(0, 1, 0, 12, 4, 12, f);
  v.box(2, 4, 2, 10, 6, 11, fabric(color, 9));
  for (let x = 0; x < 12; x++) {
    const h = 11 - Math.round(Math.abs(x - 5.5) * 0.6);
    v.box(x, 4, 0, x + 1, h, 3, f);
  }
  v.box(0, 4, 0, 2, 8, 11, f);
  v.box(10, 4, 0, 12, 8, 11, f);
  return v;
}

/** A round side table with a lamp. */
export function sideTable(lamp = true) {
  const v = m(6, lamp ? 15 : 7, 6);
  v.box(0, 6, 0, 6, 7, 6, gold);
  v.box(2, 0, 2, 4, 6, 4, C("#2a2630"));
  v.box(1, 0, 1, 5, 1, 5, C("#2a2630"));
  if (lamp) {
    v.box(2, 7, 2, 4, 10, 4, C("#e8dcc0"));
    v.box(1, 10, 1, 5, 14, 5, C("#f4ead0"));
    v.box(2, 9, 2, 4, 10, 4, E("#ffe2b0", 1));
  }
  return v;
}

// ---- rooms ---------------------------------------------------------------------------------------------

/** A king bed: a tall upholstered headboard with a gold frame, white linen, four pillows, a runner. */
export function kingBed(head: string, runner: string) {
  const v = m(24, 18, 27);
  v.box(0, 0, 1, 24, 4, 27, darkWood(8));
  v.box(0, 0, 0, 24, 18, 2, gold);
  v.box(1, 1, 0, 23, 17, 2, fabric(head, 7));
  for (let x = 3; x < 22; x += 4) for (let y = 4; y < 16; y += 4) v.set(x, y, 2, C(head));
  v.box(1, 4, 2, 23, 7, 26, white);
  v.box(1, 7, 10, 23, 8, 26, C("#f8f6f2"));
  v.box(0, 3, 10, 1, 7, 26, C("#f8f6f2"));
  v.box(23, 3, 10, 24, 7, 26, C("#f8f6f2"));
  v.box(0, 5, 18, 24, 8, 22, C(runner));
  v.box(0, 7, 18, 24, 8, 19, gold);
  for (const x of [2, 12]) v.box(x, 7, 3, x + 10, 10, 6, white);
  for (const x of [3, 13]) v.box(x, 7, 6, x + 8, 9, 8, C("#ece4d4"));
  v.box(10, 7, 8, 14, 9, 9, C(runner));
  return v;
}

/** A bench at the foot of the bed. */
export function bedBench(color: string) {
  const v = m(18, 6, 6);
  v.box(0, 3, 0, 18, 6, 6, fabric(color));
  for (const [x, z] of [[0, 0], [17, 0], [0, 5], [17, 5]]) v.box(x, 0, z, x + 1, 3, z + 1, gold);
  return v;
}

/** A writing desk with a lamp, a leather blotter and the room directory. */
export function writingDesk() {
  const v = m(16, 16, 7);
  v.box(0, 8, 0, 16, 9, 7, darkWood(4));
  v.box(0, 0, 0, 1, 8, 7, darkWood(4));
  v.box(15, 0, 0, 16, 8, 7, darkWood(4));
  v.box(1, 6, 0, 15, 8, 6, darkWood(5));
  v.box(5, 9, 2, 11, 9, 6, C("#3a2418"));
  v.box(12, 9, 1, 14, 10, 3, black);
  v.box(13, 10, 2, 13, 13, 2, metal);
  v.box(11, 13, 0, 16, 16, 4, C("#f4ead0"));
  v.box(12, 12, 1, 15, 13, 3, E("#ffe2b0", 1));
  v.box(2, 9, 3, 4, 10, 6, C("#c9a227"));
  return v;
}

/** The minibar: a cabinet with a lit glass fridge, a coffee machine, glasses. */
export function minibar() {
  const v = m(12, 12, 6);
  v.box(0, 0, 0, 12, 11, 6, darkWood(3));
  v.box(0, 11, 0, 12, 12, 6, C("#e8e2d8"));
  v.box(1, 1, 6, 6, 9, 6, G("#9cc3df"));
  for (let x = 1; x < 6; x++) v.box(x, 2, 4, x + 1, 2 + 2 + (x % 3), 5, G(["#3ee08f", "#f4b728", "#ff7ab0"][x % 3]));
  v.box(1, 9, 5, 6, 9, 6, E("#cfeaff", 1));
  v.box(7, 1, 6, 11, 10, 6, darkWood(5));
  v.box(8, 12, 1, 11, 16, 4, black);
  v.set(9, 14, 4, E("#ff9f2e", 1.6));
  for (const x of [2, 4]) v.box(x, 12, 2, x + 1, 14, 3, G("#e8f4ff"));
  return v;
}

/** A walk-in shower: tiled walls on two sides, glass in front, a rain head. */
export function shower() {
  const v = m(14, 27, 14);
  const tile = (x: number, y: number, z: number) => C(((x >> 1) + (y >> 1) + (z >> 1)) % 2 ? "#d8d4cc" : "#cec9c0");
  v.box(0, 0, 0, 14, 1, 14, C("#bdb6aa"));
  v.box(0, 0, 0, 14, 27, 1, tile);
  v.box(0, 0, 0, 1, 27, 14, tile);
  v.box(13, 0, 13, 14, 25, 14, metal);
  v.box(1, 1, 13, 13, 25, 14, G("#c8e0ec"));
  v.box(6, 25, 1, 7, 26, 6, metal);
  v.box(4, 24, 4, 9, 25, 9, metal);
  v.box(1, 12, 1, 3, 14, 3, metal);
  v.box(6, 1, 6, 8, 1, 8, black);
  return v;
}

/** A double vanity: two basins in a stone top, a long mirror lit from behind. */
export function doubleVanity() {
  const v = m(22, 27, 7);
  v.box(0, 0, 0, 22, 9, 6, darkWood(6));
  v.box(0, 9, 0, 22, 10, 7, shades(["#2a2630", "#34303a"], 2, 3));
  for (const x of [5, 15]) {
    v.box(x - 3, 10, 2, x + 3, 11, 6, white);
    v.box(x, 11, 1, x + 1, 13, 3, gold);
  }
  v.box(1, 13, 0, 21, 26, 1, G("#c0ccd8"));
  v.box(0, 13, 0, 1, 26, 1, E("#ffe6c0", 1.2));
  v.box(21, 13, 0, 22, 26, 1, E("#ffe6c0", 1.2));
  v.box(9, 10, 3, 13, 11, 5, C("#e8e0d0"));
  return v;
}

/** A freestanding oval bathtub, filled. */
export function freeTub() {
  const v = m(11, 8, 22);
  for (let z = 0; z < 22; z++)
    for (let x = 0; x < 11; x++) {
      const nx = (x + 0.5 - 5.5) / 5.5,
        nz = (z + 0.5 - 11) / 11;
      const r = nx * nx + nz * nz;
      if (r > 1) continue;
      v.box(x, 0, z, x + 1, r > 0.6 ? 8 : 3, z + 1, white);
      if (r <= 0.6) v.set(x, 5, z, G("#7fd0e8"));
    }
  v.box(5, 8, 1, 6, 10, 2, gold);
  return v;
}

/** A cushioned seat in the bay window, `len` metres. */
export function windowSeat(len: number, color: string) {
  const W = Math.round(len * FINE),
    v = m(W, 7, 8);
  v.box(0, 0, 0, W, 4, 8, C("#e8e2d8"));
  v.box(0, 4, 0, W, 6, 8, fabric(color));
  for (let x = 2; x < W - 4; x += 9) v.box(x, 6, 6, x + 4, 9, 8, C(x % 2 ? "#c9a227" : "#f2eee6"));
  return v;
}

/** A suitcase open on a luggage rack. */
export function luggageRack(color: string) {
  const v = m(9, 8, 6);
  for (const x of [0, 8]) v.box(x, 0, 0, x + 1, 5, 6, gold);
  v.box(0, 5, 0, 9, 5, 6, C("#2a2418"));
  v.box(0, 5, 1, 9, 8, 5, C(color));
  v.box(1, 7, 1, 8, 8, 5, C("#e8e2d8"));
  return v;
}

// ---- spa, restaurant, SkyPark -----------------------------------------------------------------

export function massageTable() {
  const v = m(9, 9, 24);
  for (const [x, z] of [[1, 1], [7, 1], [1, 21], [7, 21]]) v.box(x, 0, z, x + 1, 7, z + 1, wood());
  v.box(0, 7, 0, 9, 9, 24, C("#e8e2d8"));
  v.box(3, 7, 0, 6, 9, 2, C("#c8c0b0"));
  v.box(0, 9, 8, 9, 10, 18, C("#f6f2ea"));
  v.box(2, 9, 20, 7, 10, 23, C("#a8c8a0"));
  return v;
}

/** The sauna: a cedar cabin with a glass front, benches in tiers, the stove. */
export function sauna() {
  const v = m(36, 30, 30);
  const cedar = shades(["#b07a4a", "#a87244", "#b88452"], 2, 4);
  v.box(0, 0, 0, 36, 30, 30, cedar);
  v.clear(1, 1, 1, 35, 29, 29);
  v.clear(2, 1, 29, 34, 28, 30);
  v.box(2, 1, 29, 34, 28, 30, G("#d8a878"));
  v.box(1, 6, 1, 35, 7, 10, cedar);
  v.box(1, 11, 1, 35, 12, 6, cedar);
  v.box(1, 1, 1, 35, 6, 10, C("#8a5a34"));
  v.box(28, 1, 18, 34, 10, 26, C("#2a2830"));
  v.box(29, 10, 19, 33, 12, 25, shades(["#6a6a72", "#5a5a62"], 1, 2));
  v.box(30, 12, 21, 31, 12, 22, E("#ff6a2a", 1.2));
  for (let x = 4; x < 32; x += 6) v.box(x, 27, 2, x + 2, 28, 4, E("#ffb070", 1.2));
  return v;
}

/** A round dining table, white cloth to the floor, a candle and place settings. */
export function roundTable(seats = 4) {
  const v = m(14, 11, 14);
  for (let z = 0; z < 14; z++)
    for (let x = 0; x < 14; x++) {
      const r = (x + 0.5 - 7) ** 2 + (z + 0.5 - 7) ** 2;
      if (r <= 49) v.set(x, 9, z, white);
      if (r <= 36 && r > 20) v.box(x, 0, z, x + 1, 9, z + 1, C("#ece6dc"));
    }
  for (let k = 0; k < seats; k++) {
    const a = (k / seats) * Math.PI * 2;
    const x = 7 + Math.cos(a) * 4.6,
      z = 7 + Math.sin(a) * 4.6;
    v.set(x, 10, z, C("#e8e8f0"));
    v.set(7 + Math.cos(a) * 3.4, 10, 7 + Math.sin(a) * 3.4, G("#e0f0ff"));
  }
  v.box(6, 10, 6, 8, 11, 8, gold);
  v.set(7, 11, 7, E("#ffcf70", 2));
  return v;
}

/** A dining chair in velvet. */
export function velvetChair(color: string) {
  const v = m(6, 13, 6);
  for (const [x, z] of [[0, 0], [5, 0], [0, 5], [5, 5]]) v.box(x, 0, z, x + 1, 5, z + 1, gold);
  v.box(0, 5, 0, 6, 6, 6, fabric(color));
  v.box(0, 6, 0, 6, 13, 1, fabric(color, 8));
  return v;
}

/** A wine wall: a lit cabinet floor to ceiling, bottles lying in racks. */
export function wineWall(len: number, h: number) {
  const W = Math.round(len * FINE),
    H = Math.round(h * FINE),
    v = m(W, H, 5);
  v.box(0, 0, 0, W, H, 5, darkWood(12));
  for (let y = 2; y < H - 3; y += 4) {
    v.clear(1, y, 1, W - 1, y + 3, 5);
    v.box(1, y - 1, 1, W - 1, y, 5, E("#ffd8a0", 0.6));
    for (let x = 1; x < W - 1; x += 2) v.box(x, y, 1, x + 1, y + 1, 4, C(["#3a0a14", "#2a3a1a", "#1a1a2a", "#5a1a1a"][Math.floor(hash(x, y, 9) * 4)]));
  }
  v.box(0, 0, 4, W, H, 5, G("#a8c0d0"));
  return v;
}

/** A pass in the open kitchen: steel counter, heat lamps, plates. */
export function kitchenPass(len: number) {
  const W = Math.round(len * FINE),
    v = m(W, 26, 8);
  v.box(0, 0, 0, W, 11, 8, shades(["#c0c4cc", "#b8bcc4"], 1, 5));
  v.box(0, 11, 0, W, 12, 8, C("#d8dce4"));
  for (let x = 3; x < W - 3; x += 8) {
    v.box(x, 22, 2, x + 1, 26, 3, metal);
    v.box(x - 2, 21, 1, x + 3, 22, 5, C("#2a2830"));
    v.box(x - 1, 20, 2, x + 2, 21, 4, E("#ff9a4a", 1.4));
    v.box(x - 2, 12, 3, x + 2, 12, 6, white);
    v.set(x, 12, 4, C(["#d0503a", "#3ea04a", "#f4b728"][(x >> 3) % 3]));
  }
  return v;
}

/** A coconut palm in a planter, ~4.6 m: a leaning ringed trunk and drooping fronds. */
export function palm(seed = 1, planter = true) {
  const v = m(60, 58, 60);
  const cx = 30,
    cz = 30;
  if (planter) {
    v.box(cx - 8, 0, cz - 8, cx + 8, 6, cz + 8, C("#e8e2d4"));
    v.box(cx - 7, 6, cz - 7, cx + 7, 6, cz + 7, C("#4a3020"));
  }
  const lean = (hash(seed, 1, 2) - 0.5) * 0.3,
    dir = hash(seed, 2, 2) * Math.PI * 2;
  let tx = cx,
    tz = cz;
  const trunkH = 44;
  for (let y = planter ? 6 : 0; y < trunkH; y++) {
    const t = y / trunkH;
    tx = cx + Math.cos(dir) * lean * t * t * 40;
    tz = cz + Math.sin(dir) * lean * t * t * 40;
    const ring = y % 3 === 0;
    v.box(tx - 1, y, tz - 1, tx + 2, y + 1, tz + 2, C(ring ? "#6a5238" : "#8a6c48"));
  }
  const leaf = shades(["#2f8a4a", "#3a9a52", "#287a40", "#45a85a"], 1, seed);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + hash(k, seed, 3) * 0.4;
    const len = 18 + hash(k, seed, 4) * 6;
    for (let s = 0; s < len; s++) {
      const t = s / len;
      const x = tx + Math.cos(a) * s,
        z = tz + Math.sin(a) * s,
        y = trunkH + 2 + Math.sin(t * Math.PI * 0.8) * 5 - t * t * 10;
      const w = Math.round((1 - t) * 3) + 1;
      for (let q = -w; q <= w; q++) v.set(x - Math.sin(a) * q, y - Math.abs(q) * 0.4, z + Math.cos(a) * q, leaf);
    }
  }
  for (let k = 0; k < 4; k++) v.box(tx - 1 + (k % 2) * 2, trunkH - 1, tz - 1 + (k >> 1) * 2, tx + (k % 2) * 2, trunkH + 1, tz + (k >> 1) * 2, C("#5a4a2a"));
  return v;
}

/** A cabana: four posts, a canvas roof, curtains tied back, a daybed with cushions. */
export function cabana(color: string) {
  const v = m(30, 32, 30);
  const post = C("#e8e2d4");
  for (const [x, z] of [[0, 0], [29, 0], [0, 29], [29, 29]]) v.box(x, 0, z, x + 1, 30, z + 1, post);
  v.box(0, 30, 0, 30, 31, 30, C("#f4f0e8"));
  v.box(2, 31, 2, 28, 32, 28, C("#f4f0e8"));
  for (let x = 0; x < 30; x++) v.box(x, 27, 0, x + 1, 30, 1, C(x % 4 < 2 ? color : "#f4f0e8"));
  for (let x = 0; x < 30; x++) v.box(x, 27, 29, x + 1, 30, 30, C(x % 4 < 2 ? color : "#f4f0e8"));
  for (const z of [0, 29]) {
    v.box(0, 3, z, 3, 27, z + 1, C("#f4f0e8"));
    v.box(27, 3, z, 30, 27, z + 1, C("#f4f0e8"));
  }
  v.box(0, 0, 1, 1, 27, 29, C("#f4f0e8"));
  v.box(3, 0, 3, 27, 4, 27, C("#d8d0c0"));
  v.box(3, 4, 3, 27, 6, 27, C("#f8f6f0"));
  v.box(3, 6, 3, 27, 10, 6, fabric(color));
  for (const x of [6, 13, 20]) v.box(x, 6, 6, x + 5, 9, 8, C(x === 13 ? "#c9a227" : "#f2eee6"));
  return v;
}

/** A sun lounger on teak, with a rolled towel. */
export function teakLounger(towel: string) {
  const v = m(8, 9, 24);
  const teak = shades(["#9a6a40", "#8a5e38"], 1, 3);
  for (const z of [1, 21]) for (const x of [0, 7]) v.box(x, 0, z, x + 1, 3, z + 1, teak);
  v.box(0, 3, 0, 8, 4, 18, teak);
  v.box(1, 4, 0, 7, 5, 18, C("#f6f2ea"));
  for (let k = 0; k < 6; k++) v.box(0, 4 + k, 18 + k, 8, 5 + k, 19 + k, teak);
  for (let k = 0; k < 6; k++) v.box(1, 5 + k, 18 + k, 7, 6 + k, 19 + k, C("#f6f2ea"));
  v.box(1, 5, 2, 7, 6, 8, C(towel));
  return v;
}

/** A coin-operated observation telescope on a post. */
export function binoculars() {
  const v = m(8, 18, 8);
  v.box(3, 0, 3, 5, 12, 5, C("#2a3a4a"));
  v.box(1, 0, 1, 7, 1, 7, C("#2a3a4a"));
  v.box(1, 12, 1, 7, 16, 7, C("#3a5a7a"));
  v.box(1, 13, 7, 3, 15, 8, black);
  v.box(5, 13, 7, 7, 15, 8, black);
  v.box(2, 13, 0, 6, 15, 1, G("#9cc3df"));
  v.set(4, 16, 4, E("#f4b728", 1.6));
  return v;
}
