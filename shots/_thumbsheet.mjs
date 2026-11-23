// A contact sheet of thumbnails: node shots/_sheet.mjs <out.png> <key,key,…>
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
const out = process.argv[2];
const keys = process.argv[3].split(",");
const dir = new URL("../public/party/thumbs/", import.meta.url).pathname;
const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;font:11px monospace;color:#fff">${keys.map((k) => `<div><img src="file://${dir}${k}.jpg" style="width:100%;display:block"><div>${k}</div></div>`).join("")}</body></html>`;
const file = out.replace(/\.png$/, ".html");
writeFileSync(file, html);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--allow-file-access-from-files"] });
const p = await b.newPage();
await p.setViewport({ width: 1500, height: 100 });
await p.goto(`file://${file}`);
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: out, fullPage: true });
await b.close();
