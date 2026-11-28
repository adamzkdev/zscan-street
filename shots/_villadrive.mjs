// node shots/_villadrive.mjs [URL]: your car and your bike at the villa (scene/keys/villa.ts, plan.ts VILLA; gta/home.ts,
// gta/index.ts parkHome), driven as a player would:
//  - PLAY: the ZK-GT and the bike parked in the motor court, clear of every wall, planter and each other, nose to the gate
//  - out of the front door: you stand on the porch, the camera outside the house (not in its door or its walls)
//  - walk to the GT, F, out through the gate onto the street (W / A / D / S only; backing up if stuck): no wall hit, no fling
//  - back in from the street, parked in the court, F: out beside it, on the setts (not in a wall, a planter, the pool)
//  - the same with the bike, out and back
//  - fps in the court and on the terrace; down the dock's steps to the yacht's boarding point (the game offers to board)
//  - reload: PLAY again, both vehicles back home where they belong, nothing on top of anything
// A contact sheet: shots/gta/villa/drive-sheet.jpg (the per-step JPEGs deleted after).
import puppeteer from "puppeteer-core";
import { mkdirSync, rmSync, existsSync } from "node:fs";
const [URL = "http://localhost:3061/?debug&gta=1192&home&theme=day"] = process.argv.slice(2);
const OUT = "shots/gta/villa";
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 960, height: 540 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, what, extra = "") => { if (!c) fails++; console.log(c ? "ok  " : "FAIL", what, extra); };
const shots = [];
const shot = async (n) => { const f = `${OUT}/d-${String(shots.length).padStart(2, "0")}-${n}.jpg`; await p.screenshot({ path: f, type: "jpeg", quality: 72 }); shots.push(f); };
const boot = async () => {
  await p.waitForFunction(() => window.__streetUp && window.street?.gta?.active && street.interiors.active?.key === "home" && street.gta.homeEdit.home, { timeout: 600000, polling: 300 });
  await p.evaluate(() => street.gta.hud.coach(-1));
  await sleep(3000);
};
const key = async (code, hold = 120) => { await p.keyboard.down(code); await sleep(hold); await p.keyboard.up(code); await sleep(150); };

/** The vehicles at home: where they stand, and how well (their circles' distance to the walls; each other). */
const parkedState = () => p.evaluate(() => {
  const g = street.gta;
  const V = street.gta.homeEdit.api.Home.site;
  const vs = g.parked.filter((c) => (c.kind === "gt" || c.kind === "moto") && Math.hypot(c.group.position.x - V.door.x, c.group.position.z - V.door.z) < 45);
  const out = vs.map((c) => {
    const q = c.group.position, fx = Math.cos(c.yaw), fz = -Math.sin(c.yaw), r = c.spec.wid / 2, half = c.spec.len / 2 - r;
    let worst = Infinity;
    for (const k of [-1, 0, 1]) worst = Math.min(worst, g.solid.dist(q.x + fx * half * k, q.z + fz * half * k) - r);
    return { kind: c.kind, x: +q.x.toFixed(2), y: +q.y.toFixed(2), z: +q.z.toFixed(2), yaw: +c.yaw.toFixed(2), clear: +worst.toFixed(2), surface: +(g.host.carSurface(q.x, q.z) ?? NaN).toFixed(2) };
  });
  const gap = out.length > 1 ? +Math.hypot(out[0].x - out[1].x, out[0].z - out[1].z).toFixed(2) : null;
  return { out, gap };
});

/** Out of the house: by the door inside, then E (the game's way out), else walk through it. */
async function walkOut() {
  await p.evaluate(() => {
    const w = street.interiors.walk;
    w.camera.position.set(0, 1.6, -1.0);
    w.aim(Math.PI, -0.08);
    const g = street.gta;
    g.player.place(0, 0, -1.0, Math.PI);
    g.player.facing = Math.PI;
    g.cam.behind(Math.PI, -0.12);
    g.cam.snap(g.player.pos.clone().setY(1.35));
  });
  await sleep(1200);
  for (let i = 0; i < 4; i++) {
    await key("KeyE", 200);
    const out = await p.waitForFunction(() => !street.interiors.active, { timeout: 8000, polling: 200 }).then(() => true, () => false);
    if (out) break;
  }
  await p.waitForFunction(() => !street.interiors.active, { timeout: 60000, polling: 200 });
  await sleep(2500);
}

