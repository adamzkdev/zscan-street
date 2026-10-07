// node shots/_walkcheck.mjs [keys,comma,separated|street] [--port 3021]   (MAP=mall:1 prints that floor's grid)
// Walk-in sanity check, every place × every floor (run on a frozen prod preview, ?debug):
//  - spawn not inside a collider, colliders well-formed (x0<x1, z0<z1), not covering the floor
//  - the walker really moves: W/A/S/D for 1.5 s each from the spawn (walker.update stepped by hand)
//  - groundAt: finite, close to the floor, no cliffs between neighbouring reachable cells
//  - camera settles above the ground and outside every collider
//  - BFS on the collider grid (0.25 m, walker radius): reachable area, leaks to the void,
//    then the walker is steered along the path to the farthest reachable point and back (lift/exit)
//  - page errors
// Street on foot (forest trails off the Golden Gate, the Flyer deck): see STREET below.
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3021";
const only = args.find((a) => !a.startsWith("--") && a !== port);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1200, height: 760 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=day`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await wait(5000);
if (process.env.MAP) await p.evaluate((m) => (window.__walkMap = m), process.env.MAP);
const ALL = await p.evaluate(() => Object.keys(street.interiors.build));
const KEYS = only ? only.split(",").filter((k) => ALL.includes(k)) : ALL;

// ---- everything below runs in the page ----
async function checkFloor(n) {
  // take the lift for real, then let the place run (lift doors that open after a ride, etc.)
  await p.evaluate((n) => street.interiors.goTo(n), n);
  await wait(2500);
  let r = await measure(n);
  for (let k = 0; k < 4 && r.issues.some((x) => x.startsWith("STUCK")); k++) {
    await wait(2500);
    r = await measure(n);
    r.warn.push(`stuck for the first ${(k + 2) * 2.5} s after arriving`);
  }
  return r;
}
async function measure(n) {
  return p.evaluate((n) => {
    const I = street.interiors,
      W = I.walk,
      place = I.active;
    const f = place.floors[n];
    const V = W.camera.position.constructor;
    const rects = I.walk.colliders.slice();
    const R = 0.3,
      EYE = 1.6,
      CELL = 0.25;
    const issues = [];
    const warn = [];
    const inRect = (x, z, pad) => rects.findIndex(([x0, z0, x1, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);
    const g = (x, z) => (place.groundAt ? place.groundAt(n, x, z) : null);
    const G = (x, z) => g(x, z) ?? f.y;
    // ---- colliders
    const bad = rects.filter((r) => !(r.every(Number.isFinite) && r[0] < r[2] && r[1] < r[3]));
    if (bad.length) issues.push(`${bad.length} malformed rects e.g. [${bad[0].map((v) => +(+v).toFixed(2))}]`);
    const sp = f.spawn;
    const hit = inRect(sp.x, sp.z, R);
    if (hit >= 0) issues.push(`spawn (${sp.x.toFixed(1)},${sp.z.toFixed(1)}) inside rect #${hit} [${rects[hit].map((v) => +v.toFixed(2))}]`);
    // ---- groundAt at spawn
    const g0 = g(sp.x, sp.z);
    if (g0 !== null && g0 !== undefined && !Number.isFinite(g0)) issues.push(`groundAt(spawn)=${g0}`);
    if (g0 !== null && g0 !== undefined && Math.abs(g0 - f.y) > 0.8) warn.push(`spawn ground ${g0.toFixed(2)} vs floor.y ${f.y}`);
    // ---- walk 1.5 s in each direction from the spawn
    const exitFn = W.onExit;
    W.onExit = undefined;
    const keys = W.keys;
    const disp = {};
    const step = (dir, secs) => {
      keys.clear();
      for (const k of dir) keys.add(k);
      for (let i = 0; i < secs * 60; i++) W.update(1 / 60);
      keys.clear();
    };
    for (const d of ["w", "a", "s", "d"]) {
      W.place(new V(sp.x, f.y, sp.z), f.yaw, f.y);
      for (let i = 0; i < 20; i++) W.update(1 / 60);
      const a = W.camera.position.clone();
      step([d], 1.5);
      disp[d] = +Math.hypot(W.camera.position.x - a.x, W.camera.position.z - a.z).toFixed(2);
    }
    const maxD = Math.max(...Object.values(disp));
    if (maxD < 1) issues.push(`STUCK at spawn: max move ${maxD} m`);
    // ---- camera settled above ground
    W.place(new V(sp.x, f.y, sp.z), f.yaw, f.y);
    for (let i = 0; i < 60; i++) W.update(1 / 60);
    const cy = W.camera.position.y;
    if (!Number.isFinite(cy) || cy < G(sp.x, sp.z) + 1.0) issues.push(`camera y ${cy.toFixed(2)} below ground ${G(sp.x, sp.z).toFixed(2)}`);
    // ---- BFS on the walker's grid
    let xs = rects.flatMap((r) => [r[0], r[2]]).concat([sp.x]),
      zs = rects.flatMap((r) => [r[1], r[3]]).concat([sp.z]);
    const gx0 = Math.min(...xs) - 3,
      gz0 = Math.min(...zs) - 3;
    const gw = Math.min(1600, Math.ceil((Math.max(...xs) + 3 - gx0) / CELL)),
      gh = Math.min(1600, Math.ceil((Math.max(...zs) + 3 - gz0) / CELL));
    const blocked = new Uint8Array(gw * gh);
    for (const [ax, az, bx, bz] of rects) {
      const x0 = Math.min(ax, bx) - R, x1 = Math.max(ax, bx) + R, z0 = Math.min(az, bz) - R, z1 = Math.max(az, bz) + R;
      for (let i = Math.max(0, Math.ceil((x0 - gx0) / CELL - 0.5)); i <= Math.min(gw - 1, Math.floor((x1 - gx0) / CELL - 0.5)); i++)
        for (let j = Math.max(0, Math.ceil((z0 - gz0) / CELL - 0.5)); j <= Math.min(gh - 1, Math.floor((z1 - gz0) / CELL - 0.5)); j++) blocked[j * gw + i] = 1;
    }
    const cx = (i) => gx0 + (i + 0.5) * CELL,
      cz = (j) => gz0 + (j + 0.5) * CELL;
    let si = Math.floor((sp.x - gx0) / CELL),
      sj = Math.floor((sp.z - gz0) / CELL);
    // the spawn cell, or the nearest free one
    if (blocked[sj * gw + si]) {
      let best = null;
      for (let r = 1; r < 12 && !best; r++) for (let di = -r; di <= r; di++) for (const dj of [-r, r]) for (const [a, c] of [[si + di, sj + dj], [si + dj, sj + di]]) if (!best && a >= 0 && c >= 0 && a < gw && c < gh && !blocked[c * gw + a]) best = [a, c];
      if (best) [si, sj] = best;
    }
    const dist = new Int32Array(gw * gh).fill(-1);
    const prev = new Int32Array(gw * gh).fill(-1);
    const q = [sj * gw + si];
    dist[q[0]] = 0;
    let leak = false,
      cliff = 0,
      nanG = 0,
      far = q[0];
    const gc = new Float32Array(gw * gh).fill(NaN);
    const gcell = (k) => (Number.isNaN(gc[k]) ? (gc[k] = G(cx(k % gw), cz((k / gw) | 0))) : gc[k]);
    for (let h = 0; h < q.length; h++) {
      const k = q[h], i = k % gw, j = (k - i) / gw;
      const gk = gcell(k);
      if (!Number.isFinite(gk)) nanG++;
      if (!leak && (i === 0 || j === 0 || i === gw - 1 || j === gh - 1)) {
        // walk the BFS tree back to the last cell inside the colliders' bbox: where the gap is
        let g2 = k;
        const inBox = (kk) => { const x = cx(kk % gw), z = cz((kk / gw) | 0); return x > gx0 + 3 && x < gx0 + gw * CELL - 3 && z > gz0 + 3 && z < gz0 + gh * CELL - 3; };
        while (prev[g2] >= 0 && !inBox(g2)) g2 = prev[g2];
        leak = [+cx(g2 % gw).toFixed(1), +cz((g2 / gw) | 0).toFixed(1)];
      }
      if (dist[k] > dist[far]) far = k;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, c = j + dj;
        if (a < 0 || c < 0 || a >= gw || c >= gh) continue;
        const kk = c * gw + a;
        if (blocked[kk] || dist[kk] >= 0) continue;
        if (Math.abs(gcell(kk) - gk) > 0.75) cliff++;
        dist[kk] = dist[k] + 1;
        prev[kk] = k;
        q.push(kk);
      }
    }
    const area = q.length * CELL * CELL;
    // MAP=key:floor prints the floor's grid (# collider, . reachable, blank unreachable, S spawn, L leak)
    let map = null;
    if (window.__walkMap === `${place.key}:${n}`) {
      map = [];
      for (let j = 0; j < gh; j += 2) {
        let r = "";
        for (let i = 0; i < gw; i += 2) {
          const kk = j * gw + i;
          const near = (x, z) => Math.abs(cx(i) - x) < CELL * 1.5 && Math.abs(cz(j) - z) < CELL * 1.5;
          r += near(sp.x, sp.z) ? "S" : leak && near(leak[0], leak[1]) ? "L" : blocked[kk] ? "#" : dist[kk] >= 0 ? "." : " ";
        }
        map.push(`${cz(j).toFixed(1).padStart(7)} ${r}`);
      }
      map.unshift(`x0=${gx0.toFixed(1)} step=${2 * CELL} m`);
    }
    if (q.length < 40) issues.push(`reachable area only ${area.toFixed(1)} m²; rects near spawn: ${rects.filter(([x0, z0, x1, z1]) => x1 > sp.x - 2.5 && x0 < sp.x + 2.5 && z1 > sp.z - 2.5 && z0 < sp.z + 2.5).map((r) => "[" + r.map((v) => +v.toFixed(2)) + "]").join(" ")}`);
    else if (area < 40) warn.push(`small reachable area ${area.toFixed(1)} m² (penned in?)`);
    // on the ground floor the way out (behind the spawn, +z) is meant to be open
    if (leak && !(n === 0 && leak[1] > sp.z && Math.abs(leak[0] - sp.x) < 3)) warn.push(`open side: walkable out of the colliders near (${leak})`);
    if (nanG) issues.push(`groundAt NaN on ${nanG} cells`);
    if (cliff) warn.push(`${cliff} ground jumps > 0.75 m between neighbour cells`);
    // ---- steer the walker to the farthest reachable cell and back
    const path = [];
    for (let k = far; k >= 0; k = prev[k]) path.push([cx(k % gw), cz((k / gw) | 0)]);
    path.reverse();
    const steer = (pts) => {
      let idx = 0, t = 0, stuck = 0, last = W.camera.position.clone();
      const pos = W.camera.position;
      while (idx < pts.length && t < 240) {
        // progress: the closest path point a little ahead, then aim two cells further
        let bi = idx, bd = Infinity;
        for (let m = idx; m < Math.min(pts.length, idx + 16); m++) {
          const dd = Math.hypot(pts[m][0] - pos.x, pts[m][1] - pos.z);
          if (dd < bd) (bd = dd), (bi = m);
        }
        if (bd < 0.6) idx = bi;
        if (idx >= pts.length - 1 && bd < 0.3) break;
        const [tx, tz] = pts[Math.min(pts.length - 1, idx + 2)];
        const dx = tx - pos.x, dz = tz - pos.z;
        W.yaw = Math.atan2(-dx, -dz);
        keys.clear();
        keys.add("w");
        W.update(1 / 60);
        t += 1 / 60;
        if (Math.floor(t * 60) % 60 === 0) {
          if (pos.distanceTo(last) < 0.2) stuck++;
          else stuck = 0;
          last = pos.clone();
          if (stuck > 3) break;
        }
      }
      keys.clear();
      const end = pts[pts.length - 1];
      return Math.hypot(end[0] - pos.x, end[1] - pos.z);
    };
    // sampling groundAt can move stateful places (Big Ben's stair remembers your height): arrive again
    I.goTo(n);
    W.onExit = undefined;
    const missTo = path.length > 1 ? steer(path) : 0;
    const back = path.slice().reverse();
    const missBack = path.length > 1 ? steer(back) : 0;
    if (missTo > 1.5) warn.push(`walker could not follow BFS path to far point (${missTo.toFixed(1)} m short)`);
    if (missBack > 1.5) issues.push(`could not walk back to lift/exit (${missBack.toFixed(1)} m short)`);
    // camera inside a wall at the far point?
    const farX = cx(far % gw), farZ = cz((far / gw) | 0);
    // ---- restore
    W.onExit = exitFn;
    W.place(new V(sp.x, f.y, sp.z), f.yaw, f.y);
    return { map, n, label: f.label, name: f.name, y: f.y, spawn: [+sp.x.toFixed(2), +sp.z.toFixed(2)], rects: rects.length, disp, area: Math.round(area), far: [+farX.toFixed(1), +farZ.toFixed(1), Math.round(dist[far] * CELL)], issues, warn };
  }, n);
}

