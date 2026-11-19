/**
 * What a game at the hall is played for: ⓩ, ZStreet's play money (game/profile.ts: free, kept in
 * this browser, never real ZEC). The quick-match stakes, the tables' buy-ins, the tournaments and
 * the side bets all pay in and out through `bank`; missions, levels and the daily refill too.
 */
import { profile } from "../game/profile";

export type Cur = "chips";

const num = (n: number) => Math.round(n).toLocaleString("en-US");

export const bank = {
  get cur(): Cur {
    return "chips";
  },
  set(_c: Cur) {},
  /** What can be staked now. */
  bal() {
    return profile.p.z;
  },
  /** Stake (negative) or pay out (positive) `v`. False when there isn't enough. */
  pay(v: number, why: string) {
    return profile.pay(v, why);
  },
  /** `v` as written on a button: "ⓩ 1,000". */
  money(v: number) {
    return `ⓩ ${num(v)}`;
  },
  /** The number alone: "1,000". */
  amount(v: number) {
    return num(v);
  },
};
