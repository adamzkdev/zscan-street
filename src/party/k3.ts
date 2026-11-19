/**
 * ZK PARTY in 3D: what every 3D mini-game builds with. The players are the city's own snarks
 * (scene/monkey.ts: the visitor's zkSNARK and the rivals', animated: run, jump, hit, celebrate),
 * lit with the same flat cel steps as the city's voxels, with a blob shadow and a floating marker
 * in their seat's colour.
 *
 *   const w = world({ sky: ["#6fc3ff", "#d9f1ff"] });   // scene, camera, sun
 *   const a = new Avatar(w.scene, player);              // a zkSNARK at a.pos, facing a.yaw
 *   a.pos.x += …; a.physics(dt, floorY | null); a.sync(dt);   // every frame
 *   block("#ffd23f", 2, 1, 2, x, y, z, parent);         // a toon box (shared unit geometry)
 *   const fx = new Fx3(w.scene); fx.burst(at, 30, SEAT); fx.update(dt);
 *   const cam = new CamRig(w.camera); cam.to(eye, at, dt); cam.apply(dt);
 *   toScreen(v, camera) → the 960×540 HUD spot of a 3D point; tag(g, p, x, y), corners(g, …), clock(g, s)
 *   disposeScene(w.scene) in the game's dispose().
 *
 * The stage (host.ts) draws `view()` with one WebGL renderer under the 2D HUD canvas. Snarks face
 * +z at yaw 0: a yaw's direction is (sin yaw, cos yaw) on (x, z).
 */
import * as THREE from "three";
import { makeSnarkBody, type SnarkBody } from "../scene/snarkbody";
import { FONT, H, HUD, VIEW, W, clamp, fpx, isLocal, rr, text, zoom, type Player, type View3 } from "./kit";
import { Det } from "./net/det";
import { INK, badge, crown, numeral, tint, toyLetters } from "./hud";
import { T } from "../i18n/lang";
import { LEGACY, glowWeight, markGlow, type PostLook } from "./post";

// ---- materials and shapes ------------------------------------------------------------------------

let steps: THREE.DataTexture | null = null;
/** The city's cel steps (three flat bands of light). */
export function toonSteps() {
  if (steps) return steps;
  steps = new THREE.DataTexture(new Uint8Array([105, 105, 105, 255, 186, 186, 186, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  steps.minFilter = steps.magFilter = THREE.NearestFilter;
  steps.generateMipmaps = false;
  steps.needsUpdate = true;
  return steps;
}

const SHARED = { shared: true };
const toons = new Map<string, THREE.MeshToonMaterial>();
/** A shared cel material of this colour (never dispose it: disposeScene leaves it). */
export function toon(color: THREE.ColorRepresentation, emissive: THREE.ColorRepresentation = 0x000000): THREE.MeshToonMaterial {
  const k = `${new THREE.Color(color).getHexString()}:${new THREE.Color(emissive).getHexString()}`;
  let m = toons.get(k);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, emissive, gradientMap: toonSteps() });
    m.userData = SHARED;
    // (a bright emissive is a light: it feeds the stage's bloom, post.ts; the usual dim lift does not)
    const e = new THREE.Color(emissive);
    const el = 0.2126 * e.r + 0.7152 * e.g + 0.0722 * e.b;
    if (el > 0.2) markGlow(m, Math.min(1, (el - 0.2) * 2.5));
    toons.set(k, m);
  }
  return m;
}
const basics = new Map<string, THREE.MeshBasicMaterial>();
/** A shared unlit material (lights, screens, glows). */
export function glow(color: THREE.ColorRepresentation, opacity = 1, additive = false): THREE.MeshBasicMaterial {
  const k = `${new THREE.Color(color).getHexString()}:${opacity}:${additive}`;
  let m = basics.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1 || additive, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !(opacity < 1 || additive) });
    m.userData = SHARED;
    // (an opaque glow is a light for the bloom: fully when coloured, a little when plain white, post.ts)
    markGlow(m, glowWeight(color));
    basics.set(k, m);
  }
  return m;
}

/** Shared unit shapes (scale them; never dispose them). */
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  ball: new THREE.SphereGeometry(0.5, 28, 18),
  cone: new THREE.ConeGeometry(0.5, 1, 4),
  plane: new THREE.PlaneGeometry(1, 1),
  disc: new THREE.CircleGeometry(0.5, 40),
  ring: new THREE.RingGeometry(0.4, 0.5, 40),
};
for (const g of Object.values(GEO)) g.userData = SHARED;

/** A toon box `w × h × d` centred at (x, y, z), into `parent` when given. */
export function block(color: THREE.ColorRepresentation, w: number, h: number, d: number, x = 0, y = 0, z = 0, parent?: THREE.Object3D, mat?: THREE.Material) {
  const m = new THREE.Mesh(GEO.box, mat ?? toon(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}

/** An ink outline round a mesh made by block() or of a GEO shape (an inverted hull `t` thick): the cartoon edge. */
export function outline(box: THREE.Mesh, t = 0.05, color: THREE.ColorRepresentation = 0x15101f) {
  const o = new THREE.Mesh(box.geometry, inkMat(color));
  o.scale.set(1 + (2 * t) / box.scale.x, 1 + (2 * t) / box.scale.y, 1 + (2 * t) / box.scale.z);
  o.raycast = () => {};
  box.add(o);
  return o;
}
const inks = new Map<string, THREE.MeshBasicMaterial>();
function inkMat(c: THREE.ColorRepresentation) {
  const k = new THREE.Color(c).getHexString();
  let m = inks.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide });
    m.userData = SHARED;
    inks.set(k, m);
  }
  return m;
}

/** A canvas texture drawn once (sRGB). */
export function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  paint(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A flat label (a sign, a number on a step): text on a plane, `h` metres tall. */
export function label(s: string, h: number, color = "#fff", bg = "", font = 900) {
  const tex = canvasTex(512, 128, (g) => {
    if (bg) {
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(4, 4, 504, 120, 28);
      g.fill();
    }
    g.font = `${font} 92px ${FONT}`;
    // (a long line shrinks to fit)
    const fit = Math.min(92, (92 * 470) / Math.max(1, g.measureText(s).width));
    g.font = `${font} ${fit}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.fillText(s, 256, 68);
  });
  const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.scale.set(h * 4, h, 1);
  return m;
}

let qTexC: THREE.Texture | null = null;
/** The golden Z-Block's face. */
export function qTex() {
  return (qTexC ??= canvasTex(128, 128, (g) => {
    g.fillStyle = "#ffcf2e";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#ffe789";
    g.fillRect(0, 0, 128, 10);
    g.fillRect(0, 0, 10, 128);
    g.fillStyle = "#c98a00";
    g.fillRect(0, 118, 128, 10);
    g.fillRect(118, 0, 10, 128);
    for (const [x, y] of [
      [16, 16],
      [104, 16],
      [16, 104],
      [104, 104],
    ]) {
      g.fillStyle = "#9a6200";
      g.fillRect(x - 5, y - 5, 10, 10);
    }
    g.font = `900 84px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    zGlyph(g, 68, 72, 70, "#9a6200");
    zGlyph(g, 64, 68, 70, "#fff8d8");
  }));
}

