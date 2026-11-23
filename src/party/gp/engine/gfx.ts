/**
 * The TV's 3D toolbox: one WebGL renderer for everything, cel-shaded ("toon") materials, a ready
 * lit stage (`makeStage`), primitive builders and canvas-painted textures / labels.
 *
 *   const st = makeStage({ sky: ["#7ec8ff", "#e8f7ff"], size: 24 });   // scene + camera + sun
 *   box(st.scene, "#ffd23f", 2, 1, 2, { x: 0, y: 0.5, z: 0 });            // a toon box
 *   const m = toon("#ff4b3e");                                           // shared toon material
 */
import * as THREE from "three";

// ------------------------------------------------------------------ renderer

export const QUALITY = {
  /** "high": real-time shadows, full pixel ratio; "low": cheaper, for weak TVs. */
  level: "high" as "high" | "low",
};
export function setQuality(q: "high" | "low") {
  QUALITY.level = q;
  if (renderer) applyQuality(renderer);
}

let renderer: THREE.WebGLRenderer | null = null;

function applyQuality(r: THREE.WebGLRenderer) {
  const hi = QUALITY.level === "high";
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, hi ? 2 : 1));
  r.shadowMap.enabled = hi;
}

/** The one renderer (its canvas fills the window, under the HTML overlay). */
export function getRenderer(): THREE.WebGLRenderer {
  if (renderer) return renderer;
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
  r.outputColorSpace = THREE.SRGBColorSpace;
  // (Neutral keeps the toys' colours saturated where ACES washes them out)
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 1.0;
  r.shadowMap.type = THREE.PCFShadowMap;
  applyQuality(r);
  r.setSize(window.innerWidth, window.innerHeight);
  r.domElement.className = "gl";
  document.body.prepend(r.domElement);
  window.addEventListener("resize", () => r.setSize(window.innerWidth, window.innerHeight));
  renderer = r;
  return r;
}

/**
 * The 3D view's size in CSS pixels: in ZK PARTY the stage's (it turns a quarter on a phone held
 * upright, so the window's is not it). The adapter (../index.ts) keeps it current; labels and
 * pops over the 3D are placed in it.
 */
export const VIEWPORT = { w: typeof window !== "undefined" ? window.innerWidth : 1280, h: typeof window !== "undefined" ? window.innerHeight : 720 };

/** Aspect of the screen (the camera's). */
export const aspect = () => VIEWPORT.w / Math.max(1, VIEWPORT.h);

export function render(scene: THREE.Scene, camera: THREE.Camera) {
  const r = getRenderer();
  if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.aspect - aspect()) > 1e-3) {
    camera.aspect = aspect();
    camera.updateProjectionMatrix();
  }
  r.render(scene, camera);
}

// ------------------------------------------------------------------ materials

let steps: THREE.DataTexture | null = null;
/** Three soft bands of light: the cartoon look. */
function toonSteps() {
  if (steps) return steps;
  steps = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  steps.minFilter = steps.magFilter = THREE.NearestFilter;
  steps.generateMipmaps = false;
  steps.needsUpdate = true;
  return steps;
}

const SHARED = { shared: true };

/**
 * A soft warm rim on the silhouettes (fresnel), added to every toon material: the cartoon "glow"
 * round the edges that makes the toys pop from the background. One shader for all of them.
 */
