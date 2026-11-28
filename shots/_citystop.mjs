// node shots/_citystop.mjs [URL]: the city's traffic (src/scene/citytraffic.ts) and your car stopped in its lane — (A) in the
// lane, along it; (B) across it. The cars coming up stop behind you (never into you), honk, then go round you (back up
// if they must, out by the kerb's side or over the middle when nothing is coming) and back into their lane past you.
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day"] = process.argv.slice(2);
const WAIT = +(process.env.WAIT ?? 45);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 960, height: 540 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3000);
await p.evaluate(() => {
  const g = street.gta;
  g.hud.coach(-1);
  g.heat.raise = () => {};
  const c = g.parked.find((x) => x.kind === "gt") ?? g.parked[0];
  g.player.place(c.group.position.x - 1.5, 0.2, c.group.position.z + 1.6, 0);
  g.input.tap("KeyF");
});
await p.waitForFunction(() => !!street.gta.car, { timeout: 10000, polling: 100 });
await sleep(1000);
let fails = 0;
const ok = (c, what, extra = "") => { if (!c) fails++; console.log(c ? "ok  " : "FAIL", what, extra); };

/** Your car stopped in a city lane (mid-block, a long way from the street's end), turned by `turn` off the lane's way. */
const scene = (turn) =>
  p.evaluate(async (turn, WAIT) => {
    const g = street.gta, ct = street.cityTraffic;
    if (!g.car) return { lost: "out of the car before the scene", busted: g.busts ?? null };
    const lines = ct.lines;
    // a long street, and a spot on it mid-block with 120 m of it behind (where the traffic comes from)
    let pick = null;
    // (an east–west street, not Bay Road — the ring's south side, the bridge's cars on it too)
    const south = Math.max(...lines.filter((l) => l.axis === "x").map((l) => l.at));
    for (const L of lines.filter((l) => l.axis === "x" && l.at !== south).sort(() => Math.random() - 0.5)) {
      for (const dir of Math.random() < 0.5 ? [1, -1] : [-1, 1]) {
        for (let k = 0; k < 40 && !pick; k++) {
          const s = L.from + 140 + Math.random() * (L.to - L.from - 280);
          if (L.junctions.some((j) => Math.abs(j.at - s) < j.half + 14)) continue;
          if (L.axis === "z" && Math.abs(s - 0) < 60) continue;
          pick = { L, dir, s };
        }
        if (pick) break;
      }
      if (pick) break;
    }
    const { L, dir, s } = pick;
    // its lane's middle (one car of the traffic tells: the lanes' offset off the centre line)
    const probe = [...ct.movers].find((m) => m.line === L && m.dir === dir);
    const off = probe ? Math.abs(probe.laneMid - L.at) : 3.2;
    const mid = L.axis === "x" ? L.at + (dir > 0 ? off : -off) : L.at + (dir > 0 ? -off : off);
    const yaw0 = L.axis === "x" ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    const [x, z] = L.axis === "x" ? [s, mid] : [mid, s];
    g.car.place(x, z, yaw0 + turn);
    g.cam.behind(yaw0 + turn - Math.PI / 2, -0.15);
    g.input.stick.x = 0;
    g.input.stick.y = 0;
    // (the lane cleared ahead of the spot and a few cars sent up behind it)
    for (const m of [...ct.movers]) if (m.line === L && m.dir === dir && (m.s - s) * dir > -25 && (m.s - s) * dir < 40 && !m.bend) m.s = s - dir * (60 + Math.random() * 40), m.place();
    // (and three cars sent up behind it: cars from elsewhere put in its lane, 45, 60 and 75 m back)
    const sent = [...ct.movers].filter((m) => !m.bend && m.kind !== "police" && m.kind !== "moto" && !(m.line === L)).slice(0, 3);
    sent.forEach((m, i) => { m.next = null; m.setLine(L, dir, s - dir * (45 + 15 * i)); m.v = 6; });
    const fx = Math.cos(yaw0), fz = -Math.sin(yaw0);
    const me = { hl: g.car.spec.len / 2, hw: g.car.spec.wid / 2 };
    const ext = (m) => [m.len / 2, m.kind === "moto" ? 0.42 : 0.95];
    const t0 = performance.now();
    const seen = new Map();
    const hits = [], jumps = [];
    let rammed = 0, worstOverlap = 0, drift = 0, honked = 0, rounded = 0, passed = 0, worstStill = 0, maxBack = 0;
    const start = [x, z];
    while (performance.now() - t0 < WAIT * 1000) {
      await new Promise((r) => setTimeout(r, 100));
      const P = g.car.group.position;
      const dNow = Math.hypot(P.x - start[0], P.z - start[1]);
      if (dNow > drift + 0.05 && jumps.length < 8) {
        const near = [];
        for (const m of ct.movers) { const q = m.group.position; const d = Math.hypot(q.x - P.x, q.z - P.z); if (d < 7) near.push({ d: +d.toFixed(2), same: m.line === L && m.dir === dir, v: +m.v.toFixed(1), lat: +m.lat.toFixed(2), stage: m.round?.stage ?? "-" }); }
        jumps.push({ t: +((performance.now() - t0) / 1000).toFixed(1), d: +dNow.toFixed(2), hit: g.car.hit ? { s: +g.car.hit.speed.toFixed(1), what: g.car.hit.what } : null, near, other: [...street.gta.parked].filter((c) => c !== g.car && Math.hypot(c.group.position.x - P.x, c.group.position.z - P.z) < 7).length });
      }
      drift = Math.max(drift, dNow);
      g.car.vel.set(0, 0);
      for (const m of ct.movers) {
        if (m.line !== L || m.dir !== dir || m.bend) continue;
        const rel = (m.s - s) * dir;
        if (rel < -70 || rel > 40) continue;
        let st = seen.get(m);
        if (!st) seen.set(m, (st = { still: 0, honk: false, round: false, passed: false, first: rel }));
        st.still = m.v < 0.2 ? st.still + 0.1 : 0;
        worstStill = Math.max(worstStill, st.still);
        if (m.blocked > 0.5) st.honk = true;
        if (m.round) st.round = true;
        if (m.v < -0.1) maxBack = Math.max(maxBack, -m.v);
        if (rel > me.hl + m.len / 2 + 2 && st.first < 0 && !st.passed) st.passed = true;
        // overlap of its body with yours (separating axes, both turned)
        const q = m.group.position;
        const dx = q.x - P.x, dz = q.z - P.z;
        const A = [[Math.cos(g.car.yaw), -Math.sin(g.car.yaw)], [Math.sin(g.car.yaw), Math.cos(g.car.yaw)]];
        const my = m.group.rotation.y;
        const B = [[Math.cos(my), -Math.sin(my)], [Math.sin(my), Math.cos(my)]];
        const ea = [me.hl, me.hw], eb = ext(m);
        let sep = -Infinity;
        for (const ax of [...A, ...B]) {
          const d = Math.abs(dx * ax[0] + dz * ax[1]);
          const ra = ea[0] * Math.abs(A[0][0] * ax[0] + A[0][1] * ax[1]) + ea[1] * Math.abs(A[1][0] * ax[0] + A[1][1] * ax[1]);
          const rb = eb[0] * Math.abs(B[0][0] * ax[0] + B[0][1] * ax[1]) + eb[1] * Math.abs(B[1][0] * ax[0] + B[1][1] * ax[1]);
          sep = Math.max(sep, d - ra - rb);
        }
        if (sep < -0.05) {
          rammed++;
          worstOverlap = Math.max(worstOverlap, -sep);
          if (hits.length < 12) hits.push({ rel: +rel.toFixed(2), v: +m.v.toFixed(2), lat: +m.lat.toFixed(2), latTo: +m.latTo.toFixed(2), tilt: +m.tilt.toFixed(2), stage: m.round?.stage ?? "-", sep: +sep.toFixed(2), kind: m.kind, myV: +g.car.speed.toFixed(2) });
        }
      }
    }
    for (const st of seen.values()) {
      if (st.honk) honked++;
      if (st.round) rounded++;
      if (st.passed) passed++;
    }
    const r1 = (v) => +v.toFixed(2);
    return { street: `${L.axis}${L.at}`, dir, s: r1(s), turn: r1(turn), cars: seen.size, rammedSamples: rammed, worstOverlap: r1(worstOverlap), drift: r1(drift), honked, rounded, passed, worstStill: r1(worstStill), maxBack: r1(maxBack), hits, jumps };
  }, turn, WAIT);

for (const [name, turn] of [["in the lane", 0], ["across the lane", Math.PI / 2 - 0.2]]) {
  const r = await scene(turn);
  console.log(name, JSON.stringify(r));
  ok(r.rammedSamples === 0, `${name}: no car of the traffic drives into yours`, `${r.rammedSamples} samples, ${r.worstOverlap} m deep`);
  ok(r.drift < 0.3, `${name}: your car not shoved`, `${r.drift} m`);
  ok(r.honked > 0, `${name}: the first one honks`, `${r.honked}`);
  ok(r.passed > 0, `${name}: they go round you and on`, `${r.passed} of ${r.cars} passed, ${r.rounded} went round`);
  ok(r.worstStill < 20, `${name}: nobody waits behind you more than 20 s`, `${r.worstStill} s`);
}
await p.screenshot({ path: "shots/gta/jam/citystop.jpg", quality: 70 });
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
console.log(fails ? `${fails} FAILED` : "ALL OK");
await b.close();
