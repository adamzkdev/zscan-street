// node shots/_pyrchase.mjs [port]  — tests the pyramid mummies' chase logic in the real page.
import puppeteer from "puppeteer-core";
const port = process.argv[2] ?? "3043";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: 1200, height: 760 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=night&interior=pyramid`);
await p.waitForFunction(() => window.street?.interiors?.active?.key === "pyramid", { timeout: 180000 });
await p.waitForFunction(() => street.interiors.active.scene.userData.mummies?.count === 3, { timeout: 60000 });
await p.evaluate(() => {
  window.__ev = [];
  window.addEventListener("zstreet:sound", (e) => window.__ev.push([+(performance.now() / 1000).toFixed(2), e.detail.name, e.detail.arg]));
});
const results = [];
const check = (name, ok, info) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? "  " + JSON.stringify(info) : ""}`);
};
const at = (x, z, yaw = 0) =>
  p.evaluate(
    (x, z, yaw) => {
      const I = street.interiors;
      const V = I.walk.camera.position.constructor;
      const y = I.active.groundAt?.(0, x, z) ?? 0;
      I.walk.place(new V(x, y, z), yaw, y);
    },
    x,
    z,
    yaw,
  );
const M = (fn, ...a) => p.evaluate((src, a) => new Function("T", "a", src)(street.interiors.active.scene.userData.mummies, a), fn, a);
const dbg = () => M("return T.debug()");
const events = () => p.evaluate(() => window.__ev.splice(0).map((e) => e[1] + (e[1] === "chase" ? ":" + e[2] : "")));

// park the other two far away in the maze's far corner, looking at a wall
await at(0, -12, 0);
await M("T.put(1, 10.4, -42.1, 1, 0); T.put(2, 7.8, -42.1, 1, 0); T.put(0, -10.4, -21.3, 0.9, 0.45); T.grace = 0;");
await wait(600);
await events();

// 1. a wall in the way: no spotting
await at(-5, -18.6, Math.PI / 2);
await wait(1500);
let d = await dbg();
check("behind a wall: not seen", !d.chasing && d.list[0].state === "pause", d.list[0]);

// 2. in plain view, inside the cone: spotted, the chase starts
await M("T.put(0, 0, -17.6, 0, 1); T.grace = 0;");
await at(0, -11.5, 0);
await wait(400);
d = await dbg();
let ev = await events();
check("in view: spotted", d.chasing && ["alert", "chase"].includes(d.list[0].state) && d.list[0].flare > 0.4, { st: d.list[0].state, flare: d.list[0].flare });
check("sting + chase music events", ev.includes("spotted") && ev.includes("chase:true"), ev);

// 3. it runs toward you
const z0 = d.list[0].z;
await wait(1200);
d = await dbg();
check("chases toward you", d.list[0].state === "chase" && d.list[0].z > z0 + 1, { z0, z: d.list[0].z });

// 4. climb out of its level (the gallery): it loses you, the music settles
await at(-5.2, -70, 0);
await wait(2600);
d = await dbg();
ev = await events();
check("off its level: lost", !d.chasing && ["search", "look", "pause", "patrol"].includes(d.list[0].state), d.list[0]);
check("chase music off", ev.includes("chase:false"), ev);

// 5. behind its back (outside the cone, beyond hearing): not seen
await M("T.put(0, 0, -15, 0, 1); T.grace = 0;");
await at(0, -18.5, 0);
await wait(1200);
d = await dbg();
check("behind its back: not seen", !d.chasing, d.list[0]);

// 6. right behind it (within hearing): heard
await at(0, -16.6, 0);
let heard = false;
for (let k = 0; k < 12 && !heard; k++) {
  await wait(100);
  d = await dbg();
  heard = d.chasing || d.caught >= 0;
}
check("very close: heard", heard, d.list[0]);
// let that one catch you (or not) and the curse play out before the next test
await wait(1500);
for (let k = 0; k < 80 && (await dbg()).caught >= 0; k++) await wait(100);
await events();

// 7. caught: the curse, the respawn at the labyrinth's door, the mummies reset
await M("T.put(0, 0, -12.4, 0, 1); T.grace = 0;");
await at(0, -11.2, 0);
const t0 = Date.now();
let caught = false;
while (Date.now() - t0 < 6000) {
  d = await dbg();
  if (d.caught >= 0) {
    caught = true;
    break;
  }
  await wait(100);
}
ev = await events();
const veil = await p.evaluate(() => [...document.body.children].some((e) => e.textContent?.includes("pharaoh's curse") && getComputedStyle(e).opacity !== "0"));
check("caught", caught && ev.includes("caught"), ev);
check("veil and line shown", veil);
await p.screenshot({ path: "/private/tmp/claude-501/-Users-adam-Documents-GitHub-zcash/15136d67-1bf0-4825-8f11-79b9ee772fe2/scratchpad/pyr/caught.png" });
for (let k = 0; k < 60 && (await dbg()).caught >= 0; k++) await wait(100);
await wait(900);
const cam = await p.evaluate(() => street.interiors.walk.camera.position.toArray().map((v) => +v.toFixed(2)));
d = await dbg();
ev = await events();
check("respawned at the labyrinth door", Math.abs(cam[0]) < 0.5 && Math.abs(cam[2] + 17.2) < 0.5, cam);
check("mummies reset, music calm, grace on", !d.chasing && d.caught < 0 && d.list.every((m) => ["pause", "patrol"].includes(m.state)), d);
const veilGone = await p.evaluate(() => [...document.body.children].every((e) => !e.textContent?.includes("pharaoh's curse") || getComputedStyle(e).opacity === "0"));
check("veil gone", veilGone);

// 8. patrol: left alone, they wander the maze (and stay in it)
await at(0, -3, 0);
const before = (await dbg()).list.map((m) => [m.x, m.z]);
await wait(9000);
d = await dbg();
const movedAll = d.list.every((m, i) => Math.hypot(m.x - before[i][0], m.z - before[i][1]) > 0.5);
const inMaze = d.list.every((m) => m.z < -19.5 && m.z > -44 && Math.abs(m.x) < 11.8);
check("patrolling, inside the maze", movedAll && inMaze, d.list);

// fps with the mummies about
const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
console.log("fps", fps);
const pe = errs.filter((e) => !/fetch|Failed to load|NetworkError/i.test(e));
check("no page errors", !pe.length, pe.slice(0, 3));
console.log(`\n${results.filter((r) => !r.ok).length} failing of ${results.length}`);
await b.close();
