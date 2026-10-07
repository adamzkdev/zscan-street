import type { Built } from "../buildings";
import { C, E, G, hash, VoxelModel, type Paint } from "../model";
import { P, lantern, type SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";

/**
 * BLOCK STADIUM: a modern football ground in the ZEC colours. A continuous two-tier bowl wraps a
 * striped pitch; a ring roof on radial trusses covers the stands (its inner band is an open
 * lattice so the seats read from above), floodlights line the roof's inner edge and crown four
 * corner masts, two jumbotron frames stand on the roof at the goal ends. Outside: a ribbed facade
 * with lit gold bands, spiral ramp towers at the back corners, and at the front the main gate with
 * turnstiles, ticket booths, a fan plaza with a coin statue, food carts and flags.
 *
 * Built at voxel scale 2 (1 voxel = 1/3 m). The bowl is described by `s`, the distance out from
 * the pitch rectangle (x distances shrunk by AX so the end stands run deeper): every column's
 * profile (rows, aisles, roof, facade) is a function of s, which gives rounded corners for free.
 */
export function stadium(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 96;
  const m = new VoxelModel(W, H, D);

  // ---- layout --------------------------------------------------------------------------------
  const AX = 0.8;
  const FO = 45; // facade outer face, in s
  const PLAZA = Math.max(18, Math.round(D * 0.1)); // front fan plaza depth (voxels)
  const bz0 = 6,
    bz1 = D - PLAZA;
  const cx = Math.round(W / 2),
    cz = Math.round((bz0 + bz1) / 2);
  const hz = Math.round((bz1 - bz0) / 2 - FO);
  const hx = Math.round(W / 2 - 7 - FO / AX);
  const RI = 10; // roof inner edge
  const RS = 30; // solid roof from here out
  const ROOF = 58; // roof underside
  const R0 = 40; // perimeter-coordinate radius in the corners

  const geo = (x: number, z: number) => {
    const px = x + 0.5 - cx,
      pz = z + 0.5 - cz;
    const ax = Math.abs(px) - hx,
      az = Math.abs(pz) - hz;
    const dx = Math.max(ax, 0) * AX,
      dz = Math.max(az, 0);
    const s = Math.hypot(dx, dz);
    let side: "N" | "S" | "E" | "W" | "C";
    let u: number;
    if (ax <= 0) {
      side = pz < 0 ? "N" : "S";
      u = x;
    } else if (az <= 0) {
      side = px < 0 ? "W" : "E";
      u = z;
    } else {
      side = "C";
      u = Math.atan2(dz, dx) * R0;
    }
    return { px, pz, s, side, u, inside: ax <= 0 && az <= 0 };
  };

  // ---- palette -------------------------------------------------------------------------------
  const gold = C("#f4b728"),
    goldDeep = C("#d49a16"),
    black = C("#1b1a21"),
    dark1 = C("#2a2833"),
    dark2 = C("#34323f"),
    concrete = C("#8e8a96"),
    concreteL = C("#a8a4b0"),
    concreteD = C("#5e5a68"),
    steel = C("#3a3946"),
    steelL = C("#c4c6d0"),
    roofW = C("#e2e4ea"),
    roofSeam = C("#c4c7d2"),
    rubber = C("#3a4a3e"),
    flood = E("#78c0ff", 3),
    goldLit = E("#f4b728", 1.6),
    warmLit = E("#ffb45a", 1.2);
  const grassA = C("#3f8f3e"),
    grassB = C("#4c9e47"),
    grassC = C("#37803a"),
    lineW = C("#eef0ea");
  const boards = [E("#f4b728", 1.4), E("#3ec9b0", 1.3), E("#ff4fa0", 1.3), E("#59a8ff", 1.3)];

  // ---- pitch markings ------------------------------------------------------------------------
  const L = hx - 5,
    Wd = hz - 5; // half length / half width of the lines
  const near = (v: number, t: number) => Math.abs(v - t) < 0.5;
  const isLine = (px: number, pz: number) => {
    const ax = Math.abs(px),
      az = Math.abs(pz);
    if (ax > L + 0.5 || az > Wd + 0.5) return false;
    if (near(az, Wd) || near(ax, L)) return true;
    if (near(px, -0.5)) return true;
    const r = Math.hypot(px, pz);
    if (Math.abs(r - 11) < 0.55 || r < 1.1) return true;
    const pb = Math.round(L * 0.157),
      pw = Math.round(Wd * 0.59),
      gb = Math.round(L * 0.055),
      gw = Math.round(Wd * 0.27);
    if ((near(ax, L - pb) && az <= pw) || (near(az, pw) && ax >= L - pb)) return true;
    if ((near(ax, L - gb) && az <= gw) || (near(az, gw) && ax >= L - gb)) return true;
    const spot = L - Math.round(L * 0.105);
    if (Math.hypot(ax - spot, az) < 0.8) return true;
    if (Math.abs(Math.hypot(ax - spot, az) - 11) < 0.55 && ax < L - pb) return true;
    if (Math.abs(Math.hypot(ax - L, az - Wd) - 2.5) < 0.55 && ax <= L && az <= Wd) return true;
    return false;
  };

  // ---- seat colours: the ZEC shield on the north stand, "ZEC" letters at the ends ----------------
  const FONT: Record<string, string[]> = {
    Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  };
  /** Is column c, row r (0 = top) of a word in the 5×7 font inked? Letters are 6 columns apart. */
  const textAt = (word: string, c: number, r: number) => {
    if (c < 0 || c >= word.length * 6 - 1 || r < 0 || r > 6) return false;
    const li = Math.floor(c / 6),
      lc = c % 6;
    if (lc === 5) return false;
    return FONT[word[li]][r][lc] === "1";
  };
  const seatColor = (side: string, u: number, s: number, px: number, pz: number, row: number, upper: boolean) => {
    const sector = Math.floor((u + 6) / 30);
    if (side === "N") {
      // the main stand: ZCASH across the upper tier, gold and dark sectors below
      if (upper) return textAt("ZCASH", Math.floor((px + 72) / 5), 6 - row) ? gold : black;
      return sector % 2 ? gold : dark1;
    }
    if (side === "W" || side === "E") {
      if (!upper) {
        const c = Math.floor((side === "W" ? 34 - pz : pz + 34) / 4);
        if (textAt("ZEC", c, 7 - row)) return gold;
        return black;
      }
      return Math.floor((u + 7) / 15) % 2 ? gold : black;
    }
    if (side === "S") return sector % 2 ? (upper ? gold : black) : upper ? black : gold;
    // corners: dark with a gold row now and then
    return row % 3 === 1 ? goldDeep : dark1;
  };

  // the step in front of each seat row: the same colour a shade darker, so the patterns read
  const stepOf = new Map<number, number>([
    [gold, C("#c8921a")],
    [goldDeep, C("#a87810")],
    [black, C("#111016")],
    [dark1, C("#201e28")],
    [dark2, C("#2a2834")],
  ]);
  // ---- the bowl, column by column ------------------------------------------------------------
  const aisle = (u: number, side: string) => (side === "C" ? ((u % 16) + 16) % 16 < 1.6 : ((u + 6) % 30 + 30) % 30 < 2);
  const vom = (u: number, side: string) => side !== "C" && ((u + 21) % 60 + 60) % 60 < 6 && Math.abs(u - (side === "N" || side === "S" ? cx : cz)) > 12;
  const ribAt = (u: number, side: string) => (side === "C" ? ((u % 9) + 9) % 9 < 1.3 : ((u % 10) + 10) % 10 < 1);

  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const g = geo(x, z);
      const { s, side, u, px, pz } = g;
      if (g.inside || s < 1.2) {
        // grass: mowing stripes, darker run-off, white lines
        const inLines = Math.abs(px) <= L + 0.5 && Math.abs(pz) <= Wd + 0.5;
        const stripe = Math.floor((px + L) / 10) % 2 ? grassA : grassB;
        m.set(x, 0, z, isLine(px, pz) ? lineW : inLines ? stripe : grassC);
        continue;
      }
      if (s >= FO + 1.2) continue;
      let h = 0;
      let top: Paint = concrete;
      const corner = side === "C";
      if (s < 2.4) {
        // LED advertising boards round the pitch
        m.box(x, 0, z, x + 1, 1, z + 1, rubber);
        m.box(x, 1, z, x + 1, 4, z + 1, boards[Math.floor((((u % 64) + 64) % 64) / 16)]);
        m.set(x, 4, z, black);
        continue;
      } else if (s < 4) {
        h = 2;
        top = rubber;
      } else if (s < 22) {
        // lower tier: rows two deep, one high
        const i = Math.floor((s - 4) / 2),
          off = s - 4 - 2 * i;
        if (aisle(u, side)) {
          h = 4 + i + (off >= 1 ? 1 : 0);
          top = concreteL;
        } else if (off < 1) {
          h = 4 + i;
          top = stepOf.get(seatColor(side, u, s + 1, px, pz, i, false)) ?? concrete;
        } else {
          h = 5 + i;
          top = seatColor(side, u, s, px, pz, i, false);
        }
        if (vom(u, side) && s >= 14) {
          h = 9;
          top = C("#2a2830");
        }
      } else if (s < 25) {
        h = 13;
        top = concreteD;
      } else if (s < 26) {
        // VIP boxes under the upper tier
        h = corner ? 24 : 25;
        top = concrete;
        m.box(x, 0, z, x + 1, h, z + 1, concreteD);
        const lit = ((u % 8) + 8) % 8 < 6;
        m.box(x, 14, z, x + 1, 21, z + 1, lit ? (hash(Math.floor(u / 8), 1, 3, seed) > 0.3 ? warmLit : G("#2a3448")) : steel);
        m.set(x, 21, z, steel);
        m.set(x, h - 1, z, top);
        continue;
      } else if (s < 40) {
        if (corner) {
          // fan concourse terraces in the corners, over the lower bowl
          h = 24;
          top = ((Math.floor(u / 3) + Math.floor(s / 3)) % 2) ? C("#6a5a4c") : C("#5e5044");
        } else {
          const j = Math.floor((s - 26) / 2),
            off = s - 26 - 2 * j;
          if (aisle(u, side)) {
            h = 25 + 2 * j + (off >= 1 ? 1 : 0);
            top = concreteL;
          } else if (off < 1) {
            h = 25 + 2 * j;
            top = stepOf.get(seatColor(side, u, s + 1, px, pz, j, true)) ?? concrete;
          } else {
            h = 26 + 2 * j;
            top = seatColor(side, u, s, px, pz, j, true);
          }
        }
      } else if (s < FO - 1.5) {
        h = 42;
        top = concreteD;
      }
      if (h > 0) {
        m.box(x, 0, z, x + 1, h - 1, z + 1, concreteD);
        m.set(x, h - 1, z, top);
      }
      // upper tier front: overhanging slab with a ribbon board
      if (!corner && s >= 20 && s < 25) {
        m.box(x, 21, z, x + 1, 25, z + 1, steel);
        if (s < 21) {
          m.box(x, 22, z, x + 1, 24, z + 1, ((u % 48) + 48) % 48 < 24 ? goldLit : E("#3ec9b0", 1.2));
          m.set(x, 25, z, G("#9ab0c8"));
        }
      }
      if (corner && s >= 26 && s < 27) m.set(x, 24, z, G("#9ab0c8"));
      // back wall railing
      if (s >= 40 && s < 41) m.set(x, 42, z, steelL);
      // facade shell: plinth, glass between ribs, lit gold bands, cornice
      if (s >= FO - 1.5 && s < FO) {
        for (let y = 0; y < ROOF; y++) {
          let c: number;
          if (y < 5) c = C("#3a3640");
          else if (y === 16 || y === 30 || y === 44) c = goldLit;
          else if (y >= ROOF - 3) c = y === ROOF - 2 ? goldLit : steel;
          else if (ribAt(u, side)) c = steelL;
          else c = (y - 5) % 7 === 6 ? steel : y < 16 ? (hash(Math.floor(u / 10), y >> 2, 5, seed) > 0.55 ? warmLit : G("#2a3448")) : G("#2e3a50");
          m.set(x, y, z, c);
        }
        // ground-floor gates every few bays, lit concourse behind
        if (((u + 20) % 70 + 70) % 70 < 9 && side !== "S") m.box(x, 0, z, x + 1, 12, z + 1, ((u + 20) % 70 + 70) % 70 < 1 || ((u + 20) % 70 + 70) % 70 >= 8 ? steel : 0);
      }
      if (s >= FO && s < FO + 1.2 && ribAt(u, side)) m.box(x, 5, z, x + 1, ROOF - 3, z + 1, steelL);
      // roof
      if (s >= RI && s < FO + 1.2) {
        if (s < RI + 2) {
          // inner ring girder, floodlights on its face
          m.box(x, ROOF - 3, z, x + 1, ROOF + 2, z + 1, steel);
          if (s < RI + 1) for (let y = ROOF - 3; y < ROOF + 1; y++) if (((Math.floor(u) % 3) + 3) % 3 !== 0 && y !== ROOF - 1) m.set(x, y, z, flood);
        } else if (s < RS) {
          const beam = corner ? ((u % 15.7) + 15.7) % 15.7 < 1.3 : ((u % 12) + 12) % 12 < 1.4;
          const ring = Math.abs(s - 20) < 0.6;
          if (beam || ring) m.box(x, ROOF, z, x + 1, ROOF + 2, z + 1, beam ? steel : steelL);
          else if (Math.abs(s - 15) < 0.6 || Math.abs(s - 25) < 0.6) m.set(x, ROOF + 1, z, steelL);
        } else {
          m.box(x, ROOF, z, x + 1, ROOF + 2, z + 1, steel);
          const seam = ((u % 12) + 12) % 12 < 1 || Math.abs(s - 37) < 0.6;
          m.set(x, ROOF + 1, z, seam ? roofSeam : roofW);
          if (s >= FO) m.box(x, ROOF + 1, z, x + 1, ROOF + 3, z + 1, steel);
          if (s >= FO + 0.6) m.set(x, ROOF + 1, z, goldLit);
          if (Math.abs(s - 33) < 0.6) m.set(x, ROOF + 2, z, steelL); // maintenance catwalk rail
        }
        // primary trusses: a cantilevered top chord over the roof
        if (corner ? Math.abs(u - R0 * Math.PI / 4) < 0.9 : ((u % 36) + 36) % 36 < 1.6) {
          const t = (s - RI) / (FO + 1 - RI);
          const yt = ROOF + 2 + Math.round(10 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
          m.box(x, yt, z, x + 1, yt + 2, z + 1, steelL);
          if (Math.floor(s) % 4 === 0) m.box(x, ROOF + 2, z, x + 1, yt, z + 1, steelL);
        }
      }
    }

  // ---- pitch furniture: goals, dugouts, tunnel ------------------------------------------------
  const white = C("#f4f4f0"),
    net = C("#d8dce0");
  for (const sgn of [-1, 1]) {
    const gx = cx + sgn * L;
    const xa = sgn < 0 ? gx - 5 : gx,
      xb = sgn < 0 ? gx : gx + 5;
    for (const zz of [cz - 6, cz + 5]) m.box(gx - (sgn < 0 ? 1 : 0), 1, zz, gx + (sgn < 0 ? 0 : 1), 8, zz + 1, white);
    m.box(sgn < 0 ? gx - 1 : gx, 7, cz - 6, sgn < 0 ? gx : gx + 1, 8, cz + 6, white);
    // net: back, sides, roof, a loose lattice
    const back = sgn < 0 ? xa : xb - 1;
    for (let y = 1; y < 8; y++)
      for (let zz = cz - 6; zz < cz + 6; zz++) if ((y + zz) % 2 === 0) m.set(back, y, zz, net);
    for (let xx = xa; xx < xb; xx++) {
      for (let y = 1; y < 8; y++) if ((xx + y) % 2 === 0) m.set(xx, y, cz - 6, net), m.set(xx, y, cz + 5, net);
      for (let zz = cz - 6; zz < cz + 6; zz++) if ((xx + zz) % 2 === 0) m.set(xx, 7, zz, net);
    }
    // corner flags
    for (const zs of [-1, 1]) {
      const fx = cx + sgn * L,
        fz = cz + zs * Wd;
      m.box(fx, 1, fz, fx + 1, 6, fz + 1, white);
      m.box(fx, 5, fz, fx + 1, 6, fz + 2, gold);
    }
  }
  // the north side is the main stand: tunnel and dugouts
  const nz = cz - hz; // stand front line (z) on the north side
  for (const sgn of [-1, 1]) {
    const x0 = sgn < 0 ? cx - 26 : cx + 8,
      x1 = sgn < 0 ? cx - 8 : cx + 26;
    // dug into the first rows, a curved perspex roof, bench seats
    m.clear(x0, 1, nz - 9, x1, 9, nz - 1);
    m.box(x0, 0, nz - 9, x1, 1, nz - 1, rubber);
    m.box(x0, 1, nz - 9, x1, 4, nz - 7, concreteD);
    for (let x = x0 + 1; x < x1 - 1; x++) m.set(x, 2, nz - 6, x % 3 ? C("#d8d4cc") : black);
    m.box(x0, 1, nz - 9, x0 + 1, 8, nz - 1, steel);
    m.box(x1 - 1, 1, nz - 9, x1, 8, nz - 1, steel);
    for (let dz = 0; dz < 8; dz++) m.box(x0, 7 + (dz < 3 ? 1 : 0), nz - 9 + dz, x1, 8 + (dz < 3 ? 1 : 0), nz - 8 + dz, G("#8aa6c0"));
    m.box(x0, 8, nz - 10, x1, 9, nz - 9, gold);
    // the technical area box
    m.box(x0 + 2, 0, nz - 1, x1 - 2, 1, nz + 2, lineW);
  }
  // players' tunnel: a gold and black extendable tube out of the stand
  m.clear(cx - 4, 1, nz - 20, cx + 4, 9, nz - 1);
  m.box(cx - 4, 0, nz - 20, cx + 4, 1, nz + 4, rubber);
  m.box(cx - 4, 1, nz - 20, cx + 4, 9, nz - 19, E("#ffd08a", 1.1));
  for (let zz = nz - 8; zz < nz + 4; zz++) {
    const c = Math.floor(zz / 2) % 2 ? gold : black;
    m.box(cx - 5, 1, zz, cx - 4, 7, zz + 1, c);
    m.box(cx + 4, 1, zz, cx + 5, 7, zz + 1, c);
    m.box(cx - 4, 7, zz, cx + 4, 8, zz + 1, c);
    m.box(cx - 3, 8, zz, cx + 3, 9, zz + 1, c);
  }
  m.box(cx - 5, 1, nz - 9, cx + 5, 10, nz - 8, steel);

  // ---- corner fan concourses: kiosks and standing tables on the terraces ----------------------
  const kioskCols = ["#c0302a", "#2f6aa8", "#3a8a4a", "#a8509a"];
  let kc = 0;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const ccx = cx + sx * hx,
      ccz = cz + sz * hz;
    const at = (sv: number, ang: number) => [Math.round(ccx + (sx * sv * Math.cos(ang)) / AX), Math.round(ccz + sz * sv * Math.sin(ang))];
    for (const ang of [0.42, 0.78, 1.15]) {
      const [kx, kz] = at(36, ang);
      const col = C(kioskCols[kc++ % kioskCols.length]);
      m.box(kx - 3, 24, kz - 3, kx + 3, 31, kz + 3, C("#d8d4cc"));
      m.box(kx - 3, 25, kz - 3, kx + 3, 29, kz + 3, warmLit);
      m.box(kx - 2, 25, kz - 2, kx + 2, 29, kz + 2, C("#4a3a30"));
      m.box(kx - 4, 31, kz - 4, kx + 4, 33, kz + 4, col);
      m.box(kx - 4, 30, kz - 4, kx + 4, 31, kz + 4, goldLit);
      const [tx, tz] = at(31, ang + 0.18);
      m.box(tx, 24, tz, tx + 1, 28, tz + 1, steel);
      m.box(tx - 1, 28, tz - 1, tx + 2, 29, tz + 2, C("#d8d4cc"));
    }
    // string of bulbs across the terrace
    for (let a = 0.2; a < 1.4; a += 0.06) {
      const [lx, lz] = at(30 + 4 * Math.sin(a * 6), a);
      m.set(lx, 37, lz, E("#ffd08a", 1.6));
    }
  }

  // ---- jumbotrons on the roof at the goal ends --------------------------------------------------
  const SW = 48,
    SH = 22,
    SY0 = ROOF + 4;
  const screens: Record<string, [number, number, number]> = {};
  for (const sgn of [-1, 1]) {
    const fx = Math.round(cx + sgn * (hx + (RI + 1) / AX)); // screen cells column
    const bx = fx + sgn; // frame behind, away from the pitch
    const z0 = cz - SW / 2,
      z1 = cz + SW / 2;
    // dark screen face and its frame
    m.box(fx, SY0, z0, fx + 1, SY0 + SH, z1, C("#0b0b10"));
    m.box(fx, SY0 - 2, z0 - 2, fx + 1, SY0, z1 + 2, black);
    m.box(fx, SY0 + SH, z0 - 2, fx + 1, SY0 + SH + 3, z1 + 2, black);
    m.box(fx, SY0, z0 - 2, fx + 1, SY0 + SH, z0, black);
    m.box(fx, SY0, z1, fx + 1, SY0 + SH, z1 + 2, black);
    m.box(fx, SY0 + SH + 1, z0 + 4, fx + 1, SY0 + SH + 2, z1 - 4, goldLit);
    // back truss and legs to the roof
    m.box(bx, SY0 - 2, z0 - 2, bx + 1, SY0 + SH + 3, z1 + 2, steel);
    for (let zz = z0 - 2; zz < z1 + 2; zz += 6) {
      m.box(bx + sgn * 4, ROOF + 2, zz, bx + sgn * 4 + 1, SY0 + SH + 3, zz + 1, steelL);
      for (let y = ROOF + 2; y < SY0 + SH + 3; y += 5) m.box(Math.min(bx, bx + sgn * 4), y, zz, Math.max(bx, bx + sgn * 4) + 1, y + 1, zz + 1, steelL);
    }
    for (let zz = z0; zz < z1; zz += 8) m.box(fx, ROOF + 2, zz, fx + 1, SY0 - 2, zz + 2, steel);
    // screen centre: the face is the plane on the pitch side of the screen cells
    screens[sgn < 0 ? "screenA" : "screenB"] = [sgn < 0 ? fx + 1 : fx, SY0 + SH / 2, cz];
  }

  // ---- floodlight masts ------------------------------------------------------------------------
  const mastTop = 86;
  const mast = (mx: number, mz: number, y0: number, fx: number, fzs: number) => {
    // lattice pylon 4×4, braced
    for (let y = y0; y < mastTop; y++) {
      for (const [dx, dz] of [
        [0, 0],
        [3, 0],
        [0, 3],
        [3, 3],
      ])
        m.set(mx + dx, y, mz + dz, steelL);
      if ((y - y0) % 6 === 0) m.box(mx, y, mz, mx + 4, y + 1, mz + 4, steelL);
      const ph = (y - y0) % 6;
      m.set(mx + ph * 0.6, y, mz, steel);
      m.set(mx + 3 - ph * 0.6, y, mz + 3, steel);
      m.set(mx, y, mz + ph * 0.6, steel);
      m.set(mx + 3, y, mz + 3 - ph * 0.6, steel);
    }
    // head: a lamp bank facing the pitch on two faces
    const hx0 = mx - 5,
      hz0 = mz - 5;
    m.box(hx0, mastTop, hz0, hx0 + 14, mastTop + 8, hz0 + 14, steel);
    for (let y = mastTop + 1; y < mastTop + 7; y += 2)
      for (let t = 1; t < 13; t += 2) {
        m.set(fx > 0 ? hx0 + 14 : hx0 - 1, y, hz0 + t, flood);
        m.set(hx0 + t, y, fzs > 0 ? hz0 + 14 : hz0 - 1, flood);
      }
    m.box(hx0 - 1, mastTop + 8, hz0 - 1, hx0 + 15, mastTop + 9, hz0 + 15, black);
    m.set(mx + 1, mastTop + 9, mz + 1, E("#ff3048", 2.5));
  };

  // back corners: spiral ramp towers carrying the masts
  const ramp = (tx: number, tz: number, sx: number, sz: number) => {
    const R = 10,
      pitch = 28;
    m.cylinder(tx, 0, tz, 4.5, ROOF + 2, concreteD);
    for (let z = tz - R - 1; z <= tz + R + 1; z++)
      for (let x = tx - R - 1; x <= tx + R + 1; x++) {
        const rr = Math.hypot(x + 0.5 - tx, z + 0.5 - tz);
        if (rr < 4.5 || rr > R) continue;
        const a = (Math.atan2(z + 0.5 - tz, x + 0.5 - tx) + Math.PI) / (Math.PI * 2);
        for (let n = 0; n * pitch < ROOF; n++) {
          const y = Math.round((a + n) * pitch);
          if (y >= ROOF) continue;
          m.set(x, y, z, rr > R - 1 ? concreteL : concrete);
          if (rr > R - 1) m.set(x, y + 1, z, rr > R - 0.6 && (x + z) % 3 === 0 ? goldLit : concreteL);
        }
      }
    m.cylinder(tx, ROOF, tz, R + 0.5, 2, steel);
    mast(Math.round(tx) - 2, Math.round(tz) - 2, ROOF + 2, sx, sz);
  };
  const diag = (sx: number, sz: number, sv: number) => [cx + (sx * (hx + sv / Math.SQRT2 / AX)), cz + sz * (hz + sv / Math.SQRT2)];
  {
    const [ax, az] = diag(-1, -1, 54);
    ramp(Math.round(ax), Math.round(az), 1, 1);
    const [bx, bz] = diag(1, -1, 54);
    ramp(Math.round(bx), Math.round(bz), -1, 1);
  }
  // front corners: masts on plinths in the plaza
  const frontMasts: [number, number][] = [];
  for (const sx of [-1, 1]) {
    const [fx, fz] = diag(sx, 1, 53).map(Math.round);
    m.box(fx - 4, 0, fz - 4, fx + 8, 3, fz + 8, C("#4a4656"));
    m.box(fx - 3, 3, fz - 3, fx + 7, 4, fz + 7, concrete);
    mast(fx, fz, 4, -sx, -1);
    frontMasts.push([fx, fz]);
  }

  // ---- the front: main gate, turnstiles, ticket booths -----------------------------------------
  const fzF = cz + hz + FO; // front facade plane (first empty layer)
  const gx0 = cx - 26,
    gx1 = cx + 26;
  m.clear(gx0, 0, fzF - 6, gx1, 18, fzF + 2);
  m.box(gx0, 0, fzF - 7, gx1, 18, fzF - 6, G("#2a3448"));
  for (let x = gx0; x < gx1; x += 6) m.box(x, 0, fzF - 7, x + 1, 18, fzF - 5, steel);
  for (let x = gx0 + 2; x < gx1 - 3; x += 12) m.box(x, 0, fzF - 7, x + 6, 11, fzF - 6, warmLit);
  m.box(gx0, 17, fzF - 6, gx1, 18, fzF, C("#2a2833"));
  for (let x = gx0 + 3; x < gx1; x += 8) m.box(x, 17, fzF - 5, x + 3, 18, fzF - 1, E("#fff0d0", 1.2));
  m.box(gx0 - 2, 0, fzF - 6, gx0, 20, fzF + 1, C("#3a3640"));
  m.box(gx1, 0, fzF - 6, gx1 + 2, 20, fzF + 1, C("#3a3640"));
  // name panel over the gate
  m.box(cx - 70, 19, fzF - 1, cx + 70, 34, fzF + 1, black);
  m.box(cx - 70, 19, fzF + 1, cx + 70, 20, fzF + 2, goldLit);
  m.box(cx - 70, 33, fzF + 1, cx + 70, 34, fzF + 2, goldLit);
  // ZEC roundel either side of the name
  for (const sx of [-1, 1]) {
    const rx = cx + sx * 80;
    for (let y = 18; y < 36; y++)
      for (let x = rx - 9; x < rx + 9; x++) {
        const r = Math.hypot(x + 0.5 - rx, y + 0.5 - 27);
        if (r > 8.6) continue;
        const X = (x + 0.5 - rx) / 5,
          Y = (y + 0.5 - 27) / 5;
        const isZ = Math.abs(X) <= 1 && Math.abs(Y) <= 1 && (Y > 0.6 || Y < -0.6 || Math.abs(X - Y) < 0.42);
        const bar = Math.abs(X) < 0.22 && Math.abs(Y) > 1 && Math.abs(Y) < 1.45;
        m.set(x, y, fzF, r > 7.6 ? goldLit : isZ || bar ? black : gold);
        m.set(x, y, fzF - 1, black);
      }
  }
  // turnstiles in a line across the gate, an arch of gate frames
  const tz = fzF + 6;
  for (let x = gx0 + 1; x < gx1 - 1; x += 5) {
    m.box(x, 0, tz, x + 2, 4, tz + 3, steelL);
    m.set(x, 4, tz + 1, (x / 5) % 3 === 0 ? E("#ff3048", 1.6) : E("#30ff7a", 1.6));
    m.box(x + 2, 3, tz + 1, x + 4, 4, tz + 2, C("#9a9aa4"));
  }
  m.box(gx0 - 6, 0, tz, gx0 + 1, 2, tz + 3, steel);
  m.box(gx1 - 1, 0, tz, gx1 + 6, 2, tz + 3, steel);
  for (const x of [gx0 - 1, gx1]) m.box(x, 0, tz + 1, x + 1, 16, tz + 2, black);
  m.box(gx0 - 1, 14, tz + 1, gx1 + 1, 16, tz + 2, black);
  m.box(gx0 + 4, 14, tz + 2, gx1 - 4, 16, tz + 3, goldLit);
  // ticket booths
  const booth = (bx: number) => {
    m.box(bx, 0, tz - 2, bx + 12, 11, tz + 6, C("#d8d4cc"));
    m.box(bx - 1, 11, tz - 3, bx + 13, 13, tz + 8, black);
    m.box(bx - 1, 12, tz + 8, bx + 13, 13, tz + 9, goldLit);
    for (let x = bx + 1; x < bx + 11; x += 4) {
      m.box(x, 4, tz + 6, x + 3, 9, tz + 7, warmLit);
      m.box(x, 3, tz + 6, x + 3, 4, tz + 8, steel);
    }
    m.box(bx, 9, tz + 6, bx + 12, 11, tz + 7, gold);
  };
  booth(gx0 - 22);
  booth(gx1 + 10);
  // queue barriers in front of the turnstiles
  for (let x = gx0; x < gx1; x += 10) {
    m.box(x, 0, tz + 5, x + 1, 3, tz + 12, steelL);
    m.box(x, 2, tz + 5, x + 1, 3, tz + 12, steelL);
  }

  // ---- fan plaza --------------------------------------------------------------------------------
  // paving: a raised promenade along the front, light slabs banded in grey, a gold kerb line
  const pave = C("#b8b4c0"),
    paveB = C("#9a96a6");
  for (let z = 1; z < D - 1; z++)
    for (let x = 1; x < W - 1; x++) {
      if (m.get(x, 0, z)) continue;
      const g = geo(x, z);
      if (g.s < FO + 0.5) continue;
      if (z < fzF - 20 && g.s > FO + 6) continue; // only a ring of paving round the back
      m.set(x, 0, z, z >= fzF && x % 24 < 2 ? paveB : pave);
    }
  m.box(1, 0, D - 2, W - 1, 1, D - 1, goldDeep);
  // the coin statue on the left: a giant ZEC piece on edge on a stone plinth
  const sx0 = 40,
    sz0 = Math.min(D - 16, fzF + 6);
  m.box(sx0 - 9, 0, sz0 - 5, sx0 + 9, 3, sz0 + 5, C("#6a6474"));
  m.box(sx0 - 7, 3, sz0 - 3, sx0 + 7, 9, sz0 + 3, C("#8a8494"));
  m.box(sx0 - 4, 5, sz0 + 3, sx0 + 4, 7, sz0 + 4, goldDeep);
  for (let y = 9; y < 34; y++)
    for (let x = sx0 - 13; x < sx0 + 13; x++) {
      const r = Math.hypot(x + 0.5 - sx0, y + 0.5 - 21.5);
      if (r > 12) continue;
      const X = (x + 0.5 - sx0) / 6.5,
        Y = (y + 0.5 - 21.5) / 6.5;
      const isZ = Math.abs(X) <= 1 && Math.abs(Y) <= 1 && (Y > 0.62 || Y < -0.62 || Math.abs(X - Y) < 0.4);
      const bar = Math.abs(X) < 0.2 && Math.abs(Y) > 1 && Math.abs(Y) < 1.4;
      const rim = r > 10.6;
      m.box(x, y, sz0 - 1, x + 1, y + 1, sz0 + 1, rim ? goldDeep : gold);
      if (isZ || bar) {
        m.set(x, y, sz0 + 1, goldDeep);
        m.set(x, y, sz0 - 2, goldDeep);
      }
    }
  // a football resting at the coin's foot
  m.blob(sx0 + 11, 12, sz0, 3, (x, y, z) => ((x + y + z) % 3 ? white : black), 0, 1);
  // food carts and umbrella tables on the right
  const cart = (x: number, z: number, cloth: string) => {
    m.box(x, 1, z, x + 10, 6, z + 5, C("#d8d4cc"));
    m.box(x, 4, z + 5, x + 10, 5, z + 6, C("#7a5a3a"));
    m.box(x + 1, 6, z + 1, x + 4, 8, z + 3, C("#9a9aa4"));
    m.set(x + 2, 8, z + 2, E("#ff7a2a", 1.8));
    m.box(x - 1, 0, z, x + 2, 2, z + 1, black);
    m.box(x + 8, 0, z, x + 11, 2, z + 1, black);
    for (const px of [x, x + 9]) m.box(px, 6, z, px + 1, 13, z + 1, steel);
    for (let dz = -1; dz < 7; dz++) m.box(x - 1, 13, z + dz, x + 11, 14, z + dz + 1, (Math.floor((x + dz) / 2) % 2) ? C(cloth) : C("#ece8e0"));
    m.box(x - 1, 12, z + 6, x + 11, 13, z + 7, C(cloth));
    lantern(m, x + 4, 7, z + 5);
  };
  const cxr = W - 46;
  cart(cxr - 14, sz0 - 6, "#c0302a");
  cart(cxr + 6, sz0 - 2, "#2f6aa8");
  for (const [ux, uz, col] of [
    [cxr - 6, sz0 + 6, "#f4b728"],
    [cxr + 14, sz0 + 8, "#c0302a"],
  ] as [number, number, string][]) {
    m.box(ux, 0, uz, ux + 1, 10, uz + 1, steel);
    m.cylinder(ux + 0.5, 10, uz + 0.5, 6, 1, (x, _y, z) => (Math.floor(Math.atan2(z - uz, x - ux) * 2.5) % 2 ? C(col) : C("#ece8e0")));
    m.cylinder(ux + 0.5, 3, uz + 0.5, 3, 1, C("#d8d4cc"));
    for (const [dx, dz] of [
      [-4, 0],
      [4, 0],
      [0, -4],
      [0, 4],
    ])
      m.box(ux + dx, 0, uz + dz, ux + dx + 1, 2, uz + dz + 1, black);
  }
  // flags along the plaza edge, alternating gold and black, and lamp posts between
  for (let x = 14; x < W - 14; x += 18) {
    if (x > gx0 - 26 && x < gx1 + 26) continue;
    const fz = D - 6;
    m.box(x, 0, fz, x + 1, 22, fz + 1, steelL);
    m.set(x, 22, fz, gold);
    const fl = Math.floor(x / 18) % 2 ? gold : black;
    for (let dx = 1; dx < 9; dx++) {
      const sag = Math.round(Math.sin(dx * 0.7 + x) * 0.6);
      m.box(x + dx, 15 + sag, fz, x + dx + 1, 21 + sag, fz + 1, fl);
    }
    if (fl === black) m.box(x + 3, 17, fz, x + 6, 19, fz + 1, gold);
  }
  const lamp = (x: number, z: number) => {
    m.box(x, 0, z, x + 1, 13, z + 1, black);
    m.box(x - 1, 13, z - 1, x + 2, 14, z + 2, black);
    m.box(x - 1, 12, z - 1, x + 2, 13, z + 2, E("#ffd08a", 1.5));
  };
  for (const x of [gx0 - 30, gx1 + 30, 70, W - 70]) lamp(x, D - 10);
  // planters with small trees at the corners of the gate
  for (const x of [gx0 - 34, gx1 + 26]) {
    m.box(x, 0, D - 14, x + 8, 3, D - 8, C("#6a6474"));
    m.box(x + 1, 3, D - 13, x + 7, 4, D - 9, P.soil);
    m.box(x + 3, 4, D - 12, x + 5, 9, D - 10, P.trunk);
    m.blob(x + 4, 12, D - 11, 4.5, P.leaf, 0.3, x);
  }
  // bike racks along the side
  for (let z = fzF - 10; z < fzF + 4; z += 3) for (const x of [8, W - 9]) m.box(x, 0, z, x + 1, 3, z + 1, steelL);

  // ---- signs, lights, collision, points --------------------------------------------------------
  const signs: SignSpot[] = [
    { text: "BLOCK STADIUM · ブロック競技場", color: "#f4b728", x: cx, y: 26.5, z: fzF + 1.1, w: 132, h: 10, vertical: false, facing: "front" },
    { text: "GATE A", color: "#3ec9b0", x: cx, y: 15, z: tz + 3.1, w: 22, h: 2.4, vertical: false, facing: "front" },
    { text: "TICKETS", color: "#ff4fa0", x: gx0 - 16, y: 10, z: tz + 7.1, w: 11, h: 1.8, vertical: false, facing: "front" },
    { text: "TICKETS", color: "#ff4fa0", x: gx1 + 16, y: 10, z: tz + 7.1, w: 11, h: 1.8, vertical: false, facing: "front" },
  ];
  const lights: Built["lights"] = [
    // floodlit pitch: four lamps over the quarters
    [cx - L / 2, 30, cz - hz / 2, "#dceeff"],
    [cx + L / 2, 30, cz - hz / 2, "#dceeff"],
    [cx - L / 2, 30, cz + hz / 2, "#dceeff"],
    [cx + L / 2, 30, cz + hz / 2, "#dceeff"],
    [cx, 12, fzF + 4, "#ffc890"],
    [cxr, 10, sz0, "#ffb060"],
  ];
  const ex = hx + FO / AX,
    ez = hz + FO;
  const walls: [number, number, number, number][] = [
    [Math.round(cx - ex), cz - hz, Math.round(cx + ex), cz + hz],
    [cx - hx, cz - ez, cx + hx, Math.min(cz + ez, fzF)],
    [Math.round(cx - hx - 0.72 * ex + 0.72 * hx), Math.round(cz - hz - 0.72 * FO), Math.round(cx + hx + 0.72 * (ex - hx)), Math.round(cz + hz + 0.72 * FO)],
    [gx0 - 22, tz - 2, gx0 - 10, tz + 6],
    [gx1 + 10, tz - 2, gx1 + 22, tz + 6],
    [sx0 - 9, sz0 - 5, sx0 + 9, sz0 + 5],
    ...frontMasts.map(([x, z]) => [x - 4, z - 4, x + 8, z + 8] as [number, number, number, number]),
  ];

  // crowd tiers: lower tier row i has its seat at s = 5.5 + 2i (seat top y = 5 + i); upper tier
  // row j at s = 27.5 + 2j (seat top y = 26 + 2j). Straight sections only (corners excluded).
  const points: Record<string, [number, number, number]> = { ...screens, screenSize: [SW, SH, 0] };
  const tiers = [
    { s0: 5.5, y0: 5, dy: 1, n: 9 },
    { s0: 27.5, y0: 26, dy: 2, n: 7 },
  ];
  tiers.forEach((t, ti) => {
    // north: z = cz - hz - s, along x; south: z = cz + hz + s
    points[`tierN${ti}a`] = [cx - hx, t.y0, cz - hz - t.s0];
    points[`tierN${ti}b`] = [cx + hx, t.y0, cz - hz - t.s0];
    points[`rowStepN${ti}`] = [-2, t.dy, 0];
    points[`tierS${ti}a`] = [cx - hx, t.y0, cz + hz + t.s0];
    points[`tierS${ti}b`] = [cx + hx, t.y0, cz + hz + t.s0];
    points[`rowStepS${ti}`] = [2, t.dy, 0];
    points[`tierW${ti}a`] = [cx - hx - t.s0 / AX, t.y0, cz - hz];
    points[`tierW${ti}b`] = [cx - hx - t.s0 / AX, t.y0, cz + hz];
    points[`rowStepW${ti}`] = [-2 / AX, t.dy, 0];
    points[`tierE${ti}a`] = [cx + hx + t.s0 / AX, t.y0, cz - hz];
    points[`tierE${ti}b`] = [cx + hx + t.s0 / AX, t.y0, cz + hz];
    points[`rowStepE${ti}`] = [2 / AX, t.dy, 0];
    for (const sd of ["N", "S", "E", "W"]) points[`rows${sd}${ti}`] = [t.n, 0, 0];
  });
  Object.assign(points, {
    pitchMin: [cx - hx, 1, cz - hz],
    pitchMax: [cx + hx, 1, cz + hz],
    linesMin: [cx - L, 1, cz - Wd],
    linesMax: [cx + L, 1, cz + Wd],
    kickoff: [cx, 1, cz],
    goalW: [cx - L, 1, cz],
    goalE: [cx + L, 1, cz],
    tunnel: [cx, 1, nz + 3],
    dugoutW: [cx - 17, 1, nz - 4],
    dugoutE: [cx + 17, 1, nz - 4],
    gate: [cx, 0, tz + 8],
    statue: [sx0, 0, sz0 + 7],
    carts: [cxr, 0, sz0 + 2],
  });

  return { model: m, signs, door: [cx, Math.min(D - 2, tz + 10)], body: [0, 0, W, D], lights, walls, points, scale: k };
}
