import type { Course, Scene } from "./types";

export const FPS = 30;
export const CLOSING_SECONDS = 7;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Default length of a scene, seconds (a scene's own `seconds` wins). Tuned for comfortable reading. */
export const defaultSeconds = (s: Scene, course: Course): number => {
  switch (s.kind) {
    case "title":
      return 5;
    case "say":
      return clampN(3 + (words(s.text) + words(s.sub ?? "")) * 0.33, 5, 12);
    case "analogy":
      return clampN(4 + words(s.left + " " + s.right + " " + s.caption) * 0.22, 8, 14);
    case "steps":
      return clampN(3 + s.steps.length * 2.4, 7, 16);
    case "compare":
      return clampN(4 + (s.a.points.length + s.b.points.length) * 1.5, 8, 14);
    case "number":
      return 6;
    case "quote":
      return clampN(4 + words(course.sources[s.source]?.quote ?? "") * 0.3, 7, 13);
    case "code":
      return 9;
    case "quiz":
      return 10;
    case "recap":
      return clampN(3 + s.points.length * 2, 7, 14);
  }
};

export const sceneFrames = (s: Scene, course: Course) => Math.round((s.seconds ?? defaultSeconds(s, course)) * FPS);

export const timeline = (course: Course) => {
  let at = 0;
  const scenes = course.scenes.map((s) => {
    const dur = sceneFrames(s, course);
    const item = { scene: s, from: at, dur };
    at += dur;
    return item;
  });
  const closing = { from: at, dur: CLOSING_SECONDS * FPS };
  return { scenes, closing, total: at + closing.dur };
};
