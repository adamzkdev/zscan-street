// node shots/_zkt.mjs [night|day] [port]: city shots round the three ZK towers
import puppeteer from "puppeteer-core";
const theme = process.argv[2] ?? "night", port = process.argv[3] ?? "3007";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1500, height: 900 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto(`http://localhost:${port}/?debug&theme=${theme}`);
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 8000));
await p.evaluate(() => street.rig.setMode("overview"));
await new Promise((r) => setTimeout(r, 3000));
for (const [n, x, z, zoom] of [["orchard", 102, -136, 0.45], ["sapling", 210, 88, 0.45], ["halo", 210, -22, 0.45], ["east", 150, -40, 0.25]]) {
  await p.evaluate((x, z, zoom) => street.rig.flyTo(new street.rig.focus.constructor(x, 1, z), zoom), x, z, zoom);
  await new Promise((r) => setTimeout(r, 4500));
  await p.screenshot({ path: `shots/zkt-${n}-${theme}.png` });
  console.log(`shots/zkt-${n}-${theme}.png`);
}
await b.close();
