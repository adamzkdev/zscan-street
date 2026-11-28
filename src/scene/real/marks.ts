import * as THREE from "three";
import type { BuildingJob } from "../city/plan";
import type { Built } from "../voxel/buildings";
import type { RGeo } from "./buildings";
import { arcadeShape, ellipseShape, hex, Kit, rectShape, rng, shadeC, WHITE, windowsShape, type V3 } from "./markkit";
import { ANGEL, CHAPEL, COLUMBARIUM, CRYPT, FX0, FX1, FZ0, FZ1, GATE, GRAVE_LEN, GRAVES, groundV, groundY, LANES, LANTERNS, OBELISK, pitOf, STONE_T, TOMBS, TREES, type Grave } from "../cemetery/layout";

/**
 * The landmarks of the north and the centre, realistic (branch gta-real): no voxels. Each is built
 * on its voxel builder's layout (src/scene/voxel/landmarks: its lot, its door, its named points, its
 * walls for the walker all stay where they were) as real geometry — lattices, arcades, columns,
 * domes, curtain walls — over photographed CC0 materials (markkit.ts / marksmat.ts). Pure: the city's
 * workers build them (src/scene/city/worker.ts).
 *
 * The frame: metres, the lot centred on x and z, its front at z = +d/2 facing +z, the ground at y = 0
 * (the street's kerb). A voxel point of the layout: `F.p(v)`.
 */

export const REAL_MARKS = new Set(["eiffel", "colosseum", "pyramid", "museum", "parliament", "stadium", "needle", "shibuya", "cemetery"]);

/** Where a tree of the lot stands (metres in the lot's frame): planted by the city with its own trees (src/scene/real/trees.ts). */
export type MarkTree = [number, number, number, string, number];

/** A street prop of the lot (src/scene/real/props.ts kinds: bench, trashBin, bollard…): [type, x, y, z, rot, arg]. */
export type MarkProp = [string, number, number, number, number, string?];

export interface MarkOut {
  geos: Record<string, RGeo>;
  trees: MarkTree[];
  props: MarkProp[];
}

/** The lot's frame from its voxel layout. */
export class Frame {
  readonly W: number;
  readonly D: number;
  readonly k: number;
  /** The lot in metres. */
  readonly w: number;
  readonly d: number;
  constructor(readonly b: Built) {
    this.W = b.model.w;
    this.D = b.model.d;
    this.k = b.scale ?? 1;
    this.w = (this.W * this.k) / 6;
    this.d = (this.D * this.k) / 6;
  }
  /** A length in the layout's voxels, in metres. */
  m(v: number) {
    return (v * this.k) / 6;
  }
  /** A layout point (model voxels) in the lot's frame (metres). */
  p(v: number[] | undefined, fallback: V3 = [0, 0, 0]): V3 {
    if (!v) return fallback;
    return [((v[0] - this.W / 2) * this.k) / 6, (v[1] * this.k) / 6, ((v[2] - this.D / 2) * this.k) / 6];
  }
  /** A layout rectangle [x0, z0, x1, z1] (model voxels) in metres. */
  rect(r: number[]): [number, number, number, number] {
    const a = this.p([r[0], 0, r[1]]),
      b = this.p([r[2], 0, r[3]]);
    return [Math.min(a[0], b[0]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[2], b[2])];
  }
}

export function realMark(kind: string, b: Built, j: BuildingJob, lod: number): MarkOut {
  const K = new Kit(lod);
  const F = new Frame(b);
  const trees: MarkTree[] = [];
  const props: MarkProp[] = [];
  const ctx: Ctx = { K, F, b, j, trees, props, r: rng(j.seed * 13 + 7), lod };
  switch (kind) {
    case "eiffel":
      eiffel(ctx);
      break;
    case "colosseum":
      colosseum(ctx);
      break;
    case "pyramid":
      pyramid(ctx);
      break;
    case "parliament":
      parliament(ctx);
      break;
    case "museum":
      museum(ctx);
      break;
    case "stadium":
      stadium(ctx);
      break;
    case "needle":
      needle(ctx);
      break;
    case "shibuya":
      shibuya(ctx);
      break;
    case "cemetery":
      cemetery(ctx);
      break;
  }
  return { geos: K.out(), trees: lod ? [] : trees, props: lod ? [] : props };
}

interface Ctx {
  K: Kit;
  F: Frame;
  b: Built;
  j: BuildingJob;
  trees: MarkTree[];
  props: MarkProp[];
  r: () => number;
  lod: number;
}

// ---- shared pieces -------------------------------------------------------------------------------

const C = {
  gravel: hex("#d9ccb0"),
  lawn: hex("#9cc070"),
  hedge: hex("#3f6a34"),
  paving: hex("#e6e0d4"),
  stone: hex("#e8e0d0"),
  iron: hex("#8a6448"),
  ironDark: hex("#5e4432"),
  gold: hex("#ffc060"),
  white: [1, 1, 1] as V3,
};

/** The lot's ground: a base over all of it, the pavement strip along the street in front. */
function groundBase(c: Ctx, base: string, col: V3, front = 2.4) {
  const { K, F } = c;
  K.box(base, 0, -0.06, -front / 2, F.w, 0.08, F.d - front, col);
  K.box("lm.PavingStones130", 0, -0.06, F.d / 2 - front / 2, F.w, 0.08, front, C.paving);
}

/** A bed of lawn with a low clipped hedge round it. */
function parterre(c: Ctx, x0: number, z0: number, x1: number, z1: number, hedge = true) {
  const { K } = c;
  K.span("lm.Grass004", x0, 0, z0, x1, 0.06, z1, C.lawn);
  if (!hedge || c.lod) return;
  const t = 0.35,
    h = 0.45;
  K.span("lm.Grass004", x0, 0, z0, x1, h, z0 + t, C.hedge);
  K.span("lm.Grass004", x0, 0, z1 - t, x1, h, z1, C.hedge);
  K.span("lm.Grass004", x0, 0, z0 + t, x0 + t, h, z1 - t, C.hedge);
  K.span("lm.Grass004", x1 - t, 0, z0 + t, x1, h, z1 - t, C.hedge);
}

/** A garden lamp post with its lantern (lit at night). */
function lampPost(c: Ctx, x: number, z: number, h = 3.6) {
  if (c.lod) return;
  const { K } = c;
  K.cyl("lm.dark", x, 0, z, 0.09, 0.06, h, 8, "#1e2024");
  K.cyl("lm.dark", x, 0, z, 0.16, 0.16, 0.35, 8, "#1e2024");
  K.box("lm.glow.night", x, h, z, 0.26, 0.34, 0.26, hex("#ffcf8a"));
  K.lathe("lm.dark", [[0.2, 0], [0.05, 0.16]], x, h + 0.34, z, 8, "#1e2024");
}

/** A Parisian kiosk: green iron drum, a little dome, the lettering band. */
function kiosk(c: Ctx, x: number, z: number, r = 1.1) {
  const { K } = c;
  const green = hex("#2f4a34");
  K.cyl("lm.paint", x, 0, z, r, r, 2.4, 10, green);
  K.cyl("lm.glow.night", x, 1.6, z, r + 0.02, r + 0.02, 0.35, 10, hex("#ffe2a8"));
  K.lathe("lm.paint", [[r + 0.25, 0], [r + 0.2, 0.12], [r * 0.8, 0.5], [r * 0.35, 0.95], [0.08, 1.25], [0.02, 1.5]], x, 2.4, z, 12, green);
}

// ---- TOUR EIFFEL ----------------------------------------------------------------------------------

/**
 * Gustave Eiffel's tower in puddled iron, on its voxel layout's scale (324 real metres squeezed to
 * the lot: 0.24 m a real metre up, 0.18 across): four lattice legs on stone piers curving up to the
 * first floor and its frieze, the great arches between them, the second floor, one shaft to the
 * campanile and the antenna. The Champ de Mars round it: gravel, parterres, the alleys of trees,
 * the kiosks and the carousel where the layout has them.
 */
function eiffel(c: Ctx) {
  const { K, F, b, lod } = c;
  const sv = (0.72 * F.k) / 6,
    sh = (0.53 * F.k) / 6;
  const cx = 0,
    cz = F.m(-0.5);
  const hw = (h: number) => (4.2 + 58.3 * Math.exp(-h / 82)) * sh;
  const leg = (h: number) => Math.max(9, 26 - h * 0.13) * sh;
  const Y = (h: number) => h * sv;
  const iron = C.iron,
    ironD = C.ironDark;
  const IRON = "lm.Metal024.metal";

  // ---- the Champ de Mars
  groundBase(c, "lm.Gravel022", C.gravel);
  const base = hw(0) + 3;
  // the esplanade under the tower: stone, a compass of darker setts
  K.slab("lm.PavingStones128", ellipseShape(cx, cz, base, Math.min(base, F.d / 2 - 3)), -0.04, 0.06, C.paving);
  // parterres either side, cut by alleys
  const sideW = (F.w / 2 - base - 4) / 2;
  if (sideW > 2)
    for (const s of [-1, 1]) {
      const xa = s * (base + 2),
        xb = s * (F.w / 2 - 2.5);
      const [x0, x1] = [Math.min(xa, xb), Math.max(xa, xb)];
      const mid = (x0 + x1) / 2;
      const z0 = -F.d / 2 + 2.5,
        z1 = F.d / 2 - 4;
      parterre(c, x0, z0, mid - 1, cz - 1);
      parterre(c, mid + 1, z0, x1, cz - 1);
      parterre(c, x0, cz + 1, mid - 1, z1);
      parterre(c, mid + 1, cz + 1, x1, z1);
      // alleys of trees along the outer edges
      for (let x = x0 + 1.5; x <= x1 - 1; x += 5.5) {
        c.trees.push([x, 0, -F.d / 2 + 1.2, "plane", Math.round(x * 7)]);
      }
      lampPost(c, mid, cz + 0.2);
      lampPost(c, mid, z1 + 1.4);
    }

  // ---- the four stone piers and the legs
  const LEGS: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const stone = C.stone;
  for (const [sx, sz] of LEGS) {
    const a = hw(0) - leg(0) / 2;
    K.box("lm.Bricks008", cx + sx * a, 0, cz + sz * a, leg(0) + 0.8, 1.2, leg(0) + 0.8, stone);
    K.box("lm.Bricks008", cx + sx * a, 1.2, cz + sz * a, leg(0) + 0.3, 0.35, leg(0) + 0.3, shadeC(stone, 0.9));
  }
  // a leg's four corner posts from the pier (real h 0) to the second floor (115), in steps
  const H2 = 115;
  const steps = lod ? 6 : 14;
  const corner = (sx: number, sz: number, u: number, v: number, h: number): V3 => {
    // u, v: 0 the outer corner, 1 the inner corner of the leg's section
    const o = hw(h),
      L = leg(h);
    return [cx + sx * (o - u * L), Y(h), cz + sz * (o - v * L)];
  };
  const post = lod ? 0.34 : 0.26,
    brace = 0.1;
  for (const [sx, sz] of LEGS) {
    for (let i = 0; i < steps; i++) {
      const h0 = 1.6 / sv + ((H2 - 1.6 / sv) * i) / steps,
        h1 = 1.6 / sv + ((H2 - 1.6 / sv) * (i + 1)) / steps;
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ])
        K.beam(IRON, corner(sx, sz, u, v, h0), corner(sx, sz, u, v, h1), post, iron);
      if (lod) continue;
      // the lattice: a cross on each face of the leg, a ring at each step
      for (const [ua, va, ub, vb] of [
        [0, 0, 1, 0],
        [0, 0, 0, 1],
        [1, 0, 1, 1],
        [0, 1, 1, 1],
      ]) {
        K.beam(IRON, corner(sx, sz, ua, va, h0), corner(sx, sz, ub, vb, h1), brace, ironD);
        K.beam(IRON, corner(sx, sz, ub, vb, h0), corner(sx, sz, ua, va, h1), brace, ironD);
        K.beam(IRON, corner(sx, sz, ua, va, h1), corner(sx, sz, ub, vb, h1), brace * 1.4, iron);
      }
    }
  }
  // ---- the great arches between the legs, under the first floor (decorative, on each face)
  const H1 = 57;
  const archSeg = lod ? 8 : 20;
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2;
    const pt = (t: number, lift: number): V3 => {
      // across the face from one leg's inner edge to the other's at the arch's springing
      const hs = 20; // springing height (real m)
      const spanH = hw(hs) - leg(hs) * 0.95;
      const x = -spanH + 2 * spanH * t;
      const h = hs + (H1 - 4 - hs) * Math.sin(Math.PI * t) + lift;
      const z = hw(h) - leg(h) * 0.15;
      const cs = Math.cos(ry),
        sn = Math.sin(ry);
      return [cx + x * cs + z * sn, Y(h), cz - x * sn + z * cs];
    };
    for (let i = 0; i < archSeg; i++) {
      const t0 = i / archSeg,
        t1 = (i + 1) / archSeg;
      K.beam(IRON, pt(t0, 0), pt(t1, 0), 0.24, iron);
      if (!lod) {
        K.beam(IRON, pt(t0, 2.5), pt(t1, 2.5), 0.12, ironD);
        K.beam(IRON, pt(t0, 0), pt(t1, 2.5), 0.07, ironD);
      }
    }
  }
  // ---- the first floor: the deck, the frieze of arches round it, the pavilions on it
  const y1 = Y(H1);
  const o1 = hw(H1) + 0.7;
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2;
    const frieze = arcadeShape(o1 * 2, 2.4, lod ? [] : Array.from({ length: 9 }, (_, i) => ({ x: -o1 + (o1 * 2 * (i + 0.5)) / 9, w: (o1 * 2) / 9 - 0.35, h: 1.8 })));
    K.extrude(IRON, frieze, o1 - 0.18, 0.18, iron, { ry, ox: cx, oz: cz });
  }
  // the deck: a square ring (the hollow centre over the esplanade)
  {
    const s = new THREE.Shape();
    s.moveTo(-o1, o1);
    s.lineTo(o1, o1);
    s.lineTo(o1, -o1);
    s.lineTo(-o1, -o1);
    s.lineTo(-o1, o1);
    const inner = o1 * 0.55;
    const hole = new THREE.Path();
    hole.moveTo(-inner, inner);
    hole.lineTo(-inner, -inner);
    hole.lineTo(inner, -inner);
    hole.lineTo(inner, inner);
    hole.lineTo(-inner, inner);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    g.translate(cx, y1 + 0.45, cz);
    K.add(IRON, g, ironD);
    // glass pavilions on two sides of it
    if (!lod)
      for (const sz of [-1, 1]) {
        K.box("lm.glass", cx, y1 + 0.45, cz + sz * (o1 * 0.78), o1 * 1.1, 2.2, o1 * 0.26, hex("#c8d8e8"));
        K.box(IRON, cx, y1 + 2.65, cz + sz * (o1 * 0.78), o1 * 1.14, 0.12, o1 * 0.3, iron);
      }
  }
  // ---- the second floor and the shaft
  const y2 = Y(H2);
  const o2 = hw(H2) + 0.4;
  K.box(IRON, cx, y2, cz, o2 * 2, 0.4, o2 * 2, ironD);
  K.box("lm.glass", cx, y2 + 0.4, cz, o2 * 1.5, 1.8, o2 * 1.5, hex("#c8d8e8"));
  K.box(IRON, cx, y2 + 2.2, cz, o2 * 1.6, 0.14, o2 * 1.6, iron);
  const HT = 276,
    HI = 196;
  const shaftSteps = lod ? 6 : 16;
  const sc = (u: number, v: number, h: number): V3 => {
    const o = hw(h);
    return [cx + u * o, Y(h), cz + v * o];
  };
  for (let i = 0; i < shaftSteps; i++) {
    const h0 = H2 + ((HT - H2) * i) / shaftSteps,
      h1 = H2 + ((HT - H2) * (i + 1)) / shaftSteps;
    for (const [u, v] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      K.beam(IRON, sc(u, v, h0), sc(u, v, h1), lod ? 0.3 : 0.24, iron);
      if (lod) continue;
      // each face: a cross and a ring
      const [nu, nv] = u === v ? [u, -v] : [-u, v];
      K.beam(IRON, sc(u, v, h0), sc(nu, nv, h1), 0.08, ironD);
      K.beam(IRON, sc(nu, nv, h0), sc(u, v, h1), 0.08, ironD);
      K.beam(IRON, sc(u, v, h1), sc(nu, nv, h1), 0.1, iron);
    }
  }
  // the intermediate gallery
  const oi = hw(HI) + 0.35;
  K.box(IRON, cx, Y(HI), cz, oi * 2, 0.22, oi * 2, ironD);
  // ---- the campanile: the summit's enclosed cabin, its terrace, the lantern and the antenna
  const yt = Y(HT);
  const ot = hw(HT) + 0.5;
  K.box(IRON, cx, yt, cz, ot * 2.2, 0.3, ot * 2.2, ironD);
  K.box("lm.glass", cx, yt + 0.3, cz, ot * 1.7, 1.6, ot * 1.7, hex("#e0e8f0"));
  K.box(IRON, cx, yt + 1.9, cz, ot * 1.9, 0.18, ot * 1.9, iron);
  K.lathe(IRON, [[ot * 0.75, 0], [ot * 0.6, 0.5], [0.35, 1.4], [0.22, 1.6]], cx, yt + 2.08, cz, 12, iron);
  K.cyl("lm.glow", cx, yt + 3.6, cz, 0.28, 0.28, 0.7, 10, hex("#ffd890"));
  K.cyl(IRON, cx, yt + 4.3, cz, 0.16, 0.05, Y(324) - (yt + 4.3), 6, ironD);
  // ---- the golden lamps along the edges (the tower's night look): the corner posts and the decks' rims
  if (!lod) {
    const lamp = hex("#ffb84a");
    for (const [sx, sz] of LEGS)
      for (let h = 8; h < H2; h += 7) {
        const p = corner(sx, sz, 0, 0, h);
        K.box("lm.glow.night", p[0], p[1], p[2], 0.16, 0.16, 0.16, lamp);
      }
    for (let h = H2 + 8; h < HT; h += 9)
      for (const [u, v] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const p = sc(u, v, h);
        K.box("lm.glow.night", p[0], p[1], p[2], 0.14, 0.14, 0.14, lamp);
      }
    for (let f = 0; f < 4; f++) {
      const ry = (f * Math.PI) / 2;
      const g = new THREE.BoxGeometry(o1 * 2, 0.08, 0.08);
      g.translate(0, y1 + 2.4, o1);
      g.rotateY(ry);
      g.translate(cx, 0, cz);
      K.add("lm.glow.night", g, lamp);
    }
  }
  // ---- the ticket booths and the carousel where the layout has them
  const walls = b.walls ?? [];
  for (const w of walls.slice(4, 6)) {
    const [x0, z0, x1, z1] = F.rect(w);
    const bx = (x0 + x1) / 2,
      bz = (z0 + z1) / 2;
    K.box("lm.Bricks008", bx, 0, bz, x1 - x0 - 0.4, 2.6, z1 - z0 - 0.4, C.stone);
    K.box("lm.glass", bx, 0.9, bz + (z1 - z0) / 2 - 0.15, x1 - x0 - 1, 1.3, 0.12, hex("#d8e4ee"));
    K.box("lm.paint", bx, 2.6, bz, x1 - x0, 0.25, z1 - z0, hex("#2f4a34"));
  }
  const car = b.points?.carousel;
  if (car) {
    const p = F.p(car);
    const R = 2.4;
    K.cyl("lm.Wood049", p[0], 0, p[2], R, R, 0.4, 24, hex("#c8a070"));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      K.cyl("lm.chrome", p[0] + Math.cos(a) * (R - 0.4), 0.4, p[2] + Math.sin(a) * (R - 0.4), 0.04, 0.04, 2.2, 6, hex("#f0d080"));
    }
    K.cyl("lm.paint", p[0], 0.4, p[2], 0.35, 0.35, 2.4, 10, hex("#e8d8c0"));
    // the striped canopy: twelve wedges, red and cream
    for (let i = 0; i < 12; i++)
      K.lathe("lm.paint", [[R + 0.3, 0], [R + 0.25, 0.2], [0.2, 1.3], [0.01, 1.4]], p[0], 2.8, p[2], 3, i % 2 ? hex("#e8dcc0") : hex("#b83a3a"), (i / 12) * Math.PI * 2, (Math.PI * 2) / 12);
    K.cyl("lm.glow.night", p[0], 2.75, p[2], R + 0.31, R + 0.31, 0.12, 24, hex("#ffd890"));
  }
  // kiosks and lamps along the front
  if (!lod) {
    kiosk(c, -F.w / 2 + 4.5, F.d / 2 - 4.2);
    kiosk(c, F.w / 2 - 4.5, F.d / 2 - 4.2);
    for (let x = -F.w / 2 + 9; x < F.w / 2 - 6; x += 9) if (Math.abs(x) > base) lampPost(c, x, F.d / 2 - 3.2);
  }
  // (the people walk under it: only the piers stand in the way, as the layout's walls say)
  void windowsShape;
  void rectShape;
}

// ---- THE COLOSSEUM --------------------------------------------------------------------------------

/**
 * The Flavian amphitheatre in weathered travertine: the elliptical outer wall of three arcaded
 * storeys framed by half-columns and cornices and the attic above, the outer ring fallen on the
 * right (its second ring, the radial walls and the brick wedges showing), the cavea stepping down to
 * the podium, the arena half floored in wood and half open onto the hypogeum. In front: the
 * sampietrini plaza, the queue's ropes, the Arch of Constantine, umbrella pines and cypresses.
 * The layout's numbers (voxels of a third of a metre): semi-axes 75 × 61, 44 bays, bay 0 the gate.
 */
