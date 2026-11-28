import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, glowMat, makeScene, textPlane } from "../kit";
import { groundMat } from "../../scene/real/ground";
import { ZScan } from "../../data/zscan";
import { grandPianoReal } from "../realfurn";
import {
  armchairReal,
  bathtubReal,
  bedReal,
  bistroTableReal,
  bookshelfReal,
  chairReal,
  clubChairReal,
  coffeeTableReal,
  curtainReal,
  deskReal,
  diningTableReal,
  exerciseBikeReal,
  floorLampReal,
  fridgeReal,
  indoorTreeReal,
  kingBedReal,
  kitchenReal,
  nightstandReal,
  pendantReal,
  plantReal,
  rugReal,
  sideTableReal,
  sofaReal,
  stoolReal,
  toiletReal,
  treadmillReal,
  tvUnitReal,
  vanityReal,
  velvetChairReal,
  wardrobeReal,
} from "../realfurn2";
import { Home, type Placed } from "../../gta/home";
import type { Interior, InteriorContext, PickInfo, Rect } from "../types";

/**
 * YOUR VILLA (src/gta/home.ts): Shielded Point, your house on Orchard Keys' north point (its outside:
 * scene/keys/villa.ts) — two floors under a roof terrace, glass the whole length of its back on the
 * strait: the pool, the dock and your yacht, the Golden Gate and the city across the water, rendered
 * from here (ctx.cityView, the house itself hidden).
 *
 *  - Downstairs: through the teak front door, the hall under the gallery opens on the great room,
 *    two storeys high to its glass on the sea; the floating stair climbs its west wall to the gallery;
 *    the fire in the stone wall on its east side. The west wing: the kitchen on the street side (its
 *    run of cabinets, the island), the dining room and a sitting room on the glass. The east wing:
 *    the den (the garage behind its wall).
 *  - Upstairs (walked up the stair: no lift): the gallery over the hall, its glass rail over the
 *    great room; to the west the guest room and the study; to the east the master suite — the
 *    bedroom on the glass, the bath behind a glass screen (a tub by the window), the dressing room.
 *
 * The furniture is yours: what you own (economy.ts, "home") stands where you put it, on the floor you
 * put it on (home.ts keeps the layout), built from the realistic pieces (realfurn2.ts); the kitchen,
 * the bath, the guest room, the hi-fi and the fire come with the house. The TV shows the chain live,
 * the hi-fi plays the game's radio while you are home (gta/homeedit.ts), the light follows the day
 * and the night outside.
 *
 * One walkable space for the walker (no lift, no flight of the circulation's): the floor's walls are
 * one array, refilled with the level you are on (the stair's height tells which), and the ground is
 * the house's own (`groundAt`: the stair's ramp, else the level's floor).
 *
 * Local frame: metres, the front door at z = 0 (the street side, +z), the house toward −z (the sea).
 */

/** The ground floor: its west and east ends, the glass on the sea (z), the front (z 0). */
const X0 = -23,
  X1 = 23,
  ZS = -19.3;
/** The wings' ceilings downstairs (the upper floor slab's underside), the upper floor, the ceilings over it and over the great room. */
const H = 3.9,
  Y1 = 4.35,
  HH = 7.95;
/** The great room between x −GX and GX, two storeys high on the sea side of the gallery's edge (z GZ). */
const GX = 9,
  GZ = -7.3;
/** The front door's half width. */
const DOOR = 1.1;
/** The floating stair up the great room's west wall: its footprint, rising toward +z to the gallery. */
const ST = { x0: -8.9, x1: -7.3, z0: -14.6, z1: GZ };
/** The garage's wall behind the den (z), the master suite's dressing room wall (z), the bath's glass screen upstairs (x). */
const GARAGE = -9,
  DRESS = -9,
  BATH = 17.5;


// ---- the pieces ------------------------------------------------------------------------------------

interface Spec {
  /** Footprint (metres, before turning): across (x) and deep (z). */
  w: number;
  d: number;
  make: () => THREE.Object3D;
  /** Hung on a wall (its back at local z = 0), `hang` metres up. */
  wall?: boolean;
  hang?: number;
  /** Walked on (rugs): nothing stops you, things stand on it. */
  walk?: boolean;
  /** Tall (a wall piece can't hang over it). */
  tall?: boolean;
  /** A lamp: its light (colour, intensity, height). */
  light?: [string, number, number];
}

const mat = {
  black: new THREE.MeshStandardMaterial({ color: "#121216", roughness: 0.35, metalness: 0.4 }),
  steel: new THREE.MeshStandardMaterial({ color: "#c9ccd2", roughness: 0.25, metalness: 0.95 }),
  gold: new THREE.MeshStandardMaterial({ color: "#c9982a", roughness: 0.3, metalness: 0.9 }),
  walnut: () => groundMat({ set: "Wood049", tint: "#6a4a34", tile: 1.1, rough: 0.7, normal: 0.6, anti: 0.15, patches: 0 }),
  marble: () => groundMat({ set: "Marble012", tint: "#f2efe8", tile: 1.4, rough: 0.3, normal: 0.3, anti: 0.3, patches: 0 }),
};
for (const m of [mat.black, mat.steel, mat.gold]) m.userData.shared = m.userData.noReal = true;

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};
const at = (o: THREE.Object3D, x: number, y: number, z: number, r = 0) => {
  o.position.set(x, y, z);
  o.rotation.y = r;
  return o;
};

/** The TV's picture (one canvas, drawn while the flat is lit). */
const tvCanvas = document.createElement("canvas");
tvCanvas.width = 640;
tvCanvas.height = 360;
const tvTex = new THREE.CanvasTexture(tvCanvas);
tvTex.colorSpace = THREE.SRGBColorSpace;
const tvMat = new THREE.MeshBasicMaterial({ map: tvTex, toneMapped: false });
tvMat.userData.noReal = true;

function tvSet() {
  const g = new THREE.Group();
  g.add(tvUnitReal(24));
  g.add(mesh(new THREE.BoxGeometry(1.96, 1.14, 0.05), mat.black, 0, 1.3, -0.12));
  const scr = mesh(new THREE.PlaneGeometry(1.88, 1.06), tvMat, 0, 1.3, -0.094);
  scr.name = "tv-screen";
  g.add(scr);
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.07, 0.1), mat.black, 0, 0.5, 0.04));
  return g;
}

function diningSet(seats: 4 | 6) {
  const g = new THREE.Group();
  if (seats === 6) {
    g.add(diningTableReal(6));
    for (const x of [-0.6, 0, 0.6])
      for (const s of [-1, 1]) g.add(at(chairReal("#e6dccb", false), x, 0, s * 0.66, s > 0 ? Math.PI : 0));
  } else {
    g.add(bistroTableReal());
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.add(at(chairReal("#3a3d46", false), Math.sin(a) * 0.58, 0, Math.cos(a) * 0.58, a + Math.PI));
    }
  }
  return g;
}

function deskSet(gaming: boolean) {
  const g = new THREE.Group();
  g.add(at(deskReal(gaming ? 7 : 3), 0, 0, -0.32));
  g.add(at(chairReal(gaming ? "#1a1a22" : "#6a4a34", true), 0, 0, 0.42, Math.PI));
  if (gaming) {
    // two screens glowing, an RGB strip under the top, a tower lit up
    const cyan = glowMat("#3ef0ff", 1.4),
      pink = glowMat("#ff3ea5", 1.4);
    for (const [x, r, m] of [
      [-0.42, 0.25, cyan],
      [0.42, -0.25, pink],
    ] as const) {
      const s = new THREE.Group();
      s.add(mesh(new THREE.BoxGeometry(0.62, 0.38, 0.03), mat.black, 0, 0, 0));
      s.add(mesh(new THREE.PlaneGeometry(0.58, 0.34), m, 0, 0, 0.016));
      g.add(at(s, x, 1.12, -0.52, r));
    }
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.015, 0.015), glowMat("#b07bff", 2), 0, 0.68, 0.06));
    const tower = new THREE.Group();
    tower.add(mesh(new THREE.BoxGeometry(0.22, 0.48, 0.46), mat.black, 0, 0.24, 0));
    tower.add(mesh(new THREE.PlaneGeometry(0.4, 0.4), glowMat("#3ef0ff", 0.9), 0.111, 0.26, 0));
    tower.children[1].rotation.y = Math.PI / 2;
    g.add(at(tower, 0.62, 0, -0.3));
  }
  return g;
}

