// node shots/_gtaduel.mjs: in the GTA mode, challenge a passer-by (G): the Game House launcher opens on ZK LEGENDS with them as the rival
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto("http://localhost:3071/?debug&gta=1337&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street && window.street.gta && window.street.gta.active, { timeout: 240000, polling: 500 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(5000);
// stand by the nearest passer-by and look at the prompt
const ped = await p.evaluate(() => { const g = street.gta; return g.talkable ? g.talkable.id : null; });
console.log("talkable now:", ped);
// the host hook itself, with a known zkSNARK
await p.evaluate(() => street.gta.host.duel(4242));
await sleep(2500);
await p.screenshot({ path: "shots/legends/gta-duel.png" });
console.log("launcher:", await p.evaluate(() => { const r = document.querySelector(".tl-root.on"); return r ? r.textContent.replace(/\s+/g, " ").slice(0, 200) : "none"; }));
console.log("errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
