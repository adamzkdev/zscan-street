// node shots/_cinema.mjs [--port 3038] : ZK CINEMA (mall level 4): the lobby, the corridor, each screening room
// with its film playing (video state printed), the sound routed through the soundscape, then leaving
// (videos paused, then thrown away). Pictures in $OUT (default /tmp): cine-*.jpg
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3038";
const OUT = process.env.OUT ?? "/tmp";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: 1200, height: 740 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
p.on("response", (r) => r.status() >= 400 && !r.url().includes("api.zscan") && errs.push(`${r.status()} ${r.url()}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=${process.env.THEME ?? "night"}`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await wait(4000);
await p.mouse.click(600, 700);
await p.evaluate(() => window.__sound?.start());
await p.evaluate(() => street.enter("mall"));
await wait(3000);
await p.evaluate(() => street.interiors.goTo(4));
await wait(2500);
const at = (x, z, yaw, pitch = -0.05) =>
  p.evaluate(
    ([x, z, yaw, pitch]) => {
      const W = street.interiors.walk;
      const V = W.camera.position.constructor;
      W.place(new V(x, 24, z), yaw, 24);
      W.pitch = pitch;
    },
    [x, z, yaw, pitch],
  );
const fps = () => p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
const shot = async (name) => {
  await p.screenshot({ path: `${OUT}/cine-${name}.jpg`, type: "jpeg", quality: 78 });
};
// the front from the corridor round the void, the lobby, its posters, the corridor
await at(0, -30, 0, 0.05);
await wait(2000);
await shot("front");
await at(-12, -43.5, 0.25);
await wait(2000);
await shot("lobby");
await at(-12, -47, Math.PI / 2 + 0.2);
await wait(1500);
await shot("lobby-west");
await at(-9, -46, -Math.PI / 2 - 0.3);
await wait(1500);
await shot("lobby-east");
await at(-3.5, -41.6, -Math.PI / 2);
await wait(1500);
await shot("corridor");
console.log("lobby fps", await fps());
const rooms = await p.evaluate(() => window.__cinema.rooms.map((r) => [r.x0, r.x1]));
for (let j = 0; j < rooms.length; j++) {
  const [x0, x1] = rooms[j];
  await at(x1 - 1.3, -47, 0.39, 0.02);
  await wait(6000);
  console.log("room", j + 1, JSON.stringify(await p.evaluate(() => window.__cinema.debug)), "fps", await fps());
  await shot(`room${j + 1}`);
  await at((x0 + x1) / 2 - 1.5, -53.8, Math.PI - 0.25, -0.05);
  await wait(800);
  await shot(`room${j + 1}-seats`);
}
console.log("sound", JSON.stringify(await p.evaluate(() => { const d = window.__sound?.debug; return d && { on: d.on, scene: d.scene, rms: d.rms }; })));
// out to the corridor: everything pauses; leave the mall: nothing plays
await at(10, -41.6, -Math.PI / 2);
await wait(1500);
console.log("corridor", JSON.stringify(await p.evaluate(() => window.__cinema.debug)));
await p.evaluate(() => street.interiors.exit());
await wait(23000);
console.log("left the mall", JSON.stringify(await p.evaluate(() => window.__cinema.debug)));
console.log("errors", errs.slice(0, 5).join(" | ") || "none");
await b.close();
