// node shots/_memes.mjs [--port 3038] : the meme posters in the street (scene/memes.ts, memewalls.ts): counts,
// then a picture on foot in front of one of each kind (THEME=day|night). Pictures: $OUT/memes-<kind>-<theme>.jpg
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3038";
const OUT = process.env.OUT ?? "/tmp";
const THEME = process.env.THEME ?? "night";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1200, height: 740 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=${THEME}`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await wait(6000);
// every poster: where, which way it faces, what kind (from its place in the scene)
const spots = await p.evaluate(() => {
  const scene = street.metro.group.parent;
  const out = [];
  const V = scene.position.constructor;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const isMeme = o.userData.meme !== undefined;
    if (!isMeme && o.name !== "standee") return;
    const pos = o.getWorldPosition(new V());
    const n = new V(0, 0, 1).transformDirection(o.matrixWorld);
    let kind = "wall";
    for (let q = o.parent; q; q = q.parent) if (q.name === "kiosk" || q.name === "standee") kind = q.name;
    if (o.name === "standee") kind = "standee";
    if (isMeme && kind === "wall") {
      if (Math.abs(pos.x + 86) < 7.5 && pos.z > -40 && pos.z < 32) kind = "shotengai";
      else if (pos.y > 6) kind = "station";
      else if (o.userData.glow) kind = "shelter";
      else if (Math.abs(pos.z - 11.44) < 0.3 && pos.x > 136 && pos.x < 147) kind = "hoarding";
      else if (o.parent?.parent === street.metro.group) kind = "pillar";
    }
    out.push({ kind, x: pos.x, y: pos.y, z: pos.z, nx: n.x, nz: n.z });
  });
  return out;
});
const by = {};
for (const s of spots) (by[s.kind] ??= []).push(s);
console.log("posters", JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length]))), JSON.stringify(await p.evaluate(() => street.memes())));
await p.evaluate(() => street.walk(true));
await wait(1500);
const pick = { shotengai: 3, wall: 2, shelter: 0, kiosk: 0, station: 1, pillar: 4, hoarding: 2, standee: 0 };
for (const [kind, i] of Object.entries(pick)) {
  const s = by[kind]?.[Math.min(i, by[kind].length - 1)];
  if (!s) {
    console.log(kind, "none");
    continue;
  }
  const d = kind === "station" ? 4 : kind === "standee" || kind === "kiosk" ? 4.5 : 3.2;
  const cx = s.x + s.nx * d,
    cz = s.z + s.nz * d;
  await p.evaluate(
    ([x, y, z, yaw]) => {
      const W = street.onFoot;
      const V = W.camera.position.constructor;
      W.place(new V(x, y, z), yaw);
    },
    [cx, kind === "station" ? s.y - 1.95 : 0.2, cz, Math.atan2(s.nx, s.nz)],
  );
  await wait(2500);
  await p.screenshot({ path: `${OUT}/memes-${kind}-${THEME}.jpg`, type: "jpeg", quality: 78 });
  console.log(kind, s.x.toFixed(1), s.y.toFixed(1), s.z.toFixed(1), JSON.stringify(await p.evaluate(() => street.memes())));
}
// a click on the poster in the middle of the screen
await p.mouse.move(600, 300);
await p.mouse.click(600, 330);
await wait(500);
console.log("panel", await p.evaluate(() => document.querySelector(".panel.open")?.textContent?.replace(/\s+/g, " ").slice(0, 200) ?? "none"));
console.log("errors", errs.slice(0, 5).join(" | ") || "none");
await b.close();
