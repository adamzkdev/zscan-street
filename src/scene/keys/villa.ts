import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BAY, CURB } from "../city/plan";
import { GROUND, groundMat } from "../real/ground";
import { maps } from "../real/tex";
import { plantTrees, type Species } from "../real/trees";
import { VILLA, villaDock } from "./plan";

/**
 * YOUR VILLA's outside (src/gta/home.ts; plan: ./plan.ts VILLA): a white modern mansion on its own
 * walled plot at Orchard Keys' north point, its back to the strait — the Golden Gate and the city
 * across the water. Plain geometry in the photographed sets, mapped in world metres (ground.ts):
 *
 *  - the street front: a stone plinth wall under black railings and a tall clipped hedge, white
 *    piers with lanterns; the gate between two tall stone pillars, its bronze leaves swung open;
 *  - the motor court in pale setts: the fountain on the gate's axis, palms either side of the way in,
 *    your car and your bike before the garage (plan.ts VILLA.car / bike); the formal garden to the
 *    west round its reflecting pool;
 *  - the house: two storeys of white slabs stacked and cantilevered, thin-edged, with deep overhangs
 *    lit from below; glass floor to ceiling in slim black frames, limestone walls and teak screens;
 *    the great room's glass two storeys tall on the sea between two deep white fins; the entrance
 *    between two stone blades under the porte-cochère (the game's door is its teak pivot door); the
 *    garage's three teak doors; the roof terrace (its deck, a pergola over the lounge, the hot tub,
 *    a planted roof to the west, glass all round);
 *  - the terrace reclaimed from the strait on its sea wall: the infinity pool along the wall (its
 *    water spilling over it into the sea: plan.ts villaPool), the sun deck, the loggia under the
 *    house's overhang, the cabana, the fire pit, the outdoor kitchen under its pergola, and the dock:
 *    bollards, cleats, fenders, lights, and by the berth where your yacht lies the boarding landing two
 *    steps down with its gangway (the yacht itself is the game's: src/gta/boat.ts; its water,
 *    VILLA.yacht, is left clear).
 *
 * By night the rooms behind the glass, the pools, the lanterns, the downlights under the slabs, the
 * lamps at the palms' feet and the fire glow (meshes whose material says `night`: the theme shows
 * them), and a few real lights join the city's lamps.
 *
 * Built once, on the main thread (boxes: no worker needed), merged per material, the meshes standing
 * at the plot's centre (what measures a mesh's size on screen measures from there).
 */

type Parts = Map<THREE.Material, THREE.BufferGeometry[]>;
export interface VillaOut {
  group: THREE.Group;
  /** The house itself (its walls, slabs, glass, roof): hidden while its rooms' view of the city is taken. */
  house: THREE.Group;
  /** Trunks and posts a car is pushed off (x, z, radius). */
  circles: [number, number, number][];
}

const V = VILLA;
const HS = V.house;
const CX = (V.x0 + V.x1) / 2,
  CZ = (V.z0 + V.z1) / 2;
const F0 = V.floor;
/** The ground floor's ceiling (the first floor slab's underside), the first floor, its ceiling (the roof slab's underside), the roof. */
const G_TOP = F0 + 3.9,
  L1 = G_TOP + 0.45,
  U_TOP = L1 + 3.6,
  ROOF = U_TOP + 0.45;
