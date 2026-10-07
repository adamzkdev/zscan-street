// The Opera's evening: a piece per block. Sound on, into the Concert Hall, screenshots while a
// piece plays, then a new block (window.__opera.next()): the finale, the applause and bows, the
// curtain, the next piece; then the foyer (the music through the doors).
// usage: node shots/_musicopera.mjs [port] [programme index to start with]
import puppeteer from "puppeteer-core";
const port = process.argv[2] ?? "3032";
const start = process.argv[3];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const errs = [];
const files = new Map();
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|CORS|api\.zscan/.test(m.text()) && errs.push("[console] " + m.text()));
p.on("response", (r) => {
  const u = r.url();
  if (u.includes("/audio/")) files.set(u.split("/audio/")[1], r.status());
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=night`);
await p.waitForFunction(() => window.street?.interiors && window.__sound, { timeout: 180000 });
await wait(4000);
await p.evaluate(() => window.__sound.start());
await p.evaluate(() => street.enter("opera"));
await p.waitForFunction(() => street.interiors.active?.key === "opera", { timeout: 60000 });
const stand = (floor, x, z, lx, lz, pitch = -0.05) =>
  p.evaluate(
    (floor, x, z, lx, lz, pitch) => {
      const I = street.interiors;
      if (I.floor !== floor) I.goTo(floor);
      const y = I.active.floors[I.floor].y;
      const V = I.walk.camera.position.constructor;
      const gy = I.active.groundAt?.(floor, x, z) ?? y;
      I.walk.place(new V(x, gy, z), Math.atan2(-(lx - x), -(lz - z)), gy);
      I.walk.pitch = pitch;
    },
    floor,
    x,
    z,
    lx,
    lz,
    pitch,
  );
const state = async (label) => {
  const o = await p.evaluate(() => window.__opera.state);
  const d = await p.evaluate(() => window.__sound.debug);
  console.log(label.padEnd(14), o.phase.padEnd(9), o.piece.padEnd(42), o.staging.padEnd(9), "curtain", o.curtain.toFixed(2), "| scene", d.scene, "rms", d.rms, JSON.stringify(d.live));
};
const shot = async (name) => p.screenshot({ path: `shots/music-opera-${name}.png` });
await stand(1, 0, -4.6, 0, -9.5, 0.05);
// the soloists and dancers' portraits (the API can be slow)
await p.waitForFunction(() => (window.__bands ?? []).filter((b) => b.debug.place === "opera").every((b) => b.debug.players.every((x) => x.ready)), { timeout: 90000, polling: 500 }).catch(() => console.log("  (some performers missing)"));
if (start !== undefined) await p.evaluate((i) => window.__opera.play(Number(i)), start);
await wait(6000);
await state("playing");
await shot("playing");
await stand(1, -4.5, -6.2, -3.4, -7.5, 0.05);
await wait(1500);
await shot("soloist");
await stand(1, 0, 4, 0, -9.5, -0.02);
const until = (fn, ms = 40000) => p.waitForFunction(fn, { timeout: ms, polling: 200 }).catch(() => console.log("  (timed out)"));
await p.evaluate(() => window.__opera.next());
await until(() => window.__opera.state.phase === "applause" && window.__opera.state.phaseT > 2.6);
await state("applause");
await shot("applause");
await until(() => window.__opera.state.phase === "curtain" && window.__opera.state.curtain > 0.85);
await state("curtain");
await shot("curtain");
await until(() => window.__opera.state.phase === "playing" && window.__opera.state.phaseT > 4);
await state("next piece");
await shot("next");
// every staging, from the front row
for (const [i, name] of [[3, "ballet"], [5, "duet"], [8, "waltz"], [4, "flute"], [7, "baritone"]]) {
  await p.evaluate((i) => window.__opera.play(i), i);
  await stand(1, name === "flute" ? -2.2 : 0, name === "flute" ? -4.4 : 1.5, name === "flute" ? -3.4 : 0, -8, name === "flute" ? 0.05 : -0.02);
  await wait(4000);
  await state(name);
  await shot(name);
}
await stand(0, 0, 6, 0, -8, 0);
await wait(5000);
await state("foyer");
const bad = [...files].filter(([, s]) => s !== 200 && s !== 206 && s !== 304);
console.log("audio files:", files.size, [...files.keys()].filter((k) => k.startsWith("music") || k.startsWith("appl")).join(","), "not ok:", JSON.stringify(bad));
console.log("errors:", errs.length ? errs.slice(0, 8).join(" | ") : "none");
await b.close();
