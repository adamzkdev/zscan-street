/**
 * The board's set dressing (art only: the rules never see it).
 *
 * - `Painter`: the islands' ground, one big painted texture (grass, the paths' worn beds, cobbled
 *   plazas, the factory's yard, the quays, slate, sand) with every prop's soft shadow baked in.
 * - `Words`: every sign's words in one texture, one draw.
 * - `Water`: the harbour's basin, the ponds and the fountain, one toon-water shader (waves, bands,
 *   foam at the shores and round the piles), one draw; `Falls`: every waterfall, one draw.
 * - `Pools`: soft glow pools on the ground under lamps, furnaces, neon (one additive draw).
 * - `cliffs()`: layered voxel strata, roots and crystals under the islands' edges.
 * - `roads()`: the built path: paved and edged between the spaces, little arrows, wooden
 *   boardwalks on the pier, signposts at the junctions.
 * - `skyDome()`: the sunset's gradient, its glow and the first stars.
 * - `dress()`: the zones' set pieces (the harbour, the plaza's fountain, the Needle district, the
 *   Penitentiary's towers, the park, the wilds, the beach, the start gate, turbines, islets…).
 *
 * Static pieces go into the view's Vox (a few instanced draws for thousands of pieces); what
 * moves is handed to life.ts. Nothing here runs per frame.
 */
import * as THREE from "three";
import { FONT } from "../kit";
import { T } from "../../i18n/lang";
import { canvasTex, toonSteps } from "../k3";
import type { Graph } from "./core";
import type { ArtStyle, FloorDef, IslandDef, LandmarkDef, MapDef } from "./maps";
import { Ground, Vox, glowTex, inside, island, type Moving } from "./props";
import type { Life } from "./life";

/** A board's look, every knob filled in (styleOf: the map's own over GENESIS HARBOR's sunset). */
export type Style = Required<ArtStyle>;

/** GENESIS HARBOR's sunset: what a board's ArtStyle leaves out. */
export function styleOf(map: MapDef): Style {
  const d: Style = {
    dome: ["#22164f", "#7a3c93", "#ff7f86", map.sky[1]],
    stars: 1,
    fog: [map.sky[1], 150, 560],
    hemi: ["#ffe0ee", "#7a5a9c", 1.75],
    key: ["#ffd2a8", 2.5, [-45, 60, 55]],
    rim: ["#ff9ec8", 1.05],
    ground: "#8acd63",
    patches: ["#7bc35a", "#9fda70", "#86cb61", "#acdf7b", "#71b956", "#94d46a"],
    blades: ["#5fa548", "#b5e687", "#74ba55"],
    beds: ["#cdb98a", "#dcc898"],
    edge: "#4f8f3c",
    pavers: ["#f7e9c9", "#f1dfb8", "#fbf0d8", "#ecd6ac"],
    mortar: "#c9ad80",
    curbs: ["#d9c39b", "#c8ae84"],
    plinth: ["#f2e6ce", "#c9b48e"],
    arrow: "#fff6dc",
    lip: "#7cc25a",
    earth: ["#ab7447", "#c08a5a"],
    strata: ["#a184bd", "#8f74ab", "#7f679b", "#705a8e", "#624e80", "#574472"],
    crystals: ["#7fe8ff", "#d0a8ff"],
    water: ["#2a7fe6", "#4fc4f6", "#ffffff"],
    greens: ["#4fbf5a", "#62cc5e", "#3ea85a", "#7ad35a", "#58b84e"],
    pines: 0.42,
    snow: false,
    lamp: "#ffe7a8",
    night: false,
    puffs: ["#ffe4ee", "#fff1e6", "#f3dcff", "#ffd6dc"],
    clouds: ["#ffd9e2", "#ffe6d2", "#f2d6ff", "#ffc9c4", "#fff0e0"],
    city: "night",
    terraces: 9,
  };
  return { ...d, ...(map.art ?? {}) } as Style;
}

/**
 * A board's own look (board/art/<key>.ts, its default export; art/index.ts finds it by key): the
 * landmarks of its own kinds and anything else it adds on top of the shared kit.
 */
export interface MapArt {
  key: string;
  /** Build a landmark of its own kinds: true when done (false: the shared kit builds it). */
  landmark?(d: LandmarkDef, k: Kit): boolean;
  /** Its other touches, once the shared kit has built the paths, water and landmarks (before the woods, trees and gardens fill what is left). */
  build?(k: Kit): void;
  /** Each frame, for moving bits of its own (life.ts moves the shared ones). */
  update?(dt: number, t: number): void;
}

/** What every builder gets: the batchers, the ground's bookkeeping, the board's data and look. */
export interface Kit {
  v: Vox;
  words: Words;
  ground: Ground;
  paint: Painter;
  water: Water;
  falls: Falls;
  pools: Pools;
  life: Life;
  parent: THREE.Object3D;
  mv: Moving;
  rnd: () => number;
  ink: THREE.Material;
  islandMat: THREE.Material;
  map: MapDef;
  g: Graph;
  style: Style;
  art: MapArt | null;
}

const hex2rgba = (c: string, a: number) => {
  const k = new THREE.Color(c);
  return `rgba(${Math.round(k.r * 255)},${Math.round(k.g * 255)},${Math.round(k.b * 255)},${a})`;
};
export const pick = <T>(a: readonly T[], r: number) => a[Math.floor(r * a.length) % a.length];

// ---- words -------------------------------------------------------------------------------------------

interface Word {
  s: string;
  fg: string;
  bg: string;
  neon: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  tilt: number;
  w: number;
  h: number;
}

/** Every sign's words in one canvas texture and one mesh (a quad each, facing `yaw`). */
export class Words {
  private list: Word[] = [];
  add(s: string, h: number, x: number, y: number, z: number, yaw: number, o: { fg?: string; bg?: string; w?: number; neon?: boolean; tilt?: number } = {}) {
    this.list.push({ s, fg: o.fg ?? "#ffffff", bg: o.bg ?? "", neon: !!o.neon, x, y, z, yaw, tilt: o.tilt ?? 0, w: o.w ?? h * 4, h });
  }
  get size() {
    return this.list.length;
  }
  build(parent: THREE.Object3D) {
    const n = this.list.length;
    if (!n) return null;
    const CW = 512,
      CH = 128,
      COLS = 4;
    const rows = Math.ceil(n / COLS);
    const H = THREE.MathUtils.ceilPowerOfTwo(Math.min(4096, rows * CH));
    const cells = Math.min(n, (H / CH) * COLS);
    const tex = canvasTex(CW * COLS, H, (g) => {
      for (let i = 0; i < cells; i++) {
        const it = this.list[i];
        const cw = Math.min(CW, Math.max(96, Math.round((it.w / it.h) * CH)));
        const x0 = (i % COLS) * CW,
          y0 = Math.floor(i / COLS) * CH;
        g.save();
        g.beginPath();
        g.rect(x0, y0, cw, CH);
        g.clip();
        if (it.bg) {
          g.fillStyle = it.bg;
          g.beginPath();
          g.roundRect(x0 + 4, y0 + 4, cw - 8, CH - 8, 26);
          g.fill();
        }
        g.font = `900 88px ${FONT}`;
        const fit = Math.min(88, (88 * (cw - 40)) / Math.max(1, g.measureText(it.s).width));
        g.font = `900 ${fit}px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        if (it.neon) {
          g.shadowColor = it.fg;
          g.shadowBlur = 18;
          g.fillStyle = it.fg;
          g.fillText(it.s, x0 + cw / 2, y0 + CH / 2 + 4);
          g.shadowBlur = 6;
          g.fillStyle = "#ffffff";
          g.globalAlpha = 0.75;
          g.fillText(it.s, x0 + cw / 2, y0 + CH / 2 + 4);
        } else {
          g.fillStyle = it.fg;
          g.fillText(it.s, x0 + cw / 2, y0 + CH / 2 + 5);
        }
        g.restore();
      }
    });
    const pos = new Float32Array(cells * 12);
    const uv = new Float32Array(cells * 8);
    const idx: number[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    for (let i = 0; i < cells; i++) {
      const it = this.list[i];
      const cw = Math.min(CW, Math.max(96, Math.round((it.w / it.h) * CH)));
      e.set(-it.tilt, it.yaw, 0, "YXZ");
      m.compose(p.set(it.x, it.y, it.z), q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
      const c = [
        [-it.w / 2, -it.h / 2],
        [it.w / 2, -it.h / 2],
        [it.w / 2, it.h / 2],
        [-it.w / 2, it.h / 2],
      ];
      c.forEach(([lx, ly], k) => {
        const v = new THREE.Vector3(lx, ly, 0).applyMatrix4(m);
        pos.set([v.x, v.y, v.z], i * 12 + k * 3);
      });
      const u0 = ((i % COLS) * CW) / (CW * COLS),
        u1 = ((i % COLS) * CW + cw) / (CW * COLS);
      const r = Math.floor(i / COLS);
      const v1 = 1 - (r * CH) / H,
        v0 = 1 - ((r + 1) * CH) / H;
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    mesh.raycast = () => {};
    mesh.renderOrder = 1;
    parent.add(mesh);
    this.list = [];
    return mesh;
  }
}

// ---- the painted ground -----------------------------------------------------------------------------

/** The islands' ground: one painted texture over the whole board (and every prop's soft shadow on it). */
export class Painter {
  static readonly X0 = -44;
  static readonly Z0 = -62;
  static readonly SPAN = 96;
  static readonly N = 2048;
  private shadows: [number, number, number, number, number][] = [];
  readonly mat: THREE.MeshToonMaterial;

  constructor() {
    this.mat = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonSteps() });
  }
  /** A soft shadow on the ground (radii rx × rz, a little toward the north-east, away from the sun). */
  shadow(x: number, z: number, rx: number, rz = rx, a = 0.3) {
    this.shadows.push([x, z, rx, rz, a]);
  }

  /** The islands' tops, textured (one mesh). */
  tops(islands: IslandDef[]) {
    const geos = islands.map((d) => {
      const shape = new THREE.Shape(d.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      g.translate(0, d.y ?? 0, 0);
      const p = g.attributes.position;
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        uv[i * 2] = (p.getX(i) - Painter.X0) / Painter.SPAN;
        uv[i * 2 + 1] = 1 - (p.getZ(i) - Painter.Z0) / Painter.SPAN;
      }
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      return g;
    });
    const merged = new THREE.BufferGeometry();
    let n = 0;
    for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3),
      uv = new Float32Array(n * 2);
    const idx: number[] = [];
    let o = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array as Float32Array, o * 3);
      nor.set(g.attributes.normal.array as Float32Array, o * 3);
      uv.set(g.attributes.uv.array as Float32Array, o * 2);
      const gi = g.index!;
      for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + o);
      o += g.attributes.position.count;
      g.dispose();
    }
    merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    merged.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    merged.setIndex(idx);
    const mesh = new THREE.Mesh(merged, this.mat);
    mesh.raycast = () => {};
    return mesh;
  }

  /** Paint it all (once everything has been placed and cast its shadow). */
  paint(map: MapDef, segs: [number, number, number, number, boolean][], rnd: () => number, st: Style) {
    const N = Painter.N,
      K = N / Painter.SPAN;
    const X = (x: number) => (x - Painter.X0) * K;
    const Z = (z: number) => (z - Painter.Z0) * K;
    const tex = canvasTex(N, N, (g) => {
      const poly = (pts: [number, number][]) => {
        g.beginPath();
        pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
        g.closePath();
      };
      const blob = (x: number, y: number, r: number, c: string, a: number) => {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, hex2rgba(c, a));
        gr.addColorStop(1, hex2rgba(c, 0));
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      };
      const specks = (c: string, n: number, area: () => [number, number] | null, w = 2, h = 4) => {
        g.fillStyle = c;
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const p = area();
          if (p) g.rect(p[0], p[1], w, h * (0.6 + rnd() * 0.8));
        }
        g.fill();
      };
      const anywhere = (): [number, number] => [rnd() * N, rnd() * N];
      // the grass: a base, soft patches, blades
      g.fillStyle = st.ground;
      g.fillRect(0, 0, N, N);
      const patches = st.patches;
      for (let i = 0; i < 420; i++) blob(rnd() * N, rnd() * N, (2 + rnd() * 7) * K, patches[i % patches.length], 0.5);
      specks(hex2rgba(st.blades[0], 0.55), 14000, anywhere, 2, 4);
      specks(hex2rgba(st.blades[1 % st.blades.length], 0.6), 12000, anywhere, 2, 3);
      specks(hex2rgba(st.blades[2 % st.blades.length], 0.6), 9000, anywhere, 3, 3);
      // the edges: a darker band in from each island's rim, a light lip right on it
      g.save();
      g.beginPath();
      for (const d of map.islands) d.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      g.clip();
      for (const d of map.islands) {
        poly(d.pts);
        g.lineJoin = "round";
        g.strokeStyle = hex2rgba(st.edge, 0.22);
        g.lineWidth = 5 * K;
        g.stroke();
        g.strokeStyle = hex2rgba(st.edge, 0.25);
        g.lineWidth = 2.2 * K;
        g.stroke();
        g.strokeStyle = hex2rgba(`#${new THREE.Color(st.ground).lerp(new THREE.Color("#ffffff"), 0.35).getHexString()}`, 0.9);
        g.lineWidth = 0.5 * K;
        g.stroke();
      }
      g.restore();
      // the paths' worn beds
      g.lineCap = "round";
      g.lineJoin = "round";
      for (const [w, c, a] of [
        [4.4, st.beds[0], 0.35],
        [3.3, st.beds[1], 0.75],
      ] as [number, string, number][]) {
        g.strokeStyle = hex2rgba(c, a);
        g.lineWidth = w * K;
        g.beginPath();
        for (const [ax, az, bx, bz, wood] of segs) {
          if (wood) continue;
          g.moveTo(X(ax), Z(az));
          g.lineTo(X(bx), Z(bz));
        }
        g.stroke();
      }
      specks(hex2rgba("#b9a272", 0.5), 2600, () => {
        const s = segs[Math.floor(rnd() * segs.length)];
        if (!s || s[4]) return null;
        const f = rnd();
        const off = (rnd() - 0.5) * 3.6;
        const len = Math.hypot(s[2] - s[0], s[3] - s[1]) || 1;
        return [X(s[0] + (s[2] - s[0]) * f + ((s[1] - s[3]) / len) * off), Z(s[1] + (s[3] - s[1]) * f + ((s[2] - s[0]) / len) * off)];
      }, 3, 3);
      // the floors
      const order: FloorDef["kind"][] = ["sand", "forest", "meadow", "yard", "quay", "slate", "neon", "tiles", "plaza", "square"];
      for (const kind of order) for (const f of map.floors ?? []) if (f.kind === kind) this.floor(g, f, X, Z, K, rnd, map.islands);
      // the shadows
      for (const [x, z, rx, rz, a] of this.shadows) {
        const cx = X(x + rx * 0.22),
          cy = Z(z - rz * 0.18);
        g.save();
        g.translate(cx, cy);
        g.scale(1, rz / rx);
        const r = rx * K * 1.25;
        const gr = g.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
        gr.addColorStop(0, `rgba(48,28,86,${a})`);
        gr.addColorStop(0.55, `rgba(48,28,86,${a * 0.6})`);
        gr.addColorStop(1, "rgba(48,28,86,0)");
        g.fillStyle = gr;
        g.fillRect(-r, -r, r * 2, r * 2);
        g.restore();
      }
    });
    tex.anisotropy = 8;
    this.mat.map = tex;
    this.mat.needsUpdate = true;
  }

