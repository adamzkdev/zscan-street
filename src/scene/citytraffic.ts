import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CITY, CURB, GRID, RIVER, ST, streetSegments } from "./city/plan";
import type { Traffic } from "./traffic";
import { freeObject } from "./voxel/mesher";
import { bikeObject, carObject, POLICE_BAR, spinWheels, steerWheels } from "./real/cars";
import { SnarkFigure } from "../gta/figure";
import { MOTO_SEAT } from "../gta/models";
import { busSign, canvasTexture } from "./textures";
import { reach, type TrafficBlocker } from "./goldengate";

/**
 * Traffic across the whole city: traffic lights at the grid's junctions (the avenue's included),
 * cars on the north–south and east–west streets that stop at red and keep their distance, and a
 * police car on patrol with its light bar going. Cars drive on the right, as on the avenue.
 */

/** One cycle: east–west green, all red, north–south green, all red (seconds). */
const CYCLE = { ew: 16, gap1: 2, ns: 10, gap2: 2 };
const PERIOD = CYCLE.ew + CYCLE.gap1 + CYCLE.ns + CYCLE.gap2;
const AVENUE_Z = (CITY.road.z0 + CITY.road.z1) / 2;

/**
 * Shibuya: the junction of the north boulevard and the street west of the park runs its own cycle
 * with a scramble phase: after both directions have had their green, every car waits and the
 * pedestrians cross every way at once, diagonals included (scene/shibuya.ts walks them).
 */
export const SCRAMBLE = { x: ST.heartW, z: ST.blvdN };
/** East–west green, all red, north–south green, all red, walk, walk flashing, all red (seconds). */
const SCYCLE = { ew: 14, gap1: 2, ns: 10, gap2: 2, walk: 17, flash: 5, gap3: 2 };
const SPERIOD = SCYCLE.ew + SCYCLE.gap1 + SCYCLE.ns + SCYCLE.gap2 + SCYCLE.walk + SCYCLE.flash + SCYCLE.gap3;
const SWALK0 = SCYCLE.ew + SCYCLE.gap1 + SCYCLE.ns + SCYCLE.gap2;
/** Cars keep clear of the scramble's zebras: they stop this far beyond the junction's edge. */
const SCRAMBLE_STOP = 4.4;
const isScramble = (x: number, z: number) => Math.abs(x - SCRAMBLE.x) < 0.1 && Math.abs(z - SCRAMBLE.z) < 0.1;
const xWidth = (x: number) => GRID.xw[GRID.xs.indexOf(x)] ?? GRID.street;
const zWidth = (z: number) => GRID.zw[GRID.zs.indexOf(z)] ?? GRID.street;
/** A street's width, and its lanes' middles off its centre line (one lane each way, right-hand traffic). */
const streetWidth = (line: { axis: "x" | "z"; at: number }) => (line.axis === "x" ? zWidth(line.at) : xWidth(line.at));
const laneOff = (line: { axis: "x" | "z"; at: number }) => Math.max(1.9, streetWidth(line) / 4 + 0.2);

type Axis = "x" | "z";
/**
 * A turn at the end of a street, onto the ring road (or round one of its corners): a curve from the
 * lane it comes in on, past the stop line, to the lane it leaves on — the quadratic through the
 * corner where the two lanes cross, so it leaves its street and joins the next already heading
 * along it, without a step.
 */
interface Bend {
  ring: Line;
  dir: 1 | -1;
  /** Where it starts on the street (s), and where it comes out on the ring (s there). */
  sIn: number;
  sOut: number;
  /** Start, corner, end (x, z). */
  p: [number, number][];
  /** Its length, its arc lengths at TABLE steps (for an even speed along it), the speed to take it at. */
  len: number;
  cum: number[];
  vTurn: number;
}
const TABLE = 16;

function bezier(b: Bend, t: number, out: { x: number; z: number; yaw: number }) {
  const [p0, p1, p2] = b.p;
  const u = 1 - t;
  out.x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
  out.z = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
  const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]),
    dz = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
  // (the car's front is +x: its heading's yaw)
  out.yaw = Math.atan2(-dz, dx);
  return out;
}
/** The curve's parameter u metres along it. */
function bendT(b: Bend, u: number) {
  const c = b.cum;
  if (u <= 0) return 0;
  if (u >= b.len) return 1;
  let i = 1;
  while (i < TABLE && c[i] < u) i++;
  return (i - 1 + (u - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1])) / TABLE;
}
const ON = { x: 0, z: 0, yaw: 0 },
  AHEAD = { x: 0, z: 0, yaw: 0 };

interface Line {
  axis: Axis;
  /** The street's centre on the other axis. */
  at: number;
  /** Where the cross streets are along it, with their half width. */
  junctions: { at: number; half: number }[];
  from: number;
  to: number;
}

const PAINTS: [string, string][] = [
  ["#c8ccd4", "#3ef0ff"],
  ["#2a2a34", "#ff3e8a"],
  ["#8a2a3a", "#ff9f2e"],
  ["#2a4a7a", "#3ef0ff"],
  ["#e8e4dc", "#b07bff"],
  ["#3a6a4a", "#38ff9c"],
];

