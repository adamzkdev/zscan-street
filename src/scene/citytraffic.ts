import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CITY, CURB, GRID, RIVER, SHOTENGAI } from "./city/plan";
import type { Traffic } from "./traffic";
import { toObject } from "./voxel/mesher";
import { VOX } from "./voxel/model";
import { policeModel, sedanModel, taxiModel } from "./voxel/vehicles";
import { busSign, canvasTexture } from "./textures";

/**
 * Traffic across the whole city: traffic lights at the grid's junctions (the avenue's included),
 * cars on the north–south and east–west streets that stop at red and keep their distance, and a
 * police car on patrol with its light bar going. Cars drive on the right, as on the avenue.
 */

/** One cycle: east–west green, all red, north–south green, all red (seconds). */
const CYCLE = { ew: 16, gap1: 2, ns: 10, gap2: 2 };
const PERIOD = CYCLE.ew + CYCLE.gap1 + CYCLE.ns + CYCLE.gap2;
const AVENUE_Z = (CITY.road.z0 + CITY.road.z1) / 2;

type Axis = "x" | "z";
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

class Mover {
  readonly group = new THREE.Group();
  s: number;
  v = 0;
  blocked = 0;
  held = false;
  readonly kind: "sedan" | "taxi" | "police";
  vmax: number;
  /** The light bar's lamps (police only). */
  bar: THREE.Mesh[] = [];
  constructor(
    readonly line: Line,
    readonly dir: 1 | -1,
    kind: "sedan" | "taxi" | "police",
  ) {
    this.kind = kind;
    const model = kind === "taxi" ? taxiModel() : kind === "police" ? policeModel() : sedanModel(...PAINTS[Math.floor(Math.random() * PAINTS.length)]);
    const body = toObject(model);
    this.group.add(body);
    if (kind === "police") {
      // the light bar: red on the left, blue on the right, flashing in turn
      for (const [z, c] of [
        [-0.32, "#ff2a2a"],
        [0.32, "#2a6aff"],
      ] as const) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3.2), toneMapped: false }));
        lamp.position.set(0.17, 11.5 * VOX, z);
        this.group.add(lamp);
        this.bar.push(lamp);
      }
      // POLICE 警察 on both doors
      const tex = canvasTexture(busSign("POLICE 警察"));
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
        plate.position.set(-0.2, 0.62, side * (5.5 * VOX + 0.02));
        if (side < 0) plate.rotation.y = Math.PI;
        this.group.add(plate);
      }
    }
    this.vmax = kind === "police" ? 11 : 8 + Math.random() * 3;
    this.s = dir > 0 ? line.from : line.to;
    // right-hand traffic: +x keeps to +z, +z keeps to −x
    const off = 1.9;
    if (line.axis === "x") {
      this.group.position.z = line.at + (dir > 0 ? off : -off);
      this.group.rotation.y = dir > 0 ? 0 : Math.PI;
    } else {
      this.group.position.x = line.at + (dir > 0 ? -off : off);
      this.group.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    this.place();
  }
  place() {
    if (this.line.axis === "x") this.group.position.x = this.s;
    else this.group.position.z = this.s;
    this.group.position.y = 0;
  }
  get done() {
    return this.dir > 0 ? this.s > this.line.to : this.s < this.line.from;
  }
}