  private floor(g: CanvasRenderingContext2D, f: FloorDef, X: (x: number) => number, Z: (z: number) => number, K: number, rnd: () => number, islands: IslandDef[]) {
    const path = () => {
      g.beginPath();
      if (f.pts) f.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      else g.arc(X(f.x ?? 0), Z(f.z ?? 0), (f.r ?? 3) * K, 0, Math.PI * 2);
      g.closePath();
    };
    const bbox = () => {
      if (f.pts) {
        const xs = f.pts.map((p) => p[0]),
          zs = f.pts.map((p) => p[1]);
        return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
      }
      const r = f.r ?? 3;
      return [(f.x ?? 0) - r, (f.z ?? 0) - r, (f.x ?? 0) + r, (f.z ?? 0) + r];
    };
    const [bx0, bz0, bx1, bz1] = bbox();
    const stones = (cell: number, cols: string[], mortar: string, jitter = 0.25, round = 0.3, brick = false) => {
      g.fillStyle = mortar;
      path();
      g.fill();
      for (let z = bz0; z < bz1; z += cell * (brick ? 0.5 : 1)) {
        const row = Math.round((z - bz0) / (cell * (brick ? 0.5 : 1)));
        for (let x = bx0 + (brick && row % 2 ? cell * 0.5 : 0); x < bx1; x += cell) {
          const w = cell * (0.86 - rnd() * jitter * 0.3),
            h = cell * (brick ? 0.42 : 0.86 - rnd() * jitter * 0.3);
          g.fillStyle = cols[Math.floor(rnd() * cols.length)];
          g.beginPath();
          g.roundRect(X(x + (rnd() - 0.5) * cell * jitter * 0.2), Z(z + (rnd() - 0.5) * cell * jitter * 0.2), w * K, h * K, round * cell * K);
          g.fill();
        }
      }
    };
    g.save();
    if (f.kind === "sand") {
      // along the coast, clipped to the land
      g.beginPath();
      for (const d of islands) d.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      g.clip();
      const line = () => {
        g.beginPath();
        f.pts!.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      };
      g.lineJoin = "round";
      g.lineCap = "round";
      const w = f.w ?? 5;
      for (const [k, c] of [
        [1.15, hex2rgba("#d9c48a", 0.55)],
        [1.0, "#f2dea4"],
        [0.55, "#f7e7b6"],
      ] as [number, string][]) {
        line();
        g.strokeStyle = c;
        g.lineWidth = w * k * K;
        g.stroke();
      }
      // ripples in the sand, shells, a starfish or two
      for (let i = 0; i < 900; i++) {
        const s = Math.floor(rnd() * (f.pts!.length - 1));
        const [ax, az] = f.pts![s],
          [bx, bz] = f.pts![s + 1];
        const t = rnd();
        const len = Math.hypot(bx - ax, bz - az) || 1;
        const off = (rnd() - 0.5) * w * 0.9;
        const x = ax + (bx - ax) * t + ((az - bz) / len) * off,
          z = az + (bz - az) * t + ((bx - ax) / len) * off;
        const k = rnd();
        g.fillStyle = k < 0.6 ? hex2rgba("#d8c085", 0.6) : k < 0.95 ? "#fff6dc" : "#ff8fa8";
        g.fillRect(X(x), Z(z), k < 0.6 ? 6 : 3, k < 0.6 ? 2 : 3);
      }
    } else if (f.kind === "forest") {
      path();
      g.clip();
      g.fillStyle = hex2rgba("#5aa34a", 0.75);
      g.fillRect(X(bx0) - 40, Z(bz0) - 40, (bx1 - bx0) * K + 80, (bz1 - bz0) * K + 80);
      for (let i = 0; i < 160; i++) {
        const x = X(bx0 + rnd() * (bx1 - bx0)),
          y = Z(bz0 + rnd() * (bz1 - bz0));
        const r = (1.5 + rnd() * 4) * K;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        const c = pick(["#4b8f42", "#68b356", "#3f8040", "#7ab85a"], rnd());
        gr.addColorStop(0, hex2rgba(c, 0.55));
        gr.addColorStop(1, hex2rgba(c, 0));
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (const [c, n] of [
        ["#3e7a3a", 5000],
        ["#a3843e", 900],
        ["#7fc25e", 2500],
      ] as [string, number][]) {
        g.fillStyle = hex2rgba(c, 0.6);
        g.beginPath();
        for (let i = 0; i < n; i++) g.rect(X(bx0 + rnd() * (bx1 - bx0)), Z(bz0 + rnd() * (bz1 - bz0)), 3, 2);
        g.fill();
      }
      // (its edge feathered into the grass)
      g.restore();
      g.save();
      path();
      g.strokeStyle = hex2rgba("#5aa34a", 0.35);
      g.lineWidth = 2.4 * K;
      g.stroke();
    } else if (f.kind === "meadow") {
      const cx = X(f.x!),
        cy = Z(f.z!),
        r = f.r! * K;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, hex2rgba("#a8e27a", 0.8));
      gr.addColorStop(1, hex2rgba("#a8e27a", 0));
      g.fillStyle = gr;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
      // stripes: a mown lawn
      g.save();
      g.beginPath();
      g.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      g.clip();
      for (let k = -12; k < 12; k++) {
        g.fillStyle = hex2rgba(k % 2 ? "#b9ea8c" : "#8fd068", 0.25);
        g.fillRect(cx + k * 1.6 * K, cy - r, 1.6 * K, r * 2);
      }
      g.restore();
      for (let i = 0; i < 70; i++) {
        const a = rnd() * Math.PI * 2,
          d = Math.sqrt(rnd()) * r;
        const fx = cx + Math.cos(a) * d,
          fy = cy + Math.sin(a) * d;
        const c = pick(["#ff6fae", "#ffd23f", "#ffffff", "#c4a3ff", "#ff8a4c"], rnd());
        for (let k = 0; k < 12; k++) {
          g.fillStyle = c;
          g.beginPath();
          g.arc(fx + (rnd() - 0.5) * 1.6 * K, fy + (rnd() - 0.5) * 1.6 * K, 2.2, 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (f.kind === "yard") {
      path();
      g.clip();
      stones(0.9, ["#7c7092", "#857a9a", "#73678a", "#8a7fa0"], "#5d5274", 0.2, 0.08, true);
      // oil stains, scorch marks
      for (let i = 0; i < 26; i++) {
        const x = X(bx0 + rnd() * (bx1 - bx0)),
          y = Z(bz0 + rnd() * (bz1 - bz0));
        const r = (0.6 + rnd() * 1.8) * K;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, "rgba(40,28,60,0.45)");
        gr.addColorStop(1, "rgba(40,28,60,0)");
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // rails across the yard
      const rail = (ax: number, az: number, bx: number, bz: number) => {
        const len = Math.hypot(bx - ax, bz - az);
        const nx = (az - bz) / len,
          nz = (bx - ax) / len;
        g.fillStyle = "#4a3c34";
        for (let t = 0; t < len; t += 0.7) {
          const x = ax + ((bx - ax) * t) / len,
            z = az + ((bz - az) * t) / len;
          g.save();
          g.translate(X(x), Z(z));
          g.rotate(Math.atan2(nz, nx));
          g.fillRect(-0.75 * K, -0.12 * K, 1.5 * K, 0.24 * K);
          g.restore();
        }
        g.strokeStyle = "#c9c2d8";
        g.lineWidth = 0.14 * K;
        for (const s of [-0.5, 0.5]) {
          g.beginPath();
          g.moveTo(X(ax + nx * s), Z(az + nz * s));
          g.lineTo(X(bx + nx * s), Z(bz + nz * s));
          g.stroke();
        }
      };
      rail(-24.6, -7, -9, -7);
      rail(-24.6, 4.4, -12, 4.4);
      // the hazard stripes round it
      g.restore();
      g.save();
      path();
      g.clip();
      path();
      g.lineWidth = 1.2 * K;
      g.strokeStyle = "#ffd23f";
      g.stroke();
      g.setLineDash([0.5 * K, 0.5 * K]);
      g.strokeStyle = "#2a2038";
      g.stroke();
      g.setLineDash([]);
    } else if (f.kind === "quay") {
      path();
      g.clip();
      stones(1.6, ["#d4cadf", "#cbc0d8", "#ddd4e6", "#c4b8d2"], "#a99cbc", 0.1, 0.04);
      path();
      g.lineWidth = 1.5 * K;
      g.strokeStyle = "#ffd23f";
      g.stroke();
      g.lineWidth = 1.0 * K;
      g.strokeStyle = "#b9adc9";
      g.stroke();
      for (let i = 0; i < 18; i++) {
        const x = X(bx0 + rnd() * (bx1 - bx0)),
          y = Z(bz0 + rnd() * (bz1 - bz0));
        const r = (0.4 + rnd()) * K;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, "rgba(70,60,100,0.3)");
        gr.addColorStop(1, "rgba(70,60,100,0)");
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    } else if (f.kind === "slate") {
      path();
      g.clip();
      stones(1.25, ["#6d6588", "#625a7d", "#78708f", "#5a5276", "#706890"], "#463f60", 0.5, 0.18);
      // cracks and a violet stain (THE TRACKER is near)
      g.strokeStyle = "rgba(30,20,50,0.6)";
      g.lineWidth = 2;
      for (let i = 0; i < 30; i++) {
        let x = X(bx0 + rnd() * (bx1 - bx0)),
          y = Z(bz0 + rnd() * (bz1 - bz0));
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) g.lineTo((x += (rnd() - 0.5) * 30), (y += (rnd() - 0.5) * 30));
        g.stroke();
      }
      const cx = X(f.x!),
        cy = Z(f.z!);
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, f.r! * K);
      gr.addColorStop(0, "rgba(150,60,220,0.25)");
      gr.addColorStop(1, "rgba(150,60,220,0)");
      g.fillStyle = gr;
      g.fillRect(cx - f.r! * K, cy - f.r! * K, f.r! * 2 * K, f.r! * 2 * K);
    } else if (f.kind === "neon") {
      path();
      g.clip();
      g.fillStyle = "#3e365e";
      g.fillRect(X(bx0) - 20, Z(bz0) - 20, (bx1 - bx0) * K + 40, (bz1 - bz0) * K + 40);
      for (let i = 0; i < 2500; i++) {
        g.fillStyle = rnd() < 0.5 ? "rgba(90,80,130,0.6)" : "rgba(40,32,70,0.6)";
        g.fillRect(X(bx0 + rnd() * (bx1 - bx0)), Z(bz0 + rnd() * (bz1 - bz0)), 3, 3);
      }
      // neon puddles of light, a crosswalk, lane dashes
      for (let i = 0; i < 14; i++) {
        const x = X(bx0 + rnd() * (bx1 - bx0)),
          y = Z(bz0 + rnd() * (bz1 - bz0));
        const r = (1.2 + rnd() * 2.4) * K;
        const c = pick(["#ff4fd8", "#3ef0ff", "#ffd23f", "#9a6bff"], rnd());
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, hex2rgba(c, 0.38));
        gr.addColorStop(1, hex2rgba(c, 0));
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      g.fillStyle = "rgba(255,255,255,0.75)";
      for (let k = 0; k < 7; k++) g.fillRect(X(-3.4 + k * 1.0), Z(-35.4), 0.55 * K, 1.6 * K);
      g.setLineDash([0.9 * K, 0.7 * K]);
      g.strokeStyle = "rgba(255,226,120,0.8)";
      g.lineWidth = 0.16 * K;
      g.beginPath();
      g.moveTo(X(-7), Z(-41.2));
      g.lineTo(X(7.5), Z(-41.2));
      g.stroke();
      g.setLineDash([]);
    } else if (f.kind === "tiles") {
      const cx = X(f.x!),
        cy = Z(f.z!),
        R = f.r!;
      for (let r = R; r > 0.6; r -= 0.9) {
        const n = Math.max(6, Math.round((Math.PI * 2 * r) / 1.1));
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2,
            a1 = ((k + 1) / n) * Math.PI * 2;
          g.fillStyle = (k + Math.round(r / 0.9)) % 2 ? "#ebe6ff" : "#cbc0f2";
          g.beginPath();
          g.arc(cx, cy, r * K, a0, a1);
          g.arc(cx, cy, Math.max(0, r - 0.86) * K, a1, a0, true);
          g.closePath();
          g.fill();
        }
      }
      g.strokeStyle = "#8f7fd0";
      g.lineWidth = 0.3 * K;
      g.beginPath();
      g.arc(cx, cy, R * K, 0, Math.PI * 2);
      g.stroke();
      // a star mosaic
      g.fillStyle = "#ffd23f";
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const r = (i % 2 ? 0.9 : 2.4) * K;
        const a = (i / 16) * Math.PI * 2;
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    } else if (f.kind === "plaza" || f.kind === "square") {
      const cx = X(f.x!),
        cy = Z(f.z!),
        R = f.r!;
      const lil = f.kind === "square";
      g.fillStyle = lil ? "#c5b9e6" : "#d2bb93";
      g.beginPath();
      g.arc(cx, cy, R * K, 0, Math.PI * 2);
      g.fill();
      const cols = lil ? ["#e6defa", "#dcd2f6", "#efe9ff", "#d4c8f0"] : ["#f6e8cc", "#efdcb8", "#f9edd6", "#e9d3ad", "#f2e2c2"];
      for (let r = R - 0.3; r > 0.4; r -= 0.58) {
        const n = Math.max(5, Math.round((Math.PI * 2 * r) / 0.66));
        const off = rnd() * Math.PI;
        for (let k = 0; k < n; k++) {
          const a = off + (k / n) * Math.PI * 2;
          g.save();
          g.translate(cx + Math.cos(a) * r * K, cy + Math.sin(a) * r * K);
          g.rotate(a + Math.PI / 2);
          g.fillStyle = cols[Math.floor(rnd() * cols.length)];
          g.beginPath();
          g.roundRect(-0.27 * K, -0.22 * K, 0.54 * K, 0.44 * K, 0.12 * K);
          g.fill();
          g.restore();
        }
      }
      // a border of darker stones
      g.strokeStyle = lil ? "#9b8cd0" : "#c49a6a";
      g.lineWidth = 0.42 * K;
      g.setLineDash([0.5 * K, 0.12 * K]);
      g.beginPath();
      g.arc(cx, cy, (R - 0.2) * K, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      if (!lil && R > 6) {
        // a mosaic in the middle: rings of orange and lilac tiles, a gold star, rays out to the stalls
        for (const [r0, r1, n] of [
          [2.3, 3.0, 18],
          [4.6, 5.0, 28],
        ] as [number, number, number][])
          for (let i = 0; i < n; i++) {
            const a0 = (i / n) * Math.PI * 2 + 0.02,
              a1 = ((i + 1) / n) * Math.PI * 2 - 0.02;
            g.fillStyle = i % 2 ? "#ff8a4c" : "#b9a0f0";
            g.beginPath();
            g.arc(cx, cy, r1 * K, a0, a1);
            g.arc(cx, cy, r0 * K, a1, a0, true);
            g.closePath();
            g.fill();
          }
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.strokeStyle = "rgba(200,150,100,0.55)";
          g.lineWidth = 0.18 * K;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * 3.2 * K, cy + Math.sin(a) * 3.2 * K);
          g.lineTo(cx + Math.cos(a) * 4.4 * K, cy + Math.sin(a) * 4.4 * K);
          g.stroke();
        }
        g.fillStyle = "#ffd23f";
        g.strokeStyle = "#c4842a";
        g.lineWidth = 0.12 * K;
        g.beginPath();
        for (let i = 0; i < 16; i++) {
          const r = (i % 2 ? 0.8 : 2.0) * K;
          const a = (i / 16) * Math.PI * 2;
          g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        g.stroke();
      }
    }
    g.restore();
  }
}

// ---- water ---------------------------------------------------------------------------------------------

const WATER_V = /* glsl */ `
attribute float aEdge;
uniform float uTime;
varying float vEdge;
varying vec2 vXZ;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float k = smoothstep(0.0, 1.6, aEdge);
  p.y += (sin(p.x * 0.8 + uTime * 1.5) * 0.06 + sin(p.z * 1.1 - uTime * 1.2) * 0.05) * k;
  vEdge = aEdge;
  vXZ = p.xz;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_F = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
varying float vEdge;
varying vec2 vXZ;
#include <fog_pars_fragment>
void main() {
  vec2 q = vXZ;
  float r = sin(q.x * 0.55 + sin(q.y * 0.42 + uTime * 0.5) * 1.6 + uTime * 0.7) * sin(q.y * 0.75 - uTime * 0.45 + sin(q.x * 0.33) * 1.3);
  vec3 c = mix(uShallow, uDeep, smoothstep(0.4, 5.0, vEdge));
  c = mix(c, c * 1.16 + vec3(0.03, 0.05, 0.06), step(0.45, r) * 0.7);
  c = mix(c, c * 0.88, step(r, -0.62) * 0.6);
  float sp = sin(q.x * 2.1 + uTime * 1.9 + sin(q.y * 1.6) * 2.2) * sin(q.y * 1.9 - uTime * 1.1 + q.x * 0.4);
  c = mix(c, vec3(1.0), step(0.9, sp) * 0.65);
  float w = vEdge + sin(q.x * 1.7 + q.y * 1.3 + uTime * 2.2) * 0.12;
  float foam = 1.0 - smoothstep(0.28, 0.55, w);
  float ring = step(0.7, sin(vEdge * 5.0 - uTime * 2.6)) * (1.0 - smoothstep(0.6, 1.7, vEdge));
  c = mix(c, uFoam, max(foam, ring * 0.85));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Every body of water of the board in one mesh: grid cells, each vertex knowing how far its shore is. */
export class Water {
  private pos: number[] = [];
  private edge: number[] = [];
  private idx: number[] = [];
  readonly mat: THREE.ShaderMaterial;
  constructor(st: Style) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uDeep: { value: new THREE.Color(st.water[0]) }, uShallow: { value: new THREE.Color(st.water[1]) }, uFoam: { value: new THREE.Color(st.water[2]) } }]),
      vertexShader: WATER_V,
      fragmentShader: WATER_F,
      fog: true,
    });
  }
  /** Cells of `cell` metres where `inWater` says so, at height y; `shore(x, z)` the distance to the nearest shore. */
  private grid(x0: number, z0: number, x1: number, z1: number, cell: number, y: number, inWater: (x: number, z: number) => boolean, shore: (x: number, z: number) => number) {
    const nx = Math.ceil((x1 - x0) / cell),
      nz = Math.ceil((z1 - z0) / cell);
    const at = new Map<number, number>();
    const vert = (i: number, j: number) => {
      const k = i * (nz + 1) + j;
      let v = at.get(k);
      if (v === undefined) {
        const x = x0 + i * cell,
          z = z0 + j * cell;
        v = this.pos.length / 3;
        this.pos.push(x, y, z);
        this.edge.push(Math.max(0, shore(x, z)));
        at.set(k, v);
      }
      return v;
    };
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const cx = x0 + (i + 0.5) * cell,
          cz = z0 + (j + 0.5) * cell;
        if (!inWater(cx, cz)) continue;
        const a = vert(i, j),
          b = vert(i + 1, j),
          c = vert(i + 1, j + 1),
          d = vert(i, j + 1);
        this.idx.push(a, c, b, a, d, c);
      }
  }
  /** A basin outline, minus the islands over it (foam along their cliffs and round `piles`). */
  basin(pts: [number, number][], y: number, islands: IslandDef[], piles: [number, number, number][]) {
    const xs = pts.map((p) => p[0]),
      zs = pts.map((p) => p[1]);
    const edges: [number, number, number, number][] = [];
    for (const d of [pts, ...islands.map((i) => i.pts)]) for (let i = 0; i < d.length; i++) edges.push([...d[i], ...d[(i + 1) % d.length]] as [number, number, number, number]);
    const segD = (x: number, z: number, [ax, az, bx, bz]: [number, number, number, number]) => {
      const vx = bx - ax,
        vz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
      return Math.hypot(x - ax - vx * t, z - az - vz * t);
    };
    this.grid(
      Math.min(...xs),
      Math.min(...zs),
      Math.max(...xs),
      Math.max(...zs),
      0.8,
      y,
      (x, z) => inside(pts, x, z) && !islands.some((i) => inside(i.pts, x - 0.9, z) && inside(i.pts, x + 0.9, z) && inside(i.pts, x, z - 0.9) && inside(i.pts, x, z + 0.9)),
      (x, z) => {
        let d = 1e9;
        for (const e of edges) d = Math.min(d, segD(x, z, e));
        for (const [px, pz, r] of piles) d = Math.min(d, Math.hypot(x - px, z - pz) - r);
        return islands.some((i) => inside(i.pts, x, z)) ? 0 : d;
      },
    );
  }
  /** A round pond. */
  disc(x: number, z: number, r: number, y: number) {
    this.grid(x - r, z - r, x + r, z + r, Math.max(0.3, r / 8), y, (px, pz) => Math.hypot(px - x, pz - z) < r, (px, pz) => r - Math.hypot(px - x, pz - z));
  }
  /** A straight stream, `w` wide. */
  strip(ax: number, az: number, bx: number, bz: number, w: number, y: number) {
    const len = Math.hypot(bx - ax, bz - az);
    const vx = (bx - ax) / len,
      vz = (bz - az) / len;
    this.grid(Math.min(ax, bx) - w, Math.min(az, bz) - w, Math.max(ax, bx) + w, Math.max(az, bz) + w, 0.35, y, (x, z) => {
      const t = (x - ax) * vx + (z - az) * vz;
      const d = Math.abs((x - ax) * vz - (z - az) * vx);
      return t > -0.2 && t < len + 0.2 && d < w / 2;
    }, (x, z) => w / 2 - Math.abs((x - ax) * vz - (z - az) * vx) + 0.25);
  }
  build(parent: THREE.Object3D) {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("aEdge", new THREE.Float32BufferAttribute(this.edge, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.mat);
    m.raycast = () => {};
    parent.add(m);
    return m;
  }
}

// ---- waterfalls ----------------------------------------------------------------------------------------

/** Every waterfall in one mesh (a flaring sheet over a lip, fading into the clouds), its texture scrolling. */
export class Falls {
  private pos: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  readonly tex: THREE.Texture;
  constructor() {
    this.tex = canvasTex(
      64,
      256,
      (g) => {
        g.fillStyle = "#cdeeff";
        g.fillRect(0, 0, 64, 256);
        for (let k = 0; k < 70; k++) {
          g.fillStyle = k % 3 ? "rgba(255,255,255,0.8)" : "rgba(110,185,255,0.55)";
          g.fillRect(Math.floor(Math.random() * 62), Math.floor(Math.random() * 256), 2 + Math.floor(Math.random() * 4), 14 + Math.floor(Math.random() * 40));
        }
      },
      true,
    );
  }
  /** A fall over the edge at (x, z), facing out along yaw, `w` wide, from y `top` down `h`. */
  add(x: number, z: number, yaw: number, w: number, top: number, h: number) {
    const n = 12;
    const ox = Math.sin(yaw),
      oz = Math.cos(yaw);
    const sx = Math.cos(yaw),
      sz = -Math.sin(yaw);
    const base = this.pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const out = 0.3 + Math.sqrt(f) * 2.2;
      const y = top - f * f * 0.15 * h - f * h * 0.85;
      const ww = (w / 2) * (1 + f * 0.7);
      const a = f < 0.08 ? 1 : 1 - Math.pow((f - 0.08) / 0.92, 1.4);
      for (const s of [-1, 1]) {
        this.pos.push(x + ox * out + sx * ww * s, y, z + oz * out + sz * ww * s);
        this.uv.push(s < 0 ? 0 : 1, (f * h) / 7);
        this.col.push(1, 1, 1, Math.max(0, a));
      }
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  build(parent: THREE.Object3D) {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.raycast = () => {};
    parent.add(m);
    return m;
  }
}

// ---- glow pools ----------------------------------------------------------------------------------------

/** Soft additive pools of light on the ground (one draw). */
export class Pools {
  private list: { x: number; y: number; z: number; r: number; c: THREE.Color }[] = [];
  add(x: number, z: number, r: number, c: string, y = 0.05, k = 1) {
    this.list.push({ x, y, z, r, c: new THREE.Color(c).multiplyScalar(k) });
  }
  build(parent: THREE.Object3D) {
    if (!this.list.length) return null;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }), this.list.length);
    const mx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3(),
      s = new THREE.Vector3();
    this.list.forEach((it, i) => {
      m.setMatrixAt(i, mx.compose(p.set(it.x, it.y, it.z), q, s.set(it.r * 2, 1, it.r * 2)));
      m.setColorAt(i, it.c);
    });
    m.computeBoundingSphere();
    m.raycast = () => {};
    m.renderOrder = 2;
    parent.add(m);
    return m;
  }
}

// ---- the sky -------------------------------------------------------------------------------------------

/** A dome round the board: the sunset's bands, a glow round the sun, the first stars overhead. */
export function skyDome(sunDir: THREE.Vector3, st: Style) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(st.dome[0]) },
      uMid: { value: new THREE.Color(st.dome[1]) },
      uLow: { value: new THREE.Color(st.dome[2]) },
      uHor: { value: new THREE.Color(st.dome[3]) },
      uStars: { value: st.stars },
      uSun: { value: new THREE.Color("#fff0c8") },
      uSunDir: { value: sunDir.clone().normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uLow, uHor, uSun, uSunDir;
      uniform float uStars;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(uHor, uLow, smoothstep(-0.02, 0.1, h));
        c = mix(c, uMid, smoothstep(0.08, 0.32, h));
        c = mix(c, uTop, smoothstep(0.3, 0.75, h));
        c = mix(c, uLow * 0.9 + uHor * 0.1, smoothstep(0.0, -0.25, h));
        float s = max(0.0, dot(d, uSunDir));
        c += uSun * (pow(s, 6.0) * 0.35 + pow(s, 40.0) * 0.6);
        vec3 cell = floor(d * 260.0);
        float st = step(1.0 - 0.0025 * uStars, hash(cell)) * smoothstep(0.32, 0.7, h);
        c += vec3(st) * (0.6 + 0.4 * hash(cell + 3.1));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(760, 40, 20), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  m.raycast = () => {};
  return m;
}

/** Big soft clouds high over the board, warm with the sunset (one draw; life turns them slowly). */
export function highClouds(rnd: () => number, tints: string[]) {
  const n = 34,
    per = 4;
  const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 2), new THREE.MeshBasicMaterial({ color: "#ffffff" }), n * per);
  const mx = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    p = new THREE.Vector3(),
    sc = new THREE.Vector3(),
    c = new THREE.Color();
  let i = 0;
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2,
      d = 120 + rnd() * 220;
    const cx = Math.cos(a) * d,
      cz = Math.sin(a) * d - 20,
      cy = 34 + rnd() * 46;
    const s = 10 + rnd() * 14;
    const tint = tints[k % tints.length];
    for (let j = 0; j < per; j++) {
      p.set(cx + (j - 1.5) * s * 0.7 + (rnd() - 0.5) * s * 0.3, cy + (rnd() - 0.3) * s * 0.25, cz + (rnd() - 0.5) * s * 0.5);
      sc.set(s * (1.1 + rnd() * 0.6), s * (0.45 + rnd() * 0.25), s * (0.8 + rnd() * 0.4));
      m.setMatrixAt(i, mx.compose(p, q, sc));
      m.setColorAt(i, c.set(tint).lerp(new THREE.Color("#ffffff"), j === 1 ? 0.4 : 0));
      i++;
    }
  }
  m.computeBoundingSphere();
  m.frustumCulled = false;
  m.raycast = () => {};
  return m;
}

// ---- cliffs --------------------------------------------------------------------------------------------


/**
 * The islands' undersides dressed: along every outer edge a continuous grass lip, a band of earth
 * and strata of rock stepping in as the island tapers; chunks jut out of them at random (grass
 * bumps, earth, ledges), roots and vines hang, crystals glint, stalactites at the bottom.
 */
export function cliffs(v: Vox, islands: IslandDef[], rnd: () => number, st: Style) {
  const ROCK = st.strata;
  const tint = (c: string, k: number) => `#${new THREE.Color(c).multiplyScalar(k).getHexString()}`;
  const lips = [st.lip, tint(st.lip, 1.08), tint(st.lip, 0.92)];
  const earths = [st.earth[0], st.earth[1], tint(st.earth[0], 0.9)];
  islands.forEach((d, k) => {
    const y0 = d.y ?? 0;
    let cx = 0,
      cz = 0;
    for (const p of d.pts) ((cx += p[0]), (cz += p[1]));
    cx /= d.pts.length;
    cz /= d.pts.length;
    const others = islands.filter((_, m) => m !== k);
    const H = (d.depth / 5) * 0.92;
    for (let i = 0; i < d.pts.length; i++) {
      const [ax, az] = d.pts[i];
      const [bx, bz] = d.pts[(i + 1) % d.pts.length];
      const len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(bx - ax, bz - az);
      let nx = Math.cos(yaw),
        nz = -Math.sin(yaw);
      if (inside(d.pts, (ax + bx) / 2 + nx * 0.6, (az + bz) / 2 + nz * 0.6)) ((nx = -nx), (nz = -nz));
      // (pieces are framed facing out: their x along the edge, their z outward)
      const fy = Math.atan2(nx, nz);
      // the outer stretches of this edge (not where another island joins on)
      const n = Math.max(2, Math.round(len / 1.0));
      const outer: boolean[] = [];
      for (let j = 0; j < n; j++) {
        const f = (j + 0.5) / n;
        outer.push(!others.some((o) => inside(o.pts, ax + (bx - ax) * f + nx * 1.4, az + (bz - az) * f + nz * 1.4)));
      }
      for (let j0 = 0; j0 < n; ) {
        if (!outer[j0]) {
          j0++;
          continue;
        }
        let j1 = j0;
        while (j1 + 1 < n && outer[j1 + 1]) j1++;
        const f0 = j0 / n,
          f1 = (j1 + 1) / n;
        const L = (f1 - f0) * len;
        const fm = (f0 + f1) / 2;
        const mx = ax + (bx - ax) * fm,
          mz = az + (bz - az) * fm;
        // the bands
        v.frame(mx + nx * 0.16, 0, mz + nz * 0.16, fy);
        v.box(st.lip, L + 0.5, 0.42, 0.95, 0, y0 - 0.2, 0, { ink: 0.035 });
        v.frame(mx + nx * 0.26, 0, mz + nz * 0.26, fy);
        v.box(st.earth[0], L + 0.3, 1.7, 0.9, 0, y0 - 1.25, 0, { ink: 0.035 });
        v.box(st.earth[1], L + 0.32, 0.16, 0.92, 0, y0 - 0.62, 0);
        let top = y0 - 2.1;
        for (let t = 0; t < 5; t++) {
          const kk = 0.93 - t * 0.17;
          const px = cx + (mx - cx) * kk + nx * 0.4,
            pz = cz + (mz - cz) * kk + nz * 0.4;
          v.frame(px, 0, pz, fy);
          v.box(ROCK[t], L * kk + 0.6, H * 0.94, 1.2, 0, top - H * 0.47, 0, { ink: t < 3 ? 0.035 : 0 });
          if (t < 3) v.box(tint(ROCK[t], 1.15), L * kk + 0.62, 0.14, 1.22, 0, top - H * 0.08, 0);
          top -= H;
        }
        // the chunks along it
        for (let j = j0; j <= j1; j++) {
          const f = (j + 0.5) / n;
          const x = ax + (bx - ax) * f,
            z = az + (bz - az) * f;
          const r = rnd();
          v.frame(x, 0, z, fy + (rnd() - 0.5) * 0.4);
          if (r < 0.35) v.box(pick(lips, rnd()), 0.6 + rnd() * 0.9, 0.3 + rnd() * 0.35, 0.5, 0, y0 - 0.1 + rnd() * 0.1, 0.55 + rnd() * 0.15, { ink: 0.025 });
          else if (r < 0.6) v.box(pick(earths, rnd()), 0.5 + rnd() * 0.9, 0.5 + rnd() * 1.0, 0.5, 0, y0 - 0.8 - rnd() * 0.9, 0.62, { ink: 0.025 });
          if (rnd() < 0.5) v.box(pick(lips, rnd()), 0.22 + rnd() * 0.2, 0.3 + rnd() * 0.7, 0.2, (rnd() - 0.5) * 0.8, y0 - 0.55, 0.62);
          if (rnd() < 0.18) v.box(st.snow ? "#e6f2ff" : tint(st.lip, 0.66), 0.09, 1.4 + rnd() * 3.4, 0.09, (rnd() - 0.5) * 0.8, y0 - 1.6 - rnd(), 0.72);
          if (rnd() < 0.06) v.add("orb", pick(FLOWERS, rnd()), 0.22, 0.22, 0.22, (rnd() - 0.5) * 0.8, y0 - 0.3, 0.7);
          // rock chunks jutting from the strata, crystals, stalactites
          let tt = y0 - 2.1;
          for (let t = 0; t < 5; t++) {
            const kk = 0.93 - t * 0.17;
            if (rnd() < 0.42 - t * 0.04) {
              const px = cx + (x - cx) * kk + nx * (0.75 + rnd() * 0.45),
                pz = cz + (z - cz) * kk + nz * (0.75 + rnd() * 0.45);
              v.frame(px, 0, pz, fy + (rnd() - 0.5) * 0.5);
              const ch = H * (0.25 + rnd() * 0.6);
              v.box(rnd() < 0.12 ? st.earth[1] : ROCK[Math.min(ROCK.length - 1, t + (rnd() < 0.4 ? 1 : 0))], 0.7 + rnd() * 1.4, ch, 0.8 + rnd() * 0.5, 0, tt - rnd() * (H - ch) - ch / 2, 0, { ink: t < 3 ? 0.03 : 0 });
            }
            if (rnd() < 0.045) {
              const px = cx + (x - cx) * kk + nx * 1.0,
                pz = cz + (z - cz) * kk + nz * 1.0;
              v.frame(px, 0, pz, fy);
              const cc = rnd() < 0.5 ? st.crystals[0] : st.crystals[1];
              v.cyl(cc, 0.22, 1.1 + rnd(), 0.2, tt - H * 0.5, 0.1, { glow: true, rx: 0.7 + rnd() * 0.4, rz: (rnd() - 0.5) * 0.6 }, "hex");
              v.cyl(cc, 0.14, 0.7, -0.25, tt - H * 0.6, 0.05, { glow: true, rx: 0.9, rz: 0.5 }, "hex");
            }
            tt -= H;
          }
          if (j % 2 === 0 && rnd() < 0.55) {
            const kk = 0.93 - 4 * 0.17;
            const px = cx + (x - cx) * kk + nx * 0.5,
              pz = cz + (z - cz) * kk + nz * 0.5;
            v.frame(px, 0, pz, 0);
            v.add("cone6", ROCK[ROCK.length - 1], 0.9 + rnd() * 0.8, 1.6 + rnd() * 2.8, 0.9 + rnd() * 0.8, 0, tt - 0.6, 0, { rx: Math.PI });
          }
        }
        j0 = j1 + 1;
      }
    }
  });
}

