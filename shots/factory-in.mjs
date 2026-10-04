import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/?debug&theme=night&interior=factory`);
await p.waitForFunction(() => window.street?.interiors?.active, { timeout: 40000 });
await new Promise((r) => setTimeout(r, 5000));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const views = JSON.parse(process.argv[2] ?? "[]");
p.on("framenavigated", (f) => f === p.mainFrame() && console.log("[reload]"));
const ready = () => p.waitForFunction(() => window.street?.interiors?.active && window.__factoryTestBlock, { timeout: 40000 });
for (const v of views) {
  await ready();
  if (v.block) { await p.evaluate((h) => window.__factoryTestBlock(h, "Foundry"), v.block); }
  if (v.wait) await wait(v.wait);
  if (v.pos) {
    await p.evaluate((v) => {
      const I = street.interiors;
      if (v.floor !== undefined && I.floor !== v.floor) I.goTo(v.floor);
      const Vec = I.walk.camera.position.constructor;
      I.walk.place(new Vec(v.pos[0], v.pos[1], v.pos[2]), v.yaw, v.pos[1]);
      if (v.pitch !== undefined) I.walk.pitch = v.pitch;
    }, v);
    await wait(400);
  }
  if (v.pick) console.log(v.shot, JSON.stringify(await p.evaluate(() => { const I = street.interiors; return [I.pickAt(720, 430), I.hoverAt(720, 430)]; })));
  if (v.shot) await p.screenshot({ path: `shots/factory-in-${v.shot}.png` });
}
const fps = await Promise.race([p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); })), wait(8000).then(() => "timeout")]);
const picks = await p.evaluate(() => { const I = street.interiors; const out = []; for (const [x, y] of [[720, 430], [400, 450], [1000, 450]]) { const i = I.pickAt(x, y); out.push(i ? i.eyebrow + " | " + i.title : null, I.hoverAt(x, y)); } return out; }).catch((e) => String(e));
console.log(JSON.stringify(picks));
console.log("fps", fps);
console.log(logs.slice(0, 20).join("\n"));
await b.close();
