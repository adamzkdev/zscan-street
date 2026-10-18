// Films "ZStreet · the Apparitions" (the Louvre's levels 4 and 5) frame by frame in the app's capture
// mode, no HUD, into video/public/street/apparitions/ for the Remotion edit
// (video/src/street/StreetApparitions.tsx).
//   node shots/apparitions-capture.mjs [--port 3007] [take ...]      (no take: every take)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3007";
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--port");
const OUT = "/Users/adam/Documents/GitHub/zcash/video/public/street/apparitions";
const FPS = 30;
const BAR = (60 / 123) * 4;
const W = 1440,
  H = 810;
const ease = (k) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, k))) / 2;
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
/** Floor heights of the Louvre's levels (museum/kit.ts FLOOR_Y). */
const Y4 = 160,
  Y5 = 200;

const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  protocolTimeout: 900000,
  args: ["--use-angle=metal", "--ignore-gpu-blocklist"],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 4 / 3 },
});
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));

const step = (sec) => p.evaluate((n) => { for (let i = 0; i < n; i++) window.capture.step(1 / 30); }, Math.round(sec * FPS));
/** Real time passes (images, API answers) while the world steps along. */
async function live(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await p.evaluate(() => window.capture.step(1 / 30));
    await new Promise((r) => setTimeout(r, 20));
  }
}
const time = () => p.evaluate(() => window.capture.time());
/** Step on until the capture clock modulo `cycle` reaches `at` (a moment in a looping piece). */
async function phase(cycle, at) {
  const t = await time();
  const wait = (((at - (t % cycle)) % cycle) + cycle) % cycle;
  for (let s = wait; s > 0; s -= 2) await step(Math.min(2, s));
}

/** One take: `script(t, k, f)` returns the camera for each frame. */
async function take(name, bars, script, each) {
  if (only.length && !only.includes(name)) return false;
  console.log(`${name}: start`);
  const frames = Math.round(bars * BAR * FPS);
  const dir = `${OUT}/frames/${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let f = 0; f < frames; f++) {
    const cam = script(f / FPS, f / (frames - 1), f);
    await p.evaluate((c) => {
      window.capture.shot(c);
      window.capture.step(1 / 30);
    }, cam);
    if (each) await each(f);
    await p.screenshot({ path: `${dir}/${String(f).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 });
  }
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${dir}/%04d.jpg`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "15", "-preset", "medium", `${OUT}/${name}.mp4`]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`${name}: ${frames} frames`, errors.length ? errors.splice(0).join(" | ") : "");
  return true;
}
const dolly = (pos0, pos1, look0, look1, fov = 46) => (_t, k) => ({ pos: lerp(pos0, pos1, ease(k)), look: lerp(look0, look1, ease(k)), fov });
const orbit = (c, r, y, a0, a1, look, fov = 46) => (_t, k) => {
  const a = a0 + (a1 - a0) * ease(k);
  return { pos: [c[0] + Math.cos(a) * r, y, c[1] + Math.sin(a) * r], look, fov };
};
const want = (names) => !only.length || names.some((n) => only.includes(n));

mkdirSync(OUT, { recursive: true });
console.log("boot");
await p.goto(`http://localhost:${port}/?debug&capture&theme=night`);
await p.waitForFunction(() => window.capture && window.street && document.getElementById("boot") === null, { timeout: 120000 });
await p.evaluate(() => window.capture.ui(false));
await live(8000);

