import * as THREE from "three";
import type { Soundscape } from "../audio";
import { BlockBus } from "./bus";
import { Car, Scooter, Truck } from "./car";
import { CITY, CURB, DISTRICTS } from "./city/plan";
import type { CityTraffic } from "./citytraffic";
import type { Director } from "./director";
import type { Snark } from "./snark";
import type { Traffic } from "./traffic";
import { sayAt } from "./speech";

/**
 * Who's in the road, and what the traffic thinks of it. Anyone standing in front of a vehicle
 * (you, on foot; a jaywalker) makes it brake and honk, each with its own horn: the bus's two-tone,
 * a taxi's double beep, the scooter's meep, the police whoop. Stay there and it honks longer, then
 * the driver gets out, furious (a red anger mark, a grumble), has a word, and gets back in.
 * Now and then a resident jaywalks across the avenue, and gets the same treatment.
 */

type Kind = "bus" | "taxi" | "limo" | "car" | "truck" | "scooter" | "police";
interface Blocked {
  blocked: number;
  held: boolean;
}
interface State {
  last: number;
  honks: number;
  driver: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/** What a horn says, by vehicle. */
const HONK: Record<Kind, string[]> = {
  bus: ["HOOONK", "BWAAMP"],
  truck: ["BRAAAP", "HOOOOONK"],
  limo: ["HONNNK", "AHEM."],
  taxi: ["BEEP BEEP", "BIP BIP!"],
  car: ["BEEP!", "HONK!", "BEEEP"],
  scooter: ["MEEP MEEP", "MEEP!"],
  police: ["WEE-OO", "PULL OVER!"],
};
/** What a furious driver shouts. */
const SHOUT = ["GET OUT!", "WHAT ARE YOU DOING?!", "MOVE IT!", "ARE YOU BLIND?!", "I HAVE A BLOCK TO CATCH!", "THIS IS A ROAD!", "UNBELIEVABLE!"];
const SORRY = ["SORRY!", "RELAX!", "MY BAD", "I'M WALKING HERE!"];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Horns {
  private state = new WeakMap<object, State>();
  private clock = 0;
  private jaywalkers = new Set<Snark>();
  private nextJay = rand(20, 40);
  /** How much the player has annoyed the traffic (and the police); it fades with time. */
  annoyance = 0;
  /** Called when the police have had enough of the player. */
  onArrest: (() => void) | null = null;
  private arresting = false;

  constructor(
    private director: Director,
    private avenue: Traffic,
    private city: CityTraffic,
    private sound: Soundscape,
    /** The player on foot (null when not walking), and where the ear is. */
    private player: () => THREE.Vector3 | null,
    private ear: () => { pos: THREE.Vector3; right: THREE.Vector3 },
  ) {
    const people = () => {
      const out: { x: number; z: number }[] = [];
      const p = this.player();
      if (p) out.push({ x: p.x, z: p.z });
      for (const s of this.jaywalkers) out.push({ x: s.root.position.x, z: s.root.position.z });
      return out;
    };
    avenue.blockers = people;
    city.blockers = people;
  }

  private kindOf(mover: object): Kind {
    if (mover instanceof BlockBus) return "bus";
    if (mover instanceof Truck) return "truck";
    if (mover instanceof Scooter) return "scooter";
    if (mover instanceof Car) return mover.kind === "taxi" ? "taxi" : mover.kind === "limo" ? "limo" : "car";
    return "car";
  }

  /** Back from prison, or the police gave up. */
  pardoned() {
    this.annoyance = 0;
    this.arresting = false;
  }

  private annoy(k: number) {
    if (!this.player() || this.arresting) return;
    this.annoyance += k;
    if (this.annoyance >= 3) {
      this.arresting = true;
      this.onArrest?.();
    }
  }

  update(dt: number) {
    this.clock += dt;
    this.annoyance = Math.max(0, this.annoyance - dt / 90);
    for (const v of this.avenue.vehicles) this.check(v, v.mover.group, this.kindOf(v.mover));
    for (const m of this.city.movers) this.check(m, m.group, m.kind === "police" ? "police" : m.kind === "taxi" ? "taxi" : "car");
    this.nextJay -= dt;
    if (this.nextJay <= 0) {
      this.nextJay = rand(35, 80);
      void this.jaywalk();
    }
  }

  private check(v: Blocked, group: THREE.Object3D, kind: Kind) {
    let st = this.state.get(v);
    if (!st) this.state.set(v, (st = { last: -9, honks: 0, driver: false }));
    if (v.blocked <= 0) {
      if (this.clock - st.last > 4) st.honks = 0;
      return;
    }
    if (v.blocked > 0.5 && this.clock - st.last > (st.honks ? 2.4 : 0)) {
      st.last = this.clock;
      st.honks++;
      this.honk(kind, group.position, st.honks >= 2, group);
      // the jaywalker answers back
      if (st.honks === 1) for (const j of this.jaywalkers) if (j.root.position.distanceTo(group.position) < 8) j.say(pick(SORRY), 2, "talk");
    }
    // stay in front of it and the driver gets out
    // blocking the police car: they don't like that at all
    if (kind === "police" && v.blocked > 2.5 && st.honks === 2) {
      st.honks++;
      this.annoy(2);
    }
    if (v.blocked > 5.5 && !st.driver && kind !== "bus" && kind !== "scooter") {
      if (this.player()) this.annoy(1);
      st.driver = true;
      void this.driverOut(v, group).finally(() => setTimeout(() => (st!.driver = false), 6000));
    }
  }

  private where(p: THREE.Vector3) {
    const e = this.ear();
    const d = p.distanceTo(e.pos);
    return { level: Math.max(0, 1 - d / 75), pan: THREE.MathUtils.clamp(p.clone().sub(e.pos).dot(e.right) / 25, -1, 1) };
  }

  private honk(kind: Kind, at: THREE.Vector3, long: boolean, group?: THREE.Object3D) {
    const { level, pan } = this.where(at);
    this.sound.horn(kind, level, pan, long);
    if (group) sayAt(group, pick(HONK[kind]), "honk", kind === "bus" || kind === "truck" ? 3.6 : 2.2, long ? 2.2 : 1.4, 0.55);
  }

  private carOf(group: THREE.Object3D) {
    for (const v of this.avenue.vehicles) if (v.mover.group === group && v.mover instanceof Car) return v.mover;
    return null;
  }

  /** The driver steps out on the kerb side, fumes, has a word, and gets back in. */
  private async driverOut(v: Blocked, group: THREE.Object3D) {
    v.held = true;
    let s: Snark | null = null;
    try {
      s = await this.director.newSnark(1 + Math.floor(Math.random() * 10000));
      this.director.adopt(s);
      s.role = "Driver";
      // its right-hand side, in the car's frame (the cars face +x)
      const side = new THREE.Vector3(0, 0, 1.5).applyQuaternion(group.quaternion);
      const door = group.position.clone().add(side).setY(CURB);
      s.root.position.copy(door);
      s.noClip = true;
      // the door swings open, out they come
      const car = this.carOf(group);
      if (car) void car.openDoor();
      s.emote("angry", 3);
      s.say(pick(SHOUT), 2.6, "shout");
      this.sound.grumble(this.where(door).level);
      // up to whoever is in the way, a few words, back
      const target = this.player() ?? [...this.jaywalkers][0]?.root.position ?? null;
      if (target) {
        const to = door.clone().lerp(new THREE.Vector3(target.x, CURB, target.z), 0.55);
        await s.walk([to], 2.2);
        s.faceDir = new THREE.Vector3(target.x - to.x, 0, target.z - to.z).normalize();
      }
      await sleep(1600);
      s.emote("angry", 2.4);
      s.say(pick(SHOUT), 2.4, "shout");
      this.sound.grumble(this.where(s.root.position).level * 0.8);
      await sleep(2400);
      s.faceDir = null;
      await s.walk([door], 2.2);
      if (car) void car.closeDoor();
    } finally {
      if (s) this.director.release(s);
      v.held = false;
    }
  }

  /** A resident who can't be bothered with the zebra: straight across the avenue. */
  private async jaywalk() {
    const zebra = DISTRICTS[0].crossX;
    let x = 0;
    for (let k = 0; k < 10; k++) {
      x = rand(-44, 44);
      if (Math.abs(x - zebra) > 6 && Math.abs(Math.abs(x) - 24) > 5) break;
    }
    const south = Math.random() < 0.5;
    const from = new THREE.Vector3(x, CURB, south ? CITY.south.z0 + 1.2 : CITY.north.z1 - 1.2);
    const to = new THREE.Vector3(x + rand(-2, 2), CURB, south ? CITY.north.z1 - 1.2 : CITY.south.z0 + 1.2);
    let s: Snark;
    try {
      s = await this.director.newSnark(1 + Math.floor(Math.random() * 10000));
    } catch {
      return;
    }
    this.director.adopt(s);
    s.role = "Jaywalker";
    s.noClip = true;
    s.root.position.copy(from);
    this.jaywalkers.add(s);
    await s.walk([to], 1.05);
    this.jaywalkers.delete(s);
    if (Math.random() < 0.5) s.emote("?", 1.6);
    // and on along the pavement, out of sight
    await s.walk([to.clone().add(new THREE.Vector3(rand(-12, 12), 0, 0))], 1.3);
    this.director.release(s);
  }
}
