import * as THREE from "three";

/**
 * Surface detail for ordinary standard materials (ground, water, the walls and floors of the
 * places): grain, relief and changing gloss computed in world metres on the GPU, on top of
 * whatever colour or texture the material already has. Fades out once a pixel covers more than a
 * few centimetres, so it costs nothing in looks from afar and never shimmers.
 */
export type Detail = "asphalt" | "paving" | "grass" | "concrete" | "water" | "plaster" | "polished" | "fabric" | "wood" | "metal";

/** `?detail=0` turns the surface detail off everywhere. */
const DETAIL_ENABLED = typeof location === "undefined" || new URLSearchParams(location.search).get("detail") !== "0";

/** Seconds, for the water's ripples (advanced by the app). */
export const DETAIL_TIME = { value: 0 };

const IDS: Record<Detail, number> = { asphalt: 0, paving: 1, grass: 2, concrete: 3, water: 4, plaster: 5, polished: 6, fabric: 7, wood: 8, metal: 9 };

const VERT_HEAD = /* glsl */ `
varying vec3 vDetW;
varying vec3 vDetN;
`;

const VERT_BODY = /* glsl */ `
{
  vec4 dw = vec4(transformed, 1.0);
  vec3 dn = objectNormal;
  #ifdef USE_BATCHING
  dw = batchingMatrix * dw;
  dn = mat3(batchingMatrix) * dn;
  #endif
  #ifdef USE_INSTANCING
  dw = instanceMatrix * dw;
  dn = mat3(instanceMatrix) * dn;
  #endif
  vDetW = (modelMatrix * dw).xyz;
  vDetN = normalize(mat3(modelMatrix) * dn);
}
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vDetW;
varying vec3 vDetN;
uniform float uDetTime;
float dtHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float dtNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dtHash(i), dtHash(i + vec2(1.0, 0.0)), f.x), mix(dtHash(i + vec2(0.0, 1.0)), dtHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float dtFbm(vec2 p) {
  return dtNoise(p) * 0.5 + dtNoise(p * 2.03 + 7.1) * 0.3 + dtNoise(p * 4.1 + 3.3) * 0.2;
}
`;

const FRAG_COLOR = /* glsl */ `
float dtH = 0.0, dtFade = 0.0, dtRough = -1.0, dtBump = 0.004;
{
  vec3 an = abs(vDetN);
  vec2 q = an.y > 0.6 ? vDetW.xz : (an.x > an.z ? vDetW.zy : vDetW.xy);
  float px = length(fwidth(vDetW));
  dtFade = 1.0 - smoothstep(0.02, 0.07, px);
  float far = 1.0 - smoothstep(0.2, 0.6, px);
  float tint = 0.0;
  int k = DETAIL_KIND;
  if (k == 0) {
    // asphalt: aggregate, and where the camber holds water a darker, glossier film
    float agg = dtNoise(q * 38.0);
    float film = smoothstep(0.55, 0.75, dtFbm(q * 0.35));
    tint = (agg - 0.5) * 0.12 * dtFade - film * 0.12 * far * step(roughness, 0.6);
    dtH = agg;
    // (only on wet nights: dry tarmac by day stays matte)
    dtRough = mix(roughness, roughness * 0.35, film * far * step(roughness, 0.6));
  } else if (k == 1) {
    // paving: a little wear and dirt, a sandy grain
    float g = dtNoise(q * 26.0);
    float wear = dtFbm(q * 0.6);
    tint = (g - 0.5) * 0.08 * dtFade + (wear - 0.5) * 0.08 * far;
    dtH = g;
    dtRough = roughness * (0.85 + wear * 0.3);
  } else if (k == 2) {
    // grass: mown stripes of light and shade, clumps, blades
    float clump = dtFbm(q * 0.9);
    float blade = dtNoise(vec2(q.x * 60.0, q.y * 18.0));
    tint = (clump - 0.5) * 0.3 * far + (blade - 0.5) * 0.16 * dtFade;
    dtH = blade;
    dtBump = 0.006;
  } else if (k == 3) {
    float s = dtNoise(q * 22.0);
    float b = dtFbm(q * 0.8);
    tint = (s - 0.5) * 0.08 * dtFade + (b - 0.5) * 0.1 * far;
    dtH = s;
    dtRough = roughness * (0.8 + b * 0.4);
  } else if (k == 4) {
    // water: two swells crossing, read by the relief below
    vec2 w1 = q * 0.9 + vec2(uDetTime * 0.12, uDetTime * 0.05);
    vec2 w2 = q * 2.3 - vec2(uDetTime * 0.07, -uDetTime * 0.11);
    dtH = dtNoise(w1) * 0.6 + dtNoise(w2) * 0.4;
    dtFade = far;
    dtBump = 0.09;
  } else if (k == 5) {
    // plaster: a soft, uneven trowel finish
    float t = dtFbm(q * 3.0);
    tint = (t - 0.5) * 0.05 * far + (dtNoise(q * 40.0) - 0.5) * 0.03 * dtFade;
    dtH = t;
    dtBump = 0.0015;
    dtRough = roughness * (0.9 + t * 0.2);
  } else if (k == 6) {
    // polished stone, lacquer: clouding in the depth, gloss that varies a touch
    float c = dtFbm(q * 1.6);
    float v = abs(sin((q.x * 0.7 + q.y * 1.1) * 2.6 + dtFbm(q * 0.9) * 6.0));
    tint = (c - 0.5) * 0.05 * far - (1.0 - smoothstep(0.0, 0.04, v)) * 0.025 * far;
    dtH = c * 0.3;
    dtBump = 0.0008;
    dtRough = roughness * (0.75 + c * 0.5);
  } else if (k == 7) {
    // fabric, carpet: a tight weave
    float wv = dtNoise(vec2(q.x * 140.0, q.y * 140.0));
    float pile = dtFbm(q * 2.0);
    tint = (wv - 0.5) * 0.1 * dtFade + (pile - 0.5) * 0.08 * far;
    dtH = wv;
    dtBump = 0.002;
  } else if (k == 8) {
    // wood: grain along x, boards
    float grain = dtNoise(vec2(q.x * 1.8, q.y * 60.0));
    float board = dtHash(vec2(floor(q.y / 0.18), 1.0));
    tint = (grain - 0.5) * 0.14 * dtFade + (board - 0.5) * 0.1 * far;
    dtH = grain;
    dtBump = 0.002;
  } else {
    // metal: brushed
    float br = dtNoise(vec2(q.x * 2.0, q.y * 220.0));
    tint = (br - 0.5) * 0.05 * dtFade;
    dtH = br;
    dtBump = 0.0008;
    dtRough = roughness * (0.8 + br * 0.4);
  }
  diffuseColor.rgb *= 1.0 + tint;
}
`;

