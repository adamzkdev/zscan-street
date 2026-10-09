import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Snark, loadArt } from "../../scene/snark";
import { C, E, hash, VoxelModel } from "../../scene/voxel/model";
import { place } from "../furniture";
import type { PickInfo, Rect } from "../types";
import { HYPO, HYPO_STAIR, meshAt, one, patch } from "./geo";
import { kit, LIFTS, TRAPS } from "./show";

/**
 * The hypogeum, under the sand: a long central corridor between tuff walls, parallel galleries with
 * the lifts (wooden shafts under the trapdoors, each worked by a capstan), the beasts' cages along
 * the outer wall (lions, a tiger, a bear, wolves, a boar), the armoury at the far end with gladiators
 * waiting, torches, light falling through the open trapdoors, the stair up to the arena.
 */
export interface Hypogeum {
  group: THREE.Group;
  rects: Rect[];
  flames: THREE.Object3D[];
  /** Its torches' light (off while it is only seen from the arena, down the stair's slot). */
  lights: THREE.PointLight[];
  people: Snark[];
  pickables: THREE.Object3D[];
  pick(o: THREE.Object3D): PickInfo | null;
  hover(o: THREE.Object3D): string | null;
  update(dt: number, t: number, lift: number[], hatch: number[]): void;
}

const HX = 12,
  HZ = 19,
  HH = 6;
const V = 0.25;
/** The stair up to the arena (geo.ts). */
const STAIR = HYPO_STAIR;

