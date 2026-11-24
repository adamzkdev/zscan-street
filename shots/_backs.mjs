// node shots/_backs.mjs [OUT]: every landmark lot seen from behind and from its sides (free camera): open backs, missing walls
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/closure/back"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 960, height: 540 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto(`http://localhost:3061/?debug&capture&theme=day`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 300000, polling: 300 });
for (let k = 0; k < 40; k++) {
  await p.evaluate(() => { for (let i = 0; i < 5; i++) capture.step(1 / 30); });
  if (await p.evaluate(() => !!window.__streetUp)) break;
  await new Promise((r) => setTimeout(r, 1500));
}
const lots = await p.evaluate(async () => {
  const plan = await import("/src/scene/city/plan.ts");
  const FACE = { stadium: "s", museum: "e", foodhall: "n", reserve: "n", mall: "s", needle: "s", marina: "n", gardens: "n", port: "n", pyramid: "s", eiffel: "s", colosseum: "s", parliament: "s", shibuya: "e", zkorchard: "s", zksapling: "n", zkhalo: "s", binhai: "n", cemetery: "s", zodl: "s", vizor: "n", noir: "s", zlab: "s", university: "s", zsalab: "n", convention: "n", gamehouse: "s" };
  return plan.LOTS.filter((l) => FACE[l.kind]).map((l) => ({ kind: l.kind, x: (l.x0 + l.x1) / 2, z: (l.z0 + l.z1) / 2, w: l.x1 - l.x0, d: l.z1 - l.z0, face: FACE[l.kind] }));
});
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
for (const l of lots) {
  if (only && !only.includes(l.kind)) continue;
  const F = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[l.face];
  const half = Math.abs(F[0]) ? l.w / 2 : l.d / 2;
  const side = Math.abs(F[0]) ? l.d / 2 : l.w / 2;
  for (const [tag, dx, dz, dist] of [["back", -F[0], -F[1], half + 30], ["side", F[1], F[0], side + 30]]) {
    const v = { pos: [l.x + dx * dist + F[0] * 6, 16, l.z + dz * dist + F[1] * 6], look: [l.x, 8, l.z], fov: 60 };
    await p.evaluate((v) => { capture.shot(v); for (let i = 0; i < 16; i++) capture.step(1 / 30); }, v);
    await new Promise((r) => setTimeout(r, 400));
    await p.screenshot({ path: `${OUT}-${l.kind}-${tag}.png` });
  }
}
await b.close();
