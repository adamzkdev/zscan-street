// node shots/_mui.mjs [desktop] [only,states,...]: every HUD panel on a landscape phone (844×390), writes shots/mui-<state>.png + an audit
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const desk = args[0] === "desktop";
if (desk) args.shift();
const only = args[0] ? args[0].split(",") : null;
const pre = desk ? "mui-d-" : "mui-";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
if (desk) await p.setViewport({ width: 1440, height: 860 });
else await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
p.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));
await p.goto(`http://localhost:3007/?debug&quality=2&theme=night`);
await p.waitForFunction(() => window.street?.ui, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 9000));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => {
  // stand in (or just outside) a lift car shown on this floor
  window.carSpot = (inside) => {
    const c = street.interiors.circ;
    const cam = street.interiors.walk.camera.position;
    for (const car of c.cars) {
      if (!c.shownFloors.includes(car.floor)) continue;
      const g = car.group.getWorldPosition(cam.clone());
      for (let r = 0; r < 8; r += 0.25)
        for (let a = 0; a < 6.28; a += 0.3) {
          const x = g.x + Math.cos(a) * r, z = g.z + Math.sin(a) * r;
          if (inside ? car.inside(x, z) : car.near(x, z) && !car.inside(x, z)) { cam.x = x; cam.z = z; return car.name; }
        }
    }
    return null;
  };
});
// seed the inbox
await p.evaluate(() => {
  const g = street.ui.gameHud;
  g.mail("whale", "Whale alert", "812 ZEC moving in public over the avenue. Tap it to shield it.", { label: "Go", fn: () => {} });
  g.mail("paper", "The ZStreet Daily", "Block 3,100,000 sealed: shielded share at a new high as the mempool empties before the halving.", { label: "Read", fn: () => {} });
  g.mail("chain", "Sealed in block 3,104,221", "Your message is on the chain for good: “meet me at the stadium”.");
  g.mail("city", "City Works", "Three proposals wait for a vote: a footbridge over the avenue, a tram stop, a park.");
  for (let i = 0; i < 6; i++) g.mail("city", `News ${i}`, "Something happened in the city, a line or two of text to read.");
});
async function reset() {
  await p.evaluate(() => {
    for (let i = 0; i < 4; i++) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    document.querySelectorAll(".inbox.open,.mailread.open,.track-pop.open").forEach((e) => e.classList.remove("open"));
    street.ui.talk().close();
    street.ui.tracker.stop?.();
    street.ui.arcade.close();
    street.ui.reader.close();
    street.ui.payDesk.close();
    street.overlays.set("off");
    if (street.interiors.active) street.interiors.exit();
    street.walk(false);
    street.select(null);
    street.hud.cb.exitFollow();
    street.hud.cb.home();
    document.querySelector(".choice")?.remove();
    document.getElementById("ui").classList.remove("photo");
  });
  await wait(1200);
}
const snark = () => p.evaluate(() => { const s = [...street.director.snarks].find((s) => s.txs.length && s.root.visible) ?? [...street.director.snarks][0]; street.select(s); return s.id; });
const tap = async (sel) => { const el = await p.$(sel); if (!el) return console.log("  (no", sel + ")"); await el.click(); };
const S = {
  base: async () => {},
  snark: async () => { await snark(); },
  snarkTraits: async () => { await snark(); await wait(300); await tap(".panel [data-tab=traits]"); },
  snarkJourney: async () => { await snark(); await wait(300); await tap(".panel [data-tab=journey]"); },
  placetag: async () => { await p.evaluate(() => { street.rig.flyTo(street.city.venues[0].door.clone(), 1.6); street.hud.hoverPlace(street.city.venues[0].kind); }); },
  venueCards: async () => { await p.evaluate(() => street.venues.show("cards")); },
  venueBank: async () => { await p.evaluate(() => street.venues.show("bank")); },
  cam: async () => { await tap(".rail [data-act=cam]"); },
  views: async () => { await tap(".rail [data-act=cam]"); await wait(300); },
  zones: async () => { await p.evaluate(() => street.overlays.set("zones")); },
  traffic: async () => { await p.evaluate(() => street.overlays.set("traffic")); },
  trackpop: async () => { await tap(".track-btn"); },
  track: async () => { await p.evaluate(() => { const s = [...street.director.snarks].find((s) => s.txs.length); street.ui.tracker.track(s.txs[0].txid); }); await wait(2500); },
  talk: async () => { await snark(); await wait(400); await tap(".panel .talkbtn"); await wait(1500); },
  snarkScrolled: async () => { await snark(); await wait(400); await p.evaluate(() => (document.querySelector(".panel").scrollTop = 999)); },
  inbox: async () => { await tap(".mailbtn"); },
  mail: async () => { await tap(".mailbtn"); await wait(300); await tap(".inbox li[data-open='1']"); },
  foot: async () => { await p.evaluate(() => street.game.meet([...street.director.snarks].find((s) => s.root.visible && s.state !== "resident")?.id ?? 1)); await wait(2000); },
  bigmap: async () => { await p.evaluate(() => street.walk(true)); await wait(1000); await p.evaluate(() => street.ui.minimap.toggle(true)); },
  photo: async () => { await tap(".photo-btn"); },
  choice: async () => { await p.evaluate(() => street.enter("stadium")); },
  prison: async () => { await p.evaluate(() => street.enter("prison")); await wait(3000); },
  pick: async () => { await p.evaluate(() => street.enter("prison")); await wait(3000); await p.evaluate(() => street.hud.showPick({ eyebrow: "監房 · CELL 4", title: "Transparent tx 3f9a…c21d", tag: ["Locked up", "warn"], stats: [["Block", "3,104,221"], ["Fee", "0.0001 ZEC"], ["Sentence", "12 blocks"], ["Visible", "812 ZEC"]], body: "<p>Caught moving coins in public. It walks free once its value is shielded.</p>", link: { label: "On ZScan", href: "#" } })); },
  lift: async () => { await p.evaluate(() => street.enter("tower")); await wait(3500); console.log("  car:", await p.evaluate(() => carSpot(true))); await wait(1500); },
  liftprompt: async () => { await p.evaluate(() => street.enter("tower")); await wait(3500); console.log("  near:", await p.evaluate(() => carSpot(false))); await wait(1500); },
  talkprompt: async () => { console.log("  crowd:", JSON.stringify(await p.evaluate(() => street.game.meetCrowd()))); await wait(1500); },
  reader: async () => { await p.evaluate(() => street.ui.reader.show({ slug: "zip-0032", number: 32, title: "Shielded Hierarchical Deterministic Wallets", status: "Final", owners: ["Sean Bowe", "Daira-Emma Hopwood"], created: "2018-05-22", color: "#ffd28a", url: "https://zips.z.cash/zip-0032" })); await wait(3000); },
  arcade: async () => { await p.evaluate(() => street.ui.arcade.show("quiz")); await wait(800); },
  snake: async () => { await p.evaluate(() => street.ui.arcade.show("snake")); await wait(800); },
  snakePlay: async () => { await p.evaluate(() => street.ui.arcade.show("snake")); await wait(800); await tap(".arcpad .k-right"); await wait(600); await tap(".arcpad .k-down"); await wait(400); },
  invaders: async () => { await p.evaluate(() => street.ui.arcade.show("invaders")); await wait(800); },
  paydesk: async () => { await p.evaluate(() => street.ui.payDesk.gallery()); await wait(800); },
};
const audit = () => p.evaluate(() => {
  const W = innerWidth, H = innerHeight, out = [];
  const vis = (e) => { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || +s.opacity < 0.05) return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const name = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : "");
  const tops = [...document.querySelectorAll("#ui > *")].filter(vis).filter((e) => !e.matches(".labels,.lb,.cut,.tip"));
  for (const e of tops) {
    const r = e.getBoundingClientRect();
    const ofs = r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1;
    out.push(`${name(e).slice(0, 40)} [${r.left|0},${r.top|0} ${r.width|0}x${r.height|0}]${ofs ? " OFFSCREEN" : ""}${e.scrollHeight > e.clientHeight + 2 && getComputedStyle(e).overflowY === "visible" ? " OVERFLOW" : ""}`);
  }
  const small = new Map(), tiny = new Map();
  for (const e of document.querySelectorAll("#ui *")) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const fs = parseFloat(getComputedStyle(e).fontSize);
    let sc = 1; for (let q = e; q && q.id !== "ui"; q = q.parentElement) { const t = getComputedStyle(q).transform; const m = t.match(/matrix\(([^,]+)/); if (m) sc *= +m[1]; }
    if (hasText && fs * sc < 11.5 && !e.closest(".labels,.lb")) small.set(name(e).slice(0, 30) + " " + (fs * sc).toFixed(1), (small.get(name(e).slice(0, 30) + " " + (fs * sc).toFixed(1)) ?? 0) + 1);
    if (e.matches("button,a,[data-act],[data-open],input,select") && (r.width < 36 || r.height < 36) && !e.closest(".labels")) tiny.set(name(e).slice(0, 34) + ` ${r.width|0}x${r.height|0}`, 1);
  }
  return out.join("\n") + "\n  small text: " + [...small].map(([k, v]) => `${k}×${v}`).join(", ") + "\n  small taps: " + [...tiny.keys()].join(", ");
});
for (const [k, fn] of Object.entries(S)) {
  if (only && !only.includes(k)) continue;
  await reset();
  try { await fn(); } catch (e) { console.log(k, "ERR", e.message.slice(0, 200)); }
  await wait(900);
  await p.screenshot({ path: `shots/${pre}${k}.png` });
  console.log(`== ${k}\n${await audit()}`);
}
await Promise.race([b.close(), new Promise((r) => setTimeout(r, 3000))]);
process.exit(0);
