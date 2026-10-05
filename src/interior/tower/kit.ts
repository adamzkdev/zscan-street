import * as THREE from "three";
import { ZScan } from "../../data/zscan";
import { Snark, loadArt } from "../../scene/snark";
import { hash } from "../../scene/voxel/model";
import type { VoxelModel } from "../../scene/voxel/model";
import { frame, place, sconce } from "../furniture";
import { box, glowMat, std, textPlane, wall } from "../kit";
import type { InteriorContext, PickInfo, Rect } from "../types";

/**
 * The ZK TOWER's shared kit: its levels, one group per floor (only the floor you are on is drawn),
 * colliders, people, ticks, and the helpers every floor uses — glass shell with its finishes,
 * the elevators, voxel furniture with automatic colliders, live screens, paintings, people who
 * sit, talk and potter about.
 */

export const X0 = -12,
  X1 = 12,
  Z0 = -18,
  Z1 = 0;

export const LEVELS = [
  { label: "G", name: "Grand lobby · concierge, lounge", y: 0, h: 6 },
  { label: "1", name: "Offices · coworking, meeting room", y: 6.4, h: 4 },
  { label: "2", name: "Game hall · arcade, paintball", y: 10.8, h: 4.4 },
  { label: "3", name: "Bowling & karaoke · dance, billiards", y: 15.6, h: 4.4 },
  { label: "4", name: "Gym · cardio, weights, boxing", y: 20.4, h: 4 },
  { label: "5", name: "Pool · infinity pool, jacuzzi", y: 24.8, h: 4.4 },
  { label: "6", name: "Residences · flats 601–604", y: 29.6, h: 3.6 },
  { label: "R", name: "Rooftop · bar, garden, helipad", y: 33.6, h: 0 },
];
export const LIGHTS_PER_FLOOR = 4;

/** What zkSNARKs say when you click them, by role. */
const LINES: Record<string, string[]> = {
  Concierge: ["Welcome to the ZK TOWER. The arcade is on 2, the pool on 5, the sky bar on the roof.", "Lost a parcel? It's in the MEMPOOL until the bus comes.", "Residents only above the 6th… just kidding, go up."],
  Developer: ["Shipping a wallet update. Unified addresses everywhere.", "My tests pass on testnet. NU7 on testnet is so fast.", "Don't look at my screen, it's shielded."],
  Barista: ["One shielded espresso? The mempool is quiet, it'll be quick.", "The coffee is ZIP-317 compliant: you pay by the action."],
  Gamer: ["I'm on wave 9 of Shielded Invaders, don't talk to me.", "ZK KART: take the inside of the last turn.", "The claw machine is rigged. I love it."],
  Racer: ["Orchard drives clean, Sapling cuts corners.", "Best time 41 seconds. Beat it."],
  Bowler: ["Strike! …well, a spare.", "Lane two curves left, I swear."],
  Singer: ["Next song: \"Shield me\". Everybody!", "I only sing in zero knowledge."],
  Runner: ["Ten kilometres, one block every 75 seconds. After NU7, every 25.", "Running to the bus stop. Every day."],
  Swimmer: ["The Ironwood lane is the busiest now.", "Water's perfect. Nothing leaks in a shielded pool."],
  Resident: ["Home sweet home. The TV shows the chain all day.", "Come in, mind the shoes.", "I moved my coins to Ironwood. Feels safer."],
  Bartender: ["What'll it be? The Shielded Sour is popular.", "Watch the sky when a block lands."],
  Guest: ["Best view in the city.", "Every block, fireworks. I could stay all night."],
};
export const linesFor = (role: string) => LINES[role] ?? LINES[Object.keys(LINES).find((k) => role.includes(k)) ?? "Guest"];

export type Tick = (dt: number, t: number) => void;
export type PickFn = (hit?: THREE.Intersection) => PickInfo | null;

export function makeCanvas(w: number, h: number, draw?: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw?.(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, g, t };
}

export class TowerKit {
  readonly groups = LEVELS.map(() => new THREE.Group());
  readonly rects: Rect[][] = LEVELS.map(() => []);
  readonly people: Snark[][] = LEVELS.map(() => []);
  readonly ticks: Tick[][] = LEVELS.map(() => []);
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, string>();
  readonly floorOf = new Map<THREE.Object3D, number>();
  private lightCount = LEVELS.map(() => 0);
  current = 0;
  height = 0;

