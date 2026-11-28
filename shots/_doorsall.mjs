// node shots/_doorsall.mjs [OUT]: every place door and every building door in the game (src/gta): stand 6 m in front facing it,
// a screenshot each (contact sheets), and a check per door — it faces a street (the asphalt straight out in front, within 22 m,
// and the nearest asphalt that way), it is visible (nothing between the eye and the door), E is offered 1.2 m in front of it,
// the building's own wall is right behind it (a door on a facade, not in the air: beside it or behind it) — written to <OUT>.csv and <OUT>-fail.txt.
// env: SHOTS=0 to skip the pictures, ONLY=place|building, LIMIT=n
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const [OUT = "shots/gta/doorsall/d"] = process.argv.slice(2);
fs.mkdirSync(OUT.replace(/\/[^/]*$/, ""), { recursive: true });
const SHOTS = process.env.SHOTS !== "0";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 1800000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 640, height: 360 } });
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
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&solo");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.gta.doorsReady, { timeout: 900000, polling: 300 });
await new Promise((r) => setTimeout(r, 4000));
// the far city has streamed in: the solid shape again (its first one can miss the outer blocks)
await p.evaluate(() => street.gta.solid.build());
// (and the place doors found again on it)
await p.evaluate(() => street.gta.findPlaceDoors());
await p.evaluate(() => {
  const g = street.gta;
  g.buildingSpots = null;
  g.hud.coach(-1);
  const hud = document.querySelector(".gta-hud");
  if (hud) hud.style.display = "none";
  g.nearDoors(g.player.pos.x, g.player.pos.z);
});
await p.waitForFunction(() => !!street.gta.buildingSpots, { timeout: 60000, polling: 300 });
const doors = await p.evaluate((only) => {
  const g = street.gta;
  const V = g.player.pos.constructor;
  const scene = street.scene3;
  scene.updateMatrixWorld(true);
  // static meshes with their world bounding spheres (people, the doors' rings, cars that move, the player: left out)
  // (what moves: the game's own list, the one its solid shape leaves out — people, cars, the doors' rings)
  const skip = new Set(g.movers());
  const statics = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible || o.isBatchedMesh || o.isSprite) return;
    for (let q = o; q; q = q.parent) if (skip.has(q) || !q.visible) return;
    const m = o.material;
    if (!m || (Array.isArray(m) ? m.every((x) => x.transparent && x.opacity < 0.5) : m.transparent && m.opacity < 0.5)) return;
    if (o.isInstancedMesh) {
      if (!o.boundingSphere) o.computeBoundingSphere();
    } else if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const s = (o.isInstancedMesh ? o.boundingSphere : o.geometry.boundingSphere).clone().applyMatrix4(o.matrixWorld);
    statics.push({ o, c: s.center, r: s.radius });
  });
  const ray = street.ray;
  const hitAlong = (from, to) => {
    const d = to.clone().sub(from);
    const len = d.length();
    d.normalize();
    const cand = [];
    for (const s of statics) {
      // the segment's distance to the sphere's centre
      const t = Math.max(0, Math.min(len, s.c.clone().sub(from).dot(d)));
      const q = from.clone().addScaledVector(d, t);
      if (q.distanceTo(s.c) < s.r) cand.push(s.o);
    }
    ray.set(from, d);
    ray.far = len + 2;
    const hits = ray.intersectObjects(cand, false);
    return hits[0] ? { d: hits[0].distance, len, name: (hits[0].object.name || hits[0].object.parent?.name || hits[0].object.type).slice(0, 24) } : { d: Infinity, len, name: "" };
  };
  const roadAt = (x, z) => g.roads.road(x, z);
  const list = [];
  const add = (d, kind) => list.push({ kind, key: d.key, label: d.label ?? "", type: d.type ?? "", x: d.x, z: d.z, fx: d.fx, fz: d.fz, y: d.y ?? 0.2, bare: !!d.bare, wall: d.wall });
  if (only !== "building") for (const d of g.placeSpots) add(d, "place");
  if (only !== "place") for (const d of g.buildingSpots) add(d, "building");
  for (const d of list) {
    const fl = Math.hypot(d.fx, d.fz) || 1;
    const fx = d.fx / fl,
      fz = d.fz / fl;
    // straight out: the asphalt within 22 m
    let ahead = Infinity;
    for (let k = 0.5; k < 40; k += 0.5)
      if (roadAt(d.x + fx * k, d.z + fz * k)) {
        ahead = k;
        break;
      }
    // open ground straight out (a plaza, a park, a quay, a flight of steps down to one): walkable, a
    // step at a time from the door's level, unbroken (a place's own floors first: the opera's steps)
    let open = 0;
    let fy = d.y;
    for (let k = 0.5; k <= 30; k += 0.5) {
      const x = d.x + fx * k,
        z = d.z + fz * k;
      const t = g.host.ground(x, z) ?? g.solid.topAt(x, z);
      if (t === undefined || t === null || t !== t || Math.abs(t - fy) > 0.65 || g.host.sea?.(x, z)) break;
      fy = t;
      open = k;
    }
    // the nearest asphalt any way (64 directions); the angle to the one nearest the facing among those
    // about as near (a door at a corner has two streets)
    const dirs = [];
    let near = Infinity;
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * Math.PI * 2;
      const ux = Math.cos(ang),
        uz = Math.sin(ang);
      for (let k = 0.5; k < 40; k += 0.5)
        if (roadAt(d.x + ux * k, d.z + uz * k)) {
          dirs.push([k, ux, uz]);
          near = Math.min(near, k);
          break;
        }
    }
    let best = -2;
    for (const [k, ux, uz] of dirs) if (k <= near + 2) best = Math.max(best, fx * ux + fz * uz);
    const angle = best > -2 ? Math.round((Math.acos(Math.max(-1, Math.min(1, best))) * 180) / Math.PI) : -1;
    // the wall right behind: what stops you on foot (the solid shape over 2 m, the plan's building) 0.3…2 m
    // behind the door's line, behind it or beside it (±1.2 m): a door on a facade, not in the air
    const tall = (x, z) => {
      const t = g.solid.topAt(x, z);
      return (t !== undefined && t === t && t > d.y + 2) || g.host.nav.wall(x, z) || g.host.footBlocked(x, z);
    };
    let wall = false;
    for (const side of [-1.2, 0, 1.2]) for (let k = 0.3; k < 2.1 && !wall; k += 0.3) wall = tall(d.x - fx * k - fz * side, d.z - fz * k + fx * side);
    // visible: from an eye 6 m out to the door — its middle (1.6 m → 1.2 m), its head (from the game camera's
    // height) and its lower half (a low sign, a hedge), each across its width (left, middle, right: a thin
    // post hides one of three); seen = its middle, and its head or its lower half
    const rx = -fz,
      rz = fx;
    const level = (ye, yd) => {
      let n = 0,
        first = null;
      for (const a of [-0.5, 0, 0.5]) {
        const hh = hitAlong(new V(d.x + fx * 6 + rx * a * 0.5, d.y + ye, d.z + fz * 6 + rz * a * 0.5), new V(d.x + fx * 0.15 + rx * a, d.y + yd, d.z + fz * 0.15 + rz * a));
        if (hh.d >= hh.len - 0.6) n++;
        else first ??= hh;
      }
      return { ok: n >= 2, h: first };
    };
    const mid = level(1.6, 1.2),
      head = level(2.3, 2.1),
      low = level(1.1, 0.7);
    const visible = mid.ok && (head.ok || low.ok);
    const h = (!mid.ok ? mid.h : !head.ok ? head.h : low.h) ?? { name: "", d: 0 };
    // E offered 1.2 m in front, facing it
    if (d.kind === "building") g.nearDoors(d.x + fx * 1.2, d.z + fz * 1.2);
    g.doors.update(0, { x: d.x + fx * 1.2, z: d.z + fz * 1.2, heading: Math.atan2(fx, fz) });
    const e = g.doors.at?.key === d.key;
    // an island's place (no street there): its ferry's landing at its door, or in front of it within 60 m
    let ferry = false;
    for (const f of g.ferries ?? []) {
      const dx = f.x - d.x,
        dz = f.z - d.z,
        r = Math.hypot(dx, dz);
      if (r < 6 || (r < 60 && (dx * fx + dz * fz) / r > 0.25)) ferry = true;
    }
    Object.assign(d, { ferry, open, ahead, near, angle, wall, visible, blocker: visible ? "" : `${h.name}@${(+h.d).toFixed(1)}`, e });
  }
  return list;
}, process.env.ONLY ?? null);
const fail = (d) => {
  const why = [];
  d.ahead ??= Infinity;
  // a street straight out (a monument's forecourt can be deeper), or a plaza / park in front of it; the angle
  // to the nearest street is logged (a corner building faces its main street, a side street may be nearer)
  // (a shop on a market lane: the street at its end, a lane's width further)
  const lim = d.kind === "place" ? 30 : 25;
  if (!(d.ahead <= lim) && !(d.open >= 15 || d.ferry)) why.push(`faces no street or plaza (street ${d.ahead === null || d.ahead === Infinity ? "none" : d.ahead + " m"}, open ${d.open} m, nearest street ${d.angle}° off)`);
  if (!d.visible) why.push(`hidden (${d.blocker})`);
  if (!d.e) why.push("no E");
  if (!d.wall && !d.bare && d.kind === "building") why.push("no wall behind");
  return why;
};
const lines = ["kind,key,label,type,x,z,fx,fz,ahead,open,near,angle,wall,visible,e,fail"];
const fails = [];
for (const d of doors) {
  const why = fail(d);
  if (why.length) fails.push(`${d.kind} ${d.key} ${d.label} [${d.type}] (${d.x.toFixed(1)}, ${d.z.toFixed(1)}): ${why.join("; ")}`);
  lines.push([d.kind, d.key, JSON.stringify(d.label), d.type, d.x.toFixed(1), d.z.toFixed(1), d.fx.toFixed(2), d.fz.toFixed(2), d.ahead, d.open, d.near, d.angle, d.wall, d.visible, d.e, JSON.stringify(why.join("; "))].join(","));
}
fs.writeFileSync(`${OUT}.csv`, lines.join("\n"));
fs.writeFileSync(`${OUT}-fail.txt`, fails.join("\n"));
console.log(`doors ${doors.length} (places ${doors.filter((d) => d.kind === "place").length}, buildings ${doors.filter((d) => d.kind === "building").length}); failing ${fails.length}`);
const tally = {};
for (const d of doors) for (const w of fail(d)) tally[w.replace(/\(.*\)|\d+/g, "").trim()] = (tally[w.replace(/\(.*\)|\d+/g, "").trim()] ?? 0) + 1;
console.log(JSON.stringify(tally));
if (SHOTS) {
  // the pictures, 16 to a contact sheet (<OUT>-sheet-N.jpg); the single ones go
  const { execSync } = await import("node:child_process");
  const tmp = fs.mkdtempSync(`${OUT}-tmp-`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const lim = Number(process.env.LIMIT ?? 9999);
  const list = process.env.FAILED ? doors.filter((d) => fail(d).length) : doors;
  const files = [];
  for (const d of list.slice(0, lim)) {
    await p.evaluate((d) => {
      const g = street.gta;
      const fl = Math.hypot(d.fx, d.fz) || 1;
      const fx = d.fx / fl,
        fz = d.fz / fl;
      const h = Math.atan2(fx, fz);
      // (the camera's arm is 3.2 m behind the body: the eye 6 m out)
      g.player.place(d.x + fx * 2.8, d.y, d.z + fz * 2.8, h);
      g.player.group.scale.setScalar(0.001);
      g.cam.behind(h, -0.06);
      g.cam.snap(g.player.pos.clone().setY(d.y + 1.6));
      if (d.kind === "building") g.nearDoors(d.x, d.z);
    }, d);
    await sleep(700);
    const f = `${tmp}/${String(files.length + 1).padStart(3, "0")}.png`;
    await p.screenshot({ path: f });
    files.push(f);
  }
  for (let i = 0; i < files.length; i += 16) execSync(`montage ${files.slice(i, i + 16).join(" ")} -tile 4x4 -geometry 400x225+2+2 ${OUT}-sheet-${i / 16 + 1}.jpg`, { stdio: "ignore" });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`sheets ${Math.ceil(files.length / 16)} (in the order of ${OUT}.csv${process.env.FAILED ? ", failures only" : ""})`);
}
console.log("errors", errs.length, errs.slice(0, 4).join("\n"));
await b.close();
