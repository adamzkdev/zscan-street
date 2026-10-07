import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ZScan } from "../../data/zscan";
import { Snark, loadArt } from "../../scene/snark";
import type { VoxelModel } from "../../scene/voxel/model";
import { place } from "../furniture";
import { glowMat, std, textPlane } from "../kit";
import type { InteriorContext, PickInfo, Rect } from "../types";
import { BALCONY_Y, CROWN_Y, TORCH_Y } from "./shell";

/**
 * The zkSNARK OF LIBERTY's shared kit: its levels (heights follow the statue model drawn round
 * you, so the view from each is the real city at that height), one group per floor, colliders,
 * people who talk among themselves, ticks, merged geometry, plaques and labels.
 */

export const LEVELS = [
  { label: "0", name: "Pedestal museum · the original torch", y: 0, view: 1.6 },
  { label: "1", name: "Pedestal balcony · the double helix", y: BALCONY_Y, view: 19 },
  { label: "2", name: "Crown · 25 windows", y: CROWN_Y, view: 35 },
  { label: "T", name: "Torch · closed since 1916", y: TORCH_Y, view: 45 },
];
export const LIGHTS_PER_FLOOR = 6;

/** What zkSNARKs say when you click them, by role. */
const LINES: Record<string, string[]> = {
  Ranger: ["Welcome to Liberty Island. Shielded by default.", "354 steps to the crown. Well, our version of 354.", "No flash photography of the torch, please. It's shy."],
  Visitor: ["She's taller than I thought.", "I can see ZStreet from here!", "Is the face a void on purpose?"],
  Kid: ["Why is she green?", "Can we go up the arm?", "Her eyes are glowing!"],
  Guide: ["Group, stay together. Yes, you in the hoodie.", "Eiffel designed the skeleton. The skin just floats on it.", "Copper turns green in about thirty years. Patience."],
  Photographer: ["Step left… a little more… perfect, torch in frame.", "The light up here at night, unreal."],
  Vendor: ["Foam crowns! Ten ZEC… just kidding, one.", "Torch keyrings, postcards, hoodies."],
  Couple: ["We got engaged on the balcony.", "Our first selfie with a zero-knowledge proof."],
  Climber: ["Made it. My legs did not consent.", "Two staircases, one up, one down. Like a double-entry ledger."],
};
export const linesFor = (role: string) => LINES[role] ?? LINES.Visitor;

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

