import * as THREE from "three";
import type { Floor, Interior, Rect } from "./types";
import type { WalkControls } from "./walk";

/**
 * Vertical circulation inside the walk-in places: real lift cars, stairs and escalators the
 * walker uses on foot, instead of a teleport list.
 *
 * Lift car: a cabin standing on each floor it serves, with sliding doors. Walk in and a small panel
 * of floor buttons appears (click, or 0–9 / PgUp / PgDn). The doors close, the car "rides" (the view
 * stays in the closed cabin, an indicator counts the floors, a ding), and the doors open on the
 * target floor with you in the same spot of the same cabin, facing out. The cabin is identical on
 * every floor and, while its doors are shut, only the cabin is drawn (camera layer CIRC_LAYER), so
 * the floor swap behind it is invisible.
 *
 * Flight (stairs, an escalator lane, a catwalk): a zone in the place's own space where its floors
 * are stacked at their real heights. The ground ramps from one floor to the next over it and the
 * floor index switches near its head or foot without moving the walker: no cut at all.
 *
 * Where a place doesn't say where its lifts go, a free, reachable spot is found on each
 * floor from its colliders (against a wall when possible, the car's door facing where the floor's
 * spawn point is: that is "where you step out of the elevator").
 */

export const CIRC_LAYER = 7;

/** Where a car stands; `yaw` is the way you face walking out of it. */
export interface Spot {
  x: number;
  z: number;
  yaw: number;
}
export interface LiftDecl {
  /** Cars with the same shaft are one lift: a car serves every floor its shaft has a car on. */
  shaft?: string;
  at?: Spot;
  style?: StyleName;
  /** Name on its panel and sign ("LIFT", "MONORAIL"). */
  name?: string;
  /** A shuttle (monorail, garden tram): windows with the view sliding past. */
  windows?: boolean;
  /** Floor-0 cars: how far from the entrance at least (m). */
  minDist?: number;
  /** Where to look for a spot (the car's centre), when `at` isn't given. */
  near?: { x: number; z: number };
  /** Place colliders to ignore on this floor (a railing across its doorway). */
  clear?: Rect[];
  /** A narrower cabin (1.6 m inside, 1 m doors) for tight landings. */
  narrow?: boolean;
  /** A lower shaft (under a low ceiling: a tunnel, a vomitory). */
  compact?: boolean;
  /** Draw a slender shaft frame this far down under the car (a lift up a tree, a tower leg). */
  column?: number;
  /** …or this far up over it (the same shaft seen from its foot). */
  rise?: number;
}
export interface StairDecl {
  from: number;
  to: number;
  /**
   * A flight in the place's own space (its floors stacked at their real heights): the footprint
   * [x0, z0, x1, z1] and the way up. The ground ramps from one floor to the other over it and the
   * floor switches near its top or bottom, the walker never moved.
   */
  zone: Rect;
  up?: "+x" | "-x" | "+z" | "-z";
  /** Draw the flight (the place has none). */
  build?: boolean;
  /** Collidable rails along both long sides (default true). */
  rails?: boolean;
  /** Place colliders to ignore on both floors (the flight's own "solid", a railing across its head). */
  clear?: Rect[];
  /** Place colliders to ignore on one floor: [floor, rect]. */
  clearOn?: [number, Rect][];
  /** Extra walls on one floor (fences round a landing over a void): [floor, rect]. */
  walls?: [number, Rect][];
  kind?: "stairs" | "escalator";
  /** Escalators: 1 runs up, -1 down. */
  move?: 1 | -1;
  style?: StyleName;
}
export interface Plan {
  style?: StyleName;
  /** Lifts per floor; default: one "main" lift on every floor. `[]` for none. */
  lifts?: (floor: number) => LiftDecl[];
  stairs?: StairDecl[];
  /** Floors that are one walkable space already (a helix between them): no lift needed. */
  together?: number[][];
}

// ---- styles ---------------------------------------------------------------------------------------

export type StyleName = "steel" | "gold" | "brass" | "wood" | "industrial" | "eiffel" | "garden" | "palm" | "stone" | "sport" | "neon" | "white";
interface Style {
  shell: string;
  trim: string;
  door: string;
  wall: string;
  floor: string;
  ceil: string;
  light: string;
  accent: string;
  metal: number;
}
const STYLES: Record<StyleName, Style> = {
  steel: { shell: "#3a3f48", trim: "#b8c0cc", door: "#9aa3ae", wall: "#7d858f", floor: "#2b2d33", ceil: "#d9dde3", light: "#fff6e0", accent: "#f4b728", metal: 0.7 },
  gold: { shell: "#2a2118", trim: "#d8b25a", door: "#c79b45", wall: "#6b5333", floor: "#1d1712", ceil: "#efe0bd", light: "#ffe9b8", accent: "#ffd27a", metal: 0.8 },
  brass: { shell: "#3b2c1e", trim: "#c49a52", door: "#a8844a", wall: "#6e4e32", floor: "#3a2a1c", ceil: "#e8dcc4", light: "#ffe7c0", accent: "#e8c27a", metal: 0.6 },
  wood: { shell: "#4a3424", trim: "#c9a46a", door: "#8a6440", wall: "#7a5838", floor: "#3b2a1d", ceil: "#efe4cf", light: "#fff0d0", accent: "#f4b728", metal: 0.2 },
  industrial: { shell: "#3d4146", trim: "#e3b23c", door: "#6d7378", wall: "#5e646a", floor: "#2e3134", ceil: "#c5c9cc", light: "#f2f6ff", accent: "#ffcf3a", metal: 0.5 },
  eiffel: { shell: "#4a3a2c", trim: "#c7a35a", door: "#7a5a3a", wall: "#8c6a47", floor: "#3a2e24", ceil: "#efe2c8", light: "#ffe9c2", accent: "#f2c14e", metal: 0.4 },
  garden: { shell: "#2f3d33", trim: "#a7c4a0", door: "#7f9a86", wall: "#5d7563", floor: "#26302a", ceil: "#e4efe2", light: "#f4ffef", accent: "#8fe39a", metal: 0.3 },
  palm: { shell: "#e9e2d4", trim: "#2aa6a0", door: "#d7d0c2", wall: "#c9c0ae", floor: "#7e6e58", ceil: "#fbf8f1", light: "#fffaf0", accent: "#2ad1c4", metal: 0.15 },
  stone: { shell: "#6b5f52", trim: "#b8a07a", door: "#5a4a3a", wall: "#8a7c6a", floor: "#4a4036", ceil: "#d8cdb8", light: "#ffe2b0", accent: "#e8a84a", metal: 0.1 },
  sport: { shell: "#2b3036", trim: "#e9ecef", door: "#4a5058", wall: "#7a8088", floor: "#30353b", ceil: "#dfe3e8", light: "#ffffff", accent: "#3ad06a", metal: 0.3 },
  neon: { shell: "#15121f", trim: "#c86bff", door: "#3a3352", wall: "#2e2842", floor: "#141119", ceil: "#3b3452", light: "#f0e4ff", accent: "#5ef0ff", metal: 0.6 },
  white: { shell: "#d9dde2", trim: "#8b96a3", door: "#c3cad2", wall: "#b4bcc5", floor: "#5a626b", ceil: "#f6f8fa", light: "#ffffff", accent: "#3aa0ff", metal: 0.4 },
};

const matCache = new Map<string, THREE.Material>();
/** Unlit, for everything seen from inside (it must look the same with or without the room's lights). */
function basic(color: string | THREE.Color, k = 1) {
  const c = new THREE.Color(color).multiplyScalar(k);
  const key = `b${c.getHexString()}`;
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = new THREE.MeshBasicMaterial({ color: c, fog: false })));
  return m;
}
function lit(color: string, metal = 0.3, rough = 0.5) {
  const key = `s${color}${metal}${rough}`;
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough })));
  return m;
}

