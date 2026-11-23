// node shots/_gtamulti.mjs [URL] [OUT]: two players in the game's shared city (src/gta/net.ts, worker/world.ts)
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&theme=day", OUT = "shots/gta/multi"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const errs = [];
const open = async (id) => {
  const p = await b.newPage();
  p.on("pageerror", (e) => errs.push(`${id} pageerror ${e.message}`));
  await p.goto(`${URL}&gta=${id}`);
  await p.waitForFunction(() => window.__streetUp && window.street?.gta?.active, { timeout: 240000, polling: 300 });
  await p.evaluate(() => street.gta.hud.coach(-1));
  return p;
};
const A = await open(1192);
const B = await open(4242);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A stands on the avenue looking east; B a few metres ahead on foot, then in its car
await A.evaluate(() => { const g = street.gta; g.player.place(20, 0, 0.5, -Math.PI / 2); g.cam.behind(-Math.PI / 2, -0.1); });
await B.evaluate(() => { const g = street.gta; g.player.place(27, 0, 1.5, Math.PI / 2); });
await sleep(2500);
console.log("A sees", await A.evaluate(() => JSON.stringify({ count: street.gta.net.count, others: [...street.gta.net.others()].map((o) => [o.x.toFixed(1), o.z.toFixed(1), o.car]) })));
await A.bringToFront();
await A.screenshot({ path: `${OUT}-1-foot.png` });
// B gets in its GT and drives past
await B.bringToFront();
await B.evaluate(() => { const g = street.gta; const c = g.parked[0]; c.place(30, -2.5, Math.PI); const q = c.group.position; g.player.place(q.x, 0.2, q.z + 1.6, 0); g.input.tap("KeyF"); });
await sleep(700);
await B.keyboard.down("KeyW");
await sleep(1200);
await B.keyboard.up("KeyW");
await A.bringToFront();
await sleep(600);
console.log("A sees", await A.evaluate(() => JSON.stringify([...street.gta.net.others()].map((o) => [o.x.toFixed(1), o.z.toFixed(1), o.car]))));
await A.screenshot({ path: `${OUT}-2-car.png` });
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
