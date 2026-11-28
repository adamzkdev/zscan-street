// node shots/_operatop.mjs: the opera house's podium on foot (src/scene/real/baymarks.ts): up the Monumental Steps from
// the forecourt to its door in the Concert Hall's foyer glass at the top, the shells stopping you on the deck; a shot
// of the door from the steps, and of the podium.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
mkdirSync("shots/gta/opera", { recursive: true });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&solo");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.gta.doorsReady, { timeout: 900000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what, info = "") => { if (!ok) fails++; console.log(ok ? "ok  " : "FAIL", what, info); };
const door = await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.heat.raise = () => {}; g.nearDoors(0, 0); const d = g.placeSpots.find((d) => d.key === "opera"); return d && { x: d.x, z: d.z, y: d.y, fx: d.fx, fz: d.fz, drawn: d.drawn, room: d.room }; });
check(!!door && door.y > 3.5, "the opera's door is up on its podium", JSON.stringify(door));
// from the forecourt, 14 m out in front of the door, walk straight up the steps to it
// (a heading h walks toward (−sin h, −cos h): facing the door from in front of it is atan2(fx, fz))
const H = Math.atan2(door.fx, door.fz);
const start = { x: door.x + door.fx * 9.5, z: door.z + door.fz * 9.5 };
await p.evaluate((s, H) => { const g = street.gta; const y = g.host.ground(s.x, s.z) ?? 0.2; g.player.place(s.x, y, s.z, H); g.cam.behind(H, -0.05); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, start, H);
await sleep(2500);
await p.screenshot({ path: "shots/gta/opera/steps.jpg", type: "jpeg", quality: 62 });
const up = await p.evaluate(async (door) => {
  const g = street.gta;
  const trail = [];
  g.input.stick.x = 0; g.input.stick.y = 1;
  for (let t = 0; t < 70; t++) {
    await new Promise((r) => setTimeout(r, 100));
    const q = g.player.pos;
    if (t % 7 === 0) trail.push([+q.x.toFixed(1), +q.y.toFixed(2), +q.z.toFixed(1)]);
    if (Math.hypot(q.x - door.x, q.z - door.z) < 1.6) break;
  }
  g.input.stick.y = 0;
  const q = g.player.pos;
  return { d: +Math.hypot(q.x - door.x, q.z - door.z).toFixed(2), y: +q.y.toFixed(2), trail, prompt: document.querySelector(".gh-prompt, .gta-prompt, [class*=prompt]")?.textContent ?? null };
}, door);
check(up.d < 2.2 && Math.abs(up.y - door.y) < 0.4, "up the Monumental Steps to the door", JSON.stringify(up));
await sleep(1200);
await p.screenshot({ path: "shots/gta/opera/door.jpg", type: "jpeg", quality: 62 });
// on the deck, walk into the Concert Hall's shell (from beside the door, along its glass): stopped
const deck = await p.evaluate(async (door) => {
  const g = street.gta;
  // (12 m to the side of the door, 2 m in under the shells' row, walking along the podium toward the door's shell)
  const rx = -door.fz, rz = door.fx;
  const s = { x: door.x - rx * 12 - door.fx * 2, z: door.z - rz * 12 - door.fz * 2 };
  const H = Math.atan2(-rx, -rz);
  g.player.place(s.x, door.y, s.z, H);
  await new Promise((r) => setTimeout(r, 800));
  const a = g.player.pos.clone();
  g.input.stick.y = 1;
  await new Promise((r) => setTimeout(r, 4000));
  g.input.stick.y = 0;
  const q = g.player.pos;
  return { from: [+a.x.toFixed(1), +a.y.toFixed(2), +a.z.toFixed(1)], to: [+q.x.toFixed(1), +q.y.toFixed(2), +q.z.toFixed(1)], moved: +Math.hypot(q.x - a.x, q.z - a.z).toFixed(1) };
}, door);
check(deck.to[0] < door.x - 3 && deck.to[1] > door.y - 0.4, "a shell stops you on the deck (short of the door's line)", JSON.stringify(deck));
await p.evaluate((door) => { const g = street.gta; const H = Math.atan2(door.fx, door.fz); const x = door.x + door.fx * 7, z = door.z + door.fz * 7; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, H); g.cam.behind(H, 0.28); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, door);
await sleep(2500);
await p.screenshot({ path: "shots/gta/opera/podium.jpg", type: "jpeg", quality: 62 });
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
console.log(fails ? `${fails} FAILED` : "ALL OK");
await b.close();
