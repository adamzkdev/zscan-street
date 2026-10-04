import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
p.on("console", (m) => m.type() === "error" && logs.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug");
await wait(11000);
await p.evaluate(() => street.testBoard());
for (const [n, ms] of [["bus-a", 10000], ["bus-b", 3000], ["bus-c", 2500], ["bus-d", 3000]]) {
  await wait(ms);
  await p.screenshot({ path: `shots/${n}.png` });
  console.log(n, await p.evaluate(() => street.rig.shot + " " + street.director.bus.phase + " " + [...street.director.snarks].map((s) => s.state[0]).join("")));
}
console.log(logs.join("\n"));
await b.close();
