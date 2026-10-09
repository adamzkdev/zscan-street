import type { Commit, Post, Release } from "../../data/campusfeed";
import { FACULTIES, type Course } from "../../data/university";
import { fitText, wrap } from "../wallettower/shared";
import { MONO, SANS, SERIF } from "../zktowers/kit";

/**
 * ZK UNIVERSITY's boards, drawn on canvas: the catalogue, the directory, the course cards on the
 * halls' rails, the big screen's title card, the live walls (Zakura's releases and news, Tachyon's
 * posts, both teams' commits), the sources. Paper and ink, a serif for titles, the faculty's colour.
 */

export const PAPER = "#f4ead6";
export const INK = "#2a1d12";
export const MUTED = "#7a6a58";
export const RULE = "rgba(42,29,18,0.18)";
export const GOLD = "#c8962e";

const serif = (w: number) => (px: number) => `${w} ${px}px ${SERIF}`;
const sans = (w: number) => (px: number) => `${w} ${px}px ${SANS}`;
const mono = (w: number) => (px: number) => `${w} ${px}px ${MONO}`;

const LEVEL: Record<Course["level"], string> = { intro: "Introductory", core: "Core", deep: "Advanced" };
export const levelName = (c: Course) => LEVEL[c.level];

/** A paper ground with a thin double frame and a header band in the faculty's colour. */
function sheet(g: CanvasRenderingContext2D, W: number, H: number, title: string, kicker: string, color: string, dark = false) {
  g.fillStyle = dark ? "#14110d" : PAPER;
  g.fillRect(0, 0, W, H);
  const s = W / 1024;
  g.strokeStyle = dark ? "rgba(244,234,214,0.35)" : RULE;
  g.lineWidth = 2 * s;
  g.strokeRect(14 * s, 14 * s, W - 28 * s, H - 28 * s);
  g.strokeRect(20 * s, 20 * s, W - 40 * s, H - 40 * s);
  g.fillStyle = color;
  g.fillRect(20 * s, 20 * s, W - 40 * s, 8 * s);
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  g.fillStyle = color;
  g.font = mono(700)(Math.round(17 * s));
  g.fillText(kicker.toUpperCase(), 44 * s, 70 * s);
  g.fillStyle = dark ? PAPER : INK;
  g.font = serif(700)(Math.round(44 * s));
  g.fillText(title, 44 * s, 118 * s);
  return s;
}

/** The catalogue on the Main Quad's back wall: every course, by faculty, with its level and length. */
export function drawCatalogue(g: CanvasRenderingContext2D, W: number, H: number, courses: Course[]) {
  const s = sheet(g, W, H, "Course Catalogue", `ZK University · ${courses.length} course${courses.length === 1 ? "" : "s"} · every claim sourced`, GOLD);
  const order = ["zksnarks", "basics", "zcash", "zakura", "tachyon"] as const;
  const cols = order.filter((f) => courses.some((c) => c.faculty === f));
  if (!cols.length) {
    g.fillStyle = MUTED;
    g.font = serif(400)(Math.round(30 * s));
    g.fillText("The first courses are being prepared.", 44 * s, 200 * s);
    return;
  }
  const cw = (W - 88 * s) / cols.length;
  cols.forEach((f, i) => {
    const x = 44 * s + i * cw;
    const fac = FACULTIES[f];
    g.fillStyle = fac.color === "#f4b728" ? GOLD : fac.color;
    g.fillRect(x, 150 * s, cw - 24 * s, 4 * s);
    g.font = sans(800)(Math.round(20 * s));
    g.fillText(fac.name.toUpperCase(), x, 186 * s);
    g.fillStyle = MUTED;
    g.font = mono(500)(Math.round(14 * s));
    g.fillText(fac.hall, x, 210 * s);
    let y = 240 * s;
    for (const c of courses.filter((c) => c.faculty === f)) {
      if (y > H - 90 * s) break;
      g.fillStyle = INK;
      const used = fitText(g, c.title, x, y, cw - 30 * s, 66 * s, serif(700), [Math.round(26 * s), Math.round(22 * s), Math.round(19 * s)], 1.18);
      y += used + 6 * s;
      g.fillStyle = MUTED;
      g.font = mono(500)(Math.round(14 * s));
      g.textBaseline = "top";
      g.fillText(`${levelName(c)} · ${c.minutes} min · ${c.prof.name}`, x, y);
      y += 34 * s;
    }
  });
  g.textBaseline = "alphabetic";
  g.fillStyle = MUTED;
  g.font = mono(500)(Math.round(14 * s));
  g.fillText("Watch in the halls upstairs · read every lesson in the Library on 4", 44 * s, H - 44 * s);
}

