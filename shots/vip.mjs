import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
p.on("console", (m) => m.type() === "error" && logs.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug");
await wait(10000);
await p.evaluate(() => { const r = street.rig; r.auto = false; r.flyTo(new (r.controls.target.constructor)(-6, 1, -2.5), 2.6); street.testVip("limo"); });
for (const [n, ms] of [["vip-a", 8000], ["vip-b", 4000], ["vip-c", 5000], ["vip-d", 6000]]) {
  await wait(ms);
  await p.screenshot({ path: `shots/${n}.png` });
  console.log(n, await p.evaluate(() => [...street.director.snarks].filter(s=>["vip","chauffeured","guard"].includes(s.state)).map(s=>s.state+"@"+s.root.position.x.toFixed(1)).join(" ")));
}
console.log(logs.join("\n"));
await b.close();
