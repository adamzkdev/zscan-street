/**
 * PLANET GRAB's ground: one picture of tile faces for each world (grass, sand, paving, planks, steel
 * plates), drawn like the city's own pixels: a tile is a 32 × 32 grid of flat "voxels", eight texels
 * each, so it reads crisp from the play camera and in the intro's close passes. The planet's mesh maps
 * each tile's top to one cell (CELLS); its bevel and sides take a flat colour from their corners (the
 * plain cell). The cells are painted in their real colours (TONE): the corners only tint them a little.
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { canvasTex } from "../../k3";

/** Texels a cell, cells a side, texels a voxel, texels the uv keeps clear of a cell's edge (the neighbour's mips). */
const CELL = 256;
const GRID = 4;
const PX = 8;
const PAD = 6;

/** The tiles' base colours, world by world (the planet's bevels are cut from them). */
export const TONE = {
  meadow: { grass: "#6cc05e", sand: "#f1d898", plaza: "#efe6f6", path: "#dcc592", bed: "#2a7fcf" },
  tide: { planks: "#d7a56e", grass: "#55c070", sand: "#f6e0a8", bed: "#3aa6d8" },
  foundry: { plate: "#7b84a2", rust: "#8f745e", bed: "#2a2632", plaza: "#aab2ca" },
};

/** Which cells hold what (a list: variants, picked by the tile's hash). */
export const CELLS = {
  meadow: { grass: [0, 1, 2], flower: [3], sand: [4, 5], plaza: [6, 7], path: [8], bed: [9] },
  tide: { planks: [0, 1], grass: [2, 3], sand: [4, 5, 6], bed: [7] },
  foundry: { plate: [0, 1, 2], rust: [3], bed: [4], plaza: [5, 6] },
  plain: 15,
};

/** A cell's uv box: [u0, v0, u1, v1]. */
export function cellUv(i: number): [number, number, number, number] {
  const cx = i % GRID,
    cy = Math.floor(i / GRID);
  const S = CELL * GRID;
  return [(cx * CELL + PAD) / S, 1 - ((cy + 1) * CELL - PAD) / S, ((cx + 1) * CELL - PAD) / S, 1 - (cy * CELL + PAD) / S];
}

const tmp = new THREE.Color();
const ink = new THREE.Color();
/** A colour a shade lighter (k > 0, toward white) or darker (k < 0, toward black). */
function shade(hex: string, k: number) {
  tmp.set(hex).lerp(ink.set(k > 0 ? "#ffffff" : "#000000"), Math.abs(k));
  return `#${tmp.getHexString()}`;
}

/** A cell being painted: boxes of voxels from its top left (0…31). */
class Pen {
  constructor(
    private g: CanvasRenderingContext2D,
    private ox: number,
    private oy: number,
    readonly r: () => number,
  ) {}
  fill(c: string) {
    this.g.fillStyle = c;
    this.g.fillRect(this.ox, this.oy, CELL, CELL);
  }
  box(x: number, y: number, w: number, h: number, c: string) {
    this.g.fillStyle = c;
    this.g.fillRect(this.ox + x * PX, this.oy + y * PX, w * PX, h * PX);
  }
  int(n: number) {
    return Math.floor(this.r() * n);
  }
}

/** Grass: soft patches a shade off, blades with their shade, clover, a few flowers. */
function grass(p: Pen, base: string, blades: number, clover: number, flowers: number) {
  p.fill(base);
  for (let i = 0; i < 26; i++) p.box(p.int(29), p.int(30), 2 + p.int(3), 1 + p.int(2), shade(base, (p.r() < 0.5 ? -1 : 1) * (0.03 + p.r() * 0.035)));
  for (let i = 0; i < clover; i++) {
    const x = 2 + p.int(27),
      y = 2 + p.int(27);
    p.box(x, y, 2, 2, shade(base, -0.13));
    p.box(x, y, 1, 1, shade(base, 0.08));
  }
  for (let i = 0; i < blades; i++) {
    const x = 1 + p.int(29),
      y = 1 + p.int(27),
      h = 2 + p.int(2);
    p.box(x, y, 1, h, shade(base, 0.16));
    p.box(x + 1, y + 1, 1, h, shade(base, -0.11));
  }
  const pal = ["#ffffff", "#fff27a", "#ff9ad5", "#bfe2ff", "#ffffff"];
  for (let i = 0; i < flowers; i++) {
    const x = 3 + p.int(26),
      y = 3 + p.int(26),
      c = pal[p.int(pal.length)];
    p.box(x - 1, y + 1, 3, 1, shade(base, -0.18));
    p.box(x - 1, y, 3, 1, c);
    p.box(x, y - 1, 1, 3, c);
    p.box(x, y, 1, 1, "#ffb21e");
  }
}

