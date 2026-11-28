/**
 * The convenience-store chains and the malls of the city and its islands, as plain data (no
 * three.js): shared by what draws their buildings (./marts.ts) and their interiors
 * (src/interior/mart.ts, src/interior/islemall.ts), which find a store's chain or a mall by the name
 * on its door. Every name, colour and look here is the game's own: four chains of 24-hour stores
 * (the stand-alone corner store with its forecourt, the ground-floor konbini, the old town's kiosk)
 * and the malls across the bridges.
 */

export type ChainKey = "zkmart" | "shield24" | "konbiniz" | "zec24";

export interface Chain {
  key: ChainKey;
  /** The name on the fascia and over the counter. */
  name: string;
  /** Its line under the name (the fascia's small print, the posters). */
  line: string;
  /** The fascia's colour, its stripe, the lettering on it. */
  band: string;
  stripe: string;
  ink: string;
  /** Inside: the walls' band, the floor's tiles, the counter's front. */
  wall: string;
  floor: string;
  counter: string;
}

export const CHAINS: Record<ChainKey, Chain> = {
  // Zcash's gold, black lettering and a black stripe: the shielded snack stop
  zkmart: { key: "zkmart", name: "ZK MART", line: "SHIELDED SNACKS · OPEN 24H", band: "#f4b728", stripe: "#1c1c22", ink: "#16161a", wall: "#f4b728", floor: "#dcd8d0", counter: "#2a2a30" },
  // red with a white shield and white letters
  shield24: { key: "shield24", name: "SHIELD 24", line: "ALWAYS OPEN · ALWAYS PRIVATE", band: "#c8262f", stripe: "#f4f2ee", ink: "#ffffff", wall: "#c8262f", floor: "#e2e0dc", counter: "#c8262f" },
  // mint and coral, the Japanese-style konbini
  konbiniz: { key: "konbiniz", name: "KONBINI Z", line: "コンビニ · 24 HOURS", band: "#17a983", stripe: "#ff7a5c", ink: "#ffffff", wall: "#17a983", floor: "#d6dcd8", counter: "#f4f2ee" },
  // indigo and pink: the kiosk on the corner of the old town
  zec24: { key: "zec24", name: "24/ZEC", line: "KIOSK · COFFEE · TICKETS", band: "#3a30b4", stripe: "#ff5aa8", ink: "#ffffff", wall: "#3a30b4", floor: "#cfd0d8", counter: "#22203a" },
};

export const CHAIN_KEYS = Object.keys(CHAINS) as ChainKey[];

/** The chain whose name a door carries (upper case, as the game labels its doors), or null. */
export function chainOf(name: string | undefined | null): Chain | null {
  const n = (name ?? "").trim().toUpperCase();
  for (const k of CHAIN_KEYS) if (CHAINS[k].name === n) return CHAINS[k];
  return null;
}

export interface Mall {
  key: string;
  /** The name over its atrium (and on its door). */
  name: string;
  /** Its colours: the sign's ground, its lettering, the accent (banners, the atrium's frame inside). */
  band: string;
  ink: string;
  accent: string;
  /** Inside: the floor's stone, the walls. */
  floor: string;
  wall: string;
  /** Its anchor stores (the big blocks outside, the far end inside). */
  anchors: string[];
  /** The shops along its two levels inside. */
  shops: string[];
}

export const MALLS: Record<string, Mall> = {
  zuji: {
    key: "zuji",
    name: "ZUJI MALL",
    band: "#24262c",
    ink: "#ffffff",
    accent: "#e8622c",
    floor: "#d8d2c6",
    wall: "#f2eee6",
    anchors: ["HALO DEPT.", "FRESH PROOF", "ZUJI CINEMA", "SPROUT SPORTS"],
    shops: ["ORCHARD", "NOTE & CO", "SAPLING KIDS", "BLOSSOM", "MEMO BOOKS", "PIXEL TOYS", "ZK OPTICS", "JUBJUB SHOES", "VIEWKEY TECH", "MATCHA ROOM", "SOBA 21", "ONSEN GIFTS", "NONCE BEAUTY", "LAVA DENIM"],
  },
  gamla: {
    key: "gamla",
    name: "GAMLA GALLERIA",
    band: "#1f3d33",
    ink: "#f0dcae",
    accent: "#c9a45a",
    floor: "#cfc8bc",
    wall: "#efe9dd",
    anchors: ["STORHUSET", "MARKT FOODS", "GAMLA BIO", "KANAL SPORT"],
    shops: ["NORDLYS", "GRACHT & CO", "LINNEN", "KAFFE 21", "BOKHUSET", "PROOF OPTIK", "SKO ZK", "HALO HEM", "BRUGGE LACE", "ZK DESIGN", "KANEL BAGERI", "TECH NORD", "SMYCKEN", "BARNENS"],
  },
  decks: {
    key: "decks",
    name: "ZAIBA DECKS",
    band: "#f6f2ea",
    ink: "#1e2a3a",
    accent: "#ff6fb1",
    floor: "#cdbfa8",
    wall: "#f4ece0",
    anchors: ["DECKS FOOD HALL", "SURF ZK", "JOY ARCADE", "BAYSIDE MARKET"],
    shops: ["SEA SALT", "TOKYO POP", "BEACH 21", "SHELL & CO", "TAKO BAR", "RAINBOW TOYS", "SUNNY OPTICS", "KAWAII ZK", "WAVE TECH", "CREPE ZK", "SANDAL HUT", "MANGA ZONE"],
  },
  shield: {
    key: "shield",
    name: "SHIELD CITY",
    band: "#1c2a44",
    ink: "#ffffff",
    accent: "#3ec8ff",
    floor: "#dedcd8",
    wall: "#f0f0ee",
    anchors: ["SHIELD DEPT.", "ZK ELECTRIC", "CINEMA PROOF", "GROCER 24"],
    shops: ["HALO", "ORCHARD", "SPROUT", "NULLIFIER", "TURNSTILE", "JUBJUB", "EQUIHASH", "SAPLING", "MEMO", "NOTE", "BLOSSOM", "CANOPY"],
  },
};

/** The mall whose name a door carries, or null. */
export function mallOf(name: string | undefined | null): Mall | null {
  const n = (name ?? "").trim().toUpperCase();
  for (const m of Object.values(MALLS)) if (m.name === n) return m;
  return null;
}