// ---- the built road ------------------------------------------------------------------------------------

const roadTexs = new Map<string, THREE.Texture>();
/** The pavers' texture in a style's colours (made once per palette, kept). */
function roadTex(st: Style) {
  const key = st.mortar + st.pavers.join();
  let t = roadTexs.get(key);
  if (t) return t;
  t = canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = st.mortar;
      g.fillRect(0, 0, 128, 128);
      const cols = st.pavers;
      for (let r = 0; r < 4; r++)
        for (let c = -1; c < 3; c++) {
          const x = c * 64 + (r % 2 ? 32 : 0);
          g.fillStyle = cols[(r * 3 + c + 4) % cols.length];
          g.beginPath();
          g.roundRect(x + 3, r * 32 + 3, 58, 26, 7);
          g.fill();
          g.fillStyle = "rgba(255,255,255,0.35)";
          g.fillRect(x + 7, r * 32 + 6, 30, 4);
        }
    },
    true,
  );
  t.userData = { shared: true };
  roadTexs.set(key, t);
  return t;
}

/** The built path: paved, edged, arrowed; boardwalks on the pier; signposts at the junctions. */
export function roads(k: Kit) {
  const { v, g, ground, words } = k;
  const W = 1.9;
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], uvs: number[]) => {
    const o = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) nor.push(...n);
    uv.push(...uvs);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  const TOP = 0.14;
  for (const sp of g.spaces)
    for (const e of sp.next) {
      if (e.zip) continue;
      const b = g.spaces[e.to];
      if (sp.bridge && b.bridge) continue;
      // (NU7 QUARTER's ice run on the frozen canal: its art module draws the lane)
      if (sp.ice || b.ice) continue;
      const dx = b.x - sp.x,
        dz = b.z - sp.z;
      const len = Math.hypot(dx, dz);
      const ux = dx / len,
        uz = dz / len;
      const px = uz,
        pz = -ux;
      const yaw = Math.atan2(dx, dz);
      const wood = sp.pier || b.pier;
      if (wood) {
        // a boardwalk: planks across, beams under, rope rails on posts, a lantern now and then
        for (let t = 0.2; t < len; t += 0.46) {
          const x = sp.x + ux * t,
            z = sp.z + uz * t;
          v.frame(x, 0, z, yaw);
          v.box(Math.floor(t / 0.46) % 3 ? "#b98250" : "#a8713f", 2.05, 0.12, 0.4, 0, -0.02, 0);
        }
        v.frame(sp.x + ux * len * 0.5, 0, sp.z + uz * len * 0.5, yaw);
        for (const s of [-1, 1]) v.box("#7a4a2b", 0.22, 0.22, len, s * 0.85, -0.18, 0, { ink: 0.025 });
        for (let t = 1.1; t < len - 0.9; t += 1.4) {
          const x = sp.x + ux * t,
            z = sp.z + uz * t;
          for (const s of [-1, 1]) {
            v.frame(x + px * s * 1.08, 0, z + pz * s * 1.08, yaw);
            v.box("#6b3f24", 0.16, 0.9, 0.16, 0, 0.35, 0, { ink: 0.02 });
          }
        }
        for (const s of [-1, 1]) {
          v.frame(sp.x + ux * len * 0.5 + px * s * 1.08, 0, sp.z + uz * len * 0.5 + pz * s * 1.08, yaw);
          v.box("#e9d3a4", 0.06, 0.06, len - 1.4, 0, 0.72, 0);
        }
        if (sp.i % 2 === 0) {
          const s = sp.i % 4 ? 1 : -1;
          const x = sp.x + ux * len * 0.5 + px * s * 1.12,
            z = sp.z + uz * len * 0.5 + pz * s * 1.12;
          v.frame(x, 0, z, yaw);
          v.box("#3a2f5c", 0.12, 1.5, 0.12, 0, 0.75, 0);
          v.box("#3a2f5c", 0.36, 0.08, 0.36, 0, 1.55, 0);
          v.box("#ffd98a", 0.26, 0.32, 0.26, 0, 1.36, 0, { glow: true });
          k.pools.add(x, z, 1.6, "#ffb45a", 0.06, 0.55);
        }
        continue;
      }
      // the paved ribbon (to the drawbridge's hinge only: its leaf carries the rest)
      const a = [sp.x, sp.z],
        bb = [b.x, b.z];
      const db = k.map.drawbridge;
      if ((sp.bridge || b.bridge) && db) {
        const land = sp.bridge ? a : bb;
        const hz = Math.abs(land[1] - db.z0) < Math.abs(land[1] - db.z1) ? db.z0 : db.z1;
        (sp.bridge ? a : bb)[1] = hz;
        (sp.bridge ? a : bb)[0] = db.x;
      }
      const L = [a[0] + px * (W / 2), a[1] + pz * (W / 2)],
        R = [a[0] - px * (W / 2), a[1] - pz * (W / 2)];
      const L2 = [bb[0] + px * (W / 2), bb[1] + pz * (W / 2)],
        R2 = [bb[0] - px * (W / 2), bb[1] - pz * (W / 2)];
      const rl = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
      const vv = rl / W;
      quad([R[0], TOP, R[1]], [L[0], TOP, L[1]], [L2[0], TOP, L2[1]], [R2[0], TOP, R2[1]], [0, 1, 0], [0, 0, 1, 0, 1, vv, 0, vv]);
      quad([L[0], TOP, L[1]], [L[0], 0, L[1]], [L2[0], 0, L2[1]], [L2[0], TOP, L2[1]], [px, 0, pz], [0, 0, 0.1, 0, 0.1, vv, 0, vv]);
      quad([R2[0], TOP, R2[1]], [R2[0], 0, R2[1]], [R[0], 0, R[1]], [R[0], TOP, R[1]], [-px, 0, -pz], [0, 0, 0.1, 0, 0.1, vv, 0, vv]);
      // the curbs, either side, clear of the spaces' plinths
      const c0 = sp.bridge ? len - rl + 0.05 : 1.45,
        c1 = b.bridge ? rl - 0.05 : len - 1.45;
      let n = 0;
      for (let t = c0; t < c1 - 0.3; t += 0.68) {
        const tl = Math.min(0.62, c1 - t);
        for (const s of [-1, 1]) {
          const x = sp.x + ux * (t + tl / 2) + px * s * (W / 2 + 0.13),
            z = sp.z + uz * (t + tl / 2) + pz * s * (W / 2 + 0.13);
          v.frame(x, 0, z, yaw);
          v.box(k.style.curbs[n % 2], 0.26, 0.26, tl, 0, 0.13, 0, { ink: 0.022 });
        }
        n++;
      }
      // tufts and the odd flower along the edges (not on the paved floors, not on sand)
      for (let t = 1.6; t < len - 1.6; t += 0.85) {
        for (const sd of [-1, 1]) {
          if (k.rnd() < 0.45) continue;
          const off = W / 2 + 0.42 + k.rnd() * 0.5;
          const x = sp.x + ux * t + px * sd * off,
            z = sp.z + uz * t + pz * sd * off;
          if (onPaved(k.map, x, z) || !ground.land(x, z, 0.3) || ground.onPath(x, z, -0.4)) continue;
          v.frame(x, 0, z, k.rnd() * 3);
          const c = pick(k.style.blades, k.rnd());
          v.add("cone6", c, 0.24, 0.4, 0.24, -0.08, 0.17, 0, { rz: 0.3 });
          v.add("cone6", c, 0.2, 0.32, 0.2, 0.1, 0.14, 0.06, { rz: -0.35 });
          if (k.rnd() < 0.22) v.add("orb", pick(FLOWERS, k.rnd()), 0.15, 0.15, 0.15, 0.02, 0.36, 0);
        }
      }
      // an arrow on the way (toward the next space)
      if (len > 2.4 && !sp.bridge && !b.bridge) {
        v.frame(sp.x + ux * len * 0.5, 0, sp.z + uz * len * 0.5, yaw);
        v.box(k.style.arrow, 0.13, 0.04, 0.46, -0.15, TOP + 0.02, 0, { ry: 0.72 });
        v.box(k.style.arrow, 0.13, 0.04, 0.46, 0.15, TOP + 0.02, 0, { ry: -0.72 });
      }
    }
  // the spaces' plinths (not on the drawbridge's leaves or the pier: they have their own)
  for (const sp of g.spaces) {
    if (sp.bridge || sp.pier || sp.ice) continue;
    v.frame(sp.x, 0, sp.z, 0);
    v.cyl(k.style.plinth[1], 1.66, 0.08, 0, 0.04, 0, {}, "hex");
    v.cyl(k.style.plinth[0], 1.5, 0.22, 0, 0.11, 0, { ink: 0.035 }, "hex");
  }
  // signposts at the junctions: a board pointing down each way, its name on it
  for (const sp of g.spaces) {
    if (sp.next.length < 2) continue;
    const dirs = [...sp.next.map((e) => Math.atan2(g.spaces[e.to].x - sp.x, g.spaces[e.to].z - sp.z)), ...sp.prev.map((p) => Math.atan2(g.spaces[p].x - sp.x, g.spaces[p].z - sp.z))];
    // (the side clear of every way in or out, the north preferred: the camera looks from the south)
    let best = Math.PI,
      bestS = -1e9;
    for (let a = 0; a < 16; a++) {
      const yy = (a / 16) * Math.PI * 2;
      let m = 9;
      for (const d of dirs) m = Math.min(m, Math.abs(Math.atan2(Math.sin(yy - d), Math.cos(yy - d))));
      const sc = m - Math.max(0, Math.cos(yy)) * 0.9;
      if (sc > bestS) ((bestS = sc), (best = yy));
    }
    const x = sp.x + Math.sin(best) * 2.05,
      z = sp.z + Math.cos(best) * 2.05;
    ground.take(x, z, 0.8);
    v.frame(x, 0, z, 0);
    v.box("#7a4a2b", 0.2, 3.0, 0.2, 0, 1.5, 0, { ink: 0.03 });
    v.cone("#ff6b35", 0.22, 0.3, 0, 3.12, 0, { ink: 0.02 });
    sp.next.forEach((e, i) => {
      const to = g.spaces[e.to];
      const yaw = Math.atan2(to.x - sp.x, to.z - sp.z);
      const name = e.zip ? (["ZIPLINE", "滑索"] as [string, string]) : (k.map.paths.find((p) => p.id === to.path)?.name ?? (["THIS WAY", "这边"] as [string, string]));
      const y = 2.5 - i * 0.62;
      const bc = e.toll ? "#ff3d56" : e.gate ? "#7b5cff" : e.zip ? "#ff6b35" : i % 2 ? "#3ec6ff" : "#ffd23f";
      // the board: along its way, its tip pointing out
      const bx = x + Math.sin(yaw) * 0.72,
        bz = z + Math.cos(yaw) * 0.72;
      v.frame(bx, 0, bz, yaw);
      v.box(bc, 0.1, 0.46, 1.25, 0, y, 0, { ink: 0.03 });
      v.box(bc, 0.1, 0.33, 0.33, 0, y, 0.68, { rx: Math.PI / 4, ink: 0.03 });
      const label = T(...name) + (e.toll ? ` · ${e.toll}` : "");
      for (const s of [-1, 1]) words.add(label, 0.3, bx + Math.cos(yaw) * 0.065 * s, y, bz - Math.sin(yaw) * 0.065 * s, yaw + (s * Math.PI) / 2, { fg: "#1a1033", w: 1.15 });
    });
  }
  // into the scene
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const road = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: roadTex(k.style), gradientMap: toonSteps() }));
  road.raycast = () => {};
  k.parent.add(road);
}

