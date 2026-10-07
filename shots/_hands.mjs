// node shots/_hands.mjs <out-name> "<query>" [width] [height]   e.g. "set=coffee,bag&night&walk&zoom=1"
import puppeteer from "puppeteer-core";
const [name = "hands", query = "", w = "1600", h = "1000"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: +w, height: +h } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
p.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
await p.goto(`http://localhost:3007/shots/hands.html?${query}`);
p.on("console", (m) => m.type() !== "error" && console.log("log:", m.text().slice(0, 200)));
await p.waitForFunction(() => window.handsReady, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 300));
await p.screenshot({ path: `shots/${name}.png` });
console.log(`shots/${name}.png`);
await b.close();
