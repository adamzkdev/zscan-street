import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BAY, CURB } from "../city/plan";
import { GROUND, groundMat } from "../real/ground";
import { maps } from "../real/tex";
import { plantTrees, type Species } from "../real/trees";
import { realMotorYacht } from "../real/yachts";
import { VILLA } from "./plan";

/**
 * YOUR VILLA's outside (src/gta/home.ts; plan: ./plan.ts VILLA): a white modernist house on its own
 * walled plot at Orchard Keys' north point, its back to the strait — the Golden Gate and the city
 * across the water. Plain geometry in the photographed sets, mapped in world metres (ground.ts):
 *
 *  - the street wall along Note Street's pavement, its gate (slid open) at the end of Sinsemilla
 *    Street, lanterns on the pillars, the name on a plaque;
 *  - the forecourt in pale setts and, right behind the gate, the motor court where your car and your
 *    bike wait nose to the gate (plan.ts VILLA.car / bike), palms in planters;
 *  - the house: two low wings (the kitchen's, the bedroom's) and the tall pavilion of the great room
 *    between them, white render under thin cantilevered roofs, the porch cut into the pavilion with
 *    its teak pivot door (the game's door is that one), glass full height on the sea;
 *  - the terrace in travertine slabs: the pool (its water swum in: plan.ts villaPool), loungers and
 *    parasols, the outdoor lounge, the bar under its pergola, lawns, hedges and palms;
 *  - the sea wall, glass along its edge, and a motor yacht moored to it.
 *
 * By night the rooms behind the glass, the pool, the lanterns and the downlights glow (meshes whose
 * material says `night`: the theme shows them), and a few real lights join the city's lamps.
 *
 * Built once, on the main thread (a few dozen boxes: no worker needed), merged per material, the
 * meshes standing at the plot's centre (what measures a mesh's size on screen measures from there).
 */

type Parts = Map<THREE.Material, THREE.BufferGeometry[]>;
export interface VillaOut {
  group: THREE.Group;
  /** The house itself (its walls, roofs, glass): hidden while its rooms' view of the city is taken. */
  house: THREE.Group;
  /** Trunks and posts a car is pushed off (x, z, radius). */
  circles: [number, number, number][];
}

const V = VILLA;
const HS = V.house;
const CX = (V.x0 + V.x1) / 2,
  CZ = (V.z0 + V.z1) / 2;
const F0 = V.floor;
/** The wings' and the pavilion's roof slabs (their undersides). */
const WING_TOP = F0 + 4.0,
  HALL_TOP = F0 + 6.9;

