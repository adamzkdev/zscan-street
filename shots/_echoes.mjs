// node shots/_echoes.mjs [--port 3077] : Louvre floor 7, ECHOES (FLOOR=n for another floor) — stills at set moments after arriving.
// Each shot: [name, x, z, yaw, pitch, atSeconds, click?]; the floor restarts on arrival (blank 6.5 s, then
// pieces). click: true = click the centre of the view first (a small monolith: its piece goes up).
// FPS=1 measures frames per second at the end (from the last spot).
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3077";
const OUT = process.env.OUT ?? "/tmp";
const shots = JSON.parse(args.find((a) => a.startsWith("[")) ?? "[]");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=${process.env.THEME ?? "night"}`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await wait(4000);
await p.evaluate(() => street.enter("museum"));
await wait(2500);
// visit once so the pieces load, then leave and come back: the show starts over
await p.evaluate((f) => street.interiors.goTo(f), Number(process.env.FLOOR ?? 7));
await wait(9000);
await p.evaluate(() => street.interiors.goTo(6));
await wait(2500);
await p.evaluate((f) => street.interiors.goTo(f), Number(process.env.FLOOR ?? 7));
const t0 = Date.now();
for (const [name, x, z, yaw, pitch, at, click] of shots) {
  await p.evaluate(([x, z, yaw, pitch]) => {
    const I = street.interiors, W = I.walk;
    const V = W.camera.position.constructor;
    const fy = I.active.floors[I.floor].y;
    W.place(new V(x, fy, z), yaw, fy);
    W.pitch = pitch;
  }, [x, z, yaw, pitch]);
  if (click) {
    await wait(400);
    console.log("  clicked:", await p.evaluate(() => {
      const r = street.interiors.pickAt(innerWidth / 2, innerHeight / 2);
      return r ? `${r.eyebrow} / ${r.title}` : null;
    }));
  }
  const dt = at * 1000 - (Date.now() - t0);
  if (dt > 0) await wait(dt);
  await p.screenshot({ path: `${OUT}/ec-${name}.jpg`, type: "jpeg", quality: 85 });
  console.log(name, ((Date.now() - t0) / 1000).toFixed(1));
}
if (process.env.FPS)
  console.log("fps", await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); }; requestAnimationFrame(f); })));
console.log("errors", errs.slice(0, 6).join(" | ") || "none");
await b.close();
