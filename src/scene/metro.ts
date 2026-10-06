import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Block, Tx } from "../data/types";
import { CITY, CURB, GRID } from "./city/plan";
import type { Nav } from "./nav";
import { KIND_COLOR } from "./snark";
import { busSign, canvasTexture, updateCanvasTexture } from "./textures";
import { toObject } from "./voxel/mesher";
import { C, E, G, VOX, VoxelModel } from "./voxel/model";

/**
 * The ZEC Line: an elevated metro looping round the heart of the city on a concrete viaduct, with
 * three stations. Every mined block comes in on it as a train from the east portal: the block's
 * height on the front, one lit window per transaction in the colour of its kind, a longer train
 * for a full block; it calls at the stations and leaves the way it came. An empty block's train
 * runs through dark, without stopping.
 */

const CAR = { w: 54, d: 16, h: 20 };
const CAR_LEN = CAR.w * VOX;
const GAP = 0.35;
/** Window slots per car side (each a transaction when lit). */
const SLOTS = 7;
const SPEED = 15;

const XW = GRID.xs[1],
  XE = GRID.xs[2],
  ZN = GRID.zs[1],
  ZS = GRID.zs[2];
/** Where trains come out of (and go back into) the portal at the board's east edge. */
const PORTAL_X = CITY.maxX - 1;

/** A line: its viaduct's height, its track, its stations, its colours. */
export interface LineDef {
  name: string;
  deck: number;
  points: THREE.Vector3[];
  stations: [string, string, number, number][];
  stripe: string;
  neon: THREE.Color;
  /** A portal where trains come out (the ZEC line's, at the east edge). */
  portal?: { x: number; z: number };
  /** Cars beyond this |x| are inside the portal, hidden. */
  hideX: number;
  /** Ambient line: a train every so often, out and back, not tied to blocks. */
  every?: number;
}

/** The ZEC line: the loop round the heart, a train per block. */
export const ZEC_LINE = (): LineDef => ({
  name: "ZEC LINE",
  deck: CURB + 9,
  points: routePoints(),
  stations: [
    // over the Orchard (low wooden houses), where the line shows from the street
    ["PARK", "公園", -38, ZN],
    ["SQUARE", "広場", 0, ZS],
    ["MIDTOWN", "中心", XE, 16],
  ],
  stripe: "#f4b728",
  neon: new THREE.Color(0.4, 1.6, 2.2),
  portal: { x: PORTAL_X, z: ZN },
  hideX: PORTAL_X,
});

/** The NU7 line: higher, straight north–south along the east avenue, a shuttle with people aboard. */
export const NU7_LINE = (): LineDef => {
  const x = GRID.xs[3];
  const P = (z: number) => new THREE.Vector3(x, 0, z);
  return {
    name: "NU7 LINE",
    deck: CURB + 14,
    points: [P(CITY.minZ + 3), P(CITY.maxZ - 5), P(CITY.minZ + 3)],
    stations: [
      ["TOWERS", "摩天楼", x, -80],
      ["RIVER", "川", x, 46],
    ],
    stripe: "#b07bff",
    neon: new THREE.Color(1.4, 0.6, 2.4),
    hideX: 1e9,
    every: 34,
  };
};

export interface Station {
  name: string;
  kanji: string;
  /** Distance along the route where trains stop (first and second pass, if any). */
  at: number[];
  pos: THREE.Vector3;
  board: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  /** One flight of stairs, step by step from the street up to the platform (world). */
  stairs: THREE.Vector3[];
  /** Where riders wait on the platform, and the side of the track it is on (world). */
  platform: THREE.Vector3;
  side: THREE.Vector3;
}

/** The route as a polyline with rounded corners: in from the portal, round the loop, back out. */
function routePoints() {
  const r = 7;
  const P = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  const corner = (cx: number, cz: number, a0: number, a1: number) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const a = a0 + ((a1 - a0) * k) / 8;
      pts.push(P(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
    }
    return pts;
  };
  // west along the north side, south down the west side, east along the south side, north up the
  // east side, then east again along the north side to the portal
  return [
    P(PORTAL_X + 30, ZN),
    P(XE + r, ZN),
    P(XW + r, ZN),
    ...corner(XW + r, ZN + r, -Math.PI / 2, -Math.PI),
    P(XW, ZS - r),
    ...corner(XW + r, ZS - r, Math.PI, Math.PI / 2),
    P(XE - r, ZS),
    ...corner(XE - r, ZS - r, Math.PI / 2, 0),
    P(XE, ZN + r),
    ...corner(XE + r, ZN + r, Math.PI, Math.PI * 1.5),
    P(PORTAL_X + 30, ZN),
  ];
}

