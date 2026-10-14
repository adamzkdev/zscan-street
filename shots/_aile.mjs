// node shots/_aile.mjs [--port 3038] : the Louvre's Aile des Apparitions (floor 4) from a few spots, and a click on each piece.
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3038";
const OUT = process.env.OUT ?? "/tmp";
const THEME = process.env.THEME ?? "night";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 760 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=${THEME}`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await wait(4000);
await p.evaluate(() => street.enter("museum"));
await wait(2500);
await p.evaluate(() => street.interiors.goTo(4));
await wait(14000);
// [name, x, z, yaw (0 = toward −z), pitch]
const spots = [
  ["entrance", 0, -3, 0, 0.05],
  ["fusion", 0, -15, 0, 0.12],
  ["fusion-side", 8, -18, 0.75, 0.1],
  ["wall-left", -9, -20, 1.35, 0.06],
  ["flow", -6.9, -34, 0, 0.04],
  ["strategies", 6.9, -34, 0, 0.04],
  ["dna", -6.9, -54, Math.PI, 0.04],
  ["holes", 0, -50, 0, 0.12],
];
for (const [name, x, z, yaw, pitch] of spots) {
  await p.evaluate(([x, z, yaw, pitch]) => {
    const I = street.interiors, W = I.walk;
    const V = W.camera.position.constructor;
    const fy = I.active.floors[I.floor].y;
    W.place(new V(x, fy, z), yaw, fy);
    W.pitch = pitch;
  }, [x, z, yaw, pitch]);
  await wait(name.startsWith("fusion") ? 4200 : 1500);
  await p.screenshot({ path: `${OUT}/aile-${name}.jpg`, type: "jpeg", quality: 80 });
  const info = await p.evaluate(() => street.interiors.pickAt(640, 380)?.title ?? null);
  console.log(name, "click:", info);
}
console.log("errors", errs.slice(0, 6).join(" | ") || "none");
await b.close();
