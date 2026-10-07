import { get } from "../../data/zscan";

/**
 * What the library's shelves hold: the chain year by year, the network upgrades, the papers
 * behind Zcash, and the ZIPs (loaded from the API).
 */

export interface Upgrade {
  name: string;
  label: string;
  activation_height: number | null;
  activated: boolean;
  activated_at?: string | null;
  branch_id?: string | null;
  summary?: string | null;
  target_block_time?: number | null;
}

/** Network upgrades as of this build, in case the API is slow (the live list replaces it). */
export const UPGRADES: Upgrade[] = [
  { name: "Overwinter", label: "Overwinter", activation_height: 347500, activated: true, activated_at: "2018-06-26T00:00:00Z", branch_id: "5ba81b19", summary: "Transaction expiry and replay protection (v3 transactions).", target_block_time: 150 },
  { name: "Sapling", label: "Sapling", activation_height: 419200, activated: true, activated_at: "2018-10-28T18:00:00Z", branch_id: "76b809bb", summary: "Sapling shielded pool: fast, mobile-friendly private transactions.", target_block_time: 150 },
  { name: "Blossom", label: "Blossom", activation_height: 653600, activated: true, activated_at: "2019-12-11T09:00:00Z", branch_id: "2bb40e60", summary: "Block time cut from 150s to 75s.", target_block_time: 75 },
  { name: "Heartwood", label: "Heartwood", activation_height: 903000, activated: true, activated_at: "2020-07-16T08:00:00Z", branch_id: "f5b9230b", summary: "Shielded coinbase and FlyClient light-client support.", target_block_time: 75 },
  { name: "Canopy", label: "Canopy", activation_height: 1046400, activated: true, activated_at: "2020-11-18T12:00:00Z", branch_id: "e9ff75a6", summary: "Dev Fund (ZIP 1014) and the end of new Sprout deposits.", target_block_time: 75 },
  { name: "Nu5", label: "NU5", activation_height: 1687104, activated: true, activated_at: "2022-05-31T09:00:00Z", branch_id: "c2d6d0b4", summary: "Orchard pool with Halo 2 (no trusted setup), Unified Addresses, v5 transactions.", target_block_time: 75 },
  { name: "Nu6", label: "NU6", activation_height: 2726400, activated: true, activated_at: "2024-11-23T11:02:59Z", branch_id: "c8e71055", summary: "Lockbox for part of the block reward (ZIP 1015).", target_block_time: 75 },
  { name: "Nu6_1", label: "NU6.1", activation_height: 3146400, activated: true, activated_at: "2025-11-24T19:56:42Z", branch_id: "4dec4df0", summary: "Community grants and the coinholder-controlled fund (ZIP 1016).", target_block_time: 75 },
  { name: "Nu6_2", label: "NU6.2", activation_height: 3364600, activated: true, activated_at: "2026-06-03T04:03:08Z", branch_id: null, summary: null, target_block_time: 75 },
];

/** Known (height, time) points of the chain, for the year shelves' block ranges. */
const ANCHORS: [number, number][] = [
  [0, Date.UTC(2016, 9, 28, 7, 56)],
  [347500, Date.UTC(2018, 5, 26)],
  [419200, Date.UTC(2018, 9, 28, 18)],
  [653600, Date.UTC(2019, 11, 11, 9)],
  [903000, Date.UTC(2020, 6, 16, 8)],
  [1046400, Date.UTC(2020, 10, 18, 12)],
  [1687104, Date.UTC(2022, 4, 31, 9)],
];

/** Block height at a time, interpolated between known points (the tip included). */
export function heightAt(t: number, ups: Upgrade[], tip: number) {
  const pts: [number, number][] = [...ANCHORS];
  for (const u of ups) if (u.activation_height && u.activated_at) pts.push([u.activation_height, Date.parse(u.activated_at)]);
  if (tip) pts.push([tip, Date.now()]);
  pts.sort((a, b) => a[0] - b[0]);
  const uniq = pts.filter((p, i) => !i || p[0] !== pts[i - 1][0]);
  if (t <= uniq[0][1]) return 0;
  for (let i = 1; i < uniq.length; i++) {
    const [h0, t0] = uniq[i - 1],
      [h1, t1] = uniq[i];
    if (t <= t1) return Math.round(h0 + ((h1 - h0) * (t - t0)) / Math.max(1, t1 - t0));
  }
  const [h, tt] = uniq[uniq.length - 1];
  return Math.round(h + (t - tt) / 75000);
}

