/**
 * SAFE BLOCK's three levels (the floor's shape, the sky and its light, the twist's numbers) and their
 * scenery. The rules that change with a level (the dark, the belts) live in tiles.ts; this file only
 * says which a level has, and dresses it.
 *
 * - SHIELDED SEA: the 6 × 6 grid over the glowing shielded sea, searchlights, the corner pylons (the original).
 * - NIGHT MARKET: a crossroads of two hawker streets at night (7 × 7, its four corners taken by the
 *   stalls: walls). LIGHTS OUT: the colours only show in the two sweeping spotlights, in each snark's
 *   lantern, and in the firework that bursts at each call.
 * - PROOF FACTORY: five conveyor rows (7 × 5) over the molten gold, every row running the other way.
 *   The tiles ride the belts and tip over the rollers at the end: stand still and you go with them.
 */
import * as THREE from "three";
import type { SongKey } from "../../music";
import { GEO, block, canvasTex, coin, glow, outline, qBlock, skyDome, skyline, toon, toonSteps } from "../../k3";
import { rng, type Rnd } from "../../kit";
import { liquid } from "./liquid";
import type { AmbienceKind } from "../../../audio/kinds";

/** How far down the void is (the sea, the canal, the molten pool). */
export const SEA_Y = -22;

export interface Decor {
  /** The scenery's life (waves, motes, lanterns), every frame. */
  update(dt: number, time: number): void;
}

export interface TileLevel {
  key: string;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  song?: SongKey;
  ambience?: AmbienceKind;
  /** The grid (tiles 3 m apart): columns, rows; the cells that are no floor (a stall: a wall). */
  nx: number;
  nz: number;
  off?: (gx: number, gz: number) => boolean;
  /** The four seats' spots. */
  start: [number, number][];
  sky: [string, string];
  fog: [number, number];
  /** The sky-and-ground fill (sky, ground, intensity), the sun (colour, intensity, position). */
  hemi: [string, string, number];
  sun: [string, number, [number, number, number]];
  /** The play camera (eye, target). */
  eye: [number, number, number];
  at: [number, number, number];
  /** A tile's dark underside. */
  base: string;
  /** LIGHTS OUT: where the spotlights hang (their beams sweep the floor). */
  dark?: { from: [number, number, number][] };
  /** CONVEYORS: the belts' speed (m/s) in the first round and the last. */
  belt?: [number, number];
  decor(s: THREE.Scene, hx: number, hz: number): Decor;
}

// ---- shared pieces --------------------------------------------------------------------------------

/** Little bright cubes (or orbs) drifting up from the void (one draw), round the arena and never over it. */
function motes(s: THREE.Scene, R: Rnd, n: number, cols: string[], r0: number, r1: number, top: number, o: { geo?: THREE.BufferGeometry; size?: number; speed?: number } = {}) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.InstancedMesh(o.geo ?? GEO.box, mat, n);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  const c = new THREE.Color();
  const P: { x: number; y: number; z: number; v: number; s: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2;
    const d = r0 + R() * (r1 - r0);
    P.push({ x: Math.sin(a) * d, y: SEA_Y + R() * (top - SEA_Y), z: Math.cos(a) * d, v: (1 + R() * 2.5) * (o.speed ?? 1), s: (0.12 + R() * 0.25) * (o.size ?? 1), r: R() * 6 });
    mesh.setColorAt(i, c.set(cols[i % cols.length]));
  }
  s.add(mesh);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3();
  return (dt: number, time: number) => {
    for (let i = 0; i < n; i++) {
      const p = P[i];
      p.y += p.v * dt;
      if (p.y > top) p.y = SEA_Y;
      const k = p.s * Math.min(1, (top - p.y) / 4);
      e.set(time * p.r, time * p.r * 0.7, 0);
      m.compose(v.set(p.x, p.y, p.z), q.setFromEuler(e), sc.set(k, k, k));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/** A pool of voxel sparks (one draw) the scenery bursts on its own: fireworks, strikes, pops. */
function pool(s: THREE.Scene, R: Rnd, n: number, additive: boolean) {
  const mesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !additive }), n);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  const P = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 1, max: 1, s: 0, g: 0 }));
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < n; i++) mesh.setMatrixAt(i, zero);
  const c = new THREE.Color();
  mesh.setColorAt(0, c.set(0xffffff));
  s.add(mesh);
  let next = 0;
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3();
  return {
    burst(x: number, y: number, z: number, cols: readonly string[], k: number, o: { speed?: number; up?: number; g?: number; size?: number; life?: number } = {}) {
      for (let j = 0; j < k; j++) {
        const i = next;
        next = (next + 1) % n;
        const p = P[i];
        const a = R() * Math.PI * 2,
          b = Math.acos(R() * 2 - 1),
          sp = (o.speed ?? 6) * (0.55 + R() * 0.45);
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = Math.sin(b) * Math.cos(a) * sp;
        p.vy = Math.cos(b) * sp + (o.up ?? 0);
        p.vz = Math.sin(b) * Math.sin(a) * sp;
        p.t = 0;
        p.max = (o.life ?? 1) * (0.7 + R() * 0.5);
        p.s = (o.size ?? 0.3) * (0.7 + R() * 0.6);
        p.g = o.g ?? 9;
        mesh.setColorAt(i, c.set(cols[j % cols.length]));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    update(dt: number, time: number) {
      for (let i = 0; i < n; i++) {
        const p = P[i];
        if (p.t >= p.max) continue;
        p.t += dt;
        const d = Math.exp(-1.6 * dt);
        p.vx *= d;
        p.vz *= d;
        p.vy = p.vy * d - p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const k = p.t >= p.max ? 0 : p.s * Math.min(1, (1 - p.t / p.max) * 2.5);
        e.set(time * 7 + i, time * 5 + i, 0);
        m.compose(v.set(p.x, p.y, p.z), q.setFromEuler(e), sc.set(k, k, k));
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** Puffy voxel clouds as one draw (k3's clouds are a draw per puff), drifting slowly round. */
function cloudsI(s: THREE.Scene, R: Rnd, n: number, r: number, y: number, col: string) {
  const parts = 4;
  const mesh = new THREE.InstancedMesh(GEO.box, glow(col), n * parts);
  mesh.raycast = () => {};
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.5;
    const d = r * (0.55 + R() * 0.45);
    q.setFromAxisAngle(v.set(0, 1, 0), R() * Math.PI);
    for (let k = 0; k < parts; k++) {
      m.compose(v.set(Math.cos(a) * d + (k - 1.5) * 4.2, y + R() * 14 + (k % 2) * 1.6, Math.sin(a) * d + R() * 3), q, sc.set(6 + R() * 6, 2.5 + R() * 2.2, 5 + R() * 4));
      mesh.setMatrixAt(i * parts + k, m);
    }
  }
  const g = new THREE.Group();
  g.add(mesh);
  s.add(g);
  return (time: number) => (g.rotation.y = time * 0.006);
}

/** Floating voxel islands round the arena (bobbing): a grassy top, the rock under it, a glowing crystal on some. */
function islands(s: THREE.Scene, R: Rnd, spots: [number, number, number, number][], top: string, rock: string, gems: string[]) {
  const n = spots.length;
  const tops = new THREE.InstancedMesh(GEO.box, toon(top), n);
  const rocks = new THREE.InstancedMesh(GEO.box, toon(rock), n * 2);
  const inks = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide }), n);
  const gem = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) gem.setColorAt(i, c.set(gems[i % gems.length]));
  const all = [tops, rocks, inks, gem];
  for (const x of all) ((x.frustumCulled = false), (x.raycast = () => {}));
  s.add(tops, rocks, inks, gem);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3();
  const ph = spots.map(() => R() * 6);
  return (time: number) => {
    for (let i = 0; i < n; i++) {
      const [x, y0, z, w] = spots[i];
      const y = y0 + Math.sin(time * 0.7 + ph[i]) * 0.6;
      q.setFromAxisAngle(v.set(0, 1, 0), ph[i]);
      tops.setMatrixAt(i, m.compose(v.set(x, y, z), q, sc.set(w, 0.7, w * 0.8)));
      inks.setMatrixAt(i, m.compose(v.set(x, y, z), q, sc.set(w + 0.24, 0.94, w * 0.8 + 0.24)));
      rocks.setMatrixAt(i * 2, m.compose(v.set(x, y - 1.1, z), q, sc.set(w * 0.78, 1.6, w * 0.62)));
      rocks.setMatrixAt(i * 2 + 1, m.compose(v.set(x, y - 2.5, z), q, sc.set(w * 0.4, 1.4, w * 0.34)));
      const gs = i % 3 === 2 ? 0 : 0.9;
      e.set(0.6, time * 0.9 + ph[i], 0.6);
      gem.setMatrixAt(i, m.compose(v.set(x + w * 0.15, y + 1.1 + Math.sin(time * 2 + ph[i]) * 0.2, z), q.setFromEuler(e), sc.set(gs, gs * 1.3, gs)));
    }
    for (const x of all) x.instanceMatrix.needsUpdate = true;
  };
}

/** An instanced mesh of boxes (or `geo`) in the scene, never raycast; `moving`: its bounds go stale, no culling. */
function boxes(s: THREE.Object3D, mat: THREE.Material, n: number, moving = false, geo: THREE.BufferGeometry = GEO.box) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.raycast = () => {};
  if (moving) m.frustumCulled = false;
  s.add(m);
  return m;
}

