/**
 * What a mini-game is. Each file in src/tv/minigames/games/ default-exports a `MiniDef`; the
 * runner (runner.ts) shows its intro card, counts 3-2-1, steps `update(dt)` until `finished`,
 * then asks `result()`.
 */
import type * as THREE from "three";
import type { CharInfo } from "../shared/chars";
import type { SongKey } from "../engine/audio";
import type { Hud } from "../engine/hud";
import type { PadState } from "../engine/input";

/**
 * - ffa:  4 players, every one for themself
 * - 2v2:  players[0,1] are team 0, players[2,3] team 1
 * - 1v3:  players[0] alone (team 0) against players[1,2,3] (team 1)
 * - duel: 2 players
 */
export type MiniMode = "ffa" | "2v2" | "1v3" | "duel";

export interface MiniPlayer {
  /** Index in `ctx.players` (what `result().place` is indexed by). */
  i: number;
  /** Same as `i` (kept for the HUD: `hud.setScore(p.seat, …)` and `hud.setScore(i, …)` are the same card). */
  seat: number;
  char: CharInfo;
  /** Display name (the player's own, or the character's). */
  name: string;
  /** Played by the computer: the game must drive it (see BaseMini.cpu). */
  cpu: boolean;
  /** CPU skill 0..1 (0.3 easy, 0.6 normal, 0.9 hard). */
  level: number;
  /** Team: ffa → own index; 2v2 → 0/1; 1v3 → 0 for the solo, 1 for the trio; duel → 0/1. */
  team: number;
}

export interface MiniResult {
  /** Finishing place per player (indexed like ctx.players): 1 = winner. Ties share a place. */
  place: number[];
  /** Optional: coins collected inside the game (shown on the results). */
  coins?: number[];
}

export interface MiniCtx {
  players: MiniPlayer[];
  mode: MiniMode;
  seed: number;
  /** A human player's controller (neutral for CPUs: BaseMini handles them). */
  input(i: number): PadState;
  /** Vibrate a player's phone. */
  buzz(i: number, ms?: number | number[]): void;
  /** The HTML layer over the 3D for this game (cleared by the runner afterwards). */
  hud: Hud;
}

export interface MiniGame {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Every frame before GO (intro card, countdown): idle animations, a camera fly-in. */
  preview?(dt: number): void;
  /** Once, at GO. */
  start?(): void;
  /** Every frame while playing (dt in seconds, ≤ 1/20). */
  update(dt: number): void;
  /** True once the game is over (then `result()` is read). */
  readonly finished: boolean;
  result(): MiniResult;
  /** Every frame after the end, while "TERMINÉ !" and the winners' celebration show. */
  outro?(dt: number): void;
  dispose(): void;
}

export interface MiniControls {
  /** What the stick does ("Se déplacer"); omit if unused. */
  stick?: string;
  /** What A does; omit if unused. */
  a?: string;
  /** What B does; omit if unused. */
  b?: string;
  /** The phone shows one huge A button (mashing games). */
  mash?: boolean;
}

export interface MiniDef {
  /** Kebab-case id, the same as the file name. */
  id: string;
  /** French title. */
  name: string;
  icon: string;
  /** Card colour. */
  color: string;
  /** One short line (menus). */
  tagline: string;
  /** The rules, 1–3 short sentences (intro card). */
  rules: string;
  controls: MiniControls;
  modes: MiniMode[];
  /** Rough length in seconds. */
  length: number;
  /** Music while playing (default "mini"; null = silence, the game makes its own). */
  music?: SongKey | null;
  create(ctx: MiniCtx): MiniGame;
}
