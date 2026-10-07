import type { Built } from "../buildings";
import { C, E, G, hash, VoxelModel, type Paint } from "../model";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";

/**
 * WESTMINSTER: the Palace's river front in honey Anston limestone, Perpendicular Gothic. The long
 * river façade (buttress strips, three storeys of recessed traceried windows, heraldic panels,
 * pierced parapet and a forest of pinnacles) between three projecting pavilions under steep iron
 * roofs; the Victoria Tower at the west end (the Sovereign's Entrance, statue niches, octagonal
 * corner turrets, the Union flag); the octagonal Central Tower and its spire over the middle; and
 * at the east end the Elizabeth Tower: panelled shaft, the clock stage with its four gilded dials,
 * the belfry's louvred arches, the Ayrton Light and the Prussian-blue-and-gold spire, orb and
 * cross. In front, the river terrace with its lamp standards, a red telephone box, a constable and
 * the tourists.
 *
 * The dials are flat recessed panels: the city draws the live hands from `clockN/S/E/W` (dial
 * centres on the dial plane) and `clockR` (radius in voxels, as [r, 0, 0]).
 *
 * Built at voxel scale 2 (1 voxel = 1/3 m), front (+z) on the river.
 */
export function parliament(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 178;
  const m = new VoxelModel(W, H, D);

  const S = (hexes: string[], sc = 1, sd = 0): Paint => {
    const ids = hexes.map((h) => C(h));
    return (x, y, z) => ids[Math.floor(hash(Math.floor(x / sc), Math.floor(y / sc), Math.floor(z / sc), sd + seed) * ids.length)];
  };
  // ---- palette ---------------------------------------------------------------------------------
  const stone = S(["#cdb98a", "#c8b384", "#d1bf8f"], 6);
  const stoneLt = C("#dccb9e");
  const recess = C("#a28e66");
  const deep = C("#6e5f48");
  const plinth = S(["#a89676", "#a08e70", "#ae9c7c"], 4);
  const glass = G("#2b3644");
  const lit = E("#ffcf86", 1.25);
  const slate = S(["#4c5566", "#465062", "#515a6b"], 4);
  const iron = C("#25272d");
  const gold = C("#e2b448");
  const goldDk = C("#b8892c");
  const blue = C("#1f2d58");
  const blueDk = C("#16203f");
  const dialC = E("#f5c870", 1.15);
  const numeral = C("#1b1b20");
  const red = C("#a3262a");
  const heraldBlue = C("#2a3c84");
  const pave = S(["#bdb5a4", "#b6ae9c", "#c4bcab"], 6);
  const lampC = E("#ffc870", 1.8);

  // ---- layout (voxels) -------------------------------------------------------------------------
  const FZ = 44; // the river façade's wall plane (wall voxels z < FZ)
  const BZ0 = 3; // the back façade
  // Elizabeth Tower: the shaft, the clock stage one voxel proud of it
  const EX0 = W - 30,
    EX1 = W - 4,
    EZ0 = 22,
    EZ1 = 48;
  const ECX = (EX0 + EX1) / 2,
    ECZ = (EZ0 + EZ1) / 2;
  // Victoria Tower
  const VX0 = 4,
    VX1 = 36,
    VZ0 = 14,
    VZ1 = 46;
  // the main range runs between them; pavilions project from it
  const RX0 = VX1,
    RX1 = EX0;
  const midX = Math.round((RX0 + RX1) / 2);
  const PAV: [number, number][] = [
    [RX0, RX0 + 14],
    [midX - 8, midX + 8],
    [RX1 - 14, RX1],
  ];
  const PZ = FZ + 3;
  const CORN = 54, // cornice
    PARA = 60, // parapet top
    PAVH = 68; // pavilion wall top

  /** Face of a box: u along it (left to right seen from outside), d outward (0 = outer layer). */
  type Side = "s" | "n" | "e" | "w";
  type Box = { x0: number; x1: number; z0: number; z1: number };
  const at = (b: Box, s: Side, u: number, d: number): [number, number] =>
    s === "s" ? [b.x0 + u, b.z1 - 1 + d] : s === "n" ? [b.x1 - 1 - u, b.z0 - d] : s === "e" ? [b.x1 - 1 + d, b.z1 - 1 - u] : [b.x0 - d, b.z0 + u];
  const len = (b: Box, s: Side) => (s === "s" || s === "n" ? b.x1 - b.x0 : b.z1 - b.z0);
  const fset = (b: Box, s: Side, u: number, y: number, d: number, c: Paint) => {
    const [x, z] = at(b, s, u, d);
    m.set(x, y, z, c);
  };
  const SIDES: Side[] = ["s", "n", "e", "w"];
  /** Is cell (i, j) of a w × h opening inside its pointed (Gothic) arch? */
  const pointed = (i: number, j: number, w: number, h: number) => {
    const a = Math.max(1, Math.ceil(w * 0.75));
    if (j < h - a) return true;
    const t = (j - (h - a) + 0.5) / a;
    const half = (w / 2) * Math.pow(Math.max(0, 1 - t), 0.6);
    return Math.abs(i + 0.5 - w / 2) <= half + 0.05;
  };

  // ---- the terrace and the river wall ----------------------------------------------------------
  m.box(0, 0, 0, W, 1, D, pave);
  for (let x = 0; x < W; x++) if (x % 8 === 0) for (let z = FZ; z < D - 2; z++) m.set(x, 0, z, C("#a79f8e"));
  // the river parapet: a coping on stone balusters
  m.box(0, 1, D - 2, W, 4, D, stone);
  for (let x = 1; x < W - 1; x++) if (x % 3 !== 0) m.set(x, 2, D - 2, deep);
  m.box(0, 4, D - 2, W, 5, D, stoneLt);

  // ---- the main range (river front, back, roof) ------------------------------------------------
  const range: Box = { x0: RX0, x1: RX1, z0: BZ0, z1: FZ };
  m.box(RX0, 0, BZ0, RX1, CORN, FZ, stone);
  m.box(RX0, 0, BZ0, RX1, 6, FZ + 1, plinth);
  m.box(RX0, 0, BZ0 - 1, RX1, 6, BZ0, plinth);

  /**
   * Perpendicular bays along a face: buttress strips every 6 voxels rising into pinnacles, three
   * storeys of recessed two-light windows, heraldic spandrel panels, cornice and pierced parapet.
   */
  const bays = (b: Box, s: Side, u0: number, u1: number, top: number, seedB: number, plain = false) => {
    const storeys: [number, number][] = [
      [9, 18],
      [22, 37],
      [41, 51],
    ];
    for (let u = u0; u < u1; u++) {
      const p = (u - u0) % 6;
      if (p === 0) {
        for (let y = 6; y < top; y++) fset(b, s, u, y, 1, y % 12 === 0 ? stoneLt : stone);
        for (let y = top; y < top + 5; y++) fset(b, s, u, y, 1, y === top + 4 ? stoneLt : stone);
        fset(b, s, u, top + 1, 2, stoneLt); // crocket
        continue;
      }
      if (p === 1 || p === 5) continue;
      storeys.forEach(([y0, y1], si) => {
        const w = 3,
          i = p - 2;
        for (let y = y0; y < y1; y++) {
          if (!pointed(i, y - y0, w, y1 - y0)) continue;
          fset(b, s, u, y, 0, 0);
          const mull = !plain && i === 1 && si > 0 && y < y1 - 2;
          const transom = !plain && si === 1 && y === y0 + 9;
          const bayN = Math.floor((u - u0) / 6);
          const on = si === 1 && hash(bayN, si, s.charCodeAt(0), seedB) < 0.38;
          fset(b, s, u, y, -1, mull || transom ? stoneLt : on ? lit : glass);
        }
      });
      // spandrel panels between the storeys, a shield in the middle of each
      for (const y0 of [19, 38]) {
        if (plain) continue;
        for (let y = y0; y < y0 + 3; y++) fset(b, s, u, y, 0, recess);
        if (p === 3) fset(b, s, u, y0 + 1, 0, (u >> 1) % 2 ? red : heraldBlue);
        if (p === 3) fset(b, s, u, y0 + 2, 0, gold);
      }
    }
    // string courses, cornice, pierced parapet
    for (let u = u0; u < u1; u++) {
      fset(b, s, u, 6, 1, stoneLt);
      fset(b, s, u, 20, 1, stoneLt);
      fset(b, s, u, 39, 1, stoneLt);
      fset(b, s, u, top - 1, 1, stoneLt);
      for (let y = top; y < top + 5; y++) {
        const pierced = y >= top + 1 && y <= top + 3 && (u + (y === top + 2 ? 1 : 0)) % 2 === 1;
        if (!pierced) fset(b, s, u, y, 0, y === top + 4 ? stoneLt : stone);
      }
    }
  };
  bays(range, "s", 0, RX1 - RX0, CORN, 1);
  bays(range, "n", 0, RX1 - RX0, CORN, 2, true);

  /** A pitched roof along x over [x0,x1)×[z0,z1) from y0, with iron cresting and gilt finials. */
  const gable = (x0: number, x1: number, z0: number, z1: number, y0: number, slope = 0.85) => {
    const half = (z1 - z0) / 2;
    let ridge = y0;
    for (let z = z0; z < z1; z++) {
      const e = Math.min(z - z0, z1 - 1 - z);
      const h = y0 + Math.floor(e * slope) + 1;
      ridge = Math.max(ridge, h);
      m.box(x0, y0, z, x1, h, z + 1, slate);
    }
    const rz = Math.floor(z0 + half - 0.5);
    for (let x = x0; x < x1; x++) {
      m.box(x, ridge, rz, x + 1, ridge + 1, rz + 2, iron);
      if (x % 3 === 0) m.box(x, ridge + 1, rz, x + 1, ridge + 2, rz + 2, iron);
      if ((x - x0) % 12 === 6) {
        m.box(x, ridge + 1, rz, x + 1, ridge + 4, rz + 2, iron);
        m.box(x, ridge + 4, rz, x + 1, ridge + 5, rz + 2, gold);
      }
    }
    // dormers on the river slope
    for (let x = x0 + 6; x < x1 - 4; x += 12) {
      const z = z1 - 6;
      const yb = y0 + Math.floor(Math.min(z - z0, z1 - 1 - z) * slope) - 3;
      m.box(x, yb, z, x + 3, yb + 5, z + 2, stone);
      m.set(x + 1, yb + 1, z + 1, glass);
      m.set(x + 1, yb + 2, z + 1, glass);
      m.box(x + 1, yb + 5, z, x + 2, yb + 7, z + 1, stone);
      m.set(x + 1, yb + 7, z, gold);
    }
    return ridge;
  };
  gable(RX0, RX1, BZ0 + 1, FZ - 1, PARA - 2);
  // ventilation flèches along the ridge
  for (const fx of [RX0 + 30, RX1 - 30]) {
    const fz = Math.round((BZ0 + FZ) / 2);
    m.box(fx - 2, 70, fz - 2, fx + 2, 78, fz + 2, slate);
    for (let y = 72; y < 77; y++) if (y % 2) for (const [dx, dz] of [[-2, 0], [1, 0], [0, -2], [0, 1]]) m.set(fx + dx, y, fz + dz, iron);
    for (let y = 78; y < 92; y++) {
      const r = Math.max(0, Math.round(2 - (y - 78) / 5));
      m.box(fx - r, y, fz - r, fx + r + 1, y + 1, fz + r + 1, y > 88 ? gold : iron);
    }
  }

  // ---- the pavilions ---------------------------------------------------------------------------
  const hip = (x0: number, x1: number, z0: number, z1: number, y0: number, slope: number, finial: number) => {
    let top = y0;
    for (let z = z0; z < z1; z++)
      for (let x = x0; x < x1; x++) {
        const e = Math.min(x - x0, x1 - 1 - x, z - z0, z1 - 1 - z);
        const h = y0 + Math.floor(e * slope) + 1;
        top = Math.max(top, h);
        for (let y = y0; y < h; y++) m.set(x, y, z, (y - y0) % 5 === 4 ? C("#3e4656") : slate);
      }
    // iron cresting round the eaves and up the ridge, a gilt spike on top
    const cx = Math.floor((x0 + x1) / 2),
      cz = Math.floor((z0 + z1) / 2);
    for (let y = top; y < top + finial; y++) m.set(cx, y, cz, y >= top + finial - 3 ? gold : iron);
    m.box(cx - 1, top + 2, cz, cx + 2, top + 3, cz + 1, iron);
    return top;
  };
  for (const [px0, px1] of PAV) {
    const pb: Box = { x0: px0, x1: px1, z0: BZ0 - 1, z1: PZ };
    m.box(px0, 0, BZ0 - 1, px1, PAVH, PZ, stone);
    m.box(px0, 0, PZ - 1, px1, 6, PZ + 1, plinth);
    const w = px1 - px0;
    // the great oriel: one window through the two upper storeys, mullioned
    for (const s of ["s", "n"] as Side[]) {
      for (let u = 0; u < w; u++) {
        const edge = u < 2 || u >= w - 2;
        if (edge) {
          for (let y = 6; y < PAVH + 10; y++) fset(pb, s, u, y, 1, y >= PAVH ? stone : y % 12 === 0 ? stoneLt : stone);
          continue;
        }
        const i = u - 3,
          ww = w - 6;
        if (i >= 0 && i < ww) {
          for (let y = 22; y < 56; y++) {
            if (!pointed(i, y - 22, ww, 34)) continue;
            fset(pb, s, u, y, 0, 0);
            const mull = i % 2 === 1 || (y - 22) % 8 === 7;
            fset(pb, s, u, y, -1, mull ? stoneLt : hash(u, y >> 3, px0, 9) < 0.3 ? lit : glass);
          }
          for (let y = 9; y < 18; y++) if (pointed(i % 4, y - 9, 3, 9) && i % 4 < 3) (fset(pb, s, u, y, 0, 0), fset(pb, s, u, y, -1, glass));
        }
        for (const y of [6, 20, 58, PAVH - 1]) fset(pb, s, u, y, 1, stoneLt);
        // parapet
        for (let y = PAVH; y < PAVH + 4; y++) if (!(y > PAVH && y < PAVH + 3 && u % 2)) fset(pb, s, u, y, 0, y === PAVH + 3 ? stoneLt : stone);
        if (u === Math.floor(w / 2) || u === Math.floor(w / 2) - 1) for (let y = 60; y < 66; y++) fset(pb, s, u, y, 1, y === 62 ? gold : y > 63 ? red : heraldBlue);
      }
    }
    // octagonal corner turrets, front and back, rising into pinnacles
    for (const tx of [px0 - 1, px1 - 2])
      for (const tz of [PZ - 2, BZ0 - 2]) {
        m.box(tx, 6, tz, tx + 3, PAVH + 8, tz + 3, stone);
        for (let y = 10; y < PAVH + 8; y += 12) m.box(tx, y, tz, tx + 3, y + 1, tz + 3, stoneLt);
        for (let y = PAVH + 8; y < PAVH + 18; y++) {
          const r = y < PAVH + 13 ? 1 : 0;
          m.box(tx + 1 - r, y, tz + 1 - r, tx + 2 + r, y + 1, tz + 2 + r, y % 2 ? stone : stoneLt);
        }
        m.set(tx + 1, PAVH + 18, tz + 1, gold);
        m.set(tx + 1, PAVH + 19, tz + 1, gold);
      }
    hip(px0 + 1, px1 - 1, BZ0, PZ - 1, PAVH, 1.25, 8);
  }

  // ---- the Central Tower -----------------------------------------------------------------------
  {
    const cx = midX,
      cz = Math.round((BZ0 + FZ) / 2);
    const oct = (dx: number, dz: number, r: number) => Math.abs(dx) <= r && Math.abs(dz) <= r && Math.abs(dx) + Math.abs(dz) <= r * 1.42;
    const R = 9;
    for (let y = PARA - 2; y < 104; y++)
      for (let z = cz - R - 1; z <= cz + R; z++)
        for (let x = cx - R - 1; x <= cx + R; x++) {
          const dx = x + 0.5 - cx,
            dz = z + 0.5 - cz;
          if (!oct(dx, dz, R)) continue;
          const edge = !oct(dx, dz, R - 1);
          let c: Paint = stone;
          if (edge) {
            const a = Math.atan2(dz, dx);
            const f = (((a / (Math.PI * 2)) * 8 + 8.5) % 1) - 0.5; // -0.5..0.5 across a face
            const corner = Math.abs(f) > 0.36;
            if (corner) c = y % 6 === 0 ? stoneLt : stone;
            else if (y >= 74 && y < 96 && Math.abs(f) < 0.22 && pointed(Math.round((f + 0.22) * 9), y - 74, 4, 22)) c = Math.abs(f) < 0.04 ? stoneLt : y % 7 === 3 ? stoneLt : glass;
            else if (y === 72 || y === 97 || y === 98) c = stoneLt;
          }
          m.set(x, y, z, c);
        }
    // pinnacles round the drum, the spire with crockets on its ribs, the gilt finial
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(a) * (R - 0.5) - 0.5),
        pz = Math.round(cz + Math.sin(a) * (R - 0.5) - 0.5);
      for (let y = 104; y < 114; y++) m.set(px, y, pz, y > 111 ? gold : stoneLt);
    }
    for (let y = 104; y < 140; y++) {
      const r = R - 1 - ((y - 104) / 36) * (R - 1);
      for (let z = cz - R; z <= cz + R; z++)
        for (let x = cx - R; x <= cx + R; x++) {
          const dx = x + 0.5 - cx,
            dz = z + 0.5 - cz;
          if (!oct(dx, dz, r)) continue;
          const rib = !oct(dx, dz, r - 0.9) && Math.abs(Math.abs(dx) - Math.abs(dz)) < 1.2;
          m.set(x, y, z, rib ? stoneLt : (y >> 1) % 3 === 0 ? recess : stone);
          if (rib && y % 4 === 0) m.set(x + Math.sign(dx), y, z + Math.sign(dz), stoneLt);
        }
    }
    for (let y = 140; y < 148; y++) m.box(cx - (y === 143 ? 1 : 0), y, cz, cx + 1 + (y === 143 ? 1 : 0), y + 1, cz + 1, gold);
  }

  // ---- the Victoria Tower ----------------------------------------------------------------------
  const VTOP = 108;
  {
    const vb: Box = { x0: VX0, x1: VX1, z0: VZ0, z1: VZ1 };
    m.box(VX0, 0, VZ0, VX1, VTOP, VZ1, stone);
    m.box(VX0 - 1, 0, VZ0 - 1, VX1 + 1, 6, VZ1 + 1, plinth);
    const w = VX1 - VX0;
    for (const s of SIDES) {
      const L = len(vb, s);
      for (let u = 0; u < L; u++) {
        const pier = u < 4 || u >= L - 4;
        if (pier) continue;
        // panels: ribs every 4, tall traceried windows in the upper stages
        const rib = (u - 4) % 4 === 0;
        for (let y = 6; y < VTOP; y++) {
          if (rib) {
            fset(vb, s, u, y, 1, y % 14 === 6 ? stoneLt : stone);
            continue;
          }
          const band = Math.floor((y - 6) / 14),
            j = (y - 6) % 14;
          if (j === 0) fset(vb, s, u, y, 1, stoneLt);
          const i = ((u - 4) % 4) - 1;
          if (band >= 2 && j >= 2 && j < 13 && pointed(i, j - 2, 3, 11)) {
            const big = band >= 4 && band <= 5;
            fset(vb, s, u, y, 0, 0);
            fset(vb, s, u, y, -1, !(big || i === 1) ? recess : big && i !== 1 ? (hash(u, band, 3) < 0.3 ? lit : glass) : glass);
          } else if (band < 2 && j >= 3 && j < 12 && pointed(i, j - 3, 3, 9)) (fset(vb, s, u, y, 0, 0), fset(vb, s, u, y, -1, recess));
        }
      }
      // corner turrets, octagonal-ish, with gilt-tipped caps
      for (const u of [0, L - 3])
        for (let y = 6; y < VTOP + 12; y++)
          for (let a = 0; a < 3; a++)
            for (let dd = 0; dd < 2; dd++) {
              if (a !== 1 && dd === 1 && y % 2) continue;
              fset(vb, s, u + a, y, dd, y % 14 === 6 ? stoneLt : stone);
            }
      // crenellated, pierced parapet
      for (let u = 0; u < L; u++) {
        fset(vb, s, u, VTOP - 1, 1, stoneLt);
        for (let y = VTOP; y < VTOP + 5; y++) if (!(y >= VTOP + 1 && y <= VTOP + 3 && u % 2) || y === VTOP + 4) if (!(y === VTOP + 4 && u % 4 > 1)) fset(vb, s, u, y, 0, y >= VTOP + 3 ? stoneLt : stone);
      }
    }
    for (const [tx, tz] of [
      [VX0 - 1, VZ0 - 1],
      [VX1 - 2, VZ0 - 1],
      [VX0 - 1, VZ1 - 2],
      [VX1 - 2, VZ1 - 2],
    ]) {
      for (let y = VTOP + 12; y < VTOP + 22; y++) {
        const r = y < VTOP + 16 ? 1 : 0;
        m.box(tx + 1 - r, y, tz + 1 - r, tx + 2 + r, y + 1, tz + 2 + r, y === VTOP + 15 ? stoneLt : stone);
      }
      m.box(tx + 1, VTOP + 22, tz + 1, tx + 2, VTOP + 25, tz + 2, gold);
    }
    // the Sovereign's Entrance: a great pointed arch, a gilt gate inside
    const aw = 14,
      ah = 30,
      a0 = Math.floor((w - aw) / 2);
    for (let i = -1; i <= aw; i++)
      for (let j = 0; j <= ah; j++) {
        const inside = i >= 0 && i < aw && j < ah && pointed(i, j, aw, ah);
        const ring = !inside && pointed(i + 1, j, aw + 2, ah + 1);
        if (ring) fset(vb, "s", a0 + i, j, 1, stoneLt);
        if (inside) {
          for (let dd = 0; dd > -4; dd--) m.set(...xyz(at(vb, "s", a0 + i, dd), j), 0);
          const g = j < 20 && (i % 3 === 1 || j % 4 === 0);
          m.set(...xyz(at(vb, "s", a0 + i, -4), j), g ? gold : deep);
        }
      }
    // statue niches over it: a row of crowned figures
    for (let n = 0; n < 6; n++) {
      const u = a0 - 3 + n * 4;
      for (let y = 36; y < 46; y++) for (let a = 0; a < 2; a++) if (pointed(a, y - 36, 2, 10)) fset(vb, "s", u + a, y, 0, deep);
      for (let y = 37; y < 43; y++) fset(vb, "s", u, y, -1, y > 41 ? gold : C("#d8c8a0"));
    }
    // the royal arms panel
    for (let u = a0 + 3; u < a0 + 11; u++) for (let y = 48; y < 56; y++) fset(vb, "s", u, y, 1, (u + y) % 3 ? gold : red);
    // flagstaff and the Union flag
    const fx = Math.floor((VX0 + VX1) / 2),
      fz = Math.floor((VZ0 + VZ1) / 2);
    m.box(fx - 3, VTOP, fz - 3, fx + 3, VTOP + 3, fz + 3, stone);
    for (let y = VTOP + 3; y < VTOP + 44; y++) m.set(fx, y, fz, y > VTOP + 42 ? gold : C("#e8e4dc"));
    const FW = 20,
      FH = 10,
      fy = VTOP + 31;
    for (let i = 0; i < FW; i++)
      for (let j = 0; j < FH; j++) {
        const u = (i + 0.5) / FW - 0.5,
          v = (j + 0.5) / FH - 0.5;
        const a = Math.abs(u - v * (FH / FW) * (FW / FH)),
          b = Math.abs(u + v);
        const diag = Math.min(a, b);
        let c = C("#1f3a8a");
        if (diag < 0.1) c = C("#f4f4f4");
        if (diag < 0.04 && (u > 0) === (v > 0 ? a < b : a > b)) c = C("#c8102e");
        if (Math.abs(u) < 0.1 || Math.abs(v) < 0.2) c = C("#f4f4f4");
        if (Math.abs(u) < 0.05 || Math.abs(v) < 0.1) c = C("#c8102e");
        // a little ripple in the cloth
        const dz = Math.round(Math.sin(i * 0.7) * 0.8);
        m.set(fx + 1 + i, fy + j, fz + dz, c);
      }
  }
  function xyz(p: [number, number], y: number): [number, number, number] {
    return [p[0], y, p[1]];
  }

  // ---- the Elizabeth Tower ---------------------------------------------------------------------
  const shaft: Box = { x0: EX0, x1: EX1, z0: EZ0, z1: EZ1 };
  const SH1 = 80; // top of the shaft
  const CL0 = 80,
    CL1 = 112; // clock stage
  const DY = 96,
    DR = 10; // dial centre height, radius
  const BL0 = CL1,
    BL1 = 130; // belfry
  const LN1 = 140; // Ayrton lantern
  const SP1 = 168; // spire tip
  m.box(EX0, 0, EZ0, EX1, SH1, EZ1, stone);
  m.box(EX0 - 1, 0, EZ0 - 1, EX1 + 1, 6, EZ1 + 1, plinth);
  m.box(EX0 - 1, 6, EZ0 - 1, EX1 + 1, 7, EZ1 + 1, stoneLt);
  {
    const L = EX1 - EX0; // 26
    for (const s of SIDES)
      for (let u = 0; u < L; u++) {
        const pier = u < 4 || u >= L - 4;
        for (let y = 7; y < SH1; y++) {
          if (pier) {
            // corner buttresses with weathered set-offs
            if (u === 0 || u === L - 1 || (y % 18 < 15 && (u === 1 || u === L - 2))) fset(shaft, s, u, y, 1, y % 18 === 15 ? stoneLt : stone);
            continue;
          }
          const rib = u === 7 || u === 12 || u === 13 || u === 18;
          if (rib) {
            fset(shaft, s, u, y, 1, stone);
            continue;
          }
          const j = (y - 6) % 12;
          if (j === 0) {
            fset(shaft, s, u, y, 1, stoneLt);
            continue;
          }
          // lancet panels; the wider ones carry the stair's slit windows
          const [p0, pw] = u < 7 ? [4, 3] : u < 12 ? [8, 4] : u < 18 ? [14, 4] : [19, 3];
          const i = u - p0;
          if (j >= 2 && j < 11 && pointed(i, j - 2, pw, 9)) {
            fset(shaft, s, u, y, 0, 0);
            fset(shaft, s, u, y, -1, recess);
            if (pw === 4 && (i === 1 || i === 2) && j >= 3 && j < 10 && (y > 20 || s !== "s")) fset(shaft, s, u, y, -1, glass);
          }
        }
        // the frieze under the clock stage: quatrefoils and shields
        for (let y = 72; y < 79; y++) if (!pier) fset(shaft, s, u, y, 0, y === 72 || y === 78 ? stoneLt : (u + y) % 4 === 0 ? gold : (u + y) % 4 === 2 ? blue : recess);
      }
    // the door: a pointed arch at the foot of the river face
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 16; j++) {
        if (!pointed(i, j, 6, 16)) continue;
        for (let dd = 1; dd >= -1; dd--) fset(shaft, "s", 10 + i, j + 1, dd, 0);
        fset(shaft, "s", 10 + i, j + 1, -2, j >= 11 ? E("#ffc070", 1.4) : (i + j) % 4 === 0 ? goldDk : C("#3a2416"));
      }
    for (let i = -1; i < 7; i++) fset(shaft, "s", 10 + i, 18, 2, stoneLt);
  }

  // the clock stage: one voxel proud, the four gilded dial surrounds
  const clock: Box = { x0: EX0 - 1, x1: EX1 + 1, z0: EZ0 - 1, z1: EZ1 + 1 };
  m.box(clock.x0, CL0, clock.z0, clock.x1, CL1, clock.z1, stone);
  m.box(clock.x0 - 1, CL0, clock.z0 - 1, clock.x1 + 1, CL0 + 2, clock.z1 + 1, stoneLt);
  {
    const L = clock.x1 - clock.x0; // 28
    const C0 = L / 2;
    for (const s of SIDES)
      for (let u = 0; u < L; u++)
        for (let y = CL0 + 2; y < CL1; y++) {
          const du = u + 0.5 - C0,
            dv = y + 0.5 - DY;
          const r = Math.hypot(du, dv);
          const sq = Math.max(Math.abs(du), Math.abs(dv));
          if (r < DR) {
            // the opal dial, recessed under the gilt rim: numerals and the minute track in iron
            const ang = Math.atan2(dv, du);
            const hourOff = Math.abs((((ang / (Math.PI * 2)) * 12 + 12.5) % 1) - 0.5) * ((Math.PI * 2) / 12) * r;
            let c: number = dialC;
            if (r >= DR - 0.9) c = numeral;
            else if (r > 6.6 && r < DR - 1.3 && hourOff < (Math.abs(dv) > 7 || Math.abs(du) > 7 ? 0.75 : 0.62)) c = numeral;
            else if (r < 0.75) c = numeral;
            fset(clock, s, u, y, 0, c);
          } else if (r < DR + 1.2) fset(clock, s, u, y, 1, gold);
          else if (sq < 12.5) {
            // spandrels: gilt tracery on Prussian blue, gilt frame
            const edge = sq >= 11.5;
            const trace = (u + y) % 3 === 0 || (u - y + 300) % 3 === 0;
            fset(clock, s, u, y, 1, edge ? gold : trace ? goldDk : blue);
          } else if (u < 2 || u >= L - 2) fset(clock, s, u, y, 1, stone);
          else if (y === CL1 - 2 || y === CL1 - 1) fset(clock, s, u, y, 1, stoneLt);
          // the inscription band under the dial
          if (y >= CL0 + 2 && y < CL0 + 4 && u >= 3 && u < L - 3) fset(clock, s, u, y, 1, (u + y) % 2 ? gold : blueDk);
        }
    // corner pinnacles of the clock stage
    for (const [px, pz] of [
      [clock.x0 - 1, clock.z0 - 1],
      [clock.x1 - 2, clock.z0 - 1],
      [clock.x0 - 1, clock.z1 - 2],
      [clock.x1 - 2, clock.z1 - 2],
    ]) {
      m.box(px, CL0, pz, px + 3, CL1 + 2, pz + 3, stone);
      for (let y = CL1 + 2; y < CL1 + 14; y++) {
        const r = y < CL1 + 7 ? 1 : 0;
        m.box(px + 1 - r, y, pz + 1 - r, px + 2 + r, y + 1, pz + 2 + r, y % 3 === 0 ? stoneLt : stone);
      }
      m.box(px + 1, CL1 + 14, pz + 1, px + 2, CL1 + 16, pz + 2, gold);
    }
  }

  // the belfry: three louvred lancets a side under crocketed gablets
  const bel: Box = { x0: EX0 + 1, x1: EX1 - 1, z0: EZ0 + 1, z1: EZ1 - 1 };
  m.box(bel.x0, BL0, bel.z0, bel.x1, BL1, bel.z1, stone);
  m.box(bel.x0 + 3, BL0, bel.z0 + 3, bel.x1 - 3, BL1, bel.z1 - 3, C("#15120f"));
  {
    const L = bel.x1 - bel.x0; // 24
    for (const s of SIDES) {
      for (const u0 of [3, 10, 17]) {
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 14; j++) {
            const y = BL0 + 2 + j;
            if (!pointed(i, j, 4, 14)) continue;
            fset(bel, s, u0 + i, y, 0, 0);
            fset(bel, s, u0 + i, y, -1, j % 2 ? C("#4a4038") : C("#1a1612"));
            fset(bel, s, u0 + i, y, -2, C("#1a1612"));
          }
        // the gablet over it
        for (let j = 0; j < 4; j++) for (let i = j; i < 4 - j; i++) fset(bel, s, u0 + i, BL1 - 2 + j, 1, j === 3 || i === j || i === 3 - j ? stoneLt : stone);
        fset(bel, s, u0 + 1, BL1 + 2, 1, gold);
        fset(bel, s, u0 + 2, BL1 + 2, 1, gold);
      }
      for (let u = 0; u < L; u++) {
        fset(bel, s, u, BL0 + 1, 1, stoneLt);
        fset(bel, s, u, BL1 - 1, 0, stoneLt);
      }
      for (const u of [0, 1, L - 2, L - 1, 8, 15]) for (let y = BL0 + 1; y < BL1 - 2; y++) fset(bel, s, u, y, 1, stone);
    }
  }

  // the Ayrton Light: an iron and glass lantern stage, lit when the House sits (and at night)
  const lan: Box = { x0: EX0 + 4, x1: EX1 - 4, z0: EZ0 + 4, z1: EZ1 - 4 };
  m.box(lan.x0 - 1, BL1, lan.z0 - 1, lan.x1 + 1, BL1 + 2, lan.z1 + 1, stoneLt);
  m.box(lan.x0, BL1 + 2, lan.z0, lan.x1, LN1, lan.z1, C("#2a2620"));
  {
    const L = lan.x1 - lan.x0; // 18
    for (const s of SIDES)
      for (let u = 0; u < L; u++)
        for (let y = BL1 + 2; y < LN1; y++) {
          const post = u < 2 || u >= L - 2 || u % 4 === 1;
          if (post) fset(lan, s, u, y, 0, y === BL1 + 5 ? gold : blue);
          else if (y > BL1 + 2 && y < LN1 - 2) fset(lan, s, u, y, 0, pointed((u - 2) % 4, y - BL1 - 3, 3, 5) ? E("#ffc860", 1.5) : blue);
          else fset(lan, s, u, y, 0, gold);
        }
  }

  // the spire: Prussian blue iron with gilt bands and hips, lucarnes, orb and cross
  {
    const B0 = LN1;
    const R0 = 8.5;
    for (let y = B0; y < SP1; y++) {
      const t = (y - B0) / (SP1 - B0);
      const r = R0 * (1 - t) + 0.6 * t;
      for (let z = Math.floor(ECZ - r); z < Math.ceil(ECZ + r); z++)
        for (let x = Math.floor(ECX - r); x < Math.ceil(ECX + r); x++) {
          const dx = x + 0.5 - ECX,
            dz = z + 0.5 - ECZ;
          if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
          const hipLine = Math.abs(Math.abs(dx) - Math.abs(dz)) < 1.1;
          m.set(x, y, z, hipLine || y % 5 === 0 ? gold : y % 5 === 4 ? blueDk : blue);
        }
    }
    // a gabled lucarne on each face, low on the spire
    for (const s of SIDES) {
      const lb: Box = { x0: Math.round(ECX - 9), x1: Math.round(ECX + 9), z0: Math.round(ECZ - 9), z1: Math.round(ECZ + 9) };
      for (let j = 0; j < 7; j++)
        for (let i = 0; i < 4; i++) {
          const y = B0 + 2 + j;
          if (j >= 4 && (i < j - 3 || i > 6 - j)) continue;
          fset(lb, s, 7 + i, y, -1, j < 4 && (i === 1 || i === 2) ? E("#ffc860", 1.6) : gold);
        }
    }
    // corner pinnacles at the foot of the spire
    for (const [px, pz] of [
      [EX0 + 2, EZ0 + 2],
      [EX1 - 3, EZ0 + 2],
      [EX0 + 2, EZ1 - 3],
      [EX1 - 3, EZ1 - 3],
    ])
      for (let y = BL1 + 2; y < BL1 + 12; y++) m.set(px, y, pz, y > BL1 + 9 ? gold : stone);
    // orb and cross
    const cx = Math.floor(ECX),
      cz = Math.floor(ECZ);
    m.box(cx - 1, SP1, cz - 1, cx + 1, SP1 + 2, cz + 1, gold);
    m.box(cx - 1, SP1 + 2, cz - 1, cx + 1, SP1 + 9, cz + 1, gold);
    m.box(cx - 2, SP1 + 6, cz - 1, cx + 2, SP1 + 7, cz + 1, gold);
  }

  // ---- the terrace: lamp standards, benches, a telephone box, a constable, tourists -----------
  const lampSpots: number[] = [];
  for (let x = 12; x < W - 34; x += 22) {
    const z = D - 4;
    lampSpots.push(x);
    m.box(x - 1, 1, z - 1, x + 2, 3, z + 2, C("#1f2a24"));
    m.box(x, 3, z, x + 1, 12, z + 1, C("#1f2a24"));
    m.box(x - 1, 11, z, x + 2, 12, z + 1, C("#1f2a24"));
    for (const dx of [-1, 1]) {
      m.set(x + dx, 12, z, lampC);
      m.set(x + dx, 13, z, lampC);
      m.set(x + dx, 14, z, gold);
    }
    m.set(x, 13, z, gold);
  }
  for (let x = 23; x < W - 40; x += 22) {
    const z = D - 5;
    m.box(x, 1, z, x + 4, 2, z + 1, C("#2a3a2c"));
    m.box(x, 2, z + 1, x + 4, 3, z + 2, C("#2a3a2c"));
  }
  // the red K2 kiosk by the tower
  {
    const x = EX0 - 7,
      z = FZ + 5;
    const r = C("#c2201c");
    m.box(x, 1, z, x + 3, 9, z + 3, r);
    for (const [dx, dz] of [
      [1, 2],
      [1, 0],
    ])
      for (let y = 3; y < 7; y++) m.set(x + dx, y, z + dz, y === 5 ? r : G("#c8d8d8"));
    for (let y = 3; y < 7; y++) m.set(x + 2, y, z + 1, y === 5 ? r : G("#c8d8d8"));
    m.box(x, 9, z, x + 3, 10, z + 3, r);
    m.set(x + 1, 10, z + 1, gold);
    m.set(x + 1, 8, z + 2, E("#f4f0e0", 1.4));
  }
  const skin = [C("#e8c4a0"), C("#c89670"), C("#8a5a3c"), C("#f0d0b4")];
  const shirts = ["#d04040", "#3a6ab0", "#f0f0f0", "#3e9a5a", "#f4b728", "#7a4ab0", "#e07a30", "#2a2a34", "#c8b490"].map((h) => C(h));
  const person = (x: number, z: number, sd: number) => {
    const h = (n: number) => hash(x, z, n, sd);
    m.box(x, 1, z, x + 1, 3, z + 1, h(1) < 0.5 ? C("#2a3448") : C("#4a4038"));
    m.box(x, 3, z, x + 1, 5, z + 1, shirts[Math.floor(h(2) * shirts.length)]);
    m.set(x, 5, z, skin[Math.floor(h(3) * skin.length)]);
    if (h(4) < 0.25) m.set(x, 6, z, shirts[Math.floor(h(5) * shirts.length)]);
  };
  let n = 0;
  for (let x = 6; x < W - 6; x += 1) {
    if (hash(x, 3, 7, seed) > 0.12) continue;
    const z = FZ + 4 + Math.floor(hash(x, 4, 8, seed) * 6);
    if (z >= D - 3 || m.get(x, 1, z)) continue;
    person(x, z, n++);
  }
  // a group photographing the tower, a constable in his custodian helmet by the door
  for (const [dx, dz] of [
    [-12, 6],
    [-10, 7],
    [-13, 8],
    [-8, 6],
  ])
    person(Math.round(ECX) + dx, EZ1 + dz, 31 + dx);
  {
    const x = Math.round(ECX) + 6,
      z = EZ1 + 3;
    const navy = C("#1b2236");
    m.box(x, 1, z, x + 1, 5, z + 1, navy);
    m.set(x, 5, z, skin[0]);
    m.box(x, 6, z, x + 1, 8, z + 1, navy);
    m.set(x, 7, z + 1, C("#d8dce4"));
  }

  // ---- lights, collisions, points --------------------------------------------------------------
  const lights: Built["lights"] = [
    [ECX, DY, EZ1 + 8, "#ffd08a"],
    [ECX, BL1 + 4, ECZ, "#ffc860"],
    [midX, 40, FZ + 6, "#ffd8a0"],
    [(VX0 + VX1) / 2, 40, VZ1 + 6, "#ffd8a0"],
    ...lampSpots.slice(1, 4).map((x) => [x, 13, D - 4, "#ffc870"] as [number, number, number, string]),
  ];
  const walls: [number, number, number, number][] = [
    [VX0 - 1, VZ0 - 1, VX1 + 1, VZ1 + 1],
    [RX0, BZ0 - 2, RX1, FZ + 1],
    ...PAV.map(([a, b]) => [a - 1, BZ0 - 2, b + 1, PZ + 1] as [number, number, number, number]),
    [EX0 - 1, EZ0 - 1, EX1 + 1, EZ1 + 1],
    [0, D - 2, W, D],
  ];
  const doorX = Math.round(ECX);
  const points: Record<string, [number, number, number]> = {
    door: [doorX, 0, EZ1 + 3],
    keeper: [doorX + 4, 0, EZ1 + 2],
    camPos: [W + 70, 78, D + 150],
    camLook: [W - 60, 70, 24],
    // the four dials: centres on each dial's plane (the hands go just outside it)
    clockS: [ECX, DY, clock.z1],
    clockN: [ECX, DY, clock.z0],
    clockE: [clock.x1, DY, ECZ],
    clockW: [clock.x0, DY, ECZ],
    clockR: [DR, 0, 0],
    bell: [ECX, BL0 + 6, ECZ],
    ayrton: [ECX, BL1 + 6, ECZ],
    cross: [ECX, SP1 + 9, ECZ],
  };
  return { model: m, signs: [], door: [doorX, Math.min(D - 3, EZ1 + 3)], body: [0, 0, W, D], lights, walls, points, scale: k };
}
