// node shots/_timings.mjs [url]: the city workers' own timings (?timings) and the boot's logs, fresh profile
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/?timings&debug"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
const t0 = Date.now();
p.on("console", (m) => /workers|built in|warmed|city up|\[t\]/.test(m.text()) && console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`, m.text().slice(0, 900)));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp, { timeout: 240000, polling: 50 });
console.log("up", (Date.now() - t0) / 1000);
await b.close();
