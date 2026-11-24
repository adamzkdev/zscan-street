// node shots/_qalots.mjs [TAG]: the port and the Gardens by the Bay from the air (their lots' edges: built to fit, not squashed)
import puppeteer from "puppeteer-core";
const [TAG = "lots"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const warns = [];
p.on("console", (m) => /spills/.test(m.text()) && warns.push(m.text()));
await p.goto("http://localhost:3061/?debug&capture&theme=day");
await p.waitForFunction(() => window.capture && window.street, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let k = 0; k < 60; k++) { await p.evaluate(() => { for (let i = 0; i < 5; i++) capture.step(1 / 30); }); if (await p.evaluate(() => !!window.__streetUp)) break; await sleep(1500); }
await p.evaluate(() => capture.ui(false));
for (const [name, v] of [["port-back", { pos: [-175, 60, 30], look: [-175, 0, 100], fov: 55 }], ["port-front", { pos: [-150, 40, 170], look: [-175, 0, 105], fov: 55 }], ["gardens-front", { pos: [171, 35, 60], look: [171, 0, 105], fov: 55 }], ["gardens-side", { pos: [230, 50, 100], look: [171, 0, 105], fov: 55 }]]) {
  await p.evaluate((v) => { capture.shot(v); for (let i = 0; i < 30; i++) capture.step(1 / 30); }, v);
  await sleep(500);
  await p.screenshot({ path: `shots/gta/qa-out/${TAG}-${name}.png` });
}
console.log("spill warnings", warns.length, warns.slice(0, 12).join(" | "));
await b.close();