/** Is (x, z) on one of the board's paved or sandy floors (no grass grows there)? */
export function onPaved(map: MapDef, x: number, z: number) {
  for (const f of map.floors ?? []) {
    if (f.kind === "meadow" || f.kind === "forest") continue;
    if (f.kind === "sand") {
      const w = (f.w ?? 5) / 2;
      const p = f.pts ?? [];
      for (let i = 0; i + 1 < p.length; i++) {
        const [ax, az] = p[i],
          [bx, bz] = p[i + 1];
        const vx = bx - ax,
          vz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
        if (Math.hypot(x - ax - vx * t, z - az - vz * t) < w) return true;
      }
      continue;
    }
    if (f.pts ? inside(f.pts, x, z) : Math.hypot(x - (f.x ?? 0), z - (f.z ?? 0)) < (f.r ?? 0)) return true;
  }
  return false;
}

// ---- the zones -----------------------------------------------------------------------------------------

export const WOOD = "#a8693e";
export const WOOD_D = "#7a4a2b";
export const DARK = "#3a2f5c";
export const GREENS = ["#4fbf5a", "#62cc5e", "#3ea85a", "#7ad35a", "#58b84e"];
export const FLOWERS = ["#ff5fa2", "#ffd23f", "#ffffff", "#c4b1fc", "#ff8a4c", "#ff3d56"];

