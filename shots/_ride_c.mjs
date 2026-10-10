// node shots/_ride_c.mjs: rides the prison tier stairs and catwalk and the Colosseum stairs up and down (one page per place)
import puppeteer from "puppeteer-core";
const RIDES = [
  ["mall", [[2, -7.78, -21.8, 0, -1, 22]]],
];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 800, height: 500 } });
for (const [key, rides] of RIDES) {
  const p = await b.newPage();
  for (const r of rides) {
    for (let tries = 0; tries < 4; tries++) {
      try {
        if (tries || r === rides[0]) {
          await p.goto(`http://localhost:${process.env.PORT ?? 3008}/?debug&theme=day&interior=${key}`, { timeout: 300000 });
          await p.waitForFunction(() => window.street?.interiors?.active, { timeout: 300000 });
          await new Promise((res) => setTimeout(res, 3000));
        }
        const log = await p.evaluate(async ([f, x, z, dx, dz, secs]) => {
          const I = street.interiors; I.goTo(f);
          const W = I.walk; const y = I.active.floors[f].y; const V = W.camera.position.constructor;
          W.place(new V(x, y, z), Math.atan2(-dx, -dz), y);
          const out = [];
          for (let k = 0; k < secs * 30; k++) {
            W.keys.add("w");
            await new Promise((r) => requestAnimationFrame(r));
            if (k % 30 === 0) out.push(`t=${(k / 30).toFixed(0)} floor=${I.floor} feet=${W.floor.toFixed(2)} at=${W.camera.position.x.toFixed(1)},${W.camera.position.z.toFixed(1)}`);
          }
          W.keys.delete("w");
          return out.join("\n");
        }, r);
        console.log(`== ${key} ${r.join(" ")}\n${log}`);
        break;
      } catch (e) { console.log(`retry ${key}: ${e.message.slice(0, 80)}`); }
    }
  }
  await p.close();
}
await b.close();
console.log("DONE");
