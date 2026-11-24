// node shots/_zilk.mjs [URL] [OUT]: STORE › ZKSNARKS › "Buy on Zilk Road" (src/gta/zilk.ts).
// The listings load with real data (cheapest first, checked against Zilk Road's own market API) or
// say clearly that they didn't; Rarest sorts by rank; Find #id shows that one; the buy link opens
// that zkSNARK's page on Zilk Road (and that page shows it); "Play as" picks it in the line-up.
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta", OUT = "shots/gta/zilk"] = process.argv.slice(2);
const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  protocolTimeout: 600000,
  args: ["--use-angle=metal", "--ignore-gpu-blocklist"],
  defaultViewport: { width: 1280, height: 720 },
});
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  const W = window.WebSocket;
  const F = function (u, pr) {
    if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
    return pr === undefined ? new W(u) : new W(u, pr);
  };
  F.prototype = W.prototype;
  Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = F;
});
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => {
  if (m.type() !== "error" || /429|Failed to load resource|net::/.test(m.text())) return;
  errs.push("console " + m.text().slice(0, 200));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const shot = async (name) => {
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-${name}.png` });
  console.log("shot", n, name);
};
const click = async (sel, wait = 500) => {
  await p.evaluate((s) => document.querySelector(s).click(), sel);
  await sleep(wait);
};
let fails = 0;
const check = (ok, what, extra = "") => {
  if (!ok) fails++;
  console.log(ok ? "ok  " : "FAIL", what, extra);
};
const zec = (t) => Number(String(t).replace(/[^\d.]/g, ""));
const tiles = () => p.evaluate(() => [...document.querySelectorAll(".zs-tile")].map((t) => ({ id: Number(t.dataset.id), price: t.querySelector(".gf-price")?.textContent, rank: t.querySelector(".gf-tag")?.textContent })));
const detail = () =>
  p.evaluate(() => ({
    name: document.querySelector(".zs-dname")?.textContent,
    price: document.querySelector(".zs-dprice")?.textContent.trim(),
    href: document.querySelector(".zs-dact a")?.href,
    buy: document.querySelector(".zs-dact a")?.textContent,
    traits: document.querySelectorAll(".zs-traits dt").length,
  }));

await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.front?.open, { timeout: 240000, polling: 300 });
await sleep(4000);
await click('.gf-item[data-k="store"]', 2000);
await click('.gf-stabs [data-tab="zksnarks"]', 2500);
await click(".gf-tools [data-do=zilk]", 500);
await p.waitForFunction(() => document.querySelectorAll(".zs-tile").length || document.querySelector(".zs-grid .zs-msg [data-retry]"), { timeout: 40000 }).catch(() => {});
const failed = await p.evaluate(() => document.querySelector(".zs-grid .zs-msg")?.textContent ?? null);
if (failed) {
  check(/didn't load/.test(failed), "the market failed and says so", failed);
  await shot("error");
} else {
  await p.waitForFunction(() => document.querySelector(".zs-dact a"), { timeout: 20000 }).catch(() => {});
  await sleep(1500);
  const list = await tiles();
  const prices = list.map((t) => zec(t.price));
  check(list.length === 48, "a page of 48 listed zkSNARKs", String(list.length));
  check(prices.every((v, i) => i === 0 || v >= prices[i - 1]), "cheapest first", prices.slice(0, 6).join(" "));
  // Zilk Road's own market: the cheapest there is what the tab shows first (the API mirrors it)
  const zr = await fetch("https://zilkroad.com/api/market/listings").then((r) => r.json()).catch(() => null);
  if (zr) {
    const ask = new Map(zr.listings.map((l) => [l.snark.id, Number(l.priceZec)]));
    const floor = Math.min(...ask.values());
    check(Math.abs(prices[0] - floor) < 1e-9, "same floor as Zilk Road", `${prices[0]} vs ${floor} (${zr.listings.length} listed there)`);
    const agree = list.filter((t) => ask.get(t.id) === zec(t.price)).length;
    check(agree >= 44, "the page's items are listed on Zilk Road at those prices", `${agree}/48`);
  } else console.log("(Zilk Road's own API unreachable: not compared)");
  const stats = await p.evaluate(() => document.querySelector(".zs-stats")?.textContent);
  console.log("stats", stats);
  const d0 = await detail();
  check(d0.href === `https://zilkroad.com/explorer/${list[0].id}` && /Buy on Zilk Road/.test(d0.buy), "the first one's buy link is its Zilk Road page", JSON.stringify(d0));
  await shot("cheapest");

  // the link opens that zkSNARK's page on Zilk Road
  const opened = new Promise((res) => b.once("targetcreated", (t) => res(t)));
  await click(".zs-dact a", 300);
  const t = await Promise.race([opened, sleep(15000).then(() => null)]);
  if (t) {
    const np = await t.page();
    await np.waitForNetworkIdle({ idleTime: 1500, timeout: 30000 }).catch(() => {});
    const seen = await np.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0, 4000) }));
    check(seen.url === d0.href, "a new tab on that page", seen.url);
    check(seen.text.includes(String(list[0].id)), `Zilk Road's page shows #${list[0].id}`);
    await np.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-zilkroad.png` });
    console.log("shot", n, "zilkroad");
    await np.close();
  } else check(false, "the link opened a tab");

  // rarest
  await click('.zs-seg [data-sort="rank"]', 500);
  await p.waitForFunction(() => document.querySelectorAll(".zs-tile").length, { timeout: 30000 });
  await sleep(1500);
  const rare = await tiles();
  const ranks = rare.map((t) => Number(String(t.rank).replace(/\D/g, "")));
  check(ranks.every((v, i) => i === 0 || v >= ranks[i - 1]), "rarest first", ranks.slice(0, 6).join(" "));
  await shot("rarest");

  // find one by number
  const id = list[3].id;
  await p.evaluate((id) => {
    const i = document.querySelector(".zs-find input");
    i.value = String(id);
    document.querySelector(".zs-find").requestSubmit();
  }, id);
  await p.waitForFunction((id) => document.querySelector(".zs-dname")?.textContent === `zkSNARK #${id}` && document.querySelector(".zs-dact a"), { timeout: 30000 }, id).catch(() => {});
  await sleep(1200);
  const d1 = await detail();
  check(d1.href === `https://zilkroad.com/explorer/${id}` && d1.traits >= 5, `Find #${id}`, JSON.stringify(d1));
  await shot("found");

  // play as it
  await click(".zs-dact [data-play]", 2500);
  // (the line-up, focused on it: Play from there plays as it)
  const st = await p.evaluate(() => { const f = street.gta.front; return { mode: f.mode, focused: f.line?.[f.sel]?.id, sheet: !!document.querySelector(".gfw") }; });
  check(st.mode === "select" && st.focused === id && !st.sheet, `"Play as" puts #${id} in the line-up, focused, and closes the sheet`, JSON.stringify(st));
  await shot("picked");
}
console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
console.log(fails ? `${fails} FAILED` : "ALL OK");
await b.close();
process.exit(fails ? 1 : 0);
