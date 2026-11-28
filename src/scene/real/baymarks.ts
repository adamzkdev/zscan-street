import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { City } from "../city";
import { BAY } from "../city/plan";
import { SNARK1 } from "../voxel/landmarks/statue-art";
import { VOX } from "../voxel/model";
import { GLASS_NIGHT } from "../voxel/surface";
import { real } from "./tex";

/**
 * The bay's landmarks, realistic (branch gta-real): the zkSNARK Statue on Liberty island and the
 * Opera House on its pier, no voxels left. The city's workers still run their voxel builders for
 * the layout (the lot, the door, the walls, the signs, the lights, the named points: torch, crown,
 * sails, keeper) and send no geometry (src/scene/real/mainmarks.ts); the geometry is made here, on
 * the main thread, from the same constants as the voxel version (written in its model voxels, so
 * every point, door, step and wall stays where it was) and placed in the landmark's own frame.
 *
 * Merged per material; the walkable base (the fort, the pedestal, the podium, the steps) always
 * drawn, the figure's and the shells' detail swapped for a lighter copy past ~220 m (THREE.LOD).
 */

export type V3 = [number, number, number];

/** A shared material whose texture repeats every `tile` metres (UVs projected from the metres). */
export function tiled<T extends THREE.Material>(m: T, tile: number) {
  m.userData.tile = tile;
  m.userData.shared = true;
  return m;
}

/** Geometry collected per material, in a model's voxels; `build` takes it to metres and merges. */
export class Parts {
  private list = new Map<THREE.Material, { g: THREE.BufferGeometry; own: boolean }[]>();
  constructor(private frame: THREE.Matrix4) {}
  add(m: THREE.Material, g: THREE.BufferGeometry, ownUv = false) {
    const geo = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(geo.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") geo.deleteAttribute(k);
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    const l = this.list.get(m) ?? [];
    l.push({ g: geo, own: ownUv });
    this.list.set(m, l);
    return geo;
  }
  box(m: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.add(m, g);
  }
  /** A square block centred on (cx, cz), half `h`, from y0 to y1. */
  sq(m: THREE.Material, cx: number, cz: number, h: number, y0: number, y1: number) {
    return this.box(m, cx - h, y0, cz - h, cx + h, y1, cz + h);
  }
  cyl(m: THREE.Material, x: number, y0: number, z: number, r: number, h: number, seg = 16, rTop = r) {
    const g = new THREE.CylinderGeometry(rTop, r, h, seg);
    g.translate(x, y0 + h / 2, z);
    return this.add(m, g);
  }
  ellipsoid(m: THREE.Material, c: V3, r: V3, seg = 24) {
    const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)));
    g.scale(r[0], r[1], r[2]);
    g.translate(c[0], c[1], c[2]);
    return this.add(m, g);
  }
  /** A tapered limb from a to b (radii r0 → r1), rounded at both ends. */
  limb(m: THREE.Material, a: V3, b: V3, r0: number, r1: number, seg = 16) {
    const A = new THREE.Vector3(...a),
      B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
    g.translate(A.x, A.y, A.z);
    this.add(m, g);
    this.ellipsoid(m, a, [r0, r0, r0], seg);
    this.ellipsoid(m, b, [r1, r1, r1], seg);
  }
  /** A beam of square section from a to b. */
  beam(m: THREE.Material, a: V3, b: V3, s: number) {
    const A = new THREE.Vector3(...a),
      B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const g = new THREE.BoxGeometry(s, len, s);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
    g.translate(A.x, A.y, A.z);
    return this.add(m, g);
  }
  /**
   * A loft: rings of `seg` points (centre, radii, the radius' wobble by angle) stacked bottom to
   * top, closed at the top with a cap if asked.
   */
  loft(m: THREE.Material, rings: { y: number; cx: number; cz: number; rx: number; rz: number; wob?: (a: number) => number }[], seg = 48, capTop = false) {
    const pos: number[] = [];
    const at = (r: (typeof rings)[number], i: number): V3 => {
      const a = (i / seg) * Math.PI * 2;
      const k = r.wob ? r.wob(a) : 1;
      return [r.cx + Math.cos(a) * r.rx * k, r.y, r.cz + Math.sin(a) * r.rz * k];
    };
    for (let j = 0; j + 1 < rings.length; j++)
      for (let i = 0; i < seg; i++) {
        const p00 = at(rings[j], i),
          p01 = at(rings[j], i + 1),
          p10 = at(rings[j + 1], i),
          p11 = at(rings[j + 1], i + 1);
        pos.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
      }
    if (capTop) {
      const r = rings[rings.length - 1];
      for (let i = 0; i < seg; i++) pos.push(r.cx, r.y, r.cz, ...at(r, i + 1), ...at(r, i));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return this.add(m, smooth(g));
  }
  /** Everything, in metres in the landmark's frame, one mesh per material. */
  build(name: string, shadows = true): THREE.Group {
    const out = new THREE.Group();
    out.name = name;
    for (const [m, list] of this.list) {
      const geos = list.map(({ g, own }) => {
        g.applyMatrix4(this.frame);
        if (!own) boxUv(g, (m.userData.tile as number) ?? 1);
        else if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
        return g;
      });
      const geo = mergeGeometries(geos, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, m);
      const lit = (m as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      mesh.castShadow = shadows && !lit;
      mesh.receiveShadow = !lit;
      out.add(mesh);
    }
    return out;
  }
}

/** A surface built as loose triangles, shaded smooth: its shared corners welded, normals averaged. */
function smooth(g: THREE.BufferGeometry) {
  g.deleteAttribute("normal");
  const w = mergeVertices(g, 1e-3);
  w.computeVertexNormals();
  return w;
}

/** UVs projected from the metres by the face's normal (a box projection), divided by `tile`. */
function boxUv(g: THREE.BufferGeometry, tile: number) {
  const p = g.getAttribute("position"),
    n = g.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i)),
      az = Math.abs(n.getZ(i));
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/** A model's voxels (scale k) to metres in its landmark's frame (centred on the lot, y up from the kerb). */
export function frameOf(W: number, D: number, k: number) {
  const s = VOX * k;
  return new THREE.Matrix4().makeTranslation((-W * s) / 2, 0, (-D * s) / 2).multiply(new THREE.Matrix4().makeScale(s, s, s));
}

// ---- materials ---------------------------------------------------------------------------------

/** What lights up at night (MeshBasic: its colour is its glow), with its day and night strengths. */
const glowing: { m: THREE.MeshBasicMaterial; c: THREE.Color; day: number; night: number }[] = [];
export function glow(hex: string, day: number, night: number) {
  const c = new THREE.Color(hex);
  const m = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(day), toneMapped: false });
  m.userData.shared = true;
  glowing.push({ m, c, day, night });
  return m;
}

