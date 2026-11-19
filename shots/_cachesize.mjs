// node shots/_cachesize.mjs [url]: how many bytes the city cache (IndexedDB) holds after a first visit
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp, { timeout: 240000, polling: 100 });
await new Promise((r) => setTimeout(r, 4000));
console.log(await p.evaluate(() => new Promise((res) => {
  const req = indexedDB.open("zstreet-city", 1);
  req.onsuccess = () => {
    const st = req.result.transaction("variants").objectStore("variants");
    const all = st.getAll();
    all.onsuccess = () => {
      let bytes = 0; const by = {};
      const walk = (v) => { if (ArrayBuffer.isView(v)) return v.byteLength; if (v && typeof v === "object") return Object.values(v).reduce((a, x) => a + walk(x), 0); return 0; };
      for (const r of all.result) { const n = walk(r); bytes += n; for (const k of ["full", "cut", "lod"]) by[k] = (by[k] || 0) + walk(r[k]); }
      res(`${all.result.length} variants, ${(bytes / 1e6).toFixed(1)} MB: ` + JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, (v / 1e6).toFixed(1) + " MB"]))));
    };
  };
})));
await b.close();
