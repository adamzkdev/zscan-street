// node shots/_ride.mjs <place> <floor> <x> <z> <dirx> <dirz> [secs]: walk from (x,z) along dir; report floor/y/pos over time
import puppeteer from "puppeteer-core";
const [key, f, x, z, dx, dz, secs = "12"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1200, height: 760 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto(`http://localhost:${process.env.PORT ?? 3007}/?debug&theme=day&interior=${key}`);
await p.waitForFunction(() => window.street?.interiors?.active, { timeout: 150000 });
await new Promise((r) => setTimeout(r, 3000));
const log = await p.evaluate(async ([f, x, z, dx, dz, secs]) => {
  const I = street.interiors; I.goTo(f);
  const W = I.walk;
  const y = I.active.floors[f].y;
  const V = W.camera.position.constructor;
  W.place(new V(x, y, z), Math.atan2(-dx, -dz), y);
  const out = [];
  for (let k = 0; k < secs * 30; k++) {
    W.keys.add("w");
    await new Promise((r) => requestAnimationFrame(r));
    if (k % 15 === 0) out.push(`t=${(k / 30).toFixed(1)} floor=${I.floor} feet=${W.floor.toFixed(2)} at=${W.camera.position.x.toFixed(1)},${W.camera.position.z.toFixed(1)}`);
  }
  W.keys.delete("w");
  return out.join("\n");
}, [Number(f), Number(x), Number(z), Number(dx), Number(dz), Number(secs)]);
console.log(log);
await p.screenshot({ path: `shots/ride-${key}.png` });
await b.close();