function colosseum(c: Ctx) {
  const { K, F, b, lod } = c;
  const v = (n: number) => F.m(n);
  const A = v(75),
    B = v(61);
  const ox = 0,
    oz = F.p([0, 0, 61 + 8])[2];
  const G0 = v(6),
    LV = v(20),
    ATT = G0 + 3 * LV,
    TOP = v(90);
  const NB = 44;
  const trav = hex("#e2d2b4"),
    travD = hex("#c8b494"),
    brick = hex("#b0705a");
  const T = "lm.Bricks083";
  // the plaza of sampietrini, the pavement along the street
  groundBase(c, "lm.PavingStones070", hex("#b8b0a4"));
  // the stylobate: a low elliptic platform with a step
  K.slab(T, ellipseShape(ox, oz, A + 1.6, B + 1.6), 0, G0 * 0.45, travD);
  K.slab(T, ellipseShape(ox, oz, A + 0.8, B + 0.8), 0, G0, trav);
  const pt = (t: number, inset = 0): [number, number] => [ox + (A - inset) * Math.cos(t), oz + (B - inset) * Math.sin(t)];
  const tOf = (i: number) => Math.PI / 2 + (2 * Math.PI * i) / NB;
  const GATES = new Set([0, 11, 22, 33]);
  /** The outer ring is broken from bay 24 to 40 (the right): how many storeys stand there. */
  const standing = (i: number) => {
    if (i < 24 || i > 40) return 4;
    const e = Math.min(i - 24, 40 - i);
    return e < 1 ? 3 : e < 2 ? 2 : 1;
  };
  /** One ring of arcades from bays a to b (inset from the outer ellipse), `storeys` per bay. */
  const ring = (inset: number, thick: number, storeys: (i: number) => number, attic: boolean, colour: V3, bays: number[]) => {
    for (const i of bays) {
      const t0 = tOf(i - 0.5),
        t1 = tOf(i + 0.5);
      const p0 = pt(t0, inset),
        p1 = pt(t1, inset);
      const mx = (p0[0] + p1[0]) / 2,
        mz = (p0[1] + p1[1]) / 2;
      const dx = p1[0] - p0[0],
        dz = p1[1] - p0[1];
      const w = Math.hypot(dx, dz);
      // outward: perpendicular to the chord, away from the centre
      let nx = dz / w,
        nz = -dx / w;
      if (nx * (mx - ox) + nz * (mz - oz) < 0) ((nx = -nx), (nz = -nz));
      const ry = Math.atan2(nx, nz);
      const n = storeys(i);
      for (let s = 0; s < Math.min(3, n); s++) {
        const gate = s === 0 && GATES.has(i);
        const arch = arcadeShape(w + 0.06, LV, [{ x: 0, w: w * (gate ? 0.7 : 0.6), h: LV * (gate ? 0.86 : 0.78) }]);
        K.extrude(T, arch, -thick, thick, s % 2 ? colour : shadeC(colour, 0.96), { ry, ox: mx, oy: G0 + s * LV, oz: mz });
        if (lod) continue;
        // the half-column at the bay's joint, its capital; the cornice over the storey
        const [jx, jz] = p0;
        K.cyl(T, jx + nx * 0.15, G0 + s * LV, jz + nz * 0.15, 0.42, 0.38, LV - 0.6, 10, colour);
        K.box(T, jx + nx * 0.18, G0 + s * LV + LV - 0.6, jz + nz * 0.18, 1.1, 0.35, 0.9, travD, ry);
        K.box(T, mx + nx * 0.25, G0 + (s + 1) * LV - 0.3, mz + nz * 0.25, w + 0.1, 0.5, 0.75, travD, ry);
      }
      // the attic: a plain wall with a small window every other bay, the corbels of its masts
      if (attic && n >= 4) {
        const win = !lod && i % 2 === 0 ? [{ x: 0, y: (TOP - ATT) * 0.35, w: w * 0.32, h: (TOP - ATT) * 0.3 }] : [];
        K.extrude(T, windowsShape(w + 0.06, TOP - ATT, win), -thick, thick, shadeC(colour, 0.94), { ry, ox: mx, oy: ATT, oz: mz });
        if (!lod) K.box(T, mx + nx * 0.25, TOP - 0.35, mz + nz * 0.25, w + 0.12, 0.45, 0.8, travD, ry);
      }
      // the fallen ring's broken top: a rough edge of blocks
      if (attic && n < 4 && !lod) {
        const y = G0 + n * LV;
        for (let k = 0; k < 3; k++) K.box(T, mx + (dx / w) * (k - 1) * w * 0.3, y, mz + (dz / w) * (k - 1) * w * 0.3, w * 0.32, 0.4 + ((i * 7 + k * 3) % 5) * 0.35, thick * 0.9, travD, ry);
      }
    }
  };
  const all = Array.from({ length: NB }, (_, i) => i);
  ring(0, 1.7, standing, true, trav, all);
  // the second ring all round (behind the outer one; open to the sky where the outer fell), the
  // ambulatories' vaults between them at each storey, the radial walls where the outer ring fell
  const IN = v(13);
  ring(IN, 1.3, () => 3, false, travD, all);
  for (let s = 1; s <= 3; s++) K.slab(T, ellipseShape(ox, oz, A - 1.6, B - 1.6, [A - IN, B - IN]), G0 + s * LV - 0.9, 0.55, shadeC(travD, 0.85));
  if (!lod)
    for (const i of all.filter((i) => i >= 23 && i <= 41)) {
      const t = tOf(i - 0.5);
      const a = pt(t, 0.3),
        bb = pt(t, IN - 0.2);
      const h = Math.min(standing(i), 3) * LV - 1.5;
      K.beam("lm.Bricks060", [a[0], G0, a[1]], [bb[0], G0, bb[1]], 1.0, brick, 1);
      K.box("lm.Bricks060", (a[0] + bb[0]) / 2, G0, (a[1] + bb[1]) / 2, 0.9, h, Math.hypot(bb[0] - a[0], bb[1] - a[1]), brick, Math.atan2(bb[0] - a[0], bb[1] - a[1]));
    }
  // ---- the cavea: tiers stepping down from the attic's inner edge to the podium, ribbed in brick
  const Aa = v(39),
    Ba = v(23),
    POD = v(19),
    AF = v(9);
  const tiers = lod ? 4 : 9;
  // (the cavea's outer wall behind the second ring, past its ambulatory)
  const r0 = v(19);
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers,
      t1 = (k + 1) / tiers;
    const a0 = A - r0 + (Aa + 2 - (A - r0)) * t,
      b0 = B - r0 + (Ba + 2 - (B - r0)) * t;
    const a1 = A - r0 + (Aa + 2 - (A - r0)) * t1,
      b1 = B - r0 + (Ba + 2 - (B - r0)) * t1;
    const y = G0 + 3 * LV - 1.5 - (G0 + 3 * LV - 1.5 - POD) * t;
    K.slab(T, ellipseShape(ox, oz, a0, b0, [a1, b1]), 0, y, k % 2 ? travD : shadeC(trav, 0.9));
  }
  // the walk at the top, from the second ring to the cavea
  K.slab(T, ellipseShape(ox, oz, A - IN - 1.2, B - IN - 1.2, [A - r0, B - r0]), G0 + 3 * LV - 2.4, 0.6, travD);
  // the podium wall round the arena
  K.slab(T, ellipseShape(ox, oz, Aa + 2, Ba + 2, [Aa, Ba]), 0, POD, shadeC(travD, 0.92));
  // the arena: the wooden floor over its front half, the hypogeum's walls open behind
  {
    const s = new THREE.Shape();
    s.absellipse(ox, -oz, Aa, Ba, Math.PI, Math.PI * 2, false, 0);
    s.lineTo(ox - Aa, -oz);
    K.slab("lm.Wood049", s, AF - 0.25, 0.25, hex("#a8865a"));
    K.slab("lm.Gravel022", ellipseShape(ox, oz, Aa, Ba), 0, 0.3, hex("#b8a888"));
    if (!lod)
      for (let k = -4; k <= 4; k++) {
        const z = oz - (k + 4.5) * (Ba / 9) * 0.98;
        if (z > oz) continue;
        const half = Aa * Math.sqrt(Math.max(0, 1 - ((z - oz) / Ba) ** 2)) - 0.5;
        if (half > 1) K.box(T, ox, 0.3, z, half * 2, AF - 0.6, 0.5, brick);
      }
  }
  // ---- the queue at the gate: brass posts and red ropes
  const gate = F.p(b.points?.gate);
  if (!lod)
    for (const bx of [-2, 1.4]) {
      let last: V3 | null = null;
      for (let z = gate[2] + 0.8; z < gate[2] + 7.5; z += 1.3) {
        K.cyl("lm.chrome", gate[0] + bx, 0, z, 0.05, 0.05, 0.95, 8, hex("#d8b060"));
        K.cyl("lm.chrome", gate[0] + bx, 0, z, 0.16, 0.16, 0.04, 10, hex("#d8b060"));
        const p: V3 = [gate[0] + bx, 0.86, z];
        if (last) K.rod("lm.paint", last, p, 0.03, hex("#a3142a"));
        last = p;
      }
    }
  // ---- the Arch of Constantine where the layout puts it
  {
    const [x0, z0, x1, z1] = F.rect([14, 150, 56, 163]);
    const w = x1 - x0,
      dd = z1 - z0,
      h = 8.4,
      mx = (x0 + x1) / 2;
    const arch = arcadeShape(w, h, [
      { x: 0, w: w * 0.3, h: h * 0.72 },
      { x: -w * 0.33, w: w * 0.14, h: h * 0.42 },
      { x: w * 0.33, w: w * 0.14, h: h * 0.42 },
    ]);
    K.extrude("lm.Marble021", arch, z0 - (z0 + z1) / 2, dd, hex("#d8ccb4"), { ox: mx, oz: (z0 + z1) / 2 });
    K.box("lm.Marble021", mx, h, (z0 + z1) / 2, w + 0.3, 2.4, dd + 0.3, hex("#d2c6ae"));
    K.box("lm.Marble021", mx, h + 2.4, (z0 + z1) / 2, w + 0.5, 0.35, dd + 0.5, hex("#c8bca4"));
    if (!lod)
      for (const fx of [-0.47, -0.2, 0.2, 0.47])
        for (const sz of [-1, 1]) K.cyl("lm.Marble021", mx + fx * w, 0.9, (z0 + z1) / 2 + sz * (dd / 2 + 0.3), 0.28, 0.25, h - 1.2, 12, hex("#f0ebe2"));
  }
  // ---- umbrella pines, cypresses, lamps
  for (const [x, z] of [
    [4, 6],
    [F.W - 12, 4],
    [F.W - 22, F.D - 26],
    [4, 108],
    [F.W - 8, 120],
  ]) {
    const p = F.p([x, 0, z]);
    c.trees.push([p[0], 0, p[2], "pine", Math.round(x * 3 + z)]);
  }
  for (let i = 0; i < 6; i++) {
    const p = F.p([8 + i * 6, 0, 24]);
    c.trees.push([p[0], 0, p[2], "pine", 40 + i]);
  }
  for (const s of [-1, 1]) for (const dz of [3, 8]) lampPost(c, gate[0] + s * 9, gate[2] + dz, 4);
}

// ---- THE GREAT PYRAMID -----------------------------------------------------------------------------

/**
 * Khufu's pyramid on its sand: the core's stepped courses of weathered limestone blocks up to where
 * the smooth white casing still clads the top (as on Khafre's), the gilded pyramidion; the tourist
 * entrance cut into the front under its chevron of granite beams; the Sphinx on its rock bed facing
 * the street; the processional way between rope barriers to a pylon gate; the ticket booth; a
 * Bedouin tent and water troughs where the camels rested; palms. Layout: 1 voxel = 1/3 m.
 */
function pyramid(c: Ctx) {
  const { K, F, b, lod } = c;
  const m = (n: number) => F.m(n);
  const W = F.W,
    D = F.D;
  const B = Math.min(W - 62, D - 56, 122);
  const half0 = Math.floor(B / 2);
  const CX = Math.floor(W / 2) + 4,
    PZ0 = 8,
    CZ = PZ0 + half0,
    PZ1 = CZ + half0;
  const NC = 34,
    CH = 3,
    CASE = 26;
  const halfAt = (i: number) => half0 - i * ((half0 - 3) / NC);
  const X = (v: number) => F.p([v, 0, 0])[0],
    Z = (v: number) => F.p([0, 0, v])[2];
  const sand = hex("#dcc394"),
    lime = hex("#cdb689"),
    limeL = hex("#e2d2ae"),
    gold = hex("#e8b43c");
  const LIME = "lm.Bricks083";
  // ---- the sand (and the paved strip along the street)
  groundBase(c, "lm.Ground054", sand);
  // ---- the core: four smooth weathered faces of limestone (the courses are the stone's own: rows
  // of 0.75 m blocks in its texture and relief, `lm.Bricks084.blocks`), the tunnel's mouth cut into
  // the front low down; over its top the white casing that remains, its lower edge broken
  const tw = 5,
    th = 11,
    tz = PZ1 - 22;
  const cx = X(CX),
    cz = Z(CZ);
  const r = rng(91);
  // (the face through the old courses' outer foot: half0 at y = m(1), narrowing k metres per metre)
  const k = (half0 - 3) / NC / CH;
  const yB = m(1) - 0.3,
    yC = m(1 + CASE * CH),
    yTop = m(1 + NC * CH);
  const half = (y: number) => m(half0) - (y - m(1)) * k;
  const sandy = hex("#c9a874");
  /** The weathering: slow mottling, wind streaks down the faces, sand staining the foot. */
  const tint = (base: V3, a: number, y: number, amp: number): V3 => {
    const n = 0.5 + 0.22 * Math.sin(a * 0.13 + y * 0.09) + 0.16 * Math.sin(a * 0.41 - y * 0.13 + 1.7) + 0.12 * Math.sin(a * 1.3 + 2.3);
    const streak = 1 - 0.05 * Math.max(0, Math.sin(a * 0.7 + 0.4)) * Math.max(0, Math.sin(a * 2.9));
    const foot = Math.max(0, 1 - (y - yB) / 4.5);
    const k2 = (1 - amp / 2 + amp * n) * streak;
    return [
      (base[0] * (1 - foot * 0.45) + sandy[0] * foot * 0.45) * k2,
      (base[1] * (1 - foot * 0.45) + sandy[1] * foot * 0.45) * k2,
      (base[2] * (1 - foot * 0.45) + sandy[2] * foot * 0.45) * k2,
    ];
  };
  /**
   * One face's piece between heights y0 and y1, from x = xa(y) to x = xb(y) across it (the face's
   * own frame: x across, seen from outside), out `off` metres proud of the core's plane; `bot` lifts
   * its lower edge (a broken edge) at t across. Quads in rows and columns, vertex colours per vertex.
   */
  const facePiece = (slot: string, side: number, y0: number, y1: number, xa: (y: number) => number, xb: (y: number) => number, base: V3, o: { off?: number; rows?: number; cols?: number; amp?: number; bot?: (t: number) => number } = {}) => {
    const off = o.off ?? 0,
      rows = o.rows ?? 1,
      cols = o.cols ?? 1;
    // the outward normal of the face's plane (slope k: per metre up, the face comes in k metres)
    const nl = Math.hypot(1, k);
    const nh = 1 / nl,
      nv = k / nl;
    const W3 = (x: number, y: number): V3 => {
      const h = half(y) + off * nh;
      const yy = y + off * nv;
      // front +z, right +x, back −z, left −x (x across as seen from outside)
      return side === 0 ? [cx + x, yy, cz + h] : side === 1 ? [cx + h, yy, cz - x] : side === 2 ? [cx - x, yy, cz - h] : [cx - h, yy, cz + x];
    };
    const out: V3 = side === 0 ? [0, nv, nh] : side === 1 ? [nh, nv, 0] : side === 2 ? [0, nv, -nh] : [-nh, nv, 0];
    const pos: number[] = [],
      col: number[] = [];
    const P = (i: number, j: number) => {
      const t = j / cols;
      const yb = o.bot ? y0 + o.bot(t) : y0;
      const y = yb + ((y1 - yb) * i) / rows;
      const x = xa(y) + (xb(y) - xa(y)) * t;
      return { p: W3(x, y), a: x + side * 97, y };
    };
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const q = [P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j)];
        // (wound to face out)
        const e1 = [q[1].p[0] - q[0].p[0], q[1].p[1] - q[0].p[1], q[1].p[2] - q[0].p[2]],
          e2 = [q[3].p[0] - q[0].p[0], q[3].p[1] - q[0].p[1], q[3].p[2] - q[0].p[2]];
        const nx = e1[1] * e2[2] - e1[2] * e2[1],
          ny = e1[2] * e2[0] - e1[0] * e2[2],
          nz = e1[0] * e2[1] - e1[1] * e2[0];
        const tri = nx * out[0] + ny * out[1] + nz * out[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const v of tri) {
          pos.push(...q[v].p);
          col.push(...tint(base, q[v].a, q[v].y, o.amp ?? 0.14));
        }
      }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    K.add(slot, g, WHITE);
    // (the vertex colours: the weathering, over the kit's flat white)
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  };
  const CORE = "lm.Bricks084.blocks";
  // (the core's limestone paler and greyer than the lot's sandstone details: weathered Tura stone)
  const stone = hex("#c2b293");
  void lime;
  const rowsAt = (h: number) => Math.max(1, Math.round(h / (lod ? 5 : 1.6)));
  const colsAt = (w: number) => Math.max(1, Math.round(w / (lod ? 7 : 2.4)));
  // the tunnel's portal: its outer edges, the top of its lintel
  const hx0 = X(CX - tw - 2) - cx,
    hx1 = X(CX + tw + 2) - cx,
    yL = m(1 + th) + 0.6;
  for (let side = 0; side < 4; side++) {
    if (side === 0) {
      // the front: either side of the portal low down, whole above it
      facePiece(CORE, 0, yB, yL, (y) => -half(y), () => hx0, stone, { rows: rowsAt(yL - yB), cols: colsAt(half(yB) + hx0) });
      facePiece(CORE, 0, yB, yL, () => hx1, (y) => half(y), stone, { rows: rowsAt(yL - yB), cols: colsAt(half(yB) - hx1) });
      facePiece(CORE, 0, yL, yTop, (y) => -half(y), (y) => half(y), stone, { rows: rowsAt(yTop - yL), cols: colsAt(half(yL) * 2) });
    } else facePiece(CORE, side, yB, yTop, (y) => -half(y), (y) => half(y), stone, { rows: rowsAt(yTop - yB), cols: colsAt(half(yB) * 2) });
  }
  // the portal: dressed granite jambs and lintel round the lane, the lane's floor
  {
    const zb = Z(tz),
      zf = Z(PZ1 + 2);
    for (const s2 of [-1, 1]) K.span("lm.Bricks008", X(CX + s2 * tw), yB, zb, X(CX + s2 * (tw + 2)), m(1 + th), zf, hex("#a89888"));
    K.span("lm.Bricks008", X(CX - tw - 2), m(1 + th), zb, X(CX + tw + 2), yL, zf, hex("#a89888"));
  }
  // fallen blocks at the foot, half sunk in the sand (near only)
  if (!lod)
    for (let n = 0; n < 16; n++) {
      const side = n % 4,
        t = (r() - 0.5) * half(0) * 1.7;
      const bs = 0.9 + r() * 0.6;
      const d = half(0) + 0.6 + r() * 2.2;
      const [bx, bz] = side === 0 ? [cx + t, cz + d] : side === 1 ? [cx + d, cz + t] : side === 2 ? [cx + t, cz - d] : [cx - d, cz + t];
      if (side === 0 && Math.abs(bx - cx) < m(tw + 6)) continue;
      K.box(CORE, bx, -0.25, bz, bs * 1.4, bs * (0.55 + r() * 0.3), bs, shadeC(sandy, 0.95 + r() * 0.1), r() * Math.PI);
    }
  // ---- the casing that remains: smooth white limestone to the top (proud of the core, its lower
  // edge broken off unevenly, its thickness showing there), the gilded pyramidion
  {
    const CASING = "lm.Plaster001";
    const off = 0.14;
    for (let side = 0; side < 4; side++) {
      // the broken edge: up to 1.6 m higher here and there, in a few runs
      const seed = side * 13.7;
      const bot = (t: number) => Math.max(0, 0.9 * Math.sin(t * 9.1 + seed) + 0.6 * Math.sin(t * 23.3 + seed * 2.1) + 0.35 * Math.sin(t * 61 + seed));
      const cols = lod ? 10 : 36;
      facePiece(CASING, side, yC, yTop, (y) => -half(y), (y) => half(y), limeL, { off, rows: lod ? 2 : 6, cols, amp: 0.08, bot });
      // its thickness along the broken edge: a band from the casing's face back to the core's
      if (!lod) {
        const nl = Math.hypot(1, k);
        const pos: number[] = [];
        for (let j = 0; j < cols; j++) {
          const pts = [j / cols, (j + 1) / cols].map((t) => {
            const y = yC + bot(t);
            const x = -half(y) + 2 * half(y) * t;
            const at = (o2: number): V3 => {
              const h = half(y) + o2 / nl,
                yy = y + (o2 * k) / nl;
              return side === 0 ? [cx + x, yy, cz + h] : side === 1 ? [cx + h, yy, cz - x] : side === 2 ? [cx - x, yy, cz - h] : [cx - h, yy, cz + x];
            };
            return [at(off), at(0)];
          });
          const [a0, a1] = pts[0],
            [b0, b1] = pts[1];
          pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1, ...a0, ...b1, ...b0, ...a0, ...a1, ...b1);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.computeVertexNormals();
        K.add(CASING, g, shadeC(limeL, 0.82));
      }
    }
    const ph = m(halfAt(NC)) * 2;
    K.frustum("lm.Metal024.metal", cx, yTop, cz, ph + 0.2, ph + 0.2, 0.02, 0.02, m(10), gold);
  }
  // ---- the entrance: the dark tunnel's end, the floor, the chevron of granite beams over it
  {
    const zb = Z(tz),
      zf = Z(PZ1 + 2);
    K.span("lm.dark", X(CX - tw), 0, zb - 0.3, X(CX + tw), m(1 + th), zb, "#0c0907");
    K.span("lm.Bricks008", X(CX - tw), -0.02, zb, X(CX + tw), 0.06, zf, hex("#8a7a62"));
    const yA = yL,
      span = m(tw + 3);
    for (const s of [-1, 1]) for (const dz of [0, 1.4]) K.beam("lm.Bricks008", [cx + s * span, yA, zf - 1 - dz], [cx, yA + span * 0.75, zf - 1 - dz], 0.9, hex("#9a8c7c"), 1.2);
    // a lamp inside
    if (!lod) K.box("lm.glow.night", cx, m(th) - 0.3, zb + 0.4, 0.5, 0.2, 0.2, hex("#ffc070"));
  }
  // ---- the Sphinx on its rock bed, facing the street
  {
    const sx0 = 4,
      sx1 = sx0 + 18,
      sz1 = D - 12,
      sz0 = sz1 - 50;
    const scx = X((sx0 + sx1) / 2);
    const z0 = Z(sz0),
      z1 = Z(sz1);
    const lion = hex("#d2ae78"),
      rock = hex("#bfa070");
    const SK = "lm.Bricks083";
    K.frustum("lm.Ground054", scx, 0, (z0 + z1) / 2, m(sx1 - sx0 + 6), z1 - z0 + 2, m(sx1 - sx0 + 3), z1 - z0, 0.7, rock);
    const bw = m(sx1 - sx0) / 2 - 0.3;
    const y = 0.7;
    // the body: the haunches at the back, the long back, the shoulders and chest
    K.blob(SK, scx, y + 1.4, z0 + 5.4, bw, 2.6, 5.6, lion, 18);
    for (const s of [-1, 1]) K.blob(SK, scx + s * (bw - 0.6), y + 1.2, z0 + 2.6, 1.3, 1.9, 2.6, lion, 14);
    K.blob(SK, scx, y + 1.5, z0 + 10.5, bw * 0.95, 2.5, 3.6, lion, 18);
    // the forelegs and paws stretched out in front
    for (const s of [-1, 1]) {
      const px = scx + s * (bw - 0.9);
      K.blob(SK, px, y + 0.7, (z0 + 10 + z1) / 2, 0.9, 0.8, (z1 - z0 - 10) / 2, lion, 12);
      if (!lod) for (let t = -1; t <= 1; t++) K.blob(SK, px + t * 0.42, y + 0.3, z1 - 0.5, 0.24, 0.3, 0.45, shadeC(lion, 0.92), 8);
    }
    // the tail curled along the right flank
    if (!lod) for (let t = 0; t < 6; t++) K.blob(SK, scx + bw + 0.1, y + 0.4, z0 + 1 + t * 1.2, 0.22, 0.2, 0.7, shadeC(lion, 0.9), 8);
    // the head: the striped nemes falling to the shoulders, the face, the beard
    const hz = Z(sz0 + 31 + 4.5),
      hy = m(23);
    const blue = hex("#2f5f9e"),
      goldS = hex("#d8a62a");
    // the headdress as banded rings (blue and gold) narrowing to the top
    const bands = lod ? 3 : 8;
    for (let i = 0; i < bands; i++) {
      const t0 = i / bands,
        t1 = (i + 1) / bands;
      const w0 = 2.5 - t0 * 0.8,
        w1 = 2.5 - t1 * 0.8;
      K.frustum("lm.paint", scx, hy - 2.6 + t0 * 4.4, hz - 0.5, w0 * 2, 3.2, w1 * 2, 3.0, (4.4 / bands) * 1.001, i % 2 ? blue : goldS);
    }
    // the lappets in front of the shoulders
    for (const s of [-1, 1]) K.frustum("lm.paint", scx + s * 1.75, hy - 4.6, hz + 0.9, 0.9, 0.5, 0.8, 0.45, 2.4, s < 0 ? goldS : blue);
    // the face: a broad stylised face (worn), nose and brow, the uraeus
    K.box(SK, scx, hy - 2.1, hz + 0.95, 2.4, 3.0, 0.7, lion);
    if (!lod) {
      K.box(SK, scx, hy - 1.3, hz + 1.35, 0.42, 1.1, 0.35, shadeC(lion, 0.95));
      K.box(SK, scx, hy - 0.2, hz + 1.3, 1.8, 0.3, 0.3, shadeC(lion, 0.9));
      for (const s of [-1, 1]) K.box("lm.dark", scx + s * 0.55, hy - 0.8, hz + 1.31, 0.42, 0.18, 0.04, "#2a2018");
      K.box(SK, scx, hy - 3.2, hz + 1.2, 0.5, 0.7, 0.4, shadeC(lion, 0.85));
      K.box("lm.Metal024.metal", scx, hy + 0.4, hz + 1.35, 0.3, 0.6, 0.25, goldS);
    }
    // the neck down into the shoulders
    K.blob(SK, scx, hy - 4, hz - 0.6, 1.6, 2.2, 1.8, lion, 12);
  }
  // ---- the processional way, the pylon gate, the barriers, the lamps
  const pw = 8,
    gz = D - 16;
  K.span("lm.PavingStones128", X(CX - pw), -0.02, Z(PZ1), X(CX + pw), 0.06, Z(D - 6), hex("#e0d4b8"));
  const pyl = hex("#d4bc8c");
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? CX - pw - 12 : CX + pw + 1,
      x1 = x0 + 11;
    const px = (X(x0) + X(x1)) / 2,
      pz = Z(gz);
    K.frustum(LIME, px, 0, pz, m(11), m(8), m(7), m(4), m(24), pyl);
    K.frustum(LIME, px, m(24), pz, m(7.6), m(4.6), m(8.2), m(5.2), 0.45, hex("#b89e70"));
    // painted bands (blue on the left, red on the right) round the battered faces
    if (!lod)
      for (const y of [6, 12, 18]) {
        const f = y / 24;
        K.frustum("lm.paint", px, m(y), pz, m(11 - 4 * f) + 0.04, m(8 - 4 * f) + 0.04, m(11 - 4 * (f + 1 / 24)) + 0.04, m(8 - 4 * (f + 1 / 24)) + 0.04, m(1), s < 0 ? hex("#2f5f9e") : hex("#a8382a"));
      }
  }
  // the lintel over the way, the winged disk on it (lit)
  K.span(LIME, X(CX - pw - 3), m(19), Z(gz - 2), X(CX + pw + 3), m(23), Z(gz + 2), pyl);
  K.span(LIME, X(CX - pw - 3.5), m(23), Z(gz - 2.5), X(CX + pw + 3.5), m(24), Z(gz + 2.5), hex("#b89e70"));
  K.cyl("lm.glow", cx, m(20.2), Z(gz + 2) + 0.05, 0.62, 0.62, 0.12, 20, hex("#f4b728"));
  for (const s of [-1, 1]) K.beam("lm.paint", [cx + s * 0.7, m(21.5), Z(gz + 2) + 0.12], [cx + s * 2.3, m(21.8), Z(gz + 2) + 0.12], 0.32, hex("#2f5f9e"), 0.06);
  // rope barriers either side of the way
  if (!lod)
    for (const s of [-1, 1]) {
      let last: V3 | null = null;
      for (let z = PZ1 + 4; z < gz - 6; z += 6) {
        const p: V3 = [X(CX + s * (pw - 1)), 0, Z(z)];
        K.cyl("lm.dark", p[0], 0, p[2], 0.05, 0.05, 1.0, 8, "#2a2622");
        K.lathe("lm.chrome", [[0.06, 0], [0.08, 0.06], [0.001, 0.12]], p[0], 1.0, p[2], 8, hex("#c8a040"));
        const q: V3 = [p[0], 0.86, p[2]];
        if (last) {
          const mid: V3 = [(last[0] + q[0]) / 2, 0.62, (last[2] + q[2]) / 2];
          K.rod("lm.paint", last, mid, 0.03, hex("#a8202a"));
          K.rod("lm.paint", mid, q, 0.03, hex("#a8202a"));
        }
        last = q;
      }
    }
  for (const s of [-1, 1]) for (const z of [PZ1 + 8, PZ1 + 26]) lampPost(c, X(CX + s * (pw + 3)), Z(z), 4.2);
  // the floodlights at the front corners (the sound-and-light show)
  if (!lod)
    for (const s of [-1, 1]) {
      const fx = X(s < 0 ? CX - half0 - 4 : CX + half0 + 3);
      K.box("lm.dark", fx, 0, Z(PZ1 + 2), 0.8, 0.5, 0.6, "#2a2a2e");
      K.box("lm.glow.night", fx, 0.5, Z(PZ1 + 2) - 0.25, 0.6, 0.4, 0.1, hex("#fff0c8"));
    }
  // ---- the ticket booth, right of the way: sandstone, a lit window, the striped awning
  {
    const bx0 = CX + pw + 4,
      bx1 = bx0 + 14,
      bz0 = PZ1 + 8,
      bz1 = bz0 + 9;
    const [x0, z0, x1, z1] = [X(bx0), Z(bz0), X(bx1), Z(bz1)];
    K.span(LIME, x0, 0, z0, x1, m(9), z1, hex("#d8c8a4"));
    K.span("lm.glass", x0 + 0.7, m(3.5), z1 - 0.05, x1 - 0.7, m(7.8), z1 + 0.02, hex("#ffd8a0"));
    K.span("lm.Wood049", x0 + 0.6, m(3.5) - 0.1, z1, x1 - 0.6, m(3.5), z1 + 0.35, hex("#8a6040"));
    for (let i = 0; i < 7; i++) {
      const xa = x0 - 0.3 + ((x1 - x0 + 0.6) * i) / 7,
        xb = x0 - 0.3 + ((x1 - x0 + 0.6) * (i + 1)) / 7;
      K.beam("lm.paint", [(xa + xb) / 2, m(9.4), z0 - 0.2], [(xa + xb) / 2, m(8.6), z1 + 1.1], xb - xa, i % 2 ? hex("#2f5f9e") : hex("#d8a62a"), 0.05);
    }
    K.span(LIME, x0 - 0.3, m(9), z0 - 0.3, x1 + 0.3, m(9.6), z1 - 0.2, hex("#cbb894"));
  }
  // ---- where the camels rested: a Bedouin tent with its carpets, water troughs
  {
    const cmx = Math.min(W - 10, CX + pw + 4 + 14 + 8);
    const tx = X(cmx + 1.5),
      tz0 = Z(PZ1 + 5),
      tz1 = Z(PZ1 + 17);
    const tent = hex("#3a3028");
    for (const dx of [-2.2, 2.2]) for (const z of [tz0, (tz0 + tz1) / 2, tz1]) K.cyl("lm.Wood049", tx + dx, 0, z, 0.06, 0.05, 2.2, 6, hex("#6a5038"));
    for (const z of [tz0, tz1]) K.cyl("lm.Wood049", tx, 0, z, 0.07, 0.06, 2.8, 6, hex("#6a5038"));
    for (const s of [-1, 1]) K.beam("lm.paint", [tx + s * 1.1, 2.5, tz0], [tx + s * 1.1, 2.5, tz1], 2.4, tent, 0.06);
    // (the two halves of the roof, sloping from the ridge to the eaves)
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(2.45, tz1 - tz0 + 0.6);
      g.rotateX(-Math.PI / 2);
      g.rotateZ(s * -0.24);
      g.translate(tx + s * 1.18, 2.5, (tz0 + tz1) / 2);
      K.add("lm.paint", g, tent);
    }
    if (!lod) {
      K.span("lm.Carpet016", tx - 2, 0.02, tz0 + 0.3, tx + 2, 0.06, tz1 - 0.3, hex("#a8382a"));
      for (let i = 0; i < 4; i++) K.blob("lm.paint", tx - 1.5 + (i % 2) * 3, 0.25, tz0 + 1 + i * 0.9, 0.35, 0.22, 0.3, i % 2 ? hex("#d8a62a") : hex("#2f5f9e"), 8);
    }
    for (const z of [PZ1 + 22, PZ1 + 30]) K.span(LIME, X(cmx - 5), 0, Z(z), X(cmx + 3), 0.6, Z(z + 3), hex("#b8a888"));
  }
  // ---- palms: an oasis by the tent, a row by the Sphinx, a pair at the gate
  const sx1 = 22,
    sz1 = D - 12,
    sz0 = sz1 - 50;
  for (const [x, z] of [
    [W - 6, PZ1 - 4],
    [W - 12, PZ1 + 14],
    [W - 5, D - 14],
    [sx1 + 6, sz0 + 4],
    [sx1 + 7, sz1 - 6],
    [CX - pw - 16, gz - 10],
    [CX + pw + 16, gz - 10],
    [CX - half0 - 6, PZ0 + 8],
    [CX + half0 + 4, PZ0 + 30],
    [CX + half0 + 6, PZ0 + 70],
  ]) {
    if (x < 2 || x > W - 3 || z < 2 || z > D - 3) continue;
    const p = F.p([x, 0, z]);
    c.trees.push([p[0], 0, p[2], "palm", x * 7 + z]);
  }
  void b;
}

