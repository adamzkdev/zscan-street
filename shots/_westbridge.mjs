// node shots/_westbridge.mjs [URL] [OUT]: the Øresund crossing to Gamla (src/scene/isles/west): shots of the bridge from the
// city's west ring road, from its deck, of the islet and the tunnel's mouths, inside the tube, of the old town (the cathedral
// and Domplein, the Grote Markt and the Belfort, the canals, the castle, the harbour), from the air, by day and at night; a drive
// in the ZK-GT from the ring road over the bridge, down into the tube and up onto Øresund Boulevard, and back (the car rides
// the course's profile, held between its barriers and the tube's walls); a walk on the bridge's walkway; the town's doors face
// a street or a quay and are free in front; a swim in a canal and out up its stairs; fps on the deck, in the tube, in town.
// ONLY=shots,drive,doors,walk,swim,air,night  NOSHOT=1: numbers only.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo", OUT = "shots/gta/isles/west/w"] = process.argv.slice(2);
mkdirSync(OUT.replace(/\/[^/]*$/, ""), { recursive: true });
const ONLY = process.env.ONLY ?? "";
const NOSHOT = !!process.env.NOSHOT;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
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
const seenMsg = new Set();
p.on("console", async (m) => {
  const t = m.text();
  if (!((m.type() === "error" || t.startsWith("TRACE")) && !t.includes("429") && !seenMsg.has(t))) return;
  seenMsg.add(t);
  console.log("  console:", t.slice(0, 300));
});
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.keys?.done, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
await p.waitForFunction(() => window.street.isles?.live?.every((L) => L.content), { timeout: 180000, polling: 300 });
const west = (f) => f.door.x < -1700;
console.log("islands built after", ((Date.now() - t0) / 1000).toFixed(1), "s; Gamla's doors", await p.evaluate(() => street.isles.facades.filter((f) => f.door.x < -1700).length), "parked", await p.evaluate(() => street.isles.parkedCars.filter((c) => c.obj.position.x < -1700).length));
await p.evaluate(() => {
  const g = street.gta;
  g.hud.coach(-1);
  g.heat.raise = () => {};
});
const fps = async () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
const shot = async (name) => { if (!NOSHOT) await p.screenshot({ path: `${OUT}-${name}.jpg`, type: "jpeg", quality: 62 }); };
/** On foot at (x, z) facing h (0 north, π/2 west, −π/2 east, π south), the camera behind; a shot. */
const stand = async (name, x, z, h, pitch = -0.1, wait = 3500) => {
  await p.evaluate((x, z, h, pitch) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, pitch); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h, pitch);
  await sleep(wait);
  await shot(name);
};
/** From the air: the game's camera held at pos looking at look (its own updates set aside a moment). */
const air = async (name, pos, look, wait = 3500) => {
  await p.evaluate((pos, look) => {
    const g = street.gta;
    const c = g.cam;
    window.__camKeep ??= { foot: c.foot, car: c.car };
    const hold = () => {
      c.camera.position.set(...pos);
      c.camera.lookAt(...look);
      c.camera.far = 3000;
      c.camera.updateProjectionMatrix();
    };
    c.foot = hold;
    c.car = hold;
    hold();
    // (the player near the spot looked at: the island's things drawn near)
    g.player.place(look[0], g.host.ground(look[0], look[2]) ?? 0.2, look[2], 0);
  }, pos, look);
  await sleep(wait);
  await shot(name);
  await p.evaluate(() => {
    const c = street.gta.cam;
    Object.assign(c, window.__camKeep);
    c.camera.far = 520;
    c.camera.updateProjectionMatrix();
  });
};
const out = {};
const Z = -156;
if (!ONLY || ONLY.includes("shots")) {
  await stand("ringroad", -214, Z + 10, Math.PI / 2 + 0.25, -0.02);
  out.fpsRing = await fps();
  await stand("deck", -228 - 610, Z - 8.4, Math.PI / 2, 0.02);
  out.deckFoot = await p.evaluate((Z) => { const g = street.gta; return { y: +g.player.pos.y.toFixed(2), deck: +street.isles.deckAt(-838, Z - 8.4).toFixed(2) }; }, Z);
  out.fpsDeck = await fps();
  await stand("pylon", -228 - 820, Z - 8.4, Math.PI / 2, 0.35);
  await stand("islet", -228 - 1170, Z - 8.4, Math.PI / 2, -0.05);
  await stand("tube", -228 - 1450, Z - 8.6, Math.PI / 2, 0.0);
  out.fpsTube = await fps();
  await stand("landing", -1915, Z - 9, Math.PI / 2, 0.02, 6000);
  out.fpsTown = await fps();
  await stand("cathedral", -2055, -160, Math.PI, 0.42);
  await stand("domplein", -2030, -170, Math.PI / 2 + 0.6, 0.05);
  await stand("markt", -1990, -138, Math.PI - 0.5, 0.18);
  await stand("gracht", -2060, -218, Math.PI / 2, 0.02);
  await stand("domgracht", -2139, -120, 0, 0.02);
  await stand("castle", -2252, -306, 0, 0.3);
  await stand("harbour", -2030, -396, Math.PI / 2 - 0.4, 0.05);
  await stand("view", -1907, -60, -Math.PI / 2 + 0.3, 0.05);
}
if (ONLY.includes("cath")) {
  await stand("cath-a", -2055, -190, Math.PI, -0.35);
  await stand("cath-b", -2055, -190, Math.PI, 0.35);
  await air("cath-air", [-2010, 70, -200], [-2055, 30, -95]);
  await air("cath-side", [-1985, 30, -40], [-2055, 25, -95]);
}
if (!ONLY || ONLY.includes("air")) {
  await air("air-crossing", [-700, 260, 180], [-1200, 0, Z]);
  await air("air-town", [-1820, 210, 160], [-2110, 0, -150]);
  await air("air-islet", [-1340, 90, -40], [-1470, 0, Z]);
}
if (!ONLY || ONLY.includes("doors")) {
  await p.evaluate(() => { const g = street.gta; g.player.place(-2050, 0.2, -160, 0); });
  await sleep(7000);
  out.doors = await p.evaluate(() => {
    const s = street.gta.solid;
    const isl = street.isles;
    const bad = [];
    const list = isl.facades.filter((f) => f.door.x < -1700);
    for (const f of list) {
      const fx = f.out.x, fz = f.out.z;
      let free = true;
      for (const d of [0.8, 1.6, 2.4]) {
        const x = f.door.x + fx * d, z = f.door.z + fz * d;
        const t = s.topAt(x, z);
        const fl = isl.groundAt(x, z);
        if (fl !== null) continue;
        if (t === undefined || t !== t || t > 0.7 || t < -0.4) free = false;
      }
      if (!free) bad.push({ at: [+f.door.x.toFixed(1), +f.door.z.toFixed(1)], face: f.face, type: f.type });
    }
    return { n: list.length, bad: bad.length, sample: bad.slice(0, 8) };
  });
  console.log("doors", JSON.stringify(out.doors));
}
if (!ONLY || ONLY.includes("drive")) {
  await p.evaluate(() => { const g = street.gta; const c = g.parked.find((x) => x.kind === "gt") ?? g.parked[0]; g.player.place(c.group.position.x - 1.5, 0.2, c.group.position.z + 1.6, 0); g.input.tap("KeyF"); });
  await p.waitForFunction(() => !!street.gta.car, { timeout: 10000, polling: 100 }).catch(() => {});
  await sleep(1500);
  // (who takes you out of the car, if anyone: noted with where it came from)
  await p.evaluate(() => { const g = street.gta; window.__outs = []; const o = g.getOut.bind(g); const w = g.host.walker; const op = w.onPlace; w.onPlace = () => { window.__outs.push({ placed: new Error().stack.split("\n").slice(2, 8).map((l) => l.trim()).join(" | ") }); op?.(); }; g.getOut = (f) => { window.__outs.push({ at: [+g.car?.group.position.x.toFixed(1), +g.car?.group.position.z.toFixed(1)], hp: g.hp, why: new Error().stack.split("\n").slice(2, 6).map((l) => l.trim()).join(" | ") }); return o(f); }; });
  const leg = async (name, from, to, lane, ms) => {
    await p.evaluate((from, to, lane, Z) => {
      const g = street.gta;
      const east = to > from;
      const zl = Z + (east ? lane : -lane);
      g.car.place(from, zl, east ? 0 : Math.PI);
      g.car.vel.set(0, 0);
      g.cam.behind(east ? -Math.PI / 2 : Math.PI / 2, -0.1);
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
        const want = east ? 0 : Math.PI;
        let dh = c.yaw - want;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const err = east ? zl - pos.z : pos.z - zl;
        st.x = Math.max(-1, Math.min(1, -err * 0.25 + dh * 2.2));
        if (!stopAt) {
          let ahead = Infinity;
          const look = 12 + c.speed * 2;
          for (const b of street.isles.boxes()) {
            const dx = east ? b.x - pos.x : pos.x - b.x;
            if (dx > 1.5 && dx < look && Math.abs(b.z - pos.z) < 1.5) ahead = Math.min(ahead, dx);
          }
          window.__held = ahead < look && c.speed < 0.5 ? (window.__held ?? 0) + 0.1 : 0;
          st.y = window.__held > 4 ? 0.6 : ahead < look ? (c.speed > Math.max(2.5, (ahead - 6) / 1.6) ? -0.8 : 0.3) : c.speed > 30 ? 0 : 1;
        }
        const deck = street.isles.deckAt(pos.x, pos.z);
        window.__log.push({ x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), v: +c.speed.toFixed(1), deck: deck === null ? null : +deck.toFixed(2), street: g.roads.where(pos.x, pos.z, east ? 1 : -1, 0).street });
        if (!stopAt && ((east && pos.x > to) || (!east && pos.x < to))) { st.y = -1; stopAt = performance.now(); }
        if (stopAt && performance.now() - stopAt > 1800) { st.y = 0; st.x = 0; clearInterval(window.__ap); }
      }, 100);
    }, from, to, lane, Z);
    const tt = Date.now();
    let n = 0;
    while (Date.now() - tt < ms) {
      await sleep(3000);
      if (++n % 4 === 1) await shot(`drive-${name}-${String(n).padStart(2, "0")}`);
      const done = await p.evaluate(() => { const l = window.__log; return l.length > 5 && l[l.length - 1].v < 0.2 && Math.abs(l[l.length - 1].x - l[l.length - 6].x) < 0.05; });
      if (done) break;
    }
    const log = await p.evaluate(() => window.__log);
    const outs = await p.evaluate(() => window.__outs.splice(0));
    if (outs.length) console.log("  out of the car:", JSON.stringify(outs));
    let worst = 0, stuck = 0, wet = 0, minY = 99;
    const stalls = [];
    const streets = [];
    for (let i = 0; i < log.length; i++) {
      const q = log[i];
      if (streets[streets.length - 1] !== q.street) streets.push(q.street);
      if (q.deck !== null && Math.abs(q.deck) > 1) worst = Math.max(worst, Math.abs(q.y - q.deck));
      minY = Math.min(minY, q.y);
      // (under the road it should be on: dropped through the deck, the tube, into the sea)
      if (q.deck !== null ? q.y < q.deck - 0.6 : q.y < -0.6) wet++;
      const past = to > log[0].x ? q.x > to : q.x < to;
      if (i > 10 && q.v < 0.5 && !past && Math.abs(q.x - to) > 8) (stuck++, stalls.push({ i, x: q.x, v: q.v }));
    }
    const last = log[log.length - 1];
    const zr = [Math.min(...log.map((q) => q.z)), Math.max(...log.map((q) => q.z))];
    console.log(`${name}: ${log.length} samples, end x ${last?.x} (wanted ${to}), max v ${Math.max(...log.map((q) => q.v))} m/s, |y-deck| max ${worst.toFixed(2)} m, lowest y ${minY.toFixed(1)}, stuck ${stuck}, below the road ${wet}, z range ${zr[0].toFixed(1)}..${zr[1].toFixed(1)}`);
    console.log("  streets:", streets.join(" → "));
    if (stalls.length) console.log("  stalls:", JSON.stringify(stalls.slice(0, 6)));
    out[name] = { end: last?.x, worst: +worst.toFixed(2), stuck, wet, minY: +minY.toFixed(1) };
  };
  await leg("west", -205, -2040, 1.9, 240000);
  out.fpsDrive = await fps();
  await leg("east", -1990, -215, 1.9, 240000);
}
if (!ONLY || ONLY.includes("walk")) {
  if (await p.evaluate(() => !!street.gta.car)) { await p.evaluate(() => street.gta.input.tap("KeyF")); await sleep(1500); }
  // on the walkway mid-span: walk west 30 m (held between the railing and the barrier)
  await stand("walk", -228 - 600, Z - 8.6, Math.PI / 2, 0.0, 2500);
  out.walk = await p.evaluate(async (Z) => {
    const g = street.gta;
    const st = g.input.stick;
    const x0 = g.player.pos.x;
    st.x = 0;
    st.y = 1;
    await new Promise((r) => setTimeout(r, 6000));
    st.y = 0;
    const pos = g.player.pos;
    return { moved: +(x0 - pos.x).toFixed(1), z: +pos.z.toFixed(2), y: +pos.y.toFixed(2), deck: +street.isles.deckAt(pos.x, Z - 8.6).toFixed(2) };
  }, Z);
  console.log("walk", JSON.stringify(out.walk));
}
if (!ONLY || ONLY.includes("swim")) {
  if (await p.evaluate(() => !!street.gta.car)) { await p.evaluate(() => street.gta.input.tap("KeyF")); await sleep(1500); }
  // into the Domgracht off its quay, then out up the stairs at its south end
  await stand("swim", -2150, -110, 0, 0.1, 4000);
  out.swim = await p.evaluate(() => { const g = street.gta; return { sea: street.isles.sea(-2150, -110), y: +g.player.pos.y.toFixed(2) }; });
  console.log("swim", JSON.stringify(out.swim));
}
if (!ONLY || ONLY.includes("night")) {
  await p.evaluate(() => street.gta.apply?.({ ...street.gta.settings, sky: "night" }));
  await sleep(2500);
  await stand("night-cathedral", -2055, -170, Math.PI, 0.3, 4000);
  await stand("night-bridge", -1907, Z + 40, -Math.PI / 2 + 0.6, 0.12, 4000);
  await air("night-air", [-1820, 180, 120], [-2110, 0, -150]);
}
console.log(JSON.stringify(out));
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
