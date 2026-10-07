import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1500, height: 900 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto(`http://localhost:3007/?debug&theme=${process.argv[2] ?? "day"}`);
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 6000));
await p.evaluate(() => street.rig.setMode("overview"));
await new Promise((r) => setTimeout(r, 3000));
for (const v of ["zones", "traffic", "privacy", "mempool"]) {
  await p.evaluate((v) => street.overlays.set(v), v);
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: `shots/dv-${v}.png` });
  await p.evaluate((v) => street.overlays.set(v), v);
}
await b.close();
