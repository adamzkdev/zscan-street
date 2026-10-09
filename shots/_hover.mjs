// node shots/_hover.mjs <place> [theme]: flies to a walk-in place, hovers it, screenshots
import puppeteer from "puppeteer-core";
const [key, theme = "night"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
await p.goto(`http://localhost:3007/?debug&theme=${theme}`);
await p.waitForFunction(() => window.street, { timeout: 150000 });
await new Promise((r) => setTimeout(r, 5000));
const at = await p.evaluate((key) => {
  const v = street.city.venues.find((x) => x.kind === key);
  street.rig.setMode("free");
  street.rig.flyTo(v.door.clone().setY(1), 0.7);
  return [v.door.x, v.door.z];
}, key);
await new Promise((r) => setTimeout(r, 4000));
await p.mouse.move(700, 380);
await new Promise((r) => setTimeout(r, 300));
await p.mouse.move(702, 382);
await new Promise((r) => setTimeout(r, 1500));
await p.evaluate((key) => street.hud?.hoverPlace?.(key), key);
await new Promise((r) => setTimeout(r, 400));
console.log(await p.evaluate(() => [...document.querySelectorAll(".placetag")].map((e) => e.innerText.replace(/\n/g, " | ")).join(" // ")));
await p.screenshot({ path: `shots/hover-${key}.png` });
await b.close();
