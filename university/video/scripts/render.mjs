#!/usr/bin/env node
// Renders ZK UNIVERSITY course videos.
//   node scripts/render.mjs <slug|all>
// Reads ../courses/<slug>.json and writes ../../public/university/video/<slug>.mp4 + <slug>.jpg (poster, frame at 2 s).
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const coursesDir = path.resolve(root, "../courses");
const outDir = path.resolve(root, "../../public/university/video");

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/render.mjs <slug|all>");
  process.exit(1);
}
const slugs = arg === "all" ? readdirSync(coursesDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")) : [arg.replace(/\.json$/, "")];
mkdirSync(outDir, { recursive: true });

console.log("Bundling…");
const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public") });

for (const slug of slugs) {
  const course = JSON.parse(readFileSync(path.join(coursesDir, `${slug}.json`), "utf8"));
  const composition = await selectComposition({ serveUrl, id: "Course", inputProps: course });
  const secs = (composition.durationInFrames / composition.fps).toFixed(1);
  const mp4 = path.join(outDir, `${slug}.mp4`);
  const jpg = path.join(outDir, `${slug}.jpg`);
  console.log(`${slug}: ${composition.durationInFrames} frames (${secs} s)`);
  let last = -1;
  await renderMedia({
    serveUrl,
    composition,
    inputProps: course,
    codec: "h264",
    crf: 23,
    imageFormat: "jpeg",
    jpegQuality: 92,
    outputLocation: mp4,
    onProgress: ({ progress }) => {
      const p = Math.floor(progress * 10);
      if (p !== last) {
        last = p;
        process.stdout.write(` ${p * 10}%`);
      }
    },
  });
  console.log(`\n  → ${mp4}`);
  await renderStill({ serveUrl, composition, inputProps: course, frame: Math.min(composition.durationInFrames - 1, 2 * composition.fps), imageFormat: "jpeg", jpegQuality: 88, output: jpg });
  console.log(`  → ${jpg}`);
}
