import type { Built } from "../buildings";
import { C, E, G, hash, rand, shades, type Paint, VoxelModel } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";

/**
 * The zkSNARK MUSEUM: the city's Louvre, across the street from Central Park. The Cour Napoléon:
 *  - the U-shaped Renaissance palace round three sides of the courtyard (the Sully wing at the
 *    back with the Pavillon de l'Horloge and its clock, Richelieu on the left, Denon on the right):
 *    pale limestone, arcaded ground floor, columns and pedimented windows on the main floor, an
 *    attic, a balustrade lined with statues, slate mansard roofs with dormers and chimneys, and
 *    pavilions at the corners, the ends and the middles under tall square domes, with sculpted
 *    pediments;
 *  - in the middle the glass pyramid (steel lattice, lit at night), the way in, with its three
 *    small pyramids and the triangular basins with their jets;
 *  - toward the street the Arc du Carrousel with its pink marble columns and its quadriga, the
 *    Carrousel gardens either side, lamps, tourists and the queue at the pyramid.
 * Voxel scale 2 (a third of a metre). Front faces +z.
 */

// ---- face helper: (u along the face, y, n outward); n = 0 is the first empty layer --------------

interface Face {
  ox: number;
  oz: number;
  ux: number;
  uz: number;
  nx: number;
  nz: number;
  len: number;
}
type Rect = [number, number, number, number];
function faces(x0: number, z0: number, x1: number, z1: number) {
  return {
    front: { ox: x0, oz: z1, ux: 1, uz: 0, nx: 0, nz: 1, len: x1 - x0 } as Face,
    back: { ox: x1 - 1, oz: z0 - 1, ux: -1, uz: 0, nx: 0, nz: -1, len: x1 - x0 } as Face,
    right: { ox: x1, oz: z1 - 1, ux: 0, uz: -1, nx: 1, nz: 0, len: z1 - z0 } as Face,
    left: { ox: x0 - 1, oz: z0, ux: 0, uz: 1, nx: -1, nz: 0, len: z1 - z0 } as Face,
  };
}
const at = (f: Face, u: number, n: number): [number, number] => [f.ox + f.ux * u + f.nx * n, f.oz + f.uz * u + f.nz * n];
function fbox(m: VoxelModel, f: Face, u0: number, u1: number, y0: number, y1: number, n0: number, n1: number, c: Paint) {
  for (let u = u0; u < u1; u++)
    for (let n = n0; n < n1; n++) {
      const [x, z] = at(f, u, n);
      for (let y = y0; y < y1; y++) m.set(x, y, z, c);
    }
}
const fset = (m: VoxelModel, f: Face, u: number, y: number, n: number, c: Paint) => fbox(m, f, u, u + 1, y, y + 1, n, n + 1, c);

// ---- palette -----------------------------------------------------------------------------------

const S = {
  lime: shades(["#e6dcc6", "#e1d7c0"], 6, 11),
  limeDark: C("#cbbfa5"),
  rust: C("#d2c6ac"),
  trim: C("#f2ecdd"),
  groove: C("#b5a98f"),
  shadow: C("#8f846e"),
  white: C("#f6f3ea"),
  slate: C("#525c6a"),
  lead: C("#7f8996"),
  leadDark: C("#3a414c"),
  gold: C("#d4a52a"),
  goldLit: E("#f4b728", 1.4),
  pane: G("#344457"),
  lit: E("#ffd9a0", 1.0),
  lamp: E("#ffe2a8", 2.2),
  iron: C("#1f2426"),
  ironGreen: C("#2c3a33"),
  pave: C("#d8d0c0"),
  paveLine: C("#a8a090"),
  granite: C("#4a4846"),
  graniteLight: C("#6a6662"),
  water: G("#2f6f92"),
  waterLight: G("#4a90b4"),
  spray: E("#e2f6ff", 1.3),
  glass: G("#a8cde2"),
  glass2: G("#8db9d3"),
  steel: C("#6e7a88"),
  beam: E("#a9c4dc", 0.75),
  node: E("#fff0d2", 1.1),
  hall: E("#ffe4b4", 0.8),
  pink: C("#c98a86"),
  bronze: C("#8a6a32"),
  grass: C("#62994a"),
  hedge: shades(["#2f6236", "#356b3b"], 3, 52),
  gravel: C("#e1d6bc"),
  belt: C("#b8242c"),
  post: C("#c8ccd2"),
};

const PINK = C("#c98a86");
const SKIN = ["#f2c79a", "#c08a5a", "#8a5a38", "#e8b88a", "#f4d4b0"].map(C);
const CLOTH = ["#c8282e", "#2a4a8a", "#f4b728", "#3ddc97", "#f4f2ec", "#3a3448", "#ff7a1a", "#8f7bff", "#e8e0d0", "#1f6b6b", "#b07bff", "#5d5a66"].map(C);
const PANTS = ["#2a2a3a", "#3a4a6a", "#5a4a3a", "#1d1826", "#6a6a70"].map(C);