export class CityTraffic {
  readonly group = new THREE.Group();
  private lines: Line[] = [];
  private cars = new Set<Mover>();
  private clock = 0;
  private spawnIn = 0;
  private police: Mover | null = null;
  /** People in the road (the player, jaywalkers). */
  blockers: () => { x: number; z: number }[] = () => [];

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
    const half = GRID.street / 2;
    // (the north street is the B tram's, the south one the A tram's)
    const ewLines = [GRID.zs[1]];
    const nsLines = GRID.xs.filter((x) => x !== SHOTENGAI.x);
    const crossZ = [GRID.zs[0], GRID.zs[1], AVENUE_Z, GRID.zs[2]];
    // north–south streets: from the top of the board to the bottom, over the river's bridges
    for (const x of nsLines) this.lines.push({ axis: "z", at: x, from: CITY.minZ - 2, to: CITY.maxZ + 2, junctions: crossZ.map((z) => ({ at: z, half: z === AVENUE_Z ? 4 : half })) });
    // east–west streets north of the heart (the avenue is the existing traffic, the tram has its own)
    for (const z of ewLines) this.lines.push({ axis: "x", at: z, from: CITY.minX - 2, to: CITY.maxX + 2, junctions: GRID.xs.map((x) => ({ at: x, half })) });
    // the lights, and the avenue's own traffic stopping at them
    const junctions: [number, number][] = [];
    for (const x of GRID.xs) for (const z of crossZ) junctions.push([x, z]);
    for (const [x, z] of junctions) this.light(x, z);
    this.buildLights();
    for (const x of nsLines) avenue.crossings.push({ x, half: 4.2, busy: () => !this.green("x") });
    this.spawnIn = 0.5;
    // a few at once to start with
    for (let i = 0; i < Math.min(6, max); i++) this.spawn(true);
  }

  /** Is the given axis green right now? */
  green(axis: Axis) {
    const t = this.clock % PERIOD;
    return axis === "x" ? t < CYCLE.ew : t >= CYCLE.ew + CYCLE.gap1 && t < CYCLE.ew + CYCLE.gap1 + CYCLE.ns;
  }

  /** Traffic lights: two heads per junction (one per direction); poles merged, lenses instanced. */
  private poleGeos: THREE.BufferGeometry[] = [];
  private lensSpots: { pos: THREE.Vector3; axis: Axis; col: "red" | "green" }[] = [];
  private lenses: THREE.InstancedMesh | null = null;

  private light(x: number, z: number) {
    const h = GRID.street / 2 + (Math.abs(z - AVENUE_Z) < 0.1 ? 0.8 : 0) + 0.9;
    for (const [cx, cz, axis] of [
      [x + h, z + h, "x"],
      [x - h, z - h, "z"],
    ] as const) {
      this.poleGeos.push(new THREE.BoxGeometry(0.14, 3.4, 0.14).translate(cx, CURB + 1.7, cz));
      this.nav?.addCircle(cx, cz, 0.2);
      this.poleGeos.push(new THREE.BoxGeometry(0.34, 0.8, 0.34).translate(cx, CURB + 3.3, cz));
      this.lensSpots.push({ pos: new THREE.Vector3(cx, CURB + 3.5, cz), axis, col: "red" }, { pos: new THREE.Vector3(cx, CURB + 3.1, cz), axis, col: "green" });
    }
  }

  private buildLights() {
    const pole = new THREE.MeshStandardMaterial({ color: "#2a2832", roughness: 0.6 });
    this.group.add(new THREE.Mesh(mergeGeometries(this.poleGeos, false), pole));
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.24, 0.36), new THREE.MeshBasicMaterial({ toneMapped: false }), this.lensSpots.length);
    this.lensSpots.forEach((l, i) => m.setMatrixAt(i, new THREE.Matrix4().setPosition(l.pos)));
    m.setColorAt(0, new THREE.Color());
    this.lenses = m;
    this.group.add(m);
  }

  private spawn(anywhere = false) {
    if (this.cars.size >= this.max) return;
    const line = this.lines[Math.floor(Math.random() * this.lines.length)];
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const kind = !this.police ? "police" : Math.random() < 0.2 ? "taxi" : "sedan";
    const car = new Mover(line, dir, kind);
    if (anywhere) car.s = line.from + Math.random() * (line.to - line.from);
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
    if (this.lenses) {
      const c = new THREE.Color();
      this.lensSpots.forEach((l, i) => {
        const g = l.axis === "x" ? ewGreen : nsGreen;
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
    // per lane: front first, keep the gap, stop at red lights
    const lanes = new Map<string, Mover[]>();
    for (const c of this.cars) {
      const k = `${c.line.axis}${c.line.at}${c.dir}`;
      const l = lanes.get(k);
      if (l) l.push(c);
      else lanes.set(k, [c]);
    }
    const people = this.blockers();
    for (const list of lanes.values()) {
      list.sort((a, b) => (b.s - a.s) * a.dir);
      list.forEach((c, i) => {
        const green = this.green(c.line.axis);
        let limit = Infinity;
        const leader = list[i - 1];
        if (leader) limit = Math.abs(leader.s - c.s) - 5.2;
        // someone in the road in its lane
        const lane = c.line.axis === "x" ? c.group.position.z : c.group.position.x;
        let person = Infinity;
        for (const b of people) {
          const across = c.line.axis === "x" ? b.z : b.x;
          const along = c.line.axis === "x" ? b.x : b.z;
          if (Math.abs(across - lane) > 1.3) continue;
          const ahead = (along - c.s) * c.dir - 2.4;
          if (ahead > -1 && ahead < person) person = ahead;
        }
        if (person < 10) limit = Math.min(limit, person);
        c.blocked = person < 3 && c.v < 1 ? c.blocked + dt : 0;
        if (c.held) limit = 0;
        if (!green)
          for (const j of c.line.junctions) {
            const stop = j.at - c.dir * (j.half + 1.8);
            const ahead = (stop - c.s) * c.dir;
            // only a junction it has not entered yet
            if (ahead > -0.3 && ahead < limit) limit = ahead;
          }
        const brake = Math.sqrt(Math.max(0, 2 * 5 * Math.max(0, limit - 0.4)));
        const target = Math.min(c.vmax, brake);
        c.v = c.v < target ? Math.min(target, c.v + 3 * dt) : Math.max(target, c.v - 7 * dt);
        c.s += c.dir * c.v * dt;
        c.place();
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
        if (c === this.police) this.police = null;
      }
  }
}
