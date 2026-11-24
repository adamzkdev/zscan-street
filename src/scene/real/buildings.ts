import type { BuildingJob } from "../city/plan";
import { zoneAt } from "../city/plan";
import type { Built } from "../voxel/buildings";
import { VOX } from "../voxel/model";

/**
 * The city's ordinary buildings, realistic (branch gta-real): no voxels — massing, facades and
 * details as plain geometry with UVs into photographed PBR sets (src/scene/real/tex.ts), built in the
 * city's workers (pure: no DOM). The voxel generator still runs for each job, for its layout only
 * (footprint, door, signs, lights, balconies' rhythm: everything the city places against a building
 * stays where it was); the geometry is made here instead.
 *
 * Coordinates are worked in the voxel model's frame (x across, y up, z from the back to the front
 * wall at body[3], facing +z; 1 = VOX) and written out in metres, centred like the meshed models.
 * Every surface belongs to a slot (one shared material each on the main thread, src/scene/real/mats.ts).
 */

export type Slot = "f001" | "f005" | "f006" | "f017" | "f018" | "f019" | "f020" | "plaster" | "brick" | "brickLight" | "concrete" | "roof" | "tile" | "wood" | "metal" | "glass" | "shop" | "fabric" | "awning" | "neon";
export const SLOTS: Slot[] = ["f001", "f005", "f006", "f017", "f018", "f019", "f020", "plaster", "brick", "brickLight", "concrete", "roof", "tile", "wood", "metal", "glass", "shop", "fabric", "awning", "neon"];
/** Slots left out of the game's solid shape (an awning over the pavement is walked under, not into). */
export const NO_FIELD = new Set<string>(["awning"]);
// (`lm.…`: the landmarks' slots, src/scene/real/markkit.ts / marksmat.ts)
export const isSlot = (k: string): k is Slot => (SLOTS as string[]).includes(k) || k.startsWith("lm.");

/** The texture set behind each slot (null: no photographed set). */
export const SLOT_SET: Record<Slot, string | null> = {
  f001: "Facade001",
  f005: "Facade005",
  f006: "Facade006",
  f017: "Facade017",
  f018: "Facade018A",
  f019: "Facade019A",
  f020: "Facade020A",
  plaster: "Plaster001",
  brick: "Bricks060",
  brickLight: "Bricks075A",
  concrete: "Concrete019",
  roof: "Concrete034",
  tile: "RoofingTiles006",
  wood: "Wood049",
  metal: "Metal032",
  glass: null,
  shop: null,
  fabric: null,
  awning: null,
  neon: null,
};

/** The photographed facades: floors and window bays in one repeat of the texture, and the bay width wanted (m). */
export const FACADE: Partial<Record<Slot, { floors: number; bays: number; bay: number }>> = {
  f001: { floors: 10, bays: 10, bay: 1.5 },
  f005: { floors: 10, bays: 20, bay: 0.8 },
  f006: { floors: 8, bays: 14, bay: 1.3 },
  f017: { floors: 12, bays: 14, bay: 1.3 },
  f018: { floors: 6, bays: 6, bay: 2.4 },
  f019: { floors: 6, bays: 6, bay: 2.4 },
  f020: { floors: 6, bays: 6, bay: 2.4 },
};

/** Metres per repeat of the walls' sets (as in tex.ts TILE). */
const WORLD_TILE: Partial<Record<Slot, [number, number]>> = {
  plaster: [2.5, 2.5],
  brick: [1.6, 1.6],
  brickLight: [1.6, 1.6],
  concrete: [3, 3],
  roof: [2, 2],
  tile: [2, 2],
  wood: [1.5, 1.5],
  metal: [2, 2],
};

/** The shop interiors' atlas (4 × 2 cells, drawn on the main thread): which cell a shop kind shows. */
export const SHOP_CELLS = ["cafe", "konbini", "ramen", "boutique", "bar", "lobby", "florist", "market"] as const;
const shopCell = (kind: string | undefined, seed: number) => {
  const k = kind ?? "";
  const i = (SHOP_CELLS as readonly string[]).indexOf(k === "karaoke" ? "bar" : k === "tea" ? "cafe" : k === "izakaya" ? "bar" : k === "shop" ? "boutique" : k === "news" ? "market" : k);
  return i >= 0 ? i : [0, 3, 7, 4][seed % 4];
};

export interface RGeo {
  pos: Float32Array;
  nor: Float32Array;
  uv: Float32Array;
  col: Float32Array;
  idx: number[];
}

/** Grows one slot's arrays. */
class Buf {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
}

type V3 = [number, number, number];
type UV = (p: V3) => [number, number];

/** A tiny seeded random. */
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
const hex = (h: string): V3 => {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((c) => Math.pow(c, 2.2)) as V3;
};

export interface BuildOpts {
  /** 0 full, 1 half (no small things), 2 far (the massing, its facades and windows). */
  lod: 0 | 1 | 2;
  /** Cut off at this height (voxels) and capped: the walls-down copy. */
  clipY?: number;
}

/** The types built realistically (the rest stay voxel this round). */
export const REAL_TYPES = new Set(["shophouse", "apartment", "office", "house", "izakaya", "machiya"]);

/**
 * A building's geometry by slot, in metres in the model's frame (w × h × d voxels, centred on x and z
 * like the meshed models), from its job and its voxel layout.
 */
export function realBuilding(j: BuildingJob, b: Built, o: BuildOpts): Partial<Record<Slot, RGeo>> {
  const M = new Model(b.model.w, b.model.d, o);
  const [x0, , x1, D] = b.body;
  const H = b.model.h - 26;
  const seed = j.seed * 7 + j.width;
  const r = rng(seed + 11);
  const [cx, cz] = j.face === "s" || j.face === "n" ? [j.along, j.front] : [j.front, j.along];
  const zone = zoneAt(cx, cz);
  const opts = j.opts as Record<string, unknown>;
  const pastel = ["pink", "mint", "peach", "sky", "lilac", "lemon"].includes(String(opts.wall ?? ""));
  const ctx: Ctx = { M, j, b, x0, x1, D, H, r, seed, zone, opts, pastel };
  switch (j.type) {
    case "office":
      office(ctx);
      break;
    case "apartment":
      apartment(ctx);
      break;
    case "shophouse":
      shophouse(ctx);
      break;
    case "house":
      house(ctx);
      break;
    case "izakaya":
      izakaya(ctx);
      break;
    case "machiya":
      machiya(ctx);
      break;
  }
  signBacks(ctx);
  if (o.clipY !== undefined) M.cap(x0, 0, x1, D, o.clipY);
  return M.out();
}

interface Ctx {
  M: Model;
  j: BuildingJob;
  b: Built;
  x0: number;
  x1: number;
  D: number;
  H: number;
  r: () => number;
  seed: number;
  zone: string;
  opts: Record<string, unknown>;
  pastel: boolean;
}

