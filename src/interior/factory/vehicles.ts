import * as THREE from "three";
import { hash } from "../../scene/voxel/model";
import { Boxes, GLOW, SOLID } from "./batch";
import { laneGraph, route, type Node } from "./layout";

/**
 * The hall's traffic: forklifts, tugger trains, utility carts, scissor lifts and AGVs on the lane
 * network. They keep to the right, hold a crossing while they cross it, wait for whoever is in
 * front, stop (and beep) for the walker.
 */

export type Kind = "forklift" | "tugger" | "cart" | "lift" | "agv";

const wheel = (b: Boxes, x: number, z: number, r = 0.22, w = 0.18) => {
  const g = new THREE.CylinderGeometry(r, r, w, 12);
  g.rotateZ(Math.PI / 2);
  g.translate(x, r, z);
  b.geo(g, "#16151a");
  const hub = new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 8);
  hub.rotateZ(Math.PI / 2);
  hub.translate(x, r, z);
  b.geo(hub, "#8d8a95");
};

function lamp(color: string, k = 3) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });
}
const beaconGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.14, 8);
const AMBER = lamp("#ff9a1a", 3.5),
  AMBER_OFF = lamp("#5a3006", 1);

/** Forward is +z. Every model sits on y = 0; `seat` is where the driver sits (local). */
export interface Model {
  g: THREE.Group;
  seat: THREE.Vector3 | null;
  beacon: THREE.Mesh | null;
  forks?: THREE.Object3D;
  deck?: THREE.Object3D;
  platform?: THREE.Object3D;
  scissor?: THREE.Object3D[];
}

export function forklift(color = "#e8b020"): Model {
  const g = new THREE.Group();
  const b = new Boxes();
  const gl = new Boxes();
  b.add(color, 1.2, 0.55, 1.9, 0, 0.18, -0.1);
  b.add("#26252d", 1.22, 0.85, 0.5, 0, 0.3, -1.0);
  b.add(color, 1.24, 0.1, 0.52, 0, 1.15, -1.0);
  b.add("#26252d", 0.6, 0.12, 0.55, 0, 0.73, -0.25);
  b.add("#141317", 0.6, 0.55, 0.1, 0, 0.85, -0.55);
  // overhead guard
  for (const [x, z] of [
    [-0.55, 0.45],
    [0.55, 0.45],
    [-0.55, -0.75],
    [0.55, -0.75],
  ])
    b.add("#26252d", 0.07, 2.25, 0.07, x, 0.6, z);
  b.add("#26252d", 1.18, 0.06, 1.3, 0, 2.82, -0.15);
  for (let z = -0.7; z < 0.5; z += 0.2) b.add("#3a3944", 1.12, 0.04, 0.04, 0, 2.86, z);
  // steering wheel, controls
  b.add("#141317", 0.3, 0.05, 0.3, 0, 1.25, 0.25, 0, -0.6);
  b.add("#141317", 0.05, 0.5, 0.05, 0, 0.75, 0.35, 0, -0.4);
  // mast
  for (const x of [-0.4, 0.4]) b.add("#3a3944", 0.1, 2.9, 0.14, x, 0.1, 0.95);
  b.add("#3a3944", 0.9, 0.1, 0.14, 0, 2.95, 0.95);
  b.add("#3a3944", 0.9, 0.1, 0.14, 0, 1.2, 0.95);
  wheel(b, -0.55, 0.55, 0.28, 0.24);
  wheel(b, 0.55, 0.55, 0.28, 0.24);
  wheel(b, -0.55, -0.85, 0.22, 0.2);
  wheel(b, 0.55, -0.85, 0.22, 0.2);
  gl.add(new THREE.Color("#fff4d8").multiplyScalar(2.5), 0.16, 0.1, 0.04, -0.45, 2.7, 0.95);
  gl.add(new THREE.Color("#fff4d8").multiplyScalar(2.5), 0.16, 0.1, 0.04, 0.45, 2.7, 0.95);
  gl.add(new THREE.Color("#ff2a2a").multiplyScalar(2.5), 0.12, 0.08, 0.04, -0.5, 0.95, -1.27);
  gl.add(new THREE.Color("#ff2a2a").multiplyScalar(2.5), 0.12, 0.08, 0.04, 0.5, 0.95, -1.27);
  // the blue safety spot on the floor ahead
  const spot = new THREE.CircleGeometry(0.35, 16);
  spot.rotateX(-Math.PI / 2);
  spot.translate(0, 0.012, 3.4);
  gl.geo(spot, new THREE.Color("#2a7aff").multiplyScalar(2));
  g.add(b.mesh(SOLID), gl.mesh(GLOW));
  // forks on their carriage (raised and lowered)
  const forks = new THREE.Group();
  const f = new Boxes();
  f.add("#26252d", 0.95, 0.5, 0.08, 0, 0, 1.08);
  for (const x of [-0.3, 0.3]) {
    f.add("#3a3944", 0.12, 0.05, 1.1, x, 0, 1.65);
    f.add("#3a3944", 0.12, 0.5, 0.05, x, 0, 1.12);
  }
  forks.add(f.mesh(SOLID));
  forks.position.y = 0.12;
  g.add(forks);
  const beacon = new THREE.Mesh(beaconGeo, AMBER);
  beacon.position.set(0.45, 2.95, -0.6);
  g.add(beacon);
  return { g, seat: new THREE.Vector3(0, 0.55, -0.35), beacon, forks };
}

