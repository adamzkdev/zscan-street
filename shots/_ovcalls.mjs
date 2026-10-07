// node shots/_ovcalls.mjs [port=3024] [theme=night] [out-prefix]
// Draw calls / triangles / fps per mode (live, overview, on foot) + a breakdown of the overview's
// draw calls by scene branch (counts every mesh actually drawn in one frame via onBeforeRender).
import puppeteer from "puppeteer-core";
const port = process.argv[2] ?? 3024;
const theme = process.argv[3] ?? "night";
const shot = process.argv[4];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: Number(process.env.W ?? 1600), height: Number(process.env.H ?? 1000), deviceScaleFactor: Number(process.env.DPR ?? 1) } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));
await p.goto(`http://localhost:${port}/?debug&quality=0&theme=${theme}`);
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 9000));
await p.evaluate(() => {
  const R = street.renderer;
  const acc = (window.__acc = { calls: 0, tris: 0, passes: 0 });
  const orig = R.render.bind(R);
  R.render = (s, c) => { if (!window.__scene && s.isScene && s.children.length > 20) window.__scene = s; orig(s, c); acc.calls += R.info.render.calls; acc.tris += R.info.render.triangles; acc.passes++; };
});
const measure = async (label) => {
  const r = await p.evaluate(() => new Promise((res) => { requestAnimationFrame(() => { Object.assign(__acc, { calls: 0, tris: 0, passes: 0 }); requestAnimationFrame(() => res({ ...__acc })); }); }));
  const f = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); let worst = 0, last = t0; const f = (now) => { worst = Math.max(worst, now - last); last = now; n++; if (now - t0 < 4000) requestAnimationFrame(f); else res([Math.round(n / 4), Math.round(worst)]); }; requestAnimationFrame(f); }));
  console.log(label.padEnd(10), "fps", f[0], "worst", f[1] + "ms", "calls", r.calls, "tris", (r.tris / 1e6).toFixed(2) + "M", "passes", r.passes);
};
const breakdown = async () => {
  const out = await p.evaluate(() => new Promise((res) => {
    const S = window.__scene; const tally = new Map(); const hooks = [];
    const label = (o) => { const path = []; let x = o; while (x && x !== S) { path.unshift(x); x = x.parent; } const a = path[0], b2 = path[1], c3 = path[2]; const nm = (q) => q ? (q.name || q.type) + (q.isInstancedMesh ? "[I]" : "") : ""; const city = a === street.city.group; const m = Array.isArray(o.material) ? o.material[0] : o.material; return (city ? "CITY" : nm(a)) + " > " + nm(b2) + " > " + nm(c3) + (city ? `  {${o.geometry.type}|${m.type}${m.transparent ? "|T" : ""}${m.map ? "|tex" : ""}|depth${path.length}|sib${o.parent.children.length}}` : ""); };
    S.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) { const prev = o.onBeforeRender; hooks.push([o, prev]); const L = label(o); o.onBeforeRender = function (...a) { const t = tally.get(L) ?? { n: 0, tris: 0, obj: 0 }; t.n++; const g = o.geometry; const cnt = g.index ? g.index.count : g.attributes.position?.count ?? 0; t.tris += (cnt / 3) * (o.isInstancedMesh ? o.count : 1); tally.set(L, t); prev.apply(this, a); }; } });
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const [o, prev] of hooks) o.onBeforeRender = prev; tally.clear(); 
      for (const [o] of hooks) { const L = label(o); const prev = o.onBeforeRender; o.onBeforeRender = function (...a) { const t = tally.get(L) ?? { n: 0, tris: 0 }; t.n++; const g = o.geometry; const cnt = g.index ? g.index.count : g.attributes.position?.count ?? 0; t.tris += (cnt / 3) * (o.isInstancedMesh ? o.count : 1); tally.set(L, t); prev.apply(this, a); }; }
      requestAnimationFrame(() => { for (const [o, prev] of hooks) o.onBeforeRender = prev; res([...tally.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 60).map(([k, v]) => `${String(v.n).padStart(5)} ${(v.tris / 1e3).toFixed(0).padStart(6)}k  ${k}`)); });
    }));
  }));
  console.log(out.join("\n"));
};
await measure("live");
if (shot) await p.screenshot({ path: `${shot}-live-${theme}.png` });
await p.evaluate(() => street.rig.setMode("overview"));
await new Promise((r) => setTimeout(r, 4000));
await measure("overview");
await measure("overview");
if (shot) await p.screenshot({ path: `${shot}-ov-${theme}.png` });
if (process.argv.includes("bd")) await breakdown();
await p.evaluate(() => street.rig.setMode("live"));
await new Promise((r) => setTimeout(r, 3000));
await p.evaluate(() => street.walk(true));
await new Promise((r) => setTimeout(r, 3000));
await measure("onfoot");
await b.close();
