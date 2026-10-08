// Builders' Row shots: node shots/_build.mjs
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load") && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/?debug&theme=day`);
await p.waitForFunction(() => window.street?.game?.plots, { timeout: 120000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(8000);
// look at Builders' Row (west block)
await p.evaluate(() => { const v = street.director.scene.position.clone(); v.set(-70, 1, 17); street.rig.district(v, 1.4); });
await sleep(2500);
await p.screenshot({ path: `shots/build-0-row.png` });
// open the workshop with a template
const done = p.evaluate(() => street.game.editor.edit("Test Shop", null));
await sleep(1500);
await p.evaluate(() => document.querySelector('.editor [data-tpl="shop"]').click());
await sleep(800);
await p.screenshot({ path: `shots/build-1-editor.png` });
await p.evaluate(() => document.querySelector('.editor [data-tpl="tower"]').click());
await sleep(800);
await p.screenshot({ path: `shots/build-2-tower.png` });
await p.evaluate(() => document.querySelector('.editor [data-a="cancel"]').click());
await done;
console.log(logs.join("\n") || "no errors");
await b.close();
