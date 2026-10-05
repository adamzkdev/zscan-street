import * as THREE from "three";
import { Nav } from "../nav";
import { blobTexture, concreteTexture, grassTexture, neonTexture, pavingTexture, roadTexture, waterTexture } from "../textures";
import { MATERIALS } from "../voxel/mesher";
import { VOX, type Kind } from "../voxel/model";
import type { SignSpot } from "../voxel/parts";
import { mat } from "./kit";
import { AREAS, CITY, CURB, DISTRICTS, nz, planCity, polePositions, type BuildingJob, type DistrictKey } from "./plan";
import type { Geos } from "./worker";
import { CUT_VOX } from "./worker";
import { tunnels } from "./tunnel";

export { AREAS, CITY, CURB, DISTRICTS, CUT_VOX };
export type { DistrictKey };

export interface Lamp {
  pos: THREE.Vector3;
  color: string;
  /** Point-light strength; street lamps default to 14, rooms get much less. */
  intensity?: number;
}

/**
 * A building that can drop to its ground floor when it stands between the camera and the street
 * ("walls down", as in The Sims): the full model and a cut model share one footprint.
 */
export interface Occluder {
  full: THREE.Object3D;
  cut: THREE.Object3D;
  extras: THREE.Object3D;
  box: THREE.Box3;
  level: number;
  height: number;
  /** Walk-in buildings (the MEMPOOL shop) drop when the camera looks inside them. */
  open: boolean;
}

/** A walk-in building: where its inside camera stands and what it looks at. */
export interface Interior {
  name: string;
  camPos: THREE.Vector3;
  camLook: THREE.Vector3;
  occluder: Occluder;
}

/** The MEMPOOL shop, in world coordinates. */
export interface ShopSite extends Interior {
  district: DistrictKey;
  door: THREE.Vector3;
  inside: THREE.Vector3;
  counter: THREE.Vector3;
  keeper: THREE.Vector3;
  rack: THREE.Vector3;
  camPos: THREE.Vector3;
  camLook: THREE.Vector3;
  /** Block shelves, front run first: left end, right end, and the height between two boards. */
  shelves: { a: THREE.Vector3; b: THREE.Vector3; step: number }[];
  occluder: Occluder;
}

/** The mining hall inside the Proof Factory, in world coordinates. */
export interface FactorySite extends Interior {
  /** A loop through the aisles, for the miners. */
  patrol: THREE.Vector3[];
  /** Centre of the big screen on the back wall (it faces the street), and the hall's centre. */
  screen: THREE.Vector3;
  hall: THREE.Vector3;
  /** Where a new block box comes out of the press, and the end of the conveyor. */
  press: THREE.Vector3;
  beltEnd: THREE.Vector3;
}

/** A building you can click to open: the card shop, the bank. */
export interface Venue extends Interior {
  kind: "cards" | "bank" | "zsa" | "library" | "tower";
  door: THREE.Vector3;
  /** Where the clerk stands. */
  keeper: THREE.Vector3;
  /** Card walls (card shop): opposite corners of each wall, in world space. */
  walls: [THREE.Vector3, THREE.Vector3][];
}

/** A building's street face, for mounting screens and neon on it. */
export interface Facade {
  type: string;
  face: "s" | "n";
  x0: number;
  x1: number;
  /** World z of the front wall. */
  z: number;
  height: number;
  frontRow: boolean;
  extras: THREE.Object3D;
}

export interface City {
  group: THREE.Group;
  facades: Facade[];
  lamps: Lamp[];
  nav: Nav;
  canopies: THREE.Sphere[];
  occluders: Occluder[];
  shops: ShopSite[];
  venues: Venue[];
  factory: FactorySite | null;
  /** Loading docks where delivery trucks come out (x on the avenue). */
  docks: { kind: "proof" | "depot"; x: number }[];
  /** Doors pedestrians can come out of. */
  entries: Record<DistrictKey, THREE.Vector3[]>;
  update(t: number, dt: number): void;
}

