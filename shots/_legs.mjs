// node shots/_legs.mjs <place> <floor> <x> <z> '<json legs [{d:[dx,dz],s:secs,shot?:name,pitch?:n}]>'
// walks leg after leg (facing d), logs floor/feet/position, screenshots shots/legs-<place>-<name>.png
import puppeteer from "puppeteer-core";
const [key, f, x, z, legsArg] = process.argv.slice(2);
const legs = JSON.parse(legsArg);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1200, height: 760 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto(`http://localhost:${process.env.PORT ?? 3007}/?debug&theme=day&interior=${key}`);
await p.waitForFunction(() => window.street?.interiors?.active, { timeout: 150000 });
await new Promise((r) => setTimeout(r, 3000));
await p.evaluate(([f, x, z]) => {
  const I = street.interiors; I.goTo(f);
  const y = I.active.floors[f].y;
  const V = I.walk.camera.position.constructor;
  I.walk.place(new V(x, y, z), 0, y);
}, [Number(f), Number(x), Number(z)]);
for (const L of legs) {
  const log = await p.evaluate(async (L) => {
    const I = street.interiors, W = I.walk;
    W.yaw = Math.atan2(-L.d[0], -L.d[1]);
    W.pitch = L.pitch ?? -0.05;
    const out = [];
    for (let k = 0; k < L.s * 30; k++) {
      W.keys.add("w");
      await new Promise((r) => requestAnimationFrame(r));
      if (k % 15 === 0) out.push(`floor=${I.floor} feet=${W.floor.toFixed(2)} at=${W.camera.position.x.toFixed(1)},${W.camera.position.z.toFixed(1)}`);
    }
    W.keys.delete("w");
    out.push(`END floor=${I.floor} feet=${W.floor.toFixed(2)} at=${W.camera.position.x.toFixed(2)},${W.camera.position.z.toFixed(2)}`);
    return out.join("\n");
  }, L);
  console.log(`-- leg ${JSON.stringify(L.d)}\n` + log);
  if (L.shot) {
    await p.evaluate((L) => { const W = street.interiors.walk; if (L.look) W.yaw = Math.atan2(-L.look[0], -L.look[1]); if (L.lp != null) W.pitch = L.lp; }, L);
    await new Promise((r) => setTimeout(r, 900));
    await p.screenshot({ path: `shots/legs-${key}-${L.shot}.png` });
  }
}
await b.close();