/** A zkSNARK's portrait, framed: gold, black or white. */
function print(id: number, frame: string) {
  const g = new THREE.Group();
  const fm = new THREE.MeshStandardMaterial({ color: frame, metalness: frame === "#c9982a" ? 0.9 : 0.1, roughness: 0.35 });
  g.add(mesh(new THREE.BoxGeometry(1.0, 1.0, 0.05), fm, 0, 0, 0.025));
  g.add(mesh(new THREE.PlaneGeometry(0.86, 0.86), new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.9 }), 0, 0, 0.051));
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  const t = loader.load(ZScan.zkSnarkImage(id));
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  const art = mesh(new THREE.PlaneGeometry(0.72, 0.72), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, roughness: 0.8 }), 0, 0, 0.053);
  art.name = `print:${id}`;
  g.add(art);
  return g;
}

function neon(text: string, color: string) {
  const g = new THREE.Group();
  const p = textPlane(text, { h: 0.5, color, glow: true, font: '800 96px "Archivo", "Helvetica Neue", sans-serif' });
  p.position.z = 0.05;
  g.add(p);
  // the clear backing and its stand-offs
  const w = (p.geometry as THREE.PlaneGeometry).parameters.width;
  g.add(mesh(new THREE.BoxGeometry(w * 0.9, 0.36, 0.012), new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.08, roughness: 0.1 }), 0, 0, 0.03));
  return g;
}

const SPECS: Record<string, Spec> = {
  "sofa-charcoal": { w: 2.92, d: 0.92, make: () => sofaReal("#3a3d46", 3, "#c9a227") },
  "sofa-emerald": { w: 2.92, d: 0.92, make: () => sofaReal("#1f5a46", 3, "#e8d9b0") },
  "sofa-sand": { w: 2.17, d: 0.92, make: () => sofaReal("#c9b48e", 2, "#8a5a3a") },
  "club-chair": { w: 1, d: 1, make: () => clubChairReal("#6a3a22") },
  "velvet-chair": { w: 0.6, d: 0.6, make: () => velvetChairReal("#7a2f4a") },
  "armchair-grey": { w: 0.92, d: 0.92, make: () => armchairReal("#8a8e96") },
  "coffee-table": { w: 1.17, d: 0.67, make: coffeeTableReal },
  "side-lamp": { w: 0.5, d: 0.5, make: () => sideTableReal(true), light: ["#ffc982", 2.2, 0.75] },
  "floor-lamp": { w: 0.4, d: 0.4, make: floorLampReal, light: ["#ffc982", 4, 1.45] },
  "rug-gold": { w: 3, d: 2.1, walk: true, make: () => rugReal(3, 2.1, "#3a3d46", "#c9a227") },
  "rug-terracotta": { w: 2.6, d: 1.8, walk: true, make: () => rugReal(2.6, 1.8, "#a8553a", "#efe6d6") },
  bookshelf: { w: 1.5, d: 0.42, tall: true, make: () => bookshelfReal(3, 18) },
  piano: { w: 1.5, d: 2.0, make: grandPianoReal },
  "dining-6": { w: 1.9, d: 1.9, make: () => diningSet(6) },
  "dining-4": { w: 1.6, d: 1.6, make: () => diningSet(4) },
  "bed-king": { w: 2.0, d: 2.25, make: () => kingBedReal("#2f3a52", "#c9a227") },
  "bed-double": { w: 1.67, d: 2.17, make: () => bedReal("#7a6a5a", "#efe6d6") },
  wardrobe: { w: 1.33, d: 0.58, tall: true, make: () => wardrobeReal("#d8d2c6") },
  nightstand: { w: 0.5, d: 0.4, make: nightstandReal },
  "tv-wall": { w: 2.0, d: 0.45, tall: true, make: tvSet },
  gaming: { w: 1.6, d: 1.5, tall: true, make: () => deskSet(true) },
  desk: { w: 1.6, d: 1.5, make: () => deskSet(false) },
  "print-1": { w: 1, d: 0.06, wall: true, hang: 1.65, make: () => print(1, "#c9982a") },
  "print-9593": { w: 1, d: 0.06, wall: true, hang: 1.65, make: () => print(9593, "#c9982a") },
  "print-1337": { w: 1, d: 0.06, wall: true, hang: 1.65, make: () => print(1337, "#141418") },
  "print-4071": { w: 1, d: 0.06, wall: true, hang: 1.65, make: () => print(4071, "#f4f1ea") },
  "neon-zec": { w: 1.2, d: 0.08, wall: true, hang: 2.15, make: () => neon("ZEC", "#f4b728") },
  "neon-shielded": { w: 2.6, d: 0.08, wall: true, hang: 2.15, make: () => neon("SHIELDED", "#3ef0ff") },
  monstera: { w: 0.5, d: 0.5, make: () => plantReal("monstera", 1) },
  ficus: { w: 0.5, d: 0.5, make: () => plantReal("ficus", 2) },
  cactus: { w: 0.45, d: 0.45, make: () => plantReal("cactus", 3) },
  "indoor-tree": { w: 1.16, d: 1.16, tall: true, make: () => indoorTreeReal(4) },
  treadmill: { w: 0.83, d: 2.0, make: treadmillReal },
  bike: { w: 0.45, d: 1.3, make: exerciseBikeReal },
};

/** A piece's footprint at (x, z) turned `rot` (quarter turns): [x0, z0, x1, z1]. */
function foot(s: Spec, x: number, z: number, rot: number, grow = 0): Rect {
  const side = Math.abs(Math.sin(rot)) > 0.7;
  const hw = (side ? s.d : s.w) / 2 + grow,
    hd = (side ? s.w : s.d) / 2 + grow;
  // (a wall piece stands out of the wall: its footprint is in front of (x, z))
  if (s.wall) {
    const fx = Math.round(Math.sin(rot)),
      fz = Math.round(Math.cos(rot));
    return [x - hw + (fx * s.d) / 2, z - hd + (fz * s.d) / 2, x + hw + (fx * s.d) / 2, z + hd + (fz * s.d) / 2];
  }
  return [x - hw, z - hd, x + hw, z + hd];
}
const overlap = (a: Rect, b: Rect) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];


/** The walls a print or a sign can hang on, per floor: their inner faces (a line, the way the piece faces). */
const FACES: { x0: number; z0: number; x1: number; z1: number; rot: number }[][] = [
  [
    // the hall's east wall, the sitting room's wall (the stair's other side), the fire's stone wall,
    // the den's wall on the garage (its side on the great room has the house's canvas)
    { x0: GX - 0.1, z0: -7.1, x1: GX - 0.1, z1: -0.3, rot: -Math.PI / 2 },
    { x0: -GX - 0.1, z0: -15.4, x1: -GX - 0.1, z1: -7.5, rot: -Math.PI / 2 },
    { x0: GX - 0.15, z0: -19, x1: GX - 0.15, z1: -12.4, rot: -Math.PI / 2 },
    { x0: 9.2, z0: GARAGE - 0.1, x1: 22.8, z1: GARAGE - 0.1, rot: Math.PI },
  ],
  [
    // the guest room's walls (over its bed, the house's canvas), the study's, the master bedroom's
    // (its wall on the great room, the dressing room's wall behind the bed), the dressing room's
    { x0: -22.8, z0: GZ - 0.1, x1: -20.3, z1: GZ - 0.1, rot: Math.PI },
    { x0: -18.7, z0: GZ - 0.1, x1: -16.2, z1: GZ - 0.1, rot: Math.PI },
    { x0: -16.1, z0: -19, x1: -16.1, z1: -7.6, rot: -Math.PI / 2 },
    { x0: -15.9, z0: -19, x1: -15.9, z1: -7.6, rot: Math.PI / 2 },
    { x0: -GX - 0.1, z0: -19, x1: -GX - 0.1, z1: -7.6, rot: -Math.PI / 2 },
    { x0: GX + 0.1, z0: -19, x1: GX + 0.1, z1: DRESS - 0.2, rot: Math.PI / 2 },
    { x0: 13.7, z0: DRESS - 0.1, x1: BATH - 0.2, z1: DRESS - 0.1, rot: Math.PI },
    { x0: 13.7, z0: DRESS + 0.1, x1: 22.8, z1: DRESS + 0.1, rot: 0 },
  ],
];

/**
 * A large canvas of the house's own (not one of yours): broad bands of a Vice City evening — coral,
 * ochre, teal and cream, laid on with a dry brush — on a thin oak frame. Drawn once per seed.
 */