/** A tree of the right size for where it stands (or nothing, or a bush, when only something low fits). */
export function tree(k: Kit, x: number, z: number, kind: "pine" | "round" | "voxel" | "palm" | "any" = "any", s0 = 1) {
  const { v, rnd, ground, paint } = k;
  const room = ground.maxH(x, z, 1.0);
  let s = (0.85 + rnd() * 0.65) * s0;
  const tall = kind === "pine" ? 3.6 : kind === "palm" ? 4.2 : 3.0;
  const st = k.style;
  if (room < tall * s) s = room / tall;
  if (s < 0.45) {
    // only a bush fits
    if (room < 0.5) return false;
    v.frame(x, 0, z, rnd() * 3);
    v.add("orb", pick(st.greens, rnd()), 1.2, 0.8, 1.1, 0, 0.32, 0, { ink: 0.03 });
    if (st.snow) v.add("orb", "#f4f8ff", 1.0, 0.36, 0.9, 0, 0.62, 0);
    paint.shadow(x, z, 0.8, 0.8, 0.25);
    return true;
  }
  const c = pick(st.greens, rnd());
  v.frame(x, 0, z, rnd() * Math.PI);
  const kk = kind === "any" ? (rnd() < st.pines ? "pine" : rnd() < 0.55 ? "round" : "voxel") : kind;
  if (kk === "pine") {
    v.box(WOOD_D, 0.3 * s, 0.9 * s, 0.3 * s, 0, 0.45 * s, 0);
    v.add("cone6", c, 2.1 * s, 1.5 * s, 2.1 * s, 0, 1.4 * s, 0, { ink: 0.04 });
    v.add("cone6", c, 1.6 * s, 1.3 * s, 1.6 * s, 0, 2.2 * s, 0, { ink: 0.04, ry: 0.5 });
    v.add("cone6", c, 1.05 * s, 1.1 * s, 1.05 * s, 0, 2.95 * s, 0, { ink: 0.04 });
    v.add("orb", "#ffffff", 0.36 * s, 0.14 * s, 0.36 * s, 0, 3.45 * s, 0);
    if (st.snow) for (let i = 0; i < 3; i++) v.add("cone6", "#f4f8ff", (1.75 - i * 0.5) * s, 0.42 * s, (1.75 - i * 0.5) * s, 0, (1.85 + i * 0.78) * s, 0, { ry: i * 0.5 });
  } else if (kk === "round") {
    v.box(WOOD_D, 0.32 * s, 1.2 * s, 0.32 * s, 0, 0.6 * s, 0);
    v.add("orb", c, 1.9 * s, 1.7 * s, 1.9 * s, 0, 1.75 * s, 0, { ink: 0.045 });
    v.add("orb", c, 1.1 * s, 1.0 * s, 1.1 * s, 0.55 * s, 2.35 * s, 0.3 * s, { ink: 0.035 });
    if (st.snow) v.add("orb", "#f4f8ff", 1.5 * s, 0.6 * s, 1.5 * s, 0, 2.45 * s, 0);
    if (rnd() < 0.35) for (let f = 0; f < 4; f++) v.add("orb", rnd() < 0.5 ? "#ff5f6e" : "#ffd23f", 0.22, 0.22, 0.22, Math.cos(f * 1.6) * 0.85 * s, (1.6 + (f % 2) * 0.5) * s, Math.sin(f * 1.6) * 0.85 * s);
  } else if (kk === "palm") {
    for (let i = 0; i < 5; i++) v.box(i % 2 ? "#b98a55" : "#a87a48", 0.34 * s, 0.85 * s, 0.34 * s, i * 0.09 * s, (0.42 + i * 0.8) * s, 0, { rz: -0.08 });
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * Math.PI * 2;
      v.frame(x + 0.45 * s, 0, z, a);
      v.box(f % 2 ? "#5cc04e" : "#4fb048", 0.36 * s, 0.08 * s, 1.35 * s, 0, 4.0 * s, 0.62 * s, { rx: 0.45, ink: 0.022 });
    }
    v.frame(x, 0, z, 0);
    v.add("orb", "#8a5a2e", 0.3 * s, 0.3 * s, 0.3 * s, 0.4 * s, 3.95 * s, 0.2 * s);
  } else {
    v.box(WOOD_D, 0.34 * s, 1.3 * s, 0.34 * s, 0, 0.65 * s, 0);
    v.box(c, 1.6 * s, 1.15 * s, 1.6 * s, 0, 1.7 * s, 0, { ink: 0.04 });
    v.box(c, 1.05 * s, 0.75 * s, 1.05 * s, 0.12 * s, 2.55 * s, 0.05 * s, { ink: 0.04 });
    if (st.snow) v.box("#f4f8ff", 1.1 * s, 0.18 * s, 1.1 * s, 0.12 * s, 2.98 * s, 0.05 * s);
  }
  paint.shadow(x, z, 1.2 * s + 0.3, 1.1 * s + 0.3, 0.32);
  return true;
}

