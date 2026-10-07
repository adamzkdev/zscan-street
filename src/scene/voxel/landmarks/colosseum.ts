import type { Built } from "../buildings";
import { C, E, hash, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";

/**
 * THE COLOSSEUM: the Flavian amphitheatre, travertine voxels. An elliptical outer wall of four
 * storeys (three arcades framed by engaged Tuscan, Ionic and Corinthian half-columns, then the
 * attic with its windows and mast corbels), broken away on the right where the outer ring fell,
 * leaving the second ring's arcades, the radial walls and the brick buttress wedges exposed. Inside:
 * the cavea in ruined tiers ribbed with brick, the podium round the arena, the arena itself half
 * covered by the modern wooden floor and half open onto the hypogeum's walls. In front: a sampietrini
 * plaza with the travertine bollard ring, an Arch of Constantine, umbrella pines and cypresses,
 * tourists, a gladiator re-enactor posing for photos, Roman lamp posts.
 *
 * Built at voxel scale 2 (1 voxel = 1/3 m). The ring is described per column by `s`, the radial
 * depth inside the outer ellipse, and `q`, the bay coordinate along it (bay 0 = the main entrance
 * on the front, 44 bays round).
 */
export function colosseum(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 96;
  const m = new VoxelModel(W, H, D);

  // ---- layout --------------------------------------------------------------------------------
  const A = 75, // outer semi-axis along x
    B = 61; // along z
  const cx = W / 2,
    cz = B + 8;
  const fz = Math.round(cz + B); // front of the outer wall
  const G0 = 6; // top of the stylobate
  const LV = [
    { y0: G0, y1: G0 + 20 },
    { y0: G0 + 20, y1: G0 + 40 },
    { y0: G0 + 40, y1: G0 + 60 },
  ];
  const ATTIC0 = G0 + 60,
    TOP = G0 + 84;
  const NB = 44;
  const AF = 9; // arena floor level
  const POD = AF + 10; // podium top
  const IN0 = 12,
    IN1 = 14; // second ring (s range)
  const NR = 14; // seat rows
  const ROW_H = 3.2;
  const Aa = 39,
    Ba = 23; // arena semi-axes

  const Rof = (c: number, s: number, a: number, b: number) => 1 / Math.sqrt((c / a) ** 2 + (s / b) ** 2);

  // arc length along the outer ellipse from the front (polar angle π/2), as a table
  const NT = 4096;
  const uTab = new Float64Array(NT + 1);
  {
    let px = 0,
      pz = B;
    for (let i = 1; i <= NT; i++) {
      const ph = Math.PI / 2 + (i / NT) * Math.PI * 2;
      const c = Math.cos(ph),
        s = Math.sin(ph);
      const R = Rof(c, s, A, B);
      const x = R * c,
        z = R * s;
      uTab[i] = uTab[i - 1] + Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
    }
  }
  const P = uTab[NT];
  const bayLen = P / NB;
  const qOf = (ph: number) => {
    let psi = (ph - Math.PI / 2) / (Math.PI * 2);
    psi -= Math.floor(psi);
    const f = psi * NT,
      i = Math.floor(f);
    const u = uTab[i] + (uTab[Math.min(NT, i + 1)] - uTab[i]) * (f - i);
    return u / bayLen;
  };

  // ---- palette -------------------------------------------------------------------------------
  // colours vary in coarse patches (and only sideways on the curved walls, as vertical weathering
  // streaks), so the greedy mesher still merges big faces
  type Fn = (x: number, y: number, z: number) => number;
  const sh = (hexes: string[], sx: number, sy: number, sd: number): Fn => {
    const ids = hexes.map((h) => C(h));
    return (x, y, z) => ids[Math.floor(hash(Math.floor(x / sx), Math.floor(y / sy), Math.floor(z / sx), sd) * ids.length)];
  };
  const one = (hex: string): Fn => {
    const c = C(hex);
    return () => c;
  };
  const trav = one("#d6caad");
  const travL = one("#e4dac2");
  const travD = sh(["#b9aa8c", "#b3a487"], 4, 12, seed + 2);
  const soot = one("#958972");
  const brick = sh(["#a65a3e", "#9c5239"], 5, 8, seed + 4);
  const brickD = one("#7e4430");
  const tuff = sh(["#9a9484", "#908a7b"], 4, 10, seed + 6);
  const tuffP = one("#968f80");
  const marble = one("#e9e3d6");
  const earth = sh(["#6e5e48", "#665640"], 4, 9, seed + 8);
  const moss = one("#5e7e40");
  const wood = one("#8a6a48");
  const woodD = C("#5a4430");
  const sand = one("#d9b77a");
  const dark = C("#2a2420");
  const iron = C("#2a2830");
  const glowArch = E("#ffb050", 1.5);
  const lampLit = E("#ffd08a", 1.6);
  const cobble = C("#5e5a57");
  const paveT = C("#bdb39e");
  const grass = sh(["#5f8a3e", "#6a9644"], 6, 9, seed + 14);

  /** Travertine with weathering: vertical soot streaks, darker near the ground. */
  const stone: Paint = (x, y, z) => {
    const band = y < G0 + 8 ? 0 : y < ATTIC0 ? 1 : 2;
    const h = hash(x >> 3, band, z >> 3, seed + 20);
    if (band === 0 && h < 0.5) return travD(x, y, z);
    if (h < 0.12) return soot(x, y, z);
    if (h < 0.3) return travD(x, y, z);
    if (h > 0.88) return travL(x, y, z);
    return trav(x, y, z);
  };

  // ---- the ruined arc (right side): bay range in signed q ------------------------------------------
  const RA = -18.5,
    RB = -3.5;
  const ruinDepth = (qs: number) => Math.min(qs - RA, RB - qs); // > 0 inside the ruin

  // ---- ground: sampietrini, the travertine ring and its bollards ---------------------------------
  m.box(0, 0, 0, W, 1, D, cobble);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx,
        dz = z + 0.5 - cz;
      const ph = Math.atan2(dz, dx);
      const s = Rof(Math.cos(ph), Math.sin(ph), A, B) - Math.hypot(dx, dz);
      if (s > -16 && s < -6) m.set(x, 0, z, paveT);
    }
  // grass verges at the back corners
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx,
        dz = z + 0.5 - cz;
      const ph = Math.atan2(dz, dx);
      const s = Rof(Math.cos(ph), Math.sin(ph), A, B) - Math.hypot(dx, dz);
      if (s < -18 && z < cz - 10 && (x < 30 || x > W - 30)) m.set(x, 0, z, grass);
    }

  // ---- the amphitheatre, column by column ----------------------------------------------------
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx,
        dz = z + 0.5 - cz;
      const r = Math.hypot(dx, dz);
      const ph = Math.atan2(dz, dx);
      const co = Math.cos(ph),
        si = Math.sin(ph);
      const R = Rof(co, si, A, B);
      const s = R - r;
      if (s < -7) continue;
      const q = qOf(ph);
      const bay = Math.round(q) % NB;
      const w = (q - Math.round(q)) * bayLen; // from the bay centre, along the outer face
      const e = bayLen / 2 - Math.abs(w); // to the pier centre
      let qs = q;
      if (qs > NB / 2) qs -= NB;
      const rd = ruinDepth(qs);
      const entrance = bay === 0 || bay === 11 || bay === 22 || bay === 33;

      // stylobate: three travertine steps
      if (s < 0) {
        const top = s < -5 ? 2 : s < -3 ? 4 : G0;
        m.box(x, 1, z, x + 1, top, z + 1, s < -5 ? travD : stone);
      }

      // -- the outer wall: s in [-1.5, 3) --
      if (s >= -2 && s < 3) {
        let top = TOP;
        let cutBrick = false;
        if (rd > 0) {
          if (rd < 1.6) {
            // the broken edge steps down bay by bay, the Valadier brick wedge holds it
            const stepQ = Math.floor(rd * 3) / 3;
            top = Math.round(G0 + 82 * (1 - stepQ / 1.6) - hash(bay, 1, Math.floor(rd * 6), seed) * 6);
            cutBrick = rd < 0.9;
          } else top = G0 + 2 + Math.floor(hash(bay, Math.floor(w), 3, seed) * 5) + (hash(bay, 2, 2, seed) < 0.25 && e < 2 ? 14 : 0);
        }
        const outer = s < 0; // engaged columns, cornices, pilasters
        for (let y = G0; y < Math.min(top, TOP + 2); y++) {
          let c: Paint | 0 = 0;
          const lv = LV.findIndex((l) => y >= l.y0 && y < l.y1);
          if (lv >= 0) {
            const L = LV[lv];
            const ly = y - L.y0;
            const ent = ly >= 17; // entablature band
            const spring = lv === 0 ? 11 : 10;
            const half = 3.4;
            const archTop = spring + Math.sqrt(Math.max(0, half * half - w * w));
            const open = !ent && Math.abs(w) < half && ly < archTop;
            if (!outer) {
              if (open) {
                // parapets in the upper arcades
                if (lv > 0 && ly < 3 && s >= 1 && s < 2) c = travD;
              } else {
                c = stone;
                // the voussoir ring round each arch, keystone on top
                if (!ent && Math.abs(w) < half + 1.1 && ly < archTop + 1.2 && ly >= spring - 0.5) c = travL;
                if (!ent && Math.abs(w) < 0.6 && ly >= archTop && ly < archTop + 2) c = travL;
                // the number carved over every ground-floor arch
                if (lv === 0 && !entrance && ly === 16 && Math.abs(w) < 1.3 && s < 0.6 && (Math.floor(w * 2) + bay) % 2 === 0) c = dark;
                // the impost band
                if (!ent && ly === spring - 1 && s < 0.6) c = travL;
                // entablature: architrave, frieze, cornice
                if (ent && ly === 17 && s < 0.6) c = travL;
              }
              // warm light inside each arch at night
              if (open && s >= 2 && ly >= Math.floor(archTop) - 1 && ly < archTop && Math.abs(w) < 0.6) c = glowArch;
            } else {
              // outside the wall face: engaged half-columns at the piers, the cornice band
              if (ent) {
                if (ly === 18 && s >= -1.2) c = travL;
                else if (ly === 19 && s >= -1.8) c = stone;
              } else if (e < 1.25 && s >= -1.5) {
                if (ly === 0 || ly === 1) c = s >= -1.5 && e < 1.5 ? travD : 0; // base
                else if (ly >= 15) {
                  // capitals: Tuscan plain, Ionic volutes, Corinthian leaves
                  if (lv === 0) c = ly === 16 ? travL : stone;
                  else if (lv === 1) c = ly === 16 && e < 0.6 ? travD : travL;
                  else c = ly === 16 ? travD : travL;
                } else c = stone;
              }
              if (ent && e < 1.6 && ly === 17 && s >= -1.2) c = travL;
            }
          } else if (y >= ATTIC0) {
            // the attic: pilasters, small windows in alternate bays, the corbels and the cornice
            const ay = y - ATTIC0;
            if (!outer) {
              c = stone;
              if (bay % 2 === 0 && Math.abs(w) < 1.4 && ay >= 7 && ay < 12) c = s < 1 ? dark : 0;
              if (ay === 0 && s < 0.6) c = travL;
            } else {
              if (e < 0.9 && s >= -0.8 && ay < 19) c = ay > 16 ? travL : stone;
              if (ay === 17 && s >= -1 && (Math.abs(w) < 0.6 || Math.abs(Math.abs(w) - 2.5) < 0.5)) c = travD; // corbels for the velarium masts
              if (ay >= 20 && ay < 22 && s >= -1.6) c = ay === 21 ? travL : stone;
              if (ay === 0 && s >= -0.8) c = travL;
            }
            if (y >= TOP) c = !outer ? (s < 2 ? travD : 0) : 0;
          }
          if (cutBrick && c && !outer && s > 0.5) c = brick;
          if (c) m.set(x, y, z, c);
        }
        // the brick wedges buttressing both broken ends
        if (rd > 0 && rd < 1.1 && s >= -5 && s < 3) {
          const bt = Math.round(G0 + 78 * (1 - rd / 1.1) * Math.min(1, (s + 6) / 8));
          m.box(x, G0, z, x + 1, bt, z + 1, brick);
        }
        // rubble along the fallen stretch
        if (rd > 1.6 && s < -1 && s > -6 && hash(x, 7, z, seed) < 0.12) m.box(x, G0, z, x + 1, G0 + 1 + Math.floor(hash(x, 8, z, seed) * 2), z + 1, travD);
        continue;
      }

      // -- the ambulatories between the rings: s in [3, 12) --
      if (s >= 3 && s < IN0) {
        const ruined = rd > 0.3;
        // ground floor paving
        m.set(x, G0 - 1, z, travD);
        const pier = e < 1.4;
        const inner = s > 8;
        // radial walls at the piers, vaults (floors) at each storey
        if (pier) {
          let top = ATTIC0;
          if (ruined) top = Math.round(G0 + 4 + (s - 3) * 3 + hash(bay, 4, 4, seed) * 18);
          // arched passages through the radial walls
          for (let y = G0; y < Math.min(top, ATTIC0); y++) {
            const lv = LV.findIndex((l) => y >= l.y0 && y < l.y1);
            const ly = lv >= 0 ? y - LV[lv].y0 : 99;
            const mid = (s - 7.5) * 1.1;
            const passage = ly < 9 + Math.sqrt(Math.max(0, 2.2 * 2.2 - mid * mid)) && Math.abs(mid) < 2.2;
            if (!passage || e > 0.8 || !ruined) m.set(x, y, z, ruined && y > G0 + 20 ? brick : tuffP);
          }
        }
        for (const L of LV) {
          if (ruined && !(L === LV[0] && inner)) continue;
          m.box(x, L.y1 - 2, z, x + 1, L.y1, z + 1, ruined ? brick : tuffP);
        }
        if (!ruined) m.box(x, ATTIC0 - 1, z, x + 1, ATTIC0 + 1, z + 1, travD);
        continue;
      }

      // -- the second ring: s in [12, 14) --
      if (s >= IN0 && s < IN1) {
        const wi = (w * (R - s)) / R;
        let top = ATTIC0 - 2;
        if (rd > 0) top -= Math.floor(hash(bay, 5, Math.floor(wi), seed) * 5);
        for (let y = G0; y < top; y++) {
          const lv = LV.findIndex((l) => y >= l.y0 && y < l.y1);
          const ly = lv >= 0 ? y - LV[lv].y0 : 99;
          const half = 2.9;
          const at = (lv === 0 ? 10 : 9) + Math.sqrt(Math.max(0, half * half - wi * wi));
          const open = ly < 17 && Math.abs(wi) < half && ly < at && (rd > -1 || lv === 0);
          if (open) continue;
          let c: Paint = rd > 0 ? (ly >= 17 ? travL : stone) : tuffP;
          if (rd > 0 && ly === (lv === 0 ? 9 : 8) && s < 12.6) c = travL;
          m.set(x, y, z, c);
        }
        continue;
      }

      if (s < IN1) continue;
      // -- the cavea and the arena --
      const Ra = Rof(co, si, Aa, Ba);
      const Rin = R - IN1;
      const t = (r - Ra) / (Rin - Ra);
      if (t >= 0) {
        if (t < 0.06) {
          // the podium wall round the arena, faced in marble
          m.box(x, 1, z, x + 1, POD, z + 1, marble);
          m.set(x, POD, z, travL);
          continue;
        }
        const tt = (t - 0.06) / 0.94;
        const row = Math.min(NR - 1, Math.floor(tt * NR));
        const base = Math.round(POD + (row + 1) * ROW_H);
        const inRow = tt * NR - row; // 0 at the row's front edge
        const wi = (w * (R - s)) / R;
        const ei = (bayLen * (R - s)) / R / 2 - Math.abs(wi);
        // the three maeniana; each two-bay sector of each is either still seated in stone or a ruin
        // down to its brick skeleton: radial walls at the piers, concentric corridor walls, vaults
        const mae = row < 5 ? 0 : row < 10 ? 1 : 2;
        const first = mae * 5;
        const sector = Math.floor(((bay + NB) % NB) / 2);
        const intact = hash(sector, mae, 1, seed + 30) < (mae === 0 ? 0.45 : mae === 1 ? 0.3 : 0.2);
        const rib = ei < 0.8;
        const ring = row === first + 2 && inRow < 0.35;
        let hgt = base;
        let top: Paint;
        if (intact) {
          top = mae === 0 ? marble : mae === 1 ? (row % 2 ? trav : travL) : travD;
          if (row === first && inRow < 0.3 && mae > 0) top = travL; // the walkway
        } else if (rib || ring) {
          top = brickD;
          hgt = base - (rib ? 0 : 1);
        } else {
          // seats gone: the stepped brick vaults they rested on
          hgt = base - 3;
          top = hash(Math.floor(wi / 3), mae, bay, seed + 9) < 0.3 ? moss : brick;
        }
        m.box(x, 1, z, x + 1, hgt - 1, z + 1, brick);
        m.set(x, hgt - 1, z, top);
        // the balteus, a low wall at the back of each walkway
        if (intact && mae > 0 && row === first - 1 && inRow > 0.75) m.box(x, hgt, z, x + 1, hgt + 2, z + 1, travL);
        // vomitoria: dark mouths in the risers every other bay
        if (intact && row === first + 1 && inRow < 0.25 && Math.abs(wi) < 1.4 && bay % 2 === 1) m.box(x, hgt - 4, z, x + 1, hgt - 1, z + 1, dark);
        continue;
      }

      // the arena: half under the modern wooden floor, half open onto the hypogeum
      const ra = r / Ra; // 0 at the centre, 1 at the podium
      m.set(x, 1, z, hash(x >> 2, 2, z >> 2, seed) < 0.18 ? moss : earth);
      const platform = dx > 6;
      // hypogeum walls: the long corridors, cross walls, the curved service ring
      const az = Math.abs(dz);
      const longWall = az < 17 && [2, 6, 10, 14].some((v) => Math.abs(az - v) < 0.5);
      const crossWall = az > 2.5 && Math.abs(((dx % 6) + 6) % 6 - 3) < 0.5;
      const ringWall = ra > 0.84 && ra < 0.9;
      const centre = az < 0.5 && Math.abs(dx) > 26;
      if (longWall || crossWall || ringWall || centre) {
        let top = AF - 1;
        if (!platform) top = Math.round(AF - 1 - hash(Math.floor(dx / 3), Math.floor(dz / 3), 9, seed) * 4);
        // arched gaps along the long walls
        const gap = longWall && Math.abs(((dx % 5) + 5) % 5 - 2.5) < 1;
        for (let y = 2; y < top; y++) if (!(gap && y < 5)) m.set(x, y, z, Math.floor(dx / 6) % 2 ? brick(x, y, z) : tuff(x, y, z));
      }
      if (platform) {
        // the reconstructed floor: planks on beams
        m.set(x, AF - 1, z, (Math.floor(dz) & 7) === 0 ? woodD : wood(x, 0, z));
        if (Math.abs(dx - 6.5) < 0.6) m.box(x, AF, z, x + 1, AF + 3, z + 1, (Math.floor(dz) % 3 === 0 ? iron : 0) as number);
        if (Math.abs(dx - 6.5) < 0.6) m.set(x, AF + 3, z, iron);
        // a strip of sand at the far end, as the arena once was
        if (dx > 20 && ra < 0.8) m.set(x, AF - 1, z, sand);
      } else if (ra > 0.94) {
        // the service corridor's edge under the podium
        m.box(x, 2, z, x + 1, AF - 1, z + 1, tuff);
      }
    }

  // ---- the Arch of Constantine, in the plaza --------------------------------------------------
  {
    const x0 = 14,
      x1 = 56,
      z0 = 150,
      z1 = 163;
    const xc = (x0 + x1) / 2;
    const yT = 40;
    m.box(x0, 1, z0, x1, 30, z1, marble);
    m.box(x0, 30, z0 + 1, x1, yT, z1 - 1, marble);
    m.box(x0 - 1, 28, z0 - 1, x1 + 1, 30, z1 + 1, travL); // main cornice
    m.box(x0 - 1, yT - 1, z0, x1 + 1, yT, z1, travL);
    const passage = (xm: number, half: number, spring: number) => {
      for (let y = 1; y < spring + half + 1; y++)
        for (let x = Math.floor(xm - half); x <= Math.ceil(xm + half); x++) {
          const ddx = x + 0.5 - xm;
          if (Math.abs(ddx) > half) continue;
          if (y < spring || (y - spring) ** 2 + ddx * ddx < half * half) m.box(x, y, z0, x + 1, y + 1, z1, 0);
        }
      // archivolt
      for (let a = 0; a <= 24; a++) {
        const an = (a / 24) * Math.PI;
        const px = xm + Math.cos(an) * (half + 0.6),
          py = spring + Math.sin(an) * (half + 0.6);
        m.set(px, py, z1 - 1, travL);
        m.set(px, py, z0, travL);
      }
    };
    passage(xc, 6.5, 14);
    passage(x0 + 7.5, 3.2, 9);
    passage(x1 - 7.5, 3.2, 9);
    const gold = one("#d8b860");
    const dacian = one("#a89a8a");
    for (const face of [z1, z0 - 3]) {
      for (const xcol of [x0 + 1.5, x0 + 13, x1 - 14, x1 - 2.5]) {
        const xi = Math.round(xcol);
        m.box(xi - 1, 1, face, xi + 2, 8, face + 3, marble); // pedestal
        m.box(xi - 1, 4, face === z1 ? face + 2 : face, xi + 2, 6, face === z1 ? face + 3 : face + 1, travD); // relief on it
        m.box(xi, 8, face + 1, xi + 1, 27, face + 2, gold); // giallo antico shaft
        m.box(xi - 1, 8, face, xi + 2, 9, face + 3, travL);
        m.box(xi - 1, 26, face, xi + 2, 28, face + 3, travL); // capital
        m.box(xi - 1, 28, face, xi + 2, 30, face + 3, marble); // ressaut
        // the captive Dacians standing over each column
        m.box(xi, 30, face + 1, xi + 1, 36, face + 2, dacian);
        m.set(xi, 36, face + 1, dacian);
      }
    }
    // tondi over the side arches, relief panels and the dedication on the attic
    for (const xm of [x0 + 7.5, x1 - 7.5])
      for (let y = 15; y < 23; y++)
        for (let x = Math.floor(xm - 4); x <= xm + 4; x++) {
          const rr = Math.hypot(x + 0.5 - xm, y + 0.5 - 18.5);
          if (rr < 3.2) {
            m.set(x, y, z1 - 1, rr > 2.5 ? travL : travD);
            m.set(x, y, z0, rr > 2.5 ? travL : travD);
          }
        }
    for (const [a, b] of [
      [x0 + 3, x0 + 12],
      [x1 - 12, x1 - 3],
    ])
      for (const fzz of [z1 - 2, z0 + 1]) m.box(a, 31, fzz, b, 38, fzz + 1, travD);
    m.box(x0 + 15, 31, z1 - 2, x1 - 15, 38, z1 - 1, C("#9a907e"));
    // the dedication: two lines of gilt letters
    for (const y of [36, 33]) for (let x = x0 + 16; x < x1 - 16; x++) if (x % 3 !== 2 && hash(x, y, 1, 5) < 0.85) m.set(x, y, z1 - 1, C("#c9a227"));
    // frieze band over the side arches
    m.box(x0, 23, z1 - 1, x1, 24, z1, travL);
    m.box(x0, 23, z0, x1, 24, z0 + 1, travL);
  }

  // ---- trees: umbrella pines and cypresses --------------------------------------------------------
  const pineLeaf = sh(["#3e5a2e", "#4a6a34", "#56763a"], 3, 2, seed + 40);
  const cypLeaf = sh(["#2a4a2e", "#305434"], 2, 4, seed + 41);
  const bark = one("#6a4a36");
  const pine = (x: number, z: number, h: number, lean: number, rr: number, sd: number) => {
    for (let y = 1; y < h; y++) {
      const ox = Math.round((lean * y) / h);
      m.box(x + ox, y, z, x + ox + 2, y + 1, z + 2, bark);
    }
    const tx = x + lean + 1,
      tz = z + 1;
    for (const [bx, bz] of [
      [-4, 1],
      [4, -1],
      [1, 4],
    ])
      for (let i = 0; i < 4; i++) m.set(tx + (bx * i) / 4, h - 2 + i * 0.5, tz + (bz * i) / 4, bark);
    for (let y = h - 1; y < h + 5; y++)
      for (let zz = Math.floor(tz - rr); zz <= tz + rr; zz++)
        for (let xx = Math.floor(tx - rr); xx <= tx + rr; xx++) {
          const d2 = ((xx + 0.5 - tx) ** 2 + (zz + 0.5 - tz) ** 2) / (rr * rr) + ((y - h - 1.2) / 3.2) ** 2;
          if (d2 < 1 - 0.25 * hash(xx, y, zz, sd)) m.set(xx, y, zz, y === h - 1 ? cypLeaf : pineLeaf);
        }
  };
  const cypress = (x: number, z: number, h: number, sd: number) => {
    m.box(x, 1, z, x + 1, 3, z + 1, bark);
    for (let y = 2; y < h; y++) {
      const t = (y - 2) / (h - 2);
      const rr = 2.5 * Math.min(1, t * 5 + 0.35) * Math.pow(1 - t, 0.75) + 0.3;
      for (let zz = Math.floor(z - rr); zz <= z + rr + 1; zz++)
        for (let xx = Math.floor(x - rr); xx <= x + rr + 1; xx++)
          if (Math.hypot(xx - x, zz - z) < rr * (1 - 0.18 * hash(xx, y, zz, sd))) m.set(xx, y, zz, cypLeaf);
    }
  };
  pine(4, 6, 34, 3, 11, 1);
  pine(W - 12, 4, 30, -4, 10, 2);
  pine(W - 22, D - 26, 33, 4, 11, 3);
  pine(4, 108, 28, 2, 9, 4);
  pine(W - 8, 120, 31, -3, 9, 5);
  for (const [x, z, h] of [
    [W - 30, D - 6, 26],
    [W - 22, D - 5, 24],
    [W - 38, D - 7, 23],
    [64, D - 6, 22],
    [8, 32, 25],
    [W - 6, 40, 24],
  ])
    cypress(x, z, h, x);

  // ---- lamps --------------------------------------------------------------------------------
  const lamp = (x: number, z: number) => {
    m.box(x - 1, 1, z - 1, x + 2, 2, z + 2, iron);
    m.box(x, 2, z, x + 1, 14, z + 1, iron);
    m.box(x - 1, 14, z - 1, x + 2, 15, z + 2, iron);
    m.box(x - 1, 15, z - 1, x + 2, 17, z + 2, lampLit);
    m.box(x - 1, 17, z - 1, x + 2, 18, z + 2, iron);
    m.set(x, 18, z, iron);
  };
  const lampSpots: [number, number][] = [
    [cx - 20, fz + 18],
    [cx + 20, fz + 18],
    [cx + 50, fz + 14],
    [66, D - 10],
    [W - 60, D - 16],
    [10, D - 22],
  ];
  for (const [x, z] of lampSpots) lamp(Math.round(x), Math.round(z));
  // floodlights at the foot of the wall, aimed up at the arcades
  for (let b = 0; b < NB; b += 2) {
    let qs = b;
    if (qs > NB / 2) qs -= NB;
    if (ruinDepth(qs) > 0) continue;
    const ph = Math.PI / 2 + ((b + 0.5) / NB) * Math.PI * 2;
    const R = Rof(Math.cos(ph), Math.sin(ph), A, B) + 7.5;
    const x = Math.round(cx + Math.cos(ph) * R),
      z = Math.round(cz + Math.sin(ph) * R);
    m.box(x, 1, z, x + 2, 2, z + 2, iron);
    m.set(x, 2, z, E("#ffe0a8", 1.8));
  }

  // ---- people: tourists, a gladiator re-enactor ---------------------------------------------------
  const skin = [C("#e8c4a0"), C("#c89670"), C("#8a5a3c"), C("#f0d0b4")];
  const shirts = ["#d04040", "#3a6ab0", "#f0f0f0", "#3e9a5a", "#f4b728", "#7a4ab0", "#e07a30", "#2a2a34", "#e8a0c0"].map((h) => C(h));
  const legsC = [C("#2a3a5a"), C("#3a3a40"), C("#c8b898"), C("#1e2430")];
  const person = (x: number, z: number, sd: number) => {
    const h = (n: number) => hash(x, z, n, sd);
    m.box(x, 1, z, x + 1, 3, z + 1, legsC[Math.floor(h(1) * legsC.length)]);
    m.box(x, 3, z, x + 1, 5, z + 1, shirts[Math.floor(h(2) * shirts.length)]);
    m.set(x, 5, z, skin[Math.floor(h(3) * skin.length)]);
    if (h(4) < 0.3) m.set(x, 6, z, shirts[Math.floor(h(5) * shirts.length)]); // a cap
    if (h(6) < 0.25) m.set(x, 4, z + 1, C("#1a1a20")); // a camera held up
  };
  const crowd = (x0: number, z0: number, x1: number, z1: number, n: number, sd: number) => {
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + hash(i, 1, sd, 9) * (x1 - x0)),
        z = Math.round(z0 + hash(i, 2, sd, 9) * (z1 - z0));
      if (m.get(x, 1, z) || m.get(x, 3, z)) continue;
      person(x, z, sd + i);
    }
  };
  crowd(cx - 26, fz + 8, cx + 26, fz + 26, 22, 1); // before the main gate
  crowd(18, 166, 56, 176, 10, 2); // at the arch
  crowd(60, 140, 100, 172, 14, 3);
  crowd(cx + 30, fz + 20, W - 10, D - 4, 10, 4);
  // the queue at the gate, between barriers
  for (let i = 0; i < 9; i++) person(Math.round(cx - 3 + (i % 2) * 2), fz + 9 + i * 2, 50 + i);
  for (const bx of [cx - 6, cx + 4]) for (let z = fz + 8; z < fz + 28; z++) if (z % 4 === 0) m.box(Math.round(bx), 1, z, Math.round(bx) + 1, 4, z + 1, iron);
  for (const bx of [cx - 6, cx + 4]) m.box(Math.round(bx), 3, fz + 8, Math.round(bx) + 1, 4, fz + 28, C("#c03030"));
  // the gladiator: greaves, red tunic, gold cuirass and helmet with a red crest, a scutum, a cape
  {
    const gx = Math.round(cx + 14),
      gz = fz + 14;
    const red = C("#b02020"),
      au = C("#d8a838");
    m.box(gx, 1, gz, gx + 2, 3, gz + 1, au);
    m.box(gx, 3, gz, gx + 2, 4, gz + 1, red);
    m.box(gx, 4, gz, gx + 2, 6, gz + 1, au);
    m.box(gx, 6, gz, gx + 2, 7, gz + 1, skin[1]);
    m.box(gx, 7, gz, gx + 2, 8, gz + 1, au);
    m.box(gx, 8, gz - 1, gx + 2, 9, gz + 2, red);
    m.box(gx, 3, gz - 1, gx + 2, 7, gz, red); // cape
    m.box(gx + 2, 2, gz, gx + 3, 7, gz + 2, red); // scutum
    m.set(gx + 2, 4, gz + 2, au);
    m.box(gx - 1, 5, gz, gx, 6, gz + 1, skin[1]);
    m.box(gx - 1, 6, gz, gx, 10, gz + 1, C("#c8ccd4")); // gladius raised
    // two tourists posing with him
    person(gx - 3, gz + 1, 77);
    person(gx + 4, gz + 1, 78);
    person(gx + 1, gz + 7, 79);
  }
  // a souvenir cart
  {
    const sx = Math.round(cx + 34),
      sz = fz + 22;
    m.box(sx, 1, sz, sx + 8, 5, sz + 4, C("#6a4a30"));
    m.box(sx, 5, sz, sx + 8, 6, sz + 4, C("#d8d4cc"));
    for (let i = 0; i < 8; i += 2) m.set(sx + i, 6, sz + 1, shirts[i % shirts.length]);
    for (const px of [sx, sx + 7]) m.box(px, 6, sz, px + 1, 11, sz + 1, iron);
    for (let i = -1; i < 9; i++) m.box(sx + i, 11, sz - 1, sx + i + 1, 12, sz + 5, i % 2 ? C("#c03030") : C("#ece8e0"));
  }

  // ---- signs, lights, collisions, points -----------------------------------------------------
  const signs: SignSpot[] = [{ text: "COLOSSEVM", color: "#f4b728", x: cx, y: ATTIC0 + 12, z: fz + 1.2, w: 34, h: 5, vertical: false, facing: "front" }];
  const lights: Built["lights"] = [
    [cx, 14, fz + 4, "#ffc890"],
    [cx, AF + 20, cz, "#ffd8a8"],
    ...lampSpots.slice(0, 3).map(([x, z]) => [x, 16, z, "#ffd08a"] as [number, number, number, string]),
  ];
  // the outer ring as a chain of blocks, open at the four gates
  const walls: [number, number, number, number][] = [];
  for (let i = 0; i < NB * 4; i++) {
    const qq = (i + 0.5) / 4;
    const bay = Math.round(qq) % NB;
    if ((bay === 0 || bay === 11 || bay === 22 || bay === 33) && Math.abs(qq - Math.round(qq)) < 0.3) continue;
    const ph = Math.PI / 2 + (qq / NB) * Math.PI * 2;
    const R = Rof(Math.cos(ph), Math.sin(ph), A, B) - 1.5;
    const x = cx + Math.cos(ph) * R,
      z = cz + Math.sin(ph) * R;
    walls.push([Math.round(x - 2.5), Math.round(z - 2.5), Math.round(x + 2.5), Math.round(z + 2.5)]);
  }
  walls.push([14, 150, 56, 163]); // the arch's piers (its passages too: it is a monument)
  const points: Record<string, [number, number, number]> = {
    keeper: [cx, G0, fz - 5],
    camPos: [cx + 120, 105, D + 120],
    camLook: [cx, 34, cz + 6],
    arena: [cx, AF, cz],
    gate: [cx, 0, fz + 6],
  };
  return { model: m, signs, door: [Math.round(cx), Math.min(D - 2, fz + 6)], body: [0, 0, W, D], lights, walls, points, scale: k };
}
