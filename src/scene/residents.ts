import * as THREE from "three";
import { CITY } from "./city";
import { DISTRICTS, nz } from "./city/plan";
import type { Director } from "./director";
import type { Snark } from "./snark";
import type { Emote, LifeItem } from "./sprites";

/**
 * The people who live here. They carry no transaction: they come out of their doors, sit on the
 * benches, buy a can at the vending machines, browse the market stalls, feed the koi, pick
 * persimmons, watch the buses, open umbrellas in the rain, and go home again. Their number follows
 * how busy the chain is (and what the device can draw), so the street is never frozen between two
 * blocks, and they react when a bus pulls in.
 */

const v = (x: number, z: number, y = CITY.curb) => new THREE.Vector3(x, y, z);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---- walkways ---------------------------------------------------------------------------------------

/** Pavement corridors as a small graph; people walk node to node, so they keep off the road. */
interface Node {
  p: THREE.Vector3;
  to: number[];
}
const nodes: Node[] = [];
const named = new Map<string, number>();
function node(name: string, x: number, z: number) {
  named.set(name, nodes.length);
  nodes.push({ p: v(x, z), to: [] });
}
function link(...names: string[]) {
  for (let i = 1; i < names.length; i++) {
    const a = named.get(names[i - 1])!,
      b = named.get(names[i])!;
    nodes[a].to.push(b);
    nodes[b].to.push(a);
  }
}
const N_Z = nz(-3.8); // middle of the north pavement
const S_Z = 5.6; // south pavement, behind the bus queue's rows
const CROSS = DISTRICTS[0].crossX - 0.9; // residents keep to the west half of the zebra
// north pavement, end to end (the side streets are crossed on foot, as everyone does)
const NX = [-47, -38, -27.6, -20.4, -14, -0.5, 8, 20.4, 27.6, 38, 47];
NX.forEach((x) => node(`N${x}`, x, N_Z));
link(...NX.map((x) => `N${x}`));
// south pavement: west and east ends; the middle is the bus queue, so it goes round by the plaza
const SX = [-47, -38, -27.6, -20.4, -10.8, -2.2];
SX.forEach((x) => node(`S${x}`, x, S_Z));
link(...SX.map((x) => `S${x}`));
for (const x of [20.4, 27.6, 38, 47]) node(`S${x}`, x, S_Z);
link("S20.4", "S27.6", "S38", "S47");
// the plaza, between the benches and the square
const PX = [-17, -10.8, -6.9, -2.2, 2.1, 10.6, 17];
PX.forEach((x) => node(`P${x}`, x, 10.6));
link(...PX.map((x) => `P${x}`));
link("S-20.4", "P-17");
link("P17", "S20.4");
// several ways up from the pavement, so nobody walks in single file
link("S-2.2", "P-2.2");
link("S-10.8", "P-10.8");
link("S-20.4", "P-10.8");
// the zebra (its two kerbs; crossing waits for the traffic)
node("ZS", CROSS, CITY.south.z0 + 0.45);
node("ZN", CROSS, CITY.north.z1 - 0.35);
link("S-2.2", "ZS");
link("ZN", "N-0.5");
link("ZS", "ZN");
// the Transparent square, round the fountain
node("Q0", 0, 12.6);
node("QL", -8.2, 16.2);
node("QR", 8.2, 16.2);
node("QL2", -8.2, 21);
node("QR2", 8.2, 21);
node("QB", 0, 24.4);
link("P-2.2", "Q0", "P2.1");
link("Q0", "QL", "QL2", "QB", "QR2", "QR", "Q0");
// the Orchard garden, round the koi pond
node("G0", -38, 8.8);
node("GN", -36, 15.4);
node("GW", -43.6, 18.6);
node("GE", -31.4, 18.6);
node("GS", -36, 27.4);
link("S-38", "G0", "GN");
link("GN", "GW", "GS", "GE", "GN");
// up the side street to the orchard rows
node("O1", -27.6, nz(-24.5));
node("O2", -31, nz(-24.5));
link("N-27.6", "O1", "O2");