function canvasArt(w: number, h: number, seed: number) {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = Math.round((768 * h) / w);
  const g = c.getContext("2d")!;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const P = ["#f2a07b", "#e8c27a", "#3f8f8a", "#efe4d0", "#c85a4e", "#24414e", "#f6d3b3"];
  g.fillStyle = "#efe6d6";
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 9; i++) {
    g.globalAlpha = 0.55 + rnd() * 0.4;
    g.fillStyle = P[Math.floor(rnd() * P.length)];
    const x = rnd() * c.width * 0.8,
      y = rnd() * c.height * 0.7,
      ww = c.width * (0.2 + rnd() * 0.5),
      hh = c.height * (0.15 + rnd() * 0.4);
    g.fillRect(x, y, ww, hh);
    // the dry brush's streaks along the band
    g.globalAlpha = 0.18;
    g.fillStyle = "#ffffff";
    for (let k = 0; k < 14; k++) g.fillRect(x, y + rnd() * hh, ww * (0.4 + rnd() * 0.6), 1 + rnd() * 2);
  }
  // a low sun
  g.globalAlpha = 0.9;
  g.fillStyle = "#f7c66b";
  g.beginPath();
  g.arc(c.width * (0.25 + rnd() * 0.5), c.height * (0.35 + rnd() * 0.2), c.height * 0.12, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const grp = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: "#8a6440", roughness: 0.5 });
  grp.add(mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.04), frame, 0, h / 2, 0.02));
  const art = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }), 0, h / 2, 0.042);
  grp.add(art);
  return grp;
}

// ---- the villa --------------------------------------------------------------------------------------

