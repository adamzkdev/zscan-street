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
import { GOLD, facets, grainTile, innerShadow, metalFill, mixc, ngon, rimTex, stepRect, stud, texture, voxelGrain, zMark, type Trim } from "./boardart";

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
function carve(g: CanvasRenderingContext2D, W: number, H: number, ink: string, inlay: string, lane: string) {
  const sx = W / TABLE.w,
    sz = H / TABLE.d;
  const X = (x: number) => W / 2 + x * sx,
    Z = (z: number) => H / 2 + z * sz;
  const trim: Trim = inlay === "#f4b728" || inlay === "#c9a54a" || inlay === "#d9862c" ? { m0: "#4a3006", m1: "#a87a14", m2: "#f0c24a", m3: "#fff4c8" } : { m0: mixc(inlay, "#000000", 0.6), m1: mixc(inlay, "#000000", 0.25), m2: inlay, m3: mixc(inlay, "#ffffff", 0.7) };
  const r = mulberry(W + H);
  // the frame band round the whole top (metal), and the top's worn edge inside it
  const band = new Path2D();
  band.rect(0, 0, W, H);
  band.rect(46, 46, W - 92, H - 92);
  g.save();
  g.clip(band, "evenodd");
  metalFill(g, (() => { const p = new Path2D(); p.rect(0, 0, W, H); return p; })(), trim, 0, 0, W, H, 6);
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
    const outer = stepRect(x0 - 20, y0 - 20, w + 40, h + 40, 14);
    const inner = stepRect(x0 - 6, y0 - 6, w + 12, h + 12, 10);
    const ring = new Path2D();
    ring.addPath(outer);
    ring.addPath(inner);
    g.save();
    g.clip(ring, "evenodd");
    metalFill(g, outer, trim, x0 - 20, y0 - 20, x0 + w + 20, y0 + h + 20, 4);
    g.restore();
    // the sunken lane: its own darker surface, the rim's shadow falling in
    const recess = stepRect(x0 - 6, y0 - 6, w + 12, h + 12, 10);
    g.save();
    g.fillStyle = lane;
    g.fill(recess);
    g.clip(recess);
    texture(g, grainTile(), 0.35, x0, y0, w, h);
    g.restore();
    innerShadow(g, recess, 28, 0.85, 0, 10);
    // seven bays, engraved: a dark cut with a light lower edge
    for (let i = 0; i < 7; i++) {
      const cx = X((i - 3) * 1.95),
        cy = Z(lz);
      const bw = 1.62 * sx,
        bh = 2.02 * sz;
      const bay = stepRect(cx - bw / 2, cy - bh / 2, bw, bh, 12);
      g.save();
      g.lineWidth = 3;
      g.strokeStyle = "rgba(0,0,0,0.5)";
      g.stroke(bay);
      g.translate(1.5, 2);
      g.lineWidth = 1.5;
      g.strokeStyle = ink;
      g.stroke(bay);
      g.restore();
      // a small diamond at each bay's head
      g.fillStyle = ink;
      g.save();
      g.translate(cx, cy - bh / 2 + 14);
      g.rotate(Math.PI / 4);
      g.fillRect(-4, -4, 8, 8);
      g.restore();
    }
    // studs at the lane's ends
    for (const sxp of [x0 - 34, x0 + w + 34]) stud(g, sxp, y0 + h / 2, 10, trim);
  }
  // the ledger line, inlaid
  const mz = Z((TABLE.laneZ[0] + TABLE.laneZ[1]) / 2);
  const bar = stepRect(X(-TABLE.laneW / 2 - 0.4), mz - 8, (TABLE.laneW + 0.8) * sx, 16, 4);
  metalFill(g, bar, trim, 0, mz - 8, W, mz + 8, 3);
  // the Z seal: a struck gold coin on a dark disc
  const R = 0.78 * sx;
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

