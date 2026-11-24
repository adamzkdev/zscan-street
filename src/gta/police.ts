import * as THREE from "three";
import { carObject, POLICE_BAR } from "../scene/real/cars";
import type { Roads } from "./roads";
import { DriveCar, type CarWorld } from "./vehicle";

/**
 * Exposure (src/gta): the city's wanted level. Crash into the traffic, steal a cruiser, flash a
 * speed camera too fast, and you are EXPOSED, one to three stars: police cruisers come for you,
 * driven by the same car model as yours, lights and sirens. Get far away from all of them and keep
 * out of their sight for a while and you are SHIELDED again; let one pin you down and you are
 * BUSTED (the street's own arrest: a night on the rock).
 */

const LOSE = 150;

interface Chaser {
  car: DriveCar;
  bar: THREE.Mesh[];
  stuck: number;
  back: number;
  /** The way by the streets, asked again every second or so. */
  path: { x: number; z: number }[];
  replan: number;
  /** Braking for a turn ahead. */
  corner: boolean;
}

export interface HeatHost {
  scene: THREE.Scene;
  roads: Roads;
  toast(title: string, sub?: string, tone?: "gold" | "teal" | "bad"): void;
  busted(): void;
  /** Inside a building's footprint (the line of sight is cut). */
  wall(x: number, z: number): boolean;
}

export class Heat {
  /** 0 … 3 (stars, fractional while it rises). */
  level = 0;
  readonly chasers: Chaser[] = [];
  /** Seconds out of every chaser's reach. */
  private hidden = 0;
  /** Seconds pinned down by one. */
  private pinned = 0;
  private flash = 0;
  private cool = 0;

  constructor(private host: HeatHost) {}

  get stars() {
    return Math.min(3, Math.ceil(this.level - 0.05));
  }

  /** Something the city saw: raises the level (a fraction of a star, or more). */
  raise(by: number, why: string) {
    if (this.cool > 0) return;
    const was = this.stars;
    this.level = Math.min(3, this.level + by);
    this.hidden = 0;
    if (this.stars > was) this.host.toast(`Exposed ${"★".repeat(this.stars)}`, why, "bad");
  }

  /** Every police car the game drives, for the collisions. */
  *boxes() {
    for (const c of this.chasers) {
      const p = c.car.group.position;
      const cs = Math.abs(Math.cos(c.car.yaw)),
        sn = Math.abs(Math.sin(c.car.yaw));
      yield { x: p.x, z: p.z, hx: (cs * c.car.spec.len + sn * c.car.spec.wid) / 2.2, hz: (sn * c.car.spec.len + cs * c.car.spec.wid) / 2.2 };
    }
  }

  /** Is (x, z) near a chaser (it was hit by you)? */
  near(x: number, z: number, r: number) {
    return this.chasers.some((c) => Math.hypot(c.car.group.position.x - x, c.car.group.position.z - z) < r);
  }

  update(dt: number, me: { x: number; z: number; vx: number; vz: number; speed: number; inCar: boolean }, world: (self: DriveCar) => CarWorld) {
    this.cool = Math.max(0, this.cool - dt);
    this.flash += dt;
    const want = this.stars;
    // the cruisers come, one per star
    if (want > this.chasers.length) this.spawn(me);
    let nearest = Infinity;
    for (const c of [...this.chasers]) {
      const p = c.car.group.position;
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      nearest = Math.min(nearest, d);
      // stood down: gone once out of sight
      if (want === 0 && d > 60) {
        this.remove(c);
        continue;
      }
      this.drive(dt, c, me, d, world(c.car));
      const on = Math.floor(this.flash * 6) % 2 === 0;
      c.bar[0].visible = on;
      c.bar[1].visible = !on;
    }
    if (want === 0) return nearest;
    // out of their reach long enough: a star comes off, then the next
    if (nearest > LOSE) {
      this.hidden += dt;
      if (this.hidden > 9) {
        this.hidden = 0;
        this.level = Math.max(0, Math.ceil(this.level - 0.05) - 1);
        if (this.level === 0) this.host.toast("Shielded", "they lost you", "teal");
        else this.host.toast(`Exposed ${"★".repeat(this.stars)}`, "they are losing you");
      }
    } else this.hidden = Math.max(0, this.hidden - dt * 0.5);
    // pinned: a cruiser right by you while you are (nearly) stopped
    if (nearest < 8 && me.speed < 2.5) {
      this.pinned += dt;
      if (this.pinned > 2.2) {
        this.pinned = 0;
        this.clear();
        this.host.busted();
      }
    } else this.pinned = Math.max(0, this.pinned - dt);
    return nearest;
  }

  /** How long until busted (0…1), for the HUD. */
  get pin() {
    return Math.min(1, this.pinned / 2.2);
  }

  /** How close to losing them (0…1). */
  get losing() {
    return Math.min(1, this.hidden / 9);
  }

