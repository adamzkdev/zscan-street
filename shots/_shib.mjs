// node shots/_shib.mjs [night|day] [live] "name:px,py,pz;lx,ly,lz;fov|..."  [steps]
import puppeteer from "puppeteer-core";
const [theme = "night", live = "0", views = "", steps = "60", walkAt = "-1", port = "3007"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1500, height: 900 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
p.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 200)));
await p.goto(`http://localhost:${port}/?debug&capture&theme=${theme}`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 9000));
if (live === "1") {
  await p.evaluate(async () => {
    const { Shibuya } = await import("/src/scene/shibuya.ts");
    const s = street;
    window.shib = new Shibuya(s.city.group.parent, s.city, s.cityTraffic, { director: s.director }); window.shibT = 0; window.shibStep = (dt) => { capture.step(dt); window.shibT += dt; window.shib.update(dt, window.shibT, window.shibFocus); };
  }).catch((e) => console.log("live err", e.message));
}
for (let i = 0; i < +steps; i++) await p.evaluate(() => { window.shibStep ? shibStep(1 / 30) : capture.step(1 / 30); });
if (process.env.RAIN) await p.evaluate(() => { shib.setRain(true); street.renderer; });
if (+walkAt >= 0) console.log("phase", await p.evaluate(async (wa) => { let n = 0; const tr = street.cityTraffic; while (n < 3000) { const s = tr.scramble(); if (s.walk && s.t >= wa) break; (window.shibStep ?? capture.step)(1 / 15); n++; if (n % 50 === 0) await new Promise((r) => setTimeout(r, 0)); } return JSON.stringify(tr.scramble()); }, +walkAt));
for (const v of views.split("|").filter(Boolean)) {
  const [name, rest] = v.split(":");
  const [pos, look, fov] = rest.split(";");
  const extra = Number(v.split(";")[3] ?? 0);
  await p.evaluate(([pos, look, fov]) => capture.shot({ pos, look, fov }), [pos.split(",").map(Number), look.split(",").map(Number), Number(fov || 45)]);
  for (let i = 0; i < 3 + extra; i++) await p.evaluate(() => { window.shibStep ? shibStep(1 / 30) : capture.step(1 / 30); });
  await p.screenshot({ path: `shots/shib-${name}-${theme}.png` });
  console.log(`shots/shib-${name}-${theme}.png`);
}
const fps = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); while (performance.now() - t0 < 2000) { window.shibStep ? shibStep(1 / 60) : capture.step(1 / 60); n++; } return (n / ((performance.now() - t0) / 1000)).toFixed(1); });
console.log("step/s", fps);
await b.close();
