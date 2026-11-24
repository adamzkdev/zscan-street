/// <reference lib="webworker" />
import * as THREE from "three";
import { ACROSS, CURB } from "../city/plan";
import { VOX } from "../voxel/model";
// (the trees are drawn realistic on the main thread; the voxel builders give the lots' layouts only: signs, doors, lights)
import { buildLot } from "./models";
import { kBeachBar, kBeachSet, keysLot, kLetter, kLifeguard, kPark, kPier, kRock, kSandcastle, kTowel, kTunnel, kVolleyNet, type KRGeo, type KSlot, type KW, type Layout } from "../real/keysreal";
import { beachSpots, faceOut, faceYaw, KBED, KEYS, KGRID, KPARK, KPIER, kLots, kStreets, KTUNNEL, KX, sandAt } from "./plan";

/**
 * Orchard Keys built off the main thread (src/scene/keys): every lot, the beach's huts, umbrellas,
 * loungers and bars, the pier, the park, the letters on the bluff and the tunnel — realistic geometry
 * (src/scene/real/keysreal.ts: metres, UVs for the photographed sets, a material slot per surface),
 * put in place and merged per slot a 64 m sector at a time. Sent back as compact arrays (byte normals,
 * half-float colours), with the signs, the lamps, the shops' doors, the trees and the parked cars.
 */

export interface KGeo {
  pos: Float32Array;
  nor: Int8Array;
  uv: Float32Array;
  col: Uint16Array;
  idx: Uint32Array | Uint16Array;
}
export interface KSignOut {
  text: string;
  color: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: number;
  h: number;
  vertical: boolean;
  both: boolean;
}
export interface KFacade {
  type: string;
  name: string;
  face: "n" | "s" | "e" | "w";
  door: [number, number];
  out: [number, number];
}
export interface KOut {
  chunks: { centre: [number, number]; geos: Partial<Record<KSlot, KGeo>> }[];
  signs: KSignOut[];
  lights: [number, number, number, string][];
  facades: KFacade[];
  palms: [number, number][];
  /** The trees, drawn realistic on the main thread (src/scene/real/trees.ts): x, y, z, species, seed. */
  trees: [number, number, number, string, number][];
  /** The street lamps (x, y, z, yaw), drawn realistic on the main thread. */
  lamps: [number, number, number, number][];
  /** The parked cars (x, z, yaw, paint index; the last index a taxi): placed on the main thread, realistic. */
  cars: [number, number, number, number][];
  /** What stops a body or a car out there: trunks, posts, rocks, the letters (x, z, radius). */
  circles: [number, number, number][];
  ms: number;
}

const toHalf = THREE.DataUtils.toHalfFloat;
/** A slot's geometry of a sector, growing as things are put in it. */
interface Acc {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
  idx: number[];
}
/** Packed for the main thread, its positions from the sector's centre (the mesh stands there: see keys/index.ts). */
function pack(a: Acc, cx: number, cz: number, out: Transferable[]): KGeo {
  const pos = Float32Array.from(a.pos);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = a.pos[i] - cx;
    pos[i + 2] = a.pos[i + 2] - cz;
  }
  const nor = new Int8Array(a.nor.length);
  for (let i = 0; i < a.nor.length; i++) nor[i] = Math.round(a.nor[i] * 127);
  const col = new Uint16Array(a.col.length);
  for (let i = 0; i < a.col.length; i++) col[i] = toHalf(a.col[i]);
  const uv = Float32Array.from(a.uv);
  const idx = pos.length / 3 <= 65535 ? Uint16Array.from(a.idx) : Uint32Array.from(a.idx);
  out.push(pos.buffer, nor.buffer, uv.buffer, col.buffer, idx.buffer);
  return { pos, nor, uv, col, idx };
}

const Y = new THREE.Vector3(0, 1, 0);

/** A house's address: its number along the street it faces (odd one side, even the other) and the street. */
function address(type: string, face: "n" | "s" | "e" | "w", x: number, z: number) {
  const kind: Record<string, string> = { villa: "VILLA", deco: "DECO HOUSE", bungalow: "BUNGALOW" };
  const ns = face === "e" || face === "w";
  const out = faceOut(face);
  let best: { name: string; d: number } | null = null;
  for (const st of kStreets()) {
    if ((st.axis === "z") !== ns) continue;
    const d = ns ? (st.at - x) * out[0] : (st.at - z) * out[1];
    if (d > 0 && d < 30 && (!best || d < best.d)) best = { name: st.name, d };
  }
  const along = ns ? z - KGRID.north : x - KGRID.west;
  const n = 100 + Math.round(along / 4) * 2 + (face === "e" || face === "s" ? 0 : 1);
  return `${kind[type] ?? "HOUSE"} · ${n} ${(best?.name ?? "Orchard Keys").toUpperCase()}`;
}
const SECTOR = 64;

