import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { paint, type PalmKit } from "./kit";

/**
 * THE PALM's outdoor pieces: the sea (a light shader: waves, the shallows turning turquoise near
 * the sand, sun glints, a fade into the panorama), coconut palms (ringed trunks, textured drooping
 * fronds merged into one mesh per zone), beach umbrellas, modern villas, sand, and the night switch
 * for the windows.
 */

// ---- the sea ------------------------------------------------------------------------------------

const WATER_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform vec4 uShore;
uniform vec4 uShore2;
uniform vec4 uShore3;
uniform float uFade;
uniform float uCalm;
varying vec3 vW;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec2 wave(vec2 p, vec2 d, float k, float s, float a) {
  float ph = dot(d, p) * k + uTime * s;
  return d * cos(ph) * k * a;
}
void main() {
  vec2 p = vW.xz;
  vec2 g = vec2(0.0);
  g += wave(p, normalize(vec2(0.8, 0.6)), 0.45, 1.1, 0.06);
  g += wave(p, normalize(vec2(-0.3, 1.0)), 0.9, 1.7, 0.035);
  g += wave(p, normalize(vec2(1.0, -0.4)), 1.9, 2.6, 0.018);
  g += wave(p, normalize(vec2(-0.7, -0.7)), 3.7, 3.4, 0.008);
  float n1 = noise(p * 1.3 + uTime * 0.35) - 0.5;
  float n2 = noise(p.yx * 2.7 - uTime * 0.5) - 0.5;
  g += vec2(n1, n2) * 0.18;
  g *= uCalm;
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  // the shallows: turquoise over the sand near the shore lines, deep blue further out
  float d = 1e4;
  if (uShore.w > 0.0) d = (dot(p, uShore.xy) + uShore.z) / uShore.w;
  // a second line closes a corner of land (max), a third is another shore across the water (min)
  if (uShore2.w > 0.0) d = max(d, (dot(p, uShore2.xy) + uShore2.z) / uShore2.w);
  if (uShore3.w > 0.0) d = min(d, (dot(p, uShore3.xy) + uShore3.z) / uShore3.w);
  float sh = smoothstep(0.0, 1.0, d);
  vec3 base = mix(uShallow, uDeep, sh);
  base *= 0.92 + 0.16 * noise(p * 0.15 + uTime * 0.02);
  vec3 col = mix(base, uSky, clamp(fres * 0.85, 0.0, 0.85));
  vec3 R = reflect(-V, n);
  float sp = max(dot(R, normalize(uSunDir)), 0.0);
  col += uSun * (pow(sp, 260.0) * 6.0 + pow(sp, 18.0) * 0.18);
  // glitter
  float gl = step(0.985, noise(p * 9.0 + uTime * 1.3)) * pow(sp, 6.0);
  col += uSun * gl * 2.0;
  // foam where it meets the sand
  if (d < 0.25) {
    float dd = d * (uShore.w > 0.0 ? uShore.w : 1.0);
    float lap = 0.55 + 0.35 * sin(uTime * 0.9 + p.y * 0.05 + p.x * 0.05);
    float foam = smoothstep(0.9, 0.0, abs(dd - lap)) * (0.55 + 0.45 * noise(p * 3.0 + uTime));
    foam += smoothstep(0.35, 0.0, dd) * 0.8;
    col = mix(col, vec3(0.95, 0.97, 0.98) * max(uSun.r, 0.35), clamp(foam, 0.0, 0.85));
  }
  float dist = length(cameraPosition.xz - p);
  float a = 1.0 - smoothstep(uFade * 0.55, uFade, dist);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface Sea {
  mesh: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
}

/**
 * Water over a rectangle at height y. `shore`: up to two lines [nx, nz, c, width]: the water is
 * shallow where nx·x + nz·z + c is small (metres from the sand), deep `width` metres further out.
 */
export function sea(k: PalmKit, f: number, o: { x0: number; z0: number; x1: number; z1: number; y?: number; shore?: [number, number, number, number]; shore2?: [number, number, number, number]; shore3?: [number, number, number, number]; fade?: number; deep?: string; shallow?: string; sky?: string; sunDir?: [number, number, number]; calm?: number; night?: { deep: string; shallow: string; sky: string; sun: string }; day?: { sun: string } }) {
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(o.deep ?? "#0f6f9a") },
    uShallow: { value: new THREE.Color(o.shallow ?? "#3fd6d0") },
    uSky: { value: new THREE.Color(o.sky ?? "#b8dcf0") },
    uSun: { value: new THREE.Color(o.day?.sun ?? "#fff4dc") },
    uSunDir: { value: new THREE.Vector3(...(o.sunDir ?? [0.4, 0.5, -0.8])) },
    uShore: { value: new THREE.Vector4(...(o.shore ?? [0, 0, 0, 0])) },
    uShore2: { value: new THREE.Vector4(...(o.shore2 ?? [0, 0, 0, 0])) },
    uShore3: { value: new THREE.Vector4(...(o.shore3 ?? [0, 0, 0, 0])) },
    uFade: { value: o.fade ?? 200 },
    uCalm: { value: o.calm ?? 1 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.x1 - o.x0, o.z1 - o.z0), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((o.x0 + o.x1) / 2, k.y(f) + (o.y ?? 0), (o.z0 + o.z1) / 2);
  mesh.raycast = () => {};
  mesh.renderOrder = 1;
  k.groups[f].add(mesh);
  k.ticks[f].push((_dt, t) => (uniforms.uTime.value = t));
  const day = { deep: o.deep ?? "#0f6f9a", shallow: o.shallow ?? "#3fd6d0", sky: o.sky ?? "#b8dcf0", sun: o.day?.sun ?? "#fff4dc" };
  const night = o.night ?? { deep: "#04121e", shallow: "#0a3440", sky: "#14223a", sun: "#9ab8e0" };
  const apply = (n: boolean) => {
    const s = n ? night : day;
    (uniforms.uDeep.value as THREE.Color).set(s.deep);
    (uniforms.uShallow.value as THREE.Color).set(s.shallow);
    (uniforms.uSky.value as THREE.Color).set(s.sky);
    (uniforms.uSun.value as THREE.Color).set(s.sun);
  };
  apply(k.night);
  k.themeFns.push(apply);
  return { mesh, uniforms } as Sea;
}

