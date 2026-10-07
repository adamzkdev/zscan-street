import * as THREE from "three";
import { atlasTexture } from "../gallery/cards";

/**
 * A crowd of zkSNARKs. Every fan is a real item of the collection: its portrait (a cell of the
 * collection atlas, one image shared with the museum) is a camera-facing bust standing on a small
 * voxel body in the team's colours (gold Shielded, silver Transparent), scarves and flags in the
 * hands. Everything moves on the GPU: standing up, jumping, raising arms and scarves, flags flying
 * and the Mexican wave; the CPU only sets a few uniforms. Far away the bust becomes a block in the
 * portrait's own colour (one texel of the atlas), so the far side of a bowl costs almost nothing.
 */

export interface FanSeat {
  x: number;
  y: number;
  z: number;
  /** Yaw: the fan faces local +z turned by this angle (towards the pitch). */
  rot: number;
  /** Angle round the bowl, for the wave. */
  ang: number;
  /** 0 gold, 1 silver, 2 neutral, 3 ultras (standing, always bouncing). */
  team: number;
  /** 0 nothing, 1 scarf, 2 flag. */
  kind: number;
  /** Shirt (sRGB hex). */
  shirt: string;
  /** zkSNARK id, 1..10000. */
  id: number;
}

export interface FanUniforms {
  uTime: { value: number };
  /** Wave front angle and strength. */
  uWave: { value: THREE.Vector2 };
  /** Cheer of the gold side, the silver side, everyone. */
  uCheer: { value: THREE.Vector3 };
  uScarf: { value: number };
  uBright: { value: number };
  /** Distance under which the busts show (beyond: a coloured block). */
  uLod: { value: number };
  uReady: { value: number };
  uAtlas: { value: THREE.Texture | null };
}

export interface Fans {
  group: THREE.Group;
  uniforms: FanUniforms;
  seats: FanSeat[];
  /** World position over a fan's head (as it is now: standing, jumping). */
  head(i: number, out: THREE.Vector3): THREE.Vector3;
  /** How many fans are in (the first n of the list). */
  setCount(n: number): void;
  tick(t: number): void;
}

const COMMON = /* glsl */ `
attribute float part;
attribute vec4 aFan;   // angle round the bowl, phase, team, kind
attribute vec3 aShirt;
attribute float aSlot; // atlas slot + 1, negative: mirrored
uniform float uTime;
uniform vec2 uWave;
uniform vec3 uCheer;
uniform float uScarf;
uniform float uLod;
uniform float uReady;
uniform sampler2D uAtlas;
varying vec3 vCol;
varying vec3 vN;
varying vec2 vLocal;
varying float vPart;
float h1(float n) { return fract(sin(n * 91.7 + 3.1) * 43758.5453); }
vec2 cellUv(float slot, vec2 q) {
  float c = mod(slot, 100.0);
  float r = floor(slot / 100.0);
  return vec2((c + q.x) / 100.0, 1.0 - (r + 1.0 - q.y) / 100.0);
}
// the shared motion: how far up the fan is (0 seated .. 1 standing, arms up), and the jump
void motion(out float up, out float stand, out float jump, out float cheer) {
  float ph = aFan.y;
  float team = aFan.z;
  cheer = team < 0.5 || team > 2.5 ? uCheer.x : (team < 1.5 ? uCheer.y : max(uCheer.x, uCheer.y) * 0.6);
  cheer = max(cheer, uCheer.z);
  float d = aFan.x - uWave.x;
  d = atan(sin(d), cos(d));
  float wave = uWave.y * exp(-d * d * 30.0);
  float ultra = team > 2.5 ? 1.0 : 0.0;
  // a few stand up on their own now and then: nobody is ever a statue
  float idle = step(0.93, h1(floor(uTime * 0.11 + ph * 7.0) + ph * 13.0)) * 0.7;
  up = clamp(max(max(max(cheer, wave), ultra * 0.75), idle), 0.0, 1.0);
  stand = smoothstep(0.05, 0.5, up);
  float beat = abs(sin(uTime * (team > 2.5 ? 4.4 : 7.0 + ph * 2.0) + ph * (team > 2.5 ? 0.6 : 40.0)));
  jump = max(cheer, ultra * 0.55) * beat * 0.38 + wave * 0.25 + idle * 0.05 * beat;
}
bool nearCam(vec3 base) {
  float ph = aFan.y;
  return uReady > 0.5 && distance(cameraPosition, base) < uLod * (0.85 + 0.3 * h1(ph * 13.0));
}
`;

