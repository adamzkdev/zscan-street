import * as THREE from "three";
import { CITY } from "./city";
import { TUNNEL } from "./city/plan";

/** Anything that drives: a body to move, a length, and wheels to turn by the distance covered. */
export interface Mover {
  group: THREE.Object3D;
  length: number;
  spin(distance: number): void;
}

export type LaneKey = "east" | "eastFast" | "west" | "westFast";
const LANES: Record<LaneKey, { z: number; dir: 1 | -1 }> = {
  east: { z: CITY.laneEast, dir: 1 },
  eastFast: { z: CITY.laneEastFast, dir: 1 },
  west: { z: CITY.laneWest, dir: -1 },
  westFast: { z: CITY.laneWestFast, dir: -1 },
};

const ACCEL = 3.2;
const BRAKE = 5.5;
/** Bumper-to-bumper distance kept in a queue. */
const GAP = 1.4;

/**
 * One vehicle on the avenue. It drives toward its next stop (or off the map), slowing for the
 * vehicle ahead in its lane, and resolves the promise when it has come to rest.
 */
export class Vehicle {
  x: number;
  v = 0;
  private target: number | null = null;
  private exitX: number | null = null;
  private arrived: (() => void) | null = null;
  gone = false;
  /** Seconds standing behind someone on the road (the player, a jaywalker). */
  blocked = 0;
  /** Held where it is (its driver got out). */
  held = false;

  constructor(
    readonly mover: Mover,
    readonly lane: LaneKey,
    x: number,
    readonly vmax = 11,
  ) {
    this.x = x;
    const l = LANES[lane];
    mover.group.position.set(x, 0, l.z);
    mover.group.rotation.y = l.dir > 0 ? 0 : Math.PI;
    mover.group.visible = Math.abs(x) < TUNNEL.hideBeyond;
  }

  get dir() {
    return LANES[this.lane].dir;
  }
  get laneZ() {
    return LANES[this.lane].z;
  }
  get front() {
    return this.x + (this.dir * this.mover.length) / 2;
  }
  get rear() {
    return this.x - (this.dir * this.mover.length) / 2;
  }
  get targetX() {
    return this.target;
  }

  get stopped() {
    return this.v < 0.05 && this.target !== null && Math.abs(this.target - this.x) < 0.08;
  }

  /** Drive and stop with the vehicle's centre at `x`. */
  stopAt(x: number): Promise<void> {
    this.target = x;
    this.exitX = null;
    this.arrived?.();
    return new Promise((r) => (this.arrived = r));
  }

  /** Drive on until past `x`, then disappear. */
  leaveTo(x: number): Promise<void> {
    this.target = null;
    this.exitX = x;
    this.arrived?.();
    return new Promise((r) => (this.arrived = r));
  }

  /** One step of the car-following model. `leader` is the next obstacle ahead in the lane. */
  step(dt: number, leader: { rear: number; v: number } | null) {
    const dir = this.dir;
    let want = this.vmax;
    if (this.target !== null) {
      const dist = (this.target - this.x) * dir;
      want = dist <= 0.02 ? 0 : Math.min(want, Math.sqrt(2 * BRAKE * 0.8 * Math.max(0, dist)));
    }
    if (leader) {
      const gap = (leader.rear - this.front) * dir - GAP;
      want = Math.min(want, gap <= 0 ? 0 : Math.sqrt(2 * BRAKE * 0.8 * gap) + leader.v * 0.5);
    }
    this.v = want > this.v ? Math.min(want, this.v + ACCEL * dt) : Math.max(want, this.v - BRAKE * dt);
    let dx = this.v * dt * dir;
    if (this.target !== null && (this.target - this.x - dx) * dir < 0) dx = this.target - this.x;
    this.x += dx;
    this.mover.group.position.x = this.x;
    // deep enough in a tunnel: gone from sight
    this.mover.group.visible = Math.abs(this.x) < TUNNEL.hideBeyond;
    this.mover.spin(Math.abs(dx));
    // a little nose dip under braking
    this.mover.group.rotation.z = -dir * THREE.MathUtils.clamp((want - this.v) * 0.004, -0.012, 0.012);
    if (this.arrived && this.target !== null && Math.abs(this.target - this.x) < 0.08 && this.v < 0.05) {
      const a = this.arrived;
      this.arrived = null;
      a();
    }
    if (this.exitX !== null && (this.x - this.exitX) * dir > 0) {
      this.gone = true;
      const a = this.arrived;
      this.arrived = null;
      a?.();
    }
  }
}

