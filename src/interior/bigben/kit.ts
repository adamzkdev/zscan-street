import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Snark, loadArt } from "../../scene/snark";
import { ZScan } from "../../data/zscan";
import type { InteriorContext, PickInfo, Rect } from "../types";

/**
 * BIG BEN's shared kit: the plan of the Elizabeth Tower (one square tower, the spiral stair in its
 * corner), the levels the stair reaches, batched static geometry (one mesh per material and zone),
 * colliders per level, clickable things, painted textures and the people.
 */

// ---- the plan (metres; the street door is on z = 0) --------------------------------------------

/** Westminster Hall, the landing at the top of St Stephen's steps, the tower behind it. */
export const HALL = { x0: -9, x1: 9, z0: -44, z1: 0, wall: 10.5, ridge: 21.5 };
export const STEPS = { z0: -40, z1: -36, n: 10 };
/** The tower floor (the landing and passage are at this height too). */
export const Y0 = 1.8;
export const TOWER = { x0: -8, x1: 8, z0: -64, z1: -48 };
export const TC = { x: 0, z: -56 };
/** The spiral stair: its well's centre, radius, newel, the rise of a step, steps per turn. */
export const SC = { x: 5.5, z: -50.5 };
export const SR = 2.45;
export const NEWEL = 0.3;
export const RISE = 0.16;
export const PER_TURN = 24;
export const DA = (Math.PI * 2) / PER_TURN;
/** Angle (x–z plane, atan2(dz, dx)) of the first step's leading edge; steps climb clockwise. */
export const A0 = (195 / 180) * Math.PI;
/** Every landing door faces the room (225°: toward the tower's centre). */
export const DOOR_A = (225 / 180) * Math.PI;
export const DOOR_HALF = (27 / 180) * Math.PI;

export type Zone = "hall" | "stair" | "prison" | "clock" | "dials" | "belfry" | "ayrton";
export const ZONES: Zone[] = ["hall", "stair", "prison", "clock", "dials", "belfry", "ayrton"];
/** Step reached at each landing (the belfry is the 334th, as in the real tower). */
export const STEP_AT = { prison: 118, clock: 262, dials: 286, belfry: 334, ayrton: 382 } as const;
export const TOP_STEP = STEP_AT.ayrton;
export const levelY = (n: number) => +(Y0 + n * RISE).toFixed(3);
export const LY = {
  hall: 0,
  stair: Y0,
  prison: levelY(STEP_AT.prison),
  clock: levelY(STEP_AT.clock),
  dials: levelY(STEP_AT.dials),
  belfry: levelY(STEP_AT.belfry),
  ayrton: levelY(STEP_AT.ayrton),
};
/** Ceiling heights of the rooms. */
export const ROOM_H = { prison: 3.6, clock: LY.dials - LY.clock - 0.3, dials: LY.belfry - LY.dials - 0.3, belfry: LY.ayrton - LY.belfry - 0.3, ayrton: 4.6 };
/** The top of the stair well. */
export const SHAFT_TOP = LY.ayrton + ROOM_H.ayrton;
/** How far behind the door (street side) the tower stands and the outside height of each zone. */
export const VIEW_BACK = 5.3;

export const LEVELS: { zone: Zone; label: string; name: string; y: number }[] = [
  { zone: "hall", label: "G", name: "Westminster Hall", y: 0 },
  { zone: "stair", label: "0", name: "Tower foot · 334 steps", y: Y0 },
  { zone: "prison", label: "118", name: "Prison Room · step 118", y: LY.prison },
  { zone: "clock", label: "262", name: "Clock Room · the Great Clock", y: LY.clock },
  { zone: "dials", label: "286", name: "Behind the Dials", y: LY.dials },
  { zone: "belfry", label: "334", name: "Belfry · the Great Bell", y: LY.belfry },
  { zone: "ayrton", label: "382", name: "Ayrton Light", y: LY.ayrton },
];

export type Tick = (dt: number, t: number) => void;
export type PickFn = (hit: THREE.Intersection) => PickInfo | null;

