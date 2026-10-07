import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 800, height: 450 } });
const p = await b.newPage();
await p.goto(`http://localhost:3007/?debug`);
await new Promise((r) => setTimeout(r, 10000));
console.log(await p.evaluate(() => {
  const c = street.city, r = (v) => [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)];
  const out = { shop: r(c.shops[0].door), venues: c.venues.map((v) => [v.kind, r(v.door)]), hall: r(c.factory.hall), screen: r(c.factory.screen) };
  out.towers = c.facades.filter((f) => f.type === "office" && f.frontRow).map((f) => [f.x0.toFixed(1), f.x1.toFixed(1), f.z.toFixed(1), f.height.toFixed(1)]);
  out.spawns = {};
  for (const k of ["mempool", "factory"]) { street.enter(k); out.spawns[k] = street.interiors.active.floors.map((f) => [f.label, f.y, r(f.spawn), +f.yaw.toFixed(2)]); street.interiors.exit(); }
  return JSON.stringify(out);
}));
await b.close();
