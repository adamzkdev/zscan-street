import * as THREE from "three";
import { TOUCH } from "../../scene/quality";

/**
 * The FedosArt Planetarium's moving parts: the dust of space drifting through the room, motes that rise out of a work you walk up
 * to, the portal's swirling membrane, and the material that makes the works on the walls alive
 * (their lights glinting, a sheen crossing the one you stand at, its edges lit).
 */

// ---- a soft dot, for every particle ----------------------------------------------------------------
let dotTex: THREE.Texture | null = null;
export function dot() {
  if (dotTex) return dotTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.65)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

// ---- dust of space ---------------------------------------------------------------------------------------

/** Points drifting slowly round the room's centre, violet, white, a few embers. */
export function dust(centre: THREE.Vector3, radius: number, height: number) {
  const n = TOUCH ? 600 : 1600;
  const pos = new Float32Array(n * 3),
    col = new Float32Array(n * 3);
  const palette = [new THREE.Color("#b8a8ff"), new THREE.Color("#ffffff"), new THREE.Color("#8f7bff"), new THREE.Color("#ff6a70")];
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2,
      r = Math.sqrt(rnd()) * radius;
    pos[i * 3] = Math.sin(a) * r;
    pos[i * 3 + 1] = 0.4 + rnd() ** 1.4 * height;
    pos[i * 3 + 2] = Math.cos(a) * r;
    const c = palette[rnd() < 0.08 ? 3 : Math.floor(rnd() * 3)];
    const k = 0.35 + rnd() * 0.65;
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.075, map: dot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.85 });
  const pts = new THREE.Points(geo, mat);
  pts.position.copy(centre);
  pts.raycast = () => {};
  return {
    points: pts,
    update: (t: number, boost: number) => {
      pts.rotation.y = t * 0.018 + boost * 0.4;
      pts.position.y = centre.y + Math.sin(t * 0.1) * 0.3;
      mat.size = 0.075 * (1 + boost * 1.5);
    },
  };
}

// ---- motes rising out of a work ---------------------------------------------------------------------------

export class Motes {
  readonly points: THREE.Points;
  private n = TOUCH ? 120 : 260;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private tint: Float32Array;
  private i = 0;
  constructor() {
    this.pos = new Float32Array(this.n * 3).fill(-1000);
    this.col = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.life = new Float32Array(this.n);
    this.max = new Float32Array(this.n).fill(1);
    this.tint = new Float32Array(this.n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.11, map: dot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false }),
    );
    this.points.frustumCulled = false;
    this.points.raycast = () => {};
  }

  /** `count` motes from a rectangle (centre, its right and up vectors, half sizes), out along `normal`. */
  emit(count: number, c: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, normal: THREE.Vector3, hw: number, hh: number, color: THREE.Color, lift = 0) {
    for (let k = 0; k < count; k++) {
      const i = this.i++ % this.n;
      const u = (Math.random() * 2 - 1) * hw,
        v = (Math.random() * 2 - 1) * hh;
      this.pos[i * 3] = c.x + right.x * u + up.x * v + normal.x * 0.05;
      this.pos[i * 3 + 1] = c.y + right.y * u + up.y * v;
      this.pos[i * 3 + 2] = c.z + right.z * u + up.z * v + normal.z * 0.05;
      const out = 0.25 + Math.random() * 0.5;
      this.vel[i * 3] = normal.x * out + (Math.random() - 0.5) * 0.2;
      this.vel[i * 3 + 1] = 0.12 + Math.random() * 0.35 + lift * (0.6 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = normal.z * out + (Math.random() - 0.5) * 0.2;
      this.life[i] = 0;
      this.max[i] = (2.5 + Math.random() * 2.5) * (lift ? 1.6 : 1);
      const w = Math.random() < 0.35 ? 1 : 0;
      this.tint[i * 3] = color.r * (1 - w) + w;
      this.tint[i * 3 + 1] = color.g * (1 - w) + w;
      this.tint[i * 3 + 2] = color.b * (1 - w) + w;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.pos[i * 3 + 1] < -500) continue;
      this.life[i] += dt;
      const k = this.life[i] / this.max[i];
      if (k >= 1) {
        this.pos[i * 3 + 1] = -1000;
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      // slowing outward, still rising, a little swirl
      const drag = Math.exp(-dt * 0.6);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt + Math.sin(this.life[i] * 2 + i) * 0.004;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt + Math.cos(this.life[i] * 2 + i) * 0.004;
      const a = Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k) ** 1.2 * 1.8;
      this.col[i * 3] = this.tint[i * 3] * a;
      this.col[i * 3 + 1] = this.tint[i * 3 + 1] * a;
      this.col[i * 3 + 2] = this.tint[i * 3 + 2] * a;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}

// ---- the portal's membrane ------------------------------------------------------------------------------

/** A swirl of red and violet filling an oval `rx` × `ry`; `pulse` (0…1) flares it. */
export function membrane(rx: number, ry: number) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: MEMBRANE_FRAG,
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, ry * 2), mat);
  m.raycast = () => {};
  m.renderOrder = 5;
  return { mesh: m, material: mat };
}

