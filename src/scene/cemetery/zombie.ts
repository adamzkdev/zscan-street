import * as THREE from "three";
import { GRID, POSE } from "../sprites";
import { blobTexture } from "../textures";
import { sayAt } from "../speech";

/**
 * Zombie zkSNARKs: the real portrait, zombified cell by cell on its own 26×26 grid (grey-green skin,
 * clothes faded and dirty, a ragged hem, rips), with stiff legs that drag and both arms held out in
 * front. Four walk frames in one strip (a lurch, a drag), the bust sways; eyes that glow at night
 * (their own little emissive layer, bloomed). Below `clipY` nothing is drawn: rising out of a grave
 * they come up through the ground.
 */

const BODY = 1.75;
const PX = BODY / GRID;
const FW = POSE.w,
  FH = POSE.h;
const FRAMES = 4;
/** Portrait cell (c, r) → frame pixel. */
const OX = -POSE.x0,
  OY = -POSE.y0;
/** The eyes, on the portrait grid (most zkSNARKs look out of cells 14–15 and 18–19 of row 13–14). */
const EYES: [number, number][] = [
  [15, 14],
  [19, 14],
];

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function shade(h: string, k: number) {
  const [r, g, b] = rgb(h);
  return hex(r * k, g * k, b * k);
}
function rnd(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZSKIN = ["#8fa878", "#7f9a6a", "#9ab884", "#76905f"];

/** Turn the portrait (a 520 px canvas, background keyed out) into zombie cells: 26×26 colours or null. */
function zombify(img: CanvasImageSource & { width: number; height: number }, skin: string, id: number) {
  const n = GRID;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  // nearest sampling at the cells' centres
  const cell = img.width / n;
  const big = document.createElement("canvas");
  big.width = img.width;
  big.height = img.height;
  const bctx = big.getContext("2d", { willReadFrequently: true })!;
  bctx.drawImage(img, 0, 0);
  const data = bctx.getImageData(0, 0, img.width, img.height).data;
  const [sr, sg, sb] = rgb(skin);
  const r = rnd(id * 977 + 13);
  const out: (string | null)[][] = [];
  for (let y = 0; y < n; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < n; x++) {
      const i = (Math.floor((y + 0.5) * cell) * img.width + Math.floor((x + 0.5) * cell)) * 4;
      if (data[i + 3] < 128) {
        row.push(null);
        continue;
      }
      const R = data[i],
        G = data[i + 1],
        B = data[i + 2];
      const lum = 0.3 * R + 0.59 * G + 0.11 * B;
      const isSkin = Math.abs(R - sr) + Math.abs(G - sg) + Math.abs(B - sb) < 70 && x > 8;
      if (isSkin) {
        // grey-green skin, keeping the portrait's own shading
        const z = rgb(ZSKIN[Math.floor(r() * ZSKIN.length)]);
        const k = 0.55 + (lum / 255) * 0.6;
        row.push(hex(z[0] * k, z[1] * k, z[2] * k));
      } else {
        // clothes and hair: faded, greyed, a little green and dirty
        const g = lum * 0.85;
        const mix = 0.55;
        row.push(hex((R * (1 - mix) + g * mix) * 0.82, (G * (1 - mix) + g * mix) * 0.86 + 6, (B * (1 - mix) + g * mix) * 0.78));
      }
    }
    out.push(row);
  }
  // a ragged hem: the bottom rows of the bust eaten away here and there, rips and dirt above
  for (let x = 0; x < n; x++) {
    for (let y = n - 1; y >= n - 4; y--) {
      if (!out[y][x]) continue;
      if (r() < (y === n - 1 ? 0.55 : y === n - 2 ? 0.3 : 0.12)) out[y][x] = null;
      else break;
    }
  }
  for (let k = 0; k < 9; k++) {
    const x = 9 + Math.floor(r() * 14),
      y = 18 + Math.floor(r() * 7);
    if (!out[y]?.[x]) continue;
    out[y][x] = r() < 0.5 ? "#1a1612" : r() < 0.5 ? "#4a3a2a" : ZSKIN[1];
    if (r() < 0.5 && out[y][x + 1]) out[y][x + 1] = "#2a221a";
  }
  // a stitched scar across a cheek
  const sy = 16 + Math.floor(r() * 2);
  for (let x = 16; x < 20; x++) if (out[sy][x]) out[sy][x] = x % 2 ? "#3a2a2a" : shade(out[sy][x]!, 0.7);
  // the eyes: pale and empty by day (they glow at night)
  for (const [ex, ey] of EYES) if (out[ey][ex]) out[ey][ex] = "#d8f0a0";
  return out;
}

