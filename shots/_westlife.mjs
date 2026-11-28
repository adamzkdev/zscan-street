// node shots/_westlife.mjs [URL] [OUT]: Gamla's finishing (src/scene/isles/west): the castle's walls stop a body on the hill
// (its gate's doorstep free), the old town's street lamps lit at night (their heads and the street's pool of lamp lights), the
// cafés' customers at Domplein's terraces and the Grote Markt's stallholders (src/gta/sitters.ts), the cathedral up close.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo", OUT = "shots/gta/isles/west/life"] = process.argv.slice(2);
mkdirSync(OUT.replace(/\/[^/]*$/, ""), { recursive: true });
const NOSHOT = !!process.env.NOSHOT;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.keys?.done, { timeout: 300000, polling: 300 });
await p.waitForFunction(() => window.street.isles?.live?.every((L) => L.content), { timeout: 180000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.heat.raise = () => {}; });
let fails = 0;
const check = (ok, what, info = "") => { if (!ok) fails++; console.log(ok ? "ok  " : "FAIL", what, info); };
const shot = async (name) => { if (!NOSHOT) await p.screenshot({ path: `${OUT}-${name}.jpg`, type: "jpeg", quality: 62 }); };
const stand = async (name, x, z, h, pitch = -0.1, wait = 3500) => {
  await p.evaluate((x, z, h, pitch) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, pitch); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h, pitch);
  await sleep(wait);
  if (name) await shot(name);
};
// the castle: from the hilltop's gate, walk north into the wall: stopped; walk along the outside of the east wall: stopped
const C = { x: -2252, z: -342, R: 14 };
const walk = async (x, z, h, ms) => {
  await stand(null, x, z, h, -0.1, 2500);
  return p.evaluate(async (ms) => {
    const g = street.gta;
    const a = g.player.pos.clone();
    g.input.stick.x = 0; g.input.stick.y = 1;
    await new Promise((r) => setTimeout(r, ms));
    g.input.stick.y = 0;
    const b = g.player.pos;
    return { from: [+a.x.toFixed(1), +a.y.toFixed(1), +a.z.toFixed(1)], to: [+b.x.toFixed(1), +b.y.toFixed(1), +b.z.toFixed(1)] };
  }, ms);
};
// (heading 0 = north (−z), π = south; the walker faces h)
const w1 = await walk(C.x + 8, C.z + C.R + 4, 0, 3000);
check(w1.to[2] > C.z + C.R + 0.5, "the castle's south wall stops you (walking north into it)", JSON.stringify(w1));
const w2 = await walk(C.x + C.R + 4, C.z, -Math.PI / 2 + Math.PI, 3000);
check(w2.to[0] > C.x + C.R + 0.5, "its east wall stops you (walking west into it)", JSON.stringify(w2));
const w3 = await walk(C.x, C.z + C.R + 5, 0, 2500);
check(w3.to[2] > C.z + C.R + 0.4 && w3.to[2] < C.z + C.R + 3, "up to the gate's doorstep, not through the gate", JSON.stringify(w3));
await stand("castle-gate", C.x, C.z + C.R + 6, 0, 0.05);
// the cafés' customers and the stallholders
const sit = await p.evaluate(() => ({ seats: street.isles.seats.length, near: street.gta.sitters.near(-2055, -197, 30).length }));
check(sit.seats > 60 && sit.near > 10, "Domplein's terraces have their customers", JSON.stringify(sit));
await stand("domplein-day", -2055, -170, 0, -0.05, 6000);
const in3d = await p.evaluate(() => street.gta.people.stats?.() ?? null);
console.log("people", JSON.stringify(in3d));
await stand("markt-day", -1985, -88, 0, -0.05, 5000);
await stand("cathedral-close", -2055, -150, Math.PI, 0.35, 4000);
await stand("cathedral-side", -2020, -100, -Math.PI / 2 + Math.PI, 0.25, 4000);
// at night: the lamps lit (their heads shown, the lamp-light pool on Gamla's lamps)
await p.evaluate(() => street.gta.apply?.({ ...street.gta.settings, sky: "night" }));
await sleep(5000);
await stand("night-domplein", -2055, -170, 0, -0.02, 5000);
const lit = await p.evaluate(() => {
  const L = street.isles.live.find((l) => l.isle.key === "gamla");
  let heads = 0, shown = 0;
  L.root.traverse((o) => { const m = o.material; if (m && (Array.isArray(m) ? m : [m]).some((x) => x.userData.night)) { heads++; if (o.visible) shown++; } });
  return { heads, shown, poolNearest: street.lampLightsNear?.() ?? null };
});
check(lit.heads > 0 && lit.shown === lit.heads, "Gamla's night lights on at night", JSON.stringify(lit));
await stand("night-street", -2010, -280, Math.PI, -0.02, 4000);
await stand("night-cathedral", -2055, -165, Math.PI, 0.3, 4000);
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
console.log(fails ? `${fails} FAILED` : "ALL OK");
await b.close();
