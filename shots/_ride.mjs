import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto(`http://localhost:${process.argv[2] ?? 3008}/?debug&theme=${process.argv[3] ?? "day"}`);
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));
await p.evaluate(() => street.rideFlyer());
for (const [k, wait] of [[0, 3000], [1, 15000], [2, 12000]]) {
  await new Promise((r) => setTimeout(r, wait));
  await p.screenshot({ path: `shots/ride-${k}.png` });
}
// the bridge, close
await p.evaluate(() => { street.rig.setMode("free"); street.rig.flyTo(new street.rig.focus.constructor(158, 5, 185), 1.6); });
await new Promise((r) => setTimeout(r, 4000));
await p.screenshot({ path: "shots/gg-0.png" });
console.log(await p.evaluate(() => [street.goldenGate.cars.length, [...street.goldenGate.h].filter((_, i) => i % 10 === 0).map((v) => v.toFixed(1)).join(" ")].join(" | ")));
// chatter: how many talks now
console.log("talking", await p.evaluate(() => street.chatter.active));
await b.close();
