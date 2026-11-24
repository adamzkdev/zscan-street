import * as THREE from "three";
import { freeObject } from "../scene/voxel/mesher";
import { VOX } from "../scene/voxel/model";
import { GT_SPEC, MOTO_SPEC } from "./models";
import { bikeObject, carObject, type CarKind } from "../scene/real/cars";
import { bikeStyle, gtStyle, tintRims } from "./store";

/**
 * A car you drive (src/gta): an arcade model, tuned for feel rather than truth, as the open-world
 * games do. Two speeds per axis: along the car (engine, brakes, drag) and across it (the tyres'
 * grip pulls it back to zero; the handbrake lets go of it: a drift). The yaw follows a bicycle
 * model of the steering with a little lag. Collisions push the car out of the street's obstacles
 * (scene/nav.ts) with three circles along its length, and bounce it off.
 */

export type VehicleKind = "gt" | "moto" | "scooter" | "sedan" | "taxi" | "police" | "truck" | "sports" | "suv" | "pickup" | "van" | "convertible" | "limo" | "ambulance";

interface Spec {
  name: string;
  /** Acceleration from rest (m/s²) and top speed (m/s). */
  accel: number;
  vmax: number;
  /** Sideways grip (1/s) and how quickly it turns in. */
  grip: number;
  turn: number;
  /** Length and width (m), wheel radius and the wheels' x (voxels from the back) and model length (voxels). */
  len: number;
  wid: number;
  wheelR: number;
  wheels: [number, number];
  vox: number;
  /** Track (voxels): the wheels' z from the middle. */
  track: number;
  gears: number;
  /** Two wheels: one per axle, and it leans into the turns. */
  bike?: boolean;
  /** For the crashes: how hard it is to shove (tonnes, more or less). */
  mass: number;
}

export const SPECS: Record<VehicleKind, Spec> = {
  gt: { name: "ZK-GT", accel: 11, vmax: 50, grip: 8.5, turn: 1, len: GT_SPEC.w * VOX, wid: GT_SPEC.d * VOX, wheelR: 0.32, wheels: [6, 21], vox: 27, track: 5.1, gears: 7, mass: 1.5 },
  moto: { name: "ZK-R motorbike", accel: 12.5, vmax: 54, grip: 9.5, turn: 1, len: MOTO_SPEC.w * VOX, wid: 0.85, wheelR: 0.33, wheels: [2.5, 11.5], vox: MOTO_SPEC.w, track: 0, gears: 6, bike: true, mass: 0.35 },
  sedan: { name: "Sedan", accel: 7, vmax: 40, grip: 7.5, turn: 0.9, len: 4, wid: 11 * VOX, wheelR: 0.3, wheels: [5, 18], vox: 24, track: 4.6, gears: 5, mass: 1.3 },
  taxi: { name: "Taxi", accel: 6.5, vmax: 38, grip: 7.5, turn: 0.9, len: 4.5, wid: 11 * VOX, wheelR: 0.3, wheels: [5, 21], vox: 27, track: 4.6, gears: 5, mass: 1.4 },
  police: { name: "Police cruiser", accel: 8.5, vmax: 47, grip: 8, turn: 0.95, len: 26 * VOX, wid: 11 * VOX, wheelR: 0.3, wheels: [5, 20], vox: 26, track: 4.6, gears: 6, mass: 1.7 },
  truck: { name: "Box truck", accel: 4.2, vmax: 27, grip: 6, turn: 0.7, len: 7, wid: 2.1, wheelR: 0.34, wheels: [8, 34], vox: 42, track: 5, gears: 5, mass: 4.5 },
  // the street's other cars (scene/voxel/vehicles.ts): yours when you take one
  sports: { name: "Sports car", accel: 10, vmax: 52, grip: 9, turn: 1, len: 26 * VOX, wid: 11 * VOX, wheelR: 0.3, wheels: [5, 20], vox: 26, track: 4.6, gears: 6, mass: 1.3 },
  suv: { name: "SUV", accel: 7, vmax: 40, grip: 7, turn: 0.85, len: 27 * VOX, wid: 12 * VOX, wheelR: 0.36, wheels: [5, 21], vox: 27, track: 5.1, gears: 5, mass: 2 },
  pickup: { name: "Pickup", accel: 6.5, vmax: 38, grip: 6.8, turn: 0.8, len: 30 * VOX, wid: 12 * VOX, wheelR: 0.36, wheels: [5, 24], vox: 30, track: 5.1, gears: 5, mass: 2.2 },
  van: { name: "Van", accel: 5, vmax: 32, grip: 6.3, turn: 0.75, len: 31 * VOX, wid: 12 * VOX, wheelR: 0.34, wheels: [5, 25], vox: 31, track: 5.1, gears: 5, mass: 2.6 },
  convertible: { name: "Convertible", accel: 8, vmax: 44, grip: 8, turn: 0.95, len: 25 * VOX, wid: 11 * VOX, wheelR: 0.3, wheels: [5, 19], vox: 25, track: 4.6, gears: 6, mass: 1.3 },
  // the avenue's limousine, the ambulance, the couriers' scooters: yours too when you take one
  limo: { name: "Limousine", accel: 6, vmax: 38, grip: 7, turn: 0.7, len: 7.6, wid: 1.95, wheelR: 0.33, wheels: [5, 41], vox: 46, track: 4.8, gears: 5, mass: 2.6 },
  ambulance: { name: "Ambulance", accel: 6.5, vmax: 40, grip: 6.8, turn: 0.8, len: 5.6, wid: 2.1, wheelR: 0.36, wheels: [5, 28], vox: 34, track: 5.1, gears: 5, mass: 2.8 },
  scooter: { name: "Delivery scooter", accel: 7.5, vmax: 24, grip: 8.5, turn: 1.1, len: 2.0, wid: 0.7, wheelR: 0.21, wheels: [2, 10], vox: 12, track: 0, gears: 1, bike: true, mass: 0.22 },
};

