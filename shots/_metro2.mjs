import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto("http://localhost:3007/?debug&capture&theme=night");
await p.waitForFunction(() => window.capture && window.street, { timeout: 120000 });
const step = async (sec) => { const end = Date.now() + sec * 1000; while (Date.now() < end) { await p.evaluate(() => capture.step(1 / 30)); await new Promise((r) => setTimeout(r, 20)); } };
await step(6);
console.log("queued", await p.evaluate(() => street.director.debugQueue(12)));
await step(4);
await p.evaluate(() => street.testBoard());
const shots = [
  [8, { pos: [14, 9, 18], look: [20, 1, 30], fov: 55 }],
  [10, { pos: [34, 14, 50], look: [16, 8, 40], fov: 55 }],
  [10, { pos: [-8, 14, 46], look: [6, 9.5, 37], fov: 55 }],
  [8, { pos: [-8, 14, 46], look: [6, 9.5, 37], fov: 55 }],
];
let i = 0;
for (const [sec, cam] of shots) {
  await step(sec);
  await p.evaluate((c) => { capture.shot(c); capture.step(1 / 30); }, cam);
  await p.screenshot({ path: `shots/m2-${i++}.png` });
  console.log(i, await p.evaluate(() => { const t = street.metro.trains[0]; const c = {}; for (const s of street.director.snarks) c[s.state] = (c[s.state] ?? 0) + 1; return JSON.stringify({ train: t ? { s: +t.s.toFixed(0), dwell: +t.dwell.toFixed(1), held: t.held } : null, states: c }); }));
}
await b.close();
