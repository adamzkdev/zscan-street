import puppeteer from "puppeteer-core";
const theme = process.argv[2] ?? "night";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() === "error" && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/?debug&theme=${theme}`);
await new Promise((r) => setTimeout(r, 10000));
await p.screenshot({ path: `shots/places-${theme}-0.png` });
for (const k of ["factory"]) {
  await p.evaluate((k) => (k === "factory" ? street.rig.lookIn(street.city.factory) : street.enter(k)), k);
  await new Promise((r) => setTimeout(r, 4000));
  await p.screenshot({ path: `shots/places-${theme}-${k}.png` });
  await p.evaluate(() => { street.venues.close(); street.rig.exit(); });
  await new Promise((r) => setTimeout(r, 1500));
}
console.log(logs.join("\n"));
await b.close();