/** Arc-length parametrised polyline. */
class Route {
  readonly pts: THREE.Vector3[];
  readonly cum: number[] = [0];
  constructor(pts: THREE.Vector3[]) {
    this.pts = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 0.01);
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
  }
  get length() {
    return this.cum[this.cum.length - 1];
  }
  at(s: number, out = new THREE.Vector3()) {
    s = Math.max(0, Math.min(this.length, s));
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const k = (s - this.cum[i - 1]) / (this.cum[i] - this.cum[i - 1] || 1);
    return out.lerpVectors(this.pts[i - 1], this.pts[i], k);
  }
  /** Distance along the route of the point nearest (x, z), searching from `from` on. */
  nearest(x: number, z: number, from = 0) {
    let best = from,
      bd = Infinity;
    for (let s = from; s < this.length; s += 0.5) {
      const p = this.at(s);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) (bd = d), (best = s);
    }
    return best;
  }
}

// ---- the cars --------------------------------------------------------------------------------

/** Car interior, in voxels: floor top, bench rows (z), window band (y). */
const FLOOR = 4;
const BENCH = [3, CAR.d - 4];
const WIN: [number, number] = [8, 16];

function carModel(lead: boolean, stripe = "#f4b728") {
  const { w, d, h } = CAR;
  const m = new VoxelModel(w, h, d);
  const body = C("#d9dde6"),
    roof = C("#9aa0ac"),
    dark = C("#2a2a34"),
    gold = C(stripe);
  // the shell, hollow inside
  m.box(1, 2, 0, w - 1, h - 2, d, body);
  m.clear(2, FLOOR, 1, w - 2, h - 3, d - 1);
  m.box(2, h - 2, 1, w - 2, h, d - 1, roof);
  for (const z of [0, d - 1]) m.box(1, 5, z, w - 1, 6, z + 1, gold);
  m.box(1, 2, 0, w - 1, 4, d, dark);
  // floor and ceiling lights down the middle
  m.box(2, FLOOR - 1, 1, w - 2, FLOOR, d - 1, C("#5a5866"));
  for (let x = 5; x < w - 5; x += 6) m.box(x, h - 3, d / 2 - 1, x + 3, h - 2, d / 2 + 1, E("#fff4e0", 2.2));
  // window band open on both sides, pillars between, doors (glazed) in two places
  for (const z of [0, d - 1]) {
    m.clear(3, WIN[0], z, w - 3, WIN[1], z + 1);
    for (let x = 3; x < w - 3; x += 9) m.box(x, WIN[0], z, x + 1, WIN[1], z + 1, body);
    for (const x of [10, w - 14]) m.box(x, FLOOR, z, x + 4, WIN[1], z + 1, C("#c4c8d2"));
  }
  // longitudinal benches (Japanese-style), seat backs under the windows
  for (const z of BENCH) {
    const back = z < d / 2 ? 1 : d - 2;
    for (const [x0, x1] of [
      [3, 10],
      [14, w - 14],
      [w - 10, w - 3],
    ]) {
      m.box(x0, FLOOR, z - 1, x1, FLOOR + 3, z + 1, C("#3a6aa0"));
      m.box(x0, FLOOR, back, x1, WIN[0], back + 1, C("#2c5285"));
    }
  }
  // hand straps along the ceiling
  for (let x = 4; x < w - 4; x += 3)
    for (const z of [4, d - 5]) {
      m.box(x, h - 6, z, x + 1, h - 3, z + 1, C("#8a8698"));
      m.set(x, h - 7, z, C("#f4f0e8"));
    }
  // bogies
  for (const x of [6, w - 12]) m.box(x, 0, 2, x + 6, 2, d - 2, dark);
  if (lead) {
    m.box(w - 2, WIN[0], 2, w - 1, WIN[1], d - 2, G("#101420"));
    for (const z of [3, d - 5]) m.box(w - 1, 4, z, w, 6, z + 2, E("#fff6e0", 3));
  }
  for (const z of [2, d - 4]) m.box(0, 4, z, 1, 6, z + 2, E("#ff2a1a", 2.2));
  return m;
}

