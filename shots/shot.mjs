import puppeteer from "puppeteer-core";
const [, , url = "http://localhost:3007/?debug", out = "shots/a.png", wait = "9000", actions = ""] = process.argv;
const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
});
const p = await b.newPage();
const logs = [];
p.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(url, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, Number(wait)));
if (actions) await eval(`(async()=>{${actions}})()`);
await p.screenshot({ path: out });
console.log(logs.slice(0, 20).join("\n"));
await b.close();
