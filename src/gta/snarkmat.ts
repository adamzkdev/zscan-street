import * as THREE from "three";

/**
 * The zkSNARKs' material and their art (src/gta, the realistic figures): every figure in the city —
 * the passers-by in their batch, you, the title's crew — is drawn with ONE material:
 *
 *  - its face in its hood's opening (and a hat's badge) is its own picture, upscaled (EPX twice: the
 *    pixel art's stairs become smooth diagonals) into a slot of a shared art atlas (a 4096 × 2048
 *    texture of 128 px slots, 512 of them; a phone 2048 × 2048, 256), written into the GPU texture a
 *    slot at a time; the slot's alpha says where the picture shows (per texel: a smooth edge);
 *  - everything else is cloth, denim, rubber or skin in the figure's own colours (vertex colours, or
 *    the batch's colour per instance), with a fabric's surface drawn in the shader: a jersey's fine
 *    knit and its soft folds, ribbed cuffs and hems, denim's twill, the sneakers' matte rubber, and a
 *    cloth's sheen at grazing angles (MeshPhysicalMaterial's sheen) — no texture to load, sharp at any
 *    distance, fading out where it would shimmer.
 *
 * Every geometry carries: position, normal, color, uv (the art atlas), aFab (the fabric's own metres)
 * and `aMix` (x: how much of the picture shows, 0…1; y: the fabric: MAT below; z: the light it gets —
 * the hood's opening, the collar, under the arms darker: a baked occlusion).
 */

export const MAT = { art: 0, jersey: 1, rib: 2, denim: 3, skin: 4, rubber: 5, upper: 6, knit: 7 } as const;

const COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
export const SLOT = 128;
/** The picture inside a slot: the 26 cells × 4 (EPX twice), centred, its edges bled into the margin. */
export const ART = 104;
const PAD = (SLOT - ART) / 2;
const AW = COARSE ? 2048 : 4096,
  AH = 2048;
const COLS = AW / SLOT,
  ROWS = AH / SLOT;
export const SLOTS = COLS * ROWS;

let atlas: THREE.DataTexture | null = null;
function atlasTex() {
  if (atlas) return atlas;
  atlas = new THREE.DataTexture(null, AW, AH, THREE.RGBAFormat, THREE.UnsignedByteType);
  // (storage only: the slots are written into the GPU's copy one by one, never the whole picture)
  atlas.source.dataReady = false;
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.anisotropy = 4;
  atlas.flipY = false;
  atlas.userData.shared = true;
  atlas.needsUpdate = true;
  return atlas;
}

// ---- the slots -----------------------------------------------------------------------------------------

const freeSlots: number[] = [];
for (let i = SLOTS - 1; i >= 1; i--) freeSlots.push(i);
/** Slot 0: a plain one (a figure whose picture could not get a slot). */
export const SLOT_NONE = 0;
const pending = new Map<number, Uint8Array>();
let renderer: THREE.WebGLRenderer | null = null;

/** The renderer that draws the figures (the atlas is written through it). */
export function snarkRenderer(r: THREE.WebGLRenderer) {
  renderer = r;
  const t = atlasTex();
  t.anisotropy = Math.min(8, r.capabilities.getMaxAnisotropy());
}

export function slotAlloc(): number {
  return freeSlots.pop() ?? SLOT_NONE;
}
export function slotFree(s: number) {
  if (s === SLOT_NONE) return;
  pending.delete(s);
  freeSlots.push(s);
}
export const slotsLeft = () => freeSlots.length;

/** The slot's art (ART × ART RGBA, row 0 at the top) to be written at the next `flushArt`. */
export function slotWrite(s: number, px: Uint8Array) {
  if (s === SLOT_NONE) return;
  pending.set(s, px);
}

/** The UV rectangle of a cell's square in a slot: (cell x, cell y) of the 26 → atlas u, v. */
export function slotUV(s: number, cx: number, cy: number, out: [number, number]) {
  const col = s % COLS,
    row = Math.floor(s / COLS);
  out[0] = (col * SLOT + PAD + (cx / 26) * ART) / AW;
  out[1] = (row * SLOT + PAD + (cy / 26) * ART) / AH;
  return out;
}

