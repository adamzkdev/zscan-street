// node shots/_bootjs.mjs [dist]: the JavaScript a visitor downloads before the city can open: the
// entry chunk (index.html's module), the app's main chunk it imports, and every chunk those import
// statically (dynamic imports, the walk-in places', load later). Raw and gzip sizes.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
const DIST = process.argv[2] ?? "dist";
const A = join(DIST, "assets");
const html = readFileSync(join(DIST, "index.html"), "utf8");
const entry = html.match(/<script type="module"[^>]*src="\/assets\/([^"]+)"/)[1];
const main = readdirSync(A).find((f) => /^main-.*\.js$/.test(f));
const seen = new Set();
const walk = (f) => {
  if (seen.has(f)) return;
  seen.add(f);
  const src = readFileSync(join(A, f), "utf8");
  // static imports only: `import{a}from"./x.js"`, `import"./x.js"`, `export{a}from"./x.js"`
  for (const m of src.matchAll(/(?:^|[;}\s])(?:import|export)\s*(?:[\w${},*\s]+?\s*from\s*)?["']\.\/([^"']+\.js)["']/g)) walk(m[1]);
};
walk(entry);
if (main) walk(main);
let raw = 0,
  gz = 0;
const rows = [];
for (const f of seen) {
  const b = readFileSync(join(A, f));
  const g = gzipSync(b, { level: 9 }).length;
  raw += b.length;
  gz += g;
  rows.push([f, b.length, g]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [f, r, g] of rows.slice(0, 12)) console.log(`  ${f.padEnd(40)} ${(r / 1024).toFixed(0).padStart(6)} kB  gzip ${(g / 1024).toFixed(0).padStart(5)} kB`);
console.log(`boot JS: ${seen.size} chunks, ${(raw / 1024 / 1024).toFixed(2)} MB, gzip ${(gz / 1024 / 1024).toFixed(2)} MB`);
