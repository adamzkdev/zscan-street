// node shots/_gtainout.mjs [N]: in and out of doors in the game (src/gta): every place's door and N buildings' —
// E at the door takes you in; leaving puts you back on that door's step, a pace out, your back to it (facing the street)
import puppeteer from "puppeteer-core";
const N = Number(process.argv[2] ?? 8);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 1800000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 640, height: 360 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
// (the console's warnings counted: a bounds computed on emptied vertices says NaN)
let nanWarn = 0;
p.on("console", (m) => m.text().includes("computeBoundingBox") && nanWarn++);
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&solo");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.gta.doorsReady, { timeout: 900000, polling: 300 });
await new Promise((r) => setTimeout(r, 3000));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await p.evaluate((N) => {
  const g = street.gta;
  g.hud.coach(-1);
  g.nearDoors(0, 0);
  // (the stadium asks which match first: its own test)
  const pl = g.placeSpots.filter((d) => !d.bare && d.key !== "nu7tower" && d.key !== "stadium").map((d) => ({ key: d.key, x: d.x, z: d.z, fx: d.fx, fz: d.fz, y: d.y }));
  const bs = g.buildingSpots;
  const step = Math.max(1, Math.floor(bs.length / N));
  return [...pl, ...bs.filter((_, i) => i % step === 0).slice(0, N).map((d) => ({ key: d.key, x: d.x, z: d.z, fx: d.fx, fz: d.fz, y: d.y }))];
}, N);
let bad = 0;
for (const d of ONLY ? list.filter((x) => ONLY.includes(x.key)) : list) {
  // at the door, facing it: E
  const at = await p.evaluate((d) => {
    const g = street.gta;
    const h = Math.atan2(d.fx, d.fz);
    g.player.place(d.x + d.fx * 1.3, d.y, d.z + d.fz * 1.3, h);
    g.cam.behind(h, -0.1);
    g.cam.snap(g.player.pos.clone().setY(d.y + 1.55));
    if (d.key.startsWith("building:")) g.nearDoors(d.x, d.z);
    g.doors.update(0, { x: g.player.pos.x, z: g.player.pos.z, heading: h });
    return g.doors.at?.key ?? null;
  }, d);
  await sleep(250);
  await p.keyboard.press("KeyE");
  const inside = await p.waitForFunction(() => !!street.interiors.active && !street.interiors.warming, { timeout: 30000, polling: 200 }).then(() => true, () => false);
  if (!inside) {
    bad++;
    console.log(`FAIL ${d.key.padEnd(16)} E offered: ${at === d.key} — did not go in`);
    continue;
  }
  await sleep(600);
  await p.evaluate(() => street.leavePlace());
  await p.waitForFunction(() => !street.interiors.active, { timeout: 30000, polling: 200 }).catch(() => {});
  await sleep(900);
  const r = await p.evaluate((d) => {
    const g = street.gta;
    const q = g.player.pos;
    const along = (q.x - d.x) * d.fx + (q.z - d.z) * d.fz,
      across = Math.abs(-(q.x - d.x) * d.fz + (q.z - d.z) * d.fx);
    // facing away from the door (the street's way): the heading's direction is (−sin h, −cos h)
    const lx = -Math.sin(g.player.facing),
      lz = -Math.cos(g.player.facing);
    return { along: +along.toFixed(2), across: +across.toFixed(2), facing: +(lx * d.fx + lz * d.fz).toFixed(2), y: +(q.y - d.y).toFixed(2) };
  }, d);
  const ok = r.along > 0.6 && r.along < 3 && r.across < 1.2 && r.facing > 0.85 && Math.abs(r.y) < 0.7;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${d.key.padEnd(16)} out: ${r.along} m in front, ${r.across} m aside, facing the street ${r.facing}, ${r.y} m over the door's floor`);
}
console.log(`${list.length} doors, ${bad} failed; errors ${errs.length} ${errs.slice(0, 3).join(" | ")}; NaN bounds warnings ${nanWarn}`);
await b.close();
