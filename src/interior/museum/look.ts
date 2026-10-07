import * as THREE from "three";
import { hash } from "../../scene/voxel/model";
import { canvasTex } from "./kit";

/** Surfaces of the Louvre, painted on canvases: stone, parquet, coffers, vaults, damask, marble. */

const r = (i: number, j = 0, k = 0) => hash(i, j, k, 913);

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, colors: string[], size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    g.fillRect(r(i, 1) * w, r(i, 2) * h, size, size);
  }
}

/** Pale limestone ashlar (one tile = 4 m: rows of 0.5 m, blocks 1–2 m). */
export function limestone(base = "#d8ccb4") {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const row = h / 8;
    for (let y = 0; y < 8; y++) {
      let x = y % 2 ? -64 : 0;
      let k = 0;
      while (x < w) {
        const bw = 128 + Math.floor(r(y, k) * 2) * 64;
        const c = new THREE.Color(base).offsetHSL(0, 0, (r(y, k, 3) - 0.5) * 0.05);
        g.fillStyle = `#${c.getHexString()}`;
        g.fillRect(x + 1, y * row + 1, bw - 2, row - 2);
        g.fillStyle = "rgba(90,70,40,0.35)";
        g.fillRect(x, y * row, bw, 1.5);
        g.fillRect(x, y * row, 1.5, row);
        x += bw;
        k++;
      }
    }
    speckle(g, w, h, 1400, ["rgba(120,100,70,0.18)", "rgba(255,250,235,0.25)"], 2);
  });
}

/** Polished stone floor, big tiles with a thin dark joint (tile = 1.5 m, texture = 3 m). */
export function stoneFloor(base = "#cfc2a8") {
  return canvasTex(512, 512, (g, w, h) => {
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const c = new THREE.Color(base).offsetHSL(0, 0, (r(x, y, 5) - 0.5) * 0.04);
        g.fillStyle = `#${c.getHexString()}`;
        g.fillRect(x * 256, y * 256, 256, 256);
      }
    for (let i = 0; i < 30; i++) {
      g.strokeStyle = `rgba(150,130,100,${0.08 + r(i, 9) * 0.08})`;
      g.lineWidth = 1 + r(i, 8) * 2;
      g.beginPath();
      g.moveTo(r(i, 3) * w, r(i, 4) * h);
      g.bezierCurveTo(r(i, 5) * w, r(i, 6) * h, r(i, 7) * w, r(i, 10) * h, r(i, 11) * w, r(i, 12) * h);
      g.stroke();
    }
    speckle(g, w, h, 900, ["rgba(110,90,60,0.2)", "rgba(255,255,245,0.3)"], 2);
    g.fillStyle = "rgba(60,50,35,0.55)";
    for (const k of [0, 256]) {
      g.fillRect(k, 0, 2, h);
      g.fillRect(0, k, w, 2);
    }
  });
}

/** I. M. Pei's triangular concrete coffers (texture = 3 m). */
export function coffers() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#cbbfa6";
    g.fillRect(0, 0, w, h);
    const n = 4,
      s = w / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const x0 = x * s,
          y0 = y * s;
        // each square split on its diagonal into two deep triangular coffers
        for (const tri of [
          [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s]],
          [[x0, y0], [x0, y0 + s], [x0 + s, y0 + s]],
        ]) {
          const [a, b, c] = tri;
          const cx = (a[0] + b[0] + c[0]) / 3,
            cy = (a[1] + b[1] + c[1]) / 3;
          const inset = (p: number[]) => [p[0] + (cx - p[0]) * 0.18, p[1] + (cy - p[1]) * 0.18];
          const [ia, ib, ic] = [inset(a), inset(b), inset(c)];
          const gr = g.createLinearGradient(ia[0], ia[1], ic[0], ic[1]);
          gr.addColorStop(0, "#a89a80");
          gr.addColorStop(1, "#8a7d66");
          g.fillStyle = gr;
          g.beginPath();
          g.moveTo(ia[0], ia[1]);
          g.lineTo(ib[0], ib[1]);
          g.lineTo(ic[0], ic[1]);
          g.closePath();
          g.fill();
          const deep = [inset(ia), inset(ib), inset(ic)].map((p) => [p[0] + (cx - p[0]) * 0.25, p[1] + (cy - p[1]) * 0.25]);
          g.fillStyle = "#7a6e5a";
          g.beginPath();
          g.moveTo(deep[0][0], deep[0][1]);
          g.lineTo(deep[1][0], deep[1][1]);
          g.lineTo(deep[2][0], deep[2][1]);
          g.closePath();
          g.fill();
        }
      }
    speckle(g, w, h, 800, ["rgba(70,60,45,0.15)", "rgba(255,250,235,0.2)"], 2);
  });
}