/** Sand: wind ripples, grains, now and then a shell. */
function sand(p: Pen, base: string, shells: number) {
  p.fill(base);
  for (let i = 0; i < 20; i++) {
    const x = p.int(25),
      y = 1 + p.int(29),
      w = 3 + p.int(5);
    p.box(x, y, w, 1, shade(base, -0.07));
    p.box(x + 1, y + 1, w, 1, shade(base, 0.2));
  }
  for (let i = 0; i < 16; i++) p.box(p.int(32), p.int(32), 1, 1, shade(base, -0.13));
  const pal = ["#ff9db0", "#ffffff", "#ffc48a"];
  for (let i = 0; i < shells; i++) {
    const x = 3 + p.int(25),
      y = 3 + p.int(25),
      c = pal[p.int(pal.length)];
    p.box(x, y, 2, 2, c);
    p.box(x, y + 2, 2, 1, shade(base, -0.2));
    p.box(x + 1, y, 1, 1, shade(c, -0.15));
  }
}

/** Paving: n × n stones with a joint, each a shade of its own, lit from the top left. */
function paving(p: Pen, base: string, n: number, mark = false) {
  p.fill(shade(base, -0.22));
  const s = 32 / n;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const c = shade(base, (p.r() - 0.5) * 0.07);
      const x = i * s + 1,
        y = j * s + 1,
        w = s - 2;
      p.box(x, y, w, w, c);
      p.box(x, y, w, 1, shade(c, 0.35));
      p.box(x, y, 1, w, shade(c, 0.35));
      p.box(x, y + w - 1, w, 1, shade(c, -0.1));
      p.box(x + w - 1, y, 1, w, shade(c, -0.1));
      for (let k = 0; k < 3 * (4 / n); k++) p.box(x + 2 + p.int(w - 4), y + 2 + p.int(w - 4), 1, 1, shade(c, -0.09));
    }
  if (mark) {
    // (an inlaid ring on the slab: the start's plaza)
    const c = "#b9a0ff";
    p.box(11, 9, 10, 1, c);
    p.box(11, 22, 10, 1, c);
    p.box(9, 11, 1, 10, c);
    p.box(22, 11, 1, 10, c);
    p.box(10, 10, 1, 1, c);
    p.box(21, 10, 1, 1, c);
    p.box(10, 21, 1, 1, c);
    p.box(21, 21, 1, 1, c);
  }
}

/** A trodden path: packed earth, pebbles, a tuft creeping in. */
function path(p: Pen, base: string, grassC: string) {
  p.fill(base);
  for (let i = 0; i < 22; i++) p.box(p.int(29), p.int(31), 2 + p.int(3), 1, shade(base, (p.r() < 0.6 ? -1 : 1) * 0.07));
  for (let i = 0; i < 7; i++) {
    const x = 2 + p.int(27),
      y = 2 + p.int(27);
    p.box(x, y, 2, 2, "#cfc6da");
    p.box(x, y, 2, 1, "#eeeaf6");
    p.box(x, y + 2, 2, 1, shade(base, -0.2));
  }
  for (let i = 0; i < 5; i++) {
    const x = 1 + p.int(29),
      y = 1 + p.int(28);
    p.box(x, y, 1, 2, shade(grassC, 0.1));
    p.box(x + 1, y + 1, 1, 1, shade(grassC, -0.1));
  }
}

/** A pond's or a lagoon's bed: darker, pebbles and a ripple of light. */
function bed(p: Pen, base: string) {
  p.fill(base);
  for (let i = 0; i < 18; i++) p.box(p.int(28), p.int(31), 2 + p.int(4), 1, shade(base, 0.12));
  for (let i = 0; i < 9; i++) {
    const x = 2 + p.int(27),
      y = 2 + p.int(27);
    p.box(x, y, 2, 2, shade(base, -0.2));
    p.box(x, y, 1, 1, shade(base, 0.2));
  }
}

