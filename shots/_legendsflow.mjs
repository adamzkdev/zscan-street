// node shots/_legendsflow.mjs [OUT]: ZK LEGENDS' duel states in order: the face-off, the mulligan, YOUR TURN,
// a drag onto the board, the in-duel menu, the concede, the end panel (W, H env for the size)
import puppeteer from "puppeteer-core";
const [OUT = "shots/legends/flow"] = process.argv.slice(2);
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-webgl"], defaultViewport: { width: W, height: H } });
const p = await b.newPage();
const errs = [];
p.on("console", (m) => /error/.test(m.type()) && errs.push(m.text().slice(0, 300)));
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(`http://localhost:${process.env.PORT || 3071}/tablelab.html?t=legends&seed=${process.env.SEED || 12}&stake=100${process.env.MAP ? "&map=" + process.env.MAP : ""}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { await p.screenshot({ path: `${OUT}-${n}.png` }); console.log("shot", n); };
const pts = () => p.evaluate(() => window.zkl?.debugPoints());
await sleep(3500);
await p.keyboard.press("Enter");
await sleep(1200);
await p.keyboard.press("Enter");
await sleep(1100);
await shot("1-vs");
await sleep(3000);
await shot("2-mull");
await p.evaluate(() => document.querySelector(".zkl-mull .zkl-card")?.click());
await sleep(300);
await shot("2b-mullswap");
await p.evaluate(() => document.querySelector("[data-keep]")?.click());
for (let k = 0; k < 40; k++) { if (await p.evaluate(() => !!document.querySelector(".zkl-banner"))) break; await sleep(150); }
await sleep(250);
await shot("3-yourturn");
for (let k = 0; k < 60; k++) { const q = await pts(); if (q?.myTurn) break; await sleep(400); }
await sleep(1500);
const box = await p.evaluate(() => { const c = document.querySelector(".zkl-hand .zkl-card"); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.top + 60, innerHeight - 20) }; });
if (box) {
  await p.mouse.move(box.x, box.y, { steps: 4 });
  await sleep(500);
  await shot("4-hover");
  const q = await pts();
  await p.mouse.down();
  await p.mouse.move(box.x, box.y - 150, { steps: 6 });
  await p.mouse.move(W / 2 + 40, q.lane, { steps: 8 });
  await sleep(250);
  await shot("5-drag");
  await p.mouse.up();
  await sleep(1500);
}
await p.mouse.move(40, 40);
await p.evaluate(() => document.querySelector(".zkl-gear")?.click());
await sleep(500);
await shot("6-menu");
await p.evaluate(() => document.querySelector("[data-concede]")?.click());
await sleep(5000);
await shot("7-end");
console.log("errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
