import * as THREE from "three";
import { canvasTex, type MuseumKit } from "./kit";
import { SANS } from "./parts";
import { median, pad2, type Purge, traitOf } from "./purge";

/**
 * The explorer's Apparitions views as holograms over projector discs in the Aile des Apparitions:
 * Strategies, Flow and Holes, each looping a short animation from the purge's data. They share one
 * look: additive light, screen-space scan lines and a faint flicker, a cone rising from the disc.
 */

const N = 10000;
const CYAN = new THREE.Color("#7fe6ff");
const GOLD = new THREE.Color("#ffc94a");
/** The explorer's trait palette (dark), most common lineage first, then "Other". */
const PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"].map((c) => new THREE.Color(c));
const OTHER = new THREE.Color("#8a8984");

export const holoTime = { value: 0 };

/** An additive, unlit, scan-lined material. */
export function holoMat(o: { map?: THREE.Texture | null; color?: THREE.ColorRepresentation; opacity?: number; vertexColors?: boolean } = {}) {
  const m = new THREE.MeshBasicMaterial({
    map: o.map ?? null,
    color: o.color ?? "#ffffff",
    transparent: true,
    opacity: o.opacity ?? 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    vertexColors: o.vertexColors ?? false,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = holoTime;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <dithering_fragment>",
        "gl_FragColor.rgb *= (0.72 + 0.28 * step(0.45, fract(gl_FragCoord.y * 0.22 - uTime * 1.6))) * (0.94 + 0.06 * sin(uTime * 37.0));\n#include <dithering_fragment>",
      );
  };
  m.customProgramCacheKey = () => "holo";
  return m;
}

/** A text label drawn once on a canvas sized to it; `h`: the letters' height in metres. */
function label(text: string, h: number, o: { size?: number; color?: string; weight?: number; align?: "left" | "center" | "right" } = {}) {
  const size = o.size ?? 64;
  const font = `${o.weight ?? 700} ${size}px ${SANS}`;
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = font;
  const cw = Math.ceil(m.measureText(text).width + size * 0.6),
    ch = Math.round(size * 1.5);
  const tex = canvasTex(cw, ch, (c) => {
    c.fillStyle = o.color ?? "#bff4ff";
    c.font = font;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, cw / 2, ch / 2);
  });
  const w = (h * 1.5 * cw) / ch;
  const geo = new THREE.PlaneGeometry(w, h * 1.5);
  // anchor: the left or right end at the origin, or the middle
  if (o.align === "left") geo.translate(w / 2, 0, 0);
  if (o.align === "right") geo.translate(-w / 2, 0, 0);
  const mesh = new THREE.Mesh(geo, holoMat({ map: tex }));
  mesh.raycast = () => {};
  return mesh;
}

/** The disc a hologram stands on: dark, a glowing rim, a faint cone of light up from it. */
export function projector(k: MuseumKit, f: number, x: number, z: number, r: number, h: number) {
  const g = k.groups[f];
  const base = new THREE.MeshStandardMaterial({ color: "#0b0b0e", roughness: 0.35, metalness: 0.5 });
  k.geo(f, base, new THREE.CylinderGeometry(r, r * 1.06, 0.3, 48).translate(x, 0.15, z));
  k.solid(f, x - r, z - r, x + r, z + r);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.96, 0.03, 6, 64).rotateX(Math.PI / 2), holoMat({ color: CYAN.clone().multiplyScalar(1.6) }));
  rim.position.set(x, 0.31, z);
  g.add(rim);
  const fade = canvasTex(4, 256, (c, w, hh) => {
    const gr = c.createLinearGradient(0, 0, 0, hh);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(1, "rgba(255,255,255,1)");
    c.fillStyle = gr;
    c.fillRect(0, 0, w, hh);
  });
  // seen from outside only: standing in it, it would tint the whole view
  const coneMat = holoMat({ map: fade, color: CYAN, opacity: 0.09 });
  coneMat.side = THREE.FrontSide;
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.35, r * 0.9, h, 48, 1, true), coneMat);
  cone.position.set(x, 0.3 + h / 2, z);
  cone.raycast = () => {};
  g.add(cone);
  k.pool(f, x, z, r * 2.2, "#7fe6ff", 0.012, 0.7);
}

