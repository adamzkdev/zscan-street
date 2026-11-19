import { env } from "cloudflare:workers";
import { Room, isRoomsPath, roomsFetch, type Env as RoomsEnv } from "../server/rooms/worker";

// ZK PARTY's online rooms: one Durable Object per room, on this origin (/rooms/*, src/net/rooms.ts)
export { Room };

const videos = new Set(["/video.mp4", "/10-years.mp4"]);
const site = "https://zstreet.cash";
const card = "https://api.zscan.cash/v1/street/card/tx";

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

  const tx = /^\/tx\/([0-9a-fA-F]{64})\/?$/.exec(path);
  if (!tx) {
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
  }
  return new Response(request.method === "HEAD" ? null : html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

export default {
  async fetch(request: Request) {
    // the rooms answer WebSocket upgrades (a 101 can't be rebuilt by secure())
    if (isRoomsPath(new URL(request.url).pathname)) return roomsFetch(request, env as unknown as RoomsEnv);
    return secure(await handle(request));
  },
};
