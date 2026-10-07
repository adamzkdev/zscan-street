import puppeteer from "puppeteer-core";
const theme = process.argv[2] ?? "day";
const views = (process.argv[3] ?? "iso,arrest").split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1500, height: 900 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
p.on("console", (m) => m.type() === "error" && !m.text().includes("CORS") && !m.text().includes("ERR_FAILED") && console.log("console:", m.text()));
await p.goto(`http://localhost:3007/?debug&theme=${theme}`);
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 6000));
const V = (x, y, z) => `new street.rig.focus.constructor(${x}, ${y}, ${z})`;
const ready = () => p.waitForFunction(() => window.street && window.street.rig && !document.getElementById("boot"), { timeout: 180000 });
const fly = async (x, z, zoom) => { await ready(); await p.evaluate(`street.rig.setMode("free"); street.rig.flyTo(${V(x, 1, z)}, ${zoom})`); };
for (const v of views) {
  if (v === "iso") {
    await fly(-121, 193, 1.1);
    await new Promise((r) => setTimeout(r, 4500)); await ready();
    await p.screenshot({ path: `shots/jail2-${theme}-iso.png` });
  } else if (v === "close") {
    await fly(-128, 195, 2.6);
    await new Promise((r) => setTimeout(r, 4500)); await ready();
    await p.screenshot({ path: `shots/jail2-${theme}-close.png` });
  } else if (v === "east") {
    await fly(-102, 192, 1.8);
    await new Promise((r) => setTimeout(r, 4500)); await ready();
    await p.screenshot({ path: `shots/jail2-${theme}-east.png` });
  } else if (v === "pier") {
    await fly(-104, 172, 1.8);
    await new Promise((r) => setTimeout(r, 4500)); await ready();
    await p.screenshot({ path: `shots/jail2-${theme}-pier.png` });
  } else if (v === "far") {
    await fly(-121, 175, 0.5);
    await new Promise((r) => setTimeout(r, 4500)); await ready();
    await p.screenshot({ path: `shots/jail2-${theme}-far.png` });
  } else if (v === "arrest") {
    await ready(); await p.evaluate(() => { street.walk(true); street.onFoot.place(new street.onFoot.camera.position.constructor(10, 0.2, 5), -Math.PI / 2); void street.arrest(); });
    await new Promise((r) => setTimeout(r, 12000));
    await p.screenshot({ path: `shots/jail2-${theme}-cell.png` });
    console.log("pos", await p.evaluate(() => { const q = street.onFoot.camera.position; return `${q.x.toFixed(1)},${q.y.toFixed(2)},${q.z.toFixed(1)}`; }));
  }
}
await b.close();