const TYRE = new THREE.MeshStandardMaterial({ color: "#121216", roughness: 0.85 });
const RIM = new THREE.MeshStandardMaterial({ color: "#d9a21e", roughness: 0.3, metalness: 0.9 });
const WHEEL_GEO = new THREE.CylinderGeometry(1, 1, 1, 18);
const RIM_GEO = new THREE.CylinderGeometry(0.62, 0.62, 1.04, 12);
for (const x of [TYRE, RIM, WHEEL_GEO, RIM_GEO]) x.userData.shared = true;
/** The lamps' pool of light on the road at night (a soft additive patch, no real light). */
const BEAM_TEX = (() => {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 120, 4, 32, 70, 70);
  grad.addColorStop(0, "rgba(255,244,214,0.9)");
  grad.addColorStop(0.5, "rgba(255,236,190,0.35)");
  grad.addColorStop(1, "rgba(255,230,180,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  return t;
})();
const BEAM_MAT = new THREE.MeshBasicMaterial({ map: BEAM_TEX, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 });
BEAM_MAT.userData.shared = true;

export interface DriveIn {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  nitro: boolean;
}

export interface Hit {
  /** Speed into the obstacle (m/s) and where. */
  speed: number;
  x: number;
  z: number;
  what: "wall" | "car";
}

/** What the car needs from the street. */
export interface CarWorld {
  /** Push a circle out of the static obstacles (nav.resolve). */
  resolve(p: THREE.Vector3, r: number): void;
  /** Outside the board (the city's edge)? */
  outside(x: number, z: number): boolean;
  /** The surface height under a wheel. */
  surface(x: number, z: number): number;
  /**
   * Other vehicles as boxes (centre, half sizes along x and z). Those that can be shoved carry a
   * `ref` (and their velocity and mass): a touch is noted in `contacts` and the game trades the
   * momentum (no wall's bounce off them).
   */
  boxes(): Iterable<CarBox>;
}

export interface CarBox {
  x: number;
  z: number;
  hx: number;
  hz: number;
  ref?: unknown;
  vx?: number;
  vz?: number;
  mass?: number;
}

