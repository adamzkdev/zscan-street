import * as THREE from "three";
import { campusFeed, campusNow, onCampusFeed, type CampusFeed } from "../../data/campusfeed";
import { FACULTIES, type Course } from "../../data/university";
import type { PickInfo } from "../types";
import { marbleTex, Surface, type SkyKit } from "../zktowers/kit";
import { esc, fitText } from "../wallettower/shared";
import { commitRows, drawCatalogue, drawCourseCard, drawFeedBoard, drawSources, levelName, postRows, releaseRows } from "./draw";
import { CourseScreen } from "./screen";
import { logoBanner, logoSign, type Mark } from "./logos";
import { LIFT, SAND, WOOD, WOOD_DK } from "./style";
import { frontWallAndStairs } from "./stairs";

/**
 * A lecture hall: you come in at the top, on a landing with the lifts, behind a rail that carries
 * the hall's courses as cards (click one: it plays on the big screen); six tiers of benches step
 * down to the stage, where the professor stands at the lectern between two chalkboards (the
 * course's key points and a question from its quiz) and under the screen. The side walls carry
 * the hall's live walls: the syllabus and its sources (Theory), Zakura's releases and news, or
 * Tachyon's posts and commits, read from their sites and GitHub.
 */

export interface HallSpec {
  f: number;
  name: string;
  /** Shown over the screen. */
  sign: string;
  color: string;
  courses: () => Course[];
  /** The side walls. */
  live: "theory" | "zakura" | "tachyon";
  /** Students' zkSNARK ids. */
  seed: number;
  /** The project whose hall this is: its logo over the screen, its banners either side. */
  mark?: Mark;
}

const X0 = -14,
  X1 = 14,
  Z0 = -30,
  Z1 = 0,
  H = 9;
/** The landing's depth, the tiers' depth and rise, the stage's floor. */
const LAND = 7.6,
  ROW = 1.8,
  ROWS = 6,
  RISE = 0.38;
const STAGE = -(ROWS + 1) * RISE;
const rowZ = (r: number) => -LAND - r * ROW; // the row's top edge (nearest the landing)
const rowH = (r: number) => -(r + 1) * RISE;
const STAGE_Z = rowZ(ROWS);

