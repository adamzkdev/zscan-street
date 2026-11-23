import * as THREE from "three";
import { makeSnarkBody, preloadSnarks, type SnarkBody } from "../scene/snarkbody";

/**
 * Your zkSNARK on foot (src/gta): its voxel body (scene/snarkbody.ts), moving the way the camera
 * looks, as in the open-world games: it turns to face where it goes, jogs by default, sprints on
 * Shift, jumps on Space. The street's own walker (interior/walk.ts) keeps its place: the body stands
 * where the walker's feet are, so the doors, the talk, the minimap and the traffic all see you.
 */

const JOG = 4.4;
const WALK = 1.7;
const SPRINT = 7.6;
const GRAVITY = 17;
const JUMP = 5.6;
/** The voxel body is ~1.85 m at scale 1 (a 26-voxel bust on its legs): the street's people are ~1.6 m. */
export const BODY_SCALE = 0.86;

export interface FootWorld {
  /** A body at (x, z) would be inside something. */
  blocked(x: number, z: number): boolean;
  /** The floor under (x, z). */
  floor(x: number, z: number): number;
}

export class FootPlayer {
  readonly group = new THREE.Group();
  body: SnarkBody | null = null;
  id = 0;
  /** Feet. */
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  /** Which way the body faces (0 = toward −z, the walker's convention). */
  facing = 0;
  private hop = 0;
  private vy = 0;
  grounded = true;
  private floorY = 0;
  /** Running speed now (m/s), for the body's stride. */
  speed = 0;
  /** A punch under way (seconds into it), or −1. */
  private punchT = -1;
  private punchSide = 1;

  /** Throw a punch (true if it started: not one already). */
  punch() {
    if (this.punchT >= 0 || !this.body) return false;
    this.punchT = 0;
    this.punchSide = -this.punchSide;
    this.body.holdArms(true);
    return true;
  }

  /** The fist has landed this frame (once per punch). */
  landed = false;

  constructor() {
    this.group.name = "gta:player";
  }

  /** Become zkSNARK #id (its art comes from the API; a stand-in until then). */
  wear(id: number) {
    if (this.id === id && this.body) return;
    this.id = id;
    void preloadSnarks([id], 3000);
    const old = this.body;
    const b = makeSnarkBody(id);
    b.root.scale.setScalar(BODY_SCALE);
    b.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = !m.userData.noShadow;
        m.receiveShadow = false;
      }
    });
    this.group.add(b.root);
    this.body = b;
    old?.dispose();
  }

  place(x: number, y: number, z: number, facing: number) {
    this.pos.set(x, y, z);
    this.floorY = y;
    this.hop = this.vy = 0;
    this.vel.set(0, 0, 0);
    this.facing = facing;
    this.grounded = true;
    this.pose(0);
  }

  get floor() {
    return this.floorY;
  }

  /**
   * One frame: `mx`, `my` the stick (right, forward) relative to the camera's heading `camYaw`.
   */
  update(dt: number, mx: number, my: number, mag: number, sprint: boolean, jump: boolean, camYaw: number, world: FootWorld, turnTo = true) {
    const fx = -Math.sin(camYaw),
      fz = -Math.cos(camYaw);
    // the camera's right
    const rx = -fz,
      rz = fx;
    let dx = fx * my + rx * mx,
      dz = fz * my + rz * mx;
    const l = Math.hypot(dx, dz);
    if (l > 1e-3) (dx /= l), (dz /= l);
    const want = l > 1e-3 ? (mag < 0.45 ? WALK : sprint ? SPRINT : JOG) * Math.min(1, mag * 1.6) : 0;
    const tx = dx * want,
      tz = dz * want;
    // quick to start and stop on the ground, little say in the air
    const k = this.grounded ? (want > 0 ? 12 : 16) : 2.5;
    this.vel.x += (tx - this.vel.x) * Math.min(1, dt * k);
    this.vel.z += (tz - this.vel.z) * Math.min(1, dt * k);
    // turn to face the way you go (unless backing up, the follow camera's way)
    if (turnTo && l > 1e-3 && want > 0.2) {
      const target = Math.atan2(-dx, -dz);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * (this.grounded ? 14 : 5));
    }
    // move, one axis at a time (sliding along walls)
    const p = this.pos;
    const sx = this.vel.x * dt,
      sz = this.vel.z * dt;
    p.x += sx;
    if (world.blocked(p.x, p.z)) {
      p.x -= sx;
      this.vel.x *= 0.2;
    }
    p.z += sz;
    if (world.blocked(p.x, p.z)) {
      p.z -= sz;
      this.vel.z *= 0.2;
    }
    // the floor, the jump
    const floor = world.floor(p.x, p.z);
    if (this.grounded && jump) {
      this.vy = JUMP;
      this.grounded = false;
      this.body?.jump();
    }
    if (!this.grounded || this.hop > 0) {
      this.vy -= GRAVITY * dt;
      this.hop += this.vy * dt;
      if (this.hop <= 0) {
        if (this.vy < -2) this.body?.land(-this.vy);
        this.hop = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }
    // off a ledge: a fall (the height kept as the jump's, gravity takes it)
    if (this.grounded && floor < this.floorY - 0.42) {
      this.grounded = false;
      this.hop = this.floorY - floor;
      this.vy = 0;
      this.floorY = floor;
    } else this.floorY += (floor - this.floorY) * Math.min(1, dt * (floor > this.floorY ? 20 : 14));
    p.y = this.floorY + this.hop;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.pose(dt);
  }

  private pose(dt: number) {
    this.group.position.copy(this.pos);
    if (!this.body) return;
    this.body.root.rotation.y = this.facing + Math.PI;
    this.body.update(dt, { speed: this.speed / BODY_SCALE, grounded: this.grounded, vy: this.vy, heading: this.facing });
    this.landed = false;
    if (this.punchT >= 0) {
      const was = this.punchT;
      this.punchT += dt;
      const t = this.punchT;
      // wind up, out, back: the punching arm straight ahead, the other one back
      const out = t < 0.08 ? -t / 0.08 * 0.6 : t < 0.18 ? -0.6 - ((t - 0.08) / 0.1) * 1.1 : -1.7 + Math.min(1, (t - 0.18) / 0.18) * 1.7;
      const [hit, other] = this.punchSide > 0 ? [this.body.armR, this.body.armL] : [this.body.armL, this.body.armR];
      hit.rotation.set(out, 0, this.punchSide * 0.15);
      other.rotation.set(0.4, 0, -this.punchSide * 0.12);
      this.body.foreArmR.rotation.set(0, 0, 0);
      this.body.foreArmL.rotation.set(-0.6, 0, 0);
      if (was < 0.16 && t >= 0.16) this.landed = true;
      if (t > 0.38) {
        this.punchT = -1;
        this.body.holdArms(false);
      }
    }
  }

  dispose() {
    this.body?.dispose();
    this.body = null;
    this.group.removeFromParent();
  }
}
