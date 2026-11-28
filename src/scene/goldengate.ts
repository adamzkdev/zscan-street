import * as THREE from "three";
import type { City } from "./city";
import { BAY, CURB, ST } from "./city/plan";
import { corridor, KGRID, KTUNNEL, KX } from "./keys/plan";
import { carObject, spinWheels } from "./real/cars";
import { bridgeNight, buildBridge, deckY, GG, laneAt, roadHalf, walkHalf } from "./real/bridge";
import { sayAt } from "./speech";
import { GLASS_NIGHT } from "./voxel/surface";

/**
 * The Golden Gate comes alive: cars and trucks cross it both ways (four lanes, up the ramps and over
 * the span, the deck's real height under their wheels), through the Orchard Tunnel under the
 * headland, and round the streets of Orchard Keys on the other side before they come back over to
 * the city. On foot you can walk across on its deck; at the wheel (src/gta) you drive it.
 */

const PAINTS: [string, string][] = [
  ["#c8ccd4", "#3ef0ff"],
  ["#2a2a34", "#ff3e8a"],
  ["#8a2a3a", "#ff9f2e"],
  ["#2a4a7a", "#3ef0ff"],
  ["#e8e4dc", "#b07bff"],
  ["#ff7fb0", "#ff4fa3"],
  ["#46c8e0", "#34e7ff"],
  ["#f4b728", "#ff8a3a"],
];

/** A route's centre line, sampled every metre: where, which way, and how sharp the road is there. */
class Path {
  readonly pts: { x: number; z: number; tx: number; tz: number; slow: number }[] = [];
  readonly length: number;
  constructor(corners: [number, number][], r = 7) {
    // straight runs with quarter-circle corners of radius r
    const raw: [number, number][] = [];
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i];
      if (i === 0 || i === corners.length - 1) {
        raw.push(p);
        continue;
      }
      const a = corners[i - 1],
        b = corners[i + 1];
      const ina = Math.hypot(p[0] - a[0], p[1] - a[1]),
        inb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const ux = (p[0] - a[0]) / ina,
        uz = (p[1] - a[1]) / ina,
        vx = (b[0] - p[0]) / inb,
        vz = (b[1] - p[1]) / inb;
      const k = Math.min(r, ina / 2, inb / 2);
      // a U-turn (back the way it came): round the end in a half circle
      if (ux * vx + uz * vz < -0.9) {
        const nx = -uz,
          nz = ux;
        for (let s = 0; s <= 8; s++) {
          const t = (s / 8) * Math.PI;
          raw.push([p[0] + ux * Math.sin(t) * 3 + nx * (1 - Math.cos(t)) * -2.2, p[1] + uz * Math.sin(t) * 3 + nz * (1 - Math.cos(t)) * -2.2]);
        }
        continue;
      }
      const s0: [number, number] = [p[0] - ux * k, p[1] - uz * k],
        s1: [number, number] = [p[0] + vx * k, p[1] + vz * k];
      for (let s = 0; s <= 8; s++) {
        const t = s / 8;
        // a quadratic through the corner: close enough to the arc, and smooth
        raw.push([(1 - t) * (1 - t) * s0[0] + 2 * (1 - t) * t * p[0] + t * t * s1[0], (1 - t) * (1 - t) * s0[1] + 2 * (1 - t) * t * p[1] + t * t * s1[1]]);
      }
    }
    // resample every metre along it (repeated points dropped: no zero-length piece to take a heading from)
    for (let i = raw.length - 1; i > 0; i--) if (Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]) < 0.01) raw.splice(i, 1);
    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
    let seg = 1;
    for (let d = 0; d <= cum[cum.length - 1]; d += 1) {
      while (seg < raw.length - 1 && cum[seg] < d) seg++;
      const [ax, az] = raw[seg - 1],
        [bx, bz] = raw[seg];
      const L = Math.max(1e-6, cum[seg] - cum[seg - 1]);
      const t = Math.max(0, Math.min(1, (d - cum[seg - 1]) / L));
      this.pts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / L, tz: (bz - az) / L, slow: 0 });
    }
    this.length = this.pts.length - 1;
    // how much to slow down: where the heading turns over the next few metres
    for (let i = 0; i < this.pts.length; i++) {
      const j = Math.min(this.pts.length - 1, i + 10);
      const a = this.pts[i],
        b = this.pts[j];
      this.pts[i].slow = Math.min(1, (1 - (a.tx * b.tx + a.tz * b.tz)) * 2.5);
    }
    for (let i = this.pts.length - 2; i >= 0; i--) this.pts[i].slow = Math.max(this.pts[i].slow, this.pts[i + 1].slow * 0.9);
  }
  /**
   * The point s metres along, between the metre's two points (not the nearer of them: a car placed
   * on the points alone stood still for six frames then hopped a metre, and turned in steps).
   */
  at(s: number) {
    const n = this.pts.length - 1;
    const f = Math.max(0, Math.min(n, s));
    const i = Math.min(n - 1, Math.floor(f)),
      t = f - i;
    const a = this.pts[i],
      b = this.pts[i + 1];
    const tx = a.tx + (b.tx - a.tx) * t,
      tz = a.tz + (b.tz - a.tz) * t,
      l = Math.hypot(tx, tz) || 1;
    const o = this.tmp;
    o.x = a.x + (b.x - a.x) * t;
    o.z = a.z + (b.z - a.z) * t;
    o.tx = tx / l;
    o.tz = tz / l;
    o.slow = a.slow + (b.slow - a.slow) * t;
    return o;
  }
  private tmp = { x: 0, z: 0, tx: 1, tz: 0, slow: 0 };
}

