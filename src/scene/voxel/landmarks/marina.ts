import type { Built } from "../buildings";
import { C, E, G, hash, rand, shades, VoxelModel } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost, mv, palm, planterBox } from "./needle";

/**
 * MARINA ZEC HOTEL: a Marina Bay Sands on the river's south bank. Three slender hotel towers whose
 * front leg leans back as it rises (an A in section, open between the legs at the bottom), rows of
 * balconies lit at night, joined at the top by a ship-shaped SkyPark that cantilevers past the
 * right tower like a bow: an infinity pool of glowing water along its front edge, palms, loungers
 * and cabanas, a sky bar at the bow. On the ground a glazed podium, the lotus-flower casino entrance
 * and drop-off canopies.
 *
 * Points (model voxels, scale 2):
 *  - `pool`: centre of the infinity pool's water surface.
 *  - `deck0`, `deck1`: the two ends of the SkyPark walkway (stern on the left, bow on the right).
 *  - `lotus`: the casino entrance doors inside the lotus.
 *  - `camPos` / `camLook`: a nice exterior viewpoint.
 */
export function marina(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const Ht = 150; // underside of the SkyPark
  const deckY = 160; // SkyPark walking surface (first empty layer above the deck)
  const H = deckY + 30;
  const m = new VoxelModel(W, H, D);
  const r = rand(seed);
  const M = mv(2.6, k);
  const mid = Math.round(W / 2);
  const podH = 24;
  const pz0 = 8,
    pz1 = D - M - 10; // podium depth
  const towers = [
    [14, 50],
    [73, 109],
    [132, 168],
  ];

  // ---- ground: river-promenade paving with a wave pattern
  m.box(0, 0, 0, W, 1, D, shades(["#d0cabe", "#c8c2b6", "#d6d0c4"], 2, seed));
  for (let x = 0; x < W; x++) {
    const z = Math.round(D - 5 + Math.sin(x * 0.25) * 1.5);
    m.set(x, 0, z, C("#9a948a"));
    m.set(x, 0, z - 4, C("#b8a878"));
  }

  // ---- podium: three storeys of glass and stone, shops and the hotel lobby behind
  const stone = shades(["#e4ded2", "#dcd6ca", "#e8e2d6"], 2, seed + 1);
  m.box(6, 1, pz0, W - 6, podH, pz1, stone);
  for (let y = 1; y < podH - 2; y++)
    for (let x = 7; x < W - 7; x++) {
      const fy = y % 8;
      const c = fy === 0 ? C("#c8c0b0") : x % 6 === 0 ? C("#b8b2a6") : hash(x >> 1, y >> 3, 3) > 0.45 ? E(["#ffe6c0", "#fff0d8", "#ffd8a0"][Math.floor(hash(x >> 3, y >> 3, 1) * 3)], 0.9) : G("#3a4a5e");
      m.set(x, y, pz1 - 1, c);
    }
  m.box(5, podH - 2, pz0 - 1, W - 5, podH, pz1 + 1, C("#f0ece4"));
  m.box(5, podH - 3, pz1, W - 5, podH - 2, pz1 + 1, E("#f4b728", 1.6));
  // podium roof garden between the towers: lawns, hedges, a lap of path
  m.box(6, podH, pz0, W - 6, podH + 1, pz1, shades(["#4a8a3a", "#3f7f34", "#559640"], 1, seed + 2));
  m.box(6, podH, pz1 - 5, W - 6, podH + 1, pz1 - 3, C("#c8b89a"));
  for (let x = 8; x < W - 8; x += 3) if (hash(x, 5, seed) > 0.3) m.box(x, podH + 1, pz1 - 2, x + 2, podH + 3, pz1, shades(["#2f6b3c", "#3d8a4a"], 1, x));

  // ---- the towers
  const fzAt = (y: number) => Math.round(pz1 - 4 - 9 * Math.pow(Math.max(0, y - podH) / (Ht - podH), 1.6));
  const bz = pz0 + 2;
  const FL = 9;
  const white = C("#eeeae2"),
    whiteDark = C("#d4cfc4"),
    rail = G("#cfe4ee"),
    room = [G("#3a5068"), G("#4a6078"), G("#34465c")],
    lit = [E("#ffd08a", 1.1), E("#ffc070", 1.15), E("#ffe0b0", 1.0), E("#cfe8ff", 1.0)];
  towers.forEach(([x0, x1], ti) => {
    for (let y = 1; y < Ht; y++) {
      const fz = fzAt(y);
      const floor = Math.floor(y / FL),
        fy = y % FL;
      // the two legs stay apart at the bottom: a tall slot through the tower
      const slot = y < 70 ? [bz + 14, fz - 14] : null;
      for (let z = bz; z < fz; z++) {
        if (slot && z >= slot[0] && z < slot[1]) continue;
        for (let x = x0; x < x1; x++) {
          const edgeX = x === x0 || x === x1 - 1;
          const front = z === fz - 1,
            back = z === bz;
          const slotFace = slot && (z === slot[0] - 1 || z === slot[1]);
          if (!edgeX && !front && !back && !slotFace) {
            m.set(x, y, z, whiteDark);
            continue;
          }
          let c: number;
          if (edgeX) {
            // the ends: white blades with a slim lit window column
            c = (z - bz) % 7 === 3 && fy > 1 && fy < 7 ? (hash(z, floor, ti) > 0.6 ? lit[2] : room[0]) : y % 8 === 0 ? whiteDark : white;
          } else if (fy === 0) c = white;
          else {
            const bay = Math.floor((x - x0) / 6);
            c = (x - x0) % 6 === 0 ? whiteDark : hash(bay, floor, ti * 7 + (back ? 3 : 0) + (slotFace ? 5 : 0), seed) < 0.3 ? lit[Math.floor(hash(bay, floor, ti) * 4)] : room[(bay + floor) % 3];
          }
          m.set(x, y, z, c);
        }
      }
      // balconies on the front: a slab, a glass rail, planters on some
      if (y > podH && fy === 0) {
        m.box(x0, y, fz, x1, y + 1, fz + 2, white);
        for (let x = x0; x < x1; x++) {
          m.set(x, y + 1, fz + 1, rail);
          m.set(x, y + 2, fz + 1, (x - x0) % 6 === 0 ? whiteDark : rail);
          if (hash(x >> 2, floor, ti, 9) > 0.8) m.set(x, y + 1, fz, (hash(x, y, fz) > 0.5 ? C("#3d8a4a") : C("#2f6b3c")));
        }
      }
    }
    // lean of the front leg drawn on the ends: a dark reveal line along the curve
    for (let y = podH; y < Ht; y++) for (const x of [x0 - 1, x1]) m.set(x, y, fzAt(y) - 2, C("#b8b2a6"));
    // crown under the SkyPark: a band of lights
    m.box(x0, Ht - 2, bz, x1, Ht, fzAt(Ht - 1), C("#c8c2b6"));
    m.box(x0, Ht - 3, fzAt(Ht - 3), x1, Ht - 2, fzAt(Ht - 3) + 1, E("#f4b728", 1.4));
  });

  // ---- the SkyPark: a ship's hull on the three towers, the bow cantilevered past the right one
  const sx0 = 8,
    sx1 = W - 2;
  const sz0 = bz - 2,
    sz1 = fzAt(Ht) + 6;
  const scz = (sz0 + sz1) / 2,
    shw = (sz1 - sz0) / 2;
  const bowStart = 150;
  const halfAt = (x: number) => {
    if (x > bowStart) return shw * Math.sqrt(Math.max(0, (sx1 - x) / (sx1 - bowStart)));
    if (x < sx0 + 5) return shw * Math.sqrt(Math.max(0, (x - sx0 + 1) / 6));
    return shw;
  };
  const hullBottom = (x: number) => (x > bowStart ? Ht + Math.round((x - bowStart) * 0.22) : Ht);
  for (let x = sx0; x < sx1; x++) {
    const hw = halfAt(x);
    if (hw < 0.5) continue;
    const yb = hullBottom(x);
    for (let z = Math.floor(scz - hw); z < Math.ceil(scz + hw); z++)
      for (let y = yb; y < deckY; y++) {
        const edge = Math.abs(z + 0.5 - scz) > hw - 1.5;
        let c: number;
        if (y === yb) c = C("#8a8690");
        else if (edge) c = y === deckY - 3 ? E("#f4b728", 2.0) : y >= deckY - 7 && y < deckY - 3 ? ((x % 5 === 0 ? whiteDark : hash(x >> 2, y, 4) > 0.5 ? E("#ffe6c0", 1) : G("#5a7a96"))) : (y + x) % 2 ? white : whiteDark;
        else c = whiteDark;
        m.set(x, y, z, c);
      }
  }
  // the deck: timber boards, a glass windbreak along the back, stone along the front
  for (let x = sx0; x < sx1; x++) {
    const hw = halfAt(x);
    if (hw < 0.5) continue;
    for (let z = Math.floor(scz - hw); z < Math.ceil(scz + hw); z++) {
      m.set(x, deckY - 1, z, (x + (z % 3)) % 6 === 0 ? C("#7a5a3a") : C(["#a07a50", "#9a7448", "#a8825a"][(x >> 1) % 3]));
      if (Math.abs(z + 0.5 - scz) > hw - 1) {
        m.box(x, deckY, z, x + 1, deckY + 4, z + 1, z < scz ? G("#d8ecf4") : C("#eeeae2"));
        if (z < scz) m.set(x, deckY + 4, z, C("#eeeae2"));
      }
    }
  }
  // infinity pool along the front: glowing water flush with a dark overflow edge
  const px0 = 18,
    px1 = 150,
    wz1 = Math.floor(scz + shw) - 2,
    pzz0 = wz1 - 12;
  m.box(px0 - 1, deckY - 1, pzz0 - 1, px1 + 1, deckY, wz1, C("#e8e4dc"));
  m.box(px0, deckY - 3, pzz0, px1, deckY, wz1 + 1, (x, _y, z) => (hash(x >> 1, z >> 1, 5) > 0.82 ? E("#a8f0ff", 1.1) : E("#4ac8f0", 0.95)));
  m.box(px0, deckY - 4, wz1 + 1, px1, deckY - 1, wz1 + 2, C("#2a3a48"));
  // remove the front rail along the pool: the water meets the sky
  m.clear(px0, deckY, wz1, px1, deckY + 5, wz1 + 3);
  // loungers and umbrellas along the pool, palms, cabanas, the sky bar at the bow
  for (let x = px0 + 2; x < px1 - 3; x += 5) {
    m.box(x, deckY, pzz0 - 6, x + 2, deckY + 1, pzz0 - 2, C("#f4f4f4"));
    m.box(x, deckY + 1, pzz0 - 6, x + 2, deckY + 2, pzz0 - 5, C("#f4f4f4"));
    if ((x / 5) % 3 === 1) {
      m.box(x + 2, deckY, pzz0 - 4, x + 3, deckY + 7, pzz0 - 3, C("#5a4a3a"));
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (dx * dx + dz * dz < 12) m.set(x + 2 + dx, deckY + 7 + (dx * dx + dz * dz < 3 ? 1 : 0), pzz0 - 4 + dz, (dx + dz) & 1 ? C("#f4f0e8") : C("#e0a040"));
    }
  }
  for (let x = 24; x < 146; x += 14) palm(m, x, deckY, Math.round(scz - 6), k, seed + x, 5 + r() * 1.5);
  for (let x = 30; x < 140; x += 28) {
    const cz0 = Math.round(scz - shw + 3);
    m.box(x, deckY, cz0, x + 7, deckY + 1, cz0 + 6, C("#d8cfc0"));
    for (const [qx, qz] of [
      [x, cz0],
      [x + 6, cz0],
      [x, cz0 + 5],
      [x + 6, cz0 + 5],
    ])
      m.box(qx, deckY + 1, qz, qx + 1, deckY + 7, qz + 1, C("#8a6440"));
    for (let s = 0; s < 3; s++) m.box(x - 1 + s, deckY + 7 + s, cz0 - 1 + s, x + 8 - s, deckY + 8 + s, cz0 + 7 - s, C(s === 2 ? "#e0a040" : "#f4f0e8"));
    m.box(x + 1, deckY + 1, cz0 + 1, x + 6, deckY + 2, cz0 + 5, C("#f4f4f4"));
    m.set(x + 3, deckY + 6, cz0 + 3, E("#ffd08a", 1.6));
  }
  // sky bar: a glass pavilion on the bow with a timber roof and an observation point at the tip
  const bx0 = bowStart + 2,
    bx1 = bowStart + 18;
  m.box(bx0, deckY, Math.round(scz - 7), bx1, deckY + 8, Math.round(scz + 7), (x, y, z) => ((x + z) % 4 === 0 || y === deckY ? C("#eeeae2") : hash(x, y, z) > 0.5 ? E("#ffd8a0", 1.1) : G("#9ab8cc")));
  m.box(bx0 - 2, deckY + 8, Math.round(scz - 9), bx1 + 2, deckY + 10, Math.round(scz + 9), C("#8a6440"));
  m.box(bx0 - 2, deckY + 7, Math.round(scz + 8), bx1 + 2, deckY + 8, Math.round(scz + 9), E("#f4b728", 1.8));

  // ---- ground floor: the lotus casino entrance at the centre, canopies either side
  const lz = pz1 + 5;
  const lotus = (cx: number, cz: number) => {
    // the glass drum
    m.cylinder(cx, 1, cz, 5, 12, (x, y, z) => ((Math.round(x) + Math.round(z)) % 3 === 0 || y === 11 ? C("#c8a860") : y < 9 ? E("#ffe6c0", 1.0) : G("#c8dce8")), true);
    m.box(Math.round(cx - 2), 1, Math.round(cz + 3), Math.round(cx + 2), 8, Math.round(cz + 6), 0);
    // two rings of petals opening outward, gold-tipped, uplit at night
    const petal = C("#f6f3ee"),
      petalShade = C("#e6e0d6");
    for (const [ring, n, off, hh, rr] of [
      [0, 8, 0, 26, 11],
      [1, 8, Math.PI / 8, 20, 8],
    ] as [number, number, number, number, number][])
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2 + off;
        for (let h = 0; h < hh; h++) {
          const t = h / hh;
          const rad = 2.5 + (rr - 2.5) * Math.pow(t, 1.25);
          const half = (0.26 - 0.22 * t * t) * (ring ? 0.9 : 1);
          for (let s = -half; s <= half; s += 0.03) {
            const a = a0 + s;
            const x = cx + Math.cos(a) * rad,
              z = cz + Math.sin(a) * rad;
            m.set(x, 1 + h, z, h > hh - 3 ? C("#d8b860") : Math.abs(s) > half - 0.06 ? petalShade : petal);
          }
        }
        m.set(cx + Math.cos(a0) * 3.5, 1, cz + Math.sin(a0) * 3.5, E(ring ? "#ff8ac8" : "#fff0d0", 2));
      }
  };
  lotus(mid, lz);
  // drop-off canopies left and right of the lotus, sinuous edge, gold underside lights
  for (const [cx0, cx1] of [
    [mid - 66, mid - 16],
    [mid + 16, mid + 66],
  ]) {
    for (let x = cx0; x < cx1; x++) {
      const zz = pz1 + 7 + Math.round(Math.sin((x - cx0) * 0.12) * 1.5);
      m.box(x, 14, pz1, x + 1, 16, zz, C("#f0ece4"));
      m.set(x, 13, zz - 1, E("#f4b728", 1.6));
      if ((x - cx0) % 6 === 3) m.set(x, 13, pz1 + 3, E("#fff4d8", 1.8));
    }
    for (const x of [cx0 + 3, cx1 - 4]) m.box(x, 1, pz1 + 5, x + 1, 14, pz1 + 6, C("#c8c2b6"));
  }
  // podium doors under the canopies
  for (const dx of [mid - 46, mid + 40]) {
    m.box(dx, 1, pz1 - 1, dx + 8, 11, pz1, E("#fff0d0", 1.1));
    m.box(dx - 1, 11, pz1 - 1, dx + 9, 12, pz1 + 1, C("#c8a860"));
  }

  // ---- promenade: palms in planters, lamps, benches along the river
  const lights: Built["lights"] = [];
  for (let x = 8; x < W - 6; x += 20) {
    if (Math.abs(x - mid) < 26) continue;
    planterBox(m, x - 2, 1, D - 7, x + 4, D - 3, seed + x, true);
    palm(m, x, 3, D - 6, k, seed + x * 3, 6 + r() * 2);
  }
  for (const x of [4, mid - 24, mid + 24, W - 5]) {
    const p = lampPost(m, x, 1, D - 2, k, "#ffd08a");
    if (x === mid - 24 || x === mid + 24) lights.push([p[0], p[1], p[2], "#ffd08a"]);
  }
  bench(m, 18, 1, D - 3, k);
  bench(m, W - 26, 1, D - 3, k);
  lights.push([mid, 6, lz + 6, "#ffe6c0"]);
  lights.push([(px0 + px1) / 2, deckY + 2, pz1 + 4, "#6ad8ff"]);

  const signs: SignSpot[] = [
    { text: "MARINA ZEC HOTEL", color: "#f4b728", x: 91, y: deckY - 5, z: Math.ceil(scz + shw) + 1.1, w: 100, h: 6, vertical: false, facing: "front" },
    { text: "MARINA ZEC · マリーナ", color: "#f4b728", x: mid - 41, y: 17, z: pz1 + 8.2, w: 44, h: 2.4, vertical: false, facing: "front" },
    { text: "CASINO · SHIELDED", color: "#ff8ac8", x: mid + 41, y: 17, z: pz1 + 8.2, w: 44, h: 2.4, vertical: false, facing: "front" },
  ];
  // the name board in front of the hull needs a dark backing panel
  m.box(40, deckY - 9, Math.ceil(scz + shw), 142, deckY - 1, Math.ceil(scz + shw) + 1, C("#1a1820"));
  m.box(39, deckY - 10, Math.ceil(scz + shw), 143, deckY - 9, Math.ceil(scz + shw) + 2, E("#f4b728", 1.8));

  return {
    model: m,
    signs,
    door: [mid, lz + 6],
    body: [0, 0, W, D],
    walls: [[6, pz0, W - 6, pz1]],
    lights,
    scale: k,
    points: {
      pool: [(px0 + px1) / 2, deckY - 1, (pzz0 + wz1) / 2],
      deck0: [sx0 + 4, deckY, Math.round(scz - 2)],
      deck1: [sx1 - 6, deckY, Math.round(scz)],
      lotus: [mid, 1, lz],
      camPos: [mid + 60, 110, D + 170],
      camLook: [mid, 90, scz],
    },
  };
}