// ---- ground textures ------------------------------------------------------------------------------

let sandT: THREE.Texture | null = null;
/** Fine pale sand with ripples and a few shells. */
export function sandTex() {
  if (sandT) return sandT;
  sandT = paint(512, 512, (g, W, H) => {
    g.fillStyle = "#e9d2a0";
    g.fillRect(0, 0, W, H);
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 26;
      img.data[i] += n;
      img.data[i + 1] += n * 0.95;
      img.data[i + 2] += n * 0.8;
    }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.07;
    g.strokeStyle = "#9a7a4a";
    for (let y = 0; y < H; y += 9) {
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 3);
      g.stroke();
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 26; i++) {
      g.fillStyle = ["#f8f2e4", "#e8c8b0", "#d8b890"][i % 3];
      g.beginPath();
      g.ellipse(Math.random() * W, Math.random() * H, 1.5 + Math.random() * 2, 1 + Math.random(), Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  sandT.wrapS = sandT.wrapT = THREE.RepeatWrapping;
  return sandT;
}

/** A textured ground plane (sand, lawn, decking): `tile` metres per repeat. */
export function ground(k: PalmKit, f: number, tex: THREE.Texture, x0: number, z0: number, x1: number, z1: number, tile = 6, dy = 0, color = "#ffffff", rough = 0.95) {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set((x1 - x0) / tile, (z1 - z0) / tile);
  t.needsUpdate = true;
  const m = k.flat(f, x1 - x0, z1 - z0, new THREE.MeshStandardMaterial({ map: t, color, roughness: rough }), (x0 + x1) / 2, (z0 + z1) / 2, dy);
  return m;
}

let lawnT: THREE.Texture | null = null;
export function lawnTex() {
  if (lawnT) return lawnT;
  lawnT = paint(256, 256, (g, W, H) => {
    g.fillStyle = "#5f9e3e";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = ["#6aab46", "#558f36", "#74b350", "#4e8632"][i % 4];
      g.fillRect(Math.random() * W, Math.random() * H, 1, 2 + Math.random() * 3);
    }
    // mower stripes
    g.globalAlpha = 0.07;
    g.fillStyle = "#ffffff";
    for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 32, H);
    g.globalAlpha = 1;
  });
  return lawnT;
}