let M: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const std = (color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    tiled(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }), 2);
  return {
    // Liberty: granite, the fort's coursed stone, cast copper gone green, gold leaf
    granite: tiled(real("Bricks008", { tint: "#b9b0a2" }), 2.4),
    fort: tiled(real("Bricks008", { tint: "#98938a" }), 2.0),
    trim: tiled(real("Marble021", { tint: "#ddd3c1" }), 2),
    paving: tiled(real("PavingStones128", { tint: "#d8d2c6" }), 2.4),
    lawn: tiled(real("Grass004", { tint: "#b8cf98" }), 3),
    copper: std("#ffffff", 0.72, 0.08, { map: patina(false) }),
    copperDark: std("#ffffff", 0.78, 0.08, { map: patina(true) }),
    void: std("#090d0c", 0.95, 0),
    gold: std("#d6a338", 0.3, 0.85),
    goldDark: std("#9a6a1c", 0.42, 0.75),
    bronze: std("#3d2c1b", 0.5, 0.6),
    wood: tiled(real("Wood049", { tint: "#6d4b30" }), 1.5),
    dark: std("#1c1a18", 0.8, 0.1),
    iron: std("#2a2a2e", 0.5, 0.6),
    eye: glow("#d3fc7e", 1.6, 4.2),
    flame: glow("#ffb43a", 1.8, 4.6),
    flameCore: glow("#fff0b8", 2.2, 5.5),
    lamp: glow("#ffd9a0", 0.35, 3.2),
    window: glow("#ffcf8a", 0.12, 1.6),
    // the Opera House: the red granite podium, its paving, the tiled shells, the topaz glass
    podium: tiled(real("Bricks084", { tint: "#9c7462" }), 2.2),
    podiumDark: tiled(real("Bricks084", { tint: "#6e5244" }), 2.2),
    deck: tiled(real("PavingStones128", { tint: "#e4d8c6" }), 2.4),
    steps: tiled(real("Marble021", { tint: "#d9ccb8" }), 2),
    tiles: (() => {
      const m = new THREE.MeshStandardMaterial({ map: shellTiles(), roughness: 0.32, metalness: 0.02, color: "#ffffff" });
      m.userData.shared = true;
      return m;
    })(),
    ribs: (() => {
      const m = new THREE.MeshStandardMaterial({ map: shellRibs(), roughness: 0.9, color: "#e2d9c8", side: THREE.DoubleSide });
      m.userData.shared = true;
      return m;
    })(),
    glass: (() => {
      const t = operaGlass();
      const m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.glow, emissive: new THREE.Color("#ffcf8a"), emissiveIntensity: 0.15, roughness: 0.12, metalness: 0.55, color: "#ffffff", side: THREE.DoubleSide });
      m.userData.shared = true;
      return m;
    })(),
    rail: std("#7d6748", 0.45, 0.7),
    post: std("#463c34", 0.55, 0.5),
    plaque: (() => {
      const m = new THREE.MeshStandardMaterial({ map: tabletTexture(), roughness: 0.32, metalness: 0.8, color: "#ffffff" });
      m.userData.shared = true;
      return m;
    })(),
    zec: (() => {
      const m = new THREE.MeshBasicMaterial({ map: zecMark(), transparent: true, toneMapped: false });
      m.userData.shared = true;
      return m;
    })(),
  };
}
type Mats = ReturnType<typeof makeMats>;

/** Copper gone green: verdigris mottled pale and dark, darker streaks run down where the rain goes. */
function patina(dark: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = dark ? "#3f735f" : "#62a48b";
  g.fillRect(0, 0, 256, 256);
  let seed = dark ? 7 : 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const x = r() * 256,
      y = r() * 256,
      rad = 8 + r() * 26;
    const k = r();
    g.fillStyle = k < 0.45 ? "rgba(140,205,180,0.10)" : k < 0.8 ? "rgba(40,90,72,0.09)" : "rgba(95,75,50,0.06)";
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  // the streaks (v runs up: they hang down from the top of each repeat)
  for (let i = 0; i < 40; i++) {
    const x = r() * 256,
      len = 40 + r() * 200;
    const grd = g.createLinearGradient(0, 0, 0, len);
    grd.addColorStop(0, "rgba(30,70,58,0.32)");
    grd.addColorStop(1, "rgba(30,70,58,0)");
    g.fillStyle = grd;
    g.fillRect(x, 0, 1.5 + r() * 3, len);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.shared = true;
  return t;
}

/** The shells' ceramic lids: the chevron pattern of gloss white and matte cream tiles, the joints. */
function shellTiles() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f1ea";
  g.fillRect(0, 0, 256, 256);
  // the chevrons: rows of tiles, every fourth chevron band in matte cream
  const n = 10;
  const s = 256 / n;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const band = Math.floor((j + Math.abs(i - n / 2)) / 2) % 4 === 0;
      const v = 236 + ((i * 7 + j * 13) % 9);
      g.fillStyle = band ? "#e3d8c2" : `rgb(${v},${v - 2},${v - 7})`;
      g.fillRect(i * s + 0.6, j * s + 0.6, s - 1.2, s - 1.2);
    }
  // the lids' joints: a slightly darker line every quarter
  g.fillStyle = "rgba(170,160,140,0.55)";
  for (let k = 0; k <= 4; k++) g.fillRect(k * 64 - 1, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.shared = true;
  return t;
}

/** The shells' undersides: the precast concrete ribs fanning up. */
function shellRibs() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d8cfbf";
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = "#b9ae9c";
    g.fillRect(i * 16, 0, 3, 128);
    g.fillStyle = "#e6decf";
    g.fillRect(i * 16 + 3, 0, 2, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  return t;
}

/** The pleated topaz glass walls: bronze mullions, smoky glass, the foyers' warm bands (lit at night). */
function operaGlass() {
  const W = 128,
    H = 256;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    return c;
  };
  const a = mk(),
    b = mk();
  const g = a.getContext("2d")!,
    e = b.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#5a5a58");
  sky.addColorStop(1, "#2e2a24");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  e.fillStyle = "#000";
  e.fillRect(0, 0, W, H);
  // (canvas y runs down: v = 0, the glass wall's foot, is the bottom row) the foyers lit warm low down
  for (const [y0, h, k] of [
    [H - 40, 34, 1],
    [H - 92, 30, 0.7],
  ]) {
    g.fillStyle = "#8a6a40";
    g.fillRect(0, y0, W, h);
    e.fillStyle = `rgba(255,255,255,${k})`;
    e.fillRect(0, y0, W, h);
  }
  g.fillStyle = "#4a3a28";
  for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 3, H);
  for (let y = H; y > 0; y -= 26) g.fillRect(0, y - 2, W, 2);
  const map = new THREE.CanvasTexture(a),
    glowMap = new THREE.CanvasTexture(b);
  for (const t of [map, glowMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.userData.shared = true;
  }
  return { map, glow: glowMap };
}

/** The tablet's face: gold, engraved ZIP 32 (and the date the collection was minted). */
function tabletTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 256, 320);
  grd.addColorStop(0, "#e9bb52");
  grd.addColorStop(1, "#c8922c");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 320);
  g.strokeStyle = "#8a5f16";
  g.lineWidth = 8;
  g.strokeRect(14, 14, 228, 292);
  g.fillStyle = "#6a4310";
  g.font = "800 92px Archivo, Roboto, sans-serif";
  g.textAlign = "center";
  g.fillText("ZIP", 128, 140);
  g.fillText("32", 128, 240);
  g.font = "600 22px Archivo, Roboto, sans-serif";
  g.fillText("2026 · 09 · 17", 128, 288);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.shared = true;
  return t;
}

