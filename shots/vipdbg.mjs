import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1200, height: 800 } });
const p = await b.newPage();
await p.goto("http://localhost:3007/?debug");
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  console.log(await p.evaluate(() => [...street.director.snarks].filter(s=>["vip","chauffeured"].includes(s.state)).map(s=>`${s.id} ${s.state} vis=${s.root.visible} walk=${s.isWalking} x=${s.root.position.x.toFixed(1)} z=${s.root.position.z.toFixed(1)} v=${(s.txs[0]?.visible/1e8).toFixed(1)}`).join(" | ")));
}
await b.close();