/** ZEC's Z (the ⓩ's letter, with its two ticks), `s` px tall, centred on (cx, cy). */
export function zGlyph(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  const u = s / 24;
  g.save();
  g.strokeStyle = color;
  g.lineCap = "square";
  g.lineJoin = "miter";
  g.lineWidth = 4.2 * u;
  g.beginPath();
  g.moveTo(cx - 6.5 * u, cy - 6.5 * u);
  g.lineTo(cx + 6.5 * u, cy - 6.5 * u);
  g.lineTo(cx - 6.5 * u, cy + 6.5 * u);
  g.lineTo(cx + 6.5 * u, cy + 6.5 * u);
  g.moveTo(cx, cy - 11 * u);
  g.lineTo(cx, cy - 6.5 * u);
  g.moveTo(cx, cy + 6.5 * u);
  g.lineTo(cx, cy + 11 * u);
  g.stroke();
  g.restore();
}

/** A spinning golden Z-Block, `s` metres wide (animate its rotation yourself). */
export function qBlock(s = 1) {
  const m = new THREE.Mesh(GEO.box, new THREE.MeshToonMaterial({ map: qTex(), gradientMap: toonSteps(), emissive: 0x3a2600 }));
  m.scale.setScalar(s);
  outline(m, 0.04);
  return m;
}