const box = new THREE.Box2();
const at = new THREE.Vector2();
const src = new THREE.DataTexture(new Uint8Array(SLOT * SLOT * 4), SLOT, SLOT, THREE.RGBAFormat, THREE.UnsignedByteType);
src.flipY = false;
src.colorSpace = THREE.SRGBColorSpace;
src.generateMipmaps = false;
/** Write the slots made since the last frame into the GPU's atlas (a few at most each frame). */
export function flushArt(max = 6) {
  if (!renderer || !pending.size) return;
  const dst = atlasTex();
  if (!renderer.properties.has(dst) || !(renderer.properties.get(dst) as { __webglTexture?: unknown }).__webglTexture) renderer.initTexture(dst);
  let n = 0;
  for (const [s, px] of pending) {
    if (n++ >= max) break;
    pending.delete(s);
    // the slot with its margin: the art's edge pixels carried out to the border (no bleeding of a
    // neighbour's picture into this one's mipmaps)
    const d = src.image.data as Uint8Array;
    for (let y = 0; y < SLOT; y++) {
      const sy = Math.min(ART - 1, Math.max(0, y - PAD));
      for (let x = 0; x < SLOT; x++) {
        const sx = Math.min(ART - 1, Math.max(0, x - PAD));
        const i = (y * SLOT + x) * 4,
          j = (sy * ART + sx) * 4;
        d[i] = px[j];
        d[i + 1] = px[j + 1];
        d[i + 2] = px[j + 2];
        d[i + 3] = px[j + 3];
      }
    }
    const col = s % COLS,
      row = Math.floor(s / COLS);
    box.min.set(0, 0);
    box.max.set(SLOT, SLOT);
    at.set(col * SLOT, row * SLOT);
    // (the last one of the batch makes the mipmaps again)
    dst.generateMipmaps = !pending.size || n >= max;
    renderer.copyTextureToTexture(src, dst, box, at);
  }
  dst.generateMipmaps = true;
}

// ---- the art: 26 × 26 cells → ART × ART ------------------------------------------------------------------

/** EPX / Scale2x: each pixel into four, the corners taking a neighbour's colour where two meet (smooth diagonals). */
function epx(src: Int32Array, w: number, h: number) {
  const out = new Int32Array(w * 2 * h * 2);
  const g = (x: number, y: number) => src[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = g(x, y),
        a = g(x, y - 1),
        b = g(x + 1, y),
        c = g(x - 1, y),
        d = g(x, y + 1);
      let p1 = p,
        p2 = p,
        p3 = p,
        p4 = p;
      if (c === a && c !== d && a !== b) p1 = a;
      if (a === b && a !== c && b !== d) p2 = b;
      if (d === c && d !== b && c !== a) p3 = c;
      if (b === d && b !== a && d !== c) p4 = d;
      const o = y * 2 * w * 2 + x * 2;
      out[o] = p1;
      out[o + 1] = p2;
      out[o + w * 2] = p3;
      out[o + w * 2 + 1] = p4;
    }
  return out;
}

/**
 * A look's picture as the atlas wants it: 26 × 26 cells (−1 nothing) → ART × ART RGBA. The empty
 * round the figure takes the nearest drawn colour (the projection and the mipmaps never meet black),
 * then twice EPX. Its alpha is `mask` (cells): where the picture is shown rather than the cloth —
 * per texel, so its edge is as smooth as the picture, not as coarse as the mesh.
 */
export function artPixels(cells: Int32Array, mask: (cx: number, cy: number) => number) {
  const N = 26;
  const c = new Int32Array(cells);
  // fill the empty from the drawn, ring by ring
  for (let pass = 0; pass < 10; pass++) {
    let any = false;
    const prev = new Int32Array(c);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (prev[y * N + x] >= 0) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          const v = prev[yy * N + xx];
          if (v >= 0) {
            c[y * N + x] = v;
            any = true;
            break;
          }
        }
      }
    if (!any) break;
  }
  for (let i = 0; i < c.length; i++) if (c[i] < 0) c[i] = 0x505050;
  const x2 = epx(c, N, N);
  const x4 = epx(x2, N * 2, N * 2);
  const W = N * 4;
  const out = new Uint8Array(W * W * 4);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      // (no blur: the scale-up's diagonals and the GPU's filtering are the smoothing; the eyes stay sharp)
      const v = x4[y * W + x];
      const o = (y * W + x) * 4;
      out[o] = (v >> 16) & 255;
      out[o + 1] = (v >> 8) & 255;
      out[o + 2] = v & 255;
      // alpha: where the picture shows (the hood's opening, a hat's front), sharp at the texel
      out[o + 3] = Math.round(Math.min(1, Math.max(0, mask((x + 0.5) / 4, (y + 0.5) / 4))) * 255);
    }
  return out;
}

// ---- the material ---------------------------------------------------------------------------------------