const BODY_VERT = /* glsl */ `
${COMMON}
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float ph = aFan.y;
  float kind = aFan.w;
  float up, stand, jump, cheer;
  motion(up, stand, jump, cheer);
  mat4 m = modelMatrix * instanceMatrix;
  vec3 base = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  bool near = nearCam(base);
  // right under the camera: nobody (they would fill the view); a little further, arms, scarves
  // and flags stay low
  float cd = distance(cameraPosition, base);
  if (cd < 3.4 || (part > 6.5 && part < 8.5 && cd < 9.0)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float low = smoothstep(4.0, 18.0, cd);
  vec3 col = aShirt;
  vPart = part;
  vLocal = position.xy;
  if (part > 0.5 && part < 1.5) {
    col = vec3(0.025, 0.025, 0.035) + h1(ph) * vec3(0.03, 0.03, 0.06);
  } else if (part > 3.5 && part < 4.5) {
    // the far head: the portrait's own colour
    if (near) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float s = abs(aSlot) - 1.0;
    col = uReady > 0.5 ? textureLod(uAtlas, cellUv(s, vec2(0.55, 0.42)), 3.0).rgb * 1.35 : vec3(0.62, 0.42, 0.28);
  } else if (part > 4.5 && part < 5.5) {
    // arms: hang from the shoulder, or go up (cheering, the wave, a scarf or a flag pole)
    float r = up;
    if (kind > 0.5 && kind < 1.5) r = max(r, uScarf);
    if (kind > 1.5 && position.x > 0.0) r = max(r, 0.75);
    float clap = step(0.8, h1(ph * 7.0)) * step(0.5, fract(uTime * 1.7 + ph)) * 0.3;
    r = clamp(r + clap, 0.0, 1.0) * mix(0.35, 1.0, low);
    float k = mix(1.0, -1.5, r);
    p.y = 0.8 + (p.y - 0.8) * k;
    p.x = p.x * mix(1.0, 0.9, r) + sign(p.x) * sin(uTime * 9.0 + ph * 20.0) * 0.06 * cheer;
  } else if (part > 5.5 && part < 6.5) {
    // scarf held up between both hands, over the head
    float r = clamp(max(up, uScarf), 0.0, 1.0) * low;
    p.x *= mix(0.42, 1.0, r);
    p.y = mix(0.74, 1.5, r) + p.y + sin(uTime * 3.0 + ph * 9.0) * 0.03 * r;
    p.z += mix(0.2, 0.14, r);
  } else if (part > 6.5 && part < 7.5) {
    // flag cloth, flying from the pole
    float u = clamp((position.x - 0.27) / 1.2, 0.0, 1.0);
    float sp = 4.0 + 5.0 * up;
    p.z += sin(uTime * sp + position.x * 4.0 + ph * 30.0) * 0.22 * u;
    p.y += sin(uTime * sp * 0.7 + position.x * 3.0 + ph * 11.0) * 0.06 * u;
    float sw = sin(uTime * 3.0 + ph * 5.0) * 0.6 * up;
    vec2 q = p.xz - vec2(0.27, 0.05);
    p.xz = vec2(0.27, 0.05) + vec2(q.x * cos(sw) - q.y * sin(sw), q.x * sin(sw) + q.y * cos(sw));
  }
  p.y += stand * 0.34 + jump;
  vN = normalize(mat3(m) * normal);
  vCol = col;
  vec4 mvPosition = viewMatrix * m * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const BODY_FRAG = /* glsl */ `