/** A touch with something that can be shoved: who, the normal from it to the car, where. */
export interface Contact {
  ref: unknown;
  box: CarBox;
  nx: number;
  nz: number;
  x: number;
  z: number;
}

const tmp = new THREE.Vector3();

export class DriveCar {
  readonly group: THREE.Group;
  readonly kind: VehicleKind;
  readonly spec: Spec;
  /** Heading: the model's +x turned by this about +y (the street's convention). */
  yaw = 0;
  vel = new THREE.Vector2();
  /** Speed along the car (m/s, + forward) and across it. */
  vF = 0;
  vR = 0;
  private yawRate = 0;
  private steerNow = 0;
  /** The body (pitch and roll on the springs) inside the group, and the wheels. */
  private body: THREE.Object3D;
  private wheels: { m: THREE.Object3D; front: boolean; r: number }[] = [];
  private beam: THREE.Mesh;
  private y = 0;
  private vy = 0;
  private lastGround = 0;
  private lastStep = 0;
  private pitch = 0;
  private roll = 0;
  /** Nitrous left (0…1), refilling slowly. */
  nos = 1;
  nosOn = false;
  drifting = 0;
  /** RPM (0…1) and the gear, for the dial and the engine's sound. */
  rpm = 0;
  gear = 1;
  private shiftT = 0;
  /** A damage counter (dents, smoke past 0.7). */
  damage = 0;
  /** The body taken over from the traffic is not ours to share-free. */
  private own: boolean;
  /** The last hit this frame, read by the game. */
  hit: Hit | null = null;
  /** What it touched this frame that can be shoved (the game trades the momentum). */
  contacts: Contact[] = [];
  /** Knocked about: seconds of sliding and spinning on its own (the tyres let go). */
  stun = 0;
  /** Lit lamps at night. */
  lamps = false;

