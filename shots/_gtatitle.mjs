// node shots/_gtatitle.mjs [URL] [OUT]: the game's front end (src/gta/frontend.ts): the title in the street, the
// main menu, the line-up, Play into the game, then pause › zkSNARK › back in the game. PHONE=1 for a phone, W/H env for a size.
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta", OUT = "shots/gta/title"] = process.argv.slice(2);
const PHONE = !!process.env.PHONE;
const W = Number(process.env.W) || (PHONE ? 390 : 1280),
  H = Number(process.env.H) || (PHONE ? 844 : 720);
const ONLY = process.env.ONLY ?? "";
const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  protocolTimeout: 600000,
  args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: W, height: H, deviceScaleFactor: PHONE ? 2 : 1, isMobile: PHONE, hasTouch: PHONE },
});
const p = await b.newPage();
// other sessions edit files meanwhile: Vite's HMR socket stubbed so the page never reloads mid-test
await p.evaluateOnNewDocument(() => {
  const W = window.WebSocket;
  const F = function (u, pr) {
    if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
    return pr === undefined ? new W(u) : new W(u, pr);
  };
  F.prototype = W.prototype;
  Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = F;
});
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", async (m) => {
  if (m.type() !== "error" || /429|Failed to load resource|net::/.test(m.text())) return;
  const st = m.text().startsWith("frame:") ? await m.args()[1]?.evaluate((e) => String(e?.stack ?? e)).catch(() => "") : "";
  errs.push("console " + m.text().slice(0, 200) + (st ? "\n" + st.split("\n").slice(0, 6).join("\n") : ""));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const shot = async (name) => {
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-${name}.png` });
  console.log("shot", n, name);
};
const state = () => p.evaluate(() => ({ open: street.gta.front.open, mode: street.gta.front.mode, active: street.gta.active, id: street.gta.front.id, sound: street.gta.host?.soundOn?.() }));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.front?.open, { timeout: 240000, polling: 300 });
if (process.env.STAGE) await p.evaluate((s) => street.gta.front.setStage(JSON.parse(s)), process.env.STAGE);
// the boot screen goes, the far city streams in, the faces arrive
await sleep(Number(process.env.WAIT) || 9000);
await shot("title");
if (ONLY === "title") {
  // STAGES='[[x,z,yaw,look],…]': the title shot from each, for picking a street
  for (const [x, z, yaw, look] of JSON.parse(process.env.STAGES ?? "[]")) {
    await p.evaluate((s) => street.gta.front.setStage(s), { x, z, yaw, look });
    await sleep(5000);
    await shot(`stage_${x}_${z}`);
  }
  console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
  await b.close();
  process.exit(0);
}
if (ONLY === "back") {
  // Esc on the title: back to the map, the street's own sky; the walker's button: the title again;
  // its menu's "Back to the map"
  const look = () => p.evaluate(() => ({ theme: document.documentElement.dataset.theme, frontOn: document.getElementById("ui").classList.contains("gta-front-on"), staged: !!street.gta.front.group.parent }));
  await p.keyboard.press("Escape");
  await sleep(2500);
  console.log("esc", await state(), await look());
  await shot("map");
  await p.evaluate(() => street.gta.start());
  await sleep(4000);
  console.log("again", await state(), await look());
  await p.keyboard.press("Enter");
  await sleep(1200);
  await p.evaluate(() => document.querySelector('.gf-item[data-k="map"]').click());
  await sleep(2500);
  console.log("map", await state(), await look());
  await shot("map2");
  console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
  await b.close();
  process.exit(0);
}
await sleep(2500);
await shot("title-later");
// any key: the main menu
if (PHONE) await p.touchscreen.tap(W / 2, H / 2);
else await p.keyboard.press("Space");
await sleep(2200);
console.log(await state());
await shot("menu");
if (!PHONE) {
  await p.keyboard.press("ArrowDown");
  await sleep(300);
  await shot("menu-down");
  // settings over the front end, and back
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Enter");
  await sleep(700);
  await shot("settings");
  await p.click(".gta-hud.front .gh-pcard nav [data-act=resume]");
  await sleep(500);
  await p.keyboard.press("ArrowUp");
}
// the line-up
await p.evaluate(() => document.querySelector('.gf-item[data-k="select"]').click());
await sleep(3500);
await shot("select");
for (let i = 0; i < 3; i++) {
  if (PHONE) await p.evaluate(() => document.querySelector('.gf-arrow[data-step="1"]').click());
  else await p.keyboard.press("ArrowRight");
  await sleep(1400);
}
await shot("select-3");
// a number typed: it joins the line
await p.evaluate(() => {
  const i = document.querySelector(".gf-num input");
  i.value = "1192";
  i.form.requestSubmit();
});
await sleep(2600);
await shot("select-typed");
console.log(await state());
// play: into the street by the car
await p.evaluate(() => document.querySelector(".gf-play").click());
await sleep(5000);
console.log(await state());
await shot("play");
if (!PHONE) {
  // pause › zkSNARK › the line-up, pick another, back in the game
  await p.evaluate(() => street.gta.hud.pause(true));
  await sleep(400);
  await p.evaluate(() => document.querySelector('.gh-tab[data-tab="snark"]').click());
  await sleep(300);
  await p.evaluate(() => document.querySelector(".gh-pane [data-do=garage]").click());
  await sleep(3000);
  console.log(await state());
  await shot("ingame-select");
  await p.keyboard.press("ArrowLeft");
  await sleep(1200);
  await p.keyboard.press("Enter");
  await sleep(1500);
  console.log(await state());
  await shot("ingame-back");
}
console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
await b.close();