/** ⓩ in gold on the torch's cup. */
function zecMark() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = "#ffcf4a";
  g.lineWidth = 12;
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 13;
  g.beginPath();
  g.moveTo(40, 38);
  g.lineTo(88, 38);
  g.lineTo(40, 90);
  g.lineTo(88, 90);
  g.stroke();
  g.fillStyle = "#ffcf4a";
  g.fillRect(58, 22, 12, 18);
  g.fillRect(58, 88, 12, 18);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  return t;
}

// ---- the zkSNARK Statue ----------------------------------------------------------------------------

/** Liberty's lot: 18 × 18 m, model voxels at 1/6 m (statue.ts): W = D = 108, k = 1. */
const ST = { W: 108, D: 108, k: 1, cx: 54, cz: 54, H: 294 };

/** The fort, the pedestal: the walkable base, always drawn. */
function statueBase(P: Parts, m: Mats) {
  const { cx, cz } = ST;
  // ---- the eleven-point star fort, its walls battered 5 %, a parapet, loopholes, the gate -----
  const N = 11,
    RO = 53,
    RI = 37,
    FH = 20;
  const star = (s: number) => {
    const out: [number, number][] = [];
    for (let i = 0; i < N * 2; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / N;
      const r = (i % 2 ? RO : RI) * s;
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    return out;
  };
  const ring = (s0: number, s1: number, y0: number, y1: number, mat: THREE.Material, inner?: [number, number]) => {
    // the outer wall from s0 at y0 to s1 at y1 (and, with `inner`, the inner face and the top between)
    const a = star(s0),
      b = star(s1);
    const pos: number[] = [];
    const n = a.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      pos.push(a[i][0], y0, a[i][1], a[j][0], y0, a[j][1], b[j][0], y1, b[j][1], a[i][0], y0, a[i][1], b[j][0], y1, b[j][1], b[i][0], y1, b[i][1]);
    }
    if (inner) {
      const c = star(inner[0]),
        d = star(inner[1]);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        // inner face (facing in), the top
        pos.push(c[i][0], y0, c[i][1], d[j][0], y1, d[j][1], c[j][0], y0, c[j][1], c[i][0], y0, c[i][1], d[i][0], y1, d[i][1], d[j][0], y1, d[j][1]);
        pos.push(b[i][0], y1, b[i][1], b[j][0], y1, b[j][1], d[j][0], y1, d[j][1], b[i][0], y1, b[i][1], d[j][0], y1, d[j][1], d[i][0], y1, d[i][1]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    P.add(mat, g);
  };
  const top = 0.95;
  // the scarp, a darker plinth course at the foot, the cordon, the parapet
  ring(1.004, 1.0, -1.5, 1.2, m.podiumDark);
  ring(1.0, top, 1.2, FH, m.fort);
  ring(top + 0.012, top + 0.008, FH - 0.6, FH + 0.6, m.trim);
  ring(top, top - 0.005, FH + 0.6, FH + 3.2, m.fort, [top - 0.06, top - 0.062]);
  // the terrace: a star of lawn, the paving round the pedestal and down the front path
  {
    const s = star(top - 0.06);
    const pos: number[] = [];
    for (let i = 0; i < s.length; i++) {
      const j = (i + 1) % s.length;
      pos.push(cx, FH, cz, s[j][0], FH, s[j][1], s[i][0], FH, s[i][1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    P.add(m.lawn, g);
    const disc = new THREE.CylinderGeometry(40, 40, 0.4, 48);
    disc.translate(cx, FH + 0.2, cz);
    P.add(m.paving, disc);
    P.box(m.paving, cx - 5, FH, cz + 38, cx + 5, FH + 0.4, cz + 48);
  }
  // loopholes: two dark slits on every face of the star
  {
    const s = star(1.0);
    for (let i = 0; i < s.length; i++) {
      const [ax, az] = s[i],
        [bx, bz] = s[(i + 1) % s.length];
      const len = Math.hypot(bx - ax, bz - az);
      const ang = Math.atan2(bz - az, bx - ax);
      for (const t of [0.28, 0.72]) {
        const g = new THREE.BoxGeometry(1.4, 5, 0.6);
        g.rotateY(-ang);
        // (out a hair from the battered face, at mid height)
        const k = 0.975;
        g.translate(cx + (ax + (bx - ax) * t - cx) * k + Math.sin(ang) * 0.1, 11.5, cz + (az + (bz - az) * t - cz) * k - Math.cos(ang) * 0.1);
        void len;
        P.add(m.dark, g);
      }
    }
  }
  // the gate in the front re-entrant angle: a stone portal, an arched oak door, a lamp over it
  {
    const gz = cz + RI * 0.985;
    P.box(m.trim, cx - 9, 0, gz - 3, cx + 9, 18, gz + 1.5);
    P.box(m.fort, cx - 10, 17, gz - 3, cx + 10, 19, gz + 2);
    const arch = new THREE.Shape();
    arch.moveTo(-6, 0);
    arch.lineTo(-6, 9);
    arch.absarc(0, 9, 6, Math.PI, 0, true);
    arch.lineTo(6, 0);
    arch.lineTo(-6, 0);
    const door = new THREE.ExtrudeGeometry(arch, { depth: 0.6, bevelEnabled: false, curveSegments: 12 });
    door.translate(cx, 0.2, gz + 1.3);
    P.add(m.wood, door);
    for (const x of [-3, 0, 3]) P.box(m.iron, cx + x - 0.3, 0.5, gz + 1.85, cx + x + 0.3, 13, gz + 2.1);
    P.box(m.iron, cx - 1.2, 14.6, gz + 1.6, cx + 1.2, 17, gz + 3.2);
    P.box(m.lamp, cx - 0.9, 14.9, gz + 2.6, cx + 0.9, 16.6, gz + 3.3);
    // the path out of the gate to the island's quay
    P.box(m.paving, cx - 8, -0.6, gz + 1.5, cx + 8, 0.4, ST.D);
  }
  // floodlights on the terrace, aimed at the figure
  for (const [fx, fz] of [
    [cx - 30, cz + 32],
    [cx + 30, cz + 32],
    [cx - 34, cz - 20],
    [cx + 34, cz - 20],
  ]) {
    P.box(m.iron, fx - 1.2, FH, fz - 1.2, fx + 1.2, FH + 1.6, fz + 1.2);
    P.box(m.lamp, fx - 1.0, FH + 1.6, fz - 1.0, fx + 1.0, FH + 2.2, fz + 1.0);
  }

  // ---- the pedestal: plinth, rusticated block, cornice, loggia, attic, balcony -----
  P.sq(m.trim, cx, cz, 35, FH - 1, FH + 2);
  P.sq(m.granite, cx, cz, 32, FH + 2, FH + 5);
  const B0 = FH + 5,
    B1 = 56;
  P.sq(m.granite, cx, cz, 28, B0, B1);
  // the rustication's grooves and the quoins standing proud at the corners
  for (let y = B0 + 4.6; y < B1; y += 5) P.sq(m.podiumDark, cx, cz, 28.08, y, y + 0.4);
  for (let y = B0; y < B1 - 1; y += 5) {
    const wide = ((y - B0) / 5) % 2 === 0 ? 8 : 5;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        P.box(m.trim, cx + sx * 29.2, y, cz + sz * 29.2, cx + sx * (29.2 - wide), y + 4.4, cz + sz * 28.2);
        P.box(m.trim, cx + sx * 29.2, y, cz + sz * 29.2, cx + sx * 28.2, y + 4.4, cz + sz * (29.2 - wide));
      }
  }
  // the plaque on the front: bronze in a gold frame (the city's sign plane writes on it)
  const fzP = cz + 28;
  P.box(m.goldDark, cx - 19, 30, fzP, cx + 19, 48, fzP + 1);
  P.box(m.bronze, cx - 18, 31, fzP + 0.6, cx + 18, 47, fzP + 1.8);
  // cornice with its dentils
  P.sq(m.trim, cx, cz, 30, B1, B1 + 2);
  P.sq(m.granite, cx, cz, 31, B1 + 2, B1 + 4);
  for (let i = -28; i < 28; i += 2) {
    P.box(m.trim, cx + i, B1 - 1, cz + 28, cx + i + 1, B1, cz + 29);
    P.box(m.trim, cx + i, B1 - 1, cz - 29, cx + i + 1, B1, cz - 28);
    P.box(m.trim, cx + 28, B1 - 1, cz + i, cx + 29, B1, cz + i + 1);
    P.box(m.trim, cx - 29, B1 - 1, cz + i, cx - 28, B1, cz + i + 1);
  }
  // the loggia: a recessed colonnade on each face (lit windows deep inside), piers at the corners
  const L0 = B1 + 4,
    L1 = 88;
  P.sq(m.granite, cx, cz, 22, L0, L1);
  for (let f = 0; f < 4; f++) {
    // face coordinates: u along, n out
    const put = (u0: number, u1: number, y0: number, y1: number, n0: number, n1: number, mat: THREE.Material) => {
      const [x0, z0, x1, z1] = f === 0 ? [cx + u0, cz + n0, cx + u1, cz + n1] : f === 1 ? [cx - u1, cz - n1, cx - u0, cz - n0] : f === 2 ? [cx + n0, cz - u1, cx + n1, cz - u0] : [cx - n1, cz + u0, cx - n0, cz + u1];
      P.box(mat, x0, y0, z0, x1, y1, z1);
    };
    // corner piers, the lintel, the sill
    put(-26, -19, L0, L1, 22, 26, m.granite);
    put(19, 26, L0, L1, 22, 26, m.granite);
    put(-19, 19, L1 - 4, L1, 22, 26, m.granite);
    put(-19, 19, L0, L0 + 3, 22, 26.6, m.trim);
    // the windows in the back wall
    for (let u = -15; u <= 11; u += 8.6) put(u, u + 4, L0 + 6, L1 - 8, 21.9, 22.05, m.window);
    // the columns
    for (let u = -16; u <= 16; u += 8) {
      const [x, z] = f === 0 ? [cx + u, cz + 24.5] : f === 1 ? [cx - u, cz - 24.5] : f === 2 ? [cx + 24.5, cz - u] : [cx - 24.5, cz + u];
      P.cyl(m.trim, x, L0 + 3, z, 1.5, L1 - 4 - L0 - 3, 14, 1.3);
      P.box(m.trim, x - 2, L1 - 5, z - 2, x + 2, L1 - 4, z + 2);
    }
  }
  P.sq(m.trim, cx, cz, 28, L1, L1 + 2);
  P.sq(m.granite, cx, cz, 27, L1 + 2, L1 + 6);
  P.sq(m.trim, cx, cz, 28, L1 + 6, L1 + 7);
  // the attic with its round medallions
  const A0 = L1 + 7,
    A1 = 110;
  P.sq(m.granite, cx, cz, 24, A0, A1);
  for (let i = -18; i <= 18; i += 9) {
    for (const [x, z, ry] of [
      [cx + i, cz + 24, 0],
      [cx + i, cz - 24, Math.PI],
      [cx + 24, cz + i, Math.PI / 2],
      [cx - 24, cz + i, -Math.PI / 2],
    ] as const) {
      const g = new THREE.CylinderGeometry(3.2, 3.2, 0.8, 20);
      g.rotateX(Math.PI / 2);
      g.rotateY(ry);
      g.translate(x, 100, z);
      P.add(m.trim, g);
    }
  }
  P.sq(m.trim, cx, cz, 27, A1, A1 + 3);
  // the balcony rail round the top
  const Y0 = A1 + 3;
  for (let i = -26.5; i <= 26.5; i += 3)
    for (const [x, z] of [
      [cx + i, cz + 26.5],
      [cx + i, cz - 26.5],
      [cx + 26.5, cz + i],
      [cx - 26.5, cz + i],
    ])
      P.box(m.trim, x - 0.4, Y0, z - 0.4, x + 0.4, Y0 + 3, z + 0.4);
  for (const s of [-1, 1]) {
    P.box(m.trim, cx - 27, Y0 + 3, cz + s * 26.5 - 0.6, cx + 27, Y0 + 3.8, cz + s * 26.5 + 0.6);
    P.box(m.trim, cx + s * 26.5 - 0.6, Y0 + 3, cz - 27, cx + s * 26.5 + 0.6, Y0 + 3.8, cz + 27);
  }
}

/** The figure: zkSNARKs #1 in Liberty's pose, cast in copper gone green. `lod` 1 is the far copy. */
function statueFigure(P: Parts, m: Mats, lod: 0 | 1) {
  const seg = lod ? 18 : 48;
  const Y0 = 113,
    YP = 176,
    XP = 14,
    PX = 3,
    zc = 52;
  // ---- the robe, falling in folds from the shoulders to the pedestal, the cloak over the shoulders
  const xc = XP + 13 * PX - 1;
  const rings: Parameters<Parts["loft"]>[1] = [];
  const robe = (y: number) => {
    const t = (y - Y0) / (YP - Y0);
    const rx = t > 0.75 ? 23 + (t - 0.75) * 16 : t > 0.3 ? 21 + ((t - 0.3) / 0.45) * 2 : 21 + (0.3 - t) * 6;
    return { rx, rz: 18 - t * 3, t };
  };
  for (let y = Y0; y <= YP; y += lod ? 9 : 3) {
    const { rx, rz, t } = robe(y);
    const deep = lod ? 0 : 0.07 * (0.35 + 0.65 * (1 - t));
    rings.push({ y, cx: xc, cz: zc, rx, rz, wob: (a) => 1 + deep * Math.sin(a * 13 + Math.sin(y * 0.06) * 0.8 + (Math.sin(a) < 0 ? 0 : 0.4)) });
  }
  // the shoulders and the cloak drawn in to the neck, under the hood
  for (const [y, rx, rz, dx] of [
    [182, 27, 15.5, 2],
    [188, 25, 14, 4],
    [193, 19, 12, 7],
    [197, 13, 10, 9],
  ])
    rings.push({ y, cx: xc + dx, cz: zc + 1, rx, rz, wob: lod ? undefined : (a) => 1 + 0.03 * Math.sin(a * 9 + y) });
  P.loft(m.copper, rings, seg, true);
  // the hem's step out onto the pedestal, a foot forward from under it
  P.loft(m.copperDark, [
    { y: Y0 - 0.5, cx: xc, cz: zc, rx: 23.4, rz: 18.6 },
    { y: Y0 + 1.5, cx: xc, cz: zc, rx: 23.2, rz: 18.4 },
  ], seg);
  if (!lod) P.limb(m.copper, [xc + 7, Y0 + 3, zc + 15], [xc + 8, Y0 + 2, zc + 22], 4, 3.4);
  // ---- the hood: a deep cowl round the void, two Volt-green eyes ------------------------------
  const hc: V3 = [63.5, 212, zc - 2];
  {
    const g = new THREE.SphereGeometry(1, lod ? 18 : 48, lod ? 14 : 36, 0, Math.PI * 2, 0.66, Math.PI - 0.66);
    g.rotateX(Math.PI / 2);
    g.scale(21, 23, 19);
    g.translate(...hc);
    P.add(m.copper, g);
    // the hood's peak, swept back
    if (!lod) P.limb(m.copper, [hc[0] - 2, hc[1] + 16, hc[2] - 4], [hc[0] - 6, hc[1] + 21, hc[2] - 13], 9, 3);
    // the rim of the opening: a thick lip
    const rim = new THREE.TorusGeometry(1, 0.12, 10, lod ? 20 : 48);
    rim.scale(13.2, 14.8, 13);
    rim.translate(hc[0], hc[1], hc[2] + 19 * Math.cos(0.66) - 0.5);
    P.add(m.copperDark, rim);
    // the void inside, and the eyes
    P.ellipsoid(m.void, [hc[0], hc[1] - 0.5, hc[2] + 2], [17, 19.5, 14.5], lod ? 14 : 32);
    for (const ex of [-6, 6]) {
      const eye = new THREE.BoxGeometry(5.2, 5.6, 1.2, 1, 1, 1);
      eye.translate(hc[0] + ex, hc[1] - 1.5, hc[2] + 16.2);
      P.add(m.eye, eye);
    }
  }
  // ---- the crown: seven rays fanning out from behind the hood ------------------------------------
  for (let i = 0; i < 7; i++) {
    const ang = ((i - 3) / 3) * (Math.PI * 0.36);
    const dx = Math.sin(ang),
      dy = Math.cos(ang);
    const a: V3 = [hc[0] - 2 + dx * 17, hc[1] + dy * 17, hc[2] + 4],
      b: V3 = [hc[0] - 2 + dx * 40, hc[1] + dy * 40, hc[2] + 6];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const g = new THREE.ConeGeometry(2.2, len, 4, 1);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize()));
    g.translate(...a);
    P.add(m.gold, g);
  }
  // ---- the loose pixels: the cloak dissolving off the figure's right, little copper cubes drifting
  if (!lod) {
    const art = SNARK1.map((r) => r.split(""));
    const seen = new Set<number>();
    for (let j = 0; j < 26; j++)
      for (let i = 0; i < 26; i++) {
        if (art[j][i] === "." || seen.has(i + j * 26)) continue;
        // its 4-connected piece
        const piece: [number, number][] = [];
        const st: [number, number][] = [[i, j]];
        seen.add(i + j * 26);
        while (st.length) {
          const [a, b] = st.pop()!;
          piece.push([a, b]);
          for (const [da, db] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const na = a + da,
              nb = b + db;
            if (na < 0 || nb < 0 || na > 25 || nb > 25 || art[nb][na] === "." || seen.has(na + nb * 26)) continue;
            seen.add(na + nb * 26);
            st.push([na, nb]);
          }
        }
        if (piece.length > 3) continue;
        for (const [a, b] of piece) {
          const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
          const r = h - Math.floor(h);
          const x = XP + a * PX + 1.5 - 4 - r * 6,
            y = YP + (25 - b) * PX + 1.5,
            z = zc + (r - 0.5) * 20;
          const g = new THREE.BoxGeometry(2.6, 2.6, 2.6);
          g.rotateY(r * 2);
          g.rotateX(r * 1.3);
          g.translate(x, y, z);
          P.add(art[b][a] === "b" ? m.copper : m.copperDark, g);
        }
      }
  }

  // ---- the raised arm and the torch (its flame where the city puts the torch's light) -----------
  const sh: V3 = [XP + 20 * PX, YP + 8, zc - 1],
    el: V3 = [XP + 23 * PX + 2, YP + 44, zc + 1],
    wr: V3 = [XP + 24 * PX, YP + 70, zc + 2];
  const s = lod ? 10 : 18;
  P.limb(m.copper, sh, el, 10, 7.5, s);
  if (!lod) P.limb(m.copper, [el[0] + 2, el[1] - 2, el[2]], [el[0] + 4, el[1] - 22, el[2] - 1], 6, 3.5, s);
  P.limb(m.copper, el, wr, 5.5, 4.5, s);
  P.ellipsoid(m.copper, [wr[0], wr[1] + 3, wr[2]], [6, 6.5, 6], s);
  const [tx, , tz] = wr;
  P.cyl(m.goldDark, tx, wr[1] + 6, tz, 2.8, 10, 12, 3.2);
  P.cyl(m.gold, tx, wr[1] + 9, tz, 4.2, 1.2, 16);
  const cupY = wr[1] + 16;
  P.cyl(m.goldDark, tx, cupY, tz, 5, 10, s, 9);
  P.cyl(m.gold, tx, cupY + 8, tz, 11, 1.2, lod ? 16 : 32);
  P.cyl(m.gold, tx, cupY + 10, tz, 10.6, 0.8, lod ? 16 : 32);
  if (!lod)
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      P.cyl(m.goldDark, tx + Math.cos(ang) * 10.4, cupY + 9.2, tz + Math.sin(ang) * 10.4, 0.35, 1.6, 6);
    }
  if (!lod) {
    const mark = new THREE.PlaneGeometry(9, 9);
    mark.translate(tx, cupY + 4.4, tz + 7.6);
    P.add(m.zec, mark, true);
    setUv(mark, [0, 0, 1, 0, 0, 1, 1, 1]);
  }
  // the flame: licking tongues round a bright core
  const flameY = cupY + 11;
  {
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      prof.push(new THREE.Vector2(8.5 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.22 + t * 0.85)), 0.8) * (1 - t * 0.35) + 0.01, t * (ST.H - flameY)));
    }
    const g = new THREE.LatheGeometry(prof, lod ? 10 : 28);
    if (!lod) {
      const p = g.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        const k = 0.8 + 0.22 * Math.sin(Math.atan2(z, x) * 5 + y * 0.35);
        p.setXYZ(i, x * k, y, z * k);
      }
      g.computeVertexNormals();
    }
    g.translate(tx, flameY, tz);
    P.add(m.flame, g);
    const core = new THREE.LatheGeometry(prof.map((v) => new THREE.Vector2(v.x * 0.55, v.y * 0.8)), 12);
    core.translate(tx, flameY + 0.5, tz);
    P.add(m.flameCore, core);
  }

  // ---- the other arm, the tablet held against the body -------------------------------------------
  const tabX0 = XP + 2 * PX,
    tabX1 = tabX0 + 28,
    tabY0 = 130,
    tabY1 = 164,
    tabZ = zc + 19;
  P.limb(m.copper, [XP + 6 * PX, YP + 4, zc], [tabX0 + 4, 146, zc + 9], 8, 6, s);
  P.limb(m.copper, [tabX0 + 4, 146, zc + 9], [tabX0 + 6, tabY0 - 1, tabZ - 3], 4.5, 4, s);
  P.box(m.goldDark, tabX0, tabY0, tabZ - 4, tabX1, tabY1, tabZ - 0.2);
  {
    const face = new THREE.PlaneGeometry(tabX1 - tabX0 - 1, tabY1 - tabY0 - 1);
    face.translate((tabX0 + tabX1) / 2, (tabY0 + tabY1) / 2, tabZ);
    setUv(face, [0, 1, 1, 1, 0, 0, 1, 0]);
    P.add(m.plaque, face, true);
  }
  P.ellipsoid(m.copper, [tabX0 + 6, tabY0 + 1, tabZ - 1], [4.5, 4.5, 4.5], s);
}

