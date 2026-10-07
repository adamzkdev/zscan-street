import * as THREE from "three";
import { BAY, RIVER } from "../city/plan";
import { C, E, G, VoxelModel } from "../voxel/model";
import { Fleet, yawOf } from "./air";
import type { AliveCtx, AliveFrame, AlivePart } from "./types";

/**
 * The water, busier: sailing yachts and motor yachts on the bay, jet skis weaving at full throttle,
 * a cruise ship crossing the bay south of Liberty and turning on its thrusters, speedboats running
 * up and down the river. Every hull leaves a wake of foam (one instanced draw call for all of it).
 */

const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);

// ---- models (front +x) -----------------------------------------------------------------------------

/** A sailing yacht: 9 m, a 14 m mast, main and jib, a gold band on the sails. */
function sailModel(hull: string, band: string) {
  const m = new VoxelModel(56, 86, 14);
  const white = C(hull),
    deck = C("#b08a5a"),
    sail = C("#f6f4ee");
  for (let x = 0; x < 56; x++) {
    const half = x < 44 ? (x < 3 ? 5 : 6) : Math.max(1, 6 - (x - 44) * 0.5);
    m.box(x, 1, 7 - half, x + 1, 5, 7 + half, white);
    m.box(x, 0, 7 - half + 1, x + 1, 1, 7 + half - 1, C("#1c2a4a"));
  }
  m.box(4, 5, 3, 44, 6, 11, deck);
  m.box(16, 6, 4, 30, 9, 10, C("#f2f2f6"));
  m.box(17, 7, 3, 29, 8, 11, G("#16202e"));
  m.box(30, 5, 6, 32, 86, 8, C("#d8d8e0"));
  m.box(10, 10, 6, 30, 11, 8, C("#c8c8d0"));
  // the mainsail: a tall triangle aft of the mast
  for (let y = 11; y < 82; y++) {
    const len = Math.round((82 - y) * 0.27);
    m.box(30 - len, y, 7, 30, y + 1, 8, y > 40 && y < 45 ? C(band) : sail);
  }
  // the jib: from the bow to near the masthead
  for (let y = 8; y < 76; y++) {
    const len = Math.round((76 - y) * 0.33);
    m.box(32, y, 7, 32 + len, y + 1, 8, sail);
  }
  m.box(30, 85, 6, 32, 86, 8, E("#ff2a1a", 2.4));
  m.box(53, 4, 6, 55, 5, 8, E("#fff6e0", 2.2));
  return m;
}

/** A motor yacht: 14 m, three decks, dark glass, a cyan glow along the hull for the nights. */
function motorModel() {
  const m = new VoxelModel(84, 26, 22);
  const white = C("#f4f4f6"),
    glass = G("#14181f"),
    dark = C("#1c1c24");
  for (let x = 0; x < 84; x++) {
    const half = x < 58 ? 11 : Math.max(1, 11 - (x - 58) * 0.42);
    const lift = x > 66 ? Math.round((x - 66) * 0.15) : 0;
    m.box(x, lift, 11 - half, x + 1, 7 + Math.min(1, lift), 11 + half, white);
    m.box(x, lift, 11 - half + 1, x + 1, 2, 11 + half - 1, C("#1c2a4a"));
  }
  m.box(2, 6, 1, 66, 7, 21, E("#3ef0ff", 1.4));
  m.box(8, 7, 2, 62, 13, 20, white);
  m.box(10, 9, 1, 60, 12, 21, glass);
  m.box(20, 13, 4, 54, 18, 18, white);
  m.box(22, 14, 3, 52, 17, 19, glass);
  m.box(28, 18, 5, 48, 19, 17, white);
  m.box(36, 19, 6, 40, 24, 16, dark);
  m.box(36, 23, 6, 46, 24, 16, dark);
  m.box(0, 4, 4, 6, 6, 18, C("#b08a5a"));
  m.box(82, 5, 10, 84, 6, 12, E("#fff6e0", 2.4));
  return m;
}

