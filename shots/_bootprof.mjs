// node shots/_bootprof.mjs OUT.cpuprofile [url]: a CPU profile of the main thread from navigation to the city up (+2 s)
import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
const [OUT, URL = "http://localhost:3021/?debug"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
const cdp = await p.createCDPSession();
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
await cdp.send("Profiler.start");
const t0 = Date.now();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp, { timeout: 240000, polling: 100 });
console.log("up", (Date.now() - t0) / 1000);
await new Promise((r) => setTimeout(r, 2000));
const { profile } = await cdp.send("Profiler.stop");
writeFileSync(OUT, JSON.stringify(profile));
await b.close();
