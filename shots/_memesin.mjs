// node shots/_memesin.mjs [--port 3038] : the meme posters inside the places (mall lift lobbies, museum shop,
// factory break corner, MEMPOOL HQ, ZK tower game hall): a picture in front of one per place, a click on it.
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
await wait(5000);
for (const [key, floor, which = 0] of [["mall", 1, 0], ["mall", 4, 1], ["museum", 0, 0], ["factory", 0, 0], ["mempool", 0, 0], ["tower", 2, 0]]) {
  await p.evaluate((k) => street.enter(k), key);
  await wait(2500);
  await p.evaluate((f) => street.interiors.goTo(f), floor);
  await wait(1500);
  const r = await p.evaluate((which) => {
    const I = street.interiors, W = I.walk, S = I.active.scene;
    const V = W.camera.position.constructor;
    S.updateMatrixWorld(true);
    const list = [];
    S.traverse((o) => {
      if (o.userData.meme === undefined) return;
      for (let q = o.parent; q; q = q.parent) if (!q.visible) return;
      list.push(o);
    });
    const fy = I.active.floors[I.floor].y;
    list.sort((a, b) => Math.abs(a.getWorldPosition(new V()).y - fy) - Math.abs(b.getWorldPosition(new V()).y - fy));
    const o = list[Math.min(which, list.length - 1)];
    if (!o) return { n: 0 };
    const pos = o.getWorldPosition(new V());
    const n = new V(0, 0, 1).transformDirection(o.matrixWorld);
    W.place(new V(pos.x + n.x * 2.4, fy, pos.z + n.z * 2.4), Math.atan2(n.x, n.z), fy);
    W.pitch = Math.atan2(pos.y - fy - 1.6, 2.4) * 0.8;
    return { n: list.length, at: [pos.x.toFixed(1), pos.y.toFixed(1), pos.z.toFixed(1)] };
  }, which);
  await wait(2000);
  await p.screenshot({ path: `${OUT}/memesin-${key}${floor}-${THEME}.jpg`, type: "jpeg", quality: 78 });
  const info = await p.evaluate(() => street.interiors.pickAt(600, 370)?.title ?? null);
  console.log(key, floor, JSON.stringify(r), "click:", info, JSON.stringify(await p.evaluate(() => street.memes())));
  await p.evaluate(() => street.interiors.exit());
  await wait(1200);
}
console.log("errors", errs.slice(0, 5).join(" | ") || "none");
await b.close();