const INK = () => new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide });
const M4 = new THREE.Matrix4();
const QI = new THREE.Quaternion();
const V3 = new THREE.Vector3();
const SC = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const COL = new THREE.Color();
/** A box's matrix: its middle, its size, its turn about y. */
const boxAt = (x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0) => M4.compose(V3.set(x, y, z), QI.setFromAxisAngle(UP, yaw), SC.set(w, h, d));

/**
 * Sailing boats on the water (four draws): a hull, a cabin, a mast and its sail, a lantern at the bow.
 * Each sails a slow circle round the arena, bobbing on the swell.
 */
function fleet(s: THREE.Scene, R: Rnd, n: number, o: { r0: number; r1: number; hull: string; sail: string[]; lamp: string; size?: number }) {
  const wood = boxes(s, toon(o.hull), n * 2, true);
  const cabin = boxes(s, toon("#f4ead8"), n, true);
  const sail = boxes(s, toon("#ffffff"), n, true);
  const lamp = boxes(s, glow(o.lamp), n, true);
  const B = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2 + R() * 0.6, r: o.r0 + ((i * 0.618) % 1) * (o.r1 - o.r0), w: (0.012 + R() * 0.014) * (i % 2 ? 1 : -1), ph: R() * 6, k: (o.size ?? 1) * (0.85 + R() * 0.5) }));
  B.forEach((b, i) => sail.setColorAt(i, COL.set(o.sail[i % o.sail.length])));
  return (time: number) => {
    for (let i = 0; i < n; i++) {
      const b = B[i];
      const a = b.a + time * b.w;
      const x = Math.cos(a) * b.r,
        z = Math.sin(a) * b.r;
      // (its bow along the way it sails)
      const yaw = -a + (b.w > 0 ? 0 : Math.PI);
      const y = SEA_Y + Math.sin(time * 0.9 + b.ph) * 0.18;
      const k = b.k,
        c = Math.cos(yaw),
        sn = Math.sin(yaw);
      wood.setMatrixAt(i * 2, boxAt(x, y + 0.45 * k, z, 1.9 * k, 0.9 * k, 5.2 * k, yaw));
      wood.setMatrixAt(i * 2 + 1, boxAt(x + sn * 0.5 * k, y + 3.2 * k, z + c * 0.5 * k, 0.22 * k, 5 * k, 0.22 * k, yaw));
      cabin.setMatrixAt(i, boxAt(x - sn * 1.3 * k, y + 1.25 * k, z - c * 1.3 * k, 1.5 * k, 0.8 * k, 1.6 * k, yaw));
      sail.setMatrixAt(i, boxAt(x + sn * 0.2 * k, y + 3.5 * k, z + c * 0.2 * k, 0.14 * k, 3.4 * k, 2.6 * k, yaw + 0.25 + Math.sin(time * 0.5 + b.ph) * 0.12));
      lamp.setMatrixAt(i, boxAt(x + sn * 2.4 * k, y + 1.35 * k, z + c * 2.4 * k, 0.5 * k, 0.6 * k, 0.5 * k, yaw));
    }
    wood.instanceMatrix.needsUpdate = cabin.instanceMatrix.needsUpdate = sail.instanceMatrix.needsUpdate = lamp.instanceMatrix.needsUpdate = true;
  };
}

/** Rocks standing in the water round the arena (two draws), a beacon blinking on some (one draw). */
function stacks(s: THREE.Scene, R: Rnd, n: number, r0: number, r1: number, rock: string, cap: string, light: string) {
  const rocks = boxes(s, toon(rock), n * 2);
  const caps = boxes(s, toon(cap), n);
  const lights = boxes(s, new THREE.MeshBasicMaterial({ color: 0xffffff }), n, true);
  const at: { x: number; y: number; z: number; ph: number; on: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.5,
      d = r0 + R() * (r1 - r0);
    const x = Math.cos(a) * d,
      z = Math.sin(a) * d;
    const w = 3 + R() * 4,
      h = 4 + R() * 9,
      yaw = R() * 3;
    rocks.setMatrixAt(i * 2, boxAt(x, SEA_Y + h / 2 - 1, z, w, h, w * (0.7 + R() * 0.4), yaw));
    rocks.setMatrixAt(i * 2 + 1, boxAt(x + w * 0.5, SEA_Y + h * 0.22, z + w * 0.2, w * 0.7, h * 0.5, w * 0.6, yaw + 0.6));
    caps.setMatrixAt(i, boxAt(x, SEA_Y + h - 0.8, z, w * 0.82, 0.5, w * 0.6, yaw));
    at.push({ x, y: SEA_Y + h - 0.1, z, ph: R() * 6, on: i % 2 === 0 });
    lights.setColorAt(i, COL.set(light));
  }
  return (time: number) => {
    for (let i = 0; i < n; i++) {
      const p = at[i];
      const k = p.on ? (Math.sin(time * 2.2 + p.ph) > 0.2 ? 0.7 : 0.3) : 0;
      lights.setMatrixAt(i, boxAt(p.x, p.y + 0.4, p.z, k, k * 1.4, k));
    }
    lights.instanceMatrix.needsUpdate = true;
  };
}

/** A crowd of little block people (two draws): bodies and heads, each one bobbing, now and then a jump of joy. */
function crowd(s: THREE.Scene, R: Rnd, spots: [number, number, number, number][], coats: string[], skins: string[]) {
  const n = spots.length;
  const body = boxes(s, toon("#ffffff"), n, true);
  const head = boxes(s, toon("#ffffff"), n, true);
  const ph = spots.map(() => R() * 6.28);
  const sz = spots.map(() => 0.85 + R() * 0.35);
  for (let i = 0; i < n; i++) {
    body.setColorAt(i, COL.set(coats[Math.floor(R() * coats.length)]));
    head.setColorAt(i, COL.set(skins[Math.floor(R() * skins.length)]));
  }
  return (time: number) => {
    for (let i = 0; i < n; i++) {
      const [x, y, z, yaw] = spots[i];
      const k = sz[i];
      // (a sway; one in five hops at a time, in a wave round the stands)
      const hop = Math.max(0, Math.sin(time * 5 + ph[i])) * (Math.sin(time * 0.7 + ph[i] * 3) > 0.6 ? 0.35 : 0.05);
      const sw = Math.sin(time * 2.2 + ph[i]) * 0.07;
      body.setMatrixAt(i, boxAt(x + sw, y + 0.45 * k + hop, z, 0.56 * k, 0.9 * k, 0.4 * k, yaw));
      head.setMatrixAt(i, boxAt(x + sw * 1.4, y + 1.14 * k + hop, z, 0.46 * k, 0.46 * k, 0.44 * k, yaw));
    }
    body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
  };
}

// ---- SHIELDED SEA (the original) -------------------------------------------------------------------