// ---- shared: a Gothic face -------------------------------------------------------------------------

/** A local point (u along the face, d out of it) of a face centred on (x, z) turned ry, in the lot. */
const onFace = (x: number, z: number, ry: number, u: number, d: number): [number, number] => [x + u * Math.cos(ry) + d * Math.sin(ry), z - u * Math.sin(ry) + d * Math.cos(ry)];

/**
 * A Perpendicular Gothic face (Westminster, the chapels): a wall `len` wide from y0 up h, centred on
 * (x, z) and facing ry (0: +z), pierced by `bays` × `storeys` pointed windows with dark glass behind,
 * buttress strips between the bays, string courses at the storeys, a pierced parapet and pinnacles.
 */
function gothicFace(c: Ctx, slot: string, x: number, z: number, len: number, y0: number, h: number, ry: number, o: { bays: number; storeys: number; col: V3; para?: number; pinnacles?: boolean; door?: number; glass?: V3 }) {
  const { K, lod } = c;
  const bw = len / o.bays,
    sh = h / o.storeys;
  const holes: { x: number; y: number; w: number; h: number; pointed: boolean }[] = [];
  for (let i = 0; i < o.bays; i++)
    for (let j = 0; j < o.storeys; j++) {
      const u = -len / 2 + bw * (i + 0.5);
      if (o.door !== undefined && i === o.door && j === 0) continue;
      holes.push({ x: u, y: j * sh + sh * 0.18, w: bw * 0.42, h: sh * 0.66, pointed: true });
    }
  K.extrude(slot, windowsShape(len, h, lod ? [] : holes), -0.6, 0.6, o.col, { ry, ox: x, oy: y0, oz: z, curve: 4 });
  // the glass behind (lit rooms at night)
  K.extrude("lm.glass", windowsShape(len - 0.2, h - 0.2, []), -0.58, 0.04, o.glass ?? hex("#3a4656"), { ry, ox: x, oy: y0 + 0.1, oz: z });
  // a pointed doorway in the given bay
  if (o.door !== undefined) {
    const u = -len / 2 + bw * (o.door + 0.5);
    K.extrude(slot, arcadeShape(bw * 0.9, sh * 0.95, [{ x: 0, w: bw * 0.55, h: sh * 0.85, pointed: true }]), 0, 0.25, shadeC(o.col, 1.04), { ry, ox: onFace(x, z, ry, u, 0)[0], oy: y0, oz: onFace(x, z, ry, u, 0)[1] });
    const [dx, dz] = onFace(x, z, ry, u, -0.62);
    K.box("lm.Wood049", dx, y0, dz, bw * 0.5, sh * 0.62, 0.1, hex("#4a3020"), ry);
  }
  if (lod) return;
  // the buttress strips and their pinnacles
  for (let i = 0; i <= o.bays; i++) {
    const u = -len / 2 + bw * i;
    const [bx, bz] = onFace(x, z, ry, u, 0.18);
    K.box(slot, bx, y0, bz, 0.42, h + (o.para ?? 0), 0.36, shadeC(o.col, 0.96), ry);
    if (o.pinnacles !== false) {
      K.box(slot, bx, y0 + h + (o.para ?? 0), bz, 0.36, 0.5, 0.36, o.col, ry);
      K.cyl(slot, bx, y0 + h + (o.para ?? 0) + 0.5, bz, 0.22, 0.02, 1.3, 4, o.col);
    }
  }
  // the string courses
  for (let j = 1; j <= o.storeys; j++) {
    const [sx, sz] = onFace(x, z, ry, 0, 0.1);
    K.box(slot, sx, y0 + j * sh - 0.18, sz, len, 0.22, 0.22, shadeC(o.col, 0.92), ry);
  }
  // the parapet: a band of blind tracery (a row of little arches) above the cornice
  if (o.para) {
    const n = Math.max(2, Math.round(len / 0.9));
    const arches = Array.from({ length: n }, (_, i) => ({ x: -len / 2 + (len * (i + 0.5)) / n, w: (len / n) * 0.55, h: o.para! * 0.7, pointed: true }));
    K.extrude(slot, arcadeShape(len, o.para, arches), -0.3, 0.3, shadeC(o.col, 1.03), { ry, ox: x, oy: y0 + h, oz: z, curve: 3 });
    K.extrude(slot, windowsShape(len, o.para * 0.9, []), -0.5, 0.2, shadeC(o.col, 0.8), { ry, ox: x, oy: y0 + h, oz: z });
  }
}

/** A steep roof ridge along x: a prism of `w` (across z) rising `rh`, from x0 to x1, eaves at y. */
function ridgeRoof(c: Ctx, slot: string, x0: number, x1: number, z: number, w: number, y: number, rh: number, col: V3) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, rh);
  s.lineTo(-w / 2, 0);
  c.K.extrude(slot, s, -(x1 - x0) / 2, x1 - x0, col, { ry: Math.PI / 2, ox: (x0 + x1) / 2, oy: y, oz: z });
}

// ---- WESTMINSTER -------------------------------------------------------------------------------------

/**
 * The Palace of Westminster's river front in honey limestone, Perpendicular Gothic: the long range
 * of traceried windows between buttress strips under its pierced parapet and pinnacles, three
 * pavilions with steep slate roofs, the Victoria Tower with its corner turrets and the flag, and the
 * Elizabeth Tower: the panelled shaft, the clock stage with its four opal dials (lit at night; the
 * city turns the hands), the belfry, the gilded iron spire, the Ayrton light and the cross. The
 * terrace in front with its balustrade, its lamp standards and a red telephone box.
 */
function parliament(c: Ctx) {
  const { K, F, lod } = c;
  const m = (n: number) => F.m(n);
  const W = F.W,
    D = F.D;
  const X = (v: number) => F.p([v, 0, 0])[0],
    Z = (v: number) => F.p([0, 0, v])[2];
  const FZ = 44,
    BZ0 = 3;
  const EX0 = W - 30,
    EX1 = W - 4,
    EZ0 = 22,
    EZ1 = 48;
  const VX0 = 4,
    VX1 = 36,
    VZ0 = 14,
    VZ1 = 46;
  const RX0 = VX1,
    RX1 = EX0;
  const midX = Math.round((RX0 + RX1) / 2);
  const PAV: [number, number][] = [
    [RX0, RX0 + 14],
    [midX - 8, midX + 8],
    [RX1 - 14, RX1],
  ];
  const PZ = FZ + 3;
  const CORN = m(54),
    PARA = m(60) - m(54),
    PAVH = m(68);
  const stone = hex("#d4c090"),
    stoneL = hex("#e2d2a6"),
    slate = hex("#4c5566"),
    gold = hex("#e2b448"),
    blue = hex("#1f2d58");
  const ST = "lm.Bricks084",
    SL = "lm.Metal024";
  // ---- the terrace: York stone, the balustrade along the front (open at the door and the ends)
  K.box("lm.PavingStones111", 0, -0.06, 0, F.w, 0.08, F.d, hex("#c4bcab"));
  const doorX = X((EX0 + EX1) / 2);
  {
    const z0 = Z(D - 2),
      z1 = Z(D);
    const gaps: [number, number][] = [
      [-F.w / 2, -F.w / 2 + 3],
      [doorX - 2.2, doorX + 2.2],
      [F.w / 2 - 1.2, F.w / 2],
    ];
    let x = -F.w / 2;
    const runs: [number, number][] = [];
    for (const [a, b2] of gaps.sort((p, q) => p[0] - q[0])) {
      if (a > x) runs.push([x, a]);
      x = Math.max(x, b2);
    }
    if (x < F.w / 2) runs.push([x, F.w / 2]);
    for (const [a, b2] of runs) {
      K.span(ST, a, 0, z0, b2, 0.3, z1, stone);
      K.span(ST, a, 1.0, z0 - 0.05, b2, 1.2, z1 + 0.05, stoneL);
      if (lod) K.span(ST, a, 0.3, z0 + 0.15, b2, 1.0, z1 - 0.15, stone);
      else for (let t = a + 0.2; t < b2 - 0.1; t += 0.32) K.lathe(ST, [[0.1, 0], [0.13, 0.12], [0.07, 0.3], [0.12, 0.5], [0.09, 0.62], [0.1, 0.7]], t, 0.3, (z0 + z1) / 2, 8, stone);
      // lamp standards on it every 10 m: green iron, three lanterns
      if (!lod)
        for (let t = a + 4; t < b2 - 2; t += 10) {
          const lz = (z0 + z1) / 2;
          K.cyl("lm.paint", t, 1.2, lz, 0.14, 0.09, 3.2, 8, hex("#24402c"));
          K.box("lm.paint", t, 4.2, lz, 1.4, 0.08, 0.08, hex("#24402c"));
          for (const dx of [-0.65, 0, 0.65]) {
            K.box("lm.glow.night", t + dx, dx ? 4.28 : 4.5, lz, 0.26, 0.42, 0.26, hex("#ffd08a"));
            K.lathe("lm.paint", [[0.2, 0], [0.04, 0.2]], t + dx, (dx ? 4.28 : 4.5) + 0.42, lz, 6, hex("#24402c"));
          }
        }
    }
  }
  // a red telephone box by the tower
  if (!lod) {
    const tx = X(EX0 - 8),
      tz = Z(EZ1 + 5);
    const red = hex("#b3141e");
    K.box("lm.paint", tx, 0, tz, 0.9, 2.3, 0.9, red);
    for (const [dx, dz, ry] of [
      [0, 0.46, 0],
      [0, -0.46, 0],
      [0.46, 0, Math.PI / 2],
      [-0.46, 0, Math.PI / 2],
    ] as const)
      K.box("lm.glass", tx + dx, 0.5, tz + dz, 0.62, 1.4, 0.02, hex("#cfd8e0"), ry);
    K.box("lm.glow.night", tx, 2.06, tz, 0.94, 0.14, 0.94, hex("#fff4e0"));
    K.lathe("lm.paint", [[0.52, 0], [0.5, 0.08], [0.36, 0.22], [0.02, 0.28]], tx, 2.3, tz, 4, red, Math.PI / 4);
  }
  // ---- the main range: the core, the river face, the back face, the roof
  const rx0 = X(RX0),
    rx1 = X(RX1),
    fz = Z(FZ),
    bz = Z(BZ0);
  K.span(ST, rx0, 0, bz + 0.6, rx1, CORN, fz - 0.6, stone);
  K.span(ST, rx0, 0, bz - 0.2, rx1, 2, fz + 0.25, hex("#a89676"));
  const rlen = rx1 - rx0;
  gothicFace(c, ST, (rx0 + rx1) / 2, fz, rlen, 2, CORN - 2, 0, { bays: Math.round(rlen / 2.6), storeys: 3, col: stone, para: PARA });
  gothicFace(c, ST, (rx0 + rx1) / 2, bz, rlen, 2, CORN - 2, Math.PI, { bays: Math.round(rlen / 3.2), storeys: 3, col: stone, para: PARA, pinnacles: false });
  ridgeRoof(c, SL, rx0, rx1, (fz + bz) / 2, fz - bz - 2.4, CORN + PARA * 0.3, 5.2, slate);
  // cresting along the ridge
  if (!lod) K.span("lm.dark", rx0, CORN + PARA * 0.3 + 5.2, (fz + bz) / 2 - 0.05, rx1, CORN + PARA * 0.3 + 5.6, (fz + bz) / 2 + 0.05, "#2a2c32");
  // ---- the three pavilions, proud of the range, with their steep roofs
  for (const [a, b2] of PAV) {
    const x0 = X(a),
      x1 = X(b2),
      pz = Z(PZ);
    const pw = x1 - x0;
    K.span(ST, x0, 0, bz + 0.6, x1, PAVH, pz - 0.6, stone);
    gothicFace(c, ST, (x0 + x1) / 2, pz, pw, 2, PAVH - 2, 0, { bays: 3, storeys: 4, col: stoneL, para: 0.9 });
    K.span(ST, x0, 0, pz - 0.6, x1, 2, pz + 0.3, hex("#a89676"));
    K.frustum(SL, (x0 + x1) / 2, PAVH + 0.9, (pz + bz) / 2, pw + 0.2, pz - bz + 0.2, 0.6, (pz - bz) * 0.6, 6.5, slate);
    if (!lod)
      for (const [sx, sz] of [
        [x0, pz],
        [x1, pz],
        [x0, bz],
        [x1, bz],
      ]) {
        K.cyl(ST, sx, PAVH, sz, 0.5, 0.45, 1.6, 8, stoneL);
        K.cyl(ST, sx, PAVH + 1.6, sz, 0.48, 0.02, 2.6, 8, stoneL);
      }
    K.cyl("lm.Metal024.metal", (x0 + x1) / 2, PAVH + 7.4, (pz + bz) / 2, 0.08, 0.02, 2.2, 6, gold);
  }
  // ---- the Victoria Tower: the Sovereign's entrance, the panelled stages, the corner turrets, the flag
  {
    const x0 = X(VX0),
      x1 = X(VX1),
      z0 = Z(VZ0),
      z1 = Z(VZ1);
    const VT = m(108);
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2,
      wv = x1 - x0;
    K.span(ST, x0 + 0.6, 0, z0 + 0.6, x1 - 0.6, VT, z1 - 0.6, stone);
    for (const [fx, fz2, ry] of [
      [cx, z1, 0],
      [cx, z0, Math.PI],
      [x1, cz, Math.PI / 2],
      [x0, cz, -Math.PI / 2],
    ] as const) {
      gothicFace(c, ST, fx, fz2, wv - 1.6, 2, VT - 2 - 1.4, ry, { bays: 3, storeys: 6, col: stone, para: 1.4, pinnacles: false });
      // the Sovereign's arch in the river face
      if (ry === 0) K.extrude(ST, arcadeShape(wv * 0.7, 9, [{ x: 0, w: wv * 0.42, h: 8, pointed: true }]), 0, 0.6, stoneL, { ox: fx, oz: fz2 });
    }
    if (ry0Arch()) K.span("lm.dark", cx - wv * 0.21, 2, z1 - 0.62, cx + wv * 0.21, 7.5, z1 - 0.55, "#1a1612");
    K.span(ST, x0 - 0.3, 0, z0 - 0.3, x1 + 0.3, 2, z1 + 0.3, hex("#a89676"));
    // the octagonal corner turrets rising above the parapet, their caps
    for (const [tx, tz] of [
      [x0 + 0.5, z0 + 0.5],
      [x1 - 0.5, z0 + 0.5],
      [x0 + 0.5, z1 - 0.5],
      [x1 - 0.5, z1 - 0.5],
    ]) {
      K.cyl(ST, tx, 0, tz, 1.0, 0.95, VT + 3.2, 8, stoneL);
      K.cyl(ST, tx, VT + 3.2, tz, 1.15, 1.15, 0.4, 8, stone);
      K.cyl(ST, tx, VT + 3.6, tz, 1.05, 0.02, 3.6, 8, stoneL);
      K.cyl("lm.Metal024.metal", tx, VT + 7.2, tz, 0.06, 0.02, 0.9, 6, gold);
    }
    // the iron crown in the middle and the flagpole with the Union flag
    K.frustum(SL, cx, VT + 1.4, cz, wv - 3, wv - 3, 2, 2, 2.6, slate);
    K.cyl("lm.dark", cx, VT + 4, cz, 0.12, 0.08, 9, 8, "#2a2a2e");
    if (!lod) {
      const fy = VT + 10.2;
      const flag = (y0: number, y1: number, z0f: number, z1f: number, col: V3, dz = 0.02) => K.span("lm.paint", cx + 0.1, fy + y0, cz + z0f, cx + 0.1 + dz, fy + y1, cz + z1f, col);
      flag(0, 2.6, 0.1, 5.2, hex("#1f2d6a"));
      flag(1.0, 1.6, 0.1, 5.2, hex("#f4f4f4"), 0.03);
      flag(0, 2.6, 2.3, 3.0, hex("#f4f4f4"), 0.03);
      flag(1.12, 1.48, 0.1, 5.2, hex("#c8102e"), 0.04);
      flag(0, 2.6, 2.45, 2.85, hex("#c8102e"), 0.04);
    }
    function ry0Arch() {
      return true;
    }
  }
  // ---- the Elizabeth Tower
  {
    const x0 = X(EX0),
      x1 = X(EX1),
      z0 = Z(EZ0),
      z1 = Z(EZ1);
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2,
      we = x1 - x0;
    const SH1 = m(80),
      CL1 = m(112),
      DY = m(96),
      DR = m(10),
      BL1 = m(130),
      LN1 = m(140),
      SP1 = m(168);
    const FACES: [number, number, number][] = [
      [cx, z1, 0],
      [cx, z0, Math.PI],
      [x1, cz, Math.PI / 2],
      [x0, cz, -Math.PI / 2],
    ];
    // the plinth, the shaft (panelled: lancets between the strips, string courses), the door
    K.span(ST, x0 - 0.35, 0, z0 - 0.35, x1 + 0.35, 2, z1 + 0.35, hex("#a89676"));
    K.span(ST, x0 + 0.6, 0, z0 + 0.6, x1 - 0.6, SH1, z1 - 0.6, stone);
    for (const [fx, fz2, ry] of FACES) gothicFace(c, ST, fx, fz2, we - 0.2, 2, SH1 - 2, ry, { bays: 3, storeys: 7, col: stone, pinnacles: false, door: ry === 0 ? 1 : undefined });
    // the clock stage, a third of a metre proud: the four dials in their gilded squares
    const cw = we + m(2);
    K.span(ST, cx - cw / 2 - 0.33, SH1, cz - cw / 2 - 0.33, cx + cw / 2 + 0.33, SH1 + 0.66, cz + cw / 2 + 0.33, stoneL);
    K.span(ST, cx - cw / 2, SH1 + 0.66, cz - cw / 2, cx + cw / 2, CL1, cz + cw / 2, stone);
    for (const [, , ry] of FACES) {
      const [dx, dz] = onFace(cx, cz, ry, 0, cw / 2);
      // the gilded square surround and its spandrels, the dark iron ring, the opal dial
      K.extrude("lm.Metal024.metal", windowsShape(DR * 2 + 1.4, DR * 2 + 1.4, [{ x: 0, y: 0.7, w: DR * 2, h: DR * 2 }]), 0, 0.1, gold, { ry, ox: dx, oy: DY - DR - 0.7, oz: dz });
      K.extrude("lm.Metal024.metal", windowsShape(DR * 2, DR * 2, []), -0.02, 0.04, blue, { ry, ox: dx, oy: DY - DR, oz: dz });
      const dial = new THREE.CylinderGeometry(DR, DR, 0.06, K.seg(48));
      dial.rotateX(Math.PI / 2);
      dial.translate(0, 0, 0.04);
      dial.rotateY(ry);
      dial.translate(dx, DY, dz);
      K.add("lm.glow", dial, hex("#f2e6c4"));
      const ring = new THREE.TorusGeometry(DR, 0.16, 6, K.seg(48));
      ring.translate(0, 0, 0.07);
      ring.rotateY(ry);
      ring.translate(dx, DY, dz);
      K.add("lm.dark", ring, "#1b1b20");
      // the twelve hour marks
      if (!lod)
        for (let h = 0; h < 12; h++) {
          const a = (h / 12) * Math.PI * 2;
          const g = new THREE.BoxGeometry(0.16, h % 3 ? 0.5 : 0.8, 0.03);
          g.translate(0, DR * 0.82, 0.09);
          g.rotateZ(a);
          g.rotateY(ry);
          g.translate(dx, DY, dz);
          K.add("lm.dark", g, "#1b1b20");
        }
      // the frieze under the stage (gilded shields on blue)
      const [fx2, fz3] = onFace(cx, cz, ry, 0, cw / 2 + 0.02);
      K.box("lm.paint", fx2, SH1 + 0.7, fz3, cw * 0.9, 0.5, 0.04, blue, ry);
      if (!lod) for (let i = -3; i <= 3; i++) {
        const [sx, sz] = onFace(cx, cz, ry, (i * cw) / 8, cw / 2 + 0.05);
        K.box("lm.Metal024.metal", sx, SH1 + 0.75, sz, 0.3, 0.4, 0.03, gold, ry);
      }
    }
    // the belfry: open pointed arches on each face, the bells' dark inside
    K.span("lm.dark", cx - we / 2 + 1, CL1, cz - we / 2 + 1, cx + we / 2 - 1, BL1, cz + we / 2 - 1, "#1a1816");
    for (const [, , ry] of FACES) {
      const [dx, dz] = onFace(cx, cz, ry, 0, we / 2);
      K.extrude(ST, arcadeShape(we, BL1 - CL1, [-1, 0, 1].map((i) => ({ x: (i * we) / 3.2, w: we / 4.6, h: (BL1 - CL1) * 0.8, pointed: true }))), -0.5, 0.5, stoneL, { ry, ox: dx, oy: CL1, oz: dz });
    }
    for (const [sx, sz] of [
      [x0, z0],
      [x1, z0],
      [x0, z1],
      [x1, z1],
    ]) {
      K.cyl(ST, sx, SH1, sz, 0.55, 0.5, BL1 - SH1 + 1, 8, stoneL);
      K.cyl(ST, sx, BL1 + 1, sz, 0.55, 0.02, 3.2, 8, stoneL);
      K.cyl("lm.Metal024.metal", sx, BL1 + 4.2, sz, 0.05, 0.02, 0.8, 6, gold);
    }
    // the spire: the steep iron roof in slate blue with gilded ribs, the Ayrton light's lantern, the spire, the cross
    K.frustum(SL, cx, BL1, cz, we + 0.4, we + 0.4, we * 0.42, we * 0.42, LN1 - BL1 - 0.6, slate);
    if (!lod)
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ])
        K.beam("lm.Metal024.metal", [cx + sx * (we / 2 + 0.2), BL1, cz + sz * (we / 2 + 0.2)], [cx + sx * we * 0.21, LN1 - 0.6, cz + sz * we * 0.21], 0.2, gold);
    K.span("lm.glow.night", cx - we * 0.2, LN1 - 0.6, cz - we * 0.2, cx + we * 0.2, LN1 + 1.4, cz + we * 0.2, hex("#fff0c0"));
    K.frustum("lm.Metal024.metal", cx, LN1 + 1.4, cz, we * 0.46, we * 0.46, we * 0.12, we * 0.12, 1.2, gold);
    K.frustum(SL, cx, LN1 + 2.6, cz, we * 0.3, we * 0.3, 0.12, 0.12, SP1 - LN1 - 4, slate);
    if (!lod) for (let y = LN1 + 4; y < SP1 - 3; y += 2.2) K.frustum("lm.Metal024.metal", cx, y, cz, we * 0.3 * (1 - (y - LN1 - 2.6) / (SP1 - LN1 - 4)) + 0.06, we * 0.3 * (1 - (y - LN1 - 2.6) / (SP1 - LN1 - 4)) + 0.06, we * 0.3 * (1 - (y + 0.25 - LN1 - 2.6) / (SP1 - LN1 - 4)) + 0.06, we * 0.3 * (1 - (y + 0.25 - LN1 - 2.6) / (SP1 - LN1 - 4)) + 0.06, 0.25, gold);
    K.cyl("lm.Metal024.metal", cx, SP1 - 1.4, cz, 0.08, 0.06, 2.4, 6, gold);
    K.box("lm.Metal024.metal", cx, SP1 + 0.3, cz, 0.9, 0.14, 0.14, gold);
  }
  void blue;
}

