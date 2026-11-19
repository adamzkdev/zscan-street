// node shots/_doorsout.mjs [url] [place]: every walk-in door's way out: is the pavement free in front, the building
// behind, and is the spot the way out stands you on (outside() in main.ts) free, how far, which way it faces
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3011/?debug", ONLY = null] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street, { timeout: 240000, polling: 1000 });
await new Promise((r) => setTimeout(r, 4000));
const out = await p.evaluate((only) => {
  const S = window.street, c = S.onFoot.collide;
  let bad = 0;
  const lines = S.doorsList().filter((d) => !only || d.key === only).map((d) => {
    const free = [1.8, 2.6, 3.4].map((r) => (c(d.x + d.fx * r, d.z + d.fz * r) ? "x" : ".")).join("");
    const back = c(d.x - d.fx * 2.5, d.z - d.fz * 2.5) ? "wall" : "OPEN";
    const ok = !c(d.out.x, d.out.z);
    if (!ok) bad++;
    const away = Math.hypot(d.out.x - d.x, d.out.z - d.z);
    // facing away from the door: the look and the way from the door agree
    const lx = -Math.sin(d.out.yaw), lz = -Math.cos(d.out.yaw);
    const facing = ((d.out.x - d.x) * lx + (d.out.z - d.z) * lz) / Math.max(1e-6, away);
    return `${d.key.padEnd(14)} front ${d.fx.toFixed(2)},${d.fz.toFixed(2)}  ahead ${free}  behind ${back}  out ${ok ? "free" : "BLOCKED"} ${away.toFixed(1)} m, facing away ${facing.toFixed(2)}`;
  });
  return lines.join("\n") + `\n${bad} ways out blocked`;
}, ONLY);
console.log(out);
await b.close();