/** All vehicles on the avenue, two lanes, updated every frame. */
export class Traffic {
  readonly vehicles = new Set<Vehicle>();

  add(v: Vehicle) {
    this.vehicles.add(v);
    return v;
  }

  remove(v: Vehicle) {
    this.vehicles.delete(v);
  }

  /** Is there room to pull out at `x` in this lane? */
  clearAt(lane: LaneKey, x: number, len: number) {
    for (const v of this.vehicles) if (v.lane === lane && Math.abs(v.x - x) < (v.mover.length + len) / 2 + GAP) return false;
    return true;
  }

  /**
   * Zebra crossings on the avenue: `x` is the centre, `half` the half-width of the stripes, and
   * `busy()` says whether someone is on it (or stepping onto it).
   */
  readonly crossings: { x: number; half: number; busy: () => boolean }[] = [];

  /** People standing (or walking) in the road off the crossings: the player, jaywalkers. */
  blockers: () => { x: number; z: number }[] = () => [];

  /** The nearest blocker in this vehicle's lane, close ahead: a stop just short of them. */
  private blockerAhead(v: Vehicle, list: { x: number; z: number }[]) {
    let best: { rear: number; v: number } | null = null;
    for (const b of list) {
      if (Math.abs(b.z - v.laneZ) > 1.3) continue;
      const ahead = (b.x - v.front) * v.dir;
      if (ahead < -0.6 || ahead > 9 + v.v * 0.8) continue;
      const rear = b.x - v.dir * 0.9;
      if (!best || (rear - best.rear) * v.dir < 0) best = { rear, v: 0 };
    }
    return best;
  }

  /**
   * Nobody stops on a zebra: a vehicle that has not reached the crossing yet treats its near edge
   * as a stop line when someone is crossing, when the traffic beyond leaves no room to clear it,
   * or when its own stop would leave it standing on the stripes.
   */
  private stopLine(v: Vehicle, leader: Vehicle | null): { rear: number; v: number } | null {
    const dir = v.dir;
    let best: { rear: number; v: number } | null = null;
    for (const c of this.crossings) {
      const near = c.x - dir * (c.half + 0.5),
        far = c.x + dir * (c.half + 0.3);
      if ((near - v.front) * dir < -0.05) continue; // already over it: carry on
      let stop = c.busy();
      if (!stop && leader && (leader.rear - far) * dir < v.mover.length + GAP) stop = true;
      if (!stop && v.targetX !== null && (v.targetX - far) * dir < v.mover.length / 2) stop = true;
      if (stop && (!best || (near - best.rear) * dir < 0)) best = { rear: near, v: 0 };
    }
    return best;
  }

  /** Would someone stepping onto this crossing now be safe? (No vehicle on it or about to be.) */
  safeToCross(x: number, half: number) {
    for (const v of this.vehicles) {
      const lo = Math.min(v.front, v.rear),
        hi = Math.max(v.front, v.rear);
      if (hi > x - half - 0.3 && lo < x + half + 0.3) return false;
      const dist = (x - v.dir * (half + 0.5) - v.front) * v.dir;
      // a car waiting at the stripes gets its turn: nobody steps out in front of it
      if (dist > -0.05 && dist < (v.v * v.v) / (2 * BRAKE * 0.7) + 4) return false;
    }
    return true;
  }

  update(dt: number) {
    const people = this.blockers();
    for (const lane of Object.keys(LANES) as LaneKey[]) {
      const dir = LANES[lane].dir;
      // front of the queue first
      const list = [...this.vehicles].filter((v) => v.lane === lane).sort((a, b) => (b.x - a.x) * dir);
      list.forEach((v, i) => {
        const leader = i > 0 ? list[i - 1] : null;
        const line = this.stopLine(v, leader);
        let obstacle: { rear: number; v: number } | null = leader;
        if (line && (!obstacle || (line.rear - obstacle.rear) * dir < 0)) obstacle = line;
        const person = this.blockerAhead(v, people);
        if (person && (!obstacle || (person.rear - obstacle.rear) * dir < 0)) obstacle = person;
        // someone in the way, close: it counts (for the horn)
        v.blocked = person && Math.abs(person.rear - v.front) < 3.5 && v.v < 1 ? v.blocked + dt : 0;
        if (v.held) obstacle = { rear: v.front + dir * 0.01, v: 0 };
        v.step(dt, obstacle);
      });
    }
    for (const v of [...this.vehicles]) if (v.gone) this.vehicles.delete(v);
  }
}