const ROT = { s: 0, n: Math.PI };
const Y = new THREE.Vector3(0, 1, 0);
type Flicker = { mat: THREE.MeshBasicMaterial; seed: number; base: THREE.Color };
type Meta = {
  w: number;
  h: number;
  d: number;
  signs: SignSpot[];
  door: [number, number];
  body: [number, number, number, number];
  lights: [number, number, number, string][];
  walls?: [number, number, number, number][];
  points?: Record<string, [number, number, number]>;
};

function geometry(d: NonNullable<Geos[Kind]>) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(d.pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(d.nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(d.col, 3));
  g.setIndex(new THREE.BufferAttribute(d.idx, 1));
  g.computeBoundingSphere();
  return g;
}

function objectFrom(geos: Geos, own: boolean) {
  const o = new THREE.Group();
  for (const [kind, d] of Object.entries(geos) as [Kind, NonNullable<Geos[Kind]>][]) {
    const mesh = new THREE.Mesh(geometry(d), own ? MATERIALS[kind].clone() : MATERIALS[kind]);
    mesh.castShadow = kind !== "emit";
    mesh.receiveShadow = kind !== "emit";
    o.add(mesh);
  }
  return o;
}

/**
 * Build the city. The voxel work happens in a pool of workers; this assembles meshes, signs,
 * collisions, the ground and the atmosphere. `progress` reports 0..1.
 */
