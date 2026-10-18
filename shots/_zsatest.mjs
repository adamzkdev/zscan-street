// Headless test of the ZSA Lab wallet (src/zsa/) in Chrome, through the Vite dev server.
//   node shots/_zsatest.mjs offline            offline issue → transfer → burn → finalize, real proofs
//   node shots/_zsatest.mjs funded [more]      create → drip → mint → balance (+ burn/transfer/finalize)
// Env: ZSA_PAGE (default http://127.0.0.1:3007/zsatest.html), ZSA_API (default http://127.0.0.1:8095)
import puppeteer from "puppeteer-core";

const mode = process.argv[2] || "offline";
const more = process.argv.includes("more");
const page0 = process.env.ZSA_PAGE || "http://127.0.0.1:3007/zsatest.html";
const api = process.env.ZSA_API || "http://127.0.0.1:8095";
const qs = new URLSearchParams({ [mode]: "1", api, ...(more ? { more: "1" } : {}), ...(process.env.FRESH ? { fresh: "1" } : {}) });
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  userDataDir: process.env.ZSA_PROFILE || "/tmp/zsatest-profile", // keeps the wallet between runs
  args: ["--no-sandbox"],
  protocolTimeout: 2 * 60 * 60 * 1000, // waits last minutes (one block ≈ a minute)
});
const page = await browser.newPage();
page.on("console", (m) => m.text().startsWith("[zsa]") && console.log(m.text().replace(/utest1[0-9a-z]+/g, (a) => a.slice(0, 16) + "…")));
page.on("pageerror", (e) => console.log("pageerror", e.message));
const t0 = Date.now();
await page.goto(`${page0}?${qs}`, { waitUntil: "load" });
await page.waitForFunction(() => window.zsa?.done, { timeout: 60 * 60 * 1000, polling: 1000 });
const r = await page.evaluate(() => window.zsa);
console.log(JSON.stringify({ mode, wall_ms: Date.now() - t0, error: r.error, result: r.result }, null, 1));
await browser.close();
process.exit(r.error ? 1 : 0);
