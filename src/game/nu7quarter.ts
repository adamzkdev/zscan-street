import * as THREE from "three";
import { CURB, NU7Q } from "../scene/city/plan";
import { C, E, G, VOX, VoxelModel, hash } from "../scene/voxel/model";
import { toObject } from "../scene/voxel/mesher";
import { geos, merge, type Geos } from "./design";
import type { GameHud } from "./ui";
import { Crane, canvasTex, dispose, latticeMat, meshes, net, worker } from "./works";

/** Work began on the quarter: the percentage runs from here to NU7. */
const START = Date.parse("2026-10-01T00:00:00Z");
/** NU7's announced date, until the API answers. */
const FALLBACK_DATE = "2026-11-05";
const BLOCK_MS = 75_000;
const SEEN = "street.nu7q";
const FLOORS = 36;
/** Voxels a floor, and the tower's plan (voxels a side). */
const FH = 20;
const N = 96;
const MID = N / 2;
const FLOOR_M = FH * VOX;
const VIOLET = "#b07bff";
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export interface Nu7State {
  date: string | null;
  height: number | null;
  activated: boolean;
  tip: number | null;
}
export interface Nu7QuarterHooks {
  go(x: number, z: number, zoom?: number): void;
  nu7(): Nu7State;
}

// ---- the NU7 Tower ----

const PAL = {
  fin: C("#d9a63a"),
  slab: C("#2a2838"),
  glass: G("#5b45b0"),
  lit: E("#ffe3a3", 1.6),
  neon: E(VIOLET, 2.4),
  gold: E("#f4b728", 2.2),
  door: G("#1c2433"),
  concrete: C("#9a958c"),
};

/** Half the tower's side (voxels) at floor `f`: it steps back three times on the way up. */
function halfAt(f: number) {
  const t = f / FLOORS;
  return t < 0.45 ? 46 : t < 0.72 ? 40 : t < 0.9 ? 34 : 28;
}
/** Inside the floor plan: a square with its corners cut (the violet neon runs up the cuts). */
function inFoot(h: number, x: number, z: number) {
  const lx = Math.abs(x + 0.5 - MID),
    lz = Math.abs(z + 0.5 - MID);
  return lx <= h && lz <= h && lx + lz <= h * 1.62;
}

function floorModel(f: number) {
  const m = new VoxelModel(N, FH, N);
  const h = halfAt(f);
  const ledge = f + 1 < FLOORS && halfAt(f + 1) < h;
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      if (!inFoot(h, x, z)) continue;
      const ex = !inFoot(h, x - 1, z) || !inFoot(h, x + 1, z);
      const ez = !inFoot(h, x, z - 1) || !inFoot(h, x, z + 1);
      if (!ex && !ez) {
        m.box(x, 0, z, x + 1, FH, z + 1, PAL.slab);
        continue;
      }
      const cut = Math.abs(x + 0.5 - MID) + Math.abs(z + 0.5 - MID) > h * 1.62 - 1.5;
      const col = ez ? x : z;
      const side = ez ? (z < MID ? 0 : 1) : x < MID ? 2 : 3;
      for (let y = 0; y < FH; y++) {
        let c: number;
        if (y < 2) c = PAL.slab;
        else if (cut) c = y >= 3 && y <= 17 ? PAL.neon : PAL.fin;
        else if (col % 6 === 0) c = PAL.fin;
        else if (y > 3 && y < 17) c = hash(Math.floor(col / 6), f, side, 7) < 0.3 ? PAL.lit : PAL.glass;
        else c = PAL.slab;
        if (ledge && y === FH - 1) c = PAL.gold;
        m.set(x, y, z, c);
      }
    }
  // the lobby: a tall glass door on the front (south) and a gold canopy over it
  if (f === 0) {
    const front = MID + h - 1;
    m.box(MID - 7, 2, front, MID + 7, 15, front + 1, PAL.door);
    m.box(MID - 11, 15, front - 1, MID + 11, 17, N, PAL.gold);
  }
  return m;
}

/** The crown: three gold tiers banded in violet neon, then the spire. */
function crownModel() {
  const m = new VoxelModel(N, 130, N);
  for (let t = 0; t < 3; t++) {
    const h = 25 - t * 6;
    const y0 = t * 10;
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        if (!inFoot(h, x, z)) continue;
        const edge = !inFoot(h, x - 1, z) || !inFoot(h, x + 1, z) || !inFoot(h, x, z - 1) || !inFoot(h, x, z + 1);
        for (let y = y0; y < y0 + 10; y++) m.set(x, y, z, !edge ? PAL.slab : y === y0 + 8 ? PAL.neon : (x + z) % 4 === 0 ? PAL.fin : PAL.glass);
      }
  }
  m.cylinder(MID, 30, MID, 3.2, 24, PAL.fin);
  m.cylinder(MID, 54, MID, 1.6, 64, PAL.fin);
  for (const y of [62, 78, 94]) m.cylinder(MID, y, MID, 3, 1, PAL.gold);
  m.box(MID - 1, 118, MID - 1, MID + 1, 126, MID + 1, PAL.neon);
  return m;
}

