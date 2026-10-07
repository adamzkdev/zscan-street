// node shots/_alloc.mjs [port=3023] [seconds=10] [walk]: who allocates in the frame loop (sampling heap profiler)
import puppeteer from "puppeteer-core";
const port = Number(process.argv[2] ?? 3023);
const secs = Number(process.argv[3] ?? 10);
const WALK = process.argv.includes("walk");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const cdp = await p.target().createCDPSession();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=night`);
for (let k = 0; k < 60 && !(await p.evaluate(() => !!window.street).catch(() => false)); k++) await wait(1000);
await wait(15000);
if (WALK) await p.evaluate(() => street.walk(true));
await wait(2000);
await cdp.send("HeapProfiler.enable");
await cdp.send("HeapProfiler.startSampling", { samplingInterval: 4096 });
await wait(secs * 1000);
const { profile } = await cdp.send("HeapProfiler.stopSampling");
const by = new Map();
let total = 0;
const FOCUS = process.env.FOCUS;
const stacks = new Map();
const visit = (n, stack) => {
  const f = n.callFrame;
  const here = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}`;
  const st = [...stack, here];
  if (n.selfSize) {
    total += n.selfSize;
    by.set(here, (by.get(here) ?? 0) + n.selfSize);
    if (FOCUS && here.startsWith(FOCUS)) {
      const k = st.slice(-14, -1).reverse().join(" < ");
      stacks.set(k, (stacks.get(k) ?? 0) + n.selfSize);
    }
  }
  for (const c of n.children) visit(c, st);
};
visit(profile.head, []);
console.log(`sampled allocations ${(total / 1048576).toFixed(1)} MB in ${secs}s (${(total / 1048576 / secs).toFixed(2)} MB/s)`);
for (const [k, v] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${(v / 1024).toFixed(0).padStart(7)} KB  ${k}`);
for (const [k, v] of [...stacks].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`\n${(v / 1024).toFixed(0)} KB: ${k}`);
await b.close();
