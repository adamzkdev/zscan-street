/**
 * The party stage's finish: how every 3D mini-game, the board and the podium reach the screen.
 *
 *   scene ──► HDR target (half float, 4× MSAA, depth) ──► ambient occlusion (half res, high tier)
 *                     │                                └─► bloom (a mip chain, half res and down)
 *                     └──────────────► composite: AO, bloom, exposure, tone curve, grade, vignette,
 *                                      dither, sRGB ──► the canvas
 *
 * Bloom is selective without a second render: an opaque material marked with `markGlow()` (k3's
 * glow(), bright emissive toons, the Fx3 sparks) writes `1 - weight` into the target's alpha, which
 * an ordinary opaque surface leaves at 1. The bright pass takes those pixels, plus whatever is
 * really hot in HDR (additive halos, stacked sparks), so a sunlit white wall, a snow field or a
 * white 3D label never glows while a neon tube, a lamp or a spark does.
 *
 * Quality tiers (`postQuality`, `?q=low|mid|high`): `high` all of it; `mid` no AO, a shorter bloom,
 * a lower density; `low` no post at all (the scene straight to the canvas with its own MSAA), with
 * the same tone curve and grade baked into the materials (CustomToneMapping), so a weak device
 * keeps the colours. With no `?q`, the tier starts from the device (desktop high, touch mid,
 * software GL low) and steps down on its own when the frame rate can't hold.
 *
 * A scene can tune its own finish: `scene.userData.post = { bloom: 0.5, ao: 0 }` (multipliers,
 * `PostLook`), or `world({ post: … })` in k3.
 */
import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { SHADOWS_FORCED, SunShadows } from "./shadows";

export type Quality = "low" | "mid" | "high";

/** A scene's own finish, multipliers on the stage's (0 turns that part off). */
export interface PostLook {
  bloom?: number;
  ao?: number;
  /** The grade: saturation, contrast, vignette. */
  grade?: number;
  exposure?: number;
  /** The level where anything bright starts to bloom (a night scene lowers it: k3 world({ night })). */
  hot?: number;
}

type Tone = "neutral" | "aces" | "agx";
const Q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const num = (k: string, d: number) => (Q.get(k) !== null && Number.isFinite(Number(Q.get(k))) ? Number(Q.get(k)) : d);

/** The stage's look (the bench's `?tm=aces|agx|neutral`, `?exp=`, `?bloom=`, `?ao=`, `?sat=` override it). */
export const LOOK = {
  /** Khronos PBR Neutral: hues and saturation stay what the palette says up to the highlights. */
  tone: (["neutral", "aces", "agx"].includes(Q.get("tm") ?? "") ? Q.get("tm") : "neutral") as Tone,
  exposure: num("exp", 1.15),
  /** In display space, after the tone curve. */
  saturation: num("sat", 1.05),
  /** An S round the middle (0 none, 1 a full smoothstep). */
  contrast: num("con", 0.14),
  vignette: num("vig", 0.22),
  bloom: num("bloom", 0.9),
  /** How much of a marked glow pixel feeds the bloom. */
  glowFeed: 1.0,
  /** HDR level where anything starts to bloom (a sunlit white top is ~1.3). */
  hot: 1.9,
  ao: num("ao", 0.9),
  /** Metres: the reach of the contact darkening. */
  aoRadius: num("aor", 1.1),
};

/** `shadow`: the sun's shadow map, in texels a side (0: none; shadows.ts). */
const TIERS: Record<Quality, { post: boolean; ao: boolean; levels: number; samples: number; dpr: [number, number]; shadow: number }> = {
  high: { post: true, ao: true, levels: 5, samples: 4, dpr: [1.75, 1.5], shadow: 2048 },
  mid: { post: true, ao: false, levels: 4, samples: 4, dpr: [1.5, 1.25], shadow: 0 },
  low: { post: false, ao: false, levels: 0, samples: 0, dpr: [1.25, 1], shadow: 0 },
};

const TOUCH = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
/**
 * `?post=legacy`: the stage as it was before the finish (ACES at 1.05, straight to the canvas,
 * world()'s old light), for before/after comparisons on the bench.
 */
export const LEGACY = Q.get("post") === "legacy";
const ASKED = ((): Quality | null => {
  const q = Q.get("q");
  return q === "low" || q === "mid" || q === "high" ? q : null;
})();

/** An iPhone or an iPad (iPadOS says it is a Mac, one with a touch screen). */
const IOS = typeof navigator !== "undefined" && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const LOWER: Record<Quality, Quality> = { high: "mid", mid: "low", low: "low" };
const RANK: Record<Quality, number> = { low: 0, mid: 1, high: 2 };

