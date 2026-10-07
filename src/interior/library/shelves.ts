import * as THREE from "three";
import { get, links } from "../../data/zscan";
import type { PickInfo } from "../types";
import { PAPERS, UPGRADES, YEAR_NOTES, ZIP_GROUPS, heightAt, type Upgrade, type Zip } from "./data";
import { LIP, RECESS } from "./atrium";
import { LEN, TIERS, canvasTex, esc, fmt, frontAt, glow, type Level, type Tier } from "./kit";

/**
 * The data shelves on the terraces. First terrace: the chain year by year (left wing) and the
 * network upgrades (right wing). Second terrace: the papers behind Zcash (left) and every ZIP
 * (right), each ZIP a book that opens in the reader. Shelf headers hang from the lip above.
 */

/** Tier indices and stretches of s used by the data (the plain books keep out of them). */
const T1A = 5,
  T1B = 6,
  T2A = 10,
  T2B = 11;
const LEFT: [number, number] = [3, 43],
  RIGHT: [number, number] = [LEN - 43, LEN - 3];

export function reserved(ti: number, s: number, row: number) {
  const inL = s > LEFT[0] && s < LEFT[1],
    inR = s > RIGHT[0] && s < RIGHT[1];
  if (ti === T1A || ti === T1B) return inL || inR;
  if (ti === T2B) return inL || (inR && row === 0);
  if (ti === T2A && row === 1) return inL;
  return false;
}

// ---- the spine atlas: 32 × 8 cells of 64 × 256; cell 0 is plain ------------------------------------
const CW = 64,
  CH = 256,
  COLS = 32;
function makeAtlas() {
  const a = canvasTex(2048, 2048, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 2048, 2048);
  });
  a.t.anisotropy = 8;
  return a;
}
function spineCell(g: CanvasRenderingContext2D, cell: number, color: string, text: string, ink: string) {
  const cx = (cell % COLS) * CW,
    cy = Math.floor(cell / COLS) * CH;
  g.fillStyle = color;
  g.fillRect(cx, cy, CW, CH);
  g.fillStyle = "rgba(0,0,0,0.22)";
  g.fillRect(cx, cy, 5, CH);
  g.fillStyle = "#c9a227";
  g.fillRect(cx, cy + 16, CW, 5);
  g.fillRect(cx, cy + CH - 22, CW, 5);
  g.save();
  g.translate(cx + 42, cy + CH - 32);
  g.rotate(-Math.PI / 2);
  g.fillStyle = ink;
  let size = 34;
  g.font = `800 ${size}px "JetBrains Mono", monospace`;
  while (g.measureText(text).width > CH - 60 && size > 12) g.font = `800 ${--size}px "JetBrains Mono", monospace`;
  g.fillText(text, 0, 0);
  g.restore();
}
const cellUV = (cell: number) => {
  const cx = (cell % COLS) * CW,
    cy = Math.floor(cell / COLS) * CH;
  return [cx / 2048, 1 - (cy + CH) / 2048, (cx + CW) / 2048, 1 - cy / 2048];
};

interface BookRef {
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: number;
  h: number;
  d: number;
  info: () => PickInfo;
  hover: string;
}

