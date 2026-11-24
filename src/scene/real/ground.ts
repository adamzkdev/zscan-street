import * as THREE from "three";
import { DETAIL_WET } from "../detail";
import { maps, TILE } from "./tex";

/**
 * The ground's realistic materials (roads, pavements, kerbs, plazas, lawns, sand, quays): a
 * photographed PBR set (public/tex) mapped in the WORLD's metres, so every strip, box and kerb of
 * the city takes it seamlessly whatever its own UVs — from above on the flat, from the side on
 * the kerbs and walls (the face's dominant axis). Two samples at different scales and angles
 * blended by a slow noise hide the texture's repeat. On the roads, the lane markings (a texture
 * of paint only, in the strip's own UVs) are laid over the asphalt; at night the asphalt is damp
 * and holds puddles (DETAIL_WET). One program for every ground material: only uniforms differ.
 */

export interface GroundOpts {
  /** The PBR set (public/tex/<set>). */
  set: string;
  /** Metres per repeat (default: the set's TILE). */
  tile?: number;
  tint?: THREE.ColorRepresentation;
  /** Roughness multiplier, normal strength. */
  rough?: number;
  normal?: number;
  /** Paint over it in the geometry's own UVs (white and yellow lines, zebras: alpha is the paint). */
  markings?: THREE.Texture | null;
  /** Damp and puddled at night (the asphalt). */
  wet?: boolean;
  /** How much the second, rotated sample breaks the repeat (0…1). */
  anti?: number;
  /** Large patches of older and newer surface (asphalt repairs, worn slabs): 0…1. */
  patches?: number;
}

const VERT_HEAD = /* glsl */ `
varying vec3 vGW;
varying vec3 vGN;
`;
const VERT_BODY = /* glsl */ `
{
  vec4 gw = vec4(transformed, 1.0);
  vec3 gn = objectNormal;
  #ifdef USE_BATCHING
  gw = batchingMatrix * gw;
  gn = mat3(batchingMatrix) * gn;
  #endif
  #ifdef USE_INSTANCING
  gw = instanceMatrix * gw;
  gn = mat3(instanceMatrix) * gn;
  #endif
  vGW = (modelMatrix * gw).xyz;
  vGN = normalize(mat3(modelMatrix) * gn);
}
`;
const FRAG_HEAD = /* glsl */ `
varying vec3 vGW;
varying vec3 vGN;
uniform sampler2D uGC;
uniform sampler2D uGN;
uniform sampler2D uGR;
uniform sampler2D uGM;
uniform float uGTile, uGNorm, uGRough, uGMarkOn, uGAnti, uGPatch, uGWetOn, uDetWet;
uniform vec3 uGTint;
float rgHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float rgNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rgHash(i), rgHash(i + vec2(1.0, 0.0)), f.x), mix(rgHash(i + vec2(0.0, 1.0)), rgHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float rgFbm(vec2 p) {
  return rgNoise(p) * 0.5 + rgNoise(p * 2.03 + 7.1) * 0.3 + rgNoise(p * 4.1 + 3.3) * 0.2;
}
`;
/** After the colour: the projection, both samples, the paint, the puddles (shared with the later chunks). */
const FRAG_COLOR = /* glsl */ `
vec2 rgUv;
vec3 rgT, rgB, rgN;
float rgW = 0.0, rgPaint = 0.0, rgPud = 0.0, rgFilm = 0.0;
vec2 rgUv2;
{
  vec3 n = normalize(vGN);
  vec3 an = abs(n);
  if (an.y >= max(an.x, an.z)) {
    rgUv = vec2(vGW.x, -vGW.z);
    rgT = vec3(1.0, 0.0, 0.0);
    rgB = vec3(0.0, 0.0, -1.0);
  } else if (an.x > an.z) {
    float s = sign(n.x);
    rgUv = vec2(-vGW.z * s, vGW.y);
    rgT = vec3(0.0, 0.0, -s);
    rgB = vec3(0.0, 1.0, 0.0);
  } else {
    float s = sign(n.z);
    rgUv = vec2(vGW.x * s, vGW.y);
    rgT = vec3(s, 0.0, 0.0);
    rgB = vec3(0.0, 1.0, 0.0);
  }
  rgN = n;
  rgUv /= uGTile;
  // the second sample: a third of the scale, turned 37°, blended in by a slow noise
  rgUv2 = mat2(0.8, 0.6, -0.6, 0.8) * rgUv * 0.43 + vec2(0.37, 0.11);
  rgW = smoothstep(0.32, 0.68, rgNoise(vGW.xz * 0.045 + vGW.y * 0.05)) * uGAnti;
  vec3 c1 = texture2D(uGC, rgUv).rgb;
  vec3 c2 = texture2D(uGC, rgUv2).rgb;
  vec3 col = mix(c1, c2, rgW);
  // big patches: older and newer surface over metres
  float big = rgFbm(vGW.xz * 0.035 + 5.3);
  col *= 1.0 + (big - 0.5) * 0.35 * uGPatch;
  col *= uGTint;
  // the paint
  if (uGMarkOn > 0.5) {
    #if defined( USE_UV )
    vec4 mk = texture2D(uGM, vUv);
    // worn: the paint thinner where the tyres run
    float wear = 0.75 + 0.25 * rgNoise(vGW.xz * 3.1);
    rgPaint = mk.a * wear;
    // (premultiplied: the colour already carries its coverage)
    col = col * (1.0 - rgPaint) + mk.rgb * wear;
    #endif
  }
  // damp at night, puddles in the hollows
  if (uGWetOn > 0.5 && uDetWet > 0.0 && rgN.y > 0.6) {
    float mid = rgFbm(vGW.xz * 0.23 + 9.7);
    rgPud = smoothstep(0.6, 0.67, rgFbm(vGW.xz * 0.15 + 21.0) * 0.8 + mid * 0.2);
    rgFilm = uDetWet * (0.4 + 0.6 * rgPud);
    col *= 1.0 - (0.28 - 0.14 * rgPud) * uDetWet;
  }
  diffuseColor.rgb *= col;
}
`;
const FRAG_ROUGH = /* glsl */ `
{
  float r = mix(texture2D(uGR, rgUv).r, texture2D(uGR, rgUv2).r, rgW) * uGRough;
  r = mix(r, 0.55, rgPaint);
  r = mix(r, mix(0.4, 0.04, rgPud), rgFilm);
  roughnessFactor = clamp(r, 0.03, 1.0);
}
`;
const FRAG_NORMAL = /* glsl */ `
{
  vec3 n1 = texture2D(uGN, rgUv).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uGN, rgUv2).xyz * 2.0 - 1.0;
  vec3 tn = normalize(mix(n1, n2, rgW));
  float flat_ = max(rgPaint * 0.7, rgPud * uDetWet);
  tn.xy *= uGNorm * (1.0 - flat_);
  vec3 wn = normalize(rgT * tn.x + rgB * tn.y + rgN * tn.z);
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}
`;

