// node shots/_qafield.mjs: are the kerbs' parked cars out of the game's solid field (they move: taken, shoved)?
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const r = await p.evaluate(() => {
  const g = street.gta, s = g.solid;
  const cars = [...g.rides()].filter((r) => r.obj.parent?.name === "parked-cars");
  const inMovers = (o) => g.host.movers().includes(o);
  const at = (x, z) => { const i = Math.floor((x - s.x0) / s.cell), j = Math.floor((z - s.z0) / s.cell); return s.top[j * s.size + i]; };
  return cars.slice(0, 8).map((c) => ({ x: +c.obj.position.x.toFixed(1), z: +c.obj.position.z.toFixed(1), mover: inMovers(c.obj), top: +(at(c.obj.position.x, c.obj.position.z) ?? NaN).toFixed(2), surf: +s.host.surface(c.obj.position.x, c.obj.position.z).toFixed(2) }));
});
console.log("at load", JSON.stringify(r.slice(0, 4)));
await p.evaluate(() => street.gta.solid.build());
await new Promise((r) => setTimeout(r, 3000));
const r2 = await p.evaluate(() => {
  const g = street.gta, s = g.solid;
  const at = (x, z) => { const i = Math.floor((x - s.x0) / s.cell), j = Math.floor((z - s.z0) / s.cell); return s.top[j * s.size + i]; };
  return [...g.rides()].filter((r) => r.obj.parent?.name === "parked-cars").slice(0, 4).map((c) => {
    let cells = 0;
    for (let dx = -3; dx <= 3; dx += 0.2) for (let dz = -3; dz <= 3; dz += 0.2) { const t = at(c.obj.position.x + dx, c.obj.position.z + dz); if (t === t && t > 0.3) cells++; }
    return [+c.obj.position.x.toFixed(1), +c.obj.position.z.toFixed(1), cells];
  });
});
console.log("after build()", JSON.stringify(r2));
// the first one taken away, the field built again: what stood there?
const r3 = await p.evaluate(async () => {
  const g = street.gta, s = g.solid;
  const c = [...g.rides()].filter((r) => r.obj.parent?.name === "parked-cars")[0];
  const x = c.obj.position.x, z = c.obj.position.z;
  const grp = c.take();
  grp.removeFromParent();
  await s.build();
  const at = (x, z) => { const i = Math.floor((x - s.x0) / s.cell), j = Math.floor((z - s.z0) / s.cell); return s.top[j * s.size + i]; };
  let mx = -1, cells = 0;
  for (let dx = -3; dx <= 3; dx += 0.2) for (let dz = -3; dz <= 3; dz += 0.2) { const t = at(x + dx, z + dz); if (t === t && t > 0.3) (mx = Math.max(mx, t)), cells++; }
  // what meshes stand there (bounding spheres' centres within 3 m of the spot, below 3.5 m)
  let root = grp; while (root.parent) root = root.parent;
  root = c.obj.parent ?? root;
  let sc = g.player.group; while (sc.parent) sc = sc.parent;
  const names = [];
  sc.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const bs = o.geometry.boundingSphere;
    if (!bs || bs.radius > 15) return;
    const w = o.localToWorld(bs.center.clone());
    if (Math.abs(w.x - x) < 3 && Math.abs(w.z - z) < 3 && w.y < 3.5) names.push((o.name || "") + "/" + (o.parent?.name || "") + "/" + (o.parent?.parent?.name || "") + " r" + bs.radius.toFixed(1) + " y" + w.y.toFixed(1) + (o.isInstancedMesh ? " inst" : ""));
  });
  return { x, z, mx, cells, names: names.slice(0, 12) };
});
console.log("car gone", JSON.stringify(r3));
await b.close();
