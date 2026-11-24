// node shots/_legendschain.mjs [OUT]: the live chain rail (chain3d.ts) beside the duel: the real blocks from
// ZScan, then fake mempool txs flying into the glass and a fake block sealed (frames → shots/_sheet.mjs)
import puppeteer from "puppeteer-core";
const [OUT = "shots/legends/chain"] = process.argv.slice(2);
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const MAP = process.env.MAP || "rigs";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: W, height: H } });
const p = await b.newPage();
const errs = [];
p.on("console", (m) => /error/.test(m.type()) && errs.push(m.text().slice(0, 200)));
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(`http://localhost:${process.env.PORT || 3071}/tablelab.html?t=legends&seed=12&stake=100&map=${MAP}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3500);
await p.keyboard.press("Enter");
await sleep(1200);
await p.keyboard.press("Enter");
await sleep(5000);
await p.evaluate(() => document.querySelector("[data-keep]")?.click());
await sleep(5000);
await p.screenshot({ path: `${OUT}-1-board.png` });
const clip = { x: Math.round(W * 0.74), y: 0, width: Math.round(W * 0.26), height: H };
await p.screenshot({ path: `${OUT}-2-rail.png`, clip });
console.log("chain:", JSON.stringify(await p.evaluate(() => { const c = window.zkl.view.chain; return { tip: c.tipHeight, mined: c.mined.map((m) => m.info.height + (m.shielded === null ? "?" : m.shielded ? "S" : "T")), waiting: c.count(), status: c.status }; })));
if (process.env.ONLY !== "look") {
  for (let i = 0; i < 14; i++) { await p.evaluate(() => window.zkl.view.chain.fakeTx()); await sleep(110); }
  for (let i = 0; i < 6; i++) { await sleep(110); await p.screenshot({ path: `${OUT}-tx-${String(i).padStart(3, "0")}.jpg`, type: "jpeg", quality: 85, clip }); }
  await sleep(800);
  await p.evaluate(() => window.zkl.view.chain.fakeBlock());
  for (let i = 0; i < 12; i++) { await p.screenshot({ path: `${OUT}-seal-${String(i).padStart(3, "0")}.jpg`, type: "jpeg", quality: 85, clip }); await sleep(105); }
  await sleep(1200);
  await p.screenshot({ path: `${OUT}-3-after.png`, clip });
  // the pointer over a block: what View3D picks
  const hit = await p.evaluate(() => { const v = window.zkl.view, c = v.chain; const m = c.mined[1]; if (!m) return null; const w = m.group.getWorldPosition(new m.group.position.constructor()); w.y = 0.5; const s = v.toScreen(w); return { s, info: v.pickChain(s.x, s.y) }; });
  console.log("pick:", JSON.stringify(hit));
}
console.log("errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
