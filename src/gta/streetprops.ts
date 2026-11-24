import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
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

// ---- the models: real shapes, coloured per part (vertex colours: one material, one draw a kind) ----------

/** A part in its colour (sRGB hex), ready to merge. */
function part(g: THREE.BufferGeometry, hex: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute("uv");
  const c = new THREE.Color(hex);
  const n = geo.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}
function merge(gs: THREE.BufferGeometry[]) {
  // (one draw: the parts' positions, normals and colours end to end)
  const out = new THREE.BufferGeometry();
  for (const k of ["position", "normal", "color"]) {
    const arrs = gs.map((g) => g.getAttribute(k).array as Float32Array);
    const a = new Float32Array(arrs.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of arrs) (a.set(x, o), (o += x.length));
    out.setAttribute(k, new THREE.BufferAttribute(a, 3));
  }
  return out;
}
const rbox = (w: number, h: number, d: number, r: number, x = 0, y = 0, z = 0) => new RoundedBoxGeometry(w, h, d, 2, r).translate(x, y + h / 2, z);
const cylY = (r0: number, r1: number, h: number, x = 0, y = 0, z = 0, seg = 16) => new THREE.CylinderGeometry(r1, r0, h, seg).translate(x, y + h / 2, z);

/** A traffic cone: its square rubber foot, the cone, two reflective white bands. */
function cone() {
  return merge([
    part(rbox(0.42, 0.035, 0.42, 0.012), "#1c1c20"),
    part(cylY(0.17, 0.035, 0.6, 0, 0.035, 0, 20), "#ff5a12"),
    part(cylY(0.13, 0.105, 0.1, 0, 0.27, 0, 20), "#f4f4f0"),
    part(cylY(0.088, 0.068, 0.08, 0, 0.44, 0, 20), "#f4f4f0"),
  ]);
}
/** A wheelie bin: the tapered body, its lid with the hinge and the handle bar, two wheels. */
function bin() {
  const body = rbox(0.56, 0.9, 0.62, 0.04, 0, 0.06, 0);
  const p = body.getAttribute("position");
  // (narrower at its foot)
  for (let i = 0; i < p.count; i++) {
    const k = 0.88 + 0.12 * Math.min(1, Math.max(0, (p.getY(i) - 0.06) / 0.9));
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  body.computeVertexNormals();
  return merge([
    part(body, "#2f6b3e"),
    part(rbox(0.62, 0.06, 0.7, 0.025, 0, 0.96, 0.01), "#285c35"),
    part(new THREE.CylinderGeometry(0.025, 0.025, 0.56, 10).rotateZ(Math.PI / 2).translate(0, 0.98, -0.36), "#1c2a20"),
    part(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 8).rotateZ(Math.PI / 2).translate(0, 0.9, -0.38), "#1c1c20"),
    ...[-0.24, 0.24].map((x) => part(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 14).rotateZ(Math.PI / 2).translate(x, 0.1, -0.27), "#141416")),
    part(rbox(0.3, 0.12, 0.02, 0.008, 0, 0.62, 0.3), "#f2f2ee"),
  ]);
}
/** A wooden crate: its planks, the frame's battens on every edge. */
function crate() {
  const parts: THREE.BufferGeometry[] = [part(new THREE.BoxGeometry(0.76, 0.76, 0.76).translate(0, 0.4, 0), "#b07c48")];
  const dark = "#80562e";
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    parts.push(part(new THREE.BoxGeometry(0.07, 0.8, 0.07).translate(x * 0.37, 0.4, z * 0.37), dark));
  for (const y of [0.035, 0.765]) {
    for (const z of [-0.37, 0.37]) parts.push(part(new THREE.BoxGeometry(0.8, 0.07, 0.07).translate(0, y, z), dark));
    for (const x of [-0.37, 0.37]) parts.push(part(new THREE.BoxGeometry(0.07, 0.07, 0.8).translate(x, y, 0), dark));
  }
  // the gaps between the planks
  for (const y of [0.27, 0.53]) for (const z of [-0.385, 0.385]) parts.push(part(new THREE.BoxGeometry(0.7, 0.015, 0.01).translate(0, y, z), "#5a3a1e"));
  return merge(parts);
}
/** A road barrier: two red-and-white striped boards on A-frame feet. */
function barrier() {
  const parts: THREE.BufferGeometry[] = [];
  for (const y of [0.78, 0.46])
    for (let i = 0; i < 6; i++) parts.push(part(new THREE.BoxGeometry(0.25, 0.2, 0.035).translate(-0.625 + i * 0.25, y, 0), i % 2 ? "#d8262a" : "#f4f2ec"));
  for (const x of [-0.66, 0.66]) {
    for (const s of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.05, 1.0, 0.05).rotateX(s * 0.22).translate(x, 0.47, s * 0.1), "#e8e6e0"));
    parts.push(part(rbox(0.12, 0.05, 0.42, 0.015, x, 0, 0), "#1c1c20"));
  }
  return merge(parts);
}
/** A newspaper box: the steel cabinet on its legs, the window onto today's paper, the coin box, the lid's handle. */
function newsbox() {
  return merge([
    ...[
      [-0.2, -0.17],
      [0.2, -0.17],
      [-0.2, 0.17],
      [0.2, 0.17],
    ].map(([x, z]) => part(new THREE.BoxGeometry(0.04, 0.3, 0.04).translate(x, 0.15, z), "#2a2a30")),
    part(rbox(0.5, 0.74, 0.44, 0.03, 0, 0.3, 0), "#2a4fa8"),
    part(new THREE.BoxGeometry(0.4, 0.32, 0.01).translate(0, 0.78, 0.222), "#1c2630"),
    part(new THREE.BoxGeometry(0.34, 0.2, 0.004).translate(0, 0.8, 0.228), "#e8e4d8"),
    part(rbox(0.16, 0.14, 0.06, 0.012, 0.14, 1.04, 0.0), "#9a9ca4"),
    part(new THREE.BoxGeometry(0.2, 0.03, 0.03).translate(0, 0.6, 0.235), "#9a9ca4"),
    part(new THREE.BoxGeometry(0.4, 0.06, 0.01).translate(0, 0.52, 0.222), "#f2f2ee"),
  ]);
}

const paint = (rough: number, metal = 0) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal });
const SPECS: Record<Kind, Spec> = {
  cone: { size: [0.42, 0.66, 0.42], r: 0.25, mass: 0.6, breaks: Infinity, make: cone, mat: paint(0.5) },
  bin: { size: [0.6, 1.05, 0.7], r: 0.4, mass: 2, breaks: Infinity, make: bin, mat: paint(0.55) },
  crate: { size: [0.8, 0.8, 0.8], r: 0.45, mass: 2.5, breaks: 5, make: crate, mat: paint(0.85) },
  barrier: { size: [1.5, 0.95, 0.3], r: 0.55, mass: 1.6, breaks: 9, make: barrier, mat: paint(0.5) },
  newsbox: { size: [0.5, 1.1, 0.45], r: 0.35, mass: 3, breaks: 11, make: newsbox, mat: paint(0.4, 0.3) },
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
