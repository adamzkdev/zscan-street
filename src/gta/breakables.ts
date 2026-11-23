import * as THREE from "three";
import { colorsOf, type Debris } from "./debris";

/**
 * Smashing things inside the places (src/gta): anything small enough to be a thing — a chair, a
 * lamp, a screen, a vase, a crate, a table with its legs — breaks into pieces when you hit it. A
 * thing is found as the small meshes touching each other (a table's top and its four legs go
 * together), never a wall, a floor, a stair or a lift. Its collision goes with it; walk out and
 * back in, the place is whole again.
 */

type Rect = [number, number, number, number];

interface Cand {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}

interface Broken {
  meshes: THREE.Mesh[];
  rects: { list: Rect[]; rect: Rect }[];
}

/** No bigger than this (m) on its longest side, and not paper thin. */
const BIG = 1.9;

export class Breakables {
  private cands = new WeakMap<THREE.Object3D, Cand[]>();
  private broken: Broken[] = [];

  constructor(private debris: Debris) {}

  /** The scene's small things (once per scene). */
  private list(scene: THREE.Object3D): Cand[] {
    let l = this.cands.get(scene);
    if (l) return l;
    l = [];
    scene.updateMatrixWorld(true);
    const skip = (o: THREE.Object3D) => {
      for (let a: THREE.Object3D | null = o; a; a = a.parent) {
        const n = (a.name || "").toLowerCase();
        if (a.userData.snarkRef || a.userData.snark || a.userData.noBreak || /lift|stair|elevator|escalator|door|exit|floor|wall|ceiling|sky|panorama/.test(n)) return true;
      }
      return false;
    };
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.BatchedMesh).isBatchedMesh || (o as unknown as THREE.Sprite).isSprite) return;
      if (!m.geometry?.attributes.position) return;
      const b = new THREE.Box3().setFromObject(m);
      const s = b.getSize(new THREE.Vector3());
      const top = Math.max(s.x, s.y, s.z);
      if (!(top > 0.08 && top < BIG) || s.x * s.z < 0.004) return;
      // (ceiling lights and things on high shelves stay)
      if (skip(o)) return;
      l!.push({ mesh: m, box: b });
    });
    this.cands.set(scene, l);
    return l;
  }

  /**
   * A hit at `at` (world, about chest height) going along `dir`: the nearest thing within reach
   * breaks. `walls`: the floor's collision rects (the thing's own are taken out). True if something broke.
   */
  hit(scene: THREE.Object3D, at: THREE.Vector3, dir: THREE.Vector3, floor: number, walls: Rect[][]): boolean {
    const L = this.list(scene);
    let best: Cand | null = null,
      bd = Infinity;
    for (const c of L) {
      if (!c.mesh.visible) continue;
      const b = c.box;
      // within a metre of the fist (on the box), from the floor up
      if (b.max.y < floor - 0.05 || b.min.y > floor + 2.4) continue;
      const d = b.distanceToPoint(at);
      if (d < 0.9 && d < bd) (bd = d), (best = c);
    }
    if (!best) return false;
    // the whole thing: the small meshes touching it, while it stays thing-sized
    const group: Cand[] = [best];
    const all = new THREE.Box3().copy(best.box);
    for (let grew = true; grew; ) {
      grew = false;
      for (const c of L) {
        if (!c.mesh.visible || group.includes(c)) continue;
        const near = c.box.clone().expandByScalar(0.03);
        if (!group.some((g) => near.intersectsBox(g.box))) continue;
        const next = all.clone().union(c.box);
        const s = next.getSize(new THREE.Vector3());
        if (Math.max(s.x, s.y, s.z) > BIG * 1.3) continue;
        group.push(c);
        all.copy(next);
        grew = true;
      }
    }
    const colors = group.flatMap((g) => colorsOf(g.mesh));
    for (const g of group) g.mesh.visible = false;
    // its collision goes with it
    const rects: Broken["rects"] = [];
    const out = all.clone().expandByScalar(0.15);
    for (const list of walls)
      for (let i = list.length - 1; i >= 0; i--) {
        const r = list[i];
        if (r[0] >= out.min.x && r[2] <= out.max.x && r[1] >= out.min.z && r[3] <= out.max.z) {
          rects.push({ list, rect: r });
          list.splice(i, 1);
        }
      }
    this.broken.push({ meshes: group.map((g) => g.mesh), rects });
    this.debris.into(scene);
    this.debris.burst(all, colors, dir.clone().multiplyScalar(5), Math.max(floor, all.min.y - 0.02));
    return true;
  }

  /** Out of the place: everything whole and in its place again. */
  restore() {
    for (const b of this.broken) {
      for (const m of b.meshes) m.visible = true;
      for (const r of b.rects) r.list.push(r.rect);
    }
    this.broken = [];
    this.debris.clear();
  }
}
