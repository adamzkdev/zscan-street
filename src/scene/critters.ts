import * as THREE from "three";
import { CITY } from "./city";
import { nz } from "./city/plan";
import type { Director } from "./director";

/**
 * Pigeons and street cats, modelled (branch gta-real: no more pixel sprites): a pigeon's grey body,
 * its iridescent neck, the wings folded or beating, the pink feet; a cat in its coat, sitting,
 * loafing or trotting. Each pose is one small merged mesh in vertex colours, swapped as they move
 * (one draw a critter). Pigeons peck about the plaza, the square and the kerb; anyone walking up,
 * or a bus pulling in, sends them flapping off to land somewhere else. Cats doze in their spots,
 * wash, stroll to another, and bolt when someone gets close.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

// ---- the models (front +x, feet at y 0, metres) --------------------------------------------------------

type Frame = THREE.BufferGeometry;

/** A part in its colour, ready to merge. */
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
  const out = new THREE.BufferGeometry();
  for (const k of ["position", "normal", "color"]) {
    const arrs = gs.map((g) => g.getAttribute(k).array as Float32Array);
    const a = new Float32Array(arrs.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of arrs) (a.set(x, o), (o += x.length));
    out.setAttribute(k, new THREE.BufferAttribute(a, 3));
  }
  out.computeBoundingSphere();
  return out;
}
/** An ellipsoid of radii (rx, ry, rz) at (x, y, z), turned about z by `tilt`. */
const blob = (rx: number, ry: number, rz: number, x: number, y: number, z: number, tilt = 0, seg = 12) => new THREE.SphereGeometry(1, seg, Math.max(6, seg - 4)).scale(rx, ry, rz).rotateZ(tilt).translate(x, y, z);
/** A limb from a to b (radius r). */
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r * 0.85, len, 6).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  return g.translate(a.x, a.y, a.z);
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function pigeon(pose: "stand" | "peck" | "up" | "down"): Frame {
  const body = "#8a8a9a",
    dark = "#5a5a6a",
    wing = "#a4a4b2",
    neck = "#4a9a8a",
    feet = "#e07a8a",
    eye = "#e0602a";
  const flying = pose === "up" || pose === "down";
  const peck = pose === "peck";
  const P: THREE.BufferGeometry[] = [];
  const y0 = flying ? 0.06 : 0;
  P.push(part(blob(0.15, 0.095, 0.09, 0, 0.15 + y0, 0, -0.18), body));
  P.push(part(blob(0.1, 0.07, 0.075, 0.06, 0.13 + y0, 0, 0.1), "#9a9aaa"));
  // the tail, dark at its tip
  P.push(part(new THREE.BoxGeometry(0.13, 0.014, 0.075).rotateZ(-0.25).translate(-0.19, 0.18 + y0, 0), dark));
  P.push(part(new THREE.BoxGeometry(0.03, 0.016, 0.077).rotateZ(-0.25).translate(-0.25, 0.195 + y0, 0), "#3a3a46"));
  // the neck and the head (down to the ground when pecking)
  const hx = peck ? 0.2 : 0.13,
    hy = peck ? 0.07 : 0.29;
  P.push(part(blob(0.055, 0.065, 0.055, peck ? 0.14 : 0.1, peck ? 0.14 : 0.22, 0, peck ? -0.9 : 0.3, 10).translate(0, y0, 0), neck));
  P.push(part(blob(0.045, 0.042, 0.04, hx, hy + y0, 0, 0, 10), "#6e6e80"));
  P.push(part(new THREE.ConeGeometry(0.011, 0.035, 6).rotateZ(-Math.PI / 2 - (peck ? 0.9 : 0)).translate(hx + 0.05, hy - (peck ? 0.02 : 0.005) + y0, 0), "#2a2830"));
  for (const s of [-1, 1]) P.push(part(new THREE.SphereGeometry(0.009, 6, 4).translate(hx + 0.022, hy + 0.012 + y0, s * 0.034), eye));
  if (flying) {
    // the wings spread, beating: raised or lowered
    const a = pose === "up" ? 0.75 : -0.45;
    for (const s of [-1, 1]) {
      const w = new THREE.SphereGeometry(1, 10, 6).scale(0.09, 0.012, 0.19).translate(0, 0, s * 0.19).rotateX(s * a).translate(-0.01, 0.2 + y0, s * 0.04);
      P.push(part(w, wing));
      P.push(part(new THREE.BoxGeometry(0.03, 0.014, 0.12).translate(0, 0, s * 0.27).rotateX(s * a).translate(-0.05, 0.2 + y0, s * 0.04), "#3a3a46"));
    }
  } else {
    // folded: on the sides, two dark bars across them; the pink feet
    for (const s of [-1, 1]) {
      P.push(part(blob(0.12, 0.05, 0.028, -0.03, 0.17, s * 0.068, -0.2, 10), wing));
      for (const x of [-0.03, -0.07]) P.push(part(new THREE.BoxGeometry(0.018, 0.04, 0.01).rotateZ(-0.2).translate(x, 0.165, s * 0.093), "#3a3a46"));
      P.push(part(limb(V(0.02, 0.0, s * 0.025), V(0.01, 0.08, s * 0.025), 0.008), feet));
      P.push(part(new THREE.BoxGeometry(0.04, 0.006, 0.012).translate(0.03, 0.003, s * 0.025), feet));
    }
  }
  return merge(P);
}