/** Set a plane's 4 UVs (BufferGeometry from PlaneGeometry: top-left, top-right, bottom-left, bottom-right). */
function setUv(g: THREE.BufferGeometry, uv: number[]) {
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
}

// ---- the Opera House -----------------------------------------------------------------------------

/** Bennelong Point's lot: 44 × 38 m, model voxels at 1/3 m (opera.ts): W 132, D 114, k = 2. */
const OP = { W: 132, D: 114, k: 2 };

function operaBase(P: Parts, m: Mats) {
  const { W, D } = OP;
  const mid = Math.floor(W / 2);
  // the broadwalk round it all: big granite slabs, one voxel up; the sea wall's edge
  P.box(m.deck, 0, -2, 0, W, 1, D);
  // the sea wall's railing (bronze), open where the promenade comes in
  const gap0 = mid - 15,
    gap1 = mid + 15;
  const railRun = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 6));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      P.box(m.post, x0 + (x1 - x0) * t - 0.25, 1, z0 + (z1 - z0) * t - 0.25, x0 + (x1 - x0) * t + 0.25, 4, z0 + (z1 - z0) * t + 0.25);
    }
    P.beam(m.rail, [x0, 4, z0], [x1, 4, z1], 0.45);
    P.beam(m.post, [x0, 2.4, z0], [x1, 2.4, z1], 0.2);
  };
  railRun(0.5, 0.5, W - 0.5, 0.5);
  railRun(0.5, 0.5, 0.5, D - 0.5);
  railRun(W - 0.5, 0.5, W - 0.5, D - 0.5);
  railRun(0.5, D - 0.5, gap0, D - 0.5);
  railRun(gap1, D - 0.5, W - 0.5, D - 0.5);

  // ---- the podium: red granite panels, a cornice, the paved deck on top -----
  const PX0 = 7,
    PX1 = W - 7,
    PZ0 = 5,
    PZ1 = 78,
    PY = 13,
    PT = PY + 1;
  P.box(m.podium, PX0, 1, PZ0, PX1, PY - 1, PZ1);
  for (let y = 4; y < PY - 1; y += 3) {
    P.box(m.podiumDark, PX0 - 0.1, y, PZ0 - 0.1, PX1 + 0.1, y + 0.25, PZ0);
    P.box(m.podiumDark, PX0 - 0.1, y, PZ0, PX0, y + 0.25, PZ1);
    P.box(m.podiumDark, PX1, y, PZ0, PX1 + 0.1, y + 0.25, PZ1);
  }
  P.box(m.trim, PX0 - 1, PY - 1, PZ0 - 1, PX1 + 1, PY, PZ1);
  P.box(m.deck, PX0, PY, PZ0, PX1, PT, PZ1);
  // doors and lit windows in the podium's sides
  for (let z = PZ0 + 8; z < PZ1 - 6; z += 12)
    for (const x of [PX0 - 0.1, PX1 + 0.1]) {
      P.box(m.dark, x - 0.3, 1, z, x + 0.3, 7, z + 4);
      P.box(m.window, x - 0.4, 2, z + 1, x + 0.4, 6, z + 3);
    }
  for (let x = PX0 + 6; x < PX1 - 6; x += 10) {
    P.box(m.dark, x, 3, PZ0 - 0.4, x + 5, 8, PZ0);
    P.box(m.window, x, 4, PZ0 - 0.5, x + 5, 5, PZ0 - 0.3);
  }
  // the deck's railing round its open sides
  const deckRail = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 6));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      P.box(m.post, x0 + (x1 - x0) * t - 0.2, PT, z0 + (z1 - z0) * t - 0.2, x0 + (x1 - x0) * t + 0.2, PT + 3, z0 + (z1 - z0) * t + 0.2);
    }
    P.beam(m.rail, [x0, PT + 3, z0], [x1, PT + 3, z1], 0.4);
  };
  deckRail(PX0 + 0.5, PZ0 + 0.5, PX1 - 0.5, PZ0 + 0.5);
  deckRail(PX0 + 0.5, PZ0 + 0.5, PX0 + 0.5, PZ1);
  deckRail(PX1 - 0.5, PZ0 + 0.5, PX1 - 0.5, PZ1);

  // ---- the monumental steps (the full width), their handrails; the Bennelong wing -----
  const SX0 = 34,
    SX1 = PX1,
    NSTEP = PY;
  for (let i = 0; i < NSTEP; i++) {
    const y1 = PT - i,
      z0 = PZ1 + i * 2;
    P.box(m.steps, SX0, 1, z0, SX1, y1, z0 + 2);
    // the nosing's shadow line
    P.box(m.podiumDark, SX0, y1 - 0.12, z0 + 1.9, SX1, y1 - 0.02, z0 + 2.02);
  }
  const SZ1 = PZ1 + NSTEP * 2;
  for (const hx of [SX0 + 2, SX0 + 24, mid + 14, SX1 - 26, SX1 - 3]) {
    P.beam(m.rail, [hx + 0.5, PT + 3, PZ1], [hx + 0.5, 1 + 3.6, SZ1], 0.35);
    for (let i = 0; i < NSTEP; i += 3) P.box(m.post, hx + 0.3, PT - i, PZ1 + i * 2 + 0.8, hx + 0.7, PT - i + 3.2, PZ1 + i * 2 + 1.2);
  }
  const BX0 = PX0,
    BX1 = SX0,
    BZ1 = PZ1 + 20;
  P.box(m.podium, BX0, 1, PZ1, BX1, PY, BZ1);
  P.box(m.deck, BX0, PY, PZ1, BX1, PY + 1, BZ1);
  P.box(m.glass, BX0 + 3, 2, BZ1 - 0.6, BX1 - 3, 10, BZ1 - 0.2);
  for (let x = BX0 + 3; x <= BX1 - 3; x += 4) P.box(m.post, x - 0.2, 2, BZ1 - 0.7, x + 0.2, 10, BZ1 - 0.1);
  P.box(m.window, BX0 + 3, 3, BZ1 - 0.15, BX1 - 3, 4, BZ1 - 0.05);
  deckRail(BX0 + 0.5, BZ1 - 0.5, BX1, BZ1 - 0.5);
  P.box(m.podium, SX0, 1, SZ1 - 3, SX0 + 2, 9, SZ1);
  // the low granite wall on the forecourt that carries the name (the city's sign plane)
  P.box(m.podium, BX0 + 2, 1, D - 7, BX1 - 2, 4, D - 4);
  P.box(m.trim, BX0 + 2, 4, D - 7, BX1 - 2, 5, D - 4);
  // lamps on the forecourt and along the broadwalk
  const lampAt = (x: number, z: number, h: number) => {
    P.cyl(m.post, x, 1, z, 0.35, h * 3, 8, 0.25);
    P.box(m.post, x - 0.9, 1 + h * 3, z - 0.9, x + 0.9, 1.6 + h * 3, z + 0.9);
    P.box(m.lamp, x - 0.7, 0.4 + h * 3, z - 0.7, x + 0.7, 1 + h * 3, z + 0.7);
  };
  for (const x of [SX0 + 4, mid - 18, mid + 18, SX1 - 4]) lampAt(x, SZ1 + 4, 4.2);
  for (let z = 10; z < D - 6; z += 22) {
    lampAt(3, z, 3.6);
    lampAt(W - 4, z, 3.6);
  }
}

