// node shots/_binhai.mjs <port> <theme> — the Binhai Library in the city: live view, overview, close views, fps
import puppeteer from "puppeteer-core";
const [port = "3029", theme = "day"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1500, height: 900 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto(`http://localhost:${port}/?debug&theme=${theme}`);
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 7000));
const fps = () => p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
console.log("live fps", await fps());
await p.screenshot({ path: `shots/bh-live-${theme}.png` });
await p.evaluate(() => street.rig.setMode("overview"));
await new Promise((r) => setTimeout(r, 4000));
await p.screenshot({ path: `shots/bh-ov-${theme}.png` });
const spots = [
  ["city", 0, 100, 0.55, 0],
  ["eye", 0, 110, 1.0, 0],
  ["wide", 0, 105, 0.75, 1],
];
for (const [name, x, z, zoom, turns] of spots) {
  await p.evaluate(([x, z, zoom, turns]) => { street.rig.setMode("free"); street.rig.flyTo(new street.rig.focus.constructor(x, 1, z), zoom); if (turns) street.rig.turnBy((turns * Math.PI) / 4); }, [x, z, zoom, turns]);
  await new Promise((r) => setTimeout(r, 3500));
  await p.screenshot({ path: `shots/bh-${name}-${theme}.png` });
}
console.log("fps", await fps());
await b.close();
