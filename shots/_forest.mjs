// node shots/_forest.mjs <port> <theme> "name:fly:x,z,zoom,turns|name:foot:x,z,yaw,pitch|name:ov" — forest views
import puppeteer from "puppeteer-core";
const [port = "3007", theme = "day", viewsArg = "ov:ov"] = process.argv.slice(2);
const OUT = process.env.OUT || "/private/tmp/claude-501/forest";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
p.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && console.log("[error]", m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=${theme}`);
await p.waitForFunction(() => window.street, { timeout: 180000 });
await wait(6000);
if (process.env.EVAL) console.log(await p.evaluate(process.env.EVAL));
const fps = () => p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
for (const v of viewsArg.split("|")) {
  const [name, kind, rest = ""] = v.split(":");
  const a = rest.split(",").map(Number);
  if (kind === "ov") await p.evaluate(() => { street.walk(false); street.rig.setMode("overview"); });
  else if (kind === "fly") await p.evaluate(([x, z, zoom, turns]) => { street.walk(false); street.rig.setMode("free"); street.rig.flyTo(new street.rig.focus.constructor(x, 1, z), zoom); if (turns) street.rig.turnBy((turns * Math.PI) / 4); }, a);
  else if (kind === "foot")
    await p.evaluate(([x, z, yaw, pitch]) => {
      street.walk(true);
      const V = street.onFoot.camera.position.constructor;
      const y = street.onFoot.ground?.(x, z) ?? 0.2;
      street.onFoot.place(new V(x, y, z), yaw, y);
      street.onFoot.pitch = pitch || 0;
    }, a);
  await wait(kind === "foot" ? 2500 : 4000);
  await p.screenshot({ path: `${OUT}/${name}-${theme}.png` });
  console.log(`${OUT}/${name}-${theme}.png fps`, await fps());
}
await b.close();