/** The directory by the lifts, like a department store's. */
export function drawDirectory(g: CanvasRenderingContext2D, W: number, H: number, floors: [string, string, string, string][]) {
  const s = sheet(g, W, H, "Directory", "ZK University · floors", GOLD, true);
  let y = 170 * s;
  const rowH = (H - 210 * s) / floors.length;
  for (const [label, name, sub, color] of floors) {
    g.fillStyle = color;
    g.font = mono(800)(Math.round(46 * s));
    g.textBaseline = "middle";
    g.fillText(label, 50 * s, y + rowH / 2 - 6 * s);
    g.fillStyle = PAPER;
    g.font = serif(700)(Math.round(34 * s));
    g.fillText(name, 150 * s, y + rowH / 2 - 18 * s);
    g.fillStyle = "rgba(244,234,214,0.6)";
    g.font = sans(500)(Math.round(18 * s));
    g.fillText(sub, 150 * s, y + rowH / 2 + 18 * s);
    g.fillStyle = "rgba(244,234,214,0.15)";
    g.fillRect(44 * s, y + rowH - 2 * s, W - 88 * s, 2 * s);
    y += rowH;
  }
  g.textBaseline = "alphabetic";
}

/** A course's card on a hall's rail: faculty, title, prof, length; lit when it is on the screen. */
export function drawCourseCard(g: CanvasRenderingContext2D, W: number, H: number, c: Course | null, on: boolean) {
  const color = c ? FACULTIES[c.faculty].color : MUTED;
  g.fillStyle = on ? "#1c160f" : PAPER;
  g.fillRect(0, 0, W, H);
  g.fillStyle = color;
  g.fillRect(0, 0, W, 10);
  if (!c) {
    g.fillStyle = MUTED;
    g.font = serif(400)(30);
    g.textBaseline = "middle";
    g.textAlign = "center";
    g.fillText("next course soon", W / 2, H / 2);
    g.textAlign = "left";
    return;
  }
  g.textBaseline = "top";
  g.fillStyle = color;
  g.font = mono(700)(18);
  g.fillText(`${FACULTIES[c.faculty].name.toUpperCase()} · ${levelName(c).toUpperCase()}`, 22, 28);
  g.fillStyle = on ? PAPER : INK;
  fitText(g, c.title, 22, 62, W - 44, H - 150, serif(700), [40, 34, 28], 1.12);
  g.fillStyle = on ? "rgba(244,234,214,0.7)" : MUTED;
  g.font = sans(500)(20);
  g.fillText(`${c.prof.name} · ${c.minutes} min`, 22, H - 70);
  g.fillStyle = on ? color : INK;
  g.font = sans(800)(20);
  g.fillText(on ? "▶ ON THE SCREEN" : "▶ WATCH", 22, H - 40);
}

/** The big screen when no film is playing: the course's title card. */
export function drawTitleCard(g: CanvasRenderingContext2D, W: number, H: number, c: Course | null, hall: string, color: string, note: string) {
  g.fillStyle = "#14110d";
  g.fillRect(0, 0, W, H);
  g.fillStyle = color;
  g.fillRect(0, 0, W, Math.round(H * 0.012));
  const s = W / 1280;
  g.textBaseline = "top";
  g.fillStyle = color;
  g.font = mono(700)(Math.round(22 * s));
  g.fillText(`ZK UNIVERSITY · ${hall.toUpperCase()}`, 70 * s, 70 * s);
  g.fillStyle = PAPER;
  if (c) {
    fitText(g, c.title, 70 * s, 130 * s, W - 140 * s, 250 * s, serif(700), [Math.round(84 * s), Math.round(68 * s), Math.round(56 * s)], 1.1);
    g.fillStyle = "rgba(244,234,214,0.75)";
    fitText(g, c.subtitle, 70 * s, 400 * s, W - 140 * s, 110 * s, sans(400), [Math.round(32 * s), Math.round(26 * s)], 1.3);
    g.fillStyle = color;
    g.font = sans(700)(Math.round(26 * s));
    g.fillText(`${c.prof.name} · ${levelName(c)} · ${c.minutes} min`, 70 * s, 560 * s);
  } else {
    g.font = serif(700)(Math.round(64 * s));
    g.fillText("The first course is being prepared.", 70 * s, 160 * s);
  }
  g.fillStyle = "rgba(244,234,214,0.5)";
  g.font = mono(500)(Math.round(20 * s));
  g.fillText(note, 70 * s, H - 80 * s);
}

type Row = { head: string; title: string; sub?: string };

