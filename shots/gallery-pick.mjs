import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
p.on("console", (m) => m.type() === "error" && logs.push(m.text().slice(0, 300)));
await p.goto("http://localhost:3007/?debug&theme=night&interior=cards");
await new Promise((r) => setTimeout(r, 13000));
const tests = [[7, 0, -14, 1.57, 0], [0, 0, -12, 1.57, 0.1], [0, -9, -14, 1.57, 0.2], [0, 0, -20, 0, -0.3], [1, 0, -4.2, 1.57, 0.1], [0, 9, -14, -1.57, 0.2]];
for (const [f, x, z, yaw, pitch] of tests) {
  const r = await p.evaluate((f, x, z, yaw, pitch) => new Promise((res) => {
    const I = street.interiors;
    I.goTo(f);
    const V = I.walk.camera.position.constructor;
    I.walk.place(new V(x, 0, z), yaw, I.active.floors[f].y);
    I.walk.pitch = pitch;
    setTimeout(() => {
      const pk = I.pickAt(innerWidth / 2, innerHeight / 2);
      res({ hover: I.hoverAt(innerWidth / 2, innerHeight / 2), pick: pk && { ...pk, body: pk.body?.slice(0, 160) } });
    }, 400);
  }), f, x, z, yaw, pitch);
  console.log(f, JSON.stringify(r));
}
await p.evaluate(() => street.interiors.goTo(7));
await new Promise((r) => setTimeout(r, 500));
const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
console.log("fps floor 7", fps);
console.log(logs.join("\n") || "no errors");
await b.close();
