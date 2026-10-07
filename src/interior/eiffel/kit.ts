import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ZScan } from "../../data/zscan";
import { Snark, loadArt } from "../../scene/snark";
import type { VoxelModel } from "../../scene/voxel/model";
import { place } from "../furniture";
import { glowMat, std, textPlane } from "../kit";
import type { InteriorContext, PickInfo, Rect } from "../types";

/**
 * The TOUR EIFFEL's shared kit: its levels (heights follow the street model, so the view from each
 * platform is the real city at that height), the iron profile of the tower, one group per floor,
 * colliders, people, ticks, and the builders every floor uses: lattice girders merged per material,
 * telescopes with live chain screens, elevators, labels, voxel furniture.
 */

export const LEVELS = [
  { label: "0", name: "Esplanade · pillars, tickets, lifts", y: 0 },
  { label: "1", name: "1st floor · glass floor, 58 Tour Eiffel", y: 13.7 },
  { label: "2", name: "2nd floor · Jules Verne, telescopes", y: 27.6 },
  { label: "S", name: "Summit · Eiffel's office, champagne bar", y: 68.3 },
];
/** Metres above the door for each floor's panorama, and how far behind the door the tower stands. */
export const VIEW_BACK = 13;
export const LIGHTS_PER_FLOOR = 5;