export function tuggerTractor(color = "#2e7ad8"): Model {
  const g = new THREE.Group();
  const b = new Boxes();
  b.add(color, 0.95, 0.6, 1.5, 0, 0.18, 0);
  b.add("#26252d", 0.95, 0.06, 1.5, 0, 0.78, 0);
  b.add(color, 0.9, 0.5, 0.4, 0, 0.78, 0.55);
  b.add("#26252d", 0.55, 0.45, 0.12, 0, 0.84, -0.5);
  b.add("#141317", 0.05, 0.45, 0.05, 0, 1.25, 0.45, 0, -0.5);
  b.add("#141317", 0.32, 0.04, 0.32, 0, 1.6, 0.35, 0, -0.6);
  b.add("#3a3944", 0.12, 0.12, 0.4, 0, 0.3, -0.9);
  wheel(b, -0.42, 0.45, 0.2, 0.16);
  wheel(b, 0.42, 0.45, 0.2, 0.16);
  wheel(b, -0.42, -0.45, 0.2, 0.16);
  wheel(b, 0.42, -0.45, 0.2, 0.16);
  const gl = new Boxes();
  gl.add(new THREE.Color("#fff4d8").multiplyScalar(2.5), 0.6, 0.1, 0.04, 0, 1.1, 0.76);
  g.add(b.mesh(SOLID), gl.mesh(GLOW));
  const beacon = new THREE.Mesh(beaconGeo, AMBER);
  beacon.position.set(-0.35, 1.35, 0.6);
  g.add(beacon);
  return { g, seat: new THREE.Vector3(0, 0.6, -0.25), beacon };
}

/** A tugger's cart: a platform on castors, loaded with boxed miners, cable reels or blue bins. */
export function tuggerCart(seed: number): THREE.Group {
  const g = new THREE.Group();
  const b = new Boxes();
  b.add("#3a3944", 1.05, 0.08, 1.8, 0, 0.3, 0);
  b.add("#e0a820", 1.07, 0.06, 1.82, 0, 0.38, 0);
  for (const [x, z] of [
    [-0.45, 0.7],
    [0.45, 0.7],
    [-0.45, -0.7],
    [0.45, -0.7],
  ])
    wheel(b, x, z, 0.14, 0.1);
  b.add("#3a3944", 0.06, 0.06, 0.6, 0, 0.3, 1.15);
  const kind = seed % 3;
  if (kind === 0) for (let i = 0; i < 6; i++) b.add(i % 2 ? "#a8875a" : "#9a7a50", 0.48, 0.38, 0.55, -0.25 + (i % 2) * 0.5, 0.44 + Math.floor(i / 4) * 0.39, -0.55 + (Math.floor(i / 2) % 2) * 1.1 - (i >= 4 ? -0.55 : 0));
  else if (kind === 1)
    for (const z of [-0.45, 0.45]) {
      const reel = new THREE.CylinderGeometry(0.42, 0.42, 0.5, 14);
      reel.rotateZ(Math.PI / 2);
      reel.translate(0, 0.86, z);
      b.geo(reel, "#8a6a44");
      const core = new THREE.CylinderGeometry(0.3, 0.3, 0.52, 12);
      core.rotateZ(Math.PI / 2);
      core.translate(0, 0.86, z);
      b.geo(core, z > 0 ? "#c0302a" : "#2a2c34");
    }
  else for (let i = 0; i < 8; i++) b.add(i % 3 ? "#2a6ad8" : "#e0a820", 0.45, 0.3, 0.4, -0.24 + (i % 2) * 0.48, 0.44 + Math.floor(i / 4) * 0.31, -0.6 + (Math.floor(i / 2) % 2) * 1.2 - 0.0);
  g.add(b.mesh(SOLID));
  return g;
}

