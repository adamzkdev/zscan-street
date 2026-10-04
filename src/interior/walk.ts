import * as THREE from "three";
import type { Rect } from "./types";

const EYE = 1.6;
const RADIUS = 0.3;
const SPEED = 3.2;

/**
 * First-person walking: ZQSD / WASD / arrows to move, drag to look around, the wheel steps
 * forward and back, Shift to hurry. Walls are 2D rectangles; the walker slides along them.
 */
export class WalkControls {
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.05, 220);
  enabled = false;
  colliders: Rect[] = [];
  private yaw = 0;
  private pitch = -0.08;
  private floorY = 0;
  private keys = new Set<string>();
  private drag: { x: number; y: number } | null = null;
  private moved = 0;
  private push = 0;

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
      this.drag = { x: e.clientX, y: e.clientY };
      this.moved = 0;
    });
    window.addEventListener("pointermove", (e) => {
      if (!this.enabled || !this.drag) return;
      const dx = e.clientX - this.drag.x,
        dy = e.clientY - this.drag.y;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.drag = { x: e.clientX, y: e.clientY };
      this.yaw -= dx * 0.004;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.004, -1.2, 1.2);
    });
    window.addEventListener("pointerup", () => (this.drag = null));
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
    let f = (k.has("z") || k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
    const r = (k.has("d") ? 1 : 0) - (k.has("q") || k.has("a") ? 1 : 0);
    // arrows left/right turn, letters strafe
    this.yaw += ((k.has("arrowleft") ? 1 : 0) - (k.has("arrowright") ? 1 : 0)) * dt * 1.8;
    // the wheel gives a short push forward or back
    if (Math.abs(this.push) > 0.01) {
      const step = this.push * Math.min(1, dt * 8);
      this.push -= step;
      f += step / (SPEED * dt + 1e-6);
    }
    const speed = SPEED * (k.has("shift") ? 2 : 1);
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
    p.y += (this.floorY + EYE - p.y) * Math.min(1, dt * 10);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private blocked(x: number, z: number) {
    for (const [x0, z0, x1, z1] of this.colliders) if (x > x0 - RADIUS && x < x1 + RADIUS && z > z0 - RADIUS && z < z1 + RADIUS) return true;
    return false;
  }
}
