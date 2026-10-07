import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto(`http://localhost:${process.argv[2] ?? 3008}/?debug&theme=day`);
await p.waitForFunction(() => window.street, { timeout: 120000 });
for (let k = 0; k < 6; k++) {
  await new Promise((r) => setTimeout(r, 5000));
  console.log("t", (k + 1) * 5, "talking", await p.evaluate(() => street.chatter.active));
}
await p.evaluate(() => street.rig.zoomBy?.(1.6));
await new Promise((r) => setTimeout(r, 2500));
await p.screenshot({ path: "shots/chat-0.png" });
await new Promise((r) => setTimeout(r, 3000));
await p.screenshot({ path: "shots/chat-1.png" });
await b.close();