/**
 * The crash memory. A page killed while it draws (Safari reloads it: "a problem repeatedly occurred")
 * fires no pagehide, so the tier it was drawing is still marked as not done the next time: that tier
 * and above are then off on this device for good (`pt.gpu.cap`), and the stage starts one lower.
 */
const RUN_KEY = "pt.gpu.run";
const CAP_KEY = "pt.gpu.cap";
const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};
const capAtLoad = ((): Quality | null => {
  let cap = store.get(CAP_KEY) as Quality | null;
  if (cap && !(cap in RANK)) cap = null;
  try {
    const run = JSON.parse(store.get(RUN_KEY) ?? "null") as { tier: Quality; ok: boolean } | null;
    if (run && !run.ok && run.tier in RANK) {
      const lower = LOWER[run.tier];
      if (!cap || RANK[lower] < RANK[cap]) cap = lower;
      store.set(CAP_KEY, cap);
      console.warn(`[post] the last visit died drawing at ${run.tier}: this device now stops at ${cap}`);
    }
  } catch {
    /* a bad value: start over */
  }
  store.set(RUN_KEY, "null");
  return cap;
})();
/** A clean end (the page left, the stage closed): whatever was being tried did not kill the page. */
function runOk() {
  const v = store.get(RUN_KEY);
  if (v && v !== "null" && v.includes('"ok":false')) store.set(RUN_KEY, v.replace('"ok":false', '"ok":true'));
}
if (typeof window !== "undefined") window.addEventListener("pagehide", runOk);
const capped = (q: Quality): Quality => (capAtLoad && RANK[q] > RANK[capAtLoad] ? capAtLoad : q);

/**
 * What the device starts at: a desktop high, a touch screen mid, an iPhone or iPad low (Safari's GPU
 * process dies on the HDR targets' MSAA), software GL or no float targets low (set by the first stage).
 */
let deviceTier: Quality = capped(IOS ? "low" : TOUCH ? "mid" : "high");

/** The stage's quality, for every stage of the page: `postQuality.quality`, `postQuality.set("low" | "mid" | "high" | "auto")`. */
export const postQuality = {
  /** The tier drawn now. */
  quality: (ASKED ?? deviceTier) as Quality,
  /** Steps down on its own when the frames are slow (off once a tier is asked for). */
  auto: ASKED === null,
  /** Why the tier is what it is (for the bench). */
  why: ASKED ? "asked" : "device",
  set(q: Quality | "auto") {
    if (q === "auto") {
      this.auto = true;
      this.quality = deviceTier;
      this.why = "device";
    } else {
      this.auto = false;
      this.quality = q;
      this.why = "asked";
    }
  },
};

// ---- the glow mask ----------------------------------------------------------------------------------

const GLOW_KEY = "partyGlow";
// (a light deep in the fog has become fog: it fades out of the bloom with it)
const GLOW_TAIL = `#include <dithering_fragment>
#if defined(PARTY_GLOW) && defined(OPAQUE)
#ifdef USE_FOG
gl_FragColor.a = 1.0 - PARTY_GLOW * (1.0 - fogFactor);
#else
gl_FragColor.a = 1.0 - PARTY_GLOW;
#endif
#endif`;
function glowCompile(this: THREE.Material, sh: { fragmentShader: string }) {
  sh.fragmentShader = sh.fragmentShader.replace("#include <dithering_fragment>", GLOW_TAIL);
}
/**
 * Marks an opaque material as a light: `weight` (0…1) of its colour feeds the bloom. A transparent
 * or additive one is left alone (its alpha is its blending): those bloom only where they are hot.
 */
export function markGlow<M extends THREE.Material>(m: M, weight: number): M {
  if (m.transparent || weight <= 0) return m;
  m.defines = { ...(m.defines ?? {}), PARTY_GLOW: Math.min(1, weight).toFixed(3) };
  m.onBeforeCompile = glowCompile;
  m.customProgramCacheKey = () => GLOW_KEY;
  m.needsUpdate = true;
  return m;
}
const tmpC = new THREE.Color();
/** The bloom weight of an unlit colour: a saturated light glows fully, a plain white one only a little (snow, lines, clouds). */
export function glowWeight(color: THREE.ColorRepresentation) {
  const c = tmpC.set(color);
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  const sat = mx > 1e-4 ? (mx - mn) / mx : 0;
  const t = Math.min(1, Math.max(0, (sat - 0.12) / 0.43));
  return 0.12 + 0.88 * t * t * (3 - 2 * t);
}

// ---- shaders ----------------------------------------------------------------------------------------

