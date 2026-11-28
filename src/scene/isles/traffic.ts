import * as THREE from "three";
import { reach, type TrafficBlocker } from "../goldengate";
import { sayAt } from "../speech";
import { carObject, spinWheels, type CarKind } from "../real/cars";
import type { Course } from "./course";
import type { Isle } from "./types";

/**
 * An island's traffic: cars and trucks come over the crossing from the ring road, go round a few of
 * the island's blocks and back over to the city. Smooth: each car's place is interpolated along its
 * route (no stepping from one sampled metre to the next), its heading eased, its speed changed by
 * accelerating and braking, never in a jump. The game reads them as boxes (to crash into, to take).
 */

const PAINTS = ["#c8ccd4", "#2a2a34", "#8a2a3a", "#2a4a7a", "#e8e4dc", "#ff7fb0", "#46c8e0", "#f4b728", "#3a5a40", "#f2f2f0"];
const STEP = 0.5;

/** A route's centre line every half metre: straight runs, rounded corners. */
class Route {
  readonly pts: { x: number; z: number; tx: number; tz: number; slow: number }[] = [];
  readonly length: number;
  constructor(corners: [number, number][], r = 8) {
    const raw: [number, number][] = [];
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i];
      if (i === 0 || i === corners.length - 1) {
        raw.push(p);
        continue;
      }
      const a = corners[i - 1],
        b = corners[i + 1];
      const la = Math.hypot(p[0] - a[0], p[1] - a[1]),
        lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const k = Math.min(r, la / 2, lb / 2);
      const ux = (p[0] - a[0]) / la,
        uz = (p[1] - a[1]) / la,
        vx = (b[0] - p[0]) / lb,
        vz = (b[1] - p[1]) / lb;
      const s0: [number, number] = [p[0] - ux * k, p[1] - uz * k],
        s1: [number, number] = [p[0] + vx * k, p[1] + vz * k];
      for (let n = 0; n <= 12; n++) {
        const t = n / 12;
        raw.push([(1 - t) * (1 - t) * s0[0] + 2 * (1 - t) * t * p[0] + t * t * s1[0], (1 - t) * (1 - t) * s0[1] + 2 * (1 - t) * t * p[1] + t * t * s1[1]]);
      }
    }
    for (let i = raw.length - 1; i > 0; i--) if (Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]) < 0.01) raw.splice(i, 1);
    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
    let seg = 1;
    for (let d = 0; d <= cum[cum.length - 1]; d += STEP) {
      while (seg < raw.length - 1 && cum[seg] < d) seg++;
      const [ax, az] = raw[seg - 1],
        [bx, bz] = raw[seg];
      const L = Math.max(1e-6, cum[seg] - cum[seg - 1]);
      const t = Math.max(0, Math.min(1, (d - cum[seg - 1]) / L));
      this.pts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / L, tz: (bz - az) / L, slow: 0 });
    }
    this.length = (this.pts.length - 1) * STEP;
    // how much to slow: how far the heading turns over the next ten metres (and braking before it)
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const a = this.pts[i],
        b = this.pts[Math.min(n - 1, i + 20)];
      a.slow = Math.min(1, (1 - (a.tx * b.tx + a.tz * b.tz)) * 2.5);
    }
    for (let i = n - 2; i >= 0; i--) this.pts[i].slow = Math.max(this.pts[i].slow, this.pts[i + 1].slow * 0.96);
  }
  /** The centre line at s, interpolated between samples: place, way along (unit), slowing. */
  at(s: number, out: { x: number; z: number; tx: number; tz: number; slow: number }) {
    const f = Math.max(0, Math.min(this.pts.length - 1.001, s / STEP));
    const i = Math.floor(f),
      t = f - i;
    const a = this.pts[i],
      b = this.pts[i + 1];
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    const tx = a.tx + (b.tx - a.tx) * t,
      tz = a.tz + (b.tz - a.tz) * t;
    const l = Math.hypot(tx, tz) || 1;
    out.tx = tx / l;
    out.tz = tz / l;
    out.slow = a.slow + (b.slow - a.slow) * t;
    return out;
  }
}

