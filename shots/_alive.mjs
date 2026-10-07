// node shots/_alive.mjs <tag> <theme> [port] [spots]  — overview, outer districts from the air, and on foot
// spots: "name:fly:x,z,zoom[,turns]" or "name:foot:x,z,yawDeg[,pitch]" separated by |
import puppeteer from "puppeteer-core";
const [tag = "a", theme = "day", port = "3018", spotArg] = process.argv.slice(2);
const OUT = process.env.OUT || "/private/tmp/claude-501/-Users-adam-Documents-GitHub-zcash/15136d67-1bf0-4825-8f11-79b9ee772fe2/scratchpad/alive";
const spots = (spotArg ??
  "ov:ov|west:fly:-175,-10,0.5|mid:fly:120,-170,0.55|bay:fly:0,180,0.45|south:fly:-100,110,0.55|uptown:fly:-20,-190,0.6|foot1:foot:-105,-38.1,90|foot2:foot:130.3,-80,0|foot3:foot:-20,-125.3,90"
).split("|");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1500, height: 900 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
p.on("console", (m) => { const t = m.text(); if (m.type() === "error" || t.includes("[alive]")) console.log(t.slice(0, 300)); });
await p.goto(`http://localhost:${port}/?debug&theme=${theme}`);
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 7000));
for (const s of spots) {
  const [name, kind, rest] = s.split(":");
  const a = (rest ?? "").split(",").map(Number);
  if (kind === "ov") {
    await p.evaluate(() => { street.walk(false); street.rig.setMode("overview"); });
  } else if (kind === "fly") {
    await p.evaluate(([x, z, zoom, turns]) => { street.walk(false); street.rig.setMode("free"); street.rig.flyTo(new street.rig.focus.constructor(x, 1, z), zoom); if (turns) street.rig.turnBy(turns * Math.PI / 4); }, a);
  } else {
    await p.evaluate(([x, z, yaw, pitch]) => { street.walk(true); const V = street.rig.focus.constructor; street.onFoot.place(new V(x, 0.2, z), (yaw * Math.PI) / 180); if (pitch) street.onFoot.pitch = pitch; }, a);
  }
  await new Promise((r) => setTimeout(r, 3500));
  await p.screenshot({ path: `${OUT}/${tag}-${name}-${theme}.png` });
}
await b.close();
