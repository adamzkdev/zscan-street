/**
 * MARINA NIGHTS' own look (art only), on the shared kit (decor.ts, props.ts, life.ts): a humid neon
 * night round ZStreet's Marina Bay.
 *
 * - The landmarks: the MARINA ZEC HOTEL's three towers and their boat-shaped sky park (searchlights
 *   sweeping), the lotus museum on the shore, the BAY THEATRE's spiky twin domes, the LION FOUNTAIN
 *   spouting into the bay, GARDENS BY THE BAY's supertrees (open canopies of light) and their SKYWAY, the HELIX BRIDGE's
 *   double spiral, the SKY WHEEL (it turns; its searchlight points at the stop it sets riders down
 *   at this turn), the hawker centre's octagonal hall and its clock tower, SATAY STREET's smoking
 *   grills, the NIGHT MARKET's stalls and lanterns, the SHOPHOUSES' pastel fronts and five-foot
 *   ways, the CBD's glass towers, the river and its white bridge, the glass conservatories.
 * - The bay alive: bumboats and a dinner cruise on their rounds, floating lanterns, neon
 *   reflections shimmering on the water, fireworks now and then.
 * - The MONSOON (game.ts drives it through `SG`): rain over the whole board, lightning, the low
 *   promenade flooding (and drying out again).
 *
 * Neon: the shared batcher's glow pieces bloom only a little (a white material), so the board's
 * lights go through `Neon` here, a batcher of fully glowing instances (post.ts markGlow), a few
 * draws for all of them. Nothing is allocated per frame; everything hangs under the scene (freed
 * by the view's disposeScene).
 */
import * as THREE from "three";
import { canvasTex, toon } from "../../k3";
import { markGlow } from "../../post";
import type { LandmarkDef } from "../maps";
import type { BEv } from "../core";
import type { BoardView } from "../view";
import { DARK, Water, bench, lamp, pick, tree, type Kit, type MapArt } from "../decor";
import { SHAPES, Vox, glowTex, inside, type Shape } from "../props";

const Y = new THREE.Vector3(0, 1, 0);
const tv = new THREE.Vector3();
const tv2 = new THREE.Vector3();
const tq = new THREE.Quaternion();
const tm = new THREE.Matrix4();
const ts = new THREE.Vector3();
const te = new THREE.Euler();

/** The sky wheel's cabins hang this far out from the rim. */
const CAB_OUT = 1.3;
const NEON = ["#ff3fd0", "#3ef0ff", "#ffd23f", "#9a6bff", "#ff5a6e", "#5effa8"];
const PASTEL = ["#9fe0c8", "#ffb6cc", "#ffe08a", "#a8c8ff", "#f6c8a0", "#c8b6ff", "#bfe8a0", "#ffd0a8"];
const GLASS = ["#2c3a6a", "#34427a", "#28345e", "#3a3a72"];
const WHITE = "#eef0fa";
const STEEL = "#c9cde0";
const TILE = "#c2523e";

// ---- the neon batcher -----------------------------------------------------------------------------------

let neonMat: THREE.MeshBasicMaterial | null = null;
/** The fully glowing material (shared, never disposed). */
function nmat() {
  if (!neonMat) {
    neonMat = markGlow(new THREE.MeshBasicMaterial({ color: "#ffffff" }), 1);
    neonMat.userData = { shared: true };
  }
  return neonMat;
}
/** Every fully glowing piece (tubes, bulbs, lit windows), one draw per shape. */
class Neon {
  private list = new Map<Shape, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; c: THREE.Color }[]>();
  private fm = new THREE.Matrix4();
  private m = new THREE.Matrix4();
  private e = new THREE.Euler();
  private q = new THREE.Quaternion();
  frame(x = 0, y = 0, z = 0, yaw = 0) {
    this.fm.compose(tv.set(x, y, z), tq.setFromAxisAngle(Y, yaw), ts.set(1, 1, 1));
    return this;
  }
  add(shape: Shape, color: THREE.ColorRepresentation, sx: number, sy: number, sz: number, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number; k?: number } = {}) {
    this.e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    this.m.compose(tv.set(x, y, z), this.q.setFromEuler(this.e), ts.set(1, 1, 1)).premultiply(this.fm);
    const p = new THREE.Vector3(),
      q = new THREE.Quaternion();
    this.m.decompose(p, q, ts);
    let a = this.list.get(shape);
    if (!a) this.list.set(shape, (a = []));
    a.push({ p, q, s: new THREE.Vector3(sx, sy, sz), c: new THREE.Color(color).multiplyScalar(o.k ?? 1.25) });
    return this;
  }
  box(c: THREE.ColorRepresentation, w: number, h: number, d: number, x: number, y: number, z: number, o?: { rx?: number; ry?: number; rz?: number; k?: number }) {
    return this.add("box", c, w, h, d, x, y, z, o);
  }
  orb(c: THREE.ColorRepresentation, r: number, x: number, y: number, z: number, k?: number) {
    return this.add("orb", c, r * 2, r * 2, r * 2, x, y, z, { k });
  }
  build(parent: THREE.Object3D) {
    const out: THREE.InstancedMesh[] = [];
    for (const [shape, a] of this.list) {
      const mesh = new THREE.InstancedMesh(SHAPES[shape], nmat(), a.length);
      a.forEach((it, i) => {
        mesh.setMatrixAt(i, tm.compose(it.p, it.q, it.s));
        mesh.setColorAt(i, it.c);
      });
      mesh.computeBoundingSphere();
      mesh.raycast = () => {};
      parent.add(mesh);
      out.push(mesh);
    }
    this.list.clear();
    return out;
  }
}

// ---- the board's state (one board at a time; the scene owns every object) ----------------------------------

interface Boat {
  /** Its body in the shared moving batcher (life.dyn). */
  b: number;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  sp: number;
  ph: number;
}
interface Burst {
  x: number;
  y: number;
  z: number;
  t: number;
  c: THREE.Color;
  base: number;
}

interface St {
  k: Kit;
  t: number;
  // the sky wheel
  ring: THREE.Group;
  hub: THREE.Vector3;
  /** The wheel's plane: its axle (normal), its horizontal axis. */
  axle: THREE.Vector3;
  side: THREE.Vector3;
  R: number;
  ang: number;
  spin: number;
  spinWant: number;
  cabins: THREE.InstancedMesh[];
  cabinParts: THREE.Matrix4[][];
  nCab: number;
  /** The cabin being ridden (−1 none) and where its rider stands (kept up to date each frame). */
  board: number;
  riderPt: THREE.Vector3;
  // the stop beam and its beacon
  beam: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  beamFrom: THREE.Vector3;
  beamAt: THREE.Vector3;
  beamGo: THREE.Vector3;
  beacon: THREE.Group;
  beaconMats: THREE.MeshBasicMaterial[];
  stops: THREE.Vector3[];
  stop: number;
  // the monsoon
  rain: THREE.LineSegments;
  rainMat: THREE.ShaderMaterial;
  rainK: number;
  rainWant: number;
  flood: THREE.Mesh | null;
  floodMat: THREE.ShaderMaterial | null;
  floodK: number;
  floodWant: number;
  hemi: THREE.HemisphereLight | null;
  sun: THREE.DirectionalLight | null;
  base: [number, number];
  hemiC: THREE.Color;
  stormC: THREE.Color;
  flash: number;
  nextFlash: number;
  bolt: THREE.LineSegments;
  boltPos: Float32Array;
  // the bay
  boats: Boat[];
  lanterns: THREE.InstancedMesh | null;
  lanternPts: { x: number; z: number; ph: number }[];
  reflMat: THREE.ShaderMaterial | null;
  jet: THREE.InstancedMesh | null;
  jetFrom: THREE.Vector3;
  jetDir: THREE.Vector3;
  // fireworks
  fw: THREE.Points;
  fwPos: Float32Array;
  fwCol: Float32Array;
  fwVel: Float32Array;
  fwLife: Float32Array;
  fwNext: number;
  fwHead: number;
  bursts: Burst[];
  // the towers' lasers
  laserAt: THREE.Vector3;
  lasers: THREE.InstancedMesh | null;
}
let S: St | null = null;

// ---- small helpers ------------------------------------------------------------------------------------------