/** A boardwalk: four boards, their joints, nails, the grain. */
function planks(p: Pen, base: string, shift: number) {
  p.fill(base);
  for (let b = 0; b < 4; b++) {
    const y0 = b * 8;
    const c = shade(base, b % 2 ? -0.05 : 0.04);
    p.box(0, y0, 32, 7, c);
    p.box(0, y0, 32, 1, shade(c, 0.22));
    p.box(0, y0 + 7, 32, 1, shade(base, -0.38));
    const x = (b * 11 + 5 + shift) % 26;
    p.box(x + 2, y0, 1, 7, shade(base, -0.38));
    p.box(x, y0 + 2, 1, 1, shade(base, -0.45));
    p.box(x + 4, y0 + 2, 1, 1, shade(base, -0.45));
    p.box(x, y0 + 5, 1, 1, shade(base, -0.45));
    p.box(x + 4, y0 + 5, 1, 1, shade(base, -0.45));
    for (let k = 0; k < 4; k++) p.box(p.int(26), y0 + 2 + p.int(4), 3 + p.int(4), 1, shade(c, -0.09));
  }
}

/** A steel plate: its seam, a lit edge, rivets; scratches (0), a tread (1), a grate (2) or bare (3) by `kind`. */
function plate(p: Pen, base: string, kind: number) {
  p.fill(base);
  const dark = shade(base, -0.28),
    hi = shade(base, 0.2),
    lo = shade(base, -0.1);
  p.box(0, 0, 32, 1, dark);
  p.box(0, 31, 32, 1, dark);
  p.box(0, 0, 1, 32, dark);
  p.box(31, 0, 1, 32, dark);
  p.box(1, 1, 30, 1, hi);
  p.box(1, 1, 1, 30, hi);
  p.box(1, 30, 30, 1, lo);
  p.box(30, 1, 1, 30, lo);
  for (const [x, y] of [
    [3, 3],
    [27, 3],
    [3, 27],
    [27, 27],
  ]) {
    p.box(x, y, 2, 2, shade(base, 0.4));
    p.box(x + 1, y + 1, 1, 1, dark);
  }
  if (kind === 0) {
    for (let i = 0; i < 5; i++) {
      const x = 5 + p.int(18),
        y = 5 + p.int(18),
        n = 2 + p.int(4),
        s = p.r() < 0.5 ? 1 : -1;
      for (let k = 0; k < n; k++) p.box(x + k, y + (s > 0 ? k : n - k), 1, 1, shade(base, 0.14));
    }
    for (let i = 0; i < 10; i++) p.box(4 + p.int(24), 4 + p.int(24), 1, 1, lo);
  } else if (kind === 1) {
    // (a tread: short bars, turned one way then the other)
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 5; i++) {
        const x = 6 + i * 4,
          y = 6 + j * 4;
        if ((i + j) % 2) (p.box(x, y, 1, 3, hi), p.box(x + 1, y, 1, 3, lo));
        else (p.box(x, y + 1, 3, 1, hi), p.box(x, y + 2, 3, 1, lo));
      }
  } else if (kind === 2) {
    // (a grate: slots, dark, a lit lip under each)
    for (let k = 0; k < 4; k++) {
      p.box(8, 8 + k * 4, 16, 2, shade(base, -0.5));
      p.box(8, 10 + k * 4, 16, 1, hi);
    }
  }
}

/** A rusted plate: the plate, eaten by patches. */
function rust(p: Pen, base: string, steel: string) {
  plate(p, steel, 0);
  for (let i = 0; i < 9; i++) {
    const x = 3 + p.int(22),
      y = 3 + p.int(22);
    p.box(x, y, 3 + p.int(4), 2 + p.int(3), base);
    p.box(x + 1, y + 1, 2, 1, shade(base, -0.18));
    p.box(x - 1, y + 1, 1, 1, shade(base, 0.12));
  }
}

/** The start's pad in the foundry: a lighter plate, yellow brackets in its corners. */
function pad(p: Pen, base: string, cross: boolean) {
  plate(p, base, 3);
  const y = "#ffc21e";
  for (const [x0, y0, sx, sy] of [
    [3, 3, 1, 1],
    [28, 3, -1, 1],
    [3, 28, 1, -1],
    [28, 28, -1, -1],
  ]) {
    for (let k = 0; k < 6; k++) (p.box(x0 + sx * k, y0, 1, 1, y), p.box(x0, y0 + sy * k, 1, 1, y));
  }
  if (cross) {
    p.box(15, 11, 2, 10, shade(base, -0.2));
    p.box(11, 15, 10, 2, shade(base, -0.2));
  } else for (let i = 0; i < 8; i++) p.box(7 + p.int(18), 7 + p.int(18), 1, 1, shade(base, -0.1));
}