  /** `bike`: a bike's own paint (a stranger's ZK-R about town); without it, yours from the store. */
  constructor(kind: VehicleKind, from?: THREE.Group, bike?: { paint: string; accent: string }) {
    this.kind = kind;
    this.spec = SPECS[kind];
    this.own = !from;
    const bikeArg = bike;
    if (from) {
      // a car taken from the traffic: its group (the body, a police light bar) carries on
      this.group = from;
      this.body = from;
      this.yaw = from.rotation.y;
      // its body goes in a pivot of its own so it can lean (its wheels stay on the road, they steer;
      // a bike's lean with it)
      const pivot = new THREE.Group();
      pivot.name = "gta:pivot";
      for (const c of [...from.children]) if (c.name !== "wheel" || SPECS[kind].bike) pivot.add(c);
      from.add(pivot);
      this.body = pivot;
    } else if (kind === "moto" || kind === "scooter") {
      // the ZK-R (or a scooter): body and wheels lean together
      this.group = new THREE.Group();
      this.body = new THREE.Group();
      this.body.name = "gta:pivot";
      // (the ZK-R in the paint bought at the store: store.ts)
      const bike = kind === "moto" ? bikeObject("moto", bikeArg ?? bikeStyle()) : bikeObject("scooter", { paint: "#2e5ab8", accent: "#ffffff" });
      for (const c of [...bike.children]) this.body.add(c);
      this.group.add(this.body);
    } else {
      // your own car: the realistic model, its body in the leaning pivot, its wheels on the road
      this.group = new THREE.Group();
      this.body = new THREE.Group();
      this.body.name = "gta:pivot";
      // (the ZK-GT as you have it at the store: paint, neon, rims — store.ts)
      const st = kind === "gt" ? gtStyle() : null;
      const car = carObject(kind === "gt" ? "gt" : (kind as CarKind), st ? { paint: st.paint, accent: st.accent, ...(st.glow ? { glow: st.glow } : {}), ...(st.finish ? { finish: st.finish } : {}) } : {});
      if (st) tintRims(car, st.rims);
      for (const c of [...car.children]) (c.name === "wheel" ? this.group : this.body).add(c);
      this.group.add(this.body);
    }
    const s = this.spec;
    // the model's own wheels (a realistic car brings them), else wheels made here
    for (const c of [...this.group.children, ...(s.bike ? this.body.children : [])])
      if (c.name === "wheel") {
        const w = c.userData.wheel as { r: number; front: boolean };
        this.wheels.push({ m: c, front: w.front, r: w.r });
      }
    if (!this.wheels.length)
    for (const wx of s.wheels)
      for (const side of s.bike ? [0] : [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set((wx + 0.5 - s.vox / 2) * VOX, s.wheelR, side * s.track * VOX);
        const tyre = new THREE.Mesh(WHEEL_GEO, TYRE);
        tyre.scale.set(s.wheelR, s.bike ? 0.16 : 0.26, s.wheelR);
        tyre.rotation.x = Math.PI / 2;
        tyre.castShadow = true;
        const rim = new THREE.Mesh(RIM_GEO, kind === "gt" || kind === "moto" ? RIM : TYRE);
        tyre.add(rim);
        const spin = new THREE.Group();
        spin.add(tyre);
        pivot.add(spin);
        (s.bike ? this.body : this.group).add(pivot);
        this.wheels.push({ m: pivot, front: wx > s.vox / 2, r: s.wheelR });
      }
    // the headlamps' pool on the road ahead
    this.beam = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 9), BEAM_MAT.clone());
    this.beam.rotation.x = -Math.PI / 2;
    this.beam.rotation.z = -Math.PI / 2;
    this.beam.position.set(s.len / 2 + 4.2, 0.04, 0);
    this.beam.renderOrder = 2;
    this.group.add(this.beam);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== this.beam) o.castShadow = true;
    });
    this.y = this.group.position.y;
  }

  get speed() {
    return Math.abs(this.vF);
  }

  /** The pivot its body leans in (a rider sits in it). */
  get pivot() {
    return this.body;
  }

  /** Forward and right (world, flat). */
  fwd(out = new THREE.Vector2()) {
    return out.set(Math.cos(this.yaw), -Math.sin(this.yaw));
  }

  place(x: number, z: number, yaw: number) {
    this.group.position.set(x, 0, z);
    this.yaw = yaw;
    this.vel.set(0, 0);
    this.vF = this.vR = this.yawRate = 0;
    this.group.rotation.set(0, yaw, 0);
  }

  /** Shoved: a change of velocity (m/s, world), a spin (rad/s), and a moment of sliding. */
  push(dvx: number, dvz: number, spin: number, stun: number) {
    this.vel.x += dvx;
    this.vel.y += dvz;
    this.yawRate += spin;
    this.stun = Math.max(this.stun, stun);
    const fx = Math.cos(this.yaw),
      fz = -Math.sin(this.yaw);
    this.vF = this.vel.x * fx + this.vel.y * fz;
  }

  update(dt: number, inp: DriveIn, world: CarWorld) {
    this.hit = null;
    this.contacts.length = 0;
    // small steps: a fast car must not cross a lamp post in one frame
    const n = Math.max(1, Math.ceil(dt / (1 / 90)));
    for (let i = 0; i < n; i++) this.step(dt / n, inp, world);
    this.pose(dt, inp, world);
  }

  /**
   * One step of the arcade model. The steering asks for a turn rate (not a wheel angle): it builds
   * up from a standstill (no turning on the spot), peaks in town and eases off at speed, so a held
   * key never throws the car round at 150 km/h. The tyres keep it on its line (the speed follows
   * the heading quickly); only the handbrake lets the back go, and the steering then holds the
   * angle (counter-steer to catch it).
   */
  private step(dt: number, inp: DriveIn, world: CarWorld) {
    const s = this.spec;
    let fx = Math.cos(this.yaw),
      fz = -Math.sin(this.yaw);
    // the car's sideways (its right): (sin, cos) of the heading
    let lx = -fz,
      lz = fx;
    let vF = this.vel.x * fx + this.vel.y * fz;
    let vL = this.vel.x * lx + this.vel.y * lz;
    // the engine, the brakes, the drag
    const nitro = inp.nitro && this.nos > 0.02 && inp.throttle > 0.1;
    this.nosOn = nitro;
    if (nitro) this.nos = Math.max(0, this.nos - dt * 0.28);
    else this.nos = Math.min(1, this.nos + dt * 0.05);
    const vmax = s.vmax * (nitro ? 1.2 : 1);
    let a = 0;
    if (inp.throttle > 0) {
      if (vF < -0.5) a += 16 * inp.throttle;
      else a += inp.throttle * s.accel * Math.max(0, 1 - (vF / vmax) ** 2) * (nitro ? 1.6 : 1);
    }
    if (inp.brake > 0) {
      if (vF > 0.5) a -= 18 * inp.brake;
      else if (vF > -s.vmax * 0.25) a -= 7 * inp.brake;
    }
    const sp0 = Math.abs(vF);
    const drift = inp.handbrake && sp0 > 6;
    if (inp.handbrake) a -= Math.sign(vF) * Math.min(sp0 / dt, drift ? 3.5 : 9);
    // rolling and air; off the throttle the car slows gently (engine braking)
    a -= Math.sign(vF) * Math.min(sp0 / dt, 0.3 + 0.0024 * vF * vF + (inp.throttle < 0.05 && inp.brake < 0.05 ? 1.4 : 0));
    vF += a * dt;
    // the steering: quick to turn in, quicker back to the middle
    const back = inp.steer === 0 || Math.sign(inp.steer) !== Math.sign(this.steerNow);
    this.steerNow += (inp.steer - this.steerNow) * Math.min(1, dt * (back ? 11 : 6));
    const sp = Math.abs(vF);
    const peak = (s.bike ? 1.9 : 1.65) * s.turn;
    const build = Math.min(1, sp / 5);
    const ease = 1 / (1 + Math.max(0, sp - 10) / (s.bike ? 20 : 16));
    let target = -this.steerNow * peak * build * ease * (vF >= 0 ? 1 : -1);
    // the handbrake: the tail swings out, the steering holds the slide
    if (drift) target = target * 1.55 + -Math.sign(vL) * 0.15 * (this.steerNow === 0 ? 1 : 0);
    // no input: the car straightens itself (no wobble after a turn); knocked about, it spins on
    // and only slowly comes to rest
    const stunned = this.stun > 0;
    if (stunned) this.stun = Math.max(0, this.stun - dt);
    const k = stunned ? 1.1 : drift ? 4 : this.steerNow === 0 ? 14 : 9;
    this.yawRate += ((stunned ? 0 : target) - this.yawRate) * Math.min(1, dt * k);
    // the speed in the world (the engine's change along the car as it was)
    const wx = fx * vF + lx * vL,
      wz = fz * vF + lz * vL;
    this.yaw += this.yawRate * dt;
    fx = Math.cos(this.yaw);
    fz = -Math.sin(this.yaw);
    lx = -fz;
    lz = fx;
    // seen from the turned car: what was ahead is now partly sideways, and the tyres take that out
    let nF = wx * fx + wz * fz;
    let nL = wx * lx + wz * lz;
    const grip = stunned ? 0.9 : drift ? 1.5 : s.grip * 1.6;
    nL *= Math.exp(-grip * dt);
    // the tyres scrub speed while the car slides (sideways, a knocked car's skid: hard)
    nF -= Math.sign(nF) * Math.min(Math.abs(nF), Math.abs(nL) * (stunned ? 1.4 : 0.6) * dt);
    if (stunned) nL -= Math.sign(nL) * Math.min(Math.abs(nL), 4.5 * dt);
    this.vel.set(fx * nF + lx * nL, fz * nF + lz * nL);
    this.vF = nF;
    this.vR = nL;
    this.drifting = Math.abs(nL) > 2.6 && sp > 7 ? Math.min(1, (Math.abs(nL) - 2.6) / 5) : 0;
    const p = this.group.position;
    p.x += this.vel.x * dt;
    p.z += this.vel.y * dt;
    this.collide(world);
  }

  /** Out of the walls and the other cars: three circles along the car. */
  private collide(world: CarWorld) {
    const s = this.spec;
    const p = this.group.position;
    const fx = Math.cos(this.yaw),
      fz = -Math.sin(this.yaw);
    const r = s.wid / 2;
    const half = s.len / 2 - r;
    let px = 0,
      pz = 0,
      n = 0;
    for (const k of [-1, 0, 1]) {
      const cx = p.x + fx * half * k,
        cz = p.z + fz * half * k;
      tmp.set(cx, 0, cz);
      world.resolve(tmp, r);
      let dx = tmp.x - cx,
        dz = tmp.z - cz;
      if (world.outside(cx, cz)) {
        // the city's edge: straight back the way it came
        dx = -this.vel.x * 0.02;
        dz = -this.vel.y * 0.02;
      }
      if (dx || dz) {
        px += dx;
        pz += dz;
        n++;
      }
    }
    let what: Hit["what"] = "wall";
    // (the push from what can be shoved, kept apart: no bounce off it — the game trades the momentum)
    let rx = 0,
      rz = 0;
    // the other vehicles: boxes, the car a circle at each end
    for (const b of world.boxes()) {
      let touched = false;
      const bx0 = px,
        bz0 = pz;
      for (const k of [-1, 0, 1]) {
        const cx = p.x + fx * half * k + px,
          cz = p.z + fz * half * k + pz;
        const qx = Math.max(b.x - b.hx, Math.min(cx, b.x + b.hx)),
          qz = Math.max(b.z - b.hz, Math.min(cz, b.z + b.hz));
        const dx = cx - qx,
          dz = cz - qz;
        const d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d < 1e-3) {
          // inside it: out the short way
          const ox = b.hx - Math.abs(cx - b.x),
            oz = b.hz - Math.abs(cz - b.z);
          if (ox < oz) px += Math.sign(cx - b.x || 1) * (ox + r);
          else pz += Math.sign(cz - b.z || 1) * (oz + r);
        } else {
          px += (dx / d) * (r - d);
          pz += (dz / d) * (r - d);
        }
        touched = true;
        if (!b.ref) n++;
        what = "car";
      }
      if (touched && b.ref) {
        const ex = px - bx0,
          ez = pz - bz0;
        // (that push is the box's: off the bounce, onto its own account)
        px = bx0;
        pz = bz0;
        rx += ex;
        rz += ez;
        const l = Math.hypot(ex, ez) || 1;
        this.contacts.push({ ref: b.ref, box: b, nx: ex / l, nz: ez / l, x: p.x - (ex / l) * r, z: p.z - (ez / l) * r });
      }
    }
    // out of what can be shoved, without a bounce
    p.x += rx;
    p.z += rz;
    if (!n) return;
    const len = Math.hypot(px, pz);
    if (len < 1e-5) return;
    p.x += px;
    p.z += pz;
    // bounce: the speed into the wall goes, a little comes back
    const nx = px / len,
      nz = pz / len;
    const into = this.vel.x * nx + this.vel.y * nz;
    if (into < 0) {
      this.vel.x -= 1.12 * into * nx;
      this.vel.y -= 1.12 * into * nz;
      // a glancing touch keeps most of the speed along the wall; a head-on hit stops it
      const along = Math.hypot(this.vel.x, this.vel.y);
      const head = Math.min(1, -into / Math.max(1, along - into));
      this.vel.multiplyScalar(1 - 0.25 * head);
      this.yawRate *= 0.4;
      const hs = -into;
      if (hs > 1.5 && (!this.hit || hs > this.hit.speed)) {
        this.hit = { speed: hs, x: p.x - nx * r, z: p.z - nz * r, what };
        this.damage = Math.min(1, this.damage + hs * 0.008);
      }
    }
    this.vF = this.vel.x * fx + this.vel.y * fz;
  }

  /** The body on its springs, the wheels turning and steering, the gearbox. */
  private pose(dt: number, inp: DriveIn, world: CarWorld) {
    const s = this.spec;
    const p = this.group.position;
    // the road or the kerb under it (the front and back wheels, averaged)
    const fx = Math.cos(this.yaw),
      fz = -Math.sin(this.yaw);
    const yF = world.surface(p.x + fx * s.len * 0.35, p.z + fz * s.len * 0.35);
    const yB = world.surface(p.x - fx * s.len * 0.35, p.z - fz * s.len * 0.35);
    const ground = (yF + yB) / 2;
    // (a long ramp — the Golden Gate's deck — is followed at its own rate, not lagging half a metre
    // under it; a kerb's step is left to the springs)
    const step = ground - this.lastGround;
    const gv = dt > 0 && Math.abs(step) < 0.5 && Math.abs(step - this.lastStep) < 0.06 ? THREE.MathUtils.clamp(step / dt, -10, 10) : 0;
    this.lastGround = ground;
    this.lastStep = step;
    this.vy += ((ground - this.y) * 260 + (gv - this.vy) * 22) * dt;
    this.y += this.vy * dt;
    p.y = this.y;
    this.group.rotation.set(0, this.yaw, 0);
    // pitch under braking and throttle, roll in the turns
    const accel = inp.throttle * (this.vF >= 0 ? 1 : 0) - inp.brake * (this.vF > 0.5 ? 1.6 : 0);
    const wheelie = s.bike && inp.throttle > 0.9 && this.vF > 3 && this.vF < 14 && inp.nitro ? 0.35 : 0;
    this.pitch += (accel * (s.bike ? 0.04 : 0.022) + wheelie + (yF - yB) * 0.25 - this.pitch) * Math.min(1, dt * 6);
    if (s.bike) {
      // a bike leans into the turn, more the faster it goes
      const lean = THREE.MathUtils.clamp(-this.yawRate * Math.abs(this.vF) * 0.045, -0.75, 0.75);
      this.roll += (lean - this.roll) * Math.min(1, dt * 7);
    } else this.roll += (THREE.MathUtils.clamp(this.yawRate * this.vF * 0.0035, -0.06, 0.06) - this.roll) * Math.min(1, dt * 6);
    this.body.rotation.set(this.roll, 0, this.pitch);
    for (const w of this.wheels) {
      const spin = w.m.children[0];
      spin.rotation.z -= (this.vF * dt) / w.r;
      if (w.front) w.m.rotation.y = -this.steerNow * 0.45;
    }
    // the gearbox: up at the top of the rev range, down at the bottom
    this.shiftT -= dt;
    const v = Math.abs(this.vF);
    const top = s.vmax * 1.05;
    const band = top / s.gears;
    if (this.vF < -0.3) this.gear = -1;
    else if (this.shiftT <= 0) {
      const want = Math.max(1, Math.min(s.gears, Math.floor(v / band) + 1));
      if (want !== this.gear) {
        this.gear = want;
        this.shiftT = 0.35;
      }
    }
    const g = Math.max(1, this.gear);
    const inGear = this.gear < 0 ? v / (band * 0.8) : (v - (g - 1) * band) / band;
    const want = THREE.MathUtils.clamp((g === 1 && this.gear > 0 ? 0.14 : 0.38) + inGear * (g === 1 ? 0.8 : 0.58) + (inp.throttle > 0 && v < 2 ? inp.throttle * 0.3 : 0), 0.1, 1);
    this.rpm += (want - this.rpm) * Math.min(1, dt * (this.shiftT > 0 ? 6 : 10));
    (this.beam.material as THREE.MeshBasicMaterial).opacity = this.lamps ? 0.55 : 0;
    this.beam.visible = this.lamps;
  }

  dispose() {
    this.group.removeFromParent();
    (this.beam.material as THREE.Material).dispose();
    this.beam.geometry.dispose();
    if (this.own) freeObject(this.group);
    else freeObject(this.group);
  }
}
