// node shots/_towers.mjs — the ZODL and Vizor towers from the avenue (dev server on $PORT, 3008 by default)
import puppeteer from "puppeteer-core";
const PORT = process.env.PORT ?? 3008;
const theme = process.argv[2] ?? "night";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${PORT}/?debug&theme=${theme}`);
for (let k = 0; k < 120 && !(await p.evaluate(() => !!window.street?.onFoot).catch(() => false)); k++) await wait(1000);
await wait(9000);
const view = async (name, x, z, yaw, pitch) => {
  await p.evaluate((v) => {
    street.walk(true);
    const V = street.onFoot.camera.position.constructor;
    street.onFoot.place(new V(v.x, 0.2, v.z), v.yaw);
    street.onFoot.pitch = v.pitch;
  }, { x, z, yaw, pitch });
  await wait(2500);
  await p.screenshot({ path: `shots/towers-${name}-${theme}.png` });
  console.log(`shots/towers-${name}-${theme}.png`);
};
await view("zodl", 102.5, -1, 0, 0.78);
await view("zodl-far", 66, 1, -0.97, 0.42);
await view("vizor", 209.5, -2.5, Math.PI, 0.72);
await view("vizor-far", 178, -3, -2.14, 0.4);
await b.close();