/** Car voxel coordinates to its local space (the model is centred on its footprint). */
const carLocal = (vx: number, vy: number, vz: number) => new THREE.Vector3((vx - CAR.w / 2) * VOX, vy * VOX, (vz - CAR.d / 2) * VOX);

export class Train {
  readonly group = new THREE.Group();
  readonly cars: THREE.Group[] = [];
  s = 0;
  v = SPEED;
  /** Seconds left standing at the platform. */
  dwell = 0;
  stops: number[];
  done = false;
  /** A stop where it waits for riders (until `release()`, at most `holdMax` seconds). */
  hold: number | null = null;
  held = false;
  holdLeft = 0;
  release() {
    this.held = false;
    this.hold = null;
    if (this.dwell > 1.2) this.dwell = 1.2;
  }
  /** True while standing at the platform of the stop at `s`. */
  standingAt(s: number) {
    return this.dwell > 0 && Math.abs(this.s - s) < 0.1;
  }
  private signTex: THREE.CanvasTexture;
  private slots: THREE.InstancedMesh;

  constructor(
    readonly height: number,
    txs: Tx[],
    stops: number[],
    readonly line: LineDef,
    /** Ambient train: lit windows, a line name instead of a block. */
    ambient = false,
  ) {
    this.rail = line.deck + 0.35;
    const n = ambient ? 3 : txs.length === 0 ? 2 : Math.min(5, Math.max(2, Math.ceil(txs.length / SLOTS) + (txs.length >= 15 ? 1 : 0)));
    this.stops = txs.length === 0 && !ambient ? [] : stops;
    const glass = new THREE.MeshPhysicalMaterial({ color: "#d8ecff", transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const band = (WIN[1] - WIN[0]) * VOX;
    for (let i = 0; i < n; i++) {
      const car = new THREE.Group();
      car.add(toObject(carModel(i === 0, line.stripe)));
      for (const z of [0.02, CAR.d - 0.02]) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(CAR_LEN - 6 * VOX, band), glass);
        pane.position.copy(carLocal(CAR.w / 2, (WIN[0] + WIN[1]) / 2, z));
        car.add(pane);
      }
      this.cars.push(car);
      this.group.add(car);
    }
    // the front: block height on an LED band
    this.signTex = canvasTexture(busSign(ambient ? line.name : txs.length ? `#${height.toLocaleString("en-US")} · ${txs.length + 1} TX` : `#${height.toLocaleString("en-US")} · EMPTY`));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry((CAR.d - 4) * VOX, 0.42), new THREE.MeshBasicMaterial({ map: this.signTex, toneMapped: false }));
    sign.position.set(CAR_LEN / 2 + 0.01, 17 * VOX, 0);
    sign.rotation.y = Math.PI / 2;
    this.cars[0].add(sign);
    // one window per transaction, both sides, in its kind's colour
    const slotGeo = new THREE.PlaneGeometry(0.72, 0.16);
    this.slots = new THREE.InstancedMesh(slotGeo, new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }), n * SLOTS * 2);
    const c = new THREE.Color();
    const m = new THREE.Matrix4();
    let k = 0;
    for (let ci = 0; ci < n; ci++)
      for (let si = 0; si < SLOTS; si++) {
        const tx = txs[ci * SLOTS + si];
        if (ambient) c.set(line.stripe).multiplyScalar(1.6);
        else c.set(tx ? KIND_COLOR[tx.kind] : "#2a3040").multiplyScalar(tx ? 1.8 : 1);
        for (const side of [-1, 1]) {
          m.makeRotationY(side > 0 ? 0 : Math.PI);
          m.setPosition(-CAR_LEN / 2 + 1.05 + si * 1.08, (WIN[1] + 0.6) * VOX, side * (CAR.d / 2 + 0.03) * VOX);
          this.slots.setMatrixAt(k, m);
          this.slots.setColorAt(k++, c);
        }
      }
    this.slots.count = k;
    // the slots ride on the cars: kept in train space and re-placed per car each frame
    this.slotCar = Array.from({ length: k }, (_, i) => Math.floor(i / (SLOTS * 2)));
    this.slotLocal = Array.from({ length: k }, (_, i) => {
      const mm = new THREE.Matrix4();
      this.slots.getMatrixAt(i, mm);
      return mm;
    });
    this.slots.frustumCulled = false;
    this.group.add(this.slots);
  }
  private slotCar: number[];
  private rail: number;
  private slotLocal: THREE.Matrix4[];

  get length() {
    return this.cars.length * (CAR_LEN + GAP);
  }

  private taken = 0;
  /** Seat a rider in the next free place (local to its car), as the bus does. */
  seat(root: THREE.Object3D) {
    const perCar = 2 * 10;
    const k = this.taken++;
    const car = this.cars[Math.min(this.cars.length - 1, Math.floor(k / perCar) % this.cars.length)];
    const j = k % perCar;
    const row = j % 2;
    const x = 12 + Math.floor(j / 2) * 4;
    car.add(root);
    root.position.copy(carLocal(Math.min(CAR.w - 4, x), FLOOR, BENCH[row] + (row ? -0.6 : 0.6)));
    root.rotation.set(0, 0, 0);
    return row;
  }

  /** Put every car on the rail behind the head at `s`. */
  place(route: Route) {
    const a = new THREE.Vector3(),
      b = new THREE.Vector3();
    const carM: THREE.Matrix4[] = [];
    this.cars.forEach((car, i) => {
      const head = this.s - i * (CAR_LEN + GAP);
      route.at(head, a);
      route.at(head - CAR_LEN, b);
      car.position.lerpVectors(a, b, 0.5).setY(this.rail);
      car.rotation.y = Math.atan2(-(a.z - b.z), a.x - b.x);
      car.updateMatrix();
      carM.push(car.matrix);
      car.visible = head > 0 && Math.abs(car.position.x) < this.line.hideX;
    });
    const m = new THREE.Matrix4();
    this.slotLocal.forEach((lm, i) => {
      const ci = this.slotCar[i];
      this.slots.setMatrixAt(i, m.multiplyMatrices(carM[ci], lm));
      if (!this.cars[ci].visible) this.slots.setMatrixAt(i, m.makeScale(0, 0, 0));
    });
    this.slots.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    updateCanvasTexture(this.signTex, busSign(""));
  }
}