/** A loop's marks: where it reaches the bridge's city end coming in, and where the tunnel is on the way back. */
interface Loop {
  path: Path;
  /** s at the bridge's city end (after the lead-in along Bay Road). */
  sIn: number;
  /** s just inside the tunnel's town end on the way back north. */
  sBack: number;
  /** s where it leaves the bridge at the city end (then the lead-out along Bay Road). */
  sOut: number;
}

interface Car {
  obj: THREE.Object3D;
  path: Path;
  loop: Loop;
  /** Metres right of the centre line (right-hand traffic: the lane). */
  lane: number;
  /** Its lane where it is now (easing to the lane the road gives it, never jumping across), how fast it drifts over, its height. */
  off: number;
  offV: number;
  y: number;
  s: number;
  /** Cruising speed (m/s), and the speed it is doing (braking, pulling away: never in one frame). */
  v: number;
  cur: number;
  len: number;
  x: number;
  z: number;
  yaw: number;
  /** Held by someone in its way (you, a walker, a wreck): for how long (s), and when it last honked (its wait then). */
  wait?: number;
  honked?: number;
  /**
   * Going round whoever held it (GTA-like: it waits, honks, then backs up a little if it is right on
   * them and pulls round within the road): the spot that held it (or the car), the offset it passes
   * at, the stage, how long it has been at it, how far it backed up.
   */
  dodge?: Dodge | null;
  /** How long it has stood still behind another car that stands still too (a gridlock's breaker), s. */
  jam?: number;
}

interface Dodge {
  bx: number;
  bz: number;
  /** Where whoever it goes round stood when it began (moved off from there, the going round is off). */
  ox: number;
  oz: number;
  /** The blocker's reach along the car's way (its tail past it: passed). */
  ea: number;
  car: Car | null;
  to: number;
  stage: "back" | "out" | "pass";
  t: number;
  backed: number;
}

/**
 * A blocker for the traffic: where; `wait` — give way to it, never go round it (the city's cars on
 * Bay Road); a car's body (yaw as the traffic's, half length, half width) — else a body's breadth.
 */
export interface TrafficBlocker {
  x: number;
  z: number;
  wait?: boolean;
  yaw?: number;
  hl?: number;
  hw?: number;
}

/** How far a blocker reaches along a car's way (fx, fz) and across it: its body's half extents, turned. */
export function reach(b: TrafficBlocker, fx: number, fz: number): [number, number] {
  if (b.hl === undefined || b.yaw === undefined) return [0.3, 0.3];
  const bx = Math.cos(b.yaw),
    bz = -Math.sin(b.yaw);
  const c = Math.abs(bx * fx + bz * fz),
    s = Math.abs(bx * fz - bz * fx);
  const hw = b.hw ?? 1;
  return [c * b.hl + s * hw, s * b.hl + c * hw];
}

/** Held this long by you (or a walker) in its way it honks; this long it goes round (s). */
const HONK_AFTER = 2.5,
  GO_ROUND_AFTER = 5;
const HONKS = ["BEEP!", "HONK!", "MOVE IT!", "COME ON!", "BEEP BEEP"];

