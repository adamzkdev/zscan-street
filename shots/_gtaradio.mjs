// node shots/_gtaradio.mjs [URL]: into the GT, the car radio's banner, Q through the stations (src/gta/radio.ts); sound on, the stations' graph running without errors
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/radio"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  const W = window.WebSocket;
  const F = function (u, pr) {
    if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
    return pr === undefined ? new W(u) : new W(u, pr);
  };
  F.prototype = W.prototype;
  Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = F;
  try { localStorage.removeItem("street.sound"); } catch {}
});
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && errs.push("console " + m.text()));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => street.gta.hud.coach(-1));
// a real key press: the city's sound wakes on it
await p.keyboard.press("KeyK");
await sleep(1500);
console.log("sound on:", await p.evaluate(() => street.gta.host.soundOn()));
await p.evaluate(() => {
  const g = street.gta;
  const gt = g.parked.find((c) => c.kind === "gt");
  const q = gt.group.position;
  g.player.place(q.x + 2.5, 0.2, q.z, 0);
  g.getIn();
});
await sleep(900);
for (let k = 0; k < 5; k++) {
  const t = await p.evaluate(() => ({ on: document.querySelector(".gta-radio")?.classList.contains("on"), text: document.querySelector(".gta-radio")?.innerText.replace(/\n/g, " | "), idx: street.gta.radio.index }));
  console.log("radio", JSON.stringify(t));
  await p.screenshot({ path: `${OUT}-${k}.png` });
  await sleep(2500);
  await p.keyboard.press("KeyQ");
  await sleep(400);
}
console.log("errors", errs.length, errs.slice(0, 8).join("\n"));
await b.close();
