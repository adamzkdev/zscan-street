import type { Built } from "../buildings";
import { C, E, G, hash, rand, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";

/**
 * THE PALM (Jumeirah) in the bay: seen from above, a palm tree of sand. The trunk runs out from
 * the city quay (+z, north) with its boulevard, palms down the median, apartment blocks on both
 * sides and the monorail on its viaduct; sixteen fronds sweep back from it, each with a road down
 * the middle and a row of white villas on both sides (pools, palms, private beaches, a jetty and a
 * boat now and then); round the crown, the crescent breakwater (rock armour outside, beach inside,
 * small resorts) with the coral twin-tower arch of ATLANTIS at its middle, the Aquaventure
 * ziggurat beside it and the monorail's last station. Water everywhere between.
 *
 * Scale 2 (a third of a metre per voxel). The model sits with y = 0 at the bay's water level and
 * reaches 10 voxels past its lot's front, across the gap to the quay.
 * Points: `atlantis` (top of the arch), `crown` (the trunk's tip), `camPos` / `camLook`.
 */
const paintAt = (p: Paint, x: number, y: number, z: number) => (typeof p === "number" ? p : p(x, y, z));

export function palm(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D: DL } = lotSize(o, k);
  const EXT = 10;
  const D = DL + EXT;
  const H = 92;
  const m = new VoxelModel(W, H, D);
  const rnd = rand(seed * 31 + 7);
  const CX = W / 2;
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];

  // ---- palette ----------------------------------------------------------------------------------
  const sand = shades(["#ecdcae", "#e6d5a4", "#f0e2b8"], 2, seed + 1);
  const wetSand = shades(["#cdb784", "#c6af7c", "#d3be8c"], 2, seed + 2);
  const grass = shades(["#6aa64c", "#619e45", "#72ad53"], 2, seed + 3);
  const lawn = shades(["#7dbb5a", "#76b454", "#84c260"], 2, seed + 4);
  const asphalt = shades(["#46444c", "#423f48", "#4a4850"], 3, seed + 5);
  const pave = shades(["#ddd5c4", "#d6cebd", "#e2dacb"], 2, seed + 6);
  const rock = shades(["#8f897c", "#837d71", "#9a9487", "#7a7468"], 1, seed + 7);
  const lane = C("#f2efe6");
  const trunkC = shades(["#8a6a48", "#7e6040"], 1, seed + 8);
  const leaf = [C("#3f8f3a"), C("#4fa046"), C("#2f7a32"), C("#5aad4c")];
  const pool = E("#45d0e6", 0.85);
  const poolEdge = C("#f4f0e6");
  const glass = G("#2c4a5a");
  const lit = E("#ffd8a0", 1.25);
  const wood = shades(["#9a6e46", "#8e6440"], 1, seed + 9);

  // ---- the plan: trunk, fronds, crescent ----------------------------------------------------------
  const TH = 15; // trunk half width
  const TZ0 = 40; // the crown: the trunk's rounded tip
  const CC = { x: CX, z: 92 };
  const RO = 82;
  /** Angle round the crescent from its middle (straight back, -z). */
  const angOf = (x: number, z: number) => Math.atan2(x - CC.x, CC.z - z);
  /** The crescent's inner radius: wider at its middle, where Atlantis stands. */
  const RI = (a: number) => 74 - 17 * Math.exp(-((a / 0.6) ** 2));
  const CRES_END = 2.1; // radians either side of the middle
  const zOut = (x: number) => CC.z - Math.sqrt(Math.max(0, RO * RO - (x - CC.x) ** 2));

  interface Frond {
    bx: number;
    bz: number;
    dx: number;
    dz: number;
    L: number;
    hw: number;
    s: number;
    i: number;
  }
  const fronds: Frond[] = [];
  for (let i = 0; i < 8; i++)
    for (const s of [-1, 1]) {
      const bz = 228 - i * 26;
      const th = 0.16 + i * 0.06;
      const dx = s * Math.cos(th),
        dz = -Math.sin(th);
      const bx = CX + s * 9;
      const hw = i < 6 ? 7 : 6.5;
      let L = 16;
      for (; L < 100; L++) {
        const tx = bx + dx * (L + 1),
          tz = bz + dz * (L + 1);
        if (tx < 6 + hw || tx > W - 6 - hw) break;
        const r = Math.hypot(tx - CC.x, tz - CC.z);
        const a = angOf(tx, tz);
        if (Math.abs(a) < CRES_END + 0.25 && r > RI(a) - 7 - hw) break;
      }
      fronds.push({ bx, bz, dx, dz, L, hw, s, i });
    }

  /** Per column: what land it is, and where across it. */
  const kind = new Int8Array(W * D); // 0 water, 1 trunk, 2 frond, 3 crescent
  const top = new Int8Array(W * D);
  const fid = new Int8Array(W * D).fill(-1);
  const fv = new Float32Array(W * D);
  const fu = new Float32Array(W * D);
  const road = new Uint8Array(W * D);
  const at = (x: number, z: number) => x + z * W;
  const frondAt = (px: number, pz: number) => {
    let best = -1,
      bu = 0,
      bv = 0,
      be = -1;
    for (let n = 0; n < fronds.length; n++) {
      const f = fronds[n];
      const rx = px - f.bx,
        rz = pz - f.bz;
      const u = rx * f.dx + rz * f.dz;
      const v = -rx * f.dz + rz * f.dx;
      if (u < -2 || u > f.L) continue;
      let e = f.hw - Math.abs(v);
      if (u > f.L - f.hw) e = f.hw - Math.hypot(u - (f.L - f.hw), v);
      if (e > be) (be = e), (best = n), (bu = u), (bv = v);
    }
    return { n: best, u: bu, v: bv, e: be };
  };
  const ramp = (z: number) => (z > DL - 12 ? 3 + Math.min(2, Math.floor((z - (DL - 12)) / 6)) : 3);

  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const px = x + 0.5,
        pz = z + 0.5;
      const i = at(x, z);
      // trunk (with its rounded crown)
      const ta = Math.abs(px - CX);
      let te = -1;
      if (pz >= TZ0 + TH) te = TH - ta;
      else if (pz >= TZ0 - 4) te = TH - Math.hypot(ta, (TZ0 + TH - pz) * (TH / (TH + 4)));
      const f = frondAt(px, pz);
      // crescent
      const r = Math.hypot(px - CC.x, pz - CC.z);
      const a = angOf(px, pz);
      let ce = -1;
      if (Math.abs(a) < CRES_END) {
        ce = Math.min(r - RI(a), RO - r);
        const endE = (CRES_END - Math.abs(a)) * RO;
        if (endE < 4) ce = Math.min(ce, endE);
      }
      if (te >= 0) {
        kind[i] = 1;
        fv[i] = px - CX;
        const t = ramp(z);
        top[i] = te < 1 ? 1 : te < 2.5 ? 2 : t;
        // a frond's road crossing to the boulevard
        if (f.n >= 0 && Math.abs(f.v) <= 1.6 && ta > 5 && te >= 2.5 && Math.sign(px - CX) === fronds[f.n].s) road[i] = 1;
      } else if (f.e >= 0) {
        kind[i] = 2;
        fid[i] = f.n;
        fu[i] = f.u;
        fv[i] = f.v;
        top[i] = f.e < 1 ? 1 : f.e < 2.4 ? 2 : 3;
      } else if (ce >= 0) {
        kind[i] = 3;
        fv[i] = r;
        top[i] = r - RI(a) < 1 ? 1 : r - RI(a) < 3 ? 2 : RO - r < 2.5 ? 2 : 3;
      }
    }

  // ---- ground --------------------------------------------------------------------------------------
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const i = at(x, z);
      const kd = kind[i];
      if (!kd) continue;
      const h = top[i];
      if (h === 1) {
        m.set(x, 0, z, wetSand);
        continue;
      }
      if (h === 2) {
        m.box(x, 0, z, x + 1, 2, z + 1, sand);
        continue;
      }
      m.box(x, 0, z, x + 1, h - 1, z + 1, sand);
      let c: Paint = grass;
      if (kd === 1) {
        const a = Math.abs(fv[i]);
        if (road[i]) c = asphalt;
        else if (a < 1.5) c = lawn;
        else if (a < 5.5) c = Math.abs(a - 3.5) < 0.5 && z % 6 < 3 ? lane : asphalt;
        else if (a < 7) c = pave;
        else if (a < 12.5) c = pave;
        else c = sand;
      } else if (kd === 2) {
        const f = fronds[fid[i]];
        const v = Math.abs(fv[i]);
        const u = fu[i];
        if (v < 1.3 && u < f.L - f.hw * 0.7) c = asphalt;
        else if (v < 1.8 && u < f.L - f.hw * 0.7) c = pave;
        else if (f.hw - v < 2.4) c = sand;
        else c = hash(x, 3, z, seed) < 0.12 ? grass : lawn;
      } else {
        const r = fv[i];
        const a = angOf(x + 0.5, z + 0.5);
        const ri = RI(a);
        if (RO - r < 3.5) c = rock;
        else if (r - ri < 3.5) c = sand;
        else if (Math.abs(r - (RO - 5.5)) < 1.2) c = asphalt;
        else c = lawn;
      }
      m.set(x, h - 1, z, c);
    }
  // rock armour on the crescent's sea side: boulders
  for (let a = -CRES_END + 0.04; a < CRES_END - 0.04; a += 0.03) {
    const rr = RO - 1 + rnd() * 1.2;
    const x = CC.x + Math.sin(a) * rr,
      z = CC.z - Math.cos(a) * rr;
    m.blob(x, 1.2, z, 1.3 + rnd() * 0.9, rock, 0.3, seed + Math.round(a * 100));
  }

  // ---- small things ---------------------------------------------------------------------------------
  /** A palm: a leaning ringed trunk, a crown of drooping fronds and a few dates. */
  const palmTree = (x: number, y0: number, z: number, h = 6, s = 0) => {
    x = Math.round(x);
    z = Math.round(z);
    const lx = s % 3 === 0 ? 1 : s % 3 === 1 ? -1 : 0;
    const lz = s % 2 ? 1 : 0;
    let tx = x,
      tz = z;
    for (let y = 0; y < h; y++) {
      if (y === Math.floor(h * 0.6)) (tx += lx), (tz += lz);
      m.set(tx, y0 + y, tz, trunkC);
    }
    const ty = y0 + h;
    m.set(tx, ty, tz, leaf[2]);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ];
    dirs.forEach(([dx, dz], j) => {
      const len = j < 4 ? 3 : 2;
      for (let r = 1; r <= len; r++) m.set(tx + dx * r, ty - (r === len ? 1 : 0), tz + dz * r, leaf[(j + r + s) % 4]);
    });
    m.set(tx, ty - 1, tz + 1, C("#c87a2a"));
  };
  const lamp = (x: number, y0: number, z: number, h = 6) => {
    m.box(x, y0, z, x + 1, y0 + h, z + 1, C("#3a3842"));
    m.set(x, y0 + h, z, E("#ffe6b8", 2.2));
  };

  /** A villa: white cube(s) on a plinth, glass bands, a roof terrace, its pool and palm. */
  const villa = (cx: number, cz: number, t: number, f: Frond, n: number) => {
    const h0 = 3;
    const vw = 5 + (n % 3 === 0 ? 1 : 0),
      vd = 5;
    const x0 = Math.round(cx - vw / 2),
      z0 = Math.round(cz - vd / 2);
    const walls = [C("#f6f2ea"), C("#f2ead8"), C("#ece4d2"), C("#f8f4ec")];
    const wc = walls[n % walls.length];
    const trim = n % 4 === 1 ? C("#c9a77a") : n % 4 === 3 ? C("#b86a48") : C("#d8d0c0");
    const two = n % 3 !== 1;
    const g1 = 4;
    m.box(x0 - 1, h0 - 1, z0 - 1, x0 + vw + 1, h0, z0 + vd + 1, pave);
    // ground floor: glass all round between corner piers, lit some nights
    const win = hash(n, f.i, f.s, seed) < 0.45 ? lit : glass;
    m.box(x0, h0, z0, x0 + vw, h0 + g1, z0 + vd, (x, y, z) => {
      const edgeX = x === x0 || x === x0 + vw - 1,
        edgeZ = z === z0 || z === z0 + vd - 1;
      if (y === h0 + g1 - 1) return wc;
      if (edgeX && edgeZ) return wc;
      if (y === h0) return wc;
      // a wide picture window on each face, the door side darker
      return y === h0 + 1 || y === h0 + 2 ? win : wc;
    });
    // first floor: a smaller box set back towards the road, a terrace on the rest
    if (two) {
      const sx = t > 0 ? 0 : 0;
      void sx;
      const ux0 = x0 + (n % 2 ? 0 : 2),
        ux1 = ux0 + vw - 2;
      m.box(ux0, h0 + g1, z0, ux1, h0 + g1 + 3, z0 + vd - 1, (x, y, z) => (y === h0 + g1 + 1 && (x + z) % 2 === 1 ? glass : wc));
      m.box(ux0, h0 + g1 + 3, z0, ux1, h0 + g1 + 4, z0 + vd - 1, trim);
      // terrace parapet with a sunshade
      for (let x = x0; x < x0 + vw; x++)
        for (let z = z0; z < z0 + vd; z++) {
          const onEdge = x === x0 || x === x0 + vw - 1 || z === z0 || z === z0 + vd - 1;
          if (onEdge && !m.get(x, h0 + g1, z)) m.set(x, h0 + g1, z, C("#e4dccb"));
        }
    } else {
      // single storey with a pergola roof and a rooftop deck
      m.box(x0, h0 + g1, z0, x0 + vw, h0 + g1 + 1, z0 + vd, trim);
      m.box(x0 + 1, h0 + g1 + 1, z0 + 1, x0 + 3, h0 + g1 + 2, z0 + 2, C("#2f6fb0"));
    }
  };
  /** A rotated rectangle stepped onto the grid: along d for `len`, across n for `wid`. */
  const strip = (sx: number, sz: number, dx: number, dz: number, len: number, wid: number, y0: number, y1: number, c: Paint, onlyWater = false) => {
    const nx = -dz,
      nz = dx;
    for (let a = 0; a < len; a += 0.4)
      for (let b = 0; b < wid; b += 0.4) {
        const x = Math.floor(sx + dx * a + nx * b),
          z = Math.floor(sz + dz * a + nz * b);
        if (onlyWater && kind[at(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(D - 1, z)))]) continue;
        for (let y = y0; y < y1; y++) m.set(x, y, z, c);
      }
  };
  const waterFree = (x: number, z: number, r: number) => {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const X = Math.round(x + dx),
          Z = Math.round(z + dz);
        if (X < 0 || Z < 0 || X >= W || Z >= D || kind[at(X, Z)] || m.get(X, 0, Z)) return false;
      }
    return true;
  };
  /** A speedboat (white hull, teak deck, a windscreen) or a little yacht, along (dx, dz). */
  const boat = (x: number, z: number, dx: number, dz: number, n: number) => {
    const len = n % 3 === 0 ? 7 : 5;
    const hull = n % 4 === 2 ? C("#1d2a44") : C("#f6f6f2");
    strip(x - dx * len * 0.5, z - dz * len * 0.5, dx, dz, len, 2, 0, 1, hull);
    strip(x - dx * (len * 0.5 - 1), z - dz * (len * 0.5 - 1), dx, dz, len - 2, 2, 1, 2, n % 3 === 0 ? C("#f6f6f2") : C("#b08a5a"));
    strip(x + dx * 0.5, z + dz * 0.5, dx, dz, 1, 2, 2, 3, n % 3 === 0 ? glass : C("#3a4a5a"));
  };

  // ---- the fronds: road, villas, pools, palms, jetties ---------------------------------------
  let vn = 0;
  for (const f of fronds) {
    const nx = -f.dz,
      nz = f.dx;
    // where the frond leaves the trunk's beach
    const u0 = (TH + 2 - 9) / Math.abs(f.dx) + 3;
    const uEnd = f.L - f.hw - 1;
    let j = 0;
    for (let u = u0; u < uEnd; u += 8, j++) {
      for (const t of [-1, 1]) {
        const cx = f.bx + f.dx * u + nx * t * 3.7,
          cz = f.bz + f.dz * u + nz * t * 3.7;
        villa(cx, cz, t, f, vn++);
        // between villas: a pool on the garden, a palm on the beach
        const pu = u + 4.3;
        if (pu < uEnd) {
          const px = f.bx + f.dx * pu + nx * t * 4.3,
            pz = f.bz + f.dz * pu + nz * t * 4.3;
          strip(px - f.dx * 1.2 - nx * t * 1.2, pz - f.dz * 1.2 - nz * t * 1.2, f.dx, f.dz, 3, 2.4, 2, 3, pool);
          const ex = f.bx + f.dx * pu + nx * t * 6.4,
            ez = f.bz + f.dz * pu + nz * t * 6.4;
          if ((j + (t > 0 ? 1 : 0)) % 2 === 0) palmTree(ex, 2, ez, 4 + ((vn + j) % 3), vn);
        }
        // a jetty out into the water, now and then a boat at it
        if ((j + (t > 0 ? 1 : 0) + f.i) % 3 === 0) {
          const jx = f.bx + f.dx * (u + 1) + nx * t * (f.hw - 1),
            jz = f.bz + f.dz * (u + 1) + nz * t * (f.hw - 1);
          const ox = nx * t,
            oz = nz * t;
          if (waterFree(jx + ox * 4, jz + oz * 4, 1)) {
            strip(jx, jz, ox, oz, 4.2, 1.2, 1, 2, wood);
            const bxp = jx + ox * 3.2 + f.dx * 2.2,
              bzp = jz + oz * 3.2 + f.dz * 2.2;
            if (waterFree(bxp, bzp, 1) && (vn + f.i) % 2 === 0) boat(bxp, bzp, ox, oz, vn);
          }
        }
      }
    }
    // the frond's end: a little round of beach with a lifeguard hut and palms
    const tx = f.bx + f.dx * (f.L - f.hw - 1),
      tz = f.bz + f.dz * (f.L - f.hw - 1);
    palmTree(tx + nx * 2, 3, tz + nz * 2, 6, f.i);
    palmTree(tx - nx * 2, 3, tz - nz * 2, 5, f.i + 3);
    // street lights down the frond road
    for (let u = u0; u < uEnd; u += 16) m.set(Math.round(f.bx + f.dx * u), 3, Math.round(f.bz + f.dz * u), C("#3a3842")), m.set(Math.round(f.bx + f.dx * u), 4, Math.round(f.bz + f.dz * u), E("#ffe6b8", 2));
  }

  // ---- the trunk: apartment blocks both sides, palms down the median, lamps -------------------
  const isRoad = (x: number, z: number) => road[at(x, Math.max(0, Math.min(D - 1, z)))] === 1;
  for (const s of [-1, 1]) {
    const xa = s < 0 ? Math.round(CX - 12.5) : Math.round(CX + 7),
      xb = xa + 6;
    let z = TZ0 + TH + 2;
    let n = 0;
    while (z < DL - 16) {
      const len = 10 + (n % 3) * 2;
      let clear = true;
      for (let zz = z - 2; zz < z + len + 2; zz++) if (isRoad(Math.round(CX + s * 10), zz)) clear = false;
      if (!clear) {
        z += 3;
        continue;
      }
      const h = 3 + 9 + ((n * 5 + (s > 0 ? 3 : 0)) % 4) * 3;
      const wallC = [C("#efe6d2"), C("#e8dcc4"), C("#f4eee2"), C("#e6d8bc")][n % 4];
      const b0 = ramp(z);
      m.box(xa, b0, z, xb, h, z + len, (x, y, zz) => {
        const face = x === xa || x === xb - 1 || zz === z || zz === z + len - 1;
        if (!face) return wallC;
        if ((y - b0) % 3 === 1 && (x + zz) % 3 !== 0) return hash(x, y, zz, seed + 40) < 0.3 ? lit : glass;
        if ((y - b0) % 3 === 0 && y > b0) return C("#d6ccb6");
        return wallC;
      });
      // a roof with a pool or a garden, and the plant room
      m.box(xa, h, z, xb, h + 1, z + len, C("#d8cfbc"));
      if (n % 2 === 0) m.box(xa + 1, h, z + 2, xb - 1, h + 1, z + len - 3, pool);
      else m.box(xa + 1, h, z + 1, xb - 1, h + 1, z + len - 1, lawn);
      m.box(xa + 2, h + 1, z + len - 3, xb - 2, h + 3, z + len - 1, C("#c8beac"));
      z += len + 3;
      n++;
    }
    // beach palms in front of the blocks (outer side)
    for (let zz = TZ0 + TH + 4; zz < DL - 8; zz += 9) if (!isRoad(Math.round(CX + s * 14), zz)) palmTree(CX + s * 13.5, 2, zz, 5 + (zz % 3), zz);
    // street lamps along the sidewalk
    for (let zz = TZ0 + TH + 2; zz < D - 2; zz += 10) lamp(Math.round(CX + s * 6.2 - (s < 0 ? 1 : 0)), ramp(zz), zz, 5);
  }

  // ---- the monorail: viaduct down the median, out over the water to Atlantis -----------------
  const MZ1 = D - 6;
  const atlFront = zOut(CX) + 3 + 12;
  const MZ0 = Math.round(atlFront + 8);
  const BEAM = 15;
  const concrete = shades(["#d8d4cc", "#d0ccc4"], 2, seed + 12);
  const mx0 = Math.round(CX - 1.5);
  m.box(mx0, BEAM, MZ0, mx0 + 3, BEAM + 2, MZ1, concrete);
  for (let z = MZ1 - 2; z > MZ0; z -= 14) {
    const base = kind[at(Math.round(CX), z)] ? ramp(z) - 1 : 0;
    m.box(mx0 + 1, base, z, mx0 + 2, BEAM, z + 2, concrete);
    m.box(mx0, BEAM - 1, z - 1, mx0 + 3, BEAM, z + 3, concrete);
  }
  // median palms between the piers
  for (let z = TZ0 + TH + 6; z < DL - 4; z += 14) palmTree(CX - (z % 2 ? 1 : 0), 3, z, 6, z);
  // the train: three white cars with a ZEC-gold band, nose and tail tapered
  {
    const z0 = 120;
    for (let c = 0; c < 3; c++) {
      const a = z0 + c * 15;
      m.box(mx0 - 1, BEAM + 2, a, mx0 + 4, BEAM + 7, a + 14, (x, y, z) => {
        if (y === BEAM + 4 && (z % 3 !== 0)) return glass;
        if (y === BEAM + 3) return C("#f4b728");
        if (y === BEAM + 6) return C("#e8e8e4");
        return C("#f8f8f4");
      });
      if (c === 0) m.clear(mx0 - 1, BEAM + 5, a, mx0 + 4, BEAM + 7, a + 2);
      if (c === 2) m.clear(mx0 - 1, BEAM + 5, a + 12, mx0 + 4, BEAM + 7, a + 14);
    }
  }
  // the gateway over the boulevard at the quay, with its name
  {
    const gz = DL - 6;
    const g0 = ramp(gz);
    const goldC = C("#d9b25a");
    for (const s of [-1, 1]) {
      const px = Math.round(CX + s * 6.5 - (s < 0 ? 2 : 0));
      m.box(px, g0, gz, px + 2, g0 + 11, gz + 2, C("#efe6d2"));
      m.box(px, g0 + 11, gz, px + 2, g0 + 12, gz + 2, goldC);
    }
    m.box(Math.round(CX - 7.5), g0 + 9, gz, Math.round(CX + 7.5), g0 + 11, gz + 2, C("#efe6d2"));
    m.box(Math.round(CX - 7.5), g0 + 11, gz, Math.round(CX + 7.5), g0 + 12, gz + 2, goldC);
    signs.push({ text: "THE PALM", color: "#f4b728", x: CX, y: g0 + 10, z: gz + 2.1, w: 13, h: 2, vertical: false, facing: "front" });
    // the guard huts either side
    for (const s of [-1, 1]) m.box(Math.round(CX + s * 9 - 2), g0, gz - 1, Math.round(CX + s * 9 + 1), g0 + 4, gz + 3, C("#e8dcc4"));
  }
  // the crown: a round plaza with a fountain at the trunk's tip
  {
    const fz = TZ0 + 6;
    m.cylinder(CX, 2, fz, 7, 1, pave);
    m.cylinder(CX, 3, fz, 5, 1, C("#e8e0d0"));
    m.cylinder(CX, 3, fz, 4, 1, pool);
    m.cylinder(CX, 3, fz, 1.2, 3, C("#e8e0d0"));
    m.set(CX - 0.5, 6, fz, E("#d8f6ff", 1.6));
    m.set(CX - 0.5, 7, fz, E("#d8f6ff", 1.2));
    for (let a = 0; a < 6; a++) palmTree(CX + Math.sin(a) * 9.5, 2, fz + Math.cos(a) * 9.5, 5 + (a % 2), a);
  }

  // ---- the crescent: road, small resorts, palms -------------------------------------------------
  const resort = (x: number, z: number, n: number) => {
    const w = 7 + (n % 2) * 2,
      d = 6;
    const x0 = Math.round(x - w / 2),
      z0 = Math.round(z - d / 2);
    const h = 3 + 6 + (n % 3) * 3;
    const wall = [C("#f0e2c4"), C("#ecd6b0"), C("#f4ece0")][n % 3];
    m.box(x0, 3, z0, x0 + w, h, z0 + d, (xx, y, zz) => ((y - 3) % 3 === 1 && (xx + zz) % 2 === 0 ? (hash(xx, y, zz, seed + 50) < 0.3 ? lit : glass) : wall));
    m.box(x0, h, z0, x0 + w, h + 1, z0 + d, n % 2 ? C("#c0603e") : C("#d9b25a"));
    m.box(x0 + 1, h + 1, z0 + 1, x0 + w - 1, h + 2, z0 + d - 1, n % 2 ? C("#a8502e") : C("#e8d8b0"));
  };
  {
    let n = 0;
    for (let a = -CRES_END + 0.18; a < CRES_END - 0.1; a += 0.13) {
      if (Math.abs(a) < 0.62) continue; // Atlantis and its gardens
      const r = (RI(a) + RO) / 2 - 1;
      const x = CC.x + Math.sin(a) * r,
        z = CC.z - Math.cos(a) * r;
      if (n % 2 === 0) resort(x, z, n);
      else {
        palmTree(x, 3, z, 6, n);
        palmTree(x + 2, 3, z + 2, 5, n + 1);
      }
      const ir = RI(a) + 1.6;
      palmTree(CC.x + Math.sin(a + 0.04) * ir, 2, CC.z - Math.cos(a + 0.04) * ir, 4 + (n % 2), n + 2);
      n++;
    }
  }

  // ---- ATLANTIS: the coral twin towers and their arch, on the crescent's middle ------------------
  const coral = shades(["#e8a08a", "#e39884", "#eca692"], 2, seed + 20);
  const coralDeep = C("#d0806c");
  const cream = C("#f4e2be");
  const goldA = C("#e0b85a");
  const arch = (a: number) => 30 + 8 * Math.sqrt(Math.max(0, 1 - (a / 6) ** 2));
  const atlTop = (a: number) => {
    const A = Math.abs(a);
    if (A < 6) return 50; // the bridge between the towers, under the crown
    if (A < 12) return 54;
    return 46 - Math.floor((A - 12) / 4) * 5;
  };
  for (let x = Math.round(CX - 32); x < Math.round(CX + 32); x++) {
    const a = x + 0.5 - CX;
    const A = Math.abs(a);
    const zb = Math.round(zOut(x + 0.5) + 3);
    const depth = A < 12 ? 12 : 10;
    const zf = zb + depth;
    const ht = atlTop(a);
    for (let z = zb; z < zf; z++)
      for (let y = 3; y < ht; y++) {
        const front = z === zf - 1,
          back = z === zb;
        // the great arch through the middle
        if (A < 6 && y < arch(a)) continue;
        let c: Paint = coral;
        const step = A >= 12 && ht - y <= 1;
        if (y === ht - 1 || step) c = cream;
        else if (front || back || A > 31) {
          const row = (y - 3) % 3;
          if (A < 12 && A >= 6) {
            // the towers: tall window bays between pilasters
            if (Math.floor(A) % 2 === 1 && Math.floor(A) < 11 && row !== 0) c = hash(x, y, z, seed + 60) < 0.35 ? lit : glass;
            else if (Math.floor(A) === 6 || Math.floor(A) === 11) c = coralDeep;
          } else if (A >= 12) {
            if (row === 1 && x % 2 === 0) c = hash(x, y, z, seed + 61) < 0.3 ? lit : glass;
            else if (row === 0) c = coralDeep;
          } else if (row === 1 && x % 2 === 0) c = hash(x, y, z, seed + 62) < 0.5 ? lit : glass;
        }
        m.set(x, y, z, c);
      }
    // the arch's gold rim on both faces
    if (A < 6) {
      const ay = Math.floor(arch(a));
      m.set(x, ay, zf - 1, goldA);
      m.set(x, ay, zb, goldA);
    }
  }
  // the arch's inner sides in gold at the springing
  {
    const zb = Math.round(zOut(CX) + 3);
    for (const s of [-1, 1]) m.box(s < 0 ? CX - 6 : CX + 5, 3, zb, s < 0 ? CX - 5 : CX + 6, 30, zb + 12, C("#f0c88a"));
  }
  // the crown above the bridge: stepped, then a finial; the towers' own stepped tops
  {
    const zb = Math.round(zOut(CX) + 3);
    m.box(CX - 8, 50, zb + 1, CX + 8, 54, zb + 11, coral);
    m.box(CX - 8, 53, zb + 1, CX + 8, 54, zb + 11, cream);
    m.box(CX - 6, 54, zb + 2, CX + 6, 58, zb + 10, coral);
    m.box(CX - 6, 57, zb + 2, CX + 6, 58, zb + 10, cream);
    m.box(CX - 4, 58, zb + 3, CX + 4, 62, zb + 9, coralDeep);
    m.box(CX - 2, 62, zb + 4, CX + 2, 65, zb + 8, goldA);
    m.box(CX - 1, 65, zb + 5, CX + 1, 70, zb + 7, goldA);
    m.box(CX - 1, 70, zb + 5, CX + 1, 71, zb + 7, E("#ffe6a0", 2.4));
    // the bridge's windows (the Royal Bridge Suite) on the front
    for (let x = CX - 5; x < CX + 5; x++) for (const y of [43, 46]) m.set(x, y, zb + 11, x % 2 ? lit : glass);
    // tower tops: two stepped lanterns
    for (const s of [-1, 1]) {
      const tx = CX + s * 9;
      m.box(Math.round(tx - 3), 54, zb + 2, Math.round(tx + 3), 57, zb + 10, coral);
      m.box(Math.round(tx - 3), 56, zb + 2, Math.round(tx + 3), 57, zb + 10, cream);
      m.box(Math.round(tx - 2), 57, zb + 3, Math.round(tx + 2), 60, zb + 9, coralDeep);
      m.box(Math.round(tx - 1), 60, zb + 4, Math.round(tx + 1), 64, zb + 8, goldA);
    }
    // the lobby podium and porte-cochère in front, the fountain court
    const pf = zb + 12;
    m.box(CX - 14, 3, pf, CX + 14, 9, pf + 4, (x, y, z) => (y === 8 ? cream : y > 3 && x % 3 === 0 ? glass : paintAt(coral, x, y, z)));
    m.box(CX - 6, 3, pf + 4, CX + 6, 4, pf + 8, pave);
    m.cylinder(CX, 3, pf + 7, 3, 1, pool);
    m.set(CX - 0.5, 4, pf + 7, E("#d8f6ff", 1.8));
    signs.push({ text: "ATLANTIS", color: "#ffd0a8", x: CX, y: 40, z: zb + 12.2, w: 9, h: 2, vertical: false, facing: "front" });
    lights.push([CX, 30, pf + 6, "#ffc8a0"]);
  }
  // Aquaventure: the ziggurat with its blue slides, the lazy-river pools, beside the hotel
  {
    const a = 0.72;
    const r = (RI(a) + RO) / 2;
    const zx = Math.round(CC.x + Math.sin(a) * r),
      zz = Math.round(CC.z - Math.cos(a) * r);
    const sandstone = shades(["#d8b884", "#ceae7a", "#e0c28e"], 1, seed + 70);
    for (let l = 0; l < 5; l++) m.box(zx - 5 + l, 3 + l * 3, zz - 5 + l, zx + 5 - l, 6 + l * 3, zz + 5 - l, sandstone);
    m.box(zx - 1, 18, zz - 1, zx + 1, 21, zz + 1, C("#b88a4a"));
    // slides spiralling down
    const slide = [C("#2f8fd8"), C("#e8a020"), C("#38c0a0")];
    for (let s = 0; s < 3; s++)
      for (let t = 0; t < 40; t++) {
        const ang = s * 2.1 + t * 0.16;
        const rr = 6 + t * 0.12;
        m.set(zx + Math.cos(ang) * rr, 19 - t * 0.42, zz + Math.sin(ang) * rr, slide[s]);
      }
    for (const [dx, dz] of [
      [-9, 3],
      [8, 4],
    ])
      m.box(zx + dx - 3, 2, zz + dz - 2, zx + dx + 3, 3, zz + dz + 2, pool);
    void poolEdge;
  }
  // the other side: the beach club, umbrellas in a row
  {
    const a = -0.72;
    const r = RI(a) + 3;
    for (let t = 0; t < 7; t++) {
      const aa = a - 0.05 + t * 0.022 * (t % 2 ? 1 : -1) - t * 0.03;
      const x = Math.round(CC.x + Math.sin(aa) * r),
        z = Math.round(CC.z - Math.cos(aa) * r);
      m.box(x, 2, z, x + 1, 5, z + 1, C("#efe6d2"));
      m.box(x - 1, 5, z - 1, x + 2, 6, z + 2, t % 2 ? C("#f4b728") : C("#f6f2ea"));
    }
  }
  // the monorail's last station at Atlantis
  {
    const z0 = Math.round(atlFront + 8);
    m.box(mx0 - 3, BEAM + 2, z0, mx0 + 6, BEAM + 3, z0 + 12, C("#f2ead8"));
    m.box(mx0 - 3, BEAM + 7, z0, mx0 + 6, BEAM + 8, z0 + 12, C("#f6f2ea"));
    m.box(mx0 - 3, BEAM + 6, z0, mx0 + 6, BEAM + 7, z0 + 1, goldA);
    for (const [px, pz] of [
      [mx0 - 3, z0],
      [mx0 + 5, z0],
      [mx0 - 3, z0 + 11],
      [mx0 + 5, z0 + 11],
    ])
      m.box(px, 3, pz, px + 1, BEAM + 7, pz + 1, C("#efe6d2"));
  }
  // a few yachts at anchor in the lagoon and the open sea
  for (let t = 0; t < 14; t++) {
    const x = 6 + rnd() * (W - 12),
      z = 6 + rnd() * (D - 30);
    const ang = rnd() * Math.PI * 2;
    if (waterFree(x, z, 4)) boat(x, z, Math.cos(ang), Math.sin(ang), t);
  }

  lights.push([CX, 12, DL - 8, "#ffe0b0"], [CX, 8, TZ0 + 6, "#d8f6ff"]);
  const zb = Math.round(zOut(CX) + 3);
  return {
    model: m,
    signs,
    door: [CX, DL],
    body: [0, 0, W, DL],
    walls: [],
    lights,
    scale: k,
    points: {
      atlantis: [CX, 50, zb + 6],
      crown: [CX, 4, TZ0 + 6],
      camPos: [CX + 150, 170, D + 120],
      camLook: [CX, 10, D / 2],
    },
  };
}