interface Shell {
  cx: number;
  zt: number;
  zm: number;
  zb: number;
  h: number;
  w: number;
  dir: -1 | 1;
  y0: number;
  glass?: boolean;
}

const OPV = new THREE.Vector3();
/** Where the Concert Hall's foyer opens on the top of the steps (model voxels): the door, its floor. */
const OPERA_DOOR = { x: 46, y: 14, z: 76.2 };

/**
 * The opera house's own floors in its model voxels (operaBase's): the podium's deck (y 14), the
 * Monumental Steps down from its south edge (one voxel a step, two deep), the Bennelong wing's
 * terrace beside them; null where the broadwalk (the street's level) is.
 */
function operaFloor(x: number, z: number): number | null {
  const { W } = OP;
  const PX0 = 7,
    PX1 = W - 7,
    PZ0 = 5,
    PZ1 = 78,
    PT = 14,
    SX0 = 34,
    NSTEP = 13,
    BZ1 = PZ1 + 20;
  if (x >= PX0 && x <= PX1 && z >= PZ0 && z <= PZ1) return PT;
  if (x >= SX0 && x <= PX1 && z > PZ1 && z < PZ1 + NSTEP * 2) {
    const i = Math.floor((z - PZ1) / 2);
    return PT - i;
  }
  if (x >= PX0 && x < SX0 && z > PZ1 && z <= BZ1) return PT;
  return null;
}

