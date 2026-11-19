// node shots/_raycheck.mjs [url]: once the city is up and drawn, a ray straight down onto every mesh of the
// scene (its bounds' centre) and clicks over the screen: no errors once the meshes' arrays are dropped
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/?debug"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", async (m) => { if (m.type() !== "error") return; const a = m.args()[1]; errs.push(a ? await a.evaluate((e) => String(e?.stack ?? e)).catch(() => m.text()) : m.text()); });
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street, { timeout: 240000, polling: 100 });
await new Promise((r) => setTimeout(r, 8000));
const r = await p.evaluate(() => {
  const THREE = street.scene3.constructor; // (only for the type)
  const ray = street.ray;
  let meshes = 0, hits = 0, dropped = 0, fails = [];
  street.scene3.traverse((o) => {
    if (!o.isMesh || o.isBatchedMesh || o.isInstancedMesh || !o.geometry.boundingSphere) return;
    meshes++;
    if (o.geometry.attributes.normal && !o.geometry.attributes.normal.array?.length) dropped++;
    const c = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
    ray.set(c.clone().setY(c.y + 500), c.clone().set(0, -1, 0));
    try { if (ray.intersectObject(o, false).length) hits++; } catch (e) { if (fails.length < 5) fails.push(String(e.message)); }
  });
  return { meshes, dropped, hits, fails };
});
console.log(JSON.stringify(r));
// clicks over the screen (the map's picking: people, buses, shops, venues)
for (let i = 0; i < 40; i++) await p.mouse.click(80 + ((i * 137) % 1280), 120 + ((i * 89) % 640));
await new Promise((r) => setTimeout(r, 1500));
console.log("errors:", errs.length, errs.slice(0, 5).join(" | "));
await b.close();
