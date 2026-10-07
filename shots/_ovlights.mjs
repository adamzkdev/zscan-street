import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto(`http://localhost:3024/?debug&quality=0&theme=${process.argv[2] ?? "night"}`);
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 8000));
await p.evaluate(() => { const R = street.renderer; const o = R.render.bind(R); R.render = (s, c) => { if (!window.__scene && s.isScene && s.children.length > 20) window.__scene = s; o(s, c); }; });
await p.evaluate(() => street.rig.setMode("overview"));
await new Promise((r) => setTimeout(r, 4000));
// freeze time-ish: shoot twice quickly
await p.screenshot({ path: "/private/tmp/claude-501/ovw/L-on.png" });
await p.evaluate(() => window.__scene.traverse((o) => o.isPointLight && (o.visible = false)));
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: "/private/tmp/claude-501/ovw/L-off.png" });
await b.close();
