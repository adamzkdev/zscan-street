import puppeteer from "puppeteer-core";
const theme = process.argv[2] ?? "night";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1500, height: 900 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto(`http://localhost:3007/?debug&theme=${theme}`);
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 6000));
console.log(await p.evaluate(() => street.city.stores.map((s) => `${s.id}@${s.door.x.toFixed(0)},${s.door.z.toFixed(0)}`).join(" ")));
await p.evaluate(() => street.rig.flyTo(new street.rig.focus.constructor(-86, 1, 2), 1.7));
await new Promise((r) => setTimeout(r, 4000));
await p.screenshot({ path: `shots/shop-${theme}-0.png` });
for (const [i, id] of [[1, "konbini"], [2, "exchange"]]) {
  const pt = await p.evaluate((id) => { const s = street.city.stores.find((x) => x.id === id); const v = s.door.clone(); v.y += 2.5; v.project(street.rig.camera); return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }; }, id);
  await p.mouse.move(pt.x, pt.y);
  await new Promise((r) => setTimeout(r, 300));
  await p.mouse.click(pt.x, pt.y);
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: `shots/shop-${theme}-${i}.png` });
}
await b.close();
