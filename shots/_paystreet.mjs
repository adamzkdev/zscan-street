// node shots/_paystreet.mjs — runes on the street, N to leave one, a tip's fireworks (dev server on 3008)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:3008/?debug&theme=night`);
for (let k = 0; k < 120 && !(await p.evaluate(() => !!window.street?.onFoot).catch(() => false)); k++) await wait(1000);
await wait(9000);
await p.evaluate(() => {
  street.walk(true);
  const V = street.onFoot.camera.position.constructor;
  street.onFoot.place(new V(0.5, 0.2, 15), 0);
  street.onFoot.pitch = -0.5;
});
await wait(2500);
await p.screenshot({ path: "shots/pay-street-runes.png" });
console.log("shots/pay-street-runes.png");
await p.evaluate(() => {
  const V = street.onFoot.camera.position.constructor;
  street.onFoot.place(new V(4, 0.15, 10.8), 0);
});
await wait(1500);
await p.screenshot({ path: "shots/pay-street-near.png" });
console.log("shots/pay-street-near.png");
await p.keyboard.press("KeyN");
await wait(1200);
await p.screenshot({ path: "shots/pay-street-compose.png" });
console.log("shots/pay-street-compose.png");
await p.keyboard.press("Escape");
await p.evaluate(() => street.game.pay({ type: "pay", action: "tip", name: "adamzk", amount: "0.2", sponsor: true, height: 3511200 }));
await p.evaluate(() => { street.onFoot.pitch = 0.35; });
await wait(2500);
await p.screenshot({ path: "shots/pay-street-tip.png" });
console.log("shots/pay-street-tip.png");
await b.close();
