import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 800, height: 600 } });
const p = await b.newPage();
await p.goto(`http://localhost:3007/?debug&theme=day`);
for (let k = 0; k < 90; k++) { try { if (await p.evaluate(() => !!window.street?.city?.venues?.length)) break; } catch {} await new Promise(r => setTimeout(r, 1000)); }
const r = await p.evaluate(() => {
  const c = street.city;
  const out = {};
  for (const v of c.venues) out[v.kind] = [v.door.x.toFixed(1), v.door.y.toFixed(1), v.door.z.toFixed(1)];
  out.keys = Object.keys(street);
  if (c.landmarks) for (const [k, l] of c.landmarks) out["lm_" + k] = [l.door.x.toFixed(1), l.door.z.toFixed(1), l.yaw.toFixed(2), Object.entries(l.points).map(([n, p]) => n + ":" + p.x.toFixed(0) + "," + p.y.toFixed(0) + "," + p.z.toFixed(0)).join(" ")];
  return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();