/** A mesh seen from inside: drawn on the room's layer and on the circulation layer. */
function inner(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0);
  m.layers.enable(CIRC_LAYER);
  parent.add(m);
  return m;
}
/** An axis-aligned box from (x0, y0, z0) to (x1, y1, z1), group-local. */
function boxAt(parent: THREE.Object3D, mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, both = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  if (both) m.layers.enable(CIRC_LAYER);
  parent.add(m);
  return m;
}
function canvasTex(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, g: c.getContext("2d")!, t };
}

// ---- local frames -----------------------------------------------------------------------------------

/** World (x, z) of a local point (u right, v back: a car's door is at −v). */
function toWorld(s: Spot, u: number, v: number): [number, number] {
  const c = Math.cos(s.yaw),
    sn = Math.sin(s.yaw);
  // local −z is the facing direction (−sin yaw, −cos yaw); local +x is (cos yaw, −sin yaw)
  return [s.x + u * c + v * sn, s.z - u * sn + v * c];
}
function toLocal(s: Spot, x: number, z: number): [number, number] {
  const dx = x - s.x,
    dz = z - s.z;
  const c = Math.cos(s.yaw),
    sn = Math.sin(s.yaw);
  return [dx * c - dz * sn, dx * sn + dz * c];
}
/** A local rectangle as a world collider (the spot's yaw is a quarter turn). */
function rectOf(s: Spot, u0: number, v0: number, u1: number, v1: number): Rect {
  const a = toWorld(s, u0, v0),
    b = toWorld(s, u1, v1);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}
const quarter = (y: number) => Math.round(y / (Math.PI / 2)) * (Math.PI / 2);

// ---- the lift car ---------------------------------------------------------------------------------

/** Cabin inside: width, depth, height; wall thickness; door opening width and height; shell height. */
const WI0 = 2.0,
  DI = 1.7,
  HC = 2.5,
  T = 0.12,
  DW0 = 1.2,
  DH = 2.15,
  HS_FULL = 2.95;
const FZ = -DI / 2; // the cabin's front (door) line
const OZ = FZ - 0.18; // the shell's outer front
/** The car's footprint, local (u0, v0, u1, v1), and the free space it needs in front. */
/** A car's footprint, local (u0, v0, u1, v1) (a narrow car for tight landings). */
const carFoot = (narrow = false): [number, number, number, number] => {
  const w = narrow ? 1.6 : WI0;
  return [-w / 2 - T - 0.05, OZ - 0.05, w / 2 + T + 0.05, DI / 2 + T + 0.05];
};
const CAR_APPROACH: [number, number, number, number] = [-0.8, OZ - 1.5, 0.8, OZ - 0.05];

