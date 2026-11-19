/**
 * ZK PARTY's boards, as data: the paths of spaces (a directed graph), the islands they stand on,
 * the landmarks along them and the board's gimmicks. Pure data (no three, no DOM): the rules
 * (core.ts) read the graph, the 3D view (view.ts) builds the world from all of it.
 *
 * A path is a run of spaces spread evenly along its control points, first to last; one letter
 * per space:
 *   b blue (+3 coins) · r red (−3) · l lucky · s item shop · x THE TRACKER · v VS duel
 *   m metro station (an event: the ZEC LINE) · k drawbridge lever (an event) · w hash wheel (an event)
 *   o sky wheel gate (an event: ride it) · t storm (an event: the MONSOON floods the low paths)
 *   e the NU7 TOWER LIFT (an event: ride it) · z BLIZZARD (an event: NU7 QUARTER's snowstorm)
 * Its last space leads to the first space of each path in `next` (two or more: a junction, the
 * player picks), or into another path part way (`at`), by a zipline (`zip`), behind a toll (`toll`
 * coins) or over the drawbridge (`gate`, closed while the bridge is up).
 */
// (each board in its own file, board/maps/<key>.ts, listed in MAPS below; its look in board/art/<key>.ts)
import { GENESIS } from "./maps/genesis";
import { SINGAPORE } from "./maps/singapore";
import { ASTANA } from "./maps/astana";
export { GENESIS, SINGAPORE, ASTANA };

export interface NextDef {
  to: string;
  /** Enter that path at this space (default 0). */
  at?: number;
  /** A one-way zipline ride (one step, a long slide). */
  zip?: boolean;
  /** Coins to pay to take it. */
  toll?: number;
  /** Closed while the drawbridge is up ("bridge"); while the canal's ice is broken ("ice", NU7 QUARTER). */
  gate?: "bridge" | "ice";
}

export interface PathDef {
  id: string;
  /** Control points (x, z), metres; the spaces are spread evenly from the first to the last. */
  pts: [number, number][];
  /** The spaces' height (default 0). */
  y?: number;
  kinds: string;
  next: (string | NextDef)[];
  /** Its spaces stand on the drawbridge's leaves. */
  bridge?: boolean;
  /** Spaces (indices) the Z-Block may sit on (blue ones). */
  q?: number[];
  /** Metro stations along it (index → name). */
  stations?: Record<number, string>;
  /** How the junction arrows name it (en, zh). */
  name?: [string, string];
  /** Its spaces stand on a wooden pier. */
  pier?: boolean;
  /** (NU7 QUARTER) Its spaces lie on a frozen canal: nobody stops on them (you slide on to the far bank), and every slider cracks the ice a little more. */
  ice?: boolean;
  /** (MARINA NIGHTS) Low ground by the water: a MONSOON floods it (letter t: the storm space). */
  low?: boolean;
}

/** A floating island: its outline (x, z) and the colour of its top. */
export interface IslandDef {
  pts: [number, number][];
  top: string;
  /** Its top's height (default 0). */
  y?: number;
  /** How far its rock hangs under it (m). */
  depth: number;
}

export type LandmarkKind =
  | "foundry"
  | "mempool"
  | "needle"
  | "prison"
  | "docks"
  | "station"
  | "tollgate"
  | "lighthouse"
  | "houses"
  | "trees"
  | "falls"
  | "control"
  | "monument"
  | "garden"
  // (art only from here: the set dressing the rules never read)
  | "startgate"
  | "fountain"
  | "crane"
  | "containers"
  | "warehouse"
  | "boats"
  | "neon"
  | "billboard"
  | "district"
  | "park"
  | "woods"
  | "beach"
  | "turbine"
  | "windmill"
  | "islets"
  | "crowd"
  | "watchtower"
  | "campfire";

export interface LandmarkDef {
  /** One of the shared kinds, or a board's own (its art module builds it: board/art/<key>.ts). */
  kind: LandmarkKind | (string & {});
  x: number;
  z: number;
  /** Its facing (radians, yaw). */
  rot?: number;
  /** A size factor or a count. */
  s?: number;
  label?: string;
  /** (art) An outline or a line (a wood, a beach), a height (a tower). */
  pts?: [number, number][];
  h?: number;
  /** (art) How much ground round it nothing else may take (m; the shared kinds know their own). */
  keep?: number;
  /** (art) A colour for it. */
  c?: string;
}

/** (art) What the ground is painted with there: a circle (x, z, r) or an outline (pts); a line `w` wide for sand. */
export interface FloorDef {
  kind: "plaza" | "yard" | "quay" | "slate" | "tiles" | "neon" | "sand" | "meadow" | "forest" | "square";
  x?: number;
  z?: number;
  r?: number;
  pts?: [number, number][];
  w?: number;
}

