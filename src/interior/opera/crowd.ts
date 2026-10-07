import * as THREE from "three";
import { atlasTexture } from "../gallery/cards";

/**
 * The audience: every spectator is a real zkSNARK, its portrait looked up in the collection atlas
 * (100 × 100 cells, item n at slot n − 1), drawn as one instanced billboard that turns round its
 * vertical axis to the viewer. The shader bounces them when they applaud and stands a share of
 * them up for the ovation; the CPU only moves three uniforms.
 */

const VERT = /* glsl */ `
attribute float aSlot;
attribute float aPh;
uniform float uTime;
uniform float uClap;
uniform float uStand;
varying vec2 vUv;
varying float vSlot;
void main() {
  vUv = uv;
  vSlot = aSlot;
  mat4 im = modelMatrix * instanceMatrix;
  vec3 c = (im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float s = length(im[0].xyz);
  vec3 toCam = cameraPosition - c;
  toCam.y = 0.0;
  toCam = normalize(toCam + vec3(1e-4, 0.0, 0.0));
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  float clap = uClap * abs(sin(uTime * (7.0 + aPh * 5.0) + aPh * 31.0)) * 0.06;
  float sway = 0.012 * sin(uTime * 1.3 + aPh * 17.0);
  float stand = uStand * 0.34 * step(0.3, fract(aPh * 7.31));
  vec3 p = c + right * (position.x * s + sway) + vec3(0.0, position.y * s + clap + stand, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uLight;
uniform float uReady;
varying vec2 vUv;
varying float vSlot;
void main() {
  if (uReady < 0.5) discard;
  float col = mod(vSlot, 100.0);
  float row = floor(vSlot / 100.0);
  vec2 q = vUv * 0.94 + 0.03;
  vec2 uv = vec2((col + q.x) / 100.0, 1.0 - (row + 1.0 - q.y) / 100.0);
  vec4 t = texture2D(uMap, uv);
  float m = max(t.r, max(t.g, t.b));
  // the flat black background round the bust goes; black inside the portrait stays
  if (m < 0.04 && (abs(vUv.x - 0.5) > 0.2 || vUv.y > 0.58)) discard;
  gl_FragColor = vec4(t.rgb * uLight, 1.0);
  #include <colorspace_fragment>
}`;

export interface Seat {
  x: number;
  y: number;
  z: number;
  /** Yaw of the seat (0 faces +z). */
  rot: number;
}

export interface Audience {
  mesh: THREE.InstancedMesh;
  seats: Seat[];
  ids: number[];
  uniforms: { uTime: { value: number }; uClap: { value: number }; uStand: { value: number }; uLight: { value: number } };
  tick(dt: number): void;
}

/** Fill `seats` (most of them) with zkSNARKs; `seatMesh` draws all seats, empty or not. */
export function buildAudience(parent: THREE.Object3D, seats: Seat[], seed: number, fill = 0.9): Audience {
  let a = seed;
  const R = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  // the seats: plum velvet cushions on birch frames
  {
    const cushion = new THREE.BoxGeometry(0.5, 0.12, 0.46).translate(0, 0.4, 0.02);
    const back = new THREE.BoxGeometry(0.5, 0.5, 0.08).translate(0, 0.66, -0.2);
    const frame = new THREE.BoxGeometry(0.06, 0.45, 0.5).translate(-0.27, 0.22, 0);
    const frame2 = frame.clone().translate(0.54, 0, 0);
    const parts = [cushion, back, frame, frame2].map((g) => g.toNonIndexed());
    const pos: number[] = [],
      nor: number[] = [],
      col: number[] = [];
    parts.forEach((g, k) => {
      const p = g.getAttribute("position").array,
        n = g.getAttribute("normal").array;
      const c = new THREE.Color(k < 2 ? "#6a1e3c" : "#c8b48e");
      for (let i = 0; i < p.length; i++) pos.push(p[i]), nor.push(n[i]);
      for (let i = 0; i < p.length / 3; i++) col.push(c.r, c.g, c.b);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), seats.length);
    const mtx = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0),
      one = new THREE.Vector3(1, 1, 1);
    seats.forEach((s, i) => im.setMatrixAt(i, mtx.compose(new THREE.Vector3(s.x, s.y, s.z), q.setFromAxisAngle(up, s.rot), one)));
    im.raycast = () => {};
    parent.add(im);
  }
  const taken = seats.filter(() => R() < fill);
  const ids = taken.map(() => 1 + Math.floor(R() * 10000));
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  geo.setAttribute("aSlot", new THREE.InstancedBufferAttribute(new Float32Array(ids.map((id) => id - 1)), 1));
  geo.setAttribute("aPh", new THREE.InstancedBufferAttribute(new Float32Array(ids.map(() => R())), 1));
  const tex = atlasTexture();
  const uniforms = { uTime: { value: 0 }, uClap: { value: 0 }, uStand: { value: 0 }, uLight: { value: 0.9 }, uMap: { value: tex }, uReady: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, taken.length);
  const mtx = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    sc = new THREE.Vector3(0.7, 0.7, 0.7);
  taken.forEach((s, i) => mesh.setMatrixAt(i, mtx.compose(new THREE.Vector3(s.x, s.y + 0.42, s.z), q.setFromAxisAngle(up, s.rot), sc)));
  mesh.frustumCulled = false;
  parent.add(mesh);
  return {
    mesh,
    seats: taken,
    ids,
    uniforms,
    tick(dt) {
      uniforms.uTime.value += dt;
      const img = tex.image as { width?: number } | undefined;
      if (!uniforms.uReady.value && img && img.width) uniforms.uReady.value = 1;
    },
  };
}
