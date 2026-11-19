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

/** A growing vertex buffer: typed arrays doubled as they fill (no per-quad arrays or closures). */
class Buf {
  pos = new Float32Array(3 * 1024);
  nor = new Float32Array(3 * 1024);
  col = new Float32Array(3 * 1024);
  idx = new Uint32Array(1536);
  /** Vertices and indices written. */
  nv = 0;
  ni = 0;
  /** Room for one more quad (4 vertices, 6 indices). */
  room() {
    if ((this.nv + 4) * 3 > this.pos.length) {
      const grow = (a: Float32Array) => {
        const b = new Float32Array(a.length * 2);
        b.set(a);
        return b;
      };
      this.pos = grow(this.pos);
      this.nor = grow(this.nor);
      this.col = grow(this.col);
    }
    if (this.ni + 6 > this.idx.length) {
      const b = new Uint32Array(this.idx.length * 2);
      b.set(this.idx);
      this.idx = b;
    }
  }
}

/**
 * Greedy mesher with per-vertex ambient occlusion (0fps.net's method): faces merge into big quads
 * only when colour and all four corner AO values match, so walls collapse to a few quads while
 * every crease keeps its soft darkening.
 */
export function meshModel(m: VoxelModel) {
  const bufs: Record<Kind, Buf> = { solid: new Buf(), glass: new Buf(), emit: new Buf() };
  const dims = [m.w, m.h, m.d];
  const kinds = palette.entries.map((e) => e.kind);
  // foliage is meshed smooth (smooth.ts): left out here, and it hides no face of its neighbours
  // (the smooth surface sits half a voxel inside, a culled wall behind it would show a hole)
  const soft = palette.entries.map((e) => !!e.soft);
  const isSoft = new Uint8Array(soft.length);
  const isEmit = new Uint8Array(soft.length);
  for (let c = 0; c < soft.length; c++) (isSoft[c] = soft[c] ? 1 : 0), (isEmit[c] = kinds[c] === "emit" ? 1 : 0);

  // the model with a border of empty cells all round: every neighbour a face or its AO looks at is
  // one index step away, never out of range (this loop is most of the city's boot)
  const W2 = m.w + 2,
    D2 = m.d + 2,
    H2 = m.h + 2;
  const P = new Uint16Array(W2 * D2 * H2);
  for (let y = 0; y < m.h; y++)
    for (let z = 0; z < m.d; z++) {
      const src = m.w * (z + m.d * y);
      P.set(m.data.subarray(src, src + m.w), 1 + W2 * (z + 1 + D2 * (y + 1)));
    }
  /** Index steps along x, y, z in the bordered model. */
  const step = [1, W2 * D2, W2];
  // which rows of the slices hold a face at all: a row of the slice d = s, along u, at v = j, is a
  // line of the model along u; most lines of a tower's box are air, and their rows are skipped
  // (keys s * dims[v] + j: lines along y by (x, z), along z by (y, x), along x by (z, y))
  const W = m.w,
    D = m.d,
    H = m.h;
  const lines = [new Uint8Array(W * D), new Uint8Array(H * W), new Uint8Array(D * H)];
  {
    const data = m.data;
    let at = 0;
    for (let y = 0; y < H; y++)
      for (let z = 0; z < D; z++)
        for (let x = 0; x < W; x++, at++) {
          const c = data[at];
          if (!c || isSoft[c]) continue;
          lines[0][x * D + z] = 1;
          lines[1][y * W + x] = 1;
          lines[2][z * H + y] = 1;
        }
  }

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3,
      v = (d + 2) % 3;
    const su = step[u],
      sv = step[v],
      sd = step[d];
    const du = dims[u],
      dv = dims[v];
    const size = du * dv;
    const mask = new Int32Array(size);
    const line = lines[d];
    for (const back of [false, true]) {
      const toward = back ? -sd : sd;
      for (let s = 0; s < dims[d]; s++) {
        // build the face mask for this slice
        let n = 0;
        // the cell (0, 0) of the slice, in the bordered model
        const origin = (1 + s) * sd + su + sv;
        for (let jv = 0; jv < dv; jv++) {
          if (!line[s * dv + jv]) {
            mask.fill(0, n, n + du);
            n += du;
            continue;
          }
          let at = origin + jv * sv;
          for (let iu = 0; iu < du; iu++, n++, at += su) {
            const c = P[at];
            if (!c || isSoft[c]) {
              mask[n] = 0;
              continue;
            }
            const nb = at + toward;
            const cn = P[nb];
            if (cn && !isSoft[cn]) {
              mask[n] = 0;
              continue;
            }
            if (isEmit[c]) {
              mask[n] = c | (3 << 12) | (3 << 14) | (3 << 16) | (3 << 18) | (1 << 20);
              continue;
            }
            // AO from the cells around the face, in the layer the face looks into
            const um = P[nb - su] ? 1 : 0,
              up = P[nb + su] ? 1 : 0,
              vm = P[nb - sv] ? 1 : 0,
              vp = P[nb + sv] ? 1 : 0;
            const a0 = um && vm ? 0 : 3 - (um + vm + (P[nb - su - sv] ? 1 : 0)),
              a1 = up && vm ? 0 : 3 - (up + vm + (P[nb + su - sv] ? 1 : 0)),
              a2 = up && vp ? 0 : 3 - (up + vp + (P[nb + su + sv] ? 1 : 0)),
              a3 = um && vp ? 0 : 3 - (um + vp + (P[nb - su + sv] ? 1 : 0));
            mask[n] = c | (a0 << 12) | (a1 << 14) | (a2 << 16) | (a3 << 18) | (1 << 20);
          }
        }
        // merge rectangles of equal mask values
        n = 0;
        for (let j = 0; j < dv; j++) {
          if (!line[s * dv + j]) {
            n += du;
            continue;
          }
          for (let i = 0; i < du; ) {
            const k = mask[n];
            if (!k) {
              i++;
              n++;
              continue;
            }
            let w = 1;
            while (i + w < du && mask[n + w] === k) w++;
            let h = 1;
            outer: for (; j + h < dv; h++)
              for (let t = 0; t < w; t++)
                if (mask[n + t + h * du] !== k) break outer;
            emitQuad(bufs, d, u, v, s, i, j, w, h, back, k);
            for (let l = 0; l < h; l++) for (let t = 0; t < w; t++) mask[n + t + l * du] = 0;
            i += w;
            n += w;
          }
        }
      }
    }
  }

  const out: Partial<Record<Kind, THREE.BufferGeometry>> = {};
  for (const kind of ["solid", "glass", "emit"] as Kind[]) {
    const b = bufs[kind];
    if (!b.ni) continue;
    const g = new THREE.BufferGeometry();
    // (copies of the filled part: the arrays go to the GPU and the city cache at their exact size)
    g.setAttribute("position", new THREE.BufferAttribute(b.pos.slice(0, b.nv * 3), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(b.nor.slice(0, b.nv * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(b.col.slice(0, b.nv * 3), 3));
    // 16-bit indices when they fit, as setIndex() picks them
    const idx = b.idx.subarray(0, b.ni);
    g.setIndex(new THREE.BufferAttribute(b.nv > 65535 ? idx.slice() : Uint16Array.from(idx), 1));
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
  b.room();
  const a0 = (key >> 12) & 3,
    a1 = (key >> 14) & 3,
    a2 = (key >> 16) & 3,
    a3 = (key >> 18) & 3;
  const plane = (back ? s : s + 1) * VOX;
  // the four corners (0,0) (w,0) (w,h) (0,h) in (u, v), each written into x, y, z by axis
  const u0 = i * VOX,
    u1 = (i + w) * VOX,
    v0 = j * VOX,
    v1 = (j + h) * VOX;
  const pos = b.pos,
    nor = b.nor,
    col = b.col;
  const base = b.nv;
  let o = base * 3;
  const corner = (cu: number, cv: number) => {
    pos[o + d] = plane;
    pos[o + u] = cu;
    pos[o + v] = cv;
    o += 3;
  };
  corner(u0, v0);
  corner(u1, v0);
  corner(u1, v1);
  corner(u0, v1);
  // the voxel's material rides in the normal's two zero components (see MAT_NORMAL): no extra
  // attribute, so the worker's packing, the city cache and the batches stay as they are
  const minor = entry.mat * MAT_NORMAL;
  const along = back ? -1 : 1;
  const { r, g, b: bl } = entry.color;
  o = base * 3;
  for (const a of [a0, a1, a2, a3]) {
    nor[o + d] = along;
    nor[o + u] = minor;
    nor[o + v] = minor;
    const f = AO[a];
    col[o] = r * f;
    col[o + 1] = g * f;
    col[o + 2] = bl * f;
    o += 3;
  }
  b.nv += 4;
  // flip the diagonal so AO interpolates without the classic anisotropy
  const flip = a0 + a2 < a1 + a3;
  const t0 = flip ? 1 : 0,
    t1 = flip ? 2 : 1,
    t2 = flip ? 3 : 2,
    t3 = flip ? 1 : 0,
    t4 = flip ? 3 : 2,
    t5 = flip ? 0 : 3;
  // (u, v, d) is right-handed for every axis, so +d faces are counter-clockwise as built
  const idx = b.idx;
  let n = b.ni;
  if (back) (idx[n++] = base + t0), (idx[n++] = base + t2), (idx[n++] = base + t1), (idx[n++] = base + t3), (idx[n++] = base + t5), (idx[n++] = base + t4);
  else (idx[n++] = base + t0), (idx[n++] = base + t1), (idx[n++] = base + t2), (idx[n++] = base + t3), (idx[n++] = base + t4), (idx[n++] = base + t5);
  b.ni = n;
}

// ---- materials ----------------------------------------------------------------------------------

export const MATERIALS = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 }),
  // glass: a reflection that reads, never a mirror of the bright sky (whole towers glared)
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.3, envMapIntensity: 0.7 }),
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

/**
 * The shared material of `kind` for instanced or batched meshes: a twin of MATERIALS[kind] sharing
 * its colour and its shader hooks (the same programs). One material drawn for plain, instanced and
 * batched meshes in the same frame is a different shader each time, and three.js looked its program
 * up again at every switch (several times a frame, each a few dozen parameters compared). (Only the
 * colour is ever changed on MATERIALS at run time, theme.ts: the twin shares that very object.)
 */
const twins = new Map<string, THREE.Material>();
export function sharedFor(kind: Kind, use: "instanced" | "batched") {
  const k = kind + use;
  let m = twins.get(k);
  if (!m) {
    const base = MATERIALS[kind] as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
    const c = base.clone();
    c.color = base.color;
    c.onBeforeCompile = base.onBeforeCompile;
    twins.set(k, (m = c));
  }
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
