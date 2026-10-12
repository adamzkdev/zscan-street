import type { StairDecl } from "../lift";
import type { SkyKit } from "../zktowers/kit";
import { FLOORS } from "./quad";
import { OLD_GOLD, SAND, SAND_LT, TILE, WOOD_DK } from "./style";

/**
 * The university's stair hall: the same core on every floor, behind the front wall right of the
 * entrance (the lifts are on the left), so walking up goes 1, 2, 3… like any building. Through the
 * opening, a landing, then two flights side by side: up on the right to the floor above, down on
 * the left into the well to the floor below. Each floor is its own room at a notional height, so a
 * flight climbs (or drops) one storey's worth and the walker arrives on the next floor's landing,
 * right where that floor's own flight would have brought them.
 */

/** The opening in the front wall (x), the hall behind it (x, z), the landing's depth, a storey. */
const OX0 = 8.5,
  OX1 = 12.5;
const SX0 = 7.5,
  SX1 = 13.5,
  SZ1 = 8.5,
  LAND = 1.6,
  RISE = 3.6;
/** The flights: down on the left (west), up on the right, a stone parapet between them. */
const DOWN: [number, number] = [SX0 + 0.1, 10.3];
const UP: [number, number] = [10.7, SX1 - 0.1];

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

/**
 * The front wall of a floor with the stair opening in it (and, on G only, the entrance doors in the
 * middle: upstairs that wall is closed), then the stair hall behind it. `y`/`h`: the wall's foot and
 * height (the lecture halls' walls start under the landing, at the stage).
 */
export function frontWallAndStairs(k: SkyKit, f: number, o: { x0: number; x1: number; z: number; h: number; y?: number; color?: string; door?: boolean; top: number }) {
  const { x0, x1, z, h } = o;
  const y = o.y ?? 0;
  const color = o.color ?? SAND;
  if (o.door) {
    k.wall(f, x0, z, -2.2, z, h, color, "matte", 0.4, y);
    k.wall(f, 2.2, z, OX0, z, h, color, "matte", 0.4, y);
  } else k.wall(f, x0, z, OX0, z, h, color, "matte", 0.4, y);
  k.wall(f, OX1, z, x1, z, h, color, "matte", 0.4, y);
  // the lintel over the stair opening, a round-arched stone frame like the quad's arcades
  k.box(f, OX1 - OX0, h + y - 3.6, 0.4, (OX0 + OX1) / 2, 3.6, z, color);
  k.box(f, OX1 - OX0 + 0.5, 0.3, 0.5, (OX0 + OX1) / 2, 3.4, z, SAND_LT);
  for (const x of [OX0, OX1]) k.box(f, 0.35, 3.4, 0.5, x, 0, z, SAND_LT);
  const up = f < o.top ? FLOORS[f + 1] : null;
  const down = f > 0 ? FLOORS[f - 1] : null;
  // over the opening, from the room: the floor you are on, where the stairs go
  k.label(f, `STAIRS  ${up ? `▲ ${up[0]}` : ""}${up && down ? "  " : ""}${down ? `▼ ${down[0]}` : ""}`, (OX0 + OX1) / 2, 3.95, z - 0.25, { h: 0.3, color: OLD_GOLD, ry: Math.PI });
  stairHall(k, f, up, down);
}

/** The doorways at the flights' ends: their width and height, the corridor behind each (depth, width, height). */
const DW = 1.6,
  DH = 2.6,
  CD = 3.4,
  CW = 2.4,
  CH = 3.0;
const FLOOR_C = "#c9b48a";