// ---- the geometry writer ----------------------------------------------------------------------

class Model {
  private bufs = new Map<Slot, Buf>();
  constructor(
    readonly w: number,
    readonly d: number,
    readonly o: BuildOpts,
  ) {}

  get lod() {
    return this.o.lod;
  }

  private buf(s: Slot) {
    let b = this.bufs.get(s);
    if (!b) this.bufs.set(s, (b = new Buf()));
    return b;
  }

  /** A quad a, b, c, d (counter-clockwise seen from the side the normal points to). */
  quad(s: Slot, a: V3, b: V3, c: V3, d: V3, n: V3, uv: UV, col: V3) {
    const clip = this.o.clipY;
    if (clip !== undefined) {
      const lo = Math.min(a[1], b[1], c[1], d[1]);
      if (lo >= clip - 1e-6) return;
      for (const p of [a, b, c, d]) if (p[1] > clip) p[1] = clip;
    }
    // (wound to face its normal, whatever order the caller gave)
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
      e3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (Math.abs(cr[0]) + Math.abs(cr[1]) + Math.abs(cr[2]) < 1e-9) cr = [e2[1] * e3[2] - e2[2] * e3[1], e2[2] * e3[0] - e2[0] * e3[2], e2[0] * e3[1] - e2[1] * e3[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) [b, d] = [d, b];
    const B = this.buf(s);
    const base = B.pos.length / 3;
    for (const p of [a, b, c, d]) {
      B.pos.push(p[0], p[1], p[2]);
      B.nor.push(n[0], n[1], n[2]);
      const t = uv(p);
      B.uv.push(t[0], t[1]);
      B.col.push(col[0], col[1], col[2]);
    }
    B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * A box (voxel units). `uvs` picks each face's mapping by its normal (default: world mapping for
   * the slot's set); `skip` leaves faces out ("-y" for anything on the ground, …).
   */
  box(s: Slot, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: V3 = WHITE, o: { uv?: (n: V3) => UV; skip?: string } = {}) {
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
    const sk = o.skip ?? "";
    const uvf = o.uv ?? ((n: V3) => worldUV(s, n));
    if (!sk.includes("+z")) this.quad(s, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], uvf([0, 0, 1]), col);
    if (!sk.includes("-z")) this.quad(s, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], uvf([0, 0, -1]), col);
    if (!sk.includes("+x")) this.quad(s, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], uvf([1, 0, 0]), col);
    if (!sk.includes("-x")) this.quad(s, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], uvf([-1, 0, 0]), col);
    if (!sk.includes("+y")) this.quad(s, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], uvf([0, 1, 0]), col);
    if (!sk.includes("-y")) this.quad(s, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], uvf([0, -1, 0]), col);
  }

  /** An upright octagonal prism (tanks, poles), centred on x, z, radius r. */
  prism(s: Slot, x: number, z: number, r: number, y0: number, y1: number, col: V3 = WHITE, sides = 8) {
    const t = WORLD_TILE[s] ?? [2, 2];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2,
        a1 = ((i + 1) / sides) * Math.PI * 2;
      const p0: V3 = [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r],
        p1: V3 = [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r];
      const am = (a0 + a1) / 2;
      const n: V3 = [Math.cos(am), 0, Math.sin(am)];
      const u0 = (i * 2 * Math.PI * r * VOX) / sides / t[0],
        u1 = ((i + 1) * 2 * Math.PI * r * VOX) / sides / t[0];
      // (wound outward)
      this.quad(s, [p1[0], y0, p1[2]], [p0[0], y0, p0[2]], [p0[0], y1, p0[2]], [p1[0], y1, p1[2]], n, (p) => [p[0] === p1[0] && p[2] === p1[2] ? u1 : u0, (p[1] * VOX) / t[1]], col);
    }
    // the lid
    const lid: V3[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      lid.push([x + Math.cos(a) * r, y1, z + Math.sin(a) * r]);
    }
    for (let i = 1; i < sides - 1; i++) this.quad(s, lid[0], lid[i + 1], lid[i + 1], lid[i], [0, 1, 0], (p) => [(p[0] * VOX) / t[0], (p[2] * VOX) / t[1]], col);
  }

  /** The walls-down copy's lid: a dark roof over the footprint at the cut. */
  cap(x0: number, z0: number, x1: number, z1: number, y: number) {
    const clip = this.o.clipY;
    this.o.clipY = undefined;
    this.box("roof", x0 + 0.01, y - 0.4, z0 + 0.01, x1 - 0.01, y, z1 - 0.01, hex("#5a5862"), { skip: "-y" });
    this.o.clipY = clip;
  }

  out() {
    const res: Partial<Record<Slot, RGeo>> = {};
    const ox = this.w / 2,
      oz = this.d / 2;
    for (const [s, B] of this.bufs) {
      if (!B.idx.length) continue;
      const pos = new Float32Array(B.pos.length);
      for (let i = 0; i < B.pos.length; i += 3) {
        pos[i] = (B.pos[i] - ox) * VOX;
        pos[i + 1] = B.pos[i + 1] * VOX;
        pos[i + 2] = (B.pos[i + 2] - oz) * VOX;
      }
      res[s] = { pos, nor: Float32Array.from(B.nor), uv: Float32Array.from(B.uv), col: Float32Array.from(B.col), idx: B.idx };
    }
    return res;
  }
}

const WHITE: V3 = [1, 1, 1];

/** World mapping for a slot's set by the face's normal (metres / tile). */
function worldUV(s: Slot, n: V3): UV {
  const t = WORLD_TILE[s] ?? [2, 2];
  if (n[1] !== 0) return (p) => [(p[0] * VOX) / t[0], (p[2] * VOX) / t[1]];
  // (u left to right as seen from outside the face)
  if (n[0] !== 0) return (p) => [(-p[2] * n[0] * VOX) / t[0], (p[1] * VOX) / t[1]];
  return (p) => [(p[0] * n[2] * VOX) / t[0], (p[1] * VOX) / t[1]];
}

/**
 * A photographed facade on a wall from `a0` to `a1` (along x for ±z faces, along z for ±x faces),
 * from `y0` up, floors of `fh` voxels: whole window bays across the wall, whole floors up it, so the
 * windows line up with the building's own floors and edges.
 */
function facadeUV(s: Slot, a0: number, a1: number, y0: number, fh: number, n: V3, uOff: number): UV {
  const F = FACADE[s]!;
  const len = Math.abs(a1 - a0) * VOX;
  const bays = Math.max(1, Math.round(len / F.bay));
  const along = n[2] !== 0 ? 0 : 2;
  const flip = n[2] < 0 || n[0] > 0;
  return (p) => {
    let t = (p[along] - a0) / (a1 - a0);
    if (flip) t = 1 - t;
    return [uOff + (t * bays) / F.bays, (p[1] - y0) / (fh * F.floors)];
  };
}