/** On foot to a vehicle of `kind`, F: in it. */
async function board(kind) {
  const r = await p.evaluate(async (kind) => {
    const g = street.gta;
    const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
    const v = g.parked.find((c) => c.kind === kind);
    if (!v) return { ok: false, why: "none" };
    // (another vehicle in the way, as a player walks round it: by its tail first)
    const via = [];
    for (const o of g.parked) {
      if (o === v || Math.hypot(o.group.position.x - v.group.position.x, o.group.position.z - v.group.position.z) > 12) continue;
      const ax = g.player.pos.x, az = g.player.pos.z, bx = v.group.position.x, bz = v.group.position.z, ox = o.group.position.x, oz = o.group.position.z;
      const L = Math.hypot(bx - ax, bz - az), t = Math.max(0, Math.min(1, ((ox - ax) * (bx - ax) + (oz - az) * (bz - az)) / (L * L)));
      if (Math.hypot(ax + (bx - ax) * t - ox, az + (bz - az) * t - oz) < 2.2) via.push({ x: ox - Math.cos(o.yaw) * (o.spec.len / 2 + 1.3), z: oz + Math.sin(o.yaw) * (o.spec.len / 2 + 1.3) });
    }
    send("keydown", "KeyW");
    let best = Infinity, stuck = 0, dodge = 0, side = 1, okk = false;
    for (let i = 0; i < 900; i++) {
      const goal = via.length ? via[0] : { x: v.group.position.x, z: v.group.position.z };
      const dx = goal.x - g.player.pos.x, dz = goal.z - g.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (via.length && d < 0.8) { via.shift(); best = Infinity; continue; }
      if (!via.length && d < (kind === "moto" ? 1.6 : 2.6)) { okk = true; break; }
      if (d < best - 0.05) (best = d), (stuck = 0);
      else if (++stuck > 14) (dodge = 16), (stuck = 0), (side = -side);
      const a = Math.atan2(dx, dz) + (dodge-- > 0 ? side * 1.2 : 0);
      g.player.facing = a + Math.PI;
      g.cam.behind(g.player.facing, -0.1);
      await new Promise((r) => setTimeout(r, 30));
    }
    send("keyup", "KeyW");
    return { ok: okk, best: +best.toFixed(2) };
  }, kind);
  await sleep(300);
  await key("KeyF", 150);
  await sleep(1200);
  const inIt = await p.evaluate(() => street.gta.car?.kind ?? null);
  return { ...r, inIt };
}

/**
 * At the wheel along `pts` (W / S / A / D as a player): eased in the court, backing up a moment
 * with the wheel the other way when held by something. Notes every wall hit and any fling.
 */
