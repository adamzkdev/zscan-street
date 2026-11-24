/**
 * ZK LEGENDS' arenas, in 3D (three.js), drawn in the city's own voxel way. Each one is the duel table
 * (a thick slab with a carved, painted top: two lanes of seven bays, the ledger line and the Z seal,
 * a raised rim, a tower at each corner) standing in a themed hall:
 *  - RIGS, the mining hall (Transparent): racks of rigs with spinning fans and blinking LEDs, cable
 *    trays, hanging lamps, a conveyor carrying fresh blocks.
 *  - ORCHARD, the garden terrace (Sapling): fruit trees, stone lanterns, a pond, petals in the air.
 *  - CRYPT, the old pool (Sprout): tombstones, candles, iron gates, a green mist.
 *  - VAULT, the shielded vault (Orchard): the great round door turning, gold stacks, sweeping lasers.
 * Some things answer a click (Hearthstone's board toys): `toys` are pickable, `poke(i)` sets them off.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mulberry } from "./engine";
import { GOLD, clothTex, facets, grainTile, innerShadow, metalFill, mixc, ngon, puffTex, rimTex, rugTex, stepRect, stud, texture, voxelGrain, zCoinTex, zMark, type Trim } from "./boardart";

export type MapKind = "rigs" | "orchard" | "crypt" | "vault";
export const MAPS: MapKind[] = ["rigs", "orchard", "crypt", "vault"];

export interface MapHandle {
  group: THREE.Group;
  update(dt: number, t: number): void;
  /** Meshes that answer a click (userData.toy = index). */
  toys: THREE.Object3D[];
  /** A toy was clicked: its little show. Returns a word for a sound ("hum", "chime", "creak", "clank"). */
  poke(i: number): string;
  /** The theme's accent (for effects). */
  accent: string;
  dispose(): void;
}

/** The table's playing surface: lanes centred on these, in world units. */
export const TABLE = { w: 20, d: 13.2, top: 0, laneZ: [1.35, -1.55] as [number, number], laneW: 14.2, laneD: 2.6 };

interface Theme {
  floor: string;
  wood: string;
  rim: string;
  rimMetal: number;
  top: (g: CanvasRenderingContext2D, W: number, H: number, r: () => number) => void;
  accent: string;
  fog: string;
  sky: string;
  ground: string;
  key: string;
  keyI: number;
  fill: [string, number, THREE.Vector3][];
}

// ---- voxel helpers -----------------------------------------------------------------------------------

type Vox = { x: number; y: number; z: number; w: number; h: number; d: number; c: string | THREE.Color };
const tmpC = new THREE.Color();
/** Many coloured boxes as one mesh (vertex colours). */
function voxMesh(list: Vox[], mat: THREE.Material): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  for (const b of list) {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    g.translate(b.x, b.y, b.z);
    const c = b.c instanceof THREE.Color ? b.c : tmpC.set(b.c);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(geos), mat);
  for (const g of geos) g.dispose();
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const voxMat = (rough = 0.8, metal = 0.05) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, map: voxelGrain(), bumpMap: voxelGrain(), bumpScale: 0.6 });
const glow = (c: string, k = 2.2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4, toneMapped: false });
function shade(hex: string, k: number) {
  return new THREE.Color(hex).multiplyScalar(k);
}

function canvas(W: number, H: number) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return [c, c.getContext("2d")!] as const;
}

// ---- the tops, painted ---------------------------------------------------------------------------------

/**
 * The common carving over every top, painted like the cards: the two lanes sunk into the surface
 * (a soft shadow inside their rim, a gold inlay round them with its bevel), the seven bays engraved,
 * the ledger line inlaid across the middle with the Z seal (a struck gold coin), filigree at the
 * corners, studs, a worn edge and scratches, and a frame band round the whole top.
 */
function carve(g: CanvasRenderingContext2D, W: number, H: number, ink: string, inlay: string, lane: string, stitch: string) {
  const sx = W / TABLE.w,
    sz = H / TABLE.d;
  const X = (x: number) => W / 2 + x * sx,
    Z = (z: number) => H / 2 + z * sz;
  const trim: Trim = inlay === "#f4b728" || inlay === "#c9a54a" || inlay === "#d9862c" ? { m0: "#4a3006", m1: "#a87a14", m2: "#f0c24a", m3: "#fff4c8" } : { m0: mixc(inlay, "#000000", 0.6), m1: mixc(inlay, "#000000", 0.25), m2: inlay, m3: mixc(inlay, "#ffffff", 0.7) };
  const r = mulberry(W + H);
  // the lanes' inlay in a duller cut of the same metal: they frame the play, they don't shine
  const dim: Trim = { m0: mixc(trim.m0, "#000000", 0.3), m1: mixc(trim.m1, "#000000", 0.35), m2: mixc(trim.m2, "#000000", 0.35), m3: mixc(trim.m3, trim.m1, 0.55) };
  // the frame band round the whole top (metal, half-lit), and the top's worn edge inside it
  const band2: Trim = { m0: trim.m0, m1: mixc(trim.m1, "#000000", 0.2), m2: mixc(trim.m2, "#000000", 0.28), m3: mixc(trim.m3, trim.m2, 0.6) };
  const band = new Path2D();
  band.rect(0, 0, W, H);
  band.rect(46, 46, W - 92, H - 92);
  g.save();
  g.clip(band, "evenodd");
  metalFill(g, (() => { const p = new Path2D(); p.rect(0, 0, W, H); return p; })(), band2, 0, 0, W, H, 6);
  g.restore();
  innerShadow(g, stepRect(46, 46, W - 92, H - 92, 10), 40, 0.7, 0, 10);
  // scratches and scuffs
  g.save();
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = r() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.12)";
    g.lineWidth = 1 + r() * 1.5;
    const x = 60 + r() * (W - 120),
      y = 60 + r() * (H - 120),
      a = r() * Math.PI,
      l = 10 + r() * 60;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  g.restore();
  for (const lz of TABLE.laneZ) {
    const x0 = X(-TABLE.laneW / 2),
      y0 = Z(lz - TABLE.laneD / 2);
    const w = TABLE.laneW * sx,
      h = TABLE.laneD * sz;
    // the gold inlay round the lane, bevelled
    const outer = stepRect(x0 - 13, y0 - 13, w + 26, h + 26, 12);
    const inner = stepRect(x0 - 5, y0 - 5, w + 10, h + 10, 10);
    const ring = new Path2D();
    ring.addPath(outer);
    ring.addPath(inner);
    g.save();
    g.clip(ring, "evenodd");
    metalFill(g, outer, dim, x0 - 13, y0 - 13, x0 + w + 13, y0 + h + 13, 3);
    g.restore();
    // the play mat let into the lane: the theme's leather / felt / velvet, lighter in the middle where
    // the lamp falls, stitched round its edge, the rim's shadow falling in
    const recess = stepRect(x0 - 6, y0 - 6, w + 12, h + 12, 10);
    g.save();
    g.clip(recess);
    const mg = g.createRadialGradient(x0 + w / 2, y0 + h * 0.45, h * 0.2, x0 + w / 2, y0 + h / 2, w * 0.6);
    mg.addColorStop(0, mixc(lane, "#ffffff", 0.1));
    mg.addColorStop(0.6, lane);
    mg.addColorStop(1, mixc(lane, "#000000", 0.35));
    g.fillStyle = mg;
    g.fill(recess);
    texture(g, grainTile(), 0.45, x0 - 6, y0 - 6, w + 12, h + 12);
    // a fine weave
    g.globalAlpha = 0.06;
    g.fillStyle = "#000";
    for (let yy = y0; yy < y0 + h; yy += 4) g.fillRect(x0 - 6, yy, w + 12, 1);
    g.globalAlpha = 1;
    g.restore();
    innerShadow(g, recess, 26, 0.8, 0, 9);
    // the stitching
    g.save();
    g.setLineDash([12, 8]);
    g.lineWidth = 2.5;
    g.strokeStyle = "rgba(0,0,0,0.45)";
    g.translate(0, 1.5);
    g.stroke(stepRect(x0 + 10, y0 + 10, w - 20, h - 20, 8));
    g.translate(0, -1.5);
    g.strokeStyle = stitch;
    g.stroke(stepRect(x0 + 10, y0 + 10, w - 20, h - 20, 8));
    g.restore();
    // studs at the lane's ends
    for (const sxp of [x0 - 34, x0 + w + 34]) stud(g, sxp, y0 + h / 2, 10, trim);
  }
  // the ledger line, inlaid
  const mz = Z((TABLE.laneZ[0] + TABLE.laneZ[1]) / 2);
  const bar = stepRect(X(-TABLE.laneW / 2 - 0.4), mz - 8, (TABLE.laneW + 0.8) * sx, 16, 4);
  metalFill(g, bar, trim, 0, mz - 8, W, mz + 8, 3);
  // the Z seal: a struck gold coin on a dark disc
  const R = 0.56 * sx;
  const disc = new Path2D();
  disc.arc(W / 2, mz, R + 16, 0, Math.PI * 2);
  g.save();
  g.shadowColor = "rgba(0,0,0,0.7)";
  g.shadowBlur = 20;
  g.shadowOffsetY = 8;
  g.fillStyle = "#0c0a08";
  g.fill(disc);
  g.restore();
  const rimC = new Path2D();
  rimC.arc(W / 2, mz, R, 0, Math.PI * 2);
  metalFill(g, rimC, GOLD, W / 2 - R, mz - R, W / 2 + R, mz + R, 6);
  facets(g, ngon(W / 2, mz, R - 12, 12, -Math.PI / 2 + Math.PI / 12), W / 2, mz, ["#7a4f06", "#e0a92a", "#fff0b0"], 0.62);
  zMark(g, W / 2, mz, (R * 1.05) / 7, "rgba(90,58,6,0.8)");
  // filigree at the four corners of the play area
  for (const [cx, cy, dx, dy] of [
    [80, 80, 1, 1],
    [W - 80, 80, -1, 1],
    [80, H - 80, 1, -1],
    [W - 80, H - 80, -1, -1],
  ] as [number, number, number, number][]) {
    g.save();
    g.translate(cx, cy);
    g.scale(dx, dy);
    const s = 7;
    const steps: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 1], [4, 1], [5, 2], [5, 3], [4, 4], [3, 4], [3, 3], [0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [3, 5], [4, 6], [5, 6], [6, 5], [6, 4]];
    for (const [a, b] of steps) {
      g.fillStyle = trim.m0;
      g.fillRect(a * s + 1, b * s + 1, s, s);
      g.fillStyle = trim.m2;
      g.fillRect(a * s, b * s, s, s);
    }
    g.restore();
    stud(g, cx + dx * 4, cy + dy * 4, 9, trim);
  }
}


