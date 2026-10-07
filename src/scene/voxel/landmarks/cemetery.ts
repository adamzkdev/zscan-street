import type { Built } from "../buildings";
import { C, E, G, hash, rand, shades, VoxelModel, type Paint } from "../model";
import type { LandmarkOpts } from "./index";
import { glyphs, textWidth } from "./statue-art";
import { ANGEL, CD, CHAPEL, COLUMBARIUM, CRYPT, CW, FENCE, FX0, FX1, FZ0, FZ1, GATE, GRAVE_LEN, GRAVES, groundV, LANES, LANTERNS, OBELISK, pitOf, STONE_T, TOMBS, TREES, type Grave } from "../../cemetery/layout";

/**
 * ZK CEMETERY (Père-Lachaise / Highgate): a walled hill of crooked graves behind a stone plinth and
 * wrought-iron railings, the gate under an iron arch (its name plate is drawn live by
 * scene/cemetery). Gravel alleys between the plots, a gothic chapel with a slate roof, a fleche and
 * stained glass on the hill, the CRYPT (a granite Greek-temple mausoleum, its bronze door ajar on a
 * green glow: the walk-in place), two family tombs, an angel, an obelisk, a columbarium, dead trees
 * and cypresses, iron lanterns, candles and wilted flowers, and eight graves dug open (their lids
 * are live meshes: zombies climb out). Layout in ../../cemetery/layout.ts, shared with the page.
 *
 * Points (model voxels, k = 1): `archSign` (centre of the arch's plate), `crypt` (the inscription),
 * `chapelDoor`, `cryptDoor`, `camPos` / `camLook`.
 */
