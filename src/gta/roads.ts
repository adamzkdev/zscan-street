import { BAY, CITY, CORE, CURB, GRID, RIVER, ST, streetSegments, zoneAt } from "../scene/city/plan";

/**
 * The city's roads for the game (src/gta): where the asphalt is (a car rides at y = 0 there and on
 * the kerb's height elsewhere), what each street is called and which district you are in, for the
 * HUD's location card. Streets are named after the protocol's own words, west to east and north to
 * south, as a city planner would.
 */

/** The north–south streets (by x) and the east–west ones (by z). */
const NS: [number, string][] = [
  [-226, "Ring Road West"],
  [-194, "Sprout Avenue"],
  [-158, "Sapling Avenue"],
  [-122, "Equihash Boulevard"],
  [-86, "Shōtengai"],
  [-54, "Groth16 Street"],
  [-24, "Nullifier Lane"],
  [24, "Memo Lane"],
  [54, "Halo2 Street"],
  [86, "Orchard Avenue"],
  [122, "Ironwood Boulevard"],
  [158, "BLAKE2 Avenue"],
  [194, "Jubjub Avenue"],
  [226, "Ring Road East"],
];
const AVENUE_Z = (CITY.road.z0 + CITY.road.z1) / 2;
const EW: [number, string][] = [
  [ST.ringN, "Ring Road North"],
  [-192, "Canopy Street"],
  [ST.blvdN, "Blossom Boulevard"],
  [ST.parkN, "Park Row"],
  [ST.north, "Viewing Key Street"],
  [AVENUE_Z, "Mempool Avenue"],
  [ST.south, "Coinbase Street"],
  [ST.bank, "Turnstile Street"],
  [ST.ringS, "Bay Road"],
];

const DISTRICT: Record<string, string> = {
  midtown: "Midtown",
  parkside: "Parkside",
  uptown: "Uptown",
  west: "West End",
  westres: "Westside",
  finance: "Wall Street",
  eastcom: "East Market",
  south: "Southside",
  southbank: "South Bank",
  marina: "Marina Bay",
  port: "The Port",
};

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** The street's name, and its axis: "x" runs east–west. */
  name: string;
  axis: "x" | "z";
  at: number;
}

const RES = 0.5;
const W = Math.ceil((CITY.maxX - CITY.minX) / RES);
const H = Math.ceil((CITY.maxZ - CITY.minZ) / RES);

export class Roads {
  readonly rects: Rect[] = [];
  /** 1 where there is asphalt, every half metre. */
  private grid = new Uint8Array(W * H);

  constructor() {
    const nameNS = (x: number) => NS.find(([at]) => Math.abs(at - x) < 0.5)?.[1] ?? "Side Street";
    const nameEW = (z: number) => EW.find(([at]) => Math.abs(at - z) < 0.5)?.[1] ?? "Side Street";
    for (const s of streetSegments()) {
      const h = s.width / 2;
      if (s.axis === "x") this.rects.push({ x0: s.from, x1: s.to, z0: s.at - h, z1: s.at + h, name: nameEW(s.at), axis: "x", at: s.at });
      else this.rects.push({ x0: s.at - h, x1: s.at + h, z0: s.from, z1: s.to, name: nameNS(s.at), axis: "z", at: s.at });
    }
    // the avenue, end to end, and the heart's two side streets
    this.rects.push({ x0: CITY.minX, x1: CITY.maxX, z0: CITY.road.z0, z1: CITY.road.z1, name: "Mempool Avenue", axis: "x", at: AVENUE_Z });
    for (const x of [-24, 24]) this.rects.push({ x0: x - 4, x1: x + 4, z0: CORE.minZ, z1: CORE.maxZ, name: nameNS(x), axis: "z", at: x });
    for (const r of this.rects) {
      const i0 = Math.max(0, Math.floor((r.x0 - CITY.minX) / RES)),
        i1 = Math.min(W - 1, Math.ceil((r.x1 - CITY.minX) / RES));
      const j0 = Math.max(0, Math.floor((r.z0 - CITY.minZ) / RES)),
        j1 = Math.min(H - 1, Math.ceil((r.z1 - CITY.minZ) / RES));
      for (let j = j0; j < j1; j++) this.grid.fill(1, j * W + i0, j * W + i1);
    }
  }