// ---- shared: a classical face, a square dome ---------------------------------------------------------

/**
 * A French Renaissance face (the Louvre): `bays` across, the ground floor's round-arched windows,
 * the main floor's tall windows under alternating pediments between paired columns, the attic's
 * square windows, the cornice and the balustrade. Centred on (x, z), facing ry, from y0 up h.
 */
function classicFace(c: Ctx, slot: string, x: number, z: number, len: number, y0: number, h: number, ry: number, o: { bays: number; col: V3; plain?: boolean }) {
  const { K, lod } = c;
  const bw = len / o.bays;
  const g1 = h * 0.34,
    m1 = h * 0.8;
  const holes: { x: number; y: number; w: number; h: number; arch?: boolean }[] = [];
  for (let i = 0; i < o.bays; i++) {
    const u = -len / 2 + bw * (i + 0.5);
    holes.push({ x: u, y: g1 * 0.12, w: bw * 0.48, h: g1 * 0.78, arch: true });
    holes.push({ x: u, y: g1 + (m1 - g1) * 0.12, w: bw * 0.4, h: (m1 - g1) * 0.66 });
    holes.push({ x: u, y: m1 + (h - m1) * 0.25, w: bw * 0.3, h: (h - m1) * 0.45 });
  }
  K.extrude(slot, windowsShape(len, h, lod ? [] : holes), -0.6, 0.6, o.col, { ry, ox: x, oy: y0, oz: z, curve: 5 });
  K.extrude("lm.glass", windowsShape(len - 0.2, h - 0.2, []), -0.58, 0.04, hex("#46525e"), { ry, ox: x, oy: y0 + 0.1, oz: z });
  // the cornice, the string course, the balustrade
  const P = (u: number, d: number) => onFace(x, z, ry, u, d);
  const [cx0, cz0] = P(0, 0.25);
  K.box(slot, cx0, y0 + h - 0.1, cz0, len + 0.3, 0.55, 0.7, shadeC(o.col, 0.94), ry);
  K.box(slot, cx0, y0 + g1 - 0.15, cz0, len, 0.3, 0.4, shadeC(o.col, 0.94), ry);
  if (lod) {
    K.extrude(slot, windowsShape(len, 1.0, []), -0.3, 0.3, o.col, { ry, ox: x, oy: y0 + h + 0.45, oz: z });
    return;
  }
  const n = Math.max(2, Math.round(len / 0.5));
  const bal = Array.from({ length: n }, (_, i) => ({ x: -len / 2 + (len * (i + 0.5)) / n, y: 0.2, w: (len / n) * 0.45, h: 0.6 }));
  K.extrude(slot, windowsShape(len, 1.0, bal), -0.25, 0.25, shadeC(o.col, 1.04), { ry, ox: x, oy: y0 + h + 0.45, oz: z });
  if (o.plain) return;
  // the ground floor's rusticated piers: grooves every half metre
  for (let y = 0.5; y < g1 - 0.4; y += 0.55) {
    const [gx, gz] = P(0, 0.02);
    K.box(slot, gx, y0 + y, gz, len, 0.06, 0.04, shadeC(o.col, 0.8), ry);
  }
  for (let i = 0; i <= o.bays; i++) {
    const u = -len / 2 + bw * i;
    // paired columns on the main floor
    for (const du of [-0.32, 0.32]) {
      const [px, pz] = P(u + du, 0.28);
      if (i === 0 && du < 0) continue;
      if (i === o.bays && du > 0) continue;
      K.cyl(slot, px, y0 + g1 + 0.2, pz, 0.2, 0.17, m1 - g1 - 0.6, 10, shadeC(o.col, 1.05));
      K.box(slot, px, y0 + m1 - 0.4, pz, 0.5, 0.3, 0.5, shadeC(o.col, 1.05), ry);
    }
  }
  // pediments over the main windows (triangular and curved by turns)
  for (let i = 0; i < o.bays; i++) {
    const u = -len / 2 + bw * (i + 0.5);
    const [px, pz] = P(u, 0);
    const pw = bw * 0.56,
      ph = bw * 0.16;
    const s = new THREE.Shape();
    if (i % 2) {
      s.moveTo(-pw / 2, 0);
      s.quadraticCurveTo(0, ph * 2, pw / 2, 0);
      s.lineTo(-pw / 2, 0);
    } else {
      s.moveTo(-pw / 2, 0);
      s.lineTo(pw / 2, 0);
      s.lineTo(0, ph);
      s.lineTo(-pw / 2, 0);
    }
    K.extrude(slot, s, 0, 0.3, shadeC(o.col, 1.04), { ry, ox: px, oy: y0 + g1 + (m1 - g1) * 0.8, oz: pz, curve: 5 });
  }
}

/** A square (or oblong) dome: a bell of four flat faces over sx × sz from y, h high (the Louvre's pavilions). */
function squareDome(c: Ctx, slot: string, x: number, y: number, z: number, sx: number, sz: number, h: number, col: V3, prof: [number, number][] = [[1, 0], [0.97, 0.3], [0.82, 0.62], [0.5, 0.88], [0.18, 1]]) {
  const g0 = new THREE.LatheGeometry(
    prof.map(([r, t]) => new THREE.Vector2(Math.max(0.001, r * Math.SQRT2), t * h)),
    4,
    Math.PI / 4,
  );
  const g = g0.toNonIndexed();
  g0.dispose();
  g.computeVertexNormals();
  g.scale(sx / 2, 1, sz / 2);
  g.translate(x, y, z);
  c.K.add(slot, g, col);
}

// ---- THE zkSNARK MUSEUM (the Louvre) -----------------------------------------------------------------

/**
 * The Cour Napoléon: the U of the palace in pale limestone (Sully at the back with the Pavillon de
 * l'Horloge and its clock, Richelieu and Denon either side), arcaded ground floors, columned main
 * floors with pediments, attics and balustrades, slate mansards with dormers, the pavilions under
 * their tall square domes; the glass pyramid on its steel net with its three small ones and the
 * triangular basins; the queue's stanchions; the Arc du Carrousel in white and pink marble under its
 * bronze quadriga; the Carrousel gardens with their hedges, yew cones and flowerbeds.
 */
function museum(c: Ctx) {
  const { K, F, lod } = c;
  const m = (n: number) => F.m(n);
  const W = F.W,
    D = F.D;
  const X = (v: number) => F.p([v, 0, 0])[0],
    Z = (v: number) => F.p([0, 0, v])[2];
  const CX = Math.round(W / 2);
  const WD = 30,
    BZ0 = 6,
    BZ1 = BZ0 + WD,
    LX0 = 6,
    LX1 = LX0 + WD,
    RX1 = W - 6,
    RX0 = RX1 - WD;
  const WZ1 = Math.min(140, D - 31);
  const midZ = Math.round((BZ1 + WZ1) / 2);
  const PV = 36;
  type R4 = [number, number, number, number];
  const pavs: { r: R4; horloge?: boolean }[] = [
    { r: [LX0 - 2, BZ0 - 2, LX0 - 2 + PV, BZ0 - 2 + PV] },
    { r: [RX1 + 2 - PV, BZ0 - 2, RX1 + 2, BZ0 - 2 + PV] },
    { r: [LX0 - 2, WZ1 - 30, LX0 - 2 + PV, WZ1 + 4] },
    { r: [RX1 + 2 - PV, WZ1 - 30, RX1 + 2, WZ1 + 4] },
    { r: [LX0 - 2, midZ - 12, LX1 + 6, midZ + 12] },
    { r: [RX0 - 6, midZ - 12, RX1 + 2, midZ + 12] },
    { r: [CX - 18, BZ0 - 4, CX + 18, BZ1 + 6], horloge: true },
  ];
  const PX = CX,
    PZ = Math.round(BZ1 + 56),
    PB = 29,
    PH = 37;
  const PF = PZ + PB;
  const smalls: [number, number][] = [
    [Math.round((LX1 + 6 + PX - PB) / 2), PZ],
    [Math.round((RX0 - 6 + PX + PB) / 2), PZ],
    [PX, Math.round((BZ1 + 6 + PZ - PB) / 2) + 1],
  ];
  const SB = 7,
    SH = 9;
  const WALL = m(49),
    PWALL = m(55),
    HWALL = m(63);
  const lime = hex("#e6dcc8"),
    slate = hex("#5a6470"),
    gold = hex("#d8b048");
  const LM = "lm.Bricks008",
    SL = "lm.Metal024";
  // ---- the courtyard's granite, the street's pavement
  K.box("lm.PavingStones128", 0, -0.06, 0, F.w, 0.08, F.d, hex("#d2ccc0"));
  // ---- the wings: core, faces (the courtyard's and the outer ones), mansards with dormers
  const wing = (x0: number, z0: number, x1: number, z1: number, faces: [number, number, number, number, number][]) => {
    K.span(LM, x0 + 0.6, 0, z0 + 0.6, x1 - 0.6, WALL, z1 - 0.6, lime);
    for (const [fx, fz, len, ry, plain] of faces) classicFace(c, LM, fx, fz, len, 0, WALL, ry, { bays: Math.max(1, Math.round(len / 3.4)), col: lime, plain: !!plain });
    const ww = x1 - x0,
      wd = z1 - z0;
    K.frustum(SL, (x0 + x1) / 2, WALL + 0.4, (z0 + z1) / 2, ww - 0.4, wd - 0.4, ww - (ww > wd ? 2.6 : 5.2), wd - (ww > wd ? 5.2 : 2.6), 3.6, slate);
    K.box("lm.Metal024", (x0 + x1) / 2, WALL + 4, (z0 + z1) / 2, ww - (ww > wd ? 2.8 : 5.4), 0.2, wd - (ww > wd ? 5.4 : 2.8), hex("#6a6c70"));
  };
  const bx0 = X(LX0),
    bx1 = X(RX1),
    bz0 = Z(BZ0),
    bz1 = Z(BZ1),
    lx1 = X(LX1),
    rx0 = X(RX0),
    wz1 = Z(WZ1);
  // Sully at the back
  wing(bx0, bz0, bx1, bz1, [
    [(lx1 + rx0) / 2, bz1, rx0 - lx1, 0, 0],
    [(bx0 + bx1) / 2, bz0, bx1 - bx0, Math.PI, 1],
  ]);
  // Richelieu (left) and Denon (right)
  wing(bx0, bz1, lx1, wz1, [
    [lx1, (bz1 + wz1) / 2, wz1 - bz1, Math.PI / 2, 0],
    [bx0, (bz1 + wz1) / 2, wz1 - bz1, -Math.PI / 2, 1],
  ]);
  wing(rx0, bz1, bx1, wz1, [
    [rx0, (bz1 + wz1) / 2, wz1 - bz1, -Math.PI / 2, 0],
    [bx1, (bz1 + wz1) / 2, wz1 - bz1, Math.PI / 2, 1],
  ]);
  // dormers along the courtyard's mansards
  if (!lod) {
    const dormer = (x: number, z: number, ry: number) => {
      K.box(LM, x, WALL + 0.9, z, 1.0, 1.5, 0.9, lime, ry);
      const s = new THREE.Shape();
      s.moveTo(-0.6, 0);
      s.lineTo(0.6, 0);
      s.lineTo(0, 0.5);
      s.lineTo(-0.6, 0);
      const [px, pz] = onFace(x, z, ry, 0, 0.45);
      K.extrude(LM, s, -0.9, 0.95, lime, { ry, ox: px, oy: WALL + 2.4, oz: pz });
      const [gx, gz] = onFace(x, z, ry, 0, 0.46);
      K.box("lm.glass", gx, WALL + 1.05, gz, 0.6, 1.0, 0.03, hex("#46525e"), ry);
    };
    for (let x = lx1 + 2; x < rx0 - 1; x += 3.4) dormer(x, bz1 - 0.9, 0);
    for (let z = bz1 + 2; z < wz1 - 1; z += 3.4) dormer(lx1 - 0.9, z, Math.PI / 2), dormer(rx0 + 0.9, z, -Math.PI / 2);
  }
  // ---- the pavilions under their square domes; the Horloge with its clock
  for (const p of pavs) {
    const [x0, z0, x1, z1] = F.rect(p.r);
    const top = p.horloge ? HWALL : PWALL;
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2,
      pw = x1 - x0,
      pd = z1 - z0;
    K.span(LM, x0 + 0.6, 0, z0 + 0.6, x1 - 0.6, top, z1 - 0.6, lime);
    for (const [fx, fz, len, ry] of [
      [cx, z1, pw, 0],
      [cx, z0, pw, Math.PI],
      [x1, cz, pd, Math.PI / 2],
      [x0, cz, pd, -Math.PI / 2],
    ] as const)
      classicFace(c, LM, fx, fz, len, 0, top, ry, { bays: Math.max(2, Math.round(len / 3.4)), col: shadeC(lime, 1.02) });
    // a sculpted pediment on the courtyard face
    {
      const s = new THREE.Shape();
      s.moveTo(-pw * 0.4, 0);
      s.lineTo(pw * 0.4, 0);
      s.lineTo(0, pw * 0.16);
      s.lineTo(-pw * 0.4, 0);
      if (p.horloge || p.r[3] > WZ1) K.extrude(LM, s, -0.4, 0.8, shadeC(lime, 1.04), { ox: cx, oy: top + 1.4, oz: z1 });
    }
    const dh = p.horloge ? 9 : 6.5;
    squareDome(c, SL, cx, top + 1.45, cz, pw - 1.2, pd - 1.2, dh, slate);
    // the crest: a lead lantern and the gilded finial
    K.box("lm.Metal024", cx, top + 1.45 + dh, cz, Math.min(pw, pd) * 0.22, 0.9, Math.min(pw, pd) * 0.22, hex("#5a5c60"));
    K.cyl("lm.Metal024.metal", cx, top + 2.35 + dh, cz, 0.08, 0.02, 1.4, 6, gold);
    if (p.horloge) {
      // the clock on the courtyard face, in its gilded frame, under the caryatids' pediment
      const dial = new THREE.CylinderGeometry(1.3, 1.3, 0.08, K.seg(32));
      dial.rotateX(Math.PI / 2);
      dial.translate(cx, top - 2.6, z1 + 0.32);
      K.add("lm.glow", dial, hex("#efe4c8"));
      const ring = new THREE.TorusGeometry(1.3, 0.12, 6, K.seg(32));
      ring.translate(cx, top - 2.6, z1 + 0.36);
      K.add("lm.Metal024.metal", ring, gold);
    }
  }
  // ---- the basins: four pairs of triangles round the pyramid, granite kerbs, water
  {
    const tri = (pts: [number, number][]) => {
      const vs = pts.map(([dx, dz]) => [X(PX + dx), Z(PZ + dz)] as [number, number]);
      const s = new THREE.Shape();
      s.moveTo(vs[0][0], -vs[0][1]);
      for (const v of vs.slice(1)) s.lineTo(v[0], -v[1]);
      s.lineTo(vs[0][0], -vs[0][1]);
      return s;
    };
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const a = sz > 0 ? 8 : 6;
        for (const t of [
          [
            [34, 6],
            [56, 6],
            [34, 28],
          ],
          [
            [a, 34],
            [28, 34],
            [a, 56 - a + 6],
          ],
        ] as [number, number][][]) {
          const pts = t.map(([u, v]) => [u * sx, v * sz] as [number, number]);
          // (inside the courtyard only, clear of the small pyramids)
          const ok = pts.every(([dx, dz]) => PX + dx > LX1 + 8 && PX + dx < RX0 - 8 && PZ + dz > BZ1 + 8 && PZ + dz < WZ1 - 1);
          if (!ok) continue;
          K.slab("lm.Bricks008", tri(pts), 0, 0.42, hex("#8a8a88"));
          K.slab("lm.chrome", tri(pts.map(([u, v]) => [u - Math.sign(u) * 0.01, v] as [number, number])), 0.43, 0.01, hex("#5a7486"));
        }
      }
  }
  // ---- the glass pyramid: four glass faces, the steel net over them, the entrance
  {
    const px = X(PX),
      pz = Z(PZ),
      pb = m(PB),
      ph = m(PH);
    K.frustum("lm.glass", px, 0, pz, pb * 2, pb * 2, 0.02, 0.02, ph, hex("#b8c8d4"));
    if (!lod) {
      // the net: the diagonal members on each face (two families), the ridges, the base ring
      const n = 9;
      const face = (sx: number, sz: number) => {
        // a point on the face: s from left to right (−1…1), t up (0…1)
        const P = (s: number, t: number): V3 => {
          const hb = pb * (1 - t) + 0.03;
          return sx ? [px + sx * hb, ph * t, pz + s * hb] : [px + s * hb, ph * t, pz + sz * hb];
        };
        for (let i = 1; i < n; i++) {
          const t = i / n;
          K.beam("lm.chrome", P(-1, t), P(1, t), 0.05, hex("#9aa0a6"));
        }
        for (let i = -n + 1; i < n; i++) {
          const s0 = i / n;
          K.beam("lm.chrome", P(s0, 0), P(s0, 1), 0.04, hex("#9aa0a6"));
        }
      };
      face(0, 1);
      face(0, -1);
      face(1, 0);
      face(-1, 0);
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ])
        K.beam("lm.chrome", [px + sx * pb, 0, pz + sz * pb], [px, ph, pz], 0.12, hex("#8a9096"));
    }
    K.span("lm.Bricks008", px - pb - 0.3, 0, pz - pb - 0.3, px + pb + 0.3, 0.35, pz + pb + 0.3, hex("#b0aca4"));
    // the entrance: a small glass porch in the front face, its doors
    const fz = Z(PF);
    K.span("lm.chrome", px - 2, 0.35, fz - 1.2, px + 2, 3.0, fz + 0.4, hex("#8a9096"));
    K.span("lm.glass", px - 1.85, 0.35, fz + 0.38, px + 1.85, 2.85, fz + 0.45, hex("#d8e0e6"));
    K.span("lm.glow.night", px - 2, 3.0, fz - 1.2, px + 2, 3.08, fz + 0.4, hex("#fff0d0"));
    // the small pyramids, each in its pool
    for (const [sx, sz] of smalls) {
      const x = X(sx),
        z = Z(sz);
      K.span("lm.Bricks008", x - m(SB) - 0.6, 0, z - m(SB) - 0.6, x + m(SB) + 0.6, 0.42, z + m(SB) + 0.6, hex("#8a8a88"));
      K.span("lm.chrome", x - m(SB) - 0.4, 0.42, z - m(SB) - 0.4, x + m(SB) + 0.4, 0.44, z + m(SB) + 0.4, hex("#5a7486"));
      K.frustum("lm.glass", x, 0.44, z, m(SB) * 2, m(SB) * 2, 0.02, 0.02, m(SH), hex("#b8c8d4"));
    }
  }
  // ---- the queue: stanchions and ropes in front of the pyramid
  if (!lod) {
    const QZ0 = PF + 3,
      QZ1 = Math.min(PF + 15, WZ1 - 2);
    for (const qx of [-9, 9]) {
      let last: V3 | null = null;
      for (let qz = QZ0; qz <= QZ1; qz += 3) {
        const p: V3 = [X(PX + qx), 0, Z(qz)];
        K.cyl("lm.chrome", p[0], 0, p[2], 0.04, 0.04, 0.95, 8, hex("#c8c8cc"));
        K.cyl("lm.chrome", p[0], 0, p[2], 0.17, 0.17, 0.04, 10, hex("#c8c8cc"));
        const q: V3 = [p[0], 0.88, p[2]];
        if (last) K.rod("lm.paint", last, q, 0.025, hex("#1d2a4a"));
        last = q;
      }
    }
  }
  // ---- the Arc du Carrousel
  {
    const AZ0 = WZ1 + 11,
      AZ1 = AZ0 + 10,
      AX0 = CX - 19,
      AX1 = CX + 19;
    const x0 = X(AX0),
      x1 = X(AX1),
      z0 = Z(AZ0),
      z1 = Z(AZ1);
    const aw = x1 - x0,
      ad = z1 - z0,
      ah = 6.6,
      ax = (x0 + x1) / 2,
      az = (z0 + z1) / 2;
    const white = hex("#efe9de"),
      pink = hex("#c88a8a");
    K.extrude(
      "lm.Marble021",
      arcadeShape(aw, ah, [
        { x: 0, w: aw * 0.26, h: ah * 0.72 },
        { x: -aw * 0.32, w: aw * 0.13, h: ah * 0.52 },
        { x: aw * 0.32, w: aw * 0.13, h: ah * 0.52 },
      ]),
      -ad / 2,
      ad,
      white,
      { ox: ax, oz: az },
    );
    // the cross passage through the side arches
    // the eight pink columns on each long face, their bronze-white capitals, the entablature
    for (const fz of [z1, z0])
      for (const fx of [-0.47, -0.2, 0.2, 0.47]) {
        K.box("lm.Marble021", ax + fx * aw, 0, fz + Math.sign(fz - az) * 0.25, 0.9, 0.7, 0.9, white);
        K.cyl("lm.Marble021.gloss", ax + fx * aw, 0.7, fz + Math.sign(fz - az) * 0.25, 0.26, 0.23, ah - 1.6, 12, pink);
        K.box("lm.Marble021", ax + fx * aw, ah - 0.9, fz + Math.sign(fz - az) * 0.25, 0.6, 0.35, 0.6, white);
      }
    K.box("lm.Marble021", ax, ah - 0.55, az, aw + 0.9, 0.55, ad + 0.9, white);
    K.box("lm.Marble021", ax, ah, az, aw + 0.4, 1.5, ad + 0.4, white);
    K.box("lm.Marble021", ax, ah + 1.5, az, aw + 0.7, 0.25, ad + 0.7, shadeC(white, 0.95));
    // statues over the columns, the quadriga on the attic
    if (!lod)
      for (const fz of [z1, z0])
        for (const fx of [-0.47, -0.2, 0.2, 0.47]) {
          const sx = ax + fx * aw,
            sz = fz + Math.sign(fz - az) * 0.25;
          K.cyl("lm.Marble021", sx, ah + 1.75, sz, 0.18, 0.2, 0.9, 8, white);
          K.blob("lm.Marble021", sx, ah + 2.8, sz, 0.14, 0.18, 0.14, white, 8);
        }
    const bronze = hex("#4a5a48");
    const qy = ah + 1.75;
    K.box("lm.Metal024.metal", ax, qy, az, 2.2, 0.3, 1.4, bronze);
    for (let i = 0; i < 4; i++) {
      const hx = ax - 1.2 + i * 0.8;
      K.blob("lm.Metal024.metal", hx, qy + 1.1, az + 0.6, 0.28, 0.42, 0.75, bronze, 10);
      K.blob("lm.Metal024.metal", hx, qy + 1.7, az + 1.2, 0.16, 0.36, 0.22, bronze, 8);
      for (const lz of [0.2, 1.0]) K.cyl("lm.Metal024.metal", hx, qy + 0.3, az + lz, 0.06, 0.05, 0.6, 6, bronze);
    }
    K.box("lm.Metal024.metal", ax, qy + 0.3, az - 0.4, 1.2, 0.8, 0.9, bronze);
    K.cyl("lm.Metal024.metal", ax, qy + 1.1, az - 0.4, 0.2, 0.16, 1.2, 8, gold);
    K.blob("lm.Metal024.metal", ax, qy + 2.45, az - 0.4, 0.16, 0.2, 0.16, gold, 8);
    // ---- the Carrousel gardens either side of it
    const GZ0 = WZ1 + 8,
      GZ1 = D - 6;
    for (const [g0, g1] of [
      [8, AX0 - 8],
      [AX1 + 8, W - 8],
    ]) {
      if (g1 - g0 < 10) continue;
      const gx0 = X(g0),
        gx1 = X(g1),
        gz0 = Z(GZ0),
        gz1 = Z(GZ1);
      K.span("lm.Gravel022", gx0, -0.02, gz0, gx1, 0.04, gz1, hex("#dccfb4"));
      const mid = (gx0 + gx1) / 2;
      for (const [a0, a1] of [
        [gx0 + 0.7, mid - 0.7],
        [mid + 0.7, gx1 - 0.7],
      ]) {
        parterre(c, a0, gz0 + 0.7, a1, gz1 - 0.7);
        for (const [yx, yz] of [
          [a0 + 1.7, gz0 + 2.3],
          [a1 - 1.7, gz0 + 2.3],
          [a0 + 1.7, gz1 - 2.3],
          [a1 - 1.7, gz1 - 2.3],
        ])
          K.cyl("lm.Grass004", yx, 0.05, yz, 0.95, 0.08, 3.4, 10, hex("#2f5a2c"));
        if (!lod) {
          const fx = (a0 + a1) / 2,
            fz = (gz0 + gz1) / 2;
          K.cyl("lm.paint", fx, 0, fz, 1.2, 1.2, 0.25, 16, hex("#5a3a28"));
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2,
              rr = 0.4 + (i % 3) * 0.3;
            K.blob("lm.paint", fx + Math.cos(a) * rr, 0.32, fz + Math.sin(a) * rr, 0.18, 0.12, 0.18, [hex("#e8505a"), hex("#f4f2ec"), hex("#d070c0")][i % 3], 6);
          }
        }
      }
    }
    // ---- lamps
    for (const [lx, lz] of [
      [AX0 - 4, D - 4],
      [AX1 + 3, D - 4],
      [CX - 14, D - 4],
      [CX + 13, D - 4],
      [CX - 16, WZ1 - 1],
      [CX + 15, WZ1 - 1],
    ])
      lampPost(c, X(lx), Z(lz), 4);
    for (let z = BZ1 + 14; z < WZ1 - 4; z += 20) lampPost(c, X(LX1 + 4), Z(z), 4), lampPost(c, X(RX0 - 5), Z(z), 4);
    // benches in the courtyard
    for (let z = BZ1 + 20; z < WZ1 - 8; z += 20)
      for (const [bx, rot] of [
        [X(LX1 + 6), Math.PI / 2],
        [X(RX0 - 7), -Math.PI / 2],
      ] as const)
        c.props.push(["bench", bx, 0, Z(z), rot]);
  }
}