/** What happened each year, besides the upgrades (which come from the list above). */
export const YEAR_NOTES: Record<number, string[]> = {
  2016: ["Genesis block, 28 Oct 2016", "Sprout pool, BCTV14 proofs", "Slow start: the block reward ramped up over the first 20,000 blocks", "The Ceremony: 6 participants generated the Sprout parameters"],
  2017: ["Zcash Foundation founded", "Powers of Tau ceremony opens (Nov 2017)", "BLS12-381 curve introduced for Sapling"],
  2018: ["Powers of Tau closes: 87 participants", "Sapling: Groth16 proofs, Jubjub curve, spend in seconds on a phone"],
  2019: ["Halo paper: recursive proofs without a trusted setup (Sep 2019)", "Block time halves to 75 s"],
  2020: ["First halving at block 1,046,400", "Dev Fund: 20% of the block reward (ZIP 1014)"],
  2021: ["Orchard specified (ZIP 224)", "Unified Addresses specified (ZIP 316)"],
  2022: ["Orchard pool goes live", "No more trusted setup for new shielded funds"],
  2023: ["ZIP 317 proportional transfer fees deployed"],
  2024: ["Second halving at block 2,726,400", "Lockbox for part of the block reward (ZIP 1015)"],
  2025: ["Coinholder-controlled fund (ZIP 1016)"],
  2026: [],
};

export interface Paper {
  short: string;
  title: string;
  authors: string;
  venue: string;
  year: number;
  note: string;
  url?: string;
  color: string;
}

export const PAPERS: Paper[] = [
  { short: "GMR 1985", title: "The Knowledge Complexity of Interactive Proof Systems", authors: "Shafi Goldwasser, Silvio Micali, Charles Rackoff", venue: "STOC 1985", year: 1985, note: "Defines zero-knowledge proofs.", color: "#3a3a44" },
  { short: "GGPR 2013", title: "Quadratic Span Programs and Succinct NIZKs without PCPs", authors: "Rosario Gennaro, Craig Gentry, Bryan Parno, Mariana Raykova", venue: "Eurocrypt 2013", year: 2013, note: "Quadratic arithmetic programs: the base of practical zk-SNARKs.", url: "https://eprint.iacr.org/2012/215", color: "#5a3a6a" },
  { short: "PINOCCHIO", title: "Pinocchio: Nearly Practical Verifiable Computation", authors: "Bryan Parno, Jon Howell, Craig Gentry, Mariana Raykova", venue: "IEEE S&P 2013", year: 2013, note: "First practical zk-SNARK implementation.", url: "https://eprint.iacr.org/2013/279", color: "#8a5a2a" },
  { short: "ZEROCOIN", title: "Zerocoin: Anonymous Distributed E-Cash from Bitcoin", authors: "Ian Miers, Christina Garman, Matthew Green, Aviel D. Rubin", venue: "IEEE S&P 2013", year: 2013, note: "The predecessor of Zerocash.", color: "#7a2a2a" },
  { short: "BCTV14", title: "Succinct Non-Interactive Zero Knowledge for a von Neumann Architecture", authors: "Eli Ben-Sasson, Alessandro Chiesa, Eran Tromer, Madars Virza", venue: "USENIX Security 2014", year: 2014, note: "The proving system of the Sprout pool.", url: "https://eprint.iacr.org/2013/879", color: "#26406a" },
  { short: "ZEROCASH", title: "Zerocash: Decentralized Anonymous Payments from Bitcoin", authors: "Eli Ben-Sasson, Alessandro Chiesa, Christina Garman, Matthew Green, Ian Miers, Eran Tromer, Madars Virza", venue: "IEEE S&P 2014", year: 2014, note: "The protocol Zcash launched with.", url: "http://zerocash-project.org/media/pdf/zerocash-extended-20140518.pdf", color: "#f4b728" },
  { short: "EQUIHASH", title: "Equihash: Asymmetric Proof-of-Work Based on the Generalized Birthday Problem", authors: "Alex Biryukov, Dmitry Khovratovich", venue: "NDSS 2016", year: 2016, note: "Zcash's proof-of-work (n = 200, k = 9).", url: "https://eprint.iacr.org/2015/946", color: "#2f5a44" },
  { short: "GROTH16", title: "On the Size of Pairing-based Non-interactive Arguments", authors: "Jens Groth", venue: "Eurocrypt 2016", year: 2016, note: "The proving system of the Sapling pool.", url: "https://eprint.iacr.org/2016/260", color: "#2e6e9e" },
  { short: "PROTOCOL SPEC", title: "Zcash Protocol Specification", authors: "Daira-Emma Hopwood, Sean Bowe, Taylor Hornby, Nathan Wilcox", venue: "Living document, 2016 – today", year: 2016, note: "Sprout, Sapling and Orchard, every consensus rule.", url: "https://zips.z.cash/protocol/protocol.pdf", color: "#e8e0d0" },
  { short: "POWERS OF TAU", title: "Scalable Multi-party Computation for zk-SNARK Parameters in the Random Beacon Model", authors: "Sean Bowe, Ariel Gabizon, Ian Miers", venue: "IACR ePrint 2017", year: 2017, note: "The ceremony behind Sapling's parameters.", url: "https://eprint.iacr.org/2017/1050", color: "#c99a3a" },
  { short: "FLYCLIENT", title: "FlyClient: Super-Light Clients for Cryptocurrencies", authors: "Benedikt Bünz, Lucianna Kiffer, Loi Luu, Mahdi Zamani", venue: "IEEE S&P 2020", year: 2019, note: "Header commitments added in Heartwood (ZIP 221).", url: "https://eprint.iacr.org/2019/226", color: "#3a7a8a" },
  { short: "PLONK", title: "PLONK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge", authors: "Ariel Gabizon, Zachary J. Williamson, Oana Ciobotaru", venue: "IACR ePrint 2019", year: 2019, note: "The arithmetization family Halo 2 builds on.", url: "https://eprint.iacr.org/2019/953", color: "#b85a2a" },
  { short: "HALO", title: "Recursive Proof Composition without a Trusted Setup", authors: "Sean Bowe, Jack Grigg, Daira-Emma Hopwood", venue: "IACR ePrint 2019", year: 2019, note: "Recursion without a trusted setup.", url: "https://eprint.iacr.org/2019/1021", color: "#3c6a52" },
  { short: "HALO 2", title: "The halo2 Book", authors: "Electric Coin Company", venue: "2020 – today", year: 2021, note: "The proving system of the Orchard pool.", url: "https://zcash.github.io/halo2/", color: "#1f3550" },
  { short: "PASTA", title: "Pallas and Vesta: the Pasta curves", authors: "Daira-Emma Hopwood", venue: "2020", year: 2020, note: "The curve cycle under Halo 2 and Orchard.", url: "https://github.com/zcash/pasta", color: "#a8443c" },
  { short: "ORCHARD", title: "Orchard: the NU5 shielded protocol (ZIP 224)", authors: "Daira-Emma Hopwood, Jack Grigg, Sean Bowe, Kris Nuttycombe, Ying Tong Lai", venue: "ZIP 224, 2021", year: 2021, note: "Actions, Pallas, Halo 2: the shielded pool live since NU5.", url: "https://zips.z.cash/zip-0224", color: "#2a2a30" },
];

