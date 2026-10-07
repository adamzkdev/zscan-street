import { get, EXPLORER, ZScan } from "../data/zscan";
import { Market, type MarketState } from "../data/market";
import type { Tx } from "../data/types";
import type { PickInfo } from "../interior/types";
import type { Game } from "./arcade";

/**
 * What each shop of the shōtengai shows at its counter: live chain data, nothing else.
 * Konbini = the mempool, exchange = the price, café = the last block, ramen = the miners,
 * newsstand = the news, florist = the shielded pools, tea house = NU7, arcade = a game,
 * gacha = a random zkSNARK, a MEMPOOL branch (`mempool-<district>`) = the mempool.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const zec = (zat: number) => {
  const z = zat / 1e8;
  return z >= 1e6 ? `${(z / 1e6).toFixed(2)}M ZEC` : z >= 1e3 ? `${(z / 1e3).toFixed(0)}K ZEC` : `${z.toFixed(0)} ZEC`;
};
const usd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
};
const rows = (list: [string, string][]) => `<div class="srows">${list.map(([a, b]) => `<div class="srow"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join("")}</div>`;

let market: MarketState | null = null;
Market.subscribe((m) => (market = m));

interface NewsItem {
  title: string;
  url: string;
  source?: string;
  published_at?: string;
}

export interface StoreData {
  mempool: () => Tx[];
  lastBlock: () => { height: number; time: number; txs: number; pool: string | null } | null;
  nu7: () => { height: number | null; date: string | null; activated: boolean; tip: number | null };
}

/** The live mempool at a MEMPOOL counter (the HQ's board and every branch show the same). */
export function mempoolStats(txs: Tx[]) {
  const shielded = txs.filter((t) => t.kind === "shielded" || t.kind === "shielding" || t.kind === "migration").length;
  return {
    count: txs.length,
    shieldedPct: txs.length ? Math.round((shielded / txs.length) * 100) : null,
    bytes: txs.reduce((a, t) => a + t.size, 0),
    fees: txs.reduce((a, t) => a + (t.fee ?? 0), 0),
    oldest: txs.length ? Math.min(...txs.map((t) => t.seenAt)) : null,
  };
}

