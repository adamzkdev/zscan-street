// node shots/_roadster.mjs — the Convention Center's show at its key moments (shots/rd-*.png)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:3007/?debug&interior=convention`);
await p.waitForFunction(() => !!window.street?.interiors?.active && !!window.convention, { timeout: 120000 });
await wait(4000);
// name, tau, x, z, ground y — the camera aims at the roadster
const shots = (process.env.SHOTS ?? "interval:-10:0:9:3.6|count:3:0:9:3.6|reveal:22.5:0:9:3.6|revealnear:23.5:-6.8:-84:0|turn:28:6.8:-80:0|start:35.5:-6.8:-76:0|launch:36.5:-6.8:-66:0|loop1:39.0:-6.8:-36:0|loop2:39.7:6.8:-44:0|loopfar:39.9:0:9:3.6|flight1:45.5:-6.8:-14:0|flight2:47.3:6.8:-6:0|flight3:48.5:0:9:3.6|landed:52.5:0:9:3.6|spin:63:-6.8:-2:1").split("|");
for (const s of shots) {
  const [name, tau, x, z, y] = s.split(":");
  await p.evaluate((tau) => window.convention.seek(tau - 0.6), +tau);
  await wait(300);
  await p.evaluate((x, z, y) => {
    const I = street.interiors;
    const c = window.convention.car.position;
    const V = I.walk.camera.position.constructor;
    const dx = c.x - x, dz = c.z - z, dy = c.y + 0.6 - (y + 1.6);
    I.walk.place(new V(x, y, z), Math.atan2(-dx, -dz), y);
    I.walk.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, +x, +z, +y);
  await wait(300);
  await p.screenshot({ path: `shots/rd-${name}.png` });
  console.log("shot", name, await p.evaluate(() => window.convention.tau.toFixed(1)));
}
const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
console.log("fps", fps);
await b.close();