/** The four walls of a block from y0 to y1 in a facade set (front +z at z1). */
function facadeBlock(M: Model, s: Slot, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, fh: number, r: () => number, col: V3 = WHITE, skip = "") {
  const F = FACADE[s]!;
  const uOff = Math.floor(r() * F.bays) / F.bays;
  M.box(s, x0, y0, z0, x1, y1, z1, col, {
    skip: "+y-y" + skip,
    uv: (n) => (n[2] !== 0 ? facadeUV(s, x0, x1, y0, fh, n, uOff) : facadeUV(s, z0, z1, y0, fh, n, uOff + 0.5)),
  });
}

// ---- parts --------------------------------------------------------------------------------------

/** A window: a frame proud of the wall, dark glass set back in it, a sill (voxel units, on the front face at z). */
function windowAt(M: Model, x: number, y: number, z: number, w: number, h: number, r: () => number, frame: Slot = "metal", fcol: V3 = hex("#2a2a30")) {
  const lit = r();
  const warm = r() > 0.3 ? 1 : 0;
  // the glass (its colour carries the night: lit share, warm or cool, a shade)
  M.box("glass", x, y, z - 0.6, x + w, y + h, z - 0.3, [lit, warm, 0.4 + r() * 0.6], { skip: "-z-x+x-y+y" });
  if (M.lod >= 2) return;
  const f = 0.45;
  M.box(frame, x - f, y - f, z - 0.6, x, y + h + f, z + 0.35, fcol, { skip: "-z" });
  M.box(frame, x + w, y - f, z - 0.6, x + w + f, y + h + f, z + 0.35, fcol, { skip: "-z" });
  M.box(frame, x, y + h, z - 0.6, x + w, y + h + f, z + 0.35, fcol, { skip: "-z" });
  M.box(frame, x, y - f, z - 0.6, x + w, y, z + 0.35, fcol, { skip: "-z" });
  if (M.lod === 0) {
    // a sill and a mullion
    M.box("concrete", x - 0.8, y - f - 0.6, z - 0.2, x + w + 0.8, y - f, z + 1.1, hex("#d8d4cc"), { skip: "-z" });
    if (w > 7) M.box(frame, x + w / 2 - 0.2, y, z - 0.5, x + w / 2 + 0.2, y + h, z + 0.1, fcol, { skip: "-z" });
  }
}

/** Rows of windows across a wall's front (z), one row per floor. */
function windowRows(M: Model, x0: number, x1: number, z: number, levels: number[], fh: number, r: () => number, o: { w?: number; h?: number; frame?: Slot; fcol?: V3; ac?: number } = {}) {
  const ww = o.w ?? 7,
    wh = o.h ?? Math.min(fh - 6, 10);
  const n = Math.max(1, Math.floor((x1 - x0 - 3) / (ww + 5)));
  const gap = (x1 - x0 - n * ww) / (n + 1);
  for (const y of levels)
    for (let k = 0; k < n; k++) {
      const x = x0 + gap + k * (ww + gap);
      const wy = y + (fh - wh) * 0.55;
      windowAt(M, x, wy, z, ww, wh, r, o.frame, o.fcol);
      if (M.lod === 0 && r() < (o.ac ?? 0.25)) acUnit(M, x + ww + 0.8, wy + 1, z, r);
    }
}

/** An air-conditioning unit hung on the wall (or standing on a roof: `z` its back). */
function acUnit(M: Model, x: number, y: number, z: number, r: () => number, onRoof = false) {
  const c = hex(r() > 0.5 ? "#d6d6d0" : "#b8bcc0");
  if (onRoof) {
    M.box("metal", x, y, z, x + 5, y + 4, z + 4, c, { skip: "-y" });
    M.box("metal", x + 0.5, y + 4, z + 0.5, x + 4.5, y + 4.3, z + 3.5, hex("#3a3a40"), { skip: "-y" });
    return;
  }
  M.box("metal", x, y, z, x + 4, y + 3, z + 2.2, c);
  M.box("metal", x + 0.4, y + 0.4, z + 2.2, x + 3.6, y + 2.6, z + 2.3, hex("#55575c"), { skip: "-z" });
}

/** A roof: its slab, a parapet round the edge, its plant (AC units, a tank, a stair house, an antenna). */
function roof(c: Ctx, y: number, o: { parapet?: number; tank?: boolean; stairs?: boolean; garden?: boolean; units?: number } = {}) {
  const { M, x0, x1, D, r } = c;
  const p = o.parapet ?? 4;
  M.box("roof", x0 + 0.5, y - 0.6, 0.5, x1 - 0.5, y + 0.2, D - 0.5, hex("#9a968e"), { skip: "-y-x+x-z+z" });
  // the parapet, coped in concrete
  const pc = hex("#d0ccc4");
  M.box("concrete", x0, y, D - 1.2, x1, y + p, D, pc, { skip: "-y" });
  M.box("concrete", x0, y, 0, x1, y + p, 1.2, pc, { skip: "-y" });
  M.box("concrete", x0, y, 1.2, x0 + 1.2, y + p, D - 1.2, pc, { skip: "-y" });
  M.box("concrete", x1 - 1.2, y, 1.2, x1, y + p, D - 1.2, pc, { skip: "-y" });
  if (M.lod >= 2) return;
  const W = x1 - x0;
  if (o.garden) {
    M.box("fabric", x0 + 2, y + 0.2, 2, x1 - 2, y + 1.4, D - 2, hex("#4a7a3a"), { skip: "-y" });
    for (let i = 0; i < Math.floor(W / 10); i++) M.box("wood", x0 + 4 + i * 10, y + 0.2, D / 2 - 2, x0 + 8 + i * 10, y + 2.6, D / 2 + 2, WHITE, { skip: "-y" });
    // a pergola
    M.box("wood", x0 + 3, y + 0.2, 3, x0 + 3.6, y + 12, 3.6);
    M.box("wood", x1 - 3.6, y + 0.2, 3, x1 - 3, y + 12, 3.6);
    M.box("wood", x0 + 3, y + 12, 3, x1 - 3, y + 12.6, 3.6);
    return;
  }
  if (M.lod >= 1) {
    if (W > 24) M.box("concrete", x0 + 3, y, 3, x0 + 13, y + 14, 12, hex("#c8c4bc"), { skip: "-y" });
    return;
  }
  if ((o.stairs ?? true) && W > 24) {
    M.box("concrete", x0 + 3, y, 3, x0 + 13, y + 14, 12, hex("#c8c4bc"), { skip: "-y" });
    M.box("metal", x0 + 5, y, 12, x0 + 10, y + 11, 12.3, hex("#4a4c52"), { skip: "-y-z" });
  }
  if (o.tank ?? r() > 0.4) {
    const tx = x1 - 8,
      tz = 8 + r() * Math.max(1, D - 18);
    for (const [dx, dz] of [
      [-3, -3],
      [3, -3],
      [-3, 3],
      [3, 3],
    ])
      M.box("metal", tx + dx - 0.4, y, tz + dz - 0.4, tx + dx + 0.4, y + 6, tz + dz + 0.4, hex("#3a3a40"));
    M.prism("metal", tx, tz, 5, y + 6, y + 15, hex("#8a8e94"));
  }
  const n = o.units ?? 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) acUnit(M, x0 + 3 + r() * Math.max(1, W - 10), y, D * 0.35 + r() * D * 0.4, r, true);
  if (r() > 0.5) {
    const ax = x0 + 3 + r() * (W - 6);
    M.box("metal", ax, y, D / 2, ax + 0.4, y + 18 + r() * 12, D / 2 + 0.4, hex("#2a2a30"));
  }
}

