import * as THREE from "three";
import type { PickInfo } from "../types";
import { ZIP_GROUPS, loadZips, type Zip } from "./data";
import { ZIP_Y, canvasTex, esc, glow, std, type Level } from "./kit";

/**
 * The ZIP ARCHIVE, the library's top floor: every Zcash Improvement Proposal as a numbered volume.
 * Six tall bookcases (three per side wall), one per status: Final, Active and Proposed on the
 * left, Draft, Archived (obsolete, withdrawn, rejected) and Reserved on the right. The ZIPs stand
 * at eye level, their numbers on the spines, among plain binders. The index board on the back
 * wall shows every ZIP by number in its status colour; long tables with readers who talk about
 * the ZIPs in front of them. A click on a volume or a board cell opens the ZIP: number, title,
 * status, authors, created, abstract, and the full text on zips.z.cash.
 */

export const ARCHIVE = { x0: -13, x1: 13, z0: -100, z1: -66, h: 7 };

/** Status groups with what the status means, in shelf order. */
const NOTES: Record<string, string> = {
  FINAL: "implemented and deployed",
  ACTIVE: "in effect, kept up to date",
  PROPOSED: "proposed for adoption",
  DRAFT: "work in progress",
  ARCHIVED: "obsolete, withdrawn or rejected",
  RESERVED: "numbers set aside, not yet written",
};
const GROUPS = ZIP_GROUPS.map((g) => ({ ...g, note: NOTES[g.label] ?? "" }));

const zipName = (z: Zip) => (z.number != null ? `ZIP ${z.number}` : "Draft ZIP");
const tone = (s: string): "ok" | "info" | "warn" | "muted" => (s === "Final" || s === "Active" ? "ok" : s === "Proposed" ? "info" : s === "Draft" ? "warn" : "muted");
const groupOf = (z: Zip) => GROUPS.find((g) => g.has(z.status)) ?? GROUPS[GROUPS.length - 1];

/** The panel for one ZIP: real data, the abstract, the full text on zips.z.cash. */
export function zipInfo(z: Zip): PickInfo {
  const year = z.created?.slice(0, 4);
  return {
    eyebrow: `${zipName(z)} · ${esc(z.categories.join(" / ") || "ZIP")}`,
    title: esc(z.title),
    tag: [z.status_detail ? `${z.status} · ${z.status_detail}` : z.status, tone(z.status)],
    stats: [
      ["Number", z.number != null ? String(z.number) : "unnumbered draft"],
      ["Status", esc(z.status)],
      ["Created", z.created ?? "—"],
      ["Authors", String(z.owners.length || "—")],
    ],
    body:
      (z.summary ? `<p>${esc(z.summary)}</p>` : `<p>${z.status === "Reserved" ? "A reserved number: no abstract in the ZIP index yet." : "No abstract in the ZIP index; the full text is on zips.z.cash."}</p>`) +
      (z.owners.length ? `<div class="note">${esc(z.owners.join(", "))}${year ? ` · ${year}` : ""}</div>` : "") +
      (z.live ? `<p><a href="${z.live.href}" target="_blank" rel="noopener">${esc(z.live.label)} on ZScan ↗</a></p>` : ""),
    link: { href: z.url, label: "Read the full text on zips.z.cash" },
  };
}

/** Spine atlas: 32 × 8 cells of 64 × 256 px. */
const CW = 64,
  CH = 256,
  COLS = 32;
