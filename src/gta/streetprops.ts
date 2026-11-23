import * as THREE from "three";
import { colorsOf, type Debris } from "./debris";
import type { Roads } from "./roads";

/**
 * Things in the street to knock about (src/gta): traffic cones, wheelie bins, wooden crates,
 * striped barriers and newspaper boxes along the kerbs. A car sends them flying (they tumble, bounce
 * and lie where they fall); a crate or a barrier hit hard enough breaks into pieces; on foot you
 * kick or punch them. Each kind in one instanced draw; only those near you are simulated.
 */

type Kind = "cone" | "bin" | "crate" | "barrier" | "newsbox";

interface Spec {
  /** Size (m), radius for hits, mass (light things fly far), breaks above this speed (m/s), or never. */
  size: [number, number, number];
  r: number;
  mass: number;
  breaks: number;
  make(): THREE.BufferGeometry;
  mat: THREE.Material;
}

function cone() {
  const g = new THREE.ConeGeometry(0.2, 0.62, 12).translate(0, 0.31 + 0.04, 0);
  const b = new THREE.BoxGeometry(0.42, 0.04, 0.42).translate(0, 0.02, 0);
  return merge([g, b]);
}
function merge(gs: THREE.BufferGeometry[]) {
  // (one draw: the parts' positions and normals end to end)
  const parts = gs.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const k of ["position", "normal"]) {
    const arrs = parts.map((g) => g.getAttribute(k).array as Float32Array);
    const a = new Float32Array(arrs.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of arrs) (a.set(x, o), (o += x.length));
    out.setAttribute(k, new THREE.BufferAttribute(a, 3));
  }
  return out;
}

const SPECS: Record<Kind, Spec> = {
  cone: { size: [0.42, 0.66, 0.42], r: 0.25, mass: 0.6, breaks: Infinity, make: cone, mat: new THREE.MeshStandardMaterial({ color: "#ff6a1a", roughness: 0.5 }) },
  bin: { size: [0.6, 1.05, 0.7], r: 0.4, mass: 2, breaks: Infinity, make: () => new THREE.BoxGeometry(0.6, 1.05, 0.7).translate(0, 0.525, 0), mat: new THREE.MeshStandardMaterial({ color: "#2f6b3e", roughness: 0.6 }) },
  crate: { size: [0.8, 0.8, 0.8], r: 0.45, mass: 2.5, breaks: 5, make: () => new THREE.BoxGeometry(0.8, 0.8, 0.8).translate(0, 0.4, 0), mat: new THREE.MeshStandardMaterial({ color: "#a8743f", roughness: 0.85 }) },
  barrier: { size: [1.5, 0.95, 0.3], r: 0.55, mass: 1.6, breaks: 9, make: () => merge([new THREE.BoxGeometry(1.5, 0.28, 0.06).translate(0, 0.78, 0), new THREE.BoxGeometry(0.08, 0.95, 0.3).translate(-0.62, 0.475, 0), new THREE.BoxGeometry(0.08, 0.95, 0.3).translate(0.62, 0.475, 0)]), mat: new THREE.MeshStandardMaterial({ color: "#f2f2ee", roughness: 0.5 }) },
  newsbox: { size: [0.5, 1.1, 0.45], r: 0.35, mass: 3, breaks: 11, make: () => new THREE.BoxGeometry(0.5, 1.1, 0.45).translate(0, 0.55, 0), mat: new THREE.MeshStandardMaterial({ color: "#2a4fa8", roughness: 0.4, metalness: 0.3 }) },
};

interface Prop {
  kind: Kind;
  i: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  w: THREE.Vector3;
  home: THREE.Vector3;
  homeQ: THREE.Quaternion;
  awake: boolean;
  broken: boolean;
  floor: number;
}

export interface PropWorld {
  /** Inside a wall (the street's solid shape). */
  blocked(x: number, z: number): boolean;
  /** The ground there. */
  floor(x: number, z: number): number;
}

