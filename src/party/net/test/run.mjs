// The lockstep tests in Node (V8) and in the `jsc` shell (JavaScriptCore, Safari's engine), from one
// bundle, then the two compared checksum for checksum:
//   node src/party/net/test/run.mjs [quick|full]
// Bundles to node_modules/.cache/nettest/ (rolldown, Vite's bundler). Exit code 0: all good.
import { rolldown } from "rolldown";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const outDir = path.join(root, "node_modules/.cache/nettest");
fs.mkdirSync(outDir, { recursive: true });
const JSC = ["/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc", "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"].find((p) => fs.existsSync(p));

const mode = process.argv[2] ?? "full";
// (the suites live in suite.ts; this reads them from there)
const SUITES = { full: "full", quick: "quick" };
if (!SUITES[mode]) throw new Error(`run.mjs [quick|full]`);

const bundle = await rolldown({
  input: path.join(here, "entry.ts"),
  platform: "neutral",
  logLevel: "silent",
  transform: { define: { "import.meta.env": JSON.stringify({ DEV: false, BASE_URL: "/" }) } },
});
const file = path.join(outDir, "nettest.js");
await bundle.write({ file, format: "iife" });
const prelude = path.join(outDir, `prelude-${mode}.js`);
fs.writeFileSync(prelude, `globalThis.NETTEST_MODE = ${JSON.stringify(mode)};\n`);

function run(engine) {
  const t0 = Date.now();
  let txt;
  if (engine === "node") {
    const one = path.join(outDir, `nettest-${mode}.cjs`);
    fs.writeFileSync(one, `${fs.readFileSync(prelude, "utf8")}\n${fs.readFileSync(file, "utf8")}`);
    txt = execFileSync(process.execPath, [one], { maxBuffer: 1 << 28, encoding: "utf8" });
  }
  else txt = execFileSync(JSC, [prelude, file], { maxBuffer: 1 << 28, encoding: "utf8" });
  const lines = txt.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
  return { lines, secs: (Date.now() - t0) / 1000 };
}

const results = {};
for (const engine of ["node", ...(JSC ? ["jsc"] : [])]) {
  const r = run(engine);
  results[engine] = r.lines;
  console.log(`\n== ${engine} (${r.secs.toFixed(1)} s)`);
  for (const l of r.lines) {
    if (l.test === "lockstep") {
      console.log(`lockstep ${l.clients} clients, ${l.level}: ${l.ok ? "OK" : "FAIL"} · ${l.simSecs} s of play · ${l.hashes} checksums each, digest ${l.digest} · ${l.messages} relayed`);
      for (const c of l.clientsReport) console.log(`   client ${c.seat}: ${c.ticks} ticks, ${c.checks} checks matched, ${c.desyncs} desyncs, order ${c.order} (host's ${c.authority}), stalls ${c.stalls} (max ${c.maxStallMs} ms), delay ${c.delay}, rtt ${c.rtt}, ${c.simMsPerTick} ms/tick`);
      for (const p of l.problems) console.log(`   PROBLEM: ${p}`);
    } else if (l.test === "rerun") console.log(`rerun ${l.clients} clients, ${l.level}: ${l.same ? "IDENTICAL" : "DIFFERENT"} (${l.hashes} checksums, ${l.digestA} / ${l.digestB})`);
    else if (l.test === "native-control") console.log(`control on the engine's own maths, ${l.clients} clients, ${l.level}: ${l.ok ? "clients agree" : "clients disagree"}, digest ${l.digest}`);
    else if (l.test === "cost") console.log(`cost (coins, 4 AIs, ${l.ticks} ticks): native ${l.nativeMsPerTick} ms/tick, deterministic ${l.detMsPerTick} ms/tick (×${l.ratio})`);
    else if (l.test === "detcheck") {
      console.log(`maths vs the engine's own (${l.rows[0].n} inputs each; digest of every det result ${l.digest}):`);
      for (const r of l.rows) console.log(`   ${r.fn.padEnd(6)} same bits ${(r.same * 100).toFixed(1).padStart(5)} %, worst ${r.maxUlps} ulp, ${r.detNs} ns vs ${r.nativeNs} ns native${r.edgeOff.length ? ` · EDGE: ${r.edgeOff.join("; ")}` : ""}`);
    } else if (l.test === "done") console.log(`all ${l.ok ? "OK" : "FAILED"}`);
  }
}
let same = true;
if (results.jsc) {
  console.log("\n== V8 vs JavaScriptCore");
  const key = (l) => `${l.test} ${l.clients ?? ""} ${l.level ?? ""}`;
  for (const a of results.node) {
    if (!("digest" in a)) continue;
    const b = results.jsc.find((x) => key(x) === key(a));
    const eq = b && b.digest === a.digest;
    if (a.test !== "native-control") same &&= !!eq;
    console.log(`${key(a).padEnd(32)} node ${a.digest}  jsc ${b?.digest ?? "-"}  ${eq ? "IDENTICAL" : a.test === "native-control" ? "differ (expected without the patches)" : "DIFFERENT"}`);
  }
} else console.log("\n(no jsc shell found: the cross-engine comparison did not run)");
const ok = Object.values(results).every((ls) => ls.find((l) => l.test === "done")?.ok) && same;
console.log(`\n${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