const VERT_HEAD = /* glsl */ `
attribute vec3 aMix;
attribute vec2 aFab;
varying vec3 vMix;
varying vec2 vFab;
// (the fabric's id is not blended across a triangle: halfway between knit and jersey is no fabric)
flat varying float vMat;
`;
const VERT_BODY = /* glsl */ `
vMix = aMix;
vFab = aFab;
vMat = aMix.y;
`;
const FRAG_HEAD = /* glsl */ `
varying vec3 vMix;
varying vec2 vFab;
flat varying float vMat;
uniform float uArtOn;
float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), u.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// the fabric's height (m) at uv (m) for a material id, its pattern faded where it would shimmer
float fabricH(vec2 uv, float mat, float fw) {
  float h = 0.0;
  float folds = (sNoise(uv * 6.0) - 0.5) * 0.004 + (sNoise(uv * 15.0 + 7.0) - 0.5) * 0.0015;
  if (mat < 1.5) {
    // jersey: the knit's fine wales, soft folds
    float k = 1.0 - smoothstep(0.0012, 0.003, fw);
    h = folds + k * 0.00025 * sin(uv.x * 2600.0) * (0.6 + 0.4 * sin(uv.y * 1800.0));
  } else if (mat < 2.5) {
    // rib: ridges along the cuff, the hem, the hat
    float k = 1.0 - smoothstep(0.003, 0.007, fw);
    h = k * 0.0009 * abs(sin(uv.x * 700.0));
  } else if (mat < 3.5) {
    // denim: a twill's diagonals and the creases of a pair of jeans (bunched across the leg)
    float k = 1.0 - smoothstep(0.0015, 0.004, fw);
    float crease = (sNoise(vec2(uv.x * 4.0, uv.y * 22.0)) - 0.5) * 0.005;
    h = folds * 0.8 + crease + k * 0.0003 * sin((uv.x + uv.y) * 1900.0);
  } else if (mat < 4.5) {
    h = (sNoise(uv * 80.0) - 0.5) * 0.0002;
  } else if (mat < 5.5) {
    h = (sNoise(uv * 220.0) - 0.5) * 0.0002;
  } else if (mat < 6.5) {
    h = (sNoise(uv * 120.0) - 0.5) * 0.0003 + folds * 0.2;
  } else {
    float k = 1.0 - smoothstep(0.003, 0.008, fw);
    h = k * 0.0008 * abs(sin(uv.x * 520.0));
  }
  return h;
}
vec3 sBump(vec3 surfPos, vec3 n, float h, float faceDir) {
  vec3 dx = dFdx(surfPos), dy = dFdy(surfPos);
  vec3 r1 = cross(dy, n), r2 = cross(n, dx);
  float det = dot(dx, r1) * faceDir;
  vec2 dH = vec2(dFdx(h), dFdy(h));
  vec3 g = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * n - g);
}
`;
const FRAG_MAP = /* glsl */ `
{
  vec4 art = texture2D(map, vMapUv);
  float fabLum = 1.0;
  if (vMat > 2.5 && vMat < 3.5) fabLum = 0.92 + 0.16 * sNoise(vFab * 9.0) + 0.05 * sNoise(vFab * 60.0);
  else if (vMat < 2.5) fabLum = 0.96 + 0.08 * sNoise(vFab * 12.0);
  sArtK = vMix.x * art.a * uArtOn;
  diffuseColor.rgb *= mix(vec3(fabLum), art.rgb, sArtK) * vMix.z;
}
`;
const FRAG_ROUGH = /* glsl */ `
{
  float m = vMat;
  float r = m < 1.5 ? 0.86 : m < 2.5 ? 0.9 : m < 3.5 ? 0.82 : m < 4.5 ? 0.55 : m < 5.5 ? 0.72 : m < 6.5 ? 0.5 : 0.92;
  roughnessFactor = mix(r, 0.48, sArtK);
}
`;
const FRAG_NORMAL = /* glsl */ `
{
  float fw = length(fwidth(vFab));
  float h = fabricH(vFab, vMat, fw) * (1.0 - sArtK);
  normal = sBump(-vViewPosition, normal, h, faceDirection);
}
`;
const FRAG_SHEEN = /* glsl */ `
#ifdef USE_SHEEN
  float sk = vMat < 3.5 ? 1.0 : vMat > 6.5 ? 1.0 : 0.0;
  material.sheenColor *= sk * (1.0 - sArtK) * diffuseColor.rgb * 2.2;
#endif
`;


let mat: THREE.MeshPhysicalMaterial | null = null;
/** (development: 0 shows the figures without their pictures) */
export const artOn = { value: 1 };

/** The figures' one material (shared: the batch, every single figure). */
export function snarkMaterial() {
  if (mat) return mat;
  const m = new THREE.MeshPhysicalMaterial({
    map: atlasTex(),
    vertexColors: true,
    roughness: 0.8,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(0.35, 0.35, 0.35),
    specularIntensity: 0.6,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uArtOn = artOn;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + VERT_HEAD).replace("#include <uv_vertex>", "#include <uv_vertex>\n" + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + FRAG_HEAD)
      .replace("void main() {", "void main() {\n  float sArtK = 0.0;")
      .replace("#include <map_fragment>", FRAG_MAP)
      .replace("#include <color_fragment>", "#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_BATCHING_COLOR )\n  diffuseColor.rgb *= mix(vColor.rgb, vec3(1.0), sArtK);\n#endif")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + FRAG_ROUGH)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + FRAG_NORMAL)
      .replace("#include <lights_physical_fragment>", "#include <lights_physical_fragment>\n" + FRAG_SHEEN);
  };
  m.customProgramCacheKey = () => "zksnark-real";
  m.userData.shared = true;
  mat = m;
  return m;
}


