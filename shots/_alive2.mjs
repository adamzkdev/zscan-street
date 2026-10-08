// On foot among people: names, greetings. node shots/_alive2.mjs [name]
import puppeteer from "puppeteer-core";
const name = process.argv[2] ?? "a";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/?debug&theme=night`);
await p.waitForFunction(() => window.street?.game, { timeout: 180000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(14000);
const ids = await p.evaluate(() => street.game.residents.debug().map((r) => r.id));
await p.evaluate((id) => street.game.meet(id), ids[1] ?? ids[0]);
await sleep(600);
// step back a little so names show over several heads
await p.keyboard.down("KeyS"); await sleep(700); await p.keyboard.up("KeyS");
await sleep(2500);
await p.screenshot({ path: `shots/alive2-${name}-1.png` });
await p.keyboard.down("KeyW"); await sleep(500); await p.keyboard.up("KeyW");
await sleep(1200);
await p.screenshot({ path: `shots/alive2-${name}-2.png` });
console.log("plates:", await p.evaluate(() => [...document.querySelectorAll(".npcplate")].filter((e) => e.style.display !== "none").map((e) => e.textContent).join(" | ")));
// the crowd: somewhere busy in the megalopolis
console.log(JSON.stringify(await p.evaluate(() => street.game.meetCrowd())));
await p.keyboard.down("KeyS"); await sleep(1200); await p.keyboard.up("KeyS");
await sleep(2500);
await p.screenshot({ path: `shots/alive2-${name}-3.png` });
console.log("plates:", await p.evaluate(() => [...document.querySelectorAll(".npcplate")].filter((e) => e.style.display !== "none").map((e) => e.textContent).join(" | ")));
await b.close();
