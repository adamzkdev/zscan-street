import { BAY, CURB } from "../city/plan";

/**
 * Shielded Woods: the headland across the Golden Gate as a redwood forest (Muir Woods on the Marin
 * Headlands). The ground is a heightfield sampled every half metre: golden bluffs falling to the
 * bay, a ridge along the back, Sprout Creek coming down Sprout Falls through a gorge to the water,
 * the trails, their boardwalks, the clearings carved flat. Everything else (trees, props, life,
 * walking) reads its heights from here.
 */

export const WATER = BAY.water;
export const BX = BAY.bridge.x;
/** The forest's extent (world metres). */
export const F = { x0: 94, x1: 236, z0: 178, z1: 236 };

// ---- noise --------------------------------------------------------------------------------------
const hash2 = (x: number, z: number, s = 0) => {
  const h = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
};
export function vnoise(x: number, z: number, s = 0) {
  const xi = Math.floor(x),
    zi = Math.floor(z);
  const fx = x - xi,
    fz = z - zi;
  const u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi, s),
    b = hash2(xi + 1, zi, s),
    c = hash2(xi, zi + 1, s),
    d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x: number, z: number, s = 0) => (vnoise(x, z, s) * 0.55 + vnoise(x * 2.1, z * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, z * 4.3, s + 13) * 0.15);
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const rnd = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

// ---- the plan -------------------------------------------------------------------------------------
type P2 = [number, number];
/** The shore line: z of the water's edge along x (the land is south of it). */
const SHORE: P2[] = [
  [92, 240],
  [98, 229],
  [106, 216],
  [118, 207],
  [132, 202],
  [144, 204],
  [150, 211],
  [156, 214],
  [166, 213],
  [172, 203],
  [178, 194],
  [188, 188],
  [200, 187],
  [212, 184],
  [224, 186],
  [238, 188],
];
export function shoreZ(x: number) {
  let z = SHORE[SHORE.length - 1][1];
  for (let i = 1; i < SHORE.length; i++)
    if (x <= SHORE[i][0]) {
      const [x0, z0] = SHORE[i - 1],
        [x1, z1] = SHORE[i];
      z = z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
      break;
    }
  // the bridge's landing keeps a clean edge, the rest of the coast wanders
  const calm = Math.abs(x - BX) < 10 ? 0.2 : 1;
  return z + (vnoise(x * 0.18, 3) - 0.5) * 4 * calm;
}

/** Sprout Creek: from the spring on the ridge over the falls, down the gorge to the bay (x, z, bed). */
export const CREEK: [number, number, number][] = [
  [217.4, 231.2, 13.6],
  [216, 228.4, 13.2],
  [214, 225.6, 12.8],
  [213.6, 224.6, 12.6],
  [213.2, 223.2, 6.6],
  [212.4, 221.6, 6.2],
  [210.6, 218.4, 5.8],
  [208.4, 214.6, 5.0],
  [206.8, 210.6, 4.2],
  [206.6, 206.2, 3.2],
  [205.2, 201.4, 2.0],
  [203.4, 196.4, 0.6],
  [202.4, 191.4, -0.9],
  [201.8, 185, -2.4],
];
/** Where the water drops: the brink and the plunge pool. */
export const FALLS = { top: [213.6, 224.6, 12.6 + 0.3] as const, foot: [213.2, 223.2, 6.6 + 0.3] as const, pool: [212.4, 221.8] as const };

export const SITES = {
  /** The trailhead plaza by the bridge's landing, east of the road. */
  plaza: { x: 168, z: 225 },
  /** Viewing Key Point: the lookout deck on the bluff, facing the city and the bridge. */
  lookout: { x: 183.5, z: 197.5 },
  /** The campfire clearing. */
  camp: { x: 197, z: 214 },
  /** The ranger cabin's pad. */
  cabin: { x: 224, z: 207 },
  /** The overlook at the plunge pool. */
  fallsDeck: { x: 208.6, z: 220.2 },
  /** The Genesis Tree, the oldest giant, in its grove west of the road. */
  genesis: { x: 124, z: 223 },
  /** The beach of round stones at the creek's mouth. */
  cove: { x: 203, z: 189 },
};

/** The trails (polylines): the east loop, its spurs, the west trail to the Genesis Tree. */
export const TRAILS: P2[][] = [
  // trailhead to Viewing Key Point
  [
    [166, 226],
    [170, 221],
    [174.5, 215.5],
    [178, 209],
    [181, 203],
    [183.5, 199.5],
  ],
  // up to the campfire
  [
    [178, 209],
    [184, 210],
    [190, 212.5],
    [197, 214],
  ],
  // across the gorge to the falls and the cabin
  [
    [197, 214],
    [202, 212],
    [211.5, 209.5],
    [214.5, 213],
    [211.5, 216.5],
    [208.6, 219.4],
  ],
  [
    [211.5, 209.5],
    [218, 208.5],
    [224, 207],
  ],
  // the cabin down to the shore, back across the creek and up the bluff to Viewing Key Point
  [
    [224, 207],
    [229, 200],
    [227, 193],
    [219, 190.5],
    [211, 193],
    [200.5, 197.5],
    [193, 199],
    [187.5, 199],
    [183.5, 199.5],
  ],
  // the cove spur
  [
    [211, 193],
    [205, 190],
  ],
  // west: under the bridge's landing to the Genesis grove and on to the point
  [
    [151, 226],
    [145, 224],
    [137, 221],
    [130, 222],
    [124, 220],
    [118, 223],
    [111, 226],
    [105, 229],
  ],
  // back of the plaza, round the tunnel hill
  [
    [166, 226],
    [168, 231],
    [174, 233.5],
  ],
];