/** A live board: a list of rows (date · title · line), newest first. */
export function drawFeedBoard(g: CanvasRenderingContext2D, W: number, H: number, title: string, kicker: string, color: string, rows: Row[], empty: string) {
  const s = sheet(g, W, H, title, kicker, color, true);
  if (!rows.length) {
    g.fillStyle = "rgba(244,234,214,0.55)";
    g.font = serif(400)(Math.round(28 * s));
    g.fillText(empty, 44 * s, 200 * s);
    return;
  }
  let y = 160 * s;
  const rowH = Math.max(76 * s, (H - 190 * s) / Math.min(rows.length, 6));
  for (const r of rows.slice(0, 6)) {
    g.textBaseline = "top";
    g.fillStyle = color;
    g.font = mono(700)(Math.round(16 * s));
    g.fillText(r.head, 44 * s, y);
    g.fillStyle = PAPER;
    const used = fitText(g, r.title, 44 * s, y + 24 * s, W - 88 * s, r.sub ? rowH * 0.42 : rowH - 34 * s, serif(700), [Math.round(26 * s), Math.round(22 * s), Math.round(19 * s)], 1.15);
    if (r.sub) {
      g.fillStyle = "rgba(244,234,214,0.6)";
      fitText(g, r.sub, 44 * s, y + 28 * s + used, W - 88 * s, rowH - used - 40 * s, sans(400), [Math.round(17 * s), Math.round(15 * s)], 1.3);
    }
    g.fillStyle = "rgba(244,234,214,0.12)";
    g.fillRect(44 * s, y + rowH - 10 * s, W - 88 * s, 2 * s);
    y += rowH;
  }
  g.textBaseline = "alphabetic";
}

export const postRows = (p: Post[]): Row[] => p.map((x) => ({ head: x.date, title: x.title, sub: x.summary }));
export const releaseRows = (r: Release[]): Row[] => r.map((x) => ({ head: `${x.tag} · ${x.date}`, title: x.name, sub: x.notes.slice(0, 3).join(" · ") }));
export const commitRows = (c: Commit[]): Row[] => c.map((x) => ({ head: `${x.repo} · ${x.sha} · @${x.author} · ${x.date}`, title: x.message }));

/** The sources board: every page the courses quote, by domain. */
export function drawSources(g: CanvasRenderingContext2D, W: number, H: number, courses: Course[], color: string, title = "Sources") {
  const s = sheet(g, W, H, title, "every claim in every course comes from these pages", color);
  const seen = new Map<string, string>();
  for (const c of courses) for (const src of c.sources) if (!seen.has(src.url)) seen.set(src.url, src.title);
  let y = 160 * s;
  g.textBaseline = "top";
  for (const [url, t] of seen) {
    if (y > H - 70 * s) break;
    g.fillStyle = INK;
    const used = fitText(g, t, 44 * s, y, W - 88 * s, 52 * s, serif(700), [Math.round(22 * s), Math.round(19 * s)], 1.15);
    g.fillStyle = MUTED;
    g.font = mono(500)(Math.round(14 * s));
    let host = url;
    try {
      host = new URL(url).host + new URL(url).pathname.replace(/\/$/, "");
    } catch {}
    g.fillText(host.slice(0, 70), 44 * s, y + used + 2 * s);
    y += used + 34 * s;
  }
  if (!seen.size) {
    g.fillStyle = MUTED;
    g.font = serif(400)(Math.round(26 * s));
    g.fillText("No course in this hall yet.", 44 * s, y);
  }
  g.textBaseline = "alphabetic";
}

/** The university's crest for the hall floor: a gold seal with the motto round it. */
export function drawCrest(g: CanvasRenderingContext2D, W: number, H: number) {
  const cx = W / 2,
    cy = H / 2,
    R = W * 0.47;
  g.clearRect(0, 0, W, H);
  g.fillStyle = "#7a1f22";
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#e2b448";
  g.lineWidth = W * 0.012;
  for (const r of [R * 0.98, R * 0.74]) {
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
  // the motto round the ring
  const text = "PROVE EVERYTHING · REVEAL NOTHING · ZK UNIVERSITY · ";
  g.fillStyle = "#f4dc9a";
  g.font = `700 ${Math.round(W * 0.05)}px ${SERIF}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let i = 0; i < text.length; i++) {
    const a = (i / text.length) * Math.PI * 2 - Math.PI / 2;
    g.save();
    g.translate(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86);
    g.rotate(a + Math.PI / 2);
    g.fillText(text[i], 0, 0);
    g.restore();
  }
  // the gold Z
  g.fillStyle = "#e2b448";
  g.font = `900 ${Math.round(W * 0.42)}px ${SERIF}`;
  g.fillText("Z", cx, cy + W * 0.02);
  g.textAlign = "left";
}

/** Book spines for the library's shelves: rows of coloured spines with gilt bands. */
export function drawSpines(g: CanvasRenderingContext2D, W: number, H: number, seed: number) {
  const cols = ["#6a1f22", "#1f3b5a", "#2f4a2a", "#4a2f1e", "#5a4a1e", "#3a2a4a", "#7a5a2a", "#22303a"];
  g.fillStyle = "#2a1a10";
  g.fillRect(0, 0, W, H);
  let x = 0,
    i = seed;
  while (x < W) {
    const w = 10 + ((i * 7919) % 13);
    const h = H * (0.78 + ((i * 104729) % 20) / 100);
    g.fillStyle = cols[(i * 31) % cols.length];
    g.fillRect(x, H - h, w - 1, h);
    g.fillStyle = "rgba(226,180,72,0.7)";
    g.fillRect(x + 1, H - h + 8, w - 3, 2);
    g.fillRect(x + 1, H - 14, w - 3, 2);
    x += w;
    i++;
  }
}

export const wrapLines = wrap;