/** The great room between its fins (two storeys of glass on the sea), the entrance's blades. */
const GR = { x0: 294, x1: 312 };
/** The slabs' edges: the first floor's (sea, street), the roof's. */
const SLAB1 = { x0: 266, x1: 333, z0: 584, z1: 611 };
const SLAB2 = { x0: 264, x1: 333.5, z0: 583, z1: 611.5 };
/** The upper floor's walls: the west wing's, the east wing's (glass on the sea at z0). */
const UPW = { x0: 266, x1: GR.x0, z0: 587, z1: 609.5 };
const UPE = { x0: GR.x1, x1: 332.6, z0: 589, z1: 609.5 };
/** The cabana, the outdoor kitchen's pergola, the fire pit (on the terrace). */
const CAB = { x0: 251, x1: 261.4, z0: 571.2, z1: 582 };
const KIT = { x0: 314, x1: 330, z0: 574.5, z1: 583 };
const PIT = { x: 308, z: 579 };
/** The boarding landing by the yacht's stern (plan.ts villaDock): two steps down off the dock. */
const boardLanding = () => villaDock()!;

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
  /** A glow seen through (night): the rooms' warm light behind the glass, the pools' lamps. */
  const veil = (color: string, k: number, opacity: number) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    m.userData.night = true;
    return m;
  };
  // the glass: dark, reflecting the sky by day; a little of the rooms behind shows through
  // (the sun's and the moon's glint on it kept soft: a mirror's pin-point of light bloomed into a blaze)
  const glass = new THREE.MeshPhysicalMaterial({ color: "#3d5866", roughness: 0.08, metalness: 0.2, specularIntensity: 0.35, transparent: true, opacity: 0.45, envMapIntensity: 1.7, depthWrite: false, side: THREE.DoubleSide });
  const rail = new THREE.MeshPhysicalMaterial({ color: "#cfe3ea", roughness: 0.1, metalness: 0, specularIntensity: 0.35, transparent: true, opacity: 0.2, envMapIntensity: 1.3, depthWrite: false, side: THREE.DoubleSide });
  // the rooms seen through it: lit by day softly, warm at night (the theme swaps the colour)
  const room = std("#c4bdb1", 0.9);
  room.userData.dayColor = "#c4bdb1";
  room.userData.nightColor = "#c79a6a";
  // water falling: the pool over its edge into the sea, the fountain's bowls
  // (rough: smooth, it caught the moon's glint and bloomed into a white blaze along the sea wall)
  const spill = new THREE.MeshStandardMaterial({ color: "#d6eef2", roughness: 0.6, metalness: 0, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, normalMap: maps("Concrete034").normalMap, envMapIntensity: 0.7 });
  spill.normalScale.setScalar(0.4);
  // (what stops a body round the house's rooms: drawn in the game's solid shape, not on screen)
  const blocker = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  return {
    render: groundMat({ set: "Plaster001", tint: "#f8f6f1", tile: 3.2, rough: 0.85, normal: 0.2, anti: 0.5, patches: 0.08 }),
    // (the slabs' edges and soffits, the fins, the columns: smooth white paint, crisp lines)
    fascia: std("#f5f4f0", 0.5),
    // (large panels of pale limestone: smooth, a faint vein, no blocks)
    cladding: groundMat({ set: "Marble021", tint: "#e6d6bb", tile: 3.4, rough: 0.6, normal: 0.12, anti: 0.3, patches: 0.05 }),
    // (the fountain basin's inner face: the same stone, seen from inside its ring)
    basin: (() => {
      const m = groundMat({ set: "Marble021", tint: "#e5d5ba", tile: 3.4, rough: 0.6, normal: 0.12, anti: 0.3, patches: 0.05 });
      m.side = THREE.DoubleSide;
      return m;
    })(),
    roofing: groundMat({ set: "Concrete034", tint: "#e2dfd8", tile: 2, rough: 1, normal: 0.3, anti: 0.6, patches: 0.15 }),
    slabs: groundMat({ set: "PavingStones128", tint: "#f2e8d5", tile: 3.2, rough: 0.75, normal: 0.55, anti: 0.3, patches: 0.1 }),
    setts: groundMat({ set: "PavingStones070", tint: "#efe6d4", tile: 2.2, rough: 0.9, normal: 0.7, anti: 0.4, patches: 0.2 }),
    marble: groundMat({ set: "Marble021", tint: "#f5f2ec", tile: 2, rough: 0.3, normal: 0.25, anti: 0.3, patches: 0 }),
    // the copings and the wall caps out in the weather: pale cast stone, matt (the polished marble —
    // its photographed roughness near a mirror's, whatever the factor — caught the sky's light at a
    // glance from the water and bloomed into a white blaze along the sea wall by night)
    coping: groundMat({ set: "Concrete034", tint: "#ebe4d6", tile: 2, rough: 1, normal: 0.3, anti: 0.4, patches: 0.06 }),
    deck: groundMat({ set: "Planks021", tint: "#b58660", tile: 2.4, rough: 0.7, normal: 0.6, anti: 0.2, patches: 0 }),
    teak: groundMat({ set: "Wood049", tint: "#8a5a3a", tile: 1.5, rough: 0.55, normal: 0.6, anti: 0.2, patches: 0 }),
    seawall: groundMat({ set: "Concrete031", tint: "#ddd2bf", tile: 3, rough: 0.9, normal: 0.9, anti: 0.4, patches: 0.4 }),
    // (the quay's face over the water: pale stone in large panels)
    quay: groundMat({ set: "Marble021", tint: "#efe3cf", tile: 2.6, rough: 0.8, normal: 0.3, anti: 0.4, patches: 0.15 }),
    // (the band the tide wets: darker, a little green)
    wet: groundMat({ set: "Concrete031", tint: "#7d8a78", tile: 3, rough: 0.8, normal: 0.9, anti: 0.4, patches: 0.6 }),
    lawn: GROUND.lawn(),
    // (a planted roof: low succulents, a yellower green than the lawns)
    sedum: groundMat({ set: "Grass004", tint: "#a9b47a", tile: 1.6, rough: 1, normal: 0.8, anti: 0.7, patches: 0.6 }),
    // (the clipped hedges: dense leaves, a dark green)
    hedge: groundMat({ set: "Grass004", tint: "#6f8f4f", tile: 1.1, rough: 1, normal: 1, anti: 0.7, patches: 0.5 }),
    steel: std("#1d1f24", 0.4, 0.7),
    chrome: std("#d4d8de", 0.2, 1),
    bronze: std("#3d3228", 0.45, 0.75),
    brass: std("#b8913a", 0.35, 0.9),
    cushion: std("#f3efe6", 0.95),
    canvas: std("#efe8da", 0.9),
    planter: std("#e9e4da", 0.8),
    pool: std("#8fd8e6", 0.35),
    fender: std("#f2f2f2", 0.5),
    buoy: std("#e8622e", 0.6),
    rope: std("#d8cbb0", 0.9),
    soffit: std("#f2efe8", 0.95),
    dark: std("#2a2a2e", 0.6),
    glass,
    rail,
    room,
    spill,
    blocker,
    lantern: glow("#ffd29a", 2.2),
    window: veil("#ffc98a", 0.5, 0.36),
    downlight: glow("#fff1d8", 1.8),
    fire: glow("#ff8a2a", 2.6),
    poolGlow: veil("#4fe2ff", 1.1, 0.55),
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
  const cyl = (m: THREE.Material, x: number, y0: number, y1: number, z: number, r: number, r2 = r, seg = 16, open = false) => add(m, new THREE.CylinderGeometry(r2, r, y1 - y0, seg, 1, open).translate(x - CX, (y0 + y1) / 2, z - CZ));
  /** A disc facing up (or down), at height y. */
  const disc = (m: THREE.Material, x: number, y: number, z: number, r: number, down = false, seg = 20) => add(m, new THREE.CircleGeometry(r, seg).rotateX(down ? Math.PI / 2 : -Math.PI / 2).translate(x - CX, y, z - CZ));
  const ring = (m: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, seg = 40) => add(m, new THREE.RingGeometry(r0, r1, seg).rotateX(-Math.PI / 2).translate(x - CX, y, z - CZ));
  /** A downlight in a soffit at height y (a small disc facing down). */
  const dl = (x: number, y: number, z: number, r = 0.07) => disc(M.downlight, x, y - 0.012, z, r, true, 12);
  /** A bar of section w × h from a to b (world), kept upright. */
  const beam = (m: THREE.Material, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, h: number) => {
    const dx = bx - ax,
      dy = by - ay,
      dz = bz - az;
    const flat = Math.hypot(dx, dz);
    const g = new THREE.BoxGeometry(Math.hypot(flat, dy), h, w).rotateZ(Math.atan2(dy, flat)).rotateY(Math.atan2(-dz, dx));
    add(m, g.translate((ax + bx) / 2 - CX, (ay + by) / 2, (az + bz) / 2 - CZ));
  };
  /** A rod of radius r from a to b (world). */
  const rod = (m: THREE.Material, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, seg = 6) => {
    const d = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    add(m, g.translate((ax + bx) / 2 - CX, (ay + by) / 2, (az + bz) / 2 - CZ));
  };
  const light = (x: number, y: number, z: number, color = "#ffd29a", intensity = 6) => lamps.push({ pos: new THREE.Vector3(x, y, z), color, intensity });

  /**
   * A wall of glass along x at z, from x0 to x1 and y0 to y1: the pane, slim black mullions every
   * `bay` metres, a sill and a head, transoms at `cuts`; behind it (toward `inside`: ±1 in z) the
   * rooms' warm light by night.
   */
  const glazeX = (x0: number, x1: number, z: number, y0: number, y1: number, inside: 1 | -1, bay = 2.4, cuts: number[] = []) => {
    pane(M.glass, x0, z, x1, z, y0, y1);
    const n = Math.max(1, Math.round((x1 - x0) / bay));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      box(M.steel, x - 0.04, x + 0.04, y0, y1, z - 0.06, z + 0.06);
    }
    box(M.steel, x0, x1, y0, y0 + 0.07, z - 0.07, z + 0.07);
    box(M.steel, x0, x1, y1 - 0.09, y1, z - 0.07, z + 0.07);
    for (const y of cuts) box(M.steel, x0, x1, y - 0.05, y + 0.05, z - 0.06, z + 0.06);
    pane(M.window, x0 + 0.05, z + inside * 0.16, x1 - 0.05, z + inside * 0.16, y0 + 0.04, y1 - 0.04);
  };
  /** The same along z at x (`inside`: ±1 in x). */
  const glazeZ = (z0: number, z1: number, x: number, y0: number, y1: number, inside: 1 | -1, bay = 2.4) => {
    pane(M.glass, x, z0, x, z1, y0, y1);
    const n = Math.max(1, Math.round((z1 - z0) / bay));
    for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      box(M.steel, x - 0.06, x + 0.06, y0, y1, z - 0.04, z + 0.04);
    }
    box(M.steel, x - 0.07, x + 0.07, y0, y0 + 0.07, z0, z1);
    box(M.steel, x - 0.07, x + 0.07, y1 - 0.09, y1, z0, z1);
    pane(M.window, x + inside * 0.16, z0 + 0.05, x + inside * 0.16, z1 - 0.05, y0 + 0.04, y1 - 0.04);
  };
  /** A glass balustrade along a line at floor height y: panes 1.1 m tall on slim posts, a steel cap. */
  const railLine = (x0: number, z0: number, x1: number, z1: number, y: number, h = 1.1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 1.6));
    const ux = (x1 - x0) / len,
      uz = (z1 - z0) / len;
    for (let i = 0; i < n; i++) {
      const a = (len * i) / n + 0.03,
        b = (len * (i + 1)) / n - 0.03;
      pane(M.rail, x0 + ux * a, z0 + uz * a, x0 + ux * b, z0 + uz * b, y + 0.06, y + h - 0.04);
    }
    for (let i = 0; i <= n; i++) {
      const k = (len * i) / n;
      box(M.chrome, x0 + ux * k - 0.025, x0 + ux * k + 0.025, y, y + 0.14, z0 + uz * k - 0.025, z0 + uz * k + 0.025);
    }
    beam(M.chrome, x0, y + h, z0, x1, y + h, z1, 0.05, 0.05);
  };
  /** A lounger facing −z (the sea), its back raised at the +z end. */
  const lounger = (x: number, z: number, y = CURB) => {
    box(M.teak, x - 0.34, x + 0.34, y, y + 0.28, z - 0.98, z + 0.98);
    box(M.cushion, x - 0.32, x + 0.32, y + 0.28, y + 0.38, z - 0.95, z + 0.4);
    add(M.cushion, new THREE.BoxGeometry(0.64, 0.1, 0.8).rotateX(-0.7).translate(x - CX, y + 0.6, z + 0.68 - CZ));
  };
  /** A square parasol on its pole (its canopy a shallow four-sided pyramid). */
  const parasol = (x: number, z: number, y = CURB) => {
    cyl(M.steel, x, y, y + 2.55, z, 0.035);
    add(M.canvas, new THREE.ConeGeometry(1.75, 0.42, 4, 1, true).rotateY(Math.PI / 4).translate(x - CX, y + 2.62, z - CZ));
    box(M.steel, x - 0.3, x + 0.3, y, y + 0.06, z - 0.3, z + 0.3);
  };
  /** An outdoor sofa along x (its back toward `back`: ±1 in z), `w` wide. */
  const sofaX = (x0: number, x1: number, z: number, back: 1 | -1, y = CURB) => {
    box(M.teak, x0, x1, y, y + 0.28, z - 0.45, z + 0.45);
    box(M.cushion, x0 + 0.04, x1 - 0.04, y + 0.28, y + 0.46, z - 0.42, z + 0.42);
    box(M.cushion, x0 + 0.04, x1 - 0.04, y + 0.46, y + 0.86, z + back * 0.24, z + back * 0.42);
  };
  const sofaZ = (z0: number, z1: number, x: number, back: 1 | -1, y = CURB) => {
    box(M.teak, x - 0.45, x + 0.45, y, y + 0.28, z0, z1);
    box(M.cushion, x - 0.42, x + 0.42, y + 0.28, y + 0.46, z0 + 0.04, z1 - 0.04);
    box(M.cushion, x + back * 0.24, x + back * 0.42, y + 0.46, y + 0.86, z0 + 0.04, z1 - 0.04);
  };
  /** A chair (teak, a cushion), facing `face` (radians: 0 toward +z). */
  const chair = (x: number, z: number, face: number, y = CURB) => {
    const g1 = new THREE.BoxGeometry(0.5, 0.45, 0.5).translate(0, y + 0.225, 0);
    const g2 = new THREE.BoxGeometry(0.5, 0.5, 0.06).translate(0, y + 0.7, -0.24);
    for (const g of [g1, g2]) add(M.teak, g.rotateY(face).translate(x - CX, 0, z - CZ));
  };

  // ---- the ground: the court, the gardens, the terrace (the plot at the street's level) ----------------------
  const P = V.pool;
  const top = CURB,
    base = CURB - 0.12;
  // the motor court in pale setts, from the house's front to the street wall
  box(M.setts, 286, V.x1 - 0.34, base, top, HS.z1, V.z1 - 0.34);
  // the path along the house's west front to the side garden
  box(M.setts, 264, 286, base, top, HS.z1 + 1.4, HS.z1 + 4);
  // the formal garden (west of the court) and the side garden (west of the house): lawns
  box(M.lawn, V.x0 + 0.34, 286, base, top + 0.02, HS.z1 + 4, V.z1 - 0.34);
  box(M.lawn, V.x0 + 0.34, 264, base, top + 0.02, HS.z1 + 1.4, HS.z1 + 4);
  box(M.lawn, V.x0 + 0.34, HS.x0, base, top + 0.02, HS.z0, HS.z1 + 1.4);
  // (the planting bed along the house's west front, against its stone wall)
  box(M.lawn, HS.x0, 286, base, top + 0.02, HS.z1, HS.z1 + 1.4);
  // the path down the east side of the house to the terrace
  box(M.setts, HS.x1, V.x1 - 0.34, base, top, HS.z0, HS.z1);
  // the terrace in travertine slabs: from the pool to the house (the loggia under its overhang)
  box(M.slabs, V.x0 + 0.34, V.x1 - 0.34, base, top, P.z1 + 0.4, HS.z0);
  // beside the pool: the cabana's corner (west), the fire pit's and the kitchen's (east, behind the dock)
  box(M.slabs, V.x0 + 0.34, P.x0 - 0.4, base, top, V.z0 + 0.3, P.z1 + 0.4);
  box(M.slabs, P.x1 + 0.4, V.x1 - 0.34, base, top, V.z0 + 4, P.z1 + 0.4);
  // the dock: teak boards along the sea wall, east of the pool (the yacht's berth beyond it); by the
  // yacht's stern the boarding landing, three steps down (plan.ts villaFloor knows it)
  const BL = boardLanding();
  box(M.deck, P.x1 + 0.4, BL.x0, base, top, V.z0 + 0.3, V.z0 + 4);
  box(M.deck, BL.x0, V.x1 - 0.34, base, top, BL.z1, V.z0 + 4);
  box(M.deck, BL.x0 + 0.8, V.x1 - 0.34, BL.y - 0.12, BL.y, V.z0 + 0.3, BL.z1);
  for (let k = 0; k < 2; k++) box(M.deck, BL.x0 + k * 0.4, BL.x0 + (k + 1) * 0.4, BL.y - 0.12, top - 0.15 * (k + 1), V.z0 + 0.3, BL.z1);
  box(M.teak, BL.x0, V.x1 - 0.34, BL.y, top, BL.z1 - 0.08, BL.z1);
  // the pool's coping (flush) on three sides; the fourth is the sea wall's own edge, the water over it
  for (const [x0, x1, z0, z1] of [
    [P.x0 - 0.4, P.x1 + 0.4, P.z1, P.z1 + 0.4],
    [P.x0 - 0.4, P.x0, V.z0 + 0.3, P.z1],
    [P.x1, P.x1 + 0.4, V.z0 + 0.3, P.z1],
  ])
    box(M.coping, x0, x1, top - 0.06, top + 0.01, z0, z1);
  // the pool's shell: its floor, its walls, the sun shelf and the steps down off it at the west end,
  // the bench along the east end (plan.ts villaPool knows them)
  box(M.pool, P.x0, P.x1, P.floor - 0.1, P.floor, P.z0, P.z1);
  box(M.pool, P.x0, P.x1, P.floor, top - 0.06, P.z1 - 0.12, P.z1);
  box(M.pool, P.x0, P.x0 + 0.12, P.floor, top - 0.06, P.z0, P.z1);
  box(M.pool, P.x1 - 0.12, P.x1, P.floor, top - 0.06, P.z0, P.z1);
  box(M.pool, P.x0 + 0.12, P.x0 + 4, P.floor, P.surface - 0.3, P.z0, P.z1 - 0.12);
  for (let k = 0; k < 3; k++) box(M.pool, P.x0 + 4 + k * 0.4, P.x0 + 4.4 + k * 0.4, P.floor, P.surface - 0.6 - k * 0.3, P.z0, P.z1 - 0.12);
  box(M.pool, P.x1 - 0.62, P.x1 - 0.12, P.floor, P.surface - 0.5, P.z0, P.z1 - 0.12);
  // two loungers in the water on the sun shelf
  for (const x of [P.x0 + 1.1, P.x0 + 2.7]) {
    box(M.cushion, x - 0.34, x + 0.34, P.surface - 0.3, P.surface + 0.06, P.z0 + 1.2, P.z0 + 3.0);
    add(M.cushion, new THREE.BoxGeometry(0.68, 0.12, 0.9).rotateX(-0.55).translate(x - CX, P.surface + 0.25, P.z0 + 3.3 - CZ));
  }
  // under the water, its lights by night
  add(M.poolGlow, new THREE.PlaneGeometry(P.x1 - P.x0 - 0.3, P.z1 - P.z0 - 0.3).rotateX(-Math.PI / 2).translate((P.x0 + P.x1) / 2 - CX, P.surface - 0.55, (P.z0 + P.z1) / 2 - CZ));

  // ---- the sea wall: the terrace's three sides out in the strait, down to the sea floor -------------------
  {
    const deep = -7;
    const Z = V.z0;
    // the north face: under the cabana's corner, under the pool (its top the water's edge), under the dock
    box(M.seawall, V.x0 - 0.4, P.x0, deep, top - 0.02, Z - 0.3, Z + 0.3);
    box(M.seawall, P.x0, P.x1, deep, P.surface - 0.02, Z - 0.3, Z + 0.3);
    box(M.seawall, P.x1, BL.x0, deep, top - 0.25, Z - 0.3, Z + 0.3);
    box(M.seawall, BL.x0, V.x1 + 0.4, deep, BL.y - 0.3, Z - 0.3, Z + 0.3);
    // the sides, as far as the land
    box(M.seawall, V.x0 - 0.4, V.x0 + 0.3, deep, top - 0.02, Z - 0.3, HS.z1);
    box(M.seawall, V.x1 - 0.3, V.x1 + 0.4, deep, top - 0.02, Z - 0.3, 612);
    // the face above the tide in limestone panels, a hand proud of the concrete
    const f0 = BAY.water + 0.3;
    box(M.quay, V.x0 - 0.42, P.x0, f0, top - 0.04, Z - 0.32, Z - 0.3);
    box(M.quay, P.x1, BL.x0, f0, top - 0.27, Z - 0.32, Z - 0.3);
    box(M.quay, BL.x0, V.x1 + 0.42, f0, BL.y - 0.32, Z - 0.32, Z - 0.3);
    box(M.quay, V.x0 - 0.42, V.x0 - 0.4, f0, top - 0.04, Z - 0.3, HS.z1);
    box(M.quay, V.x1 + 0.4, V.x1 + 0.42, f0, top - 0.04, Z - 0.3, 612);
    // the band the tide wets, a hand proud of the face
    const w0 = BAY.water - 0.8,
      w1 = BAY.water + 0.35;
    box(M.wet, V.x0 - 0.42, V.x1 + 0.42, w0, w1, Z - 0.32, Z - 0.3);
    box(M.wet, V.x0 - 0.42, V.x0 - 0.4, w0, w1, Z - 0.3, HS.z1);
    box(M.wet, V.x1 + 0.4, V.x1 + 0.42, w0, w1, Z - 0.3, 612);
    // the copings: cast stone on the cabana's corner and the sides; the dock's edge a teak beam
    box(M.coping, V.x0 - 0.45, P.x0 - 0.4, top - 0.02, top + 0.05, Z - 0.35, Z + 0.35);
    box(M.coping, V.x0 - 0.45, V.x0 + 0.34, top - 0.02, top + 0.05, Z + 0.35, HS.z1);
    box(M.coping, V.x1 - 0.34, V.x1 + 0.45, top - 0.02, top + 0.05, Z + 0.3, 612);
    box(M.teak, P.x1 + 0.4, BL.x0, top - 0.25, top + 0.02, Z - 0.3, Z + 0.3);
    box(M.teak, BL.x0, V.x1 + 0.4, BL.y - 0.3, BL.y + 0.02, Z - 0.3, Z + 0.3);
    // the water spilling over the pool's edge down the wall into the sea
    pane(M.spill, P.x0, Z - 0.32, P.x1, Z - 0.32, BAY.water - 0.1, P.surface - 0.02);
    // glass along the edges that are no dock: the cabana's corner, the sides
    railLine(V.x0 + 0.45, Z + 0.15, P.x0 - 0.45, Z + 0.15, top);
    railLine(V.x0 + 0.15, Z + 0.3, V.x0 + 0.15, 596, top);
    railLine(V.x1 - 0.15, Z + 4.2, V.x1 - 0.15, 600, top);
  }

  // ---- the walls on land: the street front, the gate, the sides ------------------------------------------
  const WT = 0.34;
  const G = V.gate;
  /** The gate's pillars: their outer faces (the leaves hang inside them). */
  const GP = { w0: G.x0 - 1.4, e1: G.x1 + 1.4 };
  {
    const Z1 = V.z1;
    // the street front: a limestone plinth, black railings over it between white piers with their
    // lanterns, a tall clipped hedge behind (privacy, green through the bars)
    const runs: [number, number][] = [
      [V.x0, GP.w0],
      [GP.e1, V.x1],
    ];
    for (const [a, b] of runs) {
      box(M.cladding, a, b, CURB - 0.1, CURB + 1.15, Z1 - WT, Z1);
      box(M.coping, a - 0.03, b + 0.03, CURB + 1.15, CURB + 1.23, Z1 - WT - 0.05, Z1 + 0.05);
      const n = Math.max(1, Math.round((b - a) / 6.6));
      const piers: number[] = [];
      for (let i = 0; i <= n; i++) piers.push(a + ((b - a) * i) / n);
      for (const [i, x] of piers.entries()) {
        // (the corner piers inside the plot's corners, the one at the gate against its pillar)
        const px = i === 0 ? x + 0.31 : i === n ? x - 0.31 : x;
        if ((a === V.x0 && i === n) || (b === V.x1 && i === 0)) continue;
        box(M.render, px - 0.31, px + 0.31, CURB - 0.1, CURB + 2.6, Z1 - 0.5, Z1 + 0.12);
        box(M.coping, px - 0.38, px + 0.38, CURB + 2.6, CURB + 2.7, Z1 - 0.57, Z1 + 0.19);
        box(M.steel, px - 0.12, px + 0.12, CURB + 2.7, CURB + 2.76, Z1 - 0.31, Z1 - 0.07);
        box(M.lantern, px - 0.09, px + 0.09, CURB + 2.76, CURB + 3.02, Z1 - 0.28, Z1 - 0.1);
        box(M.steel, px - 0.12, px + 0.12, CURB + 3.02, CURB + 3.07, Z1 - 0.31, Z1 - 0.07);
      }
      // the railings between the piers (to the corner piers, to the gate's pillars)
      const offA = a === V.x0 ? 0.62 : 0,
        offB = b === V.x1 ? 0.62 : 0;
      for (let i = 0; i < n; i++) {
        const r0 = piers[i] + (i === 0 ? offA : 0.31),
          r1 = piers[i + 1] - (i === n - 1 ? offB : 0.31);
        const z = Z1 - WT / 2;
        box(M.steel, r0, r1, CURB + 1.3, CURB + 1.35, z - 0.03, z + 0.03);
        box(M.steel, r0, r1, CURB + 2.32, CURB + 2.38, z - 0.03, z + 0.03);
        for (let x = r0 + 0.08; x < r1 - 0.04; x += 0.13) box(M.steel, x - 0.013, x + 0.013, CURB + 1.23, CURB + 2.45, z - 0.013, z + 0.013);
      }
    }
    // the hedge behind it (clear of the gate's leaves, swung open against it)
    box(M.hedge, V.x0 + WT, GP.w0 - 3.4, CURB, CURB + 2.5, Z1 - 2.1, Z1 - WT - 0.1);
    box(M.hedge, GP.e1 + 3.4, V.x1 - WT, CURB, CURB + 2.5, Z1 - 2.1, Z1 - WT - 0.1);
    // the side walls on land (their feet down to the sand and the hill outside), hedges inside them
    box(M.render, V.x0, V.x0 + WT, CURB - 2.6, CURB + 2.4, 596, Z1 - WT);
    box(M.render, V.x1 - WT, V.x1, CURB - 2.6, CURB + 2.4, 600, Z1 - WT);
    box(M.coping, V.x0 - 0.04, V.x0 + WT + 0.04, CURB + 2.4, CURB + 2.48, 596, Z1);
    box(M.coping, V.x1 - WT - 0.04, V.x1 + 0.04, CURB + 2.4, CURB + 2.48, 600, Z1);
    box(M.hedge, V.x0 + WT, V.x0 + 1.5, CURB, CURB + 2.3, 597, Z1 - 2.1);
    box(M.hedge, V.x1 - 1.3, V.x1 - WT, CURB, CURB + 2.3, 601, Z1 - 2.1);
  }
  // the gate: two tall limestone pillars, stepped caps, lanterns; the house's name on the east one
  for (const [x0, x1] of [
    [GP.w0, G.x0],
    [G.x1, GP.e1],
  ]) {
    const x = (x0 + x1) / 2;
    box(M.cladding, x0, x1, CURB - 0.1, CURB + 3.8, V.z1 - 0.85, V.z1 + 0.35);
    box(M.coping, x0 - 0.12, x1 + 0.12, CURB + 3.8, CURB + 3.95, V.z1 - 0.97, V.z1 + 0.47);
    box(M.coping, x0 + 0.1, x1 - 0.1, CURB + 3.95, CURB + 4.05, V.z1 - 0.75, V.z1 + 0.25);
    // a bronze inlay down its street face
    box(M.bronze, x - 0.05, x + 0.05, CURB + 0.4, CURB + 3.5, V.z1 + 0.35, V.z1 + 0.37);
    // the lantern: a bronze frame round its glow
    box(M.bronze, x - 0.24, x + 0.24, CURB + 4.05, CURB + 4.12, V.z1 - 0.49, V.z1 - 0.01);
    box(M.lantern, x - 0.17, x + 0.17, CURB + 4.12, CURB + 4.62, V.z1 - 0.42, V.z1 - 0.08);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(M.bronze, x + sx * 0.2 - 0.025, x + sx * 0.2 + 0.025, CURB + 4.12, CURB + 4.62, V.z1 - 0.25 + sz * 0.2 - 0.025, V.z1 - 0.25 + sz * 0.2 + 0.025);
    add(M.bronze, new THREE.ConeGeometry(0.34, 0.24, 4).rotateY(Math.PI / 4).translate(x - CX, CURB + 4.74, V.z1 - 0.25 - CZ));
  }
  light((G.x0 + G.x1) / 2, CURB + 3.6, V.z1 + 1.2, "#ffd29a", 7);
  // the leaves: bronze, an arch across the two, spear-topped bars, a band of rings, swung open
  // inward against the wall (their hinges in the pillars' inner faces)
  {
    const W = (G.x1 - G.x0) / 2;
    const Hh = (u: number) => 2.55 + 0.55 * Math.sin((Math.PI / 2) * (u / W));
    const leaf = (hx: number, hz: number, dirx: number, dirz: number) => {
      const yaw = Math.atan2(-dirz, dirx);
      const mtx = new THREE.Matrix4().makeRotationY(yaw).setPosition(hx - CX, CURB, hz - CZ);
      const put = (m: THREE.Material, g: THREE.BufferGeometry) => add(m, g.applyMatrix4(mtx));
      const b = (m: THREE.Material, u0: number, u1: number, v0: number, v1: number, t = 0.06) => put(m, new THREE.BoxGeometry(u1 - u0, v1 - v0, t).translate((u0 + u1) / 2, (v0 + v1) / 2, 0));
      b(M.bronze, 0, 0.1, 0.06, Hh(0) + 0.05, 0.08);
      b(M.bronze, W - 0.1, W, 0.06, Hh(W) + 0.05, 0.08);
      b(M.bronze, 0.1, W - 0.1, 0.1, 0.2);
      b(M.bronze, 0.1, W - 0.1, 0.2, 1.0, 0.025);
      b(M.bronze, 0.1, W - 0.1, 1.0, 1.08);
      b(M.bronze, 0.1, W - 0.1, 1.38, 1.44);
      for (let u = 0.3; u < W - 0.2; u += 0.31) put(M.brass, new THREE.TorusGeometry(0.11, 0.016, 6, 16).translate(u, 1.23, 0));
      let pu = 0.1,
        pv = Hh(0.1) - 0.16;
      for (let u = 0.22; u < W - 0.1; u += 0.135) {
        const h = Hh(u);
        b(M.bronze, u - 0.013, u + 0.013, 1.44, h, 0.026);
        put(M.brass, new THREE.ConeGeometry(0.035, 0.13, 4).translate(u, h + 0.06, 0));
        // the top rail along the arch, under the spears
        const v = h - 0.16;
        const len = Math.hypot(u - pu, v - pv);
        put(M.bronze, new THREE.BoxGeometry(len, 0.05, 0.05).rotateZ(Math.atan2(v - pv, u - pu)).translate((u + pu) / 2, (v + pv) / 2, 0));
        pu = u;
        pv = v;
      }
    };
    // (swung in a little past square, either side of the way in: seen from the street, clear of a car)
    const a = (100 * Math.PI) / 180;
    leaf(G.x0, V.z1 - 0.55, Math.cos(a), -Math.sin(a));
    leaf(G.x1, V.z1 - 0.55, -Math.cos(a), -Math.sin(a));
  }

  // ---- the motor court: the fountain, the palms, the porte-cochère ----------------------------------------
  const FN = V.fountain;
  {
    const x = FN.x,
      z = FN.z,
      r = FN.r;
    const rim = CURB + 0.7,
      w = CURB + 0.52;
    // the basin: a limestone ring, its floor dark, a ring of pale stone in the setts round it
    cyl(M.cladding, x, CURB - 0.05, rim, z, r, r, 48, true);
    cyl(M.basin, x, CURB, rim, z, r - 0.32, r - 0.32, 48, true);
    ring(M.coping, x, rim, z, r - 0.34, r + 0.04, 48);
    disc(M.dark, x, CURB + 0.05, z, r - 0.3, false, 40);
    ring(M.coping, x, CURB + 0.012, z, r + 0.04, r + 1.3, 48);
    // (and a band of the same stone in the setts round the way a car turns about it)
    ring(M.coping, x, CURB + 0.012, z, r + 5.2, r + 5.6, 64);
    // the tiers: a column, the lower bowl, a slimmer column, the upper bowl, the finial
    cyl(M.cladding, x, CURB, CURB + 1.35, z, 0.42, 0.34, 20);
    cyl(M.cladding, x, CURB + 1.25, CURB + 1.5, z, 0.5, 1.55, 32);
    cyl(M.cladding, x, CURB + 1.5, CURB + 2.25, z, 0.22, 0.16, 16);
    cyl(M.cladding, x, CURB + 2.18, CURB + 2.35, z, 0.25, 0.8, 24);
    cyl(M.cladding, x, CURB + 2.35, CURB + 2.65, z, 0.1, 0.05, 12);
    // the water: falling from each bowl's lip in a sheet, the jet over the top
    cyl(M.spill, x, w, CURB + 1.5, z, 1.57, 1.57, 40, true);
    cyl(M.spill, x, CURB + 1.48, CURB + 2.35, z, 0.82, 0.82, 32, true);
    cyl(M.spill, x, CURB + 2.6, CURB + 3.3, z, 0.05, 0.02, 8);
    add(M.poolGlow, new THREE.RingGeometry(0.6, r - 0.4, 40).rotateX(-Math.PI / 2).translate(x - CX, w - 0.12, z - CZ));
    circles.push([x, z, r + 0.1]);
    light(x, CURB + 1.0, z, "#bfefff", 3.5);
  }
  // the palms: either side of the way in, along the east wall, in the gardens (lamps at their feet by night)
  const trees: { x: number; y: number; z: number; species: Species; seed: number }[] = [];
  const palm = (x: number, z: number, seed: number, o: { planter?: boolean; lit?: boolean; y?: number; car?: boolean; bed?: boolean } = {}) => {
    const y = o.y ?? top;
    if (o.planter) {
      cyl(M.planter, x, y, y + 0.62, z, 0.7, 0.62, 20);
      cyl(M.lawn, x, y + 0.6, y + 0.64, z, 0.6, 0.6, 20);
    } else if (o.bed) {
      // (in a lawn already)
    } else {
      // (a square of stone round its foot, flush)
      box(M.coping, x - 0.7, x + 0.7, y - 0.04, y + 0.012, z - 0.7, z + 0.7);
      box(M.lawn, x - 0.55, x + 0.55, y - 0.04, y + 0.02, z - 0.55, z + 0.55);
    }
    trees.push({ x, y: y + (o.planter ? 0.6 : 0), z, species: "palm", seed });
    if (o.car !== false) circles.push([x, z, o.planter ? 0.75 : 0.35]);
    // two small lamps in the ground by its foot
    if (o.lit !== false) for (const s of [-1, 1]) disc(M.lantern, x + s * 0.45, y + (o.planter ? 0.65 : 0.03), z + 0.25, 0.07, false, 10);
  };
  // (lawns in the court: a verge along the east wall, the corners either side of the gate, a low
  // clipped edge round them; all flush, nothing a car meets on its way)
  for (const [x0, x1, z0, z1] of [
    [V.x1 - 4.4, V.x1 - 0.34, HS.z1 + 4, V.z1 - 2.1],
    [286, G.x0 - 4.6, V.z1 - 8.2, V.z1 - 2.1],
    [G.x1 + 4.6, V.x1 - 4.4, V.z1 - 8.2, V.z1 - 2.1],
  ]) {
    box(M.lawn, x0, x1, base, top + 0.02, z0, z1);
    for (const [a0, a1, b0, b1] of [
      [x0, x1, z0, z0 + 0.12],
      [x0, x0 + 0.12, z0, z1],
      [x1 - 0.12, x1, z0, z1],
    ])
      box(M.coping, a0, a1, top - 0.02, top + 0.05, b0, b1);
  }
  palm(G.x0 - 7.6, V.z1 - 5.2, 1, { bed: true });
  palm(G.x1 + 7.6, V.z1 - 5.2, 2, { bed: true });
  palm(G.x1 + 13.5, V.z1 - 5.6, 9, { bed: true });
  for (const [i, z] of [616, 622, 628, 634].entries()) palm(V.x1 - 2.4, z, 3 + i, { bed: true });
  palm(288.6, HS.z1 + 5.2, 7);
  // the formal garden: a lawn in a low clipped hedge, a reflecting pool down its middle with its jets,
  // two rows of palms along it, stone benches
  {
    const gx0 = 253,
      gx1 = 284,
      gz0 = 613.5,
      gz1 = 634.5;
    const hh = CURB + 0.75;
    box(M.hedge, gx0, gx1, CURB, hh, gz0, gz0 + 0.55);
    box(M.hedge, gx0, gx1, CURB, hh, gz1 - 0.55, gz1);
    box(M.hedge, gx0, gx0 + 0.55, CURB, hh, gz0, gz1);
    box(M.hedge, gx1 - 0.55, gx1, CURB, hh, gz0, 621.5);
    box(M.hedge, gx1 - 0.55, gx1, CURB, hh, 626.5, gz1);
    const rz0 = 622.6,
      rz1 = 625.4,
      rx0 = 258,
      rx1 = 280;
    box(M.coping, rx0 - 0.35, rx1 + 0.35, CURB, CURB + 0.38, rz0 - 0.35, rz0);
    box(M.coping, rx0 - 0.35, rx1 + 0.35, CURB, CURB + 0.38, rz1, rz1 + 0.35);
    box(M.coping, rx0 - 0.35, rx0, CURB, CURB + 0.38, rz0, rz1);
    box(M.coping, rx1, rx1 + 0.35, CURB, CURB + 0.38, rz0, rz1);
    box(M.dark, rx0, rx1, CURB, CURB + 0.06, rz0, rz1);
    for (let x = rx0 + 1.8; x < rx1 - 1; x += 3.6) cyl(M.spill, x, CURB + 0.3, CURB + 1.0, (rz0 + rz1) / 2, 0.03, 0.015, 6);
    for (const [i, x] of [261, 269, 277].entries())
      for (const [j, z] of [617.6, 630.4].entries()) palm(x, z, 20 + i * 2 + j, { car: false });
    for (const z of [619.6, 628.4]) {
      box(M.cladding, 266.2, 271.8, CURB, CURB + 0.42, z - 0.28, z + 0.28);
      box(M.cladding, 266.6, 267.2, CURB, CURB + 0.38, z - 0.24, z + 0.24);
      box(M.cladding, 270.8, 271.4, CURB, CURB + 0.38, z - 0.24, z + 0.24);
    }
    // bushes at the hedge's corners
    for (const [x, z] of [
      [gx0 + 1.2, gz0 + 1.2],
      [gx0 + 1.2, gz1 - 1.2],
      [gx1 - 1.2, gz0 + 1.2],
      [gx1 - 1.2, gz1 - 1.2],
    ])
      trees.push({ x, y: top, z, species: "bush", seed: Math.round(x + z) });
  }
  // the side garden west of the house: palms on the lawn, stepping stones down to the terrace
  for (const [i, [x, z]] of [
    [254.5, 591],
    [259.5, 595.5],
    [254.5, 600.5],
    [259.5, 605],
  ].entries())
    palm(x, z, 30 + i, { car: false });
  for (let z = HS.z0 + 0.8; z < HS.z1 + 1.2; z += 1.25) box(M.slabs, 266.4, 267.6, top - 0.02, top + 0.035, z - 0.45, z + 0.45);
  // bollard lights along the court's west edge
  for (const z of [614, 619, 625, 631]) {
    cyl(M.steel, 286.6, top, top + 0.72, z, 0.08, 0.08, 10);
    cyl(M.lantern, 286.6, top + 0.6, top + 0.7, z, 0.085, 0.085, 10);
    circles.push([286.6, z, 0.12]);
  }

  // ---- the terrace: the cabana, the sun deck, the loggia, the fire pit, the kitchen, the dock ----------------
  // the cabana: a white pavilion on a teak deck at the plot's corner, open to the pool and the sea
  {
    const C = CAB,
      h = CURB + 3.1;
    box(M.deck, C.x0, C.x1, top, top + 0.1, C.z0, C.z1);
    box(M.render, C.x0, C.x0 + 0.35, top, h, C.z0, C.z1);
    box(M.render, C.x0, C.x1, top, h, C.z1 - 0.35, C.z1);
    box(M.fascia, C.x1 - 0.22, C.x1, top + 0.1, h, C.z0, C.z0 + 0.22);
    box(M.fascia, C.x0 - 0.4, C.x1 + 0.4, h, h + 0.26, C.z0 - 0.4, C.z1 + 0.4);
    box(M.sedum, C.x0 - 0.2, C.x1 + 0.2, h + 0.26, h + 0.32, C.z0 - 0.2, C.z1 + 0.2);
    box(M.soffit, C.x0 + 0.35, C.x1 + 0.38, h - 0.02, h, C.z0 - 0.38, C.z1 - 0.35);
    for (const x of [253.4, 256.6, 259.8]) for (const z of [573.4, 577, 580.4]) dl(x, h - 0.02, z);
    // its daybed (a deep mattress, cushions against the back), two lounge chairs, a side table
    box(M.teak, C.x0 + 0.5, C.x0 + 3.6, top + 0.1, top + 0.42, 573.2, 579);
    box(M.cushion, C.x0 + 0.55, C.x0 + 3.55, top + 0.42, top + 0.64, 573.25, 578.95);
    for (const z of [573.9, 575.4, 576.9, 578.3]) box(M.cushion, C.x0 + 0.6, C.x0 + 0.95, top + 0.64, top + 1.15, z - 0.55, z + 0.55);
    for (const z of [574, 578.2]) {
      box(M.teak, 257.4, 258.4, top + 0.1, top + 0.38, z - 0.48, z + 0.48);
      box(M.cushion, 257.45, 258.35, top + 0.38, top + 0.52, z - 0.45, z + 0.45);
      box(M.cushion, 257.45, 257.7, top + 0.52, top + 0.95, z - 0.45, z + 0.45);
    }
    cyl(M.marble, 258.0, top + 0.1, top + 0.5, 576.1, 0.32, 0.32, 20);
    // its curtains gathered at the open corner and along the back
    for (const [x, z] of [
      [C.x1 - 0.45, C.z0 + 0.25],
      [C.x0 + 0.5, C.z0 + 0.3],
      [C.x1 - 0.4, C.z1 - 0.55],
    ])
      box(M.canvas, x - 0.16, x + 0.16, top + 0.1, h - 0.05, z - 0.12, z + 0.12);
    // a lantern hanging in it
    rod(M.steel, 256.4, h, 576.6, 256.4, h - 0.8, 576.6, 0.01);
    box(M.lantern, 256.2, 256.6, h - 1.25, h - 0.8, 576.4, 576.8);
  }
  // the sun deck: loungers in pairs along the pool facing the sea, square parasols between them
  for (const [i, x0] of [268, 275.5, 283, 290.5].entries()) {
    lounger(x0, 579.6);
    lounger(x0 + 1.9, 579.6);
    cyl(M.marble, x0 + 0.95, top, top + 0.42, 579.0, 0.22, 0.22, 16);
    if (i % 2) palm(x0 + 4.7, 578.6, 50 + i);
    else parasol(x0 + 4.7, 579.2);
  }
  // planters with their bushes along the pool's west end and the cabana's front
  for (const z of [578.6, 584.6]) {
    box(M.planter, 262.6, 264.2, top, top + 0.55, z - 0.8, z + 0.8);
    trees.push({ x: 263.4, y: top + 0.55, z, species: "bush", seed: Math.round(z * 3) });
  }
  // the loggia under the house's overhang: a lounge (west), the long table (east)
  sofaX(273, 279, 587.0, 1);
  sofaZ(582.6, 586.6, 272.5, -1);
  box(M.marble, 274.3, 277.7, top, top + 0.38, 584.0, 585.4);
  sofaX(281.5, 287.5, 587.0, 1);
  sofaZ(582.6, 586.6, 288.0, 1);
  box(M.marble, 282.6, 286.4, top, top + 0.38, 584.0, 585.4);
  {
    const tz = 586.0;
    box(M.teak, 315.5, 326.5, top + 0.72, top + 0.78, tz - 0.6, tz + 0.6);
    for (const x of [316.2, 325.8]) box(M.steel, x - 0.06, x + 0.06, top, top + 0.72, tz - 0.5, tz + 0.5);
    for (let x = 317; x < 326; x += 1.6) {
      chair(x, tz - 1.0, 0);
      chair(x, tz + 1.0, Math.PI);
    }
  }
  // the fire pit: a round stone table, its flames by night, four lounge chairs round it on a stone circle
  {
    const { x, z } = PIT;
    disc(M.coping, x, top + 0.006, z, 3.2, false, 40);
    cyl(M.cladding, x, top, top + 0.42, z, 0.95, 0.95, 32);
    disc(M.dark, x, top + 0.425, z, 0.62, false, 24);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      add(M.fire, new THREE.ConeGeometry(0.11, 0.5 + (i % 3) * 0.12, 5).translate(x + Math.cos(a) * 0.28 - CX, top + 0.68 + (i % 3) * 0.06, z + Math.sin(a) * 0.28 - CZ));
    }
    add(M.fire, new THREE.ConeGeometry(0.16, 0.75, 6).translate(x - CX, top + 0.8, z - CZ));
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      const cx = x + Math.cos(a) * 2.1,
        cz = z + Math.sin(a) * 2.1;
      // (each turned to the fire)
      const face = Math.atan2(x - cx, z - cz);
      const g = [new THREE.BoxGeometry(0.9, 0.3, 0.9).translate(0, top + 0.15, 0), new THREE.BoxGeometry(0.84, 0.14, 0.84).translate(0, top + 0.37, 0), new THREE.BoxGeometry(0.84, 0.45, 0.16).translate(0, top + 0.6, -0.36)];
      add(M.teak, g[0].rotateY(face).translate(cx - CX, 0, cz - CZ));
      add(M.cushion, g[1].rotateY(face).translate(cx - CX, 0, cz - CZ));
      add(M.cushion, g[2].rotateY(face).translate(cx - CX, 0, cz - CZ));
    }
    light(x, top + 1.0, z, "#ff9a4a", 5);
  }
  palm(P.x1 + 1.5, 578.2, 40);
  // the outdoor kitchen under its pergola: the cooking counter (a grill, a sink), the bar island and its stools
  {
    const K = KIT,
      h = top + 2.9;
    for (const x of [K.x0, (K.x0 + K.x1) / 2, K.x1]) for (const z of [K.z0, K.z1]) box(M.fascia, x - 0.14, x + 0.14, top, h, z - 0.14, z + 0.14);
    for (const z of [K.z0, K.z1]) box(M.fascia, K.x0 - 0.3, K.x1 + 0.3, h, h + 0.3, z - 0.15, z + 0.15);
    for (let x = K.x0 + 0.2; x < K.x1; x += 0.42) box(M.teak, x - 0.05, x + 0.05, h + 0.3, h + 0.42, K.z0 - 0.5, K.z1 + 0.5);
    // the counter along the back, its marble top, the grill and the sink
    box(M.render, 316, 328, top, top + 0.9, 581.6, 582.6);
    box(M.marble, 315.9, 328.1, top + 0.9, top + 0.96, 581.5, 582.7);
    box(M.steel, 318, 320.6, top + 0.96, top + 1.02, 581.7, 582.5);
    for (let x = 318.1; x < 320.6; x += 0.12) box(M.chrome, x - 0.012, x + 0.012, top + 1.02, top + 1.04, 581.75, 582.45);
    box(M.chrome, 323.6, 324.6, top + 0.92, top + 0.965, 581.8, 582.4);
    rod(M.chrome, 324.1, top + 0.96, 582.55, 324.1, top + 1.3, 582.4, 0.02);
    // (the hood over the grill)
    box(M.steel, 317.8, 320.8, h - 0.9, h - 0.05, 581.5, 582.7);
    // the island bar, its stools to the sea
    box(M.render, 318, 326, top, top + 1.0, 577.8, 578.6);
    box(M.marble, 317.8, 326.2, top + 1.0, top + 1.06, 577.6, 578.8);
    for (let x = 318.8; x < 326; x += 1.4) {
      cyl(M.chrome, x, top, top + 0.74, 576.9, 0.03);
      cyl(M.chrome, x, top, top + 0.02, 576.9, 0.2);
      cyl(M.teak, x, top + 0.74, top + 0.8, 576.9, 0.21);
    }
    // its pendants over the island
    for (let x = 319.5; x < 326; x += 2.2) {
      rod(M.steel, x, h, 578.2, x, h - 0.7, 578.2, 0.008);
      add(M.lantern, new THREE.SphereGeometry(0.13, 10, 8).translate(x - CX, h - 0.82, 578.2 - CZ));
    }
  }
  palm(V.x1 - 1.6, KIT.z0 + 0.6, 41, { planter: true });
  light(286, top + 3.4, 579.5, "#ffe0b8", 6);
  // the dock: bollards, cleats, fenders on the wall's face, low lights, a life ring, a swim ladder,
  // and the gangway stowed upright at the boarding point by the yacht's stern
  {
    const Z = V.z0;
    const Y = V.yacht;
    for (const x of [305.5, 318, BL.x0 - 0.8]) {
      cyl(M.steel, x, top, top + 0.42, Z + 0.55, 0.16, 0.13, 14);
      cyl(M.steel, x, top + 0.42, top + 0.5, Z + 0.55, 0.24, 0.24, 14);
      circles.push([x, Z + 0.55, 0.25]);
    }
    for (const x of [311.5, 324]) {
      box(M.steel, x - 0.16, x + 0.16, top, top + 0.08, Z + 0.45, Z + 0.65);
      box(M.steel, x - 0.24, x + 0.24, top + 0.08, top + 0.13, Z + 0.5, Z + 0.6);
    }
    // (the fenders hang inside the berth's margin: nothing of them in the yacht's water)
    for (let x = P.x1 + 2.4; x < V.x1 - 0.5; x += 3.6) {
      cyl(M.fender, x, BAY.water - 0.35, CURB - 0.45, Z - 0.16, 0.14, 0.14, 12);
      rod(M.rope, x, CURB - 0.45, Z - 0.16, x, top + 0.02, Z + 0.1, 0.015);
    }
    for (const x of [305, 312, 319, 326]) {
      cyl(M.steel, x, top, top + 0.62, Z + 3.65, 0.09, 0.09, 10);
      cyl(M.lantern, x, top + 0.48, top + 0.6, Z + 3.65, 0.095, 0.095, 10);
      circles.push([x, Z + 3.65, 0.12]);
    }
    light(318, top + 2.4, Z + 2.2, "#ffe6c8", 5);
    // the life ring on its post
    box(M.fascia, P.x1 + 0.8, P.x1 + 0.95, top, top + 1.5, Z + 3.3, Z + 3.45);
    add(M.buoy, new THREE.TorusGeometry(0.32, 0.08, 8, 20).translate(P.x1 + 0.87 - CX, top + 1.05, Z + 3.25 - CZ));
    // the swim ladder down the wall by the yacht's bow
    for (const s of [-0.24, 0.24]) {
      rod(M.chrome, P.x1 + 1.2 + s, BAY.water - 0.8, Z - 0.12, P.x1 + 1.2 + s, top + 0.9, Z - 0.12, 0.022, 8);
      rod(M.chrome, P.x1 + 1.2 + s, top + 0.9, Z - 0.12, P.x1 + 1.2 + s, top + 0.9, Z + 0.5, 0.022, 8);
    }
    for (let y = BAY.water - 0.6; y < top; y += 0.3) rod(M.chrome, P.x1 + 0.96, y, Z - 0.12, P.x1 + 1.44, y, Z - 0.12, 0.018, 6);
    // the gangway off the landing toward the yacht's aft deck: a teak plank on its pedestal, chrome
    // stanchions and a rope either side (its tip short of the berth's water)
    {
      const x = Y.board.x + 0.9;
      const y0 = BL.y + 0.12,
        y1 = BL.y + 0.28;
      box(M.steel, x - 0.5, x + 0.5, BL.y, y0, Z + 0.55, Z + 1.0);
      beam(M.teak, x, y0 + 0.03, Z + 0.9, x, y1, Z - 0.28, 0.8, 0.06);
      for (const s of [-0.42, 0.42]) {
        for (const zz of [Z + 0.75, Z - 0.15]) rod(M.chrome, x + s, y0 + 0.05, zz, x + s, y0 + 0.95, zz, 0.018, 8);
        rod(M.rope, x + s, y0 + 0.9, Z + 0.75, x + s, y0 + 0.9, Z - 0.15, 0.022, 6);
      }
    }
  }

  // ---- the house -----------------------------------------------------------------------------------------
  into = houseParts;
  // what stops a body round its rooms in the game (the glass is no wall to the solid shape seen from above)
  box(M.blocker, HS.x0 + 0.3, HS.x1 - 0.3, F0, F0 + 2.3, HS.z0 + 0.3, HS.z1 - 0.7);
  // its floor (one step over the terrace and the court), the porch's marble landing before the door
  box(M.marble, HS.x0, HS.x1, top - 0.1, F0, HS.z0, HS.z1);
  box(M.marble, V.hall.x0, V.hall.x1, top - 0.1, F0, HS.z1 - 1, HS.z1 + 1.8);

  // -- the slabs: the first floor's and the roof's, thin-edged and cantilevered, lit from under --
  // (the first floor's in two, its middle the great room's two storeys; a gallery crosses at its back)
  box(M.fascia, SLAB1.x0, GR.x0, G_TOP, L1, SLAB1.z0, SLAB1.z1);
  box(M.fascia, GR.x1, SLAB1.x1, G_TOP, L1, SLAB1.z0, SLAB1.z1);
  box(M.fascia, GR.x0, GR.x1, G_TOP, L1, 600, 604);
  box(M.fascia, SLAB2.x0, SLAB2.x1, U_TOP, ROOF, SLAB2.z0, SLAB2.z1);
  // (a shadow line under each slab's edge: a darker reveal)
  for (const [x0, x1, y] of [
    [SLAB1.x0, GR.x0, G_TOP],
    [GR.x1, SLAB1.x1, G_TOP],
  ]) {
    box(M.soffit, x0 + 0.05, x1 - 0.05, y - 0.02, y, SLAB1.z0 + 0.05, HS.z0);
    box(M.soffit, x0 + 0.05, x1 - 0.05, y - 0.02, y, HS.z1, SLAB1.z1 - 0.05);
    for (let x = x0 + 1.3; x < x1 - 0.8; x += 2.6) {
      dl(x, y - 0.02, (SLAB1.z0 + HS.z0) / 2);
      dl(x, y - 0.02, (HS.z1 + SLAB1.z1) / 2);
    }
  }
  box(M.soffit, SLAB2.x0 + 0.05, SLAB2.x1 - 0.05, U_TOP - 0.02, U_TOP, SLAB2.z0 + 0.05, 589);
  box(M.soffit, SLAB2.x0 + 0.05, SLAB2.x1 - 0.05, U_TOP - 0.02, U_TOP, 609.5, SLAB2.z1 - 0.05);
  for (let x = SLAB2.x0 + 1.5; x < SLAB2.x1 - 1; x += 2.6) {
    dl(x, U_TOP - 0.02, SLAB2.z0 + 1.2);
    dl(x, U_TOP - 0.02, SLAB2.z1 - 0.9);
  }
  // the balconies' teak floors on the first floor slab, their glass
  box(M.deck, SLAB1.x0 + 0.1, GR.x0 - 0.05, L1, L1 + 0.03, SLAB1.z0 + 0.1, UPW.z0);
  box(M.deck, GR.x1 + 0.65, SLAB1.x1 - 0.1, L1, L1 + 0.03, SLAB1.z0 + 0.1, UPE.z0);
  railLine(SLAB1.x0 + 0.12, SLAB1.z0 + 0.12, GR.x0 - 0.65, SLAB1.z0 + 0.12, L1);
  railLine(SLAB1.x0 + 0.12, SLAB1.z0 + 0.12, SLAB1.x0 + 0.12, UPW.z0, L1);
  railLine(GR.x1 + 0.65, SLAB1.z0 + 0.12, SLAB1.x1 - 0.12, SLAB1.z0 + 0.12, L1);
  railLine(SLAB1.x1 - 0.12, SLAB1.z0 + 0.12, SLAB1.x1 - 0.12, UPE.z0, L1);
  // the great room's frame: two deep white fins from the terrace to the roof
  box(M.fascia, GR.x0 - 0.6, GR.x0, top - 0.1, U_TOP, SLAB1.z0, HS.z0 + 0.2);
  box(M.fascia, GR.x1, GR.x1 + 0.6, top - 0.1, U_TOP, SLAB1.z0, HS.z0 + 0.2);

  // -- the sea side: glass floor to ceiling, the great room's two storeys of it --
  glazeX(HS.x0, GR.x0 - 0.6, HS.z0, F0, G_TOP, 1, 2.35);
  glazeX(GR.x0, GR.x1, HS.z0, F0, U_TOP, 1, 2.25, [G_TOP + 0.2]);
  glazeX(GR.x1 + 0.6, HS.x1, HS.z0, F0, G_TOP, 1, 2.3);
  glazeX(UPW.x0 + 0.4, GR.x0 - 0.6, UPW.z0, L1, U_TOP, 1, 2.4);
  glazeX(GR.x1 + 0.6, UPE.x1, UPE.z0, L1, U_TOP, 1, 2.4);
  // the ends: the dining room's glass on the side garden (west), the den's (east); the upper wings'
  // ends — the west in limestone, the east in white with a tall slot of glass
  glazeZ(HS.z0, 600, HS.x0, F0, G_TOP, 1, 2.4);
  box(M.render, HS.x0, HS.x0 + 0.3, F0, G_TOP, 600, HS.z1);
  glazeZ(HS.z0, 596, HS.x1, F0, G_TOP, -1, 2.7);
  box(M.render, HS.x1 - 0.3, HS.x1, F0, G_TOP, 596, HS.z1);
  box(M.cladding, UPW.x0, UPW.x0 + 0.4, L1, U_TOP, UPW.z0, UPW.z1);
  box(M.render, UPE.x1 - 0.35, UPE.x1, L1, U_TOP, UPE.z0, 599.5);
  box(M.render, UPE.x1 - 0.35, UPE.x1, L1, U_TOP, 601.5, UPE.z1);
  glazeZ(599.5, 601.5, UPE.x1 - 0.17, L1 + 0.2, U_TOP - 0.2, -1, 2);

  // -- the street side --
  const S = HS.z1;
  // the west front in limestone, a ribbon of glass high in it (the kitchen)
  {
    const x0 = HS.x0,
      x1 = V.hall.x0 - 1.2,
      w0 = F0 + 2.7,
      w1 = G_TOP - 0.35;
    box(M.cladding, x0, x1, F0, w0, S - 0.3, S);
    box(M.cladding, x0, x1, w1, G_TOP, S - 0.3, S);
    box(M.cladding, x0, x0 + 2, w0, w1, S - 0.3, S);
    box(M.cladding, x1 - 2, x1, w0, w1, S - 0.3, S);
    glazeX(x0 + 2, x1 - 2, S - 0.15, w0, w1, -1, 2.1);
    for (const x of [274, 279, 284, 289]) trees.push({ x, y: top, z: S + 0.75, species: "bush", seed: x });
  }
  // the planting bed's uplights washing the stone
  for (let x = HS.x0 + 1.5; x < V.hall.x0 - 1.5; x += 3) disc(M.lantern, x, top + 0.03, S + 0.35, 0.06, false, 10);
  // the upper floor's street walls: white, long windows behind teak fins, planters on the slab's ledge
  for (const [x0, x1] of [
    [UPW.x0, V.hall.x0 - 1.2],
    [V.hall.x1 + 1.2, UPE.x1],
  ]) {
    const w0 = L1 + 0.9,
      w1 = U_TOP - 0.45,
      z0 = UPW.z1 - 0.3;
    box(M.render, x0, x1, L1, w0, z0, UPW.z1);
    box(M.render, x0, x1, w1, U_TOP, z0, UPW.z1);
    box(M.render, x0, x0 + 1.4, w0, w1, z0, UPW.z1);
    box(M.render, x1 - 1.4, x1, w0, w1, z0, UPW.z1);
    glazeX(x0 + 1.4, x1 - 1.4, UPW.z1 - 0.15, w0, w1, -1, 2.4);
    for (let x = x0 + 1.2; x < x1 - 1.1; x += 0.28) box(M.teak, x - 0.04, x + 0.04, L1 + 0.25, U_TOP - 0.15, UPW.z1 + 0.18, UPW.z1 + 0.36);
    box(M.teak, x0 + 1.1, x1 - 1.1, U_TOP - 0.15, U_TOP - 0.05, UPW.z1 + 0.12, UPW.z1 + 0.42);
    box(M.planter, x0 + 0.6, x1 - 0.6, L1, L1 + 0.5, UPW.z1 + 0.55, SLAB1.z1 - 0.15);
    box(M.hedge, x0 + 0.7, x1 - 0.7, L1 + 0.5, L1 + 0.75, UPW.z1 + 0.65, SLAB1.z1 - 0.25);
  }
  // the entrance: two limestone blades from the ground through the roof, the porch between them, the
  // glass two storeys tall, the teak pivot door (the game's door), the porte-cochère out over the drive
  {
    const H = V.hall;
    for (const [x0, x1] of [
      [H.x0 - 1.2, H.x0],
      [H.x1, H.x1 + 1.2],
    ])
      box(M.cladding, x0, x1, top - 0.1, ROOF + 0.7, S - 1.2, S + 2);
    const z = S - 1;
    const d = V.door.x;
    glazeX(H.x0, d - 1.25, z, F0, U_TOP, -1, 2, [F0 + 3.8]);
    glazeX(d + 1.25, H.x1, z, F0, U_TOP, -1, 2, [F0 + 3.8]);
    glazeX(d - 1.25, d + 1.25, z, F0 + 3.8, U_TOP, -1, 2.5);
    // the door: a pivoting slab of teak 2.2 m wide, 3.7 m tall, its long brass pull; its frame
    box(M.teak, d - 1.1, d + 1.1, F0, F0 + 3.7, z - 0.08, z + 0.06);
    box(M.brass, d + 0.62, d + 0.68, F0 + 0.7, F0 + 2.9, z + 0.06, z + 0.16);
    for (const y of [F0 + 0.7, F0 + 2.9]) box(M.brass, d + 0.62, d + 0.68, y - 0.03, y + 0.03, z + 0.06, z + 0.16);
    box(M.steel, d - 1.25, d + 1.25, F0 + 3.7, F0 + 3.8, z - 0.08, z + 0.08);
    box(M.steel, d - 1.25, d - 1.1, F0, F0 + 3.7, z - 0.08, z + 0.08);
    box(M.steel, d + 1.1, d + 1.25, F0, F0 + 3.7, z - 0.08, z + 0.08);
    // planters either side of the door on the porch
    for (const x of [H.x0 + 1.4, H.x1 - 1.4]) {
      cyl(M.dark, x, F0, F0 + 0.9, S + 0.3, 0.42, 0.36, 18);
      trees.push({ x, y: F0 + 0.9, z: S + 0.3, species: "bush", seed: Math.round(x) });
    }
    // the porte-cochère: a thin white slab over the drive on two slim columns, lit from under
    const pc = { x0: H.x0 - 1.2, x1: H.x1 + 1.2, z1: S + 8.5 };
    box(M.fascia, pc.x0, pc.x1, G_TOP, L1, S - 1.2, pc.z1);
    box(M.roofing, pc.x0 + 0.25, pc.x1 - 0.25, L1, L1 + 0.03, S + 1.25, pc.z1 - 0.25);
    box(M.soffit, pc.x0 + 0.05, pc.x1 - 0.05, G_TOP - 0.02, G_TOP, S + 1.2, pc.z1 - 0.05);
    for (const x of [pc.x0 + 2.2, pc.x0 + 6, pc.x1 - 6, pc.x1 - 2.2]) for (const zz of [S + 3, S + 6.2]) dl(x, G_TOP - 0.02, zz, 0.09);
    for (const x of [pc.x0 + 1, pc.x1 - 1]) {
      cyl(M.fascia, x, top, G_TOP, pc.z1 - 0.8, 0.17, 0.17, 20);
      cyl(M.steel, x, top, top + 0.05, pc.z1 - 0.8, 0.3, 0.3, 20);
      circles.push([x, pc.z1 - 0.8, 0.3]);
    }
    light(d, G_TOP - 0.4, S + 3.2, "#ffe0b8", 8);
  }
  // the garage: three doors of teak slats under a white band, white piers between them
  {
    const doors = [
      [312.9, 317.9],
      [318.5, 323.5],
      [324.1, 329.1],
    ];
    const dy = F0 + 2.9;
    box(M.render, V.hall.x1 + 1.2, HS.x1, dy, G_TOP, S - 0.3, S);
    const piers = [V.hall.x1 + 1.2, ...doors.flat(), HS.x1];
    for (let i = 0; i < piers.length; i += 2) box(M.render, piers[i], piers[i + 1], F0 - 0.14, dy, S - 0.3, S);
    for (const [x0, x1] of doors) {
      box(M.steel, x0, x1, dy - 0.06, dy, S - 0.45, S - 0.3);
      for (let y = F0; y < dy - 0.1; y += 0.15) box(M.teak, x0 + 0.04, x1 - 0.04, y, y + 0.13, S - 0.48, S - 0.42);
      dl((x0 + x1) / 2, G_TOP - 0.02, S + 0.8, 0.08);
    }
  }

  // -- the roof terrace: its deck, the pergola over the lounge, the hot tub, the stair's box, glass all round --
  {
    const R = ROOF;
    box(M.roofing, SLAB2.x0 + 0.3, SLAB2.x1 - 0.3, R, R + 0.03, SLAB2.z0 + 0.3, SLAB2.z1 - 0.3);
    box(M.deck, 286, 331.5, R + 0.03, R + 0.1, 585.2, 609.2);
    // (the west of the roof planted: a meadow of low green in a gravel border, its stepping stones)
    box(M.sedum, SLAB2.x0 + 1.4, 279, R + 0.03, R + 0.12, SLAB2.z0 + 1.4, SLAB2.z1 - 1.4);
    for (let x = SLAB2.x0 + 3; x < 278; x += 1.3) box(M.slabs, x - 0.4, x + 0.4, R + 0.12, R + 0.15, 596.6, 597.4);
    for (const [x, z] of [
      [268.5, 588],
      [272, 591.5],
      [275.5, 588.5],
      [268, 604],
      [272.5, 606.5],
      [276, 602.5],
      [270.5, 600],
    ])
      trees.push({ x, y: R + 0.12, z, species: "bush", seed: Math.round(x * 3 + z) });
    const e = 0.45;
    railLine(SLAB2.x0 + e, SLAB2.z0 + e, SLAB2.x1 - e, SLAB2.z0 + e, R);
    railLine(SLAB2.x0 + e, SLAB2.z1 - e, SLAB2.x1 - e, SLAB2.z1 - e, R);
    railLine(SLAB2.x0 + e, SLAB2.z0 + e, SLAB2.x0 + e, SLAB2.z1 - e, R);
    railLine(SLAB2.x1 - e, SLAB2.z0 + e, SLAB2.x1 - e, SLAB2.z1 - e, R);
    // the pergola: white posts and beams, teak slats (their shadow striping the lounge)
    const p = { x0: 294, x1: 312, z0: 593, z1: 605 },
      ph = R + 2.9;
    for (const x of [p.x0, p.x1]) for (const z of [p.z0, p.z1]) box(M.fascia, x - 0.12, x + 0.12, R, ph, z - 0.12, z + 0.12);
    for (const z of [p.z0, p.z1]) box(M.fascia, p.x0 - 0.3, p.x1 + 0.3, ph, ph + 0.3, z - 0.12, z + 0.12);
    for (let x = p.x0 + 0.25; x < p.x1; x += 0.45) box(M.teak, x - 0.045, x + 0.045, ph + 0.3, ph + 0.42, p.z0 - 0.6, p.z1 + 0.6);
    // the lounge under it: a long sofa, its return, armchairs, a low table
    sofaX(296, 306, 603.8, 1, R + 0.1);
    sofaZ(597, 603.3, 295.6, -1, R + 0.1);
    for (const x of [302.5, 305.5]) {
      box(M.teak, x - 0.45, x + 0.45, R + 0.1, R + 0.38, 597.2, 598.1);
      box(M.cushion, x - 0.42, x + 0.42, R + 0.38, R + 0.52, 597.25, 598.05);
      box(M.cushion, x - 0.42, x + 0.42, R + 0.52, R + 0.92, 597.2, 597.4);
    }
    box(M.marble, 298.2, 302.8, R + 0.1, R + 0.45, 600.2, 601.8);
    for (const x of [p.x0 + 3, p.x1 - 3]) {
      rod(M.steel, x, ph, 599, x, ph - 0.9, 599, 0.008);
      add(M.lantern, new THREE.SphereGeometry(0.16, 10, 8).translate(x - CX, ph - 1.05, 599 - CZ));
    }
    // loungers on the deck facing the sea, two parasols
    for (let x = 297.5; x < 311; x += 2.3) lounger(x, 588.2, R + 0.1);
    for (const x of [295.2, 312.4]) parasol(x, 589.5, R + 0.1);
    // the hot tub, its water lit by night
    const tub = { x: 318.5, z: 592 };
    cyl(M.fascia, tub.x, R + 0.1, R + 0.72, tub.z, 1.45, 1.45, 36);
    ring(M.coping, tub.x, R + 0.725, tub.z, 1.2, 1.5, 36);
    add(M.poolGlow, new THREE.CircleGeometry(1.15, 28).rotateX(-Math.PI / 2).translate(tub.x - CX, R + 0.4, tub.z - CZ));
    // the stair's box (its glass door on the deck), planters with their bushes
    box(M.render, 280, 286, R, R + 2.9, 598, 607);
    box(M.fascia, 279.7, 286.3, R + 2.9, R + 3.1, 597.7, 607.3);
    glazeX(281, 285, 597.98, R + 0.1, R + 2.6, 1, 2);
    for (const [x0, x1, z0, z1] of [
      [286.4, 287.4, 586, 596],
      [324.6, 325.6, 596, 608.6],
      [313, 323, 607.8, 608.8],
    ]) {
      box(M.planter, x0, x1, R + 0.1, R + 0.62, z0, z1);
      const along = x1 - x0 > z1 - z0;
      for (let k = 0.6; k < (along ? x1 - x0 : z1 - z0) - 0.3; k += 1.4) trees.push({ x: along ? x0 + k : (x0 + x1) / 2, y: R + 0.6, z: along ? (z0 + z1) / 2 : z0 + k, species: "bush", seed: Math.round(k * 7 + x0) });
    }
    light(304, R + 2.6, 599, "#ffd29a", 5);
  }

  // -- what shows through the glass: the rooms (their walls and ceilings warm by night), their furniture --
  {
    const fur = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => box(M.cushion, x0, x1, y0, y1, z0, z1);
    const wood = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => box(M.teak, x0, x1, y0, y1, z0, z1);
    // the west wing below (the living room, the dining room, the kitchen's island)
    box(M.room, HS.x0 + 0.3, GR.x0 - 0.6, F0, G_TOP, 594.4, 594.6);
    box(M.room, HS.x0 + 0.3, GR.x0 - 0.6, G_TOP - 0.06, G_TOP - 0.02, HS.z0 + 0.2, 594.4);
    fur(281, 288, F0, F0 + 0.42, 591.2, 592.1);
    fur(281, 288, F0 + 0.42, F0 + 0.85, 591.9, 592.2);
    box(M.marble, 282.8, 286.2, F0, F0 + 0.36, 589.6, 590.6);
    wood(272.4, 278.6, F0 + 0.72, F0 + 0.78, 590.6, 591.8);
    for (const x of [273, 274.5, 276, 277.5]) for (const z of [590.1, 592.3]) wood(x - 0.22, x + 0.22, F0, F0 + 0.9, z - 0.2, z + 0.2);
    box(M.marble, 289.5, 292.2, F0, F0 + 0.92, 591.8, 593.2);
    for (const x of [273.5, 275.5, 277.5]) add(M.lantern, new THREE.SphereGeometry(0.16, 10, 8).translate(x - CX, G_TOP - 1.1, 591.2 - CZ));
    // the great room (as src/interior/home has it): two storeys of it, the gallery across its back over
    // the hall, the floating stair up its west wall against oak battens, the fire in the stone of its
    // east wall under a canvas, the sofas round a rug facing the sea, a ring of lights hung high
    box(M.room, GR.x0, GR.x1, U_TOP - 0.06, U_TOP - 0.02, HS.z0 + 0.2, 600);
    box(M.fascia, GR.x0, GR.x1, G_TOP, L1, 600, 607);
    railLine(GR.x0 + 1.8, 600.05, GR.x1 - 0.1, 600.05, L1);
    for (let z = 592; z < 600; z += 0.16) wood(GR.x0 + 0.1, GR.x0 + 0.17, F0, U_TOP - 0.05, z, z + 0.07);
    for (let i = 0; i < 24; i++) {
      const z = 592.7 + (7.3 * i) / 24,
        y = F0 + ((L1 - F0) * (i + 1)) / 24;
      wood(GR.x0 + 0.1, GR.x0 + 1.7, y - 0.07, y, z, z + 0.33);
    }
    rod(M.steel, GR.x0 + 1.73, F0 + 1.05, 592.7, GR.x0 + 1.73, L1 + 1.05, 600, 0.025);
    box(M.cladding, GR.x1 - 0.16, GR.x1 - 0.1, F0, U_TOP - 0.02, HS.z0 + 0.25, 595.2);
    box(M.dark, GR.x1 - 0.32, GR.x1 - 0.16, F0 + 0.48, F0 + 1.12, 589.9, 593.5);
    add(M.fire, new THREE.PlaneGeometry(3.4, 0.3).rotateY(-Math.PI / 2).translate(GR.x1 - 0.33 - CX, F0 + 0.66, 591.7 - CZ));
    {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 256;
      const g = c.getContext("2d")!;
      const P2 = ["#f2a07b", "#e8c27a", "#3f8f8a", "#efe4d0", "#c85a4e", "#24414e"];
      g.fillStyle = "#efe6d6";
      g.fillRect(0, 0, 512, 256);
      let s = 7;
      const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < 8; i++) {
        g.globalAlpha = 0.6 + rnd() * 0.35;
        g.fillStyle = P2[Math.floor(rnd() * P2.length)];
        g.fillRect(rnd() * 400, rnd() * 180, 120 + rnd() * 240, 50 + rnd() * 110);
      }
      g.globalAlpha = 0.9;
      g.fillStyle = "#f7c66b";
      g.beginPath();
      g.arc(330, 100, 34, 0, Math.PI * 2);
      g.fill();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const art = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
      art.userData.noReal = true;
      add(art, new THREE.PlaneGeometry(3.6, 2.2).rotateY(-Math.PI / 2).translate(GR.x1 - 0.17 - CX, F0 + 5.6, 591.7 - CZ));
    }
    fur(301.5, 304.5, F0, F0 + 0.42, 595.2, 596.1);
    fur(301.5, 304.5, F0 + 0.42, F0 + 0.9, 595.9, 596.1);
    fur(299.7, 300.6, F0, F0 + 0.42, 593.5, 594.4);
    fur(305.5, 306.1, F0, F0 + 0.42, 593.6, 594.2);
    box(M.dark, 300.0, 306.0, F0, F0 + 0.01, 592.9, 595.0);
    box(M.teak, 302.4, 303.6, F0, F0 + 0.4, 593.7, 594.3);
    add(M.brass, new THREE.TorusGeometry(2.4, 0.04, 6, 40).rotateX(Math.PI / 2).translate(303 - CX, U_TOP - 2.6, 594.3 - CZ));
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      add(M.lantern, new THREE.SphereGeometry(0.09, 8, 6).translate(303 + Math.cos(a) * 2.4 - CX, U_TOP - 2.72, 594.3 + Math.sin(a) * 2.4 - CZ));
    }
    // the den in the east wing (the media wall, its sofa)
    box(M.room, GR.x1 + 0.6, HS.x1 - 0.3, F0, G_TOP, 595.8, 596);
    box(M.room, GR.x1 + 0.6, HS.x1 - 0.3, G_TOP - 0.06, G_TOP - 0.02, HS.z0 + 0.2, 595.8);
    box(M.dark, 316, 326, F0 + 0.9, F0 + 2.6, 595.7, 595.8);
    fur(316.5, 325.5, F0, F0 + 0.42, 591.6, 592.5);
    fur(316.5, 325.5, F0 + 0.42, F0 + 0.85, 591.3, 591.6);
    // upstairs west: a bedroom at the wing's end, the guest room (their beds' heads to the wall), the study
    box(M.room, UPW.x0 + 0.4, GR.x0 - 0.6, L1, U_TOP, 599.8, 600);
    box(M.room, UPW.x0 + 0.4, GR.x0 - 0.6, U_TOP - 0.06, U_TOP - 0.02, UPW.z0 + 0.2, 599.8);
    for (const x of [280, 287]) box(M.room, x, x + 0.15, L1, U_TOP, UPW.z0 + 0.2, 599.8);
    for (const x of [270, 281]) {
      fur(x, x + 2.2, L1, L1 + 0.55, 592.9, 594.6);
      wood(x - 0.2, x, L1, L1 + 1.2, 592.7, 594.8);
    }
    wood(289.6, 291.2, L1 + 0.72, L1 + 0.77, 588.6, 589.4);
    for (let k = 0; k < 6; k++) box(M.dark, 287.2, 287.5, L1 + 0.3 + k * 0.35, L1 + 0.33 + k * 0.35, 595.3, 596.8);
    // upstairs east: the master suite (its king bed, a freestanding tub by the glass, a chaise)
    box(M.room, GR.x1 + 0.6, UPE.x1 - 0.35, L1, U_TOP, 595, 595.2);
    box(M.room, GR.x1 + 0.6, UPE.x1 - 0.35, U_TOP - 0.06, U_TOP - 0.02, UPE.z0 + 0.2, 595);
    fur(319.6, 322.4, L1, L1 + 0.6, 592.4, 594.9);
    wood(319.2, 322.8, L1, L1 + 1.4, 594.85, 595);
    cyl(M.cushion, 329.5, L1, L1 + 0.6, 591.2, 0.85, 0.75, 24);
    fur(314.5, 315.3, L1, L1 + 0.45, 590.4, 592.2);
    // behind the street side's teak fins: the corridors upstairs
    box(M.room, UPW.x0 + 0.4, GR.x0, L1, U_TOP, 606.3, 606.5);
    box(M.room, GR.x1, UPE.x1 - 0.35, L1, U_TOP, 606.3, 606.5);
  }

  into = grounds;
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
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.1 }));
    plaque.position.set((G.x1 + GP.e1) / 2 - CX, CURB + 1.9, V.z1 + 0.372 - CZ);
    plaque.userData.noField = true;
    plaque.updateMatrix();
    plaque.matrixAutoUpdate = false;
    group.add(plaque);
  }
  const house = new THREE.Group();
  house.name = "keys:villa:house";
  group.add(house);
  const glowing = new Set<THREE.Material>([M.window, M.poolGlow, M.downlight, M.lantern, M.fire]);
  const flat = new Set<THREE.Material>([M.glass, M.rail, M.slabs, M.setts, M.lawn, M.deck, M.roofing, M.spill, M.blocker, M.coping]);
  for (const [parent, map] of [
    [group, grounds],
    [house, houseParts],
  ] as const)
    for (const [m, list] of map) {
      // (boxes, planes, circles, cylinders: all indexed, the same attributes)
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      const glowy = glowing.has(m);
      mesh.castShadow = !glowy && !flat.has(m);
      mesh.receiveShadow = !glowy && m !== M.blocker;
      // (the night's glow, the falling water are no wall; the glass, the rails, the furniture are)
      if (glowy || m === M.spill) mesh.userData.noField = true;
      // (the house is hidden by `visible` for its own rooms' view: never merged into a tile's batch, where hiding it would not reach)
      if (parent === house) mesh.userData.noThrift = true;
      if (m === M.glass || m === M.rail || m === M.window || m === M.poolGlow || m === M.spill) mesh.renderOrder = 2;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
    }
  // the water: the pool's (swum in: plan.ts villaPool), the fountain's, the reflecting pool's, the hot
  // tub's — no floor to the game's solid shape
  {
    // (its own water: the town's mirror-smooth one bloomed the moon's glint into a blaze over the
    // terrace; and seen low from the strait at night even this one's did, along the infinity edge:
    // rough enough that the glint spreads into a sheen)
    const water = new THREE.MeshStandardMaterial({ color: "#3fb4d0", roughness: 0.34, metalness: 0.02, normalMap: maps("Concrete034").normalMap, transparent: true, opacity: 0.82, envMapIntensity: 0.9 });
    water.normalScale.setScalar(0.15);
    const FW = V.fountain;
    const parts = [
      // (over the sea wall's top to its outer face: the pool's edge is the sea's)
      new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - (V.z0 - 0.3)).rotateX(-Math.PI / 2).translate((P.x0 + P.x1) / 2 - CX, P.surface, (P.z1 + V.z0 - 0.3) / 2 - CZ),
      new THREE.CircleGeometry(FW.r - 0.32, 40).rotateX(-Math.PI / 2).translate(FW.x - CX, CURB + 0.52, FW.z - CZ),
      new THREE.CircleGeometry(1.5, 32).rotateX(-Math.PI / 2).translate(FW.x - CX, CURB + 1.46, FW.z - CZ),
      new THREE.CircleGeometry(0.76, 24).rotateX(-Math.PI / 2).translate(FW.x - CX, CURB + 2.32, FW.z - CZ),
      new THREE.PlaneGeometry(22, 2.8).rotateX(-Math.PI / 2).translate(269 - CX, CURB + 0.3, 624 - CZ),
      new THREE.CircleGeometry(1.2, 28).rotateX(-Math.PI / 2).translate(318.5 - CX, ROOF + 0.62, 592 - CZ),
    ];
    const w = new THREE.Mesh(mergeGeometries(parts, false)!, water);
    w.userData.noField = true;
    w.renderOrder = 3;
    w.updateMatrix();
    w.matrixAutoUpdate = false;
    group.add(w);
  }
  // the palms, the hedges' bushes (planted in world coordinates: a group of their own at the origin)
  const green = new THREE.Group();
  green.position.set(-CX, 0, -CZ);
  plantTrees(green, trees);
  group.add(green);
  group.updateMatrixWorld(true);
  return { group, house, circles };
}
