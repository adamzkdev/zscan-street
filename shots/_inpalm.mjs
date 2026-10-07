// node shots/_in.mjs <interior key> "name:x,z,yaw,floor,pitch|name2:..." [day|night]
// Walks into a place (?interior=<key>) and takes a first-person screenshot per view:
// x/z in the interior's metres, yaw in radians (0 looks towards -z), floor = index, pitch radians.
// Writes shots/in-<key>-<name>.png and prints page errors and the fps.
import puppeteer from "puppeteer-core";
const [key, viewsArg = "spawn:0,-1.5,0,0,0", theme = "night"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
p.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && console.log("[error]", m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let reloaded = false;
p.on("framenavigated", (f) => f === p.mainFrame() && (reloaded = true));
await p.goto(`http://localhost:${process.env.PORT||3007}/?debug&theme=${theme}&interior=${key}`);
async function ready() {
  for (let k = 0; k < 120; k++) {
    try {
      if (await p.evaluate(() => !!window.street?.interiors?.active)) return;
    } catch {}
    await wait(1000);
  }
  throw new Error("interior never opened");
}
await ready();
await wait(3000);
const views = viewsArg.split("|").map((v) => {
  const [name, rest] = v.split(":");
  const [x, z, yaw, floor, pitch] = rest.split(",").map(Number);
  return { name, x, z, yaw: yaw || 0, floor: floor || 0, pitch: pitch || 0 };
});
for (let i = 0; i < views.length; i++) {
  const v = views[i];
  reloaded = false;
  try {
    await p.evaluate((v) => {
      const I = street.interiors;
      I.goTo(v.floor);
      const y = I.active.floors[I.floor].y;
      const V = I.walk.camera.position.constructor;
      I.walk.place(new V(v.x, y, v.z), v.yaw, y);
      I.walk.pitch = v.pitch;
    }, v);
    await wait(1500);
    if (reloaded) throw new Error("reloaded");
    await p.screenshot({ path: `shots/in-${key}-${v.name}.png` });
    console.log(`shots/in-${key}-${v.name}.png`);
  } catch (e) {
    console.log("retry", v.name, e.message);
    await wait(3000);
    await ready();
    await wait(2000);
    i--;
  }
}
const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
console.log("fps", fps);
await b.close();
