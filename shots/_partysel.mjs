// The mini-game hall (select.ts) over the hub: node shots/_partysel.mjs <outdir> [w h]
import puppeteer from "puppeteer-core";
const out = process.argv[2] ?? "shots";
const w = Number(process.argv[3] ?? 1440), h = Number(process.argv[4] ?? 900);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: w, height: h } });
const p = await b.newPage();
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
p.on("console", (m) => m.type() === "error" && logs.push(m.text().slice(0, 200)));
await p.goto(`http://localhost:3007/party.html`);
await new Promise((r) => setTimeout(r, 4000));
await p.evaluate(() => document.querySelector('[data-a="minis"]')?.click());
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: `${out}/sel-${w}x${h}.png` });
console.log(logs.join("\n") || "no errors");
await b.close();
