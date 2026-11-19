import type { Built } from "../buildings";
import { C, E, G, hash, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { lampPost, leafTree, planterBox } from "./needle";

/**
 * THE GAME HOUSE (ゲーム館), on the avenue across from the hawker centre, west of the shōtengai:
 * ZK PARTY's mini-games and the house's table games under one roof. A void box of three storeys
 * trimmed in lilac neon, a wide lit storefront, a marquee canopy fringed with chase bulbs over a
 * flare carpet, and over it the big board with its neon (GAME HOUSE, ゲーム館), framed in bulbs. On
 * the roof the house's toys at giant scale: the party's Z-Block with its "?", a die showing five, a
 * playing card standing on its edge with ZEC's Z on its face; on the plaza a second die and a stack
 * of ⓩ chips. A tate-kanban (遊戯場) hangs off the west corner.
 *
 * Scale 2 (a third of a metre). Points: `door`, `keeper`, `camPos`, `camLook`.
 */
export function gamehouse(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 64;
  const m = new VoxelModel(W, H, D);
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];
  const cx = Math.round(W / 2);

  // the body: x0…x1 across, from the back (bz) to the front face (FZ), TOP high
  const x0 = 7,
    x1 = W - 7;
  const FZ = Math.min(D - 30, 72);
  const bz = Math.max(4, FZ - 58);
  const TOP = 36;

  const void_ = C("#121016");
  const voidHi = C("#1c1922");
  const trim = C("#2c2834");
  const flare = E("#ff6b35", 1.8);
  const lilac = E("#c4b1fc", 1.6);
  const glacier = E("#a8d8e8", 1.4);
  const bulb = E("#fff1d6", 1.9);
  const bulbOff = C("#3a3440");
  const white = C("#f2eee6");
  const pip = C("#16141c");

  // ---- the plaza: dark granite, a flare carpet from the kerb to the doors, bulbs either side -------
  m.box(0, 0, 0, W, 1, D, shades(["#211f24", "#1c1a1f", "#26232a"], 2, seed));
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (x < 2 || x >= W - 2 || z >= D - 2) m.set(x, 0, z, C("#56525c"));
      if (z >= FZ && z < D - 2 && Math.abs(x + 0.5 - cx) < 5) m.set(x, 0, z, Math.abs(x + 0.5 - cx) > 4 ? flare : C("#8a2f14"));
      if (z >= FZ + 2 && z < D - 3 && Math.abs(x + 0.5 - cx) === 6.5 && z % 3 === 0) m.set(x, 0, z, bulb);
    }

  // ---- the body: void walls, lilac pilasters, a lit storefront ---------------------------------------
  m.box(x0, 1, bz, x1, TOP, FZ, void_);
  // the core, hollow (lighter to mesh, and nothing reads through the glass)
  m.box(x0 + 3, 1, bz + 3, x1 - 3, TOP - 2, FZ - 3, 0);
  // floor bands
  for (const y of [13, 24]) m.box(x0, y, bz, x1, y + 1, FZ, trim);
  // the parapet, its lilac crown
  m.box(x0, TOP, bz, x1, TOP + 2, FZ, voidHi);
  m.box(x0 + 2, TOP, bz + 2, x1 - 2, TOP + 2, FZ - 2, 0);
  m.box(x0, TOP + 2, FZ - 1, x1, TOP + 3, FZ, lilac);
  m.box(x0 + 2, TOP - 1, bz + 2, x1 - 2, TOP, FZ - 2, C("#2a2730"));
  // corner pilasters with a neon line each, front and sides
  for (const px of [x0, x1 - 3]) {
    m.box(px, 1, FZ - 3, px + 3, TOP + 2, FZ + 1, voidHi);
    m.box(px + 1, 2, FZ, px + 2, TOP + 1, FZ + 1, lilac);
  }
  for (let z = bz + 6, i = 0; z < FZ - 4; z += 10, i++) {
    const neon = [lilac, flare, glacier][i % 3];
    m.box(x0 - 1, 2, z, x0, TOP, z + 1, neon);
    m.box(x1, 2, z, x1 + 1, TOP, z + 1, neon);
  }
  // the side and back walls' upper windows: lit in the house's colours (tables, screens)
  const lit = [E("#ff6b35", 1.0), E("#c4b1fc", 1.0), E("#a8d8e8", 0.9), E("#fff1d6", 0.8)];
  const windows = (fixed: "x" | "z", at: number, from: number, to: number) => {
    for (let a = from; a < to; a++)
      for (let y = 16; y < 23; y++) {
        const bay = Math.floor((a - from) / 6);
        const inBay = (a - from) % 6;
        if (inBay === 0 || y === 16 || y === 22) continue;
        const h = hash(bay, fixed === "x" ? 1 : 2, at, seed);
        const c: Paint = h < 0.55 ? lit[Math.floor(h * 7) % 4] : G("#15131a");
        if (fixed === "x") m.set(at, y, a, c);
        else m.set(a, y, at, c);
      }
  };
  windows("x", x0, bz + 3, FZ - 4);
  windows("x", x1 - 1, bz + 3, FZ - 4);
  windows("z", bz, x0 + 4, x1 - 4);

  // the storefront: glass glowing with the hall inside (screens, the tables' lamps), the doors lit
  const sf0 = x0 + 4,
    sf1 = x1 - 4;
  for (let y = 1; y < 12; y++)
    for (let x = sf0; x < sf1; x++) {
      const mull = (x - sf0) % 5 === 0 || y === 11;
      const bay = Math.floor((x - sf0) / 5);
      const glow = hash(bay, Math.floor(y / 3), 3, seed);
      // the hall seen through the glass: dark, a lit band of lamps up high, screens and a few warm lamps
      const c: Paint = mull
        ? trim
        : y < 2
          ? C("#1a1820")
          : y === 10
            ? E("#ffe2b8", 1.1)
            : y >= 6 && y <= 8 && (x - sf0) % 5 >= 1 && (x - sf0) % 5 <= 3 && hash(bay, 7, 1, seed) < 0.5
              ? E(["#ff6b35", "#c4b1fc", "#a8d8e8"][bay % 3], 1.1)
              : glow < 0.12
                ? E("#fff1d6", 0.7)
                : G(y > 5 ? "#1c1826" : "#15121c");
      m.set(x, y, FZ - 2, c);
    }
  m.box(sf0, 1, FZ - 1, sf1, 12, FZ, 0);
  // the doors: a lit opening framed in bulbs
  m.box(cx - 5, 1, FZ - 2, cx + 5, 10, FZ - 1, (x, y) => (x === cx || y === 9 ? trim : E("#fff1d6", 1.2)));
  for (let y = 1; y < 12; y++)
    for (const x of [cx - 6, cx + 5]) m.set(x, y, FZ - 1, y % 2 ? bulb : bulbOff);
  for (let x = cx - 6; x < cx + 6; x++) m.set(x, 11, FZ - 1, x % 2 ? bulb : bulbOff);
  lights.push([cx, 8, FZ + 4, "#ffd8b0"]);

  // ---- the marquee canopy: void slab, bulbs underneath, a chase-bulb fringe ---------------------------
  const c0 = cx - 24,
    c1 = cx + 24,
    cz1 = FZ + 10;
  m.box(c0, 13, FZ, c1, 16, cz1, void_);
  for (let z = FZ + 1; z < cz1 - 1; z += 2) for (let x = c0 + 2; x < c1 - 1; x += 3) m.set(x, 12, z, bulb);
  // the fascia: flare band below, lilac above; a bulb on every other voxel round its lower edge
  m.box(c0, 13, cz1 - 1, c1, 14, cz1, flare);
  m.box(c0, 15, cz1 - 1, c1, 16, cz1, lilac);
  for (let x = c0; x < c1; x++) m.set(x, 12, cz1 - 1, x % 2 ? bulb : bulbOff);
  for (let z = FZ; z < cz1; z++) {
    m.set(c0, 13, z, flare);
    m.set(c1 - 1, 13, z, flare);
  }
  signs.push({ text: "MINI-GAMES · CARDS · DICE · POKER", color: "#a8d8e8", x: cx, y: 14.5, z: cz1 + 0.2, w: 40, h: 2.2, vertical: false, facing: "front" });
  lights.push([cx - 14, 10, FZ + 6, "#ffcfa0"], [cx + 14, 10, FZ + 6, "#d8c8ff"]);

  // ---- the big board: GAME HOUSE in flare, ゲーム館 in lilac, a frame of bulbs ---------------------------
  const b0 = x0 + 3,
    b1 = x1 - 3;
  const by0 = 17,
    by1 = 33;
  m.box(b0, by0, FZ, b1, by1, FZ + 2, C("#0c0b10"));
  for (let x = b0; x < b1; x++) {
    m.set(x, by0, FZ + 2, x % 2 ? bulb : bulbOff);
    m.set(x, by1 - 1, FZ + 2, x % 2 ? bulbOff : bulb);
  }
  for (let y = by0; y < by1; y++) {
    m.set(b0, y, FZ + 2, y % 2 ? bulb : bulbOff);
    m.set(b1 - 1, y, FZ + 2, y % 2 ? bulbOff : bulb);
  }
  // the dot between the two names: a flare bulb cluster
  const split = b1 - 18;
  m.box(split, 23, FZ + 2, split + 2, 25, FZ + 3, flare);
  signs.push({ text: "GAME HOUSE", color: "#ff6b35", x: (b0 + split) / 2, y: 25, z: FZ + 2.4, w: split - b0 - 4, h: 10, vertical: false, facing: "front" });
  signs.push({ text: "ゲーム館", color: "#c4b1fc", x: (split + 2 + b1) / 2, y: 25, z: FZ + 2.4, w: b1 - split - 5, h: 8, vertical: false, facing: "front" });
  lights.push([cx, 26, FZ + 8, "#ff8a5a"]);

  // ---- the tate-kanban on the west corner: 遊戯場 ---------------------------------------------------
  {
    const sx = x0 + 1;
    m.box(sx, 14, FZ + 1, sx + 2, 34, FZ + 7, C("#1a1820"));
    m.box(sx - 1, 13, FZ + 1, sx + 3, 14, FZ + 7, trim);
    m.box(sx - 1, 34, FZ + 1, sx + 3, 35, FZ + 7, trim);
    signs.push({ text: "遊戯場", color: "#a8d8e8", x: sx + 2, y: 24, z: FZ + 4, w: 6, h: 19, vertical: true, facing: "side" });
  }

  // ---- on the roof: the Z-Block, a die, a card on its edge --------------------------------------------
  // the party's Z-Block, flare, a "?" in light on its faces, rivets at its corners
  {
    const s = 15;
    const qx = cx - Math.floor(s / 2) + 2,
      qz = FZ - 22;
    const qy = TOP + 1;
    const body = shades(["#ff6b35", "#f2602c", "#ff7a48"], 2, seed + 4);
    m.box(qx, qy, qz, qx + s, qy + s, qz + s, body);
    m.box(qx + 1, qy + 1, qz + 1, qx + s - 1, qy + s - 1, qz + s - 1, 0);
    // the "?" (a bold 7 × 10 pixel glyph) on the front and the sides
    const Q = [".#####.", "##...##", "##...##", "....##.", "...##..", "..##...", "..##...", ".......", "..##...", "..##..."];
    const qmark = (put: (u: number, v: number) => void) => {
      for (let r = 0; r < Q.length; r++)
        for (let c = 0; c < 7; c++) if (Q[r][c] === "#") put(4 + c, s - 3 - r);
    };
    const glyph = E("#fff6e8", 2.2);
    qmark((u, v) => m.set(qx + u, qy + v, qz + s - 1, glyph));
    qmark((u, v) => m.set(qx, qy + v, qz + s - 1 - u, glyph));
    qmark((u, v) => m.set(qx + s - 1, qy + v, qz + u, glyph));
    for (const [ux, uy] of [
      [1, 1],
      [s - 2, 1],
      [1, s - 2],
      [s - 2, s - 2],
    ])
      m.set(qx + ux, qy + uy, qz + s - 1, C("#8a2f14"));
    // its plinth
    m.box(qx - 1, TOP, qz - 1, qx + s + 1, TOP + 1, qz + s + 1, trim);
    lights.push([qx + s / 2, qy + s + 4, qz + s + 4, "#ff6b35"]);
  }
  // a die on the east side of the roof showing five
  const die = (dx: number, dy: number, dz: number, s: number, front: number, top: number, side: number) => {
    m.box(dx, dy, dz, dx + s, dy + s, dz + s, white);
    // a rounded look: the edges a touch darker
    for (let a = 0; a < s; a++)
      for (const [ex, ey] of [
        [0, 0],
        [s - 1, 0],
        [0, s - 1],
        [s - 1, s - 1],
      ]) {
        m.set(dx + ex, dy + ey, dz + a, C("#d9d4ca"));
        m.set(dx + a, dy + ey, dz + (ex ? s - 1 : 0), C("#d9d4ca"));
        m.set(dx + ex, dy + a, dz + (ey ? s - 1 : 0), C("#d9d4ca"));
      }
    // pips: a 3 × 3 grid on each face
    const P = [
      [],
      [[1, 1]],
      [[0, 0], [2, 2]],
      [[0, 0], [1, 1], [2, 2]],
      [[0, 0], [2, 0], [0, 2], [2, 2]],
      [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
      [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
    ];
    const at = (i: number) => Math.round(s * 0.22 + i * (s * 0.28));
    const pipC = (n: number) => (n === 1 ? E("#ff6b35", 1.6) : pip);
    for (const [u, v] of P[front]) m.box(dx + at(u), dy + at(v), dz + s - 1, dx + at(u) + 2, dy + at(v) + 2, dz + s, pipC(front));
    for (const [u, v] of P[top]) m.box(dx + at(u), dy + s - 1, dz + at(v), dx + at(u) + 2, dy + s, dz + at(v) + 2, pipC(top));
    for (const [u, v] of P[side]) m.box(dx + s - 1, dy + at(v), dz + at(u), dx + s, dy + at(v) + 2, dz + at(u) + 2, pipC(side));
    for (const [u, v] of P[7 - side]) m.box(dx, dy + at(v), dz + at(u), dx + 1, dy + at(v) + 2, dz + at(u) + 2, pip);
  };
  die(x1 - 17, TOP + 1, FZ - 18, 11, 5, 1, 3);
  // a card on its edge behind the Z-Block: white face, ZEC's Z in gold inside a lilac ring
  {
    const cw = 16,
      ch = 22;
    const kx = x0 + 6,
      kz = FZ - 30;
    m.box(kx, TOP + 1, kz, kx + cw, TOP + 1 + ch, kz + 1, white);
    m.box(kx, TOP + 1, kz - 1, kx + cw, TOP + 1 + ch, kz, C("#3a2a6a"));
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const u = x + 0.5 - cw / 2,
          v = y + 0.5 - ch / 2;
        const r = Math.hypot(u, v * 0.95);
        if (r > 5.4 && r < 7.2) m.set(kx + x, TOP + 1 + y, kz + 1, E("#c4b1fc", 1.4));
        // the Z: its top and bottom bars, the diagonal, the two ticks
        const zx = Math.floor(u + 3.5),
          zy = Math.floor(3.5 - v);
        const zc = zx >= 0 && zx < 7 && zy >= -1 && zy < 8 && (((zy === 0 || zy === 6) && zx < 7) || (zy > 0 && zy < 6 && zx === 6 - zy) || ((zy === -1 || zy === 7) && zx === 3));
        if (zc) m.set(kx + x, TOP + 1 + y, kz + 1, E("#f4b728", 1.8));
        // the corner pips
        if ((x === 1 || x === cw - 2) && (y === 1 || y === ch - 2)) m.set(kx + x, TOP + 1 + y, kz + 1, C("#c4302a"));
        if (x === 0 || x === cw - 1 || y === 0 || y === ch - 1) m.set(kx + x, TOP + 1 + y, kz + 1, C("#d9d4ca"));
      }
    // its stand
    m.box(kx + 2, TOP + 1, kz - 3, kx + 4, TOP + 6, kz - 1, trim);
    m.box(kx + cw - 4, TOP + 1, kz - 3, kx + cw - 2, TOP + 6, kz - 1, trim);
  }
  // roof plant: a couple of units, a glow from the skylight
  m.box(x1 - 14, TOP, bz + 6, x1 - 6, TOP + 4, bz + 12, C("#c4c1ca"));
  m.box(x0 + 8, TOP, bz + 6, x0 + 14, TOP + 3, bz + 10, C("#c4c1ca"));
  m.box(cx - 8, TOP - 1, bz + 8, cx + 8, TOP, bz + 18, E("#c4b1fc", 0.7));

  // ---- the plaza: a big die and a stack of ⓩ chips by the kerb, planters, lamps, stanchions -----------
  die(4, 1, FZ + 14, 10, 6, 4, 2);
  {
    // chips: flare, lilac, glacier, bone, each with a ring of notches
    const ccx = W - 10,
      ccz = FZ + 19;
    const cols = ["#ff6b35", "#c4b1fc", "#a8d8e8", "#e8e6e0", "#ff6b35", "#6dbf8a"];
    cols.forEach((c, i) => {
      const y = 1 + i * 2;
      const off = i % 2 ? 0.4 : -0.3;
      m.cylinder(ccx + off, y, ccz, 5.2, 2, C(c));
      // the edge spots, on the chip's lower half
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2 + i * 0.5;
        m.set(ccx + off + Math.cos(ang) * 4.9, y, ccz + Math.sin(ang) * 4.9, c === "#e8e6e0" ? C("#ff6b35") : white);
      }
    });
    m.cylinder(ccx + 0.6, 13, ccz, 2.2, 1, E("#fff1d6", 1.2));
  }
  for (const x of [cx - 9, cx + 8]) for (let z = FZ + 12; z < D - 4; z += 5) m.box(x, 1, z, x + 1, 4, z + 1, C("#8a8794"));
  for (const x of [cx - 9, cx + 8]) m.box(x, 3, FZ + 12, x + 1, 4, D - 5, E("#c4b1fc", 0.8));
  planterBox(m, 3, 1, FZ + 2, 14, FZ + 9, seed + 3, true);
  planterBox(m, W - 14, 1, FZ + 2, W - 3, FZ + 9, seed + 4, true);
  leafTree(m, 3, 1, bz + 2, k, seed + 7, 6);
  leafTree(m, W - 4, 1, bz + 2, k, seed + 9, 6);
  for (const x of [2, W - 3]) for (let z = FZ + 4; z < D - 8; z += 14) lampPost(m, x, 1, z, k, "#ffd8b0");

  return {
    model: m,
    signs,
    door: [cx, FZ + 1],
    body: [0, 0, W, D],
    walls: [[x0, bz, x1, FZ]],
    lights,
    scale: k,
    points: {
      door: [cx, 1, FZ + 4],
      keeper: [cx + 9, 1, FZ + 6],
      camPos: [cx + 70, 55, D + 95],
      camLook: [cx, 20, FZ],
    },
  };
}
