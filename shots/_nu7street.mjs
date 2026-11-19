// node shots/_nu7street.mjs [day|night] [port] [--film]: the NU7 TOWER from the street, end to end:
// its doors on foot (walked into, walked out of to the pavement), the pit gate's prompt (E races the
// NU7 GRAND PRIX, Escape comes back where you stood), the race from the pit garage's terminal, a click
// on the tower from the map. Pictures in shots/nu7tower/street-<theme>-*.jpg; checks printed; errors.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const theme = process.argv[2] ?? "day";
const port = process.argv[3] ?? "3050";
const film = process.argv.includes("--film");
mkdirSync("shots/nu7tower", { recursive: true });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|WebSocket connection|429/.test(m.text()) && errs.push(m.text().slice(0, 300)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (tag) => p.screenshot({ path: `shots/nu7tower/street-${theme}-${tag}.jpg`, type: "jpeg", quality: 80 });
const checks = [];
const check = (name, ok, extra = "") => (checks.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` · ${extra}` : ""}`), ok);
await p.goto(`http://localhost:${port}/?debug&theme=${theme}${film ? "" : "&nofilm"}`);
await p.waitForFunction(() => window.street?.interiors && window.__streetUp, { timeout: 240000, polling: 200 });
for (let i = 0; i < 40 && !(await p.evaluate(() => street.game.nu7Quarter.done)); i++) await wait(1000);
check("quarter open (NU7 live)", await p.evaluate(() => street.game.nu7Quarter.done));
await wait(2500);
const state = () =>
  p.evaluate(() => {
    const f = street.onFoot.camera.position;
    return { inside: street.interiors.active?.key ?? null, floor: street.interiors.floor, x: +f.x.toFixed(2), z: +f.z.toFixed(2), heading: +street.onFoot.heading.toFixed(2), walking: street.onFoot.enabled, party: !!document.querySelector(".pt-root:not(.pt-off)"), prompt: document.querySelector(".talk-prompt.on")?.textContent ?? null, door: document.querySelector(".door-prompt.on")?.textContent ?? null };
  });
const hold = async (key, ms) => {
  await p.keyboard.down(key);
  await wait(ms);
  await p.keyboard.up(key);
};

// ---- 1. the doors from the plaza ----
await p.evaluate(() => street.game.stand(205.5, -62, 0));
await wait(2500);
await shot("door");
await p.evaluate(() => street.game.stand(205.5, -71.5, 0));
await wait(900);
await shot("door-near");
check("door prompt names the tower", ((await state()).door ?? "").includes("NU7 TOWER"), (await state()).door ?? "");
// walk in
await hold("w", 1600);
await wait(film ? 900 : 2500);
if (film) await shot("film");
await wait(film ? 5000 : 0);
let s = await state();
check("walked in through the doors", s.inside === "nu7tower" && s.floor === 0, JSON.stringify(s));
await shot("entered");
// walk out: back to the door inside, facing it
await p.evaluate(() => {
  const I = street.interiors,
    W = I.walk,
    V = W.camera.position.constructor;
  W.place(new V(0, 0, -1.6), Math.PI, 0);
});
await wait(600);
await hold("w", 1400);
await wait(2500);
s = await state();
check("walked out to the pavement in front", !s.inside && s.walking && Math.abs(s.x - 205.5) < 4 && s.z > -75 && s.z < -66, JSON.stringify(s));
await shot("out");

// ---- 2. the pit gate: the prompt, E races, Escape comes back ----
await p.evaluate(() => street.game.stand(189.6, -84, Math.PI / 2));
await wait(1500);
s = await state();
check("pit gate prompt", (s.prompt ?? "").includes("RACE") && (s.prompt ?? "").includes("NU7 GRAND PRIX"), s.prompt ?? "none");
await shot("prompt");
const before = s;
await p.keyboard.press("e");
for (let i = 0; i < 20 && !(await state()).party; i++) await wait(500);
await wait(3000);
s = await state();
check("E opens the race (ZK PARTY, SNARK KART on the NU7 GRAND PRIX)", s.party, JSON.stringify({ party: s.party }));
await shot("race");
for (let i = 0; i < 5 && (await state()).party; i++) {
  await p.keyboard.press("Escape");
  await wait(900);
}
await wait(1200);
s = await state();
check("back where you stood after the race", !s.party && s.walking && Math.hypot(s.x - before.x, s.z - before.z) < 0.3 && Math.abs(s.heading - before.heading) < 0.05, JSON.stringify(s));
await shot("back");

// ---- 3. the race from the pit garage's terminal ----
await p.evaluate(() => street.interiors.enter("nu7tower", 1));
await wait(3500);
await p.evaluate(() => {
  const I = street.interiors,
    W = I.walk,
    y = I.active.floors[1].y,
    V = W.camera.position.constructor;
  W.place(new V(5.2, y, -13), Math.PI / 2, y);
  W.aim(Math.PI / 2, -0.1);
});
await wait(1500);
await shot("terminal");
const info = await p.evaluate(() => {
  const I = street.interiors;
  return I.pickAt(window.innerWidth / 2, window.innerHeight * 0.55);
});
check("the terminal's pick races", !!info?.race, JSON.stringify(info && { title: info.title, race: info.race }));
await p.mouse.click(700, Math.round(860 * 0.55));
for (let i = 0; i < 20 && !(await state()).party; i++) await wait(500);
await wait(2500);
s = await state();
check("a click on the terminal opens the race", s.party);
await shot("terminal-race");
for (let i = 0; i < 5 && (await state()).party; i++) {
  await p.keyboard.press("Escape");
  await wait(900);
}
await wait(1000);
s = await state();
check("back in the pit garage after the race", !s.party && s.inside === "nu7tower" && s.floor === 1, JSON.stringify(s));
await p.evaluate(() => street.interiors.exit());
await wait(1500);

// ---- 4. from the map: a click on the tower walks in ----
await p.evaluate(() => {
  street.walk(false);
});
await wait(800);
await p.evaluate(() => street.game.nu7Quarter.go(0.45));
await wait(5000);
await shot("map");
const at = await p.evaluate(() => {
  const cam = street.rig.camera;
  const V = cam.position.constructor;
  const v = new V(205.5, 40, -84).project(cam);
  return { x: Math.round(((v.x + 1) / 2) * window.innerWidth), y: Math.round(((1 - v.y) / 2) * window.innerHeight) };
});
await p.mouse.move(at.x, at.y);
await wait(700);
await shot("map-hover");
await p.mouse.click(at.x, at.y);
await wait(3500);
s = await state();
check("a click on the tower on the map walks in", s.inside === "nu7tower", JSON.stringify({ ...at, inside: s.inside }));
await p.evaluate(() => street.interiors.exit());
await wait(1500);
// the circuit's hover from the map (a spot of it no building hides)
let tip = null;
for (const [x, z] of [[150, -100], [176, -98], [168, -92], [140, -62], [160, -85], [180, -60]]) {
  const kat = await p.evaluate(([x, z]) => {
    const cam = street.rig.camera;
    const V = cam.position.constructor;
    const v = new V(x, 0.3, z).project(cam);
    return { x: Math.round(((v.x + 1) / 2) * window.innerWidth), y: Math.round(((1 - v.y) / 2) * window.innerHeight) };
  }, [x, z]);
  await p.mouse.move(kat.x, kat.y);
  await wait(500);
  tip = await p.evaluate(() => document.querySelector(".tip.on")?.textContent ?? null);
  if ((tip ?? "").includes("NU7 GRAND PRIX")) break;
}
check("hovering the circuit offers the race", (tip ?? "").includes("NU7 GRAND PRIX"), tip ?? "none");
await shot("map-circuit");

console.log(checks.join("\n"));
console.log("errors:", errs.length, errs.slice(0, 12).join("\n"));
await b.close();
