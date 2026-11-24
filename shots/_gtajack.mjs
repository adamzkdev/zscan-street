// node shots/_gtajack.mjs [OUT]: take the street's vehicles the games' way (src/gta getIn/jackStep): stop one by standing in its way, F at its door,
// its driver pulled out (a ped on the road that reacts), you drive off — a city car, a biker, a bridge-loop car, an avenue one, your own parked one (nobody in it)
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/jack/j"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/429|Failed to load resource|worker/.test(m.text()) && errs.push(m.text().slice(0, 160)));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.heat.raise = () => {}; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let n = 0;
async function attempt(name, pickJs) {
  // find one: [world x, z, yaw, kind, driver]
  const found = await p.evaluate(pickJs);
  if (!found) return results.push({ name, ok: false, why: "none found" });
  // stand in its way ahead of it (it stops), then at its door
  await p.evaluate((f) => {
    const g = street.gta;
    if (g.car) g.getOut(true);
    const fx = Math.cos(f.yaw), fz = -Math.sin(f.yaw);
    g.player.place(f.x + fx * 9, 0, f.z + fz * 9, Math.atan2(fx, fz));
  }, found);
  // (it stops for you: wait until it is slow enough to catch, a few seconds at most)
  for (let k = 0; k < 10; k++) {
    await sleep(500);
    const v = await p.evaluate((f) => [...street.gta.rides()].find((r) => r.obj.uuid === f.uuid)?.v ?? 0, found);
    if (k >= 4 && v < 9) break;
  }
  const ready = await p.evaluate((f) => {
    const g = street.gta;
    // where it is now, the door side (−z of its frame)
    const r = [...g.rides()].find((r) => r.obj.uuid === f.uuid);
    if (!r) return null;
    const w = r.obj.getWorldPosition(new r.obj.position.constructor());
    const yaw = r.obj.rotation.y;
    const sx = Math.sin(yaw), sz = Math.cos(yaw);
    const half = (window.__specs?.[r.kind]?.wid ?? 1.8) / 2;
    g.player.place(w.x - sx * (half + 1.0), 0, w.z - sz * (half + 1.0), Math.atan2(-sx, -sz) + Math.PI);
    return { v: +r.v.toFixed(2), driver: r.driver, kind: r.kind };
  }, found);
  if (!ready) return results.push({ name, ok: false, why: "gone before reached" });
  await sleep(150);
  await p.keyboard.press("KeyF");
  await sleep(380);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-${name}-pull.png` });
  await sleep(1500);
  const after = await p.evaluate((d) => {
    const g = street.gta;
    const out = g.peds.peds.find((q) => q.id === d);
    return { inCar: !!g.car, kind: g.car?.kind ?? null, jacking: !!g.jack, ejected: !!out, ejectedMode: out?.mode ?? null, down: out ? out.knockT >= 0 : null };
  }, ready.driver);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-${name}-in.png` });
  // drive off a little
  await p.keyboard.down("KeyW");
  await sleep(1400);
  await p.keyboard.up("KeyW");
  const moved = await p.evaluate(() => +(street.gta.car?.speed ?? 0).toFixed(1));
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-${name}-drive.png` });
  results.push({ name, ...ready, ...after, speedAfterGas: moved, ok: after.inCar && (ready.driver ? after.ejected : true) });
}
const pick = (filter) => `(() => {
  const g = street.gta;
  const me = g.player.pos;
  const list = [...g.rides()].filter((r) => (${filter})(r));
  list.sort((a, b) => a.obj.position.distanceTo(me) - b.obj.position.distanceTo(me));
  const r = list[0];
  if (!r) return null;
  const w = r.obj.getWorldPosition(r.obj.position.clone());
  return { uuid: r.obj.uuid, x: w.x, z: w.z, yaw: r.obj.rotation.y, kind: r.kind };
})()`;
await p.evaluate(() => (window.__specs = Object.fromEntries(Object.entries(street.gta.constructor.SPECS ?? {}).map(([k, v]) => [k, v]))));
await attempt("car", pick(`(r) => r.driver && ["sedan","suv","sports","pickup","van","convertible"].includes(r.kind) && r.obj.parent?.name !== "goldengate:traffic"`));
await attempt("taxi", pick(`(r) => r.kind === "taxi"`));
await attempt("biker", pick(`(r) => r.kind === "moto"`));
await attempt("bridge", pick(`(r) => r.obj.parent?.name === "goldengate:traffic"`));
await attempt("courier", pick(`(r) => r.kind === "scooter"`));
// your own parked car: nobody in it
{
  const ok = await p.evaluate(() => {
    const g = street.gta;
    if (g.car) g.getOut(true);
    const c = g.parked.find((c) => c.kind === "gt");
    if (!c) return null;
    const q = c.group.position;
    g.player.place(q.x + 2.6 * Math.sin(c.yaw) * -1, 0.2, q.z - 2.6 * Math.cos(c.yaw), 0);
    return true;
  });
  // (a car of the traffic going by may be nearer for a moment: wait for the GT to be the one in reach)
  let reach = null;
  for (let k = 0; k < 12; k++) {
    await sleep(400);
    reach = await p.evaluate(() => { const r = street.gta.reachable(); return r ? { name: r.name, car: !!r.car, d: +r.d.toFixed(2) } : null; });
    if (reach?.car) break;
  }
  await p.keyboard.press("KeyF");
  await sleep(700);
  results.push({ name: "parked-gt", reach, placed: ok, ok: await p.evaluate(() => street.gta.car?.kind === "gt") && !!ok });
}
for (const r of results) console.log(JSON.stringify(r));
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
