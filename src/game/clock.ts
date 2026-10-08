import type { Block } from "../data/types";

export type BlockFn = (b: Block, prev: Block | null) => void;
export type ReorgFn = (from: number, to: number) => void;

/**
 * The city's game clock: one tick per block, straight from the feed. The street's bus only shows
 * the newest of a backlog and skips the show in a hidden tab; game rules (bets, power cuts, cases)
 * must see every block, so they listen here instead.
 */
export class ChainClock {
  height = 0;
  last: Block | null = null;
  /** Wall clock (ms) when the last block reached us. */
  at = 0;
  private blockFns: BlockFn[] = [];
  private reorgFns: ReorgFn[] = [];

  onBlock(fn: BlockFn) {
    this.blockFns.push(fn);
    return () => (this.blockFns = this.blockFns.filter((f) => f !== fn));
  }

  /** The chain went back: a block at or under the tip came again with another hash. */
  onReorg(fn: ReorgFn) {
    this.reorgFns.push(fn);
    return () => (this.reorgFns = this.reorgFns.filter((f) => f !== fn));
  }

  /** The tip before the first block, from the feed's snapshot. */
  start(height: number) {
    if (!this.height) this.height = height;
  }

  feed(b: Block) {
    if (this.last && b.height <= this.height) {
      if (b.hash && this.last.hash && b.hash !== this.last.hash) for (const fn of this.reorgFns) safe(() => fn(this.height, b.height));
      else return;
    }
    const prev = this.last;
    this.height = b.height;
    this.last = b;
    this.at = Date.now();
    for (const fn of this.blockFns) safe(() => fn(b, prev));
  }
}

function safe(fn: () => void) {
  try {
    fn();
  } catch (e) {
    console.error(e);
  }
}