export function buildHypogeum(): Hypogeum {
  const group = new THREE.Group();
  const W = Math.round((HX * 2) / V),
    D = Math.round((HZ * 2) / V),
    H = Math.round(HH / V);
  const m = new VoxelModel(W, H, D);
  const X = (ix: number) => -HX + (ix + 0.5) * V;
  const Z = (iz: number) => -HZ + (iz + 0.5) * V;
  // squared tuff blocks in 50 cm courses, staggered, a few patched in brick
  const blockC = ["#8a8476", "#827c6f", "#938c7e", "#7c766a"].map((h) => C(h));
  const brickC = [C("#7e4430"), C("#8a4c36")];
  const tuff = (ix: number, y: number, iz: number) => {
    const row = y >> 1;
    const along = ix + iz + (row % 2) * 2;
    const h = hash(along >> 2, row, (ix - iz) >> 5, 11);
    if (y < 3 && h < 0.5) return brickC[row & 1];
    return blockC[Math.floor(h * 4)];
  };
  const brick = patch(["#8e4a34", "#9a5239"], 5, 4, 12);
  const earth = patch(["#5a4a38", "#54452f", "#604e3a"], 6, 1, 13);
  const plank = one("#5e4430");
  const beam = one("#3e2c1e");
  const iron = one("#26242a");
  const travD = one("#a89a7e");
  const travL = one("#c4b79a");

  const holes: [number, number][] = [...LIFTS, ...TRAPS];
  const inHole = (x: number, z: number) => holes.some(([hx, hz]) => Math.abs(x - hx) < 0.8 && Math.abs(z - hz) < 0.8);
  const door = (z: number, list: number[], w = 1) => list.some((c) => Math.abs(z - c) < w);
  const CAGE_Z = [-6, 0, 6];
  const BARS = 8.7;

  for (let iz = 0; iz < D; iz++)
    for (let ix = 0; ix < W; ix++) {
      const x = X(ix),
        z = Z(iz);
      const ax = Math.abs(x);
      const e = (x / HX) ** 2 + (z / HZ) ** 2;
      m.set(ix, 0, iz, ax < 0.15 ? C("#3a3026") : earth(ix, 0, iz));
      // ceiling: planks on beams, holes at the trapdoors and over the stair
      const slot = x > STAIR.x0 && x < STAIR.x1 && z > STAIR.z0 && z < STAIR.z1;
      if (!inHole(x, z) && !slot) {
        m.set(ix, H - 1, iz, plank(ix, 0, iz));
        if (iz % 4 === 0) m.set(ix, H - 2, iz, beam(ix, 0, iz));
      }
      let solidTo = 0;
      let mat: (a: number, b: number, c: number) => number = tuff;
      if (e > 1) solidTo = H - 1;
      else if (e > 0.93) {
        solidTo = H - 1;
        mat = brick;
      } else if (ax > 1.75 && ax < 2.25 && !door(z, x < 0 ? [-12, -4, 4] : [-12, -4, 4, 12]) && z > -15.5) solidTo = H - 1;
      else if (ax > 6.25 && ax < 6.75 && !door(z, [-11, -3, 3, 11])) solidTo = H - 1;
      else if (ax > BARS + 0.3 && CAGE_Z.some((c) => Math.abs(Math.abs(z - c) - 2.75) < 0.25)) solidTo = H - 1; // between cages
      else if (ax > BARS + 0.3 && Math.abs(z) > 9 && Math.abs(z) < 9.5) solidTo = H - 1;
      // the stair up to the arena: solid to the floor, its last step level with the sand
      if (x > STAIR.wall && x < STAIR.x1 && z > STAIR.z0 && z < STAIR.z1) {
        const step = Math.floor((STAIR.z1 - z) / V);
        for (let y = 1; y <= step; y++) m.set(ix, y, iz, (y === step ? travL : travD)(ix, y, iz));
      }
      for (let y = 1; y < solidTo; y++) {
        // arched doorways: the walls above the openings
        m.set(ix, y, iz, mat(ix, y, iz));
      }
      // lintels over doorways (2.5 m openings, arched)
      if (ax > 1.75 && ax < 2.25 && z > -15.5) for (const c of x < 0 ? [-12, -4, 4] : [-12, -4, 4, 12]) if (Math.abs(z - c) < 1) for (let y = Math.round((2.5 + Math.sqrt(Math.max(0, 1 - (z - c) ** 2)) * 0.6) / V); y < H - 1; y++) m.set(ix, y, iz, tuff(ix, y, iz));
      if (ax > 6.25 && ax < 6.75) for (const c of [-11, -3, 3, 11]) if (Math.abs(z - c) < 1) for (let y = Math.round((2.5 + Math.sqrt(Math.max(0, 1 - (z - c) ** 2)) * 0.6) / V); y < H - 1; y++) m.set(ix, y, iz, tuff(ix, y, iz));
      // cage bars: iron every 25 cm, a crossbar, a gate in each
      if (Math.abs(ax - BARS) < 0.13 && Math.abs(z) < 8.8 && e < 0.93) {
        const gate = CAGE_Z.some((c) => Math.abs(z - c - 1.2) < 0.5);
        for (const y of [1, 9, H - 2]) m.set(ix, y, iz, iron(ix, y, iz));
        void gate;
      }
      // straw in the cages
      if (ax > BARS + 0.2 && Math.abs(z) < 8.6 && e < 0.93 && hash(ix >> 1, 3, iz >> 1, 4) < 0.5) m.set(ix, 1, iz, C("#b89a50"));
    }
  group.add(meshAt(m, -HX, HYPO, -HZ, V));
  // the cage bars, thin iron rods
  {
    const zs: number[] = [];
    for (let z = -8.7; z <= 8.7; z += 0.16) if (!CAGE_Z.some((c) => Math.abs(Math.abs(z - c) - 2.75) < 0.3)) zs.push(z);
    const bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, HH - 0.5, 5), new THREE.MeshStandardMaterial({ color: "#2a2830", roughness: 0.45, metalness: 0.8 }), zs.length * 2);
    const mt = new THREE.Matrix4();
    let n = 0;
    for (const sx of [-1, 1]) for (const z of zs) bars.setMatrixAt(n++, mt.makeTranslation(sx * BARS, HYPO + (HH - 0.5) / 2 + 0.25, z));
    group.add(bars);
  }

  // ---- lifts and capstans ---------------------------------------------------------------------------
  const woodM = new THREE.MeshStandardMaterial({ color: "#6a4a30", roughness: 0.85 });
  const ropeM = new THREE.MeshStandardMaterial({ color: "#b09a6a", roughness: 0.9 });
  const ironM = new THREE.MeshStandardMaterial({ color: "#2a2830", roughness: 0.5, metalness: 0.7 });
  const frame: THREE.BufferGeometry[] = [];
  const rects: Rect[] = [];
  const capstans: THREE.Group[] = [];
  const platforms: THREE.Mesh[] = [];
  [...LIFTS, ...TRAPS].forEach(([lx, lz], i) => {
    for (const [dx, dz] of [
      [-0.85, -0.85],
      [0.85, -0.85],
      [-0.85, 0.85],
      [0.85, 0.85],
    ]) {
      frame.push(new THREE.BoxGeometry(0.16, HH, 0.16).translate(lx + dx, HYPO + HH / 2, lz + dz));
      rects.push([lx + dx - 0.12, lz + dz - 0.12, lx + dx + 0.12, lz + dz + 0.12]);
    }
    for (const y of [2.2, 4.4]) {
      frame.push(new THREE.BoxGeometry(1.86, 0.1, 0.1).translate(lx, HYPO + y, lz - 0.85), new THREE.BoxGeometry(1.86, 0.1, 0.1).translate(lx, HYPO + y, lz + 0.85));
      frame.push(new THREE.BoxGeometry(0.1, 0.1, 1.86).translate(lx + 0.85, HYPO + y, lz));
    }
    // the pulley beam and the ropes
    frame.push(new THREE.CylinderGeometry(0.14, 0.14, 0.4, 10).rotateZ(Math.PI / 2).translate(lx, HYPO + HH - 0.55, lz));
    const plat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 1.5), woodM);
    plat.position.set(lx, HYPO + 0.08, lz);
    group.add(plat);
    platforms.push(plat);
    // capstan beside it
    const cz = lz + (lz >= 0 ? 2.2 : -2.2) * (i < 2 ? 1 : -1);
    const cap = new THREE.Group();
    cap.position.set(lx, HYPO, cz);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.3, 12), woodM);
    drum.position.y = 0.65;
    cap.add(drum);
    const bars = new THREE.Group();
    for (let k = 0; k < 2; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.08), woodM);
      b.rotation.y = (k * Math.PI) / 2;
      bars.add(b);
    }
    bars.position.y = 1.05;
    cap.add(bars);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.3, 12), ropeM);
    rope.position.y = 0.5;
    cap.add(rope);
    group.add(cap);
    capstans.push(bars as unknown as THREE.Group);
    rects.push([lx - 0.4, cz - 0.4, lx + 0.4, cz + 0.4]);
    // a rope from the capstan up to the pulley
    const len = Math.abs(cz - lz);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(len, HH - 1.2), 5), ropeM);
    r.position.set(lx, HYPO + 0.6 + (HH - 1.2) / 2, (cz + lz) / 2);
    r.rotation.x = Math.atan2(len, HH - 1.2) * (cz > lz ? 1 : -1);
    group.add(r);
  });
  group.add(new THREE.Mesh(mergeGeometries(frame), woodM));

  // ---- light through the trapdoors -----------------------------------------------------------------
  const shaftMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff0c8"), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const shafts: THREE.Mesh[] = [];
  [...LIFTS, ...TRAPS].forEach(([lx, lz], i) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.5, HH, 1.5), shaftMat.clone());
    s.position.set(lx + 0.3, HYPO + HH / 2, lz);
    s.rotation.z = 0.08;
    s.raycast = () => {};
    s.visible = i >= 2;
    (s.material as THREE.MeshBasicMaterial).opacity = i >= 2 ? 0.05 : 0.12;
    group.add(s);
    shafts.push(s);
  });
  // the trapdoors seen from below (closed leaves)
  const under = new THREE.MeshStandardMaterial({ color: "#4e3826", roughness: 0.9 });
  const lids: THREE.Mesh[] = [];
  [...LIFTS, ...TRAPS].forEach(([lx, lz], i) => {
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.6), under);
    lid.position.set(lx, -0.06, lz);
    lid.visible = i >= 2 ? false : true;
    group.add(lid);
    lids.push(lid);
  });
  // the four plain trapdoors stand ajar: a little daylight
  TRAPS.forEach((_, k) => (lids[k + 2].visible = k % 2 === 0));

  // ---- torches ---------------------------------------------------------------------------------------
  const flames: THREE.Object3D[] = [];
  const lights: THREE.PointLight[] = [];
  const fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff8a2a").multiplyScalar(2.6), toneMapped: false });
  const fireCore = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffe08a").multiplyScalar(2.8), toneMapped: false });
  const bracket: THREE.BufferGeometry[] = [];
  const torchAt: [number, number, number][] = [];
  // (none on the west wall over the stair)
  for (const z of [-14, -8, 0, 8, 14]) for (const s of [-1, 1]) if (!(s < 0 && z > STAIR.z0)) torchAt.push([s * 1.72, z, -s]);
  for (const z of [-7, 7]) for (const s of [-1, 1]) torchAt.push([s * 6.24, z, -s]);
  for (const [x, z, dir] of torchAt) {
    bracket.push(new THREE.BoxGeometry(0.3, 0.06, 0.06).translate(x + dir * 0.15, HYPO + 2.3, z), new THREE.CylinderGeometry(0.05, 0.03, 0.5, 6).translate(x + dir * 0.3, HYPO + 2.45, z));
    const f = new THREE.Group();
    const o = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 6), fireMat);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), fireCore);
    o.position.y = 0.16;
    c2.position.y = 0.1;
    f.add(o, c2);
    f.position.set(x + dir * 0.3, HYPO + 2.7, z);
    f.userData.ph = x * 3 + z;
    group.add(f);
    flames.push(f);
  }
  group.add(new THREE.Mesh(mergeGeometries(bracket), ironM));
  for (const [x, z] of [
    [0, -10],
    [0, 6],
    [-4.5, -4],
    [4.5, 4],
    [-8.4, -3],
    [8.4, 3],
  ]) {
    const l = new THREE.PointLight("#ff9a48", 16, 14, 1.5);
    l.position.set(x, HYPO + 2.8, z);
    group.add(l);
    lights.push(l);
  }

  // ---- the beasts ---------------------------------------------------------------------------------------
  type Beast = { name: string; build: () => VoxelModel; x: number; z: number };
  const beasts: Beast[] = [
    { name: "Lion", build: () => quadruped({ len: 20, h: 11, body: "#c89a52", belly: "#d8b070", mane: "#7a4a22", tail: "#7a4a22" }), x: -10.3, z: -6 },
    { name: "Tiger", build: () => quadruped({ len: 22, h: 10, body: "#d8822a", belly: "#ece0c8", stripes: "#2a1e16", tail: "#d8822a" }), x: -10.3, z: 0 },
    { name: "Bear", build: () => quadruped({ len: 20, h: 13, body: "#4a3020", belly: "#3e2818", ears: true }), x: -10.3, z: 6 },
    { name: "Lioness", build: () => quadruped({ len: 19, h: 10, body: "#c8a062", belly: "#dcbc84", tail: "#9a6a32" }), x: 10.3, z: -6 },
    { name: "Wolves", build: () => quadruped({ len: 15, h: 8, body: "#7a7a80", belly: "#a8a8ae", ears: true, tail: "#6a6a70" }), x: 10.3, z: 0 },
    { name: "Boar", build: () => quadruped({ len: 15, h: 8, body: "#4a3a30", belly: "#3a2e26", tusks: true }), x: 10.3, z: 6 },
  ];
  const pickables: THREE.Object3D[] = [];
  const picks = new Map<THREE.Object3D, () => PickInfo>();
  const hovers = new Map<THREE.Object3D, string>();
  const pacers: { o: THREE.Object3D; x: number; z: number; ph: number }[] = [];
  beasts.forEach((b, i) => {
    const o = place(group, `colosseum-beast-${b.name}`, b.build, b.x, HYPO + 0.25, b.z, 0);
    pacers.push({ o, x: b.x, z: b.z, ph: i * 1.3 });
    if (b.name === "Wolves") pacers.push({ o: place(group, `colosseum-beast-${b.name}`, b.build, b.x - 0.6, HYPO + 0.25, b.z + 1, 0), x: b.x - 0.6, z: b.z + 0.6, ph: 4 });
    o.traverse((c) => {
      pickables.push(c);
      hovers.set(c, `<b>${b.name}</b><span>cage ${i + 1}</span>`);
      picks.set(c, () => ({ eyebrow: "Hypogeum · cage " + (i + 1), title: b.name, stats: [["Lift", b.z < 0 ? "North" : b.z > 0 ? "South" : "Centre"], ["Side", b.x < 0 ? "West" : "East"]] }));
    });
  });

  // ---- the armoury: weapon racks, shields, helmets at the far end -------------------------------------
  place(group, "colosseum-rack", rack, -1.45, HYPO, -16.5, Math.PI / 2);
  place(group, "colosseum-rack", rack, 1.45, HYPO, -16.5, -Math.PI / 2);
  place(group, "colosseum-rack2", shieldRack, 0, HYPO, -17.6, 0);
  rects.push([-1.75, -17.7, -1.1, -15.4], [1.1, -17.7, 1.75, -15.4], [-1.2, -18.2, 1.2, -17.2]);
  // the stair (walked: see STAIR); a click on its foot says where it goes
  const stairHit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
  stairHit.position.set((STAIR.x0 + STAIR.x1) / 2, HYPO + 1.1, STAIR.z1 + 0.1);
  group.add(stairHit);
  pickables.push(stairHit);
  hovers.set(stairHit, "<b>Stairs ▲ Arena</b><span>up to the sand, by the Porta Triumphalis</span>");
  picks.set(stairHit, () => ({ eyebrow: "Stairs", title: "▲ Arena", stats: [["Steps", "24"], ["Rise", "6 m"]] }));
  // the gladiator lifts take you up too
  platforms.slice(0, 2).forEach((p) => {
    pickables.push(p);
    hovers.set(p, "<b>Lift ▲ Arena</b><span>the trapdoor</span>");
    picks.set(p, () => ({ eyebrow: "Lift", title: "▲ Arena", floor: 0 }));
  });

  // ---- people: waiting gladiators, the lanista, lift workers ---------------------------------------
  const people: Snark[] = [];
  const who: [number, number, number, string, number][] = [
    [4021, -0.8, -14.2, "Gladiator", 1],
    [5150, 0.9, -13.6, "Gladiator", -1],
    [6303, 0.2, -11.5, "Lanista", 0],
    [7404, 3.2, 2.2, "Lift worker", 1],
    [8505, -3.2, -2.2, "Lift worker", -1],
    [9606, 7.6, -6, "Beast keeper", 1],
  ];
  for (const [id, x, z, role, f] of who)
    void loadArt(id)
      .then((art) => {
        const s = new Snark(id, art);
        s.noClip = true;
        s.state = "resident";
        s.role = role;
        s.root.position.set(x, HYPO, z);
        s.faceDir = new THREE.Vector3(f || 0.3, 0, f ? 0 : 1);
        if (role === "Gladiator") s.visual.add(kit(f > 0 ? 0 : 1));
        group.add(s.root);
        people.push(s);
      })
      .catch(() => {});

  // ---- colliders: the walls, from the voxels at waist height ---------------------------------------------
  {
    const y = Math.round(1 / V);
    const runs = new Map<string, Rect>();
    let prev = new Map<string, Rect>();
    for (let iz = 0; iz < D; iz++) {
      const cur = new Map<string, Rect>();
      let ix = 0;
      // the stair is walked (its flight's own walls): not a wall here
      const solid = (i: number) => !!m.get(i, y, iz) && !(X(i) > STAIR.wall && X(i) < STAIR.x1 && Z(iz) > STAIR.z0 && Z(iz) < STAIR.z1);
      while (ix < W) {
        // the cage bars are see-through but solid
        if (!solid(ix)) {
          ix++;
          continue;
        }
        let jx = ix;
        while (jx < W && solid(jx)) jx++;
        const key = `${ix}:${jx}`;
        const p = prev.get(key);
        const r: Rect = p ? p : [X(ix) - V / 2, Z(iz) - V / 2, X(jx - 1) + V / 2, 0];
        r[3] = Z(iz) + V / 2;
        cur.set(key, r);
        if (!p) runs.set(`${key}@${iz}`, r);
        ix = jx;
      }
      prev = cur;
    }
    for (const r of runs.values()) rects.push(r);
  }

  for (const sx of [-1, 1]) rects.push([sx * BARS - 0.12, -8.8, sx * BARS + 0.12, 8.8]);
  let capAngle = 0;
  const lastLift = [HYPO, HYPO];
  return {
    group,
    rects,
    flames,
    lights,
    people,
    pickables,
    pick: (o) => picks.get(o)?.() ?? null,
    hover: (o) => hovers.get(o) ?? null,
    update(dt, t, lift, hatch) {
      for (const i of [0, 1]) {
        platforms[i].position.y = lift[i] - 0.08;
        lids[i].visible = hatch[i] < 0.05;
        shafts[i].visible = hatch[i] > 0.05;
        (shafts[i].material as THREE.MeshBasicMaterial).opacity = 0.14 * hatch[i];
        const moving = Math.abs(lift[i] - lastLift[i]) > 1e-4;
        lastLift[i] = lift[i];
        if (moving) capAngle += dt * 1.6;
      }
      capstans.forEach((c, i) => (c.rotation.y = i < 2 ? capAngle : capAngle * 0.1 + i));
      for (const p of pacers) {
        const k = Math.sin(t * 0.35 + p.ph);
        p.o.position.z = p.z + k * 1.4;
        p.o.rotation.y = Math.cos(t * 0.35 + p.ph) > 0 ? 0 : Math.PI;
        p.o.position.x = p.x;
      }
    },
  };
}

