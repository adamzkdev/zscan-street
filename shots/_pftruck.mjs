// node shots/_pftruck.mjs <port> <seconds> — follows the delivery trucks from the Proof Factory district
import puppeteer from "puppeteer-core";
const [port = "3021", secs = "240"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1300, height: 820 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:${port}/?debug&theme=night`);
await p.waitForFunction(() => window.street, { timeout: 120000 });
console.log(await p.evaluate(() => JSON.stringify(street.city.docks.map((d) => ({ kind: d.kind, at: d.at, path: d.path?.length })))));
let shots = 0;
const t0 = Date.now();
while (Date.now() - t0 < Number(secs) * 1000) {
  await new Promise((r) => setTimeout(r, 4000));
  const st = await p.evaluate(() => {
    const d = street.director;
    const tr = [...d.trucks].map((t) => [t.source, +t.group.position.x.toFixed(1), +t.group.position.z.toFixed(1)]);
    const hands = [...d.snarks].filter((s) => s.role && /hand|driver/i.test(s.role)).map((s) => `${s.role}@${s.root.position.x.toFixed(1)},${s.root.position.z.toFixed(1)}`);
    return { tr, hands };
  });
  console.log(Math.round((Date.now() - t0) / 1000), JSON.stringify(st.tr), st.hands.join(" | "));
  const moving = st.tr.find(([, x, z]) => !(x < -140 && z > 100));
  if (moving && shots < 4) {
    await p.evaluate(([x, z]) => { street.rig.setMode("free"); street.rig.flyTo(new street.rig.focus.constructor(x, 1, z), 1.6); }, [moving[1], moving[2]]);
    await new Promise((r) => setTimeout(r, 2500));
    await p.screenshot({ path: `shots/pftruck-${shots++}.png` });
  } else if (st.hands.length && shots < 6 && st.tr.length) {
    await p.evaluate(([x, z]) => { street.rig.setMode("free"); street.rig.flyTo(new street.rig.focus.constructor(x, 1, z), 2.2); }, [st.tr[0][1], st.tr[0][2]]);
    await new Promise((r) => setTimeout(r, 2500));
    await p.screenshot({ path: `shots/pftruck-${shots++}.png` });
  }
}
await b.close();