const CAT_COATS = [
  { fur: "#e08a3a", dark: "#b0602a", light: "#f8d0a0" },
  { fur: "#2a2830", dark: "#16151a", light: "#4a4856" },
  { fur: "#e8e4dc", dark: "#b8b0a4", light: "#ffffff" },
];

function cat(coat: (typeof CAT_COATS)[number], pose: "sit" | "walk1" | "walk2" | "loaf"): Frame {
  const { fur, dark, light } = coat;
  const eye = "#7ad07a";
  const P: THREE.BufferGeometry[] = [];
  const head = (x: number, y: number) => {
    P.push(part(blob(0.075, 0.068, 0.072, x, y, 0, 0, 12), fur));
    P.push(part(blob(0.035, 0.028, 0.04, x + 0.06, y - 0.02, 0, 0, 8), light));
    P.push(part(new THREE.SphereGeometry(0.008, 6, 4).translate(x + 0.095, y - 0.012, 0), "#e88a9a"));
    for (const s of [-1, 1]) {
      P.push(part(new THREE.ConeGeometry(0.028, 0.06, 4).rotateX(s * 0.25).translate(x - 0.005, y + 0.075, s * 0.042), fur));
      P.push(part(new THREE.SphereGeometry(0.012, 6, 4).translate(x + 0.06, y + 0.015, s * 0.032), eye));
    }
  };
  /** The tail: a chain of segments from `a` along the points. */
  const tail = (pts: THREE.Vector3[]) => {
    for (let i = 1; i < pts.length; i++) P.push(part(limb(pts[i - 1], pts[i], 0.02 - i * 0.002), i === pts.length - 1 ? dark : fur));
  };
  if (pose === "sit") {
    P.push(part(blob(0.1, 0.16, 0.09, -0.01, 0.16, 0, 0.25, 14), fur));
    P.push(part(blob(0.06, 0.11, 0.07, 0.05, 0.17, 0, 0.2, 10), light));
    for (const s of [-1, 1]) {
      P.push(part(blob(0.08, 0.07, 0.045, -0.05, 0.07, s * 0.06, 0, 10), fur));
      P.push(part(limb(V(0.06, 0.0, s * 0.035), V(0.05, 0.2, s * 0.035), 0.02), fur));
      P.push(part(blob(0.03, 0.015, 0.022, 0.08, 0.012, s * 0.035, 0, 8), light));
    }
    head(0.06, 0.36);
    tail([V(-0.1, 0.03, 0), V(-0.06, 0.015, 0.1), V(0.04, 0.012, 0.13), V(0.1, 0.012, 0.09)]);
  } else if (pose === "loaf") {
    P.push(part(blob(0.2, 0.09, 0.1, 0, 0.09, 0, 0, 14), fur));
    P.push(part(blob(0.12, 0.05, 0.08, 0.06, 0.06, 0, 0, 10), light));
    head(0.19, 0.16);
    tail([V(-0.18, 0.05, 0), V(-0.16, 0.03, 0.11), V(-0.02, 0.025, 0.12), V(0.08, 0.025, 0.11)]);
  } else {
    const a = pose === "walk1";
    P.push(part(blob(0.21, 0.09, 0.085, 0, 0.24, 0, 0.04, 14), fur));
    P.push(part(blob(0.15, 0.05, 0.06, 0.02, 0.2, 0, 0, 10), light));
    // the legs in a trot: diagonal pairs forward and back
    for (const [x, s, fwd] of [
      [0.13, 1, a],
      [0.13, -1, !a],
      [-0.13, 1, !a],
      [-0.13, -1, a],
    ] as [number, number, boolean][]) {
      const sw = fwd ? 0.05 : -0.05;
      P.push(part(limb(V(x, 0.22, s * 0.05), V(x + sw, 0.0, s * 0.05), 0.022), fur));
      P.push(part(blob(0.028, 0.014, 0.022, x + sw + 0.01, 0.01, s * 0.05, 0, 8), light));
    }
    head(0.25, 0.32);
    tail([V(-0.2, 0.27, 0), V(-0.28, 0.33, 0), V(-0.31, 0.42, 0), V(-0.29, 0.5, 0)]);
  }
  return merge(P);
}

