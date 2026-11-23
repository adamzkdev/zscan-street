// The GAMEPARTY games' thumbnails (public/party/thumbs/<key>.jpg, 640×360), shot in play with no HUD:
// node shots/_gpthumbs.mjs <tmpdir> <key,key,…> [seconds into play, default 5]
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
const tmp = process.argv[2];
const keys = process.argv[3].split(",");
const into = Number(process.argv[4] ?? 5);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
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
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`http://localhost:3007/partylab.html?g=${key}&auto&nohud&cine=0&seed=5`);
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < 60000) {
    const ph = await p.evaluate(() => window.labPhase ?? null).catch(() => null);
    if (ph && ph.phase === "play" && ph.pt >= into) { ok = true; break; }
    await sleep(150);
  }
  const raw = `${tmp}/${key}-raw.png`;
  await p.screenshot({ path: raw });
  execFileSync("sips", ["-z", "360", "640", raw, "--setProperty", "format", "jpeg", "--setProperty", "formatOptions", "82", "--out", `public/party/thumbs/${key}.jpg`], { stdio: "ignore" });
  console.log(key, ok ? "ok" : "late", errs.length ? errs[0] : "");
  await p.close();
}
await b.close();
