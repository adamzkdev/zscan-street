import { coursesOf, COURSES, FACULTIES } from "../../data/university";
import type { Interior, InteriorContext } from "../types";
import { SkyKit, type Level } from "../zktowers/kit";
import { lectureHall } from "./hall";
import { hashSmashHall } from "./hashsmash";
import { library } from "./library";
import { mainQuad } from "./quad";

/**
 * ZK UNIVERSITY (the campus by the city works): the Main Quad hall and its catalogue on G, the
 * Lecture Hall on 1 (cryptography basics, zkSNARKs, Zcash), Zakura Hall on 2 and Tachyon Hall on
 * 3 (each with its own courses and its team's live walls), the Library on 4 where every lesson is
 * read, HashSmash Hall on 5 (the race to break hash functions, Orchard's Poseidon among them, live). Courses are university/courses/*.json; videos are rendered from them (university/video).
 */
export const LEVELS: Level[] = [
  { label: "G", name: "Main Quad · the catalogue", y: 0, spawn: [0, -2.6], yaw: 0 },
  { label: "1", name: "Lecture Hall · theory", y: 20, spawn: [0, -2.6], yaw: 0 },
  { label: "2", name: "Zakura Hall", y: 40, spawn: [0, -2.6], yaw: 0 },
  { label: "3", name: "Tachyon Hall", y: 60, spawn: [0, -2.6], yaw: 0 },
  { label: "4", name: "The Library", y: 80, spawn: [0, -2.6], yaw: 0 },
  { label: "5", name: "HashSmash Hall · hash collisions, live", y: 100, spawn: [0, -2.6], yaw: 0 },
];

export function buildUniversity(ctx: InteriorContext): Interior {
  const k = new SkyKit(ctx, LEVELS, "ZK UNIVERSITY", { bg: "#14110d" });
  k.scene.environmentIntensity = 0.35;
  mainQuad(k);
  const theory = () => COURSES.filter((c) => c.faculty === "basics" || c.faculty === "zksnarks" || c.faculty === "zcash");
  const halls = [
    lectureHall(k, { f: 1, name: "Lecture Hall", sign: "THEORY · CRYPTOGRAPHY · ZKSNARKS · ZCASH", color: "#e2b448", courses: theory, live: "theory", seed: 7600 }),
    lectureHall(k, { f: 2, name: "Zakura Hall", sign: "ZAKURA HALL · THE NODE", color: FACULTIES.zakura.color, courses: () => coursesOf("zakura"), live: "zakura", seed: 7700, mark: "zakura" }),
    lectureHall(k, { f: 3, name: "Tachyon Hall", sign: "TACHYON HALL · SCALING ZCASH", color: FACULTIES.tachyon.color, courses: () => coursesOf("tachyon"), live: "tachyon", seed: 7800, mark: "tachyon" }),
  ];
  library(k);
  hashSmashHall(k, 5);
  const interior = k.interior("university", 12);
  // tests (?debug): what each hall's screen shows
  (window as unknown as { __uni?: unknown }).__uni = { screens: () => halls.map((h) => h.screen.debug) };
  return interior;
}
