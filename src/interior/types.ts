import type * as THREE from "three";
import type { Director } from "../scene/director";
import type { Theme } from "../scene/theme";

/**
 * Walk-in places. Entering one swaps the city for its own scene, bigger on the inside than the
 * facade (as in a game), where the viewer walks around with a first-person camera.
 */

/** One level of a building, reached by the elevator. */
export interface Floor {
  /** Short label for the elevator ("Ground", "3"). */
  label: string;
  /** What is on it ("Ranks 101–500"). */
  name: string;
  /** Floor height (metres) and where you step out of the elevator, looking along `yaw`. */
  y: number;
  spawn: THREE.Vector3;
  yaw: number;
}

/** Axis-aligned wall footprint on a floor: [x0, z0, x1, z1] in metres. */
export type Rect = [number, number, number, number];

/** What the info panel shows after a click on something inside. */
export interface PickInfo {
  eyebrow: string;
  title: string;
  /** Monospace title (ids, heights). */
  mono?: boolean;
  /** Image (a zkSNARK portrait) next to the title. */
  image?: string;
  /** Status tag: text and tone. */
  tag?: [string, "ok" | "warn" | "info" | "muted"];
  /** Up to four figures. */
  stats?: [string, string][];
  /** Extra HTML (rows, notes). Escape everything that comes from data. */
  body?: string;
  /** Main link, e.g. to ZScan. */
  link?: { href: string; label: string };
  /** Opens one of the shop panels (the bank's terminals). */
  panel?: "bank" | "cards" | "wallets" | "guestbook";
  /** The wallet on show that was clicked (the hall's phones). */
  wallet?: "zodl" | "vizor" | "noir" | "zapp";
  /** Starts a mini-game (the ZK TOWER's apartments). */
  game?: import("../ui/arcade").Game;
  /** Takes the elevator to this floor (clicking its doors). */
  floor?: number;
  /** Opens a book in the reader (the library's ZIPs). */
  book?: import("../ui/reader").Book;
}

export interface InteriorContext {
  renderer: import("three").WebGLRenderer;
  /** Live street: mempool list, carriers, last block (see scene/director.ts). */
  director: Director;
  theme: Theme;
  /** Called on every new block, as soon as it is known (height, mining pool or null). */
  onBlock(fn: (height: number, pool: string | null) => void): void;
  /**
   * The real city seen from a walk-in place: a panorama of the street rendered from the place's
   * position, `up` metres above the pavement (`back` metres behind its door). Use it as the
   * scene's background so the windows look onto ZStreet itself.
   */
  cityView(place: string, up: number, back?: number): import("three").Texture | null;
}

export interface Interior {
  readonly key: "mempool" | "factory" | "library" | "tower" | "museum" | "stadium" | "prison" | "mall" | "hotel" | "needle" | "pyramid" | "eiffel" | "colosseum" | "reserve" | "opera" | "bigben" | "statue" | "arab" | "gardens" | "palm" | "tower-orchard" | "tower-sapling" | "tower-halo" | "cemetery" | "zodl" | "vizor" | "noir" | "zapp" | "university";
  /** Shown top-left while inside ("MEMPOOL"). */
  readonly title: string;
  readonly scene: THREE.Scene;
  readonly floors: Floor[];
  /** Walls and furniture the walker cannot pass, per floor index. */
  colliders(floor: number): Rect[];
  /** Objects a click can hit; `pick` turns a hit into what the info panel shows. */
  pickables(): THREE.Object3D[];
  pick(hit: THREE.Intersection): PickInfo | null;
  /** Label for the hover tooltip, or null. */
  hover?(hit: THREE.Intersection): string | null;
  /** Every frame while inside (and only then). */
  update(dt: number, t: number, camera: THREE.PerspectiveCamera): void;
  /** The walker arrived on this floor (tall places only draw and light the floor you are on). */
  setFloor?(floor: number): void;
  /**
   * Places walked from level to level (stairs and ramps, no lift): the floor the walker is on now.
   * The manager follows it (the lift's panel, the soundscape) without moving the walker.
   */
  floorNow?(): number;
  /**
   * Floor height under (x, z) on this floor where it is not flat (stairs, ramps, a raised dais),
   * or null for the floor's own height. The walker climbs a step of up to 0.75 m.
   */
  groundAt?(floor: number, x: number, z: number): number | null;
  /**
   * Lift cars on a floor (see lift.ts): where they stand (`at`, or found automatically), which shaft
   * they belong to. Default: one lift on every floor (or the plan in liftplan.ts).
   */
  lifts?(floor: number): import("./lift").LiftDecl[];
  /** Stairs and escalators between two floors, walked in the place's own space (see lift.ts). */
  stairs?: import("./lift").StairDecl[];
  /** Day or night outside: interiors may change their windows / light. */
  setTheme?(theme: Theme): void;
}
