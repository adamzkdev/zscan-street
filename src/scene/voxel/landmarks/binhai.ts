import type { Built } from "../buildings";
import { C, E, G, hash, rand, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost, leafTree } from "./needle";

/**
 * TIANJIN BINHAI LIBRARY (MVRDV, 2017) on the south bank, facing the river and the heart across
 * the footbridges. A long, low, crisp white box; both long facades are glass behind horizontal
 * white louvres (the shelves carried outside), and in the middle of each, THE EYE: an almond
 * opening cut through the facade, its louvres bending round it like contour lines, inside it the
 * terraced white bookshelves stepping back in concentric rings round the giant luminous sphere
 * (the auditorium). In front, the plaza with its two reflecting pools, trees and benches; behind,
 * the cultural centre's long glass-roofed promenade.
 *
 * Points (model voxels, scale 2): `keeper` on the plaza before the door, `sphere` the sphere's
 * centre, `camPos` / `camLook` a nice exterior viewpoint.
 */
export function binhai(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 100;
  const m = new VoxelModel(W, H, D);
  const r = rand(seed);
  const lights: Built["lights"] = [];
  const walls: NonNullable<Built["walls"]> = [];
  const signs: SignSpot[] = [];
  const mid = Math.floor(W / 2);

  // ---- colours -----------------------------------------------------------------------------------
  const white = C("#dddbd6"),
    white2 = C("#cfcdc8"),
    rimW = C("#e6e5e1"),
    inner = C("#d6d4ce"),
    glass = G("#93a8ba"),
    glassDark = G("#8297a8"),
    warm = E("#ffe0b0", 0.85),
    warmDim = E("#d8c2a0", 0.8),
    gold = E("#ffcf7a", 1.25),
    goldSoft = E("#ffcf7a", 0.75);
  const spines = ["#cbbca4", "#a98d6e", "#8c6c52", "#ddd3c0", "#b3a596", "#7d8c9c", "#c2a27a", "#9a5a48"].map(C);
  const paveP: Paint = (x, _y, z) => {
    if (x % 9 === 0 || z % 9 === 0) return C("#b9b4ac");
    const h = hash(x >> 1, 0, z >> 1, seed);
    return C(h < 0.33 ? "#d9d5ce" : h < 0.66 ? "#d3cfc7" : "#dedad3");
  };

  // ---- ground: the plaza's pale granite --------------------------------------------------------------
  m.box(0, 0, 0, W, 1, D, paveP);

  // ---- the building ---------------------------------------------------------------------------------
  const BX0 = 14,
    BX1 = W - 14,
    BZ0 = 36,
    BZ1 = 104,
    TOP = 82, // underside of the roof slab
    HT = 88;
  const FX0 = BX0 + 5,
    FX1 = BX1 - 5;
  // the core (hidden behind the facades)
  m.box(FX0, 1, BZ0 + 4, FX1, TOP, BZ1 - 4, inner);
  // the roof slab and the end walls: one crisp white frame round the facades
  m.box(BX0, TOP, BZ0 - 1, BX1, HT, BZ1 + 1, white);
  m.box(BX0, 1, BZ0 - 1, FX0, TOP, BZ1 + 1, white);
  m.box(FX1, 1, BZ0 - 1, BX1, TOP, BZ1 + 1, white);
  // shadow grooves in the end walls (the louvre lines turn the corner as joints)
  for (let y = 6; y < TOP; y += 5)
    for (let z = BZ0 - 1; z < BZ1 + 1; z++) {
      m.set(BX0, y, z, white2);
      m.set(BX1 - 1, y, z, white2);
    }
  // the base: a white plinth line
  m.box(BX0 - 1, 0, BZ0 - 2, BX1 + 1, 1, BZ1 + 2, white2);

  // ---- the eye: an almond (two circular arcs) centred on the facade -------------------------------------
  const cx = mid,
    cy = 47,
    a = 56,
    b = 32;
  const R = (a * a + b * b) / (2 * b),
    off = R - b;
  /** Half-height of the eye at x (0 outside it). */
  const eyeH = (x: number) => {
    const dx = x + 0.5 - cx;
    if (Math.abs(dx) >= a) return 0;
    return Math.max(0, Math.sqrt(R * R - dx * dx) - off);
  };
  const Htop = TOP - cy,
    Hbot = cy - 1;
  /** The louvre field: 0 on the eye's rim, growing to the roof / the ground; < 0 inside the eye. */
  const field = (x: number, y: number) => {
    const u = y + 0.5 - cy;
    const e = eyeH(x);
    const span = u >= 0 ? Htop : Hbot;
    const au = Math.abs(u);
    if (au < e) return -1 + au / e;
    return ((au - e) / (span - e)) * span;
  };
  const S = 5; // louvre spacing (voxels): ~1.7 m
  const band = (x: number, y: number) => Math.floor(field(x, y) / S);

  // the sphere: the auditorium, half sunk below the eye's centre, midway through the building
  const sx = cx,
    sy = 36,
    sz = (BZ0 + BZ1) / 2,
    SR = 24;
  const inSil = (x: number, y: number) => (x + 0.5 - sx) ** 2 + (y + 0.5 - sy) ** 2 < SR * SR;
  const sphereDepth = (x: number, y: number) => Math.sqrt(Math.max(0, SR * SR - (x + 0.5 - sx) ** 2 - (y + 0.5 - sy) ** 2));

  // the entrance under the eye's lower tip
  const ENT = { x0: cx - 26, x1: cx + 26, y1: 11 };

  /** One long facade: dir +1 the front (+z, the plaza), -1 the back (the promenade). */
  const facade = (dir: 1 | -1) => {
    // z of the voxel layer `d` voxels in from the facade's outer plane
    const zAt = (d: number) => (dir > 0 ? BZ1 - 1 - d : BZ0 + d);
    const N = 7,
      T = 4;
    const ringDepth = (n: number) => 3 + (N - 1 - n) * T;
    for (let x = FX0; x < FX1; x++)
      for (let y = 1; y < TOP; y++) {
        const f = field(x, y);
        if (f >= 0) {
          // ---- outside the eye: louvres before the glass ----
          const isBand = band(x, y) !== band(x, y + 1) || band(x, y) !== band(x, y - 1) || band(x, y) !== band(x + 1, y) || y === TOP - 1 || y === 1;
          const rim = f < 1.6;
          const entrance = x >= ENT.x0 && x < ENT.x1 && y < ENT.y1 + 2;
          if (entrance) continue;
          if (rim) {
            // the eye's rim: a thick white lip standing proud of the facade
            for (let d = -2; d < 4; d++) m.set(x, y, zAt(d), rimW);
            continue;
          }
          if (isBand) for (let d = 0; d < 3; d++) m.set(x, y, zAt(d), d === 0 ? white : white2);
          const under = !isBand && band(x, y) !== band(x, y + 2);
          const under2 = !isBand && !under && band(x, y) !== band(x, y + 3);
          // the glass: the reading floors behind it, a warm line of shelf light under each louvre
          m.set(x, y, zAt(3), isBand ? white2 : under ? warm : under2 ? warmDim : (x + y) % 23 === 0 ? glassDark : glass);
          continue;
        }
        // ---- inside the eye: the terraced shelves, concentric rings stepping in to the sphere ----
        const s = f + 1; // 0 on the centre line, 1 at the rim
        const n = Math.min(N - 1, Math.floor(s * N));
        const dn = ringDepth(n);
        const upper = y + 0.5 >= cy;
        // the lip: the ring's edge facing the centre (the shelf board above, the step's nose below)
        const ny = upper ? y - 1 : y + 1;
        const fn = field(x, ny);
        const nIn = fn < 0 ? Math.min(N - 1, Math.floor((fn + 1) * N)) : N;
        const lip = nIn < n || n === 0;
        // the sphere hides what is behind it: rings stop at its surface
        const sil = inSil(x, y);
        const sd = sil ? sphereDepth(x, y) : 0;
        for (let d = 0; d < dn - (lip ? 1 : 0); d++) m.set(x, y, zAt(d), 0);
        for (let d = dn - (lip ? 1 : 0); d < dn + T; d++) {
          const z = zAt(d);
          if (sil && dir * (z + 0.5 - sz) > sd - 0.5) {
            m.set(x, y, z, 0);
            continue;
          }
          let c: number;
          if (d === dn - 1) c = rimW;
          else if (d === dn) {
            if (lip) c = rimW;
            else {
              // the shelf face: book spines in warm muted colours, a gold light under each board
              const nextUp = upper ? field(x, y + 1) : field(x, y - 1);
              const rowTop = nextUp >= 0 || Math.min(N - 1, Math.floor((nextUp + 1) * N)) !== n;
              const h = hash(x, y, dir, seed + 11);
              c = upper && rowTop ? goldSoft : h < 0.45 ? spines[Math.floor(hash(x >> 1, y, dir, seed) * spines.length)] : white2;
            }
          } else c = white;
          m.set(x, y, z, c);
        }
        // behind the rings: the atrium, white all the way to the sphere's middle
        for (let d = dn + T; d < 40 && dir * (zAt(d) + 0.5 - sz) > 0; d++) m.set(x, y, zAt(d), white2);
        // nothing stands between the facade and the sphere
        if (sil)
          for (let d = 0; d < 60; d++) {
            const z = zAt(d);
            if (dir * (z + 0.5 - sz) <= sd - 0.5) break;
            m.set(x, y, z, 0);
          }
      }
    // the entrance: a recessed glass wall under a white lintel, warm lobby light behind
    for (let x = ENT.x0; x < ENT.x1; x++) {
      for (let y = 1; y < ENT.y1; y++) {
        for (let d = 0; d < 6; d++) m.set(x, y, zAt(d), 0);
        const mull = (x - ENT.x0) % 6 === 0 || y === ENT.y1 - 1;
        m.set(x, y, zAt(6), mull ? C("#d8d6d0") : y < 8 && Math.abs(x - cx) < 9 ? G("#c9a46a") : warm);
        m.set(x, 0, zAt(3), white2);
      }
      for (let y = ENT.y1; y < ENT.y1 + 2; y++) for (let d = -3; d < 6; d++) m.set(x, y, zAt(d), rimW);
    }
    // the doors: two pairs of bronze-framed glass doors either side of the centre
    for (const x0 of [cx - 8, cx + 2])
      for (let x = x0; x < x0 + 6; x++)
        for (let y = 1; y < 8; y++) m.set(x, y, zAt(6), x === x0 || x === x0 + 5 || y === 7 ? C("#6a5236") : x === x0 + 3 ? C("#6a5236") : G("#e2c08a"));
    // people on the terraces inside the eye: reading, sitting on the steps
    for (let i = 0; i < 26; i++) {
      const x = cx - a + 8 + Math.floor(r() * (2 * a - 16));
      const y = cy - b + 4 + Math.floor(r() * (b * 1.6));
      // find a tread: a solid cell with air above (looking in from the facade)
      for (let d = 2; d < 34; d++) {
        const z = zAt(d);
        if (m.get(x, y, z) && !m.get(x, y + 1, z) && !m.get(x, y + 2, z) && !m.get(x, y + 3, z) && field(x, y + 1) < 0 && !inSil(x, y + 2)) {
          person(x, y + 1, z, r() < 0.6);
          break;
        }
      }
    }
  };

  // the people: little voxel figures
  const shirts = ["#f4b728", "#2a2a33", "#e8e4dc", "#3a6ea5", "#b03a48", "#3e8a5a", "#7a4a9a", "#c8732a", "#1d1c23", "#d8c8a8"];
  const skins = ["#e8c4a0", "#c89670", "#8a5a3c", "#f0d0b4"];
  function person(x: number, y: number, z: number, sit = false) {
    const shirt = C(shirts[Math.floor(r() * shirts.length)]);
    const legs = C(r() < 0.5 ? "#2a2a38" : "#4a4050");
    if (sit) {
      m.set(x, y, z, legs);
      m.set(x, y + 1, z, shirt);
      m.set(x, y + 2, z, C(skins[Math.floor(r() * skins.length)]));
    } else {
      m.box(x, y, z, x + 1, y + 2, z + 1, legs);
      m.box(x, y + 2, z, x + 1, y + 4, z + 1, shirt);
      m.set(x, y + 4, z, C(skins[Math.floor(r() * skins.length)]));
    }
  }

  facade(1);
  facade(-1);

  // ---- the sphere: white, a lattice of light (it glows gold-white at night) -------------------------------
  {
    // (a saturated tint: pale lights would blink like windows)
    const latt = gold,
      sw = C("#e6e4df"),
      sw2 = C("#d8d6d0");
    for (let y = Math.floor(sy - SR); y <= Math.ceil(sy + SR); y++)
      for (let z = Math.floor(sz - SR); z <= Math.ceil(sz + SR); z++)
        for (let x = Math.floor(sx - SR); x <= Math.ceil(sx + SR); x++) {
          const dx = x + 0.5 - sx,
            dy = y + 0.5 - sy,
            dz = z + 0.5 - sz;
          const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dd > SR || y < 1) continue;
          if (dd < SR - 2.5) {
            m.set(x, y, z, sw2);
            continue;
          }
          // white ribs (latitudes and meridians); the panels between perforated, lit from within
          const lat = Math.asin(dy / dd) / (Math.PI / 8);
          const lon = Math.atan2(dx, dz) / (Math.PI / 6);
          // about one voxel wide, measured along the surface
          const cosLat = Math.sqrt(Math.max(0, 1 - (dy / dd) ** 2));
          const onLat = Math.abs(lat - Math.round(lat)) * (Math.PI / 8) * dd < 0.5;
          const onLon = Math.abs(dy / dd) < 0.93 && Math.abs(lon - Math.round(lon)) * (Math.PI / 6) * dd * cosLat < 0.5;
          m.set(x, y, z, onLat || onLon ? sw : ((x ^ z) & 1) === 0 && (y & 1) === 0 ? latt : hash(x, y, z, seed + 1) < 0.5 ? sw : sw2);
        }
    // the stage it stands on
    m.box(sx - 18, 1, sz - 18, sx + 18, 13, sz + 18, white2);
  }

  // ---- the roof: a long skylight over the atrium, a few white plant boxes ---------------------------------
  for (let x = cx - 70; x < cx + 70; x++)
    for (let z = BZ0 + 22; z < BZ1 - 22; z++) {
      const edge = x === cx - 70 || x === cx + 69 || z === BZ0 + 22 || z === BZ1 - 23;
      m.set(x, HT, z, edge ? white2 : (x - cx) % 8 === 0 ? white : G("#b9ccd8"));
    }
  m.box(cx - 70, HT - 1, BZ0 + 23, cx + 70, HT, BZ1 - 23, warm);
  for (const x of [BX0 + 10, BX1 - 26]) m.box(x, HT, BZ0 + 8, x + 16, HT + 4, BZ0 + 18, white2);
  m.box(BX0, HT, BZ0 - 1, BX1, HT + 1, BZ0, white);
  m.box(BX0, HT, BZ1, BX1, HT + 1, BZ1 + 1, white);

  // ---- the plaza (front, +z): the reflecting pools either side of the walk to the door ------------------------
  const PZ0 = BZ1 + 16,
    PZ1 = D - 12;
  const pools: [number, number][] = [
    [cx - 64, cx - 12],
    [cx + 12, cx + 64],
  ];
  const water: Paint = (x, _y, z) => (hash(x >> 2, 0, z >> 2, seed + 5) < 0.5 ? G("#4f7f9c") : G("#5a8aa6"));
  for (const [x0, x1] of pools) {
    m.box(x0, 0, PZ0, x1, 2, PZ1, C("#cfcbc3"));
    m.box(x0 + 1, 0, PZ0 + 1, x1 - 1, 1, PZ1 - 1, water);
    m.box(x0 + 1, 1, PZ0 + 1, x1 - 1, 2, PZ1 - 1, 0);
    // underwater lights along the long sides
    for (let x = x0 + 3; x < x1 - 2; x += 6) {
      m.set(x, 0, PZ0 + 1, goldSoft);
      m.set(x, 0, PZ1 - 2, goldSoft);
    }
    walls.push([x0, PZ0, x1, PZ1]);
  }
  // the building's apron: a wide white step up to the doors
  m.box(BX0, 1, BZ1 + 1, BX1, 2, BZ1 + 6, white2);
  m.box(BX0, 1, BZ0 - 6, BX1, 2, BZ0 - 1, white2);
  // trees in rows in the plaza's wings, benches under them
  const leaves: Paint = (x, y, z) => C(hash(x, y, z, seed + 3) < 0.5 ? "#4f8a3e" : hash(x, y, z, seed + 4) < 0.5 ? "#3f7a36" : "#5f9a48");
  for (let x = 10; x < W - 8; x += 16) {
    if (x > cx - 72 && x < cx + 72) continue;
    for (const z of [BZ1 + 14, BZ1 + 32, D - 16]) {
      if (Math.abs(x - 78) < 6 || Math.abs(x - 222) < 6) continue;
      leafTree(m, x, 1, z, k, seed + x * 7 + z, 6, leaves);
    }
    if (x + 16 < W - 8) bench(m, x + 5, 1, BZ1 + 23, k);
  }
  // lamps along the pools
  for (const x of [cx - 68, cx - 8, cx + 8, cx + 68]) {
    const p = lampPost(m, x, 1, PZ0 + 2, k, "#fff0d0", 4.2);
    if (x === cx - 8 || x === cx + 8) lights.push([p[0], p[1], p[2], "#ffe2b0"]);
  }
  for (const x of [cx - 68, cx + 68]) lampPost(m, x, 1, PZ1 - 2, k, "#fff0d0", 4.2);
  // the quay's railing (the footbridges land at x = 78, 150, 222)
  for (let x = 0; x < W; x++) {
    if ([78, 150, 222].some((b) => Math.abs(x - b) < 6)) continue;
    if (x % 5 === 0) m.box(x, 1, D - 1, x + 1, 4, D, C("#4a4650"));
    m.set(x, 4, D - 1, C("#8a8690"));
  }
  // the name, low on a white plinth at the head of the plaza
  m.box(cx - 120, 1, D - 12, cx - 78, 5, D - 7, white);
  m.box(cx - 120, 5, D - 12, cx - 78, 6, D - 7, white2);
  signs.push({ text: "BINHAI LIBRARY 滨海图书馆", color: "#3a3833", x: cx - 99, y: 3.2, z: D - 7, w: 40, h: 3, vertical: false, facing: "front" });
  walls.push([cx - 120, D - 12, cx - 78, D - 7]);

  // ---- behind (the back, -z): the cultural centre's glass-roofed promenade along the whole block ------------
  {
    const z0 = 4,
      z1 = 26,
      y = 30;
    for (let x = 4; x < W - 4; x += 12)
      for (const z of [z0, z1 - 1]) m.box(x, 1, z, x + 1, y, z + 1, white);
    // white steel beams, glass between
    for (let x = 3; x < W - 3; x++)
      for (let z = z0 - 1; z < z1 + 1; z++) {
        const edge = z === z0 - 1 || z === z1;
        const rib = (x - 4) % 6 === 0;
        m.set(x, y, z, edge ? white : rib ? white2 : G("#c3d6e2"));
        if (rib && !edge && hash(x, 0, z, seed) < 0.03) m.set(x, y - 1, z, goldSoft);
      }
    for (let x = 3; x < W - 3; x++) m.set(x, y + 1, (z0 + z1) >> 1, white);
    // lights under it, planters, people walking
    for (let x = 16; x < W - 16; x += 36) {
      m.box(x - 3, 1, 12, x + 3, 3, 18, C("#9a958c"));
      m.box(x - 2, 3, 13, x + 2, 4, 17, C("#3d7a3a"));
    }
    lights.push([cx, y - 4, (z0 + z1) / 2, "#ffe2b0"]);
  }
  // trees along the back and the ends
  for (let z = 34; z < BZ1 + 4; z += 18) {
    leafTree(m, 6, 1, z, k, seed + z, 5, leaves);
    leafTree(m, W - 7, 1, z, k, seed + z + 9, 5, leaves);
  }

  // people: on the plaza, by the pools, under the promenade
  for (let i = 0; i < 70; i++) {
    const x = 6 + Math.floor(r() * (W - 12));
    const z = i < 50 ? BZ1 + 8 + Math.floor(r() * (D - BZ1 - 14)) : 6 + Math.floor(r() * 26);
    if (m.get(x, 1, z) || m.get(x, 2, z) || m.get(x, 1, z + 1)) continue;
    person(x, 1, z);
  }

  // the eye glows from within
  lights.push([cx, cy, BZ1 + 4, "#ffe2b0"], [cx, cy, BZ0 - 4, "#ffe2b0"]);

  walls.push([BX0, BZ0 - 1, BX1, BZ1 + 1]);
  return {
    model: m,
    signs,
    door: [cx, BZ1 + 2.4],
    body: [0, 0, W, D],
    walls,
    lights,
    scale: k,
    points: {
      keeper: [cx, 1, BZ1 + 8],
      sphere: [sx, sy, sz],
      camPos: [cx + 40, 34, D + 70],
      camLook: [cx, 40, BZ1],
    },
  };
}
