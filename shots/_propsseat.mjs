// Close-ups of seated / perched / hatted zkSNARKs in every walk-in place.
// Usage: node shots/_propsseat.mjs <tag> [keys] [port]   (OUT=dir for the pngs)
import puppeteer from "puppeteer-core";
const tag = process.argv[2] ?? "x";
const keys = (process.argv[3] ?? "tower,hotel,needle,opera,prison,library,factory,museum,colosseum,mall,eiffel,palm,gardens,arab,statue,reserve,bigben,tower-orchard,tower-sapling,tower-halo,stadium").split(",");
const port = process.argv[4] ?? "3037";
const OUT = process.env.OUT ?? "shots";
const PER = Number(process.env.PER ?? 3);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1000, height: 700 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto(`http://localhost:${port}/?debug&capture&theme=day`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 120000 });
const step = async (sec) => { const end = Date.now() + sec * 1000; while (Date.now() < end) { await p.evaluate(() => capture.step(1 / 30)); await new Promise((r) => setTimeout(r, 10)); } };
await step(2);
for (const k of keys) {
  const city = k === "street";
  if (city) await step(25);
  else await p.evaluate((k) => capture.enter(k, 0), k);
  const nf = city ? 1 : await p.evaluate(() => street.interiors.active?.floors.length ?? 0);
  for (let f = 0; f < nf; f++) {
    if (!city) await p.evaluate((f) => capture.floor(f), f);
    if (!city) await step(Number(process.env.WAIT ?? 4));
    const list = await p.evaluate((PER, city) => {
      const i = city ? { scene: street.director.scene } : street.interiors.active;
      const roles = new Set();
      const out = [];
      const seen = new Set();
      i.scene.updateMatrixWorld(true);
      i.scene.traverse((o) => {
        const s = o.userData.snarkRef;
        if (!s || seen.has(s)) return;
        seen.add(s);
        let vis = true;
        for (let q = s.root; q; q = q.parent) if (!q.visible) vis = false;
        if (!vis) return;
        const capped = s.body.material.map !== s.glow.material.uniforms.map.value || s.visual.children.length > 6 || /Police|Chef|Cook/.test(s.role ?? "");
        if (!s.isSeated && !s.isPerched && !capped) return;
        if (city) {
          const key = `${s.role}|${s.isSeated}|${s.isPerched}`;
          if (roles.has(key)) return;
          roles.add(key);
        }
        const w = s.root.getWorldPosition(s.root.position.clone());
        const fd = s.faceDir ? s.faceDir.clone() : null;
        out.push({ id: s.id, role: s.role, seated: s.isSeated, perched: s.isPerched, capped, x: w.x, y: w.y, z: w.z, fx: fd?.x ?? 0, fz: fd?.z ?? 1 });
      });
      // a spread: seated first, then others
      out.sort((a, b) => Number(b.seated || b.perched) - Number(a.seated || a.perched));
      const pick = [];
      for (const o of out) if (pick.length < PER && !pick.some((q) => Math.hypot(q.x - o.x, q.z - o.z) < 3)) pick.push(o);
      return pick;
    }, city ? 12 : PER, city);
    for (const [n, o] of list.entries()) {
      // 3/4 view from in front-side of where it faces
      const fl = Math.hypot(o.fx, o.fz) || 1;
      const fx = o.fx / fl, fz = o.fz / fl;
      const sx = -fz, sz = fx;
      const d = Number(process.env.DIST ?? 3.3);
      const pos = [o.x + (fx * 0.75 + sx * 0.66) * d, o.y + 1.3, o.z + (fz * 0.75 + sz * 0.66) * d];
      await p.evaluate((pos, look) => { capture.shot({ pos, look, fov: 48 }); capture.step(1 / 30); capture.step(1 / 30); }, pos, [o.x, o.y + 0.75, o.z]);
      const name = `${OUT}/ps-${tag}-${k}-f${f}-${n}.png`;
      await p.screenshot({ path: name });
      console.log(name, o.role, o.seated ? "seated" : o.perched ? "perched" : "capped", o.y.toFixed(2));
    }
    await p.evaluate(() => capture.shot(null));
  }
  if (!city) await p.evaluate(() => capture.leave());
  await step(0.5);
}
await b.close();
