import type { Built } from "../buildings";
import { C, E, G, hash, rand, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost, leafTree, planterBox } from "./needle";

type ShopKind = "fashion" | "sneakers" | "beauty" | "tech" | "toys" | "cafe";

/** A little car for the roof deck, along z. */
function car(m: VoxelModel, x: number, y: number, z: number, color: string) {
  const body = C(color);
  m.box(x, y + 1, z, x + 6, y + 3, z + 13, body);
  m.box(x + 1, y + 3, z + 3, x + 5, y + 5, z + 10, G("#2a3442"));
  m.box(x + 1, y + 5, z + 4, x + 5, y + 6, z + 9, body);
  for (const zz of [z + 2, z + 10]) {
    m.box(x - 0, y, zz, x + 1, y + 2, zz + 2, C("#1a1a1e"));
    m.box(x + 5, y, zz, x + 6, y + 2, zz + 2, C("#1a1a1e"));
  }
  m.box(x + 1, y + 2, z + 12, x + 2, y + 3, z + 13, E("#fff4d0", 1.2));
  m.box(x + 4, y + 2, z + 12, x + 5, y + 3, z + 13, E("#fff4d0", 1.2));
  m.box(x + 1, y + 2, z, x + 2, y + 3, z + 1, E("#ff3040", 1.2));
  m.box(x + 4, y + 2, z, x + 5, y + 3, z + 1, E("#ff3040", 1.2));
}

/**
 * ZK MALL: a Dubai Mall / Shibuya shopping centre on the avenue. Five levels; a street front of
 * six different shops (fashion, sneakers, beauty, electronics, toys, a café) either side of a
 * three-storey open glass portal where the escalators criss-cross the atrium; two giant LED screen
 * frames on the upper facade (left dark for the live layer); a curved glass barrel-vault roof over
 * the atrium; roof-deck parking with its ramp on the left, a cinema and a garden on the right; a
 * taxi drop-off canopy over the pavement.
 *
 * Points (model voxels, scale 2):
 *  - `entry0`: the main doors (atrium); `entry1`..`entry6`: the six shop doors, left to right.
 *  - `screenA`, `screenB`: centres of the two LED screen faces (front plane, z = face);
 *    `screenSize`: [w, h, 0] of each screen face in model voxels.
 *  - `taxi`: the drop-off point under the canopy, at the kerb.
 *  - `camPos` / `camLook`: a nice exterior viewpoint.
 */
