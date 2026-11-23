/**
 * ZK LEGENDS' board in 3D: one three.js scene over the whole table (its own WebGL canvas), the
 * arena from maps.ts, and on it everything the duel has: the minions as thick framed medallions
 * (faction metal, the zkSNARK's pixels in the window, a faceted attack gem and health gem, Guard's
 * stone shield behind, Halo's golden dome, Shielded's scan-line veil, Timelock's ice), the heroes in
 * gold frames, the hero powers as coins that flip, weapons, ZEC crystals, the decks, the rival's hand
 * of backs, secrets, and the END TURN plate. Everything moves by tweens; hits shake, the dead burst
 * into their own pixels as voxel cubes, spells fly as orbs with a trail, and the camera shakes on
 * the big ones. The table (ui.ts) asks for things by uid and gets screen points back (`screen`), and
 * asks what's under the pointer (`pick`).
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import { KW, card, POWERS, type Hero, type Minion, type Side, type Weapon, type Faction } from "./engine";
import { FACTION_INFO } from "./cards";
import { snarkPixels, iconCanvas } from "./art";
import { paintBack } from "./paint";
import { buildMap, TABLE, type MapHandle, type MapKind } from "./maps";
import { FRAME_SIZE, HERO_FRAME, deckEdgeTex, endPlaque, gemTex, guardTex, heroFrame, iceTex, minionFrame, powerBack, powerFace, puffTex, rimTex, smokeTex, softDot, sweepTex, weaponFace, type GemKind } from "./boardart";

export type Pick = { kind: "minion" | "hero" | "power" | "end" | "deck" | "weapon" | "toy"; uid?: number; side?: Side; toy?: number } | null;
type XY = { x: number; y: number };

const GRID = 26;
const SLOT = 1.95;
const HERO_Z: [number, number] = [4.45, -4.7];
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeIn = (k: number) => k * k * k;
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

// ---- shapes -----------------------------------------------------------------------------------------------

/** A rectangle with stepped (voxel) corners, centred. */
function stepShape(w: number, h: number, s: number): THREE.Shape {
  const x0 = -w / 2,
    y0 = -h / 2;
  const p: [number, number][] = [
    [x0 + 2 * s, y0],
    [x0 + w - 2 * s, y0],
    [x0 + w - 2 * s, y0 + s],
    [x0 + w - s, y0 + s],
    [x0 + w - s, y0 + 2 * s],
    [x0 + w, y0 + 2 * s],
    [x0 + w, y0 + h - 2 * s],
    [x0 + w - s, y0 + h - 2 * s],
    [x0 + w - s, y0 + h - s],
    [x0 + w - 2 * s, y0 + h - s],
    [x0 + w - 2 * s, y0 + h],
    [x0 + 2 * s, y0 + h],
    [x0 + 2 * s, y0 + h - s],
    [x0 + s, y0 + h - s],
    [x0 + s, y0 + h - 2 * s],
    [x0, y0 + h - 2 * s],
    [x0, y0 + 2 * s],
    [x0 + s, y0 + 2 * s],
    [x0 + s, y0 + s],
    [x0 + 2 * s, y0 + s],
  ];
  const sh = new THREE.Shape();
  sh.moveTo(p[0][0], p[0][1]);
  for (const q of p.slice(1)) sh.lineTo(q[0], q[1]);
  sh.closePath();
  return sh;
}
function shieldShape(w: number, h: number): THREE.Shape {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, h / 2);
  sh.lineTo(w / 2, h / 2);
  sh.lineTo(w / 2, -h * 0.12);
  sh.lineTo(w * 0.22, -h * 0.42);
  sh.lineTo(0, -h / 2);
  sh.lineTo(-w * 0.22, -h * 0.42);
  sh.lineTo(-w / 2, -h * 0.12);
  sh.closePath();
  return sh;
}
/** A shape lying flat (y up), `d` thick, bevelled. */
function slab(shape: THREE.Shape, d: number, bevel = 0.035): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  return g;
}

// ---- textures ------------------------------------------------------------------------------------------------

const numCache = new Map<string, THREE.CanvasTexture>();
function numTex(n: number | string, color = "#ffffff"): THREE.CanvasTexture {
  const k = `${n}|${color}`;
  let t = numCache.get(k);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const s = String(n);
  g.font = `900 ${s.length > 1 ? 78 : 96}px Geist, Roboto, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 16;
  g.strokeStyle = "#0b0805";
  g.strokeText(s, 64, 70);
  g.fillStyle = color;
  g.fillText(s, 64, 70);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  numCache.set(k, t);
  return t;
}

const portraitCache = new Map<string, THREE.CanvasTexture>();
/** zkSNARK #art on its faction's backdrop, crisp (8 px a cell), repainted when the pixels arrive. */
function portraitTex(art: number, fc: string, big = false): THREE.CanvasTexture {
  const k = `${art}|${fc}|${big}`;
  let t = portraitCache.get(k);
  if (t) return t;
  const S = 10;
  const c = document.createElement("canvas");
  c.width = GRID * S;
  c.height = Math.round(GRID * S * 1.3);
  const g = c.getContext("2d")!;
  const paint = (cells: Int32Array | null) => {
    const W = c.width,
      H = c.height;
    const bg = g.createRadialGradient(W / 2, H * 0.62, 10, W / 2, H * 0.6, H * 0.75);
    bg.addColorStop(0, mix(fc, "#ffffff", 0.15));
    bg.addColorStop(0.45, mix(fc, "#000000", 0.45));
    bg.addColorStop(1, mix(fc, "#000000", 0.85));
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // the backdrop's light rays and pixel dust
    g.globalAlpha = 0.07;
    for (let i = 0; i < 7; i++) {
      g.fillStyle = "#ffffff";
      g.beginPath();
      const x = (i / 6) * W;
      g.moveTo(W / 2, -10);
      g.lineTo(x - 12, H);
      g.lineTo(x + 12, H);
      g.fill();
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${0.05 + ((i * 37) % 10) / 60})`;
      g.fillRect(((i * 53) % W) | 0, ((i * 97) % H) | 0, 4, 4);
    }
    if (cells) {
      // the figure as big as the window allows (its own bounds, whole pixels), standing on the bottom
      let x0 = GRID,
        x1 = 0,
        y0 = GRID,
        y1 = 0;
      for (let i = 0; i < GRID * GRID; i++) {
        if (cells[i] < 0) continue;
        const x = i % GRID,
          y = (i / GRID) | 0;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      const bw = Math.max(1, x1 - x0 + 1),
        bh = Math.max(1, y1 - y0 + 1);
      const Z = Math.max(S, Math.floor(Math.min((W * 1.02) / bw, (H * 0.94) / bh)));
      const ox = Math.round((W - bw * Z) / 2) - x0 * Z,
        oy = H - (y1 + 1) * Z + Math.round(Z * 0.6);
      for (let i = 0; i < GRID * GRID; i++) {
        if (cells[i] < 0) continue;
        const x = (i % GRID) * Z + ox,
          y = ((i / GRID) | 0) * Z + oy;
        g.fillStyle = "rgba(0,0,0,0.5)";
        g.fillRect(x - 3, y - 3, Z + 6, Z + 6);
      }
      for (let i = 0; i < GRID * GRID; i++) {
        const v = cells[i];
        if (v < 0) continue;
        g.fillStyle = `rgb(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255})`;
        g.fillRect((i % GRID) * Z + ox, ((i / GRID) | 0) * Z + oy, Z, Z);
      }
    } else {
      g.fillStyle = "rgba(0,0,0,0.4)";
      g.fillRect(9 * S, H - 19 * S, 9 * S, 19 * S);
    }
    // a soft vignette
    const v = g.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.85);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  };
  paint(null);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 8;
  const tex = t;
  void snarkPixels(art).then((cells) => {
    if (!cells) return;
    paint(cells);
    tex.needsUpdate = true;
  });
  portraitCache.set(k, t);
  void big;
  return t;
}

function mix(a: string, b: string, k: number) {
  const A = new THREE.Color(a),
    B = new THREE.Color(b);
  return "#" + A.lerp(B, k).getHexString();
}


let glowT: THREE.CanvasTexture | null = null;
/** A soft round glow (additive sprites: flashes, orbs, beams' feet). */
function glowTex(): THREE.CanvasTexture {
  if (glowT) return glowT;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.65)");
  r.addColorStop(0.6, "rgba(255,255,255,0.15)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  glowT = new THREE.CanvasTexture(c);
  return glowT;
}
let beamT: THREE.CanvasTexture | null = null;
/** Light falling down a column: bright at the foot, gone at the top, soft at the sides. */
function beamTex(): THREE.CanvasTexture {
  if (beamT) return beamT;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, "rgba(255,255,255,0)");
  v.addColorStop(0.6, "rgba(255,255,255,0.25)");
  v.addColorStop(0.92, "rgba(255,255,255,0.9)");
  v.addColorStop(1, "rgba(255,255,255,1)");
  g.fillStyle = v;
  g.fillRect(0, 0, 128, 256);
  // streaks running down it
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(0,0,0,${0.2 + Math.random() * 0.4})`;
    g.fillRect(Math.random() * 128, 0, 2 + Math.random() * 5, 256);
  }
  beamT = new THREE.CanvasTexture(c);
  beamT.wrapS = THREE.RepeatWrapping;
  return beamT;
}
let ringT: THREE.CanvasTexture | null = null;
/** A soft shock ring: bright thin crest, a glow trailing inside. */
function ringTex(): THREE.CanvasTexture {
  if (ringT) return ringT;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, "rgba(255,255,255,0)");
  r.addColorStop(0.55, "rgba(255,255,255,0.05)");
  r.addColorStop(0.82, "rgba(255,255,255,0.35)");
  r.addColorStop(0.93, "rgba(255,255,255,1)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  ringT = new THREE.CanvasTexture(c);
  return ringT;
}
let starT: THREE.CanvasTexture | null = null;
/** A spiky impact star. */
function starTex(): THREE.CanvasTexture {
  if (starT) return starT;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.translate(128, 128);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const L = i % 2 ? 70 : 124;
    const grd = g.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(Math.cos(a + 0.16) * 14, Math.sin(a + 0.16) * 14);
    g.lineTo(Math.cos(a) * L, Math.sin(a) * L);
    g.lineTo(Math.cos(a - 0.16) * 14, Math.sin(a - 0.16) * 14);
    g.fill();
  }
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 40);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(-40, -40, 80, 80);
  starT = new THREE.CanvasTexture(c);
  return starT;
}
let zT: THREE.CanvasTexture | null = null;
/** "Z" for the sleepers (pixel type). */
function zTex(): THREE.CanvasTexture {
  if (zT) return zT;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const Z = ["######", "....##", "...##.", "..##..", ".##...", "######"];
  for (const [col, o] of [["#0b1220", 1], ["#cfe6ff", 0]] as [string, number][]) {
    g.fillStyle = col;
    Z.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && g.fillRect(8 + x * 8 + o * 3, 8 + y * 8 + o * 3, 8, 8)));
  }
  zT = new THREE.CanvasTexture(c);
  zT.magFilter = THREE.NearestFilter;
  return zT;
}

function textTex(s: string, w = 512, h = 96, color = "#f3ead6", font = "DotGothic16, Geist, sans-serif", size = 56, bg?: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.font = `${size}px ${font}`;
  // (shrunk to fit the width)
  const tw = g.measureText(s).width;
  if (tw > w * 0.9) g.font = `${Math.floor((size * w * 0.9) / tw)}px ${font}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 10;
  g.lineJoin = "round";
  g.strokeStyle = "rgba(0,0,0,0.85)";
  g.strokeText(s, w / 2, h / 2 + 2);
  g.fillStyle = color;
  g.fillText(s, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}


