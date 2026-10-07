import * as THREE from "three";
import { atlasTexture } from "../gallery/cards";

/**
 * Readers sitting on the white steps: every one a real zkSNARK, its portrait looked up in the
 * collection atlas (100 × 100 cells, item n at slot n − 1), drawn as one instanced billboard that
 * turns round its vertical axis to the viewer, nodding over its book now and then.
 */

const VERT = /* glsl */ `
attribute float aSlot;
attribute float aPh;
uniform float uTime;
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
  float nod = 0.018 * max(0.0, sin(uTime * 0.7 + aPh * 40.0)) * step(0.6, fract(aPh * 13.7));
  vec3 p = c + right * position.x * s + vec3(0.0, position.y * s - nod * position.y, 0.0);
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
  if (m < 0.04 && (abs(vUv.x - 0.5) > 0.2 || vUv.y > 0.58)) discard;
  gl_FragColor = vec4(t.rgb * uLight, 1.0);
  #include <colorspace_fragment>
}`;

export interface Crowd {
  mesh: THREE.InstancedMesh;
  ids: number[];
  spots: THREE.Vector3[];
  tick(dt: number): void;
}

export function buildCrowd(spots: THREE.Vector3[], seed: number, size = 0.62): Crowd {
  let a = seed;
  const R = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  const ids = spots.map(() => 1 + Math.floor(R() * 10000));
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  geo.setAttribute("aSlot", new THREE.InstancedBufferAttribute(new Float32Array(ids.map((id) => id - 1)), 1));
  geo.setAttribute("aPh", new THREE.InstancedBufferAttribute(new Float32Array(ids.map(() => R())), 1));
  const tex = atlasTexture();
  const uniforms = { uTime: { value: 0 }, uLight: { value: 1.0 }, uMap: { value: tex }, uReady: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    sc = new THREE.Vector3(size, size, size);
  spots.forEach((p, i) => mesh.setMatrixAt(i, m.compose(p, q, sc)));
  mesh.frustumCulled = false;
  return {
    mesh,
    ids,
    spots,
    tick(dt) {
      uniforms.uTime.value += dt;
      const img = tex.image as { width?: number } | undefined;
      if (!uniforms.uReady.value && img && img.width) uniforms.uReady.value = 1;
    },
  };
}