uniform float uBright;
varying vec3 vCol;
varying vec3 vN;
varying vec2 vLocal;
varying float vPart;
#include <fog_pars_fragment>
void main() {
  vec3 col = vCol;
  if (vPart > 5.5 && vPart < 6.5) {
    // scarves: bars of the colour and black (gold) or navy (silver)
    if (fract(vLocal.x * 5.5) < 0.5) col = vCol.r > vCol.b + 0.2 ? vec3(0.02) : vec3(0.05, 0.07, 0.16);
  } else if (vPart > 6.5 && vPart < 7.5) {
    float s = fract((vLocal.x * 0.9 + vLocal.y) * 1.25);
    if (s < 0.22) col = vCol.r > vCol.b + 0.2 ? vec3(0.03) : vec3(0.12, 0.15, 0.24);
  } else if (vPart > 7.5) {
    col = vec3(0.5);
  }
  vec3 n = normalize(vN);
  float l = 0.38 + 0.5 * max(dot(n, normalize(vec3(0.35, 0.85, 0.3))), 0.0) + 0.3 * max(dot(n, normalize(vec3(-0.4, 0.7, -0.4))), 0.0);
  gl_FragColor = vec4(col * l * uBright, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const BUST_VERT = /* glsl */ `
${COMMON}
#include <fog_pars_vertex>
varying vec2 vUv;
varying float vSlot;
void main() {
  float up, stand, jump, cheer;
  motion(up, stand, jump, cheer);
  mat4 m = modelMatrix * instanceMatrix;
  vec3 base = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  if (!nearCam(base) || distance(cameraPosition, base) < 3.4) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float sc = length(m[0].xyz);
  float ph = aFan.y;
  // the bust stands on the shoulders, turned to the camera round the vertical
  vec3 c = (m * vec4(0.0, 0.5 + stand * 0.34 + jump, 0.04, 1.0)).xyz;
  vec3 tc = cameraPosition - c;
  tc.y = 0.0;
  tc = normalize(tc);
  vec3 right = vec3(tc.z, 0.0, -tc.x);
  // a sway when they sing, a lean into the shout
  float sway = sin(uTime * 2.2 + ph * 17.0) * 0.06 * (0.3 + cheer);
  float w = 0.7 * sc;
  vec3 wp = c + right * ((position.x + sway * position.y) * w) + vec3(0.0, position.y * w, 0.0) + tc * 0.16 * sc;
  vUv = uv;
  if (aSlot < 0.0) vUv.x = 1.0 - vUv.x;
  vSlot = abs(aSlot) - 1.0;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const BUST_FRAG = /* glsl */ `
uniform float uBright;
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vSlot;
#include <fog_pars_fragment>
void main() {
  float c = mod(vSlot, 100.0);
  float r = floor(vSlot / 100.0);
  vec2 q = vUv * 0.94 + 0.03;
  vec4 tx = texture2D(uAtlas, vec2((c + q.x) / 100.0, 1.0 - (r + 1.0 - q.y) / 100.0));
  // the flat black background of the portrait goes
  if (max(tx.r, max(tx.g, tx.b)) < 0.008) discard;
  gl_FragColor = vec4(tx.rgb * uBright * 1.05, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Box faces into arrays, tagged with a part number. */
function boxInto(pos: number[], nor: number[], prt: number[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, part: number, bottom = false) {
  const f = (a: number[], b: number[], c: number[], d: number[], n: number[]) => {
    for (const v of [a, b, c, a, c, d]) {
      pos.push(...v);
      nor.push(...n);
      prt.push(part);
    }
  };
  f([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
  f([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  f([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
  f([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
  f([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
  if (bottom) f([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
}

function geo(build: (pos: number[], nor: number[], prt: number[]) => void) {
  const pos: number[] = [],
    nor: number[] = [],
    prt: number[] = [];
  build(pos, nor, prt);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("part", new THREE.Float32BufferAttribute(prt, 1));
  return g;
}

let atlasReady = false;
/** The collection atlas (shared with the museum: one request), and whether it has arrived. */
function atlas() {
  const t = atlasTexture();
  const img = t.image as { width?: number } | undefined;
  if (!atlasReady && img && (img.width ?? 0) > 0) atlasReady = true;
  return t;
}

/** The ids of a whole crowd: every seat a different zkSNARK (10,000 of them), shuffled by `seed`. */
export function crowdIds(n: number, seed: number) {
  const a = 1 + ((seed * 2654435761) >>> 0) % 10000;
  return Array.from({ length: n }, (_, i) => 1 + ((a + i * 7919) % 10000));
}

export function buildFans(seats: FanSeat[], o: { lod?: number; bright?: number; fog?: boolean; scale?: number } = {}): Fans {
  const group = new THREE.Group();
  const uniforms: FanUniforms = {
    uTime: { value: 0 },
    uWave: { value: new THREE.Vector2(0, 0) },
    uCheer: { value: new THREE.Vector3(0, 0, 0) },
    uScarf: { value: 0 },
    uBright: { value: o.bright ?? 1.25 },
    uLod: { value: o.lod ?? 48 },
    uReady: { value: 0 },
    uAtlas: { value: atlas() },
  };
  const fog = o.fog ?? false;
  const u = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms } as unknown as Record<string, THREE.IUniform>;
  const bodyMat = new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, uniforms: u, side: THREE.DoubleSide, fog });
  const bustMat = new THREE.ShaderMaterial({ vertexShader: BUST_VERT, fragmentShader: BUST_FRAG, uniforms: u, side: THREE.DoubleSide, fog });

  const body = geo((pos, nor, prt) => {
    // seat, legs (dark), torso and arms in the shirt colour, the far head
    boxInto(pos, nor, prt, -0.17, 0.0, -0.05, 0.17, 0.42, 0.3, 1);
    boxInto(pos, nor, prt, -0.19, 0.42, -0.13, 0.19, 0.8, 0.09, 0);
    boxInto(pos, nor, prt, -0.17, 0.8, -0.12, 0.17, 1.16, 0.14, 4);
    boxInto(pos, nor, prt, -0.28, 0.46, -0.07, -0.19, 0.8, 0.06, 5);
    boxInto(pos, nor, prt, 0.19, 0.46, -0.07, 0.28, 0.8, 0.06, 5);
  });
  const bust = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  bust.setAttribute("part", new THREE.Float32BufferAttribute(new Array(4).fill(9), 1));
  const scarf = geo((pos, nor, prt) => boxInto(pos, nor, prt, -0.45, -0.07, -0.015, 0.45, 0.07, 0.015, 6, true));
  const flag = geo((pos, nor, prt) => {
    boxInto(pos, nor, prt, 0.255, 0.75, 0.035, 0.285, 2.45, 0.065, 8);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const xa = 0.27 + (1.2 * i) / n,
        xb = 0.27 + (1.2 * (i + 1)) / n;
      const a = [xa, 1.6, 0.05],
        b = [xb, 1.6, 0.05],
        c = [xb, 2.4, 0.05],
        d = [xa, 2.4, 0.05];
      for (const v of [a, b, c, a, c, d]) {
        pos.push(...v);
        nor.push(0, 0, 1);
        prt.push(7);
      }
    }
  });

  const R = (() => {
    let s = 977;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  })();
  const sc = o.scale ?? 1;
  const mtx = (s: FanSeat) => new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot), new THREE.Vector3(sc, sc, sc));
  const phases = seats.map(() => R());
  const flips = seats.map(() => R() < 0.5);
  const meshes: { im: THREE.InstancedMesh; idx: number[] }[] = [];
  const make = (g: THREE.BufferGeometry, mat: THREE.Material, idx: number[], color?: (s: FanSeat) => string) => {
    const n = idx.length;
    const im = new THREE.InstancedMesh(g, mat, Math.max(1, n));
    im.count = n;
    const fan = new Float32Array(Math.max(1, n) * 4);
    const shirt = new Float32Array(Math.max(1, n) * 3);
    const slot = new Float32Array(Math.max(1, n));
    const c = new THREE.Color();
    idx.forEach((si, i) => {
      const s = seats[si];
      im.setMatrixAt(i, mtx(s));
      fan.set([s.ang, phases[si], s.team, s.kind], i * 4);
      c.set(color ? color(s) : s.shirt);
      shirt.set([c.r, c.g, c.b], i * 3);
      slot[i] = flips[si] ? -s.id : s.id;
    });
    g.setAttribute("aFan", new THREE.InstancedBufferAttribute(fan, 4));
    g.setAttribute("aShirt", new THREE.InstancedBufferAttribute(shirt, 3));
    g.setAttribute("aSlot", new THREE.InstancedBufferAttribute(slot, 1));
    im.frustumCulled = false;
    im.raycast = () => {};
    group.add(im);
    meshes.push({ im, idx });
    return im;
  };
  const all = seats.map((_, i) => i);
  make(body, bodyMat, all);
  make(bust, bustMat, all);
  const teamCol = (s: FanSeat) => (s.team === 1 ? "#c8ccd8" : s.team === 2 ? "#e8e4dc" : "#f4b728");
  make(
    scarf,
    bodyMat,
    all.filter((i) => seats[i].kind === 1),
    teamCol,
  );
  make(
    flag,
    bodyMat,
    all.filter((i) => seats[i].kind === 2),
    teamCol,
  );

  const fanPos = new THREE.Vector3();
  return {
    group,
    uniforms,
    seats,
    head(i, out) {
      const s = seats[i];
      const cheer = Math.max(s.team === 1 ? uniforms.uCheer.value.y : uniforms.uCheer.value.x, uniforms.uCheer.value.z);
      fanPos.set(s.x, s.y + (1.25 + 0.34 * Math.min(1, cheer * 2)) * sc, s.z);
      return out.copy(fanPos).applyMatrix4(group.matrixWorld);
    },
    setCount(n) {
      // the first n seats: every mesh keeps the instances whose seat is among them
      for (const { im, idx } of meshes) {
        let k = 0;
        while (k < idx.length && idx[k] < n) k++;
        im.count = k;
      }
    },
    tick(t) {
      uniforms.uTime.value = t;
      if (!uniforms.uReady.value) {
        atlas();
        if (atlasReady) uniforms.uReady.value = 1;
      }
    },
  };
}