const drive = (pts, o = {}) => p.evaluate(async (pts, o) => {
  const g = street.gta;
  const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  const held = new Set();
  const hold = (code, on) => {
    if (on && !held.has(code)) (held.add(code), send("keydown", code));
    if (!on && held.has(code)) (held.delete(code), send("keyup", code));
  };
  const car = g.car;
  if (!car) return { ok: false, why: "not in a vehicle" };
  let k = 0, back = 0, stuckT = 0, hits = [], maxV = 0, backs = 0, worst = Infinity, lastP = car.group.position.clone(), jump = 0;
  const t0 = performance.now();
  const limit = o.t ?? 45000;
  let done = false;
  while (performance.now() - t0 < limit) {
    const p = car.group.position;
    jump = Math.max(jump, Math.hypot(p.x - lastP.x, p.z - lastP.z));
    lastP.copy(p);
    if (!g.car) return { ok: false, why: "out of the vehicle", at: [p.x, p.z] };
    const last = k === pts.length - 1;
    while (k < pts.length - 1 && Math.hypot(pts[k].x - p.x, pts[k].z - p.z) < (pts[k].r ?? 2.5)) k++;
    const tx = pts[k].x, tz = pts[k].z;
    const dist = Math.hypot(tx - p.x, tz - p.z);
    if (k === pts.length - 1 && dist < (pts[k].r ?? 1.6)) {
      done = true;
      break;
    }
    const fx = Math.cos(car.yaw), fz = -Math.sin(car.yaw);
    const want = Math.atan2(tz - p.z, tx - p.x), have = Math.atan2(fz, fx);
    let d = want - have;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    maxV = Math.max(maxV, Math.abs(car.speed));
    if (car.hit && car.hit.what !== "car") hits.push({ at: [+car.hit.x.toFixed(1), +car.hit.z.toFixed(1)], v: +car.hit.speed.toFixed(1), what: car.hit.what });
    const r = car.spec.wid / 2, half = car.spec.len / 2 - r;
    for (const s of [-1, 0, 1]) worst = Math.min(worst, g.solid.dist(p.x + fx * half * s, p.z + fz * half * s) - r);
    if (Math.abs(car.speed) < 0.4 && back <= 0 && performance.now() - t0 > 1500) stuckT += 50;
    else stuckT = 0;
    if (stuckT > 1300) (back = 1300), (stuckT = 0), backs++;
    const target = o.v ?? 6;
    if (back > 0) {
      back -= 50;
      hold("KeyW", false);
      hold("KeyS", true);
      hold("KeyA", d > 0);
      hold("KeyD", d < 0);
    } else {
      // (a sharp turn ahead: slow; the wheel hard over)
      const fast = car.speed > (Math.abs(d) > 0.6 ? 3 : target);
      hold("KeyS", car.speed > target + 3);
      hold("KeyW", !fast);
      hold("KeyD", d > 0.05);
      hold("KeyA", d < -0.05);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  for (const c of [...held]) hold(c, false);
  // stop
  send("keydown", "KeyS");
  for (let i = 0; i < 40 && Math.abs(car.speed) > 0.3; i++) await new Promise((r) => setTimeout(r, 50));
  send("keyup", "KeyS");
  const q = car.group.position;
  return { ok: done, t: +((performance.now() - t0) / 1000).toFixed(1), at: [+q.x.toFixed(1), +q.z.toFixed(1)], hits: hits.slice(0, 6), nHits: hits.length, backs, maxV: +maxV.toFixed(1), worst: +worst.toFixed(2), jump: +jump.toFixed(2) };
}, pts, o);

/** F: out of the vehicle; where you stand. */
async function alight() {
  await key("KeyF", 150);
  await sleep(1000);
  return p.evaluate(() => {
    const g = street.gta;
    const q = g.player.pos;
    const h = g.host;
    const t = g.solid.topAt(q.x, q.z);
    return { out: !g.car, at: [+q.x.toFixed(2), +q.z.toFixed(2)], y: +q.y.toFixed(2), blocked: h.footBlocked(q.x, q.z), foot: g.solid.foot(q.x, q.z, t ?? q.y).ok, top: t === undefined ? null : +t.toFixed(2) };
  });
}

// ---- PLAY ---------------------------------------------------------------------------------------------
await p.goto(URL);
const tBoot = Date.now();
await boot();
const solidT = await p.evaluate(async () => { const t0 = performance.now(); while (!(street.gta.solid.ready && Number.isFinite(street.gta.solid.dist(300, 630)))) await new Promise((r) => setTimeout(r, 200)); return +((performance.now() - t0) / 1000).toFixed(1); });
console.log("the solid shape round the villa ready", solidT, "s after the home was shown", ((Date.now() - tBoot) / 1000).toFixed(0), "s after load");
const site = await p.evaluate(() => street.gta.homeEdit.api.Home.site);
const V = await p.evaluate(async () => (await import("/src/scene/keys/plan.ts")).VILLA);
const G = { x: (V.gate.x0 + V.gate.x1) / 2, in: V.z1 - 3.2, out: V.z1 + 4.5, street: V.z1 + 14 };
await p.waitForFunction(() => street.gta.solid.ready && Number.isFinite(street.gta.solid.dist(300, 630)), { timeout: 300000, polling: 300 });
// the yacht's berth: 32 × 9 m of open water round VILLA.yacht in the game's solid shape (nothing drawn: a hole)
// (but its 0.7 m along the quay: the solid shape's picture sees a north face this far from its centre a few degrees
// off the vertical, the sea wall's face reading as a sliver in front of it — in front of the cabana's open water too)
const slot = await p.evaluate((V) => {
  const Y = V.yacht, s = street.gta.solid;
  let n = 0, hit = [];
  for (let a = -16; a <= 16; a += 0.5)
    for (let c = -4.5; c <= 4.5; c += 0.25) {
      const x = Y.x + a * Math.cos(Y.yaw) + c * Math.sin(Y.yaw), z = Y.z - a * Math.sin(Y.yaw) + c * Math.cos(Y.yaw);
      if (z > V.z0 - 0.7) continue;
      const t = s.topAt(x, z);
      n++;
      if (t !== undefined && t === t && t > -1.6 - 0.9) hit.push([+x.toFixed(1), +z.toFixed(1), +t.toFixed(2)]);
    }
  return { n, hits: hit.length, first: hit.slice(0, 4) };
}, V);
ok(slot.hits === 0, "the yacht's berth: 32 × 9 m of open water, nothing in it", JSON.stringify(slot));
let st = await parkedState();
console.log("parked", JSON.stringify(st));
const gt0 = st.out.find((v) => v.kind === "gt"), bike0 = st.out.find((v) => v.kind === "moto");
ok(!!gt0 && !!bike0, "the GT and the bike at home");
ok(st.out.every((v) => v.clear > 0.15), "parked clear of the walls, planters and the house", JSON.stringify(st.out.map((v) => [v.kind, v.clear])));
ok(st.gap > 2.6, "side by side, not on each other", st.gap);
ok(st.out.every((v) => Math.abs(v.y - v.surface) < 0.08), "standing on the court's setts", JSON.stringify(st.out.map((v) => [v.kind, v.y, v.surface])));
// nose to the gate: the way out straight ahead
ok(st.out.every((v) => { const fx = Math.cos(v.yaw), fz = -Math.sin(v.yaw); return (fx * (G.x - v.x) + fz * (V.z1 - v.z)) / Math.hypot(G.x - v.x, V.z1 - v.z) > 0.8; }), "both nose to the gate", JSON.stringify(st.out.map((v) => v.yaw)));

// ---- out of the front door: the porch, the camera outside the house -----------------------------------
await walkOut();
const outState = await p.evaluate((V) => {
  const g = street.gta;
  const c = g.cam.camera.position;
  const H = V.house;
  // (inside: within its walls — in the porch cut into its front, behind the door's plane)
  const inHouse = (x, z) => x > H.x0 - 0.1 && x < H.x1 + 0.1 && z > H.z0 - 0.1 && z < (x > V.hall.x0 + 2 && x < V.hall.x1 - 2 ? H.z1 - 1.55 : H.z1 - 0.05);
  return { at: [+g.player.pos.x.toFixed(2), +g.player.pos.z.toFixed(2)], facing: +g.player.facing.toFixed(2), cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], camInHouse: inHouse(c.x, c.z) };
}, V);
await sleep(1500);
const camLater = await p.evaluate((V) => { const c = street.gta.cam.camera.position; const H = V.house; return { cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], inHouse: c.x > H.x0 - 0.1 && c.x < H.x1 + 0.1 && c.z > H.z0 - 0.1 && c.z < (c.x > V.hall.x0 + 2 && c.x < V.hall.x1 - 2 ? H.z1 - 1.55 : H.z1 - 0.05) }; }, V);
console.log("out", JSON.stringify(outState), JSON.stringify(camLater));
ok(Math.hypot(outState.at[0] - V.door.x, outState.at[1] - V.door.z) < 4, "out on the porch");
ok(!outState.camInHouse && !camLater.inHouse, "the camera outside the house (not inside its door)", JSON.stringify(camLater.cam));
await shot("porch");
// how smooth it is out here: on the porch looking over the court, then on the terrace looking over the pool and the dock
const fpsOf = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
let fpsCourt = await fpsOf();
if (fpsCourt < 55) fpsCourt = Math.max(fpsCourt, await fpsOf());
console.log("fps in the court", fpsCourt);
ok(fpsCourt >= 55, "smooth in the court (≥ 55 fps)", fpsCourt);

