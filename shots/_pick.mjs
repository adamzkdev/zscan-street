// node shots/_pick.mjs <place> <text>: walks up to the clickable whose hover label contains <text>, clicks it, screenshots the card
import puppeteer from "puppeteer-core";
const [key, text] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
await p.goto(`http://localhost:${process.env.PORT ?? 3007}/?debug&theme=day&interior=${key}`);
await p.waitForFunction(() => window.street?.interiors?.active, { timeout: 150000 });
await new Promise((r) => setTimeout(r, 3000));
const found = await p.evaluate((text) => {
  const I = street.interiors, A = I.active;
  for (const o of A.pickables()) {
    const label = A.hover?.({ object: o, point: o.getWorldPosition(new o.position.constructor()) }) ?? "";
    if (!label.includes(text)) continue;
    const V = o.position.constructor;
    const w = o.getWorldPosition(new V());
    const n = new V(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new o.quaternion.constructor()));
    // which floor: the one whose y is just below
    let f = 0;
    A.floors.forEach((fl, i) => { if (fl.y <= w.y + 0.2 && fl.y > A.floors[f].y - 0.01 && w.y - fl.y < 4) f = i; });
    I.goTo(f);
    const y = A.floors[f].y;
    const at = new V(w.x + n.x * 2.4, y, w.z + n.z * 2.4);
    I.walk.place(at, Math.atan2(-(w.x - at.x), -(w.z - at.z)), y);
    I.walk.pitch = Math.atan2(w.y - (y + 1.6), 2.4);
    return label;
  }
  return null;
}, text);
console.log("target:", found);
await new Promise((r) => setTimeout(r, 1500));
await p.mouse.click(720, 430);
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: `shots/pick-${key}.png` });
await b.close();
