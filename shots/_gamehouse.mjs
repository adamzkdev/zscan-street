// node shots/_gamehouse.mjs [out=shots/gamehouse] [--port 3072] [--night] [--only name,name]
// The Game House from a few eyes (walker placed by hand, camera raised for the overviews), + fps.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3072";
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const OUT = args.find((a) => !a.startsWith("--") && a !== port && !(only && a === only.join(","))) ?? "shots/gamehouse";
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  // (no Vite HMR reload mid-test)
  window.WebSocket = class {
    constructor() {}
    addEventListener() {}
    send() {}
    close() {}
  };
});
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=${args.includes("--night") ? "night" : "day"}`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await wait(3000);
await p.evaluate(() => street.interiors.enter("gamehouse", 0));
await p.waitForFunction(() => street.interiors.active?.key === "gamehouse", { timeout: 90000 });
await wait(6000);
// [name, floor, x, y(eye over that floor), z, yaw, pitch]
const VIEWS = JSON.parse(process.env.VIEWS ?? "null") ?? [
  ["entry", 0, 0, 1.6, -1.8, 0, -0.02],
  ["atrium-high", 0, 0, 7.5, -3, 0, -0.32],
  ["arena", 0, 0, 1.6, -24, 0, 0.12],
  ["west", 0, -6, 1.6, -14, Math.PI / 2, -0.05],
  ["east", 0, 6, 1.6, -14, -Math.PI / 2, -0.05],
  ["orchard", 0, -14, 1.6, -36, Math.PI / 2 + 0.5, -0.1],
  ["barons", 0, 14, 1.6, -34, -Math.PI / 2 - 0.4, -0.1],
  ["gallery-w", 1, -20, 1.6, -10, 0, -0.05],
  ["gallery-e", 1, 20, 1.6, -10, 0, -0.05],
  ["balcony", 1, -12.5, 1.6, -20, -Math.PI / 2 - 0.3, -0.2],
  ["back", 0, 0, 2.0, -38, Math.PI, -0.05],
];
const out = [];
for (const [name, floor, x, y, z, yaw, pitch] of VIEWS) {
  if (only && !only.includes(name)) continue;
  const r = await p.evaluate(
    async (floor, x, y, z, yaw, pitch) => {
      const I = street.interiors;
      if (I.floor !== floor) I.goTo(floor);
      await new Promise((r) => setTimeout(r, 400));
      const F = I.active.floors[floor];
      const V = I.walk.camera.position.constructor;
      I.walk.place(new V(x, F.y, z), yaw, F.y);
      I.walk.camera.position.y = F.y + y;
      I.walk.aim(yaw, pitch);
      // fps over 2 s
      let n = 0;
      const t0 = performance.now();
      await new Promise((res) => {
        const f = () => {
          n++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(f);
          else res(null);
        };
        requestAnimationFrame(f);
      });
      I.walk.camera.position.y = F.y + y;
      I.walk.aim(yaw, pitch);
      return { fps: Math.round((n * 1000) / (performance.now() - t0)), calls: street.renderer?.info?.render?.calls };
    },
    floor,
    x,
    y,
    z,
    yaw,
    pitch,
  );
  await wait(300);
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 82 });
  out.push(`${name}: ${r.fps} fps, ${r.calls ?? "?"} calls`);
}
console.log(out.join("\n"));
if (errs.length) console.log("errors:", [...new Set(errs)].slice(0, 6).join(" | "));
await b.close();
