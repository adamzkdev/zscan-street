import * as THREE from "three";
import { Snark, loadArt } from "../../scene/snark";
import { hash } from "../../scene/voxel/model";
import type { VoxelModel } from "../../scene/voxel/model";
import { place } from "../furniture";
import { glowMat, std, textPlane } from "../kit";
import type { Interior, InteriorContext, PickInfo, Rect } from "../types";
import type { Theme } from "../../scene/theme";
import { T } from "../../i18n/lang";

/**
 * THE GAME HOUSE's kit: one hall (a single floor), its colliders, people, ticks, clicks and the
 * helpers the zones share: voxel furniture with automatic colliders, signs, live screens, zkSNARKs who
 * sit at the tables and now and then say something, and the house's few lamps (always the same
 * number: changing nothing never recompiles a shader).
 */

/** The hall: x across (−15 west … 15 east), z from the back wall (−24) to the street doors (0). */
export const ROOM = { x0: -15, x1: 15, z0: -24, z1: 0, h: 7.2 };
export const LIGHTS = 4;

export type Tick = (dt: number, t: number) => void;
export type PickFn = (hit?: THREE.Intersection) => PickInfo | null;
export type HoverFn = string | ((hit: THREE.Intersection) => string | null);

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

/** A repeating canvas texture. */
export function tex(size: number, rx: number, ry: number, draw: (g: CanvasRenderingContext2D, S: number) => void) {
  const { t } = makeCanvas(size, size, (g) => draw(g, size));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Short lines the zkSNARKs say over their heads, by what they are doing. */
const CHAT: Record<string, [string, string][]> = {
  poker: [
    ["Check.", "过牌。"],
    ["Raise.", "加注。"],
    ["All in.", "全下。"],
    ["Nice river.", "河牌真好。"],
    ["Fold. Again.", "弃牌。又弃。"],
    ["Pot's mine.", "奖池归我。"],
    ["My tell? Big proofs.", "我的破绽？证明太大。"],
  ],
  barons: [
    ["Wall Street is mine!", "华尔街归我了！"],
    ["Rent's due at ZEC Needle.", "ZEC 针塔该交租了。"],
    ["Doubles!", "对子！"],
    ["I'll build a node there.", "我要在那儿建个节点。"],
    ["Trade you Marina Bay?", "拿滨海湾跟你换？"],
  ],
  glyph: [
    ["One snark left!", "只剩一张了！"],
    ["Your turn.", "轮到你了。"],
    ["Shed!", "出牌！"],
    ["Orchard on Orchard.", "果园对果园。"],
    ["Not that one…", "别出那张……"],
  ],
  party: [
    ["Z-Block's on the far side!", "Z 方块在对面！"],
    ["Twist space! Here comes a reorg…", "转折格！要重组了……"],
    ["Mini-game time!", "小游戏时间！"],
    ["Hop, hop, hop.", "跳，跳，跳。"],
  ],
  wall: [
    ["SNARK KART tonight. I'm on fire.", "今晚 SNARK KART，我手感火热。"],
    ["Who beat my laser score?", "谁破了我的激光纪录？"],
    ["Tournament at the desk, ten games!", "柜台那边有锦标赛，十场！"],
    ["Seeded by the last Zcash block. Fair and square.", "上一个 Zcash 区块洗的牌。公平公正。"],
  ],
  bar: [
    ["One Zero-Knowledge Sour.", "来杯零知识酸酒。"],
    ["On the house when a block lands.", "区块落地时本店请客。"],
    ["Lucky nonce tonight?", "今晚手气好吗？"],
  ],
};
export const chatLine = (kind: string, i: number) => {
  const l = CHAT[kind] ?? CHAT.wall;
  const [en, zh] = l[i % l.length];
  return T(en, zh);
};

export class GKit {
  readonly root = new THREE.Group();
  readonly rects: Rect[] = [];
  readonly people: { s: Snark; chat: string }[] = [];
  readonly ticks: Tick[] = [];
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, HoverFn>();
  private lightCount = 0;
  private lastHeight = 0;
  /** The latest block height: the street's last block, or the newest one announced since. */
  get height() {
    return Math.max(this.lastHeight, this.ctx.director.blockHeight ?? 0);
  }

  // shared materials
  readonly dark = std("#16141c", 0.6, 0.2);
  readonly trim = std("#2a2632", 0.45, 0.4);
  readonly walnut = std("#3a2418", 0.55);
  readonly chrome = std("#c8ccd4", 0.22, 0.9);
  readonly brass = std("#a9bcc4", 0.3, 0.85);
  readonly hidden = new THREE.MeshBasicMaterial({ visible: false });
  readonly flare = glowMat("#ff6b35", 1.6);
  readonly lilac = glowMat("#c4b1fc", 1.4);
  readonly glacier = glowMat("#a8d8e8", 1.3);
  readonly bulb = glowMat("#fff1d6", 1.5);

  constructor(
    readonly ctx: InteriorContext,
    readonly scene: THREE.Scene,
  ) {
    scene.add(this.root);
    ctx.onBlock((h) => (this.lastHeight = h));
  }

  pick(o: THREE.Object3D, hover: HoverFn, info: PickFn) {
    this.pickables.push(o);
    this.hovers.set(o, hover);
    this.picks.set(o, info);
  }

  /** Every mesh of an object answers the same click. */
  pickAll(o: THREE.Object3D, hover: HoverFn, info: PickFn) {
    o.traverse((m) => m instanceof THREE.Mesh && this.pick(m, hover, info));
  }

  /** An invisible box that answers clicks (a group of things, a table and its chairs). */
  hit(w: number, h: number, d: number, x: number, y: number, z: number, hover: HoverFn, info: PickFn, rot = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.hidden);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rot;
    this.root.add(m);
    this.pick(m, hover, info);
    return m;
  }

  light(x: number, y: number, z: number, color = "#ffe6c8", intensity = 10, dist = 22) {
    if (this.lightCount >= LIGHTS) return;
    this.lightCount++;
    const l = new THREE.PointLight(color, intensity, dist, 1.4);
    l.position.set(x, y, z);
    this.root.add(l);
  }

  /** Always exactly LIGHTS lamps (the shaders never change). */
  padLights() {
    while (this.lightCount < LIGHTS) this.light(0, 5, -12, "#000000", 0);
  }

  /**
   * A piece of voxel furniture at (x, z), turned `rot`; by default it also blocks the walker (its
   * footprint, slightly shrunk).
   */
  put(key: string, build: () => VoxelModel, x: number, z: number, rot = 0, o: { dy?: number; solid?: boolean; parent?: THREE.Object3D } = {}) {
    const obj = place(o.parent ?? this.root, key, build, x, o.dy ?? 0, z, rot);
    if (o.solid !== false) {
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      if (b.max.y > 0.25) this.rects.push([b.min.x + 0.05, b.min.z + 0.05, b.max.x - 0.05, b.max.z - 0.05]);
    }
    return obj;
  }

  /** A box mesh (bottom at y) in the hall. */
  box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.root) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    parent.add(m);
    return m;
  }

  label(text: string, x: number, y: number, z: number, o: { h?: number; color?: string; bg?: string; rot?: number; glow?: boolean; font?: string } = {}) {
    const p = textPlane(text, { h: o.h ?? 0.24, color: o.color ?? "#ffd28a", bg: o.bg, glow: o.glow ?? !o.bg, font: o.font });
    p.position.set(x, y, z);
    p.rotation.y = o.rot ?? 0;
    p.raycast = () => {};
    this.root.add(p);
    return p;
  }

  /** A screen redrawn every `every` seconds (and when `dirty()` is called). */
  screen(w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, every = 3, px = 768) {
    const W = px,
      H = Math.round((px * h) / w);
    const s = makeCanvas(W, H);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.t, toneMapped: false }));
    let acc = 0;
    const redraw = () => {
      draw(s.g, W, H);
      s.t.needsUpdate = true;
    };
    this.ticks.push((dt) => {
      acc += dt;
      if (acc < every) return;
      acc = 0;
      redraw();
    });
    redraw();
    this.root.add(mesh);
    return Object.assign(mesh, { redraw });
  }

  /** Many copies of one small mesh in one draw call. */
  instances(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], parent: THREE.Object3D = this.root) {
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.raycast = () => {};
    parent.add(im);
    return im;
  }

  /** A flat plane on the floor (rug, inlay), `dy` above it. */
  flat(w: number, d: number, mat: THREE.Material, x: number, z: number, dy = 0.01) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, dy, z);
    m.raycast = () => {};
    this.root.add(m);
    return m;
  }

  /**
   * A zkSNARK in the hall: standing, or sitting on a seat `dy` high; facing `face`; wandering between
   * spots; `chat`: what kind of lines it says now and then (see CHAT), and its role for a talk.
   */
  async person(id: number, at: [number, number], role: string, o: { face?: THREE.Vector3; wander?: [number, number][]; dy?: number; sit?: boolean; chat?: string } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      const base = o.dy ?? 0;
      s.root.position.set(at[0], base, at[1]);
      s.faceDir = o.face ?? new THREE.Vector3(0, 0, 1);
      if (o.sit) {
        if (o.dy) s.sit(true, o.dy);
        else s.perchNear();
      }
      this.root.add(s.root);
      this.people.push({ s, chat: o.chat ?? "" });
      if (o.wander) {
        const w = o.wander;
        void (async () => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 5000 + Math.random() * 8000));
            if (!s.root.parent) return;
            s.faceDir = null;
            const p = w[Math.floor(Math.random() * w.length)];
            await s.walk([new THREE.Vector3(p[0], 0, p[1])], 0.9);
            s.faceDir = o.face ?? null;
          }
        })();
      }
      return s;
    } catch {
      return null;
    }
  }

  rnd(i: number, j = 0) {
    return hash(i, j, 77, 1);
  }
}

