// Frame cost without the vsync cap: node shots/_bench.mjs [theme] [quality]
// Capture mode; each view renders 90 frames, each synced with a 1-px readPixels; prints ms/frame.
import puppeteer from "puppeteer-core";
const [theme = "night", q = "0"] = process.argv.slice(2);
const VIEWS = {
  street: { pos: [6, 1.7, 22], look: [0, 5, -10], fov: 55 },
  three4: { pos: [45, 38, 65], look: [0, 0, 0], fov: 40 },
  wide: { pos: [-70, 70, 170], look: [0, 0, 40], fov: 45 },
};
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 2 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto(`http://localhost:${process.env.PORT ?? 3007}/?debug&capture&theme=${theme}&quality=${q}${process.env.QS ?? ""}`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 180000 });
for (let k = 0; k < 100; k++) await p.evaluate(() => capture.step(1 / 30));
if (process.env.EVAL) await p.evaluate(process.env.EVAL);
for (const [name, v] of Object.entries(VIEWS)) {
  const ms = await p.evaluate((v) => {
    capture.shot(v);
    const gl = street.renderer.getContext();
    const px = new Uint8Array(4);
    for (let k = 0; k < 20; k++) capture.step(1 / 60);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let k = 0; k < 90; k++) { capture.step(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    return (performance.now() - t0) / 90;
  }, v);
  console.log(`${process.env.TAG ?? ""} ${theme} q${q} ${name}: ${ms.toFixed(2)} ms/frame`);
}
await b.close();