function spine(g: CanvasRenderingContext2D, cell: number, color: string, text: string) {
  const cx = (cell % COLS) * CW,
    cy = Math.floor(cell / COLS) * CH;
  g.fillStyle = color;
  g.fillRect(cx, cy, CW, CH);
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(cx, cy, 4, CH);
  g.fillRect(cx + CW - 3, cy, 3, CH);
  g.fillStyle = "#14120f";
  g.fillRect(cx, cy + 14, CW, 26);
  g.fillStyle = "#e9d9a6";
  g.font = '800 15px "JetBrains Mono", monospace';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("ZIP", cx + CW / 2, cy + 28);
  g.fillStyle = "#c9a227";
  g.fillRect(cx, cy + CH - 22, CW, 4);
  g.save();
  g.translate(cx + CW / 2 + 2, cy + 46 + (CH - 76) / 2);
  g.rotate(-Math.PI / 2);
  g.fillStyle = "#14120f";
  let size = 46;
  g.font = `800 ${size}px "JetBrains Mono", monospace`;
  while (g.measureText(text).width > CH - 84 && size > 14) g.font = `800 ${--size}px "JetBrains Mono", monospace`;
  g.textAlign = "center";
  g.fillText(text, 0, 0);
  g.restore();
}
const cellUV = (cell: number): [number, number, number, number] => {
  const cx = (cell % COLS) * CW,
    cy = Math.floor(cell / COLS) * CH;
  return [cx / 2048, 1 - (cy + CH) / 2048, (cx + CW) / 2048, 1 - cy / 2048];
};

interface Vol {
  x: number;
  y: number;
  z: number;
  th: number;
  h: number;
  d: number;
  side: number;
  zip: Zip | null;
  group: (typeof GROUPS)[number];
}

