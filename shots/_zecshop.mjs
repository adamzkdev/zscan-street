// node shots/_zecshop.mjs [BASE] [OUT]: STORE › GET ⓩ (src/gta/zecshop.ts).
//  1. against the real API: the bundles if it serves them, else the "closed" plate with NO buy button;
//  2. with the dev-only pretend server (?zecmock): a bundle's checkout — the QR code holds exactly the
//     ZIP-321 request shown (address, amount, memo `ZS1:<ref>` base64url), checked module by module
//     against a fresh encoding — then the order confirms and its ⓩ are credited ONCE: more polls and
//     a reload later the balance hasn't moved again.
// The production bundle is checked apart (no ?zecmock in it): npx vite build, then grep (see the report).
import puppeteer from "puppeteer-core";
import QRCode from "qrcode";
const [BASE = "http://localhost:3061/", OUT = "shots/gta/zecshop"] = process.argv.slice(2);
const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  protocolTimeout: 600000,
  args: ["--use-angle=metal", "--ignore-gpu-blocklist"],
  defaultViewport: { width: 1280, height: 720 },
});
const p = await b.newPage();
// other sessions edit files meanwhile: Vite's HMR socket stubbed so the page never reloads mid-test
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
const balance = () => p.evaluate(() => import("/src/gta/economy.ts").then((m) => m.Economy.balance()));
const openGetZ = async () => {
  await p.waitForFunction(() => window.__streetUp && window.street?.gta?.front?.open, { timeout: 240000, polling: 300 });
  await sleep(4000);
  await click('.gf-item[data-k="store"]', 2000);
  await click('.gf-stabs [data-tab="getz"]', 1500);
};

// ---- 1. the real API ----
await p.goto(`${BASE}?debug&gta`);
await openGetZ();
await p.waitForFunction(() => !document.querySelector(".gf-ext .zs-msg"), { timeout: 30000 }).catch(() => {});
const real = await p.evaluate(() => ({
  bundles: document.querySelectorAll(".gf-ext [data-b]").length,
  closed: document.querySelector(".gf-ext .gf-soon b")?.textContent ?? null,
  buttons: [...document.querySelectorAll(".gf-ext button, .gf-ext a")].map((e) => e.textContent.trim()),
}));
const served = await fetch("https://api.zscan.cash/v1/street/pay").then((r) => r.json()).catch(() => null);
console.log("real API bundles:", JSON.stringify(served?.bundles ?? null), "page:", JSON.stringify(real));
if (served?.bundles?.length) check(real.bundles === served.bundles.length, "the API's bundles are on sale");
else check(real.bundles === 0 && real.buttons.length === 0 && /closed/i.test(real.closed ?? ""), "no bundles served → the shop says closed, no button");
await shot("real");

