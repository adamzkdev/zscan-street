import * as THREE from "three";
import type { Course } from "../course";
import type { CourseKit } from "../deckkit";

/**
 * A suspension bridge's hangers seen near and far (src/scene/isles/crossings): hundreds of cables a
 * hand thick are thinner than a pixel past a hundred metres, and drawn as geometry they break into a
 * shimmering dotted band. So each is drawn twice:
 *  - near (`hanger`): the real bars, let go (dithered) between NEAR and FAR metres from the camera;
 *  - far (`curtain`): one ribbon per cable plane from the deck to the cable, its texture a cable every
 *    `spacing` metres with hand-made mipmaps — crisp lines close up, a light even veil of the cables'
 *    colour once they are too fine to see one by one (no shimmer) — faded in over the same stretch.
 * The stays (Brooklyn's web) take the near material too: they go into the veil's haze far away.
 */

const NEAR = 55;
const FAR = 100;

const made = new Map<string, { hanger: THREE.MeshStandardMaterial; curtain: THREE.MeshStandardMaterial }>();

/** The cables' line texture: one cable (a pixel at the top level) per repeat, a veil in the small mips. */
function lineTexture() {
  const W = 64,
    H = 4;
  const levels: { data: Uint8Array; width: number; height: number }[] = [];
  for (let w = W, h = H, k = 0; ; w = Math.max(1, w >> 1), h = Math.max(1, h >> 1), k++) {
    const d = new Uint8Array(w * h * 4);
    // (the share of one texel the cable covers at this level; a veil once it is under a quarter)
    const cover = Math.min(1, 1.6 / (W / w));
    for (let x = 0; x < w; x++) {
      const on = x === 0;
      const veil = k >= 2 ? 0.1 + 0.03 * Math.min(4, k - 2) : 0;
      const a = on ? Math.max(cover, veil) : veil * 0.85;
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = Math.round(255 * Math.min(1, a));
      }
    }
    levels.push({ data: d, width: w, height: h });
    if (w === 1 && h === 1) break;
  }
  const t = new THREE.DataTexture(levels[0].data, W, H, THREE.RGBAFormat);
  t.mipmaps = levels as unknown as THREE.DataTexture["mipmaps"];
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  t.userData.shared = true;
  return t;
}
let lines: THREE.DataTexture | null = null;

/** The near and far materials for cables of paint `paint` (shared per paint). */
export function cableMats(paint: string, base: THREE.MeshStandardMaterial) {
  const had = made.get(paint);
  if (had) return had;
  const hanger = base.clone();
  hanger.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
      {
        float hgD = length(vViewPosition);
        float hgN = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        if (hgD > ${NEAR.toFixed(1)} + ${(FAR - NEAR).toFixed(1)} * hgN) discard;
      }`,
    );
  };
  hanger.customProgramCacheKey = () => "isle-hanger";
  hanger.userData.shared = true;
  lines ??= lineTexture();
  const curtain = new THREE.MeshStandardMaterial({ color: paint, map: lines, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.1 });
  curtain.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <alphamap_fragment>",
      `#include <alphamap_fragment>
      diffuseColor.a *= smoothstep(${NEAR.toFixed(1)}, ${FAR.toFixed(1)}, length(vViewPosition));`,
    );
  };
  curtain.customProgramCacheKey = () => "isle-curtain";
  curtain.userData.shared = true;
  const out = { hanger, curtain };
  made.set(paint, out);
  return out;
}

/**
 * The far cables' ribbon `off` metres off the centre line at its foot (`offTop` at the cable), from s0 to s1: from `foot`
 * metres over the road to the cable's height `top(s)` (world), its cables every `spacing` metres from
 * `first` (the texture's line on each). Added to the kit as `mat`.
 */
export function curtain(K: CourseKit, c: Course, mat: string, off: number, s0: number, s1: number, foot: number, top: (s: number) => number, spacing: number, first: number, skip?: (s: number) => boolean, offTop = off) {
  const pos: number[] = [],
    uv: number[] = [];
  const step = spacing / 2;
  for (let s = s0; s < s1 - 1e-6; s += step) {
    const q = Math.min(s1, s + step);
    const m = (s + q) / 2;
    if (skip?.(m)) continue;
    const ya = top(s),
      yb = top(q);
    if (ya < c.y(s) + foot + 0.5 || yb < c.y(q) + foot + 0.5) continue;
    const A = c.point(s, off, foot),
      B = c.point(q, off, foot),
      C = c.point(q, offTop, yb - c.y(q)),
      D = c.point(s, offTop, ya - c.y(s));
    // (u: the cables' count along — the line on each cable)
    const ua = (s - first) / spacing,
      ub = (q - first) / spacing;
    const P = [A, B, C, D],
      T = [
        [ua, 0],
        [ub, 0],
        [ub, 1],
        [ua, 1],
      ];
    for (const o of [0, 1, 2, 0, 2, 3]) pos.push(...P[o]), uv.push(...T[o]);
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  K.add(mat, g);
}
