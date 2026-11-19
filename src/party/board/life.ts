/**
 * The board alive (art only): everything that moves without the rules asking.
 *
 * - `DynVox`: Vox's moving cousin. Pieces hang on "bodies" (a matrix each: a boat, a gull's wing,
 *   a turbine's rotor); a frame sets the bodies and rewrites the instances, one draw per shape.
 * - `Life`: the crowd (the city's own zkSNARKs in voxels, drawn by SnarkCrowd: a draw per zkSNARK)
 *   cheering by the paths and in the plaza, turning to watch whoever walks, jumping when a Z-Block
 *   is bought; gulls and birds, boats and buoys bobbing, ducks, floating islets, turbines and the
 *   windmill turning, flags and bunting waving (shader time), searchlights sweeping, blinking
 *   beacons, fireflies and neon motes (one points draw), the fountain's spray, smoke and sparks,
 *   the clouds drifting.
 *
 * No allocation per frame; everything here is freed by the scene's dispose (disposeScene), the
 * crowd's members by `dispose()`.
 */
import * as THREE from "three";
import { canvasTex, glow, toonSteps, type Fx3 } from "../k3";
import { drawMark } from "../theme";
import { SHAPES, Vox, glowTex, type Shape, type VoxOpts } from "./props";
import { SnarkCrowd, type CrowdSnark } from "../../scene/snarkbody";

const Y = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const tv = new THREE.Vector3();
const tq = new THREE.Quaternion();
const te = new THREE.Euler();
const ts = new THREE.Vector3();
const tm = new THREE.Matrix4();

// ---- the moving batcher ------------------------------------------------------------------------------

interface Part {
  body: number;
  local: THREE.Matrix4;
  ink: THREE.Matrix4 | null;
  c: THREE.Color;
}

/** Instanced pieces hung on bodies (matrices set each frame): one draw per shape and material. */
export class DynVox {
  readonly bodies: THREE.Matrix4[] = [];
  private groups = new Map<string, Part[]>();
  private meshes: { mesh: THREE.InstancedMesh; parts: Part[]; ink: boolean }[] = [];
  private cur = 0;
  constructor(private inkMat: THREE.Material) {}
  /** A new body (and the next pieces go on it). */
  body() {
    this.bodies.push(new THREE.Matrix4());
    this.cur = this.bodies.length - 1;
    return this.cur;
  }
  add(shape: Shape, color: THREE.ColorRepresentation, sx: number, sy: number, sz: number, x: number, y: number, z: number, o: VoxOpts = {}) {
    te.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, "XYZ");
    tq.setFromEuler(te);
    const p = new THREE.Vector3(x, y, z);
    const local = new THREE.Matrix4().compose(p, tq, new THREE.Vector3(sx, sy, sz));
    const k = o.ink ?? 0;
    const ink = k ? new THREE.Matrix4().compose(p, tq, new THREE.Vector3(sx + k * 2, sy + k * 2, sz + k * 2)) : null;
    const key = `${shape}:${o.glow ? "g" : "t"}`;
    let a = this.groups.get(key);
    if (!a) this.groups.set(key, (a = []));
    a.push({ body: this.cur, local, ink, c: new THREE.Color(color) });
    return this;
  }
  box(c: THREE.ColorRepresentation, w: number, h: number, d: number, x: number, y: number, z: number, o?: VoxOpts) {
    return this.add("box", c, w, h, d, x, y, z, o);
  }
  build(parent: THREE.Object3D) {
    for (const [key, parts] of this.groups) {
      const [shape, kind] = key.split(":") as [Shape, string];
      const mesh = new THREE.InstancedMesh(SHAPES[shape], kind === "g" ? glow("#ffffff") : toonMat(), parts.length);
      parts.forEach((p, i) => mesh.setColorAt(i, p.c));
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      parent.add(mesh);
      this.meshes.push({ mesh, parts, ink: false });
      const inked = parts.filter((p) => p.ink);
      if (inked.length) {
        const ol = new THREE.InstancedMesh(SHAPES[shape], this.inkMat, inked.length);
        ol.frustumCulled = false;
        ol.raycast = () => {};
        parent.add(ol);
        this.meshes.push({ mesh: ol, parts: inked, ink: true });
      }
    }
    this.groups.clear();
    this.update();
  }
  update() {
    for (const { mesh, parts, ink } of this.meshes) {
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        tm.multiplyMatrices(this.bodies[p.body], ink ? p.ink! : p.local);
        mesh.setMatrixAt(i, tm);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
let toonC: THREE.MeshToonMaterial | null = null;
function toonMat() {
  if (!toonC) {
    toonC = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonSteps() });
    toonC.userData = { shared: true };
  }
  return toonC;
}

// ---- the crowd ---------------------------------------------------------------------------------------

