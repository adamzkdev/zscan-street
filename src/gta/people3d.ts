import * as THREE from "three";
import { SNARK_DIMS, snarkParts, snarkToon, type SnarkParts } from "../scene/snarkbody";
import { BODY_SCALE } from "./foot";

/**
 * The street's people in 3D (src/gta): round you, every zkSNARK on the pavements (the street's own
 * residents and carriers, the crowd's walkers) is drawn as a voxel body like yours — its pixel art
 * extruded, legs and arms that walk — and its flat figure is hidden. All of them in a few draws:
 * the heads and bodies in one BatchedMesh (one geometry per zkSNARK, kept while it is about), their
 * ink outlines in another, every arm and leg in one InstancedMesh. Farther off, the flat figures
 * carry on as they were.
 */

export interface Person3 {
  /** Who it is in the street's own terms (stable while it is about). */
  key: string;
  /** The zkSNARK. */
  id: number;
  /** Where its feet are now. */
  pos(out: THREE.Vector3): THREE.Vector3;
  /** How far over it is (0 standing, 1 flat) and to which side. */
  down(): { k: number; side: number };
  /** A way it stands facing when still (world, flat), or null. */
  face(): THREE.Vector3 | null;
  /** Seated: the seat's height over its feet, else 0. */
  seat?(): number;
  /** Its flat figure hidden (true) or shown. */
  hide(on: boolean): void;
  /** Still in the street (not gone, not on a bus). */
  alive(): boolean;
}

interface Slot {
  p: Person3;
  inst: number;
  ink: number;
  geo: number;
  parts: SnarkParts;
  heading: number;
  speed: number;
  phase: number;
  last: THREE.Vector3;
  t: number;
  /** Stepping round you (drawn aside, the walk itself unchanged). */
  aside: THREE.Vector3;
}

const D = SNARK_DIMS;

export class People3D {
  readonly group = new THREE.Group();
  private batch: THREE.BatchedMesh;
  private inks: THREE.BatchedMesh;
  private limbs: THREE.InstancedMesh;
  private slots = new Map<string, Slot>();
  /** Geometries in the batches, by zkSNARK: their ids in each, how many people wear them, when last used. */
  private geos = new Map<number, { body: number; ink: number; users: number; used: number; parts: SnarkParts }>();
  private loading = new Set<number>();
  private free: number[] = [];
  private scanT = 0;
  private readonly max: number;
  private readonly radius: number;
  private m = new THREE.Matrix4();
  private m2 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  enabled = true;