/** Raised boardwalks: across the gorge (twice), along the falls pool, into the Genesis grove. */
export const BOARDWALKS: P2[][] = [
  [
    [201.5, 212.1],
    [211.2, 209.6],
  ],
  [
    [210.8, 192.2],
    [201.6, 197],
  ],
  [
    [213.8, 214.2],
    [211.5, 216.5],
    [209.4, 218.6],
  ],
  [
    [128, 221.7],
    [124, 220],
    [120, 221.6],
  ],
];

// ---- geometry helpers -------------------------------------------------------------------------------
/** Distance from (x, z) to segment a–b, and the position along it (0..1). */
export function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax,
    dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return { d: Math.hypot(x - ax - dx * t, z - az - dz * t), t };
}
export function lineDist(x: number, z: number, pts: P2[]) {
  let best = Infinity,
    seg = 0,
    tt = 0;
  for (let i = 1; i < pts.length; i++) {
    const r = segDist(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (r.d < best) {
      best = r.d;
      seg = i - 1;
      tt = r.t;
    }
  }
  return { d: best, seg, t: tt };
}
export function creekAt(x: number, z: number) {
  let best = Infinity,
    bed = 0,
    along = 0;
  for (let i = 1; i < CREEK.length; i++) {
    const a = CREEK[i - 1],
      b = CREEK[i];
    const r = segDist(x, z, a[0], a[1], b[0], b[1]);
    if (r.d < best) {
      best = r.d;
      bed = a[2] + (b[2] - a[2]) * r.t;
      along = i - 1 + r.t;
    }
  }
  return { d: best, bed, along };
}
/** How much the ground is open golden grass (the bluffs over the bay) rather than forest, 0..1. */
export function goldAt(x: number, z: number) {
  const d = z - shoreZ(x);
  const bluff = Math.exp(-((x - 186) ** 2) / 260) * smooth(14, 6, d);
  return Math.max(smooth(7, 2.5, d), bluff) * (Math.abs(x - BX) < 14 ? 0.4 : 1);
}
export const trailDist = (x: number, z: number) => Math.min(...TRAILS.map((t) => lineDist(x, z, t).d));

// ---- the heightfield ------------------------------------------------------------------------------
export const RES = 0.5;
export const NX = Math.round((F.x1 - F.x0) / RES) + 1;
export const NZ = Math.round((F.z1 - F.z0) / RES) + 1;

/** The ground before the trails and sites are cut into it. */
function raw(x: number, z: number) {
  const d = z - shoreZ(x);
  const inland = 3 + 4.2 * fbm(x * 0.045, z * 0.05, 3);
  let ridge = 0;
  if (x > 160) ridge = Math.max(0, z - 200) * 0.3 * smooth(160, 176, x);
  if (x < 156) ridge = Math.max(ridge, Math.max(0, z - 210) * 0.32 * smooth(156, 146, x));
  const knoll = 6.5 * Math.exp(-((x - 183.5) ** 2 + (z - 199) ** 2) / 44);
  const bluff = 5 * Math.exp(-((x - 216) ** 2 + (z - 232) ** 2) / 70);
  const west = 3 * Math.exp(-((x - 108) ** 2 + (z - 228) ** 2) / 90);
  const hin = inland + ridge + knoll + bluff + west;
  const c = smooth(-1.5, 6.5, d);
  return WATER - 1.6 + c * (hin - WATER + 1.6);
}

export class Land {
  readonly h = new Float32Array(NX * NZ);
  /** Boardwalk decks: polyline, top height per point. */
  readonly walks: { pts: P2[]; y: number[]; half: number }[] = [];
  /** Wooden decks (lookout, falls overlook, cabin porch): rectangles with a floor height. */
  readonly decks: { x0: number; x1: number; z0: number; z1: number; y: number }[] = [];
  /** The road's level off the bridge (cars disappear into the tunnel just behind). */
  readonly roadY: number;

  constructor(deckAt: (z: number) => number) {
    const roadEnd = 226;
    this.roadY = CURB + 0.02;
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const x = F.x0 + i * RES,
          z = F.z0 + j * RES;
        let h = raw(x, z);
        // the creek's channel
        const c = creekAt(x, z);
        // narrow at the spring, a gorge further down
        const cw = Math.min(1, 0.3 + c.along * 0.5);
        if (c.d < 4.2 * cw && h > c.bed) h = c.bed + (h - c.bed) * smooth(0.9 * cw, 4.2 * cw, c.d) ** 1.2;
        // the trailhead plaza, flat, just above the bay
        const pz = Math.hypot((x - SITES.plaza.x) / 7, (z - SITES.plaza.z) / 4.6);
        if (pz < 1.6) h = this.roadY - 0.05 + (h - this.roadY + 0.05) * smooth(1, 1.6, pz);
        // the road off the bridge into the tunnel, and the hill over the tunnel
        const ax = Math.abs(x - BX);
        if (z > 229) h = Math.max(h, (9.2 + (z - 229) * 0.35) * smooth(15, 8.5, ax) + h * (1 - smooth(15, 8.5, ax)));
        if (ax < 7.5 && z > 211 && z <= 229.2) h = z < roadEnd ? Math.min(h, deckAt(z) - 0.6) : this.roadY - 0.05;
        // the clearings, flattened to their centre
        for (const [s, r0, r1] of [
          [SITES.camp, 4.5, 7.5],
          [SITES.cabin, 5, 8],
          [SITES.genesis, 3, 6],
          [SITES.lookout, 2.4, 4.5],
        ] as const) {
          const r = Math.hypot(x - s.x, z - s.z);
          if (r < r1) {
            const hc = raw(s.x, s.z);
            h = hc + (h - hc) * smooth(r0, r1, r);
          }
        }
        this.h[i + j * NX] = h;
      }
    // trails: soften the ground under them (no steps up a cliff), never below the creek
    const soft = new Float32Array(this.h);
    for (let j = 2; j < NZ - 2; j++)
      for (let i = 2; i < NX - 2; i++) {
        const x = F.x0 + i * RES,
          z = F.z0 + j * RES;
        const td = trailDist(x, z);
        if (td > 2.2) continue;
        let s = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) s += this.h[i + di + (j + dj) * NX];
        const k = 1 - smooth(1, 2.2, td);
        soft[i + j * NX] = this.h[i + j * NX] * (1 - k) + (s / 25) * k;
      }
    this.h.set(soft);

    // boardwalks: level with the ground at their ends, never lower than 0.35 m over it on the way
    for (const pts of BOARDWALKS) {
      const ends = [this.raw(pts[0][0], pts[0][1]), this.raw(pts[pts.length - 1][0], pts[pts.length - 1][1])];
      const y = pts.map((p, k) => {
        const t = k / (pts.length - 1);
        return Math.max(ends[0] + (ends[1] - ends[0]) * t, this.raw(p[0], p[1])) + 0.32;
      });
      this.walks.push({ pts, y, half: 0.95 });
    }
    // Viewing Key Point: the deck out over the bluff; the falls overlook; the cabin porch
    const L = SITES.lookout;
    this.decks.push({ x0: L.x - 3.2, x1: L.x + 3.2, z0: L.z - 4.4, z1: L.z + 1.6, y: this.raw(L.x, L.z) + 0.45 });
    const D = SITES.fallsDeck;
    this.decks.push({ x0: D.x - 1.6, x1: D.x + 1.6, z0: D.z - 0.6, z1: D.z + 2.4, y: this.raw(D.x, D.z - 0.6) + 0.35 });
  }

  /** The bare ground height (bilinear), without decks. */
  raw(x: number, z: number) {
    const fx = Math.min(NX - 1.001, Math.max(0, (x - F.x0) / RES)),
      fz = Math.min(NZ - 1.001, Math.max(0, (z - F.z0) / RES));
    const i = Math.floor(fx),
      j = Math.floor(fz);
    const u = fx - i,
      v = fz - j;
    const a = this.h[i + j * NX],
      b = this.h[i + 1 + j * NX],
      c = this.h[i + (j + 1) * NX],
      d = this.h[i + 1 + (j + 1) * NX];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  /** Floor height under (x, z): a deck or boardwalk if there is one, else the ground. */
  floor(x: number, z: number) {
    for (const d of this.decks) if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d.y;
    const w = this.walkAt(x, z);
    if (w !== null) return w;
    return this.raw(x, z);
  }

  walkAt(x: number, z: number) {
    for (const w of this.walks) {
      const r = lineDist(x, z, w.pts);
      if (r.d <= w.half) return w.y[r.seg] + (w.y[r.seg + 1] - w.y[r.seg]) * r.t;
    }
    return null;
  }

  inside(x: number, z: number) {
    return x >= F.x0 && x <= F.x1 && z >= F.z0 && z <= F.z1 && z > shoreZ(x) - 3;
  }

  /** Steepness (rise per metre) at (x, z). */
  slope(x: number, z: number) {
    const e = 0.6;
    return Math.max(Math.abs(this.raw(x + e, z) - this.raw(x - e, z)), Math.abs(this.raw(x, z + e) - this.raw(x, z - e))) / (2 * e);
  }
}
