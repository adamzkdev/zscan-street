import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ZONES } from "./kit";

/**
 * The plants: one painted atlas of sixteen leaves, fronds, flowers and clumps, and instanced cards
 * that use it (crossed quads for bushes and flowers, arched strips for fronds, flat panels for the
 * vines on the Supertrees and the mountain, star clumps for tree crowns). One draw call per card
 * shape per zone; every card sways a little in the breeze.
 */

export const P = {
  fern: 0,
  palm: 1,
  broad: 2,
  grass: 3,
  bush: 4,
  bougain: 5,
  marigold: 6,
  heliconia: 7,
  orchid: 8,
  bromeliad: 9,
  tulips: 10,
  canopy: 11,
  olive: 12,
  vine: 13,
  salvia: 14,
  agave: 15,
} as const;
export type Shape = "cross" | "frond" | "panel" | "clump";

const CELL = 512;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const hsl = (h: number, s: number, l: number) => `hsl(${h},${s}%,${l}%)`;

function leaf(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number, fill: string, rib?: string) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(wid, -len * 0.45, 0, -len);
  g.quadraticCurveTo(-wid, -len * 0.45, 0, 0);
  g.fillStyle = fill;
  g.fill();
  if (rib) {
    g.strokeStyle = rib;
    g.lineWidth = Math.max(1, wid * 0.12);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -len * 0.92);
    g.stroke();
  }
  g.restore();
}

