import * as THREE from "three";
import type { Rect } from "./types";

const EYE = 1.6;
const RADIUS = 0.3;
const SPEED = 3.2;

/**
 * First-person walking: ZQSD / WASD / arrows to move, drag to look around, the wheel steps
 * forward and back, Shift to hurry. On touch screens the on-screen stick (`stick`) moves and a
 * finger dragged anywhere else looks around. Walls are 2D rectangles; the walker slides along them.
 */
export class WalkControls {
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.05, 220);
  enabled = false;
  colliders: Rect[] = [];
  /** More walls, kept apart from the place's own (lift cars, stair cores, flight rails). */
  extra: Rect[] = [];
  private yaw = 0;
  private pitch = -0.08;
  private floorY = 0;
  private keys = new Set<string>();
  /** Is the walker being moved (keys or the touch stick)? */
  get walking() {
    return ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "z", "q"].some((k) => this.keys.has(k)) || Math.abs(this.stick.x) + Math.abs(this.stick.y) > 0.1;
  }
  private drag: { x: number; y: number; id: number } | null = null;
  /** Analog move from the touch stick: x strafes right, y walks forward, both in [-1, 1]. */
  readonly stick = { x: 0, y: 0 };
  /** An on-screen button held like a key (the touch stick's jump: " "). */
  hold(key: string, on: boolean) {
    if (on) this.keys.add(key);
    else this.keys.delete(key);
  }
  private moved = 0;
  private push = 0;
  /** Space jumps on the street; inside a place the walk keeps its feet on the floor (a jump went through ceilings). */
  canJump = true;
  /** Jumping (Space): height above the floor and vertical speed. */
  private hop = 0;
  private vy = 0;
  /** Where you came in (ground floor only): walking back into that wall takes you out. */
  door: { x: number; z: number } | null = null;
  /** Obstacles other than `colliders` (the street uses its own grid). */
  collide?: (x: number, z: number) => boolean;
  /** Floor height under (x, z) on the street (stairs, platforms, bridges); the base floor if null. */
  ground?: (x: number, z: number) => number | null;
  private baseFloor = 0;
  onExit?: () => void;
  private sinceArrival = 0;

  constructor(dom: HTMLElement) {
    this.camera.rotation.order = "YXZ";
    window.addEventListener("keydown", (e) => {
      if (!this.enabled || /input|textarea|select/i.test((e.target as HTMLElement).tagName)) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k.startsWith("arrow") || k === " ") e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
    dom.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      // one finger looks around; a second one (on the stick, say) never steals it
      if (this.drag) return;
      this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.moved = 0;
    });
    window.addEventListener("pointermove", (e) => {
      if (!this.enabled || !this.drag || e.pointerId !== this.drag.id) return;
      const dx = e.clientX - this.drag.x,
        dy = e.clientY - this.drag.y;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      // a finger on glass wants a little more turn per pixel than a mouse
      const k = e.pointerType === "touch" ? 0.0065 : 0.004;
      this.yaw -= dx * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.2, 1.2);
    });
    const release = (e: PointerEvent) => {
      if (this.drag?.id === e.pointerId) this.drag = null;
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    dom.addEventListener(
      "wheel",
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.push += -Math.sign(e.deltaY) * 0.9;
      },
      { passive: false },
    );
  }

  /** Carried along (an escalator): world velocity in m/s, or null. */
  drift: [number, number] | null = null;

  /**
   * Moved without a cut (riding a lift, turning a stair core's landing onto the next floor): the
   * camera, the floor under it and the heading all shift together, so the view doesn't jump.
   */
  shift(dx: number, dy: number, dz: number, dyaw = 0) {
    this.camera.position.x += dx;
    this.camera.position.y += dy;
    this.camera.position.z += dz;
    this.floorY += dy;
    this.baseFloor += dy;
    this.yaw += dyaw;
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  // ---- walking through a door without a cut (main.ts walkOut) ----
  /** Momentum from walking out of a door, m/s: it runs out by itself unless the keys keep it up. */
  private carried: [number, number] | null = null;
  /** Already moving (out of a door, still walking). */
  carry(vx: number, vz: number) {
    this.carried = [vx, vz];
  }

  /** Look this way, straight off: walking through from a place where you were already looking. */
  aim(yaw: number, pitch: number) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.camera.rotation.set(pitch, yaw, 0);
  }

  /** The keys still held from another walker: walking through a door, W stays down. */
  takeKeys(from: WalkControls) {
    for (const k of from.keys) this.keys.add(k);
    from.keys.clear();
  }

  /** Where the look goes up or down. */
  get tilt() {
    return this.pitch;
  }

  // ---- another mover (the swing on foot, src/scene/swing): it takes the walk over while it runs ----
  /** Called each update with the keys; true means it moved the camera itself this frame. */
  mover: ((dt: number, forward: number, right: number, jump: boolean, run: boolean) => boolean) | null = null;
  /** Lean and nod of the view (radians), on top of the look: the aim stays where it was. */
  roll = 0;
  nod = 0;
  /** Placed somewhere new (a door, a teleport, back from the map): whatever was moving stops. */
  onPlace?: () => void;
  /** The walk's own speed (m/s), measured frame to frame: the swing takes it over. */
  private vel = new THREE.Vector3();
  private was = new THREE.Vector3();
  /** Momentum kept on landing, sliding out over a moment. */
  private glide: [number, number] | null = null;

  /** What the walk is doing now (m/s), jumps included. */
  velocity(out: THREE.Vector3) {
    return out.copy(this.vel);
  }

  /** Back on its own feet on a floor at `floorY`, still going at (vx, vz) m/s for a step or two. */
  resume(floorY: number, vx: number, vz: number) {
    this.floorY = floorY;
    this.hop = this.vy = 0;
    this.glide = Math.hypot(vx, vz) > 0.2 ? [vx, vz] : null;
    this.was.copy(this.camera.position);
  }

  /** Turn the look by radians (a held touch button's own drag). */
  turn(dyaw: number, dpitch: number) {
    this.yaw += dyaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dpitch, -1.2, 1.2);
  }

  /** The glide after a landing, and the speed the walk really went at this frame. */
  private follow(dt: number) {
    const p = this.camera.position;
    if (this.glide) {
      const [vx, vz] = this.glide;
      p.x += vx * dt;
      if (this.blocked(p.x, p.z)) p.x -= vx * dt;
      p.z += vz * dt;
      if (this.blocked(p.x, p.z)) p.z -= vz * dt;
      const k = Math.exp(-dt * 6);
      this.glide = Math.hypot(vx, vz) * k > 0.2 ? [vx * k, vz * k] : null;
    }
    if (dt > 0) this.vel.set((p.x - this.was.x) / dt, this.vy, (p.z - this.was.z) / dt);
    // (a cut, not a walk)
    if (this.vel.lengthSq() > 400) this.vel.set(0, 0, 0);
    this.was.copy(p);
    this.roll *= Math.exp(-dt * 8);
    this.nod *= Math.exp(-dt * 8);
  }
  // ---- (end of the mover) ----

  /** Would a body stand inside a wall at (x, z)? (The game's own mover asks, src/gta.) */
  blockedAt(x: number, z: number) {
    return this.blocked(x, z);
  }

  /** The floor when no special ground is under the walker. */
  get base() {
    return this.baseFloor;
  }

  /** Stand on this floor now (the game's third-person body moves the walker itself, src/gta). */
  setFloor(y: number) {
    this.floorY = y;
  }

  /** The floor height when there is no special ground under the walker. */
  setBase(y: number) {
    this.baseFloor = y;
  }

  /** Turn a little toward a heading (the lift turns you to face its doors). */
  turnToward(yaw: number, k: number) {
    let d = (yaw - this.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, k);
  }

  /** Just placed (entered, took the elevator): no walking straight back out for a moment. */
  arrived() {
    this.sinceArrival = 0;
  }

  /** How far the way out is, and whether the walker faces it (for the EXIT prompt). */
  exitAhead(): { dist: number; facing: boolean } | null {
    const d = this.door;
    if (!d) return null;
    const p = this.camera.position;
    const dist = Math.hypot(p.x - d.x, Math.max(0, d.z - p.z));
    return { dist, facing: -Math.cos(this.yaw) > 0.35 && Math.abs(p.x - d.x) < 2.5 };
  }

  /** Was the last press a drag (a look around) rather than a click? */
  get dragged() {
    return this.moved > 6;
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Stand somewhere, looking along `yaw` (0 = toward −z). */
  place(p: THREE.Vector3, yaw: number, floorY = p.y) {
    this.floorY = floorY;
    this.baseFloor = floorY;
    this.camera.position.set(p.x, floorY + EYE, p.z);
    this.yaw = yaw;
    this.pitch = -0.08;
    this.push = 0;
    this.carried = null;
    this.glide = null;
    this.vel.set(0, 0, 0);
    this.was.copy(this.camera.position);
    this.onPlace?.();
  }

  update(dt: number) {
    if (!this.enabled) return;
    const k = this.keys;
    // ZQSD and WASD both work, whatever the keyboard
    let f = (k.has("z") || k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0) + this.stick.y;
    const r = (k.has("d") ? 1 : 0) - (k.has("q") || k.has("a") ? 1 : 0) + this.stick.x;
    // arrows left/right turn, letters strafe
    this.yaw += ((k.has("arrowleft") ? 1 : 0) - (k.has("arrowright") ? 1 : 0)) * dt * 1.8;
    // the wheel gives a short push forward or back
    if (Math.abs(this.push) > 0.01) {
      const step = this.push * Math.min(1, dt * 8);
      this.push -= step;
      f += step / (SPEED * dt + 1e-6);
    }
    // the stick pushed all the way out runs, like Shift
    const run = k.has("shift") || Math.hypot(this.stick.x, this.stick.y) > 0.92;
    const speed = SPEED * (run ? 2 : 1);
    // another mover has the walk for now (the swing): it gets the keys and moves the camera itself
    if (this.mover?.(dt, THREE.MathUtils.clamp(f, -1, 1), THREE.MathUtils.clamp(r, -1, 1), k.has(" "), run)) {
      this.hop = this.vy = 0;
      this.glide = null;
      this.was.copy(this.camera.position);
      this.camera.rotation.set(this.pitch + this.nod, this.yaw, this.roll);
      return;
    }
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = fwd.multiplyScalar(f).add(right.multiplyScalar(r));
    if (move.lengthSq() > 1) move.normalize();
    move.multiplyScalar(speed * dt);
    const p = this.camera.position;
    // one axis at a time, so the walker slides along walls instead of sticking
    p.x += move.x;
    if (this.blocked(p.x, p.z)) p.x -= move.x;
    p.z += move.z;
    if (this.blocked(p.x, p.z)) p.z -= move.z;
    // out of a door with nothing held: a step or two on, slowing to a stop
    if (this.carried) {
      const [vx, vz] = this.carried;
      if (this.walking || Math.hypot(vx, vz) < 0.1) this.carried = null;
      else {
        p.x += vx * dt;
        if (this.blocked(p.x, p.z)) p.x -= vx * dt;
        p.z += vz * dt;
        if (this.blocked(p.x, p.z)) p.z -= vz * dt;
        const k = Math.exp(-dt * 3.5);
        this.carried = [vx * k, vz * k];
      }
    }
    if (this.drift) {
      const [vx, vz] = this.drift;
      p.x += vx * dt;
      if (this.blocked(p.x, p.z)) p.x -= vx * dt;
      p.z += vz * dt;
      if (this.blocked(p.x, p.z)) p.z -= vz * dt;
    }
    // walking out through the door (the wall behind where you came in): back to the street
    const d = this.door;
    this.sinceArrival += dt;
    if (d && this.sinceArrival > 0.8 && move.z > 0 && Math.abs(p.x - d.x) < 1.7 && p.z > d.z - 0.75) this.onExit?.();
    // stairs, platforms, bridges: the floor follows the ground under you
    if (this.ground) this.floorY = this.ground(p.x, p.z) ?? this.baseFloor;
    // Space jumps
    if (this.canJump && k.has(" ") && this.hop <= 0.001 && this.vy <= 0) this.vy = 4.6;
    if (this.vy !== 0 || this.hop > 0) {
      this.vy -= 13 * dt;
      this.hop = Math.max(0, this.hop + this.vy * dt);
      if (this.hop === 0) this.vy = 0;
    }
    p.y += (this.floorY + EYE - p.y) * Math.min(1, dt * 10);
    p.y += this.hop;
    this.follow(dt);
    this.camera.rotation.set(this.pitch + this.nod, this.yaw, this.roll);
  }

  /** The floor height the walker stands on now. */
  get floor() {
    return this.floorY;
  }

  /** The way the walker looks (0 = toward −z). */
  get heading() {
    return this.yaw;
  }

  private blocked(x: number, z: number) {
    if (this.collide?.(x, z)) return true;
    for (const [x0, z0, x1, z1] of this.colliders) if (x > x0 - RADIUS && x < x1 + RADIUS && z > z0 - RADIUS && z < z1 + RADIUS) return true;
    for (const [x0, z0, x1, z1] of this.extra) if (x > x0 - RADIUS && x < x1 + RADIUS && z > z0 - RADIUS && z < z1 + RADIUS) return true;
    return false;
  }
}
