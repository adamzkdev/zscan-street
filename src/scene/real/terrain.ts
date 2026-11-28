import * as THREE from "three";
import { maps } from "./tex";

/**
 * Natural ground, realistic (branch gta-real): a smooth heightfield's material that paints itself
 * from three photographed sets — grass on the green, earth on the brown and gold, rock on the cliffs
 * and the grey — blended per pixel by the vertex colour (the terrain's own paint: duff, moss,
 * clover, golden grass, trail, wet stone) and by the slope (steep faces turn to rock, projected on
 * the cliff's own face so it never smears). The vertex colour keeps the hue; the photographs bring
 * the grain, the relief (their normal maps) and the roughness. One shared material.
 */

const VERT_HEAD = /* glsl */ `
varying vec3 vNW;
varying vec3 vNN;
`;
const VERT_BODY = /* glsl */ `
{
  vec4 nw = vec4(transformed, 1.0);
  vec3 nn = objectNormal;
  #ifdef USE_INSTANCING
  nw = instanceMatrix * nw;
  nn = mat3(instanceMatrix) * nn;
  #endif
  vNW = (modelMatrix * nw).xyz;
  vNN = normalize(mat3(modelMatrix) * nn);
}
`;
const FRAG_HEAD = /* glsl */ `
varying vec3 vNW;
varying vec3 vNN;
uniform sampler2D uTGc, uTGn, uTGr, uTSc, uTSn, uTSr, uTRc, uTRn, uTRr;
uniform vec3 uTMean[3];
float ntW[3];
vec2 ntTop, ntSide;
vec3 ntT, ntB, ntN, ntST, ntSB;
float ntHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float ntNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ntHash(i), ntHash(i + vec2(1.0, 0.0)), f.x), mix(ntHash(i + vec2(0.0, 1.0)), ntHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;
const FRAG_COLOR = /* glsl */ `
{
  vec3 n = normalize(vNN);
  ntN = n;
  // the top projection (grass, earth), and the cliff's own face for the rock
  ntTop = vec2(vNW.x, -vNW.z);
  ntT = vec3(1.0, 0.0, 0.0);
  ntB = vec3(0.0, 0.0, -1.0);
  if (abs(n.x) > abs(n.z)) {
    float s = sign(n.x);
    ntSide = vec2(-vNW.z * s, vNW.y);
    ntST = vec3(0.0, 0.0, -s);
  } else {
    float s = sign(n.z);
    ntSide = vec2(vNW.x * s, vNW.y);
    ntST = vec3(s, 0.0, 0.0);
  }
  ntSB = vec3(0.0, 1.0, 0.0);
  vec3 vc = diffuseColor.rgb;
  float lum = dot(vc, vec3(0.299, 0.587, 0.114));
  float sat = max(vc.r, max(vc.g, vc.b)) - min(vc.r, min(vc.g, vc.b));
  // steep, or grey: rock; green: grass; the rest: earth (duff, trails, golden grass)
  float steep = smoothstep(0.42, 0.7, 1.0 - n.y);
  float grey = (1.0 - smoothstep(0.03, 0.09, sat)) * smoothstep(0.02, 0.06, lum);
  float rock = clamp(max(steep, grey), 0.0, 1.0);
  float grass = clamp((vc.g - vc.r) * 9.0 + 0.15, 0.0, 1.0) * (1.0 - rock);
  float soil = max(0.0, 1.0 - rock - grass);
  // (a little noise in the blend: no clean contour lines between grass and earth)
  float wob = (ntNoise(vNW.xz * 0.7) - 0.5) * 0.5;
  grass = clamp(grass + wob * (1.0 - rock), 0.0, 1.0);
  soil = max(0.0, 1.0 - rock - grass);
  ntW[0] = grass;
  ntW[1] = soil;
  ntW[2] = rock;
  vec3 g = texture2D(uTGc, ntTop / 3.0).rgb / uTMean[0];
  vec3 e = texture2D(uTSc, ntTop / 2.5).rgb / uTMean[1];
  vec3 r = texture2D(uTRc, ntSide / 4.0).rgb / uTMean[2];
  // the rock keeps more of its own photograph (its veins, its lichen), the rest the paint's hue
  vec3 col = vc * (g * grass + e * soil) + mix(vc * r, texture2D(uTRc, ntSide / 4.0).rgb * (0.55 + lum), 0.45) * rock;
  // big slow patches: the ground is never one even colour
  col *= 0.86 + 0.28 * ntNoise(vNW.xz * 0.06 + 3.1);
  diffuseColor.rgb = clamp(col, 0.0, 2.0);
}
`;
const FRAG_ROUGH = /* glsl */ `
{
  float rg = texture2D(uTGr, ntTop / 3.0).r;
  float rs = texture2D(uTSr, ntTop / 2.5).r;
  float rr = texture2D(uTRr, ntSide / 4.0).r;
  roughnessFactor = clamp(rg * ntW[0] + rs * ntW[1] + rr * ntW[2], 0.35, 1.0);
}
`;
const FRAG_NORMAL = /* glsl */ `
{
  vec3 ng = texture2D(uTGn, ntTop / 3.0).xyz * 2.0 - 1.0;
  vec3 ns = texture2D(uTSn, ntTop / 2.5).xyz * 2.0 - 1.0;
  vec3 nr = texture2D(uTRn, ntSide / 4.0).xyz * 2.0 - 1.0;
  vec3 top = normalize(ntT * (ng.x * ntW[0] + ns.x * ntW[1]) + ntB * (ng.y * ntW[0] + ns.y * ntW[1]) + ntN * max(0.2, ng.z * ntW[0] + ns.z * ntW[1]));
  vec3 side = normalize(ntST * nr.x * 1.3 + ntSB * nr.y * 1.3 + ntN * nr.z);
  vec3 wn = normalize(mix(top, side, ntW[2]));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}
