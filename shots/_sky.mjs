// node shots/_sky.mjs <port> <day|night> "name:px,py,pz;lx,ly,lz[;fov]|..."  — capture-mode stills (shots/sky-<name>.png)
import puppeteer from "puppeteer-core";
const [port = 3007, theme = "day", views = ""] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto(`http://localhost:${port}/?debug&capture&theme=${theme}`, { timeout: 0, waitUntil: "domcontentloaded" });
await p.waitForFunction(() => window.capture && window.street, { timeout: 180000 });
await p.evaluate(() => { for (let i = 0; i < 60; i++) capture.step(0.1); });
await new Promise((r) => setTimeout(r, 4000));
for (const v of views.split("|").filter(Boolean)) {
  const [name, rest] = v.split(":");
  const [pos, look, fov] = rest.split(";");
  await p.evaluate((pos, look, fov) => { capture.shot({ pos, look, fov }); for (let i = 0; i < 8; i++) capture.step(0.05); }, pos.split(",").map(Number), look.split(",").map(Number), fov ? Number(fov) : 50);
  await new Promise((r) => setTimeout(r, 600));
  await p.screenshot({ path: `shots/sky-${name}-${theme}.png` });
  console.log(`shots/sky-${name}-${theme}.png`);
}
await b.close();
