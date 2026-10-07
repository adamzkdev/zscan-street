import { Market } from "../../data/market";
import type { Style } from "./shout";

/** What the stands shout. English only, short, loud. */

export type Line = [string, Style];

const fmt = (n: number) => n.toLocaleString("en-US");
export const pickOf = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Lines from the live chain and market: the height, the price, the halving, the pools. */
export function liveLines(height: number | null): Line[] {
  const out: Line[] = [];
  const s = Market.state;
  if (height) {
    out.push([`BLOCK ${fmt(height)} BABY!`, "shout"], [`${fmt(height + 1)} IS OURS!`, "chant"], [`BLOCK ${fmt(height)}! WHAT A BLOCK!`, "talk"]);
  }
  if (s.price) {
    const p = s.price.usd;
    out.push([`ZEC AT $${p >= 100 ? Math.round(p) : p.toFixed(2)}!`, "talk"]);
    if (s.price.usd_24h_change > 0) out.push([`+${s.price.usd_24h_change.toFixed(1)}% TODAY!`, "shout"]);
  }
  if (s.supply && s.supply.next_halving_height > s.supply.height) out.push([`HALVING IN ${fmt(s.supply.next_halving_height - s.supply.height)} BLOCKS!`, "talk"]);
  if (s.network) out.push([`${Math.round(s.network.shielded_tx_ratio_24h * 100)}% SHIELDED TODAY!`, "chant"]);
  if (s.pools) out.push([`${fmt(Math.round(s.pools.pools.orchard / 1e8 / 1000))}K ZEC IN ORCHARD!`, "talk"]);
  return out;
}

export const STADIUM_GOLD: Line[] = [
  ["SHIELD-ED! SHIELD-ED!", "chant"],
  ["PRIVACY IS NORMAL!", "shout"],
  ["ZEC ZEC ZEC!", "chant"],
  ["TO THE MOON!", "shout"],
  ["HALVING SOON!", "talk"],
  ["REF!!", "boo"],
  ["OFFSIDE!", "boo"],
  ["COME ON SHIELDED!", "shout"],
  ["SHOOT!!", "shout"],
  ["PASS IT!", "talk"],
  ["ZERO KNOWLEDGE, FULL VOLUME!", "chant"],
  ["UNLINKABLE!", "talk"],
  ["WHO ARE YA?!", "shout"],
  ["NOTHING TO SEE HERE!", "talk"],
  ["ORCHARD ON TOUR!", "chant"],
  ["GET STUCK IN!", "shout"],
  ["HE'S NEVER A KEEPER!", "talk"],
  ["75 SECONDS TO GLORY!", "talk"],
  ["MEMO: WE WIN.", "talk"],
  ["NICE TOUCH!", "talk"],
];
export const STADIUM_SILVER: Line[] = [
  ["TRANSPARENT TILL I DIE!", "silver"],
  ["OPEN LEDGER, OPEN PLAY!", "silver"],
  ["WE SEE EVERYTHING!", "silver"],
  ["T-ADDR ARMY!", "silver"],
  ["SHOW YOUR HAND!", "silver"],
  ["REF, CHECK THE MEMPOOL!", "silver"],
  ["REF!!", "boo"],
  ["DIVE!", "boo"],
];
export const GOAL_FOR: Line[] = [
  ["GOAAAAL!!!", "shout"],
  ["GET IN!!", "shout"],
  ["WHAT A STRIKE!", "shout"],
  ["TOP BINS!", "shout"],
  ["YESSS!!", "shout"],
  ["ZEC ZEC ZEC!", "chant"],
  ["WHAT A GOAL!", "shout"],
  ["SCENES!!", "shout"],
];
export const GOAL_AGAINST: Line[] = [
  ["NOOO!", "boo"],
  ["REF!!", "boo"],
  ["OFFSIDE!", "boo"],
  ["VAR! VAR!", "boo"],
  ["WHERE WAS THE DEFENCE?!", "talk"],
  ["UNBELIEVABLE...", "talk"],
];
export const OOH: Line[] = [
  ["WHAT A SAVE!", "shout"],
  ["OOOOH!", "shout"],
  ["SO CLOSE!", "talk"],
  ["HOW?!", "shout"],
  ["UNLUCKY!", "talk"],
  ["OFF THE POST!", "shout"],
];
export const WAVE: Line[] = [
  ["NEW BLOCK!", "shout"],
  ["HERE COMES THE WAVE!", "talk"],
  ["WOOOOO!", "shout"],
];

export const ARENA_GOLD: Line[] = [
  ["FIGHT!", "shout"],
  ["SHIELDED TO THE DEATH!", "chant"],
  ["AVE ZCASH!", "chant"],
  ["PRIVACY IS NORMAL!", "shout"],
  ["STRIKE HIM!", "shout"],
  ["SHIELD UP!", "talk"],
  ["GO FOR THE NET!", "talk"],
  ["MURMILLO! MURMILLO!", "chant"],
  ["ZEC ZEC ZEC!", "chant"],
  ["BLOOD AND PROOFS!", "shout"],
  ["HALVING SOON!", "talk"],
  ["TO THE MOON!", "shout"],
  ["BREAD AND BLOCKS!", "talk"],
];
export const ARENA_SILVER: Line[] = [
  ["NET HIM!", "silver"],
  ["RETIARIUS! RETIARIUS!", "silver"],
  ["NOTHING HIDDEN!", "silver"],
  ["OPEN COMBAT!", "silver"],
  ["THUMBS DOWN!", "boo"],
];
export const ARENA_HIT: Line[] = [
  ["OOOH!", "shout"],
  ["WHAT A BLOW!", "shout"],
  ["FIGHT!", "shout"],
  ["AGAIN!", "shout"],
];
export const ARENA_WIN: Line[] = [
  ["AVE ZCASH!", "chant"],
  ["SHIELDED TO THE DEATH!", "chant"],
  ["VICTORY!", "shout"],
  ["THUMBS DOWN!", "boo"],
  ["MERCY? NEVER!", "shout"],
  ["HAIL THE CHAMPION!", "shout"],
];
export const ARENA_RISE: Line[] = [
  ["HERE THEY COME!", "shout"],
  ["FIGHT! FIGHT! FIGHT!", "chant"],
  ["NEW BLOCK, NEW BLOOD!", "shout"],
];
