import * as THREE from "three";
import { COURSES, FACULTIES, type Course } from "../../data/university";
import type { Book } from "../../ui/reader";
import { esc } from "../wallettower/shared";
import { marbleTex, paint, Surface, SERIF, type SkyKit } from "../zktowers/kit";
import { drawSources, drawSpines, INK, levelName, MUTED, PAPER } from "./draw";
import { sourcesInfo } from "./hall";
import { LIFT, OLD_GOLD, SAND, WOOD, WOOD_DK } from "./style";
import { frontWallAndStairs } from "./stairs";

/**
 * 4 · the Library: oak shelves of gilt spines up every wall and in bays at the back, reading
 * tables with green lamps, and down the middle a row of lecterns, one open book per course: click
 * it and the lesson opens in the reader, page by page. The sources of every course hang on the
 * back wall. The librarian keeps the desk by the door.
 */

const f = 4;
const X0 = -14,
  X1 = 14,
  Z0 = -30,
  Z1 = 0,
  H = 10;

export function courseBook(c: Course): Book {
  return {
    slug: c.slug,
    number: null,
    title: c.title,
    status: `${FACULTIES[c.faculty].name} · ${levelName(c)} · ${c.prof.name}`,
    owners: [],
    created: c.created,
    url: c.sources[0]?.url ?? "https://zstreet.cash",
    color: FACULTIES[c.faculty].color,
    text: `${c.text}\n\n## Sources\n\n${c.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}`,
    crest: FACULTIES[c.faculty].name.toUpperCase(),
    site: c.sources[0] ? new URL(c.sources[0].url).host : "zstreet.cash",
  };
}

