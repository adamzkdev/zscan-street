// node shots/_gtaui.mjs [URL] [OUT]: the game's interface (src/gta/hud.ts) in every state: on foot, at a door, at the wheel, the map, the menu, a toast
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo", OUT = "shots/gta/ui", W = "1600", H = "900"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: +W, height: +H, deviceScaleFactor: 1 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => street.gta.hud.coach(-1));
// on foot near a door
await p.evaluate(() => { const g = street.gta; const d = g.placeSpots.find((x) => x.key === "mempool") ?? g.placeSpots[0]; g.player.place(d.x + d.fx * 2.4, 0.2, d.z + d.fz * 2.4, Math.atan2(-d.fx, -d.fz)); g.cam.behind(Math.atan2(-d.fx, -d.fz), -0.15); });
await sleep(1500);
await p.evaluate(() => street.gta.hud.toast("Block #3,603,900", "mined · 14 transactions", "gold"));
await sleep(500);
await p.screenshot({ path: `${OUT}-1-foot.png` });
// at the wheel
await p.evaluate(() => { const g = street.gta; const c = g.parked[0]; g.player.place(c.group.position.x - 1.5, 0.2, c.group.position.z + 1.6, 0); g.input.tap("KeyF"); });
await sleep(600);
await p.keyboard.down("KeyW");
await sleep(2200);
await p.screenshot({ path: `${OUT}-2-car.png` });
await p.keyboard.up("KeyW");
// the map
await p.keyboard.press("KeyM");
await sleep(900);
await p.screenshot({ path: `${OUT}-3-map.png` });
await p.keyboard.press("KeyM");
await sleep(400);
// the menu
await p.keyboard.press("Escape");
await sleep(700);
await p.screenshot({ path: `${OUT}-4-menu.png` });
await p.keyboard.press("Escape");
await sleep(400);
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
