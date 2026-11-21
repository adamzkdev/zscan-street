import * as THREE from "three";
import { portraitImage } from "../data/portrait";
import { get, ZScan } from "../data/zscan";

/**
 * THE 676 — a drone show over the bay. 676 drones, one for every zkSNARK purged for the
 * Apparitions, and one for every pixel of a zkSNARK (26 × 26). They lift off a grid on the water,
 * spell 676, become the Apparitions one after another (each drone a pixel), the last zkSNARK sold on
 * Zilk Road, FedosArt's #9593, a spinning Zcash coin, ZSTREET, burst into a sphere and come home.
 *
 * The show runs on a clock shared by everyone (`t` = seconds since the scheduled start, see
 * src/game/droneshow.ts), so every visitor sees the same formation at the same moment.
 */

export const N = 676;
const G = 26;

/** A formation: where each drone is (in the show's frame, metres) and its colour (linear, HDR). */
interface Formation {
  pos: Float32Array;
  col: Float32Array;
  /** How big each drone's light looks (metres across): pixels nearly touch, lettering is finer. */
  size: Float32Array;
}
/** One act of the show. */
interface Act {
  name: string;
  /** Seconds it holds once formed (the morph into it takes MORPH). */
  hold: number;
  f: () => Formation;
  /** A slow turn of the whole formation while it holds (radians a second, yaw). */
  spin?: number;
  /** The formation sways (3D) instead of facing the city flat. */
  sway?: boolean;
}

const MORPH = 3.2;
/** Spacing of the pixel grid (m) and the formation's centre height over the water. */
const S = 3.6;
export const SHOW_HEIGHT = 54;

const hex = (c: string) => new THREE.Color(c);

/** A zkSNARK's 26 × 26 pixels (sRGB strings, "" for the black background). */
export type Pixels = string[];

function blank(size = 1.8): Formation {
  return { pos: new Float32Array(N * 3), col: new Float32Array(N * 3), size: new Float32Array(N).fill(size) };
}

/** The pixel grid: drone i is cell i (row-major); lit cells glow in their colour, dark ones go dark behind. */
function pixelArt(px: Pixels, boost = 1.35): Formation {
  const f = blank(S * 0.85);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const col = i % G,
      row = Math.floor(i / G);
    const lit = !!px[i];
    f.pos[i * 3] = (col - (G - 1) / 2) * S;
    f.pos[i * 3 + 1] = ((G - 1) / 2 - row) * S;
    f.pos[i * 3 + 2] = lit ? 0 : -14;
    if (!lit) f.size[i] = 0;
    if (lit) {
      c.set(px[i]);
      // the darkest pixels (a trail, a body) keep their own hue, just lit enough to be seen
      const m = Math.max(c.r, c.g, c.b);
      if (m < 0.09) c.multiplyScalar(0.09 / Math.max(m, 0.004));
      f.col[i * 3] = c.r * boost;
      f.col[i * 3 + 1] = c.g * boost;
      f.col[i * 3 + 2] = c.b * boost;
    }
  }
  return f;
}

/** Points sampled from a canvas drawing (text, a logo), sorted top-left to bottom-right; spare drones go dark. */
function drawing(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, widthM: number, color: THREE.Color, depth = 0): Formation {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  draw(g, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  // the step that gives just under N points
  let pts: [number, number][] = [];
  for (let step = 1; step < 40; step++) {
    pts = [];
    for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) if (d[(Math.floor(y) * w + Math.floor(x)) * 4] > 128) pts.push([x, y]);
    if (pts.length <= N) break;
  }
  const f = blank();
  const k = widthM / w;
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    if (p) {
      f.pos[i * 3] = (p[0] - w / 2) * k;
      f.pos[i * 3 + 1] = (h / 2 - p[1]) * k;
      f.pos[i * 3 + 2] = depth * Math.sin(p[0] * 0.05);
      f.col[i * 3] = color.r;
      f.col[i * 3 + 1] = color.g;
      f.col[i * 3 + 2] = color.b;
    } else {
      // spare drones: parked dark above the formation
      f.pos[i * 3] = ((i % 30) - 15) * 3;
      f.pos[i * 3 + 1] = 70 + Math.floor(i / 30) * 0.5;
      f.pos[i * 3 + 2] = -20;
    }
  }
  return f;
}

