// Every live musician (src/interior/music): sound on, into each place and floor that has a band,
// waits for the players' portraits, stands ~3.5 m in front of the band and screenshots
// shots/musician-<place>-<floor>-<n>.png; prints the soundscape's live sources and meters.
// usage: node shots/_musicians.mjs [port] [places,comma,separated]
import puppeteer from "puppeteer-core";
const port = process.argv[2] ?? "3032";
const only = process.argv[3]?.split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const errs = [];
const files = new Map();
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|CORS|api\.zscan/.test(m.text()) && errs.push("[console] " + m.text()));
p.on("response", (r) => r.url().includes("/audio/") && files.set(r.url().split("/audio/")[1], r.status()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=night`);
await p.waitForFunction(() => window.street?.interiors && window.__sound, { timeout: 180000 });
await wait(3000);
await p.evaluate(() => window.__sound.start());
const places = only ?? ["hotel", "arab", "needle", "tower-halo", "tower-orchard", "tower-sapling"];
for (const key of places) {
  await p.evaluate((key) => street.enter(key), key);
  await p.waitForFunction((key) => street.interiors.active?.key === key, { timeout: 60000 }, key).catch(() => {});
  await wait(1500);
  const bands = await p.evaluate((key) => (window.__bands ?? []).map((b, i) => ({ i, ...b.debug })).filter((b) => b.place === key), key);
  for (const band of bands) {
    await p.evaluate((f) => street.interiors.goTo(f), band.floor);
    await p.waitForFunction((i) => window.__bands[i].debug.players.every((x) => x.ready), { timeout: 60000, polling: 500 }, band.i).catch(() => console.log("  players not all ready"));
    const d = await p.evaluate((i) => window.__bands[i].debug, band.i);
    const n = d.players.length;
    const cx = d.players.reduce((a, x) => a + x.x, 0) / n,
      cz = d.players.reduce((a, x) => a + x.z, 0) / n;
    // a pianist is seen from the side of the keyboard (the piano is in front of them)
    const ref = d.players.find((x) => x.kind !== "piano") ?? d.players[0];
    const yaw = ref.yaw + (ref.kind === "piano" ? Math.PI / 2 + Number(process.env.SIDE ?? 0) : 0);
    const dist = n > 1 ? 4.6 : 2.8;
    const camX = cx + Math.sin(yaw) * dist,
      camZ = cz + Math.cos(yaw) * dist;
    await p.evaluate(
      (x, z, lx, lz) => {
        const I = street.interiors;
        const y = I.active.floors[I.floor].y;
        const V = I.walk.camera.position.constructor;
        I.walk.place(new V(x, y, z), Math.atan2(-(lx - x), -(lz - z)), y);
        I.walk.pitch = -0.12;
      },
      camX,
      camZ,
      cx,
      cz,
    );
    await wait(2500);
    const name = `shots/musician-${key}-${band.floor}-${band.i}.png`;
    await p.screenshot({ path: name });
    const s = await p.evaluate(() => window.__sound.debug);
    console.log(name.padEnd(42), d.players.map((x) => x.kind + (x.ready ? "" : "(missing)")).join("+").padEnd(28), s.scene.padEnd(12), "rms", s.rms, JSON.stringify(s.live));
  }
  await p.evaluate(() => street.interiors.exit());
  await wait(1200);
}
const bad = [...files].filter(([, s]) => s !== 200 && s !== 206 && s !== 304);
console.log("audio files:", files.size, "not ok:", JSON.stringify(bad));
console.log("errors:", errs.length ? errs.slice(0, 8).join(" | ") : "none");
await b.close();
