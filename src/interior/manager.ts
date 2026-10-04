import * as THREE from "three";
import type { Interior, PickInfo } from "./types";
import { WalkControls } from "./walk";

type Key = Interior["key"];

export interface InteriorEvents {
  entered(i: Interior, floor: number): void;
  left(): void;
  /** A short fade to black covers each jump (entering, leaving, the elevator). */
  fade(): void;
}

/**
 * Owns the walk-in places: builds each one the first time it is entered (then keeps it), moves
 * the walker between floors, and turns clicks into info for the panel.
 */
export class InteriorManager {
  readonly walk: WalkControls;
  active: Interior | null = null;
  floor = 0;
  private cache = new Map<Key, Interior>();
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  constructor(
    dom: HTMLElement,
    private build: Record<Key, () => Interior>,
    private ev: InteriorEvents,
  ) {
    this.walk = new WalkControls(dom);
    this.walk.onExit = () => this.exit();
    this.ray.far = 30;
  }

  /** Walk into a place, on its ground floor (or `floor`). */
  enter(key: Key, floor = 0) {
    let i = this.cache.get(key);
    if (!i) {
      i = this.build[key]();
      this.cache.set(key, i);
    }
    this.ev.fade();
    this.active = i;
    this.walk.enabled = true;
    this.goTo(floor);
    this.ev.entered(i, this.floor);
  }

  /** Take the elevator. */
  goTo(floor: number) {
    const i = this.active;
    if (!i) return;
    this.floor = THREE.MathUtils.clamp(floor, 0, i.floors.length - 1);
    const f = i.floors[this.floor];
    this.walk.place(f.spawn, f.yaw, f.y);
    this.walk.colliders = i.colliders(this.floor);
    // every place is entered from the street side (+z) on its ground floor
    this.walk.door = this.floor === 0 ? { x: f.spawn.x, z: f.spawn.z } : null;
  }

  exit() {
    if (!this.active) return;
    this.ev.fade();
    this.active = null;
    this.walk.enabled = false;
    this.ev.left();
  }

  update(dt: number, t: number) {
    if (!this.active) return;
    this.walk.update(dt);
    this.active.update(dt, t, this.walk.camera);
  }

  private hitAt(x: number, y: number) {
    const i = this.active;
    if (!i) return null;
    this.ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.walk.camera);
    return this.ray.intersectObjects(i.pickables(), true)[0] ?? null;
  }

  pickAt(x: number, y: number): PickInfo | null {
    const h = this.hitAt(x, y);
    return h && this.active ? this.active.pick(h) : null;
  }

  hoverAt(x: number, y: number): string | null {
    const h = this.hitAt(x, y);
    return h && this.active?.hover ? this.active.hover(h) : null;
  }
}