/** A round pond: a dark floor, a chunky stone ring, the water inside it. */
export function pond(k: Kit, x: number, z: number, r: number, y = 0, rim = "#e9dcc6") {
  const v = k.v;
  v.frame(x, 0, z, 0);
  v.cyl("#3d6f9c", r * 0.95, 0.04, 0, y + 0.03, 0);
  v.add("torus", rim, r * 2 + 0.1, r * 2 + 0.1, 1.6, 0, y + 0.11, 0, { rx: Math.PI / 2, ink: 0.025 });
  k.water.disc(x, z, r * 0.93, y + 0.12);
}

/** A ZStreet flag on a pole (the pole into the Vox, the cloth into life's waving flags). */
export function flag(k: Kit, x: number, z: number, h: number, yaw: number, c: string, size = 1, y0 = 0) {
  k.v.frame(x, y0, z, 0);
  k.v.cyl("#e8e4ff", 0.07, h, 0, h / 2, 0, { ink: 0.02 }, "cyl8");
  k.v.add("orb", "#ffd23f", 0.2, 0.2, 0.2, 0, h + 0.08, 0);
  k.life.flag(x, y0 + h - 0.45 * size, z, yaw, c, size);
}

/** A lamp post with a lantern head and its pool of light. */
export function lamp(k: Kit, x: number, z: number, c = k.style.lamp, h = 2.5) {
  const v = k.v;
  v.frame(x, 0, z, 0);
  v.box(DARK, 0.3, 0.2, 0.3, 0, 0.1, 0);
  v.cyl(DARK, 0.07, h, 0, h / 2, 0, {}, "cyl8");
  v.box(DARK, 0.36, 0.08, 0.36, 0, h + 0.04, 0);
  v.box(c, 0.36, 0.46, 0.36, 0, h + 0.31, 0, { glow: true });
  v.box("#fffbe8", 0.2, 0.3, 0.38, 0, h + 0.31, 0, { glow: true });
  v.roof(DARK, 0.34, 0.2, 0.34, 0, h + 0.64, 0);
  v.add("orb", "#ffd23f", 0.1, 0.1, 0.1, 0, h + 0.78, 0);
  k.pools.add(x, z, k.style.night ? 3.0 : 2.1, c, 0.06, k.style.night ? 0.9 : 0.55);
  k.paint.shadow(x, z, 0.35, 0.35, 0.25);
}

export function bench(v: Vox, x: number, z: number, yaw: number) {
  v.frame(x, 0, z, yaw);
  v.box(WOOD, 1.5, 0.1, 0.42, 0, 0.46, 0, { ink: 0.02 });
  v.box(WOOD, 1.5, 0.36, 0.08, 0, 0.74, -0.2, { ink: 0.02 });
  for (const s of [-0.6, 0.6]) v.box(DARK, 0.08, 0.46, 0.4, s, 0.23, 0);
}

export function crate(v: Vox, x: number, y: number, z: number, s: number, yaw: number, c = WOOD) {
  v.frame(x, 0, z, yaw);
  v.box(c, s, s, s, 0, y + s / 2, 0, { ink: 0.03 });
  v.box("#7a4a2b", s * 1.02, s * 0.14, s * 1.02, 0, y + s * 0.5, 0);
}

/** A shipping container (open-ended doors drawn on). */
export function container(k: Kit, x: number, y: number, z: number, yaw: number, c: string) {
  const v = k.v;
  v.frame(x, 0, z, yaw);
  v.box(c, 2.5, 1.25, 1.2, 0, y + 0.625, 0, { ink: 0.035 });
  for (let i = 0; i < 6; i++) v.box(new THREE.Color(c).multiplyScalar(0.82).getStyle(), 0.08, 1.1, 1.22, -1.05 + i * 0.42, y + 0.625, 0);
  v.box("#ffffff", 0.9, 0.26, 0.02, 0.2, y + 0.9, 0.61);
}

/** Set pieces of the art-only kinds (the rest are props.ts' landmarks). */
export function dress(k: Kit, d: LandmarkDef) {
  const { v, words, ground, paint, rnd, life, pools } = k;
  const { x, z } = d;
  const r = d.rot ?? 0;
  switch (d.kind) {
    case "startgate": {
      // an arch over the way: two striped towers, a banner, balloons
      const ox = Math.cos(r) * 2.05,
        oz = -Math.sin(r) * 2.05;
      for (const s of [-1, 1]) {
        const px = x + ox * s,
          pz = z + oz * s;
        v.frame(px, 0, pz, r);
        v.box("#ffffff", 0.7, 0.4, 0.7, 0, 0.2, 0, { ink: 0.04 });
        for (let i = 0; i < 5; i++) v.box(i % 2 ? "#ff3d56" : "#ffffff", 0.52, 0.9, 0.52, 0, 0.85 + i * 0.9, 0, { ink: 0.035 });
        v.add("orb", "#ffd23f", 0.7, 0.7, 0.7, 0, 5.15, 0, { ink: 0.03 });
        for (let b = 0; b < 3; b++) {
          const bc = ["#ff5fa2", "#3ec6ff", "#ffd23f"][b];
          v.add("orb", bc, 0.6, 0.72, 0.6, (b - 1) * 0.55, 6.2 + (b % 2) * 0.35, 0.1 * b, { ink: 0.03 });
          v.box("#ffffff", 0.03, 0.9, 0.03, (b - 1) * 0.3, 5.6, 0);
        }
        paint.shadow(px, pz, 0.8, 0.8, 0.3);
        ground.take(px, pz, 1.0);
      }
      v.frame(x, 0, z, r);
      v.box("#2a1f55", 4.6, 0.95, 0.38, 0, 4.55, 0, { ink: 0.05 });
      v.box("#ffd23f", 4.7, 0.14, 0.42, 0, 4.0, 0);
      v.box("#ffd23f", 4.7, 0.14, 0.42, 0, 5.08, 0);
      for (const s of [-1, 1]) words.add(d.label ?? "START", 0.78, x + Math.sin(r) * 0.2 * s, 4.55, z + Math.cos(r) * 0.2 * s, r + (s < 0 ? Math.PI : 0), { fg: "#ffffff", w: 3.6 });
      life.bunting([x - ox, 3.9, z - oz], [x + ox, 3.9, z + oz], 9, 0.5);
      break;
    }
    case "fountain": {
      // a tiered fountain: a basin, a column, a bowl, jets; its water in the shared shader
      ground.take(x, z, 3.0);
      v.frame(x, 0, z, 0);
      v.cyl("#d9c7a8", 2.3, 0.34, 0, 0.17, 0, { ink: 0.05 }, "hex");
      pond(k, x, z, 2.25, 0.3, "#f2e6ce");
      v.frame(x, 0, z, 0);
      v.cyl("#e9dcc6", 0.32, 1.6, 0, 1.0, 0, { ink: 0.03 }, "cyl8");
      v.cyl("#e9dcc6", 1.05, 0.2, 0, 1.75, 0, { ink: 0.04 }, "hex");
      pond(k, x, z, 1.0, 1.8, "#f2e6ce");
      v.frame(x, 0, z, 0);
      v.cyl("#e9dcc6", 0.16, 0.8, 0, 2.3, 0, {}, "cyl8");
      v.add("orb", "#ffd23f", 0.42, 0.42, 0.42, 0, 2.85, 0, { ink: 0.03 });
      life.fountain(x, 2.9, z, 1.95);
      paint.shadow(x, z, 2.4, 2.4, 0.2);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        bench(v, x + Math.sin(a) * 3.2, z + Math.cos(a) * 3.2, a + Math.PI);
      }
      break;
    }
    case "warehouse": {
      // a harbour shed: corrugated walls, a roll-up door, a sign, a roof light
      v.frame(x, 0, z, r);
      v.box("#8fb6d9", 5.0, 3.0, 3.4, 0, 1.5, 0, { ink: 0.05 });
      for (let i = 0; i < 11; i++) v.box("#7aa2c8", 0.12, 2.9, 3.42, -2.4 + i * 0.48, 1.5, 0);
      v.box("#4a5f8c", 2.4, 2.2, 0.1, -0.6, 1.1, 1.71);
      for (let i = 0; i < 6; i++) v.box("#3a4c74", 2.4, 0.06, 0.12, -0.6, 0.3 + i * 0.36, 1.72);
      v.add("wedge", "#ff6b35", 5.3, 1.1, 1.85, 0, 3.55, 0.85, { ink: 0.04, ry: Math.PI });
      v.add("wedge", "#ff6b35", 5.3, 1.1, 1.85, 0, 3.55, -0.85, { ink: 0.04 });
      v.box("#ffcf7a", 0.6, 0.5, 0.06, 1.6, 1.9, 1.71, { glow: true });
      words.add(d.label ?? "HARBOR", 0.5, x + Math.sin(r) * 1.76 + Math.cos(r) * -0.6, 2.62, z + Math.cos(r) * 1.76 - Math.sin(r) * -0.6, r, { fg: "#ffffff", bg: "#2a1f55", w: 2.4 });
      paint.shadow(x, z, 3.2, 2.4, 0.35);
      ground.take(x, z, 3.2);
      for (let i = 0; i < 3; i++) crate(v, x + Math.cos(r) * (2.0 + i * 0.5) + Math.sin(r) * 2.3, 0, z - Math.sin(r) * (2.0 + i * 0.5) + Math.cos(r) * 2.3, 0.6, rnd());
      break;
    }
    case "crane": {
      // a jib crane on the quay: a lattice tower, a cab, a jib out over the water, its hook
      ground.take(x, z, 1.6);
      v.frame(x, 0, z, r);
      v.box("#2a1f55", 1.8, 0.4, 1.8, 0, 0.2, 0, { ink: 0.04 });
      for (const [sx, sz] of [
        [-0.55, -0.55],
        [0.55, -0.55],
        [-0.55, 0.55],
        [0.55, 0.55],
      ])
        v.box("#ff9a2e", 0.18, 6.4, 0.18, sx, 3.6, sz, { ink: 0.025 });
      for (let i = 0; i < 6; i++) {
        v.box("#ffb347", 1.25, 0.1, 0.1, 0, 0.9 + i * 1.05, 0.56, { rz: i % 2 ? 0.7 : -0.7 });
        v.box("#ffb347", 0.1, 0.1, 1.25, 0.56, 0.9 + i * 1.05, 0, { rx: i % 2 ? 0.7 : -0.7 });
      }
      v.box("#ffd23f", 1.6, 1.2, 1.5, 0, 7.3, 0, { ink: 0.04 });
      v.box("#7fd8ff", 1.62, 0.5, 1.0, 0, 7.45, 0.3, { glow: true });
      // the jib (toward local +z), its counterweight behind
      v.box("#ff9a2e", 0.5, 0.45, 7.4, 0, 8.1, 3.6, { ink: 0.035, rx: -0.12 });
      v.box("#5a4e8a", 1.1, 0.9, 1.2, 0, 8.1, -1.4, { ink: 0.035 });
      v.box("#ffffff", 0.04, 3.8, 0.04, 0, 6.6, 6.9);
      v.box("#ffd23f", 0.5, 0.35, 0.5, 0, 4.6, 6.9, { ink: 0.025 });
      paint.shadow(x, z, 1.4, 1.4, 0.35);
      life.blinker(x + Math.sin(r) * 7.2, 9.0, z + Math.cos(r) * 7.2, "#ff3d56");
      break;
    }
    case "containers": {
      // a stack of shipping containers: a row of three, the rest on top
      const n = d.s ?? 4;
      const cols = ["#ff3d56", "#3ec6ff", "#ffd23f", "#33d67c", "#c4b1fc", "#ff6b35"];
      for (let i = 0; i < n; i++) {
        const lvl = i >= 3 ? 1 : 0;
        const along = lvl ? (i - 3) * 1.25 - 0.6 : (i - 1) * 1.25;
        container(k, x + Math.sin(r) * along, lvl * 1.26, z + Math.cos(r) * along, r + Math.PI / 2, cols[(i * 2 + Math.abs(Math.round(x))) % cols.length]);
      }
      paint.shadow(x, z, 1.8, 2.4, 0.3);
      ground.take(x, z, 2.2);
      break;
    }
    case "boats":
      // (placed by the lagoon: see harbour())
      break;
    case "neon": {
      // a slim tower with neon edges, lit windows, a sign on top facing the board, a beacon
      const h = d.h ?? 12;
      const c = pick(["#ff4fd8", "#3ef0ff", "#ffd23f", "#9a6bff"], Math.abs(Math.sin(x * 12.9898 + z * 78.233)));
      const w = 2.6;
      ground.take(x, z, 2.2);
      v.frame(x, 0, z, 0);
      v.box("#3c3466", w, h, w, 0, h / 2, 0, { ink: 0.05 });
      v.box("#2c2650", w + 0.3, 0.5, w + 0.3, 0, 0.25, 0);
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        v.box(c, 0.1, h - 0.6, 0.1, (sx * w) / 2, h / 2, (sz * w) / 2, { glow: true });
      for (let f = 1; f < h / 1.1 - 1; f++)
        for (let i = 0; i < 3; i++) if ((f * 3 + i + Math.round(x)) % 4) v.box(f % 3 ? "#ffe3a0" : "#9ff2ff", 0.42, 0.42, 0.05, -0.8 + i * 0.8, f * 1.1, w / 2 + 0.01, { glow: true });
      v.box(c, w + 0.1, 0.12, w + 0.1, 0, h * 0.62, 0, { glow: true });
      v.box("#1e1838", w * 1.4, 1.3, 0.3, 0, h + 0.9, 0.4, { ink: 0.04 });
      words.add(d.label ?? "ZEC", 1.0, x, h + 0.9, z + 0.57, 0, { fg: c, neon: true, w: w * 1.3 });
      v.cyl("#e8e4ff", 0.06, 2.6, 0, h + 2.6, -0.4, {}, "cyl8");
      life.blinker(x, h + 3.95, z - 0.4, "#ff3d56");
      pools.add(x, z + 2, 3.2, c, 0.07, 0.6);
      paint.shadow(x, z, 2.2, 2.2, 0.35);
      break;
    }
    case "billboard": {
      // a big lit board on legs, facing the board, its words in neon
      const h = d.h ?? 6.5;
      ground.take(x, z, 2.6);
      v.frame(x, 0, z, r);
      for (const s of [-1.6, 1.6]) v.box("#2a1f55", 0.3, h, 0.3, s, h / 2, -0.2, { ink: 0.03 });
      v.box("#1e1838", 5.6, 2.4, 0.3, 0, h + 0.6, 0, { ink: 0.05 });
      v.box(pick(["#ff4fd8", "#3ef0ff", "#ffd23f"], Math.abs(Math.sin(x))), 5.75, 0.12, 0.32, 0, h - 0.62, 0, { glow: true });
      v.box(pick(["#ff4fd8", "#3ef0ff", "#ffd23f"], Math.abs(Math.cos(z))), 5.75, 0.12, 0.32, 0, h + 1.82, 0, { glow: true });
      words.add(d.label ?? "ZCASH", 1.2, x + Math.sin(r) * 0.17, h + 0.6, z + Math.cos(r) * 0.17, r, { fg: pick(["#3ef0ff", "#ff6bd8", "#ffe27a"], Math.abs(Math.sin(x * 3))), neon: true, w: 5.2 });
      for (const s of [-1.6, 1.6]) life.blinker(x + Math.cos(r) * s, h + 1.95, z - Math.sin(r) * s, "#ffd23f");
      paint.shadow(x, z, 2.6, 1.2, 0.3);
      break;
    }
    case "watchtower": {
      // the Penitentiary's guard tower: a stone stem, a hut, a searchlight sweeping the yard
      ground.take(x, z, 1.4);
      v.frame(x, 0, z, 0);
      v.box("#6b6688", 1.6, 0.6, 1.6, 0, 0.3, 0, { ink: 0.04 });
      v.box("#8c87a6", 1.2, 5.6, 1.2, 0, 3.0, 0, { ink: 0.045 });
      for (let i = 0; i < 4; i++) v.box("#ff6b35", 1.24, 0.2, 1.24, 0, 1.4 + i * 1.3, 0);
      v.box("#4b3f74", 2.1, 0.3, 2.1, 0, 5.95, 0, { ink: 0.04 });
      v.box("#3a2f5c", 1.7, 1.2, 1.7, 0, 6.7, 0, { ink: 0.04 });
      v.box("#ffcf7a", 1.72, 0.45, 1.2, 0, 6.8, 0, { glow: true });
      v.roof("#2a1f55", 2.2, 1.0, 2.2, 0, 7.8, 0, { ink: 0.04 });
      v.cyl("#2a2440", 0.3, 0.4, 0, 8.4, 0);
      life.searchlight(x, 8.45, z, 1.4 + rnd(), 12, Math.atan2(-x, -27 - z));
      paint.shadow(x, z, 1.4, 1.4, 0.35);
      break;
    }
    case "woods":
      woods(k, d);
      break;
    case "beach":
      beach(k, d);
      break;
    case "turbine": {
      // a wind turbine: a white mast, a nacelle, three blades turning (life)
      const h = 9.5;
      ground.take(x, z, 1.2);
      v.frame(x, 0, z, 0);
      v.cyl("#e9e4f5", 0.65, 0.5, 0, 0.25, 0, { ink: 0.03 }, "hex");
      v.cyl("#ffffff", 0.24, h, 0, h / 2, 0, { ink: 0.03 }, "cyl8");
      v.box("#ff6b35", 0.3, 0.3, 0.3, 0, 2, 0.2);
      const yaw = 0.35;
      v.frame(x, 0, z, yaw);
      v.box("#ffffff", 0.6, 0.6, 1.5, 0, h + 0.1, -0.2, { ink: 0.03 });
      life.rotor(x + Math.sin(yaw) * 0.62, h + 0.1, z + Math.cos(yaw) * 0.62, yaw, "turbine");
      paint.shadow(x, z, 0.7, 0.7, 0.3);
      break;
    }
    case "windmill": {
      // the park's windmill: a tapered tower, a cap, four lattice sails (life), a door, a flower bed
      ground.take(x, z, 2.4);
      v.frame(x, 0, z, r);
      v.cyl("#e9dcc6", 1.6, 0.6, 0, 0.3, 0, { ink: 0.04 }, "hex");
      v.add("cone6", "#f6eedc", 2.5, 4.6, 2.5, 0, 2.8, 0, { ink: 0.05 });
      for (let i = 0; i < 3; i++) v.add("cone6", "#e8dcc4", 2.42 - i * 0.42, 0.12, 2.42 - i * 0.42, 0, 1.2 + i * 1.3, 0);
      v.cyl("#f6eedc", 0.8, 0.8, 0, 5.1, 0, { ink: 0.04 }, "hex");
      v.roof("#ff6b35", 1.7, 1.1, 1.7, 0, 6.0, 0, { ink: 0.04 });
      v.box("#7a4a2b", 0.7, 1.1, 0.1, 0, 0.85, 1.28);
      v.box("#ffcf7a", 0.42, 0.42, 0.06, 0, 2.9, 0.86, { glow: true });
      for (let i = 0; i < 7; i++) v.add("orb", pick(FLOWERS, rnd()), 0.3, 0.3, 0.3, -1.4 + i * 0.47, 0.2, 1.95);
      life.rotor(x + Math.sin(r) * 0.95, 5.2, z + Math.cos(r) * 0.95, r, "windmill");
      paint.shadow(x, z, 2.3, 2.3, 0.35);
      break;
    }
    case "islets":
      islets(k, d.s ?? 6);
      break;
    case "crowd":
      for (let i = 0; i < (d.s ?? 2); i++) {
        const a = rnd() * Math.PI * 2,
          dd = i === 0 ? 0 : 0.75 + rnd() * 0.6;
        const px = x + Math.cos(a) * dd,
          pz = z + Math.sin(a) * dd;
        life.npc(px, pz, r + (rnd() - 0.5) * 0.7);
        paint.shadow(px, pz, 0.5, 0.5, 0.25);
      }
      break;
    case "campfire": {
      v.frame(x, 0, z, 0);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        v.add("orb", "#8c7aa8", 0.36, 0.26, 0.32, Math.sin(a) * 0.75, 0.12, Math.cos(a) * 0.75, { ink: 0.02 });
      }
      v.box(WOOD_D, 0.18, 0.18, 1.1, 0, 0.2, 0, { ry: 0.6 });
      v.box(WOOD_D, 0.18, 0.18, 1.1, 0, 0.24, 0, { ry: -0.6 });
      v.add("cone6", "#ff8a2e", 0.55, 0.9, 0.55, 0, 0.6, 0, { glow: true });
      v.add("cone6", "#ffe27a", 0.3, 0.55, 0.3, 0, 0.55, 0, { glow: true });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.3;
        v.box(WOOD, 1.2, 0.35, 0.4, Math.sin(a) * 1.7, 0.18, Math.cos(a) * 1.7, { ry: a + Math.PI / 2, ink: 0.02 });
      }
      pools.add(x, z, 3.2, "#ff8a3a", 0.06, 0.9);
      life.smokeAt(x, 1.3, z);
      life.sparkAt(x, 0.7, z, 0.5);
      ground.take(x, z, 2.3);
      break;
    }
    default:
      break;
  }
}