/** Merged books with their spines mapped into the atlas; a ray's face index gives the book. */
class BookRun {
  pos: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  refs: BookRef[] = [];
  add(t: Tier, s: number, y: number, th: number, h: number, depth: number, color: string, cell: number, ref?: Omit<BookRef, "x" | "y" | "z" | "yaw" | "w" | "h" | "d">) {
    const f = frontAt(t, s, RECESS - 0.01);
    const nx = f.nx,
      nz = f.nz,
      tx = nz,
      tz = -nx;
    const cx = f.x + nx * (depth / 2),
      cz = f.z + nz * (depth / 2);
    const c = new THREE.Color(color);
    const P = (a: number, b: number, d: number) => [cx + tx * a * th * 0.5 + nx * d * depth * 0.5, y + b * h, cz + tz * a * th * 0.5 + nz * d * depth * 0.5];
    const plain = cellUV(0);
    const pu = (plain[0] + plain[2]) / 2,
      pv = (plain[1] + plain[3]) / 2;
    const face = (q: number[][], uvs: number[][] | null, k: number) => {
      for (const i of [0, 1, 2, 0, 2, 3]) {
        this.pos.push(...q[i]);
        if (uvs) this.uv.push(...uvs[i]);
        else this.uv.push(pu, pv);
        this.col.push(c.r * k, c.g * k, c.b * k);
      }
    };
    const [u0, v0, u1, v1] = cellUV(cell);
    // spine (+n): left to right along the tangent, bottom to top
    face([P(-1, 0, 1), P(1, 0, 1), P(1, 1, 1), P(-1, 1, 1)], cell ? [[u0, v0], [u1, v0], [u1, v1], [u0, v1]] : null, cell ? 1 / Math.max(c.r, c.g, c.b, 0.001) : 1);
    if (cell) {
      // the atlas cell carries the colour: undo the tint on the spine
      const n = this.col.length;
      for (let i = n - 18; i < n; i++) this.col[i] = 1;
    }
    face([P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1)], null, 0.8);
    face([P(1, 0, 1), P(1, 0, -1), P(1, 1, -1), P(1, 1, 1)], null, 0.7);
    face([P(-1, 0, -1), P(-1, 0, 1), P(-1, 1, 1), P(-1, 1, -1)], null, 0.7);
    face([P(-1, 0, -1), P(1, 0, -1), P(1, 0, 1), P(-1, 0, 1)], null, 0.5);
    if (ref) this.refs.push({ ...ref, x: cx, y: y + h / 2, z: cz, yaw: Math.atan2(nx, nz), w: th, h, d: depth });
    else this.refs.push({ info: () => ({ eyebrow: "", title: "" }), hover: "", x: cx, y, z: cz, yaw: 0, w: th, h, d: depth });
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

/** Plaques, all on one canvas: 4 × 21 cells of 512 × 96. */
class Plaques {
  atlas = canvasTex(2048, 2048, (g) => {
    g.fillStyle = "#151311";
    g.fillRect(0, 0, 2048, 2048);
  });
  n = 0;
  pos: number[] = [];
  uv: number[] = [];
  refs: (() => PickInfo)[] = [];
  hovers: string[] = [];
  /** A header hanging in front of the lip of tier `t` over [s0, s1]. */
  add(t: Tier, s: number, w: number, title: string, sub: string, accent: string, info: () => PickInfo, hover: string) {
    w = Math.min(w, 1.7);
    const cell = this.n++;
    const cx = (cell % 4) * 512,
      cy = Math.floor(cell / 4) * 96;
    const g = this.atlas.g;
    g.fillStyle = "#171513";
    g.fillRect(cx, cy, 512, 96);
    g.fillStyle = accent;
    g.fillRect(cx, cy, 10, 96);
    g.fillRect(cx, cy + 92, 512, 4);
    g.textBaseline = "middle";
    g.fillStyle = "#f6f1e6";
    let size = 40;
    g.font = `800 ${size}px "JetBrains Mono", monospace`;
    while (g.measureText(title).width > 480 && size > 14) g.font = `800 ${--size}px "JetBrains Mono", monospace`;
    g.fillText(title, cx + 26, cy + 34);
    g.fillStyle = "#c9b48a";
    size = 22;
    g.font = `500 ${size}px "JetBrains Mono", monospace`;
    while (g.measureText(sub).width > 476 && size > 10) g.font = `500 ${--size}px "JetBrains Mono", monospace`;
    g.fillText(sub, cx + 26, cy + 72);
    const h = (w * 96) / 512;
    const y1 = t.y0 + t.h + 0.005,
      y0 = y1 - h;
    const f = frontAt(t, s, -0.025);
    const tx = f.nz,
      tz = -f.nx;
    const P = (a: number, y: number) => [f.x + tx * a * w * 0.5, y, f.z + tz * a * w * 0.5];
    const u0 = cx / 2048,
      u1 = (cx + 512) / 2048,
      v1 = 1 - cy / 2048,
      v0 = 1 - (cy + 96) / 2048;
    const q = [P(-1, y0), P(1, y0), P(1, y1), P(-1, y1)];
    const uvs = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(...q[i]);
      this.uv.push(...uvs[i]);
    }
    this.refs.push(info);
    this.hovers.push(hover);
  }
  mesh() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    this.atlas.t.needsUpdate = true;
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.atlas.t, side: THREE.DoubleSide }));
  }
}

