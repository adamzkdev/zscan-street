// node shots/_wheels.mjs: every traffic vehicle keeps its wheels (count, visible, attached) over a minute of traffic
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let k = 0; k < 6; k++) {
  const r = await p.evaluate(() => {
    const bad = [];
    let n = 0;
    for (const m of street.gta.host.traffic.movers) {
      n++;
      const wheels = [];
      m.group.traverse((o) => o.name === "wheel" && wheels.push(o));
      const shown = wheels.filter((w) => { for (let q = w; q; q = q.parent) if (!q.visible) return false; return true; });
      const meshes = wheels.reduce((s, w) => { let c = 0; w.traverse((o) => o.isMesh && c++); return s + c; }, 0);
      const want = m.kind === "moto" ? 2 : 4;
      if (wheels.length < want || shown.length < want || meshes === 0) bad.push({ kind: m.kind, wheels: wheels.length, shown: shown.length, meshes });
    }
    return { n, bad };
  });
  console.log(k, JSON.stringify(r));
  await sleep(10000);
}
console.log("errors", errs.length);
await b.close();