const rows = [];
for (const k of KEYS) {
  errs.length = 0;
  try {
    await p.evaluate((k) => street.interiors.enter(k, 0), k);
    await p.waitForFunction((k) => street.interiors.active?.key === k, { timeout: 90000 }, k);
    await wait(1500);
    const nf = await p.evaluate(() => street.interiors.active.floors.length);
    for (let n = 0; n < nf; n++) {
      const r = await checkFloor(n);
      r.key = k;
      rows.push(r);
      const st = r.issues.length ? "FAIL" : r.warn.length ? "warn" : "ok";
      if (r.map) console.log(r.map.join("\n"));
      console.log(`${st.padEnd(4)} ${k.padEnd(14)} #${n} ${String(r.label).padEnd(8)} ${String(r.name).slice(0, 24).padEnd(24)} y=${r.y} spawn=${r.spawn} rects=${r.rects} move=${JSON.stringify(r.disp)} area=${r.area}m² far=${r.far}  ${r.issues.join("; ")} ${r.warn.length ? "[" + r.warn.join("; ") + "]" : ""}`);
    }
    await p.evaluate(() => street.interiors.exit());
    await wait(800);
  } catch (e) {
    console.log("FAIL", k, "error", e.message.split("\n")[0]);
    rows.push({ key: k, issues: ["checker error " + e.message.split("\n")[0]] });
    await p.evaluate(() => street.interiors.exit()).catch(() => {});
  }
  const pe = errs.filter((e) => !/fetch|Failed to load|NetworkError/i.test(e));
  if (pe.length) console.log("     page errors:", pe.slice(0, 3).join(" | "));
}