const YEAR_COLORS = ["#7a2a2a", "#9a5a2a", "#c99a3a", "#5a7a2a", "#2f6a4a", "#2a6a7a", "#26406a", "#4a3a7a", "#7a3a6a", "#8a2a3a", "#f4b728"];
const UP_COLORS = ["#3a5a7a", "#2f7a5a", "#c27a2a", "#8a4a2a", "#3a7a3a", "#5a2a7a", "#1f4a6a", "#8a6a2a", "#2a5a5a", "#6a6a74"];

export interface Shelves {
  /** The picks and hovers for one terrace. */
  hoverHi: THREE.Mesh;
}

/**
 * Lays the data shelves on the two terraces' levels. `tip()` is the live chain height.
 */
export function buildShelves(t1: Level, t2: Level, tip: () => number) {
  const atlas = makeAtlas();
  const mat = new THREE.MeshStandardMaterial({ map: atlas.t, vertexColors: true, roughness: 0.7 });
  const run1 = new BookRun(),
    run2 = new BookRun();
  const pl1 = new Plaques(),
    pl2 = new Plaques();
  let ups: Upgrade[] = UPGRADES;
  const rnd = (() => {
    let a = 99;
    return () => ((a = (a * 16807) % 2147483647) / 2147483647);
  })();

  /** Fill [s0, s1) of tier `t`'s row with volumes in shades of `color`, each tied to `ref`. */
  const fillRow = (run: BookRun, t: Tier, row: number, s0: number, s1: number, color: string, ref: Omit<BookRef, "x" | "y" | "z" | "yaw" | "w" | "h" | "d">, hMax = 1) => {
    const ya = row ? t.y0 + 0.55 : t.y0,
      yb = row ? t.y0 + t.h - LIP - 0.04 : t.y0 + 0.515;
    const base = new THREE.Color(color);
    for (let s = s0 + 0.04; s < s1 - 0.05; ) {
      const th = 0.05 + rnd() * 0.06;
      const mid = s + th / 2;
      s += th + 0.004;
      if (Math.abs(mid / 2.1 - Math.round(mid / 2.1)) * 2.1 < 0.07) continue;
      const h = (yb - ya) * (0.66 + rnd() * 0.3) * hMax;
      const c = base.clone().offsetHSL((rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.14);
      run.add(t, mid, ya + 0.002, th, h, 0.22 + rnd() * 0.06, `#${c.getHexString()}`, 0, ref);
    }
  };

  // ---- first terrace, left: the chain, year by year ------------------------------------------------------
  const years = Array.from({ length: 11 }, (_, i) => 2016 + i);
  const yearInfo = (y: number): PickInfo => {
    const h = tip();
    const first = y === 2016 ? 0 : heightAt(Date.UTC(y, 0, 1), ups, h);
    const nowY = new Date().getUTCFullYear();
    const last = y >= nowY ? h : heightAt(Date.UTC(y + 1, 0, 1), ups, h) - 1;
    const inYear = ups.filter((u) => u.activated_at && new Date(u.activated_at).getUTCFullYear() === y);
    const rows = [
      ...inYear.map((u) => `<p><b>${esc(u.label)}</b> · #${fmt(u.activation_height!)} · ${new Date(u.activated_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}${u.summary ? `<br>${esc(u.summary)}` : ""}</p>`),
      ...(YEAR_NOTES[y] ?? []).map((n) => `<p>${esc(n)}</p>`),
    ];
    return {
      eyebrow: "THE CHAIN · YEAR",
      title: String(y),
      mono: true,
      tag: [y >= nowY ? "in progress" : `≈ ${fmt(last - first + 1)} blocks`, y >= nowY ? "info" : "muted"],
      stats: [
        ["First block", `${y === 2016 ? "" : "≈ "}#${fmt(first)}`],
        ["Last block", `${y >= nowY ? "" : "≈ "}#${fmt(last)}`],
        ["Block time", y < 2019 ? "150 s" : y === 2019 ? "150 s → 75 s" : "75 s"],
        ["Upgrades", inYear.map((u) => u.label).join(", ") || "—"],
      ],
      body: rows.join(""),
      link: { href: links.block(first), label: `Block #${fmt(first)} on ZScan` },
    };
  };
  const yw = (LEFT[1] - LEFT[0]) / years.length;
  years.forEach((y, i) => {
    const s0 = LEFT[0] + i * yw,
      s1 = s0 + yw;
    const ref = { info: () => yearInfo(y), hover: `<b>${y}</b><span>the chain that year</span>` };
    for (const ti of [T1A, T1B]) for (const row of [0, 1]) fillRow(run1, TIERS[ti], row, s0, s1, YEAR_COLORS[i], ref);
    const first = y === 2016 ? 0 : heightAt(Date.UTC(y, 0, 1), ups, tip());
    pl1.add(TIERS[T1B], (s0 + s1) / 2, yw - 0.5, String(y), y === 2016 ? "GENESIS · #0" : `FROM ≈ #${fmt(first)}`, YEAR_COLORS[i], ref.info, ref.hover);
  });

  // ---- first terrace, right: the network upgrades ----------------------------------------------------------
  const upList = () => [...ups.filter((u) => u.activation_height), ...ups.filter((u) => !u.activation_height || !u.activated).slice(0, 1)].slice(0, 10);
  const upInfo = (u: Upgrade): PickInfo => ({
    eyebrow: "NETWORK UPGRADE",
    title: u.label,
    tag: u.activated ? ["active", "ok"] : ["next", "info"],
    stats: [
      ["Height", u.activation_height ? `#${fmt(u.activation_height)}` : "—"],
      ["Activated", u.activated_at ? new Date(u.activated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"],
      ["Branch ID", u.branch_id ? `0x${u.branch_id}` : "—"],
      ["Block time", u.target_block_time ? `${u.target_block_time} s` : "—"],
    ],
    body: u.summary ? `<p>${esc(u.summary)}</p>` : undefined,
    link: u.activation_height ? { href: links.block(u.activation_height), label: `Block #${fmt(u.activation_height)} on ZScan` } : undefined,
  });
  const layUpgrades = () => {
    const list = upList();
    const uw = (RIGHT[1] - RIGHT[0]) / list.length;
    list.forEach((u, i) => {
      const s0 = RIGHT[0] + i * uw,
        s1 = s0 + uw;
      const ref = { info: () => upInfo(ups.find((x) => x.name === u.name) ?? u), hover: `<b>${esc(u.label)}</b><span>network upgrade${u.activation_height ? ` · #${fmt(u.activation_height)}` : ""}</span>` };
      for (const ti of [T1A, T1B]) for (const row of [0, 1]) fillRow(run1, TIERS[ti], row, s0, s1, UP_COLORS[i % UP_COLORS.length], ref);
      pl1.add(TIERS[T1B], (s0 + s1) / 2, uw - 0.5, u.label.toUpperCase(), u.activation_height ? `#${fmt(u.activation_height)}${u.activated_at ? " · " + u.activated_at.slice(0, 4) : ""}` : "NEXT", UP_COLORS[i % UP_COLORS.length], ref.info, ref.hover);
    });
  };
  layUpgrades();

  // ---- second terrace, left: the papers -----------------------------------------------------------------
  const pw = (LEFT[1] - LEFT[0]) / PAPERS.length;
  PAPERS.forEach((p, i) => {
    const s0 = LEFT[0] + i * pw,
      s1 = s0 + pw;
    const info = (): PickInfo => ({
      eyebrow: `PAPER · ${p.year}`,
      title: p.title,
      stats: [
        ["Year", String(p.year)],
        ["Venue", p.venue],
      ],
      body: `<p>${esc(p.authors)}</p><div class="note">${esc(p.note)}</div>`,
      link: p.url ? { href: p.url, label: "Read the paper" } : undefined,
    });
    const ref = { info, hover: `<b>${esc(p.short)}</b><span>${esc(p.authors.split(",")[0])}${p.authors.includes(",") ? " et al." : ""} · ${p.year}</span>` };
    // the paper itself, face out in the middle of the eye-level shelf, its volumes round it
    const cell = 140 + i;
    const dark = new THREE.Color(p.color).getHSL({ h: 0, s: 0, l: 0 }).l < 0.55;
    spineCell(atlas.g, cell, p.color, `${p.short} ${p.year}`, dark ? "#f4efe2" : "#16130f");
    const mid = (s0 + s1) / 2;
    const t = TIERS[T2B];
    for (const k of [-1, 0, 1]) run2.add(t, mid + k * 0.17, t.y0 + 0.002, 0.15, 0.48, 0.3, p.color, cell, ref);
    fillRow(run2, t, 0, s0, mid - 0.27, p.color, ref);
    fillRow(run2, t, 0, mid + 0.27, s1, p.color, ref);
    fillRow(run2, t, 1, s0, s1, p.color, ref);
    fillRow(run2, TIERS[T2A], 1, s0, s1, p.color, ref);
    pl2.add(t, mid, Math.min(pw - 0.3, 2.2), p.short, `${p.authors.split(",")[0]}${p.authors.includes(",") ? " et al." : ""} · ${p.year}`, p.color === "#e8e0d0" ? "#c9a227" : p.color, info, ref.hover);
  });

  // ---- assemble (the ZIPs follow once loaded) --------------------------------------------------------------
  const mesh1 = run1.mesh(mat),
    mesh2 = run2.mesh(mat);
  const plaque1 = pl1.mesh(),
    plaque2 = pl2.mesh();
  t1.group.add(mesh1, plaque1);
  t2.group.add(mesh2, plaque2);
  atlas.t.needsUpdate = true;

  // the book under the cursor glows and slides out
  const hi = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glow("#ffd98a", 0.9));
  (hi.material as THREE.MeshBasicMaterial).transparent = true;
  (hi.material as THREE.MeshBasicMaterial).opacity = 0.45;
  hi.visible = false;
  hi.raycast = () => {};
  let hiAt = 0;
  const showHi = (r: BookRef) => {
    hi.visible = true;
    hi.position.set(r.x + Math.sin(r.yaw) * 0.06, r.y, r.z + Math.cos(r.yaw) * 0.06);
    hi.rotation.set(0, r.yaw, 0);
    hi.scale.set(r.w + 0.012, r.h + 0.012, r.d + 0.012);
    hiAt = performance.now();
  };
  const bookPick = (lv: Level, mesh: THREE.Mesh, run: BookRun) =>
    lv.pick(
      mesh,
      (hit) => {
        const r = run.refs[Math.floor((hit.faceIndex ?? 0) / 10)];
        if (!r) return null;
        if (hi.parent !== lv.group) lv.group.add(hi);
        showHi(r);
        return r.hover;
      },
      (hit) => run.refs[Math.floor((hit.faceIndex ?? 0) / 10)]?.info() ?? null,
    );
  const plaquePick = (lv: Level, mesh: THREE.Mesh, p: Plaques) =>
    lv.pick(
      mesh,
      (hit) => p.hovers[Math.floor((hit.faceIndex ?? 0) / 2)] ?? null,
      (hit) => p.refs[Math.floor((hit.faceIndex ?? 0) / 2)]?.() ?? null,
    );
  bookPick(t1, mesh1, run1);
  bookPick(t2, mesh2, run2);
  plaquePick(t1, plaque1, pl1);
  plaquePick(t2, plaque2, pl2);

  // headers over each wing, readable from across the atrium
  const header = (lv: Level, t: Tier, s: number, text: string) => {
    const c = canvasTex(1024, 96, (g) => {
      g.clearRect(0, 0, 1024, 96);
      g.fillStyle = "#1c1a17";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = '800 54px "JetBrains Mono", monospace';
      g.fillText(text, 512, 50);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.56), new THREE.MeshBasicMaterial({ map: c.t, transparent: true, depthWrite: false }));
    const f = frontAt(t, s, -0.03);
    m.position.set(f.x, t.y0 + t.h - LIP - 0.33, f.z);
    m.rotation.y = Math.atan2(f.nx, f.nz);
    m.raycast = () => {};
    lv.group.add(m);
  };
  header(t1, TIERS[T1B + 2], 23, "THE CHAIN · 2016 — 2026");
  header(t1, TIERS[T1B + 2], LEN - 23, "NETWORK UPGRADES");
  header(t2, TIERS[T2B + 2], 23, "THE PAPERS");
  header(t2, TIERS[T2B + 2], LEN - 23, "ZIPs · ZCASH IMPROVEMENT PROPOSALS");

  // live upgrades: names, dates, summaries (the shelves keep their places)
  void get<{ upgrades: Upgrade[] }>("/v1/upgrades").then((r) => {
    if (r?.upgrades?.length) ups = r.upgrades;
  });

  // ---- the ZIPs: one book each, by status, numbers on the spines ---------------------------------------------
  void loadZips().then((zips) => {
    if (!zips.length) return;
    const run = new BookRun();
    const pl = new Plaques();
    const t = TIERS[T2B];
    const groups = ZIP_GROUPS.map((g) => ({ ...g, list: zips.filter((z) => g.has(z.status)).sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999)) })).filter((g) => g.list.length);
    const total = groups.reduce((n, g) => n + g.list.length, 0);
    const span = RIGHT[1] - RIGHT[0];
    let s = RIGHT[0];
    let cell = 1;
    for (const g of groups) {
      const w = (span * g.list.length) / total;
      const step = w / g.list.length;
      const ginfo = (): PickInfo => ({
        eyebrow: "ZIPs · STATUS",
        title: g.label,
        tag: [`${g.list.length} ZIPs`, "info"],
        body: g.list
          .slice(0, 60)
          .map((z) => `<p><b>${z.number != null ? `ZIP ${z.number}` : "Draft"}</b> · ${esc(z.title)}</p>`)
          .join(""),
        link: { href: "https://zips.z.cash/", label: "zips.z.cash" },
      });
      pl.add(t, s + Math.min(w, 2.4) / 2 + 0.1, Math.min(w - 0.2, 2.2), `${g.label} · ${g.list.length}`, g.list.length > 1 ? `ZIP ${g.list[0].number ?? "—"} – ${g.list[g.list.length - 1].number ?? "—"}` : `ZIP ${g.list[0].number ?? "—"}`, g.color, ginfo, `<b>${g.label}</b><span>${g.list.length} ZIPs</span>`);
      g.list.forEach((z, k) => {
        const c = cell++;
        if (c < 140) spineCell(atlas.g, c, g.color, z.number != null ? `ZIP ${z.number}` : "DRAFT", "#14120f");
        const mid = s + step * (k + 0.5);
        const h = 0.4 + ((z.number ?? k) % 4) * 0.02;
        const info = (): PickInfo => ({
          book: { slug: z.slug, number: z.number, title: z.title, status: z.status, owners: z.owners, created: z.created, url: z.url, color: g.color },
          eyebrow: `${z.number != null ? `ZIP ${z.number}` : "Draft ZIP"} · ${z.categories.join(" / ") || "—"}`,
          title: z.title,
          tag: [z.status, z.status === "Final" || z.status === "Active" ? "ok" : z.status === "Proposed" ? "info" : z.status === "Draft" ? "warn" : "muted"],
          stats: [
            ["Created", z.created ?? "—"],
            ["Owners", String(z.owners.length || "—")],
          ],
          body: `${z.summary ? `<p>${esc(z.summary)}</p>` : ""}${z.owners.length ? `<div class="note">${esc(z.owners.join(", "))}</div>` : ""}${z.live ? `<p><a href="${z.live.href}" target="_blank" rel="noopener">${esc(z.live.label)} on ZScan ↗</a></p>` : ""}`,
          link: { href: z.url, label: "zips.z.cash" },
        });
        run.add(t, mid, t.y0 + 0.002, Math.min(0.12, step * 0.45), h, 0.27, g.color, c < 140 ? c : 0, { info, hover: `<b>${z.number != null ? `ZIP ${z.number}` : "Draft"}</b><span>${esc(z.title)}</span>` });
        // a pair of plain volumes either side
        const side = (step - Math.min(0.12, step * 0.45)) / 2;
        if (side > 0.12) {
          const gc = new THREE.Color("#e9e3d6").offsetHSL(0, 0, (rnd() - 0.5) * 0.1);
          const vt = Math.min(0.08, side - 0.03);
          run.add(t, mid - step * 0.5 + side * 0.5, t.y0 + 0.002, vt, 0.3 + rnd() * 0.08, 0.24, `#${gc.getHexString()}`, 0);
          run.add(t, mid + step * 0.5 - side * 0.5, t.y0 + 0.002, vt, 0.3 + rnd() * 0.08, 0.24, `#${gc.offsetHSL(0.05, 0.1, -0.1).getHexString()}`, 0);
        }
      });
      s += w;
    }
    atlas.t.needsUpdate = true;
    const zm = run.mesh(mat),
      zp = pl.mesh();
    t2.group.add(zm, zp);
    const zipRefs = run.refs;
    t2.pick(
      zm,
      (hit) => {
        const r = zipRefs[Math.floor((hit.faceIndex ?? 0) / 10)];
        if (!r?.hover) return null;
        if (hi.parent !== t2.group) t2.group.add(hi);
        showHi(r);
        return r.hover;
      },
      (hit) => {
        const r = zipRefs[Math.floor((hit.faceIndex ?? 0) / 10)];
        return r?.hover ? r.info() : null;
      },
    );
    plaquePick(t2, zp, pl);
  });

  return {
    tick() {
      if (hi.visible && performance.now() - hiAt > 200) hi.visible = false;
    },
  };
}

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
