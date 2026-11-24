// node shots/_sheet.mjs <glob-prefix> <from> <to> <out.png> [cols]: a contact sheet of numbered frames (fx-001.jpg...)
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
const [pre, a, z, out, cols = "4"] = process.argv.slice(2);
const imgs = [];
for (let i = +a; i <= +z; i++) imgs.push(`${pre}${String(i).padStart(3, "0")}.jpg`);
const html = `<html><body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px">${imgs.map((f) => `<div style="position:relative"><img style="width:100%;display:block" src="data:image/jpeg;base64,${readFileSync(f).toString("base64")}"><b style="position:absolute;left:4px;top:2px;color:#ff0;font:14px monospace">${f.slice(-7, -4)}</b></div>`).join("")}</body></html>`;
const tmp = out.replace(/\.png$/, "") + ".html";
writeFileSync(tmp, html);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
await p.goto("file://" + tmp);
await p.screenshot({ path: out, fullPage: true });
await b.close();
