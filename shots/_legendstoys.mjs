// node shots/_legendstoys.mjs [OUT]: the arena's corner toys answer the pointer — sweeps the screen for
// toy hits, clicks one point of each toy and shoots the reaction (MAP env picks the arena)
import puppeteer from "puppeteer-core";
const [OUT = "shots/legends/toys"] = process.argv.slice(2);
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: W, height: H } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(`http://localhost:${process.env.PORT || 3071}/tablelab.html?t=legends&seed=31&stake=100&map=${process.env.MAP || "vault"}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3500);
await p.keyboard.press("Enter");
await sleep(1200);
await p.keyboard.press("Enter");
await sleep(4500);
await p.evaluate(() => document.querySelector("[data-keep]")?.click());
await sleep(5000);
const hits = await p.evaluate(({ W, H }) => {
  const v = window.zkl.view;
  const found = {};
  for (let y = 4; y < H; y += 12) for (let x = 4; x < W; x += 12) {
    const k = v.pick(x, y);
    if (k?.kind === "toy") (found[k.toy] ??= []).push([x, y]);
  }
  return Object.fromEntries(Object.entries(found).map(([k, l]) => [k, { n: l.length, at: l[Math.floor(l.length / 2)] }]));
}, { W, H });
console.log("toys:", JSON.stringify(hits));
const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
console.log("fps (headless):", fps);
for (const [k, h] of Object.entries(hits)) {
  await p.mouse.click(h.at[0], h.at[1]);
  await sleep(420);
  await p.screenshot({ path: `${OUT}-toy${k}.png` });
}
console.log("errors:", errs.length ? errs.join("\n") : "none");
await b.close();
