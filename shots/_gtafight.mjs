// node shots/_gtafight.mjs [URL] [OUT]: the street's fists (src/gta/peds.ts): a click punches, a fighter hits back,
// a knockout and the crowd round it, two passers-by falling out, talking to one (E), going down (Wasted),
// a door that stops you (E only), and no picking of buildings with the mouse
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/fight"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/429|Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 200)));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = [];
const check = (name, v, info = "") => { ok.push([name, !!v]); console.log(`${v ? "ok  " : "FAIL"} ${name} ${info}`); };
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.player.place(-149.4, 0.2, 3.6, 0); g.cam.behind(0, -0.12); });
await sleep(10000);
console.log(await p.evaluate(() => JSON.stringify({ peds: street.gta.peds.count, in3d: street.gta.people.slots.size })));
// a passer-by, made a fighter, right in front of you
const setUp = async (temper) => p.evaluate((temper) => {
  const g = street.gta, me = g.player.pos;
  const q = [...g.peds.all].filter((x) => x.knockT < 0 && !x.foe).sort((a, b) => Math.hypot(a.pos.x - me.x, a.pos.z - me.z) - Math.hypot(b.pos.x - me.x, b.pos.z - me.z))[0];
  if (!q) return null;
  q.temper = temper; q.mode = "idle"; q.modeT = 30; q.hp = 100;
  // (nobody else within reach: the fist is for this one)
  for (const o of g.peds.all) if (o !== q && Math.hypot(o.pos.x - q.pos.x, o.pos.z - q.pos.z) < 4) o.pos.set(o.pos.x + 9, o.pos.y, o.pos.z + 9);
  if (q.mate) q.mate.mate = null; q.mate = null; q.convo = null; q.cross = null;
  const h = Math.atan2(-(q.pos.x - me.x), -(q.pos.z - me.z));
  const d = 1.0;
  g.player.place(q.pos.x + Math.sin(h) * d, q.pos.y, q.pos.z + Math.cos(h) * d, h);
  g.cam.behind(h + 0.5, -0.1);
  g.cam.snap(g.player.pos.clone().setY(g.player.pos.y + 1.4));
  return q.key;
}, temper);
const ped = (key) => p.evaluate((key) => { const q = street.gta.peds.all.find((x) => x.key === key); return q ? { hp: Math.round(q.hp), mode: q.mode, down: q.knockT >= 0, foe: q.foe === "me" ? "me" : q.foe ? "ped" : null } : null; }, key);
let key = await setUp("fighter");
check("a passer-by in front", key);
await sleep(400);
// a left click on the canvas: a punch (and no building picked, no panel)
await p.mouse.click(800, 450);
await sleep(60);
const punching = await p.evaluate(() => street.gta.player.body.act.punch >= 0);
check("a click punches", punching);
await sleep(600);
let s1 = await ped(key);
check("the punch hurt it", s1 && s1.hp < 100, JSON.stringify(s1));
check("a fighter fights back", s1 && s1.mode === "fight" && s1.foe === "me", JSON.stringify(s1));
const hp0 = await p.evaluate(() => street.gta.hp);
await sleep(3500);
await p.screenshot({ path: `${OUT}-1-fight.png` });
const hp1 = await p.evaluate(() => street.gta.hp);
check("its fists hurt you", hp1 < hp0, `${hp0} → ${Math.round(hp1)}`);
check("no panel opened by the click", !(await p.evaluate(() => !!document.querySelector("#ui .panel.open"))));
// punch it out
for (let k = 0; k < 8; k++) {
  const s = await ped(key);
  if (!s || s.down) break;
  await p.evaluate((key) => { const g = street.gta; const q = g.peds.all.find((x) => x.key === key); const me = g.player.pos; g.player.facing = Math.atan2(-(q.pos.x - me.x), -(q.pos.z - me.z)); if (Math.hypot(q.pos.x - me.x, q.pos.z - me.z) > 1.1) g.player.place(q.pos.x + Math.sin(g.player.facing) * 0.95, q.pos.y, q.pos.z + Math.cos(g.player.facing) * 0.95, g.player.facing); g.player.punch(); }, key);
  await sleep(450);
}
s1 = await ped(key);
check("knocked out", s1 && s1.down, JSON.stringify(s1));
await sleep(900);
const crowd = await p.evaluate(() => { const m = {}; for (const q of street.gta.peds.all) m[q.mode] = (m[q.mode] ?? 0) + 1; return m; });
console.log("the street round it", JSON.stringify(crowd));
check("the crowd reacts (runs, films, watches or calls)", (crowd.flee ?? 0) + (crowd.film ?? 0) + (crowd.watch ?? 0) + (crowd.call ?? 0) > 0);
await p.screenshot({ path: `${OUT}-2-ko.png` });
// two of them fall out
const pair = await p.evaluate(() => {
  const g = street.gta, me = g.player.pos;
  const qs = [...g.peds.all].filter((x) => x.knockT < 0 && !x.foe && x.mode !== "flee").sort((a, b) => Math.hypot(a.pos.x - me.x, a.pos.z - me.z) - Math.hypot(b.pos.x - me.x, b.pos.z - me.z));
  if (qs.length < 2) return null;
  const [a, c] = qs;
  c.pos.set(a.pos.x + 1.4, a.pos.y, a.pos.z);
  g.peds.argue(a, c);
  g.player.place(a.pos.x - 3.5, a.pos.y, a.pos.z + 3.5, Math.atan2(3.5, -3.5));
  g.cam.behind(Math.atan2(3.5, -3.5), -0.1);
  g.cam.snap(g.player.pos.clone().setY(g.player.pos.y + 1.4));
  return [a.key, c.key];
});
check("two passers-by have words", pair);
await sleep(5500);
const pa = pair ? [await ped(pair[0]), await ped(pair[1])] : [];
check("then fight each other", pa.some((x) => x && (x.mode === "fight" || x.down)), JSON.stringify(pa));
await p.screenshot({ path: `${OUT}-3-brawl.png` });
await sleep(6000);
const pb = pair ? [await ped(pair[0]), await ped(pair[1])] : [];
console.log("after the brawl", JSON.stringify(pb));
// talking to someone: E (the street calmed down first)
await p.evaluate(() => { for (const q of street.gta.peds.all) if (q.knockT < 0) { q.foe = null; q.mode = "walk"; q.modeT = 20; q.watch = null; } });
key = await setUp("coward");
await p.evaluate(() => { street.gta.hp = 100; });
await sleep(500);
const prompt = await p.evaluate(() => document.querySelector(".gh-prompt")?.textContent ?? "");
check("E talk is offered", /Talk/.test(prompt), JSON.stringify(prompt));
await p.keyboard.press("KeyE");
await sleep(1200);
const talking = await p.evaluate(() => street.gta.host.talking());
check("the talk opens", talking);
const listening = await ped(key);
check("it stops and listens", listening && listening.mode === "listen", JSON.stringify(listening));
await p.screenshot({ path: `${OUT}-4-talk.png` });
await p.evaluate(() => street.gta.host.closeTalk());
await sleep(500);
// going down: Wasted, then back on your feet
await p.evaluate(() => { const g = street.gta; g.hp = 4; g.hurtMe(10, g.player.pos.x + 0.5, g.player.pos.z); });
await sleep(1200);
check("wasted", await p.evaluate(() => document.querySelector(".gta-hud").classList.contains("wasted")));
await p.screenshot({ path: `${OUT}-5-wasted.png` });
await sleep(4500);
check("back on your feet", await p.evaluate(() => street.gta.hp === 100 && !document.querySelector(".gta-hud").classList.contains("wasted")));
// a door stops you: walk at it for two seconds
const door = await p.evaluate(() => {
  const g = street.gta;
  const d = g.placeSpots.find((x) => !x.bare && x.wall) ?? g.placeSpots.find((x) => !x.bare);
  const h = Math.atan2(d.fx, d.fz);
  g.player.place(d.x + d.fx * 2.5, d.y, d.z + d.fz * 2.5, h);
  g.cam.behind(h, -0.1);
  g.cam.snap(g.player.pos.clone().setY(g.player.pos.y + 1.4));
  return { key: d.key, x: d.x, z: d.z, fx: d.fx, fz: d.fz, wall: d.wall };
});
await sleep(600);
await p.keyboard.down("KeyW");
await sleep(2500);
await p.keyboard.up("KeyW");
const along = await p.evaluate((d) => { const me = street.gta.player.pos; return (me.x - d.x) * d.fx + (me.z - d.z) * d.fz; }, door);
check("the door stops you", along > 0.25, `${door.key} (wall ${door.wall}): ${along.toFixed(2)} m out`);
const dp = await p.evaluate(() => document.querySelector(".gh-prompt")?.textContent ?? "");
check("E enter is offered there", /Enter/.test(dp), JSON.stringify(dp));
await p.screenshot({ path: `${OUT}-6-door.png` });
const perf = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return (n / ((performance.now() - t0) / 1000)).toFixed(1); });
console.log("fps", perf);
console.log(`checks ${ok.filter((x) => x[1]).length}/${ok.length}`);
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
