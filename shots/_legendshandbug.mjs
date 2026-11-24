// node shots/_legendshandbug.mjs: is the hand reliable? sweeps the mouse across a full hand and checks the
// hovered card never flickers while the mouse stands still, that a press on every card's visible part
// grabs that card, and that quick drags in a row all get played
import puppeteer from "puppeteer-core";
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: W, height: H } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(`http://localhost:${process.env.PORT || 3071}/tablelab.html?t=legends&seed=${process.env.SEED || 12}&stake=0`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3500);
await p.keyboard.press("Enter");
await sleep(1200);
await p.keyboard.press("Enter");
await sleep(4500);
await p.evaluate(() => document.querySelector("[data-keep]")?.click());
for (let k = 0; k < 80; k++) { if ((await p.evaluate(() => window.zkl?.debugPoints()))?.myTurn) break; await sleep(300); }
await sleep(1500);
const fill = (n) => p.evaluate((n) => {
  const z = window.zkl, s = z.state.s[0];
  const cheap = s.deck.filter((id) => true);
  while (s.hand.length < n && s.deck.length) s.hand.push({ uid: 7000 + Math.floor(Math.random() * 1e6), id: s.deck.pop(), mod: 0 });
  s.mana = s.maxMana = 10;
  z.syncAll();
}, n);
// orphans: hand elements on screen that the state doesn't hold (end two turns first, so draws happen)
for (let t = 0; t < 2; t++) {
  await p.keyboard.press("Space");
  for (let k = 0; k < 100; k++) { await sleep(300); if ((await p.evaluate(() => window.zkl?.debugPoints()))?.myTurn) break; }
  await sleep(1200);
}
const orph = await p.evaluate(() => ({ dom: document.querySelectorAll(".zkl-hand [data-hand]").length, state: window.zkl.state.s[0].hand.length, order: window.zkl.handOrder.length }));
console.log("hand on screen vs state:", JSON.stringify(orph));
await fill(8);
await sleep(800);
console.log("state:", JSON.stringify(await p.evaluate(() => { const z = window.zkl; return { turn: z.state.turn, phase: z.state.phase, pending: !!z.state.pending, overlay: !!z.overlay, busy: z.busy, myTurn: z.myTurn(), q: z.queue.length }; })));
const res = { flicker: 0, sweepSteps: 0, wrongGrab: 0, grabs: 0, played: 0, tried: 0 };
// 1) sweep: slow steps across the fan at three heights; at each stop the hovered card must hold still
const rects = await p.evaluate(() => [...document.querySelectorAll(".zkl-hand .zkl-card")].map((c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
const x0 = Math.min(...rects.map((r) => r.x)) + 4, x1 = Math.max(...rects.map((r) => r.x + r.w)) - 4;
for (const y of [H - 20, H - 60, H - 110]) {
  for (let x = x0; x <= x1; x += 13) {
    await p.mouse.move(x, y);
    await sleep(330);
    const seen = new Set();
    for (let k = 0; k < 6; k++) { seen.add(await p.evaluate(() => window.zkl.hoverUid)); await sleep(45); }
    res.sweepSteps++;
    if (seen.size > 1) { res.flicker++; if (res.flicker < 6) console.log("flicker at", x, y, [...seen]); }
  }
}
// 2) press on each card's own visible strip (left part, under the next card) — it must be the one grabbed
await p.mouse.move(10, 10);
await sleep(500);
const n = await p.evaluate(() => window.zkl.handOrder.length);
for (let i = 0; i < n; i++) {
  await p.mouse.move(10, 10);
  await sleep(400);
  const want = await p.evaluate((i) => window.zkl.handOrder[i], i);
  const pt = await p.evaluate((i) => {
    const z = window.zkl, el = z.hand.get(z.handOrder[i]), nx = z.hand.get(z.handOrder[i + 1]);
    const r = el.getBoundingClientRect();
    const right = nx ? Math.min(r.right, nx.getBoundingClientRect().left) : r.right;
    return { x: (r.left + right) / 2, y: innerHeight - 30 };
  }, i);
  await p.mouse.move(pt.x, pt.y, { steps: 4 });
  await sleep(380);
  await p.mouse.down();
  await sleep(60);
  const got = await p.evaluate(() => window.zkl.drag?.uid ?? window.zkl.picked ?? 0);
  await p.mouse.up();
  await sleep(120);
  res.grabs++;
  const okPlay = await p.evaluate((u) => { const z = window.zkl; const h = z.state.s[0].hand.find((x) => x.uid === u); return h ? z.playable(h) : false; }, want);
  if (!okPlay) { res.grabs--; await p.keyboard.press("Escape"); await sleep(150); continue; }
  if (got !== want) { res.wrongGrab++; console.log("press on card", i, "grabbed", got, "wanted", want, JSON.stringify(await p.evaluate((u) => { const z = window.zkl; const h = z.state.s[0].hand.find((x) => x.uid === u); return { id: h?.id, mana: z.state.s[0].mana, playable: h ? z.playable(h) : null, turn: z.state.turn, busy: z.busy }; }, want))); }
  await p.keyboard.press("Escape");
  await sleep(200);
}
console.log("after presses:", JSON.stringify(await p.evaluate(() => { const z = window.zkl; return { closed: z.closed, overlay: !!z.overlay, over: !!document.querySelector(".zkl-over"), menus: !!document.querySelector(".zkf"), myTurn: z.myTurn(), busy: z.busy, turn: z.state.turn, picked: z.picked, tgt: !!z.tgt, hand: z.state.s[0].hand.length, canact: document.querySelectorAll(".can-act").length }; })));
// 3) four quick drags in a row onto the board, without waiting for the animations
await p.mouse.move(10, 10);
await sleep(500);
const before = await p.evaluate(() => window.zkl.state.s[0].board.length);
const handBefore = await p.evaluate(() => window.zkl.state.s[0].hand.length);
const minions = await p.evaluate(() => window.zkl.handOrder.filter((u) => { const h = window.zkl.state.s[0].hand.find((x) => x.uid === u); return h && window.zkl.state.s[0].hand && true; }).length);
for (let k = 0; k < 4; k++) {
  const q = await p.evaluate(() => {
    const z = window.zkl;
    const els = [...document.querySelectorAll(".zkl-hand .zkl-card.zkl-t-minion.can-act")];
    const m = els.find((e) => { const h = z.state.s[0].hand.find((x) => x.uid === +e.dataset.hand); return h && !h.id.startsWith("__") && document.body && true; });
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { x: r.left + r.width * 0.3, y: innerHeight - 25, lane: z.view.laneY(0) };
  });
  if (!q) break;
  res.tried++;
  await p.mouse.move(q.x, q.y, { steps: 3 });
  await p.mouse.down();
  await p.mouse.move(q.x, q.y - 120, { steps: 4 });
  await p.mouse.move(W / 2 + (k - 1.5) * 90, q.lane, { steps: 5 });
  await p.mouse.up();
  await sleep(140);
}
await sleep(6000);
const st = await p.evaluate(() => ({ board: window.zkl.state.s[0].board.length, hand: window.zkl.state.s[0].hand.length, spent: window.zkl.state.s[0].mana }));
res.played = handBefore - st.hand;
res.lost = res.tried - res.played;
// 4) click mode during the animations: click a card, click the board, at once, twice (minions)
await fill(8);
await sleep(600);
const hb2 = await p.evaluate(() => window.zkl.state.s[0].hand.length);
let clicks = 0;
for (let k = 0; k < 2; k++) {
  const q = await p.evaluate(() => {
    const z = window.zkl;
    const m = [...document.querySelectorAll(".zkl-hand .zkl-card.zkl-t-minion.can-act, .zkl-hand .zkl-card.zkl-t-weapon.can-act")].find((e) => z.state.s[0].hand.find((x) => x.uid === +e.dataset.hand && window.zkl && true));
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { x: r.left + r.width * 0.3, y: innerHeight - 25, lane: z.view.laneY(0), uid: +m.dataset.hand };
  });
  if (!q) break;
  const type = await p.evaluate((u) => { const h = window.zkl.state.s[0].hand.find((x) => x.uid === u); return h ? h.id : ""; }, q.uid);
  const dbg = () => p.evaluate(() => { const z = window.zkl; return { busy: z.busy, picked: z.picked, tgt: z.tgt ? z.tgt.kind + ":" + z.tgt.uid + (z.tgt.dragging ? "d" : "c") : "", pend: z.pending?.uid ?? 0, q: z.queue.map((a) => a.k + (a.uid ?? "")).join(","), drag: z.drag?.uid ?? 0 }; });
  await p.mouse.click(q.x, q.y);
  await sleep(90);
  const a1 = await dbg();
  await p.mouse.click(W / 2 + k * 80, q.lane);
  await sleep(90);
  console.log("click", k, type, q.uid, "after 1st", JSON.stringify(a1), "after 2nd", JSON.stringify(await dbg()));
  // a targeted one: pick its target
  const t = await p.evaluate(() => window.zkl.debugPoints()?.targets ?? []);
  if (t.length) { await p.mouse.click(t[t.length - 1].x, t[t.length - 1].y); await sleep(90); }
  clicks++;
}
await sleep(6000);
const hb3 = await p.evaluate(() => window.zkl.state.s[0].hand.length);
res.clickTried = clicks;
res.clickPlayed = hb2 - hb3;
const orph2 = await p.evaluate(() => ({ dom: document.querySelectorAll(".zkl-hand [data-hand]").length, state: window.zkl.state.s[0].hand.length }));
res.orphansAtEnd = orph2.dom - orph2.state;
console.log(JSON.stringify(res), JSON.stringify(st));
console.log("errors:", errs.length ? errs.join("\n") : "none");
await b.close();