/**
 * How far on a car is, comparable between loops where they share the road: along Bay Road in, metres
 * from the lead-in's start; off the bridge and down Bay Road out, metres past the way out; in between,
 * metres short of the way out.
 */
function rank(c: Car) {
  return c.s >= c.loop.sOut ? 2e5 + c.s - c.loop.sOut : c.s <= c.loop.sIn ? c.s : 1e5 - (c.loop.sOut - c.s);
}

/** Whether a car has b in its lane ahead (the same look as it keeps its gap with). */
function sees(a: Car, b: Car) {
  const fx = Math.cos(a.yaw),
    fz = -Math.sin(a.yaw);
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const along = dx * fx + dz * fz;
  return along > 0 && along < 18 && Math.abs(-dx * fz + dz * fx) < 1.5;
}

export class GoldenGate {
  readonly ok: boolean;
  private x = BAY.bridge.x;
  /** City end and headland end of the deck (z): the realistic bridge's (src/scene/real/bridge.ts). */
  private z0 = GG.z0;
  private z1 = GG.z1;
  /** The bridge itself (drawn here, not by the city's workers). */
  readonly bridge: THREE.Group | null = null;
  private cars: Car[] = [];
  readonly group = new THREE.Group();
  private spawnIn = 0;
  private loops: Loop[] = [];
  /** Who the traffic must not run over (the game's player, on foot or at the wheel; the city's cars on Bay Road — those to give way to). */
  blockers: () => TrafficBlocker[] = () => [];
  /** A horn at (x, z) (long: a lean on it). */
  onHorn: ((x: number, z: number, long: boolean) => void) | null = null;
  /**
   * Whether (x, z) is in the picture (in the camera's view, not far off): a car is never born nor
   * taken away there — they used to grow out of nothing at the bridge's city end, and shrink into it.
   */
  seen: (x: number, z: number) => boolean = () => false;

  constructor(scene: THREE.Object3D, city: City) {
    const lm = city.landmarks.get("bridge");
    this.ok = !!lm;
    if (!lm) return;
    this.group.name = "goldengate:traffic";
    scene.add(this.group);
    // the bridge: the deck's heights are its profile's (deckY), no voxel model to measure any more
    (this as { bridge: THREE.Group | null }).bridge = buildBridge();
    this.bridge!.name = "goldengate:bridge";
    scene.add(this.bridge!);
    // the loops round Orchard Keys: over the bridge, through the tunnel, round a few blocks, back
    const X = KX,
      [xW, , xV, xP, xS] = KGRID.xs,
      [zN, zC, zA, zD] = KGRID.zs;
    const start = this.z0;
    // (each loop comes in along Bay Road from the west, out of the city's traffic, and leaves along it
    // to the east: born and gone far down the road, not at the bridge's end in full view — and only
    // ever right turns there, onto the bridge and off it, so no loop's path crosses another's or the
    // city's other lane: from both sides, the left turns across the road met head-on and the bridge's
    // end locked solid, each car waiting for one that waited for it)
    const BR = ST.ringS,
      LEAD = 150;
    const loops = [
      [[X, start], [X, zN], [xS, zN], [xS, zD], [X, zD], [X, start]],
      [[X, start], [X, zD], [xW, zD], [xW, zN], [X, zN], [X, start]],
      [[X, start], [X, zC], [xP, zC], [xP, zD], [X, zD], [X, start]],
      [[X, start], [X, zA], [xW, zA], [xW, zC], [X, zC], [X, start]],
      [[X, start], [X, zN], [xV, zN], [xV, zA], [X, zA], [X, start]],
    ] as [number, number][][];
    loops.forEach((loop) => {
      const corners: [number, number][] = [[X - LEAD, BR], [X, BR], ...loop, [X, BR], [X + LEAD, BR]];
      const path = new Path(corners);
      // its marks, measured on the resampled path: the city end coming in and going out, the tunnel's town end
      let sIn = 0,
        sOut = path.length,
        sBack = path.length;
      for (let k = 0; k <= path.length; k++) {
        const q = path.at(k);
        if (sIn === 0 && Math.abs(q.x - X) < 1 && q.z >= start - 0.5) sIn = k;
      }
      for (let k = path.length; k >= 0; k--) {
        const q = path.at(k);
        if (Math.abs(q.x - X) < 1 && q.z >= start - 0.5) {
          sOut = k;
          break;
        }
      }
      for (let k = sOut; k >= sIn; k--) {
        const q = path.at(k);
        if (Math.abs(q.x - X) < 1 && q.z >= KTUNNEL.z1 - 6) {
          sBack = k;
          break;
        }
      }
      this.loops.push({ path, sIn, sBack, sOut });
    });
    // (a long bridge: a good many cars on it at once)
    for (let i = 0; i < 30; i++) this.spawn(true);
  }

