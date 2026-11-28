/**
 * The islands round the city and the crossings that reach them (src/scene/isles): plain data, shared
 * by the scene, the game (roads, GPS, census, solid shape) and the maps. No DOM, no three.js here —
 * an island's content (its buildings, its landmarks) is loaded from its own folder by `load`.
 *
 * See RECIPE.md in this folder: adding an island is one descriptor (`<side>/plan.ts`) and its
 * content folder (`<side>/index.ts`), listed in ./plan.ts.
 */

/** A rectangle on the ground (world metres; +x east, +z south). */
export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Which side of the city an island lies on. */
export type Side = "east" | "west" | "north" | "south";

/** A street of an island's grid: its centre line (`at`), its run (`from`…`to`), its width. Axis "x" runs east–west. */
export interface IsleStreet {
  axis: "x" | "z";
  at: number;
  from: number;
  to: number;
  width: number;
  name: string;
}

/** A neighbourhood for the census and the passers-by (src/gta/census.ts): who lives there, how busy it is. */
export interface IsleArea {
  key: string;
  name: string;
  /** Share of the 10,000 zkSNARKs who live there (relative to the city's areas: the heart is 14). */
  weight: number;
  /** How crowded its pavements are (×). */
  density: number;
  box: Box;
}

/**
 * How a crossing is built:
 *  - "suspension": towers, main cables in catenary, hangers (the Golden Gate, the Rainbow Bridge);
 *  - "cable-stayed": a pylon or two, straight stays fanned to the deck;
 *  - "tunnel": a lit tube (its road under the sea), a portal at each end;
 *  - "bridge-tunnel": both on one course (Øresund): a bridge, an artificial island, then the tube.
 * The road under the wheels is the same for every kind: the course and its profile.
 */
export type CrossingKind = "suspension" | "cable-stayed" | "tunnel" | "bridge-tunnel";

/**
 * A crossing from the city's ring road to an island. Its course is a line of axis-aligned straight
 * runs with rounded corners (the game's streets are axis-aligned: each run is a street for the GPS),
 * its road's height a profile along it, its width a cross-section.
 */
export interface Crossing {
  key: string;
  name: string;
  kind: CrossingKind;
  /** The course's corners: the first in the city's street, the last in the island's (world x, z). */
  path: [number, number][];
  /** The corners' radius (m). */
  radius: number;
  /**
   * The road's height along the course: [s, y] key points (s metres from the start, y the surface),
   * eased between (a vertical curve at each, a straight grade between) — a third number, that key
   * point's own curve length (a long crest over a main span). Under the sea for a tunnel.
   */
  profile: ([number, number] | [number, number, number])[];
  /** The vertical curves' length at the key points without their own (m). */
  ease: number;
  /** Half widths from the centre line: the median, the carriageway, its barrier, the walkway's outer edge, the railing, the deck's edge. */
  section: { median: number; road: number; barrier: number; walk: number; rail: number; edge: number };
  /** Traffic lanes' centres from the centre line, each way (inner first). */
  lanes: number[];
  /** A suspension bridge's towers (s), their top (y), its anchorages (s): where the main cables go into the ground. */
  towers?: number[];
  top?: number;
  anchors?: [number, number];
  /** A tunnel's tube: from s0 to s1 (its portals); for "bridge-tunnel" the bridge is the rest. */
  tube?: [number, number];
  /** Colours and lights: the paint, and the night show along the cables; `tower` "gothic": stone towers with pointed arches (Brooklyn's way, crossings/brooklyn.ts). */
  style: { paint: string; night: "rainbow" | "white" | "gold"; tower?: "gothic" };
  /**
   * An elevated promenade down the middle, over the median (Brooklyn's): `half` its half width, `rise`
   * its floor over the road, `ramp` how long its ramps down to the road's level at each end (m).
   */
  promenade?: { half: number; rise: number; ramp: number; s0: number; s1: number };
}

/** The ground of an island: raised land (a kerb over the sea's level), beaches round it shelving into the sea. */
export interface IsleShore {
  /** Sand from the land's edge to the water (m), round the island. */
  beach: number;
  /** Wider beaches: a stretch of one side, and how wide its sand. */
  wide?: { side: "w" | "e" | "n" | "s"; from: number; to: number; width: number }[];
  /** The sea floor off it. */
  bed: number;
}

