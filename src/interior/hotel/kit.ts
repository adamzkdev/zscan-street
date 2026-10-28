import { portraitTexture } from "../../data/portrait";
import * as THREE from "three";
import { Market } from "../../data/market";
import { ZScan } from "../../data/zscan";
import { Snark, loadArt } from "../../scene/snark";
import { hash } from "../../scene/voxel/model";
import type { VoxelModel } from "../../scene/voxel/model";
import { frame, place, sconce } from "../furniture";
import { box, glowMat, std, textPlane, wall } from "../kit";
import type { InteriorContext, PickInfo, Rect } from "../types";

/**
 * The MARINA ZEC HOTEL's shared kit: its levels (each with its own footprint), one group per floor
 * (only the floor you are on is drawn), colliders, people, ticks, and the helpers every floor uses.
 */

export interface Level {
  label: string;
  name: string;
  y: number;
  h: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Where the lifts are (x of their wall), when not on the west wall. */
  lx?: number;
}

const B = { x0: -15, x1: 15, z0: -22, z1: 0 };
export const LEVELS: Level[] = [
  { label: "G", name: "Grand atrium · check-in, lounge", y: 0, h: 9, ...B },
  { label: "2", name: "Casino · tables, slots", y: 9.6, h: 5, ...B },
  { label: "20", name: "Deluxe rooms · 2001–2008", y: 20, h: 3.4, ...B },
  { label: "33", name: "Suites · 3301–3303", y: 33, h: 3.6, ...B },
  { label: "40", name: "Spa & fitness · sauna, gym", y: 40, h: 4.2, ...B },
  { label: "56", name: "Sky restaurant · bar, dining", y: 50, h: 4.4, ...B },
  { label: "57", name: "SkyPark · infinity pool", y: 55.4, h: 0, x0: -30, x1: 30, z0: -18, z1: 0, lx: -27 },
];
export const LIGHTS_PER_FLOOR = 5;
/** Where the lifts are: the core wall, west, around this z. */
export const LIFT_Z = -11;

export type Tick = (dt: number, t: number) => void;
export type PickFn = (hit?: THREE.Intersection) => PickInfo | null;

export const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** The block reward in ZEC (the API gives it in zatoshi): the live subsidy, or the current 1.5625. */
export const reward = () => {
  const s = Market.state.supply?.block_subsidy;
  return s == null ? 1.5625 : s > 1000 ? s / 1e8 : s;
};
export const num = (n: number) => n.toLocaleString("en-US");

/** What zkSNARKs say when you click them, by role. Some lines read the live chain. */
const LINES: Record<string, (k: HotelKit) => string[]> = {
  Concierge: (k) => {
    const p = Market.state.price;
    return [p ? `ZEC is ${usd(p.usd)} this evening, ${p.usd_24h_change >= 0 ? "+" : ""}${p.usd_24h_change.toFixed(1)}% today.` : "The rate board is updating.", "The SkyPark is on 57. Towels by the pool.", `Block ${k.height ? num(k.height) : "…"}. The casino jackpot just moved.`];
  },
  Receptionist: () => ["Welcome to the Marina ZEC. Your key card is shielded.", "Check-out is at noon. Late check-out after the halving.", "Room 2004 has the best view of the river."],
  Bellboy: () => ["Your bags are on their way up.", "Fourteen floors of luggage before lunch."],
  Pianist: () => ["Requests? I only play in zero knowledge.", "This one is called “Orchard at night”."],
  Dealer: (k) => [`Place your bets. Last block: ${k.height ? num(k.height) : "…"}.`, "Blackjack pays three to two.", "No more bets."],
  Croupier: (k) => [`The wheel follows the chain: ${k.height ? `${k.height % 37}` : "…"} came up on the last block.`, "Rien ne va plus."],
  Gambler: () => ["One more spin.", "I'm up two ZEC. Don't tell anyone.", "Shielded winnings, private losses."],
  Housekeeper: () => ["Fresh towels on the bed.", "Do not disturb? Of course."],
  Guest: () => ["Best view in the city.", "Every block, the pool lights up.", "We came for the infinity pool."],
  Therapist: () => ["Hot stones, sixty minutes. Breathe.", "The sauna is at 85 degrees."],
  Runner: (k) => {
    const n = Market.state.network;
    return [n ? `A block every ~${n.avg_block_time.toFixed(0)} s. I run a lap per block.` : "Ten kilometres before breakfast.", "Treadmill with a view. Unbeatable."];
  },
  Chef: () => ["Tonight: chilli crab, black pepper, ZEC gold leaf.", "Service in five!"],
  Waiter: () => ["Your table by the window is ready.", "The tasting menu has nine courses."],
  Sommelier: () => ["A 2016 Sprout. Rare, slightly transparent.", "This Orchard pairs with the crab."],
  Bartender: () => ["What'll it be? The Marina Sling is popular.", "On the house when a block lands."],
  Swimmer: () => ["The water ends at the sky.", "Fifty-seven floors up and I'm floating."],
  Lifeguard: () => ["No diving off the edge.", "The edge is an illusion. The glass isn't."],
  DJ: () => ["Next track: “Halving”.", "BPM matches the block time. Kind of."],
};
export const linesFor = (role: string) => LINES[role] ?? LINES[Object.keys(LINES).find((k) => role.includes(k)) ?? "Guest"];

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