/**
 * A fire escape on a brick front (the old city's): a steel landing at each floor from the first up,
 * its handrail, a stair down from each to the one below, alternating sides; a drop ladder over the
 * pavement.
 */
function fireEscape(M: Model, x0: number, x1: number, z: number, levels: number[]) {
  if (M.lod >= 2 || levels.length < 2) return;
  const k = hex("#1c1d21");
  const w = x1 - x0;
  for (let i = 0; i < levels.length; i++) {
    const y = levels[i] + 0.2;
    M.box("metal", x0, y - 0.4, z, x1, y, z + 5, k);
    if (M.lod === 0) {
      M.box("metal", x0, y + 5.5, z + 4.6, x1, y + 5.9, z + 5, k);
      for (let x = x0; x <= x1; x += Math.max(2, w / 6)) M.box("metal", x, y, z + 4.6, x + 0.3, y + 5.5, z + 5, k);
      M.box("metal", x0, y + 5.5, z, x0 + 0.3, y + 5.9, z + 5, k);
      M.box("metal", x1 - 0.3, y + 5.5, z, x1, y + 5.9, z + 5, k);
    }
    // the stair down to the landing below (or to the drop ladder's hatch)
    // (its lowest flight ends over head height: the pavement under it stays clear)
    const yb = i > 0 ? levels[i - 1] + 0.2 : levels[0] - 4;
    const left = i % 2 === 0;
    const sx0 = left ? x0 + 1 : x0 + w * 0.45,
      sx1 = left ? x0 + w * 0.55 : x1 - 1;
    const a: V3 = left ? [sx1, y, z + 1] : [sx0, y, z + 1];
    const bb: V3 = left ? [sx0, yb, z + 1] : [sx1, yb, z + 1];
    const run = Math.hypot(sx1 - sx0, y - yb);
    const n: V3 = [left ? (y - yb) / run : -(y - yb) / run, (sx1 - sx0) / run, 0];
    for (const dz of [0, 2.6]) M.quad("metal", [a[0], a[1], a[2] + dz], [bb[0], bb[1], bb[2] + dz], [bb[0], bb[1], bb[2] + dz + 1.4], [a[0], a[1], a[2] + dz + 1.4], n, (p) => [p[0] * 0.2, p[1] * 0.2], k);
  }
  // the drop ladder, folded up under the first landing
  M.box("metal", x0 + 2, levels[0] - 4.5, z + 3.8, x0 + 4, levels[0], z + 4.2, k);
}

/** Ledges at each floor (plaster buildings) or a band at a few. */
function ledges(M: Model, x0: number, x1: number, z: number, ys: number[], col: V3) {
  if (M.lod >= 2) return;
  for (const y of ys) M.box("concrete", x0 - 0.3, y - 0.8, z - 0.5, x1 + 0.3, y, z + 0.9, col);
}

/** A cornice at the top of a facade. */
function cornice(M: Model, x0: number, x1: number, z: number, y: number, col: V3) {
  M.box("concrete", x0 - 0.8, y - 1.5, z - 1, x1 + 0.8, y, z + 1.6, col);
  if (M.lod === 0) M.box("concrete", x0 - 0.3, y - 3, z - 0.5, x1 + 0.3, y - 1.5, z + 0.8, col);
}

/**
 * A shop's ground floor: a glazed front onto the lit interior (the atlas cell for its kind), mullions,
 * the fascia the sign is mounted on, an awning below it; the door where the plan has it.
 */
function shopfront(c: Ctx, x0: number, x1: number, top: number, kind: string | undefined, o: { awning?: V3 | null; fascia?: Slot; fcol?: V3 } = {}) {
  const { M, D, r, seed } = c;
  const z = D;
  const sign = c.b.signs.find((s) => !s.vertical && s.facing === "front" && s.y < top + 4);
  const glassTop = sign ? Math.max(9, sign.y - sign.h / 2 - 0.6) : top - 4;
  // the recess: the interior plane set back 1 voxel, the glass in front of it
  interior(M, shopCell(kind, seed), x0 + 0.6, x1 - 0.6, 0.6, glassTop, z - 1.6);
  // the reveal: sides and head of the opening, a step
  M.box("metal", x0, 0, z - 1.6, x0 + 0.6, glassTop + 0.6, z, hex("#2c2d32"), { skip: "-z" });
  M.box("metal", x1 - 0.6, 0, z - 1.6, x1, glassTop + 0.6, z, hex("#2c2d32"), { skip: "-z" });
  M.box("concrete", x0, 0, z - 1.6, x1, 0.6, z + 0.4, hex("#b8b4ac"), { skip: "-y" });
  if (M.lod <= 1) {
    // mullions
    const n = Math.max(1, Math.round((x1 - x0) / 9));
    for (let k = 1; k < n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      M.box("metal", x - 0.25, 0.6, z - 0.9, x + 0.25, glassTop, z - 0.5, hex("#2c2d32"));
    }
    M.box("metal", x0 + 0.6, glassTop - 0.5, z - 0.9, x1 - 0.6, glassTop, z - 0.4, hex("#2c2d32"));
  }
  // the fascia up to the floor above
  const fs = o.fascia ?? "metal";
  M.box(fs, x0, glassTop + 0.6, z - 1.2, x1, top, z + 0.5, o.fcol ?? hex("#25262b"), { skip: "-z" });
  // the awning: a canvas slope out over the pavement, under the sign
  if (o.awning !== null && M.lod <= 1 && (o.awning || r() > 0.45)) {
    const col = o.awning ?? hex(["#7a1f24", "#1f3a5a", "#2a4a2e", "#3a2c24", "#c8b89a"][Math.floor(r() * 5)]);
    const ay = Math.max(glassTop - 1, 15.5);
    M.quad("awning", [x0 + 0.5, ay, z + 0.5], [x1 - 0.5, ay, z + 0.5], [x1 - 0.5, ay - 3.2, z + 7], [x0 + 0.5, ay - 3.2, z + 7], [0, 0.89, 0.45], (p) => [p[0] * 0.1, p[2] * 0.1], col);
    M.quad("awning", [x0 + 0.5, ay - 3.2, z + 7], [x1 - 0.5, ay - 3.2, z + 7], [x1 - 0.5, ay - 4.8, z + 7], [x0 + 0.5, ay - 4.8, z + 7], [0, 0, 1], (p) => [p[0] * 0.1, p[1] * 0.1], col);
  }
}