/** A beam of `shape` from a to b, `w` thick (a tube, a cable, a strut). */
function strut(add: (shape: Shape, c: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number }) => unknown, c: string, a: THREE.Vector3, b: THREE.Vector3, w: number, shape: Shape = "box") {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  tv2.set(dx / len, dy / len, dz / len);
  tq.setFromUnitVectors(Y, tv2);
  te.setFromQuaternion(tq, "XYZ");
  add(shape, c, w, len, w, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, { rx: te.x, ry: te.y, rz: te.z });
}
const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** How tall a low prop may be at (x, z): the shared limit, relaxed (the turn camera looks over a stall's roof well before its foot). */
const room = (k: Kit, x: number, z: number, r = 1) => k.ground.maxH(x, z, r) * 1.6 + 0.5;
/**
 * How tall a house beside a street may be: the turn camera sits straight south of each space, so
 * only what stands in that narrow corridor (south of a space, within `half` + 1.6 m across) has to
 * stay under its sight line; a front well off to the side may rise.
 */
function roomBeside(k: Kit, x: number, z: number, half: number) {
  let h = 99;
  for (const sp of k.g.spaces) {
    const dz = z - sp.z;
    if (dz < -half || dz > 16) continue;
    if (Math.abs(x - sp.x) - half > 1.6) continue;
    h = Math.min(h, 0.75 * Math.max(0, dz - half - 1.1) + 1.2);
  }
  return h;
}

function gradTex(stops: [number, string][], w = 4, h = 128) {
  return canvasTex(w, h, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}

// ---- the landmarks --------------------------------------------------------------------------------------------

function landmark(d: LandmarkDef, k: Kit): boolean {
  const N = neonOf(k);
  switch (d.kind) {
    case "sg-towers":
      towers(k, N, d);
      return true;
    case "sg-lotus":
      lotus(k, N, d);
      return true;
    case "sg-domes":
      domes(k, N);
      return true;
    case "sg-lion":
      lion(k, N, d);
      return true;
    case "sg-wheel":
      wheel(k, N, d);
      return true;
    case "sg-grove":
      grove(k, N);
      return true;
    case "sg-skyway":
      skyway(k, N);
      return true;
    case "sg-helix":
      helix(k, N);
      return true;
    case "sg-hawker":
      hawker(k, N, d);
      return true;
    case "sg-satay":
      satay(k, N);
      return true;
    case "sg-market":
      market(k, N);
      return true;
    case "sg-shophouses":
      shophouses(k, N);
      return true;
    case "sg-cbd":
      cbd(k, N);
      return true;
    case "sg-bridge":
      riverBridge(k, N, d);
      return true;
    case "sg-promenade":
      promenade(k, N);
      return true;
    case "sg-bay":
      return true;
  }
  return false;
}

/** The board's Neon batcher (one per build, kept on the kit). */
const neons = new WeakMap<Kit, Neon>();
function neonOf(k: Kit) {
  let n = neons.get(k);
  if (!n) neons.set(k, (n = new Neon()));
  return n;
}

// ---- the MARINA ZEC HOTEL: three towers and their sky park ------------------------------------------------------------------------

function towers(k: Kit, N: Neon, d: LandmarkDef) {
  const { v, words, pools, paint, ground, life } = k;
  const { x, z } = d;
  const H = 19.5;
  const xs = [-5.5, 1.5, 8.5];
  for (const [i, ox] of xs.entries()) {
    const tx = x + ox;
    ground.take(tx, z, 3.4);
    // two legs leaning together, glass, lit floors on the bay side
    for (const [lz, lean] of [
      [1.25, -0.045],
      [-1.25, 0.012],
    ] as [number, number][]) {
      v.frame(tx, 0, z + lz, 0);
      v.box(pick(GLASS, i * 0.3 + lz), 4.2, H, 1.9, 0, H / 2, 0, { rx: lean, ink: 0.06 });
      v.box("#4a5a92", 4.3, 0.35, 2.0, 0, 0.18, 0);
      if (lz > 0)
        for (let f = 1.6, n = 0; f < H - 0.8; f += 0.95, n++) {
          if ((n * 7 + i * 3) % 5 === 0) continue;
          N.frame(tx, 0, z + lz + (f - H / 2) * Math.sin(lean), 0);
          N.box(n % 3 ? "#ffe2a8" : "#bfe0ff", 3.9, 0.22, 0.06, 0, f, 0.99, { k: 0.75 });
        }
    }
    // the edges lit up the corners
    for (const s of [-1, 1]) {
      N.frame(tx + s * 2.14, 0, z + 2.18, 0);
      N.box("#9fe8ff", 0.08, H - 0.5, 0.08, 0, H / 2, 0, { k: 0.9 });
    }
    paint.shadow(tx, z, 3.4, 3, 0.5);
  }
  // the sky park: a long hull over all three, its prow out past the east tower; a pool, palms, lights
  const y0 = H + 0.2;
  const cx = x + 1.8,
    L = 25;
  v.frame(cx, 0, z, 0);
  v.box(WHITE, L, 1.0, 3.8, 0, y0 + 0.5, 0, { ink: 0.06 });
  v.box("#d9dced", L - 0.6, 0.5, 3.4, 0, y0 - 0.2, 0, { ink: 0.04 });
  v.add("wedge", WHITE, 3.8, 1.0, 4.2, L / 2 + 2.05, y0 + 0.5, 0, { ry: -Math.PI / 2, ink: 0.05 });
  N.frame(cx, 0, z, 0);
  for (const s of [-1, 1]) N.box("#3ef0ff", L + 2, 0.12, 0.1, 1, y0 + 0.02, s * 1.95, { k: 1.4 });
  // the infinity pool on the west end, its edge spilling light
  N.box("#3ef0ff", 9.5, 0.08, 1.6, -L / 2 + 5.6, y0 + 1.05, 0.9, { k: 0.9 });
  N.box("#a8f8ff", 9.5, 0.3, 0.08, -L / 2 + 5.6, y0 + 0.9, 1.75, { k: 1.2 });
  for (let i = 0; i < 9; i++) {
    const px = -L / 2 + 13 + i * 1.2;
    v.box("#8a5a2e", 0.12, 0.8, 0.12, px, y0 + 1.4, -0.9);
    v.add("orb", pick(k.style.greens, i * 0.37), 0.9, 0.5, 0.9, px, y0 + 1.9, -0.9, { ink: 0.02 });
  }
  for (let i = 0; i < 12; i++) N.orb(i % 2 ? "#ffffff" : "#ffd23f", 0.11, -L / 2 + 1 + i * 2.1, y0 + 1.15, 1.6);
  // the podium in front: a long low mall, its wavy glass roof, its lit front
  const pz = z + 4.8;
  for (let i = 0; i < 8; i++) {
    const px = x - 9.5 + i * 3.05;
    const h = 2.4 + Math.sin(i * 0.9) * 0.5;
    v.frame(px, 0, pz, 0);
    v.box("#3a4372", 3.1, h, 3.4, 0, h / 2, 0, { ink: 0.035 });
    v.box("#cfd6f0", 3.15, 0.25, 3.5, 0, h + 0.12, 0, { rx: 0.18 * Math.sin(i * 1.3), ink: 0.02 });
    N.frame(px, 0, pz, 0);
    N.box(i % 2 ? "#ffe2a8" : "#ffcf8a", 2.7, h * 0.5, 0.06, 0, h * 0.42, 1.72, { k: 0.8 });
    pools.add(px, pz + 2.6, 2.4, "#ffcf8a", 0.06, 0.6);
    ground.take(px, pz, 1.8);
  }
  words.add(d.label ?? "MARINA ZEC HOTEL", 0.7, x + 1.8, 3.5, pz + 1.76, 0, { fg: "#3ef0ff", neon: true, w: 7 });
  // (the light show's lasers: effects() fans them out of the sky park)
  S!.laserAt.set(cx, y0 + 1.3, z);
  for (const ox of [-10, 0, 10]) life.blinker(cx + ox, y0 + 2.2, z - 1.2, "#ff3d56");
  pools.add(x + 1.5, z + 2, 9, "#7f9cff", 0.05, 0.4);
}

// ---- the lotus museum on the shore -----------------------------------------------------------------------------

function lotus(k: Kit, N: Neon, d: LandmarkDef) {
  const { v, pools, paint, ground } = k;
  const { x, z } = d;
  ground.take(x, z, 2.6);
  v.frame(x, 0, z, 0);
  v.cyl("#cfd3e6", 2.2, 0.8, 0, 0.1, 0, { ink: 0.04 }, "hex");
  v.cyl("#e9ecf8", 1.2, 1.6, 0, 1.0, 0, { ink: 0.03 }, "hex");
  // ten petals reaching up and out, their tips lit
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    const h = 2.6 + (i % 3) * 0.75 + (i === 3 ? 0.8 : 0);
    const r0 = 1.0;
    const out = 0.55 + (i % 2) * 0.12;
    const bx = Math.sin(a) * r0,
      bz = Math.cos(a) * r0;
    v.frame(x + bx, 0.8, z + bz, a);
    v.box(WHITE, 0.9, h, 0.5, 0, h / 2, 0, { rx: out, ink: 0.04 });
    v.add("cone6", WHITE, 0.9, 0.9, 0.5, 0, h + 0.3, Math.sin(out) * 0.2, { rx: out, ink: 0.03 });
    const tip = h + 0.5;
    N.frame(x + bx, 0.8, z + bz, a);
    N.orb("#ffe2a8", 0.14, 0, Math.cos(out) * tip, Math.sin(out) * tip, 1.2);
  }
  pools.add(x, z, 4, "#ffe2a8", 0.06, 0.6);
  paint.shadow(x, z, 2.4, 2.4, 0.4);
}

// ---- the bay theatre: two spiky domes ------------------------------------------------------------------------------

function domes(k: Kit, N: Neon) {
  const { v, pools, paint, ground, words } = k;
  for (const [x, z, r, yaw] of [
    [-22.6, -21.2, 4.2, 0.25],
    [-30, -16.6, 3.6, 0.9],
  ] as [number, number, number, number][]) {
    ground.take(x, z, r + 0.6);
    v.frame(x, 0, z, yaw);
    // the shell (lit warm from inside), its base of glass
    v.ball("#a3978a", r, r * 0.78, r * 1.18, 0, 0.2, 0, { ink: 0.05 });
    v.cyl("#3a3352", r * 1.02, 0.9, 0, 0.45, 0, { ink: 0.03 });
    N.frame(x, 0, z, yaw);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      N.box("#ffcf8a", 0.9, 0.55, 0.06, Math.sin(a) * r * 1.0, 0.5, Math.cos(a) * r * 1.18, { ry: a, k: 0.9 });
    }
    // the sun shades: rings of spikes all over
    for (let ring = 1; ring <= 6; ring++) {
      const p = (ring / 7) * (Math.PI / 2);
      const n = Math.round(22 * Math.cos(p)) + 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.37;
        const px = Math.sin(a) * r * Math.cos(p),
          py = 0.2 + r * 0.78 * Math.sin(p),
          pz = Math.cos(a) * r * 1.18 * Math.cos(p);
        // (pointing out along the shell's normal, roughly)
        tv.set(px / r, (py - 0.2) / (r * 0.78), pz / (r * 1.18)).normalize();
        tq.setFromUnitVectors(Y, tv);
        te.setFromQuaternion(tq, "XYZ");
        v.add("cone6", ring % 2 ? "#e2d8bc" : "#cfc3a4", 0.55, 0.75, 0.55, px, py, pz, { rx: te.x, ry: te.y, rz: te.z });
      }
    }
    N.orb("#ffe2a8", 0.2, 0, r * 0.78 + 0.3, 0, 1.3);
    pools.add(x, z, r * 2.2, "#ffcf8a", 0.06, 0.7);
    paint.shadow(x, z, r * 1.1, r * 1.25, 0.4);
  }
  // the theatre's sign by the water
  v.frame(-17.6, 0, -18.8, 0.3);
  v.box("#2a2450", 4.2, 0.9, 0.3, 0, 1.0, 0, { ink: 0.04 });
  for (const s of [-1.6, 1.6]) v.box("#2a2450", 0.2, 1.0, 0.2, s, 0.3, 0);
  words.add("BAY THEATRE", 0.62, -17.6 + Math.sin(0.3) * 0.17, 1.0, -18.8 + Math.cos(0.3) * 0.17, 0.3, { fg: "#ffcf8a", neon: true, w: 3.9 });
}

// ---- the lion fountain ---------------------------------------------------------------------------------------------

function lion(k: Kit, N: Neon, d: LandmarkDef) {
  const { v, pools, paint, ground, words } = k;
  const { x, z } = d;
  const r = d.rot ?? 0;
  ground.take(x, z, 2.2);
  v.frame(x, 0, z, r);
  // the pedestal, steps down to the water
  v.cyl("#b9b2cc", 1.9, 0.6, 0, 0.3, 0, { ink: 0.04 }, "hex");
  v.cyl("#d6d0e6", 1.4, 0.7, 0, 0.95, 0, { ink: 0.035 }, "hex");
  // the fish's body: a pale column, scales down its front, a tail curling up behind into a fin
  v.box(WHITE, 1.3, 2.3, 1.15, 0, 2.45, -0.05, { rx: -0.08, ink: 0.05 });
  for (let row = 0; row < 4; row++) for (const sx of [-0.33, 0.33]) v.add("orb", "#e2e6f4", 0.42, 0.3, 0.16, sx + (row % 2) * 0.16 - 0.08, 1.75 + row * 0.42, 0.55, { ink: 0.012 });
  v.box(WHITE, 0.9, 0.7, 1.2, 0, 1.55, -0.9, { ink: 0.04 });
  v.box(WHITE, 0.7, 0.9, 0.7, 0, 2.15, -1.55, { rx: -0.5, ink: 0.04 });
  v.box(WHITE, 0.5, 0.9, 0.5, 0, 2.95, -1.85, { rx: -0.15, ink: 0.035 });
  for (const s2 of [-1, 1]) v.add("wedge", "#e6e9f6", 0.2, 1.1, 0.9, s2 * 0.18, 3.75, -1.85 + s2 * 0.0, { rz: s2 * 0.55, rx: 0.2, ink: 0.03 });
  // the lion's head: a block of a head, a ruff of mane round it, a snout, brows, ears, an open mouth
  v.box(WHITE, 1.45, 1.25, 1.25, 0, 4.15, 0.25, { ink: 0.05 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    if (Math.sin(a) < -0.55) continue;
    v.box(i % 2 ? "#e9ecf8" : "#dcdff0", 0.5, 0.95, 0.42, Math.cos(a) * 0.95, 4.15 + Math.sin(a) * 0.85, -0.2, { rz: a - Math.PI / 2, ink: 0.02 });
  }
  v.box(WHITE, 0.95, 0.62, 0.55, 0, 3.92, 1.05, { ink: 0.035 });
  v.box("#2a2450", 0.34, 0.2, 0.12, 0, 4.12, 1.33);
  v.box("#2a2450", 0.62, 0.22, 0.3, 0, 3.55, 1.12);
  for (const s2 of [-0.36, 0.36]) {
    v.add("orb", "#1a1033", 0.2, 0.2, 0.12, s2, 4.45, 0.9);
    v.box("#e9ecf8", 0.38, 0.1, 0.2, s2, 4.66, 0.9, { rz: s2 > 0 ? -0.2 : 0.2 });
    v.add("cone6", WHITE, 0.32, 0.45, 0.25, s2 * 1.4, 4.95, 0.1, { rz: s2 > 0 ? -0.3 : 0.3, ink: 0.02 });
  }
  // lit from below
  N.frame(x, 0, z, r);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    N.box("#bfe6ff", 0.4, 0.16, 0.2, Math.sin(a) * 1.82, 0.62, Math.cos(a) * 1.82, { ry: a, k: 1.1 });
  }
  pools.add(x, z, 4.4, "#bfe6ff", 0.06, 0.9);
  paint.shadow(x, z, 2, 2, 0.4);
  // the plaque
  v.frame(x - 2.2, 0, z + 1.6, 0);
  v.box("#2a2450", 2.4, 0.5, 0.2, 0, 0.7, 0, { ink: 0.03 });
  words.add(d.label ?? "LION FOUNTAIN", 0.36, x - 2.2, 0.7, z + 1.71, 0, { fg: "#bfe6ff", w: 2.3 });
}

// ---- the sky wheel -------------------------------------------------------------------------------------------------

