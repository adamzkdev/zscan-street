import * as THREE from "three";
import type { Course } from "../course";
import { CourseKit } from "../deckkit";
import { deckMats, drawDeck } from "./deck";
import { buildSuspension } from "./suspension";
import { buildBrooklyn } from "./brooklyn";
import { buildBridgeTunnel } from "./oresund";

/**
 * The other kinds of crossing, on the same course and road as the suspension bridge:
 *  - a cable-stayed bridge: an H pylon (or two) with stays fanned straight down to the deck's edges;
 *  - a tunnel: where the road runs under the ground or the sea (the profile below the shore's level),
 *    a lit tube — walls, a ceiling with its light strips, walkways behind kerbs — and a portal at
 *    each end, retaining walls up the ramps;
 *  - a bridge-tunnel (Øresund): the bridge over its part of the course, the tube over the rest.
 * The island's descriptor picks one (`crossing.kind`); the game reads only the course.
 */

/** Every kind of crossing: its whole drawing (world coordinates, meshes at their own centres). */
export function buildCrossing(c: Course): THREE.Group {
  const k = c.c.kind;
  if (k === "suspension") return c.c.style.tower === "gothic" ? buildBrooklyn(c) : buildSuspension(c);
  if (k === "cable-stayed") return buildCableStayed(c, 0, c.length);
  // (Øresund's: the big cable-stayed bridge, the islet, the tube — ./oresund.ts)
  if (k === "bridge-tunnel") return buildBridgeTunnel(c);
  const [t0, t1] = c.c.tube ?? [0, c.length];
  const g = new THREE.Group();
  g.name = `crossing:${c.c.key}`;
  g.add(buildTube(c, t0, t1));
  return g;
}

/** A cable-stayed bridge from s0 to s1: its deck, an H pylon at each tower (`towers`, else one mid-span), the fans of stays. */
export function buildCableStayed(c: Course, s0: number, s1: number): THREE.Group {
  const X = c.c;
  const sec = X.section;
  const K = new CourseKit(c);
  const M = deckMats(X.style.paint);
  drawDeck(K, c, { s0: Math.max(6, s0), s1: Math.min(c.length - 6, s1), lampEvery: 30, median: [Math.max(16, s0 + 10), Math.min(c.length - 16, s1 - 10)] });
  K.sweep("concrete", [[-sec.edge + 0.8, -1.8], [-5.5, -3.2], [5.5, -3.2], [sec.edge - 0.8, -1.8]], () => 0, s0 + 2, s1 - 2, 2);
  const pylons = (X.towers ?? [(s0 + s1) / 2]).filter((t) => t > s0 && t < s1);
  const top = X.top ?? 80;
  const plane = sec.edge + 1.4;
  for (const t of pylons) {
    K.box("concrete", plane * 2 + 10, 6, 14, t, 0, -7);
    for (const sd of [-1, 1]) K.box("paint", 2.6, top + 1.2, 4.2, t, sd * plane, -1.2);
    K.box("paint", plane * 2 + 2.6, 2.4, 4.2, t, 0, c.y(t) - 4.6);
    K.box("paint", plane * 2 + 2.6, 2.6, 4.2, t, 0, top - 6);
    for (const sd of [-1, 1]) K.box("red", 0.5, 0.5, 0.5, t, sd * plane, top);
    // the fans: stays from high on the pylon to the deck's edge every 12 m, both ways
    for (const dir of [-1, 1])
      for (let k = 1; k <= 9; k++) {
        const s = t + dir * k * 12;
        if (s < s0 + 4 || s > s1 - 4) break;
        for (const sd of [-1, 1]) K.bar("metal", c.point(t, sd * plane, top - 8 - k * 2.6 - c.y(t)), c.point(s, sd * (sec.edge - 0.3), 0.3), 0.14);
      }
  }
  // piers under the approaches
  for (let s = s0 + 20; s < s1 - 8; s += 32) {
    if (pylons.some((t) => Math.abs(t - s) < 16)) continue;
    const y = c.y(s);
    if (y < 3.2) continue;
    for (const x of [-4.2, 4.2]) K.box("concrete", 1.9, y - 3.2 + 8, 1.9, s, x, -8);
  }
  return K.build(M as unknown as Record<string, THREE.Material>, `crossing:${X.key}:stayed`, { noShadow: new Set(["road", "walk", "rail", "lamp", "red"]) });
}

