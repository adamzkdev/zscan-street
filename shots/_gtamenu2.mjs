// node shots/_gtamenu2.mjs [URL] [OUT]: the hub after ZK CARDS (src/gta/frontend.ts + store.ts + wallet.ts):
// straight onto the main menu (wordmark, menu, purse + Connect wallet, the two cards; no title: the sound starts
// on the first key, click or tap), the store (tabs, a
// preview on the car, a purchase), the garage, missions, how to play, the wallet sheet, then Play: in the
// street with the paint bought. PHONE=1 for a phone, W/H env for a size, ONLY=menu for the title + menu only.
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta", OUT = "shots/gta/menu2"] = process.argv.slice(2);
const PHONE = !!process.env.PHONE;
const W = Number(process.env.W) || (PHONE ? 390 : 1600),
  H = Number(process.env.H) || (PHONE ? 844 : 900);
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
  // a fresh store each run (what you own and wear), ⓩ as the profile has them
  localStorage.removeItem("zstreet.gta.store");
  localStorage.removeItem("zstreet.economy");
  localStorage.removeItem("street.noir");
});
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => {
  if (m.type() !== "error" || /429|Failed to load resource|net::/.test(m.text())) return;
  errs.push("console " + m.text().slice(0, 200));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const shot = async (name) => {
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-${name}.png` });
  console.log("shot", n, name);
};
const state = () => p.evaluate(() => ({ open: street.gta.front.open, mode: street.gta.front.mode, active: street.gta.active, id: street.gta.front.id, sound: street.gta.host?.soundOn?.() }));
// the GT's body paint as built (the colour of the material named for the paint, else the first coloured standard material)
const gtPaint = (where) =>
  p.evaluate((where) => {
    const g = where === "front" ? street.gta.front.car?.group : street.gta.parked?.find((c) => c.kind === "gt")?.group;
    if (!g) return null;
    const seen = new Map();
    g.traverse((o) => {
      const ms = o.isMesh ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) if (m?.color && !m.vertexColors) seen.set(m.color.getHexString(), (seen.get(m.color.getHexString()) ?? 0) + 1);
    });
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, where);
const press = async (k, wait = 350) => {
  await p.keyboard.press(k);
  await sleep(wait);
};
const click = async (sel, wait = 500) => {
  await p.evaluate((s) => document.querySelector(s).click(), sel);
  await sleep(wait);
};

await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.front?.open, { timeout: 240000, polling: 300 });
// some ⓩ to spend (as the missions would pay them)
await p.evaluate(() => import("/src/game/profile.ts").then(({ profile }) => profile.p.z < 900 && profile.pay(900 - profile.p.z, "test")));
await sleep(Number(process.env.WAIT) || 9000);
console.log("opened on", await state());
await shot("menu");
// the first gesture (a tap on the street right of the menu; a key): the city's sound on
if (PHONE) await p.touchscreen.tap(W - 24, H * 0.42);
else await press("ArrowDown", 300), await press("ArrowUp", 300);
await sleep(600);
console.log("after a first gesture", await state());
const menuText = await p.evaluate(() => ({
  mark: document.querySelector(".gf-menu .gf-mark")?.textContent,
  items: [...document.querySelectorAll(".gf-item")].map((e) => e.textContent),
  purse: document.querySelector(".gf-purse")?.textContent,
  connect: document.querySelector(".gf-connect")?.textContent,
  me: document.querySelector(".gf-me")?.textContent,
  live: document.querySelector(".gf-live")?.textContent,
}));
console.log("menu", JSON.stringify(menuText));
if (ONLY === "menu") {
  if (!PHONE) {
    await press("ArrowDown");
    await shot("menu-store");
    // Esc on the menu: the map
    await press("Escape", 2000);
    console.log("esc", await state());
  }
  console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
  await b.close();
  process.exit(0);
}
// the wallet sheet (no Noir in this browser: the install link)
await click(".gf-connect", 600);
await shot("wallet");
await click(".gfw [data-noir]", 2200);
await shot("wallet-noir-missing");
console.log("wallet note", await p.evaluate(() => document.querySelector(".gfw [data-msg]")?.textContent));
await press("Escape", 500);
console.log("sheet closed", await p.evaluate(() => !document.querySelector(".gfw")), await state());

// the store (VEHICLES first)
await click('.gf-item[data-k="store"]', 2600);
console.log(await state(), "paint on the stage car", JSON.stringify(await gtPaint("front")));
await shot("store-paint");
// browse: a red, then a violet (previewed on the car)
if (PHONE) {
  await click('.gf-tile[data-i="3"]', 1800);
} else {
  for (let i = 0; i < 3; i++) await press("ArrowRight", 250);
  await sleep(1600);
}
console.log("preview red", JSON.stringify(await gtPaint("front")));
await shot("store-preview-red");
// buy it
const z0 = await p.evaluate(() => document.querySelector(".gf-bal b").textContent);
if (PHONE) await click(".gf-sbar [data-act]", 900);
else await press("Enter", 900);
const z1 = await p.evaluate(() => document.querySelector(".gf-bal b").textContent);
console.log("bought", z0, "→", z1, await p.evaluate(() => document.querySelector(".gf-snote")?.textContent), await p.evaluate(() => [localStorage.getItem("zstreet.gta.store"), localStorage.getItem("zstreet.economy")]));
await shot("store-bought");
// the neon tab, a teal
if (PHONE) await click('.gf-vtabs [data-cat="neon"]', 600);
else await press("ArrowDown", 600);
if (PHONE) await click('.gf-tile[data-i="2"]', 1600);
else {
  await press("ArrowRight", 250);
  await press("ArrowRight", 1600);
}
await shot("store-neon");
// the rims: buy black
await click('.gf-vtabs [data-cat="rims"]', 600);
await click('.gf-tile[data-i="2"]', 1400);
await click(".gf-sbar [data-act]", 1200);
await shot("store-rims");
// the bike tab: the camera on the ZK-R
await click('.gf-vtabs [data-cat="bike"]', 2600);
await click('.gf-tile[data-i="2"]', 1600);
await shot("store-bike");
// the horn tab
await click('.gf-vtabs [data-cat="horn"]', 800);
await shot("store-horn");
// HOME, GET ⓩ (their modules' tabs, or what is coming)
await click('.gf-stabs [data-tab="home"]', 1200);
await shot("store-home");
await click('.gf-stabs [data-tab="getz"]', 1000);
await shot("store-getz");
// zkSNARKs: the line-up, and Zilk Road's sheet
await click('.gf-stabs [data-tab="zksnarks"]', 3400);
console.log("zksnarks tab", await state());
await shot("store-zksnarks");
await click(".gf-tools [data-do=zilk]", 800);
await shot("store-zilk");
await press("Escape", 500);
console.log("zilk sheet closed", await p.evaluate(() => !document.querySelector(".gfw")));
// ↓ from the line-up: VEHICLES' paint again
if (!PHONE) {
  await press("ArrowDown", 2000);
  console.log("down from the line-up", await state(), await p.evaluate(() => document.querySelector(".gta-front").dataset.tab));
}
// back: the menu, the stage car in what you wear (the red, not the preview)
await click((await state()).mode === "select" ? ".gf-select .gf-back" : ".gf-store .gf-back", 1800);
console.log("after store", await state(), JSON.stringify(await gtPaint("front")));
await shot("menu-after-store");
// how to play
await click('.gf-item[data-k="howto"]', 1200);
await shot("howto");
await click(".gf-howto .gf-back", 900);
// play from the store while a violet is only being looked at: in the street, the GT in the red bought
// (the store opens on the tab it was left on)
await click('.gf-item[data-k="store"]', 2000);
await click('.gf-stabs [data-tab="vehicles"]', 600);
await click('.gf-vtabs [data-cat="paint"]', 400);
await click('.gf-tile[data-i="5"]', 1200);
console.log("previewing", JSON.stringify(await gtPaint("front")));
await click(".gf-sbar [data-play]", 6000);
console.log(await state(), "the game's GT", JSON.stringify(await gtPaint("game")));
// look at it: the camera by the car
await p.evaluate(() => {
  const g = street.gta,
    c = g.parked.find((c) => c.kind === "gt");
  if (!c) return;
  const x = c.group.position.x,
    z = c.group.position.z;
  const px = x + 6,
    pz = z + 5,
    h = Math.atan2(x - px, z - pz),
    y = g.host.ground(px, pz) ?? 0.2;
  g.hud.coach(-1);
  g.player.place(px, y, pz, h);
  g.cam.behind(h, -0.1);
  g.cam.snap(g.player.pos.clone().setY(y + 1.55));
});
await sleep(2500);
await shot("play-red-gt");
console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
await b.close();
