// node shots/_bootcheck.mjs [url]: does the page open? console errors and the boot/halt screen state after N s (phone emulation unless DESKTOP=1)
import puppeteer from "puppeteer-core";
const url = process.argv[2] ?? "http://localhost:3008/?debug";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
if (!process.env.DESKTOP) await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
p.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 200)));
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto(url);
for (let i = 0; i < Number(process.env.SECS ?? 40) / 5; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  console.log(await p.evaluate(() => JSON.stringify({ up: !!window.__streetUp, street: !!window.street, boot: document.querySelector("#boot p")?.textContent ?? null, bar: document.querySelector("#boot i")?.style.width, halt: document.querySelector("#halt")?.innerText.replace(/\s+/g, " ") ?? null })));
}
if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
await b.close();
