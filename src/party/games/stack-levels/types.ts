/** What a CHAIN STACK level's set builder gets, and what it sees of the match every frame. */
import type * as THREE from "three";
import type { Player, Rnd } from "../../kit";

export interface StackCtx {
  scene: THREE.Scene;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  rnd: Rnd;
  ink: THREE.Material;
  players: Player[];
  /** Each seat's tower's x (its pad's middle). */
  tx: number[];
}

export interface StackState {
  t: number;
  /** Each seat's ship's roll (rad: + leans its tower's top toward +x). */
  roll: number[];
  /** The storm's strength (0…1), a lightning flash (0…1). */
  storm: number;
  flash: number;
  playing: boolean;
}

export interface StackLive {
  tick(dt: number, s: StackState): void;
}
