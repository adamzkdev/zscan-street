import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CITY, CURB, ST } from "./city/plan";
import { busSign, canvasTexture } from "./textures";
import { toObject } from "./voxel/mesher";
import { C, E, G, VOX, VoxelModel } from "./voxel/model";

/**
 * The tram: along the street south of the heart (under the metro), from one end of the city to
 * the other and back, stopping at the shōtengai, the square and Midtown. It is the city's own
 * life, not a block: it runs all the time, lit windows full of people at night.
 */

const END = CITY.maxX - 6;

/** The two tram lines: A along the street under the metro, B along the park's north edge. */
export interface TramLine {
  name: string;
  z: number;
  stops: number[];
  body: string;
  band: string;
}
export const TRAM_LINES: TramLine[] = [
  { name: "TRAM A · 路面電車", z: ST.south + 1.9, stops: [ST.blvdW, ST.shotengai, 0, ST.east1, ST.blvdE], body: "#2e8a5a", band: "#ece4cc" },
  { name: "TRAM B · 北線", z: ST.parkN + 1.9, stops: [-190, ST.shotengai, ST.heartW, 0, ST.heartE, ST.east1, 190], body: "#d8602a", band: "#f4e8c8" },
];
const CARW = 42;
const SPEED = 9;

function carModel(cab: boolean, body = "#2e8a5a", band = "#ece4cc") {
  const w = CARW,
    d = 14,
    h = 18;
  const m = new VoxelModel(w, h, d);
  const green = C(body),
    cream = C(band),
    dark = C("#26242c");
  m.box(1, 2, 0, w - 1, h - 2, d, green);
  m.box(1, 5, 0, w - 1, 7, d, cream);
  m.box(2, h - 2, 1, w - 2, h - 1, d - 1, C("#9aa0a8"));
  m.box(1, 0, 2, w - 1, 2, d - 2, dark);
  // windows, lit at night (the shader keeps some dark)
  for (let x = 4; x < w - 6; x += 6) m.box(x, 8, 0, x + 4, 14, d, E("#ffe2a8", 1.2));
  m.box(4, 8, 1, w - 4, 14, d - 1, G("#1a2030"));
  // pantograph
  m.box(w / 2 - 4, h - 1, d / 2 - 1, w / 2 + 4, h, d / 2 + 1, dark);
  m.box(w / 2 - 1, h, d / 2 - 1, w / 2 + 1, h + 6, d / 2 + 1, dark);
  if (cab) {
    m.box(w - 1, 8, 2, w, 15, d - 2, G("#101420"));
    for (const z of [2, d - 4]) m.box(w - 1, 4, z, w, 6, z + 2, E("#fff6e0", 3));
  }
  return m;
}

class TramSet {
  readonly group = new THREE.Group();
  x: number;
  dir: 1 | -1;
  v = 0;
  dwell = 0;
  private lastStop: number | null = null;
  /** The bell as it pulls in (main plays it). */
  onBell: ((at: THREE.Vector3) => void) | null = null;
  blockers: () => { x: number; z: number }[] = () => [];
  private clock = 0;
  private rang = -9;