export const SANS = '"Inter", "Helvetica Neue", Arial, sans-serif';
export const SERIF = '"Cormorant Garamond", "Times New Roman", Georgia, serif';
export const MONO = '"JetBrains Mono", Menlo, monospace';

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Deterministic noise. */
export function rnd(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Honey ashlar (Anston limestone), coursed, a block every 0.6 × 0.3 m at repeat 1 per 2.4 m. */
function ashlar(g: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], seed: number) {
  const r = rnd(seed);
  const rows = 8,
    cols = 4;
  const bh = h / rows,
    bw = w / cols;
  for (let j = 0; j < rows; j++)
    for (let i = -1; i < cols; i++) {
      const x = i * bw + (j % 2) * bw * 0.5,
        y = j * bh;
      const k = 0.9 + r() * 0.16;
      g.fillStyle = `rgb(${base[0] * k},${base[1] * k},${base[2] * k})`;
      g.fillRect(x, y, bw, bh);
      for (let n = 0; n < 40; n++) {
        g.fillStyle = `rgba(${r() < 0.5 ? "60,45,30" : "255,245,220"},${0.04 + r() * 0.05})`;
        g.fillRect(x + r() * bw, y + r() * bh, 2 + r() * 6, 1 + r() * 3);
      }
    }
  g.strokeStyle = "rgba(70,55,35,0.45)";
  g.lineWidth = 2;
  for (let j = 0; j <= rows; j++) {
    g.beginPath();
    g.moveTo(0, j * bh);
    g.lineTo(w, j * bh);
    g.stroke();
    for (let i = 0; i <= cols; i++) {
      const x = i * bw + (j % 2) * bw * 0.5;
      g.beginPath();
      g.moveTo(x, j * bh);
      g.lineTo(x, (j + 1) * bh);
      g.stroke();
    }
  }
}

/** Geometry merged per material and zone at the end. */
interface Bucket {
  zone: Zone;
  mat: THREE.Material;
  geos: THREE.BufferGeometry[];
}

const Z = new THREE.Vector3(0, 0, 1);

export class BBKit {
  readonly groups = Object.fromEntries(ZONES.map((z) => [z, new THREE.Group()])) as Record<Zone, THREE.Group>;
  readonly rects = Object.fromEntries(ZONES.map((z) => [z, [] as Rect[]])) as Record<Zone, Rect[]>;
  readonly people = Object.fromEntries(ZONES.map((z) => [z, [] as Snark[]])) as Record<Zone, Snark[]>;
  readonly ticks = Object.fromEntries(ZONES.map((z) => [z, [] as Tick[]])) as Record<Zone, Tick[]>;
  /** Ground under (x, z) per zone where it is not the zone's floor (the hall's steps). */
  readonly grounds: Partial<Record<Zone, (x: number, z: number) => number | null>> = {};
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, string>();
  readonly zoneOf = new Map<THREE.Object3D, Zone>();
  /** Materials that change with day and night. */
  readonly dayNight: ((night: boolean) => void)[] = [];
  /** Where the walker's eye is (set every frame). */
  readonly eye = new THREE.Vector3();
  night = false;
  private buckets = new Map<string, Bucket>();
  private matIds = new Map<THREE.Material, number>();

  // ---- shared materials ----
  readonly stoneTex = canvasTex(512, 512, (g, w, h) => ashlar(g, w, h, [206, 188, 146], 3), [1, 1]);
  readonly stone: THREE.MeshStandardMaterial;
  readonly stoneLt = new THREE.MeshStandardMaterial({ color: "#dccb9e", roughness: 0.85 });
  readonly stoneDk = new THREE.MeshStandardMaterial({ color: "#9c8a66", roughness: 0.9 });
  readonly oak = new THREE.MeshStandardMaterial({ color: "#5a3e26", roughness: 0.75 });
  readonly oakDk = new THREE.MeshStandardMaterial({ color: "#3a2716", roughness: 0.8 });
  readonly iron = new THREE.MeshStandardMaterial({ color: "#2a2c31", roughness: 0.55, metalness: 0.6 });
  readonly green = new THREE.MeshStandardMaterial({ color: "#2e4a3c", roughness: 0.45, metalness: 0.4 });
  readonly brass = new THREE.MeshStandardMaterial({ color: "#c9a04a", roughness: 0.3, metalness: 0.85 });
  readonly gold = new THREE.MeshStandardMaterial({ color: "#e0b448", roughness: 0.28, metalness: 0.9 });
  readonly bronze = new THREE.MeshStandardMaterial({ color: "#7a5a32", roughness: 0.42, metalness: 0.85 });
  readonly red = new THREE.MeshStandardMaterial({ color: "#8e1f22", roughness: 0.7 });
  readonly blue = new THREE.MeshStandardMaterial({ color: "#1f2d58", roughness: 0.5, metalness: 0.2 });
  readonly glass = new THREE.MeshStandardMaterial({ color: "#b8d0e0", transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.2, depthWrite: false });
  readonly warm = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd8a0").multiplyScalar(2.2), toneMapped: false });
  readonly warmSoft = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffc878").multiplyScalar(1.4), toneMapped: false });

