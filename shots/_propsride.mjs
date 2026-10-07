// Riders: seated in the bus and the metro, a scooter courier. Usage: node shots/_propsride.mjs <tag> [port]
import puppeteer from "puppeteer-core";
const tag = process.argv[2] ?? "x";
const port = process.argv[3] ?? "3037";
const OUT = process.env.OUT ?? "shots";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1000, height: 700 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto(`http://localhost:${port}/?debug&capture&theme=day`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 180000 });
const step = async (sec) => { const end = Date.now() + sec * 1000; while (Date.now() < end) { await p.evaluate(() => capture.step(1 / 30)); await new Promise((r) => setTimeout(r, 8)); } };
await step(20);
await p.evaluate(() => capture.testBlock());
let shots = 0;
for (let t = 0; t < 40 && shots < 6; t++) {
  await step(2);
  const riders = await p.evaluate(() => {
    const out = [];
    for (const s of street.director.snarks) {
      if (!(s.state === "riding" && s.isSeated) && s.role !== "Courier") continue;
      const w = s.root.getWorldPosition(s.root.position.clone());
      out.push({ role: s.role ?? s.state, bus: !!s.bus, x: w.x, y: w.y, z: w.z });
    }
    return out;
  });
  const bus = riders.find((r) => r.bus), metro = riders.find((r) => !r.bus && r.role !== "Courier"), cour = riders.find((r) => r.role === "Courier");
  for (const [nm, r] of [["bus", bus], ["metro", metro], ["courier", cour]]) {
    if (!r || shots >= 6) continue;
    if (nm === "bus") {
      const v = await p.evaluate(() => capture.bus());
      if (!v) continue;
      await p.evaluate((v) => { capture.shot({ pos: v.front.pos, look: v.front.look, fov: 55 }); capture.step(1 / 30); capture.step(1 / 30); }, v);
    } else await p.evaluate((r) => { capture.shot({ pos: [r.x + 1.6, r.y + 1.2, r.z + 2.2], look: [r.x, r.y + 0.6, r.z], fov: 50 }); capture.step(1 / 30); capture.step(1 / 30); }, r);
    await p.screenshot({ path: `${OUT}/pr-${tag}-${nm}-${shots}.png` });
    console.log(nm, r.role, r.y.toFixed(2));
    shots++;
    await p.evaluate(() => capture.shot(null));
  }
}
await b.close();
