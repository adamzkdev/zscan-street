import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() !== "debug" && logs.push(`[${m.type()}] ${m.text()}`));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { await p.screenshot({ path: `shots/${name}.png` }); console.log("shot", name); };
await p.goto("http://localhost:3007/?debug");
await wait(11000);
await shot("v2-live");
await p.evaluate(() => street.rig.setMode("overview")); await wait(3500); await shot("v2-overview");
await p.evaluate(() => street.rig.setMode("live")); await wait(2500);
const steps = (process.argv[2] ?? "follow,board").split(",");
if (steps.includes("follow")) {
  await p.evaluate(() => { const s=[...street.director.snarks].find(s=>s.state==="waiting")||[...street.director.snarks][0]; document.querySelector('#ui'); window.__s=s; street.follow(s); });
  await wait(2500); await shot("v2-follow-34");
  await p.evaluate(() => street.rig.pick("street")); await wait(2000); await shot("v2-follow-street");
  await p.evaluate(() => street.rig.pick("high")); await wait(2000); await shot("v2-follow-high");
  await p.evaluate(() => street.rig.exit()); await wait(1500);
}
if (steps.includes("board")) {
  await p.evaluate(() => street.testBoard());
  await wait(11000); await shot("v2-boarding");
  await p.evaluate(() => { const s=[...street.director.snarks].find(s=>s.state==="riding"); if (s) street.follow(s); return !!s; }).then(x=>console.log("rider found", x));
  await wait(1500); await shot("v2-inside");
  await wait(12000); await shot("v2-after");
}
console.log(logs.slice(0, 15).join("\n"));
await b.close();