/** The halls' shells (opera.ts), in its model voxels. */
function operaShells(): Shell[] {
  const PZ1 = 78,
    PT = 14,
    CH = 46,
    JS = 98;
  const BC = (7 + 34) / 2;
  return [
    { cx: CH, zt: PZ1 - 1, zm: PZ1 - 8, zb: PZ1 - 20, h: 22, w: 13, dir: 1, y0: PT, glass: true },
    { cx: JS, zt: PZ1 - 1, zm: PZ1 - 8, zb: PZ1 - 18, h: 19, w: 11, dir: 1, y0: PT, glass: true },
    { cx: CH, zt: 40, zm: 50, zb: 66, h: 40, w: 17, dir: -1, y0: PT, glass: true },
    { cx: JS, zt: 43, zm: 52, zb: 66, h: 34, w: 15, dir: -1, y0: PT, glass: true },
    { cx: CH, zt: 23, zm: 36, zb: 54, h: 56, w: 20, dir: -1, y0: PT, glass: true },
    { cx: JS, zt: 27, zm: 39, zb: 56, h: 48, w: 17, dir: -1, y0: PT, glass: true },
    { cx: CH, zt: 6, zm: 22, zb: 40, h: 72, w: 23, dir: -1, y0: PT, glass: true },
    { cx: JS, zt: 11, zm: 25, zb: 42, h: 62, w: 20, dir: -1, y0: PT, glass: true },
    { cx: BC, zt: PZ1 + 4, zm: PZ1 - 3, zb: PZ1 - 16, h: 13, w: 9, dir: 1, y0: PT },
    { cx: BC, zt: PZ1 + 12, zm: PZ1 + 5, zb: PZ1 - 8, h: 19, w: 11, dir: 1, y0: PT, glass: true },
    { cx: BC, zt: PZ1 + 19, zm: PZ1 + 12, zb: PZ1 - 2, h: 25, w: 12, dir: 1, y0: PT, glass: true },
  ];
}

