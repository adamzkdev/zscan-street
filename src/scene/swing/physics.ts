import * as THREE from "three";
import { AirStreaks } from "./streaks";
import { SwingSound } from "./sound";
import type { HeightField } from "./field";

/**
 * Swinging on foot: aim at a facade or a roof, hold, and a line goes out to the visible point
 * under the reticle; you hang from it and swing. Let go and you fly on with all your speed into
 * the next one. The physics is a pendulum on a rope that never stretches (taken up only as far as
 * clears the street at the bottom of the arc), with gravity as the street's jumps have it, the
 * keys steering along the arc, the rope's traction held against a facade to climb it, and roofs to
 * land and run on. Back on the street, the walker takes over, still moving. The line is drawn as
 * a thin glowing thread of Zcash gold.
 */

export interface SwingHost {
  camera: THREE.PerspectiveCamera;
  /** The walker's heading (0 = toward −z). */
  heading(): number;
  /** The first visible surface under the aim (the cursor, or the centre); never a nearby substitute. */
  target?(out: THREE.Vector3): THREE.Vector3 | null;
  /** The walk's own momentum, taken over when the first line goes out. */
  velocity?(out: THREE.Vector3): THREE.Vector3;
  lean(v: number): void;
  nod(v: number): void;
  /** Down where the walker can stand again (a floor at `floor`), still moving at (vx, vz). */
  landed(level: number, vx: number, vz: number, floor: number): void;
  field(): HeightField | null;
  /** The street plan's solid ground (a building's footprint, a lamp post), whatever the field says. */
  solid(x: number, z: number): boolean;
  /** The walker's own raised floors (a bridge deck, a platform) at (x, z), or null: the street. */
  ground?(x: number, z: number): number | null;
  curb: number;
  /** The field of view at rest. */
  fov: number;
  bounds: { x0: number; x1: number; z0: number; z1: number };
}

const EYE = 1.6;
// The street's own jump scale: gravity does not change when a line is let go.
const GRAVITY = 15;
const MAX_SPEED = 58;
const REACH = 92;
/** The bottom of the arc stays this far off the ground. */
const CLEARANCE = 3.2;
/** How fast the rope takes up what is too long for that: the more there is, the faster, up to a point. */
const takeUp = (excess: number) => Math.min(10, Math.max(0, excess) * 1.8);
/** A ground takeoff goes along the aimed line, keeping any sideways momentum. */
const LAUNCH_SPEED = 22;
/** Against a wall with the line on: straight up it. */
const CLIMB = 7;
/** Forward along the arc: the weight thrown forward. */
const PUMP = 8;
const AIR_STEER = 3.5;
const AIR_DRAG = 0.0018;
const STEP_UP = 0.6;
/** Round the body, on a roof and in the air (in the air, the eye must not end up against a wall). */
const RADIUS = 0.35;
const AIR_RADIUS = 1;
const WALLS_UP = 3;
const SEGMENTS = 20;
/** Zcash gold, and the same pushed past white for the glow round it. */
const GOLD = 0xf4b728;