function stairHall(k: SkyKit, f: number, up: (typeof FLOORS)[number] | null, down: (typeof FLOORS)[number] | null) {
  const H = 8;
  const ux = (UP[0] + UP[1]) / 2,
    dx = (DOWN[0] + DOWN[1]) / 2;
  // the side walls, the ceiling; the landing and the floor under the up flight (the down flight's well is open)
  k.wall(f, SX0, 0, SX0, SZ1, H, SAND, "matte", 0.3);
  k.wall(f, SX1, 0, SX1, SZ1, H, SAND, "matte", 0.3);
  k.box(f, SX1 - SX0, 0.3, SZ1, (SX0 + SX1) / 2, H, SZ1 / 2, WOOD_DK);
  for (let z = 1.5; z < SZ1; z += 2.4) k.box(f, SX1 - SX0, 0.35, 0.25, (SX0 + SX1) / 2, H - 0.35, z, "#4a2f1e");
  k.box(f, SX1 - SX0, 0.1, LAND, (SX0 + SX1) / 2, -0.1, LAND / 2, FLOOR_C, "polish");
  k.box(f, SX1 - DOWN[1], 0.1, SZ1 - LAND, (DOWN[1] + SX1) / 2, -0.1, (LAND + SZ1) / 2, FLOOR_C, "polish");
  // a skirting of dark wood and the brick-red band of the quad, all round
  for (const [x, z, w, d] of [
    [SX0 + 0.16, SZ1 / 2, 0.04, SZ1],
    [SX1 - 0.16, SZ1 / 2, 0.04, SZ1],
  ] as const) {
    k.box(f, w, 0.18, d, x, H - 1.0, z, TILE);
  }
  // the end wall, with a doorway at the head of the up flight (into the next floor's corridor)
  const endZ = SZ1;
  if (up) {
    k.box(f, ux - DW / 2 - SX0, H, 0.3, (SX0 + ux - DW / 2) / 2, 0, endZ, SAND);
    k.box(f, SX1 - (ux + DW / 2), H, 0.3, (ux + DW / 2 + SX1) / 2, 0, endZ, SAND);
    k.box(f, DW, RISE, 0.3, ux, 0, endZ, SAND);
    k.box(f, DW, H - RISE - DH, 0.3, ux, RISE + DH, endZ, SAND);
  } else k.box(f, SX1 - SX0, H, 0.3, (SX0 + SX1) / 2, 0, endZ, SAND);
  k.solid(f, SX0, endZ - 0.15, SX1, endZ + 0.15);
  // the parapet between the flights, down into the well and up beside the climb
  k.box(f, UP[0] - DOWN[1], 1.05 + RISE, SZ1 - LAND, (DOWN[1] + UP[0]) / 2, -RISE, (LAND + SZ1) / 2, SAND_LT);
  if (down) {
    // the well: its side wall, its head under the landing's edge, its end with the doorway at the foot
    k.box(f, 0.2, RISE, SZ1 - LAND, SX0 + 0.1, -RISE, (LAND + SZ1) / 2, SAND);
    k.box(f, DOWN[1] - SX0, RISE, 0.1, (SX0 + DOWN[1]) / 2, -RISE, LAND - 0.05, SAND);
    k.box(f, dx - DW / 2 - SX0, RISE, 0.3, (SX0 + dx - DW / 2) / 2, -RISE, endZ, SAND);
    k.box(f, DOWN[1] - (dx + DW / 2), RISE, 0.3, (dx + DW / 2 + DOWN[1]) / 2, -RISE, endZ, SAND);
    k.box(f, DW, RISE - DH, 0.3, dx, -RISE + DH, endZ, SAND);
    k.box(f, DOWN[1] - DOWN[0], 0.1, 1.2, dx, -RISE - 0.1, SZ1 - 0.6, FLOOR_C);
    corridor(k, f, dx, -RISE, down, "▼");
  } else {
    // G: no flight down, the floor runs on
    k.box(f, DOWN[1] - SX0, 0.1, SZ1 - LAND, (SX0 + DOWN[1]) / 2, -0.1, (LAND + SZ1) / 2, FLOOR_C, "polish");
    k.solid(f, SX0, LAND, DOWN[1], SZ1);
    bench(k, f, dx);
  }
  if (up) {
    corridor(k, f, ux, RISE, up, "▲");
  } else {
    // the top floor: nothing above, a bench where the flight would start
    k.solid(f, UP[0], LAND, SX1, SZ1);
    bench(k, f, ux);
  }
  // the floor's number, large, high on the end wall: you always know where you are
  k.label(f, FLOORS[f][0], (SX0 + SX1) / 2, 6.6, SZ1 - 0.2, { h: 1.1, color: OLD_GOLD, ry: Math.PI });
  // lamps under the ceiling, and the light over the flights (it reaches into the corridors' mouths)
  for (const z of [2.5, 6.2]) k.box(f, 1.4, 0.06, 0.5, (SX0 + SX1) / 2, H - 0.2, z, "#fff1d0", "glow");
  k.light(f, (SX0 + SX1) / 2, 6.2, 6.0, "#ffe7c0", 9, 14);
}

