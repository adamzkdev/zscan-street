// node shots/_trafstress.mjs: the city traffic run on its own for an hour of game time (synchronous steps), any throw reported
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 960, height: 540 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && /^frame/.test(m.text())) errs.push(m.text().slice(0, 200)); });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const r = await p.evaluate(() => {
  const t = street.gta.host.traffic;
  let steps = 0, throws = 0, first = "", exits = 0, maxCars = 0, nan = 0;
  const inBend = new Set();
  for (let i = 0; i < 216000; i++) {
    try { t.update(1 / 60); } catch (e) { throws++; if (!first) first = String(e && e.stack).slice(0, 600); }
    steps++;
    let n = 0;
    for (const c of t.movers) {
      n++;
      if (c.bend) inBend.add(c); else if (inBend.delete(c)) exits++;
      const q = c.group.position;
      if (!Number.isFinite(q.x + q.z + c.group.rotation.y)) nan++;
    }
    maxCars = Math.max(maxCars, n);
  }
  return { steps, minutes: +(steps / 3600).toFixed(1), throws, first, bendExits: exits, maxCars, nan };
});
console.log(JSON.stringify(r));
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
