import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() !== "debug" && logs.push(`[${m.type()}] ${m.text()} ${m.location()?.url ?? ""}`));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto("http://localhost:3007/?debug");
await new Promise((r) => setTimeout(r, 10000));
const info = await p.evaluate(() => {
  const d = street.director;
  const c = street.camera, o = street.controls;
  const dd = { x: 7 - o.target.x, z: 3 - o.target.z };
  o.target.x += dd.x; o.target.z += dd.z; c.position.x += dd.x; c.position.z += dd.z; c.zoom = 1.6; c.updateProjectionMatrix();
  const waiting = [...d.snarks].filter((s) => s.state === "waiting").length;
  street.testBoard();
  return { snarks: d.snarks.size, waiting };
});
console.log(JSON.stringify(info));
for (const [i, ms] of [[1, 6000], [2, 3500], [3, 5000]]) {
  await new Promise((r) => setTimeout(r, ms));
  await p.screenshot({ path: `shots/seq${i}.png` });
  console.log(i, await p.evaluate(() => [...street.director.snarks].map((s) => s.state).join(",")), await p.evaluate(() => street.director.bus.phase));
}
console.log(logs.join("\n"));
await b.close();