// ---- voxel models (12 a metre, facing +z) ---------------------------------------------------------------
function quadruped(o: { len: number; h: number; body: string; belly: string; mane?: string; stripes?: string; tail?: string; ears?: boolean; tusks?: boolean }) {
  const L = o.len,
    Hh = o.h;
  const w = Math.round(L * 0.4);
  const v = new VoxelModel(w + 4, Hh + 8, L + 10);
  const body = C(o.body),
    belly = C(o.belly);
  const legH = Math.round(Hh * 0.45);
  const bx0 = 2,
    bx1 = w + 2;
  // legs
  for (const lz of [3, L - 2]) for (const lx of [bx0, bx1 - 3]) v.box(lx, 0, lz, lx + 3, legH, lz + 3, body);
  // body
  v.box(bx0, legH, 2, bx1, Hh, L + 1, (x, y, z) => (o.stripes && (z + (y >> 1)) % 5 === 0 ? C(o.stripes) : y < legH + 2 ? belly : body));
  // head and muzzle
  const hz = L + 1;
  v.box(bx0 + 1, Hh - 3, hz, bx1 - 1, Hh + 3, hz + 6, body);
  v.box(bx0 + 3, Hh - 3, hz + 6, bx1 - 3, Hh, hz + 8, belly);
  v.set(bx0 + 3, Hh + 1, hz + 6, C("#101010"));
  v.set(bx1 - 4, Hh + 1, hz + 6, C("#101010"));
  if (o.mane) v.box(bx0 - 1, Hh - 5, hz - 2, bx1 + 1, Hh + 5, hz + 2, C(o.mane));
  if (o.ears) for (const ex of [bx0 + 1, bx1 - 2]) v.box(ex, Hh + 3, hz + 1, ex + 1, Hh + 5, hz + 3, body);
  if (o.tusks) for (const ex of [bx0 + 2, bx1 - 3]) v.box(ex, Hh - 2, hz + 7, ex + 1, Hh, hz + 9, C("#ece4cc"));
  if (o.tail) for (let i = 0; i < 6; i++) v.set(Math.round((bx0 + bx1) / 2), Hh - 1 - (i >> 1), 1 - Math.min(1, i), C(o.tail));
  void E;
  return v;
}