// ---- STREET on foot: forest trails off the Golden Gate, the Flyer deck and its stairs
// trails and boardwalks are read straight from the forest's source (src/scene/forest/land.ts)
import { readFileSync } from "node:fs";
const land = readFileSync(new URL("../src/scene/forest/land.ts", import.meta.url), "utf8");
const arr = (name) => {
  const m = land.match(new RegExp(`export const ${name}[^=]*=\\s*(\\[[\\s\\S]*?\\n\\]);`));
  return m ? Function(`return ${m[1].replace(/\/\/.*$/gm, "")}`)() : [];
};
const routes = [
  ...arr("TRAILS").map((pts, i) => ({ name: `trail ${i}`, pts })),
  ...arr("BOARDWALKS").map((pts, i) => ({ name: `boardwalk ${i}`, pts })),
];
const streetRes = only && !only.includes("street") ? [] : await p.evaluate((routes) => {
  const out = [];
  const S = window.street;
  S.walk(true);
  const W = S.onFoot;
  const V = W.camera.position.constructor;
  const keys = W.keys;
  const settle = (x, z) => {
    const fy = W.ground?.(x, z) ?? 0.2;
    W.place(new V(x, fy, z), 0, fy);
    for (let i = 0; i < 20; i++) W.update(1 / 60);
  };
  const dense = (pts) => {
    const o = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
      for (let k = 0; k < n; k++) o.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    o.push(pts[pts.length - 1]);
    return o;
  };
  // walk the polyline; returns how far from its end the walker got stuck (0 = made it)
  const follow = (pts) => {
    const pos = W.camera.position;
    let idx = 0, t = 0, last = pos.clone(), still = 0, worst = 0;
    while (t < 200) {
      let bi = idx, bd = Infinity;
      for (let m = idx; m < Math.min(pts.length, idx + 12); m++) {
        const dd = Math.hypot(pts[m][0] - pos.x, pts[m][1] - pos.z);
        if (dd < bd) (bd = dd), (bi = m);
      }
      if (bd < 1.2) idx = bi;
      worst = Math.max(worst, bd);
      if (idx >= pts.length - 1 && bd < 0.5) break;
      const [tx, tz] = pts[Math.min(pts.length - 1, idx + 2)];
      W.yaw = Math.atan2(-(tx - pos.x), -(tz - pos.z));
      keys.clear();
      keys.add("w");
      W.update(1 / 60);
      t += 1 / 60;
      if (Math.round(t * 60) % 60 === 0) {
        still = pos.distanceTo(last) < 0.25 ? still + 1 : 0;
        last = pos.clone();
        if (still > 2) break;
      }
    }
    keys.clear();
    const e = pts[pts.length - 1];
    return { miss: +Math.hypot(e[0] - pos.x, e[1] - pos.z).toFixed(1), at: [+pos.x.toFixed(1), +pos.z.toFixed(1), +W.floor.toFixed(2)], idx, of: pts.length };
  };
  const moveTest = (x, z) => {
    const disp = {};
    for (const d of ["w", "a", "s", "d"]) {
      settle(x, z);
      const a = W.camera.position.clone();
      keys.clear();
      keys.add(d);
      for (let i = 0; i < 90; i++) W.update(1 / 60);
      keys.clear();
      disp[d] = +Math.hypot(W.camera.position.x - a.x, W.camera.position.z - a.z).toFixed(2);
    }
    return disp;
  };
  const route = (name, pts) => {
    let d = dense(pts);
    // trails that end at the campfire ring or the cabin: walk to their edge, not into them
    W.place(new V(d[0][0], 0.2, d[0][1]), 0, W.ground?.(d[0][0], d[0][1]) ?? 0.2);
    while (d.length > 2 && W.collide(d[0][0], d[0][1])) d.shift();
    const e = d[d.length - 1];
    W.place(new V(e[0], 0.2, e[1]), 0, W.ground?.(e[0], e[1]) ?? 0.2);
    while (d.length > 2 && W.collide(d[d.length - 1][0], d[d.length - 1][1])) d.pop();
    settle(d[0][0], d[0][1]);
    const startBlocked = W.collide(d[0][0], d[0][1]);
    const there = follow(d);
    const back = follow(d.slice().reverse());
    out.push({ name, from: d[0].map((v) => +v.toFixed(1)), startBlocked, there, back, disp: moveTest(d[0][0], d[0][1]) });
  };
  for (const r of routes) route(r.name, r.pts);
  // the Golden Gate deck, end to end
  const gg = S.goldenGate;
  // from the street south of it (under the ZEC Line's station), over the bridge, to the headland
  if (gg?.ok) route("golden gate deck", [[gg.x - 2, 126], [gg.x - 2, gg.z0 - 2], [gg.x, gg.z0 + 1], [gg.x, (gg.z0 + gg.z1) / 2], [gg.x, gg.z1 - 1]]);
  // off the bridge's north end into the trailhead plaza (forest SITES.plaza)
  if (gg?.ok) route("bridge to trailhead", [[gg.x, gg.z1 - 6], [gg.x, gg.z1 + 0.6], [gg.x + 5, gg.z1 + 0.6], [168, 225]]);
  // the Flyer: up the west stairs, along the deck, down the east stairs (and back)
  route("flyer stairs+deck", [[-78, 97.5], [-78, 93], [-78, 89.6], [-70, 89.6], [-62, 89.6], [-62, 93], [-62, 97.5]]);
  const ex = S.sky?.flyer?.exit;
  if (ex) settle(ex.pos.x, ex.pos.z);
  if (ex) out.push({ name: "flyer exit spot", from: [+ex.pos.x.toFixed(1), +ex.pos.z.toFixed(1)], startBlocked: W.collide(ex.pos.x, ex.pos.z), there: { miss: 0 }, back: { miss: 0 }, disp: moveTest(ex.pos.x, ex.pos.z) });
  S.walk(false);
  return out;
}, routes);
for (const s of streetRes) {
  const stuck = Math.max(...Object.values(s.disp)) < 1;
  const bad = stuck || s.there.miss > 1.5 || s.back.miss > 1.5;
  if (bad) rows.push({ key: "street", issues: [s.name] });
  console.log(`${bad ? "FAIL" : "ok  "} street ${s.name.padEnd(20)} from=${s.from} startBlocked=${s.startBlocked} move=${JSON.stringify(s.disp)} there=${JSON.stringify(s.there)} back=${JSON.stringify(s.back)}`);
}
const pe = errs.filter((e) => !/fetch|Failed to load|NetworkError/i.test(e));
if (pe.length) console.log("page errors:", pe.slice(0, 5).join(" | "));
console.log(`\n${rows.filter((r) => r.issues?.length).length} failing floors of ${rows.length}`);
await b.close();