`;

/** Each photograph's average colour (linear): its detail is the photo over its mean. */
const MEAN: [number, number, number][] = [
  [0.16, 0.22, 0.08],
  [0.5, 0.42, 0.3],
  [0.32, 0.31, 0.29],
];

let mat: THREE.MeshStandardMaterial | null = null;
/** The natural ground's material (vertex colours carry the paint). */
export function natureMat() {
  if (mat) return mat;
  const g = maps("Grass004"),
    s = maps("Ground054"),
    r = maps("Rock030");
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const u = {
    uTGc: { value: g.map },
    uTGn: { value: g.normalMap },
    uTGr: { value: g.roughnessMap },
    uTSc: { value: s.map },
    uTSn: { value: s.normalMap },
    uTSr: { value: s.roughnessMap },
    uTRc: { value: r.map },
    uTRn: { value: r.normalMap },
    uTRr: { value: r.roughnessMap },
    uTMean: { value: MEAN.map((c) => new THREE.Vector3(...c)) },
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
  m.customProgramCacheKey = () => "real-nature";
  m.userData.shared = true;
  mat = m;
  return m;
}

/**
 * A smooth heightfield over [x0, x1] × [z0, z1] every `step` metres: `height` gives the ground,
 * `paint` its colour (written into `c`), `keep` which vertices belong (a triangle is drawn when its
 * three corners do). Skirts drop the outer edges where the ground stands above `skirtTo` (the
 * board's edge, cut like the rest of the diorama, in the same rock). Indexed, smooth normals.
 */
export function heightfield(o: {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  step: number;
  height: (x: number, z: number) => number;
  paint: (c: THREE.Color, x: number, z: number, h: number, slope: number) => void;
  keep: (x: number, z: number, h: number) => boolean;
  skirtTo?: number;
  /** Edges of the board to drop a skirt from (the others meet other ground). */
  skirts?: { x0?: boolean; x1?: boolean; z0?: boolean; z1?: boolean };
  /** Where the skirt must stop higher than `skirtTo` (over a tunnel: its roof), the lowest it goes at (x, z). */
  skirtFloor?: (x: number, z: number) => number;
}) {
  const nx = Math.round((o.x1 - o.x0) / o.step) + 1,
    nz = Math.round((o.z1 - o.z0) / o.step) + 1;
  const H = new Float32Array(nx * nz);
  const K = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = o.x0 + i * o.step,
        z = o.z0 + j * o.step;
      const h = o.height(x, z);
      H[i + j * nx] = h;
      K[i + j * nx] = o.keep(x, z, h) ? 1 : 0;
    }
  const idxOf = new Int32Array(nx * nz).fill(-1);
  const pos: number[] = [],
    col: number[] = [],
    idx: number[] = [];
  const c = new THREE.Color();
  const hAt = (i: number, j: number) => H[Math.max(0, Math.min(nx - 1, i)) + Math.max(0, Math.min(nz - 1, j)) * nx];
  const vert = (i: number, j: number) => {
    const k = i + j * nx;
    if (idxOf[k] >= 0) return idxOf[k];
    const x = o.x0 + i * o.step,
      z = o.z0 + j * o.step,
      h = H[k];
    const slope = Math.hypot(hAt(i + 1, j) - hAt(i - 1, j), hAt(i, j + 1) - hAt(i, j - 1)) / (2 * o.step);
    o.paint(c, x, z, h, slope);
    pos.push(x, h, z);
    col.push(c.r, c.g, c.b);
    return (idxOf[k] = pos.length / 3 - 1);
  };
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = i + j * nx,
        b = a + 1,
        d = a + nx,
        e = d + 1;
      // (the diagonal along the gentler slope: fewer folds on the ridges)
      const flip = Math.abs(H[a] - H[e]) > Math.abs(H[b] - H[d]);
      const tris = flip
        ? [
            [a, d, b],
            [b, d, e],
          ]
        : [
            [a, d, e],
            [a, e, b],
          ];
      for (const t of tris) {
        if (!K[t[0]] || !K[t[1]] || !K[t[2]]) continue;
        idx.push(...t.map((k) => vert(k % nx, Math.floor(k / nx))));
      }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const parts = [geo];
  // the skirts: a cliff face down from each kept vertex on a chosen outer edge
  if (o.skirtTo !== undefined && o.skirts) {
    const sp: number[] = [],
      sc: number[] = [],
      sn: number[] = [];
    const rock = new THREE.Color("#5e5a60");
    const edge = (list: [number, number][], nrm: [number, number, number]) => {
      for (let k = 1; k < list.length; k++) {
        const [i0, j0] = list[k - 1],
          [i1, j1] = list[k];
        const ka = i0 + j0 * nx,
          kb = i1 + j1 * nx;
        if (!K[ka] || !K[kb]) continue;
        const ha = H[ka],
          hb = H[kb];
        const xa = o.x0 + i0 * o.step,
          za = o.z0 + j0 * o.step,
          xb = o.x0 + i1 * o.step,
          zb = o.z0 + j1 * o.step;
        const ba = Math.max(o.skirtTo!, o.skirtFloor?.(xa, za) ?? -Infinity),
          bb = Math.max(o.skirtTo!, o.skirtFloor?.(xb, zb) ?? -Infinity);
        if (ha <= ba && hb <= bb) continue;
        const quad = [
          [xa, ha, za],
          [xb, hb, zb],
          [xb, Math.min(bb, hb), zb],
          [xa, Math.min(ba, ha), za],
        ];
        for (const q of [0, 2, 1, 0, 3, 2]) {
          sp.push(...quad[q]);
          sc.push(rock.r, rock.g, rock.b);
          sn.push(...nrm);
        }
      }
    };
    const s = o.skirts;
    if (s.x1) edge(Array.from({ length: nz }, (_, j) => [nx - 1, j] as [number, number]), [1, 0, 0]);
    if (s.x0) edge(Array.from({ length: nz }, (_, j) => [0, nz - 1 - j] as [number, number]), [-1, 0, 0]);
    if (s.z1) edge(Array.from({ length: nx }, (_, i) => [nx - 1 - i, nz - 1] as [number, number]), [0, 0, 1]);
    if (s.z0) edge(Array.from({ length: nx }, (_, i) => [i, 0] as [number, number]), [0, 0, -1]);
    // (each triangle wound to face its edge's way out)
    for (let k = 0; k < sp.length; k += 9) {
      const ax = sp[k], ay = sp[k + 1], az = sp[k + 2];
      const ux = sp[k + 3] - ax, uy = sp[k + 4] - ay, uz = sp[k + 5] - az;
      const vx = sp[k + 6] - ax, vy = sp[k + 7] - ay, vz = sp[k + 8] - az;
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * sn[k] + cy * sn[k + 1] + cz * sn[k + 2] < 0) for (let q = 0; q < 3; q++) [sp[k + 3 + q], sp[k + 6 + q]] = [sp[k + 6 + q], sp[k + 3 + q]];
    }
    if (sp.length) {
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
      g2.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3));
      g2.setAttribute("normal", new THREE.Float32BufferAttribute(sn, 3));
      parts.push(g2);
    }
  }
  return parts;
}