export function lectureHall(k: SkyKit, s: HallSpec) {
  const { f } = s;
  const y0 = k.y(f);

  // ---- the room: stone walls, wood panelling, coffered ceiling ---------------------------------------
  const floorMat = new THREE.MeshStandardMaterial({ map: marbleTex(70 + f, "#d9c49c", "#c2a878", 512, 4, 3, 3, "rgba(80,60,30,0.3)"), roughness: 0.5 });
  k.flat(f, X1 - X0, LAND, floorMat, 0, -LAND / 2);
  k.flat(f, X1 - X0, STAGE_Z - Z0, new THREE.MeshStandardMaterial({ color: "#3a2416", roughness: 0.45 }), 0, (STAGE_Z + Z0) / 2, STAGE + 0.005);
  const WALL_H = H - STAGE;
  k.wall(f, X0, Z0, X1, Z0, WALL_H, SAND, "matte", 0.4, STAGE);
  k.wall(f, X0, Z0, X0, Z1, WALL_H, SAND, "matte", 0.4, STAGE);
  k.wall(f, X1, Z0, X1, Z1, WALL_H, SAND, "matte", 0.4, STAGE);
  // the front wall: no door upstairs, the stairs right of where it was
  frontWallAndStairs(k, f, { x0: X0, x1: X1, z: Z1, h: WALL_H, y: STAGE, top: 5 });
  // wainscot round the walls, a frieze of the hall's colour under the ceiling
  for (const [x, z, w, d] of [
    [0, Z0 + 0.25, X1 - X0, 0.1],
    [X0 + 0.25, (Z0 + Z1) / 2, 0.1, Z1 - Z0],
    [X1 - 0.25, (Z0 + Z1) / 2, 0.1, Z1 - Z0],
  ] as const) {
    k.box(f, w, 1.3 - STAGE, d, x, STAGE, z, WOOD);
    k.box(f, w, 0.18, d, x, H - 0.6, z, s.color, "glow");
  }
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H, (Z0 + Z1) / 2, WOOD_DK);
  for (let x = X0 + 3.5; x < X1; x += 3.5) k.box(f, 0.3, 0.45, Z1 - Z0, x, H - 0.45, (Z0 + Z1) / 2, WOOD);
  for (let z = Z0 + 3; z < Z1; z += 3) k.box(f, X1 - X0, 0.45, 0.3, 0, H - 0.45, z, WOOD);

  // ---- the tiers: six steps of benches down to the stage, aisles in the middle and on the sides --------------
  k.box(f, X1 - X0, -STAGE, LAND, 0, STAGE, -LAND / 2, "#bfa77d");
  for (let r = 0; r < ROWS; r++) {
    const zc = rowZ(r) - ROW / 2;
    const h = rowH(r);
    k.box(f, X1 - X0, h - STAGE, ROW, 0, STAGE, zc, r % 2 ? WOOD : "#5a3a24", "polish");
    k.box(f, X1 - X0, 0.04, 0.06, 0, h, rowZ(r) - 0.03, s.color, "glow");
    // the benches: seat, back and desk, two per row (the aisles stay clear)
    for (const [a, b] of [
      [-12, -1.1],
      [1.1, 12],
    ]) {
      const w = b - a,
        x = (a + b) / 2;
      const bz = rowZ(r) - ROW + 0.45;
      k.box(f, w, 0.08, 0.5, x, h + 0.42, bz, "#6b4228", "polish");
      k.box(f, w, 0.5, 0.06, x, h + 0.5, bz + 0.25, "#5a3a24", "polish");
      k.box(f, w, 0.42, 0.06, x, h, bz - 0.22, "#3a2416");
      // the desk in front of the bench behind (on this tier's front edge)
      k.box(f, w, 0.05, 0.36, x, h + 0.78, rowZ(r) - 0.22, "#7a4e30", "polish");
      k.box(f, w, 0.74, 0.05, x, h + 0.04, rowZ(r) - 0.04, "#4a2f1e");
      k.solid(f, a, bz - 0.3, b, bz + 0.3);
      k.solid(f, a, rowZ(r) - 0.42, b, rowZ(r));
    }
  }
  k.grounds[f].push((x, z) => {
    if (z > -LAND || x < X0 || x > X1 || z < Z0) return null;
    if (z <= STAGE_Z) return y0 + STAGE;
    const r = Math.min(ROWS - 1, Math.floor((-LAND - z) / ROW));
    return y0 + rowH(r);
  });

  // ---- the rail and the course cards on it ------------------------------------------------------------------
  for (const [a, b] of [
    [X0 + 0.4, -1.0],
    [1.0, X1 - 0.4],
  ]) {
    k.box(f, b - a, 0.96, 0.12, (a + b) / 2, 0, -LAND + 0.06, "#4a2f1e", "polish");
    k.box(f, b - a, 0.06, 0.3, (a + b) / 2, 0.96, -LAND + 0.06, s.color, "metal");
    k.solid(f, a, -LAND - 0.1, b, -LAND + 0.25);
  }
  const screen = new CourseScreen(s.name, s.color);
  const CARDS = 8;
  const cards = Array.from({ length: CARDS }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    const x = side * (1.75 + Math.floor(i / 2) * 1.3);
    const surf = new Surface(512, 320, 1.05);
    // a small card standing on the rail's ledge, leaning back, like a museum label
    const mesh = k.plane(f, 1.12, 0.7, surf.mat, x, 1.32, -LAND + 0.16, -0.35);
    let course: Course | null = null;
    k.hit(f, 1.15, 0.8, 0.4, x, 0.95, -LAND + 0.16, `<b>Course</b><span>click to play it on the screen</span>`, () => {
      if (!course) return null;
      screen.select(course);
      redrawCards();
      redrawBoards();
      return courseInfo(course);
    });
    return {
      set(c: Course | null) {
        course = c;
        mesh.visible = !!c || i === 0;
        surf.draw((g, W, Hh) => drawCourseCard(g, W, Hh, c, !!c && screen.current === c));
      },
    };
  });
  const redrawCards = () => {
    const list = s.courses();
    cards.forEach((c, i) => c.set(list[i] ?? null));
  };

  // ---- the stage: the screen, the chalkboards, the lectern ----------------------------------------------------
  const SW = 11,
    SH = 6.19,
    SY = STAGE + 1.4;
  k.box(f, SW + 0.5, SH + 0.5, 0.2, 0, SY - 0.25, Z0 + 0.35, "#14110d", "polish");
  k.plane(f, SW, SH, screen.mat, 0, SY + SH / 2, Z0 + 0.47);
  k.label(f, s.sign, 0, SY + SH + 0.75, Z0 + 0.5, { h: 0.42, color: s.color });
  if (s.mark) {
    logoSign(k, f, s.mark, 6.4, 1.9, 0, SY + SH + 2.35, Z0 + 0.5, 0, "#2a1d12");
    const line = s.mark === "zakura" ? "the Zcash node\nzakura.com" : "scaling Zcash\ntachyon.z.cash";
    logoBanner(k, f, s.mark, -9.6, 5.9, Z0 + 0.55, 0, line);
    logoBanner(k, f, s.mark, 9.6, 5.9, Z0 + 0.55, 0, line);
    // and over the landing, facing you as you come in from the lifts
    logoBanner(k, f, s.mark, -12.9, 4.6, -11.5, Math.PI / 2, line, 2.0, 4.4);
    logoBanner(k, f, s.mark, 12.9, 4.6, -11.5, -Math.PI / 2, line, 2.0, 4.4);
  }
  k.hit(f, SW, SH, 0.3, 0, SY, Z0 + 0.6, `<b>${esc(s.name)}</b><span>the lecture on the screen</span>`, () => (screen.current ? courseInfo(screen.current) : null));
  const boardL = new Surface(1024, 768, 1.0);
  const boardR = new Surface(1024, 768, 1.0);
  for (const [b, x] of [
    [boardL, -9.6],
    [boardR, 9.6],
  ] as const) {
    k.box(f, 4.4, 3.4, 0.12, x, SY + 0.6, Z0 + 0.3, "#5a3a24", "polish");
    k.plane(f, 4.1, 3.08, b.mat, x, SY + 0.6 + 1.7, Z0 + 0.38);
    k.box(f, 4.2, 0.08, 0.2, x, SY + 0.55, Z0 + 0.45, "#5a3a24");
  }
  const redrawBoards = () => {
    const c = screen.current;
    boardL.draw((g, W, Hh) => drawChalk(g, W, Hh, "Key points", keyPoints(c)));
    boardR.draw((g, W, Hh) => drawChalk(g, W, Hh, "Question", c?.quiz?.[0] ? [c.quiz[0].q, ...c.quiz[0].options.map((o, i) => `${"ABCD"[i]}. ${o}`)] : []));
  };
  // the lectern
  k.box(f, 1.3, 1.15, 0.8, -6.5, STAGE, -22.6, "#4a2f1e", "polish");
  k.box(f, 1.45, 0.08, 0.95, -6.5, STAGE + 1.15, -22.6, s.color, "metal");
  k.solid(f, -7.2, -23.05, -5.8, -22.15);
  k.ticks[f].push(() => screen.tick());
  k.solid(f, X0, Z0, X1, Z0 + 0.8);

  // ---- the live walls --------------------------------------------------------------------------------------
  const wallL = new Surface(1024, 640, 1.0);
  const wallR = new Surface(1024, 640, 1.0);
  const BW = 9.6,
    BH = 6.0,
    BZ = -16,
    BY = -1.2;
  for (const [b, x, ry] of [
    [wallL, X0 + 0.32, Math.PI / 2],
    [wallR, X1 - 0.32, -Math.PI / 2],
  ] as const) {
    k.box(f, 0.1, BH + 0.3, BW + 0.3, x + Math.sign(x) * 0.08, BY - 0.15, BZ, "#3a2416", "polish");
    k.plane(f, BW, BH, b.mat, x, BY + BH / 2, BZ, 0, ry);
  }
  const fillLive = (feed: CampusFeed | null) => {
    const list = s.courses();
    if (s.live === "theory") {
      wallL.draw((g, W, Hh) => drawCatalogue(g, W, Hh, list));
      wallR.draw((g, W, Hh) => drawSources(g, W, Hh, list, "#c8962e"));
    } else if (s.live === "zakura") {
      wallL.draw((g, W, Hh) => drawFeedBoard(g, W, Hh, "Releases", "zakura · github.com/zakura-core · live", s.color, releaseRows(feed?.zakura.releases ?? []), "Reading the releases…"));
      wallR.draw((g, W, Hh) => drawFeedBoard(g, W, Hh, "Announcements", "zakura.com · live", s.color, postRows(feed?.zakura.posts ?? []), "Reading zakura.com…"));
    } else {
      wallL.draw((g, W, Hh) => drawFeedBoard(g, W, Hh, "From the blog", "tachyon.z.cash · live", s.color, postRows(feed?.tachyon.posts ?? []), "Reading tachyon.z.cash…"));
      wallR.draw((g, W, Hh) => drawFeedBoard(g, W, Hh, "Commits", "ragu · tachyon · github.com/tachyon-zcash · live", s.color, commitRows(feed?.tachyon.commits ?? []), "Reading GitHub…"));
    }
  };
  const liveInfo = (side: "l" | "r"): PickInfo | null => {
    const feed = campusNow();
    if (s.live === "theory") return side === "l" ? { eyebrow: s.name, title: "Syllabus", body: s.courses().map((c) => `<p><b>${esc(c.title)}</b><br>${esc(levelName(c))} · ${c.minutes} min · ${esc(c.prof.name)}</p>`).join("") } : sourcesInfo(s.name, s.courses());
    const rows: { t: string; d: string; u: string }[] =
      s.live === "zakura"
        ? side === "l"
          ? (feed?.zakura.releases ?? []).map((r) => ({ t: r.name, d: `${r.tag} · ${r.date}`, u: r.url }))
          : (feed?.zakura.posts ?? []).map((p) => ({ t: p.title, d: p.date, u: p.url }))
        : side === "l"
          ? (feed?.tachyon.posts ?? []).map((p) => ({ t: p.title, d: p.date, u: p.url }))
          : (feed?.tachyon.commits ?? []).map((c) => ({ t: c.message, d: `${c.repo} · ${c.sha} · ${c.date}`, u: c.url }));
    const title = s.live === "zakura" ? (side === "l" ? "Zakura releases" : "Zakura announcements") : side === "l" ? "The Tachyon blog" : "Tachyon & Ragu commits";
    return { eyebrow: `${s.name} · live`, title, body: rows.length ? rows.slice(0, 10).map((r) => `<p><a href="${esc(r.u)}" target="_blank" rel="noopener"><b>${esc(r.t)}</b></a><br><span style="opacity:.7">${esc(r.d)}</span></p>`).join("") : "<p>Loading…</p>" };
  };
  k.hit(f, 0.3, BH, BW, X0 + 0.45, BY, BZ, `<b>${s.live === "theory" ? "Syllabus" : s.live === "zakura" ? "Releases" : "Blog"}</b><span>click for the list</span>`, () => liveInfo("l"));
  k.hit(f, 0.3, BH, BW, X1 - 0.45, BY, BZ, `<b>${s.live === "theory" ? "Sources" : s.live === "zakura" ? "Announcements" : "Commits"}</b><span>click for the list</span>`, () => liveInfo("r"));

  // ---- light, lifts, people -------------------------------------------------------------------------------------
  k.lifts(f, X0 + 0.2, -3.8, Math.PI / 2, LIFT);
  k.light(f, 0, 5.4, -24, "#fff1d6", 13, 22);
  k.light(f, -7, 2.4, -23, s.color, 6, 9);
  k.light(f, -6, 6, -12, "#ffe2b8", 14, 18);
  k.light(f, 6, 6, -12, "#ffe2b8", 14, 18);
  k.light(f, 0, 4.5, -3.5, "#fff1d6", 10, 12);

  const fill = () => {
    const list = s.courses();
    if (!screen.current && list[0]) screen.select(list[0]);
    redrawCards();
    redrawBoards();
    fillLive(campusNow());
  };
  fill();
  void document.fonts?.ready.then(fill);
  onCampusFeed(() => fillLive(campusNow()));
  k.arrive[f].push(() => void campusFeed());

  k.onCast(f, () => {
    const c = () => screen.current ?? s.courses()[0] ?? null;
    const prof = s.courses()[0]?.prof;
    void k.person(f, prof?.snark ?? s.seed, [-6.5, -23.6], prof?.name ?? "Professor", {
      dy: STAGE,
      face: [0.3, 1],
      near: 14,
      lines: [
        () => (c() ? `Today: "${c()!.title}". Find a seat.` : "The first lecture is being prepared."),
        () => (c() ? sentence(c()!.summary, 0) : "Every claim in this hall comes with its source."),
        () => (c() ? sentence(c()!.summary, 1) || `${c()!.sources.length} sources behind this lecture. Check them.` : "Ask me anything."),
        () => (c()?.quiz?.[0] ? `Quick question: ${c()!.quiz![0].q}` : "Pick a course on the rail at the top."),
        "Pick a course on the rail at the top. The lesson's text is in the Library, on 4.",
      ],
    });
    const seats: [number, number][] = [
      [-8, 1],
      [-3.5, 2],
      [4.2, 1],
      [9, 3],
      [-6, 4],
      [2.6, 4],
    ];
    seats.forEach(([x, r], i) => {
      const bz = rowZ(r) - ROW + 0.45;
      void k.person(f, s.seed + 11 + i * 37, [x, bz], "Student", { sit: true, dy: rowH(r) + 0.42, face: [0, -1], lines: i === 1 ? ["Shh, it's starting.", "I'm taking notes for the quiz."] : i === 3 ? ["The sources are on the side wall. I checked two."] : undefined });
    });
  });

  return { screen, refresh: fill };
}