/** A repeating canvas texture. */
export function tex(size: number, rx: number, ry: number, draw: (g: CanvasRenderingContext2D, S: number) => void) {
  const { t } = makeCanvas(size, size, (g) => draw(g, size));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

/** Polished marble with veins. */
export function marble(base = "#ebe6dd", vein = "120,110,100", rx = 10, ry = 7) {
  return tex(256, rx, ry, (g, S) => {
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(${vein},${0.05 + hash(i, 1, 2, 3) * 0.12})`;
      g.lineWidth = 1 + hash(i, 2, 2, 3) * 2;
      g.beginPath();
      g.moveTo(hash(i, 3, 2, 3) * S, 0);
      g.bezierCurveTo(hash(i, 4, 2, 3) * S, 90, hash(i, 5, 2, 3) * S, 170, hash(i, 6, 2, 3) * S, S);
      g.stroke();
    }
    g.fillStyle = "rgba(0,0,0,0.1)";
    g.fillRect(0, 0, S, 2);
    g.fillRect(0, 0, 2, S);
  });
}

export function water(rx = 4, ry = 3, base = "#1a8fb8") {
  return tex(256, rx, ry, (g, S) => {
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(200,250,255,${0.15 + hash(i, 1, 4, 4) * 0.25})`;
      g.lineWidth = 1.5;
      g.beginPath();
      const x = hash(i, 2, 4, 4) * S,
        y = hash(i, 3, 4, 4) * S,
        r = 6 + hash(i, 4, 4, 4) * 18;
      g.ellipse(x, y, r, r * 0.6, hash(i, 5, 4, 4) * 3, 0, Math.PI * 2);
      g.stroke();
    }
  });
}

/** A hotel carpet: a ground colour, a repeating gold motif. */
export function carpet(base: string, motif: string, rx: number, ry: number, kind: "diamond" | "wave" | "dots" = "diamond") {
  return tex(128, rx, ry, (g, S) => {
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = motif;
    g.fillStyle = motif;
    g.lineWidth = 3;
    if (kind === "diamond") {
      g.beginPath();
      g.moveTo(S / 2, 8);
      g.lineTo(S - 8, S / 2);
      g.lineTo(S / 2, S - 8);
      g.lineTo(8, S / 2);
      g.closePath();
      g.stroke();
      g.fillRect(S / 2 - 4, S / 2 - 4, 8, 8);
    } else if (kind === "wave") {
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        for (let x = 0; x <= S; x += 4) g.lineTo(x, k * 32 + 16 + Math.sin((x / S) * Math.PI * 2) * 8);
        g.stroke();
      }
    } else
      for (let k = 0; k < 16; k++) {
        g.beginPath();
        g.arc((k % 4) * 32 + 16, Math.floor(k / 4) * 32 + 16, 3, 0, Math.PI * 2);
        g.fill();
      }
  });
}

