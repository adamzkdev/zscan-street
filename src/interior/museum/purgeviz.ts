import { SANS } from "./parts";
import { median, pad2, type PApp, type PItem, type Purge, traitOf } from "./purge";

/**
 * The explorer's Apparitions views (zscan.cash/collection/zksnarks?tab=apparitions), drawn on the
 * canvases of the Aile des Apparitions. Each one: a kicker, a title, then the chart and what it
 * says, from the purge's own data. Thumbnails come from the collection atlas (32 px a cell).
 */

export const C = {
  bg: "#0d0d0e",
  text: "#e8eaed",
  muted: "#9aa0a6",
  faint: "#5f6368",
  line: "rgba(255,255,255,0.10)",
  gold: "#f4b728",
  link: "#4ea8de",
};
/** The explorer's validated trait palette (dark), most common value first; then "Other". */
const PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];
const OTHER = "#5f5e59";
const MONO = '"JetBrains Mono", Menlo, monospace';
const N = 10000;

type G = CanvasRenderingContext2D;

/** Item `id`'s portrait from the atlas at (x, y), `s` pixels. */
export function snark(g: G, atlas: CanvasImageSource, id: number, x: number, y: number, s: number) {
  g.drawImage(atlas, ((id - 1) % 100) * 32, Math.floor((id - 1) / 100) * 32, 32, 32, x, y, s, s);
}

function head(g: G, kicker: string, title: string, x = 80, y = 100) {
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  g.fillStyle = C.gold;
  g.font = `700 34px ${SANS}`;
  g.letterSpacing = "6px";
  g.fillText(kicker.toUpperCase(), x, y);
  g.letterSpacing = "0px";
  g.fillStyle = C.text;
  g.font = `800 72px ${SANS}`;
  g.fillText(title, x, y + 82);
}

function bg(g: G, w: number, h: number) {
  g.fillStyle = C.bg;
  g.fillRect(0, 0, w, h);
}

/** A big figure and its line, stacked. */
function figure(g: G, x: number, y: number, big: string, line: string, color = C.text, maxW = 420) {
  g.textAlign = "left";
  g.fillStyle = color;
  g.font = `800 150px ${SANS}`;
  g.fillText(big, x, y);
  g.fillStyle = C.muted;
  g.font = `500 34px ${SANS}`;
  wrap(g, line, x, y + 56, maxW, 42);
}

function wrap(g: G, text: string, x: number, y: number, maxW: number, lh: number) {
  let line = "";
  for (const word of text.split(" ")) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > maxW && line) {
      g.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = t;
  }
  if (line) g.fillText(line, x, y);
}

/* ---------- Holes: the 10,000 by rarity, every purged one a hole ---------- */

export const HOLES = { x: 80, y: 240, side: 1100 };

/** `order`: the 10,000 ids from rarest to commonest (unranked last). */
export function drawHoles(g: G, w: number, h: number, p: Purge, order: number[], atlas: CanvasImageSource) {
  bg(g, w, h);
  head(g, "Holes", "Every purged snark left a hole.");
  const purged = new Set(p.purged.map((x) => x.item));
  const { x: X, y: Y, side } = HOLES;
  const c = side / 100;
  g.imageSmoothingEnabled = true;
  order.forEach((id, i) => {
    const x = X + (i % 100) * c,
      y = Y + Math.floor(i / 100) * c;
    if (purged.has(id)) {
      g.fillStyle = "#000";
      g.fillRect(x, y, c, c);
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.lineWidth = 1.6;
      g.strokeRect(x + 1, y + 1, c - 2, c - 2);
      return;
    }
    g.globalAlpha = 0.6;
    snark(g, atlas, id, x, y, c);
    g.globalAlpha = 1;
    if (p.appOf.has(id)) {
      g.strokeStyle = C.gold;
      g.lineWidth = 2;
      g.strokeRect(x, y, c, c);
    }
  });
  g.fillStyle = C.muted;
  g.font = `600 28px ${SANS}`;
  g.textAlign = "left";
  g.fillText("rarest ↓", X, Y - 14);
  g.fillText("commonest", X, Y + side + 40);
  // Purged per 1,000 ranks, one bar per ten rows.
  const bands = Array.from({ length: 10 }, (_, k) => p.purged.filter((x) => x.rank != null && Math.min(9, Math.floor((x.rank - 1) / 1000)) === k).length);
  const max = Math.max(...bands);
  const hx = X + side + 50;
  g.fillStyle = C.muted;
  g.font = `600 28px ${SANS}`;
  g.fillText("purged per 1,000 ranks", hx, Y - 14);
  bands.forEach((n, k) => {
    const y = Y + k * c * 10 + 10,
      bh = c * 10 - 20;
    g.fillStyle = k === 0 ? C.gold : k >= 5 ? C.text : "#4a4d52";
    g.beginPath();
    g.roundRect(hx, y, Math.max(6, (n / max) * 480), bh, [0, 8, 8, 0]);
    g.fill();
    g.fillStyle = C.text;
    g.font = `700 40px ${SANS}`;
    g.textBaseline = "middle";
    g.fillText(String(n), hx + Math.max(6, (n / max) * 480) + 16, y + bh / 2);
    g.textBaseline = "alphabetic";
  });
  // What it says.
  const common = p.purged.filter((x) => (x.rank ?? 0) > N / 2).length / p.purged.length;
  const fx = hx + 640;
  figure(g, fx, Y + 220, `${Math.round(common * 100)}%`, "of the purged snarks came from the common half", C.text, w - fx - 60);
  figure(g, fx, Y + 640, String(bands[0]), "among the rarest 1,000", C.gold, w - fx - 60);
}

