// A GAMEPARTY mini-game in ZK PARTY's bench, four AIs: node shots/_gpshot.mjs <key> <outdir> [at=4,10,20] [w h] [extra]
import puppeteer from "puppeteer-core";
const key = process.argv[2];
const out = process.argv[3] ?? "shots";
const at = (process.argv[4] ?? "4,10,20").split(",").map(Number);
const w = Number(process.argv[5] ?? 1280), h = Number(process.argv[6] ?? 720);
const extra = process.argv[7] ?? "";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: w, height: h } });
const p = await b.newPage();
// (Vite's reload socket stubbed: an edit elsewhere must not reload the page mid-game)
await p.evaluateOnNewDocument(() => {
  window.WebSocket = class {
    constructor() {}
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  };
});
const logs = [];
p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || "").split("\n").slice(0, 4).join("\n")}`));
await p.goto(`http://localhost:3007/partylab.html?g=${key}&auto&seed=3${extra}`);
const t0 = Date.now();
let k = 0;
for (const s of at) {
  while ((Date.now() - t0) / 1000 < s) {
    await new Promise((r) => setTimeout(r, 250));
    const done = await p.evaluate(() => window.lab?.done);
    if (done) break;
  }
  const ph = await p.evaluate(() => JSON.stringify(window.labPhase ?? null));
  await p.screenshot({ path: `${out}/${key}-${k++}.jpg`, quality: 70 });
  console.log(`t=${s}s phase=${ph}`);
  if (await p.evaluate(() => window.lab?.done)) break;
}
const deadline = Date.now() + 120000;
while (!(await p.evaluate(() => window.lab?.done)) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 500));
console.log("result", JSON.stringify(await p.evaluate(() => window.lab)));
console.log(logs.filter((l) => !/GPU stall|WebGL-|\[stage\] WebGL up/.test(l)).slice(0, 15).join("\n") || "no errors");
await b.close();
