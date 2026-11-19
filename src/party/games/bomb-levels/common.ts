/**
 * HOT WALLET's levels: the data a level is made of (its floor's shape, its props, its twist) and the
 * little kit the levels' scenery shares (neon signs, pools of light, clouds and birds; the city far below
 * a roof, its traffic, the haze between). The game itself (bomb.ts) plays any of them.
 */
import * as THREE from "three";
import { FONT, rng } from "../../kit";
import type { SongKey } from "../../music";
import { GEO, canvasTex, glow, toonSteps, type Fx3, type World } from "../../k3";
import type { AmbienceKind } from "../../../audio/kinds";
import type { PostLook } from "../../post";

/** A prop to run round: a box (half sizes), or a round one (`r`, then hx = hz = r). */
export interface Box {
  x: number;
  z: number;
  hx: number;
  hz: number;
  r?: number;
}

/**
 * Two roofs split by a chasm along z (|x| < g): drawbridges cross it (they lift in turn, warned by
 * their lamps), and a spring pad on each lip hops you over.
 */
export interface Gap {
  /** The chasm's half width. */
  g: number;
  /** The drawbridges: their middle (z) and half width along z. */
  bridges: { z: number; hz: number }[];
  /** The spring pads: their z (a pad on each lip, at x = ±padX, `padR` round), and where a hop lands (x = ∓landX). */
  pads: number[];
  padX: number;
  padR: number;
  landX: number;
  /** The lifts: the first at `first` s of play, then one every `every` s (the bridges in turn); each warns `warn` s, then stays up `up` s. */
  first: number;
  every: number;
  warn: number;
  up: number;
}

/** A turntable ring in the floor (r0…r1): it carries you round at `w` rad/s, and flips its way now and then (warned). */
export interface Belt {
  r0: number;
  r1: number;
  w: number;
  /** The first flip, then one every min + rnd × range seconds; each warned `warn` s before (it slows to a stop, then turns the other way). */
  first: number;
  every: [number, number];
  warn: number;
}

/** What the level's scenery reads every frame (the game fills it). */
export interface Live {
  t: number;
  /** The belt's turn now (signed rad/s), and its warning (0…1, blinking before a flip). */
  belt: number;
  beltWarn: number;
  /** Each bridge: how far up (0 down … 1 up), and whether its lamps warn. */
  lift: Float32Array;
  warn: Uint8Array;
  /** Each spring pad (west then east, per pad): its squash (1 just fired … 0). */
  pad: Float32Array;
}

export interface LevelCtx {
  scene: THREE.Scene;
  w: World;
  rnd: () => number;
  fx: Fx3;
}

export interface Scenery {
  /** Animate the level (its lights, its twist's props) from `live`. */
  tick(dt: number, live: Live): void;
}

export interface Level {
  key: string;
  title: string;
  titleZh: string;
  /** Its twist, one line. */
  tag: string;
  tagZh: string;
  song?: SongKey;
  ambience?: AmbienceKind;
  /** The floor: a rectangle (half sizes), or a disc (radius). */
  rect?: [number, number];
  disc?: number;
  obst: Box[];
  gap?: Gap;
  belt?: Belt;
  /** Where the four start. */
  starts: [number, number][];
  /** The open spots a calm AI drifts to (far from the holder). */
  spots: [number, number][];
  /** The play camera: up `y`, back `z` (from the framed point), the framing's pan limits; the card's orbit (radius, height), the card wallet's height (default 2.4). */
  cam: { y: number; z: number; px: number; pz: number; orbit: [number, number]; wy?: number };
  sky: [string, string];
  fog: [number, number];
  /** The stage's finish for it (post.ts multipliers: a snowy noon is held back a little, a night's neon blooms more). */
  look?: PostLook;
  /** Builds the floor, the props and the backdrop (and sets the lights); returns what moves. */
  build(c: LevelCtx): Scenery;
}