function seaDecor(s: THREE.Scene, hx: number, hz: number): Decor {
  const R = rng(0x5ea);
  // a real sea under the grid: the swell in big flat texels, foam on its crests, the arena's glow on it
  const seaT = liquid(s, { kind: "sea", y: SEA_Y, deep: "#17135f", mid: "#3a40c4", hot: "#ff8fe6", foam: "#f6cdf2", fog: "#ffb3dd", cell: 0.7 });
  // the sky all round (the intro and the card see the horizon): a low sun, pink clouds, the haze over the far shore
  const dome = skyDome(s, { sky: ["#3a4fe0", "#ffb3dd"], ground: "#ffb3dd", clouds: 16, cloud: "#fff4fb", cloudShade: "#f4a3d6", disc: { az: 338, el: 15, color: "#fff3cf", size: 11, glow: 5 }, haze: 0.5, rnd: R });
  skyline(s, { r: 150, n: 96, y: SEA_Y - 20, tall: 1.5, rnd: R, night: true });
  const cl = cloudsI(s, R, 9, 170, 30, "#fff0fa");
  // a rim of cool light from behind: the snarks and the tiles get a bright edge
  const rimL = new THREE.DirectionalLight("#8fe8ff", 0.75);
  rimL.position.set(-24, 18, -40);
  s.add(rimL);
  // floating islands round the grid, at all depths, with crystals on them
  const isl = islands(
    s,
    R,
    [
      [-17, -7, -6, 4.2],
      [-22, -12, 6, 5.5],
      [-15, -15, 15, 4.6],
      [18, -8, -4, 4.4],
      [24, -13, 7, 5.8],
      [15, -16, 16, 4.2],
      [-28, -6, -16, 5],
      [29, -7, -15, 4.8],
      [-6, -14, -24, 6],
      [8, -11, -27, 5],
    ],
    "#7ff0c8",
    "#5a3aa8",
    ["#7fe9ff", "#ff8be0", "#ffe27a"],
  );
  // on the water: junks under sail with a lantern at the bow, rocks with their beacons
  const boats = fleet(s, R, 9, { r0: 22, r1: 78, hull: "#3a2a6e", sail: ["#fff0d0", "#ff9ed8", "#9fe8ff"], lamp: "#ffd98a" });
  const rocks = stacks(s, R, 12, 34, 96, "#4a3a98", "#7ff0c8", "#fff3a0");
  // the arena's core, deep under the grid (seen through the gaps as the tiles drop): a glowing crystal, its beam to the sea
  const core = new THREE.Mesh(GEO.box, glow("#8fe8ff"));
  core.position.set(0, -13, 0);
  s.add(core);
  const coreBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.2, 8, 16, 1, true), glow("#8fe8ff", 0.2, true));
  coreBeam.position.set(0, -18, 0);
  s.add(coreBeam);
  // glyph fish leaping out of the sea in arcs, a splash where they go back in
  const NFI = 4;
  const fish = boxes(s, new THREE.MeshBasicMaterial({ color: 0xffffff }), NFI, true);
  const fc = new THREE.Color();
  for (let i = 0; i < NFI; i++) fish.setColorAt(i, fc.set(["#8fe8ff", "#ff9be6", "#ffe27a", "#c79bff"][i]));
  const fishP = Array.from({ length: NFI }, (_, i) => ({ x: 0, z: 0, dx: 0, dz: 0, t: -i * 0.9, dur: 1.6 }));
  const splash = pool(s, R, 90, true);
  const fm = new THREE.Matrix4(),
    fq = new THREE.Quaternion(),
    fe = new THREE.Euler(),
    fv = new THREE.Vector3(),
    fs = new THREE.Vector3(),
    fq2 = new THREE.Quaternion();
  const leap = (dt: number, time: number) => {
    for (let i = 0; i < NFI; i++) {
      const f = fishP[i];
      f.t += dt;
      if (f.t >= f.dur) {
        splash.burst(f.x + f.dx * 7, SEA_Y + 0.5, f.z + f.dz * 7, ["#ffffff", "#ff9eff", "#8fe8ff"], 12, { speed: 4, up: 6, g: 14, size: 0.4, life: 0.9 });
        const a = R() * Math.PI * 2,
          d = 16 + R() * 26,
          b = R() * Math.PI * 2;
        f.x = Math.cos(a) * d;
        f.z = Math.sin(a) * d;
        f.dx = Math.cos(b);
        f.dz = Math.sin(b);
        f.t = -(0.6 + R() * 2.2);
        f.dur = 1.4 + R() * 0.5;
      }
      const k = Math.max(0, f.t) / f.dur;
      const on = f.t > 0;
      const y = SEA_Y + Math.sin(k * Math.PI) * 6;
      fe.set(0, Math.atan2(f.dx, f.dz), 0);
      fq.setFromEuler(fe);
      fq.multiply(fq2.setFromAxisAngle(fv.set(1, 0, 0), (k - 0.5) * 2.2));
      fish.setMatrixAt(i, fm.compose(fv.set(f.x + f.dx * k * 7, y, f.z + f.dz * k * 7), fq, on ? fs.set(0.5, 0.5, 1.6) : fs.set(0, 0, 0)));
    }
    fish.instanceMatrix.needsUpdate = true;
    splash.update(dt, time);
  };
  // glowing orbs rising slowly from the sea
  const orbs = motes(s, R, 20, ["#ff9be6", "#8fe8ff", "#c79bff"], 16, 46, 8, { geo: GEO.ball, size: 3.2, speed: 0.35 });
  // the ZSTREET BLIMP, cruising round below the grid (its nose on +z)
  const blimp = new THREE.Group();
  const env = new THREE.Mesh(GEO.ball, toon("#ff8be0"));
  env.scale.set(3.4, 3.4, 9);
  outline(env, 0.06);
  blimp.add(env);
  outline(block("#ffcf2e", 0.2, 2.6, 1.4, 0, 0, -4.3, blimp), 0.05);
  outline(block("#ffcf2e", 2.6, 0.2, 1.4, 0, 0, -4.3, blimp), 0.05);
  outline(block("#3b2a78", 1.0, 0.8, 2.2, 0, -2, 0.4, blimp), 0.05);
  const blTex = canvasTex(256, 64, (g) => {
    g.fillStyle = "#fff6ff";
    g.beginPath();
    g.roundRect(2, 2, 252, 60, 26);
    g.fill();
    g.font = "900 40px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#6a2bd8";
    g.fillText("ZSTREET", 128, 34);
  });
  for (const side of [1, -1]) {
    const bl = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: blTex, transparent: true }));
    bl.scale.set(5.6, 1.4, 1);
    bl.position.set(side * 1.74, 0.25, 0.2);
    bl.rotation.y = (side * Math.PI) / 2;
    blimp.add(bl);
  }
  s.add(blimp);
  // searchlights sweeping up from the sea
  const beamGeo = new THREE.CylinderGeometry(0.25, 2.2, 110, 12, 1, true);
  beamGeo.translate(0, 55, 0);
  const beamCols = ["#ff8be0", "#7fe9ff", "#ffe27a", "#b48bff"];
  const beams: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(beamGeo, glow(beamCols[i], 0.16, true));
    const a = Math.PI + (i - 1.5) * 0.42;
    b.position.set(Math.sin(a) * 75, SEA_Y, Math.cos(a) * 75);
    b.renderOrder = 1;
    s.add(b);
    beams.push(b);
  }
  const mo = motes(s, R, 56, ["#ff9be6", "#c79bff", "#8fe8ff", "#ffffff"], 15, 46, 5);
  // the neon rim under the grid's edge, the corner pylons with their Z-Blocks
  const rim = glow("#ff8ce0");
  for (const sz of [-1, 1]) block("#ffffff", hx * 2 + 0.9, 0.22, 0.22, 0, -1.45, sz * (hz + 0.45), s, rim);
  for (const sx of [-1, 1]) block("#ffffff", 0.22, 0.22, hz * 2 + 0.9, sx * (hx + 0.45), -1.45, 0, s, rim);
  const qs: THREE.Mesh[] = [];
  for (const [x, z] of [
    [-(hx + 2.3), -(hz + 2.3)],
    [hx + 2.3, -(hz + 2.3)],
    [-(hx + 2.6), 1.5],
    [hx + 2.6, 1.5],
  ]) {
    outline(block("#4a33a0", 1.1, 7, 1.1, x, -4.6, z, s), 0.07);
    outline(block("#ffcf2e", 1.7, 0.4, 1.7, x, -0.9, z, s), 0.06);
    const ring = block("#ff8ce0", 1.3, 0.18, 1.3, x, -2.6, z, s, glow("#ff8ce0"));
    ring.rotation.y = Math.PI / 4;
    const q = qBlock(1.25);
    q.position.set(x, 1.3, z);
    s.add(q);
    qs.push(q);
  }
  return {
    update(dt, time) {
      seaT.value = time;
      mo(dt, time);
      orbs(dt, time);
      leap(dt, time);
      cl(time);
      isl(time);
      boats(time);
      rocks(time);
      dome.rotation.y = time * 0.004;
      core.rotation.set(Math.PI / 4, time * 1.4, Math.PI / 4);
      core.scale.setScalar(1.6 + Math.sin(time * 3) * 0.15);
      const ba = time * 0.07;
      blimp.position.set(Math.sin(ba) * 34, -5 + Math.sin(time * 0.5) * 0.4, Math.cos(ba) * 22 - 4);
      blimp.rotation.y = Math.atan2(34 * Math.cos(ba), -22 * Math.sin(ba));
      blimp.rotation.z = Math.sin(time * 0.6) * 0.04;
      for (let i = 0; i < beams.length; i++) {
        const b = beams[i];
        b.rotation.z = Math.sin(time * 0.45 + i * 1.7) * 0.32;
        b.rotation.x = 0.12 + Math.cos(time * 0.35 + i * 2.1) * 0.12;
      }
      for (let i = 0; i < qs.length; i++) {
        qs[i].rotation.y = time * 1.2 + i;
        qs[i].position.y = 1.3 + Math.sin(time * 2 + i * 1.3) * 0.2;
      }
    },
  };
}