const FRAG_ROUGH = /* glsl */ `
if (dtRough >= 0.0) roughnessFactor = clamp(dtRough, 0.03, 1.0);
`;

const FRAG_BUMP = /* glsl */ `
{
  float H = dtH * dtBump * dtFade;
  vec2 dH = vec2(dFdx(H), dFdy(H));
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float fd = dot(sx, r1) * faceDirection;
  vec3 g = sign(fd) * (dH.x * r1 + dH.y * r2);
  normal = normalize(abs(fd) * normal - g);
}
`;

function hook(kind: Detail, spec: number) {
  return (sh: THREE.WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uDetTime = DETAIL_TIME;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + VERT_HEAD).replace("#include <project_vertex>", "#include <project_vertex>\n" + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n#define DETAIL_KIND ${IDS[kind]}\n` + FRAG_HEAD)
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + FRAG_COLOR)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + FRAG_ROUGH)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + FRAG_BUMP)
      // a softer highlight from the lamps (big floors under many lights glared)
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\nreflectedLight.directSpecular *= ${spec.toFixed(2)};`);
  };
}

/**
 * Give a standard material its detail. Leaves materials alone that already have their own shader
 * hook, a normal map or a bump map (they have their own relief), and those that are not standard.
 */
export function addDetail<T extends THREE.Material>(m: T, kind: Detail, spec = 1): T {
  const s = m as unknown as THREE.MeshStandardMaterial;
  if (!DETAIL_ENABLED) return m;
  if (!s.isMeshStandardMaterial || s.normalMap || s.bumpMap || m.userData.detail) return m;
  if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return m;
  m.userData.detail = kind;
  m.onBeforeCompile = hook(kind, spec);
  const base = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${base()}|detail-${kind}|${spec}`;
  return m;
}

/** A detail for a material of the places, guessed from its look. */
export function guessDetail(m: THREE.MeshStandardMaterial): Detail {
  if (m.metalness >= 0.5) return "metal";
  if (m.roughness <= 0.3) return "polished";
  const hsl = { h: 0, s: 0, l: 0 };
  m.color.getHSL(hsl, THREE.SRGBColorSpace);
  const h = hsl.h * 360;
  if (h > 18 && h <= 48 && hsl.s > 0.25 && hsl.l < 0.45) return "wood";
  if (m.roughness >= 0.92 && hsl.s > 0.25) return "fabric";
  return "plaster";
}
