import * as THREE from "three";
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
 * YOUR PENTHOUSE (src/gta/home.ts): the top floor of an apartment tower on Park Row, facing
 * Central Park — its glass over the park, the heart's towers and the bay beyond: the city itself,
 * rendered from up there (ctx.cityView, turned to the flat). One open floor: the private lift's doors (the way back down to the street), a
 * great room (the kitchen and its island, the dining table, the living room round the TV), a
 * hallway to the bathroom and the bedroom, glass on three sides.
 *
 * The furniture is yours: what you own (economy.ts, "home") stands where you put it (home.ts keeps
 * the layout), built from the realistic pieces (realfurn2.ts); the kitchen, the bathroom and the
 * hi-fi come with the flat. The TV shows the chain live, the hi-fi plays the game's radio while you
 * are home (gta/homeedit.ts), the light follows the day and the night outside.
 *
 * Local frame: metres, the lift's doors at z = 0 (the street side, +z), the flat toward −z.
 */

const X0 = -9,
  X1 = 9,
  Z0 = -14,
  Z1 = 0,
  H = 3.4;
/** The private lift's opening in the front wall. */
const DOOR = 1.3;

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

/** The walls a print or a sign can hang on: their inner faces (a line, the way the piece faces). */
const FACES: { x0: number; z0: number; x1: number; z1: number; rot: number }[] = [
  // the front wall, beside the lift (the great room, the hallway)
  { x0: -8.1, z0: -0.1, x1: -1.7, z1: -0.1, rot: Math.PI },
  { x0: 1.7, z0: -0.1, x1: 5.2, z1: -0.1, rot: Math.PI },
  // the TV wall (the living room's side) and its back (the bedroom's)
  { x0: 2.9, z0: -13.7, x1: 2.9, z1: -6.3, rot: -Math.PI / 2 },
  { x0: 3.1, z0: -13.7, x1: 3.1, z1: -6.3, rot: Math.PI / 2 },
  // the bedroom's wall with its door
  { x0: 4.9, z0: -6.1, x1: 8.8, z1: -6.1, rot: Math.PI },
];

// ---- the flat --------------------------------------------------------------------------------------

