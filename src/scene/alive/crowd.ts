import * as THREE from "three";
import { atlasBitmap } from "../../data/atlas";

/**
 * Thousands of zkSNARKs in one draw call (and one for their blob shadows). Every walker is a real
 * portrait from the collection atlas with pixel legs, and most of them move on the GPU alone: the
 * vertex shader puts each one on its loop round a block's pavement, its back-and-forth along a path
 * or its run along a race course, from the clock. Nothing is uploaded per frame; the few people who
 * stand (queues, bus stops, audiences, dancers) are written once.
 *
 * Kinds (iB.w):
 *  0 loop round the rectangle iA = (x0, z0, x1, z1)
 *  1 standing at iA = (x, z, heading, fidget); looks about now and then
 *  2 a dog on a loop (like 0)
 *  3 back and forth along the segment iA = (xa, za, xb, zb)
 *  4 a runner of the race along iA, while the race is on (uRace = its start time)
 *  5 dancing at iA = (x, z, heading, 0)
 *  6 a dog standing (like 1)
 *  7 a dog back and forth (like 3)
 * iB = (speed m/s, phase m, y, kind); iC = (slot, scale).
 */

export const Kind = { Loop: 0, Stand: 1, DogLoop: 2, Path: 3, Race: 4, Dance: 5, DogStand: 6, DogPath: 7 } as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

const S = 1.42;
const PX = S / 26;
const ACOLS = 16;
const CELLS = 256;
/** The last cells of the atlas hold the dogs (two coats, two frames each). */
const DOG0 = 252;
export const PORTRAITS = DOG0;

export interface Person {
  kind: Kind;
  a: [number, number, number, number];
  speed?: number;
  phase?: number;
  y?: number;
  slot?: number;
  scale?: number;
  /** Bright kit (runners' vests), else the portrait's own clothes. */
  cloth?: THREE.ColorRepresentation;
}

