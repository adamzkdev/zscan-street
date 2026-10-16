// NU7 night banner: node shots/_nu7night.mjs <nu7 height> <tag>
import puppeteer from "puppeteer-core";
const [hgt, tag] = [process.argv[2], process.argv[3] ?? "x"];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto(`http://localhost:3007/?debug&theme=night&nu7=${hgt}`);
await new Promise((r) => setTimeout(r, 24000));
await p.screenshot({ path: `shots/nu7night-${tag}.png` });
console.log(await p.$eval(".nu7night", (e) => e.className + " | " + e.textContent));
await b.close();
