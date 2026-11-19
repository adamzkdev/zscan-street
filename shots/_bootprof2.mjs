// node shots/_bootprof2.mjs OUT.cpuprofile URL PROFILE_DIR: a first visit to fill the city cache, then a CPU
// profile of the main thread on the repeat visit, from navigation to the city up (+2 s)
import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
const [OUT, URL, DIR] = process.argv.slice(2);
for (let i = 0; i < 2; i++) {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: DIR, protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
  const p = await b.newPage();
  const cdp = await p.createCDPSession();
  if (i) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
    await cdp.send("Profiler.start");
  }
  const t0 = Date.now();
  await p.goto(URL);
  await p.waitForFunction(() => window.__streetUp, { timeout: 240000, polling: 100 });
  console.log(i ? "repeat" : "first", "up", (Date.now() - t0) / 1000);
  await new Promise((r) => setTimeout(r, i ? 2000 : 8000));
  if (i) writeFileSync(OUT, JSON.stringify((await cdp.send("Profiler.stop")).profile));
  await b.close();
}