let backTex: THREE.CanvasTexture | null = null;
function cardBack(): THREE.CanvasTexture {
  if (backTex) return backTex;
  try {
    backTex = new THREE.CanvasTexture(paintBack());
    backTex.colorSpace = THREE.SRGBColorSpace;
    backTex.anisotropy = 8;
    return backTex;
  } catch {
    /* (the painter isn't there: our own back below) */
  }
  const c = document.createElement("canvas");
  c.width = 200;
  c.height = 280;
  const g = c.getContext("2d")!;
  const r = g.createLinearGradient(0, 0, 0, 280);
  r.addColorStop(0, "#2a1d0a");
  r.addColorStop(1, "#120c05");
  g.fillStyle = r;
  g.fillRect(0, 0, 200, 280);
  for (let y = 0; y < 280; y += 8)
    for (let x = 0; x < 200; x += 8) if (((x / 8) ^ (y / 8)) % 3 === 0) (g.fillStyle = "rgba(244,183,40,0.16)"), g.fillRect(x, y, 4, 4);
  g.strokeStyle = "#d9a42a";
  g.lineWidth = 8;
  g.strokeRect(8, 8, 184, 264);
  g.strokeStyle = "rgba(244,183,40,0.5)";
  g.lineWidth = 2;
  g.strokeRect(20, 20, 160, 240);
  const Z = ["#########", "#########", "......###", ".....###.", "....###..", "...###...", "..###....", ".###.....", "#########", "#########"];
  g.fillStyle = "#f4b728";
  Z.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && g.fillRect(100 - 4.5 * 9 + x * 9, 140 - 45 + y * 9, 9, 9)));
  backTex = new THREE.CanvasTexture(c);
  backTex.colorSpace = THREE.SRGBColorSpace;
  return backTex;
}

// ---- materials (shared) ---------------------------------------------------------------------------------------

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(k: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = make()));
  return g;
}

/** The faction's frame metal: bronze tinted towards the pool's colour. */
/** The painted frames' brightness at rest (unlit: their light is in the painting). */
const FRAME_REST = 0.86;
const frameColor = (f: Faction) => mix(FACTION_INFO[f].color, "#5a4424", 0.45);

// ---- painted materials -------------------------------------------------------------------------------------

const paintedCache = new Map<string, THREE.MeshStandardMaterial>();
/** A material with a painted surface (brushed metal, wood grain or stone) in a tone. */
function paintedMetal(color: string, kind: "metal" | "wood" | "stone"): THREE.MeshStandardMaterial {
  const k = `${color}|${kind}`;
  let m = paintedCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: rimTex(color, kind),
      roughness: kind === "metal" ? 0.5 : kind === "wood" ? 0.7 : 0.85,
      metalness: kind === "metal" ? 0.62 : 0.05,
    });
    paintedCache.set(k, m);
  }
  return m;
}
let iceM: THREE.MeshStandardMaterial | null = null;
function iceMat() {
  return (iceM ??= new THREE.MeshStandardMaterial({ map: iceTex(), color: "#e8f6ff", transparent: true, opacity: 0.62, roughness: 0.06, metalness: 0.1, emissive: "#4a9ae0", emissiveIntensity: 0.22, depthWrite: false }));
}
/** Halo's bubble: bright where it turns away from you, almost clear in the middle. */
const HALO_MAT = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color("#ffd76a") }, time: { value: 0 } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 color; uniform float time; varying vec3 vN; varying vec3 vV; varying float vY;
    void main() { float f = 1.0 - abs(dot(vN, vV)); float a = pow(f, 2.4) * 0.9 + 0.05; a *= 0.85 + 0.15 * sin(time * 3.0 + vY * 8.0); gl_FragColor = vec4(color * (0.7 + f), a); }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});
/** ZEC crystals: cut gems, lit gold when full, green when extra, smoky glass when spent. */
const CRYSTAL = {
  on: new THREE.MeshStandardMaterial({ color: "#ffd76a", emissive: "#e89a10", emissiveIntensity: 1.15, metalness: 0.25, roughness: 0.12, flatShading: true }),
  extra: new THREE.MeshStandardMaterial({ color: "#9dffaa", emissive: "#2aa040", emissiveIntensity: 1.2, metalness: 0.25, roughness: 0.12, flatShading: true }),
  off: new THREE.MeshStandardMaterial({ color: "#3a3222", emissive: "#000000", metalness: 0.55, roughness: 0.25, flatShading: true, transparent: true, opacity: 0.85 }),
};
const chipCache = new Map<string, THREE.CanvasTexture>();
/** A small round medallion with a pixel icon (the minion's text at a glance). */
function chipTex(name: string, color: string): THREE.CanvasTexture {
  const k = `${name}|${color}`;
  let t = chipCache.get(k);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d")!;
  const rim = g.createRadialGradient(36, 34, 4, 48, 48, 46);
  rim.addColorStop(0, "#fff6cf");
  rim.addColorStop(0.5, "#c89a2a");
  rim.addColorStop(1, "#4a3006");
  g.fillStyle = rim;
  g.beginPath();
  g.arc(48, 48, 46, 0, Math.PI * 2);
  g.fill();
  const inner = g.createRadialGradient(40, 38, 2, 48, 48, 38);
  inner.addColorStop(0, "#2e2a24");
  inner.addColorStop(1, "#0c0a08");
  g.fillStyle = inner;
  g.beginPath();
  g.arc(48, 48, 37, 0, Math.PI * 2);
  g.fill();
  g.imageSmoothingEnabled = false;
  g.drawImage(iconCanvas(name, color), 24, 24, 48, 48);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  chipCache.set(k, t);
  return t;
}

// ---- tokens ------------------------------------------------------------------------------------------------

interface Token {
  uid: number;
  side: Side;
  group: THREE.Group;
  body: THREE.Group;
  /** The painted frame (its material takes the flashes). */
  frame: THREE.Mesh;
  base: THREE.Mesh;
  portrait: THREE.Mesh;
  pmat: THREE.MeshBasicMaterial;
  /** The portrait's brightness at rest (dimmer when Shielded, Redacted or asleep). */
  pbase: number;
  fmat: THREE.MeshBasicMaterial;
  ring: THREE.Mesh;
  rmat: THREE.MeshBasicMaterial;
  guard: THREE.Object3D;
  halo: THREE.Group;
  veil: THREE.Mesh;
  ice: THREE.Mesh;
  atk: THREE.Mesh;
  hp: THREE.Mesh;
  chips: THREE.Group;
  art: number;
  faction: Faction;
  state: string;
  dead?: boolean;
  sleeping?: boolean;
  zzz?: number;
}

interface HeroToken {
  group: THREE.Group;
  body: THREE.Group;
  frame: THREE.Mesh;
  fmat: THREE.MeshBasicMaterial;
  portrait: THREE.Mesh;
  ring: THREE.Mesh;
  rmat: THREE.MeshBasicMaterial;
  hp: THREE.Mesh;
  armor: THREE.Mesh;
  atk: THREE.Mesh;
  ice: THREE.Mesh;
  art: number;
  faction: Faction;
}

interface Tween {
  t: number;
  dur: number;
  f: (k: number) => void;
  done: () => void;
}

interface Bit {
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Vector3;
  w: THREE.Vector3;
  s: number;
  life: number;
  max: number;
  grav: number;
}