/** A lit interior seen through glass: the atlas's cell on a plane facing +z at z, from y0 to y1. */
function interior(M: Model, cell: number, x0: number, x1: number, y0: number, y1: number, z: number) {
  const cu0 = (cell % 4) / 4,
    row = Math.floor(cell / 4);
  // (the canvas's top row is v 0.5…1, its bottom row 0…0.5)
  const vb = row === 0 ? 0.5 : 0;
  M.quad("shop", [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], (p) => [cu0 + ((p[0] - x0) / (x1 - x0)) * 0.25, vb + ((p[1] - y0) / (y1 - y0)) * 0.5], WHITE);
}

/** A street door: a frame, a dark leaf with its glass panel. */
function doorAt(M: Model, x: number, z: number, w = 6, h = 13, col: V3 = hex("#3a2a20")) {
  M.box("wood", x, 0.6, z - 1, x + w, h, z - 0.6, col, { skip: "-z" });
  M.box("glass", x + 1.2, 6, z - 0.6, x + w - 1.2, h - 1.5, z - 0.5, [0.6, 1, 0.6], { skip: "-z-x+x-y+y" });
  M.box("metal", x - 0.6, 0.6, z - 1, x, h + 0.6, z + 0.3, hex("#2a2a30"), { skip: "-z" });
  M.box("metal", x + w, 0.6, z - 1, x + w + 0.6, h + 0.6, z + 0.3, hex("#2a2a30"), { skip: "-z" });
  M.box("metal", x - 0.6, h, z - 1, x + w + 0.6, h + 0.6, z + 0.3, hex("#2a2a30"), { skip: "-z" });
}

/** The signs' backs: a lightbox behind each front sign, the box of each vertical sign, a billboard's frame. */
function signBacks(c: Ctx) {
  const { M, b } = c;
  for (const s of b.signs) {
    if (s.vertical) {
      M.box("metal", s.x - 1, s.y - s.h / 2 - 0.5, s.z - 3, s.x + 1, s.y + s.h / 2 + 0.5, s.z + 3, hex("#1c1c22"));
    } else if (s.facing === "front") {
      // (back to the wall when the sign stands out from it)
      M.box("metal", s.x - s.w / 2 - 0.4, s.y - s.h / 2 - 0.4, Math.min(s.z - 0.9, c.D - 0.5), s.x + s.w / 2 + 0.4, s.y + s.h / 2 + 0.4, s.z - 0.05, hex("#18181e"));
      // a billboard up on a roof: its legs
      if (s.y > 60) for (const x of [s.x - s.w / 3, s.x + s.w / 3]) M.box("metal", x - 0.4, s.y - s.h / 2 - 12, s.z - 2.5, x + 0.4, s.y - s.h / 2, s.z - 1.7, hex("#2a2a30"));
    }
  }
}

// ---- the archetypes ---------------------------------------------------------------------------------

/** The office towers: a lobby of tall glass, a curtain wall in a photographed set, setbacks, a crown. */
function office(c: Ctx) {
  const { M, x0, x1, D, H, r, opts } = c;
  const gh = 22,
    fh = 14;
  const wall = String(opts.wall ?? "");
  // the curtain wall: dark glass, green glass, ribbons, fins — by the brief's wall and the zone
  const sets: Slot[] = wall === "dark" ? ["f001", "f017"] : wall === "blue" ? ["f005", "f001"] : wall === "violet" ? ["f017", "f006"] : wall === "concrete" ? ["f006", "f019"] : c.zone === "finance" ? ["f001", "f005"] : ["f006", "f017", "f001"];
  const s = sets[Math.floor(r() * sets.length)];
  const floors = Math.round((H - gh - 4) / fh) + 1;
  // setbacks: a tall one steps in twice near the top
  const steps = floors > 22 ? 2 : floors > 13 ? 1 : 0;
  let y = gh,
    ix = 0;
  const top = H;
  const stepAt = [Math.round(top * 0.72), Math.round(top * 0.88)];
  const trim = hex("#c9c6c0");
  for (let k = 0; k <= steps; k++) {
    const yEnd = k < steps ? stepAt[k] : top;
    const ax0 = x0 + ix,
      ax1 = x1 - ix,
      az0 = ix,
      az1 = D - ix;
    facadeBlock(M, s, ax0, az0, ax1, az1, y, yEnd, fh, r);
    // the curtain wall's fins: slim aluminium blades on the front and the back every couple of
    // bays, and its corners — they catch the light and throw lines of shadow
    if (M.lod <= 1 && (s === "f001" || s === "f005" || s === "f017")) {
      const fin = hex("#8c9198");
      const bay = (FACADE[s]!.bay / VOX) * 2;
      const n = Math.max(1, Math.round((ax1 - ax0) / bay));
      for (let i = 0; i <= n; i++) {
        const x = ax0 + ((ax1 - ax0) * i) / n;
        M.box("metal", x - 0.25, y, az1, x + 0.25, yEnd, az1 + 0.8, fin, { skip: "-z" });
        if (M.lod === 0) M.box("metal", x - 0.25, y, az0 - 0.8, x + 0.25, yEnd, az0, fin, { skip: "+z" });
      }
    }
    if (k < steps) {
      // the terrace at the setback
      M.box("concrete", ax0, yEnd - 0.8, az0, ax1, yEnd, az1, trim);
      ix += 3;
    }
    y = yEnd;
  }
  // the lobby: a double-height glass front, lit within, on stone piers; a canopy
  const z = D;
  M.box("concrete", x0, 0, 0, x1, gh, D - 4, hex("#d8d3c8"), { skip: "+z" });
  interior(M, 5, x0 + 2, x1 - 2, 0.6, gh - 3, z - 4);
  for (const x of [x0, x1 - 2]) M.box("concrete", x, 0, z - 4, x + 2, gh, z, hex("#e4dfd4"), { skip: "-y" });
  if (M.lod <= 1) for (let x = x0 + 8; x < x1 - 4; x += 8) M.box("metal", x - 0.3, 0.6, z - 3.2, x + 0.3, gh - 3, z - 2.8, hex("#202126"));
  M.box("concrete", x0, gh - 3, z - 4, x1, gh, z, trim, { skip: "-z" });
  M.box("metal", x0 + 3, gh - 2.5, z, x1 - 3, gh - 1.5, z + 6, hex("#2a2b30"));
  // the crown: a parapet band, lit edges for a supertall, a mast
  const tx0 = x0 + ix,
    tx1 = x1 - ix;
  M.box("concrete", tx0 - 0.5, top, ix - 0.5, tx1 + 0.5, top + 3, D - ix + 0.5, hex("#2c2d32"), { skip: "-y" });
  M.box("roof", tx0, top - 0.5, ix, tx1, top + 0.2, D - ix, hex("#8a8680"), { skip: "-y" });
  const crown = opts.crown as string | undefined;
  if (crown) {
    const n = hex(crown).map((v) => v * 3) as V3;
    for (const xx of [tx0 - 0.6, tx1 + 0.1]) for (const zz of [ix - 0.6, D - ix + 0.1]) M.box("neon", xx, gh, zz, xx + 0.5, top + 3, zz + 0.5, n);
    M.box("neon", tx0 - 0.6, top + 2.6, D - ix + 0.1, tx1 + 0.6, top + 3.1, D - ix + 0.6, n);
  }
  const spire = opts.spire as number | undefined;
  if (M.lod <= 1) {
    if (spire) {
      const mx = (tx0 + tx1) / 2,
        mz = D / 2;
      M.box("concrete", mx - 4, top + 3, mz - 4, mx + 4, top + 9, mz + 4, hex("#3a3b40"));
      M.prism("metal", mx, mz, 1, top + 9, top + 9 + spire, hex("#b0b4ba"), 6);
      M.box("neon", mx - 0.8, top + 9 + spire, mz - 0.8, mx + 0.8, top + 11 + spire, mz + 0.8, [3, 0.2, 0.2]);
    } else if (M.lod === 0) {
      for (let i = 0; i < 3; i++) acUnit(M, tx0 + 3 + r() * Math.max(1, tx1 - tx0 - 10), top + 0.2, 4 + r() * (D - 14), r, true);
      M.box("metal", tx1 - 6, top, D / 2, tx1 - 5.6, top + 22, D / 2 + 0.4, hex("#2a2a30"));
    }
  }
}