let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const std = (color: string, roughness: number, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.userData.shared = true;
    return m;
  };
  const glow = (color: string, k = 1) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });
    m.userData.night = true;
    return m;
  };
  // the glass: dark, reflecting the sky by day; a little of the rooms behind shows through
  // (the sun's and the moon's glint on it kept soft: a mirror's pin-point of light bloomed into a blaze)
  const glass = new THREE.MeshPhysicalMaterial({ color: "#3d5866", roughness: 0.1, metalness: 0.2, specularIntensity: 0.35, transparent: true, opacity: 0.42, envMapIntensity: 1.6, depthWrite: false });
  const rail = new THREE.MeshPhysicalMaterial({ color: "#cfe3ea", roughness: 0.1, metalness: 0, specularIntensity: 0.35, transparent: true, opacity: 0.22, envMapIntensity: 1.3, depthWrite: false });
  // the rooms seen through it: lit by day softly, warm at night (the theme swaps the colour)
  const room = std("#b9b2a6", 0.9);
  room.userData.dayColor = "#b9b2a6";
  room.userData.nightColor = "#b8946c";
  room.emissive.set("#000000");
  return {
    render: groundMat({ set: "Plaster001", tint: "#f7f4ee", tile: 3.2, rough: 0.85, normal: 0.25, anti: 0.5, patches: 0.12 }),
    // (large panels of pale limestone: smooth, a faint vein, no blocks)
    cladding: groundMat({ set: "Marble021", tint: "#e4d3b8", tile: 3.4, rough: 0.6, normal: 0.12, anti: 0.3, patches: 0.05 }),
    gravel: groundMat({ set: "Gravel022", tint: "#e8e4dc", tile: 2, rough: 1, normal: 0.6, anti: 0.6, patches: 0.2 }),
    slabs: groundMat({ set: "PavingStones128", tint: "#f1e6d2", tile: 3.2, rough: 0.75, normal: 0.55, anti: 0.3, patches: 0.1 }),
    setts: groundMat({ set: "PavingStones070", tint: "#efe6d4", tile: 2.2, rough: 0.9, normal: 0.7, anti: 0.4, patches: 0.2 }),
    marble: groundMat({ set: "Marble021", tint: "#f5f2ec", tile: 2, rough: 0.3, normal: 0.25, anti: 0.3, patches: 0 }),
    // the copings and the wall caps out in the weather: pale cast stone, matt (the polished marble —
    // its photographed roughness near a mirror's, whatever the factor — caught the sky's light at a
    // glance from the water and bloomed into a white blaze along the sea wall by night)
    coping: groundMat({ set: "Concrete034", tint: "#e9e2d4", tile: 2, rough: 1, normal: 0.3, anti: 0.4, patches: 0.06 }),
    deck: groundMat({ set: "Planks021", tint: "#b58660", tile: 2.4, rough: 0.7, normal: 0.6, anti: 0.2, patches: 0 }),
    teak: groundMat({ set: "Wood049", tint: "#8a5a3a", tile: 1.5, rough: 0.55, normal: 0.6, anti: 0.2, patches: 0 }),
    seawall: groundMat({ set: "Concrete031", tint: "#ddd2bf", tile: 3, rough: 0.9, normal: 0.9, anti: 0.4, patches: 0.4 }),
    lawn: GROUND.lawn(),
    steel: std("#1d1f24", 0.4, 0.7),
    chrome: std("#d4d8de", 0.2, 1),
    cushion: std("#f3efe6", 0.95),
    canvas: std("#efe8da", 0.9),
    planter: std("#e9e4da", 0.8),
    pool: std("#86d4e4", 0.35),
    fender: std("#f2f2f2", 0.5),
    rope: std("#d8cbb0", 0.9),
    soffit: std("#f2efe8", 0.95),
    glass,
    rail,
    room,
    lantern: glow("#ffd29a", 2.2),
    window: (() => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffc98a").multiplyScalar(0.5), toneMapped: false, transparent: true, opacity: 0.38, depthWrite: false });
      m.userData.night = true;
      return m;
    })(),
    downlight: glow("#fff1d8", 1.8),
    poolGlow: (() => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color("#4fe2ff").multiplyScalar(1.1), toneMapped: false, transparent: true, opacity: 0.55, depthWrite: false });
      m.userData.night = true;
      return m;
    })(),
  };
}

