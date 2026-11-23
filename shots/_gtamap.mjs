// node shots/_gtamap.mjs [URL] [OUT]: the game's map (src/gta/hud.ts drawMap): the atlas, names, places by kind,
// a waypoint set by a click and the GPS's way by the streets, on the map and on the radar
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/map"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/429|Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 200)));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = [];
const check = (name, v, info = "") => { ok.push(!!v); console.log(`${v ? "ok  " : "FAIL"} ${name} ${info}`); };
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.player.place(1.5, 0.2, 8, 0); g.cam.behind(0, -0.15); });
await sleep(4000);
await p.evaluate(() => street.gta.hud.toggleMap(true));
await sleep(800);
await p.screenshot({ path: `${OUT}-1-city.png` });
const md = await p.evaluate(() => { const d = street.gta.mapData(); return d ? { streets: d.streets.length, districts: d.districts.map((x) => x.name), buildings: d.buildings.length, lines: d.lines.length, ferries: d.ferries.length } : null; });
check("the map knows the streets, districts, doors, metro", md && md.streets > 20 && md.districts.length > 4 && md.lines === 2, JSON.stringify(md));
await p.evaluate(() => { const h = street.gta.hud; h.mapZoom = 2.4; h.drawMap(); });
await sleep(500);
await p.screenshot({ path: `${OUT}-2-zoom.png` });
// a click on the map: a waypoint, and the way there by the streets
await p.mouse.click(1180, 620);
await sleep(1600);
const way = await p.evaluate(() => { const g = street.gta; const r = g.route ?? []; const on = r.slice(2, -2).filter((q) => g.roads.road(q.x, q.z)).length; return { wp: g.waypoint, n: r.length, on, of: Math.max(0, r.length - 4) }; });
check("a click sets a waypoint", way.wp, JSON.stringify(way.wp));
check("the GPS goes by the streets", way.n > 3 && way.on === way.of, `${way.on}/${way.of} turns on a road, ${way.n} points`);
await p.screenshot({ path: `${OUT}-3-waypoint.png` });
await p.evaluate(() => { const h = street.gta.hud; h.mapZoom = 4.2; h.drawMap(); });
await sleep(400);
await p.screenshot({ path: `${OUT}-4-close.png` });
// the radar with the way on it
await p.evaluate(() => street.gta.hud.toggleMap(false));
await sleep(900);
await p.screenshot({ path: `${OUT}-5-radar.png` });
check("the radar's card says how far", /Waypoint/.test(await p.evaluate(() => document.querySelector(".gh-where")?.textContent ?? "")));
// fast travel from the map's footer
await p.evaluate(() => street.gta.hud.toggleMap(true));
await sleep(500);
const before = await p.evaluate(() => ({ ...street.gta.player.pos }));
await p.evaluate(() => document.querySelector('.gh-mway [data-act="travel"]')?.click());
await sleep(1500);
const after = await p.evaluate(() => ({ ...street.gta.player.pos, map: street.gta.hud.mapOpen }));
check("fast travel takes you there", Math.hypot(after.x - before.x, after.z - before.z) > 20 && !after.map, `${Math.hypot(after.x - before.x, after.z - before.z).toFixed(0)} m`);
console.log(`checks ${ok.filter(Boolean).length}/${ok.length}`);
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