/** Facade set and colour for a residential block, by its brief, its zone and its number. */
function residentialSet(c: Ctx): { s: Slot | "plaster" | "brick"; tint: V3 } {
  const wall = String(c.opts.wall ?? "");
  const P: Record<string, string> = { pink: "#f2c4cf", mint: "#bfe6d6", peach: "#f6d2b8", sky: "#c6dcf2", lilac: "#d8cdf0", lemon: "#f2e8b4" };
  if (P[wall]) return { s: "plaster", tint: hex(P[wall]) };
  const r = c.r();
  // (the photographed sets a shade lighter or darker, building to building)
  const shade = (0.86 + 0.18 * c.r()) as number;
  const T: V3 = [shade, shade, shade];
  if (wall === "brick" || wall === "warm") return { s: r > 0.5 ? "f018" : "f020", tint: T };
  if (wall === "cream" || wall === "tile") return r > 0.5 ? { s: "f019", tint: T } : { s: "plaster", tint: hex(["#ece4d4", "#e6dccb", "#f0ebe0"][Math.floor(r * 6) % 3]) };
  if (wall === "concrete" || wall === "blue" || wall === "dark") return { s: "f019", tint: T };
  // the south and the bay: light stucco; elsewhere the city's brick and concrete
  if (c.zone === "southbank" || c.zone === "marina" || c.zone === "south") return r > 0.4 ? { s: "plaster", tint: hex(["#efe6d6", "#f2dccb", "#e2e6e8"][Math.floor(r * 9) % 3]) } : { s: "f019", tint: T };
  const pick = (["f018", "f019", "f020", "brick", "plaster"] as const)[Math.floor(r * 5)];
  return { s: pick, tint: pick === "plaster" ? hex(["#efe6d6", "#e8e2d6", "#f2ece2"][Math.floor(r * 15) % 3]) : T };
}

/** The walls of a plain block (plaster or brick) with punched windows on the front and a little on the side. */
function punchedBlock(c: Ctx, s: "plaster" | "brick", tint: V3, y0: number, y1: number, fh: number, levels: number[], o: { ww?: number; ac?: number } = {}) {
  const { M, x0, x1, D, r } = c;
  M.box(s, x0, y0, 0, x1, y1, D, tint, { skip: "-y+y" });
  const frame: Slot = s === "plaster" ? "concrete" : "metal";
  const fcol = s === "plaster" ? hex("#f4f1ea") : hex("#2a2a30");
  windowRows(M, x0 + 1, x1 - 1, D, levels, fh, r, { w: o.ww, frame, fcol, ac: o.ac });
  // a column of windows on the +x side (seen at the corners)
  if (M.lod <= 1)
    for (const y of levels)
      for (let z = 6; z < D - 8; z += 12) {
        M.box("glass", x1 + 0.3, y + 3, z, x1 + 0.6, y + fh - 4, z + 5, [r(), 1, 0.6], { skip: "-x-z+z-y+y" });
        if (M.lod === 0) M.box(frame, x1, y + 2.5, z - 0.5, x1 + 0.8, y + 3, z + 5.5, fcol);
      }
}