// ================================ level 4: the Aile des Apparitions ==============================
const AILE = ["a-entry", "a-fusion", "a-paintings", "a-les26", "a-vortex", "a-orrery", "a-tubes", "a-tubes-full", "a-wall", "a-wall-light"];
if (want(AILE)) {
  await p.evaluate(() => window.capture.enter("museum", 4));
  // the floor's portraits, the purge, the atlas and the visitors come in over real time
  await live(25000);
  await take("a-entry", 2.5, dolly([0, Y4 + 1.7, -2], [0, Y4 + 2.1, -8.5], [0, Y4 + 3.4, -40], [0, Y4 + 3.8, -40]));
  await take("a-fusion", 6, orbit([0, -18], 8.5, Y4 + 3.4, Math.PI / 2 + 0.55, Math.PI / 2 - 0.55, [0, Y4 + 4.5, -18]));
  await take("a-paintings", 2, dolly([-10.5, Y4 + 1.9, -9], [-10.5, Y4 + 1.9, -21], [-15, Y4 + 3, -12], [-15, Y4 + 3, -24], 44));
  await take("a-les26", 1.5, dolly([10.6, Y4 + 1.8, -9.5], [10.6, Y4 + 2.1, -5.5], [10.6, Y4 + 2.8, 0], [10.6, Y4 + 2.9, 0], 44));
  // the Vortex: from low, circling, looking up into the funnel (a 6 s draw-in fits in 4 bars)
  if (want(["a-vortex"])) await phase(6, 5.4);
  await take("a-vortex", 4, orbit([0, -33], 8.2, Y4 + 1.1, Math.PI / 2 + 0.4, Math.PI / 2 - 0.5, [0, Y4 + 5.6, -33], 52));
  // the Orrery: walking beneath it, looking up
  await take("a-orrery", 4, dolly([3.5, Y4 + 1.6, -43], [-2.5, Y4 + 1.6, -50], [0, Y4 + 5.2, -51], [-1, Y4 + 5.4, -55], 56));
  // the Tubes filling (cycle 40.3 s: tube i starts at 0.8 i, full 6.5 s later), then all full
  if (want(["a-tubes"])) await phase(40.3, 4);
  await take("a-tubes", 5, dolly([-5.5, Y4 + 1.7, -59.5], [5.5, Y4 + 1.7, -59.5], [-1.5, Y4 + 2.2, -71], [1.5, Y4 + 2.2, -71], 48));
  if (want(["a-tubes-full"])) await phase(40.3, 28.5);
  await take("a-tubes-full", 2, dolly([0, Y4 + 2.6, -57.5], [0, Y4 + 2.4, -61], [0, Y4 + 2.9, -71], [0, Y4 + 3.1, -71], 50));
  // the Pierced Wall: one Apparition's 26 back in their holes, then falling out (cycle 14 s, fall at 3 s)
  if (want(["a-wall"])) await phase(14, 1.2);
  await take("a-wall", 4, dolly([0, Y4 + 1.7, -73], [0, Y4 + 1.8, -79.5], [0, Y4 + 4.6, -86], [0, Y4 + 4.9, -86], 50));
  await take("a-wall-light", 2, dolly([-5.2, Y4 + 0.8, -80.2], [-3.6, Y4 + 0.9, -81.6], [0, Y4 + 3, -86], [0.6, Y4 + 3.4, -86], 50));
  await p.evaluate(() => window.capture.leave());
  await live(3000);
}

// ================================ level 5: the Memorial of the Purged ==============================
const MEM = ["m-entry", "m-wall", "m-flame", "m-mourners", "m-ceremony", "m-silence", "m-candles"];
if (want(MEM)) {
  await p.evaluate(() => window.capture.enter("museum", 5));
  await live(20000);
  await take("m-entry", 2.5, dolly([0, Y5 + 1.7, -2.5], [0, Y5 + 1.9, -9.5], [0, Y5 + 4.6, -45], [0, Y5 + 4.8, -45]));
  await take("m-wall", 2, dolly([-4.5, Y5 + 1.7, -41.5], [4.5, Y5 + 1.7, -41.5], [-1, Y5 + 5, -50], [1, Y5 + 5, -50], 50));
  await take("m-flame", 3, orbit([0, -37], 7.4, Y5 + 2.6, Math.PI / 2 + 0.45, Math.PI / 2 - 0.45, [0, Y5 + 2.4, -37.5], 44));
  // (taken before the ceremony comes round: run it on its own or early)
  await take("m-mourners", 4, dolly([-6.5, Y5 + 1.7, -20], [-5.5, Y5 + 1.7, -23], [-2, Y5 + 1.4, -31], [-1, Y5 + 1.5, -32], 50));
  await take("m-candles", 2, dolly([-7.6, Y5 + 1.5, -43.6], [-7.6, Y5 + 1.4, -44.4], [-7.6, Y5 + 1.1, -46.9], [-7.6, Y5 + 1.1, -46.9], 46), async (f) => {
    // light a candle on each beat (a click on the stand, at the centre of the view)
    if (f % 15 === 8) await p.evaluate(() => street.interiors.pickAt(innerWidth / 2, innerHeight / 2));
  });
  // the ceremony, now: the curator speaks two lines, then the silence
  if (want(["m-ceremony"])) {
    await p.evaluate(() => street.interiors.active.scene.traverse((o) => o.userData.startCeremony?.()));
    await step(0.2);
  }
  await take("m-ceremony", 6, dolly([0.8, Y5 + 1.6, -27.6], [0.2, Y5 + 1.6, -29], [0, Y5 + 1.9, -33.4], [0, Y5 + 1.9, -33.4], 42));
  if (want(["m-silence"])) await step(28);
  await take("m-silence", 4, orbit([0, -34.6], 6, Y5 + 1.3, Math.PI / 2 + 0.35, Math.PI / 2 - 0.35, [0, Y5 + 2.2, -36], 48));
}

console.log("errors", errors.slice(0, 5).join(" | ") || "none");
await b.close();