export function library(k: SkyKit) {
  // ---- the room --------------------------------------------------------------------------------------------
  k.flat(f, X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: marbleTex(81, "#5a3a24", "#4a2f1e", 512, 6, 6, 6, "rgba(0,0,0,0.35)"), roughness: 0.4 }), 0, (Z0 + Z1) / 2);
  k.wall(f, X0, Z0, X1, Z0, H, SAND, "matte", 0.4);
  k.wall(f, X0, Z0, X0, Z1, H, SAND, "matte", 0.4);
  k.wall(f, X1, Z0, X1, Z1, H, SAND, "matte", 0.4);
  // the front wall: no door upstairs, the stairs right of where it was
  frontWallAndStairs(k, f, { x0: X0, x1: X1, z: Z1, h: H, top: 5 });
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H, (Z0 + Z1) / 2, WOOD_DK);
  // a barrel vault of oak ribs
  for (let z = Z0 + 2; z < Z1; z += 3) {
    const rib = new THREE.TorusGeometry(13.6, 0.18, 6, 32, Math.PI);
    rib.scale(1, 0.12, 1);
    rib.translate(0, H - 2.1, z);
    k.geo(f, rib, WOOD);
  }

  // ---- shelves: up the side walls, and bays at the back --------------------------------------------------------
  const spines = (seed: number, rx: number) => {
    const t = paint(512, 256, (g, W, Hh) => drawSpines(g, W, Hh, seed), rx, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
  };
  const SHELF = 0.62;
  /** A wall of shelves `len` long, its face towards +local z, at (x, z) turned `ry`. */
  const shelves = (len: number, x: number, z: number, ry: number, rows = 7, seed = 1) => {
    const g = new THREE.Group();
    const frame = new THREE.BoxGeometry(len, rows * SHELF + 0.2, 0.5);
    frame.translate(0, (rows * SHELF + 0.2) / 2, -0.25);
    const m = new THREE.Mesh(frame, new THREE.MeshStandardMaterial({ color: WOOD_DK, roughness: 0.6 }));
    g.add(m);
    for (let r = 0; r < rows; r++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.2, SHELF - 0.08), spines(seed * 31 + r, Math.max(1, Math.round(len / 2))));
      p.position.set(0, 0.14 + r * SHELF + (SHELF - 0.08) / 2, 0.005);
      g.add(p);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.5 }));
      lip.position.set(0, 0.1 + r * SHELF, 0.02);
      g.add(lip);
    }
    g.traverse((o) => (o.raycast = () => {}));
    k.add(f, g, x, 0, z, ry);
  };
  shelves(20, X0 + 0.5, -18, Math.PI / 2, 9, 1);
  shelves(26, X1 - 0.5, -15, -Math.PI / 2, 9, 2);
  k.solid(f, X0, Z0, X0 + 0.8, -8);
  k.solid(f, X1 - 0.8, Z0, X1, Z1);
  for (const [x, s] of [
    [-9, 3],
    [-4.5, 4],
    [4.5, 5],
    [9, 6],
  ]) {
    shelves(5.4, x - 0.26, -24.3, Math.PI / 2, 6, s);
    shelves(5.4, x + 0.26, -24.3, -Math.PI / 2, 6, s + 10);
    k.solid(f, x - 0.55, -27, x + 0.55, -21.6);
  }

  // ---- the sources on the back wall --------------------------------------------------------------------------------
  const src = new Surface(1024, 1024, 1.0);
  k.box(f, 5.2, 5.2, 0.12, 0, 1.0, Z0 + 0.3, WOOD_DK, "polish");
  k.plane(f, 5, 5, src.mat, 0, 3.6, Z0 + 0.38);
  k.hit(f, 5, 5, 0.3, 0, 1.1, Z0 + 0.5, "<b>Sources</b><span>every page the courses quote</span>", () => sourcesInfo("ZK University · Library", COURSES));
  src.draw((g, W, Hh) => drawSources(g, W, Hh, COURSES, "#3f7a3a", "Every source"));
  void document.fonts?.ready.then(() => src.draw((g, W, Hh) => drawSources(g, W, Hh, COURSES, "#3f7a3a", "Every source")));

  // ---- the lecterns down the middle: one open book per course ---------------------------------------------------------
  const N = Math.min(8, Math.max(3, COURSES.length));
  for (let i = 0; i < N; i++) {
    const c = COURSES[i] ?? null;
    const x = ((i % 2) * 2 - 1) * 2.2;
    const z = -4.5 - Math.floor(i / 2) * 3.6;
    k.box(f, 0.5, 1.0, 0.5, x, 0, z, WOOD_DK, "polish");
    k.box(f, 1.2, 0.08, 0.9, x, 1.0, z, WOOD, "polish", 0);
    const page = new Surface(768, 512, 1.0);
    page.draw((g, W, Hh) => drawOpenBook(g, W, Hh, c));
    void document.fonts?.ready.then(() => page.draw((g, W, Hh) => drawOpenBook(g, W, Hh, c)));
    k.plane(f, 0.92, 0.6, page.mat, x, 1.16, z + 0.05, -Math.PI / 2 + 0.45);
    k.solid(f, x - 0.4, z - 0.4, x + 0.4, z + 0.4);
    if (c) k.hit(f, 1.2, 1.4, 1.0, x, 0, z, `<b>${esc(c.title)}</b><span>click to read the lesson</span>`, () => ({ eyebrow: "ZK University · Library", title: c.title, book: courseBook(c) }));
  }

  // ---- reading tables with green lamps ------------------------------------------------------------------------------
  for (const [x, z] of [
    [-8, -6],
    [-8, -13],
    [8, -6],
    [8, -13],
  ]) {
    k.box(f, 4.2, 0.08, 1.6, x, 0.76, z, WOOD, "polish");
    for (const dx of [-1.9, 1.9]) k.box(f, 0.12, 0.76, 1.4, x + dx, 0, z, WOOD_DK);
    for (const dx of [-1, 1]) {
      k.cyl(f, 0.05, 0.05, 0.36, x + dx, 0.84, z, "#c8a040", "metal", 8);
      k.box(f, 0.5, 0.14, 0.22, x + dx, 1.18, z, "#1f6a3a", "glow");
    }
    for (const dz of [-1.15, 1.15]) for (const dx of [-1.2, 0, 1.2]) k.box(f, 0.45, 0.46, 0.45, x + dx, 0, z + dz, WOOD_DK);
    k.solid(f, x - 2.1, z - 0.8, x + 2.1, z + 0.8);
  }

  // ---- light, lifts, people -------------------------------------------------------------------------------------------
  k.lifts(f, X0 + 0.2, -3.8, Math.PI / 2, LIFT);
  k.light(f, 0, 7, -10, "#fff1d6", 16, 20);
  k.light(f, 0, 6, -22, "#ffe2b8", 14, 18);
  k.light(f, -8, 2.2, -9.5, "#b8f0c0", 6, 8);
  k.light(f, 8, 2.2, -9.5, "#b8f0c0", 6, 8);
  k.light(f, 0, 3.5, -27, OLD_GOLD, 6, 8);
  k.onCast(f, () => {
    void k.person(f, 7303, [6, -2.6], "Librarian", {
      face: [-1, 0.4],
      near: 8,
      lines: [
        "Each lectern holds a lesson. Click a book to read it.",
        "Every lesson ends with its sources. We keep them on the back wall too.",
        "The ZIPs themselves are across the river, in the Binhai Library.",
      ],
    });
    void k.person(f, 7404, [-8, -7.2], "Student", { sit: true, face: [0, 1], lines: ["Reading the Tachyon lesson twice."] });
    void k.person(f, 7505, [8, -11.8], "Student", { sit: true, face: [0, -1] });
  });
  k.box(f, 2.6, 1.0, 0.8, 6, 0, -1.7, WOOD, "polish");
  k.solid(f, 4.7, -2.1, 7.3, -1.3);
}