/** The item under a point of the Holes canvas (u, v in 0..1), or null. */
export function holesAt(u: number, v: number, w: number, h: number, order: number[]) {
  const px = u * w,
    py = (1 - v) * h;
  const c = HOLES.side / 100;
  const col = Math.floor((px - HOLES.x) / c),
    row = Math.floor((py - HOLES.y) / c);
  if (col < 0 || col > 99 || row < 0 || row > 99) return null;
  return order[row * 100 + col] ?? null;
}

/* ---------- Flow: lineages into Apparitions ---------- */

function lineageGroups(p: Purge) {
  const tot = new Map<string, number>();
  for (const x of p.purged) tot.set(traitOf(x.traits, "Lineage"), (tot.get(traitOf(x.traits, "Lineage")) ?? 0) + 1);
  const named = [...tot].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v]) => v);
  const fold = (v: string) => (named.includes(v) ? v : "Other");
  const cats = [...named, ...(p.purged.some((x) => !named.includes(traitOf(x.traits, "Lineage"))) ? ["Other"] : [])];
  const color = (c: string) => (c === "Other" ? OTHER : PALETTE[named.indexOf(c)]);
  const counts = p.apps.map((a) => {
    const m = new Map<string, number>();
    for (const x of p.of(a)) m.set(fold(traitOf(x.traits, "Lineage")), (m.get(fold(traitOf(x.traits, "Lineage"))) ?? 0) + 1);
    return m;
  });
  return { cats, color, counts };
}

export function drawFlow(g: G, w: number, h: number, p: Purge, atlas: CanvasImageSource) {
  bg(g, w, h);
  const { cats, color, counts } = lineageGroups(p);
  const total = p.purged.length;
  const top = cats[0];
  const topN = counts.reduce((a, m) => a + (m.get(top) ?? 0), 0);
  const pure = counts.filter((m) => (m.get(top) ?? 0) === 26).length;
  head(g, "Flow", "From lineage to Apparition.");
  g.fillStyle = C.muted;
  g.font = `500 36px ${SANS}`;
  g.fillText(`${top}: ${topN} of ${total} purged (${Math.round((topN / total) * 100)}%). ${pure} Apparitions are ${top} only.`, 80, 250);
  const X0 = 330,
    X1 = w - 150,
    Y0 = 300,
    H = h - Y0 - 50,
    NODE = 18;
  const main = (i: number) => cats.reduce((b, c) => ((counts[i].get(c) ?? 0) > (counts[i].get(b) ?? 0) ? c : b), cats[0]);
  const order = p.apps.map((_, i) => i).sort((x, y) => cats.indexOf(main(x)) - cats.indexOf(main(y)) || (counts[y].get(main(y)) ?? 0) - (counts[x].get(main(x)) ?? 0));
  const rg = 6,
    lg = 18;
  const unit = (H - rg * (p.apps.length - 1)) / total;
  const catTotal = cats.map((c) => counts.reduce((a, m) => a + (m.get(c) ?? 0), 0));
  let y = Y0 + (H - (total * unit + lg * (cats.length - 1))) / 2;
  const catY = cats.map((_, i) => {
    const t = y;
    y += catTotal[i] * unit + lg;
    return t;
  });
  y = Y0;
  const appY = new Map<number, number>();
  for (const i of order) {
    appY.set(i, y);
    y += 26 * unit + rg;
  }
  const off = cats.map(() => 0);
  g.globalAlpha = 0.62;
  for (const i of order) {
    let o = 0;
    cats.forEach((c, ci) => {
      const n = counts[i].get(c) ?? 0;
      if (!n) return;
      const t = n * unit,
        ya = catY[ci] + off[ci],
        yb = appY.get(i)! + o,
        xa = X0 + NODE,
        xm = (xa + X1) / 2;
      g.fillStyle = color(c);
      g.beginPath();
      g.moveTo(xa, ya);
      g.bezierCurveTo(xm, ya, xm, yb, X1, yb);
      g.lineTo(X1, yb + t);
      g.bezierCurveTo(xm, yb + t, xm, ya + t, xa, ya + t);
      g.closePath();
      g.fill();
      off[ci] += t;
      o += t;
    });
  }
  g.globalAlpha = 1;
  cats.forEach((c, ci) => {
    const hh = catTotal[ci] * unit;
    g.fillStyle = color(c);
    g.fillRect(X0, catY[ci], NODE, Math.max(3, hh));
    g.textAlign = "right";
    g.textBaseline = "middle";
    g.fillStyle = C.text;
    g.font = `700 ${ci === 0 ? 44 : 32}px ${SANS}`;
    g.fillText(c, X0 - 70, catY[ci] + hh / 2);
    g.fillStyle = C.muted;
    g.font = `500 30px ${SANS}`;
    g.fillText(String(catTotal[ci]), X0 - 16, catY[ci] + hh / 2);
  });
  g.textAlign = "left";
  g.imageSmoothingEnabled = false;
  for (const i of order) {
    const a = p.apps[i];
    const yy = appY.get(i)! + (26 * unit) / 2;
    snark(g, atlas, a.item, X1 + 14, yy - 16, 32);
    g.fillStyle = C.muted;
    g.font = `600 24px ${SANS}`;
    g.fillText(pad2(a.slot), X1 + 54, yy + 1);
  }
  g.textBaseline = "alphabetic";
}

