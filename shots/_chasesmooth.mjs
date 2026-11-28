// node shots/_chasesmooth.mjs: the police cruisers coming for you — every frame for ~14 s: wobble (the
// turn rate flipping side to side), speed jitter, heading jumps. ENV: SECS
import puppeteer from "puppeteer-core";
const SECS = +(process.env.SECS ?? 14);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.player.place(-14, 0.2, 38, 0); g.cam.behind(0, -0.1); g.cam.snap(g.player.pos.clone().setY(1.55)); g.heat.raise(2.6, "test"); });
await p.waitForFunction(() => street.gta.heat.chasers.length > 0, { timeout: 60000, polling: 200 }).catch(() => {});
const res = await p.evaluate(async (secs) => {
  const g = street.gta;
  const T = new Map();
  await new Promise((done) => {
    let t0 = -1;
    const f = (now) => {
      if (t0 < 0) t0 = now;
      // (kept wanted: they keep coming)
      if (g.heat.level < 2) g.heat.raise(1, "test");
      for (const c of g.heat.chasers) {
        const k = c.car;
        if (!T.has(k)) T.set(k, []);
        T.get(k).push([now, k.group.position.x, k.group.position.z, k.yaw, k.speed]);
      }
      if (now - t0 < secs * 1000) requestAnimationFrame(f);
      else done();
    };
    requestAnimationFrame(f);
  });
  const out = [];
  // (one chaser's frames, for a look: dt ms, metres moved, its own speed × dt)
  const one = [...T.values()].sort((a, b) => b.length - a.length)[0];
  if (one) out.push({ trace: one.slice(120, 170).map((x, j, a) => j ? [+(x[0] - a[j - 1][0]).toFixed(1), +Math.hypot(x[1] - a[j - 1][1], x[2] - a[j - 1][2]).toFixed(3), +((x[4] * (x[0] - a[j - 1][0])) / 1000).toFixed(3)] : null).slice(1) });
  for (const s of T.values()) {
    if (s.length < 30) continue;
    let flips = 0, lastSign = 0, maxJump = 0, jit = 0, n = 0, moving = 0, tele = 0;
    const d = [0];
    for (let j = 1; j < s.length; j++) d.push(Math.hypot(s[j][1] - s[j - 1][1], s[j][2] - s[j - 1][2]));
    for (let j = 1; j < s.length; j++) {
      const dt = (s[j][0] - s[j - 1][0]) / 1000;
      if (d[j] > 3) { tele++; continue; }
      const dh = Math.atan2(Math.sin(s[j][3] - s[j - 1][3]), Math.cos(s[j][3] - s[j - 1][3]));
      const rate = dh / Math.max(1e-3, dt);
      if (s[j][4] > 3) {
        maxJump = Math.max(maxJump, Math.abs(dh) * 57.3);
        if (Math.abs(rate) > 0.15) {
          const sg = Math.sign(rate);
          if (lastSign && sg !== lastSign) flips++;
          lastSign = sg;
        }
      }
      const v = (q) => d[q] / Math.max(1e-3, (s[q][0] - s[q - 1][0]) / 1000);
      let a = 0, m = 0;
      for (let q = Math.max(1, j - 4); q <= Math.min(s.length - 1, j + 4); q++) if (d[q] <= 3) (a += v(q)), m++;
      a /= m;
      if (a < 1) continue;
      moving++;
      jit += Math.abs(v(j) - a) / a;
      n++;
    }
    out.push({ frames: s.length, moving, secs: +((s[s.length - 1][0] - s[0][0]) / 1000).toFixed(1), wobbleFlipsPerSec: +(flips / Math.max(1, (s[s.length - 1][0] - s[0][0]) / 1000)).toFixed(2), maxHeadingJumpDeg: +maxJump.toFixed(1), jitter: n ? +(jit / n).toFixed(3) : null, teleports: tele, maxSpeed: +Math.max(...s.map((x) => x[4])).toFixed(1) });
  }
  return out;
}, SECS);
for (const r of res) console.log(JSON.stringify(r));
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