// ---- the GT: out through the gate, back in, parked --------------------------------------------------
let r = await board("gt");
ok(r.ok && r.inIt === "gt", "walked to the GT and in it", JSON.stringify(r));
await shot("gt-in");
const outPts = [{ x: G.x, z: G.in, r: 2.2 }, { x: G.x, z: V.z1 + 1, r: 2 }, { x: G.x, z: G.street, r: 2.5 }];
let d = await drive(outPts);
console.log("gt out", JSON.stringify(d));
ok(d.ok, "GT: out through the gate onto the street", `${d.t}s`);
ok(d.nHits === 0, "GT: no wall touched on the way out", JSON.stringify(d.hits));
ok(d.jump < 1.5, "GT: no fling", d.jump);
await shot("gt-street");
// back in: from the street through the gate, parked in the court
const home = gt0 ? { x: gt0.x, z: gt0.z } : { x: G.x - 2, z: V.z1 - 9 };
d = await drive([{ x: G.x, z: V.z1 + 3, r: 2 }, { x: G.x, z: G.in, r: 2 }, { x: home.x, z: home.z + 1.2, r: 1.6 }], { v: 5 });
console.log("gt in", JSON.stringify(d));
ok(d.ok, "GT: back in through the gate, parked in the court", `${d.t}s at ${d.at}`);
ok(d.nHits === 0, "GT: no wall touched on the way in", JSON.stringify(d.hits));
let a = await alight();
console.log("gt alight", JSON.stringify(a));
ok(a.out && !a.blocked && a.foot, "out of the GT beside it, on the setts", JSON.stringify(a));
await shot("gt-parked");

