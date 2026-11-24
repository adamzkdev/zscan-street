// node shots/_abtest.mjs: A/B in one session, interleaved (round robin, medians) so the machine's own load cancels out:
// the frame's cost of each part of the picture at the slow spots. VARIANTS env: comma list (see V below).
import puppeteer from "puppeteer-core";
const QS = process.env.QS ? "&" + process.env.QS : "";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 1800000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day" + QS);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => {
  street.gta.hud.coach(-1);
  // material swaps, undone by `restore`
  const saved = new Map();
  const basic = new Map();
  window.__swap = (test) => {
    street.scene3.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
      if (!test(o, o.material)) return;
      if (!saved.has(o)) saved.set(o, o.material);
      const m = saved.get(o);
      let bm = basic.get(m);
      if (!bm) basic.set(m, (bm = new THREE_Basic(m)));
      o.material = bm;
    });
  };
  window.__restore = () => { for (const [o, m] of saved) o.material = m; saved.clear(); };
  // (three is in the page's modules: borrow the constructor from any basic material in the scene)
  let Basic = null;
  street.scene3.traverse((o) => { if (!Basic && o.material?.isMeshBasicMaterial) Basic = o.material.constructor; });
  window.THREE_Basic = function (m) { const b = new Basic({ color: m.color ?? 0x888888, map: m.map ?? null, vertexColors: !!m.vertexColors, transparent: m.transparent, alphaTest: m.alphaTest, side: m.side }); return b; };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = {
  base: ["", ""],
  people: ["street.gta.people.group.visible=false", "street.gta.people.group.visible=true"],
  finish: ["street.finish.enabled=false", "street.finish.enabled=true"],
  shadows: ["street.composer.renderer.shadowMap.autoUpdate=false", "street.composer.renderer.shadowMap.autoUpdate=true"],
  bloom: ["street.composer.passes.forEach(p=>{if(/Bloom/.test(p.constructor.name))p.enabled=false})", "street.composer.passes.forEach(p=>{if(/Bloom/.test(p.constructor.name))p.enabled=true})"],
  passes: ["window.__pe=street.composer.passes.map(p=>p.enabled);street.composer.passes.forEach((p,i)=>{if(i>0)p.enabled=false})", "street.composer.passes.forEach((p,i)=>p.enabled=window.__pe[i])"],
  city: ["street.scene3.children[4].visible=false", "street.scene3.children[4].visible=true"],
  ground: ["__swap((o,m)=>!!m.userData.realGround)", "__restore()"],
  realmat: ["__swap((o,m)=>!!m.userData.real || !!m.userData.realSlot || /real/.test(m.name||''))", "__restore()"],
  allbasic: ["__swap((o,m)=>!o.isInstancedMesh && !o.isBatchedMesh)", "__restore()"],
  std: ["__swap((o,m)=>m.isMeshStandardMaterial && !m.userData.realGround)", "__restore()"],
  phys: ["__swap((o,m)=>m.isMeshPhysicalMaterial)", "__restore()"],
  alpha: ["__swap((o,m)=>m.alphaTest>0||m.transparent)", "__restore()"],
  inst: ["street.scene3.traverse(o=>{if(o.isInstancedMesh&&o.parent&&!/people/.test(o.parent.name))o.userData.__v=o.visible,o.visible=false})", "street.scene3.traverse(o=>{if(o.userData.__v!==undefined)o.visible=o.userData.__v,delete o.userData.__v})"],
  batch: ["street.scene3.traverse(o=>{if(o.isBatchedMesh&&!/people/.test(o.parent?.name??''))o.userData.__v=o.visible,o.visible=false})", "street.scene3.traverse(o=>{if(o.userData.__v!==undefined)o.visible=o.userData.__v,delete o.userData.__v})"],
  props: ["street.scene3.traverse(o=>{if(o.isInstancedMesh&&/real:props/.test(o.name))o.userData.__v=o.visible,o.visible=false})", "street.scene3.traverse(o=>{if(o.userData.__v!==undefined)o.visible=o.userData.__v,delete o.userData.__v})"],
  alive: ["{const a=street.scene3.children[4].getObjectByName('alive');if(a)a.visible=false}", "{const a=street.scene3.children[4].getObjectByName('alive');if(a)a.visible=true}"],
  thrift: ["street.scene3.traverse(o=>{if(o.name==='thrift')o.userData.__v=o.visible,o.visible=false})", "street.scene3.traverse(o=>{if(o.userData.__v!==undefined)o.visible=o.userData.__v,delete o.userData.__v})"],
  ao8: ["street.finish.gtao.defines.SAMPLES=8;street.finish.gtao.needsUpdate=true", "street.finish.gtao.defines.SAMPLES=12;street.finish.gtao.needsUpdate=true"],
  ao3: ["street.finish.aoScale=3;street.finish.setSize(street.finish.fw,street.finish.fh)", "street.finish.aoScale=2;street.finish.setSize(street.finish.fw,street.finish.fh)"],
  noao: ["street.finish.ao=false", "street.finish.ao=true"],
  nossr: ["street.finish.ssr=false", "street.finish.ssr=true"],
  half: ["street.composer.renderer.setPixelRatio(0.7071);street.composer.setPixelRatio(0.7071)", "street.composer.renderer.setPixelRatio(1);street.composer.setPixelRatio(1)"],
};
const names = (process.env.VARIANTS ?? "base,people,finish,shadows,passes,ground,std,alpha,half").split(",");
const measure = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return n / ((performance.now() - t0) / 1000); });
const SPOTS = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [["woods", 190, 214, 1.5], ["heart", 0, 3.5, -1.57], ["wallst", 150, 8, 1.57]];
const ROUNDS = Number(process.env.ROUNDS ?? 4);
for (const [spot, x, z, h] of SPOTS) {
  await p.evaluate((x, z, h) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h);
  await sleep(6000);
  const res = Object.fromEntries(names.map((n) => [n, []]));
  for (let r = 0; r < ROUNDS; r++)
    for (const n of names) {
      const [on, off] = V[n];
      if (on) await p.evaluate(on);
      await sleep(300);
      res[n].push(await measure());
      if (off) await p.evaluate(off);
    }
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(1); };
  const base = med(res.base ?? [0]);
  console.log(spot, names.map((n) => `${n} ${med(res[n])}${n !== "base" && base ? ` (${(1000 / med(res[n]) - 1000 / base).toFixed(1)}ms)` : ""}`).join(" · "));
}
await b.close();
