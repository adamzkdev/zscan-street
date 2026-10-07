import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], userDataDir: "/private/tmp/claude-501/zst-profile" });
for (let k = 0; k < 2; k++) {
  const p = await b.newPage();
  p.on("console", (m) => { const t = m.text(); if (t.includes("built")) console.log(k ? "second visit:" : "first visit:", t); });
  p.on("pageerror", (e) => console.log("ERR", e.message));
  await p.goto("http://localhost:3008/?debug");
  await p.waitForFunction(() => window.street, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 4000));
  await p.close();
}
await b.close();