/** An open book on a lectern: the course's title on the left page, its summary on the right. */
function drawOpenBook(g: CanvasRenderingContext2D, W: number, H: number, c: Course | null) {
  g.fillStyle = "#3a2416";
  g.fillRect(0, 0, W, H);
  g.fillStyle = PAPER;
  g.fillRect(14, 14, W / 2 - 18, H - 28);
  g.fillRect(W / 2 + 4, 14, W / 2 - 18, H - 28);
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.fillRect(W / 2 - 6, 14, 12, H - 28);
  if (!c) {
    g.fillStyle = MUTED;
    g.font = `italic 400 30px ${SERIF}`;
    g.textAlign = "center";
    g.fillText("a lesson to come", W / 4, H / 2);
    g.textAlign = "left";
    return;
  }
  const color = FACULTIES[c.faculty].color;
  g.fillStyle = color === "#f4b728" ? "#c8962e" : color;
  g.font = `700 18px ${SERIF}`;
  g.textBaseline = "top";
  g.fillText(FACULTIES[c.faculty].name.toUpperCase(), 40, 46);
  g.fillStyle = INK;
  let y = 80;
  g.font = `700 40px ${SERIF}`;
  for (const l of lines(g, c.title, W / 2 - 70).slice(0, 5)) {
    g.fillText(l, 40, y);
    y += 46;
  }
  g.fillStyle = MUTED;
  g.font = `italic 400 20px ${SERIF}`;
  g.fillText(c.prof.name, 40, H - 70);
  g.fillStyle = INK;
  g.font = `400 21px ${SERIF}`;
  y = 46;
  for (const l of lines(g, c.summary, W / 2 - 70).slice(0, 15)) {
    g.fillText(l, W / 2 + 30, y);
    y += 27;
  }
}

function lines(g: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const n = line ? `${line} ${w}` : w;
    if (g.measureText(n).width > max && line) {
      out.push(line);
      line = w;
    } else line = n;
  }
  if (line) out.push(line);
  return out;
}
