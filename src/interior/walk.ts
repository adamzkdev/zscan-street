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
  private yaw = 0;
  private pitch = -0.08;
  private floorY = 0;
  private keys = new Set<string>();
  private drag: { x: number; y: number; id: number } | null = null;
  /** Analog move from the touch stick: x strafes right, y walks forward, both in [-1, 1]. */
  readonly stick = { x: 0, y: 0 };
  private moved = 0;
  private push = 0;
  /** Where you came in (ground floor only): walking back into that wall takes you out. */
  door: { x: number; z: number } | null = null;
  /** Obstacles other than `colliders` (the street uses its own grid). */
  collide?: (x: number, z: number) => boolean;
  onExit?: () => void;
  private leaving = 0;

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
    this.camera.position.set(p.x, floorY + EYE, p.z);
    this.yaw = yaw;
    this.pitch = -0.08;
    this.push = 0;
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
    const speed = SPEED * (k.has("shift") || Math.hypot(this.stick.x, this.stick.y) > 0.92 ? 2 : 1);
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
    if (this.blocked(p.x, p.z)) {
      p.z -= move.z;
      // pressing on the entrance (behind where you came in) for a moment: out to the street
      const d = this.door;
      if (d && move.z > 0 && Math.abs(p.x - d.x) < 1.7 && p.z > d.z - 0.2) {
        this.leaving += dt;
        if (this.leaving > 0.18) {
          this.leaving = 0;
          this.onExit?.();
        }
      } else this.leaving = 0;
    } else this.leaving = 0;
    p.y += (this.floorY + EYE - p.y) * Math.min(1, dt * 10);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  /** The way the walker looks (0 = toward −z). */
  get heading() {
    return this.yaw;
  }

  private blocked(x: number, z: number) {
    if (this.collide?.(x, z)) return true;
    for (const [x0, z0, x1, z1] of this.colliders) if (x > x0 - RADIUS && x < x1 + RADIUS && z > z0 - RADIUS && z < z1 + RADIUS) return true;
    return false;
  }
}