export type World3 = "meadow" | "tide" | "foundry";

/** The world's tile picture (sRGB, mipped; the planet's material maps it). */
export function tileAtlas(level: World3) {
  const S = CELL * GRID;
  const tex = canvasTex(S, S, (g) => {
    // (the plain cell and whatever is not painted: white, the corners' colour alone)
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, S, S);
    const r = rng(level === "meadow" ? 9101 : level === "tide" ? 9202 : 9303);
    const cell = (i: number, f: (p: Pen) => void) => {
      const ox = (i % GRID) * CELL,
        oy = Math.floor(i / GRID) * CELL;
      g.save();
      g.beginPath();
      g.rect(ox, oy, CELL, CELL);
      g.clip();
      f(new Pen(g, ox, oy, r));
      g.restore();
    };
    if (level === "meadow") {
      const t = TONE.meadow;
      cell(0, (p) => grass(p, t.grass, 16, 2, 0));
      cell(1, (p) => grass(p, t.grass, 26, 4, 0));
      cell(2, (p) => grass(p, t.grass, 9, 6, 1));
      cell(3, (p) => grass(p, t.grass, 14, 2, 7));
      cell(4, (p) => sand(p, t.sand, 0));
      cell(5, (p) => sand(p, t.sand, 2));
      cell(6, (p) => paving(p, t.plaza, 2));
      cell(7, (p) => paving(p, t.plaza, 1, true));
      cell(8, (p) => path(p, t.path, t.grass));
      cell(9, (p) => bed(p, t.bed));
    } else if (level === "tide") {
      const t = TONE.tide;
      cell(0, (p) => planks(p, t.planks, 0));
      cell(1, (p) => planks(p, t.planks, 9));
      cell(2, (p) => grass(p, t.grass, 18, 3, 1));
      cell(3, (p) => grass(p, t.grass, 10, 5, 4));
      cell(4, (p) => sand(p, t.sand, 0));
      cell(5, (p) => sand(p, t.sand, 1));
      cell(6, (p) => sand(p, t.sand, 3));
      cell(7, (p) => bed(p, t.bed));
    } else {
      const t = TONE.foundry;
      cell(0, (p) => plate(p, t.plate, 0));
      cell(1, (p) => plate(p, t.plate, 1));
      cell(2, (p) => plate(p, t.plate, 2));
      cell(3, (p) => rust(p, t.rust, t.plate));
      cell(4, (p) => bed(p, t.bed));
      cell(5, (p) => pad(p, t.plaza, false));
      cell(6, (p) => pad(p, t.plaza, true));
    }
  });
  tex.anisotropy = 8;
  return tex;
}

/**
 * A water picture that tiles: short bright strokes, each with a fainter echo under it (the cartoon's
 * sea). White on nothing: it is laid over the water's colour and slid along (two of them, across each
 * other, shimmer). `n`: how many strokes; `w`, `h`: its size in texels.
 */
export function waveTex(seed: number, n: number, w = 256, h = 256) {
  const r = rng(seed);
  const tex = canvasTex(
    w,
    h,
    (g) => {
      g.clearRect(0, 0, w, h);
      g.lineCap = "round";
      for (let i = 0; i < n; i++) {
        const x = r() * w,
          y = r() * h,
          len = 16 + r() * 30,
          bow = 3 + r() * 4,
          a = 0.55 + r() * 0.45;
        // (drawn again past each edge it crosses, so it tiles)
        for (const ox of [-w, 0, w])
          for (const oy of [-h, 0, h]) {
            const X = x + ox,
              Y = y + oy;
            if (X < -len || X > w + len || Y < -12 || Y > h + 12) continue;
            g.strokeStyle = `rgba(255,255,255,${a})`;
            g.lineWidth = 3.2;
            g.beginPath();
            g.moveTo(X - len / 2, Y);
            g.quadraticCurveTo(X, Y - bow, X + len / 2, Y);
            g.stroke();
            g.strokeStyle = `rgba(255,255,255,${a * 0.4})`;
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(X - len * 0.3, Y + 6);
            g.quadraticCurveTo(X, Y + 6 - bow * 0.6, X + len * 0.3, Y + 6);
            g.stroke();
          }
      }
    },
    true,
  );
  return tex;
}
