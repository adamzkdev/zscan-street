// node shots/_realbay.mjs [URL] [OUT]: the bay's landmarks, realistic (src/scene/real/bridge.ts, statue, opera, prison) at street level
// day / golden hour / night: from Bay Road looking at the Golden Gate, on its walkway, driving its deck, from the headland, the
// statue, the opera, the prison from the water; then the iso map. ONLY=bayroad,walk,… TIMES=13,18.6,22 (env)
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192", OUT = "shots/gta/bay/b"] = process.argv.slice(2);
const SPOT = {
  // [x, z, heading (0 north/−z, π south, π/2 west, −π/2 east), pitch, car?]
  bayroad: [147, 134, Math.PI - 0.12, 0.24],
  quay: [112, 143, -2.36, 0.16],
  walk: [158 + 14.4, 176, Math.PI, 0.02],
  drive: [158 - 2.2, 150, Math.PI, -0.02, true],
  deck: [158 + 5.6, 198, 0, 0.0, true],
  vista: [158 + 14.4, 208, 0.25, 0.1],
  beach: [239, 162, Math.PI / 2 + 0.22, 0.1],
  statue: [46, 204, 0, 0.42],
  liberty: [50, 168, Math.PI, 0.32],
  opera: [-30, 143, Math.PI + 0.1, 0.12],
  prison: [-117, 168, Math.PI, 0.2],
};
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(SPOT);
const times = (process.env.TIMES ?? "13,18.6,22").split(",").map(Number);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/429|500|Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 200)));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.settings.sky = "cycle"; g.heat.clear?.(); const st = document.createElement("style"); st.textContent = ".gta-hud,.gta-radio{display:none!important}"; document.head.append(st); });
const fps = [];
for (const name of only) {
  const [x, z, h, pitch, car] = SPOT[name];
  await p.evaluate((x, z, h, pitch, car) => {
    const g = street.gta;
    if (car) {
      if (!g.car) {
        const gt = g.parked.find((c) => c.kind === "gt");
        g.player.place(gt.group.position.x + 2, 0.2, gt.group.position.z, 0);
        g.getIn();
      }
      g.car.place(x, z, h + Math.PI / 2);
      g.car.vel.set(0, 0);
      g.cam.behind(h, pitch);
      g.cam.snap(g.car.group.position.clone().setY(g.car.group.position.y + 1.2));
    } else {
      if (g.car) g.getOut(true);
      const y = g.host.ground(x, z) ?? 0.2;
      g.player.place(x, y, z, h);
      g.cam.behind(h, pitch);
      g.cam.snap(g.player.pos.clone().setY(y + 1.55));
    }
  }, x, z, h, pitch, !!car);
  for (const hour of times) {
    await p.evaluate((hour) => street.gta.clock.force(hour, "fair"), hour);
    await sleep(1600);
    await p.screenshot({ path: `${OUT}-${name}-${String(hour).replace(".", "h")}.png` });
  }
  const f = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
  fps.push([name, f]);
}
console.log("fps", JSON.stringify(fps));
if (!process.env.NOGAMEMAP) {
  // the game's own map (M), on the bridge
  await p.evaluate(() => { const g = street.gta; if (g.car) g.getOut(true); g.player.place(158 + 14.4, 3, 180, Math.PI); street.gta.clock.force(13, "fair"); });
  await sleep(1200);
  await p.evaluate(() => { const st = document.createElement("style"); st.textContent = ".gta-hud{display:block!important}"; document.head.append(st); });
  await p.keyboard.press("KeyM");
  await sleep(1800);
  await p.screenshot({ path: `${OUT}-gamemap.png` });
  await p.keyboard.press("KeyM");
  await sleep(600);
}
if (!process.env.NOMAP) {
  await p.evaluate(() => street.gta.stop());
  await sleep(2500);
  await p.screenshot({ path: `${OUT}-map.png` });
}
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
