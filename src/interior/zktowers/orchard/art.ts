import * as THREE from "three";
import { hash } from "../../../scene/voxel/model";
import { GOLD, MONO, paint, SERIF } from "../kit";

/**
 * ZK TOWER ORCHARD's painted surfaces: black-and-gold marble, the sunburst ceiling, the lobby's
 * relief of the tower (after the Empire State's aluminium mural), the jazz club's backdrop and
 * carpet, the observatory's granite.
 */

export const DECO = '"Futura", "Century Gothic", "Avenir Next", "Helvetica Neue", sans-serif';

/** Black marble with white and gold veins, square slabs. */
export function blackMarble(seed: number, rx = 1, ry = 1, tiles = 2) {
  return paint(
    512,
    512,
    (g, W, H) => {
      const t = W / tiles;
      for (let i = 0; i < tiles; i++)
        for (let j = 0; j < tiles; j++) {
          g.fillStyle = hash(i, j, 3, seed) < 0.5 ? "#121014" : "#18151b";
          g.fillRect(i * t, j * t, t, t);
        }
      for (let n = 0; n < 70; n++) {
        g.globalAlpha = 0.1 + hash(n, 0, 1, seed) * 0.25;
        g.strokeStyle = hash(n, 1, 1, seed) < 0.2 ? "#c9a24a" : "#d8d4dc";
        g.lineWidth = 0.5 + hash(n, 2, 1, seed) * 1.6;
        g.beginPath();
        let x = hash(n, 3, 1, seed) * W,
          y = hash(n, 4, 1, seed) * H;
        g.moveTo(x, y);
        for (let s = 0; s < 7; s++) {
          x += (hash(n, s + 5, 1, seed) - 0.3) * 80;
          y += (hash(n, s + 12, 1, seed) - 0.5) * 50;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      g.strokeStyle = "rgba(201,162,74,0.55)";
      g.lineWidth = 2;
      for (let i = 0; i <= tiles; i++) {
        g.beginPath();
        g.moveTo(i * t, 0);
        g.lineTo(i * t, H);
        g.moveTo(0, i * t);
        g.lineTo(W, i * t);
        g.stroke();
      }
    },
    rx,
    ry,
  );
}

/** The lobby floor: black marble with a gold-and-cream compass star and a border of zigzags. */
export function lobbyFloor(w: number, d: number) {
  const px = 64; // pixels a metre
  return paint(w * px, d * px, (g, W, H) => {
    const slab = 2 * px;
    for (let x = 0; x < W; x += slab)
      for (let y = 0; y < H; y += slab) {
        const dark = ((x + y) / slab) % 2 === 0;
        g.fillStyle = dark ? "#100e12" : "#1c181e";
        g.fillRect(x, y, slab, slab);
        g.globalAlpha = 0.18;
        g.strokeStyle = "#d8d4dc";
        for (let n = 0; n < 5; n++) {
          g.beginPath();
          const sx = x + hash(x, y, n, 1) * slab,
            sy = y + hash(y, x, n, 2) * slab;
          g.moveTo(sx, sy);
          g.bezierCurveTo(sx + 30, sy + 10, sx + 50, sy - 20, sx + 90, sy + 6);
          g.stroke();
        }
        g.globalAlpha = 1;
      }
    // the border: a cream band with a gold zigzag
    const b = 0.9 * px;
    g.fillStyle = "#e8dcc0";
    g.fillRect(b * 0.6, b * 0.6, W - b * 1.2, b * 0.5);
    g.fillRect(b * 0.6, H - b * 1.1, W - b * 1.2, b * 0.5);
    g.fillRect(b * 0.6, b * 0.6, b * 0.5, H - b * 1.2);
    g.fillRect(W - b * 1.1, b * 0.6, b * 0.5, H - b * 1.2);
    g.strokeStyle = "#c9a24a";
    g.lineWidth = 5;
    const zig = (x0: number, y0: number, x1: number, y1: number) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.floor(len / 24);
      const ux = (x1 - x0) / len,
        uy = (y1 - y0) / len;
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const o = i % 2 ? 9 : -9;
        g.lineTo(x0 + ux * i * 24 - uy * o, y0 + uy * i * 24 + ux * o);
      }
      g.stroke();
    };
    zig(b, b * 0.85, W - b, b * 0.85);
    zig(b, H - b * 0.85, W - b, H - b * 0.85);
    zig(b * 0.85, b, b * 0.85, H - b);
    zig(W - b * 0.85, b, W - b * 0.85, H - b);
    // the compass star in the middle of the hall
    g.save();
    g.translate(W / 2, H * 0.52);
    const R = Math.min(W, H) * 0.3;
    g.fillStyle = "#e8dcc0";
    g.beginPath();
    g.arc(0, 0, R * 1.04, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#121014";
    g.beginPath();
    g.arc(0, 0, R * 0.98, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 4 === 0 ? R * 0.95 : i % 2 === 0 ? R * 0.7 : R * 0.5;
      g.fillStyle = i % 2 ? "#a8822e" : "#d9b25a";
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a - 0.12) * r * 0.32, Math.sin(a - 0.12) * r * 0.32);
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      g.lineTo(Math.cos(a + 0.12) * r * 0.32, Math.sin(a + 0.12) * r * 0.32);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#e8dcc0";
    g.beginPath();
    g.arc(0, 0, R * 0.16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#121014";
    g.font = `900 ${Math.round(R * 0.2)}px ${DECO}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("Z", 0, 2);
    g.restore();
  });
}

/** A ceiling of gold rays from the middle, stepped coffers round it. */
export function sunburstCeiling(w: number, d: number) {
  return paint(1024, Math.round((1024 * d) / w), (g, W, H) => {
    g.fillStyle = "#2a1e10";
    g.fillRect(0, 0, W, H);
    const cx = W / 2,
      cy = H / 2;
    const R = Math.hypot(W, H) / 2;
    for (let i = 0; i < 48; i++) {
      const a0 = (i / 48) * Math.PI * 2,
        a1 = ((i + 1) / 48) * Math.PI * 2;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
      gr.addColorStop(0, i % 2 ? "#f6d784" : "#e8c060");
      gr.addColorStop(1, i % 2 ? "#8a6420" : "#6a4a18");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, R, a0, a1);
      g.closePath();
      g.fill();
    }
    for (let r = 1; r <= 5; r++) {
      g.strokeStyle = "rgba(40,24,8,0.6)";
      g.lineWidth = 6;
      g.strokeRect(cx - (W / 12) * r, cy - (H / 12) * r, (W / 6) * r, (H / 6) * r);
    }
    g.fillStyle = "#fff3c8";
    g.beginPath();
    g.arc(cx, cy, W * 0.05, 0, Math.PI * 2);
    g.fill();
  });
}

/**
 * The lobby's great relief: the tower itself in gold on black marble, rays bursting from its
 * crown, the city's map lines at its foot, the name over it and a clock.
 */
export function drawTowerMural(g: CanvasRenderingContext2D, W: number, H: number, time = new Date()) {
  {
    g.fillStyle = "#0e0c10";
    g.fillRect(0, 0, W, H);
    // rays from the crown
    const cx = W / 2,
      cy = H * 0.3;
    for (let i = 0; i < 36; i++) {
      const a = Math.PI + (i / 35) * Math.PI;
      g.strokeStyle = i % 2 ? "rgba(217,178,90,0.55)" : "rgba(217,178,90,0.25)";
      g.lineWidth = i % 2 ? 3 : 7;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * W, cy + Math.sin(a) * W);
      g.stroke();
    }
    // concentric bands behind
    g.strokeStyle = "rgba(217,178,90,0.35)";
    g.lineWidth = 2;
    for (let r = 60; r < 500; r += 40) {
      g.beginPath();
      g.arc(cx, cy, r, Math.PI, Math.PI * 2);
      g.stroke();
    }
    // the tower: setbacks, crown, spire (gold leaf with darker piers)
    const tiers: [number, number, number][] = [
      [0.17, 0.98, 0.84],
      [0.13, 0.84, 0.6],
      [0.095, 0.6, 0.42],
      [0.07, 0.42, 0.3],
    ];
    for (const [hw, y0, y1] of tiers) {
      const gr = g.createLinearGradient(cx - hw * W, 0, cx + hw * W, 0);
      gr.addColorStop(0, "#8a6420");
      gr.addColorStop(0.5, "#f6d784");
      gr.addColorStop(1, "#8a6420");
      g.fillStyle = gr;
      g.fillRect(cx - hw * W, y1 * H, hw * 2 * W, (y0 - y1) * H);
      g.fillStyle = "rgba(40,24,8,0.55)";
      for (let x = cx - hw * W + 8; x < cx + hw * W - 4; x += 14) g.fillRect(x, y1 * H + 6, 4, (y0 - y1) * H - 10);
    }
    // the crown arches and spire
    g.fillStyle = "#f6e2a8";
    for (let i = 0; i < 6; i++) {
      const r = 0.065 * W * (1 - i * 0.15);
      g.beginPath();
      g.arc(cx, 0.3 * H - i * 16, r, Math.PI, 0);
      g.closePath();
      g.fill();
      g.strokeStyle = "#8a6420";
      g.lineWidth = 2;
      g.stroke();
    }
    g.fillRect(cx - 2, 0.06 * H, 4, 0.16 * H);
    // the street and the map lines at its foot
    g.fillStyle = "#c9a24a";
    g.fillRect(W * 0.08, H * 0.98, W * 0.84, 4);
    // the name and the clock
    g.fillStyle = GOLD;
    g.font = `800 46px ${DECO}`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText("ZK TOWER", W * 0.04, H * 0.1);
    g.textAlign = "right";
    g.fillText("ORCHARD", W * 0.96, H * 0.1);
    g.font = `500 20px ${MONO}`;
    g.fillStyle = "#c9a24a";
    g.textAlign = "left";
    g.fillText("NU5 · 2022 · HALO 2", W * 0.04, H * 0.16);
    g.textAlign = "right";
    g.fillText("NO TRUSTED SETUP", W * 0.96, H * 0.16);
    // the clock, right of the tower
    const kx = W * 0.82,
      ky = H * 0.55,
      kr = 70;
    g.fillStyle = "#16141a";
    g.beginPath();
    g.arc(kx, ky, kr, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = GOLD;
    g.lineWidth = 6;
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillStyle = GOLD;
      g.fillRect(kx + Math.sin(a) * (kr - 14) - 3, ky - Math.cos(a) * (kr - 14) - 3, 6, 6);
    }
    const hh = time.getHours() % 12,
      mm = time.getMinutes();
    const hand = (a: number, l: number, w: number) => {
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(kx, ky);
      g.lineTo(kx + Math.sin(a) * l, ky - Math.cos(a) * l);
      g.stroke();
    };
    hand(((hh + mm / 60) / 12) * Math.PI * 2, kr * 0.5, 6);
    hand((mm / 60) * Math.PI * 2, kr * 0.8, 4);
    // a matching medallion on the left: the shield
    const sx = W * 0.18;
    g.strokeStyle = GOLD;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(sx, ky - 70);
    g.lineTo(sx + 58, ky - 46);
    g.lineTo(sx + 52, ky + 20);
    g.quadraticCurveTo(sx + 30, ky + 62, sx, ky + 76);
    g.quadraticCurveTo(sx - 30, ky + 62, sx - 52, ky + 20);
    g.lineTo(sx - 58, ky - 46);
    g.closePath();
    g.stroke();
    g.fillStyle = GOLD;
    g.font = `900 78px ${DECO}`;
    g.textAlign = "center";
    g.fillText("Z", sx, ky + 6);
  }
}

/** Wood panelling with brass inlay lines (walls of the offices and the club). */
export function panelling(base: string, line: string, rx = 1, ry = 1) {
  return paint(
    256,
    256,
    (g, W, H) => {
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x += 4) {
        g.fillStyle = `rgba(0,0,0,${0.05 + hash(x, 0, 1, 9) * 0.1})`;
        g.fillRect(x, 0, 2, H);
      }
      g.strokeStyle = line;
      g.lineWidth = 3;
      g.strokeRect(14, 14, W - 28, H - 28);
      g.beginPath();
      g.moveTo(W / 2, 14);
      g.lineTo(W / 2, H - 14);
      g.stroke();
    },
    rx,
    ry,
  );
}

/** The jazz club's carpet: deep red with gold fans. */
export function clubCarpet(rx: number, ry: number) {
  return paint(
    256,
    256,
    (g, W, H) => {
      g.fillStyle = "#4a0c14";
      g.fillRect(0, 0, W, H);
      g.strokeStyle = "rgba(217,178,90,0.55)";
      g.lineWidth = 2;
      for (const [ox, oy] of [
        [0, 0],
        [W / 2, H / 2],
        [W, 0],
        [0, H],
        [W, H],
      ])
        for (let r = 10; r <= 60; r += 12) {
          g.beginPath();
          g.arc(ox, oy + 30, r, Math.PI * 1.15, Math.PI * 1.85);
          g.stroke();
        }
    },
    rx,
    ry,
  );
}

/** The stage's backdrop: a gold shell of rays over midnight blue, the club's name in neon. */
export function stageBackdrop() {
  return paint(1024, 512, (g, W, H) => {
    g.fillStyle = "#0a0c22";
    g.fillRect(0, 0, W, H);
    const cx = W / 2,
      cy = H;
    for (let i = 0; i < 30; i++) {
      const a = Math.PI + (i / 29) * Math.PI;
      g.strokeStyle = i % 2 ? "#d9b25a" : "#8a6420";
      g.lineWidth = i % 2 ? 4 : 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80);
      g.lineTo(cx + Math.cos(a) * W, cy + Math.sin(a) * W);
      g.stroke();
    }
    for (let r = 120; r < 520; r += 70) {
      g.strokeStyle = "rgba(217,178,90,0.6)";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, r, Math.PI, 0);
      g.stroke();
    }
    g.font = `italic 700 86px ${SERIF}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = "#ff5a8a";
    g.shadowBlur = 26;
    g.fillStyle = "#ffd0e0";
    g.fillText("The Nullifier", cx, H * 0.26);
    g.shadowBlur = 0;
    g.font = `600 22px ${DECO}`;
    g.fillStyle = "#d9b25a";
    g.fillText("JAZZ  ·  COCKTAILS  ·  SINCE BLOCK 1,687,104", cx, H * 0.42);
  });
}

/** A granite deck, big slabs. */
export function granite(rx: number, ry: number) {
  return paint(
    256,
    256,
    (g, W, H) => {
      g.fillStyle = "#8a8890";
      g.fillRect(0, 0, W, H);
      for (let n = 0; n < 2200; n++) {
        g.fillStyle = hash(n, 1, 2, 4) < 0.5 ? "rgba(30,30,36,0.25)" : "rgba(255,255,255,0.18)";
        g.fillRect(hash(n, 2, 2, 4) * W, hash(n, 3, 2, 4) * H, 2, 2);
      }
      g.strokeStyle = "rgba(40,40,46,0.7)";
      g.lineWidth = 2;
      g.strokeRect(0, 0, W, H);
    },
    rx,
    ry,
  );
}

export const mat = (map: THREE.Texture, roughness = 0.5, metalness = 0.05) => new THREE.MeshStandardMaterial({ map, roughness, metalness });
