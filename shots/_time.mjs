import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
p.on("console", (m) => { const t = m.text(); if (t.includes("built") || t.includes("workers")) console.log(t); });
await p.goto("http://localhost:3007/?debug&timings");
await p.waitForFunction(() => window.street, { timeout: 120000 });
await b.close();
