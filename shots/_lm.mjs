// node shots/_lm.mjs <kind> <w> <d> [views separated by |] [night]
import puppeteer from "puppeteer-core";
const [kind, w, d, views = "iso|front|street", night] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 900 } });
for (const v of views.split("|")) {
  const p = await b.newPage();
  p.on("pageerror", (e) => console.log("ERR", e.message));
  p.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  await p.goto(`http://localhost:3007/lmtest.html?kind=${kind}&w=${w}&d=${d}&cam=${encodeURIComponent(v)}${night ? "&night" : ""}`);
  await p.waitForFunction(() => window.lmReady, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 400));
  const info = await p.evaluate(() => window.lmReady);
  const file = `shots/lm-${kind}-${v.replace(/[^a-z0-9]/gi, "_").slice(0, 24)}${night ? "-night" : ""}.png`;
  await p.screenshot({ path: file });
  console.log(file, JSON.stringify(info));
  await p.close();
}
await b.close();
