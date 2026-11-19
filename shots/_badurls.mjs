// node shots/_badurls.mjs [url] [seconds]: which requests fail (status >= 400) while the city opens and runs
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/?debug", SEC = "25"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
const bad = new Map();
const errs = [];
p.on("response", (r) => r.status() >= 400 && bad.set(r.url().replace(/\?.*/, "").replace(/[0-9a-f]{64}/, "<txid>").replace(/\/\d+$/, "/<n>"), (bad.get(r.url()) ?? 0) + 1 + ` (${r.status()})`));
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 200)));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp, { timeout: 240000, polling: 100 });
await new Promise((r) => setTimeout(r, +SEC * 1000));
for (const [u, n] of bad) console.log("  ", n, u);
console.log("page errors (other than failed requests):", errs.length, errs.slice(0, 5).join(" | "));
await b.close();