/** Volumes on the side walls, merged; the spine faces the room (side −1 = left wall, +1 = right). */
class Volumes {
  pos: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  vols: Vol[] = [];
  add(v: Vol, color: string, cell: number) {
    const c = new THREE.Color(color);
    const fx = v.x - v.side * (v.d / 2); // spine plane, facing the room (−side)
    const bx = v.x + v.side * (v.d / 2);
    const z0 = v.z - v.th / 2,
      z1 = v.z + v.th / 2,
      y0 = v.y,
      y1 = v.y + v.h;
    const [u0, v0, u1, v1] = cell ? cellUV(cell) : [0.001, 0.001, 0.002, 0.002];
    const face = (q: number[][], uvs: number[][] | null, k: number) => {
      for (const i of [0, 1, 2, 0, 2, 3]) {
        this.pos.push(...q[i]);
        this.uv.push(...(uvs ? uvs[i] : [0.0015, 0.0015]));
        this.col.push(c.r * k, c.g * k, c.b * k);
      }
    };
    // spine, counter-clockwise seen from the room; seen from −side, "left" is +z on the left wall
    const L = v.side < 0 ? z1 : z0,
      R = v.side < 0 ? z0 : z1;
    face(
      [
        [fx, y0, L],
        [fx, y0, R],
        [fx, y1, R],
        [fx, y1, L],
      ],
      cell
        ? [
            [u0, v0],
            [u1, v0],
            [u1, v1],
            [u0, v1],
          ]
        : null,
      1,
    );
    if (cell) {
      // the atlas carries the colour on the spine
      const n = this.col.length;
      for (let i = n - 18; i < n; i++) this.col[i] = 1;
    }
    face(
      [
        [fx, y1, L],
        [fx, y1, R],
        [bx, y1, R],
        [bx, y1, L],
      ],
      null,
      0.8,
    );
    const A = v.side < 0 ? fx : bx,
      B = v.side < 0 ? bx : fx;
    face(
      [
        [A, y0, z0],
        [B, y0, z0],
        [B, y1, z0],
        [A, y1, z0],
      ],
      null,
      0.65,
    );
    face(
      [
        [B, y0, z1],
        [A, y0, z1],
        [A, y1, z1],
        [B, y1, z1],
      ],
      null,
      0.65,
    );
    face(
      [
        [fx, y0, R],
        [fx, y0, L],
        [bx, y0, L],
        [bx, y0, R],
      ],
      null,
      0.4,
    );
    this.vols.push(v);
  }
  mesh(mat: THREE.Material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
}

/** Notable ZIPs readers like to bring up, if they are on the shelves. */
const NOTABLE = [0, 32, 200, 224, 225, 244, 316, 317, 321, 1014, 1015, 1016, 2001, 2005];

/** Lines about real ZIPs: number, title, authors, year, status. */
function talkAbout(list: Zip[], n = 6): string[] {
  const pick = [...list.filter((z) => z.number != null && NOTABLE.includes(z.number)), ...list.filter((z) => z.number != null && !NOTABLE.includes(z.number))].slice(0, n);
  const out: string[] = [];
  pick.forEach((z, i) => {
    const short = z.title.length > 46 ? `${z.title.slice(0, 44).replace(/\s+\S*$/, "")}…` : z.title;
    if (i % 3 === 0) out.push(`${zipName(z)}: ${short}.`);
    else if (i % 3 === 1 && z.owners.length) out.push(`${zipName(z)}, by ${z.owners[0]}${z.owners.length > 1 ? " and others" : ""}.`);
    else if (z.created) out.push(`${zipName(z)} dates from ${z.created.slice(0, 4)}. ${z.status}.`);
    else out.push(`${zipName(z)} is ${z.status}.`);
  });
  return out;
}

export function buildZipArchive(lv: Level) {
  const Y = ZIP_Y;
  const { x0, x1, z0, z1, h } = ARCHIVE;
  const m = lv.m;
  const walnut = std("#5a3e28", 0.55),
    darkWood = std("#3a281c", 0.6),
    wall = std("#e9e2d2", 0.85),
    brass = std("#b8913c", 0.35, 0.8),
    green = std("#24443a", 0.8);

  // ---- the room: a stone floor with a runner, panelled walls, a coffered ceiling with skylights --------
  const stone = canvasTex(512, 512, (g) => {
    for (let y = 0; y < 512; y += 128)
      for (let x = 0; x < 512; x += 128) {
        g.fillStyle = `hsl(36, 14%, ${70 + ((x * 3 + y * 7) % 5)}%)`;
        g.fillRect(x, y, 128, 128);
        g.fillStyle = "rgba(60,50,40,0.25)";
        g.fillRect(x, y, 128, 2);
        g.fillRect(x, y, 2, 128);
      }
  });
  stone.t.wrapS = stone.t.wrapT = THREE.RepeatWrapping;
  stone.t.repeat.set((x1 - x0) / 4, (z1 - z0) / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: stone.t, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, Y + 0.001, (z0 + z1) / 2);
  floor.raycast = () => {};
  lv.group.add(floor);
  m.box(std("#7a2a2a", 0.95), 2.4, 0.01, z1 - z0 - 6, 0, Y + 0.002, (z0 + z1) / 2 + 1);
  m.box(wall, x1 - x0 + 0.4, h, 0.2, 0, Y, z0 - 0.1);
  m.box(wall, x1 - x0 + 0.4, h, 0.2, 0, Y, z1 + 0.1);
  m.box(wall, 0.2, h, z1 - z0, x0 - 0.1, Y, (z0 + z1) / 2);
  m.box(wall, 0.2, h, z1 - z0, x1 + 0.1, Y, (z0 + z1) / 2);
  m.box(green, x1 - x0, 1.0, 0.04, 0, Y, z1 - 0.02);
  m.box(green, x1 - x0, 1.0, 0.04, 0, Y, z0 + 0.02);
  m.box(std("#ebe5da", 0.9), x1 - x0 + 0.4, 0.2, z1 - z0 + 0.4, 0, Y + h, (z0 + z1) / 2);
  const sky = glow("#fff3dc", 1.25);
  for (let z = z1 - 4; z > z0 + 2; z -= 5) {
    m.box(std("#e2dbcd", 0.9), x1 - x0, 0.35, 0.2, 0, Y + h - 0.35, z);
    m.box(sky, 6, 0.04, 3.2, 0, Y + h - 0.06, z - 2.5);
  }
  for (const x of [-6.5, 6.5]) m.box(std("#e2dbcd", 0.9), 0.2, 0.35, z1 - z0, x, Y + h - 0.35, (z0 + z1) / 2);
  lv.rects.push([x0 - 0.4, z0 - 0.4, x1 + 0.4, z0 + 0.05], [x0 - 0.4, z1 - 0.05, x1 + 0.4, z1 + 0.4], [x0 - 0.4, z0, x0 + 0.05, z1], [x1 - 0.05, z0, x1 + 0.4, z1]);

  // ---- the lift doors on the front wall ---------------------------------------------------------------
  for (const [x, to, name] of [
    [-3.2, 0, "Atrium"],
    [3.2, 3, "Reading room"],
  ] as const) {
    m.box(std("#b8a27a", 0.35, 0.7), 1.6, 2.3, 0.08, x, Y, z1 - 0.06);
    m.box(std("#4a4038", 0.4, 0.5), 0.03, 2.3, 0.1, x, Y, z1 - 0.08);
    m.box(glow("#ffd9a0", 1.4), 0.4, 0.06, 0.04, x, Y + 2.45, z1 - 0.1);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.3), new THREE.MeshBasicMaterial({ visible: false }));
    door.position.set(x, Y + 1.15, z1 - 0.12);
    door.rotation.y = Math.PI;
    lv.group.add(door);
    lv.pick(door, `<b>Lift</b><span>to the ${name.toLowerCase()}</span>`, () => ({ eyebrow: "LIFT", title: name, floor: to }));
  }
  // a sign over the lifts, seen from the back of the room
  const sign = canvasTex(1024, 128, (g) => {
    g.fillStyle = "#1c1a17";
    g.fillRect(0, 0, 1024, 128);
    g.fillStyle = "#f4b728";
    g.fillRect(0, 118, 1024, 10);
    g.fillStyle = "#f6f1e6";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = '800 58px "JetBrains Mono", monospace';
    g.fillText("ZIP ARCHIVE", 512, 60);
  });
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.75), new THREE.MeshBasicMaterial({ map: sign.t }));
  signM.position.set(0, Y + 3.6, z1 - 0.13);
  signM.rotation.y = Math.PI;
  signM.raycast = () => {};
  lv.group.add(signM);

  // ---- the bookcases: three per side wall, one per status ------------------------------------------
  const CASE_LEN = 8,
    CASE_D = 0.5,
    CASE_H = 3.1,
    SHELF = 0.5,
    ROWS = 6;
  const cases: { side: number; cz: number }[] = [];
  for (const side of [-1, 1]) for (const cz of [-74.5, -83.5, -92.5]) cases.push({ side, cz });
  for (const { side, cz } of cases) {
    const wx = side < 0 ? x0 : x1;
    const cx = wx - side * (CASE_D / 2);
    m.box(darkWood, CASE_D, CASE_H, 0.08, cx, Y, cz - CASE_LEN / 2);
    m.box(darkWood, CASE_D, CASE_H, 0.08, cx, Y, cz + CASE_LEN / 2);
    m.box(darkWood, CASE_D + 0.06, 0.12, CASE_LEN + 0.2, cx - side * 0.03, Y + CASE_H, cz);
    m.box(walnut, 0.04, CASE_H, CASE_LEN, wx - side * 0.02, Y, cz);
    for (let r = 0; r <= ROWS; r++) m.box(walnut, CASE_D, 0.04, CASE_LEN, cx, Y + 0.04 + r * SHELF, cz);
    // a rolling ladder on a brass rail
    m.box(brass, 0.03, 0.03, CASE_LEN, wx - side * (CASE_D + 0.08), Y + 2.7, cz);
    const lz = cz + CASE_LEN * 0.3;
    for (const dz of [-0.22, 0.22]) m.box(darkWood, 0.05, 2.75, 0.05, wx - side * (CASE_D + 0.45), Y, lz + dz, 0, side * -0.16);
    lv.rects.push(side < 0 ? [x0, cz - CASE_LEN / 2 - 0.05, x0 + CASE_D + 0.15, cz + CASE_LEN / 2 + 0.05] : [x1 - CASE_D - 0.15, cz - CASE_LEN / 2 - 0.05, x1, cz + CASE_LEN / 2 + 0.05]);
  }

  // ---- the index board on the back wall --------------------------------------------------------------
  const BW = 10,
    BH = 5;
  const board = canvasTex(2048, 1024, (g) => {
    g.fillStyle = "#16130f";
    g.fillRect(0, 0, 2048, 1024);
    g.fillStyle = "#f6f1e6";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = '800 64px "JetBrains Mono", monospace';
    g.fillText("ZIP INDEX · LOADING…", 1024, 512);
  });
  const boardM = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: board.t, toneMapped: false }));
  boardM.position.set(0, Y + 1.15 + BH / 2, z0 + 0.06);
  lv.group.add(boardM);
  m.box(darkWood, BW + 0.3, BH + 0.3, 0.08, 0, Y + 1.0, z0 + 0.02);
  m.box(darkWood, BW + 0.3, 0.9, 0.5, 0, Y, z0 + 0.25);
  lv.rects.push([-BW / 2 - 0.2, z0, BW / 2 + 0.2, z0 + 0.55]);

  // ---- reading tables down the middle ----------------------------------------------------------------
  const shade = glow("#3ad08a", 0.9),
    bulb = glow("#ffe2a8", 2.2);
  const tables: [number, number][] = [
    [-4.6, -80],
    [4.6, -80],
    [-4.6, -89],
    [4.6, -89],
  ];
  for (const [tx, tz] of tables) {
    m.box(walnut, 1.6, 0.07, 6, tx, Y + 0.76, tz);
    for (const dz of [-2.7, 2.7]) m.box(darkWood, 1.3, 0.76, 0.1, tx, Y, tz + dz);
    for (const lz of [-1.8, 0, 1.8]) {
      m.box(brass, 0.04, 0.32, 0.04, tx, Y + 0.83, tz + lz);
      m.box(shade, 0.2, 0.12, 0.5, tx, Y + 1.13, tz + lz);
      m.box(bulb, 0.14, 0.02, 0.44, tx, Y + 1.12, tz + lz);
      for (const sx of [-1, 1]) {
        m.box(std("#efe9dc", 0.95), 0.48, 0.01, 0.36, tx + sx * 0.42, Y + 0.835, tz + lz + 0.5);
        m.box(darkWood, 0.46, 0.06, 0.46, tx + sx * 1.2, Y + 0.45, tz + lz - 0.6);
        m.box(darkWood, 0.06, 0.5, 0.46, tx + sx * 1.43, Y + 0.48, tz + lz - 0.6);
      }
    }
    lv.rects.push([tx - 1.6, tz - 3.1, tx + 1.6, tz + 3.1]);
  }

  // ---- lights -----------------------------------------------------------------------------------------
  for (const [x, z] of [
    [0, -71],
    [0, -83],
    [0, -95],
    [-9, -83],
    [9, -83],
  ]) {
    const l = new THREE.PointLight("#ffe6c4", 22, 22, 1.4);
    l.position.set(x, Y + h - 0.6, z);
    lv.group.add(l);
  }

  // ---- hover highlight ----------------------------------------------------------------------------
  const hi = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glow("#ffd98a", 0.9));
  (hi.material as THREE.MeshBasicMaterial).transparent = true;
  (hi.material as THREE.MeshBasicMaterial).opacity = 0.45;
  hi.visible = false;
  hi.raycast = () => {};
  lv.group.add(hi);
  let hiAt = 0;
  lv.ticks.push(() => {
    if (hi.visible && performance.now() - hiAt > 200) hi.visible = false;
  });

  // ---- the ZIPs ------------------------------------------------------------------------------------
  const lines = {
    archivist: ["Welcome to the ZIP archive.", "Every Zcash Improvement Proposal is on these shelves.", "Click a spine to open a ZIP.", "Green spines are Final: live on the network.", "Full texts are on zips.z.cash."],
  };
  const rnd = (() => {
    let a = 4242;
    return () => ((a = (a * 16807) % 2147483647) / 2147483647);
  })();

  void loadZips().then((zips) => {
    if (!zips.length) {
      board.g.fillStyle = "#16130f";
      board.g.fillRect(0, 0, 2048, 1024);
      board.g.fillStyle = "#f6f1e6";
      board.g.fillText("ZIP INDEX · zips.z.cash", 1024, 512);
      board.t.needsUpdate = true;
      return;
    }
    const byNum = (a: Zip, b: Zip) => (a.number ?? 1e6) - (b.number ?? 1e6) || a.slug.localeCompare(b.slug);
    const groups = GROUPS.map((g) => ({ ...g, list: zips.filter((z) => g.has(z.status)).sort(byNum) }));

    // spines
    const atlas = canvasTex(2048, 2048, (g) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 2048, 2048);
    });
    const vols = new Volumes();
    let cell = 1;
    const ROW_LEN = CASE_LEN - 0.2;
    groups.forEach((g, gi) => {
      const { side, cz } = cases[gi];
      const wx = side < 0 ? x0 : x1;
      const base = new THREE.Color(g.color);
      const binder = () => `#${base.clone().lerp(new THREE.Color("#6a5a48"), 0.55 + rnd() * 0.25).offsetHSL(0, 0, (rnd() - 0.5) * 0.12).getHexString()}`;
      const fill = (r: number, a: number, b: number) => {
        for (let z = a; z < b - 0.04; ) {
          const th = Math.min(b - z - 0.005, 0.045 + rnd() * 0.05);
          if (th < 0.03) break;
          const d = 0.3 + rnd() * 0.06;
          vols.add({ x: wx - side * (0.06 + d / 2), y: Y + 0.082 + r * SHELF, z: z + th / 2, th, h: SHELF * (0.62 + rnd() * 0.24), d, side, zip: null, group: g }, binder(), 0);
          z += th + 0.004;
        }
      };
      const za = cz - ROW_LEN / 2,
        zb = cz + ROW_LEN / 2;
      // ZIP volumes at chest and eye level (row 2, then 3), read left to right from the aisle
      const perRow = Math.floor(ROW_LEN / 0.17);
      const rowsOf = [g.list.slice(0, perRow), g.list.slice(perRow, perRow * 2)];
      for (let r = 0; r < ROWS; r++) {
        const zr = r === 2 ? rowsOf[0] : r === 3 ? rowsOf[1] : [];
        if (!zr.length) {
          fill(r, za, zb);
          continue;
        }
        const step = ROW_LEN / zr.length;
        zr.forEach((z, k) => {
          // reading order: on the left wall the room's left is +z, on the right wall −z
          const slot = side < 0 ? zb - step * (k + 1) : za + step * k;
          const th = Math.min(0.13, step - 0.01);
          const mid = slot + step / 2;
          const c = cell++;
          spine(atlas.g, c, g.color, z.number != null ? String(z.number) : "DRAFT");
          vols.add({ x: wx - side * (0.05 + 0.17), y: Y + 0.082 + r * SHELF, z: mid, th, h: 0.4, d: 0.34, side, zip: z, group: g }, g.color, c);
          fill(r, slot + 0.004, mid - th / 2 - 0.004);
          fill(r, mid + th / 2 + 0.004, slot + step);
        });
      }
    });
    atlas.t.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: atlas.t, vertexColors: true, roughness: 0.7 });
    const mesh = vols.mesh(mat);
    lv.group.add(mesh);
    const groupInfo = (g: (typeof groups)[number]): PickInfo => ({
      eyebrow: "ZIP ARCHIVE · STATUS",
      title: g.label,
      tag: [`${g.list.length} ZIPs · ${g.note}`, "info"],
      body: g.list.map((z) => `<p><a href="${z.url}" target="_blank" rel="noopener"><b>${zipName(z)}</b></a> · ${esc(z.title)}${z.status !== g.label[0] + g.label.slice(1).toLowerCase() ? ` <i>(${esc(z.status)})</i>` : ""}</p>`).join(""),
      link: { href: "https://zips.z.cash/", label: "The ZIP index on zips.z.cash" },
    });
    lv.pick(
      mesh,
      (hit) => {
        const v = vols.vols[Math.floor((hit.faceIndex ?? 0) / 10)];
        if (!v) return null;
        hi.visible = true;
        hi.position.set(v.x - v.side * 0.06, v.y + v.h / 2, v.z);
        hi.scale.set(v.d + 0.012, v.h + 0.012, v.th + 0.012);
        hiAt = performance.now();
        return v.zip ? `<b>${zipName(v.zip)}</b><span>${esc(v.zip.title)} · ${esc(v.zip.status)}</span>` : `<b>${v.group.label}</b><span>${groups.find((g) => g.label === v.group.label)?.list.length ?? 0} ZIPs · ${v.group.note}</span>`;
      },
      (hit) => {
        const v = vols.vols[Math.floor((hit.faceIndex ?? 0) / 10)];
        if (!v) return null;
        return v.zip ? zipInfo(v.zip) : groupInfo(groups.find((g) => g.label === v.group.label)!);
      },
    );

    // headers over the cases
    groups.forEach((g, gi) => {
      const { side, cz } = cases[gi];
      const wx = side < 0 ? x0 : x1;
      const first = g.list.find((z) => z.number != null)?.number,
        last = [...g.list].reverse().find((z) => z.number != null)?.number;
      const t = canvasTex(1024, 192, (c) => {
        c.fillStyle = "#16130f";
        c.fillRect(0, 0, 1024, 192);
        c.fillStyle = g.color;
        c.fillRect(0, 0, 18, 192);
        c.fillRect(0, 180, 1024, 12);
        c.fillStyle = "#f6f1e6";
        c.textBaseline = "middle";
        c.font = '800 76px "JetBrains Mono", monospace';
        c.fillText(g.label, 48, 66);
        c.fillStyle = g.color;
        c.textAlign = "right";
        c.fillText(String(g.list.length), 990, 66);
        c.textAlign = "left";
        c.fillStyle = "#c9b48a";
        c.font = '500 34px "JetBrains Mono", monospace';
        c.fillText(`${g.note}${first != null ? ` · ZIP ${first}${last !== first ? `–${last}` : ""}` : ""}`, 48, 140);
      });
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.79), new THREE.MeshBasicMaterial({ map: t.t }));
      pm.position.set(wx - side * (CASE_D + 0.04), Y + CASE_H + 0.62, cz);
      pm.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      lv.group.add(pm);
      lv.pick(pm, `<b>${g.label}</b><span>${g.list.length} ZIPs · ${g.note}</span>`, () => groupInfo(g));
    });

    // the index board: every ZIP by number, coloured by status
    const sorted = [...zips].sort(byNum);
    const COLS_B = 15,
      top = 210,
      pad = 34;
    const rowsB = Math.ceil(sorted.length / COLS_B);
    const cw = (2048 - pad * 2) / COLS_B,
      ch = (1024 - top - pad) / rowsB;
    const g = board.g;
    g.fillStyle = "#16130f";
    g.fillRect(0, 0, 2048, 1024);
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillStyle = "#f6f1e6";
    g.font = '800 70px "JetBrains Mono", monospace';
    g.fillText("ZIP INDEX", pad, 70);
    g.fillStyle = "#c9b48a";
    g.font = '500 34px "JetBrains Mono", monospace';
    g.fillText(`${zips.length} Zcash Improvement Proposals · zips.z.cash`, pad, 130);
    // legend
    let lx = 2048 - pad;
    g.textAlign = "right";
    g.font = '700 30px "JetBrains Mono", monospace';
    for (const gr of [...groups].reverse()) {
      const label = `${gr.label} ${gr.list.length}`;
      g.fillStyle = "#f6f1e6";
      g.fillText(label, lx, 70);
      const w = g.measureText(label).width;
      g.fillStyle = gr.color;
      g.fillRect(lx - w - 34, 56, 24, 28);
      lx -= w + 64;
      if (lx < 450) break;
    }
    g.fillStyle = "#3a332a";
    g.fillRect(pad, top - 24, 2048 - pad * 2, 3);
    sorted.forEach((z, i) => {
      const cx = pad + (i % COLS_B) * cw,
        cy = top + Math.floor(i / COLS_B) * ch;
      const col = groupOf(z).color;
      g.fillStyle = col;
      g.globalAlpha = 0.9;
      g.fillRect(cx + 4, cy + 4, cw - 8, ch - 8);
      g.globalAlpha = 1;
      g.fillStyle = "#14120f";
      g.textAlign = "center";
      let size = Math.min(44, ch * 0.5);
      const label = z.number != null ? String(z.number) : "DRAFT";
      g.font = `800 ${size}px "JetBrains Mono", monospace`;
      while (g.measureText(label).width > cw - 20 && size > 12) g.font = `800 ${--size}px "JetBrains Mono", monospace`;
      g.fillText(label, cx + cw / 2, cy + ch / 2 + 1);
    });
    board.t.needsUpdate = true;
    const cellAt = (hit: THREE.Intersection) => {
      if (!hit.uv) return null;
      const px = hit.uv.x * 2048,
        py = (1 - hit.uv.y) * 1024;
      if (py < top || px < pad || px > 2048 - pad) return null;
      const i = Math.floor((py - top) / ch) * COLS_B + Math.floor((px - pad) / cw);
      return sorted[i] ?? null;
    };
    lv.pick(
      boardM,
      (hit) => {
        const z = cellAt(hit);
        return z ? `<b>${zipName(z)}</b><span>${esc(z.title)} · ${esc(z.status)}</span>` : "<b>ZIP index</b><span>every ZIP by number · click one</span>";
      },
      (hit) => {
        const z = cellAt(hit);
        return z
          ? zipInfo(z)
          : {
              eyebrow: "ZIP ARCHIVE",
              title: "ZIP index",
              tag: [`${zips.length} ZIPs`, "info"],
              stats: groups.slice(0, 4).map((gr) => [gr.label[0] + gr.label.slice(1).toLowerCase(), String(gr.list.length)] as [string, string]),
              body: `<p>${groups.map((gr) => `<b>${gr.label}</b> ${gr.list.length} · ${gr.note}`).join("<br>")}</p>`,
              link: { href: "https://zips.z.cash/", label: "zips.z.cash" },
            };
      },
    );

    // ---- readers who talk about the ZIPs in front of them -------------------------------------------
    const finals = groups[0].list,
      actives = [...groups[1].list, ...groups[2].list],
      drafts = groups[3].list;
    const total = `${zips.length} ZIPs on these shelves, ${finals.length} of them Final.`;
    void lv.person(1729, -2.2, Y, -95.2, "Archivist", { lines: [total, ...lines.archivist, ...talkAbout(sorted.filter((z) => z.number === 0))], face: new THREE.Vector3(0, 0, 1), wander: [[-3, -95], [3, -95], [0, -90], [0, -72], [-8, -84], [8, -84]], info: () => ({ eyebrow: "ZIP ARCHIVE", title: "The archivist", body: `<p>${esc(total)}</p>`, link: { href: "https://zips.z.cash/zip-0000", label: "ZIP 0: the ZIP process" } }) });
    void lv.person(3141, x0 + 1.3, Y, -79.0, "Reader", { lines: talkAbout(finals), face: new THREE.Vector3(-1, 0, 0), near: 6 });
    void lv.person(6174, x0 + 1.3, Y, -88.0, "Researcher", { lines: talkAbout(actives), face: new THREE.Vector3(-1, 0, 0), near: 6 });
    void lv.person(2025, x1 - 1.3, Y, -79.0, "Student", { lines: talkAbout(drafts), face: new THREE.Vector3(1, 0, 0), near: 6 });
    void lv.person(7919, -4.6 + 1.2, Y, -80 - 1.8 - 0.6, "Reader", { sit: true, face: new THREE.Vector3(-1, 0, 0), lines: talkAbout(finals.slice(4)), near: 5 });
    void lv.person(4040, 4.6 - 1.2, Y, -89 - 0.6, "Reader", { sit: true, face: new THREE.Vector3(1, 0, 0), lines: talkAbout([...actives].reverse()), near: 5 });
  });
}
