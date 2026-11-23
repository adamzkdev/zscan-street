// node shots/_gtaclose.mjs [URL] [OUT]: you and the passers-by up close (their look, no ink round them)
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/close"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.player.place(86 - 6.1, 0.2, 48, 0); g.cam.behind(0, -0.12); });
await sleep(8000);
// the camera right behind you, low
await p.evaluate(() => { const g = street.gta; g.cam.zoomTo?.(2.2); });
await p.screenshot({ path: `${OUT}-1-me.png` });
// the nearest passer-by: stand by them, turn to face them
const info = await p.evaluate(() => {
  const g = street.gta; const me = g.player.pos;
  const q = [...g.peds.peds].filter((x) => x.knockT < 0).sort((a, b) => Math.hypot(a.pos.x - me.x, a.pos.z - me.z) - Math.hypot(b.pos.x - me.x, b.pos.z - me.z))[0];
  if (!q) return "none";
  q.mode = "idle"; q.modeT = 30; q.speed = 0;
  const dx = q.pos.x - me.x, dz = q.pos.z - me.z, d = Math.hypot(dx, dz);
  g.player.place(q.pos.x - (dx / d) * 2.2, q.pos.y, q.pos.z - (dz / d) * 2.2, Math.atan2(-dx, -dz));
  g.cam.behind(Math.atan2(-dx, -dz), -0.05);
  return `ped #${q.id} at ${d.toFixed(1)} m`;
});
console.log(info);
await sleep(1500);
await p.screenshot({ path: `${OUT}-2-ped.png` });
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