const FONT = '"Geist", "Helvetica Neue", Arial, sans-serif';
function text(s: string, color: THREE.Color, widthM = 110) {
  return drawing(
    (g, w, h) => {
      g.font = `800 ${Math.round(h * 0.78)}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(s, w / 2, h * 0.54);
    },
    s.length > 4 ? 420 : 300,
    120,
    widthM,
    color,
  );
}

/** The Zcash mark: a ring and the Z with its two bars, as a coin. */
function zcashCoin() {
  return drawing(
    (g, w, h) => {
      const m = w / 2,
        r = w * 0.44;
      g.lineWidth = w * 0.06;
      g.beginPath();
      g.arc(m, h / 2, r, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = w * 0.075;
      g.lineJoin = "miter";
      g.beginPath();
      g.moveTo(m - r * 0.42, h / 2 - r * 0.42);
      g.lineTo(m + r * 0.42, h / 2 - r * 0.42);
      g.lineTo(m - r * 0.42, h / 2 + r * 0.42);
      g.lineTo(m + r * 0.42, h / 2 + r * 0.42);
      g.stroke();
      g.fillRect(m - w * 0.035, h / 2 - r * 0.72, w * 0.07, r * 0.3);
      g.fillRect(m - w * 0.035, h / 2 + r * 0.42, w * 0.07, r * 0.3);
    },
    200,
    200,
    88,
    hex("#f4b728").multiplyScalar(2.2),
  );
}

/** A sphere of drones (Fibonacci), white-violet. */
function sphere(r = 42): Formation {
  const f = blank();
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2,
      rr = Math.sqrt(1 - y * y),
      a = i * 2.39996;
    f.pos[i * 3] = Math.cos(a) * rr * r;
    f.pos[i * 3 + 1] = y * r;
    f.pos[i * 3 + 2] = Math.sin(a) * rr * r;
    const c = i % 9 === 0 ? hex("#f4b728").multiplyScalar(2) : hex("#c8bcff").multiplyScalar(1.8);
    f.col[i * 3] = c.r;
    f.col[i * 3 + 1] = c.g;
    f.col[i * 3 + 2] = c.b;
  }
  return f;
}

/** On the water: a flat grid on the launch barges, dim. */
function launchPad(): Formation {
  const f = blank(1.2);
  for (let i = 0; i < N; i++) {
    f.pos[i * 3] = ((i % G) - (G - 1) / 2) * 2.2;
    f.pos[i * 3 + 1] = -SHOW_HEIGHT + 1.2;
    f.pos[i * 3 + 2] = (Math.floor(i / G) - (G - 1) / 2) * 2.2;
    f.col[i * 3] = 0.25;
    f.col[i * 3 + 1] = 0.22;
    f.col[i * 3 + 2] = 0.35;
  }
  return f;
}
/** The curtain: the grid standing up, white, twinkling (set by the shader). */
function curtain(): Formation {
  const f = blank();
  for (let i = 0; i < N; i++) {
    f.pos[i * 3] = ((i % G) - (G - 1) / 2) * S;
    f.pos[i * 3 + 1] = ((G - 1) / 2 - Math.floor(i / G)) * S;
    f.col[i * 3] = f.col[i * 3 + 1] = f.col[i * 3 + 2] = 1.3;
  }
  return f;
}

/** The pixels of a zkSNARK (26 × 26), read from its picture. */
export async function snarkPixels(id: number): Promise<Pixels | null> {
  const img = await portraitImage(ZScan.zkSnarkImage(id)).catch(() => null);
  if (!img) return null;
  const c = document.createElement("canvas");
  c.width = c.height = G;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, G, G);
  const d = g.getImageData(0, 0, G, G).data;
  // the background: the commonest colour round the border (black, or an Apparition's pale ground)
  const counts = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const x = i % G,
      y = Math.floor(i / G);
    if (x > 0 && y > 0 && x < G - 1 && y < G - 1) continue;
    const key = `${d[i * 4] >> 3},${d[i * 4 + 1] >> 3},${d[i * 4 + 2] >> 3}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const bg = [...counts]
    .sort((a, b) => b[1] - a[1])[0]?.[0]
    .split(",")
    .map((v) => Number(v) * 8 + 4) ?? [0, 0, 0];
  const out: Pixels = [];
  for (let i = 0; i < N; i++) {
    const r = d[i * 4],
      gg = d[i * 4 + 1],
      b = d[i * 4 + 2],
      a = d[i * 4 + 3];
    const nearBg = Math.abs(r - bg[0]) + Math.abs(gg - bg[1]) + Math.abs(b - bg[2]) < 54;
    out.push(a < 40 || r + gg + b < 24 || nearBg ? "" : `rgb(${r},${gg},${b})`);
  }
  return out;
}

/** What the show needs from the API: the Apparitions, the last sale. */
export interface ShowData {
  apparitions: { id: number; name: string; px: Pixels }[];
  lastSold: { id: number; price: number; px: Pixels } | null;
  fedos: Pixels | null;
}

export async function loadShowData(): Promise<ShowData> {
  const [ap, coll] = await Promise.all([
    get<{ apparitions: { item: string; name: string; slot: number }[] }>("/v1/collections/zksnarks/apparitions"),
    get<{ venue_sales?: { item_id: string; price: number }[] }>("/v1/collections/zksnarks?tab=sales"),
  ]);
  // four Apparitions, a different set every day
  const list = ap?.apparitions ?? [];
  const day = Math.floor(Date.now() / 86_400_000);
  const pick = list.length ? [0, 1, 2, 3].map((k) => list[(day * 4 + k * 7) % list.length]) : [];
  const apparitions = (await Promise.all(pick.map(async (a) => ({ id: Number(a.item), name: a.name, px: await snarkPixels(Number(a.item)) })))).filter(
    (a): a is { id: number; name: string; px: Pixels } => !!a.px,
  );
  const sale = coll?.venue_sales?.[0];
  const lastPx = sale ? await snarkPixels(Number(sale.item_id)) : null;
  return {
    apparitions,
    lastSold: sale && lastPx ? { id: Number(sale.item_id), price: sale.price, px: lastPx } : null,
    fedos: await snarkPixels(9593),
  };
}

/** The programme, given the data (acts missing their data are skipped). */
function programme(d: ShowData): Act[] {
  const acts: Act[] = [
    { name: "curtain", hold: 4, f: curtain },
    { name: "676", hold: 6, f: () => text("676", hex("#f4b728").multiplyScalar(2.4), 96) },
  ];
  for (const a of d.apparitions) acts.push({ name: a.name, hold: 7, f: () => pixelArt(a.px), sway: true });
  if (d.lastSold) {
    const ls = d.lastSold;
    acts.push({ name: `Sold · #${ls.id}`, hold: 7, f: () => pixelArt(ls.px), sway: true });
  }
  if (d.fedos) {
    const px = d.fedos;
    acts.push({ name: "FedosArt · #9593", hold: 6, f: () => pixelArt(px), sway: true });
  }
  acts.push({ name: "Zcash", hold: 8, f: zcashCoin, spin: 0.9 });
  acts.push({ name: "ZSTREET", hold: 6, f: () => text("ZSTREET", hex("#f4b728").multiplyScalar(2.2), 150) });
  acts.push({ name: "sphere", hold: 7, f: () => sphere(), spin: 0.6 });
  return acts;
}

const VERT = /* glsl */ `
attribute vec3 color;
attribute float seed;
attribute float size;
uniform float uTime;
uniform float uViewH;
uniform float uSize;
varying vec3 vColor;
varying float vTw;
void main() {
  vColor = color;
  vTw = 0.82 + 0.18 * sin(uTime * (3.0 + seed * 5.0) + seed * 40.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // a light uSize metres across, in pixels, for the city's orthographic map camera and for perspective ones
  float persp = projectionMatrix[2][3] < -0.5 ? 1.0 : 0.0;
  gl_PointSize = clamp(size * uSize * projectionMatrix[1][1] * uViewH * 0.5 / mix(1.0, max(-mv.z, 1.0), persp), size > 0.01 ? 1.5 : 0.0, 64.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vTw;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  // a full round light with a soft edge: big pixels nearly touch and read as one picture
  float core = smoothstep(0.47, 0.3, d);
  float halo = smoothstep(0.5, 0.2, d) * 0.25;
  float a = core + halo;
  if (a < 0.01 || dot(vColor, vec3(1.0)) < 0.02) discard;
  gl_FragColor = vec4(vColor * vTw * (core + halo), a);
}`;

/** The show's drones over the water at `origin` (the formation faces `yaw`). */
export class DroneShow {
  readonly group = new THREE.Group();
  private points: THREE.Points;
  private pos = new Float32Array(N * 3);
  private col = new Float32Array(N * 3);
  private size = new Float32Array(N);
  private mat: THREE.ShaderMaterial;
  private acts: Act[] = [];
  private forms: Formation[] = [];
  /** When each act starts forming (s since the show began), and the show's length. */
  private starts: number[] = [];
  length = 0;
  /** The act now (for the HUD and the films). */
  act = "";
  private pad = launchPad();
  private landing = launchPad();

  constructor(origin: THREE.Vector3) {
    this.group.position.copy(origin).setY(origin.y + SHOW_HEIGHT);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) seed[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uViewH: { value: 900 }, uSize: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.raycast = () => {};
    this.group.add(this.points);
    this.group.visible = false;
  }

  /** The programme from the day's data (built once, before the show). */
  prepare(d: ShowData) {
    this.acts = programme(d);
    this.forms = this.acts.map((a) => a.f());
    let t = 6; // lift-off
    this.starts = this.acts.map((a) => {
      const s = t;
      t += MORPH + a.hold;
      return s;
    });
    this.length = t + MORPH + 6; // home: back down onto the barges
  }

  get ready() {
    return this.acts.length > 0;
  }

  /** Forget the programme (the next show gets the day's data afresh). */
  reset() {
    this.acts = [];
    this.forms = [];
    this.starts = [];
    this.length = 0;
    this.group.visible = false;
  }

  /**
   * Draw the show at `t` seconds since it began (outside [0, length]: hidden). The formation turns
   * to face `eye` (whoever watches sees it the right way round); `viewH` is the drawing buffer's height.
   */
  update(t: number, viewH: number, eye: THREE.Vector3, dt = 0.016) {
    const on = this.ready && t >= 0 && t <= this.length;
    this.group.visible = on;
    if (!on) return;
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uViewH.value = viewH;
    // turn toward the viewer (round the vertical only: the launch barges stay flat on the water)
    const p = this.group.position;
    const want = Math.atan2(eye.x - p.x, eye.z - p.z);
    let d = want - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * Math.min(1, dt * 2);
    // which act we are in: from (a) to (b), k = morph progress
    let from: Formation = this.pad,
      to: Formation = this.pad,
      k = 1,
      act: Act | null = null;
    const last = this.acts.length - 1;
    if (t < this.starts[0]) {
      // lift-off: up from the barges to the curtain
      from = this.pad;
      to = this.forms[0];
      k = t / this.starts[0];
      this.act = "lift-off";
    } else if (t >= this.starts[last] + MORPH + this.acts[last].hold) {
      from = this.forms[last];
      to = this.landing;
      k = (t - (this.starts[last] + MORPH + this.acts[last].hold)) / (MORPH + 6);
      this.act = "landing";
    } else {
      let i = 0;
      while (i < last && t >= this.starts[i + 1]) i++;
      act = this.acts[i];
      from = i > 0 ? this.forms[i - 1] : this.forms[0];
      to = this.forms[i];
      k = i > 0 ? (t - this.starts[i]) / MORPH : 1;
      this.act = act.name;
    }
    const e = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
    for (let i = 0; i < N; i++) {
      // a ripple: drones near the left start first
      const delay = ((i % G) / G) * 0.35;
      const kk = e((k - delay) / (1 - 0.35));
      const j = i * 3;
      // the path arcs a little toward the viewer so drones never pass through one another
      const lift = Math.sin(kk * Math.PI) * 6 * (((i * 7) % 5) / 5 - 0.4);
      this.pos[j] = from.pos[j] + (to.pos[j] - from.pos[j]) * kk;
      this.pos[j + 1] = from.pos[j + 1] + (to.pos[j + 1] - from.pos[j + 1]) * kk;
      this.pos[j + 2] = from.pos[j + 2] + (to.pos[j + 2] - from.pos[j + 2]) * kk + lift;
      // colours cross-fade a little faster than the drones fly
      const kc = e(kk * 1.4);
      this.col[j] = from.col[j] + (to.col[j] - from.col[j]) * kc;
      this.col[j + 1] = from.col[j + 1] + (to.col[j + 1] - from.col[j + 1]) * kc;
      this.col[j + 2] = from.col[j + 2] + (to.col[j + 2] - from.col[j + 2]) * kc;
      this.size[i] = from.size[i] + (to.size[i] - from.size[i]) * kc;
    }
    // the formation turns (a coin spinning, a sphere) or sways (a portrait in 3D)
    const here = act ? t - this.starts[this.acts.indexOf(act)] : 0;
    this.points.rotation.y = act?.spin ? here * act.spin : act?.sway ? Math.sin(here * 0.6) * 0.35 : 0;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
}