const MEMBRANE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uPulse;
varying vec2 vUv;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float sw = a + uTime * 0.35 + (1.0 - r) * 4.0;
  vec2 q = vec2(cos(sw), sin(sw)) * r;
  float nn = n2(q * 3.0 + uTime * 0.15) * 0.6 + n2(q * 7.0 - uTime * 0.2) * 0.4;
  vec3 c = mix(vec3(0.62, 0.07, 0.13), vec3(0.42, 0.3, 1.0), smoothstep(0.3, 0.8, nn));
  float rim = smoothstep(0.45, 1.0, r);
  float arms = pow(0.5 + 0.5 * sin(sw * 3.0 + r * 6.0 - uTime * 1.2), 6.0) * (0.2 + 0.6 * rim);
  float alpha = (0.012 + 0.45 * rim * rim) * (0.55 + 0.6 * nn) + arms * 0.22 + uPulse * (0.15 + 0.85 * rim) * (0.45 + 0.55 * nn);
  alpha *= smoothstep(1.0, 0.94, r);
  gl_FragColor = vec4(c * (1.0 + uPulse * 2.5), clamp(alpha, 0.0, 1.0));
}`;

// ---- the works alive on the walls ----------------------------------------------------------------------

/**
 * The material for the walls' paintings (one merged mesh): every vertex knows its work (`aIdx`) and
 * where it is on it (`aLuv`, 0…1). Their lights glint all the time; `uWake[i]` (0…1) makes work i
 * brighter, sends a sheen across it and lights its edges.
 */
export function livingMaterial(map: THREE.Texture, n: number) {
  const uniforms = { uTime: { value: 0 }, uWake: { value: new Array<number>(n).fill(0) } };
  const m = new THREE.MeshBasicMaterial({ map, color: "#e4dff0" });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uWake = uniforms.uWake;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aIdx;\nattribute vec2 aLuv;\nvarying float vIdx;\nvarying vec2 vLuv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvIdx = aIdx;\nvLuv = aLuv;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTime;
uniform float uWake[${n}];
varying float vIdx;
varying vec2 vLuv;
float lh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ln(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
{
  float L = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float wk = uWake[int(vIdx + 0.5)];
  // the lights in the work glint (its stars, its glows)
  float g1 = ln(vLuv * vec2(22.0, 28.0) + vec2(uTime * 0.5 + vIdx, -uTime * 0.35));
  float g2 = ln(vLuv * vec2(7.0, 9.0) - vec2(uTime * 0.12, uTime * 0.2) + vIdx * 3.0);
  diffuseColor.rgb += diffuseColor.rgb * smoothstep(0.5, 0.95, L) * g1 * g2 * 2.0 * (0.4 + 0.9 * wk);
  // awake: a sheen crossing it, its edges lit, a little brighter
  float bd = vLuv.x * 0.7 + vLuv.y * 0.7 - mod(uTime * 0.5 + vIdx * 0.37, 2.8) + 0.2;
  diffuseColor.rgb += vec3(0.7, 0.65, 1.0) * exp(-bd * bd * 70.0) * 0.3 * wk;
  vec2 e = min(vLuv, 1.0 - vLuv);
  diffuseColor.rgb += vec3(0.55, 0.45, 1.0) * exp(-min(e.x, e.y) * 45.0) * 0.4 * wk;
  diffuseColor.rgb *= 1.0 + 0.16 * wk;
}`,
      );
  };
  m.customProgramCacheKey = () => `fedos-living-${n}`;
  return { material: m, uniforms };
}
