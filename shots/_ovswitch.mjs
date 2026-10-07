// worst frames when switching live -> overview -> live (first time, then again)
import puppeteer from "puppeteer-core";
const port = process.argv[2] ?? 3024;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto(`http://localhost:${port}/?debug&quality=0&theme=night`);
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 15000));
const sw = (m) => p.evaluate((m) => new Promise((res) => { street.rig.setMode(m); const ts = []; let last = performance.now(); const T0 = last; const f = (now) => { ts.push(now - last); last = now; if (now - T0 < 2500) requestAnimationFrame(f); else res(ts.sort((a, b) => b - a).slice(0, 3).map(Math.round).join(",")); }; requestAnimationFrame(f); }), m);
for (const m of ["overview", "live", "overview", "live"]) console.log(m.padEnd(9), "worst frames ms", await sw(m));
await b.close();
