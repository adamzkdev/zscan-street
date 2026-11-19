/**
 * THE GAME HOUSE's table games (board and card games for 2–8 seats: one human, the rest zkSNARK AIs),
 * next to ZK PARTY's mini-games. Each game lives in src/tables/<key>/ and exports a `TableDef`.
 * The launcher (the Game House interior, or the bench /tablelab.html) owns the chips: it takes the
 * buy-in before `open`, and pays `result.payout` back when the game calls `onExit`. Stakes are ⓩ,
 * ZStreet's play chips, never real ZEC.
 */

export interface TableSeat {
  /** 0 is always the human. */
  seat: number;
  /** The zkSNARK's id (1…10000): portrait via data/cast `personImage(id)`. */
  id: number;
  name: string;
  human: boolean;
  /** 0…1, the AI's strength (0.22 street … 0.92 whale room). */
  skill: number;
  /** A distinct colour per seat (8 of them). */
  color: string;
}

export interface TableOpts {
  /** Where to mount (full screen, the game owns it until onExit). */
  root: HTMLElement;
  /** Everyone at the table, seat 0 the human. */
  seats: TableSeat[];
  /** The ⓩ buy-in already taken from the player (0: a free table). */
  stake: number;
  /** For every shuffle and AI choice (seeded: a Zcash block when the launcher has one). */
  seed: number;
  /** A line about the seed for the UI, e.g. "Shuffled by Zcash block #3,543,405" (or ""). */
  seedNote: string;
  /** Bench mode: `auto` plays the human seat by AI too, `fast` skips waits. */
  lab?: { auto?: boolean; fast?: boolean };
  /** Called once, when the game ends or the player leaves (null: left before the end). */
  onExit(result: TableResult | null): void;
}

export interface TableResult {
  /** Seats, winner first (all of them, no duplicates). */
  order: number[];
  /** ⓩ to give back to the player (their winnings or their stack; 0 when they lost the buy-in). */
  payout: number;
  /** A short line for the launcher's toast, EN (the game's own strings use T()). */
  summary: string;
}

export interface TableDef {
  key: string;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  /** How to play, a few short lines. */
  help: string;
  helpZh: string;
  minSeats: number;
  maxSeats: number;
  defaultSeats: number;
  /** Buy-ins the launcher offers (ⓩ); 0 means free play. */
  stakes: number[];
  /** About how long a game takes, minutes (shown on the table's card). */
  minutes: number;
  color: string;
  /** A thumbnail under /public, e.g. "/party/thumbs/tables-<key>.jpg" (optional). */
  thumb?: string;
  open(o: TableOpts): { close(): void };
}

/** Eight seat colours that read well on dark tables (Void & Flare plus neon). */
export const SEAT_COLORS = ["#ff6b35", "#c4b1fc", "#a8d8e8", "#6dbf8a", "#ff5c8a", "#d9bc8a", "#5cc8ff", "#e8e6e0"];
