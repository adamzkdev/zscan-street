// node shots/_ride_b.mjs: rides the hotel, reserve and Burj suite flights up and down (one page per place)
import puppeteer from "puppeteer-core";
const RIDES = [
  ["hotel", [[0, -17.3, -21, 0, 1, 13], [1, -17.3, -1.5, 0, -1, 13]]],
  ["reserve", [[5, -24.2, -45, 0, 1, 15], [0, -24.2, -22, 0, -1, 15]]],
  ["arab", [[2, 9.2, -3.5, 0, -1, 7], [3, 9.2, -12.5, 0, 1, 7]]],
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