export class StreetProps {
  readonly group = new THREE.Group();
  private meshes = new Map<Kind, THREE.InstancedMesh>();
  private props: Prop[] = [];
  private m = new THREE.Matrix4();
  private one = new THREE.Vector3(1, 1, 1);
  private placed = false;

  constructor(
    scene: THREE.Scene,
    private debris: Debris,
  ) {
    this.group.name = "gta:streetprops";
    this.group.visible = false;
    scene.add(this.group);
  }

  show(on: boolean) {
    this.group.visible = on;
  }

  /** Along the kerbs, every few dozen metres (once the street's solid shape says where there is room). */
  place(roads: Roads, world: PropWorld) {
    if (this.placed) return;
    this.placed = true;
    let seed = 99;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    // (only what a pavement has for a reason — a wheelie bin, a newspaper box — and seldom: cones,
    // barriers and crates every few dozen metres along every kerb, with no works anywhere, were clutter)
    const kinds: Kind[] = ["bin", "bin", "newsbox"];
    const spots: { x: number; z: number; rot: number; kind: Kind }[] = [];
    for (const r of roads.rects) {
      const len = r.axis === "x" ? r.x1 - r.x0 : r.z1 - r.z0;
      for (let s = 12 + rnd() * 30; s < len - 12; s += 60 + rnd() * 40) {
        const side = rnd() < 0.5 ? -1 : 1;
        const kind = kinds[Math.floor(rnd() * kinds.length)];
        // on the pavement, just past the kerb (never in the road, never at a corner)
        const off = 0.9;
        const x = r.axis === "x" ? r.x0 + s : (side < 0 ? r.x0 : r.x1) + side * off;
        const z = r.axis === "x" ? (side < 0 ? r.z0 : r.z1) + side * off : r.z0 + s;
        if (world.blocked(x, z) || roads.road(x, z) || spots.some((o) => Math.hypot(o.x - x, o.z - z) < 12)) continue;
        // a corner: asphalt a few metres along the pavement either way
        const ax = r.axis === "x" ? 5 : 0,
          az = r.axis === "x" ? 0 : 5;
        if (roads.road(x + ax, z + az) || roads.road(x - ax, z - az)) continue;
        // clear round it (a lamp, a tree, a bench there already)
        if (world.blocked(x + 0.9, z) || world.blocked(x - 0.9, z) || world.blocked(x, z + 0.9) || world.blocked(x, z - 0.9)) continue;
        spots.push({ x, z, rot: (r.axis === "x" ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.2, kind });
      }
    }
    const count = new Map<Kind, number>();
    for (const s of spots) count.set(s.kind, (count.get(s.kind) ?? 0) + 1);
    for (const [kind, n] of count) {
      const sp = SPECS[kind];
      const mesh = new THREE.InstancedMesh(sp.make(), sp.mat, n);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `gta:prop:${kind}`;
      // stripes on the barriers, a reflective band on the cones: by colour per instance
      this.group.add(mesh);
      this.meshes.set(kind, mesh);
    }
    const next = new Map<Kind, number>();
    for (const s of spots) {
      const i = next.get(s.kind) ?? 0;
      next.set(s.kind, i + 1);
      const y = world.floor(s.x, s.z);
      const p = new THREE.Vector3(s.x, y, s.z);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
      this.props.push({ kind: s.kind, i, p, v: new THREE.Vector3(), q, w: new THREE.Vector3(), home: p.clone(), homeQ: q.clone(), awake: false, broken: false, floor: y });
    }
    for (const pr of this.props) this.write(pr);
    for (const m of this.meshes.values()) m.instanceMatrix.needsUpdate = true;
  }

  private write(pr: Prop) {
    const mesh = this.meshes.get(pr.kind)!;
    this.m.compose(pr.p, pr.q, pr.broken ? this.one.clone().setScalar(0) : this.one);
    mesh.setMatrixAt(pr.i, this.m);
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Something moving through (a car: centre, radius, velocity) knocks what it touches. */
  push(x: number, z: number, r: number, vx: number, vz: number, kick = 1) {
    const sp = Math.hypot(vx, vz);
    if (sp < 0.8) return 0;
    let n = 0;
    for (const pr of this.props) {
      if (pr.broken) continue;
      const s = SPECS[pr.kind];
      const dx = pr.p.x - x,
        dz = pr.p.z - z;
      const d = Math.hypot(dx, dz);
      if (d > r + s.r) continue;
      n++;
      const hard = sp * kick;
      if (hard > s.breaks) {
        this.smash(pr, vx, vz);
        continue;
      }
      // flung: the push and away from the centre, up, spinning (light things fly further)
      const k = (1.1 + Math.random() * 0.5) / Math.sqrt(s.mass);
      const ox = d > 1e-3 ? dx / d : 1,
        oz = d > 1e-3 ? dz / d : 0;
      pr.v.set(vx * k + ox * sp * 0.4, 1.5 + sp * 0.25 * k, vz * k + oz * sp * 0.4);
      pr.w.set((Math.random() - 0.5) * sp * 2, (Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp * 2);
      pr.awake = true;
    }
    return n;
  }

  private smash(pr: Prop, vx: number, vz: number) {
    pr.broken = true;
    this.write(pr);
    const s = SPECS[pr.kind];
    const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(pr.p.x, pr.p.y + s.size[1] / 2, pr.p.z), new THREE.Vector3(...s.size));
    this.debris.into(this.group.parent!);
    this.debris.burst(box, colorsOf(this.meshes.get(pr.kind)!), new THREE.Vector3(vx, 0, vz).multiplyScalar(0.8), pr.floor);
  }

  /** Each frame: the ones in the air fall, tumble and settle. */
  update(dt: number, world: PropWorld) {
    for (const pr of this.props) {
      if (!pr.awake || pr.broken) continue;
      pr.v.y -= 16 * dt;
      const nx = pr.p.x + pr.v.x * dt,
        nz = pr.p.z + pr.v.z * dt;
      if (world.blocked(nx, nz)) {
        pr.v.x *= -0.3;
        pr.v.z *= -0.3;
      } else {
        pr.p.x = nx;
        pr.p.z = nz;
      }
      pr.p.y += pr.v.y * dt;
      const f = world.floor(pr.p.x, pr.p.z);
      pr.floor = f;
      if (pr.p.y < f) {
        pr.p.y = f;
        pr.v.y = Math.abs(pr.v.y) * 0.25;
        pr.v.x *= 0.7;
        pr.v.z *= 0.7;
        pr.w.multiplyScalar(0.6);
        // lying down: settle on its side or upright, whichever it is nearer
        if (pr.v.lengthSq() < 0.4) {
          pr.v.set(0, 0, 0);
          pr.w.set(0, 0, 0);
          pr.awake = false;
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(pr.q);
          if (Math.abs(up.y) < 0.7) {
            // on its side: flat on the ground
            const yaw = Math.atan2(up.x, up.z);
            pr.q.setFromEuler(new THREE.Euler(Math.PI / 2, yaw, 0, "YXZ"));
          } else pr.q.setFromEuler(new THREE.Euler(0, new THREE.Euler().setFromQuaternion(pr.q, "YXZ").y, 0, "YXZ"));
        }
      }
      const a = pr.w.length();
      if (a > 1e-4) pr.q.premultiply(new THREE.Quaternion().setFromAxisAngle(pr.w.clone().divideScalar(a), a * dt));
      this.write(pr);
    }
  }

  /** Everything back where it stood (a new game). */
  reset() {
    for (const pr of this.props) {
      pr.p.copy(pr.home);
      pr.q.copy(pr.homeQ);
      pr.v.set(0, 0, 0);
      pr.w.set(0, 0, 0);
      pr.awake = false;
      pr.broken = false;
      this.write(pr);
    }
  }
}
