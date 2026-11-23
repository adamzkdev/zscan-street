import * as THREE from "three";

/**
 * The game's camera (src/gta): over the shoulder on foot, a chase camera at the wheel (near, far,
 * or on the bonnet), turned by the mouse or the right stick. At the wheel it swings back behind the
 * car a moment after you let go of the mouse, faster the faster you drive; its field of view opens
 * with the speed. It never goes through a building: the arm shortens to the first wall.
 */

export type CarView = 0 | 1 | 2;
export const CAR_VIEWS = ["Chase", "Far chase", "Bonnet"] as const;

export interface CamWorld {
  /** Inside a building's footprint (scene/nav.ts `wall`). */
  wall(x: number, z: number): boolean;
}

const tmp = new THREE.Vector3();
const look = new THREE.Vector3();

export class GtaCamera {
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 520);
  /** The camera's heading round its target (0 = looking toward −z) and its tilt. */
  yaw = 0;
  pitch = -0.18;
  carView: CarView = 0;
  /** On foot: near or far over the shoulder. */
  footFar = false;
  /** Look behind (B) at the wheel. */
  back = false;
  private pivot = new THREE.Vector3();
  private arm = 4;
  private fovNow = 60;
  private shakeT = 0;
  private shakeK = 0;
  sensitivity = 1;
  fovAdd = 0;
  /** Camera shake on at the wheel (the road felt at speed). */
  vibe = true;

  constructor() {
    this.camera.rotation.order = "YXZ";
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** How long the arm is now (m): the body is hidden when the camera is right on it. */
  get armLength() {
    return this.arm;
  }

  /** A jolt (a crash, a landing): 0…1. */
  shake(k: number) {
    this.shakeK = Math.max(this.shakeK, Math.min(1, k));
    this.shakeT = 0;
  }

  /** Turn by a mouse / stick movement (pixels). */
  turn(dx: number, dy: number) {
    const k = 0.0028 * this.sensitivity;
    this.yaw -= dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.15, 0.55);
  }

  /** Straight behind a heading (a cut: entering a car, a teleport). */
  behind(heading: number, pitch = -0.18) {
    this.yaw = heading;
    this.pitch = pitch;
  }

  /** Snap the pivot (no glide from where it was). */
  snap(at: THREE.Vector3) {
    this.pivot.copy(at);
  }

  /** On foot: `feet` the body's feet. */
  foot(dt: number, feet: THREE.Vector3, world: CamWorld) {
    tmp.set(feet.x, feet.y + 1.35, feet.z);
    this.pivot.lerp(tmp, 1 - Math.exp(-dt * 16));
    const arm = this.footFar ? 5.4 : 3.2;
    this.place(dt, arm, 0.42, world, 62 + this.fovAdd);
  }

  /**
   * At the wheel. `heading` the car's travel heading in the camera's convention (0 = −z), `speed`
   * m/s, `idle` seconds since the mouse last turned the camera.
   */
  car(dt: number, at: THREE.Vector3, carYaw: number, speed: number, reverse: boolean, idle: number, world: CamWorld, len: number) {
    // the model's +x is forward: as a walker's heading, that is carYaw − π/2
    const heading = carYaw - Math.PI / 2;
    if (this.carView === 2) {
      // on the bonnet, looking ahead (the mouse still looks round)
      const fx = Math.cos(carYaw),
        fz = -Math.sin(carYaw);
      this.camera.position.set(at.x + fx * len * 0.18, at.y + 1.25, at.z + fz * len * 0.18);
      if (idle > 1) this.ease(heading, -0.06, dt, 4);
      this.camera.rotation.set(this.pitch, this.yaw + (this.back ? Math.PI : 0), 0);
      this.fov(dt, 70 + Math.min(14, speed * 0.3) + this.fovAdd);
      this.applyShake(dt, speed);
      return;
    }
    tmp.set(at.x, at.y + 1.0, at.z);
    // the pivot trails the car a little: the speed is felt
    this.pivot.lerp(tmp, 1 - Math.exp(-dt * 12));
    // let go of the mouse: back behind the car (behind the way it goes when reversing slowly)
    if (idle > 1.1) {
      const want = reverse && speed > 1.5 ? heading + Math.PI : heading;
      this.ease(want, this.carView === 1 ? -0.22 : -0.16, dt, 1.2 + Math.min(3, speed * 0.12));
    }
    const arm = (this.carView === 1 ? 9 : 5.2) + Math.min(1.4, speed * 0.028);
    this.place(dt, arm + len * 0.25, 0, world, 60 + Math.min(18, speed * 0.32) + this.fovAdd, this.back);
    this.applyShake(dt, speed);
  }

  /** On foot with the follow camera: in behind the body's heading, faster when running. */
  follow(dt: number, heading: number, speed: number) {
    this.ease(heading, this.footFar ? -0.26 : -0.2, dt, 3 + Math.min(4, speed * 0.6));
  }

  private ease(yaw: number, pitch: number, dt: number, k: number) {
    let d = yaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * k);
    this.pitch += (pitch - this.pitch) * Math.min(1, dt * k * 0.8);
  }

  private fov(dt: number, want: number) {
    this.fovNow += (want - this.fovNow) * Math.min(1, dt * 3);
    if (Math.abs(this.camera.fov - this.fovNow) > 0.01) {
      this.camera.fov = this.fovNow;
      this.camera.updateProjectionMatrix();
    }
  }

  /** The camera on its arm from the pivot, shortened to the first wall. */
  private place(dt: number, arm: number, shoulder: number, world: CamWorld, fov: number, flip = false) {
    const yaw = this.yaw + (flip ? Math.PI : 0);
    const cp = Math.cos(this.pitch),
      sp = Math.sin(this.pitch);
    // backwards from the pivot (the camera looks along yaw; it stands behind)
    const bx = Math.sin(yaw) * cp,
      bz = Math.cos(yaw) * cp,
      by = -sp;
    // the shoulder: to the camera's right
    const rx = Math.cos(yaw),
      rz = -Math.sin(yaw);
    const ox = this.pivot.x + rx * shoulder,
      oz = this.pivot.z + rz * shoulder;
    // the arm, cut at a wall (checked every 25 cm)
    let len = arm;
    for (let d = 0.6; d <= arm; d += 0.25) {
      if (world.wall(ox + bx * d, oz + bz * d)) {
        len = Math.max(0.9, d - 0.45);
        break;
      }
    }
    // shorten at once, lengthen slowly (no pumping along a wall)
    this.arm = len < this.arm ? len : this.arm + (len - this.arm) * Math.min(1, dt * 2.5);
    const y = Math.max(this.pivot.y - 1.0, this.pivot.y + by * this.arm + 0.15);
    this.camera.position.set(ox + bx * this.arm, Math.max(0.35, y), oz + bz * this.arm);
    look.set(ox, this.pivot.y + 0.1, oz);
    this.camera.lookAt(look);
    this.fov(dt, fov);
  }

  private applyShake(dt: number, speed: number) {
    this.shakeT += dt;
    this.shakeK *= Math.exp(-dt * 5);
    const road = this.vibe ? Math.min(1, Math.max(0, speed - 20) / 30) * 0.012 : 0;
    const k = this.shakeK * 0.12 + road;
    if (k < 1e-4) return;
    const t = performance.now() / 1000;
    this.camera.position.x += Math.sin(t * 47) * k;
    this.camera.position.y += Math.sin(t * 61 + 1) * k;
    this.camera.rotation.z += Math.sin(t * 39) * k * 0.6;
  }
}