  constructor(
    scene: THREE.Scene,
    private find: (x: number, z: number, r: number) => Person3[],
  ) {
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    this.max = coarse ? 28 : 56;
    this.radius = coarse ? 30 : 42;
    const toon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: snarkToon() });
    this.batch = new THREE.BatchedMesh(this.max, 260_000, 0, toon);
    this.batch.castShadow = true;
    this.batch.frustumCulled = false;
    this.batch.perObjectFrustumCulled = false;
    const inkMat = new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide });
    this.inks = new THREE.BatchedMesh(this.max, 260_000, 0, inkMat);
    this.inks.frustumCulled = false;
    this.inks.perObjectFrustumCulled = false;
    this.inks.userData.noShadow = true;
    this.limbs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshToonMaterial({ gradientMap: snarkToon() }), this.max * 4);
    this.limbs.castShadow = true;
    this.limbs.frustumCulled = false;
    this.limbs.count = 0;
    this.limbs.setColorAt(0, this.c.set(0xffffff));
    this.group.add(this.batch, this.inks, this.limbs);
    this.group.name = "gta:people3d";
    this.group.visible = false;
    scene.add(this.group);
    for (let i = this.max - 1; i >= 0; i--) this.free.push(i);
  }

  show(on: boolean) {
    this.group.visible = on;
    if (!on) for (const s of [...this.slots.values()]) this.drop(s);
  }

  /** Each frame, round (x, z). */
  update(dt: number, x: number, z: number, me: THREE.Vector3 | null = null, eye: THREE.Vector3 | null = null) {
    this.eye = eye;
    if (!this.group.visible || !this.enabled) return;
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
    const list = this.find(x, z, this.radius + 4);
    const d = (p: Person3) => {
      p.pos(this.tmp);
      return (this.tmp.x - x) ** 2 + (this.tmp.z - z) ** 2;
    };
    const ranked = list.map((p) => ({ p, d: d(p) })).sort((a, b) => a.d - b.d);
    const keep = new Set<string>();
    for (const { p, d: dd } of ranked) {
      if (keep.size >= this.max) break;
      const held = this.slots.has(p.key);
      // (a little farther for those already in: no flicker at the edge)
      if (dd > (this.radius + (held ? 4 : 0)) ** 2) continue;
      keep.add(p.key);
    }
    for (const s of [...this.slots.values()]) if (!keep.has(s.p.key) || !s.p.alive()) this.drop(s);
    for (const { p } of ranked) {
      if (!keep.has(p.key) || this.slots.has(p.key) || !p.alive()) continue;
      const g = this.geos.get(p.id);
      if (!g) {
        this.load(p.id);
        continue;
      }
      const inst = this.free.pop();
      if (inst === undefined) break;
      const body = this.batch.addInstance(g.body);
      const ink = this.inks.addInstance(g.ink);
      g.users++;
      g.used = performance.now();
      p.hide(true);
      const at = p.pos(new THREE.Vector3());
      this.slots.set(p.key, { p, inst, ink, geo: body, parts: g.parts, heading: Math.random() * Math.PI * 2, speed: 0, phase: Math.random(), last: at, t: 0, aside: new THREE.Vector3() });
      this.c.setHex(g.parts.cloth, THREE.SRGBColorSpace);
      this.limbs.setColorAt(inst * 4, this.c);
      this.limbs.setColorAt(inst * 4 + 1, this.c);
      this.c.setHex(g.parts.trousers, THREE.SRGBColorSpace);
      this.limbs.setColorAt(inst * 4 + 2, this.c);
      this.limbs.setColorAt(inst * 4 + 3, this.c);
      if (this.limbs.instanceColor) this.limbs.instanceColor.needsUpdate = true;
    }
    this.trim();
  }

  /** A zkSNARK's geometry into both batches (when its art is in). */
  private load(id: number) {
    if (this.loading.has(id)) return;
    this.loading.add(id);
    void snarkParts(id).then((parts) => {
      this.loading.delete(id);
      if (!parts.real && id !== 0) {
        // (its art could not be read: it stays flat)
        parts.release();
        return;
      }
      try {
        const body = this.add(this.batch, parts.geo);
        const ink = this.add(this.inks, parts.geo);
        this.geos.set(id, { body, ink, users: 0, used: performance.now(), parts });
      } catch (e) {
        parts.release();
        console.warn("gta: people3d is full", e);
      }
    });
  }

  private add(b: THREE.BatchedMesh, geo: THREE.BufferGeometry) {
    const n = geo.getAttribute("position").count;
    try {
      return b.addGeometry(geo);
    } catch {
      // more room (half as much again), then once more
      const grow = Math.ceil((b as unknown as { _maxVertexCount: number })._maxVertexCount * 1.5) + n;
      b.setGeometrySize(grow, 0);
      return b.addGeometry(geo);
    }
  }

  /** The geometries nobody wears, beyond a few dozen, out of the batches. */
  private trim() {
    if (this.geos.size <= this.max + 16) return;
    const idle = [...this.geos.entries()].filter(([, g]) => g.users === 0).sort((a, b) => a[1].used - b[1].used);
    for (const [id, g] of idle) {
      if (this.geos.size <= this.max + 8) break;
      this.batch.deleteGeometry(g.body);
      this.inks.deleteGeometry(g.ink);
      g.parts.release();
      this.geos.delete(id);
    }
  }

  private drop(s: Slot) {
    this.slots.delete(s.p.key);
    this.batch.deleteInstance(s.geo);
    this.inks.deleteInstance(s.ink);
    this.free.push(s.inst);
    const g = this.geos.get(s.p.id);
    if (g) g.users--;
    s.p.hide(false);
  }

  /** Every body walked a step: its place, its heading (from where it went), legs and arms swinging. */
  private pose(dt: number) {
    const { m, m2, q, e, v, s } = this;
    let top = 0;
    const K = BODY_SCALE;
    for (const sl of this.slots.values()) {
      const at = sl.p.pos(this.tmp);
      const dx = at.x - sl.last.x,
        dz = at.z - sl.last.z;
      const step = Math.hypot(dx, dz);
      const sp = dt > 0 ? step / dt : 0;
      sl.speed += ((sp > 8 ? 0 : sp) - sl.speed) * Math.min(1, dt * 6);
      if (step > 0.004 && step < 1.5) {
        const want = Math.atan2(dx, dz);
        let dh = want - sl.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        sl.heading += dh * Math.min(1, dt * 10);
      } else if (sl.speed < 0.2) {
        const f = sl.p.face();
        if (f) {
          let dh = Math.atan2(f.x, f.z) - sl.heading;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          sl.heading += dh * Math.min(1, dt * 4);
        }
      }
      sl.last.copy(at);
      sl.t += dt;
      // you are in the way: it steps round you (drawn aside; the crowd's own loop carries on)
      const want = this.tmp2.set(0, 0, 0);
      if (this.me) {
        const ox = at.x - this.me.x,
          oz = at.z - this.me.z;
        const d = Math.hypot(ox, oz);
        if (d < 1.25) {
          const push = (1.25 - d) * 1.1;
          if (d > 1e-3) want.set((ox / d) * push, 0, (oz / d) * push);
          else want.set(push, 0, 0);
        }
      }
      sl.aside.lerp(want, Math.min(1, dt * 8));
      at.x += sl.aside.x;
      at.z += sl.aside.z;
      const seat = sl.p.seat?.() ?? 0;
      // right by the camera: not drawn (it would fill the picture), as the games fade them
      const close = !!this.eye && Math.hypot(at.x - this.eye.x, at.z - this.eye.z) < 1.5;
      this.batch.setVisibleAt(sl.geo, !close);
      this.inks.setVisibleAt(sl.ink, !close);
      sl.phase = (sl.phase + (sl.speed / K) * dt * 0.95) % 1;
      const st = Math.sin(sl.phase * Math.PI * 2);
      const walk = Math.min(1, sl.speed * 1.4);
      const stride = (0.35 + 0.3 * Math.min(1, sl.speed / 3)) * walk;
      const bob = Math.abs(st) * 0.04 * walk;
      const fall = sl.p.down();
      // the body: hips over the feet, turned, a lean when walking, flat on its side when knocked over
      e.set(0.08 * walk, sl.heading, fall.k * (Math.PI / 2) * fall.side, "YXZ");
      q.setFromEuler(e);
      const hip = seat > 0 ? seat : (D.LEG + bob) * K;
      // knocked over: the hips come down to the ground
      m.compose(v.set(at.x, at.y + hip * (1 - fall.k * 0.75), at.z), q, s.setScalar(K));
      this.batch.setMatrixAt(sl.geo, m);
      // the ink: a touch bigger about the body's middle
      const bb = sl.parts.geo.boundingBox!;
      const cx = (bb.min.x + bb.max.x) / 2,
        cy = (bb.min.y + bb.max.y) / 2,
        cz = (bb.min.z + bb.max.z) / 2;
      const k = 1.045;
      m2.makeTranslation(cx * (1 - k), cy * (1 - k), cz * (1 - k)).multiply(new THREE.Matrix4().makeScale(k, k, k));
      this.inks.setMatrixAt(sl.ink, new THREE.Matrix4().copy(m).multiply(m2));
      // arms and legs
      const pr = sl.parts;
      for (const side of [-1, 1]) {
        const i = sl.inst * 4 + (side < 0 ? 0 : 1);
        const swing = -st * stride * 0.9 * side;
        const sx = side * (Math.max(pr.halfW * 0.92, 0.2) + D.ARM_W * 0.5);
        const pivot = new THREE.Matrix4().compose(v.set(sx, pr.neckY - 0.058 * 1.2, 0), q.setFromEuler(e.set(swing, 0, side * -0.12)), s.set(1, 1, 1));
        const arm = new THREE.Matrix4().compose(v.set(0, -(D.UPPER + D.FORE) / 2, 0), q.identity(), s.set(D.ARM_W, D.UPPER + D.FORE + D.HAND, D.ARM_W));
        this.limbs.setMatrixAt(i, m2.copy(m).multiply(pivot).multiply(arm));
        const lx = side * Math.min(Math.max(pr.halfW * 0.42, D.LEG_W * 0.75), pr.halfW - D.LEG_W * 0.5);
        const hipM = new THREE.Matrix4().compose(v.set(lx, 0, 0), q.setFromEuler(e.set(seat > 0 ? -1.45 : st * stride * side, 0, 0)), s.set(1, 1, 1));
        const leg = new THREE.Matrix4().compose(v.set(0, -D.LEG / 2, 0), q.identity(), s.set(D.LEG_W, D.LEG, D.LEG_W * 1.1));
        this.limbs.setMatrixAt(sl.inst * 4 + (side < 0 ? 2 : 3), m2.copy(m).multiply(hipM).multiply(leg));
      }
      if (close) for (let k = 0; k < 4; k++) this.limbs.setMatrixAt(sl.inst * 4 + k, m2.makeScale(0, 0, 0));
      top = Math.max(top, sl.inst + 1);
    }
    // the unused slots' limbs out of sight
    for (const i of this.free) for (let k = 0; k < 4; k++) if (i < top) this.limbs.setMatrixAt(i * 4 + k, this.m2.makeScale(0, 0, 0));
    this.limbs.count = top * 4;
    this.limbs.instanceMatrix.needsUpdate = true;
  }
}