type MoverKind = "sedan" | "taxi" | "police" | "truck" | "sports" | "suv" | "pickup" | "van" | "convertible" | "moto";
/** Bumper to bumper (m), by kind. */
const LEN: Record<MoverKind, number> = { sedan: 4.3, taxi: 4.6, police: 4.4, truck: 7, sports: 4.4, suv: 4.6, pickup: 5.1, van: 5.3, convertible: 4.3, moto: 2.6 };
/** The bikes' paints. */
const BIKE_PAINTS: [string, string][] = [
  ["#d62f2f", "#141418"],
  ["#141418", "#f4b728"],
  ["#2a62c8", "#f2f2ee"],
  ["#f2f2ee", "#d62f2f"],
  ["#2f6b3e", "#141418"],
  ["#ff8a3d", "#141418"],
];
/** Where a biker sits on the bike (the riding pose's hips 0.1 m over its feet). */
const BIKER = new THREE.Vector3(MOTO_SEAT.x - 0.08, MOTO_SEAT.y - 0.1, 0);
/** The street's paints (bright, sunny: the bay's side of things) and the neon under the sports cars. */
const VICE = ["#f2f2ee", "#16161c", "#d62f2f", "#ff7eb6", "#2ec4b6", "#4aa8ff", "#f4c430", "#8a5cff", "#ff8a3d", "#9aa0a8", "#1f3f7a", "#2f6b3e"];
const GLOW = ["#3ef0ff", "#ff3e8a", "#b07bff", "#f4b728"];
const LIVERIES = ["#e8e4dc", "#2e5ab8", "#c0302e", "#3a7a5a", "#f4b728", "#5a3a8a"];

class Mover {
  readonly group = new THREE.Group();
  s: number;
  v = 0;
  blocked = 0;
  held = false;
  readonly kind: MoverKind;
  vmax: number;
  /** Bumper to bumper, metres. */
  readonly len: number;
  /** The light bar's lamps (police only). */
  bar: THREE.Mesh[] = [];
  /** Who drives it (a zkSNARK's number), and on a bike its rider in 3D (src/gta/figure.ts). */
  readonly driver = 1 + Math.floor(Math.random() * 10000);
  rider: SnarkFigure | null = null;
  /** The turn ahead at the end of its street (planned on the way there), and how far into it it is. */
  bend: Bend | null = null;
  next: Bend | null = null;
  u = 0;
  /** The front wheels' angle (radians), eased; the curve's turn per metre where it is. */
  steer = 0;
  curve = 0;
  /** Across its lane (m: + to the kerb's side, − over the middle), where it is going, and its heading turned for it (eased). */
  lat = 0;
  latTo = 0;
  tilt = 0;
  /** Its lane's middle across the street (z of an east–west street, x of a north–south one). */
  laneMid = 0;
  /** Seconds stopped behind a car standing in its lane (yours, a wreck); its way round it, while it goes. */
  waitBody = 0;
  round: { x: number; z: number; stage: "back" | "out" | "by"; need: number; lat: number; ra: number; backed: number } | null = null;
  constructor(
    public line: Line,
    public dir: 1 | -1,
    kind: MoverKind,
  ) {
    this.kind = kind;
    this.len = LEN[kind];
    // (a realistic body per kind and paint, built once and shared by every car that wears it; its
    // wheels in the group too, they roll as it drives)
    let body: THREE.Group;
    if (kind === "moto") {
      // a motorbike and its rider, in the riding pose, leaning on with it
      const [paint, accent] = BIKE_PAINTS[Math.floor(Math.random() * BIKE_PAINTS.length)];
      body = bikeObject("moto", { paint, accent });
      const r = new SnarkFigure(this.driver);
      r.root.position.copy(BIKER);
      r.root.rotation.y = Math.PI / 2;
      r.act.ride = true;
      r.update(0, { speed: 0 });
      this.rider = r;
    } else if (kind === "truck") {
      const l = Math.floor(Math.random() * LIVERIES.length);
      body = carObject("truck", { livery: LIVERIES[l], label: Math.random() < 0.5 ? "proof" : "depot" });
    } else if (kind === "taxi") body = carObject("taxi", { paint: "#f2c230" });
    else if (kind === "police") body = carObject("police", { paint: "#141418", accent: "#f2f2ee" });
    else {
      const p = Math.floor(Math.random() * VICE.length),
        g = Math.floor(Math.random() * GLOW.length);
      const paint = kind === "sedan" ? PAINTS[Math.floor(Math.random() * PAINTS.length)][0] : VICE[p];
      body =
        kind === "sports"
          ? carObject("sports", { paint, glow: GLOW[g] })
          : kind === "pickup"
            ? carObject("pickup", { paint, load: (g & 1) === 1 })
            : kind === "van"
              ? carObject("van", { paint, accent: GLOW[g] })
              : kind === "convertible"
                ? carObject("convertible", { paint, seats: p % 2 ? "#e8dcc8" : "#5a2a22" })
                : carObject(kind, { paint });
    }
    for (const c of [...body.children]) this.group.add(c);
    if (this.rider) this.group.add(this.rider.root);
    // (its heading first, then its lean about its own length)
    this.group.rotation.order = "YXZ";
    if (kind === "police") {
      // the light bar: red on the left, blue on the right, flashing in turn
      for (const [z, c] of [
        [-0.32, "#ff2a2a"],
        [0.32, "#2a6aff"],
      ] as const) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3.2), toneMapped: false }));
        lamp.position.set(POLICE_BAR.x, POLICE_BAR.y, z);
        lamp.scale.set(0.45, 0.6, 1.1);
        this.group.add(lamp);
        this.bar.push(lamp);
      }
      // POLICE 警察 on both doors
      const tex = canvasTexture(busSign("POLICE 警察"));
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
        plate.position.set(-0.2, 0.62, side * (0.9 + 0.025));
        if (side < 0) plate.rotation.y = Math.PI;
        this.group.add(plate);
      }
    }
    this.vmax = kind === "police" ? 11 : kind === "truck" || kind === "van" ? 7 + Math.random() * 1.5 : kind === "sports" || kind === "moto" ? 10 + Math.random() * 3 : 8 + Math.random() * 3;
    this.s = dir > 0 ? line.from : line.to;
    this.setLine(line, dir, this.s);
  }
  /** Onto a street (a turn at the end of the last one): its lane, its heading. */
  setLine(line: Line, dir: 1 | -1, s: number) {
    this.line = line;
    this.dir = dir;
    this.s = s;
    // right-hand traffic: +x keeps to +z, +z keeps to −x (in the middle of its half of the street)
    const off = laneOff(line);
    this.lat = this.latTo = this.tilt = 0;
    this.round = null;
    this.waitBody = 0;
    if (line.axis === "x") {
      this.laneMid = line.at + (dir > 0 ? off : -off);
      this.group.rotation.y = dir > 0 ? 0 : Math.PI;
    } else {
      this.laneMid = line.at + (dir > 0 ? -off : off);
      this.group.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    this.place();
  }
  /** Its heading along its street. */
  get yaw0() {
    return this.line.axis === "x" ? (this.dir > 0 ? 0 : Math.PI) : this.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  }
  place() {
    // (out of its lane by lat: + to its right, the kerb's side)
    if (this.line.axis === "x") {
      this.group.position.x = this.s;
      this.group.position.z = this.laneMid + this.dir * this.lat;
    } else {
      this.group.position.z = this.s;
      this.group.position.x = this.laneMid - this.dir * this.lat;
    }
    this.group.position.y = 0;
  }
  get done() {
    return !this.bend && (this.dir > 0 ? this.s > this.line.to : this.s < this.line.from);
  }
}

