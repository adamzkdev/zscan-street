// node shots/_gtapeds.mjs [URL] [OUT]: the game's passers-by (src/gta/peds.ts): a lively street, a block cheered, a panic
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/peds"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.player.place(86 - 6.1, 0.2, 48, 0); g.cam.behind(0, -0.12); });
await sleep(9000);
console.log(await p.evaluate(() => JSON.stringify({ peds: street.gta.peds.count, lines: street.gta.peds.lines.length, in3d: street.gta.people.slots.size, own: [...street.gta.people.slots.values()].filter((s) => s.p.own).length })));
await p.screenshot({ path: `${OUT}-1-street.png` });
// a block: everyone near cheers
await p.evaluate(() => { const g = street.gta.peds; g.seenBlock = 1; });
await p.evaluate(() => { const h = street.gta.host; const real = h.lastBlockAt; h.lastBlockAt = () => Date.now(); setTimeout(() => (h.lastBlockAt = real), 400); });
await sleep(700);
await p.screenshot({ path: `${OUT}-2-cheer.png` });
console.log("cheering", await p.evaluate(() => street.gta.peds.peds.filter((q) => q.mode === "cheer").length));
await sleep(3000);
// trouble: a punch-like knock in the middle of them
console.log("knock", await p.evaluate(() => { const g = street.gta; const me = g.player.pos; const q = [...g.peds.peds].sort((a, b) => Math.hypot(a.pos.x - me.x, a.pos.z - me.z) - Math.hypot(b.pos.x - me.x, b.pos.z - me.z))[0]; if (!q) return "none"; const n = g.knockAll(q.pos.x, q.pos.z, 3, 0, 1.2); return JSON.stringify({ d: Math.hypot(q.pos.x - me.x, q.pos.z - me.z).toFixed(1), n, modes: g.peds.peds.map((x) => x.mode).join(",") }); }));
await sleep(500);
await p.screenshot({ path: `${OUT}-3-panic.png` });
console.log("fleeing", await p.evaluate(() => street.gta.peds.peds.filter((q) => q.mode === "flee").length));
const perf = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return (n / ((performance.now() - t0) / 1000)).toFixed(1); });
console.log("fps", perf);
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
