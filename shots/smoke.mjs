import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
p.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errs.push(m.text()));
await p.goto("http://localhost:3007/?debug&theme=night");
await new Promise((r) => setTimeout(r, 11000));
for (const k of ["mempool", "factory"]) {
  await p.evaluate((k) => street.enter(k), k);
  await new Promise((r) => setTimeout(r, 3500));
  const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
  console.log(k, "fps", fps);
  await p.evaluate(() => street.interiors.exit());
  await new Promise((r) => setTimeout(r, 1000));
}
console.log(errs.slice(0, 10).join("\n") || "no errors");
await b.close();
