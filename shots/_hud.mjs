// Inbox button + bubbles: node shots/_hud.mjs [day|night] [w] [h]
import puppeteer from "puppeteer-core";
const theme = process.argv[2] ?? "night";
const w = Number(process.argv[3] ?? 1400), h = Number(process.argv[4] ?? 860);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: w, height: h } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto(`http://localhost:3007/?debug&theme=${theme}`);
await new Promise((r) => setTimeout(r, 22000));
await p.screenshot({ path: `shots/hud-${theme}-${w}.png` });
await p.click(".mailbtn");
await new Promise((r) => setTimeout(r, 1200));
await p.screenshot({ path: `shots/hud-${theme}-${w}-inbox.png` });
await b.close();