// ---- NIGHT MARKET ---------------------------------------------------------------------------------

/** A striped awning (two colours), a hawker's sign (a name in lights). */
function stripes(a: string, b: string) {
  return canvasTex(128, 32, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(i * 16, 0, 16, 32);
    }
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(0, 26, 128, 6);
  });
}
function sign(en: string, zh: string, c: string) {
  return canvasTex(512, 192, (g) => {
    g.fillStyle = "#1a0f2a";
    g.beginPath();
    g.roundRect(8, 8, 496, 176, 36);
    g.fill();
    g.strokeStyle = c;
    g.lineWidth = 12;
    g.stroke();
    g.textAlign = "center";
    g.textBaseline = "middle";
    // (a long name shrinks to fit the board)
    let fs = 68;
    g.font = `900 ${fs}px system-ui, sans-serif`;
    while (fs > 40 && g.measureText(en).width > 452) g.font = `900 ${--fs}px system-ui, sans-serif`;
    g.shadowColor = c;
    g.shadowBlur = 20;
    g.fillStyle = "#fff6e0";
    g.fillText(en, 256, 76);
    g.font = "800 44px system-ui, sans-serif";
    g.fillStyle = c;
    g.fillText(zh, 256, 140);
  });
}

/** Deck planks, crisp: four boards a tile, each its own brown, a dark joint between, the ends staggered. */
function plankTex() {
  const t = canvasTex(
    128,
    128,
    (g) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = ["#6b4a36", "#7a5642", "#634332", "#72503c"][i];
        g.fillRect(0, i * 32, 128, 32);
        g.fillStyle = "rgba(255,225,190,0.10)";
        g.fillRect(0, i * 32, 128, 3);
        g.fillStyle = "#2c1a12";
        g.fillRect(0, i * 32 + 29, 128, 3);
        g.fillRect(((i * 46) % 96) + 16, i * 32, 3, 29);
      }
    },
    true,
  );
  t.anisotropy = 8;
  return t;
}