self.onmessage = (e: MessageEvent<{ hgt: Float32Array; nx: number; nz: number }>) => {
  const t0 = performance.now();
  const { hgt, nx, nz } = e.data;
  /** The ground's height (the main thread's own grid, a metre a cell, from the town's box corner). */
  const ground = (x: number, z: number) => {
    const fx = Math.max(0, Math.min(nx - 1.001, x - KEYS.x0)),
      fz = Math.max(0, Math.min(nz - 1.001, z - KEYS.z0));
    const i = Math.floor(fx),
      j = Math.floor(fz);
    const u = fx - i,
      v = fz - j;
    const a = hgt[i + j * nx],
      b = hgt[i + 1 + j * nx],
      c = hgt[i + (j + 1) * nx],
      d = hgt[i + 1 + (j + 1) * nx];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const sectors = new Map<string, { centre: [number, number]; parts: Map<KSlot, Acc> }>();
  const built = new Map<string, { geos: Partial<Record<KSlot, KRGeo>>; trees: KW["trees"] }>();
  const signs: KSignOut[] = [];
  const lights: KOut["lights"] = [];
  const facades: KFacade[] = [];
  const palms: [number, number][] = [];
  const trees: [number, number, number, string, number][] = [];
  const lampSpots: [number, number, number, number][] = [];
  const circles: [number, number, number][] = [];
  const cars: [number, number, number, number][] = [];
  /**
   * A realistic model in place: its frame's origin at (x, y, z), turned by yaw; `key` shares the
   * building of copies. Its trees go to the list, in place.
   */
  const put = (model: () => KW, x: number, y: number, z: number, yaw: number, key?: string) => {
    let b = key ? built.get(key) : undefined;
    if (!b) {
      const K = model();
      b = { geos: K.out(), trees: K.trees };
      if (key) built.set(key, b);
    }
    const c = Math.cos(yaw),
      sn = Math.sin(yaw);
    const sk = `${Math.floor(x / SECTOR)}|${Math.floor(z / SECTOR)}`;
    let s = sectors.get(sk);
    if (!s) sectors.set(sk, (s = { centre: [(Math.floor(x / SECTOR) + 0.5) * SECTOR, (Math.floor(z / SECTOR) + 0.5) * SECTOR], parts: new Map() }));
    for (const [k, g] of Object.entries(b.geos) as [KSlot, KRGeo][]) {
      let a = s.parts.get(k);
      if (!a) s.parts.set(k, (a = { pos: [], nor: [], uv: [], col: [], idx: [] }));
      const base = a.pos.length / 3;
      for (let i = 0; i < g.pos.length; i += 3) {
        const px = g.pos[i],
          pz = g.pos[i + 2];
        a.pos.push(x + px * c + pz * sn, y + g.pos[i + 1], z - px * sn + pz * c);
        const nx = g.nor[i],
          nz = g.nor[i + 2];
        a.nor.push(nx * c + nz * sn, g.nor[i + 1], -nx * sn + nz * c);
      }
      for (let i = 0; i < g.uv.length; i++) a.uv.push(g.uv[i]);
      for (let i = 0; i < g.col.length; i++) a.col.push(g.col[i]);
      for (let i = 0; i < g.idx.length; i++) a.idx.push(base + g.idx[i]);
    }
    for (const [tx, ty, tz, sp, seed] of b.trees) trees.push([x + tx * c + tz * sn, y + ty, z - tx * sn + tz * c, sp, seed]);
  };
  /** Model voxels → world, for a model of size (w, d) placed as above. */
  const world = (w: number, d: number, x: number, y: number, z: number, yaw: number) => (vx: number, vy: number, vz: number) =>
    new THREE.Vector3((vx - w / 2) * VOX, vy * VOX, (vz - d / 2) * VOX).applyAxisAngle(Y, yaw).add(new THREE.Vector3(x, y, z));

  // ---- the lots ------------------------------------------------------------------------------------
  for (const l of kLots()) {
    const b = buildLot(l);
    const yaw = faceYaw(l.face);
    // (the lot realistic, on its voxel layout: the door, the signs where they were)
    const W = b.model.w,
      D = b.model.d;
    const lv = (vx: number, vz: number) => [(vx - W / 2) * VOX, (vz - D / 2) * VOX];
    const [dx, dz] = lv(b.door[0], b.door[1]);
    const L: Layout = {
      doorX: dx,
      frontZ: dz,
      signs: b.signs.map((s) => {
        const [sx, sz] = lv(s.x, s.z);
        return { text: s.text, x: sx, y: s.y * VOX, z: sz, w: (s.facing === "side" ? 5.4 : s.w) * VOX, h: s.h * VOX, vertical: s.vertical, facing: s.facing };
      }),
    };
    put(() => keysLot(l, L), l.x, CURB, l.z, yaw);
    const at = world(b.model.w, b.model.d, l.x, CURB, l.z, yaw);
    for (const s of b.signs) {
      const p = at(s.x, s.y, s.z);
      signs.push({ text: s.text, color: s.color, x: p.x, y: p.y, z: p.z, yaw: s.facing === "front" ? yaw : yaw + Math.PI / 2, w: (s.facing === "side" ? 5.4 : s.w) * VOX, h: s.h * VOX, vertical: s.vertical, both: s.facing === "side" });
    }
    for (const q of b.lights) {
      const p = at(q[0], q[1], q[2]);
      lights.push([p.x, p.y, p.z, q[3]]);
    }
    const door = at(b.door[0], 0, b.door[1]);
    const type = l.type === "diner" || l.trade === "tacos" || l.trade === "icecream" ? "cafe" : l.trade === "lounge" ? "bar" : l.type === "shop" || l.type === "gas" ? "streetshop" : l.type === "hotel" || l.type === "motel" || l.type === "club" ? "office" : "house";
    facades.push({ type, name: l.name ?? address(l.type, l.face, door.x, door.z), face: l.face, door: [door.x, door.z], out: faceOut(l.face) });
  }

  // ---- the street: palms and lamps along the kerbs, cars parked on the side streets ---------------
  const R = (() => {
    let a = 20260 >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  /** Near a junction (where the pavement turns the corner and the crossings are)? */
  const junction = (x: number, z: number, m = 4) => KGRID.xs.some((sx, i) => Math.abs(x - sx) < KGRID.xw[i] / 2 + m) && KGRID.zs.some((sz, i) => Math.abs(z - sz) < KGRID.zw[i] / 2 + m);
  const palmKeys = [0, 1, 2, 3].map((k) => `palm${k}`);
  const palmAt = (x: number, z: number, big = false) => {
    const k = Math.floor(R() * 4);
    void palmKeys;
    trees.push([x, CURB, z, "palm", k + (big ? 4 : 0)]);
    palms.push([x, z]);
    circles.push([x, z, 0.4]);
  };
  const lampAt = (x: number, z: number, yaw: number) => {
    // (drawn realistic on the main thread: src/scene/real/props.ts lamp, its head 7.2 m up, 1.55 m out)
    lampSpots.push([x, CURB, z, yaw]);
    circles.push([x, z, 0.3]);
    const p = new THREE.Vector3(0, 7.2, 1.55).applyAxisAngle(Y, yaw);
    lights.push([x + p.x, CURB + p.y, z + p.z, "#ffd9a0"]);
  };
  for (const s of kStreets()) {
    const h = s.width / 2;
    const main = s.at === KX && s.axis === "z";
    const drive = s.axis === "x" && s.at === KGRID.zs[3];
    const step = main ? 10 : drive ? 9 : 16;
    for (const side of [-1, 1]) {
      // (the beach drive's sea side gets the promenade's palms; the hotels' side keeps its terraces)
      if (drive && side < 0) continue;
      const off = s.at + side * (h + 1.3);
      let n = 0;
      for (let t = s.from + 6; t < s.to - 4; t += step) {
        const x = s.axis === "x" ? t : off,
          z = s.axis === "x" ? off : t;
        if (junction(x, z, 5)) continue;
        if (x < KGRID.west + 2 || x > KGRID.east - 2) continue;
        n++;
        if (n % 3 === 0) lampAt(x, z, s.axis === "x" ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2);
        else if (main || drive || n % 3 === 1) palmAt(x + (s.axis === "x" ? 2 : 0), z + (s.axis === "z" ? 2 : 0), main || drive);
      }
    }
  }
  // parked cars along the kerbs of the side streets (pointing along the street)
  const paints: [string, string][] = [
    ["#f6efe2", "#34e7ff"],
    ["#ff7fb0", "#ff4fa3"],
    ["#46c8e0", "#34e7ff"],
    ["#f4b728", "#ff8a3a"],
    ["#2a2a34", "#b56bff"],
    ["#d8333f", "#ff8a3a"],
    ["#9fe0c8", "#4dffb8"],
  ];
  for (const s of kStreets()) {
    if (s.at === KX && s.axis === "z") continue;
    if (s.axis === "x" && s.at === KGRID.zs[3]) continue;
    const h = s.width / 2;
    for (const side of [-1, 1])
      for (let t = s.from + 10; t < s.to - 8; t += 7) {
        if (R() < 0.62) continue;
        const x = s.axis === "x" ? t : s.at + side * (h - 1.15),
          z = s.axis === "x" ? s.at + side * (h - 1.15) : t;
        if (junction(x, z, 6)) continue;
        const k = Math.floor(R() * (paints.length + 1));
        const yaw = s.axis === "x" ? (side > 0 ? 0 : Math.PI) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
        cars.push([x, z, yaw, k]);
        t += 4;
      }
  }
  // the promenade's palms and lamps
  for (let x = KGRID.west + 4; x < KGRID.east - 2; x += 8) {
    if (Math.abs(x - KPIER.x) < 5) continue;
    if (Math.round(x / 8) % 4 === 0) lampAt(x, KGRID.south - 3.2, 0);
    else palmAt(x, KGRID.south - 2.4, true);
  }
  // the west and east strips: palms in a line
  for (let z = KGRID.north + 8; z < KGRID.zs[3] - 10; z += 11) {
    if (junction(KGRID.west + 4, z, 4)) continue;
    palmAt(KGRID.west + 4.5, z, true);
  }

  // ---- Sapling Park -------------------------------------------------------------------------------
  {
    const P = KPARK;
    put(() => kPark(P.x1 - P.x0 - 5, P.z1 - P.z0 - 5), (P.x0 + P.x1) / 2, CURB, (P.z0 + P.z1) / 2, 0);
  }

  // ---- the beach (the same spots the game's beach-goers use: plan.ts beachSpots) ---------------------
  for (const b of beachSpots()) {
    const y = sandAt(b.x, b.z);
    if (b.kind === "set") {
      put(() => kBeachSet(b.seed % 12), b.x, y, b.z, b.yaw, `set${b.seed % 12}`);
      circles.push([b.x, b.z, 0.25]);
    } else if (b.kind === "towel") put(() => kTowel(b.seed % 16), b.x, y + 0.01, b.z, b.yaw, `towel${b.seed % 16}`);
    else if (b.kind === "castle") put(() => kSandcastle(b.seed % 5), b.x, y - 0.02, b.z, b.yaw, `castle${b.seed % 5}`);
    else if (b.kind === "guard") {
      put(() => kLifeguard(b.seed), b.x, y, b.z, b.yaw, `guard${b.seed}`);
      circles.push([b.x, b.z, 2.4]);
    } else if (b.kind === "court") {
      put(kVolleyNet, b.x, y, b.z, b.yaw, "net");
      for (const dx of [-4.9, 4.9]) circles.push([b.x + dx, b.z, 0.2]);
    } else if (b.kind === "palm") {
      trees.push([b.x, y - 0.1, b.z, "palm", b.seed]);
      palms.push([b.x, b.z]);
      circles.push([b.x, b.z, 0.4]);
    } else if (b.kind === "bar") {
      put(kBeachBar, b.x, y, b.z, b.yaw, "bar");
      const p = world(60, 40, b.x, y, b.z, b.yaw)(30, 21.5, 26.2);
      signs.push({ text: b.seed === 1 ? "SHELL BAR" : "TIDE BAR", color: b.seed === 1 ? "#4dffb8" : "#ff4fa3", x: p.x, y: p.y, z: p.z, yaw: b.yaw, w: 30 * VOX, h: 3 * VOX, vertical: false, both: false });
    }
  }
  // the west and east beaches' huts, facing their seas
  put(() => kLifeguard(77), KGRID.west - 14, sandAt(KGRID.west - 14, 330 + ACROSS), 330 + ACROSS, -Math.PI / 2, "guardW");
  put(() => kLifeguard(91), KGRID.east + 14, sandAt(KGRID.east + 14, 330 + ACROSS), 330 + ACROSS, Math.PI / 2, "guardE");
  // the pier
  {
    const P = KPIER;
    const len = P.z1 - P.z0;
    put(() => kPier(len, P.half, P.y, KBED), P.x, KBED, (P.z0 + P.z1) / 2, 0);
    signs.push({ text: "ORCHARD PIER", color: "#34e7ff", x: P.x, y: P.y + 17 * VOX, z: P.z1 - 40.2 * VOX, yaw: Math.PI, w: 26 * VOX, h: 4 * VOX, vertical: false, both: false });
  }

  // ---- the bluff over the town: its sign, palms, pines, bushes and rocks ----------------------------
  {
    const text = "ORCHARD KEYS";
    const px = 5,
      pitch = 5 * px * VOX + 1.3;
    const x0 = 214 - (text.length * pitch) / 2;
    const z = 246 + ACROSS;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === " ") continue;
      const x = x0 + i * pitch + pitch / 2;
      let low = Infinity;
      for (let dx = -2; dx <= 2; dx += 1) for (let dz = -1; dz <= 1; dz += 1) low = Math.min(low, ground(x + dx, z + dz));
      put(() => kLetter(ch, px, 16), x, low - 0.3, z, 0, `letter${ch}`);
      for (let dx = -1.8; dx <= 1.8; dx += 0.9) circles.push([x + dx, z + 0.2, 0.7]);
    }
    lights.push([214, ground(214, z + 4) + 2, z + 5, "#fff2d8"]);
    let seed = 1;
    for (let x = KEYS.x0 + 6; x < KEYS.x1 - 6; x += 2.6)
      for (let z = KGRID.north - 22; z < KGRID.north - 0.5; z += 2.6) {
        const jx = x + (R() - 0.5) * 2,
          jz = z + (R() - 0.5) * 2;
        const g = ground(jx, jz);
        if (g < 0.5 || Math.abs(jx - KX) < 25 || (jx > 176 && jx < 252 && jz > 241 + ACROSS && jz < 250 + ACROSS)) continue;
        const slope = Math.abs(ground(jx, jz + 1) - ground(jx, jz - 1)) / 2 + Math.abs(ground(jx + 1, jz) - ground(jx - 1, jz)) / 2;
        if (slope > 1.4 || R() > 0.42) continue;
        const k = R();
        const yaw = R() * Math.PI * 2;
        if (k < 0.22) {
          void yaw;
          trees.push([jx, g - 0.15, jz, "palm", seed]);
          palms.push([jx, jz]);
          circles.push([jx, jz, 0.4]);
        } else if (k < 0.62) {
          trees.push([jx, g - 0.1, jz, "bush", seed]);
          circles.push([jx, jz, 0.9]);
        } else if (k < 0.8) {
          trees.push([jx, g - 0.2, jz, R() > 0.5 ? "pine" : "broad", seed]);
          circles.push([jx, jz, 0.45]);
        } else {
          put(() => kRock(seed % 5), jx, g - 0.4, jz, yaw, `rock${seed % 5}`);
          circles.push([jx, jz, 1.1]);
        }
        seed++;
      }
    // a few palms on the beaches either side of the town
    for (let z = KGRID.north + 10; z < KGRID.south; z += 13)
      for (const x of [KGRID.west - 4.5, KGRID.east + 4.5]) {
        if (R() < 0.35 || Math.abs(z - 330 - ACROSS) < 6) continue;
        const px = x + (R() - 0.5) * 2,
          pz = z + (R() - 0.5) * 4;
        trees.push([px, sandAt(px, pz) - 0.1, pz, "palm", seed]);
        palms.push([px, pz]);
        circles.push([px, pz, 0.4]);
        seed++;
      }
  }

  // ---- the tunnel -----------------------------------------------------------------------------------
  {
    const T = KTUNNEL;
    const len = T.z1 - T.z0;
    put(() => kTunnel(len, T.half, T.top), T.x, 0, (T.z0 + T.z1) / 2, 0);
    const y = 0.02 + (T.top + 1.4) * 1;
    signs.push({ text: "ORCHARD TUNNEL", color: "#f4b728", x: T.x, y: y - 0.2, z: T.z0 - 0.05, yaw: Math.PI, w: 7, h: 0.9, vertical: false, both: false });
    for (let z = T.z0 + 2; z < T.z1; z += 10 / 6 * 6) lights.push([T.x, T.top - 0.3, z, "#ffe6b8"]);
  }

  // ---- merge, pack, send -------------------------------------------------------------------------
  const transfer: Transferable[] = [];
  const chunks: KOut["chunks"] = [];
  for (const s of sectors.values()) {
    const geos: Partial<Record<KSlot, KGeo>> = {};
    for (const [k, a] of s.parts) if (a.idx.length) geos[k] = pack(a, s.centre[0], s.centre[1], transfer);
    chunks.push({ centre: s.centre, geos });
  }
  const out: KOut = { chunks, signs, lights, facades, palms, trees, lamps: lampSpots, cars, circles, ms: Math.round(performance.now() - t0) };
  (self as unknown as Worker).postMessage(out, transfer);
};