/** Shortest walk between two nodes (the graph is tiny: plain Dijkstra). */
function route(from: number, to: number) {
  const dist = nodes.map(() => Infinity),
    prev = nodes.map(() => -1),
    done = nodes.map(() => false);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === to) break;
    done[u] = true;
    for (const w of nodes[u].to) {
      const d = dist[u] + nodes[u].p.distanceTo(nodes[w].p);
      if (d < dist[w]) {
        dist[w] = d;
        prev[w] = u;
      }
    }
  }
  const out: number[] = [];
  for (let u = to; u >= 0; u = prev[u]) out.unshift(u);
  return out[0] === from ? out : [from, to];
}

// ---- what there is to do --------------------------------------------------------------------------

interface Spot {
  p: THREE.Vector3;
  /** Which way to look while there. */
  face: THREE.Vector3;
  /** The walkway node it is reached from, and the steps in between. */
  via: number;
  approach: THREE.Vector3[];
  /** Seat height for benches. */
  seat?: number;
  taken: Snark | null;
}

interface Activity {
  role: string;
  weight: number;
  spots: Spot[];
  /** Seconds spent there. */
  stay: [number, number];
  emotes: Emote[];
  /** What they may leave with. */
  gives?: LifeItem[];
  /** What they hold while there. */
  holds?: LifeItem[];
}

const toward = (from: THREE.Vector3, x: number, z: number) => new THREE.Vector3(x - from.x, 0, z - from.z).normalize();
const spot = (p: THREE.Vector3, face: THREE.Vector3, via: string, approach: THREE.Vector3[] = [], seat?: number): Spot => ({ p, face, via: named.get(via)!, approach, seat, taken: null });

/** Bench seats: two per bench, on the side facing away from the backrest. */
function benchSeats(x: number, z: number, rot: number, via: string, y: number, around: number) {
  const f = Math.cos(rot) >= 0 ? 1 : -1; // rot 0 faces +z, rot π faces −z
  const front = z + f * 0.32;
  return [-0.5, 0.5].map((dx) => spot(v(x + dx, front, y), new THREE.Vector3(0, 0, f), via, [v(x + around, z + f * 1.2, y), v(x + dx, z + f * 0.9, y)], y + 0.62));
}

