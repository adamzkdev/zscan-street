// node shots/_prog.mjs [port=3023]: which materials make the shader programs (after a tour of the places)
import puppeteer from "puppeteer-core";
const port = Number(process.argv[2] ?? 3023);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=night`);
for (let k = 0; k < 60 && !(await p.evaluate(() => !!window.street).catch(() => false)); k++) await wait(1000);
await wait(10000);
const dump = async (label) => console.log(label, await p.evaluate(() => {
  const progs = street.renderer.info.programs;
  const by = {};
  for (const pr of progs) {
    const k = pr.name || pr.cacheKey.split(',')[0].slice(0, 40);
    by[k] = (by[k] ?? 0) + 1;
  }
  // how the variants of the most common type differ
  const std = progs.filter((x) => x.cacheKey.startsWith("physical")).map((x) => x.cacheKey);
  const parts = {};
  for (const ck of std) ck.split(",").forEach((v, i) => ((parts[i] ??= new Set()).add(v)));
  const varying = Object.entries(parts).filter(([, s]) => s.size > 1).map(([i, s]) => `#${i}:${[...s].slice(0, 6).join("|")}`).join("  ");
  return `programs ${progs.length}\n` + Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `  ${v} ${k}`).join("\n") + `\nStandard varying params: ${varying.slice(0, 1500)}`;
}));
await dump("city");
const keys = await p.evaluate(() => Object.keys(street.interiors.build));
for (const k of keys) {
  await p.evaluate((k) => street.interiors.enter(k, 0), k).catch(() => {});
  await wait(1200);
  await p.evaluate(() => street.interiors.exit());
}
await dump("after places");
await b.close();
