// Films the trailer's shots from the live app, frame by frame (?debug&capture: no HUD, time stepped
// by this script), then encodes each shot to an mp4 for the Remotion edit.
//   node shots/trailer-capture.mjs [shot ...]      (no argument: every shot)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import puppeteer from "puppeteer-core";

const OUT = "/Users/adam/Documents/GitHub/zcash/video/public/street";
const FPS = 30;
const BAR = (60 / 123) * 4; // music 134 "Deep Techno Ambience", 123 BPM: one bar ≈ 1.95 s
const W = 1920,
  H = 1080;

const ease = (k) => 0.5 - Math.cos(Math.PI * k) / 2;
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const eye = (y) => y + 1.6;

/** Each shot: where (city or a place), how long (bars), and a camera from → to. */
const SHOTS = [
  { name: "01-city-night", theme: "night", bars: 2, from: { pos: [-40, 34, 48], look: [0, 2, -8] }, to: { pos: [-18, 19, 30], look: [3, 2, -6] }, tilt: 0.7 },
  { name: "02-street-bus", theme: "night", bars: 2, bus: true, preroll: 7, from: { pos: [17, 1.3, 4.6], look: [-4, 1.7, 0.2] }, to: { pos: [12.5, 1.4, 4.3], look: [-6, 1.6, 0] }, fov: 40, tilt: 0.5 },
  { name: "03-city-day", theme: "day", bars: 2, orbit: { center: [0, 0, -4], r: 42, h: 26, a0: 15, a1: 50 }, tilt: 0.45 },
  { name: "04-tower-price", theme: "night", bars: 1, from: { pos: [7, 2.4, 8], look: [0, 10, -9.4] }, to: { pos: [4, 4.5, 6], look: [0, 13.5, -9.4] }, fov: 42 },
  { name: "05-bank-facade", theme: "night", bars: 1, from: { pos: [24, 8, 9], look: [14.2, 4, -10] }, to: { pos: [19, 5, 5], look: [14.2, 4.5, -10] }, tilt: 0.4 },
  { name: "06-mempool-shop", place: "mempool", floor: 0, bars: 1, from: { pos: [0, eye(0), -1.6], look: [0, 1.2, -15] }, to: { pos: [0, eye(0), -4.8], look: [-0.4, 1.1, -15] } },
  { name: "07-mempool-archive", place: "mempool", floor: 1, bars: 1, from: { pos: [0, eye(6), -2], look: [0, 7.6, -30] }, to: { pos: [0, eye(6), -8], look: [0.6, 7.3, -30] } },
  { name: "08-cards-lobby", place: "cards", floor: 0, bars: 2, from: { pos: [0, eye(0), -2.6], look: [0, 2.6, -24] }, to: { pos: [0, eye(0), -9], look: [0, 2.9, -24] } },
  { name: "09-cards-gallery", place: "cards", floor: 7, bars: 1, from: { pos: [0, eye(54), -3], look: [-5, 55.6, -14] }, to: { pos: [0, eye(54), -11], look: [5, 55.6, -20] } },
  { name: "10-bank-hall", place: "bank", floor: 0, bars: 1.5, from: { pos: [0, eye(0), -2.6], look: [0, 3, -22] }, to: { pos: [0, eye(0), -7], look: [0, 3.4, -22] } },
  { name: "11-bank-vault", place: "bank", floor: 1, bars: 1, from: { pos: [0, eye(-6), -1.6], look: [0, -4.8, -16] }, to: { pos: [0, eye(-6), -5], look: [0, -5, -16] } },
  { name: "12-mining-hall", place: "factory", floor: 0, bars: 1.5, block: true, from: { pos: [-3.5, eye(0), -2.6], look: [-3.5, 2.6, -24] }, to: { pos: [-3.5, eye(0), -9], look: [-3.5, 3.2, -24] } },
  { name: "13-zsa-site", place: "zsa", floor: 0, bars: 1, from: { pos: [-0.4, eye(0), -2.2], look: [2.6, 1.0, -8.4] }, to: { pos: [0.8, eye(0), -4.6], look: [2.6, 1.0, -8.4] } },
  { name: "14-tunnel", theme: "night", bars: 2, from: { pos: [66, 2.2, 9], look: [84, 2, -1.4] }, to: { pos: [72, 2.8, 6.5], look: [84, 2.2, -1.4] }, tilt: 0.3 },
  { name: "15-outro", theme: "night", bars: 2, from: { pos: [0, 28, 40], look: [0, 0, -4] }, to: { pos: [0, 70, 96], look: [0, 0, -4] } },
];

const only = process.argv.slice(2);
const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--use-angle=metal", "--ignore-gpu-blocklist"],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto("http://localhost:3007/?debug&capture&theme=night");
await new Promise((r) => setTimeout(r, 12000));
await p.waitForFunction(() => window.capture && window.street, { timeout: 30000 });

const step = (n, dt) => p.evaluate((n, dt) => { for (let i = 0; i < n; i++) window.capture.step(dt); }, n, dt);

for (const s of SHOTS) {
  if (only.length && !only.some((o) => s.name.includes(o))) continue;
  const frames = Math.round(s.bars * BAR * FPS);
  const dir = `${OUT}/frames/${s.name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // set the stage
  await p.evaluate((s) => {
    const c = window.capture;
    if (s.place) c.enter(s.place, s.floor ?? 0);
    else {
      c.leave();
      c.theme(s.theme ?? "night");
    }
    if (s.block) window.__factoryTestBlock?.(window.street.director.blockHeight ?? 3506300, "Foundry");
  }, s);
  if (s.bus) await p.evaluate(() => window.capture.testBlock());
  const cam = (k) => {
    if (s.orbit) {
      const o = s.orbit,
        a = ((o.a0 + (o.a1 - o.a0) * ease(k)) * Math.PI) / 180;
      return { pos: [o.center[0] + Math.sin(a) * o.r, o.h, o.center[2] + Math.cos(a) * o.r], look: o.center, fov: s.fov, tilt: s.tilt };
    }
    const e = ease(k);
    return { pos: lerp(s.from.pos, s.to.pos, e), look: lerp(s.from.look, s.to.look, e), fov: s.fov, tilt: s.tilt };
  };
  await p.evaluate((c) => window.capture.shot(c), cam(0));
  // let textures, data and people settle (and the bus come in) before rolling
  await step(Math.round((s.preroll ?? 1.2) * FPS), 1 / FPS);
  await new Promise((r) => setTimeout(r, 400));
  for (let f = 0; f < frames; f++) {
    await p.evaluate((c) => {
      window.capture.shot(c);
      window.capture.step(1 / 30);
    }, cam(f / (frames - 1)));
    await p.screenshot({ path: `${dir}/${String(f).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 });
  }
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${dir}/%04d.jpg`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "14", "-preset", "slow", `${OUT}/${s.name}.mp4`]);
  console.log(`${s.name}: ${frames} frames`);
}
if (errors.length) console.log("page errors:\n" + errors.join("\n"));
await b.close();
