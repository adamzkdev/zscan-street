import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BAY, CITY, CURB, PARK, RIVER } from "../city/plan";
import { MATERIALS, meshModel } from "../voxel/mesher";
import { C, E, G, VOX, VoxelModel } from "../voxel/model";
import type { AliveCtx, AliveFrame, AlivePart } from "./types";

/**
 * The sky over the megalopolis: news and tour helicopters (one lands on the sail hotel's helipad),
 * airliners on their approach far overhead, delivery drones hopping from roof to roof with a gold
 * parcel, and flocks of birds (pigeons over the park, a murmuration of starlings, gulls over the
 * water). Everything is instanced: a handful of draw calls for the lot.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

// ---- a fleet: one voxel model, many copies, one draw call per material ----------------------------

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _s = new THREE.Vector3();
const _r = new THREE.Quaternion();
const _er = new THREE.Euler();
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0);

/** Copies of one voxel model (front +x), placed by matrix. */
export class Fleet {
  readonly meshes: THREE.InstancedMesh[] = [];
  readonly m: THREE.Matrix4[] = [];
  constructor(
    model: VoxelModel,
    readonly count: number,
    parent: THREE.Object3D,
    readonly scale = 1,
  ) {
    for (const [kind, geo] of Object.entries(meshModel(model)) as [keyof typeof MATERIALS, THREE.BufferGeometry][]) {
      const im = new THREE.InstancedMesh(geo, MATERIALS[kind], count);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < count; i++) im.setMatrixAt(i, _hidden);
      this.meshes.push(im);
      parent.add(im);
    }
    for (let i = 0; i < count; i++) this.m.push(new THREE.Matrix4().copy(_hidden));
  }
  /** Place copy `i` at `p`, heading `yaw` (radians, +x forward = 0), nose `pitch`, `roll`. */
  set(i: number, p: THREE.Vector3, yaw: number, pitch = 0, roll = 0, s = 1) {
    _e.set(0, yaw, 0);
    _q.setFromEuler(_e);
    _q.multiply(_r.setFromEuler(_er.set(roll, 0, pitch)));
    this.m[i].compose(p, _q, _s.setScalar(this.scale * s));
  }
  hide(i: number) {
    this.m[i].copy(_hidden);
  }
  commit() {
    for (const im of this.meshes) {
      for (let i = 0; i < this.count; i++) im.setMatrixAt(i, this.m[i]);
      im.instanceMatrix.needsUpdate = true;
    }
  }
}

/** Heading of a direction (dx, dz) for a model whose front is +x. */
export const yawOf = (dx: number, dz: number) => Math.atan2(-dz, dx);

