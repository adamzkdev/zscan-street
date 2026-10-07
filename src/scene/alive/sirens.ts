import * as THREE from "three";
import { streetSegments } from "../city/plan";
import { sayAt } from "../speech";
import { busSign, canvasTexture } from "../textures";
import { toObject } from "../voxel/mesher";
import { C, E, G, VOX, VoxelModel } from "../voxel/model";
import { policeModel, sedanModel } from "../voxel/vehicles";
import type { AliveCtx, AliveFrame, AlivePart } from "./types";

/**
 * Sirens in the outer city: now and then a police chase (a getaway car, two patrol cars on its
 * tail, light bars going) tears through the streets near where the camera looks, turning at the
 * junctions; and an ambulance runs to a call, stops a while with its lights on, then drives off.
 * They straddle the centre line and ignore the lights. At night each light bar throws a red/blue
 * pool on the road.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

// ---- the street graph ----------------------------------------------------------------------------

interface Node {
  x: number;
  z: number;
  links: number[];
}

function streetGraph() {
  const segs = streetSegments();
  const xs = segs.filter((s) => s.axis === "x"),
    zs = segs.filter((s) => s.axis === "z");
  const nodes: Node[] = [];
  const key = new Map<string, number>();
  const id = (x: number, z: number) => {
    const k = `${x},${z}`;
    let i = key.get(k);
    if (i === undefined) key.set(k, (i = nodes.push({ x, z, links: [] }) - 1));
    return i;
  };
  const onX = new Map<(typeof segs)[number], number[]>(),
    onZ = new Map<(typeof segs)[number], number[]>();
  for (const a of xs)
    for (const b of zs) {
      if (b.at < a.from - 0.5 || b.at > a.to + 0.5 || a.at < b.from - 0.5 || a.at > b.to + 0.5) continue;
      const n = id(b.at, a.at);
      (onX.get(a) ?? onX.set(a, []).get(a)!).push(n);
      (onZ.get(b) ?? onZ.set(b, []).get(b)!).push(n);
    }
  const link = (list: number[], along: (n: Node) => number) => {
    const sorted = [...new Set(list)].sort((p, q) => along(nodes[p]) - along(nodes[q]));
    for (let i = 1; i < sorted.length; i++) {
      nodes[sorted[i - 1]].links.push(sorted[i]);
      nodes[sorted[i]].links.push(sorted[i - 1]);
    }
  };
  for (const l of onX.values()) link(l, (n) => n.x);
  for (const l of onZ.values()) link(l, (n) => n.z);
  return nodes;
}

/** A path as a polyline with its running length; positions are taken on the rounded line. */
class Route {
  readonly pts: THREE.Vector2[];
  readonly acc: number[] = [0];
  constructor(pts: THREE.Vector2[]) {
    this.pts = pts;
    for (let i = 1; i < pts.length; i++) this.acc.push(this.acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  }
  get length() {
    return this.acc[this.acc.length - 1];
  }
  at(s: number, out: THREE.Vector2) {
    s = THREE.MathUtils.clamp(s, 0, this.length);
    let i = 1;
    while (i < this.acc.length - 1 && this.acc[i] < s) i++;
    const k = (s - this.acc[i - 1]) / Math.max(1e-6, this.acc[i] - this.acc[i - 1]);
    return out.lerpVectors(this.pts[i - 1], this.pts[i], k);
  }
}

// ---- the vehicles --------------------------------------------------------------------------------

function ambulanceModel() {
  const w = 32,
    d = 12,
    h = 17;
  const m = new VoxelModel(w, h, d);
  const white = C("#f4f2f6"),
    red = C("#d0202a"),
    dark = C("#1a1a20"),
    glass = G("#1e2638");
  m.box(1, 1, 0, w - 1, 4, d, dark);
  // the box body at the back, the cab in front
  m.box(1, 3, 0, 22, h - 1, d, white);
  m.box(22, 3, 0, w - 1, 11, d, white);
  m.box(w - 1, 3, 1, w, 9, d - 1, white);
  m.box(23, 7, 0, w - 3, 11, 1, glass);
  m.box(23, 7, d - 1, w - 3, 11, d, glass);
  m.box(w - 2, 7, 1, w - 1, 11, d - 1, glass);
  // stripes and the cross on both sides
  m.paint(1, 6, 0, w, 8, d, red);
  for (const z of [0, d - 1]) {
    m.box(9, 9, z, 13, 15, z + 1, red);
    m.box(8, 10, z, 14, 14, z + 1, red);
    m.box(10, 10, z, 12, 14, z + 1, white);
    m.box(9, 11, z, 13, 13, z + 1, white);
    m.box(10, 11, z, 12, 13, z + 1, red);
    m.box(9, 12, z, 13, 12, z + 1, red);
  }
  m.box(0, 4, 2, 1, 15, d - 2, C("#d8d4dc"));
  m.box(0, 6, 3, 1, 14, d - 3, glass);
  m.box(w - 1, 4, 2, w, 5, 4, E("#fff6e0", 3));
  m.box(w - 1, 4, d - 4, w, 5, d - 2, E("#fff6e0", 3));
  m.box(0, 4, 1, 1, 6, 2, E("#ff2a1a", 2.4));
  m.box(0, 4, d - 2, 1, 6, d - 1, E("#ff2a1a", 2.4));
  for (const x of [6, w - 7]) {
    m.clear(x - 2, 0, 0, x + 3, 2, 1);
    m.clear(x - 2, 0, d - 1, x + 3, 2, d);
  }
  return m;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  gr.addColorStop(0, "rgba(255,255,255,0.9)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.35)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

interface Car {
  group: THREE.Group;
  bar: THREE.MeshBasicMaterial[];
  glow: THREE.Mesh | null;
  len: number;
  /** Behind the leader, metres. */
  gap: number;
  /** "chase", "flee" or "amb". */
  kind: string;
}

const LAMP_RED = new THREE.Color("#ff2a2a").multiplyScalar(3.2),
  LAMP_BLUE = new THREE.Color("#2a6aff").multiplyScalar(3.2),
  LAMP_OFF = new THREE.Color("#200810");

function vehicle(kind: "police" | "flee" | "amb", glowTex: THREE.Texture): Car {
  const group = new THREE.Group();
  const model = kind === "police" ? policeModel() : kind === "amb" ? ambulanceModel() : sedanModel("#c0182a", "#ff3e8a");
  group.add(toObject(model));
  const bar: THREE.MeshBasicMaterial[] = [];
  let glow: THREE.Mesh | null = null;
  if (kind !== "flee") {
    const y = kind === "police" ? 11.5 * VOX : 17.4 * VOX;
    const x = kind === "police" ? 0.17 : -0.9;
    for (const [z, c] of [
      [-0.32, LAMP_RED],
      [0.32, LAMP_BLUE],
    ] as const) {
      const mat = new THREE.MeshBasicMaterial({ color: c.clone(), toneMapped: false });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(kind === "amb" ? 0.4 : 0.62, 0.18, 0.5), mat);
      lamp.position.set(x, y, z);
      group.add(lamp);
      bar.push(mat);
    }
    if (kind === "amb") {
      // a second pair at the front of the box
      for (const [z, i] of [
        [-0.5, 0],
        [0.5, 1],
      ] as const) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.3), bar[i]);
        lamp.position.set(1.6, 11.4 * VOX, z);
        group.add(lamp);
      }
      const tex = canvasTexture(busSign("AMBULANCE"));
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.24), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
        plate.position.set(0.3, 2.1, side * (6 * VOX + 0.02));
        if (side < 0) plate.rotation.y = Math.PI;
        group.add(plate);
      }
    } else {
      const tex = canvasTexture(busSign("POLICE"));
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
        plate.position.set(-0.2, 0.62, side * (5.5 * VOX + 0.02));
        if (side < 0) plate.rotation.y = Math.PI;
        group.add(plate);
      }
    }
    glow = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTex, color: "#ff2a2a", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    glow.position.y = 0.06;
    glow.renderOrder = 3;
    group.add(glow);
  }
  group.visible = false;
  return { group, bar, glow, len: kind === "amb" ? 5.3 : 4.3, gap: 0, kind };
}