export async function buildCity(progress: (k: number) => void = () => {}): Promise<City> {
  const g = new THREE.Group();
  const lamps: Lamp[] = [];
  const nav = new Nav();
  const occluders: Occluder[] = [];
  const shops: ShopSite[] = [];
  const venues: Venue[] = [];
  let factory: FactorySite | null = null;
  const docks: City["docks"] = [];
  const canopies: THREE.Sphere[] = [];
  const flicker: Flicker[] = [];
  const animated: ((t: number, dt: number) => void)[] = [];
  const entries: Record<DistrictKey, THREE.Vector3[]> = { downtown: [] };
  const facades: Facade[] = [];
  ground(g, animated);
  tunnels(g);
  wires(g, animated);

  const { jobs, props, rects, circles } = planCity();
  for (const [x0, z0, x1, z1] of rects) nav.addRect(x0, z0, x1, z1);
  for (const [x, z, r] of circles) nav.addCircle(x, z, r);
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const n = Math.max(2, Math.min(5, (navigator.hardwareConcurrency || 4) - 1));
  const spawn = () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const workers = Array.from({ length: n }, spawn);
  const cost = (j: BuildingJob) => j.width * (j.type === "office" ? 3 : 1.5);
  const queues: BuildingJob[][] = workers.map(() => []);
  const load = workers.map(() => 0);
  for (const j of [...jobs].sort((a, b) => cost(b) - cost(a))) {
    const i = load.indexOf(Math.min(...load));
    queues[i].push(j);
    load[i] += cost(j);
  }
  let done = 0;
  const total = jobs.length + 1;

  const placeBuilding = (j: BuildingJob, r: { full: Geos; cut: Geos; meta: Meta }) => {
    const m = r.meta;
    const full = objectFrom(r.full, true);
    const cut = objectFrom(r.cut, false);
    const extras = new THREE.Group();
    const local = (vx: number, vy: number, vz: number) => new THREE.Vector3((vx - m.w / 2) * VOX, vy * VOX, (vz - m.d / 2) * VOX);
    const [bx0, , bx1, bz1] = m.body;
    const fc = local((bx0 + bx1) / 2, 0, bz1).applyAxisAngle(Y, ROT[j.face]);
    full.rotation.y = ROT[j.face];
    full.position.set(j.along - fc.x, CURB, j.front - fc.z);
    full.updateMatrixWorld(true);
    cut.position.copy(full.position);
    cut.rotation.copy(full.rotation);
    cut.visible = false;
    g.add(full, cut, extras);
    const toWorld = (vx: number, vy: number, vz: number) => full.localToWorld(local(vx, vy, vz));
    for (const w of m.walls ?? [m.body]) {
      const a = toWorld(w[0], 0, w[1]),
        b = toWorld(w[2], 0, w[3]);
      nav.addRect(a.x, a.z, b.x, b.z);
    }
    const box = new THREE.Box3().setFromObject(full);
    const occ: Occluder = { full, cut, extras, box, level: 1, height: box.max.y, open: ["mempool", "factory", "cardshop"].includes(j.type) };
    occluders.push(occ);
    const fa = toWorld(bx0, 0, bz1),
      fb = toWorld(bx1, 0, bz1);
    facades.push({ type: j.type, face: j.face, x0: Math.min(fa.x, fb.x), x1: Math.max(fa.x, fb.x), z: fa.z, height: (m.h - 26) * VOX, frontRow: j.frontRow, extras });
    for (const s of m.signs) {
      signPlane(s.y > CUT_VOX ? extras : g, s, toWorld, ROT[j.face], flicker);
      // its glow on the wet pavement below
      if (j.face === "s" && s.facing === "front" && s.y < 60) reflection(g, toWorld(s.x, 0, s.z).setY(CURB + 0.012), s.w * VOX, s.color);
      if (j.face === "s" && s.facing === "side") reflection(g, toWorld(s.x, 0, s.z + 3).setY(CURB + 0.012), 1.4, s.color);
    }
    for (const [lx, ly, lz, color] of m.lights) lamps.push({ pos: toWorld(lx, ly, lz), color, intensity: j.type === "mempool" ? 3 : 6 });
    const door = toWorld(m.door[0], 0, m.door[1]).setY(CURB);
    const venue = (j.opts as { venue?: Venue["kind"] }).venue;
    if (venue && m.points) {
      const w = (k: string) => toWorld(...m.points![k]);
      venues.push({
        kind: venue,
        name: venue === "cards" ? "zkCARDS" : venue === "bank" ? "the VIEW KEY BANK" : venue === "library" ? "the LIBRARY" : venue === "tower" ? "the ZK TOWER" : "the ZSA EXCHANGE",
        door,
        occluder: occ,
        keeper: w("keeper").setY(CURB + VOX),
        camPos: w("camPos"),
        camLook: w("camLook"),
        walls: m.points.backA
          ? [
              [w("backA"), w("backB")],
              [w("sideA"), w("sideB")],
            ]
          : [],
      });
    }
    if (j.type === "mempool" && m.points) {
      const p = (k: string, y?: number) => {
        const [x, py, z] = m.points![k];
        const v = toWorld(x, py, z);
        if (y !== undefined) v.y = y;
        return v;
      };
      const shelves = [0, 1, 2].map((i) => ({ a: p(`shelf${i}a`), b: p(`shelf${i}b`), step: 3 * VOX }));
      shops.push({ name: "the MEMPOOL shop", district: j.district, door, inside: p("inside", CURB + VOX), counter: p("counter", CURB + VOX), keeper: p("keeper", CURB + VOX), rack: p("rack"), camPos: p("camPos"), camLook: p("camLook"), shelves, occluder: occ });
    } else if ((j.type === "depot" || j.type === "factory") && m.points?.dock) {
      docks.push({ kind: j.type === "factory" ? "proof" : "depot", x: toWorld(...m.points.dock).x });
      const pt = m.points;
      if (j.type === "factory" && pt.patrol0) {
        const w = (k: string) => toWorld(...pt[k]);
        factory = {
          name: "the mining hall",
          occluder: occ,
          patrol: Object.keys(pt)
            .filter((k) => k.startsWith("patrol"))
            .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)))
            .map((k) => w(k).setY(CURB + VOX)),
          screen: w("screen"),
          hall: w("hall").setY(CURB),
          press: w("press"),
          beltEnd: w("beltEnd"),
          camPos: w("camPos"),
          camLook: w("camLook"),
        };
      }
    } else if (j.frontRow && j.face === "s") entries.downtown.push(door);
  };

  await Promise.all([
    ...workers.map(
      (w, i) =>
        new Promise<void>((resolve) => {
          w.onmessage = (e) => {
            for (const r of e.data.results) {
              placeBuilding(byId.get(r.id)!, r);
              done++;
            }
            progress(done / total);
            resolve();
          };
          w.postMessage({ kind: "buildings", jobs: queues[i] });
        }),
    ),
    new Promise<void>((resolve) => {
      const w = spawn();
      w.onmessage = (e) => {
        for (const c of e.data.chunks) g.add(objectFrom(c.geos, false));
        for (const [x, z, r] of e.data.circles) nav.addCircle(x, z, r);
        for (const [x, y, z, color] of e.data.lamps) lamps.push({ pos: new THREE.Vector3(x, y, z), color });
        for (const [x, y, z, r] of e.data.canopies) canopies.push(new THREE.Sphere(new THREE.Vector3(x, y, z), r));
        done++;
        progress(done / total);
        w.terminate();
        resolve();
      };
      w.postMessage({ kind: "props", props });
    }),
  ]);
  for (const w of workers) w.terminate();
  // the side streets bring people in too
  const [cw, ce] = CITY.cross;
  entries.downtown.push(new THREE.Vector3(cw + CITY.crossHalf + 1.2, CURB, -4), new THREE.Vector3(ce - CITY.crossHalf - 1.2, CURB, -4.4));
  // gate signs over the square and the park
  signPlane(g, freeSign("TRANSPARENT", "#ffb347"), () => new THREE.Vector3(0, CURB + 4.3, 11.95), 0, flicker, { w: 5.2, h: 0.62 });
  signPlane(g, freeSign("ORCHARD", "#5cff9a"), () => new THREE.Vector3(-27.35, CURB + 4.3, 4.2), Math.PI / 2, flicker, { w: 3.6, h: 0.6 });
  steam(g, animated, [
    [-11, 0.02, 0.2],
    [3, 0.02, -0.6],
    [12, 0.02, 0.4],
    [-36, 0.02, 0.5],
    [36, 0.02, -0.4],
    // the ramen kitchen's vent and the izakaya's
    [-15.8, CURB + 9, nz(-9)],
    [12.4, CURB + 6.4, nz(-8.6)],
  ]);

  return {
    group: g,
    facades,
    lamps,
    nav,
    canopies,
    occluders,
    shops,
    venues,
    factory,
    docks,
    entries,
    update(t: number, dt: number) {
      for (const f of flicker) {
        const k = Math.sin(t * 13 + f.seed * 7) * Math.sin(t * 3.1 + f.seed);
        f.mat.color.copy(f.base).multiplyScalar(k > 0.97 ? 0.35 : 1);
      }
      for (const a of animated) a(t, dt);
    },
  };
}

