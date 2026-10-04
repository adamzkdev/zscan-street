import * as THREE from "three";
import { toObject } from "../../scene/voxel/mesher";
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

const cache = new Map<string, THREE.Group>();
const at = (p: Paint, x: number, y: number, z: number) => (typeof p === "number" ? p : p(x, y, z));

/** A meshed model, built on first use and cloned after (geometry and materials shared). */
export function vox(key: string, make: () => VoxelModel) {
  let g = cache.get(key);
  if (!g) {
    g = toObject(make(), { shadows: false });
    g.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });
    cache.set(key, g);
  }
  return g.clone();
}

/** A disc in the x–y plane (for round things that face +z). */
function disc(m: VoxelModel, cx: number, cy: number, r: number, z0: number, z1: number, c: Paint, r0 = -1) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r && d >= r0) m.box(x, y, z0, x + 1, y + 1, z1, c);
    }
}

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

/** A hall wall section: wood wainscot with a gold rail, plaster, marble pilasters with neon lines, a lit cornice. */
export function hallWall(len: number, h = 54, pil = 24) {
  const m = new VoxelModel(len, h, 3);
  m.box(0, 0, 0, len, h, 2, V.plaster);
  m.box(0, 0, 0, len, 8, 3, V.wood);
  for (let x = 0; x < len; x++) if (x % 12 === 6) m.box(x, 1, 2, x + 1, 7, 3, V.woodLight);
  m.box(0, 8, 1, len, 9, 3, V.gold);
  for (let p = pil / 2; p < len; p += pil) {
    m.box(p - 2, 0, 0, p + 2, h, 3, V.marbleDark);
    m.box(p - 2, 9, 2, p - 1, h - 6, 3, V.goldDark);
    m.box(p + 1, 9, 2, p + 2, h - 6, 3, V.goldDark);
    m.box(p, 10, 2, p + 1, h - 8, 3, V.litLine);
  }
  m.box(0, h - 7, 2, len, h - 6, 3, V.litWarm);
  m.box(0, h - 6, 1, len, h - 5, 3, V.gold);
  m.box(0, h - 5, 0, len, h, 3, V.marbleDark);
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

/** Bronze doors in a gold arch, with a lit transom. */
export function entrance() {
  const m = new VoxelModel(30, 36, 3);
  for (let y = 0; y < 36; y++)
    for (let x = 0; x < 30; x++) {
      const inArch = y < 24 || Math.hypot(x + 0.5 - 15, y - 24) < 15;
      if (!inArch) continue;
      m.box(x, y, 0, x + 1, y + 1, 2, V.marbleDark);
      const inner = y < 24 ? x >= 3 && x < 27 : Math.hypot(x + 0.5 - 15, y - 24) < 12;
      if (inner) {
        const ring = y >= 24 && Math.hypot(x + 0.5 - 15, y - 24) > 11;
        m.box(x, y, 1, x + 1, y + 1, 2, y >= 24 ? (ring ? V.gold : (x + y) % 3 === 0 ? V.goldDark : V.litWarm) : V.brass);
      } else m.set(x, y, 2, V.gold);
    }
  // door leaves, panels and handles
  for (let x = 3; x < 27; x++) for (let y = 0; y < 23; y++) m.set(x, y, 2, (x - 3) % 12 === 0 || y % 7 === 0 ? V.goldDark : C("#5a3f1c"));
  m.box(14, 0, 2, 16, 23, 3, V.black);
  for (const x of [12, 17]) m.box(x, 9, 2, x + 1, 14, 3, V.gold);
  return m;
}

/** Elevator doors in a gold frame with a floor indicator. */
export function elevator() {
  const m = new VoxelModel(18, 30, 2);
  m.box(0, 0, 0, 18, 26, 1, V.marbleDark);
  m.box(0, 0, 1, 18, 26, 2, V.gold);
  m.box(2, 0, 1, 16, 22, 2, V.steelLight);
  m.box(8, 0, 1, 10, 22, 2, V.steelDark);
  m.box(4, 23, 1, 14, 25, 2, V.black);
  m.box(5, 23, 1, 7, 25, 2, V.litRed);
  m.box(10, 23, 1, 13, 25, 2, V.litGold);
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

/** Brass mullions and a top rail above the counter; the glass itself is a separate pane. */
export function screenFrame(len: number, every: number) {
  const m = new VoxelModel(len, 8, 1);
  for (let x = 0; x <= len; x += every) m.box(Math.min(x, len - 1), 0, 0, Math.min(x, len - 1) + 1, 8, 1, V.brass);
  m.box(0, 7, 0, len, 8, 1, V.gold);
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

/** A teller cage over one window: brass bars, an arched opening, a gold rail and cresting. */
export function tellerCage(w = 36, h = 11, window = true) {
  const m = new VoxelModel(w, h, 1);
  const c = w / 2;
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h - 2; y++) {
      const dx = Math.abs(x + 0.5 - c);
      const open = window && dx < 5 && (y < 5 || Math.hypot(dx, y - 5) < 5);
      const ring = window && !open && dx < 6.2 && (y < 5 ? dx >= 5 : Math.hypot(dx, y - 5) < 6.2);
      if (ring) m.set(x, y, 0, V.gold);
      else if (!open && (x % 4 === 2 || y === 0)) m.set(x, y, 0, V.brass);
    }
  m.box(0, 0, 0, 1, h, 1, V.gold);
  m.box(w - 1, 0, 0, w, h, 1, V.gold);
  m.box(0, h - 2, 0, w, h - 1, 1, V.gold);
  for (let x = 1; x < w - 1; x += 3) m.set(x, h - 1, 0, V.goldDark);
  return m;
}

/** A crown of lights: two gold rings with candles, crystal drops and a lit heart. */
export function chandelier() {
  const m = new VoxelModel(23, 16, 23);
  const c = 11.5;
  m.box(11, 9, 11, 12, 16, 12, V.goldDark);
  m.cylinder(c, 4, c, 11, 1, V.gold, true);
  m.cylinder(c, 6, c, 7, 1, V.gold, true);
  m.cylinder(c, 3, c, 3, 6, V.brass);
  m.cylinder(c, 1, c, 2, 2, V.litWarm);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const x = c + Math.cos(a) * 10.3 - 0.5,
      z = c + Math.sin(a) * 10.3 - 0.5;
    m.set(x, 5, z, V.litWarm);
    m.set(x, 6, z, V.litGold);
    m.set(x, 3, z, V.crystal);
    if (k % 2) m.set(x, 2, z, V.crystal);
    const x2 = c + Math.cos(a + 0.26) * 6.4 - 0.5,
      z2 = c + Math.sin(a + 0.26) * 6.4 - 0.5;
    if (k % 2 === 0) {
      m.set(x2, 7, z2, V.litWarm);
      m.set(x2, 5, z2, V.crystal);
    }
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    for (let r = 3; r < 11; r++) m.set(c + Math.cos(a) * r - 0.5, 4 + Math.floor((11 - r) / 3), c + Math.sin(a) * r - 0.5, V.goldDark);
  }
  return m;
}

/** A potted palm. */
export function plant(seed: number) {
  const m = new VoxelModel(12, 22, 12);
  m.cylinder(6, 0, 6, 3.2, 5, V.pot);
  m.cylinder(6, 4, 6, 3.4, 1, V.gold);
  m.cylinder(6, 5, 6, 2.6, 1, V.soil);
  m.box(5, 5, 5, 7, 12, 7, C("#4a3426"));
  m.blob(6, 13, 6, 4.5, V.leaf, 0.35, seed);
  m.blob(4, 16, 7, 3.5, V.leaf, 0.35, seed + 1);
  m.blob(8, 18, 5, 3, V.leaf, 0.35, seed + 2);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + seed;
    for (let r = 2; r < 6; r++) m.set(6 + Math.cos(a) * r, 15 - r * 0.8, 6 + Math.sin(a) * r, V.leaf);
  }
  return m;
}