interface Car {
  obj: THREE.Group;
  route: Route;
  /** Which lane (0 inner, 1 outer where there are two each way). */
  lane: 0 | 1;
  s: number;
  v: number;
  cruise: number;
  len: number;
  x: number;
  z: number;
  yaw: number;
  /** The lane's offset now (eased when the road narrows). */
  off: number;
  /** Held by you (or a walker) in its way: for how long (s), when it last honked; going round you (as on the Golden Gate: src/scene/goldengate.ts). */
  wait?: number;
  honked?: number;
  dodge?: { bx: number; bz: number; ox: number; oz: number; ea: number; to: number; t: number; backed: number } | null;
}

const HONKS = ["BEEP!", "HONK!", "MOVE IT!", "COME ON!", "BEEP BEEP"];

export class IsleTraffic {
  readonly group = new THREE.Group();
  private cars: Car[] = [];
  private routes: Route[] = [];
  private spawnIn = 0;
  private tmp = { x: 0, z: 0, tx: 0, tz: 0, slow: 0 };
  /** Who the traffic must not run over (the game's player); `wait`: give way, never go round. */
  blockers: () => TrafficBlocker[] = () => [];
  /** A horn at (x, z) (long: a lean on it). */
  onHorn: ((x: number, z: number, long: boolean) => void) | null = null;

  constructor(
    scene: THREE.Object3D,
    private isle: Isle,
    private course: Course,
    loops: [number, number][][],
    private max = 26,
  ) {
    this.group.name = `isle:${isle.key}:traffic`;
    scene.add(this.group);
    const there = isle.crossing.path;
    const back = [...there].reverse();
    // each loop: over the crossing, round the island's blocks, back over (the corners meet the course's ends)
    for (const l of loops) this.routes.push(new Route([...there, ...l, ...back.slice(1)] as [number, number][]));
    for (let i = 0; i < Math.round(max * 0.7); i++) this.spawn(true);
  }

  /** The surface under a wheel: the course's profile on it, the island's streets elsewhere. */
  private y(x: number, z: number) {
    const p = this.course.project(x, z);
    if (p && Math.abs(p.off) < this.isle.crossing.section.road + 0.5) return this.course.y(p.s) + 0.012;
    return 0.012;
  }

  /** The lane's offset at a point: the crossing's lanes on it, the island streets' elsewhere (by their width). */
  private laneOff(x: number, z: number, lane: 0 | 1) {
    const p = this.course.project(x, z);
    if (p && Math.abs(p.off) < 3) return this.isle.crossing.lanes[Math.min(lane, this.isle.crossing.lanes.length - 1)];
    let w = 10;
    for (const s of this.isle.streets) {
      const on = s.axis === "x" ? Math.abs(z - s.at) < 3 && x > s.from - 2 && x < s.to + 2 : Math.abs(x - s.at) < 3 && z > s.from - 2 && z < s.to + 2;
      if (on) w = Math.max(w, s.width);
    }
    // (a boulevard as wide as the bridge's road — Zakone's Bridge Avenue — four lanes: the middles of its painted ones)
    return w >= 24 ? (lane ? w * 0.375 : w * 0.125) : w >= 14 ? (lane ? 5.0 : 1.9) : 1.9;
  }