/** Every item's average colour (the atlas downscaled to one pixel a cell), brightened to read as light. */
export function avgColours(atlas: CanvasImageSource) {
  const c = document.createElement("canvas");
  c.width = c.height = 100;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(atlas, 0, 0, 3200, 3200, 0, 0, 100, 100);
  const d = g.getImageData(0, 0, 100, 100).data;
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = d[i * 4],
      gg = d[i * 4 + 1],
      b = d[i * 4 + 2];
    const m = Math.max(r, gg, b, 1);
    const k = Math.min(3, 230 / m);
    out[i * 3] = (r * k) / 255;
    out[i * 3 + 1] = (gg * k) / 255;
    out[i * 3 + 2] = (b * k) / 255;
  }
  return out;
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Turn a group to face the visitor about the vertical. */
function face(g: THREE.Object3D, cam: THREE.Vector3) {
  const wp = g.parent ? g.parent.localToWorld(g.position.clone()) : g.position;
  g.rotation.y = Math.atan2(cam.x - wp.x, cam.z - wp.z);
}

function scratch() {
  return { m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color() };
}

/* ---------- Strategies: 26 rows of light, re-sorted by median, a scan across the ranks ---------- */

export class HoloStrategies {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  private pts: THREE.InstancedMesh | null = null;
  private meds: THREE.InstancedMesh | null = null;
  private scan: THREE.Mesh;
  private rows: { med: number; ps: { item: number; rank: number; lane: number }[]; order: number; byMed: number }[] = [];
  private cols: Float32Array | null = null;
  private W = 9;
  private H = 5.2;
  private T = 16;
  private caption: THREE.Mesh | null = null;

