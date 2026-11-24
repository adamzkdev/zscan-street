// node shots/_realmarks2.mjs [TAG] [QS]: the realistic landmarks (src/scene/real/landmarks.ts) from the street in front of
// each one's door, day and night, and the map view; TAG names the files (shots/gta/marks/<TAG>-<key>-<day|night>.png).
// QS adds to the URL ("&marks=voxel" for the voxel landmarks as they were). ONLY=key,key… KEYS=1 lists the places.
// DIST=metres back from the door, PITCH=camera pitch. FPS=1 measures uncapped fps at each spot (day).
import puppeteer from "puppeteer-core";
const [TAG = "after", QS = ""] = process.argv.slice(2);
const OUT = "shots/gta/marks";
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", ...(process.env.FPS ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : [])], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/429|500|Failed to load resource|WebSocket/.test(m.text()) && errs.push(m.text().slice(0, 200)));
// (the city workers' own errors: "city worker: <type> #<id> failed")
p.on("workercreated", (w) => { try { w.on("console", (m) => m.type() === "error" && errs.push("worker: " + m.text().slice(0, 200))); } catch {} });
await p.goto(`http://localhost:3061/?debug&gta=1192&theme=day&solo${QS}`);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => {
  const g = street.gta;
  g.hud.coach(-1);
  document.querySelector(".gta-hud") && (document.querySelector(".gta-hud").style.display = "none");
  // (the walker out of the picture: the camera stands where they are)
  Object.defineProperty(g.player.group, "visible", { get: () => false, set: () => {}, configurable: true });
  // a free camera for the shots: where window.__shot says, looking where it says
  const foot = g.cam.foot.bind(g.cam);
  g.cam.foot = function (dt, feet, world) {
    const s = window.__shot;
    if (!s) return foot(dt, feet, world);
    this.camera.position.set(s.pos[0], s.pos[1], s.pos[2]);
    this.camera.lookAt(s.look[0], s.look[1], s.look[2]);
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
  };
});
await sleep(3000);
const spots = await p.evaluate(() => street.gta.placeSpots.map((d) => ({ key: d.key, x: d.x, z: d.z, fx: d.fx, fz: d.fz })));
// NU7=1: also the NU7 Tower (src/game/nu7quarter.ts), from the south
if (process.env.NU7)
  spots.push(
    ...(await p.evaluate(async () => {
      const plan = await import("/src/scene/city/plan.ts");
      const T = plan.NU7Q.tower;
      return [{ key: "nu7-0", x: T.x, z: T.z + 8, fx: 0, fz: 1 }];
    }))
  );
// WORKS=1: also the City Works sites (src/game/works.ts)
if (process.env.WORKS)
  spots.push(
    ...(await p.evaluate(async () => {
      const plan = await import("/src/scene/city/plan.ts");
      return plan.worksSites().slice(0, 4).map((w, i) => ({ key: `works-${i}`, x: w.face === "w" ? w.x0 : w.x1, z: w.cz, fx: w.face === "w" ? -1 : 1, fz: 0 }));
    }))
  );
// JOBS=type,type…: also the plan's buildings of those types (the heart's shops, a landmark kind as "lm:kind"), in front of their frontage
if (process.env.JOBS)
  spots.push(
    ...(await p.evaluate(async (want) => {
      const plan = await import("/src/scene/city/plan.ts");
      const F = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
      return plan
        .planCity()
        .jobs.filter((j) => !j.ext && want.some((w) => (w.startsWith("lm:") ? j.type === "landmark" && j.opts.kind === w.slice(3) : j.type === w)))
        .map((j) => {
          const [fx, fz] = F[j.face];
          const [x, z] = j.face === "s" || j.face === "n" ? [j.along, j.front] : [j.front, j.along];
          return { key: `${j.type === "landmark" ? j.opts.kind : j.type}${j.opts.kind && j.type !== "landmark" ? "-" + j.opts.kind : ""}-${j.id}`, x, z, fx, fz };
        });
    }, process.env.JOBS.split(",")))
  );
if (process.env.KEYS) console.log(spots.map((s) => `${s.key} ${s.x.toFixed(0)},${s.z.toFixed(0)} f${s.fx.toFixed(0)},${s.fz.toFixed(0)}`).join("\n"));
const fps = {};
const DIST = Number(process.env.DIST ?? 13),
  SIDE = Number(process.env.SIDE ?? 4),
  UP = Number(process.env.UP ?? 14),
  FOV = Number(process.env.FOV ?? 72);
for (const s of spots) {
  if (ONLY && !ONLY.includes(s.key) && !((process.env.JOBS || process.env.WORKS || process.env.NU7) && /-\d+$/.test(s.key))) continue;
  const h = Math.atan2(s.fx, s.fz);
  for (const [tod, hour] of process.env.DAY ? [["day", 14]] : [["day", 14], ["night", 22.5]]) {
    const at = await p.evaluate((s, h, hour, DIST, SIDE, UP, FOV) => {
      const g = street.gta;
      g.clock?.force?.(hour, "clear");
      // the eye DIST m out from the door along its front, SIDE m to its right, looking UP m over the door
      const x = s.x + s.fx * DIST - s.fz * SIDE,
        z = s.z + s.fz * DIST + s.fx * SIDE;
      g.player.place(s.x + s.fx * 3, 0.2, s.z + s.fz * 3, h);
      window.__shot = { pos: [x, 1.7, z], look: [s.x, UP, s.z], fov: FOV };
      return [+x.toFixed(1), +z.toFixed(1)];
    }, s, h, hour, DIST, SIDE, UP, FOV);
    await sleep(2400);
    await p.screenshot({ path: `${OUT}/${TAG}-${s.key.replace(/[^a-z0-9-]/gi, "_")}-${tod}.png` });
    if (process.env.FPS && tod === "day") fps[s.key] = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
    console.log(s.key, tod, JSON.stringify(at));
  }
}
await p.evaluate(() => (window.__shot = null));
if (!ONLY || ONLY.includes("map")) {
  await p.evaluate(() => street.gta.stop());
  await sleep(2500);
  await p.screenshot({ path: `${OUT}/${TAG}-map-home.png` });
  if (process.env.MAPS) for (const [i, [x, z, zoom]] of JSON.parse(process.env.MAPS).entries()) {
    await p.evaluate((x, z, zoom) => { street.rig?.lookAt?.(x, z); street.rig?.zoomBy?.(zoom); }, x, z, zoom);
    await sleep(2500);
    await p.screenshot({ path: `${OUT}/${TAG}-map-${i}.png` });
  }
}
const info = await p.evaluate(() => ({ calls: street.renderer?.info?.render?.calls, tris: street.renderer?.info?.render?.triangles }));
console.log(TAG, JSON.stringify({ fps, info }));
console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
await b.close();
