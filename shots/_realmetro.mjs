// node shots/_realmetro.mjs [TAG] [QS]: the elevated metro's realistic trains (src/scene/real/metrocar.ts) and a station, day and night
import puppeteer from "puppeteer-core";
const [TAG = "after", QS = ""] = process.argv.slice(2);
const OUT = "shots/gta/marks";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(`http://localhost:3061/?debug&gta=1192&theme=day&solo${QS}`);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => {
  const g = street.gta;
  g.hud.coach(-1);
  document.querySelector(".gta-hud") && (document.querySelector(".gta-hud").style.display = "none");
  Object.defineProperty(g.player.group, "visible", { get: () => false, set: () => {}, configurable: true });
  const foot = g.cam.foot.bind(g.cam);
  g.cam.foot = function (dt, feet, world) {
    const s = window.__shot;
    if (!s) return foot(dt, feet, world);
    if (s.follow) {
      const o = s.follow;
      const v = new (o.position.constructor)();
      o.getWorldPosition(v);
      this.camera.position.set(v.x + s.off[0], v.y + s.off[1], v.z + s.off[2]);
      this.camera.lookAt(v.x, v.y + 1.4, v.z);
    } else {
      this.camera.position.set(s.pos[0], s.pos[1], s.pos[2]);
      this.camera.lookAt(s.look[0], s.look[1], s.look[2]);
    }
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
  };
});
await sleep(4000);
for (const [tod, hour] of [["day", 14], ["night", 22.5]]) {
  // wait for a train car to be out on the line
  const ok = await p.evaluate(async (hour) => {
    street.gta.clock?.force?.(hour, "clear");
    for (let i = 0; i < 120; i++) {
      let car = null;
      street.scene3.traverse((o) => {
        if (!car && o.userData.metroCar === "head" && o.parent?.visible !== false) {
          let v = true;
          for (let q = o; q; q = q.parent) if (q.visible === false) v = false;
          if (v) car = o;
        }
      });
      if (car) {
        window.__shot = { follow: car, off: [7, 1.5, 9], fov: 55 };
        street.gta.player.place(car.getWorldPosition(new car.position.constructor()).x, 0.2, 0, 0);
        return true;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  }, hour);
  await sleep(1500);
  await p.screenshot({ path: `${OUT}/${TAG}-metro-train-${tod}.png` });
  console.log("train", tod, ok);
}
await p.evaluate(() => (window.__shot = { pos: [6, 1.7, 40], look: [0, 7, 52], fov: 70 }));
await sleep(2000);
console.log("errors", errs.length, errs.slice(0, 4).join("\n"));
await b.close();