/* ---------- Strategies: each purge's 26, by rarity ---------- */

export function drawStrategies(g: G, w: number, h: number, p: Purge, atlas: CanvasImageSource) {
  bg(g, w, h);
  const rows = p.apps.map((a) => ({ a, ps: p.of(a), med: median(p.of(a).map((x) => x.rank ?? N)) })).sort((x, y) => x.med - y.med);
  const rare = rows.filter((r) => r.med < 4000).length,
    common = rows.filter((r) => r.med > 7000).length;
  head(g, "Strategies", "What each holder chose to burn.");
  g.fillStyle = C.muted;
  g.font = `500 36px ${SANS}`;
  g.fillText(`One row per purge, its 26 by rarity. ${common} burned their commons, ${rare} gave up rare ones.`, 80, 250);
  const X0 = 240,
    X1 = w - 70,
    Y0 = 300,
    row = (h - Y0 - 90) / rows.length,
    T = Math.min(30, row - 6);
  const x = (r: number) => X0 + ((r - 1) / (N - 1)) * (X1 - X0);
  for (const r of [1, 2500, 5000, 7500, N]) {
    g.strokeStyle = C.line;
    g.lineWidth = 2;
    g.setLineDash(r === 5000 ? [10, 10] : []);
    g.beginPath();
    g.moveTo(x(r), Y0);
    g.lineTo(x(r), Y0 + rows.length * row);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = C.faint;
    g.font = `500 28px ${SANS}`;
    g.textAlign = r === 1 ? "left" : r === N ? "right" : "center";
    g.fillText(r === 1 ? "rarest" : r === N ? "commonest" : r.toLocaleString("en-US"), x(r), Y0 + rows.length * row + 44);
  }
  g.textAlign = "left";
  g.imageSmoothingEnabled = false;
  rows.forEach((r, i) => {
    const cy = Y0 + i * row + row / 2;
    snark(g, atlas, r.a.item, 80, cy - 17, 34);
    g.fillStyle = C.muted;
    g.font = `600 24px ${SANS}`;
    g.textBaseline = "middle";
    g.fillText(pad2(r.a.slot), 124, cy + 1);
    g.textBaseline = "alphabetic";
    // Lanes so the thumbnails crowd less.
    const offs = [0, -row * 0.22, row * 0.22];
    const last = offs.map(() => -Infinity);
    for (const s of [...r.ps].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))) {
      const px = x(s.rank ?? N);
      let l = last.findIndex((v) => px - v >= T * 0.85);
      if (l < 0) l = last.indexOf(Math.min(...last));
      last[l] = px;
      snark(g, atlas, s.item, px - T / 2, cy - T / 2 + offs[l], T);
    }
    g.fillStyle = C.link;
    g.fillRect(x(r.med) - 3, cy - row / 2 + 3, 6, row - 6);
  });
}

/* ---------- DNA: what each Apparition is made of ---------- */

