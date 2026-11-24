import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); const y = g.host.ground(150, 590) ?? 0.3; g.player.place(150, y, 590, Math.PI); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let k = 0; k < 4; k++) {
  await sleep(6000);
  const v = await p.evaluate(() => [...street.gta.host.vehicles()].filter((c) => Math.abs(c.x - 158) < 30 && c.z > 540 && c.z < 660).map((c) => ({ x: +c.x.toFixed(1), z: +c.z.toFixed(1), vx: +c.vx.toFixed(1), vz: +c.vz.toFixed(1), t: c.ref?.t ?? typeof c.ref, kind: c.ref?.kind ?? c.ref?.obj?.name })));
  console.log(k, JSON.stringify(v));
}
await p.screenshot({ path: "/private/tmp/claude-501/-Users-adam-Documents-GitHub-zcash/503f98e9-812c-4daf-9fe6-4bcd7fbed3c5/scratchpad/jam.png" });
await b.close();