let deckT: THREE.Texture | null = null;
/** Teak decking: boards along u. */
export function deckTex() {
  if (deckT) return deckT;
  deckT = paint(512, 512, (g, W, H) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const y = (i * H) / n;
      g.fillStyle = ["#9a6a42", "#8e603a", "#a3734a", "#94663e"][i % 4];
      g.fillRect(0, y, W, H / n);
      g.globalAlpha = 0.12;
      for (let s = 0; s < 14; s++) {
        g.fillStyle = s % 2 ? "#5a3a1e" : "#c08a5a";
        g.fillRect(0, y + 4 + Math.random() * (H / n - 8), W, 1);
      }
      g.globalAlpha = 1;
      g.fillStyle = "#3a2414";
      g.fillRect(0, y, W, 2.5);
      const cut = (i * 197) % W;
      g.fillRect(cut, y, 2, H / n);
    }
  });
  return deckT;
}

let stoneT: THREE.Texture | null = null;
/** Travertine slabs. */
export function stoneTex() {
  if (stoneT) return stoneT;
  stoneT = paint(512, 512, (g, W, H) => {
    const t = W / 4;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        g.fillStyle = ["#e8dcc6", "#e2d4bc", "#ece2ce", "#ddd0b6"][(i + j * 3) % 4];
        g.fillRect(i * t, j * t, t, t);
        g.globalAlpha = 0.1;
        for (let s = 0; s < 10; s++) {
          g.fillStyle = "#b8a080";
          g.fillRect(i * t, j * t + Math.random() * t, t, 1 + Math.random() * 2);
        }
        g.globalAlpha = 1;
      }
    g.strokeStyle = "rgba(120,100,70,0.35)";
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * t, 0);
      g.lineTo(i * t, H);
      g.moveTo(0, i * t);
      g.lineTo(W, i * t);
      g.stroke();
    }
  });
  return stoneT;
}

// ---- palms -------------------------------------------------------------------------------------

let frondMat: THREE.Material | null = null;
function frondMaterial() {
  if (frondMat) return frondMat;
  const t = paint(512, 128, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const mid = H / 2;
    // leaflets: thin blades off the rib, longer in the middle of the frond, drooping to the tip
    for (let x = 6; x < W - 4; x += 5) {
      const u = x / W;
      const len = (H * 0.48) * Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.08)) * (0.85 + Math.random() * 0.2);
      for (const s of [-1, 1]) {
        g.strokeStyle = ["#3d8a34", "#4c9a3c", "#327a2c", "#5aa844", "#43902f"][Math.floor(Math.random() * 5)];
        g.lineWidth = 3.2;
        g.beginPath();
        g.moveTo(x, mid);
        g.quadraticCurveTo(x + len * 0.35, mid + s * len * 0.5, x + len * 0.6, mid + s * len);
        g.stroke();
      }
    }
    g.strokeStyle = "#8a8a3a";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, mid);
    g.lineTo(W, mid);
    g.stroke();
  });
  t.anisotropy = 8;
  frondMat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
  return frondMat;
}

