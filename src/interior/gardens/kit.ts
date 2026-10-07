import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Market } from "../../data/market";
import { API, ZScan } from "../../data/zscan";
import { loadArt, Snark } from "../../scene/snark";
import type { Tone } from "../../scene/speech";
import { hash } from "../../scene/voxel/model";
import { textPlane } from "../kit";
import type { InteriorContext, PickInfo, Rect } from "../types";

/**
 * GARDENS BY THE BAY's kit: its levels and the three zones they belong to (the Grove with its
 * Skyway, the Cloud Forest with its Cloud Walk, the Flower Dome; only the zone you are in is drawn,
 * lit and animated), colliders, people who talk, ticks, and the batching every zone relies on:
 * plain geometry merged into one mesh per finish (vertex colours).
 */

export interface Level {
  label: string;
  name: string;
  y: number;
  spawn: [number, number];
  yaw: number;
  zone: number;
  /** Height of the city panorama (metres above the street) and how far behind the door it is taken. */
  view: number;
  back: number;
}

export const LEVELS: Level[] = [
  { label: "G", name: "Supertree Grove · Garden Rhapsody", y: 0, spawn: [0, 4], yaw: 0, zone: 0, view: 8, back: -110 },
  { label: "22", name: "OCBC Skyway · 22 m", y: 22, spawn: [-29.5, -43], yaw: 0, zone: 0, view: 24, back: -50 },
  { label: "CF", name: "Cloud Forest · 35 m waterfall", y: -80, spawn: [0, 4], yaw: 0, zone: 1, view: 6, back: -50 },
  { label: "CW", name: "Cloud Walk · 18 m", y: -62, spawn: [18, -30], yaw: 0, zone: 1, view: 20, back: -50 },
  { label: "FD", name: "Flower Dome · tulips, olives, baobabs", y: -160, spawn: [0, 6], yaw: 0, zone: 2, view: 6, back: -50 },
];
export const F = { grove: 0, skyway: 1, cloud: 2, walk: 3, flower: 4 } as const;
export const ZONES = 3;
export const LIGHTS_PER_ZONE = 6;

export const MONO = '"JetBrains Mono", Menlo, monospace';
export const SANS = '"Avenir Next", "Helvetica Neue", Arial, sans-serif';

export type Tick = (dt: number, t: number) => void;
export type PickFn = () => PickInfo | null;
export type Finish = "matte" | "polish" | "metal" | "glow" | "glass";
/** A line said in a bubble; a function reads the live chain when it is said. */
export type Line = string | (() => string);
const said = (l: Line) => (typeof l === "string" ? l : l());

const FINISH: Record<Finish, THREE.Material> = {
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 }),
  polish: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.08, envMapIntensity: 1.2 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.75, envMapIntensity: 1.2 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
};

export function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

/** A canvas texture drawn once (repeat it with `rx`, `ry`). */
export function paint(w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, rx = 1, ry = 1) {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (rx !== 1 || ry !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
  }
  return t;
}

/** Plain geometry of one zone, merged per finish (vertex colours). */
class Batch {
  private lists = new Map<Finish, THREE.BufferGeometry[]>();
  add(finish: Finish, geo: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    let l = this.lists.get(finish);
    if (!l) this.lists.set(finish, (l = []));
    l.push(g);
  }
  build(parent: THREE.Object3D) {
    for (const [finish, list] of this.lists) {
      if (!list.length) continue;
      const geo = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!geo) continue;
      const m = new THREE.Mesh(geo, FINISH[finish]);
      m.matrixAutoUpdate = false;
      m.raycast = () => {};
      if (finish === "glass") m.renderOrder = 2;
      parent.add(m);
    }
    this.lists.clear();
  }
}

// ---- zkSNARK busts from the collection atlas (crowds on the lawn) -------------------------------