/** Wood boards. */
export function boards(c1: string, c2: string, rx: number, ry: number) {
  return tex(128, rx, ry, (g, S) => {
    g.fillStyle = c1;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? c2 : c1;
      g.fillRect(0, i * 16, S, 15);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(((i * 37) % 100) + 10, i * 16, 2, 15);
      g.fillRect(0, i * 16 + 15, S, 1);
    }
  });
}

export function tiles(c: string, line: string, rx: number, ry: number) {
  return tex(64, rx, ry, (g, S) => {
    g.fillStyle = c;
    g.fillRect(0, 0, S, S);
    g.fillStyle = line;
    g.fillRect(0, 0, S, 2);
    g.fillRect(0, 0, 2, S);
  });
}

export class HotelKit {
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
  private lastHeight = 0;
  lastPool: string | null = null;
  lastAt = 0;
  get height() {
    return Math.max(this.lastHeight, this.ctx.director.blockHeight ?? 0);
  }
  /** Seconds since the last block (or null). */
  get since() {
    const t = Math.max(this.lastAt, this.ctx.director.lastBlockTime || 0);
    return t ? Math.max(0, Math.round((Date.now() - t) / 1000)) : null;
  }

  readonly glass = new THREE.MeshStandardMaterial({ color: "#9cc3df", transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.3, depthWrite: false });
  readonly mullion = std("#2a2832", 0.4, 0.6);
  readonly dark = std("#1c1a22", 0.5, 0.3);
  readonly white = std("#ece8e0", 0.6);
  readonly chrome = std("#c8ccd4", 0.2, 0.9);
  readonly gold = std("#c9a227", 0.3, 0.8);
  readonly hidden = new THREE.MeshBasicMaterial({ visible: false });

  constructor(
    readonly ctx: InteriorContext,
    readonly scene: THREE.Scene,
  ) {
    for (const g of this.groups) scene.add(g);
    ctx.onBlock((h, pool) => {
      this.lastHeight = h;
      this.lastPool = pool;
      this.lastAt = Date.now();
    });
    Market.subscribe(() => {});
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

  /** Every mesh of an object answers the same click. */
  pickAll(f: number, o: THREE.Object3D, hover: string, info: PickFn) {
    o.traverse((m) => m instanceof THREE.Mesh && this.pick(f, m, hover, info));
  }

  /** An invisible box that answers clicks (for a group of things). */
  hit(f: number, w: number, h: number, d: number, x: number, dy: number, z: number, hover: string, info: PickFn, rot = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.hidden);
    m.position.set(x, LEVELS[f].y + dy + h / 2, z);
    m.rotation.y = rot;
    this.groups[f].add(m);
    this.pick(f, m, hover, info);
    return m;
  }

  light(f: number, x: number, z: number, color = "#ffe6c8", intensity = 8, dy = -0.4, dist = 20) {
    if (this.lightCount[f] >= LIGHTS_PER_FLOOR) return;
    this.lightCount[f]++;
    const l = new THREE.PointLight(color, intensity, dist, 1.5);
    l.position.set(x, LEVELS[f].y + (LEVELS[f].h || 4) + dy, z);
    this.groups[f].add(l);
  }

  padLights() {
    LEVELS.forEach((_, f) => {
      while (this.lightCount[f] < LIGHTS_PER_FLOOR) this.light(f, 0, -9, "#000000", 0);
    });
  }

