import { ZScan } from "../data/zscan";

/**
 * Seasons follow the network upgrades: each upgrade the chain has activated opens a season with
 * its own colour, which the neon swings to on every block, and its own name on the citizen card.
 */
const SEASONS: Record<string, { color: string; name: string }> = {
  overwinter: { color: "#9fd8ff", name: "Overwinter" },
  sapling: { color: "#3987e5", name: "Sapling" },
  blossom: { color: "#ff7aa8", name: "Blossom" },
  heartwood: { color: "#a8553a", name: "Heartwood" },
  canopy: { color: "#3a9a6a", name: "Canopy" },
  nu5: { color: "#eb6834", name: "Orchard (NU5)" },
  nu6: { color: "#f4b728", name: "NU6" },
  "nu6.1": { color: "#f4b728", name: "NU6.1" },
  nu7: { color: "#b07bff", name: "NU7 · Ironwood" },
};

export const season = { key: "nu6.1", color: "#f4b728", name: "NU6.1" };

export async function loadSeason() {
  const u = await ZScan.upgrades();
  if (!u) return season;
  const live = u.upgrades.filter((x) => x.activated).at(-1);
  const key = live?.name?.toLowerCase().replace(/\s+/g, "") ?? "";
  const s = SEASONS[key] ?? (live ? { color: "#f4b728", name: live.label || live.name } : null);
  if (s) Object.assign(season, { key, ...s });
  return season;
}
