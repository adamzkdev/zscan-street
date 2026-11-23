// node shots/_keyslook.mjs [URL] [OUT]: looks round the Golden Gate, the tunnel and Orchard Keys (src/scene/keys) in the game's
// camera; SPOTS='[[x,z,heading,"foot"|"car"|"air", pitch?]]' to choose, THEME=day|night
import puppeteer from "puppeteer-core";
const THEME = process.env.THEME ?? "day";
const [URL = `http://localhost:3061/?debug&gta=1192&theme=${THEME}&solo`, OUT = "shots/gta/keys/look"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
// other agents edit files meanwhile: Vite's hot reload must not reload this page mid-test
await p.evaluateOnNewDocument(() => {
  const W = window.WebSocket;
  const F = function (u, pr) {
    if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
    return pr === undefined ? new W(u) : new W(u, pr);
  };
  F.prototype = W.prototype;
  Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = F;
});
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => { if (m.type() === "error" || /keys/i.test(m.text())) errs.push(m.type() + " " + m.text()); });
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => { street.gta.hud.coach(-1); });
if (process.env.HUD !== "1") await p.evaluate(() => { document.querySelector(".gta-hud").style.display = "none"; });
await p.waitForFunction(() => !street.keys || street.keys.done, { timeout: 120000, polling: 500 }).catch(() => errs.push("keys not done"));
await sleep(1500);
const SPOTS = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [
  [158, 150, Math.PI, "foot"],
  [158, 222, Math.PI, "foot"],
  [158, 262, Math.PI, "foot"],
  [158, 300, Math.PI, "foot"],
  [206, 400, -Math.PI / 2, "foot"],
  [190, 300, 0, "air"],
];
let n = 0;
for (const [x, z, h, mode, pitch] of SPOTS) {
  if (mode === "air") {
    await p.evaluate((x, z) => { street.gta.stop(); const r = street.rig; r.district(r.controls.target.clone().set(x, 0, z), 2.2); }, x, z);
    await sleep(3500);
  } else {
    if (!(await p.evaluate(() => street.gta.active))) {
      await p.evaluate(() => street.gta.play(1192));
      await sleep(1500);
      await p.evaluate(() => { street.gta.hud.coach(-1); if (document.querySelector(".gta-hud") && !window.__hud) document.querySelector(".gta-hud").style.display = "none"; });
    }
    await p.evaluate((x, z, h, pitch) => {
      const g = street.gta;
      if (g.car) g.getOut(true);
      const y = street.groundAt?.(x, z) ?? 0.2;
      g.player.place(x, y, z, h);
      g.cam.behind(h, pitch ?? -0.1);
      g.cam.snap(g.player.pos.clone().setY(g.player.pos.y + 1.55));
    }, x, z, h, pitch ?? null);
    await sleep(2200);
  }
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}.png` });
  console.log(n, x, z, mode, await p.evaluate(() => (street.gta.active ? JSON.stringify(street.gta.roads.where(street.gta.player.pos.x, street.gta.player.pos.z)) : "")), await p.evaluate(() => Math.round(1000 / (street.fpsAvg ?? 16))));
}
if (process.env.MAP === "1") {
  await p.evaluate(() => { document.querySelector(".gta-hud").style.display = ""; const g = street.gta; g.player.place(170, 0.2, 330, 0); g.hud.toggleMap(true); });
  await sleep(2500);
  await p.screenshot({ path: `${OUT}-map.png` });
}
console.log("errors", errs.length, errs.slice(0, 8).join("\n"));
await b.close();