  /** On the asphalt? */
  road(x: number, z: number) {
    const i = Math.floor((x - CITY.minX) / RES),
      j = Math.floor((z - CITY.minZ) / RES);
    if (i < 0 || j < 0 || i >= W || j >= H) return false;
    return this.grid[j * W + i] === 1;
  }

  /** The surface's height for a wheel: the road, or the kerb's height everywhere else. */
  surface(x: number, z: number) {
    return this.road(x, z) ? 0 : CURB;
  }

  /** The street you are on (or the nearest one in a few metres), and the next cross street ahead. */
  where(x: number, z: number, dirX = 0, dirZ = -1): { street: string; next: string | null; district: string } {
    let best: Rect | null = null,
      bd = 7;
    for (const r of this.rects) {
      const dx = Math.max(r.x0 - x, 0, x - r.x1),
        dz = Math.max(r.z0 - z, 0, z - r.z1);
      const d = Math.hypot(dx, dz);
      // (at a junction, the street you are driving along wins)
      const along = r.axis === "x" ? Math.abs(dirX) : Math.abs(dirZ);
      const score = d - along * 0.5;
      if (score < bd) (bd = score), (best = r);
    }
    let next: string | null = null;
    if (best) {
      // the next cross street the way you face
      const sign = best.axis === "x" ? Math.sign(dirX) || 1 : Math.sign(dirZ) || 1;
      const pos = best.axis === "x" ? x : z;
      let nd = Infinity;
      const list = best.axis === "x" ? NS : EW;
      for (const [at, name] of list) {
        const ahead = (at - pos) * sign;
        if (ahead > 6 && ahead < nd && this.crosses(best, at)) (nd = ahead), (next = name);
      }
    }
    return { street: best?.name ?? this.landmark(x, z), next, district: this.district(x, z) };
  }

  /** Does a cross street at `at` meet this street (somewhere near it)? */
  private crosses(r: Rect, at: number) {
    return this.rects.some((o) => o.axis !== r.axis && Math.abs(o.at - at) < 0.5 && (r.axis === "x" ? o.z0 <= r.z1 + 2 && o.z1 >= r.z0 - 2 : o.x0 <= r.x1 + 2 && o.x1 >= r.x0 - 2));
  }

  /** Off the streets: what the place is. */
  private landmark(x: number, z: number) {
    const P = GRID.park;
    if (x > P.x0 && x < P.x1 && z > P.z0 && z < P.z1) return "Central Park";
    if (z > RIVER.z0 && z < RIVER.z1) return "The River";
    if (z > BAY.z0) return "The Bay";
    return "Pavement";
  }

  district(x: number, z: number) {
    if (x > CORE.minX && x < CORE.maxX && z > CORE.minZ && z < CORE.maxZ) return "The Heart";
    const P = GRID.park;
    if (x > P.x0 && x < P.x1 && z > P.z0 && z < P.z1) return "Central Park";
    if (Math.hypot(x - ST.heartW, z - ST.blvdN) < 40) return "Shibuya";
    if (z > BAY.z0) return "The Bay";
    return DISTRICT[zoneAt(x, z)] ?? "ZStreet";
  }

