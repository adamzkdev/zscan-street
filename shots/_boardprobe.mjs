// node shots/_boardprobe.mjs: QA #16 — what the "brown face with black squares" by the Needle (Park Row) is: shots over time from
// the QA's spot (142, −119) looking west, and a raycast through the face to name the object, its material and its texture
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => street.gta.hud.coach(-1));
const SPOT = JSON.parse(process.env.SPOT ?? "[142,-119,1.5708]");
await p.evaluate(([x, z, h]) => {
  const g = street.gta;
  for (let r = 0; r < 14; r += 0.7)
    for (let a = 0; a < 6.28; a += 0.7) {
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (g.host.footBlocked(px, pz)) continue;
      if (r < 13 && [0, 1.57, 3.14, 4.71].some((b) => g.host.footBlocked(px + Math.cos(b) * 2.2, pz + Math.sin(b) * 2.2))) continue;
      const y = g.host.ground(px, pz) ?? 0.2;
      g.player.place(px, y, pz, h); g.cam.behind(h, -0.06); g.cam.snap(g.player.pos.clone().setY(y + 1.55));
      return;
    }
}, SPOT);
for (const t of [300, 900, 3000, 9000]) {
  await sleep(t === 300 ? 300 : t - [300, 900, 3000, 9000][[300, 900, 3000, 9000].indexOf(t) - 1]);
  await p.screenshot({ path: `shots/gta/qa-out/probe-board-${t}.png` });
}
const PTS = JSON.parse(process.env.PTS ?? "[[640,180],[560,170],[700,250],[520,240]]");
const hits = await p.evaluate((pts) => {
  const cam = street.gta.cam.camera;
  const rc = new street.ray.constructor();
  const out = [];
  for (const [sx, sy] of pts) {
    rc.setFromCamera({ x: (sx / innerWidth) * 2 - 1, y: -(sy / innerHeight) * 2 + 1 }, cam);
    const h = rc.intersectObjects(street.scene3.children, true).find((i) => i.object.visible && !i.object.isSprite);
    if (!h) { out.push(null); continue; }
    const o = h.object;
    const names = [];
    for (let q = o; q; q = q.parent) names.push((q.name || q.type) + (q.userData?.kind ? ":" + q.userData.kind : ""));
    const m = Array.isArray(o.material) ? o.material[h.face?.materialIndex ?? 0] : o.material;
    const img = m?.map?.image;
    out.push({ at: [sx, sy], d: +h.distance.toFixed(1), p: h.point.toArray().map((v) => +v.toFixed(1)), chain: names.slice(0, 7).join(" < "), type: o.type, mat: m?.type, mname: m?.name || m?.userData?.realSlot || "", map: img ? `${img.width}x${img.height} ${img.src ? img.src.split("/").slice(-2).join("/") : img.constructor?.name}` : null, ud: JSON.stringify(o.userData).slice(0, 160) });
  }
  return out;
}, PTS);
for (const h of hits) console.log(JSON.stringify(h));
// everything drawn round the face's point (a few metres in front of it included): what the ray may not see
if (process.env.NEAR) {
  const near = await p.evaluate((c) => {
    const V = street.gta.player.pos.constructor;
    const pt = new V(c[0], c[1], c[2]);
    const out = [];
    const sph = new (street.ray.ray.constructor)();
    street.scene3.traverseVisible((o) => {
      if (!o.geometry || !(o.isMesh || o.isSprite || o.isPoints || o.isLine)) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const bs = o.geometry.boundingSphere;
      if (!bs) return;
      const ctr = bs.center.clone().applyMatrix4(o.matrixWorld);
      const s = o.matrixWorld.getMaxScaleOnAxis();
      const d = ctr.distanceTo(pt) - bs.radius * s;
      if (d > 2.5 || bs.radius * s > 60) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const img = m?.map?.image;
      const names = [];
      for (let q = o; q; q = q.parent) names.push(q.name || q.type);
      out.push({ d: +d.toFixed(2), r: +(bs.radius * s).toFixed(1), at: ctr.toArray().map((v) => +v.toFixed(1)), chain: names.slice(0, 6).join(" < "), type: o.type, mat: m?.type, slot: m?.userData?.realSlot ?? m?.name ?? "", tr: m?.transparent, map: img ? `${img.width}x${img.height}` : null, ray: o.raycast.toString().length < 40 });
    });
    return out.sort((a, b) => a.d - b.d).slice(0, 40);
  }, JSON.parse(process.env.NEAR));
  for (const n of near) console.log("near", JSON.stringify(n));
}
// the experiment: the face's material without its reflections, then the scene without its environment
if (process.env.EXP) {
  const info = await p.evaluate(([sx, sy]) => {
    const cam = street.gta.cam.camera;
    const rc = new street.ray.constructor();
    rc.setFromCamera({ x: (sx / innerWidth) * 2 - 1, y: -(sy / innerHeight) * 2 + 1 }, cam);
    const h = rc.intersectObjects(street.scene3.children, true).find((i) => i.object.visible && !i.object.isSprite);
    const o = h.object;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    window.__probeM = m;
    const env = street.scene3.environment;
    return { color: m.color.getHexString(), rough: m.roughness, metal: m.metalness, envI: m.envMapIntensity, vc: m.vertexColors, env: env ? `${env.constructor.name} ${env.image?.width ?? ""}x${env.image?.height ?? ""} ${env.name}` : null, col: o.geometry.getAttribute("color") ? [...o.geometry.getAttribute("color").array.slice(h.face.a * 3, h.face.a * 3 + 3)].map((v) => +v.toFixed(3)) : null };
  }, PTS[0]);
  console.log("face", JSON.stringify(info));
  const sib = await p.evaluate(([sx, sy]) => {
    const cam = street.gta.cam.camera;
    const rc = new street.ray.constructor();
    rc.setFromCamera({ x: (sx / innerWidth) * 2 - 1, y: -(sy / innerHeight) * 2 + 1 }, cam);
    const h = rc.intersectObjects(street.scene3.children, true).find((i) => i.object.visible && !i.object.isSprite);
    const par = h.object.parent;
    window.__probeGroup = par;
    return par.children.map((o) => `${o.type}:${(Array.isArray(o.material) ? o.material[0] : o.material)?.userData?.realSlot ?? "?"}:${o.visible ? "v" : "h"}:ro${o.renderOrder}:dt${(Array.isArray(o.material) ? o.material[0] : o.material)?.depthTest}:dw${(Array.isArray(o.material) ? o.material[0] : o.material)?.depthWrite}:tr${(Array.isArray(o.material) ? o.material[0] : o.material)?.transparent}`).join(" ");
  }, PTS[0]);
  console.log("siblings", sib);
  const all = await p.evaluate(([sx, sy]) => {
    const cam = street.gta.cam.camera;
    const rc = new street.ray.constructor();
    rc.setFromCamera({ x: (sx / innerWidth) * 2 - 1, y: -(sy / innerHeight) * 2 + 1 }, cam);
    const out = [];
    for (const o of window.__probeGroup.children) {
      const m = o.material;
      const side = m.side;
      m.side = 2;
      const hs = rc.intersectObject(o, false);
      m.side = side;
      for (const h of hs.slice(0, 4)) out.push(`${m.userData.realSlot} d=${h.distance.toFixed(3)} n=${h.face.normal.toArray().map((v) => v.toFixed(2)).join(",")} side=${side}`);
    }
    out.push("cam near " + cam.near + " far " + cam.far + " logDepth " + street.composer.renderer.capabilities.logarithmicDepthBuffer);
    return out;
  }, PTS[0]);
  for (const l of all) console.log("hit", l);
  await p.evaluate(() => { for (const o of window.__probeGroup.children) if (o.material?.userData?.realSlot === "lm.glow") { o.visible = false; window.__probeGlow = o; } });
  await sleep(500);
  await p.screenshot({ path: "shots/gta/qa-out/probe-board-noglow.png" });
  await p.evaluate(() => { if (window.__probeGlow) window.__probeGlow.visible = true; });
  await p.evaluate(() => { window.__probeM.__e = window.__probeM.envMapIntensity; window.__probeM.envMapIntensity = 0; });
  await sleep(500);
  await p.screenshot({ path: "shots/gta/qa-out/probe-board-noenv.png" });
  await p.evaluate(() => { window.__probeM.envMapIntensity = window.__probeM.__e; window.__probeM.roughness = 0.35; });
  await sleep(500);
  await p.screenshot({ path: "shots/gta/qa-out/probe-board-rough.png" });
}
console.log("errors", errs.length, errs.slice(0, 2).join(" | "));
await b.close();