export function drawDna(g: G, w: number, h: number, p: Purge, atlas: CanvasImageSource) {
  bg(g, w, h);
  const { cats, color, counts } = lineageGroups(p);
  head(g, "DNA", "What each Apparition is made of.");
  // legend
  let lx = 80;
  g.font = `600 30px ${SANS}`;
  g.textBaseline = "middle";
  for (const c of cats) {
    g.fillStyle = color(c);
    g.fillRect(lx, 236, 26, 26);
    g.fillStyle = C.text;
    g.fillText(c, lx + 38, 250);
    lx += 38 + g.measureText(c).width + 44;
  }
  const Y0 = 300,
    row = (h - Y0 - 40) / p.apps.length,
    X0 = 200,
    X1 = w - 80;
  g.imageSmoothingEnabled = false;
  p.apps.forEach((a, i) => {
    const y = Y0 + i * row;
    snark(g, atlas, a.item, 80, y + row / 2 - 17, 34);
    g.fillStyle = C.muted;
    g.font = `600 24px ${SANS}`;
    g.fillText(pad2(a.slot), 124, y + row / 2 + 1);
    let x = X0;
    const per = (X1 - X0 - 4 * (cats.length - 1)) / 26;
    cats.forEach((c) => {
      const n = counts[i].get(c) ?? 0;
      if (!n) return;
      g.fillStyle = color(c);
      g.beginPath();
      g.roundRect(x, y + 5, n * per, row - 10, 4);
      g.fill();
      x += n * per + 4;
    });
  });
  g.textBaseline = "alphabetic";
}

/* ---------- Rings: each Apparition with its 26 ---------- */

export function drawRings(g: G, w: number, h: number, p: Purge, atlas: CanvasImageSource) {
  bg(g, w, h);
  head(g, "Rings", "Twenty-six burned for each one.");
  const cols = 7,
    rows = Math.ceil(p.apps.length / cols);
  const top = 250,
    cw = (w - 120) / cols,
    ch = (h - top - 30) / rows;
  g.imageSmoothingEnabled = false;
  p.apps.forEach((a, i) => {
    const cx = 60 + (i % cols) * cw + cw / 2,
      cy = top + Math.floor(i / cols) * ch + ch / 2;
    const r = Math.min(cw, ch) * 0.38,
      s = r * 0.32;
    p.of(a).forEach((x, k) => {
      const ang = (k / 26) * Math.PI * 2 - Math.PI / 2;
      snark(g, atlas, x.item, cx + Math.cos(ang) * r - s / 2, cy + Math.sin(ang) * r - s / 2, s);
    });
    const as = r * 0.95;
    snark(g, atlas, a.item, cx - as / 2, cy - as / 2, as);
    g.fillStyle = C.text;
    g.font = `700 24px ${SANS}`;
    g.textAlign = "left";
    g.fillText(pad2(a.slot), cx - cw / 2 + 8, cy + ch / 2 - 10);
  });
}

/* ---------- the totem by the lifts, and the friezes under the paintings ---------- */

export function drawStats(g: G, w: number, h: number, p: Purge | null) {
  bg(g, w, h);
  g.textAlign = "left";
  g.fillStyle = C.gold;
  g.font = `700 44px ${SANS}`;
  g.letterSpacing = "8px";
  g.fillText("APPARITIONS", 80, 130);
  g.letterSpacing = "0px";
  g.fillStyle = C.text;
  g.font = `800 64px ${SANS}`;
  g.fillText("Purge 26.", 80, 230);
  g.fillText("Reveal 1.", 80, 310);
  if (!p) return;
  const purged = p.purged.length;
  const rows: [string, string, string][] = [
    [`${p.apps.length} / ${p.slots}`, "Apparitions revealed", C.gold],
    [purged.toLocaleString("en-US"), "zkSNARKs purged", C.text],
    [p.supply.toLocaleString("en-US"), `left of ${p.minted.toLocaleString("en-US")}`, C.text],
  ];
  rows.forEach(([big, line, color], i) => {
    const y = 560 + i * 380;
    g.fillStyle = color;
    g.font = `800 180px ${SANS}`;
    g.fillText(big, 80, y);
    g.fillStyle = C.muted;
    g.font = `500 44px ${SANS}`;
    g.fillText(line, 84, y + 70);
  });
  g.fillStyle = C.faint;
  g.font = `500 32px ${MONO}`;
  g.fillText("zscan.cash · Apparitions", 80, h - 70);
}

/** The 26 snarks purged for one Apparition, 13 × 2. */
export function drawFrieze(g: G, w: number, h: number, ps: PItem[], atlas: CanvasImageSource) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  const s = w / 13;
  g.imageSmoothingEnabled = false;
  ps.slice(0, 26).forEach((x, i) => snark(g, atlas, x.item, (i % 13) * s, Math.floor(i / 13) * s, s));
}

/** The cartel under a painting: name, the treasury snark it was, its purge. */
export function cartel(a: PApp, ps: PItem[]): [string, string, string] {
  const ranks = ps.map((x) => x.rank ?? N);
  return [a.name, `was #${a.item} · 26 purged`, `median rank ${Math.round(median(ranks)).toLocaleString("en-US")}`];
}
