import type { Kind } from "../scene/voxel/model";
import { C, E, G, VoxelModel } from "../scene/voxel/model";
import { PLOT_VOX } from "../scene/city/plan";

/** A visitor's building: its own small palette (index 0 = empty) and one byte per cell. */
export interface PlotModel {
  w: number;
  h: number;
  d: number;
  palette: { hex: string; kind: Kind }[];
  /** Cells, x fastest, then z, then y (as VoxelModel lays them out). */
  cells: Uint8Array;
}

export const MAX_COLORS = 32;

export function emptyModel(): PlotModel {
  const { w, h, d } = PLOT_VOX;
  return { w, h, d, palette: [], cells: new Uint8Array(w * h * d) };
}

/** As a VoxelModel on the shared palette, to mesh. */
export function toVoxel(m: PlotModel) {
  const v = new VoxelModel(m.w, m.h, m.d);
  const map = m.palette.map((p) => (p.kind === "glass" ? G(p.hex) : p.kind === "emit" ? E(p.hex, 2) : C(p.hex)));
  for (let i = 0; i < m.cells.length; i++) if (m.cells[i]) v.data[i] = map[m.cells[i] - 1] ?? 0;
  return v;
}

/** The wire format: runs of (u16 LE length, u8 index), base64. */
export function encode(m: PlotModel) {
  const out: number[] = [];
  let i = 0;
  while (i < m.cells.length) {
    const c = m.cells[i];
    let n = 1;
    while (i + n < m.cells.length && m.cells[i + n] === c && n < 65535) n++;
    out.push(n & 255, n >> 8, c);
    i += n;
  }
  let bin = "";
  for (const b of out) bin += String.fromCharCode(b);
  return { w: m.w, h: m.h, d: m.d, palette: m.palette, data: btoa(bin) };
}

export function decode(j: { w: number; h: number; d: number; palette: { hex: string; kind: Kind }[]; data: string }): PlotModel | null {
  try {
    const bin = atob(j.data);
    const cells = new Uint8Array(j.w * j.h * j.d);
    let at = 0;
    for (let k = 0; k + 2 < bin.length; k += 3) {
      const n = bin.charCodeAt(k) | (bin.charCodeAt(k + 1) << 8);
      const c = bin.charCodeAt(k + 2);
      if (at + n > cells.length) return null;
      if (c) cells.fill(c, at, at + n);
      at += n;
    }
    return at === cells.length ? { w: j.w, h: j.h, d: j.d, palette: j.palette, cells } : null;
  } catch {
    return null;
  }
}

/** The palette swatches the editor offers (a city's materials: plaster, brick, wood, glass, neon). */
export const SWATCHES: { hex: string; kind: Kind; name: string }[] = [
  { hex: "#f2ece0", kind: "solid", name: "Plaster" },
  { hex: "#cfc6b4", kind: "solid", name: "Stone" },
  { hex: "#8a8073", kind: "solid", name: "Concrete" },
  { hex: "#3b3a42", kind: "solid", name: "Slate" },
  { hex: "#1c1b22", kind: "solid", name: "Night" },
  { hex: "#a8553a", kind: "solid", name: "Brick" },
  { hex: "#7a4a2a", kind: "solid", name: "Wood" },
  { hex: "#c99a5b", kind: "solid", name: "Pine" },
  { hex: "#d0383a", kind: "solid", name: "Red" },
  { hex: "#f4b728", kind: "solid", name: "Zcash gold" },
  { hex: "#3a9a6a", kind: "solid", name: "Green" },
  { hex: "#2e5ab8", kind: "solid", name: "Blue" },
  { hex: "#7a5ac0", kind: "solid", name: "Violet" },
  { hex: "#ff7aa8", kind: "solid", name: "Pink" },
  { hex: "#5f8f4a", kind: "solid", name: "Leaves" },
  { hex: "#9fd8ff", kind: "glass", name: "Glass" },
  { hex: "#2a3a55", kind: "glass", name: "Dark glass" },
  { hex: "#ffe3a3", kind: "emit", name: "Warm light" },
  { hex: "#3ef0ff", kind: "emit", name: "Neon cyan" },
  { hex: "#ff3e8a", kind: "emit", name: "Neon pink" },
  { hex: "#b07bff", kind: "emit", name: "Neon violet" },
  { hex: "#38ff9c", kind: "emit", name: "Neon green" },
  { hex: "#f4b728", kind: "emit", name: "Neon gold" },
  { hex: "#ffffff", kind: "emit", name: "White light" },
];

/** Starting points: a little shop, a narrow apartment house, a neon tower. */
export function template(kind: "shop" | "apartment" | "tower"): PlotModel {
  const m = emptyModel();
  const pal = (hex: string, k: Kind) => {
    let i = m.palette.findIndex((p) => p.hex === hex && p.kind === k);
    if (i < 0) i = m.palette.push({ hex, kind: k }) - 1;
    return i + 1;
  };
  const set = (x: number, y: number, z: number, c: number) => {
    if (x >= 0 && y >= 0 && z >= 0 && x < m.w && y < m.h && z < m.d) m.cells[x + m.w * (z + m.d * y)] = c;
  };
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) => {
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) set(x, y, z, c);
  };
  if (kind === "shop") {
    const wall = pal("#f2ece0", "solid"),
      wood = pal("#7a4a2a", "solid"),
      glass = pal("#9fd8ff", "glass"),
      red = pal("#d0383a", "solid"),
      sign = pal("#ff3e8a", "emit"),
      roof = pal("#3b3a42", "solid");
    box(3, 0, 6, 29, 20, 30, wall);
    box(4, 1, 7, 28, 19, 29, 0);
    box(7, 1, 29, 25, 14, 30, glass);
    box(14, 1, 29, 18, 12, 30, wood);
    box(2, 14, 30, 30, 15, 33, red);
    box(6, 16, 30, 26, 19, 31, sign);
    box(2, 20, 5, 30, 22, 31, roof);
  } else if (kind === "apartment") {
    const wall = pal("#a8553a", "solid"),
      trim = pal("#cfc6b4", "solid"),
      win = pal("#ffe3a3", "emit"),
      dark = pal("#2a3a55", "glass");
    box(5, 0, 5, 27, 42, 27, wall);
    for (let f = 0; f < 6; f++) {
      const y = 2 + f * 7;
      box(5, y + 5, 26, 27, y + 6, 28, trim);
      for (const x of [8, 14, 20]) box(x, y, 26, x + 4, y + 4, 27, (x + f) % 3 ? win : dark);
    }
    box(4, 42, 4, 28, 44, 28, trim);
  } else {
    const steel = pal("#1c1b22", "solid"),
      glass = pal("#2a3a55", "glass"),
      cyan = pal("#3ef0ff", "emit"),
      pink = pal("#ff3e8a", "emit");
    box(9, 0, 9, 23, 46, 23, glass);
    for (let y = 0; y < 46; y += 5) box(9, y, 9, 23, y + 1, 23, steel);
    box(8, 0, 8, 9, 46, 9, cyan);
    box(23, 0, 23, 24, 46, 24, pink);
    box(8, 0, 23, 9, 46, 24, cyan);
    box(23, 0, 8, 24, 46, 9, pink);
  }
  return m;
}
