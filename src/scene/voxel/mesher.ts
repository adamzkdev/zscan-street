import * as THREE from "three";
import { palette, VOX, type Kind, type VoxelModel } from "./model";
import { voxelGlass, voxelSolid } from "./surface";
import { smoothPart } from "./smooth";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Size of one material step in a voxel normal's minor components: 2/127, exact in the worker's
 * signed-byte normals. The shader reads the class back and snaps the normal to its axis.
 */
export const MAT_NORMAL = 2 / 127;

/** Brightness per ambient-occlusion level (0 = corner fully enclosed). */
const AO = [0.52, 0.68, 0.84, 1];

interface Buf {
  pos: number[];
  nor: number[];
  col: number[];
  idx: number[];
}

/**
 * Greedy mesher with per-vertex ambient occlusion (0fps.net's method): faces merge into big quads
 * only when colour and all four corner AO values match, so walls collapse to a few quads while
 * every crease keeps its soft darkening.
 */
export function meshModel(m: VoxelModel) {
  const bufs: Record<Kind, Buf> = {
    solid: { pos: [], nor: [], col: [], idx: [] },
    glass: { pos: [], nor: [], col: [], idx: [] },
    emit: { pos: [], nor: [], col: [], idx: [] },
  };
  const dims = [m.w, m.h, m.d];
  const solid = (x: number, y: number, z: number) => m.get(x, y, z) !== 0;
  const kinds = palette.entries.map((e) => e.kind);
  // foliage is meshed smooth (smooth.ts): left out here, and it hides no face of its neighbours
  // (the smooth surface sits half a voxel inside, a culled wall behind it would show a hole)
  const soft = palette.entries.map((e) => !!e.soft);
  const hides = (x: number, y: number, z: number) => {
    const c = m.get(x, y, z);
    return c !== 0 && !soft[c];
  };

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3,
      v = (d + 2) % 3;
    const q = [0, 0, 0];
    q[d] = 1;
    const size = dims[u] * dims[v];
    const mask = new Int32Array(size);
    for (const back of [false, true]) {
      for (let s = 0; s < dims[d]; s++) {
        // build the face mask for this slice
        let n = 0;
        const x = [0, 0, 0];
        x[d] = s;
        for (x[v] = 0; x[v] < dims[v]; x[v]++)
          for (x[u] = 0; x[u] < dims[u]; x[u]++, n++) {
            const c = m.get(x[0], x[1], x[2]);
            const nx = x[0] + (back ? -q[0] : q[0]),
              ny = x[1] + (back ? -q[1] : q[1]),
              nz = x[2] + (back ? -q[2] : q[2]);
            if (!c || soft[c] || hides(nx, ny, nz)) {
              mask[n] = 0;
              continue;
            }
            // AO from the cells around the face, in the layer the face looks into
            const aoAt = (du: number, dv: number) => {
              const p = [nx, ny, nz];
              const a = [...p],
                b = [...p],
                cc = [...p];
              a[u] += du;
              b[v] += dv;
              cc[u] += du;
              cc[v] += dv;
              const s1 = solid(a[0], a[1], a[2]) ? 1 : 0,
                s2 = solid(b[0], b[1], b[2]) ? 1 : 0,
                sc = solid(cc[0], cc[1], cc[2]) ? 1 : 0;
              return s1 && s2 ? 0 : 3 - (s1 + s2 + sc);
            };
            const emit = kinds[c] === "emit";
            const a0 = emit ? 3 : aoAt(-1, -1),
              a1 = emit ? 3 : aoAt(1, -1),
              a2 = emit ? 3 : aoAt(1, 1),
              a3 = emit ? 3 : aoAt(-1, 1);
            mask[n] = c | (a0 << 12) | (a1 << 14) | (a2 << 16) | (a3 << 18) | (1 << 20);
          }
        // merge rectangles of equal mask values
        n = 0;
        for (let j = 0; j < dims[v]; j++)
          for (let i = 0; i < dims[u]; ) {
            const k = mask[n];
            if (!k) {
              i++;
              n++;
              continue;
            }
            let w = 1;
            while (i + w < dims[u] && mask[n + w] === k) w++;
            let h = 1;
            outer: for (; j + h < dims[v]; h++)
              for (let t = 0; t < w; t++)
                if (mask[n + t + h * dims[u]] !== k) break outer;
            emitQuad(bufs, d, u, v, s, i, j, w, h, back, k);
            for (let l = 0; l < h; l++) for (let t = 0; t < w; t++) mask[n + t + l * dims[u]] = 0;
            i += w;
            n += w;
          }
      }
    }
  }

  const out: Partial<Record<Kind, THREE.BufferGeometry>> = {};
  for (const kind of ["solid", "glass", "emit"] as Kind[]) {
    const b = bufs[kind];
    if (!b.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    // centre the footprint on the origin, bottom at y = 0
    g.translate((-m.w / 2) * VOX, 0, (-m.d / 2) * VOX);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    out[kind] = g;
  }
  const leaves = smoothPart(m, (c) => soft[c]);
  if (leaves) {
    leaves.computeBoundingSphere();
    leaves.computeBoundingBox();
    out.solid = out.solid ? mergeGeometries([out.solid, leaves], false) : leaves;
    out.solid.computeBoundingSphere();
    out.solid.computeBoundingBox();
  }
  return out;
}