// ---- where they hang out --------------------------------------------------------------------------

/** Patches of ground pigeons peck at (x0, x1, z0, z1). */
const FEEDING = [
  [-16, -5, 10.2, 11.2],
  [-6, 6, 13, 15.6],
  [-6, 6, 22.6, 24.2],
  [-19, -6, 3.0, 3.8],
  [-44, -32, 11, 14],
];

interface CatSpot {
  p: THREE.Vector3;
  pose: "sit" | "loaf";
}
const CAT_SPOTS: CatSpot[] = [
  { p: new THREE.Vector3(-1.25, CITY.curb, nz(-5.6) + 0.95), pose: "loaf" }, // by the vending machines
  { p: new THREE.Vector3(-41.3, CITY.curb + 0.62, 9.5), pose: "loaf" }, // the garden bench
  { p: new THREE.Vector3(-17.6, CITY.curb, nz(-4.3)), pose: "sit" }, // by the bicycles
  { p: new THREE.Vector3(14.6, CITY.curb, nz(-4.5)), pose: "sit" }, // the trash bags
  { p: new THREE.Vector3(-36, CITY.curb, 16.2), pose: "sit" }, // the koi pond
  { p: new THREE.Vector3(10.7, CITY.curb + 0.06, 24.8), pose: "loaf" }, // the café step
  { p: new THREE.Vector3(30.5, CITY.curb, nz(-4.6)), pose: "sit" }, // the factory gate
];

// ---- the animals ----------------------------------------------------------------------------------

const FUR = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
function makeMesh(f: Frame) {
  const m = new THREE.Mesh(f, FUR);
  m.castShadow = true;
  return m;
}

interface Pigeon {
  s: THREE.Mesh;
  patch: number[];
  pos: THREE.Vector3;
  /** Flight: from, to, progress 0..1, duration. */
  fly: { from: THREE.Vector3; to: THREE.Vector3; k: number; len: number } | null;
  next: number;
  pecking: boolean;
  facing: number;
  cool: number;
  /** A neighbour took off: this one goes too. */
  scare: boolean;
}

interface Cat {
  s: THREE.Mesh;
  frames: Record<"sit" | "walk1" | "walk2" | "loaf", Frame>;
  spot: CatSpot;
  pos: THREE.Vector3;
  path: THREE.Vector3[];
  speed: number;
  /** When it gets up and goes somewhere else. */
  until: number;
  facing: number;
  phase: number;
}

const PIGEON = { stand: pigeon("stand"), peck: pigeon("peck"), up: pigeon("up"), down: pigeon("down") };

export class Critters {
  private pigeons: Pigeon[] = [];
  private cats: Cat[] = [];
  private clock = 0;
  private group = new THREE.Group();
  /** The visitor's adopted cat follows this point (their place in the city). */
  private pet: Cat | null = null;
  private follow: (() => THREE.Vector3 | null) | null = null;

