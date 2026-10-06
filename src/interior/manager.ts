import * as THREE from "three";
import type { Interior, PickInfo } from "./types";
import { WalkControls } from "./walk";
import { Router } from "./path";
import type { Snark } from "../scene/snark";

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
  private routers = new Map<Interior, Router[]>();
  private routeCheck = 0;
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
      exitSign(i);
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
    i.setFloor?.(this.floor);
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

  /** Everyone inside gets the way round the furniture of their floor (people arrive any time). */
  private giveRoutes(i: Interior) {
    let rs = this.routers.get(i);
    if (!rs) this.routers.set(i, (rs = i.floors.map((_, k) => new Router(i.colliders(k)))));
    i.scene.traverse((o) => {
      const s = o.userData.snarkRef as Snark | undefined;
      if (!s || s.router) return;
      const y = s.root.getWorldPosition(new THREE.Vector3()).y;
      let best = 0;
      i.floors.forEach((f, k) => Math.abs(f.y - y) < Math.abs(i.floors[best].y - y) && (best = k));
      s.router = rs![best];
    });
  }

  update(dt: number, t: number) {
    if (!this.active) return;
    this.routeCheck -= dt;
    if (this.routeCheck <= 0) {
      this.routeCheck = 0.5;
      this.giveRoutes(this.active);
    }
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

  /** A character (zkSNARK) under the pointer inside, if any: they can be talked to. */
  snarkAt(x: number, y: number): Snark | null {
    const i = this.active;
    if (!i) return null;
    const people: THREE.Object3D[] = [];
    i.scene.traverse((o) => {
      const s = o.userData.snarkRef as Snark | undefined;
      if (s && s.root === o && o.visible) people.push(o);
    });
    if (!people.length) return null;
    this.ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.walk.camera);
    const hit = this.ray.intersectObjects(people, true)[0];
    for (let o: THREE.Object3D | null = hit?.object ?? null; o; o = o.parent) if (o.userData.snarkRef) return o.userData.snarkRef as Snark;
    return null;
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

/** A green EXIT sign over every place's way out (its ground floor door, behind where you come in). */
function exitSign(i: Interior) {
  const f = i.floors[0];
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b7a3e";
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = "#e9fff3";
  g.lineWidth = 4;
  g.strokeRect(6, 6, 244, 84);
  g.fillStyle = "#ffffff";
  g.font = '800 44px "JetBrains Mono", Menlo, monospace';
  g.textBaseline = "middle";
  g.fillText("EXIT", 22, 50);
  g.font = '700 40px "Hiragino Sans", "Noto Sans JP", sans-serif';
  g.fillText("出口", 150, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3), side: THREE.DoubleSide }));
  sign.position.set(f.spawn.x, f.y + 2.55, f.spawn.z + 0.72);
  sign.rotation.y = Math.PI;
  i.scene.add(sign);
}