  private spawn(anywhere = false) {
    const route = this.routes[Math.floor(Math.random() * this.routes.length)];
    let s = anywhere ? Math.random() * route.length : 0;
    // (a newcomer at the city end grows into view; not while you are close by there)
    if (!anywhere) {
      const p = route.at(0, this.tmp);
      if (this.blockers().some((b) => Math.hypot(b.x - p.x, b.z - p.z) < 60)) s = route.length * (0.35 + Math.random() * 0.3);
    }
    const r = Math.random();
    let obj: THREE.Group;
    let len = 4.4;
    if (r < 0.14) (obj = carObject("taxi", { paint: "#f2c230" })), (obj.userData.kind = "taxi");
    else if (r < 0.24) {
      obj = carObject("truck", { livery: ["#e8e4dc", "#2e5ab8", "#c0302e"][Math.floor(Math.random() * 3)], label: Math.random() < 0.5 ? "proof" : "depot" });
      obj.userData.kind = "truck";
      len = 7;
    } else {
      const kind = (["sedan", "sedan", "suv", "sports", "convertible", "van", "pickup", "sedan"] as CarKind[])[Math.floor(Math.random() * 8)];
      obj = carObject(kind, { paint: PAINTS[Math.floor(Math.random() * PAINTS.length)] });
      obj.userData.kind = kind;
      len = kind === "van" || kind === "pickup" || kind === "suv" ? 5 : 4.4;
    }
    const lane: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    const car: Car = { obj, route, lane, s, v: 0, cruise: 11 + Math.random() * 4, len, x: 0, z: 0, yaw: 0, off: 0 };
    this.place(car, 1);
    car.v = anywhere ? car.cruise * 0.8 : car.cruise * 0.6;
    for (const o of this.cars) if (Math.hypot(o.x - car.x, o.z - car.z) < 10) return;
    this.cars.push(car);
    this.group.add(obj);
  }

  /**
   * Where to pass whoever stands at (bx, bz): `clear` m to its left or right, within the road (on the
   * crossing its own carriageway; in the streets kerb to kerb, the left of the centre the oncoming
   * lanes), into a band where no one comes the other way (45 m on) nor drives alongside. Null: not yet.
   */
  private roundOffset(c: Car, p: { x: number; z: number; tx: number; tz: number }, bx: number, bz: number, clear: number, late = false, ea = 0.3): number | null {
    const nx = -p.tz,
      nz = p.tx;
    const bOff = (bx - p.x) * nx + (bz - p.z) * nz;
    // (how far on the going round reaches: past whoever it goes round, its own length and a little)
    const zone = (bx - c.x) * Math.cos(c.yaw) - (bz - c.z) * Math.sin(c.yaw) + ea + c.len / 2 + 2;
    const on = this.course.project(p.x, p.z);
    let lo: number, hi: number;
    if (on && Math.abs(on.off) < 3) {
      const sec = this.isle.crossing.section;
      (lo = sec.median + 1.3), (hi = sec.road - 1.3);
    } else {
      let w = 10;
      for (const s of this.isle.streets) {
        const at = s.axis === "x" ? Math.abs(p.z - s.at) < 3 && p.x > s.from - 2 && p.x < s.to + 2 : Math.abs(p.x - s.at) < 3 && p.z > s.from - 2 && p.z < s.to + 2;
        if (at) w = Math.max(w, s.width);
      }
      (lo = -(w / 2 - 1.2)), (hi = w / 2 - 1.2);
    }
    const fx = Math.cos(c.yaw),
      fz = -Math.sin(c.yaw);
    const free = (o: number) => {
      for (const q of this.cars) {
        if (q === c) continue;
        const dx = q.x - c.x,
          dz = q.z - c.z;
        const along = dx * fx + dz * fz;
        const lat = (q.x - p.x) * nx + (q.z - p.z) * nz;
        if (Math.abs(lat - o) > 1.95) continue;
        const same = Math.cos(q.yaw) * fx - Math.sin(q.yaw) * fz;
        // (coming the other way: 45 m on; the same way: beside it or just ahead — and just behind only
        // when it pulls over into another band: one following it in its own band is no matter)
        const own = Math.abs(o - c.off) < 1.2;
        // (one standing still — waiting too — is no matter where it is not in the way: coming the other
        // way, only up to the far side of whoever it goes round; behind it, only one that comes on)
        const moving = q.v > 0.8;
        if (same < -0.3) {
          if (along > -6 && along < (moving ? (late ? 22 : 45) : zone)) return false;
        } else if (along > (own || !moving ? 0 : late ? -5 : -9) && along < (late ? 7 : 14)) return false;
      }
      return true;
    };
    const opts = [bOff - clear, bOff + clear].filter((o) => o >= lo && o <= hi).sort((a, b) => Math.abs(a - c.off) - Math.abs(b - c.off));
    for (const o of opts) if (free(o)) return o;
    return null;
  }

