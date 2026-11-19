/**
 * The scenery kit every SNARK KART track builds with: boxes and shapes merged by material (plain toon
 * colours, unlit lights and neon, ink edges, windowed facades, the sign atlas), signs, stands with
 * crowds, arches, lamp posts, flags, billboards, blocks of flats, trees, a wheel; glows (one draw of
 * soft halos round the lights: the night's bloom), pools of light on the road and wet reflections.
 * Everything a track adds goes through here, so a whole circuit stays a few dozen draws.
 */
import * as THREE from "three";
import { FONT, rng } from "../../kit";
import { GEO, canvasTex, toonSteps, type SkyOpts } from "../../k3";
import { CYL, Merge, STEP, Track } from "./track";
import type { RaceCtx } from "./course";

export const INK = 0x15101f;

/** Low-poly unit shapes for the scenery (merged by the hundred: few vertices each; never disposed). */
export const LO = {
  ball: new THREE.SphereGeometry(0.5, 12, 8),
  dome: new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  cone: new THREE.ConeGeometry(0.5, 1, 12),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  pyr: new THREE.ConeGeometry(0.5, 1, 4),
  oct: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  /** A low mound (a snowbank, a bush): a coarse half ball. */
  mound: new THREE.SphereGeometry(0.5, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2),
};
for (const g of Object.values(LO)) g.userData = { shared: true };

/** A track's look: the sky, the light, the ground, the road, the barriers, the water. */
export interface Theme {
  sky: [string, string];
  fog: [number, number];
  sun: { color: string; i: number; pos: [number, number, number] };
  hemi: { sky: string; ground: string; i: number };
  night: boolean;
  /** The sky dome painted round it all (k3 skyDome: clouds, stars, the sun or the moon where the light comes from). */
  dome?: SkyOpts;
  /** The sun's cast shadows: how dark (shadows.ts shadowK), how far ahead of the chase camera (shadowR). */
  shadowK?: number;
  shadowR?: number;
  /** The ground's tile (S × S px), and how many metres it covers. */
  ground: (g: CanvasRenderingContext2D, S: number) => void;
  groundM: number;
  /** The road's bed: in the open, in town (a 64×64 paving tile), on a deck. */
  bedOpen: string;
  pave: (g: CanvasRenderingContext2D) => void;
  bedDeck: string;
  /** The asphalt (roadPaint): its colour, its lines, what lies over it. */
  road: Road;
  /** A shiny road (rain): Phong instead of toon. */
  wet?: boolean;
  kerb: [string, string];
  rumble: [string, string];
  /** The barriers: the padded stripes' four colours, the town wall's base and posters, the caps. */
  wall: string[];
  town: [string, string[]];
  cap: string;
  /** The embankments' bricks (base, mortar); the stone round the water. */
  brick: [string, string];
  bank: string;
  /** The water's 64×64 tile and its metres; its drift (per second, in tiles). */
  water: (g: CanvasRenderingContext2D) => void;
  waterM: number;
  waterDrift: [number, number];
  /** The water's surface height (default: WATER; a frozen river sits higher, near the road). */
  waterY?: number;
  /** The facades' windows: how many are lit, their colours. */
  windows: { lit: number; on: string; off: string };
  /** The skyline's ring. */
  skyline: { r: number; n: number; tall: number; pal: string[] };
  /** Clouds (white puffs) or none. */
  clouds: number;
  cloudColor: string;
}

/** The asphalt's tile: the whole road's width across, 9 m along. */
export interface Road {
  base: string;
  /** The worn band down the middle of each lane (a touch lighter or darker than the base). */
  worn: string;
  /** The grit: two faint tones. */
  grit: [string, string];
  /** The centre's dashes, the solid lines by the kerbs. */
  dash: string;
  edge: string;
  /** How much the lines glow at night (0: paint only): the road ahead reads in the dark. */
  glow?: number;
  /** What lies over the asphalt (snow swept to the sides, the wet's smears), under the lines. */
  over?: (g: CanvasRenderingContext2D, S: number) => void;
}

/**
 * The asphalt on an S × S tile (u: across the road, v: 9 m along): a calm surface, two worn lanes, a
 * seam every tile, crisp lines. `lines`: only the lines, white on black (the night's glow map).
 */
export function roadPaint(g: CanvasRenderingContext2D, S: number, r: Road, R: () => number, lines = false) {
  const u = S / 512;
  g.fillStyle = lines ? "#000000" : r.base;
  g.fillRect(0, 0, S, S);
  if (!lines) {
    // (the lanes the tyres polish: two soft bands, feathered)
    for (const cx of [0.27, 0.73]) {
      const gr = g.createLinearGradient((cx - 0.15) * S, 0, (cx + 0.15) * S, 0);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(0.5, r.worn);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect((cx - 0.15) * S, 0, 0.3 * S, S);
    }
    // (grit: sparse, small, square, the same density everywhere)
    for (let i = 0; i < 520; i++) {
      g.fillStyle = r.grit[i & 1];
      const d = (1 + Math.floor(R() * 2)) * 2 * u;
      g.fillRect(Math.floor(R() * S), Math.floor(R() * S), d, d);
    }
    // (a seam across, once a tile)
    g.fillStyle = r.grit[1];
    g.fillRect(0, S - 3 * u, S, 2 * u);
    r.over?.(g, S);
  }
  // the lines: a dash down the middle (4 m on, 5 m off), a solid one by each kerb
  g.fillStyle = lines ? "#ffffff" : r.dash;
  g.fillRect(S / 2 - 5 * u, S * 0.04, 10 * u, S * 0.44);
  g.fillStyle = lines ? "#9a9a9a" : r.edge;
  g.fillRect(13 * u, 0, 9 * u, S);
  g.fillRect(S - 22 * u, 0, 9 * u, S);
}

const mm = new THREE.Matrix4();
const mq = new THREE.Quaternion();
const me = new THREE.Euler();
const mv = new THREE.Vector3();
const ms = new THREE.Vector3();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const sc1 = new THREE.Vector3();
const col1 = new THREE.Color();
const UPV = new THREE.Vector3(0, 1, 0);
const XV = new THREE.Vector3(1, 0, 0);
const ZV = new THREE.Vector3(0, 0, 1);

/** A sign face in the atlas: its uv rect and aspect. */
export type Face = number[];

let glowTex: THREE.Texture | null = null;
/** A soft round halo (white, for the glows and the pools of light). */
export function haloTex() {
  glowTex ??= canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,255,255,0.55)");
    gr.addColorStop(0.6, "rgba(255,255,255,0.14)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
  return glowTex;
}

