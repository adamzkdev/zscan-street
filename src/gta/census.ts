import { CORE, GRID, ST } from "../scene/city/plan";
import { KEYS, KGRID } from "../scene/keys/plan";
import { ISLES } from "../scene/isles/plan";

/**
 * The town's census (src/gta): every one of the 10,000 zkSNARKs lives somewhere — most of them in
 * the centre (the heart, downtown, Shibuya, Wall Street), fewer out toward the ring road, a good many
 * on Orchard Keys' beaches and in its streets, some in Central Park. Deterministic (by the number):
 * the same faces in the same neighbourhood every visit, different ones elsewhere. The passers-by are
 * drawn from who lives where they are born; the beach's people from the beach's.
 */

export interface Area {
  key: string;
  name: string;
  /** Share of the 10,000 who live here (relative). */
  weight: number;
  /** How crowded its streets are (×, the game's passers-by). */
  density: number;
  inside(x: number, z: number): boolean;
}

const rect = (x0: number, x1: number, z0: number, z1: number) => (x: number, z: number) => x > x0 && x < x1 && z > z0 && z < z1;

/** Most particular first (the first that holds a point is its area). */
export const AREAS: Area[] = [
  // the islands round the city (src/scene/isles): their beaches and their towns
  ...ISLES.flatMap((i) => i.areas.map((a) => ({ key: a.key, name: a.name, weight: a.weight, density: a.density, inside: rect(a.box.x0, a.box.x1, a.box.z0, a.box.z1) }))),
  { key: "beach", name: "Orchard Beach", weight: 9, density: 1.05, inside: (x, z) => x > KEYS.x0 && x < KEYS.x1 && z > KGRID.south - 4 && z < KEYS.z1 },
  { key: "beachside", name: "Orchard Keys' sands", weight: 2, density: 0.8, inside: (x, z) => x > KEYS.x0 && x < KEYS.x1 && z > KGRID.north && z < KGRID.south && (x < KGRID.west || x > KGRID.east) },
  { key: "keys", name: "Orchard Keys", weight: 6, density: 0.9, inside: rect(KEYS.x0, KEYS.x1, KEYS.z0, KGRID.south) },
  { key: "heart", name: "The Heart", weight: 14, density: 1.35, inside: rect(CORE.minX, CORE.maxX, CORE.minZ - 4, CORE.maxZ + 4) },
  { key: "shibuya", name: "Shibuya", weight: 7, density: 1.3, inside: (x, z) => Math.hypot(x - ST.heartW, z - ST.blvdN) < 42 },
  { key: "wallst", name: "Wall Street", weight: 7, density: 1.15, inside: rect(ST.blvdE - 12, ST.ringE + 10, CORE.minZ - 8, CORE.maxZ + 8) },
  { key: "downtown", name: "Downtown", weight: 9, density: 1.15, inside: rect(ST.blvdW - 12, ST.blvdE + 12, CORE.minZ - 16, 60) },
  { key: "park", name: "Central Park", weight: 4, density: 0.8, inside: rect(GRID.park.x0 - 4, GRID.park.x1 + 4, GRID.park.z0 - 4, GRID.park.z1 + 4) },
  { key: "midtown", name: "Midtown", weight: 5, density: 0.95, inside: rect(ST.heartE, ST.ringE - 10, ST.ringN + 10, CORE.minZ) },
  { key: "uptown", name: "Uptown", weight: 4.5, density: 0.85, inside: rect(ST.ringW + 10, ST.heartE, ST.ringN + 10, ST.parkN) },
  { key: "west", name: "the West End", weight: 4, density: 0.85, inside: rect(ST.ringW + 10, ST.blvdW + 12, ST.parkN, 60) },
  { key: "south", name: "the South Bank", weight: 5, density: 0.9, inside: rect(ST.ringW + 10, ST.ringE - 10, 60, ST.ringS + 8) },
  { key: "ring", name: "the ring road", weight: 3, density: 0.55, inside: () => true },
];

const hash = (n: number) => {
  let h = Math.imul(n ^ 0x7f4a7c15, 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

let homes: Map<string, number[]> | null = null;
/** Who lives in each area (built once: every number placed by its own hash, weighted). */
export function residents(key: string): number[] {
  if (!homes) {
    homes = new Map(AREAS.map((a) => [a.key, [] as number[]]));
    const total = AREAS.reduce((s, a) => s + a.weight, 0);
    for (let id = 1; id <= 10000; id++) {
      let r = hash(id) * total;
      let a = AREAS[AREAS.length - 1];
      for (const b of AREAS) {
        if (r < b.weight) {
          a = b;
          break;
        }
        r -= b.weight;
      }
      homes.get(a.key)!.push(id);
    }
    // each area's list in its own shuffled order (not by number), still the same every visit
    for (const [k, list] of homes) list.sort((p, q) => hash(p * 31 + k.length) - hash(q * 31 + k.length));
  }
  return homes.get(key) ?? [];
}

/** The area at (x, z). */
export function areaAt(x: number, z: number): Area {
  return AREAS.find((a) => a.inside(x, z)) ?? AREAS[AREAS.length - 1];
}