/** The harbour's basin: water under the pier, its stone rim, falls off its edges, the boats and buoys. */
export function harbour(k: Kit) {
  const L = k.map.lagoon;
  if (!L) return;
  const { v, rnd, g, life } = k;
  const pts = L.pts;
  // the rock under it
  k.parent.add(island({ pts, top: "#8f84ad", y: L.y - 0.35, depth: 9 }, rnd, k.islandMat));
  // the water, foam round the pier's piles
  const piles: [number, number, number][] = [];
  for (const sp of g.spaces) if (sp.pier) piles.push([sp.x, sp.z, 1.85]);
  k.water.basin(pts, L.y, k.map.islands, piles);
  // the rim: quay stones along the outline (where it is not under an island), with gaps where it spills
  const falls: [number, number, number][] = [];
  const onLand = (x: number, z: number) => k.map.islands.some((i) => inside(i.pts, x, z));
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    let nx = Math.cos(yaw),
      nz = -Math.sin(yaw);
    if (inside(pts, (ax + bx) / 2 + nx * 0.5, (az + bz) / 2 + nz * 0.5)) ((nx = -nx), (nz = -nz));
    const fy = Math.atan2(nx, nz);
    // (in steps of a metre: which are open rim, which spill over)
    const n = Math.max(2, Math.round(len / 1.0));
    const spill = len > 5 && i % 3 === 1 ? Math.floor(n / 2) : -1;
    const open: boolean[] = [];
    for (let j = 0; j < n; j++) {
      const f = (j + 0.5) / n;
      open.push(!onLand(ax + (bx - ax) * f - nx * 0.6, az + (bz - az) * f - nz * 0.6) && !(spill >= 0 && Math.abs(j - spill) <= 1));
    }
    if (spill >= 0) {
      const f = (spill + 0.5) / n;
      falls.push([ax + (bx - ax) * f + nx * 0.2, az + (bz - az) * f + nz * 0.2, Math.atan2(nx, nz)]);
    }
    for (let j0 = 0; j0 < n; ) {
      if (!open[j0]) {
        j0++;
        continue;
      }
      let j1 = j0;
      while (j1 + 1 < n && open[j1 + 1]) j1++;
      const f0 = j0 / n,
        f1 = (j1 + 1) / n;
      const SL = (f1 - f0) * len;
      const fm = (f0 + f1) / 2;
      const mx = ax + (bx - ax) * fm,
        mz = az + (bz - az) * fm;
      v.frame(mx, 0, mz, fy);
      v.box("#b4a8c8", SL + 0.25, 0.75, 0.85, 0, L.y - 0.1, 0, { ink: 0.035 });
      v.box("#d9d0e6", SL + 0.3, 0.14, 0.95, 0, L.y + 0.3, 0);
      for (let j = j0; j <= j1; j++) {
        const f = (j + 0.5) / n;
        v.frame(ax + (bx - ax) * f, 0, az + (bz - az) * f, fy);
        if (j % 3 === 0) v.box("#3a2f5a", 0.24, 0.42, 0.24, 0, L.y + 0.55, 0, { ink: 0.015 });
        if (rnd() < 0.25) v.add("orb", pick(["#8c7aa8", "#9a8ab4"], rnd()), 0.7, 0.45, 0.6, 0, L.y - 0.55, 0.55 * (rnd() < 0.5 ? 1 : -1), { ink: 0.02 });
      }
      j0 = j1 + 1;
    }
  }
  for (const [x, z, yaw] of falls) {
    k.falls.add(x, z, yaw, 2.4, L.y, 24);
    v.frame(x, 0, z, yaw);
    v.box("#ffffff", 2.6, 0.12, 0.5, 0, L.y + 0.02, 0.2, { glow: true });
  }
  // boats and buoys where the water is open
  const free = (x: number, z: number, r: number) => {
    if (!inside(pts, x, z) || onLand(x, z)) return false;
    for (const sp of g.spaces) if (Math.hypot(sp.x - x, sp.z - z) < r + 2.3) return false;
    // (well in from the rim)
    for (const [dx, dz] of [
      [r + 0.8, 0],
      [-r - 0.8, 0],
      [0, r + 0.8],
      [0, -r - 0.8],
    ])
      if (!inside(pts, x + dx, z + dz) || onLand(x + dx, z + dz)) return false;
    return true;
  };
  const want = k.map.landmarks.find((l) => l.kind === "boats")?.s ?? 5;
  let made = 0;
  const taken: [number, number][] = [];
  for (let tries = 0; tries < 400 && made < want; tries++) {
    const xs = pts.map((p) => p[0]),
      zs = pts.map((p) => p[1]);
    const x = Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs));
    const z = Math.min(...zs) + rnd() * (Math.max(...zs) - Math.min(...zs));
    if (!free(x, z, 1.6) || taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 4.2)) continue;
    taken.push([x, z]);
    life.boat(x, L.y, z, rnd() * Math.PI * 2, made);
    made++;
  }
  for (let i = 0, b = 0; i < 300 && b < 6; i++) {
    const x = 30 + rnd() * 17,
      z = -24 + rnd() * 24;
    if (!free(x, z, 0.4) || taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 2.5)) continue;
    taken.push([x, z]);
    life.buoy(x, L.y, z, b++ % 2 ? "#ff3d56" : "#ffd23f");
  }
  // gulls over it all
  for (let i = 0; i < 6; i++) life.bird(36 + (rnd() - 0.5) * 6, -11 + (rnd() - 0.5) * 6, 6 + rnd() * 7, 8 + rnd() * 6, "gull");
}

