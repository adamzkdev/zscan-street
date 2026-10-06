import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
await p.goto("http://localhost:3007/?debug&quality=0");
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 6000));
const measure = async (label) => {
  const r = await p.evaluate(() => new Promise((res) => { const i = street.renderer.info; i.autoReset = false; i.reset(); requestAnimationFrame(() => { const o = { calls: i.render.calls, tris: i.render.triangles }; i.autoReset = true; res(o); }); }));
  const f = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(Math.round(n / 3)); }; requestAnimationFrame(f); }));
  console.log(label, "fps", f, JSON.stringify(r));
};
await measure("live");
await p.evaluate(() => street.rig.setMode("overview"));
await new Promise((r) => setTimeout(r, 2500));
await measure("overview");
await b.close();