export class View3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.5, 120);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private map: MapHandle;
  private raf = 0;
  private last = 0;
  private time = 0;
  private disposed = false;
  /** Slow motion for the bench (1: real time). */
  timeScale = 1;
  private W = 1;
  private H = 1;
  private camBase = new THREE.Vector3();
  private camLook = new THREE.Vector3(0, 0, 0.5);
  private shakeAmt = 0;
  private tweens: Tween[] = [];
  private ray = new THREE.Raycaster();
  private pickables: THREE.Object3D[] = [];

  private tokens = new Map<number, Token>();
  private rows: [number[], number[]] = [[], []];
  private gap = -1;
  private heroes: HeroToken[] = [];
  private powers: THREE.Group[] = [];
  private powerUsed = [false, false];
  private weapons: THREE.Group[] = [];
  private crystals: THREE.Mesh[][] = [[], []];
  private manaLabel: THREE.Mesh[] = [];
  private decks: THREE.Group[] = [];
  private deckCount = [-1, -1];
  private backs: THREE.Mesh[] = [];
  private secrets: THREE.Mesh[][] = [[], []];
  private endBtn!: THREE.Group;
  private endTop!: THREE.Mesh;
  private endState = "";
  private debris!: THREE.InstancedMesh;
  private bits: Bit[] = [];
  private sparkBits: (Bit & { c: THREE.Color })[] = [];
  private rings: { m: THREE.Mesh; t: number; dur: number; size: number }[] = [];
  private factions: [Faction, Faction];
  readonly accent: string;

  constructor(host: HTMLElement, factions: [Faction, Faction], mapKind: MapKind) {
    this.factions = factions;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "zkl-gl";
    host.appendChild(this.canvas);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.map = buildMap(mapKind, this.renderer, this.scene);
    this.accent = this.map.accent;
    this.pickables.push(...this.map.toys);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.16, 0.35, 1.05);
    this.composer.addPass(this.bloom);
    // a soft vignette: the eye drawn to the board
    const vig = new ShaderPass(VignetteShader);
    vig.uniforms.offset.value = 0.95;
    vig.uniforms.darkness.value = 1.15;
    this.composer.addPass(vig);
    this.composer.addPass(new OutputPass());

    for (const s of [0, 1] as Side[]) this.buildSide(s);
    this.buildEnd();
    this.buildParticles();
    this.last = performance.now();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000) * this.timeScale;
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.map.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !Array.from(geoCache.values()).includes(m.geometry)) m.geometry.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  resize(W: number, H: number) {
    this.W = W;
    this.H = H;
    this.renderer.setSize(W, H, false);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    this.composer.setSize(W, H);
    const aspect = W / H;
    this.camera.aspect = aspect;
    const portrait = aspect < 1;
    this.camera.fov = portrait ? 52 : 30;
    // fit the table's width (and enough depth), looking down at ~62° (a phone held upright: the lanes
    // only, from higher up)
    const dir = new THREE.Vector3(0, 17, portrait ? 4.2 : 9.2).normalize();
    const half = portrait ? 7.5 : 10.4;
    const vt = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dW = half / (vt * aspect);
    const dH = (portrait ? 7.4 : 7.45) / vt;
    const D = Math.max(dW, dH);
    this.camLook.set(0, 0, portrait ? 0.4 : 0.75);
    this.camBase.copy(this.camLook).addScaledVector(dir, D);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camLook);
    this.camera.updateProjectionMatrix();
    // soft points keep their world size on screen
    if (this.sparkMat) this.sparkMat.uniforms.scale.value = (H * this.renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
  }

  // ---- building the fixed pieces -------------------------------------------------------------------------

  private buildSide(s: Side) {
    const f = this.factions[s];
    const fc = FACTION_INFO[f].color;
    const z = HERO_Z[s];
    // the hero: a gold slab, the portrait, the painted frame over it, painted gems
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    group.position.set(0, 0, z);
    const base = new THREE.Mesh(geo("hero-base", () => slab(stepShape(2.62, 2.98, 0.24), 0.3, 0.05)), [paintedMetal("#8a6a20", "metal"), paintedMetal("#b5800f", "metal")]);
    base.castShadow = true;
    base.receiveShadow = true;
    body.add(base);
    const portrait = new THREE.Mesh(geo("hero-plane", () => new THREE.PlaneGeometry(1.86, 2.2).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: portraitTex(this.heroArt[s] ?? 1, fc, true), color: new THREE.Color(0.9, 0.9, 0.9) }));
    portrait.position.y = 0.37;
    portrait.name = "portrait";
    body.add(portrait);
    const fmat = new THREE.MeshBasicMaterial({ map: heroFrame(f), transparent: true, alphaTest: 0.02, depthWrite: false, color: new THREE.Color(FRAME_REST, FRAME_REST, FRAME_REST) });
    const frame = new THREE.Mesh(geo("hero-frame", () => new THREE.PlaneGeometry(HERO_FRAME.w, HERO_FRAME.d).rotateX(-Math.PI / 2)), fmat);
    frame.position.set(0, 0.385, -0.12);
    frame.renderOrder = 3;
    body.add(frame);
    const gemPlane = (size: number) => {
      const m = new THREE.Mesh(geo(`gem-${size}`, () => new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      m.renderOrder = 6;
      return m;
    };
    const hp = gemPlane(1.08);
    hp.position.set(1.15, 0.44, 1.2);
    body.add(hp);
    const armor = gemPlane(0.9);
    armor.position.set(1.18, 0.44, 0.3);
    armor.visible = false;
    body.add(armor);
    const atk = gemPlane(1.0);
    atk.position.set(-1.15, 0.44, 1.2);
    atk.visible = false;
    body.add(atk);
    const ice = new THREE.Mesh(geo("hero-ice", () => new RoundedBoxGeometry(2.6, 0.7, 2.95, 2, 0.14)), iceMat());
    ice.position.y = 0.4;
    ice.visible = false;
    body.add(ice);
    const rmat = new THREE.MeshBasicMaterial({ color: "#7ee08a", transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(geo("hero-ring", () => ringGeo(2.62, 2.98, 0.24, 0.24)), rmat);
    ring.position.y = 0.02;
    body.add(ring);
    group.userData.pick = { kind: "hero", uid: s === 0 ? 1 : 2, side: s };
    base.userData.pick = portrait.userData.pick = group.userData.pick;
    this.pickables.push(base, portrait);
    this.scene.add(group);
    this.heroes[s] = { group, body, frame, fmat, portrait, ring, rmat, hp, armor, atk, ice, art: 0, faction: f };

    // the power: a painted medallion (its spent back underneath), right of the hero
    const pg = new THREE.Group();
    const coin = new THREE.Group();
    const p = POWERS.get(f);
    // its faces are printed (self-lit like the portraits): the room's reflections had washed them out
    const coinMesh = new THREE.Mesh(geo("coin", () => new THREE.CylinderGeometry(0.7, 0.7, 0.18, 8)), [paintedMetal("#c89a2a", "metal"), new THREE.MeshBasicMaterial({ map: powerFace(f), color: new THREE.Color(0.78, 0.78, 0.78) }), new THREE.MeshBasicMaterial({ map: powerBack(), color: new THREE.Color(0.8, 0.8, 0.8) })]);
    coinMesh.rotation.y = Math.PI / 8;
    coinMesh.position.y = 0.2;
    coinMesh.castShadow = true;
    coin.add(coinMesh);
    pg.add(coin);
    const cost = gemPlane(0.62);
    (cost.material as THREE.MeshBasicMaterial).map = gemTex("cost", p?.cost ?? 2);
    cost.position.set(0, 0.34, -0.8);
    pg.add(cost);
    // usable: a green line round the coin (Hearthstone's)
    const pring = new THREE.Mesh(geo("coin-ring", () => new THREE.RingGeometry(0.74, 0.88, 8, 1, Math.PI / 8).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: "#6ee07a", transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    pring.position.y = 0.03;
    pg.add(pring);
    pg.userData.ring = pring;
    pg.position.set(2.85, 0, z + (s === 0 ? 0.35 : -0.05));
    pg.userData.coin = coin;
    pg.userData.cost = cost;
    coinMesh.userData.pick = { kind: "power", side: s };
    this.pickables.push(coinMesh);
    this.scene.add(pg);
    this.powers[s] = pg;

    // the weapon, left of the hero
    const wg = new THREE.Group();
    const wd = new THREE.Mesh(geo("weapon", () => new THREE.CylinderGeometry(0.72, 0.72, 0.2, 8)), [paintedMetal("#6c727a", "metal"), new THREE.MeshBasicMaterial({ map: weaponFace(), color: new THREE.Color(0.85, 0.85, 0.85) }), paintedMetal("#2a2622", "metal")]);
    wd.rotation.y = Math.PI / 8;
    wd.position.y = 0.2;
    wd.castShadow = true;
    wg.add(wd);
    const wa = gemPlane(0.7);
    wa.position.set(-0.62, 0.36, 0.62);
    wg.add(wa);
    const wdur = gemPlane(0.64);
    wdur.position.set(0.62, 0.36, 0.62);
    wg.add(wdur);
    wg.userData.atk = wa;
    wg.userData.dur = wdur;
    wg.position.set(-2.85, 0, z + (s === 0 ? 0.35 : -0.05));
    wg.visible = false;
    wd.userData.pick = { kind: "weapon", side: s };
    this.pickables.push(wd);
    this.scene.add(wg);
    this.weapons[s] = wg;

    // ZEC crystals: ten cut gems in a row on a little gold rail, each glowing when full
    const row: THREE.Mesh[] = [];
    const cz = s === 0 ? 5.95 : -6.15;
    const rail = new THREE.Mesh(geo("mana-rail", () => new RoundedBoxGeometry(5.9, 0.12, 0.5, 2, 0.05)), paintedMetal("#8a6a20", "metal"));
    rail.position.set(4.2 + 4.5 * 0.56, 0.06, cz);
    rail.receiveShadow = true;
    // (the HUD shows ZEC now: ui.ts setMana; the crystals stay as invisible anchors)
    rail.visible = false;
    this.scene.add(rail);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geo("crystal", () => new THREE.OctahedronGeometry(0.22, 0).scale(1, 1.4, 1)), CRYSTAL.off);
      m.position.set(4.2 + i * 0.56, 0.36, cz);
      m.castShadow = true;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: "#ffcf4a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.55 }));
      halo.scale.setScalar(0.95);
      halo.visible = false;
      m.add(halo);
      m.userData.glow = halo;
      m.visible = false;
      this.scene.add(m);
      row.push(m);
    }
    this.crystals[s] = row;
    const lab = new THREE.Mesh(geo("mana-label", () => new THREE.PlaneGeometry(1.4, 0.5).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    lab.position.set(3.15, 0.32, cz);
    lab.visible = false;
    this.scene.add(lab);
    this.manaLabel[s] = lab;

    // the deck at the right edge: a stack of cards (painted edges, the painted back on top)
    const dg = new THREE.Group();
    dg.position.set(9.0, 0, s === 0 ? 2.65 : -2.85);
    const edge = new THREE.MeshStandardMaterial({ map: deckEdgeTex(), roughness: 0.8 });
    const box = new THREE.Mesh(geo("deck-box", () => new RoundedBoxGeometry(1.3, 1, 1.8, 2, 0.05)), [edge, edge, new THREE.MeshStandardMaterial({ map: cardBack(), roughness: 0.5 }), paintedMetal("#1a140c", "wood"), edge, edge]);
    box.castShadow = true;
    box.receiveShadow = true;
    dg.add(box);
    const dn = this.numPlane(0.7);
    dn.position.set(0, 0.1, 1.2);
    dg.add(dn);
    dg.userData.box = box;
    dg.userData.n = dn;
    box.userData.pick = { kind: "deck", side: s };
    this.pickables.push(box);
    this.scene.add(dg);
    this.decks[s] = dg;
  }

  private heroArt: number[] = [];
  setHeroArt(s: Side, art: number) {
    this.heroArt[s] = art;
    const h = this.heroes[s];
    h.art = art;
    const p = h.body.getObjectByName("portrait") as THREE.Mesh;
    (p.material as THREE.MeshBasicMaterial).map = portraitTex(art, FACTION_INFO[this.factions[s]].color, true);
    (p.material as THREE.MeshBasicMaterial).needsUpdate = true;
  }

  private buildEnd() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.3, 1.3, 2, 0.08), paintedMetal("#3a3028", "metal"));
    base.position.y = 0.15;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);
    const top = new THREE.Mesh(new RoundedBoxGeometry(2.36, 0.34, 1.06, 2, 0.1), paintedMetal("#b5800f", "metal"));
    top.position.y = 0.42;
    top.castShadow = true;
    g.add(top);
    const plaque = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.4, metalness: 0.2, emissive: "#ffffff", emissiveIntensity: 0 });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 1.04).rotateX(-Math.PI / 2), plaque);
    label.position.y = 0.6;
    top.add(label);
    top.userData.label = label;
    g.position.set(9.0, 0, -0.1);
    top.userData.pick = base.userData.pick = label.userData.pick = { kind: "end" };
    this.pickables.push(top, base, label);
    this.scene.add(g);
    this.endBtn = g;
    this.endTop = top;
  }

  private sparkPts!: THREE.Points;
  private sparkMat!: THREE.ShaderMaterial;
  private buildParticles() {
    const N = 900;
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 }), N);
    this.debris.castShadow = true;
    this.debris.count = 0;
    this.debris.frustumCulled = false;
    this.scene.add(this.debris);
    this.debris.setColorAt(0, new THREE.Color("#fff"));
    // the sparks: soft glowing points (one buffer, rewritten each frame)
    const M = 1400;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(M * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("pcolor", new THREE.BufferAttribute(new Float32Array(M * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("psize", new THREE.BufferAttribute(new Float32Array(M), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("palpha", new THREE.BufferAttribute(new Float32Array(M), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot() }, scale: { value: 400 } },
      vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; varying vec3 vC; varying float vA; uniform float scale;
        void main() { vC = pcolor; vA = palpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparkPts = new THREE.Points(geo, this.sparkMat);
    this.sparkPts.frustumCulled = false;
    this.sparkPts.renderOrder = 8;
    this.scene.add(this.sparkPts);
  }

  private numPlane(size: number): THREE.Mesh {
    const m = new THREE.Mesh(geo(`num-${size}`, () => new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    m.renderOrder = 5;
    return m;
  }
  private setNum(m: THREE.Mesh, n: number | string, color = "#ffffff") {
    const mat = m.material as THREE.MeshBasicMaterial;
    const t = numTex(n, color);
    if (mat.map !== t) {
      mat.map = t;
      mat.needsUpdate = true;
    }
  }

  // ---- minions ---------------------------------------------------------------------------------------------

  private makeToken(m: Minion): Token {
    const d = card(m.id);
    const f = d.faction;
    const fc = FACTION_INFO[f].color;
    const legend = d.rarity === "legendary";
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    // Guard: a stone shield behind (its iron edge for thickness, the painted stone on top)
    const guard = new THREE.Group();
    const gEdge = new THREE.Mesh(geo("guard", () => slab(shieldShape(2.2, 2.7), 0.14, 0.04)), paintedMetal("#4a4642", "stone"));
    gEdge.rotation.y = Math.PI;
    gEdge.position.set(0, -0.04, 0.05);
    gEdge.castShadow = true;
    guard.add(gEdge);
    const gTop = new THREE.Mesh(geo("guard-top", () => new THREE.PlaneGeometry(2.28, 2.7).rotateX(-Math.PI / 2)), new THREE.MeshStandardMaterial({ map: guardTex(), transparent: true, alphaTest: 0.05, roughness: 0.85 }));
    gTop.position.set(0, 0.145, 0.05);
    guard.add(gTop);
    guard.visible = false;
    body.add(guard);
    // the token's body: a slab whose edge is the frame's metal
    const trimCol = legend ? "#c89a2a" : frameColor(f);
    const base = new THREE.Mesh(geo("frame", () => slab(stepShape(1.56, 1.98, 0.17), 0.2, 0.035)), [paintedMetal(mix(trimCol, "#000000", 0.35), "metal"), paintedMetal(trimCol, "metal")]);
    base.castShadow = true;
    base.receiveShadow = true;
    body.add(base);
    const pmat = new THREE.MeshBasicMaterial({ map: portraitTex(d.art, fc), color: new THREE.Color(0.86, 0.86, 0.86) });
    const portrait = new THREE.Mesh(geo("portrait", () => new THREE.PlaneGeometry(1.3, 1.72).rotateX(-Math.PI / 2)), pmat);
    portrait.position.y = 0.24;
    body.add(portrait);
    const veilM = new THREE.Mesh(geo("portrait", () => new THREE.PlaneGeometry(1.3, 1.72).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: smokeTex(), transparent: true, opacity: 0.95, depthWrite: false }));
    veilM.position.y = 0.245;
    veilM.visible = false;
    body.add(veilM);
    // the painted frame over it all
    const fmat = new THREE.MeshBasicMaterial({ map: minionFrame(f, d.rarity), transparent: true, alphaTest: 0.02, depthWrite: false, color: new THREE.Color(FRAME_REST, FRAME_REST, FRAME_REST) });
    const frame = new THREE.Mesh(geo("frame-plane", () => new THREE.PlaneGeometry(FRAME_SIZE.w, FRAME_SIZE.d).rotateX(-Math.PI / 2)), fmat);
    frame.position.y = 0.25;
    frame.renderOrder = 3;
    body.add(frame);
    const ice = new THREE.Mesh(geo("ice", () => new RoundedBoxGeometry(1.8, 0.62, 2.2, 2, 0.12)), iceMat());
    ice.position.y = 0.3;
    ice.visible = false;
    body.add(ice);
    // Halo: a golden bubble (bright at its rim) and a ring at its foot
    const halo = new THREE.Group();
    const dome = new THREE.Mesh(geo("dome", () => new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.12, 0.62, 1.36)), HALO_MAT);
    dome.renderOrder = 7;
    halo.add(dome);
    const hring = new THREE.Mesh(geo("halo-ring", () => new THREE.TorusGeometry(1.0, 0.04, 6, 40).rotateX(Math.PI / 2).scale(1.12, 1, 1.36)), new THREE.MeshBasicMaterial({ color: "#ffe08a", toneMapped: false }));
    hring.position.y = 0.05;
    halo.add(hring);
    halo.visible = false;
    body.add(halo);
    // the painted gems
    const gem = (x: number) => {
      const g = new THREE.Mesh(geo("tgem", () => new THREE.PlaneGeometry(0.78, 0.78).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      g.position.set(x, 0.27, 0.86);
      g.renderOrder = 6;
      body.add(g);
      return g;
    };
    const atk = gem(-0.66);
    const hp = gem(0.66);
    const chips = new THREE.Group();
    chips.position.set(0, 0.3, 1.04);
    body.add(chips);
    const rmat = new THREE.MeshBasicMaterial({ color: "#7ee08a", transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(geo("ring", () => ringGeo(1.56, 1.98, 0.17, 0.2)), rmat);
    ring.position.y = 0.01;
    body.add(ring);
    const pick = { kind: "minion", uid: m.uid, side: m.side };
    for (const o of [base, portrait, gEdge]) {
      o.userData.pick = pick;
      this.pickables.push(o);
    }
    this.scene.add(group);
    return { uid: m.uid, side: m.side, group, body, frame, base, portrait, pmat, pbase: 0.86, fmat, ring, rmat, guard, halo, veil: veilM, ice, atk, hp, chips, art: d.art, faction: f, state: "" };
  }

  private chipKey = new Map<number, string>();
  /** Bring a minion's look up to date. */
  setMinion(m: Minion) {
    const t = this.tokens.get(m.uid);
    if (t) this.paint(t, m);
  }
  private paint(t: Token, m: Minion) {
    const d = card(m.id);
    const a = Math.max(0, m.atk + m.aura);
    this.setGem(t.atk, "atk", a, a > (d.atk ?? 0) ? "#a8ff9a" : a < (d.atk ?? 0) ? "#ff9a8a" : "#ffffff");
    this.setGem(t.hp, "hp", m.hp, m.hp < m.maxHp ? "#ff9a8a" : m.maxHp > (d.hp ?? 0) ? "#a8ff9a" : "#ffffff");
    const k = (b: number) => (m.kw & b) !== 0;
    t.guard.visible = k(KW.GUARD);
    t.halo.visible = k(KW.HALO);
    t.veil.visible = k(KW.SHIELDED);
    t.pbase = k(KW.SHIELDED) ? 0.55 : m.redacted ? 0.4 : t.sleeping ? 0.7 : 0.86;
    t.pmat.color.setScalar(t.pbase);
    t.ice.visible = !!m.frozen;
    // chips: what its text does
    const chips: [string, string][] = [];
    if (!m.redacted) {
      if (d.death) chips.push(["skull", "#e8e6e0"]);
      if (d.turnEnd || d.turnStart || d.onSummon || d.onSpell || d.onDeath || d.onHurt) chips.push(["bolt", "#f4b728"]);
      if (d.aura || d.spellDiscount || d.doubleDeath || d.prover) chips.push(["halo", "#c4b1fc"]);
    }
    if (k(KW.DOUBLE)) chips.push(["x2", "#a8d8e8"]);
    if (k(KW.DUST)) chips.push(["drop", "#9be36a"]);
    if (k(KW.DRAIN)) chips.push(["drop", "#ff5c6a"]);
    if (k(KW.REORG)) chips.push(["loop", "#c4b1fc"]);
    if (k(KW.ELUSIVE)) chips.push(["eye", "#e8e6e0"]);
    const key = chips.map((c) => c.join()).join("|");
    if (this.chipKey.get(m.uid) !== key) {
      this.chipKey.set(m.uid, key);
      t.chips.clear();
      chips.forEach(([n, c], i) => {
        const p = new THREE.Mesh(geo("chip", () => new THREE.PlaneGeometry(0.34, 0.34).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: chipTex(n, c), transparent: true, toneMapped: false }));
        p.position.x = (i - (chips.length - 1) / 2) * 0.38;
        p.renderOrder = 6;
        t.chips.add(p);
      });
    }
  }
  private setGem(m: THREE.Mesh, kind: GemKind, n: number, color = "#ffffff") {
    const mat = m.material as THREE.MeshBasicMaterial;
    const t = gemTex(kind, n, color);
    if (mat.map !== t) {
      mat.map = t;
      mat.needsUpdate = true;
    }
  }

  hasMinion(uid: number) {
    return this.tokens.has(uid);
  }

  /** Where slot i of n stands on side s (with a gap opened at `gap` on my side). */
  private slot(s: Side, i: number, n: number): THREE.Vector3 {
    const gap = s === 0 ? this.gap : -1;
    const k = gap >= 0 ? n + 1 : n;
    const j = gap >= 0 && i >= gap ? i + 1 : i;
    return new THREE.Vector3((j - (k - 1) / 2) * SLOT, 0, TABLE.laneZ[s]);
  }
  private layoutRow(s: Side, ms = 300) {
    const list = this.rows[s];
    list.forEach((uid, i) => {
      const t = this.tokens.get(uid);
      if (!t || t.dead) return;
      const to = this.slot(s, i, list.length);
      const from = t.group.position.clone();
      if (from.distanceTo(to) < 0.001) return;
      if (!ms) return void t.group.position.copy(to);
      void this.tween(ms, (k) => t.group.position.lerpVectors(from, to, easeOut(k)));
    });
  }

  /** The rows as the state has them (creating, dropping and placing tokens), with no show. */
  syncRows(boards: [Minion[], Minion[]]) {
    for (const s of [0, 1] as Side[]) {
      const want = boards[s].map((m) => m.uid);
      for (const uid of this.rows[s]) if (!want.includes(uid)) this.drop(uid);
      for (const m of boards[s]) {
        if (!this.tokens.has(m.uid)) {
          const t = this.makeToken(m);
          this.tokens.set(m.uid, t);
          t.group.position.copy(this.slot(s, boards[s].indexOf(m), boards[s].length));
        }
        this.setMinion(m);
      }
      this.rows[s] = want;
      this.layoutRow(s, 200);
    }
  }
  private drop(uid: number) {
    const t = this.tokens.get(uid);
    if (!t) return;
    this.scene.remove(t.group);
    this.pickables = this.pickables.filter((o) => o.userData.pick?.uid !== uid || o.userData.pick?.kind !== "minion");
    this.tokens.delete(uid);
    this.chipKey.delete(uid);
    for (const s of [0, 1] as Side[]) this.rows[s] = this.rows[s].filter((x) => x !== uid);
  }

  setGap(i: number) {
    if (this.gap === i) return;
    this.gap = i;
    this.layoutRow(0, 160);
  }
  /** Which gap a minion dropped at screen x on my side would take. */
  insertIndex(x: number): number {
    const n = this.rows[0].length;
    const saved = this.gap;
    this.gap = -1;
    let at = n;
    for (let i = 0; i < n; i++)
      if (x < this.project(this.slot(0, i, n)).x) {
        at = i;
        break;
      }
    this.gap = saved;
    return at;
  }
  /** The screen point of slot `at` (opened gap) on my row. */
  gapPoint(at: number): XY {
    const n = this.rows[0].length;
    const saved = this.gap;
    this.gap = at;
    const p = this.project(this.slot(0, at, n));
    this.gap = saved;
    return p;
  }

  // ---- the ghost: where the card you drag will stand ------------------------------------------------

  private ghostTok: Token | null = null;
  private ghostId = "";
  private ghostAt = -1;
  /** A see-through copy of the minion you drag, standing in the gap it would take (null: none). */
  ghost(id: string | null, at = -1) {
    if (!id) {
      if (this.ghostTok) this.scene.remove(this.ghostTok.group);
      this.ghostTok = null;
      this.ghostId = "";
      this.ghostAt = -1;
      this.setGap(-1);
      return;
    }
    if (!this.ghostTok || this.ghostId !== id) {
      if (this.ghostTok) this.scene.remove(this.ghostTok.group);
      const d = card(id);
      const fake: Minion = { uid: -1, id, side: 0, atk: d.atk ?? 0, hp: d.hp ?? 1, maxHp: d.hp ?? 1, aura: 0, kw: d.kw ?? 0, sick: true, attacks: 0, frozen: 0, redacted: false, doomed: false, turnPlayed: 0 };
      const t = this.makeToken(fake);
      this.paint(t, fake);
      this.chipKey.delete(-1);
      this.pickables = this.pickables.filter((o) => o.userData.pick?.uid !== -1);
      const see = (x: THREE.Material) => {
        const c = x.clone();
        c.transparent = true;
        c.opacity = Math.min(c.opacity, 0.5);
        c.depthWrite = false;
        return c;
      };
      t.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.material) return;
        m.castShadow = false;
        m.material = Array.isArray(m.material) ? m.material.map(see) : see(m.material);
      });
      t.rmat = t.ring.material as THREE.MeshBasicMaterial;
      t.rmat.color.set("#ffd76a");
      t.rmat.opacity = 0.8;
      this.ghostTok = t;
      this.ghostId = id;
    }
    if (at !== this.ghostAt) {
      this.ghostAt = at;
      this.setGap(at);
      const n = this.rows[0].length;
      const x = (at - n / 2) * SLOT;
      const g = this.ghostTok.group;
      const from = g.position.clone();
      const to = new THREE.Vector3(x, 0.32, TABLE.laneZ[0]);
      if (from.y < 0.1) g.position.copy(to);
      else void this.tween(140, (k) => g.position.lerpVectors(from, to, easeOut(k)));
    }
  }

  /** The screen point where side s's next minion would stand at index `at` (for a card flying in). */
  slotPoint(s: Side, at: number, n: number): XY {
    return this.project(new THREE.Vector3((at - (n - 1) / 2) * SLOT, 0, TABLE.laneZ[s]));
  }

  /** A minion comes onto the board: it rises off your drag (or falls from above), slams down: dust,
   * a shock ring, a flash. A legendary first calls down a column of gold. */
  async summon(m: Minion, pos: number) {
    if (this.tokens.has(m.uid)) return;
    const s = m.side;
    const fromGhost = s === 0 && this.ghostTok ? this.ghostTok.group.position.clone() : null;
    if (s === 0) this.ghost(null);
    const t = this.makeToken(m);
    this.tokens.set(m.uid, t);
    this.setMinion(m);
    const list = this.rows[s];
    list.splice(Math.min(pos, list.length), 0, m.uid);
    const to = this.slot(s, list.indexOf(m.uid), list.length);
    this.layoutRow(s, 220);
    const legend = card(m.id).rarity === "legendary";
    t.group.visible = !legend;
    if (legend) {
      await this.pillar(to, "#ffd76a");
      t.group.visible = true;
    }
    const lean = s === 0 ? 1 : -1;
    const top = legend ? 4.2 : fromGhost ? 1.35 : 2.6;
    const start = fromGhost ?? new THREE.Vector3(to.x, top, to.z + lean * 0.9);
    t.group.position.copy(start);
    t.group.scale.setScalar(1.15);
    if (fromGhost) {
      await this.tween(110, (k) => {
        const e = easeOut(k);
        t.group.position.set(start.x + (to.x - start.x) * e, start.y + (top - start.y) * e, to.z);
        t.body.rotation.x = -0.25 * e * lean;
      });
    }
    const p0 = t.group.position.clone();
    await this.tween(legend ? 300 : 210, (k) => {
      const e = easeIn(k);
      t.group.position.set(p0.x + (to.x - p0.x) * e, p0.y * (1 - e), p0.z + (to.z - p0.z) * e);
      t.group.scale.setScalar(1.15 - 0.15 * e);
      t.body.rotation.x = -0.25 * lean * (1 - e);
    });
    t.body.rotation.x = 0;
    this.slam(to, legend);
    await this.tween(170, (k) => {
      const q = Math.sin(k * Math.PI) * (1 - k * 0.3);
      t.body.scale.set(1 + q * 0.08, 1 - q * 0.22, 1 + q * 0.08);
    });
    t.body.scale.set(1, 1, 1);
  }

  /** The landing: dust, a ring along the table, a flash, a thump of the camera. */
  private slam(p: THREE.Vector3, big: boolean) {
    this.dust(p, big ? 40 : 14, big);
    this.puff(p, big ? "#e8d8b0" : "#c8b89a", big ? 10 : 6, big ? 2.2 : 1.5);
    this.ring(p, big ? "#ffd76a" : "#c8a878", big ? 9 : 3.6);
    this.flash(p.clone().setY(0.35), big ? "#ffe08a" : "#fff4dc", big ? 4.2 : 2.2, big ? 320 : 200);
    this.shake(big ? 0.6 : 0.09);
  }

  /** A column of light from above at p (legendary entrances, blessings). */
  private async pillar(p: THREE.Vector3, color: string, ms = 650, r = 0.9) {
    const mat = new THREE.MeshBasicMaterial({ map: beamTex(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const beam = new THREE.Mesh(geo("pillar", () => new THREE.CylinderGeometry(0.75, 1.1, 9, 24, 1, true)), mat);
    beam.position.set(p.x, 4.5, p.z);
    beam.scale.set(r, 1, r);
    this.scene.add(beam);
    const ground = this.flash(p.clone().setY(0.1), color, r * 3.2, ms + 200, true);
    void ground;
    await this.tween(ms, (k) => {
      mat.opacity = Math.sin(k * Math.PI) * 0.9;
      beam.scale.set(r * (1 - k * 0.5), 1, r * (1 - k * 0.5));
      beamTex().offset.x = k * 0.6;
      if (Math.random() < 0.8) {
        const a = Math.random() * Math.PI * 2;
        this.addSpark(new THREE.Vector3(p.x + Math.cos(a) * r, 0.2, p.z + Math.sin(a) * r), new THREE.Vector3(-Math.cos(a) * 0.4, 2.5 + Math.random() * 2, -Math.sin(a) * 0.4), color, 0.08, 0.9, -0.5);
      }
    });
    this.scene.remove(beam);
    mat.dispose();
  }

  /** A soft additive flash (a sprite) at p, growing to `size`. */
  private flash(p: THREE.Vector3, color: string, size: number, ms: number, flat = false) {
    const mat = new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    let o: THREE.Object3D;
    if (flat) {
      const m = new THREE.Mesh(geo("flash-flat", () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: glowTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      o = m;
    } else o = new THREE.Sprite(mat);
    o.position.copy(p);
    this.scene.add(o);
    void this.tween(ms, (k) => {
      const s = size * (0.3 + easeOut(k) * 0.7);
      o.scale.set(s, flat ? 1 : s, s);
      const om = (o as THREE.Mesh).material as THREE.Material & { opacity: number };
      om.opacity = (1 - k) * (1 - k);
    }).then(() => {
      this.scene.remove(o);
      ((o as THREE.Mesh).material as THREE.Material).dispose();
    });
    return o;
  }

  /** An impact star (spiky, additive) at p. */
  private star(p: THREE.Vector3, color: string, size: number) {
    const mat = new THREE.SpriteMaterial({ map: starTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, rotation: Math.random() * Math.PI });
    const s = new THREE.Sprite(mat);
    s.position.copy(p);
    this.scene.add(s);
    void this.tween(260, (k) => {
      const z = size * (0.4 + easeOut(k) * 0.8);
      s.scale.set(z, z, z);
      mat.opacity = 1 - k;
      mat.rotation += 0.02;
    }).then(() => {
      this.scene.remove(s);
      mat.dispose();
    });
  }

  /** Off the board: it tips, flashes white, bursts into its own pixels; a wisp rises. */
  async die(uid: number) {
    const t = this.tokens.get(uid);
    if (!t) return;
    t.dead = true;
    const lean = t.side === 0 ? 1 : -1;
    await this.tween(220, (k) => {
      t.fmat.color.setScalar(FRAME_REST + k * 1.6);
      t.pmat.color.setScalar(0.86 + k * 0.9);
      t.body.rotation.x = 0.35 * lean * easeIn(k);
      t.group.position.y = 0.25 * Math.sin(k * Math.PI);
      t.group.scale.setScalar(1 + k * 0.1);
    });
    const p = t.group.position.clone();
    p.y = 0;
    this.shatter(p, t.art, 1.5, 1.9, FACTION_INFO[t.faction].color);
    this.puff(p, "#a8a094", 7, 1.6);
    this.flash(p.clone().setY(0.5), "#ffffff", 2.6, 260);
    this.ring(p, "#2a2420", 3);
    for (let i = 0; i < 14; i++) this.addSpark(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.4, (Math.random() - 0.5) * 0.8)), new THREE.Vector3(0, 1.2 + Math.random(), 0), "#e8f0ff", 0.06, 1.4, -0.2);
    this.drop(uid);
    for (const s of [0, 1] as Side[]) this.layoutRow(s, 300);
  }

  /** The attack: it lifts and rears back, dashes in, a hit-stop on contact (a star, sparks, the target
   * knocked back, the camera jolted by the blow's weight), then it goes home. Resolves at the impact. */
  attack(from: number, to: number, power = 3): Promise<void> {
    const a = this.objOf(from);
    const b = this.objOf(to);
    if (!a || !b) return Promise.resolve();
    const body = (a.children[0] as THREE.Object3D) ?? a;
    const start = a.position.clone();
    const end = b.position.clone();
    const dir = end.clone().sub(start);
    const flat = dir.clone().setY(0).normalize();
    // contact at the target's edge, not through it
    const reach = Math.max(0.3, Math.hypot(dir.x, dir.z) - (to <= 2 ? 2.15 : 1.85));
    const hit = start.clone().addScaledVector(flat, reach);
    const back = start.clone().addScaledVector(flat, -0.45);
    const tilt = (ang: number) => body.rotation.set(flat.z * ang, 0, -flat.x * ang);
    const fc = from <= 2 ? "#ffd76a" : FACTION_INFO[this.tokens.get(from)?.faction ?? "neutral"].color;
    a.renderOrder = 10;
    return new Promise((res) => {
      void (async () => {
        // rear up
        await this.tween(240, (k) => {
          const e = easeOut(k);
          a.position.lerpVectors(start, back, e);
          a.position.y = e * 1.15;
          a.scale.setScalar(1 + e * 0.14);
          tilt(-0.32 * e);
        });
        await this.wait(60);
        // the dash
        const from2 = a.position.clone();
        await this.tween(150, (k) => {
          const e = easeIn(k);
          a.position.lerpVectors(from2, hit, e);
          a.position.y = 1.15 * (1 - e) + 0.5 * e;
          tilt(-0.32 + 0.75 * e);
          this.addSpark(a.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.2, (Math.random() - 0.5) * 0.8)), new THREE.Vector3(0, 0.4, 0), Math.random() < 0.5 ? fc : "#ffffff", 0.07, 0.35, 0);
        });
        // contact: the blow
        const p = hit.clone().addScaledVector(flat, 0.45);
        p.y = 0.7;
        this.star(p, "#fff2c0", 2.6 + Math.min(2, power * 0.25));
        this.flash(p, "#ffcf80", 2.4, 200);
        this.spark(p, "#ffd27a", 18 + Math.min(30, power * 4), 5 + power * 0.3);
        this.ring(end.clone().setY(0.06), "#ffcf80", 2.6 + power * 0.2);
        this.knock(to, flat, power);
        this.shake(Math.min(0.75, 0.12 + power * 0.06));
        await this.wait(70); // the hit-stop
        res();
        // home
        await this.tween(330, (k) => {
          const e = easeInOut(k);
          a.position.lerpVectors(hit, start, e);
          a.position.y = 0.5 * (1 - e) + Math.sin(e * Math.PI) * 0.3;
          a.scale.setScalar(1.14 - 0.14 * e);
          tilt(0.43 * (1 - e));
        });
        a.position.copy(start);
        a.scale.setScalar(1);
        body.rotation.set(0, 0, 0);
        a.renderOrder = 0;
      })();
    });
  }

  /** Knocked back along dir, then a damped spring home. */
  private knock(uid: number, dir: THREE.Vector3, power: number) {
    const o = this.objOf(uid);
    if (!o) return;
    const body = (o.children[0] as THREE.Object3D) ?? o;
    const d = Math.min(0.75, 0.25 + power * 0.06) * (uid <= 2 ? 0.6 : 1);
    void this.tween(560, (k) => {
      const f = k < 0.12 ? d * easeOut(k / 0.12) : d * Math.exp(-6 * (k - 0.12)) * Math.cos((k - 0.12) * 16);
      body.position.set(dir.x * f, 0, dir.z * f);
      body.rotation.set(dir.z * f * 0.5, 0, -dir.x * f * 0.5);
    }).then(() => {
      body.position.set(0, 0, 0);
      body.rotation.set(0, 0, 0);
    });
  }

  /** Hurt: a red flash on the frame, a tremble, sparks (the heroes jolt the camera on big ones). */
  hurt(uid: number, n: number) {
    const o = this.objOf(uid);
    if (!o) return;
    // the portrait flushes red, then settles back
    const tk = uid <= 2 ? null : this.tokens.get(uid);
    const pm = (tk ? tk.pmat : (this.heroes[uid === 1 ? 0 : 1].portrait.material as THREE.MeshBasicMaterial)) as THREE.MeshBasicMaterial;
    const rest = tk ? tk.pbase : 0.9;
    void this.tween(420, (k) => {
      const e = 1 - easeOut(k);
      pm.color.setRGB(rest + (1.25 - rest) * e, rest * (1 - e * 0.65), rest * (1 - e * 0.7));
    }).then(() => pm.color.setScalar(tk ? tk.pbase : rest));
    const mat = uid <= 2 ? this.heroes[uid === 1 ? 0 : 1].fmat : this.tokens.get(uid)?.fmat;
    void this.tween(360, (k) => {
      if (mat) {
        const e = 1 - k;
        mat.color.setRGB(FRAME_REST + e * 0.9, FRAME_REST * (1 - e * 0.5), FRAME_REST * (1 - e * 0.55));
      }
      o.position.y = Math.max(0, Math.sin(k * Math.PI * 3) * 0.05 * (1 - k));
    }).then(() => {
      if (mat) mat.color.setScalar(FRAME_REST);
      o.position.y = 0;
    });
    const p = o.position.clone();
    p.y = 0.5;
    this.spark(p, "#ff4a3a", 8 + Math.min(24, n * 3), 3.5);
    if (uid <= 2 && n >= 5) this.shake(0.25 + Math.min(0.5, n * 0.04));
  }

  haloPop(uid: number) {
    const t = this.tokens.get(uid);
    if (!t) return;
    const h = t.halo;
    h.visible = true;
    void this.tween(420, (k) => {
      h.scale.setScalar(1 + easeOut(k) * 0.7);
      ((h.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.3 * (1 - k);
    }).then(() => {
      h.visible = false;
      h.scale.setScalar(1);
      ((h.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.12;
    });
    const p = t.group.position.clone();
    p.y = 0.6;
    this.flash(p, "#ffe08a", 3, 300);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      this.addBit(p.clone().add(new THREE.Vector3(Math.cos(a) * 1.0, 0.1, Math.sin(a) * 1.25)), new THREE.Vector3(Math.cos(a) * 3, 2 + Math.random() * 2, Math.sin(a) * 3), "#ffd76a", 0.09, 0.9);
    }
  }

  heal(uid: number) {
    const o = this.objOf(uid);
    if (!o) return;
    this.flash(o.position.clone().setY(0.15), "#7dff9a", 2.6, 500, true);
    for (let i = 0; i < 26; i++) {
      const p = o.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 1.7));
      this.addSpark(p, new THREE.Vector3(0, 1.4 + Math.random() * 1.6, 0), Math.random() < 0.3 ? "#ffffff" : "#8dff9e", 0.06 + Math.random() * 0.05, 1.0, -0.4);
    }
  }
  buff(uid: number) {
    const o = this.objOf(uid);
    if (!o) return;
    this.flash(o.position.clone().setY(0.12), "#ffd76a", 2.4, 450, true);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const p = o.position.clone().add(new THREE.Vector3(Math.cos(a) * 1.0, 0.25, Math.sin(a) * 1.2));
      this.addSpark(p, new THREE.Vector3(-Math.sin(a) * 1.4, 2.0, Math.cos(a) * 1.4), "#ffd76a", 0.08, 0.8, 0);
    }
  }
  frost(uid: number) {
    const o = this.objOf(uid);
    if (!o) return;
    const p = o.position.clone();
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      this.addBit(p.clone().add(new THREE.Vector3(Math.cos(a) * 0.6, 0.3, Math.sin(a) * 0.7)), new THREE.Vector3(Math.cos(a) * 1.5, 3 + Math.random() * 2, Math.sin(a) * 1.5), Math.random() < 0.5 ? "#e8f8ff" : "#9fd8ff", 0.08 + Math.random() * 0.08, 1.0);
    }
    this.flash(p.clone().setY(0.4), "#bfe8ff", 2.4, 360);
  }

  // ---- spells: each family its own look ------------------------------------------------------------------

  /** A spell's or a Mint's effect from `from` to the targets; resolves when it lands. */
  async cast(kind: string, from: number, to: number[]) {
    const src = this.origin(from);
    switch (kind) {
      case "ping":
      case "snare":
        return this.lightning(src, to, kind === "snare" ? "#ffd76a" : "#cfe6ff");
      case "frost":
      case "trap":
        return this.orb(src, to, { core: "#ffffff", glow: "#9fd8ff", trail: ["#e8f8ff", "#9fd8ff"], size: 0.26, rise: -0.6, impact: "shards" });
      case "blast":
        return this.orb(src, to, { core: "#ffffff", glow: "#b48aff", trail: ["#c4b1fc", "#7a4ae0", "#ffffff"], size: 0.42, rise: 0.4, impact: "arcane" });
      case "thorns":
        return this.orb(src, to, { core: "#eaffd8", glow: "#6dbf8a", trail: ["#7ee08a", "#3a8a3a"], size: 0.22, rise: -1, impact: "leaves" });
      case "drain":
        return this.drain(src, to);
      case "doom":
      case "redact":
        return this.vortex(to, kind === "redact" ? "#1a1a1a" : "#5a1030");
      case "halo":
      case "shield":
      case "buff":
      case "turnstile":
        await Promise.all(to.map((u) => this.pillar(this.posOf(u), kind === "shield" ? "#b48aff" : "#ffd76a", 520, 0.75)));
        return;
      case "halving":
        for (const u of to) this.slash(this.posOf(u), "#ffd76a");
        return this.wait(320);
      case "reveal":
        for (const u of to) this.flash(this.posOf(u).setY(0.5), "#ff6b35", 2.5, 300);
        return this.wait(250);
      case "nova":
      case "purge":
      case "storm":
      case "frostnova":
        return this.wave(kind, to);
      case "shot":
        return this.orb(src, to, { core: "#fff2c0", glow: "#ff6b35", trail: ["#ff6b35", "#ffb347", "#fff2c0"], size: 0.22, rise: 1.2, impact: "fire", fast: true });
      default:
        return this.orb(src, to, { core: "#fff2c0", glow: "#ff8a2a", trail: ["#ff6b35", "#ffb347", "#ffd76a"], size: 0.3, rise: 1.4, impact: "fire" });
    }
  }

  private origin(uid: number): THREE.Vector3 {
    const o = this.objOf(uid);
    const p = o ? o.position.clone() : new THREE.Vector3(0, 0, 3.5);
    p.y = 1.0;
    return p;
  }
  private posOf(uid: number): THREE.Vector3 {
    const o = this.objOf(uid);
    return o ? o.position.clone() : new THREE.Vector3();
  }

  private async orb(src: THREE.Vector3, to: number[], o: { core: string; glow: string; trail: string[]; size: number; rise: number; impact: "fire" | "shards" | "arcane" | "leaves"; fast?: boolean }) {
    await Promise.all(
      to.map(async (uid, i) => {
        const dst = this.posOf(uid);
        dst.y = 0.55;
        const g = new THREE.Group();
        const core = new THREE.Mesh(geo("orb-core", () => new THREE.IcosahedronGeometry(1, 1)), new THREE.MeshBasicMaterial({ color: o.core, toneMapped: false }));
        core.scale.setScalar(o.size * 0.55);
        g.add(core);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: o.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        halo.scale.setScalar(o.size * 6);
        g.add(halo);
        g.position.copy(src);
        this.scene.add(g);
        const mid = src.clone().lerp(dst, 0.5);
        mid.y += (o.fast ? 1.2 : 2.4) + i * 0.25;
        const ms = (o.fast ? 300 : 460) + i * 70;
        await this.tween(ms, (k) => {
          const e = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
          const p1 = src.clone().lerp(mid, e),
            p2 = mid.clone().lerp(dst, e);
          g.position.copy(p1.lerp(p2, e));
          core.rotation.set(k * 12, k * 9, 0);
          halo.scale.setScalar(o.size * (5 + Math.sin(k * 40) * 0.8));
          for (let j = 0; j < 2; j++)
            this.addSpark(g.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * o.size, (Math.random() - 0.5) * o.size, (Math.random() - 0.5) * o.size)), new THREE.Vector3((Math.random() - 0.5) * 0.5, o.rise, (Math.random() - 0.5) * 0.5), o.trail[Math.floor(Math.random() * o.trail.length)], 0.05 + Math.random() * 0.06, 0.45, o.rise < 0 ? 2 : -1.5);
        });
        this.scene.remove(g);
        (core.material as THREE.Material).dispose();
        halo.material.dispose();
        this.impact(dst, o.impact, o.glow);
      }),
    );
  }

  private impact(p: THREE.Vector3, kind: "fire" | "shards" | "arcane" | "leaves", color: string) {
    this.flash(p, color, kind === "arcane" ? 4.5 : 3.2, 320);
    this.star(p, "#ffffff", 2.4);
    this.ring(p.clone().setY(0.06), color, kind === "arcane" ? 4 : 2.6);
    if (kind === "fire") {
      this.spark(p, "#ffb347", 30, 5.5);
      for (let i = 0; i < 14; i++) this.addBit(p.clone(), new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5), Math.random() < 0.5 ? "#2a1a10" : "#5a2a10", 0.08 + Math.random() * 0.08, 1);
      this.shake(0.18);
    } else if (kind === "shards") {
      for (let i = 0; i < 26; i++) this.addBit(p.clone(), new THREE.Vector3((Math.random() - 0.5) * 5, 2.5 + Math.random() * 4, (Math.random() - 0.5) * 5), Math.random() < 0.5 ? "#e8f8ff" : "#9fd8ff", 0.08 + Math.random() * 0.1, 1.1);
      this.spark(p, "#ffffff", 16, 4);
    } else if (kind === "leaves") {
      for (let i = 0; i < 22; i++) this.addBit(p.clone(), new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4), Math.random() < 0.5 ? "#5cae48" : "#8fd45a", 0.07 + Math.random() * 0.07, 1.2);
    } else {
      this.spark(p, "#c4b1fc", 40, 6.5);
      this.shake(0.3);
    }
  }

  /** Forked lightning, flickering (Halo2's ping, the snare). */
  private async lightning(src: THREE.Vector3, to: number[], color: string) {
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true });
    const segGeo = geo("bolt-seg", () => new THREE.BoxGeometry(1, 0.07, 0.07));
    for (const uid of to) {
      const dst = this.posOf(uid);
      dst.y = 0.55;
      const g = new THREE.Group();
      this.scene.add(g);
      for (let f = 0; f < 4; f++) {
        g.clear();
        const n = 9;
        let prev = src.clone();
        for (let i = 1; i <= n; i++) {
          const q = src.clone().lerp(dst, i / n);
          if (i < n) q.add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.7));
          const s = new THREE.Mesh(segGeo, mat);
          s.position.copy(prev).lerp(q, 0.5);
          s.scale.x = prev.distanceTo(q);
          s.lookAt(q);
          s.rotateY(Math.PI / 2);
          g.add(s);
          prev = q;
        }
        mat.opacity = f % 2 ? 0.5 : 1;
        if (f === 0) {
          this.flash(dst, color, 2.6, 260);
          this.spark(dst, color, 20, 4.5);
        }
        await this.wait(55);
      }
      this.scene.remove(g);
    }
    mat.dispose();
  }

  /** Life pulled out of the targets and into the caster (Drain spells). */
  private async drain(src: THREE.Vector3, to: number[]) {
    for (const uid of to) {
      const p = this.posOf(uid);
      p.y = 0.6;
      this.flash(p, "#c0203a", 2.4, 300);
      await this.tween(520, () => {
        for (let j = 0; j < 3; j++) {
          const q = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.8));
          const v = src.clone().sub(q).multiplyScalar(1.9);
          this.addSpark(q, v, Math.random() < 0.5 ? "#e0405a" : "#7a1030", 0.08, 0.55, 0);
        }
      });
    }
  }

  /** A dark vortex winding into each target, then a snap (destroy, Redact). */
  private async vortex(to: number[], color: string) {
    await this.tween(480, (k) => {
      for (const uid of to) {
        const p = this.posOf(uid);
        for (let j = 0; j < 3; j++) {
          const a = Math.random() * Math.PI * 2,
            r = 1.6 * (1 - k * 0.5);
          const q = p.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.4 + Math.random() * 0.4, Math.sin(a) * r));
          const v = p.clone().setY(0.5).sub(q).multiplyScalar(2.2).add(new THREE.Vector3(-Math.sin(a) * 2, 0, Math.cos(a) * 2));
          if (Math.random() < 0.5) this.addBit(q, v, "#0a0608", 0.08, 0.45);
          else this.addSpark(q, v, Math.random() < 0.5 ? "#b04adf" : "#ff3a6a", 0.07, 0.45, 0);
        }
      }
    });
    for (const uid of to) {
      const p = this.posOf(uid).setY(0.5);
      this.flash(p, "#7a2a8a", 3, 300);
      this.star(p, "#c4b1fc", 2.2);
    }
    this.shake(0.15);
  }

  /** A gold slash across p (the Halving). */
  private slash(p: THREE.Vector3, color: string) {
    const m = new THREE.Mesh(geo("slash", () => new THREE.PlaneGeometry(1, 0.12).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(p).setY(0.7);
    m.rotation.y = 0.6;
    this.scene.add(m);
    void this.tween(300, (k) => {
      m.scale.set(0.1 + easeOut(k) * 3.2, 1, 1 + k);
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - k * k;
    }).then(() => {
      this.scene.remove(m);
      (m.material as THREE.Material).dispose();
    });
    this.spark(p.clone().setY(0.6), color, 14, 4);
  }

  /** Area spells: a wave over the board and a hit on each target, in the family's colours. */
  private async wave(kind: string, to: number[]) {
    const col = kind === "frostnova" ? "#9fd8ff" : kind === "purge" ? "#b48ad8" : kind === "storm" ? "#c4b1fc" : "#ff8a4a";
    const mid = new THREE.Vector3(0, 0.12, (TABLE.laneZ[0] + TABLE.laneZ[1]) / 2);
    this.ring(mid, col, 24);
    this.flash(mid.clone().setY(0.4), col, 5, 420, true);
    this.shake(0.3);
    if (kind === "storm") {
      for (const uid of to) {
        const p = this.posOf(uid);
        void this.lightning(p.clone().setY(7), [uid], "#e0d4ff");
        await this.wait(70);
      }
      await this.wait(200);
      return;
    }
    await this.wait(160);
    for (const uid of to) {
      const p = this.posOf(uid);
      if (kind === "frostnova") this.frost(uid);
      else if (kind === "purge")
        for (let i = 0; i < 12; i++) this.addSpark(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.3, (Math.random() - 0.5) * 1.4)), new THREE.Vector3(0, 1.5 + Math.random(), 0), Math.random() < 0.5 ? "#e6d6f4" : "#b48ad8", 0.08, 1.0, -0.3);
      else this.impact(p.clone().setY(0.5), "fire", col);
    }
    await this.wait(220);
  }

  /** Secrets: gems by the hero. */
  setSecrets(s: Side, n: number) {
    const list = this.secrets[s];
    while (list.length < n) {
      const m = new THREE.Mesh(geo("secret", () => new THREE.OctahedronGeometry(0.3, 0).scale(1, 1.3, 1)), new THREE.MeshStandardMaterial({ color: "#c4b1fc", emissive: "#7a4ae0", emissiveIntensity: 1.1, metalness: 0.5, roughness: 0.2 }));
      this.scene.add(m);
      list.push(m);
    }
    while (list.length > n) {
      const m = list.pop()!;
      const p = m.position.clone();
      this.scene.remove(m);
      this.spark(p, "#c4b1fc", 20, 3.5);
    }
    list.forEach((m, i) => m.position.set(-1.2 + i * 0.6 - ((n - 1) * 0.6) / 2 + 1.2, 0.9, HERO_Z[s] + (s === 0 ? -1.75 : 1.75)));
  }

  setHero(s: Side, h: Hero) {
    const H = this.heroes[s];
    this.setGem(H.hp, "hp", h.hp, h.hp < h.maxHp ? "#ffb0a8" : "#ffffff");
    H.armor.visible = h.armor > 0;
    if (h.armor > 0) this.setGem(H.armor, "armor", h.armor);
    const atk = h.tmpAtk + (h.weapon?.atk ?? 0);
    H.atk.visible = atk > 0;
    if (atk > 0) this.setGem(H.atk, "atk", atk);
    H.ice.visible = !!h.frozen;
    this.setWeapon(s, h.weapon);
    this.setPower(s, h.powerUsed);
  }

  setWeapon(s: Side, w: Weapon | null) {
    const g = this.weapons[s];
    const was = g.visible;
    g.visible = !!w;
    if (w) {
      this.setGem(g.userData.atk, "atk", w.atk);
      this.setGem(g.userData.dur, "dur", w.dur);
      if (!was) {
        g.position.y = 1.6;
        void this.tween(300, (k) => (g.position.y = 1.6 * (1 - easeIn(k)))).then(() => {
          this.dust(g.position.clone(), 10, false);
          this.puff(g.position.clone(), "#b8a888", 4, 1.4);
        });
      }
    }
  }

  setPower(s: Side, used: boolean) {
    if (this.powerUsed[s] === used) return;
    this.powerUsed[s] = used;
    const pg = this.powers[s];
    const coin = pg.userData.coin as THREE.Group;
    const cost = pg.userData.cost as THREE.Mesh;
    cost.visible = !used;
    const from = coin.rotation.z,
      to = used ? Math.PI : 0;
    void this.tween(460, (k) => {
      coin.rotation.z = from + (to - from) * easeInOut(k);
      coin.position.y = Math.sin(k * Math.PI) * 0.9;
    });
  }

  setMana(s: Side, mana: number, max: number) {
    const row = this.crystals[s];
    row.forEach((m, i) => {
      const on = i < mana;
      const exists = i < Math.max(max, mana);
      m.visible = exists;
      const was = m.material;
      m.material = on ? (i >= max ? CRYSTAL.extra : CRYSTAL.on) : CRYSTAL.off;
      (m.userData.glow as THREE.Sprite).visible = on;
      ((m.userData.glow as THREE.Sprite).material as THREE.SpriteMaterial).color.set(i >= max ? "#7ee08a" : "#ffcf4a");
      // a crystal lighting up: a little pop
      if (on && was === CRYSTAL.off && exists) {
        void this.tween(260, (k) => m.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.35));
      }
    });
    const lab = this.manaLabel[s];
    const mat = lab.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.map = textTex(`${mana}/${max}`, 256, 96, "#ffe39a", "Geist, sans-serif", 70);
    mat.needsUpdate = true;
  }

  setDeck(s: Side, n: number) {
    if (this.deckCount[s] === n) return;
    this.deckCount[s] = n;
    const g = this.decks[s];
    const box = g.userData.box as THREE.Mesh;
    const h = Math.max(0.04, n * 0.035);
    box.scale.y = h;
    box.position.y = h / 2;
    this.setNum(g.userData.n, n);
    (g.userData.n as THREE.Mesh).position.y = h + 0.05;
  }

  /** The rival's hand: backs on a fan at the far edge. */
  setBacks(n: number) {
    while (this.backs.length < n) {
      const m = new THREE.Mesh(geo("back", () => new THREE.PlaneGeometry(1.0, 1.4)), new THREE.MeshBasicMaterial({ map: cardBack(), side: THREE.DoubleSide, color: new THREE.Color(0.82, 0.82, 0.82) }));
      m.castShadow = true;
      m.position.set(9, 0.5, -2.85);
      this.scene.add(m);
      this.backs.push(m);
    }
    while (this.backs.length > n) {
      const m = this.backs.pop()!;
      this.scene.remove(m);
    }
    this.backs.forEach((m, i) => {
      const off = i - (n - 1) / 2;
      const to = new THREE.Vector3(off * 0.62, 0.6 + Math.abs(off) * 0.02, -7.1 + Math.abs(off) * 0.06);
      const from = m.position.clone();
      const r0 = m.rotation.clone();
      void this.tween(320, (k) => {
        m.position.lerpVectors(from, to, easeOut(k));
        m.rotation.set(-Math.PI / 2 + 0.95, r0.y, r0.z + (-off * 0.06 - r0.z) * k);
      });
    });
  }

  setEnd(state: "ready" | "done" | "wait" | "over", label: string) {
    const key = `${state}|${label}`;
    if (this.endState === key) return;
    const prev = this.endState.split("|")[0];
    this.endState = key;
    const top = this.endTop;
    const lab = top.userData.label as THREE.Mesh;
    const lm = lab.material as THREE.MeshStandardMaterial;
    lm.map = endPlaque(state, label);
    lm.emissiveMap = lm.map;
    lm.emissiveIntensity = 0;
    lm.needsUpdate = true;
    (top.material as THREE.MeshStandardMaterial).color.set(state === "wait" || state === "over" ? "#6a645c" : "#ffffff");
    // the plate rises when it's yours
    const y0 = this.endBtn.position.y,
      y1 = state === "wait" || state === "over" ? -0.18 : 0;
    void this.tween(250, (k) => (this.endBtn.position.y = y0 + (y1 - y0) * k));
    // your turn starts: a sweep of light across your side
    if ((state === "ready" || state === "done") && (prev === "wait" || prev === "")) this.sweep();
  }
  pressEnd() {
    const t = this.endTop;
    void this.tween(200, (k) => (t.position.y = 0.42 - Math.sin(k * Math.PI) * 0.18));
  }

  /** A band of light running across your half of the board (your turn begins). */
  private sweep() {
    const mat = new THREE.MeshBasicMaterial({ map: sweepTex(), color: "#ffd98a", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(geo("sweep", () => new THREE.PlaneGeometry(3.2, 9).rotateX(-Math.PI / 2)), mat);
    m.position.set(-11, 0.06, 2.6);
    this.scene.add(m);
    void this.tween(900, (k) => {
      m.position.x = -11 + k * 22;
      mat.opacity = Math.sin(k * Math.PI) * 0.75;
    }).then(() => {
      this.scene.remove(m);
      mat.dispose();
    });
    const hp = this.heroes[0].group.position.clone();
    this.flash(hp.setY(0.2), "#ffd98a", 4.5, 700, true);
  }

  /** Lights: "act" (green, can do something), "target" (red), "hot" (bright red, under the pointer), "source" (gold), "". */
  light(uid: number, state: string) {
    let rmat: THREE.MeshBasicMaterial | undefined;
    if (uid <= 2) rmat = this.heroes[uid === 1 ? 0 : 1]?.rmat;
    else {
      const t = this.tokens.get(uid);
      if (!t) return;
      t.state = state;
      rmat = t.rmat;
    }
    if (!rmat) return;
    rmat.userData.state = state;
    rmat.color.set(state === "act" ? "#7ee08a" : state === "target" ? "#ff5a4a" : state === "hot" ? "#ffb0a0" : state === "source" ? "#ffd76a" : "#000");
    rmat.opacity = state ? 0.9 : 0;
  }
  lightPower(s: Side, on: boolean) {
    const coin = (this.powers[s].userData.coin as THREE.Group).children[0] as THREE.Mesh;
    const mats = coin.material as THREE.MeshBasicMaterial[];
    mats[1].color.setScalar(on || s === 1 ? 0.9 : 0.62);
    ((this.powers[s].userData.ring as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = on ? 0.95 : 0;
  }
  /** A sleeping (just played) minion: a little dimmer, Zs rising. */
  sleep(uid: number, on: boolean) {
    const t = this.tokens.get(uid);
    if (!t) return;
    t.sleeping = on;
    if (!t.veil.visible) t.pmat.color.setScalar(on ? 0.7 : 0.86);
  }

  private hovered = 0;
  /** The minion under the pointer rises a little. */
  hover(uid: number) {
    if (uid === this.hovered) return;
    const lift = (id: number, up: boolean) => {
      const t = this.tokens.get(id);
      if (!t || t.dead) return;
      const b = t.body;
      const y0 = b.position.y,
        s0 = b.scale.x;
      void this.tween(140, (k) => {
        b.position.y = y0 + ((up ? 0.18 : 0) - y0) * k;
        b.scale.setScalar(s0 + ((up ? 1.05 : 1) - s0) * k);
      });
    };
    if (this.hovered) lift(this.hovered, false);
    this.hovered = uid;
    if (uid) lift(uid, true);
  }

  powerUse(s: Side) {
    const p = this.powers[s].position.clone();
    p.y = 0.6;
    this.spark(p, FACTION_INFO[this.factions[s]].color, 22, 3.5);
  }

  heroDeath(s: Side) {
    const h = this.heroes[s];
    this.shatter(h.group.position.clone(), h.art, 2.4, 2.8, "#d9a42a");
    h.group.visible = false;
    this.shake(1.2);
  }

  /** A minion goes back to its owner's hand. */
  async bounce(uid: number) {
    const t = this.tokens.get(uid);
    if (!t) return;
    const from = t.group.position.clone();
    const to = new THREE.Vector3(from.x, 2.5, t.side === 0 ? 7 : -8);
    await this.tween(380, (k) => {
      t.group.position.lerpVectors(from, to, easeIn(k));
      t.group.scale.setScalar(1 - k * 0.6);
    });
    this.drop(uid);
    for (const s of [0, 1] as Side[]) this.layoutRow(s, 260);
  }
  steal(uid: number, side: Side, boards: [Minion[], Minion[]]) {
    const t = this.tokens.get(uid);
    if (t) t.side = side;
    this.rows = [boards[0].map((m) => m.uid), boards[1].map((m) => m.uid)];
    for (const s of [0, 1] as Side[]) this.layoutRow(s, 420);
  }

  /** A gold glint over a minion (its text went off). */
  glint(uid: number) {
    const t = this.tokens.get(uid);
    if (!t) return;
    void this.tween(380, (k) => {
      const e = Math.sin(k * Math.PI);
      t.fmat.color.setRGB(FRAME_REST + e * 0.8, FRAME_REST + e * 0.6, FRAME_REST + e * 0.1);
    }).then(() => t.fmat.color.setScalar(FRAME_REST));
  }

  pokeToy(i: number) {
    return this.map.poke(i);
  }

  // ---- the screen ---------------------------------------------------------------------------------------------

  private objOf(uid: number): THREE.Object3D | null {
    if (uid === 1 || uid === 2) return this.heroes[uid === 1 ? 0 : 1].group;
    return this.tokens.get(uid)?.group ?? null;
  }
  private project(p: THREE.Vector3): XY {
    const v = p.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.W, y: (-v.y * 0.5 + 0.5) * this.H };
  }
  /** Where uid shows on the screen (its middle, a little above the table). */
  screen(uid: number): XY {
    const o = this.objOf(uid);
    if (!o) return { x: this.W / 2, y: this.H / 2 };
    const p = o.position.clone();
    p.y += 0.35;
    return this.project(p);
  }
  screenOf(kind: "power" | "deck" | "end" | "hero" | "weapon" | "mana", s: Side = 0): XY {
    const o = kind === "power" ? this.powers[s] : kind === "deck" ? this.decks[s] : kind === "end" ? this.endBtn : kind === "weapon" ? this.weapons[s] : kind === "mana" ? this.crystals[s][0] : this.heroes[s].group;
    const p = new THREE.Vector3();
    o.getWorldPosition(p);
    return this.project(p);
  }
  /** Screen size of a minion token (px wide), for the hand's cards to match. */
  tokenPx(): number {
    const a = this.project(new THREE.Vector3(-0.78, 0, TABLE.laneZ[0]));
    const b = this.project(new THREE.Vector3(0.78, 0, TABLE.laneZ[0]));
    return Math.abs(b.x - a.x);
  }
  /** The screen y of my lane (for dropping cards). */
  laneY(s: Side): number {
    return this.project(new THREE.Vector3(0, 0, TABLE.laneZ[s])).y;
  }

  pick(x: number, y: number): Pick {
    const ndc = new THREE.Vector2((x / this.W) * 2 - 1, -(y / this.H) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.pickables, false);
    for (const h of hits) {
      const p = h.object.userData.pick as Pick | undefined;
      if (p) return p;
      if (h.object.userData.toy !== undefined) return { kind: "toy", toy: h.object.userData.toy };
    }
    return null;
  }

  // ---- motion -----------------------------------------------------------------------------------------------

  tween(ms: number, f: (k: number) => void): Promise<void> {
    return new Promise((done) => {
      if (ms <= 0) {
        f(1);
        return done();
      }
      this.tweens.push({ t: 0, dur: ms / 1000, f, done });
    });
  }
  wait(ms: number) {
    return this.tween(ms, () => {});
  }
  shake(a: number) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  private frame(dt: number) {
    this.time += dt;
    const t = this.time;
    // tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.f(k);
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.done();
      }
    }
    this.map.update(dt, t);
    // living things: halo rings turning, the highlight rings breathing, secrets bobbing, the veil scrolling
    for (const tk of this.tokens.values()) {
      if (tk.halo.visible) tk.halo.children[1].rotation.y = t * 0.8;
      if (tk.rmat.opacity > 0) tk.rmat.opacity = 0.62 + Math.sin(t * 5) * 0.3;
    }
    for (const h of this.heroes) if (h.rmat.opacity > 0) h.rmat.opacity = 0.62 + Math.sin(t * 5) * 0.3;
    const sm = smokeTex();
    sm.offset.set(t * 0.04, -t * 0.07);
    HALO_MAT.uniforms.time.value = t;
    this.secrets.forEach((list) => list.forEach((m, i) => ((m.rotation.y = t * 1.4 + i), (m.position.y = 0.9 + Math.sin(t * 2 + i) * 0.1))));
    for (const row of this.crystals) row.forEach((m, i) => (m.rotation.y = t * 0.6 + i * 0.4));
    const plaque = (this.endTop.userData.label as THREE.Mesh).material as THREE.MeshStandardMaterial;
    plaque.emissiveIntensity = this.endState.startsWith("done") ? 0.25 + Math.sin(t * 4) * 0.2 : this.endState.startsWith("ready") ? 0.06 + Math.sin(t * 2) * 0.04 : 0;
    this.particles(dt);
    // the sleepers' Zs, and the ghost's bob
    for (const tk of this.tokens.values()) {
      if (!tk.sleeping || tk.dead) continue;
      tk.zzz = (tk.zzz ?? Math.random()) - dt;
      if (tk.zzz <= 0) {
        tk.zzz = 1.1;
        const z = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex(), transparent: true, depthWrite: false }));
        const p0 = tk.group.position.clone().add(new THREE.Vector3(0.45, 0.7, -0.5));
        z.position.copy(p0);
        this.scene.add(z);
        void this.tween(1500, (k) => {
          z.position.set(p0.x + Math.sin(k * 6) * 0.15 + k * 0.3, p0.y + k * 1.1, p0.z - k * 0.2);
          z.scale.setScalar(0.25 + k * 0.25);
          z.material.opacity = k < 0.2 ? k * 5 : 1 - (k - 0.2) / 0.8;
        }).then(() => {
          this.scene.remove(z);
          z.material.dispose();
        });
      }
    }
    if (this.ghostTok) {
      this.ghostTok.body.position.y = 0.12 + Math.sin(t * 4) * 0.06;
      this.ghostTok.rmat.opacity = 0.55 + Math.sin(t * 6) * 0.3;
    }
    // rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.dur;
      r.m.scale.setScalar(0.15 + easeOut(k) * r.size * 0.5);
      (r.m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (1 - k);
      if (k >= 1) {
        this.scene.remove(r.m);
        (r.m.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
    // camera shake
    this.camera.position.copy(this.camBase);
    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt * 0.6;
      this.shakeAmt *= Math.pow(0.02, dt);
    }
    this.camera.lookAt(this.camLook);
    // a slow breath of the camera, so the scene is alive
    this.camera.position.x += Math.sin(t * 0.13) * 0.08;
    this.composer.render(dt);
  }

  // ---- particles: voxel debris (lit) and sparks (glowing) ------------------------------------------------------

  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private sv = new THREE.Vector3();

  private addBit(p: THREE.Vector3, v: THREE.Vector3, color: string | THREE.Color, s: number, life: number) {
    if (this.bits.length >= 900) this.bits.shift();
    const b = { p, v, r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, 0), w: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 0), s, life, max: life, grav: 14, c: new THREE.Color(color) };
    this.bits.push(b as Bit);
  }
  private addSpark(p: THREE.Vector3, v: THREE.Vector3, color: string, s: number, life: number, grav = 4) {
    if (this.sparkBits.length >= 1400) this.sparkBits.shift();
    this.sparkBits.push({ p, v, r: new THREE.Vector3(), w: new THREE.Vector3(), s: s * 2.6, life, max: life, grav, c: new THREE.Color(color) });
  }
  spark(p: THREE.Vector3, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        u = Math.random();
      const v = new THREE.Vector3(Math.cos(a) * speed * u, (0.6 + Math.random()) * speed * 0.7, Math.sin(a) * speed * u);
      this.addSpark(p.clone(), v, Math.random() < 0.25 ? "#ffffff" : color, 0.06 + Math.random() * 0.08, 0.5 + Math.random() * 0.5);
    }
  }
  /** Soft smoke puffs (dust of a landing, a death's breath). */
  private puff(p: THREE.Vector3, color: string, n: number, size: number) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: puffTex(), color, transparent: true, depthWrite: false, opacity: 0 });
      const s = new THREE.Sprite(mat);
      const a = (i / n) * Math.PI * 2 + Math.random();
      const r0 = 0.3 + Math.random() * 0.3;
      const p0 = new THREE.Vector3(p.x + Math.cos(a) * r0, 0.25 + Math.random() * 0.15, p.z + Math.sin(a) * r0);
      const dir = new THREE.Vector3(Math.cos(a), 0.15, Math.sin(a));
      s.position.copy(p0);
      mat.rotation = Math.random() * Math.PI;
      this.scene.add(s);
      const life = 600 + Math.random() * 400;
      void this.tween(life, (k) => {
        const e = easeOut(k);
        s.position.copy(p0).addScaledVector(dir, e * size * 0.8);
        s.position.y += e * 0.35;
        s.scale.setScalar(size * (0.35 + e * 0.8));
        mat.opacity = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * 0.55;
        mat.rotation += 0.01;
      }).then(() => {
        this.scene.remove(s);
        mat.dispose();
      });
    }
  }
  private dust(p: THREE.Vector3, n: number, big: boolean) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (big ? 3.5 : 2.2) * (0.5 + Math.random());
      this.addBit(new THREE.Vector3(p.x + Math.cos(a) * 0.8, 0.1, p.z + Math.sin(a) * 0.9), new THREE.Vector3(Math.cos(a) * sp, 1 + Math.random() * 2, Math.sin(a) * sp), ["#8a7f6a", "#6a6050", "#a89c84"][i % 3], 0.07 + Math.random() * 0.08, 0.6 + Math.random() * 0.4);
    }
  }
  /** Burst a medallion into its zkSNARK's own pixels (and frame bits). */
  private shatter(p: THREE.Vector3, art: number, w: number, d: number, frame: string) {
    void snarkPixels(art).then((cells) => {
      const n = 110;
      for (let i = 0; i < n; i++) {
        let c: string | THREE.Color = frame;
        if (cells && i % 4 !== 0) {
          for (let tries = 0; tries < 8; tries++) {
            const v = cells[Math.floor(Math.random() * cells.length)];
            if (v >= 0) {
              c = new THREE.Color(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255).convertSRGBToLinear();
              break;
            }
          }
        }
        const q = new THREE.Vector3(p.x + (Math.random() - 0.5) * w, 0.35 + Math.random() * 0.3, p.z + (Math.random() - 0.5) * d);
        const v = q.clone().sub(p).setY(0).normalize().multiplyScalar(2 + Math.random() * 4);
        v.y = 3 + Math.random() * 5;
        this.addBit(q, v, c, 0.1 + Math.random() * 0.12, 1.4 + Math.random() * 0.8);
      }
    });
    this.spark(p.clone().setY(0.6), "#ffffff", 30, 5);
  }
  private ring(p: THREE.Vector3, color: string, size: number) {
    const m = new THREE.Mesh(geo("ring-soft", () => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: ringTex(), color, transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(p);
    m.position.y = Math.max(0.08, p.y);
    this.scene.add(m);
    this.rings.push({ m, t: 0, dur: 0.6, size });
  }

  private particles(dt: number) {
    let n = 0;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i] as Bit & { c: THREE.Color };
      b.life -= dt;
      if (b.life <= 0) {
        this.bits.splice(i, 1);
        continue;
      }
      b.v.y -= b.grav * dt;
      b.p.addScaledVector(b.v, dt);
      if (b.p.y < b.s / 2 + 0.01) {
        b.p.y = b.s / 2 + 0.01;
        b.v.y *= -0.35;
        b.v.x *= 0.7;
        b.v.z *= 0.7;
        b.w.multiplyScalar(0.6);
      }
      b.r.addScaledVector(b.w, dt);
      const k = Math.min(1, b.life / 0.4);
      this.q.setFromEuler(this.e.set(b.r.x, b.r.y, 0));
      this.m4.compose(b.p, this.q, this.sv.setScalar(b.s * k));
      this.debris.setMatrixAt(n, this.m4);
      this.debris.setColorAt(n, b.c);
      n++;
    }
    this.debris.count = n;
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
    // the sparks: soft points (position, colour by life, size, alpha)
    const geo2 = this.sparkPts.geometry;
    const P = geo2.getAttribute("position") as THREE.BufferAttribute;
    const C = geo2.getAttribute("pcolor") as THREE.BufferAttribute;
    const Sz = geo2.getAttribute("psize") as THREE.BufferAttribute;
    const A = geo2.getAttribute("palpha") as THREE.BufferAttribute;
    n = 0;
    for (let i = this.sparkBits.length - 1; i >= 0; i--) {
      const b = this.sparkBits[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.sparkBits.splice(i, 1);
        continue;
      }
      b.v.y -= b.grav * dt;
      b.v.multiplyScalar(Math.pow(0.3, dt));
      b.p.addScaledVector(b.v, dt);
      const k = b.life / b.max;
      P.setXYZ(n, b.p.x, b.p.y, b.p.z);
      const hot = 1 + k * 1.2;
      C.setXYZ(n, b.c.r * hot, b.c.g * hot, b.c.b * hot);
      Sz.setX(n, b.s * (0.35 + k * 0.65));
      A.setX(n, Math.min(1, k * 1.6));
      n++;
    }
    geo2.setDrawRange(0, n);
    P.needsUpdate = C.needsUpdate = Sz.needsUpdate = A.needsUpdate = true;
  }

}

/** A flat stepped ring (outline of a stepped rectangle), `pad` wide outside. */
function ringGeo(w: number, h: number, s: number, pad: number, iw?: number, ih?: number): THREE.BufferGeometry {
  const outer = stepShape(w + pad * 2, h + pad * 2, s + pad * 0.5);
  const hole = stepShape(iw ?? w, ih ?? h, s);
  outer.holes.push(new THREE.Path(hole.getPoints()));
  const g = new THREE.ShapeGeometry(outer);
  g.rotateX(-Math.PI / 2);
  if (iw) {
    const e = new THREE.ExtrudeGeometry(outer, { depth: 0.04, bevelEnabled: false });
    e.rotateX(-Math.PI / 2);
    return e;
  }
  return g;
}

