// The ZSA LAB, clicked through for real: wallet → drip → mint → coin in the reactor.
// node shots/_labflow.mjs   (needs zsa-svc on 8095 and vite with VITE_ZSA_URL on 3007)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const panel = () => p.$eval(".zsalab .zl-body", (e) => e.innerText.replace(/\s+/g, " ").slice(0, 300));
await p.goto("http://localhost:3007/?debug&theme=night&interior=zsalab");
await p.waitForFunction(() => window.street?.interiors?.active?.key === "zsalab", { timeout: 120000 });
await wait(4000);
await p.evaluate(() => window.street.zsaLab.open("mint"));
await wait(1500);
log("open:", await panel());
await p.screenshot({ path: "shots/labflow-1-open.png" });
await p.click('.zsalab [data-a="create"]');
log("create clicked");
// the drip lands with the next block
for (let i = 0; i < 80; i++) {
  await wait(5000);
  const low = await p.$eval(".zsalab", (e) => !!e.querySelector(".zl-zec.low"));
  if (!low) break;
  if (i % 6 === 0) log("waiting for drip:", await panel());
  await p.evaluate(() => window.street.zsaLab["refresh"]?.());
}
log("funded:", await panel());
await p.screenshot({ path: "shots/labflow-2-funded.png" });
await p.type('.zsalab [name="name"]', "ZStreet Test Coin");
await p.click('.zsalab [data-a="mint"]');
log("mint clicked");
for (let i = 0; i < 60; i++) {
  await wait(2000);
  const txt = await panel();
  if (/minted|Error|error|failed/i.test(txt) && !/Proving|Broadcasting/.test(txt)) break;
  if (i === 3) await p.screenshot({ path: "shots/labflow-3-proving.png" });
}
log("after mint:", await panel());
await p.screenshot({ path: "shots/labflow-4-minted.png" });
// wait for the block, then look at the reactor
await wait(90000);
await p.evaluate(() => window.street.zsaLab.close());
await p.evaluate(() => {
  const I = window.street.interiors;
  const V = I.walk.camera.position.constructor;
  I.walk.camera.position.set(0, 1.7, 3.2);
});
await wait(25000);
await p.screenshot({ path: "shots/labflow-5-reactor.png" });
log("done");
await b.close();
