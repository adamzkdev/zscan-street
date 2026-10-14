import * as THREE from "three";
import { sharedAtlasTexture } from "../../data/atlas";
import { atlasMaterial, canvasTex, type MuseumKit } from "./kit";
import { SANS } from "./parts";
import { type PApp, type Purge, traitOf } from "./purge";

/**
 * The Aile des Apparitions' kinetic pieces, after LA FUSION: the Vortex, the Orrery, the 26 Glass
 * Tubes and the Pierced Wall. Each is the purge's data as a moving object: real portraits (cut from
 * the collection atlas, one shared texture), real ranks and lineages.
 */

const N = 10000;
/** The explorer's trait palette (dark), most common lineage first; then "Other". */
const PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];
const OTHER = "#7a7974";

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeOutBack = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2);

/** (u0, v0, du, dv) of item `id` in the atlas (100 a row, the image's top row first). */
function atlasOff(id: number): [number, number, number, number] {
  const e = 0.0006;
  const c = (id - 1) % 100,
    r = Math.floor((id - 1) / 100);
  return [c / 100 + e, 1 - (r + 1) / 100 + e, 0.01 - 2 * e, 0.01 - 2 * e];
}

/** `n` portrait tiles (unit squares) on one draw; `ids(i)` says whose face each shows. */
function tiles(n: number, key: string) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute("aOff", new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
  const mat = atlasMaterial(sharedAtlasTexture(), "#ffffff", key);
  mat.side = THREE.DoubleSide;
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  m.raycast = () => {};
  return m;
}
function setFace(m: THREE.InstancedMesh, i: number, id: number) {
  const a = m.geometry.getAttribute("aOff") as THREE.InstancedBufferAttribute;
  a.set(atlasOff(id), i * 4);
  a.needsUpdate = true;
}

const M = new THREE.Matrix4(),
  P = new THREE.Vector3(),
  S = new THREE.Vector3(),
  Q = new THREE.Quaternion(),
  ONE = new THREE.Quaternion();

/** A plaque on a little lectern: a title and a line, facing +z. */
export function plaque(k: MuseumKit, f: number, x: number, z: number, title: string, line: string) {
  k.geo(f, new THREE.MeshStandardMaterial({ color: "#0e0e11", roughness: 0.5 }), new THREE.BoxGeometry(1.5, 0.9, 0.3).translate(x, 0.45, z));
  const p = k.panel(f, 900, 300, 1.4, (c, w, h) => {
    c.fillStyle = "#0d0d0e";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#f4b728";
    c.font = `700 52px ${SANS}`;
    c.fillText(title, 30, 82);
    c.fillStyle = "#c8ccd2";
    c.font = `500 34px ${SANS}`;
    const words = line.split(" ");
    let l = "",
      y = 150;
    for (const w2 of words) {
      if (c.measureText(`${l} ${w2}`).width > w - 60 && l) {
        c.fillText(l, 30, y);
        y += 46;
        l = w2;
      } else l = l ? `${l} ${w2}` : w2;
    }
    c.fillText(l, 30, y);
  }, { glow: true, transparent: false });
  p.rotation.x = -0.5;
  p.position.set(x, 0.98, z + 0.06);
  k.solid(f, x - 0.8, z - 0.2, x + 0.8, z + 0.2);
}

/* ---------- the Vortex: the 676 swirl up a funnel; every 6 s, 26 are drawn in and become one ---------- */

export class Vortex {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  private faces: THREE.InstancedMesh | null = null;
  private top: THREE.InstancedMesh;
  private parts: { k: number; y0: number; a0: number; w: number; dr: number }[] = [];
  private apps: PApp[] = [];
  private shown = -1;
  private H = 8.8;
  readonly CYC = 6;

