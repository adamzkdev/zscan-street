// node shots/_realfacades.mjs [TAG] [QS]: the ordinary buildings close (src/scene/real): a few facades of every kind and zone, seen from
// across their street, day (and night with NIGHT=1) — shots/gta/real/<TAG>-f<k>-<type>.png
import puppeteer from "puppeteer-core";
const [TAG = "fac", QS = ""] = process.argv.slice(2);
const OUT = "shots/gta/real";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(`http://localhost:3061/?debug&gta=1192&theme=day&solo${QS}`);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); const h = document.querySelector(".gta-hud"); if (h) h.style.display = "none"; });
await sleep(3000);
// pick facades: by type, spread over the map
const picks = await p.evaluate((n) => {
  const f = street.city.facades.filter((q) => ["apartment", "shophouse", "office", "house", "izakaya", "machiya"].includes(q.type));
  const by = {};
  for (const q of f) (by[q.type] ??= []).push(q);
  const out = [];
  for (const [t, list] of Object.entries(by)) {
    const step = Math.max(1, Math.floor(list.length / n[t]));
    for (let i = 0; i < list.length && out.filter((o) => o.type === t).length < n[t]; i += step) {
      const q = list[i];
      const mx = (q.x0 + q.x1) / 2;
      // the facade's middle (s/n faces run along x on a z line; e/w along z… the list keeps x0..x1 and z)
      out.push({ type: t, x: mx, z: q.z, ox: q.out.x, oz: q.out.z, h: q.height });
    }
  }
  return out;
}, { apartment: 4, shophouse: 4, office: 4, house: 2, izakaya: 2, machiya: 2 });
let k = 0;
for (const f of picks) {
  for (const tod of process.env.NIGHT ? ["day", "night"] : ["day"]) {
    await p.evaluate((f, tod) => {
      const g = street.gta;
      g.clock?.force?.(tod === "day" ? 14 : 22.5, "clear");
      // across the street: 14 m out, a little to one side, looking back at it
      const px = f.x + f.ox * 14 - f.oz * 4,
        pz = f.z + f.oz * 14 + f.ox * 4;
      const h = Math.atan2(-(f.x - px), -(f.z - pz));
      g.player.place(px, 0.2, pz, h);
      g.cam.behind(h, Math.min(0.42, 0.08 + f.h / 120));
      g.cam.snap(g.player.pos.clone().setY(1.55));
    }, f, tod);
    await sleep(1800);
    await p.screenshot({ path: `${OUT}/${TAG}-${String(k).padStart(2, "0")}-${f.type}-${tod}.png` });
  }
  k++;
}
console.log(TAG, picks.length, "errors", errs.length, errs.slice(0, 4).join("\n"));
await b.close();
