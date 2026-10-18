import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug&theme=night&parade=now");
await p.waitForFunction(() => window.street?.parade?.eta != null, { timeout: 180000 });
await p.waitForFunction(() => window.street.parade.eta < -40, { timeout: 180000 });
const stats = await p.evaluate(async () => {
  const P = window.street.parade;
  let seen = 0;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    seen += P.flashes.filter((f) => f.m.visible).length;
  }
  return { crowd: P.crowd.length, phones: P.flashes.length, flashesSeenIn3s: seen, escort: P.escort.length, guards: P.guards.length };
});
console.log(stats);
// a wide look along the barriers by the star
await p.evaluate(() => {
  const s = window.street;
  const x = s.parade.starSnark.root.position.x;
  const V = s.rig.focus.constructor;
  s.rig.follow(s.parade.starSnark);
});
await wait(3000);
await p.screenshot({ path: "shots/parade-flash.png" });
await b.close();
