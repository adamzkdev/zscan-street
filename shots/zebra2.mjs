import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1200, height: 800 } });
const p = await b.newPage();
await p.goto("http://localhost:3007/?debug");
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  console.log(await p.evaluate(() => {
    const d = street.director, zx = -0.5;
    const vs = [...d.traffic.vehicles].filter((v) => Math.max(v.front, v.rear) > zx - 1.3 && Math.min(v.front, v.rear) < zx + 1.3).map((v) => `${v.mover.constructor.name}:${v.lane} x=${v.x.toFixed(1)} v=${v.v.toFixed(2)} tgt=${v.targetX}`);
    const ss = [...d.snarks].filter((s) => Math.abs(s.root.position.x - zx) < 1.6 && s.root.position.z > -5.4 && s.root.position.z < 2.6).map((s) => `${s.id}:${s.state}/${s.role} z=${s.root.position.z.toFixed(1)} walk=${s.isWalking} parent=${s.root.parent?.type}`);
    return "V " + vs.join(" ; ") + " || S " + ss.join(" ; ");
  }));
}
await b.close();