export class Kit {
  readonly plain = new Merge();
  readonly lit = new Merge();
  readonly ink = new Merge();
  readonly wins = new Merge();
  readonly signs = new Merge();
  /** Glows: small and big halos (x, y, z, r, g, b each). */
  private glowS: number[] = [];
  private glowB: number[] = [];
  /** Pools of light and wet reflections on the road (x, y, z, yaw, w, l, r, g, b). */
  private pools: number[] = [];
  /** Beacons that blink (x, y, z, r, g, b each). */
  private blinks: number[] = [];
  /** The clouds' mesh (the race drifts it). */
  cloudMesh: THREE.InstancedMesh | null = null;
  /** Things that turn (y), crowds that jump, anything else that moves each frame. */
  readonly spinners: { o: THREE.Object3D; k: number }[] = [];
  readonly crowds: THREE.Object3D[] = [];
  readonly anims: ((t: number, dt: number) => void)[] = [];
  /** Where landmarks stand: the city keeps clear. */
  readonly busy: { x: number; z: number; r: number }[] = [];
  /** Buildings placed. */
  readonly placed: { x: number; z: number; r: number }[] = [];
  /** The race as it runs (the camera, the kart in view, the gusts), for the weather in `anims`. */
  ctx: RaceCtx | null = null;
  private atlas: HTMLCanvasElement;
  private ag: CanvasRenderingContext2D;
  private cell = 0;

  constructor(
    readonly s: THREE.Scene,
    readonly tr: Track,
    readonly th: Theme,
    readonly R: () => number,
  ) {
    this.atlas = document.createElement("canvas");
    this.atlas.width = 1024;
    this.atlas.height = 1024;
    this.ag = this.atlas.getContext("2d")!;
  }

  /** A box with an ink edge. */
  inked(color: THREE.ColorRepresentation, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, t = 0.06) {
    this.plain.box(color, w, h, d, x, y, z, ry);
    this.ink.box(INK, w + 2 * t, h + 2 * t, d + 2 * t, x, y, z, ry);
  }

  /** A cylinder (r, h) at (x, y, z) (its middle), tipped rx then turned ry. */
  cyl(m: Merge, color: THREE.ColorRepresentation, r: number, h: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    me.set(rx, ry, rz, "YXZ");
    m.add(CYL, mm.compose(mv.set(x, y, z), mq.setFromEuler(me), ms.set(r * 2, h, r * 2)), color);
  }

  /** A ball (radii) at (x, y, z). */
  ball(m: Merge, color: THREE.ColorRepresentation, rx: number, ry: number, rz: number, x: number, y: number, z: number, yaw = 0) {
    m.shape(GEO.ball, color, rx * 2, ry * 2, rz * 2, x, y, z, yaw);
  }

  /** (x, z) local to a frame at (ox, oz) turned ry. */
  local(ox: number, oz: number, ry: number, lx: number, lz: number): [number, number] {
    const c = Math.cos(ry),
      sn = Math.sin(ry);
    return [ox + lx * c + lz * sn, oz - lx * sn + lz * c];
  }

  /** Paints a sign's face (wide: a whole row) and gives its uv rect. */
  face(s0: string, fg: string, bg: string, wide = false, deco?: (g: CanvasRenderingContext2D, w: number) => void, glow = false): Face {
    const ag = this.ag;
    if (wide && this.cell % 2) this.cell++;
    const row = Math.floor(this.cell / 2),
      x = (this.cell % 2) * 512,
      w = wide ? 1024 : 512;
    this.cell += wide ? 2 : 1;
    ag.save();
    ag.translate(x, row * 128);
    ag.fillStyle = "#15101f";
    ag.beginPath();
    ag.roundRect(2, 2, w - 4, 124, 26);
    ag.fill();
    ag.fillStyle = bg;
    ag.beginPath();
    ag.roundRect(8, 8, w - 16, 112, 20);
    ag.fill();
    if (deco) deco(ag, w);
    if (s0) {
      ag.font = `900 80px ${FONT}`;
      const fit = Math.min(80, (80 * (w - 70)) / Math.max(1, ag.measureText(s0).width));
      ag.font = `900 ${fit}px ${FONT}`;
      ag.textAlign = "center";
      ag.textBaseline = "middle";
      ag.lineJoin = "round";
      if (glow) {
        // (neon: the letters glow in their colour on a dark board)
        ag.shadowColor = fg;
        ag.shadowBlur = 16;
        ag.fillStyle = fg;
        ag.fillText(s0, w / 2, 68);
        ag.shadowBlur = 0;
        ag.fillStyle = "#ffffff";
        ag.globalAlpha = 0.55;
        ag.fillText(s0, w / 2, 68);
        ag.globalAlpha = 1;
      } else {
        ag.lineWidth = fit * 0.16;
        ag.strokeStyle = "rgba(21,16,31,0.55)";
        ag.strokeText(s0, w / 2, 70);
        ag.fillStyle = fg;
        ag.fillText(s0, w / 2, 68);
      }
    }
    ag.restore();
    return [x / 1024, 1 - ((row + 1) * 128) / 1024, (x + w) / 1024, 1 - (row * 128) / 1024, wide ? 8 : 4];
  }

  /** A sign standing at (x, y, z) facing yaw, `h` tall (both: a face on its back too; flip: mirrored). */
  sign(f: Face, x: number, y: number, z: number, yaw: number, h: number, both = true, flip = false) {
    const w = h * f[4];
    const rx = Math.cos(yaw),
      rz = -Math.sin(yaw);
    const nx = Math.sin(yaw) * 0.02,
      nz = Math.cos(yaw) * 0.02;
    const put = (sx: number, ox: number, oz: number, u0: number, u1: number) => {
      const a = [x - rx * (w / 2) * sx + ox, y - h / 2, z - rz * (w / 2) * sx + oz];
      const b = [x + rx * (w / 2) * sx + ox, y - h / 2, z + rz * (w / 2) * sx + oz];
      const c = [b[0], y + h / 2, b[2]];
      const d = [a[0], y + h / 2, a[2]];
      this.signs.quad(a, b, c, d, u0, f[1], u1, f[3]);
    };
    put(1, nx, nz, flip ? f[2] : f[0], flip ? f[0] : f[2]);
    if (both) put(-1, -nx, -nz, flip ? f[2] : f[0], flip ? f[0] : f[2]);
  }

