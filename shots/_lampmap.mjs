// node shots/_lampmap.mjs: a top-down map of the street lamps (red) over the roads (grey), the buildings (dark), the doors (gold)
import puppeteer from "puppeteer-core";
import fs from "fs";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 800, height: 600 } });
const p = await b.newPage();
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&solo");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
const url = await p.evaluate(() => {
  const g = street.gta, s = g.solid, R = g.roads, b = g.host.bounds;
  const K = 2;
  const c = document.createElement("canvas");
  c.width = Math.ceil((b.x1 - b.x0) * K);
  c.height = Math.ceil((b.z1 - b.z0) * K);
  const x = c.getContext("2d");
  const img = x.createImageData(c.width, c.height);
  for (let j = 0; j < c.height; j++)
    for (let i = 0; i < c.width; i++) {
      const wx = b.x0 + i / K, wz = b.z0 + j / K;
      const t = s.topAt(wx, wz);
      let col = [222, 218, 206];
      if (t !== t || t === undefined || t < -0.35) col = [70, 110, 150];
      else if (R.road(wx, wz)) col = [120, 120, 125];
      else if (t > 2) col = [40, 40, 48];
      else if (t > 0.7) col = [150, 140, 120];
      const k = (j * c.width + i) * 4;
      img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  for (const f of g.host.furniture()) {
    if (f.type !== "lamp") continue;
    x.fillStyle = "#ff2020";
    x.fillRect((f.x - b.x0) * K - 2, (f.z - b.z0) * K - 2, 4, 4);
  }
  for (const d of g.placeSpots) {
    x.fillStyle = "#f4b728";
    x.fillRect((d.x - b.x0) * K - 4, (d.z - b.z0) * K - 4, 8, 8);
  }
  return c.toDataURL("image/png");
});
fs.writeFileSync("shots/gta/lampmap.png", Buffer.from(url.split(",")[1], "base64"));
await b.close();