function marketDecor(s: THREE.Scene, hx: number, hz: number): Decor {
  const R = rng(0x3a7e7);
  // the canal far below, the lanterns' light dancing on it; the night sky all round, a warm moon over the city
  const seaT = liquid(s, { kind: "canal", y: SEA_Y, deep: "#050a1c", mid: "#0d2444", hot: "#ffb25c", foam: "#24507c", fog: "#3a1f5c", cell: 0.9 });
  const dome = skyDome(s, { sky: ["#0b0826", "#3a1f5c"], ground: "#3a1f5c", stars: 620, band: true, disc: { az: 318, el: 30, moon: true, color: "#fff1c8", size: 9, glow: 4 }, haze: 0.4, rnd: R });
  skyline(s, { r: 150, n: 96, y: SEA_Y - 18, tall: 1.4, rnd: R, night: true });
  const woks: THREE.Vector3[] = [];
  const stools: THREE.Matrix4[] = [];
  const planks = plankTex();
  planks.repeat.set(3, 3);
  const deck = new THREE.MeshToonMaterial({ map: planks, gradientMap: toonSteps() });
  const wood = toon("#8a5a3a");
  const crates: THREE.Matrix4[] = [];
  // the four stalls on the corners (2 × 2 cells each): a deck level with the floor; tall ones with
  // roofs and signs at the back, low counters at the front (they must not hide the floor)
  const C = hx - 3;
  const names: [string, string, string, string, string][] = [
    ["SAPLING SATAY", "树苗沙爹", "#ff6b4a", "#ffffff", "#ff8c42"],
    ["ORCHARD LAKSA", "果园叻沙", "#3ec6ff", "#ffffff", "#3ec6ff"],
    ["HALO TEA", "光环茶", "#8ee35b", "#fff3c4", "#8ee35b"],
    ["SPROUT GRILL", "新芽烧烤", "#ff5fa2", "#fff3c4", "#ff5fa2"],
  ];
  const posts: THREE.Matrix4[] = [];
  const m4 = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  let k = 0;
  for (const sz of [-1, 1])
    for (const sx of [-1, 1]) {
      const x = sx * C,
        z = sz * C;
      const [en, zh, ca, cb, glowC] = names[k++];
      outline(block("", 5.9, 0.62, 5.9, x, -0.31, z, s, deck), 0.06);
      const back = sz < 0;
      // the counter faces the middle of the cross
      const cx = x - sx * 1.2,
        cz = z - sz * 1.2;
      outline(block(ca, back ? 4.2 : 3.6, back ? 1.15 : 0.9, back ? 1.2 : 1.1, cx + sx * 0.6, back ? 0.58 : 0.45, cz + sz * 0.6, s), 0.06);
      // (a steaming wok or a teapot on it: a dark bowl, a glow)
      block("#2a2230", 0.9, 0.25, 0.9, cx + sx * 0.4, back ? 1.28 : 1.02, cz + sz * 0.4, s);
      block("#ffd27a", 0.6, 0.06, 0.6, cx + sx * 0.4, back ? 1.42 : 1.16, cz + sz * 0.4, s, glow("#ffd27a"));
      woks.push(new THREE.Vector3(cx + sx * 0.4, back ? 1.5 : 1.22, cz + sz * 0.4));
      // stools along the counter, on the arena's side
      for (const f of [-1, 0, 1]) stools.push(m4(cx + sx * 0.6 + f * 1.15, 0.32, cz - sz * 0.45, 0.55, 0.64, 0.55));
      if (back) {
        // four posts and the striped roof, the sign over the counter
        for (const [px, pz] of [
          [-2.4, -2.4],
          [2.4, -2.4],
          [-2.4, 2.4],
          [2.4, 2.4],
        ])
          posts.push(m4(x + px, 1.6, z + pz, 0.22, 3.2, 0.22));
        const roofMat = new THREE.MeshToonMaterial({ map: stripes(ca, cb), gradientMap: toonSteps() });
        const roof = block("", 5.6, 0.32, 5.6, x, 3.36, z, s, roofMat);
        roof.rotation.z = sx * 0.12;
        // (no shadow of it over the street: the floor's colours must read)
        roof.userData.noShadow = true;
        outline(roof, 0.05);
        const sg = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: sign(en, zh, glowC) }));
        sg.scale.set(3.6, 1.35, 1);
        sg.position.set(x - sx * 0.3, 2.45, z + 2.62);
        s.add(sg);
      } else {
        // the front ones stay low: crates of fruit and a lantern on a short post at the outer corner
        for (const [px, pz, h] of [
          [1.6, 1.9, 0.7],
          [2.3, 1.1, 0.55],
          [0.6, 2.4, 0.5],
        ] as const)
          crates.push(m4(x + sx * px, h / 2, z + sz * pz, 0.9, h, 0.9));
        posts.push(m4(x + sx * 2.5, 0.9, z - sz * 2.4, 0.16, 1.8, 0.16));
        block("#ffb03a", 0.42, 0.5, 0.42, x + sx * 2.5, 1.95, z - sz * 2.4, s, glow("#ffb03a"));
      }
    }
  const crateMesh = boxes(s, toon("#c08a4a"), crates.length);
  crates.forEach((m, i) => crateMesh.setMatrixAt(i, m));
  const postMesh = boxes(s, wood, posts.length);
  posts.forEach((m, i) => postMesh.setMatrixAt(i, m));
  const stoolMesh = boxes(s, toon("#ff6b4a"), stools.length, false, GEO.cyl);
  stools.forEach((m, i) => stoolMesh.setMatrixAt(i, m));
  // the market's gate behind the Z-Block: red pillars, two beams, a lit sign
  const gz = -(hz + 10.5);
  for (const sx of [-1, 1]) {
    outline(block("#d8332a", 1.0, 13, 1.0, sx * 7.5, 0.5, gz, s), 0.06);
    outline(block("#ffcf2e", 1.5, 0.6, 1.5, sx * 7.5, -5.8, gz, s), 0.05);
  }
  outline(block("#d8332a", 18.5, 0.9, 1.3, 0, 6.6, gz, s), 0.06);
  const roof = block("#2f8a6a", 20.5, 0.7, 2.4, 0, 7.4, gz, s);
  outline(roof, 0.06);
  outline(block("#d8332a", 16, 0.6, 1.0, 0, 4.4, gz, s), 0.05);
  // (a big red lantern hangs under the beam, each side)
  for (const sx of [-1, 1]) {
    const gl = new THREE.Mesh(GEO.ball, glow("#ff4a3a"));
    gl.scale.set(1.3, 1.6, 1.3);
    gl.position.set(sx * 4.5, 3.2, gz + 0.2);
    s.add(gl);
  }

  // ---- the market round the crossroads: terraces on stilts stepping down to the canal, each with its
  // row of stalls, its lanterns and its crowd watching the game (all instanced: decks, stilts, roofs,
  // counters, lamps, people)
  // [x, y, z, width (x), depth (z), the side its stalls stand on (±1 along x, 0: along its back)]
  const TER: [number, number, number, number, number, number][] = [
    [-(hx + 8.2), -3.6, -1, 7.5, 27, -1],
    [hx + 8.2, -3.6, -1, 7.5, 27, 1],
    [-(hx + 19), -9.5, -8, 10, 44, -1],
    [hx + 19, -9.5, -8, 10, 44, 1],
    [-17.5, -6.5, -(hz + 20), 15, 9, 0],
    [17.5, -6.5, -(hz + 20), 15, 9, 0],
    [0, -8, hz + 12, 30, 7, 0],
  ];
  const decks = boxes(s, new THREE.MeshToonMaterial({ map: planks, gradientMap: toonSteps(), color: "#8a7a78" }), TER.length);
  const rails = boxes(s, toon("#4a3040"), TER.length * 2);
  const stilts: number[] = [];
  const stallAt: [number, number, number, number][] = [];
  const folk: [number, number, number, number][] = [];
  const lampAt: [number, number, number][] = [];
  TER.forEach(([x, y, z, w, d, side], i) => {
    decks.setMatrixAt(i, boxAt(x, y - 0.3, z, w, 0.6, d));
    // (a rail along the edge that looks at the arena)
    const inner = side ? -side : 0;
    if (side) {
      rails.setMatrixAt(i * 2, boxAt(x + inner * (w / 2 - 0.15), y + 0.95, z, 0.14, 0.14, d));
      rails.setMatrixAt(i * 2 + 1, boxAt(x + inner * (w / 2 - 0.15), y + 0.5, z, 0.1, 0.1, d));
    } else {
      const zs = z > 0 ? -1 : 1;
      rails.setMatrixAt(i * 2, boxAt(x, y + 0.95, z + zs * (d / 2 - 0.15), w, 0.14, 0.14));
      rails.setMatrixAt(i * 2 + 1, boxAt(x, y + 0.5, z + zs * (d / 2 - 0.15), w, 0.1, 0.1));
    }
    // (stilts down to the water along both long edges)
    const nst = Math.max(2, Math.round((side ? d : w) / 6));
    for (const e of [-1, 1])
      for (let j = 0; j < nst; j++) {
        const u = (j / (nst - 1) - 0.5) * ((side ? d : w) - 1.2);
        stilts.push(side ? x + e * (w / 2 - 0.6) : x + u, y, side ? z + u : z + e * (d / 2 - 0.6));
      }
    // the stalls in a row along the outer edge, facing the arena; the crowd at the rail
    const long = side ? d : w;
    const ns = Math.floor(long / 4.4);
    for (let j = 0; j < ns; j++) {
      const u = (j + 0.5) / ns - 0.5;
      if (side) stallAt.push([x + side * (w / 2 - 1.7), y, z + u * (d - 1.5), side > 0 ? -Math.PI / 2 : Math.PI / 2]);
      else stallAt.push([x + u * (w - 1.5), y, z + (z > 0 ? 1 : -1) * (d / 2 - 1.7), z > 0 ? Math.PI : 0]);
    }
    const np = Math.floor(long / 1.15);
    for (let j = 0; j < np; j++) {
      if (R() < 0.3) continue;
      const u = (j + 0.5) / np - 0.5;
      const back = R() < 0.35 ? 0.9 : 0;
      if (side) folk.push([x + inner * (w / 2 - 0.6 - back), y, z + u * (d - 1), inner > 0 ? Math.PI / 2 : -Math.PI / 2]);
      else folk.push([x + u * (w - 1), y, z + (z > 0 ? -1 : 1) * (d / 2 - 0.6 - back), z > 0 ? Math.PI : 0]);
    }
    for (let j = 0; j <= ns; j++) {
      const u = j / Math.max(1, ns) - 0.5;
      if (side) lampAt.push([x + inner * (w / 2 - 0.15), y + 2.3, z + u * (d - 0.6)]);
      else lampAt.push([x + u * (w - 0.6), y + 2.3, z + (z > 0 ? -1 : 1) * (d / 2 - 0.15)]);
    }
  });
  const stiltMesh = boxes(s, toon("#3a2a34"), stilts.length / 3);
  for (let i = 0; i < stilts.length / 3; i++) {
    const y = stilts[i * 3 + 1];
    stiltMesh.setMatrixAt(i, boxAt(stilts[i * 3], (y - 0.6 + SEA_Y) / 2, stilts[i * 3 + 2], 0.5, y - 0.6 - SEA_Y, 0.5));
  }
  // a stall: a counter, two posts, an awning in its hawker's colour, a warm lamp under it
  const NSt = stallAt.length;
  const counters = boxes(s, toon("#ffffff"), NSt);
  const awnings = boxes(s, toon("#ffffff"), NSt * 2);
  const sPosts = boxes(s, wood, NSt * 2 + lampAt.length);
  const sLamps = boxes(s, glow("#ffc56a"), NSt + lampAt.length);
  // (cloth in the lanterns' half light: dusky, never the floor's candy colours)
  const AWN = ["#8a3a34", "#2f5f78", "#8a6a34", "#5f4a80", "#3f6e5a", "#84485e"];
  stallAt.forEach(([x, y, z, yaw], i) => {
    const c = Math.cos(yaw),
      sn = Math.sin(yaw);
    counters.setMatrixAt(i, boxAt(x, y + 0.5, z, 3.2, 1.0, 1.1, yaw));
    counters.setColorAt(i, COL.set(AWN[(i * 5 + 1) % AWN.length]).multiplyScalar(0.7));
    for (const k of [-1, 1]) sPosts.setMatrixAt(i * 2 + (k > 0 ? 1 : 0), boxAt(x + c * k * 1.55 - sn * 0.5, y + 1.35, z - sn * k * 1.55 - c * 0.5, 0.16, 2.7, 0.16, yaw));
    // (the awning: a striped pair of slabs, the front one lower)
    awnings.setMatrixAt(i * 2, boxAt(x - sn * 0.35, y + 2.82, z - c * 0.35, 3.7, 0.2, 1.5, yaw));
    awnings.setMatrixAt(i * 2 + 1, boxAt(x + sn * 0.75, y + 2.62, z + c * 0.75, 3.7, 0.2, 0.9, yaw));
    awnings.setColorAt(i * 2, COL.set(AWN[i % AWN.length]));
    awnings.setColorAt(i * 2 + 1, COL.set(i % 2 ? "#a89a84" : AWN[i % AWN.length]));
    sLamps.setMatrixAt(i, boxAt(x + sn * 0.4, y + 2.25, z + c * 0.4, 0.34, 0.42, 0.34, yaw));
  });
  lampAt.forEach(([x, y, z], i) => {
    sPosts.setMatrixAt(NSt * 2 + i, boxAt(x, y - 1.15, z, 0.12, 2.3, 0.12));
    sLamps.setMatrixAt(NSt + i, boxAt(x, y + 0.1, z, 0.36, 0.46, 0.36));
  });
  const people = crowd(s, R, folk, ["#4a3e72", "#34566e", "#6e3e4a", "#3e6248", "#6e623e", "#544a7a", "#303c56"], ["#b89a80", "#9a7860", "#c0a890", "#84604a"]);

  // steam over the woks (one draw)
  const NSTEAM = woks.length * 5;
  const steam = boxes(s, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.24, depthWrite: false }), NSTEAM, true);
  const steamP = Array.from({ length: NSTEAM }, (_, i) => ({ w: i % woks.length, t: R() * 1.6, r: R() * 6 }));
  // lotus lanterns drifting on the water, the hawkers' boats among them, sky lanterns rising past
  const NLOT = 60;
  const lotus = boxes(s, new THREE.MeshBasicMaterial({ color: 0xffffff }), NLOT, true, GEO.cone);
  const lotP = Array.from({ length: NLOT }, () => ({ a: R() * Math.PI * 2, r: 10 + R() * 60, w: (0.01 + R() * 0.02) * (R() < 0.5 ? 1 : -1), s: 1.5 + R() * 0.9 }));
  const cc = new THREE.Color();
  for (let i = 0; i < NLOT; i++) lotus.setColorAt(i, cc.set(["#ffb03a", "#ff6fa0", "#ffd94a", "#ff4a3a"][i % 4]));
  const NB = 8;
  const hulls = boxes(s, toon("#6b3a24"), NB, true);
  const canopies = boxes(s, toon("#2f8a6a"), NB, true);
  const boatLamps = boxes(s, glow("#ffcf6a"), NB, true, GEO.ball);
  const boats = [hulls, canopies, boatLamps];
  const boatP = Array.from({ length: NB }, (_, i) => ({ a: (i / NB) * Math.PI * 2, r: 16 + (i % 4) * 9, w: (0.025 + (i % 2) * 0.012) * (i % 3 ? 1 : -1) }));
  const NSL = 26;
  const skyL = boxes(s, new THREE.MeshBasicMaterial({ color: 0xffffff }), NSL, true, GEO.ball);
  for (let i = 0; i < NSL; i++) skyL.setColorAt(i, cc.set(["#ffb03a", "#ff8a4a", "#ffd27a"][i % 3]));
  // (round the sides and the back: none drifts up past the camera)
  const skyP = Array.from({ length: NSL }, () => ({ a: Math.PI * (0.9 + R() * 1.2), r: 26 + R() * 30, y: SEA_Y + R() * 50, v: 0.9 + R() * 0.8, ph: R() * 6 }));
  // fireworks over the city below, now and then (the game's own burst at each call is bigger)
  const fw = pool(s, R, 160, true);
  let fwT = 1.5;
  // strings of paper lanterns: along the back, down both sides (high, off the floor's view)
  const runs: [number, number, number, number, number, number][] = [
    [-(hx - 6), 3.6, -(hz + 0.6), hx - 6, 3.6, -(hz + 0.6)],
    [-(hx + 1.2), 3.4, -(hz - 6), -(hx + 1.2), 2.6, hz - 6],
    [hx + 1.2, 3.4, -(hz - 6), hx + 1.2, 2.6, hz - 6],
    [-(hx - 2), 3.6, -(hz + 0.2), -(hx + 4.5), 6.5, -(hz + 3.5)],
    [hx - 2, 3.6, -(hz + 0.2), hx + 4.5, 6.5, -(hz + 3.5)],
  ];
  const per = 9;
  const lan = boxes(s, new THREE.MeshBasicMaterial({ color: 0xffffff }), runs.length * per, true, GEO.ball);
  const wire = boxes(s, new THREE.MeshBasicMaterial({ color: 0x1a1020 }), runs.length * per);
  const lanCols = ["#ff4a3a", "#ffb03a", "#ff6fa0", "#ffd94a"];
  const lp: { x: number; y: number; z: number; ph: number }[] = [];
  const c = new THREE.Color();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  let i = 0;
  for (const [x0, y0, z0, x1, y1, z1] of runs)
    for (let j = 0; j < per; j++, i++) {
      const f = (j + 0.5) / per;
      const sag = Math.sin(f * Math.PI) * 0.9;
      const x = x0 + (x1 - x0) * f,
        y = y0 + (y1 - y0) * f - sag,
        z = z0 + (z1 - z0) * f;
      lp.push({ x, y, z, ph: R() * 6 });
      lan.setColorAt(i, c.set(lanCols[(i * 7) % 4]));
      // the wire to the next one
      const f2 = (j + 1.5) / per;
      const x2 = x0 + (x1 - x0) * f2,
        y2 = y0 + (y1 - y0) * f2 - Math.sin(Math.min(1, f2) * Math.PI) * 0.9,
        z2 = z0 + (z1 - z0) * f2;
      const dir = v.set(x2 - x, y2 - y, z2 - z);
      const len = dir.length();
      q.setFromUnitVectors(up, dir.normalize());
      wire.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3((x + x2) / 2, (y + y2) / 2 + 0.3, (z + z2) / 2), q, new THREE.Vector3(0.04, j === per - 1 ? 0.001 : len, 0.04)));
    }
  // the spotlight towers (the beams themselves are the game's)
  for (const sx of [-1, 1]) {
    outline(block("#2c2440", 0.6, 16, 0.6, sx * (hx + 3.5), 8 - 1.5, -(hz + 1.5), s), 0.05);
    outline(block("#3a3150", 1.6, 1.2, 1.6, sx * (hx + 3.5), 15.2, -(hz + 1.5), s), 0.05);
  }
  const mo = motes(s, R, 36, ["#ffb35c", "#ff7a4a", "#ffe08a"], 16, 60, 10);
  const m = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  const FW = [
    ["#ff6b4a", "#ffd27a"],
    ["#3ec6ff", "#ffffff"],
    ["#8ee35b", "#fff3c4"],
    ["#ff5fa2", "#ffd94a"],
  ];
  return {
    update(dt, time) {
      seaT.value = time;
      mo(dt, time);
      people(time);
      dome.rotation.y = time * 0.002;
      for (let i = 0; i < lp.length; i++) {
        const p = lp[i];
        const sw = Math.sin(time * 1.3 + p.ph) * 0.06;
        q.setFromAxisAngle(up, time * 0.3 + p.ph);
        m.compose(v.set(p.x + sw, p.y, p.z), q, sc.set(0.5, 0.62, 0.5));
        lan.setMatrixAt(i, m);
      }
      lan.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < NSTEAM; i++) {
        const p = steamP[i];
        p.t += dt;
        if (p.t > 1.6) p.t -= 1.6;
        const k = p.t / 1.6,
          w = woks[p.w];
        const z = 0.16 + k * 0.42;
        q.setFromAxisAngle(up, p.r + time);
        m.compose(v.set(w.x + Math.sin(p.r + k * 4) * 0.25, w.y + k * 2.2, w.z), q, sc.set(z, z, z));
        steam.setMatrixAt(i, m);
      }
      steam.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < NLOT; i++) {
        const p = lotP[i];
        p.a += p.w * dt;
        q.setFromAxisAngle(up, p.a * 3);
        m.compose(v.set(Math.cos(p.a) * p.r, SEA_Y + 0.3 + Math.sin(time * 1.5 + i) * 0.08, Math.sin(p.a) * p.r), q, sc.set(p.s, p.s * 0.7, p.s));
        lotus.setMatrixAt(i, m);
      }
      lotus.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < NB; i++) {
        const p = boatP[i];
        p.a += p.w * dt;
        const x = Math.cos(p.a) * p.r,
          z = Math.sin(p.a) * p.r;
        q.setFromAxisAngle(up, -p.a);
        hulls.setMatrixAt(i, m.compose(v.set(x, SEA_Y + 0.35, z), q, sc.set(1.5, 0.7, 4.6)));
        canopies.setMatrixAt(i, m.compose(v.set(x, SEA_Y + 1.25, z), q, sc.set(1.6, 0.2, 2.1)));
        boatLamps.setMatrixAt(i, m.compose(v.set(x, SEA_Y + 1.75, z), q, sc.set(0.55, 0.65, 0.55)));
      }
      for (const x of boats) x.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < NSL; i++) {
        const p = skyP[i];
        p.y += p.v * dt;
        if (p.y > 34) p.y = SEA_Y;
        q.setFromAxisAngle(up, time * 0.4 + p.ph);
        m.compose(v.set(Math.cos(p.a) * p.r + Math.sin(time * 0.6 + p.ph) * 0.6, p.y, Math.sin(p.a) * p.r), q, sc.set(0.55, 0.75, 0.55));
        skyL.setMatrixAt(i, m);
      }
      skyL.instanceMatrix.needsUpdate = true;
      fwT -= dt;
      if (fwT <= 0) {
        fwT = 1.4 + R() * 2.2;
        fw.burst((R() - 0.5) * 80, 2 + R() * 9, -44 - R() * 18, FW[Math.floor(R() * 4)], 40, { speed: 9, up: 1, g: 4, size: 0.45, life: 1.4 });
      }
      fw.update(dt, time);
    },
  };
}