/** Half width of the tower's outer edge at height y, and the width of a leg. */
const HW: [number, number][] = [
  [0, 21],
  [6, 19.2],
  [13.7, 17.4],
  [20, 14.2],
  [27.6, 11.4],
  [36, 9.2],
  [46, 7.3],
  [56, 5.9],
  [66.3, 4.8],
];
const LW: [number, number][] = [
  [0, 6.4],
  [13.7, 5],
  [27.6, 3.4],
  [34, 2.6],
];
const lerpTable = (t: [number, number][], y: number) => {
  if (y <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (y <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (y - t[i - 1][0])) / (t[i][0] - t[i - 1][0]);
  return t[t.length - 1][1];
};
export const hw = (y: number) => lerpTable(HW, y);
export const lw = (y: number) => lerpTable(LW, y);
/** Platform half sizes (outer edge of the deck). */
export const P1 = 19.6,
  P2 = 13.2,
  PT = 8.6;

/** What zkSNARKs say when you click them, by role. */
const LINES: Record<string, string[]> = {
  Guide: ["1,665 steps to the top. Or the lift.", "Seven years, it gets a new coat of paint: sixty tonnes of it.", "Gustave wanted it to stand twenty years. Like a good private key."],
  Ticket: ["Lift to the summit, or stairs to the second?", "Shielded tickets only. Just kidding — show me your QR."],
  Lift: ["Mind the gap. The cabin climbs the pillar on a curve.", "Next stop, first floor: the glass floor."],
  Photographer: ["Closer… closer… the tower behind you… perfect.", "Golden hour up here. Every block, a new frame.", "Smile! Zero knowledge of your bad side."],
  Couple: ["We met in the mempool.", "He's going to propose at the summit. Don't tell him I know.", "Our first block together."],
  Waiter: ["A table by the window? The city lights are on.", "Tonight: shielded scallops, Orchard butter.", "The chef says the view is the main course."],
  Chef: ["Two stars and a view.", "Everything comes up by the service lift."],
  Bartender: ["A coupe of champagne, at the top of Paris.", "Cheers to the next block!", "Brut, rosé, or a Shielded Spritz?"],
  Visitor: ["You can see the whole street from here.", "I can see the ZEC NEEDLE!", "The lifts are faster than the blocks."],
  Kid: ["Is the glass floor going to break?!", "Look, tiny people down there!"],
  Painter: ["Eiffel Tower brown. Three shades, darker at the bottom.", "I paint the iron, the iron paints me."],
  Vendor: ["Mini towers, three for ten.", "Keyrings, postcards, ZEC pins."],
  Gustave: ["Welcome to my office. The air up here is the cleanest in the city.", "They called it a monstrosity. Then they came to see the view.", "Mr Edison, a phonograph for a tower: a fair trade."],
  Edison: ["I brought my phonograph. Listen.", "Monsieur Eiffel, this tower is a marvel of engineering."],
  Claire: ["Father works here, in the clouds.", "Tea will be served after the experiment."],
  Maitre: ["Bienvenue au Jules Verne. Your table is ready.", "Reservations only, I'm afraid. Unless you hold a viewing key."],
};
export const linesFor = (role: string) => LINES[role] ?? LINES[Object.keys(LINES).find((k) => role.includes(k)) ?? "Visitor"];

export type Tick = (dt: number, t: number) => void;
export type PickFn = (hit?: THREE.Intersection) => PickInfo | null;

export function makeCanvas(w: number, h: number, draw?: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw?.(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, g, t };
}

const Z = new THREE.Vector3(0, 0, 1);
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();

/** Geometry buckets merged into one mesh per material at the end. */
class Bucket {
  geos: THREE.BufferGeometry[] = [];
  constructor(readonly mat: THREE.Material) {}
}

export class EiffelKit {
  readonly groups = LEVELS.map(() => new THREE.Group());
  /** Always drawn: the iron tower round you and the gardens below. */
  readonly frame = new THREE.Group();
  /** Lights of each floor (switched with the floor). */
  readonly lightGroups = LEVELS.map(() => new THREE.Group());
  readonly rects: Rect[][] = LEVELS.map(() => []);
  readonly people: Snark[][] = LEVELS.map(() => []);
  readonly ticks: Tick[][] = LEVELS.map(() => []);
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, string>();
  readonly floorOf = new Map<THREE.Object3D, number>();
  /** Emissive materials that are brighter at night. */
  readonly nightGlow: { mat: THREE.MeshBasicMaterial; day: number; night: number; color: THREE.Color }[] = [];
  private lightCount = LEVELS.map(() => 0);
  private buckets = new Map<string, Bucket>();
  current = 0;
  private lastHeight = 0;
  get height() {
    return Math.max(this.lastHeight, this.ctx.director.blockHeight ?? 0);
  }

  // shared materials
  readonly iron = std("#5e4434", 0.62, 0.45);
  readonly ironDark = std("#46332a", 0.6, 0.5);
  readonly ironPaint = std("#6f5140", 0.7, 0.35);
  readonly glass = new THREE.MeshStandardMaterial({ color: "#a8cce0", transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.3, depthWrite: false });
  readonly chrome = std("#c8ccd4", 0.25, 0.85);
  readonly brass = std("#c8a256", 0.3, 0.85);
  readonly dark = std("#1c1a22", 0.5, 0.3);
  readonly white = std("#ece8e0", 0.6);
  readonly deck = std("#7a6a58", 0.85);
  readonly stone = std("#c8bca6", 0.9);

  constructor(
    readonly ctx: InteriorContext,
    readonly scene: THREE.Scene,
  ) {
    for (const g of this.groups) scene.add(g);
    this.groups.forEach((g, i) => g.add(this.lightGroups[i]));
    scene.add(this.frame);
    ctx.onBlock((h) => (this.lastHeight = h));
  }

  y(f: number) {
    return LEVELS[f].y;
  }

  /** A glow material that brightens at night (sodium lamps, bulbs). */
  glow(color: string, day: number, night: number) {
    const mat = glowMat(color, night);
    this.nightGlow.push({ mat, day, night, color: new THREE.Color(color) });
    return mat;
  }

  setNight(night: boolean) {
    for (const g of this.nightGlow) g.mat.color.copy(g.color).multiplyScalar(night ? g.night : g.day);
  }

  // ---- merged geometry ------------------------------------------------------------------------------

  private bucket(key: string, mat: THREE.Material) {
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = new Bucket(mat)));
    return b;
  }

  /** A straight member (square section `t`) from a to b, merged into `key` (a floor index or "frame"). */
  beam(key: string, a: THREE.Vector3, b: THREE.Vector3, t: number, mat: THREE.Material = this.iron, tz = t) {
    const len = a.distanceTo(b);
    if (len < 1e-3) return;
    const g = new THREE.BoxGeometry(t, tz, len);
    tmpQ.setFromUnitVectors(Z, b.clone().sub(a).normalize());
    tmpM.compose(a.clone().add(b).multiplyScalar(0.5), tmpQ, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(tmpM);
    this.bucket(`${key}|${mat.uuid}`, mat).geos.push(g);
  }

  /** Any geometry already placed in world coordinates, merged into `key`. */
  addGeo(key: string, g: THREE.BufferGeometry, mat: THREE.Material) {
    this.bucket(`${key}|${mat.uuid}`, mat).geos.push(g.index ? g.toNonIndexed() : g);
  }

  /** An axis-aligned box merged into `key`. */
  slab(key: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    this.bucket(`${key}|${mat.uuid}`, mat).geos.push(g);
  }

  /**
   * A lattice girder between two points: two chords `w` apart (across `side`, a unit vector),
   * zigzag webs between them, and a finer cross-lattice in each bay, as on the real tower.
   */
  girder(key: string, a: THREE.Vector3, b: THREE.Vector3, side: THREE.Vector3, w: number, o: { chord?: number; web?: number; bays?: number; mat?: THREE.Material } = {}) {
    const chord = o.chord ?? 0.14,
      web = o.web ?? 0.06;
    const len = a.distanceTo(b);
    const n = o.bays ?? Math.max(1, Math.round(len / w));
    const off = side.clone().multiplyScalar(w / 2);
    const a0 = a.clone().sub(off),
      a1 = a.clone().add(off),
      b0 = b.clone().sub(off),
      b1 = b.clone().add(off);
    const mat = o.mat ?? this.iron;
    this.beam(key, a0, b0, chord, mat);
    this.beam(key, a1, b1, chord, mat);
    for (let i = 0; i < n; i++) {
      const p = (s: THREE.Vector3, e: THREE.Vector3, t: number) => s.clone().lerp(e, t);
      const t0 = i / n,
        t1 = (i + 1) / n;
      this.beam(key, p(a0, b0, t0), p(a1, b1, t1), web, mat);
      this.beam(key, p(a1, b1, t0), p(a0, b0, t1), web, mat);
      if (i) this.beam(key, p(a0, b0, t0), p(a1, b1, t0), web, mat);
    }
  }

  /** Merge every bucket into its group: one mesh per material and floor. */
  finish() {
    for (const [key, b] of this.buckets) {
      if (!b.geos.length) continue;
      const geos = b.geos.map((g) => {
        const n = g.index ? g.toNonIndexed() : g;
        for (const name of Object.keys(n.attributes)) if (!["position", "normal", "uv"].includes(name)) n.deleteAttribute(name);
        return n;
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      const where = key.split("|")[0];
      (where === "frame" ? this.frame : this.groups[Number(where)]).add(mesh);
      for (const g of b.geos) g.dispose();
    }
    this.buckets.clear();
  }

  // ---- interaction ----------------------------------------------------------------------------------

  pick(f: number, o: THREE.Object3D, hover: string, info: PickFn) {
    this.pickables.push(o);
    this.floorOf.set(o, f);
    this.hovers.set(o, hover);
    this.picks.set(o, info);
  }

  light(f: number, x: number, y: number, z: number, color = "#ffe6c8", intensity = 8, dist = 22) {
    if (this.lightCount[f] >= LIGHTS_PER_FLOOR) return;
    this.lightCount[f]++;
    const l = new THREE.PointLight(color, intensity, dist, 1.5);
    l.position.set(x, LEVELS[f].y + y, z);
    this.lightGroups[f].add(l);
  }

  /** Every floor ends up with the same number of lights: changing floor never recompiles a shader. */
  padLights() {
    LEVELS.forEach((_, f) => {
      while (this.lightCount[f] < LIGHTS_PER_FLOOR) this.light(f, 0, -50, 0, "#000000", 0);
    });
  }

  /** Voxel furniture at (x, z) on floor f, turned `rot`; by default it blocks the walker. */
  put(f: number, key: string, build: () => VoxelModel, x: number, z: number, rot = 0, o: { dy?: number; solid?: boolean } = {}) {
    const obj = place(this.groups[f], key, build, x, LEVELS[f].y + (o.dy ?? 0), z, rot);
    if (o.solid !== false) {
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      if (b.max.y - LEVELS[f].y > 0.25) this.rects[f].push([b.min.x + 0.05, b.min.z + 0.05, b.max.x - 0.05, b.max.z - 0.05]);
    }
    return obj;
  }

  label(f: number, text: string, x: number, y: number, z: number, o: { h?: number; color?: string; bg?: string; rot?: number; glow?: boolean; font?: string } = {}) {
    const p = textPlane(text, { h: o.h ?? 0.24, color: o.color ?? "#ffd28a", bg: o.bg, glow: o.glow ?? !o.bg, font: o.font });
    p.position.set(x, LEVELS[f].y + y, z);
    p.rotation.y = o.rot ?? 0;
    this.groups[f].add(p);
    return p;
  }

  /** A screen redrawn every few seconds while you are on its floor. */
  screen(f: number, w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, every = 3, parent: THREE.Object3D = this.groups[f]) {
    const W = 512,
      H = Math.round((512 * h) / w);
    const s = makeCanvas(W, H);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.t, toneMapped: false }));
    let acc = every;
    this.ticks[f].push((dt) => {
      acc += dt;
      if (acc < every) return;
      acc = 0;
      draw(s.g, W, H);
      s.t.needsUpdate = true;
    });
    draw(s.g, W, H);
    s.t.needsUpdate = true;
    parent.add(mesh);
    return mesh;
  }

  /** A zkSNARK on this floor: sits, faces, bobs, wanders, and talks when clicked. */
  async person(f: number, id: number, at: [number, number], role: string, o: { face?: THREE.Vector3; wander?: [number, number][]; dy?: number; bob?: number; sit?: boolean; scale?: number; title?: string } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      // kitchen staff in a toque (painted on, fitted to the head)
      if (role === "Chef" || role === "Cook") s.wear({ hat: "chef" });
      const base = LEVELS[f].y + (o.dy ?? 0);
      s.root.position.set(at[0], base, at[1]);
      s.faceDir = o.face ?? new THREE.Vector3(0, 0, 1);
      // lifted onto the seat (dy = its height): sit on it; on the floor: onto the seat it is next to
      if (o.sit) {
        if (o.dy) s.sit(true, o.dy);
        else s.perchNear();
      }
      if (o.scale) s.setScale(o.scale);
      this.groups[f].add(s.root);
      this.people[f].push(s);
      if (o.bob) this.ticks[f].push((_, t) => (s.root.position.y = base + Math.abs(Math.sin(t * o.bob! + id)) * 0.08));
      let said = 0;
      const lines = linesFor(role);
      const name = o.title ?? role;
      this.pick(f, s.body, `<b>${name}</b><span>zkSNARK #${id}</span>`, () => ({ eyebrow: name, title: `“${lines[said++ % lines.length]}”`, image: ZScan.zkSnarkImage(id), body: `<p>zkSNARK #${id}</p>` }));
      if (o.wander) {
        const w = o.wander;
        void (async () => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 4000 + Math.random() * 8000));
            if (this.current !== f) continue;
            s.faceDir = null;
            const p = w[Math.floor(Math.random() * w.length)];
            await s.walk([new THREE.Vector3(p[0], base, p[1])], 0.8);
            s.faceDir = o.face ?? null;
          }
        })();
      }
      return s;
    } catch {
      return null;
    }
  }

  // ---- shared pieces -----------------------------------------------------------------------------------

  /**
   * A coin-operated telescope (the yellow Paris "longue-vue") on a post at the railing, looking
   * along `dir` (radians, 0 = -z), with a little screen of live chain data on its back.
   */
  telescope(f: number, x: number, z: number, dir: number, n: number) {
    const g = new THREE.Group();
    g.position.set(x, LEVELS[f].y, z);
    g.rotation.y = dir;
    const yellow = std("#e0b830", 0.45, 0.4);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 1.1, 10), this.ironDark);
    post.position.y = 0.55;
    g.add(post);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.08, 14), this.ironDark);
    foot.position.y = 0.04;
    g.add(foot);
    const head = new THREE.Group();
    head.position.y = 1.22;
    g.add(head);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.46), yellow);
    head.add(body);
    for (const sx of [-0.1, 0.1]) {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.22, 12), yellow);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(sx, 0.02, -0.32);
      head.add(lens);
      const glassL = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), std("#203040", 0.1, 0.9));
      glassL.position.set(sx, 0.02, -0.431);
      glassL.rotation.y = Math.PI;
      head.add(glassL);
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 10), this.dark);
      eye.rotation.x = Math.PI / 2;
      eye.position.set(sx, 0.05, 0.27);
      head.add(eye);
    }
    // the live screen on its back, under the eyepieces
    const scr = this.screen(
      f,
      0.34,
      0.17,
      (c, W, H) => {
        c.fillStyle = "#07090c";
        c.fillRect(0, 0, W, H);
        c.fillStyle = "#f4b728";
        c.font = '700 44px "JetBrains Mono", Menlo, monospace';
        c.fillText(`#${this.height ? this.height.toLocaleString("en-US") : "……"}`, 18, 70);
        c.fillStyle = "#7fe3ff";
        c.font = '600 34px "JetBrains Mono", Menlo, monospace';
        c.fillText(`MEMPOOL ${this.ctx.director.mempoolList().length}`, 18, 140);
        c.fillStyle = "#3ee08f";
        c.fillRect(18, 166, Math.min(W - 36, (W - 36) * ((Date.now() - (this.ctx.director.lastBlockTime || Date.now())) / 75000)), 10);
        c.fillStyle = "#1f2a33";
        c.fillRect(18, 182, W - 36, 4);
      },
      2,
      head,
    );
    scr.position.set(0, -0.06, 0.232);
    this.groups[f].add(g);
    this.rects[f].push([x - 0.3, z - 0.3, x + 0.3, z + 0.3]);
    this.pick(f, body, `<b>Telescope ${n}</b><span>live chain</span>`, () => {
      const d = this.ctx.director;
      const last = d.lastBlockTime;
      const s = last ? Math.round((Date.now() - last) / 1000) : null;
      const pool = d.mempoolList();
      const shielded = pool.filter((t) => t.kind === "shielded").length;
      return {
        eyebrow: `Telescope ${n} · ${LEVELS[f].label === "S" ? "summit" : `floor ${LEVELS[f].label}`}`,
        title: this.height ? `Block ${this.height.toLocaleString("en-US")}` : "Block …",
        mono: true,
        tag: s != null ? (s < 90 ? ["live", "ok"] : ["waiting", "warn"]) : ["…", "muted"],
        stats: [
          ["Mempool", String(pool.length)],
          ["Shielded", String(shielded)],
          ["Last block", s != null ? `${s} s` : "—"],
          ["Height", `${Math.round(LEVELS[f].y)} m`],
        ],
        link: this.height ? { href: `https://zscan.cash/block/${this.height}`, label: "Open in ZScan" } : undefined,
      };
    });
    // the head sweeps slowly, as if someone were looking
    const base = dir;
    this.ticks[f].push((_, t) => (head.rotation.y = Math.sin(t * 0.25 + n * 1.7) * 0.35 + (base - dir)));
    return g;
  }

  /**
   * An elevator door pair at (x, z) facing `rot` (the way you look when you leave it), going to
   * `to`. Brass frame, cream doors, a lit floor indicator.
   */
  liftDoor(f: number, x: number, z: number, rot: number, to: number, o: { name?: string; color?: string } = {}) {
    const g = new THREE.Group();
    g.position.set(x, LEVELS[f].y, z);
    g.rotation.y = rot;
    const frameM = this.brass;
    const add = (w: number, h: number, d: number, px: number, py: number, pz: number, m: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(px, py + h / 2, pz);
      g.add(b);
      return b;
    };
    add(2.2, 2.9, 0.25, 0, 0, 0.0, this.ironDark);
    add(0.12, 2.5, 0.3, -0.85, 0, 0.05, frameM);
    add(0.12, 2.5, 0.3, 0.85, 0, 0.05, frameM);
    add(1.82, 0.14, 0.3, 0, 2.45, 0.05, frameM);
    const doors = add(1.58, 2.42, 0.06, 0, 0.02, 0.15, std("#d8ccb0", 0.35, 0.5));
    add(0.02, 2.42, 0.07, 0, 0.02, 0.16, this.dark);
    const col = o.color ?? (to > f ? "#3ee08f" : "#ff9f2e");
    add(0.9, 0.2, 0.04, 0, 2.62, 0.15, glowMat(col, 1.6));
    const lbl = textPlane(`${to > f ? "▲" : "▼"} ${LEVELS[to].label === "0" ? "ESPLANADE" : LEVELS[to].label === "S" ? "SOMMET" : `${LEVELS[to].label}${LEVELS[to].label === "1" ? "er" : "e"} ÉTAGE`}`, { h: 0.17, color: col, glow: true });
    lbl.position.set(0, 2.72, 0.18);
    g.add(lbl);
    this.groups[f].add(g);
    this.pick(f, doors, `<b>Lift ${to > f ? "up" : "down"}</b><span>${LEVELS[to].name}</span>`, () => ({ eyebrow: o.name ?? "Lift", title: LEVELS[to].name, floor: to }));
    return g;
  }

  /** Iron railing with a mesh between two points (and its collider). */
  railing(f: number, a: [number, number], b: [number, number], h = 1.15, mesh = true) {
    const y = LEVELS[f].y;
    const A = new THREE.Vector3(a[0], y, a[1]),
      B = new THREE.Vector3(b[0], y, b[1]);
    const len = A.distanceTo(B);
    const key = String(f);
    this.beam(key, A.clone().setY(y + h), B.clone().setY(y + h), 0.08, this.ironDark);
    this.beam(key, A.clone().setY(y + 0.12), B.clone().setY(y + 0.12), 0.06, this.ironDark);
    const n = Math.max(1, Math.round(len / 1.4));
    for (let i = 0; i <= n; i++) {
      const p = A.clone().lerp(B, i / n);
      this.beam(key, p, p.clone().setY(y + h), 0.07, this.ironDark);
    }
    if (mesh) {
      // a diamond mesh of thin flats
      const m = Math.round(len / 0.3);
      for (let i = 0; i < m; i++) {
        const p0 = A.clone().lerp(B, i / m).setY(y + 0.14),
          p1 = A.clone().lerp(B, (i + 1) / m).setY(y + h - 0.02);
        this.beam(key, p0, p1, 0.02, this.ironDark);
        const q0 = A.clone().lerp(B, (i + 1) / m).setY(y + 0.14),
          q1 = A.clone().lerp(B, i / m).setY(y + h - 0.02);
        this.beam(key, q0, q1, 0.02, this.ironDark);
      }
    }
    this.rects[f].push([Math.min(a[0], b[0]) - 0.12, Math.min(a[1], b[1]) - 0.12, Math.max(a[0], b[0]) + 0.12, Math.max(a[1], b[1]) + 0.12]);
  }

  /**
   * The iron arcade round a platform's edge: latticed posts, a girder along the top with sodium
   * lamps, and shallow arches between the posts, framing the view of the city.
   */
  arcade(f: number, half: number, h: number, step = 3.6) {
    const y = LEVELS[f].y;
    const key = String(f);
    const lamp = this.glow("#ffc060", 0.8, 3);
    for (let s = 0; s < 4; s++) {
      const nx = [0, 1, 0, -1][s],
        nz = [-1, 0, 1, 0][s];
      const at = (u: number, yy: number) => new THREE.Vector3(nx ? nx * half : u, yy, nz ? nz * half : u);
      const side = new THREE.Vector3(nz ? 0 : 0, 0, 0).set(Math.abs(nx), 0, Math.abs(nz)).multiplyScalar(1);
      const n = Math.max(2, Math.round((half * 2) / step));
      for (let i = 0; i <= n; i++) {
        const u = -half + (i * half * 2) / n;
        this.girder(key, at(u, y), at(u, y + h), side, 0.34, { chord: 0.09, web: 0.035 });
        if (i < n) {
          const u1 = -half + ((i + 1) * half * 2) / n;
          // the arch between two posts
          const m = 10;
          for (let j = 0; j < m; j++) {
            const t0 = j / m,
              t1 = (j + 1) / m;
            const a = at(u + (u1 - u) * t0, y + h - 0.9 + Math.sin(t0 * Math.PI) * 0.65),
              b = at(u + (u1 - u) * t1, y + h - 0.9 + Math.sin(t1 * Math.PI) * 0.65);
            this.beam(key, a, b, 0.06, this.ironDark);
          }
          const mid = at((u + u1) / 2, y + h - 0.02);
          this.slab(key, 0.16, 0.12, 0.16, mid.x, mid.y - 0.14, mid.z, lamp);
        }
      }
      this.girder(key, at(-half, y + h), at(half, y + h), new THREE.Vector3(0, 1, 0), 0.3, { chord: 0.1, web: 0.035 });
    }
  }

  /** A transparent pane (glass balustrade, glazing) between two points, no collider. */
  pane(parent: THREE.Object3D, a: [number, number], b: [number, number], y: number, h: number, mat: THREE.Material = this.glass) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat);
    p.position.set((a[0] + b[0]) / 2, y + h / 2, (a[1] + b[1]) / 2);
    p.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    p.raycast = () => {};
    parent.add(p);
    return p;
  }
}
