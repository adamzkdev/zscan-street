// Convention Center from the street: node shots/_zsalab.mjs [day|night]
import puppeteer from "puppeteer-core";
const theme = process.argv[2] ?? "day";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto(`http://localhost:3007/?debug&theme=${theme}`);
await new Promise((r) => setTimeout(r, 25000));
await p.evaluate(() => {
  const s = window.street;
  const V = s.rig.focus.constructor;
  s.rig.district(new V(160, 1, 12), 0.6);
  s.rig.turnBy(Math.PI);
});
await new Promise((r) => setTimeout(r, 5000));
await p.screenshot({ path: `shots/convention-city-${theme}.png` });
await b.close();
