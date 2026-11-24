// node shots/_drawprof.mjs [SPOTS env]: who draws what — every draw call of a frame grouped by the nearest named ancestor
// (main pass and shadow pass apart), with triangles, plus uncapped fps; for the performance work
import puppeteer from "puppeteer-core";
const QS = process.env.QS ? "&" + process.env.QS : "";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day" + QS);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate((t) => { street.gta.hud.coach(-1); window.__byTris = t; }, !!process.env.BYTRIS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(Number(process.env.WAIT ?? 20000));
const SPOTS = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [["woods", 190, 214, 1.5], ["heart", 0, 3.5, -1.57], ["wallst", 150, 8, 1.57]];
for (const [name, x, z, h] of SPOTS) {
  await p.evaluate((x, z, h) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h);
  await sleep(6000);
  const fps = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
  const prof = await p.evaluate(async () => {
    const r = street.composer.renderer;
    const orig = r.renderBufferDirect;
    const stats = { main: new Map(), shadow: new Map(), other: new Map(), branch: new Map() };
    const sc = street.scene3;
    const label = (o) => {
      const names = [];
      for (let q = o; q && names.length < 3; q = q.parent) if (q.name) names.push(q.name);
      // the top-level branch it hangs from (a child of the scene), by index when unnamed
      let top = o;
      while (top.parent && top.parent !== sc) top = top.parent;
      const ti = top.parent === sc ? sc.children.indexOf(top) : -1;
      const depth = (() => { let d = 0; for (let q = o; q && q !== sc; q = q.parent) d++; return d; })();
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const img = m?.map?.image;
      const src = img ? (img.src ? img.src.split("/").slice(-2).join("/").slice(0, 40) : img.width ? `canvas${img.width}x${img.height}` : "img") : "";
      const mk = m ? (m.name || m.userData?.real || m.userData?.realGround || (m.map ? "map:" + src : "") || m.type.replace("Material", "")) : "";
      const par = o.parent ? (o.parent.name || o.parent.type) + "(" + o.parent.children.length + ")" : "";
      return `${names.reverse().join("/") || "∅"} [top#${ti}:${top.name || top.type}${top.children ? "(" + top.children.length + ")" : ""} d${depth} <${par}> ${o.geometry?.type ?? ""}] ${o.isInstancedMesh ? "inst" : o.isBatchedMesh ? "batch" : o.type} ${mk}`;
    };
    r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      const pass = scene === null ? "shadow" : scene === street.scene3 ? "main" : "other";
      const k = label(object);
      if (pass === "main") {
        // by branch: the scene's child, and its child under the city's group
        let a = object, b = null;
        while (a.parent && a.parent !== sc) ((b = a), (a = a.parent));
        const bk = a === sc.children[4] && b ? `city/${b.name || b.type}(${b.children.length})${b.userData?.kind ? ":" + b.userData.kind : ""}` : `${a.name || a.type}#${sc.children.indexOf(a)}`;
        const bs = stats.branch.get(bk) ?? { calls: 0, tris: 0, objs: new Set() };
        bs.calls++;
        bs.objs.add(object);
        stats.branch.set(bk, bs);
      }
      const s = stats[pass].get(k) ?? { calls: 0, tris: 0 };
      s.calls++;
      const idx = geometry.index;
      let n = (idx ? idx.count : geometry.attributes.position?.count ?? 0) / 3;
      if (group) n = group.count / 3;
      if (object.isInstancedMesh) n *= object.count;
      if (object.isBatchedMesh) n = 0;
      s.tris += n;
      stats[pass].set(k, s);
      return orig.apply(this, arguments);
    };
    await new Promise((res) => requestAnimationFrame(res));
    r.renderBufferDirect = orig;
    const top = (m) => [...m.entries()].sort((a, b) => (window.__byTris ? b[1].tris - a[1].tris : b[1].calls - a[1].calls)).slice(0, Number(window.__top ?? 30)).map(([k, v]) => `${String(v.calls).padStart(4)} ${String(Math.round(v.tris / 1000)).padStart(5)}k  ${k}`);
    const sum = (m) => [...m.values()].reduce((a, v) => ({ calls: a.calls + v.calls, tris: a.tris + v.tris }), { calls: 0, tris: 0 });
    const q = street.quality ?? null;
    const t = street.thrift;
    const uses = new Map();
    sc.traverse((o) => { if (o.isMesh && !Array.isArray(o.material)) uses.set(o.material, (uses.get(o.material) ?? 0) + 1); });
    const details = [...stats.branch.entries()].filter(([k]) => k.startsWith("city/")).sort((a, b) => b[1].calls - a[1].calls).slice(0, 3).map(([k, v]) => k + "\n     " + [...v.objs].slice(0, 12).map((o) => { const m = o.material; return `${o.type}${o.name ? ":" + o.name : ""} ${m?.type}/${m?.name || m?.userData?.realSlot || m?.userData?.real || ""} uses ${uses.get(m)} refused ${t?.refused?.has(o)} batch ${!!o.userData.cityBatch} hook ${!!m && m.onBeforeCompile.toString().length > 30} tr ${m?.transparent} at ${o.alphaTest ?? m?.alphaTest} ${o.geometry?.attributes?.position?.count}v`; }).join("\n     "));
    return { details, q: JSON.stringify(window.__q ?? null), mainSum: sum(stats.main), shadowSum: sum(stats.shadow), otherSum: sum(stats.other), main: top(stats.main), shadow: top(stats.shadow).slice(0, 10), other: top(stats.other).slice(0, 6), branch: [...stats.branch.entries()].sort((a, b) => b[1].calls - a[1].calls).slice(0, 25).map(([k, v]) => `${String(v.calls).padStart(4)}  ${k}`) };
  });
  console.log(`\n=== ${name} fps ${fps}  main ${prof.mainSum.calls} calls ${Math.round(prof.mainSum.tris / 1e3)}k tris · shadow ${prof.shadowSum.calls} calls ${Math.round(prof.shadowSum.tris / 1e3)}k · other ${prof.otherSum.calls}`);
  console.log(" main:\n  " + prof.main.join("\n  "));
  console.log(" by branch:\n  " + prof.branch.join("\n  "));
  console.log(" top branches:\n  " + prof.details.join("\n  "));
  console.log(" shadow:\n  " + prof.shadow.join("\n  "));
  console.log(" other:\n  " + prof.other.join("\n  "));
}
await b.close();
