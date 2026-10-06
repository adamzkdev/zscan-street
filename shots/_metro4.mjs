import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto("http://localhost:3007/?debug&capture&theme=night");
await p.waitForFunction(() => window.capture && window.street, { timeout: 120000 });
const step = async (sec) => { const end = Date.now() + sec * 1000; while (Date.now() < end) { await p.evaluate(() => capture.step(1 / 30)); await new Promise((r) => setTimeout(r, 15)); } };
await step(10);
await p.evaluate(() => street.director.debugQueue(12));
await step(3);
await p.evaluate(() => street.testBoard());
// wait until most are seated
for (let k = 0; k < 60; k++) {
  await step(2);
  const n = await p.evaluate(() => [...street.director.snarks].filter((s) => s.state === "riding" && !s.bus).length);
  const st = await p.evaluate(() => { const t = street.metro.trains[0]; return t ? t.dwell : -1; });
  if (n >= 8 || (k > 40)) { console.log("seated", n, "dwell", st); break; }
}
// outside, at the platform
await p.evaluate(() => { const c = street.metro.trains[0].cars[1]; const v = c.position; capture.shot({ pos: [v.x + 3, v.y + 1.8, v.z + 6.5], look: [v.x, v.y + 1.2, v.z], fov: 45 }); capture.step(1 / 30); });
await p.screenshot({ path: "shots/m4-0.png" });
// inside
await p.evaluate(() => { capture.shot(null); street.rig.rideTrain(street.metro.trains[0].cars[0]); for (let i = 0; i < 10; i++) capture.step(1 / 30); });
await p.screenshot({ path: "shots/m4-1.png" });
await step(6);
await p.screenshot({ path: "shots/m4-2.png" });
await b.close();