/** One frond: a long strip bent down under its own weight, folded into a shallow V along its rib. */
function frondGeo(len: number, wid: number, droop: number, rise: number) {
  const seg = 8;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const x = t * len;
    const y = rise * Math.sin(t * Math.PI * 0.6) - droop * t * t;
    for (const [v, s] of [
      [0, -1],
      [0.5, 0],
      [1, 1],
    ] as const) {
      pos.push(x, y - Math.abs(s) * wid * 0.22, (s * wid) / 2);
      uv.push(t, v);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j,
        b = a + 3;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/**
 * A coconut palm `h` metres tall at (x, z): a ringed trunk curving with its lean, a crown of a
 * dozen drooping fronds (merged into the zone's frond mesh), a few coconuts.
 */
export function palmTree(k: PalmKit, f: number, x: number, z: number, h = 8, seed = 1, o: { dy?: number; lean?: number; dir?: number; scale?: number } = {}) {
  const r = (i: number) => k.rnd(seed, i, 77);
  const lean = o.lean ?? 0.6 + r(1) * 1.6;
  const dir = o.dir ?? r(2) * Math.PI * 2;
  const dy = o.dy ?? 0;
  const s = o.scale ?? 1;
  const n = 10;
  let px = x,
    pz = z,
    py = dy;
  for (let i = 0; i < n; i++) {
    const t0 = i / n,
      t1 = (i + 1) / n;
    const x1 = x + Math.cos(dir) * lean * t1 * t1,
      z1 = z + Math.sin(dir) * lean * t1 * t1,
      y1 = dy + h * t1;
    const a = new THREE.Vector3(px, py, pz),
      b = new THREE.Vector3(x1, y1, z1);
    const d = b.clone().sub(a);
    const r0 = (0.24 - t0 * 0.08) * s,
      r1 = (0.24 - t1 * 0.08) * s;
    const geo = new THREE.CylinderGeometry(r1, r0 * 1.06, d.length(), 9).translate(0, d.length() / 2, 0);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    geo.translate(a.x, a.y, a.z);
    k.geo(f, geo, i % 2 ? "#8a6c4a" : "#76593a");
    // the ring
    k.geo(f, new THREE.CylinderGeometry(r1 * 1.12, r1 * 1.12, 0.06, 9).translate(x1, y1 - 0.03, z1), "#5e4630");
    px = x1;
    pz = z1;
    py = y1;
  }
  // crown: a knot, coconuts, fronds
  k.geo(f, new THREE.SphereGeometry(0.3 * s, 10, 8).scale(1, 0.8, 1).translate(px, py, pz), "#6f7a32");
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + r(3);
    k.geo(f, new THREE.SphereGeometry(0.13 * s, 8, 6).translate(px + Math.cos(a) * 0.22 * s, py - 0.22 * s, pz + Math.sin(a) * 0.22 * s), i % 2 ? "#6a4a24" : "#7a8a30");
  }
  const nf = 13;
  for (let i = 0; i < nf; i++) {
    const up = i % 3 === 0;
    const len = (up ? 2.6 : 3.4 + r(10 + i) * 0.8) * s;
    const g = frondGeo(len, (0.9 + r(20 + i) * 0.25) * s, up ? 0.6 * s : (1.6 + r(30 + i) * 0.8) * s, up ? 0.9 * s : 0.5 * s);
    g.rotateZ(up ? 0.5 : 0.05);
    g.rotateY((i / nf) * Math.PI * 2 + r(40 + i) * 0.3);
    g.translate(px, py + 0.05, pz);
    k.tex(f, "frond", frondMaterial(), g);
  }
}

// ---- beach umbrella, lounger -------------------------------------------------------------------

/** A beach umbrella: an eight-panel canopy in two colours, a tilted pole. */
export function umbrella(k: PalmKit, f: number, x: number, z: number, a: string, b = "#f6f2ea", R = 1.35, h = 2.35, dy = 0) {
  k.cyl(f, 0.03, 0.03, h + 0.1, x, dy, z, "#d8d0c0", "matte", 6);
  for (let i = 0; i < 8; i++) {
    const g = new THREE.CylinderGeometry(0.02, R, 0.42, 1, 1, true, (i / 8) * Math.PI * 2, (Math.PI * 2) / 8);
    g.translate(x, dy + h + 0.2, z);
    k.geo(f, g, i % 2 ? a : b);
    // the valance
    const v = new THREE.CylinderGeometry(R, R, 0.12, 1, 1, true, (i / 8) * Math.PI * 2, (Math.PI * 2) / 8).translate(x, dy + h - 0.05, z);
    k.geo(f, v, i % 2 ? a : b);
  }
  k.geo(f, new THREE.SphereGeometry(0.05, 6, 4).translate(x, dy + h + 0.45, z), "#d8d0c0");
}

/** A low beach lounger with a cushion and a folded towel, facing `ry` (0: head towards +z). */
export function lounger(k: PalmKit, f: number, x: number, z: number, ry: number, cushion: string, towel: string | null = null, dy = 0) {
  const g: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, color: string, finish: "matte" | "polish" = "matte") => {
    geo.rotateY(ry).translate(x, dy, z);
    k.geo(f, geo, color, finish);
  };
  void g;
  add(new THREE.BoxGeometry(0.7, 0.08, 1.45).translate(0, 0.3, -0.2), "#e8e4dc", "polish");
  for (const [lx, lz] of [
    [-0.3, -0.85],
    [0.3, -0.85],
    [-0.3, 0.4],
    [0.3, 0.4],
  ])
    add(new THREE.BoxGeometry(0.05, 0.3, 0.05).translate(lx, 0, lz).translate(0, 0.15, 0), "#c8c4bc");
  add(new THREE.BoxGeometry(0.64, 0.08, 1.4).translate(0, 0.38, -0.2), cushion);
  // backrest, raised
  const back = new THREE.BoxGeometry(0.64, 0.1, 0.75).translate(0, 0, 0.37);
  back.rotateX(-0.6);
  add(back.translate(0, 0.42, 0.5), cushion);
  if (towel) add(new THREE.BoxGeometry(0.5, 0.04, 0.6).translate(0, 0.44, -0.45), towel);
}

