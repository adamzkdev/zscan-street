// node shots/_louvre.mjs '<json spots>' [--port 3038] : Louvre stills. Spots: [[name, floor, x, z, yaw, pitch, waitMs?], …]
// (yaw 0 looks toward −z). Each still is followed by the title of what sits at the centre of the view.
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3038";
const spots = JSON.parse(args[0]);
const OUT = process.env.OUT ?? "/tmp";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 760 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=${process.env.THEME ?? "night"}`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await wait(4000);
await p.evaluate(() => street.enter("museum"));
await wait(2500);
let floor = -1;
for (const [name, f, x, z, yaw, pitch, ms] of spots) {
  if (f !== floor) {
    await p.evaluate((f) => street.interiors.goTo(f), f);
    await wait(10000);
    floor = f;
  }
  await p.evaluate(([x, z, yaw, pitch]) => {
    const I = street.interiors, W = I.walk;
    const V = W.camera.position.constructor;
    const fy = I.active.floors[I.floor].y;
    W.place(new V(x, fy, z), yaw, fy);
    W.pitch = pitch;
  }, [x, z, yaw, pitch]);
  await wait(ms ?? 1800);
  await p.screenshot({ path: `${OUT}/lv-${name}.jpg`, type: "jpeg", quality: 82 });
  console.log(name, await p.evaluate(() => street.interiors.pickAt(640, 380)?.title ?? null));
}
console.log("errors", errs.slice(0, 5).join(" | ") || "none");
await b.close();
