// node shots/_furntest.mjs [OUT]: the places' furniture (furntest.html), real and voxel (VOX=1), views (VIEWS env), items (ITEMS env)
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/furn/f"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
for (const view of (process.env.VIEWS ?? "three").split(",")) {
  const q = `view=${view}${process.env.VOX ? "&vox" : ""}${process.env.ITEMS ? `&items=${process.env.ITEMS}` : ""}`;
  await p.goto(`http://localhost:3061/furntest.html?${q}`);
  await p.waitForFunction(() => window.__furnReady, { timeout: 60000, polling: 200 });
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: `${OUT}-${view}${process.env.VOX ? "-vox" : ""}.png` });
}
console.log("errors", errs.length, errs.slice(0, 4).join("\n"));
await b.close();
