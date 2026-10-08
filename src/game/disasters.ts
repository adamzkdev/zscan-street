import * as THREE from "three";
import { Market } from "../data/market";
import type { Decor } from "../scene/decor";
import type { ChainClock } from "./clock";
import type { GameHud } from "./ui";

export interface DisasterHooks {
  /** A rumble (thunder does). */
  rumble(): void;
  /** People react. */
  react(): void;
  /** A partial power cut round the power station. */
  blackout(radius: number, at: THREE.Vector2): void;
  powerPlant(): THREE.Vector2;
}

/**
 * When the network itself shakes, so does the city: a chain reorganisation (a block replaced at a
 * height already seen) is an earthquake; the hashrate falling by a quarter trips the power station
 * by the port.
 */
export class Disasters {
  /** Camera shake left (s) and its strength. */
  private quakeLeft = 0;
  private quakeAmp = 0;
  private offset = new THREE.Vector3();
  private baseline: number[] = [];
  private tripped = 0;

  constructor(
    clock: ChainClock,
    private decor: Decor,
    private hud: GameHud,
    private hooks: DisasterHooks,
  ) {
    clock.onReorg((from, to) => this.quake(from - to + 1));
    Market.subscribe((m) => {
      const s = m.network?.solps;
      if (!s) return;
      this.baseline.push(s);
      if (this.baseline.length > 60) this.baseline.shift();
      const avg = this.baseline.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, this.baseline.length - 1);
      if (this.baseline.length > 5 && s < avg * 0.75 && Date.now() - this.tripped > 30 * 60_000) {
        this.tripped = Date.now();
        this.trip(Math.round((1 - s / avg) * 100));
      }
    });
  }

  /** An earthquake, `depth` blocks deep. */
  quake(depth = 1) {
    this.quakeLeft = 4 + depth * 2;
    this.quakeAmp = Math.min(1.2, 0.35 + depth * 0.25);
    this.hooks.rumble();
    this.hooks.react();
    this.decor.alert({ kind: "game", title: "CHAIN REORG  地震", big: `${depth} BLOCK${depth === 1 ? "" : "S"}`, line: "THE CHAIN REWROTE ITS TIP", color: "#f06b76" });
    this.hud.mail("quake", "Earthquake", `A ${depth}-block reorg: the chain swapped its latest block${depth === 1 ? "" : "s"}.`);
  }

  trip(pct: number) {
    this.hooks.blackout(150, this.hooks.powerPlant());
    this.decor.alert({ kind: "game", title: "POWER STATION  停電", big: `HASHRATE −${pct}%`, line: "MINERS WENT DARK", color: "#f06b76" });
    this.hud.mail("power", "Power station tripped", `Hashrate down ${pct}% in the last hour: part of the city is dark.`);
  }

  /** A shake to add to the camera this frame (and take back after drawing). */
  shake(dt: number) {
    if (this.quakeLeft <= 0) return null;
    this.quakeLeft -= dt;
    const a = this.quakeAmp * Math.min(1, this.quakeLeft / 2);
    this.offset.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a * 0.6, (Math.random() - 0.5) * a);
    return this.offset;
  }
}
