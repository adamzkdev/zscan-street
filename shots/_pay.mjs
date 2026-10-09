// node shots/_pay.mjs [world|ui] — the wallet layer in the ZEC Reserve, on a dev server whose
// VITE_API_URL points at a proxy serving /v1/street/{pay,marks,guestbook,tips} from a local API.
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
p.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && console.log("[error]", m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:3008/?debug&theme=night&interior=reserve`);
p.on("framenavigated", (f) => f === p.mainFrame() && console.log("[nav]", f.url()));
for (let k = 0; k < 120; k++) {
  const ok = await p.evaluate(() => !!window.street?.interiors?.active).catch(() => false);
  if (ok) break;
  await wait(1000);
}
console.log("in", await p.evaluate(() => [location.href, typeof window.street, document.readyState, document.title]), process.uptime());
await wait(4000);
const view = async (name, x, z, yaw, pitch = 0) => {
  await p.evaluate((v) => {
    const I = street.interiors;
    I.goTo(0);
    const y = I.active.floors[I.floor].y;
    const V = I.walk.camera.position.constructor;
    I.walk.place(new V(v.x, y, v.z), v.yaw, y);
    I.walk.pitch = v.pitch;
  }, { x, z, yaw, pitch });
  await wait(1800);
  await p.screenshot({ path: `shots/pay-${name}.png` });
  console.log(`shots/pay-${name}.png`);
};
const shot = async (name) => {
  await wait(1200);
  await p.screenshot({ path: `shots/pay-${name}.png` });
  console.log(`shots/pay-${name}.png`);
};
const mode = process.argv[2] ?? "all";
if (mode === "all" || mode === "world") {
  await view("gallery", -8.6, -25.2, Math.PI / 2 - 0.12, -0.08);
  await view("noir", -14.4, -20.4, Math.PI / 2, -0.2);
  await view("phone", -14.6, -24.6, Math.PI / 2, -0.12);
  await view("guestbook", -15, -7, Math.PI, 0.05);
  await view("runes", 0.5, -1.2, 0.05, -0.42);
  await view("rune-near", -2.2, -4.6, 0, -0.55);
}
if (mode === "all" || mode === "ui") {
  await p.evaluate(() => street.game.payDesk.gallery("zodl"));
  await shot("ui-gallery");
  await p.evaluate(() => street.game.payDesk.compose("guestbook"));
  await wait(400);
  await p.type("#pd-text", "Privacy is normal. gm ZStreet!");
  await p.click(".paydesk form button.primary");
  await wait(1500);
  await shot("ui-qr");
  await p.evaluate(() => street.game.payDesk.read({ id: 7, kind: "mark", place: "reserve", floor: 0, x: 3, y: 0, z: -4, text: "Beware: governor ahead", txid: "ff", height: 3511142, likes: 12, created_at: new Date().toISOString() }));
  await shot("ui-read");
  await p.evaluate(() => street.game.payDesk.close());
  await p.evaluate(() => street.game.pay({ type: "pay", action: "tip", name: "adamzk", amount: "0.2", sponsor: true, height: 3511200 }));
  await shot("ui-tip-inside");
}
await b.close();
