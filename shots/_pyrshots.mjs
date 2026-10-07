// node shots.mjs port outdir  — first-person views of the pyramid's connected levels + mummies + audio levels
import puppeteer from "puppeteer-core";
const [port = "3043", out = "."] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: 1280, height: 760 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=night&interior=pyramid`);
await p.waitForFunction(() => window.street?.interiors?.active?.key === "pyramid", { timeout: 180000 });
await p.waitForFunction(() => street.interiors.active.scene.userData.mummies?.count === 3, { timeout: 60000 });
await wait(2500);
const only = process.env.ONLY?.split(",");
const view = async (name, x, z, yaw, pitch = 0, setup = "") => {
  if (only && !only.includes(name)) return;
  await p.evaluate(
    (x, z, yaw, pitch, setup) => {
      const I = street.interiors;
      const V = I.walk.camera.position.constructor;
      const y = I.active.groundAt?.(0, x, z) ?? 0;
      I.walk.place(new V(x, y, z), yaw, y);
      I.walk.pitch = pitch;
      if (setup) new Function("T", setup)(I.active.scene.userData.mummies);
    },
    x,
    z,
    yaw,
    pitch,
    setup,
  );
  await wait(1400);
  await p.screenshot({ path: `${out}/pyr-${name}.png` });
  const info = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res({ fps: n, floor: street.interiors.floor, label: document.querySelector(".indoor .it span")?.textContent }); }; requestAnimationFrame(f); }));
  console.log(name, JSON.stringify(info));
};
const PI = Math.PI;
await view("hall-mummy", 0, -11.0, 0, 0.02, "T.grace = 99; T.put(0, 0.4, -16.4, 0, 1);");
await view("maze-deep", 0, -30, 0, 0);
await view("exit-up", -5.2, -45.0, 0, 0.12);
await view("asc-mid", -5.2, -53.0, 0, 0.15);
await view("gallery-foot", -5.2, -63.6, 0, 0.3);
await view("gallery-down", -5.2, -105, PI, -0.25);
await view("gallery-top", -5.2, -108.5, 0, 0.05);
await view("chamber", -5.2, -116.5, 0, -0.05);
await view("hall-west", -2.5, -14.1, PI / 2, 0);
await view("desc-top", -7.0, -14.1, PI / 2, -0.25);
await view("desc-up", -19.5, -14.1, -PI / 2, 0.2);
await view("sub-room", -22.3, -12.5, PI / 2 + 0.3, -0.05);
await view("sub-pit", -24.2, -13.4, PI / 2 - 0.75, -0.4);
await view("gallery-back", -5.2, -66.0, PI, -0.1);
// a mummy that has just seen you
await view("spotted", 0, -11.5, 0, 0.02, "T.grace = 0; T.put(0, 0, -15.0, 0, 1);");
await wait(200);
await p.screenshot({ path: `${out}/pyr-spotted2.png` });
await p.evaluate(() => (street.interiors.active.scene.userData.mummies.grace = 99));

if (only) process.exit(0);
// sound: the pyramid's scene, its layers and level, calm vs chase
const snd = await p.evaluate(async () => {
  const S = window.__sound;
  if (!S) return "no __sound";
  await S.start();
  const I = street.interiors;
  const V = I.walk.camera.position.constructor;
  I.walk.place(new V(0, 0, -12), 0, 0);
  const rms = async (ms) => {
    let a = 0, n = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      await new Promise((r) => setTimeout(r, 100));
      a += S.debug.rms;
      n++;
    }
    return +(a / n).toFixed(4);
  };
  await new Promise((r) => setTimeout(r, 4000));
  const calm = await rms(6000);
  const d1 = S.debug;
  window.dispatchEvent(new CustomEvent("zstreet:sound", { detail: { name: "spotted" } }));
  window.dispatchEvent(new CustomEvent("zstreet:sound", { detail: { name: "chase", arg: true } }));
  await new Promise((r) => setTimeout(r, 1500));
  const chase = await rms(5000);
  window.dispatchEvent(new CustomEvent("zstreet:sound", { detail: { name: "chase", arg: false } }));
  await new Promise((r) => setTimeout(r, 6000));
  const after = await rms(3000);
  // compare: the museum's quiet hall bed
  I.exit();
  I.enter("museum", 0);
  await new Promise((r) => setTimeout(r, 6000));
  const museum = await rms(4000);
  return { scene: d1.scene, layers: d1.layers, events: d1.events, calm, chase, after, museum, state: S.debug.state };
});
console.log("sound", JSON.stringify(snd));
await b.close();
