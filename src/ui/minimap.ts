import * as THREE from "three";
import { CITY, PARK, GRID } from "../scene/city/plan";

/** Something marked on the map. Goals, secrets and the whale stay pinned to the rim when far. */
export interface Blip {
  x: number;
  z: number;
  kind: "place" | "goal" | "secret" | "whale" | "coin" | "visitor" | "agent";
  label?: string;
  /** One character on the place's tile. */
  icon?: string;
}

/** The square of the city the base map covers (metres), centred on the board. */
const SPAN = Math.max(CITY.maxX - CITY.minX, CITY.maxZ - CITY.minZ) + 16;
const CX = (CITY.minX + CITY.maxX) / 2;
const CZ = (CITY.minZ + CITY.maxZ) / 2;
const RES = 2048;
/** Metres from you to the radar's top and bottom edge. */
const RANGE = 40;
/** Where you stand on the radar (share of its height from the top): more of what's ahead shows. */
const AT_Y = 0.6;

/** Map classes the bake writes (red channel), and their colours. */
const enum K {
  Void = 0,
  Water = 1,
  Road = 2,
  Pave = 3,
  Green = 4,
  Building = 5,
}

const VERT = /* glsl */ `
#include <common>
#include <color_pars_vertex>
#include <batching_pars_vertex>
varying float vY;
varying vec2 vXZ;
void main() {
  #include <color_vertex>
  #include <batching_vertex>
  vec4 p = vec4(position, 1.0);
  #ifdef USE_BATCHING
  p = batchingMatrix * p;
  #endif
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  vec4 w = modelMatrix * p;
  vY = w.y;
  vXZ = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// the radar's palette: water, road, pavement, green, and buildings lighter the taller they are
const FRAG = /* glsl */ `
#include <color_pars_fragment>
uniform vec4 uPark;
uniform vec4 uLake;
varying float vY;
varying vec2 vXZ;
void main() {
  #ifdef USE_COLOR
  vec3 k = vColor.rgb;
  #else
  vec3 k = vec3(0.0);
  #endif
  bool green = k.g > 0.06 && k.g > k.r * 1.15 && k.g > k.b * 1.05;
  // Central Park's lawn and its lake (their materials carry no green of their own)
  bool park = vXZ.x > uPark.x && vXZ.x < uPark.y && vXZ.y > uPark.z && vXZ.y < uPark.w && vY < 0.9;
  vec2 lk = (vXZ - uLake.xy) / uLake.zw;
  if (park && dot(lk, lk) < 1.0) { gl_FragColor = vec4(1.0 / 255.0, 0.0, 0.0, 1.0); return; }
  green = green || park;
  float cls;
  if (vY < -0.45) cls = 1.0;
  else if (green) cls = 4.0;
  else if (vY < 0.1) cls = 2.0;
  else if (vY < 0.9) cls = 3.0;
  else cls = 5.0;
  gl_FragColor = vec4(cls / 255.0, clamp(vY / 80.0, 0.0, 1.0), 0.0, 1.0);
}`;

/** The city seen straight down once, coloured by height: the radar's background. */
function bake(renderer: THREE.WebGLRenderer, scene: THREE.Scene): HTMLCanvasElement {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    uniforms: {
      uPark: { value: new THREE.Vector4(GRID.park.x0, GRID.park.x1, GRID.park.z0, GRID.park.z1) },
      uLake: { value: new THREE.Vector4(PARK.lake.x, PARK.lake.z, PARK.lake.rx, PARK.lake.rz) },
    },
  });
  const cam = new THREE.OrthographicCamera(-SPAN / 2, SPAN / 2, SPAN / 2, -SPAN / 2, 1, 310);
  cam.position.set(CX, 300, CZ);
  // north (−z) at the top of the picture, east (+x) on the right
  cam.up.set(0, 0, -1);
  cam.lookAt(CX, 0, CZ);
  cam.updateMatrixWorld();
  // only solid things: no sprites, particles, glass, glows, crowds drawn by their own shaders, or sky
  const hidden: THREE.Object3D[] = [];
  scene.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    const skip =
      (o as THREE.Sprite).isSprite ||
      (o as THREE.Points).isPoints ||
      (o as THREE.Line).isLine ||
      (m.isMesh && ((m.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry || mats.some((x) => x.transparent || x.side === THREE.BackSide)));
    if (skip) hidden.push(o);
  });
  for (const o of hidden) o.visible = false;
  const rt = new THREE.WebGLRenderTarget(RES, RES, { depthBuffer: true });
  const prev = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), shadows: renderer.shadowMap.autoUpdate, bg: scene.background, fog: scene.fog, over: scene.overrideMaterial };
  const px = new Uint8Array(RES * RES * 4);
  try {
    renderer.shadowMap.autoUpdate = false;
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = mat;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, RES, RES, px);
  } finally {
    scene.overrideMaterial = prev.over;
    scene.background = prev.bg;
    scene.fog = prev.fog;
    renderer.shadowMap.autoUpdate = prev.shadows;
    renderer.setRenderTarget(prev.target);
    renderer.setClearColor(prev.color, prev.alpha);
    for (const o of hidden) o.visible = true;
    rt.dispose();
    mat.dispose();
  }
  return paint(px);
}

/**
 * The radar's look, from the classes: light roads on dark blocks, buildings outlined and lighter
 * the taller they are, parks green, water blue. Specks (lamp posts, cars, signs) are opened away.
 */
function paint(px: Uint8Array): HTMLCanvasElement {
  const N = RES * RES;
  const cls = new Uint8Array(N),
    hgt = new Uint8Array(N);
  // the render target's rows run bottom to top
  for (let y = 0; y < RES; y++) {
    const src = (RES - 1 - y) * RES;
    for (let x = 0; x < RES; x++) {
      cls[y * RES + x] = px[(src + x) * 4];
      hgt[y * RES + x] = px[(src + x) * 4 + 1];
    }
  }
  // opening of the building mask (erode then dilate, 2 px): poles and cars vanish, blocks stay
  const isB = (i: number) => cls[i] === K.Building;
  const er = new Uint8Array(N);
  for (let y = 2; y < RES - 2; y++)
    for (let x = 2; x < RES - 2; x++) {
      const i = y * RES + x;
      er[i] = +(isB(i) && isB(i - 2) && isB(i + 2) && isB(i - 2 * RES) && isB(i + 2 * RES) && isB(i - 1 - RES) && isB(i + 1 + RES));
    }
  const keep = new Uint8Array(N);
  for (let y = 2; y < RES - 2; y++)
    for (let x = 2; x < RES - 2; x++) {
      const i = y * RES + x;
      if (!isB(i)) continue;
      keep[i] = +(er[i] || er[i - 1] || er[i + 1] || er[i - RES] || er[i + RES] || er[i - 2] || er[i + 2] || er[i - 2 * RES] || er[i + 2 * RES] || er[i - 1 - RES] || er[i + 1 + RES] || er[i + 1 - RES] || er[i - 1 + RES]);
    }
  // what a removed speck stood on: the pavement, unless it was on the road
  for (let i = 0; i < N; i++) if (isB(i) && !keep[i]) cls[i] = K.Pave;
  const c = document.createElement("canvas");
  c.width = c.height = RES;
  const g = c.getContext("2d")!;
  const img = g.createImageData(RES, RES);
  const d = img.data;
  const COL: Record<number, [number, number, number]> = {
    [K.Void]: [14, 16, 22],
    [K.Water]: [30, 78, 118],
    [K.Road]: [112, 118, 132],
    [K.Pave]: [40, 43, 53],
    [K.Green]: [42, 82, 54],
  };
  for (let y = 0; y < RES; y++)
    for (let x = 0; x < RES; x++) {
      const i = y * RES + x;
      const k = cls[i];
      let r: number, gg: number, b: number;
      if (k === K.Building) {
        const edge = x === 0 || y === 0 || x === RES - 1 || y === RES - 1 || cls[i - 1] !== K.Building || cls[i + 1] !== K.Building || cls[i - RES] !== K.Building || cls[i + RES] !== K.Building;
        if (edge) [r, gg, b] = [150, 158, 178];
        else {
          const t = Math.sqrt(hgt[i] / 255);
          r = 54 + t * 40;
          gg = 58 + t * 42;
          b = 72 + t * 48;
        }
      } else [r, gg, b] = COL[k] ?? COL[K.Void];
      d[i * 4] = r;
      d[i * 4 + 1] = gg;
      d[i * 4 + 2] = b;
      d[i * 4 + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

const COLOR: Record<Blip["kind"], string> = {
  place: "#f4b728",
  goal: "#f4b728",
  secret: "#fff3c4",
  whale: "#c58cff",
  coin: "#f4b728",
  visitor: "#ff7aa8",
  agent: "#5fd7ff",
};

/**
 * On foot, the radar in the corner (as in GTA): the city round you turning with you, your arrow in
 * the middle, the places' doors, the job's goal, secrets, the whale, the other visitors and the
 * city's agents. M opens the whole map, north up.
 */
export class Minimap {
  private el: HTMLElement;
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private bigEl: HTMLElement;
  private bigCv: HTMLCanvasElement;
  private base: HTMLCanvasElement | null = null;
  private acc = 0;
  private on = false;
  big = false;

  constructor(
    root: HTMLElement,
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
  ) {
    this.el = document.createElement("div");
    this.el.className = "minimap hud";
    this.el.innerHTML = `<canvas></canvas><b class="mm-n">N</b>`;
    this.el.title = "Map (M)";
    this.cv = this.el.querySelector("canvas")!;
    this.g = this.cv.getContext("2d")!;
    root.append(this.el);
    this.bigEl = document.createElement("div");
    this.bigEl.className = "bigmap hud";
    this.bigEl.innerHTML = `<header><label>地図 · MAP</label><span>${matchMedia("(pointer: coarse)").matches ? "tap to close" : "M or click to close"}</span></header><canvas></canvas>`;
    this.bigCv = this.bigEl.querySelector("canvas")!;
    root.append(this.bigEl);
    this.el.addEventListener("click", () => this.toggle());
    this.bigEl.addEventListener("click", () => this.toggle(false));
    window.addEventListener("keydown", (e) => {
      if (!this.on || e.code !== "KeyM" || (e.target as HTMLElement).closest?.("input,textarea")) return;
      this.toggle();
    });
  }

  toggle(big = !this.big) {
    this.big = big && this.on;
    this.bigEl.classList.toggle("on", this.big);
  }

  /** Shown on foot in the street only. The base map is drawn the first time. */
  show(on: boolean) {
    if (on && !this.base) this.base = bake(this.renderer, this.scene);
    this.on = on;
    this.el.classList.toggle("on", on);
    if (!on) this.toggle(false);
  }

  /** Throw the base map away (the city changed: a plot was built). */
  stale() {
    this.base = null;
    if (this.on) this.base = bake(this.renderer, this.scene);
  }

  update(dt: number, x: number, z: number, heading: number, blips: Blip[]) {
    if (!this.on || !this.base) return;
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    this.radar(x, z, heading, blips);
    if (this.big) this.whole(x, z, heading, blips);
  }

  private fit(cv: HTMLCanvasElement) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr),
      h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) (cv.width = w), (cv.height = h);
    return dpr;
  }

  private radar(x: number, z: number, h: number, blips: Blip[]) {
    const cv = this.cv,
      g = this.g;
    const dpr = this.fit(cv);
    const W = cv.width,
      H = cv.height;
    const cx = W / 2,
      cy = H * AT_Y;
    const k = H / 2 / RANGE;
    const rr = 10 * dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath();
    g.roundRect(0, 0, W, H, rr);
    g.clip();
    g.fillStyle = "#0e1016";
    g.fillRect(0, 0, W, H);
    // the map turns so that ahead is up
    g.save();
    g.translate(cx, cy);
    g.rotate(h);
    g.scale(k, k);
    g.translate(-x, -z);
    const m = Math.hypot(W, H) / k;
    const s = RES / SPAN;
    const x0 = CX - SPAN / 2,
      z0 = CZ - SPAN / 2;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(this.base!, (x - m - x0) * s, (z - m - z0) * s, 2 * m * s, 2 * m * s, x - m, z - m, 2 * m, 2 * m);
    g.restore();
    // what you're looking at: a soft cone ahead
    const cone = g.createRadialGradient(cx, cy, 0, cx, cy, H * 0.55);
    cone.addColorStop(0, "rgba(255,255,255,0.22)");
    cone.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = cone;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, H * 0.55, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6);
    g.closePath();
    g.fill();
    // a light vignette so the edge reads
    const vg = g.createRadialGradient(cx, H / 2, Math.min(W, H) * 0.35, cx, H / 2, Math.max(W, H) * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    // what's round you
    const cos = Math.cos(h),
      sin = Math.sin(h);
    const pad = 11 * dpr;
    /** Pull a point (relative to you) back inside the frame. */
    const clamp = (rx: number, ry: number) => {
      const lim = Math.min(rx > 0 ? (W - cx - pad) / rx : rx < 0 ? (pad - cx) / rx : Infinity, ry > 0 ? (H - cy - pad) / ry : ry < 0 ? (pad - cy) / ry : Infinity);
      return lim < 1 ? [rx * lim, ry * lim, true] as const : [rx, ry, false] as const;
    };
    const order: Blip["kind"][] = ["agent", "visitor", "coin", "place", "whale", "secret", "goal"];
    for (const kind of order)
      for (const b of blips) {
        if (b.kind !== kind) continue;
        const dx = b.x - x,
          dz = b.z - z;
        const [rx, ry, out] = clamp((dx * cos - dz * sin) * k, (dx * sin + dz * cos) * k);
        const pinned = kind === "goal" || kind === "secret" || kind === "whale";
        if (out && !pinned) continue;
        this.blip(g, cx + rx, cy + ry, b, dpr);
      }
    // you
    this.arrow(g, cx, cy, 0, dpr);
    g.restore();
    // the frame
    g.beginPath();
    g.roundRect(dpr, dpr, W - 2 * dpr, H - 2 * dpr, rr);
    g.strokeStyle = "rgba(244,183,40,0.6)";
    g.lineWidth = 1.5 * dpr;
    g.stroke();
    // north, on the frame
    const [nx, ny] = clamp(sin * 1e4, -cos * 1e4);
    const n = this.el.querySelector<HTMLElement>(".mm-n")!;
    n.style.transform = `translate(${(cx + nx) / dpr}px, ${(cy + ny) / dpr}px) translate(-50%, -50%)`;
  }

  private blip(g: CanvasRenderingContext2D, x: number, y: number, b: Blip, dpr: number) {
    const c = COLOR[b.kind];
    g.save();
    g.translate(x, y);
    if (b.kind === "agent" || b.kind === "visitor") {
      g.beginPath();
      g.arc(0, 0, (b.kind === "visitor" ? 3.2 : 2.4) * dpr, 0, Math.PI * 2);
      g.fillStyle = c;
      g.fill();
      g.strokeStyle = "rgba(10,10,16,0.8)";
      g.lineWidth = dpr;
      g.stroke();
    } else if (b.kind === "coin") {
      g.beginPath();
      g.arc(0, 0, 3.4 * dpr, 0, Math.PI * 2);
      g.fillStyle = c;
      g.fill();
      g.strokeStyle = "#5a3d00";
      g.lineWidth = dpr;
      g.stroke();
    } else if (b.kind === "place") {
      // a round badge with the place's kanji, like a GTA blip
      const r = 7.5 * dpr;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fillStyle = "rgba(12,12,18,0.92)";
      g.fill();
      g.strokeStyle = c;
      g.lineWidth = 1.4 * dpr;
      g.stroke();
      g.fillStyle = c;
      g.font = `${10 * dpr}px DotGothic16, monospace`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(b.icon ?? (b.label ?? "?").charAt(0), 0, dpr * 0.6);
    } else {
      // goals: a gold disc with a dark ring and a pulse; secrets and the whale in their colour
      const r = (b.kind === "goal" ? 6 : 5) * dpr;
      const pulse = (performance.now() / 900) % 1;
      g.beginPath();
      g.arc(0, 0, r + pulse * 7 * dpr, 0, Math.PI * 2);
      g.strokeStyle = `${c}${Math.round((1 - pulse) * 160).toString(16).padStart(2, "0")}`;
      g.lineWidth = 1.5 * dpr;
      g.stroke();
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fillStyle = c;
      g.fill();
      g.strokeStyle = "#0b0b11";
      g.lineWidth = 1.5 * dpr;
      g.stroke();
    }
    g.restore();
  }

  private arrow(g: CanvasRenderingContext2D, x: number, y: number, rot: number, dpr: number) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    const s = dpr * 1.1;
    g.beginPath();
    g.moveTo(0, -8 * s);
    g.lineTo(6 * s, 6.5 * s);
    g.lineTo(0, 3.2 * s);
    g.lineTo(-6 * s, 6.5 * s);
    g.closePath();
    g.shadowColor = "rgba(0,0,0,0.6)";
    g.shadowBlur = 4 * dpr;
    g.fillStyle = "#ffffff";
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = "#0b0b11";
    g.lineWidth = 1.5 * dpr;
    g.stroke();
    g.restore();
  }

  /** The whole city, north up, with the places named. */
  private whole(x: number, z: number, h: number, blips: Blip[]) {
    const cv = this.bigCv;
    const dpr = this.fit(cv);
    const g = cv.getContext("2d")!;
    const D = Math.min(cv.width, cv.height);
    const k = D / SPAN;
    const ox = (cv.width - D) / 2,
      oy = (cv.height - D) / 2;
    const at = (wx: number, wz: number) => [ox + (wx - (CX - SPAN / 2)) * k, oy + (wz - (CZ - SPAN / 2)) * k] as const;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#0b0b11";
    g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.base!, ox, oy, D, D);
    const labels: [number, number, string][] = [];
    for (const b of blips) {
      const [bx, by] = at(b.x, b.z);
      this.blip(g, bx, by, b, dpr);
      if (b.kind === "place" && b.label) labels.push([bx, by, b.label]);
    }
    g.font = `${10 * dpr}px DotGothic16, monospace`;
    g.textAlign = "center";
    g.textBaseline = "top";
    for (const [bx, by, l] of labels) {
      g.lineWidth = 3 * dpr;
      g.strokeStyle = "rgba(11,11,17,0.9)";
      g.strokeText(l, bx, by + 8 * dpr);
      g.fillStyle = "#f4e6c0";
      g.fillText(l, bx, by + 8 * dpr);
    }
    const [px, py] = at(x, z);
    this.arrow(g, px, py, -h, dpr * 1.3);
  }
}