export function museum(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 110;
  const m = new VoxelModel(W, H, D);
  const r = rand(seed * 7 + 3);
  const CX = Math.round(W / 2);

  // ---- the plan --------------------------------------------------------------------------------
  const WD = 30; // wing depth
  const BZ0 = 6,
    BZ1 = BZ0 + WD; // Sully wing at the back
  const LX0 = 6,
    LX1 = LX0 + WD; // Richelieu, left
  const RX1 = W - 6,
    RX0 = RX1 - WD; // Denon, right
  const WZ1 = Math.min(140, D - 31); // the wings' front ends
  const wings: Rect[] = [
    [LX0, BZ0, RX1, BZ1],
    [LX0, BZ0, LX1, WZ1],
    [RX0, BZ0, RX1, WZ1],
  ];
  const PV = 36;
  const midZ = Math.round((BZ1 + WZ1) / 2);
  const pavs: { r: Rect; ped: ("front" | "back" | "left" | "right")[]; horloge?: boolean }[] = [
    { r: [LX0 - 2, BZ0 - 2, LX0 - 2 + PV, BZ0 - 2 + PV], ped: [] },
    { r: [RX1 + 2 - PV, BZ0 - 2, RX1 + 2, BZ0 - 2 + PV], ped: [] },
    { r: [LX0 - 2, WZ1 - 30, LX0 - 2 + PV, WZ1 + 4], ped: ["front"] },
    { r: [RX1 + 2 - PV, WZ1 - 30, RX1 + 2, WZ1 + 4], ped: ["front"] },
    { r: [LX0 - 2, midZ - 12, LX1 + 6, midZ + 12], ped: ["right", "left"] },
    { r: [RX0 - 6, midZ - 12, RX1 + 2, midZ + 12], ped: ["left", "right"] },
    { r: [CX - 18, BZ0 - 4, CX + 18, BZ1 + 6], ped: ["front"], horloge: true },
  ];
  const all: Rect[] = [...wings, ...pavs.map((p) => p.r)];
  const inRect = (q: Rect, x: number, z: number) => x >= q[0] && x < q[2] && z >= q[1] && z < q[3];
  const built = (x: number, z: number) => all.some((q) => inRect(q, x, z));

  // the glass pyramid and its little ones
  const PX = CX,
    PZ = Math.round(BZ1 + 56),
    PB = 29, // half base
    PH = 37;
  const smalls: [number, number][] = [
    [Math.round((LX1 + 6 + PX - PB) / 2), PZ],
    [Math.round((RX0 - 6 + PX + PB) / 2), PZ],
    [PX, Math.round((BZ1 + 6 + PZ - PB) / 2) + 1],
  ];
  const SB = 7,
    SH = 9;

  // ---- ground: the courtyard paving, granite slabs with lines ---------------------------------
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const line = z > BZ1 && ((x - PX) % 24 === 0 || (z - PZ) % 24 === 0);
      m.set(x, 0, z, line ? S.paveLine : S.pave);
    }

  // ---- palace volumes ----------------------------------------------------------------------------
  const WALL = 49; // top of the wing walls (the cornice)
  const PWALL = 55; // pavilions: one attic more
  for (const q of wings) m.box(q[0], 0, q[1], q[2], WALL, q[3], S.lime);
  for (const p of pavs) m.box(p.r[0], 0, p.r[1], p.r[2], p.horloge ? 63 : PWALL, p.r[3], S.lime);

  // ---- facades -----------------------------------------------------------------------------------
  const junction = (f: Face, u: number) => {
    for (const n of [0, 2]) {
      const [x, z] = at(f, u, n);
      if (built(x, z)) return true;
    }
    return false;
  };
  const lit = (x: number, y: number, z: number, p: number) => (hash(x, y, z, seed + 5) < p ? S.lit : S.pane);

  function facade(f: Face, pav: boolean, top: number, s: number) {
    const BW = pav ? 12 : 10;
    const nb = Math.floor((f.len - 4) / BW);
    const off = Math.floor((f.len - nb * BW) / 2);
    // faces turned away from the courtyard and the park get a plainer treatment
    const [ox, oz] = at(f, Math.floor(f.len / 2), 12);
    const plain = f.nz !== 1 && !(ox >= LX1 && ox < RX0 && oz >= BZ1);
    // continuous courses
    for (let u = 0; u < f.len; u++) {
      if (junction(f, u)) continue;
      fbox(m, f, u, u + 1, 0, 3, -1, 0, S.limeDark); // plinth
      for (let y = 5; y < 18; y += 3) fset(m, f, u, y, -1, S.groove); // rustication
      fbox(m, f, u, u + 1, 18, 20, -1, 1, S.trim); // string course
      fbox(m, f, u, u + 1, 36, 38, -1, 1, S.trim);
      fbox(m, f, u, u + 1, 46, 47, -1, 0, S.limeDark); // frieze
      
      fbox(m, f, u, u + 1, 48, 49, -1, 2, S.trim); // cornice
      if (pav) {
        fbox(m, f, u, u + 1, top - 1, top, -1, 2, S.trim);
        if (u % 6 === 3) fbox(m, f, u, u + 2, 50, top - 2, -1, 0, S.limeDark);
      }
      // balustrade with statues
      const yb = top;
      fbox(m, f, u, u + 1, yb + 2, yb + 3, -2, 0, S.trim);
      if (plain ? u % 4 === 0 : u % 2 === 0) fbox(m, f, u, u + 1, yb, yb + 2, -2, -1, S.white);
      fbox(m, f, u, u + 1, yb, yb + 1, -2, 0, S.trim);
    }
    for (let b = 0; b < nb; b++) {
      const u0 = off + b * BW;
      let skip = false;
      for (let u = u0 - 2; u < u0 + BW + 2; u++) if (u >= 0 && u < f.len && junction(f, u)) skip = true;
      if (skip) continue;
      const c = u0 + BW / 2; // bay centre
      const [bx, bz] = at(f, Math.floor(c), -1);
      // ground floor: an arcade, a lantern hanging in some arches
      const a0 = Math.round(c - 3),
        a1 = Math.round(c + 3);
      fbox(m, f, a0, a1, 1, 13, -4, 0, 0);
      fbox(m, f, a0 + 1, a1 - 1, 13, 14, -4, 0, 0);
      fbox(m, f, a0 + 2, a1 - 2, 14, 15, -4, 0, 0);
      fbox(m, f, a0, a1, 1, 15, -5, -4, (x, y, z) => (y > 10 ? lit(x, 0, z, 0.55) : y > 1 ? C("#3a2e24") : S.rust));
      fbox(m, f, a0 + 2, a1 - 2, 15, 17, -1, 0, S.trim); // keystone
      if (!plain && hash(bx, 1, bz, s) < 0.5) fbox(m, f, Math.floor(c), Math.floor(c) + 1, 10, 12, -2, -1, S.lamp);
      // main floor: tall windows with alternating pediments, columns between the bays
      const w0 = Math.round(c - 2),
        w1 = Math.round(c + 2);
      fbox(m, f, w0 - 1, w1 + 1, 21, 33, -1, 0, S.trim);
      fbox(m, f, w0, w1, 22, 32, -1, 0, 0);
      fbox(m, f, w0, w1, 22, 32, -2, -1, (x, y, z) => (y === 27 ? S.trim : lit(x, 20, z, 0.4)));
      fbox(m, f, w0 - 1, w1 + 1, 21, 22, -1, 1, S.trim);
      if (plain) fbox(m, f, w0 - 2, w1 + 2, 33, 34, -1, 1, S.trim);
      else if (b % 2 === 0) {
        fbox(m, f, w0 - 2, w1 + 2, 33, 34, -1, 1, S.trim);
        fbox(m, f, w0 - 1, w1 + 1, 34, 35, -1, 1, S.trim);
        fbox(m, f, w0 + 1, w1 - 1, 35, 36, -1, 1, S.trim);
      } else {
        fbox(m, f, w0 - 2, w1 + 2, 33, 34, -1, 1, S.trim);
        fbox(m, f, w0, w1, 34, 35, -1, 1, S.trim);
      }
      // attic windows and carved panels
      const t0 = Math.round(c - 1.5),
        t1 = Math.round(c + 1.5);
      fbox(m, f, t0 - 1, t1 + 1, 39, 45, -1, 0, S.trim);
      fbox(m, f, t0, t1, 40, 44, -1, 0, 0);
      fbox(m, f, t0, t1, 40, 44, -2, -1, (x, y, z) => lit(x, 40, z, 0.3));
      // columns at the bay's edges (pairs on the pavilions)
      for (const cu of plain ? [] : pav ? [u0 - 2, u0 + 1] : [u0 - 1]) {
        if (cu < 0 || cu + 2 > f.len) continue;
        fbox(m, f, cu, cu + 2, 20, 45, -1, pav ? 2 : 1, S.white);
        fbox(m, f, cu, cu + 2, 20, 21, -1, pav ? 3 : 2, S.trim);
        fbox(m, f, cu - (pav ? 0 : 1), cu + 2 + (pav ? 0 : 1), 44, 46, -1, pav ? 3 : 2, S.trim);
      }
      // a statue over each column on the balustrade
      const su = pav ? u0 : u0 - 1;
      if (!plain && su >= 0 && su < f.len) {
        fbox(m, f, su, su + 1, top + 3, top + 4, -2, -1, S.trim);
        fbox(m, f, su, su + 1, top + 4, top + 8, -2, -1, S.white);
        fbox(m, f, su, su + 1, top + 8, top + 9, -2, -1, S.trim);
      }
      // pavilion attic: round oculi
      if (pav) {
        fbox(m, f, Math.round(c - 1), Math.round(c + 1), 50, 53, -1, 0, S.trim);
        fbox(m, f, Math.round(c - 1), Math.round(c + 1), 51, 52, -1, 0, (x, y, z) => lit(x, 51, z, 0.5));
      }
    }
  }

  // pediment: a sculpted triangle over the middle of a face
  function pediment(f: Face, y0: number, half: number) {
    const c = Math.floor(f.len / 2);
    const rows = Math.ceil(half / 2);
    for (let i = 0; i < rows; i++) {
      const h = half - i * 2;
      fbox(m, f, c - h, c + h, y0 + i, y0 + i + 1, -1, 0, S.limeDark);
      fbox(m, f, c - h - 1, c - h + 1, y0 + i, y0 + i + 1, -1, 1, S.trim); // raking cornice
      fbox(m, f, c + h - 1, c + h + 1, y0 + i, y0 + i + 1, -1, 1, S.trim);
    }
    fbox(m, f, c - half - 1, c + half + 1, y0 - 1, y0, -1, 2, S.trim);
    // relief: a reclining figure each side of a gilded medallion
    fbox(m, f, c - 2, c + 2, y0 + 1, y0 + 5, 0, 1, S.white);
    fbox(m, f, c - 1, c + 1, y0 + 2, y0 + 4, 1, 2, S.gold);
    for (const sgn of [-1, 1]) {
      fbox(m, f, c + sgn * 4 - (sgn < 0 ? 5 : 0), c + sgn * 4 + (sgn > 0 ? 5 : 0), y0 + 1, y0 + 2, 0, 1, S.white);
      fbox(m, f, c + sgn * 5 - (sgn < 0 ? 1 : 0), c + sgn * 5 + (sgn > 0 ? 1 : 0), y0 + 2, y0 + 4, 0, 1, S.white);
    }
    // acroteria
    fbox(m, f, c, c + 1, y0 + rows, y0 + rows + 3, -1, 0, S.white);
    fbox(m, f, c - half, c - half + 1, y0, y0 + 3, -1, 0, S.white);
    fbox(m, f, c + half - 1, c + half, y0, y0 + 3, -1, 0, S.white);
  }

  for (const q of wings) {
    const F = faces(...q);
    for (const f of [F.front, F.back, F.left, F.right]) facade(f, false, WALL, seed + q[0] + q[1]);
  }
  for (const p of pavs) {
    const F = faces(...p.r);
    for (const f of [F.front, F.back, F.left, F.right]) facade(f, true, PWALL, seed + p.r[0] + p.r[1]);
    for (const side of p.ped) if (!p.horloge) pediment(F[side], PWALL - 1, 12);
  }

  // ---- roofs ---------------------------------------------------------------------------------
  /** Fill a roof over a rectangle, layer by layer, the inset given per layer; lead on the hips. */
  function roof(q: Rect, y0: number, inset: (l: number) => number, skip?: (x: number, z: number) => boolean, ridge = S.lead) {
    for (let l = 0; ; l++) {
      const i = Math.round(inset(l));
      const x0 = q[0] + i,
        x1 = q[2] - i,
        z0 = q[1] + i,
        z1 = q[3] - i;
      if (x1 - x0 < 1 || z1 - z0 < 1 || y0 + l >= H) return y0 + l;
      for (let z = z0; z < z1; z++)
        for (let x = x0; x < x1; x++) {
          if (skip?.(x, z)) continue;
          const ex = x === x0 || x === x1 - 1,
            ez = z === z0 || z === z1 - 1;
          m.set(x, y0 + l, z, ex && ez ? ridge : S.slate);
        }
    }
  }
  const inPav = (x: number, z: number) => pavs.some((p) => inRect(p.r, x, z));
  const mansard = (l: number) => (l < 15 ? 3 + Math.floor(l / 3) : 8 + (l - 15));
  for (const q of wings) roof(q, WALL, mansard, inPav);
  // wing ridges: lead cresting with little gilded finials; dormers; chimneys
  for (const q of wings) {
    const along = q[2] - q[0] > q[3] - q[1];
    const F = faces(...q);
    for (const f of along ? [F.front, F.back] : [F.left, F.right]) {
      const nb = Math.floor((f.len - 4) / 10);
      const off = Math.floor((f.len - nb * 10) / 2);
      for (let b = 0; b < nb; b++) {
        const c = off + b * 10 + 5;
        const [x, z] = at(f, c, -5);
        if (inPav(x, z) || inPav(...at(f, c + 3, -5)) || inPav(...at(f, c - 3, -5))) continue;
        // a stone dormer with a small pediment
        fbox(m, f, c - 2, c + 2, WALL + 2, WALL + 11, -9, -4, S.lime);
        fbox(m, f, c - 1, c + 1, WALL + 3, WALL + 9, -4, -3, 0);
        fbox(m, f, c - 1, c + 1, WALL + 3, WALL + 9, -5, -4, (xx, y, zz) => lit(xx, 60, zz, 0.3));
        fbox(m, f, c - 3, c + 3, WALL + 11, WALL + 12, -9, -3, S.trim);
        fbox(m, f, c - 2, c + 2, WALL + 12, WALL + 13, -9, -3, S.trim);
        fbox(m, f, c - 1, c + 1, WALL + 13, WALL + 14, -9, -3, S.trim);
      }
    }
    // chimneys along the ridge
    const len = along ? q[2] - q[0] : q[3] - q[1];
    for (let t = 20; t < len - 10; t += 28) {
      const x = along ? q[0] + t : q[0] + WD / 2 - 2;
      const z = along ? q[1] + WD / 2 - 2 : q[1] + t;
      if (inPav(x, z) || inPav(x + 4, z + 4)) continue;
      for (const dd of [-5, 5]) {
        const cx = along ? x : x + dd,
          cz = along ? z + dd : z;
        m.box(cx, WALL + 10, cz, cx + 4, WALL + 27, cz + 3, S.lime);
        m.box(cx - 1, WALL + 25, cz - 1, cx + 5, WALL + 26, cz + 4, S.trim);
        m.box(cx + 1, WALL + 27, cz, cx + 3, WALL + 28, cz + 3, C("#8a5040"));
      }
    }
  }
  // pavilion roofs: tall square domes, a lead crest and a gilded finial on top
  for (const p of pavs) {
    const q = p.r;
    const half = Math.min(q[2] - q[0], q[3] - q[1]) / 2;
    const y0 = p.horloge ? 63 : PWALL;
    const L = p.horloge ? 34 : 24;
    const R = half - 4;
    const top = roof(q, y0, (l) => (l > L ? 999 : 3 + R * (1 - Math.sqrt(Math.max(0, 1 - (l / L) ** 2)))));
    // lead crest round the flat top
    const it = Math.round(3 + R * (1 - Math.sqrt(Math.max(0, 1 - ((L - 1) / L) ** 2)))) ;
    const cr: Rect = [q[0] + it, q[1] + it, q[2] - it, q[3] - it];
    if (cr[2] - cr[0] > 2 && cr[3] - cr[1] > 2) {
      m.box(cr[0], top, cr[1], cr[2], top + 1, cr[3], S.lead);
      for (let x = cr[0]; x < cr[2]; x += 2) m.set(x, top + 1, cr[1], S.leadDark), m.set(x, top + 1, cr[3] - 1, S.leadDark);
      for (let z = cr[1]; z < cr[3]; z += 2) m.set(cr[0], top + 1, z, S.leadDark), m.set(cr[2] - 1, top + 1, z, S.leadDark);
    }
    const mx = Math.floor((q[0] + q[2]) / 2),
      mz = Math.floor((q[1] + q[3]) / 2);
    m.box(mx - 1, top, mz - 1, mx + 1, top + 4, mz + 1, S.lead);
    m.box(mx - 1, top + 4, mz - 1, mx + 1, top + 6, mz + 1, S.gold);
    // an oeil-de-boeuf on each face of the dome
    const F = faces(...q);
    for (const f of [F.front, F.back, F.left, F.right]) {
      const c = Math.floor(f.len / 2);
      const [x, z] = at(f, c, 0);
      if (built(x, z) && !p.horloge) continue;
      const yy = y0 + 6;
      const n = -4 - Math.round(R * (1 - Math.sqrt(1 - (6 / L) ** 2)));
      fbox(m, f, c - 2, c + 2, yy, yy + 6, n - 3, n + 1, S.trim);
      fbox(m, f, c - 1, c + 1, yy + 1, yy + 5, n, n + 1, (xx, y, zz) => lit(xx, 70, zz, 0.6));
      fbox(m, f, c - 1, c + 1, yy + 6, yy + 7, n - 3, n + 1, S.gold);
    }
  }

  // ---- Pavillon de l'Horloge: the clock, caryatids, nested pediments, flag ----------------------
  const hp = pavs.find((p) => p.horloge)!;
  {
    const F = faces(...hp.r);
    for (const f of [F.front, F.back]) {
      const c = Math.floor(f.len / 2);
      // upper storey: caryatids (paired figures) between three windows
      for (const du of [-12, -8, 7, 11]) {
        fbox(m, f, c + du, c + du + 1, 49, 59, -1, 1, S.white);
        fbox(m, f, c + du, c + du + 1, 59, 60, -1, 1, S.trim);
      }
      for (const du of [-14, 9]) fbox(m, f, c + du, c + du + 4, 51, 58, -1, 0, S.trim), fbox(m, f, c + du + 1, c + du + 3, 52, 57, -1, 0, (x, y, z) => lit(x, 52, z, 0.6));
      fbox(m, f, -1 + 2, f.len - 2, 61, 63, -1, 2, S.trim);
      // the clock: gold ring, lit dial, hands
      const cy = 54;
      for (let a = 0; a < 40; a++) {
        const t = (a / 40) * Math.PI * 2;
        fset(m, f, Math.round(c + Math.cos(t) * 5), Math.round(cy + Math.sin(t) * 5), 0, S.gold);
      }
      fbox(m, f, c - 4, c + 4, cy - 3, cy + 4, -1, 0, E("#fff4dc", 1.1));
      fbox(m, f, c - 3, c + 3, cy - 4, cy + 5, -1, 0, E("#fff4dc", 1.1));
      fbox(m, f, c, c + 1, cy, cy + 4, 0, 1, S.iron);
      fbox(m, f, c, c + 3, cy, cy + 1, 0, 1, S.iron);
      // nested pediments over the clock storey
      for (let i = 0; i < 6; i++) fbox(m, f, c - 17 + i * 3, c + 17 - i * 3, 63 + i, 64 + i, -1, 1, i === 0 ? S.trim : S.limeDark);
      fbox(m, f, c - 3, c + 3, 64, 67, 1, 2, S.white);
      fbox(m, f, c - 1, c + 1, 67, 69, -1, 1, S.gold);
    }
    // flag on the dome's lantern
    const mx = CX,
      mz = Math.floor((hp.r[1] + hp.r[3]) / 2);
    let top = 63;
    while (m.get(mx, top, mz)) top++;
    m.box(mx, top + 6, mz, mx + 1, top + 18, mz + 1, S.lead);
    m.box(mx + 1, top + 13, mz, mx + 10, top + 18, mz + 1, C("#f4b728"));
    for (const [x, y] of [[3, 3], [4, 3], [5, 3], [5, 2], [4, 1], [3, 0], [4, 0], [5, 0]]) m.set(mx + 2 + x, top + 13 + y, mz, C("#17151c"));
  }

  // ---- the basins and the small pyramids ------------------------------------------------------
  const corridor = (dx: number, dz: number) => (dz > 0 && Math.abs(dx) <= 8) || (dz < 0 && Math.abs(dx) <= 6) || Math.abs(dz) <= 6;
  const nearSmall = (x: number, z: number, pad: number) => smalls.some(([sx, sz]) => Math.abs(x + 0.5 - sx) < SB + pad && Math.abs(z + 0.5 - sz) < SB + pad);
  const basin = (x: number, z: number) => {
    const dx = x + 0.5 - PX,
      dz = z + 0.5 - PZ;
    if (x < LX1 + 9 || x >= RX0 - 9 || z < BZ1 + 9 || z >= WZ1 - 2) return false;
    if (Math.abs(dx) + Math.abs(dz) > 62) return false;
    if (Math.abs(dx) < PB + 5 && Math.abs(dz) < PB + 5) return false;
    if (corridor(dx, dz)) return false;
    return !nearSmall(x, z, 5);
  };
  const ring = (x: number, z: number) => nearSmall(x, z, 3) && !nearSmall(x, z, 0);
  const water = (x: number, z: number) => basin(x, z) || ring(x, z);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (!water(x, z)) continue;
      const edge = !water(x + 1, z) || !water(x - 1, z) || !water(x, z + 1) || !water(x, z - 1);
      if (edge) {
        m.set(x, 0, z, S.granite);
        m.set(x, 1, z, S.graniteLight);
      } else {
        m.set(x, 0, z, (x + z) % 7 === 0 ? S.waterLight : S.water);
        // jets in rows along the basin
        if (basin(x, z) && x % 5 === 0 && z % 5 === 0 && basin(x + 2, z) && basin(x - 2, z) && basin(x, z + 2) && basin(x, z - 2)) {
          const h = 2 + Math.floor(hash(x, 0, z, seed) * 3);
          m.box(x, 1, z, x + 1, 1 + h, z + 1, S.spray);
        }
      }
    }

  // a pyramid of glass: steel lattice, lit nodes, hip frames
  function pyramid(cx: number, cz: number, half: number, ht: number, mesh: number) {
    for (let y = 0; y <= ht; y++) {
      const h = half * (1 - y / (ht + 1));
      const x0 = Math.round(cx - h),
        x1 = Math.round(cx + h),
        z0 = Math.round(cz - h),
        z1 = Math.round(cz + h);
      if (x1 <= x0) break;
      for (let z = z0; z < z1; z++)
        for (let x = x0; x < x1; x++) {
          const dx = Math.min(x - x0, x1 - 1 - x),
            dz = Math.min(z - z0, z1 - 1 - z);
          if (dx > 1 && dz > 1) { m.set(x, y + 1, z, S.steel); continue; }
          const hip = dx <= 1 && dz <= 1;
          const u = dz <= 1 ? x - cx : z - cz; // along the face
          const row = Math.floor(y / 3);
          const a = (((u + (row % 2) * (mesh / 2)) % mesh) + mesh) % mesh;
          let c: number;
          if (hip || y === 0) c = S.steel;
          else if (y % 3 === 0) c = a < 1 ? S.node : S.beam;
          else if (a < 1) c = S.steel;
          else c = y > ht * 0.55 ? S.glass2 : S.glass;
          m.set(x, y + 1, z, c);
        }
    }
  }
  pyramid(PX, PZ, PB, PH, 6);
  for (const [sx, sz] of smalls) pyramid(sx, sz, SB, SH, 4);

  // the entrance: a steel porch in the pyramid's front face, lit glass doors, the hall glowing
  const PF = PZ + PB; // front edge (z)
  m.box(PX - 7, 1, PZ - 18, PX + 7, 2, PZ + 18, S.hall);
  m.box(PX - 5, 1, PF - 10, PX + 5, 11, PF + 1, 0);
  m.box(PX - 6, 1, PF - 10, PX - 5, 11, PF + 2, S.steel);
  m.box(PX + 5, 1, PF - 10, PX + 6, 11, PF + 2, S.steel);
  m.box(PX - 6, 10, PF - 10, PX + 6, 11, PF + 2, S.steel);
  m.box(PX - 5, 10, PF - 9, PX + 5, 11, PF + 1, S.glass);
  m.box(PX - 4, 1, PF - 9, PX + 4, 9, PF - 8, (x, y) => (x === PX || y === 8 ? S.steel : E("#ffe8c0", 0.9)));
  for (let y = 2; y < 9; y += 2) m.set(PX - 7, y, PF + 1, S.steel), m.set(PX + 6, y, PF + 1, S.steel);
  // the spiral stair's column inside
  m.box(PX - 1, 1, PZ - 1, PX + 1, 14, PZ + 1, S.white);

  // the queue: zigzag barriers in front of the pyramid, people waiting
  const QZ0 = PF + 3,
    QZ1 = Math.min(PF + 15, WZ1 - 2);
  for (let z = QZ0; z <= QZ1; z += 4) {
    for (let x = PX - 10; x <= PX + 10; x++) {
      const post = (x - PX) % 5 === 0;
      if (post) m.box(x, 1, z, x + 1, 4, z + 1, S.post);
      else if (!((z - QZ0) % 8 === 0 ? x > PX + 6 : x < PX - 6)) m.set(x, 3, z, S.belt);
    }
  }

  // ---- the Arc du Carrousel: lower than the pyramid, so the park sees the glass over it ----------
  const AZ0 = WZ1 + 11,
    AZ1 = AZ0 + 10,
    AX0 = CX - 19,
    AX1 = CX + 19;
  m.box(AX0, 1, AZ0, AX1, 17, AZ1, S.lime);
  m.box(AX0, 1, AZ0, AX1, 3, AZ1, S.limeDark);
  // the arches through, round-topped
  const arch = (x0: number, x1: number, y1: number) => {
    const rr = (x1 - x0) / 2;
    for (let y = 1; y < y1 + rr; y++)
      for (let x = x0; x < x1; x++) {
        const dx = x + 0.5 - (x0 + rr);
        if (y < y1 || dx * dx + (y - y1) ** 2 < rr * rr) for (let z = AZ0; z < AZ1; z++) m.set(x, y, z, 0);
      }
  };
  arch(CX - 5, CX + 5, 9);
  arch(AX0 + 5, AX0 + 10, 7);
  arch(AX1 - 10, AX1 - 5, 7);
  // pink marble columns on each pier, front and back, with gilt capitals and soldiers on top
  const pierX = [AX0 + 2, CX - 8, CX + 7, AX1 - 3];
  for (const px of pierX)
    for (const zz of [AZ0 - 2, AZ1]) {
      m.box(px - 1, 1, zz, px + 2, 4, zz + 2, S.limeDark);
      m.box(px, 4, zz, px + 1, 13, zz + 2, PINK);
      m.box(px - 1, 13, zz, px + 2, 14, zz + 2, S.gold);
      // the soldier
      m.box(px, 17, zz, px + 1, 19, zz + 1, CLOTH[1]);
      m.box(px, 19, zz, px + 1, 20, zz + 1, S.white);
      m.box(px, 20, zz, px + 1, 21, zz + 1, S.iron);
    }
  // entablature and attic, relief panels, the name plaque
  m.box(AX0 - 1, 14, AZ0 - 2, AX1 + 1, 17, AZ1 + 2, S.lime);
  m.box(AX0 - 1, 16, AZ0 - 3, AX1 + 1, 17, AZ1 + 3, S.trim);
  m.box(AX0 - 1, 15, AZ0 - 3, AX1 + 1, 16, AZ1 + 3, PINK);
  m.box(AX0, 17, AZ0, AX1, 22, AZ1, S.lime);
  m.box(AX0 - 1, 21, AZ0 - 1, AX1 + 1, 22, AZ1 + 1, S.trim);
  for (const zz of [AZ0 - 1, AZ1]) {
    for (const x0 of [AX0 + 2, AX1 - 8]) m.box(x0, 18, zz, x0 + 6, 21, zz + 1, S.limeDark);
    m.box(CX - 10, 18, zz, CX + 10, 21, zz + 1, C("#2a2620"));
    for (const x of [AX0 + 7, AX1 - 8]) m.box(x, 10, zz, x + 1, 12, zz + 1, S.white);
  }
  // the quadriga: four gilded horses, the chariot and its driver, two victories
  const QY = 22;
  m.box(CX - 8, QY, AZ0 + 1, CX + 8, QY + 1, AZ1 - 1, S.lime);
  for (let i = 0; i < 4; i++) {
    const hx = CX - 7 + i * 4;
    m.box(hx, QY + 3, AZ0 + 2, hx + 2, QY + 5, AZ0 + 7, S.bronze);
    for (const lz of [AZ0 + 2, AZ0 + 6]) m.box(hx, QY + 1, lz, hx + 2, QY + 3, lz + 1, S.bronze);
    m.box(hx, QY + 5, AZ0 + 6, hx + 2, QY + 8, AZ0 + 8, S.bronze);
    m.box(hx, QY + 7, AZ0 + 8, hx + 2, QY + 8, AZ0 + 9, S.bronze);
  }
  m.box(CX - 3, QY + 1, AZ0 + 7, CX + 3, QY + 5, AZ1 - 1, S.gold);
  m.box(CX - 1, QY + 5, AZ0 + 7, CX + 1, QY + 10, AZ0 + 9, S.gold);
  m.box(CX - 1, QY + 10, AZ0 + 7, CX + 1, QY + 11, AZ0 + 9, S.goldLit);
  for (const sx of [CX - 8, CX + 7]) {
    m.box(sx, QY + 1, AZ1 - 3, sx + 1, QY + 7, AZ1 - 2, S.gold);
    m.box(sx - 1, QY + 5, AZ1 - 3, sx + 2, QY + 6, AZ1 - 2, S.gold);
  }

  // ---- the Carrousel gardens either side of the arch: lawns, yew cones, hedges ------------------
  const GZ0 = WZ1 + 8,
    GZ1 = D - 6;
  for (const [x0, x1] of [
    [8, AX0 - 8],
    [AX1 + 8, W - 8],
  ]) {
    if (x1 - x0 < 10) continue;
    m.box(x0, 0, GZ0, x1, 1, GZ1, S.gravel);
    for (const [a0, a1] of [
      [x0 + 2, Math.floor((x0 + x1) / 2) - 2],
      [Math.floor((x0 + x1) / 2) + 2, x1 - 2],
    ]) {
      m.box(a0, 1, GZ0 + 2, a1, 2, GZ1 - 2, S.grass);
      m.box(a0, 1, GZ0 + 2, a1, 3, GZ0 + 4, S.hedge);
      m.box(a0, 1, GZ1 - 4, a1, 3, GZ1 - 2, S.hedge);
      m.box(a0, 1, GZ0 + 2, a0 + 2, 3, GZ1 - 2, S.hedge);
      m.box(a1 - 2, 1, GZ0 + 2, a1, 3, GZ1 - 2, S.hedge);
      // yew cones in the corners
      for (const [cx, cz] of [
        [a0 + 5, GZ0 + 7],
        [a1 - 5, GZ0 + 7],
        [a0 + 5, GZ1 - 7],
        [a1 - 5, GZ1 - 7],
      ])
        for (let y = 0; y < 10; y++) {
          const rr = 2.6 * (1 - y / 10) + 0.3;
          m.cylinder(cx, 2 + y, cz, rr, 1, S.hedge);
        }
      // a flowerbed in the middle
      const fx = Math.floor((a0 + a1) / 2),
        fz = Math.floor((GZ0 + GZ1) / 2);
      m.cylinder(fx, 2, fz, 3.5, 1, (x, _y, z) => ((x + z) % 3 === 0 ? C("#e8505a") : (x + z) % 3 === 1 ? C("#f4f2ec") : C("#d070c0")));
    }
  }

  // ---- lamps: Louvre lanterns round the courtyard and on the pavement -----------------------
  const lamp = (x: number, z: number) => {
    m.box(x - 1, 1, z - 1, x + 2, 2, z + 2, S.iron);
    m.box(x, 2, z, x + 1, 11, z + 1, S.ironGreen);
    m.box(x - 1, 11, z - 1, x + 2, 14, z + 2, S.lamp);
    m.box(x - 1, 14, z - 1, x + 2, 15, z + 2, S.iron);
    m.set(x, 15, z, S.gold);
  };
  for (let z = BZ1 + 14; z < WZ1 - 4; z += 20) lamp(LX1 + 4, z), lamp(RX0 - 5, z);
  for (let x = LX1 + 20; x < RX0 - 16; x += 22) if (Math.abs(x - CX) > 22) lamp(x, BZ1 + 9);
  for (const x of [AX0 - 4, AX1 + 3, CX - 14, CX + 13]) lamp(x, D - 4);
  for (const x of [CX - 16, CX + 15]) lamp(x, WZ1 - 1);

  // ---- tourists in the courtyard, the queue, under the arch ------------------------------------
  const person = (x: number, z: number) => {
    if (m.get(x, 1, z) || m.get(x, 2, z)) return false;
    const g = m.get(x, 0, z);
    if (g === S.water || g === S.waterLight || g === S.granite) return false;
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const legs = pick(PANTS),
      top = pick(CLOTH),
      skin = pick(SKIN);
    m.box(x, 1, z, x + 1, 3, z + 1, legs);
    m.box(x, 3, z, x + 1, 5, z + 1, top);
    m.set(x, 5, z, skin);
    if (r() < 0.25) m.set(x, 6, z, pick(CLOTH)); // a hat
    return true;
  };
  // the queue along the barriers
  for (let z = QZ0 + 2; z <= QZ1; z += 4)
    for (let x = PX - 9; x <= PX + 9; x += 2) if (r() < 0.75) person(x, z);
  for (let z = QZ1 + 2; z < AZ0 - 2; z += 3) if (r() < 0.8) person(PX + (r() < 0.5 ? -1 : 1), z);
  // strollers and photo-takers
  let placed = 0;
  for (let tries = 0; tries < 2000 && placed < 55; tries++) {
    const x = LX1 + 4 + Math.floor(r() * (RX0 - LX1 - 8));
    const z = BZ1 + 8 + Math.floor(r() * (D - BZ1 - 12));
    if (built(x, z) || (x > AX0 - 2 && x < AX1 + 2 && z > AZ0 - 3 && z < AZ1 + 3)) continue;
    if (z > GZ0 && (x < AX0 - 7 || x > AX1 + 7)) continue;
    if (Math.abs(x - PX) < PB + 2 && Math.abs(z - PZ) < PB + 2) continue;
    if (person(x, z)) {
      placed++;
      // some in pairs
      if (r() < 0.3) person(x + 2, z);
    }
  }

  // ---- result -------------------------------------------------------------------------------
  const signs: SignSpot[] = [{ text: "zkSNARK MUSEUM · LOUVRE", color: "#f4b728", x: CX, y: 19.5, z: AZ1 + 1.05, w: 20, h: 2.6, vertical: false, facing: "front" }];
  const pyrWalls: Rect[] = [
    [PX - PB, PZ - PB, PX + PB, PF - 10],
    [PX - PB, PF - 10, PX - 6, PF],
    [PX + 6, PF - 10, PX + PB, PF],
  ];
  return {
    model: m,
    signs,
    door: [PX + 0.5, PF + 2],
    body: [0, 0, W, D],
    walls: [
      ...wings,
      ...pavs.map((p) => p.r),
      ...pyrWalls,
      ...smalls.map(([sx, sz]) => [sx - SB, sz - SB, sx + SB, sz + SB] as Rect),
      [AX0 - 1, AZ0 - 2, AX0 + 5, AZ1 + 2],
      [AX0 + 10, AZ0 - 2, CX - 5, AZ1 + 2],
      [CX + 5, AZ0 - 2, AX1 - 10, AZ1 + 2],
      [AX1 - 5, AZ0 - 2, AX1 + 1, AZ1 + 2],
    ],
    lights: [
      [PX, 14, PZ, "#ffe8c0"],
      [PX, 6, PF + 3, "#ffe2b0"],
      [CX, 14, AZ1 + 4, "#ffd28a"],
    ],
    scale: k,
    points: {
      // keeper just inside the pyramid's doors; camPos/camLook from the park side of the street,
      // through the arch at the pyramid and the Pavillon de l'Horloge; kiosk = the queue's tail.
      keeper: [PX + 0.5, 1, PF - 6],
      camPos: [PX - 34, 40, D + 44],
      camLook: [PX, 16, PZ],
      kiosk: [PX + 12, 0, QZ1 + 2],
      arch: [CX + 0.5, 0, AZ1 + 2],
    },
  };
}