// ---- the line ------------------------------------------------------------------------------------

export class Metro {
  readonly group = new THREE.Group();
  readonly route: Route;
  readonly stations: Station[] = [];
  trains: Train[] = [];
  /** Each station's frame (to walk its platforms and stairs on foot). */
  private frames: THREE.Matrix4[] = [];
  private lastHeight: number | null = null;
  private deck: number;
  private nextAmbient = 3;
  /** A train pulls out of a station or comes out of the portal: its horn (main plays it). */
  onHorn: ((at: THREE.Vector3) => void) | null = null;

  constructor(
    scene: THREE.Object3D,
    nav: Nav,
    readonly line: LineDef = ZEC_LINE(),
  ) {
    this.deck = line.deck;
    this.route = new Route(line.points.map((p) => new THREE.Vector3(p.x, line.deck + 0.35, p.z)));
    scene.add(this.group);
    this.viaduct(nav);
    this.stationsBuild();
  }

  /** The deck, its parapets, neon edges, the pillars, and the portal at the east edge. */
  private viaduct(nav: Nav) {
    const concrete = new THREE.MeshStandardMaterial({ color: "#8c8896", roughness: 0.85 });
    concrete.userData.dayColor = "#c9c5cf";
    const under = new THREE.MeshStandardMaterial({ color: "#4a4652", roughness: 0.9 });
    const rail = new THREE.MeshStandardMaterial({ color: "#3a3a44", roughness: 0.4, metalness: 0.7 });
    const neon = new THREE.MeshBasicMaterial({ color: this.line.neon, toneMapped: false });
    neon.userData.night = true;
    const pts = this.route.pts;
    const seen = new Set<string>();
    // everything static is merged into one mesh per material: a few draw calls for the whole line
    const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const collect = (mat: THREE.Material, geo: THREE.BufferGeometry) => {
      const list = bins.get(mat);
      if (list) list.push(geo.toNonIndexed());
      else bins.set(mat, [geo.toNonIndexed()]);
    };
    const segment = (a: THREE.Vector3, b: THREE.Vector3) => {
      const key = [a.x, a.z, b.x, b.z].map((v) => v.toFixed(1)).sort().join();
      if (seen.has(key)) return;
      seen.add(key);
      const len = a.distanceTo(b);
      const mid = new THREE.Vector3().lerpVectors(a, b, 0.5);
      const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
      const put = (geo: THREE.BufferGeometry, mat: THREE.Material, dy: number, dz: number) => {
        const o = new THREE.Object3D();
        o.position.set(mid.x, this.deck + dy, mid.z);
        o.rotation.y = yaw;
        o.translateZ(dz);
        o.updateMatrix();
        collect(mat, geo.applyMatrix4(o.matrix));
      };
      put(new THREE.BoxGeometry(len + 0.3, 0.8, 4.4), concrete, -0.4, 0);
      put(new THREE.BoxGeometry(len + 0.3, 0.3, 3.4), under, -0.95, 0);
      for (const z of [-2.1, 2.1]) put(new THREE.BoxGeometry(len + 0.3, 0.7, 0.22), concrete, 0.35, z);
      for (const z of [-0.72, 0.72]) put(new THREE.BoxGeometry(len + 0.05, 0.12, 0.12), rail, 0.06, z);
      for (const z of [-2.22, 2.22]) put(new THREE.BoxGeometry(len + 0.3, 0.06, 0.04), neon, -0.75, z);
    };
    for (let i = 1; i < pts.length; i++) segment(pts[i - 1], pts[i]);
    // pillars every ~13 m along the straights, never in the avenue
    const pillar = new THREE.BoxGeometry(0.9, this.deck - 0.8, 0.9);
    const cap = new THREE.BoxGeometry(3.6, 0.5, 1.1);
    for (let s = 4; s < this.route.length; s += 13) {
      const p = this.route.at(s);
      if (Math.abs(p.x) > CITY.maxX - 2) continue;
      if (p.z > CITY.road.z0 - 1.5 && p.z < CITY.road.z1 + 1.5) continue;
      const key = `${Math.round(p.x / 6)},${Math.round(p.z / 6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collect(concrete, pillar.clone().translate(p.x, (this.deck - 0.8) / 2, p.z));
      const along = this.route.at(s + 1).sub(p);
      collect(concrete, cap.clone().rotateY(Math.atan2(-along.z, along.x) + Math.PI / 2).translate(p.x, this.deck - 1.05, p.z));
      nav.addCircle(p.x, p.z, 0.6);
    }
    for (const [mat, list] of bins) {
      const m = new THREE.Mesh(mergeGeometries(list, false), mat);
      m.castShadow = mat !== neon;
      m.receiveShadow = true;
      this.group.add(m);
    }
    // the east portal: a dark gate the trains come out of
    if (!this.line.portal) return;
    const portal = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: "#2a2832", roughness: 0.6 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(x, y, z);
      portal.add(o);
    };
    add(new THREE.BoxGeometry(1.4, this.deck + 5, 7), frame, 0, (this.deck + 5) / 2, 0);
    add(new THREE.BoxGeometry(1.5, 4.2, 4.6), new THREE.MeshBasicMaterial({ color: "#050508" }), 0, this.deck + 1.9, 0);
    add(new THREE.BoxGeometry(1.6, 0.18, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.4), toneMapped: false }), 0, this.deck + 4.2, 0);
    portal.position.set(this.line.portal.x, 0, this.line.portal.z);
    this.group.add(portal);
  }

  /** Three stations: platforms, a canopy, stairs down, a name sign and an arrivals board. */
  private stationsBuild() {
    const defs = this.line.stations;
    const platformM = new THREE.MeshStandardMaterial({ color: "#a8a2b0", roughness: 0.7 });
    platformM.userData.dayColor = "#dedae4";
    const roofM = new THREE.MeshStandardMaterial({ color: "#2e2c38", roughness: 0.5, metalness: 0.3 });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.6), toneMapped: false });
    for (const [name, kanji, x, z] of defs) {
      // which way the track runs here
      const sAt = this.route.nearest(x, z);
      const tan = this.route.at(sAt + 1).sub(this.route.at(sAt));
      const along = Math.abs(tan.x) > Math.abs(tan.z) ? "x" : "z";
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      if (along === "z") g.rotation.y = Math.PI / 2;
      const box = (w: number, h: number, d: number, m: THREE.Material, px: number, py: number, pz: number) => {
        const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        o.position.set(px, py, pz);
        o.castShadow = o.receiveShadow = true;
        g.add(o);
        return o;
      };
      const L = 28;
      // platforms either side of the track, a canopy over all
      for (const side of [-1, 1]) {
        box(L, 0.5, 2.2, platformM, 0, this.deck - 0.15, side * 3.3);
        box(L, 0.9, 0.15, platformM, 0, this.deck + 0.55, side * 4.4);
        box(L, 0.04, 0.12, glow, 0, this.deck + 0.12, side * 2.3);
        for (let px = -L / 2 + 2; px <= L / 2 - 2; px += 6) box(0.25, 3.4, 0.25, roofM, px, this.deck + 1.8, side * 4.1);
      }
      box(L + 1, 0.25, 9.6, roofM, 0, this.deck + 3.6, 0);
      box(L, 0.06, 0.3, glow, 0, this.deck + 3.45, 0);
      // stairs down to the street at both ends, on the north/outer side
      for (const end of [-1, 1]) {
        const steps = 22;
        for (let k = 0; k < steps; k++) {
          const t = k / steps;
          box(0.6, 0.18, 2, platformM, end * (L / 2 + 0.3 + t * 12), this.deck - 0.2 - t * (this.deck - CURB - 0.2), 5.2);
        }
      }
      // the name, lit, on both faces of the canopy
      const signTex = canvasTexture(busSign(`${kanji} ${name}`));
      for (const side of [-1, 1]) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }));
        s.position.set(0, this.deck + 4.3, side * 4.85);
        s.rotation.y = side > 0 ? 0 : Math.PI;
        g.add(s);
      }
      // the arrivals board hanging under the canopy
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 128;
      const ctx = c.getContext("2d")!;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      for (const side of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
        b.position.set(-6, this.deck + 2.7, side * 0.06);
        b.rotation.y = side > 0 ? 0 : Math.PI;
        g.add(b);
      }
      this.group.add(g);
      const pos = new THREE.Vector3(x, this.deck, z);
      const first = this.route.nearest(x, z);
      const second = this.route.nearest(x, z, first + 40);
      const at = [first];
      if (this.route.at(second).distanceTo(pos) < 2) at.push(second);
      // the stairs at the +x end, from the street up (world points)
      g.updateMatrixWorld(true);
      this.frames.push(g.matrixWorld.clone().invert());
      const stairs: THREE.Vector3[] = [];
      for (let k = 22; k >= 0; k--) {
        const t = k / 22;
        stairs.push(new THREE.Vector3(L / 2 + 0.3 + t * 12, this.deck - 0.2 - t * (this.deck - CURB - 0.2) + 0.1, 5.2).applyMatrix4(g.matrixWorld));
      }
      stairs.push(new THREE.Vector3(L / 2 - 1, this.deck + 0.1, 3.4).applyMatrix4(g.matrixWorld));
      const platform = new THREE.Vector3(4, this.deck + 0.1, 3.3).applyMatrix4(g.matrixWorld);
      const side = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y);
      this.stations.push({ name, kanji, at, pos, board: { ctx, tex }, stairs, platform, side });
    }
    this.drawBoards();
  }

  private drawBoards() {
    for (const st of this.stations) {
      const { ctx, tex } = st.board;
      ctx.fillStyle = "#06070a";
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = this.line.stripe;
      ctx.font = '700 30px "JetBrains Mono", Menlo, monospace';
      ctx.fillText(this.line.name, 18, 44);
      ctx.fillStyle = "#e8e6ee";
      ctx.font = '700 40px "JetBrains Mono", Menlo, monospace';
      const next = this.trains.find((t) => !t.done);
      ctx.fillText(this.line.every ? (next ? "TRAIN DUE" : "EVERY 1 MIN") : next ? `#${next.height.toLocaleString("en-US")}` : this.lastHeight ? `LAST #${this.lastHeight.toLocaleString("en-US")}` : "WAITING", 18, 100);
      ctx.fillStyle = next ? "#3ee08f" : "#8a8896";
      ctx.font = '600 26px "JetBrains Mono", Menlo, monospace';
      ctx.fillText(next ? "ARRIVING" : "", 340, 100);
      tex.needsUpdate = true;
    }
  }

