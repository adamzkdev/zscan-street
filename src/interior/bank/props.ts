import * as THREE from "three";
import { C, E, G, hash, shades, VoxelModel, type Paint } from "../../scene/voxel/model";

/**
 * The bank's furniture as voxel models (6 voxels per metre), meshed once and cloned. Each model's
 * front faces +z; the mesher centres the footprint on the origin with the bottom at y = 0.
 */

export const V = {
  marbleDark: shades(["#1b1a1f", "#222027", "#17161b", "#1e1c22"], 1, 31),
  marble: shades(["#d8d0bf", "#cfc6b3", "#e2dbcc", "#d3cab8"], 1, 32),
  marbleShade: shades(["#b9b09e", "#aaa290", "#c2baa8"], 1, 33),
  gold: shades(["#f4b728", "#e0a420", "#ffc94a"], 1, 34),
  goldDark: shades(["#a8771a", "#94681a", "#b3801f"], 1, 35),
  brass: shades(["#c89b3c", "#b88b34", "#d4a646"], 1, 36),
  wood: shades(["#3b2418", "#45291b", "#341f15"], 1, 37),
  woodLight: shades(["#5a3a24", "#64412a", "#52351f"], 1, 38),
  plaster: shades(["#17151b", "#1a181f", "#151318"], 2, 39),
  steel: shades(["#3a3a44", "#34343d", "#40404a"], 1, 40),
  steelLight: shades(["#6a6a78", "#5e5e6c", "#74747f"], 1, 41),
  steelDark: shades(["#1f1f26", "#24242c", "#1b1b21"], 1, 42),
  concrete: shades(["#2a292e", "#2f2e33", "#26252a"], 2, 43),
  velvet: shades(["#8a1c2c", "#7a1626", "#962234"], 1, 44),
  leather: shades(["#1d4d3a", "#1a4433", "#215640"], 1, 45),
  leaf: shades(["#2f6b3c", "#3d8a4a", "#285c33", "#357a42", "#4a9a52"], 1, 46),
  pot: shades(["#141317", "#1a191e"], 1, 47),
  soil: C("#2a1d14"),
  black: C("#0e0d11"),
  glass: G("#9fc4d8"),
  crystal: G("#dff0ff"),
  litGold: E("#f4b728", 1.6),
  litLine: E("#f4b728", 1.15),
  litWarm: E("#ffd28a", 1.1),
  litPanel: E("#d9b47a", 0.75),
  litGreen: E("#3fdc8a", 1.6),
  litCyan: E("#3de0ff", 1.25),
  litPink: E("#ff3d8b", 2),
  litRed: E("#ff4040", 2),
  litBlue: E("#6aa8ff", 0.6),
};

const at = (p: Paint, x: number, y: number, z: number) => (typeof p === "number" ? p : p(x, y, z));

// ---- architecture ------------------------------------------------------------------------------

/** Fluted ivory column with a gold base, gold bands, neon flutes and a capital. */
export function column(h = 54) {
  const m = new VoxelModel(9, h, 9);
  const c = 4.5;
  m.box(0, 0, 0, 9, 3, 9, V.marbleDark);
  m.box(0, 3, 0, 9, 4, 9, V.gold);
  m.box(1, 4, 1, 8, 5, 8, V.marbleDark);
  const flutes: Paint = (x, _y, z) => {
    const a = Math.atan2(z + 0.5 - c, x + 0.5 - c);
    return Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12) % 2 ? at(V.marble, x, _y, z) : at(V.marbleShade, x, _y, z);
  };
  m.cylinder(c, 5, c, 3.3, h - 12, flutes);
  for (const y of [Math.floor(h * 0.36), Math.floor(h * 0.36) + 1]) m.cylinder(c, y, c, 3.6, 1, V.gold);
  // neon threads up the four sides
  for (let y = 8; y < h - 10; y++) {
    if (y >= Math.floor(h * 0.36) - 1 && y <= Math.floor(h * 0.36) + 2) continue;
    m.set(4, y, 1, V.litLine);
    m.set(4, y, 7, V.litLine);
    m.set(1, y, 4, V.litLine);
    m.set(7, y, 4, V.litLine);
  }
  m.box(1, h - 7, 1, 8, h - 6, 8, V.gold);
  m.box(0, h - 6, 0, 9, h - 4, 9, V.marbleDark);
  m.box(0, h - 4, 0, 9, h - 3, 9, V.litWarm);
  m.box(0, h - 3, 0, 9, h, 9, V.marbleDark);
  return m;
}

/** The coffered ceiling: dark beams on a grid, gold beam soffits, a light panel in every other coffer. */
export function ceiling(w: number, d: number, step = 24) {
  const m = new VoxelModel(w, 5, d);
  m.box(0, 4, 0, w, 5, d, C("#100e14"));
  for (let z = 0; z < d; z++)
    for (let x = 0; x < w; x++) {
      const bx = x % step < 2,
        bz = z % step < 2;
      if (bx || bz) {
        m.box(x, 1, z, x + 1, 4, z + 1, V.marbleDark);
        m.set(x, 0, z, (bx && x % step === 0) || (bz && z % step === 0) ? V.gold : V.goldDark);
        continue;
      }
      const ix = Math.floor(x / step),
        iz = Math.floor(z / step);
      const lx = x % step,
        lz = z % step;
      // stepped coffer: one inner ring lower
      if (lx < 4 || lx > step - 3 || lz < 4 || lz > step - 3) m.set(x, 3, z, V.marbleDark);
      if ((ix + iz) % 2 === 0) {
        if (lx >= 8 && lx < step - 6 && lz >= 8 && lz < step - 6) m.set(x, 3, z, V.litPanel);
        else if (lx === 7 || lx === step - 6 || lz === 7 || lz === step - 6) m.set(x, 3, z, V.gold);
      } else if (Math.hypot(lx - step / 2 + 1, lz - step / 2 + 1) < 3) m.set(x, 3, z, V.gold);
    }
  return m;
}