export function buildVilla(lamps: { pos: THREE.Vector3; color: string; intensity?: number }[]): VillaOut {
  const M = (mats ??= makeMats());
  /** The grounds' pieces, the house's (`into` says which the next ones go to). */
  const grounds: Parts = new Map(),
    houseParts: Parts = new Map();
  let into = grounds;
  const circles: [number, number, number][] = [];
  const add = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const l = into.get(m);
    if (l) l.push(g);
    else into.set(m, [g]);
  };
  /** A box between world coordinates (x0…x1, y0…y1, z0…z1). */
  const box = (m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    add(m, new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate((x0 + x1) / 2 - CX, (y0 + y1) / 2, (z0 + z1) / 2 - CZ));
  /** A flat pane facing ±z (along x) or ±x (along z), between two corners, `y0…y1` high. */
  const pane = (m: THREE.Material, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.PlaneGeometry(len, y1 - y0);
    if (Math.abs(z1 - z0) > Math.abs(x1 - x0)) g.rotateY(Math.PI / 2);
    add(m, g.translate((x0 + x1) / 2 - CX, (y0 + y1) / 2, (z0 + z1) / 2 - CZ));
  };
  const cyl = (m: THREE.Material, x: number, y0: number, y1: number, z: number, r: number, r2 = r, seg = 16) => add(m, new THREE.CylinderGeometry(r2, r, y1 - y0, seg).translate(x - CX, (y0 + y1) / 2, z - CZ));
  const light = (x: number, y: number, z: number, color = "#ffd29a", intensity = 6) => lamps.push({ pos: new THREE.Vector3(x, y, z), color, intensity });

  // ---- the ground: the terrace, the forecourt, the lawns (on the plot raised to the street) ----
  const P = V.pool;
  const top = CURB,
    base = CURB - 0.12;
  // the terrace in travertine slabs, round the pool
  box(M.slabs, V.x0 + 0.3, V.x1 - 0.3, base, top, V.z0 + 0.3, P.z0 - 0.4);
  box(M.slabs, V.x0 + 0.3, P.x0 - 0.4, base, top, P.z0 - 0.4, HS.z0);
  box(M.slabs, P.x1 + 0.4, 300, base, top, P.z0 - 0.4, HS.z0);
  box(M.slabs, P.x0 - 0.4, P.x1 + 0.4, base, top, P.z1 + 0.4, HS.z0);
  // the pool's marble coping (flush), its shell, its floor; the water is its own mesh (below)
  for (const [x0, x1, z0, z1] of [
    [P.x0 - 0.4, P.x1 + 0.4, P.z0 - 0.4, P.z0],
    [P.x0 - 0.4, P.x1 + 0.4, P.z1, P.z1 + 0.4],
    [P.x0 - 0.4, P.x0, P.z0, P.z1],
    [P.x1, P.x1 + 0.4, P.z0, P.z1],
  ])
    box(M.coping, x0, x1, top - 0.06, top + 0.01, z0, z1);
  box(M.pool, P.x0, P.x1, P.floor - 0.1, P.floor, P.z0, P.z1);
  for (const [x0, x1, z0, z1] of [
    [P.x0, P.x1, P.z0, P.z0 + 0.12],
    [P.x0, P.x1, P.z1 - 0.12, P.z1],
    [P.x0, P.x0 + 0.12, P.z0, P.z1],
    [P.x1 - 0.12, P.x1, P.z0, P.z1],
  ])
    box(M.pool, x0, x1, P.floor, top - 0.06, z0, z1);
  // the steps down into it at the west end, the bench along the east one
  // (step k, from the wall: 0.4 m deep, 0.32 m lower than the one before — plan.ts villaPool knows them)
  for (let k = 0; k < 4; k++) box(M.pool, P.x0 + 0.12, P.x0 + 0.12 + 0.4 * (k + 1), P.floor, P.surface - 0.25 - k * 0.32, P.z0 + 0.12, P.z1 - 0.12);
  box(M.pool, P.x1 - 0.62, P.x1 - 0.12, P.floor, P.surface - 0.5, P.z0 + 0.12, P.z1 - 0.12);
  // the east lawn and the west garden; between the house and the lawn, the motor court off the gate
  box(M.lawn, 313.6, V.x1 - 0.3, base, top + 0.02, HS.z0 - 1.2, HS.z1);
  box(M.setts, HS.x1 + 0.6, 313.6, base, top, HS.z0 + 0.4, HS.z1);
  box(M.lawn, V.x0 + 0.3, HS.x0 - 0.6, base, top + 0.02, HS.z0 - 1.2, HS.z1);
  // the forecourt: pale setts from the house to the street wall, marble steps up to the porch
  box(M.setts, V.x0 + 0.3, V.x1 - 0.3, base, top, HS.z1, V.z1 - 0.3);
  box(M.marble, V.hall.x0 + 1.6, V.hall.x1 - 1.6, top, F0, HS.z1, HS.z1 + 0.5);

  // ---- the walls: the street wall and its gate, the sides, the sea wall ----
  const WT = 0.34,
    WH = CURB + 2.1;
  const G = V.gate;
  // (their feet go down to the sand outside: the plot stands over the beach)
  box(M.render, V.x0, G.x0 - 0.35, CURB - 0.1, WH, V.z1 - WT, V.z1);
  box(M.render, G.x1 + 0.35, V.x1, CURB - 0.1, WH, V.z1 - WT, V.z1);
  for (const x of [V.x0, V.x1 - WT]) {
    box(M.render, x, x + WT, CURB - 2.6, WH, V.z0 + 5, V.z1);
    // toward the sea the wall steps down to the rail's height
    box(M.render, x, x + WT, CURB - 2.6, CURB + 1.05, V.z0 + 0.3, V.z0 + 5);
  }
  for (const [x0, x1] of [
    [V.x0, G.x0 - 0.35],
    [G.x1 + 0.35, V.x1],
  ])
    box(M.coping, x0 - 0.03, x1 + 0.03, WH, WH + 0.07, V.z1 - WT - 0.04, V.z1 + 0.04);
  for (const x of [V.x0, V.x1 - WT]) box(M.coping, x - 0.04, x + WT + 0.04, WH, WH + 0.07, V.z0 + 5, V.z1);
  // the gate's pillars, their stone caps and lanterns; the gate itself slid open behind the wall
  for (const x of [G.x0 - 0.35, G.x1 + 0.35]) {
    box(M.render, x - 0.4, x + 0.4, CURB - 0.1, CURB + 2.5, V.z1 - 0.62, V.z1 + 0.18);
    box(M.cladding, x - 0.46, x + 0.46, CURB + 2.5, CURB + 2.64, V.z1 - 0.68, V.z1 + 0.24);
    box(M.steel, x - 0.13, x + 0.13, CURB + 2.64, CURB + 3.0, V.z1 - 0.35, V.z1 - 0.09);
    box(M.lantern, x - 0.1, x + 0.1, CURB + 2.68, CURB + 2.96, V.z1 - 0.32, V.z1 - 0.12);
    light(x, CURB + 2.9, V.z1 + 0.6, "#ffd29a", 5);
  }
  {
    const x0 = G.x1 + 0.6,
      x1 = x0 + (G.x1 - G.x0);
    const z = V.z1 - WT - 0.22;
    box(M.steel, x0, x1, CURB + 0.06, CURB + 0.16, z - 0.04, z + 0.04);
    box(M.steel, x0, x1, CURB + 1.86, CURB + 1.96, z - 0.04, z + 0.04);
    for (let x = x0 + 0.06; x < x1; x += 0.16) box(M.steel, x - 0.025, x + 0.025, CURB + 0.16, CURB + 1.86, z - 0.03, z + 0.03);
    // the track in the setts, across the opening
    box(M.chrome, G.x0, x1, CURB, CURB + 0.012, z - 0.03, z + 0.03);
  }
  // the sea wall: its face down into the deep water, a marble coping, glass along the edge
  box(M.seawall, V.x0 - 0.2, V.x1 + 0.2, -5.4, CURB - 0.02, V.z0 - 0.4, V.z0 + 0.3);
  box(M.coping, V.x0 - 0.25, V.x1 + 0.25, CURB - 0.02, CURB + 0.06, V.z0 - 0.5, V.z0 + 0.4);
  for (let x = V.x0 + 0.35; x < V.x1 - 0.4; x += 1.5) {
    const x1 = Math.min(V.x1 - 0.35, x + 1.48);
    pane(M.rail, x, V.z0 + 0.1, x1, V.z0 + 0.1, CURB + 0.08, CURB + 1.08);
    box(M.chrome, x - 0.02, x + 0.02, CURB + 0.06, CURB + 0.16, V.z0 + 0.02, V.z0 + 0.18);
  }
  box(M.chrome, V.x0 + 0.3, V.x1 - 0.3, CURB + 1.08, CURB + 1.13, V.z0 + 0.06, V.z0 + 0.14);
  for (const x of [V.x0 + 0.17, V.x1 - 0.17]) {
    pane(M.rail, x, V.z0 + 0.3, x, V.z0 + 5, CURB + 0.08, CURB + 1.08);
  }
  // mooring bollards on the coping, the yacht's lines and fenders
  const Y = V.yacht;
  for (const x of [Y.x - 6.2, Y.x + 5.8]) {
    cyl(M.steel, x, CURB + 0.06, CURB + 0.5, V.z0 + 0.0, 0.14, 0.12);
    cyl(M.steel, x, CURB + 0.5, CURB + 0.58, V.z0 + 0.0, 0.2, 0.2);
  }
  for (const x of [Y.x - 4, Y.x - 1, Y.x + 2, Y.x + 4.5]) cyl(M.fender, x, BAY.water - 0.1, BAY.water + 0.65, V.z0 - 0.62, 0.17, 0.17, 12);
  for (const [x0, x1] of [
    [Y.x - 6.2, Y.x - 5.2],
    [Y.x + 5.8, Y.x + 4.4],
  ]) {
    const a = new THREE.Vector3(x0, CURB + 0.45, V.z0),
      b = new THREE.Vector3(x1, BAY.water + 1.25, Y.z + 1.4);
    const d = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(0.025, 0.025, d.length(), 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
    add(M.rope, g.translate((a.x + b.x) / 2 - CX, (a.y + b.y) / 2, (a.z + b.z) / 2 - CZ));
  }

  // ---- the house -----------------------------------------------------------------------------------
  into = houseParts;
  const H = V.hall;
  const T = 0.3;
  // its floor (one step over the terrace) and the rooms' floors seen through the glass
  box(M.marble, HS.x0, HS.x1, top - 0.1, F0, HS.z0, HS.z1);
  /** A volume: x0…x1, its walls up to `y1`, glass on the sea (north), what's on its street side (`south`). */
  const volume = (x0: number, x1: number, y1: number, ends: { w?: boolean; e?: boolean }, overN: number, overS: number, overE: number) => {
    // the roof slab: thin and cantilevered, white, pale gravel on it inside its edge, a soffit with its downlights
    box(M.render, x0 - (ends.w ? overE : 0), x1 + (ends.e ? overE : 0), y1, y1 + 0.32, HS.z0 - overN, HS.z1 + overS);
    box(M.gravel, x0 - (ends.w ? overE : 0) + 0.3, x1 + (ends.e ? overE : 0) - 0.3, y1 + 0.32, y1 + 0.36, HS.z0 - overN + 0.3, HS.z1 + overS - 0.3);
    box(M.soffit, x0 - (ends.w ? overE : 0) + 0.02, x1 + (ends.e ? overE : 0) - 0.02, y1 - 0.02, y1, HS.z0 - overN + 0.02, HS.z1 + overS - 0.02);
    for (let x = x0 + 1.4; x < x1 - 0.6; x += 2.6)
      for (const z of [HS.z0 - overN * 0.5, HS.z1 + overS * 0.5]) if (Math.abs(z - HS.z0) > 0.3 || overN > 0.5) add(M.downlight, new THREE.CircleGeometry(0.07, 12).rotateX(Math.PI / 2).translate(x - CX, y1 - 0.03, z - CZ));
    // the end walls
    if (ends.w) box(M.render, x0, x0 + T, F0, y1, HS.z0, HS.z1);
    if (ends.e) box(M.render, x1 - T, x1, F0, y1, HS.z0, HS.z1);
    // the glass on the sea, its slim black mullions and the transom; the room behind it
    pane(M.glass, x0 + 0.05, HS.z0 + 0.06, x1 - 0.05, HS.z0 + 0.06, F0, y1);
    const n = Math.max(2, Math.round((x1 - x0) / 2.2));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      box(M.steel, x - 0.045, x + 0.045, F0, y1, HS.z0 - 0.02, HS.z0 + 0.12);
    }
    box(M.steel, x0, x1, F0, F0 + 0.08, HS.z0 - 0.03, HS.z0 + 0.13);
    if (y1 - F0 > 5) box(M.steel, x0, x1, F0 + 3.6, F0 + 3.7, HS.z0 - 0.02, HS.z0 + 0.12);
    pane(M.window, x0 + 0.1, HS.z0 + 0.2, x1 - 0.1, HS.z0 + 0.2, F0 + 0.05, y1 - 0.05);
  };
  // the west wing (the kitchen, the dining room), the pavilion (the great room), the east wing (the bedroom, the bath)
  volume(HS.x0, H.x0, WING_TOP, { w: true }, 1.4, 1.0, 0.8);
  volume(H.x0, H.x1, HALL_TOP, {}, 2.4, 3.2, 0);
  volume(H.x1, HS.x1, WING_TOP, { e: true }, 1.4, 1.0, 0.8);
  // the pavilion's sides above the wings' roofs, clad in stone
  for (const x of [H.x0, H.x1 - T]) box(M.cladding, x, x + T, WING_TOP + 0.32, HALL_TOP, HS.z0, HS.z1);
  // the rooms behind the wings' glass: their back walls, ceilings (the rooms' light by night)
  for (const [x0, x1] of [
    [HS.x0 + T, H.x0],
    [H.x1, HS.x1 - T],
  ]) {
    box(M.room, x0, x1, F0, WING_TOP, HS.z0 + 4.6, HS.z0 + 4.8);
    box(M.room, x0, x1, WING_TOP - 0.04, WING_TOP, HS.z0, HS.z0 + 4.6);
  }
  box(M.room, H.x0, H.x1, HALL_TOP - 0.04, HALL_TOP, HS.z0, HS.z1);
  // what shows through the great room's glass: the sofas round a rug, the dining table beyond
  box(M.cushion, H.x0 + 3.2, H.x1 - 3.2, F0, F0 + 0.42, HS.z0 + 3.6, HS.z0 + 4.5);
  box(M.cushion, H.x0 + 3.2, H.x1 - 3.2, F0 + 0.42, F0 + 0.82, HS.z0 + 4.2, HS.z0 + 4.5);
  box(M.cushion, H.x0 + 2.4, H.x0 + 3.3, F0, F0 + 0.42, HS.z0 + 1.6, HS.z0 + 4.5);
  box(M.teak, H.x0 + 4.8, H.x1 - 4.8, F0, F0 + 0.38, HS.z0 + 1.8, HS.z0 + 2.9);
  box(M.teak, H.x0 + 0.5, H.x0 + 0.9, F0, F0 + 2.4, HS.z0 + 6.5, HS.z1 - 1.2);

  // the street side: the wings' walls (a high ribbon of glass on the kitchen, teak battens on the bedroom)
  const S = HS.z1;
  box(M.render, HS.x0, H.x0, F0, WING_TOP, S - T, S);
  pane(M.glass, HS.x0 + 1.2, S + 0.01, H.x0 - 1.2, S + 0.01, F0 + 2.5, WING_TOP - 0.5);
  pane(M.window, HS.x0 + 1.2, S - 0.02, H.x0 - 1.2, S - 0.02, F0 + 2.55, WING_TOP - 0.55);
  box(M.steel, HS.x0 + 1.15, H.x0 - 1.15, F0 + 2.45, F0 + 2.5, S, S + 0.06);
  box(M.render, H.x1, HS.x1, F0, WING_TOP, S - T, S);
  for (let x = H.x1 + 1.4; x < HS.x1 - 1.2; x += 0.22) box(M.teak, x - 0.06, x + 0.06, F0 + 0.3, WING_TOP - 0.3, S, S + 0.12);
  box(M.teak, H.x1 + 1.3, HS.x1 - 1.1, F0 + 0.18, F0 + 0.3, S, S + 0.16);
  box(M.teak, H.x1 + 1.3, HS.x1 - 1.1, WING_TOP - 0.3, WING_TOP - 0.18, S, S + 0.16);
  // the pavilion's front: stone-clad returns, the porch cut into it, the door
  const PD = 1.2;
  const px0 = H.x0 + 2,
    px1 = H.x1 - 2;
  box(M.cladding, H.x0, px0, F0, HALL_TOP, S - T, S);
  box(M.cladding, px1, H.x1, F0, HALL_TOP, S - T, S);
  // over the porch: the wall from the door's head up, clad in stone
  box(M.cladding, px0, px1, F0 + 3.6, HALL_TOP, S - T, S);
  // the porch's sides and floor (its back is the door wall, PD behind the front)
  for (const x of [px0, px1 - T]) box(M.render, x, x + T, F0, F0 + 3.6, S - PD - T, S - T);
  box(M.marble, px0, px1, top - 0.1, F0 + 0.005, S - PD - T, S + 0.5);
  {
    const z = S - PD - T;
    const d = V.door.x;
    // the door: a pivoting slab of teak 1.7 m wide, 3.2 m tall, its long brass pull
    box(M.teak, d - 0.85, d + 0.85, F0, F0 + 3.2, z, z + 0.12);
    box(M.chrome, d + 0.52, d + 0.58, F0 + 0.6, F0 + 2.6, z + 0.12, z + 0.2);
    box(M.steel, d - 0.92, d + 0.92, F0 + 3.2, F0 + 3.6, z, z + 0.1);
    box(M.steel, d - 0.92, d - 0.85, F0, F0 + 3.2, z, z + 0.1);
    box(M.steel, d + 0.85, d + 0.92, F0, F0 + 3.2, z, z + 0.1);
    // glass either side of it, full height, and the transom over it to the clerestory
    for (const [x0, x1] of [
      [px0 + T, d - 0.92],
      [d + 0.92, px1 - T],
    ]) {
      pane(M.glass, x0, z + 0.05, x1, z + 0.05, F0, F0 + 3.6);
      pane(M.window, x0, z - 0.06, x1, z - 0.06, F0, F0 + 3.6);
    }
    // the porch's downlights and its light
    for (const x of [d - 2.2, d + 2.2]) add(M.downlight, new THREE.CircleGeometry(0.08, 14).rotateX(Math.PI / 2).translate(x - CX, F0 + 3.58, S - PD * 0.5 - CZ));
    light(d, F0 + 3.2, S + 0.4, "#ffe0b8", 7);
  }

  into = grounds;
  // ---- on the terrace --------------------------------------------------------------------------------
  // sun loungers along the pool, two parasols
  const lounger = (x: number, z: number) => {
    box(M.teak, x - 0.33, x + 0.33, top, top + 0.3, z - 0.95, z + 0.95);
    box(M.cushion, x - 0.31, x + 0.31, top + 0.3, top + 0.4, z - 0.35, z + 0.93);
    // the raised back toward the house
    const g = new THREE.BoxGeometry(0.62, 0.1, 0.8).rotateX(-0.75).translate(x - CX, top + 0.62, z - 0.7 - CZ);
    add(M.cushion, g);
  };
  for (let x = P.x0 + 1.6; x < P.x1 - 1; x += 2.4) if (Math.abs(x - (P.x0 + P.x1) / 2) > 2) lounger(x, P.z1 + 1.75);
  for (const x of [P.x0 + 6.2, P.x1 - 6.2]) {
    cyl(M.steel, x, top, top + 2.5, P.z1 + 2.4, 0.035);
    add(M.canvas, new THREE.ConeGeometry(1.7, 0.45, 12, 1, true).translate(x - CX, top + 2.55, P.z1 + 2.4 - CZ));
    cyl(M.steel, x, top, top + 0.06, P.z1 + 2.4, 0.3);
  }
  // the outdoor lounge on the west terrace: an L of white cushions, a low marble table
  {
    const x0 = V.x0 + 1.4,
      z0 = V.z0 + 1.6;
    box(M.teak, x0, x0 + 3.2, top, top + 0.3, z0, z0 + 0.9);
    box(M.cushion, x0 + 0.05, x0 + 3.15, top + 0.3, top + 0.48, z0 + 0.05, z0 + 0.85);
    box(M.cushion, x0 + 0.05, x0 + 3.15, top + 0.48, top + 0.85, z0 + 0.05, z0 + 0.28);
    box(M.teak, x0, x0 + 0.9, top, top + 0.3, z0 + 0.9, z0 + 3.4);
    box(M.cushion, x0 + 0.05, x0 + 0.85, top + 0.3, top + 0.48, z0 + 0.9, z0 + 3.35);
    box(M.cushion, x0 + 0.05, x0 + 0.28, top + 0.48, top + 0.85, z0 + 0.9, z0 + 3.35);
    box(M.marble, x0 + 1.5, x0 + 2.7, top, top + 0.36, z0 + 1.5, z0 + 2.5);
  }
  // the bar under its pergola on the east terrace, facing the pool
  {
    const x0 = 302,
      x1 = 314,
      z0 = V.z0 + 1.4,
      z1 = V.z0 + 6.4,
      h = top + 2.9;
    for (const x of [x0, x1]) for (const z of [z0, z1]) box(M.render, x - 0.18, x + 0.18, top, h, z - 0.18, z + 0.18);
    for (const z of [z0, z1]) box(M.render, x0 - 0.2, x1 + 0.2, h, h + 0.3, z - 0.18, z + 0.18);
    for (let x = x0 + 0.3; x < x1; x += 0.45) box(M.teak, x - 0.05, x + 0.05, h + 0.3, h + 0.42, z0 - 0.4, z1 + 0.4);
    box(M.deck, x0 - 0.6, x1 + 0.6, top, top + 0.04, z0 - 0.6, z1 + 0.6);
    // the counter (marble on white), its stools, the bottles' shelf behind
    box(M.render, x0 + 2, x1 - 2, top + 0.04, top + 1.05, z0 + 2.2, z0 + 2.8);
    box(M.marble, x0 + 1.9, x1 - 1.9, top + 1.05, top + 1.11, z0 + 2.1, z0 + 2.9);
    for (let x = x0 + 2.8; x < x1 - 2.4; x += 1.3) {
      cyl(M.chrome, x, top + 0.04, top + 0.74, z0 + 1.6, 0.03);
      cyl(M.teak, x, top + 0.74, top + 0.8, z0 + 1.6, 0.21);
    }
    box(M.teak, x0 + 2.4, x1 - 2.4, top + 0.04, top + 1.9, z1 - 0.55, z1 - 0.2);
  }
  // planters with their palms along the street wall, palms by the pool and in the gardens
  const trees: { x: number; y: number; z: number; species: Species; seed: number }[] = [];
  const palm = (x: number, z: number, seed: number, planter = false) => {
    if (planter) {
      cyl(M.planter, x, top, top + 0.62, z, 0.7, 0.62, 20);
      cyl(M.lawn, x, top + 0.6, top + 0.64, z, 0.6, 0.6, 20);
    }
    trees.push({ x, y: top + (planter ? 0.6 : 0), z, species: "palm", seed });
    circles.push([x, z, planter ? 0.75 : 0.35]);
  };
  for (const [i, x] of [253.2, 259, 314, 320.5, 327, 331.2].entries()) palm(x, V.z1 - 1.3, i, true);
  palm(P.x0 - 2.0, P.z0 + 0.3, 6);
  palm(P.x1 + 2.6, P.z0 + 0.6, 7);
  palm(V.x0 + 2.2, HS.z0 + 3, 8);
  palm(V.x0 + 2.6, HS.z0 + 8.5, 9);
  // (the motor court's two palms in its far corners: its middle is where your car and bike wait and turn)
  palm(296.6, HS.z0 + 1.6, 13, true);
  palm(311.6, HS.z0 + 1.6, 14, true);
  palm(317.5, HS.z0 + 2, 10);
  palm(325, HS.z0 + 6.5, 11);
  palm(331, HS.z0 + 1, 12);
  // hedges along the side walls, a few by the house's ends
  for (let z = HS.z0 - 0.6; z < V.z1 - 2.6; z += 1.6) {
    trees.push({ x: V.x0 + 0.9, y: top, z, species: "bush", seed: Math.round(z) });
    trees.push({ x: V.x1 - 0.9, y: top, z, species: "bush", seed: Math.round(z) + 3 });
  }
  // (the terrace is lit by the house's glass and the pool: lights with no fixture to hang from showed as bare halos)
  // under the pool's water, its lights by night
  add(M.poolGlow, new THREE.PlaneGeometry(P.x1 - P.x0 - 0.3, P.z1 - P.z0 - 0.3).rotateX(-Math.PI / 2).translate((P.x0 + P.x1) / 2 - CX, P.surface - 0.6, (P.z0 + P.z1) / 2 - CZ));

  // ---- the meshes -------------------------------------------------------------------------------------
  const group = new THREE.Group();
  group.name = "keys:villa";
  group.position.set(CX, 0, CZ);
  // the house's name on the gate's east pillar, toward the street: bronze letters on travertine
  {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 160;
    const g = c.getContext("2d")!;
    g.fillStyle = "#e8dcc4";
    g.fillRect(0, 0, 512, 160);
    g.fillStyle = "#7a5a2e";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = '600 54px "Archivo", "Helvetica Neue", sans-serif';
    g.fillText(V.name.toUpperCase(), 256, 64);
    g.font = '500 30px "Archivo", "Helvetica Neue", sans-serif';
    g.fillText("1 · 家", 256, 122);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.225), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.1 }));
    plaque.position.set(V.gate.x1 + 0.35 - CX, CURB + 1.75, V.z1 + 0.19 - CZ);
    plaque.userData.noField = true;
    plaque.updateMatrix();
    plaque.matrixAutoUpdate = false;
    group.add(plaque);
  }
  const house = new THREE.Group();
  house.name = "keys:villa:house";
  group.add(house);
  for (const [parent, map] of [
    [group, grounds],
    [house, houseParts],
  ] as const)
    for (const [m, list] of map) {
      // (boxes, planes, circles, cylinders: all indexed, the same attributes)
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      const glowy = m === M.window || m === M.poolGlow || m === M.downlight || m === M.lantern;
      mesh.castShadow = !glowy && m !== M.glass && m !== M.rail && m !== M.slabs && m !== M.setts && m !== M.lawn;
      mesh.receiveShadow = !glowy;
      // (the night's glow is no wall; the glass, the rail's glass, the furniture are)
      if (glowy) mesh.userData.noField = true;
      // (the house is hidden by `visible` for its own rooms' view: never merged into a tile's batch, where hiding it would not reach)
      if (parent === house) mesh.userData.noThrift = true;
      if (m === M.glass || m === M.rail || m === M.window || m === M.poolGlow) mesh.renderOrder = 2;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
    }
  // the pool's water: swum in (plan.ts villaPool), no floor to the game's solid shape
  {
    // (its own water: the town's mirror-smooth one bloomed the moon's glint into a blaze over the terrace)
    const water = new THREE.MeshStandardMaterial({ color: "#3fb4d0", roughness: 0.16, metalness: 0.02, normalMap: maps("Concrete034").normalMap, transparent: true, opacity: 0.8, envMapIntensity: 1.1 });
    water.normalScale.setScalar(0.15);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0).rotateX(-Math.PI / 2), water);
    w.position.set((P.x0 + P.x1) / 2 - CX, P.surface, (P.z0 + P.z1) / 2 - CZ);
    w.userData.noField = true;
    w.renderOrder = 3;
    w.updateMatrix();
    w.matrixAutoUpdate = false;
    group.add(w);
  }
  // the yacht at the sea wall
  {
    const y = realMotorYacht();
    y.position.set(Y.x - CX, BAY.water - 0.25, Y.z - CZ);
    y.rotation.y = Math.PI;
    group.add(y);
  }
  // the palms and the hedges (planted in world coordinates: a group of their own at the origin)
  const green = new THREE.Group();
  green.position.set(-CX, 0, -CZ);
  plantTrees(green, trees);
  group.add(green);
  group.updateMatrixWorld(true);
  return { group, house, circles };
}