let atlas: THREE.Texture | null = null;
function atlasTexture() {
  if (atlas) return atlas;
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  atlas = loader.load(`${API}/v1/collections/zksnarks/map/image`);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  return atlas;
}
const CROWD_VERT = /* glsl */ `
attribute float aSlot;
attribute float aPhase;
uniform float uTime;
varying vec2 vAt;
void main() {
  vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float s = length(instanceMatrix[0].xyz);
  vec3 f = cameraPosition - c;
  f.y = 0.0;
  f = normalize(f + vec3(0.0001, 0.0, 0.0));
  vec3 r = vec3(f.z, 0.0, -f.x);
  float bob = abs(sin(uTime * (1.4 + fract(aPhase * 7.3) * 1.6) + aPhase * 6.283)) * 0.03;
  vec3 p = c + r * position.x * s + vec3(0.0, position.y * s + bob, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  float col = mod(aSlot, 100.0);
  float row = floor(aSlot / 100.0);
  vec2 q = uv * 0.94 + 0.03;
  vAt = vec2((col + q.x) / 100.0, 1.0 - (row + 1.0 - q.y) / 100.0);
}`;
const CROWD_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uDim;
varying vec2 vAt;
void main() {
  vec4 t = texture2D(map, vAt);
  if (max(t.r, max(t.g, t.b)) < 0.035) discard;
  gl_FragColor = vec4(t.rgb * uDim, 1.0);
  #include <colorspace_fragment>
}`;

// ---- the kit ------------------------------------------------------------------------------------

export class GardensKit {
  readonly groups = Array.from({ length: ZONES }, () => new THREE.Group());
  readonly rects: Rect[][] = LEVELS.map(() => []);
  readonly people: Snark[][] = LEVELS.map(() => []);
  /** Per zone. */
  readonly ticks: Tick[][] = Array.from({ length: ZONES }, () => []);
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, string>();
  readonly zoneOfPick = new Map<THREE.Object3D, number>();
  private casts: (() => void)[][] = Array.from({ length: ZONES }, () => []);
  private cast = Array.from({ length: ZONES }, () => false);
  private batches = Array.from({ length: ZONES }, () => new Batch());
  private lightCount = Array.from({ length: ZONES }, () => 0);
  readonly blockFns: ((h: number) => void)[] = [];
  /** Per-floor ground heights (ramps, steps), checked in order. */
  readonly grounds: ((x: number, z: number) => number | null)[][] = LEVELS.map(() => []);
  /** The floor and zone you are on. */
  current = 0;
  zone = 0;
  night = false;
  readonly themeFns: ((night: boolean) => void)[] = [];
  /** The walker's eye, every frame. */
  readonly eye = new THREE.Vector3();
  private lastHeight = 0;
  readonly hidden = new THREE.MeshBasicMaterial({ visible: false });
  private crowdMats: THREE.ShaderMaterial[] = [];

  constructor(
    readonly ctx: InteriorContext,
    readonly scene: THREE.Scene,
  ) {
    for (const g of this.groups) scene.add(g);
    ctx.onBlock((h) => {
      this.lastHeight = h;
      for (const fn of this.blockFns) fn(h);
    });
    Market.subscribe(() => {});
  }

  get height() {
    return Math.max(this.lastHeight, this.ctx.director.blockHeight ?? 0);
  }
  /** ZEC in dollars, or null while loading. */
  get price() {
    return Market.state.price?.usd ?? null;
  }

  y(f: number) {
    return LEVELS[f].y;
  }
  g(f: number) {
    return this.groups[LEVELS[f].zone];
  }
  private b(f: number) {
    return this.batches[LEVELS[f].zone];
  }

  setNight(n: boolean) {
    this.night = n;
    for (const m of this.crowdMats) m.uniforms.uDim.value = n ? 0.55 : 1;
    for (const fn of this.themeFns) fn(n);
  }

  // ---- geometry ----

  box(f: number, w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, finish: Finish = "matte", ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    if (ry) g.rotateY(ry);
    g.translate(x, LEVELS[f].y + y, z);
    this.b(f).add(finish, g, color);
  }

  cyl(f: number, r0: number, r1: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, finish: Finish = "matte", seg = 20) {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg).translate(0, h / 2, 0);
    g.translate(x, LEVELS[f].y + y, z);
    this.b(f).add(finish, g, color);
  }

  /** Any geometry, already placed relative to the floor (its y is added). */
  geo(f: number, g: THREE.BufferGeometry, color: THREE.ColorRepresentation, finish: Finish = "matte") {
    g.translate(0, LEVELS[f].y, 0);
    this.b(f).add(finish, g, color);
  }

  /** A beam between two points (relative to floor f), square section `t`. */
  beam(f: number, a: THREE.Vector3, b: THREE.Vector3, t: number, color: THREE.ColorRepresentation, finish: Finish = "metal") {
    const len = a.distanceTo(b);
    if (len < 1e-3) return;
    const g = new THREE.BoxGeometry(t, len, t).translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q).translate(a.x, a.y + LEVELS[f].y, a.z);
    this.b(f).add(finish, g, color);
  }

  /** A slab between two points (any direction): a wall, and colliders along it. */
  wall(f: number, x0: number, z0: number, x1: number, z1: number, h: number, color: THREE.ColorRepresentation, finish: Finish = "matte", t = 0.3, y = 0, solid = true) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.BoxGeometry(len, h, t).translate(0, h / 2, 0);
    g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    g.translate((x0 + x1) / 2, LEVELS[f].y + y, (z0 + z1) / 2);
    this.b(f).add(finish, g, color);
    if (solid) this.line(f, x0, z0, x1, z1, t);
  }

  /** Colliders along a line (small squares when it runs at an angle). */
  line(f: number, x0: number, z0: number, x1: number, z1: number, t = 0.3) {
    if (x0 === x1 || z0 === z1) {
      this.solid(f, Math.min(x0, x1) - (x0 === x1 ? t / 2 : 0), Math.min(z0, z1) - (z0 === z1 ? t / 2 : 0), Math.max(x0, x1) + (x0 === x1 ? t / 2 : 0), Math.max(z0, z1) + (z0 === z1 ? t / 2 : 0));
      return;
    }
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.3);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n,
        z = z0 + ((z1 - z0) * i) / n;
      this.solid(f, x - 0.2, z - 0.2, x + 0.2, z + 0.2);
    }
  }

  /** Colliders round a circle (or an arc from a0 to a1, radians from +z). */
  ring(f: number, cx: number, cz: number, r: number, a0 = 0, a1 = Math.PI * 2) {
    const n = Math.ceil((Math.abs(a1 - a0) * r) / 0.3);
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const x = cx + Math.sin(a) * r,
        z = cz + Math.cos(a) * r;
      this.solid(f, x - 0.2, z - 0.2, x + 0.2, z + 0.2);
    }
  }

  /** A solid disc (a tree's planter): a few rects covering it. */
  disc(f: number, cx: number, cz: number, r: number) {
    const k = r * 0.7071;
    this.solid(f, cx - k, cz - r, cx + k, cz + r);
    this.solid(f, cx - r, cz - k, cx + r, cz + k);
  }

  solid(f: number, x0: number, z0: number, x1: number, z1: number) {
    this.rects[f].push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  }

  /** A textured plane, not merged. */
  plane(f: number, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, LEVELS[f].y + y, z);
    m.rotation.set(rx, ry, 0, "YXZ");
    m.raycast = () => {};
    this.g(f).add(m);
    return m;
  }

  add(f: number, o: THREE.Object3D, x = o.position.x, y = 0, z = o.position.z) {
    o.position.set(x, LEVELS[f].y + y, z);
    this.g(f).add(o);
    return o;
  }

  flush() {
    this.batches.forEach((b, z) => b.build(this.groups[z]));
  }

  // ---- light ----

  light(f: number, x: number, y: number, z: number, color = "#ffe2b8", intensity = 20, dist = 26) {
    const zn = LEVELS[f].zone;
    if (this.lightCount[zn] >= LIGHTS_PER_ZONE) return null;
    this.lightCount[zn]++;
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, LEVELS[f].y + y, z);
    this.groups[zn].add(l);
    return l;
  }

  padLights() {
    for (let z = 0; z < ZONES; z++)
      while (this.lightCount[z] < LIGHTS_PER_ZONE) {
        this.lightCount[z]++;
        const l = new THREE.PointLight("#000000", 0, 1);
        l.position.set(0, -500, 0);
        this.groups[z].add(l);
      }
  }

  // ---- signs ----

  label(f: number, text: string, x: number, y: number, z: number, o: { h?: number; color?: string; bg?: string; ry?: number; glow?: boolean; font?: string } = {}) {
    const p = textPlane(text, { h: o.h ?? 0.24, color: o.color ?? "#ffffff", bg: o.bg, glow: o.glow ?? !o.bg, font: o.font });
    p.position.set(x, LEVELS[f].y + y, z);
    p.rotation.y = o.ry ?? 0;
    p.raycast = () => {};
    this.g(f).add(p);
    return p;
  }

  // ---- clicks ----

  pick(f: number, o: THREE.Object3D, hover: string, info: PickFn) {
    this.pickables.push(o);
    this.zoneOfPick.set(o, LEVELS[f].zone);
    this.hovers.set(o, hover);
    this.picks.set(o, info);
  }

  hit(f: number, w: number, h: number, d: number, x: number, y: number, z: number, hover: string, info: PickFn, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.hidden);
    m.position.set(x, LEVELS[f].y + y + h / 2, z);
    m.rotation.y = ry;
    this.g(f).add(m);
    this.pick(f, m, hover, info);
    return m;
  }

  /** A door (or lift) to another floor: a click takes you there. */
  door(f: number, to: number, w: number, h: number, x: number, y: number, z: number, ry = 0, verb = "Go to") {
    const l = LEVELS[to];
    return this.hit(f, w, h, 0.6, x, y, z, `<b>${verb} ${l.name.split(" · ")[0]}</b><span>${l.name.split(" · ")[1] ?? l.label}</span>`, () => ({ eyebrow: "Gardens by the Bay", title: l.name.split(" · ")[0], floor: to }), ry);
  }

  // ---- people ----

  onCast(f: number, fn: () => void) {
    this.casts[LEVELS[f].zone].push(fn);
  }

  enter(f: number) {
    this.current = f;
    this.zone = LEVELS[f].zone;
    if (!this.cast[this.zone]) {
      this.cast[this.zone] = true;
      for (const fn of this.casts[this.zone]) fn();
    }
  }

  /**
   * A zkSNARK on floor f. `lines`: what it says when the walker comes near; `wander`: spots it
   * strolls between; `sit`, `dy`, `face`; a click shows who it is.
   */
  async person(f: number, id: number, at: [number, number], role: string, o: { face?: [number, number]; wander?: [number, number][]; dy?: number; sit?: boolean; lines?: Line[]; tone?: Tone; near?: number; every?: [number, number]; cap?: boolean } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      const base = LEVELS[f].y + (o.dy ?? 0);
      s.root.position.set(at[0], base, at[1]);
      const face = o.face ? new THREE.Vector3(o.face[0], 0, o.face[1]).normalize() : null;
      s.faceDir = face?.clone() ?? new THREE.Vector3(0, 0, 1);
      if (o.sit) s.sit(true);
      if (o.cap) s.setCap();
      this.g(f).add(s.root);
      this.people[f].push(s);
      const lines = o.lines ?? [];
      let n = Math.floor(Math.random() * Math.max(1, lines.length));
      let wait = 1 + Math.random() * 5;
      const sayNext = () => lines.length && s.say(said(lines[n++ % lines.length]), 3.6, o.tone ?? "talk");
      const zn = LEVELS[f].zone;
      if (lines.length) {
        const near = o.near ?? 7;
        const [a, b] = o.every ?? [9, 16];
        this.ticks[zn].push((dt) => {
          wait -= dt;
          if (wait > 0) return;
          wait = 1;
          if (Math.abs(this.eye.y - 1.6 - s.root.position.y) < 2.5 && Math.hypot(this.eye.x - s.root.position.x, this.eye.z - s.root.position.z) < near) {
            sayNext();
            wait = a + Math.random() * (b - a);
          }
        });
      }
      this.pick(f, s.body, `<b>${role}</b><span>zkSNARK #${id}</span>`, () => {
        sayNext();
        wait = 6;
        return { eyebrow: `Gardens by the Bay · ${role}`, title: `zkSNARK #${id}`, mono: true, image: ZScan.zkSnarkImage(id), stats: [["Role", role]] };
      });
      if (o.wander) {
        const w = o.wander;
        void (async () => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 3500 + Math.random() * 8000));
            if (this.current !== f) continue;
            s.faceDir = null;
            const p = w[Math.floor(Math.random() * w.length)];
            await s.walk([new THREE.Vector3(p[0], base, p[1])], 0.8 + Math.random() * 0.3);
            s.faceDir = face?.clone() ?? null;
          }
        })();
      }
      return s;
    } catch {
      return null;
    }
  }

  /** Two or three people talking to each other while the walker is near: the script goes round. */
  dialog(f: number, who: Promise<Snark | null>[], script: [number, Line][], o: { near?: number; tone?: Tone; gap?: number } = {}) {
    void Promise.all(who).then((ss) => {
      if (ss.some((s) => !s)) return;
      const people = ss as Snark[];
      let i = 0;
      let wait = 1 + Math.random() * 3;
      const near = o.near ?? 12;
      this.ticks[LEVELS[f].zone].push((dt) => {
        wait -= dt;
        if (wait > 0) return;
        const p = people[0].root.position;
        if (Math.abs(this.eye.y - 1.6 - p.y) > 3 || Math.hypot(this.eye.x - p.x, this.eye.z - p.z) > near) {
          wait = 1;
          return;
        }
        const [k, text] = script[i];
        const s = people[k];
        const other = people[(k + 1) % people.length];
        if (!s.isWalking) s.faceDir = other.root.position.clone().sub(s.root.position).setY(0).normalize();
        s.say(said(text), 3.4, o.tone ?? "talk");
        i = (i + 1) % script.length;
        wait = i === 0 ? (o.gap ?? 10) + Math.random() * 6 : 3.6;
      });
    });
  }

  /** zkSNARK busts from the collection atlas, one draw call: [x, y, z, id, size]. */
  crowd(f: number, at: [number, number, number, number, number][]) {
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const slots = new Float32Array(at.length);
    const phases = new Float32Array(at.length);
    at.forEach(([, , , id], i) => {
      slots[i] = Math.max(0, id - 1);
      phases[i] = hash(id, i, 5, 9);
    });
    geo.setAttribute("aSlot", new THREE.InstancedBufferAttribute(slots, 1));
    geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
    const uniforms = { map: { value: atlasTexture() }, uTime: { value: 0 }, uDim: { value: this.night ? 0.55 : 1 } };
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: CROWD_VERT, fragmentShader: CROWD_FRAG });
    this.crowdMats.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, at.length);
    const m = new THREE.Matrix4();
    at.forEach(([x, y, z, , s], i) => {
      m.makeScale(s, s, s).setPosition(x, LEVELS[f].y + y, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    this.g(f).add(mesh);
    this.ticks[LEVELS[f].zone].push((_dt, t) => (uniforms.uTime.value = t));
    return mesh;
  }

  rnd(i: number, j = 0, k = 0) {
    return hash(i, j, k, 31);
  }
}

/** Round-cornered rectangle path. */
export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
