import type * as THREE from "three";
import type { City } from "../city";
import type { Director } from "../director";

/** What every part of the living city gets when it is built. */
export interface AliveCtx {
  scene: THREE.Scene;
  city: City;
  director: Director;
  /** A group inside the city's group (so night-only materials follow the theme). */
  group: THREE.Group;
  /** 0..1: how much of it the device can afford. */
  budget: number;
}

/** One frame, as each part sees it. */
export interface AliveFrame {
  dt: number;
  t: number;
  /** Where the camera looks (ground). */
  focus: THREE.Vector3;
  /** The camera's own position. */
  eye: THREE.Vector3;
  camera: THREE.Camera;
  night: boolean;
  /** The whole-city overview. */
  wide: boolean;
  /** On foot (street level). */
  walking: boolean;
}

export interface AlivePart {
  update(f: AliveFrame): void;
}
