// node shots/_cem.mjs [day|night] [views: map,gate,alley,crypt,top] [--port 3036]
// The ZK Cemetery: map view zoomed on it, on foot at the gate, in the alley, at the crypt; zombie count, fps.
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3036";
const theme = args[0] && !args[0].startsWith("--") ? args[0] : "night";
const views = (args[1] && !args[1].startsWith("--") ? args[1] : "map,gate,alley,crypt").split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && errs.push(m.text()));
await p.goto(`http://localhost:${port}/?debug&theme=${theme}`);
await p.waitForFunction(() => window.street, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 5000));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fps = () => p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
const X = 159.5;
const Zf = -223 + 152 / 6;
for (const v of views) {
  if (v === "map" || v === "top") {
    await p.evaluate(() => street.walk(false));
    await p.evaluate(([x, z, zoom]) => street.rig.district(new street.rig.focus.constructor(x, 1, z), zoom), [X, -210, v === "top" ? 0.45 : 0.9]);
    await wait(v === "map" ? 22000 : 6000);
    if (v === "map") await p.evaluate(() => street.rig.turnBy?.(Math.PI));
    await wait(2500);
  } else {
    let at = { gate: [X + 1.2, Zf + 9, 0.08], alley: [X + 0.8, -223 + 103 / 6, Math.PI / 2 + 0.25], crypt: [129 + 63 / 6 + 4, -223 + 90 / 6, 0.6], hill: [X - 9, -223 + 126 / 6, -Math.PI / 2 - 0.5], enter: [129 + 63.5 / 6, -223 + 76 / 6, 0] }[v];
    if (v.startsWith("stone")) {
      const st = await p.evaluate(() => street.cemetery.stones().filter((s) => s.row === 129));
      const s = st[Number(v.slice(5) || 0) % st.length];
      at = [s.x + 0.2, s.z + 1.3, 0.1];
      console.log("stone", s.text);
    }
    if (!at) continue;
    await p.evaluate(() => street.rig.district(new street.rig.focus.constructor(159.5, 1, -210), 1.6));
    await wait(1500);
    await p.evaluate(() => street.walk(true));
    await p.evaluate(([x, z, yaw]) => street.onFoot.place(new street.rig.focus.constructor(x, street.cemetery.groundAt(x, z) ?? 0.2, z), yaw), at);
    if (v.startsWith("stone")) await p.evaluate(() => (street.onFoot.pitch = -0.32));
    await wait(14000);
  }
  if (v === "enter") {
    await p.mouse.click(700, 400);
    await p.keyboard.down("w");
    await wait(2500);
    await p.keyboard.up("w");
    await wait(2500);
    console.log("walked in:", await p.evaluate(() => street.interiors.active?.key ?? null));
  }
  const info = await p.evaluate(() => ({ out: street.cemetery.count, lids: street.cemetery.lids?.map((l) => +l.open.toFixed(2)) }));
  const f = await fps();
  const file = `shots/cem-${theme}-${v}.png`;
  await p.screenshot({ path: file });
  console.log(file, "fps", f, JSON.stringify(info));
}
console.log("errors:", errs.slice(0, 6).join(" | ") || "none");
await b.close();
