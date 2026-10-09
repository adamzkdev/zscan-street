// Local copy of the course schema (authoritative version: streetv2/src/data/university.ts).
// Kept here so the video kit stays self-contained (it runs on its own in CI).

export type Faculty = "basics" | "zksnarks" | "zcash" | "zakura" | "tachyon";
export type Level = "intro" | "core" | "deep";

export interface Source {
  title: string;
  url: string;
  quote: string;
}

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

export type Course = {
  slug: string;
  title: string;
  subtitle: string;
  faculty: Faculty;
  level: Level;
  minutes: number;
  prof: { snark: number; name: string };
  created: string;
  status: "draft" | "reviewed" | "verified";
  summary: string;
  text: string;
  sources: Source[];
  quiz?: { q: string; options: string[]; answer: number; why: string }[];
  scenes: Scene[];
  video?: string;
  poster?: string;
};

export const FACULTIES: Record<Faculty, { name: string; color: string }> = {
  basics: { name: "Cryptography Basics", color: "#f4b728" },
  zksnarks: { name: "zkSNARKs", color: "#a78bfa" },
  zcash: { name: "Zcash", color: "#f4b728" },
  zakura: { name: "Zakura", color: "#fd6798" },
  tachyon: { name: "Tachyon", color: "#f08a00" },
};

export const LEVELS: Record<Level, string> = { intro: "Intro", core: "Core", deep: "Deep dive" };

export const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** The projects' own marks (zakura.com, tachyon.z.cash), shown on their faculties' courses. */
export const LOGOS: Partial<Record<Faculty, { mark: string; word?: string }>> = {
  zakura: { mark: "logos/zakura-flower.svg", word: "logos/zakura-text.svg" },
  tachyon: { mark: "logos/tachyon.png" },
};