const TOPS: Record<MapKind, Theme["top"]> = {
  // riveted steel plates, hazard stripes along the ends, warm orange inlay
  rigs: (g, W, H, r) => {
    g.fillStyle = "#2a2622";
    g.fillRect(0, 0, W, H);
    const P = 256;
    for (let y = 0; y < H; y += P)
      for (let x = 0; x < W; x += P) {
        const v = 36 + r() * 10;
        g.fillStyle = `rgb(${v + 4},${v + 1},${v - 3})`;
        g.fillRect(x + 3, y + 3, P - 6, P - 6);
        // brushed
        for (let k = 0; k < 40; k++) {
          g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`;
          g.fillRect(x + 6, y + 6 + r() * (P - 12), P - 12, 1);
        }
        g.fillStyle = "#6b625a";
        for (const [a, b] of [
          [12, 12],
          [P - 18, 12],
          [12, P - 18],
          [P - 18, P - 18],
        ]) {
          g.fillRect(x + a, y + b, 6, 6);
          g.fillStyle = "#8a8076";
          g.fillRect(x + a, y + b, 3, 3);
          g.fillStyle = "#6b625a";
        }
      }
    for (const yy of [0, H - 70])
      for (let x = -70; x < W; x += 56) {
        g.fillStyle = "#e0a020";
        g.beginPath();
        g.moveTo(x, yy + 70);
        g.lineTo(x + 28, yy);
        g.lineTo(x + 56, yy);
        g.lineTo(x + 28, yy + 70);
        g.fill();
      }
    noise(g, W, H, r, 0.05);
    carve(g, W, H, "rgba(255,170,90,0.35)", "#d9862c", "rgba(16,12,9,0.55)");
  },
  // garden flagstones with moss in the joints
  orchard: (g, W, H, r) => {
    g.fillStyle = "#3a4a30";
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; ) {
      const h = 90 + r() * 70;
      for (let x = -r() * 80; x < W; ) {
        const w = 110 + r() * 120;
        const v = 92 + r() * 26;
        g.fillStyle = `rgb(${v},${v - 4},${v - 16})`;
        g.fillRect(x + 5, y + 5, w - 10, h - 10);
        g.fillStyle = "rgba(255,255,255,0.06)";
        g.fillRect(x + 5, y + 5, w - 10, 4);
        x += w;
      }
      y += h;
    }
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = r() < 0.5 ? "#4f7a3a" : "#3c6430";
      g.fillRect(r() * W, r() * H, 3 + r() * 5, 3 + r() * 5);
    }
    noise(g, W, H, r, 0.06);
    carve(g, W, H, "rgba(220,255,200,0.3)", "#c9a54a", "rgba(30,40,22,0.55)");
  },
  // worn grave slabs, engraved
  crypt: (g, W, H, r) => {
    g.fillStyle = "#1e1b22";
    g.fillRect(0, 0, W, H);
    const P = 200;
    for (let y = 0; y < H; y += P)
      for (let x = (y / P) % 2 ? -P / 2 : 0; x < W; x += P) {
        const v = 52 + r() * 16;
        g.fillStyle = `rgb(${v - 4},${v - 6},${v + 4})`;
        g.fillRect(x + 4, y + 4, P - 8, P - 8);
        if (r() < 0.25) {
          g.strokeStyle = "rgba(0,0,0,0.5)";
          g.lineWidth = 2;
          g.beginPath();
          let cx = x + r() * P,
            cy = y + 4;
          g.moveTo(cx, cy);
          for (let k = 0; k < 6; k++) g.lineTo((cx += (r() - 0.5) * 50), (cy += P / 6));
          g.stroke();
        }
      }
    for (let i = 0; i < 600; i++) {
      g.fillStyle = "rgba(120,200,120,0.12)";
      g.fillRect(r() * W, r() * H, 2 + r() * 6, 2 + r() * 6);
    }
    noise(g, W, H, r, 0.07);
    carve(g, W, H, "rgba(190,160,255,0.3)", "#8f7bd8", "rgba(10,8,16,0.6)");
  },
  // black lacquer with gold filigree
  vault: (g, W, H, r) => {
    g.fillStyle = "#121014";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(244,183,40,0.13)";
    g.lineWidth = 2;
    for (let y = 40; y < H; y += 80)
      for (let x = 40; x < W; x += 80) {
        g.beginPath();
        g.moveTo(x - 20, y);
        g.lineTo(x, y - 20);
        g.lineTo(x + 20, y);
        g.lineTo(x, y + 20);
        g.closePath();
        g.stroke();
      }
    noise(g, W, H, r, 0.04);
    carve(g, W, H, "rgba(255,220,140,0.35)", "#f4b728", "rgba(5,4,6,0.6)");
  },
};

const THEMES: Record<MapKind, Omit<Theme, "top">> = {
  rigs: { floor: "#1b1714", wood: "#3a2a1c", rim: "#4a4038", rimMetal: 0.7, accent: "#ff6b35", fog: "#140f0b", sky: "#ffcfa0", ground: "#2a1a10", key: "#ffd9b0", keyI: 2.6, fill: [["#ff6b35", 40, new THREE.Vector3(-9, 4, -8)], ["#ffb347", 30, new THREE.Vector3(10, 5, -6)]] },
  orchard: { floor: "#24301e", wood: "#5a3a22", rim: "#6a4a2a", rimMetal: 0.1, accent: "#7ee08a", fog: "#101a14", sky: "#e6f7ff", ground: "#2a3a20", key: "#fff1d6", keyI: 2.8, fill: [["#ffd27a", 34, new THREE.Vector3(-10, 3, -7)], ["#9be3ff", 22, new THREE.Vector3(10, 6, -9)]] },
  crypt: { floor: "#141218", wood: "#2a2430", rim: "#3a3444", rimMetal: 0.2, accent: "#b48ad8", fog: "#0c0a12", sky: "#c8b8ff", ground: "#100c18", key: "#d8ccff", keyI: 2.0, fill: [["#7ee08a", 26, new THREE.Vector3(-10, 3, -7)], ["#b48ad8", 30, new THREE.Vector3(10, 4, -8)]] },
  vault: { floor: "#0e0d10", wood: "#1a1610", rim: "#c89a2a", rimMetal: 0.95, accent: "#f4b728", fog: "#0a0908", sky: "#fff0c8", ground: "#1a140a", key: "#fff2d8", keyI: 2.6, fill: [["#f4b728", 36, new THREE.Vector3(-9, 4, -9)], ["#ff6b35", 22, new THREE.Vector3(10, 5, -7)]] },
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
    o.traverse((c) => (c.userData.toy = pokes.length));
    toys.push(o);
    pokes.push(f);
  };

  scene.background = new THREE.Color(th.fog);
  scene.fog = new THREE.Fog(th.fog, 22, 46);

  // lights
  const hemi = new THREE.HemisphereLight(th.sky, th.ground, 0.55);
  group.add(hemi);
  const key = new THREE.DirectionalLight(th.key, th.keyI);
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

  // the table: the slab, the painted top (with relief from the same picture), the rim, the corner towers
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
      new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 1.6, roughness: kind === "vault" ? 0.35 : 0.78, metalness: kind === "rigs" ? 0.35 : kind === "vault" ? 0.25 : 0.02 }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = TABLE.top;
    top.receiveShadow = true;
    group.add(top);
    disposables.push(tex, top.geometry, top.material as THREE.Material);
    const slab = new THREE.Mesh(new RoundedBoxGeometry(TABLE.w + 0.6, 1.5, TABLE.d + 0.6, 3, 0.18), new THREE.MeshStandardMaterial({ map: rimTex(th.wood, "wood"), roughness: 0.7, metalness: 0.1 }));
    slab.position.y = -0.76;
    slab.receiveShadow = true;
    slab.castShadow = true;
    group.add(slab);
    const rimMat = new THREE.MeshStandardMaterial({ map: rimTex(th.rim, th.rimMetal > 0.5 ? "metal" : th.rimMetal > 0.15 ? "stone" : "wood"), roughness: th.rimMetal > 0.5 ? 0.35 : 0.7, metalness: th.rimMetal });
    const rim = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, 0.36, d, 2, 0.08), rimMat);
      m.position.set(x, 0.12, z);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    };
    rim(TABLE.w + 0.8, 0.5, 0, -TABLE.d / 2 - 0.1);
    rim(TABLE.w + 0.8, 0.5, 0, TABLE.d / 2 + 0.1);
    rim(0.5, TABLE.d + 0.4, -TABLE.w / 2 - 0.1, 0);
    rim(0.5, TABLE.d + 0.4, TABLE.w / 2 + 0.1, 0);
    // corner towers: stepped voxel pillars with a lit cap in the theme's colour
    const capCol = th.accent;
    for (const [x, z] of [
      [-TABLE.w / 2 - 0.1, -TABLE.d / 2 - 0.1],
      [TABLE.w / 2 + 0.1, -TABLE.d / 2 - 0.1],
      [-TABLE.w / 2 - 0.1, TABLE.d / 2 + 0.1],
      [TABLE.w / 2 + 0.1, TABLE.d / 2 + 0.1],
    ]) {
      const t = voxMesh(
        [
          { x: 0, y: 0.25, z: 0, w: 1.1, h: 0.5, d: 1.1, c: shade(th.rim, 0.9) },
          { x: 0, y: 0.7, z: 0, w: 0.86, h: 0.4, d: 0.86, c: shade(th.rim, 1.1) },
          { x: 0, y: 1.05, z: 0, w: 0.64, h: 0.3, d: 0.64, c: shade(th.rim, 0.8) },
        ],
        voxMat(0.4, th.rimMetal * 0.8),
      );
      t.position.set(x, 0, z);
      group.add(t);
      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0).scale(1, 1.5, 1), new THREE.MeshStandardMaterial({ color: capCol, emissive: capCol, emissiveIntensity: 1.6, roughness: 0.1, metalness: 0.3, flatShading: true, toneMapped: false }));
      cap.position.set(x, 1.55, z);
      group.add(cap);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#d9a42a", metalness: 1, roughness: 0.3 }));
      halo.position.set(x, 1.28, z);
      group.add(halo);
      ticks.push((_dt, tt) => {
        cap.rotation.y = tt * 0.8;
        cap.position.y = 1.55 + Math.sin(tt * 1.6 + x) * 0.07;
        halo.rotation.z = Math.sin(tt * 0.7 + z) * 0.15;
      });
    }
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
      tray.position.set(sx * 13.5, 4, 4);
      group.add(tray);
    }
    // the big rig (left) — a click spins it up and throws sparks
    const big = voxMesh(
      [
        { x: 0, y: 0.9, z: 0, w: 2.2, h: 1.8, d: 2.0, c: "#2e2924" },
        { x: 0, y: 1.9, z: 0, w: 2.4, h: 0.2, d: 2.2, c: "#3a2e24" },
        { x: -0.6, y: 0.9, z: 1.02, w: 0.5, h: 1.2, d: 0.05, c: "#1a1715" },
        { x: 0.6, y: 0.9, z: 1.02, w: 0.5, h: 1.2, d: 0.05, c: "#1a1715" },
      ],
      mat,
    );
    big.position.set(-13.6, -1.6, 0.5);
    group.add(big);
    const bigFan = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 8), new THREE.MeshStandardMaterial({ color: "#ff8a4a", emissive: "#ff6b35", emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.4 }));
    bigFan.position.set(-13.6, 0.42, 0.5);
    const bb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.22), new THREE.MeshStandardMaterial({ color: "#2a2420" }));
    bb.position.y = 0.06;
    bigFan.add(bb);
    const bb2 = bb.clone();
    bb2.rotation.y = Math.PI / 2;
    bigFan.add(bb2);
    group.add(bigFan);
    let spin = 0;
    toy(big, () => ((spin = 4), "hum"));
    toy(bigFan, () => ((spin = 4), "hum"));
    // the conveyor (right) carrying fresh blocks
    const belt = voxMesh([{ x: 0, y: 0.5, z: 0, w: 1.6, h: 0.3, d: 9, c: "#2a2420" }, { x: -0.85, y: 0.6, z: 0, w: 0.1, h: 0.3, d: 9, c: "#e0a020" }, { x: 0.85, y: 0.6, z: 0, w: 0.1, h: 0.3, d: 9, c: "#e0a020" }], mat);
    belt.position.set(12.6, -1.6, 0);
    group.add(belt);
    const blocks: THREE.Mesh[] = [];
    const bm = new THREE.MeshStandardMaterial({ color: "#f4b728", metalness: 0.8, roughness: 0.3, emissive: "#6a4808", emissiveIntensity: 0.5 });
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), bm);
      b.castShadow = true;
      b.position.set(12.6, -0.65, -4 + i * 2);
      group.add(b);
      blocks.push(b);
    }
    let rush = 0;
    toy(belt, () => ((rush = 3), "clank"));
    ticks.push((dt, t) => {
      spin = Math.max(0, spin - dt);
      rush = Math.max(0, rush - dt);
      for (const f of fans) f.rotation.y += dt * 9;
      bigFan.rotation.y += dt * (2 + spin * 10);
      for (let i = 0; i < leds.length; i++) leds[i].visible = Math.sin(t * (3 + (i % 5)) + i * 1.7) > -0.3;
      for (const b of blocks) {
        b.position.z += dt * (0.6 + rush * 2.5);
        if (b.position.z > 4.4) b.position.z -= 10;
        b.rotation.y = b.position.z * 0.3;
      }
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
    const left = tree(-12.6, 2, 1.0);
    const right = tree(12.8, 3.2, 0.9);
    const drops: { m: THREE.Object3D; v: number; t: number }[] = [];
    const shake = (tr: THREE.Group) => () => {
      tr.userData.shake = 1;
      for (const f of tr.children.slice(1)) drops.push({ m: f, v: 0, t: 0 });
      return "chime";
    };
    toy(left, shake(left));
    toy(right, shake(right));
    // stone lanterns
    for (const [x, z] of [
      [-11, -5],
      [11, -5],
      [-11.5, 5.4],
    ]) {
      const l = voxMesh(
        [
          { x: 0, y: 0.3, z: 0, w: 0.9, h: 0.6, d: 0.9, c: "#7a756c" },
          { x: 0, y: 0.95, z: 0, w: 0.4, h: 0.7, d: 0.4, c: "#8a857a" },
          { x: 0, y: 1.6, z: 0, w: 0.9, h: 0.6, d: 0.9, c: "#7a756c" },
          { x: 0, y: 2.05, z: 0, w: 1.2, h: 0.25, d: 1.2, c: "#6a655c" },
        ],
        mat,
      );
      l.position.set(x, -1.6, z);
      group.add(l);
      const flame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), glow("#ffcf6a", 2.8));
      flame.position.set(x, -1.6 + 1.6, z);
      group.add(flame);
      ticks.push((_d, t) => (flame.scale.y = 0.85 + Math.sin(t * 7 + x) * 0.12));
    }
    // the pond
    const pond = new THREE.Mesh(new THREE.CircleGeometry(3.2, 8), new THREE.MeshStandardMaterial({ color: "#2a6a8a", roughness: 0.08, metalness: 0.4, emissive: "#0a2030", emissiveIntensity: 0.5 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(13.5, -1.55, -3);
    group.add(pond);
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
    // candles (click: the flames flare)
    const flames: THREE.Mesh[] = [];
    let flare = 0;
    for (const [x, z, n] of [
      [-12.5, 3, 3],
      [-12, -4, 2],
      [12.6, -4.5, 3],
      [12.8, 4.5, 2],
    ]) {
      const cs = new THREE.Group();
      for (let k = 0; k < n; k++) {
        const h = 0.5 + r() * 0.7;
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.28, h, 0.28), new THREE.MeshStandardMaterial({ color: "#e8e0c8", roughness: 0.6 }));
        const ox = (k - (n - 1) / 2) * 0.5;
        c.position.set(ox, h / 2, (r() - 0.5) * 0.4);
        c.castShadow = true;
        cs.add(c);
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), glow("#9bff9e", 3));
        f.position.set(ox, h + 0.18, c.position.z);
        cs.add(f);
        flames.push(f);
      }
      cs.position.set(x, -1.6, z);
      group.add(cs);
      toy(cs, () => ((flare = 2), "creak"));
    }
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
      m.position.set((r() - 0.5) * 34, -1.2 + r() * 0.4, back + (r() - 0.5) * 10);
      group.add(m);
      mists.push(m);
    }
    disposables.push(mt, mm);
    ticks.push((dt, t) => {
      flare = Math.max(0, flare - dt);
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        const k = 1 + flare * 1.4;
        f.scale.set(k, (0.8 + Math.sin(t * 9 + i * 2) * 0.2) * k, k);
      }
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
    // gold stacks on both sides (click: they jingle)
    const stacks: THREE.Group[] = [];
    for (const [x, z] of [
      [-12.6, 2],
      [-12.8, -4],
      [12.9, -4.2],
    ]) {
      const s = new THREE.Group();
      for (let k = 0; k < 9; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.45), gold);
        b.position.set(((k % 3) - 1) * 0.95, 0.15 + Math.floor(k / 3) * 0.3, (k % 2) * 0.2);
        b.castShadow = true;
        s.add(b);
      }
      s.position.set(x, -1.6, z);
      group.add(s);
      stacks.push(s);
      toy(s, () => ((s.userData.j = 1), "chime"));
    }
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
      for (const s of stacks) {
        const j = s.userData.j ?? 0;
        if (j > 0) {
          s.userData.j = Math.max(0, j - dt * 2);
          s.children.forEach((c, k) => (c.position.y = 0.15 + Math.floor(k / 3) * 0.3 + Math.abs(Math.sin(t * 25 + k)) * 0.12 * j));
        }
      }
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