class Car {
  readonly group = new THREE.Group();
  readonly doors: THREE.Mesh[] = [];
  readonly rects: Rect[];
  private doorRect: Rect;
  private shutRect: Rect;
  private openRect: Rect;
  open = 0;
  /** Cabin width and door width (narrow cars for tight landings). */
  readonly wi: number;
  readonly dw: number;
  /** Inside indicator: label shown, arrow. */
  private ind: ReturnType<typeof canvasTex>;
  private indKey = "";
  private windows: THREE.Texture | null = null;
  constructor(
    readonly floor: number,
    readonly shaft: string,
    readonly spot: Spot,
    readonly y: number,
    readonly st: Style,
    readonly name: string,
    labels: string[],
    hereLabel: string,
    shuttle: boolean,
    readonly decl: LiftDecl = {},
  ) {
    const HS = decl.compact ? 2.72 : HS_FULL;
    const WI = (this.wi = decl.narrow ? 1.6 : WI0),
      DW = (this.dw = decl.narrow ? 1.0 : DW0);
    const g = this.group;
    g.position.set(spot.x, y, spot.z);
    g.rotation.y = spot.yaw;
    const wallM = basic(st.wall),
      wallD = basic(st.wall, 0.82),
      floorM = basic(st.floor),
      ceilM = basic(st.ceil),
      trimM = basic(st.trim),
      doorM = basic(st.door, 0.95);
    // floor, walls (inner faces), ceiling with its light
    inner(g, new THREE.PlaneGeometry(WI, DI), floorM, 0, 0.025, 0, -Math.PI / 2);
    inner(g, new THREE.PlaneGeometry(WI, HC), wallD, 0, HC / 2, DI / 2, 0, Math.PI);
    inner(g, new THREE.PlaneGeometry(DI, HC), wallM, -WI / 2, HC / 2, 0, 0, Math.PI / 2);
    inner(g, new THREE.PlaneGeometry(DI, HC), wallM, WI / 2, HC / 2, 0, 0, -Math.PI / 2);
    const seg = (WI - DW) / 2;
    inner(g, new THREE.PlaneGeometry(seg, HC), wallD, -WI / 2 + seg / 2, HC / 2, FZ);
    inner(g, new THREE.PlaneGeometry(seg, HC), wallD, WI / 2 - seg / 2, HC / 2, FZ);
    inner(g, new THREE.PlaneGeometry(DW, HC - DH), wallD, 0, (HC + DH) / 2, FZ);
    inner(g, new THREE.PlaneGeometry(WI, DI), ceilM, 0, HC, 0, Math.PI / 2);
    inner(g, new THREE.PlaneGeometry(1.2, 0.9), basic(st.light, 1.25), 0, HC - 0.01, 0.05, Math.PI / 2);
    // a kick plate, a handrail round three sides, a mirror band on the back wall
    boxAt(g, trimM, -WI / 2 + 0.01, 0.02, -DI / 2 + 0.05, WI / 2 - 0.01, 0.14, -DI / 2 + 0.06);
    boxAt(g, trimM, -WI / 2 + 0.06, 0.92, DI / 2 - 0.09, WI / 2 - 0.06, 0.96, DI / 2 - 0.05);
    boxAt(g, trimM, -WI / 2 + 0.05, 0.92, -0.55, -WI / 2 + 0.09, 0.96, DI / 2 - 0.06);
    boxAt(g, trimM, WI / 2 - 0.09, 0.92, -0.55, WI / 2 - 0.05, 0.96, DI / 2 - 0.06);
    if (shuttle) {
      // a shuttle (monorail, garden tram): windows on the sides, the view slides past while it rides
      const w = canvasTex(256, 64);
      const grad = w.g.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, "#9fd8f0");
      grad.addColorStop(0.55, "#d9f2fb");
      grad.addColorStop(0.56, "#2f7f6a");
      grad.addColorStop(1, "#1d5446");
      w.g.fillStyle = grad;
      w.g.fillRect(0, 0, 256, 64);
      for (let i = 0; i < 14; i++) {
        w.g.fillStyle = i % 3 ? "#24654f" : "#3d8a5d";
        const x = (i * 53) % 256;
        w.g.beginPath();
        w.g.arc(x, 36, 6 + (i % 4) * 3, 0, Math.PI * 2);
        w.g.fill();
      }
      w.t.wrapS = THREE.RepeatWrapping;
      this.windows = w.t;
      const wm = new THREE.MeshBasicMaterial({ map: w.t, fog: false });
      inner(g, new THREE.PlaneGeometry(DI - 0.4, 0.7), wm, -WI / 2 + 0.01, 1.55, 0, 0, Math.PI / 2);
      inner(g, new THREE.PlaneGeometry(DI - 0.4, 0.7), wm, WI / 2 - 0.01, 1.55, 0, 0, -Math.PI / 2);
    } else inner(g, new THREE.PlaneGeometry(WI - 0.5, 1.0), basic(st.ceil, 0.55), 0, 1.55, DI / 2 - 0.01, 0, Math.PI);
    // the button panel by the door (inside): the floors it serves
    const pc = canvasTex(64, 160);
    pc.g.fillStyle = "#15171b";
    pc.g.fillRect(0, 0, 64, 160);
    pc.g.font = '700 15px "JetBrains Mono", Menlo, monospace';
    pc.g.textAlign = "center";
    pc.g.textBaseline = "middle";
    const n = labels.length;
    labels.forEach((l, i) => {
      const yy = 150 - ((i + 0.5) * 140) / Math.max(n, 6);
      pc.g.strokeStyle = l === hereLabel ? st.accent : "#8a919b";
      pc.g.lineWidth = 2;
      pc.g.beginPath();
      pc.g.arc(32, yy, 9, 0, Math.PI * 2);
      pc.g.stroke();
      pc.g.fillStyle = "#e9edf2";
      pc.g.fillText(l.slice(0, 2), 32, yy + 1);
    });
    inner(g, new THREE.PlaneGeometry(0.2, 0.5), new THREE.MeshBasicMaterial({ map: pc.t, fog: false }), WI / 2 - seg / 2, 1.25, FZ + 0.01);
    // the indicator over the door (inside)
    this.ind = canvasTex(128, 48);
    inner(g, new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: this.ind.t, fog: false, toneMapped: false }), 0, (HC + DH) / 2, FZ + 0.01);
    this.indicate(hereLabel, 0);
    // the doors: two leaves meeting in the middle, sliding behind the front wall
    for (const s of [-1, 1]) {
      const d = boxAt(g, doorM, 0, 0.02, FZ - 0.07, DW / 2 + 0.02, DH, FZ - 0.03);
      d.geometry.translate(s * (DW / 4 + 0.01), 0, 0);
      d.position.x = 0;
      d.userData.side = s;
      // the seam where the leaves meet, and a brushed band at hand height
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.018, DH - 0.02, 0.05), basic("#15171b"));
      seam.position.set(s * 0.009, 0, 0);
      seam.layers.enable(CIRC_LAYER);
      d.add(seam);
      const band = new THREE.Mesh(new THREE.BoxGeometry(DW / 2 - 0.06, 0.04, 0.05), trimM);
      band.position.set(s * (DW / 4 + 0.01), 1.05 - (DH + 0.02) / 2, 0);
      band.layers.enable(CIRC_LAYER);
      d.add(band);
      this.doors.push(d);
    }
    // ---- outside: the shaft's shell, the portal, the call button, the floor sign (lit by the room)
    const shell = lit(st.shell, 0.2, 0.6),
      trim = lit(st.trim, st.metal, 0.35);
    boxAt(g, shell, -WI / 2 - T, 0, OZ + 0.1, -WI / 2 - 0.01, HS, DI / 2 + T, false);
    boxAt(g, shell, WI / 2 + 0.01, 0, OZ + 0.1, WI / 2 + T, HS, DI / 2 + T, false);
    boxAt(g, shell, -WI / 2 - T, 0, DI / 2 + 0.01, WI / 2 + T, HS, DI / 2 + T, false);
    boxAt(g, shell, -WI / 2 - T, HC + 0.01, OZ + 0.1, WI / 2 + T, HS, DI / 2 + T, false);
    // the front is a little wider than the shaft: the open door leaves hide behind it
    boxAt(g, shell, -WI / 2 - T - 0.12, 0, OZ, -DW / 2, HS, FZ - 0.08, false);
    boxAt(g, shell, DW / 2, 0, OZ, WI / 2 + T + 0.12, HS, FZ - 0.08, false);
    boxAt(g, shell, -DW / 2, DH, OZ, DW / 2, HS, FZ - 0.08, false);
    boxAt(g, trim, -DW / 2 - 0.08, 0, OZ - 0.03, -DW / 2, DH + 0.08, OZ + 0.01, false);
    boxAt(g, trim, DW / 2, 0, OZ - 0.03, DW / 2 + 0.08, DH + 0.08, OZ + 0.01, false);
    boxAt(g, trim, -DW / 2 - 0.08, DH, OZ - 0.03, DW / 2 + 0.08, DH + 0.08, OZ + 0.01, false);
    boxAt(g, trim, -WI / 2 - T - 0.02, HS, OZ - 0.02, WI / 2 + T + 0.02, HS + 0.08, DI / 2 + T + 0.02, false);
    // the sign over the door: what it is and the floor you are on
    const sc = canvasTex(256, 64);
    sc.g.fillStyle = "#101216";
    sc.g.fillRect(0, 0, 256, 64);
    sc.g.textBaseline = "middle";
    // the floor on the right, the lift's name shrunk to fit what is left
    const here = hereLabel.slice(0, 4);
    sc.g.font = '800 28px "JetBrains Mono", Menlo, monospace';
    const hw = sc.g.measureText(here).width;
    sc.g.textAlign = "right";
    sc.g.fillStyle = "#ffffff";
    sc.g.fillText(here, 244, 33);
    const label = `▲▼ ${name}`;
    let px = 28;
    sc.g.font = `800 ${px}px "JetBrains Mono", Menlo, monospace`;
    const room = 256 - 12 - 12 - hw - 14;
    const lw = sc.g.measureText(label).width;
    if (lw > room) px = Math.max(12, Math.floor((px * room) / lw));
    sc.g.font = `800 ${px}px "JetBrains Mono", Menlo, monospace`;
    sc.g.textAlign = "left";
    sc.g.fillStyle = st.accent;
    sc.g.fillText(label, 12, 33);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.275), new THREE.MeshBasicMaterial({ map: sc.t, toneMapped: false }));
    sign.position.set(0, decl.compact ? DH + 0.3 : DH + 0.42, OZ - 0.02);
    sign.rotation.y = Math.PI;
    g.add(sign);
    // the call button, glowing
    const call = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.03), new THREE.MeshBasicMaterial({ color: new THREE.Color(st.accent).multiplyScalar(1.4), toneMapped: false }));
    call.position.set(DW / 2 + 0.28, 1.15, OZ - 0.02);
    g.add(call);
    // a slender frame down to the ground (a lift up a tree trunk, a tower's leg)
    if (decl.column && decl.column > 0.5) {
      const c = decl.column;
      for (const [u, v] of [
        [-WI / 2 - T, -DI / 2],
        [WI / 2 + T, -DI / 2],
        [-WI / 2 - T, DI / 2 + T],
        [WI / 2 + T, DI / 2 + T],
      ])
        boxAt(g, trim, u - 0.06, -c, v - 0.06, u + 0.06, 0, v + 0.06, false);
      for (let y = -c + 1.5; y < -0.5; y += 3) boxAt(g, trim, -WI / 2 - T, y, DI / 2 + T - 0.05, WI / 2 + T, y + 0.08, DI / 2 + T + 0.05, false);
      boxAt(g, shell, -WI / 2 - T, -0.35, OZ + 0.1, WI / 2 + T, 0, DI / 2 + T, false);
    }
    if (decl.rise && decl.rise > HS + 0.5) {
      const top = decl.rise;
      for (const [u, v] of [
        [-WI / 2 - T, -DI / 2],
        [WI / 2 + T, -DI / 2],
        [-WI / 2 - T, DI / 2 + T],
        [WI / 2 + T, DI / 2 + T],
      ])
        boxAt(g, trim, u - 0.06, HS, v - 0.06, u + 0.06, top, v + 0.06, false);
      for (let y = HS + 2; y < top; y += 3) boxAt(g, trim, -WI / 2 - T, y, DI / 2 + T - 0.05, WI / 2 + T, y + 0.08, DI / 2 + T + 0.05, false);
    }
    // colliders: shell walls, the front either side of the doors, the doors while not fully open
    this.rects = [
      rectOf(spot, -WI / 2 - T, OZ, -WI / 2, DI / 2 + T),
      rectOf(spot, WI / 2, OZ, WI / 2 + T, DI / 2 + T),
      rectOf(spot, -WI / 2 - T, DI / 2, WI / 2 + T, DI / 2 + T),
      rectOf(spot, -WI / 2 - T, OZ, -DW / 2, FZ),
      rectOf(spot, DW / 2, OZ, WI / 2 + T, FZ),
    ];
    this.shutRect = rectOf(spot, -DW / 2, OZ, DW / 2, FZ);
    // an open door's collider folds into the wall beside it (a valid rect, never in the way)
    this.openRect = this.rects[3].slice() as Rect;
    this.doorRect = this.shutRect.slice() as Rect;
    this.rects.push(this.doorRect);
  }

  setOpen(o: number) {
    const DW = this.dw;
    this.open = o;
    for (const d of this.doors) d.position.x = (d.userData.side as number) * o * (DW / 2 - 0.02);
    const r = o > 0.92 ? this.openRect : this.shutRect;
    for (let k = 0; k < 4; k++) this.doorRect[k] = r[k];
  }

  /** The indicator over the door, inside: a floor label and an arrow (1 up, -1 down, 0 none). */
  indicate(label: string, dir: number) {
    const key = label + dir;
    if (key === this.indKey) return;
    this.indKey = key;
    const { g, t } = this.ind;
    g.fillStyle = "#0c0d10";
    g.fillRect(0, 0, 128, 48);
    g.fillStyle = "#ff9a3c";
    g.font = '800 30px "JetBrains Mono", Menlo, monospace';
    g.textBaseline = "middle";
    g.textAlign = "center";
    g.fillText(label.slice(0, 3), 76, 26);
    if (dir) {
      g.beginPath();
      const y0 = dir > 0 ? 36 : 12,
        y1 = dir > 0 ? 12 : 36;
      g.moveTo(14, y0);
      g.lineTo(34, y0);
      g.lineTo(24, y1);
      g.closePath();
      g.fill();
    }
    t.needsUpdate = true;
  }

  slide(dt: number) {
    if (this.windows) this.windows.offset.x += dt * 0.35;
  }

  local(x: number, z: number) {
    return toLocal(this.spot, x, z);
  }
  /** Inside the cabin (past the door line). */
  inside(x: number, z: number) {
    const [u, v] = this.local(x, z);
    return Math.abs(u) < this.wi / 2 && v > FZ + 0.22 && v < DI / 2;
  }
  /** On the cabin's floor or in its doorway (its ground is the car's floor). */
  covers(x: number, z: number) {
    const [u, v] = this.local(x, z);
    return u > -this.wi / 2 - T && u < this.wi / 2 + T && v > OZ - 0.02 && v < DI / 2 + T;
  }
  /** Close enough in front for the doors to open. */
  near(x: number, z: number) {
    const [u, v] = this.local(x, z);
    return Math.abs(u) < 1.4 && v < FZ + 0.3 && v > OZ - 2.0;
  }
  /** In the doorway (doors must not close on you). */
  inDoorway(x: number, z: number) {
    const [u, v] = this.local(x, z);
    return Math.abs(u) < this.dw / 2 + 0.2 && v < FZ + 0.32 && v > OZ - 0.45;
  }
}

