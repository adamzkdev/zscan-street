// THE CITY, as a visitor sees it: the map (the start, zoomed in, the whole city, turned), on foot (walk,
// run), a walk-in place, by day and by night, at 1440 / 1280 and on phones and tablets held either way
// (touch emulated), the corner's "more" fold on a phone. Every shot audited (audit.mjs: HUD panels
// overlapping, cut by the screen, text out of its box). node shots/bench/city.mjs [out] [filter: desk,lap,phone,tablet]
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { snap, report } from "./audit.mjs";
const OUT = process.argv[2] ?? "captures/bench/city";
const FILTER = process.argv[3] ?? "";
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BENCH_URL ?? "http://localhost:3014";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DESK = { width: 1440, height: 900 };
const LAP = { width: 1280, height: 720 };
const touch = (w, h, k = 2) => ({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: k, isLandscape: w > h });
const PAGES = [
  { id: "desk-day", vp: DESK, theme: "day", tour: true, foot: true, place: "museum" },
  { id: "desk-night", vp: DESK, theme: "night", foot: true, place: "tower" },
  { id: "lap-day", vp: LAP, theme: "day", foot: true },
  { id: "phone-side", vp: touch(844, 390), theme: "day", foot: true, place: "museum", more: true },
  { id: "phone-up", vp: touch(390, 844), theme: "night", more: true },
  { id: "tablet-up", vp: touch(820, 1180), theme: "day" },
  { id: "tablet-side", vp: touch(1180, 820), theme: "day", foot: true },
].filter((c) => !FILTER || FILTER.split(",").some((f) => c.id.startsWith(f)));

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist"] });
const errs = [];
const stats = [];
for (const c of PAGES) {
  const p = await b.newPage();
  await p.setViewport(c.vp);
  if (c.vp.hasTouch) await p.setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36");
  const consoleErrs = [];
  p.on("pageerror", (e) => errs.push(c.id + ": " + e.message.slice(0, 160)));
  p.on("console", (m) => m.type() === "error" && consoleErrs.push(m.text().slice(0, 200)));
  const t0 = Date.now();
  await p.goto(`${BASE}/?debug&theme=${c.theme}`, { timeout: 180000 });
  await p.waitForFunction(() => window.__streetUp && window.street?.onFoot, { timeout: 280000, polling: 500 });
  const info = { id: c.id, bootS: Math.round((Date.now() - t0) / 1000) };
  await p.waitForFunction(() => !document.getElementById("boot"), { timeout: 60000, polling: 300 }).catch(() => {});
  await wait(4000);
  const shot = (n) => snap(p, { path: `${OUT}/${c.id}-${n}.png` });
  const fps = async (ms = 2000) => p.evaluate((ms) => new Promise((done) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else done(Math.round((n * 1000) / (performance.now() - t0))); }; requestAnimationFrame(f); }), ms);
  await shot("0-first");
  info.fpsMap = await fps();
  if (c.tour) {
    await p.evaluate(() => window.street.rig.zoomBy?.(1.8)); await wait(1800); await shot("1-zoomin");
    await p.evaluate(() => window.street.rig.setMode("overview")); await wait(2500); await shot("1-whole");
    await p.evaluate(() => window.street.rig.setMode("live")); await wait(1500);
    await p.evaluate(() => window.street.rig.turnBy?.(Math.PI / 2)); await wait(1800); await shot("1-turned");
    await p.evaluate(() => { window.street.rig.turnBy?.(-Math.PI / 2); window.street.rig.home?.(); }); await wait(1500);
  }
  if (c.more) {
    await p.click(".hbtn.more").catch(() => {}); await wait(500); await shot("2-more");
    await p.mouse.click(c.vp.width / 2, c.vp.height / 2); await wait(500);
  }
  if (c.foot) {
    await p.evaluate(() => window.street.walk(true)); await wait(3000);
    await shot("3-foot");
    info.fpsFoot = await fps();
    await p.keyboard.down("KeyW"); await wait(1400); await shot("3-walk");
    await p.keyboard.down("ShiftLeft"); await wait(1400); await shot("3-run");
    await p.keyboard.up("ShiftLeft"); await p.keyboard.up("KeyW"); await wait(600);
    await p.evaluate(() => window.street.walk(false)); await wait(1500);
  }
  if (c.place) {
    await p.evaluate((k) => window.street.enter(k), c.place);
    await p.waitForFunction(() => window.street.interiors.active, { timeout: 60000 }).catch(() => {});
    await wait(1200); await shot("4-arrive");
    await wait(3000); await shot("4-inside");
    info.fpsInside = await fps();
    await p.keyboard.press("Escape"); await wait(1500); await shot("4-out");
  }
  info.consoleErrors = consoleErrs.filter((e) => !/Failed to load resource|WebSocket connection/.test(e));
  stats.push(info);
  console.log(c.id, JSON.stringify(info));
  await p.close();
}
writeFileSync(`${OUT}/stats.json`, JSON.stringify(stats, null, 2));
console.log("errors", errs);
report("city");
await b.close();