/** Each cell, drawn in a 512 × 512 square whose bottom edge is the plant's base. */
const CELLS: ((g: CanvasRenderingContext2D) => void)[] = [
  // 0 fern frond: a stem up the middle, leaflets shrinking to the tip
  (g) => {
    g.strokeStyle = "#2c5a24";
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(256, 512);
    g.quadraticCurveTo(250, 250, 262, 8);
    g.stroke();
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const y = 500 - t * 480;
      const L = 210 * (1 - t * 0.85) * (t < 0.08 ? 0.6 : 1);
      for (const s of [-1, 1]) {
        const c = hsl(100 + rnd() * 25, 45 + rnd() * 15, 26 + t * 14 + rnd() * 6);
        leaf(g, 256 + s * 4, y, s * (1.2 - t * 0.3), L, 18 * (1 - t * 0.6), c, "rgba(20,50,15,0.6)");
      }
    }
  },
  // 1 palm frond: a long rib, thin leaflets drooping
  (g) => {
    g.strokeStyle = "#6a7a2a";
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(256, 512);
    g.lineTo(256, 4);
    g.stroke();
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const y = 500 - t * 490;
      const L = 230 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.08)) + 20;
      for (const s of [-1, 1]) leaf(g, 256, y, s * (1.9 - t * 0.6) + (rnd() - 0.5) * 0.15, L, 9, hsl(85 + rnd() * 30, 50, 28 + rnd() * 12), "rgba(30,50,10,0.5)");
    }
  },
  // 2 broad leaf: banana / elephant ear, midrib and veins
  (g) => {
    g.strokeStyle = "#4a7a2a";
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(256, 512);
    g.lineTo(256, 420);
    g.stroke();
    g.beginPath();
    g.moveTo(256, 430);
    g.bezierCurveTo(500, 380, 470, 60, 256, 6);
    g.bezierCurveTo(42, 60, 12, 380, 256, 430);
    const gr = g.createLinearGradient(0, 430, 0, 0);
    gr.addColorStop(0, "#2f6a28");
    gr.addColorStop(1, "#4f9a38");
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = "rgba(190,230,140,0.55)";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(256, 430);
    g.lineTo(256, 20);
    g.stroke();
    g.lineWidth = 2;
    for (let i = 1; i < 16; i++) {
      const y = 420 - i * 25;
      g.beginPath();
      g.moveTo(256, y);
      g.quadraticCurveTo(330, y - 30, 440, y - 50 - i);
      g.moveTo(256, y);
      g.quadraticCurveTo(180, y - 30, 72, y - 50 - i);
      g.stroke();
    }
    // a couple of tears in it
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 4; i++) {
      const y = 120 + rnd() * 250;
      g.beginPath();
      g.moveTo(rnd() < 0.5 ? 40 : 472, y);
      g.lineTo(256, y + 20);
      g.lineWidth = 3;
      g.stroke();
    }
    g.globalCompositeOperation = "source-over";
  },
  // 3 grass tuft
  (g) => {
    for (let i = 0; i < 90; i++) {
      const x = 80 + rnd() * 352;
      const h = 200 + rnd() * 300;
      const bend = (rnd() - 0.5) * 220;
      g.strokeStyle = hsl(80 + rnd() * 30, 40 + rnd() * 20, 26 + rnd() * 22);
      g.lineWidth = 3 + rnd() * 5;
      g.beginPath();
      g.moveTo(x, 512);
      g.quadraticCurveTo(x + bend * 0.2, 512 - h * 0.6, x + bend, 512 - h);
      g.stroke();
    }
  },
  // 4 bush: a dome of small leaves, dark inside
  (g) => {
    for (let i = 0; i < 900; i++) {
      const a = rnd() * Math.PI,
        r = Math.sqrt(rnd());
      const x = 256 + Math.cos(a) * r * 240,
        y = 510 - Math.sin(a) * r * 300;
      leaf(g, x, y, (rnd() - 0.5) * 3, 30 + rnd() * 22, 12, hsl(95 + rnd() * 35, 40 + rnd() * 20, 18 + (1 - r) * 4 + rnd() * 20));
    }
  },
  // 5 bougainvillea: a bush wrapped in magenta bracts
  (g) => {
    for (let i = 0; i < 500; i++) {
      const a = rnd() * Math.PI,
        r = Math.sqrt(rnd());
      leaf(g, 256 + Math.cos(a) * r * 240, 510 - Math.sin(a) * r * 320, (rnd() - 0.5) * 3, 30, 12, hsl(100 + rnd() * 20, 40, 20 + rnd() * 14));
    }
    for (let i = 0; i < 700; i++) {
      const a = rnd() * Math.PI,
        r = Math.sqrt(rnd());
      g.fillStyle = hsl(pick([318, 325, 332, 340, 300]), 75 + rnd() * 20, 48 + rnd() * 18);
      g.beginPath();
      g.arc(256 + Math.cos(a) * r * 250, 505 - Math.sin(a) * r * 330, 6 + rnd() * 8, 0, 7);
      g.fill();
    }
  },
  // 6 marigolds / lantana: a low mound with orange and yellow heads
  (g) => {
    for (let i = 0; i < 300; i++) {
      const a = rnd() * Math.PI,
        r = Math.sqrt(rnd());
      leaf(g, 256 + Math.cos(a) * r * 240, 512 - Math.sin(a) * r * 220, (rnd() - 0.5) * 3, 34, 12, hsl(100 + rnd() * 20, 45, 22 + rnd() * 12));
    }
    for (let i = 0; i < 140; i++) {
      const a = rnd() * Math.PI,
        r = Math.sqrt(rnd());
      const x = 256 + Math.cos(a) * r * 240,
        y = 505 - Math.sin(a) * r * 230;
      const c = pick([38, 30, 46, 20, 50]);
      for (let p = 0; p < 7; p++) {
        g.fillStyle = hsl(c + rnd() * 8, 95, 50 + rnd() * 12);
        g.beginPath();
        g.arc(x + Math.cos(p) * 8, y + Math.sin(p) * 8, 8, 0, 7);
        g.fill();
      }
    }
  },
  // 7 heliconia: tall leaves and hanging lobster-claw bracts, red tipped with yellow
  (g) => {
    for (let i = 0; i < 7; i++) leaf(g, 140 + rnd() * 230, 512, (rnd() - 0.5) * 0.8, 380 + rnd() * 110, 40, hsl(105 + rnd() * 15, 50, 24 + rnd() * 10), "rgba(200,230,150,0.4)");
    for (let s = 0; s < 4; s++) {
      const x = 120 + s * 90 + rnd() * 30;
      g.strokeStyle = "#3a6a22";
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x, 512);
      g.lineTo(x, 120);
      g.stroke();
      for (let b = 0; b < 6; b++) {
        const y = 140 + b * 42;
        const sd = b % 2 ? 1 : -1;
        g.save();
        g.translate(x, y);
        g.rotate(sd * 1.1);
        g.fillStyle = "#e0242c";
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(sd * 8, -50);
        g.lineTo(-sd * 10, -4);
        g.fill();
        g.fillStyle = "#f4d23a";
        g.fillRect(-3, -50, 7, 12);
        g.restore();
      }
    }
  },
  // 8 orchids: arching sprays of purple, white and pink blooms
  (g) => {
    for (let i = 0; i < 5; i++) leaf(g, 200 + rnd() * 110, 512, (rnd() - 0.5) * 2.2, 160, 34, hsl(110, 40, 26 + rnd() * 10));
    for (let s = 0; s < 6; s++) {
      const x0 = 210 + rnd() * 90;
      const dir = rnd() < 0.5 ? -1 : 1;
      const col = pick([[285, 60, 55], [300, 70, 70], [0, 0, 96], [330, 70, 70], [270, 50, 45], [50, 85, 70]]);
      let x = x0,
        y = 470;
      for (let k = 0; k < 14; k++) {
        const nx = x + dir * (10 + k * 1.4),
          ny = y - 30 + k * 3;
        g.strokeStyle = "#4a6a2a";
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(nx, ny);
        g.stroke();
        x = nx;
        y = ny;
        if (k > 3) {
          g.fillStyle = hsl(col[0], col[1], col[2]);
          for (let p = 0; p < 5; p++) {
            g.beginPath();
            g.ellipse(x + Math.cos((p * 2 * Math.PI) / 5) * 11, y + Math.sin((p * 2 * Math.PI) / 5) * 11, 11, 7, (p * 2 * Math.PI) / 5, 0, 7);
            g.fill();
          }
          g.fillStyle = hsl(col[0] + 20, 80, 35);
          g.beginPath();
          g.arc(x, y, 6, 0, 7);
          g.fill();
        }
      }
    }
  },
  // 9 bromeliad leaf: a strap leaf, green to a red heart (fronds of a rosette)
  (g) => {
    g.beginPath();
    g.moveTo(206, 512);
    g.quadraticCurveTo(190, 200, 256, 6);
    g.quadraticCurveTo(322, 200, 306, 512);
    const gr = g.createLinearGradient(0, 512, 0, 0);
    gr.addColorStop(0, "#c8182a");
    gr.addColorStop(0.35, "#e0402a");
    gr.addColorStop(0.55, "#4a8a2a");
    gr.addColorStop(1, "#2f6a24");
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.18)";
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(222 + i * 14, 512);
      g.lineTo(240 + i * 6, 40);
      g.stroke();
    }
  },
  // 10 tulips: a crowded bed in mixed colours
  (g) => {
    for (let i = 0; i < 70; i++) {
      const x = 40 + rnd() * 432;
      const h = 230 + rnd() * 200;
      g.fillStyle = hsl(110, 35, 32);
      leaf(g, x, 512, (rnd() - 0.5) * 0.6, h * 0.55, 18, hsl(110 + rnd() * 20, 35, 30 + rnd() * 10));
    }
    const cols = [[0, 85, 50], [350, 80, 62], [45, 95, 55], [30, 95, 55], [280, 55, 45], [330, 75, 75], [0, 0, 97], [15, 90, 58]];
    for (let i = 0; i < 55; i++) {
      const x = 40 + rnd() * 432;
      const h = 260 + rnd() * 200;
      g.strokeStyle = "#3a7a2a";
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x, 512);
      g.lineTo(x + (rnd() - 0.5) * 20, 512 - h);
      g.stroke();
      const c = pick(cols);
      g.fillStyle = hsl(c[0], c[1], c[2]);
      g.beginPath();
      g.moveTo(x - 20, 512 - h);
      g.quadraticCurveTo(x - 22, 512 - h - 48, x - 10, 512 - h - 52);
      g.lineTo(x, 512 - h - 38);
      g.lineTo(x + 10, 512 - h - 52);
      g.quadraticCurveTo(x + 22, 512 - h - 48, x + 20, 512 - h);
      g.quadraticCurveTo(x, 512 - h + 14, x - 20, 512 - h);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.22)";
      g.fillRect(x - 12, 512 - h - 40, 5, 30);
    }
  },
  // 11 canopy clump: dense rounded leaves of a rain tree
  (g) => {
    for (let i = 0; i < 1300; i++) {
      const a = rnd() * Math.PI * 2,
        r = Math.sqrt(rnd());
      const x = 256 + Math.cos(a) * r * 235,
        y = 256 + Math.sin(a) * r * 225;
      leaf(g, x, y, rnd() * 7, 26 + rnd() * 18, 13, hsl(90 + rnd() * 35, 40 + rnd() * 20, 17 + rnd() * 17 + (Math.sin(a) < 0 ? 8 : 0)));
    }
  },
  // 12 olive canopy: small silvery grey-green leaves
  (g) => {
    for (let i = 0; i < 1500; i++) {
      const a = rnd() * Math.PI * 2,
        r = Math.sqrt(rnd());
      leaf(g, 256 + Math.cos(a) * r * 235, 256 + Math.sin(a) * r * 215, rnd() * 7, 28, 7, hsl(75 + rnd() * 25, 14 + rnd() * 14, 34 + rnd() * 24));
    }
  },
  // 13 vines: hanging strands with small leaves (vertical gardens)
  (g) => {
    for (let s = 0; s < 34; s++) {
      const x0 = rnd() * 512;
      const len = 200 + rnd() * 312;
      let x = x0;
      for (let y = 0; y < len; y += 9) {
        x += (rnd() - 0.5) * 5;
        leaf(g, x, y, (rnd() - 0.5) * 2.4 + (y % 18 ? 1 : -1), 22 + rnd() * 12, 10, hsl(85 + rnd() * 45, 40 + rnd() * 25, 20 + rnd() * 22));
      }
      if (rnd() < 0.35) {
        g.fillStyle = hsl(pick([320, 0, 45, 280, 200]), 80, 60);
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          g.arc(x0 + (rnd() - 0.5) * 30, rnd() * len, 7, 0, 7);
          g.fill();
        }
      }
    }
  },
  // 14 salvia / lavender: purple spikes and white daisies
  (g) => {
    for (let i = 0; i < 60; i++) {
      const x = 50 + rnd() * 412;
      const h = 160 + rnd() * 280;
      g.strokeStyle = "#4a6a3a";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(x, 512);
      g.lineTo(x, 512 - h);
      g.stroke();
      const c = rnd() < 0.75 ? [265 + rnd() * 20, 55, 50 + rnd() * 10] : [210, 60, 60];
      for (let y = 512 - h; y < 512 - h * 0.55; y += 8) {
        g.fillStyle = hsl(c[0], c[1], c[2] + rnd() * 12);
        g.beginPath();
        g.ellipse(x + (rnd() - 0.5) * 8, y, 7, 5, 0, 0, 7);
        g.fill();
      }
    }
    for (let i = 0; i < 25; i++) {
      const x = 40 + rnd() * 432,
        y = 330 + rnd() * 150;
      g.fillStyle = "#f8f6ee";
      for (let p = 0; p < 10; p++) {
        g.beginPath();
        g.ellipse(x + Math.cos(p * 0.628) * 9, y + Math.sin(p * 0.628) * 9, 8, 3, p * 0.628, 0, 7);
        g.fill();
      }
      g.fillStyle = "#f4c428";
      g.beginPath();
      g.arc(x, y, 5, 0, 7);
      g.fill();
    }
  },
  // 15 agave: thick pointed blue-green leaves from a rosette
  (g) => {
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (i / 15 - 0.5) * 2.6;
      g.save();
      g.translate(256, 505);
      g.rotate(a + Math.PI / 2);
      g.beginPath();
      g.moveTo(-26, 0);
      g.quadraticCurveTo(-24, -200, 0, -360 + Math.abs(i - 7.5) * 18);
      g.quadraticCurveTo(24, -200, 26, 0);
      const gr = g.createLinearGradient(-26, 0, 26, 0);
      gr.addColorStop(0, "#5a8a88");
      gr.addColorStop(0.5, "#8ab8b0");
      gr.addColorStop(1, "#4a7a78");
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = "#e8d8a0";
      g.lineWidth = 3;
      g.stroke();
      g.restore();
    }
  },
];