export function mall(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 172;
  const m = new VoxelModel(W, H, D);
  const r = rand(seed);
  const fz = D - 16; // front face: first empty layer
  const bx0 = 6,
    bx1 = W - 6,
    bz0 = 6;
  const gh = 21,
    fh = 15,
    roofY = gh + fh * 4; // 81
  const mid = Math.round(W / 2);
  const ax0 = mid - 18,
    ax1 = mid + 18; // the atrium portal

  // ---- forecourt paving: light granite with a darker band and gold dots by the doors
  m.box(0, 0, 0, W, 1, D, shades(["#cdc8c0", "#c4bfb6", "#d4cfc6"], 2, seed));
  for (let x = 0; x < W; x++) for (let z = fz; z < D; z++) if ((z - fz) % 8 === 4 || (x % 12 === 0 && z > fz)) m.set(x, 0, z, C("#a8a298"));
  m.box(0, 0, D - 2, W, 1, D, C("#8a8680"));

  // ---- the volume
  const clad = shades(["#e4e0d8", "#dcd8d0", "#e8e4dc"], 2, seed + 1);
  m.box(bx0, 1, bz0, bx1, roofY, fz, clad);
  // horizontal floor bands and a dark reveal between each level, all round
  for (let f = 1; f <= 4; f++) {
    const y = gh + (f - 1) * fh;
    m.box(bx0 - 1, y - 1, bz0 - 1, bx1 + 1, y + 1, fz + 1, C("#b8b2a6"));
    m.box(bx0, y + 1, bz0, bx1, y + 2, fz, C("#4a4650"));
  }
  // side facades: louvred champagne panels with slit windows and a glass corner
  for (const sx of [bx0, bx1 - 1])
    for (let z = bz0 + 4; z < fz - 4; z++)
      for (let y = gh + 2; y < roofY - 1; y++) {
        const fy = (y - gh) % fh;
        if (fy < 2) continue;
        if ((z - bz0) % 12 < 2 && fy > 3 && fy < fh - 2) m.set(sx, y, z, hash(z, y >> 2, sx) > 0.6 ? E("#ffe0b0", 1) : G("#2a3442"));
        else if (y % 2 === 0) m.set(sx, y, z, C("#cfc6b4"));
      }
  for (const sx of [bx0, bx1 - 1])
    for (let z = fz - 10; z < fz; z++)
      for (let y = gh + 2; y < roofY - 1; y++) m.set(sx, y, z, (y - gh) % fh < 2 ? C("#b8b2a6") : z % 4 === 0 ? C("#9a96a0") : G("#5a7a96"));
  void 0;

  // ---- level 1: six shops either side of the portal
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];
  const points: NonNullable<Built["points"]> = {};
  const shopsL: [ShopKind, string, string][] = [
    ["fashion", "SHIELD&CO", "#f4e6c8"],
    ["sneakers", "zkWEAR", "#ff7a3a"],
    ["beauty", "ORCHARD MART", "#ff8ac8"],
  ];
  const shopsR: [ShopKind, string, string][] = [
    ["tech", "IRONWOOD TECH", "#5ac8ff"],
    ["toys", "SAPLING KIDS", "#7aff6a"],
    ["cafe", "HALO CAFÉ", "#ffc070"],
  ];
  const span = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => [Math.round(a + ((b - a) * i) / n), Math.round(a + ((b - a) * (i + 1)) / n)]);
  const slots: [number, number, [ShopKind, string, string]][] = [...span(bx0 + 2, ax0 - 2, 3).map((s, i) => [s[0], s[1], shopsL[i]] as [number, number, [ShopKind, string, string]]), ...span(ax1 + 2, bx1 - 2, 3).map((s, i) => [s[0], s[1], shopsR[i]] as [number, number, [ShopKind, string, string]])];
  slots.forEach(([x0, x1, def], i) => {
    const [kind, name, col] = def;
    shopfront(m, x0, x1, gh, fz, kind, seed + i * 11);
    const top = gh - 5;
    signs.push({ text: name, color: col, x: (x0 + x1) / 2, y: top + 2.5, z: fz + 1.1, w: x1 - x0 - 4, h: 3, vertical: false, facing: "front" });
    points[`entry${i + 1}`] = [Math.round((x0 + x1) / 2), 0, fz + 1];
    lights.push([(x0 + x1) / 2, 8, fz + 2, kind === "tech" ? "#9ad8ff" : kind === "beauty" ? "#ffb0d8" : "#ffd8a0"]);
  });
  // piers between the shops
  for (const [x0, x1] of slots) {
    m.box(x0 - 1, 1, fz - 1, x0, gh, fz + 1, C("#8a8478"));
    m.box(x1, 1, fz - 1, x1 + 1, gh, fz + 1, C("#8a8478"));
  }

  // ---- the atrium: an open three-storey portal; inside, floors, escalators, banners, skylight
  const iz0 = fz - 34;
  m.clear(ax0, 1, iz0, ax1, roofY, fz);
  // back wall: shop fronts of the upper levels, lit
  for (let y = 1; y < roofY; y++)
    for (let x = ax0; x < ax1; x++) {
      const fy = y < gh ? y : (y - gh) % fh;
      const lvl = y < gh ? 0 : 1 + Math.floor((y - gh) / fh);
      const bay = Math.floor((x - ax0) / 9);
      const sc = ["#ffe6c0", "#e8f4ff", "#ffd0e8", "#d8ffe0", "#fff0b0"][(bay + lvl) % 5];
      m.set(x, y, iz0 - 1, fy < 2 ? C("#d8d4cc") : fy > (y < gh ? gh - 6 : fh - 4) ? C(["#2a2630", "#7a2a3a", "#2a4a6a", "#3a5a3a"][(bay + lvl) % 4]) : (x - ax0) % 9 === 0 ? C("#8a8478") : E(sc, 0.95));
    }
  // floor slabs ringing the void, white edges, glass balustrades
  const vx0 = ax0 + 8,
    vx1 = ax1 - 8;
  for (let f = 1; f <= 3; f++) {
    const y = gh + (f - 1) * fh;
    m.box(ax0, y - 1, iz0, ax1, y + 1, fz, C("#e8e4dc"));
    m.clear(vx0, y - 1, iz0 + 6, vx1, y + 1, fz - 2);
    m.box(ax0, y - 2, fz - 1, ax1, y - 1, fz, E("#e8f6ff", 1.2));
    for (const x of [vx0 - 1, vx1]) m.box(x, y + 1, iz0 + 6, x + 1, y + 4, fz - 2, G("#cfe4f0"));
    m.box(vx0 - 1, y + 4, iz0 + 6, vx0, y + 5, fz - 2, C("#c8c4bc"));
    m.box(vx1, y + 4, iz0 + 6, vx1 + 1, y + 5, fz - 2, C("#c8c4bc"));
    // shoppers on the galleries
    for (let z = iz0 + 2; z < fz - 2; z += 3) for (const x of [ax0 + 2 + (f % 3), ax1 - 4 - (f % 2)]) if (hash(x, z, f) > 0.55) m.box(x, y + 1, z, x + 1, y + 5, z + 1, C(["#3a5a8a", "#9a3a3a", "#e0d0b0", "#2a2a30", "#f4b728"][Math.floor(hash(z, x, f) * 5)]));
  }
  // escalators criss-crossing the void, alternating direction, lit handrails
  const escalator = (xa: number, ya: number, xb: number, yb: number, z: number) => {
    const n = Math.abs(xb - xa);
    for (let s = 0; s <= n; s++) {
      const x = xa + Math.sign(xb - xa) * s;
      const y = Math.round(ya + ((yb - ya) * s) / n);
      m.box(x, y - 3, z, x + 1, y, z + 4, C("#b8bcc4"));
      m.box(x, y, z + 1, x + 1, y + 1, z + 3, C("#4a4a52"));
      m.box(x, y, z, x + 1, y + 3, z + 1, G("#d8eaf4"));
      m.box(x, y, z + 3, x + 1, y + 3, z + 4, G("#d8eaf4"));
      m.box(x, y + 3, z, x + 1, y + 4, z + 1, E("#9ad8ff", 1.3));
      m.box(x, y + 3, z + 3, x + 1, y + 4, z + 4, E("#9ad8ff", 1.3));
      if (s % 4 === 0 && hash(s, z, ya) > 0.5) m.box(x, y + 1, z + 1 + (s % 2), x + 1, y + 5, z + 2 + (s % 2), C(["#3a5a8a", "#9a3a3a", "#e0d0b0"][s % 3]));
    }
  };
  escalator(vx0, 1, vx1 - 1, gh, fz - 14);
  escalator(vx1 - 1, gh, vx0, gh + fh, fz - 9);
  escalator(vx0, gh + fh, vx1 - 1, gh + fh * 2, fz - 14);
  escalator(vx1 - 1, gh + fh * 2, vx0, gh + fh * 3, fz - 9);
  // hanging banners and a gold ZEC mobile in the void
  for (const [bx, c] of [
    [vx0 + 3, "#c0303a"],
    [vx1 - 4, "#2a5a9a"],
  ] as [number, string][])
    m.box(bx, roofY - 26, fz - 22, bx + 1, roofY - 4, fz - 18, C(c));
  m.cylinder(mid, roofY - 12, fz - 20, 4.5, 1, E("#f4b728", 2.2), true);
  m.box(mid, roofY - 11, fz - 20, mid + 1, roofY, fz - 19, C("#c8c4bc"));
  // ground floor of the atrium: marble, a fountain, info desk
  m.box(ax0, 0, iz0, ax1, 1, fz, (x, _y, z) => ((x + z) % 6 === 0 ? C("#b8b0a0") : C("#ece8e0")));
  m.cylinder(mid, 1, fz - 26, 5, 1, C("#d8d4cc"));
  m.cylinder(mid, 1, fz - 26, 4, 1, G("#3a9ac8"));
  m.box(mid, 1, fz - 26, mid + 1, 7, fz - 25, E("#e0f4ff", 1.1));
  // the portal: a grid of mullions, sliding doors at the bottom, lit soffits
  for (let y = 1; y < roofY; y++)
    for (let x = ax0; x < ax1; x++) {
      const mull = (x - ax0) % 6 === 0 || x === ax1 - 1;
      const transom = y === gh - 1 || (y > gh && (y - gh) % fh === 0) || (y > gh && (y - gh) % fh === 8);
      if (mull || transom) m.set(x, y, fz - 1, transom && (y - gh) % fh === 8 ? C("#8a9098") : C("#b8bcc4"));
    }
  for (const x of [ax0, ax1 - 1]) m.box(x - 1, 1, fz - 2, x + 2, roofY, fz + 1, C("#c8c2b6"));
  // automatic doors (glass leaves left half-open)
  for (let x = mid - 9; x < mid + 9; x += 6) {
    m.box(x + 1, 1, fz - 1, x + 3, 12, fz, G("#cfe4f0"));
    m.box(x, 12, fz - 1, x + 6, 13, fz + 1, C("#5a5664"));
  }
  points.entry0 = [mid, 0, fz + 1];

  // ---- the upper facade: two giant LED screen frames, champagne fins between
  const scr = (x0: number, x1: number) => {
    const y0 = gh + 6,
      y1 = roofY - 3;
    m.box(x0 - 2, y0 - 2, fz, x1 + 2, y1 + 2, fz + 2, C("#2a2830"));
    m.box(x0, y0, fz + 1, x1, y1, fz + 2, C("#0e0e14"));
    // bezel bolts, corner brackets and a small maker's badge
    for (let x = x0 - 1; x < x1 + 1; x += 6) {
      m.set(x, y0 - 1, fz + 2, C("#5a5664"));
      m.set(x, y1, fz + 2, C("#5a5664"));
    }
    for (const [qx, qy] of [
      [x0 - 2, y0 - 2],
      [x1 - 2, y0 - 2],
      [x0 - 2, y1 - 2],
      [x1 - 2, y1 - 2],
    ])
      m.box(qx, qy, fz + 2, qx + 4, qy + 4, fz + 3, C("#3a3742"));
    m.box(x1 - 9, y0 - 2, fz + 2, x1 - 3, y0 - 1, fz + 3, E("#f4b728", 1.2));
    // a pixel grid on the dark panel so it reads as LEDs even when off
    for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) m.set(x, y, fz + 1, C("#16161e"));
    // corner light strips and service catwalk under it
    m.box(x0 - 2, y0 - 3, fz, x1 + 2, y0 - 2, fz + 4, C("#4a4650"));
    m.box(x0 - 2, y0 - 3, fz + 3, x1 + 2, y0 - 2, fz + 4, E("#ff4ab8", 1.4));
    for (let x = x0 - 2; x < x1 + 2; x += 2) m.box(x, y0 - 2, fz + 3, x + 1, y0, fz + 4, C("#3a3742"));
    m.box(x0 - 2, y1 + 2, fz, x1 + 2, y1 + 3, fz + 3, E("#3ef0ff", 1.4));
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, z: fz + 2 };
  };
  // fins on the remaining facade
  for (let y = gh + 2; y < roofY; y++)
    for (let x = bx0 + 1; x < bx1 - 1; x++) {
      if (x >= ax0 - 1 && x <= ax1) continue;
      if (x % 4 === 0) m.set(x, y, fz, C("#d8d0bc"));
    }
  const sA = scr(bx0 + 8, ax0 - 8);
  points.screenA = [sA.cx, sA.cy, sA.z];
  points.screenSize = [sA.w, sA.h, 0];
  // the east facade: a gold ⓩ medallion on a lit champagne curtain wall (the second LED wall
  // went up to the roof crown, where the city's iso view sees it over the towers of the avenue)
  {
    const x0 = ax1 + 8,
      x1 = bx1 - 8,
      y0 = gh + 6,
      y1 = roofY - 3;
    m.box(x0 - 2, y0 - 2, fz, x1 + 2, y1 + 2, fz + 2, C("#2a2830"));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m.set(x, y, fz + 1, (x + y) % 4 === 0 ? E("#ffe2a8", 0.9) : G("#3a4a5a"));
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2,
      R = Math.min(x1 - x0, y1 - y0) / 2 - 3;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const dx = x + 0.5 - cx,
          dy = y + 0.5 - cy,
          d = Math.hypot(dx, dy);
        if (d > R) continue;
        // the Z: top bar, bottom bar, the diagonal, and the two ticks
        const u = dx / R,
          v = dy / R;
        const zed = (Math.abs(v - 0.42) < 0.11 && Math.abs(u) < 0.42) || (Math.abs(v + 0.42) < 0.11 && Math.abs(u) < 0.42) || (Math.abs(u - v * 0.95) < 0.14 && Math.abs(v) < 0.45) || (Math.abs(u) < 0.07 && Math.abs(v) > 0.5);
        m.set(x, y, fz + 2, d > R - 2.2 || !zed ? E("#f4b728", d > R - 2.2 ? 2 : 1.25) : C("#14121a"));
      }
  }

  // ---- roof: parapet with the name, the glass barrel vault over the atrium, parking, cinema, garden
  m.box(bx0, roofY, bz0, bx1, roofY + 1, fz, shades(["#5a5664", "#56525f", "#5e5a68"], 3, seed));
  m.box(bx0, roofY + 1, fz - 2, bx1, roofY + 4, fz, C("#d8d4cc"));
  m.box(bx0, roofY + 1, bz0, bx0 + 1, roofY + 3, fz, C("#d8d4cc"));
  m.box(bx1 - 1, roofY + 1, bz0, bx1, roofY + 3, fz, C("#d8d4cc"));
  m.box(bx0, roofY + 1, bz0, bx1, roofY + 3, bz0 + 1, C("#d8d4cc"));
  // the name board over the portal, then the vault behind it
  const nb0 = ax0 - 14,
    nb1 = ax1 + 14;
  m.box(nb0, roofY + 1, fz - 3, nb1, roofY + 14, fz - 1, C("#1a1820"));
  m.box(nb0 - 1, roofY + 14, fz - 3, nb1 + 1, roofY + 15, fz, E("#f4b728", 2.2));
  m.box(nb0 - 1, roofY, fz - 3, nb1 + 1, roofY + 1, fz, E("#f4b728", 2.2));
  signs.push({ text: "ZK MALL · ショッピング", color: "#f4b728", x: mid, y: roofY + 7.5, z: fz - 0.9, w: nb1 - nb0 - 2, h: 11, vertical: false, facing: "front" });
  const R = (ax1 - ax0) / 2 + 2;
  for (let z = iz0 - 2; z < fz - 4; z++)
    for (let y = roofY; y < roofY + R + 1; y++)
      for (let x = ax0 - 3; x < ax1 + 3; x++) {
        const d = Math.hypot(x + 0.5 - mid, (y - roofY) * 1.15);
        if (d > R || d < R - 1.3) continue;
        const rib = (z - iz0) % 6 === 0 || Math.floor(Math.atan2(y - roofY, x + 0.5 - mid) * 6) % 2 === 0 && Math.abs(d - R) < 0.3;
        m.set(x, y, z, rib || z === iz0 - 2 || z === fz - 5 ? C("#e8e8ec") : G("#a8cce0"));
      }
  m.box(ax0 - 3, roofY + 1, iz0 - 2, ax1 + 3, roofY + 2, fz - 4, 0);
  for (let z = iz0 - 2; z < fz - 4; z++) for (const x of [ax0 - 3, ax1 + 2]) m.set(x, roofY + 1, z, C("#c8c4bc"));
  // a light strip along the vault crown
  m.box(mid, roofY + Math.floor(R / 1.15), iz0 - 2, mid + 1, roofY + Math.floor(R / 1.15) + 1, fz - 4, E("#e8f6ff", 1.6));
  // left roof: parking deck, lines, cars, the ramp down at the back, lamp posts
  const py = roofY + 1;
  for (let x = bx0 + 4; x < ax0 - 6; x += 9) {
    m.box(x, roofY, bz0 + 6, x + 1, py, bz0 + 22, C("#e8e4d8"));
    m.box(x, roofY, fz - 26, x + 1, py, fz - 10, C("#e8e4d8"));
  }
  const carCols = ["#c03030", "#e8e8ea", "#2a2a30", "#3a6aa8", "#f4b728", "#7a8a90", "#e8e8ea"];
  for (let x = bx0 + 6, i = 0; x < ax0 - 12; x += 9, i++) {
    if (hash(i, 1, seed) > 0.25) car(m, x, py, bz0 + 8, carCols[i % carCols.length]);
    if (hash(i, 2, seed) > 0.3) car(m, x, py, fz - 24, carCols[(i + 3) % carCols.length]);
  }
  m.box(bx0 + 4, roofY, fz - 34, ax0 - 6, py, fz - 32, C("#e0c040"));
  for (let x = bx0 + 8; x < ax0 - 8; x += 10) m.box(x, roofY, fz - 33, x + 3, py, fz - 32, C("#f0f0f0"));
  // ramp: walls and the cut down into the building, with a P sign
  const rx0 = bx0 + 2,
    rx1 = bx0 + 14;
  m.box(rx0, roofY - 14, bz0 + 24, rx1, roofY + 1, fz - 36, 0);
  for (let z = bz0 + 24; z < fz - 36; z++) {
    const t = (z - bz0 - 24) / (fz - 36 - bz0 - 24);
    m.box(rx0, Math.round(roofY - t * 14), z, rx1, Math.round(roofY - t * 14) + 1, z + 1, C("#6a6672"));
  }
  m.box(rx0 - 1, roofY, bz0 + 24, rx0, roofY + 4, fz - 36, C("#d8d4cc"));
  m.box(rx1, roofY, bz0 + 24, rx1 + 1, roofY + 4, fz - 36, C("#d8d4cc"));
  m.box(rx1, roofY + 4, bz0 + 24, rx1 + 1, roofY + 5, fz - 36, E("#f4b728", 1.6));
  m.box(rx1 + 2, py, bz0 + 22, rx1 + 3, py + 16, bz0 + 23, C("#3a3742"));
  m.box(rx1 + 1, py + 12, bz0 + 22, rx1 + 8, py + 18, bz0 + 24, C("#2a5aa8"));
  signs.push({ text: "P", color: "#ffffff", x: rx1 + 4.5, y: py + 15, z: bz0 + 24.1, w: 5, h: 5, vertical: false, facing: "front" });
  for (const [lx, lz] of [
    [bx0 + 22, bz0 + 26],
    [ax0 - 12, bz0 + 26],
  ]) {
    const p = lampPost(m, lx, py, lz, k, "#e8f4ff", 5);
    lights.push([p[0], p[1], p[2], "#e8f4ff"]);
  }
  // right roof: the cinema box with its sign, and a roof garden in front of it
  const cx0 = ax1 + 8,
    cx1 = bx1 - 4;
  const cinemaZ1 = bz0 + 40;
  m.box(cx0, py, bz0 + 4, cx1, py + 22, cinemaZ1, shades(["#2a2632", "#26222e", "#2e2a36"], 2, seed + 3));
  m.box(cx0 - 1, py + 22, bz0 + 3, cx1 + 1, py + 23, cinemaZ1 + 1, C("#4a4656"));
  for (let x = cx0; x < cx1; x += 2) m.box(x, py, cinemaZ1, x + 1, py + 22, cinemaZ1 + 1, C("#3a3644"));
  const cb0 = cx0 + 6,
    cb1 = cx1 - 6;
  m.box(cb0 - 1, py + 7, cinemaZ1, cb1 + 1, py + 19, cinemaZ1 + 2, C("#7a1a2a"));
  m.box(cb0, py + 8, cinemaZ1 + 1, cb1, py + 18, cinemaZ1 + 2, C("#14121a"));
  for (let x = cb0 - 1; x <= cb1; x += 2) {
    m.set(x, py + 6, cinemaZ1 + 1, E("#ffe08a", 2));
    m.set(x, py + 19, cinemaZ1 + 1, E("#ffe08a", 2));
  }
  signs.push({ text: "ZK CINEMA 映画", color: "#ff4a6a", x: (cb0 + cb1) / 2, y: py + 13, z: cinemaZ1 + 2.1, w: cb1 - cb0 - 2, h: 8, vertical: false, facing: "front" });
  // cinema entrance kiosk and queue rail
  m.box(cx0 + 4, py, cinemaZ1, cx0 + 14, py + 6, cinemaZ1 + 4, E("#ffe6c0", 0.9));
  m.box(cx0 + 3, py + 6, cinemaZ1, cx0 + 15, py + 7, cinemaZ1 + 6, C("#7a1a2a"));
  // garden: lawn, paths, trees, benches, planters, a pergola
  const gz0 = cinemaZ1 + 8,
    gz1 = fz - 6;
  m.box(cx0, roofY, gz0, cx1, py, gz1, shades(["#4a8a3a", "#3f7f34", "#559640"], 1, seed + 5));
  m.box(cx0, roofY, gz0 + Math.floor((gz1 - gz0) / 2), cx1, py, gz0 + Math.floor((gz1 - gz0) / 2) + 3, C("#c8b89a"));
  for (let x = cx0 + 4; x < cx1 - 4; x += 12) leafTree(m, x, py, gz0 + 4, k, seed + x, 5);
  for (let x = cx0 + 10; x < cx1 - 4; x += 12) leafTree(m, x, py, gz1 - 5, k, seed + x * 3, 4.5, shades(["#d77aa8", "#e89ac0", "#c4628f"], 1, 7));
  for (let x = cx0 + 3; x < cx1 - 8; x += 14) bench(m, x, py, gz0 + Math.floor((gz1 - gz0) / 2) - 2, k);
  planterBox(m, cx0, py, gz1 - 2, cx1, gz1, seed + 9);
  // pergola with warm string lights
  for (let x = cx0 + 2; x < cx1 - 2; x += 8) m.box(x, py, gz0 - 4, x + 1, py + 9, gz0 - 3, P_wood());
  m.box(cx0 + 2, py + 9, gz0 - 5, cx1 - 2, py + 10, gz0 - 2, P_wood());
  for (let x = cx0 + 3; x < cx1 - 2; x += 2) m.set(x, py + 8, gz0 - 3, E(x % 4 ? "#ffd08a" : "#ff9a6a", 1.6));
  // roof plant behind the vault: AC units and a water tank
  for (let x = ax0 - 2; x < ax1 + 2; x += 10) {
    m.box(x, py, bz0 + 2, x + 7, py + 5, iz0 - 5, C("#c4c1ca"));
    m.box(x + 1, py + 5, bz0 + 3, x + 6, py + 6, iz0 - 6, C("#6e6a78"));
  }

  // ---- the roof crown: a giant LED wall on a steel truss over the back of the roof, the name in
  // gold on top. It stands over the avenue's towers, so the city's iso camera sees the mall by it.
  {
    const zb = bz0 + 1,
      x0 = mid - 28,
      x1 = mid + 28,
      y0 = roofY + 16,
      y1 = y0 + 49;
    const steel = C("#2a2830");
    for (const lx of [x0 - 6, x0 + 18, x1 - 20, x1 + 4]) {
      m.box(lx, roofY, zb, lx + 2, y1 + 22, zb + 2, steel);
      for (let y = roofY + 2; y < y0; y += 6) m.box(lx - 1, y, zb - 1, lx + 3, y + 1, zb + 3, C("#4a4650"));
    }
    // X bracing under the screen
    for (let t = 0; t <= 1; t += 1 / 48) {
      const y = Math.round(roofY + 2 + t * (y0 - roofY - 4));
      m.set(Math.round(x0 - 4 + t * (x1 - x0 + 8)), y, zb, steel);
      m.set(Math.round(x1 + 4 - t * (x1 - x0 + 8)), y, zb, steel);
    }
    m.box(x0 - 6, y0 - 4, zb - 1, x1 + 6, y0 - 2, zb + 4, C("#3a3742"));
    m.box(x0 - 6, y0 - 3, zb + 3, x1 + 6, y0 - 2, zb + 4, E("#ff4ab8", 1.6));
    m.box(x0 - 2, y0 - 2, zb, x1 + 2, y1 + 2, zb + 2, steel);
    m.box(x0, y0, zb + 1, x1, y1, zb + 2, C("#0e0e14"));
    for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) m.set(x, y, zb + 1, C("#16161e"));
    m.box(x0 - 2, y1 + 2, zb, x1 + 2, y1 + 3, zb + 3, E("#3ef0ff", 1.6));
    points.screenB = [(x0 + x1) / 2, (y0 + y1) / 2, zb + 2];
    // the name: a black board framed in gold light, the letters drawn by the city's sign layer
    const n0 = x0 - 8,
      n1 = x1 + 8,
      ny0 = y1 + 5,
      ny1 = ny0 + 20;
    m.box(n0, ny0, zb, n1, ny1, zb + 2, C("#14121a"));
    m.box(n0 - 1, ny0 - 1, zb, n1 + 1, ny0, zb + 3, E("#f4b728", 2.4));
    m.box(n0 - 1, ny1, zb, n1 + 1, ny1 + 1, zb + 3, E("#f4b728", 2.4));
    m.box(n0 - 1, ny0, zb, n0, ny1, zb + 3, E("#f4b728", 2.4));
    m.box(n1, ny0, zb, n1 + 1, ny1, zb + 3, E("#f4b728", 2.4));
    signs.push({ text: "ZK MALL", color: "#f4b728", x: mid, y: (ny0 + ny1) / 2, z: zb + 2.1, w: n1 - n0 - 6, h: 16, vertical: false, facing: "front" });
    // beacons on the truss tops
    for (const lx of [x0 - 6, x1 + 4]) m.box(lx, y1 + 22, zb, lx + 2, y1 + 24, zb + 2, E("#ff3040", 2));
    lights.push([mid, y0 - 6, zb + 8, "#ff9ad8"]);
  }
  // a gold light line round the whole roof edge: the mall's outline reads from far away
  m.box(bx0 - 1, roofY + 4, fz - 1, bx1 + 1, roofY + 5, fz + 1, E("#f4b728", 1.8));
  m.box(bx0 - 1, roofY + 3, bz0 - 1, bx0, roofY + 4, fz, E("#f4b728", 1.8));
  m.box(bx1, roofY + 3, bz0 - 1, bx1 + 1, roofY + 4, fz, E("#f4b728", 1.8));
  m.box(bx0, roofY + 3, bz0 - 1, bx1, roofY + 4, bz0, E("#f4b728", 1.8));

  // ---- taxi drop-off canopy over the pavement in front of the portal
  const tx0 = ax0 - 10,
    tx1 = ax1 + 10;
  const ty = gh - 2;
  m.box(tx0, ty, fz, tx1, ty + 2, D - 2, C("#eceae4"));
  m.box(tx0, ty + 2, fz, tx1, ty + 3, D - 2, C("#c8c4bc"));
  m.box(tx0, ty - 1, D - 3, tx1, ty, D - 2, E("#3ef0ff", 1.4));
  for (let x = tx0 + 3; x < tx1 - 2; x += 5) for (let z = fz + 3; z < D - 4; z += 5) m.set(x, ty - 1, z, E("#fff4d8", 1.8));
  for (const x of [tx0 + 1, tx1 - 2]) {
    m.box(x, 1, D - 5, x + 1, ty, D - 4, C("#9aa0aa"));
    m.box(x - 1, 1, D - 6, x + 2, 2, D - 3, C("#6a6672"));
  }
  // the drop-off: a yellow kerb line, a taxi sign, a queue rail
  m.box(tx0 + 4, 0, D - 2, tx1 - 4, 1, D, C("#e0c040"));
  m.box(tx1 - 8, 1, D - 4, tx1 - 7, 14, D - 3, C("#3a3742"));
  m.box(tx1 - 10, 14, D - 4, tx1 - 5, 17, D - 3, E("#ffd23a", 1.6));
  signs.push({ text: "TAXI", color: "#1a1a1a", x: tx1 - 7.5, y: 15.5, z: D - 2.9, w: 5, h: 3, vertical: false, facing: "front" });
  for (let z = fz + 3; z < D - 6; z += 2) m.box(tx1 - 14, 1, z, tx1 - 13, 4, z + 1, C("#c8a860"));
  m.box(tx1 - 14, 4, fz + 3, tx1 - 13, 5, D - 6, C("#8a2228"));
  points.taxi = [tx1 - 10, 0, D - 3];
  signs.push({ text: "ZK MALL", color: "#3ef0ff", x: mid, y: ty + 1, z: D - 1.9, w: 30, h: 2, vertical: false, facing: "front" });

  // ---- pavement: planters with trees, bollards, benches, lamps either side of the canopy
  for (const x of [bx0 + 4, tx0 - 22, tx1 + 14, bx1 - 18]) {
    planterBox(m, x, 1, D - 8, x + 8, D - 4, seed + x, true);
    leafTree(m, x + 4, 3, D - 6, k, seed + x, 5.5);
  }
  for (const x of [tx0 - 6, tx1 + 4]) {
    const p = lampPost(m, x, 1, D - 4, k, "#ffd08a");
    lights.push([p[0], p[1], p[2], "#ffd08a"]);
  }
  for (let x = 2; x < W - 2; x += 6) if (x < tx0 - 2 || x > tx1 + 2) if (hash(x, 3, seed) > 0.3) m.box(x, 1, D - 2, x + 1, 4, D - 1, C("#3a3742"));
  bench(m, tx0 - 16, 1, D - 7, k);
  bench(m, tx1 + 24, 1, D - 7, k);
  lights.push([mid, ty - 2, fz + 6, "#fff0d8"]);
  lights.push([mid, gh + fh, fz - 10, "#e8f4ff"]);
  void r;

  points.camPos = [mid + 40, 120, D + 160];
  points.camLook = [mid, 40, fz];

  return {
    model: m,
    signs,
    door: [mid, fz + 1],
    body: [0, 0, W, D],
    walls: [
      [bx0, bz0, ax0, fz],
      [ax1, bz0, bx1, fz],
      [ax0, bz0, ax1, iz0],
    ],
    lights,
    scale: k,
    points,
  };
}