export function rimLight<M extends THREE.Material>(m: M, k = 0.22): M {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <opaque_fragment>",
      `{ float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
         outgoingLight += vec3(1.0, 0.96, 0.88) * pow(rimF, 3.0) * ${k.toFixed(3)}; }
       #include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => `rim${k}`;
  return m;
}
const toons = new Map<string, THREE.MeshToonMaterial>();
/** A shared cel material (never dispose it yourself: `disposeScene` leaves shared ones alone). */
export function toon(color: THREE.ColorRepresentation, emissive: THREE.ColorRepresentation = 0x000000, emissiveIntensity = 1): THREE.MeshToonMaterial {
  const k = `${new THREE.Color(color).getHexString()}:${new THREE.Color(emissive).getHexString()}:${emissiveIntensity}`;
  let m = toons.get(k);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, emissive, emissiveIntensity, gradientMap: toonSteps() });
    m.userData = SHARED;
    rimLight(m);
    toons.set(k, m);
  }
  return m;
}
const basics = new Map<string, THREE.MeshBasicMaterial>();
/** A shared unlit material (lights, glows, screens). */
export function flat(color: THREE.ColorRepresentation, opacity = 1, additive = false): THREE.MeshBasicMaterial {
  const k = `${new THREE.Color(color).getHexString()}:${opacity}:${additive}`;
  let m = basics.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1 || additive, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !(opacity < 1 || additive) });
    m.userData = SHARED;
    basics.set(k, m);
  }
  return m;
}

// ------------------------------------------------------------------ shared geometry

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 24, 16),
  sphereLo: new THREE.SphereGeometry(1, 12, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 24),
  coneLo: new THREE.ConeGeometry(1, 1, 8),
  torus: new THREE.TorusGeometry(1, 0.25, 12, 32),
  plane: new THREE.PlaneGeometry(1, 1),
  circle: new THREE.CircleGeometry(1, 32),
  ring: new THREE.RingGeometry(0.8, 1, 40),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 6, 12),
  dodeca: new THREE.DodecahedronGeometry(1, 0),
  ico: new THREE.IcosahedronGeometry(1, 0),
};
for (const g of Object.values(GEO)) g.userData = SHARED;

// ------------------------------------------------------------------ builders

export interface Place {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  /** Casts / receives shadows (both default true). */
  cast?: boolean;
  receive?: boolean;
}

function place<T extends THREE.Object3D>(o: T, p: Place = {}, parent?: THREE.Object3D): T {
  o.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
  o.rotation.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
  if (o instanceof THREE.Mesh) {
    o.castShadow = p.cast ?? true;
    o.receiveShadow = p.receive ?? true;
  }
  parent?.add(o);
  return o;
}

const matOf = (c: THREE.ColorRepresentation | THREE.Material) => (c instanceof THREE.Material ? c : toon(c));

/** A toon box w×h×d (centred on its position). */
export function box(parent: THREE.Object3D | null, color: THREE.ColorRepresentation | THREE.Material, w: number, h: number, d: number, p: Place = {}) {
  const m = new THREE.Mesh(GEO.box, matOf(color));
  m.scale.set(w, h, d);
  return place(m, p, parent ?? undefined);
}
/** A toon cylinder (radius top = bottom = r unless `rTop` given → its own geometry). */
export function cyl(parent: THREE.Object3D | null, color: THREE.ColorRepresentation | THREE.Material, r: number, h: number, p: Place & { rTop?: number; seg?: number } = {}) {
  const geo = p.rTop !== undefined || p.seg ? new THREE.CylinderGeometry(p.rTop ?? r, r, h, p.seg ?? 24) : GEO.cyl;
  const m = new THREE.Mesh(geo, matOf(color));
  if (geo === GEO.cyl) m.scale.set(r, h, r);
  return place(m, p, parent ?? undefined);
}
/** A toon sphere (sx, sy, sz radii; give one number for a ball). */
export function ball(parent: THREE.Object3D | null, color: THREE.ColorRepresentation | THREE.Material, r: number | [number, number, number], p: Place & { lo?: boolean } = {}) {
  const m = new THREE.Mesh(p.lo ? GEO.sphereLo : GEO.sphere, matOf(color));
  if (typeof r === "number") m.scale.setScalar(r);
  else m.scale.set(r[0], r[1], r[2]);
  return place(m, p, parent ?? undefined);
}
/** A toon cone (r: base radius, h: height, pointing up). */
export function cone(parent: THREE.Object3D | null, color: THREE.ColorRepresentation | THREE.Material, r: number, h: number, p: Place & { lo?: boolean } = {}) {
  const m = new THREE.Mesh(p.lo ? GEO.coneLo : GEO.cone, matOf(color));
  m.scale.set(r, h, r);
  return place(m, p, parent ?? undefined);
}
/** Any geometry with a toon material. */
export function mesh(parent: THREE.Object3D | null, geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | THREE.Material, p: Place = {}) {
  return place(new THREE.Mesh(geo, matOf(color)), p, parent ?? undefined);
}
export function group(parent: THREE.Object3D | null, p: Place = {}) {
  return place(new THREE.Group(), p, parent ?? undefined);
}

// ------------------------------------------------------------------ textures & labels

/** A texture painted on a canvas. */
export function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** (in ZStreet: Geist at 600 and 800 under families of their own, gp.css; ../index.ts loads them before a game) */
export const FONT_UI = '"ZP UI", Geist, system-ui, sans-serif';
export const FONT_TITLE = '"ZP Title", Geist, system-ui, sans-serif';

/**
 * A text label as a sprite that always faces the camera; `h` is its height in world units.
 * Returns the sprite (its material/texture are its own: disposeScene frees them).
 */
export function textSprite(s: string, h: number, o: { color?: string; bg?: string; stroke?: string; font?: string; pad?: number } = {}) {
  const px = 96;
  const font = `${px}px ${o.font ?? FONT_TITLE}`;
  const meas = document.createElement("canvas").getContext("2d")!;
  meas.font = font;
  const pad = o.pad ?? (o.bg ? 28 : 14);
  const w = Math.ceil(meas.measureText(s).width + pad * 2);
  const hh = px + pad * 2;
  const tex = canvasTex(w, hh, (g) => {
    if (o.bg) {
      g.fillStyle = o.bg;
      g.beginPath();
      g.roundRect(0, 0, w, hh, hh / 2);
      g.fill();
    }
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (o.stroke) {
      g.lineWidth = 16;
      g.lineJoin = "round";
      g.strokeStyle = o.stroke;
      g.strokeText(s, w / 2, hh / 2 + 4);
    }
    g.fillStyle = o.color ?? "#fff";
    g.fillText(s, w / 2, hh / 2 + 4);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set((h * w) / hh, h, 1);
  return sp;
}

/** A soft round shadow under something that jumps (a flat dark disc, 1 unit radius). */
let blobTex: THREE.Texture | null = null;
export function blobShadow(r = 0.5, opacity = 0.35) {
  blobTex ??= canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(0,0,0,1)");
    gr.addColorStop(0.6, "rgba(0,0,0,0.6)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
  const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false }));
  m.material.userData = {};
  m.rotation.x = -Math.PI / 2;
  m.scale.set(r * 2, r * 2, 1);
  m.renderOrder = 1;
  return m;
}

// ------------------------------------------------------------------ the stage

export interface StageOpts {
  /** Sky gradient, top → horizon. */
  sky?: [string, string];
  /** Fog colour (default: the horizon) and distances; null: none. */
  fog?: { color?: string; near: number; far: number } | null;
  /** Half-size of the area the sun's shadows must cover (world units). */
  size?: number;
  /** Sun direction (from the target to the sun). */
  sun?: [number, number, number];
  sunColor?: string;
  sunIntensity?: number;
  /** Ambient: sky and ground colours, intensity. */
  hemi?: [string, string, number];
  fov?: number;
  /** Night: darker lights. */
  night?: boolean;
}

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
}

/** A gradient sky as the scene background. */
export function skyTexture(top: string, bottom: string) {
  const t = canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, top);
    gr.addColorStop(1, bottom);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  return t;
}

/** A lit scene and a camera, ready for a mini-game or a board. */
export function makeStage(o: StageOpts = {}): Stage {
  const scene = new THREE.Scene();
  const [top, bottom] = o.sky ?? ["#5fb8ff", "#d6f0ff"];
  scene.background = skyTexture(top, bottom);
  if (o.fog !== null) {
    const f = o.fog ?? { near: 60, far: 160 };
    scene.fog = new THREE.Fog(f.color ?? bottom, f.near, f.far);
  }
  const [hs, hg, hi] = o.hemi ?? (o.night ? ["#6a78c8", "#2a2440", 0.9] : ["#ffffff", "#8a7a6a", 1.5]);
  const hemi = new THREE.HemisphereLight(hs, hg, hi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(o.sunColor ?? (o.night ? "#9fb4ff" : "#fff3e0"), o.sunIntensity ?? (o.night ? 1.2 : 2.6));
  const d = o.sun ?? [0.5, 1, 0.35];
  const size = o.size ?? 20;
  const len = Math.hypot(d[0], d[1], d[2]);
  sun.position.set((d[0] / len) * size * 2, (d[1] / len) * size * 2, (d[2] / len) * size * 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -size;
  sc.right = sc.top = size;
  sc.near = 0.5;
  sc.far = size * 5;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(o.fov ?? 45, aspect(), 0.1, 600);
  camera.position.set(0, 14, 16);
  camera.lookAt(0, 0, 0);
  return { scene, camera, sun, hemi };
}

/** Free a scene's geometries, materials and textures (not the shared ones). */
export function disposeScene(root: THREE.Object3D) {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    if (o instanceof THREE.InstancedMesh && !seen.has(o)) {
      seen.add(o);
      o.dispose();
    }
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData?.shared && !seen.has(m.geometry)) {
      seen.add(m.geometry);
      m.geometry.dispose();
    }
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      if (!mat || seen.has(mat) || (mat.userData as { shared?: boolean })?.shared) continue;
      seen.add(mat);
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture && v !== blobTex) v.dispose();
      mat.dispose();
    }
  });
  if (root instanceof THREE.Scene && root.background instanceof THREE.Texture) root.background.dispose();
}

/** A world point → CSS pixels on the screen (for HTML labels over the 3D). */
export function toScreen(v: THREE.Vector3, cam: THREE.Camera): { x: number; y: number; behind: boolean } {
  const p = v.clone().project(cam);
  return { x: ((p.x + 1) / 2) * VIEWPORT.w, y: ((1 - p.y) / 2) * VIEWPORT.h, behind: p.z > 1 };
}

// ------------------------------------------------------------------ common decor

/** A low-poly round tree (trunk + 2–3 blobs). */
export function tree(parent: THREE.Object3D, x: number, z: number, s = 1, leaf = "#4fbf4a", y = 0) {
  const g = group(parent, { x, y, z });
  cyl(g, "#8a5a32", 0.14 * s, 1 * s, { y: 0.5 * s, seg: 8 });
  ball(g, leaf, 0.75 * s, { y: 1.35 * s, lo: true });
  ball(g, leaf, 0.55 * s, { x: 0.35 * s, y: 1.75 * s, z: 0.1 * s, lo: true });
  ball(g, leaf, 0.45 * s, { x: -0.3 * s, y: 1.85 * s, z: -0.15 * s, lo: true });
  return g;
}
/** A pine tree. */
export function pine(parent: THREE.Object3D, x: number, z: number, s = 1, leaf = "#2f9e5b", y = 0) {
  const g = group(parent, { x, y, z });
  cyl(g, "#7a4a2a", 0.12 * s, 0.6 * s, { y: 0.3 * s, seg: 6 });
  cone(g, leaf, 0.8 * s, 1.2 * s, { y: 1.0 * s, lo: true });
  cone(g, leaf, 0.62 * s, 1.0 * s, { y: 1.55 * s, lo: true });
  cone(g, leaf, 0.42 * s, 0.8 * s, { y: 2.05 * s, lo: true });
  return g;
}
/** A puffy cloud (unlit white blobs). */
export function cloud(parent: THREE.Object3D, x: number, y: number, z: number, s = 1) {
  const g = group(parent, { x, y, z });
  const m = toon("#ffffff", "#c8d8ff", 0.35);
  for (const [dx, dy, r] of [
    [0, 0, 1.2],
    [1.2, -0.2, 0.9],
    [-1.2, -0.25, 0.85],
    [0.5, 0.5, 0.8],
    [-0.5, 0.4, 0.75],
  ])
    ball(g, m, r * s, { x: dx * s, y: dy * s, lo: true, cast: false, receive: false });
  return g;
}
/** The ⓩ: a Z with its two little bars, as an extruded shape (unit size, centred, facing +z). */
let zGeoCache: THREE.BufferGeometry | null = null;
function zGeo() {
  if (zGeoCache) return zGeoCache;
  const s = new THREE.Shape();
  // (the Z in a 1 × 1.3 box: the top bar, the diagonal, the bottom bar, the two ticks)
  const P: [number, number][] = [
    [-0.5, 0.65], [0.5, 0.65], [0.5, 0.4], [-0.12, -0.4], [0.5, -0.4], [0.5, -0.65], [-0.5, -0.65], [-0.5, -0.4], [0.12, 0.4], [-0.5, 0.4],
  ];
  s.moveTo(P[0][0], P[0][1]);
  for (const [x, y] of P.slice(1)) s.lineTo(x, y);
  s.closePath();
  const tick = (y0: number, y1: number) => {
    const t = new THREE.Shape();
    t.moveTo(-0.09, y0);
    t.lineTo(0.09, y0);
    t.lineTo(0.09, y1);
    t.lineTo(-0.09, y1);
    t.closePath();
    return t;
  };
  const g = new THREE.ExtrudeGeometry([s, tick(0.65, 0.88), tick(-0.88, -0.65)], { depth: 0.18, bevelEnabled: false });
  g.translate(0, 0, -0.09);
  g.userData = { shared: true };
  zGeoCache = g;
  return g;
}
/** A spinning gold ⓩ coin (r: radius), standing up: ZStreet's play chip, its Z on both faces. */
export function coinMesh(r = 0.4) {
  const g = new THREE.Group();
  const gold = toon("#ffc928", "#7a5200", 0.35);
  const rim = toon("#e8a200", "#5a3a00", 0.3);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.22, 28), [rim, gold, gold]);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  g.add(body);
  const zMat = toon("#fff1a8", "#b88a00", 0.4);
  for (const side of [1, -1]) {
    const z = new THREE.Mesh(zGeo(), zMat);
    z.scale.set(r * 0.62, r * 0.62, r * 0.5);
    z.position.z = side * r * 0.11;
    if (side < 0) z.rotation.y = Math.PI;
    g.add(z);
  }
  return g;
}
/** A five-point star mesh (r: outer radius, depth). */
export function starGeo(r = 1, depth = 0.35, inner = 0.45) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: r * 0.08, bevelSegments: 2 });
  g.center();
  return g;
}
