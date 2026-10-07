import type { Built } from "../buildings";
import { C, E, G, hash, rand, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost, leafTree, palm } from "./needle";

/**
 * GARDENS BY THE BAY: a grove of Supertrees between two glass conservatories. Each Supertree is a
 * funnel of purple steel lattice wrapped in a vertical garden (ferns, bromeliads, flowers) under a
 * flared crown of radial ribs whose rim lights up purple or teal at night; a skyway walk hangs
 * between the two tallest. On the left the low Flower Dome (terraced flower beds and olive trees),
 * on the right the taller Cloud Forest (a green mountain with a waterfall and a lit cloud walk).
 * Lawns, paths, flower beds, a dragonfly pond, benches and lamps round them.
 *
 * Points (model voxels, scale 2):
 *  - `tree0`..`tree6`: centre of each Supertree crown (top of the canopy), for the light show.
 *  - `skyway0`, `skyway1`: the two ends of the skyway walk (deck surface, at each trunk).
 *  - `flowerDome`, `cloudForest`: centres of the two domes at ground level (entrances in front).
 *  - `waterfall`: top of the Cloud Forest waterfall.
 *  - `camPos` / `camLook`: a nice exterior viewpoint.
 */
export function gardens(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 92;
  const m = new VoxelModel(W, H, D);
  const r = rand(seed);
  const lights: Built["lights"] = [];
  const points: NonNullable<Built["points"]> = {};

  // ---- ground: lawns with mown stripes, a paved promenade in front, curving paths
  const lawn: Paint = (x, _y, z) => (Math.floor((x + z) / 6) % 2 ? C("#5a9a42") : C("#4f8f3a"));
  m.box(0, 0, 0, W, 1, D, lawn);
  m.box(0, 0, D - 9, W, 1, D, shades(["#d0cabe", "#c8c2b6", "#d6d0c4"], 2, seed));
  for (let x = 0; x < W; x += 8) m.box(x, 0, D - 9, x + 1, 1, D, C("#a8a294"));
  // a meandering path through the grove
  for (let x = 70; x < 210; x++) {
    const zc = Math.round(36 + Math.sin(x * 0.05) * 10);
    m.box(x, 0, zc - 2, x + 1, 1, zc + 3, C("#c8b89a"));
    m.set(x, 0, zc - 3, C("#8a7a60"));
    m.set(x, 0, zc + 3, C("#8a7a60"));
  }
  // flower beds in waves along the promenade
  const flowerCols = ["#e05a8a", "#f0c040", "#f4f4f4", "#c060e0", "#ff7a4a", "#ff4a6a"];
  for (let x = 4; x < W - 4; x++)
    for (let z = D - 14; z < D - 10; z++) {
      const band = Math.floor((x + Math.sin(z) * 3) / 9) % flowerCols.length;
      if (hash(x >> 1, z >> 1, seed) > 0.25) m.set(x, 1, z, C(flowerCols[band]));
      else m.set(x, 1, z, C("#3d7a3a"));
    }

  // ---- glass conservatories
  const dome = (cx: number, cz: number, rx: number, rz: number, h: number) => {
    const rib = C("#eef0f2"),
      glass = G("#cfe6ee"),
      glass2 = G("#b8d8e4");
    for (let y = 1; y < h + 1; y++)
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = x + 0.5 - cx,
            dz = z + 0.5 - cz;
          const e = (dx / rx) ** 2 + (dz / rz) ** 2 + (y / h) ** 2;
          const ei = (dx / (rx - 1.4)) ** 2 + (dz / (rz - 1.4)) ** 2 + (y / (h - 1.4)) ** 2;
          if (e > 1 || ei < 1) continue;
          const a = Math.atan2(dz, dx);
          const mer = Math.abs(((a / (Math.PI * 2)) * 28 + 64) % 1 - 0.5) > 0.44;
          const diag = false;
          const ring = y % 7 === 0;
          const open = dz > rz * 0.35 && y < h * 0.38;
          if (ring && y > 1) m.set(x, y, z, E("#d8f0ff", 0.85));
          else if (mer || y === 1) m.set(x, y, z, rib);
          else if (open) continue;
          else m.set(x, y, z, diag ? rib : Math.floor(y / 7) % 2 ? glass2 : glass);
        }
    // a lit base ring
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      m.set(cx + Math.cos(a) * (rx + 1), 1, cz + Math.sin(a) * (rz + 1), i % 4 ? C("#d8d4cc") : E("#9ad8ff", 1.6));
    }
  };

  // Flower Dome (left): terraces of flowers, olive trees, a lawn of tulips
  const f = { cx: 40, cz: 30, rx: 34, rz: 24, h: 34 };
  for (let ring = 0; ring < 3; ring++) {
    const rr = 0.85 - ring * 0.25;
    for (let z = Math.floor(f.cz - f.rz * rr); z < f.cz + f.rz * rr; z++)
      for (let x = Math.floor(f.cx - f.rx * rr); x < f.cx + f.rx * rr; x++) {
        const e = ((x - f.cx) / (f.rx * rr)) ** 2 + ((z - f.cz) / (f.rz * rr)) ** 2;
        if (e > 1) continue;
        m.set(x, 1 + ring * 2, z, e > 0.8 ? C("#b8b0a0") : C("#3a2a20"));
        m.set(x, 2 + ring * 2, z, e > 0.8 ? C("#d8d0c0") : hash(x, z, ring) > 0.35 ? C(flowerCols[Math.floor(hash(z, x, ring) * flowerCols.length)]) : C("#3d7a3a"));
      }
  }
  for (const [tx, tz] of [
    [24, 26],
    [56, 24],
    [40, 18],
  ])
    leafTree(m, tx, 6, tz, k, seed + tx, 6, shades(["#7a8a5a", "#6a7a4a", "#8a9a6a"], 1, tx));
  leafTree(m, 40, 6, 32, k, seed + 99, 8, shades(["#4a8a3a", "#3f7f34"], 1, 3));
  dome(f.cx, f.cz, f.rx, f.rz, f.h);
  points.flowerDome = [f.cx, 1, f.cz];

  // Cloud Forest (right): a green mountain with a waterfall and a ring walk inside a taller dome
  const cf = { cx: W - 40, cz: 30, rx: 32, rz: 24, h: 50 };
  const mtnH = 44;
  for (let y = 1; y < mtnH; y++) {
    const rr = 13 - (y / mtnH) * 8;
    for (let z = Math.floor(cf.cz - rr); z <= cf.cz + rr; z++)
      for (let x = Math.floor(cf.cx - rr); x <= cf.cx + rr; x++) {
        const d = Math.hypot(x + 0.5 - cf.cx, z + 0.5 - cf.cz);
        if (d > rr * (0.9 + 0.1 * hash(x, y >> 2, z))) continue;
        const h = hash(x, y, z, 7);
        m.set(x, y, z, h > 0.86 ? C("#7a7a80") : h > 0.8 ? C(flowerCols[Math.floor(h * 60) % flowerCols.length]) : h > 0.4 ? C("#2f6b3c") : C("#3d8a4a"));
      }
  }
  // the waterfall on its front face into a pool, mist at the bottom
  const wfz = Math.round(cf.cz + 9);
  for (let y = 2; y < mtnH - 6; y++) {
    const rr = 13 - (y / mtnH) * 8;
    const z = Math.round(cf.cz + rr * 0.92);
    m.box(cf.cx - 2, y, z, cf.cx + 2, y + 1, z + 1, (x) => (hash(x, y, 3) > 0.3 ? E("#e8f8ff", 1.05) : E("#9ad8ff", 1.0)));
  }
  m.cylinder(cf.cx, 1, wfz + 6, 6, 1, G("#3a9ac8"));
  for (let i = 0; i < 30; i++) m.set(cf.cx - 4 + r() * 8, 2 + r() * 3, wfz + 3 + r() * 6, E("#e8f8ff", 0.8));
  points.waterfall = [cf.cx, mtnH - 6, Math.round(cf.cz + 13 - ((mtnH - 6) / mtnH) * 8)];
  // cloud walk: a ring bridge round the mountain, lit underneath
  for (let i = 0; i < 220; i++) {
    const a = (i / 220) * Math.PI * 2;
    for (let w = 0; w < 3; w++) {
      const x = cf.cx + Math.cos(a) * (14 + w),
        z = cf.cz + Math.sin(a) * (14 + w);
      m.set(x, 26, z, C("#5a5664"));
      m.set(x, 25, z, w === 1 ? E("#3ef0d0", 1.6) : C("#3a3742"));
      if (w === 2) m.set(x, 27, z, G("#d8ecf4"));
    }
  }
  dome(cf.cx, cf.cz, cf.rx, cf.rz, cf.h);
  points.cloudForest = [cf.cx, 1, cf.cz];

  // ---- the Supertree grove
  const trees: [number, number, number, number, string][] = [
    // x, z, height, crown radius, night colour
    [92, 22, 54, 12, "#c060ff"],
    [118, 44, 40, 9, "#3ef0d0"],
    [140, 20, 75, 15, "#ff4ab8"],
    [164, 44, 46, 10, "#c060ff"],
    [186, 22, 66, 13, "#3ef0d0"],
    [104, 54, 30, 7, "#ff4ab8"],
    [176, 56, 34, 8, "#c060ff"],
  ];
  const trunkC = C("#3e2236"),
    lattice = C("#6e2a5e"),
    latticeHi = C("#8e3a76");
  const greens = ["#2f6b3c", "#3d8a4a", "#3d8a4a"];
  trees.forEach(([tx, tz, th, cr, glow], ti) => {
    const r0 = 3.2;
    const glowLine = E(glow, 0.9);
    const crownStart = Math.round(th * 0.74);
    const rAt = (h: number) => r0 + (cr * 0.55 - r0) * Math.pow(Math.min(1, h / crownStart), 2.6);
    // footing: a planted ring with uplights
    m.cylinder(tx, 1, tz, r0 + 3, 1, C("#8a8478"));
    m.cylinder(tx, 1, tz, r0 + 2, 1, shades(["#2f6b3c", "#3d8a4a", "#e05a8a"], 1, ti));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      m.set(tx + Math.cos(a) * (r0 + 2.4), 2, tz + Math.sin(a) * (r0 + 2.4), E(glow, 1.8));
    }
    // the trunk: a funnel shell of steel lattice with a vertical garden in its cells
    for (let h = 1; h < crownStart; h++) {
      const rr = rAt(h);
      for (let z = Math.floor(tz - rr - 1); z <= Math.ceil(tz + rr + 1); z++)
        for (let x = Math.floor(tx - rr - 1); x <= Math.ceil(tx + rr + 1); x++) {
          const d = Math.hypot(x + 0.5 - tx, z + 0.5 - tz);
          if (d > rr) continue;
          if (d < rr - 1.6) {
            if (d < rr - 2.8) continue;
            m.set(x, h, z, trunkC);
            continue;
          }
          const a = Math.atan2(z + 0.5 - tz, x + 0.5 - tx);
          const ai = Math.round(((a + Math.PI) / (Math.PI * 2)) * 16);
          const lat = (ai + Math.floor(h / 2)) % 4 === 0 || (ai - Math.floor(h / 2) + 400) % 4 === 0;
          const hh = hash(x >> 1, h >> 1, z >> 1, ti);
          m.set(x, h, z, lat ? (h % 6 === 0 ? glowLine : lattice) : hh > 0.93 ? C(flowerCols[Math.floor(hh * 97) % flowerCols.length]) : hh > 0.12 ? C(greens[Math.floor(hh * 7) % greens.length]) : trunkC);
          // ferns spilling out of the garden here and there
          if (!lat && hh > 0.86 && hh < 0.9 && h % 2 === 0) m.set(tx + (x + 0.5 - tx) * ((rr + 1) / d) - 0.5, h, tz + (z + 0.5 - tz) * ((rr + 1) / d) - 0.5, C("#4a9a52"));
        }
    }
    // the crown: an inverted umbrella of radial ribs, rings and a lit rim
    const ribs = 14;
    for (let h = crownStart; h <= th; h++) {
      const t = (h - crownStart) / (th - crownStart);
      const rr = cr * 0.55 + (cr - cr * 0.55) * Math.sqrt(t);
      for (let i = 0; i < ribs; i++) {
        const a = (i / ribs) * Math.PI * 2 + ti;
        const steps = Math.ceil(rr * 1.4);
        for (let s = 0; s <= steps; s++) {
          const rad = (s / steps) * rr;
          if (rad < rr - 1.2 && h !== crownStart) continue;
          m.set(tx + Math.cos(a) * rad, h, tz + Math.sin(a) * rad, (h - crownStart) % 5 === 4 ? glowLine : lattice);
        }
      }
      // horizontal rings
      if (h === th || h === crownStart + Math.round((th - crownStart) / 2))
        for (let i = 0; i < 120; i++) {
          const a = (i / 120) * Math.PI * 2;
          m.set(tx + Math.cos(a) * rr, h, tz + Math.sin(a) * rr, h === th ? (i % 3 === 0 ? E(glow, 2.4) : latticeHi) : lattice);
        }
    }
    // the core continues up to a cap, with lights hung under the crown
    m.cylinder(tx, crownStart, tz, r0 * 0.9, th - crownStart + 1, trunkC);
    m.cylinder(tx, th, tz, r0 + 1, 1, C("#7a3a6a"));
    for (let i = 0; i < ribs; i++) {
      const a = (i / ribs) * Math.PI * 2 + ti;
      for (let s = 0.4; s < 1; s += 0.3) m.set(tx + Math.cos(a) * cr * s, th - 1 - Math.round(s * 2), tz + Math.sin(a) * cr * s, E(i % 2 ? glow : "#fff0d0", 2));
    }
    points[`tree${ti}`] = [tx, th, tz];
  });

  // ---- the skyway between the two tallest trees, with suspension cables
  const [a, b] = [trees[2], trees[4]];
  const sy = 44;
  const ra = 3.2 + (a[3] * 0.55 - 3.2) * Math.pow(Math.min(1, sy / Math.round(a[2] * 0.74)), 2.6);
  const rb = 3.2 + (b[3] * 0.55 - 3.2) * Math.pow(Math.min(1, sy / Math.round(b[2] * 0.74)), 2.6);
  const sx0 = Math.round(a[0] + ra),
    sx1 = Math.round(b[0] - rb);
  for (let x = sx0 - 1; x <= sx1 + 1; x++) {
    const t = (x - sx0) / (sx1 - sx0);
    const zc = a[1] + (b[1] - a[1]) * t;
    const sag = Math.round(Math.sin(t * Math.PI) * 1.5);
    const yy = sy - sag;
    m.box(x, yy, zc - 2, x + 1, yy + 1, zc + 3, C("#6a6672"));
    m.set(x, yy - 1, zc + 0.5, E("#3ef0d0", 1.6));
    m.box(x, yy + 1, zc - 2, x + 1, yy + 4, zc - 1, x % 3 ? G("#d8ecf4") : C("#9a3a7a"));
    m.box(x, yy + 1, zc + 2, x + 1, yy + 4, zc + 3, x % 3 ? G("#d8ecf4") : C("#9a3a7a"));
    m.set(x, yy + 4, zc - 2, C("#c05a9a"));
    m.set(x, yy + 4, zc + 2, C("#c05a9a"));
    if (hash(x, 3, seed) > 0.85) m.box(x, yy + 1, zc, x + 1, yy + 5, zc + 1, C(["#3a5a8a", "#9a3a3a", "#e0d0b0", "#f4b728"][x % 4]));
  }
  points.skyway0 = [sx0, sy + 1, a[1] + 0.5];
  points.skyway1 = [sx1, sy + 1, b[1] + 0.5];

  // ---- dragonfly pond in front of the grove, with bronze dragonfly statues
  const pcx = 140,
    pcz = 46,
    prx = 26,
    prz = 7;
  for (let z = pcz - prz - 1; z <= pcz + prz + 1; z++)
    for (let x = pcx - prx - 1; x <= pcx + prx + 1; x++) {
      const e = ((x - pcx) / prx) ** 2 + ((z - pcz) / prz) ** 2;
      if (e <= 1) m.set(x, 0, z, hash(x >> 1, z >> 1, 2) > 0.85 ? G("#5ab8d8") : G("#2e7aa0"));
      else if (e < 1.25) m.set(x, 1, z, C("#b8b0a0"));
    }
  for (let i = 0; i < 9; i++) m.set(pcx - prx + 4 + r() * prx * 1.8, 1, pcz - 4 + r() * 8, C(i % 2 ? "#3d8a4a" : "#f4c8d8"));
  const dragonfly = (x: number, z: number, h: number, dir: number) => {
    const bronze = C("#8a6a3a"),
      wing = G("#a8d8e0");
    m.box(x, 1, z, x + 1, h, z + 1, C("#5a4a3a"));
    for (let s = -4; s <= 4; s++) m.set(x + s * dir, h, z, bronze);
    m.set(x + 5 * dir, h, z, E("#3ef0d0", 1.6));
    for (const [wo, wl] of [
      [2, 6],
      [-1, 5],
    ])
      for (let w = 1; w <= wl; w++) {
        m.set(x + wo * dir, h + 1, z + w, wing);
        m.set(x + wo * dir, h + 1, z - w, wing);
        m.set(x + (wo + 1) * dir, h + 1, z + w, wing);
        m.set(x + (wo + 1) * dir, h + 1, z - w, wing);
      }
  };
  dragonfly(pcx - 14, pcz, 9, 1);
  dragonfly(pcx + 12, pcz - 1, 12, -1);
  dragonfly(pcx, pcz + 2, 7, 1);

  // ---- lawn life: trees, palms, benches, lamps along the promenade
  for (const [x, z] of [
    [78, 50],
    [204, 52],
    [124, 10],
    [160, 10],
    [80, 8],
    [200, 8],
  ])
    leafTree(m, x, 1, z, k, seed + x * 3, 6);
  for (const x of [6, 74, 208, W - 8]) palm(m, x, 1, D - 16, k, seed + x, 6 + r() * 2);
  for (let x = 20; x < W - 20; x += 36) bench(m, x, 1, D - 8, k);
  for (let x = 12; x < W; x += 44) {
    const p = lampPost(m, x, 1, D - 3, k, "#e8d0ff");
    if (x > 60 && x < W - 60) lights.push([p[0], p[1], p[2], "#e8d0ff"]);
  }
  // dome entrances: glass porches with gold frames
  for (const [ex, ez] of [
    [f.cx, Math.round(f.cz + f.rz)],
    [cf.cx - 18, Math.round(cf.cz + cf.rz * 0.8)],
  ]) {
    m.box(ex - 6, 1, ez - 2, ex + 6, 12, ez + 4, G("#cfe6ee"));
    m.box(ex - 7, 12, ez - 2, ex + 7, 13, ez + 5, C("#eef0f2"));
    m.box(ex - 3, 1, ez + 3, ex + 3, 10, ez + 4, E("#fff0d0", 1.1));
    m.box(ex - 7, 11, ez + 4, ex + 7, 12, ez + 5, E("#f4b728", 1.6));
  }
  lights.push([140, 50, 30, "#c060ff"]);
  lights.push([cf.cx, 20, cf.cz + 16, "#3ef0d0"]);
  lights.push([f.cx, 14, f.cz + 12, "#ffd8f0"]);

  const signs: SignSpot[] = [
    { text: "GARDENS BY THE BAY · 庭園", color: "#c060ff", x: 140, y: 6, z: D - 15.9, w: 60, h: 4, vertical: false, facing: "front" },
    { text: "FLOWER DOME", color: "#ff8ac8", x: f.cx, y: 14.5, z: Math.round(f.cz + f.rz) + 5.1, w: 14, h: 2, vertical: false, facing: "front" },
    { text: "CLOUD FOREST", color: "#3ef0d0", x: cf.cx - 18, y: 14.5, z: Math.round(cf.cz + cf.rz * 0.8) + 5.1, w: 14, h: 2, vertical: false, facing: "front" },
  ];
  // the name sign stands on a low stone plinth in the flower bed
  m.box(110, 1, D - 17, 170, 9, D - 16, C("#3a2a3a"));
  m.box(109, 0, D - 18, 171, 1, D - 15, C("#8a8478"));

  points.camPos = [140, 70, D + 120];
  points.camLook = [140, 30, 30];

  return {
    model: m,
    signs,
    door: [140, D - 6],
    body: [0, 0, W, D],
    walls: [
      [f.cx - f.rx, f.cz - f.rz, f.cx + f.rx, f.cz + f.rz],
      [cf.cx - cf.rx, cf.cz - cf.rz, cf.cx + cf.rx, cf.cz + cf.rz],
    ],
    lights,
    scale: k,
    points,
  };
}
