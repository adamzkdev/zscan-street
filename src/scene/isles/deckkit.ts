import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Course } from "./course";

/**
 * Geometry along a crossing's course (src/scene/isles/course.ts): ribbons across the deck, swept
 * cross-sections (barriers, girders, a tunnel's tube), boxes set square to the course, bars between
 * two points — collected per material and merged, a mesh per material and per stretch of the course
 * (placed at its own centre: the draw-saver and the culling measure each mesh from its position).
 */

export type V3 = [number, number, number];

export class CourseKit {
  private parts = new Map<string, THREE.BufferGeometry[]>();
  constructor(readonly c: Course) {}

  add(mat: string, g: THREE.BufferGeometry) {
    const l = this.parts.get(mat);
    const gg = g.index ? g.toNonIndexed() : g;
    if (!gg.getAttribute("uv")) gg.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(gg.getAttribute("position").count * 2), 2));
    if (l) l.push(gg);
    else this.parts.set(mat, [gg]);
  }

  /**
   * A flat ribbon over the deck between the offsets a(s) and b(s) (a < b), `dy` over the road, from s0
   * to s1: UVs u along (s / uTile), v across (0 at a … 1 at b), or with `vAbs` [from, span] metres.
   */
  ribbon(mat: string, a: (s: number) => number, b: (s: number) => number, dy: number, s0: number, s1: number, uTile: number, step = 1, vAbs?: [number, number], down = false) {
    const pos: number[] = [],
      uv: number[] = [];
    const ss: number[] = [];
    for (let s = s0; s < s1; s += step) ss.push(s);
    ss.push(s1);
    const v = (off: number, d: number) => (vAbs ? (off - vAbs[0]) / vAbs[1] : d);
    for (let i = 0; i + 1 < ss.length; i++) {
      const p = ss[i],
        q = ss[i + 1];
      const A = this.c.point(p, a(p), dy),
        B = this.c.point(p, b(p), dy),
        C = this.c.point(q, b(q), dy),
        D = this.c.point(q, a(q), dy);
      const uvs = [
        [p / uTile, v(a(p), 0)],
        [p / uTile, v(b(p), 1)],
        [q / uTile, v(b(q), 1)],
        [q / uTile, v(a(q), 0)],
      ];
      const P = [A, B, C, D];
      // (+off is right of the way along: a b c wound to face up)
      for (const o of down ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) pos.push(...P[o]), uv.push(...uvs[o]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    this.add(mat, g);
  }

  /**
   * A cross-section swept along the course: `prof` [off, dy] points (a polyline across the deck, from
   * its offset `at(s)` sideways), from s0 to s1. UVs in metres (/2): along, and along the profile.
   * `flip`: the other winding (a mirrored profile).
   */
  sweep(mat: string, prof: [number, number][], at: (s: number) => number, s0: number, s1: number, step = 1, flip = false, mirror = 1) {
    const ss: number[] = [];
    for (let s = s0; s < s1; s += step) ss.push(s);
    ss.push(s1);
    const pos: number[] = [],
      uv: number[] = [];
    const vs = [0];
    for (let k = 1; k < prof.length; k++) vs.push(vs[k - 1] + Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]));
    for (let i = 0; i + 1 < ss.length; i++) {
      const p = ss[i],
        q = ss[i + 1];
      for (let k = 0; k + 1 < prof.length; k++) {
        const A = this.c.point(p, at(p) + mirror * prof[k][0], prof[k][1]),
          B = this.c.point(p, at(p) + mirror * prof[k + 1][0], prof[k + 1][1]),
          C = this.c.point(q, at(q) + mirror * prof[k + 1][0], prof[k + 1][1]),
          D = this.c.point(q, at(q) + mirror * prof[k][0], prof[k][1]);
        const uvs = [
          [p / 2, vs[k] / 2],
          [p / 2, vs[k + 1] / 2],
          [q / 2, vs[k + 1] / 2],
          [q / 2, vs[k] / 2],
        ];
        const P = [A, B, C, D];
        for (const o of flip !== mirror < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) pos.push(...P[o]), uv.push(...uvs[o]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    this.add(mat, g);
  }

  /** A box (w across, h up, d along) centred `off` metres off the centre line at s, its foot `y` (world height). */
  box(mat: string, w: number, h: number, d: number, s: number, off: number, y: number) {
    const p = this.c.at(s);
    const [x, , z] = this.c.point(s, off);
    const g = worldUv(new THREE.BoxGeometry(w, h, d), 2);
    // (its depth turned along the course, its width across)
    g.rotateY(Math.atan2(p.tx, p.tz));
    g.translate(x, y + h / 2, z);
    this.add(mat, g);
  }

  /** A box in world terms (centre, sizes along x, y, z). */
  wbox(mat: string, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
    this.add(mat, worldUv(new THREE.BoxGeometry(sx, sy, sz), 2).translate(cx, cy, cz));
  }

  /** A square bar of width w between two points. */
  bar(mat: string, a: V3, b: V3, w: number) {
    const va = new THREE.Vector3(...a),
      vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    if (len < 1e-4) return;
    const g = new THREE.BoxGeometry(w, len, w);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.applyQuaternion(q);
    g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    this.add(mat, worldUv(g, 2));
  }

  /** A round bar (a cable) through points, radius r. */
  tube(mat: string, pts: V3[], r: number, sides = 6) {
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    this.add(mat, new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), r, sides, false));
  }

  /** Meshes per material (`mats`), each of a stretch of `chunk` metres of the course (culled on its own). */
  build(mats: Record<string, THREE.Material>, name: string, o: { noShadow?: Set<string> } = {}): THREE.Group {
    const out = new THREE.Group();
    out.name = name;
    for (const [m, list] of this.parts) {
      const mat = mats[m];
      if (!mat) continue;
      // (by stretch: the geometries' centres binned along x and z every 120 m)
      const bins = new Map<string, THREE.BufferGeometry[]>();
      for (const g of list) {
        g.computeBoundingSphere();
        const c = g.boundingSphere!.center;
        const k = `${Math.floor(c.x / 120)},${Math.floor(c.z / 120)}`;
        const l = bins.get(k);
        if (l) l.push(g);
        else bins.set(k, [g]);
      }
      for (const gs of bins.values()) {
        const geo = mergeGeometries(gs, false);
        if (!geo) continue;
        geo.computeBoundingBox();
        const ctr = geo.boundingBox!.getCenter(new THREE.Vector3());
        geo.translate(-ctr.x, -ctr.y, -ctr.z);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(ctr);
        const lit = (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
        mesh.castShadow = !lit && !o.noShadow?.has(m);
        mesh.receiveShadow = !lit;
        mesh.name = `${name}:${m}`;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        out.add(mesh);
      }
    }
    this.parts.clear();
    return out;
  }
}

/** UVs from the world in metres (a box projection by the face's normal), / tile. */
export function worldUv(g: THREE.BufferGeometry, tile: number) {
  const p = g.getAttribute("position"),
    n = g.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i)),
      az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
