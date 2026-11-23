import type * as THREE from "three";

/** 0 by day, 1 by night: the rooms behind the windows' glass light up (a share of them). */
export const GLASS_NIGHT = { value: 0 };

/**
 * The surface of a voxel: what it is made of (the material class the mesher hides in the normal,
 * see MAT_NORMAL) becomes grain, gloss and relief — brick courses and mortar, roof tiles, stone
 * joints, wood planks, leaves, brushed metal, polished white. Patterns live in the model's own
 * metres and fade out once a pixel covers more than a few centimetres, so the city from afar
 * stays as clean as before and up close every wall has a material.
 */

const VERT_HEAD = /* glsl */ `
varying vec3 vVoxP;
varying vec3 vVoxN;
varying float vMat;
`;

const VERT_NORMAL = /* glsl */ `
vMat = -1.0;
{
  // a voxel face: one major axis, both minors equal to class × 2/127 (in proportion, should the
  // geometry have been rotated or scaled on the way)
  vec3 an = abs(objectNormal);
  float mj = max(an.x, max(an.y, an.z));
  float lo = min(an.x, min(an.y, an.z));
  float mid = an.x + an.y + an.z - mj - lo;
  if (mj > 0.85 && mid < mj * 0.12 && mid - lo < mj * 0.01) {
    vMat = floor(mid / mj * 63.5 + 0.5);
    objectNormal = sign(objectNormal) * step(vec3(mj), an);
  }
}
#ifdef USE_COLOR
// a smooth surface (foliage, see smooth.ts): its material from its colour
if (vMat < 0.0) vMat = (color.g > color.r * 1.08 && color.g > color.b * 1.02) ? 5.0 : 0.0;
#endif
if (vMat < 0.0) vMat = 0.0;
vVoxN = objectNormal;
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vVoxP;
varying vec3 vVoxN;
varying float vMat;
float vxHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vxNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(vxHash(i), vxHash(i + vec2(1.0, 0.0)), f.x), mix(vxHash(i + vec2(0.0, 1.0)), vxHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
/** Distance (m) to the nearest joint of a running-bond grid of w × h blocks, and the block's id. */
vec3 vxBond(vec2 q, float w, float h, float shift) {
  float row = floor(q.y / h);
  float x = q.x / w + row * shift;
  vec2 f = vec2(fract(x), fract(q.y / h));
  float e = min(min(f.x, 1.0 - f.x) * w, min(f.y, 1.0 - f.y) * h);
  return vec3(e, floor(x), row);
}
/**
 * One voxel material: tint (relative brightness), height (0..1, for the relief), roughness,
 * metalness and grout (how much of a pale joint shows).
 */
void vxSurface(float m, vec2 q, bool top, out float tint, out float h, out float rough, out float metal, out float grout) {
  tint = 0.0; h = 0.0; rough = 0.86; metal = 0.02; grout = 0.0;
  float n1 = vxNoise(q * 6.0);
  float n2 = vxNoise(q * 17.0);
  if (m < 0.5) {
    // paint: satin, the faintest orange peel
    rough = 0.58; tint = (n1 - 0.5) * 0.035; h = n2 * 0.25;
  } else if (m < 1.5) {
    if (top) {
      // terracotta roof: rows of round tiles, each a little different, a shadow under each row
      float rowH = 0.2;
      float ri = floor(q.y / rowH), fr = fract(q.y / rowH);
      float col = (q.x + ri * 0.09) / 0.17;
      float fc = fract(col);
      float arch = sqrt(max(0.0, 1.0 - pow(2.0 * fc - 1.0, 2.0)));
      h = arch * 0.7 + fr * 0.3;
      tint = (vxHash(vec2(floor(col), ri)) - 0.5) * 0.16 - (1.0 - smoothstep(0.0, 0.14, fr)) * 0.22 + (arch - 0.6) * 0.1;
      rough = 0.7;
    } else {
      // brick in running bond, pale mortar
      vec3 b = vxBond(q, 0.25, 0.0833, 0.5);
      float mortar = 1.0 - smoothstep(0.004, 0.01, b.x);
      tint = (vxHash(b.yz) - 0.5) * 0.18 + (n2 - 0.5) * 0.06;
      h = (1.0 - mortar) * 0.8 + n2 * 0.2;
      grout = mortar * 0.8;
      rough = 0.84;
    }
  } else if (m < 2.5) {
    // dressed stone / stucco: big ashlar blocks, thin joints, a fine grain
    vec3 b = top ? vxBond(q, 0.667, 0.667, 0.0) : vxBond(q, 0.5, 0.333, 0.5);
    float joint = 1.0 - smoothstep(0.003, 0.008, b.x);
    tint = (vxHash(b.yz) - 0.5) * 0.07 + (n2 - 0.5) * 0.06 + (n1 - 0.5) * 0.04 - joint * 0.12;
    h = (1.0 - joint) * 0.6 + n2 * 0.4;
    rough = 0.8;
  } else if (m < 3.5) {
    // concrete: speckle and slow blotches
    float n0 = vxNoise(q * 1.3);
    tint = (n2 - 0.5) * 0.07 + (n0 - 0.5) * 0.07;
    h = n2 * 0.6 + vxNoise(q * 3.5) * 0.4;
    rough = 0.92;
  } else if (m < 4.5) {
    // wood: planks with their gaps, grain along the board
    float w = 0.14;
    vec2 a = top ? q : q;
    float pi = floor(a.y / w), pf = fract(a.y / w);
    float gap = 1.0 - smoothstep(0.0, 0.06, min(pf, 1.0 - pf));
    float grain = vxNoise(vec2(a.x * 1.6 + pi * 13.1, a.y * 55.0));
    float knot = vxNoise(vec2(a.x * 4.0, pi * 3.7));
    tint = (vxHash(vec2(pi, 3.0)) - 0.5) * 0.14 + (grain - 0.5) * 0.16 - gap * 0.3 + (knot - 0.5) * 0.05;
    h = (1.0 - gap) * 0.7 + grain * 0.3;
    rough = 0.7;
  } else if (m < 5.5) {
    // leaves: clumps of light and shade
    float c = vxNoise(q * 14.0);
    float f = vxNoise(q * 45.0);
    tint = (c - 0.5) * 0.26 + (f - 0.5) * 0.1;
    h = c * 0.6 + f * 0.4;
    rough = 0.78;
  } else if (m < 6.5) {
    // dark metal, rubber, lacquer: brushed, with a sheen
    float br = vxNoise(vec2(q.x * 3.0, q.y * 140.0));
    tint = (br - 0.5) * 0.05;
    h = br * 0.08;
    rough = 0.4; metal = 0.45;
  } else {
    // white: polished plaster and enamel, marble underfoot
    tint = (n1 - 0.5) * 0.02;
    if (top) {
      float v = abs(sin((q.x * 0.8 + q.y * 1.3) * 3.0 + vxNoise(q * 2.2) * 5.0));
      tint -= (1.0 - smoothstep(0.0, 0.07, v)) * 0.07;
      vec3 b = vxBond(q, 0.667, 0.667, 0.0);
      tint -= (1.0 - smoothstep(0.002, 0.005, b.x)) * 0.08;
    }
    h = n2 * 0.1;
    rough = 0.5;
  }
}
`;

