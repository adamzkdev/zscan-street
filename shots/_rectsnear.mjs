// node shots/_rectsnear.mjs <place> <floor> <x> <z>: the walker's colliders near a point
import puppeteer from "puppeteer-core";
const [key, f, x, z] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal"] });
const p = await b.newPage();
await p.goto(`http://localhost:3007/?debug&theme=day&interior=${key}`);
await p.waitForFunction(() => window.street?.interiors?.active, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));
console.log(await p.evaluate(([f, x, z]) => {
  const I = street.interiors;
  I.goTo(f);
  const W = I.walk;
  const out = [];
  for (const [name, list] of [["colliders", W.colliders], ["extra", W.extra]]) for (const r of list ?? []) if (r[0] < x + 2.5 && r[2] > x - 2.5 && r[1] < z + 2.5 && r[3] > z - 2.5) out.push(name + " " + r.map((v) => v.toFixed(2)).join(","));
  return out.join("\n") + "\nkeys: " + Object.keys(W).join(",");
}, [Number(f), Number(x), Number(z)]));
await b.close();
