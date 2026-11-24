import * as THREE from "three";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { LampLights } from "./post";
import { MATERIALS } from "./voxel/mesher";
import { GLASS_NIGHT } from "./voxel/surface";
import { DETAIL_WET } from "./detail";
import { cityEnvironment, SKY_ENVS, skyEnv } from "./envmap";

/**
 * The game's light (src/gta): a continuous day — dawn, morning, noon, the long afternoon, the golden
 * hour with its low warm sun and long shadows, the blue hour when the lamps and the neon come on and
 * the windows light up, the night — and its weather (a few clouds, overcast, showers, a storm). The
 * street's own theme stays day or night (the map view knows nothing else); while the game plays,
 * this paints over it every frame: the sun's place and colour, the sky (a shader dome, not the
 * theme's painted panorama), the fog, the fill light, the exposure, the bloom, the grade, the lamps,
 * the windows, the wet tarmac. Night-only meshes still switch with the theme, at the blue hour.
 */

/** Where the day is, and what the weather does to it. */
export interface Daylight {
  /** 0…24. */
  hour: number;
  /** Toward the sun (unit), and its height (degrees, negative under the horizon). */
  sun: THREE.Vector3;
  el: number;
  /** 0 day … 1 night (the lamps, the neon, the windows). */
  night: number;
  /** Cloud cover, rain (0…1), the tarmac's wetness, a storm, a lightning flash now. */
  cloud: number;
  rain: number;
  wet: number;
  storm: number;
  flash: number;
}

/** Sunrise and sunset (hours). */
export const SUNRISE = 6.2;
export const SUNSET = 19.6;
/** Where the moon lights the night from (the street's own night light). */
const MOON_DIR = new THREE.Vector3(-18, 34, 22).normalize();

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The sun at a time of day: up in the east (+x), across the south (+z), down in the west. */
export function sunAt(hour: number, out = new THREE.Vector3()) {
  const len = SUNSET - SUNRISE;
  const h = ((hour % 24) + 24) % 24;
  let phi: number, el: number;
  if (h >= SUNRISE && h <= SUNSET) {
    // the day's arc: east (+x) at sunrise, high in the south (+z) at noon, west at sunset
    const d = (h - SUNRISE) / len;
    phi = Math.PI * d;
    el = Math.sin(Math.PI * d) * 62;
  } else {
    // (past sunset it goes on down, under the horizon, round by the north to the next sunrise)
    const d = ((h - SUNSET + 24) % 24) / (24 - len);
    phi = Math.PI * (1 + d);
    el = -Math.sin(Math.PI * d) * 40;
  }
  const e = THREE.MathUtils.degToRad(el);
  out.set(Math.cos(phi) * Math.cos(e), Math.sin(e), Math.sin(phi) * Math.cos(e));
  return { dir: out.normalize(), el };
}

/** The day at an hour, in some weather. */
export function daylightAt(hour: number, w: { cloud: number; rain: number; wet: number; storm: number; flash: number }, out?: Daylight): Daylight {
  const d = out ?? ({ sun: new THREE.Vector3() } as Daylight);
  const s = sunAt(hour, d.sun ?? new THREE.Vector3());
  d.hour = hour;
  d.sun = s.dir;
  d.el = s.el;
  d.night = 1 - smooth(-5, 3.5, s.el);
  d.cloud = w.cloud;
  d.rain = w.rain;
  d.wet = w.wet;
  d.storm = w.storm;
  d.flash = w.flash;
  return d;
}

// ---- keyframes by the sun's height --------------------------------------------------------------

type Key = [number, string];
const C = new THREE.Color(),
  C2 = new THREE.Color();
