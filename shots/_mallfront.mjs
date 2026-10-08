// node shots/_mallfront.mjs [--port 3038] : the ZK MALL's front on foot (the film standees by the doors, the LED
// walls with their film ads), $OUT/mallfront-<theme>.jpg
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3038";
const OUT = process.env.OUT ?? "/tmp";
const THEME = process.env.THEME ?? "night";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1200, height: 740 } });
const p = await b.newPage();
await p.goto(`http://localhost:${port}/?debug&theme=${THEME}`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 6000));
await p.evaluate(() => street.walk(true));
const mall = await p.evaluate(() => { const m = street.city.landmarks.get("mall"); return { x: m.door.x, z: m.door.z, yaw: m.yaw }; });
for (const [d, up, name] of [[13, 0, "near"], [30, 0.32, "far"]]) {
  await p.evaluate(([m, d, up]) => {
    const W = street.onFoot;
    const V = W.camera.position.constructor;
    W.place(new V(m.x + Math.sin(m.yaw) * d, 0.2, m.z + Math.cos(m.yaw) * d), m.yaw);
    W.pitch = up;
  }, [mall, d, up]);
  await new Promise((r) => setTimeout(r, 3500));
  await p.screenshot({ path: `${OUT}/mallfront-${name}-${THEME}.jpg`, type: "jpeg", quality: 78 });
}
await b.close();
