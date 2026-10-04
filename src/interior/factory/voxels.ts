import * as THREE from "three";
import { C, E, hash, shades, VoxelModel, type Paint } from "../../scene/voxel/model";
import { meshModel, toObject } from "../../scene/voxel/mesher";

/**
 * Voxel pieces of the mining hall. Big machinery is drawn at the city's 6 voxels per metre;
 * small, close-up furniture (cabinets, desks) at 12 per metre (`scale` 0.5) for detail.
 */

export const GOLD = "#f4b728";
const hazard = (k = 4): Paint => (x, y) => ((x + y) % k < k / 2 ? C(GOLD) : C("#141317"));
const steel = shades(["#2b2a33", "#2f2e38", "#282730"], 1, 21);
const steelLight = shades(["#4a4855", "#52505d", "#46444f"], 1, 22);

/** A model as an object, no shadows, optionally scaled. */
export function vox(m: VoxelModel, scale = 1) {
  const g = toObject(m, { shadows: false });
  g.scale.setScalar(scale);
  return g;
}

/** Geometries of a model (solid / glass / emit), for instancing. */
export function voxGeos(m: VoxelModel, scale = 1) {
  const geos = meshModel(m);
  for (const g of Object.values(geos)) g?.scale(scale, scale, scale);
  return geos;
}

// ---- ASIC cabinet (12 vox/m): 1.0 × 2.25 × 0.83 m, front +z ------------------------------------

export const CAB = { w: 12, h: 27, d: 10, s: 1 / 12 };
/** Hash board rows (voxel y) on the cabinet front. */
export const BLADES = [3, 10, 17];

export function cabinetModel() {
  const m = new VoxelModel(CAB.w, CAB.h, CAB.d);
  const body = C("#16151b");
  m.box(0, 0, 0, 12, 26, 9, body);
  // side vents
  m.paint(0, 3, 0, 1, 24, 9, (_x, y, z) => (y % 3 === 0 && z > 1 && z < 8 ? C("#0c0b10") : C("#24232b")));
  m.paint(11, 3, 0, 12, 24, 9, (_x, y, z) => (y % 3 === 0 && z > 1 && z < 8 ? C("#0c0b10") : C("#24232b")));
  // plinth with hazard paint
  m.box(0, 0, 0, 12, 2, 10, hazard(4));
  // front frame posts and cross bars
  m.box(0, 2, 9, 1, 26, 10, steelLight);
  m.box(11, 2, 9, 12, 26, 10, steelLight);
  for (const y0 of BLADES) {
    m.box(1, y0 - 1, 9, 11, y0, 10, C("#3d3b47"));
    // the hash board: a grille, a fan port, an LED column on the right (instanced LEDs go there)
    m.box(1, y0, 9, 11, y0 + 6, 10, (x, y) => ((x + y) % 2 ? C("#26252d") : C("#30303a")));
    m.box(1, y0 + 1, 9, 5, y0 + 5, 10, C("#0b0a0e"));
    m.box(2, y0 + 2, 9, 4, y0 + 4, 10, C("#6e6a78"));
    m.set(1, y0 + 1, 9, C("#3d3b47"));
    m.set(4, y0 + 1, 9, C("#3d3b47"));
    m.set(1, y0 + 4, 9, C("#3d3b47"));
    m.set(4, y0 + 4, 9, C("#3d3b47"));
    m.box(6, y0, 9, 11, y0 + 6, 10, C("#0f0e13"));
    m.set(10, y0 + 5, 9, E("#3ddc97", 1.4));
  }
  // top: label sticker and exhaust grille
  m.box(1, 23, 9, 11, 26, 10, (x) => (x % 2 ? C("#0d0c11") : C("#1e1d24")));
  m.box(1, 23, 9, 5, 24, 10, C("#d8d4cc"));
  // fan shroud on the roof
  m.cylinder(6, 26, 4.5, 4.2, 1, C("#3d3b47"), true);
  // cable gland at the back
  m.box(4, 22, 0, 8, 26, 1, C("#0c0b10"));
  return m;
}

/** Positions (cabinet-local metres) of the status LEDs on the front: 2 × 3 per hash board. */
export function ledSlots() {
  const out: [number, number, number][] = [];
  const z = (CAB.d / 2) * CAB.s + 0.012;
  for (const y0 of BLADES)
    for (const dy of [4, 2])
      for (const vx of [7, 8, 9]) out.push([(vx + 0.5) * CAB.s - (CAB.w / 2) * CAB.s, (y0 + dy + 0.5) * CAB.s, z]);
  return out;
}