/** Green banker's lamp. */
export function bankerLamp() {
  const m = new VoxelModel(4, 4, 3);
  m.box(1, 0, 1, 3, 1, 2, V.brass);
  m.box(2, 1, 1, 3, 3, 2, V.brass);
  m.box(0, 3, 0, 4, 4, 3, V.litGreen);
  return m;
}

/** Two brass posts with a sagging velvet rope (2 m). */
export function stanchion() {
  const m = new VoxelModel(13, 7, 3);
  for (const x of [1, 11]) {
    m.box(x - 1, 0, 0, x + 2, 1, 3, V.brass);
    m.box(x, 1, 1, x + 1, 6, 2, V.brass);
    m.set(x, 6, 1, V.gold);
  }
  for (let x = 2; x < 11; x++) m.set(x, 5 - Math.round(1.3 * Math.sin((Math.PI * (x - 1)) / 10)), 1, V.velvet);
  return m;
}

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

/** A floating key, all light: the hologram over the island (faces +z, long axis vertical). */
export function holoKey() {
  const m = new VoxelModel(13, 30, 2);
  const lit = E("#ffcf5a", 1.35);
  const hot = E("#fff0c0", 1.8);
  disc(m, 6.5, 23.5, 6, 0, 2, lit, 3.6);
  disc(m, 6.5, 23.5, 2.2, 0, 2, hot);
  m.box(5, 2, 0, 8, 18, 2, lit);
  m.box(6, 3, 0, 7, 17, 1, hot);
  for (const [y, w] of [
    [2, 4],
    [5, 3],
    [8, 4],
  ] as const)
    m.box(8, y, 0, 8 + w, y + 2, 2, lit);
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

/** The vault wall: riveted steel with a round opening framed in gold, hazard stripes at the sill. */
export function vaultWall(w = 48, h = 27, r = 10.5, cy = r, body: Paint = V.steel, rivet: Paint = V.steelLight) {
  const m = new VoxelModel(w, h, 5);
  const cx = w / 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < r) continue;
      const isRivet = x % 4 === 1 && y % 4 === 1;
      m.box(x, y, 0, x + 1, y + 1, 4, (x2, y2, z2) => (isRivet && z2 === 3 ? at(rivet, x2, y2, z2) : at(body, x2, y2, z2)));
      if (d < r + 2) m.box(x, y, 0, x + 1, y + 1, 5, d < r + 1 ? V.gold : V.goldDark);
      else if (d < r + 2.6) m.set(x, y, 4, V.litGold);
    }
  if (cy === r) for (let x = 0; x < w; x++) if (Math.abs(x + 0.5 - cx) >= r) m.set(x, 0, 4, Math.floor(x / 2) % 2 ? C("#f4b728") : V.black);
  return m;
}

