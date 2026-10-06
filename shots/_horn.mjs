import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto("http://localhost:3007/?debug&capture&theme=night");
await p.waitForFunction(() => window.capture && window.street, { timeout: 120000 });
const step = async (sec) => { const end = Date.now() + sec * 1000; while (Date.now() < end) { await p.evaluate(() => capture.step(1 / 30)); await new Promise((r) => setTimeout(r, 15)); } };
await step(4);
await p.evaluate(async () => { await street.sound.start(); street.walk(true); street.onFoot.place(new street.onFoot.camera.position.constructor(-30, 0.01, -0.4), -Math.PI / 2); });
for (let k = 0; k < 24; k++) {
  await step(1.5);
  const info = await p.evaluate(() => { const v = [...street.director.traffic.vehicles].filter((x) => x.blocked > 0).map((x) => `${x.lane}@${x.x.toFixed(0)} b=${x.blocked.toFixed(1)} held=${x.held}`); const d = [...street.director.snarks].filter((s) => s.role === "Driver").map((s) => `${s.root.position.x.toFixed(1)},${s.root.position.z.toFixed(1)}`); return `${v.join(" | ")} drivers: ${d.join(" ")}`; });
  console.log(((k + 1) * 1.5).toFixed(1), info);
  if (k === 19) {
    await p.evaluate(() => { capture.shot({ pos: [-38, 3.2, 6], look: [-34, 1.2, -0.5], fov: 50 }); capture.step(1 / 30); });
    await p.screenshot({ path: "shots/horn.png" });
    await p.evaluate(() => capture.shot(null));
  }
}
await b.close();
