import * as THREE from "three";
import type { City } from "./city";
import { BAY, CURB } from "./city/plan";
import { corridor, KGRID, KTUNNEL, KX } from "./keys/plan";
import { carObject, spinWheels } from "./real/cars";
import { bridgeNight, buildBridge, deckY, GG, laneAt, roadHalf, walkHalf } from "./real/bridge";
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
  at(s: number) {
    const i = Math.max(0, Math.min(this.pts.length - 1, Math.floor(s)));
    return this.pts[i];
  }
}

interface Car {
  obj: THREE.Object3D;
  path: Path;
  /** Metres right of the centre line (right-hand traffic: the lane). */
  lane: number;
  s: number;
  v: number;
  len: number;
  x: number;
  z: number;
  yaw: number;
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
  private paths: Path[] = [];
  /** Who the traffic must not run over (the game's player, on foot or at the wheel). */
  blockers: () => { x: number; z: number }[] = () => [];

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
    for (const loop of [
      [[X, start], [X, zN], [xS, zN], [xS, zD], [X, zD], [X, start]],
      [[X, start], [X, zD], [xW, zD], [xW, zN], [X, zN], [X, start]],
      [[X, start], [X, zC], [xP, zC], [xP, zD], [X, zD], [X, start]],
      [[X, start], [X, zA], [xW, zA], [xW, zC], [X, zC], [X, start]],
      [[X, start], [X, zN], [xV, zN], [xV, zA], [X, zA], [X, start]],
    ] as [number, number][][])
      this.paths.push(new Path(loop));
    for (let i = 0; i < 16; i++) this.spawn(true);
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
      yield { x: c.x, z: c.z, hx: (cs * c.len + sn * 1.9) / 2, hz: (sn * c.len + cs * 1.9) / 2, ref: c, vx: Math.cos(c.yaw) * c.v, vz: -Math.sin(c.yaw) * c.v, mass: c.len > 6 ? 4.5 : 1.35 };
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

  private spawn(anywhere = false) {
    const path = this.paths[Math.floor(Math.random() * this.paths.length)];
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
    const s = anywhere ? Math.random() * path.length : 0;
    const p = path.at(s);
    // a four-lane road (the bridge, the boulevard, the drive): kerb lane or fast lane; else the one lane
    const wide = Math.abs(p.x - KX) < 8 || Math.abs(p.z - KGRID.zs[3]) < 8 || p.z < KTUNNEL.z1;
    const lane = wide ? (Math.random() < 0.5 ? 1.1 : 3.2) : 1.9;
    const car: Car = { obj, path, lane, s, v: 9 + Math.random() * 4, len, x: p.x, z: p.z, yaw: 0 };
    this.place(car);
    for (const o of this.cars) if (Math.hypot(o.x - car.x, o.z - car.z) < 9) return;
    this.cars.push(car);
    this.group.add(obj);
  }

  private place(c: Car) {
    const p = c.path.at(c.s);
    // (the lane follows the road: on the two-lane streets the outer lane eases in)
    const wide = Math.abs(p.x - KX) < 8 || Math.abs(p.z - KGRID.zs[3]) < 8 || p.z < KTUNNEL.z1;
    let lane = wide ? c.lane : Math.min(c.lane, 1.9);
    // over the bridge: the deck's own lanes (its inner two of three each way), easing into the tunnel's
    // (and through the headland's cut and the tunnel, out to Orchard Boulevard)
    if (Math.abs(p.x - this.x) < 3 && p.z > this.z0 - 2 && p.z < GG.tunnelEnd + 9) lane = laneAt(p.z, c.lane < 2 ? 0 : 1);
    c.x = p.x - p.tz * lane;
    c.z = p.z + p.tx * lane;
    c.yaw = Math.atan2(-p.tz, p.tx);
    c.obj.position.set(c.x, this.roadY(c.x, c.z), c.z);
    c.obj.rotation.set(0, c.yaw, 0);
  }

  update(dt: number) {
    if (!this.ok) return;
    // the deck's lamps, the cables' necklace, the aviation lights: by the evening's light
    bridgeNight(GLASS_NIGHT.value);
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.cars.length < 26) {
      this.spawnIn = 1.1 + Math.random() * 1.8;
      this.spawn();
    }
    const others = this.blockers();
    for (const c of this.cars) {
      const p = c.path.at(c.s);
      const fx = Math.cos(c.yaw),
        fz = -Math.sin(c.yaw);
      // keep the gap to whatever is ahead in the lane (another car, you)
      let ahead = Infinity;
      for (const o of this.cars) {
        if (o === c) continue;
        const dx = o.x - c.x,
          dz = o.z - c.z;
        const along = dx * fx + dz * fz,
          across = Math.abs(-dx * fz + dz * fx);
        if (along > 0 && along < 18 && across < 1.5) ahead = Math.min(ahead, along - (o.len + c.len) / 2);
      }
      for (const o of others) {
        const dx = o.x - c.x,
          dz = o.z - c.z;
        const along = dx * fx + dz * fz,
          across = Math.abs(-dx * fz + dz * fx);
        if (along > 0 && along < 14 && across < 1.7) ahead = Math.min(ahead, along - c.len / 2 - 0.6);
      }
      const cruise = c.v * (1 - p.slow * 0.55);
      const want = ahead < 2.5 ? 0 : ahead < 9 ? cruise * ((ahead - 2.5) / 6.5) : cruise;
      c.s += want * dt;
      this.place(c);
      spinWheels(c.obj, want * dt);
      // the city end: they come in from (and go out to) the ring road, growing in/out of view
      const fade = Math.min(1, c.s / 4, (c.path.length - c.s) / 4);
      c.obj.scale.setScalar(Math.max(0.01, fade));
    }
    this.cars = this.cars.filter((c) => {
      const gone = c.s >= c.path.length - 0.5;
      if (gone) this.group.remove(c.obj);
      return !gone;
    });
  }
}