function P_wood(): Paint {
  return shades(["#8a6440", "#7e5a38", "#956c46"], 1, 4);
}

/** A shop at street level between x0 and x1, each trade with its own display and canopy. */
function shopfront(m: VoxelModel, x0: number, x1: number, gh: number, fz: number, kind: ShopKind, seed: number) {
  const r = rand(seed);
  const top = gh - 5;
  const depth = 12;
  const back = fz - depth;
  const tone: Record<ShopKind, string[]> = {
    fashion: ["#fff2dc", "#f4e6cc"],
    sneakers: ["#f0f0f0", "#ffffff"],
    beauty: ["#ffd8ec", "#ffe6f2"],
    tech: ["#dceeff", "#e8f4ff"],
    toys: ["#fff0a0", "#fff6c8"],
    cafe: ["#ffd8a0", "#ffcf8a"],
  };
  m.clear(x0, 1, back, x1, top, fz);
  m.box(x0, 1, back - 1, x1, top, back, E(tone[kind][0], 0.95));
  m.box(x0, top - 1, back, x1, top, fz, E(tone[kind][1], 1.0));
  m.box(x0 - 1, 1, back, x0, top, fz, E(tone[kind][0], 0.85));
  m.box(x1, 1, back, x1 + 1, top, fz, E(tone[kind][0], 0.85));
  const floorC = kind === "cafe" ? shades(["#8a6440", "#7e5a38"], 1, 4) : kind === "tech" ? C("#d8dce4") : C("#ece8e0");
  m.box(x0, 0, back, x1, 1, fz, floorC);
  const w = x1 - x0;
  const mx = Math.round((x0 + x1) / 2);
  const pal = ["#e05a5a", "#5ab0e0", "#e0c05a", "#7ad07a", "#e08ac0", "#f0f0f0", "#a07ae0", "#f09a4a", "#2a2a30"];
  if (kind === "fashion") {
    // mannequins on plinths and a clothes rail along the back
    for (let i = 0; i < 3; i++) {
      const x = x0 + 3 + Math.round(((w - 6) * i) / 2);
      const z = fz - 4;
      const cloth = C(["#1a1a1e", "#c8a860", "#8a2228"][i]);
      m.box(x - 1, 1, z - 1, x + 2, 2, z + 2, C("#2a2630"));
      m.box(x, 2, z, x + 1, 5, z + 1, C("#d8d4cc"));
      m.box(x - 1, 5, z, x + 2, 10, z + 1, cloth);
      m.box(x, 10, z, x + 1, 11, z + 1, C("#e8dccb"));
      m.set(x, 11, z, C("#2a2630"));
    }
    m.box(x0 + 1, 11, back + 1, x1 - 1, 12, back + 2, C("#8a8478"));
    for (let x = x0 + 1; x < x1 - 1; x++) if (hash(x, 1, seed) > 0.3) m.box(x, 6, back, x + 1, 11, back + 1, C(pal[Math.floor(hash(x, 2, seed) * pal.length)]));
  } else if (kind === "sneakers") {
    // a wall of shoes on lit shelves, a hero sneaker on a turntable
    for (let y = 3; y < top - 2; y += 3) {
      m.box(x0, y, back, x1, y + 1, back + 2, C("#d8d4cc"));
      for (let x = x0 + 1; x < x1 - 1; x += 2) if (hash(x, y, seed) > 0.2) m.box(x, y + 1, back, x + 1, y + 2, back + 2, C(pal[Math.floor(hash(x, y, seed, 3) * pal.length)]));
    }
    m.cylinder(mx, 1, fz - 5, 3, 3, C("#1a1a1e"));
    m.box(mx - 2, 4, fz - 6, mx + 3, 6, fz - 4, C("#f4f4f4"));
    m.box(mx - 2, 4, fz - 6, mx + 3, 5, fz - 4, C("#ff7a3a"));
    m.box(mx + 1, 6, fz - 6, mx + 3, 7, fz - 4, C("#f4f4f4"));
  } else if (kind === "beauty") {
    // pink-lit shelves of little bottles, round mirrors, a white counter
    for (let y = 3; y < top - 2; y += 3) {
      m.box(x0, y, back, x1, y + 1, back + 2, C("#f4e8ee"));
      for (let x = x0 + 1; x < x1 - 1; x++) if (hash(x, y, seed) > 0.4) m.set(x, y + 1, back + 1, C(["#ff8ac8", "#ffffff", "#c060e0", "#f0c040", "#e05a8a"][Math.floor(hash(x, y, seed, 5) * 5)]));
    }
    for (const x of [x0 + 3, x1 - 5]) {
      m.box(x, 6, back + 1, x + 3, 10, back + 2, E("#fff4fa", 1.4));
    }
    m.box(mx - 4, 1, fz - 6, mx + 4, 5, fz - 4, C("#f4f0f2"));
    m.box(mx - 4, 5, fz - 6, mx + 4, 6, fz - 4, C("#ff8ac8"));
  } else if (kind === "tech") {
    // a wall of screens and tables of phones and laptops
    for (let y = 3; y < top - 1; y += 4)
      for (let x = x0 + 1; x < x1 - 1; x += 5) {
        m.box(x, y, back, x + 4, y + 3, back + 1, C("#14141a"));
        m.box(x, y, back + 1, x + 4, y + 3, back + 2, E(["#3a8aff", "#3ef0ff", "#a07aff", "#ff4ab8", "#f4b728"][Math.floor(hash(x, y, seed) * 5)], 1.3));
      }
    for (const z of [fz - 5, fz - 9]) {
      m.box(x0 + 3, 1, z, x1 - 3, 4, z + 2, C("#e8e8ec"));
      for (let x = x0 + 4; x < x1 - 4; x += 3) m.set(x, 4, z, E("#bfe0ff", 1.1));
    }
  } else if (kind === "toys") {
    // stacked blocks, a big plush zebra, balloons under the ceiling
    for (let i = 0; i < 10; i++) {
      const x = x0 + 1 + Math.floor(r() * (w - 3)),
        z = back + 1 + Math.floor(r() * 4);
      const h = 1 + Math.floor(r() * 3);
      for (let y = 1; y < 1 + h * 2; y += 2) m.box(x, y, z, x + 2, y + 2, z + 2, C(pal[Math.floor(r() * 5)]));
    }
    const zx = mx - 3,
      zz = fz - 7;
    for (let x = zx; x < zx + 7; x++) m.box(x, 4, zz, x + 1, 8, zz + 3, x % 2 ? C("#1a1a1e") : C("#f4f4f4"));
    for (const lx of [zx, zx + 5]) for (const lz of [zz, zz + 2]) m.box(lx, 1, lz, lx + 1, 4, lz + 1, lx % 2 ? C("#1a1a1e") : C("#f4f4f4"));
    m.box(zx + 6, 7, zz, zx + 9, 11, zz + 3, C("#f4f4f4"));
    m.box(zx + 7, 10, zz, zx + 9, 11, zz + 3, C("#1a1a1e"));
    m.box(zx + 6, 11, zz + 1, zx + 7, 12, zz + 2, C("#1a1a1e"));
    for (let i = 0; i < 6; i++) m.blob(x0 + 2 + r() * (w - 4), top - 3, back + 2 + r() * 6, 1.3, C(pal[i % 7]), 0, i);
  } else {
    // café: wood counter, espresso machine, pendant lamps; tables on the pavement
    m.box(x0 + 2, 1, back + 1, x1 - 2, 6, back + 4, P_wood());
    m.box(x0 + 3, 6, back + 1, x0 + 7, 9, back + 3, C("#c8c4bc"));
    for (let y = 8; y < top - 2; y += 3) m.box(x0 + 1, y, back, x1 - 1, y + 1, back + 1, P_wood());
    for (let x = x0 + 4; x < x1 - 3; x += 5) {
      m.box(x, top - 4, fz - 6, x + 1, top - 1, fz - 5, C("#2a2630"));
      m.box(x - 1, top - 5, fz - 7, x + 2, top - 4, fz - 4, E("#ffc070", 1.6));
    }
    for (let x = x0 + 2; x < x1 - 4; x += 8) {
      m.box(x + 1, 1, fz + 4, x + 2, 4, fz + 5, C("#2a2630"));
      m.box(x, 4, fz + 3, x + 3, 5, fz + 6, C("#e8e4dc"));
      m.box(x - 2, 1, fz + 4, x - 1, 3, fz + 5, C("#2a2630"));
      m.box(x + 4, 1, fz + 4, x + 5, 3, fz + 5, C("#2a2630"));
    }
  }
  // the window line: kick plate, slim mullions, transom, a door in the middle
  const doorX = mx - 3;
  for (let x = x0; x < x1; x++) if (x < doorX || x >= doorX + 6) m.box(x, 1, fz - 1, x + 1, 2, fz, C("#3a3742"));
  for (let x = x0; x <= x1; x += 7) if (x < doorX - 1 || x > doorX + 6) m.box(x, 1, fz - 1, x + 1, top, fz, C("#2a2630"));
  m.box(doorX - 1, 1, fz - 1, doorX, top, fz, C("#2a2630"));
  m.box(doorX + 6, 1, fz - 1, doorX + 7, top, fz, C("#2a2630"));
  m.box(x0, top - 1, fz - 1, x1, top, fz, C("#2a2630"));
  // fascia and the trade's canopy
  const fascia: Record<ShopKind, string> = { fashion: "#1a1820", sneakers: "#2a2630", beauty: "#f4e8ee", tech: "#14202e", toys: "#2a5a9a", cafe: "#2f4a2e" };
  m.box(x0 - 1, top, fz - 1, x1 + 1, gh, fz + 1, C(fascia[kind]));
  if (kind === "toys") {
    const stripes = ["#e05a5a", "#f0c040", "#5ab0e0", "#7ad07a"];
    for (let kk = 0; kk < 4; kk++) m.box(x0 - 1, top - 1 - (kk >> 1), fz + 1 + kk, x1 + 1, top - (kk >> 1), fz + 2 + kk, (x) => C(stripes[Math.floor(x / 3) % 4]));
  } else if (kind === "cafe") {
    for (let kk = 0; kk < 5; kk++) m.box(x0 - 1, top - 1 - (kk >> 1), fz + 1 + kk, x1 + 1, top - (kk >> 1), fz + 2 + kk, (x) => (Math.floor(x / 3) % 2 ? C("#2f5a3e") : C("#e8e0d0")));
  } else if (kind === "beauty") {
    m.box(x0 - 1, top - 1, fz + 1, x1 + 1, top, fz + 4, C("#ffb0d8"));
    for (let x = x0 - 1; x < x1 + 1; x += 2) m.set(x, top - 2, fz + 3, C("#ffb0d8"));
  } else {
    const can = kind === "sneakers" ? C("#ff7a3a") : kind === "tech" ? C("#2a4a7a") : C("#1a1820");
    m.box(x0 - 1, top - 1, fz + 1, x1 + 1, top, fz + 4, can);
    m.box(x0 - 1, top - 2, fz + 3, x1 + 1, top - 1, fz + 4, kind === "tech" ? E("#5ac8ff", 1.4) : kind === "sneakers" ? E("#ffd0a0", 1.2) : E("#f4e6c8", 1.2));
  }
}