function rack() {
  const v = new VoxelModel(30, 26, 6);
  const wood = C("#5a3e28"),
    steel = C("#c8ccd4"),
    gold = C("#d4a830");
  v.box(0, 0, 0, 2, 26, 4, wood);
  v.box(28, 0, 0, 30, 26, 4, wood);
  v.box(0, 8, 0, 30, 9, 4, wood);
  v.box(0, 20, 0, 30, 21, 4, wood);
  // swords and tridents standing in the rack
  for (let x = 4; x < 26; x += 3) {
    const tri = x % 2 === 0;
    v.box(x, 1, 2, x + 1, tri ? 25 : 16, 3, tri ? C("#7a5a3a") : steel);
    if (tri) v.box(x - 1, 22, 2, x + 2, 23, 3, steel);
    else v.box(x - 1, 5, 2, x + 2, 6, 3, gold);
  }
  return v;
}
function shieldRack() {
  const v = new VoxelModel(28, 20, 5);
  v.box(0, 0, 0, 28, 2, 5, C("#5a3e28"));
  for (let k = 0; k < 4; k++) {
    const x = 1 + k * 7;
    const gold = k % 2 === 0;
    v.box(x, 2, 1, x + 6, 16, 3, C(gold ? "#7a1e22" : "#9aa0ae"));
    v.box(x, 2, 1, x + 6, 3, 3, C(gold ? "#f4b728" : "#dfe3ea"));
    v.box(x, 15, 1, x + 6, 16, 3, C(gold ? "#f4b728" : "#dfe3ea"));
    v.box(x + 2, 8, 3, x + 4, 10, 4, C(gold ? "#f4b728" : "#dfe3ea"));
  }
  // helmets on top
  for (let k = 0; k < 4; k++) v.box(2 + k * 7, 16, 1, 6 + k * 7, 19, 4, C(k % 2 ? "#c8ccd4" : "#d4a830"));
  return v;
}
