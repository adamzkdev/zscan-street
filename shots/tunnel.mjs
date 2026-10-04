import puppeteer from "puppeteer-core";
const theme = process.argv[2] ?? "day";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() === "error" && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/?debug&theme=${theme}`);
await new Promise((r) => setTimeout(r, 8000));
await p.evaluate(() => street.rig.setMode("overview"));
await new Promise((r) => setTimeout(r, 3500));
await p.screenshot({ path: `shots/tun-${theme}-a.png` });
for (const [k, x] of [["b", -55], ["c", 55]]) {
  await p.evaluate((x) => { street.rig.setMode("free"); const T = street.rig.controls.target.constructor; street.rig.flyTo(new T(x, 1, -1.4), 1.5); }, x);
  await new Promise((r) => setTimeout(r, 3500));
  await p.screenshot({ path: `shots/tun-${theme}-${k}.png` });
}
console.log(logs.join("\n"));
await b.close();