  constructor(k: MuseumKit, f: number, x: number, z: number) {
    this.group.position.set(x, 0, z);
    k.groups[f].add(this.group);
    const slab = new THREE.MeshStandardMaterial({ color: "#0b0b0e", roughness: 0.3, metalness: 0.5 });
    k.geo(f, slab, new THREE.CylinderGeometry(3.2, 3.4, 0.25, 48).translate(x, 0.125, z));
    k.geo(f, k.gold, new THREE.TorusGeometry(3.22, 0.03, 6, 64).rotateX(Math.PI / 2).translate(x, 0.26, z));
    k.solid(f, x - 3.2, z - 3.2, x + 3.2, z + 3.2);
    this.top = tiles(1, "vortex-top");
    this.top.count = 1;
    this.group.add(this.top);
    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 1, this.H, 16), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = this.H / 2;
    this.group.add(this.hit);
  }

  /** The Apparition being drawn in now. */
  get current(): PApp | null {
    return this.shown >= 0 ? (this.apps[this.shown] ?? null) : null;
  }

  load(p: Purge) {
    this.apps = p.apps;
    const all = p.apps.flatMap((a, k) => p.of(a).map((x) => ({ k, id: x.item })));
    this.faces = tiles(all.length, "vortex");
    all.forEach((x, i) => {
      setFace(this.faces!, i, x.id);
      this.parts.push({ k: x.k, y0: Math.random() * this.H, a0: Math.random() * Math.PI * 2, w: 0.7 + Math.random() * 0.6, dr: (Math.random() - 0.5) * 0.5 });
    });
    this.group.add(this.faces);
  }

  update(t: number, camQ: THREE.Quaternion) {
    const faces = this.faces;
    if (!faces || !this.apps.length) return;
    const cyc = Math.floor(t / this.CYC);
    const now = cyc % this.apps.length;
    const u = t - cyc * this.CYC;
    if (now !== this.shown) {
      this.shown = now;
      setFace(this.top, 0, this.apps[now].item);
    }
    this.parts.forEach((pt, i) => {
      // up the funnel: wider as it rises, faster where it is narrow
      const y = (pt.y0 + t * 0.32) % this.H;
      const r = 0.45 + y * 0.33 + pt.dr;
      const a = pt.a0 + t * (pt.w * 1.8) / Math.max(0.6, r);
      let px = Math.cos(a) * r,
        py = 0.3 + y,
        pz = Math.sin(a) * r,
        s = 0.34;
      if (pt.k === now) {
        // drawn in: a tight spiral up to the eye of the vortex, smaller and smaller
        const d = smooth(u / 2.4);
        const a2 = a + d * 9;
        const r2 = r * (1 - d);
        px = Math.cos(a2) * r2;
        pz = Math.sin(a2) * r2;
        py = py + (this.H + 0.3 - py) * d;
        s = u < 2.4 ? 0.34 * (1 - d * 0.8) : 0;
      }
      // fade in at the bottom of the funnel, out at its rim
      s *= smooth(y / 0.6) * (1 - smooth((y - this.H + 0.8) / 0.8));
      M.compose(P.set(px, py, pz), camQ, S.setScalar(Math.max(0.0001, s)));
      faces.setMatrixAt(i, M);
    });
    faces.instanceMatrix.needsUpdate = true;
    // the Apparition, born in the eye, held, then gone
    const big = u < 2.2 ? 0 : u < 5.4 ? easeOutBack((u - 2.2) / 0.6) : 1 - smooth((u - 5.4) / 0.5);
    M.compose(P.set(0, this.H - 0.6, 0), camQ, S.setScalar(Math.max(0.0001, 1.9 * big)));
    this.top.setMatrixAt(0, M);
    this.top.instanceMatrix.needsUpdate = true;
  }
}

/* ---------- the Orrery: 26 Apparitions in orbit, each with its 26 as moons; closer moon, rarer snark ---------- */

export class Orrery {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  private planets: THREE.InstancedMesh | null = null;
  private moons: THREE.InstancedMesh | null = null;
  private halos: THREE.InstancedMesh | null = null;
  private arms: THREE.LineSegments;
  private moonP: { k: number; r: number; a0: number; inc: number; node: number }[] = [];
  private R = 7.2;
  private Y = 4.6;
  private n = 0;

