import type { Built } from "../buildings";
import { C, E, hash, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { glyphs, SNARK1, SNARK1_PALETTE, textWidth } from "./statue-art";

/**
 * The zkSNARK Statue on Liberty island: zkSNARKs #1, the collection's original, cast in bronze as
 * a giant in the pose of the Statue of Liberty: the pixel portrait becomes a hooded head (the void
 * for a face, two Volt-green eyes that glow at night, the cloak dissolving into loose pixels on its
 * left), a seven-ray crown, a draped robe, a raised arm holding the gold ⓩ torch and a gold tablet
 * engraved ZIP 32. It stands on a granite pedestal on an eleven-point star fort.
 *
 * Points (model voxels, scale 1): `torch` the flame's centre, `crown` the top of the hood.
 */

/** Verdigris bronze instead of the character's own colours. */
const PATINA = true;

const TONES: Record<string, [string, string]> = PATINA
  ? { a: ["#3f7a68", "#397061"], b: ["#a6dbc4", "#9cd2bb"], c: ["#24433c", "#203c36"], d: ["#5fa08a", "#589883"], e: ["#0c1412", "#0c1412"] }
  : { a: ["#9b526b", "#934c65"], b: ["#e8bcc7", "#e0b2be"], c: ["#392c35", "#342830"], d: ["#ca8197", "#c27990"], e: ["#140f13", "#140f13"] };

const paintAt = (p: Paint, x: number, y: number, z: number) => (typeof p === "number" ? p : p(x, y, z));

export function statue(seed: number, o: LandmarkOpts): Built {
  const k = 1;
  const { W, D } = lotSize(o, k);
  const H = 294;
  const m = new VoxelModel(W, H, D);
  const cx = W / 2,
    cz = D / 2;
  const tone = (ch: string): Paint => (ch === "f" ? E(SNARK1_PALETTE.f, 1.25) : shades(TONES[ch], 1, seed + ch.charCodeAt(0)));
  const gold = shades(["#e0a92e", "#d59d27", "#eab53a"], 1, seed + 1);
  const goldDark = C("#9a6a12");
  const fortStone = (x: number, y: number, z: number) => {
    // coursed granite: mortar every 4 rows, staggered joints
    if (y % 4 === 3) return C("#5e5b57");
    if ((x + z + ((y >> 2) & 1) * 5) % 10 === 0) return C("#66625e");
    return [C("#8a8680"), C("#827e79"), C("#918d86")][Math.floor(hash(x >> 1, y >> 2, z >> 1, seed) * 3)];
  };
  const granite = shades(["#a89f90", "#a0978a", "#b0a797"], 1, seed + 2);
  const trim = C("#c8bfae");
  const recess = C("#2b2622");

  // ---- the eleven-point star fort ------------------------------------------------------------
  const N = 11,
    RO = 53,
    RI = 37;
  // vertices: an inner corner faces the front, so the gate sits in a re-entrant angle
  const verts: [number, number][] = [];
  for (let i = 0; i < N * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / N;
    const r = i % 2 ? RO : RI;
    verts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  /** Distance from the centre to the star's outline along (dx, dz), as a ratio: <= 1 is inside. */
  const starRatio = (dx: number, dz: number) => {
    const rr = Math.hypot(dx, dz);
    if (rr < 1e-6) return 0;
    let a = Math.atan2(dz, dx) - Math.PI / 2;
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const i = Math.floor(a / (Math.PI / N)) % (N * 2);
    const [ax, az] = verts[i],
      [bx, bz] = verts[(i + 1) % (N * 2)];
    const ex = bx - ax,
      ez = bz - az;
    const ux = dx / rr,
      uz = dz / rr;
    const t = (ax * ez - az * ex) / (ux * ez - uz * ex);
    return rr / t;
  };
  const FH = 20;
  const ratio = new Float32Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) ratio[x + z * W] = starRatio(x + 0.5 - cx, z + 0.5 - cz);
  const batter = (y: number) => 1 - 0.05 * (y / FH);
  for (let y = 0; y < FH; y++) {
    const s = batter(y);
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        const r = ratio[x + z * W];
        if (r > s) continue;
        m.set(x, y, z, y === 0 ? C("#4e4b47") : fortStone(x, y, z));
      }
  }
  // the terrace: lawns in the star's points, paving round the pedestal, a parapet on the rim
  const sTop = batter(FH);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const r = ratio[x + z * W];
      const dx = x + 0.5 - cx,
        dz = z + 0.5 - cz;
      const rad = Math.hypot(dx, dz);
      if (r <= sTop) {
        const paving = rad < 40 || (Math.abs(Math.atan2(dz, dx) - Math.PI / 2) < 0.14 && dz > 0);
        if (paving) m.set(x, FH - 1, z, (x + z) % 2 ? C("#a8a196") : C("#9e978c"));
        else m.set(x, FH - 1, z, shades(["#4f8a46", "#47803f", "#56914c"], 1, seed + 3));
        if (!paving && rad < 41.5) m.set(x, FH - 1, z, C("#7d776c")); // kerb
      }
      if (r <= sTop && r > sTop - 0.07) {
        const crenel = Math.floor(Math.atan2(dz, dx) * 34) % 3 === 0;
        m.box(x, FH, z, x + 1, FH + (crenel ? 2 : 3), z + 1, fortStone(x, FH, z));
        m.set(x, FH + (crenel ? 1 : 2), z, C("#a9a49b"));
      }
    }
  // loopholes at the middle of every wall face, two rows
  for (let i = 0; i < N * 2; i++) {
    const [ax, az] = verts[i],
      [bx, bz] = verts[(i + 1) % (N * 2)];
    const len = Math.hypot(bx - ax, bz - az);
    const tx = (bx - ax) / len,
      tz = (bz - az) / len;
    // outward normal (the polygon winds counter-clockwise from +z)
    let nx = tz,
      nz = -tx;
    const mx = (ax + bx) / 2,
      mz = (az + bz) / 2;
    if (nx * mx + nz * mz < 0) (nx = -nx), (nz = -nz);
    for (const along of [-0.22, 0.22])
      for (const [y0, y1] of [[9, 14]]) {
        const s = batter((y0 + y1) / 2);
        const px = cx + (mx + tx * along * len) * s,
          pz = cz + (mz + tz * along * len) * s;
        for (let dd = -1.5; dd <= 2; dd += 0.5)
          for (let w = -1; w <= 1; w += 0.5)
            for (let y = y0; y < y1; y++) {
              const X = px - nx * dd + tx * w,
                Z = pz - nz * dd + tz * w;
              if (m.get(Math.round(X), y, Math.round(Z))) m.set(X, y, Z, dd > 1 ? C("#121014") : C("#3c3935"));
            }
      }
  }
  // the gate in the front re-entrant angle: an arched sally port with a lamp
  {
    const gz = Math.round(cz + RI * batter(6));
    for (let x = cx - 7; x < cx + 7; x++) {
      const u = (x + 0.5 - cx) / 7;
      const top = 10 + Math.round(4 * Math.sqrt(Math.max(0, 1 - u * u)));
      for (let y = 1; y < top; y++) for (let z = gz - 8; z < D; z++) m.set(x, y, z, 0);
      for (let y = 1; y < top; y++) m.set(x, y, gz - 9, C("#4a3424"));
      m.set(x, top, gz - 1, C("#c9c2b4"));
      m.set(x, top + 1, gz - 1, C("#c9c2b4"));
    }
    m.box(cx - 8, 0, gz - 8, cx + 8, 1, D, C("#9e978c"));
    for (let x = cx - 6; x < cx + 6; x += 3) m.box(x, 1, gz - 9, x + 1, 9, gz - 8, C("#2c2018"));
    m.box(cx - 1, 15, gz - 1, cx + 1, 17, gz + 1, E("#ffc070", 1.6));
    m.box(cx - 3, 11, gz, cx + 3, 12, gz + 1, C("#3b3530"));
  }

  // ---- the pedestal ----------------------------------------------------------------------------
  const sq = (y0: number, y1: number, h: number, c: Paint) => m.box(cx - h, y0, cz - h, cx + h, y1, cz + h, c);
  sq(FH - 1, FH + 2, 35, C("#8e877b"));
  sq(FH + 2, FH + 5, 32, granite);
  // the lower block, rusticated: grooves every 5 rows, quoins at the corners
  const B0 = FH + 5,
    B1 = 56;
  sq(B0, B1, 28, (x, y, z) => ((y - B0) % 5 === 4 ? C("#a99d88") : paintAt(granite, x, y, z)));
  for (let y = B0; y < B1 - 1; y += 5) {
    const wide = ((y - B0) / 5) % 2 === 0 ? 8 : 5;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x0 = sx < 0 ? cx - 29 : cx + 29 - wide,
          z0 = sz < 0 ? cz - 29 : cz + 29 - wide;
        m.box(x0, y, cz + sz * 29 - (sz < 0 ? 0 : 1), x0 + wide, y + 4, cz + sz * 29 + (sz < 0 ? 1 : 0), trim);
        m.box(cx + sx * 29 - (sx < 0 ? 0 : 1), y, z0, cx + sx * 29 + (sx < 0 ? 1 : 0), y + 4, z0 + wide, trim);
      }
  }
  // the plaque on the front, bronze in a gold frame
  const fzP = cz + 28;
  m.box(cx - 19, 30, fzP, cx + 19, 48, fzP + 1, goldDark);
  m.box(cx - 18, 31, fzP, cx + 18, 47, fzP + 2, C("#2a2118"));
  for (const x of [cx - 17, cx + 16]) m.box(x, 32, fzP + 1, x + 1, 46, fzP + 2, gold);
  // a smaller engraved line under it: the date the collection was minted
  {
    const t = "2026.09.17";
    const x0 = Math.round(cx - textWidth(t) / 2);
    glyphs(t, (px, py) => m.set(x0 + px, 39 - py - 4, fzP + 2, gold));
  }
  // cornice with dentils
  sq(B1, B1 + 2, 30, trim);
  sq(B1 + 2, B1 + 4, 31, granite);
  for (let i = -29; i < 29; i += 2) {
    m.box(cx + i, B1 - 1, cz + 28, cx + i + 1, B1, cz + 29, trim);
    m.box(cx + i, B1 - 1, cz - 29, cx + i + 1, B1, cz - 28, trim);
    m.box(cx + 28, B1 - 1, cz + i, cx + 29, B1, cz + i + 1, trim);
    m.box(cx - 29, B1 - 1, cz + i, cx - 28, B1, cz + i + 1, trim);
  }
  // the loggia: a recessed colonnade on every face, lit windows deep inside
  const L0 = B1 + 4,
    L1 = 88;
  sq(L0, L1, 26, granite);
  for (let face = 0; face < 4; face++) {
    // work in face coordinates: u along the face, n outward
    const put = (u: number, y: number, n: number, c: number) => {
      const [x, z] = face === 0 ? [cx + u, cz + 25 - n] : face === 1 ? [cx - u, cz - 26 + n] : face === 2 ? [cx + 25 - n, cz - u] : [cx - 26 + n, cz + u];
      m.set(x, y, z, c);
    };
    for (let u = -19; u < 19; u++)
      for (let y = L0 + 3; y < L1 - 3; y++) {
        const arch = y > L1 - 8 && Math.abs(((u + 19) % 10) - 4.5) > 4.5 - (L1 - 3 - y);
        if (arch) continue;
        for (let n = 0; n < 5; n++) put(u, y, n, 0);
        put(u, y, 5, (u + 19) % 10 >= 3 && (u + 19) % 10 < 7 && y > L0 + 6 && y < L1 - 9 ? E("#ffc27a", 0.9) : recess);
      }
    // columns between the bays and at each end, with bases and capitals
    for (let u = -19; u <= 19; u += 5) {
      const uu = Math.min(u, 17);
      for (let y = L0 + 3; y < L1 - 3; y++) for (let a = 0; a < 2; a++) for (let n = 1; n < 3; n++) put(uu + a, y, n, y < L0 + 5 || y > L1 - 6 ? trim : paintAt(granite, uu + a, y, n));
    }
    // balustrade along the front of the loggia
    for (let u = -19; u < 19; u++) {
      put(u, L0 + 6, 1, trim);
      if (u % 2 === 0) for (let y = L0 + 3; y < L0 + 6; y++) put(u, y, 1, C("#b3a891"));
    }
  }
  // entablature, attic with its ring of round shields, the top balcony
  sq(L1, L1 + 2, 28, trim);
  sq(L1 + 2, L1 + 6, 27, granite);
  sq(L1 + 6, L1 + 7, 28, C("#a99d88"));
  const A0 = L1 + 7,
    A1 = 110;
  sq(A0, A1, 24, granite);
  for (let i = -18; i <= 18; i += 9) {
    const disc = (x: number, y: number, z: number) => m.set(x, y, z, (x + y + z) % 3 ? C("#a3967f") : C("#b6a98f"));
    for (let a = -3; a <= 3; a++)
      for (let b = -3; b <= 3; b++) {
        if (a * a + b * b > 10) continue;
        const y = 100 + b;
        disc(cx + i + a, y, cz + 24);
        disc(cx + i + a, y, cz - 25);
        disc(cx + 24, y, cz + i + a);
        disc(cx - 25, y, cz + i + a);
      }
  }
  sq(A1, A1 + 3, 27, trim);
  const Y0 = A1 + 3;
  // the balcony rail round the top
  for (let i = -27; i < 27; i++) {
    const post = i % 3 === 0;
    for (const [x, z] of [
      [cx + i, cz + 26],
      [cx + i, cz - 27],
      [cx + 26, cz + i],
      [cx - 27, cz + i],
    ]) {
      if (post) m.box(x, Y0, z, x + 1, Y0 + 3, z + 1, C("#b3a891"));
      m.set(x, Y0 + 3, z, trim);
    }
  }

  // ---- the figure ------------------------------------------------------------------------------
  const P = 3;
  const YP = 176; // bottom of the portrait (its last row)
  const XP = 14; // left edge of the portrait
  const zc = cz - 2; // the figure's mid-plane
  // the portrait, with a hood rim added on the right where the void touched the edge
  const art = SNARK1.map((r) => r.split(""));
  for (let j = 9; j <= 18; j++) {
    const last = art[j].lastIndexOf("e");
    if (last >= 0 && art[j][last + 1] === ".") art[j][last + 1] = "c";
  }
  // loose pixels (small 4-connected pieces) float off as fragments
  const comp = new Int32Array(26 * 26).fill(-1);
  const compSize: number[] = [];
  for (let j = 0; j < 26; j++)
    for (let i = 0; i < 26; i++) {
      if (art[j][i] === "." || comp[i + j * 26] >= 0) continue;
      const id = compSize.length;
      let n = 0;
      const stack = [[i, j]];
      comp[i + j * 26] = id;
      while (stack.length) {
        const [a, b] = stack.pop()!;
        n++;
        for (const [da, db] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const na = a + da,
            nb = b + db;
          if (na < 0 || nb < 0 || na > 25 || nb > 25 || art[nb][na] === "." || comp[na + nb * 26] >= 0) continue;
          comp[na + nb * 26] = id;
          stack.push([na, nb]);
        }
      }
      compSize.push(n);
    }
  const loose = (i: number, j: number) => compSize[comp[i + j * 26]] <= 3;
  // depth of the cast: a rounded pillow from the distance to the silhouette's edge
  const GW = 26 * P;
  const filled = (u: number, v: number) => {
    if (v >= GW) return u >= 4 * P && u < 22 * P; // the body carries on below the portrait
    if (u < 0 || v < 0 || u >= GW) return false;
    const i = Math.floor(u / P),
      j = Math.floor(v / P);
    return art[j][i] !== "." && !loose(i, j);
  };
  const R = 17;
  const depth = new Float32Array(GW * GW);
  for (let v = 0; v < GW; v++)
    for (let u = 0; u < GW; u++) {
      if (!filled(u, v)) continue;
      let best = R * R;
      for (let b = -R; b <= R; b++)
        for (let a = -R; a <= R; a++) if (a * a + b * b < best && !filled(u + a, v + b)) best = a * a + b * b;
      const dd = Math.min(R, Math.sqrt(best) - 0.5);
      depth[u + v * GW] = Math.sqrt(R * R - (R - dd) * (R - dd));
    }
  const backFold = (x: number, y: number, z: number) => {
    const f = Math.sin(x * 0.45 + Math.sin(y * 0.08) * 2);
    return f > 0.55 ? C(TONES.d[0]) : f < -0.5 ? C(TONES.a[1]) : paintAt(colours.a, x, y, z);
  };
  const colours: Record<string, Paint> = {};
  for (const ch of "abcdef") colours[ch] = tone(ch);
  for (let v = 0; v < GW; v++)
    for (let u = 0; u < GW; u++) {
      const i = Math.floor(u / P),
        j = Math.floor(v / P);
      const ch = art[j][i];
      if (ch === ".") continue;
      const x = XP + u,
        y = YP + (GW - 1 - v);
      if (loose(i, j)) {
        // a loose pixel: a cube hanging in the air at its own depth, slowly drifting away
        const off = Math.round((hash(i, j, 3, seed) - 0.5) * 22);
        for (let z = zc + off - 1; z < zc + off + 2; z++) m.set(x, y, z, colours[ch]);
        continue;
      }
      const hd = depth[u + v * GW];
      let front = zc + Math.round(hd);
      const back = zc - Math.round(hd * 0.95);
      if (ch === "e") front -= 8;
      if (ch === "f") front -= 5;
      for (let z = back; z <= front; z++) {
        let c: Paint;
        if (z >= front - 1) c = colours[ch];
        else if (z < zc - 3) c = backFold;
        else c = ch === "e" || ch === "f" ? colours.c : colours[ch];
        m.set(x, y, z, c);
      }
    }

  // the robe, falling in folds from the shoulders to the pedestal
  const xc = XP + 13 * P - 1;
  const robeTop = YP;
  const robeFront = new Int32Array(W * H).fill(-1);
  for (let y = Y0; y < robeTop; y++) {
    const t = (y - Y0) / (robeTop - Y0);
    const rx = t > 0.75 ? 23 + (t - 0.75) * 4 * 4 : t > 0.3 ? 21 + ((t - 0.3) / 0.45) * 2 : 21 + (0.3 - t) * 6;
    const rz = 18 - t * 3;
    const hem = y < Y0 + 3;
    for (let z = zc - 22; z < zc + 24; z++)
      for (let x = xc - 30; x < xc + 31; x++) {
        const dx = x + 0.5 - xc,
          dz = z + 0.5 - zc;
        const th = Math.atan2(dz, dx);
        const fold = Math.sin(th * 13 + Math.sin(y * 0.06) * 0.8 + (dz < 0 ? 0 : 0.4));
        const rr = Math.sqrt((dx / rx) ** 2 + (dz / rz) ** 2);
        if (rr > 1 + 0.07 * fold + (hem ? 0.06 : 0)) continue;
        let c: Paint;
        if (hem) c = colours.a;
        else if (fold > 0.82) c = colours.b;
        else if (fold > 0.2) c = colours.d;
        else if (fold < -0.55) c = C(TONES.a[1]);
        else c = colours.a;
        m.set(x, y, z, c);
        if (dz > 0 && z > robeFront[x + y * W]) robeFront[x + y * W] = z;
      }
  }
  // Liberty's diagonal mantle: a band across the front from the left shoulder to the right hip
  for (let y = Y0 + 20; y < robeTop + 8; y++)
    for (let x = xc - 30; x < xc + 31; x++) {
      const band = y - (Y0 + 30) - (x - (xc - 26)) * 0.9;
      if (band < 0 || band > 12) continue;
      let f = -1;
      for (let z = zc + 30; z > zc; z--)
        if (m.get(x, y, z)) {
          f = z;
          break;
        }
      if (f < 0) continue;
      const c = band < 2 || band > 10 ? colours.a : (x + y) % 7 === 0 ? colours.b : colours.d;
      for (let z = f + 1; z <= f + 2; z++) m.set(x, y, z, c);
    }
  // a foot stepping forward from under the hem, and the broken chain at it
  {
    const fx = xc + 7;
    let fz = zc;
    for (let z = zc + 30; z > zc; z--)
      if (m.get(fx, Y0 + 1, z)) {
        fz = z;
        break;
      }
    m.box(fx - 4, Y0, fz - 2, fx + 4, Y0 + 3, fz + 5, colours.b);
    m.box(fx - 4, Y0 + 3, fz - 2, fx + 4, Y0 + 4, fz + 1, colours.d);
    const iron = C("#2a2a30");
    for (let i = 0; i < 9; i++) {
      const lx = xc - 18 + i * 3,
        lz = fz + 4 + (i % 3);
      if (i % 2) m.box(lx, Y0, lz, lx + 3, Y0 + 1, lz + 1, iron);
      else {
        m.box(lx, Y0, lz - 1, lx + 1, Y0 + 2, lz + 2, iron);
        m.box(lx + 2, Y0, lz - 1, lx + 3, Y0 + 2, lz + 2, iron);
      }
    }
  }

  // limbs: tapered capsules
  const capsule = (a: number[], b: number[], r0: number, r1: number, c: Paint, onlyEmpty = false) => {
    const lo = [0, 1, 2].map((i) => Math.floor(Math.min(a[i], b[i]) - Math.max(r0, r1) - 1));
    const hi = [0, 1, 2].map((i) => Math.ceil(Math.max(a[i], b[i]) + Math.max(r0, r1) + 1));
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    for (let y = lo[1]; y <= hi[1]; y++)
      for (let z = lo[2]; z <= hi[2]; z++)
        for (let x = lo[0]; x <= hi[0]; x++) {
          const p = [x + 0.5 - a[0], y + 0.5 - a[1], z + 0.5 - a[2]];
          const t = Math.max(0, Math.min(1, (p[0] * ab[0] + p[1] * ab[1] + p[2] * ab[2]) / L2));
          const d2 = (p[0] - ab[0] * t) ** 2 + (p[1] - ab[1] * t) ** 2 + (p[2] - ab[2] * t) ** 2;
          const r = r0 + (r1 - r0) * t;
          if (d2 <= r * r && (!onlyEmpty || !m.get(x, y, z))) m.set(x, y, z, c);
        }
  };
  const sleeve: Paint = (x, y, z) => {
    const f = Math.sin(x * 0.7 + z * 0.7 - y * 0.15);
    return f > 0.6 ? paintAt(colours.d, x, y, z) : f < -0.4 ? C(TONES.a[1]) : paintAt(colours.a, x, y, z);
  };
  const skin = colours.b;
  // the raised arm, on the figure's left (the clean side of the hood), torch high above the head
  const sh = [XP + 20 * P, YP + 8, zc - 1];
  const el = [XP + 23 * P + 2, YP + 44, zc + 1];
  const wr = [XP + 24 * P, YP + 70, zc + 2];
  capsule(sh, el, 10, 7.5, sleeve);
  capsule([el[0] + 2, el[1] - 2, el[2]], [el[0] + 4, el[1] - 22, el[2] - 1], 6, 3.5, sleeve); // the hanging sleeve
  capsule(el, wr, 5.5, 4.5, skin);
  m.blob(wr[0], wr[1] + 3, wr[2], 6, skin, 0.12, seed + 4);
  // the torch: handle, cup with the ⓩ, balcony, flame
  const tx = wr[0],
    tz = wr[2];
  capsule([tx, wr[1] + 6, tz], [tx, wr[1] + 16, tz], 2.6, 3.2, goldDark);
  m.cylinder(tx, wr[1] + 9, tz, 4, 1, gold);
  const cupY = wr[1] + 16;
  for (let y = cupY; y < cupY + 11; y++) m.cylinder(tx, y, tz, 5 + (y - cupY) * 0.4, 1, y === cupY + 10 ? gold : C("#c08a22"));
  m.cylinder(tx, cupY + 8, tz, 11, 1, gold);
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    m.box(tx + Math.cos(ang) * 10.4, cupY + 9, tz + Math.sin(ang) * 10.4, tx + Math.cos(ang) * 10.4 + 1, cupY + 11, tz + Math.sin(ang) * 10.4 + 1, goldDark);
  }
  m.cylinder(tx, cupY + 11, tz, 11, 1, gold, true);
  // ⓩ on the cup's front: a ring and a Z, bright gold
  {
    const ez = tz + 7;
    const ey = cupY + 4;
    for (let a = -5; a <= 5; a++)
      for (let b = -5; b <= 5; b++) {
        const r2 = a * a + b * b;
        if (r2 > 27) continue;
        const ring = r2 >= 16;
        const zed = (Math.abs(b) === 2 && Math.abs(a) <= 2) || (Math.abs(b) < 2 && a === b);
        m.set(tx + a, ey + b, ez, goldDark);
        if (ring || zed) m.set(tx + a, ey + b, ez + 1, E("#f4b728", 1.4));
      }
  }
  const flameY = cupY + 11;
  for (let y = flameY; y < H; y++) {
    const t = (y - flameY) / (H - flameY);
    const r = 8 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85)), 0.8) * (1 - t * 0.35);
    for (let z = Math.floor(tz - r); z <= tz + r; z++)
      for (let x = Math.floor(tx - r); x <= tx + r; x++) {
        const d = Math.hypot(x + 0.5 - tx, z + 0.5 - tz);
        const lick = 0.75 + 0.35 * Math.sin(Math.atan2(z - tz, x - tx) * 5 + y * 0.35);
        if (d > r * lick) continue;
        m.set(x, y, z, d < r * 0.45 ? E("#fff1b8", 3) : d < r * 0.75 ? E("#ffc94a", 2.6) : E("#f4a020", 2.3));
      }
  }
  // the other arm, holding the tablet against the body
  const tabX0 = XP + 2 * P,
    tabX1 = tabX0 + 28;
  const tabY0 = 130,
    tabY1 = 164;
  const tabZ = zc + 19;
  capsule([XP + 6 * P, YP + 4, zc], [tabX0 + 4, 146, zc + 9], 8, 6, sleeve);
  capsule([tabX0 + 4, 146, zc + 9], [tabX0 + 6, tabY0 - 1, tabZ - 3], 4.5, 4, skin);
  m.box(tabX0, tabY0, tabZ - 4, tabX1, tabY1, tabZ, goldDark);
  m.box(tabX0 + 1, tabY0 + 1, tabZ - 1, tabX1 - 1, tabY1 - 1, tabZ + 1, gold);
  m.box(tabX0 + 3, tabY0 + 3, tabZ, tabX1 - 3, tabY1 - 3, tabZ + 1, C("#c99322"));
  for (const [line, row] of [
    ["ZIP", 0],
    ["32", 1],
  ] as const) {
    const lx = Math.round((tabX0 + tabX1) / 2 - textWidth(line));
    const ly = tabY1 - 5 - row * 13;
    glyphs(line, (px, py) => m.box(lx + px * 2, ly - py * 2 - 2, tabZ, lx + px * 2 + 2, ly - py * 2, tabZ + 1, C("#5a3c0c")));
  }
  m.blob(tabX0 + 6, tabY0 + 1, tabZ - 1, 4.5, skin, 0.15, seed + 5);

  // the crown: seven rays fanning out from behind the hood's brim
  const ccx = XP + 15.5 * P,
    ccy = YP + (25 - 14) * P;
  for (let i = 0; i < 7; i++) {
    const ang = ((i - 3) / 3) * (Math.PI * 0.36);
    const dx = Math.sin(ang),
      dy = Math.cos(ang);
    for (let r = 14; r < 40; r += 0.5) {
      const th = r < 32 ? 1.5 : 0.8;
      const px = ccx + dx * r,
        py = ccy + dy * r;
      for (let a = -th; a <= th; a += 0.5)
        for (let z = zc + 3; z < zc + 6; z++) {
          const X = Math.round(px + dy * a),
            Y = Math.round(py - dx * a);
          const u = X - XP,
            v = GW - 1 - (Y - YP);
          if (u >= 0 && u < GW && v >= 0 && v < GW && art[Math.floor(v / P)][Math.floor(u / P)] !== ".") continue;
          if (!m.get(X, Y, z)) m.set(X, Y, z, r > 37 ? C("#ffd56a") : paintAt(gold, X, Y, z));
        }
    }
  }

  // floodlights on the terrace, aimed at the figure
  for (const [fx, fz] of [
    [cx - 30, cz + 32],
    [cx + 30, cz + 32],
    [cx - 34, cz - 20],
    [cx + 34, cz - 20],
  ]) {
    m.box(fx - 1, FH, fz - 1, fx + 2, FH + 2, fz + 2, C("#2c2a30"));
    m.box(fx - 1, FH + 2, fz - 1, fx + 2, FH + 3, fz + 2, E("#fff0d0", 1.6));
  }

  const signs: SignSpot[] = [{ text: "ZERO KNOWLEDGE · 零知識", color: "#f4b728", x: cx, y: 43, z: fzP + 2.3, w: 34, h: 7, vertical: false, facing: "front" }];
  const torch: [number, number, number] = [tx, flameY + 9, tz];
  return {
    model: m,
    signs,
    door: [cx, D],
    body: [0, 0, W, D],
    walls: [[cx - 36, cz - 36, cx + 36, cz + 36]],
    lights: [
      [torch[0], torch[1], torch[2], "#ffc04a"],
      [cx, 150, cz + 40, "#fff0d6"],
      [cx, 215, cz + 34, "#fff0d6"],
      [cx, 14, D - 4, "#ffc070"],
    ],
    points: { torch, crown: [XP + 16 * P, YP + 20 * P, zc] },
    scale: k,
  };
}
