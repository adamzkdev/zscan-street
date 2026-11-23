import * as THREE from "three";
import { faces } from "./faces";
import { headMatrix, humanMaterials, JOINTS, newAct, NPARTS, partBox, partColor, partMatrix, pose, stride, type Act } from "./human";

/**
 * The street's people in 3D (src/gta): round you, every zkSNARK on the pavements (the game's own
 * passers-by first, then the street's residents and its crowd's walkers) is drawn as a person
 * (human.ts) — its head in voxels from its own picture, a body of human build that walks, runs,
 * fights, falls and gets up — and its flat figure is hidden. All of them in two draws: the heads in
 * one BatchedMesh (one geometry per zkSNARK, kept while it is about), every body part of everyone
 * in one InstancedMesh. Farther off, the flat figures carry on as they were.
 */

export interface Person3 {
  /** Who it is in the street's own terms (stable while it is about). */
  key: string;
  /** The game's own passers-by: they have no flat figure to fall back on, so they come first. */
  own?: boolean;
  /** The zkSNARK. */
  id: number;
  /** Where its feet are now. */
  pos(out: THREE.Vector3): THREE.Vector3;
  /** How far over it is (0 standing, 1 flat) and to which side (0: on its back). */
  down(): { k: number; side: number };
  /** A way it stands facing when still (world, flat), or null. */
  face(): THREE.Vector3 | null;
  /** Seated: the seat's height over its feet, else 0. */
  seat?(): number;
  /** A gesture now: talking with its hands, waving, both arms up, a phone at its ear. */
  pose?(): Act["gesture"];
  /** Its fight and its looks, written into the pose's state (the game's own passers-by). */
  act?(a: Act): void;
  /** Its heading, if it has one of its own (else from where it goes). */
  heading?(): number | null;
  /** Its flat figure hidden (true) or shown. */
  hide(on: boolean): void;
  /** Still in the street (not gone, not on a bus). */
  alive(): boolean;
}

interface Slot {
  p: Person3;
  /** Its parts' first instance (NPARTS from there). */
  inst: number;
  head: number;
  id: number;
  heading: number;
  last: THREE.Vector3;
  act: Act;
  /** Stepping round you (drawn aside, the walk itself unchanged). */
  aside: THREE.Vector3;
}

export class People3D {
  readonly group = new THREE.Group();
  private heads: THREE.BatchedMesh;
  private parts: THREE.InstancedMesh;
  private slots = new Map<string, Slot>();
  /** Head geometries in the batch, by zkSNARK: its id there, how many wear it, when last used. */
  private geos = new Map<number, { geo: number; users: number; used: number }>();
  private free: number[] = [];
  private scanT = 0;
  private readonly max: number;
  private readonly radius: number;
  private joints = Array.from({ length: JOINTS }, () => new THREE.Matrix4());
  private root = new THREE.Matrix4();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  enabled = true;
  /** How many are drawn in 3D now: the most, or fewer while the frame rate suffers (it climbs back). */
  limit: number;
  private frameAvg = 1 / 60;
  private judgeT = 0;

  /** Where the people come from instead (inside a place), or null: the street's. */
  source: ((x: number, z: number, r: number) => Person3[]) | null = null;

  constructor(
    scene: THREE.Scene,
    private find: (x: number, z: number, r: number) => Person3[],
  ) {
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    this.max = coarse ? 44 : 112;
    this.radius = coarse ? 32 : 46;
    this.limit = this.max;
    const mats = humanMaterials();
    this.heads = new THREE.BatchedMesh(this.max, 300_000, 0, mats.head);
    this.heads.castShadow = true;
    this.heads.frustumCulled = false;
    this.heads.perObjectFrustumCulled = false;
    this.parts = new THREE.InstancedMesh(partBox(), mats.part, this.max * NPARTS);
    this.parts.castShadow = true;
    this.parts.frustumCulled = false;
    this.parts.count = 0;
    this.parts.setColorAt(0, this.c.set(0xffffff));
    this.group.add(this.heads, this.parts);
    this.group.name = "gta:people3d";
    this.group.visible = false;
    scene.add(this.group);
    for (let i = this.max - 1; i >= 0; i--) this.free.push(i);
  }

  show(on: boolean) {
    this.group.visible = on;
    if (!on) this.clear();
  }

  /** Everyone back to their flat figures (a change of scene). */
  clear() {
    for (const s of [...this.slots.values()]) this.drop(s);
  }

  /** Into the scene being drawn (the street, a place). */
  into(scene: THREE.Object3D) {
    if (this.group.parent === scene) return;
    this.clear();
    scene.add(this.group);
  }