  private place(c: Car, ease: number) {
    const p = c.route.at(c.s, this.tmp);
    const want = c.dodge ? c.dodge.to : this.laneOff(p.x, p.z, c.lane);
    c.off += (want - c.off) * Math.min(1, ease);
    c.x = p.x - p.tz * c.off;
    c.z = p.z + p.tx * c.off;
    const yaw = Math.atan2(-p.tz, p.tx);
    // (the heading eased: no snap where the samples' tangents change)
    let d = yaw - c.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    c.yaw = ease >= 1 ? yaw : c.yaw + d * Math.min(1, ease * 1.6);
    c.obj.position.set(c.x, this.y(c.x, c.z), c.z);
    c.obj.rotation.set(0, c.yaw, 0);
  }

  /** Each car as a box (centre, half sizes on x and z) with what the game needs to shove it. */
  *boxes(): Iterable<{ x: number; z: number; hx: number; hz: number; ref?: unknown; vx?: number; vz?: number; mass?: number }> {
    for (const c of this.cars) {
      const cs = Math.abs(Math.cos(c.yaw)),
        sn = Math.abs(Math.sin(c.yaw));
      yield { x: c.x, z: c.z, hx: (cs * c.len + sn * 1.9) / 2, hz: (sn * c.len + cs * 1.9) / 2, ref: c, vx: Math.cos(c.yaw) * c.v, vz: -Math.sin(c.yaw) * c.v, mass: c.len > 6 ? 4.5 : 1.35 };
    }
  }

  /** A car knocked out of the traffic (or taken): its body out of the traffic's group, and its kind. */
  take(ref: unknown): { group: THREE.Group; kind: CarKind } | null {
    const i = this.cars.indexOf(ref as Car);
    if (i < 0) return null;
    const c = this.cars[i];
    this.cars.splice(i, 1);
    this.group.remove(c.obj);
    const g = new THREE.Group();
    g.position.copy(c.obj.position);
    g.rotation.set(0, c.yaw, 0);
    for (const ch of [...c.obj.children]) g.add(ch);
    const k = (c.obj.userData.kind as CarKind) ?? "sedan";
    return { group: g, kind: k };
  }

  owns(ref: unknown) {
    return this.cars.includes(ref as Car);
  }