// ---- flights in the place's own space ------------------------------------------------------------------

class Flight {
  readonly rects: Rect[] = [];
  readonly group = new THREE.Group();
  constructor(
    readonly decl: StairDecl,
    readonly yA: number,
    readonly yB: number,
    st: Style,
  ) {
    const z = decl.zone!;
    const along = decl.up === "+x" || decl.up === "-x";
    // rails along both sides, stopping short of the ends (the landings are walked onto from the side)
    if (decl.rails !== false) {
      // 0.25 m short of the foot, 0.6 m short of the head
      const up = decl.up ?? "+z";
      const lo = up[0] === "+" ? 0.25 : 0.6,
        hi = up[0] === "+" ? 0.6 : 0.25;
      if (along) this.rects.push([z[0] + lo, z[1] - 0.06, z[2] - hi, z[1]], [z[0] + lo, z[3], z[2] - hi, z[3] + 0.06]);
      else this.rects.push([z[0] - 0.06, z[1] + lo, z[0], z[3] - hi], [z[2], z[1] + lo, z[2] + 0.06, z[3] - hi]);
    }
    if (decl.build) this.draw(st);
  }
  /** 0 at the foot, 1 at the head; and whether (x, z) is on the flight. */
  t(x: number, z: number) {
    const [x0, z0, x1, z1] = this.decl.zone!;
    const up = this.decl.up ?? "+z";
    const t = up === "+x" ? (x - x0) / (x1 - x0) : up === "-x" ? (x1 - x) / (x1 - x0) : up === "+z" ? (z - z0) / (z1 - z0) : (z1 - z) / (z1 - z0);
    return { t, on: x >= x0 && x <= x1 && z >= z0 && z <= z1 };
  }
  ground(x: number, z: number) {
    const { t, on } = this.t(x, z);
    return on ? this.yA + THREE.MathUtils.clamp(t, 0, 1) * (this.yB - this.yA) : undefined;
  }
  drift(x: number, z: number): [number, number] | null {
    if (this.decl.kind !== "escalator" || !this.t(x, z).on) return null;
    const v = 0.55 * (this.decl.move ?? 1);
    const up = this.decl.up ?? "+z";
    return up === "+x" ? [v, 0] : up === "-x" ? [-v, 0] : up === "+z" ? [0, v] : [0, -v];
  }
  /** Steps, stringers and handrails, for places that have no flight of their own. */
  private draw(st: Style) {
    const [x0, z0, x1, z1] = this.decl.zone!;
    const up = this.decl.up ?? "+z";
    const along = up === "+x" || up === "-x";
    const len = along ? x1 - x0 : z1 - z0;
    const wid = along ? z1 - z0 : x1 - x0;
    const dy = this.yB - this.yA;
    const n = Math.max(2, Math.round(Math.abs(dy) / 0.18));
    const stepM = lit(st.floor, 0.1, 0.8),
      sideM = lit(st.shell, 0.3, 0.6),
      railM = lit(st.trim, st.metal, 0.35);
    // local frame: climbing along +a, across b; mapped to world
    const put = (mesh: THREE.Mesh, a: number, y: number, b: number, rotY = 0) => {
      const sgn = up === "+x" || up === "+z" ? 1 : -1;
      const aw = sgn > 0 ? (along ? x0 : z0) + a : (along ? x1 : z1) - a;
      const bw = (along ? z0 : x0) + b;
      if (along) mesh.position.set(aw, y, bw);
      else mesh.position.set(bw, y, aw);
      mesh.rotation.y = rotY;
      this.group.add(mesh);
    };
    const run = len / n;
    for (let i = 0; i < n; i++) {
      const top = this.yA + ((i + 1) * dy) / n;
      const h = Math.max(0.12, top - this.yA);
      const g = along ? new THREE.BoxGeometry(run + 0.01, h, wid - 0.1) : new THREE.BoxGeometry(wid - 0.1, h, run + 0.01);
      put(new THREE.Mesh(g, stepM), run * (i + 0.5), top - h / 2, wid / 2);
    }
    const slope = Math.atan2(dy, len);
    for (const b of [0.03, wid - 0.03]) {
      const sg = along ? new THREE.BoxGeometry(Math.hypot(len, dy), 0.32, 0.06) : new THREE.BoxGeometry(0.06, 0.32, Math.hypot(len, dy));
      const m = new THREE.Mesh(sg, sideM);
      const rail = new THREE.Mesh(along ? new THREE.BoxGeometry(Math.hypot(len, dy), 0.05, 0.05) : new THREE.BoxGeometry(0.05, 0.05, Math.hypot(len, dy)), railM);
      const sgn = up === "+x" || up === "+z" ? 1 : -1;
      // tilt along the climb
      if (along) {
        m.rotation.z = sgn * slope;
        rail.rotation.z = sgn * slope;
      } else {
        m.rotation.x = -sgn * slope;
        rail.rotation.x = -sgn * slope;
      }
      put(m, len / 2, this.yA + dy / 2, b, 0);
      put(rail, len / 2, this.yA + dy / 2 + 0.95, b, 0);
      for (const a of [0.05, len - 0.05]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), railM);
        put(post, a, this.yA + (a / len) * dy + 0.5, b);
      }
    }
  }
}