/** Tone curves and the grade, shared by the composite and by the low tier's CustomToneMapping. */
const TONE_GLSL = /* glsl */ `
vec3 pt_neutral(vec3 color) {
  const float start = 0.8 - 0.04;
  const float desat = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < start) return color;
  float d = 1.0 - start;
  float newPeak = 1.0 - d * d / (peak + d - start);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desat * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 pt_acesFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 pt_aces(vec3 color) {
  const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  return clamp(outM * pt_acesFit(inM * (color / 0.6)), 0.0, 1.0);
}
vec3 pt_agx(vec3 color) {
  const mat3 toR2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
  const mat3 fromR2020 = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
  const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
  const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
  color = inset * (toR2020 * color);
  color = clamp((log2(max(color, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0);
  vec3 x2 = color * color, x4 = x2 * x2;
  color = 15.5 * x4 * x2 - 40.14 * x4 * color + 31.96 * x4 - 6.868 * x2 * color + 0.4298 * x2 + 0.1191 * color - 0.00232;
  color = pow(max(vec3(0.0), outset * color), vec3(2.2));
  return clamp(fromR2020 * color, 0.0, 1.0);
}
vec3 pt_tone(vec3 c) {
#if PT_TONE == 1
  return pt_aces(c);
#elif PT_TONE == 2
  return pt_agx(c);
#else
  return pt_neutral(c);
#endif
}
/** Display-linear in and out: an S round the middle (in a perceptual space), then the saturation. */
vec3 pt_grade(vec3 c, float sat, float con) {
  vec3 s = sqrt(clamp(c, 0.0, 1.0));
  s = mix(s, s * s * (3.0 - 2.0 * s), con);
  c = s * s;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return clamp(mix(vec3(l), c, sat), 0.0, 1.0);
}
`;
const TONE_ID: Record<Tone, number> = { neutral: 0, aces: 1, agx: 2 };

// The low tier draws straight to the canvas: the same curve and grade, inside every material.
{
  const chunk = THREE.ShaderChunk as unknown as Record<string, string>;
  const was = "vec3 CustomToneMapping( vec3 color ) { return color; }";
  if (chunk.tonemapping_pars_fragment.includes(was))
    chunk.tonemapping_pars_fragment = chunk.tonemapping_pars_fragment.replace(
      was,
      `#define PT_TONE ${TONE_ID[LOOK.tone]}\n${TONE_GLSL}\nvec3 CustomToneMapping( vec3 color ) { return pt_grade(pt_tone(color * toneMappingExposure), ${LOOK.saturation.toFixed(3)}, ${LOOK.contrast.toFixed(3)}); }`,
    );
}

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function pass(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string | number> = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false });
}

/** First step of the bloom: the glow-marked and hot pixels, 4 bilinear taps (16 texels), firefly-safe (Karis). */
const BRIGHT = /* glsl */ `
uniform sampler2D tScene; uniform vec2 texel; uniform float hot, feed;
varying vec2 vUv;
vec3 pick(vec2 uv, out float w) {
  vec4 t = texture2D(tScene, uv);
  vec3 c = max(t.rgb, vec3(0.0));
  float m = clamp(1.0 - t.a, 0.0, 1.0) * feed;
  float l = max(c.r, max(c.g, c.b));
  float knee = hot * 0.35;
  float soft = clamp(l - hot + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  float k = max(soft, l - hot) / max(l, 1e-4);
  c *= min(1.0, m + k);
  w = 1.0 / (1.0 + max(c.r, max(c.g, c.b)));
  return c;
}
void main() {
  float wa, wb, wc, wd;
  vec3 a = pick(vUv + texel * vec2(-1.0, -1.0), wa);
  vec3 b = pick(vUv + texel * vec2(1.0, -1.0), wb);
  vec3 c = pick(vUv + texel * vec2(-1.0, 1.0), wc);
  vec3 d = pick(vUv + texel * vec2(1.0, 1.0), wd);
  gl_FragColor = vec4((a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd), 1.0);
}`;

