/**
 * Particles for the whole party: confetti, dust, sparkles, explosions, splashes, shock rings.
 * One `Fx` per scene; call `fx.update(dt)` every frame.
 *
 *   const fx = new Fx(scene);
 *   fx.burst(pos, { count: 20, colors: ["#ffd23f"], speed: 5 });
 *   fx.confetti(pos);  fx.dust(pos);  fx.sparkle(pos, "#fff");  fx.explosion(pos);  fx.splash(pos);
 *   fx.ring(pos, "#fff", 3);   // a flat shock ring growing to radius 3
 */
import * as THREE from "three";
import { GEO } from "./gfx";

type Shape = "cube" | "ball" | "flake";

interface P {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  vr: number;
  s: number;
  s1: number;
  life: number;
  t: number;
  g: number;
  drag: number;
  color: THREE.Color;
}

const MAX = 700;

class Pool {
  mesh: THREE.InstancedMesh;
  ps: P[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  constructor(scene: THREE.Scene, geo: THREE.BufferGeometry, lit: boolean) {
    const mat = lit ? new THREE.MeshLambertMaterial({ color: 0xffffff }) : new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
  }
  add(p: P) {
    if (this.ps.length >= MAX) this.ps.shift();
    this.ps.push(p);
  }
  update(dt: number) {
    let n = 0;
    const out: P[] = [];
    for (const p of this.ps) {
      p.t += dt;
      if (p.t >= p.life) continue;
      p.vy -= p.g * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= p.drag > 3 ? d : 1;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.vr * dt;
      p.ry += p.vr * 0.7 * dt;
      out.push(p);
      const k = p.t / p.life;
      const s = p.s + (p.s1 - p.s) * k;
      this.e.set(p.rx, p.ry, 0);
      this.q.setFromEuler(this.e);
      this.v.set(p.x, p.y, p.z);
      this.sc.set(s, s, s);
      this.m4.compose(this.v, this.q, this.sc);
      this.mesh.setMatrixAt(n, this.m4);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.ps = out;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    this.mesh.removeFromParent();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

export interface BurstOpts {
  count?: number;
  colors?: string[];
  /** Initial speed (units/s). */
  speed?: number;
  /** Extra upward speed. */
  up?: number;
  gravity?: number;
  /** Start / end size. */
  size?: number;
  sizeEnd?: number;
  life?: number;
  shape?: Shape;
  /** Air drag (1/s). */
  drag?: number;
  /** Spread only in the horizontal plane (dust). */
  flat?: boolean;
  /** Random start offset radius. */
  spread?: number;
}

interface RingFx {
  m: THREE.Mesh;
  t: number;
  life: number;
  r: number;
}

export class Fx {
  private pools: Record<Shape, Pool>;
  private rings: RingFx[] = [];
  private scene: THREE.Scene;
  private flakeGeo = new THREE.PlaneGeometry(1, 0.6);
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.pools = {
      cube: new Pool(scene, GEO.box, true),
      ball: new Pool(scene, GEO.sphereLo, false),
      flake: new Pool(scene, this.flakeGeo, false),
    };
    (this.pools.flake.mesh.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
  }

  burst(at: THREE.Vector3 | { x: number; y: number; z: number }, o: BurstOpts = {}) {
    const n = o.count ?? 16;
    const cols = o.colors ?? ["#ffffff"];
    const pool = this.pools[o.shape ?? "cube"];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = o.flat ? 0 : Math.random() * Math.PI - Math.PI / 2;
      const sp = (o.speed ?? 5) * (0.4 + Math.random() * 0.6);
      const sr = o.spread ?? 0;
      pool.add({
        alive: true,
        x: at.x + (Math.random() - 0.5) * sr,
        y: at.y + (Math.random() - 0.5) * sr * (o.flat ? 0 : 1),
        z: at.z + (Math.random() - 0.5) * sr,
        vx: Math.cos(a) * Math.cos(el) * sp,
        vy: Math.sin(el) * sp + (o.up ?? 0) * (0.6 + Math.random() * 0.4),
        vz: Math.sin(a) * Math.cos(el) * sp,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        vr: (Math.random() - 0.5) * 16,
        s: (o.size ?? 0.15) * (0.6 + Math.random() * 0.6),
        s1: o.sizeEnd ?? 0,
        life: (o.life ?? 0.8) * (0.7 + Math.random() * 0.5),
        t: 0,
        g: o.gravity ?? 9,
        drag: o.drag ?? 1,
        color: new THREE.Color(cols[i % cols.length]),
      });
    }
  }
  /** Party confetti (falls slowly, flutters). */
  confetti(at: THREE.Vector3 | { x: number; y: number; z: number }, count = 60) {
    this.burst(at, { count, colors: ["#ff4b3e", "#ffd23f", "#3fcf5a", "#2f8dff", "#ff7ad9", "#9b5cff"], speed: 7, up: 6, gravity: 4, size: 0.22, sizeEnd: 0.18, life: 2.4, shape: "flake", drag: 2.2 });
  }
  /** A puff of dust at the feet. */
  dust(at: THREE.Vector3 | { x: number; y: number; z: number }, count = 6, color = "#e8dcc8") {
    this.burst({ x: at.x, y: at.y + 0.1, z: at.z }, { count, colors: [color], speed: 1.6, up: 0.8, gravity: 0, size: 0.22, sizeEnd: 0.0, life: 0.5, shape: "ball", flat: true, drag: 4 });
  }
  /** Glints (a pick-up). */
  sparkle(at: THREE.Vector3 | { x: number; y: number; z: number }, color = "#fff6a8", count = 12) {
    this.burst(at, { count, colors: [color, "#ffffff"], speed: 3.5, up: 1.5, gravity: 2, size: 0.12, sizeEnd: 0, life: 0.6, shape: "ball", drag: 2 });
  }
  /** A cartoon explosion: fire balls, smoke and a ring. */
  explosion(at: THREE.Vector3 | { x: number; y: number; z: number }, r = 2) {
    this.burst(at, { count: 26, colors: ["#ffe14a", "#ff9a2e", "#ff4b3e"], speed: 6 * r * 0.5, up: 2, gravity: -1, size: 0.45 * r * 0.5, sizeEnd: 0, life: 0.55, shape: "ball", drag: 4 });
    this.burst(at, { count: 14, colors: ["#5a5466", "#8a8494"], speed: 3 * r * 0.5, up: 2.5, gravity: -2, size: 0.5 * r * 0.5, sizeEnd: 0.1, life: 1.1, shape: "ball", drag: 3 });
    this.ring(at, "#fff3c0", r * 1.4, 0.4);
  }
  /** Water splash. */
  splash(at: THREE.Vector3 | { x: number; y: number; z: number }, color = "#bfe8ff") {
    this.burst(at, { count: 22, colors: [color, "#ffffff"], speed: 3, up: 6, gravity: 16, size: 0.16, sizeEnd: 0.05, life: 0.8, shape: "ball", drag: 0.5 });
    this.ring(at, "#ffffff", 1.6, 0.5);
  }
  /** A flat ring growing on the ground. */
  ring(at: THREE.Vector3 | { x: number; y: number; z: number }, color = "#ffffff", radius = 2, life = 0.45) {
    const m = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(at.x, at.y + 0.05, at.z);
    this.scene.add(m);
    this.rings.push({ m, t: 0, life, r: radius });
  }
  update(dt: number) {
    for (const p of Object.values(this.pools)) p.update(dt);
    this.rings = this.rings.filter((r) => {
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) {
        r.m.removeFromParent();
        (r.m.material as THREE.Material).dispose();
        return false;
      }
      r.m.scale.setScalar(0.1 + r.r * k);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      return true;
    });
  }
  dispose() {
    for (const p of Object.values(this.pools)) p.dispose();
    for (const r of this.rings) {
      r.m.removeFromParent();
      (r.m.material as THREE.Material).dispose();
    }
    this.flakeGeo.dispose();
  }
}
