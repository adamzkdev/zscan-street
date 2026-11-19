/**
 * A SNARK KART course: a track (its spline and features, track.ts), its look (scenery.ts Theme), the
 * scenery built round it, its water, its weather, its music, its names.
 */
import type * as THREE from "three";
import type { SongKey } from "../../music";
import type { Fx3 } from "../../k3";
import type { Kit, Theme } from "./scenery";
import type { Track, TrackSpec } from "./track";
import type { AmbienceKind } from "../../../audio/kinds";

/** What a course's weather and animations see of the race each frame. */
export interface RaceCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  trk: Track;
  fx: Fx3;
  /** Race time (s) and wall time (s, from the card on). */
  t: number;
  wall: number;
  /** The kart the camera follows: where it is, how fast. */
  focus: { x: number; y: number; z: number; yaw: number; speed: number; seg: number; on: number; air: boolean };
  /** The gusts now: 0 calm, a warning 0..1 before one, the push 0..1 while it blows; which way. */
  gust: { warn: number; k: number; side: number };
  /** The light, for a flash. */
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  shake(a: number): void;
  /** A white flash over the screen (lightning), 0..1. */
  flash(a: number): void;
  /** Whether the race runs (not the card, not the count). */
  playing: boolean;
}

/** Words a course puts on the HUD (its intro, its hazards). */
export interface Course {
  key: string;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  spec: TrackSpec;
  theme: Theme;
  song: SongKey;
  ambience: AmbienceKind;
  /** The gantry's words over the start line, and the stands'. */
  gantry: [string, string];
  /** The scenery round the road: landmarks, the city, signs, stands. */
  scenery(b: Kit): void;
  /** Ponds, lakes, rivers and canals (outlines, x and −z): holes in the ground, water under them. */
  water?(tr: Track): THREE.Vector2[][];
  /** Weather and moving things, every frame (from the card on). */
  tick?(r: RaceCtx, dt: number): void;
  /** Free what tick made outside the scene. */
  dispose?(): void;
  /** Its landmarks (x, z, radius): the city keeps clear of them. */
  marks?: [number, number, number][];
  /** The card's slow flight: round this point, this far, this high. */
  orbit?: { x: number; z: number; r: number; h: number };
  /** Off the road (grass, snow): the top speed's factor (default 0.55). */
  offK?: number;
  /** Splash particles' colours (the water's, or the snow's). */
  splash?: string[];
  /** What the wheels kick up on the road (dust, snow powder). */
  dust?: string[];
  /** What the wheels throw off the road. */
  offColors?: string[];
  /** The HUD's minimap colours: road, shortcut. */
  mapColors?: [string, string];
}