export function utilityCart(color = "#e8e8ec"): Model {
  const g = new THREE.Group();
  const b = new Boxes();
  b.add(color, 1.15, 0.45, 2.3, 0, 0.22, 0);
  b.add("#2a2c34", 1.15, 0.08, 2.3, 0, 0.62, 0);
  b.add(color, 1.12, 0.45, 0.5, 0, 0.62, 0.95);
  b.add("#26252d", 1.0, 0.18, 0.5, 0, 0.7, 0.1);
  b.add("#26252d", 1.0, 0.5, 0.1, 0, 0.88, -0.15);
  // canopy
  for (const [x, z] of [
    [-0.52, 0.65],
    [0.52, 0.65],
    [-0.52, -0.25],
    [0.52, -0.25],
  ])
    b.add("#3a3944", 0.05, 1.5, 0.05, x, 0.7, z);
  b.add(color, 1.2, 0.07, 1.25, 0, 2.2, 0.2);
  b.add("#3ddc97", 1.22, 0.05, 1.27, 0, 2.15, 0.2);
  // cargo bed: a toolbox and a boxed miner
  b.add("#c0302a", 0.6, 0.3, 0.35, -0.2, 0.7, -0.7);
  b.add("#a8875a", 0.45, 0.4, 0.5, 0.3, 0.7, -0.75);
  b.add("#141317", 0.05, 0.4, 0.05, 0, 0.95, 0.75, 0, -0.5);
  b.add("#141317", 0.3, 0.04, 0.3, 0, 1.3, 0.62, 0, -0.6);
  wheel(b, -0.5, 0.75, 0.22, 0.18);
  wheel(b, 0.5, 0.75, 0.22, 0.18);
  wheel(b, -0.5, -0.75, 0.22, 0.18);
  wheel(b, 0.5, -0.75, 0.22, 0.18);
  const gl = new Boxes();
  gl.add(new THREE.Color("#fff4d8").multiplyScalar(2.5), 0.2, 0.1, 0.04, -0.4, 0.9, 1.21);
  gl.add(new THREE.Color("#fff4d8").multiplyScalar(2.5), 0.2, 0.1, 0.04, 0.4, 0.9, 1.21);
  gl.add(new THREE.Color("#ff2a2a").multiplyScalar(2.5), 0.15, 0.08, 0.04, -0.45, 0.55, -1.16);
  gl.add(new THREE.Color("#ff2a2a").multiplyScalar(2.5), 0.15, 0.08, 0.04, 0.45, 0.55, -1.16);
  g.add(b.mesh(SOLID), gl.mesh(GLOW));
  const beacon = new THREE.Mesh(beaconGeo, AMBER);
  beacon.position.set(0, 2.32, 0.3);
  g.add(beacon);
  return { g, seat: new THREE.Vector3(-0.25, 0.62, 0.1), beacon };
}

export function scissorLift(color = "#e06a1a"): Model {
  const g = new THREE.Group();
  const b = new Boxes();
  b.add(color, 1.15, 0.5, 2.3, 0, 0.12, 0);
  b.add("#26252d", 1.17, 0.12, 2.32, 0, 0.12, 0);
  b.add("#26252d", 0.5, 0.25, 0.4, 0.2, 0.62, -0.85);
  wheel(b, -0.5, 0.75, 0.18, 0.18);
  wheel(b, 0.5, 0.75, 0.18, 0.18);
  wheel(b, -0.5, -0.75, 0.18, 0.18);
  wheel(b, 0.5, -0.75, 0.18, 0.18);
  g.add(b.mesh(SOLID));
  // scissor stack: X pairs along each side, scaled with the height
  const scissor: THREE.Object3D[] = [];
  const armM = new THREE.MeshStandardMaterial({ color: "#3a3944", roughness: 0.5, metalness: 0.5 });
  const armGeo = new THREE.BoxGeometry(0.06, 0.08, 2.2);
  for (let i = 0; i < 4; i++)
    for (const s of [-1, 1])
      for (const x of [-0.5, 0.5]) {
        const a = new THREE.Mesh(armGeo, armM);
        a.position.x = x;
        a.userData = { i, s };
        g.add(a);
        scissor.push(a);
      }
  const platform = new THREE.Group();
  const p = new Boxes();
  p.add("#26252d", 1.2, 0.12, 2.4, 0, 0, 0);
  for (const x of [-0.58, 0.58]) {
    p.add(color, 0.05, 1.05, 0.05, x, 0.12, 1.15);
    p.add(color, 0.05, 1.05, 0.05, x, 0.12, -1.15);
    p.add(color, 0.05, 0.05, 2.35, x, 1.15, 0);
    p.add(color, 0.05, 0.05, 2.35, x, 0.6, 0);
  }
  p.add(color, 1.2, 0.05, 0.05, 0, 1.15, 1.15);
  p.add(color, 1.2, 0.05, 0.05, 0, 1.15, -1.15);
  p.add("#e0a820", 1.22, 0.12, 2.42, 0, 0.0, 0);
  platform.add(p.mesh(SOLID));
  g.add(platform);
  const beacon = new THREE.Mesh(beaconGeo, AMBER);
  beacon.position.set(0.5, 0.72, -1.05);
  g.add(beacon);
  return { g, seat: null, beacon, platform, scissor };
}