/** A jet ski with its rider (life vest), 2.7 m. */
function jetskiModel(paint: string) {
  const m = new VoxelModel(16, 14, 6);
  const p = C(paint),
    dark = C("#1c1c24");
  m.box(0, 0, 1, 15, 2, 5, p);
  m.box(15, 1, 2, 16, 2, 4, p);
  m.box(1, 2, 1, 13, 3, 5, dark);
  m.box(4, 3, 2, 10, 4, 4, dark);
  m.box(11, 3, 1, 12, 6, 5, dark);
  // the rider: legs astride, red vest, arms to the bars
  m.box(6, 3, 0, 9, 5, 1, C("#2a3a6a"));
  m.box(6, 3, 5, 9, 5, 6, C("#2a3a6a"));
  m.box(6, 5, 1, 9, 10, 5, C("#e0302a"));
  m.box(9, 8, 0, 12, 9, 1, C("#e8c09a"));
  m.box(9, 8, 5, 12, 9, 6, C("#e8c09a"));
  m.box(7, 10, 2, 9, 12, 4, C("#e8c09a"));
  m.box(7, 12, 2, 9, 13, 4, C("#1a1820"));
  return m;
}

/** A river speedboat, 5.3 m, a driver behind the windscreen. */
function speedModel(paint: string) {
  const m = new VoxelModel(32, 12, 12);
  const white = C("#f2f2f6"),
    p = C(paint);
  for (let x = 0; x < 32; x++) {
    const half = x < 22 ? 5 : Math.max(1, 5 - (x - 22) * 0.5);
    m.box(x, 0, 6 - half, x + 1, 4, 6 + half, white);
    m.box(x, 1, 6 - half, x + 1, 2, 6 + half, p);
  }
  m.box(2, 4, 2, 20, 5, 10, C("#b08a5a"));
  m.box(18, 4, 2, 20, 7, 10, G("#9fc6e0"));
  m.box(12, 4, 3, 15, 6, 9, C("#2a2a34"));
  m.box(13, 6, 5, 15, 9, 7, C("#3a7bff"));
  m.box(13, 9, 5, 15, 11, 7, C("#e8c09a"));
  m.box(30, 3, 5, 31, 4, 7, E("#fff6e0", 2.2));
  return m;
}

/** The cruise ship: 40 m (built at half size, drawn ×2), navy hull, white decks, a gold funnel. */
function cruiseModel() {
  const W = 120,
    D = 24,
    zc = 12;
  const m = new VoxelModel(W, 42, D);
  const navy = C("#1c2a4a"),
    red = C("#a02a2a"),
    white = C("#f2f0ea"),
    glass = G("#1a2232"),
    lit = E("#ffe2a8", 1.3);
  const half = (x: number) => (x < 3 ? 10 : x < 96 ? 11 : Math.max(1, 11 - (x - 96) * 0.46));
  for (let x = 0; x < W; x++) {
    const h = half(x);
    const top = x > 92 ? 10 + Math.round((x - 92) * 0.12) : 10;
    m.box(x, 0, zc - h, x + 1, top, zc + h, navy);
    m.box(x, 0, zc - h, x + 1, 2, zc + h, red);
    m.box(x, top - 1, zc - h, x + 1, top, zc + h, white);
    // portholes
    if (x % 4 === 1 && x > 6 && x < 100) {
      m.box(x, 6, zc - h, x + 1, 7, zc - h + 1, lit);
      m.box(x, 6, zc + h - 1, x + 1, 7, zc + h, lit);
    }
  }
  // the decks, stepping back toward the top
  const deck = (x0: number, x1: number, y0: number, y1: number, h: number) => {
    m.box(x0, y0, zc - h, x1, y1, zc + h, white);
    for (let y = y0 + 1; y < y1 - 1; y += 2)
      for (let x = x0 + 2; x < x1 - 2; x += 3) {
        const c = (x * 7 + y * 13) % 5 === 0 ? glass : lit;
        m.box(x, y, zc - h, x + 2, y + 1, zc - h + 1, c);
        m.box(x, y, zc + h - 1, x + 2, y + 1, zc + h, c);
      }
  };
  deck(8, 100, 10, 17, 11);
  deck(12, 94, 17, 23, 10);
  deck(18, 86, 23, 28, 9);
  // the bridge, forward, with its wings
  m.box(76, 28, zc - 9, 88, 32, zc + 9, white);
  m.box(84, 29, zc - 11, 89, 31, zc + 11, glass);
  // lifeboats along both sides
  for (let x = 20; x < 88; x += 11) {
    m.box(x, 15, zc - 12, x + 7, 17, zc - 11, C("#ff7a1a"));
    m.box(x, 15, zc + 11, x + 7, 17, zc + 12, C("#ff7a1a"));
  }
  // the pool deck: water, loungers
  m.box(46, 28, zc - 5, 64, 29, zc + 5, C("#3ab8e0"));
  for (let x = 47; x < 64; x += 3) m.box(x, 28, zc - 8, x + 2, 29, zc - 6, C("#f4b728"));
  for (let x = 47; x < 64; x += 3) m.box(x, 28, zc + 6, x + 2, 29, zc + 8, C("#f4b728"));
  // the funnel in ZEC gold, black-topped
  m.box(26, 28, zc - 4, 40, 38, zc + 4, C("#f4b728"));
  m.box(26, 38, zc - 4, 40, 40, zc + 4, C("#16151a"));
  m.box(30, 33, zc - 5, 36, 36, zc + 5, C("#16151a"));
  // the mast and its lights
  m.box(80, 32, zc - 1, 82, 41, zc + 1, white);
  m.box(80, 41, zc - 1, 82, 42, zc + 1, E("#ff2a1a", 2.6));
  m.box(W - 2, 9, zc - 1, W, 10, zc + 1, E("#fff6e0", 2.6));
  // a string of deck lights, bow to funnel
  for (let x = 40; x < 100; x += 2) m.box(x, 30 - Math.round(Math.sin(((x - 40) / 60) * Math.PI) * 2), zc, x + 1, 31 - Math.round(Math.sin(((x - 40) / 60) * Math.PI) * 2), zc + 1, E(x % 4 ? "#f4b728" : "#3ef0ff", 2));
  return m;
}