const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
BLACK.needsUpdate = true;
const made = new Map<string, THREE.MeshStandardMaterial>();

/** A ground material (shared by key: the same set, tint and options give the same material). */
export function groundMat(o: GroundOpts): THREE.MeshStandardMaterial {
  const key = `${o.set}|${o.tile ?? ""}|${o.tint ?? ""}|${o.rough ?? ""}|${o.normal ?? ""}|${o.markings?.uuid ?? ""}|${o.wet ? 1 : 0}|${o.anti ?? ""}|${o.patches ?? ""}`;
  const had = made.get(key);
  if (had) return had;
  const mp = maps(o.set);
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, metalness: 0 });
  // (the paint's UVs are the strip's own: vUv)
  m.defines = { ...(m.defines ?? {}), USE_UV: "" };
  const u = {
    uGC: { value: mp.map },
    uGN: { value: mp.normalMap },
    uGR: { value: mp.roughnessMap },
    uGM: { value: o.markings ?? BLACK },
    uGTile: { value: o.tile ?? TILE[o.set]?.[0] ?? 2 },
    uGNorm: { value: o.normal ?? 1 },
    uGRough: { value: o.rough ?? 1 },
    uGMarkOn: { value: o.markings ? 1 : 0 },
    uGAnti: { value: o.anti ?? 0.8 },
    uGPatch: { value: o.patches ?? 0.5 },
    uGWetOn: { value: o.wet ? 1 : 0 },
    uGTint: { value: new THREE.Color(o.tint ?? "#ffffff") },
    uDetWet: DETAIL_WET,
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + VERT_HEAD).replace("#include <project_vertex>", "#include <project_vertex>\n" + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + FRAG_HEAD)
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + FRAG_COLOR)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + FRAG_ROUGH)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + FRAG_NORMAL);
  };
  m.customProgramCacheKey = () => "real-ground";
  m.userData.shared = true;
  m.userData.realGround = o.set;
  m.userData.groundUniforms = u;
  made.set(key, m);
  return m;
}

