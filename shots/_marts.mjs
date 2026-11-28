// node shots/_marts.mjs [URL] [OUT]: the 24-hour stores and the malls in the game (src/scene/real/marts.ts, the
// interiors src/interior/mart.ts and islemall.ts): a store in the city, one on each island and in Orchard Keys, each
// mall — outside by day (one store at night too), its door offered at the step, E walks in, the interior dressed after
// the door's name (the chain's store, the mall's atrium); fps outside and inside, and on each island's main street.
// Writes OUT/<key>-out.jpg and OUT/<key>-in.jpg (ONLY=a,b picks targets; NOSHOT=1 skips the pictures).
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/marts"] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const NOSHOT = !!process.env.NOSHOT;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 1800000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.gta.doorsReady && window.street.keys?.done, { timeout: 900000, polling: 300 });
await p.waitForFunction(() => window.street.isles?.live?.every((L) => L.content), { timeout: 300000, polling: 300 });
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); if (g.heat) g.heat.raise = () => {}; });
await sleep(2000);
const fps = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
/** Stand at (x, z) facing h (0: north), the camera behind. */
const stand = (x, z, h, pitch = -0.08) => p.evaluate((x, z, h, pitch) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, pitch); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h, pitch);
const shot = async (name) => { if (!NOSHOT) await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 72 }); };
const night = (on) => p.evaluate((on) => street.gta.apply?.({ ...street.gta.settings, sky: on ? "night" : "day" }), on);

