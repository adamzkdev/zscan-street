/**
 * Zilk Road's auctions, for the Auction Room (src/interior/reserve/auction.ts).
 *
 * Live: zilkroad.com/api/market/live-auction, read through the city's own Worker (/zilk/live-auction,
 * worker/index.ts: Zilk Road sends no CORS header). When nothing is on, the room replays the last
 * real sale from its bids. The blind auction that launched the collection (August 2026) is history:
 * its published results are kept here as they were settled (zilkroad.com/api/auction).
 */

export interface Bid {
  amountZec: string;
  receivedAt: string;
  status: string;
}
export interface LiveAuction {
  id: number;
  /** "sold" once over; anything else while scheduled or running. */
  phase: string;
  tokenId: number;
  name: string;
  apparition?: { slot: number; purgeId: number } | null;
  startsAt: string;
  endsAt: string;
  startingPriceZec: string;
  highestBidZec: string | null;
  incrementPercent: number;
  extensionSeconds: number;
  bufferSeconds: number;
  /** Newest first. */
  bids: Bid[];
  result?: { sold: boolean; priceZec: string } | null;
}

/** The last auction as it ended (2026-10-16), for the replay when the live one can't be read. */
export const LAST_SALE: LiveAuction = {
  id: 7,
  phase: "sold",
  tokenId: 9734,
  name: "Apparition 26",
  apparition: { slot: 26, purgeId: 5 },
  startsAt: "2026-10-15T17:00:00.000Z",
  endsAt: "2026-10-16T17:38:43.726Z",
  startingPriceZec: "1",
  highestBidZec: "19",
  incrementPercent: 10,
  extensionSeconds: 1200,
  bufferSeconds: 300,
  bids: [
    { amountZec: "19", receivedAt: "2026-10-16T17:18:43.726Z", status: "won" },
    { amountZec: "15", receivedAt: "2026-10-16T16:58:36.914Z", status: "outbid" },
    { amountZec: "12", receivedAt: "2026-10-16T15:40:24.156Z", status: "outbid" },
    { amountZec: "10", receivedAt: "2026-10-15T18:00:45.499Z", status: "outbid" },
    { amountZec: "5", receivedAt: "2026-10-15T17:03:27.269Z", status: "outbid" },
  ],
  result: { sold: true, priceZec: "19" },
};

/** The blind auction that launched zkSNARKs (zilkroad.com/api/auction, settled). */
export const BLIND = {
  name: "zkSNARKS blind auction",
  supply: 8000,
  total: 10000,
  minimumZec: 0.1,
  bidsFunded: 3423,
  clearingZec: 1.5,
  openHeight: 3484406,
  closeHeight: 3486706,
  opened: "2026-08-15",
  closed: "2026-08-17",
  closeBlockHash: "000000000066d5b166e01a17d009dadd91c3fd8466cff464dd47bbc0ee93e4dd",
  delivered: "2026-09-17",
};

/** Is it running now (bidding open or in its closing buffer)? */
export const isLive = (a: LiveAuction, now = Date.now()) => a.phase !== "sold" && now >= Date.parse(a.startsAt) && now <= Date.parse(a.endsAt) + a.bufferSeconds * 1000;
/** Not started yet. */
export const isComing = (a: LiveAuction, now = Date.now()) => a.phase !== "sold" && now < Date.parse(a.startsAt);

/** The live auction (the newest), or null when it can't be read. */
export async function liveAuction(): Promise<LiveAuction | null> {
  try {
    const r = await fetch("/zilk/live-auction", { cache: "no-store" });
    if (!r.ok) return null;
    const d = (await r.json()) as { auction?: LiveAuction };
    return d.auction ?? null;
  } catch {
    return null;
  }
}
