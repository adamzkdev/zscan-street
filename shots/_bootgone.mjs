// node shots/_bootgone.mjs [url] [runs]: what a first-time visitor waits for: the city up (__streetUp) and
// the boot screen gone, each run in a fresh profile (empty cache). Production: vite build && vite preview --port 3021
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/", RUNS = "2"] = process.argv.slice(2);
for (let i = 0; i < +RUNS; i++) {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
  const p = await b.newPage();
  const lines = [];
  p.on("console", (m) => /built in|warmed|city up/.test(m.text()) && lines.push(m.text()));
  const t0 = Date.now();
  await p.goto(URL);
  await p.waitForFunction(() => window.__streetUp, { timeout: 240000, polling: 50 });
  const up = Date.now() - t0;
  await p.waitForFunction(() => document.getElementById("boot")?.dataset.gone || !document.getElementById("boot"), { timeout: 240000, polling: 50 });
  const gone = Date.now() - t0;
  console.log(`run ${i + 1}: city up ${(up / 1000).toFixed(1)}s, boot screen gone ${(gone / 1000).toFixed(1)}s  (${lines.join(" | ")})`);
  await b.close();
}
