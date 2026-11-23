// node shots/_keysdoors.mjs: Orchard Keys' doors in the game (src/scene/keys → src/gta nearDoors): which lots got one, and a look at a few
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo", OUT = "shots/gta/keys/door"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.keys?.done, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(6000);
await p.evaluate(() => { street.gta.hud.coach(-1); street.gta.player.place(158, 0.2, 300, Math.PI); });
await sleep(1500);
const r = await p.evaluate(() => {
  const g = street.gta;
  const facades = street.keys.facades;
  const spots = (g.buildingSpots ?? []).filter((s) => s.z > 236);
  const got = new Set(spots.map((s) => s.label));
  return { facades: facades.length, spots: spots.length, missing: facades.filter((f) => !got.has(f.name)).map((f) => f.name + " @" + f.door.x.toFixed(0) + "," + f.door.z.toFixed(0)), labels: [...got] };
});
console.log(JSON.stringify(r, null, 1));
let n = 0;
for (const name of ["ORCHARD DINER", "SURF ZK", "HOTEL SAPLING", "ZEC FUEL"]) {
  const ok = await p.evaluate((name) => {
    const g = street.gta;
    const s = (g.buildingSpots ?? []).find((q) => q.label === name);
    if (!s) return false;
    const h = Math.atan2(s.fx, s.fz);
    g.player.place(s.x + s.fx * 4, 0.2, s.z + s.fz * 4, h);
    g.cam.behind(h, -0.08);
    g.cam.snap(g.player.pos.clone().setY(1.75));
    return true;
  }, name);
  if (!ok) continue;
  await sleep(2000);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}.png` });
  console.log(n, name, await p.evaluate(() => street.gta.doors.at?.label ?? null));
}
// in through the diner's door and out again
{
  await p.evaluate(() => {
    const g = street.gta;
    const s = g.buildingSpots.find((q) => q.label === "ORCHARD DINER");
    const h = Math.atan2(s.fx, s.fz);
    g.player.place(s.x + s.fx * 1.2, 0.2, s.z + s.fz * 1.2, h);
  });
  await sleep(800);
  const at = await p.evaluate(() => street.gta.doors.at?.label ?? null);
  await p.evaluate(() => street.gta.input.tap("KeyE"));
  await sleep(4000);
  await p.screenshot({ path: `${OUT}-inside.png` });
  const inside = await p.evaluate(() => !!street.gta.host?.interior?.() || document.body.innerText.includes("ORCHARD DINER"));
  console.log("door at:", at, "inside:", inside);
}
console.log("errors", errs.length, errs.slice(0, 4).join("\n"));
await b.close();
