import { SANS } from "./parts";
import { median, type PApp, type PItem, type Purge } from "./purge";

/**
 * Canvases of the Aile des Apparitions: the totem's figures, the friezes and cartels under the
 * paintings. Thumbnails come from the collection atlas (32 px a cell).
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
const MONO = '"JetBrains Mono", Menlo, monospace';
const N = 10000;

type G = CanvasRenderingContext2D;

/** Item `id`'s portrait from the atlas at (x, y), `s` pixels. */
export function snark(g: G, atlas: CanvasImageSource, id: number, x: number, y: number, s: number) {
  g.drawImage(atlas, ((id - 1) % 100) * 32, Math.floor((id - 1) / 100) * 32, 32, 32, x, y, s, s);
}

function bg(g: G, w: number, h: number) {
  g.fillStyle = C.bg;
  g.fillRect(0, 0, w, h);
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