  constructor() {
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(this.W + 1, this.H + 2, 1), new THREE.MeshBasicMaterial({ visible: false }));
    this.group.add(this.hit);
    this.scan = new THREE.Mesh(new THREE.PlaneGeometry(0.05, this.H + 0.4), holoMat({ color: CYAN.clone().multiplyScalar(2) }));
    this.scan.raycast = () => {};
    this.group.add(this.scan);
    const t = label("WHAT EACH HOLDER CHOSE TO BURN", 0.32);
    t.position.set(0, this.H / 2 + 0.75, 0);
    this.group.add(t);
    for (const [txt, x, align] of [
      ["rarest", -this.W / 2 + 0.6, "left"],
      ["commonest", this.W / 2 - 0.6, "right"],
    ] as const) {
      const l = label(txt, 0.2, { color: "#8fd8ec", weight: 500, align });
      l.position.set(x, -this.H / 2 - 0.3, 0);
      this.group.add(l);
    }
    const axis = new THREE.Mesh(new THREE.PlaneGeometry(this.W, 0.02), holoMat({ color: CYAN }));
    axis.position.y = -this.H / 2 - 0.08;
    axis.raycast = () => {};
    this.group.add(axis);
  }

  load(p: Purge, cols: Float32Array) {
    this.cols = cols;
    const rows = p.apps.map((a, order) => {
      const ps = p.of(a).map((x) => ({ item: x.item, rank: x.rank ?? N, lane: 0 }));
      ps.sort((a2, b2) => a2.rank - b2.rank);
      // lanes so neighbours stand apart in depth
      const last = [-Infinity, -Infinity, -Infinity];
      for (const s of ps) {
        const x = this.x(s.rank);
        let l = last.findIndex((v) => x - v > 0.16);
        if (l < 0) l = last.indexOf(Math.min(...last));
        last[l] = x;
        s.lane = l;
      }
      return { med: median(ps.map((s) => s.rank)), ps, order, byMed: 0 };
    });
    [...rows].sort((a, b) => a.med - b.med).forEach((r, i) => (r.byMed = i));
    this.rows = rows;
    const n = rows.reduce((a, r) => a + r.ps.length, 0);
    this.pts = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.15, 0.15), holoMat(), n);
    this.pts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.pts.frustumCulled = false;
    this.pts.raycast = () => {};
    this.meds = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 1), holoMat({ color: new THREE.Color("#4ea8de").multiplyScalar(2.2) }), rows.length);
    this.meds.frustumCulled = false;
    this.meds.raycast = () => {};
    this.group.add(this.pts, this.meds);
    const rare = rows.filter((r) => r.med < 4000).length,
      common = rows.filter((r) => r.med > 7000).length;
    this.caption = label(`${common} burned their commons · ${rare} gave up rare ones`, 0.26, { color: "#ffd98a", weight: 600 });
    this.caption.position.set(0, -this.H / 2 - 0.85, 0);
    this.group.add(this.caption);
  }

  private x(rank: number) {
    return -this.W / 2 + ((rank - 1) / (N - 1)) * this.W;
  }

  update(t: number, cam: THREE.Vector3) {
    face(this.group, cam);
    const pts = this.pts,
      meds = this.meds,
      cols = this.cols;
    if (!pts || !meds || !cols) return;
    const s = t % this.T;
    const rowH = this.H / this.rows.length;
    const sort = smooth((s - 4.5) / 2);
    const out = 1 - smooth((s - (this.T - 1)) / 0.8);
    const scanX = s > 7 && s < 13 ? -this.W / 2 + (((s - 7) % 3) / 3) * this.W : -99;
    this.scan.position.x = scanX;
    this.scan.visible = scanX > -50;
    const rarePulse = s > 9 && s < 11 ? 0.5 + 0.5 * Math.sin(t * 8) : 0;
    const commonPulse = s > 11 && s < 13 ? 0.5 + 0.5 * Math.sin(t * 8) : 0;
    const { m, q, p, s: sc, c } = scratch();
    let n = 0;
    this.rows.forEach((r, ri) => {
      const idx = r.order + (r.byMed - r.order) * sort;
      const y = this.H / 2 - (idx + 0.5) * rowH;
      const rare = r.byMed < 4 ? rarePulse : 0;
      const common = r.byMed >= this.rows.length - 14 ? commonPulse : 0;
      r.ps.forEach((pt, j) => {
        const arrive = smooth((s - 0.2 - ri * 0.06 - j * 0.012) / 1.4);
        const tx = this.x(pt.rank);
        const x = -this.W / 2 - 0.8 + (tx + this.W / 2 + 0.8) * arrive;
        const z = (pt.lane - 1) * 0.18 + Math.sin(t * 1.3 + pt.item) * 0.03;
        const near = scanX > -50 ? Math.max(0, 1 - Math.abs(tx - scanX) / 0.35) : 0;
        const k = arrive * out * (1 + near * 0.6);
        m.compose(p.set(x, y + (pt.lane - 1) * rowH * 0.18, z), q.identity(), sc.setScalar(Math.max(0.0001, k)));
        pts.setMatrixAt(n, m);
        const i = (pt.item - 1) * 3;
        c.setRGB(cols[i], cols[i + 1], cols[i + 2]).multiplyScalar(0.85 + near * 1.5);
        if (rare) c.lerp(GOLD, rare * 0.7);
        if (common) c.lerp(CYAN, common * 0.5);
        pts.setColorAt(n, c);
        n++;
      });
      const mh = smooth((s - 3.2 - ri * 0.02) / 0.8) * out;
      m.compose(p.set(this.x(r.med), y, 0.02), q.identity(), sc.set(1, Math.max(0.0001, rowH * 0.9 * mh), 1));
      meds.setMatrixAt(ri, m);
    });
    pts.instanceMatrix.needsUpdate = true;
    pts.instanceColor!.needsUpdate = true;
    meds.instanceMatrix.needsUpdate = true;
  }
}

/* ---------- Flow: lineages streaming into the Apparitions ---------- */