/** Parquet de Versailles: oak panels with a diagonal lattice (panel = 1 m, texture = 2 m). */
export function versailles(tone = "#9a6a3c") {
  return canvasTex(512, 512, (g, w, h) => {
    const base = new THREE.Color(tone);
    const plank = (k: number) => `#${base.clone().offsetHSL(0, 0, (r(k, 77) - 0.5) * 0.08).getHexString()}`;
    const P = 256;
    for (let py = 0; py < 2; py++)
      for (let px = 0; px < 2; px++) {
        const x0 = px * P,
          y0 = py * P;
        g.save();
        g.translate(x0, y0);
        // frame strips
        g.fillStyle = plank(px * 3 + py);
        g.fillRect(0, 0, P, P);
        let k = 0;
        for (let i = 0; i < 6; i++) {
          g.fillStyle = plank(k++ + px * 10 + py * 20);
          g.fillRect(i * (P / 6), 0, P / 6 - 1, 18);
          g.fillRect(i * (P / 6), P - 18, P / 6 - 1, 18);
          g.fillRect(0, i * (P / 6), 18, P / 6 - 1);
          g.fillRect(P - 18, i * (P / 6), 18, P / 6 - 1);
        }
        // the lattice inside, both diagonals, with small squares between
        g.beginPath();
        g.rect(18, 18, P - 36, P - 36);
        g.clip();
        const cell = (P - 36) / 4;
        for (let a = 0; a < 4; a++)
          for (let b = 0; b < 4; b++) {
            g.fillStyle = plank(a * 4 + b + px * 40 + py * 80);
            g.fillRect(18 + a * cell, 18 + b * cell, cell, cell);
          }
        g.strokeStyle = "rgba(40,22,10,0.55)";
        g.lineWidth = 2;
        for (let d = -P; d < 2 * P; d += cell) {
          g.beginPath();
          g.moveTo(d, 0);
          g.lineTo(d + P, P);
          g.stroke();
          g.beginPath();
          g.moveTo(d + P, 0);
          g.lineTo(d, P);
          g.stroke();
        }
        g.restore();
        g.strokeStyle = "rgba(30,16,8,0.6)";
        g.lineWidth = 2;
        g.strokeRect(x0 + 1, y0 + 1, P - 2, P - 2);
        g.strokeRect(x0 + 18, y0 + 18, P - 36, P - 36);
      }
    // wax sheen and grain
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = i % 2 ? "rgba(40,20,8,0.12)" : "rgba(255,220,170,0.08)";
      g.fillRect(r(i, 41) * w, r(i, 42) * h, 6 + r(i, 43) * 14, 1);
    }
  });
}

/** Coffered barrel vault: cream coffers with gilt rosettes (texture = 2 × 2 coffers). */
export function vaultCoffers(base = "#e4d6b8") {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const s = w / 2;
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const x0 = x * s,
          y0 = y * s;
        g.fillStyle = "#c8b48c";
        g.fillRect(x0 + 10, y0 + 10, s - 20, s - 20);
        g.fillStyle = "#b39c70";
        g.fillRect(x0 + 18, y0 + 18, s - 36, s - 36);
        g.fillStyle = "#d9c79f";
        g.fillRect(x0 + 24, y0 + 24, s - 48, s - 48);
        // gilt rosette
        const cx = x0 + s / 2,
          cy = y0 + s / 2;
        g.fillStyle = "#c9982e";
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          g.beginPath();
          g.ellipse(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, 9, 5, a, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "#f0cc6a";
        g.beginPath();
        g.arc(cx, cy, 8, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#a07a28";
        g.lineWidth = 3;
        g.strokeRect(x0 + 10, y0 + 10, s - 20, s - 20);
      }
  });
}