// ---- ground, streets, scenery planes --------------------------------------------------------------

function ground(g: THREE.Group, animated: ((t: number, dt: number) => void)[]) {
  const C = CITY;
  const W = C.maxX - C.minX;
  const depth = C.maxZ - C.minZ;
  const cz = (C.maxZ + C.minZ) / 2;
  // diorama base: layered stone like a cut-away model
  box(g, W + 0.6, 3.2, depth + 0.6, new THREE.MeshStandardMaterial({ map: strataTexture(W, depth), roughness: 0.95 }), 0, -3.2, cz);
  box(g, W + 1.0, 0.2, depth + 1.0, mat("#141219"), 0, -3.4, cz);
  const roadMat = (len: number, width: number, cross: number[]) => wet(new THREE.MeshStandardMaterial({ map: roadTexture(len, width, cross), roughness: 0.34, metalness: 0.22 }), () => roadTexture(len, width, cross, 2, true));
  const avW = C.road.z1 - C.road.z0;
  flat(g, W, avW, wet(new THREE.MeshStandardMaterial({ map: roadTexture(W, avW, [DISTRICTS[0].crossX - C.minX], 4), roughness: 0.34, metalness: 0.22 }), () => roadTexture(W, avW, [DISTRICTS[0].crossX - C.minX], 4, true)), 0, 0.01, (C.road.z0 + C.road.z1) / 2, 0);
  for (const x of C.cross)
    for (const [z0, z1] of [
      [C.minZ, C.road.z0],
      [C.road.z1, C.maxZ],
    ]) {
      const len = z1 - z0;
      flat(g, len, C.crossHalf * 2, roadMat(len, C.crossHalf * 2, [z0 < 0 ? len - 2.2 : 2.2]), x, 0.012, (z0 + z1) / 2, Math.PI / 2);
    }
  // puddles: glossy patches that catch the neon
  const puddle = new THREE.MeshStandardMaterial({ color: "#24222c", roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.9 });
  puddle.userData.night = true;
  for (let i = 0; i < 30; i++) {
    const r = (k: number) => Math.sin(i * 91.7 + k * 13.3) * 0.5 + 0.5;
    const onCross = i % 3 === 0;
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.35 + r(1) * 0.6, 16), puddle);
    p.rotation.x = -Math.PI / 2;
    p.scale.set(1.7, 1, 1);
    p.position.set(onCross ? C.cross[i % 2] + (r(2) - 0.5) * 2.5 : (r(3) - 0.5) * (W - 6), 0.016, onCross ? (r(4) - 0.5) * 50 : C.road.z0 + 0.6 + r(5) * (avW - 1.2));
    p.receiveShadow = true;
    g.add(p);
  }
  for (const [mx, mz] of [
    [-11, 0.2],
    [3, -0.6],
    [12, 0.4],
    [-36, 0.5],
    [36, -0.4],
    [24, -14],
    [-24, 16],
  ]) {
    const mh = flat(g, 0.84, 0.84, manholeMat(), mx, 0.02, mz, 0);
    mh.receiveShadow = true;
  }
  // raised blocks with paving, kerbs on the road edges
  const [cw, ce] = C.cross;
  const ch = C.crossHalf;
  const xs: [number, number][] = [
    [C.minX, cw - ch],
    [cw + ch, ce - ch],
    [ce + ch, C.maxX],
  ];
  const zs: [number, number][] = [
    [C.minZ, C.road.z0],
    [C.road.z1, C.maxZ],
  ];
  const curbM = mat("#6d6876");
  curbM.userData.dayColor = "#e9e7f2";
  xs.forEach(([x0, x1], i) =>
    zs.forEach(([z0, z1], j) => {
      const t = pavingTexture(11 + i * 2 + j, 4);
      t.repeat.set((x1 - x0) / 2, (z1 - z0) / 2);
      const pm = dayAlt(new THREE.MeshStandardMaterial({ map: t, roughness: 0.62, metalness: 0.05, color: j ? "#ffffff" : "#e8e4ee" }), () => {
        const d = pavingTexture(11 + i * 2 + j, 4, true);
        d.repeat.copy(t.repeat);
        return d;
      });
      box(g, x1 - x0, CURB, z1 - z0, pm, (x0 + x1) / 2, 0, (z0 + z1) / 2);
      box(g, x1 - x0, CURB + 0.03, 0.18, curbM, (x0 + x1) / 2, 0, j === 0 ? z1 - 0.09 : z0 + 0.09);
      if (i > 0) box(g, 0.18, CURB + 0.03, z1 - z0, curbM, x0 + 0.09, 0, (z0 + z1) / 2);
      if (i < 2) box(g, 0.18, CURB + 0.03, z1 - z0, curbM, x1 - 0.09, 0, (z0 + z1) / 2);
    }),
  );
  for (const z of [C.north.z1 - 0.8, C.south.z0 + 0.8]) for (const [x0, x1] of xs) box(g, x1 - x0 - 1, 0.02, 0.3, mat("#b8902a", 0.6), (x0 + x1) / 2, CURB, z);
  // plaza between the stop and the square
  const plazaT = pavingTexture(14, 3);
  plazaT.repeat.set(20, 2);
  box(g, 43.6, 0.15, 4, dayAlt(new THREE.MeshStandardMaterial({ map: plazaT, color: "#a9a2b3", roughness: 0.75 }), () => {
    const d = pavingTexture(14, 3, true);
    d.repeat.set(20, 2);
    return d;
  }), 0, CURB, 9);
  // Transparent square: paving, the fountain's water and jet
  const sq = pavingTexture(31, 2);
  sq.repeat.set(14, 7);
  box(g, 40, 0.06, 19, dayAlt(new THREE.MeshStandardMaterial({ map: sq, color: "#d8d2c8", roughness: 0.6 }), () => {
    const d = pavingTexture(31, 2, true);
    d.repeat.set(14, 7);
    return d;
  }), 0, CURB, 21.5);
  const waterMat = new THREE.MeshStandardMaterial({ map: waterTexture(), color: "#5aaac0", roughness: 0.04, metalness: 0.35, emissive: "#0a4a5a", emissiveIntensity: 0.9 });
  for (const [r, y] of [
    [3.35, 0.68],
    [1.5, 1.95],
  ]) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(r, 36), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, CURB + 0.06 + y, 19);
    g.add(water);
  }
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 1.2, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.2, 2.6), transparent: true, opacity: 0.55, toneMapped: false }));
  jet.position.set(0, CURB + 3.8, 19);
  g.add(jet);
  animated.push((t) => (jet.scale.y = 1 + Math.sin(t * 2.2) * 0.12));
  // Orchard: grass under the orchard and the park, a path, the pond
  const grass = grassTexture(4);
  grass.repeat.set(10, 6);
  flat(g, 22, 13, new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }), -38.5, CURB + 0.004, nz(-27.5), 0);
  const parkGrass = grassTexture(5);
  parkGrass.repeat.set(10, 10);
  flat(g, 20.5, 23, new THREE.MeshStandardMaterial({ map: parkGrass, roughness: 0.95 }), -38.6, CURB + 0.004, 19.5, 0);
  // the koi pond: a stone rim, dark water, lily pads; the koi themselves swim in decor.ts
  const rim = new THREE.Mesh(new THREE.RingGeometry(2.45, 2.75, 40), mat("#7a766e"));
  rim.rotation.x = -Math.PI / 2;
  rim.scale.set(1.75, 1.2, 1);
  rim.position.set(-37.5, CURB + 0.03, 21);
  g.add(rim);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(2.5, 40), new THREE.MeshStandardMaterial({ map: waterTexture(), color: "#4a8aa0", roughness: 0.04, metalness: 0.35, emissive: "#06303a", emissiveIntensity: 0.8 }));
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(1.75, 1.2, 1);
  pond.position.set(-37.5, CURB + 0.02, 21);
  g.add(pond);
  const pad = new THREE.MeshStandardMaterial({ color: "#3a7a3a", roughness: 0.6 });
  for (const [x, z] of [
    [-40, 20],
    [-39.4, 22.4],
    [-35, 19.6],
    [-34.6, 22],
    [-36.2, 23.2],
  ]) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.22, 10), pad);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, CURB + 0.04, z);
    g.add(p);
  }
  // Ironwood yard
  const yard = concreteTexture(17, "#2a2832");
  yard.repeat.set(8, 8);
  flat(g, 20.5, 23, new THREE.MeshStandardMaterial({ map: yard, roughness: 0.55, metalness: 0.12 }), 38.6, CURB + 0.004, 19.5, 0);
}

