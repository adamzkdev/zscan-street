import { BAY, CITY } from "../city/plan";
import { KEYS } from "../keys/plan";
import { Course } from "./course";
import { EAST } from "./east/plan";
import { NORTH } from "./north/plan";
import { WEST } from "./west/plan";
import type { Box, Isle } from "./types";

/**
 * The islands round the city (each with the crossing that reaches it from the ring road), and the
 * world's extent with them. Add one here (its descriptor, `<side>/plan.ts`) and everything that
 * reads this list takes it: the roads and the GPS, the census, the solid shape (a picture of its own,
 * built as you come near), the maps' frame, the sounds, the camera's reach. See RECIPE.md.
 */
export const ISLES: Isle[] = [EAST, NORTH, WEST];

/** Each crossing's course (built once). */
export const COURSES = new Map<string, Course>(ISLES.map((i) => [i.key, new Course(i.crossing)]));

/** The whole world: the city, Orchard Keys across the Golden Gate, the islands and their crossings. */
export const WORLD: Box = (() => {
  const b = { x0: Math.min(CITY.minX, KEYS.x0), x1: Math.max(CITY.maxX, KEYS.x1), z0: Math.min(CITY.minZ, KEYS.z0), z1: Math.max(CITY.maxZ, KEYS.z1) };
  for (const i of ISLES) {
    const c = COURSES.get(i.key)!.box;
    b.x0 = Math.min(b.x0, i.box.x0, c.x0);
    b.x1 = Math.max(b.x1, i.box.x1, c.x1);
    b.z0 = Math.min(b.z0, i.box.z0, c.z0);
    b.z1 = Math.max(b.z1, i.box.z1, c.z1);
  }
  return b;
})();

export const inBox = (b: Box, x: number, z: number, pad = 0) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;

/** The island whose box holds (x, z), or null. */
export function isleAt(x: number, z: number): Isle | null {
  for (const i of ISLES) if (inBox(i.box, x, z)) return i;
  return null;
}

/** The crossing (and where along it) under (x, z), within its deck's edge, or null. */
export function crossingAt(x: number, z: number): { isle: Isle; course: Course; s: number; off: number } | null {
  for (const i of ISLES) {
    const course = COURSES.get(i.key)!;
    const p = course.project(x, z);
    if (p && Math.abs(p.off) < i.crossing.section.edge) return { isle: i, course, s: p.s, off: p.off };
  }
  return null;
}

/** The straight runs of a crossing's course, as streets (axis-aligned: the GPS's), named after it. */
export function crossingRuns(i: Isle): { axis: "x" | "z"; at: number; from: number; to: number; width: number; name: string }[] {
  const P = i.crossing.path;
  const out: { axis: "x" | "z"; at: number; from: number; to: number; width: number; name: string }[] = [];
  for (let k = 1; k < P.length; k++) {
    const [ax, az] = P[k - 1],
      [bx, bz] = P[k];
    const w = i.crossing.section.road * 2;
    if (Math.abs(az - bz) < 0.01) out.push({ axis: "x", at: az, from: Math.min(ax, bx), to: Math.max(ax, bx), width: w, name: i.crossing.name });
    else out.push({ axis: "z", at: ax, from: Math.min(az, bz), to: Math.max(az, bz), width: w, name: i.crossing.name });
  }
  return out;
}

/**
 * Where the city's sea must not be drawn (src/scene/city/index.ts, coast()): over a tunnel's tube
 * wherever its inside — road to ceiling — reaches the water's level (the sea is one flat sheet: it
 * would cross the tube), the tube's roof standing out of the water there. Rectangles round the
 * course's straight runs.
 */
export const SEA_HOLES: Box[] = (() => {
  const out: Box[] = [];
  const W = BAY.water - 0.06;
  for (const i of ISLES) {
    const t = i.crossing.tube;
    if (!t) continue;
    const c = COURSES.get(i.key)!;
    const half = i.crossing.section.road + 3.0;
    const rect = (a: number, b: number) => {
      const ps = [c.point(a, -half), c.point(a, half), c.point(b, -half), c.point(b, half)];
      out.push({ x0: Math.min(...ps.map((p) => p[0])), x1: Math.max(...ps.map((p) => p[0])), z0: Math.min(...ps.map((p) => p[2])), z1: Math.max(...ps.map((p) => p[2])) });
    };
    let a = -1;
    for (let s = Math.max(0, t[0] - 2); s <= Math.min(c.length, t[1] + 2); s += 0.5) {
      const y = c.y(s);
      const inside = y < W + 0.05 && y + 6.4 + 0.35 > W;
      if (inside && a < 0) a = s;
      if (!inside && a >= 0) (rect(a - 0.5, s + 0.5), (a = -1));
    }
    if (a >= 0) rect(a - 0.5, Math.min(c.length, t[1] + 2));
  }
  return out;
})();
