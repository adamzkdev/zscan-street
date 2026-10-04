import * as THREE from "three";
import { get } from "../data/zscan";
import { fitText } from "../scene/fit";
import { Snark, loadArt } from "../scene/snark";
import { box, glowMat, makeScene, room, std, textPlane } from "./kit";
import type { Interior, InteriorContext, PickInfo } from "./types";

/**
 * Inside the LIBRARY on Transparent Square: Zcash's public knowledge.
 * G — the press room: today's Zcash news as framed front pages, a ticker of headlines.
 * 1 — the ZIP stacks: one book per Zcash Improvement Proposal, shelved by status.
 * 2 — the upgrades hall: every network upgrade from Overwinter to NU7, on plinths.
 */

interface NewsItem {
  id: string;
  source_name: string;
  category: string;
  title: string;
  url: string;
  summary: string | null;
  published_at: string;
}

interface Zip {
  slug: string;
  number: number | null;
  title: string;
  status: string;
  status_detail: string | null;
  categories: string[];
  owners: string[];
  created: string | null;
  summary: string | null;
  url: string;
  live: { href: string; label: string } | null;
}

interface Upgrade {
  label: string;
  activation_height: number | null;
  activated: boolean;
  announced_date: string | null;
  target_block_time: number;
  branch_id: string | null;
  summary: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => n.toLocaleString("en-US");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const CATEGORY: Record<string, { label: string; color: string }> = {
  development: { label: "DEVELOPMENT", color: "#59a8ff" },
  grants: { label: "GRANTS", color: "#3ee08f" },
  community: { label: "COMMUNITY", color: "#b07bff" },
  releases: { label: "RELEASES", color: "#ff9f2e" },
  network: { label: "NETWORK", color: "#f4b728" },
};

/** The stacks: one shelf face per status group, colour on every spine. */
const SHELVES = [
  { label: "FINAL", color: "#3ee08f", has: (s: string) => s === "Final" },
  { label: "ACTIVE", color: "#59e3ff", has: (s: string) => s === "Active" },
  { label: "PROPOSED", color: "#f4b728", has: (s: string) => s === "Proposed" },
  { label: "DRAFT", color: "#7fa0ff", has: (s: string) => s === "Draft" },
  { label: "ARCHIVED", color: "#a59fb3", has: (s: string) => ["Obsolete", "Withdrawn", "Rejected"].includes(s) },
  { label: "RESERVED", color: "#6c6680", has: (s: string) => !["Final", "Active", "Proposed", "Draft", "Obsolete", "Withdrawn", "Rejected"].includes(s) },
];

const PRESS_Y = 0,
  STACKS_Y = 6,
  HALL_Y = 12;

/** ZIP list from the API, or the snapshot shipped with the street until the API serves it. */
async function loadZips(): Promise<Zip[]> {
  const live = await get<Zip[]>("/v1/zips");
  if (live?.length) return live;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}zips.json`);
    return r.ok ? ((await r.json()) as Zip[]) : [];
  } catch {
    return [];
  }
}

/** Wrap `text` into lines that fit `w` at the current font. */
function wrap(g: CanvasRenderingContext2D, text: string, w: number, max: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > w && line) {
      lines.push(line);
      line = word;
      if (lines.length === max) break;
    } else line = t;
  }
  if (lines.length < max && line) lines.push(line);
  if (lines.length === max && words.join(" ").length > lines.join(" ").length) lines[max - 1] = lines[max - 1].replace(/\s*\S*$/, "…");
  return lines;
}

function canvasTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A front page of THE ZCASH TIMES for one news item. */
function frontPage(n: NewsItem) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 680;
  const g = c.getContext("2d")!;
  const cat = CATEGORY[n.category] ?? { label: n.category.toUpperCase(), color: "#cccccc" };
  g.fillStyle = "#efe9dc";
  g.fillRect(0, 0, 512, 680);
  // masthead
  g.fillStyle = "#1c1a17";
  g.textAlign = "center";
  g.font = '700 38px Georgia, "Times New Roman", serif';
  fitText(g, "THE ZCASH TIMES", 256, 58);
  g.fillRect(28, 74, 456, 3);
  g.font = '500 15px "JetBrains Mono", monospace';
  fitText(g, `${day(n.published_at).toUpperCase()} · ${n.source_name.toUpperCase()}`, 256, 98);
  g.fillRect(28, 108, 456, 1);
  // section band
  g.fillStyle = cat.color;
  g.fillRect(28, 124, 456, 30);
  g.fillStyle = "#14120f";
  g.font = '700 16px "JetBrains Mono", monospace';
  g.fillText(cat.label, 256, 145);
  // headline and summary
  g.textAlign = "left";
  g.fillStyle = "#14120f";
  g.font = '700 40px Georgia, "Times New Roman", serif';
  const head = wrap(g, n.title, 456, 4);
  head.forEach((l, i) => g.fillText(l, 28, 206 + i * 46));
  let y = 206 + head.length * 46 + 18;
  g.fillRect(28, y - 14, 120, 3);
  g.fillStyle = "#3a3630";
  g.font = '400 21px Georgia, "Times New Roman", serif';
  for (const l of wrap(g, n.summary ?? "", 456, Math.max(2, Math.floor((640 - y) / 28)))) {
    g.fillText(l, 28, y + 12);
    y += 28;
  }
  // columns of grey "text" filling the rest of the page
  g.fillStyle = "rgba(20,18,15,0.18)";
  for (let yy = y + 30; yy < 640; yy += 12) {
    g.fillRect(28, yy, 216, 5);
    g.fillRect(268, yy, 216, 5);
  }
  g.fillStyle = "#1c1a17";
  g.font = '500 13px "JetBrains Mono", monospace';
  g.textAlign = "center";
  g.fillText("news.zscan.cash", 256, 664);
  return canvasTexture(c);
}

export function buildLibrary(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0d0b0a");
  const pickables: THREE.Object3D[] = [];
  const picks = new Map<THREE.Object3D, () => PickInfo>();
  const hovers = new Map<THREE.Object3D, string>();
  const ticks: ((dt: number, t: number) => void)[] = [];
  const people: Snark[] = [];
  const wood = std("#5a3d2a", 0.7);
  const darkWood = std("#3a281c", 0.75);
  const plaster = std("#d9cfbd", 0.92);

  const addPerson = async (id: number, at: THREE.Vector3, role: string, wander?: THREE.Vector3[]) => {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      s.root.position.copy(at);
      scene.add(s.root);
      people.push(s);
      if (!wander) return void (s.faceDir = new THREE.Vector3(0, 0, 1));
      for (;;) {
        await new Promise((r) => setTimeout(r, 3000 + Math.random() * 5000));
        await s.walk([wander[Math.floor(Math.random() * wander.length)]], 0.9);
      }
    } catch {}
  };

  // ---- G: the press room ------------------------------------------------------------------------
  const pressRects = room(scene, {
    x0: -12,
    z0: -18,
    x1: 12,
    z1: 0,
    y: PRESS_Y,
    h: 5,
    floor: std("#6b4a33", 0.6),
    wall: plaster,
    ceiling: std("#2a2420", 0.9),
    door: [-1.5, 1.5],
  });
  // wainscot and a picture rail on both long walls
  for (const x of [-11.88, 11.88]) {
    box(scene, 0.04, 1.0, 17.6, darkWood, x, PRESS_Y, -9);
    box(scene, 0.05, 0.06, 17.6, darkWood, x, PRESS_Y + 3.3, -9);
  }
  const masthead = textPlane("THE ZCASH TIMES · 号外", { h: 0.5, color: "#ffd28a", glow: true });
  masthead.position.set(0, PRESS_Y + 4.2, -17.85);
  scene.add(masthead);
  // the ticker over the back wall: every headline, scrolling
  const tick = document.createElement("canvas");
  tick.width = 2048;
  tick.height = 96;
  const tg = tick.getContext("2d")!;
  const tickTex = canvasTexture(tick);
  const ticker = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.66), new THREE.MeshBasicMaterial({ map: tickTex, toneMapped: false }));
  ticker.position.set(0, PRESS_Y + 3.35, -17.86);
  scene.add(ticker);
  box(scene, 14.2, 0.8, 0.06, std("#111014", 0.5, 0.5), 0, PRESS_Y + 2.95, -17.93);
  let headlines = "  LOADING THE NEWS…  ";
  let tickX = 0;
  ticks.push((dt) => {
    tickX -= dt * 140;
    tg.fillStyle = "#08070a";
    tg.fillRect(0, 0, 2048, 96);
    tg.font = '700 46px "JetBrains Mono", monospace';
    tg.fillStyle = "#ffd28a";
    const w = tg.measureText(headlines).width;
    if (tickX < -w) tickX += w;
    for (let x = tickX; x < 2048; x += w) tg.fillText(headlines, x, 64);
    tickTex.needsUpdate = true;
  });
  // the editor's desk by the window, and two reading tables with the day's papers
  box(scene, 3.2, 0.9, 1.1, wood, -7.5, PRESS_Y, -3.2);
  for (const z of [-7.5, -12.5]) {
    box(scene, 6, 0.08, 1.6, wood, 0, PRESS_Y + 0.82, z);
    for (const x of [-2.7, 2.7]) box(scene, 0.12, 0.82, 1.4, darkWood, x, PRESS_Y, z);
    for (let k = 0; k < 4; k++) box(scene, 0.5, 0.03 + k * 0.01, 0.7, std("#efe9dc", 0.95), -2 + k * 1.3, PRESS_Y + 0.86, z + (k % 2 ? 0.2 : -0.2));
  }
  pressRects.push([-9.2, -3.8, -5.8, -2.6], [-3.1, -8.4, 3.1, -6.6], [-3.1, -13.4, 3.1, -11.6]);
  for (const [x, z] of [
    [-5, -9],
    [5, -9],
    [0, -15],
  ]) {
    const l = new THREE.PointLight("#ffe2b8", 9, 14, 1.6);
    l.position.set(x, PRESS_Y + 4.3, z);
    scene.add(l);
  }
  void addPerson(4242, new THREE.Vector3(-7.5, PRESS_Y, -4.2), "Editor");
  void addPerson(808, new THREE.Vector3(4, PRESS_Y, -10), "Reader", [new THREE.Vector3(4, PRESS_Y, -10), new THREE.Vector3(-4, PRESS_Y, -10), new THREE.Vector3(6, PRESS_Y, -15), new THREE.Vector3(-6, PRESS_Y, -5)]);
  // the front pages, framed along both walls
  const pageSlots: { pos: THREE.Vector3; yaw: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const z = -3.4 - k * 2.5;
    pageSlots.push({ pos: new THREE.Vector3(-11.84, PRESS_Y + 2.05, z), yaw: Math.PI / 2 }, { pos: new THREE.Vector3(11.84, PRESS_Y + 2.05, z), yaw: -Math.PI / 2 });
  }
  void get<NewsItem[]>("/v1/news?limit=40").then((news) => {
    if (!news?.length) return void (headlines = "  THE NEWS DESK IS OFFLINE · news.zscan.cash  ");
    headlines = news.map((n) => `  ${n.title.toUpperCase()}  ◆`).join("") + "  ";
    news.slice(0, pageSlots.length).forEach((n, i) => {
      const { pos, yaw } = pageSlots[i];
      const cat = CATEGORY[n.category]?.color ?? "#cccccc";
      const frame = new THREE.Group();
      frame.position.copy(pos);
      frame.rotation.y = yaw;
      const border = new THREE.Mesh(new THREE.BoxGeometry(1.58, 2.08, 0.05), std("#2a1d14", 0.6));
      const page = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 1.92), new THREE.MeshStandardMaterial({ map: frontPage(n), roughness: 0.9 }));
      page.position.z = 0.03;
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.05, 0.06), glowMat(cat, 1.3));
      band.position.y = -1.07;
      frame.add(border, page, band);
      scene.add(frame);
      pickables.push(page);
      hovers.set(page, `<b>${esc(n.title)}</b><span>${esc(n.source_name)} · ${day(n.published_at)}</span>`);
      picks.set(page, () => ({
        eyebrow: `${CATEGORY[n.category]?.label ?? n.category} · ${n.source_name}`,
        title: n.title,
        tag: [day(n.published_at), "muted"],
        body: n.summary ? `<p>${esc(n.summary)}</p>` : undefined,
        link: { href: n.url, label: "Read the story" },
      }));
    });
  });

  // ---- 1: the ZIP stacks --------------------------------------------------------------------------
  const stacksRects = room(scene, {
    x0: -13,
    z0: -24,
    x1: 13,
    z1: 0,
    y: STACKS_Y,
    h: 5.2,
    floor: std("#4a3528", 0.7),
    wall: std("#cdbfa8", 0.92),
    ceiling: std("#1e1a17", 0.9),
  });
  const runs = [-7, 0, 7];
  const RUN_Z0 = -5,
    RUN_Z1 = -21;
  for (const x of runs) {
    // a double-sided bookcase: back panel, ends, five boards a side
    box(scene, 0.06, 2.7, RUN_Z0 - RUN_Z1, darkWood, x, STACKS_Y, (RUN_Z0 + RUN_Z1) / 2);
    for (const z of [RUN_Z0, RUN_Z1]) box(scene, 0.9, 2.8, 0.08, darkWood, x, STACKS_Y, z);
    for (let k = 0; k < 5; k++) box(scene, 0.86, 0.04, RUN_Z0 - RUN_Z1, wood, x, STACKS_Y + 0.25 + k * 0.55, (RUN_Z0 + RUN_Z1) / 2);
    box(scene, 0.9, 0.08, RUN_Z0 - RUN_Z1 + 0.1, darkWood, x, STACKS_Y + 2.72, (RUN_Z0 + RUN_Z1) / 2);
    stacksRects.push([x - 0.5, RUN_Z1 - 0.1, x + 0.5, RUN_Z0 + 0.1]);
    box(scene, 0.12, 0.04, RUN_Z0 - RUN_Z1, glowMat("#ffd28a", 0.9), x, STACKS_Y + 5.1, (RUN_Z0 + RUN_Z1) / 2);
  }
  for (const [x, z] of [
    [-3.5, -8],
    [3.5, -8],
    [-3.5, -18],
    [3.5, -18],
    [-10, -13],
    [10, -13],
  ]) {
    const l = new THREE.PointLight("#ffe2b8", 8, 12, 1.6);
    l.position.set(x, STACKS_Y + 4.6, z);
    scene.add(l);
  }
  const stacksTitle = textPlane("THE ZIP STACKS · ZCASH IMPROVEMENT PROPOSALS", { h: 0.4, color: "#ffd28a", glow: true });
  stacksTitle.position.set(0, STACKS_Y + 4.1, -23.85);
  scene.add(stacksTitle);
  void addPerson(1337, new THREE.Vector3(-3.5, STACKS_Y, -12), "Librarian", [-3.5, 3.5, -10.5, 10.5].flatMap((x) => [-7, -13, -19].map((z) => new THREE.Vector3(x, STACKS_Y, z))));
  /** Faces of the bookcases: [x of the spines, which way they face (+1 / −1)]. */
  const faces: [number, number][] = runs.flatMap((x) => [
    [x - 0.46, -1],
    [x + 0.46, 1],
  ]);
  void loadZips().then((zips) => {
    if (!zips.length) return;
    // the spines' labels, in one atlas: 32 × 8 cells of 64 × 256
    const atlas = document.createElement("canvas");
    atlas.width = 2048;
    atlas.height = 2048;
    const ag = atlas.getContext("2d")!;
    const atlasTex = canvasTexture(atlas);
    const spineMat = new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 0.75 });
    SHELVES.forEach((shelf, si) => {
      const mine = zips.filter((z) => shelf.has(z.status));
      const [fx, dir] = faces[si];
      // the aisle sign at the end of the face, readable from the stairs
      const sign = textPlane(`${shelf.label} · ${mine.length}`, { h: 0.2, color: "#0d0d0d", bg: shelf.color });
      sign.position.set(fx + dir * 0.02, STACKS_Y + 3.05, RUN_Z0 - 0.4);
      sign.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(sign);
      const cover = std(shelf.color, 0.7);
      const perBoard = 72;
      mine.forEach((z, k) => {
        const i = zips.indexOf(z);
        const cx = (i % 32) * 64,
          cy = Math.floor(i / 32) * 256;
        // the spine: status colour, a gold band, the number running up it
        ag.fillStyle = shelf.color;
        ag.fillRect(cx, cy, 64, 256);
        ag.fillStyle = "rgba(0,0,0,0.25)";
        ag.fillRect(cx, cy, 6, 256);
        ag.fillStyle = "#c9a227";
        ag.fillRect(cx, cy + 18, 64, 6);
        ag.fillRect(cx, cy + 232, 64, 6);
        ag.save();
        ag.translate(cx + 40, cy + 220);
        ag.rotate(-Math.PI / 2);
        ag.fillStyle = "#14120f";
        ag.font = '800 34px "JetBrains Mono", monospace';
        fitText(ag, z.number != null ? `ZIP ${z.number}` : "DRAFT", 0, 0, 190);
        ag.restore();
        // the book itself: a box whose aisle face shows its atlas cell
        const h = 0.4 + ((z.number ?? k) % 5) * 0.025,
          w = 0.13;
        const geo = new THREE.BoxGeometry(0.3, h, w);
        const face = dir > 0 ? 0 : 1; // +x or −x face of the box
        const uv = geo.attributes.uv as THREE.BufferAttribute;
        const u0 = cx / 2048,
          u1 = (cx + 64) / 2048,
          v0 = 1 - (cy + 256) / 2048,
          v1 = 1 - cy / 2048;
        // seen from the aisle, both ±x faces of a BoxGeometry run left to right in u, up in v
        const corners = [
          [u0, v1],
          [u1, v1],
          [u0, v0],
          [u1, v0],
        ];
        for (let c = 0; c < 4; c++) uv.setXY(face * 4 + c, corners[c][0], corners[c][1]);
        const mats = Array.from({ length: 6 }, (_, f) => (f === face ? spineMat : cover));
        const book = new THREE.Mesh(geo, mats);
        // eye-level board first, then the ones just below and above
        const level = [2, 3, 1, 4, 0][Math.min(4, Math.floor(k / perBoard))],
          slot = k % perBoard;
        book.position.set(fx - dir * 0.17, STACKS_Y + 0.27 + level * 0.55 + h / 2, RUN_Z0 - 0.5 - slot * 0.2 - Math.random() * 0.03);
        // a few books lean
        if (Math.random() < 0.08) book.rotation.x = (Math.random() - 0.5) * 0.25;
        book.userData.zip = z;
        scene.add(book);
        pickables.push(book);
        hovers.set(book, `<b>${z.number != null ? `ZIP ${z.number}` : "Draft"}</b><span>${esc(z.title)}</span>`);
        picks.set(book, () => ({
          eyebrow: `${z.number != null ? `ZIP ${z.number}` : "Draft ZIP"} · ${z.categories.join(" / ") || "—"}`,
          title: z.title,
          tag: [z.status, z.status === "Final" || z.status === "Active" ? "ok" : z.status === "Proposed" ? "info" : z.status === "Draft" ? "warn" : "muted"],
          stats: [
            ["Created", z.created ?? "—"],
            ["Owners", String(z.owners.length || "—")],
          ],
          body: `${z.summary ? `<p>${esc(z.summary)}</p>` : ""}${z.owners.length ? `<div class="note">By ${esc(z.owners.join(", "))}.</div>` : ""}${z.status_detail ? `<div class="note">${esc(z.status_detail)}</div>` : ""}${z.live ? `<p><a href="${z.live.href}" target="_blank" rel="noopener">See it live on ZScan: ${esc(z.live.label)} ↗</a></p>` : ""}`,
          link: { href: z.url, label: "Read it on zips.z.cash" },
        }));
      });
    });
    atlasTex.needsUpdate = true;
  });

  // ---- 2: the upgrades hall -------------------------------------------------------------------------
  const hallRects = room(scene, {
    x0: -10,
    z0: -26,
    x1: 10,
    z1: 0,
    y: HALL_Y,
    h: 6,
    floor: std("#2c2a33", 0.5, 0.2),
    wall: std("#23212a", 0.9),
    ceiling: std("#141318", 0.9),
  });
  const hallTitle = textPlane("NETWORK UPGRADES · OVERWINTER → NU7", { h: 0.42, color: "#7fe3ff", glow: true });
  hallTitle.position.set(0, HALL_Y + 4.9, -25.85);
  scene.add(hallTitle);
  // a glowing path down the middle, the timeline
  box(scene, 0.12, 0.02, 22, glowMat("#7fe3ff", 1.1), 0, HALL_Y + 0.01, -13);
  for (const [x, z] of [
    [0, -6],
    [0, -14],
    [0, -22],
  ]) {
    const l = new THREE.PointLight("#cfeaff", 10, 14, 1.6);
    l.position.set(x, HALL_Y + 5.4, z);
    scene.add(l);
  }
  void get<{ upgrades: Upgrade[]; current: string; height: number }>("/v1/upgrades").then((u) => {
    if (!u?.upgrades?.length) return;
    u.upgrades.forEach((up, i) => {
      const side = i % 2 ? 1 : -1;
      const z = -3 - i * (21 / Math.max(1, u.upgrades.length - 1));
      const next = !up.activated;
      const color = next ? "#f4b728" : "#7fe3ff";
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.05, 1.0), std(next ? "#3a3020" : "#2a3038", 0.5, 0.3));
      plinth.position.set(side * 2.6, HALL_Y + 0.525, z);
      scene.add(plinth);
      hallRects.push([side * 2.6 - 0.75, z - 0.6, side * 2.6 + 0.75, z + 0.6]);
      box(scene, 1.32, 0.04, 1.02, glowMat(color, 1.4), side * 2.6, HALL_Y + 1.05, z);
      // the plaque facing the path: name, height or date
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 320;
      const g = c.getContext("2d")!;
      g.fillStyle = "#0b0d12";
      g.fillRect(0, 0, 512, 320);
      g.strokeStyle = color;
      g.lineWidth = 6;
      g.strokeRect(8, 8, 496, 304);
      g.textAlign = "center";
      g.fillStyle = color;
      g.font = '800 92px "JetBrains Mono", monospace';
      fitText(g, up.label, 256, 130);
      g.fillStyle = "#e9eef7";
      g.font = '500 34px "JetBrains Mono", monospace';
      fitText(g, up.activation_height ? `block ${num(up.activation_height)}` : up.announced_date ? `due ${up.announced_date}` : "coming", 256, 200);
      g.fillStyle = "#8a93a6";
      g.font = '500 28px "JetBrains Mono", monospace';
      fitText(g, `${up.target_block_time}s blocks`, 256, 260);
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75), new THREE.MeshBasicMaterial({ map: canvasTexture(c), toneMapped: false }));
      plaque.position.set(side * 2.6 - side * 0.66, HALL_Y + 1.45, z);
      plaque.rotation.y = side > 0 ? -Math.PI / 2 + 0.35 : Math.PI / 2 - 0.35;
      scene.add(plaque);
      pickables.push(plaque, plinth);
      const zips = [...up.summary.matchAll(/ZIPs? ([\d/ ,]+\d)/g)].flatMap((m) => m[1].split(/[/ ,]+/).filter(Boolean));
      const info = (): PickInfo => ({
        eyebrow: `Network upgrade${next ? " · next" : ""}`,
        title: up.label,
        tag: [next ? "Coming" : "Active", next ? "warn" : "ok"],
        stats: [
          ["Height", up.activation_height ? num(up.activation_height) : "—"],
          ["Block time", `${up.target_block_time} s`],
          ["Branch", up.branch_id ?? "—"],
          ["Date", up.announced_date ?? (up.activated ? "past" : "—")],
        ],
        body: `<p>${esc(up.summary)}</p>${zips.length ? `<p>${zips.map((n) => `<a href="https://zips.z.cash/zip-${n.padStart(4, "0")}" target="_blank" rel="noopener">ZIP ${n} ↗</a>`).join(" · ")}</p>` : ""}`,
        link: { href: "https://zscan.cash/upgrades", label: "Upgrades on ZScan" },
      });
      for (const o of [plaque, plinth]) {
        picks.set(o, info);
        hovers.set(o, `<b>${esc(up.label)}</b><span>${esc(up.summary)}</span>`);
      }
    });
  });

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) if (picks.has(x)) return x;
    return null;
  };
  return {
    key: "library",
    title: "LIBRARY",
    scene,
    floors: [
      { label: "G", name: "Press room · Zcash news", y: PRESS_Y, spawn: new THREE.Vector3(0, PRESS_Y, -1.5), yaw: 0 },
      { label: "1", name: "ZIP stacks · every improvement proposal", y: STACKS_Y, spawn: new THREE.Vector3(0, STACKS_Y, -2), yaw: 0 },
      { label: "2", name: "Upgrades hall · Overwinter to NU7", y: HALL_Y, spawn: new THREE.Vector3(0, HALL_Y, -1.2), yaw: 0 },
    ],
    colliders: (f) => (f === 0 ? pressRects : f === 1 ? stacksRects : hallRects),
    pickables: () => pickables,
    pick: (hit) => {
      const o = find(hit.object);
      return o ? picks.get(o)!() : null;
    },
    hover: (hit) => {
      const o = find(hit.object);
      return o ? (hovers.get(o) ?? null) : null;
    },
    update(dt, t, camera) {
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of people) s.update(dt, t, camQuat, camRight);
      for (const k of ticks) k(dt, t);
    },
  };
}