  constructor(k: MuseumKit, f: number, x: number, z: number) {
    this.group.position.set(x, 0, z);
    k.groups[f].add(this.group);
    // the hub on its column
    k.geo(f, k.brass, new THREE.CylinderGeometry(0.12, 0.2, this.Y, 12).translate(x, this.Y / 2, z));
    k.geo(f, k.brass, new THREE.CylinderGeometry(0.6, 0.7, 0.25, 24).translate(x, 0.125, z));
    k.solid(f, x - 0.5, z - 0.5, x + 0.5, z + 0.5);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), k.gold);
    hub.position.y = this.Y;
    this.group.add(hub);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(this.R, 0.025, 6, 128).rotateX(Math.PI / 2), k.brass);
    ring.position.y = this.Y;
    this.group.add(ring);
    this.arms = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#c9a060", transparent: true, opacity: 0.7 }));
    this.arms.frustumCulled = false;
    this.group.add(this.arms);
    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(this.R + 2.4, this.R + 2.4, 3.6, 24), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = this.Y;
    this.group.add(this.hit);
  }

  load(p: Purge) {
    this.n = p.apps.length;
    this.planets = tiles(this.n, "orrery-planets");
    p.apps.forEach((a, i) => setFace(this.planets!, i, a.item));
    const all = p.apps.flatMap((a, k) => p.of(a).map((x) => ({ k, id: x.item, rank: x.rank ?? N })));
    this.moons = tiles(all.length, "orrery-moons");
    all.forEach((m, i) => {
      setFace(this.moons!, i, m.id);
      this.moonP.push({ k: m.k, r: 0.75 + ((m.rank - 1) / (N - 1)) * 1.9, a0: Math.random() * Math.PI * 2, inc: (Math.random() - 0.5) * 1.1, node: Math.random() * Math.PI });
    });
    // two guide rings round every planet: the rarest band (gold), the commonest (pale)
    this.halos = new THREE.InstancedMesh(new THREE.RingGeometry(0.985, 1, 64), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }), this.n * 2);
    this.halos.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.n * 6), 3);
    for (let i = 0; i < this.n; i++) {
      this.halos.setColorAt(i * 2, new THREE.Color("#f4b728"));
      this.halos.setColorAt(i * 2 + 1, new THREE.Color("#8a9098"));
    }
    this.halos.frustumCulled = false;
    this.halos.raycast = () => {};
    this.arms.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.n * 6), 3));
    this.group.add(this.planets, this.moons, this.halos);
  }

  private planetAt(i: number, t: number, out: THREE.Vector3) {
    const a = (i / this.n) * Math.PI * 2 + t * 0.045;
    return out.set(Math.cos(a) * this.R, this.Y + Math.sin(a * 3 + t * 0.4) * 0.35, Math.sin(a) * this.R);
  }

  update(t: number, camQ: THREE.Quaternion) {
    const planets = this.planets,
      moons = this.moons,
      halos = this.halos;
    if (!planets || !moons || !halos) return;
    const pos = this.arms.geometry.getAttribute("position") as THREE.BufferAttribute;
    const pp: THREE.Vector3[] = [];
    for (let i = 0; i < this.n; i++) {
      const v = this.planetAt(i, t, new THREE.Vector3());
      pp.push(v);
      M.compose(v, camQ, S.setScalar(0.95));
      planets.setMatrixAt(i, M);
      pos.setXYZ(i * 2, 0, this.Y, 0);
      pos.setXYZ(i * 2 + 1, v.x, v.y, v.z);
      M.compose(v, camQ, S.setScalar(0.75));
      halos.setMatrixAt(i * 2, M);
      M.compose(v, camQ, S.setScalar(2.65));
      halos.setMatrixAt(i * 2 + 1, M);
    }
    pos.needsUpdate = true;
    this.moonP.forEach((m, i) => {
      const a = m.a0 + (t * 0.9) / Math.sqrt(m.r);
      // an inclined orbit: the circle tilted by `inc` about a node line at angle `node`
      const cx = Math.cos(a) * m.r,
        cz = Math.sin(a) * m.r;
      const cy = cz * Math.sin(m.inc);
      const cz2 = cz * Math.cos(m.inc);
      const cn = Math.cos(m.node),
        sn = Math.sin(m.node);
      const c = pp[m.k];
      P.set(c.x + cx * cn - cz2 * sn, c.y + cy, c.z + cx * sn + cz2 * cn);
      M.compose(P, camQ, S.setScalar(0.24));
      moons.setMatrixAt(i, M);
    });
    for (const im of [planets, moons, halos]) im.instanceMatrix.needsUpdate = true;
  }
}

/* ---------- the 26 Glass Tubes: each fills with its 26, layer by layer, coloured by lineage ---------- */

export class Tubes {
  readonly hits: { mesh: THREE.Mesh; app: () => PApp | null; line: () => string }[] = [];
  private layers: THREE.InstancedMesh | null = null;
  private drops: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private at: [number, number][] = [];
  private cols: THREE.Color[][] = [];
  private apps: PApp[] = [];
  private mix: string[] = [];
  private group = new THREE.Group();
  private LH = 3.1 / 26;
  readonly legend: { name: string; color: string }[] = [];

