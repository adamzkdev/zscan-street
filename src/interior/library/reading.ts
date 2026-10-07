import * as THREE from "three";
import { get } from "../../data/zscan";
import { fitText } from "../../scene/fit";
import { READ_Y, canvasTex, esc, glow, std, type Level } from "./kit";
import { WHISPERS } from "./data";

/**
 * The reading room behind the back wall, high over the atrium: today's Zcash news as framed
 * front pages of THE ZCASH TIMES, the ticker over the back wall, long oak tables with green
 * lamps, and a glass wall looking down on the terraces and the sphere.
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

const CATEGORY: Record<string, { label: string; color: string }> = {
  development: { label: "DEVELOPMENT", color: "#59a8ff" },
  grants: { label: "GRANTS", color: "#3ee08f" },
  community: { label: "COMMUNITY", color: "#b07bff" },
  releases: { label: "RELEASES", color: "#ff9f2e" },
  network: { label: "NETWORK", color: "#f4b728" },
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

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

function frontPage(n: NewsItem) {
  return canvasTex(512, 680, (g) => {
    const cat = CATEGORY[n.category] ?? { label: n.category.toUpperCase(), color: "#cccccc" };
    g.fillStyle = "#efe9dc";
    g.fillRect(0, 0, 512, 680);
    g.fillStyle = "#1c1a17";
    g.textAlign = "center";
    g.font = '700 38px Georgia, "Times New Roman", serif';
    fitText(g, "THE ZCASH TIMES", 256, 58);
    g.fillRect(28, 74, 456, 3);
    g.font = '500 15px "JetBrains Mono", monospace';
    fitText(g, `${day(n.published_at).toUpperCase()} · ${n.source_name.toUpperCase()}`, 256, 98);
    g.fillRect(28, 108, 456, 1);
    g.fillStyle = cat.color;
    g.fillRect(28, 124, 456, 30);
    g.fillStyle = "#14120f";
    g.font = '700 16px "JetBrains Mono", monospace';
    g.fillText(cat.label, 256, 145);
    g.textAlign = "left";
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
    g.fillStyle = "rgba(20,18,15,0.18)";
    for (let yy = y + 30; yy < 640; yy += 12) {
      g.fillRect(28, yy, 216, 5);
      g.fillRect(268, yy, 216, 5);
    }
    g.fillStyle = "#1c1a17";
    g.font = '500 13px "JetBrains Mono", monospace';
    g.textAlign = "center";
    g.fillText("news.zscan.cash", 256, 664);
  }).t;
}

export const ROOM = { x0: -12, x1: 12, z0: -80, z1: -64, h: 6 };

export function buildReading(lv: Level) {
  const Y = READ_Y;
  const { x0, x1, z0, z1, h } = ROOM;
  const m = lv.m;
  const oak = std("#8a6440", 0.55),
    darkOak = std("#4a3424", 0.6),
    wallM = std("#f1ece2", 0.85),
    brass = std("#b8913c", 0.35, 0.8);
  // floor: warm oak boards
  const boards = canvasTex(512, 512, (g) => {
    for (let y = 0; y < 512; y += 32) {
      for (let x = (y / 32) % 2 ? -128 : 0; x < 512; x += 256) {
        const l = 34 + ((x * 7 + y * 3) % 9);
        g.fillStyle = `hsl(28, 38%, ${l}%)`;
        g.fillRect(x, y, 256, 32);
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(x, y, 256, 1);
        g.fillRect(x, y, 1, 32);
      }
    }
  });
  boards.t.wrapS = boards.t.wrapT = THREE.RepeatWrapping;
  boards.t.repeat.set(6, 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: boards.t, roughness: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, Y + 0.001, (z0 + z1) / 2);
  lv.group.add(floor);
  // walls (the front one is the atrium's, with the window), coffered ceiling
  m.box(wallM, x1 - x0, h, 0.2, 0, Y, z0 - 0.1);
  m.box(wallM, 0.2, h, z1 - z0, x0 - 0.1, Y, (z0 + z1) / 2);
  m.box(wallM, 0.2, h, z1 - z0, x1 + 0.1, Y, (z0 + z1) / 2);
  m.box(std("#ebe5da", 0.9), x1 - x0, 0.2, z1 - z0, 0, Y + h, (z0 + z1) / 2);
  for (let x = x0 + 3; x < x1; x += 3) m.box(std("#e2dbcd", 0.9), 0.18, 0.3, z1 - z0, x, Y + h - 0.3, (z0 + z1) / 2);
  for (const x of [x0, x1]) {
    m.box(darkOak, 0.06, 1.0, z1 - z0, x + (x < 0 ? 0.03 : -0.03), Y, (z0 + z1) / 2);
    m.box(darkOak, 0.06, 0.06, z1 - z0, x + (x < 0 ? 0.03 : -0.03), Y + 3.4, (z0 + z1) / 2);
  }
  m.box(darkOak, x1 - x0, 1.0, 0.06, 0, Y, z0 + 0.03);
  // the glass balustrade at the window and a brass rail
  m.box(new THREE.MeshStandardMaterial({ color: "#cfe6ee", transparent: true, opacity: 0.18, roughness: 0.05 }), 20, 1.05, 0.04, 0, Y, z1 - 0.15);
  m.box(brass, 20, 0.05, 0.08, 0, Y + 1.05, z1 - 0.15);
  // the long tables with green banker's lamps, chairs
  const shade = glow("#3ad08a", 0.9);
  const bulb = glow("#ffe2a8", 2.2);
  const tables: [number, number][] = [
    [-5.5, -69],
    [5.5, -69],
    [-5.5, -74],
    [5.5, -74],
  ];
  for (const [tx, tz] of tables) {
    m.box(oak, 7, 0.07, 1.6, tx, Y + 0.76, tz);
    for (const sx of [-3.2, 3.2]) m.box(darkOak, 0.1, 0.76, 1.3, tx + sx, Y, tz);
    m.box(darkOak, 6.2, 0.08, 0.1, tx, Y + 0.3, tz);
    for (const lx of [-2.2, 0, 2.2]) {
      m.box(brass, 0.04, 0.32, 0.04, tx + lx, Y + 0.83, tz);
      m.box(shade, 0.5, 0.12, 0.2, tx + lx, Y + 1.13, tz);
      m.box(bulb, 0.44, 0.02, 0.14, tx + lx, Y + 1.12, tz);
      for (const sz of [-1, 1]) {
        m.box(std("#efe9dc", 0.95), 0.36, 0.01, 0.48, tx + lx + 0.5, Y + 0.835, tz + sz * 0.42);
        // chairs
        m.box(darkOak, 0.46, 0.06, 0.46, tx + lx - 0.6, Y + 0.45, tz + sz * 1.2);
        m.box(darkOak, 0.46, 0.5, 0.06, tx + lx - 0.6, Y + 0.48, tz + sz * 1.43);
        for (const [cx, cz] of [
          [-0.2, -0.2],
          [0.2, -0.2],
          [-0.2, 0.2],
          [0.2, 0.2],
        ])
          m.box(darkOak, 0.04, 0.45, 0.04, tx + lx - 0.6 + cx, Y, tz + sz * 1.2 + cz);
      }
    }
    lv.rects.push([tx - 3.6, tz - 1.6, tx + 3.6, tz + 1.6]);
  }
  // masthead and ticker over the back wall
  const mast = canvasTex(1024, 96, (g) => {
    g.clearRect(0, 0, 1024, 96);
    g.fillStyle = "#1c1a17";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = '700 64px Georgia, "Times New Roman", serif';
    g.fillText("THE ZCASH TIMES · READING ROOM", 512, 52);
  });
  const mastM = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.94), new THREE.MeshBasicMaterial({ map: mast.t, transparent: true }));
  mastM.position.set(0, Y + 4.7, z0 + 0.02);
  lv.group.add(mastM);
  const tick = canvasTex(2048, 96, () => {});
  const ticker = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.56), new THREE.MeshBasicMaterial({ map: tick.t, toneMapped: false }));
  ticker.position.set(0, Y + 3.75, z0 + 0.03);
  lv.group.add(ticker);
  m.box(std("#111014", 0.5, 0.5), 12.2, 0.7, 0.06, 0, Y + 3.4, z0 + 0.0);
  let headlines = "  LOADING THE NEWS…  ";
  let tx = 0,
    last = 0;
  lv.ticks.push((dt, t) => {
    if (!lv.here) return;
    tx -= dt * 140;
    if (t - last < 1 / 24) return;
    last = t;
    const g = tick.g;
    g.fillStyle = "#08070a";
    g.fillRect(0, 0, 2048, 96);
    g.font = '700 46px "JetBrains Mono", monospace';
    g.fillStyle = "#ffd28a";
    g.textBaseline = "alphabetic";
    const w = g.measureText(headlines).width;
    if (tx < -w) tx += w;
    for (let x = tx; x < 2048; x += w) g.fillText(headlines, x, 64);
    tick.t.needsUpdate = true;
  });
  // the front pages along both side walls
  const slots: { pos: THREE.Vector3; yaw: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const z = -66.4 - k * 2.25;
    slots.push({ pos: new THREE.Vector3(x0 + 0.06, Y + 2.15, z), yaw: Math.PI / 2 }, { pos: new THREE.Vector3(x1 - 0.06, Y + 2.15, z), yaw: -Math.PI / 2 });
  }
  void get<NewsItem[]>("/v1/news?limit=40").then((news) => {
    if (!news?.length) return void (headlines = "  news.zscan.cash  ");
    headlines = news.map((n) => `  ${n.title.toUpperCase()}  ◆`).join("") + "  ";
    news.slice(0, slots.length).forEach((n, i) => {
      const { pos, yaw } = slots[i];
      const cat = CATEGORY[n.category]?.color ?? "#cccccc";
      const frame = new THREE.Group();
      frame.position.copy(pos);
      frame.rotation.y = yaw;
      const border = new THREE.Mesh(new THREE.BoxGeometry(1.58, 2.08, 0.05), std("#2a1d14", 0.6));
      const page = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 1.92), new THREE.MeshStandardMaterial({ map: frontPage(n), roughness: 0.9 }));
      page.position.z = 0.03;
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.05, 0.06), glow(cat, 1.3));
      band.position.y = -1.07;
      frame.add(border, page, band);
      lv.group.add(frame);
      lv.pick(page, `<b>${esc(n.title)}</b><span>${esc(n.source_name)} · ${day(n.published_at)}</span>`, () => ({
        eyebrow: `${CATEGORY[n.category]?.label ?? n.category} · ${n.source_name}`,
        title: n.title,
        tag: [day(n.published_at), "muted"],
        body: n.summary ? `<p>${esc(n.summary)}</p>` : undefined,
        link: { href: n.url, label: "Read the story" },
      }));
    });
  });
  for (const [x, z] of [
    [-5.5, -71.5],
    [5.5, -71.5],
    [0, -77.5],
  ]) {
    const l = new THREE.PointLight("#ffe2b8", 14, 16, 1.6);
    l.position.set(x, Y + 4.8, z);
    lv.group.add(l);
  }
  lv.rects.push([x0 - 0.3, z0 - 0.3, x1 + 0.3, z0 + 0.05], [x0 - 0.3, z0, x0 + 0.05, z1], [x1 - 0.05, z0, x1 + 0.3, z1], [x0, z1 - 0.4, x1, z1 + 0.3]);
  // readers at the tables, an editor
  void lv.person(4242, -7.7, Y, -71.6, "Editor", { lines: ["Today's paper is on the walls.", "Every headline comes from news.zscan.cash.", "Shh, deadline."], face: new THREE.Vector3(0, 0, 1), wander: [[-8, -71.6], [8, -71.6], [0, -66], [0, -78]] });
  void lv.person(808, -4.9, Y, -67.8, "Reader", { sit: true, face: new THREE.Vector3(0, 0, -1), lines: WHISPERS.reader });
  void lv.person(2718, 6.1, Y, -75.2, "Reader", { sit: true, face: new THREE.Vector3(0, 0, 1), lines: WHISPERS.reader });
  void lv.person(5150, 3.5, Y, -72.8, "Student", { sit: true, face: new THREE.Vector3(0, 0, -1), lines: WHISPERS.student });
}
