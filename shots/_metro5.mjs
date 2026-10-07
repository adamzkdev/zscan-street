import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto("http://localhost:3007/?debug&capture&theme=" + (process.argv[2] ?? "day"));
await p.waitForFunction(() => window.capture && window.street, { timeout: 120000 });
const step = async (sec) => { const end = Date.now() + sec * 1000; while (Date.now() < end) { await p.evaluate(() => capture.step(1 / 30)); await new Promise((r) => setTimeout(r, 15)); } };
const stepSim = async (sec) => { for (let i = 0; i < sec * 30; i++) await p.evaluate(() => capture.step(1 / 30)); };
await step(10);
await p.evaluate(() => street.director.debugQueue(12));
await step(3);
await p.evaluate(() => street.testBoard());
for (let k = 0; k < 40; k++) {
  await step(2);
  const n = await p.evaluate(() => [...street.director.snarks].filter((s) => s.state === "riding" && !s.bus).length);
  if (n >= 8) break;
}
const info = () => p.evaluate(() => { const t = street.metro.trains[0]; if (!t) return "no train"; const c = t.cars[0].position; return `s=${t.s.toFixed(0)}/${street.metro.route.length.toFixed(0)} v=${t.v.toFixed(1)} dwell=${t.dwell.toFixed(1)} at ${c.x.toFixed(0)},${c.z.toFixed(0)} vis=${t.cars[0].visible}`; });
for (let i = 0; i < 6; i++) {
  await step(5);
  console.log(await info());
  await p.evaluate(() => { const t = street.metro.trains[0]; if (!t) return; const v = t.cars[1].position; capture.shot({ pos: [v.x + 22, v.y + 16, v.z + 30], look: [v.x, v.y, v.z], fov: 45 }); capture.step(1 / 30); });
  await p.screenshot({ path: `shots/m5-${i}.png` });
}
await b.close();
