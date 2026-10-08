import * as THREE from "three";
import type { Block } from "../data/types";
import type { Decor } from "../scene/decor";
import type { LampLights } from "../scene/post";
import { BLACKOUT } from "../scene/voxel/mesher";
import type { ChainClock } from "./clock";

export interface WorldHooks {
  /** A sound cue: the power going ("down") or coming back ("up"). */
  power(state: "down" | "up"): void;
  /** Chain weather changed: a storm (rain + lightning) or calm. */
  storm(on: boolean): void;
  /** Thunder after a storm's lightning. */
  thunder(): void;
  /** Whether the visitor is inside a place (the cut only shows in the city). */
  inside(): boolean;
  /** A line for the game toast. */
  say(html: string): void;
}

const SPREAD = 7; // seconds for the dark to reach its radius
const HOLD = 22; // seconds the lights stay out
const RESTORE = 4; // seconds of flicker back on
const STORM_MEMPOOL = 20;
const STORM_TXS = 15;

/**
 * One block, one turn: the city's state follows the chain.
 * - An empty block (coinbase only) is a power cut spreading from the Proof Factory: two in a row
 *   and the whole city goes dark. Lights come back with a flicker.
 * - A crowded mempool or a packed block brings a storm (rain and lightning), calm returns when the
 *   queue clears.
 */
export class GameWorld {
  private cut: { t: number; radius: number; up?: boolean } | null = null;
  private empties = 0;
  private stormy = false;
  private mempool = 0;
  private bigBlock = 0;
  private origin = new THREE.Vector2();
  private nextBolt = 0;
  /** The last block's mood for the shops: shielded majority = happy hour. */
  private happy = false;
  private height = 0;
  /** Shops already paid out this block. */
  private paid = new Set<string>();

  constructor(
    clock: ChainClock,
    private decor: Decor,
    private lamps: LampLights,
    factory: THREE.Vector3 | null,
    private hooks: WorldHooks,
  ) {
    if (factory) this.origin.set(factory.x, factory.z);
    clock.onBlock((b) => this.block(b));
  }

  get storm() {
    return this.stormy;
  }

  get dark() {
    return this.cut !== null;
  }

  private block(b: Block) {
    const SH = new Set(["shielded", "shielding", "deshielding", "migration"]);
    this.happy = b.txs.length > 0 && b.txs.filter((t) => SH.has(t.kind)).length * 2 > b.txs.length;
    this.height = b.height;
    this.paid.clear();
    if (b.txs.length === 0) {
      this.empties++;
      this.blackout(this.empties >= 2 ? 420 : 120);
      this.hooks.say(this.empties >= 2 ? `<b>BLACKOUT</b> · ${this.empties} empty blocks in a row, the whole city is dark` : `<b>POWER CUT</b> · empty block ${b.height.toLocaleString("en-US")}`);
    } else this.empties = 0;
    this.bigBlock = b.txs.length >= STORM_TXS ? 3 : Math.max(0, this.bigBlock - 1);
    this.weather();
  }

  /**
   * A shop's state for its counter: closed in a power cut; after a mostly shielded block it's
   * happy hour, and the first visit pays a few ⓩ (once per shop and block).
   */
  shop(id: string): { tag: [string, "ok" | "warn" | "info" | "muted"]; bonus: number } | null {
    if (this.dark) return { tag: ["CLOSED · POWER CUT", "muted"], bonus: 0 };
    if (!this.happy) return null;
    const bonus = this.paid.has(id) ? 0 : 5;
    this.paid.add(id);
    return { tag: [`HAPPY HOUR · SHIELDED BLOCK ${this.height.toLocaleString("en-US")}`, "ok"], bonus };
  }

  /** The mempool's size, from the director's stats. */
  setMempool(n: number) {
    if (n === this.mempool) return;
    this.mempool = n;
    this.weather();
  }

  private weather() {
    const on = this.mempool >= STORM_MEMPOOL || this.bigBlock > 0;
    if (on === this.stormy) return;
    this.stormy = on;
    this.hooks.storm(on);
    if (on) this.hooks.say(`<b>STORM</b> · ${this.mempool} transactions waiting`);
  }

  /** A power cut reaching `radius` metres round the Proof Factory (tests call it too). */
  blackout(radius: number, at?: THREE.Vector2) {
    if (at) this.origin.copy(at);
    this.cut = { t: 0, radius };
    this.hooks.power("down");
  }

  update(dt: number) {
    if (this.stormy && !this.hooks.inside()) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 14 + Math.random() * 22;
        this.decor.strike();
        this.hooks.thunder();
      }
    }
    const v = BLACKOUT.value;
    if (!this.cut) {
      if (v.w !== 0) {
        v.w = 0;
        this.decor.dim(1);
        this.lamps.dim = 1;
      }
      return;
    }
    const c = this.cut;
    c.t += dt;
    let level: number;
    let radius = c.radius;
    if (c.t < SPREAD) {
      const k = c.t / SPREAD;
      radius = c.radius * (1 - (1 - k) * (1 - k));
      level = 1;
    } else if (c.t < SPREAD + HOLD) level = 1;
    else if (c.t < SPREAD + HOLD + RESTORE) {
      const k = (c.t - SPREAD - HOLD) / RESTORE;
      if (!c.up) {
        c.up = true;
        this.hooks.power("up");
      }
      // flicker back: on, off, on…
      level = (1 - k) * (Math.sin(c.t * 38) > 0.2 - k ? 0.15 : 1);
    } else {
      this.cut = null;
      level = 0;
    }
    if (this.hooks.inside()) level = 0;
    v.set(this.origin.x, this.origin.y, radius, level);
    // neon and lamp halos: dimmer with the share of the city that is dark
    const share = level * Math.min(1, radius / 220);
    this.decor.dim(1 - share);
    this.lamps.dim = 1 - share;
  }
}