let atlasTex: THREE.Texture | null = null;
function atlas() {
  if (atlasTex) return atlasTex;
  const c = document.createElement("canvas");
  c.width = c.height = CELL * 4;
  const g = c.getContext("2d")!;
  CELLS.forEach((draw, i) => {
    g.save();
    // cell i: column i % 4, row floor(i / 4) counted from the bottom (uv space)
    g.translate((i % 4) * CELL, (3 - Math.floor(i / 4)) * CELL);
    g.beginPath();
    g.rect(0, 0, CELL, CELL);
    g.clip();
    seed = 7 + i * 101;
    draw(g);
    g.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  atlasTex = t;
  return t;
}

const time = { value: 0 };
let mat: THREE.MeshLambertMaterial | null = null;
function material() {
  if (mat) return mat;
  mat = new THREE.MeshLambertMaterial({ map: atlas(), alphaTest: 0.42, side: THREE.DoubleSide });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCell;\nuniform float uTime;")
      .replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvMapUv = (uv * 0.996 + 0.002 + vec2(mod(aCell, 4.0), floor(aCell / 4.0))) * 0.25;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 ip = instanceMatrix[3];
        float sway = sin(uTime * 1.3 + ip.x * 0.31 + ip.z * 0.23) * 0.5 + sin(uTime * 2.7 + ip.x * 0.7) * 0.2;
        transformed.x += sway * 0.05 * uv.y;
        transformed.z += sway * 0.035 * uv.y;`,
      );
    s.fragmentShader = s.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = normalize(vNormal);");
  };
  return mat;
}

/** Card shapes (unit size, base at y = 0; uv.y runs up the plant). */
function shape(s: Shape) {
  const up = (g: THREE.BufferGeometry, k = 0.35) => {
    // leaves lit mostly from above, a little from their face
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) {
      const v = new THREE.Vector3(n.getX(i) * k, 1, n.getZ(i) * k).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  };
  if (s === "cross" || s === "clump") {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) parts.push(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY((i * Math.PI) / 3));
    if (s === "clump") {
      for (const p of parts) p.translate(0, -0.5, 0);
      parts.push(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    }
    return up(mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!);
  }
  if (s === "panel") return up(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), 0.8);
  // frond: a strip along +z, arching up then drooping (uv.y from base to tip)
  const g = new THREE.PlaneGeometry(1, 1, 1, 6);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) + 0.5;
    pos.setXYZ(i, pos.getX(i), Math.sin(t * Math.PI * 0.8) * 0.28 - t * t * 0.18, t);
  }
  g.computeVertexNormals();
  return up(g, 0.2);
}

interface Card {
  m: THREE.Matrix4;
  cell: number;
  c: THREE.Color;
}

export class Flora {
  private lists: Map<Shape, Card[]>[] = Array.from({ length: ZONES }, () => new Map());
  private e = new THREE.Euler(0, 0, 0, "YXZ");
  private q = new THREE.Quaternion();

  /** A card: `zone`, shape, atlas cell, base position (scene coordinates), yaw/pitch/roll, size (w, h). */
  add(zone: number, s: Shape, cell: number, x: number, y: number, z: number, yaw: number, w: number, h: number, tint: THREE.ColorRepresentation = "#ffffff", pitch = 0, roll = 0) {
    let l = this.lists[zone].get(s);
    if (!l) this.lists[zone].set(s, (l = []));
    this.e.set(pitch, yaw, roll, "YXZ");
    this.q.setFromEuler(this.e);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(w, h, s === "frond" ? h : w));
    l.push({ m, cell, c: new THREE.Color(tint) });
  }

  /** A rosette of `n` fronds from (x, y, z): a palm crown, a fern, a bromeliad. */
  rosette(zone: number, cell: number, x: number, y: number, z: number, n: number, len: number, wid: number, lift: number, rnd: () => number, tint: THREE.ColorRepresentation = "#ffffff") {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
      const L = len * (0.75 + rnd() * 0.4);
      this.add(zone, "frond", cell, x, y, z, a, wid * L, L, tint, -lift - (rnd() - 0.5) * 0.4);
    }
  }

  build(groups: THREE.Group[]) {
    const mat = material();
    this.lists.forEach((map, zone) => {
      for (const [s, cards] of map) {
        if (!cards.length) continue;
        const geo = shape(s);
        const cells = new Float32Array(cards.length);
        cards.forEach((c, i) => (cells[i] = c.cell));
        geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 1));
        const mesh = new THREE.InstancedMesh(geo, mat, cards.length);
        cards.forEach((c, i) => {
          mesh.setMatrixAt(i, c.m);
          mesh.setColorAt(i, c.c);
        });
        mesh.computeBoundingSphere();
        mesh.raycast = () => {};
        groups[zone].add(mesh);
      }
    });
    this.lists = Array.from({ length: ZONES }, () => new Map());
  }

  static tick(t: number) {
    time.value = t;
  }
}
