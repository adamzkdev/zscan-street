import * as THREE from "three";
import { atlasBitmap } from "../data/atlas";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Market } from "../data/market";
import type { City } from "./city";
import { CURB, GRID } from "./city/plan";
import { SCRAMBLE, type CityTraffic } from "./citytraffic";
import { ADS, MARKET_ADS, TICKER, zLogo, type Ad, type LiveData } from "./decor";
import { fitText } from "./fit";
import { sayAt } from "./speech";
import { toObject } from "./voxel/mesher";
import { C, E, VoxelModel } from "./voxel/model";

/**
 * Shibuya, alive: the scramble crossing at the north boulevard and the street west of the park.
 *
 *  - the famous markings: four zebras round the junction and the two diagonals across it;
 *  - the crowd: hundreds of zkSNARKs (every one a real portrait from the collection atlas, legs
 *    walking in the shader, umbrellas in the rain) waiting on the four corners, pouring across in
 *    every direction — diagonals included — when CityTraffic's scramble phase goes to WALK, then
 *    waiting again on the other side; people in the ZK COFFEE café looking down on it;
 *  - the giant LED screens of ZFRONT, the ticker round its corner, the 109's pylon, screens on the
 *    roofs and facades round the crossing (ads, live chain data, the collection, the WALK signal);
 *  - Hachiko as a zebra-striped zkSNARK dog on his plinth, pedestrian signals on every corner,
 *    and speech bubbles in the crowd.
 *
 * One draw call for the crowd, one for its shadows, one for the umbrellas.
 */

const MONO = '"JetBrains Mono", Menlo, monospace';
const FONT = '"Hiragino Sans", "Noto Sans JP", Inter, sans-serif';

/** Portrait size in metres (a little smaller than the street's zkSNARKs: it's a crowd). */
const S = 1.42;
const PX = S / 26;
/** Unique portraits in the crowd's own atlas (16 per row, 32 px each). */
const ACOLS = 16;
const UNIQUE = 256;

const LINES = {
  wait: ["Shibuya at night!", "Photo!", "Where's the MEMPOOL?", "Meet me at Hachiko!", "Look at the big screen!", "So many zkSNARKs!", "Is it green yet?", "Selfie time!", "Shielded only.", "Which way to the station?"],
  cross: ["Go go go!", "Excuse me!", "Photo!", "Scramble!", "Shibuya at night!", "Sorry!", "Don't stop!", "Where's the MEMPOOL?"],
  cafe: ["Best view in town.", "Look at them all!", "Latte, shielded."],
  block: ["Block just dropped!", "New block!", "Block just dropped!", "Confirmed!"],
};

interface Walker {
  slot: number;
  x: number;
  z: number;
  y: number;
  corner: number;
  spot: number;
  /** 0 waiting, 1 crossing, 2 in the café (still). */
  state: 0 | 1 | 2;
  path: number[];
  seg: number;
  delay: number;
  base: number;
  v: number;
  phase: number;
  dx: number;
  dz: number;
  amp: number;
  lookT: number;
}

interface Screen {
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
  hz: number;
  next: number;
  mesh: THREE.Mesh;
}

interface Corner {
  sx: number;
  sz: number;
  /** The kerb corner. */
  cx: number;
  cz: number;
  spots: { x: number; z: number; free: boolean }[];
}

