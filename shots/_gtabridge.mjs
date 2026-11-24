// node shots/_gtabridge.mjs [URL] [OUT]: the ZK-GT driven from the city over the Golden Gate, through the Orchard Tunnel into
// Orchard Keys (src/scene/keys) and back; checks the car rides the deck's height, never sticks, never drops into the bay. KIND=moto too.
import puppeteer from "puppeteer-core";
const KIND = process.env.KIND ?? "gt";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo", OUT = "shots/gta/keys/drive"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  const W = window.WebSocket;
  const F = function (u, pr) {
    if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
    return pr === undefined ? new W(u) : new W(u, pr);
  };
  F.prototype = W.prototype;
  Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = F;
});
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.keys?.done, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// (the district's own picture is built right after the board's)
await sleep(4000);
await p.evaluate(() => {
  const g = street.gta;
  g.hud.coach(-1);
  // (no police on a test drive: the autopilot does not stop for people)
  g.heat.raise = () => {};
  for (const k of ["getOut", "stop", "busted", "reset", "wasted"]) {
    const o = g[k]?.bind(g);
    if (o) g[k] = (...a) => { console.log("TRACE " + k + " " + new Error().stack.split("\n").slice(2, 6).join(" | ")); return o(...a); };
  }
});
p.on("console", (m) => { if (m.text().startsWith("TRACE")) console.log(m.text()); });
// into the car on the ring road, facing the bridge
await p.evaluate((k) => {
  const g = street.gta;
  const c = g.parked.find((x) => x.kind === k) ?? g.parked[0];
  g.player.place(c.group.position.x - 1.5, 0.2, c.group.position.z + 1.6, 0);
  g.input.tap("KeyF");
}, KIND);
await p.waitForFunction(() => !!street.gta.car, { timeout: 10000, polling: 100 }).catch(() => {});
await sleep(2500);
const ok = await p.evaluate(() => !!street.gta.car);
if (!ok) console.log("could not get in");
/** Drive along x = lane from z0 towards z1 (an autopilot steering with A/D), sampling every 100 ms. */
const leg = async (name, lane, z0, z1, ms) => {
  // (back in the car if the police took you out of it, the heat gone)
  if (!(await p.evaluate(() => !!street.gta.car))) {
    await p.evaluate((k) => {
      const g = street.gta;
      g.heat.clear();
      const c = g.parked.find((x) => x.kind === k) ?? g.parked[0];
      g.player.place(c.group.position.x - 1.5, 0.2, c.group.position.z + 1.6, 0);
      g.input.tap("KeyF");
    }, KIND);
    await p.waitForFunction(() => !!street.gta.car, { timeout: 10000, polling: 100 }).catch(() => {});
    await sleep(2000);
  }
  await p.evaluate(() => street.gta.heat.clear());
  await p.evaluate((lane, z0, z1) => {
    const g = street.gta;
    const south = z1 > z0;
    g.car.place(lane, z0, south ? -Math.PI / 2 : Math.PI / 2);
    g.car.vel.set(0, 0);
    g.cam.behind(south ? Math.PI : 0, -0.12);
    window.__log = [];
    clearInterval(window.__ap);
    const st = g.input.stick;
    st.x = 0;
    st.y = 1;
    let stopAt = 0;
    window.__ap = setInterval(() => {
      const c = g.car;
      if (!c) return;
      const pos = c.group.position;
      const want = south ? -Math.PI / 2 : Math.PI / 2;
      let dh = c.yaw - want;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      // (south: right is −x; north: right is +x) — steer right (+) when left of the lane or turned left;
      // on the bridge and through the tunnel, the traffic's own inner lane (the deck's is wider)
      const lx = pos.z > 138 && pos.z < 262 ? street.goldenGate.laneX(pos.z, south, 0) : lane;
      const err = south ? pos.x - lx : lx - pos.x;
      st.x = Math.max(-1, Math.min(1, err * 0.25 + dh * 2.2));
      // (a driver, not a ram: off the throttle and braking behind the bridge's traffic in the lane ahead)
      if (!stopAt) {
        let ahead = Infinity;
        const look = 12 + c.speed * 2;
        for (const b of street.goldenGate.boxes()) {
          const dz = south ? b.z - pos.z : pos.z - b.z;
          if (dz > 1.5 && dz < look && Math.abs(b.x - pos.x) < 1.5) ahead = Math.min(ahead, dz);
        }
        // (held up more than 4 s by a car that is not moving: nose on past it, as a driver would)
        window.__held = ahead < look && c.speed < 0.5 ? (window.__held ?? 0) + 0.1 : 0;
        st.y = window.__held > 4 ? 0.6 : ahead < look ? (c.speed > Math.max(2.5, (ahead - 6) / 1.6) ? -0.8 : 0.3) : 1;
      }
      const deck = street.goldenGate.onDeck(pos.x, pos.z) ? street.goldenGate.deckAt(pos.z) : null;
      window.__log.push({ x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), v: +c.speed.toFixed(1), deck: deck === null ? null : +deck.toFixed(2), street: g.roads.where(pos.x, pos.z).street, s: +st.x.toFixed(2) });
      if (!stopAt && ((south && pos.z > z1) || (!south && pos.z < z1))) {
        st.y = -1;
        stopAt = performance.now();
      }
      if (stopAt && performance.now() - stopAt > 1800) {
        st.y = 0;
        st.x = 0;
        clearInterval(window.__ap);
      }
    }, 100);
  }, lane, z0, z1);
  const shots = [];
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < ms) {
    await sleep(2500);
    const z = await p.evaluate(() => street.gta.car?.group.position.z ?? 0);
    shots.push(z);
    await p.screenshot({ path: `${OUT}-${name}-${String(++n).padStart(2, "0")}.png` });
    const done = await p.evaluate(() => { const l = window.__log; return l.length > 5 && l[l.length - 1].v < 0.2 && Math.abs(l[l.length - 1].z - l[l.length - 6].z) < 0.05; });
    if (done) break;
  }
  const log = await p.evaluate(() => window.__log);
  // the deck's height under the wheels, stuck spells, the bay
  let worst = 0,
    stuck = 0,
    wet = 0;
  const streets = new Set();
  for (let i = 0; i < log.length; i++) {
    const q = log[i];
    streets.add(q.street);
    if (q.deck !== null) worst = Math.max(worst, Math.abs(q.y - q.deck));
    if (q.y < -0.5) wet++;
    if (i > 10 && q.v < 0.5 && Math.abs(q.z - (lane > 0 ? z1 : z1)) > 6) stuck++;
  }
  const last = log[log.length - 1];
  console.log(`${name}: ${log.length} samples, end z ${last?.z} (wanted ${z1}), max v ${Math.max(...log.map((q) => q.v))} m/s, deck |y-deck| max ${worst.toFixed(2)} m, stuck samples ${stuck}, under water ${wet}, x range ${Math.min(...log.map((q) => q.x)).toFixed(1)}..${Math.max(...log.map((q) => q.x)).toFixed(1)}`);
  console.log("  streets:", [...streets].join(" → "));
  const big = log.filter((q) => q.deck !== null && Math.abs(q.y - q.deck) > 0.25).slice(0, 6);
  if (big.length) console.log("  deck off:", JSON.stringify(big));
  console.log("  last:", JSON.stringify(log.slice(-4)));
  console.log("  near:", JSON.stringify(await p.evaluate(() => { const c = street.gta.car.group.position; return [...street.goldenGate.boxes()].filter((b) => Math.hypot(b.x - c.x, b.z - c.z) < 14).map((b) => [b.x.toFixed(1), b.z.toFixed(1)]); })), "hit:", JSON.stringify(await p.evaluate(() => street.gta.car.hit)));
  return log;
};
// (SOUTH=0 skips the south leg; NORTH0=630 starts the north one in the tunnel, past Orchard Keys' own traffic)
// (two minutes a leg: behind the traffic, a driver keeps its pace)
const MS = +(process.env.LEGMS ?? 120000);
// (Orchard Keys lies across the strait, ACROSS = 380 m further south since the bridge grew: Note Street's z + 18)
const FAR = +(process.env.FAR ?? 398 + 380);
if (process.env.SOUTH !== "0") await leg("south", 156.4, 131, FAR, MS);
await leg("north", 159.6, +(process.env.NORTH0 ?? FAR), 128, MS);
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
