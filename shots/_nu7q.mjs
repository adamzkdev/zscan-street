// The NU7 quarter: node shots/_nu7q.mjs [progress] [day|night]
import puppeteer from "puppeteer-core";
const p = process.argv[2] ?? "";
const theme = process.argv[3] ?? "day";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const pg = await b.newPage();
pg.on("pageerror", (e) => console.log("pageerror", e.message));
pg.on("console", (m) => m.type() === "error" && console.log("console", m.text()));
await pg.goto(`http://localhost:3007/?debug&theme=${theme}${p ? `&nu7q=${p}` : ""}`);
await new Promise((r) => setTimeout(r, 15000));
await pg.evaluate((z) => street.game.nu7Quarter.go(z || undefined), Number(process.env.ZOOM) || 0);
await new Promise((r) => setTimeout(r, 9000));
const tag = p || "live";
console.log(JSON.stringify(await pg.evaluate(() => street.game.nu7Quarter.debugState())));
await pg.screenshot({ path: `shots/nu7q-${tag}-${theme}.png` });
if (!process.argv[4]) {
  await pg.evaluate(() => street.game.stand(205.5, -44, 0));
  await new Promise((r) => setTimeout(r, 5000));
  await pg.screenshot({ path: `shots/nu7q-${tag}-${theme}-foot.png` });
  await pg.evaluate(() => street.game.stand(160, -44, 0.3));
  await new Promise((r) => setTimeout(r, 4000));
  await pg.screenshot({ path: `shots/nu7q-${tag}-${theme}-kart.png` });
}
await b.close();
