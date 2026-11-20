// Who makes what keeps growing: textures, geometries, materials and programs created after the city
// settled and still alive (uploaded, not disposed) minutes later, grouped by the source line that made
// them; and the DOM containers that grow.
// node who.mjs <url> <minutes=5> [burst=0]
import puppeteer from "puppeteer-core";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
const [URL0 = "https://localhost:3016/", MIN = "5", BURST = "0"] = process.argv.slice(2);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--ignore-certificate-errors", "--js-flags=--expose-gc", "--disable-background-timer-throttling"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
const cdp = await p.createCDPSession();
await p.goto(URL0 + "?debug&quality=1&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.onFoot, { timeout: 240000, polling: 300 });
await wait(60000);
await p.evaluate(() => {
  const st = window.street;
  const W = (window.__who = { tex: [], geo: [], mat: [], progs0: new Set(st.renderer.info.programs.map((x) => x.cacheKey)), dom0: new Map() });
  const where = () => {
    const s = (new Error().stack ?? "").split("\n").slice(2);
    // the first frames outside three.js
    const out = [];
    for (const l of s) {
      if (/three\.(module|core)|BufferGeometryUtils|<anonymous>/.test(l)) continue;
      out.push(l.trim());
      if (out.length >= 6) break;
    }
    return out.join(" < ");
  };
  let tex = null, geo = null, mat = null;
  st.scene3.traverse((o) => {
    if (o.isMesh && !geo) geo = o.geometry;
    for (const m of [].concat(o.material ?? [])) {
      if (!mat) mat = m;
      if (m.map && !tex) tex = m.map;
    }
  });
  const protoWith = (o, k) => {
    for (let x = Object.getPrototypeOf(o); x; x = Object.getPrototypeOf(x)) if (Object.getOwnPropertyDescriptor(x, k)) return x;
    return null;
  };
  // Texture: its constructor sets `image` (an accessor)
  const TP = protoWith(tex, "image");
  const d = Object.getOwnPropertyDescriptor(TP, "image");
  const seen = new WeakSet();
  Object.defineProperty(TP, "image", {
    get: d.get,
    set(v) {
      if (!seen.has(this)) {
        seen.add(this);
        W.tex.push({ ref: new WeakRef(this), at: where(), t: performance.now() });
      }
      d.set.call(this, v);
    },
    configurable: true,
  });
  const GP = protoWith(geo, "setAttribute");
  const sa = GP.setAttribute;
  const gseen = new WeakSet();
  GP.setAttribute = function (...a) {
    if (!gseen.has(this)) {
      gseen.add(this);
      W.geo.push({ ref: new WeakRef(this), at: where(), t: performance.now() });
    }
    return sa.apply(this, a);
  };
  const MP = protoWith(mat, "setValues");
  const sv = MP.setValues;
  const mseen = new WeakSet();
  MP.setValues = function (...a) {
    if (!mseen.has(this)) {
      mseen.add(this);
      W.mat.push({ ref: new WeakRef(this), at: where(), t: performance.now() });
    }
    return sv.apply(this, a);
  };
  for (const P of [TP, GP, MP]) {
    const dis = P.dispose;
    P.dispose = function (...a) {
      this.__disposed = true;
      return dis.apply(this, a);
    };
  }
  // the DOM: descendants under each element with a class, at the start
  const count = () => {
    const m = new Map();
    for (const el of document.querySelectorAll("body *")) {
      const k = (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : el.tagName);
      m.set(k, (m.get(k) ?? 0) + el.children.length);
    }
    return m;
  };
  W.count = count;
  W.dom0 = count();
});
const end = Date.now() + Number(MIN) * 60000;
if (Number(BURST)) {
  await p.evaluate(async (N) => {
    const st = window.street;
    const base = st.game.clock.last;
    if (!base) return;
    let h = st.game.clock.height;
    for (let i = 0; i < N; i++) {
      const blk = { ...base, height: ++h, hash: `burst${h}`, time: new Date().toISOString(), txs: base.txs.map((t) => ({ ...t, txid: `${t.txid.slice(0, 40)}${h}${i}` })) };
      st.director.block(blk);
      st.game.clock.feed(blk);
      await new Promise((r) => setTimeout(r, 333));
    }
  }, Number(BURST));
}
while (Date.now() < end) await wait(10000);
await cdp.send("HeapProfiler.collectGarbage");
await wait(1000);
await cdp.send("HeapProfiler.collectGarbage");
const r = await p.evaluate(() => {
  const st = window.street;
  const W = window.__who;
  const group = (list, live) => {
    const m = new Map();
    let n = 0;
    for (const x of list) {
      const o = x.ref.deref();
      if (!o || !live(o)) continue;
      n++;
      m.set(x.at, (m.get(x.at) ?? 0) + 1);
    }
    return { n, made: list.length, top: [...m].sort((a, b) => b[1] - a[1]).slice(0, 14) };
  };
  const tex = group(W.tex, (t) => !t.__disposed);
  const geo = group(W.geo, (g) => !g.__disposed);
  const mat = group(W.mat, (m) => !m.__disposed);
  const progs = st.renderer.info.programs.filter((x) => !W.progs0.has(x.cacheKey)).map((x) => `${x.name} ×${x.usedTimes} ${x.cacheKey.slice(0, 160).replace(/\n/g, " ")}`);
  const dom = [];
  const now = W.count();
  for (const [k, v] of now) if (v - (W.dom0.get(k) ?? 0) > 3) dom.push([k, (W.dom0.get(k) ?? 0), v]);
  return { tex, geo, mat, progs, dom: dom.sort((a, b) => b[2] - b[1] - (a[2] - a[1])).slice(0, 12), info: st.renderer.info.memory };
});
const maps = new Map();
async function src(line) {
  const out = [];
  for (const part of line.split(" < ")) {
    const m = part.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/);
    if (!m) {
      out.push(part.slice(0, 60));
      continue;
    }
    if (!maps.has(m[1])) maps.set(m[1], await fetch(m[1] + ".map").then((r) => (r.ok ? r.json().then((j) => new TraceMap(j)) : null), () => null));
    const tm = maps.get(m[1]);
    const o = tm ? originalPositionFor(tm, { line: Number(m[2]), column: Number(m[3]) - 1 }) : null;
    out.push(o?.source ? `${o.source.replace(/^(\.\.\/)+/, "").replace(/^src\//, "")}:${o.line}` : `${m[1].split("/").pop()}:${m[2]}`);
  }
  return out.join(" < ");
}
for (const k of ["tex", "geo", "mat"]) {
  console.log(`\n== ${k}: made ${r[k].made} since, alive ${r[k].n}`);
  for (const [at, n] of r[k].top) console.log(`  ${String(n).padStart(5)}  ${await src(at)}`);
}
console.log(`\n== new programs: ${r.progs.length}`);
for (const x of r.progs.slice(0, 60)) console.log("  ", x);
console.log("\n== DOM growing (children under):", JSON.stringify(r.dom));
console.log("info", JSON.stringify(r.info));
await b.close();
