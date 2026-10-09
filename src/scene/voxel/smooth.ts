import * as THREE from "three";
import { palette, VOX, type VoxelModel } from "./model";

/**
 * Smooth surfaces for the soft parts of a model (leaves, hedges, lawns): naive surface nets over
 * the cells those voxels fill, relaxed twice, with smooth normals. A canopy reads as a rounded mass
 * of foliage instead of a stack of cubes; the architecture around it stays crisp (greedy mesher).
 * Colours come from the voxels around each vertex, shaded by how buried the vertex is.
 */
export function smoothPart(m: VoxelModel, inPart: (c: number) => boolean) {
  const W = m.w + 1,
    H = m.h + 1,
    D = m.d + 1;
  const at = (x: number, y: number, z: number) => {
    const c = m.get(x, y, z);
    return c && inPart(c) ? c : 0;
  };
  // one vertex per cell whose 8 corners (voxel centres) are mixed; cells run from -1 to w-1
  const vid = new Int32Array(W * H * D).fill(-1);
  const cell = (x: number, y: number, z: number) => x + 1 + W * (z + 1 + D * (y + 1));
  const pos: number[] = [];
  const col: number[] = [];
  const occ: number[] = [];
  for (let y = -1; y < m.h; y++)
    for (let z = -1; z < m.d; z++)
      for (let x = -1; x < m.w; x++) {
        let n = 0,
          r = 0,
          g = 0,
          b = 0,
          any = 0;
        for (let k = 0; k < 8; k++) {
          const c = at(x + (k & 1), y + ((k >> 1) & 1), z + ((k >> 2) & 1));
          if (c) {
            n++;
            const e = palette.entries[c].color;
            r += e.r;
            g += e.g;
            b += e.b;
          }
          if (m.get(x + (k & 1), y + ((k >> 1) & 1), z + ((k >> 2) & 1))) any++;
        }
        if (n === 0 || n === 8) continue;
        // the vertex: mean of the crossing points on the cell's 12 edges (midpoints, binary field)
        let sx = 0,
          sy = 0,
          sz = 0,
          e = 0;
        for (let a = 0; a < 8; a++)
          for (const bit of [1, 2, 4]) {
            if (a & bit) continue;
            const b2 = a | bit;
            const ca = !!at(x + (a & 1), y + ((a >> 1) & 1), z + ((a >> 2) & 1));
            const cb = !!at(x + (b2 & 1), y + ((b2 >> 1) & 1), z + ((b2 >> 2) & 1));
            if (ca === cb) continue;
            sx += ((a & 1) + (b2 & 1)) / 2;
            sy += (((a >> 1) & 1) + ((b2 >> 1) & 1)) / 2;
            sz += (((a >> 2) & 1) + ((b2 >> 2) & 1)) / 2;
            e++;
          }
        vid[cell(x, y, z)] = pos.length / 3;
        pos.push(x + 0.5 + sx / e, y + 0.5 + sy / e, z + 0.5 + sz / e);
        col.push(r / n, g / n, b / n);
        occ.push(any / 8);
      }
  if (!pos.length) return null;
  // quads: one per pair of neighbouring voxels where the part starts or ends
  const idx: number[] = [];
  const nbr: number[][] = Array.from({ length: pos.length / 3 }, () => []);
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, d],
      [d, a],
    ]) {
      nbr[p].push(q);
      nbr[q].push(p);
    }
  };
  for (let y = -1; y < m.h; y++)
    for (let z = -1; z < m.d; z++)
      for (let x = -1; x < m.w; x++) {
        const s0 = !!at(x, y, z);
        // +x
        if (s0 !== !!at(x + 1, y, z) && y >= 0 && z >= 0) quad(vid[cell(x, y - 1, z - 1)], vid[cell(x, y, z - 1)], vid[cell(x, y, z)], vid[cell(x, y - 1, z)], !s0);
        // +y
        if (s0 !== !!at(x, y + 1, z) && x >= 0 && z >= 0) quad(vid[cell(x - 1, y, z - 1)], vid[cell(x - 1, y, z)], vid[cell(x, y, z)], vid[cell(x, y, z - 1)], !s0);
        // +z
        if (s0 !== !!at(x, y, z + 1) && x >= 0 && y >= 0) quad(vid[cell(x - 1, y - 1, z)], vid[cell(x, y - 1, z)], vid[cell(x, y, z)], vid[cell(x - 1, y, z)], !s0);
      }
  if (!idx.length) return null;
  // relax: each vertex moves halfway to the mean of its neighbours, twice
  const p = Float32Array.from(pos);
  for (let it = 0; it < 2; it++) {
    const q = p.slice();
    for (let i = 0; i < nbr.length; i++) {
      const ns = nbr[i];
      if (!ns.length) continue;
      let ax = 0,
        ay = 0,
        az = 0;
      for (const j of ns) (ax += q[j * 3]), (ay += q[j * 3 + 1]), (az += q[j * 3 + 2]);
      p[i * 3] = q[i * 3] * 0.5 + (ax / ns.length) * 0.5;
      p[i * 3 + 1] = q[i * 3 + 1] * 0.5 + (ay / ns.length) * 0.5;
      p[i * 3 + 2] = q[i * 3 + 2] * 0.5 + (az / ns.length) * 0.5;
    }
  }
  // the model's frame: voxel units to metres, footprint centred, bottom at 0
  for (let i = 0; i < p.length; i += 3) {
    p[i] = (p[i] - m.w / 2) * VOX;
    p[i + 1] = p[i + 1] * VOX;
    p[i + 2] = (p[i + 2] - m.d / 2) * VOX;
  }
  // buried vertices (inside a crown, against a wall) darker
  const c = new Float32Array(col.length);
  for (let i = 0; i < occ.length; i++) {
    const k = 1 - Math.max(0, Math.min(1, (occ[i] - 0.45) * 1.6)) * 0.45;
    c[i * 3] = col[i * 3] * k;
    c[i * 3 + 1] = col[i * 3 + 1] * k;
    c[i * 3 + 2] = col[i * 3 + 2] * k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // a smooth normal must never pass for a voxel face's (an axis plus two equal minors carrying the
  // material class, see MAT_NORMAL): push such a normal's minors a few byte steps apart
  const n = g.getAttribute("normal") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i);
    const a = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)];
    const mj = Math.max(...a);
    const order = [0, 1, 2].sort((p, q) => a[q] - a[p]);
    const mid = a[order[1]],
      lo = a[order[2]];
    if (mj > 0.8 && mid < mj * 0.16 && mid - lo < 0.05) {
      const k = order[2];
      const comp = (["x", "y", "z"] as const)[k];
      v[comp] = (v[comp] < 0 ? -1 : 1) * Math.max(0, lo - 0.06);
      const k2 = (["x", "y", "z"] as const)[order[1]];
      v[k2] = (v[k2] < 0 ? -1 : 1) * (mid + 0.02);
      v.normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return g;
}
