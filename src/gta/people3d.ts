import * as THREE from "three";
import { faces, type Look } from "./faces";
import { bodyMatrix, figureMaterials, headMatrix, JOINTS, newAct, NPARTS, partBox, partColor, partMatrix, pose, stride, type Act } from "./figure";

/**
 * The street's zkSNARKs in 3D (src/gta): round you, every zkSNARK — the game's own passers-by first,
 * then the street's residents and its crowd's walkers, out along the avenues — is drawn as itself in
 * 3D (figure.ts: its bust from its picture in volume, on its legs, with its arms), and its flat
 * figure is hidden; within a wider ring, the flat figures of those not drawn yet are hidden too, so
 * nothing in sight is 2D. All of them in two draws: the busts in one BatchedMesh (a head and a pair
 * of shoulders per zkSNARK, kept while it is about), every limb of everyone in one InstancedMesh.
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
  /** Its limbs' first instance (NPARTS from there). */
  inst: number;
  body: number;
  head: number;
  id: number;
  heading: number;
  last: THREE.Vector3;
  act: Act;
  /** Stepping round you (drawn aside, the walk itself unchanged). */
  aside: THREE.Vector3;
  /** Far off: posed every few frames. */
  skip: number;
  /** Not posed yet (posed the first frame whatever its distance). */
  fresh: boolean;
  look: Look;
}

export class People3D {
  readonly group = new THREE.Group();
  private busts: THREE.BatchedMesh;
  private parts: THREE.InstancedMesh;
  private slots = new Map<string, Slot>();
  /** Busts in the batch, by zkSNARK: their geometries there, how many wear them, when last used. */
  private geos = new Map<number, { body: number; head: number; users: number; used: number }>();
  /** Flat figures hidden (in the ring round you), by key. */
  private flat = new Map<string, Person3>();
  private free: number[] = [];
  private scanT = 0;
  private readonly max: number;
  private readonly radius: number;
  private readonly hideR: number;
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
  private frame = 0;
  enabled = true;
  /** How many are drawn in 3D now: the most, or fewer while the frame rate suffers (it climbs back). */
  limit: number;
  private frameAvg = 1 / 60;
  private slow = 0;
  private fast = 0;
  private judgeT = 0;
  /** Seconds since it was shown (or moved somewhere new). */
  private warm = 0;

  /** Where the people come from instead (inside a place), or null: the street's. */
  source: ((x: number, z: number, r: number) => Person3[]) | null = null;

  constructor(
    scene: THREE.Scene,
    private find: (x: number, z: number, r: number) => Person3[],
  ) {
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    this.max = coarse ? 70 : 400;
    this.radius = coarse ? 55 : 125;
    this.hideR = coarse ? 90 : 220;
    this.limit = this.max;
    const mats = figureMaterials();
    this.busts = new THREE.BatchedMesh(this.max * 2, 400_000, 0, mats.bust);
    this.busts.castShadow = true;
    this.busts.frustumCulled = false;
    this.busts.perObjectFrustumCulled = true;
    this.parts = new THREE.InstancedMesh(partBox(), mats.part, this.max * NPARTS);
    this.parts.castShadow = true;
    this.parts.frustumCulled = false;
    this.parts.count = 0;
    this.parts.setColorAt(0, this.c.set(0xffffff));
    this.group.add(this.busts, this.parts);
    this.group.name = "gta:people3d";
    this.group.visible = false;
    scene.add(this.group);
    for (let i = this.max - 1; i >= 0; i--) this.free.push(i);
  }

  show(on: boolean) {
    this.group.visible = on;
    this.warm = 0;
    if (!on) this.clear();
  }

  /** Everyone back to their flat figures (a change of scene). */
  clear() {
    for (const s of [...this.slots.values()]) this.drop(s);
    for (const p of this.flat.values()) p.hide(false);
    this.flat.clear();
  }

  /** Into the scene being drawn (the street, a place). */
  into(scene: THREE.Object3D) {
    if (this.group.parent === scene) return;
    this.warm = 0;
    this.clear();
    scene.add(this.group);
  }

