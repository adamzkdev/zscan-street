// node shots/_keysjam.mjs [URL]: the traffic round you when you stop among it (src/scene/goldengate.ts — the bridge's and
// Orchard Keys' loops): your car stopped (A) at Note Street × Orchard Boulevard by the tunnel's south portal, (B) in a lane
// on the bridge's deck. For each: the longest any traffic car near you stands still while you wait (and what it waits for),
// then whether you can drive on (to the tunnel, along the deck) — never boxed in for good.
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day"] = process.argv.slice(2);
const WAIT = +(process.env.WAIT ?? 40);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 960, height: 540 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.keys?.done, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3000);
await p.evaluate(() => {
  const g = street.gta;
  g.hud.coach(-1);
  // (no police: the test stands in the road on purpose)
  g.heat.raise = () => {};
  const c = g.parked.find((x) => x.kind === "gt") ?? g.parked[0];
  g.player.place(c.group.position.x - 1.5, 0.2, c.group.position.z + 1.6, 0);
  g.input.tap("KeyF");
});
await p.waitForFunction(() => !!street.gta.car, { timeout: 10000, polling: 100 });
await sleep(1000);
let fails = 0;
const ok = (c, what, extra = "") => { if (!c) fails++; console.log(c ? "ok  " : "FAIL", what, extra); };

/** Stopped at (x, z) heading yaw for WAIT s: the traffic near you, who stands still longest and why. */
const standStill = (x, z, yaw) =>
  p.evaluate(async (x, z, yaw, WAIT) => {
    const g = street.gta, gg = street.goldenGate;
    g.car.place(x, z, yaw);
    g.car.vel.set(0, 0);
    g.cam.behind(yaw - Math.PI / 2, -0.15);
    const st = g.input.stick;
    st.x = 0;
    st.y = 0;
    const still = new Map();
    let worst = 0, worstWhy = null, near = new Set(), honks = 0, passed = 0;
    const r1 = (v) => +v.toFixed(1);
    const P = () => g.car.group.position;
    const t0 = performance.now();
    while (performance.now() - t0 < WAIT * 1000) {
      await new Promise((r) => setTimeout(r, 250));
      // (held where it was: the test is you waiting, not drifting)
      g.car.vel.set(0, 0);
      const me = P();
      for (const c of gg.cars) {
        const d = Math.hypot(c.x - me.x, c.z - me.z);
        if (d > 30) { still.delete(c); continue; }
        near.add(c);
        const s = c.cur < 0.2 ? (still.get(c) ?? 0) + 0.25 : 0;
        still.set(c, s);
        if (s > worst) {
          worst = s;
          const fx = Math.cos(c.yaw), fz = -Math.sin(c.yaw);
          const ahead = [];
          for (const o of gg.cars) { if (o === c) continue; const dx = o.x - c.x, dz = o.z - c.z, al = dx * fx + dz * fz, ac = Math.abs(-dx * fz + dz * fx); if (al > -2 && al < 18 && ac < 3.2) ahead.push({ t: "car", x: r1(o.x), z: r1(o.z), cur: r1(o.cur), al: r1(al), ac: r1(ac) }); }
          for (const o of gg.blockers()) { const dx = o.x - c.x, dz = o.z - c.z, al = dx * fx + dz * fz, ac = Math.abs(-dx * fz + dz * fx); if (al > -2 && al < 16 && ac < 4) ahead.push({ t: "blocker", x: r1(o.x), z: r1(o.z), al: r1(al), ac: r1(ac) }); }
          worstWhy = { car: { x: r1(c.x), z: r1(c.z), yaw: r1(c.yaw), off: r1(c.off), wait: r1(c.wait ?? 0), jam: r1(c.jam ?? 0), dodge: c.dodge ? { stage: c.dodge.stage, to: r1(c.dodge.to), t: r1(c.dodge.t), car: !!c.dodge.car } : null }, ahead, me: [r1(me.x), r1(me.z), r1(g.car.yaw)] };
        }
        if (c.honked && !c.__counted) (c.__counted = true), honks++;
      }
    }
    // the cars that went by you (near you at some point, now more than 30 m on)
    for (const c of near) if (!gg.cars.includes(c) || Math.hypot(c.x - P().x, c.z - P().z) > 30) passed++;
    return { near: near.size, passed, worstStill: r1(worst), worstWhy, honks };
  }, x, z, yaw, WAIT);

