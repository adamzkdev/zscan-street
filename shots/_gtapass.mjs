// node shots/_gtapass.mjs [URL] [OUT]: the game's second pass (src/gta): doors and E, people knocked over, the solid shape
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/pass"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => (m.type() === "error" || /gta:/.test(m.text())) && errs.push(m.text().slice(0, 300)));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.active, { timeout: 240000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
await p.waitForFunction(() => street.gta.solid.ready, { timeout: 60000, polling: 250 });
console.log("solid ready in", Date.now() - t0, "ms");
await p.evaluate(() => street.gta.hud.coach(-1));
// the solid shape as a picture (blocked for a car red, walls white, holes blue)
const png = await p.evaluate(() => {
  const s = street.gta.solid;
  const N = 1024, c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d"), img = g.createImageData(N, N);
  const x0 = -240, z0 = -240, span = 480;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + (i / N) * span, z = z0 + (j / N) * span;
    const t = s.topAt(x, z), d = s.dist(x, z);
    const k = (j * N + i) * 4;
    let r = 30, gg = 32, bb = 40;
    if (t !== t || t < -0.35) (r = 20), (gg = 60), (bb = 140);
    else if (t > 2.2) (r = 235), (gg = 235), (bb = 240);
    else if (d < 0) (r = 200), (gg = 60), (bb = 50);
    else if (t > 0.1) (r = 70), (gg = 72), (bb = 84);
    img.data.set([r, gg, bb, 255], k);
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
});
fs.writeFileSync(`${OUT}-solid.png`, Buffer.from(png.split(",")[1], "base64"));
// a door: the MEMPOOL HQ's
const door = await p.evaluate(() => { const d = street.gta.doors.list ?? null; const s = street.gta.host.doors()[0]; const g = street.gta; g.player.place(s.x + s.fx * 2.6, 0.2, s.z + s.fz * 2.6, Math.atan2(s.fx, s.fz)); g.cam.behind(Math.atan2(s.fx, s.fz), -0.12); return s; });
await sleep(1500);
await p.screenshot({ path: `${OUT}-1-door.png` });
console.log("door", door.key, door.label, await p.evaluate(() => street.gta.doors.at?.key ?? null));
await p.keyboard.press("KeyE");
await sleep(3500);
console.log("inside:", await p.evaluate(() => street.interiors.active?.key ?? null));
await p.screenshot({ path: `${OUT}-2-inside.png` });
await p.keyboard.press("Escape");
await sleep(3500);
console.log("out:", await p.evaluate(() => JSON.stringify({ inside: street.interiors.active?.key ?? null, active: street.gta.active, pos: street.gta.player.pos.toArray().map((v) => +v.toFixed(1)) })));
await p.screenshot({ path: `${OUT}-3-out.png` });
// a car through the crowd
await p.evaluate(() => {
  const g = street.gta; const c = g.parked[0]; const q = c.group.position;
  g.player.place(q.x - 2, 0.2, q.z + 2, 0); g.input.tap("KeyF");
});
await sleep(600);
// find someone on a pavement and aim at them
const aim = await p.evaluate(() => {
  const g = street.gta;
  const ss = [...street.director.snarks].filter((s) => s.root.visible && s.root.parent && s.state === "resident");
  const s = ss[Math.floor(ss.length / 2)];
  if (!s) return null;
  const t = s.root.position;
  g.car.place(t.x - 14, t.z, 0);
  g.cam.behind(-Math.PI / 2);
  return [t.x, t.z];
});
console.log("aim", aim);
await p.keyboard.down("KeyW");
await sleep(1700);
await p.keyboard.up("KeyW");
await p.screenshot({ path: `${OUT}-4-hit.png` });
await sleep(700);
await p.screenshot({ path: `${OUT}-5-down.png` });
console.log("knocked:", await p.evaluate(() => [...street.director.snarks].filter((s) => s.knocked).length));
// into a wall at speed: where does it stop?
const wall = await p.evaluate(() => { const g = street.gta; g.car.place(0, -1.4 + 1.9, Math.PI / 2); g.cam.behind(0); return null; });
await p.keyboard.down("KeyW");
await sleep(3500);
await p.keyboard.up("KeyW");
await p.screenshot({ path: `${OUT}-6-wall.png` });
console.log("car after wall:", await p.evaluate(() => { const c = street.gta.car; return [c.group.position.x.toFixed(1), c.group.position.z.toFixed(1), (c.speed * 3.6).toFixed(0)]; }));
console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
await b.close();
