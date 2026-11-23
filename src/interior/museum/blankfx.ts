import * as THREE from "three";

/**
 * The light of floor 7, A BLANK CANVAS (./blankcanvas.ts): one projection shared by every surface
 * of the warehouse. A work of FedosArt is thrown across the walls unrolled round the room (centred
 * behind the monolith, mirrored on as it runs out, slowly drifting), and the monolith's zkSNARK
 * silhouette shows the same work, sharp, as if it were a hole through to it. The next work spreads
 * out from the monolith over the last one; "white" is the blank canvas (the walls go dark, the
 * silhouette glows white).
 */

/** The zkSNARK in the monolith, as the teaser draws it: 20 × 20 pixels, eyes and the glitched left edge. */
const FIGURE = [
  "...##..##########...",
  ".....#############..",
  ".##.##############..",
  "...################.",
  "......#############.",
  ".#.################.",
  "....###############.",
  "......######..##..#.",
  "..#..#######..##..#.",
  "...################.",
  "##....#############.",
  ".......############.",
  "....##############..",
  ".......###########..",
  "..##..###########...",
  "....##############..",
  ".....##############.",
  ".##################.",
  "...#################",
  "..##################",
];
/** The monolith is a zkSNARK's canvas: 26 × 26 pixels, the figure 4 in from the left, 5 down. */
export const GRID = 26;
const FX = 4,
  FY = 5;
/** Where the figure sits in the grid (cells, from the bottom left): its centre, its box. */
export const FIG = { cx: FX + 10, cy: GRID - FY - 10, x0: FX, x1: FX + 20, y0: GRID - FY - 20, y1: GRID - FY };

export function maskTexture() {
  const d = new Uint8Array(GRID * GRID);
  FIGURE.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === "#") d[(GRID - 1 - (FY + r)) * GRID + FX + c] = 255;
  });
  const t = new THREE.DataTexture(d, GRID, GRID, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** The room, for the unrolling (floor-local metres): half width, front and back walls, the projection's centre and height. */
export const ROOM = { XW: 15, Z0: -8, ZB: -46, PX: 0.27, PY: 3.2, HP: 13 };

const blank = new THREE.Texture();

/** The uniforms every projected surface shares. */
export function projectionUniforms(floorY: number) {
  return {
    uA: { value: blank as THREE.Texture },
    uB: { value: blank as THREE.Texture },
    uAspA: { value: 0.75 },
    uAspB: { value: 0.75 },
    uWhiteA: { value: 1 },
    uWhiteB: { value: 1 },
    uMix: { value: 0 },
    uTime: { value: 0 },
    uDrift: { value: 0 },
    uGlitch: { value: 0 },
    uColA: { value: new THREE.Color("#000000") },
    uColB: { value: new THREE.Color("#000000") },
    uFloorY: { value: floorY },
    uGain: { value: 6 },
  };
}
export type ProjectionUniforms = ReturnType<typeof projectionUniforms>;

const PROJ = /* glsl */ `
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uAspA;
uniform float uAspB;
uniform float uWhiteA;
uniform float uWhiteB;
uniform float uMix;
uniform float uTime;
uniform float uDrift;
uniform float uGlitch;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uFloorY;
uniform float uGain;
const float BC_XW = ${ROOM.XW.toFixed(2)};
const float BC_Z0 = ${ROOM.Z0.toFixed(2)};
const float BC_ZB = ${ROOM.ZB.toFixed(2)};
const float BC_PX = ${ROOM.PX.toFixed(3)};
const float BC_PY = ${ROOM.PY.toFixed(3)};
const float BC_HP = ${ROOM.HP.toFixed(2)};
float bcMirror(float u) {
  float m = mod(u, 2.0);
  return m < 1.0 ? m : 2.0 - m;
}
float bcHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
/** How far along the walls, unrolled from behind the monolith (metres); 1e4 off the walls. */
float bcAlong(vec3 p, vec3 n) {
  if (n.z > 0.5) return p.x - BC_PX;
  if (n.x > 0.5) return -BC_XW - (p.z - BC_ZB) - BC_PX;
  if (n.x < -0.5) return BC_XW + (p.z - BC_ZB) - BC_PX;
  if (n.z < -0.5) return (p.x < 0.0 ? -2.0 * BC_XW - (BC_Z0 - BC_ZB) - p.x : 2.0 * BC_XW + (BC_Z0 - BC_ZB) - p.x) - BC_PX;
  return 1e4;
}
/** A work's coordinates at s along the walls, height y: centred on the silhouette, breathing, drifting. */
vec2 bcUV(float s, float y, float asp) {
  float z = 1.0 + 0.06 * sin(uDrift * 0.19);
  float u = 0.5 + s / (BC_HP * asp * z) + 0.035 * sin(uDrift * 0.11);
  float v = 0.5 + (y - BC_PY) / (BC_HP * z) + 0.045 * sin(uDrift * 0.15 + 1.3);
  return vec2(bcMirror(u), bcMirror(v));
}
/** The two works' light at s, y; B spreading out from the monolith over A as uMix goes 0 → 1. */
vec3 bcLight(float s, float y, float bias) {
  float d = abs(s) / 70.0;
  float m = clamp((uMix * 1.4 - d) / 0.4, 0.0, 1.0);
  vec3 a = texture(uA, bcUV(s, y, uAspA), bias).rgb * (1.0 - uWhiteA);
  vec3 b = texture(uB, bcUV(s, y, uAspB), bias).rgb * (1.0 - uWhiteB);
  // the wave's front: a thin seam of light
  float seam = (1.0 - abs(m - 0.5) * 2.0) * step(0.001, uMix) * step(uMix, 0.999);
  return mix(a, b, m) + seam * 0.35 * mix(uColA, uColB, 0.5 + 0.5 * (1.0 - uWhiteB));
}
`;

/**
 * A standard material (it keeps the lamps, the reflections, the grain) that also takes the
 * projection: walls and pillars show the work; floors, a glow of its colour near the walls.
 */
export function projected(m: THREE.MeshStandardMaterial, u: ProjectionUniforms, kind: "wall" | "floor" = "wall") {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBcP;\nvarying vec3 vBcN;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvBcP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvBcN = normalize(mat3(modelMatrix) * objectNormal);");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vBcP;\nvarying vec3 vBcN;\n${PROJ}`).replace(
      "#include <emissivemap_fragment>",
      kind === "wall"
        ? `#include <emissivemap_fragment>
{
  vec3 p = vBcP - vec3(0.0, uFloorY, 0.0);
  float s = bcAlong(p, normalize(vBcN));
  if (s < 9000.0) totalEmissiveRadiance += diffuseColor.rgb * bcLight(s, p.y, 1.2) * uGain;
}`
        : `#include <emissivemap_fragment>
{
  vec3 p = vBcP - vec3(0.0, uFloorY, 0.0);
  // the walls' light spilling onto the floor at their feet
  float dw = min(min(p.x + BC_XW, BC_XW - p.x), p.z - BC_ZB);
  float kw = exp(-max(dw, 0.0) / 2.6);
  // and round the monolith, its figure's light (white for the blank canvas)
  float dm = length(vec2((p.x - BC_PX) * 0.8, p.z + 32.0));
  float km = 0.8 * exp(-dm / 2.8);
  vec3 wa = uColA * (1.0 - uWhiteA), wb = uColB * (1.0 - uWhiteB);
  vec3 ma = mix(uColA, vec3(1.0), uWhiteA), mb = mix(uColB, vec3(1.0), uWhiteB);
  vec3 c = mix(wa, wb, uMix) * kw + mix(ma, mb, uMix) * km;
  totalEmissiveRadiance += diffuseColor.rgb * c * uGain * 0.6;
}`,
    );
  };
  m.customProgramCacheKey = () => `blank-canvas-${kind}`;
  return m;
}

