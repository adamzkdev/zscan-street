// Live music check: turns the sound on, walks into places and looks at the musicians.
// usage: node shots/_music.mjs [port] "key:floor:x,z,lookX,lookZ[,pitch][,wait]:name|..." [day|night]
// Each view stands at (x, z) on the floor looking at (lookX, lookZ), waits, screenshots
// shots/music-<name>.png, and prints the soundscape (scene, rms, live sources and their meters).
// Also prints every /audio/ response that was not 200 and the page errors.
import puppeteer from "puppeteer-core";
const [port = "3032", viewsArg = "hotel:0:-3.5,-7,-6,-10.6:lobby", theme = "night"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const errs = [];
const files = new Map();
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => (m.type() === "error" || /sound/.test(m.text())) && !m.text().includes("Failed to load resource") && errs.push("[console] " + m.text()));
p.on("response", (r) => {
  const u = r.url();
  if (u.includes("/audio/")) files.set(u.split("/audio/")[1], r.status());
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=${theme}`);
await p.waitForFunction(() => window.street?.interiors && window.__sound, { timeout: 180000 });
await wait(4000);
await p.evaluate(() => window.__sound.start());
for (const v of viewsArg.split("|")) {
  const [key, floor, coords, name] = v.split(":");
  const [x, z, lx, lz, pitch = -0.05, stay = 5000] = coords.split(",").map(Number);
  await p.evaluate(
    (key, floor) => {
      const I = street.interiors;
      if (!I.active || I.active.key !== key) street.enter(key);
      I.goTo(floor);
    },
    key,
    Number(floor),
  );
  await p.waitForFunction((key) => street.interiors.active?.key === key, { timeout: 60000 }, key).catch(() => {});
  await wait(1500);
  await p.evaluate(
    (x, z, lx, lz, pitch) => {
      const I = street.interiors;
      const y = I.active.floors[I.floor].y;
      const V = I.walk.camera.position.constructor;
      I.walk.place(new V(x, y, z), Math.atan2(-(lx - x), -(lz - z)), y);
      I.walk.pitch = pitch;
    },
    x,
    z,
    lx,
    lz,
    pitch,
  );
  await wait(stay);
  await p.screenshot({ path: `shots/music-${name}.png` });
  const d = await p.evaluate(() => window.__sound.debug);
  console.log(name.padEnd(16), d.scene.padEnd(14), "rms", String(d.rms).padEnd(7), JSON.stringify(d.live));
}
const bad = [...files].filter(([, s]) => s !== 200 && s !== 206 && s !== 304);
console.log("audio files:", files.size, "not ok:", JSON.stringify(bad));
console.log("errors:", errs.length ? errs.slice(0, 8).join(" | ") : "none");
await b.close();
