// node shots/_realmarks1.mjs [TAG]: the landmarks of the north and the centre (src/scene/real/marks.ts), at street
// level in front of each (the game's camera) by day and by night, then from the city's iso camera.
// BEFORE=1: the old voxels (?marks=voxel). KINDS=eiffel,museum… VIEWS=day,night,iso. Writes shots/gta/marks1/<tag>-<kind>-<view>.png
import puppeteer from "puppeteer-core";
const TAG = process.argv[2] ?? (process.env.BEFORE ? "before" : "after");
const KINDS = (process.env.KINDS ?? "eiffel,colosseum,pyramid,museum,parliament,stadium,needle,shibuya,cemetery").split(",");
const VIEWS = (process.env.VIEWS ?? "day,night,iso").split(",");
const OUT = "shots/gta/marks1";
const old = process.env.BEFORE ? "&marks=voxel" : "";
// how far in front of the door to stand, how far up to look
const STAND = { eiffel: [10, 0.32], colosseum: [10, 0.12], pyramid: [10, 0.14], museum: [8, 0.04], parliament: [8, 0.36], stadium: [10, 0.1], needle: [10, 0.5], shibuya: [8, 0.3], cemetery: [8, -0.02] };
const ISO = { eiffel: 0.75, colosseum: 0.7, pyramid: 0.7, museum: 0.6, parliament: 0.85, stadium: 0.5, needle: 0.55, shibuya: 0.85, cemetery: 0.8 };
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
p.on("console", (m) => m.type() === "error" && !/429|Failed to load resource|WebSocket/.test(m.text()) && errs.push(m.text().slice(0, 200)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fpsOf = () =>
  p.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => (++n, performance.now() - t0 < 3000 ? requestAnimationFrame(tick) : res(Math.round((n * 1000) / (performance.now() - t0))));
        requestAnimationFrame(tick);
      }),
  );
for (const view of VIEWS.filter((v) => v !== "iso")) {
  await p.goto(`http://localhost:3061/?debug&gta=1192&theme=${view}&solo${old}`);
  await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
  await p.evaluate((night) => {
    // (the game's own day: its sky clock, forced to noon or to half past ten at night)
    street.gta.settings.sky = "cycle";
    street.gta.clock.force(night ? 22.5 : 13, "clear");
    street.gta.hud.coach(-1);
    const h = document.querySelector(".gta-hud");
    if (h) h.style.display = "none";
  }, view === "night");
  await sleep(3000);
  for (const k of KINDS) {
    const at = await p.evaluate(
      (k, d, pitch) => {
        const lm = street.city.landmarks.get(k);
        if (!lm) return null;
        const g = street.gta;
        const ox = Math.sin(lm.yaw),
          oz = Math.cos(lm.yaw);
        // on the street in front of the door (the nearest road to a point d out), stepped back, looking at the landmark
        const st = g.roads.nearest(lm.door.x + ox * d, lm.door.z + oz * d);
        for (let back = 0; back < 10; back += 1.5)
          for (const s of [0, 2, -2, 4, -4]) {
            const px = st.x + ox * back - oz * s,
              pz = st.z + oz * back + ox * s;
            if (g.host.footBlocked(px, pz)) continue;
            const c = lm.occluder.box.getCenter(lm.door.clone());
            const hd = Math.atan2(px - c.x, pz - c.z);
            g.player.place(px, 0.2, pz, hd);
            g.cam.behind(hd, pitch);
            g.cam.snap(g.player.pos.clone().setY(1.55));
            return [px.toFixed(0), pz.toFixed(0)];
          }
        return null;
      },
      k,
      ...(STAND[k] ?? [20, -0.2]),
    );
    await sleep(2600);
    await p.screenshot({ path: `${OUT}/${TAG}-${k}-${view}.png` });
    console.log(TAG, k, view, at);
  }
  console.log(TAG, view, "fps (last spot)", await fpsOf());
}
if (VIEWS.includes("iso")) {
  await p.goto(`http://localhost:3061/?debug&theme=day${old}`);
  await p.waitForFunction(() => window.__streetUp && window.street?.rig, { timeout: 300000, polling: 300 });
  await sleep(4000);
  for (const k of KINDS) {
    await p.evaluate((k, zoom) => {
      const lm = street.city.landmarks.get(k);
      if (!lm) return;
      // (a little behind the door, into the lot)
      const c = lm.door.clone().addScaledVector(new lm.door.constructor(Math.sin(lm.yaw), 0, Math.cos(lm.yaw)), -12);
      street.rig.setMode("free");
      street.rig.flyTo(new street.rig.focus.constructor(c.x, 1, c.z), zoom);
    }, k, ISO[k] ?? 0.7);
    await sleep(3500);
    await p.screenshot({ path: `${OUT}/${TAG}-${k}-iso.png` });
    console.log(TAG, k, "iso");
  }
  console.log(TAG, "iso fps", await fpsOf());
}
console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
await b.close();
