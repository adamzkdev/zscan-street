// node shots/_fly.mjs <theme> name:x,z,zoom[,turns] ...  — iso views over the city
import puppeteer from "puppeteer-core";
const [theme, ...spots] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1500, height: 900 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
p.on("console", (m) => { const t = m.text(); if (t.includes("built")) console.log(t); });
await p.goto(`http://localhost:3018/?debug&theme=${theme}`);
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));
for (const s of spots) {
  const [name, rest] = s.split(":");
  const [x, z, zoom, turns] = rest.split(",").map(Number);
  await p.evaluate(([x, z, zoom, turns]) => { street.rig.setMode("free"); street.rig.flyTo(new street.rig.focus.constructor(x, 1, z), zoom); if (turns) street.rig.turnBy(turns * Math.PI / 4); }, [x, z, zoom, turns || 0]);
  await new Promise((r) => setTimeout(r, 3500));
  await p.screenshot({ path: `shots/fly-${name}-${theme}.png` });
}
await b.close();
