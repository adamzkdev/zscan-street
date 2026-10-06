import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto("http://localhost:3007/?debug&capture&theme=night");
await p.waitForFunction(() => window.capture && window.street, { timeout: 120000 });
const step = async (sec) => { const end = Date.now() + sec * 1000; while (Date.now() < end) { await p.evaluate(() => capture.step(1 / 30)); await new Promise((r) => setTimeout(r, 15)); } };
await step(12);
// the prison from above
await p.evaluate(() => { capture.shot({ pos: [-118, 45, -70], look: [-148, 0, -114], fov: 55 }); capture.step(1 / 30); });
await p.screenshot({ path: "shots/jail-0.png" });
await p.evaluate(() => { capture.shot({ pos: [-160, 4, -112], look: [-160, 2.2, -128], fov: 60 }); capture.step(1 / 30); });
await step(3);
await p.screenshot({ path: "shots/jail-1.png" });
// an arrest on the avenue
await p.evaluate(() => { capture.shot(null); street.walk(true); street.onFoot.place(new street.onFoot.camera.position.constructor(10, 0.2, 5), -Math.PI / 2); void street.arrest(); });
await step(4.5);
await p.evaluate(() => { capture.ui(true); capture.shot({ pos: [6, 3, 11], look: [14, 1.2, 5], fov: 55 }); capture.step(1 / 30); });
await p.screenshot({ path: "shots/jail-2.png" });
await p.evaluate(() => capture.shot(null));
await step(6);
await p.screenshot({ path: "shots/jail-3.png" });
console.log("in prison?", await p.evaluate(() => { const q = street.onFoot.camera.position; return `${q.x.toFixed(1)},${q.z.toFixed(1)}`; }));
await b.close();