/**
 * A shell as surfaces: the tiled lid (its outer face, the voxel version's outline: tallest at the
 * tip, falling to the back, a pointed arch across), its ribbed underside a little inside, the
 * mouth's edge between them, and the pleated glass wall set back in the mouth.
 */
function shell(P: Parts, m: Mats, s: Shell, lod: 0 | 1) {
  const AR = 1.7,
    A0 = Math.sqrt(AR * AR - (AR - 1) ** 2);
  const arch = (u: number) => Math.sqrt(Math.max(0, AR * AR - (u + AR - 1) ** 2)) / A0;
  const L = Math.abs(s.zb - s.zt),
    bm = Math.abs(s.zm - s.zt);
  const sgn = s.dir < 0 ? 1 : -1;
  const rb = (b: number, t = 0) => s.h * Math.pow(Math.max(0, 1 - b / L), 0.8) - t;
  const wb = (b: number, t = 0) => s.w * (1 - 0.32 * (b / L)) - t;
  /** Where the lid starts along b (the mouth) at u: b = bm (1 − y/h)^0.62, y on the lid. */
  const b0 = (u: number, t: number) => {
    let lo = 0,
      hi = L * 0.98;
    for (let i = 0; i < 24; i++) {
      const b = (lo + hi) / 2;
      const y = Math.max(0, rb(b, t)) * arch(u);
      const cut = bm * Math.pow(Math.max(0, 1 - y / s.h), 0.62);
      if (b < cut) lo = b;
      else hi = b;
    }
    return hi;
  };
  const NU = lod ? 10 : 28,
    NB = lod ? 8 : 22;
  const surf = (t: number, flip: boolean, mat: THREE.Material, uvScale: number) => {
    const pos: number[] = [],
      uv: number[] = [];
    const P3 = (u: number, k: number): V3 => {
      const ua = Math.abs(u);
      const bs = b0(ua, t);
      const b = bs + (L - bs) * k;
      const y = Math.max(0, rb(b, t)) * arch(ua);
      return [s.cx + u * Math.max(0.01, wb(b, t)), s.y0 + y, s.zt + sgn * b];
    };
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < NB; j++) {
        const u0 = -1 + (2 * i) / NU,
          u1 = -1 + (2 * (i + 1)) / NU,
          k0 = j / NB,
          k1 = (j + 1) / NB;
        const q = [P3(u0, k0), P3(u1, k0), P3(u1, k1), P3(u0, k1)];
        const quv = [
          [u0 * s.w * uvScale, k0 * L * uvScale],
          [u1 * s.w * uvScale, k0 * L * uvScale],
          [u1 * s.w * uvScale, k1 * L * uvScale],
          [u0 * s.w * uvScale, k1 * L * uvScale],
        ];
        const order = (sgn > 0) !== flip ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const o of order) pos.push(...q[o]), uv.push(...quv[o]);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    P.add(mat, smooth(g), true);
    return P3;
  };
  // (tiles every ~2 m: the model voxel is 1/3 m)
  const outer = surf(0, false, m.tiles, 1 / 12);
  const inner = surf(1.1, true, m.ribs, 1 / 6);
  // the mouth's edge: the strip from the lid's lip to the underside's
  {
    const pos: number[] = [];
    for (let i = 0; i < NU; i++) {
      const u0 = -1 + (2 * i) / NU,
        u1 = -1 + (2 * (i + 1)) / NU;
      const a = outer(u0, 0),
        b = outer(u1, 0),
        c = inner(u1, 0),
        d = inner(u0, 0);
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    P.add(m.ribs, g);
  }
  if (!s.glass) return;
  // the glass wall in the mouth: pleated, set back ~2 voxels, up to the underside
  const NY = lod ? 6 : 16,
    NX = lod ? 8 : 24;
  const pos: number[] = [],
    uv: number[] = [];
  const G = (fx: number, fy: number): V3 => {
    const yr = fy * s.h * 0.98;
    const bf = bm * Math.pow(1 - yr / s.h, 0.62) + 2.2;
    const hgt = Math.max(0.01, rb(bf, 2.2));
    // the half width at that height under the lid: arch(u) = yr / hgt
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 18; i++) {
      const u = (lo + hi) / 2;
      if (arch(u) * hgt > yr) lo = u;
      else hi = u;
    }
    const x = s.cx + fx * lo * Math.max(0.01, wb(bf, 2.2));
    const pleat = lod ? 0 : (Math.round(fx * NX) % 2 === 0 ? 0 : 0.9);
    return [x, s.y0 + yr, s.zt + sgn * (bf + pleat)];
  };
  for (let i = 0; i < NX; i++)
    for (let j = 0; j < NY; j++) {
      const x0 = -1 + (2 * i) / NX,
        x1 = -1 + (2 * (i + 1)) / NX,
        y0 = j / NY,
        y1 = (j + 1) / NY;
      const q = [G(x0, y0), G(x1, y0), G(x1, y1), G(x0, y1)];
      const quv = [
        [x0 * s.w * 0.12, y0],
        [x1 * s.w * 0.12, y0],
        [x1 * s.w * 0.12, y1],
        [x0 * s.w * 0.12, y1],
      ];
      for (const o of [0, 1, 2, 0, 2, 3]) pos.push(...q[o]), uv.push(...quv[o]);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  P.add(m.glass, g, true);
}