  /**
   * Floor height on foot over a station: its platforms (and the track between them), and its
   * stairs from the street up at both ends. null elsewhere.
   */
  heightAt(x: number, z: number): number | null {
    const L = 28,
      p = new THREE.Vector3();
    for (const inv of this.frames) {
      p.set(x, 0, z).applyMatrix4(inv);
      const ax = Math.abs(p.x);
      if (ax <= L / 2 + 0.3 && Math.abs(p.z) <= 4.4) return this.deck + 0.1;
      if (p.z >= 4.0 && p.z <= 6.4 && ax <= L / 2 + 12.3) {
        if (ax <= L / 2 + 0.3) return this.deck + 0.1;
        const t = (ax - L / 2 - 0.3) / 12;
        return this.deck - t * (this.deck - CURB);
      }
    }
    return null;
  }

  station(name: string) {
    return this.stations.find((s) => s.name === name)!;
  }

  /** A block was mined: its train sets off from the portal. */
  block(b: Block): Train {
    this.lastHeight = b.height;
    const stops = this.stations.flatMap((s) => s.at).sort((a, c) => a - c);
    const t = new Train(b.height, b.txs, stops, this.line);
    this.trains.push(t);
    this.group.add(t.group);
    t.place(this.route);
    this.drawBoards();
    return t;
  }