function noise(g: CanvasRenderingContext2D, W: number, H: number, r: () => number, a: number, n = 9000) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a * r()})` : `rgba(0,0,0,${a * 1.4 * r()})`;
    g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
}

/** Mix two colours (any CSS form), answer #rrggbb. */
const lerpHex = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

/** The lamp's pool painted into the top: lighter where it falls, the edges going down into shade. */
function lampPool(g: CanvasRenderingContext2D, W: number, H: number, warm: string, edge = 0.34) {
  g.save();
  g.globalCompositeOperation = "multiply";
  const m = g.createRadialGradient(W / 2, H * 0.5, H * 0.18, W / 2, H * 0.5, W * 0.62);
  m.addColorStop(0, "#ffffff");
  m.addColorStop(0.55, "#f4efe6");
  m.addColorStop(1, `rgba(0,0,0,${edge})`);
  g.fillStyle = m;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "soft-light";
  const s = g.createRadialGradient(W / 2, H * 0.48, 10, W / 2, H * 0.5, W * 0.4);
  s.addColorStop(0, warm);
  s.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = s;
  g.fillRect(0, 0, W, H);
  g.restore();
}

/** A rivet: a domed head lit from the top left. */
function rivet(g: CanvasRenderingContext2D, x: number, y: number, rr: number, base: string) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.arc(x + 1.5, y + 2, rr, 0, Math.PI * 2);
  g.fill();
  const d = g.createRadialGradient(x - rr * 0.35, y - rr * 0.4, 1, x, y, rr);
  d.addColorStop(0, "#fff4dc");
  d.addColorStop(0.35, base);
  d.addColorStop(1, mixc(base, "#000000", 0.5));
  g.fillStyle = d;
  g.beginPath();
  g.arc(x, y, rr, 0, Math.PI * 2);
  g.fill();
}

const TOPS: Record<MapKind, Theme["top"]> = {
  // riveted copper and brass plates, warm and worn, a little patina, heat tint here and there
  rigs: (g, W, H, r) => {
    g.fillStyle = "#5a3820";
    g.fillRect(0, 0, W, H);
    const P = 256;
    for (let y = 0; y < H; y += P)
      for (let x = 0; x < W; x += P) {
        const brass = r() < 0.3;
        const base = brass ? mixc("#c9a35a", "#b88c46", r()) : mixc("#c27f4c", "#b06c3c", r());
        g.fillStyle = base;
        g.fillRect(x + 3, y + 3, P - 6, P - 6);
        // brushed grain
        for (let k = 0; k < 60; k++) {
          g.fillStyle = `rgba(255,236,200,${0.03 + r() * 0.05})`;
          g.fillRect(x + 6, y + 6 + r() * (P - 12), P - 12, 1);
        }
        // a heat tint or a patina spot now and then
        if (r() < 0.22) {
          const tg = g.createRadialGradient(x + P * r(), y + P * r(), 4, x + P / 2, y + P / 2, P * 0.6);
          tg.addColorStop(0, "rgba(120,80,160,0.22)");
          tg.addColorStop(0.5, "rgba(60,120,170,0.12)");
          tg.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = tg;
          g.fillRect(x + 3, y + 3, P - 6, P - 6);
        }
        for (let k = 0; k < (r() < 0.3 ? 14 : 0); k++) {
          g.fillStyle = `rgba(70,150,130,${0.12 + r() * 0.12})`;
          g.fillRect(x + 10 + r() * (P - 20), y + 10 + r() * (P - 20), 3 + r() * 9, 3 + r() * 6);
        }
        // the plate's bevel
        g.fillStyle = "rgba(255,240,210,0.22)";
        g.fillRect(x + 3, y + 3, P - 6, 4);
        g.fillRect(x + 3, y + 3, 4, P - 6);
        g.fillStyle = "rgba(40,20,8,0.35)";
        g.fillRect(x + 3, y + P - 7, P - 6, 4);
        g.fillRect(x + P - 7, y + 3, 4, P - 6);
        for (const [a, b] of [
          [16, 16],
          [P - 16, 16],
          [16, P - 16],
          [P - 16, P - 16],
          [P / 2, 16],
          [P / 2, P - 16],
        ])
          rivet(g, x + a, y + b, 6, brass ? "#e6c06a" : "#d08a52");
      }
    noise(g, W, H, r, 0.05);
    lampPool(g, W, H, "rgba(255,200,140,0.55)");
    carve(g, W, H, "rgba(255,170,90,0.35)", "#d9862c", "#7a4a2a", "rgba(255,226,180,0.62)");
  },
  // sunlit sandstone flags, moss in the joints, petals and leaves blown across
  orchard: (g, W, H, r) => {
    g.fillStyle = "#6d7d42";
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; ) {
      const h = 110 + r() * 80;
      for (let x = -r() * 90; x < W; ) {
        const w = 130 + r() * 140;
        const base = lerpHex(lerpHex("#d6bf8c", "#c2a470", r()), "#cdb586", 0.3);
        const p = stepRect(x + 6, y + 6, w - 12, h - 12, 6);
        g.fillStyle = base;
        g.fill(p);
        // sun on the top-left edge, shade on the bottom-right, a little wear
        g.save();
        g.clip(p);
        g.fillStyle = "rgba(255,250,225,0.28)";
        g.fillRect(x + 6, y + 6, w - 12, 5);
        g.fillRect(x + 6, y + 6, 5, h - 12);
        g.fillStyle = "rgba(90,60,20,0.22)";
        g.fillRect(x + 6, y + h - 12, w - 12, 6);
        g.fillRect(x + w - 12, y + 6, 6, h - 12);
        for (let k = 0; k < 26; k++) {
          g.fillStyle = r() < 0.5 ? "rgba(140,100,50,0.16)" : "rgba(255,245,215,0.2)";
          g.fillRect(x + r() * w, y + r() * h, 2 + r() * 5, 2 + r() * 4);
        }
        g.restore();
        x += w;
      }
      y += h;
    }
    // moss tufts in the joints and creeping onto the flags
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = ["#6f8f3a", "#86a84a", "#5a7a30", "#9ab85a"][Math.floor(r() * 4)];
      const s = 2 + r() * 6;
      g.fillRect(r() * W, r() * H, s, s * (0.6 + r() * 0.6));
    }
    // petals and a few leaves
    for (let i = 0; i < 160; i++) {
      const x = r() * W,
        y = r() * H,
        a = r() * Math.PI;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = r() < 0.7 ? (r() < 0.5 ? "#ffc4d6" : "#ffe2ec") : "#7aa84a";
      g.beginPath();
      g.ellipse(0, 0, 7 + r() * 4, 3.5 + r() * 2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(-1, 2, 8, 1.5);
      g.restore();
    }
    noise(g, W, H, r, 0.05);
    lampPool(g, W, H, "rgba(255,236,170,0.6)", 0.28);
    carve(g, W, H, "rgba(220,255,200,0.3)", "#c9a54a", "#4f6e34", "rgba(240,250,210,0.58)");
  },
  // pale bone-grey slabs, cracked, faint runes, the wax of a thousand candles
  crypt: (g, W, H, r) => {
    g.fillStyle = "#4e4a54";
    g.fillRect(0, 0, W, H);
    const P = 210;
    for (let y = 0; y < H; y += P)
      for (let x = (y / P) % 2 ? -P / 2 : 0; x < W; x += P) {
        const base = lerpHex(lerpHex("#c3bcb0", "#a8a198", r()), "#b8b0c4", 0.18);
        g.fillStyle = base;
        g.fillRect(x + 5, y + 5, P - 10, P - 10);
        g.fillStyle = "rgba(255,252,240,0.22)";
        g.fillRect(x + 5, y + 5, P - 10, 4);
        g.fillRect(x + 5, y + 5, 4, P - 10);
        g.fillStyle = "rgba(40,30,50,0.28)";
        g.fillRect(x + 5, y + P - 9, P - 10, 4);
        g.fillRect(x + P - 9, y + 5, 4, P - 10);
        for (let k = 0; k < 30; k++) {
          g.fillStyle = r() < 0.5 ? "rgba(60,50,70,0.12)" : "rgba(255,255,250,0.14)";
          g.fillRect(x + r() * P, y + r() * P, 2 + r() * 5, 2 + r() * 4);
        }
        if (r() < 0.3) {
          g.strokeStyle = "rgba(40,30,50,0.5)";
          g.lineWidth = 2;
          g.beginPath();
          let cx = x + r() * P,
            cy = y + 6;
          g.moveTo(cx, cy);
          for (let k = 0; k < 6; k++) g.lineTo((cx += (r() - 0.5) * 50), (cy += P / 6));
          g.stroke();
        }
        // a rune, carved: a dark cut with a light lower edge
        if (r() < 0.35) {
          const rx = x + 40 + r() * (P - 80),
            ry = y + 40 + r() * (P - 80);
          const pts: [number, number][] = [];
          for (let k = 0; k < 4; k++) pts.push([rx + (r() - 0.5) * 34, ry + (r() - 0.5) * 34]);
          for (const [col, off] of [
            ["rgba(255,255,250,0.25)", 2],
            ["rgba(50,36,70,0.45)", 0],
          ] as [string, number][]) {
            g.strokeStyle = col;
            g.lineWidth = 3;
            g.beginPath();
            pts.forEach(([a, b], i) => (i ? g.lineTo(a, b + off) : g.moveTo(a, b + off)));
            g.stroke();
          }
        }
      }
    // candle wax, dripped and pooled near the edges
    for (let i = 0; i < 22; i++) {
      const edge = r() < 0.5;
      const x = edge ? (r() < 0.5 ? 70 + r() * 160 : W - 70 - r() * 160) : 70 + r() * (W - 140),
        y = edge ? 70 + r() * (H - 140) : r() < 0.5 ? 70 + r() * 110 : H - 70 - r() * 110;
      const s = 4 + r() * 8;
      g.fillStyle = "rgba(90,70,60,0.2)";
      g.beginPath();
      g.ellipse(x + 1.5, y + 2, s, s * 0.7, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ddd3bb";
      g.beginPath();
      g.ellipse(x, y, s, s * 0.7, 0, 0, Math.PI * 2);
      g.fill();
    }
    noise(g, W, H, r, 0.06);
    lampPool(g, W, H, "rgba(220,190,255,0.5)", 0.4);
    carve(g, W, H, "rgba(190,160,255,0.3)", "#8f7bd8", "#4e3470", "rgba(225,208,255,0.55)");
  },
  // ivory marble, grey and gold veins, gold seams between the slabs
  vault: (g, W, H, r) => {
    g.fillStyle = "#d2c6aa";
    g.fillRect(0, 0, W, H);
    const T = 512;
    for (let y = 0; y < H; y += T)
      for (let x = 0; x < W; x += T) {
        g.fillStyle = mixc("#d8ccb0", "#c8bb9c", r());
        g.fillRect(x, y, T, T);
      }
    // veins: soft grey drifts, then thin gold threads
    const vein = (col: string, wmax: number, n: number, a: number) => {
      for (let i = 0; i < n; i++) {
        let x = r() * W,
          y = r() * H;
        const dir = r() * Math.PI * 2;
        g.strokeStyle = col;
        g.globalAlpha = a * (0.5 + r() * 0.5);
        g.lineWidth = 1 + r() * wmax;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 14; k++) {
          const d = dir + (r() - 0.5) * 1.4;
          const nx = x + Math.cos(d) * 60,
            ny = y + Math.sin(d) * 60;
          g.quadraticCurveTo(x + (r() - 0.5) * 50, y + (r() - 0.5) * 50, nx, ny);
          x = nx;
          y = ny;
        }
        g.stroke();
      }
      g.globalAlpha = 1;
    };
    vein("#8a8270", 7, 26, 0.36);
    vein("#b0a68e", 12, 18, 0.3);
    vein("#c99a2a", 2.5, 16, 0.85);
    vein("#ffe08a", 1, 16, 0.7);
    // gold seams
    for (let y = T; y < H; y += T) metalFill(g, (() => { const p = new Path2D(); p.rect(0, y - 3, W, 6); return p; })(), GOLD, 0, y - 3, W, y + 3, 1);
    for (let x = T; x < W; x += T) metalFill(g, (() => { const p = new Path2D(); p.rect(x - 3, 0, 6, H); return p; })(), GOLD, x - 3, 0, x + 3, H, 1);
    noise(g, W, H, r, 0.025);
    lampPool(g, W, H, "rgba(255,230,170,0.45)", 0.3);
    carve(g, W, H, "rgba(255,220,140,0.35)", "#f4b728", "#2f6a48", "rgba(244,206,110,0.6)");
  },
};

/** How each arena dresses its table: frame, corners, cloth, rug. */
interface Dress {
  /** frame body (wood/stone/iron/lacquer), its lighter step, the trim metal, how metallic the trim is */
  body: string;
  body2: string;
  trim: string;
  trimMetal: number;
  bodyRough: number;
  bodyMetal: number;
  orn: "rivet" | "leaf" | "rune" | "gold";
  /** the cloth hung round the table and the rug under it */
  cloth: string;
  clothHem: string;
  rug: [string, string, string];
  /** the lamp's strength over this top */
  lamp: number;
}
const DRESS: Record<MapKind, Dress> = {
  rigs: { body: "#3e342e", body2: "#54463c", trim: "#d0a24a", trimMetal: 0.85, bodyRough: 0.55, bodyMetal: 0.45, orn: "rivet", cloth: "#9a2c16", clothHem: "#e6b04a", rug: ["#7a2a14", "#b24c1c", "#d8a446"], lamp: 440 },
  orchard: { body: "#7a4e2c", body2: "#94603a", trim: "#d8b452", trimMetal: 0.7, bodyRough: 0.7, bodyMetal: 0.05, orn: "leaf", cloth: "#2f6a2e", clothHem: "#e6c45a", rug: ["#24502a", "#4a8034", "#d8b850"], lamp: 215 },
  crypt: { body: "#5e586a", body2: "#78728a", trim: "#c4b8dc", trimMetal: 0.6, bodyRough: 0.8, bodyMetal: 0.05, orn: "rune", cloth: "#3e2266", clothHem: "#cdbbf0", rug: ["#2a1846", "#4e3478", "#bfaee0"], lamp: 250 },
  vault: { body: "#1c1714", body2: "#2c241e", trim: "#e0a92e", trimMetal: 1, bodyRough: 0.28, bodyMetal: 0.3, orn: "gold", cloth: "#6a1424", clothHem: "#f0c24a", rug: ["#420a16", "#781828", "#dcae44"], lamp: 135 },
};

const THEMES: Record<MapKind, Omit<Theme, "top">> = {
  rigs: { floor: "#3a2a1e", wood: "#3a2a1c", rim: "#4a4038", rimMetal: 0.7, accent: "#ff6b35", fog: "#24160c", sky: "#ffd9b0", ground: "#3a2416", key: "#ffe2c0", keyI: 2.6, fill: [["#ff6b35", 40, new THREE.Vector3(-9, 4, -8)], ["#ffb347", 30, new THREE.Vector3(10, 5, -6)]] },
  orchard: { floor: "#34462a", wood: "#5a3a22", rim: "#6a4a2a", rimMetal: 0.1, accent: "#7ee08a", fog: "#1c2c1a", sky: "#e6f7ff", ground: "#3a4a28", key: "#fff4dc", keyI: 2.8, fill: [["#ffd27a", 34, new THREE.Vector3(-10, 3, -7)], ["#9be3ff", 22, new THREE.Vector3(10, 6, -9)]] },
  crypt: { floor: "#2a2434", wood: "#2a2430", rim: "#3a3444", rimMetal: 0.2, accent: "#b48ad8", fog: "#1a1424", sky: "#d8ccff", ground: "#221a30", key: "#ece4ff", keyI: 2.2, fill: [["#7ee08a", 26, new THREE.Vector3(-10, 3, -7)], ["#b48ad8", 30, new THREE.Vector3(10, 4, -8)]] },
  vault: { floor: "#24201a", wood: "#1a1610", rim: "#c89a2a", rimMetal: 0.95, accent: "#f4b728", fog: "#1a140c", sky: "#fff4d8", ground: "#2a2010", key: "#fff4e0", keyI: 2.6, fill: [["#f4b728", 36, new THREE.Vector3(-9, 4, -9)], ["#ff6b35", 22, new THREE.Vector3(10, 5, -7)]] },
};

// ---- the toys' little effects: soft puffs that rise and fade, bits that fly and fall ----------------------

interface Fx {
  puff(p: THREE.Vector3, color: string, n: number, size: number, rise?: number): void;
  bits(p: THREE.Vector3, color: string, n: number, speed: number, size?: number): void;
}
function makeFx(group: THREE.Group, ticks: ((dt: number, t: number) => void)[]): Fx {
  const puffs: { s: THREE.Sprite; m: THREE.SpriteMaterial; v: THREE.Vector3; t: number; life: number; s0: number; s1: number }[] = [];
  const N = 220;
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.4 }), N);
  im.count = 0;
  im.frustumCulled = false;
  im.setColorAt(0, new THREE.Color());
  group.add(im);
  const bits: { p: THREE.Vector3; v: THREE.Vector3; t: number; life: number; s: number; c: THREE.Color; a: number }[] = [];
  const mtx = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    sc = new THREE.Vector3(),
    eu = new THREE.Euler();
  ticks.push((dt) => {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        group.remove(p.s);
        p.m.dispose();
        puffs.splice(i, 1);
        continue;
      }
      p.s.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(Math.pow(0.4, dt));
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * (1 - (1 - k) ** 2));
      p.m.opacity = Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k) * 0.8;
    }
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.t += dt;
      if (b.t >= b.life) {
        bits.splice(i, 1);
        continue;
      }
      b.v.y -= 9 * dt;
      b.p.addScaledVector(b.v, dt);
      b.a += dt * 8;
    }
    im.count = Math.min(N, bits.length);
    for (let i = 0; i < im.count; i++) {
      const b = bits[i];
      const k = 1 - b.t / b.life;
      q.setFromEuler(eu.set(b.a, b.a * 0.7, 0));
      mtx.compose(b.p, q, sc.setScalar(b.s * Math.min(1, k * 3)));
      im.setMatrixAt(i, mtx);
      im.setColorAt(i, b.c);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });
  return {
    puff(p, color, n, size, rise = 0.8) {
      for (let i = 0; i < n; i++) {
        const m = new THREE.SpriteMaterial({ map: puffTex(), color, transparent: true, depthWrite: false, opacity: 0 });
        const s = new THREE.Sprite(m);
        s.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * size * 0.5, Math.random() * size * 0.2, (Math.random() - 0.5) * size * 0.5));
        group.add(s);
        puffs.push({ s, m, v: new THREE.Vector3((Math.random() - 0.5) * 0.8, rise * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * 0.8), t: 0, life: 1.1 + Math.random() * 0.8, s0: size * 0.35, s1: size * (1 + Math.random() * 0.6) });
      }
    },
    bits(p, color, n, speed, size = 0.07) {
      const c = new THREE.Color(color);
      for (let i = 0; i < n && bits.length < N; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = new THREE.Vector3(Math.cos(a) * speed * (0.3 + Math.random() * 0.5), speed * (0.6 + Math.random() * 0.7), Math.sin(a) * speed * (0.3 + Math.random() * 0.5));
        bits.push({ p: p.clone(), v, t: 0, life: 0.7 + Math.random() * 0.6, s: size * (0.6 + Math.random() * 0.8), c: c.clone().multiplyScalar(0.8 + Math.random() * 0.4), a: Math.random() * 6 });
      }
    },
  };
}

// ---- the corner set pieces: four per arena, big and readable, each a toy ----------------------------------

interface Piece {
  obj: THREE.Group;
  poke: () => string;
  tick?: (dt: number, t: number) => void;
}
type Maker = (r: () => number, fx: Fx) => Piece;
const V = (x: number, y: number, z: number, w: number, h: number, d: number, c: string): Vox => ({ x, y, z, w, h, d, c });
const metalV = (rough = 0.32, metal = 0.9) => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: metal, roughness: rough });
const goldM = () => new THREE.MeshStandardMaterial({ color: "#e6ad34", metalness: 1, roughness: 0.24 });
const worldOf = (o: THREE.Object3D, x: number, y: number, z: number) => o.localToWorld(new THREE.Vector3(x, y, z));

// RIGS (Transparent): a mining rig tower, steam pipes with a valve, a pile of Z coins, a crate of picks
const rigTower: Maker = (_r, fx) => {
  const g = new THREE.Group();
  g.add(
    voxMesh(
      [
        V(0, 0.95, 0, 1.3, 1.9, 1.15, "#2e2824"),
        V(0, 1.99, 0, 1.2, 0.1, 1.05, "#1e1a18"),
        ...[-0.4, -0.2, 0, 0.2, 0.4].map((x) => V(x, 2.07, 0, 0.08, 0.06, 0.95, "#5a4e46")),
        V(0.72, 0.55, 0.25, 0.09, 1.1, 0.09, "#161414"),
        V(0.78, 0.05, 0.55, 0.12, 0.1, 0.7, "#161414"),
        V(0.5, 1.0, 0.585, 0.16, 1.5, 0.02, "#141210"),
      ],
      voxMat(0.6, 0.3),
    ),
  );
  g.add(
    voxMesh(
      [
        ...[
          [-0.66, -0.58],
          [0.66, -0.58],
          [-0.66, 0.58],
          [0.66, 0.58],
        ].map(([x, z]) => V(x, 0.95, z, 0.1, 1.95, 0.1, "#d6a64c")),
        V(0, 1.93, 0, 1.42, 0.06, 1.27, "#d6a64c"),
        V(0, 0.03, 0, 1.42, 0.06, 1.27, "#d6a64c"),
      ],
      metalV(),
    ),
  );
  const fans: THREE.Group[] = [];
  const bladeM = new THREE.MeshStandardMaterial({ color: "#b8b0a8", metalness: 0.6, roughness: 0.35 });
  for (const y of [0.55, 1.36]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 6, 8), new THREE.MeshStandardMaterial({ color: "#6a5a4e", metalness: 0.7, roughness: 0.35 }));
    ring.position.set(-0.1, y, 0.6);
    g.add(ring);
    const fan = new THREE.Group();
    fan.position.set(-0.1, y, 0.61);
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.11, 0.03), bladeM);
      b.rotation.z = (k * Math.PI) / 4;
      fan.add(b);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 8).rotateX(Math.PI / 2), glow("#ff8a3a", 0.9));
    hub.position.z = 0.03;
    fan.add(hub);
    g.add(fan);
    fans.push(fan);
  }
  const leds: THREE.Mesh[] = [];
  const ledM = [glow("#ff8a3a", 1.1), glow("#7ee08a", 1.0)];
  for (let k = 0; k < 6; k++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.03), ledM[k % 2]);
    l.position.set(0.5, 0.35 + k * 0.25, 0.6);
    g.add(l);
    leds.push(l);
  }
  g.rotation.y = 0.35;
  let boost = 0;
  return {
    obj: g,
    poke: () => {
      boost = 2.6;
      fx.bits(worldOf(g, -0.1, 1.36, 0.7), "#ffb347", 22, 3.2, 0.06);
      fx.puff(worldOf(g, 0, 2.1, 0), "#a89c90", 4, 0.9, 1.2);
      return "hum";
    },
    tick: (dt, t) => {
      boost = Math.max(0, boost - dt);
      for (const f of fans) f.rotation.z += dt * (8 + boost * 26);
      leds.forEach((l, i) => (l.visible = Math.sin(t * (2.6 + i * 0.7 + boost * 6) + i * 1.9) > -0.35));
    },
  };
};
const steamPipes: Maker = (_r, fx) => {
  const g = new THREE.Group();
  const copper = new THREE.MeshStandardMaterial({ color: "#c47a45", metalness: 0.9, roughness: 0.34 });
  const brass = new THREE.MeshStandardMaterial({ color: "#d6a64c", metalness: 0.95, roughness: 0.3 });
  const tops: THREE.Vector3[] = [];
  for (const [x, z, h] of [
    [-0.45, 0.05, 2.4],
    [0.1, -0.3, 3.0],
    [0.55, 0.25, 1.9],
  ]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, h, 10), copper);
    p.position.set(x, h / 2, z);
    p.castShadow = true;
    g.add(p);
    for (const y of [0.12, h * 0.55, h - 0.06]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.08, 10), brass);
      f.position.set(x, y, z);
      g.add(f);
    }
    tops.push(new THREE.Vector3(x, h + 0.1, z));
  }
  const man = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.1, 8).rotateZ(Math.PI / 2), copper);
  man.position.set(0.05, 0.75, 0.15);
  g.add(man);
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 16), new THREE.MeshStandardMaterial({ color: "#c8322a", metalness: 0.4, roughness: 0.4 })));
  for (let k = 0; k < 2; k++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: "#c8322a", roughness: 0.4 }));
    s.rotation.z = (k * Math.PI) / 2;
    wheel.add(s);
  }
  wheel.position.set(0.1, 0.75, 0.42);
  g.add(wheel);
  const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#f2ecd8", roughness: 0.5 }));
  gauge.position.set(-0.45, 1.05, 0.24);
  g.add(gauge);
  const gr = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 6, 16), brass);
  gr.position.copy(gauge.position);
  g.add(gr);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.01), new THREE.MeshStandardMaterial({ color: "#c8322a" }));
  needle.geometry.translate(0, 0.07, 0);
  needle.position.set(-0.45, 1.05, 0.28);
  g.add(needle);
  let spin = 0,
    next = 2;
  return {
    obj: g,
    poke: () => {
      spin = 1.6;
      for (const p of tops) fx.puff(worldOf(g, p.x, p.y, p.z), "#f4f0ea", 5, 1.2, 1.6);
      return "clank";
    },
    tick: (dt, t) => {
      spin = Math.max(0, spin - dt);
      wheel.rotation.z -= dt * (0.2 + spin * 6);
      needle.rotation.z = -0.6 + Math.sin(t * 1.3) * 0.15 + spin * 0.8;
      next -= dt;
      if (next < 0) {
        next = 2.5 + Math.random() * 3;
        const p = tops[Math.floor(Math.random() * tops.length)];
        fx.puff(worldOf(g, p.x, p.y, p.z), "#f4f0ea", 2, 0.8, 1.2);
      }
    },
  };
};
const coinPile: Maker = (r, fx) => {
  const g = new THREE.Group();
  g.add(voxMesh([V(0, 0.08, 0, 1.25, 0.16, 0.95, "#5a3a22"), V(0, 0.17, 0, 1.33, 0.04, 1.03, "#7a5232")], voxMat(0.7, 0.05)));
  const coinG = new THREE.CylinderGeometry(0.14, 0.14, 0.035, 12);
  const coins = new THREE.InstancedMesh(coinG, goldM(), 52);
  const home: THREE.Vector3[] = [];
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 52; i++) {
    const layer = Math.floor(i / 13);
    const a = r() * Math.PI * 2,
      d = r() * (0.5 - layer * 0.1);
    const p = new THREE.Vector3(Math.cos(a) * d, 0.21 + layer * 0.06 + r() * 0.03, Math.sin(a) * d * 0.75);
    home.push(p);
    m4.makeRotationFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * 3, (r() - 0.5) * 0.4)).setPosition(p);
    coins.setMatrixAt(i, m4);
  }
  coins.castShadow = true;
  g.add(coins);
  // three standing up, their Z to the room
  const faceM = new THREE.MeshStandardMaterial({ map: zCoinTex(), metalness: 0.7, roughness: 0.3 });
  const stand: THREE.Mesh[] = [];
  for (const [x, z, ry] of [
    [-0.3, 0.25, 0.2],
    [0.18, 0.3, -0.25],
    [0.42, 0.05, -0.5],
  ]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16).rotateX(Math.PI / 2), [goldM(), faceM, faceM]);
    c.position.set(x, 0.42, z);
    c.rotation.y = ry;
    c.castShadow = true;
    g.add(c);
    stand.push(c);
  }
  let hop = 0;
  return {
    obj: g,
    poke: () => {
      hop = 1;
      fx.bits(worldOf(g, 0, 0.5, 0), "#f4c24a", 20, 2.8, 0.07);
      return "chime";
    },
    tick: (dt, t) => {
      if (hop <= 0) return;
      hop = Math.max(0, hop - dt * 1.3);
      for (let i = 0; i < home.length; i++) {
        const p = home[i];
        m4.makeRotationFromEuler(new THREE.Euler(Math.sin(t * 20 + i) * 0.3 * hop, i, 0)).setPosition(p.x, p.y + Math.abs(Math.sin(t * 18 + i * 1.7)) * 0.18 * hop, p.z);
        coins.setMatrixAt(i, m4);
      }
      coins.instanceMatrix.needsUpdate = true;
      stand.forEach((c, i) => (c.position.y = 0.42 + Math.abs(Math.sin(t * 14 + i)) * 0.2 * hop));
    },
  };
};
const pickCrate: Maker = (_r, fx) => {
  const g = new THREE.Group();
  const crate = new THREE.Group();
  const planks: Vox[] = [V(0, 0.38, 0, 1.05, 0.75, 0.85, "#a8763e")];
  for (const y of [0.14, 0.38, 0.62]) planks.push(V(0, y, 0.43, 1.07, 0.04, 0.02, "#6e4a24"), V(0.53, y, 0, 0.02, 0.04, 0.87, "#6e4a24"));
  for (const [x, z] of [
    [-0.5, 0.4],
    [0.5, 0.4],
    [-0.5, -0.4],
    [0.5, -0.4],
  ])
    planks.push(V(x, 0.38, z, 0.1, 0.77, 0.1, "#7e5228"));
  crate.add(voxMesh(planks, voxMat(0.8, 0.02)));
  crate.add(voxMesh([V(0, 0.7, 0.44, 1.08, 0.06, 0.02, "#6a6670"), V(0, 0.08, 0.44, 1.08, 0.06, 0.02, "#6a6670")], metalV(0.4, 0.8)));
  // the lantern on top
  crate.add(voxMesh([V(0.25, 0.79, 0, 0.3, 0.04, 0.3, "#3a3632"), V(0.25, 1.11, 0, 0.32, 0.04, 0.32, "#3a3632"), V(0.25, 1.17, 0, 0.08, 0.08, 0.08, "#3a3632")], metalV(0.5, 0.7)));
  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), glow("#ffcf6a", 1.3));
  flame.position.set(0.25, 0.95, 0);
  crate.add(flame);
  g.add(crate);
  const picks: THREE.Group[] = [];
  for (const [x, z, rz, ry] of [
    [-0.62, 0.2, 0.32, 0.2],
    [-0.62, -0.2, 0.42, -0.3],
  ]) {
    const p = new THREE.Group();
    p.add(voxMesh([V(0, 0.55, 0, 0.07, 1.1, 0.07, "#a87442")], voxMat(0.8, 0.02)));
    p.add(voxMesh([V(0, 1.08, 0, 0.6, 0.09, 0.09, "#8a8a92"), V(-0.3, 1.04, 0, 0.1, 0.07, 0.07, "#8a8a92"), V(0.3, 1.04, 0, 0.1, 0.07, 0.07, "#8a8a92")], metalV(0.35, 0.9)));
    p.position.set(x, 0, z);
    p.rotation.set(0, ry, -rz);
    g.add(p);
    picks.push(p);
  }
  g.rotation.y = -0.45;
  let hop = 0;
  return {
    obj: g,
    poke: () => {
      hop = 1;
      fx.puff(worldOf(g, 0, 0.1, 0.4), "#c8a878", 5, 0.9, 0.5);
      return "clank";
    },
    tick: (dt, t) => {
      flame.scale.y = 0.9 + Math.sin(t * 9) * 0.1;
      if (hop <= 0) return;
      hop = Math.max(0, hop - dt * 1.6);
      crate.position.y = Math.abs(Math.sin(t * 16)) * 0.16 * hop;
      picks.forEach((p, i) => (p.rotation.x = Math.sin(t * 22 + i * 2) * 0.12 * hop));
    },
  };
};

// ORCHARD (Sapling): a fountain, a Z-fruit tree with its fronds over the frame, a beehive, a wheelbarrow
const fountain: Maker = (_r, fx) => {
  const g = new THREE.Group();
  const stone = "#dcc8a0",
    stone2 = "#c8b28a";
  g.add(
    voxMesh(
      [
        V(0, 0.1, 0, 1.9, 0.2, 1.9, stone2),
        V(0, 0.32, 0.86, 1.8, 0.28, 0.18, stone),
        V(0, 0.32, -0.86, 1.8, 0.28, 0.18, stone),
        V(0.86, 0.32, 0, 0.18, 0.28, 1.5, stone),
        V(-0.86, 0.32, 0, 0.18, 0.28, 1.5, stone),
        V(0, 0.48, 0.86, 1.86, 0.05, 0.22, "#ece0c0"),
        V(0, 0.48, -0.86, 1.86, 0.05, 0.22, "#ece0c0"),
        V(0.86, 0.48, 0, 0.22, 0.05, 1.5, "#ece0c0"),
        V(-0.86, 0.48, 0, 0.22, 0.05, 1.5, "#ece0c0"),
        V(0, 0.7, 0, 0.3, 0.8, 0.3, stone),
        V(0, 0.45, 0, 0.42, 0.12, 0.42, stone2),
        V(0, 1.12, 0, 0.72, 0.1, 0.72, stone),
        V(0, 1.2, 0.33, 0.74, 0.08, 0.06, "#ece0c0"),
        V(0, 1.2, -0.33, 0.74, 0.08, 0.06, "#ece0c0"),
        V(0.33, 1.2, 0, 0.06, 0.08, 0.66, "#ece0c0"),
        V(-0.33, 1.2, 0, 0.06, 0.08, 0.66, "#ece0c0"),
        // moss
        V(0.6, 0.47, 0.88, 0.3, 0.04, 0.2, "#7a9a3e"),
        V(-0.86, 0.47, -0.4, 0.2, 0.04, 0.3, "#6a8a34"),
      ],
      voxMat(0.85, 0.02),
    ),
  );
  const waterM = new THREE.MeshStandardMaterial({ color: "#2f86b8", roughness: 0.22, metalness: 0.05, emissive: "#062438", emissiveIntensity: 0.3, transparent: true, opacity: 0.92 });
  const w1 = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.02, 1.54), waterM);
  w1.position.y = 0.4;
  g.add(w1);
  const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.6), waterM);
  w2.position.y = 1.2;
  g.add(w2);
  const fruit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: "#f4b728", metalness: 0.6, roughness: 0.3 }));
  fruit.position.y = 1.4;
  g.add(fruit);
  const N = 40;
  const drops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: "#bfe8ff", emissive: "#3a8ac0", emissiveIntensity: 0.4 }), N);
  drops.frustumCulled = false;
  g.add(drops);
  const m4 = new THREE.Matrix4();
  let splash = 0;
  return {
    obj: g,
    poke: () => {
      splash = 1.4;
      fx.bits(worldOf(g, 0, 1.3, 0), "#bfe8ff", 24, 2.6, 0.06);
      return "chime";
    },
    tick: (dt, t) => {
      splash = Math.max(0, splash - dt * 0.8);
      fruit.rotation.y = t * 0.8;
      const v = 0.6 + splash * 0.9,
        gg = 2 * (v + 0.8);
      for (let i = 0; i < N; i++) {
        const k = (t * 0.9 + i / N) % 1;
        const a = (i / N) * Math.PI * 2 * 3.1;
        const rad = 0.28 + 0.36 * k;
        m4.makeTranslation(Math.cos(a) * rad, 1.22 + v * k - 0.5 * gg * k * k, Math.sin(a) * rad);
        drops.setMatrixAt(i, m4);
      }
      drops.instanceMatrix.needsUpdate = true;
    },
  };
};
const frondTree: Maker = (r, fx) => {
  const g = new THREE.Group();
  const sway = new THREE.Group();
  g.add(sway);
  sway.add(voxMesh([V(0, 0.5, 0, 0.36, 1.0, 0.36, "#6a4428"), V(0.06, 1.1, 0.04, 0.3, 0.4, 0.3, "#7a5030"), V(0.1, 1.4, 0.08, 0.26, 0.3, 0.26, "#6a4428"), V(-0.25, 0.06, 0.2, 0.5, 0.12, 0.2, "#5a3820")], voxMat(0.85, 0.02)));
  // fronds: drooping arcs of leaf blocks, the long ones reaching in over the frame
  const leaves: Vox[] = [];
  const greens = ["#4f9a3e", "#5cae48", "#3f8a34", "#6cc04a"];
  const crown = new THREE.Vector3(0.1, 1.6, 0.08);
  for (let f = 0; f < 9; f++) {
    const a = (f / 9) * Math.PI * 2 + 0.3;
    const inward = Math.cos(a - Math.PI * 0.25) > 0.2;
    const len = inward ? 7 : 5;
    for (let k = 0; k < len; k++) {
      const d = 0.22 + k * 0.27;
      const y = crown.y + 0.12 - (k * k) * 0.035;
      const w = 0.34 - k * 0.03;
      leaves.push(V(crown.x + Math.cos(a) * d, y, crown.z + Math.sin(a) * d, w, 0.06, w, greens[(f + k) % 4]));
      if (k > 1) leaves.push(V(crown.x + Math.cos(a) * d - Math.sin(a) * w * 0.6, y - 0.03, crown.z + Math.sin(a) * d + Math.cos(a) * w * 0.6, w * 0.5, 0.05, w * 0.5, greens[(f + k + 1) % 4]));
    }
  }
  sway.add(voxMesh(leaves, voxMat(0.8, 0.02)));
  const fruitM = new THREE.MeshStandardMaterial({ color: "#f4a628", metalness: 0.3, roughness: 0.4, emissive: "#7a4008", emissiveIntensity: 0.15 });
  const fruits: { m: THREE.Mesh; home: THREE.Vector3; v: number; t: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.17), fruitM);
    const a = (k / 6) * Math.PI * 2;
    const home = new THREE.Vector3(crown.x + Math.cos(a) * 0.32, 1.45 + r() * 0.08, crown.z + Math.sin(a) * 0.32);
    m.position.copy(home);
    m.castShadow = true;
    sway.add(m);
    fruits.push({ m, home, v: 0, t: -1 });
  }
  let shake = 0;
  return {
    obj: g,
    poke: () => {
      shake = 1;
      for (const f of fruits) if (f.t < 0 && Math.random() < 0.7) f.t = 0;
      fx.bits(worldOf(g, 0.6, 1.6, 0.6), "#6cc04a", 14, 2, 0.06);
      return "chime";
    },
    tick: (dt, t) => {
      shake = Math.max(0, shake - dt * 1.2);
      sway.rotation.z = Math.sin(t * 0.9) * 0.02 + Math.sin(t * 24) * 0.05 * shake;
      sway.rotation.x = Math.sin(t * 0.7 + 1) * 0.015;
      for (const f of fruits) {
        if (f.t < 0) continue;
        f.t += dt;
        if (f.t < 1.6) {
          f.v -= 9 * dt;
          f.m.position.y += f.v * dt;
          if (f.m.position.y < 0.09) {
            f.m.position.y = 0.09;
            f.v = Math.abs(f.v) * 0.35;
          }
        } else if (f.t > 3.6) {
          f.m.position.copy(f.home);
          f.v = 0;
          f.t = -1;
        }
      }
    },
  };
};
const beehive: Maker = () => {
  const g = new THREE.Group();
  const parts: Vox[] = [V(0, 0.3, 0, 0.16, 0.6, 0.16, "#6a4428"), V(0, 0.62, 0, 0.9, 0.06, 0.8, "#7a5030")];
  const rings = [0.86, 0.82, 0.74, 0.62, 0.46, 0.3];
  rings.forEach((w, i) => parts.push(V(0, 0.73 + i * 0.15, 0, w, 0.15, w * 0.92, i % 2 ? "#c08a34" : "#e0b050")));
  parts.push(V(0, 0.76, 0.42, 0.18, 0.12, 0.04, "#2a1a0a"));
  g.add(voxMesh(parts, voxMat(0.9, 0.02)));
  const beeM = new THREE.MeshStandardMaterial({ color: "#ffd23a", roughness: 0.5 });
  const stripeM = new THREE.MeshStandardMaterial({ color: "#1a1408" });
  const bees: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.06), beeM));
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.065, 0.065), stripeM);
    b.add(s);
    g.add(b);
    bees.push(b);
  }
  let swarm = 0;
  return {
    obj: g,
    poke: () => ((swarm = 3), "hum"),
    tick: (dt, t) => {
      swarm = Math.max(0, swarm - dt);
      const R = 0.5 + swarm * 0.18,
        w = 1.6 + swarm * 2.5;
      bees.forEach((b, i) => {
        const a = t * w * (i % 2 ? 1 : -1.2) + i * 1.9;
        b.position.set(Math.cos(a) * R * (0.8 + (i % 3) * 0.15), 1.0 + Math.sin(t * 3 + i) * 0.25 + (i % 3) * 0.12, Math.sin(a) * R * 0.7);
        b.rotation.y = -a;
      });
    },
  };
};
const wheelbarrow: Maker = () => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const v: Vox[] = [
    V(0, 0.42, 0, 1.0, 0.08, 0.7, "#8a5a30"),
    V(0, 0.55, 0.35, 1.0, 0.24, 0.06, "#9a6a3a"),
    V(0, 0.55, -0.35, 1.0, 0.24, 0.06, "#9a6a3a"),
    V(0.5, 0.55, 0, 0.06, 0.24, 0.7, "#9a6a3a"),
    V(-0.5, 0.55, 0, 0.06, 0.24, 0.7, "#9a6a3a"),
    V(-0.85, 0.42, 0.26, 0.8, 0.06, 0.06, "#7a4e2a"),
    V(-0.85, 0.42, -0.26, 0.8, 0.06, 0.06, "#7a4e2a"),
    V(-0.35, 0.2, 0.26, 0.06, 0.4, 0.06, "#7a4e2a"),
    V(-0.35, 0.2, -0.26, 0.06, 0.4, 0.06, "#7a4e2a"),
  ];
  const fruit = ["#ff9a3a", "#f4b728", "#8ac04a", "#e05a3a"];
  for (let i = 0; i < 16; i++) v.push(V(-0.35 + (i % 5) * 0.17, 0.62 + Math.floor(i / 5) * 0.1, -0.2 + ((i * 7) % 4) * 0.13, 0.16, 0.16, 0.16, fruit[i % 4]));
  body.add(voxMesh(v, voxMat(0.75, 0.02)));
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#5a3820", roughness: 0.8 }));
  wheel.position.set(0.62, 0.22, 0);
  body.add(wheel);
  g.add(body);
  g.rotation.y = 0.55;
  let roll = 0;
  return {
    obj: g,
    poke: () => ((roll = 1), "creak"),
    tick: (dt, t) => {
      if (roll <= 0) return;
      roll = Math.max(0, roll - dt * 0.9);
      const x = Math.sin(t * 7) * 0.18 * roll;
      body.position.x = x;
      wheel.rotation.z = -x / 0.22;
      body.rotation.z = Math.sin(t * 7 + 1) * 0.05 * roll;
    },
  };
};

// CRYPT (Sprout): a candle cluster with a skull, a hooded statue with its orb, a raven on its perch, a sarcophagus
const candles: Maker = (r, fx) => {
  const g = new THREE.Group();
  const v: Vox[] = [V(0, 0.12, 0, 1.5, 0.24, 1.2, "#5a5464"), V(0, 0.26, 0, 1.3, 0.04, 1.0, "#cfc4a6")];
  const flames: THREE.Mesh[] = [];
  const fm = glow("#d8ffc0", 1.3);
  const spots: [number, number, number][] = [
    [-0.45, -0.3, 0.9],
    [-0.1, -0.35, 0.65],
    [0.3, -0.25, 0.8],
    [0.5, 0.1, 0.45],
    [-0.5, 0.15, 0.5],
    [0.05, 0.05, 0.35],
    [0.3, 0.35, 0.3],
  ];
  for (const [x, z, h] of spots) {
    const w = 0.13 + r() * 0.06;
    v.push(V(x, 0.28 + h / 2, z, w, h, w, "#d2c6a8"), V(x + w * 0.4, 0.28 + h * 0.7, z + w * 0.3, 0.05, h * 0.3, 0.05, "#e0d6bc"), V(x, 0.29 + h, z, 0.02, 0.06, 0.02, "#2a2420"));
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.08), fm);
    f.position.set(x, 0.38 + h, z);
    g.add(f);
    flames.push(f);
  }
  // the skull, and a bone
  v.push(V(-0.25, 0.42, 0.42, 0.3, 0.26, 0.26, "#e8e2d4"), V(-0.25, 0.32, 0.5, 0.2, 0.08, 0.14, "#e8e2d4"), V(-0.31, 0.45, 0.56, 0.07, 0.07, 0.02, "#1a141e"), V(-0.19, 0.45, 0.56, 0.07, 0.07, 0.02, "#1a141e"), V(0.25, 0.31, 0.45, 0.5, 0.06, 0.07, "#ddd6c6"));
  g.add(voxMesh(v, voxMat(0.85, 0.02)));
  let flare = 0;
  return {
    obj: g,
    poke: () => {
      flare = 1.6;
      fx.puff(worldOf(g, 0, 1.1, 0), "#a8ffb0", 5, 0.9, 1);
      return "creak";
    },
    tick: (dt, t) => {
      flare = Math.max(0, flare - dt);
      flames.forEach((f, i) => {
        const k = 1 + flare * 1.2;
        f.scale.set(k, (0.8 + Math.sin(t * 9 + i * 2.1) * 0.2) * k, k);
      });
    },
  };
};
const hoodedStatue: Maker = (_r, fx) => {
  const g = new THREE.Group();
  const st = "#9a94a6",
    st2 = "#8a8496";
  g.add(
    voxMesh(
      [
        V(0, 0.12, 0, 1.3, 0.24, 1.3, "#6a6474"),
        V(0, 0.4, 0, 0.98, 0.32, 0.8, st2),
        V(0, 0.72, 0, 0.88, 0.32, 0.72, st),
        V(0, 1.02, 0, 0.8, 0.3, 0.66, st2),
        V(0, 1.3, 0, 0.62, 0.32, 0.56, st),
        V(0, 1.5, 0.02, 0.5, 0.14, 0.52, st2),
        V(0, 1.32, 0.29, 0.34, 0.28, 0.02, "#1c1624"),
        V(-0.28, 0.98, 0.36, 0.22, 0.14, 0.18, st),
        V(0.28, 0.98, 0.36, 0.22, 0.14, 0.18, st),
        V(0.32, 0.7, 0.42, 0.06, 0.4, 0.02, "#7a6e94"),
        V(-0.3, 0.5, 0.42, 0.05, 0.3, 0.02, "#7a6e94"),
      ],
      voxMat(0.85, 0.02),
    ),
  );
  const eyeM = new THREE.MeshStandardMaterial({ color: "#d8c0ff", emissive: "#b48ad8", emissiveIntensity: 0.8 });
  for (const x of [-0.07, 0.07]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), eyeM);
    e.position.set(x, 1.34, 0.31);
    g.add(e);
  }
  const orbM = new THREE.MeshStandardMaterial({ color: "#c8a8f0", emissive: "#8a5ad8", emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.2, flatShading: true });
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), orbM);
  orb.position.set(0, 1.08, 0.46);
  g.add(orb);
  g.position.z = 0.3;
  let pulse = 0;
  return {
    obj: g,
    poke: () => {
      pulse = 1.5;
      fx.puff(worldOf(g, 0, 1.1, 0.5), "#c8a8f0", 4, 0.8, 0.8);
      fx.bits(worldOf(g, 0, 1.1, 0.5), "#d8c0ff", 12, 2, 0.05);
      return "creak";
    },
    tick: (dt, t) => {
      pulse = Math.max(0, pulse - dt);
      orb.rotation.y = t * 0.6;
      orb.position.y = 1.08 + Math.sin(t * 1.5) * 0.03;
      orbM.emissiveIntensity = 0.6 + Math.sin(t * 2) * 0.15 + pulse * 1.2;
      eyeM.emissiveIntensity = 0.8 + pulse * 1.5;
    },
  };
};
const raven: Maker = () => {
  const g = new THREE.Group();
  g.add(voxMesh([V(0, 0.55, 0, 0.1, 1.1, 0.1, "#2a2630"), V(0, 1.08, 0, 0.7, 0.07, 0.08, "#2a2630"), V(0, 0.04, 0, 0.5, 0.08, 0.5, "#3a3442"), V(-0.33, 1.03, 0, 0.06, 0.14, 0.06, "#2a2630")], metalV(0.5, 0.7)));
  const bird = new THREE.Group();
  bird.add(voxMesh([V(0, 0.14, 0, 0.34, 0.2, 0.18, "#1a1622"), V(0.18, 0.24, 0, 0.16, 0.16, 0.15, "#1e1a28"), V(0.29, 0.22, 0, 0.1, 0.05, 0.05, "#4a4650"), V(-0.22, 0.12, 0, 0.16, 0.05, 0.12, "#14101a"), V(0.02, 0.03, 0.04, 0.03, 0.08, 0.03, "#4a4650"), V(0.06, 0.03, -0.04, 0.03, 0.08, 0.03, "#4a4650")], voxMat(0.35, 0.3)));
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), new THREE.MeshStandardMaterial({ color: "#ffd23a", emissive: "#a07010", emissiveIntensity: 0.5 }));
  eye.position.set(0.21, 0.27, 0);
  bird.add(eye);
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(0, 0.2, s * 0.09);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.16), new THREE.MeshStandardMaterial({ color: "#16121e", roughness: 0.35, metalness: 0.3 }));
    m.position.z = s * 0.08;
    w.add(m);
    bird.add(w);
    wings.push(w);
  }
  bird.position.set(0.12, 1.11, 0);
  bird.rotation.y = 0.5;
  g.add(bird);
  g.position.z = 0.3;
  let flap = 0,
    look = 0;
  return {
    obj: g,
    poke: () => ((flap = 1.2), "creak"),
    tick: (dt, t) => {
      flap = Math.max(0, flap - dt);
      look -= dt;
      if (look < 0) {
        look = 2 + Math.random() * 3;
        bird.userData.yaw = 0.5 + (Math.random() - 0.5) * 1.6;
      }
      bird.rotation.y += ((bird.userData.yaw ?? 0.5) - bird.rotation.y) * Math.min(1, dt * 6);
      const a = flap > 0 ? Math.sin(t * 30) * 0.9 : 0;
      wings[0].rotation.x = -a;
      wings[1].rotation.x = a;
      bird.position.y = 1.11 + (flap > 0 ? Math.abs(Math.sin(t * 8)) * 0.3 * Math.min(1, flap) : 0);
    },
  };
};
const sarcophagus: Maker = (_r, fx) => {
  const g = new THREE.Group();
  g.add(
    voxMesh(
      [
        V(0, 0.3, 0, 1.55, 0.6, 0.9, "#8a8494"),
        V(0, 0.08, 0, 1.65, 0.16, 1.0, "#6a6474"),
        V(0, 0.4, 0.455, 1.4, 0.08, 0.02, "#6a6474"),
        V(0, 0.22, 0.455, 1.4, 0.04, 0.02, "#6a6474"),
        ...[-0.5, 0, 0.5].map((x) => V(x, 0.31, 0.46, 0.12, 0.12, 0.02, "#8f6ac8")),
      ],
      voxMat(0.85, 0.02),
    ),
  );
  const lid = new THREE.Group();
  lid.position.set(0, 0.6, -0.48);
  lid.add(voxMesh([V(0, 0.07, 0.48, 1.7, 0.14, 1.02, "#9a94a6"), V(0.5, 0.2, 0.48, 0.26, 0.14, 0.24, "#b0aabb"), V(-0.05, 0.18, 0.48, 0.8, 0.1, 0.36, "#aaa4b6"), V(0.12, 0.25, 0.48, 0.12, 0.06, 0.34, "#b8b2c4"), V(-0.55, 0.18, 0.48, 0.3, 0.1, 0.26, "#aaa4b6")], voxMat(0.85, 0.02)));
  g.add(lid);
  g.rotation.y = -0.25;
  let open = 0;
  return {
    obj: g,
    poke: () => {
      open = 1;
      fx.puff(worldOf(g, 0, 0.7, 0), "#9bff9e", 6, 1.0, 0.9);
      fx.puff(worldOf(g, 0, 0.7, 0), "#c8a8f0", 4, 0.9, 0.7);
      return "clank";
    },
    tick: (dt) => {
      open = Math.max(0, open - dt * 0.6);
      const k = Math.sin(Math.min(1, open) * Math.PI);
      lid.rotation.x = -0.5 * k;
      lid.position.y = 0.6 + 0.08 * k;
    },
  };
};

// VAULT (Orchard): the golden bull with a Z on its flank, a stack of gold bars, the candlestick chart, an open safe
const goldenBull: Maker = (_r, fx) => {
  const g = new THREE.Group();
  g.add(voxMesh([V(0, 0.16, 0, 1.95, 0.32, 1.35, "#141210"), V(0, 0.33, 0, 1.99, 0.04, 1.39, "#e0a92e"), V(0.2, 0.18, 0.68, 0.7, 0.16, 0.02, "#e0a92e")], voxMat(0.25, 0.3)));
  const bull = new THREE.Group();
  const G1 = "#e6ad34",
    G2 = "#c88e1e",
    G3 = "#f6cc55";
  const b: Vox[] = [
    V(0, 0.75, 0, 1.25, 0.55, 0.56, G1),
    V(0.45, 0.83, 0, 0.5, 0.68, 0.64, G3),
    V(-0.5, 0.79, 0, 0.36, 0.58, 0.56, G2),
    V(0.88, 0.86, 0, 0.34, 0.36, 0.34, G1),
    V(1.08, 0.78, 0, 0.16, 0.22, 0.28, G2),
    V(0.9, 1.08, 0.2, 0.08, 0.08, 0.22, "#fff0b0"),
    V(0.9, 1.16, 0.3, 0.08, 0.16, 0.08, "#fff0b0"),
    V(0.9, 1.08, -0.2, 0.08, 0.08, 0.22, "#fff0b0"),
    V(0.9, 1.16, -0.3, 0.08, 0.16, 0.08, "#fff0b0"),
    V(-0.72, 0.86, 0, 0.06, 0.32, 0.06, G2),
    V(-0.75, 0.68, 0, 0.1, 0.1, 0.1, G2),
  ];
  for (const [x, z] of [
    [0.45, 0.17],
    [0.45, -0.17],
    [-0.45, 0.17],
    [-0.45, -0.17],
  ])
    b.push(V(x, 0.27, z, 0.16, 0.46, 0.16, G2), V(x, 0.05, z, 0.18, 0.1, 0.18, "#7a5206"));
  // the Z on its flank, dark-struck
  const Z = ["#######", "#######", "....###", "...###.", "..###..", ".###...", "#######", "#######"];
  const px = 0.055;
  Z.forEach((row, yy) => [...row].forEach((ch, xx) => ch === "#" && b.push(V(-0.08 + (xx - 3) * px, 0.82 - (yy - 3.5) * px, 0.285, px, px, 0.02, "#4a2e04"))));
  bull.add(voxMesh(b, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.24 })));
  const eyeM = new THREE.MeshStandardMaterial({ color: "#1a0c02" });
  for (const z of [0.175, -0.175]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), eyeM);
    e.position.set(0.98, 0.92, z);
    bull.add(e);
  }
  bull.position.set(-0.12, 0.35, 0);
  g.add(bull);
  g.rotation.y = -0.28;
  let rear = 0;
  return {
    obj: g,
    poke: () => {
      rear = 1;
      fx.puff(worldOf(bull, 1.2, 0.78, 0.1), "#f4f0ea", 3, 0.6, 0.4);
      fx.puff(worldOf(bull, 1.2, 0.78, -0.1), "#f4f0ea", 3, 0.6, 0.4);
      fx.bits(worldOf(g, 0, 0.5, 0.6), "#f4c24a", 16, 2.4, 0.07);
      return "clank";
    },
    tick: (dt, t) => {
      rear = Math.max(0, rear - dt * 0.9);
      const k = Math.sin(Math.min(1, rear) * Math.PI);
      bull.rotation.z = 0.32 * k;
      bull.position.y = 0.35 + 0.12 * k;
      bull.scale.y = 1 + Math.sin(t * 1.6) * 0.008;
    },
  };
};
const goldBars: Maker = (_r, fx) => {
  const g = new THREE.Group();
  const bars: THREE.Mesh[] = [];
  const bm = goldM();
  const geoB = new THREE.BoxGeometry(0.46, 0.17, 0.25);
  const geoT = new THREE.BoxGeometry(0.38, 0.04, 0.18);
  const layers = [4, 3, 2, 1];
  layers.forEach((n, L) => {
    for (let i = 0; i < n; i++)
      for (const z of [-0.15, 0.15]) {
        const m = new THREE.Mesh(geoB, bm);
        m.position.set((i - (n - 1) / 2) * 0.48, 0.085 + L * 0.19, z);
        m.userData.y = m.position.y;
        const top = new THREE.Mesh(geoT, bm);
        top.position.y = 0.1;
        m.add(top);
        m.castShadow = true;
        g.add(m);
        bars.push(m);
      }
  });
  const coinG = new THREE.CylinderGeometry(0.13, 0.13, 0.04, 12);
  for (const [x, z, n] of [
    [0.85, 0.35, 6],
    [-0.9, 0.3, 4],
  ])
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(coinG, bm);
      c.position.set(x + (Math.random() - 0.5) * 0.02, 0.02 + k * 0.042, z);
      g.add(c);
    }
  g.position.z = 0.3;
  let j = 0;
  return {
    obj: g,
    poke: () => {
      j = 1;
      fx.bits(worldOf(g, 0, 0.8, 0), "#ffe08a", 18, 2.6, 0.06);
      return "chime";
    },
    tick: (dt, t) => {
      if (j <= 0) return;
      j = Math.max(0, j - dt * 1.8);
      bars.forEach((b, k) => (b.position.y = b.userData.y + Math.abs(Math.sin(t * 24 + k)) * 0.07 * j));
    },
  };
};
const chartSign: Maker = (_r, fx) => {
  const g = new THREE.Group();
  const panel = new THREE.Group();
  panel.add(voxMesh([V(-0.6, 0.18, 0, 0.08, 0.36, 0.08, "#d6a64c"), V(0.6, 0.18, 0, 0.08, 0.36, 0.08, "#d6a64c"), V(0, 0.36, 0, 1.6, 0.07, 0.12, "#d6a64c"), V(0, 1.42, 0, 1.6, 0.07, 0.12, "#d6a64c"), V(-0.77, 0.89, 0, 0.07, 1.06, 0.12, "#d6a64c"), V(0.77, 0.89, 0, 0.07, 1.06, 0.12, "#d6a64c"), V(0, 1.5, 0, 0.3, 0.1, 0.1, "#d6a64c")], metalV(0.28, 0.95)));
  const face: Vox[] = [V(0, 0.89, -0.01, 1.48, 1.0, 0.04, "#0c1a12")];
  for (const y of [0.6, 0.85, 1.1, 1.3]) face.push(V(0, y, 0.015, 1.44, 0.01, 0.01, "#1e3a2a"));
  panel.add(voxMesh(face, voxMat(0.3, 0.1)));
  const up = glow("#3ccf6a", 0.75),
    down = glow("#e0443a", 0.75);
  const hs = [0.16, 0.24, 0.2, 0.32, 0.44, 0.56, 0.7];
  const bars: THREE.Mesh[] = [];
  hs.forEach((h, i) => {
    const red = i === 2;
    const x = -0.57 + i * 0.19;
    const base = 0.5 + i * 0.07 - (red ? 0.05 : 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1, 0.04), red ? down : up);
    m.geometry.translate(0, 0.5, 0);
    m.position.set(x, base, 0.03);
    m.scale.y = h;
    m.userData.h = h;
    panel.add(m);
    bars.push(m);
    const wick = new THREE.Mesh(new THREE.BoxGeometry(0.02, h + 0.12, 0.02), red ? down : up);
    wick.position.set(x, base + h / 2, 0.025);
    panel.add(wick);
  });
  // the arrow up, in steps
  panel.add(voxMesh([V(0.55, 1.28, 0.03, 0.06, 0.06, 0.03, "#3ccf6a"), V(0.61, 1.28, 0.03, 0.06, 0.06, 0.03, "#3ccf6a"), V(0.61, 1.22, 0.03, 0.06, 0.06, 0.03, "#3ccf6a"), V(0.49, 1.22, 0.03, 0.06, 0.06, 0.03, "#3ccf6a"), V(0.43, 1.16, 0.03, 0.06, 0.06, 0.03, "#3ccf6a")], glow("#3ccf6a", 0.75)));
  panel.rotation.x = -0.32;
  g.add(panel);
  g.rotation.y = -0.3;
  g.position.z = 0.35;
  let pump = 0;
  return {
    obj: g,
    poke: () => {
      pump = 1.4;
      fx.bits(worldOf(g, 0.5, 1.4, 0.1), "#3ccf6a", 16, 2.4, 0.06);
      return "chime";
    },
    tick: (dt) => {
      if (pump <= 0) return;
      pump = Math.max(0, pump - dt);
      const k = 1.4 - pump;
      bars.forEach((b, i) => {
        const e = Math.max(0, Math.min(1, (k - i * 0.1) * 2.2));
        b.scale.y = b.userData.h * (0.05 + 0.95 * e) * (1 + (pump > 0 ? Math.sin(e * Math.PI) * 0.35 : 0));
      });
    },
  };
};
const openSafe: Maker = (_r, fx) => {
  const g = new THREE.Group();
  const s = "#4a4a54";
  g.add(voxMesh([V(0, 0.46, -0.37, 0.95, 0.92, 0.08, s), V(-0.44, 0.46, 0, 0.08, 0.92, 0.8, s), V(0.44, 0.46, 0, 0.08, 0.92, 0.8, s), V(0, 0.88, 0, 0.95, 0.08, 0.8, s), V(0, 0.04, 0, 0.95, 0.08, 0.8, s), V(0, 0.46, -0.3, 0.8, 0.76, 0.04, "#18181e")], metalV(0.4, 0.8)));
  g.add(voxMesh([V(0, 0.93, 0, 0.99, 0.03, 0.84, "#e0a92e"), V(0, 0.0, 0, 0.99, 0.03, 0.84, "#e0a92e")], metalV(0.25, 1)));
  const inner = new THREE.MeshStandardMaterial({ color: "#f0b838", metalness: 1, roughness: 0.25, emissive: "#6a4006", emissiveIntensity: 0.35 });
  for (let k = 0; k < 6; k++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.18), inner);
    m.position.set(-0.2 + (k % 3) * 0.2, 0.15 + Math.floor(k / 3) * 0.13, -0.05 + (k % 2) * 0.1);
    g.add(m);
  }
  const door = new THREE.Group();
  door.position.set(-0.47, 0.46, 0.41);
  const dm = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.9, 0.08), new THREE.MeshStandardMaterial({ color: "#5a5a66", metalness: 0.8, roughness: 0.35 }));
  dm.position.x = 0.46;
  door.add(dm);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#e0a92e", metalness: 1, roughness: 0.25 }));
  dial.position.set(0.46, 0.05, 0.06);
  door.add(dial);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), new THREE.MeshStandardMaterial({ color: "#e0a92e", metalness: 1, roughness: 0.25 }));
  handle.position.set(0.78, 0.05, 0.08);
  door.add(handle);
  g.add(door);
  g.rotation.y = -0.4;
  let swing = 0;
  return {
    obj: g,
    poke: () => {
      swing = 1;
      fx.bits(worldOf(g, 0, 0.5, 0.3), "#ffe08a", 14, 2.2, 0.06);
      return "clank";
    },
    tick: (dt, t) => {
      swing = Math.max(0, swing - dt * 0.8);
      door.rotation.y = -1.1 - Math.sin(Math.min(1, swing) * Math.PI) * 0.8;
      dial.rotation.z = t * 0.4 + swing * 6;
    },
  };
};

/** Each arena's four: near left, far left, far right, near right. */
const SETS: Record<MapKind, Maker[]> = {
  rigs: [rigTower, steamPipes, coinPile, pickCrate],
  orchard: [fountain, frondTree, beehive, wheelbarrow],
  crypt: [candles, hoodedStatue, raven, sarcophagus],
  vault: [goldenBull, goldBars, chartSign, openSafe],
};

// ---- building one -----------------------------------------------------------------------------------------

export function buildMap(kind: MapKind, renderer: THREE.WebGLRenderer, scene: THREE.Scene): MapHandle {
  const th = { ...THEMES[kind], top: TOPS[kind] };
  const group = new THREE.Group();
  const r = mulberry(kind.length * 977 + 3);
  const disposables: { dispose(): void }[] = [];
  const ticks: ((dt: number, t: number) => void)[] = [];
  const toys: THREE.Object3D[] = [];
  const pokes: (() => string)[] = [];
  const toy = (o: THREE.Object3D, f: () => string) => {
    o.userData.toy = pokes.length;
    o.traverse((c) => {
      c.userData.toy = pokes.length;
      if ((c as THREE.Mesh).isMesh) toys.push(c);
    });
    pokes.push(f);
  };

  scene.background = new THREE.Color(th.fog);
  scene.fog = new THREE.Fog(th.fog, 22, 46);

  // lights
  const hemi = new THREE.HemisphereLight(th.sky, th.ground, kind === "rigs" ? 0.62 : 0.5);
  group.add(hemi);
  // the lamp over the table: a soft pool of light on the play, the room falling away round it
  const lampI = DRESS[kind].lamp;
  const lamp = new THREE.SpotLight(th.key, lampI, 46, 0.62, 0.85, 1.7);
  lamp.position.set(0, 19, 3.5);
  lamp.target.position.set(0, 0, 0.2);
  group.add(lamp, lamp.target);
  // it breathes a little (a flame's lamp in the hall, steadier in the vault)
  const flick = kind === "vault" ? 0.02 : kind === "orchard" ? 0.035 : 0.06;
  ticks.push((_dt, t) => (lamp.intensity = lampI * (1 + flick * (Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1 + 1) * 0.3 + Math.sin(t * 2.1) * 0.2))));
  // dust turning slowly in the lamp's light
  {
    const N = 170;
    const pos = new Float32Array(N * 3);
    const vel: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = r() * Math.PI * 2,
        d = Math.sqrt(r()) * 7.5;
      pos[i * 3] = Math.cos(a) * d;
      pos[i * 3 + 1] = 0.6 + r() * 7;
      pos[i * 3 + 2] = Math.sin(a) * d * 0.7 + 0.3;
      vel.push((r() - 0.5) * 0.08, (r() - 0.5) * 0.05, (r() - 0.5) * 0.08);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: th.key, size: 0.045, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
    const motes = new THREE.Points(pg, pm);
    motes.frustumCulled = false;
    group.add(motes);
    disposables.push(pg, pm);
    ticks.push((dt, t) => {
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        pos[k] += (vel[i * 3] + Math.sin(t * 0.3 + i) * 0.03) * dt;
        pos[k + 1] += (vel[i * 3 + 1] + 0.02) * dt;
        pos[k + 2] += (vel[i * 3 + 2] + Math.cos(t * 0.27 + i) * 0.03) * dt;
        if (pos[k + 1] > 7.8) pos[k + 1] = 0.6;
        if (Math.abs(pos[k]) > 8) pos[k] *= -0.95;
        if (Math.abs(pos[k + 2] - 0.3) > 5.5) pos[k + 2] = 0.3 - (pos[k + 2] - 0.3) * 0.95;
      }
      pg.attributes.position.needsUpdate = true;
    });
  }
  const key = new THREE.DirectionalLight(th.key, th.keyI * 0.62);
  key.position.set(-6, 16, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -14;
  key.shadow.camera.right = 14;
  key.shadow.camera.top = 11;
  key.shadow.camera.bottom = -11;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 40;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  group.add(key);
  group.add(key.target);
  for (const [c, i, p] of th.fill) {
    const l = new THREE.PointLight(c, i * 0.55, 26, 1.6);
    l.position.copy(p);
    group.add(l);
  }

  // the floor round the table
  {
    const [cv, g] = canvas(1024, 1024);
    g.fillStyle = shade(th.floor, 0.6).getStyle();
    g.fillRect(0, 0, 1024, 1024);
    // pavers: each a slab, lit at its top-left edge, shaded at its bottom-right, a little worn
    for (let y = 0; y < 1024; y += 128)
      for (let x = (y / 128) % 2 ? -64 : 0; x < 1024; x += 128) {
        const k = 0.85 + r() * 0.3;
        g.fillStyle = shade(th.floor, k).getStyle();
        g.fillRect(x + 4, y + 4, 120, 120);
        g.fillStyle = "rgba(255,255,255,0.07)";
        g.fillRect(x + 4, y + 4, 120, 5);
        g.fillRect(x + 4, y + 4, 5, 120);
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(x + 4, y + 119, 120, 5);
        g.fillRect(x + 119, y + 4, 5, 120);
      }
    texture(g, grainTile(), 0.5, 0, 0, 1024, 1024);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(8, 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.6;
    floor.receiveShadow = true;
    group.add(floor);
    disposables.push(t, floor.geometry, floor.material as THREE.Material);
  }

  // the table: the slab, the painted top (with relief from the same picture), the carved frame, the
  // corner bastions with their set pieces, the drape, the rug
  const dr = DRESS[kind];
  const fx = makeFx(group, ticks);
  {
    const W = 2048,
      H = Math.round((2048 * TABLE.d) / TABLE.w);
    const [cv, g] = canvas(W, H);
    th.top(g, W, H, r);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(TABLE.w, TABLE.d),
      new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.9, roughness: kind === "vault" ? 0.55 : kind === "rigs" ? 0.55 : 0.85, metalness: kind === "rigs" ? 0.3 : 0.02 }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = TABLE.top;
    top.receiveShadow = true;
    group.add(top);
    disposables.push(tex, top.geometry, top.material as THREE.Material);
    const slab = new THREE.Mesh(new RoundedBoxGeometry(TABLE.w + 0.6, 1.5, TABLE.d + 0.6, 3, 0.18), new THREE.MeshStandardMaterial({ map: rimTex(dr.body, "wood"), roughness: 0.7, metalness: 0.1 }));
    slab.position.y = -0.76;
    slab.receiveShadow = true;
    slab.castShadow = true;
    group.add(slab);
  }

  // the frame: a stepped moulding (plinth, step, a lip that overhangs the top and throws its shadow on
  // it), a metal edge on the lip, a crown band, grooves and the arena's ornaments along it; low in the
  // middle of the far side, where the rival's hand sits
  {
    const body: Vox[] = [],
      trim: Vox[] = [];
    const E = TABLE.w / 2,
      D = TABLE.d / 2;
    const dark = shade(dr.body, 0.55);
    type Put = (list: Vox[], ca: number, cb: number, y0: number, y1: number, col: string | THREE.Color, b0?: number, b1?: number) => void;
    const ornament = (put: Put, a: number, i: number) => {
      if (dr.orn === "rivet") {
        put(trim, 0.42, 0.56, 0.3, 0.38, dr.trim, a - 0.34, a - 0.2);
        put(trim, 0.42, 0.56, 0.3, 0.38, dr.trim, a + 0.2, a + 0.34);
        put(body, 0.38, 0.6, 0.3, 0.33, "#e0a020", a - 0.12, a + 0.12);
      } else if (dr.orn === "leaf") {
        put(body, 0.36, 0.56, 0.3, 0.37, "#5cae48", a - 0.22, a + 0.02);
        put(body, 0.46, 0.64, 0.3, 0.35, "#4f9a3e", a - 0.02, a + 0.22);
        put(body, 0.4, 0.5, 0.3, 0.34, "#86c45a", a + 0.12, a + 0.3);
        put(trim, 0.45, 0.53, 0.35, 0.43, dr.trim, a - 0.04, a + 0.04);
      } else if (dr.orn === "rune") {
        put(body, 0.38, 0.62, 0.3, 0.36, i % 2 ? "#8f6ac8" : "#e6e0d2", a - 0.12, a + 0.12);
        if (!(i % 2)) {
          put(body, 0.45, 0.5, 0.36, 0.37, "#2a2030", a - 0.08, a - 0.03);
          put(body, 0.45, 0.5, 0.36, 0.37, "#2a2030", a + 0.03, a + 0.08);
        }
      } else {
        put(trim, 0.4, 0.46, 0.3, 0.35, dr.trim, a - 0.05, a + 0.05);
        put(trim, 0.46, 0.54, 0.3, 0.37, dr.trim, a - 0.16, a + 0.16);
        put(trim, 0.54, 0.6, 0.3, 0.35, dr.trim, a - 0.05, a + 0.05);
      }
    };
    const side = (along: "x" | "z", a0: number, a1: number, c0: number, s: number, T: number, low = false) => {
      const put: Put = (list, ca, cb, y0, y1, col, b0 = a0, b1 = a1) => {
        const c1 = c0 + s * ca,
          c2 = c0 + s * cb;
        const cm = (c1 + c2) / 2,
          cw = Math.abs(c2 - c1);
        const am = (b0 + b1) / 2,
          aw = b1 - b0;
        list.push(along === "x" ? { x: am, y: (y0 + y1) / 2, z: cm, w: aw, h: y1 - y0, d: cw, c: col } : { x: cm, y: (y0 + y1) / 2, z: am, w: cw, h: y1 - y0, d: aw, c: col });
      };
      if (low) {
        put(body, 0.02, T, -0.3, 0.1, dr.body);
        put(body, -0.1, 0.3, 0.1, 0.17, dr.body2);
        put(trim, -0.12, -0.05, 0.06, 0.19, dr.trim);
        return;
      }
      put(body, 0.05, T, -0.3, 0.14, dr.body);
      put(body, -0.02, T - (T > 0.8 ? 0.2 : 0.02), 0.14, 0.3, dr.body2);
      put(body, -0.12, Math.min(0.3, T), 0.3, 0.45, dr.body);
      put(trim, -0.15, -0.06, 0.27, 0.47, dr.trim);
      put(trim, T - 0.06, T + (T > 0.8 ? 0.02 : 0), -0.3, -0.17, dr.trim);
      if (T > 0.8) {
        put(trim, T - 0.42, T - 0.2, 0.3, 0.39, dr.trim);
        const n = Math.max(2, Math.round((a1 - a0) / 1.3));
        for (let i = 1; i < n; i++) {
          const a = a0 + ((a1 - a0) * i) / n;
          put(body, 0.3, T - 0.42, 0.3, 0.312, dark, a - 0.03, a + 0.03);
          ornament(put, a + ((a1 - a0) / n) * 0.5 - (i === n - 1 ? 0 : 0), i);
        }
      }
    };
    const T = 1.15;
    side("x", -E, E, D, 1, T);
    side("x", -E, -2.9, -D, -1, T);
    side("x", -2.9, 2.9, -D, -1, T, true);
    side("x", 2.9, E, -D, -1, T);
    side("z", -D, D, -E, -1, T);
    // (the right side stays slim: the live chain stands beside it, x 10.2 on is its own)
    side("z", -D, D, E, 1, 0.2);
    const bm = voxMesh(body, voxMat(dr.bodyRough, dr.bodyMetal));
    const tm = voxMesh(trim, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: dr.trimMetal, roughness: 0.32 }));
    group.add(bm, tm);
  }

  // the drape: hung from the frame's outer edge to the floor (the near side is the one in sight)
  {
    const ct = clothTex(dr.cloth, dr.clothHem);
    const mk = (len: number) => {
      const t = ct.clone();
      t.needsUpdate = true;
      t.repeat.x = len / 4;
      disposables.push(t);
      return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, roughness: 0.9, side: THREE.DoubleSide });
    };
    const E = TABLE.w / 2 + 1.17,
      D = TABLE.d / 2 + 1.17;
    for (const [w, x, z, ry] of [
      [TABLE.w + 2.3, -0.4, D, 0],
      [TABLE.w + 2.3, -0.4, -D, Math.PI],
      [TABLE.d + 2.3, -E, 0, -Math.PI / 2],
    ] as [number, number, number, number][]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.5), mk(w));
      m.position.set(x, -0.95, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      group.add(m);
    }
  }

  // the rug under the table
  {
    const rt = rugTex(dr.rug[0], dr.rug[1], dr.rug[2]);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(36, 27), new THREE.MeshStandardMaterial({ map: rt, roughness: 0.95 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, -1.585, -1);
    rug.receiveShadow = true;
    group.add(rug);
  }

  // the corner bastions, each carrying a set piece that answers a click
  {
    const corners: [number, number, number][] = [
      [-9.55, 5.6, 2.3],
      [-9.7, -6.8, 2.3],
      [9.4, -6.9, 1.5],
      [9.9, 7.0, 2.0],
    ];
    const body: Vox[] = [],
      trim: Vox[] = [];
    for (const [x, z, S] of corners) {
      body.push({ x, y: -0.7, z, w: S, h: 1.8, d: S, c: dr.body });
      trim.push({ x, y: 0.2, z, w: S + 0.08, h: 0.12, d: S + 0.08, c: dr.trim });
      body.push({ x, y: 0.37, z, w: S - 0.28, h: 0.22, d: S - 0.28, c: dr.body2 });
      trim.push({ x, y: 0.52, z, w: S - 0.5, h: 0.08, d: S - 0.5, c: dr.trim });
      // a little stepped corner on each bastion's corners
      for (const [ox, oz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        trim.push({ x: x + ((ox * (S - 0.28)) / 2) * 0.92, y: 0.36, z: z + ((oz * (S - 0.28)) / 2) * 0.92, w: 0.16, h: 0.26, d: 0.16, c: dr.trim });
    }
    group.add(voxMesh(body, voxMat(dr.bodyRough, dr.bodyMetal)), voxMesh(trim, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: dr.trimMetal, roughness: 0.32 })));
    const pieces = SETS[kind];
    const at = [corners[0], corners[1], corners[2], corners[3]];
    pieces.forEach((make, i) => {
      const [x, z] = at[i];
      const p = make(r, fx);
      p.obj.position.set(x, 0.56, z);
      // the near-left one is the arena's star piece: a size up
      if (i === 0) p.obj.scale.multiplyScalar(1.18);
      group.add(p.obj);
      if (p.tick) ticks.push(p.tick);
      toy(p.obj, p.poke);
    });
  }

  // the hall round it
  const back = -TABLE.d / 2 - 3.5;
  if (kind === "rigs") rigs();
  else if (kind === "orchard") orchard();
  else if (kind === "crypt") crypt();
  else vault();

  function rigs() {
    const mat = voxMat(0.5, 0.35);
    // racks along the back wall, each with fans and LED columns
    const fans: THREE.Mesh[] = [];
    const leds: THREE.Mesh[] = [];
    const ledMats = [glow("#ff6b35", 2.6), glow("#7ee08a", 2.2), glow("#ffd76a", 2.2)];
    for (let i = 0; i < 9; i++) {
      const x = -16 + i * 4;
      const rack = voxMesh(
        [
          { x: 0, y: 2.2, z: 0, w: 3.2, h: 4.4, d: 1.6, c: "#26221f" },
          { x: 0, y: 4.5, z: 0, w: 3.4, h: 0.2, d: 1.8, c: "#4a4038" },
          { x: 0, y: 0.1, z: 0, w: 3.4, h: 0.2, d: 1.8, c: "#4a4038" },
          ...[0.9, 2.1, 3.3].map((y) => ({ x: 0, y, z: 0.82, w: 3.0, h: 1.0, d: 0.06, c: "#1a1715" })),
        ],
        mat,
      );
      rack.position.set(x, -1.6, back - 1);
      group.add(rack);
      for (const y of [0.9, 2.1, 3.3])
        for (const fx of [-0.8, 0.8]) {
          const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 6), new THREE.MeshStandardMaterial({ color: "#3a3430", metalness: 0.6, roughness: 0.4 }));
          fan.rotation.x = Math.PI / 2;
          fan.position.set(x + fx, -1.6 + y, back - 1 + 0.88);
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.12), new THREE.MeshStandardMaterial({ color: "#8a8078" }));
          blade.position.y = 0.06;
          fan.add(blade);
          const blade2 = blade.clone();
          blade2.rotation.y = Math.PI / 2;
          fan.add(blade2);
          group.add(fan);
          fans.push(fan);
        }
      for (let k = 0; k < 6; k++) {
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), ledMats[k % 3]);
        led.position.set(x + 1.35, -1.6 + 0.5 + k * 0.6, back - 1 + 0.86);
        group.add(led);
        leds.push(led);
      }
    }
    // hanging lamps over the table
    for (const x of [-6, 0, 6]) {
      const lamp = voxMesh(
        [
          { x: 0, y: 3, z: 0, w: 0.06, h: 6, d: 0.06, c: "#111" },
          { x: 0, y: 0, z: 0, w: 1.6, h: 0.3, d: 1.0, c: "#3a3028" },
          { x: 0, y: 0.25, z: 0, w: 1.0, h: 0.3, d: 0.6, c: "#2a221c" },
        ],
        voxMat(0.5, 0.4),
      );
      lamp.position.set(x, 9, -1.5);
      group.add(lamp);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.7), glow("#ffd9a0", 3));
      bulb.position.set(x, 8.84, -1.5);
      group.add(bulb);
    }
    // cable trays along the sides
    for (const sx of [-1, 1]) {
      const tray = voxMesh(
        Array.from({ length: 10 }, (_, i) => ({ x: 0, y: 0, z: -i * 2, w: 1.2, h: 0.2, d: 1.8, c: i % 2 ? "#3a332c" : "#453c33" })),
        voxMat(0.6, 0.5),
      );
      tray.position.set(sx * 14.8, 4, 4);
      group.add(tray);
    }
    ticks.push((dt, t) => {
      for (const f of fans) f.rotation.y += dt * 9;
      for (let i = 0; i < leds.length; i++) leds[i].visible = Math.sin(t * (3 + (i % 5)) + i * 1.7) > -0.3;
    });
  }

  function orchard() {
    const mat = voxMat(0.85, 0);
    const trees: THREE.Group[] = [];
    const fruitMat = new THREE.MeshStandardMaterial({ color: "#ff9a3a", emissive: "#a04010", emissiveIntensity: 0.3, roughness: 0.5 });
    const tree = (x: number, z: number, s: number) => {
      const g = new THREE.Group();
      const parts: Vox[] = [
        { x: 0, y: 1.2 * s, z: 0, w: 0.5 * s, h: 2.4 * s, d: 0.5 * s, c: "#5a3a22" },
        { x: 0.4 * s, y: 2.2 * s, z: 0, w: 0.8 * s, h: 0.25 * s, d: 0.25 * s, c: "#5a3a22" },
      ];
      for (let k = 0; k < 14; k++) {
        const a = r() * Math.PI * 2,
          d = r() * 1.3 * s;
        const c = ["#3f7a34", "#4f9a3e", "#5cae48", "#3a6a2e"][Math.floor(r() * 4)];
        parts.push({ x: Math.cos(a) * d, y: (2.6 + r() * 1.4) * s, z: Math.sin(a) * d, w: (0.8 + r() * 0.6) * s, h: (0.7 + r() * 0.5) * s, d: (0.8 + r() * 0.6) * s, c });
      }
      g.add(voxMesh(parts, mat));
      for (let k = 0; k < 6; k++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.22 * s, 0.22 * s), fruitMat);
        const a = r() * Math.PI * 2;
        f.position.set(Math.cos(a) * 1.2 * s, (2.4 + r()) * s, Math.sin(a) * 1.2 * s);
        f.userData.home = f.position.clone();
        g.add(f);
      }
      g.position.set(x, -1.6, z);
      group.add(g);
      trees.push(g);
      return g;
    };
    for (let i = 0; i < 8; i++) tree(-15 + i * 4.3 + r(), back - 1.5 - r() * 2, 1.1 + r() * 0.4);
    const drops: { m: THREE.Object3D; v: number; t: number }[] = [];
    // petals drifting
    const petals = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.02, 0.12), new THREE.MeshStandardMaterial({ color: "#ffc4d6", emissive: "#a04060", emissiveIntensity: 0.3 }), 90);
    const pp = Array.from({ length: 90 }, () => new THREE.Vector3((r() - 0.5) * 34, r() * 10, (r() - 0.5) * 22 - 4));
    group.add(petals);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    ticks.push((dt, t) => {
      for (let i = 0; i < pp.length; i++) {
        const p = pp[i];
        p.y -= dt * 0.5;
        p.x += Math.sin(t + i) * dt * 0.4;
        if (p.y < -1.5) p.y = 10;
        // (never through the chain's strip right of the table)
        if (p.x > 10.3 && p.x < 13.4 && p.z > -6.6 && p.z < 6.2) p.x += 3.3;
        q.setFromEuler(new THREE.Euler(t + i, t * 0.7 + i, 0));
        mtx.compose(p, q, new THREE.Vector3(1, 1, 1));
        petals.setMatrixAt(i, mtx);
      }
      petals.instanceMatrix.needsUpdate = true;
      for (const tr of trees) {
        const s = tr.userData.shake ?? 0;
        if (s > 0) {
          tr.userData.shake = Math.max(0, s - dt * 1.5);
          tr.rotation.z = Math.sin(t * 30) * 0.04 * s;
        }
      }
      for (const d of drops) {
        d.t += dt;
        if (d.t < 1.4) {
          d.v -= dt * 9;
          d.m.position.y = Math.max(0.2, d.m.position.y + d.v * dt);
        } else if (d.t > 3.5) {
          d.m.position.copy(d.m.userData.home);
          d.t = -1e9;
        }
      }
    });
  }

  function crypt() {
    const mat = voxMat(0.9, 0.02);
    for (let i = 0; i < 11; i++) {
      const x = -17 + i * 3.4 + (r() - 0.5),
        z = back - 0.5 - r() * 3;
      const h = 1.3 + r() * 0.9;
      const st = voxMesh(
        [
          { x: 0, y: h / 2, z: 0, w: 1.1, h, d: 0.35, c: shade("#6a6474", 0.8 + r() * 0.3) },
          { x: 0, y: h + 0.15, z: 0, w: 0.7, h: 0.3, d: 0.35, c: "#5a5464" },
          { x: 0, y: 0.08, z: 0.3, w: 1.4, h: 0.16, d: 1.2, c: "#3a3442" },
        ],
        mat,
      );
      st.position.set(x, -1.6, z);
      st.rotation.z = (r() - 0.5) * 0.12;
      group.add(st);
    }
    // the iron gate
    const bars: Vox[] = [];
    for (let i = 0; i < 18; i++) bars.push({ x: -8.5 + i, y: 3, z: 0, w: 0.12, h: 6, d: 0.12, c: "#2a2630" });
    bars.push({ x: 0, y: 5.9, z: 0, w: 18, h: 0.25, d: 0.2, c: "#3a3442" }, { x: 0, y: 0.5, z: 0, w: 18, h: 0.2, d: 0.2, c: "#3a3442" });
    const gate = voxMesh(bars, voxMat(0.5, 0.6));
    gate.position.set(0, -1.6, back - 5);
    group.add(gate);
    // the mist: soft green sheets drifting
    const [cv, g] = canvas(256, 256);
    const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grd.addColorStop(0, "rgba(130,220,140,0.35)");
    grd.addColorStop(1, "rgba(130,220,140,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const mt = new THREE.CanvasTexture(cv);
    const mm = new THREE.MeshBasicMaterial({ map: mt, transparent: true, depthWrite: false, fog: false });
    const mists: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), mm);
      m.rotation.x = -Math.PI / 2;
      m.position.set((r() - 0.5) * 34, -1.2 + r() * 0.4, back - r() * 6);
      group.add(m);
      mists.push(m);
    }
    disposables.push(mt, mm);
    ticks.push((dt, t) => {
      for (let i = 0; i < mists.length; i++) mists[i].position.x += Math.sin(t * 0.1 + i) * dt * 0.3;
    });
  }

  function vault() {
    // the round door at the back, turning (click: a full turn)
    const door = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: "#d9a42a", metalness: 1, roughness: 0.28 });
    const dark = new THREE.MeshStandardMaterial({ color: "#2a2620", metalness: 0.8, roughness: 0.4 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.8, 8), dark);
    ring.rotation.x = Math.PI / 2;
    door.add(ring);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.9, 8), gold);
    face.rotation.x = Math.PI / 2;
    door.add(face);
    const wheel = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.35, 0.35), dark);
      spoke.rotation.z = (k * Math.PI) / 4;
      spoke.position.z = 0.6;
      wheel.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 8), glow("#f4b728", 1.6));
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.7;
    wheel.add(hub);
    door.add(wheel);
    door.position.set(0, 3.2, back - 4.5);
    group.add(door);
    let turn = 0;
    toy(door, () => ((turn = Math.PI * 2), "clank"));
    // lasers sweeping the back
    const beams: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(30, 0.05, 0.05), glow("#ff3a3a", 3));
      b.position.set(0, 0, back - 2 - i * 0.6);
      group.add(b);
      beams.push(b);
    }
    // pillars
    for (const x of [-9, 9, -16, 16]) {
      const p = voxMesh(
        [
          { x: 0, y: 4, z: 0, w: 1.4, h: 8, d: 1.4, c: "#1c1915" },
          { x: 0, y: 8.1, z: 0, w: 1.8, h: 0.3, d: 1.8, c: "#c89a2a" },
          { x: 0, y: 0.15, z: 0, w: 1.8, h: 0.3, d: 1.8, c: "#c89a2a" },
        ],
        voxMat(0.4, 0.6),
      );
      p.position.set(x, -1.6, back - 3);
      group.add(p);
    }
    ticks.push((dt, t) => {
      const sp = turn > 0 ? Math.min(turn, dt * 4) : 0;
      turn -= sp;
      wheel.rotation.z += dt * 0.15 + sp;
      for (let i = 0; i < beams.length; i++) beams[i].position.y = -0.4 + ((Math.sin(t * 0.6 + i * 1.3) + 1) / 2) * 4;
    });
  }

  scene.add(group);
  return {
    group,
    toys,
    accent: th.accent,
    update: (dt, t) => {
      for (const f of ticks) f(dt, t);
    },
    poke: (i) => pokes[i]?.() ?? "",
    dispose: () => {
      scene.remove(group);
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      for (const d of disposables) d.dispose();
    },
  };
}
