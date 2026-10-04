// Films the gameplay cut of ZScan Street: the HUD on, a mouse cursor that hovers and clicks, the
// lift, the panels. Each act is one continuous take (time stepped frame by frame), encoded to mp4
// in video/public/street/gameplay/ for the Remotion edit (src/street/StreetGameplay.tsx).
//   node shots/gameplay-capture.mjs [act ...]      (no argument: every act)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import puppeteer from "puppeteer-core";

const OUT = "/Users/adam/Documents/GitHub/zcash/video/public/street/gameplay";
const FPS = 30;
const BAR = (60 / 123) * 4;
// a 1440×810 page rendered at 4/3: the HUD at the size people see it, in a 1920×1080 frame
const W = 1440,
  H = 810;
const ease = (k) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, k))) / 2;
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const EYE = 1.6;

const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--use-angle=metal", "--ignore-gpu-blocklist"],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 4 / 3 },
});
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));

async function boot(theme = "night") {
  await p.goto(`http://localhost:3007/?debug&capture&theme=${theme}`);
  await p.waitForFunction(() => window.capture && window.street && document.getElementById("boot") === null, { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  // a cursor drawn into the page, so it shows on the frames
  await p.evaluate(() => {
    const c = document.createElement("div");
    c.id = "fakecursor";
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.5L16 20l-3 1.5-3.4-7.6L4 18z" fill="#fff" stroke="#0d0d0d" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "99999", pointerEvents: "none", transform: "translate(-200px,-200px)", filter: "drop-shadow(0 2px 4px rgba(0,0,0,.6))", transition: "none" });
    document.body.append(c);
    document.addEventListener("mousemove", (e) => (c.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 3}px)`), true);
    document.addEventListener("mousedown", () => (c.firstChild.style.transform = "scale(0.85)"), true);
    document.addEventListener("mouseup", () => (c.firstChild.style.transform = ""), true);
  });
  // no HUD on the film: the city and the places only (the cursor shows when it picks a building)
  await p.evaluate(() => window.capture.ui(false));
  await cursor(false);
}
const cursor = (on) => p.evaluate((on) => { const c = document.getElementById("fakecursor"); if (c) c.style.display = on ? "" : "none"; }, on);

/** One act = one take. `script(t, k)` runs before each frame (t seconds, k 0..1) and may return a camera. */
async function act(name, bars, script, preroll = 0.5) {
  const frames = Math.round(bars * BAR * FPS);
  const dir = `${OUT}/frames/${name}`;
  rmSync(dir, { recursive: true, force: true }); // frames are deleted once encoded (disk)
  mkdirSync(dir, { recursive: true });
  if (preroll) await p.evaluate((n) => { for (let i = 0; i < n; i++) window.capture.step(1 / 30); }, Math.round(preroll * FPS));
  for (let f = 0; f < frames; f++) {
    const cam = await script(f / FPS, f / (frames - 1), f);
    await p.evaluate((c) => {
      if (c !== undefined) window.capture.shot(c);
      window.capture.step(1 / 30);
    }, cam);
    await p.screenshot({ path: `${dir}/${String(f).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 });
  }
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${dir}/%04d.jpg`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "15", "-preset", "medium", `${OUT}/${name}.mp4`]);
  console.log(`${name}: ${frames} frames`);
}

// ---- helpers ------------------------------------------------------------------------------------

let mouse = { x: W / 2, y: H * 0.62 };
/** Glide the cursor toward (x, y) by a fraction `k` (call every frame). */
async function glide(x, y, k = 0.18) {
  mouse = { x: mouse.x + (x - mouse.x) * k, y: mouse.y + (y - mouse.y) * k };
  await p.mouse.move(mouse.x, mouse.y);
}
async function click() {
  await p.mouse.down();
  await new Promise((r) => setTimeout(r, 60));
  await p.mouse.up();
}
/** Screen point of a DOM element's centre. */
const domAt = (sel) => p.evaluate((sel) => {
  const r = document.querySelector(sel)?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}, sel);
/** Screen point of a world position, through the city camera or the walking camera. */
const project = (v) => p.evaluate((v) => {
  const I = window.street.interiors;
  const cam = I.active ? I.walk.camera : window.street.rig.camera;
  const V = cam.position.constructor;
  const q = new V(v[0], v[1], v[2]).project(cam);
  return { x: ((q.x + 1) / 2) * innerWidth, y: ((1 - q.y) / 2) * innerHeight };
}, v);
/** Find a point on screen whose click would show something matching `re` (inside a place). */
const findPick = (re, region = [0.25, 0.75, 0.2, 0.8]) => p.evaluate((src, rg) => {
  const re = new RegExp(src);
  const I = window.street.interiors;
  for (let gy = rg[2]; gy <= rg[3]; gy += 0.04)
    for (let gx = rg[0]; gx <= rg[1]; gx += 0.03) {
      const x = gx * innerWidth, y = gy * innerHeight;
      const info = I.pickAt(x, y);
      if (info && re.test(`${info.eyebrow} ${info.panel ?? ""}`)) return { x, y };
    }
  return null;
}, re.source, region);
const walkCam = (y, from, to, lookFrom, lookTo, k) => {
  const e = ease(k);
  const pos = lerp(from, to, e);
  const bob = Math.sin(k * 40) * 0.025 * Math.sin(Math.PI * k);
  return { pos: [pos[0], y + EYE + bob, pos[1]], look: lerp(lookFrom, lookTo, e), fov: 58 };
};
const city = (x, z, zoom) => p.evaluate((x, z, zoom) => window.capture.rig(x, z, zoom), x, z, zoom);
const step = (sec) => p.evaluate((n) => { for (let i = 0; i < n; i++) window.capture.step(1 / 30); }, Math.round(sec * FPS));

/** Hover a building in the city, then click it: the camera flies there first. */
async function enterFromCity(name, bars, key, target) {
  const [x, z, zoom, wx, wy, wz] = target;
  await city(x, z, zoom);
  await step(2.5);
  // the cursor stays hidden on the film: the building lights up on hover, that is enough
  let clicked = false;
  await act(name, bars, async (t, k) => {
    const pt = await project([wx, wy, wz]);
    if (k < 0.7) await glide(pt.x, pt.y, 0.12);
    else if (!clicked) {
      clicked = true;
      await click();
    }
    return null;
  }, 0);
  await cursor(false);
  void key;
}
/** Take the lift (a cut), then walk the new floor. */
async function liftTo(name, n, bars, path) {
  await p.evaluate((n) => window.capture.floor(n), n);
  await act(name, bars, (t, k) => path(k), 0.2);
}

// ---- the acts -----------------------------------------------------------------------------------

const ACTS = {
  async "a01-city"() {
    await p.evaluate(() => window.capture.theme("night"));
    await act("a01-city", 2.5, (t, k) => ({ pos: lerp([-44, 36, 50], [-20, 21, 32], ease(k)), look: lerp([0, 2, -8], [2, 2, -6], ease(k)), tilt: 0.6 }));
  },
  async "a02-day"() {
    await p.evaluate(() => window.capture.theme("day"));
    const orbit = (k) => { const a = ((10 + 40 * ease(k)) * Math.PI) / 180; return { pos: [Math.sin(a) * 40, 25, -4 + Math.cos(a) * 40], look: [0, 0, -4], tilt: 0.45 }; };
    await act("a02-day", 3, (t, k) => orbit(k), 1);
    await p.evaluate(() => window.capture.theme("night"));
    await act("a02-night", 3, (t, k) => orbit(k), 1);
  },
  async "a03-carrier"() {
    // new transactions: the truck delivers, zkSNARKs go in, pick their parcel up and walk out
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push(await p.evaluate(() => window.capture.carrier()));
    for (let i = 0; i < 160; i++) {
      await step(0.5);
      const st = await p.evaluate((ids) => ids.map((id) => window.capture.snarkPos(id)?.state), ids);
      if (st.includes("shopping")) break;
    }
    await step(0.6);
    await act("a03-carrier", 4.5, (t, k) => ({ pos: lerp([-1.2, 2.6, -6.4], [-2.8, 2.2, -6.7], ease(k)), look: lerp([-9.8, 1.0, -8.4], [-9.6, 0.9, -8.0], ease(k)), fov: 46, tilt: 0.35 }), 0);
  },
  async "a04-bus"() {
    // a block: the bus pulls in, the zkSNARKs board, we ride inside, then follow it into the tunnel
    // a queue at the stop, then the block that carries them all
    await p.evaluate(() => window.capture.queue(9));
    await step(3);
    await p.evaluate(() => window.capture.testBlock());
    for (let i = 0; i < 80; i++) {
      await step(0.25);
      const bus = await p.evaluate(() => window.capture.bus());
      if (bus && bus.x > -2) break;
    }
    await act("a04-bus", 2.5, (t, k) => ({ pos: lerp([9, 2.3, 8.5], [6.5, 2.0, 7.2], ease(k)), look: lerp([-3, 1.5, 1], [-5, 1.4, 0.8], ease(k)), fov: 42, tilt: 0.5 }), 0);
    // the bus at this stop, followed by its block height
    let h = null;
    for (let i = 0; i < 80 && !h; i++) {
      const bus = await p.evaluate(() => window.capture.bus());
      if (bus && bus.phase === "stopped") h = bus.height;
      else await step(0.25);
    }
    // wait until the riders have taken their seats
    for (let i = 0, last = -1, still = 0; i < 60; i++) {
      const bus = await p.evaluate((h) => window.capture.bus(h), h);
      if (!bus || bus.phase === "departing") break;
      still = bus.riding === last ? still + 1 : 0;
      last = bus.riding;
      if (bus.riding >= 6 && still >= 4) break;
      await step(0.25);
    }
    // inside, seated: a short look down the aisle
    await act("a04b-inside", 1.5, async () => {
      const bus = await p.evaluate((h) => window.capture.bus(h), h);
      return bus ? { pos: bus.front.pos, look: bus.front.look, fov: 66 } : undefined;
    }, 0);
    // outside, from the pavement: the doors close and the bus pulls away, the block is on its way
    // a camera that pans after it, lagging, so the bus slides out of frame to the east
    let cx = null;
    await act("a04c-depart", 2.25, async () => {
      const bus = await p.evaluate((h) => window.capture.bus(h), h);
      if (bus) cx = cx === null ? bus.x : cx + (bus.x - cx) * 0.05;
      const x = cx ?? 7;
      return { pos: [x - 2, 2.3, -5.2], look: [x + 2.5, 1.5, 1.4], fov: 50, tilt: 0.3 };
    }, 0);
  },
  async "a05-mempool"() {
    await enterFromCity("a05-enter-mempool", 2.5, "mempool", [-7.3, -6, 2.4, -7.3, 2.2, -11.5]);
    await act("a06-mempool-walk", 3.5, (t, k) => walkCam(0, [0, -1.6], [-0.6, -4.6], [0, 1.2, -15], [1.4, 1.0, -9], k), 0.3);
    await liftTo("a07-archive", 1, 3, (k) => walkCam(6, [0, -2], [0, -11], [0, 7.6, -30], [0.5, 7.3, -30], k));
  },
  async "a08-cards"() {
    await p.evaluate(() => window.street.interiors.exit());
    await enterFromCity("a08-enter-cards", 2, "cards", [6.8, -6, 2.4, 6.8, 2.6, -11.5]);
    await act("a09-cards-lobby", 2.5, (t, k) => walkCam(0, [0, -2.6], [0, -9], [0, 2.6, -24], [0, 2.9, -24], k), 0.3);
    await liftTo("a10-cards-epic", 2, 2.5, (k) => walkCam(19, [0, -2.2], [0, -8], [-4, 20.4, -12], [4, 20.4, -14], k));
    await liftTo("a11-cards-core", 7, 3.5, (k) => walkCam(54, [0, -3], [0, -10], [-5, 55.6, -14], [-6, 55.5, -12], k));
    // close to the wall: the cards one by one
    await act("a12-cards-click", 2, (t, k) => walkCam(54, [-1.2, -10], [-1.2, -12.5], [-6, 55.4, -11], [-6, 55.4, -14.5], k), 0);
  },
  async "a13-bank"() {
    await p.evaluate(() => window.street.interiors.exit());
    await enterFromCity("a13-enter-bank", 2, "bank", [14.2, -5, 2.2, 14.2, 3.5, -11]);
    await act("a14-bank-hall", 4, (t, k) => walkCam(0, [0, -2.6], [0, -8], [0, 3, -22], [0, 2.0, -16], k), 0.3);
    await liftTo("a15-bank-vault", 1, 3, (k) => walkCam(-6, [0, -1.6], [0, -7], [0, -4.8, -16], [0, -5, -16], k));
  },
  async "a16-factory"() {
    await p.evaluate(() => window.street.interiors.exit());
    await enterFromCity("a16-enter-factory", 2, "factory", [40, -8, 1.6, 42.9, 3.5, -12]);
    await p.evaluate(() => window.__factoryTestBlock?.((window.street.director.blockHeight ?? 3506300) + 1, "Foundry"));
    await act("a17-factory-hall", 4, (t, k) => walkCam(0, [-3.5, -2.6], [-3.5, -10], [-3.5, 2.6, -24], [-1, 2.4, -18], k), 0.2);
    await liftTo("a18-factory-control", 1, 2.5, (k) => walkCam(4.5, [-3.5, -3.2], [-3.5, -6], [-3.5, 3, -24], [-3.5, 2.5, -24], k));
    await p.evaluate(() => window.street.interiors.exit());
  },
  async "a19-outro"() {
    await p.evaluate(() => window.capture.theme("night"));
    await p.evaluate(() => document.getElementById("fakecursor")?.remove());
    // the mouse leaves the city, so no building stays lit
    await p.mouse.move(2, 2);
    await p.evaluate(() => document.querySelector("#scene").dispatchEvent(new PointerEvent("pointerleave")));
    await act("a19-tunnel", 2, (t, k) => ({ pos: lerp([66, 2.2, 9], [72, 2.8, 6.5], ease(k)), look: lerp([84, 2, -1.4], [84, 2.2, -1.4], ease(k)), tilt: 0.3 }), 0.5);
    await act("a20-outro", 2.5, (t, k) => ({ pos: lerp([0, 28, 40], [0, 70, 96], ease(k)), look: [0, 0, -4] }), 0.3);
  },
};

const only = process.argv.slice(2);
await boot("night");
for (const [k, fn] of Object.entries(ACTS)) {
  if (only.length && !only.some((o) => k.includes(o))) continue;
  try {
    await fn();
  } catch (e) {
    console.log(`${k} failed: ${e.message}`);
    await boot("night");
  }
}
if (errors.length) console.log("page errors:\n" + [...new Set(errors)].slice(0, 8).join("\n"));
await b.close();
