// Real-recording soundscapes: turns the sound on, visits a few districts and places, checks the
// audio files load (HTTP 200) and that each scene plays (rms > 0), with no page errors.
// usage: node shots/_sound.mjs [port] [keys]
import puppeteer from "puppeteer-core";
const port = process.argv[2] ?? "3011";
const keys = (process.argv[3] ?? "stadium,colosseum,museum,prison,factory,pyramid,eiffel,opera,bigben,hotel,mall,statue").split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const errs = [];
const files = new Map();
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => /sound/.test(m.text()) && errs.push("[console] " + m.text()));
p.on("response", (r) => {
  const u = r.url();
  if (u.includes("/audio/")) files.set(u.split("/audio/")[1], r.status());
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=day`);
await p.waitForFunction(() => window.street && window.__sound, { timeout: 120000 });
await wait(5000);
await p.evaluate(() => window.__sound.start());
const dbg = () => p.evaluate(() => window.__sound.debug);
const show = (label, d) => console.log(label.padEnd(26), d.scene.padEnd(16), "rms", String(d.rms).padEnd(7), (d.layers ?? []).join(","), Object.keys(d.districtLayers ?? {}).length ? JSON.stringify(d.districtLayers) : "");
await wait(5000);
show("street (downtown)", await dbg());
for (const [name, x, z] of [
  ["shibuya", -70, -175],
  ["bay", 0, 160],
  ["park", 0, -80],
  ["westminster", 86, 50],
  ["port", -175, 104],
]) {
  await p.evaluate((x, z) => {
    const r = street.rig;
    r.flyTo(new r.controls.target.constructor(x, 1, z), 1.6);
  }, x, z);
  await wait(6000);
  show("street " + name, await dbg());
}
for (const k of keys) {
  errs.length && console.log("  errors:", errs.splice(0).slice(0, 3).join(" | "));
  await p.evaluate((k) => (k === "stadium" ? street.interiors.enter(k, 0) : street.enter(k)), k);
  await p.waitForFunction(() => street.interiors.active, { timeout: 60000 }).catch(() => {});
  await wait(4500);
  show(k, await dbg());
  if (k === "stadium") {
    await p.evaluate(() => window.dispatchEvent(new CustomEvent("zstreet:stadium-goal", { detail: { shielded: true } })));
    await wait(1500);
    show("  goal!", await dbg());
  }
  if (k === "bigben") {
    const n = await p.evaluate(() => street.interiors.active.floors.findIndex((f) => /clock room/i.test(f.name)));
    if (n >= 0) {
      await p.evaluate((n) => street.interiors.goTo(n), n);
      await wait(4000);
      show("  clock room", await dbg());
      await p.evaluate(() => window.__sound.event("bong"));
      await wait(1200);
      show("  bong", await dbg());
    }
  }
  await p.evaluate(() => street.interiors.exit());
  await wait(1500);
}
await wait(2000);
console.log("files:", [...files].map(([f, s]) => `${f}:${s}`).join(" "));
console.log("errors:", errs.join(" | ") || "none");
await b.close();
