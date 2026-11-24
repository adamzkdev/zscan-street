import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RealBatch } from "../scene/real/remesh";
import { REAL_MESH } from "../scene/voxel/mesher";
import { VOX, type VoxelModel } from "../scene/voxel/model";

/**
 * The places' own voxel batches made real (the realistic pass): a kit that merges many placed
 * voxel models per floor (its `Voxels`) hands them here while the place is built for real (the
 * same switch as `toObject`'s: REAL_MESH, `?inside=voxel` keeps the voxels). Its models go through
 * src/scene/real/remesh.ts (rounded parts in photographed materials, leaves as leaf cards), merged
 * per material for the floor; `add` still answers with the piece's box (the kits make colliders of it).
 */
export const realOn = () => REAL_MESH.on > 0 && !!REAL_MESH.mesh;

/** The model's filled cells' box, in the mesher's frame (centred on the footprint, on y = 0). */
export function voxBounds(m: VoxelModel) {
  let x0 = m.w,
    y0 = m.h,
    z0 = m.d,
    x1 = -1,
    y1 = -1,
    z1 = -1;
  const d = m.data;
  for (let y = 0, i = 0; y < m.h; y++)
    for (let z = 0; z < m.d; z++)
      for (let x = 0; x < m.w; x++, i++)
        if (d[i]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          if (z < z0) z0 = z;
          if (z > z1) z1 = z;
        }
  if (x1 < 0) return new THREE.Box3();
  return new THREE.Box3(new THREE.Vector3((x0 - m.w / 2) * VOX, y0 * VOX, (z0 - m.d / 2) * VOX), new THREE.Vector3((x1 + 1 - m.w / 2) * VOX, (y1 + 1) * VOX, (z1 + 1 - m.d / 2) * VOX));
}

/** A floor's real pieces, merged per material; keys are the kit's own (prefixed: kits reuse names). */
export class RealVoxels {
  private batch = new RealBatch();
  /** Per model: its cells' box, and its real twin if it has one (realfurn.ts), built once. */
  private static known = new Map<string, { bounds: THREE.Box3; twin: THREE.Object3D | null }>();
  private twins: THREE.Object3D[] = [];
  constructor(private prefix: string) {}
  add(key: string, make: () => VoxelModel, matrix: THREE.Matrix4) {
    const k = `${this.prefix}:${key}`;
    let e = RealVoxels.known.get(k);
    let made: VoxelModel | null = null;
    if (!e) {
      made = make();
      const realize = (made as VoxelModel & { realize?: () => THREE.Object3D }).realize;
      RealVoxels.known.set(k, (e = { bounds: voxBounds(made), twin: realize ? realize() : null }));
    }
    if (e.twin) {
      // (the twin is in metres for a model drawn at 12 a metre: the kit's matrix scales a 6-a-metre mesh)
      const o = e.twin.clone();
      o.applyMatrix4(matrix);
      o.scale.multiplyScalar(2);
      this.twins.push(o);
    } else this.batch.add(k, () => made ?? make(), matrix);
    return e.bounds.clone().applyMatrix4(matrix);
  }
  build(parent: THREE.Object3D) {
    this.batch.build(parent);
    for (const o of this.twins) parent.add(o);
    this.twins = [];
  }
}

const BRASS = new THREE.MeshStandardMaterial({ color: "#c9a227", metalness: 1, roughness: 0.28, envMapIntensity: 1.2 });
const VELVET = new THREE.MeshStandardMaterial({ color: "#9a1b2c", roughness: 0.85 });
for (const m of [BRASS, VELVET]) m.userData.shared = m.userData.noReal = true;

/**
 * A queue's brass stanchions and their velvet ropes (the realistic pass: round posts on weighted
 * bases, ropes that sag, instead of voxel blocks): posts at `points` (x, z, on y), ropes between
 * consecutive ones (not across a gap wider than `maxGap`). Two meshes, merged.
 */
export function stanchions(parent: THREE.Object3D, points: [number, number][], y = 0, o: { h?: number; maxGap?: number; rope?: THREE.ColorRepresentation } = {}) {
  const h = o.h ?? 0.96;
  const brass: THREE.BufferGeometry[] = [],
    rope: THREE.BufferGeometry[] = [];
  for (const [x, z] of points) {
    brass.push(new THREE.CylinderGeometry(0.17, 0.19, 0.035, 24).translate(x, y + 0.018, z));
    brass.push(new THREE.CylinderGeometry(0.06, 0.12, 0.05, 20).translate(x, y + 0.06, z));
    brass.push(new THREE.CylinderGeometry(0.024, 0.024, h - 0.08, 12).translate(x, y + 0.08 + (h - 0.08) / 2, z));
    brass.push(new THREE.SphereGeometry(0.045, 16, 10).translate(x, y + h, z));
  }
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1],
      [bx, bz] = points[i];
    const d = Math.hypot(bx - ax, bz - az);
    if (d > (o.maxGap ?? 3)) continue;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      pts.push(new THREE.Vector3(ax + (bx - ax) * t, y + h - 0.07 - Math.sin(t * Math.PI) * 0.14 * Math.min(1, d / 1.2), az + (bz - az) * t));
    }
    rope.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.018, 8, false));
  }
  const merge = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  if (brass.length) {
    const m = new THREE.Mesh(merge(brass)!, BRASS);
    m.castShadow = true;
    parent.add(m);
  }
  if (rope.length) {
    const m = new THREE.Mesh(merge(rope)!, o.rope ? Object.assign(VELVET.clone(), { color: new THREE.Color(o.rope) }) : VELVET);
    m.castShadow = true;
    parent.add(m);
  }
}