/** A 13-tap downsample (Jimenez 2014): no shimmering as things move. */
const DOWN = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 texel;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + texel * o).rgb; }
void main() {
  vec3 c = s(vec2(0.0)) * 0.125;
  c += (s(vec2(-2.0, 2.0)) + s(vec2(2.0, 2.0)) + s(vec2(-2.0, -2.0)) + s(vec2(2.0, -2.0))) * 0.03125;
  c += (s(vec2(0.0, 2.0)) + s(vec2(-2.0, 0.0)) + s(vec2(2.0, 0.0)) + s(vec2(0.0, -2.0))) * 0.0625;
  c += (s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0)) + s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0))) * 0.125;
  gl_FragColor = vec4(c, 1.0);
}`;

/** A 9-tap tent upsample, added onto the next larger level. */
const UP = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 texel; uniform float k;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + texel * o).rgb; }
void main() {
  vec3 c = s(vec2(0.0)) * 4.0;
  c += (s(vec2(-1.0, 0.0)) + s(vec2(1.0, 0.0)) + s(vec2(0.0, -1.0)) + s(vec2(0.0, 1.0))) * 2.0;
  c += s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0));
  gl_FragColor = vec4(c * (k / 16.0), 1.0);
}`;

/** The depth, linear (metres from the camera), at half resolution: what the AO samples (small, cache-friendly). */
const LINZ = /* glsl */ `
uniform highp sampler2D tDepth; uniform float cNear, cFar;
varying vec2 vUv;
void main() {
  float d = texture2D(tDepth, vUv).r;
  gl_FragColor = vec4(d >= 0.99999 ? 1e4 : -(cNear * cFar) / ((cFar - cNear) * d - cFar), 0.0, 0.0, 1.0);
}`;

/** Ambient occlusion from the depth alone (normals rebuilt from it), half resolution: the darkening in every crease and under every prop. */
const AO = /* glsl */ `
uniform highp sampler2D tLin; uniform vec2 texel; uniform float radius, fadeNear, fadeFar; uniform vec2 proj;
varying vec2 vUv;
float lz(vec2 uv) { return texture2D(tLin, uv).r; }
vec3 vp(vec2 uv, float d) { return vec3((uv * 2.0 - 1.0) * d / proj, -d); }
void main() {
  float z = lz(vUv);
  if (z > 9000.0) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; }
  vec3 P = vp(vUv, z);
  vec2 dx = vec2(texel.x, 0.0), dy = vec2(0.0, texel.y);
  vec3 pr = vp(vUv + dx, lz(vUv + dx)), pl = vp(vUv - dx, lz(vUv - dx));
  vec3 pu = vp(vUv + dy, lz(vUv + dy)), pd = vp(vUv - dy, lz(vUv - dy));
  vec3 ex = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
  vec3 ey = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
  vec3 n = normalize(cross(ex, ey));
  vec2 rUv = radius * proj * 0.5 / z;
  // (never under 2 texels, nor more than a tenth of the screen)
  float px = rUv.y / texel.y;
  rUv *= clamp(px, 2.0, 0.1 / texel.y) / max(px, 1e-4);
  float ang = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float occ = 0.0;
  float r2 = radius * radius;
  for (int i = 0; i < PT_AO_N; i++) {
    float f = (float(i) + 0.5) / float(PT_AO_N);
    float a = ang + float(i) * 2.3999632;
    vec2 suv = vUv + vec2(cos(a), sin(a)) * rUv * f;
    vec3 v = vp(suv, lz(suv)) - P;
    float vv = dot(v, v);
    occ += max(0.0, dot(v, n) * inversesqrt(vv + 1e-6) - 0.05) * max(0.0, 1.0 - vv / r2);
  }
  float ao = clamp(1.0 - 2.4 * occ / float(PT_AO_N), 0.0, 1.0);
  ao = mix(1.0, ao, 1.0 - smoothstep(fadeNear, fadeFar, z));
  gl_FragColor = vec4(ao, z, 0.0, 1.0);
}`;