  constructor(
    x: number,
    dir: 1 | -1,
    readonly line: TramLine,
  ) {
    this.x = x;
    this.dir = dir;
    for (const [i, cab] of [
      [0, true],
      [1, false],
    ] as const) {
      const car = toObject(carModel(cab, line.body, line.band));
      car.position.x = (i === 0 ? 1 : -1) * (CARW * VOX * 0.5 + 0.15);
      if (i === 1) car.rotation.y = Math.PI;
      this.group.add(car);
    }
    const sign = canvasTexture(busSign(line.name));
    for (const side of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.4), new THREE.MeshBasicMaterial({ map: sign, toneMapped: false }));
      s.position.set(0, 2.55, side * 1.18);
      if (side < 0) s.rotation.y = Math.PI;
      this.group.add(s);
    }
    this.group.position.set(x, 0.02, line.z);
  }

  update(dt: number) {
    this.clock += dt;
    if (this.dwell > 0) {
      this.dwell -= dt;
      return;
    }
    // the next stop ahead, or the end of the line
    const ahead = this.line.stops.filter((s) => (s - this.x) * this.dir > 0.2 && s !== this.lastStop).sort((a, b) => (a - b) * this.dir)[0];
    const target = ahead ?? this.dir * END;
    let dist = Math.abs(target - this.x);
    // someone on the rails ahead: stop short and ring
    for (const b of this.blockers()) {
      if (Math.abs(b.z - this.line.z) > 1.6) continue;
      const gap = (b.x - this.x) * this.dir - 8.2;
      if (gap > -1 && gap < 14) {
        if (gap < dist) dist = Math.max(0, gap);
        if (gap < 3 && this.clock - this.rang > 2.5) {
          this.rang = this.clock;
          this.onBell?.(this.group.position);
        }
      }
    }
    // held up right in front of someone: stand still
    if (dist < 0.05 && Math.abs(target - this.x) > 0.3) {
      this.v = 0;
      return;
    }
    const vmax = Math.min(SPEED, Math.sqrt(2 * 1.2 * dist) + 0.2);
    this.v = Math.min(vmax, this.v + 1.6 * dt);
    this.x += this.dir * this.v * dt;
    if (dist < 0.15 && Math.abs(target - this.x) < 0.3) {
      this.x = target;
      this.v = 0;
      if (ahead !== undefined) {
        this.lastStop = ahead;
        this.dwell = 4;
        this.onBell?.(this.group.position);
      } else {
        // end of the line: back the other way
        this.dir = this.dir > 0 ? -1 : 1;
        this.lastStop = null;
        this.dwell = 3;
      }
    }
    this.group.position.x = this.x;
    this.group.rotation.y = this.dir > 0 ? 0 : Math.PI;
  }
}

export class Tram {
  readonly group = new THREE.Group();
  readonly sets: TramSet[] = [];

  constructor(
    scene: THREE.Object3D,
    private nav?: import("./nav").Nav,
  ) {
    scene.add(this.group);
    for (const line of TRAM_LINES) {
      this.track(line);
      for (const [x, dir] of [
        [-60, 1],
        [70, -1],
      ] as const) {
        const t = new TramSet(x, dir, line);
        this.sets.push(t);
        this.group.add(t.group);
      }
    }
  }

  set onBell(fn: ((at: THREE.Vector3) => void) | null) {
    for (const s of this.sets) s.onBell = fn;
  }

  set blockers(fn: () => { x: number; z: number }[]) {
    for (const s of this.sets) s.blockers = fn;
  }

  /** Rails in the road, the overhead line on poles, a shelter at each stop. */
  private track(line: TramLine) {
    const Z = line.z;
    const W = END * 2 + 10;
    const steel = new THREE.MeshStandardMaterial({ color: "#6a6a74", metalness: 0.7, roughness: 0.35 });
    const pole = new THREE.MeshStandardMaterial({ color: "#2a2832", roughness: 0.6 });
    const geos: THREE.BufferGeometry[] = [];
    for (const dz of [-0.72, 0.72]) geos.push(new THREE.BoxGeometry(W, 0.03, 0.1).translate(0, 0.02, Z + dz));
    const rails = new THREE.Mesh(mergeGeometries(geos, false), steel);
    rails.receiveShadow = true;
    this.group.add(rails);
    const poles: THREE.BufferGeometry[] = [];
    for (let x = -END; x <= END; x += 16) {
      poles.push(new THREE.BoxGeometry(0.18, 5.8, 0.18).translate(x, 2.9, Z + 2.2));
      this.nav?.addCircle(x, Z + 2.2, 0.2);
      poles.push(new THREE.BoxGeometry(0.1, 0.1, 2.4).translate(x, 5.6, Z + 1.1));
    }
    for (const x of line.stops) {
      poles.push(new THREE.BoxGeometry(5, 0.12, 1.6).translate(x, CURB + 2.6, Z + 2.4));
      for (const dx of [-2.2, 2.2]) {
        poles.push(new THREE.BoxGeometry(0.12, 2.6, 0.12).translate(x + dx, CURB + 1.3, Z + 3));
        this.nav?.addCircle(x + dx, Z + 3, 0.15);
      }
    }
    this.group.add(new THREE.Mesh(mergeGeometries(poles, false), pole));
    const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-END, 5.55, Z), new THREE.Vector3(END, 5.55, Z)]), new THREE.LineBasicMaterial({ color: "#121117" }));
    this.group.add(wire);
  }

  update(dt: number) {
    for (const s of this.sets) s.update(dt);
  }
}