export class CityTraffic {
  readonly group = new THREE.Group();
  private lines: Line[] = [];
  private cars = new Set<Mover>();
  private clock = 0;
  private spawnIn = 0;
  private police: Mover | null = null;
  /** People in the road (the player, jaywalkers), and cars' bodies standing in it (yours, wrecks: src/scene/goldengate.ts's blockers). */
  blockers: () => TrafficBlocker[] = () => [];

  get movers() {
    return this.cars;
  }
  private max: number;

  constructor(
    scene: THREE.Object3D,
    avenue: Traffic,
    max = 14,
    private nav?: import("./nav").Nav,
  ) {
    this.max = max;
    scene.add(this.group);
    const width = xWidth;
    // the streets that run unbroken: the rings, the boulevards, the streets round the heart
    // (Park Row and Coinbase Street were the trams' until the trams went)
    const ewLines = [ST.ringN, ST.blvdN, ST.parkN, ST.north, ST.south, ST.ringS];
    const nsLines = [ST.ringW, ST.blvdW, ST.heartW, ST.heartE, ST.blvdE, ST.ringE];
    const crossZ = [ST.ringN, ST.blvdN, ST.parkN, ST.north, AVENUE_Z, ST.south, ST.ringS];
    // every street ends on the ring road, where its cars turn onto the ring (and the ring's own
    // cars turn at its corners): the traffic goes round and round, nobody pops in or out
    const zEnd = ST.ringS,
      zTop = ST.ringN,
      xEnd = ST.ringE;
    // north–south streets: from ring to ring, over the river's bridges
    for (const x of nsLines) this.lines.push({ axis: "z", at: x, from: zTop, to: zEnd, junctions: crossZ.map((z) => ({ at: z, half: z === AVENUE_Z ? 4 : zWidth(z) / 2 })) });
    // east–west streets north of the heart (the avenue is the existing traffic, the tram has its own)
    for (const z of ewLines) this.lines.push({ axis: "x", at: z, from: -xEnd, to: xEnd, junctions: GRID.xs.map((x) => ({ at: x, half: width(x) / 2 })) });
    // the lights, and the avenue's own traffic stopping at them
    const junctions: [number, number][] = [];
    for (const x of nsLines) for (const z of crossZ) junctions.push([x, z]);
    for (const z of ewLines) for (const x of GRID.xs) if (!nsLines.includes(x) && streetSegments().some((st) => st.axis === "z" && st.at === x && z >= st.from - 1 && z <= st.to + 1)) junctions.push([x, z]);
    for (const [x, z] of junctions) this.light(x, z);
    this.buildLights();
    for (const x of nsLines) avenue.crossings.push({ x, half: 4.2, busy: () => !this.green("x") });
    this.spawnIn = 0.5;
    // a few at once to start with
    for (let i = 0; i < max * 2 && this.cars.size < max; i++) this.spawn(true);
  }

