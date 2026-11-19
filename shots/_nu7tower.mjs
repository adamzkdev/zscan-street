// node shots/_nu7tower.mjs [day|night] [port]: the NU7 TOWER, every floor from a couple of spots
// (shots/nu7tower/<theme>-<floor>-<n>.jpg), the console's errors.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const theme = process.argv[2] ?? "day";
const port = process.argv[3] ?? "3050";
const only = process.env.FLOORS ? process.env.FLOORS.split(",").map(Number) : null;
mkdirSync("shots/nu7tower", { recursive: true });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|WebSocket connection|429/.test(m.text()) && errs.push(m.text().slice(0, 300)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&nofilm&theme=${theme}`);
await p.waitForFunction(() => window.street?.interiors && window.__streetUp, { timeout: 240000, polling: 200 });
// (as a visitor would: the doors open once the quarter knows NU7 is live)
for (let i = 0; i < 40 && !(await p.evaluate(() => street.game.nu7Quarter.done)); i++) await wait(1000);
await wait(2000);
await p.evaluate(() => street.interiors.enter("nu7tower", 0));
await wait(4000);
// [floor, x, z, yaw, tilt]
const VIEWS = [
  [0, 0, -2.6, 0, -0.04],
  [0, -11, -9, -2.1, 0.02],
  [0, 9, -24, 0.75, 0.05],
  [1, 12.4, -14.7, Math.PI / 2, -0.05],
  [1, -6, -3, 2.4, 0.02],
  [1, 7, -8, 0.15, 0.05],
  [1, -14.5, -16.2, Math.PI / 2, -0.02],
  [2, 1.7, -3, 0, 0.0],
  [2, 9, -22, 1.4, 0.04],
  [2, -4, -17.6, -0.4, 0.15],
  [3, 1.7, -3, 0, 0.12],
  [3, -9, -14, -0.6, 0.12],
  [3, 8, -22, 0.6, 0.1],
  [4, 1.7, -5, 0, 0.18],
  [4, -6, -6, -0.7, 0.05],
  [4, 4, -11, 1.0, 0.45],
  [5, 0, -6, Math.PI, -0.05],
  [5, -6, -12, Math.PI / 2, -0.28],
  [5, 4, -4, -1.9, 0.18],
  [5, -12, -9, Math.PI / 2 - 0.3, -1.05],
  [5, 6, -14, -Math.PI / 2, 0.05],
];
let last = -1,
  n = 0;
for (const [fl, x, z, yaw, tilt] of VIEWS) {
  if (only && !only.includes(fl)) continue;
  if (fl !== last) {
    await p.evaluate((fl) => street.interiors.goTo(fl), fl);
    await wait(3500);
    last = fl;
    n = 0;
  }
  await p.evaluate(
    ([x, z, yaw, tilt]) => {
      const I = street.interiors,
        W = I.walk;
      const y = I.active.floors[I.floor].y;
      const V = W.camera.position.constructor;
      W.place(new V(x, y, z), yaw, y);
      W.aim(yaw, tilt);
    },
    [x, z, yaw, tilt],
  );
  await wait(1600);
  await p.screenshot({ path: `shots/nu7tower/${theme}-${fl}-${n++}.jpg`, type: "jpeg", quality: 80 });
}
console.log(JSON.stringify(await p.evaluate(() => ({ floor: street.interiors.floor, problems: street.interiors.circ?.problems ?? [] }))));
console.log("errors:", errs.length, errs.slice(0, 12).join("\n"));
await b.close();