// ---- BLOCK STADIUM -----------------------------------------------------------------------------------

/**
 * A modern football ground in the ZEC colours, on the voxel layout's bowl (s: the distance out from
 * the pitch's rectangle, x distances shrunk by AX): a continuous two-tier concrete bowl with
 * plastic seats in gold and black sectors, the upper tier's overhang with its LED ribbon, the
 * curtain wall of glass between steel ribs with three lit gold bands, the ring roof on radial
 * trusses (an open lattice over the stands, a membrane outside) with floodlights round its edge,
 * the jumbotrons at the goal ends (the city plays the match on them), four lattice floodlight masts
 * (the back two on spiral ramp towers), the striped pitch with its lines and goals. At the front:
 * the glazed main gate under the name board, turnstiles, ticket booths, the giant ZEC coin, food
 * carts and parasols.
 */
function stadium(c: Ctx) {
  const { K, F, lod } = c;
  const m = (n: number) => F.m(n);
  const W = F.W,
    D = F.D;
  const AX = 0.8,
    FO = 45;
  const PLAZA = Math.max(18, Math.round(D * 0.1));
  const bz0 = 6,
    bz1 = D - PLAZA;
  const cx = Math.round(W / 2),
    cz = Math.round((bz0 + bz1) / 2);
  const hz = Math.round((bz1 - bz0) / 2 - FO);
  const hx = Math.round(W / 2 - 7 - FO / AX);
  const RI = 10,
    ROOF = 58;
  const X = (v: number) => F.p([v, 0, 0])[0],
    Z = (v: number) => F.p([0, 0, v])[2];
  const gold = hex("#f4b728"),
    goldDeep = hex("#c8921a"),
    black = hex("#17161c"),
    dark1 = hex("#26242e"),
    conc = hex("#c8c4c0"),
    steel = hex("#8a8e96");
  // ---- the stations round the bowl: a base point on the pitch's rectangle and the way out (s)
  type St = { bx: number; bz: number; dx: number; dz: number; side: "N" | "E" | "S" | "W" | "C"; u: number; row?: number };
  const st: St[] = [];
  const stepS = lod ? 12 : 4;
  const cornerN = lod ? 4 : 10;
  const side = (from: number, to: number, f: (t: number) => St) => {
    const n = Math.max(1, Math.round(Math.abs(to - from) / stepS));
    for (let i = 0; i < n; i++) st.push(f(from + ((to - from) * i) / n));
  };
  const corner = (sx: number, sz: number, a0: number, a1: number) => {
    for (let i = 0; i < cornerN; i++) {
      const a = a0 + ((a1 - a0) * i) / cornerN;
      st.push({ bx: sx * hx, bz: sz * hz, dx: (sx * Math.cos(a)) / AX, dz: sz * Math.sin(a), side: "C", u: a * 40 });
    }
  };
  side(-hx, hx, (t) => ({ bx: t, bz: -hz, dx: 0, dz: -1, side: "N", u: cx + t }));
  corner(1, -1, Math.PI / 2, 0);
  side(-hz, hz, (t) => ({ bx: hx, bz: t, dx: 1 / AX, dz: 0, side: "E", u: cz + t }));
  corner(1, 1, 0, Math.PI / 2);
  side(hx, -hx, (t) => ({ bx: t, bz: hz, dx: 0, dz: 1, side: "S", u: cx + t }));
  corner(-1, 1, Math.PI / 2, 0);
  side(hz, -hz, (t) => ({ bx: -hx, bz: t, dx: -1 / AX, dz: 0, side: "W", u: cz + t }));
  corner(-1, -1, 0, Math.PI / 2);
  const N = st.length;
  const P = (i: number, s: number, y: number): V3 => {
    const q = st[((i % N) + N) % N];
    return [X(cx + q.bx + s * q.dx), m(y), Z(cz + q.bz + s * q.dz)];
  };
  /**
   * A profile [(s, y)…] (voxels) swept round the stations (or the stations `only` keeps), its
   * colour per station and segment; faces turned up / to the pitch / out as the profile goes.
   */
  const sweep = (slot: string, prof: [number, number][], col: (q: St, k: number) => V3 | null, only?: (q: St, i: number) => boolean) => {
    const groups = new Map<string, { c: V3; pos: number[] }>();
    for (let i = 0; i < N; i++) {
      if (only && !only(st[i], i)) continue;
      const j = i + 1;
      for (let k = 0; k < prof.length - 1; k++) {
        const cc = col(st[i], k);
        if (!cc) continue;
        const [s0, y0] = prof[k],
          [s1, y1] = prof[k + 1];
        const a = P(i, s0, y0),
          b = P(j, s0, y0),
          cq = P(j, s1, y1),
          d = P(i, s1, y1);
        // the wanted normal: up for a tread, to the pitch for a riser, out for a facade
        const q = st[i];
        const len = Math.hypot(q.dx, q.dz) || 1;
        const want = new THREE.Vector3(-(y1 - y0) * (q.dx / len), s1 - s0, -(y1 - y0) * (q.dz / len));
        const e1 = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
          e2 = new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
        const n = e1.clone().cross(e2);
        const flip = n.dot(want) < 0;
        const key = cc.join(",");
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { c: cc, pos: [] }));
        const tri = flip ? [a, d, cq, a, cq, b] : [a, b, cq, a, cq, d];
        for (const v of tri) g.pos.push(v[0], v[1], v[2]);
      }
    }
    for (const g of groups.values()) {
      if (!g.pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
      geo.computeVertexNormals();
      K.add(slot, geo, g.c);
    }
  };
  const sector = (q: St) => Math.floor((q.u + 6) / 30);
  const seatCol = (q: St, row: number, upper: boolean): V3 => {
    if (q.side === "N") return upper ? (sector(q) % 2 ? black : gold) : sector(q) % 2 ? gold : dark1;
    if (q.side === "W" || q.side === "E") return upper ? (Math.floor((q.u + 7) / 15) % 2 ? gold : black) : row % 4 === 1 ? gold : black;
    if (q.side === "S") return sector(q) % 2 ? (upper ? gold : black) : upper ? black : gold;
    return row % 3 === 1 ? goldDeep : dark1;
  };
  const aisle = (q: St) => (q.side === "C" ? false : (((q.u + 6) % 30) + 30) % 30 < 3);
  // ---- the pitch: mowing stripes, the run-off, the lines, the goals
  const L = hx - 5,
    Wd = hz - 5;
  K.span("lm.Grass004", X(cx - hx - 2), -0.02, Z(cz - hz - 2), X(cx + hx + 2), m(1), Z(cz + hz + 2), hex("#3a7a3a"));
  for (let x = -L, i = 0; x < L; x += 10, i++) if (i % 2) K.span("lm.Grass004", X(cx + x), m(1), Z(cz - Wd), X(cx + Math.min(L, x + 10)), m(1) + 0.01, Z(cz + Wd), hex("#4c9a48"));
  {
    const yl = m(1) + 0.02,
      lw = 0.12;
    const line = (x0: number, z0: number, x1: number, z1: number) => K.span("lm.paint", Math.min(X(x0), X(x1)) - lw / 2, yl, Math.min(Z(z0), Z(z1)) - lw / 2, Math.max(X(x0), X(x1)) + lw / 2, yl + 0.01, Math.max(Z(z0), Z(z1)) + lw / 2, hex("#f4f4f0"));
    line(cx - L, cz - Wd, cx + L, cz - Wd);
    line(cx - L, cz + Wd, cx + L, cz + Wd);
    line(cx - L, cz - Wd, cx - L, cz + Wd);
    line(cx + L, cz - Wd, cx + L, cz + Wd);
    line(cx, cz - Wd, cx, cz + Wd);
    const pb = Math.round(L * 0.157),
      pw = Math.round(Wd * 0.59),
      gb = Math.round(L * 0.055),
      gw = Math.round(Wd * 0.27);
    for (const sx of [-1, 1]) {
      line(cx + sx * (L - pb), cz - pw, cx + sx * (L - pb), cz + pw);
      line(cx + sx * L, cz - pw, cx + sx * (L - pb), cz - pw);
      line(cx + sx * L, cz + pw, cx + sx * (L - pb), cz + pw);
      line(cx + sx * (L - gb), cz - gw, cx + sx * (L - gb), cz + gw);
      line(cx + sx * L, cz - gw, cx + sx * (L - gb), cz - gw);
      line(cx + sx * L, cz + gw, cx + sx * (L - gb), cz + gw);
      // the goal: posts, crossbar, the net's frame
      const gx = X(cx + sx * L),
        gz0 = Z(cz - 7),
        gz1 = Z(cz + 7);
      const wht = hex("#f8f8f8");
      for (const gz of [gz0, gz1]) K.cyl("lm.paint", gx, m(1), gz, 0.07, 0.07, 2.44, 8, wht);
      K.rod("lm.paint", [gx, m(1) + 2.44, gz0], [gx, m(1) + 2.44, gz1], 0.07, wht, 8);
      if (!lod) {
        const bx = gx + sx * 1.6;
        for (const gz of [gz0, gz1]) K.rod("lm.paint", [gx, m(1) + 2.44, gz], [bx, m(1), gz], 0.03, hex("#e0e0e0"));
        for (let t = 0; t <= 8; t++) {
          const gz = gz0 + ((gz1 - gz0) * t) / 8;
          K.rod("lm.paint", [gx, m(1) + 2.44, gz], [bx, m(1), gz], 0.012, hex("#e8e8e8"), 3);
        }
      }
    }
    const ring = new THREE.RingGeometry(m(11) - lw / 2, m(11) + lw / 2, K.seg(48));
    ring.rotateX(-Math.PI / 2);
    ring.translate(X(cx), yl + 0.01, Z(cz));
    K.add("lm.paint", ring, hex("#f4f4f0"));
  }
  // ---- the bowl
  // the LED boards round the pitch, the track
  sweep("lm.glow", [
    [1.2, 1],
    [1.2, 4],
  ], (q) => [[1, 0.75, 0.16], [0.24, 0.78, 0.69], [1, 0.31, 0.63], [0.35, 0.66, 1]][Math.floor((((q.u % 64) + 64) % 64) / 16)] as V3);
  sweep("lm.dark", [
    [1.2, 4],
    [1.6, 4],
    [1.6, 1],
  ], () => black);
  sweep("lm.paint", [
    [1.6, 1],
    [2.4, 1],
    [2.4, 2],
    [4, 2],
  ], () => hex("#7a3a34"));
  // the lower tier: nine rows, two deep, one high; the upper's overhang; seven rows two high; the top concourse; the roof's wall
  const prof: [number, number][] = [[4, 2]];
  for (let i = 0; i < 9; i++) prof.push([4 + 2 * i, 4 + i], [4 + 2 * i + 2, 4 + i]);
  prof.push([22, 12], [22, 13], [25, 13], [25, 21]);
  sweep("lm.Concrete012", prof, () => conc);
  sweep("lm.Concrete012", [
    [25, 21],
    [20, 21],
    [20, 25],
    [26, 25],
  ], () => shadeC(conc, 0.85));
  const up: [number, number][] = [[26, 25]];
  for (let j = 0; j < 7; j++) up.push([26 + 2 * j, 25 + 2 * j], [26 + 2 * j + 2, 25 + 2 * j]);
  up.push([40, 42], [43.5, 42], [43.5, ROOF], [45, ROOF]);
  sweep("lm.Concrete012", up, () => conc);
  // the seats: a pan and a back on the back half of each row (the crowd sits on them), aisles left bare
  for (let i = 0; i < 9; i++) {
    const s0 = 5 + 2 * i,
      y = 4 + i;
    sweep("lm.plastic", [
      [s0, y],
      [s0, y + 0.8],
      [s0 + 0.55, y + 0.8],
      [s0 + 0.7, y + 1.7],
      [s0 + 0.9, y + 1.7],
      [s0 + 0.9, y],
    ], (q) => seatCol(q, i, false), (q) => !aisle(q));
  }
  for (let j = 0; j < 7; j++) {
    const s0 = 27 + 2 * j,
      y = 25 + 2 * j;
    sweep("lm.plastic", [
      [s0, y],
      [s0, y + 0.8],
      [s0 + 0.55, y + 0.8],
      [s0 + 0.7, y + 1.7],
      [s0 + 0.9, y + 1.7],
      [s0 + 0.9, y],
    ], (q) => seatCol(q, j, true), (q) => !aisle(q));
  }
  // the upper tier's LED ribbon and its glass parapet
  sweep("lm.glow", [
    [19.9, 22],
    [19.9, 24],
  ], (q) => (q.side === "C" ? null : ((((q.u % 48) + 48) % 48) < 24 ? gold : ([0.24, 0.79, 0.69] as V3))));
  sweep("lm.glass", [
    [20.2, 25],
    [20.2, 27.6],
  ], () => hex("#b8c8d8"));
  // ---- the curtain wall: plinth, glass between steel ribs, three gold bands, the cornice; the main gate left open
  const fzF = cz + hz + FO;
  const gx0 = cx - 26,
    gx1 = cx + 26;
  const gate = (q: St) => q.side === "S" && cx + q.bx > gx0 - 1 && cx + q.bx < gx1;
  sweep("lm.glass", [
    [45, ROOF - 3],
    [45, 18],
  ], () => hex("#5a6a80"));
  sweep("lm.glass", [
    [45, 18],
    [45, 5],
  ], () => hex("#5a6a80"), (q) => !gate(q));
  sweep("lm.Concrete012", [
    [45.2, 5],
    [45.2, 0],
  ], () => hex("#4a4650"), (q) => !gate(q));
  for (const y of [16, 30, 44])
    sweep("lm.glow", [
      [45.35, y + 1],
      [45.35, y],
    ], () => gold, y === 16 ? (q) => !gate(q) : undefined);
  sweep("lm.dark", [
    [45.4, ROOF + 1],
    [45.4, ROOF - 3],
  ], () => hex("#3a3c44"));
  // ribs every few stations
  st.forEach((q, i) => {
    if (i % (lod ? 2 : 3)) return;
    if (gate(q)) return;
    const a = P(i, 45.5, 5),
      b = P(i, 45.5, ROOF - 3);
    K.beam("lm.chrome", a, b, 0.3, steel, 0.4);
  });
  // ---- the roof: the membrane outside, the open lattice over the stands, the floodlights round the edge
  sweep("lm.paint", [
    [47, ROOF],
    [30, ROOF],
    [30, ROOF + 2],
    [47, ROOF + 3],
    [47, ROOF],
  ], (_q, k) => (k === 2 ? hex("#e8e8ec") : hex("#a8aab0")));
  sweep("lm.chrome", [
    [RI, ROOF],
    [RI, ROOF + 1.2],
  ], () => steel);
  sweep("lm.glow", [
    [RI + 0.6, ROOF - 0.05],
    [RI - 0.2, ROOF - 0.05],
  ], () => hex("#e4f0ff"));
  st.forEach((q, i) => {
    if (i % (lod ? 2 : 3)) return;
    // a radial truss from the inner edge to the facade: two chords and the web
    const top = (s: number) => P(i, s, ROOF + 1.2 + ((s - RI) / (47 - RI)) * 1.8);
    K.beam("lm.chrome", P(i, RI, ROOF), P(i, 47, ROOF), 0.22, steel);
    K.beam("lm.chrome", top(RI), top(47), 0.22, steel);
    if (!lod)
      for (let s = RI; s < 30; s += 4) {
        K.beam("lm.chrome", P(i, s, ROOF), top(s + 4), 0.1, steel);
        K.beam("lm.chrome", P(i, s + 4, ROOF), top(s + 4), 0.1, steel);
      }
  });
  if (!lod)
    for (const s of [16, 23])
      for (let i = 0; i < N; i++) K.beam("lm.chrome", P(i, s, ROOF + 0.6), P(i + 1, s, ROOF + 0.6), 0.14, steel);
  // ---- the jumbotrons at the goal ends: the face, its frame, the truss behind, the legs
  {
    const SW = 48,
      SH = 22,
      SY0 = ROOF + 4;
    for (const sgn of [-1, 1]) {
      const fx = Math.round(cx + sgn * (hx + (RI + 1) / AX));
      const face = X(sgn < 0 ? fx + 1 : fx);
      const z0 = Z(cz - SW / 2),
        z1 = Z(cz + SW / 2);
      const back = face + sgn * 0.6;
      K.span("lm.dark", Math.min(face, back), m(SY0 - 2), z0 - 0.7, Math.max(face, back), m(SY0 + SH + 3), z1 + 0.7, black);
      K.span("lm.glow", Math.min(face, face + sgn * 0.02), m(SY0 + SH + 1), z0 + 1.3, Math.max(face, face + sgn * 0.02) + 0.01, m(SY0 + SH + 2), z1 - 1.3, gold);
      for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 4) {
        K.beam("lm.chrome", [back + sgn * 1.3, m(ROOF + 2), z], [back + sgn * 1.3, m(SY0 + SH + 3), z], 0.25, steel);
        K.beam("lm.chrome", [back, m(SY0 - 2), z], [back + sgn * 1.3, m(ROOF + 2), z], 0.2, steel);
        K.beam("lm.chrome", [back + sgn * 1.3, m(ROOF + 2), z], [back + sgn * 1.3, m(ROOF), z], 0.3, steel);
      }
    }
  }
  // ---- the floodlight masts: lattice pylons with lamp banks; the back two on spiral ramp towers
  const mastTop = m(86);
  const mast = (mx: number, mz: number, y0: number) => {
    const w = m(4) / 2;
    const corners: [number, number][] = [
      [-w, -w],
      [w, -w],
      [w, w],
      [-w, w],
    ];
    for (const [dx, dz] of corners) K.beam("lm.chrome", [mx + dx, y0, mz + dz], [mx + dx, mastTop, mz + dz], 0.16, steel);
    if (!lod)
      for (let y = y0; y < mastTop - 1.5; y += 2) {
        for (let k2 = 0; k2 < 4; k2++) {
          const [ax, az] = corners[k2],
            [bx, bzz] = corners[(k2 + 1) % 4];
          K.beam("lm.chrome", [mx + ax, y, mz + az], [mx + bx, y + 2, mz + bzz], 0.06, steel);
          K.beam("lm.chrome", [mx + ax, y + 2, mz + az], [mx + bx, y + 2, mz + bzz], 0.08, steel);
        }
      }
    // the head: a frame of lamps tilted to the pitch
    const hx2 = X(cx) - mx,
      hz2 = Z(cz) - mz;
    const ry = Math.atan2(hx2, hz2);
    K.box("lm.dark", mx, mastTop, mz, 4.6, 2.8, 0.5, black, ry);
    if (!lod)
      for (let a = -1.5; a <= 1.5; a += 1)
        for (let b = 0; b < 3; b++) {
          const [lx, lz] = onFace(mx, mz, ry, a * 1.1, 0.28);
          K.box("lm.glow.night", lx, mastTop + 0.3 + b * 0.85, lz, 0.8, 0.6, 0.06, hex("#f0f6ff"), ry);
        }
  };
  const diag = (sx: number, sz: number, sv: number): [number, number] => [cx + sx * (hx + sv / Math.SQRT2 / AX), cz + sz * (hz + sv / Math.SQRT2)];
  for (const sx of [-1, 1]) {
    // a spiral ramp tower at each back corner
    const [ax, az] = diag(sx, -1, 54);
    const tx = X(Math.round(ax)),
      tz = Z(Math.round(az));
    K.cyl("lm.Concrete012", tx, 0, tz, m(4.5), m(4.5), m(ROOF + 2), 16, hex("#a8a4a8"));
    const R0 = m(4.5),
      R1 = m(10),
      pitch = m(28);
    const turns = m(ROOF) / pitch;
    const steps = Math.round(turns * (lod ? 12 : 28));
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * turns * Math.PI * 2,
        a1 = ((i + 1) / steps) * turns * Math.PI * 2;
      const y0 = (i / steps) * m(ROOF),
        y1 = ((i + 1) / steps) * m(ROOF);
      const pts = [
        [R0, a0, y0],
        [R1, a0, y0],
        [R1, a1, y1],
        [R0, a1, y1],
      ].map(([r, a, y]) => [tx + Math.cos(a) * r, y, tz + Math.sin(a) * r]);
      const g = new THREE.BufferGeometry();
      const pp = [pts[0], pts[2], pts[1], pts[0], pts[3], pts[2]].flat();
      // and the slab's underside
      pp.push(...[pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]].flat().map((v, k) => (k % 3 === 1 ? v - 0.3 : v)));
      g.setAttribute("position", new THREE.Float32BufferAttribute(pp, 3));
      g.computeVertexNormals();
      K.add("lm.Concrete012", g, hex("#d0ccc8"));
      if (!lod && i % 2 === 0) K.box("lm.glow", tx + Math.cos(a0) * R1, y0 + 0.2, tz + Math.sin(a0) * R1, 0.3, 0.9, 0.3, gold);
    }
    K.cyl("lm.chrome", tx, m(ROOF), tz, R1 + 0.2, R1 + 0.2, m(2), 20, steel);
    mast(tx, tz, m(ROOF + 2));
    // a mast on a plinth at each front corner
    const [fx, fz] = diag(sx, 1, 53).map(Math.round);
    const px = X(fx + 2),
      pz = Z(fz + 2);
    K.box("lm.Concrete012", px, 0, pz, m(12), m(3), m(12), hex("#4a4656"));
    K.box("lm.Concrete012", px, m(3), pz, m(10), m(1), m(10), conc);
    mast(px, pz, m(4));
  }
  // ---- the front: the main gate's glass wall and canopy, the name board, the turnstiles, the booths
  {
    const gz = Z(fzF);
    const x0 = X(gx0),
      x1 = X(gx1);
    K.span("lm.glass", x0, 0, gz - m(7), x1, m(18), gz - m(6.6), hex("#2a3448"));
    for (let x = gx0 + 2; x < gx1 - 3; x += 12) K.span("lm.glow", X(x), 0, gz - m(6.6), X(x + 6), m(11), gz - m(6.5), hex("#ffcf8a"));
    for (let x = gx0; x <= gx1; x += 6) K.span("lm.chrome", X(x) - 0.12, 0, gz - m(7), X(x) + 0.12, m(18), gz - m(5), steel);
    K.span("lm.dark", x0, m(17), gz - m(7), x1, m(18), gz + 0.1, hex("#2a2833"));
    for (let x = gx0 + 3; x < gx1; x += 8) K.span("lm.glow", X(x), m(17) - 0.02, gz - m(5), X(x + 3), m(17), gz - m(1), hex("#fff0d0"));
    for (const [a, b2] of [
      [gx0 - 2, gx0],
      [gx1, gx1 + 2],
    ])
      K.span("lm.Concrete012", X(a), 0, gz - m(7), X(b2), m(20), gz + m(1), hex("#3a3640"));
    // (the floor of the recess)
    K.span("lm.PavingStones111", x0, -0.02, gz - m(7), x1, 0.03, gz, hex("#b8b4c0"));
    // the name board and its gold rules, the ZEC roundels
    K.span("lm.dark", X(cx - 70), m(19), gz - m(1), X(cx + 70), m(34), gz + m(1), black);
    for (const y of [19, 33]) K.span("lm.glow", X(cx - 70), m(y), gz + m(1), X(cx + 70), m(y + 1), gz + m(1) + 0.08, gold);
    for (const sx of [-1, 1]) {
      const rx = X(cx + sx * 80);
      const disc = new THREE.CylinderGeometry(m(8.6), m(8.6), 0.2, K.seg(32));
      disc.rotateX(Math.PI / 2);
      disc.translate(rx, m(27), gz + 0.2);
      K.add("lm.glow", disc, gold);
      const zr = m(5);
      const zy = m(27);
      K.box("lm.dark", rx, zy + zr * 0.62, gz + 0.32, zr * 1.8, zr * 0.36, 0.08, black);
      K.box("lm.dark", rx, zy - zr * 0.98, gz + 0.32, zr * 1.8, zr * 0.36, 0.08, black);
      K.beam("lm.dark", [rx - zr * 0.75, zy - zr * 0.75, gz + 0.36], [rx + zr * 0.75, zy + zr * 0.75, gz + 0.36], zr * 0.42, black, 0.08);
      for (const sy of [-1, 1]) K.box("lm.dark", rx, zy + sy * zr * 1.2 - (sy < 0 ? zr * 0.25 : 0), gz + 0.32, zr * 0.3, zr * 0.25, 0.08, black);
    }
    // the turnstiles in a line, the gate's black frame with its gold band
    const tz = fzF + 6;
    for (let x = gx0 + 1; x < gx1 - 1; x += 5) {
      K.span("lm.chrome", X(x), 0, Z(tz), X(x + 2), m(4), Z(tz + 3), hex("#a8acb4"));
      if (!lod) for (let a = 0; a < 3; a++) K.beam("lm.chrome", [X(x + 2), m(3.2), Z(tz + 1.5)], [X(x + 3.6), m(3.2) + (a - 1) * 0.18, Z(tz + 1.5) + (a - 1) * 0.2], 0.05, steel);
    }
    for (const x of [gx0 - 1, gx1]) K.span("lm.dark", X(x), 0, Z(tz + 1), X(x + 1), m(16), Z(tz + 2), black);
    K.span("lm.dark", X(gx0 - 1), m(14), Z(tz + 1), X(gx1 + 1), m(16), Z(tz + 2), black);
    K.span("lm.glow", X(gx0 + 4), m(14), Z(tz + 2), X(gx1 - 4), m(16), Z(tz + 2) + 0.06, gold);
    // the ticket booths
    for (const bx of [gx0 - 22, gx1 + 10]) {
      K.span("lm.Concrete012", X(bx), 0, Z(tz - 2), X(bx + 12), m(11), Z(tz + 6), hex("#d8d4cc"));
      K.span("lm.dark", X(bx - 1), m(11), Z(tz - 3), X(bx + 13), m(13), Z(tz + 8), black);
      K.span("lm.glow", X(bx - 1), m(12), Z(tz + 8), X(bx + 13), m(13), Z(tz + 8) + 0.06, gold);
      for (let x = bx + 1; x < bx + 11; x += 4) {
        K.span("lm.glass", X(x), m(4), Z(tz + 6) - 0.02, X(x + 3), m(9), Z(tz + 6) + 0.02, hex("#ffd8a0"));
        K.span("lm.chrome", X(x), m(3) + 0.1, Z(tz + 6), X(x + 3), m(3) + 0.15, Z(tz + 6) + 0.5, steel);
      }
    }
    // the queue's rails in front of the turnstiles
    if (!lod)
      for (let x = gx0; x < gx1; x += 10) {
        K.rod("lm.chrome", [X(x), m(2.5), Z(tz + 5)], [X(x), m(2.5), Z(tz + 12)], 0.04, steel);
        for (const z of [tz + 5, tz + 8.5, tz + 12]) K.cyl("lm.chrome", X(x), 0, Z(z), 0.04, 0.04, m(2.5), 6, steel);
      }
    // ---- the plaza: paving, the gold kerb line
    K.box("lm.PavingStones111", 0, -0.06, 0, F.w, 0.08, F.d, hex("#b8b4c0"));
    K.span("lm.glow", -F.w / 2 + 0.3, 0, Z(D - 2), F.w / 2 - 0.3, 0.05, Z(D - 1), goldDeep);
    // the giant ZEC coin on edge on its plinth, a football at its foot
    const sx0 = 40,
      sz0 = Math.min(D - 16, fzF + 6);
    const cxp = X(sx0),
      czp = Z(sz0);
    K.box("lm.Bricks008", cxp, 0, czp, m(18), m(3), m(10), hex("#6a6474"));
    K.box("lm.Bricks008", cxp, m(3), czp, m(14), m(6), m(6), hex("#8a8494"));
    const coin = new THREE.CylinderGeometry(m(12), m(12), m(2), K.seg(40));
    coin.rotateX(Math.PI / 2);
    coin.translate(cxp, m(21.5), czp);
    K.add("lm.chrome", coin, gold);
    const rim = new THREE.TorusGeometry(m(11.3), 0.16, 6, K.seg(40));
    for (const dz of [-m(1), m(1)]) {
      const r2 = rim.clone();
      r2.translate(cxp, m(21.5), czp + dz);
      K.add("lm.Metal024.metal", r2, goldDeep);
    }
    rim.dispose();
    {
      const zr = m(6.5),
        zy = m(21.5),
        zz = czp + m(1) + 0.08;
      K.box("lm.Metal024.metal", cxp, zy + zr * 0.62, zz, zr * 2, zr * 0.38, 0.16, goldDeep);
      K.box("lm.Metal024.metal", cxp, zy - zr, zz, zr * 2, zr * 0.38, 0.16, goldDeep);
      K.beam("lm.Metal024.metal", [cxp - zr * 0.8, zy - zr * 0.78, zz], [cxp + zr * 0.8, zy + zr * 0.78, zz], zr * 0.4, goldDeep, 0.16);
      for (const sy of [-1, 1]) K.box("lm.Metal024.metal", cxp, zy + (sy > 0 ? zr * 1.0 : -zr * 1.4), zz, zr * 0.3, zr * 0.4, 0.16, goldDeep);
    }
    K.blob("lm.plastic", X(sx0 + 11), m(12), czp, m(3), m(3), m(3), hex("#f4f4f4"), 14);
    // the food carts and parasols on the right
    const cxr = W - 46;
    for (const [x, z, cloth] of [
      [cxr - 14, sz0 - 6, "#c0302a"],
      [cxr + 6, sz0 - 2, "#2f6aa8"],
    ] as [number, number, string][]) {
      const x0c = X(x),
        z0c = Z(z);
      K.span("lm.paint", x0c, m(1), z0c, X(x + 10), m(6), Z(z + 5), hex("#d8d4cc"));
      for (const wx of [x0c + 0.4, X(x + 10) - 0.4]) {
        const wh = new THREE.CylinderGeometry(0.33, 0.33, 0.14, K.seg(12));
        wh.rotateX(Math.PI / 2);
        wh.translate(wx, 0.33, Z(z) - 0.05);
        K.add("lm.dark", wh, black);
      }
      for (const px of [x0c + 0.1, X(x + 10) - 0.1]) K.cyl("lm.chrome", px, m(6), z0c + 0.2, 0.04, 0.04, m(7), 6, steel);
      for (let i = 0; i < 6; i++) K.beam("lm.paint", [x0c + ((X(x + 10) - x0c) * (i + 0.5)) / 6, m(13.2), z0c - 0.3], [x0c + ((X(x + 10) - x0c) * (i + 0.5)) / 6, m(12.8), Z(z + 7)], (X(x + 10) - x0c) / 6, i % 2 ? hex(cloth) : hex("#ece8e0"), 0.06);
      K.box("lm.glow.night", (x0c + X(x + 10)) / 2, m(7), Z(z + 5) + 0.05, 1, 0.5, 0.1, hex("#ffd08a"));
    }
    for (const [ux, uz, col] of [
      [cxr - 6, sz0 + 6, "#f4b728"],
      [cxr + 14, sz0 + 8, "#c0302a"],
    ] as [number, number, string][]) {
      const x = X(ux),
        z = Z(uz);
      K.cyl("lm.chrome", x, 0, z, 0.04, 0.04, m(10), 6, steel);
      for (let i = 0; i < 8; i++) K.lathe("lm.paint", [[m(6), 0], [0.05, 0.6]], x, m(10) - 0.6, z, 2, i % 2 ? hex(col) : hex("#ece8e0"), (i / 8) * Math.PI * 2, Math.PI / 4);
      K.cyl("lm.paint", x, m(3) - 0.06, z, m(3), m(3), 0.06, 16, hex("#d8d4cc"));
    }
  }
}

