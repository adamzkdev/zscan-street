// node shots/_walldoor.mjs — walk into the ZODL and Vizor towers through their street doors (dev server on $PORT)
import puppeteer from "puppeteer-core";
const PORT = process.env.PORT ?? 3008;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${PORT}/?debug&theme=night`);
for (let k = 0; k < 120 && !(await p.evaluate(() => !!window.street?.onFoot).catch(() => false)); k++) await wait(1000);
await wait(8000);
for (const [key, x, z, yaw] of [
  ["zodl", 102.5, 0.5, 0],
  ["vizor", 209.5, -3.5, Math.PI],
]) {
  await p.evaluate((v) => {
    street.walk(true);
    const V = street.onFoot.camera.position.constructor;
    street.onFoot.place(new V(v.x, 0.2, v.z), v.yaw);
    street.onFoot.pitch = 0;
  }, { x, z, yaw });
  await wait(800);
  await p.keyboard.down("KeyW");
  let inside = null;
  for (let i = 0; i < 40 && !inside; i++) {
    await wait(250);
    inside = await p.evaluate(() => street.interiors.active?.key ?? null);
  }
  await p.keyboard.up("KeyW");
  console.log(key, "→", inside);
  await wait(1500);
  await p.screenshot({ path: `shots/walldoor-${key}.png` });
  await p.evaluate(() => street.interiors.active && street.interiors.exit());
  await wait(2500);
}
await b.close();
