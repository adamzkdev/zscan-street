import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
p.on("console", (m) => m.text().startsWith("[taxi]") && console.log(m.text()));
await p.goto("http://localhost:3007/?debug&capture&theme=night");
await p.waitForFunction(() => window.capture && window.street, { timeout: 120000 });
const step = async (sec) => { const end = Date.now() + sec * 1000; while (Date.now() < end) { await p.evaluate(() => capture.step(1 / 30)); await new Promise((r) => setTimeout(r, 15)); } };
await step(10);
console.log("queued", await p.evaluate(() => street.director.debugQueue(2)));
await step(3);
console.log(await p.evaluate(() => { const d = street.director; return [...d.snarks].filter((s) => s.state === "waiting").map((s) => s.txs.length).join(","); }));
await p.evaluate(() => { const d = street.director; const txs = [...d.snarks].filter((s) => s.state === "waiting").slice(0, 2).flatMap((s) => s.txs).slice(0, 2); d.block({ height: (d.blockHeight ?? 1) + 1, time: Date.now(), size: 2000, fees: 0, pool: "ViaBTC", txs }); });
for (let k = 0; k < 30; k++) {
  await step(1.5);
  const info = await p.evaluate(() => { const cars = [...street.director.cars].map((c) => `${c.kind}@${c.group.position.x.toFixed(0)}`); const w = [...street.director.snarks].filter((s) => s.state === "waiting" || s.state === "boarding").length; return `cars ${cars.join(" ")} | waiting/boarding ${w}`; });
  console.log((k + 1) * 1.5, info);
  if (false) console.log("   on zebra:", await p.evaluate(() => [...street.director.snarks].filter((s) => s.root.parent?.type === "Scene" && Math.abs(s.root.position.x + 0.5) < 1.8 && s.root.position.z > -5.5 && s.root.position.z < 2.7).map((s) => `${s.id}:${s.state}/${s.role ?? ""}@${s.root.position.x.toFixed(1)},${s.root.position.z.toFixed(1)} walk=${s.isWalking}`).join(" ")));
  if (k === 18) {
    await p.evaluate(() => { const t = [...street.director.cars].find((c) => c.kind === "taxi"); const x = t ? t.group.position.x : 7; capture.shot({ pos: [x + 5, 4, 10], look: [x, 1, 2], fov: 50 }); capture.step(1 / 30); });
    await p.screenshot({ path: "shots/taxi.png" });
  }
}
await b.close();
