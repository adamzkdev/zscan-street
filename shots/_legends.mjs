// node shots/_legends.mjs [URL] [OUT]: ZK LEGENDS on the table bench: deck picker, mulligan, a few turns, the builder
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3071/tablelab.html?t=legends&seed=12&stake=100", OUT = "shots/legends/run"] = process.argv.slice(2);
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: W, height: H } });
const p = await b.newPage();
const errs = [];
p.on("console", (m) => /error/.test(m.type()) && errs.push(m.text().slice(0, 300)));
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("response", (r) => r.status() >= 400 && errs.push(`${r.status()} ${r.url().slice(0, 140)}`));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(URL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { await p.screenshot({ path: `${OUT}-${n}.png` }); console.log("shot", n); };
await sleep(3500);
await shot("01-pick");
// the Orchard starter, then duel
const pick = process.env.POOL || "orchard";
await p.evaluate((k) => document.querySelector(`[data-key="starter:${k}"]`)?.click(), pick);
await sleep(300);
await p.evaluate(() => document.querySelector("[data-play]")?.click());
await sleep(2500);
await shot("02-mulligan");
await p.evaluate(() => document.querySelector("[data-keep]")?.click());
await sleep(6000);
await shot("03-board");
// an emote: click my hero, pick "Well played"
{
  const h = await p.evaluate(() => { const e = document.querySelector('.zkl-hero[data-uid="1"]'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(h.x, h.y);
  await sleep(300);
  await shot("03b-emotes");
  await p.evaluate(() => document.querySelector(".zkl-emotes .e1")?.click());
  await sleep(1500);
  await shot("03c-bubbles");
}
// play: each of my turns, play what's playable by clicking, attack face, end
for (let turn = 0; turn < +(process.env.TURNS || 4); turn++) {
  for (let k = 0; k < 40; k++) {
    const st = await p.evaluate(() => { const r = document.querySelector(".zkl-end"); return r ? r.className : ""; });
    if (!/wait/.test(st)) break;
    await sleep(500);
  }
  await sleep(800);
  // drag the first playable card to the board
  for (let tries = 0; tries < 4; tries++) {
    const box = await p.evaluate(() => { const c = document.querySelector(".zkl-hand .zkl-card.can-act"); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (!box) break;
    await p.mouse.move(box.x, box.y);
    await p.mouse.down();
    await p.mouse.move(box.x, box.y - 120, { steps: 6 });
    await p.mouse.move(W / 2 + 40, H * 0.58, { steps: 8 });
    await p.mouse.up();
    await sleep(1600);
    // a target arrow waiting: click the first lit target
    const t = await p.evaluate(() => { const e = document.querySelector(".is-target"); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (t) { await p.mouse.click(t.x, t.y); await sleep(1800); }
    if (turn === 1 && tries === 0) await shot("04-played");
  }
  // attack with whatever can
  for (let tries = 0; tries < 4; tries++) {
    const a = await p.evaluate(() => { const c = document.querySelector(".zkl-m.can-act"); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (!a) break;
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    const t = await p.evaluate(() => { const e = [...document.querySelectorAll(".is-target")].pop(); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (!t) { await p.mouse.up(); break; }
    await p.mouse.move(t.x, t.y, { steps: 10 });
    if (!globalThis.arrowShot) { globalThis.arrowShot = 1; await sleep(200); await shot("05-arrow"); }
    await p.mouse.up();
    await sleep(1800);
  }
  await shot(`06-turn${turn}`);
  await p.evaluate(() => document.querySelector(".zkl-end")?.click());
  await sleep(1500);
}
// the deck builder
if (process.env.BUILDER) {
  await p.goto(URL);
  await sleep(3000);
  await p.evaluate(() => document.querySelector("[data-new]")?.click());
  await sleep(800);
  await shot("08-pools");
  await p.evaluate(() => document.querySelector('[data-pool="sprout"]')?.click());
  await sleep(1500);
  for (let i = 0; i < 6; i++) await p.evaluate((k) => document.querySelectorAll(".zkl-b-card")[k * 3]?.click(), i);
  await sleep(500);
  await shot("09-builder");
  await p.evaluate(() => document.querySelector("[data-fill]")?.click());
  await sleep(500);
  await shot("10-filled");
}
// hover a board minion for the preview
const m = await p.evaluate(() => { const c = document.querySelector(".zkl-m"); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
if (m) { await p.mouse.move(m.x, m.y); await sleep(500); await shot("07-preview"); }
console.log(await p.evaluate(() => { const s = document.querySelectorAll(".zkl-m").length; return `minions on board: ${s}`; }));
console.log("errors:", errs.length ? errs.join("\n") : "none");
await b.close();