function wheel(k: Kit, N: Neon, d: LandmarkDef) {
  const { v, pools, paint, ground, words, life } = k;
  const { x, z } = d;
  const r = d.rot ?? 0;
  const R = 7.6,
    HY = 9.8;
  // (the plane's axes: the axle along the facing, `side` across it)
  const axle = new THREE.Vector3(Math.sin(r), 0, Math.cos(r));
  const side = new THREE.Vector3(Math.cos(r), 0, -Math.sin(r));
  ground.take(x, z, 6);
  // the legs: an A-frame each side of the wheel, from the ground to the hub; the hub's axle
  v.frame(0, 0, 0, 0);
  for (const s of [-1, 1]) {
    const ax = x + axle.x * 1.6 * s,
      az = z + axle.z * 1.6 * s;
    for (const f of [-1, 1]) strut((...a) => v.add(...a), STEEL, P(ax + side.x * 5.6 * f, 0, az + side.z * 5.6 * f), P(x + axle.x * 1.0 * s, HY, z + axle.z * 1.0 * s), 0.42, "cyl8");
    strut((...a) => v.add(...a), STEEL, P(ax + side.x * 3.4, 3.4, az + side.z * 3.4), P(ax - side.x * 3.4, 3.4, az - side.z * 3.4), 0.24, "cyl8");
  }
  strut((...a) => v.add(...a), "#9aa0bc", P(x - axle.x * 1.2, HY, z - axle.z * 1.2), P(x + axle.x * 1.2, HY, z + axle.z * 1.2), 0.7, "cyl");
  // the terminal at its foot (toward the gate), low, glass, its sign
  const gx = x - side.x * 0.2 + axle.x * 4.6,
    gz = z - side.z * 0.2 + axle.z * 4.6;
  v.frame(gx, 0, gz, r);
  v.box("#2e3566", 6.4, 1.6, 2.6, 0, 0.8, 0, { ink: 0.04 });
  v.box("#cfd6f0", 6.8, 0.25, 3.0, 0, 1.7, 0, { ink: 0.02 });
  N.frame(gx, 0, gz, r);
  N.box("#ffe2a8", 5.8, 0.7, 0.06, 0, 0.85, 1.32, { k: 0.8 });
  words.add(d.label ?? "SKY WHEEL", 0.55, gx + axle.x * 1.36, 2.25, gz + axle.z * 1.36, r, { fg: "#ff3fd0", neon: true, w: 4.2 });
  pools.add(gx, gz, 4.2, "#ffcf8a", 0.06, 0.6);
  paint.shadow(x, z, 5.6, 2.4, 0.4);
  // the ring (it turns: a group of its own) — rim, spokes, lights round the rim
  const ring = new THREE.Group();
  ring.position.set(x, HY, z);
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axle);
  const rv = new Neon();
  const rs = new Vox(k.ink);
  const seg = 28;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2,
      a1 = ((i + 1) / seg) * Math.PI * 2;
    for (const off of [-0.32, 0.32]) {
      strut((...a) => rs.add(...a), WHITE, P(Math.cos(a0) * R, Math.sin(a0) * R, off), P(Math.cos(a1) * R, Math.sin(a1) * R, off), 0.24);
    }
    // the lights: a ring of bulbs, colours round the wheel
    rv.orb(NEON[i % NEON.length], 0.16, Math.cos(a0) * (R + 0.12), Math.sin(a0) * (R + 0.12), 0.34, 1.5);
    rv.orb(NEON[(i + 3) % NEON.length], 0.12, Math.cos(a0 + 0.11) * (R - 0.5), Math.sin(a0 + 0.11) * (R - 0.5), -0.34, 1.3);
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    for (const off of [-0.5, 0.5]) strut((...a2) => rs.add(...a2), "#d6daea", P(0, 0, off * 1.6), P(Math.cos(a) * R, Math.sin(a) * R, off * 0.6), 0.09);
    rv.box("#3ef0ff", 0.06, R - 1.2, 0.06, Math.cos(a) * (R / 2 + 0.3), Math.sin(a) * (R / 2 + 0.3), 0, { rz: a - Math.PI / 2, k: 0.7 });
  }
  rs.cyl("#e2e6f4", 0.9, 1.8, 0, 0, 0, { rx: Math.PI / 2, ink: 0.04 }, "cyl8");
  // (the cabins' brackets, out from the rim)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    strut((...q) => rs.add(...q), WHITE, P(Math.cos(a) * R, Math.sin(a) * R, 0), P(Math.cos(a) * (R + CAB_OUT - 0.55), Math.sin(a) * (R + CAB_OUT - 0.55), 0), 0.18);
  }
  rv.orb("#ffffff", 0.5, 0, 0, 1.0, 1.6);
  rs.build(ring);
  rv.build(ring);
  k.parent.add(ring);
  // the cabins: they hang level as the ring turns (instanced, their matrices set each frame)
  const nCab = 16;
  const parts: [Shape, string, boolean, [number, number, number], [number, number, number]][] = [
    ["orb", "#e8ecfa", false, [1.5, 1.2, 2.1], [0, 0, 0]],
    ["box", "#bfe6ff", true, [1.56, 0.42, 1.8], [0, 0.04, 0]],
    ["box", "#9aa0bc", false, [1.0, 0.1, 1.4], [0, 0.6, 0]],
  ];
  const cabins: THREE.InstancedMesh[] = [];
  const cabinParts: THREE.Matrix4[][] = [];
  const ink = new THREE.InstancedMesh(SHAPES.orb, k.ink, nCab);
  const lm = (sc: [number, number, number], p: [number, number, number]) => new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion(), new THREE.Vector3(...sc));
  for (const [shape, c, lit, sc, p] of parts) {
    const m = new THREE.InstancedMesh(SHAPES[shape], lit ? nmat() : toon("#ffffff"), nCab);
    for (let i = 0; i < nCab; i++) m.setColorAt(i, new THREE.Color(lit ? pick(["#bfe6ff", "#ffe2a8", "#ffb6e6"], i * 0.37) : c).multiplyScalar(lit ? 1.3 : 1));
    m.frustumCulled = false;
    m.raycast = () => {};
    k.parent.add(m);
    cabins.push(m);
    cabinParts.push([lm(sc, p)]);
  }
  ink.frustumCulled = false;
  ink.raycast = () => {};
  k.parent.add(ink);
  cabins.push(ink);
  cabinParts.push([lm([1.5 + 0.1, 1.2 + 0.1, 2.1 + 0.1], [0, 0, 0])]);
  // the gate's arch over the boarding spaces
  life.flag(x + side.x * 6.2, 4.2, z + side.z * 6.2, r, "#ff3fd0", 1);
  life.flag(x - side.x * 6.2, 4.2, z - side.z * 6.2, r, "#3ef0ff", 1);
  pools.add(x, z, 9, "#ff3fd0", 0.05, 0.35);
  const st = S!;
  st.ring = ring;
  st.hub = new THREE.Vector3(x, HY, z);
  st.axle = axle;
  st.side = side;
  st.R = R;
  st.cabins = cabins;
  st.cabinParts = cabinParts;
  st.nCab = nCab;
}

// ---- the supertree grove and its skyway --------------------------------------------------------------------------------

/** The supertrees: (x, z, height, colour). */
const TREES: [number, number, number, string][] = [
  [27.6, -19.8, 11.5, "#ff3fd0"],
  [23.6, -21.8, 13, "#9a6bff"],
  [19.8, -23.8, 11, "#3ef0ff"],
  [25.8, -26.6, 14, "#ff6b35"],
  [29.8, -24.4, 10, "#5effa8"],
  [21.4, -29, 9.5, "#ff3fd0"],
  [27.4, -31.2, 8, "#3ef0ff"],
  [23.8, -33.2, 6.5, "#ffd23f"],
];

function grove(k: Kit, N: Neon) {
  const { v, pools, paint, ground, life } = k;
  for (const [x, z, h0, c] of TREES) {
    // (no taller than the turn camera allows, much: the canopies are open lattices)
    const h = Math.max(5.5, Math.min(h0, ground.maxH(x, z, 1.4) * 1.5 + 2.5));
    ground.take(x, z, 1.6);
    v.frame(x, 0, z, 0);
    // the trunk: a planter, a column widening upward, purple ribs
    v.cyl("#3a2f5c", 1.3, 0.7, 0, 0.35, 0, { ink: 0.04 }, "hex");
    const n = Math.round(h / 1.4);
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const rr = 0.42 + f * f * 0.9;
      v.cyl(i % 2 ? "#4a3a6e" : "#3e3060", rr, h / n + 0.02, 0, 0.7 + (i + 0.5) * ((h - 2.6) / n), 0, {}, "hex");
    }
    // the vines up the trunk: lit ribs (the canopy's lit pieces below are in the same frame)
    N.frame(x, 0, z, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      for (let j = 0; j < 3; j++) {
        const y0 = 1 + j * ((h - 3) / 3);
        const rr = 0.46 + ((j + 0.5) / 3) ** 2 * 0.9;
        N.box(c, 0.07, (h - 3) / 3 - 0.2, 0.07, Math.sin(a) * rr, y0 + (h - 3) / 6, Math.cos(a) * rr, { k: 0.75 });
      }
    }
    // the canopy: an open lattice of ribs out to a lit rim, a dark crown in the middle
    const top = h - 1.3;
    const cr = 2.4 + h * 0.13;
    v.frame(x, 0, z, 0);
    v.add("cone6", "#3a2f5c", cr * 0.9, 1.4, cr * 0.9, 0, top + 0.2, 0, { rx: Math.PI, ink: 0.04 });
    const nr = 14;
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * Math.PI * 2,
        a1 = ((i + 1) / nr) * Math.PI * 2;
      // the ribs out and up from the trunk's crown, a ring of lit tube round their tips, lights on it
      strut((...q) => v.add(...q), "#4a3a6e", P(Math.sin(a) * 0.8, top - 0.9, Math.cos(a) * 0.8), P(Math.sin(a) * cr, top + 1.0, Math.cos(a) * cr), 0.13);
      strut((...q) => v.add(...q), "#4a3a6e", P(Math.sin(a) * cr * 0.55, top + 0.15, Math.cos(a) * cr * 0.55), P(Math.sin(a1) * cr * 0.55, top + 0.15, Math.cos(a1) * cr * 0.55), 0.08);
      strut((...q) => N.add(...q), c, P(Math.sin(a) * cr, top + 1.0, Math.cos(a) * cr), P(Math.sin(a1) * cr, top + 1.0, Math.cos(a1) * cr), 0.09);
      if (i % 2 === 0) strut((...q) => N.add(...q), c, P(Math.sin(a) * cr * 0.58, top + 0.2, Math.cos(a) * cr * 0.58), P(Math.sin(a) * cr * 0.95, top + 0.95, Math.cos(a) * cr * 0.95), 0.05);
      N.orb(i % 2 ? c : "#ffffff", 0.15, Math.sin(a) * cr, top + 1.08, Math.cos(a) * cr, 1.5);
    }
    pools.add(x, z, 3.2, c, 0.06, 0.8);
    paint.shadow(x, z, 1.4, 1.4, 0.4);
    life.motesAt(x, top * 0.6, z, 2.2, top * 0.5, 4, [c, "#ffffff"]);
  }
  // the glass conservatories in the north-east: two flower domes, ribbed, glowing green
  for (const [x, z, rx, rz, yaw] of [
    [41.4, -38.6, 4.2, 3.2, 0.5],
    [33.4, -44.6, 3.4, 2.8, 0.2],
  ] as [number, number, number, number, number][]) {
    ground.take(x, z, rx + 0.4);
    v.frame(x, 0, z, yaw);
    v.ball("#3a6a6e", rx, rx * 0.72, rz, 0, 0, 0, { ink: 0.05 });
    N.frame(x, 0, z, yaw);
    for (let i = 0; i < 9; i++) {
      const f = (i / 8 - 0.5) * 2;
      const rr = Math.sqrt(Math.max(0, 1 - f * f));
      N.add("torus", "#9fffd6", rr * rz * 2.02, rr * rx * 0.72 * 2.02, 1, f * rx * 0.98, 0, 0, { ry: Math.PI / 2, k: 0.55 });
    }
    N.box("#c8ffe8", rx * 1.6, 0.5, 0.06, 0, 0.4, rz * 0.98, { k: 0.6 });
    pools.add(x, z, rx * 2, "#5effa8", 0.06, 0.6);
    paint.shadow(x, z, rx, rz, 0.4);
  }
  // flower beds round the grove's lawns
  for (let i = 0; i < 40; i++) {
    const a = i * 2.39,
      rr = 3 + (i % 9) * 1.1;
    const fx = 25 + Math.cos(a) * rr,
      fz = -27 + Math.sin(a) * rr * 0.9;
    if (!ground.free(fx, fz, 0.6, 0.4)) continue;
    v.frame(fx, 0, fz, a);
    for (let f = 0; f < 4; f++) v.add("orb", pick(["#ff5fa2", "#ffd23f", "#c4b1fc", "#ffffff", "#ff8a4c"], (i + f) * 0.21), 0.24, 0.24, 0.24, (f - 1.5) * 0.3, 0.16, (f % 2) * 0.25);
  }
}

function skyway(k: Kit, N: Neon) {
  const { v, g, pools } = k;
  const sky = g.spaces.filter((s) => s.y > 2);
  if (!sky.length) return;
  const y = sky[0].y;
  const deck = (a: THREE.Vector3, b: THREE.Vector3, rails = true) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const pitch = -Math.atan2(b.y - a.y, len);
    const mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2,
      mz = (a.z + b.z) / 2;
    const L = Math.hypot(len, b.y - a.y);
    v.frame(mx, my, mz, yaw);
    v.box("#4a3a6e", 2.4, 0.32, L + 0.3, 0, -0.2, 0, { rx: pitch, ink: 0.04 });
    v.box("#cfc8e6", 2.2, 0.06, L + 0.2, 0, -0.02, 0, { rx: pitch });
    if (!rails) return;
    N.frame(mx, my, mz, yaw);
    for (const s of [-1, 1]) {
      v.box("#6a5a96", 0.08, 0.08, L, s * 1.15, 0.9, 0, { rx: pitch });
      N.box("#3ef0ff", 0.06, 0.06, L, s * 1.15, 0.35, 0, { rx: pitch, k: 1.1 });
      for (let t = -L / 2 + 0.4; t < L / 2; t += 1.1) v.box("#6a5a96", 0.06, 0.9, 0.06, s * 1.15, 0.45, t * Math.cos(pitch), {});
    }
  };
  // round each sky space a deck, and decks between them; columns down to the ground
  for (let i = 0; i < sky.length; i++) {
    const s = sky[i];
    v.frame(s.x, s.y, s.z, 0);
    v.cyl("#4a3a6e", 1.55, 0.32, 0, -0.2, 0, { ink: 0.04 }, "hex");
    v.cyl("#cfc8e6", 1.45, 0.06, 0, -0.02, 0, {}, "hex");
    v.frame(s.x, 0, s.z, 0);
    v.cyl("#3a2f5c", 0.28, s.y - 0.3, 0, (s.y - 0.3) / 2, 0, { ink: 0.03 }, "hex");
    for (const e of s.next) {
      const b = g.spaces[e.to];
      if (b.y > 2) deck(P(s.x, s.y, s.z), P(b.x, b.y, b.z));
    }
  }
  // the stairs up from the junction, down to the bayfront
  const first = sky[0],
    last = sky[sky.length - 1];
  for (const [lo, hi] of [
    [g.spaces[first.prev[0]], first],
    [g.spaces[last.next[0].to], last],
  ]) {
    if (!lo) continue;
    const a = P(lo.x + (hi.x - lo.x) * 0.3, 0.2, lo.z + (hi.z - lo.z) * 0.3);
    const b = P(hi.x - (hi.x - lo.x) * 0.25, hi.y, hi.z - (hi.z - lo.z) * 0.25);
    deck(a, b, true);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    for (let t = 0.1; t < 1; t += 0.11) {
      v.frame(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, yaw);
      v.box("#e8e2f6", 2.2, 0.08, 0.3, 0, 0.02, 0);
    }
    void len;
    pools.add(a.x, a.z, 2.4, "#3ef0ff", 0.06, 0.6);
  }
  N.frame(0, 0, 0, 0);
  void y;
}

// ---- the helix bridge ----------------------------------------------------------------------------------------------