  constructor(
    readonly ctx: InteriorContext,
    readonly scene: THREE.Scene,
  ) {
    this.stone = new THREE.MeshStandardMaterial({ map: this.stoneTex, roughness: 0.9 });
    for (const z of ZONES) scene.add(this.groups[z]);
  }

  /** Stone with its own texture repeat (one texture per wall size keeps the blocks square). */
  stoneRep(rx: number, ry: number) {
    const t = this.stoneTex.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  }

  /** Add a geometry (already placed) to the zone's batch for `mat`. */
  geo(zone: Zone, mat: THREE.Material, g: THREE.BufferGeometry) {
    let id = this.matIds.get(mat);
    if (id === undefined) this.matIds.set(mat, (id = this.matIds.size));
    const key = `${zone}|${id}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { zone, mat, geos: [] }));
    b.geos.push(g);
  }

  /** A box from its bottom centre (x, y, z), optionally turned round y. */
  box(zone: Zone, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y + h / 2, z);
    this.geo(zone, mat, g);
  }

  /** A beam w × h from a to b. */
  beam(zone: Zone, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, w: number, h: number) {
    const d = b.clone().sub(a);
    const g = new THREE.BoxGeometry(w, h, d.length());
    const q = new THREE.Quaternion().setFromUnitVectors(Z, d.clone().normalize());
    g.applyQuaternion(q);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.geo(zone, mat, g);
  }

  cyl(zone: Zone, mat: THREE.Material, r: number, h: number, x: number, y: number, z: number, seg = 16, r2 = r) {
    const g = new THREE.CylinderGeometry(r2, r, h, seg);
    g.translate(x, y + h / 2, z);
    this.geo(zone, mat, g);
  }

  /** A wall collider (and a box drawn for it, when `mat` is given). */
  solid(zone: Zone, x0: number, z0: number, x1: number, z1: number) {
    this.rects[zone].push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  }

  /** A wall: a box from (x0,z0) to (x1,z1), `t` thick, from y to y + h, with its collider. */
  wall(zone: Zone, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number, h: number, t = 0.4, collide = true) {
    const w = Math.max(Math.abs(x1 - x0), t),
      d = Math.max(Math.abs(z1 - z0), t);
    this.box(zone, mat, w, h, d, (x0 + x1) / 2, y, (z0 + z1) / 2);
    if (collide) this.solid(zone, (x0 + x1) / 2 - w / 2, (z0 + z1) / 2 - d / 2, (x0 + x1) / 2 + w / 2, (z0 + z1) / 2 + d / 2);
  }

  /** Merge every batch into one mesh per material and zone. */
  finish() {
    for (const b of this.buckets.values()) {
      const geos = b.geos.map((g) => {
        const n = g.index ? g.toNonIndexed() : g;
        for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") n.deleteAttribute(k);
        if (!n.attributes.uv) n.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((n.attributes.position.count * 2) | 0), 2));
        return n;
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.matrixAutoUpdate = false;
      this.groups[b.zone].add(mesh);
    }
    this.buckets.clear();
  }

  /** Make `o` clickable (and hoverable) on its zone. */
  pick(zone: Zone, o: THREE.Object3D, hover: string, fn: PickFn) {
    this.pickables.push(o);
    this.picks.set(o, fn);
    this.hovers.set(o, hover);
    this.zoneOf.set(o, zone);
  }

  /** A text panel as a mesh `h` metres tall, drawn on a canvas `cw` × `ch`. */
  panel(cw: number, ch: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, basic = true) {
    const t = canvasTex(cw, ch, draw);
    const mat = basic ? new THREE.MeshBasicMaterial({ map: t, transparent: true }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, transparent: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry((h * cw) / ch, h), mat);
    return m;
  }

  /** A brass plaque with engraved lines. */
  plaque(lines: string[], w = 1.2, h = 0.5, dark = false) {
    return this.panel(512, Math.round((512 * h) / w), h, (g, W, H) => {
      const grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, dark ? "#1d2440" : "#d8b45a");
      grd.addColorStop(1, dark ? "#141a30" : "#a9802e");
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = dark ? "#c9a04a" : "#6e5220";
      g.lineWidth = 6;
      g.strokeRect(10, 10, W - 20, H - 20);
      g.fillStyle = dark ? "#e8c66a" : "#3a2a10";
      g.textAlign = "center";
      g.textBaseline = "middle";
      const n = lines.length;
      lines.forEach((l, i) => {
        const big = i === 0;
        g.font = `${big ? 700 : 500} ${big ? Math.min(64, (H / (n + 1)) * 0.9) : Math.min(40, (H / (n + 1)) * 0.7)}px ${SERIF}`;
        g.fillText(l, W / 2, (H * (i + 0.9)) / (n + 0.8));
      });
    }, false);
  }

  /**
   * A zkSNARK. `talk`: lines said when the walker comes near; `wander`: spots it strolls between
   * (straight lines, open floor only).
   */
  async person(zone: Zone, id: number, at: [number, number, number], role: string, o: { face?: THREE.Vector3; talk?: string[]; wander?: [number, number][]; near?: number; sit?: boolean; cap?: boolean } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      // stays on its own floor: no router from the elevator floors
      s.router = { routeAll: (_from, pts) => pts };
      s.root.position.set(at[0], at[1], at[2]);
      s.faceDir = o.face ?? new THREE.Vector3(0, 0, 1);
      if (o.sit) s.sit(true);
      if (o.cap) s.setCap();
      this.groups[zone].add(s.root);
      this.people[zone].push(s);
      const lines = o.talk ?? [];
      let said = Math.floor(Math.random() * 10);
      let wait = 1 + Math.random() * 5;
      if (lines.length) {
        const near = o.near ?? 7;
        this.ticks[zone].push((dt) => {
          wait -= dt;
          if (wait > 0) return;
          wait = 1;
          const e = this.eye;
          if (Math.abs(e.y - 1.6 - s.root.position.y) < 2 && Math.hypot(e.x - s.root.position.x, e.z - s.root.position.z) < near) {
            s.say(lines[said++ % lines.length], 3.8);
            wait = 8 + Math.random() * 9;
          }
        });
      }
      if (o.wander) {
        const w = o.wander,
          base = at[1];
        void (async () => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 4000 + Math.random() * 7000));
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

  /**
   * Two or more people talking to each other: the lines go round in turn (speaker index, words)
   * while the walker is near.
   */
  converse(zone: Zone, who: Promise<Snark | null>[], script: [number, string][][], at: [number, number, number], near = 10) {
    void Promise.all(who).then((people) => {
      let k = Math.floor(Math.random() * script.length),
        line = 0,
        wait = 2 + Math.random() * 3;
      this.ticks[zone].push((dt) => {
        wait -= dt;
        if (wait > 0) return;
        const e = this.eye;
        if (Math.abs(e.y - 1.6 - at[1]) > 2.5 || Math.hypot(e.x - at[0], e.z - at[2]) > near) {
          wait = 1;
          return;
        }
        const conv = script[k % script.length];
        const [i, words] = conv[line];
        const s = people[i];
        if (s) {
          s.say(words, 3.2);
          // the others turn to the speaker
          for (const p of people) if (p && p !== s) p.faceDir = s.root.position.clone().sub(p.root.position).setY(0).normalize();
        }
        line++;
        wait = 3.3;
        if (line >= conv.length) {
          line = 0;
          k++;
          wait = 9 + Math.random() * 8;
        }
      });
    });
  }

  image(id: number) {
    return ZScan.zkSnarkImage(id);
  }
}

/** London time now, as hours (0–24) with fractions; the Great Clock keeps it. */
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
export function londonTime() {
  const d = new Date();
  const p = fmt.formatToParts(d);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  const s = get("second") + d.getMilliseconds() / 1000;
  return { h: get("hour"), m: get("minute"), s, hours: get("hour") + get("minute") / 60 + s / 3600 };
}

/** The angles of the hands (radians, clockwise from twelve). */
export function handAngles() {
  const t = londonTime();
  return { hour: ((t.hours % 12) / 12) * Math.PI * 2, minute: ((t.m + t.s / 60) / 60) * Math.PI * 2, t };
}

/** A toothed wheel lying in the x–y plane (axis along z), centred, `th` thick. */
export function gearGeo(r: number, teeth: number, th: number, hole = 0.15, spokes = 0) {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const tooth = Math.floor(i / 2) % 2 === 0;
    const rr = tooth ? r : r * (1 - Math.min(0.12, 2.4 / teeth));
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  if (spokes) {
    // windows between the spokes
    const ri = r * 0.28,
      ro = r * 0.72;
    for (let k = 0; k < spokes; k++) {
      const a0 = (k / spokes) * Math.PI * 2 + 0.22,
        a1 = ((k + 1) / spokes) * Math.PI * 2 - 0.22;
      const p = new THREE.Path();
      p.moveTo(Math.cos(a0) * ri, Math.sin(a0) * ri);
      for (let j = 0; j <= 8; j++) {
        const a = a0 + ((a1 - a0) * j) / 8;
        p.lineTo(Math.cos(a) * ro, Math.sin(a) * ro);
      }
      p.lineTo(Math.cos(a1) * ri, Math.sin(a1) * ri);
      s.holes.push(p);
    }
  } else if (hole) {
    const p = new THREE.Path();
    p.absarc(0, 0, hole, 0, Math.PI * 2, true);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -th / 2);
  return g;
}

/** A floor (or ceiling) plate over the tower square with the stair well cut out. */
export function plateGeo(x0: number, z0: number, x1: number, z1: number, th: number, hole: { x: number; z: number; r: number } | null, rect?: [number, number, number, number]) {
  const s = new THREE.Shape();
  // shape in x / -z so that after rotating it lies on the floor the right way round
  s.moveTo(x0, -z0);
  s.lineTo(x1, -z0);
  s.lineTo(x1, -z1);
  s.lineTo(x0, -z1);
  s.lineTo(x0, -z0);
  if (hole) {
    const p = new THREE.Path();
    p.absarc(hole.x, -hole.z, hole.r, 0, Math.PI * 2, true);
    s.holes.push(p);
  }
  if (rect) {
    const p = new THREE.Path();
    p.moveTo(rect[0], -rect[1]);
    p.lineTo(rect[0], -rect[3]);
    p.lineTo(rect[2], -rect[3]);
    p.lineTo(rect[2], -rect[1]);
    p.lineTo(rect[0], -rect[1]);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false, curveSegments: 32 });
  // extruded along +z: turn it so the extrusion goes down (−y) from the top face at y = 0
  g.rotateX(-Math.PI / 2);
  g.translate(0, -th, 0);
  // uv in metres / 2
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
  return g;
}

/** A flat quad through four corners (counter-clockwise seen from its front), uv in metres / `tile`. */
export function quadGeo(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, tile = 2) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([p0, p1, p2, p0, p2, p3].flatMap((p) => [p.x, p.y, p.z]), 3));
  const w = p0.distanceTo(p1) / tile,
    h = p1.distanceTo(p2) / tile;
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, w, 0, w, h, 0, 0, w, h, 0, h], 2));
  g.computeVertexNormals();
  return g;
}

/**
 * A straight wall along x (fixed z) or along z (fixed x), `t` thick, from y to y + h, with
 * rectangular openings [centre, width, bottom, top] (windows, doors) left open; adds its collider
 * (openings above 1 m stay solid for the walker, doors with `walk` do not).
 */
export function openWall(k: BBKit, zone: Zone, mat: THREE.Material, axis: "x" | "z", fixed: number, a0: number, a1: number, y: number, h: number, holes: [number, number, number, number, boolean?][], t = 0.5) {
  const seg = (b0: number, b1: number, y0: number, y1: number) => {
    if (b1 - b0 < 0.01 || y1 - y0 < 0.01) return;
    const c = (b0 + b1) / 2;
    if (axis === "x") k.box(zone, mat, b1 - b0, y1 - y0, t, c, y0, fixed);
    else k.box(zone, mat, t, y1 - y0, b1 - b0, fixed, y0, c);
  };
  const hs = [...holes].sort((p, q) => p[0] - q[0]);
  let b = a0;
  for (const [c, w, h0, h1] of hs) {
    const l = c - w / 2,
      r = c + w / 2;
    seg(b, l, y, y + h);
    seg(l, r, y, y + h0);
    seg(l, r, y + h1, y + h);
    b = r;
  }
  seg(b, a1, y, y + h);
  // colliders: the whole line except walkable doors
  let cb = a0;
  const add = (p: number, q: number) => {
    if (q - p < 0.01) return;
    if (axis === "x") k.solid(zone, p, fixed - t / 2, q, fixed + t / 2);
    else k.solid(zone, fixed - t / 2, p, fixed + t / 2, q);
  };
  for (const [c, w, , , walk] of hs)
    if (walk) {
      add(cb, c - w / 2);
      cb = c + w / 2;
    }
  add(cb, a1);
}

/**
 * A tower room at height y: floor plate (the stair well and an optional pit cut out), four walls
 * with window openings on the outer sides, a ceiling. Returns the wall material.
 */
export function shell(k: BBKit, zone: Zone, y: number, h: number, o: { floor: THREE.Material; wall?: THREE.Material; ceiling?: THREE.Material | null; windows?: { y0: number; y1: number; w: number }; pit?: [number, number, number, number] }) {
  const T = TOWER;
  const wall = o.wall ?? k.stoneRep(16 / 2.4, h / 2.4);
  k.geo(zone, o.floor, plateGeo(T.x0 - 0.25, T.z0 - 0.25, T.x1 + 0.25, T.z1 + 0.25, 0.3, { ...SC, r: SR + 0.02 }, o.pit).translate(0, y, 0));
  if (o.ceiling !== null) k.geo(zone, o.ceiling ?? k.stoneDk, plateGeo(T.x0 - 0.25, T.z0 - 0.25, T.x1 + 0.25, T.z1 + 0.25, 0.25, { ...SC, r: SR + 0.02 }).translate(0, y + h + 0.25, 0));
  const w = o.windows;
  const holes = (cs: number[]): [number, number, number, number][] => (w ? cs.map((c) => [c, w.w, w.y0, w.y1]) : []);
  openWall(k, zone, wall, "x", T.z0 - 0.25, T.x0 - 0.5, T.x1 + 0.5, y, h, holes([-5, 0, 5]));
  openWall(k, zone, wall, "x", T.z1 + 0.25, T.x0 - 0.5, T.x1 + 0.5, y, h, holes([-5, 0]));
  openWall(k, zone, wall, "z", T.x0 - 0.25, T.z0, T.z1, y, h, holes([-61, -56, -51]));
  openWall(k, zone, wall, "z", T.x1 + 0.25, T.z0, T.z1, y, h, holes([-61, -56]));
  return wall;
}

/** The window openings `shell` cuts (for bars and glazing): [axis, fixed, centre]. */
export const SHELL_WINDOWS: ["x" | "z", number, number][] = [
  ["x", TOWER.z0 - 0.25, -5],
  ["x", TOWER.z0 - 0.25, 0],
  ["x", TOWER.z0 - 0.25, 5],
  ["x", TOWER.z1 + 0.25, -5],
  ["x", TOWER.z1 + 0.25, 0],
  ["z", TOWER.x0 - 0.25, -61],
  ["z", TOWER.x0 - 0.25, -56],
  ["z", TOWER.x0 - 0.25, -51],
  ["z", TOWER.x1 + 0.25, -61],
  ["z", TOWER.x1 + 0.25, -56],
];