  private spawn(me: { x: number; z: number; vx: number; vz: number }) {
    // on a road a block or two away, behind you if possible
    const pts = this.host.roads.midpoints(22).filter((p) => {
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      return d > 70 && d < 130;
    });
    if (!pts.length) return;
    const back = pts.filter((p) => (p.x - me.x) * me.vx + (p.z - me.z) * me.vz < 0);
    const list = back.length ? back : pts;
    const p = list[Math.floor(Math.random() * list.length)];
    const group = new THREE.Group();
    for (const c of [...carObject("police", { paint: "#141418", accent: "#f2f2ee" }).children]) group.add(c);
    const bar: THREE.Mesh[] = [];
    for (const [z, c] of [
      [-0.32, "#ff2a2a"],
      [0.32, "#2a6aff"],
    ] as const) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3.4), toneMapped: false }));
      lamp.position.set(POLICE_BAR.x, POLICE_BAR.y, z);
      lamp.scale.set(0.45, 0.6, 1.1);
      group.add(lamp);
      bar.push(lamp);
    }
    const car = new DriveCar("police", group);
    const yaw = p.axis === "x" ? (me.x > p.x ? 0 : Math.PI) : me.z > p.z ? -Math.PI / 2 : Math.PI / 2;
    car.place(p.x, p.z, yaw);
    car.lamps = true;
    this.host.scene.add(car.group);
    this.chasers.push({ car, bar, stuck: 0, back: 0, path: [], replan: 0, corner: false });
  }

  /** The cruiser's driver: at you, leading a little, round what is in the way. */
  private drive(dt: number, c: Chaser, me: { x: number; z: number; vx: number; vz: number; speed: number }, d: number, world: CarWorld) {
    const car = c.car;
    const p = car.group.position;
    const lead = Math.min(1.2, d / 30);
    let tx = me.x + me.vx * lead,
      tz = me.z + me.vz * lead;
    // in sight and near: straight at you; else along the streets
    if (d > 30 || !this.sight(p.x, p.z, me.x, me.z)) {
      c.replan -= dt;
      if (c.replan <= 0 || !c.path.length) {
        c.replan = 1.2;
        c.path = this.host.roads.route(p.x, p.z, me.x, me.z);
      }
      while (c.path.length > 1 && Math.hypot(c.path[0].x - p.x, c.path[0].z - p.z) < 4) c.path.shift();
      const w = c.path[0];
      if (w) (tx = w.x), (tz = w.z);
      // a turn at the next junction: slow for it
      const n = c.path[1];
      if (w && n) {
        const a1 = Math.atan2(w.z - p.z, w.x - p.x),
          a2 = Math.atan2(n.z - w.z, n.x - w.x);
        const turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
        const left = Math.hypot(w.x - p.x, w.z - p.z);
        if (turn > 0.6 && left < 6 + car.speed * 1.4 && car.speed > 10) c.corner = true;
        else c.corner = false;
      }
    } else c.corner = false;
    const want = Math.atan2(-(tz - p.z), tx - p.x);
    let diff = want - car.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    let steer = THREE.MathUtils.clamp(-diff * 2.2, -1, 1);
    let throttle = Math.abs(diff) < 1.3 ? 1 : 0.55;
    let brake = 0;
    // a corner ahead: brake into it
    if ((Math.abs(diff) > 0.6 && car.speed > 14) || c.corner) (throttle = 0), (brake = 0.8);
    // close in and stop beside you (a car you are in is rammed a little)
    const slow = Math.max(me.speed + 1, (d - 4.5) * 1.3);
    if (d < 22 && car.speed > slow) (throttle = 0), (brake = Math.min(1, (car.speed - slow) / 6 + 0.3));
    if (d < 7 && me.speed < 3) (throttle = 0), (brake = 1);
    // stuck against something: back out, wheel the other way
    if (car.speed < 1 && throttle > 0.5 && d > 12) c.stuck += dt;
    else c.stuck = Math.max(0, c.stuck - dt);
    if (c.stuck > 1) (c.back = 1.4), (c.stuck = 0);
    if (c.back > 0) {
      c.back -= dt;
      throttle = 0;
      brake = 1;
      steer = -steer;
    }
    car.update(dt, { throttle, brake, steer, handbrake: Math.abs(diff) > 1.5 && car.speed > 12, nitro: d > 70 && Math.abs(diff) < 0.3 }, world);
  }

  /** No building between (x0, z0) and (x1, z1)? */
  private sight(x0: number, z0: number, x1: number, z1: number) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 2; s < d; s += 2) {
      const k = s / d;
      if (this.host.wall(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k)) return false;
    }
    return true;
  }

  private remove(c: Chaser) {
    this.chasers.splice(this.chasers.indexOf(c), 1);
    c.car.dispose();
  }

  /** All off: busted, or the game left. */
  clear() {
    this.level = 0;
    this.hidden = this.pinned = 0;
    this.cool = 6;
    for (const c of [...this.chasers]) this.remove(c);
  }
}