// ---- modern villa ------------------------------------------------------------------------------

/**
 * A modern Palm villa seen from its garden (the garden faces +x before turning by `ry`): a white
 * two-storey block with floor-to-ceiling glass, a cantilevered upper volume with a thin flat roof
 * slab, a timber screen, a travertine terrace. (x, z) is the house's centre.
 */
export function villa(k: PalmKit, f: number, x: number, z: number, ry: number, seed: number, o: { w?: number; d?: number; scale?: number } = {}) {
  const W = o.w ?? 16,
    D = o.d ?? 12;
  const s = o.scale ?? 1;
  const c = Math.cos(ry),
    sn = Math.sin(ry);
  const P = (lx: number, lz: number) => [x + (lx * c + lz * sn) * s, z + (-lx * sn + lz * c) * s] as const;
  const B = (w: number, h: number, d: number, lx: number, y: number, lz: number, color: string, finish: "matte" | "polish" | "metal" | "glow" | "window" = "matte") => {
    const [px, pz] = P(lx, lz);
    const g = new THREE.BoxGeometry(w * s, h * s, d * s).translate(0, (h * s) / 2, 0).rotateY(ry).translate(px, y * s, pz);
    k.geo(f, g, color, finish);
  };
  const white = ["#f6f3ec", "#f2eee4", "#f8f6f0"][seed % 3];
  const accent = ["#9a7a5a", "#5a5650", "#b8946a", "#3a3a40"][seed % 4];
  // ground floor: glass all round between a solid service end
  B(W, 0.35, D, 0, 0, 0, "#e4dccb");
  B(W * 0.32, 3.6, D, -W * 0.34, 0.35, 0, white);
  B(W * 0.68, 0.25, D, W * 0.16, 3.7, 0, white);
  B(W * 0.66, 3.35, D - 0.4, W * 0.16, 0.35, 0, "#ffd9a0", "window");
  for (let i = 0; i < 5; i++) B(0.08, 3.35, D - 0.3, -W * 0.18 + (i * W * 0.66) / 4, 0.35, 0, "#2a2a2e", "metal");
  // first floor: a long white box sliding out over the terrace, glass on the garden side
  B(W * 0.78, 3.4, D * 0.8, W * 0.05, 3.95, -D * 0.08, white);
  B(W * 0.5, 2.4, 0.12, W * 0.12, 4.45, D * 0.33, "#ffd9a0", "window");
  // the timber screen on the upper glass
  for (let i = 0; i < 14; i++) B(0.08, 2.6, 0.12, -W * 0.13 + i * (W * 0.5) / 13, 4.35, D * 0.33 + 0.12, accent);
  // the roof slab, thin and overhanging
  B(W * 0.92, 0.28, D * 1.02, W * 0.05, 7.35, -D * 0.02, "#ece8e0");
  B(W * 0.92, 0.06, D * 1.02, W * 0.05, 7.3, -D * 0.02, accent);
  // a terrace upstairs: glass balustrade
  B(W * 0.16, 1.0, D * 0.8, -W * 0.38, 3.95, -D * 0.08, "#9ad0e0", "polish");
  // the travertine terrace and steps down to the garden
  B(W * 1.1, 0.3, D * 0.5, W * 0.05, 0, D * 0.62, "#e8dcc6");
}

// ---- a sky dome (the crescent's sunset) ---------------------------------------------------------

