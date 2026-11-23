import * as THREE from "three";
import { freeObject, sharedObject } from "../scene/voxel/mesher";
import { VOX } from "../scene/voxel/model";
import { GT_SPEC, gtModel } from "./models";

/**
 * A car you drive (src/gta): an arcade model, tuned for feel rather than truth, as the open-world
 * games do. Two speeds per axis: along the car (engine, brakes, drag) and across it (the tyres'
 * grip pulls it back to zero; the handbrake lets go of it: a drift). The yaw follows a bicycle
 * model of the steering with a little lag. Collisions push the car out of the street's obstacles
 * (scene/nav.ts) with three circles along its length, and bounce it off.
 */

export type VehicleKind = "gt" | "sedan" | "taxi" | "police" | "truck";

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
}

export const SPECS: Record<VehicleKind, Spec> = {
  gt: { name: "ZK-GT", accel: 11.5, vmax: 58, grip: 8.5, turn: 1, len: GT_SPEC.w * VOX, wid: GT_SPEC.d * VOX, wheelR: 0.32, wheels: [6, 21], vox: 27, track: 5.1, gears: 7 },
  sedan: { name: "Sedan", accel: 7, vmax: 40, grip: 7.5, turn: 0.9, len: 4, wid: 11 * VOX, wheelR: 0.3, wheels: [5, 18], vox: 24, track: 4.6, gears: 5 },
  taxi: { name: "Taxi", accel: 6.5, vmax: 38, grip: 7.5, turn: 0.9, len: 4.5, wid: 11 * VOX, wheelR: 0.3, wheels: [5, 21], vox: 27, track: 4.6, gears: 5 },
  police: { name: "Police cruiser", accel: 8.5, vmax: 47, grip: 8, turn: 0.95, len: 26 * VOX, wid: 11 * VOX, wheelR: 0.3, wheels: [5, 20], vox: 26, track: 4.6, gears: 6 },
  truck: { name: "Box truck", accel: 4.2, vmax: 27, grip: 6, turn: 0.7, len: 7, wid: 2.1, wheelR: 0.34, wheels: [8, 34], vox: 42, track: 5, gears: 5 },
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
  /** Other vehicles as boxes (centre, half sizes along x and z): the traffic, the trams. */
  boxes(): Iterable<{ x: number; z: number; hx: number; hz: number }>;
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
  private wheels: { m: THREE.Object3D; front: boolean }[] = [];
  private beam: THREE.Mesh;
  private y = 0;
  private vy = 0;
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
  /** Lit lamps at night. */
  lamps = false;

  constructor(kind: VehicleKind, from?: THREE.Group) {
    this.kind = kind;
    this.spec = SPECS[kind];
    this.own = !from;
    if (from) {
      // a car taken from the traffic: its group (the body, a police light bar) carries on
      this.group = from;
      this.body = from;
      this.yaw = from.rotation.y;
      // its body goes in a pivot of its own so it can lean
      const pivot = new THREE.Group();
      for (const c of [...from.children]) pivot.add(c);
      from.add(pivot);
      this.body = pivot;
    } else {
      this.group = new THREE.Group();
      this.body = new THREE.Group();
      this.body.add(sharedObject(`gta:gt`, () => gtModel()));
      this.group.add(this.body);
    }
    const s = this.spec;
    for (const wx of s.wheels)
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set((wx + 0.5 - s.vox / 2) * VOX, s.wheelR, side * s.track * VOX);
        const tyre = new THREE.Mesh(WHEEL_GEO, TYRE);
        tyre.scale.set(s.wheelR, 0.26, s.wheelR);
        tyre.rotation.x = Math.PI / 2;
        tyre.castShadow = true;
        const rim = new THREE.Mesh(RIM_GEO, kind === "gt" ? RIM : TYRE);
        tyre.add(rim);
        const spin = new THREE.Group();
        spin.add(tyre);
        pivot.add(spin);
        this.group.add(pivot);
        this.wheels.push({ m: pivot, front: wx > s.vox / 2 });
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

  update(dt: number, inp: DriveIn, world: CarWorld) {
    this.hit = null;
    // small steps: a fast car must not cross a lamp post in one frame
    const n = Math.max(1, Math.ceil(dt / (1 / 90)));
    for (let i = 0; i < n; i++) this.step(dt / n, inp, world);
    this.pose(dt, inp, world);
  }

  private step(dt: number, inp: DriveIn, world: CarWorld) {
    const s = this.spec;
    const fx = Math.cos(this.yaw),
      fz = -Math.sin(this.yaw);
    const rx = -fz,
      rz = fx;
    // (right = forward turned clockwise seen from above: (sin, cos))
    let vF = this.vel.x * fx + this.vel.y * fz;
    let vR = this.vel.x * (-rx) + this.vel.y * (-rz);
    // the engine, the brakes, the drag
    const nitro = inp.nitro && this.nos > 0.02 && inp.throttle > 0.1;
    this.nosOn = nitro;
    if (nitro) this.nos = Math.max(0, this.nos - dt * 0.28);
    else this.nos = Math.min(1, this.nos + dt * 0.05);
    const vmax = s.vmax * (nitro ? 1.22 : 1);
    let a = 0;
    if (inp.throttle > 0) {
      if (vF < -0.5) a += 14 * inp.throttle;
      else a += inp.throttle * s.accel * Math.max(0, 1 - (vF / vmax) ** 2) * (nitro ? 1.7 : 1);
    }
    if (inp.brake > 0) {
      if (vF > 0.5) a -= 15 * inp.brake;
      else if (vF > -s.vmax * 0.28) a -= 6 * inp.brake;
    }
    if (inp.handbrake) a -= Math.sign(vF) * Math.min(Math.abs(vF) / dt, 5.5);
    // rolling and air
    a -= Math.sign(vF) * Math.min(Math.abs(vF) / dt, 0.35 + 0.0028 * vF * vF + (inp.throttle < 0.05 ? 0.9 : 0));
    vF += a * dt;
    // the tyres: the sideways speed dies away, a lot less on the handbrake (the back lets go)
    const speed = Math.abs(vF);
    const drift = inp.handbrake && speed > 6;
    const grip = drift ? 1.4 : s.grip * (Math.abs(vR) > 5 ? 0.55 : 1);
    vR *= Math.exp(-grip * dt);
    // the steering: less lock at speed, and it turns in over a moment
    this.steerNow += (inp.steer - this.steerNow) * Math.min(1, dt * (inp.steer === 0 ? 7 : 5));
    const lock = THREE.MathUtils.lerp(0.58, 0.13, Math.min(1, speed / 38)) * s.turn;
    const wb = s.len * 0.62;
    let target = (-vF * Math.tan(this.steerNow * lock)) / wb;
    // a drift swings the tail out (counter-steer pulls it back)
    if (drift) target *= 1.75;
    this.yawRate += (target - this.yawRate) * Math.min(1, dt * (drift ? 4 : 9));
    this.yaw += this.yawRate * dt;
    // a drift turns the car's heading without its direction of travel: what was forward is now part sideways
    const nfx = Math.cos(this.yaw),
      nfz = -Math.sin(this.yaw);
    const vx = fx * vF - rx * vR,
      vz = fz * vF - rz * vR;
    if (drift || Math.abs(vR) > 1.5) {
      this.vel.set(vx, vz);
    } else {
      // with grip the speed turns with the car
      const nrx = -nfz,
        nrz = nfx;
      this.vel.set(nfx * vF - nrx * vR, nfz * vF - nrz * vR);
    }
    this.vF = this.vel.x * nfx + this.vel.y * nfz;
    this.vR = this.vel.x * nfz - this.vel.y * nfx;
    this.drifting = Math.abs(this.vR) > 3.2 && speed > 7 ? Math.min(1, (Math.abs(this.vR) - 3.2) / 5) : 0;
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
    // the other vehicles: boxes, the car a circle at each end
    for (const b of world.boxes()) {
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
        n++;
        what = "car";
      }
    }
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
      this.vel.x -= 1.25 * into * nx;
      this.vel.y -= 1.25 * into * nz;
      this.vel.multiplyScalar(0.985);
      this.yawRate *= 0.6;
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
    this.vy += ((ground - this.y) * 260 - this.vy * 22) * dt;
    this.y += this.vy * dt;
    p.y = this.y;
    this.group.rotation.set(0, this.yaw, 0);
    // pitch under braking and throttle, roll in the turns
    const accel = inp.throttle * (this.vF >= 0 ? 1 : 0) - inp.brake * (this.vF > 0.5 ? 1.6 : 0);
    this.pitch += (accel * 0.022 + (yF - yB) * 0.25 - this.pitch) * Math.min(1, dt * 6);
    this.roll += (THREE.MathUtils.clamp(this.yawRate * this.vF * 0.0035, -0.06, 0.06) - this.roll) * Math.min(1, dt * 6);
    this.body.rotation.set(this.roll, 0, this.pitch);
    for (const w of this.wheels) {
      const spin = w.m.children[0];
      spin.rotation.z -= (this.vF * dt) / s.wheelR;
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
