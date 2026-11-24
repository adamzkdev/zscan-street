// node shots/_gtabeach.mjs [URL] [OUT]: Orchard Keys' beach in the game (src/gta): the beach at street level (day, night), its people (lying, umbrellas, swimmers, volleyball), the player wading in, swimming (above and below the surface) and climbing out; then the census (who lives where)
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/beach/b"] = process.argv.slice(2);
const ONLY = process.env.ONLY ?? "";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
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
});
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => (m.type() === "error" && !/429|500|Failed to load resource/.test(m.text()) ? errs.push(m.text().slice(0, 200)) : /^(census|beach|swim)/.test(m.text()) && console.log(m.text())));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => street.gta.hud.coach(-1));
let n = 0;
const shot = async (name) => {
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-${name}.png` });
  console.log("shot", n, name);
};
/** Put the player at (x, z) facing h (0 = north), the camera behind at pitch. (Orchard Keys' spots are given in its
 * old figures: the town lies ACROSS = 380 m further south since the Golden Gate grew — added here.) */
const at = (x, z, h, pitch = -0.1) =>
  p.evaluate(
    (x, z, h, pitch) => {
      const g = street.gta;
      const y = g.host.ground(x, z) ?? 0.2;
      g.player.place(x, y, z, h);
      g.cam.behind(h, pitch);
      g.cam.snap(g.player.pos.clone().setY(y + 1.55));
    },
    x,
    z > 236 ? z + 380 : z,
    h,
    pitch,
  );
// (the town and its beach built)
await p.waitForFunction(() => window.street?.keys?.done ?? true, { timeout: 120000, polling: 500 }).catch(() => {});
await sleep(3000);
if (!ONLY || ONLY.includes("look")) {
  await at(206 - 30, 418, Math.PI, -0.18);
  await sleep(4500);
  await shot("promenade-south");
  console.log("beach", JSON.stringify(await p.evaluate(() => ({ bodies: street.gta.beach.bodies.length, kinds: street.gta.beach.bodies.reduce((m, b) => ((m[b.doing] = (m[b.doing] ?? 0) + 1), m), {}), people: street.gta.people.counts }))));
  await at(150, 452, Math.PI * 0.8, -0.12);
  await sleep(3500);
  await shot("on-the-sand");
  await at(240, 484, Math.PI * 0.5 + 0.3, -0.08);
  await sleep(3500);
  await shot("waterline");
  await at(206 + 8, 470, 0.0, -0.05);
  await sleep(3000);
  await shot("looking-back");
  // from the Golden Gate's deck, the town and its sea ahead
  await p.evaluate(() => {
    const g = street.gta;
    g.player.place(157, 9, 196, Math.PI);
    g.cam.behind(Math.PI, -0.16);
    g.cam.snap(g.player.pos.clone().setY(10.5));
  });
  await sleep(3500);
  await shot("from-the-bridge");
}
if (!ONLY || ONLY.includes("swim")) {
  // walk into the sea: wading, then swimming
  await at(180, 486, Math.PI, -0.12);
  await sleep(1500);
  await p.keyboard.down("KeyW");
  for (let k = 0; k < 11; k++) {
    await sleep(900);
    const s = await p.evaluate(() => {
      const g = street.gta,
        q = g.player.pos;
      return { x: +q.x.toFixed(1), y: +q.y.toFixed(2), z: +q.z.toFixed(1), swim: g.swim?.state ?? null };
    });
    console.log("swim", JSON.stringify(s));
    if (k === 1) await shot("wading");
    if (k === 9) await shot("swimming");
    if (k === 10) {
      await p.evaluate(() => street.gta.cam.behind(street.gta.player.facing + 1.4, -0.12));
      await sleep(500);
      await shot("crawl-side");
    }
  }
  await p.keyboard.up("KeyW");
  await sleep(600);
  // a dive: Space held, the camera follows you under
  await p.keyboard.down("Space");
  await sleep(1800);
  console.log("swim dive", JSON.stringify(await p.evaluate(() => ({ y: +street.gta.player.pos.y.toFixed(2), cam: +street.gta.camera.position.y.toFixed(2), veil: document.querySelector(".gta-underwater")?.style.opacity }))));
  await shot("under");
  await p.keyboard.up("Space");
  await sleep(1500);
  // and back to the beach
  await p.evaluate(() => {
    const g = street.gta;
    g.player.facing = 0;
    g.cam.behind(0, -0.12);
  });
  await p.keyboard.down("KeyW");
  for (let k = 0; k < 9; k++) {
    await sleep(900);
    const s = await p.evaluate(() => ({ z: +street.gta.player.pos.z.toFixed(1), y: +street.gta.player.pos.y.toFixed(2), swim: street.gta.swim?.state ?? null }));
    console.log("swim back", JSON.stringify(s));
  }
  await p.keyboard.up("KeyW");
  await shot("out");
}
if (!ONLY || ONLY.includes("pier")) {
  // out along the pier, then off its side into the sea
  await at(206, 411, Math.PI, -0.12);
  await sleep(1200);
  await p.keyboard.down("KeyW");
  for (let k = 0; k < 8; k++) {
    await sleep(900);
    console.log("swim pier", JSON.stringify(await p.evaluate(() => ({ z: +street.gta.player.pos.z.toFixed(1), y: +street.gta.player.pos.y.toFixed(2), swim: street.gta.swim.state }))));
  }
  await p.keyboard.up("KeyW");
  await shot("on-the-pier");
  await p.evaluate(() => {
    const g = street.gta;
    g.player.facing = -Math.PI / 2;
    g.cam.behind(-Math.PI / 2, -0.12);
  });
  await p.keyboard.down("KeyW");
  await sleep(500);
  await p.keyboard.press("Space");
  for (let k = 0; k < 4; k++) {
    await sleep(700);
    console.log("swim off", JSON.stringify(await p.evaluate(() => ({ x: +street.gta.player.pos.x.toFixed(1), y: +street.gta.player.pos.y.toFixed(2), swim: street.gta.swim.state }))));
  }
  await p.keyboard.up("KeyW");
  await shot("off-the-pier");
}
if (!ONLY || ONLY.includes("census")) {
  const spots = [
    ["heart", 0, 4],
    ["shibuya", -54, -150],
    ["wall street", 210, 20],
    ["ring west", -226, -100],
    ["beach", 200, 452],
  ];
  for (const [name, x, z] of spots) {
    await at(x, z, 0);
    await sleep(9000);
    const c = await p.evaluate(() => {
      const g = street.gta;
      const ids = g.peds.all.map((q) => q.id);
      return { n: ids.length, distinct: new Set(ids).size, area: g.peds.areaHere?.() ?? null, sample: ids.slice(0, 6) };
    });
    console.log("census", name, JSON.stringify(c));
  }
}
if (!ONLY || ONLY.includes("night")) {
  await p.evaluate(() => street.gta.host.setSky("night"));
  await at(206 - 30, 418, Math.PI, -0.18);
  await sleep(4000);
  await shot("night");
}
const fps = await p.evaluate(async () => {
  let k = 0;
  const t0 = performance.now();
  await new Promise((r) => {
    const f = () => (++k, performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r());
    requestAnimationFrame(f);
  });
  return +(k / 3).toFixed(1);
});
console.log("fps", fps);
console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
await b.close();
