// node shots/_legendscards.mjs [query] [out] [W] [H]: the bench page's cards (or menus) as a screenshot
import puppeteer from "puppeteer-core";
const [Q = "cards=n_whale,t_kingpin,o_frost,o_counter,t_hammer,s_germ,p_lich,n_apparition&w=300&back", OUT = "shots/legends/cards.png", W = "1500", H = "900"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", defaultViewport: { width: +W, height: +H } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => /error/.test(m.type()) && errs.push(m.text().slice(0, 200)));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(`http://localhost:3073/shots/legendslab.html?${Q}`);
await new Promise((r) => setTimeout(r, +(process.env.WAIT || 5000)));
if (process.env.EVAL) await p.evaluate(process.env.EVAL), await new Promise((r) => setTimeout(r, +(process.env.WAIT2 || 1500)));
await p.screenshot({ path: OUT, fullPage: !!process.env.FULL });
console.log("errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
