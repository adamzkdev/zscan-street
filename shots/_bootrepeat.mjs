// node shots/_bootrepeat.mjs [url] [profile dir]: a first visit then a repeat one in the same browser profile
// (the city cache in IndexedDB, the HTTP cache). The profile dir is emptied first.
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/", DIR = join(tmpdir(), "zstreet-bootrepeat")] = process.argv.slice(2);
rmSync(DIR, { recursive: true, force: true });
for (let i = 0; i < 2; i++) {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: DIR, protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
  const p = await b.newPage();
  const t0 = Date.now();
  await p.goto(URL);
  await p.waitForFunction(() => window.__streetUp, { timeout: 240000, polling: 50 });
  const up = Date.now() - t0;
  await p.waitForFunction(() => document.getElementById("boot")?.dataset.gone || !document.getElementById("boot"), { timeout: 240000, polling: 50 });
  console.log(`${i ? "repeat" : "first "} visit: city up ${(up / 1000).toFixed(1)}s, boot screen gone ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  // (long enough for the workers' cache writes to commit)
  await new Promise((r) => setTimeout(r, 8000));
  await b.close();
}
