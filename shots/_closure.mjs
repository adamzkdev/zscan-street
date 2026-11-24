// node shots/_closure.mjs [OUT]: the city's buildings from every side (free camera, capture mode): oblique aerials over
// ordinary blocks, the backs of rows, the heart, the south bank, Orchard Keys — to spot shells (2–3 walls, no roof)
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/closure/c"] = process.argv.slice(2);
const V = (px, py, pz, lx, ly, lz, fov = 55) => ({ pos: [px, py, pz], look: [lx, ly, lz], fov });
const VIEWS = {
  "a-westres": V(-200, 55, 60, -160, 0, 20),
  "a-uptown": V(-30, 60, -250, 10, 0, -190),
  "a-midtown": V(240, 60, -150, 180, 0, -150),
  "a-finance": V(250, 50, 50, 190, 0, 10),
  "a-southbank": V(-20, 50, 160, -60, 0, 100),
  "a-marina": V(240, 50, 160, 180, 0, 110),
  "a-heart-back": V(-70, 40, -60, -20, 0, -20),
  "a-heart-s": V(20, 35, 60, 0, 0, 10),
  "a-keys": V(120, 50, 280, 170, 0, 330),
  "a-parkside": V(-120, 55, -130, -90, 0, -80),
  "g-back1": V(-138, 1.7, -60, -160, 6, -80),
  "g-back2": V(170, 1.7, -175, 150, 6, -190),
  "g-corner1": V(-104, 1.7, 46, -90, 8, 30),
  "g-corner2": V(70, 1.7, 118, 90, 8, 100),
  "o-orchard": V(102, 40, -95, 102, 10, -136),
  "o-orchard-far": V(60, 60, -60, 102, 10, -136),
  "o-orchard-street": V(102.5, 1.7, -108, 102.5, 12, -136),
};
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(VIEWS);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(`http://localhost:3061/?debug&capture&theme=day${process.env.QS ? "&" + process.env.QS : ""}`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 300000, polling: 300 });
for (let k = 0; k < 40; k++) {
  await p.evaluate(() => { for (let i = 0; i < 5; i++) capture.step(1 / 30); });
  if (await p.evaluate(() => !!window.__streetUp)) break;
  await new Promise((r) => setTimeout(r, 1500));
}
await p.evaluate(() => { capture.theme("day"); for (let i = 0; i < 30; i++) capture.step(1 / 30); });
for (const name of only) {
  await p.evaluate((v) => { capture.shot(v); for (let i = 0; i < 20; i++) capture.step(1 / 30); }, VIEWS[name]);
  await new Promise((r) => setTimeout(r, 600));
  await p.evaluate(() => { for (let i = 0; i < 6; i++) capture.step(1 / 30); });
  await p.screenshot({ path: `${OUT}-${name}.png` });
}
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