/** A big sky sphere painted with a gradient, a sun (or a moon) and clouds. */
export function skyDome(stops: [number, string][], o: { sun?: [number, number, string, number]; stars?: boolean; clouds?: string; skyline?: string } = {}) {
  return paint(2048, 1024, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    for (const [t, c] of stops) gr.addColorStop(t, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    if (o.stars)
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
        const r = Math.random() < 0.05 ? 1.6 : 0.8;
        g.fillRect(Math.random() * W, Math.random() * H * 0.48, r, r);
      }
    if (o.sun) {
      const [u, v, color, rad] = o.sun;
      const sx = u * W,
        sy = v * H;
      const halo = g.createRadialGradient(sx, sy, 0, sx, sy, rad * 9);
      halo.addColorStop(0, color);
      halo.addColorStop(0.12, color + "aa");
      halo.addColorStop(1, color + "00");
      g.fillStyle = halo;
      g.fillRect(sx - rad * 9, sy - rad * 9, rad * 18, rad * 18);
      g.fillStyle = "#fff8e8";
      g.beginPath();
      g.arc(sx, sy, rad, 0, Math.PI * 2);
      g.fill();
    }
    if (o.clouds)
      for (let i = 0; i < 40; i++) {
        const cx = Math.random() * W,
          cy = H * (0.25 + Math.random() * 0.2),
          w = 80 + Math.random() * 260;
        g.fillStyle = o.clouds;
        g.globalAlpha = 0.25 + Math.random() * 0.35;
        g.beginPath();
        g.ellipse(cx, cy, w, 6 + Math.random() * 10, 0, 0, Math.PI * 2);
        g.fill();
      }
    g.globalAlpha = 1;
  });
}

/** Merge helper for a few loose geometries. */
export function merge(list: THREE.BufferGeometry[]) {
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
}

