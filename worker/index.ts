import { env } from "cloudflare:workers";
import { Room, isRoomsPath, roomsFetch, type Env as RoomsEnv } from "../server/rooms/worker";

import { World, isWorldPath, worldFetch } from "./world";

// ZK PARTY's online rooms: one Durable Object per room, on this origin (/rooms/*, src/net/rooms.ts)
export { Room };
// the game's shared city (src/gta/net.ts): one Durable Object per world (/world/*)
export { World };

const videos = new Set(["/video.mp4", "/10-years.mp4"]);
const site = "https://zstreet.cash";
const card = "https://api.zscan.cash/v1/street/card/tx";
const api = "https://api.zscan.cash";

/**
 * Zilk Road's live auction for the Auction Room (src/data/auction.ts): Zilk Road sends no CORS
 * header, so the city reads it here. One path only (no open proxy), shared by everyone through the
 * edge cache for 15 s.
 */
async function zilk(request: Request): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL("/zilk/live-auction", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  let body = '{"auction":null}';
  let status = 200;
  try {
    const r = await fetch("https://zilkroad.com/api/market/live-auction", { headers: { Accept: "application/json" } });
    if (r.ok) {
      // only what the room shows (the viewer's own fields — payment, signedIn — dropped)
      const d = (await r.json()) as { auction?: Record<string, unknown> | null };
      const a = d.auction;
      if (a) {
        const keep = ["id", "phase", "tokenId", "name", "apparition", "startsAt", "endsAt", "startingPriceZec", "highestBidZec", "incrementPercent", "extensionSeconds", "bufferSeconds", "bids", "result"];
        const out: Record<string, unknown> = {};
        for (const k of keep) out[k] = a[k];
        out.bids = Array.isArray(a.bids) ? (a.bids as { amountZec: string; receivedAt: string; status: string }[]).map((b) => ({ amountZec: b.amountZec, receivedAt: b.receivedAt, status: b.status })) : [];
        body = JSON.stringify({ auction: out });
      }
    } else status = 502;
  } catch {
    status = 502;
  }
  const response = new Response(body, { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=15" } });
  if (status === 200) await cache.put(key, response.clone());
  return response;
}

function secure(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function video(request: Request, path: string): Promise<Response> {
  const key = path.slice(1);
  const metadata = await env.MEDIA.head(key);
  if (!metadata) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
    "ETag": metadata.httpEtag,
    "Last-Modified": metadata.uploaded.toUTCString(),
  });
  if (request.headers.get("If-None-Match") === metadata.httpEtag) return new Response(null, { status: 304, headers });
  let start = 0;
  let end = metadata.size - 1;
  const ifRange = request.headers.get("If-Range");
  const range = !ifRange || ifRange === metadata.httpEtag || ifRange === metadata.uploaded.toUTCString()
    ? /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("Range") ?? "") : null;
  const partial = range !== null && Boolean(range[1] || range[2]);
  if (partial) {
    start = range[1] ? Number(range[1]) : Math.max(0, metadata.size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), metadata.size - 1) : metadata.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= metadata.size) {
      headers.set("Content-Range", `bytes */${metadata.size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${metadata.size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  const status = partial ? 206 : 200;
  if (request.method === "HEAD") return new Response(null, { status, headers });
  const object = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
  return object ? new Response(object.body, { status, headers }) : new Response("Not found", { status: 404 });
}

async function handle(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  let path: string;
  try { path = decodeURIComponent(url.pathname); }
  catch { return new Response("Not found", { status: 404 }); }
  if (videos.has(path)) return video(request, path);
  if (path === "/zilk/live-auction") return zilk(request);
  // a zkSNARK's own page: the city finds it (src/game/finder.ts); the card is its portrait
  const snark = /^\/snark\/(\d{1,5})\/?$/.exec(path);
  const snarkId = snark && Number(snark[1]) >= 1 && Number(snark[1]) <= 10000 ? Number(snark[1]) : null;

  const tx = /^\/tx\/([0-9a-fA-F]{64})\/?$/.exec(path);
  if (!tx && snarkId == null) {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    if (path.startsWith("/assets/") || /\.[a-z0-9]{2,5}$/i.test(path)) return asset;
  }
  const indexUrl = new URL("/index.html", url);
  const index = await env.ASSETS.fetch(new Request(indexUrl, { method: "GET" }));
  if (!index.ok) return index;
  let html = await index.text();
  if (tx) {
    const id = tx[1].toLowerCase();
    const short = `${id.slice(0, 10)}…${id.slice(-10)}`;
    const title = `Transaction ${short} · ZStreet`;
    const description = "Follow this Zcash transaction live on ZStreet: a zkSNARK walking to the bus of its block.";
    const image = `${card}/${id}.png`;
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
    for (const [attribute, key, value] of [
      ["property", "og:title", title], ["property", "og:description", description],
      ["property", "og:image", image], ["property", "og:url", `${site}/tx/${id}`],
      ["name", "twitter:card", "summary_large_image"], ["name", "twitter:title", title],
      ["name", "twitter:description", description], ["name", "twitter:image", image],
    ]) html = html.replace(new RegExp(`(<meta\\s+${attribute}="${key}"\\s+content=")[^"]*(")`), `$1${value}$2`);
    html = html.replace(/(<meta\s+name="twitter:image"[^>]*>)/, `$1\n<meta property="og:image:width" content="1200" />\n<meta property="og:image:height" content="630" />\n<meta name="twitter:image:alt" content="ZStreet card for Zcash transaction ${short}" />`);
  } else if (snarkId != null) {
    const title = `zkSNARKs #${snarkId} · ZStreet`;
    const description = `Find zkSNARKs #${snarkId} living in ZStreet, the Zcash chain as a city.`;
    const image = `${api}/v1/collections/zksnarks/items/${snarkId}/image`;
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
    for (const [attribute, key, value] of [
      ["property", "og:title", title], ["property", "og:description", description],
      ["property", "og:image", image], ["property", "og:url", `${site}/snark/${snarkId}`],
      // a square portrait: the small card shows it whole
      ["name", "twitter:card", "summary"], ["name", "twitter:title", title],
      ["name", "twitter:description", description], ["name", "twitter:image", image],
    ]) html = html.replace(new RegExp(`(<meta\\s+${attribute}="${key}"\\s+content=")[^"]*(")`), `$1${value}$2`);
  }
  return new Response(request.method === "HEAD" ? null : html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

export default {
  async fetch(request: Request) {
    // the rooms answer WebSocket upgrades (a 101 can't be rebuilt by secure())
    const path = new URL(request.url).pathname;
    if (isRoomsPath(path)) return roomsFetch(request, env as unknown as RoomsEnv);
    if (isWorldPath(path)) return worldFetch(request, (env as unknown as { WORLD: DurableObjectNamespace }).WORLD);
    return secure(await handle(request));
  },
};
