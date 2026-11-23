// node shots/_legendshud.mjs [port]: ZK LEGENDS' HUD skin: mulligan, board with hand, banner, numbers, bubble,
// emotes, notes, arrow, history, menu, end panel. Some transient pieces are staged with the HUD's own classes.
import puppeteer from "puppeteer-core";
const PORT = process.argv[2] || "3074";
const OUT = process.argv[3] || "shots/legends/hud";
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: W, height: H } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => /error/.test(m.type()) && errs.push(m.text().slice(0, 200)));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(`http://localhost:${PORT}/tablelab.html?t=legends&seed=12&stake=100&map=rigs`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { await p.screenshot({ path: `${OUT}-${n}.png` }); console.log("shot", n); };
const pts = () => p.evaluate(() => window.zkl?.debugPoints());
const inject = () => p.evaluate(async () => { const r = document.querySelector(".zkl-root"); if (!r || r.style.getPropertyValue("--hud-frame")) return; const m = await import("/src/tables/legends/hudart.ts"); m.installHudArt(r); });
await sleep(2500);
await inject();
await p.evaluate(() => document.querySelector('[data-go="play"]')?.click());
await sleep(900);
await p.evaluate(() => document.querySelector("[data-duel]")?.click());
await sleep(2600);
await inject();
// mark two cards to swap
await p.evaluate(() => { const c = document.querySelectorAll(".zkl-mull .zkl-card"); c[1]?.click(); });
await sleep(700);
await shot("01-mulligan");
await p.evaluate(() => document.querySelector("[data-keep]")?.click());
await sleep(900);
await shot("02-turnbanner");
await sleep(5000);
for (let k = 0; k < 60; k++) { const q = await pts(); if (q?.myTurn) break; await sleep(500); }
await sleep(600);
await shot("03-board");
// hover a hand card
const hc = await p.evaluate(() => { const c = document.querySelector(".zkl-hand .zkl-card.can-act") || document.querySelector(".zkl-hand .zkl-card"); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.top + 40, innerHeight - 10) }; });
await p.mouse.move(hc.x, hc.y);
await sleep(500);
await shot("04-handhover");
await p.mouse.move(W / 2, 80);
// staged pieces: damage, heal, buff line, the rival's bubble and mine, the secret banner, the arrow
await p.evaluate(() => {
  const fx = document.querySelectorAll(".zkl-layer")[1];
  const z = window.zkl.debugPoints();
  const mk = (cls, html, x, y, keep) => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; d.style.left = x + "px"; d.style.top = y + "px"; if (keep) d.style.animation = "none"; fx.appendChild(d); return d; };
  mk("zkl-float dmg", "<span>-7</span>", z.heroes[1].x + 70, z.heroes[1].y, true);
  mk("zkl-float heal", "<span>+3</span>", z.heroes[0].x - 160, z.heroes[0].y - 30, true);
  mk("zkl-float buff", "<span>Hand full</span>", innerWidth * 0.78, innerHeight * 0.5, true);
  const b1 = mk("zkl-bubble foe", "Shielded and ready.", z.heroes[1].x - 60, z.heroes[1].y, true);
  const b2 = mk("zkl-bubble me", "Well played.", z.heroes[0].x - 60, z.heroes[0].y, true);
  void b1; void b2;
  const ban = document.createElement("div");
  ban.className = "zkl-banner";
  ban.style.animation = "none";
  ban.style.top = "38%";
  ban.innerHTML = "YOUR TURN<small>Turn 3</small>";
  fx.appendChild(ban);
  const ban2 = document.createElement("div");
  ban2.className = "zkl-banner alt";
  ban2.style.animation = "none";
  ban2.style.top = "66%";
  ban2.style.width = "min(520px, 80vw)";
  ban2.innerHTML = "SECRET!<small>Nullifier Snare</small>";
  fx.appendChild(ban2);
});
await sleep(400);
await shot("05-staged");
await p.evaluate(() => { document.querySelectorAll(".zkl-float,.zkl-bubble,.zkl-banner").forEach((e) => e.remove()); });
// the arrow from my hero power / a minion
await p.evaluate(() => {
  const svg = document.querySelector(".zkl-arrow");
  const z = window.zkl.debugPoints();
  svg.style.display = "";
  const a = z.heroes[0], t = z.heroes[1];
  const p2 = { x: t.x, y: t.y };
  const dx = p2.x - a.x, dy = p2.y - a.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const base = { x: p2.x - ux * 30, y: p2.y - uy * 30 };
  const mid = { x: (a.x + base.x) / 2 - uy * len * 0.14, y: (a.y + base.y) / 2 + ux * len * 0.14 };
  svg.querySelector("path").setAttribute("d", `M ${a.x} ${a.y} Q ${mid.x} ${mid.y} ${base.x} ${base.y}`);
  const nx = -uy, ny = ux;
  svg.querySelector("polygon").setAttribute("points", `${p2.x},${p2.y} ${base.x + nx * 24},${base.y + ny * 24} ${base.x - nx * 24},${base.y - ny * 24}`);
  const c = svg.querySelector("circle"); c.setAttribute("cx", a.x); c.setAttribute("cy", a.y);
  svg.classList.add("lock");
});
await sleep(300);
await shot("06-arrow");
await p.evaluate(() => { const s = document.querySelector(".zkl-arrow"); s.style.display = "none"; s.classList.remove("lock"); });
// emotes
const q = await pts();
await p.mouse.click(q.heroes[0].x, q.heroes[0].y);
await sleep(500);
await shot("07-emotes");
await p.mouse.click(W / 2, H * 0.45);
await sleep(300);
// play a few cards to fill the history, hover a minion for notes
for (let t = 0; t < 3; t++) {
  for (let k = 0; k < 60; k++) { const q2 = await pts(); if (q2?.myTurn) break; await sleep(500); }
  for (let tries = 0; tries < 3; tries++) {
    const box = await p.evaluate(() => { const c = document.querySelector(".zkl-hand .zkl-card.can-act"); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.top + 50, innerHeight - 20) }; });
    if (!box) break;
    const q3 = await pts();
    await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x, box.y - 120, { steps: 5 }); await p.mouse.move(W / 2, q3.lane, { steps: 6 }); await p.mouse.up();
    await sleep(1300);
    const q4 = await pts();
    if (q4?.targets?.length) { const tg = q4.targets[0]; await p.mouse.click(tg.x, tg.y); await sleep(1500); }
  }
  const q5 = await pts();
  await p.mouse.click(q5.end.x, q5.end.y);
  await sleep(1500);
}
for (let k = 0; k < 60; k++) { const q2 = await pts(); if (q2?.myTurn) break; await sleep(500); }
await sleep(800);
const m = (await pts()).foes[0] ?? (await pts()).mine[0];
if (m) { await p.mouse.move(m.p.x, m.p.y); await sleep(500); }
await shot("08-history-notes");
await p.mouse.move(30, 450);
await sleep(400);
await p.evaluate(() => [...document.querySelectorAll(".zkl-chip")].find((c) => /Menu|菜单/.test(c.textContent))?.click());
await sleep(500);
await shot("09-menu");
await p.evaluate(() => document.querySelector("[data-concede]")?.click());
await sleep(4500);
await shot("10-end");
console.log("errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
