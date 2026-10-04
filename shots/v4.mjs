import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
p.on("console", (m) => ["error", "warning", "info"].includes(m.type()) && logs.push(`[${m.type()}] ${m.text()}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => p.screenshot({ path: `shots/${n}.png` });
await p.goto("http://localhost:3007/?debug");
await wait(11000);
// close-up on the queue
await p.evaluate(() => { const r = street.rig; r.flyTo(new (r.controls.target.constructor)(6, 1, 4), 2.6); });
await wait(3500); await shot("v4-queue");
// orbit 180 degrees around downtown: buildings in front should fade
await p.evaluate(() => { const r = street.rig, c = r.iso, t = r.controls.target; const o = c.position.clone().sub(t); o.applyAxisAngle(new (o.constructor)(0,1,0), Math.PI); c.position.copy(t).add(o); c.zoom = 1.6; c.updateProjectionMatrix(); r.controls.update(); });
await wait(2500); await shot("v4-orbit180");
await p.evaluate(() => { const r = street.rig, c = r.iso, t = r.controls.target; const o = c.position.clone().sub(t); o.applyAxisAngle(new (o.constructor)(0,1,0), -Math.PI/2); c.position.copy(t).add(o); r.controls.update(); });
await wait(2500); await shot("v4-orbit90");
await p.evaluate(() => street.rig.setMode("live")); await wait(2500);
const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(Math.round(n / 3)); }; requestAnimationFrame(f); }));
console.log("fps", fps);
await p.evaluate(() => street.testBoard());
await wait(12500); await shot("v4-boarding");
await wait(6000); await shot("v4-boarding2");
console.log(logs.slice(0, 12).join("\n"));
await b.close();
