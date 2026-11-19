// The permanent bench: node shots/bench/run.mjs [label] [only]
// Every screen of the city (the map, on foot, places; desk, laptop, phones and tablets either way, by day
// and by night), each screenshot audited (shots/bench/audit.mjs: overlaps, text out of its box, panels
// cut), every walk-in place opened (their code loads on entry), the ways in and out of a door, the doors'
// ways out, the boot on the production build (cold and warm), the frame rates.
// Needs nothing running: the bench's page server (shots/bench/vite.bench.mjs, port 3014) and the
// production-like server (shots/bench/prodserve.mjs on dist/, port 3015) are started if they are not up
// (build first: npx vite build). Shots land in captures/bench/<label>/, the audit in
// captures/bench/audit.log, a summary in <label>/summary.txt.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const label = process.argv[2] ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const only = process.argv[3] ?? "";
const OUT = `captures/bench/${label}`;
mkdirSync(OUT, { recursive: true });

const run = (name, args, env = {}) =>
  new Promise((done) => {
    const t0 = Date.now();
    const c = spawn("node", args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    c.stdout.on("data", (d) => (log += d));
    c.stderr.on("data", (d) => (log += d));
    c.on("close", (code) => done({ name, code, s: Math.round((Date.now() - t0) / 1000), log }));
  });
const upAt = (url) => fetch(url).then((r) => r.ok, () => false);
const startIfDown = async (url, cmd, args) => {
  if (await upAt(url)) return;
  const c = spawn(cmd, args, { stdio: "ignore", detached: true });
  c.unref();
  for (let k = 0; k < 60 && !(await upAt(url)); k++) await new Promise((r) => setTimeout(r, 500));
};
// (shared: several runs at once; the first one up serves them all and it is left running)
await startIfDown("http://localhost:3014/", "npx", ["vite", "--config", "shots/bench/vite.bench.mjs"]);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
if (existsSync("dist/index.html")) await startIfDown("https://localhost:3015/", "node", ["shots/bench/prodserve.mjs", "3015"]);
const PAGE = { BENCH_URL: "http://localhost:3014", URL: "http://localhost:3014/" };

const steps = [
  // THE CITY: the map, on foot and a place, by day and night, desk/laptop/phones/tablets: shots/bench/city.mjs
  ["city", ["shots/bench/city.mjs", `${OUT}/city`]],
  // every walk-in place entered once, a few frames each (their code loads on entry)
  ["places", ["shots/_allplaces.mjs", "http://localhost:3014/?capture&debug"]],
  // the walk in and out on foot, still by still; the map, Escape, a floor jump and the stadium's question
  ["e2e-enter", ["shots/_e2eenter.mjs", `${OUT}/e2eenter`, "museum"], { ...PAGE }],
  ["e2e-paths", ["shots/_e2epaths.mjs", `${OUT}/e2epaths`], { URL: "http://localhost:3014/" }],
  // every door's way out: free pavement in front, facing the street
  ["doors", ["shots/_doorsout.mjs", "http://localhost:3014/?debug"]],
  // rays on every mesh once the city's arrays are dropped, clicks over the map
  ["rays", ["shots/_raycheck.mjs", "http://localhost:3014/?debug"]],
  // the production build: the boot cold and warm, the frame rates (quick machine, then a 4× slower processor)
  ["boot-cold", ["shots/bench/opt.mjs", "boot", "cold", "fast", "2"]],
  ["boot-warm", ["shots/bench/opt.mjs", "boot", "warm", "fast", "2"]],
  ["fps", ["shots/bench/opt.mjs", "fps", "fast", "1"]],
  ["fps-slow", ["shots/bench/opt.mjs", "fps", "slow", "1"]],
].filter(([n]) => !only || only.split(",").some((o) => n.startsWith(o)));

const results = [];
for (const [name, args, env] of steps) {
  if (args[1] && args[1].startsWith(OUT)) mkdirSync(args[1], { recursive: true });
  process.stdout.write(`${name} … `);
  const r = await run(name, args, { ...PAGE, ...(env ?? {}) });
  results.push(r);
  const errors = (r.log.match(/errors?\s*[:=]?\s*(\[[^\]]*\])/g) ?? []).filter((e) => !/\[\s*\]/.test(e));
  const issues = r.log.match(/(\d+) with issues/g) ?? [];
  console.log(`${r.code === 0 ? "ran" : "EXIT " + r.code} in ${r.s}s ${issues.join(" ")} ${errors.length ? "ERRORS " + errors.join(" ") : ""}`);
  writeFileSync(`${OUT}/${name}.log`, r.log);
}
const summary = results.map((r) => `${r.name}: exit ${r.code}, ${r.s}s\n${r.log.split("\n").filter((l) => /fps|errors|SUMMARY|issues|blocked|differing|enter/.test(l)).slice(0, 40).join("\n")}`).join("\n\n");
writeFileSync(`${OUT}/summary.txt`, summary);
console.log(`\n${OUT}/summary.txt`);
