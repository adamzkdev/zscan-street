import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LOOP } from "./layout";

/**
 * Static geometry gathered into one mesh per material: boxes, cylinders and the bowl's ribbons,
 * each painted with a vertex colour.
 */
export class Merge {
  private list: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4) {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    if (m) n.applyMatrix4(m);
    for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k);
    const c = new THREE.Color(color);
    const cnt = n.attributes.position.count;
    const arr = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) arr.set([c.r, c.g, c.b], i * 3);
    n.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    this.list.push(n);
    return this;
  }

  private mat(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
    this.e.set(rx, ry, rz, "YXZ");
    return this.m.compose(new THREE.Vector3(x, y, z), this.q.setFromEuler(this.e), new THREE.Vector3(1, 1, 1));
  }

  /** A box standing on y (its bottom), centred on x/z, turned by ry. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, ry = 0, rx = 0, rz = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), color, this.mat(x, y, z, ry, rx, rz));
  }

  /** A box between two points (beams, cables, bracing). */
  beam(a: THREE.Vector3, b: THREE.Vector3, t: number, color: THREE.ColorRepresentation, t2 = t) {
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(t, len, t2).translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return this.add(g, color, new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1)));
  }

  cyl(r: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 10, rx = 0, rz = 0, ry = 0) {
    return this.add(new THREE.CylinderGeometry(r, r, h, seg).translate(0, h / 2, 0), color, this.mat(x, y, z, ry, rx, rz));
  }

  /**
   * A band all round the bowl, from (d0, y0) to (d1, y1) in the stand's profile (d out from the
   * front of the stands). Normals face the pitch / the sky.
   */
  ribbon(d0: number, y0: number, d1: number, y1: number, color: THREE.ColorRepresentation, skip?: (x: number, z: number) => boolean) {
    this.list.push(ribbonGeo(d0, y0, d1, y1, color, skip));
    return this;
  }

  get size() {
    return this.list.length;
  }

  build(mat: THREE.Material) {
    const g = mergeGeometries(this.list, false)!;
    for (const l of this.list) l.dispose();
    this.list = [];
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

/** The ribbon itself; with `uv`, u runs along the loop in metres / uLen (for LED bands). */
export function ribbonGeo(d0: number, y0: number, d1: number, y1: number, color: THREE.ColorRepresentation | null, skip?: (x: number, z: number) => boolean, uLen = 0) {
  const pos: number[] = [],
    nor: number[] = [],
    col: number[] = [],
    uv: number[] = [];
  const c = new THREE.Color(color ?? "#ffffff");
  const pd = d1 - d0,
    py = y1 - y0;
  const pl = Math.hypot(pd, py) || 1;
  const kn = -py / pl,
    ku = pd / pl;
  let u = 0;
  for (let i = 1; i < LOOP.length; i++) {
    const a = LOOP[i - 1],
      b = LOOP[i];
    const P = (p: typeof a, d: number, y: number) => [p.x + p.nx * d, y, p.z + p.nz * d];
    const A0 = P(a, d0, y0),
      B0 = P(b, d0, y0),
      A1 = P(a, d1, y1),
      B1 = P(b, d1, y1);
    const seg = Math.hypot(B0[0] - A0[0], B0[2] - A0[2]);
    const mx = (A0[0] + B1[0]) / 2,
      mz = (A0[2] + B1[2]) / 2;
    if (skip?.(mx, mz)) {
      u += seg;
      continue;
    }
    const NA = [a.nx * kn, ku, a.nz * kn],
      NB = [b.nx * kn, ku, b.nz * kn];
    const u0 = uLen ? u / uLen : 0,
      u1 = uLen ? (u + seg) / uLen : 0;
    let quad: [number[], number[], number, number][] = [
      [A0, NA, u0, 0],
      [B0, NB, u1, 0],
      [B1, NB, u1, 1],
      [A0, NA, u0, 0],
      [B1, NB, u1, 1],
      [A1, NA, u0, 1],
    ];
    // the winding must agree with the normal, or lights hit the wrong side
    const e1 = [B0[0] - A0[0], B0[1] - A0[1], B0[2] - A0[2]],
      e2 = [B1[0] - A0[0], B1[1] - A0[1], B1[2] - A0[2]];
    const gn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (gn[0] * NA[0] + gn[1] * NA[1] + gn[2] * NA[2] < 0) quad = [quad[0], quad[2], quad[1], quad[3], quad[5], quad[4]];
    for (const [p, n, uu, vv] of quad) {
      pos.push(...p);
      nor.push(...n);
      col.push(c.r, c.g, c.b);
      uv.push(uu, vv);
    }
    u += seg;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  if (uLen) g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  else g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}