/** The cloth colour at the bottom of the bust (for the sleeves and trousers). */
function clothOf(cells: (string | null)[][]) {
  let R = 0,
    G = 0,
    B = 0,
    k = 0;
  for (let y = GRID - 6; y < GRID - 2; y++)
    for (let x = 13; x < 21; x++) {
      const c = cells[y][x];
      if (!c) continue;
      const [r, g, b] = rgb(c);
      R += r;
      G += g;
      B += b;
      k++;
    }
  return k ? hex(R / k, G / k, B / k) : "#4a4a52";
}

/** The four walk frames side by side: legs (one dragging), bust, both arms held out. */
function framesTexture(cells: (string | null)[][], id: number) {
  const c = document.createElement("canvas");
  c.width = FW * FRAMES;
  c.height = FH;
  const ctx = c.getContext("2d")!;
  const cloth = clothOf(cells);
  const trouser = shade(cloth, 0.6);
  const skin = ZSKIN[id % ZSKIN.length];
  const r = rnd(id * 31 + 7);
  const bareFoot = r() < 0.5;
  const px = (f: number, x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(f * FW + x, y, w, h);
  };
  for (let f = 0; f < FRAMES; f++) {
    // legs: on the portrait's columns 10–14 and 16–20, rows 24–32; one steps, the other drags
    const step = f === 0 ? -1 : f === 2 ? 1 : 0;
    for (const [lx, side] of [
      [10, -1],
      [16, 1],
    ] as const) {
      const fwd = step * side;
      const x = OX + lx + fwd;
      const lift = fwd > 0 ? 1 : 0;
      const y0 = OY + 24 - lift;
      px(f, x, y0, 5, 5, trouser);
      px(f, x, y0, 1, 5, shade(trouser, 0.7));
      // torn trouser legs: a jagged cuff, green shin showing
      px(f, x + 1, y0 + 5, 3, 1, skin);
      px(f, x, y0 + 5, 1, 1, shade(trouser, 0.55));
      px(f, x + 4, y0 + 5, 1, 1, shade(trouser, 0.55));
      // feet (the dragging one tips its toe down), one bare
      const bare = bareFoot && side > 0;
      const foot = bare ? shade(skin, 0.8) : "#1d1b24";
      if (fwd < 0) {
        px(f, x + 1, y0 + 6, 4, 1, foot);
        px(f, x + 3, y0 + 7, 3, 1, foot);
      } else {
        px(f, x, y0 + 6, 5, 2, foot);
        px(f, x + 5, y0 + 7, 1, 1, foot);
        if (!bare) px(f, x + 1, y0 + 6, 2, 1, "#4a4656");
      }
    }
    // the far arm, behind the bust, a row higher, a shade darker
    const bob = f === 1 ? -1 : f === 3 ? 1 : 0;
    const arm = (y: number, x0: number, len: number, sleeve: string, hand: string) => {
      px(f, x0, y, len, 2, sleeve);
      px(f, x0, y + 2, len, 1, shade(sleeve, 0.6));
      // ragged sleeve end, the forearm bare
      px(f, x0 + len - 1, y + 2, 1, 1, sleeve);
      px(f, x0 + len, y, 4, 2, hand);
      px(f, x0 + len, y + 2, 3, 1, shade(hand, 0.75));
      // fingers, reaching
      px(f, x0 + len + 4, y, 2, 1, hand);
      px(f, x0 + len + 4, y + 1, 1, 1, shade(hand, 0.85));
    };
    arm(OY + 17 + bob, OX + 18, 7, shade(cloth, 0.7), shade(skin, 0.8));
    // the bust
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        const col = cells[y][x];
        if (col) px(f, OX + x, OY + y, 1, 1, col);
      }
    // the near arm over everything
    arm(OY + 19 - bob, OX + 17, 8, cloth, skin);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.repeat.set(1 / FRAMES, 1);
  return t;
}