  /** The road's height on the deck at z (Bay Road's asphalt at its city end, CURB off its length). */
  deckAt(z: number) {
    if (z > this.z1 || z < this.z0 - 1 || !this.ok) return CURB;
    return deckY(z);
  }

  /** Is (x, z) on the deck (between the railings: the walkways, the cycle lanes, the road)? */
  onDeck(x: number, z: number) {
    return this.ok && Math.abs(x - this.x) < walkHalf(z) && z > this.z0 - 1 && z < this.z1;
  }

  /** On foot: the deck's height there (the walkways a kerb up), or null. */
  groundAt(x: number, z: number) {
    if (!this.onDeck(x, z)) return null;
    const dx = Math.abs(x - this.x);
    // (the walkways a kerb up from the quay's kerb on; over the quay's pavement never under the kerb)
    const y = deckY(z) + (dx > GG.kerb && z >= GG.quay && z < GG.walkEnd ? 0.15 : 0);
    return z >= GG.quay && dx > GG.barrier ? Math.max(CURB, y) : y;
  }

  /** A traffic lane's centre (world x) at z along the bridge and the tunnel: lane 0 the inner, 1 the outer of the two the traffic uses. */
  laneX(z: number, south: boolean, lane: 0 | 1) {
    const off = laneAt(z, lane);
    return this.x + (south ? -off : off);
  }

  /** On foot on the deck: the road's barriers and the median stop a body (you go round by the ends). */
  footBlocked(x: number, z: number) {
    const dx = Math.abs(x - this.x);
    const rh = roadHalf(z);
    if (z > GG.quay + 0.5 && z < this.z1 - 1 && dx > rh - 0.05 && dx < rh + 0.6) return true;
    if (z > GG.quay + 8 && z < GG.narrowFrom - 1 && dx < GG.med + 0.25) return true;
    return false;
  }

  /** The road's height under a wheel on the way over: the deck, the headland's road, the tunnel, the town. */
  roadY(x: number, z: number) {
    if (this.onDeck(x, z)) return this.deckAt(z);
    if (corridor(x, z)) return z < KTUNNEL.z0 ? CURB + 0.02 : 0.03;
    return 0.01;
  }

  /**
   * At the wheel on the deck: kept between the railings (the deck is above anything the game's solid
   * shape sees: under it, the bay). True when (p) was the deck's to hold.
   */
  holdCar(p: THREE.Vector3, r: number) {
    if (!this.ok || Math.abs(p.x - this.x) > GG.edge + 2 || p.z < GG.quay || p.z > this.z1 + 0.5) return false;
    // between the carriageway's barriers, and either side of the median over the water
    const half = roadHalf(p.z) - r;
    let dx = Math.max(-half, Math.min(half, p.x - this.x));
    if (p.z > GG.quay + 8 && p.z < GG.narrowFrom - 1 && Math.abs(dx) < GG.med + r) dx = Math.sign(dx || 1) * (GG.med + r);
    p.x = this.x + dx;
    return true;
  }

  /** The traffic as boxes (centre, half sizes along x and z), for the cars and the walkers to hit. */
  *boxes(): Iterable<{ x: number; z: number; hx: number; hz: number; ref?: unknown; vx?: number; vz?: number; mass?: number }> {
    for (const c of this.cars) {
      const cs = Math.abs(Math.cos(c.yaw)),
        sn = Math.abs(Math.sin(c.yaw));
      // (with what the game needs to shove it: itself, its velocity, its weight)
      yield { x: c.x, z: c.z, hx: (cs * c.len + sn * 1.9) / 2, hz: (sn * c.len + cs * 1.9) / 2, ref: c, vx: Math.cos(c.yaw) * c.cur, vz: -Math.sin(c.yaw) * c.cur, mass: c.len > 6 ? 4.5 : 1.35 };
    }
  }