  /** The nearest point on a road to (x, z) (to put a car back on it), with the road's axis. */
  nearest(x: number, z: number): { x: number; z: number; axis: "x" | "z" } {
    let best = { x, z, axis: "x" as "x" | "z" },
      bd = Infinity;
    for (const r of this.rects) {
      // the middle of the road, on the right-hand lane
      const px = r.axis === "x" ? Math.min(r.x1 - 3, Math.max(r.x0 + 3, x)) : r.at + 1.9;
      const pz = r.axis === "x" ? r.at + 1.9 : Math.min(r.z1 - 3, Math.max(r.z0 + 3, z));
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) (bd = d), (best = { x: px, z: pz, axis: r.axis });
    }
    return best;
  }

  /** The junctions (where an east–west street meets a north–south one) and the streets between them. */
  private nodes: { x: number; z: number; to: number[] }[] | null = null;

  private graph() {
    if (this.nodes) return this.nodes;
    const nodes: { x: number; z: number; to: number[] }[] = [];
    const key = new Map<string, number>();
    const at = (x: number, z: number) => {
      const k = `${x.toFixed(1)},${z.toFixed(1)}`;
      let i = key.get(k);
      if (i === undefined) key.set(k, (i = nodes.push({ x, z, to: [] }) - 1));
      return i;
    };
    const xs = this.rects.filter((r) => r.axis === "x"),
      zs = this.rects.filter((r) => r.axis === "z");
    const onRect = new Map<Rect, number[]>();
    for (const a of xs)
      for (const b of zs) {
        // the two overlap: a junction at the crossing of their centre lines
        if (b.at < a.x0 - 1 || b.at > a.x1 + 1 || a.at < b.z0 - 1 || a.at > b.z1 + 1) continue;
        const i = at(b.at, a.at);
        for (const r of [a, b]) {
          const l = onRect.get(r) ?? [];
          if (!l.includes(i)) l.push(i);
          onRect.set(r, l);
        }
      }
    // along each street, each junction to the next
    for (const [r, list] of onRect) {
      list.sort((i, j) => (r.axis === "x" ? nodes[i].x - nodes[j].x : nodes[i].z - nodes[j].z));
      for (let k = 1; k < list.length; k++) {
        const a = list[k - 1],
          b = list[k];
        if (!nodes[a].to.includes(b)) nodes[a].to.push(b);
        if (!nodes[b].to.includes(a)) nodes[b].to.push(a);
      }
    }
    return (this.nodes = nodes);
  }

  /**
   * A way by the streets from A to B: the junctions to pass, then B. A* over the junctions, from A
   * through any of its three nearest junctions and on to B through any of B's (so a car between two
   * junctions does not hesitate between them).
   */
  route(ax: number, az: number, bx: number, bz: number): { x: number; z: number }[] {
    const nodes = this.graph();
    if (!nodes.length) return [{ x: bx, z: bz }];
    const nearest = (x: number, z: number) =>
      nodes
        .map((n, i) => ({ i, d: Math.hypot(n.x - x, n.z - z) }))
        .sort((p, q) => p.d - q.d)
        .slice(0, 3);
    const S = -1,
      T = -2;
    const starts = nearest(ax, az),
      ends = new Map(nearest(bx, bz).map((e) => [e.i, e.d]));
    const g = new Map<number, number>();
    const from = new Map<number, number>();
    const open = new Set<number>();
    for (const e of starts) {
      g.set(e.i, e.d);
      from.set(e.i, S);
      open.add(e.i);
    }
    const h = (i: number) => Math.hypot(nodes[i].x - bx, nodes[i].z - bz);
    let best = -1,
      bestCost = Infinity;
    while (open.size) {
      let cur = -1,
        cf = Infinity;
      for (const i of open) {
        const f = g.get(i)! + h(i);
        if (f < cf) (cf = f), (cur = i);
      }
      if (cf >= bestCost) break;
      open.delete(cur);
      const end = ends.get(cur);
      if (end !== undefined && g.get(cur)! + end < bestCost) (bestCost = g.get(cur)! + end), (best = cur);
      for (const n of nodes[cur].to) {
        const ng = g.get(cur)! + Math.hypot(nodes[n].x - nodes[cur].x, nodes[n].z - nodes[cur].z);
        if (ng < (g.get(n) ?? Infinity)) {
          g.set(n, ng);
          from.set(n, cur);
          open.add(n);
        }
      }
    }
    const path: { x: number; z: number }[] = [{ x: bx, z: bz }];
    for (let i = best; i >= 0; i = from.get(i) ?? S) path.unshift({ x: nodes[i].x, z: nodes[i].z });
    void T;
    return path;
  }

  /** Points along the streets, every `step` metres, away from the junctions (for the challenges). */
  midpoints(step = 30): { x: number; z: number; axis: "x" | "z"; name: string }[] {
    const out: { x: number; z: number; axis: "x" | "z"; name: string }[] = [];
    for (const r of this.rects) {
      const len = r.axis === "x" ? r.x1 - r.x0 : r.z1 - r.z0;
      if (len < 24) continue;
      for (let s = 10; s < len - 10; s += step) {
        const x = r.axis === "x" ? r.x0 + s : r.at;
        const z = r.axis === "x" ? r.at : r.z0 + s;
        // not in a junction
        if (this.rects.some((o) => o.axis !== r.axis && x > o.x0 - 3 && x < o.x1 + 3 && z > o.z0 - 3 && z < o.z1 + 3)) continue;
        out.push({ x, z, axis: r.axis, name: r.name });
      }
    }
    return out;
  }
}
