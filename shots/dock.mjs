import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1200, height: 800 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
await p.goto("http://localhost:3007/?debug");
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  console.log(await p.evaluate(() => {
    const d = street.director;
    const hands = [...d.snarks].filter((s) => s.role && s.role !== "Shopkeeper").map((s) => `${s.role}@${s.root.position.x.toFixed(1)},${s.root.position.z.toFixed(1)} walk=${s.isWalking} vis=${s.root.visible} parent=${!!s.root.parent}`);
    const trucks = [...d.trucks].map((t) => `truck@${t.group.position.x.toFixed(1)},${t.group.position.z.toFixed(1)}`);
    return [...trucks, ...hands].join(" | ") + " docks=" + JSON.stringify(street.city.docks);
  }));
}
await b.close();