/** The floor going up: bare slab and columns. */
function frameModel(f: number) {
  const m = new VoxelModel(N, FH, N);
  const h = halfAt(f);
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      if (!inFoot(h, x, z)) continue;
      m.set(x, 0, z, PAL.concrete);
      m.set(x, 1, z, PAL.concrete);
      if ((x - MID) % 12 === 0 && (z - MID) % 12 === 0) m.box(x, 2, z, x + 2, FH, z + 2, PAL.concrete);
    }
  return m;
}

function neonText(text: string, w: number, h: number, hex: string, size: number) {
  const tex = canvasTex(w, h, (g) => {
    g.font = `400 ${size}px 'DotGothic16', monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = hex;
    g.shadowBlur = size / 4;
    g.fillStyle = "#ffffff";
    g.fillText(text, w / 2, h / 2 + 2);
    g.shadowBlur = 0;
    g.fillStyle = hex;
    g.globalAlpha = 0.35;
    g.fillText(text, w / 2, h / 2 + 2);
  });
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, color: new THREE.Color(1.8, 1.8, 1.8), depthWrite: false });
}

class Tower {
  readonly group = new THREE.Group();
  private floors: Geos[] = [];
  private crownG: Geos | null = null;
  private building: THREE.Group | null = null;
  private shown = "";
  private frame: THREE.Object3D | null = null;
  private frameAt = -1;
  private nets: THREE.Group | null = null;
  private netsAt = -1;
  private crane: Crane | null = null;
  private hoist: THREE.Group;
  private cab: THREE.Mesh;
  private crew: { obj: THREE.Object3D; to: THREE.Vector3; wait: number }[] = [];
  private pctSign: THREE.Group | null = null;
  private pctKey = "";
  private names: THREE.Group | null = null;
  built = 0;
  done = false;
  frac = 0;

  constructor(parent: THREE.Object3D) {
    const T = NU7Q.tower;
    this.group.position.set(T.x, CURB, T.z);
    parent.add(this.group);
    // the builders' lift up the east face
    this.hoist = new THREE.Group();
    this.hoist.position.set(halfAt(0) * VOX + 0.7, 0, 2);
    this.cab = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 1.2), new THREE.MeshStandardMaterial({ color: "#f4b728", roughness: 0.6 }));
    this.hoist.add(this.cab);
    this.group.add(this.hoist);
  }

  get topY() {
    return this.built * FLOOR_M;
  }

  /** Meshes one more floor (or the crown) if one is missing; true when it did. */
  mesh() {
    if (this.floors.length < this.built) {
      this.floors.push(geos(floorModel(this.floors.length), this.floors.length * FLOOR_M));
      return true;
    }
    if (this.done && !this.crownG) {
      this.crownG = geos(crownModel(), FLOORS * FLOOR_M);
      return true;
    }
    return false;
  }

  set(p: number, done: boolean) {
    this.done = done;
    const f = done ? FLOORS : Math.min(FLOORS - 1, p * FLOORS);
    this.built = Math.floor(f);
    this.frac = f - this.built;
  }

  update(dt: number, pct: number) {
    const key = `${this.built}:${this.done}`;
    if (key !== this.shown && this.floors.length >= this.built && (!this.done || this.crownG)) {
      dispose(this.building);
      const parts = this.floors.slice(0, this.built);
      if (this.done && this.crownG) parts.push(this.crownG);
      this.building = parts.length ? meshes(merge(parts)) : null;
      if (this.building) this.group.add(this.building);
      this.shown = key;
      if (this.done) this.makeNames();
    }
    if (this.done) {
      for (const o of [this.frame, this.nets, this.pctSign, this.hoist]) dispose(o);
      if (this.crane) dispose(this.crane.root);
      for (const w of this.crew) w.obj.parent?.remove(w.obj);
      this.frame = this.nets = this.pctSign = null;
      this.crane = null;
      this.crew = [];
      return;
    }
    const top = this.topY;
    if (this.frameAt !== this.built) {
      dispose(this.frame);
      this.frame = toObject(frameModel(this.built));
      this.frame.position.y = top;
      this.group.add(this.frame);
      this.frameAt = this.built;
    }
    this.frame!.scale.y = Math.max(0.12, this.frac);
    if (this.netsAt !== this.built) this.makeNets();
    // the crane climbs with the tower
    if (!this.crane || this.crane.top < top + 8) {
      if (this.crane) dispose(this.crane.root);
      this.crane = new Crane(new THREE.Vector3(-halfAt(0) * VOX - 1.6, 0, -3), top + 18, "#9a958c");
      this.group.add(this.crane.root);
    }
    this.crane.update(dt, top, true);
    // the lift runs between the street and the top floor
    const mast = this.hoist.children.find((c) => c.userData.mast) as THREE.Mesh | undefined;
    if (!mast || mast.userData.h !== top) {
      if (mast) dispose(mast);
      const h = Math.max(2, top + 2);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), latticeMat(1, h / 0.7));
      m.position.y = h / 2;
      m.userData.mast = true;
      m.userData.h = top;
      this.hoist.add(m);
    }
    this.cab.position.set(0.85, 0.8 + (0.5 - 0.5 * Math.cos(performance.now() / 9000)) * top, 0);
    this.updateCrew(dt);
    if (`${pct}:${this.built}` !== this.pctKey) this.makePct(pct);
  }

  private makeNets() {
    dispose(this.nets);
    const g = new THREE.Group();
    const hw = halfAt(this.built) * VOX + 0.35;
    const h = FLOOR_M * 1.6;
    for (const [x, z, ry] of [
      [0, hw, 0],
      [0, -hw, 0],
      [hw, 0, Math.PI / 2],
      [-hw, 0, Math.PI / 2],
    ]) {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, h), net);
      n.position.set(x, this.topY + h / 2 - FLOOR_M * 0.4, z);
      n.rotation.y = ry;
      g.add(n);
    }
    this.group.add(g);
    this.nets = g;
    this.netsAt = this.built;
    if (!this.crew.length)
      for (let i = 0; i < 6; i++) {
        const obj = worker();
        this.group.add(obj);
        this.crew.push({ obj, to: new THREE.Vector3(), wait: rand(0, 2) });
      }
    for (const w of this.crew) w.obj.position.set(rand(-1, 1) * (hw - 1.2), this.topY + 0.34, rand(-1, 1) * (hw - 1.2));
  }

  private updateCrew(dt: number) {
    const r = halfAt(this.built) * VOX - 1.2;
    const y = this.topY + 0.34;
    const t = performance.now() / 1000;
    this.crew.forEach((w, i) => {
      const o = w.obj;
      o.position.y = y;
      if ((w.wait -= dt) > 0) return void (o.position.y += Math.abs(Math.sin(t * 14 + i * 2)) * 0.05);
      const dx = w.to.x - o.position.x,
        dz = w.to.z - o.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.1) {
        w.to.set(rand(-r, r), y, rand(-r, r));
        w.wait = rand(1.5, 5);
        return;
      }
      const step = Math.min(d, dt * 0.9);
      o.position.x += (dx / d) * step;
      o.position.z += (dz / d) * step;
      o.rotation.y = Math.atan2(dx, dz);
      o.position.y += Math.abs(Math.sin(t * 9 + i)) * 0.04;
    });
  }

  /** "NU7 · 23%" in violet neon over the floor going up, seen from all over the city. */
  private makePct(pct: number) {
    this.pctKey = `${pct}:${this.built}`;
    if (this.pctSign) {
      ((this.pctSign.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).map?.dispose();
      dispose(this.pctSign);
    }
    const mat = neonText(`NU7  ${pct}%`, 1024, 220, VIOLET, 170);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.8), mat);
    s.position.set(0, this.topY + FLOOR_M + 2.4, halfAt(this.built) * VOX + 0.2);
    const back = s.clone();
    back.rotation.y = Math.PI;
    back.position.z = -s.position.z;
    const g = new THREE.Group();
    g.add(s, back);
    this.group.add(g);
    this.pctSign = g;
  }

  /** NU7 in neon on all four faces of the crown, once it is finished. */
  private makeNames() {
    if (this.names) return;
    const mat = neonText("NU7", 512, 220, VIOLET, 190);
    const g = new THREE.Group();
    const hw = 25 * VOX + 0.08;
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(7, 3), mat);
      const a = (k * Math.PI) / 2;
      s.position.set(Math.sin(a) * hw, FLOORS * FLOOR_M + 0.8 + 0.6, Math.cos(a) * hw);
      s.rotation.y = a;
      g.add(s);
    }
    this.group.add(g);
    this.names = g;
  }
}

// ---- the NU7 Grand Prix karting ----

const K = NU7Q.kart;
/** The circuit's line (metres into the lot): a long straight past the stands, hairpins behind. */
const LINE = [
  [10, 54],
  [30, 55],
  [46, 52],
  [49, 42],
  [42, 34],
  [30, 33],
  [24, 26],
  [30, 18],
  [44, 16],
  [48, 9],
  [40, 6],
  [16, 7],
  [8, 14],
  [9, 30],
  [16, 38],
  [12, 46],
];
const SAMPLES = 520;
const TRACK_W = 5.6;

class Karting {
  readonly group = new THREE.Group();
  private P: THREE.Vector3[] = [];
  private T: THREE.Vector3[] = [];
  private asphalt: THREE.Mesh;
  private kerbs: THREE.Mesh;
  private kerbCum: number[] = [];
  private cones: THREE.InstancedMesh;
  private coneAt: number[] = [];
  private tyres: THREE.InstancedMesh;
  private ground: THREE.Mesh;
  private checker: THREE.Mesh;
  private stands: THREE.Group;
  private roof: THREE.Mesh;
  private gantry: THREE.Group;
  private roller: THREE.Object3D;
  private tar: THREE.Object3D;
  private karts: { obj: THREE.Object3D; s: number; v: number; lane: number }[] = [];
  private banner: THREE.Mesh;
  private bannerKey = "";
  private t = 0;

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    const W = K.x1 - K.x0;
    const D = K.z1 - K.z0;
    const pts = LINE.map(([u, v]) => new THREE.Vector3(K.x0 + u, 0, K.z0 + 5 + ((v - 6) * 45) / 49));
    const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
    const all = curve.getSpacedPoints(SAMPLES);
    // the start line is on the straight in front of the stands: the asphalt is laid from there
    let s0 = 0;
    all.forEach((p, i) => {
      if (Math.hypot(p.x - (K.x0 + 24), p.z - (K.z0 + 49.5)) < Math.hypot(all[s0].x - (K.x0 + 24), all[s0].z - (K.z0 + 49.5))) s0 = i;
    });
    for (let i = 0; i < SAMPLES; i++) this.P.push(all[(s0 + i) % SAMPLES]);
    for (let i = 0; i < SAMPLES; i++) this.T.push(this.P[(i + 1) % SAMPLES].clone().sub(this.P[(i + SAMPLES - 1) % SAMPLES]).normalize());
    const y0 = CURB;
    // the ground: dirt while the earthworks run, grass once the circuit takes shape
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: "#8b6b4a", roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set((K.x0 + K.x1) / 2, y0 + 0.012, (K.z0 + K.z1) / 2);
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
    // asphalt: a ribbon along the line, drawn as far as it is laid
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const p = this.P[i % SAMPLES],
        t = this.T[i % SAMPLES];
      pos.push(p.x - t.z * (TRACK_W / 2), y0 + 0.03, p.z + t.x * (TRACK_W / 2), p.x + t.z * (TRACK_W / 2), y0 + 0.03, p.z - t.x * (TRACK_W / 2));
      if (i < SAMPLES) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    ag.setIndex(idx);
    ag.computeVertexNormals();
    this.asphalt = new THREE.Mesh(ag, new THREE.MeshStandardMaterial({ color: "#34333b", roughness: 0.95, side: THREE.DoubleSide }));
    this.asphalt.receiveShadow = true;
    this.group.add(this.asphalt);
    // kerbs on the corners, red and white, on the outside of each bend
    const turn = (i: number) => {
      const a = this.T[(i + SAMPLES - 3) % SAMPLES],
        b = this.T[(i + 3) % SAMPLES];
      return a.x * b.z - a.z * b.x;
    };
    const kp: number[] = [];
    const kc: number[] = [];
    const red = new THREE.Color("#d8303a"),
      white = new THREE.Color("#f2f2f2");
    for (let i = 0; i < SAMPLES; i++) {
      const tr = turn(i);
      if (Math.abs(tr) > 0.045) {
        const p = this.P[i],
          q = this.P[(i + 1) % SAMPLES],
          t = this.T[i],
          u = this.T[(i + 1) % SAMPLES];
        for (const side of [-1, 1]) {
          const a0 = TRACK_W / 2,
            a1 = TRACK_W / 2 + 0.75;
          const c = Math.floor(i / 2) % 2 ? red : white;
          const v = (pp: THREE.Vector3, tt: THREE.Vector3, o: number) => [pp.x - tt.z * o * side, y0 + 0.045, pp.z + tt.x * o * side];
          const quad = [v(p, t, a0), v(p, t, a1), v(q, u, a0), v(p, t, a1), v(q, u, a1), v(q, u, a0)];
          for (const vv of quad) kp.push(...vv), kc.push(c.r, c.g, c.b);
        }
      }
      this.kerbCum.push(kp.length / 3);
    }
    const kg = new THREE.BufferGeometry();
    kg.setAttribute("position", new THREE.Float32BufferAttribute(kp, 3));
    kg.setAttribute("color", new THREE.Float32BufferAttribute(kc, 3));
    this.kerbs = new THREE.Mesh(kg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
    this.group.add(this.kerbs);
    // the surveyors' cones along the line still to lay (the furthest first, so a count hides the laid ones)
    const coneGeo = new THREE.ConeGeometry(0.2, 0.5, 8);
    coneGeo.translate(0, 0.25, 0);
    const spots: number[] = [];
    for (let i = SAMPLES - 4; i > 0; i -= 7) spots.push(i);
    this.cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshStandardMaterial({ color: "#ff7a1a", roughness: 0.6 }), spots.length * 2);
    const m = new THREE.Matrix4();
    let n = 0;
    for (const i of spots)
      for (const side of [-1, 1]) {
        const p = this.P[i],
          t = this.T[i];
        m.makeTranslation(p.x - t.z * (TRACK_W / 2) * side, y0, p.z + t.x * (TRACK_W / 2) * side);
        this.cones.setMatrixAt(n++, m);
        this.coneAt.push(i);
      }
    this.group.add(this.cones);
    // tyre walls on the outside of the bends
    const tyreSpots: THREE.Matrix4[] = [];
    for (let i = 0; i < SAMPLES; i += 3) {
      const tr = turn(i);
      if (Math.abs(tr) < 0.06) continue;
      const p = this.P[i],
        t = this.T[i];
      const side = tr > 0 ? 1 : -1;
      const o = TRACK_W / 2 + 1.9;
      const x = p.x + t.z * o * side,
        z = p.z - t.x * o * side;
      if (x < K.x0 + 0.6 || x > K.x1 - 0.6 || z < K.z0 + 0.6 || z > K.z1 - 0.6) continue;
      tyreSpots.push(new THREE.Matrix4().makeTranslation(x, y0, z));
    }
    const tyreGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.75, 10);
    tyreGeo.translate(0, 0.375, 0);
    this.tyres = new THREE.InstancedMesh(tyreGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }), tyreSpots.length);
    const tc = new THREE.Color();
    tyreSpots.forEach((mm, i) => {
      this.tyres.setMatrixAt(i, mm);
      this.tyres.setColorAt(i, tc.set(i % 4 === 0 ? "#d8303a" : i % 4 === 2 ? "#f2f2f2" : "#1e1e24"));
    });
    this.tyres.castShadow = true;
    this.group.add(this.tyres);
    // the start line
    const chk = canvasTex(64, 16, (g) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) (g.fillStyle = (x + y) % 2 ? "#111" : "#f2f2f2"), g.fillRect(x * 4, y * 4, 4, 4);
    });
    chk.magFilter = THREE.NearestFilter;
    this.checker = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W, 1), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.8 }));
    this.checker.rotation.set(-Math.PI / 2, 0, Math.atan2(this.T[0].x, this.T[0].z));
    this.checker.position.set(this.P[0].x, y0 + 0.05, this.P[0].z);
    this.group.add(this.checker);
    this.stands = this.makeStands();
    this.roof = this.stands.getObjectByName("roof") as THREE.Mesh;
    this.gantry = this.makeGantry();
    this.roller = this.machine("#f4b728", true);
    this.tar = this.machine("#ff7a1a", false);
    this.group.add(this.roller, this.tar);
    this.makeFence();
    this.banner = new THREE.Mesh(new THREE.PlaneGeometry(22, 1.7), new THREE.MeshBasicMaterial());
    this.banner.position.set((K.x0 + K.x1) / 2, y0 + 1.15, K.z1 + 0.06);
    this.group.add(this.banner);
  }

  private makeStands() {
    const g = new THREE.Group();
    const x0 = K.x0 + 13,
      x1 = K.x0 + 43;
    const z0 = K.z0 + 54.2;
    const concrete = new THREE.MeshStandardMaterial({ color: "#8a8790", roughness: 0.9 });
    const seats = [new THREE.MeshStandardMaterial({ color: VIOLET, roughness: 0.7 }), new THREE.MeshStandardMaterial({ color: "#f4b728", roughness: 0.7 })];
    for (let k = 0; k < 5; k++) {
      const tier = new THREE.Group();
      const step = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.6 + k * 0.6, 1.4), concrete);
      step.position.set((x0 + x1) / 2, CURB + (0.6 + k * 0.6) / 2, z0 + 0.7 + k * 1.4);
      const row = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 0.6, 0.3, 0.5), seats[k % 2]);
      row.position.set((x0 + x1) / 2, CURB + 0.6 + k * 0.6 + 0.15, z0 + 0.5 + k * 1.4);
      step.castShadow = row.castShadow = true;
      tier.add(step, row);
      tier.name = `tier${k}`;
      g.add(tier);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 1, 0.25, 7.6), new THREE.MeshStandardMaterial({ color: "#2a2838", roughness: 0.6 }));
    roof.position.set((x0 + x1) / 2, CURB + 6.2, z0 + 3.6);
    roof.name = "roof";
    roof.castShadow = true;
    for (let x = x0 + 1; x <= x1 - 1; x += 7) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 6.2, 0.25), concrete);
      post.position.set(x, CURB + 3.1, z0 + 7);
      roof.add(post);
      post.position.sub(roof.position);
    }
    g.add(roof);
    this.group.add(g);
    return g;
  }

  private makeGantry() {
    const g = new THREE.Group();
    const p = this.P[0],
      t = this.T[0];
    const steelMat = new THREE.MeshStandardMaterial({ color: "#2a2838", roughness: 0.5, metalness: 0.4 });
    const span = TRACK_W + 1.6;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.6, 0.35), steelMat);
      post.position.set((span / 2) * side, 2.3, 0);
      g.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 1.1, 0.4), steelMat);
    beam.position.y = 4.4;
    const lights = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.25), toneMapped: false });
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1), lights);
      l.position.set((k - 2) * 0.7, 4.4, 0.25);
      g.add(l);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(span, 1.1), neonText("NU7 GRAND PRIX", 1024, 160, VIOLET, 96));
    sign.position.set(0, 5.5, 0.05);
    const back = sign.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.05;
    g.add(beam, sign, back);
    g.position.set(p.x, CURB, p.z);
    g.rotation.y = Math.atan2(t.x, t.z) + Math.PI / 2;
    this.group.add(g);
    return g;
  }

  /** A road roller (drum in front) or a tar sprayer. */
  private machine(hex: string, drum: boolean) {
    const m = new VoxelModel(18, 14, 11);
    if (drum) {
      m.box(12, 0, 0, 18, 7, 11, C("#6a6a72"));
      m.box(0, 2, 1, 12, 8, 10, C(hex));
      m.box(1, 0, 1, 5, 3, 3, C("#1e1e24"));
      m.box(1, 0, 8, 5, 3, 10, C("#1e1e24"));
      m.box(3, 8, 2, 9, 13, 9, G("#9fd8ff"));
      m.box(2, 13, 1, 10, 14, 10, C(hex));
    } else {
      m.box(0, 2, 1, 18, 4, 10, C("#2a2838"));
      m.box(0, 4, 2, 11, 10, 9, C(hex));
      m.box(12, 4, 1, 18, 11, 10, C(hex));
      m.box(13, 7, 1, 18, 10, 10, G("#9fd8ff"));
      for (const x of [2, 13]) for (const z of [0, 9]) m.box(x, 0, z, x + 3, 3, z + 2, C("#1e1e24"));
    }
    return toObject(m);
  }

  private makeFence() {
    const tex = canvasTex(32, 32, (g) => {
      g.strokeStyle = "#c9ccd2";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(32, 32);
      g.moveTo(32, 0);
      g.lineTo(0, 32);
      g.stroke();
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mk = (len: number) => {
      const t = tex.clone();
      t.repeat.set(len / 0.6, 2.2 / 0.6);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 });
    };
    const W = K.x1 - K.x0,
      D = K.z1 - K.z0;
    for (const [x, z, len, ry] of [
      [(K.x0 + K.x1) / 2, K.z0, W, 0],
      [(K.x0 + K.x1) / 2, K.z1, W, 0],
      [K.x0, (K.z0 + K.z1) / 2, D, Math.PI / 2],
      [K.x1, (K.z0 + K.z1) / 2, D, Math.PI / 2],
    ]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.2), mk(len));
      f.position.set(x, CURB + 1.1, z);
      f.rotation.y = ry;
      this.group.add(f);
    }
  }

  private drawBanner(done: boolean) {
    const key = done ? "done" : "build";
    if (key === this.bannerKey) return;
    this.bannerKey = key;
    const tex = canvasTex(1408, 108, (g) => {
      g.fillStyle = "#0b0913";
      g.fillRect(0, 0, 1408, 108);
      g.fillStyle = VIOLET;
      g.fillRect(0, 0, 1408, 8);
      g.fillRect(0, 100, 1408, 8);
      g.font = "400 56px 'DotGothic16', monospace";
      g.textBaseline = "middle";
      g.fillStyle = "#ffffff";
      g.fillText("NU7 GRAND PRIX · カート", 30, 56);
      g.textAlign = "right";
      g.fillStyle = "#f4b728";
      g.fillText(done ? "OPENING SOON" : "建設中 · OPENS WITH NU7", 1378, 56);
    });
    const mat = this.banner.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.map = tex;
    mat.needsUpdate = true;
  }

  update(dt: number, p: number, done: boolean) {
    this.t += dt;
    const lay = done ? 1 : clamp01((p - 0.12) / 0.58);
    const kerb = done ? 1 : clamp01((p - 0.3) / 0.45);
    const tyre = done ? 1 : clamp01((p - 0.5) / 0.4);
    const head = Math.floor(lay * SAMPLES);
    this.asphalt.geometry.setDrawRange(0, head * 6);
    this.kerbs.geometry.setDrawRange(0, this.kerbCum[Math.min(SAMPLES - 1, Math.floor(kerb * SAMPLES))] * (kerb > 0 ? 1 : 0));
    this.cones.count = this.coneAt.filter((i) => i > head).length;
    this.tyres.count = Math.floor(tyre * (this.tyres.instanceMatrix.count));
    this.checker.visible = lay > 0.01;
    const grass = done ? 1 : clamp01((p - 0.55) / 0.2);
    (this.ground.material as THREE.MeshStandardMaterial).color.set("#8b6b4a").lerp(new THREE.Color("#4f8a3c"), grass);
    const tiers = done ? 5 : Math.floor(clamp01((p - 0.6) / 0.35) * 5.99);
    this.stands.children.forEach((c) => (c.name.startsWith("tier") ? (c.visible = Number(c.name.slice(4)) < tiers) : null));
    this.roof.visible = done || p > 0.95;
    this.gantry.visible = done || p > 0.82;
    this.drawBanner(done);
    // the road crew at the head of the asphalt: the sprayer ahead, the roller going back and forth
    const working = !done && lay > 0 && lay < 1;
    this.roller.visible = this.tar.visible = working;
    if (working) {
      const place = (o: THREE.Object3D, i: number) => {
        const k = ((i % SAMPLES) + SAMPLES) % SAMPLES;
        const at = this.P[k],
          t = this.T[k];
        o.position.set(at.x, CURB + 0.03, at.z);
        o.rotation.y = Math.atan2(-t.z, t.x);
      };
      place(this.tar, head + 6);
      place(this.roller, head - 8 - Math.round((0.5 - 0.5 * Math.cos(this.t * 0.6)) * 14));
    }
    // once NU7 is live, karts lap the finished circuit (the race itself opens later)
    if (done && !this.karts.length) this.makeKarts();
    for (const k of this.karts) {
      k.s = (k.s + k.v * dt) % SAMPLES;
      const i = Math.floor(k.s),
        f = k.s - i;
      const a = this.P[i],
        b = this.P[(i + 1) % SAMPLES],
        t = this.T[i];
      k.obj.position.set(a.x + (b.x - a.x) * f - t.z * k.lane, CURB + 0.04, a.z + (b.z - a.z) * f + t.x * k.lane);
      k.obj.rotation.y = Math.atan2(-t.z, t.x);
    }
  }

  private makeKarts() {
    const cols = ["#d8303a", "#3ef0ff", "#f4b728", VIOLET, "#38ff9c"];
    cols.forEach((hex, i) => {
      const m = new VoxelModel(10, 5, 6);
      m.box(0, 1, 1, 10, 2, 5, C(hex));
      m.box(6, 2, 2, 9, 3, 4, C(hex));
      m.box(3, 2, 2, 6, 4, 4, C("#1e1e24"));
      m.box(3, 4, 2, 5, 5, 4, C(hex === "#f4b728" ? "#ffffff" : "#f4b728"));
      for (const x of [0, 8]) for (const z of [0, 5]) m.box(x, 0, z, x + 2, 2, z + 1, C("#1e1e24"));
      const obj = toObject(m);
      this.group.add(obj);
      this.karts.push({ obj, s: i * 24, v: 26 + i * 1.3, lane: (i % 2 ? 1 : -1) * 1.1 });
    });
  }
}

// ---- the quarter ----

/**
 * The NU7 quarter, east of Midtown: the NU7 Tower and the NU7 Grand Prix karting, both going up at
 * the pace the city closes in on NU7 (from the announced date, or the activation height once it is
 * set). The billboard and the violet neon over the top floor say how far along it is. When NU7
 * activates the tower gets its crown and its name in neon, and the circuit is finished.
 */
export class Nu7Quarter {
  readonly root = new THREE.Group();
  private tower: Tower;
  private kart: Karting;
  private board: THREE.Mesh;
  private boardKey = "";
  private poll = 0;
  p = 0;
  done = false;
  private override = (() => {
    const v = Number(new URLSearchParams(location.search).get("nu7q"));
    return Number.isFinite(v) && v > 0 ? Math.min(1, v) : null;
  })();

  constructor(
    scene: THREE.Scene,
    private hud: GameHud,
    private hooks: Nu7QuarterHooks,
  ) {
    scene.add(this.root);
    this.tower = new Tower(this.root);
    this.kart = new Karting(this.root);
    const B = NU7Q.board;
    const legs = new THREE.MeshStandardMaterial({ color: "#2a2838", roughness: 0.6, metalness: 0.3 });
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 0.3), legs);
      leg.position.set(B.x + s * 3.6, CURB + 1.6, B.z);
      leg.castShadow = true;
      this.root.add(leg);
    }
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 4.84), new THREE.MeshBasicMaterial({ toneMapped: false }));
    this.board.position.set(B.x, CURB + 3.2 + 2.42, B.z + 0.18);
    const back = new THREE.Mesh(new THREE.BoxGeometry(8.8, 5, 0.3), legs);
    back.position.set(B.x, this.board.position.y, B.z);
    this.root.add(back, this.board);
    this.tick();
  }

  /** The target: NU7's activation (from its height once set, else its announced date). */
  private target(s: Nu7State) {
    if (s.height && s.tip && s.height > s.tip) return Date.now() + (s.height - s.tip) * BLOCK_MS;
    return Date.parse(`${s.date ?? FALLBACK_DATE}T00:00:00Z`);
  }

  private tick() {
    const s = this.hooks.nu7();
    const to = this.target(s);
    this.done = s.activated || (!!s.height && !!s.tip && s.tip >= s.height);
    this.p = this.done ? 1 : (this.override ?? (to ? clamp01((Date.now() - START) / (to - START)) : 0));
    if (this.override === 1) this.done = true;
    if (!this.done) this.p = Math.min(this.p, 0.99);
    this.tower.set(this.p, this.done);
    this.drawBoard(s, to);
    this.news();
  }

  get pct() {
    return Math.floor(this.p * 100);
  }

  private news() {
    let seen: { start?: boolean; open?: boolean } = {};
    try {
      seen = JSON.parse(localStorage.getItem(SEEN) ?? "{}") as typeof seen;
    } catch {
      /* private window */
    }
    const go = { label: "Go", fn: () => this.go() };
    if (this.done && !seen.open) {
      seen.open = seen.start = true;
      this.hud.mail("works", "NU7 Tower opened", "NU7 is live: the NU7 Tower has its crown and the NU7 Grand Prix circuit is finished, east of Midtown.", go);
    } else if (!this.done && !seen.start) {
      seen.start = true;
      this.hud.mail("works", "NU7 Tower: under construction", `East of Midtown, the NU7 Tower and the NU7 Grand Prix karting go up as NU7 gets closer: ${this.pct}% done. They open with NU7.`, go);
    } else return;
    try {
      localStorage.setItem(SEEN, JSON.stringify(seen));
    } catch {
      /* private window */
    }
  }

  private drawBoard(s: Nu7State, to: number | null) {
    const left = to ? to - Date.now() : null;
    const days = left !== null ? Math.max(0, Math.ceil(left / 86_400_000)) : null;
    const blocks = s.height && s.tip ? Math.max(0, s.height - s.tip) : null;
    const date = s.date ?? FALLBACK_DATE;
    const key = `${this.pct}:${this.done}:${days}:${blocks}:${date}:${this.tower.built}`;
    if (key === this.boardKey) return;
    this.boardKey = key;
    const tex = canvasTex(1024, 576, (g) => {
      g.fillStyle = "#0b0913";
      g.fillRect(0, 0, 1024, 576);
      for (let x = -60; x < 1024; x += 60) {
        g.fillStyle = "#f4b728";
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 30, 0);
        g.lineTo(x + 60, 36);
        g.lineTo(x + 30, 36);
        g.fill();
      }
      g.textBaseline = "alphabetic";
      g.font = "400 34px 'DotGothic16', monospace";
      g.fillStyle = "#f4b728";
      g.fillText(this.done ? "開業 · NOW OPEN" : "建設中 · UNDER CONSTRUCTION", 40, 96);
      g.font = "400 104px 'DotGothic16', monospace";
      g.fillStyle = "#ffffff";
      g.shadowColor = VIOLET;
      g.shadowBlur = 24;
      g.fillText("NU7 TOWER", 40, 210);
      g.shadowBlur = 0;
      g.textAlign = "right";
      g.font = "400 120px 'DotGothic16', monospace";
      g.fillStyle = VIOLET;
      g.fillText(`${this.pct}%`, 984, 210);
      g.textAlign = "left";
      g.fillStyle = "#2a2440";
      g.fillRect(40, 250, 944, 44);
      const grad = g.createLinearGradient(40, 0, 984, 0);
      grad.addColorStop(0, VIOLET);
      grad.addColorStop(1, "#f4b728");
      g.fillStyle = grad;
      g.fillRect(40, 250, (944 * this.pct) / 100, 44);
      g.font = "400 36px 'DotGothic16', monospace";
      g.fillStyle = "#e8e4f4";
      const when = this.done
        ? "NU7 is live"
        : blocks !== null
          ? `NU7 in ${blocks.toLocaleString("en-US")} blocks`
          : `NU7 · ${new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} · ${days} day${days === 1 ? "" : "s"} to go`;
      g.fillText(when, 40, 360);
      g.fillStyle = "#c9c3d8";
      g.font = "400 30px 'DotGothic16', monospace";
      g.fillText(this.done ? "+ NU7 GRAND PRIX karting · opening soon" : `${FLOORS} floors · ${Math.min(FLOORS, this.tower.built + 1)} going up`, 40, 430);
      if (!this.done) g.fillText("+ NU7 GRAND PRIX karting · opens with NU7", 40, 480);
    });
    const m = this.board.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.map = tex;
    m.needsUpdate = true;
  }

  /** Take the camera to the quarter. */
  go(zoom?: number) {
    const T = NU7Q.tower;
    this.hooks.go(T.x - 26, T.z + 4, zoom);
  }

  blip() {
    const T = NU7Q.tower;
    return { x: T.x, z: T.z, label: `NU7 Tower · ${this.pct}%` };
  }

  update(dt: number) {
    if ((this.poll -= dt) <= 0) {
      this.poll = 10;
      this.tick();
    }
    this.tower.mesh();
    this.tower.update(dt, this.pct);
    this.kart.update(dt, this.p, this.done);
  }

  debugState() {
    return { p: this.p, pct: this.pct, done: this.done, floors: this.tower.built, state: this.hooks.nu7() };
  }
}
