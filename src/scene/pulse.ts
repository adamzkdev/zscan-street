import { season } from "../game/season";
import * as THREE from "three";
import type { Soundscape } from "../audio";
import { Market } from "../data/market";
import type { Block, Tx } from "../data/types";
import type { City } from "./city";
import type { Decor } from "./decor";
import type { Nu7 } from "./nu7";
import type { Residents } from "./residents";

/** A block this full (coinbase included) gets fireworks; about one in ten lately. */
const BIG_BLOCK = 15;
/** A shielded transaction with this many logical actions gets lightning on the Proof Factory. */
const BIG_PROOF = 5;
/** The price moved this much (%) since the last time the city reacted to it. */
const PRICE_STEP = 0.5;

/**
 * The city reacts to what really happens on the chain: every LED screen cuts to a new block (or
 * an empty one, as its bus drives through with nobody aboard), the neon swings gold, the station
 * melody plays and the crowd looks up; a big block gets fireworks; a heavy shielded transaction
 * strikes the Proof Factory with lightning; a price move turns the neon green or red and the
 * crowd cheers or groans. Nothing here is invented: each reaction is one real event.
 */
export class CityPulse {
  private lastProof = -Infinity;
  private priceRef: number | null = null;

  constructor(
    private city: City,
    private decor: Decor,
    private sound: Soundscape,
    private residents: Residents,
    private nu7: Nu7,
  ) {
    Market.subscribe((m) => {
      const p = m.price;
      if (!p) return;
      if (this.priceRef === null) return void (this.priceRef = p.usd);
      const pct = ((p.usd - this.priceRef) / this.priceRef) * 100;
      if (Math.abs(pct) >= PRICE_STEP) {
        this.priceRef = p.usd;
        this.price(p.usd, pct);
      }
    });
  }

  /** A block's bus comes out of the tunnel. */
  block(b: Block) {
    const count = b.txs.length + 1;
    if (!b.txs.length) {
      this.decor.alert({ kind: "empty", height: b.height, pool: b.pool });
      this.decor.pulse("#6a6878", 3);
      this.sound.emptyHorn();
      this.residents.react(Math.random() < 0.5 ? "sad" : "dots", null, 0.3);
      return;
    }
    const big = count >= BIG_BLOCK;
    this.decor.alert({ kind: "block", height: b.height, txs: count, pool: b.pool });
    this.decor.pulse(season.color, big ? 5 : 2.5);
    this.sound.blockMelody(big);
    if (big) {
      this.nu7.party(6);
      this.residents.react("star", null, 0.6);
    }
  }

  /** A transaction reaches the mempool. */
  tx(tx: Tx) {
    const shielded = tx.kind === "shielded" || tx.kind === "shielding" || tx.kind === "deshielding" || tx.kind === "migration";
    if (!shielded || tx.actions < BIG_PROOF) return;
    // one storm at a time
    if (performance.now() - this.lastProof < 25_000) return;
    this.lastProof = performance.now();
    this.decor.strike();
    this.decor.alert({ kind: "proof", actions: tx.actions, pool: tx.pool ?? null });
    this.decor.pulse("#3ee08f", 2.5);
    this.sound.thunder();
    const hall = this.city.factory?.hall;
    this.residents.react("!", hall ? new THREE.Vector3(hall.x, 0, hall.z) : null, 0.7, 45);
  }

  price(usd: number, pct: number) {
    const up = pct >= 0;
    this.decor.alert({ kind: "price", usd, pct });
    this.decor.pulse(up ? "#2fbf9c" : "#f06b76", 8);
    this.sound.crowd(up);
    this.residents.react(up ? "up" : "down", null, 0.55);
  }
}
