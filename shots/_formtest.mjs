import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug&theme=night&interior=zsalab");
await p.waitForFunction(() => window.street?.interiors?.active?.key === "zsalab", { timeout: 120000 });
await wait(4000);
// a wallet with fuel already: restore the one the exchange test left? no: inject a fake panel state is not possible; check the form on the hero → strike path needs fuel.
await p.evaluate(() => window.street.zsaLab.open("mint"));
await wait(1500);
const info = await p.evaluate(() => {
  const el = document.querySelector(".zsalab");
  const r = el.getBoundingClientRect();
  const at = document.elementFromPoint(r.left + r.width / 2, r.top + 200);
  const cs = getComputedStyle(el);
  return { pe: cs.pointerEvents, z: cs.zIndex, at: at?.className || at?.tagName, parentPE: getComputedStyle(el.parentElement).pointerEvents };
});
console.log(info);
await b.close();
