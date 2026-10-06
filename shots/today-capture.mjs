// Films "ZStreet today" (the 2026-10-06 updates: residents, the city reacting to the chain, small
// life, time/weather, talk, TV mode) frame by frame in the app's capture mode, no HUD, into
// video/public/street/today/ for the Remotion edit (video/src/street/StreetToday.tsx).
//   node shots/today-capture.mjs [act ...]      (no argument: every act)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import puppeteer from "puppeteer-core";

const OUT = "/Users/adam/Documents/GitHub/zcash/video/public/street/today";
const FPS = 30;
const BAR = (60 / 123) * 4;
const W = 1440,
  H = 810;
const ease = (k) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, k))) / 2;
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const only = process.argv.slice(2);

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

async function boot(theme) {
  console.log(`boot ${theme}`);
  await p.goto(`http://localhost:3007/?debug&capture&theme=${theme}`);
  await p.waitForFunction(() => window.capture && window.street && document.getElementById("boot") === null, { timeout: 60000 });
  await p.evaluate(() => window.capture.ui(false));
  console.log("booted, warming up");
  // let the city fill up (residents come out of their doors) in real time
  await live(50000);
}
const step = (sec) => p.evaluate((n) => { for (let i = 0; i < n; i++) window.capture.step(1 / 30); }, Math.round(sec * FPS));
/** Real time passes (timers, API answers) while the world steps along. */
// (stepped from here, one short call at a time: a long-running in-page timer loop froze the page)
async function live(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await p.evaluate(() => window.capture.step(1 / 30));
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** One act = one take. `script(t, k, f)` runs before each frame and returns the camera (or null for the rig's). */
async function act(name, bars, script) {
  if (only.length && !only.includes(name)) return;
  console.log(`${name}: start`);
  const frames = Math.round(bars * BAR * FPS);
  const dir = `${OUT}/frames/${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let f = 0; f < frames; f++) {
    const cam = await script(f / FPS, f / (frames - 1), f);
    await p.evaluate((c) => {
      if (c !== undefined) window.capture.shot(c);
      window.capture.step(1 / 30);
    }, cam);
    await p.screenshot({ path: `${dir}/${String(f).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 });
  }
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${dir}/%04d.jpg`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "15", "-preset", "medium", `${OUT}/${name}.mp4`]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`${name}: ${frames} frames`, errors.length ? errors.splice(0).join(" | ") : "");
}
const dolly = (pos0, pos1, look0, look1, fov = 40) => (_t, k) => ({ pos: lerp(pos0, pos1, ease(k)), look: lerp(look0, look1, ease(k)), fov });
const orbit = (c, r, y, a0, a1, fov = 40, ly = 1) => (_t, k) => {
  const a = a0 + (a1 - a0) * ease(k);
  return { pos: [c[0] + Math.cos(a) * r, y, c[1] + Math.sin(a) * r], look: [c[0], ly, c[1]], fov };
};

mkdirSync(OUT, { recursive: true });

// ================================ night ==========================================================
await boot("night");
// dry to start with; the showers act brings the rain
await p.evaluate(() => { street.decor.setRain(false, true); street.residents.setRain(false); });

await act("t01-aerial", 2, dolly([-20, 30, 40], [-8, 18, 28], [0, 2, 6], [0, 1, 12], 38));
await act("t02-plaza", 2, dolly([-17, 2.3, 6.6], [-7, 2.3, 6.6], [-8, 1.1, 13], [2, 1.1, 15], 46));

// a resident on a bench, from the front, slow push-in; a bubble halfway
{
  let r = null;
  for (let i = 0; i < 40 && !r; i++) {
    r = await p.evaluate(() => street.residents.debug().find((x) => x.perched && x.z < 26) ?? null);
    if (!r) await live(2000);
  }
  if (r) {
    const f = (r.z > 7 && r.z < 9) || r.z > 29 ? -1 : 1;
    const look = [r.x, 1.0, r.z];
    await act("t03-bench", 1.5, (_t, k, fr) => {
      if (fr === 18) p.evaluate((id) => [...street.director.snarks].find((s) => s.id === id)?.emote("heart", 2.4), r.id);
      return { pos: lerp([r.x + 1.6, 1.5, r.z + f * 3.6], [r.x + 0.7, 1.25, r.z + f * 2.4], ease(k)), look, fov: 40 };
    });
  } else console.log("t03-bench: nobody on a bench");
}
await act("t04-fountain", 1.5, orbit([0, 19], 7.5, 3.4, -2.2, -1.2, 42, 1.2));
await act("t05-koi", 1, orbit([-37.5, 20], 12, 8, -1.8, -1.2, 44, 0));

// the chain: a new block on every screen (the real tip), then a full one with fireworks
const tip = await p.evaluate(() => ({ h: street.director.blockHeight ?? 3508400 }));
await act("t06-block", 2, (t, k, fr) => {
  if (fr === 10) p.evaluate((h) => street.pulse.block({ height: h + 1, time: Date.now(), size: 9000, fees: 0, pool: "ViaBTC", txs: Array(6).fill({}) }), tip.h);
  return dolly([4, 10.5, 12], [2, 10, 9], [0, 9.5, -12], [0, 10, -12], 52)(t, k);
});
await act("t07-fireworks", 1.5, (t, k, fr) => {
  if (fr === 2) p.evaluate((h) => street.pulse.block({ height: h + 2, time: Date.now(), size: 30000, fees: 0, pool: "F2Pool", txs: Array(17).fill({}) }), tip.h);
  return dolly([0, 9, 34], [0, 11, 30], [0, 12, -10], [0, 14, -10], 55)(t, k);
});
await act("t08-lightning", 1.5, (t, k, fr) => {
  if (fr === 12) p.evaluate(() => street.pulse.tx({ kind: "shielded", actions: 7, pool: "orchard" }));
  return dolly([17, 15, 25], [19, 13, 21], [37, 10, -14], [37, 9, -14], 58)(t, k);
});
await act("t09-price", 1, (t, k, fr) => {
  if (fr === 4) p.evaluate(() => street.pulse.price(1374.2, 0.62));
  return dolly([3, 11, 15], [1, 10.5, 12], [0, 9, -10], [0, 9.5, -10], 50)(t, k);
});

// small life: pigeons take off, a cat gets up, a courier rides past
// the flock gathers on the square's north side, then something startles it
if (!only.length || only.includes("t10-pigeons"))
  await p.evaluate(() => {
    const patch = [-6, 6, 13, 15.6];
    for (const b of street.critters.pigeons) {
      b.fly = null;
      b.patch = patch;
      b.cool = 999;
      b.pos.set(-4 + Math.random() * 8, 0.26, 13.2 + Math.random() * 2.2);
    }
  });
await act("t10-pigeons", 1.5, (t, k, fr) => {
  if (fr === 22)
    p.evaluate(() => {
      for (const b of street.critters.pigeons) {
        b.cool = 0;
        b.scare = true;
      }
    });
  return dolly([0, 2.2, 10.8], [0, 2.8, 10.6], [0, 0.3, 14.4], [0, 2.0, 15.2], 50)(t, k);
});
{
  const c = await p.evaluate(() => { const c = street.critters.cats[0]; return [c.pos.x, c.pos.y, c.pos.z]; });
  await act("t11-cat", 1, (t, k, fr) => {
    if (fr === 12) p.evaluate(() => { const c = street.critters.cats[0]; c.until = 0; });
    if (fr === 14) p.evaluate(() => { street.critters.cats[0].speed = 3.4; });
    return { pos: [c[0] + 0.6, c[1] + 1.6, c[2] + 2.0], look: lerp([c[0], c[1] + 0.2, c[2]], [c[0] + 1.2, c[1] + 0.2, c[2]], ease(k)), fov: 40 };
  });
}
{
  if (!only.length || only.includes("t12-courier")) await p.evaluate(() => { const z = street.director.traffic.crossings[0]; z._busy ??= z.busy; z.busy = () => false; });
  await p.evaluate(() => street.director.courier("eastFast", -92));
  // wait for it to come out of the tunnel and reach the board
  for (let i = 0; i < 400; i++) {
    const x = await p.evaluate(() => { for (const s of street.director.snarks) if (s.role === "Courier") { const v = s.root.position.clone(); s.root.getWorldPosition(v); return v.x; } return null; });
    if (x !== null && x > -30) break;
    await step(0.1);
  }
  await act("t12-courier", 1.5, async () => {
    const v = await p.evaluate(() => { for (const s of street.director.snarks) if (s.role === "Courier") { const v = s.root.position.clone(); s.root.getWorldPosition(v); return [v.x, v.z]; } return null; });
    if (!v) return undefined;
    return { pos: [v[0] + 1.5, 1.5, v[1] + 5.2], look: [v[0] + 0.4, 0.8, v[1]], fov: 42 };
  });
}

if (!only.length || only.some((n) => n.startsWith("t06b") || n.startsWith("t08b"))) await p.evaluate(() => { const z = street.director.traffic.crossings[0]; if (z._busy) z.busy = z._busy; });
// the LED screens up close: the biggest one low on the downtown tower
const screen = await p.evaluate(() => {
  const out = [];
  street.city.group.traverse((o) => {
    const m = o.material;
    if (!o.isMesh || !m?.map?.isCanvasTexture || m.map.image?.width !== 384 || !o.geometry.parameters?.width) return;
    const v = o.position.clone();
    o.getWorldPosition(v);
    out.push({ x: v.x, y: v.y, z: v.z, w: o.geometry.parameters.width });
  });
  out.sort((a, b) => b.w - a.w || a.y - b.y);
  return out.filter((s) => Math.abs(s.x) < 14 && s.z < 0)[0] ?? out[0];
});
const near = (k, d0, d1) => ({ pos: lerp([screen.x + 2.2, screen.y - 0.6, screen.z + d0], [screen.x + 0.8, screen.y - 0.2, screen.z + d1], ease(k)), look: [screen.x, screen.y, screen.z], fov: 40 });
await act("t06b-screen", 1, (t, k, fr) => {
  if (fr === 6) p.evaluate((h) => street.pulse.block({ height: h + 3, time: Date.now(), size: 9000, fees: 0, pool: "ViaBTC", txs: Array(8).fill({}) }), tip.h);
  return near(k, 7.5, 5.5);
});
await live(9000);
await act("t08b-screen", 1, (t, k, fr) => {
  if (fr === 6) p.evaluate(() => { street.pulse.lastProof = -Infinity; street.pulse.tx({ kind: "shielded", actions: 7, pool: "orchard" }); });
  return near(k, 6.5, 4.8);
});
await act("t14-lamps", 1.5, (t, k, fr) => {
  if (fr === 0) p.evaluate(() => { street.decor.setRain(true, true); street.residents.setRain(true); });
  return dolly([-30, 1.5, -2.6], [-22, 1.6, -2.6], [-22, 2.6, -6.2], [-12, 2.4, -6.2], 50)(t, k);
});

// showers: rain builds up, umbrellas open
if (!only.length || only.includes("t15-shower")) await p.evaluate(() => { street.decor.setRain(false, true); street.residents.setRain(false); });
await act("t15-shower", 1.5, (t, k, fr) => {
  if (fr === 4) p.evaluate(() => { street.decor.setRain(true); street.residents.setRain(true); });
  return dolly([2, 3.2, 3.8], [-3, 3.0, 3.8], [-2, 1.2, 12], [-5, 1.3, 13], 48)(t, k);
});

// talk: a carrier on the street answers, through the API
{
  const id = await p.evaluate(() => {
    const s = [...street.director.snarks].find((x) => x.txs.length && x.state === "waiting") ?? [...street.director.snarks].find((x) => x.txs.length && x.root.parent?.type === "Scene");
    if (!s) return null;
    street.talk(s);
    return s.id;
  });
  if (id) {
    await p.addStyleTag({ content: "#ui > *:not(.talk){visibility:hidden !important} #ui{display:block !important} .talk input{caret-color:transparent}" });
    await p.evaluate(() => window.capture.ui(true));
    const pos = await p.evaluate((id) => { const s = [...street.director.snarks].find((x) => x.id === id); const v = s.root.position.clone(); s.root.getWorldPosition(v); return [v.x, v.z]; }, id);
    const Q = "Which block are you waiting for?";
    let asked = false;
    await act("t16-talk", 2.5, async (t, k, fr) => {
      // type the question (two letters a frame), send it, wait for the real answer
      if (fr >= 6 && fr < 6 + Q.length / 2) await p.evaluate((txt) => { const i = document.querySelector(".talk input"); i.value = txt; }, Q.slice(0, (fr - 5) * 2));
      if (!asked && fr === 6 + Math.ceil(Q.length / 2) + 4) {
        asked = true;
        await p.evaluate(() => document.querySelector(".talk form").requestSubmit());
        await p.waitForFunction(() => !document.querySelector(".talk .typing"), { timeout: 30000 }).catch(() => {});
      }
      return { pos: lerp([pos[0] + 2.6, 2.2, pos[1] - 5.2], [pos[0] + 2.0, 1.9, pos[1] - 4.2], ease(k)), look: [pos[0] + 2.2, 1.1, pos[1]], fov: 44 };
    });
    await p.evaluate(() => { document.querySelector(".talk .tk-x")?.click(); window.capture.ui(false); });
  } else console.log("t16-talk: no carrier on the street");
}

// TV mode: the camera cuts on its own (the rig's camera, no scripted shot)
await act("t17-tv", 2, async (t, k, fr) => {
  if (fr === 0) await p.evaluate(() => street.tv.start());
  const V = "street.rig.focus.constructor";
  if (fr === 0) await p.evaluate(`street.rig.district(new ${V}(0, 1, 19), 2.1)`);
  if (fr === 39) await p.evaluate(`street.rig.district(new ${V}(-37.5, 1, 21), 2.2)`);
  if (fr === 78) await p.evaluate(() => street.rig.setMode("overview"));
  return null;
});
await p.evaluate(() => street.tv.stop());

// ---- the MEMPOOL: a truck brings the parcels in, zkSNARKs come and pick theirs up ----
if (!only.length || only.includes("t19-delivery")) {
  await p.evaluate(() => { street.director.debugCarrier("shielded"); setTimeout(() => street.director.debugCarrier("shielded"), 700); });
  // until the truck has pulled up at the shop
  for (let i = 0; i < 600; i++) {
    const ok = await p.evaluate(() => [...street.director.trucks].some((k) => Math.abs(k.group.position.x + 4) < 9 && k.group.visible));
    if (ok) break;
    await step(0.2);
  }
  await step(1.2);
}
await act("t19-delivery", 3.5, dolly([-2.5, 7.2, 3.6], [-4.5, 6.4, 3.0], [-7.5, 0.6, -8.2], [-8.5, 0.6, -8.6], 46));
if (!only.length || only.includes("t20-mempool-in")) await p.evaluate(() => window.capture.enter("mempool", 0));
await act("t20-mempool-in", 2, async (_t, k) => {
  const y = await p.evaluate(() => street.interiors.active.floors[0].spawn.y);
  return { pos: lerp([0.6, y + 1.6, -0.6], [-0.4, y + 1.55, -4.2], ease(k)), look: lerp([-1.5, y + 1.2, -8], [-2.5, y + 1.0, -10], ease(k)), fov: 58 };
});

// ---- the LIBRARY: a ZIP slides out of the shelf, opens, its pages turn ----
if (!only.length || only.includes("t21-library")) {
  await p.evaluate(() => { window.capture.leave(); window.capture.enter("library", 1); });
  // the ZIP list arrives from the API, then the books are shelved
  for (let i = 0; i < 30; i++) {
    const n = await p.evaluate(() => { let n = 0; street.interiors.active.scene.traverse((o) => o.userData.zip && n++); return n; });
    if (n) break;
    await live(1000);
  }
}
{
  const book = (!only.length || only.includes("t21-library")) && (await p.evaluate(() => {
    let best = null;
    street.interiors.active.scene.traverse((o) => {
      const z = o.userData.zip;
      if (!z) return;
      const rank = z.number === 317 ? 0 : z.number === 226 ? 1 : z.status === "Final" ? 2 : 3;
      if (!best || rank < best.rank) {
        const v = o.position.clone();
        o.getWorldPosition(v);
        best = { rank, x: v.x, y: v.y, z: v.z, dir: o.userData.dir ?? 1, n: z.number };
      }
    });
    return best;
  }));
  if (book) {
    // the readers wandering the stacks stay out of this shot
    await p.evaluate(() => street.interiors.active.scene.traverse((o) => { if (o.userData.snarkRef) o.visible = false; }));
    await p.addStyleTag({ content: "#ui > *:not(.reader){visibility:hidden !important} #ui{display:block !important}" });
    await p.evaluate(() => window.capture.ui(true));
    const cam = (k) => ({ pos: lerp([book.x + book.dir * 2.4, book.y + 0.35, book.z + 1.3], [book.x + book.dir * 1.5, book.y + 0.15, book.z + 0.5], ease(Math.min(1, k * 2.2))), look: [book.x, book.y, book.z], fov: 50 });
    await act("t21-library", 3, async (_t, k, fr) => {
      const c = cam(k);
      if (fr < 34) {
        // the cursor rests on the book: it slides out and lights up
        await p.evaluate((c, b) => {
          window.capture.shot(c);
          const cm = street.interiors.walk.camera;
          const q = new cm.position.constructor(b.x, b.y, b.z).project(cm);
          street.interiors.hoverAt(((q.x + 1) / 2) * innerWidth, ((1 - q.y) / 2) * innerHeight);
        }, c, book);
      }
      if (fr === 34)
        console.log(
          "pick",
          await p.evaluate((b) => {
            const cm = street.interiors.walk.camera;
            cm.updateMatrixWorld();
            const q = new cm.position.constructor(b.x, b.y, b.z).project(cm);
            const x = ((q.x + 1) / 2) * innerWidth,
              y = ((1 - q.y) / 2) * innerHeight;
            const info = street.interiors.pickAt(x, y);
            if (info?.book) street.reader.show(info.book);
            return JSON.stringify({ x, y, info: info?.title ?? null, cam: cm.position.toArray().map((v) => +v.toFixed(2)) });
          }, book),
        );
      if (fr === 34) await live(3500); // its text comes from github.com/zcash/zips
      if (fr === 62 || fr === 82) await p.keyboard.press("ArrowRight");
      return c;
    });
    await p.evaluate(() => { street.reader.close(); window.capture.ui(false); });
  } else if (!only.length || only.includes("t21-library")) console.log("t21-library: no ZIP book found");
  if (!only.length || only.some((n) => n === "t20-mempool-in" || n === "t21-library")) await p.evaluate(() => window.capture.leave());
}

// the night half of the day/night wipe, and the outro plate
const wipe = dolly([-30, 16, 26], [-18, 14, 22], [-6, 2, 2], [2, 2, 2], 44);
await act("t13-night", 2, wipe);
await act("t18-outro", 2.5, dolly([10, 34, 46], [16, 44, 58], [0, 3, 0], [0, 2, -2], 40));

// ================================ day ============================================================
if (!only.length || only.includes("t13-day")) await boot("day");
await act("t13-day", 2, wipe);

console.log("done", errors.join(" | "));
await b.close();
