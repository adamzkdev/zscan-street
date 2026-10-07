import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 800, height: 600 } });
const p = await b.newPage();
await p.goto(`http://localhost:3007/?debug&capture`);
await p.waitForFunction(() => window.street, { timeout: 180000 });
console.log(await p.evaluate(() => JSON.stringify([...street.city.landmarks].map(([k, l]) => { const b = l.occluder.box; return [k, Math.round((b.min.x + b.max.x) / 2), Math.round((b.min.z + b.max.z) / 2), Math.round(b.max.y), Math.round(b.max.x - b.min.x), Math.round(b.max.z - b.min.z)]; }))));
await b.close();