// ---- 2. the pretend server ----
await p.evaluate(() => {
  localStorage.removeItem("zstreet.zecshop.mockorders");
  localStorage.removeItem("zstreet.zecshop.mock");
});
await p.goto(`${BASE}?debug&gta&zecmock`);
await openGetZ();
await p.waitForSelector(".gf-ext [data-b]", { timeout: 30000 });
await shot("bundles");
const z0 = await balance();
await click(".gf-ext [data-b]", 1500);
await p.waitForSelector(".zz-qr canvas", { timeout: 10000 });
await sleep(400);
const pay = await p.evaluate(() => {
  const c = document.querySelector(".zz-qr canvas");
  const codes = [...document.querySelectorAll(".zz-info code")].map((e) => e.textContent);
  const px = c.getContext("2d").getImageData(0, 0, c.width, c.height);
  return { codes, uri: document.querySelector(".zz-qr").dataset.uri, href: document.querySelector(".zz-act a").getAttribute("href"), w: c.width, h: c.height, data: Array.from(px.data.filter((_, i) => i % 4 === 0)) };
});
const [amountText, address, memo] = pay.codes;
const amount = amountText.replace(/ ZEC$/, "");
const b64url = Buffer.from(memo, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const want = `zcash:${address}?amount=${amount}&memo=${b64url}`;
check(/^ZS1:[A-Z2-7]{8}\nZStreet coins$/.test(memo), "memo is ZS1:<ref> + text", JSON.stringify(memo));
check(pay.uri === want && pay.href === want, "the request is ZIP-321 (address, amount, base64url memo)", want);
// the QR's modules, sampled at their centres, against a fresh encoding of that URI
const qr = QRCode.create(want, { errorCorrectionLevel: "M" });
const size = qr.modules.size;
const scale = pay.w / (size + 2);
let bad = 0;
for (let r = 0; r < size; r++)
  for (let c = 0; c < size; c++) {
    const x = Math.floor((1 + c + 0.5) * scale),
      y = Math.floor((1 + r + 0.5) * scale);
    const dark = pay.data[y * pay.w + x] < 128;
    if (dark !== !!qr.modules.get(r, c)) bad++;
  }
check(bad === 0, `the QR code encodes exactly that request (${size}×${size} modules)`, bad ? `${bad} differ` : "");
await shot("checkout");
// the pretend server confirms 6 s after the request; the checkout polls every 5 s
await p.waitForFunction(() => document.querySelector(".zz-state.ok"), { timeout: 30000 }).catch(() => {});
const z1 = await balance();
const bundleCoins = Number((await p.evaluate(() => document.querySelector(".zz-info > b").textContent)).replace(/[^\d]/g, ""));
check(z1 - z0 === bundleCoins, `credited ${bundleCoins} ⓩ`, `${z0} → ${z1}`);
await shot("credited");
// more polls, then a reload and the background watcher: nothing more
await p.evaluate(() => import("/src/gta/zecshop.ts").then(async (m) => {
  await m.ZecShop.poll();
  await m.ZecShop.poll();
}));
await p.reload();
await p.waitForFunction(() => window.__streetUp, { timeout: 240000, polling: 300 });
await sleep(8000);
await p.evaluate(() => import("/src/gta/zecshop.ts").then((m) => m.ZecShop.poll()));
const z2 = await balance();
const ledger = await p.evaluate(() => JSON.parse(localStorage.getItem("zstreet.zecshop.mockorders") ?? "[]").map((o) => ({ ref: o.ref, state: o.state, coins: o.coins, credited: o.credited })));
check(z2 === z1, "credited once (more polls and a reload later)", `${z1} → ${z2} ${JSON.stringify(ledger)}`);
check(ledger.length === 1 && ledger[0].credited === bundleCoins && !ledger[0].key, "the order is marked credited");
// a claim whose answer was lost on the way: the server handed out the ⓩ (its key recorded), the
// browser kept the key and never credited them. The next poll asks again with that key: the same
// answer, credited once, then nothing more.
const lost = await p.evaluate(async () => {
  const m = await import("/src/gta/zecshop.ts");
  const r = await m.ZecShop.checkout({ id: "z3000", coins: 3000, zec: "0.025" });
  if (!r.ok) return { err: r.error };
  const ref = r.order.ref;
  const db = JSON.parse(localStorage.getItem("zstreet.zecshop.mock"));
  db[ref].at -= 7000; // paid
  Object.assign(db[ref], { claimed: 3000, key: "lostkey0001", last: 3000 }); // claimed, answer lost
  localStorage.setItem("zstreet.zecshop.mock", JSON.stringify(db));
  const list = JSON.parse(localStorage.getItem("zstreet.zecshop.mockorders"));
  list.find((o) => o.ref === ref).key = "lostkey0001";
  localStorage.setItem("zstreet.zecshop.mockorders", JSON.stringify(list));
  const eco = await import("/src/gta/economy.ts");
  const before = eco.Economy.balance();
  await m.ZecShop.poll();
  const once = eco.Economy.balance();
  await m.ZecShop.poll();
  await m.ZecShop.poll();
  return { before, once, after: eco.Economy.balance(), order: m.ZecShop.orders().find((o) => o.ref === ref) };
});
check(lost.once - lost.before === 3000 && lost.after === lost.once && !lost.order?.key && lost.order?.credited === 3000, "a lost claim answer is fetched again and credited once", JSON.stringify(lost));
await openGetZ();
await p.waitForSelector(".gf-ext [data-b]", { timeout: 30000 });
await shot("orders");
console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
console.log(fails ? `${fails} FAILED` : "ALL OK");
await b.close();
process.exit(fails ? 1 : 0);