  constructor(k: MuseumKit, f: number, cx: number, cz: number, R: number) {
    k.groups[f].add(this.group);
    const base = new THREE.MeshStandardMaterial({ color: "#0e0e11", roughness: 0.4, metalness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: "#d8f0ff", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 26; i++) {
      const a = (-160 + (140 * i) / 25) * (Math.PI / 180);
      const x = cx + Math.cos(a) * R,
        z = cz + Math.sin(a) * R;
      this.at.push([x, z]);
      k.geo(f, base, new THREE.CylinderGeometry(0.4, 0.44, 0.22, 20).translate(x, 0.11, z));
      k.geo(f, k.brass, new THREE.TorusGeometry(0.33, 0.025, 6, 24).rotateX(Math.PI / 2).translate(x, 3.45, z));
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 3.25, 24, 1, true), glass);
      g.position.set(x, 0.22 + 3.25 / 2, z);
      g.renderOrder = 3;
      g.raycast = () => {};
      this.group.add(g);
      k.solid(f, x - 0.42, z - 0.42, x + 0.42, z + 0.42);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 4.6, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(x, 2.3, z);
      this.group.add(hit);
      this.hits.push({ mesh: hit, app: () => this.apps[i] ?? null, line: () => this.mix[i] ?? "" });
    }
    this.drops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ toneMapped: false }), 26);
    this.drops.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(26 * 3), 3);
    this.drops.frustumCulled = false;
    this.drops.raycast = () => {};
    this.heads = tiles(26, "tube-heads");
    this.group.add(this.drops, this.heads);
  }

  load(p: Purge) {
    const tot = new Map<string, number>();
    for (const x of p.purged) tot.set(traitOf(x.traits, "Lineage"), (tot.get(traitOf(x.traits, "Lineage")) ?? 0) + 1);
    const named = [...tot].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v]) => v);
    const fold = (v: string) => (named.includes(v) ? named.indexOf(v) : 6);
    named.forEach((n, i) => this.legend.push({ name: n, color: PALETTE[i] }));
    this.legend.push({ name: "Other", color: OTHER });
    this.apps = p.apps.slice(0, 26);
    this.apps.forEach((a, i) => {
      // strata: the most common lineage at the bottom
      const ls = p.of(a).map((x) => fold(traitOf(x.traits, "Lineage"))).sort((x, y) => x - y);
      this.cols.push(ls.map((l) => new THREE.Color(l < 6 ? PALETTE[l] : OTHER)));
      const count = new Map<number, number>();
      for (const l of ls) count.set(l, (count.get(l) ?? 0) + 1);
      this.mix[i] = [...count].map(([l, n]) => `${n} ${l < 6 ? named[l] : "Other"}`).join(" · ");
      setFace(this.heads, i, a.item);
    });
    this.layers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.27, 0.27, 1, 20), new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: "#000000" }), 26 * 26);
    this.layers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(26 * 26 * 3), 3);
    this.layers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.layers.frustumCulled = false;
    this.layers.raycast = () => {};
    for (let i = 0; i < this.cols.length; i++) for (let j = 0; j < 26; j++) this.layers.setColorAt(i * 26 + j, this.cols[i][j] ?? new THREE.Color(OTHER));
    this.group.add(this.layers);
  }

  /** Seconds a cycle lasts: tubes start 0.8 s apart, a layer every 0.25 s, a hold, the drain. */
  private CYC = 26 * 0.8 + 26 * 0.25 + 10 + 3;

  update(t: number, camQ: THREE.Quaternion) {
    const layers = this.layers;
    if (!layers || !this.cols.length) return;
    const u = t % this.CYC;
    const drainAt = this.CYC - 3;
    const drain = smooth((u - drainAt) / 2.6);
    for (let i = 0; i < this.cols.length; i++) {
      const [x, z] = this.at[i];
      const t0 = i * 0.8;
      // layers that have landed (each 0.25 s, the drop falling the 0.3 s before)
      const landed = Math.max(0, Math.min(26, Math.floor((u - t0) / 0.25)));
      for (let j = 0; j < 26; j++) {
        const on = j < landed ? 1 - drain : 0;
        M.compose(P.set(x, 0.22 + (j + 0.5) * this.LH, z), ONE, S.set(on ? 1 : 0.0001, Math.max(0.0001, this.LH * 0.92 * on), on ? 1 : 0.0001));
        layers.setMatrixAt(i * 26 + j, M);
      }
      // the next drop on its way down
      if (landed < 26 && u >= t0 && u < drainAt) {
        const f = ((u - t0) % 0.25) / 0.25;
        const yTop = 0.22 + (landed + 0.5) * this.LH;
        M.compose(P.set(x, 9.4 + (yTop - 9.4) * f * f, z), ONE, S.setScalar(1));
        this.drops.setColorAt(i, this.cols[i][landed]);
      } else M.compose(P.set(x, -5, z), ONE, S.setScalar(0.0001));
      this.drops.setMatrixAt(i, M);
      // full: its Apparition rises above it
      const fullAt = t0 + 26 * 0.25;
      const h = u < fullAt ? 0 : easeOutBack((u - fullAt) / 0.6) * (1 - drain);
      M.compose(P.set(x, 4.1 + h * 0.15, z), camQ, S.setScalar(Math.max(0.0001, 0.62 * h)));
      this.heads.setMatrixAt(i, M);
    }
    layers.instanceMatrix.needsUpdate = true;
    this.drops.instanceMatrix.needsUpdate = true;
    this.drops.instanceColor!.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }
}

