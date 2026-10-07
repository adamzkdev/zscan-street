// node shots/_cemin.mjs [--port 3036]: the crypt (interior "cemetery"): views, a tomb's panel, fps, errors.
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3036";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${port}/?debug&theme=night`);
await p.waitForFunction(() => window.street, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 4000));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fps = () => p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
const t0 = Date.now();
await p.evaluate(() => street.enter("cemetery"));
await p.waitForFunction(() => street.interiors.active, { timeout: 60000 });
console.log("enter", Date.now() - t0, "ms");
await wait(5000);
const shots = [
  ["entry", [0, 3.9], 0, -0.05],
  ["hall", [0, -9.5], 0, -0.12],
  ["sprout", [0, -19.5], 0, -0.1],
  ["side", [1.2, -15], Math.PI / 2 + 0.2, -0.15],
];
for (const [name, [x, z], yaw, pitch] of shots) {
  await p.evaluate(([x, z, yaw, pitch]) => { const w = street.interiors.walk; w.place(new w.camera.position.constructor(x, 0, z), yaw); w.pitch = pitch; }, [x, z, yaw, pitch]);
  await wait(2500);
  const f = await fps();
  await p.screenshot({ path: `shots/cemin-${name}.png` });
  console.log(name, "fps", f);
}
console.log("errors:", errs.slice(0, 5).join(" | ") || "none");
await b.close();