  /** The player takes this car (src/gta): it leaves the traffic, its group (body, light bar) handed over. */
  take(m: Mover): THREE.Group {
    // (a bike's rider is the game's to pull off: out of the group first)
    if (m.rider) {
      m.rider.dispose();
      m.rider = null;
    }
    this.cars.delete(m);
    this.group.remove(m.group);
    if (m === this.police) this.police = null;
    // (upright, wheels straight: the game's car steers it from here)
    m.group.rotation.x = 0;
    steerWheels(m.group, 0);
    for (const b of m.bar) b.visible = true;
    return m.group;
  }

  /** Is the given axis green right now? */
  green(axis: Axis) {
    const t = this.clock % PERIOD;
    return axis === "x" ? t < CYCLE.ew : t >= CYCLE.ew + CYCLE.gap1 && t < CYCLE.ew + CYCLE.gap1 + CYCLE.ns;
  }

  /** The same at the Shibuya junction, on its own cycle. */
  scrambleGreen(axis: Axis) {
    const t = this.clock % SPERIOD;
    return axis === "x" ? t < SCYCLE.ew : t >= SCYCLE.ew + SCYCLE.gap1 && t < SCYCLE.ew + SCYCLE.gap1 + SCYCLE.ns;
  }

  /**
   * The scramble's pedestrian phase: `walk` while the walkers may cross (flashing for the last
   * `flash` seconds), `t` seconds into it, `left` until the cars go again, `next` until it starts.
   */
  scramble() {
    const t = this.clock % SPERIOD;
    const into = t - SWALK0;
    const on = into >= 0 && into < SCYCLE.walk + SCYCLE.flash;
    return { walk: on, flash: on && into >= SCYCLE.walk, t: Math.max(0, into), left: on ? SCYCLE.walk + SCYCLE.flash - into : 0, clear: on ? SCYCLE.walk + SCYCLE.flash + SCYCLE.gap3 - into : 0, next: into < 0 ? -into : SPERIOD - into };
  }

  private greenAt(axis: Axis, x: number, z: number) {
    return isScramble(x, z) ? this.scrambleGreen(axis) : this.green(axis);
  }

  /** Traffic lights: two heads per junction (one per direction); poles merged, lenses instanced. */
  private poleGeos: THREE.BufferGeometry[] = [];
  private lensSpots: { pos: THREE.Vector3; axis: Axis; col: "red" | "green"; scr: boolean }[] = [];
  private lenses: THREE.InstancedMesh | null = null;