/* ---------- the Pierced Wall: the 10,000, light through the 676 holes; now and then 26 fall out ---------- */

export class PiercedWall {
  readonly wall: THREE.Mesh;
  private holesTex: THREE.CanvasTexture;
  private rays: THREE.InstancedMesh | null = null;
  private spots: THREE.InstancedMesh | null = null;
  private falling: THREE.InstancedMesh;
  private groups: { app: PApp; cells: number[] }[] = [];
  private rayIdx = new Map<number, number>();
  private S = 8.8;
  private Y0 = 0.7;
  private CYC = 14;
  private shown = -1;

  constructor(
    k: MuseumKit,
    f: number,
    private z: number,
  ) {
    const g = k.groups[f];
    this.holesTex = canvasTex(1000, 1000, (c, w, h) => {
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, w, h);
    });
    this.holesTex.magFilter = THREE.NearestFilter;
    this.holesTex.minFilter = THREE.LinearFilter;
    this.holesTex.generateMipmaps = false;
    const mat = new THREE.MeshBasicMaterial({ map: sharedAtlasTexture(), alphaMap: this.holesTex, alphaTest: 0.5, color: "#c8c2b8", side: THREE.DoubleSide });
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(this.S, this.S), mat);
    this.wall.position.set(0, this.Y0 + this.S / 2, z);
    g.add(this.wall);
    // the frame, and the light behind it
    const dark = new THREE.MeshStandardMaterial({ color: "#121216", roughness: 0.5, metalness: 0.4 });
    for (const [w, h, x, y] of [
      [this.S + 0.5, 0.25, 0, this.Y0 - 0.25],
      [this.S + 0.5, 0.25, 0, this.Y0 + this.S],
      [0.25, this.S + 0.5, -(this.S / 2 + 0.12), this.Y0 - 0.25],
      [0.25, this.S + 0.5, this.S / 2 + 0.12, this.Y0 - 0.25],
    ])
      k.geo(f, dark, new THREE.BoxGeometry(w, h, 0.3).translate(x, y + h / 2, z));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(this.S + 1, this.S + 1), k.lit("#ffd890", 2.4));
    glow.position.set(0, this.Y0 + this.S / 2, z - 1.6);
    glow.raycast = () => {};
    g.add(glow);
    // the box round the light, so it only shines through the wall
    for (const s of [-1, 1]) k.geo(f, dark, new THREE.BoxGeometry(0.2, this.S + 0.6, 1.8).translate(s * (this.S / 2 + 0.25), this.Y0 + this.S / 2 - 0.05, z - 0.85));
    k.geo(f, dark, new THREE.BoxGeometry(this.S + 0.7, 0.2, 1.8).translate(0, this.Y0 + this.S + 0.25, z - 0.85));
    k.solid(f, -(this.S / 2 + 0.4), z - 1.8, this.S / 2 + 0.4, z + 0.2);
    this.falling = tiles(26, "wall-falling");
    g.add(this.falling);
  }

  /** The item under a point of the wall. */
  idAt(hit: THREE.Intersection) {
    if (!hit.uv) return null;
    const c = Math.min(99, Math.floor(hit.uv.x * 100)),
      r = Math.min(99, Math.floor((1 - hit.uv.y) * 100));
    return r * 100 + c + 1;
  }

  /** The cell centre of item `id` in the room (the wall faces +z). */
  private cell(id: number, out: THREE.Vector3) {
    const c = (id - 1) % 100,
      r = Math.floor((id - 1) / 100);
    const s = this.S / 100;
    return out.set(-this.S / 2 + (c + 0.5) * s, this.Y0 + this.S - (r + 0.5) * s, this.z);
  }

  load(p: Purge, k: MuseumKit, f: number) {
    const ctx = (this.holesTex.image as HTMLCanvasElement).getContext("2d")!;
    ctx.fillStyle = "#000000";
    for (const x of p.purged) {
      const i = x.item - 1;
      ctx.fillRect((i % 100) * 10 + 1, Math.floor(i / 100) * 10 + 1, 8, 8);
    }
    this.holesTex.needsUpdate = true;
    this.groups = p.apps.map((a) => ({ app: a, cells: p.of(a).map((x) => x.item) }));
    // a shaft of light from each hole down to the floor, and the spot where it lands
    const src = new THREE.Vector3(0, 16, this.z - 3);
    const n = p.purged.length;
    this.rays = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: "#ffd890", transparent: true, opacity: 0.028, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), n);
    this.rays.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.spots = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffe2a8", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), n);
    this.spots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    const hole = new THREE.Vector3(),
      end = new THREE.Vector3(),
      dir = new THREE.Vector3(),
      mid = new THREE.Vector3(),
      up = new THREE.Vector3(0, 0, 1);
    p.purged.forEach((x, i) => {
      this.rayIdx.set(x.item, i);
      this.cell(x.item, hole);
      dir.subVectors(hole, src);
      const s = hole.y / -dir.y;
      end.copy(hole).addScaledVector(dir, s);
      end.y = 0.02;
      mid.addVectors(hole, end).multiplyScalar(0.5);
      const len = hole.distanceTo(end);
      Q.setFromUnitVectors(up, dir.normalize());
      M.compose(mid, Q, S.set(0.035, 0.035, len));
      this.rays!.setMatrixAt(i, M);
      this.rays!.setColorAt(i, new THREE.Color(1, 1, 1));
      M.compose(end, ONE, S.setScalar(0.07));
      this.spots!.setMatrixAt(i, M);
      this.spots!.setColorAt(i, new THREE.Color(1, 1, 1));
    });
    for (const im of [this.rays, this.spots]) {
      im.frustumCulled = false;
      im.raycast = () => {};
      k.groups[f].add(im);
    }
  }

  update(t: number, camQ: THREE.Quaternion) {
    const rays = this.rays,
      spots = this.spots;
    if (!rays || !spots || !this.groups.length) return;
    // every 14 s one Apparition's 26 holes are filled again, then the portraits fall out
    const cyc = Math.floor(t / this.CYC);
    const gi = cyc % this.groups.length;
    const u = t - cyc * this.CYC;
    const grp = this.groups[gi];
    if (gi !== this.shown) {
      // the previous group's light back to full
      if (this.shown >= 0) for (const id of this.groups[this.shown].cells) this.light(id, 1);
      this.shown = gi;
      grp.cells.forEach((id, j) => setFace(this.falling, j, id));
    }
    // 0–3 s: back in place (their light off); 3–5 s: they tip forward and fall; then light returns
    const fall = smooth((u - 3) / 1.8);
    const back = smooth((u - 4.6) / 1.2);
    const c = new THREE.Vector3();
    grp.cells.forEach((id, j) => {
      this.cell(id, c);
      const s = this.S / 100;
      const drop = fall * fall * (c.y - 0.05);
      const fwd = fall * (0.6 + (j % 5) * 0.15);
      Q.setFromEuler(new THREE.Euler(-fall * (1.4 + (j % 3) * 0.3), (j % 2 ? 1 : -1) * fall * 0.6, fall * (j % 4) * 0.3));
      const k = u < 5.6 ? 1 : 1 - smooth((u - 5.6) / 1.5);
      M.compose(P.set(c.x, c.y - drop, c.z + 0.04 + fwd), Q, S.set(s * k, s * k, 1));
      this.falling.setMatrixAt(j, M);
      this.light(id, u < 3 ? 0 : back);
    });
    this.falling.instanceMatrix.needsUpdate = true;
    rays.instanceColor!.needsUpdate = true;
    spots.instanceColor!.needsUpdate = true;
    void camQ;
  }

  private light(id: number, k: number) {
    const i = this.rayIdx.get(id);
    if (i == null || !this.rays || !this.spots) return;
    this.rays.setColorAt(i, new THREE.Color(k, k, k));
    this.spots.setColorAt(i, new THREE.Color(k, k, k));
  }
}