  constructor(
    scene: THREE.Object3D,
    private director: Director,
    pigeons = 16,
    cats = 3,
  ) {
    scene.add(this.group);
    for (let i = 0; i < pigeons; i++) {
      const patch = FEEDING[i % FEEDING.length];
      const pos = this.spotIn(patch);
      const s = makeMesh(PIGEON.stand);
      s.position.copy(pos);
      this.group.add(s);
      this.pigeons.push({ s, patch, pos, fly: null, next: rand(0, 2), pecking: false, facing: rand(0, Math.PI * 2), cool: 0, scare: false });
    }
    const spots = [...CAT_SPOTS].sort(() => Math.random() - 0.5);
    for (let i = 0; i < cats; i++) {
      const coat = CAT_COATS[i % CAT_COATS.length];
      const frames = { sit: cat(coat, "sit"), walk1: cat(coat, "walk1"), walk2: cat(coat, "walk2"), loaf: cat(coat, "loaf") };
      const spot = spots[i];
      const s = makeMesh(frames[spot.pose]);
      s.position.copy(spot.p);
      this.group.add(s);
      this.cats.push({ s, frames, spot, pos: spot.p.clone(), path: [], speed: 0, until: rand(20, 60), facing: rand(0, Math.PI * 2), phase: 0 });
    }
  }

  /** The cat under a click (index), or -1. */
  catAt(ray: THREE.Raycaster) {
    const sphere = new THREE.Sphere(new THREE.Vector3(), 0.7);
    return this.cats.findIndex((c) => (sphere.center.copy(c.pos).setY(c.pos.y + 0.3), ray.ray.intersectsSphere(sphere)));
  }

  /** Cat `i` (by coat, stable across visits) follows `to` from now on; -1 lets it go. */
  adopt(i: number, to: (() => THREE.Vector3 | null) | null) {
    this.pet = i >= 0 ? (this.cats[i] ?? null) : null;
    this.follow = to;
  }

  get petIndex() {
    return this.pet ? this.cats.indexOf(this.pet) : -1;
  }

  setVisible(on: boolean) {
    this.group.visible = on;
  }

  private spotIn(p: number[]) {
    return new THREE.Vector3(rand(p[0], p[1]), CITY.curb + (p[2] > 8 && p[2] < 12 ? 0.15 : p[2] > 12 && p[2] < 25 && Math.abs(p[0]) < 20 ? 0.06 : 0), rand(p[2], p[3]));
  }

  /** Something big or someone close: positions of walkers and of vehicles near the kerb. */
  private threats() {
    const out: { p: THREE.Vector3; r: number }[] = [];
    for (const s of this.director.snarks) {
      if (!s.root.visible || s.root.parent !== this.group.parent) continue;
      out.push({ p: s.root.position, r: s.isWalking ? 1.6 : 0.9 });
    }
    for (const v of this.director.traffic.vehicles) out.push({ p: v.mover.group.position, r: v.mover.length / 2 + 2.2 });
    return out;
  }

