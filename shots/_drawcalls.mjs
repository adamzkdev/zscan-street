// node shots/_drawcalls.mjs: draw calls, triangles and shader programs in one whole frame (every pass) at a few spots
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&cpu=0");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [name, x, z, h] of [["wallst", 150, 8, 1.57]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h);
  await sleep(4000);
  for (const k of (process.env.NAPS ?? "").split(",").filter(Boolean)) {
    await p.evaluate(async (k) => { const m = await import("/src/scene/matrices.ts"); m.naps.every = +k; }, k);
    await sleep(2000);
    const c = await p.evaluate(async () => { const R = street.gta.host.renderer; R.info.autoReset = false; R.info.reset(); await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(res)))); const n = R.info.render.calls; R.info.autoReset = true; return n; });
    console.log("naps", k, "calls/3 frames", c);
  }
  const r = await p.evaluate(async () => {
    const R = street.gta.host.renderer;
    R.info.autoReset = false;
    R.info.reset();
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const i = { calls: R.info.render.calls, tris: R.info.render.triangles, programs: R.info.programs.length };
    R.info.autoReset = true;
    // (one frame's draws by who drew them: the object's name or its nearest named parent's)
    const by = new Map();
    const orig = R.renderBufferDirect;
    R.renderBufferDirect = function (cam, scene, geo, mat, obj, grp) {
      let o = obj, n = "";
      for (let k = 0; o && k < 14 && !n; k++, o = o.parent) n = o.name;
      if (!n) n = "?" + (obj.isInstancedMesh ? "inst" : obj.isBatchedMesh ? "batch" : obj.type) + ":" + (mat.name || mat.type) + ":" + (obj.parent?.type ?? "-") + ":" + (obj.parent?.parent?.type ?? "-");
      const key = (n || "?") + (cam.isOrthographicCamera ? " [shadow]" : "");
      by.set(key, (by.get(key) ?? 0) + 1);
      if (key.startsWith(window.__want ?? "?Mesh:MeshStandardMaterial:Group:Group") && (window.__samp ??= []).length < 12 && Math.random() < 0.05) {
        const wp = obj.getWorldPosition(new obj.position.constructor());
        const chain = [];
        for (let q = obj; q; q = q.parent) chain.push(q.type + (q.name ? "(" + q.name + ")" : "") + (q.userData && Object.keys(q.userData).length ? "{" + Object.keys(q.userData).join(",") + "}" : ""));
        window.__samp.push({ geo: geo.type, verts: geo.attributes.position?.count, map: !!mat.map, color: mat.color?.getHexString?.(), transparent: mat.transparent, at: [Math.round(wp.x), Math.round(wp.y), Math.round(wp.z)], chain: chain.slice(0, 6).join(" < ") });
      }
      return orig.apply(this, arguments);
    };
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    R.renderBufferDirect = orig;
    i.top = [...by].sort((a, b) => b[1] - a[1]).slice(0, 8);
    i.samp = window.__samp;
    // per mesh: who draws most in view (by material name / object name)
    return i;
  });
  console.log(name, JSON.stringify(r));
}
await b.close();