export function buildHome(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#9fb4c8");
  scene.environmentIntensity = 0.5;
  const hemi = scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
  const shell = new THREE.Group();
  scene.add(shell);

  const floorMat = groundMat({ set: "WoodFloor051", tint: "#d8b48c", tile: 1, rough: 0.5, normal: 0.5, anti: 0.15, patches: 0 });
  const wallMat = groundMat({ set: "Plaster001", tint: "#eeebe4", tile: 3, rough: 0.9, normal: 0.12, anti: 0.1, patches: 0 });
  const panelMat = groundMat({ set: "Wood049", tint: "#5a3e2c", tile: 1.1, rough: 0.6, normal: 0.6, anti: 0.15, patches: 0 });
  const tileMat = groundMat({ set: "Tiles074", tint: "#e9e8e4", tile: 1.2, rough: 0.3, normal: 0.4, anti: 0.2, patches: 0 });
  const bathWall = groundMat({ set: "Marble021", tint: "#e8e4de", tile: 1.6, rough: 0.25, normal: 0.3, anti: 0.2, patches: 0 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: "#f3f1ec", roughness: 0.95 });

  // the floor (oak boards; the bathroom's tiles) and the ceiling
  const fl = mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), floorMat, 0, 0, (Z0 + Z1) / 2);
  fl.rotation.x = -Math.PI / 2;
  fl.receiveShadow = true;
  const bathFl = mesh(new THREE.PlaneGeometry(3.5, 5.8), tileMat, 7.2, 0.004, -3);
  bathFl.rotation.x = -Math.PI / 2;
  const ceil = mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), ceilMat, 0, H, (Z0 + Z1) / 2);
  ceil.rotation.x = Math.PI / 2;
  shell.add(fl, bathFl, ceil);

  const walls: Rect[] = [];
  /** A wall from (x0, z0) to (x1, z1) (one of them equal), `m` both sides unless `m2`. */
  const wall = (x0: number, z0: number, x1: number, z1: number, m: THREE.Material, t = 0.2) => {
    const w = Math.max(Math.abs(x1 - x0), t),
      d = Math.max(Math.abs(z1 - z0), t);
    box(shell, w, H, d, m, (x0 + x1) / 2, 0, (z0 + z1) / 2);
    walls.push([Math.min(x0, x1) - (x0 === x1 ? t / 2 : 0), Math.min(z0, z1) - (z0 === z1 ? t / 2 : 0), Math.max(x0, x1) + (x0 === x1 ? t / 2 : 0), Math.max(z0, z1) + (z0 === z1 ? t / 2 : 0)]);
  };
  // the front wall, both sides of the lift; the kitchen's (west) and the bathroom's (east) solid ends
  wall(X0, 0, -DOOR, 0, wallMat);
  wall(DOOR, 0, X1, 0, wallMat);
  wall(X0, -7, X0, 0, wallMat);
  wall(X1, -6, X1, 0, bathWall);
  // the TV wall between the living room and the bedroom: walnut panels on the living side
  wall(3, Z0, 3, -6, wallMat);
  const panel = mesh(new THREE.BoxGeometry(0.03, H - 0.02, 7.6), panelMat, 2.885, H / 2, -10);
  shell.add(panel);
  // the bedroom's wall and its door; the bathroom's and its door
  wall(3, -6, 3.5, -6, wallMat);
  wall(4.7, -6, X1, -6, wallMat);
  wall(5.4, -6, 5.4, -4.4, bathWall);
  wall(5.4, -3.2, 5.4, 0, bathWall);
  // lintels over the two doors
  for (const [x, z, w, d] of [
    [4.1, -6, 1.2, 0.2],
    [5.4, -3.8, 0.2, 1.2],
  ])
    box(shell, w, H - 2.25, d, wallMat, x, 2.25, z);

  // ---- glass on three sides: the city is the scene's background (its panorama, from up here) ----
  const glassMat = new THREE.MeshPhysicalMaterial({ color: "#dfeaf2", roughness: 0.04, metalness: 0, transparent: true, opacity: 0.07, depthWrite: false, envMapIntensity: 1.4 });
  glassMat.userData.noReal = true;
  const frameMat = new THREE.MeshStandardMaterial({ color: "#1b1d22", roughness: 0.45, metalness: 0.6 });
  frameMat.userData.noReal = true;
  /** A run of glass from (x0, z0) to (x1, z1): mullions every ~1.5 m, a sill and a head. */
  const glass = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0),
      alongX = z0 === z1;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, H), glassMat);
    pane.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2);
    if (!alongX) pane.rotation.y = Math.PI / 2;
    shell.add(pane);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      box(shell, alongX ? 0.06 : 0.12, H, alongX ? 0.12 : 0.06, frameMat, x0 + (x1 - x0) * f, 0, z0 + (z1 - z0) * f);
    }
    box(shell, alongX ? len : 0.16, 0.08, alongX ? 0.16 : len, frameMat, (x0 + x1) / 2, 0, (z0 + z1) / 2);
    box(shell, alongX ? len : 0.16, 0.14, alongX ? 0.16 : len, frameMat, (x0 + x1) / 2, H - 0.14, (z0 + z1) / 2);
    walls.push([Math.min(x0, x1) - 0.1, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, Math.max(z0, z1) + 0.1]);
  };
  glass(X0, Z0, X1, Z0);
  glass(X0, Z0, X0, -7);
  glass(X1, Z0, X1, -6);

  // ---- the private lift: its car behind the opening, doors slid open ----------------------------
  const lift = new THREE.Group();
  const liftWall = new THREE.MeshStandardMaterial({ color: "#6d7078", roughness: 0.5, metalness: 0.7 });
  liftWall.userData.noReal = true;
  box(lift, 2.4, 0.02, 1.8, mat.black, 0, 0, 1.0);
  box(lift, 2.4, 0.02, 1.8, liftWall, 0, 2.6, 1.0);
  box(lift, 0.05, 2.6, 1.8, liftWall, -1.2, 0, 1.0);
  box(lift, 0.05, 2.6, 1.8, liftWall, 1.2, 0, 1.0);
  box(lift, 2.4, 2.6, 0.05, liftWall, 0, 0, 1.9);
  for (const s of [-1, 1]) box(lift, 0.66, 2.3, 0.04, mat.steel, s * 1.0, 0, 0.12);
  box(lift, DOOR * 2 + 0.2, H - 2.3, 0.24, wallMat, 0, 2.3, 0);
  const plate = textPlane("PH · 家", { h: 0.16, color: "#f4b728", bg: "#141418" });
  plate.position.set(1.65, 1.5, -0.105);
  plate.rotation.y = Math.PI;
  lift.add(plate);
  scene.add(lift);

  // ---- what comes with the flat: the kitchen, the island, the bathroom, the hi-fi ---------------
  const fixed: Rect[] = [];
  const fit = (o: THREE.Object3D, x: number, z: number, r: number, w: number, d: number, y = 0) => {
    shell.add(at(o, x, y, z, r));
    const side = Math.abs(Math.sin(r)) > 0.7;
    const hw = (side ? d : w) / 2,
      hd = (side ? w : d) / 2;
    fixed.push([x - hw, z - hd, x + hw, z + hd]);
  };
  fit(kitchenReal(4.2, "#24302e", "#ffffff"), -8.56, -3.0, Math.PI / 2, 4.2, 0.67);
  fit(fridgeReal(), -8.56, -5.6, Math.PI / 2, 0.75, 0.67);
  // the island: walnut under a marble slab, three stools
  const island = new THREE.Group();
  island.add(mesh(new THREE.BoxGeometry(0.9, 0.86, 2.3), mat.walnut(), 0, 0.45, 0));
  island.add(mesh(new THREE.BoxGeometry(1.04, 0.05, 2.5), mat.marble(), 0, 0.905, 0));
  island.add(mesh(new THREE.BoxGeometry(0.86, 0.04, 2.26), mat.black, 0, 0.02, 0));
  fit(island, -6.3, -3.0, 0, 1.04, 2.5);
  for (const z of [-3.8, -3.0, -2.2]) shell.add(at(stoolReal("#2a2a30"), -5.45, 0, z));
  fixed.push([-5.75, -4.1, -5.15, -1.9]);
  for (const z of [-3.8, -3.0, -2.2]) shell.add(at(pendantReal(1.1, "#26262c"), -6.3, H - 1.1, z));
  // a pendant over where the dining table goes
  shell.add(at(pendantReal(1.3, "#c9a227"), -5.6, H - 1.3, -10.4));
  // the bathroom
  fit(bathtubReal(), 8.47, -4.6, 0, 0.75, 1.66);
  fit(vanityReal("#f2efe8"), 7.1, -0.35, Math.PI, 1, 0.5);
  fit(toiletReal(), 6.1, -5.55, 0, 0.45, 0.7);
  // the hi-fi on a walnut credenza against the front wall: a turntable, two speakers, ZSTREET FM lit
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
  fit(hifi, -3.2, -0.36, Math.PI, 2.1, 0.46);

  // the bedroom's curtains, drawn to the glass's ends
  for (const [x, z, r] of [
    [8.75, -13.6, -Math.PI / 2],
    [8.75, -6.5, -Math.PI / 2],
  ] as const)
    shell.add(at(curtainReal("#d9d2c4", H - 0.1), x, 0, z, r));

  // ---- light: day through the glass, lamps at night ---------------------------------------------
  const sun = new THREE.DirectionalLight("#fff3e0", 1.8);
  sun.position.set(-4, 9, -22);
  sun.target.position.set(0, 0, -6);
  scene.add(sun, sun.target);
  const lamps: THREE.PointLight[] = [];
  const lamp = (x: number, y: number, z: number, color: string, k: number, dist = 9) => {
    const l = new THREE.PointLight(color, k, dist, 1.6);
    l.position.set(x, y, z);
    scene.add(l);
    lamps.push(l);
    return l;
  };
  lamp(-6.3, 2.4, -3.0, "#ffe3c0", 7);
  lamp(-5.6, 2.0, -10.4, "#ffd6a0", 6.5);
  lamp(0.6, 2.6, -10, "#ffe7cc", 6);
  lamp(0, 2.6, -2.6, "#fff0dc", 4.5);
  lamp(6.3, 2.6, -10, "#ffdcb0", 5.5);
  lamp(7.2, 2.6, -3, "#fff4e6", 5);
  // recessed downlights and the cove along the glass (lit at night)
  const dl = glowMat("#fff3df", 1.6);
  for (const [x, z] of [
    [-6.3, -1.4],
    [-1.6, -2.6],
    [1.6, -2.6],
    [-1.2, -8],
    [2, -8],
    [-1.2, -12],
    [2, -12],
    [-7.5, -8.5],
    [-3.6, -8.5],
    [5, -9],
    [7.5, -12],
    [4.2, -3],
    [7.2, -2.2],
  ])
    shell.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), dl), x, H - 0.005, z).rotateX(Math.PI / 2));
  const cove = glowMat("#ffcf8a", 1.2);
  const coveMeshes = [mesh(new THREE.BoxGeometry(X1 - X0 - 0.4, 0.02, 0.05), cove, 0, H - 0.12, Z0 + 0.3)];
  for (const o of coveMeshes) shell.add(o);
  const tvGlow = new THREE.PointLight("#7fb4ff", 0, 4.5, 1.8);
  scene.add(tvGlow);

  // ---- your furniture ---------------------------------------------------------------------------
  const furn = new THREE.Group();
  scene.add(furn);
  const built = new Map<string, THREE.Object3D>();
  const lights = new Map<string, THREE.PointLight>();
  const rects: Rect[] = [];
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
  const pose = (o: THREE.Object3D, id: string, x: number, z: number, rot: number) => {
    const s = SPECS[id];
    o.position.set(x, s.wall ? (s.hang ?? 1.6) : 0, z);
    o.rotation.y = rot;
  };
  const sync = () => {
    const want = new Map(Home.placed().filter((q) => SPECS[q.id]).map((q) => [q.id, q] as const));
    for (const o of [...furn.children]) if (!want.has(o.userData.home) && o.userData.home !== carrying?.id) furn.remove(o);
    for (const q of want.values()) {
      if (q.id === carrying?.id) continue;
      const o = object(q.id);
      pose(o, q.id, q.x, q.z, q.rot);
      if (o.parent !== furn) furn.add(o);
    }
    if (carrying) {
      const o = object(carrying.id);
      pose(o, carrying.id, carrying.x, carrying.z, carrying.rot);
      if (o.parent !== furn) furn.add(o);
    }
    // what stops you: the walls, what came with the flat, your furniture (not the rugs, not what hangs)
    rects.length = 0;
    rects.push(...walls, ...fixed);
    for (const q of want.values()) {
      const s = SPECS[q.id];
      if (s.walk || s.wall || q.id === carrying?.id) continue;
      const f = foot(s, q.x, q.z, q.rot);
      rects.push([f[0] + 0.05, f[1] + 0.05, f[2] - 0.05, f[3] - 0.05]);
    }
    tvOn = want.has("tv-wall") || carrying?.id === "tv-wall";
    refreshLights();
  };

  /** Can `id` stand at (x, z) turned `rot`? */
  const canPlace = (id: string, x: number, z: number, rot: number) => {
    const s = SPECS[id];
    if (!s) return false;
    const f = foot(s, x, z, rot);
    if (f[0] < X0 + 0.1 || f[2] > X1 - 0.1 || f[1] < Z0 + 0.1 || f[3] > Z1 - 0.1) return false;
    if (s.wall) {
      const w = snapWall(x, z);
      if (!w || Math.hypot(w.x - x, w.z - z) > 0.05) return false;
      // not over another hung piece, nor over something tall standing against that wall
      const reach = foot(s, x, z, rot, 0);
      const front: Rect = [reach[0] - 0.02, reach[1] - 0.02, reach[2] + 0.02, reach[3] + 0.02];
      const fx = Math.round(Math.sin(rot)),
        fz = Math.round(Math.cos(rot));
      const deep: Rect = [Math.min(front[0], front[0] + fx * 0.6), Math.min(front[1], front[1] + fz * 0.6), Math.max(front[2], front[2] + fx * 0.6), Math.max(front[3], front[3] + fz * 0.6)];
      for (const q of Home.placed()) {
        if (q.id === id) continue;
        const o = SPECS[q.id];
        if (!o) continue;
        if (o.wall && overlap(front, foot(o, q.x, q.z, q.rot))) return false;
        if (o.tall && overlap(deep, foot(o, q.x, q.z, q.rot))) return false;
      }
      return true;
    }
    const g: Rect = [f[0] + 0.03, f[1] + 0.03, f[2] - 0.03, f[3] - 0.03];
    for (const r of walls) if (overlap(g, r)) return false;
    if (s.walk) return true;
    for (const r of fixed) if (overlap(g, r)) return false;
    // the way in and out stays clear
    if (overlap(g, [-1.5, -2.2, 1.5, 0])) return false;
    for (const q of Home.placed()) {
      if (q.id === id) continue;
      const o = SPECS[q.id];
      if (!o || o.walk || o.wall) continue;
      if (overlap(g, foot(o, q.x, q.z, q.rot))) return false;
    }
    return true;
  };
  /** The nearest wall face a hung piece can go on, from (x, z), within 2.5 m. */
  const snapWall = (x: number, z: number) => {
    let best: { x: number; z: number; rot: number } | null = null,
      bd = 2.5;
    for (const f of FACES) {
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
        ghostPlate.position.set((f[0] + f[2]) / 2, 0.012, (f[1] + f[3]) / 2);
        (ghostPlate.material as THREE.MeshBasicMaterial).color.set(ok ? "#3ecf8e" : "#e8463a");
      } else ghostPlate.visible = false;
      if (id !== was || !id) sync();
      else if (carrying) pose(object(carrying.id), carrying.id, x, z, rot);
    },
    pieceAt(x, z, fx, fz) {
      // the placed piece whose footprint the point 0.3–2 m ahead of (x, z) falls in
      for (let k = 0.3; k <= 2; k += 0.15) {
        const px = x + fx * k,
          pz = z + fz * k;
        for (const q of Home.placed()) {
          const s = SPECS[q.id];
          if (!s) continue;
          const f = foot(s, q.x, q.z, q.rot, s.wall ? 0.25 : 0.1);
          if (px > f[0] && px < f[2] && pz > f[1] && pz < f[3] && !(s.walk && k > 0.9)) return q.id;
        }
      }
      return null;
    },
  });
  // (the flat lives as long as the page: its listener too)
  Home.onChange(sync);

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
    for (const l of lamps) l.intensity = night ? (l.userData.k ??= l.intensity) : (l.userData.k ??= l.intensity) * 0.35;
    for (const [id, l] of lights) l.intensity = night && Home.isPlaced(id) ? (l.userData.k ??= l.intensity) : 0;
    tvGlow.intensity = tvOn ? (night ? 1.6 : 0.4) : 0;
    const tv = Home.placed().find((q) => q.id === "tv-wall");
    if (tv) tvGlow.position.set(tv.x + Math.sin(tv.rot) * 1.2, 1.3, tv.z + Math.cos(tv.rot) * 1.2);
  }
  const setTheme = (t: InteriorContext["theme"]) => {
    night = t === "night";
    hemi.intensity = night ? 0.28 : 1.15;
    hemi.color.set(night ? "#8a9ac8" : "#ffffff");
    sun.intensity = night ? 0 : 1.8;
    scene.environmentIntensity = night ? 0.22 : 0.5;
    (cove as THREE.MeshBasicMaterial).color.set(new THREE.Color("#ffcf8a").multiplyScalar(night ? 1.4 : 0.6));
    refreshLights();
    const site = Home.site;
    // the panorama from up there: the tower's top floor, turned so the glass looks where it does
    const v = site?.view ?? { yaw: 0, side: 0, back: 6 };
    const view = ctx.cityView("home", (site?.height ?? 30) + 1.6, v.back, v.side);
    if (view) {
      scene.background = view;
      scene.backgroundRotation.set(0, v.yaw, 0);
    }
  };

  let tvT = 0,
    t0 = performance.now();
  const ticker =
    "MISSIONS PAY ⓩ — BLOCK RUN · SHIELDED RIDE · PROOF BOARDS · SPEED TRAPS    ·    YOUR FLAT: PRESS B TO FURNISH IT    ·    THE STORE SELLS FURNITURE, PAINT, RIMS AND NEON    ·    SHIELD YOUR ZEC    ·    ";
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
    info: () => ({ eyebrow: "Your penthouse · the hi-fi", title: "ZSTREET FM", body: "<p>The radio plays while you're home, the same stations as in your car. <kbd>Q</kbd> or <kbd>.</kbd> the next station, <kbd>,</kbd> the one before (and off).</p>" }),
  });
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) {
      const p = picks.get(x);
      if (p) return p;
      if (x.name === "tv-screen") return { label: "ZSTREET TV · live", info: (): PickInfo => ({ eyebrow: "Your penthouse · the TV", title: "ZSTREET TV", stats: [["Block", height ? height.toLocaleString("en-US") : "—"], ["Mined by", pool ?? "—"]], body: "<p>The chain, live: every block as it lands, and the city's news on the ticker.</p>" }) };
      if (x.name.startsWith("print:")) {
        const id = Number(x.name.slice(6));
        return { label: `zkSNARK #${id} · framed`, info: (): PickInfo => ({ eyebrow: "Your penthouse · art", title: `zkSNARK #${id}`, mono: true, image: ZScan.zkSnarkImage(id), stats: [["zkSNARK", `#${id}`]] }) };
      }
    }
    return null;
  };

  sync();
  setTheme(ctx.theme);

  return {
    key: "home",
    title: "YOUR PENTHOUSE",
    scene,
    floors: [{ label: "PH", name: "Penthouse", y: 0, spawn: new THREE.Vector3(0, 0, -1.6), yaw: 0 }],
    colliders: () => rects,
    pickables: () => [hifi, furn],
    pick: (hit) => find(hit.object)?.info() ?? null,
    hover: (hit) => find(hit.object)?.label ?? null,
    update: (dt) => {
      const t = (performance.now() - t0) / 1000;
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
