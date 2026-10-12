// node shots/_herald.mjs — checks a wallet tower's herald (dev server on $PORT): inside the ZLAB TOWER,
// the pulse answers once with a made-up commit (request interception, nothing in the app), and the
// herald of the floor should walk up and say it, and a letter land in the inbox. Writes $OUT/herald-*.png.
import puppeteer from "puppeteer-core";
const PORT = process.env.PORT ?? 3007;
const OUT = process.env.OUT ?? "shots";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
// only the pulse is answered here (a fetch wrapper: every other request goes out as usual)
await p.evaluateOnNewDocument(() => {
  const real = window.fetch.bind(window);
  let asks = 0;
  window.fetch = (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes("/v1/street/wallets/pulse")) return real(input, init);
    asks++;
    window.__pulseAsks = asks;
    const since = new URL(url).searchParams.get("since");
    const items = since && asks === 2 ? [{ id: 1001, wallet: "zlab", kind: "commit", repo: "ZLabcash/zfirm", actor: "adamzkdev", avatar: null, title: "Herald test: the pulse reached the tower", url: "https://github.com/ZLabcash/zfirm", at: new Date().toISOString() }] : [];
    return Promise.resolve(new Response(JSON.stringify({ last: since ? 1001 : 1000, items }), { status: 200, headers: { "content-type": "application/json" } }));
  };
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${PORT}/?debug&theme=night&interior=zlab`);
for (let k = 0; k < 240 && !(await p.evaluate(() => !!window.street?.interiors?.active).catch(() => false)); k++) await wait(1000);
await p.evaluate(() => {
  const I = street.interiors;
  I.goTo(3);
  const y = I.active.floors[I.floor].y;
  I.walk.place(new I.walk.camera.position.constructor(-3, y, -6), Math.PI / 2, y);
  I.walk.pitch = 0.05;
});
// the first ask learns where the pulse stands, the next (20 s on) brings the commit
await wait(27000);
await p.screenshot({ path: `${OUT}/herald-say.png` });
const mail = await p.evaluate(() => document.querySelector(".gmail, [class*=inbox], [class*=mail]")?.outerHTML?.slice(0, 200) ?? "");
const asks = await p.evaluate(() => window.__pulseAsks);
console.log(`${OUT}/herald-say.png`, "asks", asks, mail ? "inbox ok" : "");
await b.close();