/** Scissor stack at height h (platform floor at 0.62 + h). */
export function setLift(m: Model, h: number) {
  const top = 0.62 + h;
  m.platform!.position.y = top;
  const n = 4;
  const seg = (top - 0.62) / n;
  const L = 2.2;
  const ang = Math.asin(Math.min(0.95, Math.max(0.03, seg / L)));
  for (const a of m.scissor!) {
    const { i, s } = a.userData as { i: number; s: number };
    a.position.y = 0.62 + seg * (i + 0.5);
    a.position.z = 0;
    a.rotation.x = s * ang;
  }
}

export function agv(): Model {
  const g = new THREE.Group();
  const b = new Boxes();
  b.add("#ff7a1a", 1.1, 0.32, 1.6, 0, 0.06, 0);
  b.add("#26252d", 1.12, 0.06, 1.62, 0, 0.0, 0);
  b.add("#3a3944", 1.0, 0.04, 1.5, 0, 0.38, 0);
  const lid = new THREE.CylinderGeometry(0.09, 0.09, 0.1, 10);
  lid.translate(0, 0.47, 0.6);
  b.geo(lid, "#141317");
  const gl = new Boxes();
  gl.add(new THREE.Color("#4ad0ff").multiplyScalar(2.4), 1.14, 0.04, 1.64, 0, 0.2, 0);
  gl.add(new THREE.Color("#ffffff").multiplyScalar(2.2), 0.6, 0.06, 0.03, 0, 0.2, 0.82);
  g.add(b.mesh(SOLID), gl.mesh(GLOW));
  const deck = new THREE.Group();
  deck.position.y = 0.42;
  g.add(deck);
  const beacon = new THREE.Mesh(beaconGeo, AMBER);
  beacon.position.set(0.45, 0.45, -0.7);
  g.add(beacon);
  return { g, seat: null, beacon, deck };
}

// ---- the fleet ----------------------------------------------------------------------------------

export interface Vehicle {
  id: string;
  kind: Kind;
  m: Model;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  max: number;
  path: THREE.Vector3[];
  /** Lane node for each path point (or -1). */
  pathNodes: number[];
  i: number;
  node: number;
  holding: Node | null;
  /** The crossing it waits for. */
  waitFor: number;
  stopped: number;
  /** Allowed destination nodes. */
  dests: number[];
  /** Before it sets off again (seconds). */
  dwell: number;
  /** Tugger carts trailing behind, and the tractor's track for them. */
  carts: THREE.Group[];
  track: THREE.Vector3[];
  /** Picks the next trip itself (destination node and points beyond it), instead of `dests`. */
  next?: (v: Vehicle) => [number, THREE.Vector3[]];
  /** Something to do at the end of a trip (scissor lifts work there). */
  job?: (v: Vehicle) => Promise<void>;
  busy: boolean;
  /** Scripted: not on the lanes (the AGV of the line, the racking forklift). */
  scripted: boolean;
  onBeep?: () => void;
  lastBeep: number;
  blocked: boolean;
}