// ---- THE NEEDLE (a Burj-like supertall) ----------------------------------------------------------------

/**
 * The supertall on its plaza: the Y plan of three wings round a core, each wing stepping back on its
 * own beat so the setbacks spiral up (the Burj), skinned in silvery glass between vertical steel
 * fins, a gold LED line up each wing's nose; the observation deck's balcony with its glass
 * balustrade; the crown with its sign panels, the glass cone and the steel spire to the beacon. At its
 * foot: the stone skirt, the gold-gridded glass lobby with its canopy and red carpet, the fountain
 * pools with their jets, palms, lamps and benches. The LED screens are hung on it by the city
 * (scene/ledtower.ts finds the facade by ray).
 */
function needle(c: Ctx) {
  const { K, F, lod } = c;
  const m = (n: number) => F.m(n);
  const W = F.W,
    D = F.D;
  const X = (v: number) => F.p([v, 0, 0])[0],
    Z = (v: number) => F.p([0, 0, v])[2];
  const S = 1.7;
  const H = Math.round(492 * S);
  const cxv = W / 2,
    czv = D / 2 - 3;
  const cx = X(cxv),
    cz = Z(czv);
  const M = Math.round((2.6 * 6) / 2);
  const wingA = [Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6];
  const wdir = wingA.map((a) => [Math.cos(a), Math.sin(a)] as [number, number]);
  const top = Math.round(360 * S);
  const L0 = 29;
  const wingLen = (i: number, y: number) => {
    let L = L0;
    for (let s = (34 + i * 26) * S; s < y; s += 78 * S) L -= 4.2;
    return L;
  };
  const halfW = (y: number) => 7.2 - (y / top) * 2.6;
  const C300 = 300 * S;
  const coreR = (y: number) => (y < C300 ? 9.5 - (y / C300) * 2.5 : 7 - ((y - C300) / (top - C300)) * 3.2);
  const deckY = Math.round(246 * S);
  const glass = hex("#a8bcd0"),
    fin = hex("#c8ced6"),
    gold = hex("#f4b728"),
    pale = hex("#e4e2dc");
  // ---- the plaza: granite with gold inlays radiating from the tower
  K.box("lm.PavingStones128", 0, -0.06, 0, F.w, 0.08, F.d, hex("#d2ccc2"));
  // (between the wings, from the core's foot out to a pace short of the lot's edge: never past it —
  // out there they lay on the pavement round the lot)
  if (!lod)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const ca = Math.cos(a),
        sa = Math.sin(a);
      if (wingA.some((w) => Math.abs(Math.atan2(Math.sin(a - w), Math.cos(a - w))) < 0.45)) continue;
      // (the plaza, the lot: F.w × F.d centred on the frame's origin)
      const edge = Math.min(Math.abs(ca) > 1e-6 ? ((ca > 0 ? 1 : -1) * (F.w / 2) - cx) / ca : Infinity, Math.abs(sa) > 1e-6 ? ((sa > 0 ? 1 : -1) * (F.d / 2) - cz) / sa : Infinity);
      const r0 = m(coreR(1)) + 1.4,
        r1 = edge - 0.9;
      if (r1 - r0 < 1) continue;
      K.beam("lm.glow", [cx + ca * r0, 0.025, cz + sa * r0], [cx + ca * r1, 0.025, cz + sa * r1], 0.08, gold, 0.02);
    }
  // ---- the breakpoints: every height where a wing steps back (or the width does, a little)
  const ys = new Set<number>([1, 20, deckY, deckY + 18, top]);
  for (let i = 0; i < 3; i++) for (let s = (34 + i * 26) * S; s < top; s += 78 * S) ys.add(Math.ceil(s));
  for (let y = 60; y < top; y += lod ? 120 : 60) ys.add(y);
  const bands = [...ys].filter((y) => y >= 1 && y <= top).sort((a, b) => a - b);
  /** A wing's plan at height y (metres in the lot): a slab from the core out to its rounded nose. */
  const wingShape = (i: number, y: number, grow = 0) => {
    const L = m(wingLen(i, y)) + grow,
      hw = m(halfW(y)) + grow;
    const [ux, uz] = wdir[i];
    const P = (u: number, v: number): [number, number] => [cx + u * ux - v * uz, cz + u * uz + v * ux];
    const pts: [number, number][] = [P(0, -hw), P(L - hw, -hw)];
    const n = lod ? 4 : 10;
    for (let k = 1; k < n; k++) {
      const a = -Math.PI / 2 + (Math.PI * k) / n;
      pts.push(P(L - hw + Math.cos(a) * hw, Math.sin(a) * hw));
    }
    pts.push(P(L - hw, hw), P(0, hw));
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], -pts[0][1]);
    for (const p of pts.slice(1)) sh.lineTo(p[0], -p[1]);
    sh.lineTo(pts[0][0], -pts[0][1]);
    return { sh, pts, L, hw };
  };
  for (let b = 0; b < bands.length - 1; b++) {
    const y0 = bands[b],
      y1 = bands[b + 1];
    const deck = y0 >= deckY && y0 < deckY + 18;
    // the core
    K.cyl("lm.glass", cx, m(y0), cz, m(coreR(y0)), m(coreR(y1)), m(y1 - y0), 16, glass);
    for (let i = 0; i < 3; i++) {
      if (wingLen(i, y0) < coreR(y0) + 1) continue;
      const { sh, pts, L } = wingShape(i, y0);
      K.slab("lm.glass", sh, m(y0), m(y1 - y0), deck ? hex("#e8d8b8") : glass);
      // the roof of a setback: a pale terrace, its gold edge light
      const above = wingLen(i, y1);
      if (above < wingLen(i, y0) - 0.1) {
        K.slab("lm.Concrete012", sh, m(y1) - 0.05, 0.12, pale);
        if (!lod) K.slab("lm.glow", wingShape(i, y0, 0.03).sh, m(y1) - 0.2, 0.12, gold);
      }
      if (lod) continue;
      // the fins along both long sides and round the nose, the nose's gold LED line
      const step = 1.6;
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, az] = pts[k],
          [bx, bz] = pts[k + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.round(len / step));
        const ox = (bz - az) / len,
          oz = -(bx - ax) / len;
        // (outward: away from the wing's axis)
        const midx = (ax + bx) / 2 - cx,
          midz = (az + bz) / 2 - cz;
        const sgn = ox * midx + oz * midz > 0 ? 1 : -1;
        for (let t = 0; t < n; t++) {
          const fx = ax + ((bx - ax) * t) / n + sgn * ox * 0.18,
            fz = az + ((bz - az) * t) / n + sgn * oz * 0.18;
          K.beam("lm.chrome", [fx, m(y0), fz], [fx, m(y1), fz], 0.14, fin, 0.36);
        }
      }
      const tip: [number, number] = [cx + wdir[i][0] * (L + 0.05), cz + wdir[i][1] * (L + 0.05)];
      K.beam("lm.glow", [tip[0], m(y0), tip[1]], [tip[0], m(y1), tip[1]], 0.18, gold, 0.18);
    }
  }
  // ---- the observation deck's balcony: a slab round the plan, the glass balustrade, gold neon under its lip
  for (let i = 0; i < 3; i++) {
    const g = wingShape(i, deckY, 1.3);
    K.slab("lm.Concrete012", g.sh, m(deckY) - 0.3, 0.3, pale);
    K.slab("lm.glow", wingShape(i, deckY, 1.32).sh, m(deckY) - 0.42, 0.1, gold);
    if (lod) continue;
    for (let k = 0; k < g.pts.length - 1; k++) {
      const [ax, az] = g.pts[k],
        [bx, bz] = g.pts[k + 1];
      if (k === 0 || k === g.pts.length - 2) continue;
      K.beam("lm.glass", [(ax + bx) / 2, m(deckY), (az + bz) / 2], [(ax + bx) / 2, m(deckY) + 1.1, (az + bz) / 2], Math.hypot(bx - ax, bz - az), hex("#d8e6f0"), 0.04);
    }
  }
  // (the balustrade's panels turned along their edges)
  // ---- the crown: rings over glass, the sign panels, the cone and the spire
  const crownY = top,
    crownTop = crownY + 34;
  K.cyl("lm.glass", cx, m(crownY - 6), cz, m(7.2), m(7.2 - 34 * 0.07), m(40), 20, glass);
  if (!lod) for (let y = crownY - 6; y < crownTop; y += 8) K.cyl("lm.chrome", cx, m(y), cz, m(7.4 - Math.max(0, y - crownY) * 0.07), m(7.4 - Math.max(0, y - crownY) * 0.07), 0.3, 20, fin);
  {
    const pzv = Math.round(czv + 7.4),
      pxv = Math.round(cxv + 7.4);
    const P5 = 5;
    K.span("lm.dark", X(Math.round(cxv - P5)), m(crownY + 4), Z(pzv - 3), X(Math.round(cxv + P5)), m(crownY + 20), Z(pzv), "#1a1820");
    K.span("lm.dark", X(pxv - 3), m(crownY + 4), Z(Math.round(czv - P5)), X(pxv), m(crownY + 20), Z(Math.round(czv + P5)), "#1a1820");
    for (const y of [3, 20]) {
      K.span("lm.glow", X(Math.round(cxv - P5) - 1), m(crownY + y), Z(pzv - 1), X(Math.round(cxv + P5) + 1), m(crownY + y + 1), Z(pzv + 1), gold);
      K.span("lm.glow", X(pxv - 1), m(crownY + y), Z(Math.round(czv - P5) - 1), X(pxv + 1), m(crownY + y + 1), Z(Math.round(czv + P5) + 1), gold);
    }
  }
  K.span("lm.Concrete012", cx - m(6), m(crownTop - 1), cz - m(6), cx + m(6), m(crownTop), cz + m(6), hex("#c4cad4"));
  K.lathe("lm.glass", [[m(4.6), 0], [m(4.6 - 22 * 0.12), m(22)]], cx, m(crownTop), cz, 16, glass);
  if (!lod) for (let y = 0; y < 22; y += 5) K.cyl("lm.chrome", cx, m(crownTop + y), cz, m(4.7 - y * 0.12), m(4.7 - y * 0.12), 0.2, 16, fin);
  const spireTop = H - 6;
  K.lathe("lm.chrome", [[m(3), 0], [m(2), m(spireTop - crownTop) * 0.35], [m(1), m(spireTop - crownTop) * 0.7], [0.12, m(spireTop - crownTop)]], cx, m(crownTop), cz, 8, hex("#b8c0cc"));
  K.blob("lm.glow", cx, m(spireTop) + 0.3, cz, 0.35, 0.35, 0.35, hex("#ff3030"), 8);
  // ---- the foot: the stone skirt round the plan, the lobby on the front wing, the canopy, the carpet
  for (let i = 0; i < 3; i++) K.slab("lm.Bricks008", wingShape(i, 1, 0.5).sh, 0, m(20), hex("#d8d0c4"));
  K.cyl("lm.Bricks008", cx, 0, cz, m(coreR(1)) + 0.5, m(coreR(1)) + 0.5, m(20), 16, hex("#d8d0c4"));
  const frontTip = Math.round(czv + L0);
  const lx0 = Math.round(cxv - 10),
    lx1 = Math.round(cxv + 10);
  const lz1 = frontTip + 3;
  const lobbyH = m(24);
  {
    const x0 = X(lx0),
      x1 = X(lx1),
      z0 = Z(frontTip - 8),
      z1 = Z(lz1);
    // (no lit box inside it: behind opaque glass it showed only where the lot's edge pressed the two
    // fronts into one plane — a brown slab fighting the glass, taken for a half-drawn board)
    K.span("lm.glass", x0, 0, z0, x1, lobbyH, z1, hex("#d8e4ec"));
    if (!lod) {
      for (let x = lx0; x <= lx1; x += 5) K.span("lm.chrome", X(x) - 0.06, 0, z1 - 0.02, X(x) + 0.06, lobbyH, z1 + 0.08, hex("#c8a860"));
      for (let y = 6; y < 24; y += 6) K.span("lm.chrome", x0, m(y) - 0.06, z1 - 0.02, x1, m(y) + 0.06, z1 + 0.08, hex("#c8a860"));
    }
    K.span("lm.Concrete012", x0 - 0.2, lobbyH, z0 - 0.2, x1 + 0.2, lobbyH + 0.3, z1 + 0.2, pale);
    // the canopy on slim columns to the street, its downlights; the red carpet and brass stanchions
    const cz1 = Z(Math.min(D - 2, lz1 + 8));
    K.span("lm.paint", x0 + 0.4, m(12), z1, x1 - 0.4, m(13), cz1, hex("#b8bcc4"));
    for (const x of [x0 + 0.8, x1 - 0.8]) K.cyl("lm.chrome", x, 0, cz1 - 0.5, 0.1, 0.1, m(12), 8, hex("#b8bec8"));
    for (let x = lx0 + 4; x < lx1 - 4; x += 3) K.box("lm.glow", X(x), m(12) - 0.03, (z1 + cz1) / 2, 0.3, 0.03, 0.3, hex("#fff0d0"));
    K.span("lm.Carpet016", X(cxv - 3), 0.0, z1, X(cxv + 3), 0.03, cz1, hex("#a01828"));
    if (!lod)
      for (let z = lz1 + 1; z < Math.min(D - 2, lz1 + 8); z += 2)
        for (const x of [cxv - 3.5, cxv + 3.5]) K.cyl("lm.chrome", X(x), 0, Z(z), 0.04, 0.04, 0.95, 8, hex("#c8a860"));
  }
  // ---- the fountain pools: dark water, granite kerbs, jets arcing to a plume
  const pzz = D - M - 2;
  const pool = (x0: number, z0: number, x1: number, z1: number, jets: boolean) => {
    const a = X(x0),
      b2 = X(x1),
      za = Z(z0),
      zb = Z(z1);
    K.span("lm.Bricks008", a - 0.3, 0, za - 0.3, b2 + 0.3, 0.45, zb + 0.3, hex("#8a8a88"));
    K.span("lm.chrome", a, 0.45, za, b2, 0.47, zb, hex("#2e6a8a"));
    if (!jets || lod) return;
    const pcx = (a + b2) / 2,
      pcz = (za + zb) / 2;
    K.cyl("lm.paint", pcx, 0.47, pcz, 0.08, 0.02, 5, 6, hex("#e8f4ff"));
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const nx = pcx + Math.cos(ang) * (b2 - a) * 0.42,
        nz = pcz + Math.sin(ang) * (zb - za) * 0.42;
      const hmax = m(6 + (i % 3) * 3);
      let last: V3 = [nx, 0.47, nz];
      for (let t = 0.1; t <= 1.001; t += 0.15) {
        const p: V3 = [nx + (pcx - nx) * t * 0.8, 0.47 + 4 * hmax * t * (1 - t), nz + (pcz - nz) * t * 0.8];
        K.rod("lm.paint", last, p, 0.03, hex("#e8f4ff"), 4);
        last = p;
      }
    }
  };
  pool(M + 1, pzz - 18, Math.round(cxv - 13), pzz, true);
  pool(Math.round(cxv + 13), pzz - 18, W - M - 1, pzz, true);
  pool(Math.round(cxv - 12), M - 2, Math.round(cxv + 12), M + 4, false);
  // ---- palms round the pools, lamps along the front, benches, planters
  for (const [x, z] of [
    [M + 2, pzz - 20],
    [Math.round(cxv - 15), pzz - 20],
    [Math.round(cxv + 15), pzz - 20],
    [W - M - 2, pzz - 20],
    [M + 2, pzz + 3],
    [W - M - 2, pzz + 3],
  ]) {
    const p = F.p([x, 0, z]);
    c.trees.push([p[0], 0, p[2], "palm", x * 5 + z]);
  }
  for (const z of [Math.round(czv - 6), Math.round(czv + 6)]) {
    lampPost(c, X(3), Z(z), 4.2);
    lampPost(c, X(W - 4), Z(z), 4.2);
  }
  c.props.push(["bench", X(M + 10), 0, Z(D - 5), 0], ["bench", X(W - M - 12), 0, Z(D - 5), 0]);
}

// ---- SHIBUYA ---------------------------------------------------------------------------------------------

/**
 * Shibuya's corner on the scramble: ZFRONT, the QFRONT-like glass tower on the corner (the lit shop
 * floor, the ZK COFFEE café wide open on the crossing, office floors of glass between mullions and
 * spandrels, the giant LED screen on the front and another on the south side, the ticker band round
 * the corner, neon up its edge, the name frame on the roof, a blade sign); the 109-like silver
 * cylinder with its sign pylon; the mid-rise annex with its rooftop billboard; the corner plaza.
 * The screens' faces are where the layout's points say (scene/shibuya.ts lights them).
 */