  update(dt: number) {
    if (this.line.every) {
      this.nextAmbient -= dt;
      if (this.nextAmbient <= 0 && this.trains.length < 2) {
        this.nextAmbient = this.line.every;
        const t = new Train(0, [], this.stations.flatMap((s) => s.at).sort((a, c) => a - c), this.line, true);
        this.trains.push(t);
        this.group.add(t.group);
        t.place(this.route);
        this.drawBoards();
      }
    }
    for (const t of this.trains) {
      if (t.dwell > 0) {
        // held for riders: the doors stay open (within reason)
        if (t.held) {
          t.holdLeft -= dt;
          if (t.holdLeft <= 0) t.release();
        } else t.dwell -= dt;
        if (t.dwell <= 0) {
          t.v = 0.1;
          this.onHorn?.(t.cars[0].position);
        }
      } else {
        // brake for the next stop, pull away after it
        const next = t.stops.find((s) => s > t.s + 0.05);
        const toStop = next === undefined ? Infinity : next - t.s;
        const vmax = Math.min(SPEED, Math.sqrt(Math.max(0.04, 2 * 1.6 * toStop)) + 0.3);
        t.v = Math.min(vmax, t.v + 2.2 * dt);
        t.s += t.v * dt;
        if (next !== undefined && next - t.s < 0.08) {
          t.s = next;
          t.stops = t.stops.filter((s) => s !== next);
          t.dwell = 5;
          t.v = 0;
          if (t.hold !== null && Math.abs(next - t.hold) < 0.1) {
            t.held = true;
            t.holdLeft = 26;
          }
        }
      }
      t.place(this.route);
      if (t.s - t.length > this.route.length - 1) t.done = true;
    }
    const gone = this.trains.filter((t) => t.done);
    if (gone.length) {
      for (const t of gone) {
        this.group.remove(t.group);
        t.dispose();
      }
      this.trains = this.trains.filter((t) => !t.done);
      this.drawBoards();
    }
  }

  /** Where the newest train is (for the camera). */
  get lead() {
    const t = this.trains[this.trains.length - 1];
    return t ? t.cars[0].position : null;
  }
}