function activities(): Activity[] {
  const ring = (cx: number, cz: number, r: number, n: number, via: (a: number) => string) => {
    const out: Spot[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const p = v(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
      out.push(spot(p, toward(p, cx, cz), via(a)));
    }
    return out;
  };
  return [
    {
      role: "Neighbour",
      weight: 5,
      spots: [
        ...[-8.5, 0.5, 9].flatMap((x) => benchSeats(x, 8.4, Math.PI, x < 0 ? (x < -5 ? "P-6.9" : "P-2.2") : x < 5 ? "P2.1" : "P10.6", CITY.curb + 0.15, 1.6)),
        ...[-4.5, 4.5].flatMap((x) => benchSeats(x, 23.6, 0, "QB", CITY.curb + 0.06, x < 0 ? -1.6 : 1.6)),
        ...benchSeats(-41, 9.4, 0, "G0", CITY.curb, 1.6),
        ...benchSeats(-33.5, 29.6, Math.PI, "GS", CITY.curb, -1.6),
      ],
      stay: [14, 40],
      emotes: ["note", "dots", "zzz", "heart"],
      holds: ["coffee", "phone", "can"],
    },
    {
      role: "Neighbour",
      weight: 3,
      spots: ring(0, 19, 3.5, 9, (a) => (Math.sin(a) < 0 ? (Math.cos(a) < 0 ? "QL" : "QR") : Math.cos(a) < 0 ? "QL2" : "QR2")),
      stay: [8, 22],
      emotes: ["zec", "heart", "note", "star"],
    },
    {
      role: "Neighbour",
      weight: 3,
      spots: ring(-37.5, 21, 4.3, 7, (a) => (Math.sin(a) < 0 ? "GN" : Math.cos(a) < 0 ? "GW" : "GE")).filter((s) => Math.abs(s.p.z - 21) > 1.2),
      stay: [10, 26],
      emotes: ["heart", "note", "dots"],
    },
    {
      role: "Shopper",
      weight: 4,
      spots: [
        // the counters face out of the square: north row toward the plaza, south row toward the library
        ...[-14, -9.5, 9.5, 14].map((x) => spot(v(x, 12.9), new THREE.Vector3(0, 0, 1), "Q0", [v(Math.sign(x) * 4.2, 12.7)])),
        ...[-14, -9.5, 9.5, 14].map((x) => spot(v(x, 24.25), new THREE.Vector3(0, 0, -1), "QB", [v(Math.sign(x) * 7, 24.5)])),
      ],
      stay: [6, 14],
      emotes: ["?", "zec", "heart"],
      gives: ["bag", "flowers", "fish", "bag"],
    },
    {
      role: "Neighbour",
      weight: 3,
      spots: [-3.05, -1.9].map((x) => spot(v(x, nz(-5.6) + 0.45 + 0.5), new THREE.Vector3(0, 0, -1), "N-0.5")),
      stay: [4, 7],
      emotes: ["!", "note"],
      gives: ["can", "coffee"],
    },
    {
      role: "Window shopper",
      weight: 3,
      spots: [-44, -40, -35, -19, -15.5, 3, 5.5].map((x) => spot(v(x, N_Z - 1.3), new THREE.Vector3(0, 0, -1), `N${NX.reduce((b, n) => (Math.abs(n - x) < Math.abs(b - x) ? n : b))}`)),
      stay: [5, 12],
      emotes: ["heart", "?", "dots"],
    },
    {
      role: "Neighbour",
      weight: 2,
      spots: [-17, -13.5, -9, -5].map((x) => spot(v(x, 6.7), new THREE.Vector3(0, 0, -1), x < -10 ? "S-10.8" : "S-2.2")),
      stay: [10, 24],
      emotes: ["note", "dots", "!"],
      holds: ["phone", "coffee"],
    },
    {
      role: "Gardener",
      weight: 2,
      spots: [-45.2, -41.6, -38, -34.4].flatMap((x) => [nz(-26.3), nz(-29.9)].map((z) => spot(v(x, z), new THREE.Vector3(-1, 0, 0), "O2", [v(x, nz(-24.5))]))),
      stay: [12, 30],
      emotes: ["star", "note", "heart"],
      holds: ["basket"],
      gives: ["basket"],
    },
  ];
}

// ---- doors -------------------------------------------------------------------------------------------

/** Where people come out and go home: shop and house doors on both sides, the side streets. */
const DOORS: { p: THREE.Vector3; via: string }[] = [
  ...[-44, -36, -19, -14, 4, 28, 34, 42].map((x) => ({ p: v(x, nz(-5.9) + 0.05), via: `N${NX.reduce((b, n) => (Math.abs(n - x) < Math.abs(b - x) ? n : b))}` })),
  { p: v(-11, 25.3), via: "QL2" },
  { p: v(11, 25.3), via: "QR2" },
  { p: v(-27.6, 31.6), via: "S-27.6" },
  { p: v(27.6, 31.6), via: "S27.6" },
];

const UMBRELLAS = ["#d0383a", "#2e5ab8", "#f4b728", "#e8e4dc", "#3a9a6a", "#7a5ac0", "#1a1820", "#ff7aa8"];
/**
 * Portraits for the residents: the day's cast, the same for every visitor (seeded by the UTC date),
 * so the people you meet today are the ones everyone else meets too.
 */
const castSeed = (() => {
  let h = 2166136261;
  for (const c of new Date().toISOString().slice(0, 10)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 10000;
})();

/** Activities in the order `activities()` lists them. */
const ACT_KEYS = ["bench", "fountain", "koi", "market", "vending", "window", "bus", "orchard"] as const;
type ActKey = (typeof ACT_KEYS)[number];

/**
 * The day's rhythm (the visitor's clock, like the sky): commuters at the bus stop and the vending
 * machines in the morning, the market at lunch, the garden and the koi in the afternoon, window
 * shopping in the evening, a few night owls on the benches.
 */
function hourly(key: ActKey, h: number): number {
  const morning = h >= 6 && h < 10,
    lunch = h >= 11 && h < 14,
    afternoon = h >= 14 && h < 18,
    evening = h >= 18 && h < 23,
    night = h >= 23 || h < 6;
  switch (key) {
    case "bus":
      return morning ? 4 : evening ? 2 : night ? 0.3 : 1;
    case "vending":
      return morning ? 2.5 : night ? 2 : 1;
    case "market":
      return lunch ? 3 : morning || afternoon ? 1 : night ? 0 : 0.6;
    case "window":
      return evening ? 3 : afternoon ? 1.5 : night ? 0.4 : 0.8;
    case "orchard":
      return afternoon || morning ? 1.6 : night ? 0 : 0.6;
    case "koi":
    case "fountain":
      return afternoon ? 2 : night ? 0.5 : 1;
    case "bench":
      return night ? 2 : 1;
  }
}

/** How busy the street is by the hour (residents out, as a share of the device's budget). */
export function streetLife(h = new Date().getHours()) {
  if (h >= 1 && h < 6) return 0.35;
  if (h >= 23 || h < 1) return 0.6;
  if ((h >= 7 && h < 9) || (h >= 12 && h < 14) || (h >= 18 && h < 21)) return 1;
  return 0.8;
}

interface Resident {
  s: Snark;
  node: number;
  alive: boolean;
  born: number;
  /** Folds or opens its umbrella when the weather changes. */
  umbrella: string | null;
  busy: boolean;
}

export class Residents {
  private list = new Set<Resident>();
  private acts = activities();
  private target = 0;
  private raining = false;
  private seq = 0;
  private spawning = false;

  constructor(private director: Director) {}

  get count() {
    return this.list.size;
  }

  /** How many should be out: the device's budget, plus a few more when the mempool is busy. */
  setTarget(n: number) {
    this.target = Math.max(0, Math.round(n));
    if (this.list.size < this.target && !this.spawning) void this.fill();
  }

  setRain(on: boolean) {
    this.raining = on;
    for (const r of this.list) this.dress(r);
  }

  /** A bus pulls in (or leaves) at `x` on the avenue: heads turn, a few react. */
  busEvent(phase: "arriving" | "boarding" | "departing" | "confirmed", at: THREE.Vector3) {
    for (const r of this.list) {
      const p = r.s.root.position;
      if (!r.alive || p.distanceTo(at) > 34) continue;
      const delay = rand(0, 900);
      setTimeout(() => {
        if (!r.alive) return;
        if (!r.s.isWalking) r.s.faceDir = new THREE.Vector3(at.x - p.x, 0, at.z - p.z).normalize();
        if (phase === "arriving" && Math.random() < 0.45) r.s.emote("!", 1.8);
        if (phase === "departing" && Math.random() < 0.25) r.s.emote(pick(["note", "heart"] as Emote[]), 2);
      }, delay);
    }
  }

  /** Everyone within `radius` of `at` reacts with `e` (some of them). */
  react(e: Emote, at: THREE.Vector3 | null, share = 0.5, radius = 60) {
    for (const r of this.list) {
      if (!r.alive || Math.random() > share) continue;
      if (at && r.s.root.position.distanceTo(at) > radius) continue;
      setTimeout(() => r.alive && r.s.emote(e, 2.4), rand(0, 1400));
    }
  }

  private async fill() {
    this.spawning = true;
    try {
      while (this.list.size < this.target) {
        const door = pick(DOORS);
        const id = ((castSeed + this.seq++ * 397) % 10000) + 1;
        let s: Snark;
        try {
          s = await this.director.newSnark(id);
        } catch {
          await sleep(1500);
          continue;
        }
        if (this.list.size >= this.target) break;
        s.role = "Neighbour";
        s.root.position.copy(door.p);
        this.director.adopt(s);
        const r: Resident = { s, node: named.get(door.via)!, alive: true, born: performance.now(), umbrella: null, busy: false };
        this.list.add(r);
        this.dress(r);
        void this.life(r, door);
        // they don't all come out at once
        await sleep(this.list.size < 6 ? 250 : rand(1200, 3500));
      }
    } finally {
      this.spawning = false;
    }
  }

  private dress(r: Resident) {
    const want = this.raining && r.s.id % 7 !== 0 ? UMBRELLAS[r.s.id % UMBRELLAS.length] : null;
    if (want === r.umbrella) return;
    r.umbrella = want;
    r.s.setUmbrella(want);
  }

  private hold(r: Resident, item: LifeItem | null) {
    r.s.carry = item;
    r.s.redrawHold();
    r.s.showParcels(!!item);
  }

  /** Walk the graph from where they are to `to`, crossing the avenue at the zebra when the path does. */
  private async goTo(r: Resident, to: number, speed: number) {
    const path = route(r.node, to);
    const zs = named.get("ZS")!,
      zn = named.get("ZN")!;
    let batch: THREE.Vector3[] = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      if ((a === zs && b === zn) || (a === zn && b === zs)) {
        if (batch.length) await r.s.walk(batch, speed);
        batch = [];
        if (!r.alive) return;
        await this.director.waitToCross(DISTRICTS[0].crossX);
        const [z0, z1] = a === zs ? [CITY.road.z1 - 0.1, CITY.road.z0 + 0.1] : [CITY.road.z0 + 0.1, CITY.road.z1 - 0.1];
        await r.s.walk([v(CROSS, z0, 0.01), v(CROSS, z1, 0.01), nodes[b].p], 1.7);
        if (!r.alive) return;
      } else batch.push(nodes[b].p);
    }
    if (batch.length) await r.s.walk(batch, speed);
    r.node = to;
  }

  private async life(r: Resident, door: { p: THREE.Vector3; via: string }) {
    const s = r.s;
    const speed = rand(1.0, 1.45);
    // out of the door onto the pavement
    await s.walk([nodes[r.node].p], speed);
    let errands = 0;
    while (r.alive) {
      // the street is fuller than it should be: the ones out longest head home first
      const over = this.list.size > this.target;
      const oldest = [...this.list].filter((x) => x.alive).sort((a, b) => a.born - b.born)[0] === r;
      if ((over && oldest) || errands > 7) break;
      const act = this.choose();
      const sp = act && this.freeSpot(act);
      if (!act || !sp) {
        await this.goTo(r, Math.floor(Math.random() * nodes.length), speed);
        await sleep(rand(800, 2500));
        errands++;
        continue;
      }
      sp.taken = s;
      s.role = act.role;
      await this.goTo(r, sp.via, speed);
      if (!r.alive) break;
      s.noClip = true; // benches and stalls: the last steps go right up to them
      await s.walk([...sp.approach, sp.p], 0.9);
      s.noClip = false;
      if (!r.alive) break;
      s.faceDir = sp.face.clone();
      if (sp.seat) s.perch(sp.seat - sp.p.y);
      const held = act.holds && Math.random() < 0.55 ? pick(act.holds) : null;
      if (held) this.hold(r, held);
      const until = performance.now() + rand(act.stay[0], act.stay[1]) * 1000;
      let nextEmote = performance.now() + rand(2000, 6000);
      while (r.alive && performance.now() < until) {
        await sleep(400);
        if (performance.now() > nextEmote) {
          if (Math.random() < 0.6) s.emote(pick(act.emotes));
          nextEmote = performance.now() + rand(7000, 14000);
        }
      }
      if (sp.seat) s.perch(0);
      s.faceDir = null;
      sp.taken = null;
      this.hold(r, act.gives && Math.random() < 0.7 ? pick(act.gives) : null);
      if (!r.alive) break;
      s.noClip = true;
      await s.walk([...sp.approach.slice().reverse(), nodes[sp.via].p], speed);
      s.noClip = false;
      errands++;
    }
    // home: the nearest door
    if (r.alive) {
      let best = DOORS[0];
      for (const d of DOORS) if (nodes[named.get(d.via)!].p.distanceTo(s.root.position) < nodes[named.get(best.via)!].p.distanceTo(s.root.position)) best = d;
      if (Math.random() < 0.35) best = door;
      await this.goTo(r, named.get(best.via)!, speed);
      await s.walk([best.p], speed);
    }
    r.alive = false;
    this.list.delete(r);
    this.director.release(s);
    if (this.list.size < this.target && !this.spawning) {
      await sleep(rand(1500, 5000));
      void this.fill();
    }
  }

  private choose() {
    const h = new Date().getHours();
    const w = this.acts.map((a, i) => a.weight * hourly(ACT_KEYS[i] ?? "bench", h));
    const total = w.reduce((a, x) => a + x, 0);
    let k = Math.random() * total;
    for (let i = 0; i < this.acts.length; i++) if ((k -= w[i]) <= 0) return this.acts[i];
    return this.acts[0];
  }

  private freeSpot(a: Activity) {
    const free = a.spots.filter((x) => !x.taken);
    return free.length ? pick(free) : null;
  }

  /** Where everyone is, for debugging (?debug: street.residents.debug()). */
  debug() {
    return [...this.list].map((r) => ({ id: r.s.id, role: r.s.role, perched: r.s.isPerched, x: r.s.root.position.x, z: r.s.root.position.z }));
  }

  debugText() {
    return [...this.list].map((r) => `${r.s.id}:${r.s.role}@${r.s.root.position.x.toFixed(0)},${r.s.root.position.z.toFixed(0)}`).join(" ");
  }
}
