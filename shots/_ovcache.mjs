import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1200, height: 800 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));
p.on("console", (m) => /city|cache|error/i.test(m.text()) && console.log("[console]", m.text().slice(0, 200)));
for (const k of [1, 2]) {
  const t0 = Date.now();
  if (k === 1) await p.goto("http://localhost:3024/?debug&quality=0"); else await p.reload();
  await p.waitForFunction(() => window.street, { timeout: 120000 });
  console.log(`load ${k}: ${((Date.now() - t0) / 1000).toFixed(1)} s`, await p.evaluate(() => { let bm = 0, inst = 0; street.city.group.traverse((o) => { if (o.isBatchedMesh) bm += o.instanceCount ?? 1; }); return `batched instances ${bm}`; }));
  await new Promise((r) => setTimeout(r, 5000));
}
await p.screenshot({ path: "/private/tmp/claude-501/ovw/cache2.png" });
await b.close();
