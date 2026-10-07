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

  /**
   * How many places stay on the GPU. Every place stays built (its people, timers and listeners
   * live on), but the least recently visited beyond `keep` have their GPU copies freed: all 26
   * together held ~13,000 geometries and ~3,500 textures. Entering a parked place uploads it again
   * (three.js does it by itself on the first frame, behind the entry fade).
   */
  keep = 8;
  private parked = new Set<Interior>();

  /** Walk into a place, on its ground floor (or `floor`). */
  enter(key: Key, floor = 0) {
    let i = this.cache.get(key);
    if (!i) {
      i = this.build[key]();
      this.cache.set(key, i);
      exitSign(i);
    } else {
      // most recently visited last
      this.cache.delete(key);
      this.cache.set(key, i);
      this.parked.delete(i);
    }
    this.park(i);
    this.ev.fade();
    this.active = i;
    this.walk.enabled = true;
    this.goTo(floor);
    this.ev.entered(i, this.floor);
  }

  /** Free the GPU copies of the least recently visited places beyond `keep`. */
  private park(entering: Interior) {
    let n = this.cache.size;
    for (const old of this.cache.values()) {
      if (n <= this.keep) break;
      n--;
      if (old === entering || old === this.active || this.parked.has(old)) continue;
      this.parked.add(old);
      freeGpu(old.scene);
    }
  }

  /** Take the elevator. */
  goTo(floor: number) {
    const i = this.active;
    if (!i) return;
    this.floor = THREE.MathUtils.clamp(floor, 0, i.floors.length - 1);
    const f = i.floors[this.floor];
    i.setFloor?.(this.floor);
    this.walk.place(f.spawn, f.yaw, f.y);
    const n = this.floor;
    this.walk.ground = i.groundAt ? (x, z) => i.groundAt!(n, x, z) : undefined;
    this.walk.colliders = i.colliders(this.floor);
    // every place is entered from the street side (+z) on its ground floor
    this.walk.door = this.floor === 0 ? doorOf(f, this.walk.colliders) : null;
    this.walk.arrived();
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
    // walking out of the door closes the place mid-frame
    if (!this.active) return;
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
  const d = doorOf(f, i.colliders(0));
  sign.position.set(d.x, f.y + 2.45, d.z - 0.06);
  sign.rotation.y = Math.PI;
  i.scene.add(sign);
}

/**
 * The way out of a ground floor: the wall behind where you come in (every place is entered from
 * the street side, +z). Its line is the nearest collider edge behind the spawn point.
 */
function doorOf(f: { spawn: THREE.Vector3 }, rects: [number, number, number, number][]) {
  let z = f.spawn.z + 0.9;
  let best = Infinity;
  for (const [x0, z0, x1] of rects)
    if (f.spawn.x > x0 - 0.5 && f.spawn.x < x1 + 0.5 && z0 > f.spawn.z && z0 - f.spawn.z < best) {
      best = z0 - f.spawn.z;
      z = z0;
    }
  return { x: f.spawn.x, z };
}

/**
 * Free a scene's GPU copies without touching the scene: geometries, materials and textures stay
 * as they are and three.js uploads them again the next time they are drawn (shared ones, like a
 * kit's common materials or the portrait atlas, simply get uploaded again by whoever draws them).
 * Rendered panoramas (render-target textures) belong to the pool in main and are left alone.
 */
function freeGpu(scene: THREE.Scene) {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const ms = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of ms) materials.add(mat);
  });
  for (const mat of materials) {
    for (const v of Object.values(mat)) if ((v as THREE.Texture)?.isTexture) textures.add(v as THREE.Texture);
    const u = (mat as THREE.ShaderMaterial).uniforms;
    if (u) for (const x of Object.values(u)) if ((x?.value as THREE.Texture)?.isTexture) textures.add(x.value as THREE.Texture);
    mat.dispose();
  }
  for (const t of textures) if (!(t as THREE.Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture && t.version > 0) t.dispose();
}