/** An island: where it is, its shore, its streets, its people, its crossing, and its content to load. */
export interface Isle {
  key: string;
  name: string;
  side: Side;
  /** Everything it holds (land, beaches, the shallows): its solid shape, its map, its LOD. */
  box: Box;
  /** The raised land (paved: the grid's blocks reach its edges). */
  land: Box;
  shore: IsleShore;
  /** The grid: every street runs edge to edge of the land (blocks between them). */
  streets: IsleStreet[];
  /** Lawns over a block (no paving): its parks. */
  parks: Box[];
  /**
   * Canals through the land, laid out like streets (a centre line, a run, a width): water at the sea's
   * level between stone quay walls, its bed below; where a street crosses one, the street's own deck
   * is the bridge (the content draws its parapets and arch). Not streets: no car, no GPS.
   */
  canals?: IsleStreet[];
  /** Hills on its blocks: a smooth mound `h` metres over the paving, `r` its foot's radius, `top` its flat top's (walked up; the content draws it). */
  hills?: { x: number; z: number; r: number; h: number; top?: number }[];
  /** How its streets are paved: "setts" (an old town's cobbles, no paint), else asphalt with its lines. */
  paving?: "setts";
  areas: IsleArea[];
  /** The map's colour for its name, and the names written on the map. */
  color: string;
  labels: { name: string; x: number; z: number }[];
  /** Its sound (src/audio/street.ts): the music drifting out of its bars and shops (tracks of the street's library), and how loud. */
  sound?: { tracks: string[]; level: number; bells?: boolean };
  crossing: Crossing;
  /**
   * Natural ground (a mountain, its foothills) outside the paved land: the ground is the higher of it
   * and the shore's (the beach, the sea floor). Pure and quick: the wheels and the feet ask it.
   */
  relief?: (x: number, z: number) => number;
  /**
   * Roads of its own off the grid (a mountain road): `line` from its foot (on one of the streets) to
   * its end, `holds` whether (x, z) is on it. The GPS takes it to and from anywhere along it.
   */
  routes?: { name: string; line: [number, number][]; holds(x: number, z: number): boolean }[];
  /** Its content (buildings, landmarks, props), built on the main thread once the city is up. */
  load: () => Promise<{ default: IsleContentBuilder }>;
}

/** What a content folder gets to build with (the island's ground and streets are already drawn). */
export interface IsleCtx {
  isle: Isle;
  /** The ground's height at (x, z): the land's paving, the streets, the beach, the sea floor. */
  ground(x: number, z: number): number;
  /** Is (x, z) on one of its streets' asphalt? */
  road(x: number, z: number): boolean;
  /** Give the main thread a breath (long builds are cut in slices). */
  yieldFrame(): Promise<void>;
}

/** A front door the game can walk into (src/gta: E at the door → the building's interior). */
export interface IsleFacade {
  /** The building's type for the interiors (shophouse, apartment, office, izakaya…). */
  type: string;
  face: "s" | "n" | "e" | "w";
  x0: number;
  x1: number;
  z: number;
  /** Which way the front faces (unit, on the ground). */
  out: { x: number; y: number; z: number };
  door: { x: number; z: number };
}

/** What a content builder hands back. */
export interface IsleContent {
  /** Its front doors (each faces its street). */
  facades: IsleFacade[];
  /** Cars parked along its kerbs (the game can take them). */
  parked: { obj: unknown; kind: string }[];
  /** Pavements of its own for the passers-by: [ax, az, bx, bz]. */
  walks: [number, number, number, number][];
  /** Animate (the wheel turning, the night's lights): called each frame while the island is near. */
  update?(dt: number, night: number): void;
  /** Places with a name (the map, the GPS's "landmark"): its landmarks. */
  places: { name: string; box: Box }[];
  /**
   * At the wheel on its own roads (a mountain road between its guardrails): hold the car (`p` moved
   * back between them) and answer true — the game's solid shape is not asked there. False: not ours.
   */
  hold?(p: { x: number; z: number }, r: number): boolean;
  /** Water of its own (a hot spring's pool): its floor and surface at (x, z), or null. */
  water?(x: number, z: number): { floor: number; surface: number } | null;
  /** On foot where the game's solid shape does not reach (its relief: the slopes, a terrace): a wall, a trunk at (x, z). */
  blocked?(x: number, z: number): boolean;
  /** Raised floors of its own on foot (a shrine's platform, a pier): the height at (x, z), or null. */
  floor?(x: number, z: number): number | null;
  /** Its street lamps' heads (world x, y, z and the bulb's colour): lit at night by the street's pool of lamp lights. */
  lamps?: [number, number, number, string][];
  /**
   * Its own people who stay put (src/gta/sitters.ts): seated at a café's terrace (`seatH` the seat over
   * the ground), standing behind a market stall (`stand`), facing `h` (people3d's heading); `area` the
   * census's neighbourhood they come from.
   */
  seats?: IsleSeat[];
}

/** One of an island's people who stays put: a café's chair, a stall's counter. */
export interface IsleSeat {
  x: number;
  z: number;
  y: number;
  h: number;
  seatH?: number;
  stand?: boolean;
  area: string;
}

export type IsleContentBuilder = (ctx: IsleCtx, root: unknown) => Promise<IsleContent>;
