// node shots/_legendsplace.mjs: is placing cards easy? real drags to many spots, click-click, second click, drags during animations — counts what got played
import puppeteer from "puppeteer-core";
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal"], defaultViewport: { width: W, height: H } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; localStorage.clear(); });
await p.goto(`http://localhost:3071/tablelab.html?t=legends&seed=${process.env.SEED || 41}&stake=0&map=orchard`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3000);
await p.evaluate(() => document.querySelector('[data-k="play"], .zkf-item')?.click());
await sleep(1200);
await p.evaluate(() => document.querySelector(".zkf-go")?.click());
await sleep(3500);
await p.evaluate(() => document.querySelector("[data-keep]")?.click());
await sleep(4000);
// cheat a little: lots of ZEC each turn so there's always something to place
const st = () => p.evaluate(() => { const g = window.zkl.state; return { turn: g.turn, phase: g.phase, hand: g.s[0].hand.length, board: g.s[0].board.length, mana: g.s[0].mana }; });
const tries = { drag: 0, dragOk: 0, click: 0, clickOk: 0, twice: 0, twiceOk: 0, chain: 0, chainOk: 0 };
const playable = () => p.evaluate(() => { const g = window.zkl.state; const out = []; for (const el of document.querySelectorAll(".zkl-hand .zkl-card.can-act")) { const uid = +el.dataset.hand; const h = g.s[0].hand.find((x) => x.uid === uid); if (!h) continue; const r = el.getBoundingClientRect(); out.push({ uid, id: h.id, type: window.zkl.state && null, x: r.left + r.width / 2, y: Math.min(innerHeight - 25, r.top + 40) }); } return out; });
const isMinion = (id) => p.evaluate((id) => { return document.querySelector(`.zkl-hand .zkl-card[data-hand]`) && true; }, id);
for (let turn = 0; turn < 6; turn++) {
  for (let k = 0; k < 80; k++) { const s = await st(); if (s.turn === 0 && s.phase === "play") break; await sleep(400); }
  await p.evaluate(() => { const s = window.zkl.state.s[0]; s.mana = 10; s.maxMana = Math.max(s.maxMana, 10); });
  await sleep(300);
  for (let n = 0; n < 4; n++) {
    const list = await playable();
    if (!list.length) break;
    const c = list[0];
    const before = await st();
    const mode = n % 4;
    const targetY = [H * 0.62, H * 0.5, H * 0.36, H * 0.7][turn % 4];
    if (mode === 0 || mode === 3) {
      // a drag, sometimes released while the last move still plays (mode 3: no wait before)
      await p.mouse.move(c.x, c.y);
      await p.mouse.down();
      await p.mouse.move(c.x + 20, c.y - 60, { steps: 4 });
      await p.mouse.move(W * (0.3 + 0.4 * Math.random()), targetY, { steps: 10 });
      await p.mouse.up();
      tries[mode === 3 ? "chain" : "drag"]++;
    } else if (mode === 1) {
      await p.mouse.click(c.x, c.y);
      await sleep(250);
      await p.mouse.click(W * 0.5, targetY);
      tries.click++;
    } else {
      await p.mouse.click(c.x, c.y);
      await sleep(250);
      const again = await p.evaluate((uid) => { const el = document.querySelector(`[data-hand="${uid}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.3 }; }, c.uid);
      if (again) await p.mouse.click(again.x, again.y);
      tries.twice++;
    }
    await sleep(mode === 3 ? 100 : 1600);
    // a target may be asked for (a Mint, a spell): click the first lit one
    const t = await p.evaluate(() => { const d = window.zkl.debugPoints(); return d.targets[0] ?? null; });
    if (t) { await p.mouse.click(t.x, t.y); await sleep(1500); }
    await sleep(1400);
    const after = await st();
    const ok = after.hand < before.hand || after.board > before.board;
    const key = mode === 0 ? "dragOk" : mode === 1 ? "clickOk" : mode === 2 ? "twiceOk" : "chainOk";
    if (ok) tries[key]++;
    else console.log("missed", ["drag", "click", "twice", "chain"][mode], c.id);
  }
  const d = await p.evaluate(() => window.zkl.debugPoints());
  await p.mouse.click(d.end.x, d.end.y);
  await sleep(1500);
}
console.log(JSON.stringify(tries));
console.log("errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
