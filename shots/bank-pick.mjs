import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug&theme=night&interior=bank");
for (;;) { try { if (await p.evaluate(() => !!window.street?.interiors?.active)) break; } catch {} await wait(1000); }
await wait(5000);
const r = await p.evaluate(async () => {
  const I = street.interiors;
  const out = {};
  const V = I.walk.camera.position.constructor;
  const at = async (f, x, y, z, yaw, pitch) => { I.goTo(f); I.walk.place(new V(x, y, z), yaw, y); I.walk.pitch = pitch; await new Promise((r) => setTimeout(r, 400)); return [I.pickAt(innerWidth / 2, innerHeight / 2)?.title ?? null, I.hoverAt(innerWidth / 2, innerHeight / 2)]; };
  out.pile = await at(1, -2.5, -6, -13.5, Math.PI / 2, -0.32);
  out.sign = await at(1, -2.5, -6, -13.5, Math.PI / 2, 0.25);
  out.term = await at(0, 4.6, 0, -13, Math.PI / 2, -0.3);
  out.board = await at(0, -8, 0, -14, Math.PI / 2, 0.25);
  out.supply = await at(0, 8, 0, -14, -Math.PI / 2, 0.25);
  out.notice = await at(0, -11, 0, -1.5, 0, 0.3);
  out.teller = await at(0, -9, 0, -26.5, 0, 0);
  return out;
});
console.log(JSON.stringify(r, null, 1), errs.slice(0, 10));
await b.close();
