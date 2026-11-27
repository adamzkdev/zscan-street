// node shots/_echolive.mjs --port 3078 HIDEFILE : rehearse a live Echo reveal against the dev API
// (scratchpad devapi/server.mjs). Hides Echo #2 via HIDEFILE, opens floor 7, then un-hides it and waits
// for the feed to see it: stills of the LIVE ritual + the alert, the inbox count, errors.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3078";
const hide = args.find((a) => a.endsWith(".txt"));
const OUT = process.env.OUT ?? "/tmp";
fs.writeFileSync(hide, "2");
await new Promise((r) => setTimeout(r, 31000)); // the dev API's cache
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && !/WebSocket/.test(m.text()) && errs.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=night`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await wait(4000);
await p.evaluate(() => street.enter("museum"));
await wait(2500);
await p.evaluate(() => street.interiors.goTo(7));
await wait(4000);
await p.evaluate(() => {
  const I = street.interiors, W = I.walk;
  const V = W.camera.position.constructor;
  const fy = I.active.floors[I.floor].y;
  W.place(new V(0, fy, -21), 0, fy);
  W.pitch = 0.12;
});
fs.writeFileSync(hide, "");
console.log("un-hidden; waiting for the feed");
const t0 = Date.now();
let got = false;
await p.evaluate(() => { window.__live = null; street.echoes.onReveal((g) => (window.__live = { n: g.map((e) => e.echo), at: Date.now() })); });
for (let i = 0; i < 70 && !got; i++) {
  await wait(2000);
  const l = await p.evaluate(() => window.__live);
  if (l) { got = true; console.log("revealed", JSON.stringify(l.n), "after", ((Date.now() - t0) / 1000).toFixed(0), "s"); }
}
await wait(1200);
await p.screenshot({ path: `${OUT}/live-1.jpg`, type: "jpeg", quality: 85 });
await wait(2500);
await p.screenshot({ path: `${OUT}/live-2.jpg`, type: "jpeg", quality: 85 });
await wait(9000);
await p.screenshot({ path: `${OUT}/live-3.jpg`, type: "jpeg", quality: 85 });
let st = null;
await p.evaluate(() => 0);
console.log("show", await p.evaluate(() => { let s = null; street.interiors.active.scene.traverse((o) => { if (o.userData?.echoShow) s = o.userData.echoShow.state(); }); return JSON.stringify(s); }));
console.log("errors", errs.slice(0, 6).join(" | ") || "none");
await b.close();
