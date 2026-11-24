// node shots/_legendsturnfilm.mjs [OUT] [N]: plays two quick turns, then films the rival's turn and the start
// of yours (the rival thinking, its attacks, your draw shown large), a JPEG every 280 ms → shots/_sheet.mjs
import puppeteer from "puppeteer-core";
const [OUT = "shots/legends/film", N = "24"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(`http://localhost:${process.env.PORT || 3071}/tablelab.html?t=legends&seed=${process.env.SEED || 31}&stake=100${process.env.MAP ? "&map=" + process.env.MAP : ""}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mine = async () => { for (let k = 0; k < 120; k++) { if ((await p.evaluate(() => window.zkl?.debugPoints()))?.myTurn) return; await sleep(250); } };
await sleep(3500);
await p.keyboard.press("Enter");
await sleep(1200);
await p.keyboard.press("Enter");
await sleep(4500);
await p.evaluate(() => document.querySelector("[data-keep]")?.click());
for (let t = 0; t < +(process.env.TURNS || 3); t++) {
  await mine();
  await sleep(900);
  // play whatever fits, attack face with everything
  for (let k = 0; k < 3; k++) {
    const q = await p.evaluate(() => { const c = document.querySelector(".zkl-hand .zkl-card.zkl-t-minion.can-act"); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.3, y: innerHeight - 25, lane: window.zkl.view.laneY(0) }; });
    if (!q) break;
    await p.mouse.move(q.x, q.y); await p.mouse.down(); await p.mouse.move(q.x, q.y - 120, { steps: 3 }); await p.mouse.move(640, q.lane, { steps: 4 }); await p.mouse.up();
    await sleep(1300);
  }
  for (let k = 0; k < 4; k++) {
    const q = await p.evaluate(() => window.zkl.debugPoints());
    const a = q?.mine.find((m) => m.act);
    if (!a) break;
    await p.mouse.move(a.p.x, a.p.y); await p.mouse.down(); await sleep(80);
    const q2 = await p.evaluate(() => window.zkl.debugPoints());
    const tg = q2.targets[q2.targets.length - 1] ?? q2.heroes[1];
    await p.mouse.move(tg.x, tg.y, { steps: 6 }); await p.mouse.up();
    await sleep(1500);
  }
  await p.keyboard.press("Space");
  await sleep(300);
}
for (let i = 0; i < +N; i++) { await p.screenshot({ path: `${OUT}-${String(i).padStart(3, "0")}.jpg`, type: "jpeg", quality: 78 }); await sleep(280); }
console.log("errors:", errs.length ? errs.join("\n") : "none");
await b.close();
