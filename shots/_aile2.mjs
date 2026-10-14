// node shots/_aile2.mjs [--port 3038] : La Fusion through one cycle, a painting close up, the lifts on every Louvre floor, the 10,000 with its holes.
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3038";
const OUT = process.env.OUT ?? "/tmp";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 760 } });
const p = await b.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=night`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await wait(4000);
await p.evaluate(() => street.enter("museum"));
await wait(2500);
const place = (x, z, yaw, pitch) =>
  p.evaluate(([x, z, yaw, pitch]) => {
    const I = street.interiors, W = I.walk;
    const V = W.camera.position.constructor;
    const fy = I.active.floors[I.floor].y;
    W.place(new V(x, fy, z), yaw, fy);
    W.pitch = pitch;
  }, [x, z, yaw, pitch]);
// lifts, floors 0–3, seen from the room
for (const [f, x, z] of [[0, 14, -7], [1, 0, -7], [2, 4.5, -7], [3, 0, -7]]) {
  await p.evaluate((f) => street.interiors.goTo(f), f);
  await wait(2500);
  await place(x, z, Math.PI, 0.1);
  await wait(1200);
  await p.screenshot({ path: `${OUT}/lifts-${f}.jpg`, type: "jpeg", quality: 75 });
}
await p.evaluate(() => street.interiors.goTo(4));
await wait(12000);
await place(0, -13, 0, 0.14);
for (let i = 0; i < 6; i++) {
  await wait(1700);
  await p.screenshot({ path: `${OUT}/fusion-${i}.jpg`, type: "jpeg", quality: 80 });
}
await place(-11.5, -16, Math.PI / 2, 0.08);
await wait(2500);
await p.screenshot({ path: `${OUT}/painting.jpg`, type: "jpeg", quality: 80 });
console.log("painting click:", await p.evaluate(() => JSON.stringify(street.interiors.pickAt(640, 200))));
await b.close();
