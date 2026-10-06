import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal"] });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto("http://localhost:3007/?debug&capture&theme=night");
await p.waitForFunction(() => window.capture && window.street, { timeout: 120000 });
const step = async (sec) => { const end = Date.now() + sec * 1000; while (Date.now() < end) { await p.evaluate(() => capture.step(1 / 30)); await new Promise((r) => setTimeout(r, 15)); } };
await step(10);
console.log("queued", await p.evaluate(() => street.director.debugQueue(12)));
await step(3);
await p.evaluate(() => street.testBoard());
for (let k = 0; k < 40; k++) {
  await step(2);
  if (k >= 20) console.log(k * 2 + 2, await p.evaluate(() => { const t = street.metro.trains[0]; const b = [...street.director.snarks].filter((s) => s.state === "boarding").map((s) => `${s.root.position.x.toFixed(0)},${s.root.position.y.toFixed(1)},${s.root.position.z.toFixed(0)}`); return `train ${t ? `s=${t.s.toFixed(0)} dwell=${t.dwell.toFixed(1)} held=${t.held}` : "none"} | boarding ${b.length}: ${b.slice(0, 4).join(" ")}`; }));
}
await b.close();