  /** A glow round a light: a soft halo, small (2.5 m) or big (9 m). */
  glow(x: number, y: number, z: number, color: THREE.ColorRepresentation, big = false) {
    col1.set(color);
    (big ? this.glowB : this.glowS).push(x, y, z, col1.r, col1.g, col1.b);
  }

  /** A beacon that blinks on a mast or a roof (all of them in one draw, on one slow pulse). */
  blink(x: number, y: number, z: number, color: THREE.ColorRepresentation) {
    col1.set(color);
    this.blinks.push(x, y, z, col1.r, col1.g, col1.b);
  }

  /** A flock wheeling round (cx, cz) at about `y`: `n` birds, each two flat wings that beat (one draw). */
  birds(cx: number, cz: number, y: number, r: number, n = 9, color = "#ffffff", span = 2.2) {
    const R = rng(0xb1d5 + n * 7 + Math.round(cx));
    const im = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color }), n * 2);
    im.frustumCulled = false;
    im.userData.noShadow = true;
    im.raycast = () => {};
    const ph = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) ((ph[i * 3] = R() * Math.PI * 2), (ph[i * 3 + 1] = 0.55 + R() * 0.6), (ph[i * 3 + 2] = R() * Math.PI * 2));
    this.s.add(im);
    const m4 = new THREE.Matrix4();
    this.anims.push((t) => {
      for (let i = 0; i < n; i++) {
        const k = ph[i * 3 + 1];
        const a = ph[i * 3] + (t * 0.16) / k;
        const x = cx + Math.cos(a) * r * k,
          z = cz + Math.sin(a) * r * k * 0.7;
        const yy = y + Math.sin(t * 0.4 + ph[i * 3 + 2]) * 2.5 + i * 0.7;
        // (it flies along its oval; the wings hinge on the body and beat, with a glide now and then)
        const beat = Math.sin(t * 0.7 + ph[i * 3 + 2]) > 0.55 ? 0.12 : Math.sin(t * 8 + ph[i * 3 + 2]) * 0.65;
        q1.setFromAxisAngle(UPV, Math.atan2(-Math.sin(a), Math.cos(a) * 0.7));
        for (let e = 0; e < 2; e++) {
          const sgn = e ? 1 : -1;
          q2.setFromAxisAngle(ZV, sgn * beat).premultiply(q1);
          v2.set(sgn * span * 0.5, 0, 0).applyQuaternion(q2);
          im.setMatrixAt(i * 2 + e, m4.compose(v1.set(x + v2.x, yy + v2.y, z + v2.z), q2, sc1.set(span, 0.1, span * 0.42)));
        }
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }

  /**
   * Boats on a slow oval over the water round (cx, cz): `n` of one shape (`build` makes it, its bow
   * toward +z), each its own place on the loop; they roll a little on the swell.
   */
  boats(n: number, cx: number, cz: number, rx: number, rz: number, y: number, build: (m: Merge, lit: Merge) => void, speed = 0.03) {
    const hull = new Merge(),
      lamp = new Merge();
    build(hull, lamp);
    const g = hull.build();
    const gl = lamp.empty ? null : lamp.build();
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonSteps() });
    const matL = new THREE.MeshBasicMaterial({ vertexColors: true });
    const list: THREE.Group[] = [];
    for (let i = 0; i < n; i++) {
      const o = new THREE.Group();
      o.add(new THREE.Mesh(g, mat));
      if (gl) o.add(new THREE.Mesh(gl, matL));
      this.s.add(o);
      list.push(o);
    }
    this.anims.push((t) => {
      for (let i = 0; i < n; i++) {
        // (every other one sails the loop the other way, further in)
        const dir = i % 2 ? -1 : 1;
        const k = 1 - (i % 3) * 0.22;
        const a = (i / n) * Math.PI * 2 + t * speed * dir;
        const o = list[i];
        o.position.set(cx + Math.cos(a) * rx * k, y + Math.sin(t * 1.3 + i) * 0.06, cz + Math.sin(a) * rz * k);
        o.rotation.set(Math.sin(t * 1.1 + i * 2) * 0.03, Math.atan2(-Math.sin(a) * rx * dir, Math.cos(a) * rz * dir), Math.sin(t * 0.9 + i) * 0.05);
      }
    });
  }

  /** Steam rising from chimneys and vents (x, y, z each): soft white puffs that swell, drift and thin out (one draw). */
  steam(at: [number, number, number][], color = "#f4f6ff", per = 6, rise = 9) {
    const n = at.length * per;
    const im = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }), n);
    im.frustumCulled = false;
    im.userData.noShadow = true;
    im.raycast = () => {};
    this.s.add(im);
    const m4 = new THREE.Matrix4();
    this.anims.push((t) => {
      for (let i = 0; i < n; i++) {
        const p = at[(i / per) | 0];
        // (each puff's life runs 0 → 1 and starts again, the puffs of one chimney staggered)
        const k = (t * 0.16 + (i % per) / per + ((i / per) | 0) * 0.37) % 1;
        const s = (0.9 + k * 2.6) * (k > 0.8 ? (1 - k) * 5 : 1);
        q1.setFromAxisAngle(UPV, i + k * 2);
        im.setMatrixAt(i, m4.compose(v1.set(p[0] + k * k * 5, p[1] + k * rise, p[2] + Math.sin(i * 1.7 + k * 3) * 0.5), q1, sc1.set(s, s * 0.8, s)));
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }

  /** Searchlights sweeping the sky from (x, y, z): long thin cones of light (one draw each). */
  beams(at: [number, number, number][], colors: string[], len = 120) {
    const geo = new THREE.CylinderGeometry(len * 0.022, 0.2, len, 8, 1, true);
    geo.translate(0, len / 2, 0);
    at.forEach((p, i) => {
      const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p[0], p[1], p[2]);
      m.userData.noShadow = true;
      m.raycast = () => {};
      m.renderOrder = 4;
      this.s.add(m);
      this.anims.push((t) => {
        m.rotation.set(0.5 + Math.sin(t * 0.21 + i * 1.9) * 0.28, i * 1.3 + Math.sin(t * 0.13 + i) * 0.9, Math.sin(t * 0.17 + i * 2.3) * 0.3);
      });
    });
  }

  /** A pool of light on the ground (w × l metres, along yaw), or a wet road's long reflection. */
  pool(x: number, y: number, z: number, yaw: number, w: number, l: number, color: THREE.ColorRepresentation) {
    col1.set(color);
    this.pools.push(x, y, z, yaw, w, l, col1.r, col1.g, col1.b);
  }

  /** Stands by the road at sample i, on `side`, with a crowd that jumps; their sign facing the road. */
  stand(i: number, side: number, len: number, rows: number, words: Face, colors = ["#474b78", "#5a5f8f", "#ff6b35"]) {
    const tr = this.tr,
      R = this.R;
    const y0 = tr.ty[i];
    const e = tr.edge[i];
    const base = tr.at(i, side * (e + 3.5), 0);
    const cx = base.x,
      cz = base.z;
    const gy = tr.py[i];
    const out = (lx: number, lz: number) => [cx - tr.tz[i] * side * lx + tr.tx[i] * lz, cz + tr.tx[i] * side * lx + tr.tz[i] * lz];
    for (let r = 0; r < rows; r++) {
      const [x, z] = out(r * 1.6 + 0.8, 0);
      this.inked(r % 2 ? colors[1] : colors[0], 1.6, 0.8 + r * 1.1, len, x, gy + (0.8 + r * 1.1) / 2, z, y0, 0.04);
    }
    const [rx, rz] = out(rows * 0.8, 0);
    this.inked(colors[2], rows * 1.6 + 2, 0.4, len + 1, rx, gy + rows * 1.1 + 3.6, rz, y0, 0.05);
    for (const e2 of [-1, 1]) {
      const [px, pz] = out(rows * 1.6 + 0.2, e2 * (len / 2 - 0.4));
      this.plain.box("#2b2f4a", 0.4, rows * 1.1 + 3.6, 0.4, px, gy + (rows * 1.1 + 3.6) / 2, pz, y0);
      const [fx, fz] = out(0.2, e2 * (len / 2 - 0.4));
      this.plain.box("#2b2f4a", 0.3, rows * 1.1 + 3.6, 0.3, fx, gy + (rows * 1.1 + 3.6) / 2, fz, y0);
    }
    const [sx, sz] = out(-0.4, 0);
    this.sign(words, sx, gy + rows * 1.1 + 2.6, sz, y0 + (side * Math.PI) / 2, 1.5, false);
    if (this.th.night)
      for (let k = -2; k <= 2; k++) {
        const [lx, lz] = out(rows * 0.8, (k * len) / 5);
        this.lit.box("#fff2c4", 0.5, 0.18, 0.5, lx, gy + rows * 1.1 + 3.35, lz);
        this.glow(lx, gy + rows * 1.1 + 3.2, lz, "#ffe9b0");
      }
    // the crowd: a block of colours that jumps
    const per = Math.floor(len / 1.2);
    const crowd = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonSteps() }), rows * per * 2);
    const pal = ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#ffd23f", "#ffffff", "#a98bff", "#ffb27a"];
    const skin = ["#f2c9a0", "#c98a5a", "#8a5a33", "#ffe0c4"];
    let c = 0;
    const m4 = new THREE.Matrix4();
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < per; k++) {
        if (R() < 0.12) continue;
        const [x, z] = out(r * 1.6 + 0.8 + (R() - 0.5) * 0.4, -len / 2 + 0.6 + k * 1.2 + (R() - 0.5) * 0.3);
        const y = gy + 0.8 + r * 1.1;
        crowd.setMatrixAt(c, m4.compose(v1.set(x, y + 0.45, z), q1.setFromAxisAngle(UPV, y0), sc1.set(0.7, 0.9, 0.6)));
        crowd.setColorAt(c++, col1.set(pal[Math.floor(R() * pal.length)]));
        crowd.setMatrixAt(c, m4.compose(v1.set(x, y + 1.15, z), q1, sc1.set(0.5, 0.5, 0.5)));
        crowd.setColorAt(c++, col1.set(skin[Math.floor(R() * skin.length)]));
      }
    crowd.count = c;
    const cg = new THREE.Group();
    cg.add(crowd);
    this.s.add(cg);
    this.crowds.push(cg);
    for (const s2 of [-1, 1]) this.busy.push({ ...xzr(tr.at(i, s2 * (tr.edge[i] + 9)), Math.max(14, len / 2 + 4)) });
  }

  /** An arch over the road at sample i: two posts, a banner with its words both ways. */
  arch(i: number, f: Face, c: string, glow = false) {
    const tr = this.tr;
    const y0 = tr.ty[i],
      e = tr.edge[i];
    for (const side of [-1, 1]) {
      tr.at(i, side * (e + 0.4), 0, v1);
      this.inked(c, 0.8, 7, 0.8, v1.x, tr.py[i] + 3.5, v1.z, y0, 0.05);
    }
    tr.at(i, 0, 0, v1);
    this.inked(glow ? "#1d1838" : "#ffffff", e * 2 + 1.4, 1.5, 0.5, v1.x, tr.py[i] + 6.8, v1.z, y0, 0.05);
    this.sign(f, v1.x - tr.tx[i] * 0.27, tr.py[i] + 6.8, v1.z - tr.tz[i] * 0.27, y0 + Math.PI, 1.25, false);
    this.sign(f, v1.x + tr.tx[i] * 0.27, tr.py[i] + 6.8, v1.z + tr.tz[i] * 0.27, y0, 1.25, false);
    if (glow)
      for (const side of [-1, 1]) {
        tr.at(i, side * (e + 0.4), 0, v1);
        this.lit.box(c, 0.9, 0.2, 0.9, v1.x, tr.py[i] + 7.1, v1.z, y0);
        this.glow(v1.x, tr.py[i] + 7.2, v1.z, c, true);
      }
  }

  /** A flat arrow painted on the road. */
  arrow(m: Merge, x: number, y: number, z: number, yaw: number, s: number, c: string) {
    const fx = Math.sin(yaw),
      fz = Math.cos(yaw);
    m.box(c, s * 0.34, 0.02, s * 0.6, x - fx * s * 0.2, y, z - fz * s * 0.2, yaw);
    for (const e of [-1, 1]) m.box(c, s * 0.22, 0.02, s * 0.62, x + fx * s * 0.25 + -fz * e * s * 0.18, y, z + fz * s * 0.25 + fx * e * s * 0.18, yaw - e * 0.75);
  }

  /** Chevron boards round the tight bends between control points, tyre stacks on their outside. */
  chevrons(ranges: [number, number][], chev: Face, tyres = ["#1d1d2a", "#ffffff"]) {
    const tr = this.tr;
    for (const [c0, c1] of ranges) {
      const a = tr.ci[(c0 + tr.ci.length) % tr.ci.length],
        b = tr.ci[c1 % tr.ci.length];
      for (let i = a; i !== b; i = (i + 1) % tr.n) {
        if ((i - a + tr.n) % (10 / STEP)) continue;
        const bd = tr.bend(i, 12);
        const outSide = bd > 0 ? 1 : -1;
        if (Math.abs(bd) < 0.18 || tr.gap[i] || tr.tunnel[i]) continue;
        if (tr.short && outSide === tr.short.side && tr.openS[i]) continue;
        tr.at(i, outSide * (tr.edge[i] + 1.1), 0, v1);
        this.plain.box("#2b2f4a", 0.16, 1.6, 0.16, v1.x, v1.y + 0.8, v1.z, tr.ty[i]);
        this.sign(chev, v1.x, v1.y + 1.9, v1.z, tr.ty[i] + Math.PI, 0.75, true, bd < 0);
        for (let t = 0; t < 3; t++) {
          tr.at(i + 4 / STEP, outSide * (tr.edge[i] + 0.9 + (t % 2) * 0.9), 0, v1);
          for (let hgt = 0; hgt < 3; hgt++) this.cyl(this.plain, tyres[hgt % 2], 0.45, 0.34, v1.x, v1.y + 0.17 + hgt * 0.34, v1.z);
        }
      }
    }
  }

  /** Cones on the kerbs here and there. */
  cones(color = "#ff8a1a", chance = 0.5) {
    const tr = this.tr,
      R = this.R;
    for (let i = 0; i < tr.n; i += 9 / STEP) {
      if (!tr.kerb[i] || tr.gap[i] || tr.tunnel[i] || tr.py[i] > 0.5) continue;
      for (const side of [-1, 1]) {
        if (tr.short && side === tr.short.side && tr.openS[i]) continue;
        if (R() < chance) continue;
        tr.at(i, side * (tr.half + 1.9), 0, v1);
        this.plain.add(GEO.cone, mm.compose(v1.setY(0.4), q1.identity(), ms.set(0.6, 0.8, 0.6)), color);
        this.plain.box("#ffffff", 0.36, 0.12, 0.36, v1.x, 0.45, v1.z, R() * 3);
      }
    }
  }

  /** Lamp posts at the barriers every `every` m: arms over the kerb, heads that light the road. */
  lamps(every = 15, o: { post?: string; head?: string; glow?: string; pool?: string; double?: boolean; h?: number } = {}) {
    const tr = this.tr;
    const night = this.th.night;
    const h = o.h ?? 6.2;
    for (let i = 0; i < tr.n; i += every / STEP) {
      if (tr.gap[i] || tr.tunnel[i] || tr.span[i]) continue;
      for (const side of [-1, 1]) {
        if (tr.short && side === tr.short.side && tr.openS[i]) continue;
        if (!o.double && night && ((i / (every / STEP)) & 1) !== (side > 0 ? 1 : 0)) continue;
        const e = tr.edge[i];
        tr.at(i, side * (e + 0.6), 0, v1);
        const y = tr.py[i];
        this.plain.box(o.post ?? "#2b2f4a", 0.24, h, 0.24, v1.x, y + h / 2, v1.z, tr.ty[i]);
        tr.at(i, side * (e - 0.4), 0, v2);
        this.plain.box(o.post ?? "#2b2f4a", 2.2, 0.18, 0.22, v2.x, y + h - 0.05, v2.z, tr.ty[i]);
        tr.at(i, side * (e - 1.3), 0, v2);
        this.lit.box(o.head ?? "#fff2c4", 0.7, 0.16, 0.46, v2.x, y + h - 0.2, v2.z, tr.ty[i]);
        if (night) {
          this.glow(v2.x, y + h - 0.35, v2.z, o.glow ?? "#ffd89a");
          this.pool(v2.x, y + 0.07, v2.z, tr.ty[i], 7, 9, o.pool ?? "#ffcf8a");
        }
      }
    }
  }

  /** Flags on poles down the straights (they whip past), fluttering on the wind (the poles merged, the cloths one instanced draw). */
  flags(every = 7.5, colors = ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#ffd23f"], pole = "#ece6f4") {
    const tr = this.tr;
    // (each cloth: where its pole stands, the road's heading there)
    const at: number[] = [];
    const cols: string[] = [];
    for (let i = 0; i < tr.n; i += every / STEP) {
      if (tr.kerb[i] || tr.gap[i] || tr.tunnel[i] || tr.py[i] > 0.5 || i % (15 / STEP) === 0) continue;
      for (const side of [-1, 1]) {
        if (tr.short && side === tr.short.side && tr.openS[i]) continue;
        tr.at(i, side * (tr.edge[i] + 0.9), 0, v1);
        this.plain.box(pole, 0.12, 4.4, 0.12, v1.x, 2.2, v1.z, tr.ty[i]);
        at.push(v1.x, v1.z, tr.ty[i]);
        cols.push(colors[(i / 15) % colors.length | 0]);
      }
    }
    const n = cols.length;
    if (!n) return;
    const im = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonSteps() }), n);
    for (let k = 0; k < n; k++) im.setColorAt(k, col1.set(cols[k]));
    im.frustumCulled = false;
    im.raycast = () => {};
    this.s.add(im);
    const m4 = new THREE.Matrix4();
    this.anims.push((t) => {
      for (let k = 0; k < n; k++) {
        // (the cloth swings on its pole, each a little out of step with its neighbour)
        const yaw = at[k * 3 + 2] + Math.sin(t * 5.2 + k * 1.7) * 0.3 + Math.sin(t * 2.3 + k) * 0.16;
        q1.setFromAxisAngle(UPV, yaw);
        im.setMatrixAt(k, m4.compose(v1.set(at[k * 3] + Math.sin(yaw) * 0.8, 3.7, at[k * 3 + 1] + Math.cos(yaw) * 0.8), q1, sc1.set(0.06, 1.1, 1.6)));
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }

  /** A billboard on the outside of the bend at each control point, facing the road. */
  boards(cps: number[], faces: Face[], post = "#2b2f4a") {
    const tr = this.tr;
    let bn = 0;
    for (const c of cps) {
      const i = tr.ci[c % tr.ci.length];
      const b = tr.bend(i, 20);
      const side = b > 0 ? 1 : -1;
      const e = tr.edge[i];
      tr.at(i, side * (e + 4.5), 0, v1);
      if (this.isBusy(v1.x, v1.z, 3)) continue;
      const y0 = tr.ty[i] + (side * Math.PI) / 2;
      for (const l of [-1, 1]) {
        const lx = v1.x + Math.cos(y0) * l * 3.6,
          lz = v1.z - Math.sin(y0) * l * 3.6;
        this.plain.box(post, 0.35, 5, 0.35, lx, v1.y + 2.5, lz, y0);
      }
      this.plain.box(post, 9.4, 2.6, 0.3, v1.x, v1.y + 5.6, v1.z, y0);
      this.ink.box(INK, 9.56, 2.76, 0.46, v1.x, v1.y + 5.6, v1.z, y0);
      this.sign(faces[bn++ % faces.length], v1.x + Math.sin(y0) * 0.17, v1.y + 5.6, v1.z + Math.cos(y0) * 0.17, y0, 2.25, false);
      if (this.th.night) this.glow(v1.x + Math.sin(y0) * 1.5, v1.y + 7.4, v1.z + Math.cos(y0) * 1.5, "#ffffff");
    }
  }

  isBusy(x: number, z: number, r: number) {
    return this.busy.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + r);
  }

  /** Keep the city clear of a stretch of road (a landmark beside it). */
  clear(x: number, z: number, r: number) {
    this.busy.push({ x, z, r });
  }

  /**
   * Blocks along the road every `every` samples: close by in town, further out in the open. `pal`
   * their colours, `roof` their roofs' colours; `deco` adds to each (its frame: x, z, w, d, h, yaw, town).
   */
  buildings(o: { every?: number; pal: string[]; roof: string[]; town?: [number, number]; open?: [number, number]; skipOpen?: number; keep?: (x: number, z: number, r: number) => boolean; deco?: (x: number, z: number, w: number, d: number, h: number, yaw: number, town: boolean, side: number, i: number) => void }) {
    const tr = this.tr,
      R = this.R;
    const [th0, th1] = o.town ?? [12, 34];
    const [oh0, oh1] = o.open ?? [8, 22];
    for (let i = 0; i < tr.n; i += o.every ?? 14) {
      for (const side of [-1, 1]) {
        const town = tr.zone[i] === 1;
        if (!town && R() < (o.skipOpen ?? 0.55)) continue;
        const w = 8 + R() * 7,
          d = 8 + R() * 7,
          h = (town ? th0 : oh0) + R() * R() * (town ? th1 : oh1);
        const off = side * (tr.edge[i] + (town ? 3 : 8) + R() * (town ? 2 : 10) + Math.max(w, d) / 2);
        const p = tr.at(i, off);
        const r = Math.hypot(w, d) / 2;
        if (tr.clearance(p.x, p.z) < tr.edge[i] + 2.2 + r * 0.72) continue;
        if (this.isBusy(p.x, p.z, r)) continue;
        if (o.keep && !o.keep(p.x, p.z, r)) continue;
        if (this.placed.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < (q.r + r) * 0.8)) continue;
        this.placed.push({ x: p.x, z: p.z, r });
        const c = o.pal[Math.floor(R() * o.pal.length)];
        this.wins.box(c, w, h, d, p.x, h / 2, p.z, tr.ty[i], 0, 0, [Math.max(w, d) / 9, h / 13, 0, 0]);
        this.plain.box(o.roof[Math.floor(R() * o.roof.length)], w + 0.6, 0.6, d + 0.6, p.x, h + 0.3, p.z, tr.ty[i]);
        o.deco?.(p.x, p.z, w, d, h, tr.ty[i], town, side, i);
      }
    }
  }

  /**
   * The town beyond the circuit: blocks of buildings on a street grid (`pitch` m) over a box, kept
   * `near` m from the road and off what is busy; their streets drawn as darker strips.
   */
  blocks(o: { box: [number, number, number, number]; pitch: number; near: number; pal: string[]; roof: string[]; h: [number, number]; street: string; keep?: (x: number, z: number, r: number) => boolean; deco?: (x: number, z: number, w: number, d: number, h: number) => void }) {
    const tr = this.tr,
      R = this.R;
    const [x0, x1, z0, z1] = o.box;
    for (let x = x0; x <= x1; x += o.pitch)
      for (let z = z0; z <= z1; z += o.pitch) {
        const c = tr.clearance(x, z);
        if (c < o.near) continue;
        // (the street round the block: one strip along x, one along z; never out over the water or a landmark's ground)
        if (c > o.near + 10) {
          const h = o.pitch / 2;
          const dry = (sx: number, sz: number) => !o.keep || o.keep(sx, sz, 3);
          if (dry(x - h, z + h) && dry(x, z + h) && dry(x + h, z + h)) this.plain.box(o.street, o.pitch, 0.04, 5, x, -0.06, z + h);
          if (dry(x + h, z - h) && dry(x + h, z) && dry(x + h, z + h)) this.plain.box(o.street, 5, 0.04, o.pitch, x + h, -0.06, z);
        }
        const n = R() < 0.4 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const w = (o.pitch - 9) * (n > 1 ? 0.48 : 0.8) * (0.75 + R() * 0.25),
            d = (o.pitch - 9) * (0.6 + R() * 0.35);
          const bx = x + (n > 1 ? (k ? 1 : -1) * (o.pitch - 9) * 0.25 : (R() - 0.5) * 3),
            bz = z + (R() - 0.5) * 3;
          const r = Math.hypot(w, d) / 2;
          if (tr.clearance(bx, bz) < o.near - 4 + r * 0.5) continue;
          if (this.isBusy(bx, bz, r)) continue;
          if (o.keep && !o.keep(bx, bz, r)) continue;
          if (this.placed.some((q) => Math.hypot(q.x - bx, q.z - bz) < (q.r + r) * 0.7)) continue;
          const h = o.h[0] + R() * R() * (o.h[1] - o.h[0]);
          this.placed.push({ x: bx, z: bz, r });
          this.wins.box(o.pal[Math.floor(R() * o.pal.length)], w, h, d, bx, h / 2, bz, 0, 0, 0, [Math.max(w, d) / 9, h / 13, 0, 0]);
          this.plain.box(o.roof[Math.floor(R() * o.roof.length)], w + 0.5, 0.5, d + 0.5, bx, h + 0.25, bz);
          o.deco?.(bx, bz, w, d, h);
        }
      }
  }

  /** Trees in the open ground between `x0..x1`, `z0..z1`, at least `near` m from the road. */
  trees(n: number, box: [number, number, number, number], kind: (x: number, z: number, s: number) => void, near = 15.5, keep?: (x: number, z: number) => boolean) {
    const tr = this.tr,
      R = this.R;
    let tn = 0;
    for (let tries = 0; tn < n && tries < n * 40; tries++) {
      const x = box[0] + R() * (box[1] - box[0]),
        z = box[2] + R() * (box[3] - box[2]);
      const c = tr.clearance(x, z);
      if (c < near) continue;
      if (c > 45 && R() < 0.6) continue;
      if (this.isBusy(x, z, 2)) continue;
      if (keep && !keep(x, z)) continue;
      if (this.placed.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 2.5)) continue;
      kind(x, z, 0.8 + R() * 0.8);
      tn++;
    }
  }

  /** A leafy voxel tree. */
  leafy(x: number, z: number, sz: number, greens = ["#3fae4a", "#48b850", "#62cc5c"], trunk = "#8a5a33") {
    const R = this.R;
    this.plain.box(trunk, 0.7 * sz, 2.4 * sz, 0.7 * sz, x, 1.2 * sz, z);
    const yaw = R() * Math.PI;
    this.plain.box(R() < 0.5 ? greens[0] : greens[1], 3 * sz, 2.4 * sz, 3 * sz, x, 3.4 * sz, z, yaw);
    this.plain.box(greens[2], 1.9 * sz, 1.4 * sz, 1.9 * sz, x, 5 * sz, z, yaw);
  }

  /**
   * A big wheel at (x, z) facing `yaw` (its rim turns round the axis across it), radius r, its cabins
   * in an instanced draw; lit at night (rim lights and glows).
   */
  wheel(x: number, z: number, yaw: number, r: number, c: { rim: string[]; leg: string; base: string; cabins: string[]; lights?: string }, speed = 0.12) {
    const hub = r + 4;
    for (const e of [-1, 1]) {
      const [ax, az] = this.local(x, z, yaw, e * 2.2, 0);
      for (const l of [-1, 1]) {
        const [bx, bz] = this.local(x, z, yaw, e * 2.2, l * 6);
        this.plain.box(c.leg, 0.7, hub * 1.08, 0.7, (ax + bx) / 2, hub / 2, (az + bz) / 2, yaw, -l * 0.27);
      }
    }
    this.inked(c.base, 6, 0.8, 16, x, 0.4, z, yaw, 0.05);
    const g = new THREE.Group();
    g.position.set(x, hub, z);
    g.rotation.y = yaw;
    const rim = new Merge();
    const rimLit = new Merge();
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const seg = (2 * Math.PI * r) / 24 + 0.4;
      for (const e of [-1, 1]) rim.box(c.rim[k % c.rim.length], 0.5, 0.5, seg, e * 1.6, Math.cos(a) * r, Math.sin(a) * r, 0, a);
      if (k % 2 === 0) for (const e of [-1, 1]) rim.box(c.leg, 0.25, r, 0.25, e * 1.6, Math.cos(a) * (r / 2), Math.sin(a) * (r / 2), 0, a);
      if (c.lights) for (const e of [-1, 1]) rimLit.box(c.lights, 0.3, 0.3, 0.3, e * 1.9, Math.cos(a) * r, Math.sin(a) * r, 0, a);
    }
    rim.box("#ffd23f", 4.4, 2, 2, 0, 0, 0);
    const spinG = new THREE.Group();
    spinG.add(new THREE.Mesh(rim.build(), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonSteps() })));
    if (c.lights) spinG.add(new THREE.Mesh(rimLit.build(), new THREE.MeshBasicMaterial({ vertexColors: true })));
    g.add(spinG);
    const cabins = new THREE.InstancedMesh(GEO.box, c.lights ? new THREE.MeshBasicMaterial({ color: "#ffffff" }) : new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonSteps() }), 12);
    for (let k = 0; k < 12; k++) cabins.setColorAt(k, col1.set(c.cabins[k % c.cabins.length]));
    g.add(cabins);
    this.s.add(g);
    if (this.th.night && c.lights) this.glow(x, hub, z, c.lights, true);
    const m4 = new THREE.Matrix4();
    this.anims.push((t) => {
      const a = t * speed;
      spinG.rotation.x = a;
      for (let k = 0; k < 12; k++) {
        const b = a + (k / 12) * Math.PI * 2;
        cabins.setMatrixAt(k, m4.compose(v1.set(0, Math.cos(b) * r - 1.4, Math.sin(b) * r), q1.identity(), sc1.set(2.6, 2.2, 2.2)));
      }
      cabins.instanceMatrix.needsUpdate = true;
    });
    this.clear(x, z, r + 4);
  }

  /** The ring of far-off towers. */
  skyline() {
    const th = this.th,
      R = this.R;
    const sk = th.skyline;
    const tex = canvasTex(
      64,
      128,
      (g) => {
        g.fillStyle = "#fff";
        g.fillRect(0, 0, 64, 128);
        for (let y = 6; y < 128; y += 12)
          for (let x = 5; x < 64; x += 12) {
            const lit = Math.random() < th.windows.lit;
            g.fillStyle = lit ? th.windows.on : th.windows.off;
            g.fillRect(x, y, 7, 7);
          }
      },
      true,
    );
    const em = th.night
      ? canvasTex(64, 128, (g) => {
          g.fillStyle = "#000";
          g.fillRect(0, 0, 64, 128);
          for (let y = 6; y < 128; y += 12)
            for (let x = 5; x < 64; x += 12)
              if (Math.random() < th.windows.lit) {
                g.fillStyle = th.windows.on;
                g.fillRect(x, y, 7, 7);
              }
        }, true)
      : null;
    const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps(), emissive: em ? 0xffffff : 0x000000, emissiveMap: em });
    const mesh = new THREE.InstancedMesh(GEO.box, mat, sk.n);
    const bx = this.tr.bounds;
    const cx = (bx.x0 + bx.x1) / 2,
      cz = (bx.z0 + bx.z1) / 2;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < sk.n; i++) {
      const a = (i / sk.n) * Math.PI * 2 + R() * 0.05;
      const d = sk.r * (0.92 + R() * 0.25);
      const w = 7 + R() * 9;
      const h = (8 + R() * R() * 70) * sk.tall;
      q1.setFromAxisAngle(UPV, -a);
      m4.compose(v1.set(cx + Math.cos(a) * d * 1.25, h / 2, cz + Math.sin(a) * d * 0.8), q1, sc1.set(w, h, w));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col1.set(sk.pal[i % sk.pal.length]));
    }
    this.s.add(mesh);
  }

  /** Puffy clouds high up (one draw). */
  clouds() {
    const th = this.th,
      R = this.R;
    if (!th.clouds) return;
    const cn = th.clouds * 4;
    const cm = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: th.cloudColor, fog: false }), cn);
    const m4 = new THREE.Matrix4();
    let c = 0;
    for (let k = 0; k < th.clouds; k++) {
      const a = R() * Math.PI * 2,
        d = 160 + R() * 200;
      const x = Math.cos(a) * d,
        z = Math.sin(a) * d,
        y = 70 + R() * 40;
      const yaw = R() * Math.PI;
      for (let p = 0; p < 4; p++) {
        const [lx, lz] = this.local(x, z, yaw, (p - 1.5) * 6, R() * 4);
        cm.setMatrixAt(c++, m4.compose(v1.set(lx, y + R() * 2.5, lz), q1.setFromAxisAngle(UPV, yaw), sc1.set(9 + R() * 8, 3 + R() * 2.5, 7 + R() * 5)));
      }
    }
    cm.userData.noShadow = true;
    this.cloudMesh = cm;
    this.s.add(cm);
  }

  /** Into the scene: the merged meshes, the glows, the pools of light. */
  finish() {
    const s = this.s,
      th = this.th;
    const vc = <M extends THREE.Material>(m: M) => (((m as unknown as THREE.MeshToonMaterial).vertexColors = true), m);
    if (!this.plain.empty) s.add(new THREE.Mesh(this.plain.build(), vc(new THREE.MeshToonMaterial({ gradientMap: toonSteps() }))));
    if (!this.lit.empty) s.add(new THREE.Mesh(this.lit.build(), vc(new THREE.MeshBasicMaterial())));
    if (!this.ink.empty) s.add(new THREE.Mesh(this.ink.build(), new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })));
    if (!this.wins.empty) {
      // the facades: four windows across, eight up, each with its frame and sill; which are lit is drawn
      // once, for the paint and for the night's glow (the same panes)
      const WR = rng(0x3d1e);
      const lit: boolean[] = [];
      for (let k = 0; k < 32; k++) lit.push(WR() < th.windows.lit);
      const paint = (g: CanvasRenderingContext2D, glow: boolean) => {
        g.fillStyle = glow ? "#000000" : "#ffffff";
        g.fillRect(0, 0, 256, 512);
        for (let r = 0; r < 8; r++)
          for (let c = 0; c < 4; c++) {
            const x = 16 + c * 64,
              y = 16 + r * 64;
            const on = lit[r * 4 + c];
            if (glow) {
              if (on) ((g.fillStyle = th.windows.on), g.fillRect(x, y, 32, 36));
              continue;
            }
            // (the frame a shade under the wall, the pane, its sill; by day a pane catches the sky)
            g.fillStyle = "rgba(20,16,40,0.2)";
            g.fillRect(x - 4, y - 4, 40, 46);
            g.fillStyle = on ? th.windows.on : th.windows.off;
            g.fillRect(x, y, 32, 36);
            if (!on && !th.night) ((g.fillStyle = "rgba(255,255,255,0.22)"), g.fillRect(x, y, 32, 10), g.fillRect(x, y + 10, 12, 8));
            g.fillStyle = "rgba(20,16,40,0.28)";
            g.fillRect(x + 15, y, 2, 36);
            g.fillStyle = "rgba(255,255,255,0.55)";
            g.fillRect(x - 6, y + 38, 44, 4);
          }
        // (a string course every four storeys)
        if (!glow) ((g.fillStyle = "rgba(20,16,40,0.1)"), g.fillRect(0, 0, 256, 5), g.fillRect(0, 256, 256, 5));
      };
      const winTex = canvasTex(256, 512, (g) => paint(g, false), true);
      winTex.anisotropy = 8;
      const em = th.night ? canvasTex(128, 256, (g) => (g.scale(0.5, 0.5), paint(g, true)), true) : null;
      s.add(new THREE.Mesh(this.wins.build(), vc(new THREE.MeshToonMaterial({ map: winTex, gradientMap: toonSteps(), emissive: em ? 0xffffff : 0x000000, emissiveMap: em }))));
    }
    if (!this.signs.empty) {
      const atlasTex = new THREE.CanvasTexture(this.atlas);
      atlasTex.colorSpace = THREE.SRGBColorSpace;
      atlasTex.anisotropy = 4;
      s.add(new THREE.Mesh(this.signs.build(), new THREE.MeshBasicMaterial({ map: atlasTex, alphaTest: 0.5, side: THREE.FrontSide })));
    }
    for (const [list, size] of [
      [this.glowS, 2.6],
      [this.glowB, 9],
    ] as [number[], number][]) {
      if (!list.length) continue;
      const n = list.length / 6;
      const pos = new Float32Array(n * 3),
        col = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) {
        pos.set(list.slice(k * 6, k * 6 + 3), k * 3);
        col.set(list.slice(k * 6 + 3, k * 6 + 6), k * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map: haloTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.85 }));
      pts.renderOrder = 3;
      pts.userData.glow = true;
      s.add(pts);
    }
    if (this.blinks.length) {
      const n = this.blinks.length / 6;
      const pos = new Float32Array(n * 3),
        col = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) {
        pos.set(this.blinks.slice(k * 6, k * 6 + 3), k * 3);
        col.set(this.blinks.slice(k * 6 + 3, k * 6 + 6), k * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({ size: 3.4, map: haloTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.9 });
      const pts = new THREE.Points(g, mat);
      pts.renderOrder = 3;
      pts.userData.glow = true;
      s.add(pts);
      // (a slow pulse: on for a beat, off for two)
      this.anims.push((t) => {
        mat.opacity = 0.12 + 0.88 * Math.max(0, Math.sin(t * 2.6)) ** 3;
      });
    }
    if (this.pools.length) {
      const n = this.pools.length / 9;
      const im = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: haloTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: th.wet ? 0.5 : 0.32, polygonOffset: true, polygonOffsetFactor: -3 }), n);
      const m4 = new THREE.Matrix4();
      for (let k = 0; k < n; k++) {
        const p = this.pools.slice(k * 9, k * 9 + 9);
        q1.setFromAxisAngle(UPV, p[3]).multiply(q2.setFromAxisAngle(XV, -Math.PI / 2));
        im.setMatrixAt(k, m4.compose(v1.set(p[0], p[1], p[2]), q1, sc1.set(p[4], p[5], 1)));
        im.setColorAt(k, col1.setRGB(p[6], p[7], p[8]));
      }
      im.renderOrder = 1;
      s.add(im);
    }
  }
}

export function xzr(v: THREE.Vector3, r: number) {
  return { x: v.x, z: v.z, r };
}
