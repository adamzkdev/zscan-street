import puppeteer from "puppeteer-core";
// usage: node shots/gallery.mjs "floor,x,z,yaw,pitch,name;..."
const views = (process.argv[2] ?? "0,0,-2.4,0,0,g-a").split(";").map((v) => v.split(","));
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(m.text().slice(0, 300)));
await p.goto("http://localhost:3007/?debug&theme=night&interior=cards");
await new Promise((r) => setTimeout(r, 13000));
const ready = async () => {
  for (let i = 0; i < 60; i++) {
    const ok = await p.evaluate(() => !!(window.street && street.interiors.active && street.interiors.active.key === "cards")).catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
};
for (const [f, x, z, yaw, pitch, name] of views) {
  for (let attempt = 0; attempt < 4; attempt++) {
  try {
  await ready();
  await p.evaluate((f, x, z, yaw, pitch) => {
    const I = street.interiors;
    I.goTo(+f);
    const fl = I.active.floors[+f];
    const V = I.walk.camera.position.constructor;
    I.walk.place(new V(+x, 0, +z), +yaw, fl.y);
    I.walk.pitch = +pitch;
  }, f, x, z, yaw, pitch);
  await new Promise((r) => setTimeout(r, 900));
  await p.screenshot({ path: `shots/gallery-${name}.png` });
  break;
  } catch (e) { console.log("retry", name, e.message.slice(0, 80)); await new Promise((r) => setTimeout(r, 3000)); }
  }
}
const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
const info = await p.evaluate(() => { const r = street.renderer ?? null; return r ? JSON.stringify(r.info.render) : "no renderer"; });
console.log("fps", fps, info);
console.log(logs.join("\n") || "no errors");
await b.close();
