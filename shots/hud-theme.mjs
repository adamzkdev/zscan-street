import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1200, height: 740 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() === "error" && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto("http://localhost:3007/?debug");
await new Promise((r) => setTimeout(r, 8000));
await p.screenshot({ path: "shots/hud-theme-0.png" });
await p.click('[data-theme="night"]');
await new Promise((r) => setTimeout(r, 1500));
// open the camera popover
const cam = await p.$('[data-act="cam"]') ?? await p.$(".rail [data-act]");
await p.evaluate(() => { const b=[...document.querySelectorAll("#ui button")].find(x=>/camera/i.test(x.getAttribute("aria-label")||x.title||"")); b?.click(); });
await new Promise((r) => setTimeout(r, 800));
await p.screenshot({ path: "shots/hud-theme-1.png" });
console.log(await p.evaluate(() => localStorage.getItem("street.theme")));
console.log(logs.join("\n"));
await b.close();
