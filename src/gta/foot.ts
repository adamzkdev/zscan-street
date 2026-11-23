import * as THREE from "three";
import { faces } from "./faces";
import { Human } from "./human";

/**
 * Your zkSNARK on foot (src/gta): a person (human.ts) with your zkSNARK's head, moving the way the
 * camera looks, as in the open-world games: it turns to face where it goes, jogs by default, sprints
 * on Shift, jumps on Space, throws punches (left and right in turn, a guard up between them), takes
 * hits and goes down. The street's own walker (interior/walk.ts) keeps its place: the body stands
 * where the walker's feet are, so the doors, the talk, the minimap and the traffic all see you.
 */

const JOG = 4.4;
const WALK = 1.7;
const SPRINT = 7.6;
const GRAVITY = 17;
const JUMP = 5.6;
/** (The bodies are drawn at their own size now: a person is ~1.72 m.) */
export const BODY_SCALE = 1;

export interface FootWorld {
  /** A body at (x, z) with its feet at `feet` would be inside something (a jump clears a hedge). */
  blocked(x: number, z: number, feet: number): boolean;
  /** The floor under (x, z) for feet at `feet` (a jump can land on top of a hedge, a bench). */
  floor(x: number, z: number, feet: number): number;
}

export class FootPlayer {
  readonly group = new THREE.Group();
  body: Human | null = null;
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
  /** Fists up (held: the right mouse button), and how far up now. */
  guard = false;
  private guardK = 0;
  /** After a punch the guard stays up a moment. */
  private guardFor = 0;
  /** Hit (seconds since), knocked down (0…1), on a bike's saddle. */
  private hitT = 9;
  private hitFrom = 1;
  down = 0;
  riding = false;

  /** Throw a punch (true if it started: not one already). */
  punch() {
    if (this.punchT >= 0 || !this.body || this.down > 0.05) return false;
    this.punchT = 0;
    this.punchSide = -this.punchSide;
    this.guardFor = 1.6;
    return true;
  }

  /** Hit (from the front: 1, behind: −1): the body reels. */
  hit(from = 1) {
    this.hitT = 0;
    this.hitFrom = from;
    this.punchT = -1;
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
    faces.want([id], true);
    const old = this.body;
    const b = new Human(id);
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
    if (world.blocked(p.x, p.z, p.y)) {
      p.x -= sx;
      this.vel.x *= 0.2;
    }
    p.z += sz;
    if (world.blocked(p.x, p.z, p.y)) {
      p.z -= sz;
      this.vel.z *= 0.2;
    }
    // the floor, the jump
    const floor = world.floor(p.x, p.z, p.y);
    if (this.grounded && jump) {
      this.vy = JUMP;
      this.grounded = false;
    }
    if (!this.grounded || this.hop > 0) {
      this.vy -= GRAVITY * dt;
      this.hop += this.vy * dt;
      // coming down onto something higher than where the jump began: it is the floor now
      if (this.vy < 0 && floor > this.floorY && this.floorY + this.hop <= floor) {
        this.hop = Math.max(0, this.floorY + this.hop - floor);
        this.floorY = floor;
      }
      if (this.hop <= 0) {
        this.hop = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }
    // off a ledge: a fall (the height kept as the jump's, gravity takes it)
    if (!this.grounded && floor < this.floorY - 0.42 && this.hop <= 0.01) {
      this.hop = this.floorY - floor;
      this.floorY = floor;
    } else if (this.grounded && floor < this.floorY - 0.42) {
      this.grounded = false;
      this.hop = this.floorY - floor;
      this.vy = 0;
      this.floorY = floor;
    } else this.floorY += (floor - this.floorY) * Math.min(1, dt * (floor > this.floorY ? 20 : 14));
    p.y = this.floorY + this.hop;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.pose(dt);
  }

  /** Posed where it is (on a bike: the bike carries it). */
  poseOnly(dt: number) {
    this.pose(dt);
  }

  private pose(dt: number) {
    this.group.position.copy(this.pos);
    const b = this.body;
    if (!b) return;
    if (!this.riding) {
      b.root.position.set(0, 0, 0);
      b.root.rotation.set(0, this.facing + Math.PI, 0);
    }
    const a = b.act;
    this.landed = false;
    this.guardFor = Math.max(0, this.guardFor - dt);
    this.guardK += ((this.guard || this.guardFor > 0 ? 1 : 0) - this.guardK) * Math.min(1, dt * 10);
    a.guard = this.guardK;
    if (this.punchT >= 0) {
      const was = this.punchT;
      this.punchT += dt;
      a.punch = Math.min(1, this.punchT / 0.36);
      a.punchSide = this.punchSide;
      if (was < 0.11 && this.punchT >= 0.11) this.landed = true;
      if (this.punchT > 0.36) {
        this.punchT = -1;
        a.punch = -1;
      }
    } else a.punch = -1;
    this.hitT += dt;
    a.hit = this.hitT;
    a.hitFrom = this.hitFrom;
    a.down = this.down;
    a.downSide = 0;
    a.ride = this.riding;
    b.update(dt, { speed: this.riding ? 0 : this.speed, grounded: this.grounded || this.riding });
  }

  dispose() {
    this.body?.dispose();
    this.body = null;
    this.group.removeFromParent();
  }
}
