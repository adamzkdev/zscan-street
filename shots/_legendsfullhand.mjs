// node shots/_legendsfullhand.mjs [OUT]: a duel with a ten-card hand (debug-filled), the fan and a hovered card
import puppeteer from "puppeteer-core";
const [OUT = "shots/legends/fullhand"] = process.argv.slice(2);
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: W, height: H } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(`http://localhost:${process.env.PORT || 3071}/tablelab.html?t=legends&seed=12&stake=100`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3500);
await p.keyboard.press("Enter");
await sleep(1200);
await p.keyboard.press("Enter");
await sleep(4500);
await p.evaluate(() => document.querySelector("[data-keep]")?.click());
for (let k = 0; k < 60; k++) { if ((await p.evaluate(() => window.zkl?.debugPoints()))?.myTurn) break; await sleep(400); }
await sleep(1200);
await p.evaluate(() => {
  const z = window.zkl, g = z.state, s = g.s[0];
  while (s.hand.length < 10 && s.deck.length) s.hand.push({ uid: 5000 + s.hand.length, id: s.deck.pop() });
  s.mana = s.maxMana = 10;
  z.syncAll();
});
await sleep(900);
await p.screenshot({ path: `${OUT}-1.png` });
const box = await p.evaluate(() => { const c = document.querySelectorAll(".zkl-hand .zkl-card")[6]; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 40 }; });
await p.mouse.move(box.x, box.y, { steps: 3 });
await sleep(600);
await p.screenshot({ path: `${OUT}-2.png` });
console.log("errors:", errs.length ? errs.join("\n") : "none");
await b.close();