function helix(k: Kit, N: Neon) {
  const { v, g, pools } = k;
  const sp = g.spaces.filter((s) => s.path === "helix");
  if (sp.length < 2) return;
  const a = sp[0],
    b = sp[sp.length - 1];
  const x = a.x;
  const z0 = a.z - 1.2,
    z1 = b.z + 1.2;
  // the deck over the water, its piers
  v.frame(x, 0, (z0 + z1) / 2, 0);
  v.box("#5a5486", 4.4, 0.7, Math.abs(z1 - z0), 0, -0.3, 0, { ink: 0.05 });
  v.box("#c9c2e0", 4.0, 0.08, Math.abs(z1 - z0), 0, 0.08, 0);
  for (let zz = z0 - 2; zz > z1 + 1; zz -= 4.5) {
    v.frame(x, 0, zz, 0);
    v.box("#4a446e", 1.2, 3, 1.6, 0, -2, 0, { ink: 0.03 });
  }
  // the double helix round the walk: two spirals of steel, lit beads, rings tying them
  const RR = 2.55,
    cy = 1.55,
    pitch = 4.2;
  const pt = (zz: number, ph: number, out: THREE.Vector3) => {
    const t = ((zz - z0) / pitch) * Math.PI * 2 + ph;
    return out.set(x + Math.cos(t) * RR, Math.max(0.15, cy + Math.sin(t) * RR), zz);
  };
  const A = new THREE.Vector3(),
    B = new THREE.Vector3();
  v.frame(0, 0, 0, 0);
  N.frame(0, 0, 0, 0);
  for (const [ph, c] of [
    [0, "#ff3fd0"],
    [Math.PI, "#3ef0ff"],
  ] as [number, string][]) {
    for (let zz = z0; zz > z1; zz -= 0.55) {
      pt(zz, ph, A);
      pt(zz - 0.55, ph, B);
      if (A.y < 0.3 && B.y < 0.3) continue;
      strut((...q) => v.add(...q), STEEL, A, B, 0.16, "box");
      if (Math.round((z0 - zz) / 0.55) % 2 === 0) N.orb(c, 0.16, A.x, A.y, A.z, 1.6);
    }
  }
  for (let zz = z0 - 1; zz > z1; zz -= 3) {
    for (let i = 0; i < 10; i++) {
      const t0 = (i / 10) * Math.PI * 2,
        t1 = ((i + 1) / 10) * Math.PI * 2;
      A.set(x + Math.cos(t0) * RR * 0.92, cy + Math.sin(t0) * RR * 0.92, zz);
      B.set(x + Math.cos(t1) * RR * 0.92, cy + Math.sin(t1) * RR * 0.92, zz);
      if (A.y < 0.3 || B.y < 0.3) continue;
      strut((...q) => v.add(...q), "#9aa0bc", A, B, 0.07, "box");
    }
  }
  // lights along the deck's edges
  N.frame(x, 0, 0, 0);
  for (const s of [-1, 1]) N.box("#bfe6ff", 0.06, 0.06, Math.abs(z1 - z0), s * 2.05, 0.16, (z0 + z1) / 2, { k: 1 });
  pools.add(x, (z0 + z1) / 2, 6, "#ff3fd0", 0.0, 0.25);
}

// ---- the hawker centre --------------------------------------------------------------------------------------------

function hawker(k: Kit, N: Neon, d: LandmarkDef) {
  const { v, pools, paint, ground, life, words } = k;
  const { x, z } = d;
  const R = 3.5;
  ground.take(x, z, R + 0.6);
  // the octagon: slim cast-iron columns, an open hall, a two-tier roof, the clock tower
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    v.frame(x + Math.sin(a) * R, 0, z + Math.cos(a) * R, a);
    v.box("#2f5a52", 0.22, 2.6, 0.22, 0, 1.3, 0, { ink: 0.02 });
    v.box("#d8d2e8", 0.36, 0.2, 0.36, 0, 2.62, 0);
  }
  v.frame(x, 0, z, Math.PI / 8);
  v.cyl("#d8d2e8", R + 0.25, 0.32, 0, 2.86, 0, { ink: 0.04 }, "cyl8");
  v.add("cone", "#7fa2ae", (R + 0.8) * 2, 1.0, (R + 0.8) * 2, 0, 3.5, 0, { ink: 0.05 });
  v.cyl("#e8e2f4", R + 0.85, 0.12, 0, 3.02, 0, {}, "cyl8");
  v.cyl("#e8e2f4", 1.7, 0.8, 0, 4.25, 0, { ink: 0.035 }, "cyl8");
  v.add("cone", "#7fa2ae", 4.2, 0.8, 4.2, 0, 5.0, 0, { ink: 0.04 });
  // the clock tower
  v.frame(x, 0, z, 0);
  v.box("#e8e2f4", 1.0, 3.4, 1.0, 0, 6.4, 0, { ink: 0.04 });
  v.box("#d8d2e8", 1.25, 0.3, 1.25, 0, 8.2, 0);
  v.add("cone", "#7fa2ae", 1.5, 1.6, 1.5, 0, 9.1, 0, { ry: Math.PI / 4, ink: 0.035 });
  // strings of bulbs from the tower down to the eaves
  for (let q = 0; q < 8; q++) {
    const a = (q / 8) * Math.PI * 2 + Math.PI / 8;
    for (let t = 0.1; t < 1; t += 0.12) {
      const ex = Math.sin(a) * (R + 0.7) * t,
        ez = Math.cos(a) * (R + 0.7) * t;
      N.frame(x, 0, z, 0);
      N.orb(q % 2 ? "#ffd23f" : "#ff9a6a", 0.08, ex, 8.0 - t * 5.0 - Math.sin(t * Math.PI) * 0.5, ez, 1.6);
    }
  }
  v.cyl("#d8d2e8", 0.05, 1.0, 0, 10.3, 0, {}, "cyl8");
  for (let q = 0; q < 4; q++) {
    const yaw = (q / 4) * Math.PI * 2;
    N.frame(x, 0, z, yaw);
    N.add("cyl8", "#fff3d0", 0.66, 0.05, 0.66, 0, 7.4, 0.51, { rx: Math.PI / 2, k: 1.1 });
    v.frame(x, 0, z, yaw);
    v.box("#1a1033", 0.05, 0.28, 0.02, 0, 7.48, 0.545);
    v.box("#1a1033", 0.2, 0.04, 0.02, 0.06, 7.4, 0.545);
  }
  N.frame(x, 0, z, 0);
  N.orb("#ffd23f", 0.12, 0, 10.85, 0, 1.6);
  // inside: warm light, round tables and stools, the stalls round the wall, diners
  N.frame(x, 0, z, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    N.box("#ffcf8a", 1.6, 0.12, 0.08, Math.sin(a) * (R - 0.05), 2.42, Math.cos(a) * (R - 0.05), { ry: a + Math.PI / 2, k: 0.9 });
    N.box("#ffe2a8", 1.7, 0.06, 0.06, Math.sin(a) * (R + 0.82), 3.0, Math.cos(a) * (R + 0.82), { ry: a + Math.PI / 2, k: 1.1 });
    // a stall against the wall, its lit sign
    const sx = x + Math.sin(a + 0.2) * (R - 0.9),
      sz = z + Math.cos(a + 0.2) * (R - 0.9);
    if (Math.cos(a) > 0.6) continue;
    v.frame(sx, 0, sz, a + Math.PI);
    v.box("#e9e2d2", 1.3, 0.9, 0.6, 0, 0.45, 0, { ink: 0.02 });
    N.frame(sx, 0, sz, a + Math.PI);
    N.box(NEON[i % NEON.length], 1.1, 0.24, 0.05, 0, 1.75, -0.2, { k: 1 });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const tx = x + Math.sin(a) * 1.7,
      tz = z + Math.cos(a) * 1.7;
    v.frame(tx, 0, tz, a);
    v.cyl("#f2ece0", 0.42, 0.06, 0, 0.72, 0, { ink: 0.015 }, "cyl8");
    v.cyl("#5a4a6a", 0.06, 0.7, 0, 0.36, 0, {}, "cyl8");
    for (let s = 0; s < 3; s++) v.cyl("#ff6b35", 0.15, 0.42, Math.sin(s * 2.1) * 0.7, 0.21, Math.cos(s * 2.1) * 0.7, {}, "cyl8");
    if (i % 2 === 0) life.npc(tx + Math.sin(a) * 0.75, tz + Math.cos(a) * 0.75, a + Math.PI, true);
  }
  pools.add(x, z, R + 2.6, "#ffcf8a", 0.06, 0.95);
  paint.shadow(x, z, R + 0.3, R + 0.3, 0.35);
  // its name over the south door
  v.frame(x, 0, z + R + 0.2, 0);
  v.box("#2f5a52", 3.0, 0.5, 0.12, 0, 2.95, 0);
  words.add(d.label ?? "HAWKER CENTRE", 0.36, x, 2.95, z + R + 0.28, 0, { fg: "#ffe2a8", w: 2.8 });
  life.smokeAt(x - 1.8, 2.4, z - 1.6);
  life.smokeAt(x + 2.0, 2.4, z - 1.0);
}

// ---- satay street: grills along the start, smoke, string lights --------------------------------------------------------

function satay(k: Kit, N: Neon) {
  const { v, g, pools, paint, ground, life, words } = k;
  const sp = g.spaces.filter((s) => s.path === "start");
  // grill carts south of the way, low (the turn camera looks over them)
  let n = 0;
  for (let i = 0; i < sp.length - 1; i++) {
    const a = sp[i],
      b = sp[i + 1];
    const mx = (a.x + b.x) / 2,
      mz = (a.z + b.z) / 2;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const px = Math.cos(yaw),
      pz = -Math.sin(yaw);
    // (south side: the normal pointing +z)
    const sgn = pz > 0 ? 1 : -1;
    const cx = mx + px * 3.9 * sgn,
      cz = mz + pz * 3.9 * sgn;
    if (!ground.free(cx, cz, 1.0, 0.6) || !ground.land(cx, cz, 1.2)) continue;
    ground.take(cx, cz, 1.3);
    const face = Math.atan2(mx - cx, mz - cz);
    v.frame(cx, 0, cz, face);
    v.box("#8a3a3a", 1.8, 0.75, 0.8, 0, 0.5, 0, { ink: 0.03 });
    v.box("#2a2440", 1.7, 0.1, 0.7, 0, 0.92, 0);
    for (const s of [-0.7, 0.7]) v.cyl("#2a2440", 0.18, 0.1, s, 0.18, 0.42, { rz: Math.PI / 2 }, "cyl8");
    for (let q = 0; q < 6; q++) v.box("#8a4a24", 0.05, 0.05, 0.6, -0.6 + q * 0.24, 1.0, 0, {});
    N.frame(cx, 0, cz, face);
    N.box("#ff6b35", 1.5, 0.05, 0.5, 0, 0.98, 0, { k: 1.2 });
    // an umbrella, low
    v.cyl("#5a4a6a", 0.04, 1.4, 0.75, 0.9, -0.3, {}, "cyl8");
    v.cone(pick(["#ff3d56", "#ffd23f", "#3ec6ff", "#33d67c"], n * 0.31), 0.72, 0.55, 0.75, 1.85, -0.3, { ink: 0.025 });
    life.smokeAt(cx, 1.3, cz);
    if (n % 2 === 0) life.sparkAt(cx, 1.05, cz, 0.5);
    pools.add(cx, cz, 2.2, "#ff8a3a", 0.06, 0.9);
    paint.shadow(cx, cz, 1.1, 0.7, 0.3);
    if (n % 3 === 1) life.npc(cx - Math.sin(face) * 0.9, cz - Math.cos(face) * 0.9, face + Math.PI);
    n++;
  }
  // string lights on poles along the north side, across the street
  const poles: THREE.Vector3[] = [];
  for (let i = 0; i < sp.length; i += 2) {
    const s = sp[i];
    const px = s.x,
      pz = s.z - 2.3;
    if (!ground.free(px, pz, 0.3, 0.3)) continue;
    v.frame(px, 0, pz, 0);
    v.cyl(DARK, 0.06, 3.6, 0, 1.8, 0, {}, "cyl8");
    poles.push(P(px, 3.5, pz));
  }
  for (let i = 0; i + 1 < poles.length; i++) {
    const a = poles[i],
      b = poles[i + 1];
    for (let t = 0.08; t < 1; t += 0.12) {
      const y = a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 0.5;
      N.orb(pick(["#ffe2a8", "#ffd23f", "#ff9a6a"], t * 7 + i), 0.09, a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t, 1.6);
    }
  }
  // the street's sign on its poles, north of the way
  const s2 = sp[2];
  const bx = s2.x,
    bz = s2.z - 2.6;
  if (ground.free(bx, bz, 0.4, 0.3)) {
    ground.take(bx, bz, 1.2);
    v.frame(bx, 0, bz, 0);
    for (const s of [-1.5, 1.5]) v.box("#8a1020", 0.2, 3.4, 0.2, s, 1.7, 0, { ink: 0.025 });
    v.box("#8a1020", 3.6, 0.7, 0.24, 0, 3.3, 0, { ink: 0.035 });
    N.frame(bx, 0, bz, 0);
    N.box("#ffd23f", 3.7, 0.07, 0.28, 0, 2.92, 0, { k: 1.1 });
    words.add("SATAY STREET", 0.42, bx, 3.3, bz + 0.13, 0, { fg: "#ffd23f", neon: true, w: 3.4 });
  }
}

// ---- the night market -----------------------------------------------------------------------------------------------