/** Power lines between the poles, and a string of paper lanterns along the downtown pavement. */
function wires(g: THREE.Group, animated: ((t: number, dt: number) => void)[]) {
  const wire = new THREE.LineBasicMaterial({ color: "#121117" });
  const sag = (a: THREE.Vector3, b: THREE.Vector3, drop: number, n = 16) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * drop, 0)));
    }
    return pts;
  };
  for (const run of polePositions())
    for (let i = 1; i < run.length; i++) {
      const a0 = new THREE.Vector3(run[i - 1].x, CURB + 7.6, run[i - 1].z),
        b0 = new THREE.Vector3(run[i].x, CURB + 7.6, run[i].z);
      for (const dx of [-0.95, -0.25, 0.4, 0.9])
        for (const dy of [0, -0.85]) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sag(a0.clone().add(new THREE.Vector3(dx, dy, 0)), b0.clone().add(new THREE.Vector3(dx, dy, 0)), 0.55)), wire));
    }
  // chōchin strings between the poles downtown, swaying a little
  const lanterns: { mesh: THREE.InstancedMesh; base: THREE.Vector3[] }[] = [];
  const geo = new THREE.BoxGeometry(0.2, 0.26, 0.2);
  const colors = [new THREE.Color(1.6, 0.42, 0.2), new THREE.Color(1.5, 1.25, 0.8), new THREE.Color(1.6, 0.42, 0.2)];
  for (const run of polePositions())
    for (let i = 1; i < run.length; i++) {
      if (run[i].x > 22 || run[i - 1].x < -22) continue;
      const a = new THREE.Vector3(run[i - 1].x, CURB + 4.6, run[i - 1].z - 0.1),
        b = new THREE.Vector3(run[i].x, CURB + 4.6, run[i].z - 0.1);
      const pts = sag(a, b, 0.6, 24);
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire));
      const inner = pts.slice(1, -1).filter((_, k) => k % 2 === 0);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), inner.length);
      inner.forEach((p, k) => {
        mesh.setMatrixAt(k, new THREE.Matrix4().setPosition(p.x, p.y - 0.2, p.z));
        mesh.setColorAt(k, colors[k % colors.length]);
      });
      g.add(mesh);
      lanterns.push({ mesh, base: inner });
    }
  const m = new THREE.Matrix4();
  animated.push((t) => {
    for (const l of lanterns) {
      l.base.forEach((p, k) => {
        const sway = Math.sin(t * 1.3 + k * 0.7 + p.x) * 0.04;
        m.makeRotationZ(sway * 2).setPosition(p.x + sway, p.y - 0.2, p.z);
        l.mesh.setMatrixAt(k, m);
      });
      l.mesh.instanceMatrix.needsUpdate = true;
    }
  });
}

