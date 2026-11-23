// node shots/_legendsfxlab.mjs: each effect alone, frame by frame (an AI game runs to put minions down, then the view is driven by hand)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(`http://localhost:3071/tablelab.html?t=legends&auto&seed=400&skill=0.8&map=${process.env.MAP || "rigs"}&ts=0.1`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// wait for two minions a side
for (let i = 0; i < 120; i++) { const ok = await p.evaluate(() => { const g = window.zkl?.state; return g && g.s[0].board.length >= 2 && g.s[1].board.length >= 2; }); if (ok) break; await sleep(500); }
// stop the AI: close its loop by marking closed-ish (freeze turns): end the auto
await p.evaluate(() => { const z = window.zkl; z.auto = false; z.looping = true; });
await sleep(2500);
await p.evaluate(() => (window.zkl.view.timeScale = +(new URLSearchParams(location.search).get("ts") || 0.12)));
const ids = await p.evaluate(() => { const g = window.zkl.state; return { a: g.s[0].board.map((m) => m.uid), b: g.s[1].board.map((m) => m.uid) }; });
let n = 0;
const burst = async (name, f, frames = 12, every = 45) => {
  await p.evaluate(`(${f})(${JSON.stringify(ids)}); void 0`);
  for (let i = 0; i < frames; i++) { await sleep(every); await p.screenshot({ path: `shots/legends/lab-${name}-${String(i).padStart(3, "0")}.jpg`, type: "jpeg", quality: 75, clip: { x: 420, y: 120, width: 760, height: 560 } }); }
  n++;
  await p.evaluate(() => (window.zkl.view.timeScale = 1)); await sleep(1200); await p.evaluate(() => (window.zkl.view.timeScale = 0.1));
};
await burst("attack", (ids) => window.zkl.view.attack(ids.a[0], ids.b[1], 6), 14, 40);
await burst("fire", (ids) => window.zkl.view.cast("bolt", 1, [ids.b[0]]), 14, 45);
await burst("ping", (ids) => window.zkl.view.cast("ping", 1, [ids.b[1]]), 8, 40);
await burst("frost", (ids) => window.zkl.view.cast("frost", 1, [ids.b[0]]), 14, 45);
await burst("drain", (ids) => window.zkl.view.cast("drain", 1, [ids.b[0]]), 10, 60);
await burst("doom", (ids) => window.zkl.view.cast("doom", 1, [ids.b[1]]), 10, 60);
await burst("storm", (ids) => window.zkl.view.cast("storm", 2, ids.a), 10, 60);
await burst("pillar", (ids) => window.zkl.view.cast("buff", 1, [ids.a[0]]), 10, 70);
await burst("blast", (ids) => window.zkl.view.cast("blast", 1, [2]), 14, 45);
await burst("die", (ids) => window.zkl.view.die(ids.b[0]), 10, 50);
console.log("bursts", n, "errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
