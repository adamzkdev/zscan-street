import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(`[${m.type()}] ${m.text()}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug&theme=night&interior=bank");
await wait(12000);
const only = process.argv[2] ? process.argv[2].split(",") : null;
// [name, x, z, yaw, floorY, pitch]
const views = [
  ["spawn", 0, -2.4, 0, 0],
  ["island", 3, -7.5, 0.2, 0],
  ["terminal", 0, -9.4, 0, 0, -0.35],
  ["tellers", 3, -21.5, 0.1, 0],
  ["pools", -7, -14, Math.PI / 2, 0],
  ["supply", 7, -14, -Math.PI / 2, 0],
  ["back", 0, -24, Math.PI, 0],
  ["corner", 15, -26, 0.75, 0],
  ["vlobby", 0, -1.4, 0, -6],
  ["vcorr", 0, -9, 0, -6],
  ["vroom", -1, -13.5, Math.PI / 2, -6, -0.3],
  ["vroomR", 1.5, -22.5, -Math.PI / 2, -6, -0.3],
  ["vend", 0, -28.5, 0, -6, -0.2],
];
let reloaded = false;
p.on("framenavigated", (f) => f === p.mainFrame() && (reloaded = true));
async function ready() {
  for (;;) {
    try {
      if (await p.evaluate(() => !!window.street?.interiors?.active)) return;
    } catch {}
    await wait(1000);
  }
}
await ready();
for (let vi = 0; vi < views.length; vi++) {
  const [n, x, z, yaw, fy, pitch] = views[vi];
  if (only && !only.includes(n)) continue;
  reloaded = false;
  try {
  await p.evaluate(
    (x, z, yaw, fy, pitch) => {
      const I = street.interiors;
      I.goTo(fy < 0 ? 1 : 0);
      const V = I.walk.camera.position.constructor;
      I.walk.place(new V(x, fy, z), yaw, fy);
      if (pitch) I.walk.pitch = pitch;
    },
    x, z, yaw, fy, pitch ?? 0,
  );
  await wait(1500);
  if (reloaded) throw new Error("reloaded");
  await p.screenshot({ path: `shots/bank-in-${n}.png` });
  } catch (e) {
    console.log("retry", n, e.message);
    await wait(3000);
    await ready();
    await wait(4000);
    vi--;
  }
}
// clicks
let r;
for (;;) { try { r = await p.evaluate(async () => {
  const I = street.interiors;
  I.goTo(0);
  const V = I.walk.camera.position.constructor;
  I.walk.place(new V(4.6, 0, -13), Math.PI / 2, 0);
  I.walk.pitch = -0.3;
  await new Promise((r) => setTimeout(r, 400));
  const a = I.pickAt(innerWidth / 2, innerHeight / 2);
  const h = I.hoverAt(innerWidth / 2, innerHeight / 2);
  I.goTo(1);
  I.walk.place(new V(-2.5, -6, -13.5), Math.PI / 2, -6);
  I.walk.pitch = -0.32;
  await new Promise((r) => setTimeout(r, 400));
  const v = I.pickAt(innerWidth / 2, innerHeight / 2);
  // fps
  let n = 0;
  const t0 = performance.now();
  await new Promise((res) => {
    const f = () => (++n, performance.now() - t0 < 3000 ? requestAnimationFrame(f) : res());
    requestAnimationFrame(f);
  });
  const fps1 = n / 3;
  I.goTo(0);
  n = 0;
  const t1 = performance.now();
  await new Promise((res) => {
    const f = () => (++n, performance.now() - t1 < 3000 ? requestAnimationFrame(f) : res());
    requestAnimationFrame(f);
  });
  const info = street.interiors.active ? null : "not inside";
  return { a, h, v, fps1, fps0: n / 3, info, snarks: street.interiors.active?.scene.children.length };
}); break; } catch (e) { console.log("retry clicks"); await ready(); await wait(4000); } }
console.log(JSON.stringify(r, null, 1));
console.log(logs.slice(0, 30).join("\n"));
await b.close();