/** The wilds: a dense wood of pines and round trees, giant toy mushrooms, logs, a hut, fireflies. */
function woods(k: Kit, d: LandmarkDef) {
  const { v, rnd, ground, paint, life } = k;
  const pts = d.pts ?? [];
  if (!pts.length) return;
  const xs = pts.map((p) => p[0]),
    zs = pts.map((p) => p[1]);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    z0 = Math.min(...zs),
    z1 = Math.max(...zs);
  const area = (x1 - x0) * (z1 - z0);
  const want = Math.round(area / 7);
  for (let i = 0, made = 0; i < want * 10 && made < want; i++) {
    const fx = x0 + rnd() * (x1 - x0),
      fz = z0 + rnd() * (z1 - z0);
    if (!inside(pts, fx, fz) || !ground.free(fx, fz, 0.7)) continue;
    if (tree(k, fx, fz, rnd() < 0.62 ? "pine" : "any", 1.05)) (ground.take(fx, fz, 1.0), made++);
  }
  // mushrooms, stumps, rocks, ferns
  for (let i = 0, made = 0; i < want * 6 && made < want * 0.7; i++) {
    const fx = x0 + rnd() * (x1 - x0),
      fz = z0 + rnd() * (z1 - z0);
    if (!inside(pts, fx, fz) || !ground.free(fx, fz, 0.4)) continue;
    ground.take(fx, fz, 0.6);
    made++;
    const kind = rnd();
    v.frame(fx, 0, fz, rnd() * Math.PI);
    const room = ground.maxH(fx, fz, 0.6);
    if (kind < 0.3) {
      const s = Math.min(1.3, Math.max(0.45, room / 1.4)) * (0.7 + rnd() * 0.5);
      v.cyl("#fff3e0", 0.18 * s, 0.9 * s, 0, 0.45 * s, 0, { ink: 0.02 }, "cyl8");
      v.add("orb", rnd() < 0.7 ? "#ff3d56" : "#c4b1fc", 1.1 * s, 0.6 * s, 1.1 * s, 0, 0.95 * s, 0, { ink: 0.03 });
      for (let f = 0; f < 4; f++) v.add("orb", "#ffffff", 0.18 * s, 0.1 * s, 0.18 * s, Math.cos(f * 1.7) * 0.32 * s, 1.18 * s, Math.sin(f * 1.7) * 0.32 * s);
    } else if (kind < 0.45) {
      v.cyl(WOOD, 0.36, 0.45, 0, 0.22, 0, { ink: 0.03 }, "cyl8");
      v.cyl("#e8c08a", 0.3, 0.04, 0, 0.46, 0, {}, "cyl8");
    } else if (kind < 0.6) {
      v.cyl(WOOD, 0.26, 1.8, 0, 0.26, 0, { rz: Math.PI / 2, ink: 0.03 }, "cyl8");
    } else if (kind < 0.8) v.add("orb", pick(["#8c7aa8", "#9a8ab4", "#7d6c9a"], rnd()), 0.9 + rnd() * 0.6, 0.6, 0.8, 0, 0.2, 0, { ink: 0.03 });
    else for (let f = 0; f < 3; f++) v.add("cone6", "#3f9a4a", 0.5, 0.7, 0.5, (f - 1) * 0.3, 0.32, (f % 2) * 0.2, { rz: (f - 1) * 0.4 });
  }
  // a woodcutter's hut where there is room
  for (let i = 0; i < 80; i++) {
    const fx = x0 + rnd() * (x1 - x0),
      fz = z0 + rnd() * (z1 - z0);
    if (!inside(pts, fx, fz) || !ground.free(fx, fz, 2.0) || ground.maxH(fx, fz, 2) < 3.4) continue;
    ground.take(fx, fz, 2.4);
    v.frame(fx, 0, fz, rnd() * 0.6 - 0.3);
    v.box("#b98250", 2.6, 1.8, 2.2, 0, 0.9, 0, { ink: 0.04 });
    for (let f = 0; f < 4; f++) v.box("#a8713f", 2.62, 0.08, 2.22, 0, 0.3 + f * 0.45, 0);
    v.roof("#c4442f", 3.0, 1.3, 2.6, 0, 2.45, 0, { ink: 0.04 });
    v.box("#5a3a2a", 0.6, 1.1, 0.06, 0.5, 0.55, 1.11);
    v.box("#ffcf7a", 0.5, 0.4, 0.06, -0.6, 1.1, 1.11, { glow: true });
    v.box("#8c7aa8", 0.5, 1.2, 0.5, 0.8, 2.6, -0.5, { ink: 0.02 });
    life.smokeAt(fx + 0.8, 3.3, fz - 0.5);
    paint.shadow(fx, fz, 2.0, 1.8, 0.35);
    break;
  }
  life.motesAt((x0 + x1) / 2, 1.4, (z0 + z1) / 2, (x1 - x0) / 2, 1.8, Math.round(area / 12), ["#fff3a0", "#c8ff8a", "#ffe27a"]);
  for (let i = 0; i < 3; i++) life.bird((x0 + x1) / 2 + (rnd() - 0.5) * 8, (z0 + z1) / 2 + (rnd() - 0.5) * 8, 5 + rnd() * 4, 8 + rnd() * 5, "bird");
}

/** The beach along the coast: umbrellas, towels, deck chairs, a sandcastle, palms, a lifeguard's chair. */
function beach(k: Kit, d: LandmarkDef) {
  const { v, rnd, ground, paint } = k;
  const pts = d.pts ?? [];
  const at = (f: number, off: number): [number, number] => {
    const total = pts.length - 1;
    const s = Math.min(total - 1, Math.floor(f * total));
    const t = f * total - s;
    const [ax, az] = pts[s],
      [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    // (inward: toward the land)
    let nx = -(bz - az) / len,
      nz = (bx - ax) / len;
    const mx = ax + (bx - ax) * t,
      mz = az + (bz - az) * t;
    if (!ground.land(mx + nx * 2, mz + nz * 2, 0.2)) ((nx = -nx), (nz = -nz));
    return [mx + nx * off, mz + nz * off];
  };
  for (let i = 0, made = 0; i < 260 && made < 26; i++) {
    const [x, z] = at(rnd(), 1.4 + rnd() * 1.6);
    if (!ground.free(x, z, 0.7, 0.9)) continue;
    const room = ground.maxH(x, z, 0.8);
    const kind = rnd();
    ground.take(x, z, 1.1);
    made++;
    v.frame(x, 0, z, rnd() * Math.PI * 2);
    if (kind < 0.34 && room > 2.0) {
      // an umbrella and a towel
      const c = pick(["#ff3d56", "#3ec6ff", "#ffd23f", "#ff5fa2", "#33d67c"], rnd());
      v.cyl("#ffffff", 0.05, 2.0, 0, 1.0, 0, {}, "cyl8");
      v.add("cone6", c, 2.3, 0.6, 2.3, 0, 2.05, 0, { ink: 0.03 });
      v.add("cone6", "#ffffff", 1.2, 0.34, 1.2, 0, 2.2, 0);
      v.box(pick(["#ff8fc8", "#7fd8ff", "#fff3a0"], rnd()), 0.8, 0.03, 1.6, 0.9, 0.02, 0.2);
      paint.shadow(x, z, 1.3, 1.3, 0.28);
    } else if (kind < 0.5) {
      // a deck chair
      v.box("#ffffff", 0.7, 0.08, 1.2, 0, 0.32, 0, { rx: 0.12, ink: 0.02 });
      v.box("#ff6b35", 0.72, 0.6, 0.08, 0, 0.62, -0.56, { rx: -0.5 });
      paint.shadow(x, z, 0.7, 0.8, 0.22);
    } else if (kind < 0.62) {
      // a sandcastle
      v.box("#f0d49a", 0.9, 0.36, 0.9, 0, 0.18, 0, { ink: 0.02 });
      for (const [sx, sz] of [
        [-0.4, -0.4],
        [0.4, -0.4],
        [-0.4, 0.4],
        [0.4, 0.4],
      ])
        v.cyl("#ead09a", 0.16, 0.62, sx, 0.31, sz, {}, "cyl8");
      v.box("#ff3d56", 0.2, 0.12, 0.02, 0, 0.75, 0);
    } else if (kind < 0.76) {
      // a beach ball, a bucket
      v.add("orb", pick(["#ff3d56", "#3ec6ff", "#ffd23f"], rnd()), 0.5, 0.5, 0.5, 0, 0.26, 0, { ink: 0.02 });
      v.cyl("#ff5fa2", 0.16, 0.28, 0.6, 0.14, 0.3, {}, "cyl8");
    } else if (room > 3) tree(k, x, z, "palm", 0.95);
    else v.add("orb", "#d9c48a", 0.6, 0.2, 0.5, 0, 0.06, 0);
  }
}

/**
 * Terraces: stepped grassy mounds with stone edges and a little stair, where the lawn is open and
 * the cameras allow the height (decor's height rule); a tree, a bench or a lamp on top.
 */
export function terraces(k: Kit, n: number) {
  const { v, rnd, ground, paint } = k;
  let made = 0;
  for (let i = 0; i < 1600 && made < n; i++) {
    const x = -40 + rnd() * 82,
      z = -58 + rnd() * 90;
    const r = 2.6 + rnd() * 1.6;
    if (!ground.free(x, z, r, r + 0.6)) continue;
    const room = ground.maxH(x, z, r);
    const levels = room > 2.6 ? 3 : room > 1.7 ? 2 : room > 0.9 ? 1 : 0;
    if (!levels) continue;
    ground.take(x, z, r + 0.4);
    made++;
    const yaw = rnd() * Math.PI;
    const LH = 0.55;
    for (let l = 0; l < levels; l++) {
      const rr = r * (1 - l * 0.3);
      v.frame(x + l * 0.3, 0, z - l * 0.35, yaw + l * 0.4);
      v.cyl(l % 2 ? "#b9a590" : "#c9b59c", rr, LH, 0, LH * l + LH / 2 - 0.04, 0, { ink: 0.035 }, "hex");
      v.cyl("#88cc62", rr - 0.12, 0.1, 0, LH * (l + 1) - 0.02, 0, {}, "hex");
      for (let t = 0; t < 4; t++) v.add("orb", "#6fb352", 0.5, 0.3, 0.4, Math.cos(t * 1.7 + l) * (rr - 0.5), LH * (l + 1) + 0.04, Math.sin(t * 1.7 + l) * (rr - 0.5));
    }
    // a stair up the south face
    for (let st = 0; st < levels * 2; st++) v.box(st % 2 ? "#e9dcc6" : "#d9c7a8", 0.9, 0.28, 0.5, 0, 0.14 + st * 0.275, r - 0.1 - st * 0.27, { ink: 0.02 });
    // on top: a tree, or a bench and a lamp
    const tx = x + (levels - 1) * 0.3,
      tz = z - (levels - 1) * 0.35;
    const top = levels * LH;
    const left = room - top;
    if (left > 2.2 && rnd() < 0.7) {
      const s = Math.min(1.2, left / 3.6);
      v.frame(tx, top, tz, rnd() * 3);
      v.box("#7a4a2b", 0.3 * s, 1.1 * s, 0.3 * s, 0, 0.55 * s, 0);
      v.add("orb", pick(GREENS, rnd()), 1.8 * s, 1.6 * s, 1.8 * s, 0, 1.65 * s, 0, { ink: 0.04 });
    } else {
      v.frame(tx, top, tz, yaw);
      v.box(WOOD, 1.3, 0.1, 0.4, 0, 0.45, 0, { ink: 0.02 });
      for (const sx of [-0.5, 0.5]) v.box(DARK, 0.08, 0.45, 0.36, sx, 0.22, 0);
      for (let f = 0; f < 5; f++) v.add("orb", pick(FLOWERS, rnd()), 0.2, 0.2, 0.2, -0.8 + f * 0.4, 0.12, -0.5);
    }
    paint.shadow(x + 0.4, z - 0.3, r * 1.05, r, 0.3);
  }
}

/**
 * Floating islets round the board (rock, a grass top, a tree, a crystal or a hut, bobbing: life)
 * and bare rocks drifting nearer its edges: spread round the islands' outline, below the metro.
 */
function islets(k: Kit, n: number) {
  const { rnd, life, map } = k;
  const xs = map.islands.flatMap((i) => i.pts.map((p) => p[0])),
    zs = map.islands.flatMap((i) => i.pts.map((p) => p[1]));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
    cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const rx = (Math.max(...xs) - Math.min(...xs)) / 2,
    rz = (Math.max(...zs) - Math.min(...zs)) / 2;
  const onLand = (x: number, z: number, m: number) => map.islands.some((i) => inside(i.pts, x, z) || inside(i.pts, x + m, z) || inside(i.pts, x - m, z) || inside(i.pts, x, z + m) || inside(i.pts, x, z - m));
  const put = (count: number, out0: number, out1: number, y0: number, y1: number, fn: (x: number, y: number, z: number, i: number) => void) => {
    for (let i = 0, made = 0; i < count * 30 && made < count; i++) {
      const a = ((made + rnd() * 0.7) / count) * Math.PI * 2;
      const o = out0 + rnd() * (out1 - out0);
      const x = cx + Math.cos(a) * (rx + o),
        z = cz + Math.sin(a) * (rz + o);
      if (onLand(x, z, 6)) continue;
      fn(x, y0 + rnd() * (y1 - y0), z, made++);
    }
  };
  put(n, 12, 22, -11, -2, (x, y, z, i) => life.islet(x, y, z, 0.75 + rnd() * 0.45, i, rnd));
  put(Math.round(n * 0.9), 4, 10, -13, -4, (x, y, z) => life.rock(x, y, z, 0.6 + rnd() * 0.35, rnd));
}
