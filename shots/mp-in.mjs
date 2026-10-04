import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() === "error" && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/?debug&theme=night&interior=mempool`);
await new Promise((r) => setTimeout(r, 14000));
const views = [["a", 0, -1.4, 0, 0], ["h", -0.6, -3.6, 0, 0.35]];
for (const [k, x, z, f, yaw] of views) {
  await p.evaluate((x, z, f, yaw) => { const I = street.interiors; if (I.floor !== f) I.goTo(f); const V = I.walk.camera.position.constructor; I.walk.place(new V(x, f ? 6 : 0, z), yaw, f ? 6 : 0); }, x, z, f, yaw);
  await new Promise((r) => setTimeout(r, 900));
  await p.screenshot({ path: `shots/mp-in-${k}.png` });
}
console.log(logs.join("\n"));
await b.close();