// ---- PROOF FACTORY ---------------------------------------------------------------------------------

function foundryDecor(s: THREE.Scene, hx: number, hz: number): Decor {
  const R = rng(0xf0d7);
  // the pit: a dark crust of cooling gold, the melt glowing in its cracks (the belts and the tiles stand out on it)
  const seaT = liquid(s, { kind: "melt", y: SEA_Y, deep: "#190b0c", mid: "#2e1410", hot: "#f07814", foam: "#ffd27a", fog: "#4a1f1a", cell: 0.8, far: 300 });
  // the mill's yard at dusk: a low red sun in the smoke, the chimneys against it
  const dome = skyDome(s, { sky: ["#170d22", "#b2502a"], ground: "#4a1f1a", clouds: 14, cloud: "#6a3a3a", cloudShade: "#3a1c26", stars: 160, disc: { az: 300, el: 9, color: "#ffb45a", size: 13, glow: 4 }, haze: 0.5, rnd: R });
  (s.fog as THREE.Fog).color.set("#4a1f1a");
  // the mill's chimneys round the pit (one draw), their glowing rims (one draw), smoke (one draw)
  const n = 34;
  const iron = boxes(s, toon("#2e2230"), n);
  const rims = boxes(s, glow("#ff8a2a"), n);
  const tops: THREE.Vector3[] = [];
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.1;
    const d = 70 + R() * 60;
    const w = 4 + R() * 5;
    const h = 30 + R() * R() * 70;
    const x = Math.cos(a) * d,
      z = Math.sin(a) * d,
      y = SEA_Y - 10 + h / 2;
    m.compose(v.set(x, y, z), q, sc.set(w, h, w));
    iron.setMatrixAt(i, m);
    m.compose(v.set(x, y + h / 2 - 1.5, z), q, sc.set(w * 1.12, 0.9, w * 1.12));
    rims.setMatrixAt(i, m);
    tops.push(new THREE.Vector3(x, y + h / 2, z));
  }
  const NS = 44;
  const smoke = boxes(s, new THREE.MeshBasicMaterial({ color: 0x3a2a36, transparent: true, opacity: 0.55, depthWrite: false }), NS, true);
  const sp = Array.from({ length: NS }, (_, i) => ({ k: i % n, t: R() * 8, s: 2 + R() * 2.5, r: R() * 6 }));
  // the four furnace pylons at the corners, a ⓩ coin turning on each
  const coins: THREE.Group[] = [];
  for (const [x, z] of [
    [-(hx + 2.4), -(hz + 2.2)],
    [hx + 2.4, -(hz + 2.2)],
    [-(hx + 2.6), hz - 1.5],
    [hx + 2.6, hz - 1.5],
  ]) {
    outline(block("#4a3640", 1.5, 8, 1.5, x, -4.6, z, s), 0.07);
    block("#ff8a2a", 1.0, 1.1, 0.1, x, -2.2, z + 0.78, s, glow("#ff9a3a"));
    outline(block("#6a5050", 2.1, 0.45, 2.1, x, -0.4, z, s), 0.06);
    const cn = coin(0.85);
    cn.position.set(x, 1.4, z);
    s.add(cn);
    coins.push(cn);
  }
  // a gantry over the back with the mill's name
  outline(block("#4a3640", hx * 2 + 9, 0.8, 0.8, 0, 9.5, -(hz + 9.5), s), 0.06);
  for (const sx of [-1, 1]) outline(block("#4a3640", 0.8, 32, 0.8, sx * (hx + 4.5), 9.5 - 16, -(hz + 9.5), s), 0.06);
  const mo = motes(s, R, 60, ["#ffcf4a", "#ff8a2a", "#ffe9a8", "#ff5a1a"], 14, 44, 8);
  // the pit's glow from below, a cool rim from behind (the tiles and the snarks keep an edge in the heat)
  const under = new THREE.DirectionalLight("#ff6a1a", 0.7);
  under.position.set(0, -30, 8);
  const rimL = new THREE.DirectionalLight("#9fd0ff", 0.6);
  rimL.position.set(10, 18, -40);
  s.add(under, rimL);
  // a nearer ring of furnaces standing in the molten gold, their mouths aglow
  const NF = 14;
  const furn = boxes(s, toon("#3d2c38"), NF);
  const mouths = boxes(s, glow("#ffb03a"), NF);
  const furnRims = boxes(s, glow("#ff7a2a"), NF * 2);
  for (let i = 0; i < NF; i++) {
    const a = (i / NF) * Math.PI * 2 + 0.2;
    const d = 28 + (i % 3) * 6 + R() * 3;
    const h = 14 + R() * 8,
      w = 4 + R() * 2;
    const x = Math.cos(a) * d,
      z = Math.sin(a) * d,
      top = -8 - R() * 6;
    q.setFromAxisAngle(v.set(0, 1, 0), -a);
    furn.setMatrixAt(i, m.compose(v.set(x, top - h / 2, z), q, sc.set(w, h, w)));
    mouths.setMatrixAt(i, m.compose(v.set(x - Math.cos(a) * (w / 2), top - 3, z - Math.sin(a) * (w / 2)), q, sc.set(0.3, 1.8, w * 0.6)));
    // (a glowing band round its top, another lower down)
    furnRims.setMatrixAt(i * 2, m.compose(v.set(x, top - 0.4, z), q, sc.set(w * 1.08, 0.5, w * 1.08)));
    furnRims.setMatrixAt(i * 2 + 1, m.compose(v.set(x, top - 6.5, z), q, sc.set(w * 1.06, 0.35, w * 1.06)));
  }
  // two lines of hot Equihash ingots riding their belts past the mill, one each side, the other way from each other
  const LINE_X = [-(hx + 12.5), hx + 12.5];
  const lineBed = boxes(s, toon("#3a2c34"), LINE_X.length * 2 + 16);
  LINE_X.forEach((x, k) => {
    lineBed.setMatrixAt(k * 2, boxAt(x, -6.3, -6, 2.6, 0.5, 78));
    lineBed.setMatrixAt(k * 2 + 1, boxAt(x, -6.0, -6, 3.0, 0.24, 78));
    for (let j = 0; j < 8; j++) lineBed.setMatrixAt(LINE_X.length * 2 + k * 8 + j, boxAt(x, (-6.5 + SEA_Y) / 2, -42 + j * 10.3, 0.7, -6.5 - SEA_Y, 0.7));
  });
  const NI = 20;
  const ingots = boxes(s, glow("#e86a1a"), NI, true);
  // sparks for everything below (one pool)
  const sparks = pool(s, R, 220, true);
  const HOT = ["#ffe9a8", "#ffcf4a", "#ff8a2a", "#ffffff"];
  // bubbles of molten gold that swell and pop
  const NBB = 24;
  const bub = boxes(s, glow("#ffd35a"), NBB, true, GEO.ball);
  const bubP = Array.from({ length: NBB }, () => ({ x: 0, z: 0, t: R() * 2, max: 1.2 }));
  const spawn = (b: (typeof bubP)[number]) => {
    const a = R() * Math.PI * 2,
      d = 9 + R() * 48;
    b.x = Math.cos(a) * d;
    b.z = Math.sin(a) * d;
    b.t = 0;
    b.max = 0.9 + R() * 1.2;
  };
  bubP.forEach(spawn);
  // two presses stamping ⓩ coins behind the belts (they thump in turn)
  const PZ = -(hz + 4.4);
  const frame = boxes(s, toon("#5a4450"), 8);
  const frameInk = boxes(s, INK(), 8);
  let fi = 0;
  for (const sx of [-1, 1]) {
    const px = sx * 6.6;
    for (const [x, y, z, w, h, d] of [
      [px, -0.7, PZ, 2.6, 1.4, 2.6],
      [px - 1.45, 2.1, PZ, 0.5, 5.2, 0.6],
      [px + 1.45, 2.1, PZ, 0.5, 5.2, 0.6],
      [px, 4.85, PZ, 3.6, 0.7, 0.9],
    ]) {
      frame.setMatrixAt(fi, m.compose(v.set(x, y, z), q.identity(), sc.set(w, h, d)));
      frameInk.setMatrixAt(fi++, m.compose(v.set(x, y, z), q.identity(), sc.set(w + 0.14, h + 0.14, d + 0.14)));
    }
  }
  const hammers: THREE.Mesh[] = [];
  const hotCoins: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const hm = block("#8a7a86", 1.9, 1.3, 1.9, sx * 6.6, 3.4, PZ, s);
    outline(hm, 0.06);
    hammers.push(hm);
    const hc = new THREE.Mesh(GEO.cyl, glow("#ffcf4a"));
    hc.scale.set(1.4, 0.16, 1.4);
    hc.position.set(sx * 6.6, 0.08, PZ);
    s.add(hc);
    hotCoins.push(hc);
  }
  const last = [0, 0];
  // the gears at the belts' front corners, turning
  const gears: THREE.Group[] = [];
  const teeth = boxes(s, toon("#8a7a86"), 24, true);
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * (hx + 1.5), -1.3, hz + 0.9);
    const body = new THREE.Mesh(GEO.cyl, toon("#6a5a66"));
    body.rotation.x = Math.PI / 2;
    body.scale.set(2.6, 0.5, 2.6);
    outline(body, 0.05);
    g.add(body);
    const hub = new THREE.Mesh(GEO.cyl, glow("#ffcf2e"));
    hub.rotation.x = Math.PI / 2;
    hub.scale.set(0.8, 0.56, 0.8);
    g.add(hub);
    s.add(g);
    gears.push(g);
  }
  // the ladle on its trolley under the gantry: it rolls along, tips and pours a stream of gold into the pit
  const LZ = -(hz + 9.5);
  const trolley = new THREE.Group();
  outline(block("#5a4450", 1.6, 0.6, 1.2, 0, 9.0, 0, trolley), 0.05);
  block("#2a2026", 0.12, 3.8, 0.12, 0, 6.9, 0, trolley);
  const ladle = new THREE.Group();
  ladle.position.y = 4.6;
  const pot = new THREE.Mesh(GEO.cyl, toon("#3b2c36"));
  pot.scale.set(2.2, 1.6, 2.2);
  outline(pot, 0.06);
  ladle.add(pot);
  const melt = new THREE.Mesh(GEO.cyl, glow("#ffd35a"));
  melt.scale.set(1.9, 0.1, 1.9);
  melt.position.y = 0.78;
  ladle.add(melt);
  trolley.add(ladle);
  trolley.position.z = LZ;
  s.add(trolley);
  const stream = new THREE.Mesh(GEO.cyl, glow("#ffcf4a"));
  stream.visible = false;
  s.add(stream);
  return {
    update(dt, time) {
      seaT.value = time;
      mo(dt, time);
      sparks.update(dt, time);
      dome.rotation.y = time * 0.003;
      // the ingots on their lines
      for (let i = 0; i < NI; i++) {
        const k = i % 2,
          j = i >> 1;
        const z = ((((j * 7.8 + time * 2.2 * (k ? -1 : 1)) % 78) + 78) % 78) - 45;
        ingots.setMatrixAt(i, boxAt(LINE_X[k], -5.6, z, 1.1, 0.5, 1.7));
      }
      ingots.instanceMatrix.needsUpdate = true;
      // the bubbles
      for (let i = 0; i < NBB; i++) {
        const b = bubP[i];
        b.t += dt;
        if (b.t >= b.max) {
          if (R() < 0.6) sparks.burst(b.x, SEA_Y + 0.5, b.z, HOT, 5, { speed: 4, up: 5, g: 12, size: 0.35, life: 0.8 });
          spawn(b);
        }
        const k = Math.sin((b.t / b.max) * Math.PI * 0.5) * 1.4;
        bub.setMatrixAt(i, m.compose(v.set(b.x, SEA_Y + k * 0.3, b.z), q.identity(), sc.set(k, k * 0.8, k)));
      }
      bub.instanceMatrix.needsUpdate = true;
      // the presses: a slow lift, a quick drop, a shower of sparks on the coin
      for (let i = 0; i < 2; i++) {
        const ph = ((time + i * 1.25) % 2.5) / 2.5;
        const y = ph < 0.8 ? 1.2 + (ph / 0.8) * 2.4 : 3.6 - ((ph - 0.8) / 0.2) ** 2 * 2.4;
        hammers[i].position.y = y + 0.65;
        const hit = Math.floor((time + i * 1.25) / 2.5);
        if (hit !== last[i] && ph < 0.2) {
          last[i] = hit;
          sparks.burst(hammers[i].position.x, 0.3, PZ, HOT, 22, { speed: 7, up: 3, g: 14, size: 0.22, life: 0.7 });
        }
        hotCoins[i].scale.set(1.4, 0.16 + (ph > 0.95 || ph < 0.1 ? 0.06 : 0), 1.4);
      }
      // the gears and their teeth
      let ti = 0;
      for (let g = 0; g < 2; g++) {
        const gr = gears[g];
        const ang = time * (g ? -0.8 : 0.8);
        gr.rotation.z = ang;
        for (let k = 0; k < 12; k++) {
          const a = ang + (k / 12) * Math.PI * 2;
          q.setFromAxisAngle(v.set(0, 0, 1), a);
          teeth.setMatrixAt(ti++, m.compose(v.set(gr.position.x + Math.cos(a + Math.PI / 2) * 1.42, gr.position.y + Math.sin(a + Math.PI / 2) * 1.42, gr.position.z), q, sc.set(0.5, 0.55, 0.46)));
        }
      }
      teeth.instanceMatrix.needsUpdate = true;
      // the ladle: rolls (0..4 s), tips and pours (4..6.5 s), rights itself (6.5..7.5 s)
      const lt = time % 7.5;
      trolley.position.x = Math.sin(Math.floor(time / 7.5) * 2.3) * 8 + Math.sin(time * 0.3) * 0.5;
      const tip = lt < 4 ? 0 : lt < 4.6 ? (lt - 4) / 0.6 : lt < 6.5 ? 1 : Math.max(0, 1 - (lt - 6.5) / 0.6);
      ladle.rotation.z = -tip * 1.05;
      const pouring = lt > 4.5 && lt < 6.6;
      stream.visible = pouring;
      if (pouring) {
        const lx = trolley.position.x + 1.25,
          ly = 4.6 - 0.2;
        const len = ly - SEA_Y;
        stream.position.set(lx, ly - len / 2, LZ);
        stream.scale.set(0.34 + Math.sin(time * 30) * 0.03, len, 0.34);
        if (R() < dt * 8) sparks.burst(lx, SEA_Y + 0.6, LZ, HOT, 4, { speed: 5, up: 6, g: 12, size: 0.3, life: 0.7 });
      }
      for (let i = 0; i < NS; i++) {
        const p = sp[i];
        p.t += dt;
        if (p.t > 8) p.t = 0;
        const top = tops[p.k];
        const k = p.t / 8;
        const sz = p.s * (0.6 + k * 1.8);
        q.setFromAxisAngle(v.set(0, 1, 0), p.r + time * 0.2);
        m.compose(v.set(top.x + k * 6, top.y + k * 22, top.z + Math.sin(p.r + k * 3) * 2), q, sc.set(sz, sz, sz));
        smoke.setMatrixAt(i, m);
      }
      smoke.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < coins.length; i++) {
        coins[i].rotation.y = time * 1.6 + i;
        coins[i].position.y = 1.4 + Math.sin(time * 2 + i) * 0.15;
      }
    },
  };
}

