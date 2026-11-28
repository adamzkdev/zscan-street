// node shots/_baysim.mjs [minutes]: the city's and the bridge's traffic stepped on their own (synchronously) for game minutes:
// at the Golden Gate's city end, the longest any bridge car or city car stands still, and why (what is "ahead" of it)
import puppeteer from "puppeteer-core";
const MIN = +(process.argv[2] ?? 20);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 960, height: 540 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&solo");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const r = await p.evaluate((MIN) => {
  const g = street.gta, gg = street.goldenGate, ct = g.host.traffic;
  g.player.place(150, 0.2, 110, -Math.PI / 2);
  const X = 158, BR = 136, dt = 1 / 60;
  const chains = [];
  const still = new Map(), cityStill = new Map(), why = [];
  let worst = 0, worstCity = 0, over10 = 0, through = new Set(), throws = 0, first = "";
  const r1 = (v) => +v.toFixed(1);
  const culprits = (c, fx, fz, self) => {
    const out = [];
    for (const o of gg.cars) { if (o === self) continue; const dx = o.x - c.x, dz = o.z - c.z, al = dx * fx + dz * fz, ac = Math.abs(-dx * fz + dz * fx); if (al > 0 && al < 18 && ac < 1.5) out.push({ t: "bridge", x: r1(o.x), z: r1(o.z), yaw: r1(o.yaw), cur: r1(o.cur), along: r1(al), across: r1(ac) }); }
    for (const m of ct.movers) { if (m === self) continue; const q = m.group.position, dx = q.x - c.x, dz = q.z - c.z, al = dx * fx + dz * fz, ac = Math.abs(-dx * fz + dz * fx); if (al > -3 && al < 14 && ac < 1.7) out.push({ t: "city", x: r1(q.x), z: r1(q.z), yaw: r1(m.group.rotation.y), v: r1(m.v), bend: !!m.bend, along: r1(al), across: r1(ac) }); }
    for (const o of gg.blockers()) { const dx = o.x - c.x, dz = o.z - c.z, al = dx * fx + dz * fz, ac = Math.abs(-dx * fz + dz * fx); if (al > -1 && al < 14 && ac < 1.7 && !(Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01)) out.push({ t: "ggBlocker", x: r1(o.x), z: r1(o.z), along: r1(al), across: r1(ac) }); }
    for (const o of ct.blockers()) { const dx = o.x - c.x, dz = o.z - c.z, al = dx * fx + dz * fz, ac = Math.abs(-dx * fz + dz * fx); if (al > -1 && al < 14 && ac < 1.7 && !(Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01)) out.push({ t: "ctBlocker", x: r1(o.x), z: r1(o.z), along: r1(al), across: r1(ac) }); }
    return out;
  };
  const steps = MIN * 3600;
  for (let i = 0; i < steps; i++) {
    try { ct.update(dt); gg.update(dt); } catch (e) { throws++; if (!first) first = String(e?.stack).slice(0, 500); }
    if (i % 6) continue;
    const t = 0.1;
    for (const c of gg.cars) {
      if (Math.abs(c.x - X) > 35 || Math.abs(c.z - BR) > 30) { still.delete(c); continue; }
      through.add(c);
      const s = c.cur < 0.2 ? (still.get(c) ?? 0) + t : 0;
      still.set(c, s);
      worst = Math.max(worst, s);
      if (s > 30 && s < 30.1 && chains.length < 3) {
        // the chain: whoever it waits for, and whoever that one waits for, to the head of the jam
        const chain = [];
        let cur = c;
        for (let k = 0; k < 12 && cur; k++) {
          const a = culprits(cur, Math.cos(cur.yaw), -Math.sin(cur.yaw), cur);
          chain.push({ x: r1(cur.x), z: r1(cur.z), yaw: r1(cur.yaw), cur: r1(cur.cur), s: r1(cur.s), len: r1(cur.path.length), ahead: a.slice(0, 4) });
          const nb = a.filter((q) => q.t === "bridge").sort((p, q) => p.along - q.along)[0];
          cur = nb ? gg.cars.find((o) => r1(o.x) === nb.x && r1(o.z) === nb.z) : null;
        }
        chains.push({ at: r1(i / 60), chain });
      }
      if (s > 10 && s < 10.1) {
        over10++;
        if (why.length < 5) why.push({ at: r1(i / 60), kind: "bridge", car: { x: r1(c.x), z: r1(c.z), yaw: r1(c.yaw), s: r1(c.s), sIn: c.loop.sIn, sOut: c.loop.sOut }, ahead: culprits(c, Math.cos(c.yaw), -Math.sin(c.yaw), c) });
      }
    }
    for (const m of ct.movers) {
      const q = m.group.position;
      if (Math.abs(q.x - X) > 35 || Math.abs(q.z - BR) > 8) { cityStill.delete(m); continue; }
      const s = m.v < 0.2 && !m.held ? (cityStill.get(m) ?? 0) + t : 0;
      cityStill.set(m, s);
      worstCity = Math.max(worstCity, s);
      if (s > 15 && s < 15.1 && why.length < 8) why.push({ at: r1(i / 60), kind: "city", car: { x: r1(q.x), z: r1(q.z), yaw: r1(m.group.rotation.y), bend: !!m.bend, axis: m.line.axis, at: m.line.at, s: r1(m.s), dir: m.dir, next: m.next ? [r1(m.next.sIn), m.next.dir] : null, jn: m.line.junctions.map((j) => [r1(j.at), ct.greenAt(m.line.axis, m.line.axis === "x" ? j.at : m.line.at, m.line.axis === "x" ? m.line.at : j.at)]) }, ahead: culprits({ x: q.x, z: q.z }, Math.cos(m.group.rotation.y), -Math.sin(m.group.rotation.y), m) });
    }
  }
  return { minutes: MIN, throws, first, bridgeCarsThrough: through.size, longestStillBridge: r1(worst), bridgeStillOver10s: over10, longestStillCity: r1(worstCity), why, chains };
}, MIN);
console.log(JSON.stringify({ ...r, why: undefined, chains: undefined }));
for (const w of r.why.filter((w) => w.kind === "city")) console.log("WHY", JSON.stringify(w));
for (const c of r.chains) { console.log("CHAIN at", c.at); for (const k of c.chain) console.log("  ", JSON.stringify(k)); }
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