  update(dt: number, camera: THREE.Camera) {
    void camera;
    this.clock += dt;
    const threats = this.threats();
    const near = (p: THREE.Vector3, extra = 0) => threats.some((x) => Math.abs(x.p.x - p.x) < x.r + extra && Math.abs(x.p.z - p.z) < x.r + extra && x.p.distanceTo(p) < x.r + extra + 1);

    for (const b of this.pigeons) {
      b.cool -= dt;
      if (b.fly) {
        const f = b.fly;
        f.k = Math.min(1, f.k + dt / f.len);
        b.pos.lerpVectors(f.from, f.to, f.k);
        b.pos.y += Math.sin(f.k * Math.PI) * (2.4 + f.len);
        const flap = Math.floor(this.clock * 14) % 2 === 0;
        b.s.geometry = f.k > 0.9 ? PIGEON.stand : flap ? PIGEON.up : PIGEON.down;
        if (f.k >= 1) {
          b.fly = null;
          b.next = this.clock + rand(0.5, 2);
          b.cool = 1.5;
        }
      } else if (b.cool <= 0 && (b.scare || near(b.pos))) {
        b.scare = false;
        // off they go: to another patch, the flock tends to follow
        const patch = Math.random() < 0.7 ? b.patch : pick(FEEDING);
        b.patch = patch;
        let to = this.spotIn(patch);
        for (let i = 0; i < 4 && near(to, 1); i++) to = this.spotIn(pick(FEEDING));
        b.facing = Math.atan2(-(to.z - b.pos.z), to.x - b.pos.x);
        b.fly = { from: b.pos.clone(), to, k: 0, len: Math.min(3, 0.8 + b.pos.distanceTo(to) / 9) };
        // its neighbours take fright too
        for (const o of this.pigeons) if (o !== b && !o.fly && o.pos.distanceTo(b.pos) < 2.5) setTimeout(() => (o.scare = true), rand(60, 400));
      } else if (this.clock > b.next) {
        // peck, look about, or hop a step
        b.next = this.clock + rand(0.3, 1.4);
        const r = Math.random();
        if (r < 0.5) b.pecking = !b.pecking;
        else if (r < 0.8) {
          const step = new THREE.Vector3(rand(-0.4, 0.4), 0, rand(-0.3, 0.3));
          b.pos.add(step);
          b.pos.x = THREE.MathUtils.clamp(b.pos.x, b.patch[0], b.patch[1]);
          b.pos.z = THREE.MathUtils.clamp(b.pos.z, b.patch[2], b.patch[3]);
          b.facing = Math.atan2(-step.z, step.x);
          b.pecking = false;
        } else b.facing += rand(-2, 2);
        b.s.geometry = b.pecking ? PIGEON.peck : PIGEON.stand;
      }
      b.s.position.copy(b.pos);
      b.s.rotation.y = b.facing;
    }

    // the adopted cat trots after its person, and sits when it catches up
    if (this.pet && this.follow) {
      const c = this.pet;
      const to = this.follow();
      if (to) {
        const d = Math.hypot(to.x - c.pos.x, to.z - c.pos.z);
        if (d > 40) c.pos.set(to.x - 1.4, CITY.curb, to.z + 0.8);
        else if (d > 2.4 && (!c.path.length || c.path[c.path.length - 1].distanceTo(to) > 1.5)) {
          const k = (d - 1.4) / d;
          c.path = [new THREE.Vector3(c.pos.x + (to.x - c.pos.x) * k, CITY.curb, c.pos.z + (to.z - c.pos.z) * k)];
          c.speed = Math.min(5, 1.2 + d * 0.5);
        }
        c.until = this.clock + 999;
      }
    }

    for (const c of this.cats) {
      if (c.path.length) {
        const target = c.path[0];
        const d = new THREE.Vector3().subVectors(target, c.pos);
        d.y = 0;
        const dist = d.length();
        const step = c.speed * dt;
        if (dist <= step) {
          c.pos.x = target.x;
          c.pos.z = target.z;
          c.pos.y = target.y;
          c.path.shift();
        } else {
          c.pos.addScaledVector(d, step / dist);
          if (dist > 0.01) c.facing = Math.atan2(-d.z, d.x);
        }
        c.phase += dt * c.speed * 5;
        c.s.geometry = Math.floor(c.phase) % 2 ? c.frames.walk1 : c.frames.walk2;
        if (!c.path.length) {
          c.s.geometry = c.frames[c.spot.pose];
          c.until = this.clock + rand(25, 80);
        }
      } else {
        if (c === this.pet) {
          c.s.position.copy(c.pos);
          c.s.rotation.y = c.facing;
          continue;
        }
        const scared = threats.some((x) => x.p.distanceTo(c.pos) < (c.spot.p.y > CITY.curb + 0.3 ? 1.2 : 1.7) && x.r < 2);
        if (scared || this.clock > c.until) {
          // somewhere free, along the pavement (and down from the bench first)
          const taken = new Set(this.cats.map((o) => o.spot));
          const free = CAT_SPOTS.filter((s) => !taken.has(s));
          const spot = scared ? free.sort((a, b) => a.p.distanceTo(c.pos) - b.p.distanceTo(c.pos))[0] ?? c.spot : pick(free.length ? free : [c.spot]);
          c.spot = spot;
          c.speed = scared ? 4.2 : 1.1;
          const ground = c.pos.clone().setY(CITY.curb);
          // keep to its own side of the avenue unless the trip is across it, then use the zebra
          const across = Math.sign(spot.p.z - CITY.road.z1) !== Math.sign(c.pos.z - CITY.road.z1) && (spot.p.z < CITY.road.z0 || c.pos.z < CITY.road.z0);
          c.path = across ? [ground, new THREE.Vector3(-1.2, CITY.curb, c.pos.z < 0 ? CITY.north.z1 : CITY.south.z0), new THREE.Vector3(-1.2, CITY.curb, spot.p.z < 0 ? CITY.north.z1 : CITY.south.z0), spot.p] : [ground, spot.p];
        }
      }
      c.s.position.copy(c.pos);
      // on the asphalt, down at road level
      if (c.pos.z > CITY.road.z0 + 0.1 && c.pos.z < CITY.road.z1 - 0.1) c.s.position.y = 0.01;
      c.s.rotation.y = c.facing;
    }
  }
}
