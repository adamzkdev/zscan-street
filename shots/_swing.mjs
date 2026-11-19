// The swing's physics, exercised in the browser on the real module (src/scene/swing/physics.ts):
// aiming at the visible point only, launch along the line, momentum on the first throw and on
// release, gravity, frame-rate independence, walls, thin walls, roofs, speed effects and reduced
// motion; ZStreet's own: no hold on what is not built (a person, a car), hand-back on raised floors.
//   npx vite --port 3013 & PORT=3013 node shots/_swing.mjs
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
try {
  await page.goto(`${process.env.BASE ?? `http://localhost:${process.env.PORT ?? 3013}`}/icon.svg`);
  const result = await page.evaluate(async () => {
    // (the same three.js instance the module gets from Vite)
    const src = await (await fetch("/src/scene/swing/physics.ts")).text();
    const THREE = await import(src.match(/from "([^"]*three[^"]*)"/)[1]);
    const { Swing } = await import("/src/scene/swing/physics.ts");
    const make = (position = [0, 100, 0], velocity = [0, 0, 0], extra = {}) => {
      const camera = new THREE.PerspectiveCamera(80);
      camera.position.set(...position);
      const scene = new THREE.Scene();
      let impact = null;
      const w = new Swing({ camera, heading: () => 0, velocity: (out) => out.set(...velocity), lean() {}, nod() {}, landed: (...args) => (impact = args), field: () => null, solid: () => false, curb: 0, fov: 80, bounds: { x0: -10000, x1: 10000, z0: -10000, z1: 10000 }, ...extra }, scene);
      for (const name of ["start", "cast", "taut", "air", "land"]) w.sound[name] = () => {};
      w.target = (out) => out.set(0, 130, -30);
      return { w, camera, scene, impact: () => impact };
    };
    const simulate = (h, seconds, hz, f = 0, r = 0) => {
      for (let i = 0; i < Math.round(seconds * hz); i++) h.w.move(1 / hz, f, r, false, false);
    };
    // the exact visible point, left/right/level; the sky and out of reach: nothing
    const aiming = [];
    for (const point of [[-12, 18, -20], [12, 18, -20], [20, 1.6, -20], null, [0, 200, -200]]) {
      const h = make([0, 1.6, 0]);
      delete h.w.target;
      h.w.host.target = (out) => (point ? out.set(...point) : null);
      h.w.hold(true);
      const anchor = h.w.anchor?.toArray() ?? null;
      simulate(h, 0.25, 240);
      aiming.push({ point, anchor, v: h.w.v.toArray(), y: h.camera.position.y });
    }
    // a ground launch up a facade, and the line's traction up it once the wall has stopped you
    const launch = make([0, 1.6, 0]);
    launch.w.target = (out) => out.set(0, 22, -11);
    launch.w.at = (x, z) => (z <= -10 ? 24 : 0);
    launch.w.hold(true);
    simulate(launch, 0.8, 120);
    const launchHeight = launch.camera.position.y;
    simulate(launch, 4.2, 120);
    const facadeHeight = launch.camera.position.y;
    const cancelled = make([0, 1.6, 0]);
    cancelled.w.hold(true);
    simulate(cancelled, 0.025, 120);
    cancelled.w.hold(false);
    cancelled.w.hold(true);
    simulate(cancelled, 0.8, 120);
    const retryHeight = cancelled.camera.position.y;
    const a = make([0, 1.6, 0], [0, 0, -10]);
    a.w.target = (out) => out.set(0, 30, -25);
    a.w.hold(true);
    const inherited = a.w.v.toArray();
    simulate(a, 0.05, 120);
    const beforeCatch = a.camera.position.y;
    simulate(a, 0.3, 120);
    const afterCatch = a.camera.position.y;
    a.w.v.set(13, 9, -18);
    const releaseBefore = a.w.v.toArray();
    a.w.hold(false);
    const releaseAfter = a.w.v.toArray();
    for (let i = 0; i < 20; i++) {
      a.w.hold(true);
      a.w.hold(false);
    }
    const spamAfter = a.w.v.toArray();
    const fall = make();
    fall.w.active = true;
    simulate(fall, 1, 120);
    const fallMetrics = { y: fall.camera.position.y, vy: fall.w.v.y };
    const trajectories = [];
    for (const hz of [30, 60, 144]) {
      const h = make([20, 70, 0]);
      h.w.active = true;
      h.w.anchor = new THREE.Vector3(0, 100, 0);
      h.w.len = h.w.want = h.w.anchor.distanceTo(h.camera.position);
      h.w.v.set(0, 0, -18);
      const energy0 = h.w.v.lengthSq() / 2 + 15 * h.camera.position.y;
      let maxEnergy = energy0,
        maxStretch = 0;
      for (let i = 0; i < hz * 8; i++) {
        h.w.move(1 / hz, 0, 0, false, false);
        maxEnergy = Math.max(maxEnergy, h.w.v.lengthSq() / 2 + 15 * h.camera.position.y);
        maxStretch = Math.max(maxStretch, h.camera.position.distanceTo(h.w.anchor) - h.w.len);
      }
      trajectories.push({ hz, p: h.camera.position.toArray(), energyGain: maxEnergy - energy0, maxStretch });
    }
    const diagonal = [];
    for (const [f, r] of [[1, 0], [1, 1]]) {
      const h = make();
      h.w.active = true;
      simulate(h, 1, 120, f, r);
      diagonal.push(Math.hypot(h.w.v.x, h.w.v.z));
    }
    const wall = make([3.9, 35, 0]);
    wall.w.active = true;
    wall.w.anchor = new THREE.Vector3(30, 50, 0);
    wall.w.len = wall.w.want = 50;
    wall.w.v.set(38, -2, 0);
    wall.w.at = (x) => (x >= 5 ? 80 : 0);
    simulate(wall, 0.3, 120);
    const wallMetrics = { x: wall.camera.position.x, vy: wall.w.v.y };
    // an impossible rope correction may pay out, but must not cross a wall or inject a climb
    const corner = make([0, 35, 0]);
    corner.w.active = true;
    corner.w.anchor = new THREE.Vector3(20, 50, 0);
    corner.w.len = corner.w.want = 5;
    corner.w.at = (x) => (x >= 5 && x <= 6 ? 80 : 0);
    simulate(corner, 1 / 120, 120);
    const cornerMetrics = { x: corner.camera.position.x, vy: corner.w.v.y };
    const roof = make([0, 60, 0]);
    roof.w.active = true;
    roof.w.v.set(0, -25, 0);
    roof.w.at = () => 20;
    simulate(roof, 2, 120);
    const roofMetrics = { y: roof.camera.position.y, grounded: roof.w.grounded };
    // back on the street: the walker takes over, still moving, on the street's floor
    const street = make([0, 9, 0]);
    street.w.active = true;
    street.w.v.set(14, -6, 3);
    simulate(street, 1.5, 120);
    const streetLanding = { active: street.w.active, impact: street.impact() };
    // a raised floor the walker knows (a bridge's deck at 6 m): it takes over there too
    const deck = make([0, 14, 0], [0, 0, 0], { ground: () => 6 });
    deck.w.active = true;
    deck.w.at = () => 6;
    simulate(deck, 2, 120);
    const deckLanding = { active: deck.w.active, impact: deck.impact() };
    // ZStreet: a line holds only on something built (the field rises to it): not a person, a car, the air
    const field = { x0: -50, z0: -50, cell: 1, size: 100, h: new Float32Array(100 * 100) };
    for (let j = 0; j < 100; j++) for (let i = 60; i < 80; i++) field.h[j * 100 + i] = 30; // a block from x = 10 to 30, 30 m high
    const built = make([0, 1.6, 0], [0, 0, 0], { field: () => field });
    const holdable = {
      facade: built.w.holdable(new THREE.Vector3(9.9, 18, 0)),
      roof: built.w.holdable(new THREE.Vector3(20, 30, 0)),
      air: built.w.holdable(new THREE.Vector3(-10, 12, -10)),
      person: built.w.holdable(new THREE.Vector3(3, 1.7, -2)),
      own: built.w.holdable(new THREE.Vector3(0.3, 1.2, -0.5)),
    };
    const fast = make([0, 1000, 0]);
    fast.w.active = true;
    fast.w.v.set(0, 0, -48);
    simulate(fast, 1, 120);
    const effects = { fov: fast.camera.fov, streaks: fast.w.streaks.root.visible, opacity: fast.w.streaks.root.material.opacity };
    fast.w.motion = { matches: true };
    simulate(fast, 2, 120);
    const reduced = { fov: fast.camera.fov, streaks: fast.w.streaks.root.visible };
    fast.w.reset();
    const reset = { active: fast.w.active, streaks: fast.w.streaks.root.visible };
    // off the swing the view narrows back to its rest
    simulate(fast, 2, 60);
    const relaxed = fast.camera.fov;
    return { aiming, launchHeight, facadeHeight, retryHeight, inherited, beforeCatch, afterCatch, releaseBefore, releaseAfter, spamAfter, fallMetrics, trajectories, diagonal, wallMetrics, cornerMetrics, roofMetrics, streetLanding, deckLanding, holdable, effects, reduced, reset, relaxed };
  });
  for (const shot of result.aiming.slice(0, 3)) assert.deepEqual(shot.anchor, shot.point, "exact cursor point, with no anchor lift or side targeting");
  assert.ok(result.aiming[0].v[0] < 0 && result.aiming[1].v[0] > 0, "left/right aim controls launch direction");
  for (const shot of result.aiming.slice(0, 2)) {
    const direction = shot.point.map((n, i) => n - (i === 1 ? 1.6 : 0));
    const dot = direction.reduce((sum, n, i) => sum + n * shot.v[i], 0) / (Math.hypot(...direction) * Math.hypot(...shot.v));
    assert.ok(dot > 0.99, "launch follows aimed rope instead of a fixed upward impulse");
  }
  assert.ok(result.aiming[2].y < 1.8, "level aim does not create an automatic upward launch");
  assert.equal(result.aiming[3].anchor, null, "sky has no fallback anchor");
  assert.equal(result.aiming[4].anchor, null, "out-of-range target has no fallback anchor");
  assert.ok(result.launchHeight > 6, "holding the line alone launches clearly above the street");
  assert.ok(result.facadeHeight > 15, "a held line keeps pulling up a facade after horizontal velocity stops");
  assert.ok(result.retryHeight > 6, "a cancelled throw can launch again from the floor");
  assert.deepEqual(result.inherited, [0, 0, -10], "running momentum survives the first throw");
  assert.ok(result.beforeCatch < 1.7 && result.afterCatch > 2, "the line arrives before its takeoff impulse");
  assert.deepEqual(result.releaseAfter, result.releaseBefore, "release preserves velocity");
  assert.deepEqual(result.spamAfter, result.releaseBefore, "repeated airborne catches grant no bonus");
  assert.ok(result.fallMetrics.y > 92 && result.fallMetrics.y < 93, "gravity follows the street jump scale");
  assert.ok(result.fallMetrics.vy < -14 && result.fallMetrics.vy > -16);
  for (const t of result.trajectories) {
    assert.ok(t.energyGain < 1, "idle pendulum creates no energy");
    assert.ok(t.maxStretch < 0.001, "taut line does not stretch");
  }
  for (const t of result.trajectories.slice(1)) assert.ok(Math.hypot(...t.p.map((v, i) => v - result.trajectories[0].p[i])) < 0.3, "30/60/144 Hz agree");
  assert.ok(Math.abs(result.diagonal[0] - result.diagonal[1]) < 0.01, "diagonal input is normalized");
  assert.ok(result.wallMetrics.x < 4.1 && result.wallMetrics.vy < 0, "wall impact cannot launch you upward");
  assert.ok(result.cornerMetrics.x < 4 && result.cornerMetrics.vy < 0, "rope correction cannot cross thin walls");
  assert.equal(result.roofMetrics.grounded, true);
  assert.ok(Math.abs(result.roofMetrics.y - 21.6) < 0.01, "roof landing is stable");
  assert.equal(result.streetLanding.active, false, "back on the street, the walker takes over");
  assert.ok(result.streetLanding.impact && Math.abs(result.streetLanding.impact[3]) < 0.01 && Math.hypot(result.streetLanding.impact[1], result.streetLanding.impact[2]) > 1, "landing hands over the street's floor and the momentum");
  assert.equal(result.deckLanding.active, false, "a raised floor the walker knows is handed back too");
  assert.ok(Math.abs(result.deckLanding.impact[3] - 6) < 0.01, "on that floor's height");
  assert.deepEqual(result.holdable, { facade: true, roof: true, air: false, person: false, own: false }, "a line holds on what is built, never in the air, on a passer-by or on your own hands");
  assert.ok(result.effects.fov > 85 && result.effects.fov < 96 && result.effects.streaks, "progressive speed effect");
  assert.ok(result.reduced.fov < 84 && !result.reduced.streaks, "reduced-motion mode");
  assert.deepEqual(result.reset, { active: false, streaks: false });
  assert.ok(Math.abs(result.relaxed - 80) < 0.05, "the view narrows back to its rest off the swing");
  console.log(JSON.stringify({ launchHeight: result.launchHeight, facadeHeight: result.facadeHeight, effects: result.effects, holdable: result.holdable }));
  console.log("PASS swing physics: aim, launch, momentum, release, gravity, frame rate, walls, roofs, hand-back, built-only holds, effects and reduced motion");
} finally {
  await browser.close();
}