// ---- the three --------------------------------------------------------------------------------------

export const SEA: TileLevel = {
  key: "sea",
  title: "SHIELDED SEA",
  titleZh: "屏蔽之海",
  tag: "The classic grid over the glowing shielded sea: read the colour, run, hop",
  tagZh: "发光的屏蔽之海上的经典方格：看颜色、跑、跳",
  ambience: "sea",
  nx: 6,
  nz: 6,
  start: [
    [-1.5, -1.5],
    [1.5, -1.5],
    [-1.5, 1.5],
    [1.5, 1.5],
  ],
  sky: ["#3a4fe0", "#ffb3dd"],
  fog: [90, 330],
  hemi: ["#fff4fb", "#8a5cff", 1.55],
  // (the low sun's side: shadows fall to the right across the tiles, short enough to stay on their own tile)
  sun: ["#fff1dc", 2.3, [-30, 42, 10]],
  eye: [0, 17.5, 20.5],
  at: [0, -0.6, 0.6],
  base: "#4b3790",
  decor: seaDecor,
};

export const MARKET: TileLevel = {
  key: "market",
  title: "NIGHT MARKET",
  titleZh: "夜市",
  tag: "Lights out: colours show only in the spotlights, your lantern and the firework at each call",
  tagZh: "熄灯：颜色只在探照灯、你的灯笼和每次喊色时的烟花下才看得见",
  song: "neon",
  ambience: "market",
  nx: 7,
  nz: 7,
  off: (gx, gz) => (gx < 2 || gx > 4) && (gz < 2 || gz > 4),
  start: [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ],
  sky: ["#0b0826", "#3a1f5c"],
  fog: [80, 300],
  hemi: ["#b9a8ff", "#2a1640", 1.35],
  // (the moon, from the back left: its shadows fall toward you)
  sun: ["#ffd9b0", 1.5, [-24, 44, -14]],
  eye: [0, 20, 22.5],
  at: [0, -0.8, 0.9],
  base: "#2c2342",
  dark: {
    from: [
      [-14, 15.2, -12],
      [14, 15.2, -12],
    ],
  },
  decor: marketDecor,
};

export const FOUNDRY: TileLevel = {
  key: "foundry",
  title: "PROOF FACTORY",
  titleZh: "证明工厂",
  tag: "Conveyor rows: the tiles ride the belts and tip off the rollers at the end",
  tagZh: "传送带：方块随传送带移动，到尽头会从滚轴上翻下去",
  song: "funk",
  ambience: "foundry",
  nx: 7,
  nz: 5,
  start: [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ],
  sky: ["#170d22", "#b2502a"],
  fog: [90, 320],
  // (a cool fill from the dusk sky against the warm key and the pit's glow: the shapes keep their sides)
  hemi: ["#dcd8ff", "#7a3418", 1.5],
  sun: ["#ffd9b0", 2.2, [-28, 44, 12]],
  eye: [0, 17, 19.5],
  at: [0, -0.8, 0.9],
  base: "#4a3640",
  belt: [0.6, 1.25],
  decor: foundryDecor,
};

export const LEVELS: TileLevel[] = [SEA, MARKET, FOUNDRY];
