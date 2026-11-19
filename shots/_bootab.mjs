// node shots/_bootab.mjs RUNS DIR URL_A URL_B: two builds compared on the same machine, runs alternated
// (A, B, A, B…): a first visit (an empty profile) and a repeat visit (the same profile again: the HTTP
// cache, the city cache) for each, the city up (__streetUp) and the boot screen gone, the page's JS heap.
// DIR: where the profiles are kept (emptied first). Prints each run and the medians.
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
const [RUNS = "3", DIR = "captures/bootab", ...URLS] = process.argv.slice(2);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };
const visit = async (url, dir) => {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: dir, protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-precise-memory-info"], defaultViewport: { width: 1440, height: 900 } });
  const p = await b.newPage();
  const t0 = Date.now();
  await p.goto(url);
  await p.waitForFunction(() => window.__streetUp, { timeout: 240000, polling: 50 });
  const up = Date.now() - t0;
  await p.waitForFunction(() => document.getElementById("boot")?.dataset.gone || !document.getElementById("boot"), { timeout: 240000, polling: 50 });
  const gone = Date.now() - t0;
  // (the workers' cache writes commit meanwhile; the heap once the street has settled)
  await new Promise((r) => setTimeout(r, 10000));
  const heap = await p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6));
  await b.close();
  return { up, gone, heap };
};
const res = Object.fromEntries(URLS.map((u) => [u, { first: [], repeat: [] }]));
for (let i = 0; i < +RUNS; i++)
  for (const [k, url] of URLS.entries()) {
    const dir = join(DIR, `p${k}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const first = await visit(url, dir);
    const repeat = await visit(url, dir);
    res[url].first.push(first);
    res[url].repeat.push(repeat);
    console.log(`run ${i + 1} ${url}: first up ${(first.up / 1000).toFixed(1)}s gone ${(first.gone / 1000).toFixed(1)}s heap ${first.heap} MB · repeat up ${(repeat.up / 1000).toFixed(1)}s gone ${(repeat.gone / 1000).toFixed(1)}s heap ${repeat.heap} MB`);
  }
for (const url of URLS) {
  const r = res[url];
  const m = (l, k) => med(l.map((x) => x[k]));
  console.log(`MEDIAN ${url}: first visit up ${(m(r.first, "up") / 1000).toFixed(1)}s, boot screen gone ${(m(r.first, "gone") / 1000).toFixed(1)}s, heap ${m(r.first, "heap")} MB · repeat visit up ${(m(r.repeat, "up") / 1000).toFixed(1)}s, gone ${(m(r.repeat, "gone") / 1000).toFixed(1)}s, heap ${m(r.repeat, "heap")} MB`);
}