// ---- events --------------------------------------------------------------------------------------

interface Run {
  route: Route;
  cars: Car[];
  /** The leader's distance along the route. */
  s: number;
  v: number;
  vmax: number;
  /** Ambulance: where it stops, and for how long. */
  stopAt?: number;
  stopFor?: number;
  shout: number;
}

export async function buildSirens(ctx: AliveCtx): Promise<AlivePart & { chase(): void; ambulance(): void; state(): string }> {
  const root = new THREE.Group();
  root.name = "sirens";
  ctx.group.add(root);
  const nodes = streetGraph();
  const glowTex = glowTexture();
  const flee = vehicle("flee", glowTex);
  const cops = [vehicle("police", glowTex), vehicle("police", glowTex)];
  const amb = vehicle("amb", glowTex);
  for (const c of [flee, ...cops, amb]) root.add(c.group);
  root.traverse((o) => (o.raycast = () => {}));
  let chaseRun: Run | null = null;
  let ambRun: Run | null = null;
  let nextChase = rand(20, 40);
  let nextAmb = rand(45, 75);
  const focus = new THREE.Vector3();

  const nearest = (x: number, z: number) => {
    let best = 0,
      bd = Infinity;
    nodes.forEach((n, i) => {
      if (!n.links.length) return;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) (bd = d), (best = i);
    });
    return best;
  };
  /** Wander away from `from` (not back where it came from), mostly straight on, for `dist` metres. */
  const wander = (from: number, prev: number, dist: number) => {
    const out: number[] = [];
    let cur = from,
      back = prev,
      run = 0;
    for (let k = 0; k < 20 && run < dist; k++) {
      const n = nodes[cur];
      const opts = n.links.filter((l) => l !== back && !out.includes(l));
      if (!opts.length) break;
      let next = pick(opts);
      if (back >= 0 && Math.random() < 0.55) {
        // straight on, when the street carries on
        const dx = n.x - nodes[back].x,
          dz = n.z - nodes[back].z;
        const straight = opts.find((l) => {
          const ex = nodes[l].x - n.x,
            ez = nodes[l].z - n.z;
          return Math.abs(ex * dz - ez * dx) < 0.5 && ex * dx + ez * dz > 0;
        });
        if (straight !== undefined) next = straight;
      }
      run += Math.hypot(nodes[next].x - n.x, nodes[next].z - n.z);
      out.push(next);
      back = cur;
      cur = next;
    }
    return out;
  };
  /** Shortest way between two junctions (breadth first over the links, by hops). */
  const path = (a: number, b: number) => {
    const prev = new Map<number, number>([[a, -1]]);
    const q = [a];
    while (q.length) {
      const c = q.shift()!;
      if (c === b) break;
      for (const l of nodes[c].links) if (!prev.has(l)) prev.set(l, c), q.push(l);
    }
    if (!prev.has(b)) return null;
    const out: number[] = [];
    for (let c = b; c >= 0; c = prev.get(c)!) out.unshift(c);
    return out;
  };
  /** Rounded corners: each junction is replaced by two points either side of it. */
  const polyline = (ids: number[]) => {
    const pts: THREE.Vector2[] = [];
    ids.forEach((id, i) => {
      const p = new THREE.Vector2(nodes[id].x, nodes[id].z);
      if (i === 0 || i === ids.length - 1) return pts.push(p);
      const a = new THREE.Vector2(nodes[ids[i - 1]].x, nodes[ids[i - 1]].z),
        b = new THREE.Vector2(nodes[ids[i + 1]].x, nodes[ids[i + 1]].z);
      const ia = a.clone().sub(p).normalize(),
        ib = b.clone().sub(p).normalize();
      if (Math.abs(ia.dot(ib)) > 0.9) return pts.push(p);
      const r = 3.5;
      const p0 = p.clone().addScaledVector(ia, r),
        p1 = p.clone().addScaledVector(ib, r);
      pts.push(p0);
      // a quarter circle's worth of points
      for (const k of [0.25, 0.5, 0.75]) {
        const q0 = p0.clone().lerp(p, k),
          q1 = p.clone().lerp(p1, k);
        pts.push(q0.lerp(q1, k));
      }
      pts.push(p1);
    });
    return new Route(pts);
  };

  const chase = () => {
    const n0 = nearest(focus.x, focus.z);
    const n = nodes[n0];
    if (!n.links.length) return;
    // in from one side, out the other
    const first = pick(n.links);
    const before = [first, ...wander(first, n0, 140)].reverse();
    const after = wander(n0, first, 160);
    const ids = [...before, n0, ...after];
    if (ids.length < 3) return;
    flee.gap = 0;
    cops[0].gap = rand(11, 15);
    cops[1].gap = cops[0].gap + rand(9, 13);
    chaseRun = { route: polyline(ids), cars: [flee, ...cops], s: 0, v: 12, vmax: rand(13.5, 15.5), shout: rand(1, 3) };
  };

  const ambulance = () => {
    const target = nearest(focus.x + rand(-20, 20), focus.z + rand(-20, 20));
    // from 120–220 m away
    const far = nodes.map((nn, i) => [i, Math.hypot(nn.x - nodes[target].x, nn.z - nodes[target].z)] as const).filter(([i, d]) => d > 120 && d < 220 && nodes[i].links.length);
    if (!far.length) return;
    const p = path(pick(far)[0], target);
    if (!p || p.length < 2) return;
    const on = wander(target, p[p.length - 2], 150);
    const ids = [...p, ...on];
    const route = polyline(ids);
    // stop just past the junction nearest the camera
    let stopAt = 0;
    for (let i = 1; i < route.pts.length; i++) if (route.pts[i].x === nodes[target].x && route.pts[i].y === nodes[target].z) stopAt = route.acc[i];
    if (!stopAt) stopAt = route.acc[Math.max(1, route.pts.length - on.length * 2 - 2)] ?? route.length / 2;
    amb.gap = 0;
    ambRun = { route, cars: [amb], s: 0, v: 10, vmax: 13, stopAt: Math.max(10, stopAt - 9), stopFor: rand(14, 20), shout: 0 };
  };

  const p2 = new THREE.Vector2(),
    q2 = new THREE.Vector2();
  /** Advance a run; false when it's over. */
  const step = (run: Run, f: AliveFrame) => {
    const dt = f.dt;
    if (run.stopAt !== undefined && run.stopFor! > 0 && run.s >= run.stopAt - 12) {
      // braking to the stop, then waiting there
      const left = run.stopAt - run.s;
      run.v = left > 0.05 ? Math.min(run.v, Math.max(1.2, Math.sqrt(2 * 4 * left))) : 0;
      if (left <= 0.05) run.stopFor! -= dt;
    } else run.v = Math.min(run.vmax, run.v + 5 * dt);
    run.s += run.v * dt;
    const L = run.route.length;
    const flash = Math.floor(f.t * 7) % 2;
    let any = false;
    for (const c of run.cars) {
      const s = run.s - c.gap;
      const vis = s > 0 && s < L;
      c.group.visible = vis;
      if (!vis) continue;
      any = true;
      run.route.at(s + 1.6, p2);
      run.route.at(s - 1.6, q2);
      c.group.position.set((p2.x + q2.x) / 2, 0, (p2.y + q2.y) / 2);
      c.group.rotation.y = Math.atan2(-(p2.y - q2.y), p2.x - q2.x);
      if (c.bar.length) {
        const stopped = run.v < 0.5;
        const alt = (flash + (c === cops[1] ? 1 : 0)) % 2;
        c.bar[0].color.copy(alt ? LAMP_RED : LAMP_OFF);
        c.bar[1].color.copy(alt ? LAMP_OFF : LAMP_BLUE);
        if (c.glow) {
          c.glow.visible = f.night;
          (c.glow.material as THREE.MeshBasicMaterial).color.set(alt ? "#ff2a2a" : "#2a5aff");
          (c.glow.material as THREE.MeshBasicMaterial).opacity = stopped ? 0.45 : 0.6;
        }
      }
    }
    // a shout from the patrol car when it's close to the camera
    if (run.cars.length > 1 && cops[0].group.visible && (run.shout -= dt) < 0) {
      run.shout = rand(5, 9);
      if (f.focus.distanceTo(cops[0].group.position) < 45 && !f.wide) sayAt(cops[0].group, pick(["Pull over!", "Stop the car!", "Police! Stop!", "Unit 7 in pursuit!"]), "shout", 2.6, 2.2, 0.7);
    }
    return any || run.s < L;
  };

  return {
    chase,
    ambulance,
    /** For debugging: where the runs are. */
    state: () => JSON.stringify({ chase: chaseRun && { s: chaseRun.s, L: chaseRun.route.length, at: flee.group.position, vis: flee.group.visible }, amb: ambRun && { s: ambRun.s, L: ambRun.route.length, at: amb.group.position, stop: ambRun.stopAt, v: ambRun.v } }),
    update(f) {
      focus.copy(f.focus);
      if (chaseRun) {
        if (!step(chaseRun, f) || chaseRun.s - 40 > chaseRun.route.length) {
          for (const c of chaseRun.cars) c.group.visible = false;
          chaseRun = null;
          nextChase = rand(90, 180);
        }
      } else if ((nextChase -= f.dt) < 0) {
        chase();
        if (!chaseRun) nextChase = 10;
      }
      if (ambRun) {
        if (!step(ambRun, f)) {
          amb.group.visible = false;
          ambRun = null;
          nextAmb = rand(70, 140);
        }
      } else if ((nextAmb -= f.dt) < 0) {
        ambulance();
        if (!ambRun) nextAmb = 10;
      }
    },
  };
}
