// node shots/_realbaycap.mjs [BASE] [OUT]: the bay's landmarks (Golden Gate, statue, opera, the rock) from a free camera
// (capture mode), day and night. BASE e.g. http://localhost:3061 (the "before" build on another port). ONLY=gg-side,… THEMES=day,night
import puppeteer from "puppeteer-core";
const [BASE = "http://localhost:3061", OUT = "shots/gta/bay/cap"] = process.argv.slice(2);
const VIEWS = {
  "gg-side": { pos: [104, 7, 178], look: [158, 18, 186], fov: 60 },
  "gg-city": { pos: [146, 11, 122], look: [160, 16, 196], fov: 58 },
  "gg-tower": { pos: [176, 4, 150], look: [158, 30, 166], fov: 62 },
  "gg-deck": { pos: [171, 9, 186], look: [154, 7, 214], fov: 60 },
  "gg-far": { pos: [40, 30, 120], look: [160, 14, 200], fov: 45 },
  "statue-front": { pos: [46, 16, 238], look: [46, 26, 190], fov: 52 },
  "statue-close": { pos: [64, 30, 212], look: [46, 36, 189], fov: 55 },
  "statue-back": { pos: [53, 4, 164], look: [46, 26, 190], fov: 58 },
  "opera-bay": { pos: [-30, 10, 238], look: [-44, 12, 182], fov: 55 },
  "opera-quay": { pos: [-82, 8, 150], look: [-44, 10, 182], fov: 55 },
  "opera-steps": { pos: [-36, 3.2, 156], look: [-46, 10, 182], fov: 62 },
  "rock-ferry": { pos: [-118, 5, 160], look: [-121, 10, 194], fov: 58 },
};
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(VIEWS);
const themes = (process.env.THEMES ?? "day,night").split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(`${BASE}/?debug&capture&theme=day`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 300000, polling: 300 });
// (the city streams in while the frames run)
for (let k = 0; k < 40; k++) {
  await p.evaluate(() => { for (let i = 0; i < 5; i++) capture.step(1 / 30); });
  if (await p.evaluate(() => !!window.__streetUp)) break;
  await new Promise((r) => setTimeout(r, 1500));
}
for (const theme of themes) {
  await p.evaluate((t) => { capture.theme(t); for (let i = 0; i < 30; i++) capture.step(1 / 30); }, theme);
  for (const name of only) {
    const v = VIEWS[name];
    await p.evaluate((v) => { capture.shot(v); for (let i = 0; i < 12; i++) capture.step(1 / 30); }, v);
    await p.screenshot({ path: `${OUT}-${name}-${theme}.png` });
  }
}
if (!process.env.NOISO) {
  // the city's own iso view over the bay (the map view)
  await p.evaluate(() => { capture.theme("day"); capture.rig(110, 186, 0.42); for (let i = 0; i < 90; i++) capture.step(1 / 30); });
  await p.screenshot({ path: `${OUT}-iso.png` });
}
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