/** The course's points for the chalkboard: its recap scene, else its lesson's headings. */
function keyPoints(c: Course | null): string[] {
  if (!c) return [];
  const recap = c.scenes.find((x) => x.kind === "recap");
  if (recap && recap.kind === "recap") return recap.points;
  return [...c.text.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1]).slice(0, 6);
}

const sentence = (t: string, i: number) => (t.match(/[^.!?]+[.!?]+/g) ?? [t])[i]?.trim() ?? "";

function drawChalk(g: CanvasRenderingContext2D, W: number, H: number, title: string, lines: string[]) {
  g.fillStyle = "#1f3a2c";
  g.fillRect(0, 0, W, H);
  // chalk dust
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(255,255,255,${0.02 + (i % 7) * 0.006})`;
    g.fillRect((i * 9973) % W, (i * 7919) % H, 30 + (i % 40), 2);
  }
  g.fillStyle = "#f4f0e0";
  g.font = `700 54px "Caveat", "Chalkboard SE", "Comic Sans MS", cursive`;
  g.textBaseline = "top";
  g.fillText(title, 48, 40);
  g.fillRect(48, 108, Math.min(W - 96, g.measureText(title).width + 20), 4);
  let y = 140;
  for (const l of lines.slice(0, 6)) {
    if (y > H - 70) break;
    g.fillStyle = "#f4f0e0";
    y += fitText(g, `• ${l}`, 48, y, W - 96, H - y - 30, (px) => `600 ${px}px "Caveat", "Chalkboard SE", "Comic Sans MS", cursive`, [40, 34, 30], 1.2) + 14;
  }
}

/** The info panel for a course. */
export function courseInfo(c: Course): PickInfo {
  const fac = FACULTIES[c.faculty];
  return {
    eyebrow: `ZK University · ${fac.name}`,
    title: c.title,
    tag: [c.status === "verified" ? "Verified" : c.status === "reviewed" ? "Sources reviewed" : "Draft", c.status === "draft" ? "warn" : "ok"],
    stats: [
      ["Level", levelName(c)],
      ["Length", `${c.minutes} min`],
      ["Professor", c.prof.name],
      ["Sources", String(c.sources.length)],
    ],
    body: `<p>${esc(c.summary)}</p><p style="opacity:.75">Read the whole lesson in the Library (floor 4).</p>${c.sources
      .slice(0, 6)
      .map((s) => `<p><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></p>`)
      .join("")}`,
  };
}

export function sourcesInfo(eyebrow: string, list: Course[]): PickInfo {
  const seen = new Map<string, string>();
  for (const c of list) for (const s of c.sources) if (!seen.has(s.url)) seen.set(s.url, s.title);
  return { eyebrow, title: "Sources", body: [...seen].map(([u, t]) => `<p><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></p>`).join("") || "<p>No course here yet.</p>" };
}