export class HoloFlow {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  private W = 10;
  private H = 5.4;
  private ribbons: { cat: number; mat: THREE.MeshBasicMaterial }[] = [];
  private parts: THREE.InstancedMesh | null = null;
  private paths: { cat: number; a: [number, number]; b: [number, number]; off: number; phase: number; speed: number }[] = [];
  private cats: string[] = [];
  private totals: number[] = [];
  private caption: { mesh: THREE.Mesh; draw: (s: string) => void } | null = null;
  private shown = -1;

  constructor() {
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(this.W + 3, this.H + 2, 1), new THREE.MeshBasicMaterial({ visible: false }));
    this.group.add(this.hit);
    const t = label("FROM LINEAGE TO APPARITION", 0.32);
    t.position.set(0, this.H / 2 + 0.75, 0);
    this.group.add(t);
  }

  load(p: Purge, atlas: CanvasImageSource) {
    const tot = new Map<string, number>();
    for (const x of p.purged) tot.set(traitOf(x.traits, "Lineage"), (tot.get(traitOf(x.traits, "Lineage")) ?? 0) + 1);
    const named = [...tot].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v]) => v);
    const cats = [...named, "Other"];
    const fold = (v: string) => (named.includes(v) ? named.indexOf(v) : 6);
    const colour = (ci: number) => (ci < 6 ? PALETTE[ci] : OTHER);
    const counts = p.apps.map((a) => {
      const m = new Array(7).fill(0);
      for (const x of p.of(a)) m[fold(traitOf(x.traits, "Lineage"))]++;
      return m as number[];
    });
    const total = p.purged.length;
    const catTotal = cats.map((_, ci) => counts.reduce((s, m) => s + m[ci], 0));
    this.cats = cats;
    this.totals = catTotal;
    const main = (i: number) => counts[i].indexOf(Math.max(...counts[i]));
    const order = p.apps.map((_, i) => i).sort((x, y) => main(x) - main(y) || counts[y][main(y)] - counts[x][main(x)]);
    const rg = 0.035,
      lg = 0.12;
    const unit = (this.H - rg * (p.apps.length - 1)) / total;
    const X0 = -this.W / 2,
      X1 = this.W / 2;
    let y = this.H / 2 - (this.H - (total * unit + lg * 6)) / 2;
    const catY = catTotal.map((n) => {
      const top = y;
      y -= n * unit + lg;
      return top;
    });
    y = this.H / 2;
    const appY = new Map<number, number>();
    for (const i of order) {
      appY.set(i, y);
      y -= 26 * unit + rg;
    }
    // left nodes and their names
    cats.forEach((cname, ci) => {
      if (!catTotal[ci]) return;
      const h = catTotal[ci] * unit;
      const node = new THREE.Mesh(new THREE.PlaneGeometry(0.12, h), holoMat({ color: colour(ci).clone().multiplyScalar(1.8) }));
      node.position.set(X0, catY[ci] - h / 2, 0);
      node.raycast = () => {};
      this.group.add(node);
      const l = label(`${cname} ${catTotal[ci]}`, ci === 0 ? 0.26 : 0.18, { align: "right", color: "#dff8ff" });
      l.position.set(X0 - 0.14, catY[ci] - h / 2, 0);
      this.group.add(l);
    });
    // right: the Apparitions' faces
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    for (const i of order) {
      const a = p.apps[i];
      g.clearRect(0, 0, 32, 32);
      g.drawImage(atlas, ((a.item - 1) % 100) * 32, Math.floor((a.item - 1) / 100) * 32, 32, 32, 0, 0, 32, 32);
      const tex = new THREE.CanvasTexture(c.cloneNode() as HTMLCanvasElement);
      (tex.image as HTMLCanvasElement).getContext("2d")!.drawImage(c, 0, 0);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      const s = Math.min(0.2, 26 * unit + 0.02);
      const face2 = new THREE.Mesh(new THREE.PlaneGeometry(s, s), holoMat({ map: tex, color: "#e8fbff" }));
      face2.position.set(X1 + 0.18, appY.get(i)! - 13 * unit, 0);
      face2.raycast = () => {};
      this.group.add(face2);
      const n = label(pad2(a.slot), Math.min(0.14, 26 * unit), { color: "#8fd8ec", align: "left" });
      n.position.set(X1 + 0.32, appY.get(i)! - 13 * unit, 0);
      this.group.add(n);
    }
    // ribbons, one mesh per lineage (so each can be lit on its own), and the particles
    const off = new Array(7).fill(0);
    const bez = (a: number, b: number, t: number) => {
      const u = 1 - t;
      // x: X0 → X1; y: a … b with flat tangents (cubic with control points at the middle)
      return [X0 + (X1 - X0) * t, a * (u * u * u + 3 * u * u * t) + b * (3 * u * t * t + t * t * t)] as const;
    };
    const perCat: number[][] = cats.map(() => []);
    const perCatIdx: number[][] = cats.map(() => []);
    for (const i of order) {
      let o = 0;
      for (let ci = 0; ci < 7; ci++) {
        const n = counts[i][ci];
        if (!n) continue;
        const th = n * unit;
        const ya = catY[ci] - off[ci],
          yb = appY.get(i)! - o;
        const SEG = 24;
        const pos = perCat[ci],
          idx = perCatIdx[ci];
        const base = pos.length / 3;
        for (let k = 0; k <= SEG; k++) {
          const t = k / SEG;
          const [x, top] = bez(ya, yb, t);
          const [, bot] = bez(ya - th, yb - th, t);
          pos.push(x, top, 0, x, bot, 0);
          if (k < SEG) idx.push(base + k * 2, base + k * 2 + 1, base + k * 2 + 2, base + k * 2 + 1, base + k * 2 + 3, base + k * 2 + 2);
        }
        for (let q = 0; q < n; q++) this.paths.push({ cat: ci, a: [ya, ya - th], b: [yb, yb - th], off: (q + 0.5) / n, phase: Math.random(), speed: 0.12 + Math.random() * 0.08 });
        off[ci] += th;
        o += th;
      }
    }
    perCat.forEach((pos, ci) => {
      if (!pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(perCatIdx[ci]);
      const mat = holoMat({ color: colour(ci), opacity: 0.22 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.raycast = () => {};
      this.group.add(mesh);
      this.ribbons.push({ cat: ci, mat });
    });
    this.parts = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.06), holoMat(), this.paths.length);
    this.parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.parts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.paths.length * 3), 3);
    this.parts.frustumCulled = false;
    this.parts.raycast = () => {};
    this.group.add(this.parts);
    this.paths.forEach((pa, i) => this.parts!.setColorAt(i, colour(pa.cat).clone().multiplyScalar(2)));
    this.bez = bez;
    // the caption: which lineage is lit, and its share
    const tex = canvasTex(1400, 110, () => {});
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, (8 * 110) / 1400), holoMat({ map: tex }));
    mesh.position.set(0, -this.H / 2 - 0.6, 0);
    mesh.raycast = () => {};
    this.group.add(mesh);
    this.caption = {
      mesh,
      draw: (s: string) => {
        const cv = tex.image as HTMLCanvasElement;
        const g2 = cv.getContext("2d")!;
        g2.clearRect(0, 0, cv.width, cv.height);
        g2.fillStyle = "#ffd98a";
        g2.font = `600 60px ${SANS}`;
        g2.textAlign = "center";
        g2.textBaseline = "middle";
        g2.fillText(s, cv.width / 2, cv.height / 2);
        tex.needsUpdate = true;
      },
    };
  }

  private bez: (a: number, b: number, t: number) => readonly [number, number] = () => [0, 0];

  update(t: number, cam: THREE.Vector3) {
    face(this.group, cam);
    const parts = this.parts;
    if (!parts) return;
    // every 4 s another lineage is lit (the first, the largest, twice as long)
    const slot = Math.floor(t / 4) % (this.cats.length + 1);
    const lit = slot === 0 ? 0 : slot - 1;
    if (lit !== this.shown && this.totals[lit]) {
      this.shown = lit;
      const share = Math.round((this.totals[lit] / this.totals.reduce((a, b) => a + b, 0)) * 100);
      this.caption?.draw(`${this.cats[lit]}: ${this.totals[lit]} purged · ${share}%`);
    }
    for (const r of this.ribbons) r.mat.opacity = r.cat === lit ? 0.42 : 0.1;
    const { m, q, p, s } = scratch();
    this.paths.forEach((pa, i) => {
      const u = (t * pa.speed + pa.phase) % 1;
      const [x, ya] = this.bez(pa.a[0] + (pa.a[1] - pa.a[0]) * pa.off, pa.b[0] + (pa.b[1] - pa.b[0]) * pa.off, u);
      const k = pa.cat === lit ? 1.25 : 0.55;
      m.compose(p.set(x, ya, 0.02), q.identity(), s.setScalar(k));
      parts.setMatrixAt(i, m);
    });
    parts.instanceMatrix.needsUpdate = true;
  }
}