/** Rects minus the parts inside any of `holes` (each rect split into up to four pieces). */
function subtract(rects: Rect[], holes: Rect[]): Rect[] {
  let out = rects;
  for (const h of holes) {
    const next: Rect[] = [];
    for (const r of out) {
      if (r[2] <= h[0] || r[0] >= h[2] || r[3] <= h[1] || r[1] >= h[3]) {
        next.push(r);
        continue;
      }
      if (r[0] < h[0]) next.push([r[0], r[1], h[0], r[3]]);
      if (r[2] > h[2]) next.push([h[2], r[1], r[2], r[3]]);
      const xa = Math.max(r[0], h[0]),
        xb = Math.min(r[2], h[2]);
      if (r[1] < h[1]) next.push([xa, r[1], xb, h[1]]);
      if (r[3] > h[3]) next.push([xa, h[3], xb, r[3]]);
    }
    out = next;
  }
  return out;
}

// ---- finding a free spot on a floor ------------------------------------------------------------------

interface Grid {
  x0: number;
  z0: number;
  w: number;
  h: number;
  /** Prefix sums of blocked cells (footprints must avoid colliders and uneven ground). */
  sum: Int32Array;
  /** Walker-reachable cells from the spawn. */
  reach: Uint8Array;
  wall: Uint8Array;
  reachCount: number;
  walkBlocked: Uint8Array;
}
const CELL = 0.25;
const RAD = 0.3;

function makeGrid(rects: Rect[], spawn: THREE.Vector3, y: number, ground: ((x: number, z: number) => number | null) | null): Grid {
  const xs = rects.flatMap((r) => [r[0], r[2]]).concat([spawn.x - 20, spawn.x + 20]);
  const zs = rects.flatMap((r) => [r[1], r[3]]).concat([spawn.z - 20, spawn.z + 20]);
  const x0 = Math.max(Math.min(...xs), spawn.x - 70) - 1,
    z0 = Math.max(Math.min(...zs), spawn.z - 70) - 1;
  const w = Math.ceil((Math.min(Math.max(...xs), spawn.x + 70) + 1 - x0) / CELL),
    h = Math.ceil((Math.min(Math.max(...zs), spawn.z + 70) + 1 - z0) / CELL);
  const blocked = new Uint8Array(w * h);
  const walkBlocked = new Uint8Array(w * h);
  const fill = (arr: Uint8Array, pad: number) => {
    for (const [ax, az, bx, bz] of rects) {
      const i0 = Math.max(0, Math.floor((ax - pad - x0) / CELL)),
        i1 = Math.min(w - 1, Math.floor((bx + pad - x0) / CELL)),
        j0 = Math.max(0, Math.floor((az - pad - z0) / CELL)),
        j1 = Math.min(h - 1, Math.floor((bz + pad - z0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) arr[j * w + i] = 1;
    }
  };
  fill(blocked, 0.02);
  fill(walkBlocked, RAD - 0.05);
  // uneven ground (steps, pools, ramps) is no place for a lift
  if (ground)
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        if (blocked[k]) continue;
        const gy = ground(x0 + (i + 0.5) * CELL, z0 + (j + 0.5) * CELL);
        if (gy !== null && gy !== undefined && (!Number.isFinite(gy) || Math.abs(gy - y) > 0.04)) blocked[k] = 1;
      }
  const sum = new Int32Array((w + 1) * (h + 1));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) sum[(j + 1) * (w + 1) + i + 1] = blocked[j * w + i] + sum[j * (w + 1) + i + 1] + sum[(j + 1) * (w + 1) + i] - sum[j * (w + 1) + i];
  const reach = new Uint8Array(w * h);
  const reachCount = bfs(walkBlocked, w, h, spawn, x0, z0, reach);
  return { x0, z0, w, h, sum, reach, wall: blocked, reachCount, walkBlocked };
}

function bfs(blocked: Uint8Array, w: number, h: number, spawn: { x: number; z: number }, x0: number, z0: number, out: Uint8Array) {
  out.fill(0);
  let si = Math.floor((spawn.x - x0) / CELL),
    sj = Math.floor((spawn.z - z0) / CELL);
  if (si < 0 || sj < 0 || si >= w || sj >= h) return 0;
  // the spawn cell, or the nearest free one
  if (blocked[sj * w + si]) {
    let found = false;
    for (let r = 1; r < 8 && !found; r++)
      for (let dj = -r; dj <= r && !found; dj++)
        for (let di = -r; di <= r && !found; di++) {
          const a = si + di,
            c = sj + dj;
          if (a >= 0 && c >= 0 && a < w && c < h && !blocked[c * w + a]) {
            si = a;
            sj = c;
            found = true;
          }
        }
    if (!found) return 0;
  }
  const q = new Int32Array(w * h);
  let qn = 0;
  q[qn++] = sj * w + si;
  out[sj * w + si] = 1;
  for (let k = 0; k < qn; k++) {
    const c = q[k],
      i = c % w,
      j = (c - i) / w;
    if (i > 0 && !blocked[c - 1] && !out[c - 1]) (out[c - 1] = 1), (q[qn++] = c - 1);
    if (i < w - 1 && !blocked[c + 1] && !out[c + 1]) (out[c + 1] = 1), (q[qn++] = c + 1);
    if (j > 0 && !blocked[c - w] && !out[c - w]) (out[c - w] = 1), (q[qn++] = c - w);
    if (j < h - 1 && !blocked[c + w] && !out[c + w]) (out[c + w] = 1), (q[qn++] = c + w);
  }
  return qn;
}

/** Blocked cells in a world rectangle (any outside the grid count as blocked). */
function blockedIn(g: Grid, r: Rect) {
  const i0 = Math.floor((r[0] - g.x0) / CELL),
    i1 = Math.floor((r[2] - g.x0) / CELL),
    j0 = Math.floor((r[1] - g.z0) / CELL),
    j1 = Math.floor((r[3] - g.z0) / CELL);
  if (i0 < 0 || j0 < 0 || i1 >= g.w || j1 >= g.h) return 1e9;
  const W = g.w + 1;
  return g.sum[(j1 + 1) * W + i1 + 1] - g.sum[j0 * W + i1 + 1] - g.sum[(j1 + 1) * W + i0] + g.sum[j0 * W + i0];
}
function reachIn(g: Grid, r: Rect) {
  let n = 0,
    t = 0;
  for (let j = Math.floor((r[1] - g.z0) / CELL); j <= Math.floor((r[3] - g.z0) / CELL); j++)
    for (let i = Math.floor((r[0] - g.x0) / CELL); i <= Math.floor((r[2] - g.x0) / CELL); i++) {
      t++;
      if (i >= 0 && j >= 0 && i < g.w && j < g.h && g.reach[j * g.w + i]) n++;
    }
  return t ? n / t : 0;
}

