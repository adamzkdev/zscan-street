// node shots/_memdump.mjs: Chrome's own memory breakdown (memory-infra dump) per process, once the city is up (phone emulation)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
if (!process.env.DESKTOP) await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
await p.goto(`http://localhost:${process.env.PORT ?? 3018}/?debug${process.env.QS ?? ""}`);
await p.waitForFunction(() => window.street, { timeout: 900000 });
await new Promise((r) => setTimeout(r, Number(process.env.WAIT ?? 15) * 1000));
const cdp = await b.target().createCDPSession();
const events = [];
cdp.on("Tracing.dataCollected", (e) => events.push(...e.value));
const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
await cdp.send("Tracing.start", { traceConfig: { includedCategories: ["disabled-by-default-memory-infra"], memoryDumpConfig: { triggers: [] } } });
await new Promise((r) => setTimeout(r, 500));
await cdp.send("Tracing.requestMemoryDump");
await cdp.send("Tracing.end");
await done;
const names = {};
for (const e of events) if (e.ph === "M" && e.name === "process_labels" || (e.ph === "M" && e.name === "process_name")) names[e.pid] = (names[e.pid] ?? "") + " " + (e.args.name ?? e.args.labels);
for (const e of events) {
  if (e.ph !== "v" || !e.args?.dumps?.allocators) continue;
  const al = e.args.dumps.allocators;
  const size = (k) => parseInt(al[k]?.attrs?.size?.value ?? "0", 16) / 1e6;
  const tops = Object.keys(al).filter((k) => !k.includes("/") || /^(v8|gpu|skia|cc|partition_alloc|malloc|blink_gc|canvas|web_cache|discardable|shared_memory|sharedimagemanager|font_caches|media|java_heap|tracing)\/[^/]+$/.test(k) && /^(partition_alloc\/partitions|gpu\/gl|skia\/sk_glyph|v8\/main|v8\/workers|gpu\/shared_images|blink_gc\/main)/.test(k));
  const rows = tops.map((k) => [k, size(k)]).filter(([, v]) => v > 5).sort((a, b) => b[1] - a[1]);
  if (!rows.length) continue;
  console.log(`pid ${e.pid}${names[e.pid] ?? ""}: ` + rows.map(([k, v]) => `${k}=${v.toFixed(0)}`).join(" "));
  // the GPU's own allocations by kind (textures, buffers, renderbuffers...), summed over their leaves
  const kinds = {};
  for (const k of Object.keys(al)) {
    const m = k.match(/^gpu\/gl\/([a-z_]+)\/[^/]+$/);
    if (m) kinds[m[1]] = (kinds[m[1]] ?? 0) + size(k);
  }
  if (Object.keys(kinds).length) console.log("   gpu/gl by kind: " + Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v.toFixed(0)}`).join(" "));
}
if (process.env.KEYS) for (const e of events) if (e.ph === "v" && e.args?.dumps?.allocators) { const al = e.args.dumps.allocators; const ks = Object.keys(al).filter((k) => k.startsWith(process.env.KEYS)); const agg = {}; for (const k of ks) { const kk = k.split("/").slice(0, Number(process.env.DEPTH ?? 3)).join("/"); agg[kk] = (agg[kk] ?? 0) + parseInt(al[k]?.attrs?.size?.value ?? "0", 16) / 1e6; } console.log(Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + "=" + v.toFixed(0)).join("\n")); }
await b.close();