  /** Each frame, round (x, z). */
  update(dt: number, x: number, z: number, me: THREE.Vector3 | null = null, eye: THREE.Vector3 | null = null) {
    this.eye = eye;
    if (!this.group.visible || !this.enabled) return;
    // the frame rate decides how many: under ~45 fps a few go back to flat, over ~57 a few come in
    this.frameAvg += (dt - this.frameAvg) * 0.05;
    this.judgeT += dt;
    if (this.judgeT > 3) {
      this.judgeT = 0;
      if (this.frameAvg > 1 / 45) this.limit = Math.max(Math.round(this.max * 0.4), this.limit - 12);
      else if (this.frameAvg < 1 / 57) this.limit = Math.min(this.max, this.limit + 6);
    }
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.25;
      this.scan(x, z);
    }
    this.me = me;
    this.pose(dt);
  }
  private me: THREE.Vector3 | null = null;
  private eye: THREE.Vector3 | null = null;

  /** Who is near now: the nearest come in, those gone or far go back to their flat figures. */
  private scan(x: number, z: number) {
    const list = (this.source ?? this.find)(x, z, this.radius + 4);
    const d = (p: Person3) => {
      p.pos(this.tmp);
      return (this.tmp.x - x) ** 2 + (this.tmp.z - z) ** 2;
    };
    const ranked = list.map((p) => ({ p, d: d(p) - (p.own ? 1e6 : 0) })).sort((a, b) => a.d - b.d);
    const keep = new Set<string>();
    for (const { p, d: dd } of ranked) {
      if (keep.size >= this.limit) break;
      const held = this.slots.has(p.key);
      // (a little farther for those already in: no flicker at the edge)
      if (!p.own && dd > (this.radius + (held ? 4 : 0)) ** 2) continue;
      keep.add(p.key);
    }
    for (const s of [...this.slots.values()]) if (!keep.has(s.p.key) || !s.p.alive()) this.drop(s);
    const asked: number[] = [],
      quick: number[] = [];
    for (const { p } of ranked) {
      if (!keep.has(p.key) || this.slots.has(p.key) || !p.alive()) continue;
      let g = this.geos.get(p.id);
      if (!g) {
        const look = faces.look(p.id);
        if (!look) {
          (p.own ? asked : quick).push(p.id);
          continue;
        }
        // (its picture could not be read: it stays flat, unless it has no flat figure)
        if (!look.real && !p.own) continue;
        try {
          g = { geo: this.add(look.head), users: 0, used: 0 };
          this.geos.set(p.id, g);
        } catch (e) {
          console.warn("gta: people3d is full", e);
          continue;
        }
      }
      const inst = this.free.pop();
      if (inst === undefined) break;
      const head = this.heads.addInstance(g.geo);
      g.users++;
      g.used = performance.now();
      p.hide(true);
      const at = p.pos(new THREE.Vector3());
      const look = faces.lookNow(p.id);
      const sl: Slot = { p, inst, head, id: p.id, heading: p.heading?.() ?? Math.random() * Math.PI * 2, last: at, act: newAct(), aside: new THREE.Vector3() };
      this.slots.set(p.key, sl);
      for (let k = 0; k < NPARTS; k++) this.parts.setColorAt(inst * NPARTS + k, this.c.setHex(partColor(look, k), THREE.SRGBColorSpace));
      if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
    }
    if (asked.length) faces.want(asked);
    if (quick.length) faces.quick(quick);
    this.trim();
  }

  private add(geo: THREE.BufferGeometry) {
    const n = geo.getAttribute("position").count;
    try {
      return this.heads.addGeometry(geo);
    } catch {
      // more room (half as much again)
      const b = this.heads as unknown as { _maxVertexCount: number };
      this.heads.setGeometrySize(Math.ceil(b._maxVertexCount * 1.5) + n, 0);
      return this.heads.addGeometry(geo);
    }
  }

  /** The heads nobody wears, beyond a few dozen, out of the batch. */
  private trim() {
    if (this.geos.size <= this.max + 16) return;
    const idle = [...this.geos.entries()].filter(([, g]) => g.users === 0).sort((a, b) => a[1].used - b[1].used);
    for (const [id, g] of idle) {
      if (this.geos.size <= this.max + 8) break;
      this.heads.deleteGeometry(g.geo);
      this.geos.delete(id);
    }
  }

  private drop(s: Slot) {
    this.slots.delete(s.p.key);
    this.heads.deleteInstance(s.head);
    for (let k = 0; k < NPARTS; k++) this.parts.setMatrixAt(s.inst * NPARTS + k, this.zero);
    this.free.push(s.inst);
    const g = this.geos.get(s.id);
    if (g) g.users--;
    s.p.hide(false);
  }

  /** Every body a step on: its place, its heading (from where it went, or its own), its pose. */
  private pose(dt: number) {
    let top = 0;
    for (const sl of this.slots.values()) {
      const at = sl.p.pos(this.tmp);
      const dx = at.x - sl.last.x,
        dz = at.z - sl.last.z;
      const step = Math.hypot(dx, dz);
      const sp = dt > 0 ? step / dt : 0;
      const a = sl.act;
      stride(a, dt, sp > 9 ? 0 : sp);
      const own = sl.p.heading?.();
      if (own !== null && own !== undefined) {
        let dh = own - sl.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        sl.heading += dh * Math.min(1, dt * 12);
      } else if (step > 0.004 && step < 1.5) {
        let dh = Math.atan2(dx, dz) - sl.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        sl.heading += dh * Math.min(1, dt * 10);
      } else if (a.speed < 0.2) {
        const f = sl.p.face();
        if (f) {
          let dh = Math.atan2(f.x, f.z) - sl.heading;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          sl.heading += dh * Math.min(1, dt * 4);
        }
      }
      sl.last.copy(at);
      // you are in the way: it steps round you (drawn aside; the crowd's own loop carries on)
      const want = this.tmp2.set(0, 0, 0);
      let look = 0;
      if (this.me) {
        const ox = at.x - this.me.x,
          oz = at.z - this.me.z;
        const d = Math.hypot(ox, oz);
        if (d < 1.1 && !sl.p.own) {
          const push = (1.1 - d) * 1.1;
          if (d > 1e-3) want.set((ox / d) * push, 0, (oz / d) * push);
          else want.set(push, 0, 0);
        }
        // close by: it looks at you
        if (d < 5 && d > 0.3) {
          let dh = Math.atan2(-ox, -oz) - sl.heading;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          if (Math.abs(dh) < 1.9) look = Math.max(-1.1, Math.min(1.1, dh));
        }
      }
      sl.aside.lerp(want, Math.min(1, dt * 8));
      at.x += sl.aside.x;
      at.z += sl.aside.z;
      a.lookYaw += (look - a.lookYaw) * Math.min(1, dt * 4);
      a.seat = sl.p.seat?.() ?? 0;
      const fall = sl.p.down();
      a.down = fall.k;
      a.downSide = fall.side;
      a.gesture = sl.p.pose?.() ?? null;
      sl.p.act?.(a);
      // right by the camera: not drawn (it would fill the picture), as the games fade them
      const camD = this.eye ? Math.hypot(at.x - this.eye.x, at.z - this.eye.z) : 9;
      const close = camD < 0.9;
      const lk = faces.lookNow(sl.id);
      this.q.setFromAxisAngle(this.up, sl.heading);
      this.root.compose(this.v.set(at.x, at.y, at.z), this.q, this.s.setScalar(lk.bh));
      if (close) {
        this.heads.setVisibleAt(sl.head, false);
        for (let k = 0; k < NPARTS; k++) this.parts.setMatrixAt(sl.inst * NPARTS + k, this.zero);
      } else {
        this.heads.setVisibleAt(sl.head, true);
        pose(a, lk, this.joints);
        for (let k = 0; k < JOINTS; k++) this.joints[k].premultiply(this.root);
        for (let k = 0; k < NPARTS; k++) this.parts.setMatrixAt(sl.inst * NPARTS + k, partMatrix(k, this.joints, lk, this.m));
        this.heads.setMatrixAt(sl.head, headMatrix(this.joints, this.m));
      }
      top = Math.max(top, sl.inst + 1);
    }
    // the unused slots out of sight
    for (const i of this.free) if (i < top) for (let k = 0; k < NPARTS; k++) this.parts.setMatrixAt(i * NPARTS + k, this.zero);
    this.parts.count = top * NPARTS;
    this.parts.instanceMatrix.needsUpdate = true;
  }

  /** The zkSNARK drawn nearest (x, z) within `r`, for the fist and the talk (its key, where). */
  nearest(x: number, z: number, r: number) {
    let best: { key: string; d: number } | null = null;
    for (const sl of this.slots.values()) {
      sl.p.pos(this.tmp);
      const d = Math.hypot(this.tmp.x - x, this.tmp.z - z);
      if (d < r && (!best || d < best.d)) best = { key: sl.p.key, d };
    }
    return best;
  }
}