function apartment(c: Ctx) {
  const { M, x0, x1, D, H, r, opts } = c;
  const gh = 18,
    fh = 16;
  const floors = Math.round((H - gh - 2) / fh) + 1;
  const { s, tint } = residentialSet(c);
  const levels = Array.from({ length: floors - 1 }, (_, i) => gh + i * fh);
  const top = H - 2;
  if (s === "plaster" || s === "brick") {
    punchedBlock(c, s, tint, gh, top, fh, levels, { ac: 0.2 });
    ledges(M, x0, x1, D, levels.slice(1), s === "plaster" ? hex("#f6f3ec") : hex("#c8c2b8"));
    if (c.pastel) {
      // art deco: an eyebrow over each floor, a stepped crown, a vertical fin
      cornice(M, x0, x1, D, top, hex("#fbf8f2"));
      const mx = (x0 + x1) / 2;
      M.box("plaster", mx - 1.5, gh, D, mx + 1.5, top + 8, D + 1.4, hex("#fbf8f2"));
    } else cornice(M, x0, x1, D, top, hex("#d4cec4"));
  } else {
    facadeBlock(M, s, x0, 0, x1, D, gh, top, fh, r, tint);
    cornice(M, x0, x1, D, top, hex("#cfcac2"));
  }
  // the ground floor: an entrance lobby (where the door is), stone walls
  const [dx] = c.b.door;
  M.box("concrete", x0, 0, 0, x1, gh, D, hex("#e2ddd2"), { skip: "-y+y+z" });
  M.box("concrete", x0, 0, D - 0.6, dx - 5, gh, D, hex("#e8e3d8"), { skip: "-y" });
  M.box("concrete", dx + 5, 0, D - 0.6, x1, gh, D, hex("#e8e3d8"), { skip: "-y" });
  interior(M, 5, dx - 5, dx + 5, 0.6, gh - 4, D - 2);
  M.box("concrete", dx - 5, gh - 4, D - 2, dx + 5, gh, D, hex("#e8e3d8"), { skip: "-z" });
  M.box("metal", dx - 6, gh - 3, D, dx + 6, gh - 2.2, D + 5, hex("#2a2b30"));
  if (x1 - x0 > 30 && M.lod <= 1) windowAt(M, x1 - 12, 5, D, 8, 8, r, "metal", hex("#2a2a30"));
  // balconies: every unit, every floor (the city's people stand on them: the voxel rhythm kept)
  const W = x1 - x0;
  const unit = Math.floor(W / Math.max(2, Math.round(W / 15)));
  const balc = hex("#e2ded6");
  const balcWall = s === "plaster" ? tint.map((v) => Math.min(1, v * 1.04)) as V3 : hex(["#e8e4dc", "#d8d2c8", "#c9c2b6"][c.seed % 3]);
  if (M.lod <= 1)
    for (let f = 1; f < floors; f++) {
      const y = gh + (f - 1) * fh;
      for (let x = x0; x + unit <= x1 + 1; x += unit) {
        const bx0 = x + 1,
          bx1 = Math.min(x + unit, x1) - 1;
        // the slab, a solid parapet in the building's paint (the city's balconies: no black glass), a slim rail on posts
        M.box("concrete", bx0, y - 0.6, D, bx1, y + 0.4, D + 5, balc);
        M.box("plaster", bx0, y + 0.4, D + 4.2, bx1, y + 4.6, D + 5, balcWall, { skip: "-y" });
        if (M.lod === 0) {
          M.box("plaster", bx0, y + 0.4, D, bx0 + 0.6, y + 4.6, D + 4.2, balcWall, { skip: "-y" });
          M.box("plaster", bx1 - 0.6, y + 0.4, D, bx1, y + 4.6, D + 4.2, balcWall, { skip: "-y" });
          M.box("metal", bx0, y + 6.2, D + 4.5, bx1, y + 6.6, D + 4.9, hex("#2e3036"));
          for (let xx = bx0 + 0.2; xx < bx1 - 0.2; xx += Math.max(2, (bx1 - bx0) / 4)) M.box("metal", xx, y + 4.6, D + 4.6, xx + 0.25, y + 6.2, D + 4.8, hex("#2e3036"));
        }
      }
    }
  roof(c, top, { garden: !!opts.garden, tank: true });
}

function shophouse(c: Ctx) {
  const { M, x0, x1, D, H, r, opts } = c;
  const gh = 20,
    fh = 16;
  const floors = Math.round((H - gh - 2) / fh) + 1;
  const top = H - 2;
  const levels = Array.from({ length: floors - 1 }, (_, i) => gh + i * fh);
  const shop = opts.shop as string | undefined;
  // upstairs
  const { s, tint } = residentialSet(c);
  if (s === "plaster" || s === "brick" || x1 - x0 < 34) {
    const w: "plaster" | "brick" = s === "brick" || s === "f018" || s === "f020" ? "brick" : "plaster";
    punchedBlock(c, w, w === "plaster" ? tint : WHITE, gh, top, fh, levels, { ac: 0.45 });
    ledges(M, x0, x1, D, [gh, ...levels.slice(1)], w === "plaster" ? hex("#f2efe8") : hex("#c8c2b8"));
    if (w === "brick" && levels.length >= 2 && (opts.fireEscape || r() > 0.45)) fireEscape(M, x0 + 2, x1 - 2, D, levels);
  } else {
    facadeBlock(M, s, x0, 0, x1, D, gh, top, fh, r, tint);
    if ((s === "f018" || s === "f020") && levels.length >= 2 && r() > 0.4) fireEscape(M, x0 + 2, x1 - 2, D, levels);
  }
  cornice(M, x0, x1, D, top, hex("#d2ccc2"));
  // the ground floor
  M.box("concrete", x0, 0, 0, x1, gh, D - 0.6, hex("#d6d1c6"), { skip: "-y+y+z" });
  if (shop && shop !== "shutter") shopfront(c, x0, x1, gh, shop);
  else if (shop === "shutter") {
    // a roller shutter down, a side door
    M.box("metal", x0 + 1, 0.6, D - 1, x1 - 11, gh - 5, D - 0.4, hex("#8c9096"), { skip: "-z" });
    M.box("metal", x0 + 1, gh - 5, D - 1.6, x1 - 11, gh - 3, D + 0.6, hex("#55585e"));
    M.box("concrete", x1 - 11, 0, D - 0.6, x1, gh, D, hex("#ddd8cd"), { skip: "-y" });
    doorAt(M, x1 - 9, D, 6, 13);
    M.box("metal", x0, gh - 3, D - 0.6, x1 - 11, gh, D, hex("#25262b"), { skip: "-y" });
  } else {
    M.box("concrete", x0, 0, D - 0.6, x1, gh, D, hex("#ddd8cd"), { skip: "-y" });
    doorAt(M, x0 + 4, D, 6, 14);
    if (M.lod <= 1) windowAt(M, x0 + 14, 5, D, Math.max(4, x1 - x0 - 20), 9, r);
  }
  roof(c, top, { garden: !!opts.garden });
}

/** A two-storey house: rendered walls, a pitched tiled roof with its eaves, a porch hood. */
function house(c: Ctx) {
  const { M, x0, x1, D, H, r, opts } = c;
  const gh = 18;
  const wallCol = hex(["#efe9de", "#e8e0d2", "#f2ede4", "#dfe3e2"][Math.floor(r() * 4)]);
  M.box("plaster", x0, 0, 0, x1, gh, D, wallCol, { skip: "-y+y" });
  M.box("wood", x0, gh, 0, x1, H, D, hex("#b89070"), { skip: "-y+y" });
  M.box("concrete", x0 - 0.6, gh - 0.8, D - 0.6, x1 + 0.6, gh + 0.4, D + 1, hex("#6a5040"));
  if (opts.shop) shopfront(c, x0 + 2, x1 - 2, gh, opts.shop as string);
  else {
    doorAt(M, x0 + 4, D, 6, 13, hex("#5a3a28"));
    if (M.lod <= 1) windowAt(M, x0 + 14, 5, D, Math.min(10, x1 - x0 - 18), 8, r, "wood", hex("#5a4030"));
    M.box("tile", x0 + 2, 14, D, x0 + 12, 14.6, D + 4, hex("#5a5a60"));
  }
  windowRows(M, x0 + 1, x1 - 1, D, [gh], H - gh, r, { w: 8, h: 7, frame: "wood", fcol: hex("#4a3424") });
  gable(c, H, hex("#46474e"));
}