/**
 * The best free spot for a footprint (local u0, v0, u1, v1) with a free, reachable approach zone in
 * front: near `target`, backed against a wall if possible, not cutting off the rest of the floor.
 */
function findSpot(g: Grid, rects: Rect[], spawn: THREE.Vector3, foot: [number, number, number, number], approach: [number, number, number, number], o: { target: { x: number; z: number }; minFrom?: { x: number; z: number; d: number }[]; maxDist?: number; spawnInside?: boolean }): Spot | null {
  const cands: { s: Spot; score: number }[] = [];
  const st = (findSpot.stats = { pos: 0, foot: 0, ap: 0, reach: 0, near: 0, cut: 1e9, rc: g.reachCount, w: g.w, h: g.h });
  const maxD = o.maxDist ?? 40;
  const back: [number, number, number, number] = [foot[0] + 0.3, foot[3] + 0.05, foot[2] - 0.3, foot[3] + 0.45];
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const x = g.x0 + (i + 0.5) * CELL,
        z = g.z0 + (j + 0.5) * CELL;
      const dist = Math.hypot(x - o.target.x, z - o.target.z);
      if (dist > maxD) continue;
      // fine steps close to the target, coarser further out
      if (dist > 4 && (i % 2 || j % 2)) continue;
      for (let q = 0; q < 4; q++) {
        const s: Spot = { x, z, yaw: (q * Math.PI) / 2 };
        st.pos++;
        if (blockedIn(g, rectOf(s, ...foot))) continue;
        st.foot++;
        const ap = rectOf(s, ...approach);
        if (blockedIn(g, ap)) continue;
        st.ap++;
        if (reachIn(g, ap) < 0.6) continue;
        st.reach++;
        const [ax, az] = toWorld(s, (approach[0] + approach[2]) / 2, (approach[1] + approach[3]) / 2);
        if (o.minFrom?.some((m) => Math.hypot(ax - m.x, az - m.z) < m.d || Math.hypot(x - m.x, z - m.z) < m.d)) continue;
        // the spawn itself stays clear (unless you arrive in the car)
        if (!o.spawnInside) {
          const fr = rectOf(s, foot[0] - 0.6, foot[1] - 0.6, foot[2] + 0.6, foot[3] + 0.6);
          if (spawn.x > fr[0] && spawn.x < fr[2] && spawn.z > fr[1] && spawn.z < fr[3]) continue;
        }
        st.near++;
        let score = dist;
        // backed against something: much better (a lift standing in the middle of a room is odd)
        const br = rectOf(s, ...back);
        const bb = blockedIn(g, br);
        if (bb === 1e9 || bb > 2) score -= 3;
        // a side against a wall too
        const lr = rectOf(s, foot[0] - 0.45, foot[1] + 0.3, foot[0] - 0.05, foot[3] - 0.3),
          rr = rectOf(s, foot[2] + 0.05, foot[1] + 0.3, foot[2] + 0.45, foot[3] - 0.3);
        if (blockedIn(g, lr) > 2) score -= 0.8;
        if (blockedIn(g, rr) > 2) score -= 0.8;
        cands.push({ s, score });
      }
    }
  cands.sort((a, b) => a.score - b.score);
  // the first that doesn't cut the floor in two (the walker's reachable area barely shrinks)
  const tmp = new Uint8Array(g.w * g.h);
  for (const c of cands.slice(0, 40)) {
    const wb = g.walkBlocked.slice();
    const fr = rectOf(c.s, ...foot);
    for (let j = Math.max(0, Math.floor((fr[1] - RAD - g.z0) / CELL)); j <= Math.min(g.h - 1, Math.floor((fr[3] + RAD - g.z0) / CELL)); j++)
      for (let i = Math.max(0, Math.floor((fr[0] - RAD - g.x0) / CELL)); i <= Math.min(g.w - 1, Math.floor((fr[2] + RAD - g.x0) / CELL)); i++) wb[j * g.w + i] = 1;
    const [ax, az] = toWorld(c.s, (approach[0] + approach[2]) / 2, (approach[1] + approach[3]) / 2);
    const n = bfs(wb, g.w, g.h, { x: ax, z: az }, g.x0, g.z0, tmp);
    // what it may take: its own footprint and the slivers left between it and the walls around it
    const footCells = ((fr[2] - fr[0] + 2 * RAD + 1.6) * (fr[3] - fr[1] + 2 * RAD + 1.6)) / (CELL * CELL) / 1.3;
    st.cut = Math.min(st.cut, g.reachCount - n - footCells * 1.3);
    if (g.reachCount - n <= footCells * 1.3 + 100) {
      void rects;
      return c.s;
    }
  }
  return null;
}

findSpot.stats = {} as Record<string, number>;

/** Block a placed footprint in a grid (the next spot on that floor goes elsewhere). */
function claim(g: Grid, r: Rect) {
  const W = g.w + 1;
  const i0 = Math.max(0, Math.floor((r[0] - g.x0) / CELL) - 1),
    i1 = Math.min(g.w - 1, Math.floor((r[2] - g.x0) / CELL) + 1),
    j0 = Math.max(0, Math.floor((r[1] - g.z0) / CELL) - 1),
    j1 = Math.min(g.h - 1, Math.floor((r[3] - g.z0) / CELL) + 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g.wall[j * g.w + i] = 1;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g.walkBlocked[j * g.w + i] = 1;
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) g.sum[(j + 1) * W + i + 1] = g.wall[j * g.w + i] + g.sum[j * W + i + 1] + g.sum[(j + 1) * W + i] - g.sum[j * W + i];
}

// ---- the system ------------------------------------------------------------------------------------------

export interface CircHost {
  readonly walk: WalkControls;
  /** The floor the walker is on now. */
  floor(): number;
  /** Change floor without moving the walker (in a closed car, on a flight). */
  switchFloor(n: number): void;
  /** Lift ding. */
  ding?(): void;
}

interface Ride {
  car: Car;
  to: number;
  phase: "closing" | "moving" | "opening";
  t: number;
  dur: number;
  switched: boolean;
  path: number[];
}

/**
 * Every car and flight of one place. Built on the first visit; its parts are added to the place's scene
 * and only those of the floor you are on are shown.
 */