  put(f: number, key: string, build: () => VoxelModel, x: number, z: number, rot = 0, o: { dy?: number; solid?: boolean } = {}) {
    const obj = place(this.groups[f], key, build, x, LEVELS[f].y + (o.dy ?? 0), z, rot);
    if (o.solid !== false) {
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      if (b.max.y - LEVELS[f].y > 0.25) this.rects[f].push([b.min.x + 0.05, b.min.z + 0.05, b.max.x - 0.05, b.max.z - 0.05]);
    }
    return obj;
  }

  label(f: number, text: string, x: number, y: number, z: number, o: { h?: number; color?: string; bg?: string; rot?: number; glow?: boolean; font?: string } = {}) {
    const p = textPlane(text, { h: o.h ?? 0.24, color: o.color ?? "#ffd28a", bg: o.bg, glow: o.glow ?? !o.bg, font: o.font });
    p.position.set(x, LEVELS[f].y + y, z);
    p.rotation.y = o.rot ?? 0;
    this.groups[f].add(p);
    return p;
  }

  /** A screen redrawn every few seconds while you are on its floor. */
  screen(f: number, w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, every = 3, res = 512) {
    const W = res,
      H = Math.round((res * h) / w);
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
  painting(f: number, id: number, x: number, y: number, z: number, rot: number, size = 0.9, color?: string) {
    const g = new THREE.Group();
    g.position.set(x, LEVELS[f].y + y, z);
    g.rotation.y = rot;
    place(g, `frame${size}${color ?? ""}`, () => frame(size + 0.12, size + 0.12, color), 0, -(size + 0.12) / 2, 0);
    const t = portraitTexture(ZScan.zkSnarkImage(id));
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
    art.position.z = 0.05;
    g.add(art);
    this.groups[f].add(g);
    this.pick(f, art, `<b>zkSNARK #${id}</b><span>portrait</span>`, () => ({ eyebrow: "Painting", title: `zkSNARK #${id}`, image: ZScan.zkSnarkImage(id) }));
  }

  sconces(f: number, from: [number, number], to: [number, number], n: number, rot: number, y = 2.2, color?: string) {
    for (let k = 0; k < n; k++) {
      const t = n > 1 ? k / (n - 1) : 0.5;
      place(this.groups[f], `sconce${color ?? ""}`, () => sconce(color), from[0] + (to[0] - from[0]) * t, LEVELS[f].y + y, from[1] + (to[1] - from[1]) * t, rot);
    }
  }

  async person(f: number, id: number, at: [number, number], role: string, o: { face?: THREE.Vector3; wander?: [number, number][]; dy?: number; bob?: number; sit?: boolean; swim?: (s: Snark, t: number) => void } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      // kitchen staff in a toque (painted on, fitted to the head)
      if (role === "Chef" || role === "Cook") s.wear({ hat: "chef" });
      const base = LEVELS[f].y + (o.dy ?? 0);
      s.root.position.set(at[0], base, at[1]);
      s.faceDir = o.face ?? new THREE.Vector3(0, 0, 1);
      // lifted onto the seat (dy = its height): sit on it; on the floor: onto the seat it is next to
      if (o.sit) {
        if (o.dy) s.sit(true, o.dy);
        else s.perchNear();
      }
      this.groups[f].add(s.root);
      this.people[f].push(s);
      if (o.bob) this.ticks[f].push((_, t) => (s.root.position.y = base + Math.abs(Math.sin(t * o.bob! + id)) * 0.08));
      if (o.swim) this.ticks[f].push((_, t) => o.swim!(s, t));
      let said = 0;
      this.pick(f, s.body, `<b>${role}</b><span>zkSNARK #${id}</span>`, () => {
        const lines = linesFor(role)(this);
        return { eyebrow: role, title: `“${lines[said++ % lines.length]}”`, image: ZScan.zkSnarkImage(id), body: `<p>zkSNARK #${id}</p>` };
      });
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
   * Floor slab, ceiling (with recessed panels unless `panels: "none"`), the core wall west, glass
   * on the three other sides with mullions. `door`: the entrance gap on the south side.
   */
  shell(f: number, floorMat: THREE.Material, ceil: THREE.Material | null, o: { door?: boolean; wallMat?: THREE.Material; panels?: string; step?: number; open?: string; noFloor?: boolean; westDoor?: [number, number, number] } = {}) {
    const { y, h, x0: X0, x1: X1, z0: Z0, z1: Z1 } = LEVELS[f];
    const g = this.groups[f];
    if (!o.noFloor) box(g, X1 - X0, 0.2, Z1 - Z0, floorMat, (X0 + X1) / 2, y - 0.2, (Z0 + Z1) / 2);
    if (ceil) {
      box(g, X1 - X0, 0.2, Z1 - Z0, ceil, (X0 + X1) / 2, y + h, (Z0 + Z1) / 2);
      if (o.panels !== "none") {
        const m = glowMat(o.panels ?? "#f4f0e8", 0.9);
        for (let x = X0 + 4; x <= X1 - 3; x += 4) for (let z = Z0 + 3; z <= Z1 - 3; z += 4) box(g, 1.2, 0.02, 1.2, m, x, y + h - 0.02, z);
      }
    }
    const H = h || 1.1;
    const wm = o.wallMat ?? std("#2e2a36", 0.8);
    // the core wall; `westDoor` [z0, z1, height]: a doorway through it (the grand staircase behind)
    const wd = o.westDoor;
    if (!wd) this.rects[f].push(wall(g, X0, Z0, X0, Z1, H, wm, y));
    else {
      this.rects[f].push(wall(g, X0, Z0, X0, wd[0], H, wm, y), wall(g, X0, wd[1], X0, Z1, H, wm, y));
      box(g, 0.2, H - wd[2], wd[1] - wd[0], wm, X0, y + wd[2], (wd[0] + wd[1]) / 2);
    }
    const pane = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len, H), this.glass);
      p.position.set((x0 + x1) / 2, y + H / 2, (z0 + z1) / 2);
      p.rotation.y = x0 === x1 ? Math.PI / 2 : 0;
      p.raycast = () => {};
      g.add(p);
      const n = Math.max(1, Math.round(len / (o.step ?? 2)));
      for (let k = 0; k <= n; k++) box(g, 0.08, H, 0.08, this.mullion, x0 + ((x1 - x0) * k) / n, y, z0 + ((z1 - z0) * k) / n);
      const along = x0 === x1 ? [0.1, 0.1, len] : [len, 0.1, 0.1];
      box(g, along[0], 0.1, along[2], this.mullion, (x0 + x1) / 2, y, (z0 + z1) / 2);
      if (h) box(g, along[0], 0.08, along[2], this.mullion, (x0 + x1) / 2, y + H - 0.08, (z0 + z1) / 2);
      this.rects[f].push([Math.min(x0, x1) - 0.1, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, Math.max(z0, z1) + 0.1]);
    };
    pane(X0, Z0, X1, Z0);
    if (!o.open?.includes("e")) pane(X1, Z0, X1, Z1);
    if (o.open?.includes("s")) {
      // no glass along the south edge (the infinity pool meets the sky); it still stops the walker
    } else if (o.door) {
      pane(X0, Z1, -1.8, Z1);
      pane(1.8, Z1, X1, Z1);
    } else pane(X0, Z1, X1, Z1);
    if (!h) for (const [a, b, c, d] of ([[X0, Z0, X1, Z0], [X1, Z0, X1, Z1], [X0, Z1, X1, Z1]] as const).filter((_, i) => !(i === 1 && o.open?.includes("e")) && !(i === 2 && o.open?.includes("s")))) box(g, Math.max(0.06, Math.abs(c - a)), 0.06, Math.max(0.06, Math.abs(d - b)), this.chrome, (a + c) / 2, y + H, (b + d) / 2);
  }

  /**
   * The lift lobby on the core wall (or on a wall at `x`, facing +x): a car up, a car down, and
   * between them the destination panel, one lit button per floor.
   */
  lifts(f: number, x = LEVELS[f].lx ?? LEVELS[f].x0, zc = LIFT_Z) {
    const { y } = LEVELS[f];
    const g = this.groups[f];
    const brass = std("#b08a3a", 0.3, 0.8);
    for (const [z, dir] of [
      [zc + 2.2, 1],
      [zc - 2.2, -1],
    ] as const) {
      const to = f + dir;
      if (to < 0 || to >= LEVELS.length) continue;
      box(g, 0.14, 2.9, 1.9, brass, x + 0.18, y, z);
      const doors = box(g, 0.16, 2.5, 1.4, std("#d8c08a", 0.25, 0.85), x + 0.2, y, z);
      box(g, 0.18, 2.5, 0.03, this.dark, x + 0.21, y, z);
      box(g, 0.05, 0.12, 0.6, glowMat(dir > 0 ? "#3ee08f" : "#ff9f2e", 1.6), x + 0.26, y + 2.95, z);
      this.label(f, `${dir > 0 ? "▲" : "▼"} ${LEVELS[to].label} · ${LEVELS[to].name.split(" · ")[0].toUpperCase()}`, x + 0.27, 3.25, z, { h: 0.15, color: dir > 0 ? "#3ee08f" : "#ff9f2e", rot: Math.PI / 2 });
      this.pick(f, doors, `<b>Lift ${dir > 0 ? "up" : "down"}</b><span>${LEVELS[to].label} · ${LEVELS[to].name}</span>`, () => ({ eyebrow: "Lift", title: `${LEVELS[to].label} · ${LEVELS[to].name}`, floor: to }));
    }
    this.rects[f].push([x, zc - 3.3, x + 0.5, zc + 3.3]);
    // the destination panel: a brass plate, one button per floor
    box(g, 0.06, 2.1, 1.2, brass, x + 0.2, y + 0.6, zc);
    LEVELS.forEach((l, i) => {
      const yy = 2.45 - i * 0.27;
      const here = i === f;
      const btn = box(g, 0.05, 0.2, 0.2, here ? glowMat("#7fe3ff", 1.6) : glowMat("#f4b728", 1.0), x + 0.25, y + yy, zc - 0.42);
      this.label(f, `${l.label}  ${l.name.split(" · ")[0]}`, x + 0.25, yy + 0.1, zc + 0.12, { h: 0.12, color: here ? "#7fe3ff" : "#f2e6c8", rot: Math.PI / 2 });
      if (!here) this.pick(f, btn, `<b>${l.label} · ${l.name.split(" · ")[0]}</b><span>${l.name.split(" · ")[1] ?? ""}</span>`, () => ({ eyebrow: "Lift", title: `${l.label} · ${l.name}`, floor: i }));
    });
    this.label(f, `${LEVELS[f].label} · ${LEVELS[f].name.split(" · ")[0].toUpperCase()}`, x + 0.27, 3.75, zc, { h: 0.28, color: "#7fe3ff", rot: Math.PI / 2 });
  }

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
    if (h > 2.3) {
      const w = gap[1] - gap[0];
      if (along === "x") box(g, w, h - 2.2, 0.12, mat, (gap[0] + gap[1]) / 2, y + 2.2, z0);
      else box(g, 0.12, h - 2.2, w, mat, x0, y + 2.2, (gap[0] + gap[1]) / 2);
    }
  }

  /** A flat plane on the floor (rug, water, inlay), `dy` above it. */
  flat(f: number, w: number, d: number, mat: THREE.Material, x: number, z: number, dy = 0.01) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, LEVELS[f].y + dy, z);
    this.groups[f].add(m);
    return m;
  }

  /** Many copies of one small mesh in one draw call. */
  instances(f: number, geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[]) {
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    this.groups[f].add(im);
    return im;
  }

  rnd(i: number, j = 0) {
    return hash(i, j, 77, 1);
  }
}