/** The panel for a shop, or a game to start (the arcade). */
export async function storeInfo(id: string, d: StoreData): Promise<PickInfo | { game: Game }> {
  if (id.startsWith("mempool-")) {
    const txs = d.mempool();
    const s = mempoolStats(txs);
    return {
      eyebrow: `MEMPOOL · ${id.slice(8).toUpperCase()} BRANCH`,
      title: `${s.count} pending`,
      mono: true,
      stats: [
        ["Size", `${(s.bytes / 1000).toFixed(1)} kB`],
        ["Shielded", s.shieldedPct === null ? "—" : `${s.shieldedPct}%`],
        ["Fees", `${(s.fees / 1e8).toFixed(5)} ZEC`],
        ["Oldest", s.oldest ? ago(s.oldest) : "—"],
      ],
      body: rows(txs.slice(-6).reverse().map((t) => [`${t.kind}`, `${t.txid.slice(0, 8)}… · ${t.size} B · ${ago(t.seenAt)}`])),
      link: { href: `${EXPLORER}/mempool`, label: "Mempool on ZScan" },
    };
  }
  switch (id) {
    case "gacha": {
      const n = 1 + Math.floor(Math.random() * 10000);
      const item = await ZScan.zkSnark(n).catch(() => null);
      return {
        eyebrow: "ガチャ · GACHA",
        title: item?.name ?? `zkSNARK #${n}`,
        image: ZScan.zkSnarkImage(n),
        tag: item?.rank ? [`Rank ${item.rank.toLocaleString("en-US")}`, item.rank <= 500 ? "ok" : "info"] : undefined,
        stats: (item?.traits ?? []).slice(0, 4).map((t) => [t.trait_type, t.value] as [string, string]),
        link: item?.url ? { href: item.url, label: "On ZScan" } : undefined,
      };
    }
    case "konbini": {
      const txs = d.mempool();
      const shielded = txs.filter((t) => t.kind === "shielded" || t.kind === "shielding" || t.kind === "migration").length;
      const oldest = txs[0]?.seenAt;
      return {
        eyebrow: "コンビニ 24 · KONBINI",
        title: "The mempool, live",
        stats: [
          ["Waiting", String(txs.length)],
          ["Shielded", txs.length ? `${Math.round((shielded / txs.length) * 100)}%` : "—"],
          ["Oldest", oldest ? ago(oldest) : "—"],
          ["Size", `${(txs.reduce((a, t) => a + t.size, 0) / 1000).toFixed(1)} kB`],
        ],
        body: rows(txs.slice(-6).reverse().map((t) => [`${t.kind}`, `${t.txid.slice(0, 8)}… · ${ago(t.seenAt)}`])),
        link: { href: `${EXPLORER}/mempool`, label: "Mempool on ZScan" },
      };
    }
    case "exchange": {
      const p = market?.price;
      return {
        eyebrow: "両替 · EXCHANGE",
        title: p ? usd(p.usd) : "ZEC / USD",
        mono: true,
        tag: p ? [`${p.usd_24h_change >= 0 ? "▲" : "▼"} ${Math.abs(p.usd_24h_change).toFixed(2)}% 24h`, p.usd_24h_change >= 0 ? "ok" : "warn"] : undefined,
        stats: p
          ? [
              ["Market cap", usd(p.market_cap_usd)],
              ["Volume 24h", usd(p.volume_24h_usd)],
            ]
          : [],
        link: { href: `${EXPLORER}`, label: "Markets on ZScan" },
      };
    }
    case "cafe": {
      const b = d.lastBlock();
      return {
        eyebrow: "喫茶 BLOCK · CAFÉ",
        title: b ? `#${b.height.toLocaleString("en-US")}` : "Last block",
        mono: true,
        stats: b
          ? [
              ["Transactions", String(b.txs)],
              ["Mined", `${ago(b.time)} ago`],
              ["Pool", b.pool ?? "—"],
            ]
          : [],
        link: b ? { href: `${EXPLORER}/block/${b.height}`, label: "This block on ZScan" } : undefined,
      };
    }
    case "ramen": {
      const n = market?.network;
      return {
        eyebrow: "ラーメン 採掘 · MINERS",
        title: n ? `${(n.solps / 1e9).toFixed(2)} GSol/s` : "Network",
        mono: true,
        stats: n
          ? [
              ["Difficulty", `${(n.difficulty / 1e6).toFixed(1)}M`],
              ["Block time", `${n.avg_block_time.toFixed(0)}s`],
              ["Txs 24h", n.txs_24h.toLocaleString("en-US")],
              ["Fees 24h", `${(n.fees_24h / 1e8).toFixed(3)} ZEC`],
            ]
          : [],
        link: { href: `${EXPLORER}/blocks`, label: "Blocks on ZScan" },
      };
    }
    case "florist": {
      const p = market?.pools;
      return {
        eyebrow: "花屋 POOLS · FLORIST",
        title: p ? `${(p.shielded_ratio * 100).toFixed(1)}% shielded` : "Value pools",
        stats: p
          ? [
              ["Orchard", zec(p.pools.orchard)],
              ["Ironwood", zec(p.pools.ironwood)],
              ["Sapling", zec(p.pools.sapling)],
              ["Transparent", zec(p.pools.transparent)],
            ]
          : [],
        link: { href: `${EXPLORER}/supply`, label: "Supply on ZScan" },
      };
    }
    case "tea": {
      const u = d.nu7();
      const left = u.height !== null && u.tip !== null ? u.height - u.tip : null;
      return {
        eyebrow: "茶 NU7 · TEA HOUSE",
        title: u.activated ? "NU7 is live" : left !== null ? `${left.toLocaleString("en-US")} blocks` : "NU7",
        mono: !u.activated,
        tag: u.activated ? ["Active", "ok"] : ["Upcoming", "info"],
        stats: [
          ["Height", u.height !== null ? u.height.toLocaleString("en-US") : "—"],
          ["Date", u.date ?? "—"],
        ],
        link: { href: `${EXPLORER}/upgrades`, label: "Upgrades on ZScan" },
      };
    }
    case "news": {
      const news = (await get<NewsItem[]>("/v1/news?limit=6")) ?? [];
      return {
        eyebrow: "新聞 NEWS · NEWSSTAND",
        title: "Zcash today",
        body: news.length ? `<div class="srows">${news.map((n) => `<a class="srow" href="${esc(n.url)}" target="_blank" rel="noopener"><span>${esc(n.title)}</span></a>`).join("")}</div>` : "",
        link: { href: "https://news.zscan.cash", label: "news.zscan.cash" },
      };
    }
    case "arcade": {
      const games: Game[] = ["invaders", "kart", "snake", "stacker", "flappy", "whack"];
      return { game: games[Math.floor(Math.random() * games.length)] };
    }
  }
  return { eyebrow: "SHOP", title: id };
}