  /** Each frame, round (x, z). */
  update(dt: number, x: number, z: number, me: THREE.Vector3 | null = null, eye: THREE.Vector3 | null = null, view: THREE.Vector3 | null = null) {
    this.eye = eye;
    if (view) this.view.set(view.x, 0, view.z).normalize();
    if (!this.group.visible || !this.enabled) return;
    // the frame rate decides how many: under ~45 fps a few go back, over ~57 a few come in
    // (not while it is still building the busts it just met: those frames are the building's, not the drawing's)
    this.frameAvg += (Math.min(dt, 0.1) - this.frameAvg) * 0.05;
    this.judgeT += dt;
    this.warm += dt;
    // (slowly, and only on a clear verdict: a limit going up and down every few seconds took dozens
    // of bodies out of the picture and back — the crowd blinking)
    if (this.judgeT > 4) {
      this.judgeT = 0;
      if (this.frameAvg > 1 / 40 && this.warm > 8) (this.slow++, (this.fast = 0));
      else if (this.frameAvg < 1 / 56) (this.fast++, (this.slow = 0));
      else this.slow = this.fast = 0;
      if (this.slow >= 2) (this.limit = Math.max(Math.round(this.max * 0.35), this.limit - 20)), (this.slow = 0);
      if (this.fast >= 3) (this.limit = Math.min(this.max, this.limit + 20)), (this.fast = 0);
    }
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.2;
      this.scan(x, z);
    }
    this.me = me;
    this.pose(dt);
  }
  private me: THREE.Vector3 | null = null;
  private eye: THREE.Vector3 | null = null;
  /** Which way the camera looks (flat): those in sight come first, and from farther. */
  private view = new THREE.Vector3(0, 0, -1);

  /** Who is near now: the nearest come in 3D, those gone or far go; the flat figures round about are hidden. */
  private scan(x: number, z: number) {
    const list = (this.source ?? this.find)(x, z, this.source ? this.radius + 4 : this.hideR);
    const d = (p: Person3) => {
      p.pos(this.tmp);
      return (this.tmp.x - x) ** 2 + (this.tmp.z - z) ** 2;
    };
    // in sight (in front of the camera, within ~70° of where it looks): first, and out to the ring's edge
    const ex = this.eye?.x ?? x,
      ez = this.eye?.z ?? z;
    const ranked = list
      .map((p) => {
        const dd = d(p);
        const ox = this.tmp.x - ex,
          oz = this.tmp.z - ez;
        const sight = dd < 64 || (ox * this.view.x + oz * this.view.z) / Math.max(0.01, Math.hypot(ox, oz)) > 0.34;
        // (one already in 3D keeps its place against newcomers: at the cut, two swapping in and
        // out every scan as the camera turns was the flicker — a body gone, then back)
        const held = this.slots.has(p.key) ? 0.45 : 1;
        return { p, d: dd, sight, score: p.own ? -1e9 + dd : dd * (sight ? 1 : 7) * held };
      })
      .sort((a, b) => a.score - b.score);
    const keep = new Set<string>();
    for (const { p, d: dd, sight } of ranked) {
      if (keep.size >= this.limit) break;
      const held = this.slots.has(p.key);
      // (a little farther for those already in: no flicker at the edge)
      if (!p.own && dd > ((sight ? this.hideR - 4 : this.radius) + (held ? 5 : 0)) ** 2) continue;
      keep.add(p.key);
    }
    for (const s of [...this.slots.values()]) if (!keep.has(s.p.key) || !s.p.alive()) this.drop(s);
    const asked: number[] = [],
      quick: number[] = [];
    // (building busts takes a moment: a few milliseconds of it per scan)
    const t0 = performance.now();
    for (const { p } of ranked) {
      if (!keep.has(p.key) || this.slots.has(p.key) || !p.alive()) continue;
      let g = this.geos.get(p.id);
      if (!g) {
        if (performance.now() - t0 > 7) continue;
        const tb = performance.now();
        const look = faces.look(p.id);
        this.buildMs += performance.now() - tb;
        this.builds++;
        if (!look) {
          (p.own || d(p) < 25 * 25 ? asked : quick).push(p.id);
          continue;
        }
        try {
          g = { body: this.add(look.body), head: this.add(look.head), users: 0, used: 0 };
          this.geos.set(p.id, g);
        } catch (e) {
          console.warn("gta: people3d is full", e);
          continue;
        }
      }
      const inst = this.free.pop();
      if (inst === undefined) break;
      const body = this.busts.addInstance(g.body);
      const head = this.busts.addInstance(g.head);
      // (unseen until it is first posed: a new instance stands at the world's origin, a flash there)
      this.busts.setMatrixAt(body, this.zero);
      this.busts.setMatrixAt(head, this.zero);
      g.users++;
      g.used = performance.now();
      p.hide(true);
      const at = p.pos(new THREE.Vector3());
      const look = faces.lookNow(p.id);
      const was = this.gone.get(p.key);
      if (was !== undefined && performance.now() - was < 2500) this.churn++;
      const sl: Slot = { p, inst, body, head, id: p.id, heading: p.heading?.() ?? Math.random() * Math.PI * 2, last: at, act: newAct(), aside: new THREE.Vector3(), skip: 0, fresh: true, look };
      this.slots.set(p.key, sl);
      for (let k = 0; k < NPARTS; k++) this.parts.setColorAt(inst * NPARTS + k, this.c.setHex(partColor(look, k), THREE.SRGBColorSpace));
      if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
    }
    if (asked.length) faces.want(asked);
    if (quick.length) faces.quick(quick);
    // the flat figures in the ring: hidden for those in 3D; those it will not draw (too many, far
    // off) keep their flat figure — never gone from the picture, then back (the flicker); one
    // waiting for its bust keeps it a moment too. Out of the ring: shown again.
    if (!this.source) {
      const seen = new Set<string>();
      for (const { p } of ranked) {
        if (p.own) continue;
        seen.add(p.key);
        const hidden = this.slots.has(p.key);
        if (hidden && !this.flat.has(p.key)) {
          p.hide(true);
          this.flat.set(p.key, p);
        } else if (!hidden && this.flat.has(p.key)) {
          p.hide(false);
          this.flat.delete(p.key);
        }
      }
      for (const [k, p] of this.flat)
        if (!seen.has(k)) {
          p.hide(false);
          this.flat.delete(k);
        }
    }
    this.trim();
  }
  private builds = 0;
  private buildMs = 0;

  private add(geo: THREE.BufferGeometry) {
    const n = geo.getAttribute("position").count;
    try {
      return this.busts.addGeometry(geo);
    } catch {
      // more room (half as much again)
      const b = this.busts as unknown as { _maxVertexCount: number };
      this.busts.setGeometrySize(Math.ceil(b._maxVertexCount * 1.5) + n, 0);
      return this.busts.addGeometry(geo);
    }
  }

  /** The busts nobody wears, beyond a few dozen, out of the batch. */
  private trim() {
    if (this.geos.size <= this.max + 24) return;
    const idle = [...this.geos.entries()].filter(([, g]) => g.users === 0).sort((a, b) => a[1].used - b[1].used);
    for (const [id, g] of idle) {
      if (this.geos.size <= this.max + 12) break;
      this.busts.deleteGeometry(g.body);
      this.busts.deleteGeometry(g.head);
      this.geos.delete(id);
    }
  }

  /** When each one last went back to flat (a body back in 3D soon after is a flicker: counted). */
  private gone = new Map<string, number>();
  private churn = 0;

  private seenDrop = 0;

  private drop(s: Slot) {
    // (gone while in the picture: the flicker one sees)
    if (this.eye) {
      const at = s.p.pos(this.tmp2);
      const ox = at.x - this.eye.x,
        oz = at.z - this.eye.z;
      const l = Math.hypot(ox, oz);
      if (l > 1 && (ox * this.view.x + oz * this.view.z) / l > 0.72 && s.p.alive() && !this.flat.has(s.p.key)) this.seenDrop++;
      else if (l > 1 && (ox * this.view.x + oz * this.view.z) / l > 0.72 && s.p.alive()) this.seenDrop++;
    }
    this.gone.set(s.p.key, performance.now());
    if (this.gone.size > 4000) this.gone.clear();
    this.slots.delete(s.p.key);
    this.busts.deleteInstance(s.body);
    this.busts.deleteInstance(s.head);
    for (let k = 0; k < NPARTS; k++) this.parts.setMatrixAt(s.inst * NPARTS + k, this.zero);
    this.free.push(s.inst);
    const g = this.geos.get(s.id);
    if (g) g.users--;
    // (its flat figure stays hidden while it is in the ring: the scan shows it again past it)
    if (!this.flat.has(s.p.key)) s.p.hide(false);
  }

  /** Every body a step on: its place, its heading (from where it went, or its own), its pose. */
  private pose(dt: number) {
    let top = 0;
    this.frame++;
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
      top = Math.max(top, sl.inst + 1);
      // far off: posed one frame in three (the walk carries on between)
      const camD = this.eye ? Math.hypot(at.x - this.eye.x, at.z - this.eye.z) : 9;
      if (camD > 55 && (this.frame + sl.inst) % 3 !== 0 && !sl.fresh) continue;
      sl.fresh = false;
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
      const close = camD < 0.9;
      const lk = sl.look;
      this.q.setFromAxisAngle(this.up, sl.heading);
      this.root.compose(this.v.set(at.x, at.y, at.z), this.q, this.s.setScalar(lk.bh));
      this.busts.setVisibleAt(sl.body, !close);
      this.busts.setVisibleAt(sl.head, !close);
      if (close) for (let k = 0; k < NPARTS; k++) this.parts.setMatrixAt(sl.inst * NPARTS + k, this.zero);
      else {
        pose(a, lk, this.joints);
        for (let k = 0; k < JOINTS; k++) this.joints[k].premultiply(this.root);
        for (let k = 0; k < NPARTS; k++) this.parts.setMatrixAt(sl.inst * NPARTS + k, partMatrix(k, this.joints, lk, this.m));
        this.busts.setMatrixAt(sl.body, bodyMatrix(this.joints, this.m));
        this.busts.setMatrixAt(sl.head, headMatrix(this.joints, this.m));
      }
    }
    // the unused slots out of sight
    for (const i of this.free) if (i < top) for (let k = 0; k < NPARTS; k++) this.parts.setMatrixAt(i * NPARTS + k, this.zero);
    this.parts.count = top * NPARTS;
    this.parts.instanceMatrix.needsUpdate = true;
  }

  /** How many are drawn in 3D now, and how many flat figures are hidden round about. */
  get counts() {
    return { in3d: this.slots.size, hidden: this.flat.size, builds: this.builds, msPerBuild: +(this.buildMs / Math.max(1, this.builds)).toFixed(2), churn: this.churn, seenDrop: this.seenDrop, limit: this.limit };
  }
}
