import * as THREE from "three";
import type { Interior, PickInfo } from "./types";
import { WalkControls } from "./walk";
import { Router } from "./path";
import { Circulation } from "./lift";
import { PLANS } from "./liftplan";
import type { Snark } from "../scene/snark";
import { posterHit } from "../scene/memes";
import { refine } from "./refine";

type Key = Interior["key"];

export interface InteriorEvents {
  entered(i: Interior, floor: number): void;
  left(): void;
  /** A short fade to black covers each jump (entering, leaving, the elevator). */
  fade(): void;
  /** The walker reached another floor on foot or by lift, without a cut (stairs, a lift car). */
  walked?(floor: number): void;
  /** A lift arrived. */
  ding?(): void;
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
  /** The lifts, stairs and escalators of the place you are in (see lift.ts). */
  circ: Circulation | null = null;
  private circs = new Map<Interior, Circulation>();
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

  /**
   * Compiles a scene's shaders ahead of its first frame (set by the app: renderer.compileAsync on
   * one object per variant). While it runs `warming` is true and the app holds the frame behind
   * the entry fade instead of stalling on the first draw.
   */
  compile: ((scene: THREE.Scene, camera: THREE.Camera) => Promise<unknown>) | null = null;
  warming = false;
  private warmId = 0;

  private warmUp(i: Interior, quiet = false) {
    if (!this.compile) return;
    const id = ++this.warmId;
    const t0 = performance.now();
    this.warming = true;
    const done = () => {
      if (id !== this.warmId || !this.warming) return;
      this.warming = false;
      // a long wait: the place is revealed with a fresh fade
      if (!quiet && performance.now() - t0 > 150 && this.active === i) this.ev.fade();
    };
    try {
      this.compile(i.scene, this.walk.camera).then(done, done);
    } catch {
      this.warming = false;
      return;
    }
    setTimeout(done, 1500);
  }

  /** Build a place ahead of its first visit (idle time); it is the first one parked. */
  prebuild(key: Key): Interior | null {
    if (this.cache.has(key) || !this.build[key]) return null;
    const i = this.build[key]();
    exitSign(i);
    refine(i.scene);
    const rest = [...this.cache];
    this.cache.clear();
    this.cache.set(key, i);
    for (const [k, v] of rest) this.cache.set(k, v);
    return i;
  }