/** Four-blade fan, lying flat (spins around y). */
export function fanBladeModel(r = 4) {
  const n = r * 2;
  const m = new VoxelModel(n, 1, n);
  const blade = C("#9a97a4"),
    hub = C(GOLD);
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const dx = x + 0.5 - r,
        dz = z + 0.5 - r;
      const d = Math.hypot(dx, dz);
      if (d > r) continue;
      if (d < 1.1) m.set(x, 0, z, hub);
      else if (Math.abs(dx - dz * 0.35) < 0.9 || Math.abs(dz + dx * 0.35) < 0.9) m.set(x, 0, z, blade);
    }
  return m;
}

/** Big wall exhaust fan housing (6 vox/m), facing +z, with a grille ring. Blades are separate. */
export function wallFanHousing() {
  const m = new VoxelModel(14, 14, 3);
  m.box(0, 0, 0, 14, 14, 2, steel);
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 14; x++) {
      const d = Math.hypot(x + 0.5 - 7, y + 0.5 - 7);
      if (d < 6) m.set(x, y, 1, d > 5 ? C("#4a4855") : 0);
      if (d < 5) m.set(x, y, 0, C("#060509"));
    }
  // hazard corners and a little red warning lamp
  for (const [x, y] of [
    [0, 0],
    [12, 0],
    [0, 12],
    [12, 12],
  ])
    m.box(x, y, 2, x + 2, y + 2, 3, hazard(2));
  m.set(13, 7, 2, E("#ff3a3a", 2.5));
  return m;
}

/** Big fan rotor: blades in the x/y plane (spins around z). */
export function wallFanRotor() {
  const m = new VoxelModel(10, 10, 1);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 10; x++) {
      const dx = x + 0.5 - 5,
        dy = y + 0.5 - 5;
      const a = Math.atan2(dy, dx),
        d = Math.hypot(dx, dy);
      if (d > 5) continue;
      if (d < 1.2) m.set(x, y, 0, C(GOLD));
      else if (Math.sin(a * 3 + d * 0.35) > 0.35) m.set(x, y, 0, C("#7d7a88"));
    }
  return m;
}

// ---- the block press (6 vox/m): 2.67 × 4.67 × 2.33 m, front +z ----------------------------------

export function pressModel() {
  const m = new VoxelModel(16, 28, 14);
  // base
  m.box(0, 0, 0, 16, 5, 14, steel);
  m.box(0, 3, 0, 16, 4, 14, hazard(4));
  // die bed
  m.box(3, 4, 2, 13, 5, 12, C("#5d5a66"));
  m.box(3, 4, 12, 13, 5, 13, E(GOLD, 1.4));
  // columns
  for (const [x, z] of [
    [0, 1],
    [13, 1],
    [0, 10],
    [13, 10],
  ])
    m.box(x, 5, z, x + 3, 21, z + 3, (_x, y) => (y % 6 < 1 ? C("#141317") : C("#3d3b47")));
  // hydraulic cylinder above the ram
  m.box(6, 15, 5, 10, 21, 9, shades(["#9a97a4", "#8d8a95", "#a8a5b2"], 1, 4));
  // crown with a gold strip and the stencil band
  m.box(0, 21, 0, 16, 26, 14, steel);
  m.box(1, 23, 14 - 1, 15, 24, 14, E(GOLD, 2.4));
  m.box(0, 21, 13, 16, 22, 14, hazard(4));
  // oil tank and beacons on top
  m.box(2, 26, 3, 8, 28, 9, C("#7a2a26"));
  m.box(11, 26, 9, 13, 28, 11, E("#ff4a2a", 2.6));
  m.box(11, 26, 3, 13, 28, 5, E("#ffb02a", 2.6));
  // hoses down the sides
  for (const x of [-0.0, 15]) for (let y = 6; y < 21; y++) m.set(x, y, 7 + (y % 4 === 0 ? 1 : 0), C("#101014"));
  return m;
}

/** The ram that comes down on the die. */
export function ramModel() {
  const m = new VoxelModel(10, 4, 10);
  m.box(0, 0, 0, 10, 4, 10, steelLight);
  m.box(0, 0, 0, 10, 1, 10, C("#7d7a88"));
  m.box(0, 1, 9, 10, 2, 10, E(GOLD, 1.8));
  // stamp face: a Z
  m.box(2, 0, 2, 8, 1, 3, C(GOLD));
  m.box(2, 0, 7, 8, 1, 8, C(GOLD));
  for (let i = 0; i < 4; i++) m.set(6 - i, 0, 3 + i, C(GOLD));
  return m;
}

