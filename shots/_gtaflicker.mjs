// node shots/_gtaflicker.mjs [URL]: how often a zkSNARK drawn in 3D goes back to flat and comes back within 2.5 s (the flicker), while the camera turns round on a busy street; and the passers-by born or gone in sight
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  const W = window.WebSocket;
  const F = function (u, pr) {
    if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
    return pr === undefined ? new W(u) : new W(u, pr);
  };
  F.prototype = W.prototype;
  Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = F;
});
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [x, z] of [[0, 3.5], [-86, 0], [122, -20]]) {
  await p.evaluate((x, z) => {
    const g = street.gta;
    g.player.place(x, 0.2, z, 0);
    g.cam.behind(0, -0.1);
    g.cam.snap(g.player.pos.clone().setY(1.55));
    // watch the passers-by: born and gone in sight
    window.__pedLog = { bornSeen: 0, born: 0, goneSeen: 0, gone: 0 };
    const peds = g.peds;
    const known = new Set(peds.peds.map((q) => q.key));
    clearInterval(window.__pedT);
    window.__pedT = setInterval(() => {
      const now = new Set();
      for (const q of peds.peds) {
        now.add(q.key);
        if (!known.has(q.key)) {
          window.__pedLog.born++;
          if (g.seen(q.pos.x, q.pos.z) && Math.hypot(q.pos.x - g.player.pos.x, q.pos.z - g.player.pos.z) < 45) window.__pedLog.bornSeen++;
        }
      }
      known.clear();
      for (const k of now) known.add(k);
    }, 100);
  }, x, z);
  await sleep(6000);
  const c0 = await p.evaluate(() => street.gta.people.counts);
  // turn round, slowly, twice
  for (let k = 0; k < 120; k++) {
    await p.evaluate((k) => street.gta.cam.behind((k / 60) * Math.PI * 2, -0.1), k);
    await sleep(100);
  }
  const c1 = await p.evaluate(() => street.gta.people.counts);
  const log = await p.evaluate(() => window.__pedLog);
  console.log(`(${x},${z}) in3d ${c1.in3d} limit ${c1.limit} churn during the turn: ${c1.churn - c0.churn} · dropped in the picture: ${c1.seenDrop - c0.seenDrop} · passers-by born ${log.born} of which in sight < 45 m: ${log.bornSeen}`);
}
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
