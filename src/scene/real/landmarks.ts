import type { Built } from "../voxel/buildings";
import { VOX } from "../voxel/model";
import type { RGeo, Slot as BSlot } from "./buildings";
import { circle, hex, Kit, rng, roundRect, turn, WHITE, type KitOpts, type Slot, type V2, type V3 } from "./lmkit";

/**
 * The landmarks of Wall Street, the south bank and the heart, realistic (branch gta-real): no
 * voxels. The voxel builder still runs for each one (its lot, its door, its signs, its lights, the
 * named points the city and the game use); the geometry is made here, in metres in the landmark's
 * own frame (x across the lot, z from the back to the front, centred), from the same constants as
 * the voxel version so every point stays where it was. Pure (no DOM): runs in the city's workers.
 *
 * What a landmark plants on its plaza (real trees, lamps, benches) goes back as `extras` (metres in
 * the same frame); the city plants them with the street's own (real/trees.ts, real/props.ts).
 */

export interface Extras {
  /** [x, y, z, species, seed] */
  trees: [number, number, number, string, number][];
  /** [type, x, y, z, rot, arg] (real/props.ts kinds: lamp, bench, bollard, trashBin, planter…) */
  props: [string, number, number, number, number, string?][];
}

export interface LmCtx {
  K: Kit;
  b: Built;
  /** Metres per model voxel. */
  u: number;
  /** The lot in metres (x from −W/2 to W/2, z from −D/2 (back) to D/2 (front)). */
  W: number;
  D: number;
  /** A model-voxel point to metres. */
  V(p: [number, number, number] | number[]): V3;
  /** The x and z of model voxels in metres. */
  X(v: number): number;
  Z(v: number): number;
  /** A named point (metres), if the voxel builder gave it. */
  P(name: string): V3 | null;
  r: () => number;
  ex: Extras;
  far: boolean;
}

type Builder = (c: LmCtx) => void;
const BUILDERS: Record<string, Builder> = {};

/** The landmarks built realistically (the rest keep their voxels for now). */
export const REAL_LANDMARKS = new Set<string>();
/** The heart's building types built realistically ("h:<type>" builders). */
export const REAL_HEART = new Set<string>();
function def(kind: string, f: Builder) {
  BUILDERS[kind] = f;
  if (kind.startsWith("h:")) REAL_HEART.add(kind.slice(2));
  else REAL_LANDMARKS.add(kind);
}

/** A landmark's geometry by slot (metres, its frame) and what it plants. */
export function realLandmark(kind: string, b: Built, o: KitOpts): { geos: Partial<Record<BSlot, RGeo>>; extras: Extras } {
  const m = b.model;
  const k = b.scale ?? 1;
  const u = k * VOX;
  const W = m.w * u,
    D = m.d * u;
  const X = (v: number) => (v - m.w / 2) * u,
    Z = (v: number) => (v - m.d / 2) * u;
  const V = (p: number[]): V3 => [X(p[0]), p[1] * u, Z(p[2])];
  const ex: Extras = { trees: [], props: [] };
  const K = new Kit(o);
  const c: LmCtx = { K, b, u, W, D, V, X, Z, P: (n) => (b.points?.[n] ? V(b.points[n]) : null), r: rng(7 + kind.length * 31), ex, far: o.lod > 0 };
  BUILDERS[kind]?.(c);
  signBacks(c);
  // (the far copy plants nothing: the near one did)
  // (the `lm.` sets are slots too to the city: isSlot, realMat → marksmat.ts)
  return { geos: K.out() as Partial<Record<BSlot, RGeo>>, extras: o.lod > 0 ? { trees: [], props: [] } : ex };
}

/** Every sign of the voxel builder gets a backing box behind it, so none hangs in the air. */
function signBacks(c: LmCtx) {
  for (const s of c.b.signs) {
    if ((s as { noBack?: boolean }).noBack) continue;
    const p = c.V([s.x, s.y, s.z]);
    const w = s.w * c.u,
      h = s.h * c.u;
    const fx = s.facing === "side";
    // (a front sign's plane faces +z; a side one faces ±x — a thin dark box just behind)
    if (fx) c.K.box("metal", p[0] - 0.12, p[1] - h / 2 - 0.08, p[2] - w / 2 - 0.08, p[0] + 0.02, p[1] + h / 2 + 0.08, p[2] + w / 2 + 0.08, hex("#1a1a1e"));
    else if ((s as { back?: boolean }).back) c.K.box("metal", p[0] - w / 2 - 0.08, p[1] - h / 2 - 0.08, p[2] - 0.02, p[0] + w / 2 + 0.08, p[1] + h / 2 + 0.08, p[2] + 0.12, hex("#1a1a1e"));
    else c.K.box("metal", p[0] - w / 2 - 0.08, p[1] - h / 2 - 0.08, p[2] - 0.14, p[0] + w / 2 + 0.08, p[1] + h / 2 + 0.08, p[2] - 0.01, hex("#1a1a1e"));
  }
}

// ---- shared parts ---------------------------------------------------------------------------------

/** The lot's paving (a slab over the whole lot), its kerb edge a shade lighter. */
function plaza(c: LmCtx, col: V3, o: { y?: number; edge?: V3 } = {}) {
  const t = o.y ?? 0.16;
  c.K.box("concrete", -c.W / 2, 0, -c.D / 2, c.W / 2, t, c.D / 2, col, { skip: "-y" });
  if (o.edge) {
    c.K.box("concrete", -c.W / 2, t, c.D / 2 - 0.5, c.W / 2, t + 0.02, c.D / 2, o.edge, { skip: "-y" });
  }
  return t;
}

/** A row of street trees (real ones), along x or z. */
function treeRow(c: LmCtx, x0: number, z0: number, x1: number, z1: number, step: number, species = "plane", y = 0.16) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.floor(L / step));
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0.5;
    c.ex.trees.push([x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, species, Math.floor(c.r() * 100)]);
  }
}
function lampRow(c: LmCtx, x0: number, z0: number, x1: number, z1: number, step: number, rot: number, color = "#ffd9a0", y = 0.16) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.floor(L / step));
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0.5;
    c.ex.props.push(["lamp", x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, rot, color]);
  }
}

/**
 * A canopy over an entrance: a slab out from the wall at z, supported on two posts at its front,
 * lit beneath, an edge in a colour (neon).
 */
function canopy(c: LmCtx, x0: number, x1: number, z: number, depth: number, y: number, edge: V3 | null, body: V3 = hex("#1c1c20")) {
  const K = c.K;
  K.box("metal", x0, y, z, x1, y + 0.45, z + depth, body);
  K.box("neon", x0 + 0.3, y - 0.02, z + 0.3, x1 - 0.3, y, z + depth - 0.3, hex("#fff0d8", 1.4));
  if (edge) {
    K.box("neon", x0, y + 0.1, z + depth - 0.02, x1, y + 0.26, z + depth + 0.04, edge);
    K.box("neon", x0 - 0.04, y + 0.1, z, x0, y + 0.26, z + depth, edge);
    K.box("neon", x1, y + 0.1, z, x1 + 0.04, y + 0.26, z + depth, edge);
  }
  for (const x of [x0 + 0.5, x1 - 0.5]) K.cyl("metal", x, z + depth - 0.5, 0.13, 0.13, 0.16, y, hex("#c8ccd0"), { sides: 12 });
}

/** A glazed entrance set in a wall facing +z: a lit lobby behind glass, a frame, the doors. */
function entrance(c: LmCtx, x0: number, x1: number, z: number, h: number, frame: V3 = hex("#2a2a30"), y = 0.16) {
  const K = c.K;
  // the lobby's light, seen through the glass
  lit(c, "lobby", x0, x1, y, y + h, z - 0.6);
  K.quad("glass", [x0, y, z], [x1, y, z], [x1, y + h, z], [x0, y + h, z], [0, 0, 1], (p) => [p[0], p[1]], [0.99, 0.5, 0.75]);
  const mul = Math.max(2, Math.round((x1 - x0) / 1.6));
  for (let i = 0; i <= mul; i++) {
    const x = x0 + ((x1 - x0) * i) / mul;
    K.box("metal", x - 0.05, y, z, x + 0.05, y + h, z + 0.08, frame);
  }
  K.box("metal", x0 - 0.1, y + h, z, x1 + 0.1, y + h + 0.25, z + 0.12, frame);
  K.box("metal", x0 - 0.1, y + 2.4, z, x1 + 0.1, y + 2.5, z + 0.1, frame);
}

const CELLS = ["cafe", "konbini", "ramen", "boutique", "bar", "lobby", "florist", "market"];
/** A lit interior (the shops' atlas, mats.ts) on a plane facing +z at z: one of its cells, stretched (repeated `rep` times across). */
function lit(c: LmCtx, cell: string, x0: number, x1: number, y0: number, y1: number, z: number, rep = 1) {
  const i = Math.max(0, CELLS.indexOf(cell));
  const cu0 = (i % 4) / 4,
    vb = i < 4 ? 0.5 : 0;
  const n = Math.max(1, rep);
  for (let k = 0; k < n; k++) {
    const a = x0 + ((x1 - x0) * k) / n,
      b2 = x0 + ((x1 - x0) * (k + 1)) / n;
    c.K.quad("shop", [a, y0, z], [b2, y0, z], [b2, y1, z], [a, y1, z], [0, 0, 1], (p) => [cu0 + ((p[0] - a) / (b2 - a)) * 0.25, vb + ((p[1] - y0) / (y1 - y0)) * 0.5], WHITE);
  }
}

/** A cylinder lying along x from x0 to x1 at (y, z): wheels, drums, vaults (`arc` the share of the turn, from the top). */
function hcyl(c: LmCtx, s: Slot, x0: number, x1: number, y: number, z: number, r: number, col: V3, o: { sides?: number; arc?: number; caps?: boolean } = {}) {
  const n = o.sides ?? 16,
    arc = o.arc ?? 1;
  const a0 = Math.PI / 2 - arc * Math.PI,
    da = (arc * Math.PI * 2) / n;
  const P = (a: number, x: number): V3 => [x, y + Math.sin(a) * r, z + Math.cos(a) * r];
  for (let i = 0; i < n; i++) {
    const a = a0 + i * da,
      b2 = a + da;
    const na: V3 = [0, Math.sin(a), Math.cos(a)],
      nb: V3 = [0, Math.sin(b2), Math.cos(b2)];
    c.K.quad(s, P(a, x0), P(b2, x0), P(b2, x1), P(a, x1), [0, Math.sin(a + da / 2), Math.cos(a + da / 2)], (p) => [p[0] * 0.5, (Math.atan2(p[1] - y, p[2] - z) * r) * 0.5], col, [na, nb, nb, na]);
    if (o.caps !== false && arc === 1)
      for (const [x, sx] of [
        [x0, -1],
        [x1, 1],
      ] as const)
        c.K.tri(s, [x, y, z], P(a, x), P(b2, x), [sx, 0, 0], (p) => [p[2] * 0.5, p[1] * 0.5], col);
  }
}

/** A car (smooth body, glasshouse, wheels) facing +z, centred at (x, y, z). */
function car(c: LmCtx, x: number, y: number, z: number, col: V3, o: { len?: number; wid?: number; rot?: number } = {}) {
  const K = c.K;
  const L = o.len ?? 4.4,
    Wd = o.wid ?? 1.8;
  const rot = o.rot ?? 0;
  const ring = (hl: number, hw: number, r: number, dz = 0) => turn(roundRect(0, dz, hw, hl, r, 3), 0, 0, rot).map(([px, pz]) => [x + px, z + pz] as V2);
  K.loft("lm.chrome", [
    { y: y + 0.3, pts: ring(L / 2 - 0.1, Wd / 2 - 0.05, 0.5) },
    { y: y + 0.75, pts: ring(L / 2, Wd / 2, 0.55) },
    { y: y + 0.95, pts: ring(L / 2 - 0.15, Wd / 2 - 0.08, 0.5) },
  ], col, { smooth: true, lid: null });
  K.loft("lm.glass", [
    { y: y + 0.95, pts: ring(L / 2 - 0.15, Wd / 2 - 0.08, 0.5) },
    { y: y + 1.32, pts: ring(L * 0.24, Wd / 2 - 0.22, 0.35, -L * 0.06) },
  ], hex("#20262c"), { smooth: true, lid: "lm.chrome", lidCol: col });
  if (c.far) return;
  for (const sz of [-1, 1])
    for (const sx of [-1, 1]) {
      const [wx, wz] = turn([[sx * (Wd / 2 - 0.12), sz * (L / 2 - 0.85)]], 0, 0, rot)[0];
      const cxw = x + wx,
        czw = z + wz;
      // (a wheel: a short drum across the car; as the car turns only by right angles here, along x or z)
      if (Math.abs(Math.sin(rot)) < 0.5) hcyl(c, "lm.dark", cxw - 0.12, cxw + 0.12, y + 0.34, czw, 0.34, hex("#151517"), { sides: 12 });
      else c.K.cyl("lm.dark", cxw, czw, 0.34, 0.34, y, y + 0.68, hex("#151517"), { sides: 12 });
    }
  K.box("lm.glow", x - Wd / 2 + 0.2, y + 0.6, z + L / 2 - 0.02, x - Wd / 2 + 0.55, y + 0.7, z + L / 2 + 0.03, hex("#fff4d8"));
  K.box("lm.glow", x + Wd / 2 - 0.55, y + 0.6, z + L / 2 - 0.02, x + Wd / 2 - 0.2, y + 0.7, z + L / 2 + 0.03, hex("#fff4d8"));
}

/** Planter boxes with a bush in them (real). */
function planter(c: LmCtx, x: number, z: number, w: number, d: number, col: V3 = hex("#5a5a60"), y = 0.16) {
  c.K.box("concrete", x - w / 2, y, z - d / 2, x + w / 2, y + 0.6, z + d / 2, col, { skip: "-y" });
  c.K.box("roof", x - w / 2 + 0.12, y + 0.6, z - d / 2 + 0.12, x + w / 2 - 0.12, y + 0.62, z + d / 2 - 0.12, hex("#3a2a1e"));
  for (let i = 0; i < Math.max(1, Math.round(w / 1.6)); i++) c.ex.trees.push([x - w / 2 + 0.8 + i * 1.6, y + 0.6, z, "bush", Math.floor(c.r() * 50)]);
}

/**
 * A crescent standing on its edge in the x–y plane, facing ±z: the band inside the circle of radius
 * R round (cx, cy) and outside the circle of radius ri shifted right by `shift`; t thick.
 */
function crescent(c: LmCtx, cx: number, cy: number, cz: number, R: number, ri: number, shift: number, t: number, col: V3) {
  const K = c.K;
  const xi = (R * R - ri * ri + shift * shift) / (2 * shift);
  const yi = Math.sqrt(Math.max(0, R * R - xi * xi));
  const al = Math.atan2(yi, xi),
    be = Math.atan2(yi, xi - shift);
  const N = c.far ? 16 : 36;
  const O: V2[] = [],
    I: V2[] = [];
  for (let i = 0; i <= N; i++) {
    const tt = i / N;
    const ao = al + tt * (Math.PI * 2 - 2 * al),
      ai = be + tt * (Math.PI * 2 - 2 * be);
    O.push([cx + Math.cos(ao) * R, cy + Math.sin(ao) * R]);
    I.push([cx + shift + Math.cos(ai) * ri, cy + Math.sin(ai) * ri]);
  }
  const uv = (p: V3): [number, number] => [p[0] * 0.25, p[1] * 0.25];
  for (let i = 0; i < N; i++) {
    for (const sz of [1, -1]) {
      const z = cz + (sz * t) / 2;
      K.quad("metal", [O[i][0], O[i][1], z], [O[i + 1][0], O[i + 1][1], z], [I[i + 1][0], I[i + 1][1], z], [I[i][0], I[i][1], z], [0, 0, sz], uv, col);
    }
    const ao = Math.atan2(O[i][1] - cy, O[i][0] - cx),
      ai = Math.atan2(I[i][1] - cy, I[i][0] - cx - shift);
    K.quad("metal", [O[i][0], O[i][1], cz - t / 2], [O[i + 1][0], O[i + 1][1], cz - t / 2], [O[i + 1][0], O[i + 1][1], cz + t / 2], [O[i][0], O[i][1], cz + t / 2], [Math.cos(ao), Math.sin(ao), 0], uv, col);
    K.quad("metal", [I[i][0], I[i][1], cz - t / 2], [I[i + 1][0], I[i + 1][1], cz - t / 2], [I[i + 1][0], I[i + 1][1], cz + t / 2], [I[i][0], I[i][1], cz + t / 2], [-Math.cos(ai), -Math.sin(ai), 0], uv, col);
  }
}

// ---- the brand towers: Noir, ZODL, ZLab (slabs of 44 × 44 voxels at scale 2, 340 up) -----------------

/** A square glass slab of half size hw (metres) at (cx, cz) to height top, its curtain wall `s`, edges and bands. */
function slabTower(c: LmCtx, cx: number, cz: number, hw: number, top: number, s: Slot, o: { edge: V3; band?: V3; bandEvery?: number; bandCol?: V3; setbacks?: [number, number][]; chamfer?: number; tint?: V3 }) {
  const K = c.K;
  const tiers = o.setbacks ?? [[top, hw]];
  let y = 0.16;
  for (const [yt, h] of tiers) {
    const ch = o.chamfer ?? 0;
    if (ch > 0) {
      const pts: V2[] = [
        [cx + h, cz + h - ch],
        [cx + h - ch, cz + h],
        [cx - h + ch, cz + h],
        [cx - h, cz + h - ch],
        [cx - h, cz - h + ch],
        [cx - h + ch, cz - h],
        [cx + h - ch, cz - h],
        [cx + h, cz - h + ch],
      ].reverse() as V2[];
      K.prism(s, pts, y, yt, o.tint ?? WHITE, { fh: 3.6, lid: "roof", lidCol: hex("#3a3a40") });
      // the chamfered corners in solid trim
      for (const [sx, sz] of [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ])
        K.quad("metal", [cx + sx * h, y, cz + sz * (h - ch)], [cx + sx * (h - ch), y, cz + sz * h], [cx + sx * (h - ch), yt, cz + sz * h], [cx + sx * h, yt, cz + sz * (h - ch)], [sx * 0.7071, 0, sz * 0.7071], (p) => [p[0] * 0.3, p[1] * 0.3], o.edge);
    } else {
      K.box(s, cx - h, y, cz - h, cx + h, yt, cz + h, o.tint ?? WHITE, { skip: "-y", fh: 3.6, uOff: c.r() });
      // the corner edges
      for (const [sx, sz] of [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ])
        K.box("metal", cx + sx * h - 0.22, y, cz + sz * h - 0.22, cx + sx * h + 0.22, yt, cz + sz * h + 0.22, o.edge);
    }
    // the floor bands (lit lines round it every few floors)
    if (o.band && !c.far) {
      const every = o.bandEvery ?? 7.2;
      for (let by = y + every; by < yt - 1; by += every) {
        K.box("neon", cx - h - 0.05, by, cz - h - 0.05, cx + h + 0.05, by + 0.18, cz + h + 0.05, o.band, { skip: "-y+y" });
      }
    }
    // the parapet
    K.box("metal", cx - h - 0.1, yt, cz - h - 0.1, cx + h + 0.1, yt + 0.9, cz + h + 0.1, o.edge, { skip: "-y" });
    y = yt;
  }
  return y;
}

def("noir", (c) => {
  const { K, X, Z, u } = c;
  const cx = X(c.b.model.w / 2),
    cz = Z(Math.min(c.b.model.d - 50, 40));
  const hw = 22 * u,
    top = 340 * u;
  const front = cz + hw;
  const y0 = plaza(c, hex("#3a3a3e"));
  // the slab: obsidian glass with silver edges, its green slit up the front
  slabTower(c, cx, cz, hw, top, "f001", { edge: hex("#c8ccd0"), band: hex("#00d38c", 1.6), bandEvery: 6 * 3.6, tint: hex("#6a7074") });
  K.box("neon", cx - 0.4, 8, front - 0.05, cx + 0.4, top, front + 0.12, hex("#00d38c", 2.2), { skip: "-y" });
  for (const sx of [-1, 1]) K.box("metal", cx + sx * 0.4 - 0.3 * (sx < 0 ? 1 : 0), 8, front, cx + sx * 0.4 + 0.3 * (sx > 0 ? 1 : 0), top, front + 0.16, hex("#8a8e92"));
  // the lobby: double height glass
  entrance(c, cx - 9, cx + 9, front + 0.02, 7.6, hex("#c8ccd0"), y0);
  // the crown: a silver crescent standing on its edge, the line through it, the green light at its tip
  if (!c.far) {
    const R = 44 * u,
      cy = top + (6 + 44) * u;
    crescent(c, cx, cy, cz, R, R * 0.83, R * 0.21, 1.4, hex("#d8dce0"));
    K.box("metal", cx - 0.35, top, cz - 0.35, cx + 0.35, cy + 1.4, cz + 0.35, hex("#c8ccd0"));
    K.sphere("neon", cx + Math.cos(-1.05) * R * 0.98, cy - Math.sin(-1.05) * R * 0.98, cz, 1.1, hex("#00d38c", 3));
  }
  // the canopy over the doors, the plaza
  canopy(c, cx - 13 * u, cx + 13 * u, front, Math.min(c.D / 2 - 3, front + 14 * u) - front, 17 * u, hex("#00d38c", 2));
  K.box("neon", cx - 0.15, y0, front + 0.5, cx + 0.15, y0 + 0.01, c.D / 2 - 1, hex("#00d38c", 1.5));
  treeRow(c, -c.W / 2 + 2, -c.D / 2 + 4, -c.W / 2 + 2, front - 2, 6, "plane", y0);
  treeRow(c, c.W / 2 - 2, -c.D / 2 + 4, c.W / 2 - 2, front - 2, 6, "plane", y0);
  planter(c, -c.W / 2 + 4, c.D / 2 - 3, 4, 1.6, hex("#2a2a2e"), y0);
  planter(c, c.W / 2 - 4, c.D / 2 - 3, 4, 1.6, hex("#2a2a2e"), y0);
  lampRow(c, -c.W / 2 + 1, front, -c.W / 2 + 1, c.D / 2 - 1, 4, Math.PI / 2, "#9ff5d6", y0);
  lampRow(c, c.W / 2 - 1, front, c.W / 2 - 1, c.D / 2 - 1, 4, -Math.PI / 2, "#9ff5d6", y0);
});
void circle;
void roundRect;
void turn;

/** A flat convex outline (x–y plane, facing ±z) extruded t thick at cz: its faces and its rim. */
function plate(c: LmCtx, s: Slot, pts: V2[], cz: number, t: number, col: V3, rim?: { s: Slot; col: V3 }) {
  const K = c.K;
  let cx = 0,
    cy = 0;
  for (const p of pts) ((cx += p[0]), (cy += p[1]));
  cx /= pts.length;
  cy /= pts.length;
  const uv = (p: V3): [number, number] => [p[0] * 0.3, p[1] * 0.3];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b2 = pts[(i + 1) % pts.length];
    for (const sz of [1, -1]) K.tri(s, [cx, cy, cz + (sz * t) / 2], [a[0], a[1], cz + (sz * t) / 2], [b2[0], b2[1], cz + (sz * t) / 2], [0, 0, sz], uv, col);
    const ex = b2[0] - a[0],
      ey = b2[1] - a[1];
    const l = Math.hypot(ex, ey) || 1;
    // (outward: away from the centre)
    let nx = ey / l,
      ny = -ex / l;
    if ((a[0] - cx) * nx + (a[1] - cy) * ny < 0) ((nx = -nx), (ny = -ny));
    K.quad(rim?.s ?? s, [a[0], a[1], cz - t / 2], [b2[0], b2[1], cz - t / 2], [b2[0], b2[1], cz + t / 2], [a[0], a[1], cz + t / 2], [nx, ny, 0], uv, rim?.col ?? col);
  }
}

def("zodl", (c) => {
  const { K, X, Z, u } = c;
  const md = c.b.model.d;
  const cx = X(c.b.model.w / 2),
    cz = Z(Math.min(md - 52, 40));
  const front = cz + 25 * u;
  const y0 = plaza(c, hex("#d8d6d2"));
  // three stacked white slabs with chamfered black corners, ribbon windows, white light round each setback
  const top = slabTower(c, cx, cz, 25 * u, 330 * u, "f006", {
    edge: hex("#151314"),
    chamfer: 3 * u,
    tint: hex("#f2f1ee"),
    setbacks: [
      [220 * u, 25 * u],
      [290 * u, 21 * u],
      [330 * u, 17 * u],
    ],
  });
  for (const [y, h] of [
    [220 * u, 25 * u],
    [290 * u, 21 * u],
    [330 * u, 17 * u],
  ])
    K.box("neon", cx - h - 0.06, y - 0.3, cz - h - 0.06, cx + h + 0.06, y - 0.05, cz + h + 0.06, hex("#ffffff", 1.6), { skip: "-y+y" });
  // the bird on the front, fifty metres up: black origami on a lit white square
  {
    const BY = 170 * u,
      P = 23 * u,
      S = 118 * u;
    const z = front + 0.06;
    K.box("neon", cx - P, BY - P, z - 0.05, cx + P, BY + P, z, hex("#ffffff", 0.9), { skip: "-z" });
    K.box("metal", cx - P - 0.2, BY - P - 0.2, z - 0.1, cx + P + 0.2, BY + P + 0.2, z - 0.02, hex("#151314"));
    const bcx = (0.287 + 0.6597) / 2;
    for (const t of ZODL_BIRD_LOCAL) {
      const pts = t.map(([px, py]) => [cx + (px - bcx) * S, BY - (py - 0.5) * S] as V2);
      K.tri("metal", [pts[0][0], pts[0][1], z + 0.02], [pts[1][0], pts[1][1], z + 0.02], [pts[2][0], pts[2][1], z + 0.02], [0, 0, 1], (p) => [p[0], p[1]], hex("#0b0b0d"));
    }
  }
  // the crown: a drum on the roof (the 3D bird turns over it)
  K.cyl("metal", cx, cz, 16 * u, 16 * u, top, top + 4, hex("#2a2a30"), { sides: 32 });
  K.cyl("neon", cx, cz, 16.2 * u, 16.2 * u, top + 3.6, top + 4, hex("#ffffff", 1.6), { sides: 32, caps: "none" });
  entrance(c, cx - 9, cx + 9, front + 0.02, 7.6, hex("#151314"), y0);
  canopy(c, cx - 13 * u, cx + 13 * u, front, Math.min(c.D / 2 - 3, front + 14 * u) - front, 17 * u, hex("#ffffff", 1.6), hex("#151314"));
  for (let i = -2; i <= 2; i++) K.box("concrete", cx + i * 1.7 - 0.25, y0, front + 0.5, cx + i * 1.7 + 0.25, y0 + 0.01, c.D / 2 - 1, hex("#151314"));
  treeRow(c, -c.W / 2 + 2, -c.D / 2 + 4, -c.W / 2 + 2, front - 2, 6, "plane", y0);
  treeRow(c, c.W / 2 - 2, -c.D / 2 + 4, c.W / 2 - 2, front - 2, 6, "plane", y0);
  lampRow(c, -c.W / 2 + 1, front, -c.W / 2 + 1, c.D / 2 - 1, 4, Math.PI / 2, "#ffffff", y0);
  lampRow(c, c.W / 2 - 1, front, c.W / 2 - 1, c.D / 2 - 1, 4, -Math.PI / 2, "#ffffff", y0);
});

def("zlab", (c) => {
  const { K, X, Z, u } = c;
  const cx = X(c.b.model.w / 2),
    cz = Z(Math.min(c.b.model.d - 50, 40));
  const hw = 22 * u,
    top = 340 * u;
  const front = cz + hw;
  const gold = hex("#f4b728");
  const y0 = plaza(c, hex("#2a2a2e"));
  slabTower(c, cx, cz, hw, top, "f001", { edge: gold, tint: hex("#4a4e52") });
  // green dashed scan lines round it every six floors, a gold line up its front
  if (!c.far)
    for (let y = 6 * 3.6; y < top - 2; y += 6 * 3.6)
      for (const [nx, nz] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ])
        for (let a = -hw + 0.6; a < hw - 1.2; a += 2.4) {
          const x0 = nz ? cx + a : cx + nx * (hw + 0.04),
            z0 = nz ? cz + nz * (hw + 0.04) : cz + a;
          K.box("neon", nz ? x0 : x0 - 0.04, y, nz ? z0 - 0.04 : z0, nz ? x0 + 1.2 : x0 + 0.04, y + 0.16, nz ? z0 + 0.04 : z0 + 1.2, hex("#1baf7a", 2));
        }
  K.box("metal", cx - 0.3, 8, front - 0.02, cx + 0.3, top, front + 0.14, gold, { skip: "-y" });
  // the shield on its tip on the roof: gold outline, black field, white Z
  if (!c.far) {
    const uu = ((44 * 2) / 27) * u;
    const base = top + 4 * u;
    const pts: V2[] = [];
    const raw: [number, number][] = [
      [16, 2.5],
      [27.5, 7],
      [27.5, 15.6],
    ];
    const bez = (p0: number[], p1: number[], p2: number[], p3: number[]) => {
      for (let i = 1; i <= 12; i++) {
        const t = i / 12,
          q = 1 - t;
        raw.push([q * q * q * p0[0] + 3 * q * q * t * p1[0] + 3 * q * t * t * p2[0] + t * t * t * p3[0], q * q * q * p0[1] + 3 * q * q * t * p1[1] + 3 * q * t * t * p2[1] + t * t * t * p3[1]]);
      }
    };
    bez([27.5, 15.6], [27.5, 22.6], [22.7, 27.5], [16, 29.5]);
    bez([16, 29.5], [9.3, 27.5], [4.5, 22.6], [4.5, 15.6]);
    raw.push([4.5, 7]);
    for (const [mx, my] of raw) pts.push([cx + (mx - 16) * uu, base + (29.5 - my) * uu]);
    plate(c, "metal", pts, cz, 1.6, gold);
    const inner = raw.map(([mx, my]) => [cx + (16 + (mx - 16) * 0.84 - 16) * uu, base + (29.5 - (16.3 + (my - 16) * 0.84)) * uu] as V2);
    plate(c, "metal", inner, cz, 1.9, hex("#0b0b0d"));
    const zb = (a: number[], b2: number[]) => K.bar("metal", [cx + (a[0] - 16) * uu, base + (29.5 - a[1]) * uu, cz + 1.0], [cx + (b2[0] - 16) * uu, base + (29.5 - b2[1]) * uu, cz + 1.0], 1.6 * uu, hex("#f4f4f0"));
    zb([11, 11], [21, 11]);
    zb([21, 11], [11, 21]);
    zb([11, 21], [21, 21]);
    K.box("metal", cx - 0.4, top, cz - 0.4, cx + 0.4, base + 2, cz + 0.4, gold);
  }
  entrance(c, cx - 9, cx + 9, front + 0.02, 7.6, gold, y0);
  canopy(c, cx - 13 * u, cx + 13 * u, front, Math.min(c.D / 2 - 3, front + 14 * u) - front, 17 * u, gold);
  K.box("neon", cx - 0.15, y0, front + 0.5, cx + 0.15, y0 + 0.01, c.D / 2 - 1, gold);
  treeRow(c, -c.W / 2 + 2, -c.D / 2 + 4, -c.W / 2 + 2, front - 2, 6, "plane", y0);
  treeRow(c, c.W / 2 - 2, -c.D / 2 + 4, c.W / 2 - 2, front - 2, 6, "plane", y0);
  lampRow(c, -c.W / 2 + 1, front, -c.W / 2 + 1, c.D / 2 - 1, 4, Math.PI / 2, "#ffe0a0", y0);
  lampRow(c, c.W / 2 - 1, front, c.W / 2 - 1, c.D / 2 - 1, 4, -Math.PI / 2, "#ffe0a0", y0);
});

def("vizor", (c) => {
  const { K, X, Z, u } = c;
  const cx = X(c.b.model.w / 2),
    cz = Z(Math.min(c.b.model.d - 36, 32));
  const TOP = 290 * u,
    R0 = 25 * u,
    RT = 20 * u;
  const front = cz + R0;
  const y0 = plaza(c, hex("#e4e0da"));
  // the crimson glass drum tapering as it rises
  const rings: { y: number; pts: V2[] }[] = [];
  const n = c.far ? 24 : 48;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    rings.push({ y: y0 + t * (TOP - y0), pts: circle(cx, cz, R0 + (RT - R0) * t, n) });
  }
  K.loft("f001", rings, hex("#ff3a6a"), { fh: 3.6, smooth: true, lid: "roof", lidCol: hex("#2a2a30") });
  // silver fins all round, two pink helices of neon
  if (!c.far) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const p0: V3 = [cx + Math.cos(a) * (R0 + 0.25), y0, cz + Math.sin(a) * (R0 + 0.25)],
        p1: V3 = [cx + Math.cos(a) * (RT + 0.25), TOP, cz + Math.sin(a) * (RT + 0.25)];
      K.bar("metal", p0, p1, 0.35, hex("#d0d0d8"));
    }
    for (const ph of [0, Math.PI]) {
      let prev: V3 | null = null;
      for (let i = 0; i <= 160; i++) {
        const t = i / 160;
        const a = ph + t * Math.PI * 2 * 3.2;
        const rr = R0 + (RT - R0) * t + 0.45;
        const p: V3 = [cx + Math.cos(a) * rr, y0 + 6 + t * (TOP - 12), cz + Math.sin(a) * rr];
        if (prev) K.bar("neon", prev, p, 0.28, hex("#ff3d7a", 2.2));
        prev = p;
      }
    }
  }
  // the helmet on top: a silver dome, its visor glowing across the front
  K.sphere("metal", cx, TOP, cz, RT, hex("#d0d0dc"), { hemi: true });
  if (!c.far) {
    for (let i = -7; i <= 7; i++) {
      const a = Math.PI / 2 + (i / 7) * 1.1;
      const r1 = RT * 1.005;
      const y1 = TOP + RT * 0.22,
        y2 = TOP + RT * 0.5;
      const a2 = Math.PI / 2 + ((i + 1) / 7) * 1.1;
      if (i === 7) break;
      const pt = (aa: number, yy: number): V3 => {
        const rr = Math.sqrt(Math.max(0, RT * RT - (yy - TOP) ** 2)) * (r1 / RT);
        return [cx + Math.cos(aa) * rr, yy, cz + Math.sin(aa) * rr];
      };
      K.quad("neon", pt(a, y1), pt(a2, y1), pt(a2, y2), pt(a, y2), [Math.cos(a), 0, Math.sin(a)], (p) => [p[0], p[1]], hex("#ff3d7a", 2.4));
    }
  }
  entrance(c, cx - 8, cx + 8, front + 0.02 - 0.5, 7, hex("#d0d0d8"), y0);
  canopy(c, cx - 12 * u, cx + 12 * u, front - 0.5, Math.min(c.D / 2 - 3, front + 13 * u) - front + 0.5, 16 * u, hex("#ff3d7a", 2), hex("#c8c8d0"));
  // the pink ring on the plaza
  K.cyl("neon", cx, cz, R0 + 3.2, R0 + 3.2, y0, y0 + 0.02, hex("#ff3d7a", 1.6), { caps: "none", sides: 48 });
  treeRow(c, -c.W / 2 + 2, -c.D / 2 + 4, -c.W / 2 + 2, c.D / 2 - 4, 7, "plane", y0);
  treeRow(c, c.W / 2 - 2, -c.D / 2 + 4, c.W / 2 - 2, c.D / 2 - 4, 7, "plane", y0);
});

/** ZODL's bird (scene/emblems.ts), as triangles in its icon's units (y down). */
import { ZODL_BIRD } from "../emblems";
const ZODL_BIRD_LOCAL = ZODL_BIRD as [number, number][][];

/** An art-deco tier: a limestone block with continuous piers (the facade set's windows between), gold trim at its top. */
function decoTier(c: LmCtx, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, lime: V3, gold: V3) {
  const K = c.K;
  K.box("f019", x0, y0, z0, x1, y1, z1, lime, { skip: "-y", fh: 3.4, uOff: 0.25 });
  if (!c.far) {
    // the piers proud of the wall, every bay
    for (const [a0, a1, zf, nz] of [
      [x0, x1, z1, 1],
      [x0, x1, z0, -1],
    ] as const) {
      const n = Math.max(2, Math.round((a1 - a0) / 2.4));
      for (let i = 0; i <= n; i++) {
        const x = a0 + ((a1 - a0) * i) / n;
        K.box("plaster", x - 0.22, y0, nz > 0 ? zf : zf - 0.25, x + 0.22, y1, nz > 0 ? zf + 0.25 : zf, lime);
      }
    }
    for (const [a0, a1, xf, nx] of [
      [z0, z1, x1, 1],
      [z0, z1, x0, -1],
    ] as const) {
      const n = Math.max(2, Math.round((a1 - a0) / 2.4));
      for (let i = 0; i <= n; i++) {
        const z = a0 + ((a1 - a0) * i) / n;
        K.box("plaster", nx > 0 ? xf : xf - 0.25, y0, z - 0.22, nx > 0 ? xf + 0.25 : xf, y1, z + 0.22, lime);
      }
    }
  }
  K.box("metal", x0 - 0.3, y1, z0 - 0.3, x1 + 0.3, y1 + 0.6, z1 + 0.3, gold);
  K.box("plaster", x0 - 0.15, y1 + 0.6, z0 - 0.15, x1 + 0.15, y1 + 1.4, z1 + 0.15, lime);
}

def("zkorchard", (c) => {
  const { K, X, Z, u } = c;
  const mw = c.b.model.w;
  void X;
  const lime = hex("#e6dccb"),
    gold = hex("#d8a838"),
    granite = hex("#3a3638");
  const y0 = plaza(c, hex("#c8c2b8"));
  // the podium: granite base course, limestone with tall windows
  const PX0 = X(3),
    PX1 = X(mw - 3),
    PZ0 = Z(4),
    PZ1 = Z(64),
    PH = 44 * u;
  K.box("concrete", PX0, y0, PZ0, PX1, y0 + 1.3, PZ1, granite, { skip: "-y" });
  K.box("f020", PX0, y0 + 1.3, PZ0, PX1, PH, PZ1, lime, { skip: "-y", fh: 4.2 });
  K.box("plaster", PX0 - 0.35, PH, PZ0 - 0.35, PX1 + 0.35, PH + 0.7, PZ1 + 0.35, lime);
  K.box("metal", PX0, PH - 0.35, PZ1, PX1, PH - 0.1, PZ1 + 0.06, gold);
  // the setback tiers, Empire State
  const T = [
    [8, 8, mw - 8, 60, 47, 180],
    [15, 13, mw - 15, 55, 182, 270],
    [22, 18, mw - 22, 50, 272, 330],
  ];
  for (const [a, b2, cc, d, e, f] of T) decoTier(c, X(a), Z(b2), X(cc), Z(d), e * u, f * u, lime, gold);
  // the Chrysler crown: stacked stainless sunburst tiers, triangular windows lit at night, the needle
  const CCX = X((22 + mw - 22) / 2),
    CCZ = Z((18 + 50) / 2);
  let y = 333 * u;
  for (let i = 0; i < 6; i++) {
    const hw = (12 - i * 1.85) * u;
    const h = 8.5 * u;
    K.box("metal", CCX - hw, y, CCZ - hw, CCX + hw, y + h * 0.55, CCZ + hw, hex("#d8dce4"));
    // the arch over each face: a half disc of steel standing proud
    const n = 10;
    for (const [nx, nz] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const fx = CCX + nx * hw,
        fz = CCZ + nz * hw;
      for (let j = 0; j < n; j++) {
        const a0 = (j / n) * Math.PI,
          a1 = ((j + 1) / n) * Math.PI;
        const P = (aa: number, rr: number): V3 => (nz ? [fx + Math.cos(aa) * rr, y + h * 0.55 + Math.sin(aa) * rr * 0.9, fz] : [fx, y + h * 0.55 + Math.sin(aa) * rr * 0.9, fz + Math.cos(aa) * rr]);
        K.quad("metal", P(a0, hw), P(a1, hw), P(a1, 0.01), P(a0, 0.01), [nx, 0, nz], (p) => [p[0] * 0.3 + p[2] * 0.3, p[1] * 0.3], hex("#e4e8ee"));
        if (!c.far && j % 2 === 0) {
          const m0 = P((a0 + a1) / 2, hw * 0.55);
          K.tri("neon", [m0[0] + nz * 0.25 - nx * 0, m0[1] - 0.35, m0[2] + nx * 0.25], [m0[0] - nz * 0.25, m0[1] - 0.35, m0[2] - nx * 0.25], [m0[0], m0[1] + 0.35, m0[2]], [nx, 0, nz], (p) => [p[0], p[1]], hex("#ffe6b0", 1.6));
        }
      }
    }
    y += h;
  }
  K.cyl("metal", CCX, CCZ, 0.8, 0.05, y, y + 26 * u, hex("#e4e8ee"), { sides: 12 });
  K.sphere("neon", CCX, y + 26 * u, CCZ, 0.35, hex("#ff2a2a", 3));
  // the gilded portal, its canopy, the revolving doors
  const DX0 = X(Math.round(mw / 2 - 8)),
    DX1 = X(Math.round(mw / 2 + 8));
  K.box("metal", DX0 - 0.5, y0, PZ1 - 0.2, DX1 + 0.5, y0 + 34 * u + 0.5, PZ1 + 0.25, gold, { skip: "-y" });
  entrance(c, DX0, DX1, PZ1 + 0.3, 34 * u - 0.4, gold, y0);
  canopy(c, DX0 - 4 * u, DX1 + 4 * u, PZ1 + 0.3, 7.7 * u, 14 * u, hex("#ffd27a", 1.4), gold);
  // shop windows either side of the portal
  for (const [a, b2] of [
    [X(7), DX0 - 2],
    [DX1 + 2, X(mw - 8)],
  ])
    if (b2 - a > 2) {
      K.box("shop", a, y0 + 1.3, PZ1 - 0.25, b2, y0 + 4.6, PZ1 - 0.15, [0.95, 0.85, 0.7], { skip: "-z+y-y+x-x" });
      K.quad("glass", [a, y0 + 1.3, PZ1 + 0.02], [b2, y0 + 1.3, PZ1 + 0.02], [b2, y0 + 4.6, PZ1 + 0.02], [a, y0 + 4.6, PZ1 + 0.02], [0, 0, 1], (p) => [p[0], p[1]], [0.99, 0.5, 0.75]);
      K.box("metal", a - 0.1, y0 + 4.6, PZ1, b2 + 0.1, y0 + 5, PZ1 + 0.4, gold);
    }
  treeRow(c, -c.W / 2 + 2, PZ1 + 2, -c.W / 2 + 2, c.D / 2 - 2, 6, "plane", y0);
  treeRow(c, c.W / 2 - 2, PZ1 + 2, c.W / 2 - 2, c.D / 2 - 2, 6, "plane", y0);
  lampRow(c, -c.W / 2 + 4, c.D / 2 - 1.2, c.W / 2 - 4, c.D / 2 - 1.2, 8, 0, "#ffd9a0", y0);
});

/** A rounded triangle's outline (flat side to +z, a vertex to −z), r its in-radius scale, rr the rounding. */
function roundTri(cx: number, cz: number, r: number, rr: number, n = 48, rot = 0): V2[] {
  const SQ3 = Math.sqrt(3);
  const sdTri = (px: number, py: number) => {
    let x = Math.abs(px) - r,
      y = py + r / SQ3;
    if (x + SQ3 * y > 0) [x, y] = [(x - SQ3 * y) / 2, (-SQ3 * x - y) / 2];
    x -= Math.min(0, Math.max(-2 * r, x));
    return -Math.hypot(x, y) * Math.sign(y);
  };
  const pts: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dx = Math.cos(a),
      dz = Math.sin(a);
    // the radius where the rounded field is 0 (bisection)
    let lo = 0,
      hi = r * 3;
    for (let k = 0; k < 28; k++) {
      const mid = (lo + hi) / 2;
      const d = sdTri(dx * mid, -dz * mid) - rr;
      if (d < 0) lo = mid;
      else hi = mid;
    }
    const x = dx * lo,
      z = dz * lo;
    const c = Math.cos(rot),
      s = Math.sin(rot);
    pts.push([cx + x * c - z * s, cz + x * s + z * c]);
  }
  return pts;
}

def("zkhalo", (c) => {
  const { K, X, Z, u } = c;
  const cx = X(c.b.model.w / 2),
    cz = Z(Math.min(c.b.model.d - 40, 46));
  const TOP = 400 * u;
  const y0 = plaza(c, hex("#d8d4cc"));
  // the twisted rounded triangle: 110° over its height, tapering
  const rings: { y: number; pts: V2[] }[] = [];
  const N = c.far ? 10 : 30;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const s = 1 - 0.3 * t - 0.05 * t * t;
    rings.push({ y: y0 + t * (TOP - y0), pts: roundTri(cx, cz, 19 * u * s, 7 * u * s, c.far ? 24 : 48, t * ((110 * Math.PI) / 180)) });
  }
  K.loft("f005", rings, hex("#c8dcf0"), { fh: 4, smooth: true, lid: "roof", lidCol: hex("#8a929c") });
  // the sky lobbies: a lit band every fifteen floors
  if (!c.far)
    for (let f = 15; f * 4 < TOP; f += 15) {
      const y = y0 + f * 4;
      const t = (y - y0) / (TOP - y0);
      const s = 1 - 0.3 * t - 0.05 * t * t;
      const ring = roundTri(cx, cz, 19 * u * s + 0.12, 7 * u * s, 48, t * ((110 * Math.PI) / 180));
      K.prism("neon", ring, y, y + 0.5, hex("#bff8ff", 1.4), { lid: null, smooth: true });
    }
  // the halo: a ring of cyan light round the top on six spokes
  const HY = (400 - 42) * u,
    HR = 31 * u;
  const tor: V2[] = circle(cx, cz, HR, 64);
  const tor2: V2[] = circle(cx, cz, HR - 0.5, 64);
  K.prism("neon", tor, HY, HY + 0.6, hex("#3ef0ff", 2.4), { lid: null, smooth: true });
  K.prism("metal", tor2, HY - 0.35, HY, hex("#d8dee6"), { lid: null, smooth: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    K.bar("metal", [cx + Math.cos(a) * 4, HY - 0.2, cz + Math.sin(a) * 4], [cx + Math.cos(a) * HR, HY - 0.2, cz + Math.sin(a) * HR], 0.3, hex("#d8dee6"));
  }
  // the helipad on the roof: a disc on a drum, its rim lit cyan, the H
  const PAD = 406 * u;
  K.cyl("concrete", cx, cz, 7 * u, 7 * u, TOP, PAD, hex("#8a929c"));
  K.cyl("concrete", cx, cz, 22 * u, 22 * u, PAD, PAD + 0.4, hex("#4a4e56"), { caps: "both" });
  K.cyl("neon", cx, cz, 22 * u + 0.05, 22 * u + 0.05, PAD + 0.3, PAD + 0.42, hex("#3ef0ff", 2.2), { caps: "none" });
  K.box("roof", cx - 2.2, PAD + 0.41, cz - 0.4, cx + 2.2, PAD + 0.43, cz + 0.4, hex("#f4f4f0"));
  K.box("roof", cx - 2.2, PAD + 0.41, cz - 2.6, cx - 1.4, PAD + 0.43, cz + 2.6, hex("#f4f4f0"));
  K.box("roof", cx + 1.4, PAD + 0.41, cz - 2.6, cx + 2.2, PAD + 0.43, cz + 2.6, hex("#f4f4f0"));
  // the glass canopy over the entrance, plaza rings, fountains, trees and lamps
  const front = cz + 26 * u;
  entrance(c, cx - 7, cx + 7, front - 2.4, 6.5, hex("#c8d2dc"), y0);
  canopy(c, cx - 9, cx + 9, front - 2.4, Math.min(c.D / 2 - 2, front + 16 * u) - front + 2.4, 5.6, hex("#3ef0ff", 2), hex("#c8d2dc"));
  for (const rr of [40 * u, 48 * u]) K.cyl("concrete", cx, cz, rr + 0.2, rr + 0.2, y0, y0 + 0.01, hex("#8e8a84"), { caps: "none", sides: 64 });
  K.cyl("neon", cx, cz, 44 * u, 44 * u, y0, y0 + 0.02, hex("#3ef0ff", 1.2), { caps: "none", sides: 64 });
  treeRow(c, -c.W / 2 + 2.5, -c.D / 2 + 4, -c.W / 2 + 2.5, c.D / 2 - 4, 7, "plane", y0);
  treeRow(c, c.W / 2 - 2.5, -c.D / 2 + 4, c.W / 2 - 2.5, c.D / 2 - 4, 7, "plane", y0);
});

def("zksapling", (c) => {
  const { K, X, Z, u } = c;
  const mw = c.b.model.w;
  const cx0 = Math.round(mw / 2);
  const TX0 = X(cx0 - 20),
    TX1 = X(cx0 + 20),
    TZ0 = Z(12),
    TZ1 = Z(50);
  const TOP = 330 * u;
  const y0 = plaza(c, hex("#cdc6ba"));
  // the podium: green walls, a glass front with timber fins, a garden on its roof
  const PH = 21 * u;
  const PX0 = X(4),
    PX1 = X(mw - 4),
    PZ0 = Z(4),
    PZ1 = Z(54);
  K.box("plaster", PX0, y0, PZ0, PX1, PH, PZ1, hex("#d8d0c4"), { skip: "-y" });
  K.box("shop", PX0 + 1, y0, PZ1 - 0.2, PX1 - 1, PH - 1.2, PZ1 - 0.1, [0.9, 0.9, 0.85], { skip: "-z+y-y+x-x" });
  K.quad("glass", [PX0 + 1, y0, PZ1 + 0.01], [PX1 - 1, y0, PZ1 + 0.01], [PX1 - 1, PH - 1.2, PZ1 + 0.01], [PX0 + 1, PH - 1.2, PZ1 + 0.01], [0, 0, 1], (p) => [p[0], p[1]], [0.99, 0.5, 0.8]);
  for (let x = PX0 + 1; x <= PX1 - 1; x += 1.2) K.box("wood", x - 0.08, y0, PZ1, x + 0.08, PH - 1.2, PZ1 + 0.35, hex("#a8794e"));
  for (let x = PX0 + 2; x < PX1 - 1; x += 3.4) c.ex.trees.push([x, PH, (PZ0 + PZ1) / 2 + (c.r() - 0.5) * 6, "bush", Math.floor(c.r() * 40)]);
  // the tower: red and pink mesh, a sky garden every eight storeys (open on all sides, lit timber soffit)
  const GARDENS = [92, 172, 252].map((g) => g * u);
  const GH = 24 * u;
  let y = PH;
  const mesh = hex("#c8444a");
  for (const g of [...GARDENS, TOP]) {
    if (g > y) K.box("f017", TX0, y, TZ0, TX1, g, TZ1, mesh, { skip: "-y", fh: 3.4, uOff: c.r() });
    if (g === TOP) break;
    // the garden: a slab, the lit core, timber soffit above, trees on its lawn, creepers off its edge
    K.box("concrete", TX0 - 0.4, g, TZ0 - 0.4, TX1 + 0.4, g + 0.5, TZ1 + 0.4, hex("#6a6460"));
    K.box("roof", TX0 - 0.3, g + 0.5, TZ0 - 0.3, TX1 + 0.3, g + 0.55, TZ1 + 0.3, hex("#5a7a3a"));
    const cxm = (TX0 + TX1) / 2,
      czm = (TZ0 + TZ1) / 2;
    K.box("concrete", cxm - 2.2, g + 0.5, czm - 2.2, cxm + 2.2, g + GH - 0.6, czm + 2.2, hex("#d8d2c8"));
    K.box("neon", cxm - 2.25, g + 0.6, czm + 2.2, cxm + 2.25, g + GH - 0.8, czm + 2.25, hex("#ffe2b0", 1.2));
    K.box("wood", TX0 - 0.3, g + GH - 0.6, TZ0 - 0.3, TX1 + 0.3, g + GH, TZ1 + 0.3, hex("#c8945e"), { skip: "+y" });
    K.box("neon", TX0, g + GH - 0.62, TZ0, TX1, g + GH - 0.6, TZ1, hex("#ffd8a0", 1.0));
    for (const [sx, sz] of [
      [TX0 + 0.6, TZ0 + 0.6],
      [TX1 - 0.6, TZ0 + 0.6],
      [TX0 + 0.6, TZ1 - 0.6],
      [TX1 - 0.6, TZ1 - 0.6],
    ])
      K.cyl("concrete", sx, sz, 0.45, 0.45, g + 0.5, g + GH - 0.6, hex("#d8d2c8"), { sides: 12, caps: "none" });
    if (!c.far)
      for (let i = 0; i < 6; i++) {
        const tx = TX0 + 1.5 + c.r() * (TX1 - TX0 - 3),
          tz = c.r() < 0.5 ? TZ0 + 1.2 : TZ1 - 1.2;
        c.ex.trees.push([tx, g + 0.55, tz, c.r() < 0.4 ? "palm" : "broad", Math.floor(c.r() * 60)]);
      }
    y = g + GH;
  }
  // the top: the lattice crown round the roof garden, the infinity pool along the front edge
  K.box("concrete", TX0 - 0.3, TOP, TZ0 - 0.3, TX1 + 0.3, TOP + 0.6, TZ1 + 0.3, hex("#6a6460"));
  K.box("neon", TX0 + 0.6, TOP + 0.6, TZ1 - 3.4, TX1 - 0.6, TOP + 0.62, TZ1 - 0.4, hex("#3ee0d8", 1.4));
  if (!c.far) {
    for (let x = TX0; x <= TX1 + 0.01; x += 1.4)
      for (const z of [TZ0, TZ1]) K.box("metal", x - 0.08, TOP + 0.6, z - 0.08, x + 0.08, TOP + 30 * u, z + 0.08, hex("#c84450"));
    for (let z = TZ0; z <= TZ1 + 0.01; z += 1.4) for (const x of [TX0, TX1]) K.box("metal", x - 0.08, TOP + 0.6, z - 0.08, x + 0.08, TOP + 30 * u, z + 0.08, hex("#c84450"));
    K.box("metal", TX0 - 0.1, TOP + 30 * u, TZ0 - 0.1, TX1 + 0.1, TOP + 30 * u + 0.3, TZ1 + 0.1, hex("#c84450"), { skip: "-y" });
    for (let i = 0; i < 5; i++) c.ex.trees.push([TX0 + 1.5 + c.r() * (TX1 - TX0 - 3), TOP + 0.6, TZ0 + 1.5 + c.r() * 5, "palm", i * 7]);
  }
  // creepers climbing the mesh (bushes up the corners)
  if (!c.far)
    for (let yy = PH + 4; yy < TOP - 4; yy += 9)
      for (const [x, z] of [
        [TX0 - 0.3, TZ1 + 0.3],
        [TX1 + 0.3, TZ1 + 0.3],
      ])
        c.ex.trees.push([x, yy, z, "bush", Math.floor(c.r() * 99)]);
  const front = PZ1;
  entrance(c, X(cx0 - 9), X(cx0 + 9), front + 0.02, 4.6, hex("#3a2a20"), y0);
  canopy(c, X(cx0 - 12), X(cx0 + 12), front, 3.2, 5, null, hex("#5a7a3a"));
  for (let x = X(cx0 - 11); x < X(cx0 + 11); x += 1.6) c.ex.trees.push([x, 5.45, front + 1.6, "bush", Math.floor(x * 7)]);
  treeRow(c, -c.W / 2 + 2, front + 2, -c.W / 2 + 2, c.D / 2 - 2, 5, "palm", y0);
  treeRow(c, c.W / 2 - 2, front + 2, c.W / 2 - 2, c.D / 2 - 2, 5, "palm", y0);
});

// ---- Wall Street: the ZEC Reserve (a Fed temple in front of a glass tower), the Convention Center, the ZK Mall -------

/** A fluted column (a many-sided shaft with entasis), its base and capital, from y0 to y1, radius r. */
function column(c: LmCtx, x: number, z: number, y0: number, y1: number, r: number, stone: V3, gold?: V3) {
  const K = c.K;
  const sides = c.far ? 10 : 20;
  K.box("lm.Marble021", x - r * 1.25, y0, z - r * 1.25, x + r * 1.25, y0 + r * 0.35, z + r * 1.25, stone, { skip: "-y" });
  K.cyl("lm.Marble021", x, z, r * 1.12, r * 1.05, y0 + r * 0.35, y0 + r * 0.6, stone, { sides, caps: "none" });
  const ym = y0 + (y1 - y0) * 0.33;
  K.cyl("lm.Marble021", x, z, r, r, y0 + r * 0.6, ym, stone, { sides, caps: "none" });
  K.cyl("lm.Marble021", x, z, r, r * 0.86, ym, y1 - r * 0.7, stone, { sides, caps: "none" });
  // the capital: an echinus and a square abacus, gilded rim
  K.cyl("lm.Marble021", x, z, r * 0.88, r * 1.18, y1 - r * 0.7, y1 - r * 0.3, stone, { sides, caps: "none" });
  if (gold) K.cyl("lm.Metal032.metal", x, z, r * 1.19, r * 1.19, y1 - r * 0.42, y1 - r * 0.3, gold, { sides, caps: "none" });
  K.box("lm.Marble021", x - r * 1.3, y1 - r * 0.3, z - r * 1.3, x + r * 1.3, y1, z + r * 1.3, stone);
}

/** A stylised bronze zebra charging along +z, on its back at (x, y, z), `s` metres long. */
function zebra(c: LmCtx, x: number, y: number, z: number, s: number) {
  const K = c.K;
  const BR = hex("#6a4a2a"),
    BK = hex("#141218"),
    WH = hex("#ece8e0");
  const k = s / 6;
  // the body: an ellipsoid stretched along z, stripes as rings of alternate paint
  const segs = 10;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs,
      t1 = (i + 1) / segs;
    const z0 = z - 1.6 * k + t0 * 3.2 * k,
      z1 = z - 1.6 * k + t1 * 3.2 * k;
    const r0 = Math.sqrt(Math.max(0.02, 1 - (2 * t0 - 1) ** 2)) * 0.75 * k,
      r1 = Math.sqrt(Math.max(0.02, 1 - (2 * t1 - 1) ** 2)) * 0.75 * k;
    const ring = (zz: number, r: number) => circle(0, 0, r, 14).map(([a, b2]) => [x + a, y + 2.1 * k + b2 * 0.9, zz] as V3);
    const A = ring(z0, r0),
      B = ring(z1, r1);
    for (let j = 0; j < A.length; j++) {
      const a = A[j],
        b2 = A[(j + 1) % A.length],
        cc = B[(j + 1) % B.length],
        d = B[j];
      const nx = (a[0] + b2[0]) / 2 - x,
        ny = ((a[1] + b2[1]) / 2 - y - 2.1 * k) / 0.9;
      const l = Math.hypot(nx, ny) || 1;
      K.quad("lm.paint", a, b2, cc, d, [nx / l, ny / l, 0], (p) => [p[0], p[2]], i % 2 ? BK : WH);
    }
  }
  // the neck and head reaching forward, the mane
  K.bar("lm.paint", [x, y + 2.4 * k, z + 1.3 * k], [x, y + 3.3 * k, z + 2.2 * k], 0.55 * k, WH);
  K.bar("lm.paint", [x, y + 3.3 * k, z + 2.2 * k], [x, y + 2.9 * k, z + 3.0 * k], 0.45 * k, BK);
  K.bar("lm.paint", [x, y + 3.0 * k, z + 1.4 * k], [x, y + 3.55 * k, z + 2.15 * k], 0.18 * k, BK);
  // the legs at the gallop: front pair reaching, back pair pushing off
  const leg = (dx: number, hip: V3, knee: V3, hoof: V3) => {
    K.bar("lm.paint", [x + dx, hip[1], hip[2]], [x + dx, knee[1], knee[2]], 0.26 * k, WH);
    K.bar("lm.paint", [x + dx, knee[1], knee[2]], [x + dx, hoof[1], hoof[2]], 0.18 * k, BK);
  };
  leg(-0.3 * k, [0, y + 1.9 * k, z + 1.1 * k], [0, y + 1.3 * k, z + 1.9 * k], [0, y + 0.9 * k, z + 2.5 * k]);
  leg(0.3 * k, [0, y + 1.9 * k, z + 1.0 * k], [0, y + 1.0 * k, z + 1.4 * k], [0, y + 0.3 * k, z + 1.8 * k]);
  leg(-0.3 * k, [0, y + 1.9 * k, z - 1.1 * k], [0, y + 1.0 * k, z - 1.6 * k], [0, y, z - 2.2 * k]);
  leg(0.3 * k, [0, y + 1.9 * k, z - 1.2 * k], [0, y + 1.2 * k, z - 1.9 * k], [0, y + 0.5 * k, z - 2.6 * k]);
  K.bar("lm.paint", [x, y + 2.3 * k, z - 1.55 * k], [x, y + 3.1 * k, z - 2.2 * k], 0.12 * k, BK);
  void BR;
}

def("reserve", (c) => {
  const { K, X, Z, u } = c;
  const mw = c.b.model.w,
    md = c.b.model.d;
  const MID = X(Math.floor(mw / 2) + 0.5);
  const X0 = X(8),
    X1 = X(mw - 8);
  const TX0 = X(11),
    TX1 = X(mw - 11),
    TZ0 = Z(7),
    TZ1 = Z(44);
  const TOP = 232 * u,
    PZ1 = Z(70),
    CZ = Z(66),
    WALLZ = Z(58),
    POD = 7 * u;
  const granite = hex("#b8b2a6"),
    marble = hex("#ece6da"),
    gold = hex("#e0b040"),
    bronze = hex("#8a6034"),
    steel = hex("#6a7078");
  // the forecourt: granite paving
  K.box("lm.PavingStones128", -c.W / 2, 0, PZ1, c.W / 2, 0.14, c.D / 2, hex("#d8d2c6"), { skip: "-y" });
  K.box("lm.PavingStones128", -c.W / 2, 0, -c.D / 2, c.W / 2, 0.12, PZ1, hex("#c8c2b6"), { skip: "-y" });
  // ---- the tower: a granite base, then the curtain wall in three tiers with notched corners, steel fins
  K.box("lm.Concrete031", TX0, 0, TZ0, TX1, 24 * u, TZ1, granite, { skip: "-y" });
  for (let y = 3 * u; y < 22 * u; y += 3 * u) K.box("lm.dark", TX0 - 0.04, y, TZ0 - 0.04, TX1 + 0.04, y + 0.06, TZ1 + 0.04, hex("#3a3a3e"), { skip: "-y+y" });
  K.box("lm.Marble021.gloss", TX0 - 0.35, 24 * u, TZ0 - 0.35, TX1 + 0.35, 26 * u, TZ1 + 0.35, marble);
  const tiers: [number, number, number][] = [
    [26, 172, 0],
    [172, 206, 3],
    [206, 232, 6],
  ];
  for (const [y0, y1, inset] of tiers) {
    const a = TX0 + inset * u,
      b2 = TX1 - inset * u,
      cz0 = TZ0 + inset * u,
      cz1 = TZ1 - inset * u;
    K.box("f017", a, y0 * u, cz0, b2, y1 * u, cz1, hex("#dfe6ee"), { skip: "-y", fh: 10 * u, uOff: inset * 0.1 });
    for (const [x, z] of [
      [a, cz0],
      [b2, cz0],
      [a, cz1],
      [b2, cz1],
    ])
      K.box("lm.Metal032.metal", x - 0.3, y0 * u, z - 0.3, x + 0.3, y1 * u, z + 0.3, steel);
    for (const x of [X(Math.floor(mw / 2) - 6), X(Math.floor(mw / 2) + 6)]) {
      K.box("lm.Metal032.metal", x - 0.15, y0 * u, cz1, x + 0.15, y1 * u, cz1 + 0.35, hex("#b8bec6"));
      K.box("lm.Metal032.metal", x - 0.15, y0 * u, cz0 - 0.35, x + 0.15, y1 * u, cz0, hex("#b8bec6"));
    }
    K.box("lm.Metal032.metal", a - 0.3, y1 * u, cz0 - 0.3, b2 + 0.3, y1 * u + 0.35, cz1 + 0.3, hex("#c8ccd0"));
    K.box("lm.Metal032.metal", a - 0.3, y1 * u + 0.35, cz0 - 0.3, b2 + 0.3, y1 * u + 0.6, cz1 + 0.3, gold, { skip: "-y" });
  }
  // the ticker band's dark panel round the top tier (the live ticker: scene/decor.ts), framed in gold
  {
    const a = TX0 + 6 * u - 0.33,
      b2 = TX1 - 6 * u + 0.33,
      cz0 = TZ0 + 6 * u - 0.33,
      cz1 = TZ1 - 6 * u + 0.33;
    K.box("lm.dark", a, 214 * u, cz0, b2, 222 * u, cz1, hex("#0c0c10"), { skip: "-y+y" });
    for (const y of [213 * u, 222 * u]) K.box("lm.Metal032.metal", a - 0.1, y, cz0 - 0.1, b2 + 0.1, y + 0.33, cz1 + 0.1, gold, { skip: "-y" });
  }
  // the crown: a stepped gold-framed lantern, dark glass between gold mullions, the spire with its beacon
  {
    let a = TX0 + 6 * u,
      b2 = TX1 - 6 * u,
      cz0 = TZ0 + 6 * u,
      cz1 = TZ1 - 6 * u;
    let y = TOP;
    K.box("lm.Metal032.metal", a - 0.33, y, cz0 - 0.33, b2 + 0.33, y + 0.66, cz1 + 0.33, gold);
    y += 0.66;
    for (let t = 0; t < 4; t++) {
      const h = (9 - t) * u;
      K.box("lm.glass", a, y, cz0, b2, y + h, cz1, hex("#5a4a2a"), { skip: "-y" });
      if (!c.far)
        for (const [p0, p1, isX, zf] of [
          [a, b2, true, cz1],
          [a, b2, true, cz0],
          [cz0, cz1, false, a],
          [cz0, cz1, false, b2],
        ] as const)
          for (let v = p0; v <= p1 + 0.01; v += 1.0)
            if (isX) K.box("lm.Metal032.metal", v - 0.08, y, zf - 0.1, v + 0.08, y + h, zf + 0.1, gold);
            else K.box("lm.Metal032.metal", zf - 0.1, y, v - 0.08, zf + 0.1, y + h, v + 0.08, gold);
      K.box("lm.Metal032.metal", a - 0.33, y + h, cz0 - 0.33, b2 + 0.33, y + h + 0.33, cz1 + 0.33, gold);
      y += h + 0.33;
      a += 1;
      b2 -= 1;
      cz0 += 1;
      cz1 -= 1;
      if (b2 - a < 1.4 || cz1 - cz0 < 1.4) break;
    }
    const sz = (TZ0 + TZ1) / 2;
    K.cyl("lm.Metal032.metal", MID, sz, 0.8, 0.6, y, y + 1.4, gold, { sides: 12 });
    K.cyl("lm.Metal032.metal", MID, sz, 0.5, 0.35, y + 1.4, y + 5.3, gold, { sides: 12 });
    K.cyl("lm.chrome", MID, sz, 0.18, 0.05, y + 5.3, y + 11.3, hex("#d8dce0"), { sides: 8 });
    K.sphere("lm.glow", MID, y + 11.6, sz, 0.3, hex("#ff2a2a"));
    for (const yy of [y + 2.6, y + 4]) K.cyl("lm.glow", MID, sz, 0.55, 0.55, yy, yy + 0.2, hex("#ffd890"), { sides: 12, caps: "none" });
  }
  // the tower's back entrance: a steel canopy, lit underneath
  K.box("lm.Metal032.metal", MID - 3, 4, TZ0 - 1, MID + 3, 4.3, TZ0, hex("#c8ccd0"));
  K.box("lm.glow", MID - 2.6, 3.98, TZ0 - 0.9, MID + 2.6, 4.0, TZ0 - 0.1, hex("#ffe0a8"));
  // ---- the temple: the cella (granite with tall bronze windows), its podium, the steps
  K.box("lm.Marble021", X0, 0, TZ1 - 4 * u, X1, 62 * u, WALLZ, marble, { skip: "-y" });
  for (let y = 10 * u; y < 52 * u; y += 4 * u) for (const x of [X0, X1]) K.box("lm.dark", x - 0.03, y, TZ1 - 4 * u, x + 0.03, y + 0.05, WALLZ, hex("#8a8478"), { skip: "-y+y" });
  if (!c.far)
    for (const [x, nx] of [
      [X0, -1],
      [X1, 1],
    ] as const)
      for (let z = TZ1 + 1 * u; z < WALLZ - 3; z += 7 * u) {
        K.box("lm.Metal032.metal", nx < 0 ? x - 0.25 : x, 14 * u, z, nx < 0 ? x : x + 0.25, 44 * u, z + 3 * u, bronze);
        K.box("lm.glass", nx < 0 ? x - 0.27 : x + 0.02, 15 * u, z + 0.15, nx < 0 ? x - 0.02 : x + 0.27, 43 * u, z + 3 * u - 0.15, hex("#e0b070"));
      }
  K.box("lm.Marble021", X0, 0, WALLZ, X1, POD, PZ1, granite, { skip: "-y" });
  for (let s = 0; s < 7; s++) {
    const z = PZ1 + s * 2 * u;
    K.box("lm.Marble021", X0 + 4 * u, 0, z, X1, POD - (1 + s) * u, z + 2 * u, marble, { skip: "-y" });
  }
  // the lantern blocks either side of the steps
  {
    const x = X0;
    K.box("lm.Marble021", x, 0, PZ1, x + 4 * u, POD + 2 * u, PZ1 + 13 * u, hex("#8a8478"), { skip: "-y" });
    K.box("lm.Marble021", x - 0.33, POD + 2 * u, PZ1 - 0.33, x + 5 * u, POD + 3 * u, PZ1 + 14 * u, marble);
    K.cyl("lm.Metal032.metal", x + 2 * u, PZ1 + 10 * u, 0.25, 0.3, POD + 3 * u, POD + 10 * u, bronze, { sides: 10 });
    K.box("lm.glow.night", x + 0.2, POD + 10 * u, PZ1 + 8 * u + 0.2, x + 4 * u - 0.2, POD + 14 * u, PZ1 + 12 * u - 0.2, hex("#ffd28a"));
    K.box("lm.Metal032.metal", x, POD + 14 * u, PZ1 + 8 * u, x + 4 * u, POD + 14.6 * u, PZ1 + 12 * u, bronze);
  }
  // the window wall behind the columns: bronze frames, warm glass; the five bronze doors
  K.box("lm.Metal032.metal", X0 + 2 * u, POD, WALLZ - 0.33, X1 - 2 * u, 54 * u, WALLZ, bronze, { skip: "+z" });
  K.quad("lm.glass", [X0 + 3 * u, POD + 14 * u, WALLZ + 0.02], [X1 - 3 * u, POD + 14 * u, WALLZ + 0.02], [X1 - 3 * u, 52 * u, WALLZ + 0.02], [X0 + 3 * u, 52 * u, WALLZ + 0.02], [0, 0, 1], (p) => [p[0] * 0.3, p[1] * 0.3], hex("#e8b878"));
  for (let x = X0 + 3 * u; x <= X1 - 3 * u + 0.01; x += 4 * u) K.box("lm.Metal032.metal", x - 0.06, POD + 14 * u, WALLZ, x + 0.06, 52 * u, WALLZ + 0.1, bronze);
  for (let y = POD + 14 * u; y <= 52 * u + 0.01; y += 5 * u) K.box("lm.Metal032.metal", X0 + 3 * u, y - 0.06, WALLZ, X1 - 3 * u, y + 0.06, WALLZ + 0.1, bronze);
  K.box("lm.Marble021", X0 + 2 * u, POD + 13 * u, WALLZ - 0.1, X1 - 2 * u, POD + 14 * u, WALLZ + 0.33, marble);
  const cols = [0, 1, 2, 3, 4, 5].map((i) => X(Math.round(8 + 5 + (i * (mw - 16 - 10)) / 5)) + 0.5 * u);
  for (let i = 0; i < 5; i++) {
    const dx = (cols[i] + cols[i + 1]) / 2;
    const hw = (i === 2 ? 4 : 3) * u;
    K.box("lm.Marble021", dx - hw - 0.33, POD, WALLZ - 0.05, dx + hw + 0.33, POD + 13 * u, WALLZ + 0.1, marble);
    K.box("lm.Metal032.metal", dx - hw, POD, WALLZ + 0.1, dx + hw, POD + 12 * u, WALLZ + 0.22, i % 2 ? hex("#6a4826") : bronze);
    if (!c.far) for (const y of [POD + 4 * u, POD + 8 * u]) K.box("lm.Metal032.metal", dx - hw + 0.2, y, WALLZ + 0.22, dx + hw - 0.2, y + 0.08, WALLZ + 0.27, gold);
    if (i % 2 === 0) K.box("lm.Metal032.metal", dx - 0.04, POD + 0.2, WALLZ + 0.22, dx + 0.04, POD + 12 * u - 0.2, WALLZ + 0.27, hex("#3a2814"));
  }
  // the six columns, the entablature, the frieze with the name, the pediment
  for (const x of cols) column(c, x, CZ + 0.5 * u, POD, 54 * u, 2.85 * u, marble, gold);
  K.box("lm.Marble021", X0 - 0.33, 54 * u, TZ1 - 4 * u, X1 + 0.33, 57 * u, CZ + 5 * u, marble);
  K.box("lm.Marble021", X0 - 0.33, 57 * u, TZ1 - 4 * u, X1 + 0.33, 62 * u, CZ + 5 * u, marble);
  for (let x = X0; x < X1; x += 0.66) K.box("lm.Marble021", x, 61.6 * u, CZ + 5 * u, x + 0.33, 62 * u, CZ + 5 * u + 0.15, hex("#d8d2c6"));
  K.box("lm.Marble021", X0 - 0.66, 62 * u, TZ1 - 4 * u, X1 + 0.66, 63 * u, CZ + 6 * u, marble);
  K.box("lm.Marble021", X0 - 1, 63 * u, TZ1 - 4 * u, X1 + 1, 64 * u, CZ + 7 * u, marble);
  if (!c.far) for (let i = 0; i < 5; i++) K.box("lm.glow.night", cols[i] + 4 * u, 54 * u - 0.05, CZ - 2 * u, cols[i + 1] - 3 * u, 54 * u, CZ + 2 * u, hex("#fff0d8"));
  {
    const half = (X1 - X0) / 2 + 2 * u,
      PH = 18 * u;
    const y0 = 64 * u;
    // the pediment: a triangular prism, its tympanum recessed, the raking cornice proud
    const zf = CZ + 3 * u,
      zb = TZ1 - 4 * u;
    const tri: V2[] = [
      [MID - half, y0],
      [MID + half, y0],
      [MID, y0 + PH],
    ];
    for (const [zz, nz] of [
      [zf, 1],
      [zb, -1],
    ] as const)
      K.tri("lm.Marble021", [tri[0][0], tri[0][1], zz], [tri[1][0], tri[1][1], zz], [tri[2][0], tri[2][1], zz], [0, 0, nz], (p) => [p[0] * 0.4, p[1] * 0.4], marble);
    // the slopes (its roof), copper-green
    for (const [a, b2] of [
      [tri[0], tri[2]],
      [tri[2], tri[1]],
    ]) {
      const ex = b2[0] - a[0],
        ey = b2[1] - a[1];
      const l = Math.hypot(ex, ey);
      const n: V3 = [-ey / l, ex / l, 0];
      if (n[1] < 0) ((n[0] = -n[0]), (n[1] = -n[1]));
      K.quad("lm.Marble021", [a[0], a[1], zf + 1], [b2[0], b2[1], zf + 1], [b2[0], b2[1], zb], [a[0], a[1], zb], n, (p) => [p[0] * 0.3 + p[1] * 0.3, p[2] * 0.3], hex("#d8d2c6"));
      // the raking cornice: a bar along the front edge
      K.bar("lm.Marble021", [a[0], a[1] + 0.25, zf + 0.5], [b2[0], b2[1] + 0.25, zf + 0.5], 0.6, marble);
    }
    K.box("lm.Marble021", MID - half, y0, zf, MID + half, y0 + 0.5, zf + 1, marble);
    // the gold shield with the ⓩ in the tympanum
    if (!c.far) {
      const R = PH * 0.34,
        cy = y0 + PH * 0.38;
      plate(c, "lm.Metal032.metal", circle(MID, cy, R, 32), zf + 0.15, 0.3, gold);
      const zz = zf + 0.33;
      K.bar("lm.dark", [MID - R * 0.5, cy + R * 0.5, zz], [MID + R * 0.5, cy + R * 0.5, zz], R * 0.16, hex("#14121a"));
      K.bar("lm.dark", [MID + R * 0.5, cy + R * 0.5, zz], [MID - R * 0.5, cy - R * 0.5, zz], R * 0.16, hex("#14121a"));
      K.bar("lm.dark", [MID - R * 0.5, cy - R * 0.5, zz], [MID + R * 0.5, cy - R * 0.5, zz], R * 0.16, hex("#14121a"));
      K.bar("lm.dark", [MID, cy + R * 0.5, zz], [MID, cy + R * 0.78, zz], R * 0.14, hex("#14121a"));
      K.bar("lm.dark", [MID, cy - R * 0.5, zz], [MID, cy - R * 0.78, zz], R * 0.14, hex("#14121a"));
      // acroteria: gold palmettes at the apex and corners
      K.sphere("lm.Metal032.metal", MID, y0 + PH + 0.6, zf + 0.3, 0.6, gold);
      for (const x of [MID - half + 0.5, MID + half - 0.5]) K.cyl("lm.Metal032.metal", x, zf + 0.3, 0.35, 0.05, y0, y0 + 1.6, gold, { sides: 8 });
    }
  }
  // the flags on the temple roof corners: tall poles, cloth (gold with the ⓩ, black)
  for (const [x, dir, col] of [
    [X0 + 1 * u, -1, hex("#f4b728")],
    [X1 - 2 * u, 1, hex("#16141a")],
  ] as const) {
    const z = CZ + 3 * u;
    K.cyl("lm.chrome", x, z, 0.1, 0.07, 64 * u, 104 * u, hex("#d8dce0"), { sides: 8 });
    K.sphere("lm.Metal032.metal", x, 104 * u + 0.15, z, 0.18, gold);
    if (!c.far) {
      // the cloth: a few panels in a ripple
      let px = x;
      for (let i = 0; i < 6; i++) {
        const nx = x + dir * (i + 1) * 0.75;
        const dz0 = Math.sin(i * 1.3) * 0.25,
          dz1 = Math.sin((i + 1) * 1.3) * 0.25;
        K.quad("fabric", [px, 92 * u, z + dz0], [nx, 92 * u, z + dz1], [nx, 103 * u, z + dz1], [px, 103 * u, z + dz0], [0, 0, 1], (p) => [p[0] * 0.3, p[1] * 0.3], col);
        K.quad("fabric", [nx, 92 * u, z + dz1], [px, 92 * u, z + dz0], [px, 103 * u, z + dz0], [nx, 103 * u, z + dz1], [0, 0, -1], (p) => [p[0] * 0.3, p[1] * 0.3], col);
        px = nx;
      }
    }
  }
  // security: bollards with gold caps, planters in the opening, the guard booth, the barrier
  const BZ = Z(md - 6) + 0.33;
  for (let x = X(2); x < X(mw - 2); x += 5 * u) {
    if ((x > X(mw / 2 - 8) && x < X(mw / 2 + 6)) || x > X(mw - 8 - 3)) continue;
    K.cyl("lm.Metal032.metal", x + 0.33, BZ, 0.3, 0.3, 0.14, 1.3, hex("#2a2a30"), { sides: 12 });
    K.cyl("lm.Metal032.metal", x + 0.33, BZ, 0.32, 0.26, 1.3, 1.45, gold, { sides: 12 });
    K.cyl("lm.glow.night", x + 0.33, BZ, 0.305, 0.305, 0.8, 0.9, hex("#ffe0a8"), { sides: 12, caps: "none" });
  }
  for (const x of [X(mw / 2 - 6), X(mw / 2 + 2)]) planter(c, x + 0.66, BZ, 1.33, 1.33, hex("#5a5658"), 0.14);
  {
    const gx = X(1),
      gz = PZ1 + 2 * u;
    K.box("lm.Concrete031", gx, 0, gz, gx + 7 * u, 0.33, gz + 8 * u, hex("#5a5658"), { skip: "-y" });
    K.box("lm.Metal032.metal", gx, 0.33, gz, gx + 7 * u, 1.33, gz + 8 * u, hex("#3a3e44"));
    K.box("lm.glass", gx + 0.1, 1.33, gz + 0.1, gx + 7 * u - 0.1, 3.0, gz + 8 * u - 0.1, hex("#9ab8d0"), { skip: "-y+y" });
    lit(c, "lobby", gx + 0.3, gx + 7 * u - 0.3, 1.33, 3.0, gz + 8 * u - 0.15);
    K.box("lm.Metal032.metal", gx - 0.33, 3.0, gz - 0.33, gx + 8 * u, 3.33, gz + 9 * u + 0.33, hex("#c8ccd0"));
    K.box("lm.Metal032.metal", gx, 3.33, gz, gx + 7 * u, 3.5, gz + 9 * u, gold);
    K.sphere("lm.glow", gx + 3.5 * u, 3.6, gz + 4.5 * u, 0.15, hex("#ff2a2a"));
    K.box("lm.Metal032.metal", gx + 8 * u, 0.14, gz + 10 * u, gx + 10 * u, 1.33, gz + 12 * u, hex("#2a2a30"));
    K.box("lm.paint", gx + 10 * u, 1.0, gz + 10.8 * u, gx + 10 * u + 4, 1.12, gz + 11.2 * u, hex("#e83030"));
  }
  // CCTV on brackets
  if (!c.far)
    for (const [x, y, z, d] of [
      [X0, 50 * u, WALLZ + 0.33, 1],
      [X1, 50 * u, WALLZ + 0.33, 1],
    ] as const) {
      K.box("lm.dark", x - 0.05, y, z, x + 0.05, y + 0.08, z + 0.5 * d, hex("#2a2a30"));
      K.box("lm.paint", x - 0.15, y - 0.3, z + 0.4 * d, x + 0.15, y, z + 0.9 * d, hex("#f0f0ec"));
      K.sphere("lm.glow", x, y - 0.15, z + 0.92 * d, 0.05, hex("#ff3048"));
    }
  // the Charging Zebra on its plinth, along the side of the steps
  {
    const ZX = X(mw - 4),
      Z0 = Z(58 - 2);
    K.box("lm.Marble021.gloss", ZX - 4 * u, 0, Z0 - 1 * u, ZX + 4 * u, 0.33, Z0 + 27 * u, hex("#2a2628"));
    K.box("lm.Metal032.metal", ZX - 3 * u, 0.33, Z0, ZX + 3 * u, 5 * u, Z0 + 26 * u, hex("#4a3420"));
    K.box("lm.Metal032.metal", ZX - 4 * u, 5 * u, Z0 - 1 * u, ZX + 4 * u, 6 * u, Z0 + 27 * u, bronze);
    K.box("lm.Metal032.metal", ZX - 1, 0.6, Z0 + 26 * u + 0.01, ZX + 1, 1.3, Z0 + 26 * u + 0.05, gold);
    zebra(c, ZX, 6 * u, Z0 + 13 * u, 7);
  }
  // stone planters with clipped trees by the tower's side entrances; lamp standards at the kerb
  for (const x of [X(1) + 3.5 * u, X(mw - 8) + 3.5 * u]) {
    K.box("lm.Marble021", x - 3.5 * u, 0, Z(30), x + 3.5 * u, 1, Z(38), hex("#8a8478"));
    c.ex.trees.push([x, 1, Z(34), "broad", 3]);
  }
  for (const x of [X(4) + 0.2, X(mw - 8 - 1) + 0.2]) c.ex.props.push(["lamp", x, 0.14, c.D / 2 - 1, 0, "#ffe0a8"]);
});

def("convention", (c) => {
  const { K, X, Z, u } = c;
  const mw = c.b.model.w,
    md = c.b.model.d;
  const BASE = 36 * u,
    WAVE = 14 * u;
  const cx = X(mw / 2);
  const x0 = X(6),
    x1 = X(mw - 6);
  const z0 = Z(4),
    z1 = Z(Math.min(md - 30, 4 + 50));
  const white = hex("#f1f2f3"),
    red = hex("#ff2a3a");
  K.box("lm.PavingStones111", -c.W / 2, 0, -c.D / 2, c.W / 2, 0.14, c.D / 2, hex("#6a6e74"), { skip: "-y" });
  K.box("lm.glow", cx - 0.1, 0.14, z1 + 0.5, cx + 0.1, 0.15, c.D / 2 - 0.6, red);
  // the hall: a long glass box, lit lobby all along, the red LED band, white end walls
  const roofAt = (x: number) => BASE + WAVE * (0.5 + 0.5 * Math.sin(((x - x0) / (x1 - x0)) * Math.PI * 2.2 - 0.6)) ** 1.4;
  const N = c.far ? 16 : 48;
  // the end walls and the back: white panels
  K.box("lm.Concrete034", x0, 0.14, z0, x1, BASE, z0 + 0.5, white, { skip: "-y" });
  for (const [xe, nx] of [
    [x0, -1],
    [x1, 1],
  ] as const) {
    const ye = roofAt(xe);
    K.box("lm.Concrete034", nx < 0 ? xe : xe - 0.5, 0.14, z0, nx < 0 ? xe + 0.5 : xe, ye, z1, white, { skip: "-y" });
  }
  // the front: glass between steel mullions every ~3.3 m, the lobby lit behind it
  lit(c, "lobby", x0 + 0.5, x1 - 0.5, 0.14, 12 * u, z1 - 1.2, Math.round((x1 - x0) / 8));
  for (let i = 0; i < N; i++) {
    const a = x0 + ((x1 - x0) * i) / N,
      b2 = x0 + ((x1 - x0) * (i + 1)) / N;
    const ya = roofAt(a),
      yb = roofAt(b2);
    K.quad("lm.glass", [a, 0.14, z1], [b2, 0.14, z1], [b2, yb, z1], [a, ya, z1], [0, 0, 1], (p) => [p[0] * 0.2, p[1] * 0.2], hex("#b8d0e4"));
    // the roof: a white membrane rolling like a wave, its overhang over the front
    K.quad("lm.Concrete034", [a, ya, z1 + 6 * u], [b2, yb, z1 + 6 * u], [b2, yb, z0], [a, ya, z0], [-(yb - ya) / (b2 - a), 1, 0], (p) => [p[0] * 0.3, p[2] * 0.3], white);
    K.quad("lm.Concrete034", [a, ya - 0.5, z0], [b2, yb - 0.5, z0], [b2, yb - 0.5, z1 + 6 * u], [a, ya - 0.5, z1 + 6 * u], [0, -1, 0], (p) => [p[0] * 0.3, p[2] * 0.3], hex("#d9dcdf"));
    K.quad("lm.Concrete034", [a, ya - 0.5, z1 + 6 * u], [b2, yb - 0.5, z1 + 6 * u], [b2, yb, z1 + 6 * u], [a, ya, z1 + 6 * u], [0, 0, 1], (p) => [p[0] * 0.3, p[1] * 0.3], hex("#d9dcdf"));
    K.quad("lm.Concrete034", [b2, ya - 0.5, z0], [a, ya - 0.5, z0], [a, ya, z0], [b2, yb, z0], [0, 0, -1], (p) => [p[0] * 0.3, p[1] * 0.3], white);
    if (!c.far) K.box("lm.glow", a, ya - 0.62, z1 + 6 * u - 0.1, b2, ya - 0.5, z1 + 6 * u, hex("#ff2a3a", 0.5));
  }
  for (let x = x0; x <= x1 + 0.01; x += 10 * u) K.box("lm.Metal032.metal", x - 0.12, 0.14, z1 - 0.05, x + 0.12, roofAt(x), z1 + 0.2, hex("#8c939b"));
  for (const y of [12 * u, 24 * u]) K.box("lm.Metal032.metal", x0, y - 0.08, z1, x1, y + 0.08, z1 + 0.18, hex("#8c939b"));
  // the LED band across the front (the sign "zkCAR REVEAL" in front of it)
  K.box("lm.dark", x0 + 1, 16 * u, z1 + 0.05, x1 - 1, 23 * u, z1 + 0.25, hex("#2a0a0e"));
  K.box("lm.glow", x0 + 1, 16 * u - 0.1, z1 + 0.25, x1 - 1, 16 * u, z1 + 0.3, red);
  K.box("lm.glow", x0 + 1, 23 * u, z1 + 0.25, x1 - 1, 23 * u + 0.1, z1 + 0.3, red);
  // the vertical banners
  for (const bx of [X(Math.round(mw / 2 - 34)), X(Math.round(mw / 2 + 30))]) {
    K.box("fabric", bx, 6 * u, z1 + 0.3, bx + 4 * u, 30 * u, z1 + 0.4, hex("#c3121f"));
    K.box("lm.Metal032.metal", bx - 0.1, 30 * u, z1 + 0.2, bx + 4 * u + 0.1, 30 * u + 0.15, z1 + 0.5, hex("#8c939b"));
  }
  // the entrance canopy
  K.box("lm.Metal032.metal", cx - 10 * u, 12 * u, z1, cx + 10 * u, 12 * u + 0.3, z1 + 3 * u, hex("#8c939b"));
  K.box("lm.glow.night", cx - 10 * u + 0.2, 12 * u - 0.02, z1 + 0.2, cx + 10 * u - 0.2, 12 * u, z1 + 3 * u - 0.2, hex("#fff4e2"));
  // the zkCar on its turntable, searchlights either side
  {
    const pz = z1 + 16 * u,
      px = X(Math.round(mw / 2 - 52));
    K.cyl("lm.Marble021.gloss", px, pz, 10 * u, 10 * u, 0.14, 0.45, hex("#1b1d22"), { sides: 40 });
    K.cyl("lm.glow", px, pz, 10 * u + 0.02, 10 * u + 0.02, 0.3, 0.4, red, { sides: 40, caps: "none" });
    car(c, px, 0.45, pz, hex("#f4f4f6"), { len: 4.8, wid: 2 });
    for (const sx of [px - 15 * u, px + 15 * u]) {
      K.cyl("lm.dark", sx, pz, 0.5, 0.5, 0.14, 0.8, hex("#2a2c31"), { sides: 12 });
      K.cyl("lm.chrome", sx, pz, 0.35, 0.45, 0.8, 1.5, hex("#c8ccd0"), { sides: 12, caps: "none" });
      K.cyl("lm.glow", sx, pz, 0.42, 0.42, 1.48, 1.5, hex("#dff3ff"), { sides: 12, caps: "top" });
    }
  }
  // trees down the sides, planters and benches at the kerb, lamps
  treeRow(c, X(4), z0 + 3, X(4), z1 - 1, 5, "plane", 0.14);
  treeRow(c, X(mw - 5), z0 + 3, X(mw - 5), z1 - 1, 5, "plane", 0.14);
  planter(c, X(11), c.D / 2 - 3, 4.4, 2, hex("#5a5a60"), 0.14);
  planter(c, X(mw - 11), c.D / 2 - 3, 4.4, 2, hex("#5a5a60"), 0.14);
  c.ex.props.push(["bench", X(23), 0.14, c.D / 2 - 2.6, 0], ["bench", X(mw - 27), 0.14, c.D / 2 - 2.6, 0]);
  for (const x of [X(3), X(mw - 4)]) for (let z = z1; z < c.D / 2 - 1; z += 4) c.ex.props.push(["lamp", x, 0.14, z, x < 0 ? Math.PI / 2 : -Math.PI / 2, "#ffe9d2"]);
});

/** A shopfront facing +z at z, from x0 to x1, h tall: its lit interior, the glass, a frame and a fascia. */
function shopfront(c: LmCtx, x0: number, x1: number, z: number, h: number, cell: string, frame: V3, fascia: V3, y = 0.14) {
  const K = c.K;
  lit(c, cell, x0 + 0.2, x1 - 0.2, y, y + h - 1.1, z - 1.8);
  // the shop's side walls and ceiling behind the glass (a shallow box, so it reads as a room)
  K.box("plaster", x0, y, z - 1.85, x0 + 0.1, y + h - 1.1, z, hex("#e8e0d4"), { skip: "-y" });
  K.box("plaster", x1 - 0.1, y, z - 1.85, x1, y + h - 1.1, z, hex("#e8e0d4"), { skip: "-y" });
  K.box("lm.glow.night", x0, y + h - 1.15, z - 1.85, x1, y + h - 1.1, z, hex("#fff2dc"), { skip: "+y" });
  K.quad("glass", [x0, y, z], [x1, y, z], [x1, y + h - 1.1, z], [x0, y + h - 1.1, z], [0, 0, 1], (p) => [p[0], p[1]], [0.99, 0.55, 0.8]);
  K.box("lm.Metal032.metal", x0 - 0.08, y, z - 0.05, x0 + 0.08, y + h, z + 0.12, frame);
  K.box("lm.Metal032.metal", x1 - 0.08, y, z - 0.05, x1 + 0.08, y + h, z + 0.12, frame);
  K.box("lm.Metal032.metal", (x0 + x1) / 2 - 0.05, y, z, (x0 + x1) / 2 + 0.05, y + h - 1.1, z + 0.08, frame);
  K.box("lm.dark", x0, y + h - 1.1, z - 0.05, x1, y + h, z + 0.2, fascia);
}

def("mall", (c) => {
  const { K, X, Z, u } = c;
  const mw = c.b.model.w,
    md = c.b.model.d;
  const fz = Z(md - 16);
  const bx0 = X(6),
    bx1 = X(mw - 6),
    bz0 = Z(6);
  const gh = 21 * u,
    fh = 15 * u,
    roofY = gh + fh * 4;
  const mid = X(Math.round(mw / 2));
  const ax0 = X(Math.round(mw / 2) - 18),
    ax1 = X(Math.round(mw / 2) + 18);
  const iz0 = fz - 34 * u;
  const clad = hex("#e8e4dc"),
    champagne = hex("#d8d0bc"),
    dark = hex("#2a2830");
  K.box("lm.PavingStones111", -c.W / 2, 0, -c.D / 2, c.W / 2, 0.14, c.D / 2, hex("#d0cac0"), { skip: "-y" });
  // the volume: either side of the atrium, cream stone with floor bands; side walls with windows
  for (const [a, b2] of [
    [bx0, ax0],
    [ax1, bx1],
  ])
    K.box("lm.Concrete034", a, 0.14, bz0, b2, roofY, fz, clad, { skip: "-y" });
  K.box("lm.Concrete034", ax0, gh, bz0, ax1, roofY, iz0, clad, { skip: "-y" });
  for (let f = 1; f <= 4; f++) {
    const y = gh + (f - 1) * fh;
    K.box("lm.Marble021", bx0 - 0.33, y - 0.33, bz0 - 0.33, ax0, y + 0.33, fz + 0.33, hex("#c8c2b6"));
    K.box("lm.Marble021", ax1, y - 0.33, bz0 - 0.33, bx1 + 0.33, y + 0.33, fz + 0.33, hex("#c8c2b6"));
  }
  // windows down the sides (long ribbons of dark glass)
  if (!c.far)
    for (const [sx, nx] of [
      [bx0, -1],
      [bx1, 1],
    ] as const)
      for (let f = 0; f < 4; f++) {
        const y = gh + f * fh + 1;
        K.box("lm.glass", nx < 0 ? sx - 0.05 : sx, y, bz0 + 2, nx < 0 ? sx : sx + 0.05, y + fh - 2, fz - 4, hex("#5a7a96"));
      }
  // the upper facade: champagne fins, the two LED screen frames (the left one shows the live layer)
  if (!c.far)
    for (let x = bx0 + 1; x < bx1 - 1; x += 4 * u) {
      if (x >= ax0 - 0.33 && x <= ax1) continue;
      K.box("lm.Metal032.metal", x - 0.08, gh + 0.66, fz, x + 0.08, roofY, fz + 0.25, champagne);
    }
  const scr = (x0: number, x1: number) => {
    const y0 = gh + 6 * u,
      y1 = roofY - 3 * u;
    K.box("lm.dark", x0 - 0.66, y0 - 0.66, fz, x1 + 0.66, y1 + 0.66, fz + 0.62, dark);
    K.box("lm.dark", x0, y0, fz + 0.62, x1, y1, fz + 0.66, hex("#0e0e14"), { skip: "-z" });
    K.box("lm.dark", x0 - 0.66, y0 - 1, fz, x1 + 0.66, y0 - 0.66, fz + 1.3, hex("#4a4650"));
    K.box("lm.glow", x0 - 0.66, y0 - 1, fz + 1.3, x1 + 0.66, y0 - 0.66, fz + 1.35, hex("#ff4ab8"));
    K.box("lm.glow", x0 - 0.66, y1 + 0.66, fz, x1 + 0.66, y1 + 1, fz + 1, hex("#3ef0ff"));
    return { y0, y1 };
  };
  scr(bx0 + 8 * u, ax0 - 8 * u);
  {
    // the right screen: the ⓩ disc in gold light
    const x0 = ax1 + 8 * u,
      x1 = bx1 - 8 * u;
    const { y0, y1 } = scr(x0, x1);
    const cxs = (x0 + x1) / 2,
      cys = (y0 + y1) / 2,
      R = Math.min(x1 - x0, y1 - y0) / 2 - 1;
    K.box("lm.glow", x0, y0, fz + 0.66, x1, y1, fz + 0.68, hex("#3a3020"));
    plate(c, "lm.glow", circle(cxs, cys, R, 40), fz + 0.75, 0.1, hex("#f4b728"));
    const zz = fz + 0.85;
    K.bar("lm.dark", [cxs - R * 0.42, cys + R * 0.42, zz], [cxs + R * 0.42, cys + R * 0.42, zz], R * 0.2, hex("#14121a"));
    K.bar("lm.dark", [cxs + R * 0.42, cys + R * 0.42, zz], [cxs - R * 0.42, cys - R * 0.42, zz], R * 0.2, hex("#14121a"));
    K.bar("lm.dark", [cxs - R * 0.42, cys - R * 0.42, zz], [cxs + R * 0.42, cys - R * 0.42, zz], R * 0.2, hex("#14121a"));
    K.bar("lm.dark", [cxs, cys + R * 0.42, zz], [cxs, cys + R * 0.75, zz], R * 0.14, hex("#14121a"));
    K.bar("lm.dark", [cxs, cys - R * 0.42, zz], [cxs, cys - R * 0.75, zz], R * 0.14, hex("#14121a"));
  }
  // level 1: six shops either side of the portal
  const cells = ["boutique", "boutique", "florist", "konbini", "market", "cafe"];
  const fascias = ["#f4e6c8", "#ff7a3a", "#ff8ac8", "#5ac8ff", "#7aff6a", "#ffc070"];
  const span = (a: number, b2: number, n: number) => Array.from({ length: n }, (_, i) => [X(Math.round(a + ((b2 - a) * i) / n)), X(Math.round(a + ((b2 - a) * (i + 1)) / n))]);
  const slots = [...span(6 + 2, Math.round(mw / 2) - 18 - 2, 3), ...span(Math.round(mw / 2) + 18 + 2, mw - 6 - 2, 3)];
  slots.forEach(([a, b2], i) => {
    shopfront(c, a, b2, fz + 0.02, gh - 0.14, cells[i], hex("#8a8478"), hex("#1a1820"));
    if (!c.far) K.box("lm.glow", a + 0.2, gh - 1.1 * u - 0.1, fz + 0.2, b2 - 0.2, gh - 1.1 * u, fz + 0.25, hex(fascias[i], 0.6));
  });
  for (const [a, b2] of [
    [bx0, X(6 + 2)],
    [X(Math.round(mw / 2) - 18 - 2), ax0],
    [ax1, X(Math.round(mw / 2) + 18 + 2)],
    [X(mw - 6 - 2), bx1],
  ])
    K.box("lm.Marble021", a, 0.14, fz - 0.33, b2, gh, fz + 0.33, hex("#8a8478"));
  // the atrium: an open portal three storeys tall; at its back the lit shop levels, glass balustrades
  K.box("lm.Marble021.gloss", ax0, 0.14, iz0, ax1, 0.16, fz, hex("#e8e2d6"));
  for (let lv = 0; lv < 5; lv++) {
    const y0 = lv === 0 ? 0.16 : gh + (lv - 1) * fh + 0.66,
      y1 = lv === 0 ? gh - 2 : gh + lv * fh - 1.2;
    lit(c, ["boutique", "cafe", "florist", "market", "bar"][lv], ax0 + 0.3, ax1 - 0.3, y0, y1, iz0 + 0.02, 4);
    if (lv > 0) {
      // the gallery slab and its glass balustrade, along the back
      K.box("lm.Concrete034", ax0, y0 - 0.66, iz0, ax1, y0, iz0 + 2.4, hex("#e8e4dc"));
      K.box("lm.glass", ax0, y0, iz0 + 2.35, ax1, y0 + 1.05, iz0 + 2.4, hex("#c8d8e0"), { skip: "-y" });
      K.box("lm.chrome", ax0, y0 + 1.05, iz0 + 2.33, ax1, y0 + 1.1, iz0 + 2.42, hex("#d8dce0"));
    }
  }
  // the criss-crossing escalators (inclined bands with glass sides)
  if (!c.far)
    for (let lv = 0; lv < 2; lv++) {
      const yA = lv === 0 ? 0.16 : gh + 0.66,
        yB = gh + (lv === 0 ? 0 : 1) * fh + 0.66;
      const xa = lv % 2 ? ax0 + 3 : ax1 - 5,
        xb = xa + 2;
      const zA = fz - 4 - lv * 3,
        zB = iz0 + 2.4;
      K.quad("lm.Metal032.metal", [xa, yA, zA], [xb, yA, zA], [xb, yB, zB], [xa, yB, zB], [0, (zA - zB) / Math.hypot(zA - zB, yB - yA), (yB - yA) / Math.hypot(zA - zB, yB - yA)], (p) => [p[0], p[2]], hex("#6a6e74"));
      for (const xx of [xa, xb]) K.quad("lm.glass", [xx, yA, zA], [xx, yB, zB], [xx, yB + 1, zB], [xx, yA + 1, zA], [1, 0, 0], (p) => [p[2], p[1]], hex("#c8d8e0"));
    }
  // the atrium's frame and its banners
  K.box("lm.Metal032.metal", ax0 - 0.33, 0.14, fz - 0.33, ax0, roofY, fz + 0.33, champagne);
  K.box("lm.Metal032.metal", ax1, 0.14, fz - 0.33, ax1 + 0.33, roofY, fz + 0.33, champagne);
  for (const bx of [ax0 + 4, ax1 - 5]) K.box("fabric", bx, gh + 2, fz - 3, bx + 1.2, roofY - 4, fz - 2.95, hex(bx < mid ? "#f4b728" : "#ff4ab8"));
  // the roof: parapet, the name plinth, the glass barrel vault over the atrium
  K.box("lm.Concrete034", bx0, roofY, bz0, bx1, roofY + 0.33, fz, hex("#5a5664"), { skip: "-y" });
  K.box("lm.Concrete034", bx0, roofY, fz - 0.66, bx1, roofY + 1.33, fz, clad);
  for (const [a, b2, cz0, cz1] of [
    [bx0, bx0 + 0.33, bz0, fz],
    [bx1 - 0.33, bx1, bz0, fz],
    [bx0, bx1, bz0, bz0 + 0.33],
  ])
    K.box("lm.Concrete034", a, roofY, cz0, b2, roofY + 1, cz1, clad);
  K.box("lm.glow", bx0 - 0.33, roofY + 1.33, fz - 0.33, bx1 + 0.33, roofY + 1.66, fz + 0.33, hex("#f4b728"));
  {
    const R = (ax1 - ax0) / 2 + 0.66;
    // (the vault: a half cylinder along z — written as the hcyl's rings turned: quads in x–y)
    const n = c.far ? 8 : 20;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI,
        b2 = ((i + 1) / n) * Math.PI;
      const P = (aa: number, zz: number): V3 => [mid + Math.cos(aa) * R, roofY + Math.sin(aa) * R * 0.87, zz];
      const nn: V3 = [Math.cos((a + b2) / 2), Math.sin((a + b2) / 2), 0];
      K.quad("lm.glass", P(b2, iz0 - 0.66), P(a, iz0 - 0.66), P(a, fz - 1.33), P(b2, fz - 1.33), nn, (p) => [p[2] * 0.2, p[1] * 0.2], hex("#d8eef8"));
      if (!c.far && i % 2 === 0) K.bar("lm.chrome", P(a, iz0 - 0.66), P(a, fz - 1.33), 0.1, hex("#c8ccd0"));
    }
    if (!c.far)
      for (let z = iz0 - 0.66; z <= fz - 1.33; z += 2) {
        let prev = [mid + R, roofY, z] as V3;
        for (let i = 1; i <= n; i++) {
          const aa = (i / n) * Math.PI;
          const p: V3 = [mid + Math.cos(aa) * R, roofY + Math.sin(aa) * R * 0.87, z];
          K.bar("lm.chrome", prev, p, 0.1, hex("#c8ccd0"));
          prev = p;
        }
      }
    // the vault's end wall at the front, glass
    const pts: V2[] = [];
    for (let i = 0; i <= n; i++) pts.push([mid + Math.cos((i / n) * Math.PI) * R, roofY + Math.sin((i / n) * Math.PI) * R * 0.87]);
    for (let i = 0; i < n; i++) K.tri("lm.glass", [mid, roofY, fz - 1.33], [pts[i][0], pts[i][1], fz - 1.33], [pts[i + 1][0], pts[i + 1][1], fz - 1.33], [0, 0, 1], (p) => [p[0] * 0.2, p[1] * 0.2], hex("#d8eef8"));
  }
  // roof-deck parking on the left (cars), its ramp; the cinema on the right
  if (!c.far) {
    const cols = ["#c03030", "#e8e8ea", "#2a2a30", "#3a6aa8", "#f4b728", "#7a8a90"];
    let i = 0;
    for (let x = bx0 + 2.4; x < ax0 - 4; x += 2.8) car(c, x, roofY + 0.33, bz0 + 4.6, hex(cols[i++ % cols.length]), { len: 4.2, wid: 1.8 });
    for (let x = bx0 + 1; x < ax0 - 3; x += 2.8) K.box("lm.paint", x, roofY + 0.34, bz0 + 2, x + 0.1, roofY + 0.35, bz0 + 7.4, hex("#e8e4d8"));
  }
  {
    const cx0 = ax1 + 8 * u,
      cx1 = bx1 - 2;
    const cz1 = bz0 + 40 * u;
    K.box("lm.Concrete034", cx0, roofY + 0.33, bz0 + 4 * u, cx1, roofY + 0.33 + 22 * u, cz1, hex("#2a2632"));
    if (!c.far) for (let x = cx0; x < cx1; x += 0.66) K.box("lm.dark", x, roofY + 0.33, cz1, x + 0.33, roofY + 0.33 + 22 * u, cz1 + 0.12, hex("#3a3644"));
    const cb0 = cx0 + 6 * u,
      cb1 = cx1 - 6 * u;
    K.box("lm.paint", cb0 - 0.33, roofY + 0.33 + 7 * u, cz1, cb1 + 0.33, roofY + 0.33 + 19 * u, cz1 + 0.66, hex("#7a1a2a"));
    K.box("lm.dark", cb0, roofY + 0.33 + 8 * u, cz1 + 0.66, cb1, roofY + 0.33 + 18 * u, cz1 + 0.7, hex("#14121a"));
    if (!c.far)
      for (let x = cb0; x <= cb1; x += 0.66)
        for (const y of [roofY + 0.33 + 6.5 * u, roofY + 0.33 + 19.4 * u]) K.sphere("lm.glow", x, y, cz1 + 0.7, 0.09, hex("#ffe08a"), { segs: 4 });
    // the roof garden in front of it
    K.box("lm.Grass004", cx0, roofY + 0.33, cz1 + 3, cx1, roofY + 0.5, fz - 2, hex("#6a8a4a"));
    for (let x = cx0 + 1.5; x < cx1 - 1; x += 3.2) c.ex.trees.push([x, roofY + 0.5, (cz1 + fz) / 2 + 0.5, "broad", Math.floor(x * 3)]);
  }
  // the crown at the back of the roof: a giant LED wall on a steel truss, the name over it
  {
    const zb = bz0 + 0.33;
    const x0 = mid - 28 * u,
      x1 = mid + 28 * u,
      y0 = roofY + 16 * u,
      y1 = y0 + 49 * u;
    for (const lx of [x0 - 6 * u, x0 + 18 * u, x1 - 20 * u, x1 + 4 * u]) K.box("lm.Metal032.metal", lx, roofY, zb, lx + 0.66, y1 + 22 * u, zb + 0.66, dark);
    if (!c.far)
      for (const [a, b2] of [
        [x0 - 4 * u, x1 + 4 * u],
        [x1 + 4 * u, x0 - 4 * u],
      ])
        K.bar("lm.Metal032.metal", [a, roofY + 0.66, zb + 0.33], [b2, y0 - 1.33, zb + 0.33], 0.25, dark);
    K.box("lm.dark", x0 - 2 * u, y0 - 4 * u, zb - 0.33, x1 + 2 * u, y0 - 2 * u, zb + 1.33, hex("#3a3742"));
    K.box("lm.glow", x0 - 2 * u, y0 - 3 * u, zb + 1.33, x1 + 2 * u, y0 - 2 * u, zb + 1.36, hex("#ff4ab8"));
    K.box("lm.dark", x0 - 0.66, y0 - 0.66, zb, x1 + 0.66, y1 + 0.66, zb + 0.62, dark);
    K.box("lm.dark", x0, y0, zb + 0.62, x1, y1, zb + 0.66, hex("#0e0e14"));
    K.box("lm.glow", x0 - 0.66, y1 + 0.66, zb, x1 + 0.66, y1 + 1, zb + 1, hex("#3ef0ff"));
    const n0 = x0 - 8 * u,
      n1 = x1 + 8 * u,
      ny0 = y1 + 5 * u,
      ny1 = ny0 + 20 * u;
    K.box("lm.dark", n0, ny0, zb, n1, ny1, zb + 0.66, hex("#14121a"));
    for (const [a, b2, cc, d] of [
      [n0 - 0.33, ny0 - 0.33, n1 + 0.33, ny0],
      [n0 - 0.33, ny1, n1 + 0.33, ny1 + 0.33],
      [n0 - 0.33, ny0, n0, ny1],
      [n1, ny0, n1 + 0.33, ny1],
    ])
      K.box("lm.glow", a, b2, zb, cc, d, zb + 1, hex("#f4b728"));
    for (const lx of [x0 - 6 * u, x1 + 4 * u]) K.sphere("lm.glow", lx + 0.33, y1 + 22 * u + 0.3, zb + 0.33, 0.3, hex("#ff3040"));
  }
  // the taxi drop-off canopy over the pavement in front of the portal
  {
    const tx0 = ax0 - 10 * u,
      tx1 = ax1 + 10 * u,
      ty = gh - 2 * u;
    const zf = c.D / 2 - 0.66;
    K.box("lm.Concrete034", tx0, ty, fz, tx1, ty + 0.66, zf, hex("#eceae4"));
    K.box("lm.Metal032.metal", tx0, ty + 0.66, fz, tx1, ty + 1, zf, hex("#c8c4bc"));
    K.box("lm.glow", tx0, ty - 0.33, zf - 0.33, tx1, ty, zf, hex("#3ef0ff"));
    if (!c.far) for (let x = tx0 + 1; x < tx1 - 0.66; x += 1.66) for (let z = fz + 1; z < zf - 1.2; z += 1.66) K.cyl("lm.glow.night", x, z, 0.15, 0.15, ty - 0.02, ty, hex("#fff4d8"), { sides: 8, caps: "none" });
    for (const x of [tx0 + 0.5, tx1 - 0.5]) K.cyl("lm.chrome", x, zf - 0.9, 0.16, 0.16, 0.14, ty, hex("#9aa0aa"), { sides: 10 });
    K.box("lm.paint", tx0 + 4 * u, 0.14, c.D / 2 - 0.66, tx1 - 4 * u, 0.16, c.D / 2, hex("#e0c040"));
    K.cyl("lm.dark", tx1 - 7.5 * u, c.D / 2 - 1.1, 0.06, 0.06, 0.14, 4.7, hex("#3a3742"), { sides: 8 });
    K.box("lm.glow", tx1 - 10 * u, 4.7, c.D / 2 - 1.25, tx1 - 5 * u, 5.7, c.D / 2 - 1.05, hex("#ffd23a"));
    // a rope line (posts, a red cord)
    if (!c.far) for (let z = fz + 1; z < c.D / 2 - 2; z += 0.66) K.cyl("lm.Metal032.metal", tx1 - 13.5 * u, z, 0.05, 0.05, 0.14, 1.2, hex("#c8a860"), { sides: 6 });
    K.box("fabric", tx1 - 13.5 * u - 0.03, 1.1, fz + 1, tx1 - 13.5 * u + 0.03, 1.16, c.D / 2 - 2, hex("#8a2228"));
  }
  // planters with trees, lamps, benches along the pavement
  for (const x of [X(6 + 4), X(Math.round(mw / 2) - 28 - 22), X(Math.round(mw / 2) + 28 + 14), X(mw - 6 - 18)]) {
    planter(c, x + 1.33, c.D / 2 - 2, 2.66, 1.33, hex("#6a6672"), 0.14);
    c.ex.trees.push([x + 1.33, 0.75, c.D / 2 - 2, "broad", Math.floor(x)]);
  }
  for (const x of [ax0 - 12 * u, ax1 + 4 * u]) c.ex.props.push(["lamp", x, 0.14, c.D / 2 - 1.3, 0, "#ffd08a"]);
  c.ex.props.push(["bench", ax0 - 26 * u, 0.14, c.D / 2 - 2.3, 0], ["bench", ax1 + 24 * u, 0.14, c.D / 2 - 2.3, 0]);
});

/** A glass hemisphere with ribs (and rings) at (cx, y, cz), radius R; `s`: its glass slot and tint. */
function glassDome(c: LmCtx, cx: number, y: number, cz: number, R: number, glass: V3, rib: V3, o: { ribs?: number; rings?: number; sy?: number } = {}) {
  const K = c.K;
  const sy = o.sy ?? 1;
  K.sphere("lm.glass", cx, y, cz, R, glass, { hemi: true, segs: c.far ? 12 : 28, sy });
  if (c.far) return;
  const ribs = o.ribs ?? 12,
    rings = o.rings ?? 3;
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2;
    let prev: V3 | null = null;
    for (let j = 0; j <= 10; j++) {
      const t = (j / 10) * (Math.PI / 2);
      const p: V3 = [cx + Math.cos(a) * Math.cos(t) * (R + 0.04), y + Math.sin(t) * (R + 0.04) * sy, cz + Math.sin(a) * Math.cos(t) * (R + 0.04)];
      if (prev) K.bar("lm.Metal032.metal", prev, p, 0.12, rib);
      prev = p;
    }
  }
  for (let j = 1; j <= rings; j++) {
    const t = (j / (rings + 1)) * (Math.PI / 2);
    const rr = Math.cos(t) * (R + 0.05),
      yy = y + Math.sin(t) * (R + 0.05) * sy;
    K.cyl("lm.Metal032.metal", cx, cz, rr, rr, yy - 0.06, yy + 0.06, rib, { sides: 32, caps: "none" });
  }
}

def("zsalab", (c) => {
  const { K, X, Z, u } = c;
  const mw = c.b.model.w,
    md = c.b.model.d;
  const TOP = 62 * u,
    R = 20 * u;
  const cx = X(mw / 2);
  const HW = Math.min(27, mw / 2 - 6) * u;
  const z0 = Z(8),
    z1 = Z(Math.min(md - 26, 8 + 52));
  const cz = (z0 + z1) / 2;
  const white = hex("#eef1f2"),
    gold = hex("#c9a24a"),
    teal = hex("#3ef0c8");
  K.box("lm.PavingStones111", -c.W / 2, 0, -c.D / 2, c.W / 2, 0.14, c.D / 2, hex("#d9dcdc"), { skip: "-y" });
  K.box("lm.glow", cx - 0.1, 0.14, z1 + 0.5, cx + 0.1, 0.15, c.D / 2 - 0.6, teal);
  // the lab: teal glass curtain wall in a white frame, gold mullions, the ground floor lit and open to view
  const FH = 15 * u;
  K.box("lm.glass", cx - HW, FH, z0, cx + HW, TOP, z1, hex("#46b8b0"), { skip: "-y" });
  K.box("lm.Concrete034", cx - HW, 0.14, z0, cx + HW, FH, z1 - 1.6, white, { skip: "-y" });
  lit(c, "lobby", cx - HW + 0.5, cx + HW - 0.5, 0.14, FH - 0.66, z1 - 1.58, 4);
  K.quad("glass", [cx - HW, 0.14, z1], [cx + HW, 0.14, z1], [cx + HW, FH - 0.66, z1], [cx - HW, FH - 0.66, z1], [0, 0, 1], (p) => [p[0], p[1]], [0.99, 0.45, 0.85]);
  for (const sx of [-1, 1]) K.box("lm.glass", sx < 0 ? cx - HW : cx + HW - 0.05, 0.14, z1 - 1.6, sx < 0 ? cx - HW + 0.05 : cx + HW, FH, z1, hex("#46b8b0"));
  for (let y = FH; y < TOP; y += FH) K.box("lm.Concrete034", cx - HW - 0.12, y - 0.66, z0 - 0.12, cx + HW + 0.12, y, z1 + 0.12, white, { skip: "-y" });
  if (!c.far) {
    for (let x = cx - HW; x <= cx + HW + 0.01; x += 3) for (const [zf, d] of [[z1, 1], [z0, -1]] as const) K.box("lm.Metal032.metal", x - 0.07, 0.14, d > 0 ? zf : zf - 0.15, x + 0.07, TOP, d > 0 ? zf + 0.15 : zf, gold);
    for (let z = z0; z <= z1 + 0.01; z += 3) for (const [xf, d] of [[cx + HW, 1], [cx - HW, -1]] as const) K.box("lm.Metal032.metal", d > 0 ? xf : xf - 0.15, FH, z - 0.07, d > 0 ? xf + 0.15 : xf, TOP, z + 0.07, gold);
    // the mint counters behind the glass
    for (let x = cx - HW + 3; x < cx + HW - 3; x += 5) {
      K.box("lm.Marble021.gloss", x, 0.14, z1 - 3.4, x + 3, 1.2, z1 - 2.6, hex("#f4f4f2"));
      K.box("lm.glow", x + 0.2, 1.2, z1 - 3.3, x + 2.8, 1.22, z1 - 2.7, teal);
    }
  }
  for (const [a, b2] of [
    [cx - HW - 0.2, cx - HW + 0.4],
    [cx + HW - 0.4, cx + HW + 0.2],
  ])
    for (const [zz0, zz1] of [
      [z0 - 0.2, z0 + 0.4],
      [z1 - 0.4, z1 + 0.2],
    ])
      K.box("lm.Concrete034", a, 0.14, zz0, b2, TOP, zz1, white);
  // the roof: white deck, teal parapet line, the glass dome over the mint reactor with its golden core
  K.box("lm.Concrete034", cx - HW - 0.12, TOP, z0 - 0.12, cx + HW + 0.12, TOP + 0.33, z1 + 0.12, white);
  K.box("lm.glow", cx - HW - 0.12, TOP + 0.33, z0 - 0.12, cx + HW + 0.12, TOP + 0.45, z1 + 0.12, hex("#3ef0c8", 0.6), { skip: "-y+y" });
  K.cyl("lm.Concrete034", cx, cz, R + 0.3, R + 0.3, TOP + 0.33, TOP + 0.9, white, { sides: 40 });
  glassDome(c, cx, TOP + 0.9, cz, R, hex("#bff2ea"), gold, { ribs: 12, rings: 3 });
  K.sphere("lm.glow", cx, TOP + 2.6, cz, 1.2, hex("#f4b728"));
  K.cyl("lm.chrome", cx, cz, 0.35, 0.35, TOP + 0.9, TOP + 1.6, hex("#c8ccd0"), { sides: 12 });
  // the entrance: a white canopy edged in teal on gold posts
  const c0 = X(Math.round(mw / 2 - 14)),
    c1 = X(Math.round(mw / 2 + 14));
  const cz1 = Z(Math.min(md - 12, Math.min(md - 26, 8 + 52) + 12));
  K.box("lm.Concrete034", c0, 13 * u, z1, c1, 15 * u, cz1, white);
  K.box("lm.glow", c0, 13 * u - 0.12, cz1 - 0.3, c1, 13 * u, cz1, teal);
  K.box("lm.glow.night", c0 + 0.3, 13 * u - 0.02, z1 + 0.3, c1 - 0.3, 13 * u, cz1 - 0.4, hex("#eafff9"));
  for (const x of [c0 + 0.5, c1 - 0.5]) K.cyl("lm.Metal032.metal", x, cz1 - 0.85, 0.15, 0.15, 0.14, 13 * u, gold, { sides: 10 });
  treeRow(c, X(5), z0 + 3, X(5), z1 - 1, 5, "plane", 0.14);
  treeRow(c, X(mw - 6), z0 + 3, X(mw - 6), z1 - 1, 5, "plane", 0.14);
  planter(c, X(9), c.D / 2 - 3, 3.6, 2, hex("#9aa0a2"), 0.14);
  planter(c, X(mw - 9), c.D / 2 - 3, 3.6, 2, hex("#9aa0a2"), 0.14);
  c.ex.props.push(["bench", X(18), 0.14, c.D / 2 - 2.6, 0], ["bench", X(mw - 21), 0.14, c.D / 2 - 2.6, 0]);
  for (const x of [X(3), X(mw - 4)]) for (let z = z1; z < c.D / 2 - 1; z += 4) c.ex.props.push(["lamp", x, 0.14, z, x < 0 ? Math.PI / 2 : -Math.PI / 2, "#c8fff0"]);
});

// ---- ZK University (a Main Quad in sandstone and red tile), the Game House, the hawker centre ----------------------

/** A hip roof over [x0, x1] × [z0, z1] from y0 (ridge along the longer side), `pitch` rise per metre. */
function hipRoof(c: LmCtx, s: Slot, x0: number, z0: number, x1: number, z1: number, y0: number, pitch: number, col: V3, eave = 0.4) {
  const K = c.K;
  x0 -= eave;
  z0 -= eave;
  x1 += eave;
  z1 += eave;
  const hx = (x1 - x0) / 2,
    hz = (z1 - z0) / 2;
  const r = Math.min(hx, hz);
  const yt = y0 + r * pitch;
  const cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2;
  // the ridge's ends
  const a: V3 = hx >= hz ? [x0 + r, yt, cz] : [cx, yt, z0 + r];
  const b: V3 = hx >= hz ? [x1 - r, yt, cz] : [cx, yt, z1 - r];
  const P = (x: number, z: number): V3 => [x, y0, z];
  const uv = (p: V3): [number, number] => [(p[0] + p[2]) / 2, p[1] * 1.4];
  const n = (nx: number, nz: number): V3 => {
    const l = Math.hypot(nx, pitch === 0 ? 1 : 1 / pitch, nz);
    return [nx / l, 1 / pitch / l, nz / l];
  };
  if (hx >= hz) {
    K.quad(s, P(x0, z1), P(x1, z1), b, a, n(0, 1), (p) => [p[0] / 2, (z1 - p[2]) * 0.7], col);
    K.quad(s, P(x1, z0), P(x0, z0), a, b, n(0, -1), (p) => [p[0] / 2, (p[2] - z0) * 0.7], col);
    K.tri(s, P(x1, z1), P(x1, z0), b, n(1, 0), (p) => [p[2] / 2, (x1 - p[0]) * 0.7], col);
    K.tri(s, P(x0, z0), P(x0, z1), a, n(-1, 0), (p) => [p[2] / 2, (p[0] - x0) * 0.7], col);
  } else {
    K.quad(s, P(x1, z1), P(x1, z0), a, b, n(1, 0), (p) => [p[2] / 2, (x1 - p[0]) * 0.7], col);
    K.quad(s, P(x0, z0), P(x0, z1), b, a, n(-1, 0), (p) => [p[2] / 2, (p[0] - x0) * 0.7], col);
    K.tri(s, P(x0, z1), P(x1, z1), b, n(0, 1), (p) => [p[0] / 2, (z1 - p[2]) * 0.7], col);
    K.tri(s, P(x1, z0), P(x0, z0), a, n(0, -1), (p) => [p[0] / 2, (p[2] - z0) * 0.7], col);
  }
  void uv;
  // the soffit under the eaves
  K.quad(s, P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1), [0, -1, 0], (p) => [p[0] / 2, p[2] / 2], hex("#6a5440"));
}

/** A gable roof over [x0, x1] × [z0, z1] from y0; ridge along z (`alongZ`) or x; the gable ends in `wall`. */
function gableRoof(c: LmCtx, s: Slot, x0: number, z0: number, x1: number, z1: number, y0: number, alongZ: boolean, pitch: number, col: V3, wall: { s: Slot; col: V3 }, eave = 0.4) {
  const K = c.K;
  const span = alongZ ? x1 - x0 : z1 - z0;
  const yt = y0 + (span / 2) * pitch;
  const l = Math.hypot(1, pitch);
  if (alongZ) {
    const cx = (x0 + x1) / 2;
    K.quad(s, [x1 + eave, y0 - eave * pitch, z1 + eave], [x1 + eave, y0 - eave * pitch, z0 - eave], [cx, yt, z0 - eave], [cx, yt, z1 + eave], [pitch / l, 1 / l, 0], (p) => [p[2] / 2, (x1 - p[0]) * 0.7], col);
    K.quad(s, [x0 - eave, y0 - eave * pitch, z0 - eave], [x0 - eave, y0 - eave * pitch, z1 + eave], [cx, yt, z1 + eave], [cx, yt, z0 - eave], [-pitch / l, 1 / l, 0], (p) => [p[2] / 2, (p[0] - x0) * 0.7], col);
    for (const [z, nz] of [
      [z1, 1],
      [z0, -1],
    ] as const)
      K.tri(wall.s, [nz > 0 ? x0 : x1, y0, z], [nz > 0 ? x1 : x0, y0, z], [cx, yt, z], [0, 0, nz], (p) => [p[0] * 0.4, p[1] * 0.4], wall.col);
  } else {
    const cz = (z0 + z1) / 2;
    K.quad(s, [x0 - eave, y0 - eave * pitch, z1 + eave], [x1 + eave, y0 - eave * pitch, z1 + eave], [x1 + eave, yt, cz], [x0 - eave, yt, cz], [0, 1 / l, pitch / l], (p) => [p[0] / 2, (z1 - p[2]) * 0.7], col);
    K.quad(s, [x1 + eave, y0 - eave * pitch, z0 - eave], [x0 - eave, y0 - eave * pitch, z0 - eave], [x0 - eave, yt, cz], [x1 + eave, yt, cz], [0, 1 / l, -pitch / l], (p) => [p[0] / 2, (p[2] - z0) * 0.7], col);
    for (const [x, nx] of [
      [x1, 1],
      [x0, -1],
    ] as const)
      K.tri(wall.s, [x, y0, nx > 0 ? z1 : z0], [x, y0, nx > 0 ? z0 : z1], [x, yt, cz], [nx, 0, 0], (p) => [p[2] * 0.4, p[1] * 0.4], wall.col);
  }
  return yt;
}

/**
 * Round-arched openings along a wall face: the face at `f` (z when alongX, else x) facing `dir`,
 * from a0 to a1, n bays, piers `pier` wide, arches springing at `spring` with crowns at `top`; the
 * wall above up to y1, its depth `t`. The openings stay open (walk-through arcades).
 */
function arcadeWall(c: LmCtx, s: Slot, alongX: boolean, f: number, dir: 1 | -1, a0: number, a1: number, n: number, pier: number, spring: number, y1: number, t: number, col: V3, y0 = 0.14) {
  const K = c.K;
  const bw = (a1 - a0) / n;
  const r = (bw - pier) / 2;
  const P = (a: number, y: number, d: number): V3 => (alongX ? [a, y, f + d] : [f + d, y, a]);
  const N: V3 = alongX ? [0, 0, dir] : [dir, 0, 0];
  const NB: V3 = alongX ? [0, 0, -dir] : [-dir, 0, 0];
  const uv = (p: V3): [number, number] => [(alongX ? p[0] : p[2]) * 0.4, p[1] * 0.4];
  const segs = c.far ? 4 : 8;
  for (let i = 0; i <= n; i++) {
    // the piers
    const a = a0 + i * bw;
    const p0 = Math.max(a0, a - pier / 2),
      p1 = Math.min(a1, a + pier / 2);
    if (alongX) K.box(s, p0, y0, Math.min(f, f - dir * t), p1, spring, Math.max(f, f - dir * t), col);
    else K.box(s, Math.min(f, f - dir * t), y0, p0, Math.max(f, f - dir * t), spring, p1, col);
  }
  for (let i = 0; i < n; i++) {
    const ac = a0 + (i + 0.5) * bw;
    // the spandrel: from the arch's curve up to y1, front and back faces; the soffit of the arch
    for (let j = 0; j < segs; j++) {
      const t0 = Math.PI - (j / segs) * Math.PI,
        t1 = Math.PI - ((j + 1) / segs) * Math.PI;
      const ax0 = ac + Math.cos(t0) * r,
        ay0 = spring + Math.sin(t0) * r,
        ax1 = ac + Math.cos(t1) * r,
        ay1 = spring + Math.sin(t1) * r;
      const ex0 = ac - bw / 2 + (bw * j) / segs,
        ex1 = ac - bw / 2 + (bw * (j + 1)) / segs;
      for (const [d, nn] of [
        [0, N],
        [-dir * t, NB],
      ] as const) {
        const q = [P(ex0, y1, d), P(ex1, y1, d), P(ax1, ay1, d), P(ax0, ay0, d)];
        const flip = (nn === N) === (alongX ? dir > 0 : dir < 0);
        if (flip) K.quad(s, q[3], q[2], q[1], q[0], nn, uv, col);
        else K.quad(s, q[0], q[1], q[2], q[3], nn, uv, col);
        // (the spandrel's lower edge: down to the springing line beside the arch)
        if (j === 0 || j === segs - 1) {
          const ex = j === 0 ? ac - bw / 2 : ac + bw / 2;
          const ax = j === 0 ? ax0 : ax1;
          const tq = [P(ex, spring, d), P(ax, spring, d), P(ax, j === 0 ? ay0 : ay1, d)];
          K.tri(s, tq[0], tq[1], tq[2], nn, uv, col);
          K.tri(s, tq[2], tq[1], tq[0], nn, uv, col);
        }
      }
      // the soffit
      const nx = -Math.cos((t0 + t1) / 2),
        ny = -Math.sin((t0 + t1) / 2);
      K.quad(s, P(ax0, ay0, 0), P(ax1, ay1, 0), P(ax1, ay1, -dir * t), P(ax0, ay0, -dir * t), alongX ? [nx, ny, 0] : [0, ny, nx], uv, hex("#c8a878"));
      K.quad(s, P(ax0, ay0, -dir * t), P(ax1, ay1, -dir * t), P(ax1, ay1, 0), P(ax0, ay0, 0), alongX ? [nx, ny, 0] : [0, ny, nx], uv, hex("#c8a878"));
    }
  }
  // the top of the wall
  if (alongX) K.box(s, a0, y1 - 0.01, Math.min(f, f - dir * t), a1, y1, Math.max(f, f - dir * t), col, { skip: "-y" });
  else K.box(s, Math.min(f, f - dir * t), y1 - 0.01, a0, Math.max(f, f - dir * t), y1, a1, col, { skip: "-y" });
}

/** Tall windows (dark glass in a stone recess) along a face; `every` metres apart, floors at `ys`. */
function windows(c: LmCtx, alongX: boolean, f: number, dir: 1 | -1, a0: number, a1: number, ys: number[], w: number, h: number, every: number, frame: V3) {
  if (c.far) return;
  const K = c.K;
  const n = Math.floor((a1 - a0) / every);
  const off = (a1 - a0 - n * every) / 2 + every / 2;
  for (const y of ys)
    for (let i = 0; i < n; i++) {
      const a = a0 + off + i * every;
      const g = 0.04;
      if (alongX) {
        K.quad("lm.glass", [a - w / 2, y, f + dir * g], [a + w / 2, y, f + dir * g], [a + w / 2, y + h, f + dir * g], [a - w / 2, y + h, f + dir * g], [0, 0, dir], (p) => [p[0] * 0.3, p[1] * 0.3], hex("#3a4452"));
        K.box("lm.Marble021", a - w / 2 - 0.1, y - 0.12, dir > 0 ? f : f - 0.12, a + w / 2 + 0.1, y, dir > 0 ? f + 0.12 : f, frame);
      } else {
        K.quad("lm.glass", [f + dir * g, y, a - w / 2], [f + dir * g, y, a + w / 2], [f + dir * g, y + h, a + w / 2], [f + dir * g, y + h, a - w / 2], [dir, 0, 0], (p) => [p[2] * 0.3, p[1] * 0.3], hex("#3a4452"));
        K.box("lm.Marble021", dir > 0 ? f : f - 0.12, y - 0.12, a - w / 2 - 0.1, dir > 0 ? f + 0.12 : f, y, a + w / 2 + 0.1, frame);
      }
    }
}

def("university", (c) => {
  const { K, X, Z, u } = c;
  const mw = c.b.model.w,
    md = c.b.model.d;
  const cx = X(mw / 2);
  const stone = hex("#d9bb8c"),
    stoneLt = hex("#e8d2a6"),
    tile = hex("#b44c35");
  const ST: Slot = "lm.Plaster001";
  const FR1 = Z(md - 38),
    FR0 = FR1 - 15 * u;
  const SR = 15 * u,
    CH1 = Z(58),
    CH0 = Z(6);
  const RH = 26 * u,
    ARC = 4 * u,
    GW = 8 * u;
  const W0 = -c.W / 2,
    W1 = c.W / 2;
  // ground: buff paving, the Oval (lawn, a red flower ring, the golden Z), palms down the drive
  K.box("lm.PavingStones070", W0, 0, -c.D / 2, W1, 0.12, c.D / 2, hex("#d6c6a4"), { skip: "-y" });
  {
    const oz = Z(md - 19);
    const ring = circle(0, 0, 1, 48).map(([a, b2]) => [cx + a * 26 * u, oz + b2 * 13 * u] as V2);
    K.prism("lm.Grass004", ring, 0.12, 0.2, hex("#c8343c"), { lid: "lm.Grass004", lidCol: hex("#c84040") });
    const inner = circle(0, 0, 1, 48).map(([a, b2]) => [cx + a * 23 * u, oz + b2 * 11.5 * u] as V2);
    K.prism("lm.Grass004", inner, 0.2, 0.24, hex("#5f9a48"), { lid: "lm.Grass004", lidCol: hex("#6aa050") });
    const zy = 0.26;
    K.bar("lm.paint", [cx - 3, zy, oz - 1.8], [cx + 3, zy, oz - 1.8], 0.7, hex("#f4b728"));
    K.bar("lm.paint", [cx + 3, zy, oz - 1.8], [cx - 3, zy, oz + 1.8], 0.7, hex("#f4b728"));
    K.bar("lm.paint", [cx - 3, zy, oz + 1.8], [cx + 3, zy, oz + 1.8], 0.7, hex("#f4b728"));
    for (let i = 0; i < 6; i++) {
      const z = c.D / 2 - 1.7 - i * 2;
      if (z > FR1 + 0.7) {
        c.ex.trees.push([W0 + 1.5, 0.12, z, "palm", i]);
        c.ex.trees.push([W1 - 1.5, 0.12, z, "palm", i + 5]);
      }
    }
  }
  // the quad: round beds with palms
  for (const bz of [Z(58 + 26), Z(58 + 66)]) {
    if (bz > FR0 - 2) continue;
    K.cyl("lm.Grass004", cx, bz, 3, 3, 0.12, 0.3, hex("#4a8a40"), { sides: 24 });
    c.ex.trees.push([cx, 0.3, bz, "palm", Math.floor(bz)]);
    for (let a = 0; a < 6; a++) c.ex.trees.push([cx + Math.cos(a) * 1.8, 0.3, bz + Math.sin(a) * 1.8, "bush", a]);
  }
  // the ranges: sandstone, tall windows on two floors, a plinth; red tile hip roofs
  const range = (x0: number, z0: number, x1: number, z1: number, h: number) => {
    K.box(ST, x0, 0.12, z0, x1, h, z1, stone, { skip: "-y" });
    K.box(ST, x0 - 0.05, 0.12, z0 - 0.05, x1 + 0.05, 1, z1 + 0.05, hex("#9e7f58"), { skip: "-y+y" });
    windows(c, true, z1, 1, x0 + 0.5, x1 - 0.5, [1.6, 5.4], 1.0, 2.4, 2.33, stoneLt);
    windows(c, true, z0, -1, x0 + 0.5, x1 - 0.5, [1.6, 5.4], 1.0, 2.4, 2.33, stoneLt);
    windows(c, false, x1, 1, z0 + 0.5, z1 - 0.5, [1.6, 5.4], 1.0, 2.4, 2.33, stoneLt);
    windows(c, false, x0, -1, z0 + 0.5, z1 - 0.5, [1.6, 5.4], 1.0, 2.4, 2.33, stoneLt);
  };
  range(W0, CH1 - 4 * u, W0 + SR - ARC, FR0, RH);
  range(W1 - SR + ARC, CH1 - 4 * u, W1, FR0, RH);
  hipRoof(c, "lm.RoofingTiles006", W0, CH1 - 5 * u, W0 + SR, FR0, RH, 0.75, tile);
  hipRoof(c, "lm.RoofingTiles006", W1 - SR, CH1 - 5 * u, W1, FR0, RH, 0.75, tile);
  // the arcades along the quad
  arcadeWall(c, ST, false, W0 + SR, 1, CH1, FR0, Math.max(1, Math.round((FR0 - CH1) / 3)), 0.6, 3.2, 5.3, ARC, stone);
  arcadeWall(c, ST, false, W1 - SR, -1, CH1, FR0, Math.max(1, Math.round((FR0 - CH1) / 3)), 0.6, 3.2, 5.3, ARC, stone);
  // the front range, its arcade on the street side, split by the great gateway
  const gx0 = cx - GW - 6 * u,
    gx1 = cx + GW + 6 * u;
  for (const [a, b2] of [
    [W0, gx0],
    [gx1, W1],
  ]) {
    range(a, FR0, b2, FR1 - ARC, RH);
    hipRoof(c, "lm.RoofingTiles006", a, FR0, b2, FR1, RH, 0.75, tile, 0.3);
    arcadeWall(c, ST, true, FR1, 1, a, b2, Math.max(1, Math.round((b2 - a) / 3)), 0.6, 3.2, 5.3, ARC, stone);
  }
  // the great gateway: a taller block, one huge round arch through to the quad, a gable over it
  {
    const GH = 44 * u;
    const t = FR1 + 0.66 - (FR0 - 0.33);
    arcadeWall(c, ST, true, FR1 + 0.66, 1, gx0, gx1, 1, 2 * 6 * u, 16 * u - GW, 36 * u, t, stone);
    K.box(ST, gx0, 36 * u, FR0 - 0.33, gx1, GH, FR1 + 0.66, stone, { skip: "-y" });
    K.box(ST, gx0 - 0.33, 36 * u, FR0 - 0.66, gx1 + 0.33, 38 * u, FR1 + 1, stoneLt);
    gableRoof(c, "lm.RoofingTiles006", gx0 - 0.33, FR0 - 0.66, gx1 + 0.33, FR1 + 1, GH, false, 0.85, tile, { s: ST, col: stone });
    K.box("lm.PavingStones070", gx0 + 2 * u, 0.12, FR0 - 0.33, gx1 - 2 * u, 0.14, FR1 + 0.66, hex("#c9ae7c"));
    for (const x of [X(Math.round(mw / 2 - 8 - 3)), X(Math.round(mw / 2 + 8 + 2))]) {
      K.box("lm.Metal032.metal", x, 18 * u - 0.1, FR1 + 0.66, x + 0.33, 22 * u + 0.1, FR1 + 0.9, hex("#26242a"));
      K.box("lm.glow.night", x + 0.03, 18 * u, FR1 + 0.9, x + 0.3, 22 * u, FR1 + 1.1, hex("#ffc870"));
    }
  }
  // the chapel at the quad's north end: nave and transept, gables, a dome on a drum, the mosaic front, the rose window
  {
    const X0 = X(16),
      X1 = X(mw - 16);
    const NH = 40 * u;
    K.box(ST, X0 + 5 * u, 0.12, CH0, X1 - 5 * u, NH, CH1, stone, { skip: "-y" });
    K.box(ST, X0 - 8 * u, 0.12, CH0 + 14 * u, X1 + 8 * u, NH - 6 * u, CH0 + 30 * u, stone, { skip: "-y" });
    windows(c, false, X0 + 5 * u, -1, CH0 + 31 * u, CH1 - 1, [3], 1.3, 5, 3, stoneLt);
    windows(c, false, X1 - 5 * u, 1, CH0 + 31 * u, CH1 - 1, [3], 1.3, 5, 3, stoneLt);
    gableRoof(c, "lm.RoofingTiles006", X0 + 4 * u, CH0 - 0.33, X1 - 4 * u, CH1 + 0.33, NH, true, 0.8, tile, { s: ST, col: stone });
    gableRoof(c, "lm.RoofingTiles006", X0 - 9 * u, CH0 + 13 * u, X1 + 9 * u, CH0 + 31 * u, NH - 6 * u, false, 0.8, tile, { s: ST, col: stone });
    const dz = CH0 + 22 * u;
    K.cyl(ST, cx, dz, 7 * u, 7 * u, NH + 14 * u, NH + 24 * u, stone, { sides: 24 });
    K.sphere("lm.RoofingTiles006", cx, NH + 24 * u, dz, 7.5 * u, tile, { hemi: true, segs: 20, sy: 0.9 });
    K.cyl(ST, cx, dz, 0.6, 0.6, NH + 24 * u + 6.5 * u * 0.9, NH + 24 * u + 6.5 * u * 0.9 + 1.2, stoneLt, { sides: 10 });
    // the front: taller, a triple arch, the gold mosaic, the rose window
    const FZ = CH1,
      FH = 66 * u;
    K.box(ST, X0 + 2 * u, 0.12, FZ - 1, X1 - 2 * u, FH, FZ, stone, { skip: "-y" });
    const zf = FZ + 0.02;
    // the triple portal (dark wood doors in deep arches)
    for (const [ox, w, h] of [
      [0, 10, 20],
      [-13, 6, 14],
      [13, 6, 14],
    ]) {
      const ax = cx + ox * u,
        r = (w * u) / 2,
        spring = 0.12 + h * u - r;
      K.box("lm.Wood049", ax - r, 0.12, FZ - 0.3, ax + r, spring, FZ - 0.25, hex("#5a3a22"));
      const ring: V2[] = [];
      for (let j = 0; j <= 10; j++) ring.push([ax + Math.cos((j / 10) * Math.PI) * r, spring + Math.sin((j / 10) * Math.PI) * r]);
      for (let j = 0; j < 10; j++) K.tri("lm.Wood049", [ax, spring, FZ - 0.25], [ring[j + 1][0], ring[j + 1][1], FZ - 0.25], [ring[j][0], ring[j][1], FZ - 0.25], [0, 0, 1], (p) => [p[0], p[1]], hex("#5a3a22"));
      for (let j = 0; j < 10; j++) K.bar(ST, [ring[j][0], ring[j][1], zf + 0.1], [ring[j + 1][0], ring[j + 1][1], zf + 0.1], 0.35, stoneLt);
    }
    if (!c.far) {
      // the mosaic: a gold field with figures
      K.box("lm.glow", cx - 19 * u, 25 * u, zf, cx + 19 * u, 45 * u, zf + 0.06, hex("#c89a3a", 0.55));
      for (let f = 0; f < 7; f++) {
        if (f === 3) continue;
        const fx = cx + (-17 + f * 6 + 2) * u;
        K.box("lm.paint", fx, 31 * u, zf + 0.06, fx + 1.0, 42 * u, zf + 0.09, hex(["#2c4a92", "#9a2a2e", "#2c4a92"][f % 3]));
        K.cyl("lm.glow", fx + 0.5, zf + 0.08, 0.45, 0.45, 43 * u - 0.05, 43 * u, hex("#f2c45a"), { sides: 10, caps: "top" });
      }
      plate(c, "lm.glow", circle(cx, 35 * u, 4 * u, 20), zf + 0.12, 0.06, hex("#f4f0e0", 0.6));
      // the rose window, its tracery
      plate(c, "lm.glass", circle(cx, 55 * u, 6 * u, 32), zf + 0.02, 0.06, hex("#c84a6a"));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        K.bar(ST, [cx, 55 * u, zf + 0.12], [cx + Math.cos(a) * 6 * u, 55 * u + Math.sin(a) * 6 * u, zf + 0.12], 0.14, stoneLt);
      }
      K.cyl(ST, cx, zf + 0.1, 0.4, 0.4, 55 * u - 0.2, 55 * u + 0.2, stoneLt, { sides: 10 });
    }
    gableRoof(c, "lm.RoofingTiles006", X0 + 2 * u, FZ - 1, X1 - 2 * u, FZ + 0.33, FH, true, 0.55, tile, { s: ST, col: stone }, 0.2);
    for (let s = 0; s < 3; s++) K.box(ST, X0 + 2 * u, 0.12, FZ + s * u, X1 - 2 * u, 0.12 + (3 - s) * u - 0.66 + 0.33, FZ + (s + 1) * u, stoneLt, { skip: "-y" });
  }
  // the bell tower at the front-east corner: a slit-windowed shaft, clocks, the open belfry, the red dome
  {
    const TX0 = X(mw - 16),
      TX1 = X(mw - 1),
      TZ0 = Z(58 - 14),
      TZ1 = Z(58 + 2);
    const TOP = 150 * u;
    const tcx = (TX0 + TX1) / 2,
      tcz = (TZ0 + TZ1) / 2,
      hw = (TX1 - TX0) / 2;
    K.box(ST, TX0, 0.12, TZ0, TX1, TOP - 40 * u, TZ1, stone, { skip: "-y" });
    K.box(ST, TX0 + u, TOP - 40 * u, TZ0 + u, TX1 - u, TOP, TZ1 - u, stone, { skip: "-y" });
    // the slit windows up the middle of each face, the corner piers proud
    if (!c.far)
      for (let y = 6; y < TOP - 16; y += 3.2) {
        K.quad("lm.glass", [tcx - 0.25, y, TZ1 + 0.02], [tcx + 0.25, y, TZ1 + 0.02], [tcx + 0.25, y + 2, TZ1 + 0.02], [tcx - 0.25, y + 2, TZ1 + 0.02], [0, 0, 1], (p) => [p[0], p[1]], hex("#2a3442"));
        K.quad("lm.glass", [TX0 - 0.02, y, tcz - 0.25], [TX0 - 0.02, y, tcz + 0.25], [TX0 - 0.02, y + 2, tcz + 0.25], [TX0 - 0.02, y + 2, tcz - 0.25], [-1, 0, 0], (p) => [p[2], p[1]], hex("#2a3442"));
      }
    for (const [x, z] of [
      [TX0, TZ0],
      [TX1, TZ0],
      [TX0, TZ1],
      [TX1, TZ1],
    ])
      K.box(ST, x - 0.4, 0.12, z - 0.4, x + 0.4, TOP - 40 * u, z + 0.4, stoneLt);
    // the clocks
    const CY = TOP - 30 * u;
    for (const [nx, nz] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const fx = nz ? tcx : nx > 0 ? TX1 - u + 0.05 : TX0 + u - 0.05,
        fz = nz ? (nz > 0 ? TZ1 - u + 0.05 : TZ0 + u - 0.05) : tcz;
      const R = 5.4 * u;
      const pts = circle(0, 0, R, 28);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i],
          b2 = pts[(i + 1) % pts.length];
        const W3 = (p: V2): V3 => (nz ? [fx + p[0] * nz, CY + p[1], fz] : [fx, CY + p[1], fz - p[0] * nx]);
        K.tri("lm.glow", [fx, CY, fz], W3(a), W3(b2), [nx, 0, nz], (p) => [p[0], p[1]], hex("#fff4dc", 0.7));
      }
      K.cyl(ST, fx, fz, 0.2, 0.2, CY - 0.1, CY + 0.1, hex("#c4952e"), { sides: 8 });
      const h1: V3 = nz ? [fx, CY + R * 0.75, fz + nz * 0.08] : [fx + nx * 0.08, CY + R * 0.75, fz];
      const h2: V3 = nz ? [fx + nz * R * 0.6, CY, fz + nz * 0.08] : [fx + nx * 0.08, CY, fz - nx * R * 0.6];
      K.bar("lm.dark", [h1[0], CY, h1[2]], h1, 0.12, hex("#26242a"));
      K.bar("lm.dark", [h2[0] - (nz ? nz * R * 0.6 : 0), CY, h2[2] + (nz ? 0 : nx * R * 0.6)], h2, 0.12, hex("#26242a"));
    }
    // the belfry: four piers per face with two round openings, the bell inside, a cornice, the dome
    const BY0 = TOP,
      BY1 = TOP + 22 * u;
    K.box(ST, TX0 - 0.33, BY0, TZ0 - 0.33, TX1 + 0.33, BY0 + 0.66, TZ1 + 0.33, stoneLt);
    for (const [alongX, f, d, a0, a1] of [
      [true, TZ1, 1, TX0, TX1],
      [true, TZ0, -1, TX0, TX1],
      [false, TX1, 1, TZ0, TZ1],
      [false, TX0, -1, TZ0, TZ1],
    ] as const)
      arcadeWall(c, ST, alongX, f, d, a0, a1, 2, 1.0, BY0 + 0.66 + 3.2, BY1, 0.9, stone, BY0 + 0.66);
    K.cyl("lm.Metal032.metal", tcx, tcz, 0.6, 1.9, BY0 + 2.6, BY0 + 4.6, hex("#b58a3a"), { sides: 16 });
    K.box(ST, TX0 - 0.33, BY1, TZ0 - 0.33, TX1 + 0.33, BY1 + 0.66, TZ1 + 0.33, stoneLt);
    K.sphere("lm.RoofingTiles006", tcx, BY1 + 0.66, tcz, hw + 0.1, tile, { hemi: true, segs: 20, sy: 0.85 });
    K.cyl(ST, tcx, tcz, 0.55, 0.55, BY1 + 0.66 + hw * 0.85 - 0.3, BY1 + 0.66 + hw * 0.85 + 1, stoneLt, { sides: 10 });
    K.cyl("lm.Metal032.metal", tcx, tcz, 0.12, 0.03, BY1 + 0.66 + hw * 0.85 + 1, BY1 + 0.66 + hw * 0.85 + 3, hex("#c4952e"), { sides: 6 });
    K.sphere("lm.glow", tcx, BY1 + 0.66 + hw * 0.85 + 3.1, tcz, 0.15, hex("#ff5a3a"));
  }
  // lamps along the Oval and in the quad
  for (const z of [c.D / 2 - 2.6, c.D / 2 - 10]) for (const x of [cx - 10, cx + 10]) c.ex.props.push(["lamp", x, 0.12, z, 0, "#ffd8a0"]);
  c.ex.props.push(["bench", X(15 + 6), 0.12, Z(58 + 46), Math.PI / 2], ["bench", X(mw - 15 - 7), 0.12, Z(58 + 46), -Math.PI / 2]);
});

/** A box with chamfered edges (a die, a toy block): s the side, at (x, y, z) its lowest corner. */
function softCube(c: LmCtx, sl: Slot, x: number, y: number, z: number, s: number, col: V3, bev = 0.12) {
  const b = s * bev;
  const sq = (inset: number) => roundRect(x + s / 2, z + s / 2, s / 2 - inset, s / 2 - inset, b, 2);
  c.K.loft(sl, [
    { y, pts: sq(b) },
    { y: y + b, pts: sq(0) },
    { y: y + s - b, pts: sq(0) },
    { y: y + s, pts: sq(b) },
  ], col, { smooth: false, lid: sl, lidCol: col });
  c.K.floor(sl, sq(b), y, col, true);
}

/** A die's pips (a 3 × 3 grid) on a face: `face` +z, +y or +x of the cube at (x, y, z) side s. */
function pips(c: LmCtx, x: number, y: number, z: number, s: number, n: number, face: "z" | "y" | "x", col: V3) {
  const P = [[], [[1, 1]], [[0, 0], [2, 2]], [[0, 0], [1, 1], [2, 2]], [[0, 0], [2, 0], [0, 2], [2, 2]], [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]]];
  const at = (i: number) => s * (0.25 + i * 0.25);
  const r = s * 0.08;
  for (const [a, b2] of P[n]) {
    if (face === "z") plate(c, "lm.paint", circle(x + at(a), y + at(b2), r, 12), z + s + 0.005, 0.02, col);
    else if (face === "x") {
      const pts = circle(0, 0, r, 12);
      for (let i = 0; i < pts.length; i++) c.K.tri("lm.paint", [x + s + 0.01, y + at(b2), z + at(a)], [x + s + 0.01, y + at(b2) + pts[i][1], z + at(a) - pts[i][0]], [x + s + 0.01, y + at(b2) + pts[(i + 1) % pts.length][1], z + at(a) - pts[(i + 1) % pts.length][0]], [1, 0, 0], (p) => [p[2], p[1]], col);
    } else c.K.cyl("lm.paint", x + at(a), z + at(b2), r, r, y + s - 0.01, y + s + 0.01, col, { sides: 12 });
  }
}

def("gamehouse", (c) => {
  const { K, X, Z, u } = c;
  const mw = c.b.model.w,
    md = c.b.model.d;
  const cx = X(Math.round(mw / 2));
  const x0 = X(7),
    x1 = X(mw - 7);
  const FZ = Z(Math.min(md - 30, 72));
  const bz = Z(Math.max(4, Math.min(md - 30, 72) - 58));
  const TOP = 36 * u;
  const flare = hex("#ff6b35"),
    lilac = hex("#c4b1fc"),
    glacier = hex("#a8d8e8"),
    bulbC = hex("#fff1d6");
  K.box("lm.PavingStones111", -c.W / 2, 0, -c.D / 2, c.W / 2, 0.12, c.D / 2, hex("#2a282e"), { skip: "-y" });
  // (the forecourt is plain paving up to the doors: no carpet laid out to them)
  // the body: matt black walls, lilac pilasters, floor bands, a few lit windows up the sides
  K.box("lm.Concrete034", x0, 0.12, bz, x1, TOP, FZ - 0.66, hex("#141218"), { skip: "-y" });
  for (const y of [13 * u, 24 * u]) K.box("lm.dark", x0 - 0.05, y, bz - 0.05, x1 + 0.05, y + 0.33, FZ - 0.6, hex("#2c2834"), { skip: "-y+y" });
  for (const x of [x0, x1]) K.box("lm.glow", x - 0.12, 0.12, FZ - 0.9, x + 0.12, TOP, FZ - 0.6, lilac);
  windows(c, false, x0, -1, bz + 1, FZ - 2, [5.2, 9], 1.2, 2, 3, hex("#2c2834"));
  windows(c, false, x1, 1, bz + 1, FZ - 2, [5.2, 9], 1.2, 2, 3, hex("#2c2834"));
  K.box("lm.Concrete034", x0 - 0.2, TOP, bz - 0.2, x1 + 0.2, TOP + 0.5, FZ - 0.46, hex("#2c2834"));
  // the storefront: the hall seen through the glass, the lit doors framed in bulbs
  const sf0 = X(7 + 4),
    sf1 = X(mw - 7 - 4);
  lit(c, "bar", sf0, sf1, 0.12, 12 * u, FZ - 1.4, 5);
  K.quad("glass", [sf0, 0.12, FZ - 0.64], [sf1, 0.12, FZ - 0.64], [sf1, 11 * u, FZ - 0.64], [sf0, 11 * u, FZ - 0.64], [0, 0, 1], (p) => [p[0], p[1]], [0.99, 0.3, 0.6]);
  for (let x = sf0; x <= sf1 + 0.01; x += 5 * u) K.box("lm.dark", x - 0.08, 0.12, FZ - 0.66, x + 0.08, 11 * u, FZ - 0.56, hex("#2c2834"));
  K.box("lm.dark", sf0, 11 * u, FZ - 0.66, sf1, 12 * u, FZ - 0.5, hex("#2c2834"));
  if (!c.far) {
    for (let y = 0.4; y < 11 * u; y += 0.66) for (const x of [cx - 6 * u + 0.17, cx + 5 * u + 0.17]) K.sphere("lm.glow", x, y, FZ - 0.5, 0.1, bulbC, { segs: 4 });
    for (let x = cx - 6 * u; x < cx + 6 * u; x += 0.66) K.sphere("lm.glow", x + 0.17, 11 * u + 0.17, FZ - 0.5, 0.1, bulbC, { segs: 4 });
  }
  // the marquee canopy: a black slab, bulbs underneath, its fascia in flare and lilac with a chase-bulb fringe
  {
    const c0 = cx - 24 * u,
      c1 = cx + 24 * u,
      cz1 = FZ + 10 * u;
    K.box("lm.Concrete034", c0, 13 * u, FZ - 0.66, c1, 16 * u, cz1, hex("#121016"));
    K.box("lm.glow", c0, 13 * u, cz1, c1, 14 * u, cz1 + 0.05, flare);
    K.box("lm.glow", c0, 15 * u, cz1, c1, 16 * u, cz1 + 0.05, lilac);
    if (!c.far) {
      for (let z = FZ + 0.33; z < cz1 - 0.3; z += 0.66) for (let x = c0 + 0.66; x < c1 - 0.3; x += 1) K.sphere("lm.glow", x, 13 * u - 0.05, z, 0.08, bulbC, { segs: 4 });
      for (let x = c0; x < c1; x += 0.66) K.sphere("lm.glow", x + 0.17, 13 * u - 0.15, cz1, 0.09, bulbC, { segs: 4 });
    }
  }
  // the big board over the canopy: black, framed in bulbs (the neon: the signs)
  {
    const b0 = X(7 + 3),
      b1 = X(mw - 7 - 3),
      by0 = 17 * u,
      by1 = 33 * u;
    K.box("lm.dark", b0, by0, FZ - 0.66, b1, by1, FZ + 0.66, hex("#0c0b10"));
    if (!c.far)
      for (let x = b0; x <= b1; x += 0.66)
        for (const y of [by0 - 0.1, by1 + 0.1]) K.sphere("lm.glow", x, y, FZ + 0.66, 0.1, bulbC, { segs: 4 });
    const split = b1 - 18 * u;
    K.box("lm.glow", split, 23 * u, FZ + 0.66, split + 0.66, 25 * u, FZ + 1, flare);
  }
  // the tate-kanban hanging off the west corner
  {
    const sx = X(7 + 1);
    K.box("lm.dark", sx, 14 * u, FZ + 0.33, sx + 0.66, 34 * u, FZ + 2.33, hex("#1a1820"));
    for (const y of [13 * u, 34 * u]) K.box("lm.dark", sx - 0.33, y, FZ + 0.33, sx + 1, y + 0.33, FZ + 2.33, hex("#2c2834"));
  }
  // on the roof: the party's Z-Block (flare, a "?" in light), a die showing five, a card on its edge with ZEC's Z
  {
    const s = 15 * u;
    const qx = cx - Math.floor(15 / 2) * u + 2 * u,
      qz = FZ - 22 * u;
    softCube(c, "lm.paint", qx, TOP + 0.5, qz, s, flare, 0.08);
    if (!c.far) {
      // the "?" on its front and sides: a hook and a dot of light
      for (const [ox, oz, rot] of [
        [qx + s / 2, qz + s + 0.02, 0],
        [qx + s + 0.02, qz + s / 2, 1],
      ] as const) {
        const P = (a: number, b2: number): V3 => (rot ? [ox, TOP + 0.5 + s * 0.55 + b2, oz - a] : [ox + a, TOP + 0.5 + s * 0.55 + b2, oz]);
        let prev = P(-s * 0.18, s * 0.12);
        for (let i = 1; i <= 8; i++) {
          const a = Math.PI - (i / 8) * Math.PI * 1.2;
          const p = P(Math.cos(a) * s * 0.18, s * 0.12 + Math.sin(a) * s * 0.18);
          K.bar("lm.glow", prev, p, s * 0.07, hex("#fff6e8"));
          prev = p;
        }
        K.bar("lm.glow", prev, P(0, -s * 0.15), s * 0.07, hex("#fff6e8"));
        K.sphere("lm.glow", ...P(0, -s * 0.3), s * 0.05, hex("#fff6e8"));
      }
      for (const [rx, rz] of [
        [qx + 0.3, qz + s - 0.3],
        [qx + s - 0.3, qz + s - 0.3],
      ])
        for (const ry of [TOP + 0.8, TOP + 0.5 + s - 0.3]) K.sphere("lm.chrome", rx, ry, rz + 0.3, 0.12, hex("#d8d8dc"), { segs: 6 });
    }
    K.box("lm.dark", qx - 0.33, TOP, qz - 0.33, qx + s + 0.33, TOP + 0.5, qz + s + 0.33, hex("#2c2834"));
    // the die
    const dx = X(mw - 7 - 17),
      dz = FZ - 18 * u,
      ds = 11 * u;
    softCube(c, "lm.paint", dx, TOP + 0.5, dz, ds, hex("#f2eee6"));
    pips(c, dx, TOP + 0.5, dz, ds, 5, "z", hex("#16141c"));
    pips(c, dx, TOP + 0.5, dz, ds, 1, "y", flare);
    pips(c, dx, TOP + 0.5, dz, ds, 3, "x", hex("#16141c"));
    // the card on its edge, facing the avenue: white face, lilac back, the Z in a gold ring
    const cw = 16 * u,
      ch = 22 * u,
      kx = X(7 + 6),
      kz = FZ - 30 * u;
    K.box("lm.paint", kx, TOP + 0.5, kz, kx + cw, TOP + 0.5 + ch, kz + 0.33, hex("#f2eee6"));
    K.box("lm.paint", kx, TOP + 0.5, kz - 0.33, kx + cw, TOP + 0.5 + ch, kz, hex("#3a2a6a"));
    if (!c.far) {
      const ccx = kx + cw / 2,
        ccy = TOP + 0.5 + ch / 2;
      plate(c, "lm.Metal032.metal", circle(ccx, ccy, cw * 0.36, 32), kz + 0.38, 0.06, hex("#f4b728"));
      plate(c, "lm.paint", circle(ccx, ccy, cw * 0.3, 32), kz + 0.42, 0.04, hex("#f2eee6"));
      const R = cw * 0.22,
        zz = kz + 0.46;
      K.bar("lm.paint", [ccx - R * 0.6, ccy + R * 0.6, zz], [ccx + R * 0.6, ccy + R * 0.6, zz], R * 0.22, hex("#16141c"));
      K.bar("lm.paint", [ccx + R * 0.6, ccy + R * 0.6, zz], [ccx - R * 0.6, ccy - R * 0.6, zz], R * 0.22, hex("#16141c"));
      K.bar("lm.paint", [ccx - R * 0.6, ccy - R * 0.6, zz], [ccx + R * 0.6, ccy - R * 0.6, zz], R * 0.22, hex("#16141c"));
      for (const [px, py] of [
        [kx + 1, TOP + 0.5 + ch - 1.2],
        [kx + cw - 1, TOP + 1.7],
      ])
        K.sphere("lm.paint", px, py, kz + 0.4, 0.35, hex("#c3121f"), { segs: 6 });
    }
    K.box("lm.dark", kx + 0.66, TOP, kz - 1, kx + 1.33, TOP + 1.66, kz - 0.33, hex("#2c2834"));
    K.box("lm.dark", kx + cw - 1.33, TOP, kz - 1, kx + cw - 0.66, TOP + 1.66, kz - 0.33, hex("#2c2834"));
    // rooftop plant
    K.box("lm.Metal032.metal", X(mw - 7 - 14), TOP + 0.5, bz + 2, X(mw - 7 - 6), TOP + 1.8, bz + 4, hex("#c4c1ca"));
  }
  // on the plaza: a second die and a stack of ⓩ chips by the kerb, stanchions, lamps
  {
    const ds = 10 * u,
      dx = X(4),
      dz = FZ + 14 * u;
    softCube(c, "lm.paint", dx, 0.12, dz, ds, hex("#f2eee6"));
    pips(c, dx, 0.12, dz, ds, 6, "z", hex("#16141c"));
    pips(c, dx, 0.12, dz, ds, 4, "y", hex("#16141c"));
    pips(c, dx, 0.12, dz, ds, 2, "x", hex("#16141c"));
    const ccx = X(mw - 10),
      ccz = FZ + 19 * u;
    ["#ff6b35", "#c4b1fc", "#a8d8e8", "#e8e6e0", "#ff6b35", "#6dbf8a"].forEach((col, i) => {
      const y = 0.12 + i * 0.66;
      const off = (i % 2 ? 0.4 : -0.3) * u;
      K.cyl("lm.plastic", ccx + off, ccz, 5.2 * u, 5.2 * u, y, y + 0.62, hex(col), { sides: 32 });
      if (!c.far) for (let a = 0; a < 6; a++) K.cyl("lm.plastic", ccx + off + Math.cos((a / 6) * Math.PI * 2 + i * 0.5) * 5.2 * u, ccz + Math.sin((a / 6) * Math.PI * 2 + i * 0.5) * 5.2 * u, 0.2, 0.2, y + 0.05, y + 0.57, hex("#f8f6f0"), { sides: 6, caps: "none" });
    });
    K.cyl("lm.glow", ccx, ccz, 2.2 * u, 2.2 * u, 0.12 + 6 * 0.66, 0.12 + 6 * 0.66 + 0.02, bulbC, { sides: 20 });
    for (const x of [cx - 9 * u, cx + 8 * u + 0.33]) {
      for (let z = FZ + 12 * u; z < c.D / 2 - 1.4; z += 5 * u) K.cyl("lm.Metal032.metal", x, z, 0.06, 0.06, 0.12, 1.1, hex("#8a8794"), { sides: 8 });
      K.box("fabric", x - 0.03, 1.0, FZ + 12 * u, x + 0.03, 1.06, c.D / 2 - 1.6, lilac);
    }
    for (const x of [X(2), X(mw - 3)]) for (let z = FZ + 1.33; z < c.D / 2 - 2.6; z += 4.6) c.ex.props.push(["lamp", x, 0.12, z, x < 0 ? Math.PI / 2 : -Math.PI / 2, "#ffd8b0"]);
  }
  void glacier;
});

// ---- the south bank: Binhai Library, Marina Bay, Gardens by the Bay, the port ---------------------------------------

def("binhai", (c) => {
  const { K, X, Z, u } = c;
  const mw = c.b.model.w,
    md = c.b.model.d;
  const mid = Math.floor(mw / 2);
  const cx = X(mid);
  const BX0 = X(14),
    BX1 = X(mw - 14),
    BZ0 = Z(36),
    BZ1 = Z(104),
    TOP = 82 * u,
    HT = 88 * u;
  const FX0 = BX0 + 5 * u,
    FX1 = BX1 - 5 * u;
  const white = hex("#eceae6"),
    white2 = hex("#dcdad6");
  K.box("lm.PavingStones111", -c.W / 2, 0, -c.D / 2, c.W / 2, 0.12, c.D / 2, hex("#d8d4cc"), { skip: "-y" });
  // the white frame: roof slab and end walls; the building's apron
  K.box("lm.Concrete034", BX0, TOP, BZ0 - 0.33, BX1, HT, BZ1 + 0.33, white);
  K.box("lm.Concrete034", BX0, 0.12, BZ0 - 0.33, FX0, TOP, BZ1 + 0.33, white, { skip: "-y" });
  K.box("lm.Concrete034", FX1, 0.12, BZ0 - 0.33, BX1, TOP, BZ1 + 0.33, white, { skip: "-y" });
  K.box("lm.Concrete034", FX0, 0.12, BZ0 + 3 * u, FX1, TOP, BZ1 - 3 * u, hex("#d6d4ce"), { skip: "-y-z+z" });
  K.box("lm.Concrete034", BX0, 0.12, BZ1 + 0.33, BX1, 0.45, BZ1 + 6 * u, white2, { skip: "-y" });
  // the eye: an almond of two arcs centred on each long facade; louvres bending round it like contour lines
  const ecx = cx,
    cy = 47 * u,
    a = 56 * u,
    b = 32 * u;
  const Rr = (a * a + b * b) / (2 * b),
    off = Rr - b;
  const eyeH = (x: number) => (Math.abs(x - ecx) >= a ? 0 : Math.max(0, Math.sqrt(Rr * Rr - (x - ecx) ** 2) - off));
  const Htop = TOP - cy,
    Hbot = cy - 0.12;
  const S = 5 * u;
  const NX = c.far ? 24 : 72;
  const xs: number[] = [];
  for (let i = 0; i <= NX; i++) xs.push(FX0 + ((FX1 - FX0) * i) / NX);
  const ENTx0 = ecx - 26 * u,
    ENTx1 = ecx + 26 * u,
    ENTy = 11 * u;
  for (const dir of [1, -1] as const) {
    const zf = dir > 0 ? BZ1 : BZ0;
    const zg = zf - dir * 1.0; // the glass, a metre behind the louvres
    // the glass behind (the reading floors, warm lines of shelf light: the glass slot lights them at night)
    // (in strips: the eye stays open)
    for (let i = 0; i < NX; i++) {
      const x0 = xs[i],
        x1 = xs[i + 1];
      const e0 = eyeH(x0),
        e1 = eyeH(x1);
      const spans: [number, number, number, number][] = e0 > 0 || e1 > 0 ? [[0.12, 0.12, cy - e0, cy - e1], [cy + e0, cy + e1, TOP, TOP]] : [[0.12, 0.12, TOP, TOP]];
      for (const [ya0, ya1, yb0, yb1] of spans) {
        const q: V3[] = [[x0, ya0, zg], [x1, ya1, zg], [x1, yb1, zg], [x0, yb0, zg]];
        if (dir > 0) K.quad("lm.glass", q[0], q[1], q[2], q[3], [0, 0, 1], (p) => [p[0] * 0.3, p[1] * 0.3], hex("#a8bccb"));
        else K.quad("lm.glass", q[1], q[0], q[3], q[2], [0, 0, -1], (p) => [p[0] * 0.3, p[1] * 0.3], hex("#a8bccb"));
      }
    }
    // the louvres: for each band level, a white slab along its contour (above and below the eye)
    const levels = Math.ceil(Math.max(Htop, Hbot) / S);
    for (let lv = 1; lv <= levels; lv++)
      for (const half of [1, -1]) {
        const span = half > 0 ? Htop : Hbot;
        if (lv * S >= span - 0.2) continue;
        const yAt = (x: number) => {
          const e = eyeH(x);
          const au = e + ((lv * S) / span) * (span - e);
          return cy + half * au;
        };
        for (let i = 0; i < NX; i++) {
          const x0 = xs[i],
            x1 = xs[i + 1];
          if (dir > 0 && half < 0 && Math.max(x0, x1) > ENTx0 && Math.min(x0, x1) < ENTx1 && Math.min(yAt(x0), yAt(x1)) < ENTy + 0.5) continue;
          const y0 = yAt(x0),
            y1 = yAt(x1);
          const t = 0.16;
          const za = zf,
            zb = zf - dir * 1.0;
          // top face, front edge, underside
          K.quad("lm.Concrete034", [x0, y0 + t, Math.max(za, zb)], [x1, y1 + t, Math.max(za, zb)], [x1, y1 + t, Math.min(za, zb)], [x0, y0 + t, Math.min(za, zb)], [0, 1, 0], (p) => [p[0] * 0.3, p[2] * 0.3], white);
          K.quad("lm.Concrete034", [x0, y0 - t, Math.min(za, zb)], [x1, y1 - t, Math.min(za, zb)], [x1, y1 - t, Math.max(za, zb)], [x0, y0 - t, Math.max(za, zb)], [0, -1, 0], (p) => [p[0] * 0.3, p[2] * 0.3], white2);
          if (dir > 0) K.quad("lm.Concrete034", [x0, y0 - t, za], [x1, y1 - t, za], [x1, y1 + t, za], [x0, y0 + t, za], [0, 0, 1], (p) => [p[0] * 0.3, p[1] * 0.3], white);
          else K.quad("lm.Concrete034", [x1, y1 - t, za], [x0, y0 - t, za], [x0, y0 + t, za], [x1, y1 + t, za], [0, 0, -1], (p) => [p[0] * 0.3, p[1] * 0.3], white);
          // a warm shelf light under each louvre (the night)
          if (!c.far && lv % 1 === 0) K.quad("lm.glow.night", [x0, y0 - t - 0.01, zg + dir * 0.05], [x1, y1 - t - 0.01, zg + dir * 0.05], [x1, y1 - t - 0.01, zg + dir * 0.4], [x0, y0 - t - 0.01, zg + dir * 0.4], [0, -1, 0], (p) => [p[0], p[2]], hex("#ffe0b0", 0.6));
        }
      }
    // the eye's rim: a thick white lip standing proud of the facade
    const eyePts: V2[] = [];
    const NE = c.far ? 24 : 56;
    for (let i = 0; i <= NE; i++) {
      const x = ecx - a + (2 * a * i) / NE;
      eyePts.push([x, cy + eyeH(x)]);
    }
    for (let i = NE; i >= 0; i--) {
      const x = ecx - a + (2 * a * i) / NE;
      eyePts.push([x, cy - eyeH(x)]);
    }
    const zr0 = zf + dir * 0.66,
      zr1 = zf - dir * 1.4;
    for (let i = 0; i < eyePts.length - 1; i++) {
      const [x0, y0] = eyePts[i],
        [x1, y1] = eyePts[i + 1];
      const ex = x1 - x0,
        ey = y1 - y0;
      const l = Math.hypot(ex, ey) || 1;
      // (the rim's inner face, toward the eye's centre)
      let nx = -ey / l,
        ny = ex / l;
      if ((ecx - x0) * nx + (cy - y0) * ny < 0) ((nx = -nx), (ny = -ny));
      K.quad("lm.Concrete034", [x0, y0, zr0], [x1, y1, zr0], [x1, y1, zr1], [x0, y0, zr1], [nx, ny, 0], (p) => [p[0] * 0.3, p[2] * 0.3], white);
      K.quad("lm.Concrete034", [x1, y1, zr1], [x1, y1, zr0], [x0, y0, zr0], [x0, y0, zr1], [nx, ny, 0], (p) => [p[0] * 0.3, p[2] * 0.3], white);
      // its front lip
      const o = 0.5;
      K.quad("lm.Concrete034", [x0, y0, zr0], [x1, y1, zr0], [x1 - nx * o, y1 - ny * o, zr0], [x0 - nx * o, y0 - ny * o, zr0], [0, 0, dir], (p) => [p[0] * 0.3, p[1] * 0.3], white);
      K.quad("lm.Concrete034", [x0 - nx * o, y0 - ny * o, zr0], [x1 - nx * o, y1 - ny * o, zr0], [x1, y1, zr0], [x0, y0, zr0], [0, 0, dir], (p) => [p[0] * 0.3, p[1] * 0.3], white);
    }
    // inside the eye: terraced bookshelves stepping back in rings round the sphere
    const N = 7,
      T = 4 * u;
    const ring = (s: number) => eyePts.map(([x, y]) => [ecx + (x - ecx) * s, cy + (y - cy) * s] as V2);
    const spines = ["#cbbca4", "#a98d6e", "#8c6c52", "#ddd3c0", "#b3a596", "#7d8c9c", "#c2a27a", "#9a5a48"].map((h2) => hex(h2));
    for (let j = 0; j < N; j++) {
      const s0 = 1 - j / N,
        s1 = 1 - (j + 1) / N;
      const zA = zr1 - dir * j * T,
        zB = zr1 - dir * (j + 1) * T;
      const A = ring(s0),
        B = ring(s1);
      for (let i = 0; i < A.length - 1; i++) {
        // the tread (horizontal-ish, from ring j at depth A to the same ring at depth B)
        const nrm: V3 = [0, A[i][1] < cy ? 1 : -1, 0];
        K.quad("lm.Concrete034", [A[i][0], A[i][1], zA], [A[i + 1][0], A[i + 1][1], zA], [A[i + 1][0], A[i + 1][1], zB], [A[i][0], A[i][1], zB], nrm, (p) => [p[0] * 0.3, p[2] * 0.3], white2);
        K.quad("lm.Concrete034", [A[i][0], A[i][1], zB], [A[i + 1][0], A[i + 1][1], zB], [A[i + 1][0], A[i + 1][1], zA], [A[i][0], A[i][1], zA], nrm, (p) => [p[0] * 0.3, p[2] * 0.3], white2);
        // the riser, facing out of the eye: the books
        if (j < N - 1) {
          const col = c.far ? hex("#c8b8a0") : spines[(i * 7 + j * 3) % spines.length];
          K.quad("lm.paint", [A[i][0], A[i][1], zB], [A[i + 1][0], A[i + 1][1], zB], [B[i + 1][0], B[i + 1][1], zB], [B[i][0], B[i][1], zB], [0, 0, dir], (p) => [p[0], p[1]], col);
          K.quad("lm.paint", [B[i][0], B[i][1], zB], [B[i + 1][0], B[i + 1][1], zB], [A[i + 1][0], A[i + 1][1], zB], [A[i][0], A[i][1], zB], [0, 0, dir], (p) => [p[0], p[1]], col);
        }
      }
    }
  }
  // the entrance under the eye: glass doors in the front
  lit(c, "lobby", ENTx0, ENTx1, 0.45, ENTy, BZ1 - 1.2, 3);
  K.quad("glass", [ENTx0, 0.45, BZ1 - 0.6], [ENTx1, 0.45, BZ1 - 0.6], [ENTx1, ENTy, BZ1 - 0.6], [ENTx0, ENTy, BZ1 - 0.6], [0, 0, 1], (p) => [p[0], p[1]], [0.99, 0.55, 0.8]);
  for (let x = ENTx0; x <= ENTx1 + 0.01; x += 2.2) K.box("lm.Metal032.metal", x - 0.05, 0.45, BZ1 - 0.62, x + 0.05, ENTy, BZ1 - 0.52, hex("#c8ccd0"));
  K.box("lm.Concrete034", ENTx0 - 0.3, ENTy, BZ1 - 1.3, ENTx1 + 0.3, ENTy + 0.4, BZ1 + 0.3, white);
  // the sphere: white, a lattice of light, on its plinth
  {
    const sx = X(mid),
      sy = 36 * u,
      sz = Z((36 + 104) / 2),
      SR = 24 * u;
    K.sphere("lm.paint", sx, sy, sz, SR, hex("#f4f2ee"), { segs: c.far ? 14 : 32 });
    if (!c.far) {
      for (let j = -3; j <= 3; j++) {
        const lat = (j / 8) * Math.PI;
        const rr = Math.cos(lat) * (SR + 0.03);
        K.cyl("lm.glow.night", sx, sz, rr, rr, sy + Math.sin(lat) * SR - 0.04, sy + Math.sin(lat) * SR + 0.04, hex("#ffe8b8"), { sides: 40, caps: "none" });
      }
      for (let i = 0; i < 12; i++) {
        const lon = (i / 12) * Math.PI * 2;
        let prev: V3 | null = null;
        for (let j = -7; j <= 7; j++) {
          const lat = (j / 16) * Math.PI;
          const p: V3 = [sx + Math.cos(lat) * Math.sin(lon) * (SR + 0.03), sy + Math.sin(lat) * (SR + 0.03), sz + Math.cos(lat) * Math.cos(lon) * (SR + 0.03)];
          if (prev) K.bar("lm.glow.night", prev, p, 0.07, hex("#ffe8b8"));
          prev = p;
        }
      }
    }
    K.box("lm.Concrete034", sx - 18 * u, 0.12, sz - 18 * u, sx + 18 * u, 13 * u, sz + 18 * u, white2);
  }
  // the roof: a long skylight over the atrium, plant boxes
  K.box("glass", cx - 70 * u, HT, BZ0 + 23 * u, cx + 70 * u, HT + 0.1, BZ1 - 23 * u, [0.9, 0.6, 0.7]);
  for (const x of [BX0 + 10 * u, BX1 - 26 * u]) K.box("lm.Concrete034", x, HT, BZ0 + 8 * u, x + 16 * u, HT + 1.33, BZ0 + 18 * u, white2);
  // the plaza: two reflecting pools either side of the walk to the door, trees, lamps
  const PZ0 = BZ1 + 16 * u,
    PZ1 = Z(md - 12);
  for (const [x0, x1] of [
    [ecx - 64 * u, ecx - 12 * u],
    [ecx + 12 * u, ecx + 64 * u],
  ]) {
    K.box("lm.Marble021", x0, 0.12, PZ0, x1, 0.6, PZ1, hex("#cfcbc3"), { skip: "-y+y" });
    for (const [a0, b0, a1, b1] of [
      [x0, PZ0, x1, PZ0 + 0.33],
      [x0, PZ1 - 0.33, x1, PZ1],
      [x0, PZ0, x0 + 0.33, PZ1],
      [x1 - 0.33, PZ0, x1, PZ1],
    ])
      K.box("lm.Marble021", a0, 0.12, b0, a1, 0.62, b1, hex("#e0dcd4"), { skip: "-y" });
    K.box("lm.glass", x0 + 0.33, 0.12, PZ0 + 0.33, x1 - 0.33, 0.45, PZ1 - 0.33, hex("#4f7f9c"), { skip: "-y-x+x-z+z" });
    if (!c.far) for (let x = x0 + 1; x < x1 - 0.6; x += 2) for (const z of [PZ0 + 0.45, PZ1 - 0.45]) K.box("lm.glow.night", x, 0.3, z - 0.05, x + 0.3, 0.44, z + 0.05, hex("#ffd890"));
  }
  for (const z of [BZ1 + 14 * u, BZ1 + 32 * u, Z(md - 16)]) for (const x of [X(8), X(mw - 9)]) c.ex.trees.push([x, 0.12, z, "broad", Math.floor(x + z)]);
  for (const x of [ecx - 68 * u, ecx - 8 * u, ecx + 8 * u, ecx + 68 * u]) c.ex.props.push(["lamp", x, 0.12, PZ0 + 0.66, 0, "#fff0d0"]);
  for (const x of [ecx - 68 * u, ecx + 68 * u]) c.ex.props.push(["lamp", x, 0.12, PZ1 - 0.66, 0, "#fff0d0"]);
  // the quay's railing (gaps for the footbridges)
  for (let x = -c.W / 2; x < c.W / 2; x += 5 * u) {
    const vx = (x + c.W / 2) / u;
    if ([78, 150, 222].some((bb) => Math.abs(vx - bb) < 6)) continue;
    K.cyl("lm.Metal032.metal", x, c.D / 2 - 0.2, 0.05, 0.05, 0.12, 1.33, hex("#4a4650"), { sides: 6, caps: "none" });
    K.bar("lm.Metal032.metal", [x, 1.33, c.D / 2 - 0.2], [x + 5 * u, 1.33, c.D / 2 - 0.2], 0.08, hex("#8a8690"));
  }
  // the name, low on a white plinth at the head of the plaza
  K.box("lm.Concrete034", ecx - 120 * u, 0.12, Z(md - 12), ecx - 78 * u, 5 * u, Z(md - 7), white);
  K.box("lm.Concrete034", ecx - 120 * u, 5 * u, Z(md - 12), ecx - 78 * u, 6 * u, Z(md - 7), white2);
  // behind: the cultural centre's glass-roofed promenade along the whole block
  {
    const z0 = Z(4),
      z1 = Z(26),
      y = 30 * u;
    for (let x = X(4); x < X(mw - 4); x += 12 * u) for (const z of [z0, z1]) K.cyl("lm.Metal032.metal", x, z, 0.2, 0.2, 0.12, y, white, { sides: 10, caps: "none" });
    K.box("lm.glass", X(3), y, z0 - 0.33, X(mw - 3), y + 0.1, z1 + 0.33, hex("#c3d6e2"));
    for (let x = X(3); x < X(mw - 3); x += 2) K.box("lm.Metal032.metal", x, y + 0.1, z0 - 0.33, x + 0.12, y + 0.3, z1 + 0.33, white2);
    for (const z of [z0 - 0.33, z1 + 0.33]) K.box("lm.Metal032.metal", X(3), y - 0.2, z - 0.15, X(mw - 3), y + 0.3, z + 0.15, white);
    for (let x = X(16); x < X(mw - 16); x += 36 * u) planter(c, x, Z(15), 2, 2, hex("#9a958c"), 0.12);
  }
});

def("marina", (c) => {
  const { K, X, Z, u } = c;
  const mw = c.b.model.w,
    md = c.b.model.d;
  const Ht = 150 * u,
    deckY = 160 * u;
  const mid = X(Math.round(mw / 2));
  const podH = 24 * u;
  const pz0 = Z(8),
    pz1v = md - Math.max(1, Math.round((2.6 * 6) / 2)) - 10,
    pz1 = Z(pz1v);
  const white = hex("#eeeae2"),
    whiteDark = hex("#d4cfc4"),
    gold = hex("#f4b728");
  // ground: river-promenade paving, a wave line in darker stone
  K.box("lm.PavingStones128", -c.W / 2, 0, -c.D / 2, c.W / 2, 0.12, c.D / 2, hex("#d0cabe"), { skip: "-y" });
  if (!c.far)
    for (let x = -c.W / 2; x < c.W / 2; x += 1) {
      const z0 = Z(md - 5) + Math.sin(((x + c.W / 2) / u) * 0.25) * 1.5 * u,
        z1 = Z(md - 5) + Math.sin(((x + 1 + c.W / 2) / u) * 0.25) * 1.5 * u;
      K.quad("lm.Marble021", [x, 0.125, z0 - 0.15], [x + 1, 0.125, z1 - 0.15], [x + 1, 0.125, z1 + 0.15], [x, 0.125, z0 + 0.15], [0, 1, 0], (p) => [p[0] * 0.4, p[2] * 0.4], hex("#9a948a"));
    }
  // the podium: three storeys of glass and stone, the lobby lit behind; a garden on its roof
  K.box("lm.Marble021", X(6), 0.12, pz0, X(mw - 6), podH, pz1 - 1.2, hex("#e4ded2"), { skip: "-y" });
  lit(c, "lobby", X(7), X(mw - 7), 0.12, podH - 0.8, pz1 - 1.15, 12);
  K.quad("glass", [X(7), 0.12, pz1 - 0.33], [X(mw - 7), 0.12, pz1 - 0.33], [X(mw - 7), podH - 0.66, pz1 - 0.33], [X(7), podH - 0.66, pz1 - 0.33], [0, 0, 1], (p) => [p[0], p[1]], [0.99, 0.6, 0.8]);
  if (!c.far) {
    for (let x = X(7); x < X(mw - 7); x += 2) K.box("lm.Metal032.metal", x - 0.05, 0.12, pz1 - 0.33, x + 0.05, podH, pz1 - 0.23, hex("#b8b2a6"));
    for (const y of [8 * u, 16 * u]) K.box("lm.Marble021", X(7), y - 0.15, pz1 - 0.4, X(mw - 7), y + 0.15, pz1 - 0.2, hex("#c8c0b0"));
  }
  K.box("lm.Marble021", X(5), podH - 0.66, pz0 - 0.33, X(mw - 5), podH, pz1 + 0.33, hex("#f0ece4"));
  K.box("lm.glow", X(5), podH - 1, pz1 + 0.33, X(mw - 5), podH - 0.66, pz1 + 0.38, gold);
  K.box("lm.Grass004", X(6), podH, pz0, X(mw - 6), podH + 0.2, pz1 - 1.66, hex("#4a8a3a"));
  for (let x = X(8); x < X(mw - 8); x += 3) if (c.r() > 0.35) c.ex.trees.push([x, podH + 0.2, pz1 - 2.4, "bush", Math.floor(x * 5)]);
  // the three towers: the front leg leaning back as it rises (an A in section), balconies on every floor
  const fzAt = (yv: number) => pz1 - 4 * u - 9 * u * Math.pow(Math.max(0, yv - 24) / (150 - 24), 1.6);
  const bz = pz0 + 2 * u;
  const NL = c.far ? 6 : 16;
  for (const [tx0, tx1] of [
    [14, 50],
    [73, 109],
    [132, 168],
  ].map(([a, b2]) => [X(a), X(b2)])) {
    // the back leg: a slab from the podium to the top
    K.box("f006", tx0, podH, bz, tx1, Ht, bz + 13 * u, white, { skip: "-y", fh: 3.2 });
    // the front leg: lofted between levels, its front face leaning
    const rings: { y: number; pts: V2[] }[] = [];
    for (let i = 0; i <= NL; i++) {
      const yv = 24 + ((150 - 24) * i) / NL;
      const fz = fzAt(yv);
      rings.push({ y: yv * u, pts: [[tx1, bz + 13 * u + (i === NL ? 0 : 0)], [tx1, fz], [tx0, fz], [tx0, bz + 13 * u]] as V2[] });
    }
    // (the slot between the legs at the bottom, open: the front leg starts at the podium's roof but its back face is the slot's)
    K.loft("f006", rings.map((r) => ({ y: r.y, pts: r.pts })), white, { fh: 3.2, lid: null });
    K.box("lm.Concrete034", tx0, Ht - 0.66, bz, tx1, Ht, fzAt(150), hex("#c8c2b6"));
    K.box("lm.glow", tx0, Ht - 1, fzAt(147) - 0.05, tx1, Ht - 0.66, fzAt(147) + 0.3, gold);
    // the balconies: a white slab with a glass rail on every third floor of the front face
    if (!c.far)
      for (let yv = 27; yv < 150; yv += 9) {
        const fz = fzAt(yv);
        K.box("lm.Concrete034", tx0, yv * u, fz, tx1, yv * u + 0.2, fz + 0.66, white);
        K.box("lm.glass", tx0, yv * u + 0.2, fz + 0.6, tx1, yv * u + 1.1, fz + 0.66, hex("#cfe4ee"), { skip: "-y" });
      }
    // the side fins (the leaning edge)
    for (const x of [tx0 - 0.2, tx1 + 0.2]) {
      let prev: V3 | null = null;
      for (let i = 0; i <= NL; i++) {
        const yv = 24 + ((150 - 24) * i) / NL;
        const p: V3 = [x, yv * u, fzAt(yv) - 2 * u];
        if (prev) K.bar("lm.Concrete034", prev, p, 0.35, hex("#b8b2a6"));
        prev = p;
      }
    }
  }
  // the SkyPark: a ship's hull across the three towers, its bow cantilevered past the right one
  const sx0 = X(8),
    sx1 = X(mw - 2);
  const sz0 = bz - 2 * u,
    sz1 = fzAt(150) + 6 * u;
  const scz = (sz0 + sz1) / 2,
    shw = (sz1 - sz0) / 2;
  const bowStart = X(150);
  const halfAt = (x: number) => (x > bowStart ? shw * Math.sqrt(Math.max(0.02, (sx1 - x) / (sx1 - bowStart))) : x < sx0 + 5 * u ? shw * Math.sqrt(Math.max(0.05, (x - sx0 + u) / (6 * u))) : shw);
  const hullBottom = (x: number) => (x > bowStart ? Ht + (x - bowStart) * 0.22 : Ht);
  {
    const NH = c.far ? 24 : 64;
    const xsH: number[] = [];
    for (let i = 0; i <= NH; i++) xsH.push(sx0 + ((sx1 - sx0) * i) / NH);
    for (let i = 0; i < NH; i++) {
      const a = xsH[i],
        b2 = xsH[i + 1];
      const ha = halfAt(a),
        hb = halfAt(b2);
      const ya = hullBottom(a),
        yb = hullBottom(b2);
      // the hull's sides (white, a ribbon of glass along the top), its underside, the timber deck
      for (const sd of [1, -1]) {
        K.quad("lm.Concrete034", [a, ya, scz + sd * ha], [b2, yb, scz + sd * hb], [b2, deckY - 7 * u, scz + sd * hb], [a, deckY - 7 * u, scz + sd * ha], [0, 0, sd], (p) => [p[0] * 0.3, p[1] * 0.3], white);
        K.quad("lm.glass", [a, deckY - 7 * u, scz + sd * ha], [b2, deckY - 7 * u, scz + sd * hb], [b2, deckY - 3 * u, scz + sd * hb], [a, deckY - 3 * u, scz + sd * ha], [0, 0, sd], (p) => [p[0] * 0.3, p[1] * 0.3], hex("#8aa8c0"));
        K.quad("lm.glow", [a, deckY - 3 * u, scz + sd * (ha + 0.02)], [b2, deckY - 3 * u, scz + sd * (hb + 0.02)], [b2, deckY - 2.6 * u, scz + sd * (hb + 0.02)], [a, deckY - 2.6 * u, scz + sd * (ha + 0.02)], [0, 0, sd], (p) => [p[0], p[1]], gold);
        K.quad("lm.Concrete034", [a, deckY - 2.6 * u, scz + sd * ha], [b2, deckY - 2.6 * u, scz + sd * hb], [b2, deckY, scz + sd * hb], [a, deckY, scz + sd * ha], [0, 0, sd], (p) => [p[0] * 0.3, p[1] * 0.3], white);
        // the glass balustrade round the deck
        K.quad("lm.glass", [a, deckY, scz + sd * ha], [b2, deckY, scz + sd * hb], [b2, deckY + 1.3, scz + sd * hb], [a, deckY + 1.3, scz + sd * ha], [0, 0, sd], (p) => [p[0] * 0.3, p[1] * 0.3], hex("#d8ecf4"));
      }
      K.quad("lm.Concrete034", [a, ya, scz - ha], [a, ya, scz + ha], [b2, yb, scz + hb], [b2, yb, scz - hb], [0, -1, 0], (p) => [p[0] * 0.3, p[2] * 0.3], hex("#8a8690"));
      K.quad("lm.Wood049", [a, deckY, scz + ha], [b2, deckY, scz + hb], [b2, deckY, scz - hb], [a, deckY, scz - ha], [0, 1, 0], (p) => [p[0], p[2]], hex("#a07a50"));
    }
    // the stern's end
    K.quad("lm.Concrete034", [sx0, Ht, scz + halfAt(sx0)], [sx0, Ht, scz - halfAt(sx0)], [sx0, deckY, scz - halfAt(sx0)], [sx0, deckY, scz + halfAt(sx0)], [-1, 0, 0], (p) => [p[2] * 0.3, p[1] * 0.3], white);
  }
  // the infinity pool along the front edge, loungers, palms, cabanas, the sky bar at the bow
  {
    const px0 = X(18),
      px1 = X(150),
      wz1 = scz + shw - 0.66,
      pzz0 = wz1 - 4;
    K.box("lm.Marble021", px0 - 0.33, deckY, pzz0 - 0.33, px1 + 0.33, deckY + 0.1, wz1, hex("#e8e4dc"));
    K.box("lm.glow", px0, deckY + 0.1, pzz0, px1, deckY + 0.12, wz1 + 0.3, hex("#4ac8f0", 0.9));
    if (!c.far) {
      for (let x = px0 + 0.66; x < px1 - 1; x += 1.66) {
        K.box("lm.paint", x, deckY, pzz0 - 2, x + 0.66, deckY + 0.35, pzz0 - 0.66, hex("#f4f4f4"));
        K.quad("lm.paint", [x, deckY + 0.35, pzz0 - 2], [x + 0.66, deckY + 0.35, pzz0 - 2], [x + 0.66, deckY + 0.9, pzz0 - 2.3], [x, deckY + 0.9, pzz0 - 2.3], [0, 0.5, -0.86], (p) => [p[0], p[1]], hex("#f4f4f4"));
      }
      for (let x = X(24); x < X(146); x += 14 * u) c.ex.trees.push([x, deckY, scz - 2, "palm", Math.floor(x * 3)]);
      for (let x = X(30); x < X(140); x += 28 * u) {
        const cz0 = scz - shw + 1;
        K.box("lm.Wood049", x, deckY, cz0, x + 2.33, deckY + 0.33, cz0 + 2, hex("#d8cfc0"));
        for (const [qx, qz] of [
          [x, cz0],
          [x + 2.2, cz0],
          [x, cz0 + 1.9],
          [x + 2.2, cz0 + 1.9],
        ])
          K.cyl("lm.Wood049", qx + 0.06, qz + 0.06, 0.06, 0.06, deckY, deckY + 2.3, hex("#8a6440"), { sides: 6 });
        K.loft("fabric", [
          { y: deckY + 2.3, pts: roundRect(x + 1.16, cz0 + 1, 1.4, 1.2, 0.1, 1) },
          { y: deckY + 3, pts: roundRect(x + 1.16, cz0 + 1, 0.2, 0.2, 0.05, 1) },
        ], hex("#f4f0e8"), { lid: null });
      }
    }
    const bx0 = X(150 + 2),
      bx1 = X(150 + 18);
    K.box("lm.glass", bx0, deckY, scz - 7 * u, bx1, deckY + 8 * u, scz + 7 * u, hex("#9ab8cc"), { skip: "-y" });
    lit(c, "bar", bx0 + 0.3, bx1 - 0.3, deckY, deckY + 8 * u - 0.3, scz + 7 * u - 0.6, 2);
    K.box("lm.Wood049", bx0 - 0.66, deckY + 8 * u, scz - 9 * u, bx1 + 0.66, deckY + 10 * u, scz + 9 * u, hex("#8a6440"));
    K.box("lm.glow", bx0 - 0.66, deckY + 7.6 * u, scz + 9 * u, bx1 + 0.66, deckY + 8 * u, scz + 9 * u + 0.05, gold);
  }
  // the name board along the hull's front
  K.box("lm.dark", X(40), deckY - 9 * u, scz + shw, X(142), deckY - 1 * u, scz + shw + 0.33, hex("#1a1820"));
  K.box("lm.glow", X(39), deckY - 10 * u, scz + shw, X(143), deckY - 9 * u, scz + shw + 0.66, gold);
  // the lotus: the casino entrance, white petals in two rings round a glass drum
  {
    const lcx = mid,
      lcz = pz1 + 5 * u;
    K.cyl("lm.glass", lcx, lcz, 5 * u, 5 * u, 0.12, 12 * u, hex("#c8dce8"), { sides: 24 });
    lit(c, "lobby", lcx - 1.5, lcx + 1.5, 0.12, 9 * u, lcz + 5 * u + 0.02);
    for (const [ring, n, off, hh, rr] of [
      [0, 8, 0, 26, 11],
      [1, 8, Math.PI / 8, 20, 8],
    ] as [number, number, number, number, number][])
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2 + off;
        // (the door's side: leave the front petal of the outer ring out, so the doors stay open)
        if (ring === 0 && Math.abs(Math.sin(a0) - 1) < 0.05) continue;
        const L = c.far ? 4 : 10;
        const edge: [V3, V3][] = [];
        for (let h = 0; h <= L; h++) {
          const t = h / L;
          const rad = (2.5 + (rr - 2.5) * Math.pow(t, 1.25)) * u;
          const half = (0.26 - 0.22 * t * t) * (ring ? 0.9 : 1);
          const y = 0.12 + t * hh * u;
          edge.push([
            [lcx + Math.cos(a0 - half) * rad, y, lcz + Math.sin(a0 - half) * rad],
            [lcx + Math.cos(a0 + half) * rad, y, lcz + Math.sin(a0 + half) * rad],
          ]);
        }
        for (let h = 0; h < L; h++) {
          const [p0, p1] = edge[h],
            [q0, q1] = edge[h + 1];
          const nn: V3 = [Math.cos(a0), 0.3, Math.sin(a0)];
          K.quad("lm.paint", p0, p1, q1, q0, nn, (p) => [p[0], p[1]], hex("#f6f3ee"));
          K.quad("lm.paint", q0, q1, p1, p0, [-nn[0], -nn[1], -nn[2]], (p) => [p[0], p[1]], hex("#e6e0d6"));
        }
        K.sphere("lm.glow.night", lcx + Math.cos(a0) * 3.5 * u, 0.2, lcz + Math.sin(a0) * 3.5 * u, 0.15, hex(ring ? "#ff8ac8" : "#fff0d0"), { segs: 4 });
      }
  }
  // the drop-off canopies either side, gold-lit edges
  for (const [cx0, cx1] of [
    [mid - 66 * u, mid - 16 * u],
    [mid + 16 * u, mid + 66 * u],
  ]) {
    K.box("lm.Concrete034", cx0, 14 * u, pz1 - 0.33, cx1, 16 * u, pz1 + 7 * u, hex("#f0ece4"));
    K.box("lm.glow", cx0, 14 * u - 0.12, pz1 + 7 * u - 0.33, cx1, 14 * u, pz1 + 7 * u, gold);
    if (!c.far) for (let x = cx0 + 1; x < cx1; x += 2) K.cyl("lm.glow.night", x, pz1 + 3 * u, 0.15, 0.15, 14 * u - 0.02, 14 * u, hex("#fff4d8"), { sides: 8, caps: "none" });
    for (const x of [cx0 + 1.2, cx1 - 1.2]) K.cyl("lm.chrome", x, pz1 + 5.5 * u, 0.14, 0.14, 0.12, 14 * u, hex("#c8c2b6"), { sides: 10 });
  }
  // the promenade: palms in planters, lamps, benches
  for (let x = X(8); x < X(mw - 6); x += 20 * u) {
    if (Math.abs(x - mid) < 26 * u) continue;
    planter(c, x + 0.33, c.D / 2 - 1.66, 2, 1.33, hex("#c8c0b0"), 0.12);
    c.ex.trees.push([x + 0.33, 0.72, c.D / 2 - 1.66, "palm", Math.floor(x)]);
  }
  for (const x of [X(4), mid - 24 * u, mid + 24 * u, X(mw - 5)]) c.ex.props.push(["lamp", x, 0.12, c.D / 2 - 0.6, 0, "#ffd08a"]);
  c.ex.props.push(["bench", X(20), 0.12, c.D / 2 - 1, 0], ["bench", X(mw - 24), 0.12, c.D / 2 - 1, 0]);
  void whiteDark;
});

/** A half ellipsoid of glass (a conservatory): ribs on meridians, rings; open at the front low down (`open`). */
function conservatory(c: LmCtx, cx: number, cz: number, rx: number, rz: number, h: number, y0: number) {
  const K = c.K;
  const NR = c.far ? 6 : 14,
    NS = c.far ? 20 : 40;
  const rings: { y: number; pts: V2[] }[] = [];
  for (let i = 0; i <= NR; i++) {
    const t = (i / NR) * (Math.PI / 2) * 0.97;
    const s = Math.cos(t);
    rings.push({ y: y0 + Math.sin(t) * h, pts: circle(0, 0, 1, NS).map(([a, b2]) => [cx + a * rx * s, cz + b2 * rz * s] as V2) });
  }
  K.loft("lm.glass.clear", rings, hex("#d8eef4"), { smooth: true, lid: "lm.glass.clear", lidCol: hex("#d8eef4") });
  if (c.far) return;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    let prev: V3 | null = null;
    for (let j = 0; j <= 10; j++) {
      const t = (j / 10) * (Math.PI / 2);
      const p: V3 = [cx + Math.cos(a) * rx * Math.cos(t) * 1.005, y0 + Math.sin(t) * h * 1.005, cz + Math.sin(a) * rz * Math.cos(t) * 1.005];
      if (prev) K.bar("lm.paint", prev, p, 0.18, hex("#eef0f2"));
      prev = p;
    }
  }
  for (let j = 1; j < 5; j++) {
    const t = (j / 5) * (Math.PI / 2);
    const pts = circle(0, 0, 1, NS).map(([a, b2]) => [cx + a * rx * Math.cos(t) * 1.006, cz + b2 * rz * Math.cos(t) * 1.006] as V2);
    K.prism("lm.glow.night", pts, y0 + Math.sin(t) * h - 0.08, y0 + Math.sin(t) * h + 0.08, hex("#d8f0ff"), { lid: null, smooth: true });
  }
  // the ring of the footing, its uplights
  K.prism("lm.Marble021", circle(cx, cz, 1, NS).map(([a, b2]) => [cx + (a - cx) * (rx + 0.33), cz + (b2 - cz) * (rz + 0.33)] as V2), y0 - 0.1, y0 + 0.33, hex("#d8d4cc"), { lid: "lm.Marble021", lidCol: hex("#d8d4cc") });
}

def("gardens", (c) => {
  const { K, X, Z, u } = c;
  const mw = c.b.model.w,
    md = c.b.model.d;
  const flowerCols = ["#e05a8a", "#f0c040", "#f4f4f4", "#c060e0", "#ff7a4a", "#ff4a6a"].map((h2) => hex(h2));
  // ground: the lawn, a paved promenade in front, the curving path, a long flower bed
  K.box("lm.Grass004", -c.W / 2, 0, -c.D / 2, c.W / 2, 0.12, Z(md - 9), hex("#5a9a42"), { skip: "-y" });
  K.box("lm.PavingStones128", -c.W / 2, 0, Z(md - 9), c.W / 2, 0.13, c.D / 2, hex("#d0cabe"), { skip: "-y" });
  // (as the voxel builder: the lot is 51 voxels deep — the domes, the grove and the pond keep behind
  // the flower bed, the entrances open on to the promenade through it; nothing past the lot's front)
  const f = { cx: X(40), cz: Z(19), rx: 34 * u, rz: 17 * u, h: 34 * u };
  const cf = { cx: X(mw - 40), cz: Z(19), rx: 32 * u, rz: 17 * u, h: 50 * u };
  const doors: [number, number][] = [
    [f.cx, f.cz + f.rz],
    [cf.cx - 18 * u, cf.cz + cf.rz * 0.8],
  ];
  {
    // the flower bed along the promenade: drifts of colour (open in front of the doors)
    for (let x = X(4); x < X(mw - 4); x += 3 * u) {
      if (doors.some(([ex]) => Math.abs(x + 1.5 * u - ex) < 7 * u)) continue;
      const band = Math.floor(((x + c.W / 2) / u + Math.sin(x) * 3) / 9) % flowerCols.length;
      K.box("lm.Grass004", x, 0.12, Z(md - 14), x + 3 * u, 0.42, Z(md - 10), flowerCols[band]);
    }
  }
  // the Flower Dome (left): terraced beds and olive trees inside
  for (let ring = 0; ring < 3; ring++) {
    const rr = 0.85 - ring * 0.25;
    const pts = circle(0, 0, 1, 32).map(([a, b2]) => [f.cx + a * f.rx * rr, f.cz + b2 * f.rz * rr] as V2);
    K.prism("lm.Marble021", pts, 0.12, 0.12 + (ring + 1) * 0.66, hex("#b8b0a0"), { lid: "lm.Grass004", lidCol: flowerCols[ring * 2] });
  }
  for (const [tx, tz] of [
    [24, 16],
    [56, 15],
    [40, 11],
    [40, 20],
  ])
    c.ex.trees.push([X(tx), tz === 20 ? 2.1 : 1.45, Z(tz), tz === 20 ? "broad" : "maple", tx]);
  conservatory(c, f.cx, f.cz, f.rx, f.rz, f.h, 0.12);
  // the Cloud Forest (right): a green mountain with a waterfall inside a taller dome
  {
    const rings: { y: number; pts: V2[] }[] = [];
    for (let i = 0; i <= 8; i++) {
      const y = 0.12 + (i / 8) * 44 * u;
      const rr = (11 - (i / 8) * 7) * u;
      rings.push({ y, pts: circle(0, 0, 1, 20).map(([a, b2], j) => [cf.cx + a * rr * (0.9 + 0.1 * Math.sin(j * 2.3 + i)), cf.cz + b2 * rr * (0.9 + 0.1 * Math.cos(j * 1.7 + i))] as V2) });
    }
    K.loft("lm.Grass004", rings, hex("#2f6b3c"), { smooth: true, lid: "lm.Grass004", lidCol: hex("#3d8a4a") });
    if (!c.far) {
      for (let y = 2; y < 44 * u - 2; y += 2.2) {
        const rr = (11 - ((y - 0.12) / (44 * u)) * 7) * u;
        c.ex.trees.push([cf.cx + Math.cos(y) * rr * 0.8, y, cf.cz + Math.sin(y) * rr * 0.8, "bush", Math.floor(y * 7)]);
      }
      // the waterfall down its front
      const wz = (y: number) => cf.cz + (11 - (y / (44 * u)) * 7) * u * 0.95 + 0.1;
      for (let y = 0.6; y < 38 * u; y += 1.2) K.quad("lm.glow", [cf.cx - 0.66, y, wz(y)], [cf.cx + 0.66, y, wz(y)], [cf.cx + 0.66, y + 1.2, wz(y + 1.2)], [cf.cx - 0.66, y + 1.2, wz(y + 1.2)], [0, 0.2, 1], (p) => [p[0], p[1]], hex("#cfeeff", 0.8));
      K.cyl("lm.glass", cf.cx, cf.cz + 12 * u, 4 * u, 4 * u, 0.12, 0.3, hex("#3a9ac8"), { sides: 20 });
    }
  }
  conservatory(c, cf.cx, cf.cz, cf.rx, cf.rz, cf.h, 0.12);
  // the domes' entrances: glass vestibules with white canopies, a paved apron out to the promenade
  for (const [ex, ez] of doors) {
    K.box("lm.PavingStones128", ex - 6 * u, 0, ez + 1.33, ex + 6 * u, 0.13, Z(md - 9), hex("#d0cabe"), { skip: "-y" });
    K.box("lm.glass", ex - 2, 0.12, ez - 0.66, ex + 2, 4, ez + 1.33, hex("#cfe6ee"), { skip: "-y" });
    lit(c, "lobby", ex - 1, ex + 1, 0.12, 3.3, ez + 1.35);
    K.box("lm.paint", ex - 2.33, 4, ez - 0.66, ex + 2.33, 4.33, ez + 1.66, hex("#eef0f2"));
    K.box("lm.glow", ex - 2.33, 3.95, ez + 1.6, ex + 2.33, 4.05, ez + 1.66, hex("#f4b728"));
  }
  // the Supertree grove: funnels of purple steel lattice wrapped in vertical gardens under flared crowns
  const trees: [number, number, number, number, string][] = [
    [92, 14, 54, 12, "#c060ff"],
    [112, 26, 40, 9, "#3ef0d0"],
    [140, 16, 75, 15, "#ff4ab8"],
    [168, 26, 46, 10, "#c060ff"],
    [186, 15, 66, 13, "#3ef0d0"],
    [98, 32, 30, 7, "#ff4ab8"],
    [182, 32, 34, 8, "#c060ff"],
  ];
  const latt = hex("#6e2a5e");
  for (const [tvx, tvz, th, cr, glow] of trees) {
    const tx = X(tvx + 0.5),
      tz = Z(tvz + 0.5);
    const r0 = 3.2 * u,
      TH = th * u,
      crownStart = Math.round(th * 0.74) * u;
    const rAt = (h: number) => r0 + (cr * 0.55 * u - r0) * Math.pow(Math.min(1, h / crownStart), 2.6);
    // the planted ring at its foot, uplights
    K.cyl("lm.Marble021", tx, tz, r0 + 2.6 * u, r0 + 2.6 * u, 0.12, 0.6, hex("#8a8478"), { sides: 24 });
    K.cyl("lm.Grass004", tx, tz, r0 + 2.3 * u, r0 + 2.3 * u, 0.6, 0.65, hex("#3d7a3a"), { sides: 24 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      K.sphere("lm.glow.night", tx + Math.cos(a) * (r0 + 2.4 * u), 0.68, tz + Math.sin(a) * (r0 + 2.4 * u), 0.12, hex(glow), { segs: 4 });
    }
    // the funnel: the vertical garden (a green loft), the lattice of helices over it
    const NRg = c.far ? 4 : 10;
    const rings: { y: number; pts: V2[] }[] = [];
    for (let i = 0; i <= NRg; i++) {
      const y = 0.65 + (i / NRg) * (crownStart - 0.65);
      rings.push({ y, pts: circle(tx, tz, rAt(y) * 0.94, c.far ? 10 : 18) });
    }
    K.loft("lm.Grass004", rings, hex("#2f6b3c"), { smooth: true, lid: null });
    if (!c.far) {
      for (const dir of [1, -1])
        for (let i = 0; i < 8; i++) {
          let prev: V3 | null = null;
          for (let j = 0; j <= 12; j++) {
            const y = 0.65 + (j / 12) * (crownStart - 0.65);
            const a = (i / 8) * Math.PI * 2 + dir * (j / 12) * Math.PI * 0.9;
            const r = rAt(y);
            const p: V3 = [tx + Math.cos(a) * r, y, tz + Math.sin(a) * r];
            if (prev) K.bar("lm.paint", prev, p, 0.16, latt);
            prev = p;
          }
        }
      for (let y = 6 * u; y < crownStart; y += 6 * u) K.cyl("lm.glow.night", tx, tz, rAt(y) + 0.03, rAt(y) + 0.03, y - 0.05, y + 0.05, hex(glow, 0.8), { sides: 20, caps: "none" });
      // flowers in the garden
      for (let k2 = 0; k2 < 14; k2++) {
        const y = 1.5 + c.r() * (crownStart - 2);
        const a = c.r() * Math.PI * 2;
        K.sphere("lm.paint", tx + Math.cos(a) * rAt(y), y, tz + Math.sin(a) * rAt(y), 0.22, flowerCols[k2 % flowerCols.length], { segs: 4 });
      }
    }
    // the core up through the crown, its cap
    K.cyl("lm.paint", tx, tz, r0 * 0.9, r0 * 0.9, crownStart, TH, hex("#3e2236"), { sides: 14 });
    K.cyl("lm.paint", tx, tz, r0 + 0.33, r0 + 0.33, TH, TH + 0.33, hex("#7a3a6a"), { sides: 14 });
    // the crown: radial ribs flaring out and up, two rings, the rim lit at night
    const ribs = c.far ? 8 : 14;
    const rimR = cr * u;
    for (let i = 0; i < ribs; i++) {
      const a = (i / ribs) * Math.PI * 2 + tvx;
      let prev: V3 = [tx + Math.cos(a) * rAt(crownStart), crownStart, tz + Math.sin(a) * rAt(crownStart)];
      for (let j = 1; j <= 5; j++) {
        const t = j / 5;
        const rr = cr * 0.55 * u + (rimR - cr * 0.55 * u) * Math.sqrt(t);
        const p: V3 = [tx + Math.cos(a) * rr, crownStart + t * (TH - crownStart), tz + Math.sin(a) * rr];
        K.bar("lm.paint", prev, p, 0.22, latt);
        prev = p;
      }
      K.bar("lm.paint", [tx + Math.cos(a) * r0, TH, tz + Math.sin(a) * r0], prev, 0.16, latt);
    }
    for (const t of [0.5, 1]) {
      const rr = cr * 0.55 * u + (rimR - cr * 0.55 * u) * Math.sqrt(t);
      const y = crownStart + t * (TH - crownStart);
      K.cyl(t === 1 ? "lm.glow.night" : "lm.paint", tx, tz, rr, rr, y - 0.12, y + 0.12, t === 1 ? hex(glow) : latt, { sides: c.far ? 16 : 40, caps: "none" });
    }
    c.ex.trees.push([tx + r0 + 1.6 * u, 0.65, tz, "bush", tvx], [tx - r0 - 1.6 * u, 0.65, tz, "bush", tvx + 1]);
  }
  // the skyway between the two tallest trees: a deck on cables, glass sides, a teal line under it
  {
    const [a, b2] = [trees[2], trees[4]];
    const sy = 44 * u;
    const ra = (3.2 + (a[3] * 0.55 - 3.2) * Math.pow(Math.min(1, 44 / Math.round(a[2] * 0.74)), 2.6)) * u;
    const rb = (3.2 + (b2[3] * 0.55 - 3.2) * Math.pow(Math.min(1, 44 / Math.round(b2[2] * 0.74)), 2.6)) * u;
    const x0 = X(a[0] + 0.5) + ra,
      x1 = X(b2[0] + 0.5) - rb;
    const N = 16;
    for (let i = 0; i < N; i++) {
      const t0 = i / N,
        t1 = (i + 1) / N;
      const xa = x0 + (x1 - x0) * t0,
        xb = x0 + (x1 - x0) * t1;
      const za = Z(a[1] + 0.5 + (b2[1] - a[1]) * t0),
        zb = Z(a[1] + 0.5 + (b2[1] - a[1]) * t1);
      const ya = sy - Math.sin(t0 * Math.PI) * 0.5,
        yb = sy - Math.sin(t1 * Math.PI) * 0.5;
      K.quad("lm.Metal032.metal", [xa, ya, za + 0.9], [xb, yb, zb + 0.9], [xb, yb, zb - 0.7], [xa, ya, za - 0.7], [0, 1, 0], (p) => [p[0], p[2]], hex("#6a6672"));
      K.quad("lm.Metal032.metal", [xa, ya - 0.3, za - 0.7], [xb, yb - 0.3, zb - 0.7], [xb, yb - 0.3, zb + 0.9], [xa, ya - 0.3, za + 0.9], [0, -1, 0], (p) => [p[0], p[2]], hex("#6a6672"));
      K.bar("lm.glow.night", [xa, ya - 0.32, za + 0.1], [xb, yb - 0.32, zb + 0.1], 0.08, hex("#3ef0d0"));
      for (const dz of [-0.7, 0.9]) {
        K.quad("lm.glass", [xa, ya, za + dz], [xb, yb, zb + dz], [xb, yb + 1.1, zb + dz], [xa, ya + 1.1, za + dz], [0, 0, Math.sign(dz)], (p) => [p[0], p[1]], hex("#d8ecf4"));
        K.bar("lm.paint", [xa, ya + 1.15, za + dz], [xb, yb + 1.15, zb + dz], 0.08, hex("#c05a9a"));
      }
    }
  }
  // the dragonfly pond in front of the grove, bronze dragonflies on poles
  {
    const pcx = X(140),
      pcz = Z(27);
    const pts = circle(0, 0, 1, 40).map(([a, b2]) => [pcx + a * 18 * u, pcz + b2 * 4 * u] as V2);
    K.prism("lm.Marble021", pts.map(([x, z]) => [pcx + (x - pcx) * 1.08, pcz + (z - pcz) * 1.25] as V2), 0.12, 0.45, hex("#b8b0a0"), { lid: "lm.Marble021", lidCol: hex("#c8c0b0") });
    K.prism("lm.glass", pts, 0.12, 0.47, hex("#2e7aa0"), { lid: "lm.glass", lidCol: hex("#2e7aa0") });
    if (!c.far)
      for (const [dx, dz, h, dir] of [
        [-14, 0, 9, 1],
        [12, -1, 12, -1],
        [0, 2, 7, 1],
      ]) {
        const x = pcx + dx * u,
          z = pcz + dz * u,
          y = h * u;
        K.cyl("lm.Metal032.metal", x, z, 0.06, 0.06, 0.47, y, hex("#5a4a3a"), { sides: 6 });
        K.bar("lm.Metal032.metal", [x - 4 * u * dir, y, z], [x + 4 * u * dir, y, z], 0.18, hex("#8a6a3a"));
        K.sphere("lm.glow", x + 5 * u * dir, y, z, 0.2, hex("#3ef0d0"), { segs: 6 });
        for (const wo of [1.5, -0.5])
          for (const sz of [1, -1]) K.quad("lm.glass", [x + wo * u * dir, y + 0.15, z], [x + (wo + 1.2) * u * dir, y + 0.15, z], [x + (wo + 1) * u * dir, y + 0.2, z + sz * 6 * u], [x + (wo + 0.2) * u * dir, y + 0.2, z + sz * 6 * u], [0, 1, 0], (p) => [p[0], p[2]], hex("#a8d8e0"));
      }
  }
  // the name sign's plinth in the flower bed: a low dark kerb now the name hangs high under the
  // skyway (a black wall there stood across the way in, and the game took it for the facade)
  K.box("lm.dark", X(110), 0.12, Z(md - 17), X(170), 0.7, Z(md - 16), hex("#3a2a3a"));
  K.box("lm.Marble021", X(109), 0.12, Z(md - 18), X(171), 0.45, Z(md - 15), hex("#8a8478"));
  // lawn life: trees, palms, benches, lamps along the promenade
  for (const [x, z] of [
    [82, 34],
    [80, 6],
    [116, 6],
    [162, 6],
  ])
    c.ex.trees.push([X(x), 0.12, Z(z), "broad", x]);
  for (const x of [6, 74, 214, mw - 8]) c.ex.trees.push([X(x), 0.42, Z(md - 12), "palm", x]);
  for (let x = 20; x < mw - 20; x += 36) c.ex.props.push(["bench", X(x), 0.13, Z(md - 8), 0]);
  for (let x = 12; x < mw; x += 44) c.ex.props.push(["lamp", X(x), 0.13, Z(md - 3), 0, "#e8d0ff"]);
});

/** A shipping container (2.6 m square section) from its lowest corner, `len` metres along x (or z), ribbed sides. */
function container(c: LmCtx, x: number, y: number, z: number, len: number, col: V3, alongZ = false) {
  const K = c.K;
  const s = 8 * c.u;
  const [w, d] = alongZ ? [s, len] : [len, s];
  K.box("lm.Metal032", x, y, z, x + w, y + s, z + d, col);
  const dk: V3 = [col[0] * 0.55, col[1] * 0.55, col[2] * 0.55];
  if (!c.far) {
    // the corrugation: thin ribs along the long sides
    const L = alongZ ? d : w;
    for (let a = 0.3; a < L - 0.2; a += 0.33) {
      if (alongZ) for (const xx of [x - 0.04, x + w]) K.box("lm.Metal032", xx, y + 0.15, z + a, xx + 0.04, y + s - 0.15, z + a + 0.12, col, { skip: "-y+y" });
      else for (const zz of [z - 0.04, z + d]) K.box("lm.Metal032", x + a, y + 0.15, zz, x + a + 0.12, y + s - 0.15, zz + 0.04, col, { skip: "-y+y" });
    }
    // corner posts, the rails top and bottom, the doors' locking bars
    for (const [a, b2] of [
      [x, z],
      [x + w - 0.15, z],
      [x, z + d - 0.15],
      [x + w - 0.15, z + d - 0.15],
    ])
      K.box("lm.Metal032", a, y, b2, a + 0.15, y + s, b2 + 0.15, dk);
    if (!alongZ) for (const t of [0.35, 0.6, 1.9, 2.15]) K.box("lm.Metal032", x + w, y + 0.2, z + t, x + w + 0.04, y + s - 0.2, z + t + 0.05, dk);
    else for (const t of [0.35, 0.6, 1.9, 2.15]) K.box("lm.Metal032", x + t, y + 0.2, z + d, x + t + 0.05, y + s - 0.2, z + d + 0.04, dk);
  }
}

/** hcyl's twin lying along z (from z0 to z1), its axis at height y over x. */
function zcyl(c: LmCtx, s: Slot, z0: number, z1: number, y: number, x: number, r: number, col: V3, o: { sides?: number } = {}) {
  const n = o.sides ?? 16,
    da = (Math.PI * 2) / n;
  const P = (a: number, z: number): V3 => [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
  for (let i = 0; i < n; i++) {
    const a = i * da,
      b2 = a + da;
    const na: V3 = [Math.cos(a), Math.sin(a), 0],
      nb: V3 = [Math.cos(b2), Math.sin(b2), 0];
    c.K.quad(s, P(a, z0), P(b2, z0), P(b2, z1), P(a, z1), [Math.cos(a + da / 2), Math.sin(a + da / 2), 0], (p) => [p[2] * 0.5, Math.atan2(p[1] - y, p[0] - x) * r * 0.5], col, [na, nb, nb, na]);
    for (const [z, sz] of [
      [z0, -1],
      [z1, 1],
    ] as const)
      c.K.tri(s, [x, y, z], P(a, z), P(b2, z), [0, 0, sz], (p) => [p[0] * 0.5, p[1] * 0.5], col);
  }
}

/** The same lorry lying along x: the trailer's tail at x = tail, the cab out toward +x, centred on z. */
function lorryX(c: LmCtx, tail: number, z: number, cab: V3, cargo: V3) {
  const K = c.K;
  const w = 2.5,
    z0 = z - w / 2,
    z1 = z + w / 2;
  const nose = tail + 16;
  K.box("lm.dark", tail, 0.6, z0 + 0.3, nose - 3, 0.9, z1 - 0.3, hex("#2a2a30"));
  K.box("lm.Metal032", tail, 1.0, z0, tail + 12.5, 4.0, z1, cargo);
  K.loft("lm.chrome", [
    { y: 0.6, pts: roundRect(nose - 1.6, z, 1.55, w / 2, 0.3, 2) },
    { y: 2.0, pts: roundRect(nose - 1.6, z, 1.55, w / 2, 0.3, 2) },
    { y: 3.2, pts: roundRect(nose - 1.75, z, 1.4, w / 2 - 0.08, 0.35, 2) },
  ], cab, { lid: "lm.chrome", lidCol: cab });
  K.quad("lm.glass", [nose - 0.06, 2.05, z0 + 0.15], [nose - 0.06, 2.05, z1 - 0.15], [nose - 0.36, 3.0, z1 - 0.2], [nose - 0.36, 3.0, z0 + 0.2], [1, 0.3, 0], (p) => [p[2], p[1]], hex("#20262c"));
  for (const xx of [nose - 1.2, tail + 3.2, tail + 1.8]) zcyl(c, "lm.dark", z0 - 0.05, z1 + 0.05, 0.5, xx, 0.5, hex("#151517"), { sides: 10 });
}

/** A tractor unit and its box trailer, backed onto a dock: the trailer's tail at z = tail, the cab out toward −z. */
function lorry(c: LmCtx, x: number, tail: number, cab: V3, cargo: V3) {
  const K = c.K;
  const w = 2.5;
  const nose = tail - 16;
  K.box("lm.dark", x + 0.3, 0.6, nose + 3, x + w - 0.3, 0.9, tail, hex("#2a2a30"));
  K.box("lm.Metal032", x, 1.0, tail - 12.5, x + w, 4.0, tail, cargo);
  // the cab: rounded, a windscreen, lamps
  K.loft("lm.chrome", [
    { y: 0.6, pts: roundRect(x + w / 2, nose + 1.6, w / 2, 1.55, 0.3, 2) },
    { y: 2.0, pts: roundRect(x + w / 2, nose + 1.6, w / 2, 1.55, 0.3, 2) },
    { y: 3.2, pts: roundRect(x + w / 2, nose + 1.75, w / 2 - 0.08, 1.4, 0.35, 2) },
  ], cab, { lid: "lm.chrome", lidCol: cab });
  K.quad("lm.glass", [x + 0.15, 2.05, nose + 0.06], [x + w - 0.15, 2.05, nose + 0.06], [x + w - 0.2, 3.0, nose + 0.36], [x + 0.2, 3.0, nose + 0.36], [0, 0.3, -1], (p) => [p[0], p[1]], hex("#20262c"));
  for (const zz of [nose + 1.2, tail - 3.2, tail - 1.8]) hcyl(c, "lm.dark", x - 0.05, x + w + 0.05, 0.5, zz, 0.5, hex("#151517"), { sides: 10 });
}

def("port", (c) => {
  const { K, X, Z, u } = c;
  const mw = c.b.model.w,
    md = c.b.model.d;
  const Dv = md - 24; // the quay's edge (the booms reach 24 voxels past it over the river)
  const QUAY = 136,
    RAIL = 125,
    LANE = 26,
    PS = 204;
  const DEP = { x0: 8, x1: 54, z0: 64, z1: 120, h: 30 };
  const HALL = { x0: 62, x1: 176, z0: 60, z1: 122, h: 44 };
  const DCB = { x0: 182, x1: 204, z0: 62, z1: 122, h: 36 };
  const DCA = { x0: 174, x1: 198, z0: 8, z1: 54, h: 36 };
  const MID = 119,
    BELT = 95;
  const V = (x: number, y: number, z: number): V3 => [X(x), y * u, Z(z)];
  const B = (s: Slot, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: V3, o: { skip?: string; fh?: number } = {}) => K.box(s, X(x0), y0 * u, Z(z0), X(x1), y1 * u, Z(z1), col, o);
  const violet = hex("#b07bff"),
    yellow = hex("#e8b830");
  const BOX = ["#c0392b", "#2a6db0", "#e0a020", "#2f8a4a", "#d8d4cc", "#7a3a8a", "#e06a20", "#3a3a42", "#1a9a9a", "#a8452a", "#4aa8d8", "#f4b728"].map((h2) => hex(h2));
  // ---- ground: asphalt, the quay's concrete apron with its yellow edge, bollards, the lane, the siding ----
  B("lm.Concrete019", 0, 0, 0, mw, 0.36, QUAY, hex("#4a4950"), { skip: "-y" });
  B("lm.Concrete031", 0, 0, QUAY, mw, 0.38, Dv, hex("#8c8892"), { skip: "-y" });
  B("lm.paint", 0, 0.38, Dv - 3, PS, 0.4, Dv - 2, yellow);
  if (!c.far) for (let x = 8; x < PS; x += 20) K.cyl("lm.dark", X(x + 1), Z(Dv - 4), 0.3, 0.25, 0.38 * u, 1.0, hex("#2a2a32"), { sides: 10 });
  for (let x = 8; x < 172; x += 10) B("lm.paint", x, 0.36, LANE - 0.15, x + 5, 0.38, LANE + 0.15, hex("#e8e4dc"));
  for (const z of [LANE - 7, LANE + 7]) B("lm.paint", 8, 0.36, z - 0.1, 172, 0.38, z + 0.1, hex("#d8d4cc"));
  // the visitors' walk to the factory: green, a zebra across the lane
  B("lm.paint", MID - 5, 0.36, 1, MID + 6, 0.38, HALL.z0, hex("#2f7a4a"));
  for (let x = MID - 5; x < MID + 6; x += 4) B("lm.paint", x, 0.38, LANE - 7, x + 2, 0.4, LANE + 7, hex("#ecebe6"));
  // the rail siding: ballast, sleepers, two rails
  B("lm.Gravel022", 0, 0.36, RAIL, PS, 0.66, RAIL + 8, hex("#6a645c"));
  if (!c.far) for (let x = 0; x < PS; x += 2) B("lm.Wood049", x, 0.66, RAIL + 1, x + 1, 0.9, RAIL + 7, hex("#4a3626"));
  for (const z of [RAIL + 2, RAIL + 5]) B("lm.Metal032.metal", 0, 0.9, z, PS, 1.2, z + 0.6, hex("#8a8890"));

  // ---- the PROOF FACTORY: the mining hall under its sawtooth roof ----
  {
    const { x0, x1, z0, z1, h } = HALL;
    B("lm.Metal032", x0, 0.36, z0, x1, h, z1, hex("#46415a"), { skip: "-y" });
    B("lm.Concrete031", x0 - 0.1, 0.36, z0 - 0.1, x1 + 0.1, 4, z1 + 0.1, hex("#5a5862"), { skip: "-y" });
    if (!c.far) for (let y = 8; y < h; y += 8) B("lm.dark", x0 - 0.12, y, z0 - 0.12, x1 + 0.12, y + 0.3, z1 + 0.12, hex("#2e2a38"), { skip: "-y+y" });
    // the sawtooth: each tooth's glazing faces the back (−z), lit violet at night; its slope runs down to the next
    const T = 10;
    for (let z = z0; z < z1; z += T) {
      const za = Z(z),
        zb = Z(Math.min(z + T, z1));
      const yb = h * u,
        yt = (h + 9) * u;
      K.quad("lm.glass", [X(x1), yb, za], [X(x0), yb, za], [X(x0), yt, za], [X(x1), yt, za], [0, 0, -1], (p) => [p[0] * 0.3, p[1] * 0.3], hex("#8f7cc8"));
      if (!c.far) for (let x = x0; x <= x1; x += 4) B("lm.dark", x - 0.15, h, z - 0.15, x + 0.15, h + 9, z + 0.15, hex("#2a2632"));
      const l = Math.hypot(zb - za, yt - yb);
      K.quad("lm.Metal032", [X(x0), yt, za], [X(x0), yb, zb], [X(x1), yb, zb], [X(x1), yt, za], [0, (zb - za) / l, (yt - yb) / l], (p) => [p[0] * 0.5, p[2] * 0.5], hex("#4a4656"));
      for (const [xx, nx] of [
        [X(x0), -1],
        [X(x1), 1],
      ] as const)
        K.tri("lm.Metal032", [xx, yb, za], [xx, yb, zb], [xx, yt, za], [nx, 0, 0], (p) => [p[2], p[1]], hex("#3a3646"));
      K.quad("lm.glow.night", [X(x1), yb + 0.05, za - 0.02], [X(x0), yb + 0.05, za - 0.02], [X(x0), yt - 0.3, za - 0.02], [X(x1), yt - 0.3, za - 0.02], [0, 0, -1], (p) => [p[0], p[1]], hex("#8f7cc8", 0.35));
    }
    // the violet band round the eaves, violet uprights at the corners
    B("lm.glow", x0 - 0.33, h - 2, z0 - 0.33, x1 + 0.33, h - 1.5, z0, violet);
    B("lm.glow", x0 - 0.33, h - 2, z0, x0, h - 1.5, z1, violet);
    for (const x of [x0 - 0.33, x1]) B("lm.glow", x, 4, z0 - 0.33, x + 0.33, h - 2, z0, violet);
    // the LED panels along the long face, the dark board for the big live screen, the sign's backing
    if (!c.far)
      for (let x = x0 + 2; x < x1 - 2; x += 7) {
        B("lm.dark", x, 17, z0 - 0.12, x + 5, 29, z0, hex("#1a1822"));
        for (let y = 18; y < 29; y += 2) B("lm.glow.night", x + 0.5, y, z0 - 0.14, x + 4.5, y + 0.5, z0 - 0.12, [violet, hex("#59e3ff"), hex("#f4b728")][(x + y) % 3]);
      }
    B("lm.dark", x0 + 8, 30, z0 - 2, x1 - 8, 43, z0 - 1, hex("#141219"));
    B("lm.glow", x0 + 8, 29.5, z0 - 2, x1 - 8, 30, z0 - 1, violet);
    // the entrance: a lit glass front, a canopy on two posts; the screen's frame over it, bulbs in gold
    lit(c, "lobby", X(MID - 9), X(MID + 10), 0.36 * u, 12 * u, Z(z0) - 0.4);
    K.quad("glass", [X(MID + 10), 0.36 * u, Z(z0) - 0.36], [X(MID - 9), 0.36 * u, Z(z0) - 0.36], [X(MID - 9), 12 * u, Z(z0) - 0.36], [X(MID + 10), 12 * u, Z(z0) - 0.36], [0, 0, -1], (p) => [p[0], p[1]], [0.99, 0.5, 0.8]);
    B("lm.dark", MID - 11, 13, z0 - 10, MID + 12, 15, z0, hex("#2a2632"));
    B("lm.glow", MID - 11, 15, z0 - 10, MID + 12, 15.5, z0 - 9, violet);
    for (const x of [MID - 11, MID + 11]) K.cyl("lm.Metal032.metal", X(x + 0.5), Z(z0 - 9.5), 0.18, 0.18, 0.36 * u, 13 * u, hex("#5a5862"), { sides: 10 });
    if (!c.far) for (let x = MID - 8; x < MID + 9; x += 4) K.cyl("lm.glow.night", X(x + 0.5), Z(z0 - 5), 0.2, 0.2, 13 * u - 0.02, 13 * u, hex("#fff2d8"), { sides: 8, caps: "none" });
    B("lm.dark", MID - 5, 20, z0 - 2, MID + 6, 29, z0, hex("#121117"));
    B("lm.glow", MID - 5.3, 19.7, z0 - 2.1, MID + 6.3, 20, z0 - 1.9, hex("#f4b728"));
    B("lm.glow", MID - 5.3, 29, z0 - 2.1, MID + 6.3, 29.3, z0 - 1.9, hex("#f4b728"));
    B("lm.dark", MID - 6, 19, z0 - 5, MID + 7, 20, z0, hex("#3a3646"));
    // the docks: yellow frames, roller doors (the live one open, lit, its pallets)
    for (const bx of [72, 88, 136, 152, 166]) {
      const live = bx === 152;
      if (live) {
        B("lm.Concrete031", bx - 5, 0.36, z0, bx + 5, 1, z0 + 6, hex("#5a5862"));
        lit(c, "market", X(bx - 5), X(bx + 5), 1 * u, 13 * u, Z(z0 + 6));
        for (let x = bx - 4; x < bx + 4; x += 3) B("lm.Wood049", x, 1, z0 + 4, x + 2, 4, z0 + 6, hex("#8a6a44"));
      } else {
        B("lm.Metal032", bx - 5, 0.36, z0 - 0.4, bx + 5, 13, z0, hex("#8a8692"));
        if (!c.far) for (let y = 1; y < 13; y += 1) B("lm.dark", bx - 5, y, z0 - 0.45, bx + 5, y + 0.12, z0 - 0.4, hex("#6a6672"), { skip: "-y+y" });
      }
      B("lm.paint", bx - 6, 13, z0 - 0.6, bx + 6, 14, z0, yellow);
      for (const x of [bx - 6, bx + 5]) B("lm.paint", x, 0.36, z0 - 0.6, x + 1, 13, z0, yellow);
      for (const x of [bx - 6, bx + 5]) B("lm.dark", x, 3, z0 - 1.6, x + 1, 7, z0 - 0.6, hex("#1c1c20"));
      for (const x of [bx - 6, bx + 5]) B("lm.paint", x + 0.3, 0.36, z0 - 22, x + 0.7, 0.4, z0 - 1, yellow);
    }
    // the conveyor bridge from the hall out over the court to the loading tower, its press on the hall
    B("lm.dark", BELT - 6, 25, z0 - 4, BELT + 7, 38, z0, hex("#2c2836"));
    B("lm.glow", BELT - 3, 30, z0 - 5, BELT + 4, 35, z0 - 4, hex("#f4b728"));
    B("lm.Metal032", BELT - 4, 26, 20, BELT + 5, 28, z0 - 4, hex("#3a3744"));
    B("lm.dark", BELT - 3, 28, 20, BELT + 4, 28.6, z0 - 4, hex("#141318"));
    if (!c.far)
      for (const x of [BELT - 4, BELT + 4]) {
        B("lm.glow", x, 30, 20, x + 0.4, 30.4, z0 - 4, violet);
        B("lm.Metal032.metal", x, 36, 20, x + 1, 37, z0 - 4, hex("#5a5666"));
        for (let z = 20; z < z0 - 4; z += 6) {
          K.bar("lm.Metal032.metal", V(x + 0.5, 28, z), V(x + 0.5, 36.5, z + 3), 0.15, hex("#5a5666"));
          K.bar("lm.Metal032.metal", V(x + 0.5, 36.5, z + 3), V(x + 0.5, 28, z + 6), 0.15, hex("#5a5666"));
        }
      }
  }
  // the loading tower over the court: four legs, the hopper, a waiting truck
  {
    const x0 = BELT - 11,
      x1 = BELT + 10,
      z0 = 3,
      z1 = 20,
      th = 42;
    for (const [x, z] of [
      [x0, z0],
      [x1 - 2, z0],
      [x0, z1 - 2],
      [x1 - 2, z1 - 2],
    ])
      B("lm.Metal032.metal", x, 0.36, z, x + 2, th, z + 2, hex("#c8c4bc"));
    if (!c.far)
      for (const z of [z0 + 1, z1 - 1]) {
        K.bar("lm.Metal032.metal", V(x0 + 1, 4, z), V(x1 - 1, 14, z), 0.18, hex("#a8a4ac"));
        K.bar("lm.Metal032.metal", V(x1 - 1, 14, z), V(x0 + 1, 24, z), 0.18, hex("#a8a4ac"));
      }
    B("lm.Metal032", x0, 24, z0, x1, 26, z1, hex("#5a5862"));
    B("lm.Metal032", x0 + 3, 26, z0 + 2, x1 - 3, 38, z1 - 1, hex("#5e5a6c"));
    B("lm.glow", x0 + 3, 33, z0 + 1.6, x1 - 3, 33.5, z0 + 2, violet);
    B("lm.Metal032", x0, th, z0, x1, th + 1, z1, hex("#3a3842"));
    // the chute
    K.loft("lm.Metal032", [
      { y: 14 * u, pts: roundRect(X(BELT + 0.5), Z(12), 0.6, 0.6, 0.1, 1) },
      { y: 24 * u, pts: roundRect(X(BELT + 0.5), Z(12), 1.6, 1.6, 0.1, 1) },
    ], hex("#3a3744"), { lid: null });
    // (the flatbed lies along x under the chute, as the voxel model's: its cab out east, all of it in the court)
    lorryX(c, X(x1 + 9) - 16, Z(12), hex("#7a52b0"), BOX[11]);
  }
  // ---- the transparent DEPOT: clear panels, a curved roof, its docks ----
  {
    const { x0, x1, z0, z1, h } = DEP;
    B("lm.Metal032", x0, 0.36, z0, x1, 16, z1, hex("#9aa6b2"), { skip: "-y" });
    B("lm.glass", x0, 16, z0, x1, h, z1, hex("#b8d8e8"), { skip: "-y+y" });
    B("lm.Concrete031", x0 - 0.1, 0.36, z0 - 0.1, x1 + 0.1, 4, z1 + 0.1, hex("#5a5862"), { skip: "-y" });
    if (!c.far) for (let x = x0; x <= x1; x += 4) B("lm.Metal032.metal", x - 0.15, 16, z0 - 0.15, x + 0.15, h, z0, hex("#8e9aa6"));
    // the barrel roof along z
    const N = c.far ? 6 : 14;
    const mid = (z0 + z1) / 2,
      hz = (z1 - z0) / 2;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI,
        a1 = ((i + 1) / N) * Math.PI;
      const P = (a: number, x: number): V3 => [X(x), (h + Math.sin(a) * 10) * u, Z(mid - Math.cos(a) * hz)];
      const nn: V3 = [0, Math.sin((a0 + a1) / 2), -Math.cos((a0 + a1) / 2)];
      K.quad("lm.Metal032", P(a0, x0 - 1), P(a0, x1 + 1), P(a1, x1 + 1), P(a1, x0 - 1), nn, (p) => [p[0] * 0.5, p[2] * 0.5], hex("#b4bcc6"));
      for (const [x, nx] of [
        [x0, -1],
        [x1, 1],
      ] as const)
        K.tri("lm.Metal032", [X(x), h * u, Z(mid)], P(a0, x), P(a1, x), [nx, 0, 0], (p) => [p[2], p[1]], hex("#8e9aa6"));
    }
    B("lm.glow", x0 - 0.33, h - 2, z0 - 0.33, x1 + 0.33, h - 1.5, z0, hex("#e8f6ff"));
    for (const bx of [18, 34, 46]) {
      const live = bx === 34;
      if (live) {
        B("lm.Concrete031", bx - 5, 0.36, z0, bx + 5, 1, z0 + 6, hex("#5a5862"));
        lit(c, "market", X(bx - 5), X(bx + 5), 1 * u, 13 * u, Z(z0 + 6));
      } else B("lm.Metal032", bx - 5, 0.36, z0 - 0.4, bx + 5, 13, z0, hex("#c4c8d0"));
      B("lm.paint", bx - 6, 13, z0 - 0.6, bx + 6, 14, z0, yellow);
      for (const x of [bx - 6, bx + 5]) B("lm.paint", x + 0.3, 0.36, z0 - 22, x + 0.7, 0.4, z0 - 1, yellow);
    }
    B("lm.dark", x0 + 1, 14, z0 - 6, x1 - 1, 15, z0, hex("#5a5862"));
    lorry(c, X(14), Z(z0 - 1), hex("#2f8a4a"), BOX[4]);
    lorry(c, X(42), Z(z0 - 1), hex("#3a3a42"), BOX[1]);
  }
  // ---- the data centres: charcoal louvred blocks, blue LED slits, fans on the roof ----
  for (const b of [DCA, DCB]) {
    const { x0, x1, z0, z1, h } = b;
    B("lm.Metal032", x0, 0.36, z0, x1, h, z1, hex("#2e3038"), { skip: "-y" });
    B("lm.Concrete031", x0 - 0.1, 0.36, z0 - 0.1, x1 + 0.1, 4, z1 + 0.1, hex("#4a4852"), { skip: "-y" });
    if (!c.far) {
      for (let x = x0 + 3; x < x1 - 2; x += 5) {
        B("lm.glow", x, 6, z0 - 0.3, x + 0.5, h - 12, z0, hex("#59e3ff"));
        for (let y = 7; y < h - 12; y += 2) B("lm.dark", x + 1, y, z0 - 0.3, x + 4, y + 0.5, z0, hex("#1c1d22"));
      }
      for (let z = z0 + 3; z < z1 - 2; z += 5) {
        B("lm.glow", x0 - 0.3, 6, z, x0, h - 12, z + 0.5, hex("#59e3ff"));
        for (let y = 7; y < h - 12; y += 2) B("lm.dark", x0 - 0.3, y, z + 1, x0, y + 0.5, z + 4, hex("#1c1d22"));
      }
      for (let x = x0 + 2; x + 8 <= x1 - 1; x += 10)
        for (let z = z0 + 2; z + 8 <= z1 - 1; z += 10) {
          K.cyl("lm.Metal032.metal", X(x + 4), Z(z + 4), 3.6 * u, 3.6 * u, (h + 1) * u, (h + 3) * u, hex("#5a5c64"), { sides: 16, caps: "none" });
          K.cyl("lm.dark", X(x + 4), Z(z + 4), 3.4 * u, 3.4 * u, (h + 1) * u, (h + 2.4) * u, hex("#1a1a1e"), { sides: 16, caps: "top" });
        }
    }
    B("lm.glow", x0 - 0.33, h - 3, z0 - 0.33, x1, h - 2.5, z1, hex("#3ef0ff"));
    B("lm.Metal032", x0 - 0.33, h, z0 - 0.33, x1 + 0.33, h + 1, z1 + 0.33, hex("#2a2c34"));
  }
  B("lm.Metal032", HALL.x1, 20, 84, DCB.x0, 27, 98, hex("#3e3a4a"));
  B("lm.glow", HALL.x1, 23, 98, DCB.x0, 23.4, 98.2, hex("#59e3ff"));
  // ---- the power station: the cooling tower, the turbine hall, the boiler house, two striped chimneys ----
  {
    // (as the voxel builder: its foot clear of the data centre, the east fence and the ring road)
    const ccx = 229,
      ccz = 32,
      CT = 78;
    const rAt = (y: number) => 16 * Math.sqrt(1 + ((y - 58) / 40.6) ** 2);
    const rings: { y: number; pts: V2[] }[] = [];
    const NC = c.far ? 8 : 18;
    for (let i = 0; i <= NC; i++) {
      const y = 6 + ((CT - 6) * i) / NC;
      rings.push({ y: y * u, pts: circle(X(ccx), Z(ccz), rAt(y) * u, c.far ? 20 : 48) });
    }
    K.loft("lm.Concrete031", rings, hex("#b8b4ae"), { smooth: true, lid: null });
    // (its inside)
    K.loft("lm.Concrete031", rings.map((r) => ({ y: r.y, pts: [...r.pts].reverse().map(([x, z]) => [X(ccx) + (x - X(ccx)) * 0.97, Z(ccz) + (z - Z(ccz)) * 0.97] as V2) })), hex("#6a6660"), { smooth: true, lid: null });
    // the slanted legs under the shell, the basin
    const R0 = rAt(6) * u;
    if (!c.far)
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const aa = a + (i % 2 ? 1 : -1) * 0.1;
        K.bar("lm.Concrete031", [X(ccx) + Math.cos(a) * (R0 - 0.3), 0.36 * u, Z(ccz) + Math.sin(a) * (R0 - 0.3)], [X(ccx) + Math.cos(aa) * (R0 - 0.3), 6 * u, Z(ccz) + Math.sin(aa) * (R0 - 0.3)], 0.35, hex("#8c8892"));
      }
    K.cyl("lm.glass", X(ccx), Z(ccz), R0 - 0.4, R0 - 0.4, 0.36 * u, 0.8 * u, hex("#3a5a6a"), { sides: 40 });
    // the turbine hall
    const hx0 = PS + 2,
      hx1 = mw - 2,
      hz0 = 66,
      hz1 = 108,
      hh = 48;
    B("lm.Metal032", hx0, 0.36, hz0, hx1, hh, hz1, hex("#5a6878"), { skip: "-y" });
    B("lm.Concrete031", hx0 - 0.1, 0.36, hz0 - 0.1, hx1 + 0.1, 6, hz1 + 0.1, hex("#4a4852"), { skip: "-y" });
    B("lm.Metal032", hx0 + 6, hh, hz0 + 14, hx1 - 6, hh + 6, hz1 - 14, hex("#4e5c6c"));
    B("lm.glass", hx0 + 6, hh + 1, hz0 + 13.8, hx1 - 6, hh + 4, hz1 - 13.8, hex("#a8bccc"), { skip: "-y+y-x+x" });
    B("lm.Metal032", hx0 - 0.33, hh, hz0 - 0.33, hx1 + 0.33, hh + 1, hz1 + 0.33, hex("#3a3842"));
    for (let x = hx0 + 4; x < hx1 - 4; x += 8) {
      B("lm.glass", x, 10, hz1 - 0.1, x + 4, 40, hz1 + 0.05, hex("#6a7a8a"), { skip: "-z" });
      B("lm.dark", x - 1, 10, hz1, x, 40, hz1 + 0.33, hex("#3a3842"));
    }
    B("lm.Metal032", hx0 - 0.33, 0.36, hz0 + 10, hx0, 26, hz0 + 26, hex("#8a8692"));
    // the boiler house, its stair tower in red, the duct to the chimneys
    const bx0 = PS + 4,
      bx1 = 240,
      bz0 = hz1,
      bz1 = 132,
      bh = 70;
    B("lm.Metal032", bx0, 0.36, bz0, bx1, bh, bz1, hex("#4e4a56"), { skip: "-y" });
    if (!c.far)
      for (let x = bx0 + 3; x < bx1 - 3; x += 6)
        for (let y = 14; y < bh - 6; y += 12) B(c.r() > 0.5 ? "lm.glow.night" : "lm.glass", x, y, bz1 - 0.05, x + 3, y + 4, bz1 + 0.05, c.r() > 0.5 ? hex("#ffb46b") : hex("#2a3448"));
    B("lm.Metal032", bx1, 0.36, bz0 + 4, bx1 + 4, bh - 4, bz0 + 10, hex("#c0392b"));
    B("lm.Metal032", bx1, 40, bz0 + 14, 251, 48, bz0 + 20, hex("#7a7882"));
    for (const [sx, sz, sh] of [
      [251, 127, 110],
      [251, 114, 96],
    ]) {
      const cxs = X(sx + 0.5),
        czs = Z(sz + 0.5);
      K.cyl("lm.Concrete031", cxs, czs, 6 * u, 6 * u, 0.36 * u, 6 * u, hex("#8c8892"), { sides: 24 });
      const bands = 10;
      for (let i = 0; i < bands; i++) {
        const y0 = 6 + ((sh - 6) * i) / bands,
          y1 = 6 + ((sh - 6) * (i + 1)) / bands;
        const r0 = (4.8 - (y0 / sh) * 1.3) * u,
          r1 = (4.8 - (y1 / sh) * 1.3) * u;
        K.cyl("lm.paint", cxs, czs, r0, r1, y0 * u, y1 * u, i >= bands - 4 && i % 2 === 0 ? hex("#c0392b") : hex("#e0dcd6"), { sides: 20, caps: i === bands - 1 ? "top" : "none" });
      }
      K.cyl("lm.dark", cxs, czs, 2.2 * u, 2.2 * u, sh * u - 0.02, sh * u + 0.01, hex("#121014"), { sides: 16 });
      K.cyl("lm.Metal032.metal", cxs, czs, 5.4 * u, 5.4 * u, (sh - 14) * u, (sh - 13.6) * u, hex("#3a3842"), { sides: 20 });
      for (const [a, b2] of [
        [-3, 0],
        [3, 0],
        [0, -3],
        [0, 3],
      ])
        K.sphere("lm.glow", cxs + a * u, sh * u + 0.15, czs + b2 * u, 0.2, hex("#ff2a2a"), { segs: 4 });
    }
    // the switchyard on the quay: transformers, gantries, insulators
    const sx0 = 238,
      sx1 = mw - 2,
      sz0 = 136,
      sz1 = Dv - 4;
    B("lm.Gravel022", sx0, 0.38, sz0, sx1, 0.5, sz1, hex("#6a645c"));
    for (let z = sz0 + 3; z < sz1 - 6; z += 12) {
      B("lm.Metal032", sx0 + 3, 0.5, z, sx0 + 11, 9, z + 6, hex("#4a5a4a"));
      if (!c.far) for (let x = sx0 + 3; x < sx0 + 11; x += 2) B("lm.Metal032", x, 2, z - 0.6, x + 0.6, 8, z, hex("#3a4a3a"));
      for (const x of [sx0 + 4, sx0 + 7, sx0 + 10]) K.cyl("lm.paint", X(x + 0.5), Z(z + 2.5), 0.2, 0.15, 9 * u, 13 * u, hex("#a85a3a"), { sides: 8 });
      for (const x of [sx0 + 14, sx1 - 2]) B("lm.Metal032.metal", x, 0.5, z + 2, x + 1, 26, z + 3, hex("#8a8892"));
      B("lm.Metal032.metal", sx0 + 14, 26, z + 2, sx1 - 1, 27, z + 3, hex("#8a8892"));
    }
    B("lm.Concrete031", PS, 0.36, 62, mw, 0.5, 66, hex("#8c8892"));
  }
  // ---- the ship-to-shore cranes on the quay: red legs, the white boom out over the river, the trolley ----
  const crane = (x: number, lifting: boolean) => {
    const red = hex("#c8322a"),
      white = hex("#e6e2da");
    const zA = 138,
      zB = 158,
      gx = 26,
      deck = 66;
    for (const dx of [0, gx])
      for (const z of [zA, zB]) {
        B("lm.Metal032", x + dx, 2, z, x + dx + 3, deck, z + 3, red);
        B("lm.dark", x + dx - 2, 0.38, z - 2, x + dx + 5, 4, z + 5, hex("#3a3842"));
      }
    for (const dx of [0, gx]) {
      B("lm.Metal032", x + dx, 18, zA, x + dx + 3, 21, zB + 3, red);
      B("lm.Metal032", x + dx, deck - 4, zA, x + dx + 3, deck, zB + 3, red);
      if (!c.far) K.bar("lm.Metal032", V(x + dx + 1.5, 21, zA + 1.5), V(x + dx + 1.5, deck - 4, zB + 1.5), 0.4, hex("#9a2620"));
    }
    for (const z of [zA, zB]) B("lm.Metal032", x, deck - 4, z, x + gx + 3, deck, z + 3, red);
    const b0 = 108,
      b1 = md - 1;
    // the boom: a white box girder, red bands, the machinery house at its back
    B("lm.Metal032", x + 2, deck, b0, x + gx + 1, deck + 2, b1, white);
    for (const xx of [x + 2, x + gx - 1]) B("lm.Metal032", xx, deck + 2, b0, xx + 2, deck + 8, b1, white);
    if (!c.far)
      for (let z = b0; z < b1 - 6; z += 6) {
        B("lm.Metal032", x + 2, deck + 7, z, x + gx + 1, deck + 8, z + 1, hex("#c8c4bc"));
        for (const xx of [x + 3, x + gx]) K.bar("lm.Metal032", V(xx, deck + 2, z), V(xx, deck + 8, z + 6), 0.18, hex("#c8c4bc"));
      }
    for (const z of [b0 + 2, Dv + 2, b1 - 3]) B("lm.Metal032", x + 2, deck, z, x + gx + 1, deck + 8, z + 2, red);
    B("lm.Metal032", x + 4, deck + 2, b0 + 1, x + gx - 1, deck + 12, b0 + 16, white);
    B("lm.Metal032", x + 4, deck + 12, b0 + 1, x + gx - 1, deck + 13, b0 + 16, hex("#9a98a0"));
    // the A-frame and its stays to the boom
    const apexY = 118 - 6,
      apexZ = zB + 1;
    for (const dx of [2, gx - 1]) {
      K.bar("lm.Metal032", V(x + dx + 1, deck + 8, zA + 1), V(x + dx + 1, apexY, apexZ + 1), 0.7, white);
      K.bar("lm.Metal032", V(x + dx + 1, deck + 8, zB + 9), V(x + dx + 1, apexY, apexZ + 1), 0.7, white);
    }
    B("lm.Metal032", x + 2, apexY, apexZ - 1, x + gx + 1, apexY + 3, apexZ + 3, red);
    if (!c.far)
      for (const dx of [3, gx]) {
        K.bar("lm.Metal032.metal", V(x + dx, apexY + 1, apexZ + 1), V(x + dx, deck + 8, b1 - 4), 0.12, hex("#3a3842"));
        K.bar("lm.Metal032.metal", V(x + dx, apexY + 1, apexZ + 1), V(x + dx, deck + 8, b0 + 2), 0.12, hex("#3a3842"));
      }
    // the trolley and its cab, the spreader on its ropes (a box when it lifts)
    const tz = lifting ? Dv + 8 : 150;
    B("lm.dark", x + 4, deck - 3, tz - 4, x + gx - 1, deck, tz + 4, hex("#3a3842"));
    B("lm.Metal032", x + 6, deck - 9, tz + 2, x + 13, deck - 3, tz + 8, white);
    B("lm.glass", x + 6.1, deck - 8, tz + 7.9, x + 12.9, deck - 4, tz + 8.05, hex("#2a3448"), { skip: "-z" });
    const sy = lifting ? 34 : 50;
    if (!c.far) for (const dx of [8, gx - 7]) for (const dz of [-3, 3]) K.bar("lm.dark", V(x + dx + 0.5, sy + 9, tz + dz + 0.5), V(x + dx + 0.5, deck - 3, tz + dz + 0.5), 0.06, hex("#2a2a30"));
    B("lm.paint", x + 4, sy + 8, tz - 4, x + gx - 1, sy + 9, tz + 4, yellow);
    if (lifting) container(c, X(x + 4), sy * u, Z(tz - 4), 21 * u, BOX[10]);
    for (const dx of [0, gx]) K.sphere("lm.glow", X(x + dx + 1.5), deck * u, Z(zA - 1), 0.25, hex("#ffb547"), { segs: 4 });
  };
  crane(30, true);
  crane(120, false);
  // ---- the boxes on the quay, the wagons on the siding with theirs, the shunter ----
  container(c, X(70), 0.38 * u, Z(142), 36 * u, BOX[5]);
  container(c, X(70), 8.38 * u, Z(142), 36 * u, BOX[2]);
  container(c, X(70), 0.38 * u, Z(151), 36 * u, BOX[9]);
  container(c, X(160), 0.38 * u, Z(146), 18 * u, BOX[7]);
  for (let i = 0; i < 3; i++) container(c, X(208 + i * 2), (0.38 + i * 8) * u, Z(140), 36 * u, BOX[(i * 5 + 1) % BOX.length]);
  for (let x = 6, i = 0; x + 40 < PS - 20; x += 46, i++) {
    B("lm.Metal032", x, 1.2, RAIL + 1, x + 40, 4, RAIL + 7, hex("#4a3a32"));
    for (const xx of [x + 3, x + 33]) for (const z of [RAIL + 2.3, RAIL + 5.7]) hcyl(c, "lm.dark", X(xx), X(xx + 4), 1.6 * u, Z(z), 0.45, hex("#1c1c20"), { sides: 10 });
    container(c, X(x + 2), 4 * u, Z(RAIL), 36 * u, BOX[(i * 5 + 3) % BOX.length]);
  }
  {
    const x = PS - 34;
    B("lm.Metal032", x, 1.2, RAIL + 1, x + 26, 4, RAIL + 7, hex("#2a2a30"));
    B("lm.paint", x + 2, 4, RAIL + 1, x + 18, 12, RAIL + 7, yellow);
    B("lm.paint", x + 18, 4, RAIL, x + 26, 16, RAIL + 8, hex("#c0392b"));
    B("lm.glass", x + 18.9, 11, RAIL - 0.05, x + 25.1, 14, RAIL + 8.05, hex("#2a3448"), { skip: "-y+y" });
    B("lm.dark", x + 18, 16, RAIL, x + 26, 17, RAIL + 8, hex("#3a3842"));
  }
  // the second conveyor: from the hall's roof over the siding to the shipping hopper on the quay
  {
    const cx = 164,
      y0 = 46;
    B("lm.Metal032", cx - 4, y0, HALL.z1 - 6, cx + 5, y0 + 2, 146, hex("#3a3744"));
    B("lm.dark", cx - 3, y0 + 2, HALL.z1 - 6, cx + 4, y0 + 2.5, 146, hex("#141318"));
    for (const x of [cx - 4, cx + 4]) {
      B("lm.glow", x, y0 + 3, HALL.z1 - 6, x + 0.4, y0 + 3.4, 146, violet);
      B("lm.Metal032.metal", x, y0 + 8, HALL.z1 - 6, x + 1, y0 + 9, 146, hex("#5a5666"));
      if (!c.far) for (let z = HALL.z1 - 6; z < 146; z += 6) B("lm.Metal032.metal", x, y0 + 2, z, x + 1, y0 + 8, z + 0.5, hex("#5a5666"));
    }
    for (const x of [cx - 3, cx + 2]) B("lm.Metal032.metal", x, 1, RAIL - 2, x + 2, y0, RAIL, hex("#7a7882"));
    const hx0 = cx - 10,
      hx1 = cx + 10,
      hz0 = 140,
      hz1 = 156;
    for (const [x, z] of [
      [hx0, hz0],
      [hx1 - 2, hz0],
      [hx0, hz1 - 2],
      [hx1 - 2, hz1 - 2],
    ])
      B("lm.Metal032.metal", x, 0.38, z, x + 2, y0 + 12, z + 2, hex("#c8c4bc"));
    B("lm.Metal032", hx0 + 2, y0 - 10, hz0 + 1, hx1 - 2, y0 + 10, hz1 - 1, hex("#5e5a6c"));
    B("lm.Metal032", hx0, y0 + 12, hz0, hx1, y0 + 13, hz1, hex("#3a3842"));
    B("lm.glow", hx0 + 2, y0 + 4, hz0 + 0.6, hx1 - 2, y0 + 4.5, hz0 + 1, violet);
    B("lm.Metal032", cx - 2, 12, hz0 + 5, cx + 3, y0 - 10, hz0 + 10, hex("#3a3744"));
    container(c, X(hx0 + 1), 0.38 * u, Z(hz0 + 4), 18 * u, BOX[11]);
  }
  // ---- the truck gate on the boulevard, the visitors' gate, fences, light masts ----
  {
    const G0 = LANE - 12,
      G1 = LANE + 12;
    for (const z of [G0 - 2, G1 + 1]) for (const x of [0, 10]) B("lm.Metal032.metal", x, 0.36, z, x + 1, 18, z + 1, hex("#7a7882"));
    B("lm.dark", 0, 17, G0 - 3, 12, 22, G1 + 3, hex("#2a2632"));
    B("lm.glow", 0, 21, G0 - 3, 0.4, 22, G1 + 3, violet);
    for (let z = G0; z < G1; z += 6) B("lm.glow.night", 2, 16.9, z, 8, 17, z + 3, hex("#f0f4ff"));
    for (const z of [G0, G1 - 1]) {
      B("lm.dark", 12, 0.36, z, 14, 6, z + 1, hex("#3a3842"));
      B("lm.paint", 12.6, 5, z + 0.2, 13.4, 17, z + 0.8, hex("#e8e4dc"));
    }
    B("lm.Metal032", 4, 0.36, LANE + 13, 18, 10, LANE + 22, hex("#3a3842"));
    B("lm.glass", 4.5, 4, LANE + 12.95, 17.5, 9, LANE + 13, hex("#9ab8d0"), { skip: "+z" });
  }
  {
    for (const x of [MID - 7, MID + 7]) B("lm.dark", x, 0.36, 0, x + 1, 18, 2, hex("#2a2632"));
    B("lm.dark", MID - 8, 18, 0, MID + 9, 23, 2, hex("#2a2632"));
    B("lm.glow", MID - 8, 23, 0, MID + 9, 23.5, 2, violet);
    for (const x of [MID - 4, MID, MID + 4]) {
      B("lm.Metal032.metal", x, 0.36, 3, x + 1, 5, 7, hex("#9a98a2"));
      K.sphere("lm.glow", X(x + 0.5), 5 * u, Z(3.5), 0.1, hex("#3ddc97"), { segs: 4 });
    }
  }
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const ax = z0 === z1;
    const a = V(x0, 0.36, z0),
      b2 = V(x1, 0.36, z1);
    const L = Math.hypot(b2[0] - a[0], b2[2] - a[2]);
    const n = Math.max(1, Math.round(L / 3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      K.cyl("lm.Metal032.metal", a[0] + (b2[0] - a[0]) * t, a[2] + (b2[2] - a[2]) * t, 0.05, 0.05, a[1], 2.4, hex("#6a6872"), { sides: 6, caps: "none" });
    }
    if (!c.far) {
      // the mesh: a see-through fabric panel
      if (ax) K.box("fabric", Math.min(a[0], b2[0]), a[1], a[2] - 0.01, Math.max(a[0], b2[0]), 2.3, a[2] + 0.01, hex("#5a5862"), { skip: "-y+y" });
      else K.box("fabric", a[0] - 0.01, a[1], Math.min(a[2], b2[2]), a[0] + 0.01, 2.3, Math.max(a[2], b2[2]), hex("#5a5862"), { skip: "-y+y" });
    }
  };
  fence(0, 1, MID - 7, 1);
  fence(MID + 8, 1, PS, 1);
  fence(1, 1, 1, LANE - 14);
  fence(1, LANE + 14, 1, QUAY);
  fence(mw - 2, 1, mw - 2, QUAY);
  for (const [x, z, h] of [
    [58, 6, 64],
    [166, 6, 64],
    [236, QUAY + 10, 60],
  ]) {
    K.cyl("lm.Metal032.metal", X(x + 0.5), Z(z + 0.5), 0.3, 0.2, 0.36 * u, h * u, hex("#7a7882"), { sides: 8 });
    B("lm.dark", x - 3, h, z - 3, x + 4, h + 1, z + 4, hex("#3a3842"));
    B("lm.glow.night", x - 2.8, h - 0.1, z - 2.8, x + 3.8, h, z + 3.8, hex("#fff2d8"));
  }
});

/** A regular octagon (flat sides facing ±x, ±z and the diagonals) of apothem `ap` round (cx, cz). */
function octagon(cx: number, cz: number, ap: number): V2[] {
  const R = ap / Math.cos(Math.PI / 8);
  const pts: V2[] = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
  }
  return pts;
}

def("foodhall", (c) => {
  const { K, X, Z, u } = c;
  const mw = c.b.model.w,
    md = c.b.model.d;
  const A = Math.min(52, Math.floor((mw - 34) / 2), Math.floor((md - 46) / 2));
  const cxv = Math.round(mw / 2),
    czv = 16 + A;
  const EAVE = 30,
    CLR = 30,
    FL = 2,
    DEPTH = 15,
    barR = 8;
  const half = A * Math.tan(Math.PI / 8);
  const cx = X(cxv),
    cz = Z(czv);
  const iron = hex("#e8dfc8"),
    ironS = hex("#d2c7ae"),
    ironD = hex("#3f5a4a"),
    slate = hex("#4a5262"),
    lead = hex("#9aa0aa"),
    steel = hex("#b8bcc4"),
    tile = hex("#e6e4dc"),
    goldC = hex("#f4b728");
  const nrm = (n: number): V2 => [Math.sin((n * Math.PI) / 4), Math.cos((n * Math.PI) / 4)];
  const tng = (n: number): V2 => [Math.cos((n * Math.PI) / 4), -Math.sin((n * Math.PI) / 4)];
  /** A side's local (t along, r inward from the outer edge) to metres. */
  const W2 = (n: number, t: number, r: number): V2 => {
    const [nx, nz] = nrm(n),
      [tx, tz] = tng(n);
    return [X(cxv + nx * (A - r) + tx * t), Z(czv + nz * (A - r) + tz * t)];
  };
  /** A box in a side's frame (voxels), drawn as a turned box (metres). */
  const lb = (n: number, t0: number, t1: number, r0: number, r1: number, y0: number, y1: number, s: Slot, col: V3, skip = "") => {
    const [nx, nz] = nrm(n),
      [tx, tz] = tng(n);
    const p = (t: number, r: number, y: number): V3 => {
      const [x, z] = W2(n, t, r);
      return [x, y * u, z];
    };
    const uv = (q: V3): [number, number] => [(q[0] + q[2]) * 0.5, q[1] * 0.5];
    // outward (r = r0 side, normal +n), inward (r1, −n), the t ends (∓t), top
    if (!skip.includes("o")) K.quad(s, p(t1, r0, y0), p(t0, r0, y0), p(t0, r0, y1), p(t1, r0, y1), [nx, 0, nz], uv, col);
    if (!skip.includes("i")) K.quad(s, p(t0, r1, y0), p(t1, r1, y0), p(t1, r1, y1), p(t0, r1, y1), [-nx, 0, -nz], uv, col);
    K.quad(s, p(t0, r0, y0), p(t0, r1, y0), p(t0, r1, y1), p(t0, r0, y1), [-tx, 0, -tz], uv, col);
    K.quad(s, p(t1, r1, y0), p(t1, r0, y0), p(t1, r0, y1), p(t1, r1, y1), [tx, 0, tz], uv, col);
    K.quad(s, p(t0, r0, y1), p(t0, r1, y1), p(t1, r1, y1), p(t1, r0, y1), [0, 1, 0], (q) => [q[0] * 0.5, q[2] * 0.5], col);
    if (skip.includes("b")) return;
    K.quad(s, p(t0, r1, y0), p(t0, r0, y0), p(t1, r0, y0), p(t1, r1, y0), [0, -1, 0], (q) => [q[0] * 0.5, q[2] * 0.5], col);
  };
  // the paving, the platform (an octagon a step up, tiled), its kerb
  K.box("lm.PavingStones111", -c.W / 2, 0, -c.D / 2, c.W / 2, u, c.D / 2, hex("#b8b1a2"), { skip: "-y" });
  K.prism("lm.Concrete031", octagon(cx, cz, (A + 3) * u), u, FL * u, hex("#8a8478"), { lid: "lm.Tiles074", lidCol: hex("#a49e90") });
  // ---- the stalls round seven sides ----
  const STALLS: [string, string][] = [
    ["#c0302a", "roast"], ["#1f2a5a", "pot"], ["#e07020", "grill"], ["#2f8a4a", "pot"], ["#7a1f2a", "grill"], ["#d04a8a", "steam"], ["#2f5aa8", "wok"],
    ["#6a3a9a", "griddle"], ["#e8b820", "griddle"], ["#7a4a2a", "pot"], ["#1f8a8a", "fryer"], ["#3a9ad0", "wok"], ["#7ab030", "drink"], ["#a83a1a", "wok"],
  ];
  let si = 0;
  for (const n of [4, 3, 5, 2, 6, 1, 7])
    for (const sgn of [-1, 1]) {
      const [hexc, kind] = STALLS[si++ % STALLS.length];
      const col = hex(hexc);
      const t0 = sgn < 0 ? -half + 2 : 1.5,
        t1 = sgn < 0 ? -1.5 : half - 2;
      const tm = (t0 + t1) / 2;
      const y = FL;
      // the back wall in white tile with the stall's colour band, the side walls
      lb(n, t0, t1, 0, 2, y, y + 14, "lm.Plaster001", tile, "b");
      lb(n, t0, t1, -0.05, 0.05, y + 10, y + 12, "lm.paint", col, "b");
      for (const tt of [t0 - 0.5, t1 - 0.5]) lb(n, tt, tt + 1, 0, DEPTH - 1, y, y + 16, "lm.Plaster001", tile, "b");
      // the menu boards over the kitchen, lit
      lb(n, t0 + 1, t1 - 1, 2, 2.6, y + 15, y + 22, "lm.dark", hex("#1e1c22"), "b");
      if (!c.far) for (let i = 0; i < Math.floor((t1 - t0 - 2) / 3); i++) lb(n, t0 + 2 + i * 3, t0 + 4 + i * 3, 2.6, 2.7, y + 16, y + 20, "lm.glow", hex(["#ffd28a", "#ff9a6a", "#fff0c0", "#ffb070"][(i + si) % 4]), "b");
      // the counter in its colour, a steel top, the glass display with the dishes
      lb(n, t0, t1, DEPTH - 3, DEPTH, y, y + 6, "lm.paint", col, "b");
      lb(n, t0, t1, DEPTH - 3.5, DEPTH + 0.5, y + 6, y + 6.5, "lm.Metal032.metal", steel);
      if (!c.far) {
        lb(n, tm - 4, tm + 1, DEPTH - 3, DEPTH - 1, y + 6.5, y + 9.5, "lm.glass", hex("#cfe4f0"));
        for (let i = 0; i < 4; i++) lb(n, tm - 3.8 + i * 1.2, tm - 3 + i * 1.2, DEPTH - 2.5, DEPTH - 1.5, y + 6.5, y + 7.3, "lm.paint", hex(["#e8b04a", "#c05a3a", "#f0e0c0", "#6aa04a"][(i + si) % 4]));
        lb(n, t1 - 3, t1 - 1, DEPTH - 2.5, DEPTH - 1, y + 6.5, y + 7.5, "lm.paint", hex("#e8e4d8"));
      }
      // the kitchen: steel bench, the hood, the stall's own cooking
      lb(n, t0 + 0.5, t1 - 0.5, 2, 8, y, y + 6, "lm.Metal032.metal", hex("#7a7e88"), "b");
      lb(n, t0 + 0.5, t1 - 0.5, 2, 8, y + 6, y + 6.6, "lm.Metal032.metal", steel);
      lb(n, t0 + 1, t1 - 1, 2, 9, y + 19, y + 21, "lm.Metal032.metal", steel);
      if (!c.far) {
        const kp = (dt: number) => W2(n, tm + dt, 5.5);
        if (kind === "wok" || kind === "pot" || kind === "steam" || kind === "fryer") {
          for (const dt of kind === "steam" ? [-4, 0, 4] : [-4, 4]) {
            const [px, pz] = kp(dt);
            if (kind === "wok") {
              K.cyl("lm.glow", px, pz, 1.2 * u, 1.2 * u, (y + 6.6) * u, (y + 6.9) * u, hex("#ff6a1a"), { sides: 10 });
              K.cyl("lm.dark", px, pz, 0.9 * u, 2.2 * u, (y + 6.9) * u, (y + 8.4) * u, hex("#2a2a30"), { sides: 12, caps: "none" });
            } else if (kind === "pot") K.cyl("lm.Metal032.metal", px, pz, 1.8 * u, 1.8 * u, (y + 6.6) * u, (y + 11) * u, steel, { sides: 14 });
            else if (kind === "steam") for (let s = 0; s < 3; s++) K.cyl("lm.Wood049", px, pz, 1.6 * u, 1.6 * u, (y + 6.6 + s * 1.4) * u, (y + 7.8 + s * 1.4) * u, hex("#d8b878"), { sides: 12 });
            else K.box("lm.Metal032.metal", px - 2 * u, (y + 6.6) * u, pz - 2 * u, px + 2 * u, (y + 9.5) * u, pz + 2 * u, steel);
          }
        } else if (kind === "grill" || kind === "griddle") {
          lb(n, tm - 6, tm + 6, 3, 7, y + 6.6, y + 7.4, kind === "grill" ? "lm.glow" : "lm.dark", kind === "grill" ? hex("#ff6a1a") : hex("#2a2a30"));
          for (let i = -5; i <= 5; i += 2) lb(n, tm + i, tm + i + 1, 3.5, 6.5, y + 7.4, y + 8, "lm.paint", hex(i % 4 ? "#8a3a1a" : "#d8a050"));
        } else if (kind === "roast") {
          lb(n, t0 + 1, t1 - 1, DEPTH - 2, DEPTH - 1.6, y + 16, y + 16.4, "lm.Metal032.metal", steel);
          for (let i = 0; i < 4; i++) {
            const [hx, hz] = W2(n, t0 + 2.5 + i * ((t1 - t0 - 5) / 3), DEPTH - 1.8);
            K.sphere("lm.paint", hx, (y + 13.5) * u, hz, 1.1 * u, hex("#a8501a"), { segs: 6, sy: 1.5 });
          }
        } else if (kind === "drink") {
          lb(n, t0 + 1, tm, 2, 5, y, y + 14, "lm.paint", hex("#d8dce4"), "b");
          lb(n, t0 + 1.5, tm - 0.5, 5, 5.2, y + 1, y + 13, "lm.glass", hex("#9ac8e8"), "b");
        }
      }
      // the stall's roof, its fascia in colour, the cream signboard with the trade
      lb(n, t0 - 0.5, t1 + 0.5, 2, DEPTH + 2, y + 22, y + 23, "lm.paint", col);
      lb(n, t0 - 0.5, t1 + 0.5, DEPTH + 1, DEPTH + 2, y + 17, y + 23, "lm.paint", col);
      lb(n, t0 + 1, t1 - 1, DEPTH + 2, DEPTH + 2.4, y + 18, y + 22, "lm.glow.night", hex("#f4ecd8"));
      // a gas bottle and a cool box in front
      const [gx, gz] = W2(n, t0 + 2, -2);
      K.cyl("lm.paint", gx, gz, 1.3 * u, 1.3 * u, FL * u, (FL + 6) * u, hex(si % 2 ? "#c0302a" : "#3a6a9a"), { sides: 10 });
      // the lanterns under the eave of the stall
      if (!c.far)
        for (const lt of [t0 + 1.5, t1 - 3]) {
          const [lx, lz] = W2(n, lt, DEPTH + 2.5);
          K.sphere("lm.glow.night", lx, (y + 15) * u, lz, 1.1 * u, hex("#ff4a2a"), { segs: 6, sy: 1.3 });
        }
    }
  // ---- the teh tarik bar under the tower: a round counter, the tower's iron foot, lanterns ----
  K.cyl("lm.paint", cx, cz, barR * u, barR * u, FL * u, (FL + 6) * u, hex("#7a2a1a"), { sides: 32, caps: "none" });
  K.cyl("lm.paint", cx, cz, (barR - 2.5) * u, (barR - 2.5) * u, FL * u, (FL + 6) * u, hex("#5a1e12"), { sides: 32, caps: "none" });
  K.prism("lm.Marble021.gloss", circle(cx, cz, (barR + 0.4) * u, 32), (FL + 6) * u, (FL + 6.6) * u, hex("#e8e4dc"), { lid: "lm.Marble021.gloss", lidCol: hex("#e8e4dc") });
  K.cyl("lm.paint", cx, cz, 2.5 * u, 2.5 * u, FL * u, 54 * u, iron, { sides: 16 });
  for (let y = FL + 8; y < 56; y += 10) K.cyl("lm.paint", cx, cz, 3.2 * u, 3.2 * u, y * u, (y + 1) * u, ironS, { sides: 16 });
  if (!c.far) for (let a = 0; a < 8; a++) K.sphere("lm.glow.night", cx + Math.cos(a * 0.785) * 10 * u, (FL + 12) * u, cz + Math.sin(a * 0.785) * 10 * u, 1.2 * u, hex(a % 2 ? "#ff4a2a" : "#ffd08a"), { segs: 6, sy: 1.3 });
  // ---- the round marble tables and their stools ----
  {
    const r8 = (px: number, pz: number) => Math.max(Math.abs(px), Math.abs(pz), (Math.abs(px) + Math.abs(pz)) / Math.SQRT2);
    const innerCols = Array.from({ length: 8 }, (_, n) => {
      const [nx, nz] = nrm(n),
        [tx, tz] = tng(n);
      const t = -CLR * Math.tan(Math.PI / 8),
        rr = A - CLR;
      return [cxv + nx * (A - rr) + tx * t, czv + nz * (A - rr) + tz * t];
    });
    const spots: [number, number][] = [];
    for (let j = -4; j <= 4; j++)
      for (let i = -4; i <= 4; i++) {
        const tx = cxv + i * 14 + (j % 2 ? 7 : 0),
          tz = czv + j * 13;
        const px = tx + 0.5 - cxv,
          pz = tz + 0.5 - czv;
        if (r8(px, pz) > A - DEPTH - 8 || Math.hypot(px, pz) < barR + 8.5) continue;
        if (innerCols.some(([qx, qz]) => Math.hypot(tx - qx, tz - qz) < 8.5)) continue;
        spots.push([tx, tz]);
      }
    const stoolCols = ["#c0302a", "#2f5aa8", "#e8b820", "#2f8a4a"].map((h2) => hex(h2));
    spots.forEach(([tx, tz], i) => {
      const x = X(tx + 0.5),
        z = Z(tz + 0.5);
      K.cyl("lm.dark", x, z, 0.08, 0.08, FL * u, (FL + 4) * u, hex("#5a5a62"), { sides: 8, caps: "none" });
      K.cyl("lm.dark", x, z, 0.22, 0.25, FL * u, (FL + 0.4) * u, hex("#5a5a62"), { sides: 10 });
      if (i % 3 !== 2) K.cyl("lm.Marble021.gloss", x, z, 3.4 * u, 3.4 * u, (FL + 4) * u, (FL + 4.6) * u, hex("#e8e4dc"), { sides: 20 });
      else K.box("lm.Marble021.gloss", x - 3.5 * u, (FL + 4) * u, z - 3.5 * u, x + 3.5 * u, (FL + 4.6) * u, z + 3.5 * u, hex("#e8e4dc"));
      if (!c.far)
        for (const [dx, dz] of [
          [-6, 0],
          [6, 0],
          [0, -6],
          [0, 6],
        ]) {
          K.cyl("lm.dark", x + dx * u, z + dz * u, 0.05, 0.05, FL * u, (FL + 2.4) * u, hex("#5a5a62"), { sides: 6, caps: "none" });
          K.cyl("lm.plastic", x + dx * u, z + dz * u, 1.4 * u, 1.4 * u, (FL + 2.4) * u, (FL + 3) * u, stoolCols[i % 4], { sides: 12 });
        }
    });
  }
  // ---- the cast-iron frame: slender columns, arches with filigree, the valance, two slate roofs, the clerestory ----
  const column = (x: number, z: number, y1: number) => {
    K.cyl("lm.paint", x, z, 1.4 * u, 1.2 * u, FL * u, (FL + 3) * u, ironS, { sides: 10 });
    K.cyl("lm.paint", x, z, 0.6 * u, 0.6 * u, (FL + 3) * u, (y1 - 2) * u, iron, { sides: 10, caps: "none" });
    K.cyl("lm.paint", x, z, 1.3 * u, 1.3 * u, (FL + 12) * u, (FL + 13) * u, ironS, { sides: 10 });
    K.cyl("lm.paint", x, z, 0.8 * u, 1.6 * u, (y1 - 2) * u, y1 * u, ironS, { sides: 10 });
  };
  const outer: V2[] = [];
  for (let n = 0; n < 8; n++) {
    for (const t of [-half, 0]) {
      const p = W2(n, t, 1);
      column(p[0], p[1], EAVE);
      outer.push(p);
    }
    const [nx, nz] = nrm(n),
      [tx, tz] = tng(n);
    column(X(cxv + nx * CLR + tx * -CLR * Math.tan(Math.PI / 8)), Z(czv + nz * CLR + tz * -CLR * Math.tan(Math.PI / 8)), 46);
  }
  // the arches between the outer columns, the lace in their spandrels, the eave beam
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i],
      b2 = outer[(i + 1) % outer.length];
    const seg = c.far ? 4 : 10;
    let prev: V3 = [a[0], (EAVE - 11) * u, a[1]];
    for (let j = 1; j <= seg; j++) {
      const t = j / seg;
      const p: V3 = [a[0] + (b2[0] - a[0]) * t, (EAVE - 11 + 8 * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2))) * u, a[1] + (b2[1] - a[1]) * t];
      K.bar("lm.paint", prev, p, 0.12, ironS);
      if (!c.far && j < seg && j % 2 === 0) K.bar("lm.paint", p, [p[0], (EAVE - 2) * u, p[2]], 0.05, iron);
      prev = p;
    }
    K.bar("lm.paint", [a[0], (EAVE - 1.5) * u, a[1]], [b2[0], (EAVE - 1.5) * u, b2[1]], 0.3, iron);
  }
  // the valance: a scalloped iron strip round the eave
  K.prism("lm.paint", octagon(cx, cz, (A + 5) * u), (EAVE - 0.6) * u, (EAVE + 1) * u, ironS, { lid: null });
  // the lower roof (eave → clerestory) and the upper (clerestory → tower), slate, lead on the hips
  K.loft("lm.RoofingTiles006", [
    { y: (EAVE + 1) * u, pts: octagon(cx, cz, (A + 5) * u) },
    { y: 46 * u, pts: octagon(cx, cz, CLR * u) },
  ], slate, { lid: null });
  K.loft("lm.Wood049", [
    { y: (EAVE - 0.5) * u, pts: octagon(cx, cz, (A + 4.5) * u).reverse() },
    { y: 45.5 * u, pts: octagon(cx, cz, (CLR - 0.5) * u).reverse() },
  ], hex("#8a6440"), { lid: null });
  for (const p of octagon(0, 0, 1)) {
    const a: V3 = [cx + p[0] * (A + 5) * u, (EAVE + 1.2) * u, cz + p[1] * (A + 5) * u];
    const b2: V3 = [cx + p[0] * CLR * u, 46.2 * u, cz + p[1] * CLR * u];
    K.bar("lm.Metal032.metal", a, b2, 0.15, lead);
    K.sphere("lm.Metal032.metal", a[0], a[1] + 0.3, a[2], 0.18, goldC, { segs: 6 });
  }
  // the clerestory: a louvred band between the roofs
  K.prism("lm.glass", octagon(cx, cz, (CLR - 0.6) * u), 45 * u, 57 * u, hex("#5a6a62"), { lid: null });
  if (!c.far) for (let y = 46; y < 56; y += 2) K.prism("lm.paint", octagon(cx, cz, (CLR - 0.4) * u), y * u, (y + 0.6) * u, hex("#5a6a62"), { lid: null });
  K.prism("lm.paint", octagon(cx, cz, CLR * u), 56.4 * u, 57 * u, iron, { lid: null });
  K.loft("lm.RoofingTiles006", [
    { y: 56.5 * u, pts: octagon(cx, cz, (CLR + 1) * u) },
    { y: 66 * u, pts: octagon(cx, cz, 11 * u) },
  ], slate, { lid: null });
  // ---- the clock tower and its spire ----
  {
    const TA = 11;
    K.prism("lm.Plaster001", octagon(cx, cz, TA * u), 60 * u, 96 * u, hex("#f0e8d4"), { lid: null });
    K.prism("lm.paint", octagon(cx, cz, (TA + 0.1) * u), 62 * u, 70 * u, hex("#5a6a62"), { lid: null });
    if (!c.far) for (let y = 62; y < 70; y += 1.5) K.prism("lm.paint", octagon(cx, cz, (TA + 0.25) * u), y * u, (y + 0.4) * u, iron, { lid: null });
    for (const yc of [60, 70, 88, 95]) K.prism("lm.paint", octagon(cx, cz, (TA + (yc === 95 ? 2 : 1)) * u), yc * u, (yc + 1) * u, yc === 95 ? ironS : iron, { lid: "lm.paint", lidCol: iron });
    K.loft("lm.RoofingTiles006", [
      { y: 96 * u, pts: octagon(cx, cz, TA * u) },
      { y: 118 * u, pts: octagon(cx, cz, 0.3 * u) },
    ], slate, { lid: null });
    K.cyl("lm.Metal032.metal", cx, cz, 0.08, 0.04, 118 * u, 123 * u, goldC, { sides: 6 });
    K.sphere("lm.Metal032.metal", cx, 120 * u, cz, 1.4 * u, goldC, { segs: 8 });
    // the clock faces on four sides
    for (const n of [0, 2, 4, 6]) {
      const [nx, nz] = nrm(n);
      const fx = cx + nx * (TA + 0.1) * u,
        fz = cz + nz * (TA + 0.1) * u,
        R = 7 * u,
        cy = 79 * u;
      const pts = circle(0, 0, R, 24);
      const [tx, tz] = tng(n);
      for (let i = 0; i < pts.length; i++) {
        const P = (q: V2): V3 => [fx + tx * q[0], cy + q[1], fz + tz * q[0]];
        K.tri("lm.glow", [fx, cy, fz], P(pts[(i + 1) % pts.length]), P(pts[i]), [nx, 0, nz], (q) => [q[0], q[1]], hex("#fff4dc", 0.6));
      }
      K.bar("lm.dark", [fx + nx * 0.03, cy, fz + nz * 0.03], [fx + nx * 0.03, cy + R * 0.75, fz + nz * 0.03], 0.08, hex("#1e1c22"));
      K.bar("lm.dark", [fx + nx * 0.03, cy, fz + nz * 0.03], [fx + nx * 0.03 + tx * R * 0.55, cy, fz + nz * 0.03 + tz * R * 0.55], 0.08, hex("#1e1c22"));
    }
  }
  // ---- the front: steps, the iron gable over the entrance with its fan window, the name board ----
  {
    const fzv = czv + A;
    const fz = Z(fzv);
    K.box("lm.Concrete031", X(cxv - Math.floor(half) + 2), u, fz + u, X(cxv + Math.ceil(half) - 2), 1.5 * u, fz + 4 * u, hex("#9a9488"));
    const gw = 46,
      gh = (gw / 2 / 1.15) * u;
    const base = (EAVE + 1) * u;
    const P = (x: number, y: number): V3 => [x, y, fz + 3 * u];
    K.tri("lm.paint", P(cx - (gw / 2) * u, base), P(cx + (gw / 2) * u, base), P(cx, base + gh), [0, 0, 1], (q) => [q[0], q[1]], iron);
    K.tri("lm.paint", [cx + (gw / 2) * u, base, fz - u], [cx - (gw / 2) * u, base, fz - u], [cx, base + gh, fz - u], [0, 0, -1], (q) => [q[0], q[1]], iron);
    for (const sx of [-1, 1]) {
      const ex = cx + sx * (gw / 2) * u;
      const l = Math.hypot((gw / 2) * u, gh);
      K.quad("lm.RoofingTiles006", sx < 0 ? [ex, base, fz + 4 * u] : [cx, base + gh, fz + 4 * u], sx < 0 ? [cx, base + gh, fz + 4 * u] : [ex, base, fz + 4 * u], sx < 0 ? [cx, base + gh, fz - 2 * u] : [ex, base, fz - 2 * u], sx < 0 ? [ex, base, fz - 2 * u] : [cx, base + gh, fz - 2 * u], [(sx * gh) / l, ((gw / 2) * u) / l, 0], (q) => [q[2] * 2, q[1] * 2], slate);
    }
    // the fan window
    const fr = 11 * u;
    const N = 12;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI,
        a1 = ((i + 1) / N) * Math.PI;
      K.tri("lm.glow.night", [cx, base, fz + 3 * u + 0.02], [cx + Math.cos(a1) * fr, base + Math.sin(a1) * fr, fz + 3 * u + 0.02], [cx + Math.cos(a0) * fr, base + Math.sin(a0) * fr, fz + 3 * u + 0.02], [0, 0, 1], (q) => [q[0], q[1]], hex("#ffcf8a", 0.7));
      if (!c.far) K.bar("lm.paint", [cx, base, fz + 3 * u + 0.05], [cx + Math.cos(a0) * fr, base + Math.sin(a0) * fr, fz + 3 * u + 0.05], 0.05, iron);
    }
    K.sphere("lm.Metal032.metal", cx, (EAVE + 22) * u, fz + u, 0.2, goldC, { segs: 6 });
    // the name board
    const nb0 = X(cxv - 44),
      nb1 = X(cxv + 44);
    K.box("lm.dark", nb0, (EAVE + 12) * u, fz + 4 * u, nb1, (EAVE + 19) * u, fz + 5 * u, hex("#1e1c22"));
    K.box("lm.paint", nb0 - u, (EAVE + 11) * u, fz + 4 * u, nb1 + u, (EAVE + 12) * u, fz + 6 * u, ironD);
    K.box("lm.paint", nb0 - u, (EAVE + 19) * u, fz + 4 * u, nb1 + u, (EAVE + 20) * u, fz + 6 * u, ironD);
    for (const x of [nb0 - u, nb1]) K.box("lm.paint", x, (EAVE + 1) * u, fz + 4 * u, x + u, (EAVE + 20) * u, fz + 5 * u, ironD);
    if (!c.far) for (let x = nb0; x < nb1; x += 4 * u) K.sphere("lm.glow", x, (EAVE + 20.5) * u, fz + 5 * u, 0.06, hex("#ffd08a"), { segs: 4 });
  }
  // ---- the forecourt: yatai carts, umbrella tables, lamps, palms ----
  {
    const fzv = czv + A;
    const front0 = fzv + 6;
    const yatai = (xv: number, zv: number, cloth: V3) => {
      const B2 = (s: Slot, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: V3) => K.box(s, X(xv + x0), y0 * u, Z(zv + z0), X(xv + x1), y1 * u, Z(zv + z1), col);
      B2("lm.Wood049", 0, 4, 0, 18, 10, 8, hex("#8a6440"));
      B2("lm.Wood049", 0, 10, -1, 18, 11, 9, hex("#b08a5a"));
      B2("lm.dark", 1, 11, 1, 10, 11.6, 5, hex("#2a2a30"));
      B2("lm.glow", 1.5, 11.6, 1.5, 9.5, 11.9, 4.5, hex("#ff6a1a"));
      for (let i = 1; i < 10; i += 2) B2("lm.paint", i, 12, 1, i + 0.6, 12.6, 5, hex(i % 4 === 1 ? "#8a3a1a" : "#b85a2a"));
      B2("lm.paint", 12, 11, 1, 16, 14, 4, hex("#d8d0b8"));
      for (const wx of [2, 15]) hcyl(c, "lm.Wood049", X(xv + wx - 0.5), X(xv + wx + 0.5), 3 * u, Z(zv - 0.5), 2 * u, hex("#3a2a20"), { sides: 12 });
      for (const px of [0, 17]) B2("lm.Wood049", px, 11, 7, px + 1, 26, 8, hex("#8a6440"));
      B2("lm.RoofingTiles006", -1, 26, -2, 19, 27, 11, hex("#6a2a1a"));
      for (let i = 0; i < 6; i++) B2("fabric", i * 3, 21, 10, i * 3 + 2.6, 26, 10.2, cloth);
      for (const lx of [-1, 16]) K.sphere("lm.glow.night", X(xv + lx + 1), 20 * u, Z(zv + 10), 1.2 * u, hex("#ff4a2a"), { segs: 6, sy: 1.3 });
      B2("lm.Wood049", 2, 1, 9, 16, 4, 11, hex("#b08a5a"));
    };
    for (const [xv, zv, cl] of [
      [6, md - 30, "#2a3a6a"],
      [mw - 25, md - 30, "#6a1f24"],
      [Math.round(cxv - 9), md - 20, "#3a5a3a"],
    ] as [number, number, string][])
      yatai(xv, Math.max(front0, zv), hex(cl));
    const umbrella = (xv: number, zv: number, cA: string, cB: string) => {
      const x = X(xv + 0.5),
        z = Z(zv + 0.5);
      K.cyl("lm.paint", x, z, 0.05, 0.05, u, 22 * u, hex("#d8d4cc"), { sides: 6, caps: "none" });
      const NS = 8;
      for (let i = 0; i < NS; i++) {
        const a0 = (i / NS) * Math.PI * 2,
          a1 = ((i + 1) / NS) * Math.PI * 2;
        K.tri("fabric", [x, 25 * u, z], [x + Math.cos(a1) * 9 * u, 22 * u, z + Math.sin(a1) * 9 * u], [x + Math.cos(a0) * 9 * u, 22 * u, z + Math.sin(a0) * 9 * u], [0, 1, 0], (q) => [q[0], q[2]], hex(i % 2 ? cA : cB));
        K.tri("fabric", [x, 25 * u - 0.02, z], [x + Math.cos(a0) * 9 * u, 22 * u - 0.02, z + Math.sin(a0) * 9 * u], [x + Math.cos(a1) * 9 * u, 22 * u - 0.02, z + Math.sin(a1) * 9 * u], [0, -1, 0], (q) => [q[0], q[2]], hex(i % 2 ? cA : cB));
      }
      K.cyl("lm.Marble021.gloss", x, z, 3.4 * u, 3.4 * u, 5 * u, 5.6 * u, hex("#e8e4dc"), { sides: 16 });
      K.cyl("lm.dark", x, z, 0.08, 0.08, u, 5 * u, hex("#5a5a62"), { sides: 6, caps: "none" });
      for (const [dx, dz] of [
        [-6, 0],
        [6, 0],
        [0, -6],
        [0, 6],
      ])
        K.cyl("lm.plastic", x + dx * u, z + dz * u, 1.4 * u, 1.4 * u, u, 4 * u, hex(cA === "#f4ecd8" ? "#c0302a" : cA), { sides: 10 });
    };
    umbrella(18, czv - 18, "#c0302a", "#f4ecd8");
    umbrella(mw - 19, czv - 18, "#2f6aa8", "#f4ecd8");
    umbrella(18, czv + 14, "#2f8a4a", "#f4ecd8");
    umbrella(mw - 19, czv + 14, "#e8b820", "#3a2a20");
    for (const [x, z] of [
      [4, fzv + 2],
      [mw - 5, fzv + 2],
      [4, 10],
      [mw - 5, 10],
    ])
      c.ex.props.push(["lamp", X(x + 0.5), u, Z(z + 0.5), 0, "#ffd08a"]);
    for (const [x, z] of [
      [10, czv - 2],
      [mw - 11, czv - 2],
      [cxv - 34, md - 6],
      [cxv + 34, md - 6],
    ])
      c.ex.trees.push([X(x + 0.5), u, Z(z + 0.5), "palm", x]);
  }
  // ---- inside: strings of bulbs from the clerestory columns to the eave ----
  if (!c.far)
    for (let n = 0; n < 8; n++) {
      const [nx, nz] = nrm(n),
        [tx, tz] = tng(n);
      const ic: V3 = [X(cxv + nx * CLR + tx * -CLR * Math.tan(Math.PI / 8)), 30 * u, Z(czv + nz * CLR + tz * -CLR * Math.tan(Math.PI / 8))];
      const oc = outer[n * 2 + 1];
      for (let i = 1; i < 8; i++) {
        const t = i / 8;
        K.sphere("lm.glow", ic[0] + (oc[0] - ic[0]) * t, (30 - Math.sin(t * Math.PI) * 3) * u, ic[2] + (oc[1] - ic[2]) * t, 0.07, hex("#ffd08a"), { segs: 4 });
      }
    }
});

// ---- the heart: the MEMPOOL HQ, its branch kiosks, the little street shops (scale 1, walls-down copies) -------------
// (registered as "h:<type>": the city's buildings of those types, not landmarks; see worker.ts)

const ORANGE = hex("#ff9f2e"),
  TEAL = hex("#3ec9b0");
/** A cardboard parcel (kraft, the chain's tape round it), from its lowest corner, metres. */
function parcelBox(c: LmCtx, x: number, y: number, z: number, w: number, h: number, d: number, tape: V3 = ORANGE) {
  const K = c.K;
  K.box("lm.paint", x, y, z, x + w, y + h, z + d, hex("#c8955a"));
  if (c.far) return;
  const tx = x + w / 2;
  K.box("lm.paint", tx - Math.min(0.1, w * 0.1), y + 0.002, z + d, tx + Math.min(0.1, w * 0.1), y + h, z + d + 0.01, tape, { skip: "-z" });
  K.box("lm.paint", tx - Math.min(0.1, w * 0.1), y + h, z, tx + Math.min(0.1, w * 0.1), y + h + 0.01, z + d, tape, { skip: "-y" });
}

/** A shop's glazed ground floor facing +z at z (metres), x0…x1, h tall: the lit room behind, mullions every `bay`, a door gap. */
function glazedFront(c: LmCtx, x0: number, x1: number, z: number, h: number, cell: string, frame: V3, o: { bay?: number; door?: [number, number]; depth?: number; y?: number } = {}) {
  const K = c.K;
  const y = o.y ?? 0;
  const depth = o.depth ?? 2;
  lit(c, cell, x0, x1, y, y + h, z - depth, Math.max(1, Math.round((x1 - x0) / 5)));
  // the room's floor, ceiling and sides, so it reads as a room
  K.box("lm.Plaster001", x0, y + h, z - depth, x1, y + h + 0.05, z, hex("#f4f0e8"), { skip: "+y" });
  K.box("lm.glow.night", x0 + 0.3, y + h - 0.02, z - depth + 0.3, x1 - 0.3, y + h, z - 0.3, hex("#fff4e0"), { skip: "+y" });
  for (const x of [x0, x1 - 0.05]) K.box("lm.Plaster001", x, y, z - depth, x + 0.05, y + h, z, hex("#ece6dc"));
  const segs: [number, number][] = o.door ? [[x0, o.door[0]], [o.door[1], x1]] : [[x0, x1]];
  for (const [a, b2] of segs) if (b2 - a > 0.05) K.quad("glass", [a, y, z], [b2, y, z], [b2, y + h, z], [a, y + h, z], [0, 0, 1], (p) => [p[0], p[1]], [0.99, 0.55, 0.8]);
  const bay = o.bay ?? 1.2;
  for (let x = x0; x <= x1 + 0.01; x += bay) {
    if (o.door && x > o.door[0] + 0.05 && x < o.door[1] - 0.05) continue;
    K.box("lm.Metal032.metal", x - 0.04, y, z - 0.02, x + 0.04, y + h, z + 0.06, frame);
  }
  if (o.door) for (const x of o.door) K.box("lm.Metal032.metal", x - 0.06, y, z - 0.02, x + 0.06, y + h, z + 0.08, frame);
  K.box("lm.Metal032.metal", x0, y + h - 0.06, z - 0.02, x1, y + h + 0.06, z + 0.06, frame);
}

def("h:mempool", (c) => {
  const { K, X, Z, u } = c;
  const W = 72,
    D = 36,
    H = 50,
    x0v = 7,
    x1v = 7 + W,
    G0 = 22;
  const hx1v = x0v + 44,
    dx0v = hx1v + 2,
    dx1v = x1v - 2;
  const dockC = Math.floor((dx0v + dx1v) / 2);
  const x0 = X(x0v),
    x1 = X(x1v),
    hx1 = X(hx1v),
    dx0 = X(dx0v),
    dx1 = X(dx1v);
  const zb = Z(0),
    zf = Z(D);
  const cream = hex("#ece8e0");
  const doorX0 = X(x0v + 18),
    doorX1 = X(x0v + 18 + 9);
  // the shell: rendered cream walls; the hall and the dock hollow at street level
  K.box("lm.Plaster001", x0, G0 * u, zb, x1, H * u, zf, cream, { skip: "-y" });
  K.box("lm.Plaster001", x0, 0, zb, x1, G0 * u, Z(2), cream, { skip: "-y" });
  for (const [a, b2] of [
    [x0, X(x0v + 2)],
    [hx1, dx0],
    [X(x1v - 2), x1],
  ])
    K.box("lm.Plaster001", a, 0, Z(2), b2, G0 * u, zf, cream, { skip: "-y" });
  K.box("lm.Concrete031", x0, 0, zf - u, x1, 2 * u, zf, hex("#4a4656"));
  // ---- the pickup hall: tiled floor, the ceiling with its light panels, the glass front and the door ----
  K.box("lm.Tiles074", X(x0v + 2), 0, Z(2), hx1, u * 0.6, zf - u, hex("#d2cec6"));
  K.box("lm.Plaster001", X(x0v + 2), (G0 - 3) * u, Z(2), hx1, (G0 - 2) * u, zf - u, hex("#9a968e"), { skip: "+y" });
  if (!c.far) for (let x = x0v + 5; x < hx1v - 4; x += 9) for (const z of [8, 17, 26]) K.box("lm.glow", X(x), (G0 - 3) * u - 0.02, Z(z), X(x + 5), (G0 - 3) * u, Z(z + 2), hex("#f4f0e8", 0.9));
  // the back wall's bands, the orange lockers along it
  K.box("lm.glow", X(x0v + 2), 15 * u, Z(2), hx1, 16 * u, Z(2) + 0.05, ORANGE);
  K.box("lm.glow", X(x0v + 2), 14 * u, Z(2), hx1, 15 * u, Z(2) + 0.05, TEAL);
  for (let x = x0v + 4; x < x0v + 30; x += 4)
    for (let y = 1; y < 12; y += 3) {
      K.box("lm.paint", X(x) + 0.02, y * u, Z(2), X(x + 4) - 0.02, (y + 3) * u - 0.02, Z(3), hex("#e08a2a"));
      if (!c.far) K.box("lm.dark", X(x + 3), (y + 1.6) * u, Z(3), X(x + 3.5), (y + 2.2) * u, Z(3) + 0.02, hex("#3a3842"));
    }
  // the three block shelves (their boards carry the live blocks), goods on the back
  const sx0 = X(x0v + 6),
    sx1 = X(x0v + 26);
  for (const z of [10, 17, 24]) {
    K.box("lm.Metal032.metal", sx0, 0.6 * u, Z(z), sx1, 10 * u, Z(z + 2), hex("#3a3842"));
    for (let y = 2; y < 10; y += 2) {
      K.box("lm.Metal032.metal", sx0, y * u, Z(z + 2), sx1, (y + 0.4) * u, Z(z + 5), hex("#6a6774"));
      K.box("lm.glow", sx0, y * u, Z(z + 5), sx1, (y + 0.4) * u, Z(z + 5) + 0.03, hex("#ff9f2e", 0.6));
      if (!c.far) for (let x = x0v + 6; x < x0v + 26; x += 2) if (c.r() > 0.35) K.box("lm.paint", X(x) + 0.03, (y + 0.4) * u, Z(z) - 0.25, X(x + 1.6), (y + 1.7) * u, Z(z) - 0.02, hex(["#d0504a", "#4a9ad0", "#d0b04a", "#6ac06a", "#d07ab0", "#e8e8e8", "#9070d0", "#e08a3a"][Math.floor(c.r() * 8)]));
    }
    K.box("lm.Metal032.metal", sx0 - 0.1, 9.6 * u, Z(z - 1), sx1 + 0.1, 10 * u, Z(z + 3), hex("#2a2830"));
    for (const x of [sx0 - 0.1, sx1]) K.box("lm.Metal032.metal", x, 0.6 * u, Z(z - 1), x + 0.1, 10 * u, Z(z + 6), hex("#2a2830"));
  }
  // the counter, its till; the rack behind with the parcels for pickup
  const cx0 = X(hx1v - 14),
    cx1 = X(hx1v - 2);
  K.box("lm.Wood049", cx0, 0.6 * u, Z(D - 12), cx1, 7 * u, Z(D - 9), hex("#6a4a32"));
  K.box("lm.glow", cx0, 0.6 * u, Z(D - 9), cx1, 1.2 * u, Z(D - 9) + 0.03, ORANGE);
  K.box("lm.Marble021.gloss", cx0 - 0.05, 7 * u, Z(D - 12) - 0.05, cx1 + 0.05, 7.6 * u, Z(D - 9) + 0.08, hex("#e8e2d4"));
  K.box("lm.dark", cx0 + 0.2, 7.6 * u, Z(D - 11), cx0 + 0.5, 9.6 * u, Z(D - 10.6), hex("#2a2a30"));
  K.box("lm.glow", cx0 + 0.1, 9.6 * u, Z(D - 11.2), cx0 + 0.6, 10.6 * u, Z(D - 10.4), hex("#59e3ff"));
  K.box("lm.Wood049", cx0, 0.6 * u, Z(D - 20), cx1, 14 * u, Z(D - 18), hex("#6a5a4a"));
  for (let y = 5; y < 14; y += 4) K.box("lm.Wood049", cx0, y * u, Z(D - 18), cx1, (y + 0.4) * u, Z(D - 17), hex("#8a7a6a"));
  if (!c.far) for (let y = 1; y < 13; y += 4) for (let x = hx1v - 13; x < hx1v - 3; x += 3) parcelBox(c, X(x), (y + 0.4) * u, Z(D - 18.6), 2.2 * u, 2.4 * u, 1.4 * u, c.r() > 0.5 ? ORANGE : TEAL);
  K.box("lm.paint", cx0, 14 * u, Z(D - 20), cx1, 16 * u, Z(D - 17), TEAL);
  // the queue posts, a stand of goods, the ATM
  for (const x of [X(hx1v - 14 - 6), X(hx1v - 14 - 1)]) K.cyl("lm.Metal032.metal", x, Z(D - 4.5), 0.04, 0.04, 0, 6 * u, hex("#c9a227"), { sides: 6 });
  K.box("fabric", X(hx1v - 14 - 6), 4.4 * u, Z(D - 4.6), X(hx1v - 14 - 1), 4.9 * u, Z(D - 4.4), hex("#c0303a"));
  K.box("lm.dark", X(x0v + 3), 0.6 * u, Z(D - 9), X(x0v + 6), 12 * u, Z(D - 6), hex("#3a5a8a"));
  K.box("lm.glow", X(x0v + 3), 8 * u, Z(D - 6), X(x0v + 6), 10 * u, Z(D - 6) + 0.03, hex("#9fd8ff"));
  // the glazed front of the hall, the door; the canopy over the door on two posts
  glazedFront(c, X(x0v + 2), hx1, zf - 0.04, (G0 - 2) * u, "lobby", hex("#5a5a64"), { bay: 7 * u, door: [doorX0, doorX1], depth: 0.02 });
  K.box("lm.paint", doorX0 - 4 * u, 14 * u, zf, doorX1 + 4 * u, 15 * u, zf + 6 * u, hex("#e8e4dc"));
  K.box("lm.glow", doorX0 - 4 * u, 14 * u - 0.02, zf + 0.2, doorX1 + 4 * u, 14 * u, zf + 6 * u - 0.2, hex("#f4fff8"));
  K.box("lm.paint", doorX0 - 4 * u, 15 * u, zf, doorX1 + 4 * u, 17 * u, zf + 7 * u, ORANGE);
  K.box("lm.glow", doorX0 - 4 * u, 14.6 * u, zf + 6 * u, doorX1 + 4 * u, 15 * u, zf + 6.1 * u, TEAL);
  for (const x of [doorX0 - 3.5 * u, doorX1 + 3.5 * u]) K.cyl("lm.Metal032.metal", x, zf + 5.5 * u, 0.06, 0.06, 0, 14 * u, hex("#2a2830"), { sides: 8 });
  K.box("lm.dark", doorX0, 0, zf, doorX1, 0.6 * u, zf + 3 * u, hex("#3a3842"));
  // ---- the loading dock: its floor, the conveyor through the pass, the racks, pallets, the roller door ----
  K.box("lm.Concrete031", dx0, 0, Z(3), dx1, u, zf - u, hex("#8a8890"));
  if (!c.far) for (let z = 6; z < D - 2; z += 4) K.box("lm.paint", dx0 + u, u, Z(z), dx0 + 2 * u, u + 0.01, Z(z + 2), hex("#f4c020"));
  K.box("lm.Concrete031", dx0, 17 * u, Z(3), dx1, 18 * u, zf - u, hex("#5a5864"));
  if (!c.far) for (let x = dx0v + 2; x < dx1v - 2; x += 7) K.box("lm.glow", X(x), 17 * u - 0.02, Z(10), X(x + 4), 17 * u, Z(11), hex("#ffe2a8"));
  const passZ = D - 16;
  K.box("lm.dark", hx1, 13 * u, Z(passZ - 3), dx0, 14 * u, Z(passZ + 3), hex("#f4c020"));
  K.box("lm.Metal032", X(dx0v + 3), 4 * u, Z(passZ - 2), X(dx1v - 2), 5 * u, Z(passZ + 2), hex("#2a2830"));
  for (const x of [dx0v + 4, dx0v + 12, dx1v - 4]) K.box("lm.Metal032.metal", X(x), u, Z(passZ - 2), X(x + 1), 4 * u, Z(passZ + 2), hex("#8a8690"));
  if (!c.far) for (let x = dx0v + 5; x < dx1v - 4; x += 5) parcelBox(c, X(x), 5 * u, Z(passZ - 1), 3 * u, 2 * u, 3 * u);
  for (const y of [1, 7, 13]) K.box("lm.Metal032.metal", dx0, y * u, Z(3), dx1, (y + 0.5) * u, Z(9), hex("#2c5aa0"));
  for (let x = dx0v; x <= dx1v - 1; x += 7) K.box("lm.Metal032.metal", X(x), u, Z(3), X(x + 0.6), 17 * u, Z(9), hex("#e07a1a"));
  if (!c.far)
    for (const [x, z] of [
      [dx0v + 2, D - 9],
      [dx1v - 9, D - 22],
    ]) {
      K.box("lm.Wood049", X(x), u, Z(z), X(x + 8), 2 * u, Z(z + 7), hex("#c8a878"));
      parcelBox(c, X(x), 2 * u, Z(z), 4 * u, 3 * u, 3 * u);
      parcelBox(c, X(x + 4), 2 * u, Z(z), 4 * u, 4 * u, 3 * u);
      parcelBox(c, X(x), 2 * u, Z(z + 3), 4 * u, 4 * u, 3 * u, TEAL);
    }
  // the roller door, raised (its drum under the lintel), the hazard-striped frame, the dock bumpers
  K.box("lm.Metal032", dx0, 14 * u, zf - u, dx1, 16 * u, zf, hex("#8a909a"));
  K.box("lm.dark", dx0 - u, 16 * u, zf - 2 * u, dx1 + u, 18 * u, zf, hex("#5a5864"));
  for (const x of [dx0 - u, dx1]) {
    K.box("lm.paint", x, 0, zf - u, x + u, 16 * u, zf + u, hex("#f4c020"));
    if (!c.far) for (let y = 1; y < 16; y += 2) K.box("lm.paint", x - 0.005, y * u, zf + u - 0.005, x + u + 0.005, (y + 1) * u, zf + u + 0.005, hex("#1c1a20"), { skip: "-y+y" });
  }
  K.box("lm.paint", dx0 - u, 16 * u, zf, dx1 + u, 17 * u, zf + u, hex("#f4c020"));
  for (const x of [dx0 + u, dx1 - 3 * u]) K.box("lm.dark", x, u, zf, x + 2 * u, 4 * u, zf + u, hex("#18161c"));
  K.box("lm.Concrete031", dx0, 0, zf, dx1, u, zf + 2 * u, hex("#6a6872"));
  for (const x of [dx0 - 3 * u, dx1 + u]) {
    K.cyl("lm.paint", x + u, zf + 5 * u, 0.15, 0.15, 0, 6 * u, hex("#f4c020"), { sides: 10 });
    K.cyl("lm.paint", x + u, zf + 5 * u, 0.155, 0.155, 2 * u, 3 * u, hex("#1c1a20"), { sides: 10, caps: "none" });
  }
  for (const x of [dx0 - 2 * u, dx1]) {
    K.box("lm.Metal032.metal", x, 18 * u, zf, x + 2 * u, 19 * u, zf + 3 * u, hex("#8a8690"));
    K.box("lm.glow", x, 17 * u, zf + 2 * u, x + 2 * u, 18 * u, zf + 3 * u, hex("#ffc070"));
  }
  K.box("lm.dark", X(dockC - 3), 19 * u, zf, X(dockC + 3), 22 * u, zf + u, hex("#18161c"));
  K.sphere("lm.glow", X(dockC - 1), 20.5 * u, zf + u, 0.12, hex("#ff3048"), { segs: 4 });
  K.sphere("lm.glow", X(dockC + 2), 20.5 * u, zf + u, 0.12, hex("#3ee08f"), { segs: 4 });
  // ---- the upper floors: the chain's bands, the live board's frame, the dock's offices, the cornice ----
  K.box("lm.Plaster001", x0 - u, (G0 - 1) * u, zf, x1 + u, G0 * u, zf + 2 * u, hex("#e8e4dc"));
  K.box("lm.glow", x0 - u, G0 * u, zf, x1 + u, (G0 + 1) * u, zf + 2 * u, ORANGE);
  K.box("lm.glow", x0 - u, (G0 + 1) * u, zf, x1 + u, (G0 + 2) * u, zf + u, TEAL);
  const bx0 = X(x0v + 3),
    bx1 = X(hx1v - 1),
    by0 = (G0 + 4) * u,
    by1 = (H - 6) * u;
  K.box("lm.dark", bx0 - u, by0 - u, zf, bx1 + u, by1 + u, zf + 2 * u, hex("#141218"));
  K.box("lm.glow", bx0 - u, by0 - 2 * u, zf + u, bx1 + u, by0 - u, zf + 2 * u, ORANGE);
  for (const y of [G0 + 4, G0 + 14])
    for (let x = dx0v; x < dx1v - 2; x += 7) {
      K.box("lm.Plaster001", X(x - 1), (y - 1) * u, zf, X(x + 6), y * u, zf + u, hex("#cfc8bb"));
      K.quad("lm.glass", [X(x), y * u, zf + 0.01], [X(x + 5), y * u, zf + 0.01], [X(x + 5), (y + 7) * u, zf + 0.01], [X(x), (y + 7) * u, zf + 0.01], [0, 0, 1], (p) => [p[0], p[1]], hex("#3a4a62"));
    }
  for (const y of [G0 + 4, G0 + 14]) for (let z = 6; z < D - 6; z += 8) K.quad("lm.glass", [x1 + 0.01, y * u, Z(z + 5)], [x1 + 0.01, y * u, Z(z)], [x1 + 0.01, (y + 6) * u, Z(z)], [x1 + 0.01, (y + 6) * u, Z(z + 5)], [1, 0, 0], (p) => [p[2], p[1]], hex("#3a4a62"));
  K.box("lm.glow", x0 - u, (H - 4) * u, zf - u, x1 + u, (H - 3) * u, zf + u, TEAL);
  K.box("lm.Plaster001", x0 - u, (H - 3) * u, zb, x1 + u, (H - 1) * u, zf + u, hex("#e8e4dc"));
  K.box("lm.Concrete031", x0, (H - 1) * u, zb, x1, (H - 0.6) * u, zf, hex("#3b3745"));
  // the roof: the giant parcel over the dock, the MEMPOOL billboard over the hall, AC units
  const px = X(dx0v + 2);
  parcelBox(c, px, H * u, Z(10), 20 * u, 14 * u, 18 * u);
  K.box("lm.paint", px + 4 * u, (H + 4) * u, Z(28), px + 9 * u, (H + 9) * u, Z(28) + 0.03, hex("#f0ece4"));
  for (let x = x0v + 4; x < hx1v - 2; x += 8) K.box("lm.Metal032.metal", X(x), H * u, Z(D - 4), X(x + 1), (H + 14) * u, Z(D - 3), hex("#2e2c36"));
  K.box("lm.Plaster001", X(x0v + 3), (H + 3) * u, Z(D - 4), X(hx1v - 2), (H + 14) * u, Z(D - 3), hex("#e8e4dc"));
  K.box("lm.glow", X(x0v + 3), (H + 2) * u, Z(D - 3), X(hx1v - 2), (H + 3) * u, Z(D - 2), ORANGE);
  K.box("lm.glow", X(x0v + 3), (H + 14) * u, Z(D - 3), X(hx1v - 2), (H + 15) * u, Z(D - 2), TEAL);
  for (let x = x0v + 6; x < hx1v - 6; x += 12) {
    K.box("lm.Metal032", X(x), H * u, Z(6), X(x + 6), (H + 5) * u, Z(12), hex("#c8ccd0"));
    if (!c.far) K.cyl("lm.dark", X(x + 3), Z(9), 0.4, 0.4, (H + 5) * u, (H + 5) * u + 0.02, hex("#2a2a30"), { sides: 12 });
  }
  // the vertical sign box at the dock end
  K.box("lm.dark", X(x1v - 3), (G0 + 4) * u, zf, X(x1v - 1), (G0 + 24) * u, zf + 6 * u, hex("#1a1820"));
});

def("h:kiosk", (c) => {
  const { K, X, Z, u } = c;
  const W = c.b.model.w - 14,
    D = 26,
    H = 30,
    gh = 17;
  const x0v = 7,
    x1v = 7 + W;
  const x0 = X(x0v),
    x1 = X(x1v),
    zb = Z(0),
    zf = Z(D);
  const cream = hex("#ece8e0");
  K.box("lm.Plaster001", x0, gh * u, zb, x1, H * u, zf, cream, { skip: "-y" });
  K.box("lm.Plaster001", x0, 0, zb, x1, gh * u, Z(4), cream, { skip: "-y" });
  for (const [a, b2] of [
    [x0, X(x0v + 2)],
    [X(x1v - 2), x1],
  ])
    K.box("lm.Plaster001", a, 0, Z(4), b2, gh * u, zf, cream, { skip: "-y" });
  K.box("lm.Tiles074", X(x0v + 2), 0, Z(4), X(x1v - 2), 0.6 * u, zf, hex("#d2cec6"));
  // the shop: goods on shelves along the back, the parcel rack, the counter
  K.box("lm.Metal032.metal", X(x0v + 2), 0.6 * u, Z(4), X(x1v - 10), 11 * u, Z(5), hex("#3a3842"));
  if (!c.far)
    for (const y of [3, 6, 9]) {
      K.box("lm.Metal032.metal", X(x0v + 3), (y - 1) * u, Z(5), X(x1v - 10), (y - 0.6) * u, Z(6.4), hex("#6a6774"));
      for (let x = x0v + 3; x < x1v - 10; x++) if (c.r() > 0.3) K.box("lm.paint", X(x) + 0.02, (y - 0.6) * u, Z(5.2), X(x + 1) - 0.02, (y + 0.6) * u, Z(6.2), hex(["#d0504a", "#4a9ad0", "#d0b04a", "#6ac06a", "#d07ab0", "#e8e8e8", "#9070d0", "#e08a3a"][Math.floor(c.r() * 8)]));
    }
  K.box("lm.Wood049", X(x1v - 9), 0.6 * u, Z(5), X(x1v - 3), 12 * u, Z(8), hex("#6a5a4a"));
  if (!c.far) for (let y = 2; y < 11; y += 3) for (const [dx, t] of [[0, ORANGE], [3, TEAL]] as const) parcelBox(c, X(x1v - 9 + dx), y * u, Z(6), 2.6 * u, 2 * u, 2 * u, t);
  K.box("lm.Wood049", X(x1v - 11), 0.6 * u, Z(D - 9), X(x1v - 3), 6 * u, Z(D - 7), hex("#5a4a3c"));
  K.box("lm.Marble021.gloss", X(x1v - 11), 6 * u, Z(D - 9), X(x1v - 3), 6.6 * u, Z(D - 7), hex("#e8e2d4"));
  K.box("lm.glow", X(x1v - 5), 6.6 * u, Z(D - 9), X(x1v - 3), 8.6 * u, Z(D - 8.6), hex("#59e3ff"));
  K.box("lm.glow.night", X(x0v + 2), (gh - 4) * u - 0.02, Z(4), X(x1v - 2), (gh - 4) * u, zf, hex("#f4f0e8"));
  // the glazed front, the door
  const doorX = x0v + Math.floor(W / 2) - 4;
  glazedFront(c, X(x0v + 2), X(x1v - 2), zf - 0.04, (gh - 4) * u, "konbini", hex("#5a5a64"), { bay: 6 * u, door: [X(doorX), X(doorX + 7)], depth: 0.02 });
  // the fascia: cream, orange and teal lines
  K.box("lm.Plaster001", x0 - u, (gh - 4) * u, zf - u, x1 + u, gh * u, zf + u, hex("#ece8e0"));
  K.box("lm.glow", x0 - u, (gh - 4) * u, zf + u, x1 + u, (gh - 3) * u, zf + 2 * u, ORANGE);
  K.box("lm.glow", x0 - u, (gh - 1) * u, zf + u, x1 + u, gh * u, zf + 2 * u, TEAL);
  // the pickup lockers outside, in orange
  for (let x = x0v + 1; x < doorX - 2; x += 3)
    for (let y = 0; y < 10; y += 3) {
      K.box("lm.paint", X(x) + 0.02, y * u + 0.01, zf, X(x + 3) - 0.02, (y + 3) * u - 0.01, zf + 2 * u, hex("#e08a2a"));
      if (!c.far) K.box("lm.dark", X(x + 2), (y + 1.2) * u, zf + 2 * u, X(x + 2.5), (y + 1.8) * u, zf + 2 * u + 0.02, hex("#3a3842"));
    }
  K.box("lm.paint", X(x0v + 1), 10 * u, zf, X(doorX - 2), 11 * u, zf + 2 * u, TEAL);
  // upstairs: a lit office window band, mullions, an AC unit; the parapet
  K.quad("lm.glass", [X(x0v + 4), (gh + 2) * u, zf + 0.01], [X(x1v - 4), (gh + 2) * u, zf + 0.01], [X(x1v - 4), (H - 4) * u, zf + 0.01], [X(x0v + 4), (H - 4) * u, zf + 0.01], [0, 0, 1], (p) => [p[0], p[1]], hex("#4a5a72"));
  lit(c, "lobby", X(x0v + 4), X(x1v - 4), (gh + 2) * u, (H - 4) * u, zf - 0.3, 2);
  for (let x = x0v + 4; x < x1v - 4; x += 5) K.box("lm.Metal032.metal", X(x), (gh + 2) * u, zf, X(x + 0.6), (H - 4) * u, zf + 0.06, hex("#5a5a64"));
  K.box("lm.Metal032", X(x1v - 9), (gh + 1) * u, zf, X(x1v - 3), (gh + 5) * u, zf + 3 * u, hex("#d8dce0"));
  K.box("lm.Plaster001", x0 - u, (H - 2) * u, zb, x1 + u, H * u, zf + u, hex("#e8e4dc"));
  K.box("lm.glow", x0 - u, (H - 3) * u, zf, x1 + u, (H - 2) * u, zf + u, ORANGE);
  // the sign box on the roof (its face: the live counter), a parcel, an AC unit
  const sx0 = X(x0v + 2),
    sx1 = X(x1v - 2);
  for (const x of [X(x0v + 4), X(x1v - 5)]) K.box("lm.Metal032.metal", x, H * u, Z(D - 5), x + u, (H + 3) * u, Z(D - 4), hex("#8a8690"));
  K.box("lm.dark", sx0 - u, (H + 3) * u, Z(D - 5), sx1 + u, (H + 13) * u, Z(D - 3), hex("#141218"));
  K.box("lm.glow", sx0 - u, (H + 2) * u, Z(D - 4), sx1 + u, (H + 3) * u, Z(D - 3), ORANGE);
  K.box("lm.glow", sx0 - u, (H + 13) * u, Z(D - 4), sx1 + u, (H + 14) * u, Z(D - 3), TEAL);
  parcelBox(c, X(x0v + 4), H * u, Z(4), 8 * u, 6 * u, 8 * u);
  K.box("lm.Metal032", X(x1v - 10), H * u, Z(6), X(x1v - 5), (H + 4) * u, Z(11), hex("#c8ccd0"));
});

/** A pitched tile roof over [x0, x1] × [zb, zf] from y (ridge along x), eaves out over the front. */
function shopRoof(c: LmCtx, x0: number, x1: number, zb: number, zf: number, y: number, col: V3) {
  return gableRoof(c, "lm.RoofingTiles006", x0, zb, x1, zf, y, false, 0.55, col, { s: "lm.Wood049", col: hex("#3a2a22") }, 0.35);
}

def("h:streetshop", (c) => {
  const { K, X, Z, u } = c;
  const kind = (c.b as Built & { kind?: string }).kind ?? (c.b.signs[0]?.text.includes("ガチャ") ? "gacha" : c.b.signs[0]?.text.includes("TEA") ? "tea" : c.b.signs[0]?.text.includes("FLOWERS") ? "florist" : "ramen");
  const W = c.b.model.w - 14,
    D = 30,
    gh = kind === "ramen" ? 18 : 17,
    H = kind === "ramen" ? gh + 16 : kind === "tea" ? gh + 15 : kind === "florist" ? gh + 14 : c.b.model.h - 26;
  const x0v = 7,
    x1v = 7 + W;
  const x0 = X(x0v),
    x1 = X(x1v),
    zb = Z(0),
    zf = Z(D);
  const wall: Record<string, [Slot, V3]> = {
    ramen: ["lm.Wood049", hex("#4a3226")],
    florist: ["lm.Plaster001", hex("#e8e0d0")],
    tea: ["lm.Wood049", hex("#7a5a3a")],
    gacha: ["lm.Plaster001", hex("#f4eef4")],
  };
  const [ws, wc] = wall[kind];
  // the shell, the shop room open behind its glass at street level
  K.box(ws, x0, (gh - 4) * u, zb, x1, H * u, zf, wc, { skip: "-y" });
  K.box(ws, x0, 0, zb, x1, (gh - 4) * u, Z(D - 12), wc, { skip: "-y" });
  for (const [a, b2] of [
    [x0, X(x0v + 1)],
    [X(x1v - 1), x1],
  ])
    K.box(ws, a, 0, Z(D - 12), b2, (gh - 4) * u, zf, wc, { skip: "-y" });
  const cell = { ramen: "ramen", florist: "florist", tea: "cafe", gacha: "konbini" }[kind]!;
  const floorCol = { ramen: hex("#5a4a3a"), florist: hex("#c8c0b0"), tea: hex("#8a7a60"), gacha: hex("#3a2a52") }[kind]!;
  K.box(kind === "gacha" ? "lm.Tiles074" : "lm.Wood049", X(x0v + 1), 0, Z(D - 12), X(x1v - 1), 0.5 * u, zf, floorCol);
  const frame = { ramen: hex("#2a1c14"), florist: hex("#2f6b3c"), tea: hex("#3a2618"), gacha: hex("#2a2236") }[kind]!;
  const doorX = kind === "ramen" ? x1v - 9 : kind === "tea" ? x1v - 10 : kind === "florist" ? x0v + 3 : x0v + Math.floor(W / 2) - 3;
  glazedFront(c, X(x0v + 1), X(x1v - 1), zf - 0.04, (gh - 4) * u, cell, frame, { bay: (kind === "tea" ? 2 : 5) * u, door: [X(doorX), X(doorX + 7)], depth: 12 * u });
  if (!c.far) {
    if (kind === "ramen") {
      // the counter with its red stools, seen through the window
      K.box("lm.Wood049", X(x0v + 1), 0.5 * u, Z(D - 8), X(x1v - 1), 7 * u, Z(D - 6), hex("#c89a60"));
      for (let x = x0v + 3; x < x1v - 2; x += 4) {
        K.cyl("lm.dark", X(x + 0.5), Z(D - 4.5), 0.04, 0.04, 0.5 * u, 4 * u, hex("#2a2a30"), { sides: 6 });
        K.cyl("lm.plastic", X(x + 0.5), Z(D - 4.5), 0.2, 0.2, 4 * u, 4.6 * u, hex("#c0303a"), { sides: 10 });
        K.cyl("lm.paint", X(x + 1), Z(D - 7), 0.15, 0.18, 7 * u, 8 * u, hex("#e8e0d0"), { sides: 10 });
      }
    } else if (kind === "florist") {
      // tiered stands of flower buckets inside and out
      for (let k = 0; k < 3; k++) {
        const zz = Z(D - 4 - k * 2);
        K.box("lm.Wood049", X(doorX + 8), 0, zz - 0.15, X(x1v - 1), (k * 2 + 1) * u, zz + 0.15, hex("#b08a5a"));
        for (let x = doorX + 9; x < x1v - 2; x += 3) {
          K.cyl("lm.Metal032.metal", X(x + 0.5), zz, 0.16, 0.13, (k * 2 + 1) * u, (k * 2 + 3) * u, hex("#9aa0a8"), { sides: 8 });
          K.sphere("lm.paint", X(x + 0.5), (k * 2 + 3.6) * u, zz, 0.22, hex(["#e05a8a", "#f0c040", "#f4f4f4", "#c060e0", "#ff7a4a", "#ff4a6a"][(x + k) % 6]), { segs: 5 });
        }
      }
    } else if (kind === "gacha") {
      // capsule machines in rows: a coloured base, a clear dome of capsules
      const caps = ["#ff3e8a", "#3ef0ff", "#f4b728", "#5cff9a", "#b07bff", "#ff8a3a", "#f4f0e8"];
      for (let x = x0v + 3; x < x1v - 4; x += 4)
        for (const zv of [D - 6, D + 1.5]) {
          const mx = X(x + 1.5),
            mz = Z(zv + 1.5);
          K.box("lm.plastic", mx - 0.25, 0.5 * u, mz - 0.25, mx + 0.25, 3 * u + 0.5 * u, mz + 0.25, hex(caps[(x + Math.floor(zv)) % caps.length]));
          K.box("lm.glass", mx - 0.24, 3.5 * u, mz - 0.24, mx + 0.24, 6.5 * u, mz + 0.24, hex("#cfe8ff"));
          for (let k2 = 0; k2 < 3; k2++) K.sphere("lm.plastic", mx - 0.12 + k2 * 0.12, 4.2 * u, mz, 0.07, hex(caps[(x + k2) % caps.length]), { segs: 4 });
          K.box("lm.plastic", mx - 0.25, 6.5 * u, mz - 0.25, mx + 0.25, 7 * u, mz + 0.25, hex(caps[(x + Math.floor(zv)) % caps.length]));
        }
    } else {
      // the tea house: lattice screens, a low bench with cushions
      for (let x = x0v + 2; x < doorX - 1; x += 2) K.box("lm.Wood049", X(x), 2 * u, zf, X(x + 0.5), (gh - 3) * u, zf + 0.05, frame);
      for (let y = 4; y < gh - 3; y += 4) K.box("lm.Wood049", X(x0v + 2), y * u, zf, X(doorX - 1), (y + 0.5) * u, zf + 0.05, frame);
    }
  }
  // the fascia over the shop, the eave
  K.box("lm.Wood049", x0, (gh - 4) * u, zf - u, x1, gh * u, zf + u, kind === "gacha" ? hex("#2a2236") : kind === "florist" ? hex("#2f6b3c") : hex("#2a1c14"));
  if (kind === "gacha") {
    for (const x of [X(x0v + 1), X(x1v - 2)]) K.box("lm.glow", x, 0, zf, x + u, (gh - 4) * u, zf + u, hex("#ff3e8a"));
    K.box("lm.glow", X(x0v + 1), (gh - 5) * u, zf, X(x1v - 1), (gh - 4) * u, zf + u, hex("#3ef0ff"));
    // the giant capsule over the door: pink and white halves, a gold band
    const cxx = X(x0v + Math.floor(W / 2)),
      cyy = (gh + 5) * u;
    K.sphere("lm.plastic", cxx, cyy, zf + u, 6 * u, hex("#ff6aa8"), { hemi: true, segs: 16 });
    K.sphere("lm.plastic", cxx, cyy, zf + u, 6 * u, hex("#ffffff"), { hemi: true, segs: 16, sy: -1 });
    K.cyl("lm.Metal032.metal", cxx, zf + u, 6.1 * u, 6.1 * u, cyy - 0.06, cyy + 0.06, hex("#f4b728"), { sides: 24, caps: "none" });
    K.box("lm.glow", x0, (H - 3) * u, zf - u, x1, (H - 2) * u, zf + u, hex("#ff3e8a"));
    K.box("lm.Plaster001", x0 - u, (H - 2) * u, zb, x1 + u, H * u, zf + u, hex("#2a2236"));
    for (const x of [x0v + 1, x1v - 5]) K.box("lm.glow.night", X(x), (gh + 3) * u, zf, X(x + 4), (H - 4) * u, zf + 0.02, hex(x < x0v + 3 ? "#c07aff" : "#ff7ab8", 0.8));
  } else {
    // upstairs windows, a tile roof (pitched, eaves over the front), lanterns or an awning
    windows(c, true, zf, 1, x0 + 0.4, x1 - 0.4, [(gh + 3) * u], 0.9, 1.6, 1.8, hex("#d8cfbe"));
    shopRoof(c, x0, x1, zb, zf, H * u, kind === "florist" ? hex("#3a4a3a") : hex("#2e2a34"));
    if (kind === "florist") {
      // a striped awning (no collision), planters spilling upstairs
      for (let i = 0; i < Math.round(W / 4); i++) {
        const a = X(x0v + 1 + i * 4),
          b2 = Math.min(X(x1v - 1), a + 4 * u);
        K.quad("awning", [a, (gh - 4) * u, zf + 0.1], [b2, (gh - 4) * u, zf + 0.1], [b2, (gh - 7) * u, zf + 1.4], [a, (gh - 7) * u, zf + 1.4], [0, 0.4, 0.92], (p) => [p[0], p[2]], i % 2 ? hex("#2f6b3c") : hex("#f4f0e8"));
      }
      for (let x = x0v + 2; x < x1v - 3; x += 5) c.ex.trees.push([X(x + 1.5), (gh + 1) * u, zf + 0.4, "bush", x]);
    } else {
      // the noren over the door, lanterns along the eave
      for (let x = doorX; x < doorX + 7; x += 2.5) K.box("fabric", X(x), (gh - 10) * u, zf + u + 0.02, X(x + 2.2), (gh - 4) * u, zf + u + 0.06, kind === "tea" ? hex("#3a6a3a") : hex("#1e2a5a"));
      if (!c.far) for (let x = x0v + 2; x < doorX - 3; x += 5) K.sphere("lm.glow.night", X(x + 1.5), (gh - 1) * u, zf + 1.6 * u, 1.3 * u, hex(kind === "tea" ? "#f4e8d0" : "#ff5a3a"), { segs: 6, sy: 1.3 });
    }
    if (kind === "ramen") {
      // the giant bowl over the door: red bowl, golden noodles, chopsticks
      const bx = X(x0v + Math.floor(W / 2)),
        by = (gh + 6) * u;
      K.cyl("lm.plastic", bx, zf + 3 * u, 3 * u, 5.4 * u, by, by + 3.2 * u, hex("#c0303a"), { sides: 20, caps: "none" });
      K.cyl("lm.plastic", bx, zf + 3 * u, 4.6 * u, 4.6 * u, by + 2.8 * u, by + 3.1 * u, hex("#e8c050"), { sides: 20 });
      K.cyl("lm.plastic", bx, zf + 3 * u, 5.5 * u, 5.5 * u, by + 3.1 * u, by + 3.3 * u, hex("#f0ece4"), { sides: 20, caps: "none" });
      K.bar("lm.Wood049", [bx - 0.15, by + 3.2 * u, zf + 3 * u], [bx - 0.45, by + 11 * u, zf + 2.5 * u], 0.08, hex("#d8b080"));
      K.bar("lm.Wood049", [bx + 0.15, by + 3.2 * u, zf + 3 * u], [bx + 0.35, by + 10.5 * u, zf + 3.6 * u], 0.08, hex("#d8b080"));
    }
  }
  // the vertical sign box beside the shop
  K.box("lm.dark", X(x0v + 1), (gh + 2) * u, zf, X(x0v + 3), (gh + 15) * u, zf + 5 * u, hex("#1a1820"));
});

/** Rows of book spines behind glass (a bookshop's shelves), facing +z at z, x0…x1, y0…y1 (metres). */
function bookRows(c: LmCtx, x0: number, x1: number, y0: number, y1: number, z: number) {
  if (c.far) {
    c.K.box("lm.paint", x0, y0, z - 0.3, x1, y1, z, hex("#8a6a50"));
    return;
  }
  const spines = ["#b0413e", "#3a6ea5", "#d9a441", "#2f7d5b", "#6b4c9a", "#c76b2d", "#e8e0cf", "#2a2a35"].map((h2) => hex(h2));
  for (let y = y0; y < y1 - 0.4; y += 0.66) {
    c.K.box("lm.Wood049", x0, y, z - 0.3, x1, y + 0.05, z, hex("#6a4630"));
    let x = x0;
    while (x < x1 - 0.05) {
      const w = 0.05 + c.r() * 0.07;
      const h = 0.35 + c.r() * 0.2;
      if (c.r() > 0.08) c.K.box("lm.paint", x, y + 0.05, z - 0.25, Math.min(x1, x + w), y + 0.05 + h, z - 0.02, spines[Math.floor(c.r() * spines.length)], { skip: "-y-z" });
      x += w + 0.005;
    }
  }
}

def("h:bookshop", (c) => {
  const { K, X, Z, u } = c;
  const W = c.b.model.w - 14,
    D = 34;
  const x0v = 7,
    x1v = 7 + W;
  const midv = x0v + Math.floor(W / 2);
  const a0v = midv - 15,
    a1v = midv + 15;
  const x0 = X(x0v),
    x1 = X(x1v),
    a0 = X(a0v),
    a1 = X(a1v),
    mid = X(midv),
    zb = Z(0),
    zf = Z(D);
  const stone = hex("#c4baa9"),
    timber = hex("#6a4630"),
    copper = hex("#4a4e58");
  // the stone plinth, the two wings in stone with timber bands and tall windows, books upstairs
  K.box("lm.Marble021", x0, 0, zb, x1, 3 * u, zf, stone, { skip: "-y" });
  for (const [w0v, w1v] of [
    [x0v, a0v],
    [a1v, x1v],
  ]) {
    K.box("lm.Plaster001", X(w0v), 3 * u, zb, X(w1v), 30 * u, Z(D - 2), stone, { skip: "-y" });
    for (const y of [14, 28]) K.box("lm.Wood049", X(w0v), y * u, Z(D - 2), X(w1v), (y + 2) * u, Z(D - 1), timber);
    for (let x = w0v + 3; x + 6 <= w1v - 2; x += 9) {
      glazedFront(c, X(x), X(x + 6), Z(D - 2) + 0.02, 9 * u, w0v === x0v ? "market" : "cafe", timber, { bay: 3 * u, y: 4 * u, depth: 1.5 });
      K.quad("lm.glass", [X(x), 17 * u, Z(D - 2) + 0.02], [X(x + 6), 17 * u, Z(D - 2) + 0.02], [X(x + 6), 27 * u, Z(D - 2) + 0.02], [X(x), 27 * u, Z(D - 2) + 0.02], [0, 0, 1], (p) => [p[0], p[1]], hex("#e8d8b8"));
      bookRows(c, X(x), X(x + 6), 17.4 * u, 26.6 * u, Z(D - 2) - 0.1);
      for (const xx of [x - 1, x + 6]) K.box("lm.Wood049", X(xx), 3 * u, Z(D - 2), X(xx + 1), 14 * u, Z(D - 1), timber);
    }
  }
  // the atrium: three floors of books behind tall glass, timber frame, the door, the steps
  for (const x of [a0 - 2 * u, a1]) K.box("lm.Wood049", x, 3 * u, Z(D - 3), x + 2 * u, 36 * u, zf, timber);
  K.box("lm.Wood049", a0, 3 * u, Z(4), a1, 36 * u, Z(5), hex("#3a3028"));
  for (const y of [3, 14, 25]) K.box("lm.Wood049", a0, y * u, Z(D - 9), a1, (y + 1) * u, Z(D - 6), timber);
  for (const [y0, y1] of [
    [4, 13],
    [15, 24],
    [26, 35],
  ]) {
    bookRows(c, a0 + u, a1 - u, y0 * u, y1 * u, Z(D - 7) + 0.3);
    lit(c, "lobby", a0 + u, a1 - u, y0 * u, y1 * u, Z(5) + 0.02, 3);
  }
  K.quad("lm.glass", [a0, 3 * u, Z(D - 2) + 0.03], [a1, 3 * u, Z(D - 2) + 0.03], [a1, 36 * u, Z(D - 2) + 0.03], [a0, 36 * u, Z(D - 2) + 0.03], [0, 0, 1], (p) => [p[0] * 0.3, p[1] * 0.3], hex("#bfe0ec"));
  for (let x = a0v + 5; x < a1v; x += 5) K.box("lm.dark", X(x), 3 * u, Z(D - 2), X(x + 0.5), 36 * u, Z(D - 1), hex("#2a2622"));
  for (const y of [14, 25]) K.box("lm.dark", a0, y * u, Z(D - 2), a1, (y + 0.5) * u, Z(D - 1), hex("#2a2622"));
  // the atrium's sides and floors behind the glass
  for (const y of [14, 25]) K.box("lm.Wood049", a0, (y - 0.4) * u, Z(5), a1, y * u, Z(D - 9), hex("#7a5a40"));
  K.box("lm.Wood049", mid - 4 * u, 3 * u, Z(D - 2), mid + 4 * u, 12 * u, Z(D - 1) + 0.04, hex("#4a3424"));
  K.quad("glass", [mid - 3 * u, 4 * u, Z(D - 1) + 0.05], [mid + 3 * u, 4 * u, Z(D - 1) + 0.05], [mid + 3 * u, 11 * u, Z(D - 1) + 0.05], [mid - 3 * u, 11 * u, Z(D - 1) + 0.05], [0, 0, 1], (p) => [p[0], p[1]], [0.99, 0.85, 0.7]);
  K.box("lm.glow", mid - 5 * u, 12 * u, Z(D - 1), mid + 5 * u, 13 * u, zf + u, hex("#ffd28a"));
  for (let k = 0; k < 3; k++) K.box("lm.Marble021", X(midv - 8 - k), 0, Z(D + k), X(midv + 8 + k), (3 - k) * u, Z(D + 1 + k), stone, { skip: "-y" });
  // the copper roofs: the wings hipped, the atrium's higher, a lit ridge lantern
  hipRoof(c, "lm.Metal032.metal", x0 - 2 * u, zb - u, a0 + u, zf + u, 30 * u, 0.55, copper, 0.1);
  hipRoof(c, "lm.Metal032.metal", a1 - u, zb - u, x1 + 2 * u, zf + u, 30 * u, 0.55, copper, 0.1);
  hipRoof(c, "lm.Metal032.metal", a0 - 3 * u, zb - u, a1 + 3 * u, zf + u, 36 * u, 0.6, copper, 0.1);
  K.box("lm.glow.night", a0 + 4 * u, 43 * u, Z(D / 2 - 1), a1 - 4 * u, 44 * u, Z(D / 2 + 1), hex("#ffd28a"));
  // the green-and-cream awnings over the wings (no collision), the café's tables out on the square
  for (const [w0v, w1v] of [
    [x0v + 2, a0v - 3],
    [a1v + 3, x1v - 2],
  ])
    for (let x = w0v; x < w1v; x += 2) K.quad("awning", [X(x), 14 * u, Z(D - 2)], [X(x + 2), 14 * u, Z(D - 2)], [X(x + 2), 11.5 * u, Z(D + 3)], [X(x), 11.5 * u, Z(D + 3)], [0, 0.9, 0.45], (p) => [p[0], p[2]], ((x - w0v) >> 1) % 2 ? hex("#ece4cc") : hex("#2e6a4a"));
  for (let x = a1v + 5; x + 4 < x1v - 2; x += 9) {
    const tx = X(x + 1.5),
      tz = Z(D + 5.5);
    K.cyl("lm.dark", tx, tz, 0.04, 0.04, 0, 3 * u, hex("#2a2622"), { sides: 6 });
    K.cyl("lm.Marble021.gloss", tx, tz, 1.5 * u, 1.5 * u, 3 * u, 3.3 * u, hex("#e8e0cf"), { sides: 14 });
    for (const dx of [-2.5, 2.5]) K.box("lm.Wood049", tx + dx * u - 0.18, 0, tz - 0.18, tx + dx * u + 0.18, 2 * u, tz + 0.18, timber);
  }
  // the newsstand's racks of magazines in the left wing
  for (let x = x0v + 4; x < a0v - 6; x += 3) K.box("lm.paint", X(x), 0, zf, X(x + 2), 5 * u, zf + u, hex(["#e8e4dc", "#c03a3a", "#3a6ea5", "#f4b728"][(x >> 1) % 4]));
  K.box("lm.dark", X(x0v + 3), 8 * u, zf, X(x0v + 5), 26 * u, zf + 5 * u, hex("#1a1820"));
  for (const x of [midv - 9, midv + 6]) K.sphere("lm.glow.night", X(x + 1.5), 10.5 * u, Z(D + 2.5), 1.4 * u, hex("#ffd28a"), { segs: 6, sy: 1.3 });
});

def("h:pavilion", (c) => {
  const { K, X, Z, u } = c;
  const W = c.b.model.w - 14,
    D = 24,
    H = 20;
  const x0v = 7,
    x1v = 7 + W;
  const x0 = X(x0v),
    x1 = X(x1v),
    zb = Z(0),
    zf = Z(D);
  const cream = hex("#ece4d4"),
    timber = hex("#c8a070");
  K.box("lm.Plaster001", x0, 0, zb, x1, (H - 4) * u, Z(D - 9), cream, { skip: "-y" });
  for (const [a, b2] of [
    [x0, X(x0v + 2)],
    [X(x1v - 2), x1],
  ])
    K.box("lm.Plaster001", a, 0, Z(D - 9), b2, (H - 4) * u, zf, cream, { skip: "-y" });
  // the open front: glass between timber posts, the room lit behind, coloured goods along its back wall
  glazedFront(c, X(x0v + 2), X(x1v - 2), zf - 0.04, (H - 4) * u, "cafe", timber, { bay: 5 * u, door: [X(x0v + W / 2 - 3), X(x0v + W / 2 + 3)], depth: 8 * u });
  for (let x = x0v + 2; x < x1v - 1; x += 5) K.box("lm.Wood049", X(x), 0, zf - 0.1, X(x + 1), (H - 4) * u, zf + 0.05, timber);
  // the deep timber roof slab out over the front, its lit edge, the slats under it
  K.box("lm.Wood049", x0 - 2 * u, (H - 4) * u, zb, x1 + 2 * u, (H - 2) * u, zf + 4 * u, timber);
  K.box("lm.glow", x0 - 2 * u, (H - 5) * u, zf + 3.7 * u, x1 + 2 * u, (H - 4) * u, zf + 4 * u, hex("#ffd28a"));
  if (!c.far) for (let x = x0v - 1; x < x1v + 1; x += 1.5) K.box("lm.Wood049", X(x), (H - 4) * u - 0.08, zf - 0.2, X(x + 0.5), (H - 4) * u, zf + 4 * u, hex("#a87a50"));
  K.box("lm.Concrete031", x0, (H - 2) * u, zb, x1, (H - 1.6) * u, zf, hex("#3b3745"));
  for (const x of [x0v + 2, x1v - 3]) K.cyl("lm.Wood049", X(x + 0.5), zf + 3 * u, 0.12, 0.12, 0, (H - 4) * u, timber, { sides: 10 });
});