interface Npc {
  member: CrowdSnark;
  x: number;
  y: number;
  z: number;
  yaw: number;
  base: number;
  next: number;
  hopT: number;
  cheerAt: number;
  acc: number;
  sit: boolean;
}

const NPC_SCALE = 1.0;

// ---- life --------------------------------------------------------------------------------------------

interface Bird {
  b: number;
  wl: number;
  wr: number;
  cx: number;
  cz: number;
  r: number;
  h: number;
  sp: number;
  ph: number;
  gull: boolean;
}
interface Bob {
  b: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  ph: number;
  amp: number;
  roll: number;
  spin: number;
  smoke: THREE.Vector3 | null;
}
interface Rotor {
  b: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sp: number;
}
interface Beam {
  x: number;
  y: number;
  z: number;
  sp: number;
  len: number;
  yaw0: number;
  ph: number;
  spin: boolean;
}

export class Life {
  readonly dyn: DynVox;
  private t = 0;
  private frame = 0;
  private birds: Bird[] = [];
  private bobs: Bob[] = [];
  private ducks: { b: number; x: number; y: number; z: number; r: number; ph: number }[] = [];
  private rotors: Rotor[] = [];
  private blinks: { b: number; x: number; y: number; z: number; ph: number }[] = [];
  private flags: { x: number; y: number; z: number; yaw: number; c: string; s: number }[] = [];
  private pennants: { x: number; y: number; z: number; yaw: number; c: string }[] = [];
  private beams: Beam[] = [];
  private beamMesh: THREE.InstancedMesh | null = null;
  private beamPools: THREE.InstancedMesh | null = null;
  private motes: { x: number; y: number; z: number; c: THREE.Color }[] = [];
  private fountains: { x: number; y: number; z: number; r: number }[] = [];
  private smoke: THREE.Vector3[] = [];
  private sparks: { p: THREE.Vector3; rate: number; t: number }[] = [];
  private npcs: Npc[] = [];
  private crowd: SnarkCrowd | null = null;
  private ids: number[] = [];
  private clouds: THREE.Object3D[] = [];
  readonly time = { value: 0 };
  private smokeT = 0;
  private sprayT = 0;
  /** Who the crowd watches (the walker), if anyone. */
  focus: THREE.Vector3 | null = null;

  constructor(
    ink: THREE.Material,
    private v: Vox,
  ) {
    this.dyn = new DynVox(ink);
  }

  // ---- what decor.ts asks for ----------------------------------------------------------------------