/** The eyes' glow layer (shared): two pixels on a transparent frame. */
let eyesTex: THREE.Texture | null = null;
function eyesTexture() {
  if (eyesTex) return eyesTex;
  const c = document.createElement("canvas");
  c.width = FW;
  c.height = FH;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  for (const [x, y] of EYES) ctx.fillRect(OX + x, OY + y, 1, 1);
  eyesTex = new THREE.CanvasTexture(c);
  eyesTex.magFilter = THREE.NearestFilter;
  eyesTex.minFilter = THREE.NearestFilter;
  eyesTex.generateMipmaps = false;
  return eyesTex;
}

/** The plane of one frame, laid on the portrait grid (row 32 = the ground). */
const GEO = new THREE.PlaneGeometry(FW * PX, FH * PX).translate((POSE.x0 + FW / 2 - GRID / 2) * PX, (32 - POSE.y0 - FH / 2) * PX, 0);
const SHADOW_GEO = new THREE.PlaneGeometry(1.1, 0.55).rotateX(-Math.PI / 2);
let shadowMat: THREE.MeshBasicMaterial | null = null;
let eyesMat: THREE.MeshBasicMaterial | null = null;

/** Drawn only above a world height: the ground they climb out of hides the rest. */
function clipped(mat: THREE.MeshBasicMaterial, clipY: { value: number }) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.clipY = clipY;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vWy;").replace("#include <project_vertex>", "#include <project_vertex>\nvWy = (modelMatrix * vec4(transformed, 1.0)).y;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vWy;\nuniform float clipY;").replace("void main() {", "void main() {\n  if (vWy < clipY) discard;");
  };
  mat.customProgramCacheKey = () => "zombie-clip";
  return mat;
}

export const ZOMBIE_LINES = [
  "Braaains... I mean, private keys...",
  "Seeeed phraaase...",
  "Must... find... my 24 words...",
  "Uuurgh... who reused this address?",
  "Viewing keyyys...",
  "Everyone... can see... my balance...",
  "Not your keys... not your... braaains...",
  "Shiiield meee...",
  "Mmmempool...",
  "The Sprout pool... is closed... uuurgh",
  "Did I back it up... on paper?",
  "Spend... my... dust...",
  "Zaaats...",
  "Hodl... hodl... hoooodl...",
  "Fee too low... forever...",
  "Wrong chaaain...",
  "Grrr... transparent...",
  "Password123... password123...",
];

export class Zombie {
  readonly root = new THREE.Group();
  readonly visual = new THREE.Group();
  private body: THREE.Mesh;
  private eyes: THREE.Mesh;
  private shadow: THREE.Mesh;
  private tex: THREE.Texture;
  private mat: THREE.MeshBasicMaterial;
  readonly clipY = { value: -100 };
  private facing = 1;
  private phase = Math.random() * 10;
  private frame = -1;
  path: THREE.Vector3[] = [];
  speed = 0.45;
  /** Seconds standing still (swaying) before the next walk. */
  idle = 0;
  /** What it is up to (the cemetery runs it). */
  state: "buried" | "rising" | "out" | "sinking" = "buried";
  home = -1;
  stateT = 0;
  lifeLeft = 0;
  sayCool = 4 + Math.random() * 8;
  /** Look at this point while standing (the walker on foot). */
  look: THREE.Vector3 | null = null;

