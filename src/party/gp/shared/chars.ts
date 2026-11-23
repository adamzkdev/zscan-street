/**
 * Who plays the GAMEPARTY mini-games in ZK PARTY: zkSNARKs (the city's 10,000 residents), never
 * mascots. A player's `char` is its zkSNARK (`snark`, 1 … 10,000) in its seat's colours; `id` is
 * a string key for the portrait and the 3D body ("s1234").
 */
export type CharId = string;

export interface CharInfo {
  id: CharId;
  /** The zkSNARK's number (1 … 10,000). */
  snark: number;
  name: string;
  /** The seat's colour (HUD, rings). */
  color: string;
  /** A darker shade of it. */
  dark: string;
  emoji: string;
  line: string;
}

/** zkSNARK #snark as a player, in a seat's colours. */
export const snarkChar = (snark: number, name: string, color: string, dark: string): CharInfo => ({ id: `s${snark}`, snark, name, color, dark, emoji: "", line: "" });

/** The zkSNARK behind a key ("s1234" → 1234; anything else: #1). */
export const snarkOf = (id: string) => {
  const n = Number(String(id).replace(/^s/, ""));
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
};

export const charOf = (id: string): CharInfo => snarkChar(snarkOf(id), `zkSNARK #${snarkOf(id)}`, "#ff6b35", "#9c3311");
