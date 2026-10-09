/**
 * ZK UNIVERSITY's courses: one JSON file per course in `university/courses/` (written by the
 * campus's AI professors and merged by pull request, or by hand), bundled at build time. Each
 * course carries its lesson text, the video's script (rendered by `university/video`, Remotion)
 * and the sources every claim comes from.
 */

export type Faculty = "basics" | "zksnarks" | "zcash" | "zakura" | "tachyon";
export type Level = "intro" | "core" | "deep";

export interface Source {
  title: string;
  url: string;
  /** A verbatim quote from the page that supports the course. */
  quote: string;
}

/** One scene of the course video (the Remotion kit draws each kind). `seconds` is optional. */
export type Scene =
  | { kind: "title"; kicker?: string; title: string; seconds?: number }
  | { kind: "say"; text: string; sub?: string; seconds?: number }
  | { kind: "analogy"; title: string; left: string; right: string; caption: string; seconds?: number }
  | { kind: "steps"; title: string; steps: string[]; seconds?: number }
  | { kind: "compare"; title: string; a: { label: string; points: string[] }; b: { label: string; points: string[] }; seconds?: number }
  | { kind: "number"; value: string; label: string; source: number; seconds?: number }
  | { kind: "quote"; source: number; seconds?: number }
  | { kind: "code"; title: string; lang: string; code: string; seconds?: number }
  | { kind: "quiz"; q: string; options: string[]; answer: number; seconds?: number }
  | { kind: "recap"; points: string[]; seconds?: number };

export interface Course {
  slug: string;
  title: string;
  subtitle: string;
  faculty: Faculty;
  level: Level;
  /** Video length, minutes (rounded). */
  minutes: number;
  /** The professor: a zkSNARK (collection id) and the name it teaches under. */
  prof: { snark: number; name: string };
  /** ISO date the course was published. */
  created: string;
  status: "draft" | "reviewed" | "verified";
  summary: string;
  /** The lesson, Markdown (headings, paragraphs, lists, code). */
  text: string;
  sources: Source[];
  quiz?: { q: string; options: string[]; answer: number; why: string }[];
  scenes: Scene[];
  /** The rendered video (mp4) and its poster frame, when there is one. */
  video?: string;
  poster?: string;
}

export const FACULTIES: Record<Faculty, { name: string; hall: string; color: string }> = {
  basics: { name: "Cryptography Basics", hall: "Lecture Hall", color: "#f4b728" },
  zksnarks: { name: "zkSNARKs", hall: "Lecture Hall", color: "#a78bfa" },
  zcash: { name: "Zcash", hall: "Lecture Hall", color: "#f4b728" },
  zakura: { name: "Zakura", hall: "Zakura Hall", color: "#fd6798" },
  tachyon: { name: "Tachyon", hall: "Tachyon Hall", color: "#f08a00" },
};

const files = import.meta.glob<Course>("../../university/courses/*.json", { eager: true, import: "default" });

/** Every course, newest first. */
export const COURSES: Course[] = Object.values(files)
  .filter((c) => c && c.slug && Array.isArray(c.scenes))
  .sort((a, b) => b.created.localeCompare(a.created));

export const coursesOf = (f: Faculty) => COURSES.filter((c) => c.faculty === f);

/** The video's URL (course JSON may give a path under the site, or a full URL). */
export const videoUrl = (c: Course) => c.video ?? null;