/** The line: a ribbon always facing you, a gold core in a soft glow, never thinner than a hair. */
class Line {
  readonly core: THREE.Mesh;
  readonly glow: THREE.Mesh;
  private at: THREE.BufferAttribute;
  private halo: THREE.BufferAttribute;
  private p = new THREE.Vector3();
  private side = new THREE.Vector3();
  private along = new THREE.Vector3();
  private to = new THREE.Vector3();
  private view = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const n = SEGMENTS + 1;
    const idx: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const ribbon = (at: THREE.BufferAttribute) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", at);
      g.setIndex(idx);
      return g;
    };
    this.at = new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3);
    this.halo = new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3);
    this.core = new THREE.Mesh(ribbon(this.at), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(1.25), side: THREE.DoubleSide, fog: false, toneMapped: false }));
    this.glow = new THREE.Mesh(
      ribbon(this.halo),
      new THREE.MeshBasicMaterial({ color: GOLD, side: THREE.DoubleSide, fog: false, toneMapped: false, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    for (const m of [this.core, this.glow]) {
      m.frustumCulled = false;
      m.visible = false;
      m.userData.noField = true;
      scene.add(m);
    }
    this.glow.renderOrder = 2;
  }

  set visible(on: boolean) {
    this.core.visible = this.glow.visible = on;
  }
  get visible() {
    return this.core.visible;
  }

  /** From `a` to `b`: hanging by `slack` metres, and still shaking by `wave`. */
  draw(a: THREE.Vector3, b: THREE.Vector3, eye: THREE.Vector3, slack: number, wave: number, time: number) {
    this.along.copy(b).sub(a);
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const arc = 4 * t * (1 - t);
      this.p.copy(a).addScaledVector(this.along, t);
      this.p.y -= slack * arc;
      // (the shake runs out along it, and dies at both ends)
      const s = Math.sin(t * 15 - time * 34) * wave * arc;
      const u = Math.min(1, t + 1 / SEGMENTS);
      this.to.copy(a).addScaledVector(this.along, u);
      this.to.y -= slack * 4 * u * (1 - u);
      this.side.copy(this.to).sub(this.p).cross(this.view.copy(this.p).sub(eye));
      if (this.side.lengthSq() < 1e-8) this.side.set(1, 0, 0);
      this.side.normalize();
      this.p.addScaledVector(this.side, s);
      // the same few pixels wide all along it (its width grows with the distance), a little finer at the far end
      const w = Math.max(0.0012, this.p.distanceTo(eye) * 0.0016) * (1 - t * 0.2);
      const h = w * 3;
      this.at.setXYZ(i * 2, this.p.x + this.side.x * w, this.p.y + this.side.y * w, this.p.z + this.side.z * w);
      this.at.setXYZ(i * 2 + 1, this.p.x - this.side.x * w, this.p.y - this.side.y * w, this.p.z - this.side.z * w);
      this.halo.setXYZ(i * 2, this.p.x + this.side.x * h, this.p.y + this.side.y * h, this.p.z + this.side.z * h);
      this.halo.setXYZ(i * 2 + 1, this.p.x - this.side.x * h, this.p.y - this.side.y * h, this.p.z - this.side.z * h);
    }
    this.at.needsUpdate = true;
    this.halo.needsUpdate = true;
  }
}

/** What the line asks of the arms (hands.ts): which hand holds it, where, and the other's part. */
export interface Reach {
  on: boolean;
  /** The hand on the line: 1 the right, -1 the left. */
  side: number;
  hand: THREE.Vector3;
  shoulder: THREE.Vector3;
  /** The other hand on the line too (0..1), at hand2: to yank off the street or climb a wall. */
  both: number;
  hand2: THREE.Vector3;
  shoulder2: THREE.Vector3;
  /** In the air with a hold in reach: the hand `next` comes up to throw. */
  ready: boolean;
  next: number;
  /** Over a roof's edge, counted: the hands plant on it. */
  vaults: number;
  /** Where the line hand really is (world): the line leaves from there. */
  pin?: (p: THREE.Vector3) => void;
}

export class Swing {
  /** On the line, in the air or up on a roof: the walker's own walking is off. */
  active = false;
  /** Where a line would hold now (polled for the reticle), or null. */
  aim: THREE.Vector3 | null = null;
  get canCatch() {
    return !!this.aim;
  }
  /** Look for a hold under the aim a dozen times a second here (off when the reticle's owner polls, see index.ts). */
  pollAim = true;
  v = new THREE.Vector3();
  anchor: THREE.Vector3 | null = null;
  len = 0;
  grounded = false;
  readonly sound: SwingSound;
  private held = false;
  private want = 0;
  private shot = 1;
  private flightTime = 0.13;
  private launchPending = false;
  private reelSpeed = 0;
  private wave = 0;
  private taut = false;
  private time = 0;
  private line: Line;
  readonly reach: Reach = {
    on: false,
    side: 1,
    hand: new THREE.Vector3(),
    shoulder: new THREE.Vector3(),
    both: 0,
    hand2: new THREE.Vector3(),
    shoulder2: new THREE.Vector3(),
    ready: false,
    next: 1,
    vaults: 0,
    pin: (p: THREE.Vector3) => this.drawLine(p),
  };
  /** The hand on the line now, or that threw the last one: swings in a row go hand to hand. */
  private side = 1;
  /** When the last line was let go in the air (s): a chain still counts for a moment. */
  private letGo = -9;
  private clock = 0;
  /** Pulling with both hands: from a standstill, the yank; against a wall, the climb. */
  private yank = 0;
  private climbT = 0;
  /** A gold pixel where the line holds. */
  private knot: THREE.Mesh;
  readonly streaks = new AirStreaks({ count: 96, spread: 22, trail: 0.065 });
  motion: { matches: boolean } | null = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  private speedFeel = 0;
  /** The view was widened by speed: it eases back once the swing is over. */
  private widened = false;
  private dir = new THREE.Vector3();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private aimSpot = new THREE.Vector3();
  private tip = new THREE.Vector3();
  private inv = new THREE.Matrix4();
  private aimAt = 0;
  private lean = 0;
  private nod = 0;
  private lagReach = 0;

