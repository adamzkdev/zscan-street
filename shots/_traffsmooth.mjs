// node shots/_traffsmooth.mjs [OUT]: how smoothly the street's vehicles move — every rendered frame for ~10 s,
// each tracked vehicle's world position and heading: per-frame speed jitter, heading jumps, teleports, stutters;
// then a contact sheet of a car through a corner (frames to OUT-turn-NN.png). ENV: SECS, SPOT=x,z, SHOTS=0
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/smooth/s"] = process.argv.slice(2);
const SECS = +(process.env.SECS ?? 10);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [sx, sz] = (process.env.SPOT ?? "122,-1").split(",").map(Number);
await p.evaluate((x, z) => { const g = street.gta; g.hud.coach(-1); g.player.place(x + 9, 0.2, z + 9, 0); g.cam.behind(0, -0.1); g.cam.snap(g.player.pos.clone().setY(1.55)); }, sx, sz);
await sleep(6000);
// track: the city traffic nearest the player, the avenue's vehicles, the bridge loop's cars
const res = await p.evaluate(async (secs) => {
  const g = street.gta;
  const me = g.player.pos;
  const pick = [];
  // (every city mover: in ten seconds some reach the ring road and turn)
  const city = [...g.host.traffic.movers].sort((a, b) => a.group.position.distanceTo(me) - b.group.position.distanceTo(me));
  for (const m of city) pick.push({ kind: "city:" + m.kind, o: m.group });
  for (const v of [...street.director.traffic.vehicles].slice(0, 4)) pick.push({ kind: "avenue", o: v.mover.group });
  const gg = street.goldenGate;
  for (const c of (gg.cars ?? []).slice(0, 4)) pick.push({ kind: "bridge", o: c.obj });
  const T = pick.map(() => []);
  const P = new (me.constructor)();
  const Q = new (me.constructor)();
  const frames = [];
  await new Promise((done) => {
    let t0 = -1;
    let last = 0;
    // (the frame's vsync timestamp: what the screen shows, not when this callback happened to run)
    const step = (now) => {
      if (t0 < 0) t0 = last = now;
      if (now > t0) frames.push(now - last);
      last = now;
      pick.forEach((k, i) => {
        if (!k.o.parent) return T[i].push(null);
        k.o.getWorldPosition(P);
        k.o.updateMatrixWorld();
        Q.set(1, 0, 0).transformDirection(k.o.matrixWorld);
        T[i].push([now, P.x, P.y, P.z, Math.atan2(-Q.z, Q.x), k.o.scale.x]);
      });
      if (now - t0 < secs * 1000) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
  const out = [];
  pick.forEach((k, i) => {
    const s = T[i].filter(Boolean);
    if (s.length < 30) return;
    // per frame: distance moved and heading change
    const d = [0], dh = [0];
    for (let j = 1; j < s.length; j++) {
      d.push(Math.hypot(s[j][1] - s[j - 1][1], s[j][3] - s[j - 1][3]));
      dh.push(Math.abs(Math.atan2(Math.sin(s[j][4] - s[j - 1][4]), Math.cos(s[j][4] - s[j - 1][4]))) * 180 / Math.PI);
    }
    let n = 0, jit = 0, stut = 0, tele = 0, maxJump = 0, maxDy = 0, scl = 0, moving = 0, sumV = 0;
    for (let j = 1; j < s.length; j++) {
      const dt = (s[j][0] - s[j - 1][0]) / 1000;
      // (a jump of more than a long frame's worth: 3 m and twice what its speed would carry it)
      if (d[j] > 3 && d[j] > 2 * 30 * ((s[j][0] - s[j - 1][0]) / 1000)) tele++;
      // (per 1/60 s: a late frame turns further, as it should)
      if (d[j] > 0.02) maxJump = Math.max(maxJump, dh[j] * Math.min(1, 16.7 / Math.max(1, s[j][0] - s[j - 1][0])));
      maxDy = Math.max(maxDy, Math.abs(s[j][2] - s[j - 1][2]));
      if (s[j][5] !== 1) scl++;
      if (d[j] > 3) continue;
      sumV += dt > 0 ? d[j] / dt : 0;
      // the smooth path: the average over nine frames round it (a teleport's frames left out)
      // (speeds, not distances: a frame that came late moved further, as it should)
      const v = (q) => d[q] / Math.max(1e-3, (s[q][0] - s[q - 1][0]) / 1000);
      let a = 0, m = 0;
      for (let q = Math.max(1, j - 4); q <= Math.min(s.length - 1, j + 4); q++) if (d[q] <= 3) (a += v(q)), m++;
      a /= m;
      if (a < 1) continue;
      moving++;
      const r = Math.abs(v(j) - a) / a;
      jit += r;
      n++;
      if (r > 0.5) stut++;
    }
    out.push({ kind: k.kind, frames: s.length, moving, meanV: +(sumV / s.length).toFixed(1), jitter: n ? +(jit / n).toFixed(3) : null, stutters: stut, maxHeadingJumpDeg: +maxJump.toFixed(1), teleports: tele, maxDy: +maxDy.toFixed(2), scaled: scl });
  });
  frames.sort((a, b) => a - b);
  return { cars: out, frameMs: { p50: +frames[frames.length >> 1].toFixed(1), p95: +frames[Math.floor(frames.length * 0.95)].toFixed(1), max: +frames[frames.length - 1].toFixed(1), over100: frames.filter((f) => f > 100).length, n: frames.length } };
}, SECS);
console.log("frames", JSON.stringify(res.frameMs));
for (const c of res.cars) if (!c.kind.startsWith("city") || c.teleports || c.maxHeadingJumpDeg > 4 || c.stutters > 5) console.log(JSON.stringify(c));
const agg = (k) => res.cars.filter((c) => c.kind.startsWith(k));
for (const k of ["city", "avenue", "bridge"]) {
  const a = agg(k);
  if (!a.length) continue;
  const j = a.filter((c) => c.jitter !== null);
  console.log(`${k} (${a.length}, ${j.length} moving): jitter ${(j.reduce((s, c) => s + c.jitter, 0) / Math.max(1, j.length)).toFixed(3)} · stutters ${a.reduce((s, c) => s + c.stutters, 0)}/${a.reduce((s, c) => s + c.moving, 0)} frames · max heading jump ${Math.max(...a.map((c) => c.maxHeadingJumpDeg))}°/frame · cars jumping >4°/frame ${a.filter((c) => c.maxHeadingJumpDeg > 4).length} · teleports ${a.reduce((s, c) => s + c.teleports, 0)}`);
}
// a junction of the ring road, from its corner's pavement: the cars coming round onto the ring,
// a frame every 120 ms (OUT-turn-NN.png)
if (process.env.SHOTS !== "0") {
  const where = await p.evaluate(() => {
    const g = street.gta;
    const tr = g.host.traffic;
    // the junction where the most cars are about to turn
    const n = new Map();
    for (const m of tr.movers) {
      const b = m.next ?? m.bend;
      if (!b) continue;
      const k = m.line.axis === "z" ? `${m.line.at},${b.ring.at}` : `${b.ring.at},${m.line.at}`;
      n.set(k, (n.get(k) ?? 0) + 1);
    }
    const best = [...n].sort((a, b) => b[1] - a[1])[0];
    if (!best) return null;
    const [x, z] = best[0].split(",").map(Number);
    // on the pavement at the corner (inside the ring), looking across the junction
    const sx = x - Math.sign(x || 1) * 13, sz = z - Math.sign(z || 1) * 13;
    const h = Math.atan2(-(z - sz), x - sx);
    const y = g.host.ground(sx, sz) ?? 0.2;
    g.player.place(sx, y, sz, h);
    g.cam.behind(h, -0.18);
    g.cam.snap(g.player.pos.clone().setY(y + 1.55));
    return [x, z, best[1]];
  });
  console.log("junction", JSON.stringify(where));
  if (where) {
    await sleep(1500);
    for (let i = 0; i < 32; i++) {
      await sleep(120);
      await p.screenshot({ path: `${OUT}-turn-${String(i).padStart(2, "0")}.png` });
    }
  }
}
console.log("errors", errs.length, errs.slice(0, 4).join("\n"));
await b.close();
