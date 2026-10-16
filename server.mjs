// ZStreet's production server: serves the Vite build (dist/) with no dependencies, and gives
// every /tx/<txid> link its own share card (og/twitter meta pointing at the API's per-tx PNG),
// so X, Discord and Telegram show that transaction instead of the generic picture.
//
//   npm run build && npm start        (PORT, default 3007)

import { createServer } from "node:http";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync, constants as zlib } from "node:zlib";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "dist");
const PORT = Number(process.env.PORT) || 3007;
const SITE = "https://zstreet.cash";
const CARD = process.env.STREET_CARD_URL || "https://api.zscan.cash/v1/street/card/tx";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".md", ".txt", ".svg", ".wasm", ".gltf"]);

const INDEX = readFileSync(join(ROOT, "index.html"), "utf8");

/** index.html with the share tags of one transaction. */
function txIndex(txid) {
  const short = `${txid.slice(0, 10)}…${txid.slice(-10)}`;
  const title = `Transaction ${short} · ZStreet`;
  const desc = "Follow this Zcash transaction live on ZStreet: a zkSNARK walking to the bus of its block.";
  const image = `${CARD}/${txid}.png`;
  const set = (html, attr, key, value) =>
    html.replace(new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`), `$1${value}$2`);
  let html = INDEX.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  html = set(html, "property", "og:title", title);
  html = set(html, "property", "og:description", desc);
  html = set(html, "property", "og:image", image);
  html = set(html, "property", "og:url", `${SITE}/tx/${txid}`);
  html = set(html, "name", "twitter:card", "summary_large_image");
  html = set(html, "name", "twitter:title", title);
  html = set(html, "name", "twitter:description", desc);
  html = set(html, "name", "twitter:image", image);
  html = html.replace(
    /(<meta\s+name="twitter:image"[^>]*>)/,
    `$1\n    <meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />\n    <meta name="twitter:image:alt" content="ZStreet card for Zcash transaction ${short}" />`,
  );
  return html;
}

/** Compressed copies of small text files, made once per file version. */
const packed = new Map();
function pack(key, body, enc) {
  const k = `${enc}:${key}`;
  let out = packed.get(k);
  if (!out) {
    out =
      enc === "br"
        ? brotliCompressSync(body, { params: { [zlib.BROTLI_PARAM_QUALITY]: body.length > 512 * 1024 ? 5 : 9, [zlib.BROTLI_PARAM_SIZE_HINT]: body.length } })
        : gzipSync(body, { level: body.length > 512 * 1024 ? 6 : 9 });
    if (packed.size > 500) packed.clear();
    packed.set(k, out);
  }
  return out;
}

function encoding(req) {
  const ae = String(req.headers["accept-encoding"] || "");
  return /\bbr\b/.test(ae) ? "br" : /\bgzip\b/.test(ae) ? "gzip" : null;
}

function cacheControl(urlPath) {
  if (urlPath.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  return "public, max-age=3600";
}

/** A whole body, compressed when it helps and the client accepts it. */
function sendBody(req, res, status, headers, body, ext, key) {
  const enc = COMPRESSIBLE.has(ext) && body.length > 1024 ? encoding(req) : null;
  if (COMPRESSIBLE.has(ext)) headers["Vary"] = "Accept-Encoding";
  if (enc) {
    body = pack(key, body, enc);
    headers["Content-Encoding"] = enc;
  }
  headers["Content-Length"] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : body);
}

function sendHtml(req, res, html, key) {
  sendBody(
    req,
    res,
    200,
    { "Content-Type": TYPES[".html"], "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" },
    Buffer.from(html),
    ".html",
    key,
  );
}

const pages = new Map();
function page(txid) {
  let html = pages.get(txid);
  if (!html) {
    html = txIndex(txid);
    if (pages.size > 1000) pages.clear();
    pages.set(txid, html);
  }
  return html;
}

function sendFile(req, res, file, st, urlPath) {
  const ext = extname(file).toLowerCase();
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cache-Control": cacheControl(urlPath),
    ETag: etag,
    "Last-Modified": st.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
  };
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  // Small text files: whole, compressed and kept in memory.
  if (COMPRESSIBLE.has(ext) && st.size < 8 * 1024 * 1024) {
    return sendBody(req, res, 200, headers, readFileSync(file), ext, `${file}:${etag}`);
  }
  // Media: streamed, with byte ranges (Safari needs them for audio and video).
  headers["Accept-Ranges"] = "bytes";
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    let end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${st.size}` });
      return res.end();
    }
    headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
    headers["Content-Length"] = end - start + 1;
    res.writeHead(206, headers);
    if (req.method === "HEAD") return res.end();
    return createReadStream(file, { start, end }).pipe(res);
  }
  headers["Content-Length"] = st.size;
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
  res.end("Not found");
}

const server = createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end();
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    return notFound(res);
  }

  const tx = /^\/tx\/([0-9a-fA-F]{64})\/?$/.exec(urlPath);
  if (tx) return sendHtml(req, res, page(tx[1].toLowerCase()), `tx:${tx[1].toLowerCase()}`);

  const file = normalize(join(ROOT, urlPath));
  if (file === ROOT || file.startsWith(ROOT + sep)) {
    try {
      const st = statSync(file);
      if (st.isFile() && !file.endsWith(`${sep}index.html`)) return sendFile(req, res, file, st, urlPath);
    } catch {}
  }
  // A missing build file is a 404, not the app: a browser would run HTML as a script.
  if (urlPath.startsWith("/assets/") || /\.[a-z0-9]{2,5}$/i.test(urlPath)) return notFound(res);
  sendHtml(req, res, INDEX, "index");
});

server.listen(PORT, () => console.log(`zstreet on :${PORT}`));
for (const sig of ["SIGTERM", "SIGINT"])
  process.on(sig, () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  });
