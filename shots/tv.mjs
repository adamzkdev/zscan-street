import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1200, height: 740 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() === "error" && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/?debug&tv&theme=${process.argv[2] ?? "night"}`);
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 8000));
  const st = await p.evaluate(() => `${street.tv.on} ${street.rig.mode} ${street.tv.last}`);
  console.log(i, st);
  await p.screenshot({ path: `shots/tv-${i}.png` });
}
console.log(logs.join("\n"));
await b.close();