export class Circulation {
  readonly cars: Car[] = [];
  readonly flights: Flight[] = [];
  /** Floors that share one walkable space (Big Ben's stair, the statue's helix): no lift needed. */
  readonly together: number[][];
  ride: Ride | null = null;
  private shownFloors: number[] = [];
  private panel: HTMLElement | null = null;
  private panelKey = "";
  private layerOnly = false;
  readonly problems: string[] = [];
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(
    readonly place: Interior,
    plan: Plan,
    private host: CircHost,
  ) {
    const i = place;
    const F = i.floors;
    // floors with the very same colliders are one space
    const groups: number[][] = [];
    F.forEach((_, n) => {
      const r = i.colliders(n);
      const g = groups.find((gr) => i.colliders(gr[0]) === r && r.length > 0);
      if (g) g.push(n);
      else groups.push([n]);
    });
    // and the ones the plan says are (walked between on the place's own stairs)
    for (const t of plan.together ?? []) {
      const merged = groups.filter((g) => g.some((k) => t.includes(k)));
      const rest = groups.filter((g) => !merged.includes(g));
      groups.length = 0;
      groups.push(...rest, [...new Set([...merged.flat(), ...t])].sort((a, b) => a - b));
    }
    this.together = groups;
    const style = STYLES[plan.style ?? "steel"];
    const grids = new Map<number, Grid>();
    const gridOf = (n: number) => {
      let g = grids.get(n);
      if (!g) {
        const f = F[n];
        g = makeGrid(i.colliders(n), f.spawn, f.y, i.groundAt ? (x, z) => i.groundAt!(n, x, z) : null);
        grids.set(n, g);
      }
      return g;
    };
    // ---- lifts
    const liftsOf = i.lifts ? (n: number) => i.lifts!(n) : (plan.lifts ?? ((): LiftDecl[] => (groups.length > 1 ? [{ shaft: "main" }] : [])));
    const decls = F.map((_, n) => liftsOf(n) ?? []);
    const shafts = new Map<string, number[]>();
    decls.forEach((ds, n) => ds.forEach((d) => shafts.set(d.shaft ?? "main", [...(shafts.get(d.shaft ?? "main") ?? []), n])));
    decls.forEach((ds, n) => {
      const f = F[n];
      for (const d of ds) {
        const shaft = d.shaft ?? "main";
        const served = shafts.get(shaft)!;
        if (served.length < 2) continue;
        let at = d.at ?? null;
        if (!at) {
          const g = gridOf(n);
          const door = n === 0 ? [{ x: f.spawn.x, z: f.spawn.z + 1, d: d.minDist ?? 5 }] : [];
          // upper floors: where you stepped out of the old lift (just behind the spawn point); the
          // ground floor: a few metres in from the entrance
          const k = n === 0 ? -7 : 0.8;
          const target = d.near ?? { x: f.spawn.x + Math.sin(f.yaw) * k, z: f.spawn.z + Math.cos(f.yaw) * k };
          const foot = carFoot(d.narrow);
          at = findSpot(g, i.colliders(n), f.spawn, foot, CAR_APPROACH, { target, minFrom: door, spawnInside: n !== 0 });
          if (at) claim(g, rectOf(at, foot[0] - 0.4, CAR_APPROACH[1], foot[2] + 0.4, foot[3]));
        }
        if (!at) {
          this.problems.push(`no room for the ${shaft} lift on floor ${n} ${JSON.stringify(findSpot.stats)}`);
          continue;
        }
        at = { ...at, yaw: quarter(at.yaw) };
        const st = d.style ? STYLES[d.style] : style;
        const order = served.slice().sort((a, b) => F[a].y - F[b].y);
        const car = new Car(n, shaft, at, this.floorY(n, at), st, d.name ?? "LIFT", order.map((k) => F[k].label), f.label, !!d.windows, d);
        car.setOpen(0);
        i.scene.add(car.group);
        this.cars.push(car);
      }
    });
    // ---- flights in the place's own space
    for (const s of i.stairs ?? plan.stairs ?? []) {
      const st = s.style ? STYLES[s.style] : style;
      const fl = new Flight(s, F[s.from].y, F[s.to].y, st);
      if (fl.group.children.length) i.scene.add(fl.group);
      this.flights.push(fl);
    }
    this.keyHandler = (e) => {
      if (!this.panel || this.panel.hidden || /input|textarea|select/i.test((e.target as HTMLElement).tagName)) return;
      if (/^[0-9]$/.test(e.key)) {
        const car = this.carIn();
        if (!car) return;
        const list = this.servedBy(car);
        const n = list[Number(e.key)];
        if (n !== undefined) this.call(n);
      }
    };
    window.addEventListener("keydown", this.keyHandler);
  }

  private floorY(n: number, s: Spot) {
    const g = this.place.groundAt?.(n, s.x, s.z);
    return g ?? this.place.floors[n].y;
  }

  /** Floors drawn together with `n` (one shared space). */
  private groupOf(n: number) {
    return this.together.find((g) => g.includes(n)) ?? [n];
  }

  /** Floors a car's shaft serves, lowest first. */
  servedBy(car: Car) {
    const F = this.place.floors;
    return [...new Set(this.cars.filter((c) => c.shaft === car.shaft).map((c) => c.floor))].sort((a, b) => F[a].y - F[b].y || a - b);
  }

  /** The car on floor `n` of a shaft. */
  carOf(shaft: string, n: number) {
    return this.cars.find((c) => c.shaft === shaft && c.floor === n) ?? null;
  }

  /** Colliders of every car and flight on floor `n` (its whole shared space). */
  rects(n: number): Rect[] {
    const fl = this.groupOf(n);
    return [
      ...this.cars.filter((c) => fl.includes(c.floor)).flatMap((c) => c.rects),
      ...this.flights.filter((f) => fl.includes(f.decl.from) || fl.includes(f.decl.to)).flatMap((f) => f.rects),
      ...this.flights.flatMap((f) => (f.decl.walls ?? []).filter(([k]) => fl.includes(k)).map(([, r]) => r)),
    ];
  }

  /** Where the place's own colliders give way on floor `n`: its flights (a little past both ends). */
  holes(n: number): Rect[] {
    const out: Rect[] = [];
    for (const c of this.cars) if (c.floor === n && c.decl.clear) out.push(...c.decl.clear);
    for (const f of this.flights) {
      const d = f.decl;
      if (d.from !== n && d.to !== n) continue;
      const [x0, z0, x1, z1] = d.zone!;
      const along = d.up === "+x" || d.up === "-x";
      const e = 0.35;
      out.push(along ? [x0 - e, z0 + 0.01, x1 + e, z1 - 0.01] : [x0 + 0.01, z0 - e, x1 - 0.01, z1 + e]);
      out.push(...(d.clear ?? []));
    }
    for (const f of this.flights) for (const [k, r] of f.decl.clearOn ?? []) if (k === n) out.push(r);
    return out;
  }

  /** A floor's own colliders with its flights cut out. */
  placeRects(n: number): Rect[] {
    const h = this.holes(n);
    const r = this.place.colliders(n);
    return h.length ? subtract(r, h) : r;
  }

  /** The ground in a car or on a flight on floor `n`, or undefined if (x, z) is on none. */
  groundAt(n: number, x: number, z: number): number | undefined {
    const fl = this.groupOf(n);
    for (const c of this.cars) if (fl.includes(c.floor) && c.covers(x, z)) return c.y;
    return this.flightAt(fl, x, z)?.g;
  }

  /**
   * The flight under (x, z) the walker is on: flights can cross in plan (the mall's lanes pass over
   * the landing of the one below), so it is the one whose ground is a step from the walker's feet.
   */
  private flightAt(fl: number[], x: number, z: number): { f: Flight; g: number } | null {
    const feet = this.host.walk.floor;
    let best: { f: Flight; g: number } | null = null;
    for (const f of this.flights) {
      if (!fl.includes(f.decl.from) && !fl.includes(f.decl.to)) continue;
      const g = f.ground(x, z);
      if (g === undefined || Math.abs(g - feet) > 0.45) continue;
      if (!best || Math.abs(g - feet) < Math.abs(best.g - feet)) best = { f, g };
    }
    return best;
  }

  /** Show the cars and flights of floor `n` only. */
  show(n: number) {
    const fl = this.groupOf(n);
    this.shownFloors = fl;
    for (const c of this.cars) c.group.visible = fl.includes(c.floor);
    for (const f of this.flights) f.group.visible = fl.includes(f.decl.from) || fl.includes(f.decl.to);
  }

  /** The car the walker stands in, on the floor they are on. */
  carIn(): Car | null {
    const p = this.host.walk.camera.position;
    if (this.ride) return this.ride.car;
    return this.cars.find((c) => this.shownFloors.includes(c.floor) && c.inside(p.x, p.z)) ?? null;
  }