// ---- the bike: out and back ---------------------------------------------------------------------------
r = await board("moto");
ok(r.ok && r.inIt === "moto", "walked to the bike and on it", JSON.stringify(r));
d = await drive(outPts, { v: 6 });
console.log("bike out", JSON.stringify(d));
ok(d.ok, "bike: out through the gate onto the street", `${d.t}s`);
ok(d.nHits === 0, "bike: no wall touched on the way out", JSON.stringify(d.hits));
await shot("bike-street");
const bhome = bike0 ? { x: bike0.x, z: bike0.z } : { x: G.x + 2, z: V.z1 - 9 };
d = await drive([{ x: G.x, z: V.z1 + 3, r: 2 }, { x: G.x, z: G.in, r: 2 }, { x: bhome.x, z: bhome.z + 1.2, r: 1.4 }], { v: 5 });
console.log("bike in", JSON.stringify(d));
ok(d.ok, "bike: back in, parked in the court", `${d.t}s at ${d.at}`);
ok(d.nHits === 0, "bike: no wall touched on the way in", JSON.stringify(d.hits));
a = await alight();
console.log("bike alight", JSON.stringify(a));
ok(a.out && !a.blocked && a.foot, "off the bike beside it, on the setts", JSON.stringify(a));
const up = await p.evaluate(() => { const v = street.gta.parked.find((c) => c.kind === "moto"); return { tilt: +Math.abs(v.group.rotation.z).toFixed(2), y: +v.group.position.y.toFixed(2) }; });
ok(up.tilt < 0.5, "the bike stands (on its stand, not on its side)", JSON.stringify(up));
await shot("bike-parked");

