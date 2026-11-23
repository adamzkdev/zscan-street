// The arcade games' thumbnails (public/party/thumbs/<key>.jpg, 640×360): node shots/_arcthumbs.mjs <tmpdir> [keys]
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
const tmp = process.argv[2];
const keys = (process.argv[3] ?? "zkmerge,zkjump,zkwho").split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1280, height: 790 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const key of keys) {
  const p = await b.newPage();
  await p.evaluateOnNewDocument(() => {
    window.WebSocket = class {
      constructor() {}
      send() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
    };
  });
// (Vite's reload socket stubbed: an edit elsewhere must not reload the page mid-game)
await p.evaluateOnNewDocument(() => {
  window.WebSocket = class {
    constructor() {}
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  };
});
  await p.evaluateOnNewDocument(() => localStorage.setItem("zp-merge-seen", "11"));
  await p.goto(`http://localhost:3007/partylab.html?arcade=${key}`);
  await sleep(2500);
  if (key === "zkmerge") {
    const box = await p.evaluate(() => { const r = document.querySelector(".mg-cv").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
    const xs = [0.2, 0.8, 0.5, 0.3, 0.7, 0.45, 0.6, 0.25, 0.75, 0.5, 0.35, 0.65, 0.15, 0.85, 0.5, 0.4, 0.55, 0.3, 0.7, 0.5, 0.2, 0.8, 0.45, 0.6, 0.35, 0.65, 0.5, 0.25, 0.75, 0.5];
    for (const f of xs) {
      await p.mouse.move(box.x + box.w * f, box.y + 30);
      await p.mouse.down(); await p.mouse.up();
      await sleep(650);
      if (await p.evaluate(() => document.querySelector(".ar-end")?.hidden === false)) break;
    }
    await sleep(1200);
  } else if (key === "zkjump") {
    await p.keyboard.press("Space");
    for (let i = 0; i < 4; i++) { await p.keyboard.press("Space"); await sleep(600); }
    await sleep(150);
  } else if (key === "zkwho") {
    await p.waitForSelector(".wh-card", { timeout: 30000 });
    await sleep(3000);
    await p.evaluate(() => { document.querySelectorAll("[data-kind]")[1].click(); });
    await sleep(200);
    await p.evaluate(() => document.querySelector("[data-q]")?.click());
    await sleep(3500);
  }
  await p.evaluate(() => { const e = document.querySelector(".ar-end"); if (e) e.hidden = true; });
  const raw = `${tmp}/${key}-raw.png`;
  // (each game's own framing: the jar's pile, the bird among the blocks, the table's cards)
  const clip = await p.evaluate((key) => {
    const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
    if (key === "zkmerge") {
      const j = r(".mg-cv");
      const w = j.width + 90, h = (w * 9) / 16;
      return { x: j.x - 45, y: j.y + j.height - h + 6, width: w, height: h };
    }
    if (key === "zkwho") {
      const b = r(".wh-board");
      const w = b.width, h = (w * 9) / 16;
      return { x: b.x, y: b.y, width: w, height: h };
    }
    return { x: 160, y: 130, width: 960, height: 540 };
  }, key);
  await p.screenshot({ path: raw, clip });
  execFileSync("sips", ["-z", "360", "640", raw, "--setProperty", "format", "jpeg", "--setProperty", "formatOptions", "82", "--out", `public/party/thumbs/${key}.jpg`]);
  console.log("thumb", key);
  await p.close();
}
await b.close();
