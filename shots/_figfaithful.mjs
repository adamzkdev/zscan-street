// node shots/_figfaithful.mjs [OUT_DIR]: each zkSNARK's picture beside its 3D figure from the front,
// from its picture's own 3/4 turn, the side and the back (figtest.html, one page, the pictures read
// one at a time by faces.ts as in the game) → OUT_DIR/<id>.png, and all of them in OUT_DIR/sheet.png
// IDS=1192,9703 NIGHT=1 (the night lights) QS=&noart — only the sheet is kept (the per-view images are deleted)
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
const [OUT = "shots/gta/faithful"] = process.argv.slice(2);
const IDS = (process.env.IDS ?? "1192,9703,5506,42,777,4944,17,501,5069,5552,5657,5860,5861,16").split(",").map(Number);
const night = !!process.env.NIGHT;
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1000, height: 900 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.text().startsWith("verts") && console.log(m.text()));
await p.goto(`http://localhost:3061/figtest.html?ids=${IDS.join(",")}&view=front${night ? "&night" : ""}${process.env.QS ?? ""}`);
await p.waitForFunction(() => window.__figReady, { timeout: 180000, polling: 300 });
await new Promise((r) => setTimeout(r, 1200));
const clip = { x: 240, y: 40, width: 520, height: 820 };
const rows = [];
for (const id of IDS) {
  const yaw = 0.62;
  const files = [];
  const orig = await p.evaluate((id) => window.__figOrig(id), id);
  const of = `${OUT}/_o${id}.png`;
  if (orig) {
    writeFileSync(of, Buffer.from(orig.split(",")[1], "base64"));
    // the picture, point-scaled, on the figure's panel size
    execFileSync("magick", [of, "-filter", "point", "-resize", "500x500", "-background", night ? "#0c1020" : "#a9c3e6", "-gravity", "center", "-extent", `${clip.width}x${clip.height}`, of]);
    files.push(of);
  }
  for (const [name, a] of [["front", 0], ["three", yaw], ["side", Math.PI / 2], ["back", Math.PI]]) {
    await p.evaluate((id, a) => window.__figSolo(id, a), id, a);
    await new Promise((r) => setTimeout(r, 250));
    const f = `${OUT}/_${id}-${name}.png`;
    await p.screenshot({ path: f, clip });
    files.push(f);
  }
  const out = `${OUT}/${id}${night ? "-night" : ""}.png`;
  execFileSync("magick", [...files, "+append", out]);
  rows.push(out);
  console.log(id, "→", out);
}
execFileSync("magick", [...rows, "-append", "-resize", "50%", `${OUT}/sheet${night ? "-night" : ""}.png`]);
// (only the sheet is kept: the per-view and per-id images go — the disk filled up with them once)
for (const f of [...rows, ...readdirSync(OUT).filter((n) => n.startsWith("_")).map((n) => `${OUT}/${n}`)]) rmSync(f, { force: true });
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
