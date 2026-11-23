// node shots/_legendsaudio.mjs: every ZK LEGENDS audio file fetches (no 404) and decodes in Chrome; prints durations
import puppeteer from "puppeteer-core";
import { readdirSync } from "node:fs";
const ORIGIN = process.argv[2] || "http://localhost:3071";
const files = ["music", "sfx"].flatMap((d) => readdirSync(`public/audio/legends/${d}`).filter((f) => f.endsWith(".m4a")).map((f) => `/audio/legends/${d}/${f}`));
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage();
await p.goto(`${ORIGIN}/tablelab.html`);
const res = await p.evaluate(async (list) => {
  const ac = new OfflineAudioContext(2, 44100, 44100);
  const out = [];
  for (const f of list) {
    try {
      const r = await fetch(f);
      if (!r.ok) { out.push([f, `HTTP ${r.status}`]); continue; }
      const type = r.headers.get("content-type") || "";
      const buf = await ac.decodeAudioData(await r.arrayBuffer());
      out.push([f, `${buf.duration.toFixed(2)} s ${buf.numberOfChannels}ch ${type}`]);
    } catch (e) { out.push([f, "FAIL " + e]); }
  }
  return out;
}, files);
let bad = 0;
for (const [f, s] of res) { if (/FAIL|HTTP/.test(s)) bad++; if (f.includes("/music/") || /FAIL|HTTP/.test(s)) console.log(f, s); }
console.log(`${res.length} files, ${bad} failed (sfx durations: ${res.filter(([f]) => f.includes("/sfx/")).map(([, s]) => s.split(" ")[0]).join(" ")})`);
await b.close();
process.exit(bad ? 1 : 0);
