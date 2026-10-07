// node shots/_rides.mjs <port> <day|night> <flyer|blimp> "name:waitMs,yaw,pitch|..."  → shots/ride-<kind>-<name>-<theme>.png
import puppeteer from "puppeteer-core";
const [port = 3007, theme = "day", kind = "flyer", views = "a:3000,0,-0.1"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
p.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load") && console.log("[error]", m.text().slice(0, 200)));
await p.goto(`http://localhost:${port}/?debug&theme=${theme}`, { timeout: 0, waitUntil: "domcontentloaded" });
await p.waitForFunction(() => window.street && window.street.sky, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 6000));
await p.evaluate((k) => (k === "blimp" ? street.rideBlimp() : street.rideFlyer()), kind);
for (const v of views.split("|")) {
  const [name, rest] = v.split(":");
  const [wait, yaw, pitch] = rest.split(",").map(Number);
  await new Promise((r) => setTimeout(r, wait));
  await p.evaluate((yaw, pitch) => { street.sky.look.yaw = yaw; street.sky.look.pitch = pitch; }, yaw, pitch);
  await new Promise((r) => setTimeout(r, 300));
  const f = `shots/ride-${kind}-${name}-${theme}.png`;
  await p.screenshot({ path: f });
  console.log(f, await p.evaluate(() => JSON.stringify({ riding: street.sky.riding, kind: street.sky.ride })));
}
const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
console.log("fps", fps);
await b.close();