/**
 * (art) A board's look, all optional (the shared kit, decor.ts, falls back on GENESIS HARBOR's
 * sunset): the sky dome and lights, the ground, the built path, the cliffs, the water, the trees,
 * the lamps, the clouds. Colours are CSS strings.
 */
export interface ArtStyle {
  /** The sky dome's bands, top to horizon (top, middle, low, horizon); how many stars (0…1). */
  dome?: [string, string, string, string];
  stars?: number;
  /** The fog's colour, start, end (m). */
  fog?: [string, number, number];
  /** The hemisphere light (sky, ground, intensity), the key light (colour, intensity, position), the rim light from behind (colour, intensity). */
  hemi?: [string, string, number];
  key?: [string, number, [number, number, number]];
  rim?: [string, number];
  /** The painted ground: its base, soft patches, blades; the paths' worn beds (outer, inner); the islands' edge band. */
  ground?: string;
  patches?: string[];
  blades?: string[];
  beds?: [string, string];
  edge?: string;
  /** The built path: paver colours, mortar; curbs (two tints); the spaces' plinths (top, foot); the arrows. */
  pavers?: string[];
  mortar?: string;
  curbs?: [string, string];
  plinth?: [string, string];
  arrow?: string;
  /** The cliffs: the lip (grass, snow…), earth, strata top to bottom (six), crystals (two). */
  lip?: string;
  earth?: [string, string];
  strata?: string[];
  crystals?: [string, string];
  /** Water: deep, shallow, foam. */
  water?: [string, string, string];
  /** Trees: crown colours, the share of pines (0…1), snow on them. */
  greens?: string[];
  pines?: number;
  snow?: boolean;
  /** Lamps' light; night (lamp pools and windows stronger). */
  lamp?: string;
  night?: boolean;
  /** The cloud sea's puffs, the high clouds' tints; the far city round the horizon (lit at night, by day, none). */
  puffs?: string[];
  clouds?: string[];
  city?: "night" | "day" | "none";
  /** How many terraced mounds the kit scatters on open lawn. */
  terraces?: number;
}

export interface MapDef {
  key: string;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  /** The sky: top, horizon; the sun's colour; the cloud sea's. */
  sky: [string, string];
  sun: string;
  sea: string;
  paths: PathDef[];
  /** The players start on this path's first space. */
  start: string;
  islands: IslandDef[];
  landmarks: LandmarkDef[];
  /** The metro's loop (x, z, and its height there if not `y`): the train runs round it, stopping at the stations. */
  metro?: { track: ([number, number] | [number, number, number])[]; y: number; name: string };
  /** The drawbridge: its path; the hinges' z either side of the chasm, at x. */
  drawbridge?: { path: string; x: number; z0: number; z1: number; head: string };
  /** The hash wheel: where it stands, facing. */
  wheel?: { x: number; z: number; rot: number };
  /** The zipline's top (where the cable starts, high on a landmark). */
  zipTop?: [number, number, number];
  /** Where the four line up for the ceremony (the camera looks from the south). */
  stage?: { x: number; z: number };
  /** (art) The ground's paint: plazas, yards, quays, beaches. */
  floors?: FloorDef[];
  /** (art) The harbour's water basin (an outline, its surface's height), hung off the islands. */
  lagoon?: { pts: [number, number][]; y: number };
  /** (art) Its look (see ArtStyle; GENESIS HARBOR's sunset when left out). */
  art?: ArtStyle;
  /** (art) The intro's fly-over: the zones it shows, in order (a name, en and zh; where the camera looks from and at). */
  tour?: { n: [string, string]; eye: [number, number, number]; at: [number, number, number] }[];
  /** (NU7 QUARTER) The NU7 TOWER LIFT: the tower it rides up (x, z, the cabin's height at the top), the drop zones it glides you down to (a path's space; a name, en and zh). */
  lift?: { x: number; z: number; top: number; drops: { path: string; at: number; n: [string, string] }[] };
  /** ZEE's welcome, line by line (en, zh; GENESIS HARBOR's when left out). */
  intro?: [string, string][];
  /** The item shops' names by path (en, zh). */
  shops?: Record<string, [string, string]>;
  /**
   * (MARINA NIGHTS) The sky wheel (letter o: its boarding gate): where it stands, its facing; the
   * stops it sets riders down at (a path's space), one each turn in turn (turn 1 the first).
   */
  ride?: { x: number; z: number; rot: number; stops: { path: string; at: number; n: [string, string] }[] };
  /** (audio) Its ambience bed under the board's music (src/audio/kinds.ts; GENESIS HARBOR's "sea" when left out). */
  ambience?: import("../../audio/kinds").AmbienceKind;
}

export const MAPS: MapDef[] = [GENESIS, ASTANA, SINGAPORE];
export const mapOf = (key: string) => MAPS.find((m) => m.key === key) ?? GENESIS;
