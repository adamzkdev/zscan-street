// node shots/_texleak.mjs: which code keeps creating GPU textures / buffers (stack of each gl.createTexture/createBuffer after boot)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" });
await p.evaluateOnNewDocument(() => {
  Error.stackTraceLimit = 40;
  window.__made = { tex: new Map(), buf: new Map(), on: false };
  const wrap = (proto, fn, key) => {
    const orig = proto[fn];
    proto[fn] = function () {
      if (window.__made.on) {
        const st = (new Error().stack || "").split("\n").slice(2, 30).map((l) => l.trim().replace(/\(?https?:\/\/[^/]+\//, "").replace(/\?[^:]*/, "")).filter((l) => !/node_modules/.test(l)).slice(0, 4).join(" | ");
        const m = window.__made[key];
        m.set(st, (m.get(st) ?? 0) + 1);
      }
      return orig.apply(this, arguments);
    };
  };
  wrap(WebGL2RenderingContext.prototype, "createTexture", "tex");
  wrap(WebGL2RenderingContext.prototype, "createBuffer", "buf");
});
await p.goto(`http://localhost:3007/?debug`);
await p.waitForFunction(() => window.street, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 30000));
await p.evaluate(() => (window.__made.on = true));
await new Promise((r) => setTimeout(r, 90000));
console.log(await p.evaluate(() => { const f = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => v + "  " + k).join("\n"); return "TEXTURES\n" + f(window.__made.tex) + "\nBUFFERS\n" + f(window.__made.buf); }));
await b.close();
