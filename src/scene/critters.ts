import * as THREE from "three";
import { CITY } from "./city";
import { nz } from "./city/plan";
import type { Director } from "./director";
import { GRID, sprite, type Px } from "./sprites";

/**
 * Pigeons and street cats, drawn on the zkSNARKs' own pixel grid. Pigeons peck about the plaza,
 * the square and the kerb; anyone walking up, or a bus pulling in, sends them flapping off to land
 * somewhere else. Cats doze in their spots, wash, stroll to another, and bolt when someone gets
 * close.
 */

const PX = 1.75 / GRID;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

// ---- pixel art ------------------------------------------------------------------------------------

type Frame = ReturnType<typeof sprite>;

function pigeon(pose: "stand" | "peck" | "up" | "down"): Frame {
  const body = "#8a8a9a",
    dark = "#5a5a6a",
    wing = "#a0a0b0",
    neck = "#4a9a8a",
    feet = "#e07a8a",
    eye = "#e0602a";
  return sprite(9, 7, (px: Px) => {
    if (pose === "up" || pose === "down") {
      // in flight: wings above or below the body
      px(2, 3, 5, 2, body);
      px(6, 2, 2, 2, neck);
      px(7, 2, 1, 1, eye);
      px(8, 3, 1, 1, "#2a2830");
      px(0, 3, 2, 1, dark);
      if (pose === "up") {
        px(2, 0, 2, 3, wing);
        px(4, 1, 2, 2, wing);
      } else {
        px(2, 5, 2, 2, wing);
        px(4, 5, 2, 1, wing);
      }
      return;
    }
    const peck = pose === "peck";
    px(1, 3, 5, 2, body);
    px(2, 3, 3, 1, wing);
    px(0, 3, 1, 1, dark);
    px(1, 5, 4, 1, dark);
    if (peck) {
      px(5, 4, 2, 2, neck);
      px(7, 5, 1, 1, "#2a2830");
      px(6, 4, 1, 1, eye);
    } else {
      px(5, 1, 2, 3, neck);
      px(5, 0, 2, 2, body);
      px(6, 0, 1, 1, eye);
      px(7, 1, 1, 1, "#2a2830");
    }
    px(2, 6, 1, 1, feet);
    px(4, 6, 1, 1, feet);
  });
}

const CAT_COATS = [
  { fur: "#e08a3a", dark: "#b0602a", light: "#f8d0a0" },
  { fur: "#2a2830", dark: "#16151a", light: "#4a4856" },
  { fur: "#e8e4dc", dark: "#b8b0a4", light: "#ffffff" },
];

function cat(coat: (typeof CAT_COATS)[number], pose: "sit" | "walk1" | "walk2" | "loaf"): Frame {
  const { fur, dark, light } = coat;
  return sprite(12, 9, (px: Px) => {
    const eye = "#7ad07a";
    if (pose === "sit") {
      // sitting upright, tail curled round
      px(4, 3, 4, 5, fur);
      px(5, 5, 2, 3, light);
      px(4, 0, 4, 3, fur);
      px(4, 0, 1, 1, dark);
      px(7, 0, 1, 1, dark);
      px(5, 1, 1, 1, eye);
      px(7, 1, 1, 1, eye);
      px(1, 7, 4, 1, dark);
      px(1, 6, 1, 1, dark);
      px(4, 8, 4, 1, dark);
      return;
    }
    if (pose === "loaf") {
      px(2, 5, 8, 3, fur);
      px(3, 5, 6, 1, light);
      px(8, 3, 3, 3, fur);
      px(8, 3, 1, 1, dark);
      px(10, 3, 1, 1, dark);
      px(9, 4, 1, 1, "#1a1820");
      px(0, 7, 3, 1, dark);
      px(2, 8, 8, 1, dark);
      return;
    }
    const a = pose === "walk1";
    px(2, 3, 7, 3, fur);
    px(3, 4, 5, 1, light);
    px(8, 1, 3, 3, fur);
    px(8, 0, 1, 1, dark);
    px(10, 0, 1, 1, dark);
    px(10, 2, 1, 1, eye);
    px(0, 1, 1, 2, dark);
    px(1, 2, 1, 2, fur);
    for (const [x, up] of [
      [2, a],
      [4, !a],
      [6, a],
      [8, !a],
    ] as [number, boolean][])
      px(x, 6, 1, up ? 2 : 3, dark);
  });
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

function makeSprite(f: Frame) {
  const mat = new THREE.SpriteMaterial({ map: f.texture, alphaTest: 0.5 });
  const s = new THREE.Sprite(mat);
  s.center.set(0.5, 0);
  s.scale.set(f.w * PX, f.h * PX, 1);
  return s;
}

interface Pigeon {
  s: THREE.Sprite;
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
  s: THREE.Sprite;
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
  private camRight = new THREE.Vector3();
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
      const s = makeSprite(PIGEON.stand);
      s.position.copy(pos);
      this.group.add(s);
      this.pigeons.push({ s, patch, pos, fly: null, next: rand(0, 2), pecking: false, facing: Math.random() < 0.5 ? 1 : -1, cool: 0, scare: false });
    }
    const spots = [...CAT_SPOTS].sort(() => Math.random() - 0.5);
    for (let i = 0; i < cats; i++) {
      const coat = CAT_COATS[i % CAT_COATS.length];
      const frames = { sit: cat(coat, "sit"), walk1: cat(coat, "walk1"), walk2: cat(coat, "walk2"), loaf: cat(coat, "loaf") };
      const spot = spots[i];
      const s = makeSprite(frames[spot.pose]);
      s.position.copy(spot.p);
      this.group.add(s);
      this.cats.push({ s, frames, spot, pos: spot.p.clone(), path: [], speed: 0, until: rand(20, 60), facing: 1, phase: 0 });
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
    this.clock += dt;
    this.camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
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
        b.s.material.map = (f.k > 0.9 ? PIGEON.stand : flap ? PIGEON.up : PIGEON.down).texture;
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
        b.facing = to.x > b.pos.x ? 1 : -1;
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
          if (Math.abs(step.x) > 0.05) b.facing = step.x > 0 ? 1 : -1;
          b.pecking = false;
        } else b.facing *= -1;
        b.s.material.map = (b.pecking ? PIGEON.peck : PIGEON.stand).texture;
      }
      b.s.position.copy(b.pos);
      this.face(b.s, b.facing, PIGEON.stand.w);
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
          if (Math.abs(d.x) > 0.01) c.facing = d.x > 0 ? 1 : -1;
        }
        c.phase += dt * c.speed * 5;
        c.s.material.map = (Math.floor(c.phase) % 2 ? c.frames.walk1 : c.frames.walk2).texture;
        this.setSize(c.s, c.frames.walk1);
        if (!c.path.length) {
          c.s.material.map = c.frames[c.spot.pose].texture;
          c.until = this.clock + rand(25, 80);
        }
      } else {
        if (c === this.pet) {
          c.s.position.copy(c.pos);
          this.face(c.s, c.facing, c.frames.sit.w);
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
      this.face(c.s, c.facing, c.frames.sit.w);
    }
  }

  private setSize(s: THREE.Sprite, f: Frame) {
    s.scale.y = f.h * PX;
  }

  /** Sprites face the camera; flip so the head points the way it is going, on screen. */
  private face(s: THREE.Sprite, facing: number, w: number) {
    const along = new THREE.Vector3(facing, 0, 0).dot(this.camRight);
    s.scale.x = w * PX * (along >= 0 ? 1 : -1);
  }
}
