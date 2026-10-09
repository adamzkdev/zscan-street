import * as THREE from "three";
import { campusFeed, campusNow, onCampusFeed } from "../../data/campusfeed";
import { COURSES, FACULTIES } from "../../data/university";
import { indoorTree } from "../furniture";
import { esc } from "../wallettower/shared";
import { marbleTex, paint, Surface, type SkyKit } from "../zktowers/kit";
import { drawCatalogue, drawCrest, drawDirectory, drawFeedBoard, levelName } from "./draw";
import { drawLogo, logoBanner } from "./logos";
import { LIFT, OLD_GOLD, SAND, SAND_LT, TILE, WOOD, WOOD_DK } from "./style";

/**
 * G · the Main Quad hall: an arcaded sandstone hall under a coffered oak ceiling. The course
 * catalogue fills the back wall; the directory of the floors stands by the lifts; across from it
 * the news from the two halls upstairs (Zakura's latest release and posts, Tachyon's posts, read
 * live); the university's seal is inlaid in the floor under a ring of light. The dean greets you.
 */

const f = 0;
const X0 = -14,
  X1 = 14,
  Z0 = -28,
  Z1 = 0,
  H = 9;

export const FLOORS: [string, string, string, string][] = [
  ["G", "Main Quad", "the catalogue · the directory · news", OLD_GOLD],
  ["1", "Lecture Hall", "Cryptography basics · zkSNARKs · Zcash", OLD_GOLD],
  ["2", "Zakura Hall", "the node · its releases, live", FACULTIES.zakura.color],
  ["3", "Tachyon Hall", "scaling Zcash · Ragu · the blog, live", FACULTIES.tachyon.color],
  ["4", "The Library", "every lesson to read · every source", "#9fd28a"],
];