  /** A car knocked out of the bridge's traffic by the game: its body (out of the traffic's group) and kind, or null. */
  take(ref: unknown): { group: THREE.Group; kind: "sedan" | "taxi" | "truck" | "suv" | "sports" | "convertible" } | null {
    const i = this.cars.indexOf(ref as Car);
    if (i < 0) return null;
    const c = this.cars[i];
    this.cars.splice(i, 1);
    this.group.remove(c.obj);
    const g = new THREE.Group();
    g.position.copy(c.obj.position);
    g.rotation.set(0, c.yaw, 0);
    // (its body and its wheels straight in the group: the game's car steers the wheels)
    for (const ch of [...c.obj.children]) g.add(ch);
    const key = (c.obj.userData.kind as string) ?? "";
    return { group: g, kind: c.len > 6 ? "truck" : key === "taxi" ? "taxi" : key === "suv" || key === "sports" || key === "convertible" ? key : "sedan" };
  }

  /**
   * The road a car may use here going round something, as offsets (m right of its route's centre
   * line): over the water its own carriageway (median to barrier); in the headland's cut and the
   * tunnel the whole tube; on Bay Road its own side; in Orchard Keys' streets kerb to kerb (the left
   * of the centre is the oncoming lanes: only when nobody comes).
   */
  private room(p: { x: number; z: number }): [number, number] {
    const { x, z } = p;
    if (Math.abs(x - this.x) < 3 && z > GG.quay && z < GG.narrowFrom) return [GG.med + 1.3, roadHalf(z) - 1.3];
    if (Math.abs(x - this.x) < 3 && z >= GG.narrowFrom && z < KTUNNEL.z1 + 1) {
      const h = z < KTUNNEL.z0 ? roadHalf(z) : KTUNNEL.half;
      return [-(h - 1.3), h - 1.3];
    }
    if (z < this.z0 + 2) return [0.8, 5.5];
    const h = Math.abs(x - KX) < 8 || Math.abs(z - KGRID.zs[3]) < 8 ? 7 : 5;
    return [-(h - 1.2), h - 1.2];
  }

