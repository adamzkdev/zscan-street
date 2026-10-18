// A real two-player exchange in the ZSA MINT: node shots/_exchange.mjs
import puppeteer from "puppeteer-core";
const exe = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
async function player(tag) {
  const b = await puppeteer.launch({ executablePath: exe, headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
  const p = await b.newPage();
  p.on("pageerror", (e) => console.log(tag, "pageerror", e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto("http://localhost:3007/?debug&theme=night&interior=zsalab");
  await p.waitForFunction(() => window.street?.interiors?.active?.key === "zsalab", { timeout: 120000 });
  await wait(4000);
  await p.evaluate(() => window.street.zsaLab.open("mint"));
  await wait(1500);
  await p.click('.zsalab [data-a="create"]');
  return { b, p, tag };
}
const tap = (P, sel) => P.p.evaluate((s) => { const e = document.querySelector(s); if (e) e.click(); return !!e; }, sel);
const text = (P) => P.p.$eval(".zsalab .zl-body", (e) => e.innerText.replace(/\s+/g, " ").slice(0, 260));
async function until(P, sel, secs, label) {
  for (let i = 0; i < secs / 5; i++) {
    await wait(5000);
    if (await P.p.$(sel)) return true;
  }
  log(P.tag, "timeout", label, await text(P));
  return false;
}
const A = await player("A");
const B = await player("B");
log("wallets created");
if (!(await until(A, '.zsalab [data-a="strike"]:not([disabled])', 420, "A fuel"))) process.exit(1);
await A.p.type('.zsalab [name="name"]', "Trade Token");
await A.p.click('.zsalab [data-a="preset"][data-v="1000"]');
await A.p.click('.zsalab [data-a="strike"]');
log("A striking");
await until(A, '.zsalab [data-a="post"]', 120, "A struck");
log("A struck");
// A's coin must be mined (and its change back) before it can be offered and sent
await A.p.click('.zsalab [data-tab="exchange"]');
for (let i = 0; i < 60; i++) {
  await wait(5000);
  await A.p.click('.zsalab [data-tab="exchange"]').catch(() => {});
  if (await A.p.$('.zsalab [data-a="new-offer"]')) {
    await A.p.click('.zsalab [data-a="new-offer"]');
    await wait(800);
    const opts = await A.p.$$eval('.zsalab select[name="give"] option', (os) => os.map((o) => o.value).filter(Boolean));
    if (opts.length) break;
    await A.p.click('.zsalab [data-tab="exchange"]');
  }
}
await A.p.type('.zsalab [name="ga"]', "100");
await A.p.select('.zsalab select[name="want"]', "zec");
await A.p.type('.zsalab [name="wa"]', "10000");
await A.p.click('.zsalab [data-a="post-offer"]');
await wait(2000);
log("A offer:", await text(A));
await A.p.screenshot({ path: "shots/exchange-A-offer.png" });
// B: fuel, then take it
if (!(await until(B, '.zsalab [data-a="strike"]:not([disabled])', 420, "B fuel"))) process.exit(1);
await tap(B, '.zsalab [data-tab="exchange"]');
await until(B, '.zsalab [data-a="take"]', 120, "B sees offer");
await B.p.screenshot({ path: "shots/exchange-B-board.png" });
await tap(B, '.zsalab [data-a="take"]');
log("B taking");
await wait(25000);
log("B after take:", await text(B));
// A: the offer shows taken; send A's part
await tap(A, '.zsalab [data-tab="exchange"]');
await until(A, '.zsalab [data-a="complete"]', 240, "A sees taken");
await A.p.screenshot({ path: "shots/exchange-A-taken.png" });
await tap(A, '.zsalab [data-a="complete"]');
log("A completing");
await wait(25000);
log("A after complete:", await text(A));
// B: the 100 Trade Token arrive with the next block
await tap(B, '.zsalab [data-tab="tokens"]');
for (let i = 0; i < 40; i++) {
  await wait(8000);
  await tap(B, '.zsalab [data-tab="tokens"]');
  const t = await text(B);
  if (/Trade Token/.test(t)) {
    log("B received:", t);
    break;
  }
}
await B.p.screenshot({ path: "shots/exchange-B-received.png" });
log("done");
await A.b.close();
await B.b.close();
