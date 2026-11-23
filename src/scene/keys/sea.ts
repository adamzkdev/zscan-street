import * as THREE from "three";
import { CITY } from "../city/plan";
import { KEYS, SEA_Y } from "./plan";

/**
 * The sea round Orchard Keys (src/scene/keys): not the city's flat blue sheet but water you can see
 * into — clear turquoise over the sand where it is shallow, deepening to blue, the floor's ripples
 * showing through; swell moving on it, small ripples catching the sun, a white line where it meets
 * the sand and the waves breaking in rows over the shelf. One grid mesh (2 m), the depth per vertex
 * (from the ground's heights), one cheap shader; seen from under the surface, a blue ceiling.
 * The city's sea plane has a hole cut where this one lies (city/index.ts coast()).
 */

/**
 * Where this water lies (the city's own bay water runs to CITY.maxZ: this starts there), on out past
 * the town's box a way, so where it meets the city's plain sea is far off in the haze.
 */
export const SEA_RECT = { x0: KEYS.x0 - 120, x1: KEYS.x1 + 120, z0: CITY.maxZ, z1: KEYS.z1 + 160 };

const VERT = /* glsl */ `
attribute float aDepth;
varying float vDepth;
varying vec3 vWorld;
uniform float uTime;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  // the swell, flattened in the shallows (no water climbing the sand)
  float amp = 0.045 * smoothstep(0.15, 1.6, aDepth);
  p.y += amp * (sin(p.x * 0.31 + uTime * 1.25) + 0.7 * sin(p.z * 0.43 - uTime * 1.05));
  vDepth = aDepth;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uTime, uNight;
uniform vec3 uSun, uSky, uShallow, uDeep, uFoam;
varying float vDepth;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float d = vDepth;
  if (d < -0.02) discard;
  vec2 q = vWorld.xz;
  float t = uTime;
  // the surface's slope: the swell, then ripples, then glints
  vec2 g = vec2(0.31 * cos(q.x * 0.31 + t * 1.25), 0.3 * cos(q.y * 0.43 - t * 1.05)) * 0.045;
  g += vec2(cos(q.x * 2.1 + q.y * 0.7 + t * 2.3), cos(q.y * 2.4 - q.x * 0.5 - t * 2.0)) * 0.06;
  g += vec2(cos(q.x * 5.3 - q.y * 3.1 + t * 3.7), cos(q.y * 4.7 + q.x * 2.9 + t * 3.1)) * 0.03;
  g *= smoothstep(0.0, 0.5, d) * 0.8 + 0.2;
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vWorld);
  if (!gl_FrontFacing) {
    // from under the surface: a bright ceiling, the sun's shimmer through it
    float sh = 0.75 + 0.25 * sin(q.x * 3.1 + t * 2.0) * sin(q.y * 2.7 - t * 1.7);
    gl_FragColor = vec4(mix(uDeep, uSky, 0.35) * sh * (1.0 - uNight * 0.7), 0.82);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  float k = smoothstep(0.0, 2.3, d);
  vec3 water = mix(uShallow, uDeep, k);
  vec3 L = normalize(uSun);
  float diff = 0.62 + 0.38 * max(dot(n, L), 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), 260.0) * 3.0 * (1.0 - uNight);
  // the floor's light through the shallows: caustic ripples on the sand
  float ca = vnoise(q * 1.7 + vec2(t * 0.35, -t * 0.27)) * vnoise(q * 2.3 - vec2(t * 0.31, t * 0.22));
  vec3 col = water * diff * (1.0 + (1.0 - k) * 0.35 * smoothstep(0.15, 0.6, ca) * (1.0 - uNight));
  col = mix(col, uSky, fres * 0.55);
  col += vec3(1.0, 0.96, 0.86) * spec;
  // the foam: a line where it meets the sand, and the waves breaking in rows over the shelf
  float edge = 1.0 - smoothstep(0.0, 0.11, d);
  float roll = sin(d * 6.5 - t * 1.7 + sin(q.x * 0.13) * 1.8 + sin(q.y * 0.11) * 1.4);
  float lines = smoothstep(0.84, 1.0, roll) * (1.0 - smoothstep(0.25, 1.25, d));
  float grain = smoothstep(0.25, 0.85, vnoise(q * 1.3 + vec2(0.0, t * 0.2)) * 0.6 + vnoise(q * 4.1) * 0.4);
  float foam = clamp(edge * 0.95 + lines * 0.8 * grain, 0.0, 1.0);
  col = mix(col, uFoam * (1.0 - uNight * 0.55), foam);
  float alpha = mix(0.32, 0.97, k);
  alpha = max(alpha, foam * 0.95);
  alpha = mix(alpha, 1.0, fres * 0.45);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class KeysSea {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private t0 = performance.now();

  /** `ground(x, z)`: the floor's height (the beach, the sea floor); `day()`: the street's theme. */
  constructor(ground: (x: number, z: number) => number, private day: () => boolean) {
    const R = SEA_RECT;
    const S = 3;
    const nx = Math.ceil((R.x1 - R.x0) / S),
      nz = Math.ceil((R.z1 - R.z0) / S);
    const pos: number[] = [],
      dep: number[] = [],
      idx: number[] = [];
    const id = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
    // (only where water is near: the land's cells left out)
    const depthAt = (x: number, z: number) => (x < KEYS.x0 || x > KEYS.x1 || z > KEYS.z1 ? 3 : SEA_Y - ground(x, z));
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const x = R.x0 + i * S,
          z = R.z0 + j * S;
        pos.push(x, SEA_Y, z);
        dep.push(depthAt(x, z));
        id[j * (nx + 1) + i] = i + j * (nx + 1);
      }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i,
          b = a + 1,
          c = a + nx + 1,
          d = c + 1;
        if (Math.max(dep[a], dep[b], dep[c], dep[d]) < -0.05) continue;
        idx.push(a, c, b, b, c, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("aDepth", new THREE.Float32BufferAttribute(dep, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    this.mat = new THREE.ShaderMaterial({
      name: "KeysSea",
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uNight: { value: 0 },
          uSun: { value: new THREE.Vector3(0.45, 0.8, 0.35) },
          uSky: { value: new THREE.Color("#b9d6ee") },
          uShallow: { value: new THREE.Color("#56d4cb") },
          uDeep: { value: new THREE.Color("#1a6584") },
          uFoam: { value: new THREE.Color("#f7f5ee") },
        },
      ]),
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = "keys:sea";
    this.mesh.renderOrder = 1;
    this.mesh.userData.noField = true;
    this.mesh.frustumCulled = false;
    let night = -1;
    this.mesh.onBeforeRender = () => {
      const u = this.mat.uniforms;
      u.uTime.value = (performance.now() - this.t0) / 1000;
      const n = this.day() ? 0 : 1;
      if (n !== night) {
        night = n;
        u.uNight.value = n;
        u.uSky.value.set(n ? "#1a2238" : "#b9d6ee");
        u.uShallow.value.set(n ? "#1c5664" : "#56d4cb");
        u.uDeep.value.set(n ? "#082636" : "#1a6584");
      }
    };
  }

  /** The water's depth at (x, z) on this sea (≤ 0: dry), or null off it. */
  static inside(x: number, z: number) {
    const R = SEA_RECT;
    return x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1;
  }
}