/** A long teller counter: dark wood panels, gold rails, a marble top with a glowing lip. */
export function counter(len: number) {
  const m = new VoxelModel(len, 7, 7);
  m.box(0, 0, 0, len, 6, 6, V.wood);
  m.box(0, 0, 5, len, 1, 7, V.marbleDark);
  for (let x = 0; x < len; x++) {
    if (x % 10 < 2) m.box(x, 1, 5, x + 1, 5, 6, V.woodLight);
  }
  m.box(0, 1, 5, len, 2, 6, V.goldDark);
  m.box(0, 4, 5, len, 5, 6, V.litLine);
  m.box(0, 5, 0, len, 6, 7, V.gold);
  m.box(0, 6, 0, len, 7, 7, V.marbleDark);
  return m;
}

/**
 * A key terminal as a bank writing desk: a marble pedestal with gold rims and a sloped top that
 * carries the screen (added separately, see KIOSK_SCREEN). Low, so it never hides the hall.
 */
export function kiosk() {
  const m = new VoxelModel(8, 11, 6);
  m.box(0, 0, 0, 8, 1, 6, V.marbleDark);
  m.box(1, 1, 1, 7, 2, 5, V.gold);
  m.box(2, 2, 2, 6, 6, 4, V.marbleDark);
  for (const [x, z] of [
    [2, 3],
    [5, 3],
  ])
    m.box(x, 2, z, x + 1, 6, z + 1, V.brass);
  // the sloped top: 4 voxels of rise over 6 of depth, front (+z) low
  for (let z = 0; z < 6; z++) {
    const top = 7 + Math.round(((5 - z) * 4) / 5);
    m.box(0, 6, z, 8, top, z + 1, V.marbleDark);
    m.set(0, top - 1, z, V.gold);
    m.set(7, top - 1, z, V.gold);
  }
  m.box(0, 6, 5, 8, 7, 6, V.gold);
  m.box(1, 1, 5, 7, 2, 6, V.litLine);
  return m;
}
/** Where the screen sits on the kiosk (local metres) and its tilt. */
export const KIOSK_SCREEN = { y: 1.5 + 0.025, z: 0.017, tilt: -Math.atan2(6, 4) };

/** A leather bench on brass legs (2.7 m). */
export function bench() {
  const m = new VoxelModel(16, 6, 4);
  for (const x of [1, 14]) m.box(x, 0, 0, x + 1, 2, 4, V.brass);
  m.box(0, 2, 0, 16, 3, 4, V.leather);
  m.box(0, 2, 0, 16, 6, 1, V.leather);
  m.box(0, 6, 0, 16, 7, 1, V.gold);
  for (let x = 2; x < 16; x += 3) m.set(x, 4, 1, V.gold);
  return m;
}

/** Steel cabinets of drawers, with dials, behind the tellers. */
export function cabinets(n: number) {
  const m = new VoxelModel(n * 7, 14, 4);
  for (let i = 0; i < n; i++) {
    const x0 = i * 7;
    m.box(x0, 0, 0, x0 + 6, 14, 4, V.steelDark);
    for (let y = 1; y < 13; y += 3) {
      m.box(x0 + 1, y, 3, x0 + 5, y + 2, 4, V.steel);
      m.set(x0 + 3, y + 1, 3, hash(i, y, 0) > 0.7 ? V.litGold : V.brass);
    }
  }
  return m;
}

/** The round plinth of the key island. */
export function plinth() {
  const m = new VoxelModel(21, 5, 21);
  m.cylinder(10.5, 0, 10.5, 10.5, 1, V.marbleDark);
  m.cylinder(10.5, 1, 10.5, 10.5, 1, V.litGold, true);
  m.cylinder(10.5, 1, 10.5, 9.5, 3, V.marbleDark);
  m.cylinder(10.5, 4, 10.5, 9.5, 1, V.gold, true);
  m.cylinder(10.5, 4, 10.5, 8.5, 1, V.black);
  m.cylinder(10.5, 4, 10.5, 3, 1, V.litGold);
  return m;
}

/** A steel pallet for the gold. */
export function pallet(w: number, d: number) {
  const m = new VoxelModel(w, 1, d);
  m.box(0, 0, 0, w, 1, d, V.steelDark);
  for (let x = 0; x < w; x += 4) m.box(x, 0, 0, x + 1, 1, d, V.steel);
  return m;
}

// ---- vault ---------------------------------------------------------------------------------------

/** A gold bar: a trapezoid prism, for the instanced piles. */
export function barGeometry(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      p.setX(i, p.getX(i) * 0.82);
      p.setZ(i, p.getZ(i) * 0.7);
    }
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return g;
}
