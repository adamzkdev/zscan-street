import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 800, height: 450 } });
const p = await b.newPage();
await p.goto("http://localhost:3007/?debug&capture");
await p.waitForFunction(() => window.capture && document.getElementById("boot") === null, { timeout: 60000 });
const st = () => p.evaluate(() => JSON.stringify({ st: street.states(), bus: window.capture.bus() && { ph: window.capture.bus().phase, x: window.capture.bus().x.toFixed(1) } }));
for (let i = 0; i < 3; i++) await p.evaluate(() => window.capture.carrier());
for (let i = 0; i < 12; i++) { await p.evaluate(() => { for (let k = 0; k < 150; k++) window.capture.step(1 / 30); }); console.log(i * 5, await st()); }
await p.evaluate(() => window.capture.testBlock());
for (let i = 0; i < 16; i++) { await p.evaluate(() => { for (let k = 0; k < 30; k++) window.capture.step(1 / 30); }); console.log("b", i, await st()); }
await b.close();