const CORE = /* glsl */ `
attribute vec4 iA;
attribute vec4 iB;
attribute vec2 iC;
uniform float uTime;
uniform float uRace;
uniform vec3 uFocus;
uniform float uRadius;
float hh(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
// where the walker is, which way it goes, how much its legs swing, its stride phase; false: hidden
bool walker(out vec3 P, out vec2 D, out float amp, out float anim) {
  int kind = int(iB.w + 0.5);
  float sp = iB.x;
  P = vec3(0.0, iB.z, 0.0);
  D = vec2(1.0, 0.0);
  amp = 1.0;
  anim = iB.y * 3.1 + abs(sp) * uTime * 5.2;
  if (kind == 0 || kind == 2) {
    float w = iA.z - iA.x, h = iA.w - iA.y, per = 2.0 * (w + h);
    float s = mod(iB.y + sp * uTime, per);
    if (s < w) { P.xz = vec2(iA.x + s, iA.y); D = vec2(1.0, 0.0); }
    else if (s < w + h) { P.xz = vec2(iA.z, iA.y + s - w); D = vec2(0.0, 1.0); }
    else if (s < 2.0 * w + h) { P.xz = vec2(iA.z - (s - w - h), iA.w); D = vec2(-1.0, 0.0); }
    else { P.xz = vec2(iA.x, iA.w - (s - 2.0 * w - h)); D = vec2(0.0, -1.0); }
    D *= sign(sp);
  } else if (kind == 3 || kind == 7) {
    vec2 ab = iA.zw - iA.xy;
    float len = max(length(ab), 0.01);
    float s = mod(iB.y + abs(sp) * uTime, 2.0 * len);
    float d = s < len ? s : 2.0 * len - s;
    P.xz = iA.xy + ab * (d / len);
    D = (s < len ? ab : -ab) / len;
  } else if (kind == 4) {
    vec2 ab = iA.zw - iA.xy;
    float len = max(length(ab), 0.01);
    float s = (uTime - uRace) * abs(sp) - iB.y;
    if (uRace < 0.0 || s < 0.0 || s > len) return false;
    P.xz = iA.xy + ab * (s / len);
    D = ab / len;
  } else {
    P.xz = iA.xy;
    D = vec2(cos(iA.z), sin(iA.z));
    amp = 0.0;
    // standing: now and then a look the other way
    float k = floor(uTime / (4.0 + hh(iB.y) * 7.0) + iB.y);
    if (iA.w > 0.0 && hh(k + iB.y * 3.0) < 0.3) D = -D;
    if (kind == 5) {
      P.y += abs(sin(uTime * 6.5 + iB.y)) * 0.22;
      if (fract(uTime * 0.55 + iB.y) < 0.5) D = -D;
      amp = 0.6;
      anim = uTime * 13.0 + iB.y;
    }
  }
  float far = length(P.xz - uFocus.xz);
  if (far > uRadius) return false;
  return true;
}`;

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
${CORE}
attribute vec3 iCloth;
uniform float uPx;
varying vec2 vPx;
varying float vSlot;
varying vec3 vCloth;
varying vec3 vAnim;
varying float vDog;
void main() {
  vec3 P; vec2 D; float amp; float anim;
  if (!walker(P, D, amp, anim)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  int kind = int(iB.w + 0.5);
  vDog = (kind == 2 || kind == 6 || kind == 7) ? 1.0 : 0.0;
  vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  float flip = dot(vec3(D.x, 0.0, D.y), right) < 0.0 ? -1.0 : 1.0;
  float px = uPx * iC.y;
  vec2 q = position.xy;
  float lx = (q.x + 0.5) * 26.0;
  float feet = vDog > 0.5 ? 13.0 : (flip > 0.0 ? 15.5 : 10.5);
  vec3 wp = P + right * ((lx - feet) * px) + vec3(0.0, q.y * 35.0 * px, 0.0);
  vPx = vec2(flip > 0.0 ? lx : 26.0 - lx, q.y * 35.0);
  vSlot = iC.x;
  vCloth = iCloth;
  float s = sin(anim);
  vAnim = vec3(floor(s * 1.4 * amp + 0.5), floor(abs(s) * 1.2 * amp + 0.5), s * amp);
  if (vDog > 0.5) vAnim = vec3(step(0.0, s) * amp, 0.0, 0.0);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
uniform vec2 uGrid;
varying vec2 vPx;
varying float vSlot;
varying vec3 vCloth;
varying vec3 vAnim;
varying float vDog;
vec4 cell(float slot, vec2 cuv) {
  float c = mod(slot, uGrid.x), r = floor(slot / uGrid.x);
  vec2 uv = vec2((c + cuv.x) / uGrid.x, 1.0 - (r + 1.0 - cuv.y) / uGrid.y);
  return texture2D(uMap, uv);
}
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
  if (vDog > 0.5) {
    vec2 dp = p - vec2(2.0, 0.0);
    if (dp.y < 32.0 && dp.x >= 0.0 && dp.x < 32.0) {
      vec4 t = cell(${DOG0}.0 + mod(vSlot, 2.0) * 2.0 + vAnim.x, (dp + 0.5) / 32.0);
      if (t.a > 0.5) col = vec4(t.rgb, 1.0);
    }
  } else {
    float py = p.y - 6.0 - vAnim.y;
    if (py >= 0.0 && py < 26.0) {
      vec2 cuv = (vec2(p.x, py) + 0.5) / 26.0;
      vec4 t = cell(vSlot, cuv * 0.96 + 0.02);
      if (t.a > 0.5) col = vec4(t.rgb, 1.0);
    }
    if (col.a < 0.5 && p.y < 10.0) {
      float sw = vAnim.x;
      vec4 a = leg(p, 10.0 + sw, floor(max(0.0, vAnim.z) * 2.0 + 0.5));
      vec4 b = leg(p, 16.0 - sw, floor(max(0.0, -vAnim.z) * 2.0 + 0.5));
      col = a.a > 0.5 ? a : b;
    }
  }
  if (col.a < 0.5) discard;
  gl_FragColor = vec4(col.rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const SHADOW_VERT = /* glsl */ `
${CORE}
varying vec2 vUv;
void main() {
  vec3 P; vec2 D; float amp; float anim;
  if (!walker(P, D, amp, anim)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vUv = uv;
  vec3 wp = vec3(P.x, iB.z + 0.02, P.z) + vec3(position.x * 0.9, 0.0, position.y * 0.5) * iC.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const SHADOW_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  float d = length(vUv * 2.0 - 1.0);
  gl_FragColor = vec4(0.0, 0.0, 0.0, (1.0 - smoothstep(0.25, 1.0, d)) * 0.42);
}`;

// ---- the atlas -----------------------------------------------------------------------------------

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

/** A dog, side view, 26 px wide, nose to the right, bottom row = the ground. */
function drawDog(g: CanvasRenderingContext2D, ox: number, oy: number, coat: number, frame: number) {
  const [fur, dark, light] = coat ? ["#c8873a", "#8a5422", "#f2d2a0"] : ["#2a2830", "#141318", "#e8e4dc"];
  // y counted from the bottom of the 32 px cell
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(ox + x, oy + 32 - y - h, w, h);
  };
  // legs: two poses
  const legs = frame ? [3, 7, 14, 17] : [4, 6, 15, 16];
  for (const x of legs) px(x, 0, 2, 5, dark);
  px(2, 4, 16, 5, fur);
  px(4, 4, 11, 2, light);
  // tail up
  px(0, 8, 2, 2, fur);
  px(1, 10, 1, frame ? 3 : 2, fur);
  // head and ears, collar in ZEC gold
  px(15, 7, 6, 6, fur);
  px(20, 8, 2, 3, light);
  px(22, 9, 1, 1, "#16141c");
  px(18, 11, 1, 1, "#16141c");
  px(15, 12, 2, 3, dark);
  px(15, 7, 2, 2, "#f4b728");
}

let atlas: Promise<{ tex: THREE.Texture; cloth: THREE.Color[] }> | null = null;
function loadAtlas() {
  atlas ??= (async () => {
    const r = rng(4242);
    const ids: number[] = [];
    const seen = new Set<number>();
    while (ids.length < PORTRAITS) {
      const id = 1 + Math.floor(r() * 10000);
      if (!seen.has(id)) seen.add(id), ids.push(id);
    }
    const c = document.createElement("canvas");
    c.width = ACOLS * 32;
    c.height = (CELLS / ACOLS) * 32;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    const cloth: THREE.Color[] = [];
    try {
      // one shared download for the whole app (retried on API trouble)
      const bmp = await atlasBitmap();
      const cs = bmp.width / 100;
      g.imageSmoothingEnabled = false;
      ids.forEach((id, i) => g.drawImage(bmp, ((id - 1) % 100) * cs, Math.floor((id - 1) / 100) * cs, cs, cs, (i % ACOLS) * 32, Math.floor(i / ACOLS) * 32, 32, 32));
      bmp.close();
      const img = g.getImageData(0, 0, c.width, c.height);
      const d = img.data,
        W = c.width;
      const bg = (i: number) => d[i] <= 38 && d[i + 1] <= 38 && d[i + 2] <= 38;
      for (let k = 0; k < PORTRAITS; k++) {
        const ox = (k % ACOLS) * 32,
          oy = Math.floor(k / ACOLS) * 32;
        const done = new Uint8Array(32 * 32);
        const stack: number[] = [];
        for (let t = 0; t < 32; t++) stack.push(t, 31 * 32 + t, t * 32, t * 32 + 31);
        while (stack.length) {
          const q = stack.pop()!;
          if (done[q]) continue;
          done[q] = 1;
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
        cloth.push(n ? new THREE.Color().setRGB(rr / n / 255, gg / n / 255, bb / n / 255, THREE.SRGBColorSpace).multiplyScalar(0.62) : new THREE.Color("#2e2c38"));
      }
      g.putImageData(img, 0, 0);
    } catch {
      g.clearRect(0, 0, c.width, c.height);
      for (let k = 0; k < PORTRAITS; k++) {
        const ox = (k % ACOLS) * 32,
          oy = Math.floor(k / ACOLS) * 32;
        const hue = Math.floor(r() * 360);
        g.fillStyle = `hsl(${hue},45%,40%)`;
        g.fillRect(ox + 10, oy + 20, 16, 12);
        g.fillStyle = `hsl(${(hue + 40) % 360},35%,70%)`;
        g.fillRect(ox + 12, oy + 8, 12, 12);
        cloth.push(new THREE.Color(`hsl(${hue},45%,25%)`));
      }
    }
    for (let k = 0; k < 4; k++) drawDog(g, ((DOG0 + k) % ACOLS) * 32, Math.floor((DOG0 + k) / ACOLS) * 32, k >> 1, k & 1);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    return { tex, cloth };
  })();
  return atlas;
}

// ---- the crowd -----------------------------------------------------------------------------------

export class Crowd {
  readonly mesh: THREE.Mesh;
  readonly shadows: THREE.Mesh;
  readonly people: Person[];
  private mat: THREE.ShaderMaterial;
  private shadowMat: THREE.ShaderMaterial;
  private A: THREE.InstancedBufferAttribute;
  private B: THREE.InstancedBufferAttribute;
  readonly uniforms: { uTime: { value: number }; uRace: { value: number }; uFocus: { value: THREE.Vector3 }; uRadius: { value: number } };

  constructor(people: Person[], seed = 1) {
    this.people = people;
    const r = rng(seed);
    const N = people.length;
    const A = new Float32Array(N * 4),
      B = new Float32Array(N * 4),
      Cc = new Float32Array(N * 2);
    people.forEach((p, i) => {
      A.set(p.a, i * 4);
      p.phase ??= r() * 400;
      p.slot ??= Math.floor(r() * PORTRAITS);
      B.set([p.speed ?? 0, p.phase, p.y ?? 0.2, p.kind], i * 4);
      Cc.set([p.slot, p.scale ?? 1], i * 2);
    });
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute("position", quad.getAttribute("position"));
    geo.setAttribute("uv", quad.getAttribute("uv"));
    this.A = new THREE.InstancedBufferAttribute(A, 4);
    this.B = new THREE.InstancedBufferAttribute(B, 4);
    geo.setAttribute("iA", this.A);
    geo.setAttribute("iB", this.B);
    geo.setAttribute("iC", new THREE.InstancedBufferAttribute(Cc, 2));
    geo.setAttribute("iCloth", new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3));
    geo.instanceCount = N;
    this.uniforms = { uTime: { value: 0 }, uRace: { value: -1 }, uFocus: { value: new THREE.Vector3() }, uRadius: { value: 1e5 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uGrid: { value: new THREE.Vector2(ACOLS, CELLS / ACOLS) }, uPx: { value: PX } }]), ...this.uniforms },
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const sq = new THREE.PlaneGeometry(1, 1);
    const sg = new THREE.InstancedBufferGeometry();
    sg.index = sq.index;
    sg.setAttribute("position", sq.getAttribute("position"));
    sg.setAttribute("uv", sq.getAttribute("uv"));
    for (const k of ["iA", "iB", "iC"]) sg.setAttribute(k, geo.getAttribute(k));
    sg.instanceCount = N;
    this.shadowMat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG, transparent: true, depthWrite: false });
    this.shadows = new THREE.Mesh(sg, this.shadowMat);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 2;
    this.mesh.raycast = this.shadows.raycast = () => {};
    this.shadows.visible = false;
    void loadAtlas().then(({ tex, cloth }) => {
      const at = geo.getAttribute("iCloth") as THREE.InstancedBufferAttribute;
      people.forEach((p, i) => {
        const c = p.cloth !== undefined ? new THREE.Color(p.cloth) : cloth[p.slot! % cloth.length];
        at.setXYZ(i, c.r, c.g, c.b);
      });
      at.needsUpdate = true;
      this.mat.uniforms.uMap.value = tex;
      this.mesh.visible = true;
      this.shadows.visible = true;
    });
  }

  /** Move a standing person (kinds 1, 5, 6). */
  place(i: number, x: number, z: number, heading: number) {
    const a = this.A.array as Float32Array;
    a[i * 4] = x;
    a[i * 4 + 1] = z;
    a[i * 4 + 2] = heading;
    this.A.needsUpdate = true;
  }

  /** Where person `i` is right now (mirrors the shader), for speech bubbles. */
  positionOf(i: number, out: THREE.Vector3) {
    const p = this.people[i];
    const t = this.uniforms.uTime.value;
    const [ax, az, bx, bz] = p.a;
    const sp = p.speed ?? 0,
      ph = p.phase ?? 0;
    out.set(ax, p.y ?? 0.2, az);
    if (p.kind === Kind.Loop || p.kind === Kind.DogLoop) {
      const w = bx - ax,
        h = bz - az,
        per = 2 * (w + h);
      const s = (((ph + sp * t) % per) + per) % per;
      if (s < w) out.set(ax + s, out.y, az);
      else if (s < w + h) out.set(bx, out.y, az + s - w);
      else if (s < 2 * w + h) out.set(bx - (s - w - h), out.y, bz);
      else out.set(ax, out.y, bz - (s - 2 * w - h));
    } else if (p.kind === Kind.Path || p.kind === Kind.DogPath) {
      const len = Math.max(Math.hypot(bx - ax, bz - az), 0.01);
      const s = (ph + Math.abs(sp) * t) % (2 * len);
      const d = s < len ? s : 2 * len - s;
      out.set(ax + ((bx - ax) * d) / len, out.y, az + ((bz - az) * d) / len);
    }
    return out;
  }

  update(t: number, focus: THREE.Vector3, radius: number, race: number) {
    this.uniforms.uTime.value = t;
    this.uniforms.uFocus.value.copy(focus);
    this.uniforms.uRadius.value = radius;
    this.uniforms.uRace.value = race;
  }
}
