/** What a MEMPOOL RUSH level's set builder gets, and what it sees of the match every frame. */
import type * as THREE from "three";
import type { Player, Rnd } from "../../kit";

export interface PoolCtx {
  scene: THREE.Scene;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  rnd: Rnd;
  ink: THREE.Material;
  players: Player[];
  /** The floor's half width and half depth (the snarks and the parcels keep in). */
  xw: number;
  zd: number;
  /** The crates' places at rest, the intake pads'. */
  crates: readonly (readonly [number, number])[];
  pads: readonly (readonly [number, number])[];
}

export interface PoolState {
  t: number;
  /** The crates where they are now (they ride barges at the docks). */
  cx: number[];
  cz: number[];
  /** The belts' speed (m/s, signed along x: + to the right) and a reversal coming (0…1). */
  belt: number;
  warn: number;
  playing: boolean;
}

export interface PoolLive {
  tick(dt: number, s: PoolState): void;
  /** A parcel fell in (the water, a furnace) at (x, z): the set's own splash. */
  sink?(x: number, z: number): void;
}