/* ---------- Holes: the 10,000 as a table of light; the purged rise and leave their holes ---------- */

export class HoloHoles {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  private table = new THREE.Group();
  private kept: THREE.InstancedMesh | null = null;
  private gone: THREE.InstancedMesh | null = null;
  private bars: THREE.Mesh[] = [];
  private goneAt: THREE.Vector3[] = [];
  private S = 6.6;
  private T = 14;
  private caption: THREE.Mesh | null = null;

  constructor() {
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(this.S + 2, 5, this.S + 2), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 1.6;
    this.group.add(this.hit, this.table);
    this.table.rotation.x = -0.32;
    const t = label("EVERY PURGED SNARK LEFT A HOLE", 0.32);
    t.position.set(0, 5.4, 0);
    this.group.add(t);
  }

  load(p: Purge, order: number[], cols: Float32Array) {
    const purged = new Set(p.purged.map((x) => x.item));
    const S = this.S,
      c = S / 100;
    const keptIds: [number, number][] = [],
      goneIds: [number, number][] = [];
    order.forEach((id, i) => (purged.has(id) ? goneIds : keptIds).push([id, i]));
    const at = (i: number) => new THREE.Vector3(-S / 2 + ((i % 100) + 0.5) * c, 0, -S / 2 + (Math.floor(i / 100) + 0.5) * c);
    const geo = new THREE.PlaneGeometry(c * 0.7, c * 0.7).rotateX(-Math.PI / 2);
    this.kept = new THREE.InstancedMesh(geo, holoMat({ opacity: 0.32 }), keptIds.length);
    const { m, q, s, c: col } = scratch();
    keptIds.forEach(([id, i], n) => {
      this.kept!.setMatrixAt(n, m.compose(at(i), q.identity(), s.set(1, 1, 1)));
      this.kept!.setColorAt(n, col.setRGB(cols[(id - 1) * 3], cols[(id - 1) * 3 + 1], cols[(id - 1) * 3 + 2]).multiplyScalar(0.4));
    });
    this.kept.raycast = () => {};
    this.gone = new THREE.InstancedMesh(new THREE.BoxGeometry(c * 0.9, 1, c * 0.9).translate(0, 0.5, 0), holoMat(), goneIds.length);
    this.gone.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gone.frustumCulled = false;
    this.gone.raycast = () => {};
    goneIds.forEach(([id, i], n) => {
      this.goneAt.push(at(i));
      this.gone!.setColorAt(n, col.setRGB(cols[(id - 1) * 3], cols[(id - 1) * 3 + 1], cols[(id - 1) * 3 + 2]).multiplyScalar(0.6));
    });
    // the table's edge and the axis labels
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(S + 0.2, S + 0.2).rotateX(-Math.PI / 2), holoMat({ color: CYAN, opacity: 0.08 }));
    edge.position.y = -0.03;
    edge.raycast = () => {};
    this.table.add(this.kept, this.gone, edge);
    for (const [txt, z] of [
      ["rarest", -S / 2 - 0.35],
      ["commonest", S / 2 + 0.35],
    ] as const) {
      const l = label(txt, 0.22, { color: "#8fd8ec", weight: 500 });
      l.rotation.x = -Math.PI / 2;
      l.position.set(0, 0.01, z);
      this.table.add(l);
    }
    // ten bars beside the table, one per 1,000 ranks (ten rows each), rising with the count
    const bands = Array.from({ length: 10 }, (_, k) => p.purged.filter((x) => x.rank != null && Math.min(9, Math.floor((x.rank - 1) / 1000)) === k).length);
    const max = Math.max(...bands);
    bands.forEach((n, k) => {
      const bm = holoMat({ color: (k === 0 ? GOLD : k >= 5 ? new THREE.Color("#e8fbff") : CYAN).clone().multiplyScalar(k >= 5 ? 0.7 : 0.5), opacity: 0.4 });
      bm.side = THREE.FrontSide;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, S / 10 - 0.14).translate(0, 0.5, 0), bm);
      bar.position.set(S / 2 + 0.6, 0, -S / 2 + (k + 0.5) * (S / 10));
      bar.userData.h = (n / max) * 2.6;
      bar.raycast = () => {};
      this.table.add(bar);
      this.bars.push(bar);
      const l = label(String(n), 0.2);
      l.position.set(S / 2 + 0.6, 0, -S / 2 + (k + 0.5) * (S / 10));
      l.userData.top = true;
      bar.userData.label = l;
      this.table.add(l);
    });
    const common = Math.round((p.purged.filter((x) => (x.rank ?? 0) > N / 2).length / p.purged.length) * 100);
    this.caption = label(`${common}% came from the common half · only ${bands[0]} among the rarest 1,000`, 0.26, { color: "#ffd98a", weight: 600 });
    this.caption.position.set(0, 4.7, 0);
    this.group.add(this.caption);
  }

  update(t: number, cam: THREE.Vector3) {
    // the table turns slowly; the title, the caption and the bar counts face the visitor
    this.table.rotation.y = t * 0.08;
    const wp = this.group.getWorldPosition(new THREE.Vector3());
    const yaw = Math.atan2(cam.x - wp.x, cam.z - wp.z);
    for (const o of this.group.children) if (o !== this.table && o !== this.hit) o.rotation.y = yaw;
    const gone = this.gone;
    if (!gone) return;
    // 0–3 s the purged sit in place, lit; 3–6 s they rise as columns of light and thin out; then
    // their holes; 7–12 s the bars rise beside the table; 12–14 s they settle back in
    const s = t % this.T;
    const rise = smooth((s - 3) / 3);
    const back = smooth((s - 12.2) / 1.6);
    const { m, q, p, s: sc } = scratch();
    this.goneAt.forEach((v, i) => {
      let y = 0,
        h = 0.03,
        w = 1;
      if (s >= 3 && s < 6) {
        y = rise * (2 + (i % 5) * 0.2);
        h = 0.03 + rise * (1 + (i % 7) * 0.12);
        w = 1 - rise;
      } else if (s >= 6 && s < 12.2) w = 0;
      else if (s >= 12.2) w = back;
      m.compose(p.set(v.x, y, v.z), q.identity(), sc.set(Math.max(0.0001, w), h, Math.max(0.0001, w)));
      gone.setMatrixAt(i, m);
    });
    gone.instanceMatrix.needsUpdate = true;
    const fall = 1 - smooth((s - 12.2) / 1.2);
    this.bars.forEach((b, k) => {
      const h = Math.max(0.0001, (b.userData.h as number) * smooth((s - 7 - k * 0.12) / 1.2) * fall);
      b.scale.y = h;
      const l = b.userData.label as THREE.Mesh;
      l.position.y = h + 0.3;
      l.visible = h > 0.3;
      l.rotation.y = yaw - this.table.rotation.y;
    });
    if (this.caption) this.caption.visible = s > 7.5 && s < 12.4;
  }
}