function market(k: Kit, N: Neon) {
  const { v, g, pools, paint, ground, life, words } = k;
  const sp = g.spaces.filter((s) => s.path === "market");
  if (sp.length < 2) return;
  const placed: [number, number][] = [];
  const clear = (x: number, z: number, d: number) => placed.every(([px, pz]) => Math.hypot(px - x, pz - z) > d);
  let n = 0;
  const stall = (cx: number, cz: number, face: number) => {
    if (!ground.land(cx, cz, 1.2) || ground.onPath(cx, cz, 2.0) || !ground.free(cx, cz, 0.4, 0.8) || !clear(cx, cz, 2.2)) return false;
    const h = Math.min(2.5, room(k, cx, cz, 1.2));
    if (h < 1.7) return false;
    placed.push([cx, cz]);
    ground.take(cx, cz, 1.0);
    const c = NEON[n % NEON.length];
    v.frame(cx, 0, cz, face);
    v.box("#f2ece0", 2.0, 0.85, 0.95, 0, 0.43, 0, { ink: 0.025 });
    for (const sx of [-0.92, 0.92]) for (const sz of [-0.42, 0.42]) v.box(DARK, 0.08, h, 0.08, sx, h / 2, sz);
    // a striped canopy, goods on the counter
    for (let q = 0; q < 4; q++) v.box(q % 2 ? "#ffffff" : pick(["#ff3d56", "#3ec6ff", "#ffd23f", "#33d67c", "#c4b1fc", "#ff8a4c"], n * 0.29), 0.54, 0.08, 1.35, -0.81 + q * 0.54, h + 0.05, 0.1, { rx: 0.18, ink: 0.012 });
    for (let q = 0; q < 5; q++) v.add("orb", pick(["#ff3d56", "#ffd23f", "#7ad35a", "#ff8a2e", "#ffffff", "#c4b1fc"], (n + q) * 0.17), 0.24, 0.24, 0.24, -0.7 + q * 0.35, 0.98, 0.2);
    N.frame(cx, 0, cz, face);
    N.box(c, 1.85, 0.24, 0.05, 0, h - 0.24, 0.54, { k: 1.1 });
    N.orb("#ffe2a8", 0.1, 0, h - 0.55, 0.15, 1.4);
    pools.add(cx + Math.sin(face) * 0.8, cz + Math.cos(face) * 0.8, 2.0, c, 0.06, 0.55);
    paint.shadow(cx, cz, 1.2, 0.8, 0.3);
    if (n % 3 === 0) life.npc(cx + Math.sin(face) * 1.05, cz + Math.cos(face) * 1.05, face + Math.PI);
    if (n % 4 === 0) life.smokeAt(cx, h + 0.2, cz);
    n++;
    return true;
  };
  // stalls along both sides of the way, facing it
  for (let i = 0; i < sp.length - 1; i++) {
    const a = sp[i],
      b = sp[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const px = (b.z - a.z) / len,
      pz = -(b.x - a.x) / len;
    for (let t = 0.6; t < len; t += 2.3)
      for (const side of [-1, 1]) {
        const cx = a.x + ((b.x - a.x) * t) / len + px * 3.3 * side,
          cz = a.z + ((b.z - a.z) * t) / len + pz * 3.3 * side;
        stall(cx, cz, Math.atan2(-px * side, -pz * side));
      }
  }
  // the yard inside the loop (between the night market and the quay): rows of stalls back to back, tables between
  const loop: [number, number][] = [g.spaces[sp[0].prev[0]], ...sp, ...g.spaces.filter((s) => s.path === "helix").slice(0, 1), ...g.spaces.filter((s) => s.path === "quay").reverse()].map((s) => [s.x, s.z]);
  let row = 0;
  for (let z = 8; z < 21; z += 2.9, row++)
    for (let x = 17; x < 33; x += 2.3) {
      if (!inside(loop, x, z)) continue;
      if (row % 2 === 0) stall(x, z, Math.PI);
      else if (!stall(x, z, 0) && ground.land(x, z, 1) && !ground.onPath(x, z, 1.8) && clear(x, z, 1.8) && ground.free(x, z, 0.3, 0.6)) {
        // a table, its stools, an umbrella, diners
        placed.push([x, z]);
        ground.take(x, z, 0.9);
        v.frame(x, 0, z, row);
        v.cyl("#f2ece0", 0.45, 0.06, 0, 0.74, 0, { ink: 0.015 }, "cyl8");
        v.cyl("#5a4a6a", 0.06, 0.72, 0, 0.36, 0, {}, "cyl8");
        for (let q = 0; q < 4; q++) v.cyl("#ff6b35", 0.15, 0.42, Math.sin(q * 1.57) * 0.75, 0.21, Math.cos(q * 1.57) * 0.75, {}, "cyl8");
        v.cyl("#5a4a6a", 0.035, 2.0, 0, 1.0, 0, {}, "cyl8");
        v.cone(pick(["#ff3d56", "#ffd23f", "#3ec6ff", "#33d67c"], x * 0.13), 1.05, 0.5, 0, 2.05, 0, { ink: 0.02 });
        N.frame(x, 0, z, 0);
        N.orb("#ffe2a8", 0.09, 0, 1.7, 0, 1.5);
        if ((x + z) % 3 < 1.5) life.npc(x + 0.75, z, -Math.PI / 2, true);
        pools.add(x, z, 1.8, "#ffcf8a", 0.06, 0.5);
      }
    }
  // lanterns strung over the way
  for (let i = 0; i < sp.length - 1; i++) {
    const a = sp[i],
      b = sp[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const px = ((b.z - a.z) / len) * 2.7,
      pz = (-(b.x - a.x) / len) * 2.7;
    const mx = (a.x + b.x) / 2,
      mz = (a.z + b.z) / 2;
    for (let t = 0; t <= 1.001; t += 0.2) N.orb(t < 0.05 || t > 0.95 ? "#ffd23f" : "#ff3d40", 0.19, mx - px + px * 2 * t, 3.1 - Math.sin(t * Math.PI) * 0.45, mz - pz + pz * 2 * t, 1.25);
  }
  const s0 = sp[0];
  v.frame(s0.x + 1.6, 0, s0.z + 2.6, 0.4);
  for (const s of [-1.6, 1.6]) v.box(DARK, 0.2, 3.2, 0.2, s, 1.6, 0, { ink: 0.02 });
  v.box("#2a2450", 3.6, 0.7, 0.24, 0, 3.2, 0, { ink: 0.03 });
  words.add("NIGHT MARKET", 0.42, s0.x + 1.6 + Math.sin(0.4) * 0.13, 3.2, s0.z + 2.6 + Math.cos(0.4) * 0.13, 0.4, { fg: "#ff3fd0", neon: true, w: 3.3 });
}

// ---- the shophouse streets ------------------------------------------------------------------------------------------

function shophouse(k: Kit, N: Neon, x: number, z: number, yaw: number, h: number, w: number, i: number, sign: string | null) {
  const { v, words, pools, paint } = k;
  const c = PASTEL[i % PASTEL.length];
  const D = 3.2;
  v.frame(x, 0, z, yaw);
  // the body, set back behind its five-foot way (an arcade under the first floor)
  v.box(c, w, h, D, 0, h / 2, -0.4, { ink: 0.04 });
  v.box("#5a4a6a", w - 0.3, 1.9, 0.1, 0, 0.95, 1.36);
  v.box("#f4efe2", w + 0.05, 0.22, 0.6, 0, 2.15, 1.55);
  for (const s of [-1, 1]) v.box("#f4efe2", 0.26, 2.1, 0.26, s * (w / 2 - 0.15), 1.05, 1.7, { ink: 0.015 });
  // the upper floors' tall shuttered windows, a cornice, the tiled roof
  const floors = h > 5 ? 2 : 1;
  for (let f = 0; f < floors; f++)
    for (const s of [-1, 0, 1]) {
      if (w < 2.4 && s === 0) continue;
      v.box("#f4efe2", 0.55, 1.15, 0.06, s * w * 0.3, 3.45 + f * 1.75, 1.42);
      v.box(f % 2 ? "#2f7a6a" : "#3a8a7a", 0.2, 1.0, 0.08, s * w * 0.3 - 0.17, 3.45 + f * 1.75, 1.45);
      v.box(f % 2 ? "#2f7a6a" : "#3a8a7a", 0.2, 1.0, 0.08, s * w * 0.3 + 0.17, 3.45 + f * 1.75, 1.45);
    }
  v.box("#f4efe2", w + 0.2, 0.28, 0.3, 0, h - 0.1, 1.42, { ink: 0.02 });
  v.add("wedge", TILE, w + 0.1, 1.0, D + 0.2, 0, h + 0.45, -0.4, { ry: Math.PI, ink: 0.03 });
  N.frame(x, 0, z, yaw);
  N.box(i % 3 ? "#ffcf8a" : "#ffe2a8", w - 0.6, 1.2, 0.05, 0, 0.95, 1.42, { k: 0.75 });
  for (let f = 0; f < floors; f++) if ((i + f) % 3 !== 0) N.box("#ffcf8a", 0.42, 0.8, 0.04, ((i + f) % 2 ? -1 : 1) * w * 0.3, 3.45 + f * 1.75, 1.46, { k: 0.55 });
  // red lanterns under the arcade
  for (const s of [-0.5, 0.5]) N.orb("#ff3d40", 0.17, s * w * 0.6, 1.85, 1.65, 1.1);
  // a neon signboard over the arcade, a lit blade beside it
  if (sign) {
    const sc = NEON[i % NEON.length];
    v.box("#1a1033", w - 0.4, 0.46, 0.1, 0, 2.55, 1.66);
    N.box(sc, w - 0.3, 0.05, 0.05, 0, 2.3, 1.72, { k: 1.2 });
    words.add(sign, 0.34, x + Math.sin(yaw) * 1.73, 2.56, z + Math.cos(yaw) * 1.73, yaw, { fg: sc, neon: true, w: w - 0.5 });
    v.box("#1a1033", 0.12, 1.5, 0.5, -w / 2 + 0.25, 3.8, 1.85, { ink: 0.02 });
    N.box(sc, 0.14, 1.36, 0.06, -w / 2 + 0.25, 3.8, 2.12, { k: 1.3 });
  }
  pools.add(x + Math.sin(yaw) * 2.4, z + Math.cos(yaw) * 2.4, 1.9, "#ffcf8a", 0.06, 0.5);
  paint.shadow(x, z, w * 0.6, D * 0.55, 0.38);
}

const SIGNS = ["KOPI", "LAKSA", "SATAY", "CHILLI CRAB", "TEH TARIK", "KAYA TOAST", "ROTI PRATA", "ZEC", "CHICKEN RICE", "DURIAN", "ICE KACANG", "HOKKIEN MEE", "ZSTREET", "MEE GORENG", "BAK KUT TEH"];

function shophouses(k: Kit, N: Neon) {
  const { g, ground, life, v } = k;
  const sp = g.spaces.filter((s) => s.path === "shops");
  const placed: [number, number][] = [];
  let n = 0;
  // terraces along the street, both sides, front to front (the street's south side stays low: the camera looks over it)
  for (let i = 0; i < sp.length - 1; i++) {
    const a = sp[i],
      b = sp[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const px = (b.z - a.z) / len,
      pz = -(b.x - a.x) / len;
    for (let t = 0.2; t < len; t += 2.75)
      for (const side of [-1, 1]) {
        const hx = a.x + ((b.x - a.x) * t) / len + px * 4.5 * side,
          hz = a.z + ((b.z - a.z) * t) / len + pz * 4.5 * side;
        if (!ground.land(hx, hz, 2.4) || ground.onPath(hx, hz, 2.9) || !ground.free(hx, hz, 0.3, 2.0)) continue;
        if (placed.some(([qx, qz]) => Math.hypot(qx - hx, qz - hz) < 2.6)) continue;
        const h = Math.min(roomBeside(k, hx, hz, 1.5), n % 3 === 0 ? 6.6 : 5.4);
        const yaw = Math.atan2(-px * side, -pz * side);
        if (h < 3.4) {
          // (too near the camera's line for a house: a low kiosk, a bench, a potted palm)
          if (placed.some(([qx, qz]) => Math.hypot(qx - hx, qz - hz) < 3.4)) continue;
          placed.push([hx, hz]);
          ground.take(hx, hz, 1.0);
          if (n % 2) bench(v, hx, hz, yaw);
          else tree(k, hx, hz, "palm", 0.8);
          n++;
          continue;
        }
        placed.push([hx, hz]);
        ground.take(hx, hz, 1.4);
        shophouse(k, N, hx, hz, yaw, h, 2.55, n, n % 2 === 0 ? SIGNS[(n >> 1) % SIGNS.length] : null);
        if (n % 3 === 1) life.npc(hx + Math.sin(yaw) * 2.4, hz + Math.cos(yaw) * 2.4, yaw + Math.PI);
        n++;
      }
  }
  // red lanterns strung across the street
  for (let i = 0; i < sp.length; i += 2) {
    const s = sp[i];
    const nx = sp[Math.min(sp.length - 1, i + 1)];
    const yaw = Math.atan2(nx.x - s.x, nx.z - s.z) + Math.PI / 2;
    for (let q = -2; q <= 2; q++) N.orb(q % 2 ? "#ffd23f" : "#ff3d40", 0.2, s.x + Math.sin(yaw) * q * 0.9, 4.0 - Math.cos((q / 2.5) * Math.PI * 0.5) * 0.5, s.z + Math.cos(yaw) * q * 0.9, 1.2);
  }
}

// ---- the CBD's glass towers in the west ----------------------------------------------------------------------------

function cbd(k: Kit, N: Neon) {
  const { v, pools, paint, ground, life } = k;
  const spots: [number, number, number, number][] = [
    [-37.4, -12.6, 23, 0.1],
    [-40.6, -20, 18, -0.2],
    [-33.4, -24.4, 26, 0.3],
    [-38.6, -30.6, 20, 0],
    [-27.4, -32.6, 17, 0.2],
    [-17.6, -37.6, 15, -0.1],
    [-31.4, -40.4, 14, 0.1],
    [-39.4, 6.6, 16, 0.2],
    [-39.8, 15.6, 12, -0.1],
  ];
  spots.forEach(([x, z, h0, yaw], i) => {
    if (!ground.land(x, z, 2.6) || !ground.free(x, z, 2.4, 1.5)) return;
    const h = Math.min(h0, ground.maxH(x, z, 2.6));
    if (h < 8) return;
    ground.take(x, z, 3);
    const w = 3.6 + (i % 3) * 0.6,
      d = 3.2 + (i % 2) * 0.8;
    v.frame(x, 0, z, yaw);
    v.box(GLASS[i % GLASS.length], w, h, d, 0, h / 2, 0, { ink: 0.05 });
    // a setback crown and a lit top
    v.box(GLASS[(i + 1) % GLASS.length], w * 0.7, 2.2, d * 0.7, 0, h + 1.1, 0, { ink: 0.04 });
    N.frame(x, 0, z, yaw);
    const c = NEON[(i * 2 + 1) % NEON.length];
    N.box(c, w * 0.72, 0.18, d * 0.72, 0, h + 2.25, 0, { k: 1.3 });
    N.box(c, w + 0.04, 0.12, d + 0.04, 0, h - 0.05, 0, { k: 1.0 });
    // lit windows: bands on the faces the camera sees (south, east)
    for (let f = 1.4; f < h - 1; f += 1.25) {
      if ((Math.round(f * 3) + i) % 4 === 0) continue;
      N.box(f % 2.5 < 1.25 ? "#ffe2a8" : "#bfe0ff", w - 0.4, 0.16, 0.04, 0, f, d / 2 + 0.02, { k: 0.55 });
      N.box("#bfe0ff", 0.04, 0.16, d - 0.4, w / 2 + 0.02, f, 0, { k: 0.45 });
    }
    life.blinker(x, h + 2.6, z, "#ff3d56");
    pools.add(x, z, w * 1.4, c, 0.05, 0.35);
    paint.shadow(x, z, w * 0.7, d * 0.7, 0.45);
  });
}

// ---- the river's white bridge ---------------------------------------------------------------------------------------

function riverBridge(k: Kit, N: Neon, d: LandmarkDef) {
  const { v, pools } = k;
  const { x } = d;
  const z0 = -7.6,
    z1 = 2.0;
  v.frame(x, 0, (z0 + z1) / 2, 0);
  v.box("#e8ecf8", 3.6, 0.5, z1 - z0, 0, -0.18, 0, { ink: 0.04 });
  for (const s of [-1, 1]) {
    v.box("#f4f6ff", 0.16, 0.9, z1 - z0, s * 1.75, 0.5, 0, { ink: 0.02 });
    // the pylons and their chains
    for (const zz of [z0 + 0.6, z1 - 0.6]) {
      v.frame(x + s * 1.75, 0, zz, 0);
      v.box(WHITE, 0.4, 3.4, 0.4, 0, 1.7, 0, { ink: 0.03 });
      v.add("cone6", WHITE, 0.5, 0.5, 0.5, 0, 3.6, 0);
      N.frame(x + s * 1.75, 0, zz, 0);
      N.orb("#ffe2a8", 0.14, 0, 3.95, 0, 1.4);
    }
    for (let t = 0; t <= 1.001; t += 0.1) {
      const zz = z0 + 0.6 + (z1 - z0 - 1.2) * t;
      const y = 3.3 - Math.sin(t * Math.PI) * 2.3;
      v.frame(x + s * 1.75, 0, zz, 0);
      v.box(STEEL, 0.07, 0.07, (z1 - z0 - 1.2) * 0.1 + 0.05, 0, y, 0);
      if (t > 0.05 && t < 0.95) v.box(STEEL, 0.04, y - 0.9, 0.04, 0, (y + 0.9) / 2, 0);
    }
  }
  N.frame(x, 0, 0, 0);
  for (const s of [-1, 1]) N.box("#bfe6ff", 0.05, 0.05, z1 - z0, s * 1.68, 0.96, (z0 + z1) / 2, { k: 1 });
  pools.add(x, (z0 + z1) / 2, 4, "#bfe6ff", 0.0, 0.3);
}

// ---- the promenades: railings along the bay, palms, lamps, benches ---------------------------------------------------

function promenade(k: Kit, N: Neon) {
  const { v, ground, map } = k;
  const L = map.lagoon;
  if (!L) return;
  // along every island edge that meets the bay: a railing with an LED strip
  const water = (x: number, z: number) => inside(L.pts, x, z) && !map.islands.some((i) => inside(i.pts, x, z));
  for (const isl of map.islands) {
    const pts = isl.pts;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(bx - ax, bz - az);
      // (the side the water is on)
      let nx = Math.cos(yaw),
        nz = -Math.sin(yaw);
      const mx = (ax + bx) / 2,
        mz = (az + bz) / 2;
      if (!water(mx + nx * 1.2, mz + nz * 1.2)) ((nx = -nx), (nz = -nz));
      if (!water(mx + nx * 1.2, mz + nz * 1.2)) continue;
      for (let t = 0.5; t < len - 0.3; t += 1.25) {
        const x = ax + ((bx - ax) * t) / len - nx * 0.45,
          z = az + ((bz - az) * t) / len - nz * 0.45;
        if (ground.onPath(x, z, 0.9) || !ground.free(x, z, 0.2, 0.2)) continue;
        v.frame(x, 0, z, yaw);
        v.box("#3a3360", 0.08, 0.95, 0.08, 0, 0.47, 0);
        v.box("#8a84aa", 0.1, 0.06, 1.3, 0, 0.95, 0);
        N.frame(x, 0, z, yaw);
        N.box("#3ef0ff", 0.04, 0.04, 1.26, 0, 0.5, 0, { k: 0.9 });
      }
    }
  }
  // palms along the south promenade and the bayfront
  for (const [x, z] of [
    [-6.4, 13.4],
    [9.6, 13.4],
    [13.6, 12.4],
    [-2.6, -21.6],
    [11.4, -21.4],
    [-8.6, -20.6],
    [-14.6, 8.6],
    [18.6, 13.8],
    [22.8, 8.8],
    [-9.6, 18.2],
    [12, 25.6],
    [-12, 27.4],
  ] as [number, number][])
    if (ground.free(x, z, 0.8, 0.6)) (tree(k, x, z, "palm"), ground.take(x, z, 0.9));
  // benches facing the water
  for (const [x, z, yaw] of [
    [-3.4, 12.6, Math.PI],
    [7.6, 12.8, Math.PI],
    [2.4, -17.6, 0],
    [-6.6, -17.2, 0.2],
  ] as [number, number, number][])
    if (ground.free(x, z, 0.8, 0.4)) (bench(v, x, z, yaw), ground.take(x, z, 0.9));
  void lamp;
}

// ---- the bay alive: boats, lanterns, reflections ----------------------------------------------------------------------

function bay(k: Kit, N: Neon) {
  const st = S!;
  const L = k.map.lagoon;
  if (!L) return;
  const water = (x: number, z: number) => inside(L.pts, x, z) && !k.map.islands.some((i) => inside(i.pts, x, z));
  // bumboats: wooden hulls, a red or blue canopy, lanterns; they go round their loops on the bay
  const loops: [number, number, number, number, number][] = [
    [2, -3, 11, 6.5, 0.05],
    [3, -2, 7, 4, -0.07],
    [-4, -5, 6, 4.5, 0.06],
    [10, -4, 7, 5, -0.05],
    [-30, -2.8, 6, 0.4, 0.09],
  ];
  const d = k.life.dyn;
  loops.forEach(([cx, cz, rx, rz, sp], i) => {
    const b = d.body();
    const big = i === 0;
    const len = big ? 5.2 : 2.8;
    d.add("box", big ? "#f4f0ff" : "#8a4a24", big ? 1.9 : 1.1, 0.5, len, 0, 0.05, 0, { ink: 0.035 });
    d.add("wedge", big ? "#f4f0ff" : "#8a4a24", big ? 1.9 : 1.1, 0.5, 1.0, 0, 0.05, len / 2 + 0.45, { ry: Math.PI, ink: 0.03 });
    d.add("box", big ? "#2a2450" : "#e8d8b8", big ? 1.8 : 1.0, 0.08, len - 0.3, 0, 0.32, 0);
    if (big) {
      // a dinner cruise: a long lit cabin, a deck on top, a string of bulbs
      d.add("box", "#2a2450", 1.6, 0.9, len - 1.4, 0, 0.8, -0.3, { ink: 0.03 });
      d.add("box", "#f4f0ff", 1.8, 0.12, len - 1.0, 0, 1.3, -0.3);
      d.add("box", "#ffe2a8", 1.62, 0.4, len - 1.6, 0, 0.85, -0.3, { glow: true });
      for (let q = 0; q < 6; q++) d.add("orb", NEON[q % NEON.length], 0.16, 0.16, 0.16, 0, 1.6 + Math.sin((q / 5) * Math.PI) * 0.3, -len / 2 + 0.6 + q * ((len - 1.2) / 5), { glow: true });
    } else {
      // a bumboat: posts, a canopy, a lantern at each end
      const cc = i % 2 ? "#c23040" : "#2f6ad0";
      for (const sx of [-0.45, 0.45]) for (const zz of [-0.8, 0.6]) d.add("box", "#5a3a2a", 0.06, 0.8, 0.06, sx, 0.7, zz);
      d.add("box", cc, 1.15, 0.1, 1.9, 0, 1.12, -0.1, { ink: 0.02 });
      d.add("orb", "#ff3d40", 0.26, 0.26, 0.26, 0, 0.92, 0.85, { glow: true });
      d.add("orb", "#ffd23f", 0.2, 0.2, 0.2, 0, 0.92, -1.0, { glow: true });
    }
    st.boats.push({ b, cx, cz, rx, rz, sp, ph: i * 1.7 });
  });
  // floating lanterns drifting on the bay (instanced, bobbing)
  const pts: { x: number; z: number; ph: number }[] = [];
  for (let i = 0; i < 60 && pts.length < 26; i++) {
    const x = -14 + k.rnd() * 34,
      z = -14 + k.rnd() * 22;
    if (!water(x, z) || !water(x + 1.5, z) || !water(x - 1.5, z) || !water(x, z + 1.5) || !water(x, z - 1.5)) continue;
    pts.push({ x, z, ph: k.rnd() * 6 });
  }
  if (pts.length) {
    const m = new THREE.InstancedMesh(SHAPES.orb, nmat(), pts.length);
    pts.forEach((p, i) => m.setColorAt(i, new THREE.Color(pick(["#ff8a3a", "#ffd23f", "#ff5a6e"], i * 0.37)).multiplyScalar(1.5)));
    m.frustumCulled = false;
    m.raycast = () => {};
    k.parent.add(m);
    st.lanterns = m;
    st.lanternPts = pts;
  }
  // neon reflections on the water: long shimmering streaks under the bright things (one draw)
  const refl: [number, number, number, string, number][] = [
    // (x, z, length toward the camera, colour, width)
    [-4, -16.6, 7, "#ffe2a8", 3.4],
    [3, -16.8, 7.5, "#bfe0ff", 3.4],
    [10, -16.6, 7, "#ffe2a8", 3.4],
    [5.6, -16.4, 8.5, "#3ef0ff", 1.2],
    [20.6, -12.4, 4.5, "#ffe2a8", 1.6],
    [-15.6, -9.4, 5.5, "#ffcf8a", 2.6],
    [-14.6, 2.6, 4.2, "#bfe6ff", 1.6],
    [28, -1.6, 2.5, "#ff3fd0", 1.2],
    [28.6, -9, 2.5, "#3ef0ff", 1.2],
    [-8, -14.6, 6, "#9a6bff", 1.0],
    [16, -15.4, 6, "#ff3fd0", 1.0],
    [-1, 9.4, -4.5, "#ffcf8a", 2.6],
    [-26, -6.2, 4, "#ffe2a8", 2],
    [-34, -5.6, 4.5, "#3ef0ff", 1.4],
  ];
  const n = refl.length;
  const geo = new THREE.PlaneGeometry(1, 1, 1, 8);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, 0.5);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 aCol;
      varying vec3 vCol;
      varying vec2 vUv;
      varying float vW;
      void main() {
        vCol = aCol;
        vUv = uv;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = w.x * 0.7 + w.z * 1.9;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vCol;
      varying vec2 vUv;
      varying float vW;
      void main() {
        float along = vUv.y;
        float across = abs(vUv.x - 0.5) * 2.0;
        float band = step(0.35, sin(vW * 2.3 - uTime * 2.4 + sin(vW * 0.7 + uTime) * 1.5));
        float a = (1.0 - along) * (1.0 - across * across) * (0.35 + 0.65 * band);
        gl_FragColor = vec4(vCol * a * 0.9, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const im = new THREE.InstancedMesh(geo, mat, n);
  const col = new Float32Array(n * 3);
  refl.forEach(([x, z, l, c, w], i) => {
    im.setMatrixAt(i, tm.compose(tv.set(x, L.y + 0.05, z), tq.setFromAxisAngle(Y, l < 0 ? Math.PI : 0), ts.set(w, 1, Math.abs(l))));
    const cc = new THREE.Color(c);
    col.set([cc.r, cc.g, cc.b], i * 3);
  });
  geo.setAttribute("aCol", new THREE.InstancedBufferAttribute(col, 3));
  im.frustumCulled = false;
  im.renderOrder = 3;
  im.raycast = () => {};
  k.parent.add(im);
  st.reflMat = mat;
  // the lion's jet: drops arcing into the bay (instanced, they run along the arc)
  const lionD = k.map.landmarks.find((l) => l.kind === "sg-lion");
  if (lionD) {
    const r = lionD.rot ?? 0;
    st.jetFrom = new THREE.Vector3(lionD.x + Math.sin(r) * 1.3, 4.0, lionD.z + Math.cos(r) * 1.3);
    st.jetDir = new THREE.Vector3(Math.sin(r), 0, Math.cos(r));
    const jm = new THREE.InstancedMesh(SHAPES.orb, nmat(), 30);
    for (let i = 0; i < 30; i++) jm.setColorAt(i, new THREE.Color(i % 3 ? "#bfe6ff" : "#ffffff").multiplyScalar(1.1));
    jm.frustumCulled = false;
    jm.raycast = () => {};
    k.parent.add(jm);
    st.jet = jm;
  }
  void N;
}

// ---- the stop beam, the monsoon, the fireworks ------------------------------------------------------------------------

function effects(k: Kit) {
  const st = S!;
  const parent = k.parent;
  // the wheel's searchlight to this turn's stop, and the beacon on the stop
  // (a cylinder's uv runs 1 at its top to 0 at its foot: the canvas's top row is the far end)
  const beamTex = gradTex([
    [0, "rgba(255,255,255,0.35)"],
    [0.5, "rgba(255,255,255,0.55)"],
    [1, "rgba(255,255,255,1)"],
  ]);
  const bm = new THREE.MeshBasicMaterial({ map: beamTex, color: "#ff7fe6", transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const bg = new THREE.CylinderGeometry(0.35, 1.3, 1, 12, 1, true);
  bg.translate(0, 0.5, 0);
  st.beam = new THREE.Mesh(bg, bm);
  st.beam.frustumCulled = false;
  st.beam.raycast = () => {};
  st.beam.renderOrder = 4;
  st.beamMat = bm;
  parent.add(st.beam);
  const beacon = new THREE.Group();
  const pillarTex = gradTex([
    [0, "rgba(255,255,255,0)"],
    [0.5, "rgba(255,255,255,0.5)"],
    [1, "rgba(255,255,255,1)"],
  ]);
  const mats: THREE.MeshBasicMaterial[] = [];
  for (const [r0, r1, op, c] of [
    [0.5, 0.8, 0.5, "#ffb8f2"],
    [1.2, 1.7, 0.2, "#ff3fd0"],
  ] as [number, number, number, string][]) {
    const m = new THREE.MeshBasicMaterial({ map: pillarTex, color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    mats.push(m);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, 14, 18, 1, true), m);
    sh.position.y = 7;
    beacon.add(sh);
  }
  const ringM = new THREE.MeshBasicMaterial({ map: glowTex(), color: "#ff3fd0", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  mats.push(ringM);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), ringM);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.6;
  beacon.add(pool);
  beacon.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  parent.add(beacon);
  st.beacon = beacon;
  st.beaconMats = mats;
  // the towers' lasers: a fan of beams out of the sky park, sweeping over the bay and up into the night
  if (st.laserAt.y > 0) {
    const lg = new THREE.CylinderGeometry(0.05, 0.75, 1, 8, 1, true);
    lg.translate(0, 0.5, 0);
    const lt = gradTex([
      [0, "rgba(255,255,255,0)"],
      [0.6, "rgba(255,255,255,0.3)"],
      [1, "rgba(255,255,255,1)"],
    ]);
    const lm = new THREE.MeshBasicMaterial({ map: lt, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const n = 8;
    const im = new THREE.InstancedMesh(lg, lm, n);
    for (let i = 0; i < n; i++) im.setColorAt(i, new THREE.Color(NEON[i % NEON.length]));
    im.frustumCulled = false;
    im.raycast = () => {};
    im.renderOrder = 4;
    parent.add(im);
    st.lasers = im;
  }
  // the rain: streaks over the whole board, falling in the vertex shader (one draw)
  const NR = 5200;
  const pos = new Float32Array(NR * 6);
  const seed = new Float32Array(NR * 2);
  for (let i = 0; i < NR; i++) {
    const x = -48 + Math.random() * 100,
      z = -54 + Math.random() * 92,
      y = Math.random();
    pos.set([x, y, z, x, y, z], i * 6);
    const s = Math.random();
    seed.set([s, s], i * 2);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  rg.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const top = new Float32Array(NR * 2);
  for (let i = 0; i < NR; i++) top.set([0, 1], i * 2);
  rg.setAttribute("aTop", new THREE.BufferAttribute(top, 1));
  const rm = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aTop;
      uniform float uTime;
      varying float vA;
      void main() {
        float H = 28.0;
        float y = mod(position.y * H - uTime * (24.0 + aSeed * 10.0), H) - 1.0;
        vec3 p = vec3(position.x - y * 0.12 + aTop * 0.18, y + aTop * 1.5, position.z);
        vA = aTop;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uK;
      varying float vA;
      void main() { gl_FragColor = vec4(0.62, 0.72, 1.0, (0.18 + vA * 0.3) * uK); }`,
    transparent: true,
    depthWrite: false,
  });
  st.rain = new THREE.LineSegments(rg, rm);
  // (the view's disposeScene frees the board: forget it here too)
  rg.addEventListener("dispose", () => {
    if (S === st) S = null;
  });
  st.rain.frustumCulled = false;
  st.rain.visible = false;
  st.rain.raycast = () => {};
  st.rainMat = rm;
  parent.add(st.rain);
  // the flood over the low paths: strips of the shared water, risen (hidden while dry)
  const low = k.g.spaces.filter((s) => s.low);
  if (low.length) {
    const fw = new Water(k.style);
    for (const s of low) {
      fw.disc(s.x, s.z, 2.6, 0);
      for (const e of s.next) {
        const b = k.g.spaces[e.to];
        if (b.low) fw.strip(s.x, s.z, b.x, b.z, 4.4, 0);
      }
    }
    const fm = fw.build(parent);
    if (fm) {
      // (its own look: flood water, dark and rippled by the rain, soft at its edges — not the bay's foamy shores)
      (fm.material as THREE.Material).dispose();
      const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
        vertexShader: FLOOD_V,
        fragmentShader: FLOOD_F,
        transparent: true,
        depthWrite: false,
        fog: true,
      });
      fm.material = mat;
      fm.renderOrder = 2;
      fm.visible = false;
      fm.position.y = -0.45;
      st.flood = fm;
      st.floodMat = mat;
    }
  }
  // the lights to flash, their storm tint
  parent.traverse((o) => {
    if ((o as THREE.HemisphereLight).isHemisphereLight && !st.hemi) st.hemi = o as THREE.HemisphereLight;
    else if ((o as THREE.DirectionalLight).isDirectionalLight && !st.sun) st.sun = o as THREE.DirectionalLight;
  });
  if (st.hemi && st.sun) st.base = [st.hemi.intensity, st.sun.intensity];
  if (st.hemi) st.hemiC.copy(st.hemi.color);
  // a lightning bolt (a jagged line, re-drawn each flash)
  st.boltPos = new Float32Array(12 * 6);
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute("position", new THREE.BufferAttribute(st.boltPos, 3));
  st.bolt = new THREE.LineSegments(bgeo, new THREE.LineBasicMaterial({ color: "#e8f0ff", transparent: true, opacity: 1, fog: false }));
  st.bolt.frustumCulled = false;
  st.bolt.visible = false;
  parent.add(st.bolt);
  // fireworks over the bay: a pool of sparks (one points draw)
  const NF = 420;
  st.fwPos = new Float32Array(NF * 3);
  st.fwCol = new Float32Array(NF * 3);
  st.fwVel = new Float32Array(NF * 3);
  st.fwLife = new Float32Array(NF);
  for (let i = 0; i < NF; i++) st.fwPos[i * 3 + 1] = -500;
  const fg = new THREE.BufferGeometry();
  fg.setAttribute("position", new THREE.BufferAttribute(st.fwPos, 3));
  fg.setAttribute("color", new THREE.BufferAttribute(st.fwCol, 3));
  const sparkTex = canvasTex(32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.3, "rgba(255,255,255,0.7)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
  });
  st.fw = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.9, map: sparkTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  st.fw.frustumCulled = false;
  st.fw.raycast = () => {};
  parent.add(st.fw);
  // the sky stop markers: a little wheel sign by each stop
  st.stops = (k.map.ride?.stops ?? []).map((sd) => {
    const s = k.g.spaces[k.g.drops[(k.map.ride?.stops ?? []).indexOf(sd)]];
    return new THREE.Vector3(s.x, k.g.spaces[s.i].y + 0.5, s.z);
  });
  (k.map.ride?.stops ?? []).forEach((sd, i) => {
    const s = st.stops[i];
    // (beside the space, the north side preferred)
    let best = Math.PI,
      bestS = -1e9;
    for (let a = 0; a < 12; a++) {
      const yy = (a / 12) * Math.PI * 2;
      const px = s.x + Math.sin(yy) * 1.9,
        pz = s.z + Math.cos(yy) * 1.9;
      const sc = (k.ground.onPath(px, pz, 0.5) ? -5 : 0) - Math.cos(yy) * 0.8 + (k.ground.free(px, pz, 0.3, 0.3) ? 1 : -2);
      if (sc > bestS) ((bestS = sc), (best = yy));
    }
    const px = s.x + Math.sin(best) * 1.9,
      pz = s.z + Math.cos(best) * 1.9;
    k.ground.take(px, pz, 0.6);
    const v = k.v;
    v.frame(px, 0, pz, 0);
    v.box(DARK, 0.14, 2.4, 0.14, 0, 1.2, 0, { ink: 0.02 });
    v.cyl("#2a2450", 0.5, 0.12, 0, 2.7, 0, { rx: Math.PI / 2, ink: 0.025 }, "cyl8");
    const N = neonOf(k);
    N.frame(px, 0, pz, 0);
    N.add("torus", "#ff3fd0", 0.9, 0.9, 1, 0, 2.7, 0.07, { k: 1.3 });
    for (let q = 0; q < 4; q++) N.box("#ff3fd0", 0.04, 0.8, 0.04, 0, 2.7, 0.08, { rz: (q / 4) * Math.PI, k: 0.9 });
    k.words.add(T2(sd.n), 0.26, px, 2.05, pz + 0.09, 0, { fg: "#ffffff", bg: "#2a2450", w: 1.6 });
  });
}
const FLOOD_V = /* glsl */ `
attribute float aEdge;
varying float vEdge;
varying vec2 vXZ;
#include <fog_pars_vertex>
void main() {
  vEdge = aEdge;
  vXZ = position.xz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FLOOD_F = /* glsl */ `
uniform float uTime;
varying float vEdge;
varying vec2 vXZ;
#include <fog_pars_fragment>
void main() {
  float w = sin(vXZ.x * 1.3 + uTime * 1.7) * sin(vXZ.y * 1.1 - uTime * 1.3);
  vec3 c = mix(vec3(0.05, 0.1, 0.3), vec3(0.16, 0.34, 0.68), 0.35 + 0.25 * w);
  // rain rings: one per cell, each on its own beat
  vec2 q = vXZ * 0.9;
  vec2 cell = floor(q);
  float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float t = fract(uTime * 0.9 + h);
  float r = length(fract(q) - 0.5 - (vec2(h, fract(h * 7.3)) - 0.5) * 0.4);
  c += vec3(0.6, 0.78, 1.0) * smoothstep(0.035, 0.0, abs(r - t * 0.45)) * (1.0 - t) * 0.9;
  // neon glinting off it
  c += vec3(1.0, 0.35, 0.85) * step(0.93, sin(vXZ.x * 3.1 + uTime) * sin(vXZ.y * 2.7 - uTime * 1.2)) * 0.4;
  gl_FragColor = vec4(c, smoothstep(0.0, 0.7, vEdge) * 0.86);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** The English name for a sign (the boards' signs are English). */
const T2 = (n: [string, string]) => n[0];

// ---- the build, the frame ---------------------------------------------------------------------------------------------

function build(k: Kit) {
  // (the board's own finish: a richer bloom for the neon)
  const sc = k.parent as THREE.Scene;
  sc.userData.post = { ...(sc.userData.post ?? {}), bloom: 1.35, exposure: 1.06 };
  // (the night: the shared sunset sun becomes a small moon, its glow in the dome a faint haze; the cloud sea dimmed)
  sc.traverse((o) => {
    const m = o as THREE.Mesh;
    const mat = m.material as THREE.ShaderMaterial & THREE.MeshBasicMaterial & THREE.SpriteMaterial;
    if (!mat) return;
    if (mat.uniforms?.uSun) mat.uniforms.uSun.value.set("#4a4f90");
    else if ((o as THREE.Sprite).isSprite && o.position.z < -300) {
      if (o.scale.x > 150) ((mat.opacity = 0.3), mat.color.set("#5a5ab8"));
      else (o.scale.set(20, 20, 1), mat.color.set("#f2f4ff"), (mat.opacity = 1));
    } else if (m.isMesh && o.scale.x >= 1000 && o.position.y < -20) mat.color.set("#4a4486");
  });
  bay(k, neonOf(k));
  effects(k);
  neonOf(k).build(k.parent);
  neons.delete(k);
  stopNow(0, true);
}

/** Before the landmarks: the state (every landmark builder may fill its part of it). */
function fresh(k: Kit) {
  S = {
    k,
    t: 0,
    ring: new THREE.Group(),
    hub: new THREE.Vector3(),
    axle: new THREE.Vector3(0, 0, 1),
    side: new THREE.Vector3(1, 0, 0),
    R: 7,
    ang: 0,
    spin: 0.09,
    spinWant: 0.09,
    cabins: [],
    cabinParts: [],
    nCab: 0,
    board: -1,
    riderPt: new THREE.Vector3(),
    beam: null as unknown as THREE.Mesh,
    beamMat: null as unknown as THREE.MeshBasicMaterial,
    beamFrom: new THREE.Vector3(),
    beamAt: new THREE.Vector3(),
    beamGo: new THREE.Vector3(),
    beacon: null as unknown as THREE.Group,
    beaconMats: [],
    stops: [],
    stop: -1,
    rain: null as unknown as THREE.LineSegments,
    rainMat: null as unknown as THREE.ShaderMaterial,
    rainK: 0,
    rainWant: 0,
    flood: null,
    floodMat: null,
    floodK: 0,
    floodWant: 0,
    hemi: null,
    sun: null,
    base: [1, 1],
    hemiC: new THREE.Color(),
    stormC: new THREE.Color("#5a6aa8"),
    flash: 0,
    nextFlash: 2,
    bolt: null as unknown as THREE.LineSegments,
    boltPos: new Float32Array(0),
    boats: [],
    lanterns: null,
    lanternPts: [],
    reflMat: null,
    jet: null,
    jetFrom: new THREE.Vector3(),
    jetDir: new THREE.Vector3(1, 0, 0),
    fw: null as unknown as THREE.Points,
    fwPos: new Float32Array(0),
    fwCol: new Float32Array(0),
    fwVel: new Float32Array(0),
    fwLife: new Float32Array(0),
    fwNext: 4,
    fwHead: 0,
    bursts: [],
    laserAt: new THREE.Vector3(),
    lasers: null,
  };
}

const FW_COLS = ["#ff3fd0", "#3ef0ff", "#ffd23f", "#ff5a6e", "#9a6bff", "#5effa8", "#ffffff"].map((c) => new THREE.Color(c));

function burst(x: number, y: number, z: number, n = 70) {
  const st = S;
  if (!st || !st.fwLife.length) return;
  const NF = st.fwLife.length;
  const c = FW_COLS[Math.floor(Math.random() * FW_COLS.length)];
  const c2 = FW_COLS[Math.floor(Math.random() * FW_COLS.length)];
  for (let i = 0; i < n; i++) {
    const j = st.fwHead;
    st.fwHead = (st.fwHead + 1) % NF;
    // (a sphere of sparks)
    const u = Math.random() * 2 - 1,
      a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const sp = 7 + Math.random() * 1.5;
    st.fwPos.set([x, y, z], j * 3);
    st.fwVel.set([Math.cos(a) * r * sp, u * sp + 1.5, Math.sin(a) * r * sp], j * 3);
    const cc = i % 3 ? c : c2;
    st.fwCol.set([cc.r * 1.6, cc.g * 1.6, cc.b * 1.6], j * 3);
    st.fwLife[j] = 1.4 + Math.random() * 0.6;
  }
}

function update(dt: number, t: number) {
  const st = S;
  if (!st) return;
  st.t = t;
  // the wheel turns (faster while someone rides)
  st.spin += (st.spinWant - st.spin) * Math.min(1, dt * 1.5);
  st.ang += st.spin * dt;
  if (st.nCab) {
    st.ring.quaternion.setFromUnitVectors(tv.set(0, 0, 1), st.axle);
    tq.setFromAxisAngle(tv.set(0, 0, 1), st.ang);
    st.ring.quaternion.multiply(tq);
    // (each cabin hangs level, turned along the axle)
    tq.setFromAxisAngle(Y, Math.atan2(st.axle.x, st.axle.z));
    for (let i = 0; i < st.nCab; i++) {
      tm.compose(cabinAt(i, tv2), tq, ts.set(1, 1, 1));
      for (let p = 0; p < st.cabins.length; p++) st.cabins[p].setMatrixAt(i, tmp4.multiplyMatrices(tm, st.cabinParts[p][0]));
    }
    for (const m of st.cabins) m.instanceMatrix.needsUpdate = true;
    if (st.board >= 0) cabinAt(st.board, st.riderPt).y += 0.62;
  }
  // the beam swings to its stop
  if (st.beam && st.stop >= 0) {
    st.beamAt.lerp(st.beamGo, Math.min(1, dt * 2.2));
    st.beamFrom.copy(st.hub).setY(st.hub.y + st.R + 0.6);
    tv.subVectors(st.beamAt, st.beamFrom);
    const len = tv.length();
    tv.divideScalar(len || 1);
    st.beam.position.copy(st.beamFrom);
    st.beam.quaternion.setFromUnitVectors(Y, tv);
    st.beam.scale.set(1, len, 1);
    st.beamMat.opacity = 0.22 + Math.sin(t * 3) * 0.06;
    st.beacon.position.copy(st.beamAt).setY(st.beamAt.y - 0.5);
    st.beacon.rotation.y = t * 0.8;
    const pulse = 0.8 + Math.sin(t * 4) * 0.2;
    st.beaconMats[0].opacity = 0.5 * pulse;
    st.beaconMats[1].opacity = 0.2 * pulse;
  }
  // the lasers fan and sweep
  if (st.lasers) {
    const n = st.lasers.count;
    const show = 0.5 + 0.5 * Math.sin(t * 0.21);
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1) - 0.5;
      const yaw = f * 1.9 + Math.sin(t * 0.37 + i * 0.8) * 0.35 * (1 + show);
      const el = 0.12 + show * 0.5 + Math.sin(t * 0.6 + i * 1.7) * 0.12;
      tv.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));
      tq.setFromUnitVectors(Y, tv);
      st.lasers.setMatrixAt(i, tm.compose(st.laserAt, tq, ts.set(1, 46, 1)));
    }
    st.lasers.instanceMatrix.needsUpdate = true;
  }
  // the bay: boats on their loops, lanterns bobbing, reflections shimmering, the lion's jet
  const ly0 = (st.k.map.lagoon?.y ?? -0.75) + 0.08 + st.floodK * 0.25;
  for (const b of st.boats) {
    const a = b.ph + t * b.sp;
    const x = b.cx + Math.cos(a) * b.rx,
      z = b.cz + Math.sin(a) * b.rz;
    // (heading along the loop, rolling a little)
    te.set(0, Math.atan2(-Math.sin(a) * b.rx * Math.sign(b.sp), Math.cos(a) * b.rz * Math.sign(b.sp)), Math.sin(t * 1.3 + b.ph) * 0.04, "YXZ");
    st.k.life.dyn.bodies[b.b].compose(tv.set(x, ly0 + Math.sin(t * 1.6 + b.ph) * 0.05, z), tq.setFromEuler(te), ts.set(1, 1, 1));
  }
  if (st.lanterns) {
    const ly = (st.k.map.lagoon?.y ?? -0.75) + 0.12 + st.floodK * 0.25;
    for (let i = 0; i < st.lanternPts.length; i++) {
      const p = st.lanternPts[i];
      const dx = Math.sin(t * 0.07 + p.ph) * 1.2,
        dz = Math.cos(t * 0.05 + p.ph * 1.3) * 0.8;
      st.lanterns.setMatrixAt(i, tm.compose(tv.set(p.x + dx, ly + Math.sin(t * 1.7 + p.ph) * 0.05, p.z + dz), tq.identity(), ts.set(0.32, 0.24, 0.32)));
    }
    st.lanterns.instanceMatrix.needsUpdate = true;
  }
  if (st.reflMat) st.reflMat.uniforms.uTime.value = t;
  if (st.jet) {
    for (let i = 0; i < 30; i++) {
      const f = ((t * 0.55 + i / 30) % 1 + 1) % 1;
      const d = f * 6.5;
      const y = st.jetFrom.y + Math.sin(f * Math.PI * 0.55) * 1.4 - f * f * 5.2;
      const s = 0.14 + f * 0.12;
      st.jet.setMatrixAt(i, tm.compose(tv.set(st.jetFrom.x + st.jetDir.x * d, Math.max(-0.7, y), st.jetFrom.z + st.jetDir.z * d), tq.identity(), ts.set(s, s, s)));
    }
    st.jet.instanceMatrix.needsUpdate = true;
  }
  // the monsoon: rain in, the flood up, the light dimmed and flashing
  st.rainK += (st.rainWant - st.rainK) * Math.min(1, dt * 0.9);
  st.floodK += (st.floodWant - st.floodK) * Math.min(1, dt * (st.floodWant > st.floodK ? 1.3 : 0.7));
  if (st.rain) {
    st.rain.visible = st.rainK > 0.01;
    st.rainMat.uniforms.uTime.value = t;
    st.rainMat.uniforms.uK.value = st.rainK;
  }
  if (st.flood && st.floodMat) {
    st.flood.visible = st.floodK > 0.01;
    st.flood.position.y = -0.45 + st.floodK * 0.9;
    st.floodMat.uniforms.uTime.value = t;
  }
  if (st.hemi && st.sun) {
    if (st.rainK > 0.05) {
      st.nextFlash -= dt;
      if (st.nextFlash <= 0) flash();
    }
    st.flash = Math.max(0, st.flash - dt * 2.6);
    const fl = st.flash * (0.65 + 0.35 * Math.sin(t * 55));
    st.hemi.intensity = st.base[0] * (1 - st.rainK * 0.35) + fl * 2.4;
    st.sun.intensity = st.base[1] * (1 - st.rainK * 0.45) + fl * 1.8;
    st.hemi.color.copy(st.hemiC).lerp(st.stormC, st.rainK * 0.5);
    st.bolt.visible = st.flash > 0.45;
  }
  // fireworks now and then (not in the rain)
  st.fwNext -= dt;
  if (st.fwNext <= 0) {
    st.fwNext = 5 + Math.random() * 9;
    if (st.rainK < 0.2) for (let q = 0; q < 1 + Math.floor(Math.random() * 3); q++) burst(-6 + Math.random() * 24, 22 + Math.random() * 8, -12 + Math.random() * 14, 60);
  }
  if (st.fw) {
    const NF = st.fwLife.length;
    for (let i = 0; i < NF; i++) {
      if (st.fwLife[i] <= 0) continue;
      st.fwLife[i] -= dt;
      const j = i * 3;
      if (st.fwLife[i] <= 0) {
        st.fwPos[j + 1] = -500;
        continue;
      }
      st.fwVel[j] *= 1 - dt * 1.4;
      st.fwVel[j + 1] = st.fwVel[j + 1] * (1 - dt * 1.4) - dt * 4.5;
      st.fwVel[j + 2] *= 1 - dt * 1.4;
      st.fwPos[j] += st.fwVel[j] * dt;
      st.fwPos[j + 1] += st.fwVel[j + 1] * dt;
      st.fwPos[j + 2] += st.fwVel[j + 2] * dt;
      const fade = Math.min(1, st.fwLife[i] * 1.6);
      st.fwCol[j] *= 0.985 + 0.015 * fade;
      st.fwCol[j + 1] *= 0.985 + 0.015 * fade;
      st.fwCol[j + 2] *= 0.985 + 0.015 * fade;
    }
    (st.fw.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (st.fw.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}
const tmp4 = new THREE.Matrix4();

/** Cabin i's centre now (world): out past the rim, level. */
function cabinAt(i: number, out: THREE.Vector3) {
  const st = S!;
  const a = st.ang + (i / st.nCab) * Math.PI * 2;
  const R = st.R + CAB_OUT;
  return out.copy(st.hub).addScaledVector(st.side, Math.cos(a) * R).addScaledVector(Y, Math.sin(a) * R);
}

/** A lightning flash: the bolt redrawn somewhere over the far side, the lights jump. */
function flash() {
  const st = S!;
  st.flash = 1;
  st.nextFlash = 2.5 + Math.random() * 5;
  const x0 = -40 + Math.random() * 90,
    z0 = -70 - Math.random() * 30;
  let x = x0,
    y = 60,
    z = z0;
  for (let i = 0; i < 12; i++) {
    const nx = x + (Math.random() - 0.5) * 7,
      ny = y - 4.5 - Math.random() * 2,
      nz = z + (Math.random() - 0.5) * 3;
    st.boltPos.set([x, y, z, nx, ny, nz], i * 6);
    x = nx;
    y = ny;
    z = nz;
  }
  (st.bolt.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  st.bolt.geometry.computeBoundingSphere();
}

/** Point the wheel's searchlight (and its beacon) at stop k (instant: no swing). */
function stopNow(k: number, instant = false) {
  const st = S;
  if (!st || !st.stops.length) return;
  const i = ((k % st.stops.length) + st.stops.length) % st.stops.length;
  st.stop = i;
  st.beamGo.copy(st.stops[i]);
  if (instant) st.beamAt.copy(st.beamGo);
}

/** The rules' events, as they are shown: the stop each turn, the monsoon, fireworks for a Z-Block and the winner. */
function on(e: BEv, view: BoardView) {
  const st = S;
  if (!st) return;
  if (e.t === "turn") stopNow(e.turn - 1);
  else if (e.t === "storm") SG.storm(true);
  else if (e.t === "recede" || e.t === "over") SG.storm(false);
  else if (e.t === "qbuy") {
    const p = view.av[e.seat].pos;
    SG.fireworks(p.x, p.z - 6, 3);
  } else if (e.t === "final") {
    const sg = st.k.map.stage;
    if (sg) for (let q = 0; q < 3; q++) setTimeout(() => S === st && SG.fireworks(sg.x, sg.z - 14, 3), q * 900);
  }
}

const SINGAPORE_ART: MapArt & { on(e: BEv, view: BoardView): void } = {
  key: "singapore",
  on,
  landmark(d, k) {
    if (!S || S.k !== k) fresh(k);
    return landmark(d, k);
  },
  build(k) {
    if (!S || S.k !== k) fresh(k);
    build(k);
  },
  update,
};
export default SINGAPORE_ART;

/**
 * What game.ts asks of MARINA NIGHTS' art: the sky wheel's ride and stop, the monsoon, fireworks.
 * Every call is a no-op when the board on show is another one.
 */
export const SG = {
  /** Point the searchlight at this turn's stop. */
  stop(k: number) {
    stopNow(k);
  },
  /** The wheel's hub (for the camera). */
  hub(out: THREE.Vector3) {
    return S ? out.copy(S.hub) : out.set(0, 0, 0);
  },
  /** The cabin nearest the bottom right now (the one to board): its index. */
  lowest() {
    const st = S;
    if (!st || !st.nCab) return 0;
    let best = 0,
      by = 1e9;
    for (let i = 0; i < st.nCab; i++) {
      const y = cabinAt(i, tv).y;
      if (y < by) ((by = y), (best = i));
    }
    return best;
  },
  /** Ride cabin i: the point its rider stands at (on its roof), kept on the cabin every frame (the view's `hold`). */
  rider(i: number) {
    const st = S;
    if (!st || !st.nCab) return new THREE.Vector3();
    st.board = i;
    cabinAt(i, st.riderPt).y += 0.62;
    return st.riderPt;
  },
  /** How high cabin i is up the wheel (0 at the bottom … top() at the top). */
  height(i: number) {
    const st = S;
    if (!st || !st.nCab) return 0;
    return cabinAt(i, tv).y - (st.hub.y - st.R - CAB_OUT);
  },
  top() {
    return S ? 2 * (S.R + CAB_OUT) : 0;
  },
  /** How fast the wheel turns (rad/s): slow while idle, quicker for a ride. */
  spin(w: number) {
    if (S) S.spinWant = w;
  },
  /** The stop beam's far end now. */
  stopPos(out: THREE.Vector3) {
    return S ? out.copy(S.beamAt) : out.set(0, 0, 0);
  },
  /** The monsoon: on (rain, flood, lightning) or over. */
  storm(on: boolean) {
    if (!S) return;
    S.rainWant = on ? 1 : 0;
    S.floodWant = on ? 1 : 0;
    if (on) S.nextFlash = 0.4;
  },
  /** A flash of lightning now. */
  flash() {
    if (S && S.hemi) flash();
  },
  /** Fireworks over (x, z) (a celebration). */
  fireworks(x: number, z: number, n = 3) {
    for (let q = 0; q < n; q++) burst(x + (Math.random() - 0.5) * 14, 18 + Math.random() * 8, z + (Math.random() - 0.5) * 8, 70);
  },
};
