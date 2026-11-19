// node shots/_sheet.mjs OUT.png COLS W img1 img2 …: a contact sheet of screenshots (labelled), drawn in a browser page
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
const [OUT, COLS = "4", W = "400", ...imgs] = process.argv.slice(2);
const cols = +COLS, w = +W, h = Math.round((w * 10) / 16);
const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:4px;font:12px monospace;color:#fff">${imgs.map((f) => `<div style="position:relative"><img src="data:image/png;base64,${readFileSync(f).toString("base64")}" style="width:${w}px;height:${h}px;object-fit:cover;display:block"><span style="position:absolute;left:4px;top:4px;background:#000a;padding:1px 4px">${f.split("/").pop()}</span></div>`).join("")}</body>`;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", defaultViewport: { width: cols * (w + 4), height: Math.ceil(imgs.length / cols) * (h + 4) } });
const p = await b.newPage();
await p.setContent(html);
await p.screenshot({ path: OUT });
await b.close();
