/** The hall's shelves: what kind of mini-game it is (the hub's rows, the mini-game hall's filter). */
import { T } from "../i18n/lang";
import type { MiniDef } from "./kit";

export const GENRES = [
  { k: "action", en: "Action", zh: "动作" },
  { k: "race", en: "Race", zh: "竞速" },
  { k: "reflex", en: "Reflex", zh: "反应" },
  { k: "brain", en: "Brain", zh: "益智" },
  { k: "sport", en: "Sport", zh: "体育" },
  { k: "team", en: "Teams", zh: "团队" },
  { k: "duel", en: "Duels", zh: "对决" },
] as const;

export const genreOf = (g: MiniDef) => g.genre ?? (g.seats === 2 ? "duel" : g.teams ? "team" : "action");

export function genreName(k: string) {
  const g = GENRES.find((x) => x.k === k);
  return g ? T(g.en, g.zh) : k;
}

/** Who plays it, in a word: "4 players", "2 vs 2", "1 vs 3", "1 vs 1". */
export function seatsName(g: MiniDef) {
  if (g.seats === 2) return T("1 vs 1", "一对一");
  if (g.teams) return T("2 vs 2", "二对二");
  if (g.gp === "1v3") return T("1 vs 3", "一对三");
  return T("4 players", "4 人");
}