let coinTexC: THREE.Texture | null = null;
const coinMats: THREE.Material[] = [];
/** A ⓩ coin standing up, `r` metres across (spin it on y). Gold, or `big`: a fat blue-gold one. */
export function coin(r = 0.5) {
  if (!coinTexC) {
    coinTexC = canvasTex(128, 128, (g) => {
      g.fillStyle = "#ffcf2e";
      g.beginPath();
      g.arc(64, 64, 64, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#c98a00";
      g.lineWidth = 10;
      g.beginPath();
      g.arc(64, 64, 50, 0, Math.PI * 2);
      g.stroke();
      g.font = `900 70px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      zGlyph(g, 66, 70, 62, "#9a6200");
      zGlyph(g, 64, 66, 62, "#fff4c4");
    });
    const face = new THREE.MeshToonMaterial({ map: coinTexC, gradientMap: toonSteps(), emissive: 0x2a1c00 });
    const side = new THREE.MeshToonMaterial({ color: 0xd99a00, gradientMap: toonSteps(), emissive: 0x2a1c00 });
    face.userData = side.userData = SHARED;
    coinMats.push(side, face, face);
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(GEO.cyl, coinMats);
  m.rotation.x = Math.PI / 2;
  m.scale.set(r * 2, r * 0.28, r * 2);
  g.add(m);
  return g;
}

// ---- the world -----------------------------------------------------------------------------------

export interface World extends View3 {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
}

export interface WorldOpts {
  /** The sky's gradient, top to horizon. */
  sky?: [string, string];
  /** Fog from…to (metres), in the horizon's colour; [0, 0] for none. */
  fog?: [number, number];
  /** A night: cooler, darker light. */
  night?: boolean;
  fov?: number;
  /** The stage's finish for this scene (multipliers on its bloom, AO, grade, exposure: post.ts). */
  post?: PostLook;
}

/** A scene with the party's light: a sky, a sun, a sky-and-ground fill, the camera (16:9). */
export function world(o: WorldOpts = {}): World {
  const [top, low] = o.sky ?? (o.night ? ["#120c33", "#3a2a6e"] : ["#4fa8ff", "#cdeeff"]);
  const scene = new THREE.Scene();
  scene.background = canvasTex(4, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, top);
    gr.addColorStop(0.75, low);
    gr.addColorStop(1, low);
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
  });
  const [f0, f1] = o.fog ?? [60, 220];
  if (f1 > 0) scene.fog = new THREE.Fog(low, f0, f1);
  // a cool sky fill and a warm bounce under a warm key (the shade reads cool, the light warm)
  const hemi = LEGACY
    ? new THREE.HemisphereLight(o.night ? "#8b84d8" : "#ffffff", o.night ? "#241a38" : "#8f8670", o.night ? 1.5 : 1.7)
    : new THREE.HemisphereLight(o.night ? "#8b84d8" : "#eef5ff", o.night ? "#2a1c3c" : "#9a8566", o.night ? 1.5 : 1.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(o.night ? "#a9b6ff" : LEGACY ? "#fff0d6" : "#ffe6c4", o.night ? 1.1 : 2.3);
  sun.position.set(30, 60, 24);
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(o.fov ?? 50, W / H, 0.1, 900);
  // (at night what is bright is a light: the bloom starts lower)
  const post: PostLook = { ...(o.night ? { hot: 0.62 } : {}), ...o.post };
  if (Object.keys(post).length) scene.userData.post = post;
  // (the stage casts this light's shadows: shadows.ts)
  scene.userData.sun = sun;
  return { scene, camera, sun, hemi };
}

/** A ring of the city's towers far round the arena (instanced: one draw), lit windows at night. */
export function skyline(scene: THREE.Scene, o: { r?: number; n?: number; y?: number; rnd?: () => number; night?: boolean; tall?: number } = {}) {
  const rnd = o.rnd ?? Math.random;
  const n = o.n ?? 70;
  const r = o.r ?? 140;
  const tex = canvasTex(
    64,
    128,
    (g) => {
      g.fillStyle = "#fff";
      g.fillRect(0, 0, 64, 128);
      for (let y = 6; y < 128; y += 12)
        for (let x = 5; x < 64; x += 12) {
          const lit = Math.random() < (o.night ? 0.55 : 0.2);
          g.fillStyle = lit ? (o.night ? "#ffe3a0" : "#e8f6ff") : o.night ? "#2a2440" : "#8fa6c0";
          g.fillRect(x, y, 7, 7);
        }
    },
    true,
  );
  const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps(), emissive: o.night ? 0x221a33 : 0x000000, emissiveMap: o.night ? tex : null });
  const mesh = new THREE.InstancedMesh(GEO.box, mat, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  const pal = o.night ? ["#5a4e8a", "#3e3a6a", "#6a5a9a", "#4a4478"] : ["#e9dccb", "#c9d6e6", "#f2c9a0", "#b9c7d8", "#ddd0f0", "#f0e6d0"];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.05;
    const d = r * (0.92 + rnd() * 0.25);
    const w = 7 + rnd() * 9;
    const h = (8 + rnd() * rnd() * 70) * (o.tall ?? 1);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    m.compose(new THREE.Vector3(Math.cos(a) * d, (o.y ?? 0) + h / 2, Math.sin(a) * d), q, new THREE.Vector3(w, h, w));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(pal[i % pal.length]));
  }
  mesh.raycast = () => {};
  scene.add(mesh);
  return mesh;
}

/** Puffy voxel clouds drifting high up (move them yourself or leave them). */
export function clouds(scene: THREE.Scene, o: { n?: number; r?: number; y?: number; rnd?: () => number } = {}) {
  const rnd = o.rnd ?? Math.random;
  const g = new THREE.Group();
  for (let i = 0; i < (o.n ?? 10); i++) {
    const c = new THREE.Group();
    const parts = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < parts; k++) block("#ffffff", 6 + rnd() * 6, 2.5 + rnd() * 2, 5 + rnd() * 4, k * 4 - parts * 2, rnd() * 1.5, rnd() * 3, c, glow("#ffffff"));
    const a = rnd() * Math.PI * 2;
    const d = (o.r ?? 120) * (0.5 + rnd() * 0.5);
    c.position.set(Math.cos(a) * d, (o.y ?? 45) + rnd() * 20, Math.sin(a) * d);
    c.rotation.y = rnd() * Math.PI;
    g.add(c);
  }
  scene.add(g);
  return g;
}

export interface SkyOpts {
  /** The gradient, zenith to horizon (default: the scene's own, as given to world()). */
  sky?: [string, string];
  /** Under the horizon: what the dome shows below eye level (default: the horizon's colour, a little deeper). */
  ground?: string;
  /** Painted clouds: how many (0: none), their colour, their shaded underside. */
  clouds?: number;
  cloud?: string;
  cloudShade?: string;
  /** Stars: how many (0: none); `band`: a faint milky band across them. */
  stars?: number;
  band?: boolean;
  /** A sun or a moon: where (degrees round the dome, degrees up), its colour, its size (degrees across), its glow's reach (× its size). */
  disc?: { az: number; el: number; color?: string; size?: number; glow?: number; moon?: boolean };
  /** A soft lighter band along the horizon (0…1, default 0.35): the haze that gives the far its depth. */
  haze?: number;
  rnd?: () => number;
}

/**
 * A sky all round the arena: a dome painted once (the gradient, haze on the horizon, clouds or stars,
 * a sun or a moon) that turns with the camera, in place of the flat backdrop gradient. One draw, no
 * light of its own, always behind everything. Returns the dome (turn `rotation.y` slowly to drift it).
 *
 *   skyDome(w.scene, { sky: ["#3b8cff", "#cfeaff"], clouds: 14, disc: { az: 40, el: 28 } });
 *   skyDome(w.scene, { sky: ["#070418", "#2a1a5e"], stars: 700, band: true, disc: { az: -60, el: 35, moon: true } });
 */
export function skyDome(scene: THREE.Scene, o: SkyOpts = {}) {
  const rnd = o.rnd ?? Math.random;
  const TW = 2048;
  const TH = 1024;
  const HOR = TH / 2;
  const fogC = scene.fog ? `#${(scene.fog as THREE.Fog).color.getHexString()}` : "#cdeeff";
  const [top, low] = o.sky ?? ["#4fa8ff", fogC];
  // (degrees up → the picture's row; degrees round → its column)
  const row = (el: number) => HOR - (el / 90) * HOR;
  const col = (az: number) => ((((az % 360) + 360) % 360) / 360) * TW;
  const tex = canvasTex(TW, TH, (g) => {
    // the sky: zenith to horizon, most of the change in the last third (as the air does)
    const gr = g.createLinearGradient(0, 0, 0, HOR);
    gr.addColorStop(0, top);
    gr.addColorStop(0.45, mixHex(top, low, 0.35));
    gr.addColorStop(1, low);
    g.fillStyle = gr;
    g.fillRect(0, 0, TW, HOR);
    // under the horizon
    const gd = g.createLinearGradient(0, HOR, 0, TH);
    const ground = o.ground ?? mixHex(low, "#000000", 0.18);
    gd.addColorStop(0, low);
    gd.addColorStop(0.12, ground);
    gd.addColorStop(1, mixHex(ground, "#000000", 0.35));
    g.fillStyle = gd;
    g.fillRect(0, HOR, TW, HOR);
    // stars: small and many, a few bright ones with a glint; none in the haze near the horizon
    if (o.stars) {
      if (o.band) {
        // a faint milky band, aslant across the dome
        for (let i = 0; i < 260; i++) {
          const u = rnd();
          const x = u * TW;
          const y = row(18 + Math.sin(u * Math.PI * 2) * 22 + 34) + (rnd() - 0.5) * 120;
          const r = 30 + rnd() * 70;
          const rg = g.createRadialGradient(x, y, 0, x, y, r);
          rg.addColorStop(0, "rgba(190,170,255,0.05)");
          rg.addColorStop(1, "rgba(190,170,255,0)");
          g.fillStyle = rg;
          g.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }
      const tints = ["#ffffff", "#ffffff", "#cfe0ff", "#fff1c9", "#ffd9d0"];
      for (let i = 0; i < o.stars; i++) {
        const el = 6 + Math.pow(rnd(), 0.8) * 84;
        const x = rnd() * TW;
        const y = row(el);
        const big = rnd() < 0.035;
        const r = big ? 2.2 + rnd() * 1.2 : 0.7 + rnd() * 1.1;
        g.globalAlpha = (big ? 1 : 0.45 + rnd() * 0.5) * Math.min(1, (el - 4) / 14);
        g.fillStyle = tints[Math.floor(rnd() * tints.length)];
        // (a square: the city's own pixels, not a round dot)
        g.fillRect(x - r, y - r, r * 2, r * 2);
        if (big) {
          g.globalAlpha *= 0.5;
          g.fillRect(x - r * 3.2, y - 0.6, r * 6.4, 1.2);
          g.fillRect(x - 0.6, y - r * 3.2, 1.2, r * 6.4);
        }
      }
      g.globalAlpha = 1;
    }
    // the sun or the moon: a wide soft glow, then the disc
    if (o.disc) {
      const d = o.disc;
      const c = d.color ?? (d.moon ? "#e8ecff" : "#fff3c4");
      const size = ((d.size ?? (d.moon ? 7 : 9)) / 360) * TW;
      const reach = size * (d.glow ?? (d.moon ? 3 : 5));
      const y = row(d.el);
      for (const dx of [-TW, 0, TW]) {
        const x = col(d.az) + dx;
        if (x < -reach || x > TW + reach) continue;
        const rg = g.createRadialGradient(x, y, size * 0.3, x, y, reach);
        rg.addColorStop(0, hexA(c, d.moon ? 0.35 : 0.6));
        rg.addColorStop(0.35, hexA(c, d.moon ? 0.1 : 0.2));
        rg.addColorStop(1, hexA(c, 0));
        g.fillStyle = rg;
        g.fillRect(x - reach, y - reach, reach * 2, reach * 2);
        g.fillStyle = c;
        g.beginPath();
        g.arc(x, y, size / 2, 0, Math.PI * 2);
        g.fill();
        if (d.moon) {
          // (its seas: three flat patches)
          g.fillStyle = mixHex(c, "#7d86b8", 0.35);
          for (const [mx, my, mr] of [[-0.16, -0.1, 0.13], [0.14, 0.12, 0.1], [0.02, -0.22, 0.07]] as const) {
            g.beginPath();
            g.arc(x + mx * size, y + my * size, mr * size, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
    // clouds: flat-bottomed, stepped like the city's voxels, lighter on top; smaller and paler toward the horizon
    const nc = o.clouds ?? 0;
    const cc = o.cloud ?? "#ffffff";
    const cs = o.cloudShade ?? mixHex(cc, low, 0.45);
    for (let i = 0; i < nc; i++) {
      const el = 7 + Math.pow(rnd(), 1.6) * 34;
      const k = 0.55 + (el / 41) * 0.75;
      const x0 = ((i + rnd() * 0.8) / nc) * TW;
      const y0 = row(el);
      const w = (90 + rnd() * 150) * k;
      const h = (22 + rnd() * 20) * k;
      const steps = 4 + Math.floor(rnd() * 4);
      const parts: [number, number, number][] = [];
      for (let j = 0; j < steps; j++) {
        const u = (j + 0.5) / steps;
        const ph = h * (0.45 + Math.sin(u * Math.PI) * (0.6 + rnd() * 0.5));
        parts.push([u * w - w / 2, ph, (w / steps) * (1.25 + rnd() * 0.3)]);
      }
      g.globalAlpha = 0.55 + Math.min(0.4, el / 60);
      for (const dx of [-TW, 0, TW]) {
        const x = x0 + dx;
        if (x < -w || x > TW + w) continue;
        // the underside's shade, then the lit body over it
        g.fillStyle = cs;
        for (const [px, ph, pw] of parts) g.fillRect(Math.round(x + px - pw / 2), Math.round(y0 - ph * 0.42), Math.round(pw), Math.round(ph * 0.42 + h * 0.2));
        g.fillStyle = cc;
        for (const [px, ph, pw] of parts) g.fillRect(Math.round(x + px - pw / 2), Math.round(y0 - ph), Math.round(pw), Math.round(ph * 0.72));
      }
      g.globalAlpha = 1;
    }
    // haze along the horizon: the far end of everything, a little lighter
    const haze = o.haze ?? 0.35;
    if (haze > 0) {
      const hz = g.createLinearGradient(0, row(16), 0, row(-6));
      hz.addColorStop(0, hexA(low, 0));
      hz.addColorStop(0.62, hexA(mixHex(low, "#ffffff", 0.25), haze));
      hz.addColorStop(1, hexA(low, 0));
      g.fillStyle = hz;
      g.fillRect(0, row(16), TW, row(-6) - row(16));
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  dome.raycast = () => {};
  dome.userData.noShadow = true;
  // (always round the camera: as far as the eye goes, whatever the arena's size)
  dome.onBeforeRender = (_r, _s, cam) => {
    dome.position.setFromMatrixPosition(cam.matrixWorld);
    dome.updateMatrixWorld();
  };
  scene.add(dome);
  return dome;
}

/** Two #rrggbb colours mixed (k = 0: a, 1: b). */
export function mixHex(a: string, b: string, k: number) {
  const ca = new THREE.Color(a);
  ca.lerp(new THREE.Color(b), k);
  return `#${ca.getHexString()}`;
}
const hexA = (hex: string, a: number) => {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
};

let blobTex: THREE.Texture | null = null;
/** A soft round shadow on the ground, `r` metres. */
export function blob(r = 0.6) {
  blobTex ??= canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, "rgba(0,0,0,0.55)");
    gr.addColorStop(0.6, "rgba(0,0,0,0.3)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
  const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(r * 2, r * 2, 1);
  m.renderOrder = 2;
  return m;
}

// ---- the players ---------------------------------------------------------------------------------

export const dirX = (yaw: number) => Math.sin(yaw);
export const dirZ = (yaw: number) => Math.cos(yaw);
/** The yaw that faces along (dx, dz). */
export const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);
/** The shortest turn from a to b (−π…π). */
export const turn = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export interface AvatarOpts {
  /** Size against life (1: ~1.6 m tall). */
  scale?: number;
  /** The floating arrow over the head in the seat's colour (default on). */
  marker?: boolean;
  /** A ring of the seat's colour on the ground under it (default on). */
  ring?: boolean;
  /** A shadow (default on). */
  shadow?: boolean;
}

/**
 * A player in the arena: their zkSNARK, its shadow, its marker. Move `pos` (feet), `yaw`, `vy`;
 * physics() for gravity and the floor; sync() once a frame to place and animate it.
 */
export class Avatar {
  readonly body: SnarkBody;
  /** Placed at pos/yaw by sync(); the zkSNARK stands on it (add a kart, a ball… to it or under it). */
  readonly root = new THREE.Group();
  readonly shadow: THREE.Mesh | null;
  readonly ring: THREE.Mesh | null;
  readonly marker: THREE.Object3D | null;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  vy = 0;
  grounded = true;
  /** The ground's height under it (null: the void, it falls). */
  floor: number | null = 0;
  /** Out of the game (fell, blown up): sync() still places it. */
  out = false;
  /** The speed the legs show (null: measured from the moves). */
  legs: number | null = null;
  readonly scale: number;
  private last = new THREE.Vector3();
  private first = true;
  private markerY: number;

  constructor(
    readonly scene: THREE.Scene,
    readonly player: Player,
    o: AvatarOpts = {},
  ) {
    this.scale = o.scale ?? 1;
    this.body = makeSnarkBody(player.id);
    this.body.root.scale.setScalar(this.scale);
    this.root.add(this.body.root);
    scene.add(this.root);
    this.shadow = o.shadow === false ? null : blob(0.55 * this.scale);
    if (this.shadow) scene.add(this.shadow);
    if (o.ring !== false) {
      this.ring = new THREE.Mesh(GEO.ring, glow(player.color, 0.85));
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.scale.setScalar(1.5 * this.scale);
      this.ring.renderOrder = 3;
      // A second, white ring identifies the local player even on an arena of their seat colour.
      // Shared geometry/material keeps this to one extra draw, without another texture or effect.
      if (isLocal(player)) {
        const focus = new THREE.Mesh(GEO.ring, glow("#eaf4fa", 0.85));
        focus.scale.setScalar(1.24);
        focus.renderOrder = 3;
        this.ring.add(focus);
      }
      scene.add(this.ring);
    } else this.ring = null;
    this.markerY = 2.35 * this.scale;
    if (o.marker !== false) {
      const mk = new THREE.Group();
      const cone = new THREE.Mesh(GEO.cone, toon(player.color, new THREE.Color(player.color).multiplyScalar(0.35)));
      cone.rotation.x = Math.PI;
      cone.scale.set(0.42, 0.5, 0.42);
      outline(cone as THREE.Mesh, 0.04);
      mk.add(cone);
      mk.scale.setScalar(this.scale * (isLocal(player) ? 1.25 : 0.9));
      this.root.add(mk);
      this.marker = mk;
    } else this.marker = null;
  }

  /** Gravity and the floor (`floor` the ground's height here, null for none). Lands it softly. */
  physics(dt: number, floor: number | null = this.floor, gravity = 30) {
    this.floor = floor;
    const was = this.pos.y;
    this.vy -= gravity * dt;
    // (the half-step term makes the arc the one a 60 Hz step draws whatever the frame rate: a jump
    // is as high at 120 frames a second, or in a slow frame's short steps, as at 60; at 60 it is 0)
    this.pos.y += (this.vy + 0.5 * gravity * (dt - 1 / 60)) * dt;
    // (once below its floor by more than a step, it has fallen past the edge: no catching it; but a
    // fast fall that crossed the floor during this very frame still lands, whatever the frame's length)
    if (floor !== null && this.pos.y <= floor && (this.pos.y > floor - 0.6 || was > floor - 0.6) && this.vy <= 0) {
      if (!this.grounded) this.body.land(Math.min(8, -this.vy));
      this.pos.y = floor;
      this.vy = 0;
      this.grounded = true;
    } else if (floor === null || this.pos.y > floor + 0.02) this.grounded = false;
  }

  /** A jump (if on the ground): up at `v` m/s. */
  jump(v = 10) {
    if (!this.grounded) return false;
    this.vy = v;
    this.grounded = false;
    this.body.jump();
    return true;
  }

  /** Turn toward `yaw`, at `k` per second. */
  face(yaw: number, dt: number, k = 14) {
    this.yaw += turn(this.yaw, yaw) * Math.min(1, k * dt);
  }

  /** Place and pose it (every frame, after the moves). */
  sync(dt: number, t = performance.now() / 1000) {
    if (this.first) {
      this.last.copy(this.pos);
      this.first = false;
    }
    const dx = this.pos.x - this.last.x;
    const dz = this.pos.z - this.last.z;
    const speed = this.legs ?? (dt > 0 ? Math.hypot(dx, dz) / dt / this.scale : 0);
    this.last.copy(this.pos);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.body.update(dt, { speed: Math.min(speed, 9), grounded: this.grounded, vy: this.vy, heading: this.yaw });
    const fl = this.floor;
    const showGround = fl !== null && this.pos.y > fl - 0.3;
    if (this.shadow) {
      this.shadow.visible = showGround;
      if (showGround) {
        const up = Math.max(0, this.pos.y - fl!);
        this.shadow.position.set(this.pos.x, fl! + 0.03, this.pos.z);
        const s = 0.55 * this.scale * 2 * Math.max(0.45, 1 - up * 0.12);
        this.shadow.scale.set(s, s, 1);
        // (under the sun's real shadow, shadows.ts: only a soft contact patch is left of the blob)
        (this.shadow.material as THREE.MeshBasicMaterial).opacity = this.scene.userData.sunShadows === true ? 0.4 : 1;
      }
    }
    if (this.ring) {
      this.ring.visible = showGround && !this.out;
      if (showGround) this.ring.position.set(this.pos.x, fl! + 0.04, this.pos.z);
    }
    if (this.marker) {
      this.marker.visible = !this.out;
      this.marker.position.y = this.markerY + Math.sin(t * 4 + this.player.seat) * 0.08;
      this.marker.rotation.y = t * 2;
    }
  }

  /** The spot over its head (for a name tag on the HUD). */
  head(v = new THREE.Vector3()) {
    return v.copy(this.pos).setY(this.pos.y + (this.markerY + 0.55) * 1);
  }

  hit() {
    this.body.hit();
  }
  cheer(s = 2) {
    this.body.celebrate(s);
  }
  set angry(on: boolean) {
    this.body.puppet.motion.angry = on;
  }

  dispose() {
    this.body.dispose();
    this.root.parent?.remove(this.root);
    if (this.shadow) (this.shadow.parent?.remove(this.shadow), (this.shadow.material as THREE.Material).dispose());
    this.ring?.parent?.remove(this.ring);
  }
}

// ---- particles -----------------------------------------------------------------------------------

/** Voxel bits: confetti, dust, sparks, debris (one instanced draw). */
export class Fx3 {
  readonly mesh: THREE.InstancedMesh;
  private p: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; s: number; g: number; spin: number; drag: number }[] = [];
  private cap: number;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(scene: THREE.Scene, cap = 900) {
    this.cap = cap;
    // (sparks and confetti catch a little of the bloom)
    this.mesh = new THREE.InstancedMesh(GEO.box, markGlow(new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.4), cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.mesh.setColorAt(0, this.c.set(0xffffff));
    scene.add(this.mesh);
  }

  /** `n` bits from `at`, of these colours. up: the upward kick; spread: how far sideways. */
  burst(at: THREE.Vector3, n: number, colors: readonly THREE.ColorRepresentation[], o: { speed?: number; up?: number; gravity?: number; size?: number; life?: number; drag?: number; dir?: THREE.Vector3 } = {}) {
    // (inside a lockstep tick: the bits are this screen's own, on the native Math.random, so a burst
    // only one client makes cannot move the sim's random stream)
    if (Det.active) return Det.free(() => this.spray(at, n, colors, o));
    this.spray(at, n, colors, o);
  }
  private spray(at: THREE.Vector3, n: number, colors: readonly THREE.ColorRepresentation[], o: { speed?: number; up?: number; gravity?: number; size?: number; life?: number; drag?: number; dir?: THREE.Vector3 }) {
    const speed = o.speed ?? 6;
    for (let i = 0; i < n && this.p.length < this.cap; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const k = Math.sqrt(1 - u * u);
      const v = speed * (0.35 + Math.random() * 0.65);
      const idx = this.p.length;
      this.p.push({
        x: at.x,
        y: at.y,
        z: at.z,
        vx: Math.cos(a) * k * v + (o.dir?.x ?? 0),
        vy: Math.abs(u) * v * 0.6 + (o.up ?? 4) * (0.5 + Math.random() * 0.5) + (o.dir?.y ?? 0),
        vz: Math.sin(a) * k * v + (o.dir?.z ?? 0),
        life: 0,
        max: (o.life ?? 0.9) * (0.6 + Math.random() * 0.7),
        s: (o.size ?? 0.18) * (0.6 + Math.random() * 0.8),
        g: o.gravity ?? 18,
        spin: (Math.random() - 0.5) * 16,
        drag: o.drag ?? 0.6,
      });
      this.mesh.setColorAt(idx, this.c.set(colors[i % colors.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    let w = 0;
    const p = this.p;
    for (let i = 0; i < p.length; i++) {
      const b = p[i];
      b.life += dt;
      if (b.life >= b.max) continue;
      b.vy -= b.g * dt;
      const d = Math.exp(-b.drag * dt);
      b.vx *= d;
      b.vz *= d;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (w !== i) {
        p[w] = b;
        // (its colour moves with it)
        this.mesh.getColorAt(i, this.c);
        this.mesh.setColorAt(w, this.c);
      }
      const k = 1 - b.life / b.max;
      const s = b.s * Math.min(1, k * 2.5);
      this.e.set(b.life * b.spin, b.life * b.spin * 0.7, 0);
      this.m.compose(this.v.set(b.x, b.y, b.z), this.q.setFromEuler(this.e), this.sc.set(s, s, s));
      this.mesh.setMatrixAt(w, this.m);
      w++;
    }
    p.length = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---- the camera ----------------------------------------------------------------------------------

const shakeV = new THREE.Vector3();
/** A camera that eases toward where it is sent, with a shake. */
export class CamRig {
  readonly eye = new THREE.Vector3(0, 10, 20);
  readonly at = new THREE.Vector3();
  private shakeA = 0;
  private t = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /** Snap there. */
  set(eye: THREE.Vector3, at: THREE.Vector3) {
    this.eye.copy(eye);
    this.at.copy(at);
  }
  /** Ease toward this eye and target (`k`: how quick, per second). */
  to(eye: THREE.Vector3, at: THREE.Vector3, dt: number, k = 4, kAt = k * 1.6) {
    this.eye.lerp(eye, 1 - Math.exp(-k * dt));
    this.at.lerp(at, 1 - Math.exp(-kAt * dt));
  }
  shake(a = 0.4) {
    this.shakeA = Math.max(this.shakeA, a);
  }
  apply(dt: number) {
    this.t += dt;
    this.shakeA *= Math.exp(-6 * dt);
    const s = this.shakeA;
    this.camera.position.copy(this.eye);
    if (s > 0.002) this.camera.position.add(shakeV.set(Math.sin(this.t * 61) * s, Math.sin(this.t * 47 + 1) * s, Math.sin(this.t * 53 + 2) * s));
    this.camera.lookAt(this.at);
    this.camera.updateMatrixWorld();
  }
  /** A slow circle round `at` (the card's fly-over): `a` radians round, `r` away, `h` up. */
  orbit(at: THREE.Vector3, a: number, r: number, h: number) {
    this.eye.set(at.x + Math.sin(a) * r, at.y + h, at.z + Math.cos(a) * r);
    this.at.copy(at);
  }
}

const pv = new THREE.Vector3();
/** Where a 3D point lands on the 960×540 HUD (`on`: in front of the camera, on screen). */
export function toScreen(v: THREE.Vector3, cam: THREE.Camera) {
  pv.copy(v).project(cam);
  // (the camera draws the whole view, wider or taller than the frame: kit VIEW)
  return { x: W / 2 + (pv.x * VIEW.w) / 2, y: H / 2 - (pv.y * VIEW.h) / 2, on: pv.z < 1 && Math.abs(pv.x) < 1.2 && Math.abs(pv.y) < 1.2 };
}

/** Free everything a game made (its own geometries, materials, textures; not the shared ones). */
export function disposeScene(scene: THREE.Scene) {
  const seen = new Set<unknown>();
  scene.traverse((o) => {
    // (an instanced mesh's own buffers: its matrices, its colours)
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared && !seen.has(m.geometry)) (seen.add(m.geometry), m.geometry.dispose());
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mt of mats) {
      if (mt.userData.shared || seen.has(mt)) continue;
      seen.add(mt);
      for (const v of Object.values(mt as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture && v !== qTexC && v !== coinTexC && v !== blobTex && v !== steps) v.dispose();
      mt.dispose();
    }
  });
  if (scene.background instanceof THREE.Texture) scene.background.dispose();
  scene.clear();
}

// ---- the HUD over the 3D -------------------------------------------------------------------------
// (the look lives in hud.ts: toy letters, portrait badges, the crown; the spots stay where the games
// expect them: four 196×58 panels 14 px from the corners, each one's figure right-aligned at +184)

/**
 * Where seat i's 196×58 corner panel sits (its top left). On a touch screen the bottom corners are
 * under the thumbs (the stick, A and B), so the bottom two stack under the top two.
 */
export function cornerSpot(i: number, top = 14, pw = 196): [number, number] {
  // (`pw`: a panel grown wider on a small screen keeps its outer edge 14 px in)
  // (the top right ones stop short of the hall's pause button when it sits over the frame's corner)
  const x = i % 2 ? W - 14 - pw - (HUD.thumbs || i < 2 ? HUD.tr : 0) : 14;
  if (HUD.thumbs) return [x, top + (i < 2 ? 0 : 64)];
  return [x, i < 2 ? top : H - 72];
}

/** A player's name, short: "YOU", a rival's first name, an online "Snark#…" by its number. */
export function short(p: Player) {
  if (isLocal(p)) return T("YOU", "你");
  if (/^snark#/i.test(p.name)) return p.name.slice(5);
  return p.name.split(" ")[0];
}

/** A name tag over a head: a pill in the seat's colour pointing down at it ("YOU" bigger, white-rimmed). */
export function tag(g: CanvasRenderingContext2D, p: Player, x: number, y: number, alpha = 1) {
  const fs = isLocal(p) ? 14 : 12;
  // (a small screen: the whole tag grows about its point until its name reads 12 px)
  const k = fpx(fs) / fs;
  if (k > 1) return zoom(g, x, y + (isLocal(p) ? 23 : 20), k, () => tagAt(g, p, x, y, alpha));
  tagAt(g, p, x, y, alpha);
}
function tagAt(g: CanvasRenderingContext2D, p: Player, x: number, y: number, alpha: number) {
  const s = short(p);
  const big = isLocal(p);
  const fs = big ? 14 : 12;
  g.save();
  g.globalAlpha = alpha;
  g.font = `900 ${fs}px ${FONT}`;
  const w = Math.max(big ? 48 : 34, g.measureText(s).width + (big ? 22 : 16));
  const h = big ? 24 : 20;
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  const e = big ? 3 : 2;
  // the edge (ink, a white rim for you) and the pointer, in one shape
  g.beginPath();
  g.roundRect(x0 - e, y0 - e, w + e * 2, h + e * 2, h / 2 + e);
  g.moveTo(x - 7 - e, y0 + h);
  g.lineTo(x, y0 + h + 8 + e);
  g.lineTo(x + 7 + e, y0 + h);
  g.fillStyle = big ? "#ffffff" : INK;
  g.fill();
  if (big) {
    g.lineWidth = 2;
    g.strokeStyle = INK;
    g.stroke();
  }
  const gr = g.createLinearGradient(0, y0, 0, y0 + h);
  gr.addColorStop(0, tint(p.color, 0.22));
  gr.addColorStop(1, tint(p.color, -0.12));
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(x0, y0, w, h, h / 2);
  g.moveTo(x - 6, y0 + h - 1);
  g.lineTo(x, y0 + h + 6);
  g.lineTo(x + 6, y0 + h - 1);
  g.fill();
  rr(g, x0 + h * 0.3, y0 + 2, w - h * 0.6, h * 0.28, h * 0.14);
  g.fillStyle = "rgba(255,255,255,0.32)";
  g.fill();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 3;
  g.strokeStyle = tint(p.color, -0.6);
  g.strokeText(s, x, y + 1);
  g.fillStyle = "#ffffff";
  g.fillText(s, x, y + 1);
  g.restore();
}

/** Each game's figures as last drawn (by its players' list), and when each last changed: the pop in corners(). */
const POPS = new WeakMap<Player[], { v: (string | undefined)[]; at: number[]; changed: number[]; up: boolean[] }>();

/**
 * The four players' panels in the corners (the party's way): the portrait in a badge of the
 * seat's colour, the name, the game's figure for each (a score, lives, a place) in big outlined
 * numerals. `out`: knocked out (greyed, stamped). `lead`: a crown on these seats.
 */
export function corners(g: CanvasRenderingContext2D, players: Player[], vals: string[], o: { out?: boolean[]; lead?: number[]; sub?: string[]; top?: number } = {}) {
  const top = o.top ?? 14;
  const PH = 58;
  // (a small screen: a panel whose line would be cut grows toward the middle, up to 100 wider, so it reads whole)
  const pws = [0, 1, 2, 3].map((i) => {
    const sub = o.sub?.[i];
    if (!HUD.min || !sub) return 196;
    const v = vals[i] ?? "";
    g.font = `900 ${v.length > 4 ? 22 : 27}px ${FONT}`;
    const vw = v ? g.measureText(v).width + 8 : 0;
    g.font = `700 11px ${FONT}`;
    return clamp(Math.ceil(60 + g.measureText(sub).width + vw + 12), 196, 296);
  });
  const spots = [0, 1, 2, 3].map((i) => cornerSpot(i, top, pws[i]));
  const now = performance.now() / 1000;
  let pops = POPS.get(players);
  if (!pops) POPS.set(players, (pops = { v: [], at: [-9, -9, -9, -9], changed: [-9, -9, -9, -9], up: [true, true, true, true] }));
  players.forEach((p, i) => {
    const sp = spots[i];
    if (!sp) return;
    const [x, y] = sp;
    const PW = pws[i];
    const dim = !!o.out?.[i];
    g.save();
    // the drop, the body (dark glass), the seat's colour washing in from the badge
    rr(g, x, y + 4, PW, PH, 12);
    g.fillStyle = "rgba(6,3,18,0.38)";
    g.fill();
    rr(g, x, y, PW, PH, 12);
    const body = g.createLinearGradient(0, y, 0, y + PH);
    body.addColorStop(0, dim ? "rgba(46,42,62,0.9)" : "rgba(27,34,46,0.94)");
    body.addColorStop(1, dim ? "rgba(22,20,32,0.9)" : "rgba(10,15,23,0.94)");
    g.fillStyle = body;
    g.fill();
    if (!dim) {
      const wash = g.createLinearGradient(x, 0, x + 150, 0);
      wash.addColorStop(0, tint(p.color, 0) + "");
      wash.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.1;
      g.fillStyle = wash;
      g.fill();
      g.globalAlpha = 1;
    }
    // the rim: the seat's colour (thicker for you), a light line along the top
    rr(g, x, y, PW, PH, 12);
    g.lineWidth = isLocal(p) ? 2 : 1;
    g.strokeStyle = dim ? "rgba(255,255,255,0.18)" : isLocal(p) ? tint(p.color, 0.15) : "rgba(255,255,255,0.2)";
    g.stroke();
    rr(g, x + 18, y + 2.5, PW - 36, 2, 1);
    g.fillStyle = "rgba(255,255,255,0.16)";
    g.fill();
    // A quiet seat marker keeps the whole panel legible over bright scenery.
    rr(g, x + 1, y + 15, 3, PH - 30, 1.5);
    g.fillStyle = dim ? "#69717d" : p.color;
    g.fill();
    badge(g, p, x + 30, y + 29, 40, { dim });
    text(g, short(p), x + 60, y + 18, 12.5, dim ? "rgba(255,255,255,0.5)" : tint(p.color, 0.38), "left", 900);
    const v = vals[i] ?? "";
    if (o.sub?.[i]) {
      let sub = o.sub[i];
      // (a small screen: its grown letters stop short of the figure, cut with "…")
      if (HUD.min) {
        g.font = `900 ${v.length > 4 ? 22 : 27}px ${FONT}`;
        const room = PW - 12 - (v ? g.measureText(v).width + 8 : 0) - 60;
        g.font = `700 11px ${FONT}`;
        if (g.measureText(sub).width > room) {
          while (sub.length > 1 && g.measureText(sub + "…").width > room) sub = sub.slice(0, -1);
          sub += "…";
        }
      }
      text(g, sub, x + 60, y + 41, 11, dim ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.72)", "left", 700);
    }
    if (v) {
      // the figure pops when it changes (a coin, a hit): gold when it grows, red when it drops; one
      // that runs all the time (a distance, a percentage) does not
      const was = pops.v[i];
      if (was !== undefined && was !== v) {
        if (now - pops.changed[i] > 0.4) {
          pops.at[i] = now;
          pops.up[i] = parseFloat(v) >= parseFloat(was) || Number.isNaN(parseFloat(v));
        }
        pops.changed[i] = now;
      }
      pops.v[i] = v;
      const pk = clamp((now - pops.at[i]) / 0.42, 0, 1);
      const size = v.length > 4 ? 22 : 27;
      if (pk < 1 && !dim) {
        const sc = 1 + Math.sin(pk * Math.PI) * (1 - pk) * 0.3;
        g.save();
        g.translate(x + PW - 12, y + 30);
        g.scale(sc, sc);
        numeral(g, v, 0, 0, size, pk < 0.7 ? (pops.up[i] ? "#ffe27a" : "#ff8fa0") : "#ffffff");
        g.restore();
      } else numeral(g, v, x + PW - 12, y + 30, size, dim ? "rgba(255,255,255,0.6)" : "#ffffff");
    }
    if (o.lead?.includes(i) && !dim) crown(g, x + 30, y + 6, 18);
    if (dim) {
      // the OUT stamp, aslant over the badge
      g.translate(x + 30, y + 30);
      g.rotate(-0.22);
      rr(g, -24, -10, 48, 20, 6);
      g.fillStyle = "#ff3d5a";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "#ffffff";
      g.stroke();
      text(g, T("OUT", "出局"), 0, 1, 12, "#fff", "center", 900);
    }
    g.restore();
  });
}

/** How much the clock grows on a small screen (its half width as drawn: 56 × this). */
export const clockK = () => Math.min(HUD.k, 1.2);

/** The time left, top middle: a stopwatch badge. Amber in the last 10 seconds, red, pulsing and shaking in the last 5. */
export function clock(g: CanvasRenderingContext2D, s: number, y = 34) {
  // (a small screen: the badge grows about its middle to 40 px high, short of what games put under it)
  const k = clockK();
  if (k > 1) return zoom(g, W / 2, y, k, () => clockAt(g, s, y));
  clockAt(g, s, y);
}
function clockAt(g: CanvasRenderingContext2D, s: number, y: number) {
  const remaining = Math.max(0, s);
  const warn = remaining <= 10;
  const last = remaining <= 5;
  const accent = last ? "#ff7182" : warn ? "#ffb780" : "#a8d8e8";
  const w = 112, h = 46;
  g.save();
  g.translate(W / 2, y);
  rr(g, -w / 2, -h / 2 + 3, w, h, 14);
  g.fillStyle = "rgba(0,0,0,0.24)";
  g.fill();
  rr(g, -w / 2, -h / 2, w, h, 14);
  const body = g.createLinearGradient(0, -h / 2, 0, h / 2);
  body.addColorStop(0, last ? "#46212b" : "#202938");
  body.addColorStop(1, "#0e151f");
  g.fillStyle = body;
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = warn ? accent : "rgba(255,255,255,0.24)";
  g.stroke();
  const cx = -31;
  g.lineWidth = 3;
  g.strokeStyle = "rgba(255,255,255,0.12)";
  g.beginPath();
  g.arc(cx, 0, 11, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = accent;
  g.lineCap = "round";
  g.beginPath();
  g.arc(cx, 0, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (remaining % 1 || 1));
  g.stroke();
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(cx, -5);
  g.lineTo(cx, 0);
  g.lineTo(cx + 4, 2);
  g.stroke();
  g.font = `850 29px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = warn ? accent : "#f3f5f7";
  g.fillText(String(Math.ceil(remaining)), 16, 1);
  g.restore();
}

const BOUNCE = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + 3.4 * Math.pow(t - 1, 3) + 2.4 * Math.pow(t - 1, 2));

/** A banner across the middle (a "FINAL LAP!", a "3 LEFT!"): `k` 0…1 its life. The letters bounce in one by one. */
export function banner(g: CanvasRenderingContext2D, s: string, k: number, color = "#ffd23f", y = H * 0.32, size = 58) {
  if (k <= 0 || k >= 1 || !s) return;
  g.save();
  g.font = `900 ${size}px ${FONT}`;
  const tw = g.measureText(s).width;
  // (a long line shrinks to fit the screen)
  if (tw * 1.12 > W * 0.92) size = (size * W * 0.92) / (tw * 1.12);
  const n = Array.from(s).length;
  const inK = Math.min(1, k / 0.2);
  const outK = k > 0.82 ? (1 - k) / 0.18 : 1;
  const now = performance.now() / 1000;
  g.globalAlpha = Math.max(0, Math.min(1, outK * 1.4));
  const big = size >= 34;
  if (big) {
    // a soft dark glow behind (readable over anything)
    const gw = Math.min(W * 0.5, tw * 0.62 + size);
    const rg = g.createRadialGradient(W / 2, y, 4, W / 2, y, gw);
    rg.addColorStop(0, "rgba(10,6,30,0.42)");
    rg.addColorStop(1, "rgba(10,6,30,0)");
    g.fillStyle = rg;
    g.save();
    g.translate(W / 2, y);
    g.scale(1, (size * 1.1) / gw);
    g.translate(-W / 2, -y);
    g.fillRect(W / 2 - gw, y - gw, gw * 2, gw * 2);
    g.restore();
  }
  const lift = (1 - outK) * size * 0.5;
  const step = Math.min(0.08, 0.6 / Math.max(1, n));
  toyLetters(
    g,
    s,
    W / 2,
    y - lift,
    size * (1 + (1 - outK) * 0.12),
    color,
    (i) => {
      const t = Math.max(0, Math.min(1, inK * (1 + n * step) - i * step));
      return -(1 - t) * size * 0.55 * (t > 0 ? 1 : 0) + (inK >= 1 ? Math.sin(now * 7 - i * 0.55) * size * 0.035 : 0);
    },
    (i) => BOUNCE(Math.max(0, Math.min(1, inK * (1 + n * step) - i * step))),
    { rim: big ? "#ffffff" : INK },
  );
  g.restore();
}
