import * as THREE from "three";
import { GROUND } from "../../real/ground";
import { maps, real } from "../../real/tex";
import type { Course } from "../course";
import type { CourseKit } from "../deckkit";

/**
 * What every crossing's road is made of, whatever carries it (a suspension bridge, a cable-stayed
 * one, a tube under the sea): the carriageway with its paint, the median, the barriers, the walkways
 * and their railing, the lamps. The materials are shared by all the crossings (one program each).
 */

export type DeckMats = ReturnType<typeof makeMats>;
let mats: DeckMats | null = null;
const keep = <T extends THREE.Material>(m: T) => ((m.userData.shared = true), m);

/** The crossings' materials, the paint in the crossing's colour (`paint`). */
export function deckMats(paint: string): DeckMats & { paint: THREE.MeshStandardMaterial } {
  mats ??= makeMats();
  const key = `paint:${paint}`;
  const had = (mats as unknown as Record<string, THREE.Material>)[key] as THREE.MeshStandardMaterial | undefined;
  if (had) return { ...mats, paint: had };
  const relief = maps("Metal032");
  const m = keep(new THREE.MeshStandardMaterial({ color: paint, roughness: 0.5, metalness: 0.1, normalMap: relief.normalMap, normalScale: new THREE.Vector2(0.45, 0.45), roughnessMap: relief.roughnessMap, side: THREE.DoubleSide }));
  (mats as unknown as Record<string, THREE.Material>)[key] = m;
  return { ...mats, paint: m };
}

function makeMats() {
  const steelDark = keep(new THREE.MeshStandardMaterial({ color: "#7c8088", roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }));
  const concrete = real("Concrete034", { tint: "#e6e2da", roughness: 1 });
  const concreteDark = real("Concrete034", { tint: "#8e8a84", roughness: 1 });
  const barrier = keep(real("Concrete034", { tint: "#d4d0c8", roughness: 1 }).clone());
  barrier.side = THREE.DoubleSide;
  const rail = keep(new THREE.MeshStandardMaterial({ color: "#dfe3e6", roughness: 0.45, metalness: 0.4, alphaTest: 0.5, side: THREE.DoubleSide, map: balusters() }));
  const metal = keep(new THREE.MeshStandardMaterial({ color: "#c9ced4", roughness: 0.4, metalness: 0.6 }));
  const lamp = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffc27a"), toneMapped: false }));
  const red = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff2a1a"), toneMapped: false }));
  const flood = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff"), toneMapped: false, transparent: true, opacity: 0.9 }));
  const necklace = keep(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  const tubeLight = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff1d6"), toneMapped: false }));
  const yellow = keep(new THREE.MeshStandardMaterial({ color: "#e9b21e", roughness: 0.5 }));
  const road = GROUND.asphalt(roadMarks());
  const walk = GROUND.concrete();
  const tile = real("Tiles074", { tint: "#e8e4dc", roughness: 0.7 });
  return { steelDark, concrete, concreteDark, barrier, rail, metal, lamp, red, flood, necklace, tubeLight, yellow, road, walk, tile };
}

/** The lights by the evening (0 by day … 1 at night): the lamps, the necklace, the floodlights. */
export function deckNight(k: number) {
  if (!mats) return;
  mats.lamp.color.setRGB(1, 0.76, 0.48).multiplyScalar(0.2 + 3.2 * k);
  mats.red.color.setRGB(1, 0.16, 0.1).multiplyScalar(0.6 + 2.8 * k);
  mats.necklace.color.setScalar(0.08 + 2.6 * k);
  mats.flood.color.setScalar(0.35 + 1.4 * k);
  mats.tubeLight.color.setRGB(1, 0.94, 0.84).multiplyScalar(1.4);
}

/** The railing's balusters (alpha-tested bars on a plane). */
function balusters() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 64, 128);
  g.fillStyle = "#ffffff";
  g.fillRect(8, 0, 7, 128);
  g.fillRect(40, 0, 7, 128);
  g.fillRect(0, 0, 64, 8);
  g.fillRect(0, 60, 64, 6);
  g.fillRect(0, 118, 64, 10);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.shared = true;
  return t;
}