  /** Walk into a place, on its ground floor (or `floor`). */
  enter(key: Key, floor = 0) {
    let i = this.cache.get(key);
    if (!i) {
      i = this.build[key]();
      this.cache.set(key, i);
      exitSign(i);
      refine(i.scene);
    } else {
      // most recently visited last
      this.cache.delete(key);
      this.cache.set(key, i);
      this.parked.delete(i);
    }
    this.park(i);
    this.ev.fade();
    this.active = i;
    this.circ = this.circOf(i);
    this.walk.enabled = true;
    this.entering = true;
    this.goTo(floor);
    this.entering = false;
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

  /** A place's lifts and flights, built on its first visit. */
  private circOf(i: Interior) {
    let c = this.circs.get(i);
    if (!c) {
      c = new Circulation(i, PLANS[i.key] ?? {}, {
        walk: this.walk,
        floor: () => this.floor,
        switchFloor: (n) => this.switchFloor(n),
        ding: () => this.ev.ding?.(),
        arrive: (n, at) => {
          this.ev.fade();
          this.goTo(n);
          if (at) {
            const y = this.active!.floors[n].y;
            this.walk.place(new THREE.Vector3(at.x, y, at.z), at.yaw, y);
          }
        },
      });
      if (c.problems.length) console.warn(`[lifts] ${i.key}: ${c.problems.join("; ")}`);
      this.circs.set(i, c);
    }
    return c;
  }

  /** Where goTo(n) puts the walker (for tests). */
  spawnOf(n: number) {
    const f = this.active!.floors[n];
    const arr = n > 0 ? this.circ?.arrival(n) : null;
    return arr ? { x: arr.pos.x, z: arr.pos.z, yaw: arr.yaw } : { x: f.spawn.x, z: f.spawn.z, yaw: f.yaw };
  }

  /** Walls of a floor: the place's own (its flights cut out), plus its lift cars and rails. */
  collidersOf(n: number) {
    const i = this.active!;
    const c = this.circs.get(i);
    return c ? [...c.placeRects(n), ...c.rects(n)] : i.colliders(n);
  }

  /** Point the walker at a floor's walls (the place's array itself when nothing is cut out of it). */
  private wallsFor(n: number) {
    const i = this.active!;
    const c = this.circs.get(i);
    this.walk.colliders = c ? c.placeRects(n) : i.colliders(n);
    this.walk.extra = c ? c.rects(n) : [];
  }

  /** The ground of a floor: in a car or on a flight, else the place's own. */
  private groundOf(n: number) {
    const i = this.active!;
    const c = this.circs.get(i);
    return (x: number, z: number) => c?.groundAt(n, x, z) ?? i.groundAt?.(n, x, z) ?? null;
  }

  /**
   * Jump to a floor's spawn point (entering; the hidden PgUp/PgDn shortcut; tests). The walker's
   * own way between floors is physical: the lifts and stairs (see lift.ts).
   */
  goTo(floor: number) {
    const i = this.active;
    if (!i) return;
    this.circ?.reset();
    this.floor = THREE.MathUtils.clamp(floor, 0, i.floors.length - 1);
    const f = i.floors[this.floor];
    i.setFloor?.(this.floor);
    refine(i.scene);
    const n = this.floor;
    // above the ground floor you arrive in the lift car, if the floor has one
    const arr = n > 0 ? this.circ?.arrival(n) : null;
    if (arr) this.walk.place(arr.pos, arr.yaw, arr.pos.y);
    else this.walk.place(f.spawn, f.yaw, f.y);
    this.walk.ground = this.groundOf(n);
    this.wallsFor(n);
    // every place is entered from the street side (+z) on its ground floor
    this.walk.door = this.floor === 0 ? doorOf(f, i.colliders(0)) : null;
    this.circ?.show(n);
    this.walk.arrived();
    // this floor's lights make its own shader variants: compile them before the first frame
    this.warmUp(i);
    // the place's header shows the floor you are on (entering announces the place itself)
    if (!this.entering) this.ev.walked?.(n);
  }
  /** Inside enter(): its goTo is announced by `entered`. */
  private entering = false;

  /**
   * Change floor where the walker stands, without a cut: in a closed lift car, near a flight's
   * head or foot (`silent`: floors that are one space, nothing to switch but the label).
   */
  switchFloor(n: number, silent = false) {
    const i = this.active;
    if (!i || n === this.floor) return;
    this.floor = n;
    const f = i.floors[n];
    if (!silent) {
      i.setFloor?.(n);
      refine(i.scene);
      this.walk.ground = this.groundOf(n);
      this.wallsFor(n);
      this.walk.setBase(f.y);
      this.walk.arrived();
    }
    this.walk.door = n === 0 ? doorOf(f, i.colliders(0)) : null;
    this.ev.walked?.(n);
    if (!silent) this.warmUp(i, true);
  }

  exit() {
    if (!this.active) return;
    this.circ?.reset();
    this.circ = null;
    this.ev.fade();
    this.warming = false;
    this.active = null;
    this.walk.enabled = false;
    this.ev.left();
  }

  /** Everyone inside gets the way round the furniture of their floor (people arrive any time). */
  private giveRoutes(i: Interior) {
    let rs = this.routers.get(i);
    if (!rs) this.routers.set(i, (rs = i.floors.map((_, k) => new Router(this.collidersOf(k)))));
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
    const riding = this.circ?.update(dt);
    // floors that are one space (a long stair, a helix): the floor is the highest one under your feet
    const grp = this.circ?.together.find((g) => g.length > 1 && g.includes(this.floor));
    if (grp && !riding && !this.active.floorNow) {
      const F = this.active.floors;
      const feet = this.walk.floor + 0.3;
      const under = grp.filter((k) => F[k].y <= feet);
      const best = under.length ? under.reduce((a, b) => (F[b].y > F[a].y ? b : a)) : this.floor;
      if (best !== this.floor) this.switchFloor(best, true);
    }
    this.active.update(dt, t, this.walk.camera);
    // walked up or down the stairs to another floor
    const now = this.active.floorNow?.();
    if (now !== undefined && now !== this.floor) {
      this.floor = now;
      if (now === 0 && !this.walk.door) this.walk.door = doorOf(this.active.floors[0], this.walk.colliders);
      this.ev.walked?.(now);
    }
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

  /** A meme poster (or the like, scene/memes.ts) under the pointer, nearer than the place's own pick. */
  private posterAt(h: THREE.Intersection | null) {
    const i = this.active;
    if (!i) return null;
    const p = posterHit(this.ray, i.scene, this.ray.far);
    return p && (!h || p.distance < h.distance) ? p : null;
  }

  pickAt(x: number, y: number): PickInfo | null {
    const h = this.hitAt(x, y);
    const p = this.posterAt(h);
    if (p) return p.info();
    return h && this.active ? this.active.pick(h) : null;
  }

  hoverAt(x: number, y: number): string | null {
    const h = this.hitAt(x, y);
    const p = this.posterAt(h);
    if (p) return p.hover;
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