const FRAG_COLOR = /* glsl */ `
float vxRough = 0.86, vxMetal = 0.02, vxH = 0.0, vxDetail = 0.0;
{
  vec3 an = abs(vVoxN);
  vec2 q = an.y > 0.5 ? vVoxP.xz : (an.x > 0.5 ? vVoxP.zy : vVoxP.xy);
  float tint, grout;
  vxSurface(vMat, q, vVoxN.y > 0.5, tint, vxH, vxRough, vxMetal, grout);
  // metres per pixel: past a few centimetres the pattern would only shimmer
  float px = length(fwidth(vVoxP));
  vxDetail = 1.0 - smoothstep(0.02, 0.06, px);
  diffuseColor.rgb *= 1.0 + tint * vxDetail;
  // weathering at the scale of metres, which still reads from across the street: rain streaks down
  // walls, damp blotches, a little grime at the foot of every wall
  float vxFar = 1.0 - smoothstep(0.06, 0.2, px);
  if (vMat > 0.5 && vMat < 3.5 || vMat > 5.5 && vMat < 6.5) {
    float side = 1.0 - abs(vVoxN.y);
    float streak = vxNoise(vec2(q.x * 3.1, vVoxP.y * 0.35)) * vxNoise(vec2(q.x * 0.7 + 3.0, vVoxP.y * 0.12));
    float blot = vxNoise(q * 0.45 + 11.0);
    float foot = (1.0 - smoothstep(0.0, 0.9, vVoxP.y)) * side;
    float w = (streak - 0.25) * 0.16 * side + (blot - 0.5) * 0.1 - foot * 0.1;
    diffuseColor.rgb *= 1.0 + w * vxFar;
  }
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum * 1.3 + 0.03), grout * vxDetail * 0.55);
}
`;

const FRAG_BUMP = /* glsl */ `
{
  // relief from the procedural height, by screen derivatives (no tangents needed)
  float H = vxH * 0.006 * vxDetail;
  vec2 dH = vec2(dFdx(H), dFdy(H));
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float fd = dot(sx, r1) * faceDirection;
  vec3 g = sign(fd) * (dH.x * r1 + dH.y * r2);
  normal = normalize(abs(fd) * normal - g);
}
`;

