// node shots/_legendslaunch.mjs: the Game House launcher on ZK LEGENDS (table.html), then into the duel
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => /error/.test(m.type()) && errs.push(m.text().slice(0, 300)));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto("http://localhost:3071/table.html?t=legends");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3000);
await p.screenshot({ path: "shots/legends/launch-1.png" });
await p.evaluate(() => document.querySelector('[data-a="play"]')?.click());
await sleep(3000);
await p.screenshot({ path: "shots/legends/launch-2.png" });
console.log("game up:", await p.evaluate(() => !!document.querySelector(".zkl-root")));
console.log("errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