// ---- wakes: foam puffs on the water, one draw call -------------------------------------------------

const WAKE_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec4 iA;
attribute vec4 iB;
uniform float uTime;
varying vec2 vUv;
varying float vAge;
void main() {
  float life = iB.w;
  float age = (uTime - iA.w) / max(life, 0.01);
  vAge = age;
  vUv = uv;
  if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float s = iB.z * (0.55 + 1.6 * sqrt(age));
  vec3 wp = vec3(iA.x + iB.x * age * life, iA.y + 0.07, iA.z + iB.y * age * life) + vec3(position.x * s, 0.0, position.y * s);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WAKE_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uBright;
varying vec2 vUv;
varying float vAge;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  if (d > 1.0) discard;
  // a foam blob that opens into a ring as it spreads
  float ring = smoothstep(1.0, 0.35, d) * mix(1.0, 0.35 + 0.65 * smoothstep(0.1, 0.7, d), vAge);
  float a = ring * pow(1.0 - vAge, 1.5) * 0.62;
  // chunky pixel foam, like the rest of the city
  vec2 q = floor(vUv * 8.0);
  float n = fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453);
  a *= 0.75 + 0.25 * step(0.35, n);
  gl_FragColor = vec4(vec3(0.92, 0.96, 1.0) * uBright, a);
  #include <fog_fragment>
}`;

class Wakes {
  readonly mesh: THREE.Mesh;
  private a: THREE.InstancedBufferAttribute;
  private b: THREE.InstancedBufferAttribute;
  private n = 0;
  private start = -1;
  private count = 0;
  private mat: THREE.ShaderMaterial;
  constructor(
    private cap: number,
    parent: THREE.Object3D,
  ) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute("position", quad.getAttribute("position"));
    geo.setAttribute("uv", quad.getAttribute("uv"));
    const A = new Float32Array(cap * 4),
      B = new Float32Array(cap * 4);
    for (let i = 0; i < cap; i++) A[i * 4 + 3] = -1e6;
    this.a = new THREE.InstancedBufferAttribute(A, 4);
    this.b = new THREE.InstancedBufferAttribute(B, 4);
    this.a.setUsage(THREE.DynamicDrawUsage);
    this.b.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iA", this.a);
    geo.setAttribute("iB", this.b);
    geo.instanceCount = cap;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uBright: { value: 1 } }]),
      vertexShader: WAKE_VERT,
      fragmentShader: WAKE_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    parent.add(this.mesh);
  }
  private now = 0;
  emit(x: number, y: number, z: number, vx: number, vz: number, size: number, life: number) {
    const i = this.n;
    this.n = (this.n + 1) % this.cap;
    const A = this.a.array as Float32Array,
      B = this.b.array as Float32Array;
    A[i * 4] = x;
    A[i * 4 + 1] = y;
    A[i * 4 + 2] = z;
    A[i * 4 + 3] = this.now;
    B[i * 4] = vx;
    B[i * 4 + 1] = vz;
    B[i * 4 + 2] = size;
    B[i * 4 + 3] = life;
    if (this.start < 0) this.start = i;
    this.count++;
  }
  begin(t: number, night: boolean) {
    this.now = t;
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uBright.value = night ? 0.45 : 1;
  }
  end() {
    if (this.start < 0) return;
    for (const at of [this.a, this.b]) {
      at.clearUpdateRanges();
      const n = Math.min(this.count, this.cap);
      const first = Math.min(n, this.cap - this.start);
      at.addUpdateRange(this.start * 4, first * 4);
      if (n > first) at.addUpdateRange(0, (n - first) * 4);
      at.needsUpdate = true;
    }
    this.start = -1;
    this.count = 0;
  }
}

// ---- boats on routes ------------------------------------------------------------------------------

interface Boat {
  fleet: Fleet;
  i: number;
  /** A closed loop (or the cruise ship's shuttle). */
  path: THREE.CatmullRomCurve3;
  len: number;
  s: number;
  v: number;
  y: number;
  seed: number;
  /** Wake: puff size, side spread speed, every so many metres. */
  wake: [number, number, number];
  dist: number;
  yaw: number;
  roll: number;
  kind: "sail" | "motor" | "ski" | "speed";
}

const loop = (pts: [number, number][]) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => V(x, z)), true, "centripetal");

class Water implements AlivePart {
  private sails: Fleet;
  private motors: Fleet;
  private skis: Fleet[];
  private speeds: Fleet;
  private cruise: Fleet;
  private boats: Boat[] = [];
  private wakes: Wakes;
  private ship: { path: THREE.CatmullRomCurve3; len: number; s: number; dir: 1 | -1; yaw: number; turn: number; dist: number };
  private p = new THREE.Vector3();
  private tan = new THREE.Vector3();

  constructor(ctx: AliveCtx) {
    const g = new THREE.Group();
    g.name = "alive-water";
    ctx.group.add(g);
    const k = ctx.budget;
    this.sails = new Fleet(sailModel("#f4f4f6", "#f4b728"), 4, g);
    this.motors = new Fleet(motorModel(), 3, g);
    this.skis = [new Fleet(jetskiModel("#f4b728"), 3, g), new Fleet(jetskiModel("#3ef0ff"), 3, g)];
    this.speeds = new Fleet(speedModel("#d0202a"), 4, g);
    this.cruise = new Fleet(cruiseModel(), 1, g, 2);
    this.wakes = new Wakes(k > 0.5 ? 3200 : 1800, g);
    const bay = BAY.water,
      riv = RIVER.water;
    const add = (fleet: Fleet, i: number, path: THREE.CatmullRomCurve3, v: number, y: number, wake: [number, number, number], kind: Boat["kind"], s0 = Math.random()) => {
      const len = path.getLength();
      this.boats.push({ fleet, i, path, len, s: s0 * len, v, y, seed: Math.random() * 100, wake, dist: 0, yaw: 0, roll: 0, kind });
    };
    // sailing yachts: between the opera and Liberty, and two east of the bridge
    add(this.sails, 0, loop([[4, 168], [16, 176], [14, 192], [2, 196], [-10, 186], [-8, 172]]), 3.2, bay, [1.1, 0.5, 1.4], "sail");
    add(this.sails, 1, loop([[176, 156], [214, 158], [226, 176], [214, 198], [182, 196], [172, 178]]), 3.6, bay, [1.1, 0.5, 1.4], "sail", 0.1);
    add(this.sails, 2, loop([[176, 156], [214, 158], [226, 176], [214, 198], [182, 196], [172, 178]]), 3.6, bay, [1.1, 0.5, 1.4], "sail", 0.55);
    // the fourth beats along the south of the bay, past the rock
    add(this.sails, 3, loop([[-150, 216], [-95, 213], [-40, 218], [-60, 230], [-120, 231], [-162, 226]]), 3.4, bay, [1.1, 0.5, 1.4], "sail", 0.3);
    // motor yachts
    add(this.motors, 0, loop([[-140, 220], [-70, 216], [-30, 224], [-60, 232], [-130, 232], [-168, 228]]), 5.5, bay, [1.7, 0.9, 1.1], "motor", 0.65);
    add(this.motors, 1, loop([[200, 162], [224, 172], [220, 192], [196, 200], [178, 186], [182, 168]]), 5, bay, [1.7, 0.9, 1.1], "motor", 0.2);
    add(this.motors, 2, loop([[-88, 152], [-74, 160], [-72, 196], [-84, 212], [-90, 190], [-90, 166]]), 4.2, bay, [1.7, 0.9, 1.1], "motor", 0.4);
    // jet skis: weaving, fast
    const skiA = loop([[-6, 200], [10, 190], [-4, 178], [12, 168], [20, 182], [6, 196], [22, 204]]);
    const skiS = loop([[-150, 226], [-120, 214], [-90, 228], [-60, 214], [-36, 226], [-70, 232], [-110, 222], [-140, 233]]);
    const skiD = loop([[170, 166], [196, 154], [228, 170], [204, 182], [226, 198], [190, 202], [178, 184]]);
    add(this.skis[0], 0, skiA, 11, bay, [0.85, 1.3, 0.5], "ski", 0);
    add(this.skis[1], 0, skiA, 12, bay, [0.85, 1.3, 0.5], "ski", 0.5);
    add(this.skis[0], 1, skiS, 13, bay, [0.85, 1.3, 0.5], "ski", 0.2);
    add(this.skis[1], 1, skiS, 12.5, bay, [0.85, 1.3, 0.5], "ski", 0.27);
    add(this.skis[0], 2, skiD, 12, bay, [0.85, 1.3, 0.5], "ski", 0.7);
    add(this.skis[1], 2, skiD, 11.5, bay, [0.85, 1.3, 0.5], "ski", 0.1);
    // speedboats on the river, up one side and down the other
    const river = loop([[-214, 65.2], [0, 65.4], [214, 65.2], [219, 67], [214, 68.8], [0, 68.6], [-214, 68.8], [-219, 67]]);
    for (let i = 0; i < 4; i++) add(this.speeds, i, river, 7 + i * 0.6, riv, [1.0, 0.8, 0.8], "speed", i / 4 + 0.05);
    // the cruise ship: from the opera's side of the bay along the south of Liberty, up its east side;
    // at either end it turns round on its thrusters
    const sp = new THREE.CatmullRomCurve3([V(-2, 216), V(36, 218), V(66, 213), V(80, 196), V(79, 172)], false, "centripetal");
    this.ship = { path: sp, len: sp.getLength(), s: 0, dir: 1, yaw: 0, turn: 0, dist: 0 };
    sp.getTangentAt(0, this.tan);
    this.ship.yaw = yawOf(this.tan.x, this.tan.z);
    // never picked by the city's raycasts
    g.traverse((o) => (o.raycast = () => {}));
  }

  private updateShip(f: AliveFrame) {
    const S = this.ship;
    const v = 2.2;
    if (S.turn > 0) {
      // turning round on the spot, 180° in 30 s
      S.turn -= f.dt;
      S.yaw += (Math.PI / 30) * f.dt;
      if (S.turn <= 0) S.dir = S.dir === 1 ? -1 : 1;
    } else {
      // slow at either end, cruising between
      const u = S.s / S.len;
      const ease = Math.max(0.18, Math.min(1, u * 6, (1 - u) * 6));
      S.s += S.dir * v * ease * f.dt;
      if (S.s >= S.len || S.s <= 0) {
        S.s = THREE.MathUtils.clamp(S.s, 0, S.len);
        S.turn = 30;
      } else {
        S.path.getTangentAt(S.s / S.len, this.tan);
        const want = yawOf(this.tan.x * S.dir, this.tan.z * S.dir);
        let dy = want - S.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        S.yaw += dy * Math.min(1, f.dt * 0.8);
      }
    }
    S.path.getPointAt(S.s / S.len, this.p);
    this.p.y = BAY.water - 0.9 + Math.sin(f.t * 0.6) * 0.05;
    this.cruise.set(0, this.p, S.yaw, Math.sin(f.t * 0.4) * 0.004, Math.sin(f.t * 0.5) * 0.008);
    this.cruise.commit();
    // the wake off its stern (and foam along the hull while it turns)
    S.dist += f.dt * (S.turn > 0 ? 1.2 : v);
    if (S.dist > 2.5) {
      S.dist = 0;
      const fx = Math.cos(S.yaw),
        fz = -Math.sin(S.yaw);
      const sx = -fz,
        sz = fx;
      const bx = this.p.x - fx * 20,
        bz = this.p.z - fz * 20;
      this.wakes.emit(bx, BAY.water, bz, 0, 0, 4.5, 9);
      for (const side of [-1, 1]) this.wakes.emit(this.p.x + fx * 18 + sx * side * 4, BAY.water, this.p.z + fz * 18 + sz * side * 4, sx * side * 0.9, sz * side * 0.9, 2.2, 7);
    }
  }

  update(f: AliveFrame) {
    this.wakes.begin(f.t, f.night);
    this.updateShip(f);
    for (const b of this.boats) {
      b.s = (b.s + b.v * f.dt) % b.len;
      const u = b.s / b.len;
      b.path.getPointAt(u, this.p);
      b.path.getTangentAt(u, this.tan);
      const want = yawOf(this.tan.x, this.tan.z);
      let dy = want - b.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      // jet skis and speedboats lean into their turns
      const turn = dy / Math.max(f.dt, 1e-3);
      b.yaw = want;
      const lean = b.kind === "ski" ? 0.5 : b.kind === "speed" ? 0.25 : b.kind === "sail" ? 0.05 : 0.08;
      b.roll += (THREE.MathUtils.clamp(-turn * lean * 0.6, -0.5, 0.5) - b.roll) * Math.min(1, f.dt * 3);
      const heel = b.kind === "sail" ? 0.12 + Math.sin(f.t * 0.3 + b.seed) * 0.04 : 0;
      const bob = Math.sin(f.t * (b.kind === "ski" ? 5 : 1.4) + b.seed) * (b.kind === "ski" ? 0.07 : 0.05);
      const pitch = b.kind === "ski" || b.kind === "speed" ? 0.07 + Math.sin(f.t * 3 + b.seed) * 0.03 : Math.sin(f.t * 0.9 + b.seed) * 0.015;
      this.p.y = b.y + bob - (b.kind === "sail" ? 0.35 : 0.25);
      b.fleet.set(b.i, this.p, b.yaw, pitch, b.roll + heel);
      // the wake: a puff at the stern, and two spreading out sideways (the V)
      b.dist += b.v * f.dt;
      if (b.dist > b.wake[2]) {
        b.dist = 0;
        const [size, spread] = b.wake;
        const fx = Math.cos(b.yaw),
          fz = -Math.sin(b.yaw);
        const back = b.kind === "motor" ? 6.5 : b.kind === "sail" ? 4.2 : b.kind === "speed" ? 2.4 : 1.3;
        const x = this.p.x - fx * back,
          z = this.p.z - fz * back;
        this.wakes.emit(x, b.y, z, -fx * 0.3, -fz * 0.3, size, b.kind === "ski" ? 2.6 : 4);
        for (const side of [-1, 1]) this.wakes.emit(x, b.y, z, -fz * side * spread, fx * side * spread, size * 0.7, b.kind === "ski" ? 2.2 : 3.4);
      }
    }
    for (const fl of [this.sails, this.motors, ...this.skis, this.speeds]) fl.commit();
    this.wakes.end();
  }
}

export async function buildWater(ctx: AliveCtx): Promise<AlivePart> {
  return new Water(ctx);
}