/** A neon sign: glowing tubes of `color` on a dark panel (`round`: a disc). */
export function neon(lines: string, color: string, w: number, h: number, size: number, round = false, panel = "#1c1238") {
  const pw = 512;
  const ph = Math.round((512 * h) / w);
  const tex = canvasTex(pw, ph, (g) => {
    g.fillStyle = panel;
    g.beginPath();
    if (round) g.arc(pw / 2, ph / 2, pw / 2 - 6, 0, Math.PI * 2);
    else g.roundRect(4, 4, pw - 8, ph - 8, 24);
    g.fill();
    g.shadowColor = color;
    g.strokeStyle = color;
    g.lineWidth = round ? 14 : 7;
    g.shadowBlur = 18;
    g.beginPath();
    if (round) g.arc(pw / 2, ph / 2, pw / 2 - 40, 0, Math.PI * 2);
    else g.roundRect(18, 18, pw - 36, ph - 36, 16);
    g.stroke();
    g.font = `900 ${size}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.shadowBlur = 28;
    g.fillText(lines, pw / 2, ph / 2 + size * 0.06);
    g.shadowBlur = 10;
    g.fillText(lines, pw / 2, ph / 2 + size * 0.06);
    g.shadowBlur = 0;
    g.globalAlpha = 0.55;
    g.fillStyle = "#ffffff";
    g.fillText(lines, pw / 2, ph / 2 + size * 0.06);
  });
  const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.scale.set(w, h, 1);
  return m;
}

/** A soft round glow (a lamp's pool of light on the floor). */
export function poolTex() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,0.9)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.35)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/**
 * k3's puffy clouds in ONE draw call (an InstancedMesh of blocks): the same shapes from the same
 * draws of `rnd` as k3 `clouds()`, so a level's seeded game stays the same.
 */
export function puffClouds(scene: THREE.Scene, o: { n: number; r: number; y: number; rnd: () => number; color: THREE.ColorRepresentation }) {
  const rnd = o.rnd;
  const parts: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const c = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < o.n; i++) {
    const n = 3 + Math.floor(rnd() * 3);
    const local: THREE.Matrix4[] = [];
    for (let k = 0; k < n; k++) {
      s.set(6 + rnd() * 6, 2.5 + rnd() * 2, 5 + rnd() * 4);
      p.set(k * 4 - n * 2, rnd() * 1.5, rnd() * 3);
      local.push(new THREE.Matrix4().compose(p, q.identity(), s));
    }
    const a = rnd() * Math.PI * 2;
    const d = o.r * (0.5 + rnd() * 0.5);
    p.set(Math.cos(a) * d, o.y + rnd() * 20, Math.sin(a) * d);
    q.setFromAxisAngle(up, rnd() * Math.PI);
    c.compose(p, q, s.set(1, 1, 1));
    for (const l of local) parts.push(m.multiplyMatrices(c, l).clone());
  }
  const mat = new THREE.MeshBasicMaterial({ color: o.color });
  const mesh = new THREE.InstancedMesh(GEO.box, mat, parts.length);
  parts.forEach((x, i) => mesh.setMatrixAt(i, x));
  mesh.raycast = () => {};
  scene.add(mesh);
  return mesh;
}

/** Soft pools of light on a floor (one draw call): at (x, z), `r` round, of a colour. */
export function lightPools(scene: THREE.Scene, pools: [number, number, number, THREE.ColorRepresentation][], y = 0.03, opacity = 0.5) {
  const mat = new THREE.MeshBasicMaterial({ map: poolTex(), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.InstancedMesh(GEO.plane, mat, pools.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  pools.forEach(([x, z, r, col], i) => {
    mesh.setMatrixAt(i, m.compose(p.set(x, y, z), q, s.set(2 * r, 2 * r, 1)));
    mesh.setColorAt(i, c.set(col));
  });
  mesh.renderOrder = 2;
  mesh.raycast = () => {};
  scene.add(mesh);
  return mesh;
}

/** A flock of birds wheeling round a point (one draw call: each bird a pair of flapping wings). */
export class Flock {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  constructor(
    scene: THREE.Scene,
    private n: number,
    private at: THREE.Vector3,
    private r: number,
    color: THREE.ColorRepresentation,
    private size = 1,
  ) {
    this.mesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color }), n);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  tick(t: number) {
    for (let i = 0; i < this.n; i++) {
      const a = t * 0.18 + i * 0.42;
      const rr = this.r * (0.75 + 0.25 * Math.sin(i * 1.7));
      this.p.set(this.at.x + Math.cos(a) * rr, this.at.y + Math.sin(t * 0.7 + i) * 1.2 + (i % 3) * 1.5, this.at.z + Math.sin(a) * rr * 0.5);
      const flap = Math.abs(Math.sin(t * 9 + i * 1.3));
      this.e.set(0, -a, 0);
      this.m.compose(this.p, this.q.setFromEuler(this.e), this.s.set(0.35 * this.size, 0.08 * this.size, (0.4 + 1.1 * flap) * this.size));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---- the city round a roof (what the camera sees past the parapet: nothing here is ever touched) ---

/** The city far below is laid out in lots: this far from street to street (m), the streets this wide. */
export const PITCH = 24;
const STREET = 6;
/** One painted tile of ground: LOTS × LOTS lots. */
const LOTS = 8;

export interface CityLook {
  /** The streets' level. */
  y: number;
  /** Its own seed (never the game's stream: the scenery must not move the sim). */
  seed: number;
  /** The painted ground: the streets, their lane marks, the lots, the low roofs on them, the shade they cast. */
  street: string;
  mark: string;
  lots: string[];
  roofs: string[];
  shade: string;
  /** Parks among the lots (their lawn, their trees), and how many lots are one (0…1). */
  park: [string, string];
  parkK: number;
  /** Street lamps' pools of light (dusk, night); none by day. */
  lamp?: string;
  /** The blocks standing on the lots round the middle: their walls' tints, their roofs' tints, how tall (m), how many lots out, the share of lots left low (0…1). */
  walls: string[];
  tops: string[];
  h: [number, number];
  out: number;
  empty: number;
  /** Their windows: the frame, a pane, a lit pane, the share lit; how much the lit ones glow (0: by day). */
  frame: string;
  pane: string;
  lit: string;
  litK: number;
  glowK?: number;
  /** Which way the painted shade falls on the ground (x, z: away from the sun; the picture's down is +z). */
  sun: [number, number];
  /** Lots to keep clear of blocks (a river, a landmark's foot). */
  clear?: (x: number, z: number) => boolean;
}

/**
 * The city far below a roof, in three draws: the ground painted once (streets, lots, low roofs with
 * their shade, parks, lamps; tiled out into the fog), and the blocks that stand on the lots round the
 * middle (their walls, their roofs), all lower than the roof we play on. The lot at the origin is left
 * to the level's own tower. Nothing here casts or takes the stage's shadows (too far, too many).
 */
export function cityBelow(scene: THREE.Scene, o: CityLook) {
  const rnd = rng(o.seed);
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length) % a.length];
  const S = 1024;
  const k = S / (PITCH * LOTS);
  const tex = canvasTex(
    S,
    S,
    (g) => {
      g.fillStyle = o.street;
      g.fillRect(0, 0, S, S);
      // the lane marks down the middle of every street (the tile's edges are streets' middles)
      g.fillStyle = o.mark;
      for (let i = 0; i <= LOTS; i++)
        for (let d = 0; d < S; d += 22) {
          g.fillRect(i * PITCH * k - 1, d, 2, 12);
          g.fillRect(d, i * PITCH * k - 1, 12, 2);
        }
      const [sx, sz] = o.sun;
      for (let i = 0; i < LOTS; i++)
        for (let j = 0; j < LOTS; j++) {
          const x0 = (i * PITCH + STREET / 2) * k,
            y0 = (j * PITCH + STREET / 2) * k,
            w = (PITCH - STREET) * k;
          // the pavement, then the lot
          g.fillStyle = o.mark;
          g.globalAlpha = 0.35;
          g.fillRect(x0 - 3, y0 - 3, w + 6, w + 6);
          g.globalAlpha = 1;
          if (rnd() < o.parkK) {
            g.fillStyle = o.park[0];
            g.fillRect(x0, y0, w, w);
            g.fillStyle = o.shade;
            g.globalAlpha = 0.25;
            g.fillRect(x0 + w * 0.46, y0, w * 0.08, w);
            g.fillRect(x0, y0 + w * 0.46, w, w * 0.08);
            g.globalAlpha = 1;
            for (let n = 0; n < 9; n++) {
              const tx = x0 + 8 + rnd() * (w - 16),
                ty = y0 + 8 + rnd() * (w - 16),
                r = 4 + rnd() * 4;
              g.fillStyle = o.shade;
              g.globalAlpha = 0.4;
              g.fillRect(tx - r + sx * 5, ty - r + sz * 5, r * 2, r * 2);
              g.globalAlpha = 1;
              g.fillStyle = o.park[1];
              g.fillRect(tx - r, ty - r, r * 2, r * 2);
            }
            continue;
          }
          g.fillStyle = pick(o.lots);
          g.fillRect(x0, y0, w, w);
          // two to four low roofs on it, each with the shade it throws (the picture's own depth)
          const n = 2 + Math.floor(rnd() * 3);
          for (let b = 0; b < n; b++) {
            const bw = w * (0.3 + rnd() * 0.3),
              bh = w * (0.3 + rnd() * 0.3);
            const bx = x0 + 4 + rnd() * (w - bw - 8),
              by = y0 + 4 + rnd() * (w - bh - 8);
            const tall = 4 + rnd() * 9;
            g.fillStyle = o.shade;
            g.globalAlpha = 0.55;
            g.fillRect(bx + sx * tall, by + sz * tall, bw, bh);
            g.globalAlpha = 1;
            const c = pick(o.roofs);
            g.fillStyle = c;
            g.fillRect(bx, by, bw, bh);
            g.fillStyle = "rgba(255,255,255,0.22)";
            g.fillRect(bx, by, bw, 3);
            g.fillRect(bx, by, 3, bh);
            g.fillStyle = "rgba(0,0,0,0.18)";
            g.fillRect(bx + bw * 0.55, by + bh * 0.3, bw * 0.22, bh * 0.22);
          }
        }
      // the lamps: a pool of light every half lot along both kerbs
      if (o.lamp) {
        g.globalCompositeOperation = "lighter";
        for (let i = 0; i <= LOTS; i++)
          for (let d = 0; d < LOTS * 2; d++)
            for (const sd of [-1, 1]) {
              const a = i * PITCH * k + sd * (STREET / 2 - 0.6) * k,
                b = (d + 0.5) * (PITCH / 2) * k;
              for (const [x, y] of [
                [a, b],
                [b, a],
              ]) {
                const gr = g.createRadialGradient(x, y, 0, x, y, 13);
                gr.addColorStop(0, o.lamp);
                gr.addColorStop(1, "rgba(0,0,0,0)");
                g.fillStyle = gr;
                g.fillRect(x - 13, y - 13, 26, 26);
              }
            }
        g.globalCompositeOperation = "source-over";
      }
    },
    true,
  );
  tex.repeat.set(LOTS, LOTS);
  // (the lots' middles on the multiples of PITCH: the level's tower stands on the one at the origin)
  tex.offset.set(0.5 / LOTS, 0.5 / LOTS);
  const ground = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  ground.scale.setScalar(PITCH * LOTS * LOTS);
  ground.position.y = o.y;
  ground.userData.noShadow = true;
  ground.raycast = () => {};
  scene.add(ground);

  // the blocks' windows (one picture, tinted per block), their lit panes (what glows at dusk), their roofs
  const lit: boolean[] = [];
  for (let n = 0; n < 4 * 9; n++) lit.push(rnd() < o.litK);
  const panes = (glowOnly: boolean) =>
    canvasTex(64, 144, (g) => {
      g.fillStyle = glowOnly ? "#000" : o.frame;
      g.fillRect(0, 0, 64, 144);
      for (let y = 0; y < 9; y++)
        for (let x = 0; x < 4; x++) {
          const on = lit[y * 4 + x];
          if (glowOnly && !on) continue;
          g.fillStyle = on ? o.lit : o.pane;
          g.fillRect(x * 16 + 3, y * 16 + 4, 10, 9);
        }
    });
  const glowK = o.glowK ?? 0;
  const wallMat = new THREE.MeshToonMaterial({ map: panes(false), gradientMap: toonSteps(), ...(glowK > 0 ? { emissive: "#ffffff", emissiveMap: panes(true), emissiveIntensity: glowK } : {}) });
  const roofMat = new THREE.MeshToonMaterial({
    gradientMap: toonSteps(),
    map: canvasTex(128, 128, (g) => {
      // (greys: each roof's own tint multiplies them) a parapet, a stair house, a few units
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#c9c9d2";
      g.fillRect(0, 0, 128, 7);
      g.fillRect(0, 121, 128, 7);
      g.fillRect(0, 0, 7, 128);
      g.fillRect(121, 0, 7, 128);
      for (const [x, y, w, h, c] of [
        [18, 20, 30, 24, "#b4b4c2"],
        [78, 66, 26, 34, "#dcdce6"],
        [24, 84, 18, 18, "#a4a4b6"],
        [84, 22, 14, 14, "#a4a4b6"],
      ] as [number, number, number, number, string][]) {
        g.fillStyle = "rgba(40,40,70,0.3)";
        g.fillRect(x + 4, y + 4, w, h);
        g.fillStyle = c;
        g.fillRect(x, y, w, h);
      }
    }),
  });
  const spots: [number, number][] = [];
  for (let i = -o.out; i <= o.out; i++)
    for (let j = -o.out; j <= o.out; j++) {
      if (!i && !j) continue;
      const keep = rnd() >= o.empty;
      if (keep && !o.clear?.(i * PITCH, j * PITCH)) spots.push([i, j]);
    }
  const walls = new THREE.InstancedMesh(GEO.box, wallMat, Math.max(1, spots.length));
  const roofs = new THREE.InstancedMesh(GEO.plane, roofMat, Math.max(1, spots.length));
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  spots.forEach(([i, j], n) => {
    const w = 12.5 + rnd() * 5.5,
      d = 12.5 + rnd() * 5.5;
    // (lower next to our tower, so the eye goes to the roof we play on; a few tall ones further out)
    const near = Math.max(Math.abs(i), Math.abs(j)) <= 1;
    const h = o.h[0] + rnd() * rnd() * (o.h[1] - o.h[0]) * (near ? 0.32 : 1);
    const x = i * PITCH + (rnd() - 0.5) * 1.6,
      z = j * PITCH + (rnd() - 0.5) * 1.6;
    walls.setMatrixAt(n, m.compose(p.set(x, o.y + h / 2, z), q.identity(), sc.set(w, h, d)));
    walls.setColorAt(n, c.set(pick(o.walls)));
    // (each roof a quarter turn or more round, so the one picture does not repeat; an odd turn swaps the plane's sides)
    const turn = Math.floor(rnd() * 4);
    q.setFromAxisAngle(up, (turn * Math.PI) / 2).multiply(flat);
    roofs.setMatrixAt(n, m.compose(p.set(x, o.y + h + 0.06, z), q, turn % 2 ? sc.set(d, w, 1) : sc.set(w, d, 1)));
    roofs.setColorAt(n, c.set(pick(o.tops)));
  });
  walls.count = roofs.count = spots.length;
  for (const mesh of [walls, roofs]) {
    mesh.userData.noShadow = true;
    mesh.raycast = () => {};
    scene.add(mesh);
  }
  return { ground, walls, roofs };
}

/**
 * Thin sheets of haze under a roof (one draw: flat tinted planes one above the other): everything below
 * them sinks a step into the air's colour, so the city reads as far down and the roof we play on stays
 * the brightest thing in the frame.
 */
export function hazeSheets(scene: THREE.Scene, ys: number[], color: THREE.ColorRepresentation, opacity: number) {
  // (in the fog like the rest: far off a sheet is the air's own colour, so its edge never shows on the horizon)
  const mesh = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), ys.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(900, 900, 1);
  ys.forEach((y, i) => mesh.setMatrixAt(i, m.compose(p.set(0, y, 0), q, s)));
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.userData.noShadow = true;
  mesh.raycast = () => {};
  scene.add(mesh);
  return mesh;
}

/**
 * Traffic on the streets far below (two draws: the cars, their lamps): each car keeps to its lane on
 * one street of the lot grid and comes round again past the fog.
 */
export class Traffic {
  private cars: THREE.InstancedMesh;
  private lamps: THREE.InstancedMesh | null;
  private d: Float32Array;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private qz = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private span: number;
  constructor(
    scene: THREE.Scene,
    private n: number,
    private y: number,
    o: { seed: number; out: number; colors: string[]; lamps?: boolean; skip?: (axis: number, street: number) => boolean },
  ) {
    const rnd = rng(o.seed);
    this.span = PITCH * (2 * o.out + 2);
    this.cars = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#ffffff" }), n);
    this.lamps = o.lamps ? new THREE.InstancedMesh(GEO.box, glow("#ffffff"), n * 2) : null;
    // (per car: its street's axis, the street, its way, its speed, where it started)
    this.d = new Float32Array(n * 5);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      let axis = rnd() < 0.5 ? 0 : 1,
        street = Math.floor(rnd() * (2 * o.out + 1)) - o.out;
      for (let tries = 0; tries < 6 && o.skip?.(axis, street); tries++) ((axis = 1 - axis), (street = Math.floor(rnd() * (2 * o.out + 1)) - o.out));
      this.d[i * 5] = axis;
      this.d[i * 5 + 1] = (street + 0.5) * PITCH;
      this.d[i * 5 + 2] = rnd() < 0.5 ? -1 : 1;
      this.d[i * 5 + 3] = 6 + rnd() * 6;
      this.d[i * 5 + 4] = rnd() * this.span;
      this.cars.setColorAt(i, c.set(o.colors[Math.floor(rnd() * o.colors.length) % o.colors.length]));
      this.lamps?.setColorAt(i * 2, c.set("#fff3c8"));
      this.lamps?.setColorAt(i * 2 + 1, c.set("#ff3b2f"));
    }
    this.qz.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    for (const mesh of [this.cars, this.lamps]) {
      if (!mesh) continue;
      mesh.frustumCulled = false;
      mesh.userData.noShadow = true;
      mesh.raycast = () => {};
      scene.add(mesh);
    }
  }
  tick(t: number) {
    const { d, m, p, s, span } = this;
    for (let i = 0; i < this.n; i++) {
      const axis = d[i * 5],
        way = d[i * 5 + 2];
      const along = ((((d[i * 5 + 4] + t * d[i * 5 + 3]) % span) + span) % span) * way - (way * span) / 2;
      // (each way keeps to its own side of the street)
      const side = d[i * 5 + 1] + way * (axis ? -1.35 : 1.35);
      const q = axis ? this.q.identity() : this.qz;
      const x = axis ? side : along,
        z = axis ? along : side;
      this.cars.setMatrixAt(i, m.compose(p.set(x, this.y + 0.6, z), q, s.set(1.5, 1.1, 3.2)));
      if (this.lamps) {
        const fx = axis ? 0 : way * 1.7,
          fz = axis ? way * 1.7 : 0;
        this.lamps.setMatrixAt(i * 2, m.compose(p.set(x + fx, this.y + 0.7, z + fz), q, s.set(1.5, 0.5, 0.5)));
        this.lamps.setMatrixAt(i * 2 + 1, m.compose(p.set(x - fx, this.y + 0.7, z - fz), q, s.set(1.5, 0.45, 0.4)));
      }
    }
    this.cars.instanceMatrix.needsUpdate = true;
    if (this.lamps) this.lamps.instanceMatrix.needsUpdate = true;
  }
}

/** A far ring of flat silhouettes behind the skyline (one draw, unlit: the last layer before the fog shuts). */
export function farRing(scene: THREE.Scene, o: { seed: number; r: number; n: number; y: number; h: [number, number]; color: THREE.ColorRepresentation }) {
  const rnd = rng(o.seed);
  const mesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: o.color }), o.n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < o.n; i++) {
    const a = ((i + rnd() * 0.7) / o.n) * Math.PI * 2;
    const d = o.r * (0.94 + rnd() * 0.2);
    const h = o.h[0] + rnd() * rnd() * (o.h[1] - o.h[0]);
    const w = 12 + rnd() * 16;
    mesh.setMatrixAt(i, m.compose(p.set(Math.cos(a) * d, o.y + h / 2, Math.sin(a) * d), q.setFromAxisAngle(up, -a), s.set(w, h, w)));
  }
  mesh.userData.noShadow = true;
  mesh.raycast = () => {};
  scene.add(mesh);
  return mesh;
}