function shibuya(c: Ctx) {
  const { K, F, lod } = c;
  const m = (n: number) => F.m(n);
  const W = F.W,
    D = F.D;
  const X = (v: number) => F.p([v, 0, 0])[0],
    Z = (v: number) => F.p([0, 0, v])[2];
  // (the voxel layout runs past a lot narrower than it was drawn for, and was clipped there: so is this)
  const QX0 = 12,
    QX1 = Math.min(67, W),
    QZ0 = 27,
    QZ1 = 60,
    TOP = 96,
    GF = 14,
    CF = 26,
    FL = 10;
  const panel = hex("#07070a"),
    frame = hex("#2c2c34"),
    mull = hex("#b9c0ca"),
    spand = hex("#3c4048");
  K.box("lm.PavingStones111", 0, -0.06, 0, F.w, 0.08, F.d, hex("#bcb8b4"));
  // ---- ZFRONT
  {
    const x0 = X(QX0),
      x1 = X(QX1),
      z0 = Z(QZ0),
      z1 = Z(QZ1);
    // the core behind the skin (offices above the café)
    K.span("lm.dark", x0 + 0.5, m(CF), z0 + 0.5, x1 - 0.5, m(TOP), z1 - 0.5, "#24222a");
    // the curtain wall of the office floors: glass on the four sides
    K.span("lm.glass", x0, m(CF), z1 - 0.06, x1, m(TOP), z1, hex("#6a809a"));
    K.span("lm.glass", x0, m(CF), z0, x1, m(TOP), z0 + 0.06, hex("#6a809a"));
    K.span("lm.glass", x0, m(CF), z0, x0 + 0.06, m(TOP), z1, hex("#6a809a"));
    K.span("lm.glass", x1 - 0.06, m(CF), z0, x1, m(TOP), z1, hex("#6a809a"));
    // spandrels at each floor, mullions every two metres
    for (let y = CF; y < TOP; y += FL) {
      K.span("lm.chrome", x0 - 0.05, m(y), z1 - 0.1, x1 + 0.05, m(y + 1), z1 + 0.05, spand);
      K.span("lm.chrome", x0 - 0.05, m(y), z0 - 0.05, x0 + 0.1, m(y + 1), z1 + 0.05, spand);
      K.span("lm.chrome", x0 - 0.05, m(y), z0 - 0.05, x1 + 0.05, m(y + 1), z0 + 0.1, spand);
      K.span("lm.chrome", x1 - 0.1, m(y), z0 - 0.05, x1 + 0.05, m(y + 1), z1 + 0.05, spand);
    }
    if (!lod) {
      for (let x = QX0; x <= QX1; x += 6) {
        K.span("lm.chrome", X(x) - 0.05, m(CF), z1 - 0.02, X(x) + 0.05, m(TOP), z1 + 0.12, mull);
        K.span("lm.chrome", X(x) - 0.05, m(CF), z0 - 0.12, X(x) + 0.05, m(TOP), z0 + 0.02, mull);
      }
      for (let z = QZ0; z <= QZ1; z += 6) {
        K.span("lm.chrome", x0 - 0.12, m(CF), Z(z) - 0.05, x0 + 0.02, m(TOP), Z(z) + 0.05, mull);
        K.span("lm.chrome", x1 - 0.02, m(CF), Z(z) - 0.05, x1 + 0.12, m(TOP), Z(z) + 0.05, mull);
      }
    }
    // the shop floor: tall lit windows, posters, the corner entrance; the cyan fascia over it
    K.span("lm.dark", x0 + 0.4, 0, z0 + 0.4, x1 - 0.4, m(GF), z1 - 0.4, "#3a3842");
    K.span("lm.glow", x0 + 0.5, m(1), z1 - 0.45, x1 - 0.5, m(GF - 2), z1 - 0.4, hex("#8a7a64"));
    K.span("lm.glow", x0 + 0.4, m(1), z0 + 0.5, x0 + 0.45, m(GF - 2), z1 - 0.5, hex("#8a7a64"));
    K.span("lm.glass", x0, 0, z1 - 0.06, x1, m(GF - 1), z1, hex("#c8d4dc"));
    K.span("lm.glass", x0, 0, z0, x0 + 0.06, m(GF - 1), z1, hex("#c8d4dc"));
    if (!lod)
      for (let x = QX0; x < QX1; x += 5) {
        K.span("lm.chrome", X(x) - 0.05, 0, z1 - 0.02, X(x) + 0.05, m(GF - 1), z1 + 0.06, mull);
        const h = (x * 37) % 11;
        if (h < 3) K.span("lm.glow", X(x) + 0.3, m(3), z1 - 0.38, X(x + 3), m(9), z1 - 0.34, [hex("#ff3e8a"), hex("#3ef0ff"), hex("#f4b728")][h]);
      }
    K.span("lm.glass", X(QX0 + 2), 0, z1, X(QX0 + 11), m(9), z1 + 0.04, hex("#f0f4f8"));
    K.span("lm.glow", x0 - 0.04, m(GF - 1), z1 - 0.1, x1 + 0.04, m(GF), z1 + 0.06, hex("#3ef0ff"));
    K.span("lm.glow", x0 - 0.06, m(GF - 1), z0, x0 + 0.1, m(GF), z1 + 0.06, hex("#3ef0ff"));
    // the café floor: open on the crossing and the boulevard, its floor, ceiling band, back walls, bar
    K.span("lm.Wood049", x0, m(GF), z0, x1, m(GF) + 0.12, z1, hex("#6a4a32"));
    K.span("lm.glow", x0, m(CF - 1), z1 - 4.2, x1, m(CF), z1, hex("#8a6a48"));
    K.span("lm.glow", x0, m(CF - 1), z0, x0 + 4.2, m(CF), z1, hex("#8a6a48"));
    const fz0 = Z(QZ1 - 13),
      sx1 = X(QX0 + 13);
    K.span("lm.Plaster001", sx1, m(GF), z0 + 0.4, x1 - 0.4, m(CF - 1), fz0, hex("#b89a74"));
    K.span("lm.Plaster001", x0 + 0.4, m(GF), z0 + 0.4, sx1, m(CF - 1), z0 + 0.6, hex("#b89a74"));
    if (!lod) {
      for (let x = QX0 + 20; x < QX1 - 6; x += 9) K.span("lm.glow", X(x), m(GF + 6), fz0, X(x + 6), m(GF + 9), fz0 + 0.03, hex("#f6e3c0"));
      K.span("lm.Wood049", x0 + 0.3, m(GF + 3), z1 - 0.75, x1 - 0.3, m(GF + 3) + 0.08, z1 - 0.4, hex("#8a6a4a"));
      K.span("lm.Wood049", x0 + 0.4, m(GF + 3), z0 + 0.3, x0 + 0.75, m(GF + 3) + 0.08, z1 - 0.3, hex("#8a6a4a"));
      for (let x = QX0 + 4; x < QX1 - 2; x += 8) {
        K.cyl("lm.dark", X(x), m(CF - 3), z1 - 1.6, 0.01, 0.01, m(3), 4, "#222");
        K.lathe("lm.glow", [[0.25, 0], [0.18, 0.2], [0.02, 0.3]], X(x), m(CF - 3) - 0.1, z1 - 1.6, 10, hex("#ffc070"));
      }
      for (let x = QX0 + 16; x < QX1 - 4; x += 6) {
        K.cyl("lm.chrome", X(x), m(GF), Z(QZ1 - 7), 0.05, 0.05, 0.75, 6, mull);
        K.cyl("lm.Wood049", X(x), m(GF) + 0.75, Z(QZ1 - 7), 0.35, 0.35, 0.04, 12, hex("#a07850"));
      }
    }
    // café's slim mullions on the open sides
    for (let x = QX0; x <= QX1; x += 7) K.span("lm.chrome", X(x) - 0.05, m(GF), z1 - 0.1, X(x) + 0.05, m(CF), z1, mull);
    // ---- the screens: black panels in their frames (their faces where the layout's points are)
    const plate = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      const fx = bx - ax > 1 ? 1 : 0,
        fz = bz - az > 1 ? 1 : 0;
      K.span("lm.dark", X(ax - fx), m(ay - 1), Z(az - fz), X(bx + fx), m(by + 1), Z(bz + fz) - 0.02, frame);
      K.span("lm.dark", X(ax), m(ay), Z(az), X(bx), m(by), Z(bz), panel);
    };
    plate(QX0 + 6, 34, QZ1, Math.min(67 - 4, W), 66, QZ1 + 1);
    {
      // the south screen stands proud of the west face (x = QX0 − 1 … QX0)
      K.span("lm.dark", X(QX0 - 1) + 0.02, m(36), Z(QZ0 + 3), X(QX0), m(63), Z(QZ1 - 2), frame);
      K.span("lm.dark", X(QX0 - 1), m(37), Z(QZ0 + 4), X(QX0), m(62), Z(QZ1 - 3), panel);
    }
    K.span("lm.dark", X(QX0 - 1), m(CF + 2), Z(QZ1), X(QX1), m(CF + 6), Z(QZ1 + 1), panel);
    K.span("lm.dark", X(QX0 - 1), m(CF + 2), Z(QZ0), X(QX0), m(CF + 6), Z(QZ1 + 1), panel);
    // the neon up the corner, along the roof line
    K.span("lm.glow", X(QX0 - 1) - 0.08, m(CF), Z(QZ1) - 0.05, X(QX0 - 1) + 0.12, m(TOP), Z(QZ1) + 0.15, hex("#ff3e8a"));
    K.span("lm.glow", x0 - 0.1, m(TOP), z1 - 0.05, x1 + 0.05, m(TOP) + 0.15, z1 + 0.1, hex("#3ef0ff"));
    K.span("lm.glow", x0 - 0.1, m(TOP), z0, x0 + 0.05, m(TOP) + 0.15, z1 + 0.1, hex("#ff3e8a"));
    // the roof: slab, parapet, plant, the name frame facing the crossing, the blade sign
    K.span("lm.Concrete012", x0, m(TOP), z0, x1, m(TOP + 1), z1, hex("#3a3844"));
    for (const [a, b2, cc, d] of [
      [x0, z0, x1, z0 + 0.3],
      [x0, z1 - 0.3, x1, z1],
      [x0, z0, x0 + 0.3, z1],
      [x1 - 0.3, z0, x1, z1],
    ])
      K.span("lm.Concrete012", a, m(TOP + 1), b2, cc, m(TOP + 3), d, hex("#4a4854"));
    for (const [x, z] of [
      [QX0 + 8, QZ0 + 6],
      [QX0 + 20, QZ0 + 5],
      [QX0 + 34, QZ0 + 7],
    ])
      K.span("lm.chrome", X(x), m(TOP + 1), Z(z), X(x + 6), m(TOP + 5), Z(z + 5), hex("#bcb8c4"));
    const nameZ = QZ1 - 4;
    for (const x of [QX0 + 10, QX1 - 10]) K.span("lm.dark", X(x), m(TOP + 1), Z(nameZ), X(x + 1), m(TOP + 18), Z(nameZ + 1), "#2a2832");
    K.span("lm.dark", X(QX0 + 8), m(TOP + 8), Z(nameZ + 1), X(QX1 - 8), m(TOP + 18), Z(nameZ + 2), "#121118");
    K.span("lm.dark", X(QX1 - 3), m(CF + 10), Z(QZ1), X(QX1 - 2), m(TOP - 6), Z(QZ1 + 4), "#18171d");
  }
  // ---- the 109: a silver cylinder, its lit shop floor and pink neon ring, ribs and glass bands, the pylon
  {
    const cx = X(16.5),
      cz = Z(13.5),
      R = m(11.4),
      T9 = m(78);
    K.cyl("lm.glow", cx, 0, cz, R - 0.1, R - 0.1, m(12), 32, hex("#ffe6f0"));
    K.cyl("lm.glow", cx, m(13), cz, R + 0.05, R + 0.05, m(1), 32, hex("#ff4fa0"));
    K.cyl("lm.chrome", cx, m(12), cz, R, R, m(1), 32, hex("#9aa0aa"));
    K.cyl("lm.glass", cx, m(14), cz, R - 0.05, R - 0.05, T9 - m(14), 32, hex("#8a96a8"));
    for (let y = 14; y < 78; y += 9) K.cyl("lm.chrome", cx, m(y), cz, R + 0.04, R + 0.04, m(1), 32, hex("#8c929c"));
    const ribs = lod ? 12 : 22;
    for (let i = 0; i < ribs; i++) {
      const a = (i / ribs) * Math.PI * 2;
      K.box("lm.chrome", cx + Math.cos(a) * (R + 0.05), m(12), cz + Math.sin(a) * (R + 0.05), 0.5, T9 - m(12), 0.2, hex("#d6dae0"), -a + Math.PI / 2);
    }
    K.cyl("lm.chrome", cx, T9, cz, R, R, m(1), 32, hex("#9a9ea8"));
    K.cyl("lm.glow", cx, T9, cz, R + 0.04, R + 0.04, 0.12, 32, hex("#ffffff"));
    K.span("lm.chrome", X(8), m(79), Z(16), X(14), m(115), Z(22), hex("#e8eaee"));
    K.span("lm.glow", X(7), m(115), Z(15), X(15), m(116), Z(23), hex("#ff4fa0"));
  }
  // ---- the annex: dark cladding with ribbon windows, its roof, the billboard frame, the purple neon edge
  {
    const AX0 = 30,
      AX1 = W,
      AZ0 = 0,
      AZ1 = 25,
      AT = 57;
    const x0 = X(AX0),
      x1 = X(AX1),
      z0 = Z(AZ0),
      z1 = Z(AZ1);
    K.span("lm.Concrete012", x0, 0, z0, x1, m(AT), z1, hex("#4c4654"));
    for (let y = 4; y < AT - 2; y += 10) {
      K.span("lm.glass", x0 + 0.3, m(y), z1 - 0.02, x1 - 0.3, m(y + 5), z1 + 0.04, hex("#5a6878"));
      K.span("lm.glass", x0 - 0.04, m(y), z0 + 0.3, x0 + 0.02, m(y + 5), z1 - 0.3, hex("#5a6878"));
    }
    K.span("lm.Concrete012", x0, m(AT), z0, x1, m(AT + 1), z1, hex("#3a3844"));
    for (const x of [AX0 + 8, AX0 + 30]) K.span("lm.dark", X(x), m(AT + 1), Z(AZ1 - 3), X(x + 1), m(AT + 22), Z(AZ1 - 2), "#2a2832");
    K.span("lm.dark", X(AX0 + 4), m(AT + 8), Z(AZ1 - 2), X(AX0 + 36), m(AT + 22), Z(AZ1 - 1), panel);
    K.span("lm.glow", X(AX0 - 1), m(2), Z(AZ1 - 1), X(AX0), m(AT), Z(AZ1), hex("#b07bff"));
  }
  // ---- the plaza: trees and a bench away from the crowd, bollards on the kerb
  for (const [x, z] of [
    [4, 30],
    [70, 66],
  ]) {
    const p = F.p([x, 0, z]);
    c.trees.push([p[0], 0, p[2], "broad", x + z * 3]);
  }
  c.props.push(["bench", X(3.5), 0, Z(37), Math.PI / 2]);
  for (let x = 30; x < W - 2; x += 6) c.props.push(["bollard", X(x + 0.5), 0, Z(D - 1.5), 0]);
}

// ---- THE ZK CEMETERY ---------------------------------------------------------------------------------

/**
 * Père-Lachaise on a little hill: the stone plinth and wrought-iron railings with spear tips and
 * stone posts, the gate between lantern pillars under its iron arch (the name plate is live), gravel
 * alleys between the grass of the plots, the graves of the shared layout (rounded, pointed and slab
 * headstones, crosses, Celtic crosses, obelisks, broken stones, the little funerary chapels; leaning,
 * mossy, with candles and flowers; the eight that open have their pits under the live lids), the
 * Gothic chapel with its lancets of stained glass, rose window, slate roof and flèche, the CRYPT (a
 * dark granite temple, its bronze door ajar on a green glow), the family tombs, the angel, the
 * obelisk, the columbarium, cypresses and dead trees, iron lanterns, benches.
 * Layout: src/scene/cemetery/layout.ts (voxels of k/6 m).
 */
