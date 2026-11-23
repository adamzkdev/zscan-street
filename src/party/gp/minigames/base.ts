/**
 * `BaseMini`: what almost every mini-game builds on. It owns the scene (lit, with a sky), the
 * camera, particles, the avatars, CPU input and the ending.
 *
 *   class MyGame extends BaseMini {
 *     constructor(ctx: MiniCtx) {
 *       super(ctx, { sky: ["#5fb8ff", "#d6f0ff"], size: 14 });
 *       // build the arena in this.scene, spawn avatars: this.spawn(i, x, z)
 *       this.hud.players(this.players, (p) => "0");
 *       this.setCam([0, 16, 14], [0, 0, 0]);
 *     }
 *     protected cpu(i: number, dt: number): CpuPad { return { x: 1, a: this.mashing(i, 6) }; }
 *     protected step(dt: number) {
 *       const p = this.pad(0);             // { x, y, a, b, aDown, bDown, aUp, bUp } — CPUs included
 *       … game logic …
 *       if (done) this.finishByScore(scores);
 *     }
 *   }
 */
import * as THREE from "three";
import { Avatar, type AvatarOpts } from "../engine/chars3d";
import { Fx } from "../engine/fx";
import { disposeScene, makeStage, type StageOpts } from "../engine/gfx";
import type { Hud } from "../engine/hud";
import { NEUTRAL, type PadState } from "../engine/input";
import { damp, rng, type Rnd } from "../engine/util";
import { sfx, type SfxName } from "../engine/audio";
import type { MiniCtx, MiniGame, MiniPlayer, MiniResult } from "./types";

/** What a CPU holds this frame (missing = released / centred). */
export interface CpuPad {
  x?: number;
  y?: number;
  a?: boolean;
  b?: boolean;
}

/** Places from scores (higher is better unless `lower`): 1,1,3,4 for ties. */
export function placesFromScores(scores: number[], lower = false): number[] {
  return scores.map((s) => 1 + scores.filter((o) => (lower ? o < s : o > s)).length);
}

export abstract class BaseMini implements MiniGame {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fx: Fx;
  readonly hud: Hud;
  readonly ctx: MiniCtx;
  readonly players: MiniPlayer[];
  /** Seeded random for the game's layout/events (use it rather than Math.random for fairness). */
  readonly rnd: Rnd;
  /** One avatar per player once spawned (index = player index). */
  readonly avatars: Avatar[] = [];
  /** Seconds since GO. */
  t = 0;
  private _done = false;
  private _res: MiniResult | null = null;
  private _pads: PadState[] = [];
  private _cpuPrev: { a: boolean; b: boolean }[] = [];
  private _delays = new Map<string, number>();
  private _mashPh: number[] = [];
  /** Camera shake strength (decays by itself): `this.shake = 0.4`. */
  shake = 0;
  private _shakeOff = new THREE.Vector3();
  private _camPos = new THREE.Vector3();
  private _camLook = new THREE.Vector3();
  private _outroSet = false;

  constructor(ctx: MiniCtx, stage: StageOpts = {}) {
    this.ctx = ctx;
    this.players = ctx.players;
    this.hud = ctx.hud;
    this.rnd = rng(ctx.seed);
    const st = makeStage(stage);
    this.scene = st.scene;
    this.camera = st.camera;
    this.sun = st.sun;
    this.hemi = st.hemi;
    this.fx = new Fx(this.scene);
    this._cpuPrev = this.players.map(() => ({ a: false, b: false }));
    this._mashPh = this.players.map(() => Math.random());
  }

  get finished() {
    return this._done;
  }

  // ------------------------------------------------------------ input

  /** Player i's controller this frame: a human's pad, or what `cpu()` decided for a CPU. */
  pad(i: number): PadState {
    return this._pads[i] ?? NEUTRAL;
  }

  /** Override: what CPU player i does this frame (called once per frame for each CPU). */
  protected cpu(_i: number, _dt: number): CpuPad {
    return {};
  }

  /**
   * For CPUs that mash: true/false alternating so that A is pressed `rate` times a second
   * (scaled by the CPU's level: 0.55× for a beginner … 1.05× for an expert).
   */
  protected mashing(i: number, rate = 7): boolean {
    const lv = this.players[i].level;
    const r = rate * (0.55 + 0.5 * lv);
    return (this.t * r + this._mashPh[i]) % 1 < 0.5;
  }

  /**
   * CPU reaction time: false until `delay` seconds after the first call with this key, then true
   * (until `cpuReset(i, key)`). The delay should come from the level: e.g. `0.6 - 0.4 * level`.
   */
  protected cpuAfter(i: number, key: string, delay: number): boolean {
    const k = `${i}:${key}`;
    if (!this._delays.has(k)) this._delays.set(k, this.t + delay);
    return this.t >= this._delays.get(k)!;
  }
  protected cpuReset(i: number, key?: string) {
    if (key) this._delays.delete(`${i}:${key}`);
    else for (const k of [...this._delays.keys()]) if (k.startsWith(`${i}:`)) this._delays.delete(k);
  }
  /** A CPU's chance roll scaled by level: true with probability lerp(lo, hi, level). */
  protected cpuChance(i: number, lo: number, hi: number) {
    const lv = this.players[i].level;
    return Math.random() < lo + (hi - lo) * lv;
  }

