// Shots for the residents/life work: node shots/life.mjs <name> '<json array of {pos,look,fov}>' [waitMs] [theme]
import puppeteer from "puppeteer-core";
const name = process.argv[2] ?? "life";
let views = (process.argv[3] ?? "[]").startsWith("auto:") ? null : JSON.parse(process.argv[3] ?? "[]");
const wait = Number(process.argv[4] ?? 9000);
const theme = process.argv[5] ?? "day";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => (m.type() === "error" || m.text().startsWith("[life]")) && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/?debug&capture&theme=${theme}`);
await new Promise((r) => setTimeout(r, 6000));
// capture mode only moves when stepped: run the world in real time for the rest of the wait
await p.evaluate((ms) => new Promise((r) => { const id = setInterval(() => capture.step(1 / 30), 33); setTimeout(() => { clearInterval(id); r(); }, ms); }), Math.max(0, wait - 6000));
if (!views) views = await p.evaluate(process.argv[3].slice(5));
let i = 0;
for (const v of views) {
  if (v.js) await p.evaluate(v.js);
  await p.evaluate((v) => {
    capture.shot(v);
    for (let k = 0; k < (v.steps ?? 3); k++) capture.step(1 / 30);
  }, v);
  await p.screenshot({ path: `shots/${name}-${i++}.png` });
}
if (process.argv[6]) console.log(await p.evaluate(process.argv[6]));
console.log(logs.join("\n"));
await b.close();
