// node shots/_gtagamehouse.mjs [port] [OUT]: the Game House in the game's third person (src/gta): walk in,
// up the west stairs to the gallery, along it, back down; the duel tables block; screenshots on the way.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const [PORT = "3072", OUT = "shots/gta/gamehouse"] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  window.WebSocket = class {
    constructor() {}
    addEventListener() {}
    send() {}
    close() {}
  };
});
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = [];
const check = (name, v, note = "") => {
  ok.push([name, !!v]);
  console.log(`${v ? "ok  " : "FAIL"} ${name} ${note}`);
};
await p.goto(`http://localhost:${PORT}/?debug&gta=1192&theme=night`);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
await sleep(2000);
await p.evaluate(() => street.gta.hud.coach(-1));
await p.evaluate(() => street.interiors.enter("gamehouse", 0));
await p.waitForFunction(() => street.interiors.active?.key === "gamehouse", { timeout: 90000 });
await sleep(5000);
const where = () => p.evaluate(() => ({ x: +street.gta.player.pos.x.toFixed(2), y: +street.gta.player.pos.y.toFixed(2), z: +street.gta.player.pos.z.toFixed(2), floor: street.interiors.floor }));
const put = (x, z, yaw, floor = 0) =>
  p.evaluate(
    (x, z, yaw, floor) => {
      const I = street.interiors;
      if (I.floor !== floor) I.goTo(floor);
      const F = I.active.floors[floor];
      I.walk.place(new I.walk.camera.position.constructor(x, F.y, z), yaw, F.y);
      street.gta.player.facing = yaw;
      street.gta.cam.behind(yaw, -0.12);
    },
    x,
    z,
    yaw,
    floor,
  );
const hold = async (key, ms) => {
  await p.keyboard.down(key);
  await sleep(ms);
  await p.keyboard.up(key);
};
// in through the doors: walk ahead down the runner
let a = await where();
await p.screenshot({ path: `${OUT}/1-in.jpg`, type: "jpeg", quality: 80 });
await hold("KeyW", 2500);
let c = await where();
check("walks in", c.z < a.z - 3, JSON.stringify([a, c]));
await p.screenshot({ path: `${OUT}/2-atrium.jpg`, type: "jpeg", quality: 80 });
// to the west stair's foot, facing up it (−z), and climb
await put(-12.5, -10.6, 0);
await sleep(600);
await hold("KeyW", 6500);
c = await where();
check("up the west stairs to the gallery", c.floor === 1 && Math.abs(c.y - 5.4) < 0.3, JSON.stringify(c));
await p.screenshot({ path: `${OUT}/3-landing.jpg`, type: "jpeg", quality: 80 });
// along the gallery, turned west then south toward the mini-games wall
await put(-16.5, -25.5, Math.PI / 2, 1);
await sleep(500);
await hold("KeyW", 1500);
c = await where();
check("onto the gallery", c.floor === 1 && c.x < -17, JSON.stringify(c));
await p.screenshot({ path: `${OUT}/4-deck.jpg`, type: "jpeg", quality: 80 });
// the void stops you: walk east off the gallery's edge
await put(-16.0, -36, -Math.PI / 2, 1);
await sleep(400);
await hold("KeyW", 2500);
c = await where();
check("the railing holds", c.floor === 1 && c.x < -14 && Math.abs(c.y - 5.4) < 0.2, JSON.stringify(c));
await p.screenshot({ path: `${OUT}/5-rail.jpg`, type: "jpeg", quality: 80 });
// back down: from the landing, facing +z down the flight
await put(-12.5, -25.4, Math.PI, 1);
await sleep(400);
await hold("KeyW", 6500);
c = await where();
check("down again", c.floor === 0 && c.y < 0.3, JSON.stringify(c));
// a duel table blocks: walk at one
await put(0, -26.4, 0, 0);
await sleep(400);
await hold("KeyW", 2500);
c = await where();
check("the duel table blocks", c.z > -28.2, JSON.stringify(c));
await p.screenshot({ path: `${OUT}/6-duel.jpg`, type: "jpeg", quality: 80 });
// E on the table offers ZK LEGENDS
const prompt = await p.evaluate(() => document.querySelector(".gh-prompt")?.textContent ?? "");
check("E offers the duel table", /LEGENDS/i.test(prompt), JSON.stringify(prompt));
const perf = await p.evaluate(async () => {
  let n = 0;
  const t0 = performance.now();
  await new Promise((r) => {
    const f = () => {
      n++;
      if (performance.now() - t0 < 3000) requestAnimationFrame(f);
      else r();
    };
    requestAnimationFrame(f);
  });
  return (n / ((performance.now() - t0) / 1000)).toFixed(1);
});
console.log("fps", perf);
console.log(`checks ${ok.filter((x) => x[1]).length}/${ok.length}`);
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