// ---- in the city -----------------------------------------------------------------------------------

/** The statue and the opera house, put where the city laid out their lots; lit by the evening. */
export class BayMarks {
  readonly group = new THREE.Group();
  /** The opera house's model frame: world → its voxels (to walk its steps and podium). */
  private operaInv: THREE.Matrix4 | null = null;
  private operaMat: THREE.Matrix4 | null = null;
  constructor(city: City) {
    this.group.name = "baymarks";
    const m = (M ??= makeMats());
    const place = (kind: string, W: number, D: number, k: number, base: (P: Parts) => void, detail: (P: Parts, lod: 0 | 1) => void) => {
      const lm = city.landmarks.get(kind);
      if (!lm) return;
      const full = lm.occluder.full;
      const holder = new THREE.Group();
      holder.name = `real:${kind}`;
      holder.position.copy(full.position);
      holder.rotation.copy(full.rotation);
      const frame = frameOf(W, D, k);
      const b = new Parts(frame);
      base(b);
      holder.add(b.build(`${kind}:base`));
      const near = new Parts(frame),
        far = new Parts(frame);
      detail(near, 0);
      detail(far, 1);
      const lod = new THREE.LOD();
      lod.addLevel(near.build(`${kind}:near`), 0);
      lod.addLevel(far.build(`${kind}:far`, false), 220);
      holder.add(lod);
      (full.parent ?? this.group).add(holder);
      holder.updateMatrixWorld(true);
      if (kind === "opera") {
        this.operaMat = holder.matrixWorld.clone().multiply(frame);
        this.operaInv = this.operaMat.clone().invert();
      }
      // the occluder: its box (hover, the walls-down view) is the real model's now, and an unseen
      // box in the landmark's own group answers the mouse (hover and click in the city's view)
      lm.occluder.box.setFromObject(holder);
      lm.occluder.height = lm.occluder.box.max.y;
      const lb = new THREE.Box3();
      holder.traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        if (!g) return;
        g.computeBoundingBox();
        lb.union(g.boundingBox!);
      });
      const size = lb.getSize(new THREE.Vector3()),
        mid = lb.getCenter(new THREE.Vector3());
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z).translate(mid.x, mid.y, mid.z), new THREE.MeshBasicMaterial({ visible: false }));
      proxy.name = `real:${kind}:pick`;
      proxy.userData.noField = true;
      full.add(proxy);
    };
    place("statue", ST.W, ST.D, ST.k, (P) => statueBase(P, m), (P, lod) => statueFigure(P, m, lod));
    place("opera", OP.W, OP.D, OP.k, (P) => operaBase(P, m), (P, lod) => {
      for (const s of operaShells()) shell(P, m, s, lod);
    });
    void BAY;
  }

  /** (x, z) in the opera house's model voxels (x across, z from the harbour end to the forecourt), or null. */
  private opModel(x: number, z: number) {
    if (!this.operaInv) return null;
    const v = OPV.set(x, 0, z).applyMatrix4(this.operaInv);
    return v.x < -2 || v.x > OP.W + 2 || v.z < -2 || v.z > OP.D + 2 ? null : v;
  }

  /**
   * On foot on the opera house (its own floors, over what the street's plan knows): the Monumental Steps
   * a step at a time, the podium's deck under the shells, the Bennelong wing's terrace. Null elsewhere.
   */
  groundAt(x: number, z: number): number | null {
    const v = this.opModel(x, z);
    if (!v) return null;
    const y = operaFloor(v.x, v.z);
    if (y === null) return null;
    return OPV.set(0, y, 0).applyMatrix4(this.operaMat!).y;
  }

  /** Up on the opera house's podium: the shells (its halls, its foyers' glass) stop a body. */
  blocked(x: number, z: number) {
    const v = this.opModel(x, z);
    if (!v || operaFloor(v.x, v.z) === null) return false;
    for (const s of operaShells()) {
      const z0 = Math.min(s.zt, s.zb),
        z1 = Math.max(s.zt, s.zb);
      // (the foyer's glass set back in a south shell's mouth: the last metre and a half under its lid open)
      const mouth = s.dir > 0 ? 4.5 : 0;
      if (Math.abs(v.x - s.cx) < s.w * 0.92 && v.z > z0 - 0.5 && v.z < z1 - mouth) return true;
    }
    return false;
  }

  /** The opera house's front door: in the Concert Hall's foyer glass at the top of the Monumental Steps, facing down them. */
  operaDoor(): { x: number; y: number; z: number; fx: number; fz: number } | null {
    if (!this.operaMat) return null;
    const p = new THREE.Vector3(OPERA_DOOR.x, OPERA_DOOR.y, OPERA_DOOR.z).applyMatrix4(this.operaMat);
    const q = new THREE.Vector3(OPERA_DOOR.x, OPERA_DOOR.y, OPERA_DOOR.z + 6).applyMatrix4(this.operaMat);
    const f = q.sub(p).setY(0).normalize();
    return { x: p.x, y: p.y, z: p.z, fx: f.x, fz: f.z };
  }

  /** The eyes, the torch, the lamps and the foyers by the evening's light. */
  update() {
    const k = GLASS_NIGHT.value;
    for (const g of glowing) g.m.color.copy(g.c).multiplyScalar(g.day + (g.night - g.day) * k);
    if (M) M.glass.emissiveIntensity = 0.15 + 1.3 * k;
  }
}
