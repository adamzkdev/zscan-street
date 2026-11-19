/** What a PROVE THE BLOCK level's set builder gets, and what it gives back. */
import type * as THREE from "three";
import type { Rnd } from "../../kit";

export interface SetCtx {
  /** The world (fixed): the sky, the city, the landmarks. */
  scene: THREE.Scene;
  /** The arena's frame: the floor and everything on it (it turns, on a turntable). */
  table: THREE.Group;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  rnd: Rnd;
  ink: THREE.Material;
  /** The nine pads' sigils (7×7: 1 a mark, 2 an eye). */
  sig: Uint8Array[];
}

/** The set's view of the match, every frame. */
export interface SetState {
  t: number;
  /** The table's turn (rad/s, signed: + anticlockwise seen from above) and a reversal coming (0…1). */
  spin: number;
  warn: number;
  /** Lights out (0…1), a lightning flash (0…1), thunder coming (0…1). */
  dark: number;
  flash: number;
  rumble: number;
  /** The run is on (the proof hidden, everyone racing). */
  run: boolean;
}

export interface SetLive {
  tick(dt: number, s: SetState): void;
}