/** The round vault door: steel disc, gold rings, locking bolts and a spoked wheel (faces +z). */
export function vaultDoor(r = 10.2) {
  const S = Math.ceil(2 * (r + 3)),
    c = S / 2;
  const m = new VoxelModel(S, S, 7);
  disc(m, c, c, r, 0, 5, V.steel);
  // machined face: concentric bands
  for (let k = r - 1; k > 2; k -= 2) disc(m, c, c, k, 4, 5, Math.round(k) % 4 < 2 ? V.steelLight : V.steelDark, k - 1);
  disc(m, c, c, r, 4, 5, V.steelLight, r - 1);
  disc(m, c, c, r - 1.5, 5, 6, V.gold, r - 2.5);
  disc(m, c, c, 6.6, 5, 6, V.litGold, 6);
  disc(m, c, c, 2.4, 5, 7, V.gold);
  disc(m, c, c, 1, 6, 7, V.litGold);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    for (let d = r - 1; d < r + 2.6; d += 0.5) m.box(c + Math.cos(a) * d - 0.5, c + Math.sin(a) * d - 0.5, 1, c + Math.cos(a) * d + 0.5, c + Math.sin(a) * d + 0.5, 4, V.steelLight);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    for (let d = 2; d < 7.5; d += 0.5) m.set(c + Math.cos(a) * d - 0.5, c + Math.sin(a) * d - 0.5, 6, V.brass);
    m.set(c + Math.cos(a) * 7.5 - 0.5, c + Math.sin(a) * 7.5 - 0.5, 6, V.gold);
  }
  // the hinge block on the left
  m.box(Math.round(c - r - 2), 4, 0, Math.round(c - r + 1), S - 4, 3, V.steelDark);
  return m;
}

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
