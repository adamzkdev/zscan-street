import * as THREE from "three";

/** Canvas-drawn surfaces of the bank: marble, boards, neon, deposit boxes. */

export const GOLD = "#f4b728";
export const MONO = '"JetBrains Mono", Menlo, monospace';
export const SANS = 'Roboto, "Helvetica Neue", Arial, sans-serif';
export const JP = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';

export const fmtZec = (zat: number, digits = 0) => (zat / 1e8).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtSigned = (zat: number) => `${zat >= 0 ? "+" : "−"}${fmtZec(Math.abs(zat), Math.abs(zat) < 1e10 ? 1 : 0)}`;

export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
}

export function surface(w: number, h: number): Surface {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { canvas, ctx, tex };
}

/** A self-lit screen: a plane showing a canvas, slightly overdriven so its brightest parts bloom. */
export function screen(s: Surface, wM: number, hM: number, k = 1.15) {
  const mat = new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false, transparent: true });
  mat.color.setScalar(k);
  return new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), mat);
}

/** Neon tubes: a glowing text on a transparent canvas, horizontal or stacked vertically (kanji). */
export function neon(text: string, o: { h: number; color: string; font?: string; vertical?: boolean; k?: number; frame?: boolean }) {
  const font = o.font ?? `700 110px ${SANS}`;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const chars = o.vertical ? [...text] : [text];
  const cw = Math.max(...chars.map((c) => probe.measureText(c).width));
  const lh = 140;
  const pad = 60;
  const W = Math.ceil(cw + pad * 2),
    H = Math.ceil(lh * chars.length + pad * 2 - (o.vertical ? 0 : 0));
  const s = surface(W, H);
  const { ctx } = s;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const core = new THREE.Color(o.color).lerp(new THREE.Color("#ffffff"), 0.55);
  const draw = () => {
    chars.forEach((c, i) => ctx.fillText(c, W / 2, pad + lh * i + lh / 2 + 6));
  };
  if (o.frame) {
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 8;
    ctx.shadowColor = o.color;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.roundRect(14, 14, W - 28, H - 28, 26);
    ctx.stroke();
  }
  ctx.shadowColor = o.color;
  for (const blur of [44, 22, 10]) {
    ctx.shadowBlur = blur;
    ctx.fillStyle = o.color;
    draw();
  }
  ctx.shadowBlur = 4;
  ctx.fillStyle = `#${core.getHexString()}`;
  draw();
  s.tex.needsUpdate = true;
  const hM = o.h * (H / (lh + pad * 2));
  const mat = new THREE.MeshBasicMaterial({ map: s.tex, transparent: true, depthWrite: false, toneMapped: false });
  mat.color.setScalar(o.k ?? 1.6);
  const m = new THREE.Mesh(new THREE.PlaneGeometry((hM * W) / H, hM), mat);
  m.renderOrder = 2;
  return m;
}

// ---- live boards --------------------------------------------------------------------------------

/** "INSERT VIEWING KEY" on a terminal; `blink` toggles the cursor, `scan` sweeps a line. */
export function drawTerminal(s: Surface, blink: boolean, scan: number, label: string) {
  const { ctx, canvas } = s;
  const W = canvas.width,
    H = canvas.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1a14");
  g.addColorStop(1, "#050a08");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  // key glyph
  ctx.strokeStyle = GOLD;
  ctx.fillStyle = GOLD;
  ctx.lineWidth = 10;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(W / 2 - 60, 62, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillRect(W / 2 - 36, 57, 104, 10);
  ctx.fillRect(W / 2 + 46, 57, 10, 28);
  ctx.fillRect(W / 2 + 64, 57, 10, 20);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 44px ${SANS}`;
  ctx.fillText("INSERT VIEWING KEY", W / 2, 150);
  ctx.shadowBlur = 0;
  ctx.font = `400 24px ${JP}`;
  ctx.fillStyle = "#ff6f9e";
  ctx.fillText("閲覧鍵を入力してください", W / 2, 190);
  // input field
  ctx.strokeStyle = "rgba(62,224,143,.7)";
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 214, W - 80, 54);
  ctx.textAlign = "left";
  ctx.fillStyle = "#3ee08f";
  ctx.font = `500 26px ${MONO}`;
  ctx.fillText(`> uview1${blink ? "█" : ""}`, 58, 251);
  ctx.fillStyle = "#7f9a8c";
  ctx.font = `400 18px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillText(label, W / 2, H - 34);
  // scan line
  ctx.fillStyle = "rgba(62,224,143,.10)";
  ctx.fillRect(0, scan * H, W, 18);
  s.tex.needsUpdate = true;
}

/** A static framed plaque of a few lines. */
export function plaque(lines: { t: string; font: string; color: string }[], w = 900, h = 500) {
  const s = surface(w, h);
  const { ctx } = s;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#1a1712");
  g.addColorStop(1, "#0b0a08");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, w - 60, h - 60);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const step = (h - 120) / lines.length;
  lines.forEach((l, i) => {
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.shadowColor = l.color;
    ctx.shadowBlur = 8;
    ctx.fillText(l.t, w / 2, 60 + step * (i + 0.5));
  });
  s.tex.needsUpdate = true;
  return s;
}
