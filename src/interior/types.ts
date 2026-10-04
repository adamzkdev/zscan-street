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
  panel?: "bank" | "cards";
}

export interface InteriorContext {
  renderer: import("three").WebGLRenderer;
  /** Live street: mempool list, carriers, last block (see scene/director.ts). */
  director: Director;
  theme: Theme;
  /** Called on every new block, as soon as it is known (height, mining pool or null). */
  onBlock(fn: (height: number, pool: string | null) => void): void;
}

export interface Interior {
  readonly key: "mempool" | "cards" | "bank" | "factory" | "zsa" | "library";
  /** Shown top-left while inside ("zkCARDS"). */
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
  /** Day or night outside: interiors may change their windows / light. */
  setTheme?(theme: Theme): void;
}