  // shared materials
  readonly glass = new THREE.MeshStandardMaterial({ color: "#9cc3df", transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.3, depthWrite: false });
  readonly mullion = std("#2a2832", 0.4, 0.6);
  readonly walnut = std("#4a3020", 0.6);
  readonly dark = std("#1c1a22", 0.5, 0.3);
  readonly white = std("#ece8e0", 0.6);
  readonly chrome = std("#c8ccd4", 0.2, 0.9);

  constructor(
    readonly ctx: InteriorContext,
    readonly scene: THREE.Scene,
  ) {
    for (const g of this.groups) scene.add(g);
    ctx.onBlock((h) => (this.height = h));
  }

  y(f: number) {
    return LEVELS[f].y;
  }

  pick(f: number, o: THREE.Object3D, hover: string, info: PickFn) {
    this.pickables.push(o);
    this.floorOf.set(o, f);
    this.hovers.set(o, hover);
    this.picks.set(o, info);
  }

  light(f: number, x: number, z: number, color = "#ffe6c8", intensity = 8, dy = -0.4) {
    if (this.lightCount[f] >= LIGHTS_PER_FLOOR) return;
    this.lightCount[f]++;
    const l = new THREE.PointLight(color, intensity, 20, 1.5);
    l.position.set(x, LEVELS[f].y + (LEVELS[f].h || 4) + dy, z);
    this.groups[f].add(l);
  }

  /** Every floor ends up with exactly four lights: changing floor never recompiles a shader. */
  padLights() {
    LEVELS.forEach((_, f) => {
      while (this.lightCount[f] < LIGHTS_PER_FLOOR) this.light(f, 0, -9, "#000000", 0);
    });
  }

  /**
   * A piece of voxel furniture at (x, z) on floor f, turned `rot`; by default it also blocks the
   * walker (its footprint, slightly shrunk).
   */
  put(f: number, key: string, build: () => VoxelModel, x: number, z: number, rot = 0, o: { dy?: number; solid?: boolean } = {}) {
    const obj = place(this.groups[f], key, build, x, LEVELS[f].y + (o.dy ?? 0), z, rot);
    if (o.solid !== false) {
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      if (b.max.y - LEVELS[f].y > 0.25) this.rects[f].push([b.min.x + 0.05, b.min.z + 0.05, b.max.x - 0.05, b.max.z - 0.05]);
    }
    return obj;
  }

  label(f: number, text: string, x: number, y: number, z: number, o: { h?: number; color?: string; bg?: string; rot?: number; glow?: boolean } = {}) {
    const p = textPlane(text, { h: o.h ?? 0.24, color: o.color ?? "#ffd28a", bg: o.bg, glow: o.glow ?? !o.bg });
    p.position.set(x, LEVELS[f].y + y, z);
    p.rotation.y = o.rot ?? 0;
    this.groups[f].add(p);
    return p;
  }