/** A pitched roof (ridge along x), its eaves out over the walls, gable ends in the wall. */
function gable(c: Ctx, y: number, col: V3, rise = 9, over = 3) {
  const { M, x0, x1, D } = c;
  const mz = D / 2;
  const a: V3 = [x0 - over, y - 1, -over],
    b: V3 = [x1 + over, y - 1, -over],
    e: V3 = [x1 + over, y - 1, D + over],
    f: V3 = [x0 - over, y - 1, D + over],
    rb: V3 = [x0 - over, y + rise, mz],
    rf: V3 = [x1 + over, y + rise, mz];
  const s1 = Math.hypot(rise + 1, mz + over);
  const n1: V3 = [0, (mz + over) / s1, (rise + 1) / s1];
  const tile = WORLD_TILE.tile!;
  const uvf = (p: V3): [number, number] => [(p[0] * VOX) / tile[0], (Math.hypot(p[1] - (y - 1), p[2] - (p[2] > mz ? D + over : -over)) * VOX) / tile[1]];
  // front slope, back slope
  M.quad("tile", [f[0], f[1], f[2]], [e[0], e[1], e[2]], [rf[0], rf[1], rf[2]], [rb[0], rb[1], rb[2]], n1, uvf, col);
  M.quad("tile", [b[0], b[1], b[2]], [a[0], a[1], a[2]], [rb[0], rb[1], rb[2]], [rf[0], rf[1], rf[2]], [0, n1[1], -n1[2]], uvf, col);
  // the gable ends (triangles as quads with a doubled apex), in the wall's material
  for (const x of [x0, x1]) {
    const n: V3 = [x === x1 ? 1 : -1, 0, 0];
    const p0: V3 = [x, y - 1, x === x1 ? D : 0],
      p1: V3 = [x, y - 1, x === x1 ? 0 : D],
      ap: V3 = [x, y + rise - 0.5, mz];
    M.quad("plaster", p0, p1, ap, [ap[0], ap[1], ap[2]], n, (p) => [(p[2] * VOX) / 2.5, (p[1] * VOX) / 2.5], hex("#ece6da"));
  }
  // the eaves' underside
  M.quad("wood", [a[0], a[1] - 0.01, a[2]], [b[0], b[1] - 0.01, b[2]], [b[0], b[1] - 0.01, 0], [a[0], a[1] - 0.01, 0], [0, -1, 0], (p) => [p[0] * 0.1, p[2] * 0.1], hex("#6a5040"));
  M.quad("wood", [f[0], f[1] - 0.01, D], [e[0], e[1] - 0.01, D], [e[0], e[1] - 0.01, f[2]], [f[0], f[1] - 0.01, f[2]], [0, -1, 0], (p) => [p[0] * 0.1, p[2] * 0.1], hex("#6a5040"));
}

/** An izakaya: a dark timber front with a lit lattice, a short tiled eave, the noren and red lanterns. */
function izakaya(c: Ctx) {
  const { M, x0, x1, D, H, r } = c;
  const gh = 20;
  M.box("wood", x0, 0, 0, x1, gh, D, hex("#5a3e2c"), { skip: "-y+y" });
  M.box("plaster", x0, gh, 0, x1, H, D, hex("#e6dccb"), { skip: "-y+y" });
  shopfront(c, x0 + 2, x1 - 2, gh - 1, "izakaya", { awning: null, fascia: "wood", fcol: hex("#3a281c") });
  // the eave over the front
  M.quad("tile", [x0 - 1, gh + 1, D - 0.5], [x1 + 1, gh + 1, D - 0.5], [x1 + 1, gh - 1.5, D + 4.5], [x0 - 1, gh - 1.5, D + 4.5], [0, 0.89, 0.45], (p) => [(p[0] * VOX) / 2, (p[2] * VOX) / 2], hex("#3e3f46"));
  if (M.lod <= 1) {
    // noren across the door, lanterns either side
    const mx = (x0 + x1) / 2;
    M.box("fabric", mx - 7, 9, D + 0.4, mx + 7, 14, D + 0.6, hex("#1f2a4a"));
    for (const x of [x0 + 3, x1 - 5]) M.box("neon", x, 9, D + 1, x + 2.4, 13, D + 3.4, [3, 0.5, 0.25]);
  }
  windowRows(M, x0 + 1, x1 - 1, D, [gh], H - gh, r, { w: 8, h: 7, frame: "wood", fcol: hex("#3a281c") });
  gable(c, H, hex("#3e3f46"), 7, 2);
}

/** A machiya: a wooden townhouse, its slatted lattice front, a tiled eave, the plastered upper floor. */
function machiya(c: Ctx) {
  const { M, x0, x1, D, H, opts } = c;
  const gh = 17;
  M.box("wood", x0, 0, 0, x1, gh, D, hex("#6a4a32"), { skip: "-y+y" });
  M.box("plaster", x0, gh, 0, x1, H, D, hex("#efe8da"), { skip: "-y+y" });
  if (opts.shop) shopfront(c, x0 + 2, x1 - 2, gh - 1, opts.shop as string, { awning: null, fascia: "wood", fcol: hex("#4a3424") });
  else {
    interior(M, 0, x0 + 1, x1 - 1, 2, gh - 3, D - 1.4);
  }
  // the lattice: slats close together over the front
  if (c.M.lod <= 1) for (let x = x0 + 1; x < x1 - 1; x += 1.4) M.box("wood", x, 2, D - 0.6, x + 0.5, gh - 3, D, hex("#4a3424"));
  M.quad("tile", [x0 - 1, gh + 1, D - 0.5], [x1 + 1, gh + 1, D - 0.5], [x1 + 1, gh - 1.5, D + 4], [x0 - 1, gh - 1.5, D + 4], [0, 0.89, 0.45], (p) => [(p[0] * VOX) / 2, (p[2] * VOX) / 2], hex("#3e3f46"));
  // the upper floor's low "insect cage" windows
  if (c.M.lod <= 1) for (let x = x0 + 3; x < x1 - 6; x += 9) M.box("wood", x, gh + 4, D - 0.4, x + 6, gh + 9, D + 0.1, hex("#3a281c"));
  gable(c, H, hex("#3e3f46"), 6, 2);
}
