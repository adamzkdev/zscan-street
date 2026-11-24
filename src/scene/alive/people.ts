import { freezePosters, memePoster } from "../memes";
import { nextMeme } from "../memewalls";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CURB, GRID, gridCells, PARK, RIVER, ST } from "../city/plan";
import { sayAt } from "../speech";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { carObject } from "../real/cars";
import { realShelter } from "../real/props";
import { Crowd, Kind, PORTRAITS, type Person } from "./crowd";
import { RealDogs } from "../real/dogs";
const REAL_DOGS = typeof location === "undefined" || new URLSearchParams(location.search).get("real") !== "0";
import type { AliveCtx, AliveFrame, AlivePart } from "./types";

/**
 * People everywhere in the megalopolis, not only in the heart: walkers (and their dogs, and
 * joggers) round every block's pavement, strollers and runners in Central Park, queues and crowds
 * at the landmarks, people waiting at bus stops, food trucks with their queues, street musicians
 * and their audience, and now and then the Shielded Marathon along the river.
 */

const rnd = (() => {
  let a = 90210;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
const range = (a: number, b: number) => a + rnd() * (b - a);
const pickOf = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const Y = CURB;

/** The width of the street centred at `at` on the x grid / z grid. */
const xw = (x: number) => GRID.xw[GRID.xs.indexOf(x)] ?? GRID.street;
const zw = (z: number) => GRID.zw[GRID.zs.indexOf(z)] ?? GRID.street;

/** A group of people who talk now and then (indices in the crowd). */
interface Talkers {
  ids: number[];
  lines: string[];
}

const LINES = {
  stadium: ["Shielded will win tonight!", "Got my ticket!", "Which gate is ours?", "Transparent has no chance.", "Let's go Shielded!"],
  museum: ["All 10,000 zkSNARKs inside!", "Is #1 on show?", "How long is the wait?", "Worth it."],
  eiffel: ["Photo with the tower!", "Lift or stairs?", "The view from the top!", "Paris, but shielded."],
  queue: ["How long is the wait?", "Almost there!", "Worth the queue.", "Did you book online?"],
  bus: ["Bus is late again.", "Next block, next bus.", "Is this the 7?", "It's coming!"],
  truck: ["One ramen, please!", "Pay in ZEC?", "Extra spicy!", "Best tacos in town.", "Shielded fries!"],
  music: ["Encore!", "Bravo!", "Love this song!", "Play another one!"],
  race: ["Go go go!", "Keep going!", "Almost there!", "Shielded Marathon!"],
  street: ["Nice day for a walk.", "Did you see the new block?", "Shielded, always.", "Coffee?", "Look at that tower!"],
};

// ---- the food trucks and the buskers' kits, realistic ---------------------------------------------

const kitMats = new Map<string, THREE.Material>();
const kmat = (key: string, make: () => THREE.Material) => kitMats.get(key) ?? (kitMats.set(key, make()), kitMats.get(key)!);
const matte = (hex: string, rough = 0.6, metal = 0) => kmat(`m:${hex}:${rough}:${metal}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }));
const lit = (hex: string, k = 1.6) => kmat(`l:${hex}:${k}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false }));
const canvas = (hex: string) => kmat(`c:${hex}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, side: THREE.DoubleSide }));
const rb = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r);
function mesh(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}

/**
 * A food truck: the street's realistic van (src/scene/real/cars.ts: front +x, the passenger side +z)
 * in the truck's paint, with the serving hatch cut in its +z side (lit inside, a counter, the menu),
 * a striped awning propped over it and the lit sign on its roof.
 */
function foodTruck(paint: string, trim: string, sign: string) {
  const g = carObject("van", { paint });
  const W = 1.0;
  // the hatch: the lit kitchen behind it, its frame, the counter
  g.add(mesh(new THREE.PlaneGeometry(2.3, 0.95), lit("#ffe0b0", 1.3), -0.85, 1.6, W + 0.012, false));
  for (const [w, h, x, y] of [
    [2.42, 0.06, -0.85, 2.1],
    [0.06, 1.0, -2.03, 1.6],
    [0.06, 1.0, 0.33, 1.6],
  ])
    g.add(mesh(new THREE.BoxGeometry(w, h, 0.05), matte("#d8dade", 0.3, 0.8), x, y, W + 0.02));
  g.add(mesh(rb(2.4, 0.05, 0.36, 0.015), matte("#f2eee6", 0.35, 0.3), -0.85, 1.12, W + 0.17));
  g.add(mesh(new THREE.BoxGeometry(2.4, 0.08, 0.06), matte(trim, 0.4, 0.3), -0.85, 0.98, W + 0.03));
  // the menu board beside the hatch, lit
  g.add(mesh(new THREE.PlaneGeometry(0.6, 0.5), lit(sign, 1.1), 0.75, 1.55, W + 0.015, false));
  // the awning: canvas stripes on two struts, sloping out
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = new THREE.PlaneGeometry(2.5 / n, 0.75);
    a.rotateX(-Math.PI / 2 + 0.42);
    g.add(mesh(a, canvas(i % 2 ? trim : "#f2eee6"), -2.1 + (i + 0.5) * (2.5 / n), 2.06, W + 0.34));
  }
  for (const x of [-2.0, 0.3]) {
    const s = new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6).rotateX(Math.PI / 2 - 0.42);
    g.add(mesh(s, matte("#c8ccd2", 0.3, 0.9), x, 1.92, W + 0.36, false));
  }
  // the roof sign: a lightbox on two feet
  g.add(mesh(rb(2.4, 0.5, 0.14, 0.03), matte("#16141c", 0.5), -0.6, 2.72, 0));
  for (const z of [-1, 1]) g.add(mesh(new THREE.PlaneGeometry(2.2, 0.36), lit(sign, 1.5), -0.6, 2.72, z * 0.072, false).rotateY(z < 0 ? Math.PI : 0));
  for (const x of [-1.5, 0.3]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), matte("#2a2a30", 0.5, 0.5), x, 2.4, 0));
  return g;
}

/** A busker's kit: a combo amp (its grille, its lit knobs), a mic stand, the open guitar case with a few gold coins in its lining. */
function buskerKit(color: string) {
  const g = new THREE.Group();
  // the amp
  g.add(mesh(rb(0.62, 0.55, 0.32, 0.03).translate(0, 0.275, 0), matte("#1c1b22", 0.7), -1.0, 0, 0.33));
  g.add(mesh(new THREE.PlaneGeometry(0.5, 0.34), matte("#3a3842", 0.95), -1.0, 0.24, 0.492, false));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.02), lit(color, 1.2), -1.0, 0.49, 0.495, false));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.03, 0.08), matte("#2a2a30", 0.4, 0.6), -1.0, 0.565, 0.33));
  // the mic stand: a tripod, the pole, the boom, the mic
  const steel = matte("#2a2a30", 0.35, 0.8);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.CylinderGeometry(0.01, 0.01, 0.32, 6).rotateZ(Math.PI / 2 - 0.5).rotateY(a);
    g.add(mesh(leg, steel, -0.17 + Math.cos(a) * 0.13, 0.08, 0.42 - Math.sin(a) * 0.13, false));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.45, 8).translate(0, 0.725, 0), steel, -0.17, 0.1, 0.42, false));
  g.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.4, 6).rotateX(Math.PI / 2 - 0.35), steel, -0.17, 1.6, 0.56, false));
  g.add(mesh(new THREE.CapsuleGeometry(0.022, 0.12, 4, 10).rotateX(Math.PI / 2 - 0.35), matte("#3a3a40", 0.3, 0.7), -0.17, 1.66, 0.75, false));
  // the guitar case, open: its shell (a rounded body and neck), the red plush, the coins
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, 0.22, 0.17, 0, Math.PI * 2, false, 0);
  const body = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 20 }).rotateX(-Math.PI / 2);
  g.add(mesh(body.clone(), matte("#2a1a16", 0.55), 0.55, 0, 0.35));
  g.add(mesh(rb(0.62, 0.1, 0.16, 0.03).translate(0, 0.05, 0), matte("#2a1a16", 0.55), 0.95, 0, 0.35));
  const lining = new THREE.ShapeGeometry(shape, 20).rotateX(-Math.PI / 2).scale(0.88, 1, 0.86);
  g.add(mesh(lining, matte("#a02a3a", 1), 0.55, 0.121, 0.35, false));
  g.add(mesh(new THREE.PlaneGeometry(0.56, 0.11).rotateX(-Math.PI / 2), matte("#a02a3a", 1), 0.95, 0.101, 0.35, false));
  for (const [x, z] of [
    [0.5, 0.32],
    [0.6, 0.4],
    [0.56, 0.28],
    [0.9, 0.36],
  ])
    g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 12), matte("#f4b728", 0.25, 1), x, 0.125, z, false));
  return g;
}

// ---- the part ------------------------------------------------------------------------------------

export async function buildPeople(ctx: AliveCtx): Promise<AlivePart> {
  const { city, group } = ctx;
  /** Static props, merged into one mesh per material at the end. */
  const statics = new THREE.Group();
  const budget = Math.max(0.2, ctx.budget);
  const people: Person[] = [];
  const talkers: Talkers[] = [];
  const add = (p: Person) => people.push(p) - 1;
  const stand = (x: number, z: number, heading: number, fidget = 1, y = Y) => add({ kind: Kind.Stand, a: [x, z, heading, fidget], y });
  /** People facing (fx, fz) in a loose cluster round (x, z). */
  const cluster = (x: number, z: number, r: number, n: number, fx?: number, fz?: number) => {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2,
        d = Math.sqrt(rnd()) * r;
      const px = x + Math.cos(a) * d,
        pz = z + Math.sin(a) * d;
      const h = fx === undefined ? rnd() * Math.PI * 2 : Math.atan2(fz! - pz, fx - px);
      ids.push(stand(px, pz, h));
    }
    return ids;
  };
  /** A queue from (x, z) along (dx, dz), each facing the head, snaking once if long. */
  const queue = (x: number, z: number, dx: number, dz: number, n: number, gap = 0.72) => {
    const ids: number[] = [];
    const L = Math.hypot(dx, dz);
    const ux = dx / L,
      uz = dz / L;
    const perRow = Math.max(4, Math.floor(L / gap));
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow),
        k = i % perRow;
      const along = (row % 2 ? perRow - 1 - k : k) * gap + range(-0.08, 0.08);
      const side = row * 0.9;
      const px = x + ux * along - uz * side,
        pz = z + uz * along + ux * side;
      ids.push(stand(px, pz, Math.atan2(-uz * (row % 2 ? -1 : 1), -ux * (row % 2 ? -1 : 1)), rnd() < 0.5 ? 1 : 0));
    }
    return ids;
  };

  // ---- 1. every block's pavement: walkers, joggers, dog walkers ----
  const cells = gridCells();
  for (const c of cells) {
    if (c.kind !== "block") continue;
    const per = 2 * (c.x1 - c.x0 + c.z1 - c.z0);
    const n = Math.round((per / 2.6) * budget);
    for (let i = 0; i < n; i++) {
      const inset = range(1.85, 2.3);
      const rect: [number, number, number, number] = [c.x0 + inset, c.z0 + inset, c.x1 - inset, c.z1 - inset];
      const dir = rnd() < 0.5 ? -1 : 1;
      const roll = rnd();
      const phase = rnd() * per;
      if (roll < 0.08) add({ kind: Kind.Loop, a: rect, speed: dir * range(2.6, 3.3), phase });
      else if (roll < 0.15) {
        const sp = dir * range(1.0, 1.25);
        add({ kind: Kind.Loop, a: rect, speed: sp, phase });
        add({ kind: Kind.DogLoop, a: rect, speed: sp, phase: phase + dir * 0.95, scale: 0.78, slot: Math.floor(rnd() * 2) });
      } else add({ kind: Kind.Loop, a: rect, speed: dir * range(1.0, 1.5), phase });
    }
    // a pair chatting on a corner now and then
    for (let k = 0; k < 2; k++) if (rnd() < 0.5 * budget) {
      const cx = rnd() < 0.5 ? c.x0 + 1.5 : c.x1 - 1.5,
        cz = rnd() < 0.5 ? c.z0 + 1.5 : c.z1 - 1.5;
      const a = stand(cx - 0.45, cz, 0, 0),
        b = stand(cx + 0.45, cz, Math.PI, 0);
      talkers.push({ ids: [a, b], lines: LINES.street });
    }
  }

  // ---- 2. Central Park: joggers round its edge, strollers and dogs on its paths ----
  const P = GRID.park;
  for (let i = 0; i < Math.round(26 * budget); i++) {
    const inset = range(1.3, 1.9);
    add({ kind: Kind.Loop, a: [P.x0 + inset, P.z0 + inset, P.x1 - inset, P.z1 - inset], speed: (rnd() < 0.5 ? -1 : 1) * range(2.4, 3.4) });
  }
  for (const path of PARK.paths)
    for (let k = 0; k + 1 < path.length; k++) {
      const [ax, az] = path[k],
        [bx, bz] = path[k + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let i = 0; i < Math.round((len / 9) * budget); i++) {
        const off = range(-0.6, 0.6);
        const nx = -(bz - az) / len,
          nz = (bx - ax) / len;
        const a: [number, number, number, number] = [ax + nx * off, az + nz * off, bx + nx * off, bz + nz * off];
        const phase = rnd() * len * 2;
        const sp = range(0.8, 1.2);
        add({ kind: Kind.Path, a, speed: sp, phase });
        if (rnd() < 0.18) add({ kind: Kind.DogPath, a, speed: sp, phase: phase + 0.9, scale: 0.78, slot: Math.floor(rnd() * 2) });
      }
    }

  // ---- 3. the landmarks: queues and crowds ----
  const lm = city.landmarks;
  const st = lm.get("stadium");
  if (st?.points.gate) {
    const g = st.points.gate;
    // the turnstiles' queues, fans all over the plaza, a few by the carts
    talkers.push({ ids: queue(g.x - 2, g.z + 0.6, -14, 0, 30), lines: LINES.stadium });
    talkers.push({ ids: queue(g.x + 2, g.z + 0.6, 14, 0, 30), lines: LINES.stadium });
    for (let i = 0; i < 40 * budget; i++) {
      const x = range(g.x - 30, g.x + 30);
      add({ kind: Kind.Path, a: [x, g.z + range(1.2, 2.6), x + range(-10, 10), g.z + range(1.2, 2.6)], speed: range(0.9, 1.3), cloth: rnd() < 0.5 ? "#c89a1a" : undefined });
    }
    if (st.points.carts) talkers.push({ ids: cluster(st.points.carts.x, st.points.carts.z + 1.5, 3, 10), lines: LINES.stadium });
  }
  const mu = lm.get("museum");
  if (mu?.points.arch) {
    const a = mu.points.arch;
    talkers.push({ ids: queue(a.x + 1.4, a.z - 2, 0, -14, 26), lines: LINES.museum });
    talkers.push({ ids: cluster(a.x + 1.6, a.z + 4, 2.2, 8), lines: LINES.museum });
  }
  const ei = lm.get("eiffel");
  if (ei) {
    const d = ei.door;
    talkers.push({ ids: queue(d.x + 1.5, d.z - 1.2, 16, 0, 28), lines: LINES.eiffel });
    // tourists taking photos of the tower from the street's far pavement
    talkers.push({ ids: cluster(d.x - 5, d.z + 9.4, 3, 12, d.x - 5, d.z - 20), lines: LINES.eiffel });
  }
  for (const [kind, key, dx, dz] of [
    ["colosseum", "gate", 12, 0],
    ["pyramid", "entrance", 12, 0],
    ["needle", "lobby", 0, 4],
    ["parliament", "door", -12, 0],
  ] as const) {
    const l = lm.get(kind);
    const p = l?.points[key] ?? l?.door;
    if (p) talkers.push({ ids: queue(p.x + Math.sign(dx) * 1.5, p.z + 1.4 + Math.sign(dz) * 1.5, dx, dz || 0.0001, 18), lines: LINES.queue });
  }
  const mall = lm.get("mall");
  if (mall) {
    for (let i = 0; i < 30 * budget; i++) {
      const x = range(132, 188);
      add({ kind: Kind.Path, a: [x, -8.4 + range(-0.6, 0.6), x + range(-14, 14), -8.4 + range(-0.6, 0.6)], speed: range(0.9, 1.3) });
    }
  }

  // ---- 4. bus stops on the boulevards and the ring ----
  const cellAt = (x: number, z: number) => cells.find((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
  // (realistic: steel, glass, a lit roof strip, a slatted bench: src/scene/real/props.ts)
  const shelterProto = realShelter();
  /** A stop on the pavement beside the street on axis `axis` at `at`, on `side`, `along` it. */
  const busStop = (axis: "x" | "z", at: number, side: 1 | -1, along: number) => {
    const half = (axis === "z" ? xw(at) : zw(at)) / 2;
    const kerb = at + side * half;
    const [x, z] = axis === "z" ? [kerb + side * 0.95, along] : [along, kerb + side * 0.95];
    const c = cellAt(x, z);
    if (!c || c.kind !== "block") return;
    const o = shelterProto.clone();
    o.position.set(x, Y, z);
    // its open side (+z) to the street
    o.rotation.y = axis === "z" ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? Math.PI : 0;
    statics.add(o);
    // a meme in the shelter's backlit ad box (its end panel's outer face, scene/memes.ts)
    const ad = memePoster(nextMeme(), 1.15, { kind: "lightbox", frame: "#f4b728" });
    ad.position.set(2.36, 1.45, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y).add(o.position);
    ad.rotation.y = o.rotation.y + Math.PI / 2;
    group.add(ad);
    const ids: number[] = [];
    const face = axis === "z" ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (let i = 0; i < 2 + Math.floor(rnd() * 4); i++) {
      const t = range(-3.6, 3.6);
      const k = Math.abs(t) < 2.3 ? 0.95 : 0.55;
      const [px, pz] = axis === "z" ? [kerb + side * k, along + t] : [along + t, kerb + side * k];
      ids.push(stand(px, pz, face + range(-0.3, 0.3)));
    }
    talkers.push({ ids, lines: LINES.bus });
  };
  for (const z of [-180, -60, 20, 95]) {
    busStop("z", ST.blvdW, 1, z);
    busStop("z", ST.blvdE, -1, z + 12);
  }
  for (const x of [-140, 30, 170]) busStop("x", ST.blvdN, 1, x);
  for (const x of [-20, 100]) busStop("x", ST.bank, -1, x);
  freezePosters(group);

  // ---- 5. food trucks, with their queues ----
  const TRUCKS: [number, number, number, string, string, string][] = [
    // x, z, heading (the hatch faces +z rotated), paint, trim, sign
    [-24, -50.8, 0, "#f4b728", "#16141c", "#ff6a3a"],
    [26, -50.8, 0, "#e8e4dc", "#e03a5a", "#3ef0ff"],
    // (these two stood in the middle of Sprout Avenue and Canopy Street once the streets grew
    // wider: now parked at the kerb, the hatch and the queue on the pavement)
    [-194 - (GRID.xw[GRID.xs.indexOf(-194)] ?? 14) / 2 + 1.35, -52, -Math.PI / 2, "#3a6aff", "#f2eee6", "#f4b728"],
    [-62, 81.5, Math.PI, "#e03a5a", "#f2eee6", "#ffd28a"],
    [-100, -192 + (GRID.zw[GRID.zs.indexOf(-192)] ?? 14) / 2 - 1.35, 0, "#38a06a", "#f2eee6", "#f4b728"],
  ];
  for (const [x, z, rot, paint, trim, sign] of TRUCKS) {
    const o = foodTruck(paint, trim, sign);
    o.position.set(x, Y, z);
    o.rotation.y = rot;
    statics.add(o);
    // the hatch's side: +z of the model
    const out = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    const along = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    const hx = x + out.x * 2.2 - along.x * 0.8,
      hz = z + out.z * 2.2 - along.z * 0.8;
    // the queue along the pavement, not out into the street
    const ids = queue(hx, hz, -along.x * 5 + out.x * 0.6, -along.z * 5 + out.z * 0.6, Math.round(range(5, 8)));
    ids.push(...cluster(x + out.x * 3.6 + along.x * 3, z + out.z * 3.6 + along.z * 3, 1.2, 4));
    talkers.push({ ids, lines: LINES.truck });
  }

  // ---- 6. buskers and their audience ----
  // (two of them played in the middle of Canopy Street and Viewing Key Street: on the pavement now,
  // their audience along it)
  const BUSKERS: [number, number, number][] = [
    [6, -78, -Math.PI / 2],
    [-112, -183.4, Math.PI],
    [-180, -49.2, 0],
    [150, -8, Math.PI / 2],
  ];
  const asphalt = (x: number, z: number) =>
    GRID.xs.some((c, i) => Math.abs(x - c) < GRID.xw[i] / 2 + 0.3 && z > -240 && z < 146) || GRID.zs.some((c, i) => c !== ST.river && Math.abs(z - c) < GRID.zw[i] / 2 + 0.3);
  const buskers: { x: number; z: number; id: number }[] = [];
  for (const [x, z, h] of BUSKERS) {
    const id = add({ kind: Kind.Dance, a: [x, z, h + Math.PI / 2, 0], y: Y });
    const kit = buskerKit(pickOf(["#ff3e8a", "#3ef0ff", "#f4b728"]));
    kit.position.set(x + Math.cos(h + Math.PI / 2) * 1.3, Y, z + Math.sin(h + Math.PI / 2) * 1.3);
    kit.rotation.y = -h;
    statics.add(kit);
    // the audience in an arc in front
    const ids = [id];
    for (let i = 0; i < 9 * budget + 2; i++) {
      const a = h + range(-1.1, 1.1),
        r = range(2.6, 4);
      const px = x + Math.cos(a) * r,
        pz = z + Math.sin(a) * r;
      if (asphalt(px, pz)) continue;
      ids.push(stand(px, pz, Math.atan2(z - pz, x - px), 0));
    }
    // (an audience of one or none, on a narrow pavement: nobody to talk)
    if (ids.length > 2) talkers.push({ ids: ids.slice(1), lines: LINES.music });
    buskers.push({ x, z, id });
  }

  // ---- 7. the Shielded Marathon: on the river's north quay, now and then ----
  const RACE_Z = RIVER.z0 - 0.9;
  const runners = Math.round(160 * budget);
  const KITS = ["#f4b728", "#f4b728", "#e8e4dc", "#3ef0ff", "#ff3e8a"];
  for (let i = 0; i < runners; i++) {
    const lane = RACE_Z - range(0, 1.2);
    add({ kind: Kind.Race, a: [-232, lane, 232, lane], speed: range(3.4, 5), phase: i * 0.7 + range(0, 6), cloth: KITS[i % KITS.length] });
  }
  // the props: one mesh per material
  statics.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  statics.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.Material;
    if (!byMat.has(mat)) byMat.set(mat, []);
    const g0 = m.geometry.clone().applyMatrix4(m.matrixWorld);
    // (all alike for the merge: no index, uvs everywhere)
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    byMat.get(mat)!.push(g);
  });
  for (const [mat, geos] of byMat) {
    // (an attribute only some parts have is left out)
    const names = Object.keys(geos[0].attributes).filter((n) => geos.every((g) => g.getAttribute(n)));
    for (const g of geos) for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
    for (const g of geos) g.morphAttributes = {};
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = mesh.receiveShadow = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    group.add(mesh);
  }
  const crowd = new Crowd(people, 77);
  group.add(crowd.mesh, crowd.shadows);
  // (realistic: the dogs in 3D instead of the crowd's pixel dogs; ?real=0 keeps them)
  const dogs = REAL_DOGS ? new RealDogs(crowd) : null;
  if (dogs) group.add(dogs.group);
  console.info(`[alive] ${people.length} people`);

  // ---- music notes over the buskers (sprites, near the camera only) ----
  const noteTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    g.fillStyle = "#f4b728";
    g.font = "bold 28px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("♪", 16, 17);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const notes: { s: THREE.Sprite; age: number; b: number; dx: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex, transparent: true, depthWrite: false }));
    s.scale.setScalar(0.45);
    s.raycast = () => {};
    s.visible = false;
    group.add(s);
    notes.push({ s, age: 99, b: 0, dx: 0 });
  }

  // ---- the race's schedule, the talk ----
  let raceAt = 45;
  let raceStart = -1;
  const RACE_LEN = 464 / 3.4 + (runners * 0.7 + 6) / 3.4 + 5;
  let talkIn = 3;
  const anchors = [new THREE.Object3D(), new THREE.Object3D()];
  for (const a of anchors) group.add(a);
  const anchorBusy = [0, 0];
  const tmp = new THREE.Vector3();
  let noteIn = 0;

  return Object.assign(
    {
      update(f: AliveFrame) {
        // close up only the nearby crowd is drawn; from the overview, everyone (they are specks)
        crowd.update(f.t, f.focus, f.wide ? 1e5 : f.walking ? 160 : 230, raceStart);
        dogs?.update(f.dt, f.focus, f.wide ? 1e5 : f.walking ? 160 : 230);
        // the marathon
        if (raceStart < 0 && f.t > raceAt) raceStart = f.t;
        if (raceStart >= 0 && f.t > raceStart + RACE_LEN) {
          raceStart = -1;
          raceAt = f.t + range(180, 300);
        }
        // notes rising over the buskers near the camera
        noteIn -= f.dt;
        if (noteIn <= 0) {
          noteIn = 0.35;
          const b = buskers.find((q) => Math.hypot(q.x - f.focus.x, q.z - f.focus.z) < 45);
          const n = notes.find((q) => q.age > 2.2);
          if (b && n) {
            n.age = 0;
            n.b = buskers.indexOf(b);
            n.dx = range(-0.5, 0.5);
            n.s.visible = true;
          }
        }
        for (const n of notes) {
          if (n.age > 2.2) continue;
          n.age += f.dt;
          const b = buskers[n.b];
          n.s.position.set(b.x + n.dx + Math.sin(n.age * 4) * 0.2, Y + 2 + n.age * 0.7, b.z);
          (n.s.material as THREE.SpriteMaterial).opacity = Math.min(1, (2.2 - n.age) * 2);
          if (n.age > 2.2) n.s.visible = false;
        }
        // now and then someone near the camera says something (two bubbles at most)
        const close = f.walking || (!f.wide && f.camera.type === "OrthographicCamera" && (f.camera as THREE.OrthographicCamera).zoom > 0.75);
        talkIn -= f.dt;
        if (talkIn <= 0 && close) {
          talkIn = range(1.6, 3.4);
          const slot = anchorBusy.findIndex((u) => u < f.t);
          const near = talkers.filter((g) => {
            if (!g.ids.length) return false;
            crowd.positionOf(g.ids[0], tmp);
            return Math.hypot(tmp.x - f.focus.x, tmp.z - f.focus.z) < (f.walking ? 22 : 30);
          });
          const raceNear = raceStart >= 0 && Math.abs(RACE_Z - f.focus.z) < 25;
          if (slot >= 0 && (near.length || raceNear)) {
            const g = near.length ? pickOf(near) : null;
            const lines = g ? g.lines : LINES.race;
            const who = g ? pickOf(g.ids) : -1;
            if (who >= 0) crowd.positionOf(who, tmp);
            else tmp.set(f.focus.x + range(-6, 6), Y, RACE_Z - 2.2);
            const a = anchors[slot];
            a.position.copy(tmp);
            sayAt(a, pickOf(lines), "talk", 2.05, 2.6, 0.5);
            anchorBusy[slot] = f.t + 2.8;
          }
        }
      },
    },
    { crowd, startRace: () => (raceAt = 0), people: () => people.length, portraits: PORTRAITS },
  );
}
