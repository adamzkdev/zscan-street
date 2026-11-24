// node shots/_reallm.mjs kind[,kind…] [views] [OUT]: realistic landmarks alone on their lots (reallm.html), day (and night with NIGHT=1); VOXEL=1 for the voxel version
import puppeteer from "puppeteer-core";
const [KINDS = "noir", VIEWS = "three,street", OUT = "shots/gta/rlm/l"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => (errs.push(e.message), console.log("pageerror", e.message)));
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
for (const kind of KINDS.split(","))
  for (const view of VIEWS.split("|"))
    for (const night of process.env.NIGHT ? [false, true] : [false]) {
      await p.goto(`http://localhost:3061/reallm.html?kind=${kind.split("+")[0]}${kind.includes("+") ? "&" + kind.split("+").slice(1).join("&") : ""}&cam=${view}${night ? "&night" : ""}${process.env.VOXEL ? "&voxel" : ""}`);
      await p.waitForFunction(() => window.lmReady, { timeout: 60000, polling: 200 });
      await new Promise((r) => setTimeout(r, 1500));
      const info = await p.evaluate(() => window.lmReady);
      await p.screenshot({ path: `${OUT}-${kind.replace(/[^a-z0-9]/gi, "_")}-${view.replace(/[^a-z0-9]/gi, "_")}${night ? "-night" : ""}${process.env.VOXEL ? "-voxel" : ""}.png` });
      console.log(kind, view, night ? "night" : "day", JSON.stringify(info));
    }
console.log("errors", errs.length, errs.slice(0, 4).join("\n"));
await b.close();