export function cemetery(_seed: number, o: LandmarkOpts): Built {
  const k = 1;
  const W = CW,
    D = CD;
  void o;
  const H = 98;
  const m = new VoxelModel(W, H, D);
  const lights: Built["lights"] = [];
  const points: NonNullable<Built["points"]> = {};
  const walls: [number, number, number, number][] = [];

  // ---- palettes
  const pave = shades(["#8a8690", "#83808a", "#908c96"], 3, 3);
  const grass: Paint = (x, y, z) => {
    const h = hash(Math.floor(x / 3), y, Math.floor(z / 3), 41);
    const patch = hash(x >> 3, 0, z >> 3, 7);
    if (h > 0.95) return C(h > 0.975 ? "#7a5a32" : "#8a6a3a");
    if (patch > 0.8) return C(h > 0.5 ? "#5e5a3e" : "#565238");
    return C(["#4b5a3a", "#55643f", "#45532f", "#506040"][Math.floor(h * 4)]);
  };
  const soil = shades(["#3a2c22", "#33261d", "#41322a"], 1, 5);
  const gravel = shades(["#a39d90", "#9a9486", "#aca698", "#928c80"], 2, 9);
  const plinth = shades(["#7a756c", "#716c64", "#827d74"], 4, 11);
  const cap = C("#8e897f");
  const iron = C("#1e1d22"),
    iron2 = C("#2a2830");
  const STONES = [
    shades(["#9a9890", "#93918a", "#a19f97"], 2, 1),
    shades(["#5f5e64", "#58575d", "#66656b"], 2, 2),
    shades(["#a8987a", "#a09072", "#b0a082"], 2, 3),
    shades(["#7e8478", "#767c70", "#868c80"], 2, 4),
    shades(["#c8c6c0", "#c0beb8", "#d0cec8"], 2, 5),
  ];
  const moss = shades(["#5a7a3a", "#4e6e34", "#66863f"], 1, 6);

  const onLane = (x: number, z: number) => LANES.some((l) => (l.axis === "x" ? Math.abs(z - l.at) <= l.half && x >= l.from && x <= l.to : Math.abs(x - l.at) <= l.half && z >= l.from && z <= l.to) && l.gravel);
  const inside = (x: number, z: number) => x > FX0 && x < FX1 && z > FZ0 && z < FZ1;

  // ---- ground: pavement round the fence, the hill inside it
  m.box(0, 0, 0, W, 1, D, pave);
  for (let z = FZ0 + 1; z < FZ1; z++) {
    const gv = groundV(z);
    for (let x = FX0 + 1; x < FX1; x++) {
      m.box(x, 0, z, x + 1, gv - 1, z + 1, soil);
      m.set(x, gv - 1, z, onLane(x, z) ? gravel : grass);
    }
  }
  // the gate's gravel runs out to the pavement
  for (let z = FZ1; z < D; z++) for (let x = GATE.x0; x < GATE.x1; x++) m.set(x, 0, z, gravel);
  // kerbs along the gravel alleys
  for (let z = FZ0 + 1; z < FZ1; z++)
    for (let x = FX0 + 1; x < FX1; x++) {
      if (onLane(x, z)) continue;
      if (onLane(x + 1, z) || onLane(x - 1, z) || onLane(x, z + 1) || onLane(x, z - 1)) m.set(x, groundV(z) - 1, z, C("#6f6a62"));
    }

  // ---- the fence: a stone plinth, iron railings with spear tips, stone posts
  const plinthTop = (z: number) => Math.max(groundV(Math.min(FZ1 - 1, Math.max(FZ0 + 1, z))), 3) + 2;
  const rail = (x: number, z: number, along: "x" | "z", i: number) => {
    const y0 = plinthTop(z);
    m.box(x, 0, z, x + 1, y0, z + 1, plinth);
    m.set(x, y0, z, cap);
    // a bar every other voxel, rails, spears
    if (i % 3 === 0) {
      m.box(x, y0 + 1, z, x + 1, y0 + 10, z + 1, iron);
      m.set(x, y0 + 10, z, iron2);
      if (i % 9 === 0) {
        m.set(x, y0 + 11, z, iron2);
        if (along === "x") (m.set(x - 1, y0 + 10, z, iron2), m.set(x + 1, y0 + 10, z, iron2));
        else (m.set(x, y0 + 10, z - 1, iron2), m.set(x, y0 + 10, z + 1, iron2));
      }
    }
    m.set(x, y0 + 2, z, iron);
    m.set(x, y0 + 8, z, iron);
  };
  for (let x = FX0; x <= FX1; x++) {
    rail(x, FZ0, "x", x);
    if (x < GATE.x0 - 6 || x >= GATE.x1 + 6) rail(x, FZ1, "x", x);
  }
  for (let z = FZ0; z <= FZ1; z++) {
    rail(FX0, z, "z", z);
    rail(FX1, z, "z", z);
  }
  // the plinth is thicker on the street side (two voxels), with a coping
  for (let x = FX0; x <= FX1; x++) if (x < GATE.x0 - 6 || x >= GATE.x1 + 6) m.box(x, 0, FZ1 + 1, x + 1, plinthTop(FZ1) - 1, FZ1 + 2, plinth);
  // stone posts along the railings
  const post = (x: number, z: number) => {
    const y0 = plinthTop(z);
    m.box(x - 1, 0, z - 1, x + 2, y0 + 12, z + 2, plinth);
    m.box(x - 2, y0 + 12, z - 2, x + 3, y0 + 13, z + 3, cap);
    m.set(x, y0 + 13, z, cap);
  };
  for (let x = FX0; x <= FX1; x += 36) {
    post(x, FZ0);
    if (x < GATE.x0 - 10 || x > GATE.x1 + 10) post(x, FZ1);
  }
  post(FX1, FZ0);
  post(FX1, FZ1);
  for (let z = FZ0; z <= FZ1; z += 36) (post(FX0, z), post(FX1, z));
  walls.push([FX0 - 1, FZ0 - 1, FX1 + 2, FZ0 + 2], [FX0 - 1, FZ0 - 1, FX0 + 2, FZ1 + 2], [FX1 - 1, FZ0 - 1, FX1 + 2, FZ1 + 2]);
  walls.push([FX0 - 1, FZ1 - 1, GATE.x0, FZ1 + 2], [GATE.x1, FZ1 - 1, FX1 + 2, FZ1 + 2]);

  // ---- the gate: two stone pillars with lanterns, an iron arch, the leaves swung open
  for (const [px0, px1] of [
    [GATE.x0 - 6, GATE.x0],
    [GATE.x1, GATE.x1 + 6],
  ]) {
    m.box(px0, 0, FZ1 - 3, px1, 30, FZ1 + 4, plinth);
    m.box(px0 - 1, 0, FZ1 - 4, px1 + 1, 3, FZ1 + 5, cap);
    m.box(px0 - 1, 30, FZ1 - 4, px1 + 1, 32, FZ1 + 5, cap);
    // a recessed panel and a carved wreath on the street face
    m.box(px0 + 1, 8, FZ1 + 4, px1 - 1, 24, FZ1 + 5, C("#6a655c"));
    for (let a = 0; a < 16; a++) m.set((px0 + px1) / 2 + Math.cos((a / 16) * Math.PI * 2) * 1.6, 18 + Math.sin((a / 16) * Math.PI * 2) * 1.6, FZ1 + 5, C("#585349"));
    // the lantern on top
    const lx = (px0 + px1) / 2;
    m.box(lx - 1, 32, FZ1, lx + 2, 34, FZ1 + 3, iron);
    m.box(lx - 1, 34, FZ1, lx + 2, 37, FZ1 + 3, E("#ffb860", 2.2));
    m.box(lx - 2, 37, FZ1 - 1, lx + 3, 38, FZ1 + 4, iron);
    m.set(lx, 38, FZ1 + 1, iron2);
    walls.push([px0 - 1, FZ1 - 4, px1 + 1, FZ1 + 5]);
  }
  // the arch: a straight lower bar, a curved top, scrolls and bars between; the plate is live
  for (let x = GATE.x0; x < GATE.x1; x++) {
    const t = (x + 0.5 - GATE.x0) / (GATE.x1 - GATE.x0);
    const top = 40 + Math.round(Math.sin(t * Math.PI) * 7);
    m.set(x, 30, FZ1 + 1, iron);
    m.set(x, 31, FZ1 + 1, iron2);
    m.set(x, top, FZ1 + 1, iron);
    m.set(x, top + 1, FZ1 + 1, iron2);
    if (x % 3 === 0) m.box(x, 32, FZ1 + 1, x + 1, top, FZ1 + 2, iron);
    // spikes and little crosses along the crest
    if (x % 4 === 1) m.set(x, top + 2, FZ1 + 1, iron);
  }
  {
    const cx = GATE.cx;
    // the plate's backing: a dark iron panel
    m.box(cx - 10, 33, FZ1 + 1, cx + 11, 41, FZ1 + 2, C("#141318"));
    // a cross crowning the arch
    m.box(cx, 48, FZ1 + 1, cx + 1, 54, FZ1 + 2, iron);
    m.box(cx - 2, 51, FZ1 + 1, cx + 3, 52, FZ1 + 2, iron);
    points.archSign = [cx + 0.5, 37, FZ1 + 2.05];
  }
  // the leaves, swung in against the alley's edges
  for (const [gx, dir] of [
    [GATE.x0, 1],
    [GATE.x1 - 1, -1],
  ] as const) {
    const y0 = groundV(FZ1 - 4);
    for (let z = FZ1 - 11; z < FZ1; z++) {
      m.set(gx, y0, z, iron);
      m.set(gx, y0 + 12, z, iron);
      m.set(gx, y0 + 6, z, iron);
      if (z % 2 === 0) (m.box(gx, y0, z, gx + 1, y0 + 13, z + 1, iron), m.set(gx, y0 + 13, z, iron2));
    }
    m.box(gx, y0, FZ1 - 1, gx + 1, y0 + 14, FZ1, iron2);
    void dir;
    walls.push([gx - 1, FZ1 - 11, gx + 2, FZ1]);
  }

  // ---- graves
  const stones = (g: Grave) => STONES[g.stone % STONES.length];
  for (const g of GRAVES) grave(g);
  function grave(g: Grave) {
    const base = groundV(g.z + 6);
    const hw = Math.floor(g.w / 2);
    const st = stones(g);
    const x0 = g.x - hw,
      x1 = g.x + hw + 1;
    // the stone, row by row, so it can lean
    const shape = (dy: number): [number, number] | null => {
      const h = g.h;
      const top = h - dy; // rows left above this one
      switch (g.kind) {
        case "round":
          if (top === 1) return [x0 + 2, x1 - 2];
          if (top === 2) return [x0 + 1, x1 - 1];
          return [x0, x1];
        case "pointed":
          if (top <= Math.ceil(hw)) return [g.x - (hw - (Math.ceil(hw) - top) - 1), g.x + (hw - (Math.ceil(hw) - top) - 1) + 1];
          return [x0, x1];
        case "slab":
          if (top === 1) return [x0 - 1, x1 + 1];
          return [x0, x1];
        case "broken": {
          if (dy > h * 0.55 + hash(g.x, 0, g.z) * 2) return null;
          return [x0, x1];
        }
        default:
          return [x0, x1];
      }
    };
    const leanAt = (dy: number) => (dy >= g.h * 0.5 ? g.lean : 0);
    const backAt = (dy: number) => (g.back && dy >= g.h * 0.5 ? -1 : 0);
    // a plinth under every stone
    m.box(x0 - 1, base, g.z - 1, x1 + 1, base + 1, g.z + STONE_T + 1, st);
    if (g.kind === "chapel") {
      // a little funerary chapel over the whole grave: gable to the front, an iron grille door
      const z0 = g.z,
        z1 = g.z + STONE_T + GRAVE_LEN;
      const roof = shades(["#3c3f4a", "#353844"], 1, g.x);
      m.box(x0 - 1, base, z0, x1 + 1, base + 1, z1, st);
      m.box(x0, base + 1, z0, x1, base + g.h - 4, z1 - 1, st);
      for (let y = 0; y <= hw + 1; y++) m.box(x0 - 1 + y, base + g.h - 4 + y, z0 - 1, x1 + 1 - y, base + g.h - 3 + y, z1, y === hw + 1 ? C("#2a2c34") : roof);
      for (let y = 0; y <= hw; y++) m.box(x0 + y, base + g.h - 4 + y, z1 - 1, x1 - y, base + g.h - 3 + y, z1, st);
      for (let y = base + 1; y < base + g.h - 6; y++) for (let x = g.x - 1; x <= g.x + 1; x++) m.set(x, y, z1 - 1, (x + y) % 2 ? iron : C("#120f14"));
      m.box(g.x, base + g.h - 3 + hw, z1 - 1, g.x + 1, base + g.h + hw, z1, st);
      m.set(g.x - 1, base + g.h - 1 + hw, z1 - 1, st);
      m.set(g.x + 1, base + g.h - 1 + hw, z1 - 1, st);
      if (g.deco === "candle") m.set(g.x, base + 1, z1 - 2, E("#ff8a3a", 2));
      return;
    }
    if (g.kind === "cross" || g.kind === "celtic") {
      const cx = g.x;
      const arm = Math.round(g.h * 0.65);
      m.box(cx - 2, base + 1, g.z, cx + 3, base + 3, g.z + STONE_T, st);
      for (let dy = 3; dy < g.h; dy++) m.box(cx + leanAt(dy), base + dy, g.z + backAt(dy), cx + 1 + leanAt(dy), base + dy + 1, g.z + STONE_T + backAt(dy), st);
      m.box(cx - 3 + g.lean, base + arm, g.z + backAt(arm), cx + 4 + g.lean, base + arm + 1, g.z + STONE_T + backAt(arm), st);
      if (g.kind === "celtic")
        for (let a = 0; a < 20; a++) m.set(cx + 0.5 + g.lean + Math.cos((a / 20) * Math.PI * 2) * 2.4, base + arm + 0.5 + Math.sin((a / 20) * Math.PI * 2) * 2.4, g.z + 1 + backAt(arm), st);
    } else if (g.kind === "obelisk") {
      for (let dy = 1; dy < g.h; dy++) {
        const r = dy < g.h - 2 ? (dy < 3 ? 2 : 1) : 0;
        m.box(g.x - r + leanAt(dy), base + dy, g.z + 1 - r, g.x + r + 1 + leanAt(dy), base + dy + 1, g.z + 2 + r, st);
      }
    } else {
      for (let dy = 1; dy < g.h; dy++) {
        const s = shape(dy);
        if (!s) continue;
        m.box(s[0] + leanAt(dy), base + dy, g.z + backAt(dy), s[1] + leanAt(dy), base + dy + 1, g.z + STONE_T + backAt(dy), st);
      }
      // a recessed panel on the face of the plain ones (the live epitaph sits over it)
      // a carved cross on the plain ones (the readable ones get their epitaph over the face)
      if (g.epi < 0 && g.kind !== "broken" && g.h > 6 && !g.back) {
        const l = g.lean;
        const zf = g.z + STONE_T - 1;
        for (let dy = 3; dy < g.h - 2; dy++) m.set(g.x + (dy >= g.h * 0.5 ? l : 0), base + dy, zf, C("#4a4844"));
        m.set(g.x - 1 + l, base + g.h - 4, zf, C("#4a4844"));
        m.set(g.x + 1 + l, base + g.h - 4, zf, C("#4a4844"));
      }
      if (g.kind === "broken") {
        // the fallen top lies on the grave
        m.box(x0, base, g.z + 4, x1 - 1, base + 1, g.z + 4 + 2 + Math.round(g.h * 0.4), st);
      }
    }
    // moss on the shoulders
    if (g.deco === "moss" || g.stone === 3) for (let x = x0; x < x1; x++) if (hash(x, g.z, 3) > 0.45) m.paint(x + g.lean, base + g.h - 3, g.z - 1, x + g.lean + 1, base + g.h, g.z + STONE_T + 1, moss);
    // the grave: a stone kerb round gravel, earth or a flat ledger
    const gz0 = g.z + STONE_T,
      gz1 = g.z + STONE_T + GRAVE_LEN;
    if (g.open) {
      const [px0, pz0, px1, pz1] = pitOf(g);
      const floor = Math.max(1, base - 3);
      for (let z = pz0; z < pz1; z++) for (let x = px0; x < px1; x++) m.box(x, floor, z, x + 1, base + 1, z + 1, 0);
      m.box(px0, floor - 1, pz0, px1, floor, pz1, C("#2a1f18"));
      // a heap of earth beside it, a shovel stuck in it
      const hx = x1 + 1;
      for (let z = pz0; z < pz1; z++) for (let dx = 0; dx < 3; dx++) m.box(hx + dx, base, z, hx + dx + 1, base + (dx === 1 ? 2 : 1) + (hash(dx, z, 9) > 0.6 ? 1 : 0), z + 1, soil);
      m.box(hx + 1, base + 2, pz0 + 3, hx + 2, base + 9, pz0 + 4, C("#6a4a2a"));
      m.box(hx + 1, base + 1, pz0 + 2, hx + 2, base + 3, pz0 + 5, C("#5a5a62"));
      // the kerb round the pit
      for (let x = x0; x < x1; x++) (m.set(x, base, gz0, st), m.set(x, base, gz1 - 1, st));
      for (let z = gz0; z < gz1; z++) (m.set(x0, base, z, st), m.set(x1 - 1, base, z, st));
      return;
    }
    for (let z = gz0; z < gz1; z++)
      for (let x = x0; x < x1; x++) {
        const edge = x === x0 || x === x1 - 1 || z === gz1 - 1;
        if (edge) m.set(x, base, z, st);
        else if (g.deco === "fresh") m.box(x, base, z, x + 1, base + 1 + (hash(x, z, 2) > 0.5 ? 1 : 0), z + 1, soil);
        else if (g.kind === "slab" || g.stone === 4) m.set(x, base, z, st);
        else m.set(x, base, z, hash(x, z, 4) > 0.5 ? gravel : C("#7a7468"));
      }
    if (g.deco === "flowers" || g.deco === "fresh") {
      const cols = ["#8a2a3a", "#6a2a4a", "#a87a3a", "#5a3a5a"];
      for (let i = 0; i < 5; i++) m.set(g.x - 1 + (i % 3), base + 1 + (i > 2 ? 1 : 0), gz0 + 1 + (i % 2), C(cols[(g.x + i) % cols.length]));
      m.set(g.x, base + 1, gz0 + 2, C("#3a5a2a"));
    }
    if (g.deco === "candle") {
      m.set(g.x + 1, base + 1, gz0 + 1, C("#6a1a1a"));
      m.set(g.x + 1, base + 2, gz0 + 1, E("#ff8a3a", 2.4));
    }
  }
  for (const g of GRAVES) {
    const hw = Math.floor(g.w / 2);
    walls.push([g.x - hw - 1, g.z - 1, g.x + hw + 2, g.z + STONE_T + 1 + (g.kind === "chapel" ? GRAVE_LEN : 0)]);
  }

  // ---- the chapel, on the hill: nave, buttresses, lancets, slate roof, rose window, fleche
  {
    const { x0, z0, x1, z1 } = CHAPEL;
    const cx = (x0 + x1) / 2;
    const base = groundV(z1) + 2;
    const stone = shades(["#8d877b", "#857f73", "#968f83", "#7d776b"], 2, 21);
    const slate = shades(["#3c3f4a", "#353844", "#424654"], 1, 22);
    // the plinth and the steps down to the forecourt
    m.box(x0 - 2, 0, z0 - 2, x1 + 2, base, z1 + 1, plinth);
    for (let s = 0; s < 3; s++) m.box(cx - 8 - s, 0, z1 + 1 + s * 2, cx + 9 + s, base - s, z1 + 3 + s * 2, cap);
    const nx0 = x0 + 4,
      nx1 = x1 - 4,
      eave = base + 26;
    m.box(nx0, base, z0 + 8, nx1, eave, z1, stone);
    // the apse: a polygon at the back, lower
    for (let z = z0; z < z0 + 9; z++) {
      const half = Math.round(Math.sqrt(Math.max(0, 1 - ((z0 + 9 - z) / 9) ** 2)) * ((nx1 - nx0) / 2 - 3));
      m.box(cx - half, base, z, cx + half + 1, eave - 6, z + 1, stone);
      // its conical roof
      for (let y = 0; y < 10; y++) {
        const hr = Math.round(half * (1 - y / 10));
        m.box(cx - hr, eave - 6 + y, z, cx + hr + 1, eave - 5 + y, z + 1, slate);
      }
    }
    // buttresses down both sides, with offsets
    for (let z = z0 + 10; z < z1 - 2; z += 9)
      for (const [bx0, bx1] of [
        [nx0 - 3, nx0],
        [nx1, nx1 + 3],
      ]) {
        m.box(bx0, base, z, bx1, eave - 4, z + 3, stone);
        m.box(bx0 + (bx0 < nx0 ? 1 : 0), eave - 4, z, bx1 - (bx0 < nx0 ? 0 : 1), eave + 1, z + 3, stone);
        m.set((bx0 + bx1) / 2, eave + 2, z + 1, cap);
      }
    // lancet windows in stained glass between the buttresses
    const glass = ["#3a4aff", "#c0303a", "#e0a030", "#3aa060", "#9040c0"];
    for (let z = z0 + 13; z < z1 - 4; z += 9)
      for (const x of [nx0 - 1, nx1]) {
        for (let y = base + 8; y < base + 21; y++) {
          const pointed = y >= base + 19 ? 1 : 0;
          for (let dz = pointed; dz < 4 - pointed; dz++) m.set(x, y, z + dz, y % 4 === 0 ? C("#2a2830") : E(glass[(z + y + dz) % glass.length], 1.1));
        }
      }
    // the slate roof: a steep gable along z, ridge tiles, a gilded cross at the back
    const half = (nx1 - nx0) / 2 + 2;
    for (let y = 0; y <= half; y++) {
      const a = Math.round(cx - half + y),
        b = Math.round(cx + half - y);
      m.box(a, eave + y, z0 + 7, a + 2, eave + y + 1, z1 + 1, slate);
      m.box(b - 1, eave + y, z0 + 7, b + 1, eave + y + 1, z1 + 1, slate);
    }
    const ridge = eave + Math.round(half);
    m.box(Math.round(cx) - 1, ridge, z0 + 7, Math.round(cx) + 2, ridge + 1, z1 + 1, C("#2a2c34"));
    // the gable front: stone up to the ridge, a rose window, the pointed door
    for (let y = eave; y <= ridge; y++) {
      const hw2 = Math.round(half - (y - eave));
      m.box(Math.round(cx) - hw2, y, z1 - 1, Math.round(cx) + hw2 + 1, y + 1, z1 + 1, stone);
    }
    m.box(nx0 - 1, base, z1, nx1 + 1, eave, z1 + 2, stone);
    const rose = { y: eave + 2, r: 6 };
    for (let dy = -rose.r; dy <= rose.r; dy++)
      for (let dx = -rose.r; dx <= rose.r; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > rose.r) continue;
        const a = Math.atan2(dy, dx);
        const spoke = Math.abs(((a / (Math.PI * 2)) * 8 + 8) % 1 - 0.5) > 0.38;
        const col = d > rose.r - 1 || d < 1.2 || spoke ? C("#3a3630") : E(glass[(Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) + (d > 3.5 ? 1 : 0)) % glass.length], 1.3);
        m.set(Math.round(cx) + dx, rose.y + dy, z1 + 2, col);
      }
    // the door: a pointed arch, oak with iron straps, lit from inside at night
    const dx0 = Math.round(cx) - 4,
      dx1 = Math.round(cx) + 5;
    for (let y = base; y < base + 17; y++) {
      const inset = y >= base + 14 ? y - (base + 13) : 0;
      for (let x = dx0 - 1 + inset; x < dx1 + 1 - inset; x++) m.set(x, y, z1 + 1, C("#5a544a"));
      for (let x = dx0 + inset; x < dx1 - inset; x++) m.set(x, y, z1 + 1, y % 5 === 2 ? C("#2a2830") : x === Math.round(cx) ? C("#2a1e16") : C("#4a3424"));
    }
    m.set(Math.round(cx) + 2, base + 7, z1 + 2, C("#b08a3a"));
    // a lamp over the door
    m.box(Math.round(cx), base + 18, z1 + 2, Math.round(cx) + 1, base + 20, z1 + 4, iron);
    m.box(Math.round(cx), base + 17, z1 + 3, Math.round(cx) + 1, base + 18, z1 + 4, E("#ffb860", 2));
    points.chapelDoor = [cx, base, z1 + 4];
    lights.push([cx, base + 16, z1 + 5, "#ffb070"]);
    // the fleche: a square belfry on the ridge near the front, open arches, a slate spire, a cross
    const fz0 = z1 - 12,
      fx = Math.round(cx);
    m.box(fx - 4, ridge - 6, fz0, fx + 5, ridge + 10, fz0 + 9, stone);
    for (let y = ridge + 3; y < ridge + 9; y++) {
      m.box(fx - 2, y, fz0, fx + 3, y + 1, fz0 + 9, 0);
      m.box(fx - 4, y, fz0 + 2, fx + 5, y + 1, fz0 + 7, 0);
    }
    m.box(fx - 1, ridge + 4, fz0 + 3, fx + 2, ridge + 7, fz0 + 6, C("#7a5a2a"));
    for (let y = 0; y < 26; y++) {
      const r = Math.max(0, Math.round(5 - y * 0.2));
      m.box(fx - r, ridge + 10 + y, fz0 + 4 - r, fx + r + 1, ridge + 11 + y, fz0 + 5 + r, slate);
    }
    m.box(fx, ridge + 36, fz0 + 4, fx + 1, ridge + 42, fz0 + 5, C("#b08a3a"));
    m.box(fx - 2, ridge + 39, fz0 + 4, fx + 3, ridge + 40, fz0 + 5, C("#b08a3a"));
    walls.push([x0 - 2, z0 - 2, x1 + 2, z1 + 3]);
  }

  // ---- the CRYPT: a Greek-temple mausoleum of dark granite, its bronze door ajar on a green glow
  {
    const { x0, z0, x1, z1, door } = CRYPT;
    const base = groundV(z1);
    const granite = shades(["#6e6c72", "#66646a", "#76747a"], 2, 31);
    const marble = shades(["#a8a6ac", "#a09ea4", "#b0aeb4"], 1, 32);
    // three steps all round, the podium
    for (let s = 0; s < 3; s++) m.box(x0 + s * 2, 0, z0 + s * 2, x1 - s * 2, base + s + 1, z1 - s * 2, s === 2 ? marble : granite);
    const py = base + 3;
    const cx0 = x0 + 8,
      cx1 = x1 - 8,
      cz0 = z0 + 6,
      cz1 = z1 - 14;
    // the cella, pilasters at the corners
    m.box(cx0, py, cz0, cx1, py + 24, cz1, granite);
    for (const px of [cx0, cx1 - 3]) m.box(px, py, cz1 - 1, px + 3, py + 24, cz1 + 1, marble);
    // the portico: four columns with bases and capitals, two each side of the door
    for (const colx of [cx0 + 1, cx0 + 12, cx1 - 16, cx1 - 5]) {
      m.box(colx - 1, py, z1 - 12, colx + 5, py + 1, z1 - 6, marble);
      m.cylinder(colx + 2, py + 1, z1 - 9, 2.2, 21, marble);
      m.box(colx - 1, py + 22, z1 - 12, colx + 5, py + 24, z1 - 6, marble);
    }
    // the entablature with CRYPT carved in the frieze
    const ey = py + 24;
    m.box(cx0 - 2, ey, cz0 - 1, cx1 + 2, ey + 7, z1 - 5, granite);
    m.box(cx0 - 3, ey + 6, cz0 - 2, cx1 + 3, ey + 7, z1 - 4, marble);
    const word = "CRYPT";
    const tw = textWidth(word);
    glyphs(word, (gx, gy) => m.set(door - Math.floor(tw / 2) + gx, ey + 5 - gy, z1 - 5, C("#2a282e")));
    points.crypt = [door + 0.5, ey + 3, z1 - 4];
    // the pediment and the gable roof
    const half = (cx1 - cx0) / 2 + 3;
    for (let y = 0; y <= half * 0.45; y++) {
      const hw = Math.round(half - y / 0.45);
      m.box(door - hw, ey + 7 + y, cz0 - 2, door + hw + 1, ey + 8 + y, z1 - 4, y === 0 ? marble : granite);
    }
    // an urn on each corner of the pediment, a wreath in its tympanum
    for (const ux of [cx0 - 2, cx1 + 1]) (m.box(ux, ey + 7, z1 - 6, ux + 2, ey + 10, z1 - 4, marble), m.set(ux, ey + 10, z1 - 5, marble));
    for (let a = 0; a < 18; a++) m.set(door + Math.cos((a / 18) * Math.PI * 2) * 2.2, ey + 11 + Math.sin((a / 18) * Math.PI * 2) * 2.2, z1 - 3, C("#4f8a72"));
    // the bronze door, ajar: a sliver of green light
    for (let y = py; y < py + 17; y++)
      for (let x = door - 5; x < door + 6; x++) {
        const gap = x === door + 1;
        m.set(x, y, cz1, gap ? E("#5aff9a", 1.4) : (x + y) % 5 === 0 ? C("#4f8a72") : C("#5a4a2a"));
      }
    for (let x = door - 6; x < door + 7; x++) m.set(x, py + 17, cz1, marble);
    for (let y = py; y < py + 18; y++) (m.set(door - 6, y, cz1, marble), m.set(door + 6, y, cz1, marble));
    // green light spilling down the steps
    for (let z = cz1 + 1; z < z1 - 6; z++) if (hash(door, z, 7) > 0.4) m.set(door + 1, py, z, E("#3a9a6a", 0.6));
    points.cryptDoor = [door + 0.5, py, cz1 + 2];
    lights.push([door + 0.5, py + 6, cz1 + 6, "#4aff8a"]);
    walls.push([x0, z0, x1, z1]);
  }

  // ---- the family tombs: a gothic one with pinnacles, a small domed one in green copper
  {
    const t = TOMBS[0];
    const base = groundV(t.z1) + 1;
    const st = shades(["#8a8478", "#827c70", "#928c80"], 2, 41);
    m.box(t.x0 - 1, 0, t.z0 - 1, t.x1 + 1, base, t.z1 + 2, plinth);
    m.box(t.x0, base, t.z0, t.x1, base + 20, t.z1, st);
    const cx = (t.x0 + t.x1) / 2;
    const hw = (t.x1 - t.x0) / 2;
    for (let y = 0; y <= hw; y++) m.box(Math.round(cx - hw + y), base + 20 + y, t.z0, Math.round(cx + hw - y), base + 21 + y, t.z1, shades(["#3c3f4a", "#353844"], 1, 42));
    for (const [px, pz] of [
      [t.x0, t.z1 - 2],
      [t.x1 - 2, t.z1 - 2],
      [t.x0, t.z0],
      [t.x1 - 2, t.z0],
    ]) {
      m.box(px, base, pz, px + 2, base + 30, pz + 2, st);
      m.set(px, base + 30, pz, st);
    }
    // the grille door with a candle behind it
    for (let y = base; y < base + 14; y++) for (let x = Math.round(cx) - 3; x < Math.round(cx) + 4; x++) m.set(x, y, t.z1 - 1, (x + y) % 2 ? iron : C("#120f14"));
    m.set(Math.round(cx), base + 2, t.z1 - 2, E("#ff9a4a", 2));
    walls.push([t.x0 - 1, t.z0 - 1, t.x1 + 1, t.z1 + 2]);
  }
  {
    const t = TOMBS[1];
    const base = groundV(t.z1) + 1;
    const st = shades(["#b8b4aa", "#b0aca2"], 2, 43);
    m.box(t.x0 - 1, 0, t.z0 - 1, t.x1 + 1, base, t.z1 + 2, plinth);
    m.box(t.x0 + 2, base, t.z0 + 2, t.x1 - 2, base + 16, t.z1 - 2, st);
    const cx = (t.x0 + t.x1) / 2,
      cz = (t.z0 + t.z1) / 2;
    m.box(t.x0 + 1, base + 16, t.z0 + 1, t.x1 - 1, base + 18, t.z1 - 1, st);
    for (let y = 0; y < 11; y++) {
      const r = Math.sqrt(Math.max(0, 1 - (y / 11) ** 2)) * ((t.x1 - t.x0) / 2 - 3);
      m.cylinder(cx, base + 18 + y, cz, r, 1, shades(["#4f8a72", "#5a9a7e", "#46806a"], 1, 44));
    }
    m.box(Math.round(cx), base + 29, Math.round(cz), Math.round(cx) + 1, base + 33, Math.round(cz) + 1, C("#b08a3a"));
    for (let y = base; y < base + 11; y++) for (let x = Math.round(cx) - 2; x < Math.round(cx) + 3; x++) m.set(x, y, t.z1 - 2, y % 3 === 0 || x % 2 === 0 ? iron : C("#120f14"));
    walls.push([t.x0 - 1, t.z0 - 1, t.x1 + 1, t.z1 + 2]);
  }

  // ---- the angel on its pedestal, wings spread, weathered marble
  {
    const { x, z } = ANGEL;
    const base = groundV(z);
    const mar = shades(["#d0cec6", "#c4c2ba", "#b8b6ae"], 1, 51);
    m.box(x - 5, base, z - 5, x + 6, base + 2, z + 6, plinth);
    m.box(x - 4, base + 2, z - 4, x + 5, base + 11, z + 5, mar);
    m.box(x - 5, base + 11, z - 5, x + 6, base + 12, z + 6, cap);
    const y0 = base + 12;
    // robe, a little wider at the hem
    for (let y = 0; y < 13; y++) {
      const r = y < 4 ? 2 : 1;
      m.box(x - r, y0 + y, z - 1, x + r + 1, y0 + y + 1, z + 2, mar);
    }
    m.box(x - 1, y0 + 13, z - 1, x + 2, y0 + 16, z + 2, mar);
    // head bowed, hands joined
    m.set(x, y0 + 10, z + 2, mar);
    m.set(x, y0 + 15, z + 2, mar);
    // the wings: two raised fans behind the shoulders
    for (const s of [-1, 1])
      for (let i = 0; i < 9; i++)
        for (let j = 0; j < 12 - i; j++) {
          if (hash(i, j, s + 5) < 0.12) continue;
          m.set(x + s * (2 + i), y0 + 5 + j + Math.round(i * 0.6), z - 2, mar);
        }
    // moss and streaks
    m.paint(x - 4, base + 2, z - 4, x + 5, base + 5, z + 5, (xx, yy, zz) => (hash(xx, yy, zz, 9) > 0.6 ? C("#7e8a6a") : C("#c4c2ba")));
    walls.push([x - 5, z - 5, x + 6, z + 6]);
  }

  // ---- the obelisk
  {
    const { x, z } = OBELISK;
    const base = groundV(z);
    const st = shades(["#7a7670", "#726e68"], 1, 61);
    m.box(x - 5, base, z - 5, x + 6, base + 3, z + 6, plinth);
    m.box(x - 4, base + 3, z - 4, x + 5, base + 9, z + 5, st);
    for (let y = 0; y < 44; y++) {
      const r = Math.max(1, Math.round(3 - y * 0.05));
      m.box(x - r + 1, base + 9 + y, z - r + 1, x + r, base + 10 + y, z + r, st);
    }
    for (let y = 0; y < 3; y++) m.box(x - 1 + y, base + 53 + y, z - 1 + y, x + 2 - y, base + 54 + y, z + 2 - y, st);
    walls.push([x - 5, z - 5, x + 6, z + 6]);
  }

  // ---- the columbarium: a wall of urn niches against the back fence
  {
    const c = COLUMBARIUM;
    const base = groundV(c.z1);
    const st = shades(["#9a958c", "#928d84"], 1, 71);
    m.box(c.x0, base, c.z0, c.x1, base + 18, c.z1, st);
    m.box(c.x0 - 1, base + 18, c.z0, c.x1 + 1, base + 19, c.z1 + 1, cap);
    for (let x = c.x0 + 2; x < c.x1 - 3; x += 4)
      for (let y = base + 2; y < base + 16; y += 4) {
        m.box(x, y, c.z1 - 1, x + 3, y + 3, c.z1, C("#3a3632"));
        m.set(x + 1, y, c.z1, C(hash(x, y, 2) > 0.7 ? "#b08a3a" : "#8a8478"));
        if (hash(x, y, 5) > 0.82) m.set(x + 2, y + 1, c.z1, C("#8a2a3a"));
      }
    walls.push([c.x0 - 1, c.z0, c.x1 + 1, c.z1 + 1]);
  }

  // ---- trees: dead ones (bare crooked branches) and dark cypresses
  const bark = shades(["#3b332e", "#342d29", "#40372f"], 1, 81);
  const twig = C("#4a413a");
  for (const [tx, tz, kind, th] of TREES) {
    const base = groundV(tz);
    const r = rand(tx * 31 + tz);
    if (kind === "cypress") {
      const dark = shades(["#23402c", "#1e3826", "#2a4a32", "#26442e"], 1, tx);
      m.box(tx, base, tz, tx + 2, base + 6, tz + 2, bark);
      for (let y = 4; y < th; y++) {
        const t = (y - 4) / (th - 4);
        const rr = 1.2 + Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * 3.6 * (1 - t * 0.85);
        m.cylinder(tx + 1, base + y, tz + 1, rr * (0.9 + 0.2 * hash(y, tx, tz)), 1, dark);
      }
    } else {
      // trunk with a slight lean, then branches that fork and thin out
      let x = tx,
        z = tz;
      const lx = (r() - 0.5) * 0.2,
        lz = (r() - 0.5) * 0.2;
      const trunkH = Math.round(th * 0.42);
      for (let y = 0; y < trunkH; y++) {
        x += lx;
        z += lz;
        m.box(x - 1, base + y, z - 1, x + 1, base + y + 1, z + 1, bark);
      }
      m.box(tx - 2, base, tz - 2, tx + 2, base + 2, tz + 2, bark);
      const tips: [number, number, number][] = [];
      // a limb: steps of one voxel along (azimuth a, elevation e), drooping a little, then forks
      const branch = (sx: number, sy: number, sz: number, a: number, e: number, len: number, depth: number) => {
        let px = sx,
          py = sy,
          pz = sz;
        for (let i = 0; i < len; i++) {
          const ee = e - i * 0.015 * depth;
          px += Math.cos(a) * Math.cos(ee);
          pz += Math.sin(a) * Math.cos(ee);
          py += Math.sin(ee);
          a += (r() - 0.5) * 0.35;
          m.set(px, py, pz, depth < 2 ? bark : twig);
          if (depth === 0) m.set(px, py - 1, pz, bark);
        }
        if (depth < 3) {
          const n = depth === 0 ? 3 : 2;
          for (let b = 0; b < n; b++) branch(px, py, pz, a + (b - (n - 1) / 2) * 1.1 + (r() - 0.5) * 0.5, Math.max(0.05, e + (r() - 0.5) * 0.6), Math.max(2, Math.round(len * 0.6)), depth + 1);
        } else tips.push([px, py, pz]);
      };
      for (let b = 0; b < 4; b++) branch(x, base + trunkH - 1 - b * 3, z, (b / 4) * Math.PI * 2 + r() * 1.2, 0.35 + r() * 0.45, Math.round(th * 0.2), 0);
      // a few dead leaves still hanging on, at the twigs' ends
      for (const [px, py, pz] of tips) if (r() < 0.25) m.set(px, py - 1, pz, C("#6a4a2a"));
    }
    walls.push([tx - 1, tz - 1, tx + 3, tz + 3]);
  }

  // ---- iron lanterns on posts along the alleys
  for (const [lx, lz] of LANTERNS) {
    const base = groundV(lz);
    m.box(lx - 1, base, lz - 1, lx + 2, base + 2, lz + 2, iron);
    m.box(lx, base + 2, lz, lx + 1, base + 15, lz + 1, iron);
    m.box(lx - 1, base + 15, lz - 1, lx + 2, base + 16, lz + 2, iron2);
    m.box(lx - 1, base + 16, lz - 1, lx + 2, base + 19, lz + 2, E("#ffb860", 2.4));
    m.box(lx - 2, base + 19, lz - 2, lx + 3, base + 20, lz + 3, iron);
    m.set(lx, base + 20, lz, iron2);
    walls.push([lx - 1, lz - 1, lx + 2, lz + 2]);
  }
  lights.push([183.5, groundV(118) + 17, 118, "#ffb070"]);

  // ---- a bench or two for the living, by the cross alley
  for (const bx of [140, 220]) {
    const base = groundV(97);
    m.box(bx, base, 96, bx + 1, base + 2, 97, iron);
    m.box(bx + 10, base, 96, bx + 11, base + 2, 97, iron);
    m.box(bx, base + 2, 95, bx + 11, base + 3, 98, C("#5a4630"));
    m.box(bx, base + 3, 95, bx + 11, base + 6, 96, C("#5a4630"));
    walls.push([bx, 95, bx + 11, 98]);
  }

  points.camPos = [GATE.cx, 120, D + 150];
  points.camLook = [GATE.cx, 10, 80];
  points.keeper = [CRYPT.door, groundV(CRYPT.z1) + 3, CRYPT.z1 - 16];
  void G;
  void FENCE;
  void inside;
  return { model: m, signs: [], door: [CRYPT.door, CRYPT.z1 + 2], body: [0, 0, W, D], walls, lights, scale: k, points };
}
