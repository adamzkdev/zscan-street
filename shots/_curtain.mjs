// node shots/_curtain.mjs [URL]: the Orchard Tunnel's mouths (src/scene/keys, real/keysreal.ts kTunnel) from the car, both ways:
// a shot each, and what a ray through points of the opening hits first (which mesh, its material) — the "curtain" hunt.
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.keys?.done, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(4000);
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.heat.raise = () => {}; const c = g.parked.find((x) => x.kind === "gt") ?? g.parked[0]; g.player.place(c.group.position.x - 1.5, 0.2, c.group.position.z + 1.6, 0); g.input.tap("KeyF"); });
await p.waitForFunction(() => !!street.gta.car, { timeout: 10000, polling: 100 });
const spots = JSON.parse(process.env.SPOTS ?? "null") ?? [
  // [name, x, z, car yaw (π/2 north, −π/2 south)]
  ["north-portal", 160, 596, -Math.PI / 2],
  ["inside-south", 160, 612, -Math.PI / 2],
  ["south-portal", 160, 668, Math.PI / 2],
  ["inside-north", 160, 655, Math.PI / 2],
];
for (const [name, x, z, yaw] of spots) {
  const r = await p.evaluate(async (x, z, yaw) => {
    const g = street.gta;
    g.car.place(x, z, yaw);
    g.car.vel.set(0, 0);
    g.cam.behind(yaw - Math.PI / 2, -0.08);
    await new Promise((r) => setTimeout(r, 2500));
    g.car.vel.set(0, 0);
    let cam = null;
    for (const ps of street.composer.passes) if (ps.camera) { cam = ps.camera; break; }
    return { cam: cam ? [cam.position.x.toFixed(1), cam.position.y.toFixed(1), cam.position.z.toFixed(1)] : null, camType: cam?.type };
  }, x, z, yaw);
  const hits = await p.evaluate(() => {
    const sc = street.scene3, ray = street.ray;
    let cam = null;
    for (const ps of street.composer.passes) if (ps.camera) { cam = ps.camera; break; }
    const out = [];
    for (const [u, v] of [[0, -0.05], [0, 0.1], [-0.15, 0], [0.15, 0], [0, -0.2]]) {
      ray.setFromCamera({ x: u, y: v }, cam);
      ray.near = 0;
      ray.far = 400;
      const hs = ray.intersectObjects(sc.children, true).filter((h) => { for (let q = h.object; q; q = q.parent) if (!q.visible) return false; return true; }).slice(0, 3);
      out.push({ u, v, hits: hs.map((h) => { const o = h.object; const path = []; for (let q = o; q && path.length < 6; q = q.parent) path.push(q.name || q.type); const m = Array.isArray(o.material) ? o.material[h.face?.materialIndex ?? 0] : o.material; return { d: +h.distance.toFixed(1), at: [+h.point.x.toFixed(1), +h.point.y.toFixed(1), +h.point.z.toFixed(1)], path: path.join("<"), mat: (m?.name || m?.type) + ":" + (m?.map?.name || m?.userData?.set || "") + ":" + (m?.color?.getHexString?.() ?? "") }; }) });
    }
    return out;
  });
  console.log(name, JSON.stringify(r));
  for (const h of hits) console.log("  ", JSON.stringify(h));
  await p.screenshot({ path: `shots/gta/gg/curtain-${name}.jpg`, type: "jpeg", quality: 65 });
}
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