export function buildHome(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#9fb4c8");
  scene.environmentIntensity = 0.55;
  const hemi = scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
  const shell = new THREE.Group();
  scene.add(shell);

  // (honed, not polished: the sun through two storeys of glass made a blinding patch on a mirror finish)
  const stoneMat = groundMat({ set: "Marble012", tint: "#f1ece2", tile: 1.8, rough: 0.58, normal: 0.25, anti: 0.3, patches: 0 });
  const oakMat = groundMat({ set: "WoodFloor051", tint: "#cfa57a", tile: 1, rough: 0.74, normal: 0.5, anti: 0.15, patches: 0 });
  const wallMat = groundMat({ set: "Plaster001", tint: "#f2efe8", tile: 3, rough: 0.9, normal: 0.12, anti: 0.1, patches: 0 });
  const oakMat2 = groundMat({ set: "Wood049", tint: "#b08058", tile: 1.1, rough: 0.55, normal: 0.6, anti: 0.15, patches: 0 });
  // (the porch's limestone, inside too: large smooth panels)
  const travMat = groundMat({ set: "Marble021", tint: "#e4d3b8", tile: 3.4, rough: 0.6, normal: 0.12, anti: 0.3, patches: 0.05 });
  const bathWall = groundMat({ set: "Marble021", tint: "#e8e4de", tile: 1.6, rough: 0.25, normal: 0.3, anti: 0.2, patches: 0 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: "#f3f1ec", roughness: 0.95 });
  const teakMat = groundMat({ set: "Wood049", tint: "#8a5a3a", tile: 1.5, rough: 0.55, normal: 0.6, anti: 0.2, patches: 0 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: "#dfeaf2", roughness: 0.04, metalness: 0, transparent: true, opacity: 0.07, depthWrite: false, envMapIntensity: 1.4, side: THREE.DoubleSide });
  glassMat.userData.noReal = true;
  const railMat = new THREE.MeshPhysicalMaterial({ color: "#d6e6ec", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.2, side: THREE.DoubleSide });
  railMat.userData.noReal = true;
  const frameMat = new THREE.MeshStandardMaterial({ color: "#1b1d22", roughness: 0.45, metalness: 0.6 });
  frameMat.userData.noReal = true;
  const fireMat = glowMat("#ff8a2a", 1.6);

  // ---- the shell: merged per material (a few dozen draws for the whole house) ----------------------
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => (parts.get(m) ?? parts.set(m, []).get(m)!).push(g);
  /** A box between coordinates. */
  const slab = (m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => put(m, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  /** A level plane at y facing up (a floor) or down (a ceiling). */
  const flat = (m: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, down = false) =>
    put(m, new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(down ? Math.PI / 2 : -Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2));

  /** What stops you, per level: the walls and the glass, what comes with the house. */
  const walls: [Rect[], Rect[]] = [[], []];
  const fixed: [Rect[], Rect[]] = [[], []];
  /** A wall from (x0, z0) to (x1, z1) (one of them equal), from y0 up to y1, a wall on the levels `on`. */
  const wall = (x0: number, z0: number, x1: number, z1: number, m: THREE.Material, y0: number, y1: number, on: number[], t = 0.2) => {
    const w = Math.max(Math.abs(x1 - x0), t),
      d = Math.max(Math.abs(z1 - z0), t);
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    slab(m, cx - w / 2, cx + w / 2, y0, y1, cz - d / 2, cz + d / 2);
    for (const f of on) walls[f].push([cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2]);
  };
  /** A run of glass from (x0, z0) to (x1, z1), y0 to y1: mullions every ~2 m, a sill, a head, transoms at `cuts`. */
  const glass = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, on: number[], cuts: number[] = []) => {
    const len = Math.hypot(x1 - x0, z1 - z0),
      alongX = z0 === z1;
    const g = new THREE.PlaneGeometry(len, y1 - y0);
    if (!alongX) g.rotateY(Math.PI / 2);
    put(glassMat, g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
    const n = Math.max(1, Math.round(len / 2.1));
    const a = alongX ? 0.035 : 0.06,
      b = alongX ? 0.06 : 0.035;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n,
        z = z0 + ((z1 - z0) * i) / n;
      slab(frameMat, x - a, x + a, y0, y1, z - b, z + b);
    }
    const lx = alongX ? 0 : 0.08,
      lz = alongX ? 0.08 : 0;
    for (const [ya, yb] of [
      [y0, y0 + 0.06],
      [y1 - 0.1, y1],
      ...cuts.map((y) => [y - 0.045, y + 0.045]),
    ])
      slab(frameMat, Math.min(x0, x1) - lx, Math.max(x0, x1) + lx, ya, yb, Math.min(z0, z1) - lz, Math.max(z0, z1) + lz);
    for (const f of on) walls[f].push([Math.min(x0, x1) - 0.1, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, Math.max(z0, z1) + 0.1]);
  };
  /** A glass balustrade at floor height y along a line (a steel cap on it). */
  const rail = (x0: number, z0: number, x1: number, z1: number, y: number, on: number[]) => {
    const len = Math.hypot(x1 - x0, z1 - z0),
      alongX = z0 === z1;
    const g = new THREE.PlaneGeometry(len, 1.0);
    if (!alongX) g.rotateY(Math.PI / 2);
    put(railMat, g.translate((x0 + x1) / 2, y + 0.55, (z0 + z1) / 2));
    const lx = alongX ? 0 : 0.03,
      lz = alongX ? 0.03 : 0;
    slab(frameMat, Math.min(x0, x1) - lx, Math.max(x0, x1) + lx, y + 1.04, y + 1.09, Math.min(z0, z1) - lz, Math.max(z0, z1) + lz);
    slab(frameMat, Math.min(x0, x1) - lx, Math.max(x0, x1) + lx, y, y + 0.05, Math.min(z0, z1) - lz, Math.max(z0, z1) + lz);
    for (const f of on) walls[f].push([Math.min(x0, x1) - 0.08, Math.min(z0, z1) - 0.08, Math.max(x0, x1) + 0.08, Math.max(z0, z1) + 0.08]);
  };

  // -- the floors: stone downstairs (oak in the den), oak upstairs (marble in the bath); the ceilings --
  flat(stoneMat, X0, GX, ZS, 0, 0);
  flat(oakMat, GX, X1, ZS, GARAGE, 0);
  flat(ceilMat, X0, -GX, ZS, 0, H, true);
  flat(ceilMat, GX, X1, ZS, GARAGE, H, true);
  flat(ceilMat, -GX, GX, GZ, 0, H, true);
  flat(oakMat, X0, -GX, ZS, 0, Y1);
  flat(oakMat, GX, X1, ZS, 0, Y1);
  flat(oakMat, -GX, GX, GZ, 0, Y1);
  flat(groundMat({ set: "Marble021", tint: "#dcd6cc", tile: 1.6, rough: 0.55, normal: 0.3, anti: 0.2, patches: 0 }), BATH, X1, ZS, DRESS, Y1 + 0.004);
  flat(ceilMat, X0, X1, ZS, 0, HH, true);
  // the gallery's edge over the great room, the upper floor's edges at the glass between the storeys
  slab(wallMat, -GX, GX, H - 0.02, Y1, GZ, GZ + 0.12);
  slab(wallMat, X0, -GX, H, Y1, ZS - 0.1, ZS + 0.1);
  slab(wallMat, GX, X1, H, Y1, ZS - 0.1, ZS + 0.1);
  slab(wallMat, X0 - 0.1, X0 + 0.1, H, Y1, ZS, GARAGE);
  slab(wallMat, X1 - 0.1, X1 + 0.1, H, Y1, ZS, GARAGE);

  // -- downstairs --
  // the front: the kitchen's wall, the hall's limestone either side of the glass, the door
  wall(X0, 0, -GX, 0, wallMat, 0, H, [0]);
  wall(-GX, 0, -6.8, 0, travMat, 0, H, [0]);
  wall(6.8, 0, GX, 0, travMat, 0, H, [0]);
  glass(-6.8, 0, -DOOR - 0.07, 0, 0, H, [0]);
  glass(DOOR + 0.07, 0, 6.8, 0, 0, H, [0]);
  glass(-DOOR - 0.07, 0, DOOR + 0.07, 0, 3.75, H, []);
  const door = new THREE.Group();
  box(door, DOOR * 2, 3.7, 0.12, teakMat, 0, 0, 0.0);
  box(door, 0.06, 2.2, 0.08, mat.gold, -DOOR + 0.42, 0.7, -0.1);
  box(door, DOOR * 2 + 0.14, 0.05, 0.14, frameMat, 0, 3.7, 0);
  for (const s of [-1, 1]) box(door, 0.07, 3.75, 0.14, frameMat, s * (DOOR + 0.035), 0, 0);
  shell.add(door);
  walls[0].push([-DOOR - 0.1, -0.1, DOOR + 0.1, 0.12]);
  shell.add(at(rugReal(2.4, 1.2, "#cbb38c", "#7a5a3a"), 0, 0.002, -1.4));
  // the west end: glass on the side garden by the dining table, the kitchen's wall
  glass(X0, ZS, X0, GARAGE, 0, H, [0]);
  wall(X0, GARAGE, X0, 0, wallMat, 0, H, [0]);
  // the glass on the sea: the west wing's, the great room's two storeys, the den's; the den's end
  glass(X0, ZS, -GX, ZS, 0, H, [0]);
  glass(-GX, ZS, GX, ZS, 0, HH, [0, 1], [H + 0.2]);
  glass(GX, ZS, X1, ZS, 0, H, [0]);
  glass(X1, ZS, X1, GARAGE, 0, H, [0]);
  // the den's wall on the garage, its door to it (shut)
  wall(GX, GARAGE, X1, GARAGE, wallMat, 0, H, [0]);
  slab(teakMat, 20.6, 21.8, 0, 2.3, GARAGE - 0.14, GARAGE - 0.1);
  slab(mat.gold, 21.55, 21.6, 0.95, 1.15, GARAGE - 0.18, GARAGE - 0.14);
  // the great room's east wall: its stone face and the fire, the way into the den, the hall's side
  wall(GX, ZS, GX, -12, wallMat, 0, HH, [0, 1]);
  slab(travMat, GX - 0.16, GX - 0.1, 0, HH - 0.02, ZS + 0.25, -12.15);
  wall(GX, -12, GX, -9.4, wallMat, 2.6, HH, [1]);
  wall(GX, -9.4, GX, GZ, wallMat, 0, HH, [0, 1]);
  wall(GX, GZ, GX, 0, wallMat, 0, H, [0]);
  // the fire: a long low opening in the stone, its flames, the stone hearth before it
  slab(mat.black, GX - 0.32, GX - 0.16, 0.48, 1.12, -17.4, -13.8);
  put(fireMat, new THREE.PlaneGeometry(3.4, 0.3).rotateY(-Math.PI / 2).translate(GX - 0.33, 0.66, -15.6));
  for (let k = 0; k < 9; k++) put(fireMat, new THREE.ConeGeometry(0.07, 0.28 + (k % 3) * 0.08, 5).translate(GX - 0.25, 0.62 + (k % 3) * 0.04, -17.1 + k * 0.38));
  slab(travMat, GX - 0.95, GX - 0.16, 0, 0.36, -18.0, -13.2);
  fixed[0].push([GX - 0.95, -18.0, GX - 0.16, -13.2]);
  // the great room's west wall: the way into the sitting room by the glass, the stair's wall, the kitchen's opening
  wall(-GX, ZS, -GX, -15.6, wallMat, 2.8, HH, [1]);
  wall(-GX, -15.6, -GX, GZ, wallMat, 0, HH, [0, 1]);
  wall(-GX, GZ, -GX, -6.8, wallMat, 0, H, [0]);
  wall(-GX, -6.8, -GX, -0.6, wallMat, 2.8, H, []);
  wall(-GX, -0.6, -GX, 0, wallMat, 0, H, [0]);

  // (behind the stair, the wall in oak battens its full height)
  for (let z = -15.5; z < GZ - 0.05; z += 0.16) slab(oakMat2, -GX + 0.1, -GX + 0.17, 0, HH - 0.04, z, z + 0.07);
  // -- the stair: teak treads floating off the wall, a glass balustrade on the open side, a steel rail --
  {
    const n = 24;
    const run = (ST.z1 - ST.z0) / n;
    const led = glowMat("#ffdcae", 1.1);
    for (let i = 0; i < n; i++) {
      const y = (Y1 * (i + 1)) / n,
        z = ST.z0 + run * i;
      slab(oakMat2, ST.x0, ST.x1, y - 0.07, y, z, z + run + 0.03);
      // (a strip of light under each tread's nosing, by night)
      put(led, new THREE.PlaneGeometry(ST.x1 - ST.x0 - 0.1, 0.03).rotateX(Math.PI / 2).translate((ST.x0 + ST.x1) / 2, y - 0.071, z + run - 0.05));
    }
    // the balustrade: one pane per four treads, stepped, under a sloping rail
    for (let k = 0; k < n; k += 4) {
      const z0 = ST.z0 + run * k,
        z1 = ST.z0 + run * (k + 4);
      const y = (Y1 * (k + 1)) / n;
      put(railMat, new THREE.PlaneGeometry(z1 - z0 - 0.04, 1.0).rotateY(Math.PI / 2).translate(ST.x1 + 0.02, y + 0.55, (z0 + z1) / 2));
    }
    const d = new THREE.Vector3(0, Y1, ST.z1 - ST.z0);
    const hr = new THREE.CylinderGeometry(0.025, 0.025, d.length(), 8);
    hr.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
    put(frameMat, hr.translate(ST.x1 + 0.03, Y1 / 2 + 1.05, (ST.z0 + ST.z1) / 2));
    // what stops you round it downstairs: its open side (past its first steps), its head over the hall
    walls[0].push([ST.x1 - 0.02, ST.z0 + 0.5, ST.x1 + 0.12, ST.z1 + 0.1]);
    walls[0].push([ST.x0 - 0.2, ST.z1 - 0.12, ST.x1 + 0.12, ST.z1 + 0.1]);
  }

  // -- upstairs --
  // the front: the gallery's glass over the porte-cochère, the wings' walls with their long windows
  glass(-GX, 0, GX, 0, H, HH, [1]);
  for (const [x0, x1] of [
    [X0, -GX],
    [GX, X1],
  ]) {
    wall(x0, 0, x1, 0, wallMat, Y1, Y1 + 0.9, [1]);
    wall(x0, 0, x1, 0, wallMat, HH - 0.45, HH, []);
    glass(x0, 0, x1, 0, Y1 + 0.9, HH - 0.45, []);
  }
  // the glass on the sea, the ends
  glass(X0, ZS, -GX, ZS, Y1, HH, [1]);
  glass(GX, ZS, X1, ZS, Y1, HH, [1]);
  wall(X0, ZS, X0, 0, wallMat, Y1, HH, [1]);
  wall(X1, ZS, X1, 0, wallMat, Y1, HH, [1]);
  // the gallery's glass rail over the great room (open where the stair arrives)
  rail(ST.x1, GZ, GX, GZ, Y1, [1]);
  // the west wing: its corridor's wall (the guest room's door, the study's), the wall between them
  wall(X0, GZ, -20.2, GZ, wallMat, Y1, HH, [1]);
  wall(-20.2, GZ, -18.8, GZ, wallMat, Y1 + 2.3, HH, []);
  wall(-18.8, GZ, -13.2, GZ, wallMat, Y1, HH, [1]);
  wall(-13.2, GZ, -11.8, GZ, wallMat, Y1 + 2.3, HH, []);
  wall(-11.8, GZ, -GX, GZ, wallMat, Y1, HH, [1]);
  wall(-16, ZS, -16, GZ, wallMat, Y1, HH, [1]);
  // the master suite: in from the gallery through the dressing room, the bedroom on the glass, the
  // bath behind its glass screen
  wall(GX, GZ, GX, -6.8, wallMat, Y1, HH, [1]);
  wall(GX, -6.8, GX, -1, wallMat, Y1 + 2.4, HH, []);
  wall(GX, -1, GX, 0, wallMat, Y1, HH, [1]);
  wall(GX, DRESS, 11.5, DRESS, wallMat, Y1, HH, [1]);
  wall(11.5, DRESS, 13.5, DRESS, wallMat, Y1 + 2.4, HH, []);
  wall(13.5, DRESS, X1, DRESS, wallMat, Y1, HH, [1]);
  glass(BATH, ZS, BATH, -12.6, Y1, Y1 + 2.4, [1]);
  slab(bathWall, X1 - 0.12, X1 - 0.1, Y1, Y1 + 2.6, ZS + 0.1, DRESS - 0.1);
  slab(bathWall, BATH + 0.1, X1 - 0.1, Y1, Y1 + 2.6, DRESS - 0.12, DRESS - 0.1);
  // the walk-in shower in the bath's corner by the glass: glass on two sides, a rain head
  glass(20.8, -16.4, X1 - 0.1, -16.4, Y1, Y1 + 2.3, [1]);
  glass(20.8, ZS + 0.1, 20.8, -16.4, Y1, Y1 + 2.3, [1]);
  slab(mat.steel, 21.7, 22.2, Y1 + 2.45, Y1 + 2.48, -18.2, -17.7);

  // ---- what comes with the house: the kitchen, the island, the hi-fi, the guest room, the bath ----------
  const fit = (o: THREE.Object3D, x: number, z: number, r: number, w: number, d: number, f = 0) => {
    shell.add(at(o, x, f ? Y1 : 0, z, r));
    const side = Math.abs(Math.sin(r)) > 0.7;
    const hw = (side ? d : w) / 2,
      hd = (side ? w : d) / 2;
    fixed[f].push([x - hw, z - hd, x + hw, z + hd]);
  };
  fit(kitchenReal(6, "#24302e", "#ffffff"), -16.4, -0.44, Math.PI, 6, 0.67);
  fit(fridgeReal(), -19.9, -0.44, Math.PI, 0.75, 0.67);
  // the wine wall at the kitchen's end: a dark cabinet the wall's height, its shelves lit, the bottles
  {
    const x = X0 + 0.1;
    slab(mat.black, x, x + 0.45, 0, H - 0.3, -8.2, -1.6);
    const shelf = glowMat("#ffcf8a", 0.9);
    const bottle = new THREE.MeshStandardMaterial({ color: "#3a1420", roughness: 0.2, metalness: 0.1 });
    for (let y = 0.5; y < H - 0.6; y += 0.42) {
      put(shelf, new THREE.PlaneGeometry(6.4, 0.02).rotateY(Math.PI / 2).translate(x + 0.46, y, -4.9));
      for (let z = -7.95; z < -1.8; z += 0.16) put(bottle, new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6).rotateZ(Math.PI / 2).translate(x + 0.25, y + 0.1, z));
    }
    put(glassMat, new THREE.PlaneGeometry(6.6, H - 0.3).rotateY(Math.PI / 2).translate(x + 0.47, (H - 0.3) / 2, -4.9));
    fixed[0].push([x, -8.2, x + 0.5, -1.6]);
  }
  // the island: walnut under a marble slab, three stools
  const island = new THREE.Group();
  island.add(mesh(new THREE.BoxGeometry(0.9, 0.86, 2.6), mat.walnut(), 0, 0.45, 0));
  island.add(mesh(new THREE.BoxGeometry(1.04, 0.05, 2.8), mat.marble(), 0, 0.905, 0));
  island.add(mesh(new THREE.BoxGeometry(0.86, 0.04, 2.56), mat.black, 0, 0.02, 0));
  fit(island, -16.4, -3.6, Math.PI / 2, 1.04, 2.8);
  for (const x of [-17.4, -16.4, -15.4]) {
    shell.add(at(stoolReal("#2a2a30"), x, 0, -4.45));
    shell.add(at(pendantReal(1.1, "#26262c"), x, H - 1.1, -3.6));
  }
  fixed[0].push([-17.8, -4.8, -15.0, -4.1]);
  // a pendant over where the dining table goes, a rug under it
  shell.add(at(pendantReal(1.3, "#c9a227"), -19, H - 1.3, -15.2));
  shell.add(at(rugReal(4.2, 3.2, "#d9cdb8", "#8a6a4a"), -19, 0.002, -15.2));
  // the sitting room on the glass: two club chairs to the sea on a rug, a table between them, a tall plant
  shell.add(at(rugReal(3.4, 2.6, "#2f3a44", "#c9a227"), -12.6, 0.002, -16.4));
  for (const x of [-13.9, -11.3]) fit(clubChairReal("#6a3a22"), x, -16.6, Math.PI, 1, 1);
  fit(sideTableReal(false), -12.6, -16.8, 0, 0.5, 0.5);
  fit(plantReal("ficus", 31), -9.9, -18.5, 0, 0.6, 0.6);
  // the den's pool table (felt on a walnut frame, its six pockets), a plant in its corner
  {
    const t = new THREE.Group();
    t.add(mesh(new THREE.BoxGeometry(2.7, 0.16, 1.6), mat.walnut(), 0, 0.72, 0));
    t.add(mesh(new THREE.BoxGeometry(2.44, 0.02, 1.34), new THREE.MeshStandardMaterial({ color: "#1f5a46", roughness: 0.95 }), 0, 0.81, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.add(mesh(new THREE.BoxGeometry(0.16, 0.64, 0.16), mat.walnut(), sx * 1.15, 0.32, sz * 0.62));
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) t.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), mat.black, sx * 1.2, 0.81, sz * 0.69));
    fit(t, 12.9, -16.2, 0, 2.7, 1.6);
    fit(plantReal("ficus", 37), X1 - 0.6, -18.6, 0, 0.6, 0.6);
  }
  // the hi-fi on a walnut credenza against the stair's wall: a turntable, two speakers, ZSTREET FM lit
  const hifi = new THREE.Group();
  hifi.add(mesh(new THREE.BoxGeometry(2.1, 0.58, 0.46), mat.walnut(), 0, 0.33, 0));
  hifi.add(mesh(new THREE.BoxGeometry(2.0, 0.04, 0.4), mat.black, 0, 0.02, 0));
  hifi.add(mesh(new THREE.BoxGeometry(0.46, 0.1, 0.36), mat.black, -0.2, 0.67, 0));
  const platter = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.015, 32), new THREE.MeshStandardMaterial({ color: "#0c0c0e", roughness: 0.3 }), -0.25, 0.728, 0);
  hifi.add(platter);
  hifi.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.017, 16), new THREE.MeshStandardMaterial({ color: "#f4b728", roughness: 0.5 }), -0.25, 0.73, 0));
  for (const s of [-1, 1]) {
    const sp = new THREE.Group();
    sp.add(mesh(new THREE.BoxGeometry(0.24, 0.42, 0.24), mat.black, 0, 0.21, 0));
    for (const [y, r] of [
      [0.29, 0.075],
      [0.13, 0.05],
    ])
      sp.add(at(mesh(new THREE.CircleGeometry(r, 24), mat.steel, 0, y, 0.121), 0, 0, 0));
    hifi.add(at(sp, s * 0.82, 0.62, 0));
  }
  const fm = textPlane("ZSTREET FM", { h: 0.06, color: "#3ef0ff", bg: "#05080c", glow: true });
  fm.position.set(0.3, 0.68, 0.181);
  hifi.add(fm);
  fit(hifi, -GX - 0.33, -11.5, -Math.PI / 2, 2.1, 0.46);
  // upstairs: the guest room's bed (its head to the west wall), its nightstands; the study's desk by the
  // glass, its shelves and an armchair; the master bath (the tub at the window, the vanity, the WC)
  const up = (o: THREE.Object3D, x: number, z: number, r = 0) => shell.add(at(o, x, Y1 + 0.002, z, r));
  fit(bedReal("#7a6a5a", "#efe6d6"), X0 + 1.2, -13.5, Math.PI / 2, 1.67, 2.17, 1);
  for (const z of [-14.75, -12.25]) fit(nightstandReal(), X0 + 0.35, z, Math.PI / 2, 0.5, 0.4, 1);
  up(rugReal(3.2, 2.6, "#cbb38c", "#7a5a3a"), -20.4, -13.5, Math.PI / 2);
  fit(armchairReal("#8a8e96"), -18.0, -18.0, Math.PI, 0.92, 0.92, 1);
  fit(deskSet(false), -12.5, -17.4, Math.PI, 1.6, 1.5, 1);
  fit(bookshelfReal(5, 18), -15.68, -11.5, Math.PI / 2, 1.5, 0.42, 1);
  fit(armchairReal("#8a8e96"), -10.4, -9.0, Math.PI, 0.92, 0.92, 1);
  up(rugReal(2.8, 2.0, "#3a3d46", "#c9a227"), -12.5, -14.6);
  fit(bathtubReal(), 19.6, -17.9, Math.PI / 2, 0.75, 1.66, 1);
  fit(vanityReal("#f2efe8"), X1 - 0.35, -11.0, -Math.PI / 2, 1, 0.5, 1);
  fit(toiletReal(), X1 - 0.45, -14.2, -Math.PI / 2, 0.45, 0.7, 1);
  fit(armchairReal("#c9b48e"), 10.3, -17.6, Math.PI, 0.92, 0.92, 1);
  up(rugReal(4.0, 3.0, "#e8e0d2", "#8a7a66"), 15, -11.6);
  // the gallery: plants at its ends, a long cushioned bench along its glass over the porte-cochère
  for (const x of [-7.4, 7.6]) fit(plantReal("monstera", 11 + x), x, -0.8, 0, 0.5, 0.5, 1);
  {
    const b = new THREE.Group();
    b.add(mesh(new THREE.BoxGeometry(4.2, 0.36, 0.62), mat.walnut(), 0, 0.18, 0));
    b.add(mesh(new THREE.BoxGeometry(4.1, 0.1, 0.56), new THREE.MeshStandardMaterial({ color: "#e8e0d2", roughness: 0.95 }), 0, 0.41, 0));
    fit(b, -3.0, -0.45, 0, 4.2, 0.62, 1);
  }
  // curtains: the great room's sheers, the bedrooms'
  for (const x of [-GX + 0.55, GX - 0.55]) shell.add(at(curtainReal("#f1ebe0", HH - 0.12), x, 0, ZS + 0.25, Math.PI));
  for (const [x, f] of [
    [GX + 0.5, 1],
    [BATH - 0.5, 1],
    [X0 + 0.5, 1],
    [-16.5, 1],
  ] as const)
    shell.add(at(curtainReal("#d9d2c4", HH - Y1 - 0.1), x, f ? Y1 : 0, ZS + 0.25, Math.PI));
  // the house's own art, high on the great room's walls: over the way into the sitting room, over the fire
  shell.add(at(canvasArt(3.4, 2.4, 11), -GX + 0.12, 4.2, -17.4, Math.PI / 2));
  shell.add(at(canvasArt(3.6, 2.2, 23), GX - 0.17, 4.5, -15.6, -Math.PI / 2));
  // and in the den, the guest room (over the bed), the dining room's end
  shell.add(at(canvasArt(3.0, 1.7, 41), GX + 0.12, 1.1, -15.6, Math.PI / 2));
  shell.add(at(canvasArt(2.4, 1.3, 47), X0 + 0.12, Y1 + 1.35, -13.5, Math.PI / 2));
  // the ring of lights hung high in the great room
  {
    const ringY = HH - 2.6;
    put(mat.gold, new THREE.TorusGeometry(2.4, 0.04, 6, 48).rotateX(Math.PI / 2).translate(0, ringY, -13));
    const bulb = glowMat("#ffe2b8", 1.5);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      put(bulb, new THREE.SphereGeometry(0.09, 8, 6).translate(Math.cos(a) * 2.4, ringY - 0.12, -13 + Math.sin(a) * 2.4));
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      slab(mat.steel, Math.cos(a) * 2.4 - 0.006, Math.cos(a) * 2.4 + 0.006, ringY, HH, -13 + Math.sin(a) * 2.4 - 0.006, -13 + Math.sin(a) * 2.4 + 0.006);
    }
  }

  // ---- light: day through the glass, lamps at night -------------------------------------------------
  // (no shadows indoors: it reaches every floor, so kept soft — a strong one glared off them all)
  const sun = new THREE.DirectionalLight("#fff3e0", 1.25);
  sun.position.set(-6, 14, -30);
  sun.target.position.set(0, 0, -6);
  scene.add(sun, sun.target);
  const lamps: THREE.PointLight[] = [];
  const lamp = (x: number, y: number, z: number, color: string, k: number, dist = 10) => {
    const l = new THREE.PointLight(color, k, dist, 1.6);
    l.position.set(x, y, z);
    scene.add(l);
    lamps.push(l);
    return l;
  };
  lamp(-16.4, 2.6, -3.6, "#ffe3c0", 7);
  lamp(-16, 2.4, -15, "#ffd6a0", 7, 12);
  // (under the upper floor's level: lights pass through floors here, and from higher up it lit the bedrooms' floors)
  lamp(0, 4.0, -13, "#ffe7cc", 12, 14);
  lamp(0, 3.2, -3.6, "#fff0dc", 5, 10);
  lamp(16, 3.0, -14, "#ffe0bc", 6);
  lamp(14, Y1 + 2.7, -13, "#ffdcb0", 6, 12);
  lamp(-16, Y1 + 2.7, -13, "#ffe4c4", 6, 14);
  // recessed downlights (lit at night)
  const dl = glowMat("#fff3df", 1.6);
  const down = (x: number, y: number, z: number) => put(dl, new THREE.CircleGeometry(0.07, 14).rotateX(Math.PI / 2).translate(x, y - 0.005, z));
  for (const x of [-21, -17, -13]) for (const z of [-17, -12.5, -8, -3]) down(x, H, z);
  for (const x of [-6, -2, 2, 6]) for (const z of [-5.6, -2]) down(x, H, z);
  for (const x of [12, 16, 20]) for (const z of [-17, -12.5]) down(x, H, z);
  for (const x of [-21, -18, -13, -10, 12, 15, 20]) for (const z of [-16, -10.5, -3.5]) down(x, HH, z);
  for (const x of [-5, 0, 5]) down(x, HH, -3.6);
  for (const x of [-6, 6]) for (const z of [-17.5, -9]) down(x, HH, z);
  // a cove of light along the great room's glass, under each floor's ceiling
  const cove = glowMat("#ffcf8a", 1.2);
  put(cove, new THREE.BoxGeometry(GX * 2 - 0.4, 0.02, 0.05).translate(0, HH - 0.12, ZS + 0.3));
  put(cove, new THREE.BoxGeometry(X1 - X0 - 0.4, 0.02, 0.05).translate(0, H - 0.12, ZS + 0.3));
  const tvGlow = new THREE.PointLight("#7fb4ff", 0, 4.5, 1.8);
  scene.add(tvGlow);

  // the shell's meshes
  for (const [m, list] of parts) {
    const g = mergeGeometries(list, false);
    if (!g) continue;
    const o = new THREE.Mesh(g, m);
    o.receiveShadow = m !== glassMat && m !== railMat;
    if (m === glassMat || m === railMat) o.renderOrder = 2;
    shell.add(o);
  }

  // ---- your furniture ---------------------------------------------------------------------------
  const furn = new THREE.Group();
  scene.add(furn);
  const built = new Map<string, THREE.Object3D>();
  const lights = new Map<string, THREE.PointLight>();
  /** The level you are on (0 downstairs, 1 upstairs): what stops you, where a piece goes. */
  let level = 0;
  /** The walker's walls: one array, refilled with the level's (the walker keeps this very array). */
  const rects: Rect[] = [];
  /** Upstairs, the great room's void (past the gallery's rail) and the stair's well. */
  const VOID: Rect[] = [
    [ST.x1, ZS, GX, GZ],
    [-GX, ZS, ST.x1, ST.z0],
  ];
  /** The ways in and out, kept clear of furniture, per level. */
  const CLEAR: Rect[][] = [
    [
      [-1.6, -2.4, 1.6, 0],
      [-GX, -16.6, -7.0, -14.2],
      [-9.8, -19.2, -8.2, -15.6],
      [-9.8, -6.8, -8.2, -0.6],
      [8.2, -12, 9.8, -9.4],
    ],
    [
      [-GX, -7.8, -7.0, -5.4],
      [-20.3, -8.1, -18.7, -6.5],
      [-13.3, -8.1, -11.7, -6.5],
      [8.2, -6.8, 9.8, -1.0],
      [11.4, DRESS - 0.9, 13.6, DRESS + 0.9],
      [BATH - 0.8, -12.6, BATH + 0.8, DRESS],
    ],
  ];
  const lv = (q: Placed) => q.f ?? 0;
  const object = (id: string) => {
    let o = built.get(id);
    if (!o) {
      const s = SPECS[id];
      o = new THREE.Group();
      o.add(s.make());
      o.userData.home = id;
      if (s.light) {
        const l = new THREE.PointLight(s.light[0], s.light[1], 5, 1.7);
        l.position.y = s.light[2];
        o.add(l);
        lights.set(id, l);
      }
      built.set(id, o);
    }
    return o;
  };
  /** Where a piece stands (its own layout, or the ghost while you carry it). */
  let carrying: { id: string; x: number; z: number; rot: number; ok: boolean } | null = null;
  const ghostPlate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: "#3ecf8e", transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
  ghostPlate.rotation.x = -Math.PI / 2;
  ghostPlate.visible = false;
  ghostPlate.renderOrder = 2;
  scene.add(ghostPlate);
  const pose = (o: THREE.Object3D, id: string, x: number, z: number, rot: number, f: number) => {
    const s = SPECS[id];
    o.position.set(x, (f ? Y1 : 0) + (s.wall ? (s.hang ?? 1.6) : 0), z);
    o.rotation.y = rot;
  };
  /** The walker's walls for the level you are on: the house's, what came with it, your furniture there. */
  const refresh = () => {
    rects.length = 0;
    rects.push(...walls[level], ...fixed[level]);
    if (level === 1) rects.push(...VOID);
    for (const q of Home.placed()) {
      const s = SPECS[q.id];
      if (!s || s.walk || s.wall || q.id === carrying?.id || lv(q) !== level) continue;
      const f = foot(s, q.x, q.z, q.rot);
      rects.push([f[0] + 0.05, f[1] + 0.05, f[2] - 0.05, f[3] - 0.05]);
    }
  };
  const sync = () => {
    const want = new Map(Home.placed().filter((q) => SPECS[q.id]).map((q) => [q.id, q] as const));
    for (const o of [...furn.children]) if (!want.has(o.userData.home) && o.userData.home !== carrying?.id) furn.remove(o);
    for (const q of want.values()) {
      if (q.id === carrying?.id) continue;
      const o = object(q.id);
      pose(o, q.id, q.x, q.z, q.rot, lv(q));
      if (o.parent !== furn) furn.add(o);
    }
    if (carrying) {
      const o = object(carrying.id);
      pose(o, carrying.id, carrying.x, carrying.z, carrying.rot, level);
      if (o.parent !== furn) furn.add(o);
    }
    refresh();
    tvOn = want.has("tv-wall") || carrying?.id === "tv-wall";
    refreshLights();
  };

  /** Can `id` stand at (x, z) turned `rot`, on the level you are on? */
  const canPlace = (id: string, x: number, z: number, rot: number) => {
    const s = SPECS[id];
    if (!s) return false;
    const f = foot(s, x, z, rot);
    if (f[0] < X0 + 0.1 || f[2] > X1 - 0.1 || f[1] < ZS + 0.1 || f[3] > -0.1) return false;
    const L = level;
    const others = Home.placed().filter((q) => q.id !== id && lv(q) === L);
    if (s.wall) {
      const w = snapWall(x, z);
      if (!w || Math.hypot(w.x - x, w.z - z) > 0.05) return false;
      // not over another hung piece, nor over something tall standing against that wall
      const reach = foot(s, x, z, rot, 0);
      const front: Rect = [reach[0] - 0.02, reach[1] - 0.02, reach[2] + 0.02, reach[3] + 0.02];
      const fx = Math.round(Math.sin(rot)),
        fz = Math.round(Math.cos(rot));
      const deep: Rect = [Math.min(front[0], front[0] + fx * 0.6), Math.min(front[1], front[1] + fz * 0.6), Math.max(front[2], front[2] + fx * 0.6), Math.max(front[3], front[3] + fz * 0.6)];
      for (const q of others) {
        const o = SPECS[q.id];
        if (!o) continue;
        if (o.wall && overlap(front, foot(o, q.x, q.z, q.rot))) return false;
        if (o.tall && overlap(deep, foot(o, q.x, q.z, q.rot))) return false;
      }
      return true;
    }
    const g: Rect = [f[0] + 0.03, f[1] + 0.03, f[2] - 0.03, f[3] - 0.03];
    for (const r of walls[L]) if (overlap(g, r)) return false;
    if (L === 1) for (const r of VOID) if (overlap(g, r)) return false;
    // (nothing on the stair; downstairs, nothing in the garage behind the den's wall)
    if (overlap(g, [ST.x0, ST.z0 - 0.6, ST.x1, ST.z1 + 0.6])) return false;
    if (L === 0 && overlap(g, [GX, GARAGE, X1, 0])) return false;
    if (s.walk) return true;
    for (const r of fixed[L]) if (overlap(g, r)) return false;
    for (const r of CLEAR[L]) if (overlap(g, r)) return false;
    for (const q of others) {
      const o = SPECS[q.id];
      if (!o || o.walk || o.wall) continue;
      if (overlap(g, foot(o, q.x, q.z, q.rot))) return false;
    }
    return true;
  };
  /** The nearest wall face a hung piece can go on (on the level you are on), from (x, z), within 2.5 m. */
  const snapWall = (x: number, z: number) => {
    let best: { x: number; z: number; rot: number } | null = null,
      bd = 2.5;
    for (const f of FACES[level]) {
      const px = THREE.MathUtils.clamp(x, f.x0, f.x1),
        pz = THREE.MathUtils.clamp(z, f.z0, f.z1);
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) {
        bd = d;
        best = { x: +px.toFixed(3), z: +pz.toFixed(3), rot: f.rot };
      }
    }
    return best;
  };
  Home.setRoom({
    scene,
    floor: () => level,
    canPlace,
    snapWall,
    size: (id) => (SPECS[id] ? { w: SPECS[id].w, d: SPECS[id].d, wall: !!SPECS[id].wall, walk: !!SPECS[id].walk } : null),
    ghost(id, x = 0, z = 0, rot = 0, ok = true) {
      const was = carrying?.id;
      carrying = id ? { id, x, z, rot, ok } : null;
      if (id) {
        const s = SPECS[id];
        const f = foot(s, x, z, rot);
        ghostPlate.visible = !s.wall;
        ghostPlate.scale.set(f[2] - f[0] + 0.1, f[3] - f[1] + 0.1, 1);
        ghostPlate.position.set((f[0] + f[2]) / 2, (level ? Y1 : 0) + 0.012, (f[1] + f[3]) / 2);
        (ghostPlate.material as THREE.MeshBasicMaterial).color.set(ok ? "#3ecf8e" : "#e8463a");
      } else ghostPlate.visible = false;
      if (id !== was || !id) sync();
      else if (carrying) pose(object(carrying.id), carrying.id, x, z, rot, level);
    },
    pieceAt(x, z, fx, fz) {
      // the placed piece (on your level) whose footprint the point 0.3–2 m ahead of (x, z) falls in
      for (let k = 0.3; k <= 2; k += 0.15) {
        const px = x + fx * k,
          pz = z + fz * k;
        for (const q of Home.placed()) {
          const s = SPECS[q.id];
          if (!s || lv(q) !== level) continue;
          const f = foot(s, q.x, q.z, q.rot, s.wall ? 0.25 : 0.1);
          if (px > f[0] && px < f[2] && pz > f[1] && pz < f[3] && !(s.walk && k > 0.9)) return q.id;
        }
      }
      return null;
    },
  });
  // (the villa lives as long as the page: its listener too)
  Home.onChange(sync);
  /** Up or down: the walls you meet are the new level's. */
  const toLevel = (n: number) => {
    if (n === level) return;
    level = n;
    refresh();
  };


  // ---- life: the TV, day and night ---------------------------------------------------------------
  let tvOn = false;
  let night = ctx.theme === "night";
  let height = ctx.director.blockHeight ?? 0,
    pool: string | null = null,
    blockAt = ctx.director.lastBlockTime ? performance.now() - (Date.now() - ctx.director.lastBlockTime) : 0;
  ctx.onBlock((h, p) => {
    height = h;
    pool = p;
    blockAt = performance.now();
  });
  function refreshLights() {
    for (const l of lamps) l.intensity = night ? (l.userData.k ??= l.intensity) : (l.userData.k ??= l.intensity) * 0.55;
    for (const [id, l] of lights) l.intensity = night && Home.isPlaced(id) ? (l.userData.k ??= l.intensity) : 0;
    tvGlow.intensity = tvOn ? (night ? 1.6 : 0.4) : 0;
    const tv = Home.placed().find((q) => q.id === "tv-wall");
    if (tv) tvGlow.position.set(tv.x + Math.sin(tv.rot) * 1.2, (lv(tv) ? Y1 : 0) + 1.3, tv.z + Math.cos(tv.rot) * 1.2);
  }
  const setTheme = (t: InteriorContext["theme"]) => {
    night = t === "night";
    hemi.intensity = night ? 0.28 : 1.15;
    hemi.color.set(night ? "#8a9ac8" : "#ffffff");
    sun.intensity = night ? 0 : 1.25;
    scene.environmentIntensity = night ? 0.22 : 0.5;
    cove.color.set(new THREE.Color("#ffcf8a").multiplyScalar(night ? 1.4 : 0.6));
    fireMat.color.set(new THREE.Color("#ff8a2a").multiplyScalar(night ? 1.8 : 1.1));
    refreshLights();
    // the panorama from the great room by its glass (the villa hidden), turned so the glass looks where it does
    const v = Home.site?.view ?? { up: 1.6, back: 9, side: 0, yaw: 0 };
    const view = ctx.cityView("home", v.up, v.back, v.side);
    if (view) {
      scene.background = view;
      scene.backgroundRotation.set(0, v.yaw, 0);
    }
  };

  let tvT = 0,
    t0 = performance.now();
  const ticker =
    "MISSIONS PAY ⓩ — BLOCK RUN · SHIELDED RIDE · PROOF BOARDS · SPEED TRAPS    ·    YOUR VILLA: PRESS B TO FURNISH IT    ·    THE STORE SELLS FURNITURE, PAINT, RIMS AND NEON    ·    SHIELD YOUR ZEC    ·    ";
  const drawTv = (t: number) => {
    const g = tvCanvas.getContext("2d")!;
    const W = tvCanvas.width,
      Ht = tvCanvas.height;
    const bg = g.createLinearGradient(0, 0, W, Ht);
    bg.addColorStop(0, "#0b1526");
    bg.addColorStop(1, "#1a0f2a");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, Ht);
    // a slow sweep of light
    const sx = ((t * 60) % (W + 400)) - 200;
    const sw = g.createLinearGradient(sx - 120, 0, sx + 120, 0);
    sw.addColorStop(0, "rgba(255,255,255,0)");
    sw.addColorStop(0.5, "rgba(255,255,255,0.05)");
    sw.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sw;
    g.fillRect(0, 0, W, Ht);
    g.fillStyle = "#f4b728";
    g.font = '800 30px "Archivo", "Helvetica Neue", sans-serif';
    g.textBaseline = "top";
    g.fillText("ZSTREET TV", 28, 24);
    if (Math.floor(t * 1.4) % 2 === 0) {
      g.fillStyle = "#e8463a";
      g.beginPath();
      g.arc(W - 104, 40, 7, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#ffffff";
    g.font = '700 20px "JetBrains Mono", Menlo, monospace';
    g.fillText("LIVE", W - 88, 29);
    g.fillStyle = "rgba(255,255,255,0.6)";
    g.font = '600 18px "JetBrains Mono", Menlo, monospace';
    g.fillText("THE LATEST BLOCK", 28, 92);
    g.fillStyle = "#ffffff";
    g.font = '800 76px "Archivo", "Helvetica Neue", sans-serif';
    g.fillText(height ? height.toLocaleString("en-US") : "· · ·", 24, 116);
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.font = '600 20px "JetBrains Mono", Menlo, monospace';
    const ago = blockAt ? Math.round((performance.now() - blockAt) / 1000) : 0;
    g.fillText(height ? `${pool ? `mined by ${pool} · ` : ""}${ago}s ago` : "waiting for the next block", 28, 206);
    // the last blocks as bars (their pace, a heartbeat)
    for (let i = 0; i < 14; i++) {
      const v = 0.35 + 0.6 * Math.abs(Math.sin((height + i) * 12.9898) * 0.5 + Math.sin(t * 1.3 + i) * 0.15);
      g.fillStyle = i === 13 ? "#f4b728" : "rgba(62,240,255,0.55)";
      g.fillRect(W - 300 + i * 20, 230 - v * 120, 14, v * 120);
    }
    // the ticker
    g.fillStyle = "#f4b728";
    g.fillRect(0, Ht - 52, W, 52);
    g.fillStyle = "#141418";
    g.font = '800 24px "Archivo", "Helvetica Neue", sans-serif';
    g.textBaseline = "middle";
    const tw = g.measureText(ticker).width;
    const off = (t * 90) % tw;
    g.fillText(ticker, -off, Ht - 26);
    g.fillText(ticker, tw - off, Ht - 26);
    tvTex.needsUpdate = true;
  };

  // ---- picking: the TV, the hi-fi, the prints -----------------------------------------------------
  const picks = new Map<THREE.Object3D, { label: string; info: () => PickInfo }>();
  picks.set(hifi, {
    label: "ZSTREET FM · the hi-fi",
    info: () => ({ eyebrow: "Your villa · the hi-fi", title: "ZSTREET FM", body: "<p>The radio plays while you're home, the same stations as in your car. <kbd>Q</kbd> or <kbd>.</kbd> the next station, <kbd>,</kbd> the one before (and off).</p>" }),
  });
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) {
      const p = picks.get(x);
      if (p) return p;
      if (x.name === "tv-screen") return { label: "ZSTREET TV · live", info: (): PickInfo => ({ eyebrow: "Your villa · the TV", title: "ZSTREET TV", stats: [["Block", height ? height.toLocaleString("en-US") : "—"], ["Mined by", pool ?? "—"]], body: "<p>The chain, live: every block as it lands, and the city's news on the ticker.</p>" }) };
      if (x.name.startsWith("print:")) {
        const id = Number(x.name.slice(6));
        return { label: `zkSNARK #${id} · framed`, info: (): PickInfo => ({ eyebrow: "Your villa · art", title: `zkSNARK #${id}`, mono: true, image: ZScan.zkSnarkImage(id), stats: [["zkSNARK", `#${id}`]] }) };
      }
    }
    return null;
  };

  sync();
  setTheme(ctx.theme);

  return {
    key: "home",
    title: "YOUR VILLA",
    scene,
    floors: [
      { label: "G", name: "Shielded Point", y: 0, spawn: new THREE.Vector3(0, 0, -1.6), yaw: 0 },
      { label: "1", name: "The gallery", y: Y1, spawn: new THREE.Vector3(0, Y1, -3.6), yaw: 0 },
    ],
    // (one array for both levels: the walker keeps it, refilled as you go up and down — and so no lift)
    colliders: () => rects,
    lifts: () => [],
    setFloor: (n) => toLevel(n),
    floorNow: () => level,
    // the stair's ramp under its treads, else the level's floor
    groundAt: (_n, x, z) => {
      if (x > ST.x0 - 0.05 && x < ST.x1 + 0.05 && z > ST.z0 - 0.05 && z < ST.z1) return Y1 * THREE.MathUtils.clamp((z - ST.z0) / (ST.z1 - ST.z0), 0, 1);
      return level ? Y1 : 0;
    },
    pickables: () => [hifi, furn],
    pick: (hit) => find(hit.object)?.info() ?? null,
    hover: (hit) => find(hit.object)?.label ?? null,
    update: (dt, _t, camera) => {
      const t = (performance.now() - t0) / 1000;
      // up or down the stair: the level is the one your feet are nearer
      toLevel(camera.position.y - 1.6 > Y1 / 2 ? 1 : 0);
      platter.rotation.y += dt * 3.5;
      if (tvOn && (tvT -= dt) <= 0) {
        tvT = 0.1;
        drawTv(t);
        if (night) tvGlow.intensity = 1.3 + Math.sin(t * 7) * 0.25 + Math.sin(t * 2.3) * 0.2;
      }
    },
    setTheme,
  };
}

export type { Placed };