/** Control console beside the press. */
export function consoleModel() {
  const m = new VoxelModel(8, 9, 5);
  m.box(0, 0, 0, 8, 7, 5, steel);
  m.box(0, 7, 0, 8, 9, 3, steel);
  m.box(1, 7, 3, 7, 8, 4, C("#0b0a0e"));
  m.set(1, 7, 3, E("#3ddc97", 2));
  m.set(3, 7, 3, E(GOLD, 2));
  m.set(5, 7, 3, E("#ff3a3a", 2.5));
  m.box(1, 8, 2, 7, 9, 3, E("#4ad0ff", 1.3));
  m.box(0, 0, 4, 8, 1, 5, hazard(2));
  m.box(6, 5, 4, 7, 6, 5, E("#ff2a2a", 2.4));
  return m;
}

// ---- conveyor (6 vox/m), running along +z -----------------------------------------------------

export function conveyorModel(len: number) {
  const m = new VoxelModel(7, 5, len);
  for (let z = 0; z < len; z += 9) for (const x of [0, 6]) m.box(x, 0, z, x + 1, 3, z + 1, C("#24232b"));
  const rail: Paint = (_x, y, z) => ((z + y) % 4 < 2 ? C(GOLD) : C("#141317"));
  m.box(0, 3, 0, 1, 5, len, rail);
  m.box(6, 3, 0, 7, 5, len, rail);
  m.box(1, 3, 0, 6, 4, len, (_x, _y, z) => (z % 2 ? C("#8d8a95") : C("#3a3742")));
  // motor box under the far end, an end stop
  m.box(1, 0, len - 5, 6, 3, len - 1, C("#24304a"));
  m.box(0, 4, len - 1, 7, 5, len, C("#8a2a26"));
  return m;
}

// ---- crate pallet, rollup door ----------------------------------------------------------------

export function palletModel() {
  const m = new VoxelModel(8, 1, 8);
  m.box(0, 0, 0, 8, 1, 8, (x, _y, z) => ((x + z) % 3 ? C("#7a5a38") : C("#5a4028")));
  return m;
}

/** Roll-up shutter half open, with its drum (6 vox/m), across x (thin in z): `w` wide. */
export function shutterModel(w: number, h: number, open: number) {
  const m = new VoxelModel(w + 2, h + 3, 3);
  m.box(0, 0, 0, 1, h + 3, 3, hazard(4));
  m.box(w + 1, 0, 0, w + 2, h + 3, 3, hazard(4));
  m.box(0, h, 0, w + 2, h + 3, 3, steel);
  for (let y = h - open; y < h; y++) m.box(1, y, 1, w + 1, y + 1, 2, y % 2 ? C("#5d5a66") : C("#4a4855"));
  m.box(1, h - open, 2, w + 1, h - open + 1, 3, E(GOLD, 1.6));
  return m;
}

// ---- overhead: trusses and high-bay lamps over the whole hall ----------------------------------

/** The roof structure: trusses every 4 m across z, purlins along x, high-bay lamps (6 vox/m). */
export function roofModel(W: number, D: number, lamps: [number, number][]) {
  const m = new VoxelModel(W, 12, D);
  const beam = C("#2a2833");
  const beamL = C("#3a3844");
  for (let x = 6; x < W; x += 24) {
    m.box(x, 10, 0, x + 2, 12, D, beam);
    m.box(x, 5, 0, x + 2, 6, D, beamL);
    for (let z = 0; z < D; z++) {
      const k = z % 12;
      const y = 5 + Math.round((k < 6 ? k : 12 - k) * (5 / 6));
      m.box(x, y, z, x + 2, y + 1, z + 1, beam);
    }
  }
  for (let z = 10; z < D; z += 30) m.box(0, 11, z, W, 12, z + 1, beamL);
  for (const [lx, lz] of lamps) {
    m.box(lx - 4, 2, lz - 2, lx + 4, 4, lz + 2, C("#1c1b22"));
    m.box(lx - 3, 1, lz - 1, lx + 3, 2, lz + 1, E("#fff0d2", 2.2));
    m.box(lx - 4, 1, lz - 2, lx + 4, 2, lz - 1, C("#0f0e13"));
    m.box(lx - 4, 1, lz + 1, lx + 4, 2, lz + 2, C("#0f0e13"));
    m.box(lx, 4, lz, lx + 1, 11, lz + 1, C("#101014"));
  }
  return m;
}