// ---- the terrace: smooth there too; down the dock's steps to the yacht's boarding point --------------
await p.evaluate(() => {
  const g = street.gta;
  g.player.place(329, 0.2, 576.2, Math.PI * 0.85);
  g.player.facing = Math.PI * 0.85;
  g.cam.behind(Math.PI * 0.85, -0.12);
  g.cam.snap(g.player.pos.clone().setY(1.55));
});
await sleep(2500);
let fpsTerrace = await fpsOf();
if (fpsTerrace < 55) fpsTerrace = Math.max(fpsTerrace, await fpsOf());
console.log("fps on the terrace", fpsTerrace);
ok(fpsTerrace >= 55, "smooth on the terrace (≥ 55 fps)", fpsTerrace);
const berth = await p.evaluate(async (V) => {
  const g = street.gta;
  const B = V.yacht.board;
  const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  send("keydown", "KeyW");
  for (let i = 0; i < 200; i++) {
    const dx = B.x - g.player.pos.x, dz = B.z - g.player.pos.z;
    if (Math.hypot(dx, dz) < 0.5) break;
    g.player.facing = Math.atan2(dx, dz) + Math.PI;
    g.cam.behind(g.player.facing, -0.1);
    await new Promise((r) => setTimeout(r, 30));
  }
  send("keyup", "KeyW");
  await new Promise((r) => setTimeout(r, 600));
  const label = g.boatAct?.label ?? null;
  return { at: [+g.player.pos.x.toFixed(2), +g.player.pos.z.toFixed(2)], y: +g.player.pos.y.toFixed(2), d: +Math.hypot(B.x - g.player.pos.x, B.z - g.player.pos.z).toFixed(2), label };
}, V);
console.log("berth", JSON.stringify(berth));
ok(berth.d < 1.0 && Math.abs(berth.y - (0.2 - 0.45)) < 0.12, "walked down the dock's steps onto the boarding landing", JSON.stringify(berth));
ok(!!berth.label && /board|aboard/i.test(berth.label), "the game offers to board the yacht there", berth.label);
await shot("berth");

// ---- left on the street, then PLAY again: both back home, nothing on anything ------------------------
r = await board("gt");
d = await drive([{ x: G.x, z: G.in, r: 2.2 }, { x: G.x, z: V.z1 + 1, r: 2 }, { x: G.x, z: G.street + 6, r: 2.5 }], { v: 7 });
await alight();
await p.reload();
await boot();
await p.waitForFunction(() => street.gta.solid.ready && Number.isFinite(street.gta.solid.dist(300, 630)), { timeout: 300000, polling: 300 });
st = await parkedState();
console.log("parked again", JSON.stringify(st));
ok(st.out.length === 2 && st.out.every((v) => v.clear > 0.15) && st.gap > 2.6, "PLAY again: both home, clear, apart", JSON.stringify(st));
await walkOut();
await shot("again");

// ---- the contact sheet (drawn by the browser itself), the step pictures deleted -------------------
if (shots.length) {
  const { readFileSync } = await import("node:fs");
  const urls = shots.map((f) => "data:image/jpeg;base64," + readFileSync(f).toString("base64"));
  const sp = await b.newPage();
  const cols = 4, rows = Math.ceil(urls.length / cols);
  await sp.setViewport({ width: 480 * cols, height: 270 * rows });
  await sp.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},480px)">${urls.map((u) => `<img src="${u}" style="width:480px;height:270px;display:block">`).join("")}</body>`);
  await sp.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await sp.screenshot({ path: `${OUT}/drive-sheet.jpg`, type: "jpeg", quality: 78 });
  await sp.close();
  for (const f of shots) if (existsSync(f)) rmSync(f);
}
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
console.log(fails ? `${fails} FAILED` : "ALL OK");
await b.close();