  private light(x: number, z: number) {
    // on the kerb at two opposite corners (the wide streets' corners are further out)
    const hx = xWidth(x) / 2 + 0.9;
    const hz = Math.abs(z - AVENUE_Z) < 0.1 ? GRID.street / 2 + 0.8 + 0.9 : zWidth(z) / 2 + 0.9;
    const scr = isScramble(x, z);
    for (const [cx, cz, axis] of [
      [x + hx, z + hz, "x"],
      [x - hx, z - hz, "z"],
    ] as const) {
      // (realistic: a round steel pole on its base, a signal head in its housing with a backplate)
      this.poleGeos.push(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 12).translate(cx, CURB + 1.6, cz));
      this.poleGeos.push(new THREE.CylinderGeometry(0.16, 0.18, 0.14, 12).translate(cx, CURB + 0.07, cz));
      this.nav?.addCircle(cx, cz, 0.2);
      this.poleGeos.push(new THREE.BoxGeometry(0.3, 0.92, 0.3).translate(cx, CURB + 3.3, cz));
      this.poleGeos.push(new THREE.BoxGeometry(0.46, 1.08, 0.46).scale(axis === "x" ? 0.06 : 1, 1, axis === "x" ? 1 : 0.06).translate(cx, CURB + 3.3, cz));
      this.lensSpots.push({ pos: new THREE.Vector3(cx, CURB + 3.5, cz), axis, col: "red", scr }, { pos: new THREE.Vector3(cx, CURB + 3.1, cz), axis, col: "green", scr });
    }
  }

  private buildLights() {
    const pole = new THREE.MeshStandardMaterial({ color: "#2b2e33", roughness: 0.45, metalness: 0.7 });
    const poles = new THREE.Mesh(mergeGeometries(this.poleGeos, false), pole);
    poles.castShadow = poles.receiveShadow = true;
    this.group.add(poles);
    // the lenses: round lamps showing on both faces of the head
    const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ toneMapped: false }), this.lensSpots.length);
    // (each faces the traffic it governs: along x or along z)
    this.lensSpots.forEach((l, i) => m.setMatrixAt(i, new THREE.Matrix4().makeRotationY(l.axis === "x" ? Math.PI / 2 : 0).setPosition(l.pos)));
    m.setColorAt(0, new THREE.Color());
    this.lenses = m;
    this.group.add(m);
  }

  /**
   * The turn at the end of a car's street, planned on the way there: onto the ring road, either way
   * (at one of the ring's corners, the only way on), as a curve from its lane to the ring's.
   */
  private planTurn(c: Mover): Bend | null {
    const L = c.line;
    const end = c.dir > 0 ? L.to : L.from;
    const ring = this.lines.find((l) => l.axis !== L.axis && Math.abs(l.at - end) < 0.1);
    if (!ring) return null;
    const atStart = Math.abs(L.at - ring.from) < 0.1,
      atEnd = Math.abs(L.at - ring.to) < 0.1;
    const dir: 1 | -1 = atStart ? 1 : atEnd ? -1 : Math.random() < 0.5 ? 1 : -1;
    // the lanes: the one it is in (across its street) and the ring's for the way it goes
    const lane = c.laneMid;
    const off = Math.max(1.9, (ring.axis === "x" ? zWidth(ring.at) : xWidth(ring.at)) / 4 + 0.2);
    const ringLane = ring.axis === "x" ? ring.at + (dir > 0 ? off : -off) : ring.at + (dir > 0 ? -off : off);
    // in, from just past the stop line (it waits at the red there like everyone, then turns), at
    // most 9 m before the corner; out as far along the ring as it came in
    const j = L.junctions.find((q) => Math.abs(q.at - end) < 0.1);
    const half = j?.half ?? (L.axis === "x" ? xWidth(end) : zWidth(end)) / 2;
    const stop = end - c.dir * (half + 1.8 - 0.4);
    const kIn = Math.max(2.5, Math.min(9, (ringLane - stop) * c.dir));
    const kOut = Math.max(kIn, 4);
    const sIn = ringLane - c.dir * kIn,
      sOut = lane + dir * kOut;
    const P = (along: number, across: number): [number, number] => (L.axis === "x" ? [along, across] : [across, along]);
    const b: Bend = { ring, dir, sIn, sOut, p: [P(sIn, lane), P(ringLane, lane), P(ringLane, sOut)], len: 0, cum: [0], vTurn: 0 };
    let px = b.p[0][0],
      pz = b.p[0][1];
    for (let i = 1; i <= TABLE; i++) {
      bezier(b, i / TABLE, ON);
      b.cum.push(b.cum[i - 1] + Math.hypot(ON.x - px, ON.z - pz));
      px = ON.x;
      pz = ON.z;
    }
    b.len = b.cum[TABLE];
    // (round a tight corner slower: about 0.35 g across)
    b.vTurn = Math.sqrt(3.4 * Math.min(kIn, kOut));
    return b;
  }

  /** Along the bend, u metres in: where it is, which way it faces, its front wheels turned to match. */
  private ride(c: Mover, dt: number) {
    const b = c.bend!;
    const t = bendT(b, c.u);
    bezier(b, t, ON);
    bezier(b, bendT(b, c.u + 0.6), AHEAD);
    c.group.position.x = ON.x;
    c.group.position.z = ON.z;
    c.group.rotation.y = ON.yaw;
    // (the wheels: the curve's bend over the car's wheelbase)
    const dy = Math.atan2(Math.sin(AHEAD.yaw - ON.yaw), Math.cos(AHEAD.yaw - ON.yaw)) / 0.6;
    c.curve = dy;
    this.wheel(c, Math.max(-0.55, Math.min(0.55, Math.atan(2.7 * dy))), dt);
    // the virtual place on its street: still ahead of whoever follows it in
    c.s = b.sIn + c.dir * c.u;
  }

  /**
   * A car standing in its lane ahead (yours, a wreck): it waits (and honks), then backs up if it
   * needs the room, pulls out round it — by the kerb's side if the street leaves room, else over the
   * middle when nothing is coming — and back in once past. You drive off: it eases back into its lane.
   */
  private goRound(c: Mover, people: (TrafficBlocker & { self?: Mover })[], body: TrafficBlocker | null, gap: number, lead: Mover | null, behind: Mover | null, dt: number) {
    const fx = c.line.axis === "x" ? c.dir : 0,
      fz = c.line.axis === "x" ? 0 : c.dir;
    const p = c.group.position;
    const left = c.dir > 0 ? c.line.to - c.s : c.s - c.line.from;
    const r = c.round;
    if (r) {
      // the one it goes round, still there (it may have rolled a little)
      let found: TrafficBlocker | null = null;
      // (moving off now or not: while it is beside it, it stays out till past)
      for (const q of people) if (q.hl !== undefined && q.self !== c && Math.hypot(q.x - r.x, q.z - r.z) < 2.5) found = q;
      const along = (r.x - p.x) * fx + (r.z - p.z) * fz;
      const by = along < r.ra + c.len / 2 + 0.5 && along > -(r.ra + c.len / 2 + 1.5);
      if (found) {
        r.x = found.x;
        r.z = found.z;
      }
      if (!found || found.wait || left < 14) {
        // gone (you drove off), or the street's end near: back into its lane — unless beside it still
        if (!found || !by) {
          c.round = null;
          c.latTo = 0;
        }
        return;
      }
      if (r.stage === "back") {
        r.backed += Math.max(0, -c.v) * dt;
        // (room enough now, or the one behind too close, or as far back as it goes)
        const room = behind ? Math.abs(c.s - behind.s) - (c.len + behind.len) / 2 : Infinity;
        if (gap >= r.need || room < 1.2 || r.backed > 4.5) r.stage = "out";
      }
      if (r.stage !== "back") c.latTo = r.lat;
      if (r.stage === "out" && Math.abs(c.lat - r.lat) < 0.05) r.stage = "by";
      // past it: back in
      if (along < -(r.ra + c.len / 2 + 1.5)) {
        c.round = null;
        c.latTo = 0;
      }
      return;
    }
    if (c.lat !== 0 && left < 14) c.latTo = 0;
    if (!body || gap > 4 || c.v > 0.6) {
      c.waitBody = 0;
      return;
    }
    c.waitBody += dt;
    // (behind one already going round it: after it, sooner)
    const patience = lead?.round && Math.abs(lead.s - c.s) < 20 ? 0.8 : 3.5;
    if (c.waitBody < patience) return;
    const [ra, rc] = reach(body, fx, fz);
    if (left < gap + 2 * ra + c.len + 18) return;
    // across its lane, from its middle (+ to the kerb's side)
    const mx = c.line.axis === "x" ? c.s : c.laneMid,
      mz = c.line.axis === "x" ? c.laneMid : c.s;
    const l = -(body.x - mx) * fz + (body.z - mz) * fx;
    const half = c.kind === "moto" ? 0.42 : 0.95;
    const w = streetWidth(c.line),
      off = laneOff(c.line);
    const kerb = w / 2 - off - half - 0.3,
      over = -(off + w / 2) + half + 0.3,
      own = -(off - half - 0.15);
    // (wide enough that its box, turned as it pulls out, keeps off yours: the game's crashes go by square boxes)
    const right = l + rc + half + 0.75,
      leftward = l - rc - half - 0.75;
    const ways: number[] = [];
    if (right <= kerb) ways.push(right);
    if (leftward >= own) ways.push(leftward);
    else if (leftward >= over && this.clearComing(c, gap + 2 * ra + c.len + 50)) ways.push(leftward);
    if (!ways.length) {
      // (no way round yet: it looks again in a second)
      c.waitBody = patience - 1;
      return;
    }
    const lat = ways.sort((a, b) => Math.abs(a) - Math.abs(b))[0];
    const need = Math.min(6, Math.abs(lat) / 0.62 + 0.8);
    c.round = { x: body.x, z: body.z, stage: gap < need ? "back" : "out", need, lat, ra, backed: 0 };
    c.waitBody = 0;
  }

  /** Nothing coming the other way along its street within `dist` ahead (or just past it). */
  private clearComing(c: Mover, dist: number) {
    for (const o of this.cars) {
      if (o === c || (o.bend ? o.bend.dir : o.dir) === c.dir) continue;
      let s: number | null = null;
      if (!o.bend && o.line === c.line) s = o.s;
      else if (o.bend && o.bend.ring === c.line) s = o.bend.sOut;
      if (s === null) continue;
      const rel = (s - c.s) * c.dir;
      if (rel > -8 && rel < dist) return false;
    }
    return true;
  }

  private wheel(c: Mover, to: number, dt: number) {
    if (c.kind === "moto") return;
    const was = c.steer;
    c.steer += (to - c.steer) * Math.min(1, dt * 8);
    if (Math.abs(c.steer - was) > 1e-4 || to !== 0) steerWheels(c.group, c.steer);
  }

  private spawn(anywhere = false) {
    if (this.cars.size >= this.max) return;
    const line = this.lines[Math.floor(Math.random() * this.lines.length)];
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    // (the mix: sedans and SUVs most, taxis, a sports car or a convertible now and then, vans, pickups, trucks)
    const r = Math.random();
    // (and bikers: a motorbike in ten)
    const kind: MoverKind = !this.police ? "police" : r < 0.1 ? "moto" : r < 0.22 ? "taxi" : r < 0.28 ? "truck" : r < 0.37 ? "sports" : r < 0.42 ? "convertible" : r < 0.55 ? "suv" : r < 0.62 ? "pickup" : r < 0.68 ? "van" : "sedan";
    const car = new Mover(line, dir, kind);
    // in the middle of a street, where there's room (not at the ends, in plain view)
    car.s = line.from + (anywhere ? 0.05 + Math.random() * 0.9 : 0.15 + Math.random() * 0.7) * (line.to - line.from);
    // room to pull in?
    for (const o of this.cars) if (o.line === line && o.dir === dir && Math.abs(o.s - car.s) < 8) return;
    if (line.axis === "z" && car.s > RIVER.z0 - 1 && car.s < RIVER.z1 + 1 && anywhere) car.s = RIVER.z1 + 4;
    car.place();
    car.v = anywhere ? car.vmax * 0.6 : car.vmax * 0.8;
    if (kind === "police") this.police = car;
    this.cars.add(car);
    this.group.add(car.group);
  }

  update(dt: number) {
    this.clock += dt;
    const ewGreen = this.green("x"),
      nsGreen = this.green("z");
    const sEw = this.scrambleGreen("x"),
      sNs = this.scrambleGreen("z");
    if (this.lenses) {
      const c = new THREE.Color();
      this.lensSpots.forEach((l, i) => {
        const g = l.scr ? (l.axis === "x" ? sEw : sNs) : l.axis === "x" ? ewGreen : nsGreen;
        const lit = l.col === (g ? "green" : "red");
        c.set(l.col === "red" ? "#ff2a1a" : "#2aff7a").multiplyScalar(lit ? 2.6 : 0.12);
        this.lenses!.setColorAt(i, c);
      });
      this.lenses.instanceColor!.needsUpdate = true;
    }
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnIn = 1.5 + Math.random() * 2.5;
      this.spawn();
    }
    // per lane: front first, keep the gap, stop at red lights (a car turning onto the ring is in its
    // street's lane until it is out of the corner, and already the one in front for the ring's)
    // (the lane's way kept in the entry: a car that comes out of its corner while an earlier lane is
    // worked through has no bend any more when its ring's list is reached — that read a null)
    type Entry = { c: Mover; s: number; own: boolean; dir: number };
    const lanes = new Map<string, Entry[]>();
    const add = (k: string, e: Entry) => {
      const l = lanes.get(k);
      if (l) l.push(e);
      else lanes.set(k, [e]);
    };
    const key = (line: Line, dir: number) => `${line.axis}${line.at}${dir}`;
    for (const c of this.cars) {
      add(key(c.line, c.dir), { c, s: c.s, own: true, dir: c.dir });
      if (c.bend) add(key(c.bend.ring, c.bend.dir), { c, s: c.bend.sOut - c.bend.dir * (c.bend.len - c.u), own: false, dir: c.bend.dir });
    }
    const people: (TrafficBlocker & { self?: Mover })[] = this.blockers().slice();
    // (a car of ours over the middle, going round one: the oncoming wait for it)
    for (const c of this.cars)
      if (!c.bend && c.lat < -(laneOff(c.line) - 1.2)) {
        const p = c.group.position;
        people.push({ x: p.x, z: p.z, yaw: c.group.rotation.y, hl: c.len / 2, hw: c.kind === "moto" ? 0.42 : 0.95, wait: true, self: c });
      }
    for (const list of lanes.values()) {
      // (sorted along the lane's own way: the turning cars' places on the ring are the ring's s)
      const dir = list[0].dir;
      list.sort((a, b) => (b.s - a.s) * dir);
      list.forEach((e, i) => {
        if (!e.own) return;
        const c = e.c;
        let limit = Infinity;
        const leader = list[i - 1];
        if (leader) limit = Math.abs(leader.s - c.s) - (leader.c.len + c.len) / 2 - 1.2;
        // the end of its street ahead: its turn planned, slowing for it; whoever is already on the
        // ring where it comes out is the one in front
        const left = c.dir > 0 ? c.line.to - c.s : c.s - c.line.from;
        if (!c.bend && !c.next && left < 45) c.next = this.planTurn(c);
        const b = c.bend ?? c.next;
        let vCap = c.vmax;
        if (b) {
          const toIn = c.bend ? 0 : Math.max(0, (b.sIn - c.s) * c.dir);
          vCap = Math.min(vCap, Math.sqrt(b.vTurn * b.vTurn + 2 * 3.5 * toIn));
          const rest = (c.bend ? b.len - c.u : b.len + toIn) - 0.5;
          for (const o of this.cars) {
            if (o === c || o.line !== b.ring || o.dir !== b.dir) continue;
            const past = (o.s - b.sOut) * b.dir;
            if (past > -o.len && past < 30) limit = Math.min(limit, rest + past - (o.len + c.len) / 2 - 1.2);
          }
          for (const o of this.cars)
            if (o !== c && o.bend && o.bend.ring === b.ring && o.bend.dir === b.dir && o.line !== c.line) {
              // (another street's car turning into the same lane, nearer the end of it)
              const oAt = o.bend.sOut - o.bend.dir * (o.bend.len - o.u);
              const past = (oAt - b.sOut) * b.dir;
              if (past > -rest && past < 30 && (o.bend.len - o.u < rest || o.u > 0.5)) limit = Math.min(limit, rest + past - (o.len + c.len) / 2 - 1.2);
            }
        }
        // someone in the road in its lane (ahead of it, however it is turned); a car's body by its
        // turned extents, stopped short of it with room to pull out round it
        const p = c.group.position;
        const fx = Math.cos(c.group.rotation.y),
          fz = -Math.sin(c.group.rotation.y);
        const half = c.kind === "moto" ? 0.42 : 0.95;
        let person = Infinity,
          body: TrafficBlocker | null = null,
          bodyGap = Infinity;
        for (const q of people) {
          if (q.self === c) continue;
          const dx = q.x - p.x,
            dz = q.z - p.z;
          const across = Math.abs(-dx * fz + dz * fx),
            along = dx * fx + dz * fz;
          if (q.hl === undefined) {
            if (across > 1.3) continue;
            const ahead = along - c.len / 2 - 0.25;
            if (ahead > -1 && ahead < person) person = ahead;
            continue;
          }
          const [ra, rc] = reach(q, fx, fz);
          if (across > rc + half + 0.25) continue;
          const gap = along - ra - c.len / 2;
          if (gap < -1.5) continue;
          // (going round it: as close as the way out lets it; else a car's length of room kept)
          const ahead = gap - (c.round ? 0.25 : q.wait ? 1.2 : 2);
          if (ahead < person) person = ahead;
          if (!q.wait && gap < bodyGap) (bodyGap = gap), (body = q);
        }
        if (person < 10) limit = Math.min(limit, person);
        c.blocked = person < 3 && c.v < 1 && !c.round ? c.blocked + dt : 0;
        // stopped behind a car standing in its lane: it honks (src/scene/horns.ts), then backs up
        // if it must and goes round it — by the kerb's side if there's room, else over the middle
        // when nothing is coming; the ones behind follow it round sooner
        if (!c.bend && !c.held) this.goRound(c, people, body, bodyGap, leader?.c ?? null, list[i + 1]?.c ?? null, dt);
        if (c.held) limit = 0;
        if (!c.bend)
          for (const j of c.line.junctions) {
            const [jx, jz] = c.line.axis === "x" ? [j.at, c.line.at] : [c.line.at, j.at];
            if (this.greenAt(c.line.axis, jx, jz)) continue;
            // the scramble's cars wait behind its zebras
            const stop = j.at - c.dir * (isScramble(jx, jz) ? j.half + SCRAMBLE_STOP + c.len / 2 : j.half + 1.8);
            const ahead = (stop - c.s) * c.dir;
            // only a junction it has not entered yet
            if (ahead > -0.3 && ahead < limit) limit = ahead;
          }
        const brake = Math.sqrt(Math.max(0, 2 * 5 * Math.max(0, limit - 0.4)));
        let target = Math.min(vCap, brake);
        if (c.round?.stage === "back") target = -1.3;
        else if (c.round?.stage === "out") target = Math.min(target, 2.2);
        c.v = c.v < target ? Math.min(target, c.v + 3 * dt) : Math.max(target, c.v - 7 * dt);
        const step = c.v * dt;
        if (c.bend) {
          c.u += step;
          if (c.u >= c.bend.len) {
            // out of the corner: on the ring, in its lane, the rest of the step along it
            const b2 = c.bend;
            c.bend = null;
            c.setLine(b2.ring, b2.dir, b2.sOut + b2.dir * (c.u - b2.len));
          } else this.ride(c, dt);
        } else {
          c.s += c.dir * step;
          // across its lane: out round a car in it, back in once past (turned the way it moves)
          let latRate = 0;
          if (c.lat !== c.latTo) {
            const rate = c.held ? 0 : Math.max(0.35, Math.min(2, Math.abs(c.v) * (c.round ? 0.62 : 0.3)));
            const d = c.latTo - c.lat;
            const m = Math.sign(d) * Math.min(Math.abs(d), rate * dt);
            c.lat += m;
            latRate = m / Math.max(dt, 1e-4);
          }
          const tiltTo = c.v > 0.2 ? -Math.atan2(latRate, Math.max(c.v, 1.5)) : 0;
          c.tilt += (tiltTo - c.tilt) * Math.min(1, dt * 6);
          if (c.lat !== 0 || c.tilt !== 0) c.group.rotation.y = c.yaw0 + c.tilt;
          if (Math.abs(c.tilt) < 1e-4 && c.lat === 0 && c.tilt !== 0) {
            c.tilt = 0;
            c.group.rotation.y = c.yaw0;
          }
          if (c.next && (c.s - c.next.sIn) * c.dir >= 0) {
            // into the corner (back in its lane by now: nothing goes round a car this near the end)
            c.lat = c.latTo = c.tilt = 0;
            c.round = null;
            c.bend = c.next;
            c.next = null;
            c.u = (c.s - c.bend.sIn) * c.dir;
            this.ride(c, dt);
          } else c.place();
        }
        if (!c.bend) this.wheel(c, Math.max(-0.5, Math.min(0.5, c.tilt * 2)), dt);
        spinWheels(c.group, step);
        // the biker rides on (posed while it is near enough to be seen), leaning into the turn
        if (c.rider) {
          c.rider.act.ride = true;
          c.rider.update(dt, { speed: 0 });
        }
        // (a bike leans into the corner: as much as its speed round it asks, eased)
        if (c.kind === "moto") {
          const lean = c.bend ? Math.max(-0.6, Math.min(0.6, -Math.atan((c.v * c.v * c.curve) / 9.8))) : 0;
          c.group.rotation.x += (lean - c.group.rotation.x) * Math.min(1, dt * 6);
        }
      });
    }
    // the police light bar: red and blue in turn
    if (this.police) {
      const on = Math.floor(this.clock * 5) % 2;
      this.police.bar.forEach((m, i) => (m.visible = (i === 0) === !!on));
    }
    for (const c of [...this.cars])
      if (c.done) {
        this.cars.delete(c);
        this.group.remove(c.group);
        // (its rider let go first: the figure frees its own)
        if (c.rider) {
          c.rider.dispose();
          c.rider = null;
        }
        // (gone for good: what is its own, the police car's light bar and door plates, freed)
        freeObject(c.group);
        if (c === this.police) this.police = null;
      }
  }
}