/** A long cable tray over a cabinet row, hung from the roof, with drops to each cabinet (6 vox/m). */
export function trayModel(len: number, drops: number[], h: number) {
  const m = new VoxelModel(len, h, 4);
  const cab = [C("#101014"), C("#1d3a8a"), C("#c08a1a"), C("#8a1d2a"), C("#14141a")];
  m.box(0, 5, 0, len, 6, 4, C("#5d5a66"));
  m.box(0, 6, 0, len, 7, 1, C("#5d5a66"));
  m.box(0, 6, 3, len, 7, 4, C("#5d5a66"));
  m.box(0, 6, 1, len, 7, 3, (x, _y, z) => cab[Math.floor(hash(Math.floor(x / 5), 0, z, 3) * cab.length)]);
  // short hangers (the rest of the rod is lost in the dark of the roof)
  for (let x = 2; x < len; x += 24) m.box(x, 7, 1, x + 1, h, 2, C("#1c1b22"));
  for (const dx of drops) {
    m.box(dx, 0, 1, dx + 1, 5, 2, C("#101014"));
    m.box(dx + 1, 1, 2, dx + 2, 5, 3, cab[1 + (dx % 3)]);
  }
  return m;
}

/** Wall pipe run along x with flanges every 2 m (6 vox/m). */
export function pipeModel(len: number, color: string) {
  const m = new VoxelModel(len, 2, 2);
  m.box(0, 0, 0, len, 2, 2, shades([color, color, "#8d8a95"].slice(0, 2), 1, 2));
  for (let x = 6; x < len; x += 12) m.box(x, 0, 0, x + 1, 2, 2, C("#1c1b22"));
  return m;
}

/** Steel column (I-beam) with a hazard foot (6 vox/m). */
export function columnModel(h: number) {
  const m = new VoxelModel(3, h, 3);
  m.box(0, 0, 0, 3, h, 3, steelLight);
  m.box(1, 0, 0, 2, h, 1, 0);
  m.box(1, 0, 2, 2, h, 3, 0);
  m.box(0, 0, 0, 3, 6, 3, hazard(2));
  m.box(1, 0, 0, 2, 6, 1, 0);
  m.box(1, 0, 2, 2, 6, 3, 0);
  return m;
}

/** Big screen bezel (6 vox/m) for a w × h metre screen, gold lit edges. */
export function bezelModel(wv: number, hv: number) {
  const m = new VoxelModel(wv + 2, hv + 2, 2);
  m.box(0, 0, 0, wv + 2, hv + 2, 1, C("#121117"));
  m.box(0, 0, 1, wv + 2, 1, 2, steel);
  m.box(0, hv + 1, 1, wv + 2, hv + 2, 2, steel);
  m.box(0, 0, 1, 1, hv + 2, 2, steel);
  m.box(wv + 1, 0, 1, wv + 2, hv + 2, 2, steel);
  for (let x = 2; x < wv; x += 4) m.set(x, 0, 2 - 1, E(GOLD, 1.8));
  for (let x = 2; x < wv; x += 4) m.set(x, hv + 1, 1, E(GOLD, 1.8));
  return m;
}

// ---- lobby and control room furniture ---------------------------------------------------------

/** Row of lockers (12 vox/m): `n` doors. */
export function lockersModel(n: number) {
  const m = new VoxelModel(n * 6, 24, 6);
  for (let i = 0; i < n; i++) {
    const c = i % 3 === 1 ? C("#2e5ab8") : C("#3a5a7a");
    m.box(i * 6, 0, 0, i * 6 + 6, 24, 6, c);
    m.box(i * 6, 0, 5, i * 6 + 1, 24, 6, C("#1c1b22"));
    m.box(i * 6 + 2, 19, 5, i * 6 + 5, 20, 6, C("#14141a"));
    m.box(i * 6 + 2, 17, 5, i * 6 + 5, 18, 6, C("#14141a"));
    m.set(i * 6 + 4, 11, 5, C("#c0c0c8"));
  }
  m.box(0, 0, 5, n * 6, 1, 6, C("#14141a"));
  return m;
}

/** Operator desk (12 vox/m): 2.4 × 0.8 m, gold edge strip, keyboard, mug, clutter. */
export function deskModel(seed: number) {
  const m = new VoxelModel(29, 11, 10);
  const top = C("#2b2933");
  m.box(0, 8, 0, 29, 9, 10, top);
  m.box(0, 8, 9, 29, 9, 10, E(GOLD, 1.6));
  for (const x of [0, 28]) m.box(x, 0, 0, x + 1, 8, 10, C("#1c1b22"));
  m.box(1, 2, 0, 28, 8, 1, C("#1c1b22"));
  // PC tower with a lit stripe
  m.box(22, 0, 2, 26, 7, 8, C("#121117"));
  m.box(22, 5, 8, 26, 6, 8, 0);
  m.box(25, 1, 8 - 1, 26, 6, 8, E(seed % 2 ? "#4ad0ff" : "#ff3ad0", 2));
  // keyboard, mouse, mug, papers
  m.box(9, 9, 6, 19, 10, 8, (x) => (x % 2 ? C("#3d3b47") : C("#2b2933")));
  m.box(21, 9, 6, 22, 10, 7, C("#c0c0c8"));
  m.box(3 + (seed % 3), 9, 6, 5 + (seed % 3), 11, 8, C(seed % 2 ? "#d8d4cc" : GOLD));
  m.box(24, 9, 4, 28, 10, 8, C("#d8d4cc"));
  return m;
}