/** Gold mosaic of the Daru staircase vault: gold tesserae, garlands, a deep red border. */
export function goldMosaic() {
  return canvasTex(256, 256, (g, w, h) => {
    for (let y = 0; y < h; y += 4)
      for (let x = 0; x < w; x += 4) {
        const k = r(x, y, 3);
        g.fillStyle = k < 0.33 ? "#c8992e" : k < 0.66 ? "#d6a83a" : k < 0.9 ? "#b8862a" : "#e8c060";
        g.fillRect(x, y, 3.5, 3.5);
      }
    g.strokeStyle = "#7a1a1a";
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.strokeStyle = "#1a3a6a";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(w / 2, h / 2, 70, 0, Math.PI * 2);
    g.stroke();
    // a laurel wreath
    g.fillStyle = "#2a5a2a";
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      g.beginPath();
      g.ellipse(w / 2 + Math.cos(a) * 58, h / 2 + Math.sin(a) * 58, 8, 3.5, a + 0.6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Silk damask wall covering (pattern = 1 m). */
export function damask(base = "#7a1622", ink = "#9a2a30") {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = ink;
    for (const [cx, cy] of [
      [w / 2, h / 2],
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
    ]) {
      g.save();
      g.translate(cx, cy);
      for (let k = 0; k < 6; k++) {
        g.rotate(Math.PI / 3);
        g.beginPath();
        g.ellipse(0, 26, 12, 30, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.arc(0, 0, 14, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = i % 2 ? "rgba(0,0,0,0.06)" : "rgba(255,200,200,0.05)";
      g.fillRect(0, r(i, 51) * h, w, 1);
    }
  });
}

/** Veined marble for columns and pilasters (texture = 2 m). */
export function marble(base: string, vein: string) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = vein;
      g.globalAlpha = 0.25 + r(i, 61) * 0.4;
      g.lineWidth = 1 + r(i, 62) * 3;
      g.beginPath();
      g.moveTo(r(i, 63) * w, 0);
      g.bezierCurveTo(r(i, 64) * w, h * 0.3, r(i, 65) * w, h * 0.7, r(i, 66) * w, h);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

/**
 * A painted ceiling: a sky with clouds in a gilt compartment, putti-gold cartouches in the corners.
 * One texture covers the whole ceiling (w × d metres).
 */
export function paintedCeiling(wM: number, dM: number, o: { sky?: string; frame?: string } = {}) {
  const W = 1024,
    H = Math.round((1024 * dM) / wM);
  return canvasTex(
    W,
    H,
    (g, w, h) => {
      g.fillStyle = o.frame ?? "#e8dcc0";
      g.fillRect(0, 0, w, h);
      const m = w * 0.12;
      // the gilt border, then the sky
      g.fillStyle = "#b8862a";
      g.fillRect(m - 14, m - 14, w - 2 * m + 28, h - 2 * m + 28);
      g.fillStyle = "#e8c060";
      g.fillRect(m - 6, m - 6, w - 2 * m + 12, h - 2 * m + 12);
      const sky = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, Math.max(w, h) * 0.6);
      sky.addColorStop(0, "#fff4d8");
      sky.addColorStop(0.35, o.sky ?? "#9cc0e0");
      sky.addColorStop(1, "#6a8ab8");
      g.fillStyle = sky;
      g.fillRect(m, m, w - 2 * m, h - 2 * m);
      g.save();
      g.beginPath();
      g.rect(m, m, w - 2 * m, h - 2 * m);
      g.clip();
      for (let i = 0; i < 60; i++) {
        const cx = m + r(i, 71) * (w - 2 * m),
          cy = m + r(i, 72) * (h - 2 * m);
        const rr = 20 + r(i, 73) * 60;
        const cg = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
        cg.addColorStop(0, "rgba(255,250,240,0.85)");
        cg.addColorStop(1, "rgba(255,250,240,0)");
        g.fillStyle = cg;
        g.beginPath();
        g.arc(cx, cy, rr, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      // corner cartouches and side medallions in gold
      g.fillStyle = "#c9982e";
      for (const [cx, cy] of [
        [m / 2, m / 2],
        [w - m / 2, m / 2],
        [m / 2, h - m / 2],
        [w - m / 2, h - m / 2],
        [w / 2, m / 2],
        [w / 2, h - m / 2],
      ]) {
        g.beginPath();
        g.ellipse(cx, cy, m * 0.35, m * 0.28, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#8a6420";
        g.lineWidth = 3;
        g.stroke();
      }
      g.strokeStyle = "#c9982e";
      g.lineWidth = 6;
      g.strokeRect(10, 10, w - 20, h - 20);
    },
    { repeat: false },
  );
}

/** The Grande Galerie's skylight: glazing bars over a bright sky (texture = 2 m). */
export function skylight() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#5a5a60";
    g.fillRect(0, 0, w, 5);
    g.fillRect(0, 0, 5, h);
    g.fillRect(0, h / 2, w, 2);
    g.fillRect(w / 2, 0, 2, h);
  });
}
