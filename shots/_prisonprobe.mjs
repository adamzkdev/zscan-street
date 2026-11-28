// node shots/_prisonprobe.mjs: the rock's ground round the prison's door (the ferry's landing, the door): floors and blocks
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 960, height: 540 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&solo");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.gta.doorsReady, { timeout: 900000, polling: 300 });
const r = await p.evaluate(() => {
  const g = street.gta, h = g.host, s = g.solid;
  const d = g.placeSpots.find((d) => d.key === "prison");
  const f = g.ferries.filter((f) => f.key.startsWith("ferry:prison"));
  const rows = [];
  for (let z = 176; z <= 186; z += 1) {
    const row = [];
    for (let x = -114; x <= -104; x += 1) {
      const gg = h.ground(x, z), sp = h.footSpecial(x, z);
      const was = h.walker.floorY; h.walker.floorY = gg ?? 0.2; const bl = h.footBlocked(x, z); h.walker.floorY = was;
      row.push((gg === null ? "  -" : gg.toFixed(1).padStart(3)) + (sp ? "s" : " ") + (bl ? "X" : "."));
    }
    rows.push(z + " " + row.join(" "));
  }
  return { door: { x: d.x, z: d.z, y: d.y, fx: d.fx, fz: d.fz }, ferries: f.map((x) => [x.key, +x.x.toFixed(1), +x.z.toFixed(1), x.y]), rows };
});
console.log(JSON.stringify(r.door), JSON.stringify(r.ferries));
// in the game: off the ferry's landing, walk to the door (south, then east)
const w = await p.evaluate(async () => {
  const g = street.gta;
  g.hud.coach(-1);
  const out = {};
  for (const [name, x, z, h] of [["landing→south", -110.6, 177.9, Math.PI], ["yard→east", -113, 183.9, -Math.PI / 2]]) {
    g.player.place(x, street.gta.host.ground(x, z) ?? 1.3, z, h);
    await new Promise((r) => setTimeout(r, 700));
    const a = g.player.pos.clone();
    g.input.stick.y = 1;
    await new Promise((r) => setTimeout(r, 2000));
    g.input.stick.y = 0;
    const b = g.player.pos;
    out[name] = { from: [+a.x.toFixed(1), +a.y.toFixed(2), +a.z.toFixed(1)], to: [+b.x.toFixed(1), +b.y.toFixed(2), +b.z.toFixed(1)], walkerFloor: g.host.walker.floor };
  }
  return out;
});
console.log(JSON.stringify(w));
const map = await p.evaluate(() => {
  const pr = street.prison;
  if (!pr) return ["no street.prison"];
  const rows = [];
  for (let z = 170; z <= 200; z += 1.5) {
    let row = "";
    for (let x = -150; x <= -90; x += 1.5) row += pr.free(x, z, 0.28) ? "." : "#";
    rows.push(String(z).padStart(5) + " " + row);
  }
  return rows;
});
console.log("prison.free, x -150 → -90 (1.5 m), the door at x -110.6 z 183.9:");
for (const l of map) console.log(l);
console.log("x from -114 to -104 →");
for (const l of r.rows) console.log(l);
await b.close();
