// An arcade game in the bench: node shots/_arcade.mjs <key> <outdir> [w h] [script]
// script: "merge" drops at random spots; "jump" flaps to stay mid-air.
import puppeteer from "puppeteer-core";
const key = process.argv[2], out = process.argv[3];
const w = Number(process.argv[4] ?? 1280), h = Number(process.argv[5] ?? 800);
const mode = process.argv[6] ?? "";
const mobile = w < 600;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: w, height: h, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile } });
const p = await b.newPage();
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
p.on("console", (m) => m.type() === "error" && logs.push(m.text().slice(0, 200)));
await p.goto(`http://localhost:3007/partylab.html?arcade=${key}`);
await new Promise((r) => setTimeout(r, 2500));
await p.screenshot({ path: `${out}/${key}-${w}-0.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (mode === "merge") {
  const box = await p.evaluate(() => { const r = document.querySelector(".mg-cv").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  for (let i = 0; i < 40; i++) {
    const x = box.x + box.w * (0.15 + 0.7 * ((i * 0.37) % 1));
    await p.mouse.move(x, box.y + 30);
    await p.mouse.down(); await p.mouse.up();
    await sleep(520);
    if (i === 20) await p.screenshot({ path: `${out}/${key}-${w}-1.png` });
  }
  await sleep(1500);
} else if (mode === "jump") {
  await p.keyboard.press("Space");
  for (let i = 0; i < 40; i++) {
    const y = await p.evaluate(() => 0);
    await p.keyboard.press("Space");
    await sleep(600);
    if (i === 5) await p.screenshot({ path: `${out}/${key}-${w}-1.png` });
  }
  await sleep(2500);
}
await p.screenshot({ path: `${out}/${key}-${w}-2.png` });
console.log(logs.join("\n") || "no errors");
await b.close();