export function buildFleet(root: THREE.Object3D) {
  const nodes = laneGraph();
  const vehicles: Vehicle[] = [];
  const near = (x: number, z: number) => {
    let best = 0,
      bd = Infinity;
    nodes.forEach((n, i) => {
      const d = Math.hypot(n.p.x - x, n.p.z - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const all = nodes.map((_, i) => i);
  const where = (f: (p: THREE.Vector3) => boolean) => all.filter((i) => f(nodes[i].p));

  function add(id: string, kind: Kind, m: Model, start: number, dests: number[], max: number, carts: THREE.Group[] = []): Vehicle {
    const p = nodes[start].p;
    m.g.position.copy(p);
    root.add(m.g);
    for (const c of carts) root.add(c);
    const v: Vehicle = { id, kind, m, pos: m.g.position, heading: 0, speed: 0, max, path: [], pathNodes: [], i: 0, node: start, holding: null, waitFor: -1, stopped: 0, dests, dwell: 1 + hash(vehicles.length, 1, 2, 3) * 4, carts, track: [], busy: false, scripted: false, lastBeep: -99, blocked: false };
    m.g.userData.vehicle = v;
    vehicles.push(v);
    return v;
  }

  /** A new trip from the node it is at to `to` (and an optional point to work at on the way). */
  function plan(v: Vehicle, to: number, extra: THREE.Vector3[] = []) {
    const hops = route(nodes, v.node, to);
    const pts: THREE.Vector3[] = [];
    const pn: number[] = [];
    const OFF = v.kind === "tugger" || v.kind === "forklift" ? 0.9 : 0.75;
    for (let k = 0; k < hops.length; k++) {
      const p = nodes[hops[k]].p;
      const prev = k > 0 ? nodes[hops[k - 1]].p : null;
      const next = k < hops.length - 1 ? nodes[hops[k + 1]].p : null;
      const d1 = prev ? new THREE.Vector3().subVectors(p, prev).normalize() : null;
      const d2 = next ? new THREE.Vector3().subVectors(next, p).normalize() : null;
      const right = (d: THREE.Vector3) => new THREE.Vector3(-d.z, 0, d.x);
      let o = new THREE.Vector3();
      if (d1 && d2) o = d1.dot(d2) > 0.9 ? right(d1).multiplyScalar(OFF) : right(d1).add(right(d2)).multiplyScalar(OFF);
      else if (d1 || d2) o = right((d1 ?? d2)!).multiplyScalar(OFF);
      pts.push(p.clone().add(o));
      pn.push(hops[k]);
    }
    for (const e of extra) {
      pts.push(e.clone());
      pn.push(-1);
    }
    v.path = pts;
    v.pathNodes = pn;
    v.i = 0;
    v.node = to;
  }

  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  function step(v: Vehicle, dt: number, t: number, cam: THREE.Vector3, camFloor0: boolean) {
    if (v.scripted) return;
    if (v.busy) return;
    if (v.i >= v.path.length) {
      // arrived: release the crossing, work, then pick somewhere else
      if (v.holding) {
        v.holding.held = null;
        v.holding = null;
      }
      v.speed = 0;
      v.dwell -= dt;
      if (v.dwell > 0) return;
      if (v.job && v.path.length) {
        v.busy = true;
        const job = v.job;
        void job(v).finally(() => {
          v.busy = false;
          v.dwell = 0.5;
          v.path = [];
        });
        return;
      }
      if (v.next) {
        const [to, extra] = v.next(v);
        plan(v, to, extra);
        v.dwell = 2 + hash(Math.floor(t), vehicles.indexOf(v), 1, 9) * 4;
        return;
      }
      const to = v.dests[Math.floor(hash(Math.floor(t * 7), vehicles.indexOf(v), 3, 3) * v.dests.length)];
      if (to === v.node) {
        v.dwell = 1;
        return;
      }
      plan(v, to);
      v.dwell = 2 + hash(Math.floor(t), vehicles.indexOf(v), 1, 9) * 6;
      return;
    }
    const target = v.path[v.i];
    tmp.subVectors(target, v.pos).setY(0);
    const dist = tmp.length();
    const nodeIdx = v.pathNodes[v.i];
    // the crossing ahead: hold it before entering, wait if someone else is on it
    let mustStop = false;
    if (nodeIdx >= 0 && dist < 4.5) {
      const n = nodes[nodeIdx];
      if (n.held && n.held !== v) mustStop = dist > 1.2;
      else if (!n.held) {
        if (v.holding && v.holding !== n) v.holding.held = null;
        n.held = v;
        v.holding = n;
      }
    }
    // whoever is in front, and the walker
    fwd.set(Math.sin(v.heading), 0, Math.cos(v.heading));
    let blocked = false;
    for (const o of vehicles) {
      if (o === v) continue;
      tmp.subVectors(o.pos, v.pos).setY(0);
      const ahead = tmp.dot(fwd);
      const side = Math.abs(tmp.x * fwd.z - tmp.z * fwd.x);
      if (ahead > 0.5 && ahead < (v.kind === "tugger" ? 4.5 : 3.6) && side < 1.3) blocked = true;
      for (const c of o.carts) {
        tmp.subVectors(c.position, v.pos).setY(0);
        const a2 = tmp.dot(fwd);
        if (a2 > 0.5 && a2 < 3.2 && Math.abs(tmp.x * fwd.z - tmp.z * fwd.x) < 1.2) blocked = true;
      }
    }
    if (camFloor0) {
      tmp.subVectors(cam, v.pos).setY(0);
      const ahead = tmp.dot(fwd);
      if (ahead > 0 && ahead < 3.8 && Math.abs(tmp.x * fwd.z - tmp.z * fwd.x) < 1.3) {
        blocked = true;
        if (t - v.lastBeep > 6) {
          v.lastBeep = t;
          v.onBeep?.();
        }
      }
    }
    if (blocked || mustStop) v.stopped += dt;
    else v.stopped = 0;
    // stuck for long behind someone: squeeze past (keeps the hall from locking up)
    if (v.stopped > 7) blocked = mustStop = false;
    if (v.stopped > 9) v.stopped = 0;
    v.blocked = blocked || mustStop;
    // speed: slow for turns and stops
    let want = v.max;
    const next = v.path[v.i + 1];
    if (next) {
      const a = new THREE.Vector3().subVectors(target, v.pos).setY(0).normalize();
      const b = new THREE.Vector3().subVectors(next, target).setY(0).normalize();
      if (a.dot(b) < 0.7 && dist < 4) want = Math.min(want, 1.1);
    } else if (dist < 3) want = Math.min(want, 0.4 + dist * 0.5);
    if (v.blocked) want = 0;
    v.speed += THREE.MathUtils.clamp(want - v.speed, -4 * dt, 1.6 * dt);
    if (v.speed < 0.01 && want === 0) v.speed = 0;
    // steer toward the target
    if (dist > 0.05) {
      const h = Math.atan2(target.x - v.pos.x, target.z - v.pos.z);
      let dh = h - v.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      v.heading += THREE.MathUtils.clamp(dh, -2.6 * dt, 2.6 * dt) * (v.speed > 0.05 || Math.abs(dh) > 0.3 ? 1 : 0);
      if (Math.abs(dh) > 0.9) v.speed = Math.min(v.speed, 0.6);
    }
    const mv = Math.min(dist, v.speed * dt);
    fwd.set(Math.sin(v.heading), 0, Math.cos(v.heading));
    if (dist > 0.01) {
      tmp.subVectors(target, v.pos).setY(0).normalize();
      v.pos.addScaledVector(tmp.lerp(fwd, 0.5).normalize(), mv);
    }
    if (dist < 0.35) {
      // passed the crossing: let it go once it is behind
      v.i++;
    }
    if (v.holding) {
      const hp = v.holding.p;
      const passed = v.pathNodes.indexOf(nodes.indexOf(v.holding)) < v.i && Math.hypot(hp.x - v.pos.x, hp.z - v.pos.z) > 3;
      if (passed) {
        v.holding.held = null;
        v.holding = null;
      }
    }
    v.m.g.rotation.y = v.heading;
    // tugger carts follow the tractor's track
    if (v.carts.length) {
      const last = v.track[v.track.length - 1];
      if (!last || last.distanceTo(v.pos) > 0.1) {
        v.track.push(v.pos.clone());
        if (v.track.length > 160) v.track.shift();
      }
      v.carts.forEach((c, k) => {
        const back = Math.round((1.9 + k * 2.1) / 0.1);
        const a = v.track[Math.max(0, v.track.length - 1 - back)];
        const b = v.track[Math.max(0, v.track.length - back)];
        if (!a) return;
        c.position.copy(a);
        if (b && b.distanceTo(a) > 0.001) c.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      });
    }
  }

  function update(dt: number, t: number, cam: THREE.Vector3, camFloor0: boolean) {
    const blink = Math.sin(t * 9) > 0;
    for (const v of vehicles) {
      step(v, dt, t, cam, camFloor0);
      if (v.m.beacon) v.m.beacon.material = (v.speed > 0.05 || v.busy) && blink ? AMBER : AMBER_OFF;
    }
  }

  return { nodes, vehicles, add, plan, update, near, where };
}

export type Fleet = ReturnType<typeof buildFleet>;