/** Steam curling up from manholes and kitchen vents: soft sprites that rise, swell and fade. */
function steam(g: THREE.Group, animated: ((t: number, dt: number) => void)[], vents: [number, number, number][]) {
  const tex = blobTexture("rgba(220,215,235,0.55)", "rgba(220,215,235,0)");
  const per = 7;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(vents.length * per * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat2 = new THREE.PointsMaterial({ map: tex, size: 1.5, transparent: true, depthWrite: false, opacity: 0.28, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat2);
  pts.frustumCulled = false;
  g.add(pts);
  const age = Array.from({ length: vents.length * per }, (_, i) => (i % per) / per);
  animated.push((t, dt) => {
    for (let v = 0; v < vents.length; v++)
      for (let k = 0; k < per; k++) {
        const i = v * per + k;
        age[i] = (age[i] + dt * 0.22) % 1;
        const a = age[i];
        const [x, y, z] = vents[v];
        pos[i * 3] = x + Math.sin(t * 0.7 + i) * 0.25 * a + a * 0.4;
        pos[i * 3 + 1] = y + a * 2.6;
        pos[i * 3 + 2] = z + Math.cos(t * 0.5 + i) * 0.2 * a;
      }
    geo.attributes.position.needsUpdate = true;
  });
}

let reflTex: THREE.Texture | null = null;
/** A neon sign's smear of light on the wet ground: a soft streak in the sign's colour. */
function reflection(g: THREE.Group, at: THREE.Vector3, width: number, color: string) {
  if (!reflTex) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    const grd = ctx.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grd;
    for (let x = 0; x < 64; x += 2) ctx.fillRect(x, 0, 2, 70 + Math.random() * 58);
    ctx.globalCompositeOperation = "destination-in";
    const side = ctx.createLinearGradient(0, 0, 64, 0);
    side.addColorStop(0, "rgba(0,0,0,0)");
    side.addColorStop(0.2, "rgba(0,0,0,1)");
    side.addColorStop(0.8, "rgba(0,0,0,1)");
    side.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = side;
    ctx.fillRect(0, 0, 64, 128);
    reflTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.MeshBasicMaterial({ map: reflTex, color: new THREE.Color(color).multiplyScalar(0.55), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  m.userData.night = true;
  const p = flat(g, Math.max(0.8, width * 0.9), 2.6, m, at.x, at.y, at.z + 1.3, 0);
  p.receiveShadow = false;
}

/** Wet asphalt at night, dry and light by day (see theme.ts). */
export function wet(m: THREE.MeshStandardMaterial, dayMap: () => THREE.Texture) {
  m.userData.wet = true;
  return dayAlt(m, dayMap);
}

/** A lighter texture for the day theme, made the first time it is needed. */
function dayAlt(m: THREE.MeshStandardMaterial, dayMap: () => THREE.Texture) {
  m.userData.nightMap = m.map;
  m.userData.dayMap = dayMap;
  return m;
}

function manholeMat() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#2a2830";
  ctx.beginPath();
  ctx.arc(32, 32, 31, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#45424e";
  ctx.lineWidth = 2;
  for (let r = 8; r < 30; r += 6) {
    ctx.beginPath();
    ctx.arc(32, 32, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.4, metalness: 0.5 });
}

/** Rock strata for the diorama's cut sides. */
export function strataTexture(w: number, d: number) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const layers = ["#2c2834", "#36303c", "#2a2630", "#3a3340", "#221f28"];
  let y = 0;
  let i = 0;
  while (y < 64) {
    const h = 6 + ((i * 37) % 11);
    ctx.fillStyle = layers[i % layers.length];
    ctx.fillRect(0, y, 512, h);
    y += h;
    i++;
  }
  for (let k = 0; k < 160; k++) {
    ctx.fillStyle = `rgba(${90 + (k % 40)},${84 + (k % 30)},${100 + (k % 30)},0.35)`;
    const x = (k * 97) % 512,
      yy = (k * 53) % 64;
    ctx.fillRect(x, yy, 3 + (k % 6), 2 + (k % 3));
  }
  ctx.fillStyle = "#4a4552";
  ctx.fillRect(0, 0, 512, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.round((w + d) / 12), 1);
  t.magFilter = THREE.NearestFilter;
  return t;
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y + h / 2, z);
  b.receiveShadow = true;
  parent.add(b);
  return b;
}

function flat(parent: THREE.Object3D, w: number, d: number, m: THREE.Material, x: number, y: number, z: number, yaw: number) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
  p.rotation.set(-Math.PI / 2, yaw, 0, "YXZ");
  p.position.set(x, y, z);
  p.receiveShadow = true;
  parent.add(p);
  return p;
}

function freeSign(text: string, color: string): SignSpot {
  return { text, color, x: 0, y: 0, z: 0, w: 0, h: 0, vertical: false, facing: "front" };
}

/** Neon text mounted on a sign spot: front fascia, billboard, or both faces of a blade sign. */
function signPlane(parent: THREE.Object3D, s: SignSpot, toWorld: (x: number, y: number, z: number) => THREE.Vector3, yaw: number, flicker: Flicker[], size?: { w: number; h: number }) {
  const { texture, aspect } = neonTexture(s.text, s.color, { vertical: s.vertical });
  const maxW = size?.w ?? (s.facing === "side" ? 5.4 : s.w) * VOX;
  const maxH = size?.h ?? s.h * VOX;
  let w = maxW,
    h = maxW / aspect;
  if (h > maxH) {
    h = maxH;
    w = maxH * aspect;
  }
  const m = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) });
  if (Math.random() < 0.3) flicker.push({ mat: m, seed: Math.random() * 10, base: m.color.clone() });
  const geo = new THREE.PlaneGeometry(w, h);
  if (s.facing === "front") {
    const p = new THREE.Mesh(geo, m);
    p.position.copy(toWorld(s.x, s.y, s.z)).add(new THREE.Vector3(0, 0, 0.03).applyAxisAngle(Y, yaw));
    p.rotation.y = yaw;
    parent.add(p);
  } else
    for (const sideSign of [1, -1]) {
      const p = new THREE.Mesh(geo, m);
      p.position.copy(toWorld(sideSign > 0 ? s.x : s.x - 2, s.y, s.z)).add(new THREE.Vector3(sideSign * 0.03, 0, 0).applyAxisAngle(Y, yaw));
      p.rotation.y = yaw + (sideSign * Math.PI) / 2;
      parent.add(p);
    }
}
