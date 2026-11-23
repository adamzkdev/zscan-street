// node shots/_gtaviaduct.mjs [URL] [OUT]: the viaducts' bents and the river bridges at street level (nothing in the road)
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/via/v"] = process.argv.slice(2);
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
await p.evaluate(() => { street.gta.hud.coach(-1); document.querySelector(".gta-hud").style.display = "none"; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// [x, z, heading] (0 = looking north/−z, π/2 = west, −π/2 = east, π = south)
const SPOTS = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [
  [60, 33, -Math.PI / 2], [-150, 140, Math.PI / 2], [-150, -232, Math.PI / 2], [-221, -150, 0], [118, -150, Math.PI], [221, 20, Math.PI],
  [-122, 50, Math.PI], [-194, 85, 0], [54, 50, Math.PI], [122, 88, 0],
];
let n = 0;
for (const [x, z, h] of SPOTS) {
  await p.evaluate((x, z, h) => {
    const g = street.gta;
    g.player.place(x, 0.2, z, h);
    g.cam.behind(h, -0.05);
    g.cam.snap(g.player.pos.clone().setY(1.55));
  }, x, z, h);
  await sleep(1600);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}.png` });
}
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
