// A production-like server for the built city (dist/): HTTP/2 over TLS, brotli, the cache headers of
// shots/bench/headers.mjs. `npx vite preview` serves HTTP/1.1, uncompressed, no cache rules: a throttled
// boot through it measures the wrong thing. node shots/bench/prodserve.mjs [port=3015] [root=dist]
// → https://localhost:3015/ (a self-signed certificate, made once in node_modules/.cache/prodserve:
// Chrome needs --ignore-certificate-errors)
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createSecureServer } from "node:http2";
import { extname, join, normalize, resolve } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";
import { cacheFor } from "./headers.mjs";

const PORT = Number(process.argv[2] ?? 3015);
const ROOT = resolve(process.argv[3] ?? "dist");
const CERT = "node_modules/.cache/prodserve";
if (!existsSync(`${CERT}/key.pem`)) {
  mkdirSync(CERT, { recursive: true });
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj /CN=localhost -keyout ${CERT}/key.pem -out ${CERT}/cert.pem`, { stdio: "ignore" });
}
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".mp4": "video/mp4", ".webm": "video/webm", ".wasm": "application/wasm", ".txt": "text/plain" };
const SQUASH = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".svg", ".txt", ".wasm"]);
const cache = new Map();

createSecureServer({ key: readFileSync(`${CERT}/key.pem`), cert: readFileSync(`${CERT}/cert.pem`), allowHTTP1: true }, (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "https://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  let file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, "index.html");
  const ext = extname(file);
  const st = statSync(file);
  const etag = `"${st.size}-${st.mtimeMs}"`;
  const head = { "content-type": TYPES[ext] ?? "application/octet-stream", etag, "cache-control": cacheFor(path) };
  if (process.env.PRODSERVE_LOG) console.log(Date.now() % 100000, path, req.headers["if-none-match"] ? "revalidate" : "");
  if (req.headers["if-none-match"] === etag) return res.writeHead(304, head), res.end();
  let body = cache.get(file + etag);
  if (!body) {
    body = readFileSync(file);
    if (SQUASH.has(ext)) body = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } });
    cache.set(file + etag, body);
  }
  if (SQUASH.has(ext) && /br/.test(req.headers["accept-encoding"] ?? "")) head["content-encoding"] = "br";
  else if (SQUASH.has(ext)) body = readFileSync(file);
  head["content-length"] = body.length;
  res.writeHead(200, head);
  res.end(body);
}).listen(PORT, () => console.log(`${ROOT} on https://localhost:${PORT}/`));