/**
 * The corridor behind a doorway at a flight's end: a few metres of the next floor's hall, lit, its
 * name and an arrow on the wall at the end (where it turns towards the room), so the doorway opens
 * onto somewhere instead of a black hole. The walker never goes in: the floor changes at the step
 * before (lift.ts: a linking flight's head).
 */
function corridor(k: SkyKit, f: number, x: number, y: number, to: (typeof FLOORS)[number], arrow: string) {
  const z0 = SZ1 + 0.15,
    z1 = z0 + CD;
  const x0 = x - CW / 2,
    x1 = x + CW / 2;
  const accent = to[3];
  // the doorway's stone frame, on the stair side
  k.box(f, DW + 0.5, 0.25, 0.2, x, y + DH, SZ1 - 0.25, SAND_LT);
  for (const s of [-1, 1]) k.box(f, 0.25, DH, 0.2, x + s * (DW / 2 + 0.12), y, SZ1 - 0.25, SAND_LT);
  k.label(f, `${arrow} ${to[0]} · ${to[1].toUpperCase()}`, x, y + DH + 0.45, SZ1 - 0.37, { h: 0.2, color: OLD_GOLD, ry: Math.PI });
  // floor, ceiling, the walls: the east one stops short, the corridor turns there towards the room
  k.box(f, CW, 0.1, CD, x, y - 0.1, (z0 + z1) / 2, FLOOR_C);
  k.box(f, CW + 1.6, 0.2, CD, x - 0.8, y + CH, (z0 + z1) / 2, SAND_LT);
  k.box(f, 0.2, CH, CD, x0 - 0.1, y, (z0 + z1) / 2, SAND);
  k.box(f, 0.2, CH, CD - 1.7, x1 + 0.1, y, z0 + (CD - 1.7) / 2, SAND);
  // the turn: a short stub of floor to the east, closed by a wall further on
  k.box(f, 1.7, 0.1, 1.7, x1 + 0.85, y - 0.1, z1 - 0.85, FLOOR_C);
  k.box(f, 1.7, 0.2, 1.7, x1 + 0.85, y + CH, z1 - 0.85, SAND_LT);
  k.box(f, 0.2, CH, 1.7, x1 + 1.8, y, z1 - 0.85, SAND_LT);
  k.box(f, 1.7, CH, 0.2, x1 + 0.85, y, z1 - 1.8, SAND);
  // the end wall: the floor's colour in a band, its number and name, an arrow round the corner
  k.box(f, CW + 1.9, CH, 0.2, x + 0.85, y, z1 + 0.1, SAND_LT);
  k.box(f, CW, 0.14, 0.04, x, y + 1.15, z1 - 0.02, accent, "glow");
  k.label(f, to[0], x - 0.45, y + 1.95, z1 - 0.05, { h: 0.62, color: accent, ry: Math.PI, glow: false });
  k.label(f, `${to[1]} →`, x + 0.15, y + 1.5, z1 - 0.05, { h: 0.19, color: "#3a2416", ry: Math.PI, glow: false });
  // a skirting, a ceiling lamp
  k.box(f, CW, 0.14, 0.03, x, y, z1 - 0.01, WOOD_DK);
  k.box(f, 0.9, 0.05, 0.9, x, y + CH - 0.05, (z0 + z1) / 2, "#fff1d0", "glow");
}

/** A stone bench (where a flight would be on G and the top floor). */
function bench(k: SkyKit, f: number, x: number) {
  k.box(f, 1.7, 0.45, 0.6, x, 0, SZ1 - 1.0, SAND_LT);
  k.box(f, 1.9, 0.08, 0.7, x, 0.45, SZ1 - 1.0, WOOD_DK, "polish");
  k.solid(f, x - 0.95, SZ1 - 1.35, x + 0.95, SZ1 - 0.65);
}