function cemetery(c: Ctx) {
  const { K, F, lod } = c;
  const m = (n: number) => F.m(n);
  const V = (x: number, y: number, z: number) => F.p([x, y, z]);
  const X = (v: number) => F.p([v, 0, 0])[0],
    Z = (v: number) => F.p([0, 0, v])[2];
  const GY = (z: number) => m(groundY(Math.min(FZ1, Math.max(FZ0, z))));
  const STONES = ["#9a9890", "#5f5e64", "#a8987a", "#7e8478", "#c8c6c0"].map(hex);
  const iron = hex("#1e1e22"),
    grass = hex("#5e7040"),
    gravel = hex("#a39d90");
  const ST = (g: Grave) => (g.stone % 2 ? "lm.Concrete012" : "lm.Marble021");
  // ---- the pavement outside the fence, the hill inside (grass), the gravel alleys on it
  K.box("lm.PavingStones111", 0, -0.06, 0, F.w, 0.08, F.d, hex("#b0aca4"));
  {
    const zs = [FZ0, FZ0 + 2, FZ1 - 3, FZ1];
    const pos: number[] = [];
    const x0 = X(FX0),
      x1 = X(FX1);
    for (let i = 0; i < zs.length - 1; i++) {
      const za = Z(zs[i]),
        zb = Z(zs[i + 1]),
        ya = GY(zs[i]),
        yb = GY(zs[i + 1]);
      pos.push(x0, ya, za, x0, yb, zb, x1, yb, zb, x0, ya, za, x1, yb, zb, x1, ya, za);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    K.add("lm.Grass004", g, grass);
    // the hill's body under the grass (seen at the fence)
    K.span("lm.Ground054", x0, 0, Z(FZ0), x1, GY(FZ1) - 0.01, Z(FZ1), hex("#6a5a48"));
  }
  for (const l of LANES) {
    const col = l.gravel ? gravel : shadeC(grass, 0.85);
    const slot = l.gravel ? "lm.Gravel022" : "lm.Grass004";
    if (l.axis === "x") {
      const y = GY(l.at) + 0.02;
      K.span(slot, X(l.from), y - 0.04, Z(l.at - l.half), X(l.to), y, Z(l.at + l.half), col);
    } else {
      // (down the slope: a ramp)
      const a = V(l.at - l.half, 0, l.from),
        b = V(l.at + l.half, 0, l.to);
      const pos: number[] = [];
      const zs = [l.from, Math.max(l.from, FZ0 + 2), Math.min(l.to, FZ1 - 3), l.to];
      for (let i = 0; i < 3; i++) {
        const za = Z(zs[i]),
          zb = Z(zs[i + 1]),
          ya = GY(zs[i]) + 0.03,
          yb = GY(zs[i + 1]) + 0.03;
        if (zb - za < 1e-3) continue;
        pos.push(a[0], ya, za, a[0], yb, zb, b[0], yb, zb, a[0], ya, za, b[0], yb, zb, b[0], ya, za);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      K.add(slot, g, col);
    }
  }
  // the gate's gravel out to the pavement
  K.span("lm.Gravel022", X(GATE.x0), 0, Z(FZ1 - 4), X(GATE.x1), GY(FZ1) + 0.02, Z(F.D - 1), gravel);
  // ---- the fence: stone plinth with its coping, railings with spear tips, stone posts
  const plinthTop = (z: number) => m(Math.max(groundV(Math.min(FZ1 - 1, Math.max(FZ0 + 1, z))), 3) + 2);
  const stoneF = hex("#8e8a82");
  const fenceRun = (ax: number, az: number, bx: number, bz: number) => {
    const along = ax === bx ? "z" : "x";
    const len = along === "x" ? Math.abs(bx - ax) : Math.abs(bz - az);
    const n = Math.max(1, Math.round(m(len) / (lod ? 1.2 : 0.24)));
    const y0 = plinthTop(along === "x" ? az : FZ0 + 4);
    const y1 = plinthTop(along === "x" ? az : FZ1 - 4);
    const A = V(ax, 0, az),
      B = V(bx, 0, bz);
    // the plinth (following the hill on the sides)
    if (along === "x") K.span("lm.Bricks008", Math.min(A[0], B[0]), 0, A[2] - 0.2, Math.max(A[0], B[0]), y0, A[2] + 0.2, stoneF);
    else {
      const pos: number[] = [];
      const t = 0.2;
      for (const s2 of [-t, t]) {
        pos.push(A[0] + s2, 0, A[2], A[0] + s2, y0, A[2], A[0] + s2, y1, B[2], A[0] + s2, 0, A[2], A[0] + s2, y1, B[2], A[0] + s2, 0, B[2]);
      }
      pos.push(A[0] - t, y0, A[2], A[0] + t, y0, A[2], A[0] + t, y1, B[2], A[0] - t, y0, A[2], A[0] + t, y1, B[2], A[0] - t, y1, B[2]);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const mat = g.toNonIndexed();
      K.add("lm.Bricks008", mat, stoneF);
      // (both sides drawn: wind each face twice)
      const back = g.clone();
      const p2 = back.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < p2.count; i += 3) {
        const x = p2.getX(i + 1),
          y = p2.getY(i + 1),
          z = p2.getZ(i + 1);
        p2.setXYZ(i + 1, p2.getX(i + 2), p2.getY(i + 2), p2.getZ(i + 2));
        p2.setXYZ(i + 2, x, y, z);
      }
      back.computeVertexNormals();
      K.add("lm.Bricks008", back, stoneF);
    }
    const H = m(12);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = A[0] + (B[0] - A[0]) * t,
        z = A[2] + (B[2] - A[2]) * t;
      const yb = along === "x" ? y0 : y0 + (y1 - y0) * t;
      K.box("lm.dark", x, yb, z, 0.035, H, 0.035, iron);
      if (!lod) K.cyl("lm.dark", x, yb + H, z, 0.05, 0.0, 0.16, 4, iron);
    }
    // the rails
    for (const h of [0.15, H - 0.2]) {
      const pa: V3 = [A[0], (along === "x" ? y0 : y0) + h, A[2]],
        pb: V3 = [B[0], (along === "x" ? y0 : y1) + h, B[2]];
      K.beam("lm.dark", pa, pb, 0.05, iron);
    }
    // stone posts every few metres
    const posts = Math.max(1, Math.round(m(len) / 4));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const x = A[0] + (B[0] - A[0]) * t,
        z = A[2] + (B[2] - A[2]) * t;
      const yb = along === "x" ? y0 : y0 + (y1 - y0) * t;
      K.box("lm.Bricks008", x, 0, z, 0.45, yb + H * 0.85, 0.45, stoneF);
      K.box("lm.Bricks008", x, yb + H * 0.85, z, 0.55, 0.12, 0.55, shadeC(stoneF, 1.08));
    }
  };
  fenceRun(FX0, FZ0, FX1, FZ0);
  fenceRun(FX0, FZ0, FX0, FZ1);
  fenceRun(FX1, FZ0, FX1, FZ1);
  fenceRun(FX0, FZ1, GATE.x0 - 4, FZ1);
  fenceRun(GATE.x1 + 4, FZ1, FX1, FZ1);
  // ---- the gate: two stone pillars with lanterns, the iron arch (its plate is live), the leaves open
  {
    for (const [p0, p1] of [
      [GATE.x0 - 4, GATE.x0],
      [GATE.x1, GATE.x1 + 4],
    ]) {
      const cx = X((p0 + p1) / 2),
        cz = Z(FZ1);
      const pw = m(p1 - p0) + 0.3;
      K.box("lm.Bricks008", cx, 0, cz, pw, m(30), pw, hex("#9a968e"));
      K.box("lm.Bricks008", cx, m(30), cz, pw + 0.2, 0.2, pw + 0.2, hex("#aaa69e"));
      K.cyl("lm.dark", cx, m(30) + 0.2, cz, 0.06, 0.06, 0.3, 6, iron);
      K.box("lm.glow.night", cx, m(30) + 0.5, cz, 0.28, 0.42, 0.28, hex("#ffb070"));
      K.lathe("lm.dark", [[0.24, 0], [0.04, 0.22]], cx, m(30) + 0.92, cz, 4, iron, Math.PI / 4);
    }
    const ax0 = X(GATE.x0),
      ax1 = X(GATE.x1),
      az = Z(FZ1);
    let last: V3 | null = null;
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const p: V3 = [ax0 + (ax1 - ax0) * t, m(40 + Math.sin(t * Math.PI) * 7), az];
      if (last) K.beam("lm.dark", last, p, 0.09, iron);
      if (!lod && i % 2 === 0) {
        K.beam("lm.dark", [p[0], m(32), az], p, 0.035, iron);
        K.cyl("lm.dark", p[0], p[1], az, 0.04, 0, 0.18, 4, iron);
      }
      last = p;
    }
    K.beam("lm.dark", [ax0, m(32), az], [ax1, m(32), az], 0.08, iron);
    for (const x of [ax0, ax1]) K.box("lm.dark", x, 0, az, 0.12, m(40), 0.12, iron);
    // the plate's backing: dark iron behind the live name
    K.box("lm.dark", X(GATE.cx + 0.5), m(33.5), az + 0.05, (ax1 - ax0) * 0.7, m(7), 0.06, hex("#141418"));
    K.box("lm.dark", X(GATE.cx + 0.5), m(47), az, 0.06, 0.5, 0.06, iron);
    K.box("lm.dark", X(GATE.cx + 0.5), m(47) + 0.32, az, 0.3, 0.06, 0.06, iron);
    // the leaves, swung in against the alley's edges
    for (const [gx, dir] of [
      [GATE.x0, 1],
      [GATE.x1, -1],
    ] as const) {
      const x = X(gx),
        z0 = az,
        z1 = az - m((GATE.x1 - GATE.x0) / 2) * 0.95;
      const y0 = GY(FZ1 - 4);
      K.beam("lm.dark", [x + dir * 0.15, y0 + 0.1, z0], [x + dir * 0.15, y0 + 0.1, z1], 0.05, iron);
      K.beam("lm.dark", [x + dir * 0.15, y0 + m(18), z0], [x + dir * 0.15, y0 + m(18), z1], 0.05, iron);
      if (!lod)
        for (let t = 0; t <= 8; t++) {
          const z = z0 + ((z1 - z0) * t) / 8;
          K.box("lm.dark", x + dir * 0.15, y0, z, 0.03, m(19), 0.03, iron);
        }
    }
  }
  // ---- the graves
  for (const g of GRAVES) grave(g);
  function grave(g: Grave) {
    const base = m(groundV(g.z + 6));
    const hw = Math.floor(g.w / 2);
    const col = STONES[g.stone % STONES.length];
    const slot = ST(g);
    const x0 = X(g.x - hw),
      x1 = X(g.x + hw + 1),
      z0 = Z(g.z),
      z1 = Z(g.z + STONE_T);
    const cx = (x0 + x1) / 2,
      w = x1 - x0,
      t = z1 - z0,
      h = m(g.h);
    // the plinth under the stone
    K.span(slot, x0 - m(1), base - 0.1, z0 - m(1), x1 + m(1), base + m(1), z1 + m(1), shadeC(col, 0.92));
    const by = base + m(1);
    // the grave bed in front: a stone border, earth, grass or gravel; the open ones' pits (lids are live)
    const gz0 = z1 + m(1),
      gz1 = Z(g.z + STONE_T + GRAVE_LEN);
    if (g.kind !== "chapel") {
      const bed = shadeC(col, 0.88);
      K.span(slot, x0, base - 0.05, gz0, x1, base + m(1), gz0 + 0.08, bed);
      K.span(slot, x0, base - 0.05, gz1 - 0.08, x1, base + m(1), gz1, bed);
      K.span(slot, x0, base - 0.05, gz0, x0 + 0.08, base + m(1), gz1, bed);
      K.span(slot, x1 - 0.08, base - 0.05, gz0, x1, base + m(1), gz1, bed);
      if (g.open) {
        const [px0, pz0, px1, pz1] = pitOf(g);
        K.span("lm.dark", X(px0), base - 0.6, Z(pz0), X(px1), base + 0.01, Z(pz1), "#100c0a");
      } else {
        const earth = g.deco === "fresh" ? hex("#4a3828") : g.deco === "moss" ? hex("#4e6e34") : hex("#5a6a40");
        K.span(g.deco === "fresh" ? "lm.Ground054" : "lm.Grass004", x0 + 0.08, base, gz0 + 0.08, x1 - 0.08, base + m(1) - 0.04, gz1 - 0.08, earth);
      }
      if (!lod && (g.deco === "flowers" || g.deco === "fresh"))
        for (let i = 0; i < 5; i++) K.blob("lm.paint", x0 + w * (0.2 + 0.15 * i), base + m(1) + 0.06, gz1 - 0.3 - (i % 2) * 0.2, 0.09, 0.07, 0.09, [hex("#8a2030"), hex("#c8a040"), hex("#e8e0d0"), hex("#6a3070"), hex("#a83a2a")][i], 6);
      if (!lod && g.deco === "candle") {
        K.cyl("lm.glass", cx, base + m(1), gz1 - 0.35, 0.06, 0.06, 0.14, 8, hex("#c83a2a"));
        K.blob("lm.glow.night", cx, base + m(1) + 0.18, gz1 - 0.35, 0.03, 0.05, 0.03, hex("#ff8a3a"), 6);
      }
    }
    // the stone, leaning sideways or back (about its foot)
    const lean = new THREE.Matrix4().makeRotationZ(-g.lean * 0.1).multiply(new THREE.Matrix4().makeRotationX(g.back ? -0.12 : 0));
    const put = (geo: THREE.BufferGeometry, c2: V3 = col) => {
      geo.applyMatrix4(lean);
      geo.translate(cx, by, z0);
      K.add(slot, geo, c2);
    };
    const ex = (sh: THREE.Shape, depth = t) => {
      const gg = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: lod ? 3 : 8 });
      return gg;
    };
    switch (g.kind) {
      case "round": {
        const sh = new THREE.Shape();
        sh.moveTo(-w / 2, 0);
        sh.lineTo(w / 2, 0);
        sh.lineTo(w / 2, h - w / 2);
        sh.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
        sh.lineTo(-w / 2, 0);
        put(ex(sh));
        break;
      }
      case "pointed": {
        const sh = new THREE.Shape();
        sh.moveTo(-w / 2, 0);
        sh.lineTo(w / 2, 0);
        sh.lineTo(w / 2, h - w * 0.6);
        sh.quadraticCurveTo(w / 2, h - w * 0.15, 0, h);
        sh.quadraticCurveTo(-w / 2, h - w * 0.15, -w / 2, h - w * 0.6);
        sh.lineTo(-w / 2, 0);
        put(ex(sh));
        break;
      }
      case "slab": {
        const a = new THREE.BoxGeometry(w, h - 0.1, t);
        a.translate(0, (h - 0.1) / 2, t / 2);
        put(a);
        const b = new THREE.BoxGeometry(w + 0.12, 0.12, t + 0.1);
        b.translate(0, h - 0.06, t / 2);
        put(b);
        break;
      }
      case "broken": {
        const sh = new THREE.Shape();
        sh.moveTo(-w / 2, 0);
        sh.lineTo(w / 2, 0);
        sh.lineTo(w / 2, h * 0.5);
        sh.lineTo(w * 0.2, h * 0.62);
        sh.lineTo(0, h * 0.48);
        sh.lineTo(-w * 0.25, h * 0.66);
        sh.lineTo(-w / 2, h * 0.55);
        sh.lineTo(-w / 2, 0);
        put(ex(sh));
        // its fallen piece on the grave
        const f = new THREE.BoxGeometry(w * 0.8, t, h * 0.3);
        f.rotateY(0.3);
        f.translate(cx, base + m(1) + t / 2, gz0 + h * 0.25);
        K.add(slot, f, shadeC(col, 0.9));
        break;
      }
      case "cross":
      case "celtic": {
        const bw = Math.max(m(1.6), w * 0.18);
        const a = new THREE.BoxGeometry(w * 0.7, m(2), t);
        a.translate(0, m(1), t / 2);
        put(a);
        const v = new THREE.BoxGeometry(bw, h - m(2), t);
        v.translate(0, m(2) + (h - m(2)) / 2, t / 2);
        put(v);
        const arm = h * 0.65;
        const hb = new THREE.BoxGeometry(w * 0.9, bw, t);
        hb.translate(0, arm, t / 2);
        put(hb);
        if (g.kind === "celtic") {
          const ring = new THREE.TorusGeometry(w * 0.28, bw * 0.3, 6, lod ? 8 : 18);
          ring.translate(0, arm, t / 2);
          put(ring);
        }
        break;
      }
      case "obelisk": {
        const ob = new THREE.CylinderGeometry(w * 0.18, w * 0.3, h * 0.9, 4, 1);
        ob.rotateY(Math.PI / 4);
        ob.translate(0, h * 0.45, t / 2);
        put(ob);
        const tip = new THREE.ConeGeometry(w * 0.18, h * 0.1, 4);
        tip.rotateY(Math.PI / 4);
        tip.translate(0, h * 0.95, t / 2);
        put(tip);
        break;
      }
      case "chapel": {
        // a little funerary chapel over the whole grave: gable to the front, an iron grille door
        const cz0 = z0,
          cz1 = gz1;
        const ww = w + m(2);
        const wallH = h - m(4);
        K.span(slot, cx - ww / 2, by, cz0, cx + ww / 2, by + wallH, cz1 - 0.1, col);
        const sh = new THREE.Shape();
        sh.moveTo(-ww / 2 - 0.1, 0);
        sh.lineTo(ww / 2 + 0.1, 0);
        sh.lineTo(0, ww * 0.5);
        sh.lineTo(-ww / 2 - 0.1, 0);
        K.extrude("lm.Metal024", sh, cz0 - 0.1, cz1 - cz0 + 0.1, hex("#3c3f4a"), { ox: cx, oy: by + wallH });
        K.extrude(slot, sh, -0.1, 0.12, col, { ox: cx, oy: by + wallH, oz: cz1 });
        K.box(slot, cx, by + wallH + ww * 0.5 - 0.05, cz1 - 0.05, 0.08, 0.4, 0.08, col);
        K.box(slot, cx, by + wallH + ww * 0.5 + 0.2, cz1 - 0.05, 0.26, 0.07, 0.08, col);
        // the door: a dark recess behind an iron grille
        K.span("lm.dark", cx - ww * 0.22, by, cz1 - 0.12, cx + ww * 0.22, by + wallH * 0.8, cz1 + 0.01, "#141210");
        if (!lod) for (let i = -2; i <= 2; i++) K.box("lm.dark", cx + i * ww * 0.08, by, cz1 + 0.03, 0.025, wallH * 0.8, 0.025, iron);
        break;
      }
    }
    if (!lod && (g.deco === "moss" || g.stone === 3) && g.kind !== "chapel") K.span("lm.Grass004", x0 + 0.02, by + h * 0.75, z0 - 0.01, x1 - 0.02, by + h * 0.8, z1 + 0.01, hex("#5a7a3a"));
  }
  // ---- the chapel on the hill
  {
    const { x0, x1, z0, z1 } = CHAPEL;
    const base = m(groundV(z1) + 2);
    const cx = X((x0 + x1) / 2);
    const nx0 = X(x0 + 4),
      nx1 = X(x1 - 4);
    const nz0 = Z(z0 + 8),
      nz1 = Z(z1);
    const eave = base + m(26);
    const half = (nx1 - nx0) / 2 + m(2);
    const ridge = eave + half;
    const stone = hex("#b4ac9c"),
      slate = hex("#3c3f4a");
    const SS = "lm.Bricks084";
    // the plinth and the steps down to the forecourt
    K.span(SS, X(x0), 0, Z(z0), X(x1), base, Z(z1), shadeC(stone, 0.85));
    for (let i = 0; i < 3; i++) K.span(SS, cx - m(9) - i * 0.15, 0, nz1 + i * m(1.3), cx + m(9) + i * 0.15, base - (i * base) / 3, nz1 + (i + 1) * m(1.3), stone);
    // the nave: walls with stained-glass lancets between buttresses
    K.span(SS, nx0 + 0.4, base, nz0, nx1 - 0.4, eave, nz1 - 0.4, stone);
    for (const [fx, ry] of [
      [nx1, Math.PI / 2],
      [nx0, -Math.PI / 2],
    ] as const)
      gothicFace(c, SS, fx, (nz0 + nz1) / 2, nz1 - nz0, base, eave - base, ry, { bays: 4, storeys: 1, col: stone, pinnacles: true, glass: hex("#6a3a8a") });
    // the stained glass glows a little at night (a lit inside)
    if (!lod)
      for (const fx of [nx0 + 0.5, nx1 - 0.5])
        for (let i = 0; i < 4; i++) {
          const zz = nz0 + ((nz1 - nz0) * (i + 0.5)) / 4;
          K.box("lm.glow.night", fx, base + (eave - base) * 0.25, zz, 0.04, (eave - base) * 0.55, (nz1 - nz0) * 0.09, [hex("#c04060"), hex("#4060c0"), hex("#c0a040"), hex("#40a070")][i]);
        }
    // the apse at the back: a half-polygon, a conical roof
    K.cyl(SS, cx, base, nz0, (nx1 - nx0) / 2 - 0.3, (nx1 - nx0) / 2 - 0.3, eave - base - m(4), 7, stone);
    K.cyl("lm.Metal024", cx, eave - m(4), nz0, (nx1 - nx0) / 2, 0.1, m(12), 7, slate);
    // the slate roof: a steep gable along z, the ridge's cresting
    {
      const sh = new THREE.Shape();
      sh.moveTo(-half, 0);
      sh.lineTo(half, 0);
      sh.lineTo(0, half);
      sh.lineTo(-half, 0);
      K.extrude("lm.Metal024", sh, nz0, nz1 - nz0 + 0.3, slate, { ox: cx, oy: eave });
      K.span("lm.dark", cx - 0.05, ridge, nz0, cx + 0.05, ridge + 0.15, nz1 + 0.3, iron);
    }
    // the gable front: stone to the ridge, the rose window, the pointed door, a lamp over it
    {
      const sh = new THREE.Shape();
      const hw2 = (nx1 - nx0) / 2;
      sh.moveTo(-hw2, 0);
      sh.lineTo(-hw2, eave - base);
      sh.lineTo(0, eave - base + hw2 + m(2));
      sh.lineTo(hw2, eave - base);
      sh.lineTo(hw2, 0);
      sh.lineTo(m(5), 0);
      sh.lineTo(m(5), m(14));
      sh.quadraticCurveTo(m(5), m(19), 0, m(21));
      sh.quadraticCurveTo(-m(5), m(19), -m(5), m(14));
      sh.lineTo(-m(5), 0);
      sh.lineTo(-hw2, 0);
      const rose = new THREE.Path();
      rose.absarc(0, eave - base - m(2), m(5), 0, Math.PI * 2, true);
      sh.holes.push(rose);
      K.extrude(SS, sh, -0.6, 0.6, shadeC(stone, 1.05), { ox: cx, oy: base, oz: nz1 + 0.2 });
      const rg = new THREE.CylinderGeometry(m(5), m(5), 0.05, K.seg(20));
      rg.rotateX(Math.PI / 2);
      rg.translate(cx, eave - m(2), nz1 - 0.3);
      K.add("lm.glow.night", rg, hex("#a060c0"));
      if (!lod)
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          K.beam(SS, [cx, eave - m(2), nz1 - 0.2], [cx + Math.cos(a) * m(5), eave - m(2) + Math.sin(a) * m(5), nz1 - 0.2], 0.06, stone, 0.08);
        }
      K.span("lm.Wood049", cx - m(5), base, nz1 - 0.35, cx + m(5), base + m(17), nz1 - 0.25, hex("#5a3a22"));
      K.box("lm.glow.night", cx, base + m(23), nz1 + 0.3, 0.22, 0.3, 0.22, hex("#ffb070"));
    }
    // the flèche on the ridge near the front: a little belfry, a slate spire, a cross
    {
      const fz = nz1 - m(10),
        fy = ridge - m(4);
      K.box(SS, cx, fy, fz, m(6), m(8), m(6), stone);
      K.box("lm.dark", cx, fy + m(2), fz, m(6.1), m(4), m(3), "#141210");
      K.cyl("lm.Metal024", cx, fy + m(8), fz, m(4.5), 0.03, m(26), 4, slate);
      K.box("lm.Metal024.metal", cx, fy + m(34), fz, 0.05, 0.6, 0.05, hex("#c8a040"));
      K.box("lm.Metal024.metal", cx, fy + m(34) + 0.38, fz, 0.32, 0.05, 0.05, hex("#c8a040"));
    }
  }
  // ---- the CRYPT: a dark granite temple, its bronze door ajar on a green glow
  {
    const { x0, x1, z0, z1, door } = CRYPT;
    const base = m(groundV(z1));
    const py = base + m(3);
    const granite = hex("#4a4850");
    const GR = "lm.Marble021.gloss";
    for (let i = 0; i < 3; i++) K.span(GR, X(x0 + i * 2), 0, Z(z0 + i * 2), X(x1 - i * 2), base + m(i + 1), Z(z1 - i * 2), shadeC(granite, 1 - i * 0.04));
    const cx0 = X(x0 + 8),
      cx1 = X(x1 - 8),
      cz0 = Z(z0 + 6),
      cz1 = Z(z1 - 14);
    const ey = py + m(24);
    // the cella with pilasters at its corners
    K.span(GR, cx0, py, cz0, cx1, ey, cz1, granite);
    for (const x of [cx0, cx1]) for (const z of [cz0, cz1]) K.box(GR, x, py, z, m(3), ey - py, m(3), shadeC(granite, 1.08));
    // the portico: four columns, bases and capitals
    const pz = Z(z1 - 8);
    for (const fx of [-0.42, -0.16, 0.16, 0.42]) {
      const x = (cx0 + cx1) / 2 + fx * (cx1 - cx0);
      K.box(GR, x, py, pz, m(4), m(1.5), m(4), shadeC(granite, 1.1));
      K.cyl(GR, x, py + m(1.5), pz, m(1.6), m(1.4), ey - py - m(3), 12, shadeC(granite, 1.05));
      K.box(GR, x, ey - m(1.5), pz, m(4), m(1.5), m(4), shadeC(granite, 1.1));
    }
    // the portico's ceiling, the entablature, the pediment and roof
    K.span(GR, cx0 - m(2), ey, cz0 - m(1), cx1 + m(2), ey + m(5), pz + m(2.5), granite);
    {
      const half = (cx1 - cx0) / 2 + m(2);
      const sh = new THREE.Shape();
      sh.moveTo(-half, 0);
      sh.lineTo(half, 0);
      sh.lineTo(0, half * 0.45);
      sh.lineTo(-half, 0);
      K.extrude(GR, sh, cz0 - m(1), pz + m(2.5) - (cz0 - m(1)), shadeC(granite, 0.92), { ox: (cx0 + cx1) / 2, oy: ey + m(5) });
      // urns on the pediment's corners
      if (!lod)
        for (const x of [cx0 - m(1), cx1 + m(1)]) K.lathe(GR, [[0.12, 0], [0.22, 0.15], [0.16, 0.4], [0.2, 0.5], [0.02, 0.58]], x, ey + m(5), pz + m(1.5), 10, granite);
    }
    // the bronze door, ajar: a sliver of green light; green light spilling down the steps
    const dx = X(door + 0.5);
    K.span("lm.glow", dx - m(3), py, cz1 + 0.02, dx + m(3), py + m(16), cz1 + 0.06, hex("#40ff80"));
    K.box("lm.Metal024.metal", dx - m(1.6), py, cz1 + 0.5, m(3.4), m(16), 0.1, hex("#5a4a30"), -0.5);
    K.box("lm.Metal024.metal", dx + m(1.6), py, cz1 + 0.1, m(3), m(16), 0.1, hex("#5a4a30"));
    if (!lod) K.span("lm.glow.night", dx - m(3), py + 0.01, cz1, dx + m(3), py + 0.02, pz, hex("#30c060"));
  }
  // ---- the family tombs: a gothic one with pinnacles, a small domed one in green copper
  {
    const [ta, tb] = TOMBS;
    const tomb = (t: { x0: number; z0: number; x1: number; z1: number }) => {
      const base = m(groundV(t.z1) + 1);
      return { base, x0: X(t.x0), x1: X(t.x1), z0: Z(t.z0), z1: Z(t.z1), cx: X((t.x0 + t.x1) / 2), cz: Z((t.z0 + t.z1) / 2) };
    };
    const a = tomb(ta),
      st = hex("#a8a49a");
    K.span("lm.Bricks008", a.x0, 0, a.z0, a.x1, a.base, a.z1, shadeC(st, 0.9));
    gothicFace(c, "lm.Bricks008", a.cx, a.z1 - 0.3, a.x1 - a.x0 - 0.6, a.base, m(20), 0, { bays: 1, storeys: 1, col: st, door: 0 });
    K.span("lm.Bricks008", a.x0 + 0.3, a.base, a.z0 + 0.3, a.x1 - 0.3, a.base + m(20), a.z1 - 0.9, st);
    K.frustum("lm.Metal024", a.cx, a.base + m(20), a.cz, a.x1 - a.x0, a.z1 - a.z0, 0.1, (a.z1 - a.z0) * 0.6, m(12), hex("#3c3f4a"));
    for (const x of [a.x0, a.x1]) for (const z of [a.z0, a.z1]) {
      K.box("lm.Bricks008", x, a.base, z, m(2.5), m(22), m(2.5), st);
      K.cyl("lm.Bricks008", x, a.base + m(22), z, m(1.4), 0.02, m(8), 4, st);
    }
    const b = tomb(tb),
      copper = hex("#5a9a80");
    K.span("lm.Marble021", b.x0, 0, b.z0, b.x1, b.base, b.z1, hex("#b8b4aa"));
    K.box("lm.Marble021", b.cx, b.base, b.cz, b.x1 - b.x0 - 0.4, m(16), b.z1 - b.z0 - 0.4, hex("#c4c0b6"));
    K.lathe("lm.Metal024.metal", [[(b.x1 - b.x0) / 2 - 0.1, 0], [(b.x1 - b.x0) / 2 - 0.25, m(5)], [(b.x1 - b.x0) / 3, m(9)], [0.05, m(12)]], b.cx, b.base + m(16), b.cz, 16, copper);
    K.span("lm.dark", b.cx - m(3), b.base, b.z1 - 0.21, b.cx + m(3), b.base + m(11), b.z1 - 0.19, "#141210");
  }
  // ---- the angel on its pedestal, wings spread; the obelisk; the columbarium
  {
    const base = m(groundV(ANGEL.z));
    const [ax, , az] = V(ANGEL.x, 0, ANGEL.z);
    const marble = hex("#d4d0c6");
    K.box("lm.Marble021", ax, base, az, m(8), m(10), m(8), shadeC(marble, 0.9));
    K.box("lm.Marble021", ax, base + m(10), az, m(9), m(1), m(9), marble);
    const y = base + m(11);
    K.lathe("lm.Marble021", [[0.32, 0], [0.26, 0.5], [0.2, 0.95], [0.24, 1.15], [0.05, 1.3]], ax, y, az, 10, marble);
    K.blob("lm.Marble021", ax, y + 1.45, az, 0.13, 0.16, 0.14, marble, 10);
    for (const s2 of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.quadraticCurveTo(s2 * 0.5, 0.6, s2 * 0.75, 1.05);
      sh.quadraticCurveTo(s2 * 0.5, 0.5, s2 * 0.15, -0.35);
      sh.lineTo(0, 0);
      K.extrude("lm.Marble021", sh, -0.25, 0.05, marble, { ox: ax, oy: y + 0.7, oz: az });
    }
    const ob = m(groundV(OBELISK.z));
    const [ox, , oz] = V(OBELISK.x, 0, OBELISK.z);
    K.box("lm.Marble021.gloss", ox, ob, oz, m(7), m(3), m(7), hex("#5f5e64"));
    K.frustum("lm.Marble021.gloss", ox, ob + m(3), oz, m(4), m(4), m(2.4), m(2.4), m(36), hex("#6a6970"));
    K.frustum("lm.Marble021.gloss", ox, ob + m(39), oz, m(2.4), m(2.4), 0.02, 0.02, m(3), hex("#6a6970"));
    const cb = COLUMBARIUM;
    const cy = m(groundV(cb.z1));
    K.span("lm.Bricks008", X(cb.x0), 0, Z(cb.z0), X(cb.x1), cy + m(22), Z(cb.z1), hex("#a49e92"));
    if (!lod)
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 4; j++)
          K.span("lm.dark", X(cb.x0 + 2 + i * 4.6), cy + m(3 + j * 4.6), Z(cb.z1) - 0.02, X(cb.x0 + 5 + i * 4.6), cy + m(6 + j * 4.6), Z(cb.z1) + 0.01, (i + j) % 3 ? "#3a3632" : "#6a5a40");
    K.span("lm.Bricks008", X(cb.x0) - 0.1, cy + m(22), Z(cb.z0) - 0.1, X(cb.x1) + 0.1, cy + m(23), Z(cb.z1) + 0.15, hex("#b4aea2"));
  }
  // ---- trees: dark cypresses, dead trees with crooked bare branches
  const rr = rng(77);
  for (const [tx, tz, kind, th] of TREES) {
    const [x, , z] = V(tx, 0, tz);
    const y0 = GY(tz);
    const h = m(th);
    if (kind === "cypress") {
      K.cyl("lm.Wood049", x, y0, z, 0.12, 0.1, h * 0.15, 6, hex("#4a3a2a"));
      K.lathe("lm.Grass004", [[0.05, 0], [h * 0.09, h * 0.12], [h * 0.11, h * 0.35], [h * 0.09, h * 0.65], [h * 0.04, h * 0.9], [0.02, h]], x, y0 + h * 0.05, z, 12, hex("#203a24"));
    } else {
      const bark = hex("#3a3028");
      K.cyl("lm.Wood049", x, y0, z, 0.22, 0.14, h * 0.45, 7, bark);
      const branch = (p: V3, a: number, e: number, len: number, depth: number) => {
        const q: V3 = [p[0] + Math.cos(a) * Math.cos(e) * len, p[1] + Math.sin(e) * len, p[2] + Math.sin(a) * Math.cos(e) * len];
        K.rod("lm.Wood049", p, q, Math.max(0.02, 0.1 - depth * 0.03), bark, 5);
        if (depth < (lod ? 1 : 3)) for (let b2 = 0; b2 < 2; b2++) branch(q, a + (b2 - 0.5) * 1.1 + (rr() - 0.5) * 0.5, Math.max(0.05, e + (rr() - 0.5) * 0.6), len * 0.62, depth + 1);
      };
      for (let b2 = 0; b2 < 4; b2++) branch([x, y0 + h * 0.4 - b2 * 0.25, z], (b2 / 4) * Math.PI * 2 + rr() * 1.2, 0.35 + rr() * 0.45, h * 0.28, 0);
    }
  }
  // ---- iron lanterns on posts along the alleys; benches by the cross alley
  for (const [lx, lz] of LANTERNS) {
    const [x, , z] = V(lx + 0.5, 0, lz + 0.5);
    const y0 = GY(lz);
    K.cyl("lm.dark", x, y0, z, 0.07, 0.05, 2.4, 6, iron);
    K.box("lm.glow.night", x, y0 + 2.4, z, 0.24, 0.34, 0.24, hex("#ffb070"));
    K.lathe("lm.dark", [[0.22, 0], [0.03, 0.2]], x, y0 + 2.74, z, 4, iron, Math.PI / 4);
  }
  for (const bx of [140, 220]) c.props.push(["bench", X(bx + 5.5), GY(97), Z(96.5), 0]);
  void rectShape;
  void ellipseShape;
}
