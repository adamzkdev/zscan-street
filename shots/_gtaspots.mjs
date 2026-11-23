// node shots/_gtaspots.mjs [URL] [OUT]: the game's challenges up close (src/gta): a proof board, the HQ's beam, a speed trap, night driving
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=4242&theme=night", OUT = "shots/gta/spots"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.active, { timeout: 240000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
await p.evaluate(() => street.gta.hud.coach(-1));
// a board, seen from the road 25 m before it
await p.evaluate(() => {
  const g = street.gta, bd = g.missions.boards[0];
  const c = g.parked[0];
  const back = 25;
  const x = bd.axis === "x" ? bd.x - back : bd.x + 1.9, z = bd.axis === "x" ? bd.z + 1.9 : bd.z + back;
  g.player.place(c.group.position.x - 2, 0.2, c.group.position.z + 2, 0);
  g.input.tap("KeyF");
  setTimeout(() => { g.car.place(x, z, bd.axis === "x" ? 0 : Math.PI / 2); g.cam.behind(g.car.yaw - Math.PI / 2); g.cam.snap(g.car.group.position.clone().setY(1)); }, 200);
});
await sleep(1500);
await p.screenshot({ path: `${OUT}-1-board.png` });
await p.keyboard.down("KeyW");
await sleep(2600);
await p.keyboard.up("KeyW");
await p.screenshot({ path: `${OUT}-2-smash.png` });
console.log(await p.evaluate(() => JSON.stringify({ boards: street.gta.missions.boards.filter((b) => b.done).length })));
// the HQ's beam from down the avenue
await p.evaluate(() => { const g = street.gta; const hq = street.city.shops[0].door; g.car.place(hq.x + 40, -1.4 + 1.9, Math.PI); g.cam.behind(g.car.yaw - Math.PI / 2); });
await sleep(1500);
await p.screenshot({ path: `${OUT}-3-hq.png` });
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