function emitQuad(bufs: Record<Kind, Buf>, d: number, u: number, v: number, s: number, i: number, j: number, w: number, h: number, back: boolean, key: number) {
  const c = key & 0xfff;
  const entry = palette.entries[c];
  const b = bufs[entry.kind];
  const ao = [(key >> 12) & 3, (key >> 14) & 3, (key >> 16) & 3, (key >> 18) & 3];
  const plane = back ? s : s + 1;
  const corner = (du: number, dv: number) => {
    const p = [0, 0, 0];
    p[d] = plane * VOX;
    p[u] = (i + du) * VOX;
    p[v] = (j + dv) * VOX;
    return p;
  };
  const verts = [corner(0, 0), corner(w, 0), corner(w, h), corner(0, h)];
  // the voxel's material rides in the normal's two zero components (see MAT_NORMAL): no extra
  // attribute, so the worker's packing, the city cache and the batches stay as they are
  const normal = [0, 0, 0];
  normal[d] = back ? -1 : 1;
  normal[u] = normal[v] = entry.mat * MAT_NORMAL;
  const base = b.pos.length / 3;
  verts.forEach((p, k) => {
    b.pos.push(p[0], p[1], p[2]);
    b.nor.push(normal[0], normal[1], normal[2]);
    const f = AO[ao[k]];
    b.col.push(entry.color.r * f, entry.color.g * f, entry.color.b * f);
  });
  // flip the diagonal so AO interpolates without the classic anisotropy
  const tri = ao[0] + ao[2] < ao[1] + ao[3] ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
  // (u, v, d) is right-handed for every axis, so +d faces are counter-clockwise as built
  const order = back ? [tri[0], tri[2], tri[1], tri[3], tri[5], tri[4]] : tri;
  for (const k of order) b.idx.push(base + k);
}

// ---- materials ----------------------------------------------------------------------------------

export const MATERIALS = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.55 }),
  emit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};

/** `?detail=0`: the plain look (a kill switch, and a baseline for measuring). */
export const DETAIL_ON = typeof location === "undefined" || new URLSearchParams(location.search).get("detail") !== "0";
if (DETAIL_ON) {
  MATERIALS.solid.onBeforeCompile = voxelSolid;
  MATERIALS.glass.onBeforeCompile = voxelGlass;
}

/** Seconds, advanced by the decor each frame: drives the lit windows and the neon below. */
export const EMIT_TIME = { value: 0 };

/**
 * A power cut on the city's lights: (x, z) of the substation, the radius the dark has spread to
 * (metres) and how dark (0 lit … 1 out). Set by the game world on an empty block.
 */
export const BLACKOUT = { value: new THREE.Vector4(0, 0, 0, 0) };

/**
 * The city's lights live a little, on the GPU and at no cost: on the upper floors a window goes
 * dark now and then and another comes on (per window cell, every minute or two), and now and
 * again a neon stutters for a moment. Pale, warm lights are windows; saturated ones are signs,
 * which never go dark, only flicker.
 */
MATERIALS.emit.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = EMIT_TIME;
  sh.uniforms.uDark = BLACKOUT;
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vCityPos;")
    .replace(
      "#include <project_vertex>",
      "#include <project_vertex>\n#ifdef USE_BATCHING\nvCityPos = (modelMatrix * batchingMatrix * vec4(transformed, 1.0)).xyz;\n#else\nvCityPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif",
    );
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vCityPos;\nuniform float uTime;\nuniform vec4 uDark;\nfloat cityHash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }")
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      {
        // one cell per window bay, per floor
        vec3 cell = floor(vCityPos / vec3(1.35, 1.25, 1.35));
        float h = cityHash(cell);
        float hi = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
        float sat = hi > 0.0 ? (hi - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b))) / hi : 0.0;
        if (vCityPos.y > 3.4 && sat < 0.5) {
          float period = 50.0 + h * 90.0;
          float epoch = floor((uTime + h * 400.0) / period);
          float off = step(fract(h * 17.31 + epoch * 0.6180339), 0.16);
          diffuseColor.rgb *= mix(1.0, 0.1, off);
        }
        if (h > 0.97) {
          float burst = step(fract(uTime * 0.045 + h * 7.0), 0.035);
          float buzz = step(0.45, fract(sin(floor(uTime * 24.0) + h * 91.0) * 43758.5453));
          diffuseColor.rgb *= mix(1.0, 0.25 + 0.75 * buzz, burst);
        }
        if (uDark.w > 0.0) {
          // the cut spreads from the substation; a few emergency lights stay on, dim red
          float k = uDark.w * (1.0 - smoothstep(uDark.z - 8.0, uDark.z, length(vCityPos.xz - uDark.xy)));
          vec3 emergency = vec3(0.35, 0.02, 0.02) * step(0.985, h);
          diffuseColor.rgb = mix(diffuseColor.rgb, emergency, k * 0.96);
        }
      }`,
    );
};

/** A copy of a shared material (to fade or tint one building) that keeps its shader hooks. */
export function ownMaterial(kind: Kind) {
  const m = MATERIALS[kind].clone();
  m.onBeforeCompile = MATERIALS[kind].onBeforeCompile;
  return m;
}

/** A model as a group of up to three meshes (solid, glass, light). */
export function toObject(m: VoxelModel, opts: { shadows?: boolean; own?: boolean } = {}) {
  const geos = meshModel(m);
  const g = new THREE.Group();
  for (const [kind, geo] of Object.entries(geos) as [Kind, THREE.BufferGeometry][]) {
    const mat = opts.own ? ownMaterial(kind) : MATERIALS[kind];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = kind !== "emit" && opts.shadows !== false;
    mesh.receiveShadow = kind !== "emit";
    mesh.userData.kind = kind;
    g.add(mesh);
  }
  return g;
}
