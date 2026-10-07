import * as THREE from "three";
import { hash } from "../../scene/voxel/model";

/**
 * Canvas textures for the pyramid: sandstone courses, flagstones, ceiling slabs, Aswan granite,
 * and the hieroglyph atlas (Zcash glyphs: shields, zebras, ⓩ, keys, eyes, snarks…).
 */

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d", { willReadFrequently: true })! };
}

function tex(c: HTMLCanvasElement, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const rgb = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`;

/** Speckle noise over a rect, in place. */
function grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amount: number, seed: number, dark = 0.35, light = 0.25) {
  const img = g.getImageData(x, y, w, h);
  const d = img.data;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      const n = hash(i + x, j + y, seed) - 0.5;
      const big = hash((i + x) >> 3, (j + y) >> 3, seed + 1) - 0.5;
      const v = 1 + n * amount + big * amount * 0.6;
      d[k] *= v;
      d[k + 1] *= v;
      d[k + 2] *= v;
      const s = hash(i + x, j + y, seed + 7);
      if (s < dark * 0.02) (d[k] *= 0.55), (d[k + 1] *= 0.55), (d[k + 2] *= 0.55);
      else if (s > 1 - light * 0.02) (d[k] = Math.min(255, d[k] * 1.25)), (d[k + 1] = Math.min(255, d[k + 1] * 1.22)), (d[k + 2] = Math.min(255, d[k + 2] * 1.18));
    }
  g.putImageData(img, x, y);
}

/**
 * Courses of dressed limestone: 4 courses of 0.5 m in a 2 m tile (256 px a metre), blocks of
 * 0.6–1.3 m, each a slightly different tone, with mortar joints, chipped corners and weathering.
 */
export function sandstone(base = [196, 160, 112], seed = 1) {
  const S = 512;
  const { c, g } = canvas(S, S);
  g.fillStyle = "#4a3824";
  g.fillRect(0, 0, S, S);
  const rows = 4,
    rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -Math.floor(hash(r, 0, seed) * 200);
    let i = 0;
    while (x < S) {
      const w = 150 + Math.floor(hash(r, i, seed + 2) * 190);
      const tone = 0.86 + hash(r, i, seed + 3) * 0.22;
      const warm = (hash(r, i, seed + 4) - 0.5) * 18;
      g.fillStyle = rgb(base[0] * tone + warm, base[1] * tone + warm * 0.5, base[2] * tone);
      // wrap blocks round the tile edge so it repeats seamlessly
      for (const ox of [0, S, -S]) g.fillRect(x + 3 + ox, r * rh + 3, w - 5, rh - 5);
      // a darker weathered bottom edge and a lit top edge
      g.fillStyle = "rgba(60,40,20,0.22)";
      for (const ox of [0, S, -S]) g.fillRect(x + 3 + ox, r * rh + rh - 14, w - 5, 11);
      g.fillStyle = "rgba(255,240,210,0.12)";
      for (const ox of [0, S, -S]) g.fillRect(x + 3 + ox, r * rh + 3, w - 5, 5);
      // chips at the corners
      g.fillStyle = "#5a4430";
      for (let k = 0; k < 3; k++) {
        const cx = x + 3 + (hash(r, i, k + seed) > 0.5 ? w - 12 : 0) + hash(i, r, k) * 8;
        const cy = r * rh + 3 + (hash(i, k, r + seed) > 0.5 ? rh - 14 : 0);
        g.beginPath();
        g.arc(((cx % S) + S) % S, cy + 4, 3 + hash(k, i, r) * 6, 0, Math.PI * 2);
        g.fill();
      }
      x += w;
      i++;
    }
  }
  grain(g, 0, 0, S, S, 0.22, seed);
  // pits and streaks
  for (let k = 0; k < 260; k++) {
    g.fillStyle = `rgba(70,48,26,${0.15 + hash(k, 1, seed) * 0.3})`;
    g.fillRect(hash(k, 2, seed) * S, hash(k, 3, seed) * S, 1 + hash(k, 4, seed) * 3, 1 + hash(k, 5, seed) * 3);
  }
  for (let k = 0; k < 30; k++) {
    g.fillStyle = "rgba(90,64,36,0.12)";
    g.fillRect(hash(k, 6, seed) * S, hash(k, 7, seed) * S, 2, 20 + hash(k, 8, seed) * 60);
  }
  return tex(c);
}

/** Flagstones (1 m in a 2 m tile) with sand drifted into the joints. */
export function flagstones(seed = 3) {
  const S = 512;
  const { c, g } = canvas(S, S);
  g.fillStyle = "#6a5236";
  g.fillRect(0, 0, S, S);
  for (let j = 0; j < 4; j++) {
    const off = j % 2 ? 128 : 0;
    for (let i = -1; i < 3; i++) {
      const tone = 0.82 + hash(i, j, seed) * 0.2;
      g.fillStyle = rgb(170 * tone, 140 * tone, 100 * tone);
      for (const ox of [0, S]) g.fillRect(i * 256 + off + 3 + ox - (ox ? S : 0), j * 128 + 3, 250, 122);
    }
  }
  grain(g, 0, 0, S, S, 0.25, seed);
  // sand
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(214,182,128,${0.08 + hash(k, 9, seed) * 0.18})`;
    const x = hash(k, 10, seed) * S,
      y = hash(k, 11, seed) * S;
    g.beginPath();
    g.arc(x, y, 1 + hash(k, 12, seed) * 5, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** Big dark ceiling slabs. */
export function slabs(seed = 5) {
  const S = 256;
  const { c, g } = canvas(S, S);
  g.fillStyle = "#2a2016";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2; i++) {
    const tone = 0.85 + hash(i, 0, seed) * 0.2;
    g.fillStyle = rgb(178 * tone, 146 * tone, 106 * tone);
    g.fillRect(i * 128 + 2, 0, 124, S);
  }
  grain(g, 0, 0, S, S, 0.25, seed);
  return tex(c);
}

/** Pink Aswan granite in big ashlar blocks (the King's Chamber). */
export function granite(seed = 7) {
  const S = 512;
  const { c, g } = canvas(S, S);
  g.fillStyle = "#2a1a18";
  g.fillRect(0, 0, S, S);
  const rows = 2;
  for (let r = 0; r < rows; r++) {
    let x = -Math.floor(hash(r, 0, seed) * 150);
    let i = 0;
    while (x < S) {
      const w = 220 + Math.floor(hash(r, i, seed) * 200);
      const tone = 0.85 + hash(r, i, seed + 1) * 0.2;
      g.fillStyle = rgb(150 * tone, 96 * tone, 86 * tone);
      for (const ox of [0, S, -S]) g.fillRect(x + 2 + ox, r * 256 + 2, w - 3, 252);
      x += w;
      i++;
    }
  }
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let k = 0; k < S * S; k++) {
    const h = hash(k % S, (k / S) | 0, seed + 3);
    const p = k * 4;
    if (d[p] < 60) continue;
    if (h < 0.07) (d[p] *= 0.55), (d[p + 1] *= 0.55), (d[p + 2] *= 0.58);
    else if (h > 0.96) (d[p] = 205), (d[p + 1] = 180), (d[p + 2] = 170);
    else if (h > 0.8) (d[p] *= 1.15), (d[p + 1] *= 0.92), (d[p + 2] *= 0.9);
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}

/** A soft round glow (torch halos, dust). */
export function glowDot(color = "255,190,110") {
  const { c, g } = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${color},1)`);
  gr.addColorStop(0.25, `rgba(${color},0.45)`);
  gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}

/** Cobweb across a corner. */
export function cobweb() {
  const { c, g } = canvas(256, 256);
  g.strokeStyle = "rgba(230,225,215,0.55)";
  g.lineWidth = 1.2;
  for (let k = 0; k < 9; k++) {
    const a = (k / 8) * (Math.PI / 2);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * 250, Math.sin(a) * 250);
    g.stroke();
  }
  for (let r = 24; r < 250; r += 22 + r * 0.08) {
    g.beginPath();
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * (Math.PI / 2);
      const rr = r * (0.92 + hash(k, r, 3) * 0.12);
      const x = Math.cos(a) * rr,
        y = Math.sin(a) * rr;
      if (k) g.quadraticCurveTo(Math.cos(a - 0.1) * rr * 0.9, Math.sin(a - 0.1) * rr * 0.9, x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
  }
  return tex(c, false);
}

/** The ⓩ face of a gold coin. */
export function coinFace() {
  const { c, g } = canvas(128, 128);
  const gr = g.createRadialGradient(50, 44, 4, 64, 64, 64);
  gr.addColorStop(0, "#fff0b0");
  gr.addColorStop(0.6, "#f4b728");
  gr.addColorStop(1, "#a8740c");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#8a5a08";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  zMark(g, 64, 64, 34, "#7a4e06");
  return tex(c, false);
}

// ---- glyphs -------------------------------------------------------------------------------------

const INK = "#2a180c";
const OCHRE = "#c8862a",
  RED = "#a8382a",
  BLUE = "#2f5f9e",
  GREEN = "#3f7f5a",
  GOLD = "#e8a820",
  CREAM = "#e8d8b0";

/** The Zcash Z: a Z with a stroke through it, as on the logo. */
function zMark(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  const u = s / 10;
  g.fillRect(-1 * u, -10 * u, 2 * u, 3 * u);
  g.fillRect(-1 * u, 7 * u, 2 * u, 3 * u);
  g.beginPath();
  g.moveTo(-6 * u, -7 * u);
  g.lineTo(6 * u, -7 * u);
  g.lineTo(6 * u, -4.4 * u);
  g.lineTo(-2.2 * u, 4.4 * u);
  g.lineTo(6 * u, 4.4 * u);
  g.lineTo(6 * u, 7 * u);
  g.lineTo(-6 * u, 7 * u);
  g.lineTo(-6 * u, 4.4 * u);
  g.lineTo(2.2 * u, -4.4 * u);
  g.lineTo(-6 * u, -4.4 * u);
  g.closePath();
  g.fill();
  g.restore();
}

type Glyph = (g: CanvasRenderingContext2D, s: number) => void;

function outlined(g: CanvasRenderingContext2D, fill: string, path: () => void, lw = 2.5) {
  g.beginPath();
  path();
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = lw;
  g.stroke();
}

const GLYPHS: Record<string, Glyph> = {
  zec: (g, s) => {
    outlined(g, GOLD, () => g.arc(0, 0, s * 0.44, 0, Math.PI * 2));
    zMark(g, 0, 0, s * 0.3, INK);
  },
  shield: (g, s) => {
    outlined(g, BLUE, () => {
      g.moveTo(-s * 0.36, -s * 0.4);
      g.lineTo(s * 0.36, -s * 0.4);
      g.lineTo(s * 0.36, 0);
      g.quadraticCurveTo(s * 0.3, s * 0.32, 0, s * 0.46);
      g.quadraticCurveTo(-s * 0.3, s * 0.32, -s * 0.36, 0);
      g.closePath();
    });
    zMark(g, 0, -s * 0.02, s * 0.22, GOLD);
  },
  zebra: (g, s) => {
    // a zebra's head in profile, mane up, striped
    g.save();
    outlined(g, CREAM, () => {
      g.moveTo(-s * 0.3, s * 0.4);
      g.lineTo(-s * 0.22, -s * 0.2);
      g.lineTo(-s * 0.1, -s * 0.42);
      g.lineTo(0, -s * 0.28);
      g.lineTo(s * 0.4, s * 0.1);
      g.lineTo(s * 0.36, s * 0.26);
      g.lineTo(s * 0.12, s * 0.22);
      g.lineTo(s * 0.06, s * 0.4);
      g.closePath();
    });
    g.clip();
    g.fillStyle = INK;
    for (let k = -4; k < 6; k++) {
      g.save();
      g.translate(k * s * 0.11, 0);
      g.rotate(0.5);
      g.fillRect(-s * 0.025, -s * 0.6, s * 0.05, s * 1.2);
      g.restore();
    }
    g.restore();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(s * 0.02, -s * 0.06, s * 0.04, 0, Math.PI * 2);
    g.fill();
  },
  key: (g, s) => {
    outlined(g, GOLD, () => {
      g.arc(0, -s * 0.24, s * 0.16, 0, Math.PI * 2);
    });
    g.fillStyle = INK;
    g.beginPath();
    g.arc(0, -s * 0.24, s * 0.06, 0, Math.PI * 2);
    g.fill();
    outlined(g, GOLD, () => {
      g.rect(-s * 0.04, -s * 0.08, s * 0.08, s * 0.5);
      g.rect(s * 0.04, s * 0.22, s * 0.14, s * 0.06);
      g.rect(s * 0.04, s * 0.34, s * 0.1, s * 0.06);
    }, 2);
  },
  ankh: (g, s) => {
    outlined(g, GREEN, () => {
      g.ellipse(0, -s * 0.24, s * 0.13, s * 0.18, 0, 0, Math.PI * 2);
    }, 3);
    g.fillStyle = "rgba(0,0,0,0)";
    outlined(g, GREEN, () => {
      g.rect(-s * 0.32, -s * 0.06, s * 0.64, s * 0.1);
      g.rect(-s * 0.05, -s * 0.06, s * 0.1, s * 0.5);
    });
  },
  eye: (g, s) => {
    outlined(g, CREAM, () => {
      g.moveTo(-s * 0.4, 0);
      g.quadraticCurveTo(0, -s * 0.32, s * 0.4, 0);
      g.quadraticCurveTo(0, s * 0.22, -s * 0.4, 0);
    });
    outlined(g, BLUE, () => g.arc(0, -s * 0.02, s * 0.1, 0, Math.PI * 2));
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-s * 0.05, s * 0.1);
    g.lineTo(-s * 0.12, s * 0.38);
    g.moveTo(s * 0.1, s * 0.08);
    g.quadraticCurveTo(s * 0.3, s * 0.34, s * 0.16, s * 0.4);
    g.moveTo(-s * 0.4, -s * 0.18);
    g.quadraticCurveTo(0, -s * 0.42, s * 0.38, -s * 0.2);
    g.stroke();
  },
  snark: (g, s) => {
    // a zkSNARK bust: square pixel head, eyes, shoulders
    outlined(g, OCHRE, () => g.rect(-s * 0.3, s * 0.12, s * 0.6, s * 0.3));
    outlined(g, "#d8a868", () => g.rect(-s * 0.22, -s * 0.38, s * 0.44, s * 0.46));
    g.fillStyle = INK;
    g.fillRect(-s * 0.13, -s * 0.2, s * 0.08, s * 0.08);
    g.fillRect(s * 0.05, -s * 0.2, s * 0.08, s * 0.08);
    g.fillRect(-s * 0.08, -s * 0.02, s * 0.16, s * 0.04);
    g.fillStyle = RED;
    g.fillRect(-s * 0.22, -s * 0.38, s * 0.44, s * 0.08);
  },
  lock: (g, s) => {
    g.strokeStyle = INK;
    g.lineWidth = s * 0.08;
    g.beginPath();
    g.arc(0, -s * 0.1, s * 0.16, Math.PI, 0);
    g.stroke();
    outlined(g, GOLD, () => g.rect(-s * 0.26, -s * 0.1, s * 0.52, s * 0.44));
    g.fillStyle = INK;
    g.fillRect(-s * 0.03, s * 0.04, s * 0.06, s * 0.14);
  },
  bird: (g, s) => {
    outlined(g, BLUE, () => {
      g.moveTo(-s * 0.3, s * 0.1);
      g.quadraticCurveTo(-s * 0.1, -s * 0.24, s * 0.1, -s * 0.18);
      g.lineTo(s * 0.18, -s * 0.36);
      g.lineTo(s * 0.4, -s * 0.3);
      g.lineTo(s * 0.22, -s * 0.22);
      g.quadraticCurveTo(s * 0.24, s * 0.12, -s * 0.3, s * 0.1);
    });
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-s * 0.02, s * 0.06);
    g.lineTo(-s * 0.06, s * 0.42);
    g.moveTo(s * 0.08, s * 0.04);
    g.lineTo(s * 0.1, s * 0.42);
    g.stroke();
  },
  water: (g, s) => {
    g.strokeStyle = BLUE;
    g.lineWidth = 4;
    for (const y of [-0.16, 0.04, 0.24]) {
      g.beginPath();
      for (let k = 0; k <= 8; k++) g.lineTo(-s * 0.4 + (k * s * 0.8) / 8, s * y + (k % 2 ? -s * 0.06 : s * 0.06));
      g.stroke();
    }
  },
  sun: (g, s) => {
    outlined(g, RED, () => g.arc(0, 0, s * 0.26, 0, Math.PI * 2));
    g.strokeStyle = GOLD;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, s * 0.34, 0, Math.PI * 2);
    g.stroke();
  },
  pyramid: (g, s) => {
    outlined(g, OCHRE, () => {
      g.moveTo(-s * 0.4, s * 0.34);
      g.lineTo(0, -s * 0.36);
      g.lineTo(s * 0.4, s * 0.34);
      g.closePath();
    });
    outlined(g, GOLD, () => {
      g.moveTo(-s * 0.08, -s * 0.22);
      g.lineTo(0, -s * 0.36);
      g.lineTo(s * 0.08, -s * 0.22);
      g.closePath();
    }, 1.5);
  },
  block: (g, s) => {
    // a chain of blocks
    for (let k = 0; k < 3; k++) {
      outlined(g, k === 2 ? GOLD : OCHRE, () => g.rect(-s * 0.42 + k * s * 0.3, -s * 0.12, s * 0.22, s * 0.24));
      if (k < 2) {
        g.strokeStyle = INK;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(-s * 0.2 + k * s * 0.3, 0);
        g.lineTo(-s * 0.12 + k * s * 0.3, 0);
        g.stroke();
      }
    }
  },
};
const NAMES = Object.keys(GLYPHS);

/**
 * The hieroglyph atlas: 4 × 2 panels of 0.9 × 1.8 m (256 × 512 px). Columns of painted glyphs
 * between ruled lines, a few panels with a big figure (a cartouche, a zebra procession, a shield
 * held by a zkSNARK). Returns the texture and the UV rect of each panel.
 */
export function hieroglyphs() {
  const PW = 256,
    PH = 512;
  const { c, g } = canvas(PW * 4, PH * 2);
  const rects: [number, number, number, number][] = [];
  for (let p = 0; p < 8; p++) {
    const px = (p % 4) * PW,
      py = Math.floor(p / 4) * PH;
    rects.push([px / (PW * 4), 1 - (py + PH) / (PH * 2), (px + PW) / (PW * 4), 1 - py / (PH * 2)]);
    g.save();
    g.translate(px, py);
    g.beginPath();
    g.rect(0, 0, PW, PH);
    g.clip();
    // carved panel: lighter dressed stone
    g.fillStyle = "#d6bc8a";
    g.fillRect(0, 0, PW, PH);
    grain(g, px, py, PW, PH, 0.14, p + 20);
    // painted borders: the band of colours top and bottom
    const bands = [BLUE, RED, GREEN, GOLD];
    for (let k = 0; k < 8; k++) {
      g.fillStyle = bands[k % 4];
      g.fillRect(k * (PW / 8), 0, PW / 8 - 2, 14);
      g.fillRect(k * (PW / 8), PH - 14, PW / 8 - 2, 14);
    }
    g.fillStyle = INK;
    g.fillRect(0, 14, PW, 3);
    g.fillRect(0, PH - 17, PW, 3);
    if (p === 1) cartouche(g, PW, PH);
    else if (p === 4) procession(g, PW, PH);
    else if (p === 6) guardian(g, PW, PH);
    else {
      // three columns of glyphs
      const cols = 3,
        cw = (PW - 20) / cols;
      for (let col = 0; col < cols; col++) {
        const x = 10 + col * cw;
        g.fillStyle = INK;
        if (col) g.fillRect(x - 1, 22, 2, PH - 44);
        for (let r = 0; r < 7; r++) {
          const name = NAMES[Math.floor(hash(p, col, r) * NAMES.length)];
          g.save();
          g.translate(x + cw / 2, 50 + r * 66);
          GLYPHS[name](g, cw * 0.82);
          g.restore();
        }
      }
    }
    // age: faded paint and cracks
    g.fillStyle = "rgba(200,170,120,0.18)";
    for (let k = 0; k < 40; k++) g.fillRect(hash(k, p, 1) * PW, hash(k, p, 2) * PH, 10 + hash(k, p, 3) * 40, 4 + hash(k, p, 4) * 20);
    g.strokeStyle = "rgba(60,40,20,0.5)";
    g.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      let x = hash(k, p, 5) * PW,
        y = 0;
      g.moveTo(x, y);
      while (y < PH) {
        x += (hash(x, y, k) - 0.5) * 20;
        y += 10 + hash(y, x, k) * 30;
        g.lineTo(x, y);
      }
      if (hash(k, p, 9) > 0.5) g.stroke();
    }
    g.restore();
  }
  return { texture: tex(c, false), rects };
}

function cartouche(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = "#e8d6a8";
  g.strokeStyle = INK;
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(W * 0.18, 40, W * 0.64, H - 110, W * 0.3);
  g.fill();
  g.stroke();
  g.fillRect(W * 0.14, H - 66, W * 0.72, 8);
  const seq = ["zec", "shield", "zebra", "key", "eye"];
  seq.forEach((n, i) => {
    g.save();
    g.translate(W / 2, 100 + i * 72);
    GLYPHS[n](g, 70);
    g.restore();
  });
}

function procession(g: CanvasRenderingContext2D, W: number, H: number) {
  for (let k = 0; k < 3; k++) {
    const y = 100 + k * 150;
    g.save();
    g.translate(W / 2, y);
    // body
    outlined(g, CREAM, () => g.ellipse(0, 0, 70, 34, 0, 0, Math.PI * 2));
    outlined(g, CREAM, () => {
      g.moveTo(50, -12);
      g.lineTo(96, -64);
      g.lineTo(112, -50);
      g.lineTo(76, 6);
      g.closePath();
    });
    g.fillStyle = INK;
    for (const lx of [-50, -30, 30, 50]) g.fillRect(lx - 5, 20, 10, 46);
    g.save();
    g.beginPath();
    g.ellipse(0, 0, 70, 34, 0, 0, Math.PI * 2);
    g.clip();
    for (let s = -70; s < 70; s += 16) g.fillRect(s, -40, 7, 80);
    g.restore();
    g.fillRect(-82, -6, 14, 4);
    // a ⓩ sun disk over each zebra
    g.translate(-60, -54);
    GLYPHS.zec(g, 40);
    g.restore();
  }
}

function guardian(g: CanvasRenderingContext2D, W: number, H: number) {
  g.save();
  g.translate(W / 2, H / 2 + 20);
  // a zkSNARK standing, holding the shield
  outlined(g, "#d8a868", () => g.rect(-40, -190, 80, 80));
  g.fillStyle = RED;
  g.fillRect(-40, -190, 80, 16);
  g.fillStyle = INK;
  g.fillRect(-24, -160, 14, 14);
  g.fillRect(10, -160, 14, 14);
  g.fillRect(-14, -132, 28, 6);
  outlined(g, CREAM, () => {
    g.moveTo(-50, -100);
    g.lineTo(50, -100);
    g.lineTo(40, 60);
    g.lineTo(-40, 60);
    g.closePath();
  });
  g.fillStyle = INK;
  g.fillRect(-36, 60, 18, 120);
  g.fillRect(18, 60, 18, 120);
  g.translate(0, -20);
  GLYPHS.shield(g, 120);
  g.restore();
  g.save();
  g.translate(W / 2 - 80, 60);
  GLYPHS.ankh(g, 50);
  g.translate(160, 0);
  GLYPHS.key(g, 50);
  g.restore();
}
