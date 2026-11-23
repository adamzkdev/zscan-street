// node shots/_legendsduel.mjs [URL] [OUT]: menu → Play → duel, drags cards and attacks for TURNS turns
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3071/tablelab.html?t=legends&seed=12&stake=100", OUT = "shots/legends/v3"] = process.argv.slice(2);
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-webgl"], defaultViewport: { width: W, height: H } });
const p = await b.newPage();
const errs = [];
p.on("console", (m) => /error/.test(m.type()) && errs.push(m.text().slice(0, 300)));
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("response", (r) => r.status() >= 400 && errs.push(`${r.status()} ${r.url().slice(0, 140)}`));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(URL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { await p.screenshot({ path: `${OUT}-${n}.png` }); console.log("shot", n); };
const pts = () => p.evaluate(() => window.zkl?.debugPoints());
await sleep(3000);
await shot("01-hub");
await p.keyboard.press("Enter");
await sleep(1200);

await sleep(400);
await shot("01b-decks");
await p.keyboard.press("Enter"); await sleep(4000);
await sleep(3500);
await shot("02-mulligan");
await p.evaluate(() => document.querySelector("[data-keep]")?.click());
await sleep(6000);
await shot("03-board");
for (let turn = 0; turn < +(process.env.TURNS || 6); turn++) {
  for (let k = 0; k < 60; k++) { const q = await pts(); if (q?.myTurn) break; await sleep(500); }
  await sleep(600);
  for (let tries = 0; tries < 4; tries++) {
    const box = await p.evaluate(() => { const c = document.querySelector(".zkl-hand .zkl-card.can-act"); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.top + 50, innerHeight - 20) }; });
    if (!box) break;
    const q = await pts();
    await p.mouse.move(box.x, box.y);
    await p.mouse.down();
    await p.mouse.move(box.x, box.y - 120, { steps: 6 });
    await p.mouse.move(W / 2 + 60, q.lane, { steps: 8 });
    if (turn === 1 && tries === 0) await shot("04-dragging");
    await p.mouse.up();
    await sleep(1200);
    const q2 = await pts();
    if (q2?.targets?.length) { const t = q2.targets[q2.targets.length - 1]; await p.mouse.move(t.x, t.y, { steps: 6 }); await p.mouse.click(t.x, t.y); await sleep(1600); }
    await sleep(600);
  }
  for (let tries = 0; tries < 5; tries++) {
    const q = await pts();
    const a = q?.mine.find((m) => m.act);
    if (!a) break;
    await p.mouse.move(a.p.x, a.p.y);
    await p.mouse.down();
    await sleep(100);
    const q2 = await pts();
    const t = q2.targets[q2.targets.length - 1] ?? q2.heroes[1];
    await p.mouse.move(t.x, t.y, { steps: 10 });
    if (!globalThis.arrowShot) { globalThis.arrowShot = 1; await sleep(150); await shot("05-arrow"); }
    await p.mouse.up();
    await sleep(1500);
  }
  await shot(`06-turn${turn}`);
  const q = await pts();
  if (q) await p.mouse.click(q.end.x, q.end.y);
  await sleep(1200);
  if (turn === 2) { await sleep(1300); await shot("06b-rival"); }
}
const q = await pts();
const m = q?.foes[0] ?? q?.mine[0];
if (m) { await p.mouse.move(m.p.x, m.p.y); await sleep(600); await shot("07-preview"); }
if (process.env.CLIP) { const [x, y, w, h] = process.env.CLIP.split(",").map(Number); await p.screenshot({ path: `${OUT}-clip.png`, clip: { x, y, width: w, height: h } }); console.log("shot clip"); }
console.log("errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