/** The carriageway's paint, two lanes each way either side of the median (u along s / 18 m, v across ±7.4 m). */
function roadMarks() {
  const P = 24,
    len = 18,
    half = 7.4;
  const c = document.createElement("canvas");
  c.width = len * P;
  c.height = Math.round(half * 2 * P);
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  const white = "rgba(238,238,232,0.95)",
    yellow = "rgba(234,184,48,0.95)";
  const line = 0.15 * P;
  // (v runs from −half at the top row … the ribbon's v 0 is its left edge)
  const yAt = (off: number) => (off + half) * P;
  const solid = (off: number, col: string) => ((g.fillStyle = col), g.fillRect(0, yAt(off) - line / 2, c.width, line));
  const dash = (off: number) => {
    g.fillStyle = white;
    for (let u = 0; u < len; u += 9) g.fillRect(u * P, yAt(off) - line / 2, 3 * P, line);
  };
  for (const s of [-1, 1]) {
    solid(s * 0.75, yellow);
    solid(s * (half - 0.35), white);
    dash(s * 3.6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.shared = true;
  return t;
}

/**
 * The road over a course: carriageway, median, barriers, walkways, railing and lamps, from `s0` to
 * `s1` (the ends left plain where they meet the streets). `lampEvery` metres a lamp each side.
 */
export function drawDeck(K: CourseKit, c: Course, o: { s0: number; s1: number; lampEvery: number; median: [number, number]; road?: [number, number] }) {
  const sec = c.c.section;
  const L = c.length;
  const k = () => 0;
  // the carriageway, end to end (its paint mapped to the road's own width) — or over `road` only
  // (a bridge-tunnel: the tube draws its own)
  const [r0, r1] = o.road ?? [0, L];
  K.ribbon("road", () => -sec.road, () => sec.road, 0.012, r0, r1, 18, 1, [-7.4, 14.8]);
  // the median: a concrete barrier down the middle, yellow cushions on its noses
  K.sweep("barrier", [[-0.42, 0], [-0.32, 0.3], [-0.12, 0.82], [0.12, 0.82], [0.32, 0.3], [0.42, 0]], k, o.median[0], o.median[1], 1);
  for (const [s, d] of [
    [o.median[0], -1],
    [o.median[1], 1],
  ] as const) {
    const y = c.y(s + d * 1.2);
    K.box("yellow", 0.86, 0.85, 2.4, s + d * 1.2, 0, y);
  }
  for (const sd of [-1, 1]) {
    const at = (off: number) => () => sd * off;
    const pair = (a: number, b: number): [(s: number) => number, (s: number) => number] => (sd < 0 ? [at(b), at(a)] : [at(a), at(b)]);
    // the barrier (a Jersey wall with a steel rail on top)
    K.sweep("barrier", [[0, 0], [0.05, 0.3], [0.14, 0.85], [0.42, 0.85], [0.5, 0]], at(sec.road + 0.02), o.s0, o.s1, 1, false, sd);
    K.sweep("metal", [[0.2, 0.95], [0.36, 0.95], [0.36, 1.05], [0.2, 1.05], [0.2, 0.95]], at(sec.road + 0.02), o.s0, o.s1, 1, false, sd);
    // the walkway (a kerb up) and the deck's edge out to the fascia
    K.ribbon("walk", ...pair(sec.road + 0.5, sec.walk), 0.15, o.s0, o.s1, 2, 2);
    K.ribbon("walk", ...pair(sec.walk, sec.edge), 0.15, o.s0, o.s1, 2, 2);
    // the gap between the road's edge and the walkway, under the barrier
    K.ribbon("walk", ...pair(sec.road, sec.road + 0.5), 0.02, o.s0, o.s1, 4, 2);
    // the railing: a top rail, posts every 3 m, the balusters' strip
    K.sweep("metal", [[0, 1.3], [0.1, 1.3], [0.1, 1.38], [0, 1.38], [0, 1.3]], at(sec.rail), o.s0, o.s1, 1, false, sd);
    for (let s = o.s0 + 1; s < o.s1; s += 3) K.box("metal", 0.1, 1.25, 0.1, s, sd * sec.rail, c.y(s) + 0.15);
    railStrip(K, c, sd * sec.rail, o.s0, o.s1);
    // the fascia down the deck's edge
    K.sweep("paint", [[0, 0.3], [0, -1.8], [-0.5, -1.8]], at(sec.edge), o.s0, o.s1, 1, false, sd);
    K.sweep("paint", [[-0.5, 0.3], [0, 0.3]], at(sec.edge), o.s0, o.s1, 1, false, sd);
    // the lamps: a tall pole on the walkway's outer edge, an arm over the road, a flat head
    for (let s = o.s0 + o.lampEvery / 2; s < o.s1 - 4; s += o.lampEvery) {
      const y = c.y(s) + 0.15;
      const x0 = sd * (sec.walk - 0.2);
      K.box("metal", 0.2, 9.5, 0.2, s, x0, y);
      const [ax, ay, az] = c.point(s, x0, 9.4 - (c.y(s) - y) + 0.15);
      const [bx, by, bz] = c.point(s, sd * (sec.road - 1.4), 9.6 + 0.15);
      K.bar("metal", [ax, ay, az], [bx, by, bz], 0.14);
      K.box("lamp", 0.5, 0.12, 1.0, s, sd * (sec.road - 1.4), y + 9.45);
    }
  }
}

/** The balusters as a vertical strip `off` metres off the centre line. */
function railStrip(K: CourseKit, c: Course, off: number, s0: number, s1: number) {
  const pos: number[] = [],
    uv: number[] = [];
  for (let s = s0; s < s1; s += 2) {
    const q = Math.min(s1, s + 2);
    const a = c.point(s, off, 0.15),
      b = c.point(q, off, 0.15),
      d = c.point(s, off, 1.3),
      e = c.point(q, off, 1.3);
    const P = [a, b, e, d];
    const T = [
      [s / 0.6, 0],
      [q / 0.6, 0],
      [q / 0.6, 1],
      [s / 0.6, 1],
    ];
    for (const o of [0, 1, 2, 0, 2, 3]) pos.push(...P[o]), uv.push(...T[o]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  K.add("rail", g);
}
