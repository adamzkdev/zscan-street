import type { StairDecl } from "../lift";

/**
 * The university's stair hall in numbers, and its flights for the lift plan (liftplan.ts). Kept apart
 * from stairs.ts, which builds it: the lift plan is loaded with the city, the university's code only
 * the first time it is entered.
 */

/** The opening in the front wall (x), the hall behind it (x, z), the landing's depth, a storey. */
export const OX0 = 8.5,
  OX1 = 12.5;
export const SX0 = 7.5,
  SX1 = 13.5,
  SZ1 = 8.5,
  LAND = 1.6,
  RISE = 3.6;
/** The flights: down on the left (west), up on the right, a stone parapet between them. */
export const DOWN: [number, number] = [SX0 + 0.1, 10.3];
export const UP: [number, number] = [10.7, SX1 - 0.1];

/** Where you arrive on a floor: coming up (the landing by its down flight), coming down (by its up flight). */
const cameUp = { x: (DOWN[0] + DOWN[1]) / 2, z: 0.9, yaw: 0 };
const cameDown = { x: (UP[0] + UP[1]) / 2, z: 0.9, yaw: 0 };

/** The flights of every floor, for the lift plan: up from each floor but the top, down from each but G. */
export function universityStairs(floors: number): StairDecl[] {
  const out: StairDecl[] = [];
  for (let f = 0; f < floors; f++) {
    if (f < floors - 1) out.push({ from: f, to: f + 1, kind: "stairs", zone: [UP[0], LAND, UP[1], SZ1 - 0.1], up: "+z", build: true, style: "stone", link: { rise: RISE, at: cameUp } });
    if (f > 0) out.push({ from: f, to: f - 1, kind: "stairs", zone: [DOWN[0], LAND, DOWN[1], SZ1 - 0.1], up: "+z", build: true, style: "stone", link: { rise: -RISE, at: cameDown } });
  }
  return out;
}
