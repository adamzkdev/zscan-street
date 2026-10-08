// node shots/_memecost.mjs [--port 3038] : what the meme posters cost in the city (draw calls, triangles, fps),
// overview and on foot: measured with them, then with them hidden.
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3038";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
await p.goto(`http://localhost:${port}/?debug&quality=0&theme=night`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 9000));
await p.evaluate(() => {
  const R = street.renderer;
  const acc = (window.__acc = { calls: 0, tris: 0 });
  const orig = R.render.bind(R);
  R.render = (s, c) => { orig(s, c); acc.calls += R.info.render.calls; acc.tris += R.info.render.triangles; };
  const scene = street.metro.group.parent;
  window.__mine = [];
  scene.traverse((o) => { if (o.userData.batch || o.userData.meme !== undefined || o.name === "kiosk" || o.name === "standee" || o.name === "memes" || (o.userData.memePart && o.isMesh)) window.__mine.push(o); });
});
const measure = async (label) => {
  const r = await p.evaluate(() => new Promise((res) => requestAnimationFrame(() => { Object.assign(__acc, { calls: 0, tris: 0 }); requestAnimationFrame(() => res({ ...__acc })); })));
  const f = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = (now) => { n++; if (now - t0 < 3000) requestAnimationFrame(f); else res(Math.round(n / 3)); }; requestAnimationFrame(f); }));
  console.log(label.padEnd(24), "calls", r.calls, "tris", (r.tris / 1e6).toFixed(3) + "M", "fps", f);
};
const both = async (label) => {
  await measure(`${label} with`);
  await p.evaluate(() => __mine.forEach((o) => (o.userData.v = o.visible, (o.visible = false))));
  await measure(`${label} without`);
  await p.evaluate(() => __mine.forEach((o) => (o.visible = o.userData.v)));
};
await both("live");
await p.evaluate(() => street.walk(true));
await p.evaluate(() => { const W = street.onFoot; const V = W.camera.position.constructor; W.place(new V(-86, 0.2, 10), 0); });
await new Promise((r) => setTimeout(r, 2500));
await both("shotengai on foot");
console.log("count", await p.evaluate(() => __mine.length), JSON.stringify(await p.evaluate(() => street.memes())));
await b.close();