const SIL_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vBcP;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vBcP = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/** The mask's cell c (0 outside), and a thin line along the sides of c that face the slab. */
const RIM = /* glsl */ `
float bcCell(vec2 c) {
  if (c.x < 0.0 || c.y < 0.0 || c.x > ${GRID - 1}.0 || c.y > ${GRID - 1}.0) return 0.0;
  return texture(uMask, (c + 0.5) / ${GRID}.0).r;
}
float bcRim(vec2 c, vec2 fr) {
  float r = 0.0;
  if (bcCell(c + vec2(1.0, 0.0)) < 0.5) r = max(r, smoothstep(0.86, 1.0, fr.x));
  if (bcCell(c - vec2(1.0, 0.0)) < 0.5) r = max(r, smoothstep(0.14, 0.0, fr.x));
  if (bcCell(c + vec2(0.0, 1.0)) < 0.5) r = max(r, smoothstep(0.86, 1.0, fr.y));
  if (bcCell(c - vec2(0.0, 1.0)) < 0.5) r = max(r, smoothstep(0.14, 0.0, fr.y));
  return r;
}
`;

const SIL_FRAG = /* glsl */ `
uniform sampler2D uMask;
uniform float uFlip;
uniform float uCell;
varying vec2 vUv;
varying vec3 vBcP;
${PROJ}
${RIM}
void main() {
  vec2 q = vUv;
  if (uFlip > 0.5) q.x = 1.0 - q.x;
  vec2 cell = floor(q * ${GRID}.0);
  // the glitch: rows slide sideways by whole pixels for a frame or two
  float tick = floor(uTime * 14.0);
  float sh = 0.0;
  if (bcHash(vec2(cell.y, tick)) < uGlitch * 0.4) sh = floor((bcHash(vec2(tick, cell.y + 3.0)) - 0.5) * 6.0);
  vec2 c = vec2(cell.x - sh, cell.y);
  if (bcCell(c) < 0.5) discard;
  float rim = bcRim(c, fract(q * ${GRID}.0));
  vec3 p = vBcP - vec3(0.0, uFloorY, 0.0);
  float s = p.x - BC_PX - sh * uCell;
  // B takes over pixel by pixel, in a random order, each pixel flashing as it turns
  float r = bcHash(cell + 7.0);
  float k = clamp((uMix * 1.3 - r) / 0.3, 0.0, 1.0);
  vec3 a = mix(texture(uA, bcUV(s, p.y, uAspA)).rgb, vec3(1.0), uWhiteA);
  vec3 b = mix(texture(uB, bcUV(s, p.y, uAspB)).rgb, vec3(1.0), uWhiteB);
  vec3 col = mix(a, b, k);
  float white = mix(uWhiteA, uWhiteB, k);
  col *= mix(1.9, 1.2, white);
  // the figure's edge, lit: it reads even on a dark piece
  col += vec3(0.55) * rim * (1.0 - white);
  col += vec3(0.9) * (1.0 - abs(k - 0.5) * 2.0) * step(0.001, uMix) * step(uMix, 0.999);
  // a glitched row splits its colours
  if (sh != 0.0) col = vec3(col.r * 1.4, col.g * 0.7, col.b * 1.3);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/** The monolith's silhouette (a plane over the slab's face; `flip` for the back face). */
export function silhouetteMaterial(u: ProjectionUniforms, mask: THREE.Texture, cell: number, flip: boolean) {
  return new THREE.ShaderMaterial({
    vertexShader: SIL_VERT,
    fragmentShader: SIL_FRAG,
    uniforms: { ...u, uMask: { value: mask }, uFlip: { value: flip ? 1 : 0 }, uCell: { value: cell } },
  });
}

const WIN_VERT = /* glsl */ `
attribute float aIdx;
attribute vec4 aOff;
varying vec2 vUv;
varying vec2 vArt;
varying float vIdx;
void main() {
  vUv = uv;
  vIdx = aIdx;
  // the art fills the figure's box ("cover" was done when the atlas was drawn)
  vec2 f = clamp((uv * ${GRID}.0 - vec2(${FIG.x0}.0, ${FIG.y0}.0)) / 20.0, 0.0, 1.0);
  vArt = aOff.xy + f * aOff.zw;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const WIN_FRAG = /* glsl */ `
uniform sampler2D uMask;
uniform sampler2D uArt;
uniform float uWake[N];
uniform float uOn;
uniform float uTime;
varying vec2 vUv;
varying vec2 vArt;
varying float vIdx;
${RIM}
void main() {
  vec2 cell = floor(vUv * ${GRID}.0);
  if (bcCell(cell) < 0.5) discard;
  float rim = bcRim(cell, fract(vUv * ${GRID}.0));
  int i = int(vIdx + 0.5);
  float w = uWake[i];
  vec3 col = texture(uArt, vArt).rgb;
  // asleep: dim, a little grey; awake: full, bright; the one on the monolith: a slow breath
  float on = 1.0 - step(0.5, abs(vIdx - uOn));
  float l = dot(col, vec3(0.3, 0.55, 0.15));
  col = mix(vec3(l) * 0.7 + col * 0.3, col, max(w, on));
  col *= 0.75 + 1.0 * w + on * (0.5 + 0.25 * sin(uTime * 2.4));
  col += vec3(0.4) * rim * (0.5 + w);
  // a scanline running down the awake one
  float scan = smoothstep(0.03, 0.0, abs(fract(vUv.y - uTime * 0.35) - 0.5) - 0.0);
  col += vec3(0.9) * scan * w * 0.25;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/** The small monoliths' windows: the same figure, each with its work (one atlas, one draw). */
export function windowMaterial(mask: THREE.Texture, art: THREE.Texture, n: number) {
  return new THREE.ShaderMaterial({
    vertexShader: WIN_VERT,
    fragmentShader: `#define N ${n}\n${WIN_FRAG}`,
    uniforms: {
      uMask: { value: mask },
      uArt: { value: art },
      uWake: { value: new Array(n).fill(0) },
      uOn: { value: -1 },
      uTime: { value: 0 },
    },
  });
}

/** Dust hanging in the projector's light (white, tinted by the work). */
export function haze(centre: THREE.Vector3, w: number, d: number, h: number, dot: THREE.Texture, touch: boolean) {
  const n = touch ? 500 : 1400;
  const pos = new Float32Array(n * 3);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rnd() - 0.5) * w;
    pos[i * 3 + 1] = 0.3 + rnd() ** 1.3 * h;
    pos[i * 3 + 2] = (rnd() - 0.5) * d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size: 0.06, map: dot, color: new THREE.Color(0.9, 0.9, 0.95), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.6, toneMapped: false });
  const pts = new THREE.Points(geo, mat);
  pts.position.copy(centre);
  pts.raycast = () => {};
  return {
    points: pts,
    update(t: number, color: THREE.Color, k: number) {
      pts.position.y = centre.y + Math.sin(t * 0.07) * 0.4;
      pts.position.x = centre.x + Math.sin(t * 0.05) * 0.6;
      mat.color.setRGB(0.55, 0.55, 0.6).lerp(color, 0.6 * k);
      mat.opacity = 0.45 + 0.35 * k;
    },
  };
}
