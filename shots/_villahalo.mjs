// node shots/_villahalo.mjs [URL]: the villa by night from the strait (scene/keys/villa.ts): the white halo over its east
// wing — a shot, then the same with each suspect hidden in turn (how much of the picture is blown out to white each time).
// Writes shots/gta/villa/halo-*.jpg; prints the share of near-white pixels per variant.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const [URL = "http://localhost:3061/?debug&capture&theme=night"] = process.argv.slice(2);
const OUT = "shots/gta/villa";
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 960, height: 540 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.capture, { timeout: 600000, polling: 300 });
await p.evaluate(() => { capture.theme("night"); capture.rain(false); });
const SHOTS = (process.env.VIEWS ?? "sea,seaeast,seawest").split(",");
const VIEWS = {
  sea: { pos: [300, 9, 584], look: [292, 1, 622], fov: 50 },
  seaeast: { pos: [330, 7, 590], look: [290, 1.5, 622], fov: 50 },
  seawest: { pos: [262, 8, 588], look: [300, 1, 622], fov: 50 },
};
/** The share of the picture blown out to white (read back in the page itself). */
const white = async (f) => {
  const { readFileSync } = await import("node:fs");
  const url = "data:image/jpeg;base64," + readFileSync(f).toString("base64");
  return p.evaluate(async (url) => {
    const im = new Image();
    im.src = url;
    await im.decode();
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    const g = c.getContext("2d");
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 242 && d[i + 1] > 242 && d[i + 2] > 242) n++;
    return n / (d.length / 4);
  }, url);
};
/** Hide what `what` names (a function source run in the page over the scene), returns how many were hidden. */
const hide = (src) => p.evaluate((src) => {
  const scene = street.scene3;
  const fn = new Function("o", "THREE", `return (${src})(o)`);
  let n = 0;
  scene.traverse((o) => { if (o.visible && fn(o)) { o.visible = false; (window.__hid ??= []).push(o); n++; } });
  return n;
}, src);
const unhide = () => p.evaluate(() => { for (const o of window.__hid ?? []) o.visible = true; window.__hid = []; });
const render = async (v, name) => {
  await p.evaluate((v) => capture.shot(v), v);
  await p.evaluate(async () => { for (let i = 0; i < 20; i++) capture.step(1 / 30); });
  await sleep(300);
  const f = `${OUT}/halo-${name}.jpg`;
  await p.screenshot({ path: f, type: "jpeg", quality: 80 });
  return f;
};
const hasScene = await p.evaluate(() => !!(street.scene3));
console.log("scene", hasScene);
const SUSPECTS = process.env.ONLY ? { none: null, villa: `(o) => o.name === "keys:villa"` } : {
  none: null,
  villa: `(o) => o.name === "keys:villa"`,
  glass: `(o) => o.isMesh && o.material?.isMeshPhysicalMaterial && o.parent?.name?.startsWith("keys:villa") && o.material.opacity > 0.3`,
  rail: `(o) => o.isMesh && o.material?.isMeshPhysicalMaterial && o.parent?.name?.startsWith("keys:villa") && o.material.opacity < 0.3`,
  water: `(o) => o.isMesh && o.parent?.name === "keys:villa" && o.renderOrder === 3`,
  yacht: `(o) => o.name?.startsWith?.("yacht")`,
  glows: `(o) => o.isMesh && o.parent?.name?.startsWith("keys:villa") && o.material?.isMeshBasicMaterial`,
  lights: `(o) => o.isLight && !o.isAmbientLight && !o.isHemisphereLight && !o.isDirectionalLight && o.getWorldPosition(new o.position.constructor()).distanceTo(new o.position.constructor(295, 1, 622)) < 60`,
  moon: `(o) => o.isDirectionalLight`,
};
if (process.env.LIGHTS) {
  const view = VIEWS[SHOTS[0]];
  const base = await white(await render(view, "l-base"));
  console.log("base", base.toFixed(4));
  const near = await p.evaluate(() => street.city.lamps.filter((l) => l.pos.x > 240 && l.pos.x < 345 && l.pos.z > 596 && l.pos.z < 650).map((l) => [+l.pos.x.toFixed(1), +l.pos.y.toFixed(1), +l.pos.z.toFixed(1), l.intensity ?? 14]));
  console.log("lamps by the villa", JSON.stringify(near));
  const tests = {
    env: "() => { window.__env = street.scene3.environment; street.scene3.environment = null; return () => (street.scene3.environment = window.__env); }",
    points: "() => { const ls = []; street.scene3.traverse((o) => { if (o.isPointLight || o.isSpotLight) ls.push([o, o.intensity]); }); for (const [o] of ls) o.intensity = 0; window.__pl = ls; const f = () => { for (const [o] of window.__pl) o.intensity = 0; }; window.__plT = setInterval(f, 5); return () => { clearInterval(window.__plT); for (const [o, i] of window.__pl) o.intensity = i; }; }",
    hemi: "() => { const ls = []; street.scene3.traverse((o) => { if (o.isHemisphereLight || o.isAmbientLight) ls.push([o, o.intensity]); }); for (const [o] of ls) o.intensity = 0; return () => { for (const [o, i] of ls) o.intensity = i; }; }",
    sun: "() => { const ls = []; street.scene3.traverse((o) => { if (o.isDirectionalLight) ls.push([o, o.intensity]); }); for (const [o] of ls) o.intensity = 0; return () => { for (const [o, i] of ls) o.intensity = i; }; }",
  };
  for (const [name, src] of Object.entries(tests)) {
    await p.evaluate((src) => { window.__undo = eval(src)(); }, src);
    // (stepping by hand: the pool's lights would be put back by the lamps' own update)
    await p.evaluate((v) => capture.shot(v), view);
    await p.evaluate(async () => { for (let i = 0; i < 20; i++) { if (window.__pl) for (const [o] of window.__pl) o.intensity = 0; capture.step(1 / 30); } });
    const f = `${OUT}/halo-l-${name}.jpg`;
    await p.screenshot({ path: f, type: "jpeg", quality: 80 });
    console.log(name.padEnd(8), "white", (await white(f)).toFixed(4));
    await p.evaluate(() => { window.__undo?.(); window.__pl = null; });
  }
} else if (process.env.EACH) {
  // one mesh of the villa at a time
  const list = await p.evaluate(() => {
    const out = [];
    street.scene3.getObjectByName("keys:villa").traverse((o) => {
      if (!o.isMesh) return;
      if (false && o.material.color?.getHexString() !== "ffffff") return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox, w = o.parent.position;
      const u = o.material.userData?.shader?.uniforms ?? o.material.uniforms ?? null;
      out.push({ uuid: o.uuid, parent: o.parent.name, mat: o.material.type, color: o.material.color?.getHexString(), metal: o.material.metalness, rough: o.material.roughness, tris: (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3, box: [+(bb.min.x + 295).toFixed(1), +(bb.max.x + 295).toFixed(1), +bb.min.y.toFixed(2), +bb.max.y.toFixed(2), +(bb.min.z + 624).toFixed(1), +(bb.max.z + 624).toFixed(1)], keys: Object.keys(o.material.userData ?? {}).join(","), name: o.material.name });
    });
    return out;
  });
  const view = VIEWS[SHOTS[0]];
  const base = await white(await render(view, "each-base"));
  console.log("base", base.toFixed(4), "meshes", list.length);
  for (const m of list) {
    await p.evaluate((u) => { const o = street.scene3.getObjectByProperty("uuid", u); o.visible = false; }, m.uuid);
    const f = await render(view, "each");
    const w = await white(f);
    await p.evaluate((u) => { const o = street.scene3.getObjectByProperty("uuid", u); o.visible = true; }, m.uuid);
    if (Math.abs(w - base) > 0.0003 || process.env.ALLLOG) console.log("DROP", (base - w).toFixed(4), JSON.stringify(m));
  }
} else
for (const view of SHOTS) {
  for (const [name, src] of Object.entries(SUSPECTS)) {
    let n = 0;
    if (src) n = await hide(src);
    const f = await render(VIEWS[view], `${view}-${name}`);
    console.log(view, name.padEnd(8), "hidden", String(n).padStart(4), "white", (await white(f)).toFixed(4));
    await unhide();
  }
}
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
