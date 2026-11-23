// node shots/_legendsfront.mjs [port] [prefix]: ZK LEGENDS' front end (menus.ts): menu, play, the collection book,
// a card big, filters, the pool picker, the deck editor, packs, how to play, settings, the arena, into a duel.
// W/H set the viewport, MOBILE=1 a phone; ONLY=menu stops after the menu.
import puppeteer from "puppeteer-core";
const PORT = process.argv[2] || "3071";
const OUT = process.argv[3] || "shots/legends/front";
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: W, height: H, isMobile: !!process.env.MOBILE, hasTouch: !!process.env.MOBILE, deviceScaleFactor: process.env.MOBILE ? 2 : 1 } });
const p = await b.newPage();
const errs = [];
p.on("console", (m) => /error/.test(m.type()) && errs.push(m.text().slice(0, 300)));
p.on("pageerror", (e) => errs.push("pageerror " + e.message + " " + (e.stack || "").split("\n")[1]));
p.on("response", (r) => r.status() >= 400 && !/items\/\d+\/image/.test(r.url()) && errs.push(`${r.status()} ${r.url().slice(0, 140)}`));
await p.evaluateOnNewDocument(() => {
  window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} };
  if (location.search.includes("reset")) {
    localStorage.removeItem("street.legends.collection");
    localStorage.removeItem("street.legends.decks");
    localStorage.removeItem("street.legends.arena");
    localStorage.removeItem("street.legends.arena.runs");
  }
});
await p.goto(`http://localhost:${PORT}/tablelab.html?t=legends&seed=12&stake=100&reset`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { await p.screenshot({ path: `${OUT}-${n}.png` }); console.log("shot", n); };
const click = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (e) e.click(); return !!e; }, sel);
const only = process.env.ONLY || "";
await sleep(5500);
await shot("01-menu");
if (only === "menu") { console.log("errors:", errs.length ? errs.join("\n") : "none"); await b.close(); process.exit(0); }
if (!only || only === "play") {
  await click('.zkf-item[data-k="play"]');
  await sleep(2200);
  await shot("02-play");
  await p.keyboard.press("ArrowRight");
  await sleep(500);
  await shot("03-play-next");
  await p.keyboard.press("Escape");
  await sleep(800);
}
if (!only || only === "coll") {
  await click('.zkf-item[data-k="coll"]');
  await sleep(3500);
  await shot("04-book");
  await click('.zkf-tab[data-pool="sapling"]');
  await sleep(1200);
  await p.keyboard.press("ArrowRight");
  await sleep(900);
  await shot("05-book-sapling");
  await p.evaluate(() => document.querySelector(".zkf-tile")?.click());
  await sleep(1400);
  await shot("06-card");
  await p.keyboard.press("Escape");
  await sleep(400);
  await click('.zkf-tab[data-pool=""]');
  await p.evaluate(() => { const i = document.querySelector(".zkf-search"); i.value = "#4071"; i.dispatchEvent(new Event("input")); });
  await sleep(1200);
  await shot("07-search");
  await p.evaluate(() => { const i = document.querySelector(".zkf-search"); i.value = ""; i.dispatchEvent(new Event("input")); });
  await click('[data-f="set"] button[data-v="classics"]');
  await sleep(600);
  await click('[data-do="filters"]');
  await sleep(500);
  await click('.zkf-drop [data-f="tier"] button[data-v="legendary"]');
  await sleep(1200);
  await shot("08-filters");
  await p.keyboard.press("Escape");
  await sleep(300);
  await click('.zkf-drop [data-do="clear"]');
  await click('[data-do="filters"]');
  await sleep(200);
  await click('.zkf-drop [data-do="clear"]');
  await p.keyboard.press("Escape");
  await sleep(300);
  await click(".zkf-deckrow.new");
  await sleep(800);
  await shot("09-pools");
  await click('.zkf-hero[data-pool="orchard"]');
  await sleep(1500);
  await click('[data-do="fill"]');
  await sleep(1500);
  await shot("10-deck");
  await click('[data-do="done"]');
  await sleep(1000);
  await shot("11-saved");
  await p.keyboard.press("Escape");
  await sleep(800);
}
if (!only || only === "packs") {
  await click('.zkf-item[data-k="packs"]');
  await sleep(2000);
  await shot("12-packs");
  await click('[data-do="open"]');
  await sleep(2600);
  await shot("13-opening");
  for (let i = 0; i < 5; i++) { await p.keyboard.press("Enter"); await sleep(700); }
  await sleep(800);
  await shot("14-opened");
  await p.keyboard.press("Enter");
  await sleep(600);
  await p.keyboard.press("Escape");
  await sleep(800);
}
if (!only || only === "rules") {
  await click('.zkf-item[data-k="rules"]');
  await sleep(800);
  await shot("15-rules-duel");
  for (const [t, n] of [[1, "16-rules-10000"], [2, "17-rules-pools"], [3, "18-rules-kw"]]) {
    await click(`.zkf-stabs [data-t="${t}"]`);
    await sleep(500);
    await shot(n);
  }
  await p.keyboard.press("Escape");
  await sleep(400);
  await click('.zkf-item[data-k="settings"]');
  await sleep(600);
  await shot("19-settings");
  await click('.zkf-stabs [data-t="1"]');
  await sleep(400);
  await shot("20-settings-coll");
  await p.keyboard.press("Escape");
  await sleep(300);
}
if (!only || only === "arena") {
  await click('.zkf-item[data-k="arena"]');
  await sleep(1200);
  await shot("21-arena-door");
  await click(".zkf-arena-go");
  await sleep(900);
  await shot("22-arena-pools");
  await p.keyboard.press("2");
  await sleep(900);
  for (let i = 0; i < 8; i++) { await p.keyboard.press(String(1 + (i % 3))); await sleep(160); }
  await sleep(600);
  await shot("23-arena-pick");
  for (let i = 0; i < 22; i++) { await p.keyboard.press(String(1 + (i % 3))); await sleep(140); }
  await sleep(800);
  await shot("24-arena-run");
  await p.keyboard.press("Escape");
  await sleep(800);
}
if (!only) {
  // into a duel
  await click('.zkf-item[data-k="play"]');
  await sleep(1500);
  await p.keyboard.press("Enter");
  await sleep(4000);
  await shot("25-duel");
}
console.log("errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