  /** A screen redrawn every few seconds while you are on its floor. */
  screen(f: number, w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, every = 3) {
    const W = 512,
      H = Math.round((512 * h) / w);
    const s = makeCanvas(W, H);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.t, toneMapped: false }));
    let acc = every;
    this.ticks[f].push((dt) => {
      acc += dt;
      if (acc < every) return;
      acc = 0;
      draw(s.g, W, H);
      s.t.needsUpdate = true;
    });
    draw(s.g, W, H);
    s.t.needsUpdate = true;
    this.groups[f].add(mesh);
    return mesh;
  }

  /** A zkSNARK portrait in a gold frame on a wall (facing `rot`). */
  painting(f: number, id: number, x: number, y: number, z: number, rot: number, size = 0.9) {
    const g = new THREE.Group();
    g.position.set(x, LEVELS[f].y + y, z);
    g.rotation.y = rot;
    place(g, `frame${size}`, () => frame(size + 0.12, size + 0.12), 0, -(size + 0.12) / 2, 0);
    const tex = new THREE.TextureLoader().load(ZScan.zkSnarkImage(id));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    art.position.z = 0.05;
    g.add(art);
    this.groups[f].add(g);
    this.pick(f, art, `<b>zkSNARK #${id}</b><span>a portrait</span>`, () => ({ eyebrow: "Painting", title: `zkSNARK #${id}`, image: ZScan.zkSnarkImage(id), body: "<p>One of the 10,000. The whole collection hangs in zkCARDS, next door to the MEMPOOL.</p>" }));
  }

  /** A row of wall sconces along a wall (facing `rot`). */
  sconces(f: number, from: [number, number], to: [number, number], n: number, rot: number, y = 2.2, color?: string) {
    for (let k = 0; k < n; k++) {
      const t = n > 1 ? k / (n - 1) : 0.5;
      place(this.groups[f], `sconce${color ?? ""}`, () => sconce(color), from[0] + (to[0] - from[0]) * t, LEVELS[f].y + y, from[1] + (to[1] - from[1]) * t, rot);
    }
  }

  /**
   * A zkSNARK on this floor. Options: sit (on a seat `dy` high), face, bob (a little bounce),
   * wander between spots, and what it says when clicked (by role).
   */
  async person(f: number, id: number, at: [number, number], role: string, o: { face?: THREE.Vector3; wander?: [number, number][]; dy?: number; bob?: number; sit?: boolean } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      const base = LEVELS[f].y + (o.dy ?? 0);
      s.root.position.set(at[0], base, at[1]);
      s.faceDir = o.face ?? new THREE.Vector3(0, 0, 1);
      if (o.sit) s.sit(true);
      this.groups[f].add(s.root);
      this.people[f].push(s);
      if (o.bob) this.ticks[f].push((_, t) => (s.root.position.y = base + Math.abs(Math.sin(t * o.bob! + id)) * 0.08));
      let said = 0;
      const lines = linesFor(role);
      this.pick(f, s.body, `<b>${role}</b><span>zkSNARK #${id} · say hi</span>`, () => ({ eyebrow: role, title: `“${lines[said++ % lines.length]}”`, image: ZScan.zkSnarkImage(id), body: `<p>zkSNARK #${id}</p>` }));
      if (o.wander) {
        const w = o.wander;
        void (async () => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 4000 + Math.random() * 7000));
            if (this.current !== f) continue;
            s.faceDir = null;
            const p = w[Math.floor(Math.random() * w.length)];
            await s.walk([new THREE.Vector3(p[0], base, p[1])], 0.9);
            s.faceDir = o.face ?? null;
          }
        })();
      }
      return s;
    } catch {
      return null;
    }
  }

  /**
   * Floor slab, ceiling with recessed light panels, the core wall west, glass on three sides with
   * mullions, a skirting and a sill. `door`: the lobby's entrance gap on the south side.
   */
  shell(f: number, floorMat: THREE.Material, ceil: THREE.Material | null, o: { door?: boolean; wallMat?: THREE.Material; panels?: string } = {}) {
    const { y, h } = LEVELS[f];
    const g = this.groups[f];
    box(g, X1 - X0, 0.2, Z1 - Z0, floorMat, 0, y - 0.2, (Z0 + Z1) / 2);
    if (ceil) {
      box(g, X1 - X0, 0.2, Z1 - Z0, ceil, 0, y + h, (Z0 + Z1) / 2);
      // recessed light panels in a grid
      if (o.panels !== "none") {
        const m = glowMat(o.panels ?? "#f4f0e8", 0.9);
        for (let x = -8; x <= 8; x += 4) for (let z = -15; z <= -3; z += 4) box(g, 1.2, 0.02, 1.2, m, x, y + h - 0.02, z);
      }
    }
    const H = h || 1.1;
    this.rects[f].push(wall(g, X0, Z0, X0, Z1, H, o.wallMat ?? std("#2e2a36", 0.8), y));
    const pane = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len, H), this.glass);
      p.position.set((x0 + x1) / 2, y + H / 2, (z0 + z1) / 2);
      p.rotation.y = x0 === x1 ? Math.PI / 2 : 0;
      p.raycast = () => {};
      g.add(p);
      const n = Math.max(1, Math.round(len / 2));
      for (let k = 0; k <= n; k++) box(g, 0.08, H, 0.08, this.mullion, x0 + ((x1 - x0) * k) / n, y, z0 + ((z1 - z0) * k) / n);
      // a skirting along the bottom, a transom at the top
      const along = x0 === x1 ? [0.1, 0.1, len] : [len, 0.1, 0.1];
      box(g, along[0], 0.1, along[2], this.mullion, (x0 + x1) / 2, y, (z0 + z1) / 2);
      if (h) box(g, along[0], 0.08, along[2], this.mullion, (x0 + x1) / 2, y + H - 0.08, (z0 + z1) / 2);
      this.rects[f].push([Math.min(x0, x1) - 0.1, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, Math.max(z0, z1) + 0.1]);
    };
    pane(X0, Z0, X1, Z0);
    pane(X1, Z0, X1, Z1);
    if (o.door) {
      pane(X0, Z1, -1.6, Z1);
      pane(1.6, Z1, X1, Z1);
    } else pane(X0, Z1, X1, Z1);
    if (!h) for (const [a, b, c, d] of [[X0, Z0, X1, Z0], [X1, Z0, X1, Z1], [X0, Z1, X1, Z1]] as const) box(g, Math.max(0.06, Math.abs(c - a)), 0.06, Math.max(0.06, Math.abs(d - b)), this.chrome, (a + c) / 2, y + H, (b + d) / 2);
  }

  /** The elevator bank on the core wall: ▲ up a floor, ▼ down. */
  elevators(f: number) {
    const { y } = LEVELS[f];
    const g = this.groups[f];
    for (const [z, dir] of [
      [-7.4, 1],
      [-10.6, -1],
    ] as const) {
      const to = f + dir;
      if (to < 0 || to >= LEVELS.length) continue;
      box(g, 0.14, 2.7, 1.9, std("#8a8494", 0.35, 0.6), X0 + 0.18, y, z);
      const doors = box(g, 0.16, 2.3, 1.4, this.chrome, X0 + 0.2, y, z);
      box(g, 0.18, 2.3, 0.03, this.dark, X0 + 0.21, y, z);
      box(g, 0.05, 0.14, 0.6, glowMat(dir > 0 ? "#3ee08f" : "#ff9f2e", 1.6), X0 + 0.26, y + 2.75, z);
      box(g, 0.05, 0.3, 0.12, this.dark, X0 + 0.26, y + 1.1, z + 0.95);
      box(g, 0.06, 0.08, 0.08, glowMat(dir > 0 ? "#3ee08f" : "#ff9f2e", 1.8), X0 + 0.27, y + 1.15, z + 0.95);
      this.label(f, `${dir > 0 ? "▲" : "▼"} ${LEVELS[to].label} · ${LEVELS[to].name.split(" · ")[0].toUpperCase()}`, X0 + 0.27, 3.05, z, { h: 0.16, color: dir > 0 ? "#3ee08f" : "#ff9f2e", rot: Math.PI / 2 });
      this.pick(f, doors, `<b>Elevator ${dir > 0 ? "up" : "down"}</b><span>${LEVELS[to].name}</span>`, () => ({ eyebrow: "Elevator", title: LEVELS[to].name, floor: to }));
    }
    this.rects[f].push([X0, -11.6, X0 + 0.5, -6.4]);
    this.label(f, `${LEVELS[f].label} · ${LEVELS[f].name.split(" · ")[0].toUpperCase()}`, X0 + 0.27, 3.5, -9, { h: 0.26, color: "#7fe3ff", rot: Math.PI / 2 });
  }

  /** A wall of `len` metres with a doorway, for rooms inside a floor. */
  partition(f: number, x0: number, z0: number, x1: number, z1: number, mat: THREE.Material, gap?: [number, number], h = LEVELS[f].h) {
    const g = this.groups[f],
      y = LEVELS[f].y;
    if (!gap) return void this.rects[f].push(wall(g, x0, z0, x1, z1, h, mat, y, 0.12));
    const along = x0 === x1 ? "z" : "x";
    const [a, b] = along === "x" ? [x0, x1] : [z0, z1];
    const lo = Math.min(a, b),
      hi = Math.max(a, b);
    for (const [s, e] of [
      [lo, gap[0]],
      [gap[1], hi],
    ])
      if (e - s > 0.05) this.rects[f].push(along === "x" ? wall(g, s, z0, e, z0, h, mat, y, 0.12) : wall(g, x0, s, x0, e, h, mat, y, 0.12));
    // the lintel over the doorway
    if (h > 2.3) {
      const w = gap[1] - gap[0];
      if (along === "x") box(g, w, h - 2.2, 0.12, mat, (gap[0] + gap[1]) / 2, y + 2.2, z0);
      else box(g, 0.12, h - 2.2, w, mat, x0, y + 2.2, (gap[0] + gap[1]) / 2);
    }
  }

  /** A seeded scatter of small things (used for clutter on shelves and floors). */
  rnd(i: number, j = 0) {
    return hash(i, j, 77, 1);
  }
}