/** Blinking lights: one instanced box, a colour per light, scaled to zero when off. */
export class Lights {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private mtx = new THREE.Matrix4();
  constructor(max: number, parent: THREE.Object3D) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false, fog: false }), max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, new THREE.Color(0, 0, 0));
    parent.add(this.mesh);
  }
  begin() {
    this.n = 0;
  }
  add(p: THREE.Vector3, size: number, c: THREE.Color) {
    if (this.n >= this.mesh.count) return;
    this.mtx.makeScale(size, size, size).setPosition(p);
    this.mesh.setMatrixAt(this.n, this.mtx);
    this.mesh.setColorAt(this.n, c);
    this.n++;
  }
  end() {
    for (let i = this.n; i < this.mesh.count; i++) this.mesh.setMatrixAt(i, _hidden);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const RED = new THREE.Color("#ff2a1a").multiplyScalar(4);
const WHITE = new THREE.Color("#ffffff").multiplyScalar(5);
const CYAN = new THREE.Color("#3ef0ff").multiplyScalar(3);
const GOLD = new THREE.Color("#f4b728").multiplyScalar(3);

// ---- models --------------------------------------------------------------------------------------

/** A helicopter, 11 m nose to tail (front +x), the rotors are separate. */
function heliModel(body: string, accent: string) {
  const m = new VoxelModel(58, 20, 16);
  const b = C(body),
    a = C(accent),
    dark = C("#1e1d24"),
    glass = G("#16202e");
  // cabin and nose
  m.box(26, 4, 3, 48, 15, 13, b);
  m.box(48, 5, 4, 53, 13, 12, b);
  m.box(53, 6, 5, 55, 11, 11, b);
  m.box(44, 9, 3, 54, 14, 13, glass);
  m.box(30, 9, 2, 42, 13, 3, glass);
  m.box(30, 9, 13, 42, 13, 14, glass);
  // the stripe and the engine housing
  m.box(26, 6, 2, 50, 8, 14, a);
  m.box(28, 15, 5, 44, 17, 11, b);
  m.box(38, 17, 7, 40, 20, 9, dark);
  // tail boom, fin, stabiliser
  m.box(4, 10, 7, 26, 13, 9, b);
  m.box(4, 11, 6, 20, 12, 10, a);
  m.box(0, 10, 7, 5, 19, 9, a);
  m.box(6, 10, 3, 9, 11, 13, b);
  // skids
  m.box(26, 0, 2, 50, 1, 4, dark);
  m.box(26, 0, 12, 50, 1, 14, dark);
  for (const x of [31, 44]) for (const z of [3, 12]) m.box(x, 1, z, x + 1, 4, z + 1, dark);
  // landing light
  m.box(52, 5, 7, 54, 6, 9, E("#fff6e0", 2.4));
  return m;
}
const HELI_MAST = new THREE.Vector3((39 - 29) * VOX, 20 * VOX + 0.04, 0);
const HELI_TAIL = new THREE.Vector3((2 - 29) * VOX, 15.5 * VOX, 0.32);

function rotorGeo() {
  const blade = (len: number, w: number) => new THREE.BoxGeometry(len, 0.05, w);
  const a = blade(10.5, 0.28);
  const b = blade(10.5, 0.28).rotateY(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.25, 0.25, 0.2, 8);
  return mergeGeometries([a, b, hub], false) ?? a;
}

/** An airliner, about 42 m long (built at VOX, drawn ×3). Front +x. */
function planeModel() {
  const m = new VoxelModel(84, 28, 72);
  const white = C("#f2f2f6"),
    belly = C("#c8ccd6"),
    gold = C("#f4b728"),
    dark = C("#2a2a34");
  const zc = 36;
  // fuselage
  m.box(6, 6, zc - 4, 76, 14, zc + 4, white);
  m.box(6, 6, zc - 4, 76, 8, zc + 4, belly);
  m.box(76, 7, zc - 3, 81, 13, zc + 3, white);
  m.box(81, 8, zc - 2, 83, 12, zc + 2, white);
  m.box(77, 11, zc - 3, 81, 13, zc + 3, G("#16202e"));
  m.box(0, 8, zc - 3, 6, 14, zc + 3, white);
  m.box(8, 10, zc - 4, 76, 11, zc + 4, gold);
  for (let x = 14; x < 74; x += 3) for (const z of [zc - 4, zc + 3]) m.box(x, 12, z, x + 1, 13, z + 1, E("#ffe6b0", 1.2));
  // swept wings
  for (let k = 0; k < 32; k++) {
    const x0 = 46 - k * 0.55;
    m.box(x0, 7, zc + 4 + k, x0 + 14 - k * 0.3, 8, zc + 5 + k, white);
    m.box(x0, 7, zc - 5 - k, x0 + 14 - k * 0.3, 8, zc - 4 - k, white);
  }
  m.box(28, 8, zc + 34, 31, 11, zc + 36, white);
  m.box(28, 8, zc - 36, 31, 11, zc - 34, white);
  m.box(28, 7, zc + 35, 30, 8, zc + 36, E("#2aff5a", 3));
  m.box(28, 7, zc - 36, 30, 8, zc - 35, E("#ff2a1a", 3));
  // engines
  for (const z of [zc + 10, zc - 14]) {
    m.box(42, 3, z, 52, 7, z + 4, belly);
    m.box(51, 3, z, 52, 7, z + 4, dark);
  }
  // tail: fin in gold, stabilisers
  for (let k = 0; k < 13; k++) m.box(2 + k * 0.6, 14 + k, zc - 1, 14 - k * 0.2, 15 + k, zc + 1, gold);
  for (let k = 0; k < 11; k++) {
    m.box(1 + k * 0.5, 12, zc + 4 + k, 10 - k * 0.2, 13, zc + 5 + k, white);
    m.box(1 + k * 0.5, 12, zc - 5 - k, 10 - k * 0.2, 13, zc - 4 - k, white);
  }
  return m;
}

/** A delivery quadcopter, about 1.2 m across. */
function droneModel() {
  const m = new VoxelModel(8, 3, 8);
  const dark = C("#26252e"),
    arm = C("#4a4856"),
    rotor = C("#8a8898");
  m.box(2, 1, 2, 6, 2, 6, dark);
  m.box(3, 2, 3, 5, 3, 5, C("#f4b728"));
  for (const [x, z] of [
    [0, 0],
    [6, 0],
    [0, 6],
    [6, 6],
  ])
    m.box(x, 2, z, x + 2, 3, z + 2, rotor);
  m.box(1, 1, 1, 7, 2, 2, arm);
  m.box(1, 1, 6, 7, 2, 7, arm);
  m.box(7, 1, 3, 8, 2, 5, E("#3ef0ff", 2));
  return m;
}

/** The parcel under each drone: a gold box with a dark band. */
function parcelModel() {
  const m = new VoxelModel(3, 3, 3);
  m.box(0, 0, 0, 3, 3, 3, C("#f4b728"));
  m.box(1, 0, 0, 2, 3, 3, C("#b07a10"));
  return m;
}

// ---- birds: one draw call, flapping in the vertex shader -------------------------------------------

const MAX_FLOCKS = 8;
const BIRD_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute float aTip;
attribute vec3 iOff;
attribute float iSeed;
attribute float iFlock;
uniform vec4 uCentre[${MAX_FLOCKS}];
uniform vec4 uLook[${MAX_FLOCKS}];
uniform vec3 uCol[${MAX_FLOCKS}];
uniform float uTime;
varying float vShade;
varying vec3 vCol;
void main() {
  int f = int(iFlock + 0.5);
  vec4 c = uCentre[f];
  vec4 look = uLook[f];
  float sc = look.x;
  float spread = look.y;
  float t = uTime;
  float s = iSeed * 6.2831;
  // flap, then glide now and then
  float glide = step(0.35, sin(t * 0.37 + s * 1.7));
  float flap = sin(t * (look.z) + s) * mix(1.0, 0.12, glide);
  vec3 lp = position * sc;
  lp.y += aTip * flap * 0.42 * sc;
  // each bird wanders round its place in the flock; the starlings' murmuration breathes
  vec3 off = iOff * spread * (1.0 + 0.35 * sin(t * 0.21 + c.x * 0.01));
  off += vec3(sin(t * 0.53 + s * 3.1) * 1.6, sin(t * 0.71 + s * 2.3) * 0.8, cos(t * 0.47 + s * 1.3) * 1.6) * spread * 0.18;
  float bank = sin(t * 0.6 + s) * 0.25;
  float cy = cos(bank), sy = sin(bank);
  lp = vec3(lp.x, lp.y * cy - lp.z * sy, lp.y * sy + lp.z * cy);
  float h = c.w + sin(t * 0.4 + s) * 0.15;
  float ch = cos(h), sh = sin(h);
  vec3 p = off + lp;
  vec3 r = vec3(p.x * ch + p.z * sh, p.y, -p.x * sh + p.z * ch);
  vec3 wp = c.xyz + r;
  vShade = 0.75 + 0.25 * aTip * flap;
  vCol = uCol[f];
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const BIRD_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
varying float vShade;
varying vec3 vCol;
uniform vec3 uTint;
void main() {
  gl_FragColor = vec4(vCol * vShade * uTint, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

interface Flock {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  alt: number;
  /** rad/s round the loop (negative: the other way). */
  w: number;
  n: number;
  scale: number;
  spread: number;
  flap: number;
  color: string;
  /** Out at night too. */
  night: boolean;
  a: number;
}

class Birds {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private flocks: Flock[];
  constructor(parent: THREE.Object3D, budget: number) {
    const k = (n: number) => Math.max(4, Math.round(n * (0.4 + 0.6 * budget)));
    this.flocks = [
      // pigeons wheeling over the park's lake and the mall
      { cx: PARK.lake.x, cz: PARK.lake.z + 12, rx: 32, rz: 18, alt: 20, w: 0.11, n: k(26), scale: 0.62, spread: 4, flap: 13, color: "#6a6a7c", night: false, a: 0 },
      // a murmuration of starlings over the west of the park and the museum
      { cx: -60, cz: -130, rx: 55, rz: 30, alt: 42, w: -0.07, n: k(90), scale: 0.42, spread: 9, flap: 17, color: "#2a2830", night: false, a: 2 },
      // gulls over the bay, round Liberty and the boats
      { cx: 20, cz: BAY.z0 + 40, rx: 60, rz: 26, alt: 15, w: 0.06, n: k(18), scale: 1.15, spread: 9, flap: 7, color: "#f2f2f6", night: true, a: 1 },
      { cx: 120, cz: BAY.z0 + 34, rx: 34, rz: 18, alt: 11, w: -0.09, n: k(12), scale: 1.1, spread: 7, flap: 7, color: "#e8e8ee", night: false, a: 4 },
      // gulls along the river and over the port's docks
      { cx: -150, cz: (RIVER.z0 + RIVER.z1) / 2 + 10, rx: 60, rz: 16, alt: 13, w: 0.08, n: k(14), scale: 1.05, spread: 7, flap: 7, color: "#f2f2f6", night: true, a: 3 },
      // pigeons over downtown's rooftops
      { cx: 6, cz: 6, rx: 26, rz: 16, alt: 30, w: -0.13, n: k(20), scale: 0.6, spread: 4, flap: 13, color: "#7a7a8a", night: false, a: 5 },
    ];
    // the bird: a little body and two wings whose tips flap
    const pos = [
      // left wing
      0.16, 0, 0, -0.16, 0, 0, -0.04, 0, 0.55,
      // right wing
      -0.16, 0, 0, 0.16, 0, 0, -0.04, 0, -0.55,
      // body and tail
      0.32, 0, 0, -0.3, 0, 0.07, -0.3, 0, -0.07,
    ];
    const tip = [0, 0, 1, 0, 0, 1, 0, 0, 0];
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("aTip", new THREE.Float32BufferAttribute(tip, 1));
    const total = this.flocks.reduce((s, f) => s + f.n, 0);
    const off = new Float32Array(total * 3),
      seed = new Float32Array(total),
      flock = new Float32Array(total);
    let i = 0;
    this.flocks.forEach((f, fi) => {
      for (let b = 0; b < f.n; b++, i++) {
        // a loose V for the gulls, a cloud for the rest
        const r = Math.cbrt(Math.random());
        const a = Math.random() * TAU;
        off[i * 3] = Math.cos(a) * r * 1.2;
        off[i * 3 + 1] = (Math.random() - 0.5) * 0.6;
        off[i * 3 + 2] = Math.sin(a) * r * 1.2;
        seed[i] = Math.random();
        flock[i] = fi;
      }
    });
    geo.setAttribute("iOff", new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute("iSeed", new THREE.InstancedBufferAttribute(seed, 1));
    geo.setAttribute("iFlock", new THREE.InstancedBufferAttribute(flock, 1));
    geo.instanceCount = total;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uCentre: { value: Array.from({ length: MAX_FLOCKS }, () => new THREE.Vector4(0, -999, 0, 0)) },
          uLook: { value: Array.from({ length: MAX_FLOCKS }, () => new THREE.Vector4()) },
          uCol: { value: Array.from({ length: MAX_FLOCKS }, () => new THREE.Color()) },
          uTime: { value: 0 },
          uTint: { value: new THREE.Color(1, 1, 1) },
        },
      ]),
      vertexShader: BIRD_VERT,
      fragmentShader: BIRD_FRAG,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.flocks.forEach((f, fi) => {
      (this.mat.uniforms.uLook.value[fi] as THREE.Vector4).set(f.scale, f.spread, f.flap, 0);
      (this.mat.uniforms.uCol.value[fi] as THREE.Color).set(f.color);
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }
  update(f: AliveFrame) {
    const u = this.mat.uniforms;
    u.uTime.value = f.t;
    (u.uTint.value as THREE.Color).setScalar(f.night ? 0.55 : 1);
    this.flocks.forEach((fl, i) => {
      fl.a += fl.w * f.dt;
      // the loop wobbles so the flocks never trace a clean ellipse
      const a = fl.a;
      const x = fl.cx + Math.cos(a) * fl.rx + Math.sin(a * 2.3) * fl.rx * 0.18;
      const z = fl.cz + Math.sin(a) * fl.rz + Math.cos(a * 1.7) * fl.rz * 0.2;
      const dx = -Math.sin(a) * fl.rx * Math.sign(fl.w),
        dz = Math.cos(a) * fl.rz * Math.sign(fl.w);
      const c = u.uCentre.value[i] as THREE.Vector4;
      const out = f.night && !fl.night;
      c.set(x, out ? -500 : fl.alt + Math.sin(a * 3) * 3, z, yawOf(dx, dz));
    });
  }
}

// ---- helicopters ---------------------------------------------------------------------------------

type HeliMode = "orbit" | "tour" | "pad";
interface Heli {
  fleet: Fleet;
  i: number;
  mode: HeliMode;
  p: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  rotor: number;
  spin: number;
  t: number;
}

// ---- planes --------------------------------------------------------------------------------------

/** Approach lanes: west-bound, descending toward an airport beyond the western edge. */
const LANES = [
  { z0: -60, z1: -20, y0: 240, y1: 120 },
  { z0: 110, z1: 150, y0: 230, y1: 115 },
  { z0: -210, z1: -170, y0: 250, y1: 175 },
];
const PLANE_X0 = 780,
  PLANE_X1 = -780,
  PLANE_V = 62;

// ---- drones --------------------------------------------------------------------------------------

interface Drone {
  from: THREE.Vector3;
  to: THREE.Vector3;
  cruise: number;
  /** 0 climb, 1 cruise, 2 descend, 3 hover. */
  phase: number;
  k: number;
  hold: number;
  p: THREE.Vector3;
  yaw: number;
  carry: boolean;
  seed: number;
}

/** Roof height across the city, on a 6 m grid, from the buildings' boxes. */
class Roofs {
  private cell = 6;
  private nx: number;
  private nz: number;
  private h: Float32Array;
  readonly tops: THREE.Vector3[] = [];
  /** How many facades were known at the last build (the bigger city's stream in after load). */
  seen = -1;
  constructor(private ctx: AliveCtx) {
    this.nx = Math.ceil((CITY.maxX - CITY.minX) / this.cell) + 1;
    this.nz = Math.ceil((CITY.maxZ - CITY.minZ) / this.cell) + 1;
    this.h = new Float32Array(this.nx * this.nz);
    this.build();
  }
  private raise(x0: number, z0: number, x1: number, z1: number, y: number) {
    const i0 = this.ix(Math.min(x0, x1)),
      i1 = this.ix(Math.max(x0, x1)),
      j0 = this.iz(Math.min(z0, z1)),
      j1 = this.iz(Math.max(z0, z1));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.h[j * this.nx + i] = Math.max(this.h[j * this.nx + i], y);
  }
  /** (Re)build from the buildings known so far: the heart's boxes, the bigger city's facades. */
  build() {
    const ctx = this.ctx;
    this.seen = ctx.city.facades.length;
    this.h.fill(0);
    this.tops.length = 0;
    // the bigger city's buildings: only their front line is known; assume a deep body behind it
    // and a little rooftop clutter (for east/west fronts, a generous stretch either way)
    for (const f of ctx.city.facades) {
      if (!f.ext || !f.out) continue;
      const top = CURB + f.height + 4;
      if (f.face === "s" || f.face === "n") {
        const back = f.z - f.out.z * 11;
        this.raise(f.x0, f.z, f.x1, back, top);
        if (f.height > 8 && f.height < 44 && f.x1 - f.x0 > 5) this.tops.push(new THREE.Vector3((f.x0 + f.x1) / 2, top - 2.6, f.z - f.out.z * 4));
      } else {
        const back = f.x0 - f.out.x * 11;
        this.raise(f.x0, f.z - 12, back, f.z + 12, top);
      }
    }
    for (const o of ctx.city.occluders) {
      const b = o.box;
      if (b.isEmpty()) continue;
      const i0 = this.ix(b.min.x),
        i1 = this.ix(b.max.x),
        j0 = this.iz(b.min.z),
        j1 = this.iz(b.max.z);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.h[j * this.nx + i] = Math.max(this.h[j * this.nx + i], b.max.y + 2);
      // rooftops for the drones: ordinary blocks, not too tall, not landmarks
      const w = b.max.x - b.min.x,
        d = b.max.z - b.min.z;
      if (!o.fixed && b.max.y > 8 && b.max.y < 48 && w > 5 && d > 5 && w < 40 && d < 40) this.tops.push(new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + 1.4, (b.min.z + b.max.z) / 2));
    }
  }
  private ix(x: number) {
    return THREE.MathUtils.clamp(Math.floor((x - CITY.minX) / this.cell), 0, this.nx - 1);
  }
  private iz(z: number) {
    return THREE.MathUtils.clamp(Math.floor((z - CITY.minZ) / this.cell), 0, this.nz - 1);
  }
  at(x: number, z: number) {
    return this.h[this.iz(z) * this.nx + this.ix(x)];
  }
  /** The highest roof under the straight line from a to b (sampled every 3 m, a cell either side). */
  along(a: THREE.Vector3, b: THREE.Vector3) {
    const n = Math.ceil(a.distanceTo(b) / 3) + 1;
    let top = 0;
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n,
        z = a.z + ((b.z - a.z) * k) / n;
      for (const [ox, oz] of [
        [0, 0],
        [4, 0],
        [-4, 0],
        [0, 4],
        [0, -4],
      ])
        top = Math.max(top, this.at(x + ox, z + oz));
    }
    return top;
  }
}

// ---- the part --------------------------------------------------------------------------------------

class Air implements AlivePart {
  private news: Fleet;
  private tourF: Fleet;
  private rotors: THREE.InstancedMesh;
  private tails: THREE.InstancedMesh;
  private helis: Heli[] = [];
  private planes: Fleet;
  private planeT: number[] = [];
  private drones: Fleet;
  private parcels: Fleet;
  private ds: Drone[] = [];
  private lights: Lights;
  private birds: Birds;
  private roofs: Roofs;
  private pad: THREE.Vector3 | null;
  private tourPath: THREE.CatmullRomCurve3 | null = null;
  private tourLen = 1;
  private mtx = new THREE.Matrix4();
  private mtx2 = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();

  constructor(private ctx: AliveCtx) {
    const g = new THREE.Group();
    g.name = "alive-air";
    ctx.group.add(g);
    // helicopters: two news choppers (white and red), the gold tour helicopter of the sail hotel
    this.news = new Fleet(heliModel("#f2f2f6", "#d0202a"), 2, g);
    this.tourF = new Fleet(heliModel("#1e1d24", "#f4b728"), 1, g);
    const rmat = new THREE.MeshStandardMaterial({ color: "#2a2a30", roughness: 0.6, transparent: true, opacity: 0.85 });
    this.rotors = new THREE.InstancedMesh(rotorGeo(), rmat, 3);
    this.tails = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.18, 0.05), rmat, 3);
    for (const im of [this.rotors, this.tails]) {
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // hidden until their helicopter is placed (an unset instance sat at the origin: a black
      // rotor lying on the avenue's zebra crossing)
      for (let i = 0; i < im.count; i++) im.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
      im.instanceMatrix.needsUpdate = true;
      g.add(im);
    }
    const hp = ctx.city.landmarks.get("burjalarab")?.points.helipad;
    this.pad = hp ? hp.clone() : null;
    this.helis.push(
      { fleet: this.news, i: 0, mode: "orbit", p: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, rotor: 0, spin: 1, t: 0 },
      { fleet: this.news, i: 1, mode: "orbit", p: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, rotor: 0, spin: 1, t: 30 },
      { fleet: this.tourF, i: 0, mode: this.pad ? "pad" : "orbit", p: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, rotor: 0, spin: 0, t: 0 },
    );
    if (this.pad) {
      const P = this.pad;
      // the tour: up from the sail, over the palm, along the bay past the opera and Liberty, back
      this.tourPath = new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(P.x, P.y + 26, P.z),
          new THREE.Vector3(-205, 70, 215),
          new THREE.Vector3(-120, 72, 228),
          new THREE.Vector3(-30, 68, 214),
          new THREE.Vector3(46, 74, 222),
          new THREE.Vector3(105, 80, 178),
          new THREE.Vector3(40, 76, 150),
          new THREE.Vector3(-60, 72, 140),
          new THREE.Vector3(-140, 64, 148),
          new THREE.Vector3(P.x + 22, P.y + 26, P.z - 10),
          new THREE.Vector3(P.x, P.y + 26, P.z),
        ],
        false,
        "centripetal",
      );
      this.tourLen = this.tourPath.getLength();
    }
    // airliners
    this.planes = new Fleet(planeModel(), LANES.length, g, 3);
    LANES.forEach((_, i) => this.planeT.push(-i * 22 - 4));
    // drones
    this.roofs = new Roofs(ctx);
    const nd = Math.min(this.roofs.tops.length, Math.round(14 + 22 * ctx.budget));
    this.drones = new Fleet(droneModel(), nd, g, 1.1);
    this.parcels = new Fleet(parcelModel(), nd, g, 1.6);
    for (let i = 0; i < nd; i++) {
      const from = this.roofs.tops[Math.floor(Math.random() * this.roofs.tops.length)].clone();
      const d: Drone = { from, to: from.clone(), cruise: 30, phase: 3, k: 0, hold: rand(0, 4), p: from.clone(), yaw: 0, carry: Math.random() < 0.5, seed: Math.random() * 100 };
      this.ds.push(d);
    }
    this.lights = new Lights(3 * 2 + LANES.length * 3 + nd + 4, g);
    this.birds = new Birds(g, ctx.budget);
    // never picked by the city's raycasts
    g.traverse((o) => (o.raycast = () => {}));
  }

  private nextLeg(d: Drone) {
    d.from.copy(d.p);
    // the next roof: not too far, not the same one
    const tops = this.roofs.tops;
    let to = tops[0];
    for (let k = 0; k < 12; k++) {
      to = tops[Math.floor(Math.random() * tops.length)];
      const dist = Math.hypot(to.x - d.p.x, to.z - d.p.z);
      if (dist > 30 && dist < 140) break;
    }
    d.to.copy(to);
    d.cruise = Math.max(26 + Math.random() * 18, this.roofs.along(d.from, d.to) + 7);
    d.phase = 0;
    d.k = 0;
  }

  private roofT = 0;
  private updateDrones(f: AliveFrame) {
    const dt = f.dt;
    // the bigger city streams in after load: rebuild the roofs when it has grown
    if ((this.roofT -= dt) <= 0) {
      this.roofT = 2;
      if (this.ctx.city.facades.length !== this.roofs.seen) {
        this.roofs.build();
        for (const d of this.ds) if (d.phase < 3) d.cruise = Math.max(d.cruise, this.roofs.along(d.p, d.to) + 7);
      }
    }
    this.ds.forEach((d, i) => {
      const V = 10;
      if (d.phase === 3) {
        d.hold -= dt;
        if (d.hold <= 0) {
          // delivered (or picked up): off to the next roof
          d.carry = !d.carry;
          this.nextLeg(d);
        }
      } else if (d.phase === 0) {
        d.p.y += dt * 4;
        if (d.p.y >= d.cruise) (d.p.y = d.cruise), (d.phase = 1);
      } else if (d.phase === 1) {
        if (d.p.y < d.cruise) d.p.y = Math.min(d.cruise, d.p.y + dt * 4);
        const dx = d.to.x - d.p.x,
          dz = d.to.z - d.p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < V * dt + 0.05) {
          d.p.x = d.to.x;
          d.p.z = d.to.z;
          d.phase = 2;
        } else {
          d.p.x += (dx / dist) * V * dt;
          d.p.z += (dz / dist) * V * dt;
          const want = yawOf(dx, dz);
          let dy = want - d.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          d.yaw += dy * Math.min(1, dt * 4);
        }
      } else if (d.phase === 2) {
        d.p.y -= dt * 3.2;
        if (d.p.y <= d.to.y) (d.p.y = d.to.y), (d.phase = 3), (d.hold = rand(2.5, 6));
      }
      const bob = Math.sin(f.t * 3 + d.seed) * 0.08;
      const tilt = d.phase === 1 ? -0.16 : 0;
      this.v.set(d.p.x, d.p.y + bob, d.p.z);
      this.drones.set(i, this.v, d.yaw, tilt, Math.sin(f.t * 2 + d.seed) * 0.04);
      if (d.carry) {
        this.v2.set(d.p.x, d.p.y + bob - 0.62, d.p.z);
        this.parcels.set(i, this.v2, d.yaw, tilt * 0.5);
      } else this.parcels.hide(i);
      // a cyan blink on each drone (gold when carrying)
      if (f.night && (f.t * 1.2 + d.seed) % 1 < 0.35) this.lights.add(this.v.setY(this.v.y + 0.45), 0.16, d.carry ? GOLD : CYAN);
    });
    this.drones.commit();
    this.parcels.commit();
  }

  private placeHeli(h: Heli, f: AliveFrame) {
    const m = this.mtx;
    h.fleet.set(h.i, h.p, h.yaw, h.pitch, h.roll);
    m.copy(h.fleet.m[h.i]);
    h.rotor += h.spin * 26 * f.dt;
    const idx = this.helis.indexOf(h);
    // main rotor on the mast, tail rotor turning in the fin's plane
    this.mtx2.makeRotationY(h.rotor).setPosition(HELI_MAST);
    this.rotors.setMatrixAt(idx, this.mtx2.premultiply(m));
    this.mtx2.makeRotationZ(h.rotor * 1.6).setPosition(HELI_TAIL);
    this.tails.setMatrixAt(idx, this.mtx2.premultiply(m));
    // beacon on top (red, slow), strobe under the belly (white, double flash)
    const blink = (f.t + idx * 0.37) % 1.2 < 0.25;
    if (blink && (f.night || h.spin > 0.5)) this.lights.add(this.v.set(-4.4, 3.3, 0).applyMatrix4(m), f.night ? 0.32 : 0.22, RED);
    const s = (f.t * 0.9 + idx * 0.2) % 1.4;
    if (f.night && (s < 0.06 || (s > 0.16 && s < 0.22))) this.lights.add(this.v.set(0.6, 0.5, 0).applyMatrix4(m), 0.3, WHITE);
  }

  private updateHelis(f: AliveFrame) {
    for (const h of this.helis) {
      h.t += f.dt;
      if (h.mode === "orbit") {
        h.spin = 1;
        if (h.i === 0 && h.fleet === this.news) {
          // the news chopper: circling the stadium, slowly, nose in
          const a = h.t * 0.09;
          const cx = -175,
            cz = -82,
            r = 58;
          const x = cx + Math.cos(a) * r,
            z = cz + Math.sin(a) * r;
          const want = Math.max(44, this.roofs.at(x, z) + 14);
          h.p.set(x, h.p.y ? h.p.y + (want - h.p.y) * Math.min(1, f.dt * 0.5) : want, z);
          h.yaw = yawOf(-Math.sin(a), Math.cos(a)) + 0.45;
          h.pitch = -0.06;
          h.roll = 0.12;
        } else {
          // the other: a wide patrol round the city, above everything but the needle
          const a = -h.t * 0.022;
          const rx = 150,
            rz = 118;
          h.p.set(-10 + Math.cos(a) * rx, 112 + Math.sin(h.t * 0.2) * 3, -30 + Math.sin(a) * rz);
          h.yaw = yawOf(Math.sin(a) * rx, -Math.cos(a) * rz);
          h.pitch = -0.12;
          h.roll = -0.14;
        }
      } else if (this.pad && this.tourPath) {
        // parked on the helipad, lift off, the tour, back down
        const P = this.pad;
        const park = 14,
          lift = 7,
          fly = this.tourLen / 22,
          land = 8;
        const k = h.t % (park + lift + fly + land);
        if (k < park) {
          h.p.copy(P);
          h.yaw = 0.6;
          h.pitch = h.roll = 0;
          h.spin = THREE.MathUtils.clamp(k < 3 ? 1 - k / 3 : k > park - 3 ? (k - (park - 3)) / 3 : 0, 0, 1) * 0.9;
        } else if (k < park + lift) {
          const u = (k - park) / lift;
          h.spin = 1;
          h.p.set(P.x, P.y + 26 * u * u * (3 - 2 * u), P.z);
          this.tourPath.getTangentAt(0, this.v);
          const want = yawOf(this.v.x, this.v.z);
          h.yaw = 0.6 + (want - 0.6) * u;
          h.pitch = h.roll = 0;
        } else if (k < park + lift + fly) {
          const u = (k - park - lift) / fly;
          this.tourPath.getPointAt(u, h.p);
          this.tourPath.getTangentAt(u, this.v);
          const want = yawOf(this.v.x, this.v.z);
          let dy = want - h.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          h.yaw += dy * Math.min(1, f.dt * 2);
          h.pitch = -0.14 * Math.min(1, u * 10, (1 - u) * 10);
          h.roll = THREE.MathUtils.clamp(-dy * 2, -0.35, 0.35);
          h.spin = 1;
        } else {
          const u = (k - park - lift - fly) / land;
          h.p.set(P.x, P.y + 26 * (1 - u * u * (3 - 2 * u)), P.z);
          let dy = 0.6 - h.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          h.yaw += dy * Math.min(1, f.dt * 1.5);
          h.pitch = h.roll = 0;
          h.spin = 1;
        }
      }
      this.placeHeli(h, f);
    }
    this.news.commit();
    this.tourF.commit();
    this.rotors.instanceMatrix.needsUpdate = true;
    this.tails.instanceMatrix.needsUpdate = true;
  }

  private updatePlanes(f: AliveFrame) {
    const span = PLANE_X0 - PLANE_X1;
    const period = span / PLANE_V + 30;
    LANES.forEach((L, i) => {
      this.planeT[i] += f.dt;
      const k = ((this.planeT[i] % period) + period) % period;
      const u = (k * PLANE_V) / span;
      if (u > 1 || this.planeT[i] < 0) return this.planes.hide(i);
      const x = PLANE_X0 - span * u;
      const y = L.y0 + (L.y1 - L.y0) * u;
      const z = L.z0 + (L.z1 - L.z0) * u;
      this.v.set(x, y, z);
      const yaw = yawOf(-span, L.z1 - L.z0);
      this.planes.set(i, this.v, yaw, 0.04);
      const m = this.planes.m[i];
      // strobes on the wingtips and the tail, a red beacon under the belly
      const s = (f.t + i * 0.3) % 1.3;
      if (s < 0.07 || (s > 0.18 && s < 0.25)) {
        for (const zz of [-35, 35]) this.lights.add(this.v2.set(-13 * VOX, 7.5 * VOX, zz * VOX).applyMatrix4(m), f.night ? 0.9 : 0.6, WHITE);
        this.lights.add(this.v2.set(-40 * VOX, 27 * VOX, 0).applyMatrix4(m), f.night ? 0.8 : 0.5, WHITE);
      }
      if (f.night && (f.t + i) % 1.1 < 0.3) this.lights.add(this.v2.set(0, 5.5 * VOX, 0).applyMatrix4(m), 0.7, RED);
    });
    this.planes.commit();
  }

  update(f: AliveFrame) {
    this.lights.begin();
    this.updateHelis(f);
    this.updatePlanes(f);
    this.updateDrones(f);
    this.lights.end();
    this.birds.update(f);
  }
}

export async function buildAir(ctx: AliveCtx): Promise<AlivePart> {
  return new Air(ctx);
}