/** The kinds of ground the city is made of. */
export const GROUND = {
  // (a darker, richer blacktop than the photo's grey: the street reads like a real one in full sun, the paint pops)
  asphalt: (markings: THREE.Texture | null = null) => groundMat({ set: "Asphalt031", markings, wet: true, anti: 0.9, patches: 0.7, tint: "#9a9a9e" }),
  /** The city's pavements: concrete panels with their joints (the US street). */
  pavement: () => groundMat({ set: "Concrete031", tile: 3, anti: 0.3, patches: 0.5, tint: "#dcdad6" }),
  /** The heart's and the Japanese streets' pavements: grey slabs. */
  slabs: () => groundMat({ set: "PavingStones111", tile: 2.4, anti: 0.3, patches: 0.4, tint: "#e4e2de" }),
  plaza: () => groundMat({ set: "PavingStones128", tile: 3.2, anti: 0.3, patches: 0.3, tint: "#f0ece6" }),
  setts: () => groundMat({ set: "PavingStones070", tile: 1.6, anti: 0.5, patches: 0.3 }),
  kerb: () => groundMat({ set: "Concrete034", tile: 1.2, anti: 0.4, patches: 0.2, tint: "#d6d3cd", normal: 0.8 }),
  concrete: () => groundMat({ set: "Concrete019", anti: 0.6, patches: 0.6, tint: "#c9c6c0" }),
  lawn: () => groundMat({ set: "Grass004", anti: 0.9, patches: 0.6, tint: "#c8d6a8", rough: 1 }),
  sand: () => groundMat({ set: "Ground054", anti: 0.8, patches: 0.4, tint: "#f2e2c0" }),
  gravel: () => groundMat({ set: "Gravel022", anti: 0.7, patches: 0.3 }),
  stone: () => groundMat({ set: "Concrete034", tile: 2.4, anti: 0.6, patches: 0.4, tint: "#bdb6ae" }),
};

/**
 * Terrain painted by vertex colour (the coast's sand, Orchard Keys' beach and bluff): the colours
 * stay (wet sand, dry sand, grass, rock), the photographed sand and grass sets give them grain and
 * relief — each sample divided by its own average (its smallest mip), so it adds detail, not a hue.
 * Grass where the vertex is green, sand elsewhere.
 */
let terrainM: THREE.MeshStandardMaterial | null = null;
export function terrainMat() {
  if (terrainM) return terrainM;
  const sand = maps("Ground054"),
    grass = maps("Grass004");
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const u = { uTS: { value: sand.map }, uTSN: { value: sand.normalMap }, uTG: { value: grass.map }, uTGN: { value: grass.normalMap } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + VERT_HEAD).replace("#include <project_vertex>", "#include <project_vertex>\n" + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGW;\nvarying vec3 vGN;\nuniform sampler2D uTS, uTSN, uTG, uTGN;\nfloat rtGrass = 0.0;\nvec2 rtUv;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          rtUv = vec2(vGW.x, -vGW.z) / 3.0;
          rtGrass = clamp((diffuseColor.g - diffuseColor.r) * 7.0 + 0.2, 0.0, 1.0);
          vec3 s = texture2D(uTS, rtUv).rgb / max(textureLod(uTS, vec2(0.5), 12.0).rgb, vec3(0.05));
          vec3 g = texture2D(uTG, rtUv).rgb / max(textureLod(uTG, vec2(0.5), 12.0).rgb, vec3(0.05));
          diffuseColor.rgb *= clamp(mix(s, g, rtGrass), 0.4, 1.8);
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        // (wet sand by the water: a sheen)
        roughnessFactor = mix(0.95, 0.5, clamp((0.62 - dot(diffuseColor.rgb, vec3(0.33))) * 3.0, 0.0, 1.0) * (1.0 - rtGrass));`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          vec3 tn = mix(texture2D(uTSN, rtUv).xyz, texture2D(uTGN, rtUv).xyz, rtGrass) * 2.0 - 1.0;
          vec3 n0 = normalize(vGN);
          vec3 t = normalize(cross(vec3(0.0, 0.0, 1.0), n0));
          vec3 b = normalize(cross(n0, t));
          vec3 wn = normalize(t * tn.x * 0.8 + b * tn.y * 0.8 + n0 * tn.z);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`,
      );
  };
  m.customProgramCacheKey = () => "real-terrain";
  m.userData.shared = true;
  terrainM = m;
  return m;
}