  /** A prompt for the walker standing at a lift's doors (null: none). */
  hint(): string | null {
    const p = this.host.walk.camera.position;
    for (const c of this.cars)
      if (this.shownFloors.includes(c.floor) && c.near(p.x, p.z) && !c.inside(p.x, p.z)) {
        const n = this.servedBy(c).length;
        return `<b>${c.name} · ${n} floors</b><span>▲ walk in, then pick a floor</span>`;
      }
    return null;
  }

  /** Where you arrive on floor `n` by lift: in its first car, facing out, doors open (null: no car). */
  arrival(n: number): { pos: THREE.Vector3; yaw: number } | null {
    const c = this.cars.find((x) => x.floor === n);
    if (!c) return null;
    c.setOpen(1);
    const [x, z] = toWorld(c.spot, 0, 0.15);
    return { pos: new THREE.Vector3(x, c.y, z), yaw: c.spot.yaw };
  }

  /** Ride from the car you're in to floor `n`. */
  call(n: number) {
    const car = this.carIn();
    if (!car || this.ride || n === car.floor) return false;
    if (!this.carOf(car.shaft, n)) return false;
    const F = this.place.floors;
    const order = this.servedBy(car);
    const a = order.indexOf(car.floor),
      b = order.indexOf(n);
    const path = a < b ? order.slice(a, b + 1) : order.slice(b, a + 1).reverse();
    const dur = Math.min(5.5, 1.8 + 0.45 * (path.length - 1) + Math.abs(F[n].y - F[car.floor].y) * 0.01);
    this.ride = { car, to: n, phase: "closing", t: 0, dur, switched: false, path };
    return true;
  }

  /** One step up or down the shaft you're in. */
  step(dir: number) {
    const car = this.carIn();
    if (!car) return false;
    const order = this.servedBy(car);
    const n = order[order.indexOf(car.floor) + dir];
    return n !== undefined && this.call(n);
  }

  /** Doors, rides, stair switches; returns true while a ride holds the walker. */
  update(dt: number) {
    const W = this.host.walk;
    const p = W.camera.position;
    const F = this.place.floors;
    const now = this.host.floor();
    if (!this.shownFloors.includes(now)) this.show(now);
    // ---- cars
    const r = this.ride;
    for (const c of this.cars) {
      if (!this.shownFloors.includes(c.floor)) continue;
      let target = c.near(p.x, p.z) || c.inside(p.x, p.z) ? 1 : 0;
      if (r && r.car === c) target = r.phase === "opening" ? 1 : 0;
      if (c.open !== target) c.setOpen(target > c.open ? Math.min(1, c.open + dt / 0.75) : Math.max(0, c.open - dt / 0.75));
    }
    if (r) {
      r.t += dt;
      const c = r.car;
      if (r.phase === "closing") {
        // never close on someone in the doorway: step them in
        const [u, v] = c.local(p.x, p.z);
        if (v < FZ + 0.36) {
          const [x, z] = toWorld(c.spot, u, FZ + 0.4);
          W.shift(x - p.x, 0, z - p.z);
        }
        if (c.open <= 0) {
          r.phase = "moving";
          r.t = 0;
        }
      } else if (r.phase === "moving") {
        const k = r.t / r.dur;
        const i = Math.min(r.path.length - 1, Math.floor(k * r.path.length));
        const dir = F[r.to].y > F[r.path[0]].y ? 1 : -1;
        c.indicate(F[r.path[i]].label, dir);
        c.slide(dt);
        // turn to face out on the way
        W.turnToward(c.spot.yaw, dt * 1.2);
        if (!r.switched && k >= 0.5) {
          r.switched = true;
          const to = this.carOf(c.shaft, r.to)!;
          const [u, v] = c.local(p.x, p.z);
          const [x, z] = toWorld(to.spot, u, v);
          const dy = to.y - c.y;
          W.shift(x - p.x, dy, z - p.z, to.spot.yaw - c.spot.yaw);
          this.host.switchFloor(r.to);
          to.setOpen(0);
          to.indicate(F[r.path[i]].label, dir);
          r.car = to;
          this.show(r.to);
        }
        if (k >= 1) {
          r.phase = "opening";
          r.t = 0;
          r.car.indicate(F[r.to].label, 0);
          this.host.ding?.();
        }
      } else if (r.phase === "opening" && r.car.open >= 1) this.ride = null;
    }
    let drift: [number, number] | null = null;
    // flights: the floor follows the walker up and down (same place, no shift)
    const on = !this.ride ? this.flightAt(this.shownFloors, p.x, p.z) : null;
    if (on) {
      const d = on.f.decl;
      const { t } = on.f.t(p.x, p.z);
      drift = on.f.drift(p.x, p.z) ?? drift;
      if (now === d.from && t > 0.85) {
        this.host.switchFloor(d.to);
        this.show(d.to);
      } else if (now === d.to && t < 0.15) {
        this.host.switchFloor(d.from);
        this.show(d.from);
      }
    }
    W.drift = drift;
    // ---- only the closed cabin / stairwell is drawn while you're shut in it
    const carIn = this.carIn();
    const shut = carIn && carIn.open <= 0 && carIn.inside(p.x, p.z);
    if (!!shut !== this.layerOnly) {
      this.layerOnly = !!shut;
      if (shut) W.camera.layers.set(CIRC_LAYER);
      else W.camera.layers.set(0);
    }
    this.syncPanel(carIn);
    return !!this.ride;
  }

  /** Leaving the place or jumping floors (Escape, the hidden PgUp/PgDn): no ride, normal view. */
  reset() {
    this.ride = null;
    this.layerOnly = false;
    this.host.walk.camera.layers.set(0);
    this.host.walk.drift = null;
    if (this.panel) this.panel.hidden = true;
  }

  dispose() {
    window.removeEventListener("keydown", this.keyHandler);
    this.panel?.remove();
  }

  // ---- the panel of floor buttons (only while you're in a car) -----------------------------------------

  private syncPanel(car: Car | null) {
    const F = this.place.floors;
    if (!car) {
      if (this.panel && !this.panel.hidden) this.panel.hidden = true;
      this.panelKey = "";
      return;
    }
    if (!this.panel) {
      const el = document.createElement("nav");
      el.className = "carpanel hud";
      el.setAttribute("aria-label", "Lift");
      el.addEventListener("click", (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-go]");
        if (b) this.call(Number(b.dataset.go));
      });
      (document.getElementById("ui") ?? document.body).appendChild(el);
      this.panel = el;
    }
    const list = this.servedBy(car);
    const at = this.ride ? -1 : car.floor;
    const key = `${car.shaft}|${car.floor}|${this.ride?.to ?? ""}|${list.join(",")}`;
    this.panel.hidden = false;
    if (key === this.panelKey) return;
    this.panelKey = key;
    const name = this.place.title;
    this.panel.innerHTML = `<div class="cph"><b>${car.name}</b><span>${esc(name)}</span></div>${list
      .map((n, k) => ({ n, k }))
      .reverse()
      .map(({ n, k }) => {
        const [main, sub] = F[n].name.split(" · ");
        const cls = n === at ? "here" : this.ride?.to === n ? "go" : "";
        return `<button data-go="${n}" class="${cls}" ${this.ride || n === at ? "disabled" : ""}><i>${esc(F[n].label)}</i><span><strong>${esc(main)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${k < 10 ? `<kbd>${k}</kbd>` : ""}</button>`;
      })
      .join("")}<div class="cpf">${this.ride ? "▲▼ riding…" : "press a floor · keys 0–9"}</div>`;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type { Floor };
