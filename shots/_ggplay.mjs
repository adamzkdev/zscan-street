// node shots/_ggplay.mjs [OUT]: the big Golden Gate in the game (third-person camera, the game's own clock):
// day, golden hour and night from Bay Road, the deck, the headland and Orchard Beach; the HUD's minimap and the big map
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/ggbig/play"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&solo");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => street.gta.hud.coach(-1));
const at = (x, z, h, pitch) => p.evaluate((x, z, h, pitch) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, pitch); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h, pitch);
// (0 = facing north, PI = south)
const SPOTS = {
  bayroad: [146, 134, Math.PI, 0.12],
  deck: [172.4, 330, Math.PI, 0.05],
  tower: [172.4, 268, Math.PI, 0.32],
  headland: [166, 612, 0, 0.1],
  beach: [206, 900, 0, 0.12],
};
const HOURS = { day: 12.5, golden: 18.4, night: 22.5 };
const which = (process.env.ONLY ?? Object.keys(SPOTS).join(",")).split(",");
for (const [tod, hour] of Object.entries(HOURS)) {
  await p.evaluate((h) => street.gta.clock.force(h, "fair"), hour);
  for (const name of which) {
    await at(...SPOTS[name]);
    await sleep(name === "beach" ? 6000 : 3500);
    await p.screenshot({ path: `${OUT}-${name}-${tod}.png` });
  }
}
await p.evaluate(() => street.gta.clock.force(12.5, "fair"));
await at(172.4, 380, Math.PI, 0.1);
await sleep(2500);
await p.evaluate(() => street.gta.hud.toggleMap(true));
await sleep(2500);
await p.screenshot({ path: `${OUT}-bigmap.png` });
console.log("errors", errs.length, errs.slice(0, 4).join("\n"));
await b.close();