export function mainQuad(k: SkyKit) {
  // ---- floor, ceiling, walls --------------------------------------------------------------------------
  k.flat(f, X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: marbleTex(61, "#e3cfa6", "#c9ae7c", 512, 4, 5, 5, "rgba(90,60,30,0.35)"), roughness: 0.35, metalness: 0.04 }), 0, (Z0 + Z1) / 2);
  k.wall(f, X0, Z0, X1, Z0, H, SAND, "matte", 0.4);
  k.wall(f, X0, Z0, X0, Z1, H, SAND, "matte", 0.4);
  k.wall(f, X1, Z0, X1, Z1, H, SAND, "matte", 0.4);
  k.wall(f, X0, Z1, -2.2, Z1, H, SAND, "matte", 0.4);
  k.wall(f, 2.2, Z1, X1, Z1, H, SAND, "matte", 0.4);
  k.box(f, 4.4, H - 3.4, 0.4, 0, 3.4, Z1, SAND);
  // the doors and the name over them
  k.box(f, 4.6, 0.3, 0.5, 0, 3.4, Z1, OLD_GOLD, "glow");
  k.box(f, 4.3, 3.4, 0.05, 0, 0, Z1, "#cfe4f4", "glass");
  k.solid(f, -2.2, Z1 - 0.2, 2.2, Z1 + 2);
  k.label(f, "ZK UNIVERSITY", 0, 4.25, Z1 - 0.3, { h: 0.36, color: OLD_GOLD, ry: Math.PI });
  // the coffered ceiling
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H, (Z0 + Z1) / 2, WOOD_DK);
  for (let x = X0 + 4; x < X1; x += 4) k.box(f, 0.32, 0.5, Z1 - Z0, x, H - 0.5, (Z0 + Z1) / 2, WOOD);
  for (let z = Z0 + 4; z < Z1; z += 4) k.box(f, X1 - X0, 0.5, 0.32, 0, H - 0.5, z, WOOD);

  // ---- the arcades along both sides: columns, round arches, the walk behind them ---------------------------
  for (const sx of [-1, 1]) {
    const x = sx * 10.6;
    for (let z = -4; z >= -24; z -= 4) {
      k.cyl(f, 0.34, 0.3, 4.6, x, 0, z, SAND_LT, "matte", 16);
      k.box(f, 0.9, 0.3, 0.9, x, 0, z, SAND);
      k.box(f, 0.9, 0.3, 0.9, x, 4.6, z, SAND);
      k.solid(f, x - 0.35, z - 0.35, x + 0.35, z + 0.35);
      if (z > -24) {
        // the arch to the next column
        const arch = new THREE.TorusGeometry(2, 0.22, 6, 18, Math.PI);
        arch.rotateY(Math.PI / 2);
        arch.translate(x, 4.9, z - 2);
        k.geo(f, arch, SAND_LT);
      }
    }
    k.box(f, 0.6, H - 7.1, 20.8, x, 7.1, -14, SAND);
    // the red tile line over the arcade
    k.box(f, 0.7, 0.16, 20.8, x, 7.05, -14, TILE);
  }

  // ---- the seal in the floor, the ring of light over it ---------------------------------------------------
  const crest = paint(1024, 1024, (g, W, Hh) => drawCrest(g, W, Hh));
  const seal = k.flat(f, 6, 6, new THREE.MeshStandardMaterial({ map: crest, transparent: true, roughness: 0.3, metalness: 0.2 }), 0, -14, 0.012);
  seal.renderOrder = 1;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.06, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(OLD_GOLD).multiplyScalar(1.4), toneMapped: false }));
  ring.rotation.x = Math.PI / 2;
  ring.raycast = () => {};
  k.add(f, ring, 0, H - 0.8, -14, 0);
  k.hit(f, 6, 0.2, 6, 0, 0, -14, "<b>The seal</b><span>Prove everything. Reveal nothing.</span>", () => ({ eyebrow: "ZK University", title: "Prove everything. Reveal nothing.", body: "<p>The university's motto: a zero-knowledge proof convinces you that a statement is true without showing you anything else.</p>" }));

  // ---- the catalogue on the back wall ------------------------------------------------------------------------
  const cat = new Surface(2048, 1024, 1.0);
  k.box(f, 14.4, 7.4, 0.12, 0, 0.6, Z0 + 0.3, WOOD_DK, "polish");
  k.plane(f, 14, 7, cat.mat, 0, 4.3, Z0 + 0.38);
  k.hit(f, 14, 7, 0.3, 0, 0.8, Z0 + 0.5, "<b>Course catalogue</b><span>every course, by faculty</span>", () => ({
    eyebrow: "ZK University",
    title: "Course catalogue",
    body: COURSES.length
      ? COURSES.map((c) => `<p><b>${esc(c.title)}</b><br><span style="opacity:.7">${esc(FACULTIES[c.faculty].name)} · ${esc(levelName(c))} · ${c.minutes} min · ${esc(FACULTIES[c.faculty].hall)}</span></p>`).join("")
      : "<p>The first courses are being prepared.</p>",
  }));

  // ---- the directory by the lifts (west), the news from the halls (east) -------------------------------------
  const dir = new Surface(1024, 1024, 1.0);
  k.box(f, 0.12, 4.6, 4.6, X0 + 0.26, 0.9, -11, WOOD_DK, "polish");
  k.plane(f, 4.4, 4.4, dir.mat, X0 + 0.34, 3.1, -11, 0, Math.PI / 2);
  k.hit(f, 0.3, 4.4, 4.4, X0 + 0.5, 0.9, -11, "<b>Directory</b><span>the floors</span>", () => ({ eyebrow: "ZK University", title: "Directory", body: FLOORS.map(([l, n, s]) => `<p><b>${l} · ${n}</b><br><span style="opacity:.7">${esc(s)}</span></p>`).join("") + "<p>Take the lifts by the doors.</p>" }));
  const news = new Surface(1024, 1024, 1.0);
  k.box(f, 0.12, 6.2, 6.2, X1 - 0.26, 0.6, -14, WOOD_DK, "polish");
  k.plane(f, 6, 6, news.mat, X1 - 0.34, 3.6, -14, 0, -Math.PI / 2);
  const newsRows = () => {
    const feed = campusNow();
    const rows: { head: string; title: string; sub?: string; url: string }[] = [];
    const rel = feed?.zakura.releases[0];
    if (rel) rows.push({ head: `ZAKURA · RELEASE · ${rel.date}`, title: rel.name, sub: rel.notes.slice(0, 2).join(" · "), url: rel.url });
    for (const p of (feed?.tachyon.posts ?? []).slice(0, 2)) rows.push({ head: `TACHYON · ${p.date}`, title: p.title, sub: p.summary, url: p.url });
    for (const p of (feed?.zakura.posts ?? []).filter((p) => p.url !== rel?.url).slice(0, 2)) rows.push({ head: `ZAKURA · ${p.date}`, title: p.title, sub: p.summary, url: p.url });
    return rows.sort((a, b) => b.head.slice(-10).localeCompare(a.head.slice(-10)));
  };
  k.hit(f, 0.3, 6, 6, X1 - 0.5, 0.6, -14, "<b>News from the halls</b><span>Zakura · Tachyon, live</span>", () => ({
    eyebrow: "ZK University · live",
    title: "News from Zakura and Tachyon",
    body: newsRows()
      .map((r) => `<p><a href="${esc(r.url)}" target="_blank" rel="noopener"><b>${esc(r.title)}</b></a><br><span style="opacity:.7">${esc(r.head)}</span></p>`)
      .join("") || "<p>Loading…</p>",
  }));

  const fill = () => {
    cat.draw((g, W, Hh) => drawCatalogue(g, W, Hh, COURSES));
    dir.draw((g, W, Hh) => drawDirectory(g, W, Hh, FLOORS));
    // the two halls' marks beside their rows
    void (async () => {
      const W = dir.W,
        Hh = dir.H,
        s = W / 1024,
        rowH = (Hh - 210 * s) / FLOORS.length;
      for (const [i, m] of [
        [2, "zakura"],
        [3, "tachyon"],
      ] as const)
        await drawLogo(dir.g, m, W - 160 * s, 170 * s + rowH * i + rowH / 2 - 50 * s, 100 * s, 100 * s, { stacked: true, ink: "#f4ead6" }).catch(() => {});
      dir.tex.needsUpdate = true;
    })();
    news.draw((g, W, Hh) => drawFeedBoard(g, W, Hh, "News from the halls", "Zakura · Tachyon · live", OLD_GOLD, newsRows(), "Reading zakura.com and tachyon.z.cash…"));
  };
  fill();
  void document.fonts?.ready.then(fill);
  onCampusFeed(fill);
  k.arrive[f].push(() => void campusFeed());

  // ---- the dean's desk, benches, palms ------------------------------------------------------------------------
  k.box(f, 3.4, 1.05, 0.9, 6, 0, -5.2, WOOD, "polish");
  k.box(f, 3.5, 0.06, 1.0, 6, 1.05, -5.2, OLD_GOLD, "metal");
  k.solid(f, 4.3, -5.65, 7.7, -4.75);
  for (const z of [-8, -20]) {
    for (const sx of [-1, 1]) {
      k.box(f, 0.5, 0.45, 2.4, sx * 7.4, 0, z, WOOD, "polish");
      k.box(f, 0.1, 0.5, 2.4, sx * 7.7, 0.45, z, WOOD_DK);
      k.solid(f, sx * 7.4 - 0.3, z - 1.2, sx * 7.4 + 0.3, z + 1.2);
    }
  }
  for (const [x, z] of [
    [-12.6, -6.4],
    [12.3, -2.2],
    [-12.3, -25.8],
    [12.3, -25.8],
  ])
    k.vox(f, `uni-palm-${x}`, () => indoorTree(Math.abs(x * z) | 0), x, z, 0, { k: 0.7 });

  // ---- light, lifts, people ---------------------------------------------------------------------------------------
  // the lifts on the front wall, left of the doors, clear of the arcade
  k.lifts(f, -7, Z1 - 0.2, Math.PI, LIFT);
  logoBanner(k, f, "zakura", -10.6, 4.3, Z0 + 0.5, 0, "Zakura Hall\nfloor 2");
  logoBanner(k, f, "tachyon", 10.6, 4.3, Z0 + 0.5, 0, "Tachyon Hall\nfloor 3");
  k.light(f, 0, 7, -14, "#fff1d6", 20, 22);
  k.light(f, 0, 6, -24, "#ffe2b8", 14, 16);
  k.light(f, -10, 5, -10, "#ffd8a0", 10, 14);
  k.light(f, 10, 5, -14, "#ffd8a0", 10, 14);
  k.light(f, 0, 4, -3, "#ffffff", 8, 10);
  const first = () => COURSES[0];
  k.onCast(f, () => {
    void k.person(f, 7021, [6, -6.1], "The Dean", {
      face: [0, 1],
      near: 8,
      lines: [
        "Welcome to ZK University. Lectures upstairs: Theory on 1, Zakura on 2, Tachyon on 3.",
        "Every lesson is in the Library on 4. Every claim has its source.",
        () => (first() ? `New this term: "${first()!.title}".` : "The first courses are being prepared."),
        () => `${COURSES.length} course${COURSES.length === 1 ? "" : "s"} so far. More every week.`,
      ],
    });
    void k.person(f, 7101, [-5, -16], "Student", { wander: [[-5, -16], [-4, -24], [3, -18], [-8, -6]], lines: ["I came for the zkSNARKs lecture. Stayed for Tachyon."] });
    void k.person(f, 7202, [4, -22], "Student", { face: [0, -1], lines: [() => (first() ? `Reading the catalogue. "${first()!.title}" first.` : "Reading the catalogue.")] });
  });
}
