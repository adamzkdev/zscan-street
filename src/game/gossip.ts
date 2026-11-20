import { get } from "../data/zscan";
import type { Tone } from "../scene/speech";
import type { ChainClock } from "./clock";

export interface GossipLine {
  text: string;
  tone: Tone;
}

/**
 * The street's gossip about each block: the API asks the language model once per block (shared by
 * every visitor) and the residents' conversations and the radio pick the lines up.
 */
export class Gossip {
  latest: { height: number; lines: GossipLine[] } | null = null;
  private fns: ((g: { height: number; lines: GossipLine[] }) => void)[] = [];

  constructor(clock: ChainClock) {
    // (blocks in a burst: only the newest one's gossip is asked)
    let next: ReturnType<typeof setTimeout> | undefined;
    clock.onBlock((b) => {
      // let the API see the block first
      clearTimeout(next);
      next = setTimeout(() => void this.fetch(b.height), 2500);
    });
  }

  on(fn: (g: { height: number; lines: GossipLine[] }) => void) {
    this.fns.push(fn);
  }

  async fetch(height?: number) {
    const g = await get<{ height: number; lines: GossipLine[] }>(`/v1/street/gossip${height ? `?h=${height}` : ""}`);
    if (!g?.lines?.length) return;
    this.latest = g;
    for (const fn of this.fns) fn(g);
  }
}
