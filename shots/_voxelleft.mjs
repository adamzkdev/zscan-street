// node shots/_voxelleft.mjs: per place (KEYS), on a fresh page, how many meshes still use the voxel mesher's materials
// (MATERIALS.solid: vertex colours, roughness 0.88, metalness 0.02) vs the realistic ones (remesh/ground)
import puppeteer from "puppeteer-core";
const KEYS = (process.env.KEYS ?? "hotel,mall,gardens,palm,arab,colosseum,pyramid,eiffel,bigben,opera,library,prison,cemetery,gamehouse").split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 800, height: 450 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto(`http://localhost:3061/?debug&gta=1192&theme=day${process.env.QS ? "&" + process.env.QS : ""}`);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
for (const k of KEYS) {
  await p.evaluate((k) => street.gta.host.enter(k), k);
  if (!(await p.waitForFunction(() => !!street.gta.host.interior(), { timeout: 60000, polling: 300 }).then(() => true, () => false))) { console.log(k, "no way in"); continue; }
  await new Promise((r) => setTimeout(r, 3000));
  const r = await p.evaluate(() => {
    const sc = street.gta.host.interior().scene;
    const c = { voxel: 0, real: 0, leaves: 0 };
    sc.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      const m = o.material;
      if (m.userData?.realGround) c.real++;
      else if (m.vertexColors && m.roughness === 0.88 && Math.abs(m.metalness - 0.02) < 1e-6) {
        c.voxel++;
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        const w = new o.position.constructor();
        o.getWorldPosition(w);
        (c.what ??= []).push(`${(bb.max.x - bb.min.x).toFixed(1)}x${(bb.max.y - bb.min.y).toFixed(1)}x${(bb.max.z - bb.min.z).toFixed(1)}@${w.x.toFixed(0)},${w.y.toFixed(0)},${w.z.toFixed(0)} ${o.parent?.name ?? ""}`);
      }
      else if (m.alphaTest > 0.3) c.leaves++;
    });
    return c;
  });
  console.log(k, JSON.stringify(r));
  await p.evaluate(() => street.leavePlace());
  await p.waitForFunction(() => !street.gta.host.interior(), { timeout: 30000, polling: 300 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
}
await b.close();
