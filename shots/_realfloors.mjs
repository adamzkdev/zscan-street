// node shots/_realfloors.mjs [OUT]: a few floors of some places (PLACES="hotel:1,3,5;prison:1"), the game's third person
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/inB/f"] = process.argv.slice(2);
const PLACES = (process.env.PLACES ?? "hotel:1,3;prison:1").split(";").map((s) => { const [k, f] = s.split(":"); return [k, (f ?? "0").split(",").map(Number)]; });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:3061/?debug&gta=1192&theme=day${process.env.QS ? "&" + process.env.QS : ""}`);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
for (const [k, floors] of PLACES) {
  await p.evaluate((k) => street.gta.host.enter(k), k);
  if (!(await p.waitForFunction(() => !!street.gta.host.interior(), { timeout: 60000, polling: 300 }).then(() => true, () => false))) { console.log("no way in", k); continue; }
  await sleep(3500);
  for (const f of floors) {
    await p.evaluate((f) => street.interiors.goTo(f), f);
    await sleep(5500);
    // out of the lift car into the floor
    if (f) {
      await p.keyboard.down("KeyW");
      await sleep(2200);
      await p.keyboard.up("KeyW");
      await sleep(900);
    }
    for (const t of [0, 2.4]) {
      await p.evaluate((t) => street.gta.cam.behind(street.gta.cam.yaw + t, -0.12), t).catch(() => {});
      await sleep(800);
      await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-${k}${f}.png` });
    }
  }
  await p.evaluate(() => street.leavePlace());
  await p.waitForFunction(() => !street.gta.host.interior(), { timeout: 30000, polling: 300 }).catch(() => {});
  await sleep(1500);
}
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