/** A colour from keyframes over the sun's height (degrees), into `out` (linear). */
function ramp(keys: Key[], el: number, out: THREE.Color) {
  if (el <= keys[0][0]) return out.set(keys[0][1]);
  for (let i = 1; i < keys.length; i++)
    if (el <= keys[i][0]) {
      const t = smooth(keys[i - 1][0], keys[i][0], el);
      return out.set(keys[i - 1][1]).lerp(C2.set(keys[i][1]), t);
    }
  return out.set(keys[keys.length - 1][1]);
}
function num(keys: [number, number][], el: number) {
  if (el <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (el <= keys[i][0]) return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * smooth(keys[i - 1][0], keys[i][0], el);
  return keys[keys.length - 1][1];
}

const ZENITH: Key[] = [
  [-16, "#03040e"],
  [-8, "#0b1132"],
  [-3, "#1c2a62"],
  [1, "#2c3c82"],
  [6, "#3556a8"],
  [16, "#2a62c0"],
  [35, "#1d58bf"],
  [60, "#164fbe"],
];
const HORIZON: Key[] = [
  [-16, "#160b22"],
  [-8, "#2a2148"],
  [-3, "#6a4f7c"],
  [0.5, "#ff8650"],
  [5, "#ffa05e"],
  [11, "#f6b88c"],
  [19, "#dccad0"],
  [30, "#c2d3ea"],
  [60, "#b4cdea"],
];
/** The glow round the sun (strong low, gone high and at night). */
const GLOW: Key[] = [
  [-8, "#000000"],
  [-2, "#6a2a3a"],
  [2, "#ff7434"],
  [8, "#ff9448"],
  [16, "#d88648"],
  [28, "#4a3420"],
  [60, "#201810"],
];
const SUNCOL: Key[] = [
  [0, "#ff5a1a"],
  [4, "#ff782c"],
  [9, "#ff9846"],
  [15, "#ffbc6e"],
  [25, "#ffdeb0"],
  [40, "#ffeedb"],
  [60, "#fff4e6"],
];
const HEMI_SKY: Key[] = [
  [-14, "#6a64a8"],
  [-4, "#5866a6"],
  [1, "#d898a8"],
  [8, "#f6b8a0"],
  [16, "#e8d4cc"],
  [28, "#dce4f6"],
  [40, "#d6e4ff"],
];
const HEMI_GROUND: Key[] = [
  [-14, "#1a1420"],
  [-3, "#2a2238"],
  [3, "#6a4458"],
  [10, "#7a5444"],
  [20, "#8e7a6a"],
  [30, "#a89c8c"],
];
const FOG: Key[] = [
  [-14, "#1c0e28"],
  [-6, "#2a2448"],
  [-2, "#5a4a74"],
  [1.5, "#e08a68"],
  [6, "#eaa074"],
  [12, "#e6b898"],
  [20, "#d6cac6"],
  [30, "#bccfe6"],
  [60, "#b8cfea"],
];
const GRADE_GAIN: Key[] = [
  [-12, "#f5f0ff"],
  [-3, "#e6eaff"],
  [2, "#ffe0bc"],
  [8, "#ffe2c0"],
  [16, "#ffecd6"],
  [28, "#fff6ea"],
  [40, "#fff5ec"],
];

// ---- the sky dome ----------------------------------------------------------------------------------

const SKY_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w * 0.99999;
  }`;
const SKY_FRAG = `
  uniform vec3 uZenith, uHorizon, uGlow, uSunCol, uSun, uCloudLit, uCloudDark, uCityGlow;
  uniform float uSunVis, uCloud, uNight, uFlash, uTime, uSet;
  varying vec3 vDir;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(13.1, 7.7); a *= 0.5; }
    return s;
  }
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    float up = pow(max(y, 0.0), 0.45);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 1.0, up));
    float s = max(dot(d, uSun), 0.0);
    // the warm half of the sky round a low sun, wide; a tighter halo
    float side = pow(max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-4), normalize(vec3(uSun.x, 0.0, uSun.z) + 1e-4)), 0.0), 2.0);
    col += uGlow * (pow(s, 5.0) * 0.9 + side * uSet * 0.55 * (1.0 - up)) ;
    col += uSunCol * pow(s, 60.0) * 0.35 * uSunVis;
    // under the horizon: the haze, a little darker
    if (y < 0.0) col = mix(uHorizon, uHorizon * 0.78, smoothstep(0.0, -0.25, y));
    // the city's glow at night, low over the horizon
    col += uCityGlow * uNight * exp(-max(y, 0.0) * 9.0) * 0.6;
    // stars (fewer toward the city's glow)
    if (uNight > 0.01 && y > 0.06) {
      vec2 g = floor(vec2(atan(d.z, d.x) * 380.0, asin(y) * 380.0));
      float st = step(0.9975, h21(g)) * (0.4 + 0.6 * h21(g + 3.1));
      col += vec3(0.9, 0.93, 1.0) * st * uNight * smoothstep(0.06, 0.3, y) * (1.0 - uCloud);
    }
    // the clouds: a layer overhead, drifting; thicker where the cover is
    float dens = 0.0;
    if (y > 0.0) {
      vec2 uv = d.xz / (y + 0.11) * 0.55 + vec2(uTime * 0.006, uTime * 0.0025);
      float n = fbm(uv);
      float n2 = fbm(uv * 2.7 + 5.0);
      float cover = mix(0.78, 0.18, uCloud);
      dens = smoothstep(cover, cover + 0.22, n * 0.8 + n2 * 0.3) * smoothstep(0.0, 0.12, y);
      // lit by the sun on its side, darker underneath and away
      float lit = clamp(0.35 + 0.65 * pow(s, 2.0) + (n2 - 0.5) * 0.5, 0.0, 1.0);
      vec3 cc = mix(uCloudDark, uCloudLit, lit);
      col = mix(col, cc, dens * mix(0.85, 0.97, uCloud));
    }
    // the sun's disc, behind the clouds
    float disc = smoothstep(0.99955, 0.99975, s) * uSunVis * (1.0 - dens * 0.9);
    col += uSunCol * disc * 9.0;
    // lightning: the whole sky, the clouds most
    col += vec3(0.75, 0.8, 1.0) * uFlash * (0.35 + dens * 1.4);
    gl_FragColor = vec4(col, 1.0);
  }`;

/** The rain round the camera: streaks in a box that follows you (wrapping), as many as the shower is heavy. */
const RAIN_VERT = `
  attribute float tip;
  uniform float t, amount;
  uniform vec3 eye;
  varying float a;
  void main() {
    if (fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453) > amount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec3 p = position;
    // the box round the eye: 70 m across, 26 high
    p.y = mod(p.y - t * 17.0 - eye.y + 6.0, 26.0) + eye.y - 6.0;
    p.x = mod(p.x - eye.x + 35.0, 70.0) + eye.x - 35.0 + (p.y - eye.y) * 0.1;
    p.z = mod(p.z - eye.z + 35.0, 70.0) + eye.z - 35.0;
    p.y += tip * 0.55;
    a = 0.36 * (1.0 - tip * 0.6);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

export class GameSky {
  readonly mesh: THREE.Mesh;
  readonly rain: THREE.LineSegments;
  private u: Record<string, THREE.IUniform>;
  private ru: Record<string, THREE.IUniform>;
  private rainTarget = 0;

  constructor(scene: THREE.Scene) {
    this.u = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uCloudLit: { value: new THREE.Color() },
      uCloudDark: { value: new THREE.Color() },
      uCityGlow: { value: new THREE.Color("#5a1a5a") },
      uSunVis: { value: 1 },
      uCloud: { value: 0.3 },
      uNight: { value: 0 },
      uFlash: { value: 0 },
      uTime: { value: 0 },
      uSet: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ name: "GameSky", uniforms: this.u, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
    this.mesh.name = "gta:sky";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.visible = false;
    this.mesh.userData.noField = true;
    scene.add(this.mesh);
    // the rain
    const N = 9000;
    const pos = new Float32Array(N * 6);
    const tip = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * 70,
        y = Math.random() * 26,
        z = Math.random() * 70;
      pos.set([x, y, z, x, y, z], i * 6);
      tip[i * 2 + 1] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("tip", new THREE.BufferAttribute(tip, 1));
    this.ru = { t: { value: 0 }, amount: { value: 0 }, eye: { value: new THREE.Vector3() }, color: { value: new THREE.Color(0.62, 0.68, 0.82) } };
    const rmat = new THREE.ShaderMaterial({ name: "GameRain", uniforms: this.ru, vertexShader: RAIN_VERT, fragmentShader: "uniform vec3 color; varying float a; void main(){ gl_FragColor = vec4(color, a); }", transparent: true, depthWrite: false, fog: false });
    this.rain = new THREE.LineSegments(geo, rmat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.userData.noField = true;
    this.rain.name = "gta:rain";
    scene.add(this.rain);
  }

  /** On while the game's light is (the theme's painted sky otherwise). */
  set on(v: boolean) {
    this.mesh.visible = v;
    if (!v) this.rain.visible = false;
  }
  get on() {
    return this.mesh.visible;
  }

  /** Each frame: round the camera that draws it; the rain building up or dying away. */
  frame(eye: THREE.Vector3, t: number, dt: number) {
    if (!this.mesh.visible) return;
    this.mesh.position.copy(eye);
    this.u.uTime.value = t;
    const a = this.ru.amount;
    a.value += Math.sign(this.rainTarget - a.value) * Math.min(Math.abs(this.rainTarget - a.value), dt / 5);
    this.rain.visible = a.value > 0.002;
    if (this.rain.visible) {
      this.ru.t.value = t;
      (this.ru.eye.value as THREE.Vector3).copy(eye);
    }
  }

  set(d: Daylight) {
    const u = this.u;
    const el = d.el,
      c = d.cloud;
    const grey = C.set(d.night > 0.5 ? "#161820" : "#7c8490").lerp(C2.set("#3a3e48"), d.storm);
    // (under a closed sky the golden hour is only a hint: grey, a faint warmth where the sun is)
    ramp(ZENITH, el, u.uZenith.value).lerp(grey, Math.min(1, c * 0.85));
    ramp(HORIZON, el, u.uHorizon.value).lerp(grey, Math.min(1, c * 0.88));
    ramp(GLOW, el, u.uGlow.value).multiplyScalar(1 - 0.95 * c);
    ramp(SUNCOL, el, u.uSunCol.value);
    (u.uSun.value as THREE.Vector3).copy(d.sun);
    u.uSunVis.value = smooth(-2, 1, el) * (1 - c * 0.9);
    u.uCloud.value = Math.min(1, 0.12 + c * 0.92);
    u.uNight.value = d.night;
    u.uFlash.value = d.flash;
    u.uSet.value = 1 - smooth(4, 20, el);
    // the clouds' light: white by day, gold and pink low, dark blue by night, slate in a storm
    ramp(
      [
        [-10, "#1a1c2c"],
        [-2, "#5a4a6a"],
        [2, "#ffb48a"],
        [10, "#ffe2c8"],
        [25, "#ffffff"],
      ],
      el,
      u.uCloudLit.value,
    ).lerp(C.set(d.night > 0.5 ? "#2a2c38" : "#a8aeb8"), c * 0.6 + d.storm * 0.3);
    ramp(
      [
        [-10, "#0a0a14"],
        [-2, "#2a2440"],
        [3, "#9a6a7a"],
        [12, "#b8b4c0"],
        [25, "#c8d0dc"],
      ],
      el,
      u.uCloudDark.value,
    ).lerp(C.set(d.night > 0.5 ? "#101218" : "#5a606c"), c * 0.7 + d.storm * 0.3);
    this.rainTarget = d.rain;
  }
}

// ---- the light on the city ----------------------------------------------------------------------------

export interface DaylightTargets {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  bloom: UnrealBloomPass;
  lamps: LampLights;
  grade: ShaderPass;
  /** The shadow light's offset from what the camera looks at (written: the sun's way, or the moon's). */
  offset: THREE.Vector3;
}

const EMIT_DAY = new THREE.Color(0.62, 0.62, 0.66);
const EMIT_NIGHT = new THREE.Color(1, 1, 1);
const tmpV = new THREE.Vector3();

/** Paint the day over the street's theme (every frame while the game plays). Returns the shadow strength. */
export function applyDaylight(t: DaylightTargets, d: Daylight) {
  const { renderer, scene, hemi, sun, bloom } = t;
  const el = d.el,
    c = d.cloud;
  const sunCover = 1 - 0.82 * Math.pow(c, 1.3);
  // the shadow light: the sun while it is up (kept at least 9° high: the shadow map's box), the moon
  // at night — switched where both are out
  if (el > -3) {
    tmpV.copy(d.sun);
    const minY = Math.sin(THREE.MathUtils.degToRad(9));
    if (tmpV.y < minY) {
      const h = Math.hypot(tmpV.x, tmpV.z) || 1;
      const k = Math.sqrt(1 - minY * minY) / h;
      tmpV.set(tmpV.x * k, minY, tmpV.z * k);
    }
    t.offset.copy(tmpV).multiplyScalar(46);
    ramp(SUNCOL, el, sun.color);
    // (a low sun is strong and warm, the golden hour's: the shadows long and deep under it)
    sun.intensity = num([
      [-3, 0],
      [1.5, 1.4],
      [6, 3.4],
      [12, 4.1],
      [22, 3.9],
      [40, 3.9],
    ], el) * sunCover;
  } else {
    t.offset.copy(MOON_DIR).multiplyScalar(46);
    sun.color.set("#9fb0ff");
    sun.intensity = 0.9 * (1 - smooth(-12, -3, el)) * (1 - 0.6 * c);
  }
  // shadows: soft and strong under a clear sky, fading under the clouds
  const shadow = (el > -3 ? 0.86 : 1) * (1 - 0.75 * c);
  sun.shadow.radius = el > 6 ? 3 : 2;
  // the sky's fill and the street's bounce
  ramp(HEMI_SKY, el, hemi.color).lerp(C.set(d.night > 0.5 ? "#5a5e80" : "#c8ccd6"), c * 0.8);
  ramp(HEMI_GROUND, el, hemi.groundColor);
  hemi.intensity = num([
    [-14, 1.5],
    [-4, 1.05],
    [1, 0.78],
    [6, 0.6],
    [16, 0.64],
    [30, 0.72],
  ], el) * (1 + 0.45 * c) + d.flash * 3;
  renderer.toneMappingExposure = num([
    [-12, 1.05],
    [-2, 1.02],
    [4, 0.98],
    [20, 0.93],
  ], el) * (1 - 0.06 * d.rain) * (1 - 0.12 * d.storm);
  // the reflections: a real photographed sky by day (a sunset's at the golden hour), the neon room by night
  const sky = skyEnv(el);
  if (sky) {
    if (scene.environment !== sky) scene.environment = sky;
    scene.environmentIntensity = num([
      [-4, 0.18],
      [4, 0.26],
      [14, 0.34],
      [30, 0.42],
    ], el) * (1 - 0.35 * c);
  } else {
    if (el <= -4 && scene.environment && SKY_ENVS.has(scene.environment)) scene.environment = cityEnvironment(renderer, false);
    scene.environmentIntensity = num([
      [-10, 0.24],
      [0, 0.3],
      [10, 0.36],
      [30, 0.45],
    ], el);
  }
  bloom.strength = num([
    [-8, 0.38],
    [-1, 0.3],
    [4, 0.22],
    [14, 0.13],
    [30, 0.08],
  ], el);
  bloom.threshold = num([
    [-8, 0.95],
    [-1, 1.0],
    [5, 1.05],
    [20, 1.2],
  ], el);
  // the fog: the horizon's colour, farther out in clear air, closer in rain
  const fog = scene.fog as THREE.Fog | null;
  if (fog) {
    ramp(FOG, el, fog.color).lerp(C.set(d.night > 0.5 ? "#1a1c24" : d.storm > 0.5 ? "#6a707c" : "#9aa2ae"), Math.min(1, c * 0.9));
    const near = num([
      [-10, 150],
      [0, 150],
      [10, 180],
      [30, 200],
    ], el);
    const far = num([
      [-10, 330],
      [0, 380],
      [10, 420],
      [30, 430],
    ], el);
    fog.near = near * (1 - 0.35 * d.rain);
    fog.far = far * (1 - 0.3 * c) * (1 - 0.35 * d.rain);
  }
  // the lamps, the neon, the rooms behind the glass: in as the light goes
  const n = d.night;
  t.lamps.scale = smooth(0.15, 0.85, n);
  MATERIALS.emit.color.copy(EMIT_DAY).lerp(EMIT_NIGHT, smooth(0.1, 0.8, n));
  GLASS_NIGHT.value = smooth(0.2, 0.9, n);
  // the tarmac: damp at night, wet after the rain
  DETAIL_WET.value = Math.max(0.85 * smooth(0.4, 0.95, n), 0.95 * d.wet);
  // the grade: warm at the golden hour, cool at the blue hour, flatter under the clouds
  const g = t.grade.uniforms;
  const gain = ramp(GRADE_GAIN, el, C).lerp(C2.set("#f2f4f8"), c * 0.75);
  (g.gain.value as THREE.Vector3).set(gain.r * (1.07 - 0.05 * c), gain.g, gain.b * (0.95 + 0.04 * c));
  const lift = g.lift.value as THREE.Vector3;
  if (el > 0) lift.set(0.004, 0.004, 0.012);
  else lift.set(0.003, 0.002, 0.016 + 0.006 * (1 - n));
  g.saturation.value = num([
    [-10, 1.2],
    [-2, 1.16],
    [3, 1.32],
    [14, 1.28],
    [30, 1.2],
  ], el) * (1 - 0.32 * c);
  g.contrast.value = num([
    [-4, 1.06],
    [4, 1.1],
    [25, 1.08],
  ], el) * (1 - 0.04 * c);
  g.vignette.value = num([
    [-6, 0.3],
    [3, 0.28],
    [25, 0.24],
  ], el);
  return shadow;
}