/** Then drive on along pts (an autopilot on the stick, braking for what is ahead, never ramming): reached? */
const driveOn = (pts, ms = 45000) =>
  p.evaluate(async (pts, ms) => {
    const g = street.gta;
    const st = g.input.stick;
    let k = 0, stuck = 0, maxStuck = 0;
    const t0 = performance.now();
    const trail = [];
    let tt = 0;
    while (performance.now() - t0 < ms) {
      await new Promise((r) => setTimeout(r, 100));
      const c = g.car;
      if (!c) return { ok: false, why: "out of the car" };
      const P = c.group.position;
      while (k < pts.length - 1 && Math.hypot(pts[k][0] - P.x, pts[k][1] - P.z) < 6) k++;
      if (k === pts.length - 1 && Math.hypot(pts[k][0] - P.x, pts[k][1] - P.z) < 6) { st.x = 0; st.y = 0; return { ok: true, t: +((performance.now() - t0) / 1000).toFixed(1), maxStuck: +maxStuck.toFixed(1) }; }
      const [tx, tz] = pts[k];
      const fx = Math.cos(c.yaw), fz = -Math.sin(c.yaw);
      let d = Math.atan2(tz - P.z, tx - P.x) - Math.atan2(fz, fx);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      st.x = Math.max(-1, Math.min(1, d * 2.4));
      st.y = c.speed > 9 ? 0 : 0.8;
      if (c.speed < 0.5) stuck += 0.1; else stuck = 0;
      maxStuck = Math.max(maxStuck, stuck);
      if (performance.now() - tt > 1000) (tt = performance.now()), trail.push([+P.x.toFixed(1), +P.z.toFixed(1), +c.speed.toFixed(1), k, street.goldenGate.cars.filter((q) => Math.hypot(q.x - P.x, q.z - P.z) < 7).map((q) => [+q.x.toFixed(1), +q.z.toFixed(1), q.dodge?.stage ?? "-"])]);
    }
    st.x = 0;
    st.y = 0;
    return { ok: false, why: "timeout", at: [+g.car.group.position.x.toFixed(1), +g.car.group.position.z.toFixed(1)], maxStuck: +maxStuck.toFixed(1), trail: trail.slice(0, 14) };
  }, pts, ms);

// A: on Note Street just east of Orchard Boulevard, facing west, waiting to turn north into the tunnel
{
  const a = await standStill(169, 648.5, Math.PI);
  console.log("junction wait", JSON.stringify(a));
  ok(a.worstStill < 15, "junction: no traffic car stands still by you more than 15 s", `${a.worstStill} s`);
  const d = await driveOn([[160, 648.5], [161.5, 640], [161.5, 600]]);
  console.log("junction drive on", JSON.stringify(d));
  ok(d.ok, "junction: you drive on into the tunnel");
}
// A2: in the junction itself, stopped across Orchard Boulevard (the loops turning round you)
{
  const a = await standStill(158, 648, Math.PI);
  console.log("in the junction", JSON.stringify(a));
  ok(a.worstStill < 15, "in the junction: no traffic car stands still by you more than 15 s", `${a.worstStill} s`);
  const d = await driveOn([[150, 648], [130, 648]]);
  console.log("junction drive on west", JSON.stringify(d));
  ok(d.ok, "in the junction: you drive on west along Note Street");
}
// B: on the deck, stopped in the inner northbound lane (to the city), the traffic coming up behind you
{
  const x = await p.evaluate(() => street.goldenGate.laneX(420, false, 0));
  const a = await standStill(x, 420, Math.PI / 2);
  console.log("deck wait", JSON.stringify(a));
  ok(a.worstStill < 15, "deck: no traffic car stands still behind you more than 15 s", `${a.worstStill} s`);
  const d = await driveOn([[x, 400], [x, 250]]);
  console.log("deck drive on", JSON.stringify(d));
  ok(d.ok, "deck: you drive on north along the deck");
}
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
console.log(fails ? `${fails} FAILED` : "ALL OK");
await b.close();