  constructor(
    readonly host: SwingHost,
    scene: THREE.Scene,
    sound = new SwingSound(),
  ) {
    this.sound = sound;
    this.line = new Line(scene);
    this.knot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(1.6), fog: false, toneMapped: false }));
    this.knot.visible = false;
    this.knot.userData.noField = true;
    scene.add(this.knot, this.streaks.root);
  }

  /** Everything the swing draws (kept out of the city's height field). */
  get objects(): THREE.Object3D[] {
    return [this.line.core, this.line.glow, this.knot, this.streaks.root];
  }

  /** Is a hold of the line on now (the key or the button down)? */
  get holding() {
    return this.held;
  }

  /** The city's height at (x, z) from the field (0 off it). */
  at(x: number, z: number) {
    const f = this.host.field();
    if (!f) return 0;
    const i = Math.floor((x - f.x0) / f.cell);
    const j = Math.floor((z - f.z0) / f.cell);
    if (i < 0 || j < 0 || i >= f.size || j >= f.size) return 0;
    return f.h[j * f.size + i];
  }

  /** The highest thing a body at height `y` could stand on here. */
  private floor(x: number, z: number, y: number) {
    let top = this.host.curb;
    const r = RADIUS * 0.8;
    for (const h of [this.at(x, z), this.at(x + r, z), this.at(x - r, z), this.at(x, z + r), this.at(x, z - r)]) if (h <= y + STEP_UP && h > top) top = h;
    return top;
  }

  private blocked(x: number, z: number, feet: number) {
    const b = this.host.bounds;
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return true;
    // (low down, the street plan's walls hold whatever the field shows; caught inside one, the way out is free)
    if (feet < this.host.curb + WALLS_UP && this.host.solid(x, z) && !this.host.solid(this.host.camera.position.x, this.host.camera.position.z)) return true;
    const top = feet + STEP_UP;
    // (somehow inside something: the way out is never a wall)
    const eye = this.host.camera.position;
    if (top < this.at(eye.x, eye.z)) return false;
    const r = this.grounded ? RADIUS : AIR_RADIUS;
    return top < this.at(x, z) || top < this.at(x + r, z) || top < this.at(x - r, z) || top < this.at(x, z + r) || top < this.at(x, z - r);
  }

  /**
   * Which hand throws at `a`: the one on its side when it is clearly to one side of the view; near
   * the middle, in a chain of swings, the other hand from the last (left, right, left); else the same.
   */
  private handFor(a: THREE.Vector3) {
    const eye = this.host.camera.position;
    const yaw = this.host.heading();
    const across = (a.x - eye.x) * Math.cos(yaw) - (a.z - eye.z) * Math.sin(yaw);
    const ahead = -(a.x - eye.x) * Math.sin(yaw) - (a.z - eye.z) * Math.cos(yaw);
    const lat = Math.atan2(across, Math.max(0.5, ahead));
    const chain = this.chaining();
    if (Math.abs(lat) > (chain ? 0.6 : 0.28)) return lat > 0 ? 1 : -1;
    return chain ? -this.side : this.side;
  }

  /** Off the line in the air, just after one: the next throw is the next beat of a chain. */
  private chaining() {
    return this.active && !this.grounded && !this.anchor && this.clock - this.letGo < 2.5;
  }

  /** The length a line to `a` ends up at: as long as it is, unless that would drag you along the street. */
  private restLength(a: THREE.Vector3, d: number) {
    return Math.min(d, Math.max(4, a.y - (this.host.curb + CLEARANCE + EYE)));
  }

  /** Contact with the floor, including a cancelled throw that has not handed back to walking. */
  private canLaunch() {
    const p = this.host.camera.position;
    return this.grounded || (this.v.y <= 1 && p.y - EYE <= this.floor(p.x, p.z, p.y - EYE) + 0.25);
  }

  /**
   * Something built under the hit (a facade, a roof, a tree): the field rises to it within a step
   * round it. A person, a car or a bus is never in the field, so a line never holds on one. With no
   * field yet, the visible hit stands as it is.
   */
  private anchored(hit: THREE.Vector3) {
    const f = this.host.field();
    if (!f) return true;
    const r = Math.max(1.5, f.cell * 1.6);
    for (let dx = -r; dx <= r; dx += f.cell)
      for (let dz = -r; dz <= r; dz += f.cell) if (this.at(hit.x + dx, hit.z + dz) >= hit.y - 0.75) return true;
    return false;
  }

  /** Can a line hold at this visible point? Not your own hands, not the ground, nothing out of reach, nothing that moves. */
  holdable(hit: THREE.Vector3) {
    const distance = hit.distanceTo(this.host.camera.position);
    return distance >= 2 && distance <= REACH && hit.y >= this.host.curb + 1 && this.anchored(hit);
  }

  /** The visible hit as it is: no scan to the sides, no lift, no retarget by speed (and no other target looked for). */
  private target(out: THREE.Vector3) {
    const hit = this.host.target?.(out);
    return hit && this.holdable(hit) ? hit : null;
  }

  /** The key or the button, held or let go. */
  hold(on: boolean) {
    if (on === this.held) return;
    this.held = on;
    if (!on) {
      // let go: ballistic from here, all the speed kept, no bonus to repeat
      if (this.anchor && !this.grounded) this.letGo = this.clock;
      this.anchor = null;
      return;
    }
    if (!this.active) {
      this.v.set(0, 0, 0);
      this.host.velocity?.(this.v);
    }
    const to = this.target(this.aimSpot);
    if (!to) return;
    this.side = this.handFor(to);
    this.reach.side = this.side;
    this.sound.start();
    this.sound.cast(this.side);
    const p = this.host.camera.position;
    this.launchPending = this.canLaunch();
    this.anchor = to.clone();
    const d = to.distanceTo(p);
    this.len = d;
    // long enough to swing, short enough to clear the street at the bottom of the arc
    this.want = this.restLength(to, d);
    this.shot = 0;
    this.flightTime = THREE.MathUtils.clamp(d / 180, 0.08, 0.24);
    this.reelSpeed = 0;
    this.wave = 0.55;
    this.taut = false;
    this.active = true;
    this.grounded = false;
  }

  /** Back to plain walking, nothing held, nothing drawn. */
  reset() {
    this.active = false;
    this.anchor = null;
    this.held = false;
    this.grounded = false;
    this.line.visible = this.knot.visible = this.reach.on = this.reach.ready = false;
    this.reach.both = this.yank = this.climbT = 0;
    this.launchPending = false;
    this.reelSpeed = this.speedFeel = 0;
    this.v.set(0, 0, 0);
    this.lean = this.nod = 0;
    this.host.lean(0);
    this.host.nod(0);
    this.sound.air(0);
    this.streaks.hide();
  }

  /** The walker's update hands the keys over: true when the swing moved the camera itself. */
  move = (dt: number, forward: number, right: number, jump: boolean, run: boolean) => {
    this.clock += dt;
    this.aimAt -= dt;
    if (this.pollAim && this.aimAt <= 0) {
      this.aimAt = 0.08;
      this.aim = this.target(this.aimSpot);
    }
    if (!this.active) {
      this.relax(dt);
      return false;
    }
    const input = Math.max(1, Math.hypot(forward, right));
    forward /= input;
    right /= input;
    const clamped = Math.min(dt, 0.1);
    const n = Math.max(1, Math.ceil(clamped * 240));
    for (let i = 0; i < n; i++) {
      this.step(clamped / n, forward, right, jump, run);
      if (!this.active) {
        this.relax(dt);
        return false;
      }
    }
    this.draw(dt);
    return true;
  };

  /** Off the swing: the view narrows back to its rest, the air settles. */
  private relax(dt: number) {
    const cam = this.host.camera;
    this.speedFeel = 0;
    if (this.widened) {
      cam.fov += (this.host.fov - cam.fov) * (1 - Math.exp(-dt * 5));
      if (Math.abs(cam.fov - this.host.fov) < 0.02) {
        cam.fov = this.host.fov;
        this.widened = false;
      }
      cam.updateProjectionMatrix();
    }
    if (this.streaks.root.visible) this.streaks.update(dt, cam.position.x, cam.position.y, cam.position.z, 0, 0, 0, 0);
  }

  private step(dt: number, forward: number, right: number, jump: boolean, run: boolean) {
    const p = this.host.camera.position;
    const v = this.v;
    const yaw = this.host.heading();
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (this.anchor && this.shot < 1) {
      this.shot = Math.min(1, this.shot + dt / this.flightTime);
      // the line holds: off the ground, along it
      if (this.shot >= 1 && this.launchPending) {
        this.launchPending = false;
        this.yank = 0.4;
        this.dir.copy(this.anchor).sub(p).normalize();
        v.addScaledVector(this.dir, Math.max(0, LAUNCH_SPEED - v.dot(this.dir)));
      }
    }
    const a = this.shot >= 1 ? this.anchor : null;
    if (this.grounded) {
      // up on a roof: an ordinary walk
      const top = run ? 11 : 6;
      const k = Math.min(1, dt * 12);
      v.x += ((forward * fx - right * fz) * top - v.x) * k;
      v.z += ((forward * fz + right * fx) * top - v.z) * k;
      if (jump) {
        v.y = 7.5;
        this.grounded = false;
      }
    } else if (!a) {
      v.x += (forward * fx - right * fz) * AIR_STEER * dt;
      v.z += (forward * fz + right * fx) * AIR_STEER * dt;
    }
    if (!this.grounded) v.y -= GRAVITY * dt;
    // (the air holds you up a little off the line: a long fall ends at a speed, it does not go on growing)
    if (!this.grounded) v.multiplyScalar(Math.exp(-v.length() * AIR_DRAG * dt));
    let pull = 0;
    if (a && !this.grounded) {
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const dz = p.z - a.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      // the weight thrown forward: along the arc, never along the line
      const push = forward * fx - right * fz;
      const pushZ = forward * fz + right * fx;
      if (push || pushZ) {
        const along = (push * dx + pushZ * dz) / d;
        const drive = PUMP * Math.max(0, 1 - v.length() / MAX_SPEED);
        v.x += (push - (along * dx) / d) * drive * dt;
        v.y += ((-along * dy) / d) * drive * dt;
        v.z += (pushZ - (along * dz) / d) * drive * dt;
      }
      pull = d;
    }
    const speed = v.length();
    if (speed > MAX_SPEED) v.multiplyScalar(MAX_SPEED / speed);
    const feet = p.y - EYE;
    const nx = p.x + v.x * dt;
    const nz = p.z + v.z * dt;
    let ny = p.y + v.y * dt;
    let wall = false;
    // slide along walls; a held line being taken up pulls you up the facade
    if (!this.blocked(nx, p.z, feet)) p.x = nx;
    else {
      wall = true;
      v.x = 0;
    }
    if (!this.blocked(p.x, nz, feet)) p.z = nz;
    else {
      wall = true;
      v.z = 0;
    }
    if (a) {
      // the length: taken up to what clears the street, then it stays: a pendulum, not a winch
      const hauling = this.held && this.len > this.want + 0.25 && a.y > p.y + 2;
      if (hauling && !wall) {
        // (the contact holds once the wall has stopped you: else the line pays out every frame
        // against the facade and you stay stuck at its foot)
        const dx = a.x - p.x;
        const dz = a.z - p.z;
        const distance = Math.max(1, Math.hypot(dx, dz));
        wall = this.blocked(p.x + (dx / distance) * 0.12, p.z + (dz / distance) * 0.12, feet);
      }
      if (wall && a.y > p.y && (forward > 0.2 || jump || hauling)) {
        this.climbT = 0.3;
        this.want = Math.max(1.5, this.want - CLIMB * dt);
        // (up the wall at a climb, whatever the line was doing)
        v.y += THREE.MathUtils.clamp(CLIMB - v.y, -12 * dt, 28 * dt);
        ny = p.y + v.y * dt;
      }
      const targetRate = this.len > this.want && !wall ? takeUp(this.len - this.want) : 0;
      this.reelSpeed += THREE.MathUtils.clamp(targetRate - this.reelSpeed, -35 * dt, 24 * dt);
      const rate = Math.min(this.reelSpeed, Math.max(0, this.len - this.want) / dt);
      if (rate) this.len = Math.max(this.want, this.len - rate * dt);
      const dx = p.x - a.x;
      const dy = ny - a.y;
      const dz = p.z - a.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > this.len) {
        const k = this.len / d;
        const tx = a.x + dx * k;
        const ty = a.y + dy * k;
        const tz = a.z + dz * k;
        if (wall || !this.clearPull(p.x, ny, p.z, tx, ty, tz)) {
          // (a correction that cannot be made injects no speed up or in)
          this.len = d;
          this.reelSpeed = 0;
        } else {
          // what would stretch it goes; along the arc, all the speed stays
          const nd = 1 / d;
          const out = (v.x * dx + v.y * dy + v.z * dz) * nd;
          if (out > 0) {
            v.x -= dx * nd * out;
            v.y -= dy * nd * out;
            v.z -= dz * nd * out;
            if (!this.taut && out > 3) {
              this.taut = true;
              this.sound.taut(Math.min(1, out / 16));
              this.wave = Math.max(this.wave, 0.12);
            }
          }
          // (the line coming in carries you with it: speed, not a jump in where you are)
          if (rate && !wall) {
            const nowIn = -(v.x * dx + v.y * dy + v.z * dz) * nd;
            if (nowIn < rate) {
              const add = (rate - nowIn) * nd;
              v.x -= dx * add;
              v.y -= dy * add;
              v.z -= dz * add;
            }
          }
          p.x = tx;
          p.z = tz;
          ny = ty;
        }
      }
      // over a roof's edge, the line lets go by itself (a facade point is a place to hang, not this)
      if (pull && pull < 2.2 && ny - EYE >= this.at(a.x, a.z) - STEP_UP) {
        this.anchor = null;
        this.reach.vaults++;
      }
    }
    if (v.lengthSq() > MAX_SPEED * MAX_SPEED) v.setLength(MAX_SPEED);
    const under = this.floor(p.x, p.z, Math.max(ny, p.y) - EYE);
    if (ny - EYE <= under && v.y <= 0) {
      const hit = -v.y;
      p.y = under + EYE;
      v.y = 0;
      this.grounded = !this.anchor;
      if (this.grounded && hit > 4) this.sound.land(Math.min(1, hit / 20));
      // where the walker can stand on its own again (the street, a bridge's deck): it takes over, still running
      const raised = this.host.ground?.(p.x, p.z) ?? null;
      const floor = raised ?? this.host.curb;
      if (this.grounded && Math.abs(under - floor) < STEP_UP && (raised !== null || !this.host.solid(p.x, p.z))) {
        const held = this.held;
        const vx = THREE.MathUtils.clamp(v.x, -9, 9);
        const vz = THREE.MathUtils.clamp(v.z, -9, 9);
        this.reset();
        this.held = held;
        this.host.landed(Math.min(1, hit / 20), vx, vz, under);
      }
    } else {
      p.y = ny;
      if (this.grounded && this.floor(p.x, p.z, p.y - EYE) < p.y - EYE - 0.05) this.grounded = false;
    }
  }

  /** The whole rope correction checked, not just its end (thin walls and roof corners). */
  private clearPull(x: number, y: number, z: number, tx: number, ty: number, tz: number) {
    const steps = Math.max(1, Math.ceil(Math.hypot(tx - x, ty - y, tz - z) / 0.25));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.blocked(x + (tx - x) * t, z + (tz - z) * t, y + (ty - y) * t - EYE)) return false;
    }
    return true;
  }

  private draw(dt: number) {
    const cam = this.host.camera;
    const v = this.v;
    const eye = cam.position;
    this.time += dt;
    const speed = v.length();
    // the air: the view widens with speed, and you hear it (softer with reduced motion)
    const reduced = this.motion?.matches ?? false;
    const rush = THREE.MathUtils.smoothstep(speed, 8, 48);
    this.speedFeel += (rush - this.speedFeel) * (1 - Math.exp(-dt * (rush > this.speedFeel ? 3 : 5)));
    const fov = this.host.fov + this.speedFeel * (reduced ? 3 : 15);
    cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 4));
    cam.updateProjectionMatrix();
    this.widened = true;
    this.sound.air(Math.max(0, speed - 6) / 42);
    this.streaks.update(dt, eye.x, eye.y, eye.z, v.x, v.y, v.z, reduced ? 0 : this.speedFeel * 0.42);
    const yaw = this.host.heading();
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const a = this.anchor;
    // the body hangs under the line: the view leans toward where it goes up, and with the way you are thrown
    let leanTo = -(v.x * rx + v.z * rz) / 70;
    if (a) {
      const across = ((a.x - eye.x) * rx + (a.z - eye.z) * rz) / Math.max(4, a.distanceTo(eye));
      leanTo += -across * 0.12;
    }
    this.lean += ((reduced ? 0 : THREE.MathUtils.clamp(leanTo, -0.16, 0.16)) - this.lean) * (1 - Math.exp(-dt * 5));
    this.host.lean(this.lean);
    // the head goes with the swing: down into the dive, up out of it (only the view, never the aim)
    const ahead = v.x * fx + v.z * fz;
    const nodTo = this.grounded || reduced ? 0 : THREE.MathUtils.clamp((v.y / 90) * (ahead > 0 ? 1 : 0.4), -0.09, 0.09);
    this.nod += (nodTo - this.nod) * (1 - Math.exp(-dt * 4));
    this.host.nod(this.nod);
    this.line.visible = this.reach.on = this.knot.visible = !!a;
    // in the air with a hold in reach: the hand that will throw comes up ready
    this.reach.ready = !a && !this.grounded && !!this.aim;
    if (this.reach.ready) this.reach.next = this.handFor(this.aim!);
    this.yank = Math.max(0, this.yank - dt);
    this.climbT = Math.max(0, this.climbT - dt);
    // (the other hand joins once the line holds: the yank off the street, a wall hand over hand, a long take-up)
    const pulling = !!a && this.shot >= 1 && (this.yank > 0 || this.climbT > 0 || this.len - this.want > 14);
    this.reach.both += ((pulling ? 1 : 0) - this.reach.both) * (1 - Math.exp(-dt * (pulling ? 14 : 6)));
    if (!a) return;
    this.wave *= Math.exp(-dt * 5);
    cam.updateMatrixWorld();
    // the arm: out from the shoulder, low on the side of the hand that threw, along the line
    // (in the view's own frame: x right, y up, −z ahead)
    const s = this.side;
    const shoulder = this.a.set(0.3 * s, -0.5, -0.12);
    this.inv.copy(cam.matrixWorld).invert();
    this.dir.copy(a).applyMatrix4(this.inv).sub(shoulder).normalize();
    if (this.shot < 0.2) this.lagReach = Math.min(this.lagReach, 0.55);
    this.lagReach += (1 - this.lagReach) * (1 - Math.exp(-dt * 18));
    const hand = this.b.copy(shoulder).addScaledVector(this.dir, 0.5 * this.lagReach);
    // (a hold overhead or behind: the hand still reaches out in front, never into the eye; it stays
    // low and to its own side, the line going on up from it: the view and the reticle stay clear)
    if (hand.z > -0.42) hand.z = -0.42;
    if (hand.y > -0.12) hand.y = -0.12;
    if (hand.x * s < 0.1) hand.x = 0.1 * s;
    // the other hand on the line a little further up it (hand over hand while climbing)
    const over = this.climbT > 0 ? Math.sin(this.time * 11) * 0.07 : 0;
    this.reach.hand2.copy(hand).addScaledVector(this.dir, 0.17 + over);
    this.reach.hand2.x -= s * 0.05;
    this.reach.hand2.z = Math.min(this.reach.hand2.z, -0.44);
    this.reach.hand2.y = Math.min(this.reach.hand2.y, -0.06);
    hand.addScaledVector(this.dir, -over * 0.6);
    this.reach.hand.copy(hand).applyMatrix4(cam.matrixWorld);
    this.reach.hand2.applyMatrix4(cam.matrixWorld);
    this.reach.shoulder.copy(shoulder).applyMatrix4(cam.matrixWorld);
    this.reach.shoulder2.set(-0.3 * s, -0.5, -0.12).applyMatrix4(cam.matrixWorld);
    this.drawLine(this.reach.hand);
    this.knot.position.copy(a);
    this.knot.visible = this.shot >= 1;
  }

  /** The line from the hand `from` (world): thrown, flying out with a wave in it; once it holds, slack only if it is longer than the way. */
  private drawLine(from: THREE.Vector3) {
    const a = this.anchor;
    if (!a) return;
    const tip = this.tip.copy(from).lerp(a, 1 - (1 - this.shot) ** 3);
    const slack = Math.min(4, Math.max(0, this.len - from.distanceTo(a)) * 0.5) + (1 - this.shot) * 1.2;
    this.line.draw(from, tip, this.host.camera.position, slack, this.wave, this.time);
  }
}