  flag(x: number, y: number, z: number, yaw: number, c: string, s = 1) {
    this.flags.push({ x, y, z, yaw, c, s });
  }
  /** Pennants on a string from a to b (the string sags `sag` in the middle). */
  bunting(a: [number, number, number], b: [number, number, number], n: number, sag = 0.5) {
    const cols = ["#ff3d56", "#ffd23f", "#3ec6ff", "#33d67c", "#ff5fa2", "#c4b1fc", "#ff6b35"];
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]) + Math.PI / 2;
    let px = a[0],
      py = a[1],
      pz = a[2];
    const seg = 10;
    for (let i = 1; i <= seg; i++) {
      const f = i / seg;
      const x = a[0] + (b[0] - a[0]) * f,
        z = a[2] + (b[2] - a[2]) * f;
      const y = a[1] + (b[1] - a[1]) * f - Math.sin(f * Math.PI) * sag;
      const len = Math.hypot(x - px, y - py, z - pz);
      this.v.frame(0, 0, 0, 0);
      tv.set(x - px, y - py, z - pz).normalize();
      tq.setFromUnitVectors(Y, tv);
      te.setFromQuaternion(tq, "XYZ");
      this.v.box("#f4efff", 0.035, len, 0.035, (x + px) / 2, (y + py) / 2, (z + pz) / 2, { rx: te.x, ry: te.y, rz: te.z });
      px = x;
      py = y;
      pz = z;
    }
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      this.pennants.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f - Math.sin(f * Math.PI) * sag, z: a[2] + (b[2] - a[2]) * f, yaw, c: cols[(i + Math.round(a[0])) % cols.length] });
    }
  }
  fountain(x: number, y: number, z: number, r: number) {
    this.fountains.push({ x, y, z, r });
  }
  blinker(x: number, y: number, z: number, c: string) {
    const b = this.dyn.body();
    this.dyn.add("orb", c, 0.32, 0.32, 0.32, 0, 0, 0, { glow: true });
    this.blinks.push({ b, x, y, z, ph: Math.random() * 6 });
  }
  /** A searchlight at (x, y, z) sweeping round yaw0 (or spinning: a lighthouse). */
  searchlight(x: number, y: number, z: number, sp: number, len: number, yaw0: number, spin = false) {
    this.beams.push({ x, y, z, sp, len, yaw0, ph: Math.random() * 6, spin });
  }
  rotor(x: number, y: number, z: number, yaw: number, kind: "turbine" | "windmill") {
    const d = this.dyn;
    const b = d.body();
    if (kind === "turbine") {
      d.add("orb", "#ffffff", 0.55, 0.55, 0.6, 0, 0, 0.1, { ink: 0.03 });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        d.add("box", i ? "#ffffff" : "#fff4f0", 0.34, 3.6, 0.1, Math.sin(a) * 1.9, Math.cos(a) * 1.9, 0, { rz: -a, ink: 0.025 });
        d.add("box", "#ff6b35", 0.36, 0.5, 0.11, Math.sin(a) * 3.45, Math.cos(a) * 3.45, 0, { rz: -a });
      }
      this.rotors.push({ b, x, y, z, yaw, sp: 1.1 + Math.random() * 0.4 });
    } else {
      d.add("cyl", "#7a4a2b", 0.44, 0.4, 0.44, 0, 0, 0, { rx: Math.PI / 2, ink: 0.03 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const sx = Math.sin(a),
          sy = Math.cos(a);
        // a spar, a cloth sail beside it, slats across
        d.add("box", "#7a4a2b", 0.12, 2.7, 0.1, sx * 1.4, sy * 1.4, 0.06, { rz: -a, ink: 0.02 });
        d.add("box", i % 2 ? "#fff3dc" : "#ffe0c4", 0.56, 1.9, 0.04, sx * 1.65 + sy * 0.34, sy * 1.65 - sx * 0.34, 0.1, { rz: -a, ink: 0.02 });
        for (let k = 0; k < 3; k++) d.add("box", "#8a5a34", 0.62, 0.05, 0.05, sx * (0.95 + k * 0.7) + sy * 0.34, sy * (0.95 + k * 0.7) - sx * 0.34, 0.13, { rz: -a });
      }
      this.rotors.push({ b, x, y, z, yaw, sp: 0.55 });
    }
  }
  /** A villager of the board: one of the city's zkSNARKs. */
  npc(x: number, z: number, yaw: number, sit = false) {
    this.npcs.push({ member: null as unknown as CrowdSnark, x, y: 0, z, yaw, base: yaw, next: Math.random() * 4, hopT: 0, cheerAt: -1, acc: 0, sit });
  }
  smokeAt(x: number, y: number, z: number) {
    this.smoke.push(new THREE.Vector3(x, y, z));
  }
  sparkAt(x: number, y: number, z: number, rate = 1) {
    this.sparks.push({ p: new THREE.Vector3(x, y, z), rate, t: Math.random() });
  }
  /** Fireflies, neon motes: n glints drifting in an ellipsoid round (x, y, z). */
  // (named apart from the field: the list is `motes`)
  motesAt(x: number, y: number, z: number, rx: number, ry: number, n: number, cols: string[]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        d = Math.sqrt(Math.random()) * rx;
      this.motes.push({ x: x + Math.cos(a) * d, y: Math.max(0.4, y + (Math.random() - 0.3) * ry), z: z + Math.sin(a) * d, c: new THREE.Color(cols[i % cols.length]) });
    }
  }
  bird(cx: number, cz: number, r: number, h: number, kind: "gull" | "bird") {
    const d = this.dyn;
    const gull = kind === "gull";
    const s = gull ? 0.9 : 0.5;
    const body = gull ? "#ffffff" : ["#3ec6ff", "#ff5f6e", "#ffd23f"][this.birds.length % 3];
    const wing = gull ? "#d9d4ea" : body;
    const b = d.body();
    d.add("orb", body, 0.36 * s, 0.32 * s, 0.8 * s, 0, 0, 0, { ink: 0.02 });
    d.add("orb", body, 0.3 * s, 0.28 * s, 0.3 * s, 0, 0.12 * s, 0.42 * s);
    d.add("cone6", "#ffb02e", 0.1 * s, 0.24 * s, 0.1 * s, 0, 0.1 * s, 0.64 * s, { rx: Math.PI / 2 });
    d.add("box", wing, 0.3 * s, 0.05 * s, 0.26 * s, 0, 0.02, -0.46 * s);
    const wl = d.body();
    d.add("box", wing, 0.9 * s, 0.06 * s, 0.4 * s, -0.48 * s, 0, 0, { ink: 0.015 });
    if (gull) d.add("box", "#3a2f5c", 0.26, 0.065, 0.36, -0.86, 0, 0);
    const wr = d.body();
    d.add("box", wing, 0.9 * s, 0.06 * s, 0.4 * s, 0.48 * s, 0, 0, { ink: 0.015 });
    if (gull) d.add("box", "#3a2f5c", 0.26, 0.065, 0.36, 0.86, 0, 0);
    this.birds.push({ b, wl, wr, cx, cz, r, h, sp: gull ? 2.6 + Math.random() : 4 + Math.random() * 1.5, ph: Math.random() * Math.PI * 2, gull });
  }
  duck(x: number, y: number, z: number, r: number, i: number) {
    const d = this.dyn;
    const b = d.body();
    d.add("orb", i % 2 ? "#ffffff" : "#ffd23f", 0.42, 0.3, 0.55, 0, 0.12, 0, { ink: 0.02 });
    d.add("orb", i % 2 ? "#33a35a" : "#ffd23f", 0.26, 0.26, 0.26, 0, 0.38, 0.22, { ink: 0.015 });
    d.add("box", "#ff8a2e", 0.12, 0.06, 0.14, 0, 0.36, 0.38);
    this.ducks.push({ b, x, y, z, r, ph: i * 2.6 });
  }
  boat(x: number, y: number, z: number, yaw: number, i: number) {
    const d = this.dyn;
    const b = d.body();
    const kind = i % 3;
    const hull = ["#ff3d56", "#3ec6ff", "#ffffff", "#ffd23f", "#33d67c"][i % 5];
    let smoke: THREE.Vector3 | null = null;
    d.add("box", hull, 1.4, 0.55, 2.8, 0, 0.12, 0, { ink: 0.035 });
    d.add("box", hull, 0.99, 0.55, 0.99, 0, 0.12, 1.4, { ry: Math.PI / 4, ink: 0.035 });
    d.add("box", "#ffffff", 1.44, 0.12, 2.84, 0, 0.3, 0);
    d.add("box", "#b98250", 1.2, 0.06, 2.5, 0, 0.42, 0);
    if (kind === 0) {
      // a fishing boat: a cabin, a funnel smoking
      d.add("box", "#f6f3ff", 0.95, 0.8, 0.9, 0, 0.85, -0.45, { ink: 0.03 });
      d.add("box", "#7fd8ff", 0.97, 0.26, 0.7, 0, 0.95, -0.45, { glow: true });
      d.add("box", "#ff6b35", 1.05, 0.12, 1.0, 0, 1.31, -0.45);
      d.add("cyl", "#2a1f55", 0.3, 0.6, 0.3, 0, 1.6, -0.75, { ink: 0.02 });
      d.add("box", "#ff6b35", 0.08, 1.4, 0.08, 0, 1.1, 0.8);
      smoke = new THREE.Vector3();
    } else if (kind === 1) {
      // a sailboat
      d.add("cyl8", "#e8e4ff", 0.1, 3.2, 0.1, 0, 2.0, 0.1);
      d.add("cone6", "#ffffff", 0.08, 2.6, 1.9, 0, 1.95, -0.4, { ink: 0.02 });
      d.add("box", hull, 0.06, 0.3, 0.5, 0, 3.6, 0.1);
    } else {
      // a little tug with tyres along its side
      d.add("box", "#ffd23f", 1.0, 0.9, 1.1, 0, 0.9, 0.0, { ink: 0.03 });
      d.add("box", "#2a1f55", 1.02, 0.3, 0.6, 0, 1.05, 0.2, { glow: false });
      d.add("box", "#7fd8ff", 1.03, 0.22, 0.5, 0, 1.08, 0.2, { glow: true });
      for (const s of [-0.75, 0.75]) for (let k = 0; k < 3; k++) d.add("torus", "#2a2440", 0.4, 0.4, 0.4, s, 0.2, -0.8 + k * 0.8, { ry: Math.PI / 2 });
      smoke = new THREE.Vector3();
    }
    this.bobs.push({ b, x, y, z, yaw, ph: i * 1.9, amp: 0.09, roll: 0.07, spin: 0, smoke });
  }
  buoy(x: number, y: number, z: number, c: string) {
    const d = this.dyn;
    const b = d.body();
    d.add("cyl8", c, 0.6, 0.5, 0.6, 0, 0.1, 0, { ink: 0.025 });
    d.add("cyl8", "#ffffff", 0.62, 0.14, 0.62, 0, 0.25, 0);
    d.add("cone6", c, 0.4, 0.6, 0.4, 0, 0.62, 0, { ink: 0.02 });
    d.add("orb", "#fff3a0", 0.16, 0.16, 0.16, 0, 1.0, 0, { glow: true });
    this.bobs.push({ b, x, y, z, yaw: 0, ph: Math.random() * 6, amp: 0.12, roll: 0.12, spin: 0, smoke: null });
  }
  islet(x: number, y: number, z: number, s: number, i: number, rnd: () => number) {
    const d = this.dyn;
    const b = d.body();
    d.add("hex", "#86cb61", 6 * s, 0.6, 5.4 * s, 0, 0, 0, { ink: 0.05 });
    d.add("hex", "#b27a4b", 5.8 * s, 1.2, 5.2 * s, 0, -0.85, 0, { ink: 0.04 });
    d.add("cone6", "#7d6698", 5.4 * s, 4.5 * s, 5 * s, 0, -3.6 * s, 0, { rx: Math.PI, ink: 0.04 });
    d.add("cone6", "#6e5a8c", 2.4 * s, 3 * s, 2.4 * s, 1.2 * s, -6 * s, 0.4 * s, { rx: Math.PI });
    if (i % 3 === 0) {
      d.add("box", "#7a4a2b", 0.36, 1.4 * s, 0.36, 0.6, 0.9 * s, 0);
      d.add("orb", rnd() < 0.5 ? "#4fbf5a" : "#7ad35a", 2.2 * s, 2 * s, 2.2 * s, 0.6, 2.2 * s, 0, { ink: 0.04 });
    } else if (i % 3 === 1) {
      d.add("hex", "#7fe8ff", 0.7, 2.6 * s, 0.7, -0.4, 1.3 * s, 0.3, { glow: true, rz: 0.2 });
      d.add("hex", "#d0a8ff", 0.5, 1.8 * s, 0.5, 0.5, 0.9 * s, -0.4, { glow: true, rz: -0.4 });
    } else {
      d.add("box", "#f6efe2", 1.6, 1.3, 1.4, 0, 0.95, 0, { ink: 0.03 });
      d.add("roof", "#ff6b35", 2.3, 1.0, 2.0, 0, 2.1, 0, { ink: 0.03, ry: Math.PI / 4 });
      d.add("box", "#ffcf7a", 0.4, 0.4, 0.05, 0.3, 1.0, 0.71, { glow: true });
      for (let k = 0; k < 3; k++) d.add("cone6", "#3ea85a", 0.9, 1.5, 0.9, -1.6 + k * 0.4, 0.9, -1 + k * 0.7, { ink: 0.02 });
    }
    this.bobs.push({ b, x, y, z, yaw: i * 0.7, ph: i * 1.3, amp: 0.55, roll: 0.03, spin: 0.02 * (i % 2 ? 1 : -1), smoke: null });
  }
  /** A bare rock drifting off the edge: a few voxel chunks, a crystal sometimes. */
  rock(x: number, y: number, z: number, s: number, rnd: () => number) {
    const d = this.dyn;
    const b = d.body();
    const cols = ["#8f74ab", "#7f679b", "#705a8e", "#a184bd"];
    for (let i = 0; i < 4; i++) d.add("box", cols[i % cols.length], (1.6 - i * 0.25) * s * 1.4, (1.1 + rnd() * 0.6) * s, (1.4 - i * 0.2) * s * 1.4, (rnd() - 0.5) * s, -i * 0.8 * s, (rnd() - 0.5) * s, { ry: rnd() * 2, ink: 0.04 });
    d.add("box", "#7ec65b", 1.9 * s, 0.3 * s, 1.7 * s, 0, 0.6 * s, 0, { ry: 0.3, ink: 0.03 });
    if (rnd() < 0.5) d.add("hex", "#7fe8ff", 0.4 * s, 1.4 * s, 0.4 * s, 0.4 * s, 1.2 * s, 0, { glow: true, rz: 0.3 });
    this.bobs.push({ b, x, y, z, yaw: rnd() * 6, ph: rnd() * 6, amp: 0.45, roll: 0.05, spin: 0.03 * (rnd() < 0.5 ? 1 : -1), smoke: null });
  }
  /** A conveyor's load: n blocks riding from a to b, round again. */
  belt(ax: number, ay: number, az: number, bx: number, by: number, bz: number, n: number) {
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i < n; i++) {
      const b = this.dyn.body();
      this.dyn.add("box", i % 2 ? "#ffcf2e" : "#ff9a3c", 0.55, 0.55, 0.55, 0, 0.27, 0, { ink: 0.025 });
      this.belts.push({ b, ax, ay, az, bx, by, bz, yaw, f: i / n });
    }
  }
  private belts: { b: number; ax: number; ay: number; az: number; bx: number; by: number; bz: number; yaw: number; f: number }[] = [];
  /** The cloud puffs drift round. */
  drift(o: THREE.Object3D) {
    this.clouds.push(o);
  }

  // ---- built once everything has asked ----------------------------------------------------------------

  build(scene: THREE.Scene) {
    this.dyn.build(scene);
    // flags (cloth waving in the vertex shader) and pennants
    const time = this.time;
    const wave = (amp: string) => (sh: { uniforms: Record<string, { value: unknown }>; vertexShader: string }) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\n${amp}`);
    };
    if (this.flags.length) {
      const geo = new THREE.PlaneGeometry(1, 0.66, 8, 2);
      geo.translate(0.5, 0, 0);
      const tex = canvasTex(128, 86, (g) => {
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, 128, 86);
        g.fillStyle = "rgba(0,0,0,0.18)";
        g.fillRect(0, 0, 128, 12);
        g.fillRect(0, 74, 128, 12);
        // the ⓩ mark (its shadow, then the mark)
        drawMark(g, 67, 45, 62, "rgba(30,16,60,0.55)", "rgba(30,16,60,0.55)");
        drawMark(g, 65, 43, 62, "rgba(255,255,255,0.92)", "rgba(255,255,255,0.92)");
      });
      const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps(), side: THREE.DoubleSide });
      mat.onBeforeCompile = wave(`float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
transformed.z += sin(position.x * 5.0 - uTime * 7.0 + ph) * 0.14 * position.x;
transformed.y += sin(position.x * 3.0 - uTime * 4.5 + ph) * 0.05 * position.x;`) as never;
      mat.customProgramCacheKey = () => "board-flag";
      const m = new THREE.InstancedMesh(geo, mat, this.flags.length);
      this.flags.forEach((f, i) => {
        m.setMatrixAt(i, tm.compose(tv.set(f.x, f.y, f.z), tq.setFromAxisAngle(Y, f.yaw - Math.PI / 2), ts.set(f.s, f.s, f.s)));
        m.setColorAt(i, new THREE.Color(f.c));
      });
      m.computeBoundingSphere();
      m.raycast = () => {};
      scene.add(m);
    }
    if (this.pennants.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute([-0.19, 0, 0, 0.19, 0, 0, 0, -0.42, 0], 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      const mat = new THREE.MeshToonMaterial({ gradientMap: toonSteps(), side: THREE.DoubleSide });
      mat.onBeforeCompile = wave(`float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
transformed.z += sin(uTime * 3.2 + ph) * 0.25 * (-position.y);`) as never;
      mat.customProgramCacheKey = () => "board-pennant";
      const m = new THREE.InstancedMesh(geo, mat, this.pennants.length);
      this.pennants.forEach((f, i) => {
        m.setMatrixAt(i, tm.compose(tv.set(f.x, f.y, f.z), tq.setFromAxisAngle(Y, f.yaw), ts.set(1, 1, 1)));
        m.setColorAt(i, new THREE.Color(f.c));
      });
      m.computeBoundingSphere();
      m.raycast = () => {};
      scene.add(m);
    }
    // searchlights and their pools on the ground
    if (this.beams.length) {
      const geo = new THREE.ConeGeometry(1, 1, 18, 1, true);
      geo.translate(0, -0.5, 0);
      this.beamMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: "#fff1c4", transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), this.beams.length);
      this.beamMesh.frustumCulled = false;
      this.beamMesh.raycast = () => {};
      scene.add(this.beamMesh);
      const pg = new THREE.PlaneGeometry(1, 1);
      pg.rotateX(-Math.PI / 2);
      this.beamPools = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: glowTex(), color: "#fff0b8", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }), this.beams.length);
      this.beamPools.frustumCulled = false;
      this.beamPools.raycast = () => {};
      this.beamPools.renderOrder = 2;
      scene.add(this.beamPools);
    }
    // motes: one points draw, drifting in the shader
    if (this.motes.length) {
      const n = this.motes.length;
      const pos = new Float32Array(n * 3),
        col = new Float32Array(n * 3),
        ph = new Float32Array(n);
      this.motes.forEach((m, i) => {
        pos.set([m.x, m.y, m.z], i * 3);
        col.set([m.c.r, m.c.g, m.c.b], i * 3);
        ph[i] = Math.random();
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("aPh", new THREE.BufferAttribute(ph, 1));
      geo.computeBoundingSphere();
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: time, uMap: { value: glowTex() } },
        vertexShader: /* glsl */ `
          attribute float aPh;
          attribute vec3 color;
          uniform float uTime;
          varying vec3 vC;
          varying float vA;
          void main() {
            float t = uTime * 0.6 + aPh * 40.0;
            vec3 p = position + vec3(sin(t * 0.9) * 0.7, sin(t * 1.3 + aPh * 7.0) * 0.45, cos(t * 0.7) * 0.7);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            vA = 0.35 + 0.65 * max(0.0, sin(uTime * 2.6 + aPh * 31.0));
            gl_PointSize = clamp(8.0 * (0.7 + vA * 0.5) * (40.0 / max(6.0, -mv.z)), 1.5, 12.0);
            vC = color;
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          varying vec3 vC;
          varying float vA;
          void main() {
            vec4 g = texture2D(uMap, gl_PointCoord);
            gl_FragColor = vec4(vC * g.a * vA * 1.25, 1.0);
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(geo, mat);
      pts.raycast = () => {};
      pts.renderOrder = 3;
      scene.add(pts);
    }
    // the crowd: the city's zkSNARKs (eight of them at most, over and over: a draw each)
    if (this.npcs.length) {
      this.crowd = new SnarkCrowd(scene);
      for (let id = 211; this.ids.length < Math.min(8, this.npcs.length); id += 1237) this.ids.push(((id - 1) % 10000) + 1);
      this.npcs.forEach((n, i) => {
        n.member = this.crowd!.add(this.ids[i % this.ids.length], n.x, n.y, n.z, n.yaw, NPC_SCALE);
      });
      this.crowd.build();
    }
  }

  // ---- the frame ---------------------------------------------------------------------------------------

  /** The crowd round (x, z) cheers (k: how many of them, how wildly). */
  cheer(x: number, z: number, r: number, k = 1) {
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d > r || Math.random() > k) continue;
      n.cheerAt = this.t + Math.random() * 0.35 + d * 0.02;
    }
  }
  /** Everyone cheers (a Z-Block bought). */
  cheerAll() {
    for (const n of this.npcs) n.cheerAt = this.t + Math.random() * 0.6;
  }

  update(dt: number, at: THREE.Vector3, fx: Fx3) {
    this.t += dt;
    this.frame++;
    const t = this.t;
    this.time.value = t;
    const d = this.dyn;
    // birds round their circles, flapping (gulls glide between flaps)
    for (const b of this.birds) {
      const th = b.ph + (t * b.sp) / b.r;
      const x = b.cx + Math.cos(th) * b.r,
        z = b.cz + Math.sin(th) * b.r,
        y = b.h + Math.sin(t * 0.7 + b.ph) * 0.8;
      const yaw = Math.atan2(-Math.sin(th), Math.cos(th));
      te.set(0, yaw, -0.32, "YXZ");
      d.bodies[b.b].compose(tv.set(x, y, z), tq.setFromEuler(te), ts.set(1, 1, 1));
      const fl = b.gull ? Math.sin(t * 7 + b.ph) * (Math.sin(t * 0.8 + b.ph) > 0 ? 0.55 : 0.1) : Math.sin(t * 16 + b.ph) * 0.7;
      tm.makeRotationZ(fl);
      d.bodies[b.wl].multiplyMatrices(d.bodies[b.b], tm);
      tm.makeRotationZ(-fl);
      d.bodies[b.wr].multiplyMatrices(d.bodies[b.b], tm);
    }
    // boats, buoys, islets bob
    for (const o of this.bobs) {
      const y = o.y + Math.sin(t * 1.3 + o.ph) * o.amp;
      te.set(Math.sin(t * 0.9 + o.ph) * o.roll * 0.6, o.yaw + t * o.spin, Math.sin(t * 1.1 + o.ph * 1.7) * o.roll, "YXZ");
      d.bodies[o.b].compose(tv.set(o.x, y, o.z), tq.setFromEuler(te), ts.set(1, 1, 1));
      if (o.smoke) o.smoke.set(0, 1.9, -0.75).applyMatrix4(d.bodies[o.b]);
    }
    for (const k of this.ducks) {
      const th = k.ph + t * 0.25;
      te.set(0, Math.atan2(-Math.sin(th), Math.cos(th)), Math.sin(t * 2 + k.ph) * 0.06, "YXZ");
      d.bodies[k.b].compose(tv.set(k.x + Math.cos(th) * k.r, k.y + Math.sin(t * 2.2 + k.ph) * 0.03, k.z + Math.sin(th) * k.r), tq.setFromEuler(te), ts.set(1, 1, 1));
    }
    for (const r of this.rotors) {
      te.set(0, r.yaw, t * r.sp, "YXZ");
      d.bodies[r.b].compose(tv.set(r.x, r.y, r.z), tq.setFromEuler(te), ts.set(1, 1, 1));
    }
    for (const c of this.belts) {
      const f = (c.f + t * 0.12) % 1;
      tq.setFromAxisAngle(Y, c.yaw);
      d.bodies[c.b].compose(tv.set(c.ax + (c.bx - c.ax) * f, c.ay + (c.by - c.ay) * f, c.az + (c.bz - c.az) * f), tq, ts.setScalar(f < 0.06 ? f / 0.06 : f > 0.94 ? (1 - f) / 0.06 : 1));
    }
    for (const b of this.blinks) {
      const on = Math.sin(t * 3 + b.ph) > 0.2;
      d.bodies[b.b].compose(tv.set(b.x, b.y, b.z), tq.identity(), ts.setScalar(on ? 1 : 0.35));
    }
    d.update();
    // searchlights sweep; their pools follow where they land
    if (this.beamMesh && this.beamPools) {
      for (let i = 0; i < this.beams.length; i++) {
        const b = this.beams[i];
        const yaw = b.spin ? t * b.sp + b.ph : b.yaw0 + Math.sin(t * 0.5 * b.sp + b.ph) * 1.1;
        const el = b.spin ? 0.04 : 0.5 + Math.sin(t * 0.37 + b.ph) * 0.12;
        tv.set(Math.sin(yaw) * Math.cos(el), -Math.sin(el), Math.cos(yaw) * Math.cos(el));
        tq.setFromUnitVectors(DOWN, tv);
        const rad = b.len * 0.16;
        this.beamMesh.setMatrixAt(i, tm.compose(ts.set(b.x, b.y, b.z), tq, tv.set(rad, b.len, rad)));
        if (!b.spin) {
          const reach = Math.min(b.len, b.y / Math.max(0.05, Math.sin(el)));
          const gx = b.x + Math.sin(yaw) * Math.cos(el) * reach,
            gz = b.z + Math.cos(yaw) * Math.cos(el) * reach;
          this.beamPools.setMatrixAt(i, tm.compose(tv.set(gx, 0.08, gz), tq.identity(), ts.set(3.2, 1, 3.2)));
        } else this.beamPools.setMatrixAt(i, tm.compose(tv.set(0, -100, 0), tq.identity(), ts.set(0.001, 1, 0.001)));
      }
      this.beamMesh.instanceMatrix.needsUpdate = true;
      this.beamPools.instanceMatrix.needsUpdate = true;
    }
    for (const c of this.clouds) c.rotation.y = t * 0.004;
    // smoke, sparks, the fountain's spray
    this.smokeT -= dt;
    if (this.smokeT <= 0 && this.smoke.length) {
      this.smokeT = 0.3;
      const p = this.smoke[Math.floor(Math.random() * this.smoke.length)];
      fx.burst(p, 2, ["#d9d4f0", "#b9b4d0", "#ffffff"], { speed: 0.6, up: 2.2, gravity: -0.6, size: 0.5, life: 2.6, drag: 0.4 });
    }
    for (const o of this.bobs) if (o.smoke && Math.random() < dt * 1.2) fx.burst(o.smoke, 1, ["#e9e4f5", "#ffffff"], { speed: 0.3, up: 1.4, gravity: -0.4, size: 0.32, life: 1.8, drag: 0.4 });
    for (const s of this.sparks) {
      s.t -= dt * s.rate;
      if (s.t <= 0) {
        s.t = 0.12 + Math.random() * 0.5;
        fx.burst(s.p, 3 + Math.floor(Math.random() * 4), ["#ffd23f", "#ff8a2e", "#fff3c4"], { speed: 3.2, up: 4, gravity: 12, size: 0.09, life: 0.7 });
      }
    }
    this.sprayT -= dt;
    if (this.sprayT <= 0 && this.fountains.length) {
      this.sprayT = 0.09;
      for (const f of this.fountains) fx.burst(tv.set(f.x, f.y, f.z), 2, ["#ffffff", "#bfefff", "#8fdcff"], { speed: 1.4, up: 3.6, gravity: 10, size: 0.11, life: 0.75, drag: 0.1 });
    }
    // the crowd: idle fidgets, waves, hops; they turn to watch the walker; a cheer when asked
    if (this.npcs.length) {
      const fo = this.focus;
      for (let i = 0; i < this.npcs.length; i++) {
        const n = this.npcs[i];
        n.acc += dt;
        const near = (n.x - at.x) ** 2 + (n.z - at.z) ** 2 < 45 * 45;
        if (!near && (this.frame + i) % 4) continue;
        const step = n.acc;
        n.acc = 0;
        const m = n.member.motion;
        if (n.cheerAt >= 0 && t >= n.cheerAt) {
          n.cheerAt = -1;
          m.celebrate(1.6);
          n.hopT = 0.5;
        }
        if (t > n.next) {
          n.next = t + 2.5 + Math.random() * 4.5;
          const r = Math.random();
          if (r < 0.3) m.wave(1.4);
          else if (r < 0.45) (m.celebrate(1.0), (n.hopT = 0.42));
          else if (r < 0.6) m.talk(1.6);
          else n.base += (Math.random() - 0.5) * 0.8;
        }
        let want = n.base;
        if (fo) {
          const dx = fo.x - n.x,
            dz = fo.z - n.z;
          if (dx * dx + dz * dz < 14 * 14) want = Math.atan2(dx, dz);
        }
        let dd = want - n.yaw;
        dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        n.yaw += dd * Math.min(1, step * 3);
        let vy = 0;
        if (n.hopT > 0) {
          n.hopT = Math.max(0, n.hopT - step);
          const k = 1 - n.hopT / 0.5;
          n.y = Math.sin(k * Math.PI) * 0.5;
          vy = Math.cos(k * Math.PI) * 3;
        } else n.y = 0;
        void vy;
        n.member.x = n.x;
        n.member.y = n.y;
        n.member.z = n.z;
        n.member.yaw = n.yaw;
      }
      this.crowd?.update(dt);
    }
  }

  dispose() {
    this.crowd?.dispose();
    this.npcs = [];
    this.crowd = null;
  }
}