// the targets: the door's name, roughly where it is, a point on the street to come from, how far back to stand for the outside view
const T = [
  { key: "city-shield24", label: "SHIELD 24", at: [-205.6, -15.2], from: [-205, -1], back: 13 },
  { key: "city-zkmart", label: "ZK MART", at: [-177.4, 12.4], from: [-176, 0], back: 13 },
  { key: "city-konbiniz", label: "KONBINI Z", at: [-99, -169.5], from: [-99, -158], back: 11 },
  { key: "north-konbiniz", label: "KONBINI Z", at: [-94.7, -1378.2], from: [-95, -1363], back: 13, night: true },
  { key: "north-shield24", label: "SHIELD 24", at: [-84.4, -1468], from: [-84, -1458], back: 9 },
  { key: "north-mall", label: "ZUJI MALL", at: [13, -1470], from: [13, -1458], back: 24, pitch: 0.3 },
  { key: "west-kiosk", label: "24/ZEC", at: [-1952, -165.4], from: [-1952, -156], back: 9 },
  { key: "west-mall", label: "GAMLA GALLERIA", at: [-1976, -31.6], from: [-1976, -40], back: 24, pitch: 0.3 },
  { key: "east-shield24", label: "SHIELD 24", at: [1259.3, -262.2], from: [1259, -250], back: 13 },
  { key: "east-konbiniz", label: "KONBINI Z", at: [964 + 538, -128], from: [955 + 538, -128], back: 10 },
  { key: "east-mall", label: "SHIELD CITY", at: [825 + 538, -143.6], from: [825 + 538, -156], back: 20, pitch: 0.3 },
  { key: "keys-zkmart", label: "ZK MART", at: [148.5, 674], from: [158, 674], back: 12 },
];
const rows = [];
let fails = 0;
for (const t of ONLY ? T.filter((x) => ONLY.includes(x.key)) : T) {
  const row = { key: t.key, label: t.label };
  // come from the street, wait for the island's solid shape and its doors
  await stand(t.from[0], t.from[1], 0);
  await sleep(1500);
  const spot = await p.evaluate(async (t) => {
    const g = street.gta;
    for (let k = 0; k < 120; k++) {
      g.nearDoors(t.from[0], t.from[1]);
      const s = (g.buildingSpots ?? []).filter((s) => s.label === t.label && Math.hypot(s.x - t.at[0], s.z - t.at[1]) < 24).sort((a, b) => Math.hypot(a.x - t.at[0], a.z - t.at[1]) - Math.hypot(b.x - t.at[0], b.z - t.at[1]))[0];
      if (s) return { key: s.key, x: s.x, z: s.z, fx: s.fx, fz: s.fz, y: s.y, type: s.type, kind: s.kind };
      await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  }, t);
  if (!spot) {
    fails++;
    console.log(`FAIL ${t.key}: no door named ${t.label} near ${t.at}`);
    rows.push({ ...row, door: false });
    continue;
  }
  row.door = [+spot.x.toFixed(1), +spot.z.toFixed(1)];
  row.map = spot.kind;
  const h = Math.atan2(spot.fx, spot.fz);
  // outside: back from the door, facing it
  await stand(spot.x + spot.fx * t.back, spot.z + spot.fz * t.back, h, t.pitch ?? -0.02);
  await sleep(2600);
  await shot(`${t.key}-out`);
  row.fpsOut = await fps();
  if (t.night) {
    await night(true);
    await sleep(4000);
    await shot(`${t.key}-out-night`);
  }
  // at the step: the door offered, E in
  const at = await p.evaluate((d) => {
    const g = street.gta;
    const h = Math.atan2(d.fx, d.fz);
    g.player.place(d.x + d.fx * 1.3, d.y, d.z + d.fz * 1.3, h);
    g.cam.behind(h, -0.1);
    g.cam.snap(g.player.pos.clone().setY(d.y + 1.55));
    g.nearDoors(d.x, d.z);
    g.doors.update(0, { x: g.player.pos.x, z: g.player.pos.z, heading: h });
    return g.doors.at?.key ?? null;
  }, spot);
  row.offered = at === spot.key;
  await sleep(300);
  await p.keyboard.press("KeyE");
  const inside = await p.waitForFunction(() => street.interiors.active?.key === "building" && !street.interiors.warming, { timeout: 30000, polling: 200 }).then(() => true, () => false);
  row.inside = inside;
  if (inside) {
    // (the entry's film skipped; a store's view turned toward its counter and cashier)
    await sleep(800);
    await p.keyboard.press("ShiftLeft");
    await sleep(1500);
    // (the game's own body and camera indoors: turned toward the counter, on the right past the door)
    if (!/MALL|GALLERIA|CITY|DECKS/.test(t.label))
      await p.evaluate(() => { const g = street.gta; const h = -0.75; g.player.place(-0.6, 0, -2.0, h); g.cam.behind(h, -0.12); g.cam.snap(g.player.pos.clone().setY(1.35)); });
    await sleep(2500);
    row.title = await p.evaluate(() => street.interiors.active?.title ?? null);
    await shot(`${t.key}-in${t.night ? "-night" : ""}`);
    row.fpsIn = await fps();
    await p.evaluate(() => street.leavePlace());
    await p.waitForFunction(() => !street.interiors.active, { timeout: 30000, polling: 200 }).catch(() => {});
    await sleep(1200);
  }
  if (t.night) await night(false);
  const ok = row.offered && row.inside && row.title === t.label;
  if (!ok) fails++;
  rows.push(row);
  console.log(`${ok ? "ok  " : "FAIL"} ${JSON.stringify(row)}`);
}
// the big map knows them: its shops (the buildings' doors by kind) carry the chains' and the malls' names
{
  const names = await p.evaluate(() => {
    const g = street.gta;
    g.mapCache = null;
    const d = g.mapData();
    return (d?.buildings ?? []).filter((b) => b.cat === "shop" && /^(ZK MART|SHIELD 24|KONBINI Z|24\/ZEC|ZUJI MALL|GAMLA GALLERIA|SHIELD CITY|ZAIBA DECKS)$/.test(b.label)).map((b) => b.label);
  });
  const by = {};
  for (const n of names) by[n] = (by[n] ?? 0) + 1;
  console.log(`map: ${names.length} stores and malls among its shops ${JSON.stringify(by)}`);
}
// fps where it was before: the city's heart, each island's main street, a mall's front — with the stores and
// malls' own meshes shown and hidden (the city's group, every island's pictures; the islands' kit geometry is
// merged with their towns' and stays)
if (!ONLY) {
  const show = (on) => p.evaluate((on) => street.scene3.traverse((o) => { if (/marts/.test(o.name)) o.visible = on; }), on);
  for (const [name, x, z, h] of [
    ["heart", 0, 3.5, -1.57],
    ["city-avenue-west", -190, 0, -1.57],
    ["zakone-bridge-ave", -116, -1420, 0],
    ["zuji-mall", 13, -1452, 0],
    ["gamla-boulevard", -1960, -150, 1.57],
    ["gamla-galleria", -1976, -44, Math.PI],
    ["zaiba-rainbow", 1350, -150, -1.57],
  ]) {
    await stand(x, z, h);
    await sleep(4000);
    const on = [],
      off = [];
    for (let k = 0; k < 2; k++) {
      await show(false);
      await sleep(300);
      off.push(await fps());
      await show(true);
      await sleep(300);
      on.push(await fps());
    }
    console.log(`fps ${name}: with ${on.join(" ")} · without ${off.join(" ")}`);
  }
}
console.log(`summary: ${rows.length - fails}/${rows.length} ok; errors ${errs.length}`);
for (const e of errs.slice(0, 6)) console.log("  ", e.slice(0, 300));
await b.close();
process.exit(fails ? 1 : 0);