/** Monitor stand and back shell for a flat screen (12 vox/m). */
export function monitorStand() {
  const m = new VoxelModel(4, 3, 3);
  m.box(0, 0, 0, 4, 1, 3, C("#1c1b22"));
  m.box(1.5, 1, 1, 2.5, 3, 2, C("#1c1b22"));
  return m;
}

/** Elevator doors with a floor indicator (6 vox/m), facing +z. */
export function elevatorModel() {
  const m = new VoxelModel(12, 18, 2);
  m.box(0, 0, 0, 12, 18, 1, steel);
  m.box(1, 0, 1, 11, 14, 2, (x) => (x === 5 || x === 6 ? C("#1c1b22") : C("#8d8a95")));
  m.box(0, 14, 1, 12, 15, 2, hazard(2));
  m.box(4, 15, 1, 8, 17, 2, C("#0b0a0e"));
  m.box(5, 16, 1, 7, 17, 2, E(GOLD, 2.2));
  m.set(11, 7, 1, E("#3ddc97", 2.2));
  return m;
}

/** Railing along x (12 vox/m): posts every 1.5 m, a steel handrail with a gold light line, a kick plate. Glass is separate. */
export function railingModel(len: number) {
  const m = new VoxelModel(len, 14, 3);
  for (let x = 0; x < len; x += 18) m.box(x, 0, 0, x + 1, 14, 3, C("#3d3b47"));
  m.box(0, 13, 1, len, 14, 3, C("#3d3b47"));
  m.box(0, 12, 2, len, 13, 3, E(GOLD, 1.6));
  m.box(0, 0, 1, len, 2, 2, (x) => (x % 6 < 3 ? C(GOLD) : C("#141317")));
  return m;
}

/** A parcel out of the proof press: cardboard, tape in its transaction's colour, its txid on a label. */
export function parcelTexture(txid: string, color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const browns = ["#c8a070", "#bf9766", "#d0a878", "#b88f5e"];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      g.fillStyle = browns[Math.floor(hash(x, y, txid.charCodeAt(0), 5) * browns.length)];
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  // tape across both ways
  g.fillStyle = color;
  g.fillRect(0, 56, 128, 16);
  g.fillRect(56, 0, 16, 128);
  // the shipping label
  g.fillStyle = "#f2efe6";
  g.fillRect(14, 82, 100, 34);
  g.fillStyle = "#14120f";
  g.textAlign = "center";
  g.font = '800 13px "JetBrains Mono", Menlo, monospace';
  g.fillText("PROOF ✓", 64, 97);
  g.font = '600 12px "JetBrains Mono", Menlo, monospace';
  g.fillText(`${txid.slice(0, 6)}…${txid.slice(-4)}`, 64, 111);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}


/** Spare ASIC boxes on a pallet (12 vox/m): cardboard, tape, a label, a red "fragile" mark. */
export function boxStackModel(seed: number) {
  const m = new VoxelModel(16, 20, 12);
  m.box(0, 0, 0, 16, 2, 12, (x, _y, z) => ((x + z) % 3 ? C("#7a5a38") : C("#5a4028")));
  const card = [C("#9a7a50"), C("#8a6a44"), C("#a8875a")];
  const spots: [number, number, number][] = [
    [0, 2, 0],
    [8, 2, 0],
    [0, 2, 6],
    [8, 2, 6],
    [0, 8, 0],
    [8, 8, 6],
    [4, 14, 3],
  ];
  spots.forEach(([x, y, z], i) => {
    if (i >= 4 + (seed % 4)) return;
    m.box(x, y, z, x + 8, y + 6, z + 6, card[(i + seed) % 3]);
    m.box(x + 3, y + 5, z, x + 5, y + 6, z + 6, C("#c8b48a"));
    m.box(x + 1, y + 1, z + 5, x + 5, y + 3, z + 6, C("#e8e4dc"));
    m.box(x + 1, y + 2, z + 5, x + 4, y + 3, z + 6, C("#2a2830"));
    m.set(x + 6, y + 2, z + 5, C("#c0302a"));
  });
  return m;
}