// ---- the city panorama under a Dubai sky ---------------------------------------------------------

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const DOME_FRAG = /* glsl */ `
uniform samplerCube uCube;
uniform float uHas;
uniform float uRot;
uniform float uDay;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec3 d = normalize(vDir);
  float cr = cos(uRot), sr = sin(uRot);
  vec3 q = vec3(cr * d.x - sr * d.z, d.y, sr * d.x + cr * d.z);
  // the sky: deep blue overhead, paling to a hazy horizon, the sun's glow, thin high cloud
  float e = clamp(d.y, -0.2, 1.0);
  vec3 sky = mix(uHorizon, uMid, smoothstep(0.0, 0.18, e));
  sky = mix(sky, uZenith, smoothstep(0.18, 0.75, e));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  sky += uSunCol * (pow(s, 600.0) * 4.0 + pow(s, 24.0) * 0.25 + pow(s, 4.0) * 0.08);
  float cl = noise(vec2(atan(d.z, d.x) * 6.0, e * 30.0)) * noise(vec2(atan(d.z, d.x) * 17.0, e * 70.0));
  sky = mix(sky, vec3(1.0), smoothstep(0.25, 0.7, cl) * smoothstep(0.02, 0.12, e) * (1.0 - smoothstep(0.3, 0.6, e)) * 0.55 * uDay);
  vec3 col = sky;
  if (uHas > 0.5) {
    vec3 c = textureCube(uCube, q).rgb;
    // the street's own studio sky (pale lavender) and its haze give way to ours
    float lo = min(c.r, min(c.g, c.b));
    float key = smoothstep(0.5, 0.68, lo) * smoothstep(0.0, 0.02, c.b - c.r) * (1.0 - smoothstep(0.12, 0.2, c.b - c.r)) * (1.0 - smoothstep(0.08, 0.14, abs(c.g - c.r)));
    key *= uDay;
    // below the horizon there is no street, only sea: keep the sky's horizon colour there
    col = mix(c, sky, key);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface Dome {
  mesh: THREE.Mesh;
  set(cube: THREE.Texture | null, rot: number, day: boolean): void;
}

/** The background of the outdoor zones: the real city (the panorama) with its pale studio sky
 *  swapped for a deep blue Gulf sky by day, a sun, thin cloud. One mesh that follows the eye. */
export function cityDome(sunDir: [number, number, number] = [0.5, 0.45, -0.75]): Dome {
  const uniforms = {
    uCube: { value: null as THREE.Texture | null },
    uHas: { value: 0 },
    uRot: { value: 0 },
    uDay: { value: 1 },
    uZenith: { value: new THREE.Color("#1f6fc8") },
    uMid: { value: new THREE.Color("#5aa6e6") },
    uHorizon: { value: new THREE.Color("#cfe6f2") },
    uSunDir: { value: new THREE.Vector3(...sunDir) },
    uSunCol: { value: new THREE.Color("#fff2d0") },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), mat);
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return {
    mesh,
    set(cube, rot, day) {
      uniforms.uCube.value = cube;
      uniforms.uHas.value = cube ? 1 : 0;
      uniforms.uRot.value = rot;
      uniforms.uDay.value = day ? 1 : 0;
      uniforms.uZenith.value.set(day ? "#1f6fc8" : "#05070f");
      uniforms.uMid.value.set(day ? "#5aa6e6" : "#0b1430");
      uniforms.uHorizon.value.set(day ? "#cfe6f2" : "#1c2448");
      uniforms.uSunCol.value.set(day ? "#fff2d0" : "#000000");
    },
  };
}

// ---- thatch ---------------------------------------------------------------------------------------

let thatchM: THREE.Material | null = null;
let fringeM: THREE.Material | null = null;
function thatchMats() {
  if (thatchM && fringeM) return [thatchM, fringeM] as const;
  const straw = (g: CanvasRenderingContext2D, W: number, H: number, rows: number) => {
    for (let r = 0; r < rows; r++) {
      const y0 = (r * H) / rows;
      for (let i = 0; i < W * 1.4; i++) {
        const x = Math.random() * W;
        const len = (H / rows) * (1.1 + Math.random() * 0.5);
        g.strokeStyle = ["#c9a560", "#b8924e", "#d8b672", "#a8843f", "#e0c080"][Math.floor(Math.random() * 5)];
        g.lineWidth = 1 + Math.random() * 1.5;
        g.beginPath();
        g.moveTo(x, y0 - 2);
        g.lineTo(x + (Math.random() - 0.5) * 6, y0 + len);
        g.stroke();
      }
      g.fillStyle = "rgba(60,40,20,0.25)";
      g.fillRect(0, y0 + H / rows - 3, W, 3);
    }
  };
  const t = paint(256, 256, (g, W, H) => {
    g.fillStyle = "#9a7840";
    g.fillRect(0, 0, W, H);
    straw(g, W, H, 4);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  thatchM = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side: THREE.DoubleSide });
  const fr = paint(256, 64, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    for (let i = 0; i < W * 2; i++) {
      const x = Math.random() * W;
      g.strokeStyle = ["#c9a560", "#b8924e", "#d8b672", "#a8843f"][Math.floor(Math.random() * 4)];
      g.lineWidth = 1.2 + Math.random();
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + (Math.random() - 0.5) * 4, H * (0.55 + Math.random() * 0.45));
      g.stroke();
    }
  });
  fr.wrapS = THREE.RepeatWrapping;
  fringeM = new THREE.MeshStandardMaterial({ map: fr, alphaTest: 0.4, roughness: 0.95, side: THREE.DoubleSide });
  return [thatchM, fringeM] as const;
}

/**
 * A thatched hip roof: eaves w × d at y0 (centre cx, cz), its ridge along z `h` higher, the straw
 * hanging off the eaves in a ragged fringe.
 */
export function thatchRoof(k: PalmKit, f: number, cx: number, y0: number, cz: number, w: number, d: number, h: number) {
  const [roofM, frM] = thatchMats();
  const hw = w / 2,
    hd = d / 2,
    rz = Math.max(0, hd - hw);
  const P = (x: number, y: number, z: number) => [cx + x, y0 + y, cz + z];
  const tri: number[] = [];
  const uv: number[] = [];
  const S = 1.2; // metres per texture repeat
  const quad = (a: number[], b: number[], c: number[], dd: number[], ua: number[], ub: number[], uc: number[], ud: number[]) => {
    tri.push(...a, ...b, ...c, ...a, ...c, ...dd);
    uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  };
  const slope = Math.hypot(h, hw);
  // the long sides (trapezoids), then the hipped ends (triangles as degenerate quads)
  for (const s of [-1, 1]) {
    quad(P(s * hw, 0, -hd), P(s * hw, 0, hd), P(0, h, rz), P(0, h, -rz), [0, 0], [d / S, 0], [(hd + rz) / S, slope / S], [(hd - rz) / S, slope / S]);
    quad(P(-hw, 0, s * hd), P(hw, 0, s * hd), P(0, h, s * rz), P(0, h, s * rz), [0, 0], [w / S, 0], [hw / S, slope / S], [hw / S, slope / S]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  k.tex(f, "thatch", roofM, g);
  // the fringe: four ragged strips round the eaves
  for (const [x0, z0, x1, z1] of [
    [-hw, -hd, hw, -hd],
    [hw, -hd, hw, hd],
    [hw, hd, -hw, hd],
    [-hw, hd, -hw, -hd],
  ]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const fg = new THREE.PlaneGeometry(len, 0.6);
    const a = fg.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) a.setX(i, a.getX(i) * (len / 1.5));
    fg.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    fg.translate(cx + (x0 + x1) / 2, y0 - 0.28, cz + (z0 + z1) / 2);
    k.tex(f, "fringe", frM, fg);
  }
}