/** The house's signs are drawn in this font (one language: the font as it is). */
export const zfont = (font: string) => font;

// ---- day and night inside -----------------------------------------------------------------------

const DAYLIGHT = new THREE.Color("#eef4ff");
const LAMPLIGHT = new THREE.Color("#ffd2a0");
const MOON = new THREE.Color("#9db2dc");
const SUN = new THREE.Color("#fff3e2");

/**
 * The light of a place that follows the sky outside, for places lit the same by day and by night.
 * By day the fill is brighter and cooler and daylight comes in from the street side; by night the
 * fill is dimmer and warmer, the lamps a little stronger and warmer, the screens and signs glow.
 * `windows(n)`: how much of floor n's light comes from outside (0 underground, 1 a glass floor);
 * a floor without windows stays as it was built. Light counts never change (no shader recompile):
 * the daylight is one more directional light, dimmed to a faint moonlight at night.
 */
export function withDayNight<I extends Interior>(i: I, ctx: { theme: Theme }, windows: (floor: number) => number = () => 1): I {
  const scene = i.scene;
  const sun = new THREE.DirectionalLight(SUN, 0);
  // from the street (+z), high: through the front glass, onto the floor
  sun.position.set(0.35, 1, 0.8);
  scene.add(sun, sun.target);
  const lights = new Map<THREE.Light, { i: number; c: THREE.Color }>();
  const glows = new Map<THREE.Material, { c?: THREE.Color; e?: number }>();
  const env = scene.environmentIntensity;
  let theme = ctx.theme;
  let floor = 0;
  const apply = () => {
    const w = Math.max(0, Math.min(1, windows(floor)));
    const night = theme === "night";
    scene.traverse((o) => {
      if (o === sun) return;
      if (o instanceof THREE.Light) {
        let b = lights.get(o);
        if (!b) lights.set(o, (b = { i: o.intensity, c: o.color.clone() }));
        const fill = o instanceof THREE.HemisphereLight || o instanceof THREE.AmbientLight || o instanceof THREE.DirectionalLight;
        o.color.copy(b.c);
        if (fill) {
          o.intensity = b.i * (night ? 1 - 0.45 * w : 1 + 0.25 * w);
          o.color.lerp(night ? LAMPLIGHT : DAYLIGHT, (night ? 0.4 : 0.25) * w);
        } else {
          // a lamp: it carries the room at night, the day outshines it a little
          o.intensity = b.i * (night ? 1 + 0.3 * w : 1 - 0.1 * w);
          if (night) o.color.lerp(LAMPLIGHT, 0.18 * w);
        }
        return;
      }
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        let b = glows.get(mat);
        if (!b) {
          b = {};
          // self-lit: screens, signs, light panels (glowMat), and emissive standard materials
          if (mat instanceof THREE.MeshBasicMaterial && !mat.toneMapped) b.c = mat.color.clone();
          else if (mat instanceof THREE.MeshStandardMaterial && mat.emissiveIntensity > 0 && mat.emissive.getHex() !== 0) b.e = mat.emissiveIntensity;
          glows.set(mat, b);
        }
        const k = night ? 1 + 0.2 * w : 1;
        if (b.c) (mat as THREE.MeshBasicMaterial).color.copy(b.c).multiplyScalar(k);
        if (b.e != null) (mat as THREE.MeshStandardMaterial).emissiveIntensity = b.e * (night ? 1 + 0.35 * w : 1);
      }
    });
    scene.environmentIntensity = env * (night ? 1 - 0.5 * w : 1 + 0.3 * w);
    sun.color.copy(night ? MOON : SUN);
    sun.intensity = (night ? 0.12 : 1) * w;
  };
  const setFloor = i.setFloor?.bind(i);
  const setTheme = i.setTheme?.bind(i);
  i.setFloor = (n) => {
    setFloor?.(n);
    floor = n;
    apply();
  };
  i.setTheme = (t) => {
    setTheme?.(t);
    theme = t;
    apply();
  };
  apply();
  return i;
}
