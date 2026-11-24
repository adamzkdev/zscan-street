// node shots/_gtainside.mjs [URL] [OUT]: inside a place in the third person (src/gta): walking, smashing things; then the street's knock-about things
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/in", PLACE = process.env.PLACE ?? "mempool"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => (m.type() === "error" || /gta:/.test(m.text())) && errs.push(m.text().slice(0, 300)));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate((k) => { const g = street.gta; g.hud.coach(-1); const all = [...g.doors.list.map((x) => x.spot), ...g.doors.bare]; const d = all.find((x) => x.key === k) ?? all[0]; g.player.place(d.x + d.fx * 2.4, 0.2, d.z + d.fz * 2.4, Math.atan2(d.fx, d.fz)); }, PLACE);
await sleep(800);
await p.keyboard.press("KeyE");
await p.waitForFunction(() => street.interiors.active && !street.interiors.warming, { timeout: 30000, polling: 200 });
await sleep(2500);
await p.screenshot({ path: `${OUT}-1-in.png` });
console.log("inside", await p.evaluate(() => JSON.stringify({ key: street.interiors.active?.key, pos: street.gta.player.pos.toArray().map((v) => +v.toFixed(1)), parent: street.gta.player.group.parent === street.interiors.active.scene })));
await p.keyboard.down("KeyW");
await sleep(1500);
await p.keyboard.up("KeyW");
await sleep(300);
await p.screenshot({ path: `${OUT}-2-walk.png` });
// smash whatever is nearest, turning round
let smashed = 0;
for (let k = 0; k < 10; k++) {
  const r = await p.evaluate(() => { const g = street.gta; const inn = g.host.interior(); const pl = g.player; const dir = { x: -Math.sin(pl.facing), z: -Math.cos(pl.facing) }; return null; });
  await p.keyboard.press("KeyX");
  await sleep(450);
  const n = await p.evaluate(() => street.gta.breakables.broken.length);
  if (n > smashed) { smashed = n; await p.screenshot({ path: `${OUT}-3-smash-${n}.png` }); if (n >= 2) break; }
  await p.keyboard.down("KeyD");
  await sleep(250);
  await p.keyboard.up("KeyD");
  await p.keyboard.down("KeyW");
  await sleep(350);
  await p.keyboard.up("KeyW");
}
console.log("smashed", smashed);
await p.keyboard.press("Escape");
await p.waitForFunction(() => !street.interiors.active, { timeout: 30000, polling: 200 });
await sleep(2000);
console.log("out", await p.evaluate(() => JSON.stringify({ pos: street.gta.player.pos.toArray().map((v) => +v.toFixed(1)), parent: street.gta.player.group.parent === street.scene || street.gta.player.group.parent?.type, props: street.gta.props.props.length })));
// the street's things: drive through a row
await p.evaluate(() => {
  const g = street.gta; const pr = g.props.props.find((q) => q.kind === "cone") ?? g.props.props[0];
  const c = g.parked[0]; g.player.place(c.group.position.x - 2, 0.2, c.group.position.z + 2, 0); g.input.tap("KeyF");
  setTimeout(() => { g.car.place(pr.p.x - 16, pr.p.z, 0); g.cam.behind(-Math.PI / 2, -0.12); g.cam.snap(g.car.group.position.clone().setY(1)); }, 300);
});
await sleep(900);
await p.keyboard.down("KeyW");
await sleep(1700);
await p.screenshot({ path: `${OUT}-4-props.png` });
await p.keyboard.up("KeyW");
console.log("awake", await p.evaluate(() => street.gta.props.props.filter((q) => q.awake || q.broken).length));
console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
await b.close();
