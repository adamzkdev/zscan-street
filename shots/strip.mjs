import puppeteer from "puppeteer-core";
const theme = process.argv[2] ?? "night";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() === "error" && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/?theme=${theme}`);
await new Promise((r) => setTimeout(r, 9000));
await p.screenshot({ path: `shots/strip-${theme}-0.png` });
for (const s of ["block", "mempool", "market", "supply", "network"]) {
  await p.click(`.rd[data-sec="${s}"]`);
  await new Promise((r) => setTimeout(r, 1500));
  const el = await p.$(".strip");
  await el.screenshot({ path: `shots/strip-${theme}-${s}.png` });
}
console.log(logs.join("\n"));
await b.close();
