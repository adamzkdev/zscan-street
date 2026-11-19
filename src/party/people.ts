/**
 * Who plays at ZK PARTY: zkSNARKs, the city's 10,000 residents (ids 1 … 10,000). The visitor plays
 * as their own zkSNARK, the one the city gave them (localStorage "street.avatar", the same one the
 * other visitors see walking in the street: scene/visitors.ts); the rivals are zkSNARKs too, by
 * their ZStreet names (game/personas.ts). Their pictures are the NFTs' own art from ZScan's API.
 */
import { ZScan } from "../data/zscan";
import { persona } from "../game/personas";
import { profile } from "../game/profile";

/** How many zkSNARKs there are (ids 1 … COUNT). */
export const SNARK_COUNT = 10_000;

/** Any number into a valid zkSNARK id. */
export const snarkId = (n: number) => ((((Math.round(n) - 1) % SNARK_COUNT) + SNARK_COUNT) % SNARK_COUNT) + 1;

/** The visitor's own zkSNARK. */
export const myId = () => snarkId(profile.p.avatar || 1);

/** A zkSNARK's picture (the NFT's own 520 px pixel art, CORS-open). */
export const personImage = (id: number) => ZScan.zkSnarkImage(snarkId(id));

/** A zkSNARK's name in ZStreet ("Mika Tanaka"…). */
export const personName = (id: number) => persona(snarkId(id)).name;

/** `n` distinct rival ids drawn by `rnd`, never the visitor's own. */
export function rivalIds(n: number, rnd: () => number = Math.random, not: number[] = [myId()]) {
  const out: number[] = [];
  while (out.length < n) {
    const id = 1 + Math.floor(rnd() * SNARK_COUNT);
    if (!out.includes(id) && !not.includes(id)) out.push(id);
  }
  return out;
}