  update(dt: number) {
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.cars.length < this.max) {
      this.spawnIn = 0.8 + Math.random() * 1.4;
      this.spawn();
    }
    const others = this.blockers();
    for (const c of this.cars) {
      const p = c.route.at(c.s, this.tmp);
      const fx = Math.cos(c.yaw),
        fz = -Math.sin(c.yaw);
      // (the one it is going round: followed while it stands about; gone, or 16 s on, the going round is off)
      const d = c.dodge ?? null;
      if (d) {
        let near: { x: number; z: number } | null = null;
        for (const o of others) if (!o.wait && Math.hypot(o.x - d.bx, o.z - d.bz) < 3) near = o;
        d.t += dt;
        if (!near || d.t > 16 || Math.hypot(near.x - d.ox, near.z - d.oz) > 2) c.dodge = null;
        else (d.bx = near.x), (d.bz = near.z);
      }
      let ahead = Infinity;
      for (const o of this.cars) {
        if (o === c) continue;
        const dx = o.x - c.x,
          dz = o.z - c.z;
        const along = dx * fx + dz * fz,
          across = Math.abs(-dx * fz + dz * fx);
        if (along > 0 && along < 24 && across < 1.6) ahead = Math.min(ahead, along - (o.len + c.len) / 2);
      }
      // (someone in front of its nose — not at its flank, side by side)
      let held: TrafficBlocker | null = null,
        heldAt = Infinity,
        heldReach: [number, number] = [0.3, 0.3];
      for (const o of others) {
        const going = !!c.dodge && Math.hypot(o.x - c.dodge.bx, o.z - c.dodge.bz) < 3;
        const dx = o.x - c.x,
          dz = o.z - c.z;
        const along = dx * fx + dz * fz,
          across = Math.abs(-dx * fz + dz * fx);
        const [ea, ec] = reach(o, fx, fz);
        if (going && !(along > 0 && along < c.len / 2 + ea + 2.5 && across < 0.95 + ec + 0.1)) continue;
        if (along > c.len * 0.35 && along < 16 + ea && across < Math.max(1.8, 1.0 + ec)) {
          const gap = along - c.len / 2 - ea - 0.5;
          if (gap < heldAt) (heldAt = gap), (held = o), (heldReach = [ea, ec]);
        }
      }
      const byBlocker = heldAt < ahead;
      ahead = Math.min(ahead, heldAt);
      const cruise = c.cruise * (1 - p.slow * 0.6);
      let want = ahead < 2.5 ? 0 : ahead < 12 ? Math.min(cruise, cruise * ((ahead - 2.5) / 9.5)) : cruise;
      // held by you: it waits, honks, then backs up a little if right on you and goes round within the road
      if (byBlocker && held && !held.wait && c.v < 0.4 && !c.dodge) {
        c.wait = (c.wait ?? 0) + dt;
        if (c.wait > 2.5 && c.wait - (c.honked ?? -99) > 6) {
          c.honked = c.wait;
          this.onHorn?.(c.x, c.z, c.wait > 8);
          if (c.wait < 3.5) sayAt(c.obj, HONKS[Math.floor(Math.random() * HONKS.length)], "honk", c.len > 6 ? 3.6 : 2.2, 1.4, 0.55);
        }
        const late = c.wait > 12;
        if (c.wait > 5 && (p.slow < 0.7 || late)) {
          const to = this.roundOffset(c, p, held.x, held.z, 0.95 + heldReach[1] + (late ? 0.35 : 0.6), late, heldReach[0]);
          if (to !== null) (c.dodge = { bx: held.x, bz: held.z, ox: held.x, oz: held.z, ea: heldReach[0], to, t: 0, backed: 0 }), (c.wait = 0);
        }
      } else if (!byBlocker || !held) (c.wait = 0), (c.honked = -99);
      const dg = c.dodge ?? null;
      if (dg) {
        const along = (dg.bx - c.x) * fx + (dg.bz - c.z) * fz;
        const gap = along - c.len / 2 - dg.ea;
        // right on them: a couple of metres back first (if no one is close behind)
        let behind = false;
        for (const o of this.cars) {
          if (o === c) continue;
          const dx = o.x - c.x,
            dz = o.z - c.z;
          const al = dx * fx + dz * fz;
          if (al < 0 && al > -((o.len + c.len) / 2 + 1.5) && Math.abs(-dx * fz + dz * fx) < 1.8) behind = true;
        }
        for (const o of others) {
          const dx = o.x - c.x,
            dz = o.z - c.z;
          const al = dx * fx + dz * fz;
          const [ea, ec] = reach(o, fx, fz);
          if (al < 0 && al > -(c.len / 2 + ea + 1.5) && Math.abs(-dx * fz + dz * fx) < 1.4 + ec) behind = true;
        }
        if (gap < 2.6 && dg.backed < 3 && !behind && c.s > 2 && Math.abs(dg.to - c.off) > 0.8) {
          const back = 1.2 * dt;
          c.v = 0;
          c.s -= back;
          dg.backed += back;
          this.place(c, dt * 6);
          spinWheels(c.obj, -back);
          continue;
        }
        want = Math.min(want, Math.abs(dg.to - c.off) > 0.8 ? 1.6 : 6.5);
        if (along < -(c.len / 2 + dg.ea + 1.5)) c.dodge = null;
      }
      // accelerate gently, brake firmly (never a jump in speed)
      const dv = want - c.v;
      c.v += Math.max(-9 * dt, Math.min(3.2 * dt, dv));
      c.v = Math.max(0, c.v);
      c.s += c.v * dt;
      this.place(c, dt * (c.dodge ? 1.6 : 6));
      spinWheels(c.obj, c.v * dt);
      // the city end: in and out of view (grown in, shrunk away)
      const fade = Math.min(1, c.s / 5, (c.route.length - c.s) / 5);
      c.obj.scale.setScalar(Math.max(0.01, fade));
    }
    this.cars = this.cars.filter((c) => {
      const gone = c.s >= c.route.length - 0.5;
      if (gone) this.group.remove(c.obj);
      return !gone;
    });
  }
}
