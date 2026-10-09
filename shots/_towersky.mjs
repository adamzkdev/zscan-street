// node shots/_towersky.mjs [night|day] — the wallet towers from the air (capture camera)
import puppeteer from "puppeteer-core";
const PORT = process.env.PORT ?? 3008;
const theme = process.argv[2] ?? "night";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${PORT}/?debug&capture&theme=${theme}`);
for (let k = 0; k < 120 && !(await p.evaluate(() => !!window.capture).catch(() => false)); k++) await wait(1000);
await wait(10000);
const shot = async (name, pos, look) => {
  await p.evaluate((s) => window.capture.shot({ pos: s.pos, look: s.look, fov: 40, far: 900 }), { pos, look });
  for (let i = 0; i < 40; i++) await p.evaluate(() => window.capture.step(1 / 30));
  await wait(800);
  await p.screenshot({ path: `shots/towersky-${name}-${theme}.png` });
  console.log(`shots/towersky-${name}-${theme}.png`);
};
await shot("zodl", [140, 95, 75], [102.5, 70, -22]);
await shot("vizor", [170, 90, -80], [209.5, 65, 17]);
await shot("noir", [10, 150, 90], [70, 120, -22]);
await shot("avenue", [20, 120, 70], [160, 60, -5]);
await b.close();