const GLASS = /* glsl */ `
{
  // curtain walls are never quite flat: each pane tilts a hair and polishes a little differently,
  // so the sky and the neon break up across a facade instead of sliding over it as one mirror
  vec3 an = abs(vVoxN);
  vec2 q = an.y > 0.5 ? vVoxP.xz : (an.x > 0.5 ? vVoxP.zy : vVoxP.xy);
  vec2 cell = floor(q / vec2(0.667, 0.833));
  vec3 t = vec3(vxHash(cell), vxHash(cell + 7.13), vxHash(cell + 3.71)) - 0.5;
  normal = normalize(normal + t * 0.07);
  roughnessFactor = 0.24 + vxHash(cell + 1.9) * 0.14;
  // the room behind (upper floors, upright glass: not a car's window, not a shopfront with its own
  // interior, not a skylight): a back wall lit from the ceiling, furniture low down, blinds half
  // drawn here, curtains there; by day dim inside under the reflection, by night a share of the
  // rooms lit warm or cool and the rest dark
  if (an.y < 0.5 && vVoxP.y > 2.6) {
    vec2 cs = vec2(1.35, 1.25);
    vec2 cid = floor(q / cs);
    vec2 f = fract(q / cs);
    float h1 = vxHash(cid + 0.37), h2 = vxHash(cid + 5.13), h3 = vxHash(cid + 9.71);
    vec3 wallC = mix(vec3(0.62, 0.55, 0.46), vec3(0.46, 0.52, 0.6), h2);
    float ceilL = smoothstep(0.55, 0.97, f.y);
    vec3 room = wallC * (0.28 + 0.62 * ceilL);
    // furniture: a dark band low in the room, a lamp's pool beside it
    float sofa = step(f.y, 0.3) * step(0.12 + 0.3 * h3, f.x) * step(f.x, 0.55 + 0.35 * h3);
    room *= 1.0 - 0.55 * sofa;
    // blinds over the top part (slats), or curtains at the sides, or nothing
    float blind = step(0.62, h1) * step(1.0 - (0.25 + 0.55 * h3), f.y);
    float slat = 0.72 + 0.28 * step(0.45, fract(f.y * 22.0));
    room = mix(room, vec3(0.86, 0.84, 0.78) * slat * 0.75, blind);
    float curt = step(h1, 0.22) * (step(f.x, 0.2 + 0.08 * h3) + step(0.8 - 0.08 * h3, f.x));
    vec3 cc = mix(vec3(0.72, 0.28, 0.24), vec3(0.88, 0.8, 0.6), h2);
    room = mix(room, cc * 0.7, clamp(curt, 0.0, 1.0));
    // the mullion between bays
    float frame = 1.0 - step(0.035, f.x) * step(f.x, 0.965) * step(0.03, f.y) * step(f.y, 0.97);
    float lit = step(0.58, fract(h2 * 7.31 + h3 * 3.17));
    vec3 warm = mix(vec3(1.0, 0.78, 0.5), vec3(0.78, 0.86, 1.0), step(0.75, h3));
    float px = length(fwidth(vVoxP));
    float near = 1.0 - smoothstep(0.08, 0.35, px);
    // by day: the glass a little darker, the room seen through it, dim
    vec3 dayIn = room * 0.16;
    vec3 nightIn = room * warm * (0.55 + 0.45 * ceilL) * 1.35 * lit + room * 0.012;
    totalEmissiveRadiance += mix(dayIn, nightIn, uGlassNight) * (1.0 - frame) * mix(0.6, 1.0, near);
    diffuseColor.rgb *= mix(0.55, 1.0, frame);
  }
}
`;

function vertex(sh: THREE.WebGLProgramParametersWithUniforms) {
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", "#include <common>\n" + VERT_HEAD)
    .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n" + VERT_NORMAL)
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvVoxP = transformed;");
}

/** Shader hook for solid voxels (MeshStandardMaterial). */
export function voxelSolid(sh: THREE.WebGLProgramParametersWithUniforms) {
  vertex(sh);
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <common>", "#include <common>\n" + FRAG_HEAD)
    .replace("#include <color_fragment>", "#include <color_fragment>\n" + FRAG_COLOR)
    .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = vxRough;")
    .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = vxMetal;")
    .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + FRAG_BUMP);
}

/** Shader hook for window glass (MeshStandardMaterial). */
export function voxelGlass(sh: THREE.WebGLProgramParametersWithUniforms) {
  vertex(sh);
  sh.uniforms.uGlassNight = GLASS_NIGHT;
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform float uGlassNight;\n" + FRAG_HEAD)
    .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + GLASS);
}