/** Wrap `text` to `width` pixels; returns the lines. */
export function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > width && line) {
        out.push(line);
        line = w;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

export class StatueKit {
  readonly groups = LEVELS.map(() => new THREE.Group());
  /** The statue round you (balcony, inside, crown, torch). */
  readonly outside = new THREE.Group();
  readonly lightGroups = LEVELS.map(() => new THREE.Group());
  readonly rects: Rect[][] = LEVELS.map(() => []);
  readonly people: Snark[][] = LEVELS.map(() => []);
  readonly ticks: Tick[][] = LEVELS.map(() => []);
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, string>();
  readonly floorOf = new Map<THREE.Object3D, number>();
  readonly nightGlow: { mat: THREE.MeshBasicMaterial; day: number; night: number; color: THREE.Color }[] = [];
  private nightHooks: ((night: boolean) => void)[] = [];
  private lightCount = LEVELS.map(() => 0);
  private buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  /** Floors drawn together (the balcony and the crown are one climb). */
  shared: number[][] = LEVELS.map((_, i) => [i]);
  current = 0;
  night = false;
  private lastHeight = 0;
  get height() {
    return Math.max(this.lastHeight, this.ctx.director.blockHeight ?? 0);
  }

  readonly granite = std("#a89f90", 0.85);
  readonly graniteDark = std("#7d766b", 0.9);
  readonly brick = std("#8a5a44", 0.92);
  readonly iron = std("#3a3a40", 0.55, 0.6);
  readonly ironRust = std("#5a3a2a", 0.7, 0.4);
  readonly copper = std("#3f7a68", 0.6, 0.35);
  readonly copperNew = std("#c47a48", 0.35, 0.75);
  readonly gold = std("#d8a32c", 0.28, 0.9);
  readonly brass = std("#c8a256", 0.3, 0.85);
  readonly glass = new THREE.MeshStandardMaterial({ color: "#a8cce0", transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.3, depthWrite: false });
  readonly dark = std("#1c1a22", 0.5, 0.3);
  readonly wood = std("#6a4a30", 0.75);
  readonly floorStone = std("#9a9287", 0.7);

  constructor(
    readonly ctx: InteriorContext,
    readonly scene: THREE.Scene,
  ) {
    for (const g of this.groups) scene.add(g);
    this.groups.forEach((g, i) => g.add(this.lightGroups[i]));
    scene.add(this.outside);
    ctx.onBlock((h) => (this.lastHeight = h));
  }

  y(f: number) {
    return LEVELS[f].y;
  }

  glow(color: string, day: number, night: number) {
    const mat = glowMat(color, night);
    this.nightGlow.push({ mat, day, night, color: new THREE.Color(color) });
    return mat;
  }

  onNight(fn: (night: boolean) => void) {
    this.nightHooks.push(fn);
  }

  setNight(night: boolean) {
    this.night = night;
    for (const g of this.nightGlow) g.mat.color.copy(g.color).multiplyScalar(night ? g.night : g.day);
    for (const fn of this.nightHooks) fn(night);
  }

  // ---- merged geometry ----------------------------------------------------------------------

  private bucket(key: string, mat: THREE.Material) {
    const k = `${key}|${mat.uuid}`;
    let b = this.buckets.get(k);
    if (!b) this.buckets.set(k, (b = { mat, geos: [] }));
    return b;
  }

  /** A straight member (section t × tz) from a to b, merged into floor `f` ("out" for the shell). */
  beam(f: number | "out", a: THREE.Vector3, b: THREE.Vector3, t: number, mat: THREE.Material = this.iron, tz = t) {
    const len = a.distanceTo(b);
    if (len < 1e-3) return;
    const g = new THREE.BoxGeometry(t, tz, len);
    tmpQ.setFromUnitVectors(Z, b.clone().sub(a).normalize());
    tmpM.compose(a.clone().add(b).multiplyScalar(0.5), tmpQ, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(tmpM);
    this.bucket(String(f), mat).geos.push(g);
  }

  addGeo(f: number | "out", g: THREE.BufferGeometry, mat: THREE.Material) {
    this.bucket(String(f), mat).geos.push(g);
  }

  /** An axis-aligned box (bottom at y, absolute), merged. */
  slab(f: number | "out", w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    this.bucket(String(f), mat).geos.push(g);
  }

  /** A lattice girder: two chords `w` apart across `side`, zigzag webs. */
  girder(f: number | "out", a: THREE.Vector3, b: THREE.Vector3, side: THREE.Vector3, w: number, o: { chord?: number; web?: number; bays?: number; mat?: THREE.Material } = {}) {
    const chord = o.chord ?? 0.12,
      web = o.web ?? 0.05;
    const len = a.distanceTo(b);
    const n = o.bays ?? Math.max(1, Math.round(len / w));
    const off = side.clone().multiplyScalar(w / 2);
    const a0 = a.clone().sub(off),
      a1 = a.clone().add(off),
      b0 = b.clone().sub(off),
      b1 = b.clone().add(off);
    const mat = o.mat ?? this.iron;
    this.beam(f, a0, b0, chord, mat);
    this.beam(f, a1, b1, chord, mat);
    for (let i = 0; i < n; i++) {
      const p = (s: THREE.Vector3, e: THREE.Vector3, t: number) => s.clone().lerp(e, t);
      const t0 = i / n,
        t1 = (i + 1) / n;
      this.beam(f, p(a0, b0, t0), p(a1, b1, t1), web, mat);
      this.beam(f, p(a1, b1, t0), p(a0, b0, t1), web, mat);
    }
  }

  finish() {
    for (const [key, b] of this.buckets) {
      if (!b.geos.length) continue;
      const geos = b.geos.map((g) => {
        const n = g.index ? g.toNonIndexed() : g;
        for (const name of Object.keys(n.attributes)) if (!["position", "normal", "uv"].includes(name)) n.deleteAttribute(name);
        if (!n.attributes.uv) n.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((n.attributes.position.count * 2) | 0), 2));
        return n;
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      const where = key.split("|")[0];
      (where === "out" ? this.outside : this.groups[Number(where)]).add(mesh);
      for (const g of b.geos) g.dispose();
    }
    this.buckets.clear();
  }

  // ---- interaction -----------------------------------------------------------------------------

  pick(f: number, o: THREE.Object3D, hover: string, info: PickFn) {
    this.pickables.push(o);
    this.floorOf.set(o, f);
    this.hovers.set(o, hover);
    this.picks.set(o, info);
  }

  light(f: number, x: number, y: number, z: number, color = "#ffe6c8", intensity = 8, dist = 22) {
    if (this.lightCount[f] >= LIGHTS_PER_FLOOR) return null;
    this.lightCount[f]++;
    const l = new THREE.PointLight(color, intensity, dist, 1.5);
    l.position.set(x, y, z);
    this.lightGroups[f].add(l);
    return l;
  }

  /** Floor f's lights come from another floor drawn with it (no padding of its own). */
  noLights(f: number) {
    this.lightCount[f] = LIGHTS_PER_FLOOR;
  }

  /** Every floor ends with the same number of lights: changing floor never recompiles a shader. */
  padLights() {
    LEVELS.forEach((_, f) => {
      while (this.lightCount[f] < LIGHTS_PER_FLOOR) this.light(f, 0, -80, 0, "#000000", 0);
    });
  }

  put(f: number, key: string, build: () => VoxelModel, x: number, y: number, z: number, rot = 0, solid = true) {
    const obj = place(this.groups[f], key, build, x, y, z, rot);
    if (solid) {
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      this.rects[f].push([b.min.x + 0.05, b.min.z + 0.05, b.max.x - 0.05, b.max.z - 0.05]);
    }
    return obj;
  }

  label(f: number, text: string, x: number, y: number, z: number, o: { h?: number; color?: string; bg?: string; rot?: number; glow?: boolean; font?: string } = {}) {
    const p = textPlane(text, { h: o.h ?? 0.24, color: o.color ?? "#ffd28a", bg: o.bg, glow: o.glow ?? !o.bg, font: o.font });
    p.position.set(x, y, z);
    p.rotation.y = o.rot ?? 0;
    this.groups[f].add(p);
    return p;
  }

  /** A canvas panel (plaque, board) w × h metres at (x, y, z) turned `rot`, drawn once. */
  panel(f: number, w: number, h: number, x: number, y: number, z: number, rot: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, o: { px?: number; lit?: boolean; parent?: THREE.Object3D } = {}) {
    const W = o.px ?? 1024,
      H = Math.round((W * h) / w);
    const s = makeCanvas(W, H);
    draw(s.g, W, H);
    s.t.needsUpdate = true;
    const mat = o.lit ? new THREE.MeshBasicMaterial({ map: s.t, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: s.t, roughness: 0.55, metalness: 0.1 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    (o.parent ?? this.groups[f]).add(mesh);
    return { mesh, redraw: () => (draw(s.g, W, H), (s.t.needsUpdate = true)) };
  }

  /**
   * A cast plaque: bronze (or `style: "panel"`, a museum's dark panel), a title, a subtitle and
   * wrapped body text. Clickable when `info` is given.
   */
  plaque(f: number, w: number, h: number, x: number, y: number, z: number, rot: number, title: string, sub: string, body: string, o: { style?: "bronze" | "panel" | "stone"; parent?: THREE.Object3D } = {}) {
    const style = o.style ?? "bronze";
    const p = this.panel(
      f,
      w,
      h,
      x,
      y,
      z,
      rot,
      (g, W, H) => {
        const bg = style === "bronze" ? "#3a2a18" : style === "stone" ? "#cfc6b4" : "#16181d";
        const ink = style === "bronze" ? "#e8c46a" : style === "stone" ? "#2a2520" : "#f0e8d8";
        const accent = style === "bronze" ? "#b8893a" : style === "stone" ? "#6a5a40" : "#f4b728";
        g.fillStyle = bg;
        g.fillRect(0, 0, W, H);
        g.strokeStyle = accent;
        g.lineWidth = W * 0.012;
        g.strokeRect(W * 0.02, W * 0.02, W - W * 0.04, H - W * 0.04);
        const pad = W * 0.07;
        g.fillStyle = ink;
        g.textBaseline = "top";
        g.font = `700 ${Math.round(W * 0.062)}px "Times New Roman", Georgia, serif`;
        let yy = pad;
        for (const l of wrap(g, title, W - pad * 2)) {
          g.fillText(l, pad, yy);
          yy += W * 0.07;
        }
        if (sub) {
          g.fillStyle = accent;
          g.font = `600 ${Math.round(W * 0.03)}px "JetBrains Mono", Menlo, monospace`;
          g.fillText(sub.toUpperCase(), pad, yy + W * 0.008);
          yy += W * 0.06;
        }
        g.fillStyle = accent;
        g.fillRect(pad, yy, W * 0.16, W * 0.006);
        yy += W * 0.03;
        g.fillStyle = ink;
        g.font = `400 ${Math.round(W * 0.037)}px "Times New Roman", Georgia, serif`;
        for (const l of wrap(g, body, W - pad * 2)) {
          g.fillText(l, pad, yy);
          yy += W * 0.048;
        }
      },
      { parent: o.parent },
    );
    this.pick(f, p.mesh, `<b>${title}</b><span>${sub}</span>`, () => ({ eyebrow: sub || "Plaque", title, body: `<p>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>` }));
    return p.mesh;
  }

  /** A screen redrawn every few seconds while you are on its floor. */
  screen(f: number, w: number, h: number, x: number, y: number, z: number, rot: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, every = 3) {
    const p = this.panel(f, w, h, x, y, z, rot, draw, { px: 768, lit: true });
    let acc = 0;
    this.ticks[f].push((dt) => {
      acc += dt;
      if (acc < every) return;
      acc = 0;
      p.redraw();
    });
    return p.mesh;
  }

  // ---- people ------------------------------------------------------------------------------------

  /** A zkSNARK on floor f standing at (x, y, z): faces, bobs, wanders, talks when clicked. */
  async person(f: number, id: number, at: [number, number], role: string, o: { y?: number; face?: [number, number]; wander?: [number, number][]; cap?: boolean; sit?: boolean; title?: string } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      const base = o.y ?? LEVELS[f].y;
      s.root.position.set(at[0], base, at[1]);
      const look = () => (o.face ? new THREE.Vector3(o.face[0] - s.root.position.x, 0, o.face[1] - s.root.position.z).normalize() : null);
      s.faceDir = look();
      if (o.cap) s.setCap();
      if (o.sit) s.sit(true);
      this.groups[f].add(s.root);
      this.people[f].push(s);
      let said = 0;
      const lines = linesFor(role);
      const name = o.title ?? role;
      this.pick(f, s.body, `<b>${name}</b><span>zkSNARK #${id}</span>`, () => {
        const line = lines[said++ % lines.length];
        s.say(line, 3.5);
        return { eyebrow: name, title: `“${line}”`, image: ZScan.zkSnarkImage(id), body: `<p>zkSNARK #${id}</p>` };
      });
      if (o.wander) {
        const w = o.wander;
        void (async () => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 5000 + Math.random() * 9000));
            if (!this.shared[this.current].includes(f) || !s.router) continue;
            s.faceDir = null;
            const p = w[Math.floor(Math.random() * w.length)];
            await s.walk([new THREE.Vector3(p[0], base, p[1])], 0.8);
            s.faceDir = look();
          }
        })();
      }
      return s;
    } catch {
      return null;
    }
  }

  /**
   * People talking among themselves: each script is a list of [speaker, line]; while the floor is
   * drawn, one line every few seconds, a pause between scripts.
   */
  chat(f: number, cast: Promise<Snark | null>[], scripts: [number, string][][]) {
    let who: (Snark | null)[] = [];
    void Promise.all(cast).then((c) => (who = c));
    let s = Math.floor(Math.random() * scripts.length),
      line = 0,
      wait = 2 + Math.random() * 4;
    this.ticks[f].push((dt) => {
      wait -= dt;
      if (wait > 0 || !who.length) return;
      const sc = scripts[s];
      const [i, text] = sc[line];
      const p = who[i];
      if (p) p.say(text, 3.3);
      line++;
      wait = 3.4;
      if (line >= sc.length) {
        line = 0;
        s = (s + 1) % scripts.length;
        wait = 7 + Math.random() * 7;
      }
    });
  }

  /** A seeded visitor id. */
  visitor(n: number) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return 1 + Math.floor((x - Math.floor(x)) * 9999);
  }
}
