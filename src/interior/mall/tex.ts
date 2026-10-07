import * as THREE from "three";
import { hash } from "../../scene/voxel/model";
import { makeCanvas } from "./kit";

/** Canvas textures of the mall: floors, stone, carpet. All tile; world UVs are in metres / repeat. */

function tiled(draw: (g: CanvasRenderingContext2D, S: number) => void, S = 512) {
  const { t } = makeCanvas(S, S, (g) => draw(g, S));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Polished cream marble in 1.5 m slabs with grey veins and a hairline joint. */
export function marbleTex(base = "#ece6dc", vein = "120,112,100") {
  return tiled((g, S) => {
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    for (let q = 0; q < 4; q++) {
      const ox = (q % 2) * (S / 2),
        oy = Math.floor(q / 2) * (S / 2);
      const grd = g.createLinearGradient(ox, oy, ox + S / 2, oy + S / 2);
      grd.addColorStop(0, `rgba(255,255,255,${0.05 + hash(q, 1, 9, 9) * 0.08})`);
      grd.addColorStop(1, `rgba(0,0,0,${0.02 + hash(q, 2, 9, 9) * 0.04})`);
      g.fillStyle = grd;
      g.fillRect(ox, oy, S / 2, S / 2);
    }
    for (let i = 0; i < 46; i++) {
      g.strokeStyle = `rgba(${vein},${0.04 + hash(i, 1, 2, 3) * 0.12})`;
      g.lineWidth = 0.6 + hash(i, 2, 2, 3) * 2.2;
      g.beginPath();
      const x = hash(i, 3, 2, 3) * S;
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (hash(i, 4, 2, 3) - 0.5) * 300, S * 0.35, x + (hash(i, 5, 2, 3) - 0.5) * 300, S * 0.7, x + (hash(i, 6, 2, 3) - 0.5) * 200, S);
      g.stroke();
    }
    g.fillStyle = "rgba(60,50,40,0.18)";
    g.fillRect(0, 0, S, 2);
    g.fillRect(0, 0, 2, S);
    g.fillRect(0, S / 2 - 1, S, 2);
    g.fillRect(S / 2 - 1, 0, 2, S);
  });
}

/** Warm oak planks. */
export function woodTex(tone = "#8a5a36") {
  return tiled((g, S) => {
    g.fillStyle = tone;
    g.fillRect(0, 0, S, S);
    const n = 8;
    for (let r = 0; r < n; r++) {
      const y = (r * S) / n;
      for (let c = 0; c < 3; c++) {
        const x = ((c + (r % 2) * 0.5) * S) / 3;
        g.fillStyle = `rgba(${hash(r, c, 3, 1) > 0.5 ? "255,220,180" : "40,20,10"},${0.04 + hash(r, c, 4, 1) * 0.1})`;
        g.fillRect(x, y, S / 3, S / n);
        g.fillStyle = "rgba(30,15,5,0.35)";
        g.fillRect(x, y, 2, S / n);
      }
      g.fillStyle = "rgba(30,15,5,0.4)";
      g.fillRect(0, y, S, 2);
      for (let i = 0; i < 12; i++) {
        g.strokeStyle = `rgba(50,25,10,${0.08 + hash(r, i, 5, 1) * 0.1})`;
        g.beginPath();
        const yy = y + 4 + hash(r, i, 6, 1) * (S / n - 8);
        g.moveTo(0, yy);
        g.lineTo(S, yy + (hash(r, i, 7, 1) - 0.5) * 6);
        g.stroke();
      }
    }
  });
}

/** Cinema carpet: deep plum with a gold ⓩ dot pattern. */
export function carpetTex(base = "#2a1230", dot = "#c9a227") {
  return tiled((g, S) => {
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(255,255,255,${hash(i, 1, 1, 7) * 0.05})`;
      g.fillRect(hash(i, 2, 1, 7) * S, hash(i, 3, 1, 7) * S, 2, 2);
    }
    g.fillStyle = dot;
    g.font = `700 40px "JetBrains Mono", monospace`;
    g.textAlign = "center";
    g.globalAlpha = 0.5;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.fillText("ⓩ", (x + 0.5 + (y % 2) * 0.5) * (S / 4), (y + 0.65) * (S / 4));
  }, 256);
}

/** Granite setts along the canal. */
export function stoneTex() {
  return tiled((g, S) => {
    g.fillStyle = "#b8b0a2";
    g.fillRect(0, 0, S, S);
    const n = 8;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const v = 150 + hash(r, c, 8, 8) * 50;
        g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
        g.fillRect((c * S) / n + 2, (r * S) / n + 2, S / n - 4, S / n - 4);
      }
  }, 256);
}

/** Hawker-centre floor: small terracotta and cream tiles. */
export function tileTex() {
  return tiled((g, S) => {
    const n = 8;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        g.fillStyle = (r + c) % 2 ? "#d9cbb4" : hash(r, c, 2, 2) > 0.5 ? "#b8644a" : "#c27054";
        g.fillRect((c * S) / n, (r * S) / n, S / n, S / n);
        g.fillStyle = "rgba(0,0,0,0.15)";
        g.fillRect((c * S) / n, (r * S) / n, S / n, 2);
        g.fillRect((c * S) / n, (r * S) / n, 2, S / n);
      }
  }, 256);
}

/** A material with a tiling map whose UVs are given in metres (repeat: metres per tile). */
export function tiledMat(map: THREE.Texture, metres: number, o: { roughness?: number; metalness?: number } = {}) {
  map.repeat.set(1 / metres, 1 / metres);
  return new THREE.MeshStandardMaterial({ map, roughness: o.roughness ?? 0.2, metalness: o.metalness ?? 0.05 });
}