/** ZIPs, from the API (or the snapshot shipped with the street). */
export interface Zip {
  slug: string;
  number: number | null;
  title: string;
  status: string;
  status_detail: string | null;
  categories: string[];
  owners: string[];
  created: string | null;
  summary: string | null;
  url: string;
  live: { href: string; label: string } | null;
}

let zipsP: Promise<Zip[]> | null = null;
/** Every ZIP from the API, or the snapshot shipped with the street while the API is away (one fetch, shared). */
export function loadZips(): Promise<Zip[]> {
  return (zipsP ??= (async () => {
    const live = await get<Zip[]>("/v1/zips");
    if (live?.length) return live;
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}zips.json`);
      return r.ok ? ((await r.json()) as Zip[]) : [];
    } catch {
      return [];
    }
  })());
}

export const ZIP_GROUPS = [
  { label: "FINAL", color: "#3ee08f", has: (s: string) => s === "Final" },
  { label: "ACTIVE", color: "#59e3ff", has: (s: string) => s === "Active" },
  { label: "PROPOSED", color: "#f4b728", has: (s: string) => s === "Proposed" },
  { label: "DRAFT", color: "#7fa0ff", has: (s: string) => s === "Draft" },
  { label: "ARCHIVED", color: "#a59fb3", has: (s: string) => ["Obsolete", "Withdrawn", "Rejected"].includes(s) },
  { label: "RESERVED", color: "#6c6680", has: (s: string) => !["Final", "Active", "Proposed", "Draft", "Obsolete", "Withdrawn", "Rejected"].includes(s) },
];

/** What readers whisper. */
export const WHISPERS = {
  reader: ["Shh…", "Page 42 of the protocol spec. Again.", "Sapling made shielding work on phones.", "Halo 2 needs no trusted setup.", "Orchard went live with NU5.", "Equihash: 200, 9.", "Zerocash, 2014. Still a great read.", "The Ceremony had six participants.", "Blossom halved the block time.", "Unified addresses: one address, every pool.", "I'm on ZIP 317. Fees by the action.", "Shh, someone's proving."],
  librarian: ["Welcome to the library.", "The chain's years are on the first terrace.", "Papers on the second terrace.", "Every ZIP is in the ZIP Archive, top floor: take the lift to Z.", "The auditorium is inside the sphere.", "Today's papers are in the reading room.", "Please whisper."],
  student: ["Groth16 or PLONK?", "Which pool is Orchard again?", "Exams on zero-knowledge tomorrow.", "Is the Powers of Tau in this section?", "I came for the sphere."],
  lecturer: ["Every block, a new page of the chain.", "Sprout, Sapling, Orchard: three generations of shielded money.", "A zk-SNARK proves you know, without showing what you know.", "Halo removed the trusted setup.", "NU5 brought Orchard and Halo 2."],
};