  private readPads(dt: number) {
    this._pads = this.players.map((p, i) => {
      if (!p.cpu) return this.ctx.input(i);
      const c = this.cpu(i, dt) ?? {};
      const prev = this._cpuPrev[i];
      const a = !!c.a,
        b = !!c.b;
      const s: PadState = { x: Math.max(-1, Math.min(1, c.x ?? 0)), y: Math.max(-1, Math.min(1, c.y ?? 0)), a, b, aDown: a && !prev.a, bDown: b && !prev.b, aUp: !a && prev.a, bUp: !b && prev.b };
      this._cpuPrev[i] = { a, b };
      return s;
    });
  }

  // ------------------------------------------------------------ frame

  /** The game itself, every frame while playing. */
  protected abstract step(dt: number): void;
  /** Every frame before GO (default: avatars idle). */
  protected idle(_dt: number) {}

  preview(dt: number) {
    this.unshake();
    this.idle(dt);
    this.common(dt);
  }

  update(dt: number) {
    this.unshake();
    this.t += dt;
    this.readPads(dt);
    this.step(dt);
    this.common(dt);
  }

  outro(dt: number) {
    this.unshake();
    if (!this._outroSet && this._res) {
      this._outroSet = true;
      this.celebrate(this._res);
    }
    this.outroStep(dt);
    this.common(dt);
  }
  /** At the end: winners cheer, the others sulk (override to stage your own ending). */
  protected celebrate(res: MiniResult) {
    this.avatars.forEach((a, i) => {
      if (!a) return;
      a.anim = res.place[i] === 1 ? "win" : "lose";
    });
  }
  /** Every frame after the end (default: nothing; avatars keep animating). */
  protected outroStep(_dt: number) {}

  private common(dt: number) {
    this.fx.update(dt);
    for (const a of this.avatars) a?.update(dt);
    if (this.shake > 0.001) {
      this._shakeOff.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.camera.position.add(this._shakeOff);
      this.shake *= Math.exp(-6 * dt);
    } else this.shake = 0;
    this.hud.update(this.camera);
  }
  private unshake() {
    this.camera.position.sub(this._shakeOff);
    this._shakeOff.set(0, 0, 0);
  }

  // ------------------------------------------------------------ helpers

  /** Make player i's avatar at (x, y=0, z), facing `yaw`. */
  protected spawn(i: number, x: number, z: number, yaw = 0, o: AvatarOpts = {}): Avatar {
    const a = new Avatar(this.players[i].char, o);
    a.pos.set(x, 0, z);
    a.yaw = yaw;
    this.scene.add(a.root);
    this.avatars[i] = a;
    return a;
  }

  /** Put the camera at `pos` looking at `look` (instantly). */
  protected setCam(pos: [number, number, number], look: [number, number, number], fov?: number) {
    this._camPos.set(...pos);
    this._camLook.set(...look);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLook);
    if (fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
  /** Glide the camera toward `pos` / `look` (rate: 1/s, ~3 is gentle). */
  protected moveCam(pos: THREE.Vector3 | [number, number, number], look: THREE.Vector3 | [number, number, number], dt: number, rate = 3) {
    const p = Array.isArray(pos) ? new THREE.Vector3(...pos) : pos;
    const l = Array.isArray(look) ? new THREE.Vector3(...look) : look;
    this._camPos.set(damp(this._camPos.x, p.x, rate, dt), damp(this._camPos.y, p.y, rate, dt), damp(this._camPos.z, p.z, rate, dt));
    this._camLook.set(damp(this._camLook.x, l.x, rate, dt), damp(this._camLook.y, l.y, rate, dt), damp(this._camLook.z, l.z, rate, dt));
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLook);
  }

  protected sound(name: SfxName) {
    sfx.play(name);
  }
  /** Vibrate player i's phone (humans only). */
  protected buzz(i: number, ms: number | number[] = 40) {
    if (!this.players[i].cpu) this.ctx.buzz(i, ms);
  }

  /** The players of a team. */
  protected team(t: number) {
    return this.players.filter((p) => p.team === t);
  }

  // ------------------------------------------------------------ ending

  /** End with explicit places (1 = first, indexed like players). */
  protected finish(place: number[], coins?: number[]) {
    if (this._done) return;
    this._done = true;
    this._res = { place, coins };
  }
  /** End by scores (higher wins, or lower with `lower`). */
  protected finishByScore(scores: number[], lower = false, coins?: number[]) {
    this.finish(placesFromScores(scores, lower), coins);
  }
  /** End team games: the winning team's players are 1st, the others 2nd; null = draw (nobody wins). */
  protected finishByTeam(winner: number | null) {
    this.finish(this.players.map((p) => (winner !== null && p.team === winner ? 1 : 2)));
  }
  /**
   * End a survival game: `out` lists players in the order they were eliminated (first out first).
   * Those not in it (still standing) share 1st place.
   */
  protected finishByElimination(out: number[]) {
    const n = this.players.length;
    const place = this.players.map((_, i) => {
      const k = out.indexOf(i);
      return k < 0 ? 1 : n - k;
    });
    // survivors share 1st; the eliminated rank by how long they lasted
    const alive = this.players.length - out.length;
    if (alive > 0) out.forEach((i, k) => (place[i] = Math.min(n, alive + (out.length - k))));
    this.finish(place);
  }

  result(): MiniResult {
    return this._res ?? { place: this.players.map(() => 1) };
  }

  dispose() {
    for (const a of this.avatars) a?.dispose();
    this.fx.dispose();
    disposeScene(this.scene);
  }
}