  /**
   * Where to pass whoever stands at (bx, bz): an offset `clear` m to its left or right, within the
   * road, into a band where no one is coming the other way (45 m on) nor alongside; the nearer of the
   * two to where the car is now. Null: no way round yet (it waits on).
   */
  private roundOffset(c: Car, p: { x: number; z: number; tx: number; tz: number }, bx: number, bz: number, clear: number, late = false, ea = 0.3): number | null {
    const nx = -p.tz,
      nz = p.tx;
    const bOff = (bx - p.x) * nx + (bz - p.z) * nz;
    // (how far on the going round reaches: past whoever it goes round, its own length and a little)
    const zone = (bx - c.x) * Math.cos(c.yaw) - (bz - c.z) * Math.sin(c.yaw) + ea + c.len / 2 + 2;
    const [lo, hi] = this.room(p);
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
        const moving = q.cur > 0.8;
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

  private spawn(anywhere = false) {
    const loop = this.loops[Math.floor(Math.random() * this.loops.length)];
    const path = loop.path;
    const r = Math.random();
    // (a car every second or two: each body meshed once and shared, not meshed again for every car
    // and left on the GPU once it had crossed)
    let obj: THREE.Group;
    let len = 4;
    if (r < 0.15) (obj = carObject("taxi", { paint: "#f2c230" })), (obj.userData.kind = "taxi");
    else if (r < 0.27) {
      const livery = ["#e8e4dc", "#2e5ab8", "#c0302e"][Math.floor(Math.random() * 3)];
      obj = carObject("truck", { livery, label: Math.random() < 0.5 ? "proof" : "depot" });
      len = 7;
    } else {
      const p = Math.floor(Math.random() * PAINTS.length);
      const kind = (["sedan", "sedan", "suv", "sports", "convertible", "sedan"] as const)[Math.floor(Math.random() * 6)];
      obj = carObject(kind, { paint: PAINTS[p][0], glow: kind === "sports" ? PAINTS[p][1] : undefined });
      obj.userData.kind = kind;
    }
    // (at the start, anywhere on its loop but where you see it; then out of sight down Bay Road, or —
    // half of them — out of the tunnel's dark heading north for the city: never in the picture)
    let s = -1;
    if (anywhere) {
      for (let k = 0; k < 6 && s < 0; k++) {
        const t = Math.random() * path.length;
        const q = path.at(t);
        if (!this.seen(q.x, q.z)) s = t;
      }
    } else {
      const tries = Math.random() < 0.5 ? [loop.sBack, 0] : [0, loop.sBack];
      for (const t of tries) {
        const q = path.at(t);
        const z = KTUNNEL.z1 - 5;
        // (out of the tunnel: not while you are by its mouth)
        if (t === loop.sBack && this.blockers().some((b) => Math.hypot(b.x - KX, b.z - z) < 70)) continue;
        if (!this.seen(q.x, q.z)) {
          s = t;
          break;
        }
      }
    }
    if (s < 0) return;
    const p = path.at(s);
    // a four-lane road (the bridge, the boulevard, the drive): kerb lane or fast lane; else the one lane
    const wide = Math.abs(p.x - KX) < 8 || Math.abs(p.z - KGRID.zs[3]) < 8 || p.z < KTUNNEL.z1;
    const lane = wide ? (Math.random() < 0.5 ? 1.1 : 3.2) : 1.9;
    const v = 9 + Math.random() * 4;
    const car: Car = { obj, path, loop, lane, off: NaN, offV: 0, y: NaN, s, v, cur: v * (1 - p.slow * 0.55), len, x: p.x, z: p.z, yaw: 0 };
    this.place(car, 0);
    for (const o of this.cars) if (Math.hypot(o.x - car.x, o.z - car.z) < 9) return;
    this.cars.push(car);
    this.group.add(obj);
  }

  /** Where the car is s along its path, in its lane, after dt seconds (dt 0: there at once). */
  private place(c: Car, dt: number) {
    const p = c.path.at(c.s);
    // (the lane follows the road: on the two-lane streets the outer lane eases in)
    const wide = Math.abs(p.x - KX) < 8 || Math.abs(p.z - KGRID.zs[3]) < 8 || p.z < KTUNNEL.z1;
    let lane = wide ? c.lane : Math.min(c.lane, 1.9);
    // over the bridge: the deck's own lanes (its inner two of three each way), easing into the tunnel's
    // (and through the headland's cut and the tunnel, out to Orchard Boulevard)
    if (Math.abs(p.x - this.x) < 3 && p.z > this.z0 - 2 && p.z < GG.tunnelEnd + 9) lane = laneAt(p.z, c.lane < 2 ? 0 : 1);
    // (going round someone: the offset it passes at)
    if (c.dodge && c.dodge.stage !== "back") lane = c.dodge.to;
    // (from one road's lane to the next's: drifting over at a lane change's pace — easing into the
    // drift and out of it — turned a little toward where it is going, not stepped sideways a metre
    // in one frame)
    const fresh = !(dt > 0) || Number.isNaN(c.off);
    if (fresh) (c.off = lane), (c.offV = 0);
    else {
      const want = Math.max(-1.8, Math.min(1.8, (lane - c.off) * 1.8));
      c.offV += Math.max(-3 * dt, Math.min(3 * dt, want - c.offV));
      c.off += c.offV * dt;
    }
    const side = Math.max(-0.3, Math.min(0.3, Math.atan2(c.offV, Math.max(2, c.cur))));
    c.x = p.x - p.tz * c.off;
    c.z = p.z + p.tx * c.off;
    c.yaw = Math.atan2(-p.tz, p.tx) - side;
    // (and up or down a kerb's height — the approach's road to the tunnel's floor — over a metre or
    // so of road, not in a frame)
    const y = this.roadY(c.x, c.z);
    if (fresh || Number.isNaN(c.y)) c.y = y;
    else c.y += Math.max(-(0.25 * c.cur * dt + 0.003), Math.min(0.25 * c.cur * dt + 0.003, y - c.y));
    // (a deck's slope is the deck's: never held under it or over it by more than a hand)
    if (Math.abs(y - c.y) > 0.25) c.y = y + Math.sign(c.y - y) * 0.25;
    c.obj.position.set(c.x, c.y, c.z);
    c.obj.rotation.set(0, c.yaw, 0);
  }

  update(dt: number) {
    if (!this.ok) return;
    // the deck's lamps, the cables' necklace, the aviation lights: by the evening's light
    bridgeNight(GLASS_NIGHT.value);
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.cars.length < 42) {
      this.spawnIn = 0.7 + Math.random() * 1.2;
      this.spawn();
    }
    const others = this.blockers();
    for (const c of this.cars) {
      const p = c.path.at(c.s);
      const fx = Math.cos(c.yaw),
        fz = -Math.sin(c.yaw);
      const d = c.dodge ?? null;
      // (the one it is going round: followed while it stands about; moved off, the going round is off)
      if (d && !d.car) {
        let near: TrafficBlocker | null = null;
        for (const o of others) if (!o.wait && Math.hypot(o.x - d.bx, o.z - d.bz) < 3) near = o;
        if (!near || Math.hypot(near.x - d.ox, near.z - d.oz) > 2) c.dodge = null;
        else (d.bx = near.x), (d.bz = near.z);
      } else if (d && d.car && !this.cars.includes(d.car)) c.dodge = null;
      if (c.dodge) c.dodge.t += dt;
      if (c.dodge && c.dodge.t > 16) c.dodge = null;
      // keep the gap to whatever is ahead in the lane (another car, you)
      let ahead = Infinity,
        front: Car | null = null;
      for (const o of this.cars) {
        if (o === c) continue;
        const dx = o.x - c.x,
          dz = o.z - c.z;
        const along = dx * fx + dz * fz,
          across = Math.abs(-dx * fz + dz * fx);
        // (the car it goes round: only while it is still square in front, close)
        if (c.dodge && c.dodge.car === o && !(along > 0 && along < (o.len + c.len) / 2 + 2.5 && across < 2)) continue;
        if (along > 0 && along < 18 && across < 1.5) {
          // (two that each have the other ahead — off the bridge side by side, nose to flank in the
          // turn — would wait for each other for ever, and the bridge behind them: the one further on goes)
          if (rank(c) > rank(o) && sees(o, c)) continue;
          const gap = along - (o.len + c.len) / 2;
          if (gap < ahead) (ahead = gap), (front = o);
        }
      }
      // (someone in its way: in front of its nose — not at its flank, side by side: it waited there for
      // ever beside a car stopped half a lane over)
      // (a car's body as its body: a car stopped across the road reaches into the lane well off its centre,
      // and is stopped short of by its tail, not its middle)
      let held: TrafficBlocker | null = null,
        heldAt = Infinity,
        heldReach: [number, number] = [0.3, 0.3];
      for (const o of others) {
        // (the one it goes round: only while its body is still square in front, close — it swings out, it doesn't drive into it)
        const going = !!c.dodge && !c.dodge.car && Math.hypot(o.x - c.dodge.bx, o.z - c.dodge.bz) < 3;
        const dx = o.x - c.x,
          dz = o.z - c.z;
        const along = dx * fx + dz * fz,
          across = Math.abs(-dx * fz + dz * fx);
        const [ea, ec] = reach(o, fx, fz);
        if (going && !(along > 0 && along < c.len / 2 + ea + 2.5 && across < 0.95 + ec + 0.1)) continue;
        // (across: its own half width and the blocker's — not a whole lane more: one in the next lane, side by side, is no blocker)
        if (along > c.len * 0.35 && along < 14 + ea && across < Math.max(1.7, 1.0 + ec)) {
          const gap = along - c.len / 2 - ea - 0.3;
          if (gap < heldAt) (heldAt = gap), (held = o), (heldReach = [ea, ec]);
        }
      }
      const byBlocker = heldAt < ahead;
      ahead = Math.min(ahead, heldAt);
      // (slowing for the corners ahead, stopping short of whoever is in front: the speed it may do
      // here, reached at a car's pace — 3 m/s² pulling away, up to 7 braking — not set each frame)
      const cruise = c.v * (1 - p.slow * 0.55);
      const room = Math.max(0, ahead - 2.2);
      let want = Math.min(cruise, Math.sqrt(2 * 5 * room), room < 0.05 ? 0 : Infinity);
      // held by you (or a walker, a wreck) — not by a car it gives way to: it waits, honks, then goes round
      if (byBlocker && held && !held.wait && c.cur < 0.4 && !c.dodge) {
        // (queued behind one that has just gone round you: it follows its lead, not a whole new wait)
        if (!c.wait && (c.jam ?? 0) > 1.5) (c.wait = GO_ROUND_AFTER - 1.2), (c.honked = c.wait);
        c.wait = (c.wait ?? 0) + dt;
        if (c.wait > HONK_AFTER && c.wait - (c.honked ?? -99) > 6) {
          c.honked = c.wait;
          this.onHorn?.(c.x, c.z, c.wait > 8);
          if (c.wait < HONK_AFTER + 1) sayAt(c.obj, HONKS[Math.floor(Math.random() * HONKS.length)], "honk", c.len > 6 ? 3.6 : 2.2, 1.4, 0.55);
        }
        // (long held — a junction full of cars waiting round you — it looks less far ahead before it goes)
        const late = c.wait > 12;
        if (c.wait > GO_ROUND_AFTER && (p.slow < 0.7 || late)) {
          const to = this.roundOffset(c, p, held.x, held.z, 0.95 + heldReach[1] + (late ? 0.35 : 0.6), late, heldReach[0]);
          if (to !== null) {
            c.dodge = { bx: held.x, bz: held.z, ox: held.x, oz: held.z, ea: heldReach[0], car: null, to, stage: heldAt < 2.6 ? "back" : "out", t: 0, backed: 0 };
            c.wait = 0;
          }
        }
      } else if (!byBlocker || !held) (c.wait = 0), (c.honked = -99);
      // a gridlock (no one in the way but cars that stand still too, a long while): the one behind goes round
      if (!byBlocker && front && c.cur < 0.2 && front.cur < 0.2) c.jam = (c.jam ?? 0) + dt;
      else c.jam = 0;
      if (!c.dodge && front && (c.jam ?? 0) > 20 && (front.jam ?? 0) + (front.wait ?? 0) > 20 && p.slow < 0.7) {
        const to = this.roundOffset(c, p, front.x, front.z, 2.6, false, front.len / 2);
        if (to !== null) {
          c.dodge = { bx: front.x, bz: front.z, ox: front.x, oz: front.z, ea: front.len / 2, car: front, to, stage: ahead < 2.6 ? "back" : "out", t: 0, backed: 0 };
          c.jam = 0;
        }
      }
      const dg = c.dodge ?? null;
      // backing up a little first (right on them: no room to pull round), if no one is close behind
      if (dg && dg.stage === "back") {
        let behind = false;
        for (const o of this.cars) {
          if (o === c) continue;
          const dx = o.x - c.x,
            dz = o.z - c.z;
          const along = dx * fx + dz * fz;
          if (along < 0 && along > -((o.len + c.len) / 2 + 1.5) && Math.abs(-dx * fz + dz * fx) < 1.8) behind = true;
        }
        for (const o of others) {
          const dx = o.x - c.x,
            dz = o.z - c.z;
          const along = dx * fx + dz * fz;
          const [ea, ec] = reach(o, fx, fz);
          if (along < 0 && along > -(c.len / 2 + ea + 1.5) && Math.abs(-dx * fz + dz * fx) < 1.4 + ec) behind = true;
        }
        const ddx = dg.bx - c.x,
          ddz = dg.bz - c.z;
        const gap = ddx * fx + ddz * fz - c.len / 2 - dg.ea;
        if (behind || gap > 3 || dg.backed > 3.5 || c.s < 2) dg.stage = "out";
        else {
          const back = Math.min(1.3, 0.4 + dg.backed) * dt;
          c.cur = -1.3;
          c.s -= back;
          dg.backed += back;
          this.place(c, dt);
          spinWheels(c.obj, -back);
          continue;
        }
      }
      if (dg && dg.stage === "out") {
        // (crawling out while it swings over: never into you)
        want = Math.min(want, 1.6);
        if (Math.abs(dg.to - c.off) < 0.6) dg.stage = "pass";
      } else if (dg && dg.stage === "pass") {
        want = Math.min(want, 6.5);
        // past them (well behind its tail): back to its lane
        const along = (dg.bx - c.x) * fx + (dg.bz - c.z) * fz;
        if (along < -(c.len / 2 + dg.ea + 1.5)) c.dodge = null;
      }
      if (c.cur < 0) c.cur = 0;
      c.cur = c.cur < want ? Math.min(want, c.cur + 3 * dt) : Math.max(want, c.cur - 7 * dt);
      // (and never into the one in front, whatever the braking: a car pulled in just ahead)
      const step = Math.min(c.cur * dt, Math.max(0, ahead - 1.6));
      c.s += step;
      this.place(c, dt);
      spinWheels(c.obj, step);
    }
    // gone down Bay Road once off the bridge and out of the picture (or at the lead-out's far end)
    this.cars = this.cars.filter((c) => {
      const gone = c.s >= c.path.length - 0.5 || (c.s > c.loop.sOut + 25 && !this.seen(c.x, c.z));
      if (gone) this.group.remove(c.obj);
      return !gone;
    });
  }
}
