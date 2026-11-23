// ZK PARTY hub shots: node shots/_partyhub.mjs <outdir> [w h] [extra query]
import puppeteer from "puppeteer-core";
const out = process.argv[2] ?? "shots";
const w = Number(process.argv[3] ?? 1440);
const h = Number(process.argv[4] ?? 900);
const q = process.argv[5] ?? "";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: w, height: h, deviceScaleFactor: 1 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() === "error" && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/party.html${q}`);
await new Promise((r) => setTimeout(r, 5000));
await p.screenshot({ path: `${out}/hub-${w}x${h}.png` });
await p.evaluate(() => document.querySelector(".pt-hub")?.scrollTo(0, 99999));
await new Promise((r) => setTimeout(r, 600));
await p.screenshot({ path: `${out}/hub-${w}x${h}-bottom.png` });
console.log(logs.join("\n") || "no errors");
await b.close();