  constructor(
    readonly id: number,
    img: CanvasImageSource & { width: number; height: number },
    skin: string,
  ) {
    this.tex = framesTexture(zombify(img, skin, id), id);
    this.mat = clipped(new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, alphaTest: 0.5 }), this.clipY);
    this.body = new THREE.Mesh(GEO, this.mat);
    eyesMat ??= new THREE.MeshBasicMaterial({ map: eyesTexture(), transparent: true, alphaTest: 0.5, color: new THREE.Color(2.2, 4, 1.2), toneMapped: false, depthWrite: false });
    this.eyes = new THREE.Mesh(GEO, eyesMat);
    this.eyes.position.z = 0.012;
    this.eyes.visible = false;
    this.body.add(this.eyes);
    this.visual.add(this.body);
    this.root.add(this.visual);
    shadowMat ??= new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
    this.shadow = new THREE.Mesh(SHADOW_GEO, shadowMat);
    this.shadow.position.set(0.15, 0.02, 0);
    this.root.add(this.shadow);
    this.root.visible = false;
  }

  setNight(on: boolean) {
    this.eyes.visible = on;
  }

  say(text: string, seconds = 3.2) {
    sayAt(this.root, text, "talk", 2.2, seconds);
  }

  get walking() {
    return this.path.length > 0;
  }

  /** `near`: worth animating (someone close enough to see it move). */
  update(dt: number, camQuat: THREE.Quaternion, camRight: THREE.Vector3, near: boolean, groundAt: (x: number, z: number) => number) {
    const pos = this.root.position;
    let moving = false;
    if (this.path.length && this.state === "out") {
      const tgt = this.path[0];
      const dx = tgt.x - pos.x,
        dz = tgt.z - pos.z;
      const d = Math.hypot(dx, dz);
      // a lurch, then a drag: speed pulses with the step
      const pulse = Math.floor((this.phase / Math.PI) % FRAMES) % 2 === 0 ? 1.25 : 0.45;
      const step = this.speed * pulse * dt;
      if (d <= step) {
        pos.x = tgt.x;
        pos.z = tgt.z;
        this.path.shift();
      } else {
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
        const side = dx * camRight.x + dz * camRight.z;
        if (Math.abs(side) > 1e-3) this.facing = side >= 0 ? 1 : -1;
      }
      pos.y = groundAt(pos.x, pos.z);
      moving = true;
    } else if (this.look && this.state === "out") {
      const side = (this.look.x - pos.x) * camRight.x + (this.look.z - pos.z) * camRight.z;
      if (Math.abs(side) > 0.05) this.facing = side >= 0 ? 1 : -1;
    }
    if (!near && this.state === "out") {
      this.visual.quaternion.copy(camQuat);
      this.visual.scale.set(this.facing, 1, 1);
      return;
    }
    this.phase += dt * (moving ? 5.5 : 1.6);
    const p = this.phase;
    // frames: lurch (0), drag (1), lurch (2), drag (3)
    const f = moving ? Math.floor((p / Math.PI) % FRAMES) : Math.sin(p) > 0.6 ? 1 : 3;
    if (f !== this.frame) {
      this.frame = f;
      this.tex.offset.x = f / FRAMES;
    }
    // the sway: a stiff tilt from side to side, the head lolling, a pixel's bob
    const sway = moving ? Math.sin((p * Math.PI) / (2 * Math.PI)) * 0.13 : Math.sin(p * 0.7) * 0.06;
    this.body.rotation.z = sway;
    this.body.position.y = Math.round(Math.abs(Math.sin(p * 0.5)) * 1.4) * PX * (moving ? 1 : 0.5);
    this.visual.quaternion.copy(camQuat);
    this.visual.scale.set(this.facing, 1, 1);
    this.shadow.visible = this.state === "out" && near;
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.tex.dispose();
    this.mat.dispose();
  }
}