/** A depth-aware blur of the AO (one axis per pass). */
const AO_BLUR = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec2 c = texture2D(tSrc, vUv).rg;
  float sum = c.r * 0.2, wsum = 0.2;
  float tol = 0.04 * c.g + 0.05;
  for (int i = 1; i <= 3; i++) {
    float g = i == 1 ? 0.17 : i == 2 ? 0.12 : 0.06;
    vec2 a = texture2D(tSrc, vUv + dir * float(i)).rg;
    vec2 b = texture2D(tSrc, vUv - dir * float(i)).rg;
    float wa = g * max(0.0, 1.0 - abs(a.g - c.g) / tol);
    float wb = g * max(0.0, 1.0 - abs(b.g - c.g) / tol);
    sum += a.r * wa + b.r * wb;
    wsum += wa + wb;
  }
  gl_FragColor = vec4(sum / wsum, c.g, 0.0, 1.0);
}`;

/** Everything onto the canvas. */
const COMPOSITE = /* glsl */ `
uniform sampler2D tScene, tBloom, tAO;
uniform highp sampler2D tDepth;
uniform float bloomK, aoK, exposure, sat, con, vig, aspect, cNear, cFar;
uniform vec2 aoSize;
varying vec2 vUv;
${TONE_GLSL}
#ifdef PT_AO
/** The half-res AO brought up to this pixel by its depth (no dark halo round a silhouette). */
float aoUp() {
  float z = -(cNear * cFar) / ((cFar - cNear) * texture2D(tDepth, vUv).r - cFar);
  vec2 p = vUv * aoSize - 0.5;
  vec2 f = fract(p);
  vec2 b = (floor(p) + 0.5) / aoSize;
  vec2 o = 1.0 / aoSize;
  vec2 a00 = texture2D(tAO, b).rg, a10 = texture2D(tAO, b + vec2(o.x, 0.0)).rg;
  vec2 a01 = texture2D(tAO, b + vec2(0.0, o.y)).rg, a11 = texture2D(tAO, b + o).rg;
  float tol = 0.02 * z + 0.02;
  vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  w *= 1.0 / (vec4(abs(a00.g - z), abs(a10.g - z), abs(a01.g - z), abs(a11.g - z)) / tol + 0.05);
  return dot(w, vec4(a00.r, a10.r, a01.r, a11.r)) / max(dot(w, vec4(1.0)), 1e-5);
}
#endif
void main() {
  vec4 t = texture2D(tScene, vUv);
  vec3 c = max(t.rgb, vec3(0.0));
  float glow = clamp(1.0 - t.a, 0.0, 1.0);
#ifdef PT_AO
  float ao = aoUp();
  // (a light is not occluded)
  c *= mix(1.0, ao, aoK * (1.0 - glow));
#endif
  vec3 bl = vec3(0.0);
#ifdef PT_BLOOM
  bl = texture2D(tBloom, vUv).rgb * bloomK;
  c += bl;
#endif
  c = pt_tone(c * exposure);
  c = pt_grade(c, sat, con);
  vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
  c *= 1.0 - vig * smoothstep(0.35, 1.6, dot(d, d) * 1.5);
#if PT_DEBUG == 1
  c = bl;
#elif PT_DEBUG == 2 && defined(PT_AO)
  c = vec3(ao);
#elif PT_DEBUG == 3
  c = vec3(glow);
#endif
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  // (a dither: no banding in the skies and the glows)
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  gl_FragColor = vec4(c + (n - 0.5) / 255.0, 1.0);
}`;

const DEBUG = ({ bloom: 1, ao: 2, mask: 3 } as Record<string, number>)[Q.get("postdbg") ?? ""] ?? 0;

// ---- the stage's finish ---------------------------------------------------------------------------

const BLOOM_FALL = 0.75;
const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false } as const;

export class PartyPost {
  private gl: THREE.WebGLRenderer;
  private tier: Quality | null = null;
  /** Frames left before the crash memory calls this tier safe. */
  private okIn = 0;
  private canFloat: boolean;
  /** 32-bit float targets (the AO's linear depth). */
  private canAO: boolean;
  private soft: boolean;
  private rt: THREE.WebGLRenderTarget | null = null;
  private mips: THREE.WebGLRenderTarget[] = [];
  private ao: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null = null;
  private quad = new FullScreenQuad();
  private shadows: SunShadows;
  private bright = pass(BRIGHT, { tScene: { value: null }, texel: { value: new THREE.Vector2() }, hot: { value: LOOK.hot }, feed: { value: LOOK.glowFeed } });
  private down = pass(DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
  private up = pass(UP, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, k: { value: 1 } });
  private linMat = pass(LINZ, { tDepth: { value: null }, cNear: { value: 0.1 }, cFar: { value: 900 } });
  private lin: THREE.WebGLRenderTarget | null = null;
  private aoMat = pass(AO, {
    tLin: { value: null },
    texel: { value: new THREE.Vector2() },
    radius: { value: LOOK.aoRadius },
    fadeNear: { value: 70 },
    fadeFar: { value: 170 },
    proj: { value: new THREE.Vector2(1, 1) },
  }, { PT_AO_N: 10 });
  private aoBlur = pass(AO_BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
  private comp: THREE.ShaderMaterial;
  private compKey = "";
  private size = "";
  private w = 1;
  private h = 1;
  // the frame-rate watch (auto tier)
  private lastT = 0;
  private skip = 60;
  private win: number[] = [];
  private slow = 0;

  constructor(gl: THREE.WebGLRenderer) {
    this.gl = gl;
    // (every mesh the stage meets: its textures filtered along the slope, so a floor seen at a low
    // angle stays crisp into the distance instead of blurring a few metres out)
    const aniso = Math.min(TOUCH ? 4 : 8, gl.capabilities.getMaxAnisotropy());
    const sharp = new WeakSet<THREE.Texture>();
    this.shadows = new SunShadows(gl, (mesh) => {
      if (aniso <= 1 || postQuality.quality === "low") return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const mm = m as THREE.MeshToonMaterial | undefined;
        for (const t of [mm?.map, mm?.emissiveMap]) {
          if (!t || sharp.has(t)) continue;
          sharp.add(t);
          // (a mip-mapped one only: pixel art on nearest filtering keeps its hard texels)
          if (t.anisotropy === 1 && t.generateMipmaps && (t.minFilter === THREE.LinearMipmapLinearFilter || t.minFilter === THREE.LinearMipmapNearestFilter)) {
            t.anisotropy = aniso;
            t.needsUpdate = true;
          }
        }
      }
    });
    this.up.blending = THREE.CustomBlending;
    this.up.blendSrc = THREE.OneFactor;
    this.up.blendDst = THREE.OneFactor;
    this.up.blendEquation = THREE.AddEquation;
    this.comp = pass(COMPOSITE, {
      tScene: { value: null },
      tBloom: { value: null },
      tAO: { value: null },
      tDepth: { value: null },
      aoSize: { value: new THREE.Vector2(1, 1) },
      cNear: { value: 0.1 },
      cFar: { value: 900 },
      bloomK: { value: LOOK.bloom },
      aoK: { value: LOOK.ao },
      exposure: { value: LOOK.exposure },
      sat: { value: LOOK.saturation },
      con: { value: LOOK.contrast },
      vig: { value: LOOK.vignette },
      aspect: { value: 16 / 9 },
    });
    const ext = gl.extensions;
    this.canFloat = ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float");
    this.canAO = ext.has("EXT_color_buffer_float");
    const ctx = gl.getContext();
    // (Firefox tells the GPU in RENDERER and frowns on the debug extension; Chrome only tells it there)
    let name = String(ctx.getParameter(ctx.RENDERER) ?? "");
    if (!name || /^webkit webgl$/i.test(name)) {
      const dbg = ctx.getExtension("WEBGL_debug_renderer_info");
      if (dbg) name = String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? name);
    }
    this.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
    if (this.soft || !this.canFloat) deviceTier = "low";
    if (postQuality.auto && (this.soft || !this.canFloat)) {
      postQuality.quality = "low";
      postQuality.why = this.soft ? "software GL" : "no float targets";
    }
    if (!this.canFloat && postQuality.quality !== "low") postQuality.quality = "low";
    if (import.meta.env?.DEV || Q.has("q")) (window as unknown as Record<string, unknown>).__post = () => ({ ...this.info(), gpu: name });
  }

  /** What is drawn, for the bench. */
  info() {
    if (LEGACY) return { quality: "legacy", dpr: this.gl.getPixelRatio() };
    return { quality: this.tier, auto: postQuality.auto, why: postQuality.why, size: `${this.w}x${this.h}`, dpr: this.gl.getPixelRatio(), tone: LOOK.tone };
  }

  /** The 3D frame of `scene`, `cw × ch` CSS pixels. */
  render(scene: THREE.Scene, camera: THREE.Camera, cw: number, ch: number) {
    if (LEGACY) {
      const dpr = Math.min(window.devicePixelRatio || 1, TOUCH ? 1.25 : 1.75);
      const size = `${cw}x${ch}x${dpr}`;
      if (size !== this.size) {
        this.size = size;
        this.gl.setPixelRatio(dpr);
        this.gl.setSize(cw, ch, false);
        this.gl.toneMapping = THREE.ACESFilmicToneMapping;
        this.gl.toneMappingExposure = 1.05;
      }
      this.gl.setRenderTarget(null);
      this.gl.render(scene, camera);
      return;
    }
    this.watch();
    if (this.okIn > 0 && --this.okIn === 0) store.set(RUN_KEY, JSON.stringify({ tier: this.tier, ok: true }));
    const tier = postQuality.quality;
    const T = TIERS[tier];
    const dpr = Math.min(window.devicePixelRatio || 1, T.dpr[TOUCH ? 1 : 0]);
    const size = `${cw}x${ch}x${dpr}x${tier}`;
    if (tier !== this.tier || size !== this.size) this.setup(tier, cw, ch, dpr, size);
    const look = (scene.userData.post ?? {}) as PostLook;
    const gl = this.gl;
    const exposure = LOOK.exposure * (look.exposure ?? 1);
    gl.toneMappingExposure = exposure;
    // (the sun's shadow map, fitted to what the camera looks at: shadows.ts)
    this.shadows.before(scene, camera, T.shadow || (SHADOWS_FORCED || (tier === "mid" && !TOUCH) ? 1024 : 0));
    if (!T.post) {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      this.shadows.after();
      return;
    }
    // the scene, into the HDR target
    gl.setRenderTarget(this.rt);
    gl.render(scene, camera);
    this.shadows.after();
    const auto = gl.autoClear;
    const u = this.comp.uniforms;
    const bloomK = LOOK.bloom * (look.bloom ?? 1);
    const aoK = T.ao ? LOOK.ao * (look.ao ?? 1) : 0;
    // ambient occlusion
    const doAO = aoK > 0 && !!this.ao && !!this.lin && !!this.rt!.depthTexture && camera instanceof THREE.PerspectiveCamera;
    if (doAO && this.ao && this.lin) {
      const l = this.linMat.uniforms;
      l.tDepth.value = this.rt!.depthTexture;
      l.cNear.value = camera.near;
      l.cFar.value = camera.far;
      this.draw(this.linMat, this.lin);
      const a = this.aoMat.uniforms;
      a.tLin.value = this.lin.texture;
      a.texel.value.set(1 / this.lin.width, 1 / this.lin.height);
      a.proj.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
      this.draw(this.aoMat, this.ao[0]);
      const b = this.aoBlur.uniforms;
      b.tSrc.value = this.ao[0].texture;
      b.dir.value.set(1 / this.ao[0].width, 0);
      this.draw(this.aoBlur, this.ao[1]);
      b.tSrc.value = this.ao[1].texture;
      b.dir.value.set(0, 1 / this.ao[0].height);
      this.draw(this.aoBlur, this.ao[0]);
      u.tAO.value = this.ao[0].texture;
      u.tDepth.value = this.rt!.depthTexture;
      u.aoSize.value.set(this.ao[0].width, this.ao[0].height);
      u.cNear.value = camera.near;
      u.cFar.value = camera.far;
    }
    // bloom: the bright pixels, down the chain and back up
    const doBloom = bloomK > 0 && this.mips.length > 0;
    if (doBloom) {
      this.bright.uniforms.tScene.value = this.rt!.texture;
      this.bright.uniforms.hot.value = LOOK.hot * (look.hot ?? 1);
      this.bright.uniforms.texel.value.set(1 / this.w, 1 / this.h);
      this.draw(this.bright, this.mips[0]);
      for (let i = 1; i < this.mips.length; i++) {
        this.down.uniforms.tSrc.value = this.mips[i - 1].texture;
        this.down.uniforms.texel.value.set(1 / this.mips[i - 1].width, 1 / this.mips[i - 1].height);
        this.draw(this.down, this.mips[i]);
      }
      // (each wider level a little fainter than the last: a tight glow round a light, a soft one further out)
      this.up.uniforms.k.value = BLOOM_FALL;
      for (let i = this.mips.length - 1; i > 0; i--) {
        this.up.uniforms.tSrc.value = this.mips[i].texture;
        this.up.uniforms.texel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
        this.draw(this.up, this.mips[i - 1], false);
      }
      u.tBloom.value = this.mips[0].texture;
    }
    const key = `${doAO ? 1 : 0}${doBloom ? 1 : 0}`;
    if (key !== this.compKey) {
      this.compKey = key;
      const d: Record<string, number | string> = { PT_TONE: TONE_ID[LOOK.tone], PT_DEBUG: DEBUG };
      if (doAO) d.PT_AO = 1;
      if (doBloom) d.PT_BLOOM = 1;
      this.comp.defines = d;
      this.comp.needsUpdate = true;
    }
    const g = look.grade ?? 1;
    u.tScene.value = this.rt!.texture;
    // (the levels add up: the bloom's weight per level)
    let norm = 0;
    for (let i = 0; i < this.mips.length; i++) norm += BLOOM_FALL ** i;
    u.bloomK.value = bloomK / Math.max(1, norm);
    u.aoK.value = aoK;
    u.exposure.value = exposure;
    u.sat.value = 1 + (LOOK.saturation - 1) * g;
    u.con.value = LOOK.contrast * g;
    u.vig.value = LOOK.vignette * g;
    u.aspect.value = this.w / this.h;
    this.draw(this.comp, null);
    gl.autoClear = auto;
  }

  /** Get a scene's shaders ready for the tier it will be drawn in. */
  compile(scene: THREE.Scene, camera: THREE.Camera) {
    const T = TIERS[postQuality.quality];
    const gl = this.gl;
    const was = gl.getRenderTarget();
    if (!LEGACY && T.post && this.rt && this.tier === postQuality.quality) gl.setRenderTarget(this.rt);
    gl.compile(scene, camera);
    gl.setRenderTarget(was);
  }

  /** A full-screen pass into `rt` (cleared first, a free "don't load" on a tiled GPU; not when it adds on). */
  private draw(m: THREE.ShaderMaterial, rt: THREE.WebGLRenderTarget | null, clear = true) {
    this.quad.material = m;
    this.gl.setRenderTarget(rt);
    this.gl.autoClear = clear;
    this.quad.render(this.gl);
  }

  private setup(tier: Quality, cw: number, ch: number, dpr: number, size: string) {
    const T = TIERS[tier];
    const gl = this.gl;
    const retier = tier !== this.tier;
    if (retier) {
      // (the crash memory: this tier is being tried; done after a few hundred frames, or a clean leave)
      store.set(RUN_KEY, JSON.stringify({ tier, ok: false }));
      this.okIn = 240;
      if (import.meta.env?.DEV) console.warn(`[post] drawing at ${tier} (${postQuality.why}), ${cw}x${ch} css at dpr ${dpr}, ios ${IOS}`);
    }
    this.tier = tier;
    this.size = size;
    gl.setPixelRatio(dpr);
    gl.setSize(cw, ch, false);
    // the low tier tones in the materials; the post tiers tone in the composite (a target is never toned)
    gl.toneMapping = THREE.CustomToneMapping;
    const v = gl.getDrawingBufferSize(new THREE.Vector2());
    this.w = Math.max(1, v.x);
    this.h = Math.max(1, v.y);
    if (retier) this.free();
    if (!T.post) return;
    if (!this.rt) {
      this.rt = new THREE.WebGLRenderTarget(this.w, this.h, { ...rtOpts, depthBuffer: true, samples: T.samples, depthTexture: T.ao && this.canAO ? new THREE.DepthTexture(this.w, this.h) : null });
      for (let i = 0; i < T.levels; i++) this.mips.push(new THREE.WebGLRenderTarget(1, 1, rtOpts));
      if (T.ao && this.canAO) {
        this.ao = [new THREE.WebGLRenderTarget(1, 1, rtOpts), new THREE.WebGLRenderTarget(1, 1, rtOpts)];
        this.lin = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, format: THREE.RedFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
      }
      this.compKey = "";
    }
    this.rt.setSize(this.w, this.h);
    let mw = this.w, mh = this.h;
    for (const m of this.mips) {
      mw = Math.max(1, Math.round(mw / 2));
      mh = Math.max(1, Math.round(mh / 2));
      m.setSize(mw, mh);
    }
    if (this.ao) for (const a of this.ao) a.setSize(Math.max(1, Math.round(this.w / 2)), Math.max(1, Math.round(this.h / 2)));
    this.lin?.setSize(Math.max(1, Math.round(this.w / 2)), Math.max(1, Math.round(this.h / 2)));
  }

  /** The auto tier: a tier down when the frames stay slow (never back up within the page). */
  private watch() {
    const now = performance.now();
    const dt = now - this.lastT;
    this.lastT = now;
    if (!postQuality.auto || postQuality.quality === "low") return;
    // (a pause, a hidden tab, a scene being built: start over)
    if (dt > 250) {
      this.skip = 45;
      this.win.length = 0;
      return;
    }
    if (this.skip > 0) {
      this.skip--;
      return;
    }
    this.win.push(dt);
    if (this.win.length < 60) return;
    const s = this.win.sort((a, b) => a - b);
    const med = s[s.length >> 1];
    this.win.length = 0;
    // two slow seconds in a row (~45 fps or less), or one very slow
    this.slow = med > 22 ? this.slow + 1 : 0;
    if (this.slow >= 2 || med > 34) {
      const next: Quality = postQuality.quality === "high" ? "mid" : "low";
      console.info(`[post] ${postQuality.quality} → ${next}: frames at ${med.toFixed(1)} ms`);
      postQuality.quality = next;
      postQuality.why = `slow (${med.toFixed(1)} ms)`;
      this.slow = 0;
      this.skip = 45;
    }
  }

  private free() {
    this.rt?.depthTexture?.dispose();
    this.rt?.dispose();
    this.rt = null;
    for (const m of this.mips) m.dispose();
    this.mips = [];
    if (this.ao) for (const a of this.ao) a.dispose();
    this.ao = null;
    this.lin?.dispose();
    this.lin = null;
  }

  dispose() {
    runOk();
    this.free();
    this.quad.dispose();
    for (const m of [this.bright, this.down, this.up, this.linMat, this.aoMat, this.aoBlur, this.comp]) m.dispose();
  }
}
