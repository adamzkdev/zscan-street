import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CURB, GRID, gridCells, PARK, RIVER, ST } from "../city/plan";
import { sayAt } from "../speech";
import { toObject } from "../voxel/mesher";
import { C, E, G, VoxelModel } from "../voxel/model";
import { busShelter } from "../voxel/props";
import { Crowd, Kind, PORTRAITS, type Person } from "./crowd";
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

// ---- voxel props ---------------------------------------------------------------------------------

/** A food truck: front +x, the serving hatch on +z with its awning, a lit menu and a roof sign. */
function foodTruck(paint: string, trim: string, sign: string) {
  const w = 34,
    d = 13;
  const m = new VoxelModel(w, 20, d + 4);
  const body = C(paint),
    dark = C("#1c1b22"),
    white = C("#f2eee6");
  m.box(0, 2, 0, w - 7, 16, d, body);
  m.box(w - 7, 2, 0, w, 10, d, body);
  m.box(w - 6, 10, 1, w - 1, 12, d - 1, G("#22304a"));
  m.box(w - 7, 10, 0, w - 2, 13, d, body);
  m.box(w - 1, 4, 1, w, 5, 3, E("#fff6e0", 3));
  m.box(w - 1, 4, d - 3, w, 5, d - 1, E("#fff6e0", 3));
  m.box(0, 4, 1, 1, 5, 3, E("#ff2a1a", 2.4));
  m.box(0, 4, d - 3, 1, 5, d - 1, E("#ff2a1a", 2.4));
  // trim stripe, the hatch (lit inside) and its counter, the awning
  m.box(0, 6, 0, w, 7, d, C(trim));
  m.box(4, 8, d - 1, 22, 14, d, E("#ffe0b0", 1.5));
  m.box(4, 8, d - 1, 22, 9, d + 2, white);
  for (let x = 3; x < 24; x++) m.box(x, 15, d, x + 1, 16, d + 3, x % 4 < 2 ? C(trim) : white);
  // the menu board and the roof sign
  m.box(7, 10, d, 13, 13, d + 1, E(sign, 1.2));
  m.box(6, 16, 3, 24, 19, 9, E(sign, 1.8));
  m.box(6, 16, 2, 24, 17, 10, dark);
  // wheels
  for (const x of [6, w - 8]) {
    m.box(x - 2, 0, 0, x + 3, 3, 2, dark);
    m.box(x - 2, 0, d - 2, x + 3, 3, d, dark);
  }
  return m;
}

/** A busker's kit: an amp, a mic stand and an open guitar case with a few gold coins. */
function buskerKit(color: string) {
  const m = new VoxelModel(16, 10, 8);
  m.box(0, 0, 0, 4, 5, 4, C("#1c1b22"));
  m.box(1, 1, 3, 3, 4, 4, C("#4a4656"));
  m.box(0, 5, 0, 4, 6, 4, E(color, 1.2));
  m.box(7, 0, 2, 8, 9, 3, C("#2a2a30"));
  m.box(6, 9, 1, 9, 10, 4, C("#2a2a30"));
  m.box(9, 0, 4, 16, 1, 8, C("#3a2420"));
  m.box(10, 1, 5, 15, 1.5, 7, C("#a02a3a"));
  for (const [x, z] of [
    [11, 5],
    [13, 6],
    [12, 6],
  ])
    m.set(x, 1, z, E("#f4b728", 1.4));
  return m;
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
  const shelterProto = toObject(busShelter().model);
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

  // ---- 5. food trucks, with their queues ----
  const TRUCKS: [number, number, number, string, string, string][] = [
    // x, z, heading (the hatch faces +z rotated), paint, trim, sign
    [-24, -50.8, 0, "#f4b728", "#16141c", "#ff6a3a"],
    [26, -50.8, 0, "#e8e4dc", "#e03a5a", "#3ef0ff"],
    [-196, -52, 0, "#3a6aff", "#f2eee6", "#f4b728"],
    [-62, 81.5, Math.PI, "#e03a5a", "#f2eee6", "#ffd28a"],
    [-100, -193.6, Math.PI, "#38a06a", "#f2eee6", "#f4b728"],
  ];
  for (const [x, z, rot, paint, trim, sign] of TRUCKS) {
    const o = toObject(foodTruck(paint, trim, sign));
    o.position.set(x, Y, z);
    o.rotation.y = rot;
    statics.add(o);
    // the hatch's side: +z of the model
    const out = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    const along = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    const hx = x + out.x * 2.2 - along.x * 0.8,
      hz = z + out.z * 2.2 - along.z * 0.8;
    const ids = queue(hx, hz, out.x * 3 - along.x * 4, out.z * 3 - along.z * 4, Math.round(range(5, 8)));
    ids.push(...cluster(x + out.x * 4.5 + along.x * 3, z + out.z * 4.5 + along.z * 3, 1.6, 4));
    talkers.push({ ids, lines: LINES.truck });
  }

  // ---- 6. buskers and their audience ----
  const BUSKERS: [number, number, number][] = [
    [6, -78, -Math.PI / 2],
    [-100, -190.5, Math.PI / 2],
    [-180, -45.5, Math.PI / 2],
    [150, -8, Math.PI / 2],
  ];
  const buskers: { x: number; z: number; id: number }[] = [];
  for (const [x, z, h] of BUSKERS) {
    const id = add({ kind: Kind.Dance, a: [x, z, h + Math.PI / 2, 0], y: Y });
    const kit = toObject(buskerKit(pickOf(["#ff3e8a", "#3ef0ff", "#f4b728"])));
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
      ids.push(stand(px, pz, Math.atan2(z - pz, x - px), 0));
    }
    talkers.push({ ids: ids.slice(1), lines: LINES.music });
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
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    byMat.get(mat)!.push(g.index ? g : g);
  });
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = mesh.receiveShadow = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    group.add(mesh);
  }
  const crowd = new Crowd(people, 77);
  group.add(crowd.mesh, crowd.shadows);
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