const rng = (seed: number) => {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---- the crowd's shaders -----------------------------------------------------------------------

const CROWD_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec4 iPos;
attribute vec4 iMove;
attribute float iSlot;
attribute vec3 iCloth;
uniform float uPx;
varying vec2 vPx;
varying float vSlot;
varying vec3 vCloth;
varying vec3 vAnim;
void main() {
  vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  float flip = dot(vec3(iMove.x, 0.0, iMove.y), right) < 0.0 ? -1.0 : 1.0;
  float s = sin(iPos.w);
  float amp = iMove.z;
  vec2 q = position.xy;
  float lx = (q.x + 0.5) * 26.0;
  float feet = flip > 0.0 ? 15.5 : 10.5;
  vec3 wp = iPos.xyz + right * ((lx - feet) * uPx) + vec3(0.0, q.y * 35.0 * uPx, 0.0);
  vPx = vec2(flip > 0.0 ? lx : 26.0 - lx, q.y * 35.0);
  vSlot = iSlot;
  vCloth = iCloth;
  // leg swing, lift of each leg, bob of the bust (pixels, snapped)
  vAnim = vec3(floor(s * 1.4 * amp + 0.5), floor(abs(s) * 1.2 * amp + 0.5 + (1.0 - amp) * step(0.0, sin(iPos.w * 0.5)) * 0.0), s * amp);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const CROWD_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
uniform vec2 uGrid;
varying vec2 vPx;
varying float vSlot;
varying vec3 vCloth;
varying vec3 vAnim;
vec4 leg(vec2 p, float x0, float lift) {
  float lx = p.x - x0;
  float ly = p.y - lift;
  if (lx < 0.0 || lx >= 5.0 || ly < 0.0 || ly >= 8.0) return vec4(0.0);
  float r = 7.0 - floor(ly);
  float c = floor(lx);
  vec3 col = vCloth;
  if (r >= 7.0) col = vec3(0.004);
  else if (r >= 6.0) col = c >= 1.0 && c < 3.0 ? vec3(0.06, 0.055, 0.09) : vec3(0.012, 0.011, 0.018);
  else if (r >= 5.0) col = vCloth * 0.6;
  else if (c < 1.0) col = vCloth * 0.7;
  else if (c >= 4.0) col = vCloth * 0.82;
  return vec4(col, 1.0);
}
void main() {
  vec2 p = floor(vPx);
  vec4 col = vec4(0.0);
  float py = p.y - 6.0 - vAnim.y;
  if (py >= 0.0 && py < 26.0) {
    float c = mod(vSlot, uGrid.x), r = floor(vSlot / uGrid.x);
    vec2 cuv = (vec2(p.x, py) + 0.5) / 26.0;
    vec2 uv = vec2((c + cuv.x * 0.96 + 0.02) / uGrid.x, 1.0 - (r + 1.0 - (cuv.y * 0.96 + 0.02)) / uGrid.y);
    vec4 t = texture2D(uMap, uv);
    if (t.a > 0.5) col = vec4(t.rgb, 1.0);
  }
  if (col.a < 0.5 && p.y < 10.0) {
    float sw = vAnim.x;
    vec4 a = leg(p, 10.0 + sw, floor(max(0.0, vAnim.z) * 2.0 + 0.5));
    vec4 b = leg(p, 16.0 - sw, floor(max(0.0, -vAnim.z) * 2.0 + 0.5));
    col = a.a > 0.5 ? a : b;
  }
  if (col.a < 0.5) discard;
  gl_FragColor = vec4(col.rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const SHADOW_VERT = /* glsl */ `
attribute vec4 iPos;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 wp = iPos.xyz + vec3(position.x * 0.95, 0.018, position.y * 0.5);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const SHADOW_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  float d = length(vUv * 2.0 - 1.0);
  gl_FragColor = vec4(0.0, 0.0, 0.0, (1.0 - smoothstep(0.25, 1.0, d)) * 0.5);
}`;

/** The umbrella: drawn on the pixel grid like the street's (24 × 18), its colour from the slot. */
const UMB_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec4 iPos;
attribute vec4 iMove;
attribute float iSlot;
uniform float uPx;
varying vec2 vPx;
varying float vSlot;
varying float vHide;
void main() {
  vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  float lx = (position.x + 0.5) * 24.0;
  float bob = floor(abs(sin(iPos.w)) * 1.2 * iMove.z + 0.5);
  vec3 wp = iPos.xyz + right * ((lx - 12.0) * uPx * 1.1) + vec3(0.0, (22.0 + bob + position.y * 18.0) * uPx * 1.1, 0.0);
  vPx = vec2(lx, (1.0 - position.y) * 18.0);
  vSlot = iSlot;
  vHide = iMove.w;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const UMB_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
varying vec2 vPx;
varying float vSlot;
varying float vHide;
float h1(float n) { return fract(sin(n * 91.7 + 3.1) * 43758.5453); }
void main() {
  if (vHide > 0.5 || h1(vSlot) > 0.62) discard;
  vec2 p = floor(vPx);
  float k = floor(h1(vSlot * 1.7) * 6.0);
  vec3 base = k < 1.0 ? vec3(0.8, 0.05, 0.08) : k < 2.0 ? vec3(0.02, 0.2, 0.6) : k < 3.0 ? vec3(0.9, 0.9, 0.88) : k < 4.0 ? vec3(0.95, 0.55, 0.02) : k < 5.0 ? vec3(0.02, 0.02, 0.025) : vec3(0.1, 0.45, 0.2);
  vec3 col;
  bool on = false;
  float x = p.x, y = p.y;
  float hw = y < 1.0 ? 4.0 : y < 2.0 ? 8.0 : y < 3.0 ? 10.0 : y < 4.0 ? 11.0 : 12.0;
  if (y < 6.0 && abs(x + 0.5 - 12.0) <= hw) {
    on = true;
    col = y < 1.0 ? base * 1.3 : y >= 5.0 ? base * 0.65 : base;
    if (x == 6.0 && y >= 1.0 && y < 5.0) col = base * 1.35;
  }
  if (y >= 6.0 && y < 7.0 && (x == 0.0 || x == 6.0 || x == 12.0 || x == 18.0 || x == 23.0)) { on = true; col = base * 0.5; }
  if (x == 12.0 && y >= 6.0) { on = true; col = vec3(0.02, 0.02, 0.03); }
  if (!on) discard;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// ---- canvases ----------------------------------------------------------------------------------

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

/** The pedestrian lamp faces: red man standing, green man walking, both dark (three frames). */
function signalTexture() {
  const [c, g] = canvas(192, 96);
  const man = (ox: number, oy: number, color: string, walking: boolean) => {
    g.fillStyle = color;
    const p = (x: number, y: number, w = 1, h = 1) => g.fillRect(ox + x * 4, oy + y * 4, w * 4, h * 4);
    p(5, 0, 2, 2);
    p(4, 2, 4, 5);
    if (walking) {
      p(2, 3, 2, 1), p(8, 4, 2, 1);
      p(3, 7, 2, 2), p(7, 7, 2, 2), p(2, 9, 2, 2), p(8, 9, 2, 2);
    } else {
      p(3, 2, 1, 4), p(8, 2, 1, 4);
      p(4, 7, 2, 4), p(6, 7, 2, 4);
    }
  };
  for (let f = 0; f < 3; f++) {
    const x = f * 64;
    g.fillStyle = "#0b0b10";
    g.fillRect(x, 0, 64, 96);
    g.fillStyle = "#16161c";
    g.fillRect(x + 4, 2, 56, 44);
    g.fillRect(x + 4, 50, 56, 44);
    man(x + 8, 2, f === 0 ? "#ff3424" : "#3a1410", false);
    man(x + 8, 50, f === 1 ? "#4dffc0" : "#0e2a22", true);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.repeat.set(1 / 3, 1);
  return t;
}

/** The 109's pylon: silver, the number top to bottom, SHIBUYA under it. */
function pylonTexture() {
  const [c, g] = canvas(128, 640);
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, "#c9ced6");
  grad.addColorStop(0.5, "#f4f6f8");
  grad.addColorStop(1, "#c9ced6");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 640);
  g.fillStyle = "#16151b";
  g.textAlign = "center";
  g.font = `900 150px ${FONT}`;
  ["1", "0", "9"].forEach((d, i) => g.fillText(d, 64, 165 + i * 150));
  g.fillStyle = "#ff3e8a";
  g.fillRect(14, 500, 100, 6);
  g.fillStyle = "#16151b";
  g.font = `800 22px ${FONT}`;
  g.fillText("SHIBUYA", 64, 545);
  g.font = `700 18px ${MONO}`;
  g.fillStyle = "#b8862a";
  g.fillText("ZEC", 64, 590);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Hachiko's plaque. */
function plaqueTexture() {
  const [c, g] = canvas(256, 96);
  g.fillStyle = "#3a2c1c";
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = "#d8b25a";
  g.lineWidth = 5;
  g.strokeRect(6, 6, 244, 84);
  g.fillStyle = "#e8c66a";
  g.textAlign = "center";
  g.font = `800 34px ${FONT}`;
  g.fillText("HACHIKO", 128, 46);
  g.font = `600 16px ${MONO}`;
  g.fillText("ハチ公 · zkSNARK", 128, 74);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- Hachiko -------------------------------------------------------------------------------------

/**
 * Hachiko, sitting up and waiting, as a zebra (Zcash's mascot) zkSNARK: white with black stripes,
 * a black mane, gold eyes and a gold Z on his collar. Voxels at the street's own scale (6 per metre),
 * facing +z in the model.
 */
function hachikoModel() {
  const m = new VoxelModel(16, 22, 18);
  const W = C("#ecebe6"),
    K = C("#141318"),
    gold = E("#f4b728", 2.2);
  const stripe = (x: number, y: number, z: number) => (Math.floor((y + z * 0.6 + Math.abs(x - 7.5) * 0.3) / 2) % 2 === 0 ? K : W);
  // haunches and hind legs
  m.box(3, 0, 1, 13, 5, 8, stripe);
  m.box(2, 0, 3, 4, 3, 9, stripe);
  m.box(12, 0, 3, 14, 3, 9, stripe);
  // front legs, straight
  m.box(5, 0, 9, 7, 8, 11, stripe);
  m.box(9, 0, 9, 11, 8, 11, stripe);
  m.box(5, 0, 11, 7, 1, 12, K);
  m.box(9, 0, 11, 11, 1, 12, K);
  // chest and body leaning up
  m.box(4, 5, 3, 12, 10, 10, stripe);
  m.box(5, 10, 5, 11, 13, 11, stripe);
  // neck and head
  m.box(5, 12, 7, 11, 15, 12, stripe);
  m.box(4, 14, 7, 12, 19, 13, stripe);
  // muzzle, nose
  m.box(6, 14, 13, 10, 17, 16, W);
  m.box(7, 16, 15, 9, 17, 16, K);
  // ears up
  m.box(4, 19, 8, 6, 21, 10, K);
  m.box(10, 19, 8, 12, 21, 10, K);
  // mane along the neck
  m.box(7, 13, 5, 9, 20, 7, K);
  // eyes
  m.set(5, 17, 13, gold);
  m.set(10, 17, 13, gold);
  // collar with the Z tag
  m.box(5, 12, 8, 11, 13, 12, C("#c0302e"));
  m.box(7, 10, 12, 9, 12, 13, gold);
  // the tail curled over the back
  m.box(7, 6, 0, 9, 9, 1, stripe);
  m.box(7, 9, 0, 9, 10, 2, K);
  return m;
}

// ---- the module ------------------------------------------------------------------------------------

export interface ShibuyaOptions {
  /** People in the crowd (the café's come on top). */
  count?: number;
  /** Live chain data for the screens (Director: blockHeight, lastBlockTime, mempoolList()). */
  director?: { blockHeight: number | null; lastBlockTime: number; mempoolList(): unknown[] };
}

export class Shibuya {
  readonly group = new THREE.Group();
  /** False when the city has no Shibuya lot (the crossing still runs). */
  readonly ok: boolean;
  /** Centre of the crossing (for the districts menu, the camera). */
  readonly centre = new THREE.Vector3(SCRAMBLE.x, 0, SCRAMBLE.z);
  private corners: Corner[] = [];
  private walkers: Walker[] = [];
  private walkOn = false;
  private pos!: THREE.InstancedBufferAttribute;
  private mov!: THREE.InstancedBufferAttribute;
  private crowd: THREE.Mesh | null = null;
  private shadows: THREE.Mesh | null = null;
  private umbrellas: THREE.Mesh | null = null;
  private crowdMat: THREE.ShaderMaterial | null = null;
  private screens: Screen[] = [];
  private signalTex: THREE.CanvasTexture;
  private faces: HTMLCanvasElement | null = null;
  private anchors: { o: THREE.Object3D; who: number; until: number }[] = [];
  private talkIn = 2;
  private blockAt = -1e9;
  private blockHeight: number | null = null;
  private t = 0;
  private rain = false;
  private night = true;
  private near = true;
  private live: LiveData = { height: null, mempool: 0, since: 0 };
  private X0: number;
  private X1: number;
  private Z0: number;
  private Z1: number;
  private hachi = new THREE.Vector3();

  constructor(
    scene: THREE.Object3D,
    private city: City,
    private traffic: CityTraffic,
    private opts: ShibuyaOptions = {},
  ) {
    scene.add(this.group);
    const hx = (GRID.xw[GRID.xs.indexOf(SCRAMBLE.x)] ?? 8) / 2,
      hz = (GRID.zw[GRID.zs.indexOf(SCRAMBLE.z)] ?? 14) / 2;
    this.X0 = SCRAMBLE.x - hx;
    this.X1 = SCRAMBLE.x + hx;
    this.Z0 = SCRAMBLE.z - hz;
    this.Z1 = SCRAMBLE.z + hz;
    Market.subscribe((m) => (this.live.market = m));
    const lm = city.landmarks.get("shibuya");
    this.ok = !!lm;
    if (lm?.points.hachi) this.hachi.copy(lm.points.hachi).setY(CURB);
    else this.hachi.set(this.X0 - 9, CURB, this.Z0 - 2);
    this.markings();
    this.signalTex = signalTexture();
    this.signals();
    this.hachiko();
    this.buildCorners();
    this.buildCrowd(opts.count ?? 260, lm?.points);
    if (lm) this.landmarkScreens(lm.points);
    this.neighbourScreens();
    for (let i = 0; i < 4; i++) {
      const o = new THREE.Object3D();
      this.group.add(o);
      this.anchors.push({ o, who: -1, until: 0 });
    }
  }

  // ---- the markings ----------------------------------------------------------------------------

  private markings() {
    const { X0, X1, Z0, Z1 } = this;
    const pad = 4.4;
    const mx0 = X0 - pad,
      mz0 = Z0 - pad;
    const Wm = X1 - X0 + pad * 2,
      Dm = Z1 - Z0 + pad * 2;
    const PPM = 24;
    const [c, g] = canvas(Math.round(Wm * PPM), Math.round(Dm * PPM));
    const r = rng(41);
    const px = (x: number) => (x - mx0) * PPM,
      pz = (z: number) => (z - mz0) * PPM;
    g.fillStyle = "#ecebe8";
    const rect = (x0: number, z0: number, x1: number, z1: number) => g.fillRect(px(Math.min(x0, x1)), pz(Math.min(z0, z1)), Math.abs(x1 - x0) * PPM, Math.abs(z1 - z0) * PPM);
    const SW = 0.45,
      STEP = 0.9,
      B0 = 0.6,
      B1 = 3.6;
    // the four zebras just outside the junction
    for (let z = Z0 + 0.35; z + SW <= Z1 - 0.3; z += STEP) {
      rect(X0 - B1, z, X0 - B0, z + SW);
      rect(X1 + B0, z, X1 + B1, z + SW);
    }
    for (let x = X0 + 0.3; x + SW <= X1 - 0.25; x += STEP) {
      rect(x, Z0 - B1, x + SW, Z0 - B0);
      rect(x, Z1 + B0, x + SW, Z1 + B1);
    }
    // the diagonals, corner to corner across the junction
    for (const [ax, az, bx, bz] of [
      [X0 + 0.4, Z0 + 0.4, X1 - 0.4, Z1 - 0.4],
      [X1 - 0.4, Z0 + 0.4, X0 + 0.4, Z1 - 0.4],
    ]) {
      const len = Math.hypot(bx - ax, bz - az);
      g.save();
      g.translate(px(ax), pz(az));
      g.rotate(Math.atan2(bz - az, bx - ax));
      for (let s = 0.5; s + SW < len - 0.3; s += STEP) g.fillRect(s * PPM, -1.5 * PPM, SW * PPM, 3 * PPM);
      g.restore();
    }
    // stop lines, behind the zebras, across the lanes coming in (right-hand traffic)
    const SL = 4.0;
    rect(X0 - SL - 0.4, SCRAMBLE.z, X0 - SL, Z1);
    rect(X1 + SL, Z0, X1 + SL + 0.4, SCRAMBLE.z);
    rect(X0, Z0 - SL - 0.4, SCRAMBLE.x, Z0 - SL);
    rect(SCRAMBLE.x, Z1 + SL, X1, Z1 + SL + 0.4);
    // worn paint: tyre-darkened specks
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.6})`;
      g.fillRect(r() * c.width, r() * c.height, 1 + r() * 3, 1 + r() * 2);
    }
    g.globalCompositeOperation = "source-over";
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(Wm, Dm), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(mx0 + Wm / 2, 0.03, mz0 + Dm / 2);
    plane.receiveShadow = true;
    plane.renderOrder = 1;
    this.group.add(plane);
  }

  // ---- pedestrian signals on the four corners ------------------------------------------------------

  private signals() {
    const poles: THREE.BufferGeometry[] = [];
    const faces: THREE.BufferGeometry[] = [];
    for (const [cx, cz, sx, sz] of [
      [this.X0, this.Z0, -1, -1],
      [this.X1, this.Z0, 1, -1],
      [this.X0, this.Z1, -1, 1],
      [this.X1, this.Z1, 1, 1],
    ]) {
      // one pole on each kerb of the corner, its head facing the people across the road
      for (const along of ["x", "z"] as const) {
        const x = along === "x" ? cx + sx * 0.45 : cx + sx * 3.9;
        const z = along === "x" ? cz + sz * 3.9 : cz + sz * 0.45;
        this.city.nav.addCircle(x, z, 0.15);
        poles.push(new THREE.BoxGeometry(0.1, 2.9, 0.1).translate(x, CURB + 1.45, z));
        // the head faces across: −sx for a pole on the x kerb (the boulevard)… it faces the far kerb
        const face = along === "x" ? new THREE.Vector3(0, 0, -sz) : new THREE.Vector3(-sx, 0, 0);
        const yaw = Math.atan2(face.x, face.z);
        const head = new THREE.BoxGeometry(0.42, 0.66, 0.22);
        head.rotateY(yaw).translate(x, CURB + 2.55, z);
        poles.push(head);
        const f = new THREE.PlaneGeometry(0.36, 0.56);
        f.rotateY(yaw).translate(x + face.x * 0.115, CURB + 2.55, z + face.z * 0.115);
        faces.push(f);
        // and its back for those behind it
        const b = new THREE.PlaneGeometry(0.36, 0.56);
        b.rotateY(yaw + Math.PI).translate(x - face.x * 0.115, CURB + 2.55, z - face.z * 0.115);
        faces.push(b);
      }
    }
    this.group.add(new THREE.Mesh(mergeGeometries(poles), new THREE.MeshStandardMaterial({ color: "#2a2832", roughness: 0.6 })));
    this.group.add(new THREE.Mesh(mergeGeometries(faces), new THREE.MeshBasicMaterial({ map: this.signalTex, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) })));
  }

  private hachiko() {
    const p = this.hachi;
    const plinthM = new THREE.MeshStandardMaterial({ color: "#7a746c", roughness: 0.8 });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 1.1), plinthM);
    plinth.position.set(p.x, CURB + 0.55, p.z);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.1, 1.26), new THREE.MeshStandardMaterial({ color: "#8e877e", roughness: 0.7 }));
    cap.position.set(p.x, CURB + 1.15, p.z);
    const dog = toObject(hachikoModel());
    dog.position.set(p.x, CURB + 1.2, p.z);
    // facing the crossing
    dog.rotation.y = Math.atan2(SCRAMBLE.x - p.x, SCRAMBLE.z - p.z);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshBasicMaterial({ map: plaqueTexture() }));
    const dir = new THREE.Vector3(Math.sin(dog.rotation.y), 0, Math.cos(dog.rotation.y));
    // the plaque on the plinth's long face nearest the crossing
    const longFace = Math.abs(dir.z) > Math.abs(dir.x) ? new THREE.Vector3(0, 0, Math.sign(dir.z)) : new THREE.Vector3(Math.sign(dir.x), 0, 0);
    plaque.position.set(p.x + longFace.x * 0.86, CURB + 0.6, p.z + longFace.z * 0.56);
    plaque.rotation.y = Math.atan2(longFace.x, longFace.z);
    this.group.add(plinth, cap, dog, plaque);
    this.city.nav.addRect(p.x - 0.95, p.z - 0.65, p.x + 0.95, p.z + 0.65);
  }

  // ---- the corners and their waiting spots ------------------------------------------------------------

  private buildCorners() {
    const nav = this.city.nav;
    const r = rng(7);
    for (const [cx, cz, sx, sz] of [
      [this.X0, this.Z0, -1, -1],
      [this.X1, this.Z0, 1, -1],
      [this.X0, this.Z1, -1, 1],
      [this.X1, this.Z1, 1, 1],
    ]) {
      // the NW corner is ZFRONT's plaza: deeper
      const big = sx < 0 && sz < 0;
      const deep = big ? 3.4 : 2.5,
        alongX = big ? 8.6 : 8.5,
        alongZ = big ? 11 : 7.5;
      const spots: Corner["spots"] = [];
      for (let a = 0.4; a < Math.max(alongX, deep); a += 0.6)
        for (let b = 0.4; b < Math.max(alongZ, deep); b += 0.6) {
          const inL = (b < deep && a < alongX) || (a < deep && b < alongZ);
          if (!inL) continue;
          const x = cx + sx * (a + (r() - 0.5) * 0.2),
            z = cz + sz * (b + (r() - 0.5) * 0.2);
          if (!nav.free(x, z, 0.26)) continue;
          if (Math.hypot(x - this.hachi.x, z - this.hachi.z) < 1.5) continue;
          spots.push({ x, z, free: true });
        }
      // the front of the crowd at the kerb first
      spots.sort((p, q) => Math.min(Math.abs(p.x - cx), Math.abs(p.z - cz)) - Math.min(Math.abs(q.x - cx), Math.abs(q.z - cz)));
      this.corners.push({ sx, sz, cx, cz, spots });
    }
  }

  private freeSpot(c: Corner, r: number) {
    const free = c.spots.map((s, i) => (s.free ? i : -1)).filter((i) => i >= 0);
    if (!free.length) return Math.floor(r * c.spots.length);
    // mostly near the kerb
    return free[Math.floor(Math.pow(r, 1.7) * free.length)];
  }

  // ---- the crowd ------------------------------------------------------------------------------------

  private buildCrowd(count: number, pts?: Record<string, THREE.Vector3>) {
    const r = rng(1234);
    // the café's customers at its windows, looking down on the crossing
    const cafe: { x: number; y: number; z: number; dx: number; dz: number }[] = [];
    if (pts?.cafeFa && pts.cafeFb && pts.cafeSa && pts.cafeSb) {
      const out = (a: THREE.Vector3, b: THREE.Vector3, n: number, dx: number, dz: number) => {
        for (let i = 0; i < n; i++) {
          const t = (i + 0.3 + r() * 0.4) / n;
          cafe.push({ x: a.x + (b.x - a.x) * t, y: a.y, z: a.z + (b.z - a.z) * t, dx, dz });
        }
      };
      out(pts.cafeFa, pts.cafeFb, 8, 1, 0);
      out(pts.cafeSa, pts.cafeSb, 5, 0, 1);
    }
    const capacity = this.corners.map((c) => c.spots.length);
    const total = capacity.reduce((a, b) => a + b, 0);
    const n = Math.min(count, Math.floor(total * 0.7));
    for (let i = 0; i < n; i++) {
      // fill the corners in proportion to their room
      let k = 0,
        pick = r() * total;
      while (pick > capacity[k] && k < 3) pick -= capacity[k++];
      const c = this.corners[k];
      const spot = this.freeSpot(c, r());
      c.spots[spot].free = false;
      const s = c.spots[spot];
      this.walkers.push({ slot: i % UNIQUE, x: s.x, z: s.z, y: CURB, corner: k, spot, state: 0, path: [], seg: 0, delay: 0, base: 1.25 + r() * 0.45, v: 0, phase: r() * 10, dx: -c.sx, dz: -c.sz, amp: 0, lookT: r() * 6 });
    }
    for (const p of cafe) this.walkers.push({ slot: (this.walkers.length * 7) % UNIQUE, x: p.x, z: p.z, y: p.y, corner: -1, spot: -1, state: 2, path: [], seg: 0, delay: 0, base: 0, v: 0, phase: r() * 10, dx: p.dx, dz: p.dz, amp: 0, lookT: r() * 6 });
    const N = this.walkers.length;
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute("position", quad.getAttribute("position"));
    geo.setAttribute("uv", quad.getAttribute("uv"));
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
    this.mov = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.mov.setUsage(THREE.DynamicDrawUsage);
    const slot = new THREE.InstancedBufferAttribute(new Float32Array(this.walkers.map((w) => w.slot)), 1);
    const cloth = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    geo.setAttribute("iPos", this.pos);
    geo.setAttribute("iMove", this.mov);
    geo.setAttribute("iSlot", slot);
    geo.setAttribute("iCloth", cloth);
    geo.instanceCount = N;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(SCRAMBLE.x - 4, 4, SCRAMBLE.z - 3), 40);
    const rows = Math.ceil(UNIQUE / ACOLS);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uGrid: { value: new THREE.Vector2(ACOLS, rows) }, uPx: { value: PX } }]),
      vertexShader: CROWD_VERT,
      fragmentShader: CROWD_FRAG,
      fog: true,
    });
    this.crowdMat = mat;
    this.crowd = new THREE.Mesh(geo, mat);
    this.crowd.frustumCulled = true;
    this.crowd.visible = false;
    // shadows and umbrellas share the instance buffers
    const sq = new THREE.PlaneGeometry(1, 1);
    const sg = new THREE.InstancedBufferGeometry();
    sg.index = sq.index;
    sg.setAttribute("position", sq.getAttribute("position"));
    sg.setAttribute("uv", sq.getAttribute("uv"));
    sg.setAttribute("iPos", this.pos);
    sg.instanceCount = N;
    sg.boundingSphere = geo.boundingSphere;
    this.shadows = new THREE.Mesh(sg, new THREE.ShaderMaterial({ vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG, transparent: true, depthWrite: false }));
    this.shadows.renderOrder = 2;
    const ug = new THREE.InstancedBufferGeometry();
    ug.index = quad.index;
    for (const k of ["position", "uv", "iPos", "iMove", "iSlot"]) ug.setAttribute(k, geo.getAttribute(k));
    ug.instanceCount = N;
    ug.boundingSphere = geo.boundingSphere;
    this.umbrellas = new THREE.Mesh(
      ug,
      new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uPx: { value: PX } }]), vertexShader: UMB_VERT, fragmentShader: UMB_FRAG, fog: true }),
    );
    this.umbrellas.visible = false;
    this.group.add(this.crowd, this.shadows, this.umbrellas);
    this.writeInstances();
    void this.loadFaces(cloth, r);
  }

  /** The crowd's portraits: cut out of the collection atlas, background keyed out, cloth colours read. */
  private async loadFaces(cloth: THREE.InstancedBufferAttribute, r: () => number) {
    const ids: number[] = [];
    const seen = new Set<number>();
    while (ids.length < UNIQUE) {
      const id = 1 + Math.floor(r() * 10000);
      if (!seen.has(id)) seen.add(id), ids.push(id);
    }
    const rows = Math.ceil(UNIQUE / ACOLS);
    const [c, g] = canvas(ACOLS * 32, rows * 32);
    const colours: THREE.Color[] = [];
    try {
      // one shared download for the whole app (retried on API trouble)
      const bmp = await atlasBitmap();
      const cell = bmp.width / 100;
      g.imageSmoothingEnabled = false;
      ids.forEach((id, i) => g.drawImage(bmp, ((id - 1) % 100) * cell, Math.floor((id - 1) / 100) * cell, cell, cell, (i % ACOLS) * 32, Math.floor(i / ACOLS) * 32, 32, 32));
      bmp.close();
      const img = g.getImageData(0, 0, c.width, c.height);
      const d = img.data,
        W = c.width;
      const bg = (i: number) => d[i] <= 38 && d[i + 1] <= 38 && d[i + 2] <= 38;
      for (let k = 0; k < UNIQUE; k++) {
        const ox = (k % ACOLS) * 32,
          oy = Math.floor(k / ACOLS) * 32;
        const seenC = new Uint8Array(32 * 32);
        const stack: number[] = [];
        for (let t = 0; t < 32; t++) stack.push(t, 31 * 32 + t, t * 32, t * 32 + 31);
        while (stack.length) {
          const q = stack.pop()!;
          if (seenC[q]) continue;
          seenC[q] = 1;
          const x = q % 32,
            y = (q / 32) | 0;
          const i = ((oy + y) * W + ox + x) * 4;
          if (!bg(i)) continue;
          d[i + 3] = 0;
          if (x > 0) stack.push(q - 1);
          if (x < 31) stack.push(q + 1);
          if (y > 0) stack.push(q - 32);
          if (y < 31) stack.push(q + 32);
        }
        // cloth: the bottom rows right of centre (the bust)
        let rr = 0,
          gg = 0,
          bb = 0,
          n = 0;
        for (let y = 26; y < 31; y++)
          for (let x = 16; x < 26; x++) {
            const i = ((oy + y) * W + ox + x) * 4;
            if (d[i + 3] === 0) continue;
            rr += d[i];
            gg += d[i + 1];
            bb += d[i + 2];
            n++;
          }
        colours.push(n ? new THREE.Color().setRGB(rr / n / 255, gg / n / 255, bb / n / 255, THREE.SRGBColorSpace).multiplyScalar(0.62) : new THREE.Color("#2e2c38"));
      }
      g.putImageData(img, 0, 0);
    } catch {
      // offline: simple pixel busts in random colours, so the crossing is never empty
      g.clearRect(0, 0, c.width, c.height);
      for (let k = 0; k < UNIQUE; k++) {
        const ox = (k % ACOLS) * 32,
          oy = Math.floor(k / ACOLS) * 32;
        const hue = Math.floor(r() * 360);
        g.fillStyle = `hsl(${hue},45%,40%)`;
        g.fillRect(ox + 10, oy + 20, 16, 12);
        g.fillStyle = `hsl(${(hue + 40) % 360},35%,70%)`;
        g.fillRect(ox + 12, oy + 8, 12, 12);
        colours.push(new THREE.Color(`hsl(${hue},45%,25%)`));
      }
    }
    this.faces = c;
    this.walkers.forEach((w, i) => cloth.setXYZ(i, colours[w.slot].r, colours[w.slot].g, colours[w.slot].b));
    cloth.needsUpdate = true;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    this.crowdMat!.uniforms.uMap.value = tex;
    this.crowd!.visible = true;
  }

  private writeInstances() {
    const P = this.pos.array as Float32Array,
      M = this.mov.array as Float32Array;
    this.walkers.forEach((w, i) => {
      P[i * 4] = w.x;
      P[i * 4 + 1] = w.y;
      P[i * 4 + 2] = w.z;
      P[i * 4 + 3] = w.phase;
      M[i * 4] = w.dx;
      M[i * 4 + 1] = w.dz;
      M[i * 4 + 2] = w.amp;
      M[i * 4 + 3] = w.state === 2 ? 1 : 0;
    });
    this.pos.needsUpdate = true;
    this.mov.needsUpdate = true;
  }

  /** WALK: three in four cross, to any other corner (diagonals too), the front of each corner first. */
  private startWalk() {
    const r = Math.random;
    const movers = this.walkers.filter((w) => w.state === 0 && r() < 0.78);
    for (const w of movers) this.corners[w.corner].spots[w.spot].free = true;
    const used = this.corners.map((c) => c.spots.filter((s) => !s.free).length);
    for (const w of movers) {
      const from = this.corners[w.corner];
      // the other corners, weighted by their free room
      const opts = [0, 1, 2, 3].filter((k) => k !== w.corner);
      const room = opts.map((k) => Math.max(1, this.corners[k].spots.length - used[k]));
      let pick = r() * room.reduce((a, b) => a + b, 0),
        j = 0;
      while (pick > room[j] && j < opts.length - 1) pick -= room[j++];
      const k = opts[j];
      const to = this.corners[k];
      const spot = this.freeSpot(to, r());
      to.spots[spot].free = false;
      used[k]++;
      const s = to.spots[spot];
      // across the zebra between the two corners, or straight over the diagonal
      const jit = () => (r() - 0.5) * 2.2;
      let ax: number, az: number, bx: number, bz: number;
      if (from.sz === to.sz) {
        // same side of the boulevard: over the street's zebra
        const z = from.cz + from.sz * (2.1 + jit() * 0.6);
        ax = from.cx + from.sx * 0.3;
        bx = to.cx + to.sx * 0.3;
        az = z;
        bz = z + jit() * 0.3;
      } else if (from.sx === to.sx) {
        const x = from.cx + from.sx * (2.1 + jit() * 0.6);
        az = from.cz + from.sz * 0.3;
        bz = to.cz + to.sz * 0.3;
        ax = x;
        bx = x + jit() * 0.3;
      } else {
        const j1 = jit() * 0.5;
        ax = from.cx + from.sx * 0.3 + j1;
        az = from.cz + from.sz * 0.3 - j1;
        bx = to.cx + to.sx * 0.3 - j1;
        bz = to.cz + to.sz * 0.3 + j1;
      }
      w.path = [w.x, w.z, ax, az, bx, bz, s.x, s.z];
      w.seg = 0;
      w.state = 1;
      w.corner = k;
      w.spot = spot;
      // the front rows step off first
      const depth = Math.min(Math.abs(w.x - from.cx), Math.abs(w.z - from.cz));
      w.delay = 0.2 + depth * 0.55 + r() * 1.2;
    }
  }

  private stepCrowd(dt: number) {
    const sc = this.traffic.scramble();
    if (sc.walk && !this.walkOn && sc.t < 3) this.startWalk();
    this.walkOn = sc.walk;
    for (const w of this.walkers) {
      if (w.state === 1) {
        if (w.delay > 0) {
          w.delay -= dt;
          w.amp = Math.max(0, w.amp - dt * 4);
          w.phase += dt * 1.5;
          continue;
        }
        const P = w.path;
        // what's left of the way, and the time left before the cars go
        let rest = 0;
        let px = w.x,
          pz = w.z;
        for (let i = (w.seg + 1) * 2; i < P.length; i += 2) {
          rest += Math.hypot(P[i] - px, P[i + 1] - pz);
          px = P[i];
          pz = P[i + 1];
        }
        const onRoad = w.seg <= 1;
        const need = onRoad ? rest / Math.max(0.6, sc.walk ? sc.clear - 1.5 : 0.6) : 0;
        const target = Math.min(4.2, Math.max(w.base, need));
        w.v += (target - w.v) * Math.min(1, dt * 3);
        let move = w.v * dt;
        while (move > 0 && w.seg * 2 + 3 < P.length) {
          const tx = P[w.seg * 2 + 2],
            tz = P[w.seg * 2 + 3];
          const dx = tx - w.x,
            dz = tz - w.z;
          const d = Math.hypot(dx, dz);
          if (d < 1e-4) {
            w.seg++;
            continue;
          }
          w.dx = dx / d;
          w.dz = dz / d;
          const s = Math.min(d, move);
          w.x += w.dx * s;
          w.z += w.dz * s;
          move -= s;
          if (s >= d) w.seg++;
        }
        w.amp = Math.min(1, w.amp + dt * 5);
        w.phase += dt * (6 + w.v * 2.6);
        if (w.seg * 2 + 3 >= P.length) {
          w.state = 0;
          w.v = 0;
          const c = this.corners[w.corner];
          w.dx = -c.sx * 0.7 + (Math.random() - 0.5) * 0.4;
          w.dz = -c.sz * 0.7;
        }
      } else {
        // waiting: shifting from foot to foot, looking round now and then
        w.amp = Math.max(0, w.amp - dt * 4);
        w.phase += dt * 1.2;
        w.lookT -= dt;
        if (w.lookT < 0) {
          w.lookT = 2 + Math.random() * 6;
          if (w.state === 0) {
            const c = this.corners[w.corner];
            const away = Math.random() < 0.3;
            w.dx = (away ? c.sx : -c.sx) * (0.4 + Math.random());
            w.dz = (away ? c.sz : -c.sz) * (0.4 + Math.random());
          } else w.dx = -w.dx;
        }
      }
      const road = Math.abs(w.x - SCRAMBLE.x) < this.X1 - SCRAMBLE.x - 0.05 || Math.abs(w.z - SCRAMBLE.z) < this.Z1 - SCRAMBLE.z - 0.05;
      if (w.state !== 2) w.y = road ? 0.02 : CURB;
    }
  }

  // ---- screens ---------------------------------------------------------------------------------------

  /** A screen from its bottom-left and top-right corners (as seen from outside), canvas `pw` wide. */
  private screen(A: THREE.Vector3, B: THREE.Vector3, pw: number, draw: Screen["draw"], hz = 12, bezel = false, parent: THREE.Object3D = this.group) {
    const d = new THREE.Vector3(B.x - A.x, 0, B.z - A.z);
    const w = d.length(),
      h = B.y - A.y;
    if (w < 0.3 || h < 0.3) return;
    d.normalize();
    const n = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
    const ph = Math.max(16, Math.round((pw * h) / w));
    const [c, ctx] = canvas(pw, ph);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }));
    mesh.position.set((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2).addScaledVector(n, 0.04);
    mesh.rotation.y = Math.atan2(n.x, n.z);
    parent.add(mesh);
    if (bezel) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.3), new THREE.MeshStandardMaterial({ color: "#121117", roughness: 0.5, metalness: 0.5 }));
      b.position.copy(mesh.position).addScaledVector(n, -0.2);
      b.rotation.y = mesh.rotation.y;
      parent.add(b);
    }
    this.screens.push({ ctx, tex, draw, hz, next: Math.random() * 0.2, mesh });
    draw(ctx, pw, ph, 0);
    tex.needsUpdate = true;
  }

  /** A programme: each ad for `secs`, the block flash on top when a block lands. */
  private programme(list: Ad[], secs = 9, offset = 0): Screen["draw"] {
    return (ctx, w, h, t) => {
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      if (t - this.blockAt < 7 && this.blockHeight) return this.blockFlash(ctx, w, h, t);
      list[Math.floor(t / secs + offset) % list.length](ctx, w, h, t, this.live);
    };
  }

  private blockFlash(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const age = t - this.blockAt;
    ctx.fillStyle = Math.floor(age * 4) % 2 && age < 1.5 ? "#f4b728" : "#07060a";
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w * 0.6);
    g.addColorStop(0, "rgba(244,183,40,0.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${h * 0.13}px ${MONO}`;
    fitText(ctx, "BLOCK JUST DROPPED", w / 2, h * 0.3, w * 0.9);
    ctx.fillStyle = "#f4b728";
    ctx.font = `900 ${h * 0.3}px ${MONO}`;
    fitText(ctx, `#${this.blockHeight!.toLocaleString("en-US")}`, w / 2, h * 0.68, w * 0.92);
    ctx.fillStyle = "#ffe8b0";
    ctx.font = `600 ${h * 0.09}px ${FONT}`;
    fitText(ctx, "ZCASH MAINNET · SHIBUYA", w / 2, h * 0.88, w * 0.9);
    ctx.textAlign = "left";
  }

  /** The crossing's own signal, giant: WALK and the seconds left, or the wait. */
  private readonly walkAd: Ad = (ctx, w, h, t) => {
    const sc = this.traffic.scramble();
    const go = sc.walk;
    ctx.fillStyle = go ? "#021a12" : "#1a0406";
    ctx.fillRect(0, 0, w, h);
    const col = go ? (sc.flash && Math.floor(t * 4) % 2 ? "#0e3a2a" : "#4dffc0") : "#ff3424";
    // the pixel man
    const s = h / 16;
    const ox = w * 0.08,
      oy = h * 0.14;
    ctx.fillStyle = col;
    const p = (x: number, y: number, ww = 1, hh = 1) => ctx.fillRect(ox + x * s, oy + y * s, ww * s, hh * s);
    const step = Math.floor(t * 3) % 2;
    p(4, 0, 2, 2);
    p(3, 2, 4, 5);
    if (go) {
      p(1, 3, 2, 1), p(7, 4, 2, 1);
      if (step) p(2, 7, 2, 2), p(6, 7, 2, 2), p(1, 9, 2, 2), p(7, 9, 2, 2);
      else p(3, 7, 2, 4), p(5, 7, 2, 4);
    } else {
      p(2, 2, 1, 4), p(7, 2, 1, 4);
      p(3, 7, 2, 4), p(5, 7, 2, 4);
    }
    ctx.fillStyle = col;
    ctx.font = `900 ${h * 0.3}px ${MONO}`;
    fitText(ctx, go ? "WALK" : "WAIT", w * 0.36, h * 0.48, w * 0.6);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${h * 0.12}px ${MONO}`;
    fitText(ctx, go ? `SCRAMBLE · ${Math.ceil(sc.left)}s` : `SCRAMBLE IN ${Math.ceil(sc.next)}s`, w * 0.36, h * 0.7, w * 0.6);
    ctx.fillStyle = "#9a98a8";
    ctx.font = `600 ${h * 0.08}px ${FONT}`;
    fitText(ctx, "渋谷スクランブル交差点", w * 0.36, h * 0.86, w * 0.6);
  };

  /** The collection on the big screen: rows of zkSNARK portraits gliding past. */
  private readonly faceAd: Ad = (ctx, w, h, t) => {
    ctx.fillStyle = "#0a0414";
    ctx.fillRect(0, 0, w, h);
    const f = this.faces;
    if (f) {
      const s = h / 3.2;
      ctx.imageSmoothingEnabled = false;
      for (let row = 0; row < 3; row++) {
        const off = ((t * (row % 2 ? -28 : 36)) % s) - s;
        for (let i = 0; i * s + off < w + s; i++) {
          const k = (row * 37 + i + Math.floor((t * (row % 2 ? -28 : 36)) / s) * (row % 2 ? -1 : 1) + 4096) % UNIQUE;
          ctx.drawImage(f, (k % ACOLS) * 32, Math.floor(k / ACOLS) * 32, 32, 32, i * s + off, row * s * 1.05, s, s);
        }
      }
      ctx.imageSmoothingEnabled = true;
    }
    ctx.fillStyle = "rgba(10,4,20,0.72)";
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
    ctx.fillStyle = "#e8e0ff";
    ctx.font = `800 ${h * 0.13}px ${FONT}`;
    fitText(ctx, "10,000 zkSNARKs", w * 0.04, h * 0.9, w * 0.6);
    ctx.fillStyle = "#b07bff";
    ctx.font = `600 ${h * 0.07}px ${MONO}`;
    ctx.textAlign = "right";
    fitText(ctx, "ON THE CROSSING NOW", w * 0.96, h * 0.9, w * 0.38);
    ctx.textAlign = "left";
  };

  /** Live chain board: height, mempool, time since the block, ZEC price. */
  private readonly chainAd: Ad = (ctx, w, h, t) => {
    const L = this.live;
    ctx.fillStyle = "#03101a";
    ctx.fillRect(0, 0, w, h);
    zLogo(ctx, h * 0.17, h * 0.2, h * 0.2, "#f4b728");
    ctx.fillStyle = "#3ef0ff";
    ctx.font = `700 ${h * 0.09}px ${MONO}`;
    fitText(ctx, "ZCASH · LIVE FROM SHIBUYA", h * 0.33, h * 0.23, w * 0.6);
    ctx.fillStyle = "#e8fbff";
    ctx.font = `900 ${h * 0.25}px ${MONO}`;
    fitText(ctx, L.height ? `#${L.height.toLocaleString("en-US")}` : "SYNCING", w * 0.05, h * 0.56, w * 0.9);
    ctx.font = `700 ${h * 0.1}px ${MONO}`;
    ctx.fillStyle = "#ff3e8a";
    fitText(ctx, `MEMPOOL ${L.mempool} TX`, w * 0.05, h * 0.76, w * 0.45);
    ctx.fillStyle = "#9ad8ff";
    fitText(ctx, `${Math.floor(L.since)}s SINCE BLOCK`, w * 0.52, h * 0.76, w * 0.45);
    const p = L.market?.price;
    if (p) {
      ctx.fillStyle = p.usd_24h_change >= 0 ? "#2fbf9c" : "#f06b76";
      fitText(ctx, `ZEC $${p.usd.toFixed(2)} ${p.usd_24h_change >= 0 ? "▲" : "▼"}${Math.abs(p.usd_24h_change).toFixed(1)}%`, w * 0.05, h * 0.92, w * 0.9);
    }
    if (Math.sin(t * 4) > 0) {
      ctx.fillStyle = "#ff3424";
      ctx.beginPath();
      ctx.arc(w * 0.94, h * 0.12, h * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  private landmarkScreens(p: Record<string, THREE.Vector3>) {
    const has = (...k: string[]) => k.every((x) => p[x]);
    if (has("scrMainA", "scrMainB")) this.screen(p.scrMainA, p.scrMainB, 768, this.programme([this.walkAd, this.faceAd, ADS[0], this.chainAd, MARKET_ADS[0], ADS[2], this.faceAd, ADS[3]], 8), 15);
    if (has("scrSideA", "scrSideB")) this.screen(p.scrSideA, p.scrSideB, 512, this.programme([this.chainAd, ADS[6], MARKET_ADS[1], this.walkAd, ADS[5], MARKET_ADS[2]], 9, 2), 12);
    if (has("tickA", "tickB")) this.screen(p.tickA, p.tickB, 1536, (ctx, w, h, t) => TICKER(ctx, w, h, t, this.live), 20);
    if (has("tickSA", "tickSB")) this.screen(p.tickSA, p.tickSB, 1024, (ctx, w, h, t) => TICKER(ctx, w, h, t + 7, this.live), 20);
    if (has("roofA", "roofB")) this.screen(p.roofA, p.roofB, 512, this.programme([ADS[3], ADS[1], ADS[4], MARKET_ADS[0]], 10, 1), 10);
    // the 109's pylon: printed, lit from inside
    if (has("p109EA", "p109EB", "p109SA", "p109SB")) {
      const tex = pylonTexture();
      for (const [A, B] of [
        [p.p109EA, p.p109EB],
        [p.p109SA, p.p109SB],
      ]) {
        const d = new THREE.Vector3(B.x - A.x, 0, B.z - A.z);
        const w = d.length(),
          h = B.y - A.y;
        d.normalize();
        const n = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0));
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
        m.position.set((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2).addScaledVector(n, 0.03);
        m.rotation.y = Math.atan2(n.x, n.z);
        this.group.add(m);
      }
    }
  }

  /** Screens on the roofs and facades of the other three corners, turned to the crossing. */
  private neighbourScreens() {
    const F = this.city.facades;
    const find = (face: string, cx: number, z: number) => F.find((f) => f.face === face && Math.abs((f.x0 + f.x1) / 2 - cx) < 3 && Math.abs(f.z - z) < 2.5);
    const J = new THREE.Vector3(SCRAMBLE.x, 0, SCRAMBLE.z);
    const frameM = new THREE.MeshStandardMaterial({ color: "#26242c", roughness: 0.6, metalness: 0.4 });
    /** A rooftop screen on legs, centred at (x, z) on a roof at `roof`, facing the crossing. */
    const rooftop = (x: number, z: number, roof: number, w: number, h: number, draw: Screen["draw"]) => {
      const n = new THREE.Vector3(J.x - x, 0, J.z - z).normalize();
      const d = new THREE.Vector3(n.z, 0, -n.x);
      const y0 = roof + 1.2;
      const A = new THREE.Vector3(x, y0, z).addScaledVector(d, -w / 2),
        B = new THREE.Vector3(x, y0 + h, z).addScaledVector(d, w / 2);
      this.screen(A, B, 512, draw, 10, true);
      for (const s of [-0.38, 0.38]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.4 + h * 0.6, 0.22), frameM);
        leg.position.set(x, roof + (1.4 + h * 0.6) / 2, z).addScaledVector(d, s * w).addScaledVector(n, -0.5);
        this.group.add(leg);
      }
    };
    const ne = find("s", -44, this.Z0 - 2.6);
    if (ne) rooftop((ne.x0 + ne.x1) / 2, ne.z - 3, ne.height + CURB, 7, 4, this.programme([MARKET_ADS[0], ADS[5], this.walkAd, ADS[6]], 9, 3));
    const sw = find("n", -67.8, this.Z1 + 2.6);
    if (sw) rooftop((sw.x0 + sw.x1) / 2, sw.z + 3, sw.height + CURB, 8, 4.5, this.programme([ADS[2], this.chainAd, ADS[0], this.faceAd], 9, 1));
    const se = find("n", -43.9, this.Z1 + 2.6);
    if (se) rooftop((se.x0 + se.x1) / 2, se.z + 3, se.height + CURB, 9, 5, this.programme([this.faceAd, MARKET_ADS[1], ADS[3], this.chainAd], 10, 2));
    // a facade screen on the office east of the corner, over the boulevard
    const off = find("n", -35.1, this.Z1 + 2.6);
    if (off && off.height > 20) {
      const z = off.z - 0.35;
      this.screen(new THREE.Vector3(off.x1 - 0.6, 11, z), new THREE.Vector3(off.x0 + 0.6, 19.5, z), 384, this.programme([ADS[4], this.chainAd, ADS[6]], 8), 10, true);
    }
  }

  // ---- talk -------------------------------------------------------------------------------------------

  private talk() {
    const free = this.anchors.find((a) => a.who < 0);
    if (!free) return;
    const i = Math.floor(Math.random() * this.walkers.length);
    const w = this.walkers[i];
    if (this.anchors.some((a) => a.who === i)) return;
    const recent = this.t - this.blockAt < 10;
    const list = recent && Math.random() < 0.6 ? LINES.block : w.state === 2 ? LINES.cafe : w.state === 1 && w.delay <= 0 ? LINES.cross : LINES.wait;
    let line = list[Math.floor(Math.random() * list.length)];
    if (line === "Shibuya at night!" && !this.night) line = "Shibuya!";
    free.who = i;
    free.until = this.t + 2.6;
    free.o.position.set(w.x, w.y, w.z);
    sayAt(free.o, line, recent && list === LINES.block ? "shout" : "talk", 36 * PX, 2.6, 0.5);
  }

  // ---- public ---------------------------------------------------------------------------------------

  /** Rain: umbrellas open over two thirds of the crowd. */
  setRain(on: boolean) {
    this.rain = on;
  }

  setNight(night: boolean) {
    this.night = night;
  }

  /** A block landed: every screen flashes it, the crowd shouts about it. */
  block(height: number) {
    this.blockHeight = height;
    this.blockAt = this.t;
    for (let i = 0; i < 3; i++) setTimeout(() => this.talk(), i * 500);
  }

  setLive(d: Partial<LiveData>) {
    Object.assign(this.live, d);
  }

  /** `focus`: where the camera looks; far away, the crossing idles (no redraws, no crowd). */
  update(dt: number, t: number, focus?: THREE.Vector3) {
    this.t = t;
    dt = Math.min(dt, 0.1);
    const D = this.opts.director;
    if (D) {
      if (D.blockHeight && D.blockHeight !== this.live.height) {
        if (this.live.height) this.block(D.blockHeight);
        this.live.height = D.blockHeight;
      }
      this.live.mempool = D.mempoolList().length;
      if (D.lastBlockTime) this.live.since = (Date.now() - D.lastBlockTime) / 1000;
    }
    const dist = focus ? Math.hypot(focus.x - SCRAMBLE.x, focus.z - SCRAMBLE.z) : 0;
    this.near = dist < 230;
    // the signals: red, green, green flashing
    const sc = this.traffic.scramble();
    const frame = sc.walk ? (sc.flash && Math.floor(t * 3) % 2 ? 2 : 1) : 0;
    this.signalTex.offset.x = frame / 3;
    // the crowd keeps walking even out of sight (it must be where it should when you come back)
    this.stepCrowd(dt);
    const show = this.near && !!this.faces;
    if (this.crowd) this.crowd.visible = show;
    if (this.shadows) this.shadows.visible = show;
    if (this.umbrellas) this.umbrellas.visible = show && this.rain;
    if (show) this.writeInstances();
    // speech: now and then, when the camera is close
    for (const a of this.anchors) {
      if (a.who < 0) continue;
      const w = this.walkers[a.who];
      a.o.position.set(w.x, w.y, w.z);
      if (t > a.until) a.who = -1;
    }
    if (dist < 120) {
      this.talkIn -= dt;
      if (this.talkIn <= 0) {
        this.talkIn = 0.9 + Math.random() * 1.8;
        this.talk();
      }
    }
    // screens: each on its own beat, two redraws a frame at most
    if (this.near) {
      let budget = 3;
      for (const s of this.screens) {
        if (t < s.next || budget <= 0) continue;
        s.next = t + 1 / s.hz;
        budget--;
        s.draw(s.ctx, s.ctx.canvas.width, s.ctx.canvas.height, t);
        s.tex.needsUpdate = true;
      }
    }
  }
}