/** The tube from s0 to s1: road, kerbs and walkways, walls, ceiling and its light strips, the portals, the ramps' retaining walls. */
export function buildTube(c: Course, s0: number, s1: number): THREE.Group {
  const X = c.c;
  const sec = X.section;
  const K = new CourseKit(c);
  const M = deckMats(X.style.paint);
  const half = sec.road + 2.2;
  const H = 6.4;
  // the road (the carriageway's paint), the median, the kerbs and the walkways
  K.ribbon("road", () => -sec.road, () => sec.road, 0.012, s0, s1, 18, 1, [-7.4, 14.8]);
  K.sweep("barrier", [[-0.3, 0], [-0.2, 0.8], [0.2, 0.8], [0.3, 0]], () => 0, s0 + 8, s1 - 8, 1);
  for (const sd of [-1, 1]) {
    const pair = (a: number, b: number): [(s: number) => number, (s: number) => number] => (sd < 0 ? [() => -b, () => -a] : [() => a, () => b]);
    K.ribbon("walk", ...pair(sec.road, half), 0.25, s0, s1, 2, 2);
    K.sweep("barrier", [[0, 0], [0, 0.25]], () => sd * sec.road, s0, s1, 1, false, sd);
    // the wall (tiled), its dado, and the ceiling's light strips
    K.sweep("tile", [[0, 0.25], [0, H - 0.6], [-0.6, H]], () => sd * half, s0, s1, 2, false, sd);
    K.sweep("concreteDark", [[0.02, 0.25], [0.02, 1.2]], () => sd * half, s0, s1, 2, false, sd);
    K.ribbon("tubeLight", ...pair(sec.road - 2.2, sec.road - 1.8), H - 0.02, s0, s1, 4, 1, undefined, true);
  }
  K.ribbon("concreteDark", () => -half + 0.6, () => half - 0.6, H, s0, s1, 4, 2, undefined, true);
  // the outer shell (seen from the water, from the ramps' ends)
  K.sweep("concrete", [[-half - 0.8, -0.6], [-half - 0.8, H + 0.8], [half + 0.8, H + 0.8], [half + 0.8, -0.6]], () => 0, s0, s1, 4, true);
  // the portals: a deep concrete frame at each end, a band of light over the mouth
  for (const s of [s0, s1]) {
    const y = c.y(s);
    K.box("concrete", half * 2 + 4, 2.2, 3, s, 0, y + H);
    for (const sd of [-1, 1]) K.box("concrete", 2.2, H + 2.2, 3, s, sd * (half + 1.1), y);
    K.box("tubeLight", half * 2 - 1, 0.3, 3.1, s, 0, y + H + 0.6);
  }
  // the ramps outside the portals: retaining walls from the road up to the shore's level (CURB)
  for (const [a, b, d] of [
    [Math.max(0, s0 - 120), s0, -1],
    [s1, Math.min(c.length, s1 + 120), 1],
  ] as const) {
    for (let s = a; s < b; s += 2) {
      const y = c.y(s);
      if (y > 0) continue;
      for (const sd of [-1, 1]) K.box("concrete", 0.6, 0.4 - y + 1.0, 2.05, s + 1, sd * (half + 0.3), y);
    }
    void d;
  }
  return K.build(M as unknown as Record<string, THREE.Material>, `crossing:${X.key}:tube`, { noShadow: new Set(["road", "walk", "tubeLight"]) });
}
