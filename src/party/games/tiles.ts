/**
 * SAFE BLOCK (安全方块): a floating grid of big coloured tiles over the shielded sea. The giant
 * Z-Block behind the arena flips to one colour; when its bar runs out, every tile of another colour
 * shakes and drops into the void, and whoever stands on one goes down with it. Then the tiles rise
 * again, reshuffled: each round faster, the colours more scattered, fewer safe tiles, and from the
 * fourth round holes to jump. Last snark standing wins.
 *
 * Arrows run (screen-relative), A jumps: over a hole, or off a doomed tile at the last moment onto a
 * far safe one (in the air you are not on the tile when it goes). Snarks bump each other; a safe
 * tile with three on it is a crowd.
 *
 * B shoves: a wind-up you can see coming (the shover leans back, its fists glow, an arrow in its
 * colour lights the floor where it will go), a short lunge, and whoever it meets slides about half a
 * tile, flailing: off the safe colour just before the drop, into a hole, into the void once the tiles
 * are gone. A hop or a step aside dodges it; two shoves that meet CLASH and bounce. The one shoved
 * can't be shoved again for a moment and may shove back as soon as it's up; a miss carries the
 * shover on, maybe off its own tile. A shove into a fall gets a SHOVED! banner.
 *
 * The order is reverse elimination. Those who outlast the tenth round rank by rounds survived, then
 * by who reached safety first in the last round; those who fell in the same round, by how close to a
 * safe tile they were.
 *
 * The AIs (by skill): a reaction delay after the colour, the nearest reachable safe tile by path
 * (round the holes, or over one with a jump) and away from a crowd, a hop at the last moment; the
 * weaker ones sometimes read the wrong colour first, pick a farther tile, jump late, or panic and
 * run back and forth between two tiles. They shove when it pays (a rival on the edge of the safe
 * colour with no time left to come back, one next to a hole or the void), the good ones better timed
 * and never off their own tile; they see a wind-up aimed at them and hop, step aside or shove back,
 * the weak ones late or not at all.
 *
 * Three levels (tiles-levels/levels.ts), the same rules on each: SHIELDED SEA (the 6 × 6 grid above),
 * NIGHT MARKET (a 7 × 7 crossroads whose corners are stalls, in the dark: the colours only show in two
 * sweeping spotlights, round each snark's lantern, and in the firework at each call; an AI only runs
 * to a safe tile it saw lit, or remembers from the firework) and PROOF FACTORY (five conveyor rows,
 * 7 × 5, each running the other way: the tiles ride them and tip over the roller at the end, a safe
 * tile too, and whoever stands on it; the AIs walk upstream and pass on a tile the belt will eat).
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { FONT, H, W, clamp, lerp, rr, sfx, shout, sound, text, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { music } from "../music";
import { actIcon, actsOf } from "../acts";
import { touchy } from "../hud";
import { Avatar, CamRig, Fx3, GEO, banner, block, canvasTex, corners, disposeScene, glow, outline, qTex, short, tag, toScreen, toon, toonSteps, world, yawOf, type World } from "../k3";
import { LEVELS, SEA_Y, type Decor, type TileLevel } from "./tiles-levels/levels";

// ---- the rules -----------------------------------------------------------------------------------

/** The grid (its size is the level's): tiles `P` apart (m), each `TS` wide. */
const P = 3;
const TS = 2.74;
/** How far past a tile's edge a snark's feet still hold on (covers the gaps between two tiles). */
const FOOT = 0.2;
const ROUNDS = 10;
/** Per round: the seconds the colour shows before the shake, how many tiles of it, the colour patches, the holes. */
const WARN = [2.6, 2.4, 2.2, 2.0, 1.85, 1.7, 1.55, 1.4, 1.25, 1.1];
const SAFE_N = [8, 7, 6, 6, 5, 5, 4, 4, 3, 2];
const SEEDS = [4, 5, 7, 9, 11, 13, 15, 18, 22, 26];
const HOLES = [0, 0, 0, 2, 2, 3, 3, 4, 4, 5];
/** The phases' lengths (s): the roulette (the first one longer), the flip at its end, the shake, the drop, the rise. */
const SPIN0 = 1.4;
const SPIN = 1.0;
const FLIP = 0.42;
const SHAKE = 0.45;
const DROP = 1.25;
const RISE = 0.95;
/** The snarks: run speed, grip on the ground and in the air, the jump, gravity, body radius, size. */
const SPEED = 6.2;
const ACC = 40;
const AIR_ACC = 15;
const JUMP_V = 10;
const GRAV = 30;
const PR = 0.52;
const SCALE = 1.3;
/** A press's grace: A a moment before landing still jumps, and a moment after walking off a tile that still stands. */
const JBUF = 0.12;
const COYOTE = 0.08;
/** Two bodies one in the other part at this speed each at most (m/s): one landing on another slides off it, it isn't thrown. */
const PART_V = 8;
/**
 * The shove (B): the wind-up (telegraphed), the lunge (speed, time), the wait before the next; the
 * knock it gives (speed, the moment without grip), the guard after it (no shove twice in a row), the
 * stumble after a miss.
 */
const WIND = 0.3;
const LUNGE_V = 8.5;
const LUNGE_T = 0.14;
const SHOVE_CD = 1.5;
const KNOCK_V = 4.5;
const KNOCK_T = 0.27;
const GUARD_T = 1.1;
const REC_T = 0.2;
/** Centre to centre, the lunge lands; its reach (the floor arrow's length); how far a miss carries; how far a hit slides one. */
const CONTACT = 1.12;
const REACH = LUNGE_V * LUNGE_T + CONTACT;
const WHIFF = LUNGE_V * LUNGE_T + 0.42;
const PUSH = 1.35;
/** A hard stop (game seconds), whatever happens. */
const CAP = 80;
/** The big Z-Block (its spot is behind the grid), its bar. */
const BAR_W = 8.8;
const QS = 4.2;
/**
 * LIGHTS OUT: the spotlights' radius on the floor (m), a lantern's reach past its snark (m), how long
 * the firework lights the whole floor at a call (s, the first round, the last; then a fade), and how
 * likely an AI remembers a safe tile it saw in it (the weakest, the best).
 */
const BEAM_R = 3.3;
const LANTERN = 1.05;
const FLASH = [0.8, 0.4];
const FLASH_FADE = 0.35;
const MEMO = [0.42, 0.9];
/** CONVEYORS: how far up a tile tips over a roller and still holds a snark (0..1 of its tip). */
const TIP_OK = 0.3;

// tile states
const UP = 0;
const FALL = 1;
const GONE = 2;
const RISING = 3;
const HOLE = 4;
/** No floor here at all (a stall's corner): a wall. */
const OFF = 5;

interface Hue {
  hex: string;
  en: string;
  zh: string;
}
/** The colours (the fifth joins in the fourth round); each has its symbol on the tiles. */
const HUES: Hue[] = [
  { hex: "#ff4a5a", en: "RED", zh: "红色" },
  { hex: "#ffcb2e", en: "YELLOW", zh: "黄色" },
  { hex: "#35d06a", en: "GREEN", zh: "绿色" },
  { hex: "#3b8cff", en: "BLUE", zh: "蓝色" },
  { hex: "#b45cff", en: "PURPLE", zh: "紫色" },
];
const hueCount = (r: number) => (r < 3 ? 4 : 5);

/** The symbol of colour `k` as a path: a star, a circle, a triangle, a diamond, a heart. */
function symbol(g: CanvasRenderingContext2D, k: number, x: number, y: number, r: number) {
  g.beginPath();
  if (k === 0) {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const d = i % 2 ? r * 0.46 : r;
      g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    g.closePath();
  } else if (k === 1) g.arc(x, y, r * 0.8, 0, Math.PI * 2);
  else if (k === 2) {
    g.moveTo(x, y - r * 0.92);
    g.lineTo(x + r * 0.95, y + r * 0.72);
    g.lineTo(x - r * 0.95, y + r * 0.72);
    g.closePath();
  } else if (k === 3) {
    g.moveTo(x, y - r);
    g.lineTo(x + r * 0.78, y);
    g.lineTo(x, y + r);
    g.lineTo(x - r * 0.78, y);
    g.closePath();
  } else {
    g.moveTo(x, y + r * 0.82);
    g.bezierCurveTo(x - r * 1.35, y - r * 0.05, x - r * 0.62, y - r * 1.1, x, y - r * 0.42);
    g.bezierCurveTo(x + r * 0.62, y - r * 1.1, x + r * 1.35, y - r * 0.05, x, y + r * 0.82);
    g.closePath();
  }
}

// ---- sounds of its own ---------------------------------------------------------------------------

function tone(f: number, dur: number, type: OscillatorType = "square", vol = 0.3, slide = 0, delay = 0) {
  const s = sound();
  if (!s) return;
  const t = s.ac.currentTime + delay;
  const o = s.ac.createOscillator();
  const g = s.ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(s.bus);
  o.start(t);
  o.stop(t + dur + 0.03);
}
/** A low rumble (the tiles shaking loose). */
function rumble(dur: number, vol = 0.5) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < n; i++) {
    v = v * 0.97 + (Math.random() * 2 - 1) * 0.03;
    d[i] = v * 7 * Math.min(1, i / (n * 0.15)) * (1 - i / n);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 260;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(bus);
  src.start();
}
/** A falling snark's scream: a wobbling slide whistle down. */
function scream(pitch = 1) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const lfo = ac.createOscillator();
  const lg = ac.createGain();
  const g = ac.createGain();
  const f = ac.createBiquadFilter();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(1050 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(130 * pitch, t + 1.15);
  lfo.frequency.value = 12;
  lg.gain.value = 45 * pitch;
  lfo.connect(lg).connect(o.frequency);
  f.type = "lowpass";
  f.frequency.value = 2400;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.04);
  g.gain.setValueAtTime(0.2, t + 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  o.connect(f).connect(g).connect(bus);
  o.start(t);
  lfo.start(t);
  o.stop(t + 1.25);
  lfo.stop(t + 1.25);
}

/** The shove's floor arrow (pointing +z from the feet, as long as the reach); `k` grows it into its ink. */
function arrowGeo(k: number) {
  const s = new THREE.Shape();
  s.moveTo(-0.3 - k, -k);
  s.lineTo(0.3 + k, -k);
  s.lineTo(0.3 + k, 1.02 - k * 0.4);
  s.lineTo(0.68 + k * 1.8, 1.02 - k * 0.4);
  s.lineTo(0, 1.85 + k * 1.7);
  s.lineTo(-0.68 - k * 1.8, 1.02 - k * 0.4);
  s.lineTo(-0.3 - k, 1.02 - k * 0.4);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, REACH - 1.85);
  return g;
}

// ---- the pieces of a tile (one instanced draw each) ----------------------------------------------

/** A tile turns round its middle (PIV under its top). */
const PIV = 0.45;
function lm(x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz));
}
/** The lit top plate, the slab under it, the dark base, their ink, the symbol on top. */
const L_PLATE = lm(0, PIV - 0.08, 0, TS - 0.34, 0.16, TS - 0.34);
const L_SLAB = lm(0, PIV - 0.39, 0, TS, 0.62, TS);
const L_SLAB_INK = lm(0, PIV - 0.39, 0, TS + 0.13, 0.75, TS + 0.13);
const L_BASE = lm(0, PIV - 0.92, 0, TS - 0.56, 0.46, TS - 0.56);
const L_BASE_INK = lm(0, PIV - 0.92, 0, TS - 0.44, 0.56, TS - 0.44);
const L_DECAL = lm(0, PIV + 0.012, 0, 1.55, 1.55, 1, -Math.PI / 2);
/** The gloss on its top (a highlight streak and a gleam, additive). */
const L_SHINE = lm(0, PIV + 0.02, 0, TS - 0.36, TS - 0.36, 1, -Math.PI / 2);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

interface Tile {
  gx: number;
  gz: number;
  x: number;
  z: number;
  /** Its colour; the next one, set when its delay is up (a tile that stayed). */
  col: number;
  nc: number;
  st: number;
  /** Its top's height, the fall: speed, turn, spin, drift. */
  y: number;
  vy: number;
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  dx: number;
  dz: number;
  hx: number;
  hz: number;
  /** Time in its state (a rise starts below zero: its delay). */
  t: number;
  /** The pop of a new colour (1 → 0); the hop of a safe tile when its colour is called (1 → 0). */
  pop: number;
  bump: number;
  /** On a conveyor: its place along the belt's loop at offset 0 and now (m), how far it has tipped over a roller (0..1), its speed. */
  u0: number;
  u: number;
  e: number;
  vx: number;
}

interface Ai {
  /** Seconds after the colour before it moves. */
  react: number;
  think: number;
  /** The tile it runs to (-1: none) and the spot on it (and that spot from the tile's middle: a tile on a belt moves). */
  cell: number;
  tx: number;
  tz: number;
  ox: number;
  oz: number;
  /** LIGHTS OUT: the safe tiles it knows (it saw them lit, or remembers them from the firework). */
  know: Uint8Array;
  /** Seconds it first runs to a wrong colour. */
  mistake: number;
  /** Runs back and forth between two tiles. */
  panic: boolean;
  flip: number;
  /** How long before the drop it hops if not safe yet; how late it jumps a hole (m). */
  jumpAt: number;
  jumpErr: number;
  /** Takes holes with a jump (else round them). */
  jumper: boolean;
  /** Where it waits for the colour (-1: where it is). */
  home: number;
  /** The path: from which tile, the distances and the way back. */
  from: number;
  dist: Float32Array;
  prev: Int8Array;
  /** Bored on a safe tile: a wave, a hop. */
  fidget: number;
  /**
   * The shove: when it looks for one next, how keen it is; the rival winding up at it, the wait
   * before it reacts and how (0 not at all, 1 a hop, 2 a step aside, 3 a shove back), the step's spot.
   */
  sCheck: number;
  aggro: number;
  /** In the mood for a real shove this round (else only a jostle). */
  mood: boolean;
  threat: number;
  dodgeT: number;
  dodge: number;
  evade: number;
  ex: number;
  ez: number;
}

interface Pl {
  p: Player;
  a: Avatar;
  /** Between the avatar and the snark: turns round the hips (the tumble of a fall). */
  tumble: THREE.Group;
  marker: THREE.Group | null;
  vx: number;
  vz: number;
  /** Knocked: less grip for a moment. */
  stun: number;
  /** An AI's legs (its top speed against the human's). */
  mult: number;
  out: boolean;
  falling: boolean;
  fallT: number;
  splashed: boolean;
  /** The round it fell in, how far from safety it was then, its place among the falls. */
  outRound: number;
  outDist: number;
  outIdx: number;
  /** Seconds after the colour it stood safe (-1: not now); at the drop: that time (99: never). */
  safeSince: number;
  lastSafe: number;
  survived: number;
  air: boolean;
  /** "SAFE!" over the head (1 → 0). */
  safePop: number;
  mad: number;
  ai: Ai;
  /** The shove: the wait before the next, the wind-up, the lunge, the stumble after, its aim; the human's B held a moment. */
  cd: number;
  wind: number;
  lunge: number;
  rec: number;
  sx: number;
  sz: number;
  bbuf: number;
  /** The human's A held a moment; the time since its feet left a tile that still stands (the jump's grace). */
  jbuf: number;
  coy: number;
  last: number;
  /** An AI's wish to shove this frame (a seat, -1: none) and its aim. */
  want: number;
  wx: number;
  wz: number;
  /** Shoved: no grip for a moment, then safe from another shove a little longer; the flail; by whom, how long ago. */
  knock: number;
  guard: number;
  spin: number;
  by: number;
  byT: number;
  /** Where it stood when shoved held (a ring-out the shove decided). */
  byOk: boolean;
  /** The telegraph: the arrow on the floor (its fill), the glow at the fists; the after-glow of a lunge. */
  arrow: THREE.Group;
  arrowM: THREE.MeshBasicMaterial;
  inkM: THREE.MeshBasicMaterial;
  fist: THREE.Mesh;
  fistM: THREE.MeshBasicMaterial;
  glowK: number;
  /** The HUD's B, flashing when it is ready again. */
  ready: number;
  /** The seat's colour (the glow's). */
  tint: THREE.Color;
}

/** A word over a head ("BONK!", "CLASH!"). */
interface Pop {
  x: number;
  y: number;
  z: number;
  s: string;
  c: string;
  t: number;
}

interface Ban {
  s: string;
  c: string;
  t: number;
  d: number;
  size: number;
  y: number;
}

type Phase = "spin" | "warn" | "shake" | "drop" | "rise" | "end";

class SafeBlock implements Mini {
  private w: World;
  /** The level: the grid's columns, rows, cells, half its width and depth; which cells are stalls. */
  private NX: number;
  private NZ: number;
  private NC: number;
  private HX: number;
  private HZ: number;
  private offCell: Uint8Array;
  private decor: Decor;
  /** The play camera (eye, target), the big Z-Block's spot. */
  private EYE: THREE.Vector3;
  private AT: THREE.Vector3;
  private QB: THREE.Vector3;
  /** LIGHTS OUT: each tile's light (0..1), the firework's, the spotlights (their paths), their beams and pools, the lanterns' pools. */
  private lit: Float32Array;
  private flash = 0;
  private beamT = 0;
  private bm: { x: number; z: number; w1: number; w2: number; p1: number; p2: number; fx: number; fy: number; fz: number; cone: THREE.Mesh; pool: THREE.Mesh }[] = [];
  private pools: THREE.InstancedMesh | null = null;
  private night = new THREE.Color("#22203a");
  /** CONVEYORS: how far the belts have run (m), each row's way (+1 / −1), their speed now; their meshes. */
  private bd = 0;
  private bdir: number[] = [];
  private bv = 0;
  private belts: THREE.Mesh[] = [];
  private beltTex: THREE.Texture[] = [];
  private rollers: THREE.InstancedMesh | null = null;
  private lipM: THREE.MeshBasicMaterial | null = null;
  /** The tile floorAt() found last (-1: none). */
  private ft = -1;
  private fx: Fx3;
  private cam: CamRig;
  private tiles: Tile[] = [];
  private pl: Pl[];
  /** The tiles' instanced pieces. */
  private slab: THREE.InstancedMesh;
  private plate: THREE.InstancedMesh;
  private base: THREE.InstancedMesh;
  private ink: THREE.InstancedMesh;
  private decals: THREE.InstancedMesh[] = [];
  private shine: THREE.InstancedMesh;
  private tileMeshes: THREE.InstancedMesh[] = [];
  private cols: THREE.Color[] = HUES.map((h) => new THREE.Color(h.hex));
  /** The big Z-Block and its screen face, the bar under it. */
  private qb: THREE.Group;
  private qMesh: THREE.Mesh;
  private front: THREE.MeshBasicMaterial;
  private faces: THREE.Texture[];
  private faceNow = -1;
  private qYaw = 0;
  private bar: THREE.Group;
  private fill: THREE.Mesh;
  private fillMats: THREE.MeshBasicMaterial[];
  private halo: THREE.Mesh;
  private round = 0;
  private ph: Phase = "spin";
  private pt = 0;
  private gt = 0;
  private time = 0;
  private safe = 0;
  private prevSafe = -1;
  /** The colour the block shows (the one called, until it flips back). */
  private called = -1;
  private order: number[] = [];
  private outCount = 0;
  private fellThisRound = 0;
  private over: number[] | null = null;
  /** Playing (not the card or the 3-2-1, when the block only shows its Q). */
  private live = false;
  private bans: Ban[] = [];
  private lastTick = -1;
  private rouletteIdx = -1;
  private shuffle: number[] = [0, 1, 2, 3, 4];
  /** The ring of the last hit on the floor. */
  private boom: THREE.Mesh;
  private boomM: THREE.MeshBasicMaterial;
  private boomT = 1;
  // scratch
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private m2 = new THREE.Matrix4();
  private m3 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private sc = new THREE.Vector3();
  private c = new THREE.Color();
  private c2 = new THREE.Color();
  private c3 = new THREE.Color();
  private dark = new THREE.Color("#2a1850");
  private white = new THREE.Color("#ffffff");
  private gold = new THREE.Color("#fff3a8");
  private mv = { x: 0, z: 0, j: false };
  private gapAt = -1;
  private gapLen = 0;
  private done: Uint8Array;
  private decalN = [0, 0, 0, 0, 0];
  private tagXY = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, on: false }));
  private tagOrd = [0, 1, 2, 3];
  private pops: Pop[] = [];
  /** What the shoves did (the bench reads it). */
  readonly stats = { shoves: 0, hits: 0, clashes: 0, misses: 0, cancels: 0, falls: 0, ringouts: 0, decisive: 0, byHuman: 0, onHuman: 0, ringoutsByHuman: 0, humanRingedOut: 0 };

  constructor(
    private players: Player[],
    private rnd: Rnd,
    private lv: TileLevel,
  ) {
    this.NX = lv.nx;
    this.NZ = lv.nz;
    this.NC = lv.nx * lv.nz;
    this.HX = (lv.nx * P) / 2;
    this.HZ = (lv.nz * P) / 2;
    const NC = this.NC;
    this.offCell = new Uint8Array(NC);
    for (let c = 0; c < NC; c++) if (lv.off?.(c % lv.nx, (c / lv.nx) | 0)) this.offCell[c] = 1;
    this.done = new Uint8Array(NC);
    this.lit = new Float32Array(NC);
    this.EYE = new THREE.Vector3(...lv.eye);
    this.AT = new THREE.Vector3(...lv.at);
    this.QB = new THREE.Vector3(0, 1.7, -(this.HZ + 6.6));
    this.w = world({ sky: lv.sky, fog: lv.fog });
    const s = this.w.scene;
    // (candy tiles under a strong sky fill: the shadows a little darker, so a snark's reads on them)
    s.userData.shadowK = 1.25;
    this.w.hemi.color.set(lv.hemi[0]);
    this.w.hemi.groundColor.set(lv.hemi[1]);
    this.w.hemi.intensity = lv.hemi[2];
    this.w.sun.color.set(lv.sun[0]);
    this.w.sun.intensity = lv.sun[1];
    this.w.sun.position.set(...lv.sun[2]);
    // ---- the level's scenery (the void far below, the city round it, its props)
    this.decor = lv.decor(s, this.HX, this.HZ);
    const QB = this.QB;

    // ---- the tiles
    const ink = new THREE.MeshBasicMaterial({ color: 0x1a1030, side: THREE.BackSide });
    this.slab = this.inst(toon("#ffffff"), NC);
    this.plate = this.inst(toon("#ffffff"), NC);
    this.base = this.inst(toon(lv.base), NC);
    this.ink = this.inst(ink, NC * 2);
    for (let k = 0; k < HUES.length; k++) {
      const tex = canvasTex(128, 128, (g) => {
        g.fillStyle = "#ffffff";
        symbol(g, k, 64, 64, 46);
        g.fill();
      });
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false });
      const d = this.inst(mat, NC, GEO.plane);
      d.renderOrder = 2;
      this.decals.push(d);
    }
    // the gloss: a streak of light across each top, a gleam in its corner (candy tiles)
    const shineTex = canvasTex(128, 128, (g) => {
      const gr = g.createLinearGradient(0, 0, 128, 128);
      gr.addColorStop(0, "rgba(255,255,255,0.55)");
      gr.addColorStop(0.28, "rgba(255,255,255,0.12)");
      gr.addColorStop(0.36, "rgba(255,255,255,0.42)");
      gr.addColorStop(0.44, "rgba(255,255,255,0.06)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "rgba(255,255,255,0.7)";
      g.fillRect(6, 6, 116, 5);
      g.fillRect(6, 6, 5, 116);
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.beginPath();
      g.arc(24, 24, 7, 0, Math.PI * 2);
      g.fill();
    });
    this.shine = this.inst(new THREE.MeshBasicMaterial({ map: shineTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), NC, GEO.plane);
    this.shine.renderOrder = 2;
    this.tileMeshes = [this.slab, this.plate, this.base, this.ink, this.shine];
    for (let gz = 0; gz < this.NZ; gz++)
      for (let gx = 0; gx < this.NX; gx++) {
        const off = this.offCell[gz * this.NX + gx] === 1;
        this.tiles.push({ gx, gz, x: this.cx(gx), z: this.cz(gz), col: 0, nc: -1, st: off ? OFF : UP, y: 0, vy: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, dx: 0, dz: 0, hx: 0, hz: 0, t: 0, pop: 0, bump: 0, u0: P / 2 + gx * P, u: P / 2 + gx * P, e: 0, vx: 0 });
      }
    // ---- the level's twist, seen: the spotlights and the lanterns' pools, or the belts and their rollers
    if (lv.dark) this.buildLights(s);
    if (lv.belt) this.buildBelts(s);

    // ---- the Z-Block that calls the colour, its bar, a halo behind
    this.faces = HUES.map((h, k) =>
      canvasTex(256, 256, (g) => {
        g.fillStyle = "#fff7e0";
        g.fillRect(0, 0, 256, 256);
        g.fillStyle = "#1c1238";
        rr(g, 10, 10, 236, 236, 30);
        g.fill();
        g.fillStyle = h.hex;
        rr(g, 20, 20, 216, 216, 24);
        g.fill();
        const gr = g.createLinearGradient(0, 20, 0, 236);
        gr.addColorStop(0, "rgba(255,255,255,0.38)");
        gr.addColorStop(0.45, "rgba(255,255,255,0.04)");
        gr.addColorStop(1, "rgba(0,0,0,0.12)");
        g.fillStyle = gr;
        rr(g, 20, 20, 216, 216, 24);
        g.fill();
        g.lineJoin = "round";
        g.fillStyle = "rgba(30,10,60,0.35)";
        symbol(g, k, 128, 138, 72);
        g.fill();
        g.fillStyle = "#ffffff";
        symbol(g, k, 128, 128, 72);
        g.fill();
      }),
    );
    this.qb = new THREE.Group();
    this.qb.position.copy(QB);
    const side = new THREE.MeshToonMaterial({ map: qTex(), gradientMap: toonSteps(), emissive: 0x3a2600 });
    this.front = new THREE.MeshBasicMaterial({ map: qTex() });
    this.qMesh = new THREE.Mesh(GEO.box, [side, side, side, side, this.front, side]);
    this.qMesh.scale.setScalar(QS);
    outline(this.qMesh, 0.05);
    this.qb.add(this.qMesh);
    s.add(this.qb);
    this.halo = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: "#fff3a8", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.scale.setScalar(QS * 2.05);
    this.halo.position.set(QB.x, QB.y, QB.z - 2.4);
    s.add(this.halo);
    this.bar = new THREE.Group();
    this.bar.position.set(QB.x, QB.y - QS / 2 - 1.25, QB.z + 1.2);
    const frame = block("#1d1240", 9.4, 1.3, 0.5, 0, 0, 0, this.bar);
    outline(frame, 0.1);
    this.fillMats = HUES.map((h) => glow(h.hex));
    this.fill = block("#ffffff", BAR_W, 0.8, 0.56, 0, 0, 0.02, this.bar, this.fillMats[0]);
    s.add(this.bar);

    // ---- the players, on the four middle tiles
    const aFill = arrowGeo(0);
    const aInk = arrowGeo(0.12);
    this.pl = players.map((p, i) => {
      const a = new Avatar(s, p, { scale: SCALE, marker: false });
      // (the snark hangs from a pivot at its hips: a fall tumbles head over heels)
      const tumble = new THREE.Group();
      tumble.position.y = 0.85 * SCALE;
      a.root.add(tumble);
      tumble.add(a.body.root);
      a.body.root.position.y = -0.85 * SCALE;
      let marker: THREE.Group | null = null;
      if (p.human) {
        marker = new THREE.Group();
        const cone = new THREE.Mesh(GEO.cone, toon(p.color, new THREE.Color(p.color).multiplyScalar(0.35)));
        cone.rotation.x = Math.PI;
        cone.scale.set(0.5, 0.6, 0.5);
        const hull = new THREE.Mesh(GEO.cone, ink);
        hull.scale.setScalar(1.22);
        cone.add(hull);
        marker.add(cone);
        a.root.add(marker);
      }
      a.pos.set(lv.start[i][0], 0, lv.start[i][1]);
      a.yaw = 0;
      a.sync(0);
      // the shove's telegraph: an arrow on the floor in the seat's colour over its ink, a glow at the fists
      const arrow = new THREE.Group();
      const inkM = new THREE.MeshBasicMaterial({ color: 0x1a1030, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
      const arrowM = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
      const ai0 = new THREE.Mesh(aInk, inkM);
      ai0.renderOrder = 3;
      const af = new THREE.Mesh(aFill, arrowM);
      af.position.y = 0.006;
      af.renderOrder = 4;
      arrow.add(ai0, af);
      arrow.visible = false;
      s.add(arrow);
      const fistM = new THREE.MeshBasicMaterial({ color: p.color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
      const fist = new THREE.Mesh(GEO.ball, fistM);
      fist.position.set(0, 0.25 * SCALE, 0.42 * SCALE);
      fist.visible = false;
      fist.renderOrder = 5;
      tumble.add(fist);
      const ai: Ai = {
        react: 0,
        think: 0,
        cell: -1,
        tx: 0,
        tz: 0,
        ox: 0,
        oz: 0,
        know: new Uint8Array(NC),
        mistake: 0,
        panic: false,
        flip: 0,
        jumpAt: 0,
        jumpErr: 0,
        jumper: true,
        home: -1,
        from: -1,
        dist: new Float32Array(NC),
        prev: new Int8Array(NC),
        fidget: 1 + rnd() * 2,
        sCheck: 1 + rnd(),
        aggro: 0.7 + rnd() * 0.6,
        mood: false,
        threat: -1,
        dodgeT: 0,
        dodge: 0,
        evade: 0,
        ex: 0,
        ez: 0,
      };
      return {
        p,
        a,
        tumble,
        marker,
        vx: 0,
        vz: 0,
        stun: 0,
        mult: p.human ? 1 : lerp(0.84, 0.98, p.skill),
        out: false,
        falling: false,
        fallT: 0,
        splashed: false,
        outRound: -1,
        outDist: 0,
        outIdx: 0,
        safeSince: -1,
        lastSafe: 99,
        survived: 0,
        air: false,
        safePop: 0,
        mad: 0,
        ai,
        cd: 0,
        wind: 0,
        lunge: 0,
        rec: 0,
        sx: 0,
        sz: 1,
        bbuf: 0,
        jbuf: 0,
        coy: COYOTE,
        last: -1,
        want: -1,
        wx: 0,
        wz: 1,
        knock: 0,
        guard: 0,
        spin: 0,
        by: -1,
        byT: 99,
        byOk: false,
        arrow,
        arrowM,
        inkM,
        fist,
        fistM,
        glowK: 0,
        ready: 0,
        tint: new THREE.Color(p.color),
      };
    });

    this.fx = new Fx3(s, 1400);
    this.boomM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.boom = new THREE.Mesh(GEO.ring, this.boomM);
    this.boom.rotation.x = -Math.PI / 2;
    this.boom.renderOrder = 5;
    this.boom.visible = false;
    s.add(this.boom);
    this.cam = new CamRig(this.w.camera);
    this.goal(this.eye, this.at);
    this.cam.set(this.eye, this.at);
    // the first round's colours, up already
    this.applyLayout(this.layout(0), true);
    this.chooseHomes();
    this.renderTiles();
    if (import.meta.env.DEV) (window as unknown as { __tiles?: unknown }).__tiles = this;
  }

  private inst(mat: THREE.Material, n: number, geo: THREE.BufferGeometry = GEO.box) {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.frustumCulled = false;
    m.raycast = () => {};
    m.setColorAt(0, this.c.set(0xffffff));
    for (let i = 0; i < n; i++) m.setMatrixAt(i, ZERO);
    this.w.scene.add(m);
    return m;
  }

  /** A tile centre's x from its column, z from its row (a tile on a belt moves off it). */
  private cx(gx: number) {
    return -this.HX + P / 2 + gx * P;
  }
  private cz(gz: number) {
    return -this.HZ + P / 2 + gz * P;
  }

  // ---- LIGHTS OUT ----------------------------------------------------------------------------------

  /** The spotlights (a beam from each lamp to its pool on the floor), the lanterns' pools round the snarks. */
  private buildLights(s: THREE.Scene) {
    const poolTex = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,255,255,0.75)");
      gr.addColorStop(0.62, "rgba(255,255,255,0.45)");
      gr.addColorStop(0.8, "rgba(255,255,255,0.7)");
      gr.addColorStop(0.86, "rgba(255,255,255,0.15)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    const coneGeo = new THREE.CylinderGeometry(0.1, 1, 1, 28, 1, true);
    coneGeo.translate(0, 0.5, 0);
    const from = this.lv.dark!.from;
    for (let i = 0; i < from.length; i++) {
      const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: "#fff1c4", transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      cone.renderOrder = 6;
      cone.frustumCulled = false;
      const pool = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: poolTex, color: "#fff1c4", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2;
      pool.scale.set(BEAM_R * 2.3, BEAM_R * 2.3, 1);
      pool.renderOrder = 3;
      s.add(cone, pool);
      // (each lamp patrols one street of the cross: the long way along it, a little across)
      const [fx, fy, fz] = from[i];
      this.bm.push({ x: 0, z: 0, w1: 0.5 + this.rnd() * 0.16, w2: 0.36 + this.rnd() * 0.14, p1: this.rnd() * 6.28, p2: this.rnd() * 6.28, fx, fy, fz, cone, pool });
    }
    this.pools = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: poolTex, color: "#ffb35c", transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }), 4);
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 3;
    s.add(this.pools);
  }

  /**
   * Each tile's light: a spotlight's pool, a lantern (round each snark still in), the firework at the
   * call (the whole floor, briefly), the lights coming on after the drop. A safe tile seen lit is
   * known to the AIs from then on.
   */
  private light(dt: number) {
    if (!this.lv.dark) return;
    const r = Math.min(this.round, ROUNDS - 1);
    this.beamT += dt * (1 + r * 0.05);
    const T0 = this.beamT;
    for (let i = 0; i < this.bm.length; i++) {
      const b = this.bm[i];
      const along = 0.8 * Math.sin(b.w1 * T0 + b.p1),
        across = 0.22 * Math.sin(b.w2 * T0 + b.p2);
      b.x = (i % 2 ? across : along) * this.HX;
      b.z = (i % 2 ? along : across) * this.HZ;
    }
    let fl = 0;
    const call = this.ph === "warn" ? this.pt : this.ph === "shake" ? WARN[r] + this.pt : -1;
    if (this.live && call >= 0) {
      const full = lerp(FLASH[0], FLASH[1], r / (ROUNDS - 1));
      fl = call < full ? 1 : clamp(1 - (call - full) / FLASH_FADE, 0, 1);
    }
    if (this.ph === "drop") fl = Math.max(fl, clamp((this.pt - 0.1) / 0.3, 0, 1));
    else if (this.ph === "rise") fl = Math.max(fl, clamp(1 - this.pt / 0.45, 0, 1));
    else if (this.ph === "end") fl = Math.max(fl, clamp(this.pt / 0.4, 0, 1));
    this.flash = fl;
    const learn = this.live && !this.over && (this.ph === "warn" || this.ph === "shake");
    const k = Math.min(1, dt * 14);
    for (let c = 0; c < this.NC; c++) {
      const t = this.tiles[c];
      if (t.st === OFF) continue;
      let L = 0;
      for (const b of this.bm) L = Math.max(L, clamp((BEAM_R + 0.35 - Math.hypot(t.x - b.x, t.z - b.z)) / 1.0, 0, 1));
      for (const q of this.pl) {
        if (q.out || q.falling) continue;
        const ex = Math.max(0, Math.abs(q.a.pos.x - t.x) - TS / 2),
          ez = Math.max(0, Math.abs(q.a.pos.z - t.z) - TS / 2);
        L = Math.max(L, clamp((LANTERN - Math.hypot(ex, ez)) / 0.6, 0, 1));
      }
      if (learn && L > 0.55 && t.st === UP && t.col === this.safe)
        for (const q of this.pl) {
          if (q.p.human || q.out || q.ai.know[c]) continue;
          q.ai.know[c] = 1;
          // (one that had nowhere to go looks again at once)
          if (q.ai.cell < 0 || this.tiles[q.ai.cell].col !== this.safe) q.ai.think = Math.min(q.ai.think, 0.08);
        }
      this.lit[c] += (Math.max(L, fl) - this.lit[c]) * k;
    }
    this.w.hemi.intensity = this.lv.hemi[2] * (1 + 0.45 * fl);
  }

  /** The beams and their pools where the lamps point, a lantern's pool under each snark. */
  private lights3() {
    if (!this.lv.dark) return;
    for (const b of this.bm) {
      b.pool.position.set(b.x, 0.06, b.z);
      const dx = b.fx - b.x,
        dy = b.fy,
        dz = b.fz - b.z;
      const l = Math.hypot(dx, dy, dz);
      b.cone.position.set(b.x, 0, b.z);
      b.cone.quaternion.setFromUnitVectors(this.v.set(0, 1, 0), this.v2.set(dx / l, dy / l, dz / l));
      b.cone.scale.set(BEAM_R * 0.92, l, BEAM_R * 0.92);
      (b.pool.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - this.flash * 0.6);
    }
    const pools = this.pools!;
    for (let i = 0; i < 4; i++) {
      const q = this.pl[i];
      const on = !q.out && !q.falling;
      const sc = on ? 2 * (TS / 2 + LANTERN * 0.8) : 0;
      this.m.compose(this.v.set(q.a.pos.x, (q.a.floor ?? 0) + 0.07, q.a.pos.z), this.q.setFromEuler(this.e.set(-Math.PI / 2, 0, 0)), this.sc.set(sc, sc, 1));
      pools.setMatrixAt(i, this.m);
    }
    pools.instanceMatrix.needsUpdate = true;
  }

  // ---- CONVEYORS -----------------------------------------------------------------------------------

  /** The belts under the rows (chevrons scrolling their way), the striped rollers at both ends, the red lip at each row's end. */
  private buildBelts(s: THREE.Scene) {
    const W = this.NX * P;
    for (let gz = 0; gz < this.NZ; gz++) this.bdir.push(gz % 2 ? -1 : 1);
    const paint = (g: CanvasRenderingContext2D) => {
      g.fillStyle = "#2b2329";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#3a3038";
      g.fillRect(0, 28, 64, 8);
      g.fillStyle = "#ffb52e";
      g.beginPath();
      g.moveTo(10, 6);
      g.lineTo(26, 6);
      g.lineTo(50, 32);
      g.lineTo(26, 58);
      g.lineTo(10, 58);
      g.lineTo(34, 32);
      g.closePath();
      g.fill();
    };
    for (const dir of [1, -1]) {
      const tex = canvasTex(64, 64, paint, true);
      tex.repeat.set((dir * W) / 1.5, 1);
      this.beltTex.push(tex);
    }
    const mats = this.beltTex.map((t) => new THREE.MeshToonMaterial({ map: t, gradientMap: toonSteps(), emissive: 0x1a0c06 }));
    for (let gz = 0; gz < this.NZ; gz++) {
      const b = block("", W + 0.6, 0.3, P - 0.12, 0, -1.32, this.cz(gz), s, mats[this.bdir[gz] > 0 ? 0 : 1]);
      this.belts.push(b);
    }
    // the girders along the front and the back of the bed
    for (const sz of [-1, 1]) outline(block("#5a4450", W + 3.4, 0.7, 0.5, 0, -1.25, sz * (this.HZ + 0.3), s), 0.06);
    const stripes = canvasTex(
      64,
      64,
      (g) => {
        for (let i = 0; i < 8; i++) {
          g.fillStyle = i % 2 ? "#1d1820" : "#ffcf2e";
          g.fillRect(0, i * 8, 64, 8);
        }
      },
      true,
    );
    this.rollers = new THREE.InstancedMesh(GEO.cyl, new THREE.MeshToonMaterial({ map: stripes, gradientMap: toonSteps() }), this.NZ * 2);
    this.rollers.frustumCulled = false;
    s.add(this.rollers);
    // the red lip where each row ends (it eats tiles there) and a chevron past it, pointing over the edge
    this.lipM = new THREE.MeshBasicMaterial({ color: "#ff3a2a" });
    const lips = new THREE.InstancedMesh(GEO.box, this.lipM, this.NZ);
    const chevTex = canvasTex(128, 128, (g) => {
      g.fillStyle = "#ff3a2a";
      g.beginPath();
      g.moveTo(20, 14);
      g.lineTo(62, 14);
      g.lineTo(112, 64);
      g.lineTo(62, 114);
      g.lineTo(20, 114);
      g.lineTo(70, 64);
      g.closePath();
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = "#ffffff";
      g.stroke();
    });
    const chev = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: chevTex, transparent: true, depthWrite: false }), this.NZ);
    for (let gz = 0; gz < this.NZ; gz++) {
      const dir = this.bdir[gz],
        z = this.cz(gz);
      this.m.compose(this.v.set(dir * (this.HX + 0.12), 0.02, z), this.q.identity(), this.sc.set(0.22, 0.14, P - 0.5));
      lips.setMatrixAt(gz, this.m);
      this.m.compose(this.v.set(dir * (this.HX + 1.55), -0.55, z), this.q.setFromEuler(this.e.set(-Math.PI / 2, 0, 0)), this.sc.set(dir * 1.5, 1.5, 1));
      chev.setMatrixAt(gz, this.m);
    }
    s.add(lips, chev);
  }

  /** The belts run (stopped before GO and at the end), the tiles ride them round their loops. */
  private beltStep(dt: number) {
    const bl = this.lv.belt;
    if (!bl) return;
    const r = Math.min(this.round, ROUNDS - 1);
    const want = this.live && !this.over ? lerp(bl[0], bl[1], r / (ROUNDS - 1)) : 0;
    this.bv += (want - this.bv) * Math.min(1, dt * 2.5);
    this.bd += this.bv * dt;
    const W = this.NX * P,
      H2 = P / 2;
    for (const t of this.tiles) {
      const dir = this.bdir[t.gz];
      let u = (t.u0 + this.bd) % W;
      if (u < 0) u += W;
      // (a tile going over the roller at the end: sparks off the roller)
      if (t.u <= W - H2 && u > W - H2 && (t.st === UP || t.st === RISING) && this.live) this.fx.burst(this.v.set(dir * (this.HX + 0.2), -0.45, t.z), 9, ["#ffe9a8", "#ffcf4a", "#ff8a2a"], { speed: 4.5, up: 3, gravity: 14, size: 0.14, life: 0.55 });
      t.u = u;
      t.x = dir > 0 ? -this.HX + u : this.HX - u;
      t.e = u > W - H2 ? (u - (W - H2)) / H2 : u < H2 ? 1 - u / H2 : 0;
      t.vx = dir * this.bv;
    }
  }

  /** How far a tile on a belt has sunk in its tip over a roller (m). */
  private tipY(t: Tile) {
    return t.e > 0 ? t.e * t.e * 1.9 + t.e * 0.5 : 0;
  }

  /** Will the belt have tipped tile `t` off (or still have it under) within `h` seconds? */
  private eaten(t: Tile, h: number) {
    if (!this.lv.belt) return false;
    const W = this.NX * P;
    if (t.e > 0) return t.u > W / 2 || t.e > TIP_OK;
    return t.u + this.bv * h > W - P / 2 + TIP_OK * (P / 2);
  }

  /** The seconds before the tile `t` tips past holding (99: not on a belt, or rising). */
  private tipIn(t: Tile) {
    if (!this.lv.belt || this.bv < 0.05) return 99;
    const W = this.NX * P;
    if (t.e > 0) return t.u > W / 2 ? 0 : 99;
    return (W - P / 2 + TIP_OK * (P / 2) - t.u) / this.bv;
  }

  /** The chevrons scroll, the rollers turn, the lips pulse. */
  private belts3() {
    if (!this.lv.belt) return;
    for (const t of this.beltTex) t.offset.x = -this.bd / 1.5;
    const rl = this.rollers!;
    let i = 0;
    for (let gz = 0; gz < this.NZ; gz++)
      for (const sx of [-1, 1]) {
        const dir = this.bdir[gz];
        // (axis along z; it turns the way its belt runs)
        this.q.setFromEuler(this.e.set(Math.PI / 2, 0, (-dir * this.bd) / 0.55, "ZXY"));
        this.m.compose(this.v.set(sx * (this.HX + 0.25), -1.05, this.cz(gz)), this.q, this.sc.set(1.1, P - 0.3, 1.1));
        rl.setMatrixAt(i++, this.m);
      }
    rl.instanceMatrix.needsUpdate = true;
    this.lipM!.color.setRGB(1, 0.22 + 0.2 * Math.sin(this.time * 6), 0.15);
  }

  // ---- the layouts -------------------------------------------------------------------------------

  /** The colours (and holes) of round `r`: patches of colours, then exactly the target of the one called. */
  private layout(r: number) {
    const K = hueCount(r);
    const target = SAFE_N[r];
    // (from any tile, the nearest safe one within what a quick snark can run, the hop included)
    const reach = (WARN[r] + SHAKE - 0.4) * SPEED + 1.4;
    // (and the called colour a run away from where the snarks stand: two tiles, then more)
    const want = Math.min(reach - 1.4, lerp(6, 8, r / (ROUNDS - 1)));
    const NC = this.NC,
      T = this.tiles;
    let best: { col: number[]; hole: boolean[]; safe: number } | null = null;
    let bestScore = Infinity;
    for (let tries = 0; tries < 14; tries++) {
      const hole = this.pickHoles(HOLES[r]);
      const col = this.patches(SEEDS[r], K);
      const cnt = [0, 0, 0, 0, 0];
      for (let c = 0; c < NC; c++) if (!hole[c]) cnt[col[c]]++;
      let safe = 0,
        sc = Infinity;
      for (let h = 0; h < K; h++) {
        if (h === this.prevSafe) continue;
        const v = Math.abs(cnt[h] - target) + this.rnd() * 1.5;
        if (v < sc) ((sc = v), (safe = h));
      }
      this.trim(col, hole, safe, target, K);
      // how far the farthest tile is from safety; who would not have to move at all
      let worst = 0;
      for (let c = 0; c < NC; c++) {
        if (hole[c]) continue;
        let d = Infinity;
        for (let k = 0; k < NC; k++) if (!hole[k] && col[k] === safe) d = Math.min(d, Math.hypot(T[c].x - T[k].x, T[c].z - T[k].z));
        worst = Math.max(worst, d);
      }
      let on = 0,
        far = 0,
        n = 0;
      for (const q of this.pl ?? []) {
        if (q.out) continue;
        const c = this.cellOf(q.a.pos.x, q.a.pos.z);
        if (!hole[c] && col[c] === safe) on++;
        let d = Infinity;
        for (let k = 0; k < NC; k++) if (!hole[k] && col[k] === safe) d = Math.min(d, Math.hypot(q.a.pos.x - T[k].x, q.a.pos.z - T[k].z));
        far += d;
        n++;
      }
      const off = n ? Math.abs(far / n - want) : 0;
      // (on the belts: enough safe tiles the belt won't have tipped off by the end of the drop)
      let eaten = 0;
      if (this.lv.belt) {
        const v = lerp(this.lv.belt[0], this.lv.belt[1], r / (ROUNDS - 1));
        const W = this.NX * P;
        for (let c = 0; c < NC; c++) if (!hole[c] && col[c] === safe && T[c].u + v * (SPIN + WARN[r] + SHAKE + DROP * 0.7) > W - P / 2) eaten++;
        eaten = Math.max(0, Math.max(2, Math.ceil(target * 0.55)) - (target - eaten));
      }
      const score = (worst > reach ? 100 + worst : 0) + on * 6 + off * 1.5 + eaten * 12 + this.rnd();
      if (score < bestScore) ((bestScore = score), (best = { col, hole, safe }));
    }
    return best!;
  }

  /** `n` holes, never under a snark, the rest of the grid still in one piece (a stall's cell is a hole for good). */
  private pickHoles(n: number) {
    const NC = this.NC,
      off = this.offCell;
    const hole: boolean[] = new Array(NC).fill(false);
    for (let c = 0; c < NC; c++) hole[c] = off[c] === 1;
    if (!n) return hole;
    for (let tries = 0; tries < 12; tries++) {
      for (let c = 0; c < NC; c++) hole[c] = off[c] === 1;
      let k = 0;
      for (let guard = 0; k < n && guard < 200; guard++) {
        const c = Math.floor(this.rnd() * NC);
        if (hole[c]) continue;
        let near = false;
        for (const q of this.pl ?? []) if (!q.out && Math.abs(q.a.pos.x - this.tiles[c].x) < 2.4 && Math.abs(q.a.pos.z - this.tiles[c].z) < 2.4) near = true;
        if (near) continue;
        hole[c] = true;
        k++;
      }
      if (this.connected(hole)) return hole;
    }
    for (let c = 0; c < NC; c++) hole[c] = off[c] === 1;
    return hole;
  }

  private connected(hole: boolean[]) {
    const NC = this.NC,
      NX = this.NX;
    const seen = new Uint8Array(NC);
    const st: number[] = [];
    let total = 0;
    for (let c = 0; c < NC; c++) if (!hole[c]) total++;
    const s0 = hole.indexOf(false);
    if (s0 < 0) return false;
    st.push(s0);
    seen[s0] = 1;
    let n = 0;
    while (st.length) {
      const c = st.pop()!;
      n++;
      const x = c % NX,
        z = (c / NX) | 0;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= NX || nz >= this.NZ) continue;
        const k = nz * NX + nx;
        if (hole[k] || seen[k]) continue;
        seen[k] = 1;
        st.push(k);
      }
    }
    return n === total;
  }

  /** Colour patches: each tile joins its nearest seed; the patches get colours their neighbours lack. */
  private patches(S: number, K: number) {
    const NC = this.NC,
      NX = this.NX,
      NZ = this.NZ;
    const sx: number[] = [],
      sz: number[] = [];
    // (spread on a jittered lattice: patches of about the same size)
    const cols = Math.ceil(Math.sqrt(S));
    const rows = Math.ceil(S / cols);
    const cells = [...Array(cols * rows).keys()].sort(() => this.rnd() - 0.5).slice(0, S);
    for (const k of cells) (sx.push((((k % cols) + 0.15 + this.rnd() * 0.7) / cols) * NX), sz.push(((((k / cols) | 0) + 0.15 + this.rnd() * 0.7) / rows) * NZ));
    const reg: number[] = [];
    const size = new Array(S).fill(0);
    for (let c = 0; c < NC; c++) {
      const x = (c % NX) + 0.5,
        z = ((c / NX) | 0) + 0.5;
      let b = 0,
        bd = Infinity;
      for (let i = 0; i < S; i++) {
        const d = Math.hypot(x - sx[i], z - sz[i]) + this.rnd() * 0.4;
        if (d < bd) ((bd = d), (b = i));
      }
      reg.push(b);
      size[b]++;
    }
    const adj: Set<number>[] = [];
    for (let i = 0; i < S; i++) adj.push(new Set());
    for (let c = 0; c < NC; c++) {
      const x = c % NX;
      if (x < NX - 1 && reg[c] !== reg[c + 1]) (adj[reg[c]].add(reg[c + 1]), adj[reg[c + 1]].add(reg[c]));
      if (c + NX < NC && reg[c] !== reg[c + NX]) (adj[reg[c]].add(reg[c + NX]), adj[reg[c + NX]].add(reg[c]));
    }
    const rc = new Array(S).fill(-1);
    const used = [0, 0, 0, 0, 0];
    const ord = [...Array(S).keys()].sort(() => this.rnd() - 0.5);
    for (const i of ord) {
      let b = 0,
        bs = Infinity;
      for (let h = 0; h < K; h++) {
        let clash = 0;
        for (const j of adj[i]) if (rc[j] === h) clash++;
        const v = clash * 10 + used[h] + this.rnd() * 1.2;
        if (v < bs) ((bs = v), (b = h));
      }
      rc[i] = b;
      used[b] += size[i];
    }
    return reg.map((r) => rc[r] as number);
  }

  /** Exactly `target` tiles of the safe colour: the extra ones take a neighbour's colour, the missing far from the others. */
  private trim(col: number[], hole: boolean[], safe: number, target: number, K: number) {
    const NC = this.NC,
      NX = this.NX;
    const safeCells = () => col.map((h, c) => (h === safe && !hole[c] ? c : -1)).filter((c) => c >= 0);
    let cells = safeCells();
    while (cells.length > target) {
      const c = cells.splice(Math.floor(this.rnd() * cells.length), 1)[0];
      const x = c % NX,
        z = (c / NX) | 0;
      const opts: number[] = [];
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= NX || nz >= this.NZ) continue;
        const h = col[nz * NX + nx];
        if (h !== safe) opts.push(h);
      }
      col[c] = opts.length ? opts[Math.floor(this.rnd() * opts.length)] : (safe + 1 + Math.floor(this.rnd() * (K - 1))) % K;
    }
    while (cells.length < target) {
      let b = -1,
        bs = -Infinity;
      for (let c = 0; c < NC; c++) {
        if (hole[c] || col[c] === safe) continue;
        let d = 99;
        for (const k of cells) d = Math.min(d, Math.hypot((c % NX) - (k % NX), ((c / NX) | 0) - ((k / NX) | 0)));
        const v = Math.min(d, 3) + this.rnd() * 1.6;
        if (v > bs) ((bs = v), (b = c));
      }
      if (b < 0) break;
      col[b] = safe;
      cells = safeCells();
    }
  }

  /** Put a layout on the grid: at once (the first), or as the next rise (new tiles from below, the ones up recoloured). */
  private applyLayout(L: { col: number[]; hole: boolean[]; safe: number }, now = false) {
    this.safe = L.safe;
    this.prevSafe = L.safe;
    for (let c = 0; c < this.NC; c++) {
      const t = this.tiles[c];
      if (t.st === OFF) continue;
      const ripple = Math.hypot(t.x, t.z) / Math.max(this.HX, this.HZ);
      if (now) {
        t.col = L.col[c];
        t.st = L.hole[c] ? HOLE : UP;
        t.y = 0;
        continue;
      }
      if (L.hole[c]) {
        if (t.st === UP) this.dropTile(t, 0.4);
        else if (t.st !== FALL) t.st = HOLE;
        continue;
      }
      if (t.st === UP) {
        t.nc = L.col[c];
        t.t = -(0.1 + ripple * 0.3 + this.rnd() * 0.1);
      } else {
        t.st = RISING;
        t.col = L.col[c];
        t.t = -(ripple * 0.28 + this.rnd() * 0.12);
        t.y = -8;
        t.rx = t.ry = t.rz = t.dx = t.dz = 0;
      }
    }
    // the colours the roulette flicks through (this round's, in a fresh order)
    const K = hueCount(this.round);
    this.shuffle = [...Array(K).keys()].sort(() => Math.random() - 0.5);
  }

  private dropTile(t: Tile, kick = 1) {
    t.st = FALL;
    t.t = 0;
    t.vy = -(1 + Math.random() * 2) * kick;
    t.wx = (Math.random() - 0.5) * 3.2;
    t.wz = (Math.random() - 0.5) * 3.2;
    t.wy = (Math.random() - 0.5) * 1.4;
    t.hx = (Math.random() - 0.5) * 0.8 + t.x * 0.03;
    t.hz = (Math.random() - 0.5) * 0.8 + t.z * 0.03;
  }

  // ---- the ground ----------------------------------------------------------------------------------

  private cellOf(x: number, z: number) {
    const NX = this.NX;
    const gz = clamp(Math.floor((z + this.HZ) / P), 0, this.NZ - 1);
    if (this.lv.belt) {
      // (on the belts: the tile of that row nearest to x, wherever its loop has taken it)
      let b = 0,
        bd = Infinity;
      for (let gx = 0; gx < NX; gx++) {
        const d = Math.abs(this.tiles[gz * NX + gx].x - x);
        if (d < bd) ((bd = d), (b = gx));
      }
      return gz * NX + b;
    }
    const gx = clamp(Math.floor((x + this.HX) / P), 0, NX - 1);
    return gz * NX + gx;
  }

  /** A tile up that holds a snark (on a belt: not tipped too far over its roller). */
  private upT(t: Tile) {
    return t.st === UP && t.e < TIP_OK;
  }

  private solid(t: Tile) {
    return this.upT(t) || (t.st === RISING && t.t > 0 && t.y > -0.6 && t.e < TIP_OK);
  }

  /** The height of the ground under (x, z), or null: the void. `onlySafe`: the called colour's tiles only. (this.ft: the tile.) */
  private floorAt(x: number, z: number, onlySafe = false, onlyUp = false): number | null {
    const NX = this.NX,
      belt = !!this.lv.belt;
    const gx0 = Math.floor((x + this.HX) / P),
      gz0 = Math.floor((z + this.HZ) / P);
    let best: number | null = null;
    this.ft = -1;
    for (let dz = -1; dz <= 1; dz++) {
      const gz = gz0 + dz;
      if (gz < 0 || gz >= this.NZ) continue;
      const x0 = belt ? 0 : Math.max(0, gx0 - 1),
        x1 = belt ? NX - 1 : Math.min(NX - 1, gx0 + 1);
      for (let gx = x0; gx <= x1; gx++) {
        const c = gz * NX + gx;
        const t = this.tiles[c];
        if (onlyUp ? !this.upT(t) : !this.solid(t)) continue;
        if (onlySafe && (!this.upT(t) || t.col !== this.safe)) continue;
        if (Math.abs(x - t.x) > TS / 2 + FOOT || Math.abs(z - t.z) > TS / 2 + FOOT) continue;
        const y = t.y + this.hop(t) - this.tipY(t);
        if (best === null || y > best) ((best = y), (this.ft = c));
      }
    }
    return best;
  }

  /** How high a called tile is in its hop (whoever stands on it goes up too). */
  private hop(t: Tile) {
    return t.bump > 0 ? Math.sin((1 - t.bump) * Math.PI) * 0.3 : 0;
  }

  private safeAt(x: number, z: number) {
    return this.floorAt(x, z, true) !== null;
  }

  /** How far (x, z) is from the nearest safe tile (0 on one). */
  private safeDist(x: number, z: number) {
    let d = Infinity;
    for (const t of this.tiles) {
      if (t.st !== UP || t.col !== this.safe) continue;
      const ex = Math.max(0, Math.abs(x - t.x) - TS / 2 - FOOT);
      const ez = Math.max(0, Math.abs(z - t.z) - TS / 2 - FOOT);
      d = Math.min(d, Math.hypot(ex, ez));
    }
    return d;
  }

  /** The seconds left to the drop. */
  private left() {
    if (this.ph === "warn") return WARN[this.round] - this.pt + SHAKE;
    if (this.ph === "shake") return SHAKE - this.pt;
    return 0;
  }

  // ---- the flow ------------------------------------------------------------------------------------

  private say(s: string, c = "#ffd23f", d = 1.1, size = 58, y = H * 0.36) {
    // (a long queue plays quicker)
    if (this.bans.length > 1) for (const b of this.bans) b.d = Math.min(b.d, 0.8);
    this.bans.push({ s, c, t: 0, d, size, y });
  }

  private step(dt: number) {
    this.pt += dt;
    this.gt += dt;
    const r = this.round;
    if (this.ph === "spin") {
      const dur = r === 0 ? SPIN0 : SPIN;
      if (this.pt >= dur) this.reveal();
    } else if (this.ph === "warn") {
      // the ticks: every half second, then every quarter
      const left = WARN[r] - this.pt;
      const k = left > 1 ? Math.floor(left * 2) : 100 + Math.floor(left * 4);
      if (k !== this.lastTick && left > 0) {
        this.lastTick = k;
        if (left > 1) tone(880, 0.05, "square", 0.22);
        else tone(1175, 0.05, "square", 0.3);
      }
      if (this.pt >= WARN[r]) {
        this.ph = "shake";
        this.pt = 0;
        rumble(SHAKE + 0.4, 0.55);
        this.cam.shake(0.12);
      }
    } else if (this.ph === "shake") {
      this.cam.shake(0.05);
      if (this.pt >= SHAKE) this.drop();
    } else if (this.ph === "drop") {
      if (this.pt >= DROP) this.endRound();
    } else if (this.ph === "rise") {
      if (this.pt >= RISE) {
        this.ph = "spin";
        this.pt = 0;
        this.rouletteIdx = -1;
        this.chooseHomes();
      }
    }
    if (!this.over && this.gt > CAP) this.finish();
  }

  private reveal() {
    this.ph = "warn";
    this.pt = 0;
    this.lastTick = -1;
    const h = HUES[this.safe];
    this.called = this.safe;
    // (the call comes first: whatever was still queued goes)
    this.bans.length = 0;
    // (over the block itself: the grid stays clear to read)
    this.say(T(`${h.en}!`, `${h.zh}！`), h.hex, 0.9, 64, H * 0.13);
    tone(784, 0.09, "square", 0.35);
    tone(1046, 0.09, "square", 0.35, 0, 0.08);
    tone(1568, 0.22, "square", 0.35, 0, 0.16);
    // (the called colour's tiles hop: here it is safe)
    for (const t of this.tiles)
      if (t.st === UP && t.col === this.safe) {
        t.bump = 1;
        this.fx.burst(this.v.set(t.x, 0.35, t.z), 5, [h.hex, "#ffffff", "#fff3a8"], { speed: 2.6, up: 3.4, gravity: 7, size: 0.16, life: 0.6 });
      }
    this.fx.burst(this.v.set(this.QB.x, this.QB.y, this.QB.z + 2.5), 40, [h.hex, "#ffffff", "#fff3a8"], { speed: 9, up: 4, gravity: 10, size: 0.3, life: 1 });
    // LIGHTS OUT: a firework in the colour bursts over the market and lights the whole floor a moment
    if (this.lv.dark) {
      for (let k = 0; k < 2; k++) this.fx.burst(this.v.set((Math.random() - 0.5) * this.HX * 1.4, 13 + Math.random() * 3, -this.HZ * 0.6 + (Math.random() - 0.5) * 4), 46, [h.hex, h.hex, "#ffffff", "#fff3a8"], { speed: 11, up: 2, gravity: 5, size: 0.34, life: 1.3, drag: 1.2 });
      tone(180, 0.25, "sawtooth", 0.18, 0.4);
      tone(2400, 0.4, "triangle", 0.12, 0.3, 0.05);
    }
    for (const q of this.pl) {
      q.safeSince = -1;
      if (q.out || q.p.human) continue;
      const s = q.p.skill,
        ai = q.ai;
      ai.react = lerp(0.95, 0.22, s) + this.rnd() * lerp(0.5, 0.1, s);
      ai.mistake = this.rnd() < lerp(0.32, 0.05, s) ? 0.35 + this.rnd() * 0.5 : 0;
      ai.panic = this.rnd() < Math.max(0, 0.6 - s) * 0.85;
      // (the weak ones hop too early, too late, or not at all)
      ai.jumpAt = this.rnd() < lerp(0.45, 0.04, s) ? -1 : lerp(0.75, 0.22, s) + (this.rnd() - 0.5) * lerp(0.7, 0.08, s);
      ai.jumpErr = (this.rnd() - 0.3) * lerp(0.9, 0.12, s);
      ai.jumper = s > 0.3 || this.rnd() < 0.5;
      ai.cell = -1;
      ai.think = 0;
      ai.from = -1;
      // (in the dark: the safe tiles it caught in the firework)
      if (this.lv.dark) {
        ai.know.fill(0);
        const memo = lerp(MEMO[0], MEMO[1], s);
        for (let c = 0; c < this.NC; c++) if (this.tiles[c].st === UP && this.tiles[c].col === this.safe && this.rnd() < memo) ai.know[c] = 1;
      }
      // (some rounds it is out to shove somebody off, most it minds its own tile)
      ai.mood = this.rnd() < lerp(0.1, 0.4, s) * ai.aggro;
    }
  }

  private drop() {
    this.ph = "drop";
    this.pt = 0;
    this.fellThisRound = 0;
    // who was where when it went
    for (const q of this.pl) {
      if (q.out) continue;
      q.lastSafe = q.safeSince >= 0 ? q.safeSince : 99;
      q.outDist = this.safeDist(q.a.pos.x, q.a.pos.z);
    }
    let n = 0;
    for (const t of this.tiles) {
      if (t.st !== UP || t.col === this.safe) continue;
      this.dropTile(t);
      n++;
      // dust off its four corners, bits of its colour
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        this.fx.burst(this.v.set(t.x + sx * TS * 0.45, -0.2, t.z + sz * TS * 0.45), 3, ["#f4ecff", "#d9c9ff", "#bba4ff"], { speed: 2, up: 1.4, gravity: 1.5, size: 0.2, life: 0.75, drag: 2.5 });
      this.fx.burst(this.v.set(t.x, -0.3, t.z), 4, [HUES[t.col].hex], { speed: 3.5, up: 2, gravity: 16, size: 0.22, life: 0.9 });
    }
    if (n) {
      this.cam.shake(0.55);
      sfx.thud();
      sfx.whoosh();
      rumble(0.7, 0.4);
    }
  }

  private endRound() {
    // whoever is still in the air over the void is gone
    for (let i = 0; i < 4; i++) {
      const q = this.pl[i];
      if (q.out) continue;
      if (q.falling || this.floorAt(q.a.pos.x, q.a.pos.z) === null) this.eliminate(i);
    }
    const alive: number[] = [];
    for (let i = 0; i < 4; i++) if (!this.pl[i].out) alive.push(i);
    for (const i of alive) {
      const q = this.pl[i];
      q.survived++;
      q.safePop = 1;
      q.a.cheer(0.9);
      this.fx.burst(this.v.copy(q.a.pos).setY(q.a.pos.y + 2.2), 10, [q.p.color, "#ffffff", "#ffd23f"], { speed: 4, up: 4, gravity: 9, size: 0.17, life: 0.75 });
      if (q.p.human) sfx.coin();
    }
    this.round++;
    if (alive.length <= 1 || this.round >= ROUNDS || this.gt > CAP) return this.finish();
    if (this.fellThisRound) this.say(T(`${alive.length} LEFT!`, `剩 ${alive.length} 人！`), "#ffffff", 1.0, 60);
    this.ph = "rise";
    this.pt = 0;
    // (the music hurries with the rounds, and for the last two)
    music.rate(this.round >= 7 || alive.length <= 2 ? 1.15 : this.round >= 4 ? 1.07 : 1);
    this.applyLayout(this.layout(this.round));
    if (this.round === ROUNDS - 1) this.say(T("FINAL ROUND!", "最后一轮！"), "#ffd23f", 1.1, 60);
    else if (this.round === 3) this.say(T("FASTER! +HOLES", "更快！有洞了"), "#ff8ce0", 1.1, 56);
    else if (this.round === 6) this.say(T("FASTER!", "更快！"), "#ff8ce0", 1.0, 64);
    [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.08, "triangle", 0.28, 0, 0.2 + k * 0.07));
  }

  private eliminate(i: number) {
    const q = this.pl[i];
    if (q.out) return;
    q.out = true;
    q.a.out = true;
    q.outRound = this.round;
    q.outIdx = this.outCount++;
    this.fellThisRound++;
    this.fx.burst(this.v.copy(q.a.pos).setY(q.a.pos.y + 1), 18, [q.p.color, "#ffffff", q.p.dark], { speed: 5, up: 3, gravity: 6, size: 0.22, life: 0.9 });
    this.stats.falls++;
    if (!q.falling) ((q.falling = true), (q.fallT = 0));
    // shoved into it: the shover's moment
    const by = q.by >= 0 && q.byT < 2.2 ? this.pl[q.by] : null;
    if (by) {
      this.stats.ringouts++;
      if (q.byOk) this.stats.decisive++;
      if (by.p.human) this.stats.ringoutsByHuman++;
      if (q.p.human) this.stats.humanRingedOut++;
      this.say(q.p.human ? T("SHOVED OFF!", "你被推下去了！") : T("SHOVED!", "推下去了！"), by.p.color, 0.9, 64);
      if (!by.out) by.a.cheer(1.2);
      if (by.p.human) sfx.star();
    }
    if (q.p.human) {
      this.say(T("YOU'RE OUT!", "你出局了！"), "#ff4a5a", 1.2, 66);
      sfx.lose();
    } else this.say(`${short(q.p)} ${T("OUT!", "出局！")}`, q.p.color, 0.95, 52);
    scream(q.p.human ? 1 : 0.85 + q.p.seat * 0.09);
    this.cam.shake(0.18);
  }

  /** The order: rounds survived; then (survivors) who was safe first, (the fallen) who was closer. */
  private rank() {
    return [0, 1, 2, 3].sort((a, b) => {
      const A = this.pl[a],
        B = this.pl[b];
      if (A.survived !== B.survived) return B.survived - A.survived;
      if (A.out !== B.out) return A.out ? 1 : -1;
      if (!A.out) return A.lastSafe - B.lastSafe || a - b;
      return A.outDist - B.outDist || B.outIdx - A.outIdx;
    });
  }

  private finish() {
    if (this.over) return;
    this.ph = "end";
    this.pt = 0;
    this.order = this.rank();
    this.over = this.order;
    // (the host's FINISH! takes the middle: the queue goes, the one up ends quick)
    this.bans.length = Math.min(1, this.bans.length);
    if (this.bans[0]) this.bans[0].d = Math.min(this.bans[0].d, this.bans[0].t + 0.4);
    const w = this.pl[this.order[0]];
    if (!w.out) {
      w.a.cheer(4);
      this.fx.burst(this.v.copy(w.a.pos).setY(w.a.pos.y + 2), 60, [w.p.color, "#ffd23f", "#ffffff", "#ff8ce0"], { speed: 8, up: 8, size: 0.24, life: 1.6 });
    }
    for (const q of this.pl) if (!q.out && q !== w) q.a.cheer(2);
  }

  /** Where each AI waits for the colour: the good ones near the middle (apart), the others where they are. */
  private chooseHomes() {
    const taken = new Set<number>();
    for (const q of this.pl) {
      q.ai.home = -1;
      if (q.out || q.p.human) continue;
      const s = q.p.skill;
      if (s < 0.4 && this.rnd() < 0.6) continue;
      let b = -1,
        bs = Infinity;
      for (let c = 0; c < this.NC; c++) {
        const t = this.tiles[c];
        if (t.st !== UP && t.st !== RISING) continue;
        if (taken.has(c)) continue;
        const v = Math.hypot(t.x, t.z) * lerp(0.3, 1, s) + Math.hypot(t.x - q.a.pos.x, t.z - q.a.pos.z) * 0.35 + this.rnd() * lerp(6, 1.5, s);
        if (v < bs) ((bs = v), (b = c));
      }
      if (b >= 0) (taken.add(b), (q.ai.home = b));
    }
  }

  // ---- the AIs ---------------------------------------------------------------------------------------

  /**
   * Dijkstra over the tiles up (8 ways; no corner cut past a hole): metres from `from`. On the belts
   * the rows slide past each other: a tile's neighbours are the ones next to it now, in its row and the
   * rows either side.
   */
  private paths(ai: Ai, from: number) {
    const { dist, prev } = ai;
    const NC = this.NC,
      NX = this.NX,
      T = this.tiles,
      belt = !!this.lv.belt;
    dist.fill(Infinity);
    prev.fill(-1);
    this.done.fill(0);
    ai.from = from;
    dist[from] = 0;
    for (let it = 0; it < NC; it++) {
      let u = -1,
        ud = Infinity;
      for (let c = 0; c < NC; c++) if (!this.done[c] && dist[c] < ud) ((ud = dist[c]), (u = c));
      if (u < 0) break;
      this.done[u] = 1;
      const ux = u % NX,
        uz = (u / NX) | 0;
      if (belt) {
        for (let nz = Math.max(0, uz - 1); nz <= Math.min(this.NZ - 1, uz + 1); nz++)
          for (let nx = 0; nx < NX; nx++) {
            const v = nz * NX + nx;
            if (v === u || !this.upT(T[v])) continue;
            const dx = T[v].x - T[u].x,
              dz = T[v].z - T[u].z;
            if (Math.abs(dx) > P * 1.5) continue;
            const w = Math.hypot(dx, dz);
            if (ud + w < dist[v]) ((dist[v] = ud + w), (prev[v] = u));
          }
        continue;
      }
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = ux + dx,
            nz = uz + dz;
          if (nx < 0 || nz < 0 || nx >= NX || nz >= this.NZ) continue;
          const v = nz * NX + nx;
          if (T[v].st !== UP) continue;
          if (dx && dz && (T[uz * NX + nx].st !== UP || T[nz * NX + ux].st !== UP)) continue;
          const w = (dx && dz ? 1.414 : 1) * P;
          if (ud + w < dist[v]) ((dist[v] = ud + w), (prev[v] = u));
        }
    }
  }

  /** How many others stand on or run to tile `c`. */
  private crowd(c: number, me: number) {
    let n = 0;
    for (let j = 0; j < 4; j++) {
      if (j === me) continue;
      const o = this.pl[j];
      if (o.out || o.falling) continue;
      if (this.cellOf(o.a.pos.x, o.a.pos.z) === c || (!o.p.human && o.ai.cell === c)) n++;
    }
    return n;
  }

  /** A spot on tile `c` away from the others there. */
  private spot(c: number, me: number, ai: Ai) {
    const t = this.tiles[c];
    const a = this.pl[me].a;
    let bx = t.x,
      bz = t.z,
      bs = -Infinity;
    for (let k = 0; k < 9; k++) {
      const ox = k === 0 ? 0 : Math.round(Math.cos((k * Math.PI) / 4)) * 0.68;
      const oz = k === 0 ? 0 : Math.round(Math.sin((k * Math.PI) / 4)) * 0.68;
      const x = t.x + ox,
        z = t.z + oz;
      let d = 3;
      for (let j = 0; j < 4; j++) {
        if (j === me) continue;
        const o = this.pl[j];
        if (o.out || o.falling) continue;
        d = Math.min(d, Math.hypot(o.a.pos.x - x, o.a.pos.z - z));
        if (!o.p.human && o.ai.cell === c) d = Math.min(d, Math.hypot(o.ai.tx - x, o.ai.tz - z) + 0.2);
      }
      // (the good ones like the middle: a shove there doesn't push them off)
      const v = d - Math.hypot(x - a.pos.x, z - a.pos.z) * 0.3 + (k === 0 ? lerp(0.15, 0.8, this.pl[me].p.skill) : 0) + this.rnd() * 0.2;
      if (v > bs) ((bs = v), (bx = x), (bz = z));
    }
    ai.tx = bx;
    ai.tz = bz;
    ai.ox = bx - t.x;
    ai.oz = bz - t.z;
  }

  private plan(i: number) {
    const q = this.pl[i],
      ai = q.ai,
      a = q.a,
      s = q.p.skill;
    const from = this.cellOf(a.pos.x, a.pos.z);
    this.paths(ai, from);
    const left = this.left();
    // the wrong colour first, for a moment
    if (ai.mistake > 0 && this.ph === "warn" && this.pt < ai.react + ai.mistake) {
      if (ai.cell < 0 || this.tiles[ai.cell].col === this.safe) {
        let b = -1,
          bd = Infinity;
        for (let c = 0; c < this.NC; c++) {
          const t = this.tiles[c];
          if (t.st !== UP || t.col === this.safe || c === from) continue;
          const d = ai.dist[c] + this.rnd() * 2;
          if (d < bd) ((bd = d), (b = c));
        }
        if (b >= 0) ((ai.cell = b), this.spot(b, i, ai));
      }
      return;
    }
    let best = -1,
      bc = Infinity,
      second = -1,
      sc2 = Infinity;
    const sp = SPEED * q.mult;
    const dark = !!this.lv.dark;
    for (let c = 0; c < this.NC; c++) {
      const t = this.tiles[c];
      if (t.st !== UP || t.col !== this.safe) continue;
      // (in the dark: only the ones it saw lit, or remembers)
      if (dark && !ai.know[c]) continue;
      let d = ai.dist[c];
      const direct = Math.hypot(t.x - a.pos.x, t.z - a.pos.z);
      if (ai.jumper) d = Math.min(d, direct * 1.08 + 0.6);
      if (!isFinite(d)) continue;
      // (to its near edge, not its middle)
      d = Math.max(0, d - 1.2);
      let cost = d + this.crowd(c, i) * lerp(0.6, 3.2, s);
      if (s > 0.45 && d / sp > left + 0.3) cost += 25;
      if (c === ai.cell) cost -= lerp(0.4, 1.4, s);
      if (c === from) cost -= 1;
      // (on the belts: not one the belt will tip off before the drop is over; the good ones look further)
      if (this.lv.belt && this.eaten(t, left + lerp(0.3, DROP + 0.6, s))) cost += lerp(6, 30, s);
      if (cost < bc) ((second = best), (sc2 = bc), (best = c), (bc = cost));
      else if (cost < sc2) ((second = c), (sc2 = cost));
    }
    if (best < 0) {
      // (nothing it knows of: it goes looking, in the spotlights)
      if (dark) ai.cell = -1;
      return;
    }
    let pick = best;
    if (ai.panic && second >= 0 && sc2 < bc + 5 && left > lerp(0.5, 1.1, s)) {
      ai.flip ^= 1;
      pick = ai.flip ? second : best;
    } else if (ai.cell < 0 && second >= 0 && this.rnd() < lerp(0.22, 0, s)) pick = second;
    else if (ai.panic && ai.cell >= 0 && this.tiles[ai.cell].col === this.safe && this.tiles[ai.cell].st === UP) pick = ai.cell;
    if (pick !== ai.cell) ((ai.cell = pick), this.spot(pick, i, ai));
    else {
      // still a good spot? (someone took it)
      for (let j = 0; j < 4; j++) {
        if (j === i) continue;
        const o = this.pl[j];
        if (!o.out && Math.hypot(o.a.pos.x - ai.tx, o.a.pos.z - ai.tz) < 0.7) {
          this.spot(pick, i, ai);
          break;
        }
      }
    }
  }

  /** The first gap (no tile up) on the way from (x0, z0) to (x1, z1): this.gapAt (m, -1: none), this.gapLen. */
  private lineGap(x0: number, z0: number, x1: number, z1: number) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(d / 0.3));
    this.gapAt = -1;
    this.gapLen = 0;
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      const solid = this.floorAt(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, false, true) !== null;
      if (!solid) {
        if (this.gapAt < 0) this.gapAt = d * f;
        this.gapLen += d / n;
      } else if (this.gapAt >= 0) break;
    }
    return this.gapAt >= 0;
  }

  /** Run to (tx, tz) at `k` of top speed: straight, over a short hole with a jump, or round by the path. */
  private steer(q: Pl, tx: number, tz: number, k: number, hop: boolean) {
    const a = q.a,
      ai = q.ai,
      mv = this.mv;
    let dx = tx - a.pos.x,
      dz = tz - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) return;
    if (this.lineGap(a.pos.x, a.pos.z, tx, tz)) {
      if (hop && ai.jumper && this.gapLen < 3.1) {
        if (a.grounded && this.gapAt < 0.7 + ai.jumpErr) mv.j = true;
      } else if (hop && ai.cell >= 0) {
        // round the hole: the next tile on the path
        const from = this.cellOf(a.pos.x, a.pos.z);
        if (from !== ai.from) this.paths(ai, from);
        let c = ai.cell,
          guard = 0;
        while (c >= 0 && ai.prev[c] !== from && ai.prev[c] >= 0 && guard++ < this.NC) c = ai.prev[c];
        if (c >= 0 && c !== from) {
          dx = this.tiles[c].x - a.pos.x;
          dz = this.tiles[c].z - a.pos.z;
        }
      } else return;
    }
    const l = Math.hypot(dx, dz) || 1;
    const sp = Math.min(1, d / 0.6) * k;
    mv.x = (dx / l) * sp;
    mv.z = (dz / l) * sp;
  }

  private think(i: number, dt: number) {
    this.think0(i, dt);
    if (this.lv.belt && this.ph !== "end") this.beltGuard(i);
  }

  /**
   * On the belts: the tile under it about to tip over the roller, it walks upstream (along its tile),
   * steps onto the next row (it runs the other way), or hops the gap upstream. The weak ones see it late.
   */
  private beltGuard(i: number) {
    const q = this.pl[i],
      a = q.a,
      s = q.p.skill,
      mv = this.mv;
    if (!a.grounded || q.knock > 0 || q.wind > 0 || q.lunge > 0) return;
    if (this.floorAt(a.pos.x, a.pos.z) === null || this.ft < 0) return;
    const t = this.tiles[this.ft];
    const dir = this.bdir[t.gz];
    const tip = this.tipIn(t);
    if (tip > lerp(0.75, 2.1, s) + (q.ai.panic ? -0.3 : 0)) return;
    // (still on the safe colour with the drop due before it goes: it stays)
    if ((this.ph === "warn" || this.ph === "shake") && t.col === this.safe && this.left() < tip - 0.15) return;
    if (this.floorAt(a.pos.x - dir * 1.5, a.pos.z) !== null) {
      mv.x = -dir;
      mv.z *= 0.3;
      return;
    }
    for (const dz of [P, -P])
      if (this.floorAt(a.pos.x - dir * 0.6, a.pos.z + dz) !== null) {
        mv.x = -dir * 0.4;
        mv.z = Math.sign(dz);
        return;
      }
    // (nothing to step onto: a hop over the gap upstream if there is ground past it, else it stays put)
    if (this.floorAt(a.pos.x - dir * 4, a.pos.z) !== null) {
      mv.x = -dir;
      mv.z = 0;
      mv.j = true;
    }
  }

  private think0(i: number, dt: number) {
    const q = this.pl[i],
      a = q.a,
      ai = q.ai,
      s = q.p.skill,
      mv = this.mv;
    mv.x = mv.z = 0;
    mv.j = false;
    const ph = this.ph;
    if (ph === "end") return;
    if (ph === "spin" || ph === "rise" || (ph === "warn" && this.pt < ai.react)) {
      // waiting for the colour: to a good spot (the good ones), a nervous hop now and then
      if (ph === "spin" && ai.home >= 0) {
        const t = this.tiles[ai.home];
        if (t.st === UP) this.steer(q, t.x, t.z, 0.5, false);
      }
      if (a.grounded && this.rnd() < dt * lerp(0.35, 0.04, s)) mv.j = true;
      return;
    }
    // to the colour (in the drop too: back onto its tile when shoved)
    ai.think -= dt;
    if (ai.think <= 0) {
      this.plan(i);
      ai.think = (ai.panic ? 0.38 : lerp(0.7, 0.28, s)) + this.rnd() * 0.22;
    }
    if (ai.cell < 0) {
      // in the dark with no safe tile it knows: into the nearest spotlight, to see
      if (this.lv.dark && (ph === "warn" || ph === "shake")) {
        let bx = 0,
          bz = 0,
          bd = Infinity;
        for (const b of this.bm) {
          const d = Math.hypot(b.x - a.pos.x, b.z - a.pos.z);
          if (d < bd) ((bd = d), (bx = b.x), (bz = b.z));
        }
        if (bd > 1.2) this.steer(q, bx, bz, lerp(0.6, 0.9, s), true);
      }
      return;
    }
    const t = this.tiles[ai.cell];
    // (a tile on a belt has moved: the spot on it with it)
    ai.tx = t.x + ai.ox;
    ai.tz = t.z + ai.oz;
    let tx = ai.tx,
      tz = ai.tz;
    const left = this.left();
    const safeNow = this.safeAt(a.pos.x, a.pos.z);
    // short of time: the nearest point of the tile (the good ones)
    if (!safeNow && left < lerp(0.4, 1.1, s) && t.col === this.safe) {
      tx = clamp(a.pos.x, t.x - TS / 2 + 0.5, t.x + TS / 2 - 0.5);
      tz = clamp(a.pos.z, t.z - TS / 2 + 0.5, t.z + TS / 2 - 0.5);
    }
    this.steer(q, tx, tz, 1, true);
    // the hop at the last moment, off a doomed tile toward the safe one
    if (!safeNow && a.grounded && left < ai.jumpAt && left > 0 && Math.hypot(tx - a.pos.x, tz - a.pos.z) < 4.6) mv.j = true;
  }

  // ---- the shove ----------------------------------------------------------------------------------

  /** The nearest rival within `range` in front of seat `i` along (ax, az) (cosine `cos`), or -1. */
  private inCone(i: number, ax: number, az: number, range: number, cos: number) {
    const a = this.pl[i].a;
    let best = -1,
      bd = range;
    for (let j = 0; j < 4; j++) {
      const o = this.pl[j];
      if (j === i || o.out || o.falling) continue;
      const dx = o.a.pos.x - a.pos.x,
        dz = o.a.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= bd || d < 1e-3 || (dx * ax + dz * az) / d < cos) continue;
      best = j;
      bd = d;
    }
    return best;
  }

  /** One snark's shove clock: the timers, the human's B or an AI's wish into a wind-up, the wind-up into the lunge. */
  private shoveStep(i: number, dt: number, play: boolean) {
    const q = this.pl[i],
      a = q.a,
      mv = this.mv;
    const was = q.cd;
    q.cd -= dt;
    if (q.p.human && was > 0 && q.cd <= 0 && !q.out) q.ready = 1;
    q.ready = Math.max(0, q.ready - dt * 2.5);
    q.guard -= dt;
    q.bbuf -= dt;
    q.byT += dt;
    if (q.knock > 0) {
      q.knock -= dt;
      mv.x = mv.z = 0;
      mv.j = false;
    }
    if (q.out || q.falling || !play) {
      q.wind = q.lunge = 0;
      return;
    }
    // (your A held from the air goes first: no wind-up started only to be let go by the hop)
    if (q.cd <= 0 && q.wind <= 0 && q.lunge <= 0 && q.knock <= 0 && q.rec <= 0 && a.grounded && !(mv.j && q.p.human)) {
      if (q.p.human && q.bbuf > 0) {
        // (the way you push, else the way you face)
        const l = Math.hypot(mv.x, mv.z);
        if (l > 0.2) this.windUp(i, mv.x / l, mv.z / l);
        else this.windUp(i, Math.sin(a.yaw), Math.cos(a.yaw));
      } else if (q.want >= 0) this.windUp(i, q.wx, q.wz);
    }
    if (q.wind > 0) {
      if (mv.j) {
        // (A lets the wind-up go: a hop instead)
        q.wind = 0;
        q.cd = 0.45;
        this.stats.cancels++;
      } else {
        mv.x *= 0.15;
        mv.z *= 0.15;
        q.wind -= dt;
        if (q.wind <= 0) this.lunge(i);
      }
    }
    if (q.lunge > 0) mv.j = false;
  }

  private windUp(i: number, ax: number, az: number) {
    const q = this.pl[i],
      a = q.a;
    // (a little help: the nearest rival in a cone round the aim)
    const j = this.inCone(i, ax, az, REACH + 1, 0.8);
    if (j >= 0) {
      const o = this.pl[j].a;
      const dx = o.pos.x - a.pos.x,
        dz = o.pos.z - a.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      ax = dx / l;
      az = dz / l;
    }
    q.sx = ax;
    q.sz = az;
    q.wind = WIND;
    q.bbuf = 0;
    q.want = -1;
    q.ai.evade = 0;
    this.stats.shoves++;
    tone(230, 0.22, "square", q.p.human ? 0.16 : 0.09, 2.4);
    // (one winding up at you: a warning blip)
    if (!q.p.human)
      for (const h of this.pl) {
        if (!h.p.human || h.out || h.falling) continue;
        const dx = h.a.pos.x - a.pos.x,
          dz = h.a.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < REACH + 0.8 && d > 1e-3 && (dx * ax + dz * az) / d > 0.7) (tone(1250, 0.05, "square", 0.2), tone(1250, 0.05, "square", 0.2, 0, 0.09));
      }
  }

  private lunge(i: number) {
    const q = this.pl[i],
      a = q.a;
    // (a last small correction toward the one in front)
    const j = this.inCone(i, q.sx, q.sz, REACH + 0.3, 0.966);
    if (j >= 0) {
      const o = this.pl[j].a;
      const dx = o.pos.x - a.pos.x,
        dz = o.pos.z - a.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      q.sx = dx / l;
      q.sz = dz / l;
    }
    q.wind = 0;
    q.lunge = LUNGE_T;
    q.cd = SHOVE_CD;
    q.glowK = 1;
    a.yaw = yawOf(q.sx, q.sz);
    q.arrow.rotation.y = a.yaw;
    this.fx.burst(this.v.set(a.pos.x - q.sx * 0.4, a.pos.y + 0.15, a.pos.z - q.sz * 0.4), 7, ["#ffffff", "#f1e8ff", q.p.color], { speed: 2.4, up: 1.2, gravity: 4, size: 0.18, life: 0.4, drag: 3 });
    sfx.whoosh();
  }

  /** A lunge meets seat j (n: from the shover to it): it slides off, flailing. */
  private landShove(i: number, j: number, nx: number, nz: number) {
    const A = this.pl[i],
      B = this.pl[j];
    // (along the lunge, a little along the line between them)
    let kx = A.sx * 0.7 + nx * 0.3,
      kz = A.sz * 0.7 + nz * 0.3;
    const kl = Math.hypot(kx, kz) || 1;
    kx /= kl;
    kz /= kl;
    B.vx = kx * KNOCK_V + B.vx * 0.2;
    B.vz = kz * KNOCK_V + B.vz * 0.2;
    if (B.a.grounded) {
      B.a.vy = 2.6;
      B.a.grounded = false;
    }
    B.knock = KNOCK_T;
    B.guard = GUARD_T;
    B.wind = B.lunge = B.rec = 0;
    // (up again, it may shove straight back)
    B.cd = Math.min(Math.max(B.cd, 0), KNOCK_T + 0.12);
    B.spin = (Math.random() < 0.5 ? -1 : 1) * 15;
    B.by = i;
    B.byT = 0;
    B.byOk = this.holds(B.a.pos.x, B.a.pos.z);
    B.mad = 2.2;
    B.ai.evade = 0;
    // (an AI looks again at once: back to safety)
    B.ai.think = 0;
    B.a.hit();
    A.lunge = 0;
    A.rec = 0.14;
    A.vx = A.sx * 1.2;
    A.vz = A.sz * 1.2;
    this.stats.hits++;
    if (A.p.human) this.stats.byHuman++;
    if (B.p.human) this.stats.onHuman++;
    const mx = A.a.pos.x + nx * CONTACT * 0.55,
      mz = A.a.pos.z + nz * CONTACT * 0.55,
      y = B.a.pos.y;
    this.fx.burst(this.v.set(mx, y + 1.05, mz), 20, ["#ffffff", "#ffe27a", B.p.color, A.p.color], { speed: 6.5, up: 3, size: 0.2, life: 0.55, gravity: 12, dir: this.v2.set(kx * 2.5, 0, kz * 2.5) });
    this.fx.burst(this.v.set(B.a.pos.x, y + 0.1, B.a.pos.z), 8, ["#ffffff", "#f1e8ff"], { speed: 3, up: 1, gravity: 4, size: 0.18, life: 0.45, drag: 3 });
    this.boomAt(mx, y + 0.06, mz, "#ffffff");
    this.pops.push({ x: B.a.pos.x, y: y + 3.6, z: B.a.pos.z, s: T("BONK!", "砰！"), c: A.p.color, t: 0 });
    sfx.hit();
    tone(150, 0.2, "triangle", 0.5, 0.45);
    tone(520, 0.08, "square", 0.22, 0.6, 0.02);
    this.cam.shake(A.p.human || B.p.human ? 0.32 : 0.14);
  }

  /** Two shoves meet: both bounce back, nobody flies. */
  private clash(i: number, j: number, nx: number, nz: number) {
    const A = this.pl[i],
      B = this.pl[j];
    for (let k = 0; k < 2; k++) {
      const q = k ? B : A,
        s = k ? 1 : -1;
      q.vx = nx * s * KNOCK_V * 0.7;
      q.vz = nz * s * KNOCK_V * 0.7;
      q.knock = 0.18;
      q.guard = 0.6;
      q.wind = q.lunge = q.rec = 0;
      q.cd = 0.8;
      q.spin = (Math.random() < 0.5 ? -1 : 1) * 5;
      q.mad = 1.5;
      q.a.hit();
    }
    this.stats.clashes++;
    const mx = (A.a.pos.x + B.a.pos.x) / 2,
      mz = (A.a.pos.z + B.a.pos.z) / 2,
      y = Math.max(A.a.pos.y, B.a.pos.y);
    this.fx.burst(this.v.set(mx, y + 1.1, mz), 28, ["#ffffff", "#ffe27a", "#fff3a8", A.p.color, B.p.color], { speed: 8, up: 4, size: 0.18, life: 0.6, gravity: 10 });
    this.boomAt(mx, y + 0.06, mz, "#ffe27a");
    this.pops.push({ x: mx, y: y + 3.4, z: mz, s: T("CLASH!", "对撞！"), c: "#ffe27a", t: 0 });
    tone(1568, 0.09, "square", 0.28);
    tone(2093, 0.16, "square", 0.22, 0, 0.05);
    sfx.hit();
    this.cam.shake(A.p.human || B.p.human ? 0.26 : 0.12);
  }

  /** A lunge into one just shoved (guarded): it bounces off. */
  private deflect(i: number, j: number, nx: number, nz: number) {
    const A = this.pl[i],
      B = this.pl[j];
    A.lunge = 0;
    A.rec = REC_T;
    A.vx = -nx * 1.5;
    A.vz = -nz * 1.5;
    this.fx.burst(this.v.set(A.a.pos.x + nx * 0.6, B.a.pos.y + 1, A.a.pos.z + nz * 0.6), 8, ["#ffffff", "#bfe8ff"], { speed: 4, up: 2, size: 0.14, life: 0.4 });
    tone(900, 0.06, "triangle", 0.2);
  }

  /** The ring of a hit on the floor. */
  private boomAt(x: number, y: number, z: number, c: string) {
    this.boom.position.set(x, y, z);
    this.boomM.color.set(c);
    this.boomT = 0;
  }

  /** The telegraph: the arrow on the floor and the glowing fists, through the wind-up, flaring in the lunge. */
  private tele(q: Pl, dt: number) {
    const a = q.a;
    q.glowK = q.lunge > 0 ? 1 : Math.max(0, q.glowK - dt * 5);
    const on = !q.out && !q.falling && (q.wind > 0 || q.glowK > 0.02);
    q.arrow.visible = on;
    q.fist.visible = on;
    if (!on) {
      if (a.ring) a.ring.scale.setScalar(1.5 * a.scale);
      return;
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 38);
    if (q.wind > 0) {
      const k = 1 - q.wind / WIND;
      // (it follows the shover through the wind-up, and stays where the lunge set off)
      q.arrow.position.set(a.pos.x, (a.grounded ? a.pos.y : (a.floor ?? a.pos.y)) + 0.035, a.pos.z);
      q.arrow.rotation.y = yawOf(q.sx, q.sz);
      q.arrow.scale.set(0.7 + 0.3 * k, 1, 0.5 + 0.5 * k);
      q.arrowM.opacity = 0.4 + 0.4 * k + 0.18 * pulse;
      q.inkM.opacity = 0.3 + 0.25 * k;
      q.fist.scale.setScalar(0.3 + 0.62 * k + 0.1 * pulse);
      // (its ring on the floor swells and tightens: charging)
      if (a.ring) a.ring.scale.setScalar(1.5 * a.scale * (1.9 - 0.75 * k + 0.12 * pulse));
      q.fistM.color.copy(q.tint).multiplyScalar(0.45 + 0.55 * k);
    } else {
      q.arrow.scale.set(1, 1, 1);
      q.arrowM.opacity = 0.95 * q.glowK;
      q.inkM.opacity = 0.5 * q.glowK;
      q.fist.scale.setScalar(0.12 + 0.8 * q.glowK);
      if (a.ring) a.ring.scale.setScalar(1.5 * a.scale);
      q.fistM.color.copy(q.tint).lerp(this.white, 0.45).multiplyScalar(q.glowK);
    }
  }

  /** Will a snark at (x, z) still have ground under it when it counts (the safe colour while it is called)? */
  private holds(x: number, z: number) {
    if (this.ph === "warn" || this.ph === "shake") return this.safeAt(x, z);
    return this.floorAt(x, z) !== null;
  }

  /** An AI and the shove: it sees one coming (a hop, a step aside, a shove back), and looks for one to give. */
  private aiShove(i: number, dt: number) {
    const q = this.pl[i],
      ai = q.ai,
      a = q.a,
      s = q.p.skill,
      mv = this.mv,
      ph = this.ph;
    if (q.knock > 0) return;
    // ---- a rival winding up at it: it reacts (late, or not at all, the weak ones)
    let th = -1;
    for (let j = 0; j < 4; j++) {
      const o = this.pl[j];
      if (j === i || o.out || o.falling || o.wind <= 0) continue;
      const dx = a.pos.x - o.a.pos.x,
        dz = a.pos.z - o.a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-3 || d > REACH + 0.7 || (dx * o.sx + dz * o.sz) / d < 0.75) continue;
      th = j;
    }
    if (th >= 0 && th !== ai.threat) {
      ai.threat = th;
      ai.dodgeT = lerp(0.3, 0.08, s) + this.rnd() * lerp(0.16, 0.05, s);
      ai.dodge = 0;
      if (this.rnd() < lerp(0.25, 0.85, s)) {
        const r = this.rnd();
        ai.dodge = q.cd <= 0 && s > 0.5 && r < 0.22 ? 3 : r < lerp(0.45, 0.7, s) ? 1 : 2;
      }
    } else if (th < 0 && ai.threat >= 0 && this.pl[ai.threat].lunge <= 0) ai.threat = -1;
    if (ai.threat >= 0 && ai.dodge) {
      ai.dodgeT -= dt;
      if (ai.dodgeT <= 0) {
        const o = this.pl[ai.threat];
        const how = ai.dodge;
        ai.dodge = 0;
        // (a step across the shove's line, to the side it is on already)
        const side = (a.pos.x - o.a.pos.x) * o.sz - (a.pos.z - o.a.pos.z) * o.sx >= 0 ? 1 : -1;
        const px = a.pos.x + o.sz * side * 1.3,
          pz = a.pos.z - o.sx * side * 1.3;
        const stepOk = s < 0.45 || this.holds(px, pz);
        const hopOk = s < 0.45 || this.holds(a.pos.x, a.pos.z);
        if (how === 3 && q.cd <= 0) {
          const dx = o.a.pos.x - a.pos.x,
            dz = o.a.pos.z - a.pos.z;
          const l = Math.hypot(dx, dz) || 1;
          q.want = ai.threat;
          q.wx = dx / l;
          q.wz = dz / l;
        } else if ((how === 1 && hopOk) || (how === 2 && !stepOk && hopOk)) {
          mv.j = true;
          mv.x *= 0.25;
          mv.z *= 0.25;
        } else if (stepOk) {
          ai.evade = 0.34;
          ai.ex = px;
          ai.ez = pz;
        }
      }
    }
    if (ai.evade > 0) {
      ai.evade -= dt;
      const dx = ai.ex - a.pos.x,
        dz = ai.ez - a.pos.z;
      const l = Math.hypot(dx, dz);
      if (l > 0.15) ((mv.x = dx / l), (mv.z = dz / l));
      else ai.evade = 0;
    }
    // ---- one to give: the rival it would push off what holds it, at the right time
    if (q.cd > 0 || q.wind > 0 || q.lunge > 0 || q.rec > 0 || !a.grounded || q.want >= 0 || ph === "end") return;
    ai.sCheck -= dt;
    if (ai.sCheck > 0) return;
    ai.sCheck = lerp(0.42, 0.14, s) + this.rnd() * 0.14;
    const timed = ph === "warn" || ph === "shake";
    // (its read of the time left: the weak ones misjudge it)
    const left = this.left() + (this.rnd() - 0.5) * lerp(0.9, 0.1, s);
    const mine = this.holds(a.pos.x, a.pos.z);
    let best = -1,
      bv = 0,
      bx = 0,
      bz = 0;
    for (let j = 0; j < 4; j++) {
      const o = this.pl[j];
      if (j === i || o.out || o.falling || o.guard > 0 || Math.abs(o.a.pos.y - a.pos.y) > 0.5) continue;
      // (where it will be once the wind-up is done, as well as it reads it)
      const lead = WIND * lerp(0.2, 1, s);
      const px = o.a.pos.x + o.vx * lead,
        pz = o.a.pos.z + o.vz * lead;
      const dx = px - a.pos.x,
        dz = pz - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > REACH - 0.15 || d < 0.4) continue;
      const nx = dx / d,
        nz = dz / d;
      const lx = px + nx * PUSH,
        lz = pz + nz * PUSH;
      const hitAt = WIND + Math.max(0, d - CONTACT) / LUNGE_V;
      let v: number;
      if (timed) {
        const after = left - hitAt;
        if (after < 0.04) continue;
        const onSafe = this.safeAt(px, pz);
        if (onSafe && !this.safeAt(lx, lz)) {
          // off the colour with no time to come back: that's the one
          const back = KNOCK_T + this.safeDist(lx, lz) / SPEED + 0.25;
          v = after < back ? 1 : 0.3 * clamp(1 - (after - back) / 1.2, 0, 1);
        } else if (!onSafe) v = after < 1.1 && this.safeDist(lx, lz) > this.safeDist(px, pz) + 0.3 ? 0.3 : 0.01;
        else v = 0.015;
      } else if (this.floorAt(px, pz) !== null && this.floorAt(lx, lz) === null) v = ph === "drop" ? 0.6 : 0.45;
      else v = 0.015;
      // its own risk: where the lunge leaves it, stopped by the hit or carried on by a miss
      const risky = mine && (!timed || left < 1.5);
      const hd = Math.max(0, d - CONTACT);
      if (risky && !this.holds(a.pos.x + nx * hd, a.pos.z + nz * hd)) v *= 1 - s;
      if (risky && !this.holds(a.pos.x + nx * WHIFF, a.pos.z + nz * WHIFF)) v *= lerp(0.85, 0.25, s);
      if (o.p.human) v *= lerp(0.7, 1, s);
      // (a grudge)
      if (q.by === j && q.byT < 3) v *= 1.4;
      else if (!ai.mood) v = Math.min(v, 0.015);
      if (v > bv) ((bv = v), (best = j), (bx = nx), (bz = nz));
    }
    if (best >= 0 && this.rnd() < bv * lerp(0.2, 0.72, s) * ai.aggro) ((q.want = best), (q.wx = bx), (q.wz = bz));
  }

  // ---- the frame -----------------------------------------------------------------------------------

  private players3(dt: number, input: Input | null) {
    const pl = this.pl;
    const play = this.ph !== "end";
    for (let i = 0; i < 4; i++) {
      const q = pl[i],
        a = q.a,
        mv = this.mv;
      mv.x = mv.z = 0;
      mv.j = false;
      q.want = -1;
      if (!q.out && !q.falling && play) {
        if (q.p.human) {
          if (input) {
            const ax = input.axis();
            const l = Math.hypot(ax.x, ax.y);
            mv.x = l > 1 ? ax.x / l : ax.x;
            mv.z = l > 1 ? ax.y / l : ax.y;
            // (A a moment before landing still jumps)
            if (input.pressed("a")) q.jbuf = JBUF;
            mv.j = q.jbuf > 0;
            if (input.pressed("b")) q.bbuf = 0.16;
          }
        } else {
          this.think(i, dt);
          this.aiShove(i, dt);
        }
      }
      q.jbuf -= dt;
      q.stun = Math.max(0, q.stun - dt);
      q.mad = Math.max(0, q.mad - dt);
      a.angry = q.mad > 0;
      this.shoveStep(i, dt, play);
      if (q.falling) {
        // no grip in the void
        const d = Math.exp(-1.5 * dt);
        q.vx *= d;
        q.vz *= d;
      } else if (q.lunge > 0) {
        q.vx = q.sx * LUNGE_V;
        q.vz = q.sz * LUNGE_V;
        q.lunge -= dt;
        if (q.lunge <= 0) ((q.rec = REC_T), this.stats.misses++);
      } else {
        // (a miss: it stumbles to a stop; shoved: it slides with hardly any grip)
        const sp = SPEED * q.mult * (q.rec > 0 ? 0.3 : 1);
        const tx = mv.x * sp,
          tz = mv.z * sp;
        const grip = q.knock > 0 ? 0.18 : q.stun > 0 ? 0.22 : q.rec > 0 ? 2.2 : 1;
        const acc = (a.grounded ? ACC : AIR_ACC) * grip * dt;
        const ex = tx - q.vx,
          ez = tz - q.vz;
        const el = Math.hypot(ex, ez);
        if (el <= acc) ((q.vx = tx), (q.vz = tz));
        else ((q.vx += (ex / el) * acc), (q.vz += (ez / el) * acc));
        q.rec = Math.max(0, q.rec - dt);
      }
      a.pos.x += q.vx * dt;
      a.pos.z += q.vz * dt;
      // (a step past the edge of a tile that still stands, the jump still goes: not off one that dropped)
      if (mv.j && !q.falling && (a.grounded || (q.coy < COYOTE && a.vy <= 0))) {
        a.grounded = true;
        a.jump(JUMP_V);
        q.jbuf = 0;
        q.coy = COYOTE;
        if (q.p.human) tone(660, 0.12, "square", 0.25, 1.6);
      }
    }
    // the shoves that land: on whoever is in front of a lunge (a clash if they shove back)
    for (let i = 0; i < 4; i++) {
      const A = pl[i];
      if (A.lunge <= 0 || A.out || A.falling) continue;
      for (let j = 0; j < 4; j++) {
        const B = pl[j];
        if (j === i || B.out || B.falling) continue;
        if (Math.abs(A.a.pos.y - B.a.pos.y) > 0.9) continue;
        const dx = B.a.pos.x - A.a.pos.x,
          dz = B.a.pos.z - A.a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > CONTACT || d < 1e-4 || (dx * A.sx + dz * A.sz) / d < 0.2) continue;
        if ((B.wind > 0 || B.lunge > 0) && -(dx * B.sx + dz * B.sz) / d > 0.5) this.clash(i, j, dx / d, dz / d);
        else if (B.guard > 0) this.deflect(i, j, dx / d, dz / d);
        else this.landShove(i, j, dx / d, dz / d);
        break;
      }
    }
    // the bumps
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const A = pl[i],
          B = pl[j];
        if (A.out || B.out || A.falling || B.falling) continue;
        if (Math.abs(A.a.pos.y - B.a.pos.y) > 1.1) continue;
        const dx = B.a.pos.x - A.a.pos.x,
          dz = B.a.pos.z - A.a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d >= PR * 2 || d < 1e-4) continue;
        const nx = dx / d,
          nz = dz / d;
        const o = Math.min((PR * 2 - d) / 2, PART_V * dt);
        A.a.pos.x -= nx * o;
        A.a.pos.z -= nz * o;
        B.a.pos.x += nx * o;
        B.a.pos.z += nz * o;
        const rv = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz;
        if (rv <= 0) continue;
        // (one sliding from a shove only nudges whoever it slides into: no bowling a whole tile off)
        const soft = A.knock > 0 || B.knock > 0;
        const imp = rv * (soft ? 0.3 : 0.6);
        A.vx -= nx * imp;
        A.vz -= nz * imp;
        B.vx += nx * imp;
        B.vz += nz * imp;
        if (rv > 4.2 && !soft) {
          // a proper bump: the one hit flies a little, both say ouch
          const av = Math.hypot(A.vx, A.vz),
            bv = Math.hypot(B.vx, B.vz);
          const hit = av < bv ? B : A;
          const k = hit === B ? 1 : -1;
          hit.vx += nx * 2.2 * k;
          hit.vz += nz * 2.2 * k;
          hit.stun = 0.28;
          hit.mad = 0.9;
          hit.a.hit();
          this.fx.burst(this.v.set(A.a.pos.x + dx / 2, A.a.pos.y + 1, A.a.pos.z + dz / 2), 8, ["#ffffff", "#ffe27a"], { speed: 4, up: 2, size: 0.16, life: 0.4 });
          if (A.p.human || B.p.human) (sfx.hit(), this.cam.shake(0.12));
        }
      }
    // the ground, the falls, the poses
    for (let i = 0; i < 4; i++) {
      const q = pl[i],
        a = q.a;
      if (!q.falling) {
        // (the grid's edge holds you: but not a belt's end, it runs off into the void)
        const lx = this.HX - 0.35,
          lz = this.HZ - 0.35;
        if (!this.lv.belt) {
          if (a.pos.x < -lx) ((a.pos.x = -lx), (q.vx = Math.max(0, q.vx)));
          if (a.pos.x > lx) ((a.pos.x = lx), (q.vx = Math.min(0, q.vx)));
        }
        if (a.pos.z < -lz) ((a.pos.z = -lz), (q.vz = Math.max(0, q.vz)));
        if (a.pos.z > lz) ((a.pos.z = lz), (q.vz = Math.min(0, q.vz)));
        if (this.lv.off) this.walls(q);
      }
      const wasAir = !a.grounded;
      const fl = q.falling && a.pos.y < -0.7 ? null : this.floorAt(a.pos.x, a.pos.z);
      // (riding a belt)
      if (this.lv.belt && fl !== null && this.ft >= 0 && a.grounded && !q.falling) a.pos.x += this.tiles[this.ft].vx * dt;
      a.physics(dt, fl, GRAV);
      // (the jump's grace runs from the last frame on a tile; a tile that drops or tips takes it away)
      if (a.grounded && this.ft >= 0) ((q.coy = 0), (q.last = this.ft));
      else q.coy = q.last >= 0 && this.solid(this.tiles[q.last]) ? q.coy + dt : COYOTE;
      if (wasAir && a.grounded && !q.falling) this.fx.burst(this.v.set(a.pos.x, a.pos.y + 0.1, a.pos.z), 6, ["#ffffff", "#f1e8ff"], { speed: 2, up: 1, gravity: 4, size: 0.16, life: 0.4, drag: 3 });
      if (!q.falling && !a.grounded && fl === null && a.pos.y < -0.45) {
        q.falling = true;
        q.fallT = 0;
        a.hit();
      }
      if (q.falling) {
        q.fallT += dt;
        this.pushOut(q);
        a.yaw += dt * 9;
        q.tumble.rotation.x -= dt * 5.5;
        q.tumble.rotation.z = Math.sin(this.time * 9 + i) * 0.3;
        q.tumble.scale.setScalar(1);
        if (!q.out && a.pos.y < -2.3) this.eliminate(i);
        if (!q.splashed && a.pos.y < SEA_Y + 1) {
          q.splashed = true;
          this.fx.burst(this.v.set(a.pos.x, SEA_Y + 1, a.pos.z), 26, ["#ff9be6", "#c79bff", "#ffffff"], { speed: 6, up: 9, gravity: 12, size: 0.35, life: 1.1 });
          tone(220, 0.3, "sine", 0.3, 3);
        }
        if (a.pos.y < SEA_Y - 3) a.root.visible = false;
      } else {
        // stand up again (a bump or a landing never leaves it tilted); the shove's poses: leaning back
        // in the wind-up, into the lunge, flailing back when shoved
        const lean = q.wind > 0 ? -0.36 : q.lunge > 0 ? 0.62 : q.knock > 0 ? -0.55 : q.rec > 0 ? 0.3 : 0;
        q.tumble.rotation.x += (lean - q.tumble.rotation.x) * Math.min(1, 16 * dt);
        if (q.knock > 0) q.tumble.rotation.z = Math.sin(this.time * 31 + i) * 0.32;
        else q.tumble.rotation.z *= Math.exp(-10 * dt);
        const sq = q.wind > 0 ? 1 - q.wind / WIND : 0;
        q.tumble.scale.set(1 + sq * 0.09, 1 - sq * 0.11 + (q.lunge > 0 ? 0.06 : 0), 1 + sq * 0.09);
        const sp = Math.hypot(q.vx, q.vz);
        if (q.knock > 0) {
          a.yaw += q.spin * dt;
          q.spin *= Math.exp(-3 * dt);
        } else if (q.wind > 0 || q.lunge > 0) a.face(yawOf(q.sx, q.sz), dt, 26);
        else if (sp > 0.6) a.face(yawOf(q.vx, q.vz), dt);
        else if (this.ph === "spin" || (this.ph === "warn" && !q.p.human && this.pt < q.ai.react)) a.face(Math.PI, dt, 4);
        else if (sp < 0.2 && (this.ph === "drop" || this.ph === "end" || this.safeAt(a.pos.x, a.pos.z))) a.face(0, dt, 3);
      }
      this.tele(q, dt);
      // safe since when (this round); a hop that lands safe after the drop counts, late
      if (this.ph === "drop" && !q.out && q.lastSafe === 99 && a.grounded && this.safeAt(a.pos.x, a.pos.z)) q.lastSafe = WARN[this.round] + SHAKE + this.pt;
      if (this.ph === "warn" || this.ph === "shake") {
        const on = !q.out && !q.falling && this.safeAt(a.pos.x, a.pos.z);
        if (on && q.safeSince < 0) {
          q.safeSince = (this.ph === "shake" ? WARN[this.round] : 0) + this.pt;
          if (q.p.human) tone(988, 0.06, "triangle", 0.25);
        } else if (!on) q.safeSince = -1;
      }
      // the bored AI on its safe tile: a wave, a hop
      if (!q.p.human && !q.out && this.ph === "warn" && this.safeAt(a.pos.x, a.pos.z) && this.left() > 1.2) {
        q.ai.fidget -= dt;
        if (q.ai.fidget <= 0) {
          q.ai.fidget = 2 + this.rnd() * 3;
          if (q.p.skill > 0.6) a.body.wave(1);
          else if (a.grounded) a.jump(6);
        }
      }
      q.safePop = Math.max(0, q.safePop - dt * 1.2);
      a.sync(dt, this.time);
      // (in the air the sun's shadow slides aside: the patch straight under the feet stays dark, it is where they land)
      if (a.shadow && !a.grounded) (a.shadow.material as THREE.MeshBasicMaterial).opacity = 1;
      if (q.marker) {
        q.marker.visible = !q.out;
        q.marker.position.y = 2.5 * SCALE + Math.sin(this.time * 4) * 0.1;
        q.marker.rotation.y = this.time * 2.2;
      }
    }
  }

  /** The stalls on the cut corners are walls: a snark (a circle) is pushed back out of them. */
  private walls(q: Pl) {
    const a = q.a,
      R = 0.45,
      NX = this.NX;
    const gx0 = Math.floor((a.pos.x + this.HX) / P),
      gz0 = Math.floor((a.pos.z + this.HZ) / P);
    const off = (gx: number, gz: number) => gx >= 0 && gz >= 0 && gx < NX && gz < this.NZ && this.offCell[gz * NX + gx] === 1;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const gx = gx0 + dx,
          gz = gz0 + dz;
        if (!off(gx, gz)) continue;
        const x0 = -this.HX + gx * P,
          x1 = x0 + P,
          z0 = -this.HZ + gz * P,
          z1 = z0 + P;
        const px = clamp(a.pos.x, x0, x1),
          pz = clamp(a.pos.z, z0, z1);
        let nx = a.pos.x - px,
          nz = a.pos.z - pz;
        const d = Math.hypot(nx, nz);
        if (d >= R) continue;
        if (d > 1e-4) {
          nx /= d;
          nz /= d;
          a.pos.x = px + nx * R;
          a.pos.z = pz + nz * R;
        } else {
          // (inside it: out by the nearest side that opens onto the floor)
          let best = Infinity;
          for (const [pen, sx, sz] of [
            [a.pos.x - x0, -1, 0],
            [x1 - a.pos.x, 1, 0],
            [a.pos.z - z0, 0, -1],
            [z1 - a.pos.z, 0, 1],
          ]) {
            if (off(gx + sx, gz + sz) || pen >= best) continue;
            best = pen;
            nx = sx;
            nz = sz;
          }
          if (nx) a.pos.x = (nx < 0 ? x0 : x1) + nx * R;
          else a.pos.z = (nz < 0 ? z0 : z1) + nz * R;
        }
        const vn = q.vx * nx + q.vz * nz;
        if (vn < 0) ((q.vx -= vn * nx), (q.vz -= vn * nz));
      }
  }

  /** A snark falling past a tile's side is pushed off it (no sinking into a tile). */
  private pushOut(q: Pl) {
    const a = q.a,
      NX = this.NX,
      belt = !!this.lv.belt;
    const c0 = this.cellOf(a.pos.x, a.pos.z);
    const gx0 = c0 % NX,
      gz0 = (c0 / NX) | 0;
    for (let gz = Math.max(0, gz0 - 1); gz <= Math.min(this.NZ - 1, gz0 + 1); gz++)
      for (let gx = belt ? 0 : Math.max(0, gx0 - 1); gx <= (belt ? NX - 1 : Math.min(NX - 1, gx0 + 1)); gx++) {
        const t = this.tiles[gz * NX + gx];
        if (!this.solid(t) || a.pos.y > t.y - 0.05 || a.pos.y < t.y - 1.8) continue;
        const ox = TS / 2 + 0.3 - Math.abs(a.pos.x - t.x);
        const oz = TS / 2 + 0.3 - Math.abs(a.pos.z - t.z);
        if (ox <= 0 || oz <= 0) continue;
        if (ox < oz) ((a.pos.x += Math.sign(a.pos.x - t.x || 1) * ox), (q.vx = 0));
        else ((a.pos.z += Math.sign(a.pos.z - t.z || 1) * oz), (q.vz = 0));
      }
  }

  private tiles3(dt: number) {
    for (const t of this.tiles) {
      t.t += dt;
      t.pop = Math.max(0, t.pop - dt * 3.2);
      t.bump = Math.max(0, t.bump - dt * 3);
      if (t.st === FALL) {
        t.vy -= 24 * dt;
        t.y += t.vy * dt;
        t.rx += t.wx * dt;
        t.rz += t.wz * dt;
        t.ry += t.wy * dt;
        t.dx += t.hx * dt;
        t.dz += t.hz * dt;
        if (t.y < SEA_Y + 1) {
          t.st = GONE;
          if (Math.random() < 0.5) this.fx.burst(this.v.set(t.x + t.dx, SEA_Y + 1, t.z + t.dz), 6, ["#ff9be6", "#c79bff"], { speed: 4, up: 6, gravity: 10, size: 0.4, life: 0.8 });
        }
      } else if (t.st === RISING) {
        if (t.t >= 0) {
          const k = Math.min(1, t.t / 0.5);
          // up from the void with a little overshoot
          const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
          t.y = -8 * (1 - e);
          if (k >= 1) {
            t.st = UP;
            t.y = 0;
            t.pop = 0.6;
            this.fx.burst(this.v.set(t.x, 0.1, t.z), 5, [HUES[t.col].hex, "#ffffff"], { speed: 2.5, up: 2.5, size: 0.2, life: 0.5 });
          }
        }
      } else if (t.st === UP && t.nc >= 0 && t.t >= 0) {
        t.col = t.nc;
        t.nc = -1;
        t.pop = 1;
        this.fx.burst(this.v.set(t.x, 0.2, t.z), 6, [HUES[t.col].hex, "#ffffff"], { speed: 3, up: 3, size: 0.2, life: 0.5 });
      }
    }
  }

  /** Every tile's pieces where they are, in their colour (shaking, flickering, popping). */
  private renderTiles() {
    const time = this.time;
    const n = this.decalN;
    n.fill(0);
    const shaking = this.ph === "shake";
    const sk = shaking ? this.pt / SHAKE : 0;
    const tremble = this.ph === "warn" ? clamp(1 - (WARN[this.round] - this.pt) / 0.6, 0, 1) * 0.3 : 0;
    const NC = this.NC,
      dark = !!this.lv.dark,
      W2 = (this.NX * P) / 2;
    for (let i = 0; i < NC; i++) {
      const t = this.tiles[i];
      if (t.st === GONE || t.st === HOLE || t.st === OFF || (t.st === RISING && t.t < 0)) {
        this.slab.setMatrixAt(i, ZERO);
        this.plate.setMatrixAt(i, ZERO);
        this.base.setMatrixAt(i, ZERO);
        this.ink.setMatrixAt(i, ZERO);
        this.ink.setMatrixAt(i + NC, ZERO);
        this.shine.setMatrixAt(i, ZERO);
        continue;
      }
      const doomed = t.st === UP && t.col !== this.safe && (shaking || tremble > 0);
      let ox = 0,
        oy = 0,
        oz = 0,
        rz = t.rz;
      if (doomed) {
        const k = shaking ? 0.35 + sk : tremble;
        ox = Math.sin(time * 53 + i * 1.7) * 0.085 * k;
        oz = Math.cos(time * 47 + i * 2.3) * 0.085 * k;
        rz += Math.sin(time * 41 + i) * 0.03 * k;
        oy = -0.06 * k;
      }
      // (on a belt: tipping over the roller at the end, or coming up over the one at the start)
      if (t.e > 0) {
        const dir = this.bdir[t.gz],
          tip = t.u > W2;
        rz += (tip ? -dir : dir) * t.e * 1.3;
        oy -= this.tipY(t);
        ox += (tip ? dir : -dir) * t.e * 0.5;
      }
      const s = 1 + t.pop * 0.08;
      oy += this.hop(t);
      this.e.set(t.rx, t.ry, rz);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(t.x + t.dx + ox, t.y - PIV + oy, t.z + t.dz + oz), this.q, this.sc.set(s, 1 + t.pop * 0.12, s));
      this.slab.setMatrixAt(i, this.m2.multiplyMatrices(this.m, L_SLAB));
      this.plate.setMatrixAt(i, this.m2.multiplyMatrices(this.m, L_PLATE));
      this.base.setMatrixAt(i, this.m2.multiplyMatrices(this.m, L_BASE));
      this.ink.setMatrixAt(i, this.m2.multiplyMatrices(this.m, L_SLAB_INK));
      this.ink.setMatrixAt(i + NC, this.m2.multiplyMatrices(this.m, L_BASE_INK));
      const d = this.decals[t.col];
      this.m2.multiplyMatrices(this.m, L_DECAL);
      if (dark) {
        // (in the dark: the symbol only shows where there is light, growing into it)
        const ds = clamp((this.lit[i] - 0.08) / 0.35, 0, 1);
        if (ds < 1) this.m2.multiply(this.m3.makeScale(ds, ds, 1));
        d.setColorAt(n[t.col], this.c3.copy(this.night).lerp(this.white, this.lit[i]));
      }
      d.setMatrixAt(n[t.col]++, this.m2);
      // its colour: the doomed ones dim and flicker in the shake, the safe ones glow
      const c = this.c.copy(this.cols[t.col]);
      if (doomed && shaking) c.lerp(this.dark, 0.25 + 0.3 * sk + Math.sin(time * 34 + i) * 0.12);
      else if (t.st === FALL) c.lerp(this.dark, 0.35);
      if (t.pop > 0) c.lerp(this.white, t.pop * 0.45);
      // (in the dark: a slate tile, its colour only where there is light)
      if (dark) c.lerp(this.night, 1 - this.lit[i]);
      this.plate.setColorAt(i, c);
      // (the gloss: brighter on a called tile's hop and a new colour's pop, none in the dark)
      this.shine.setMatrixAt(i, this.m2.multiplyMatrices(this.m, L_SHINE));
      const gk = (0.5 + t.bump * 0.5 + t.pop * 0.4) * (dark ? this.lit[i] : 1) * (t.st === FALL ? 0.4 : 1);
      this.shine.setColorAt(i, this.c3.setScalar(gk));
      this.slab.setColorAt(i, this.c2.copy(c).multiplyScalar(0.8));
    }
    for (let k = 0; k < this.decals.length; k++) {
      const d = this.decals[k];
      d.count = n[k];
      d.instanceMatrix.needsUpdate = true;
      if (dark && d.instanceColor) d.instanceColor.needsUpdate = true;
    }
    for (const m of this.tileMeshes) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** The big Z-Block: the roulette, the flip to the colour, the bar, a jolt at the drop. */
  private block3(dt: number) {
    const qb = this.qb,
      ph = this.ph,
      pt = this.pt;
    let face = -1;
    let rx = 0;
    let barK = 0;
    let jolt = 0;
    if (!this.live) {
      // (before GO: the Q, turning)
    } else if (ph === "spin") {
      const dur = this.round === 0 ? SPIN0 : SPIN;
      const fs = dur - FLIP;
      if (pt < fs) {
        // flicking through the colours, slowing
        const k = pt / fs;
        const idx = Math.floor(pt * lerp(14, 7, k));
        if (idx !== this.rouletteIdx) {
          this.rouletteIdx = idx;
          tone(1046 + (idx % 3) * 120, 0.03, "square", 0.16);
        }
        face = this.shuffle[idx % this.shuffle.length];
        if (face === this.safe && pt > fs - 0.12) face = this.shuffle[(idx + 1) % this.shuffle.length];
      } else {
        const k = (pt - fs) / FLIP;
        rx = -Math.PI * 2 * (1 - Math.pow(1 - k, 3));
        face = k > 0.35 ? this.safe : this.shuffle[this.rouletteIdx % this.shuffle.length];
      }
    } else if (ph === "warn") {
      face = this.safe;
      barK = 1 - pt / WARN[this.round];
      jolt = Math.max(0, 1 - pt / 0.25) * 0.12;
    } else if (ph === "shake") {
      face = this.safe;
      qb.position.x = Math.sin(this.time * 60) * 0.12;
    } else if (ph === "drop") {
      face = this.safe;
      jolt = Math.max(0, 1 - pt / 0.3) * 0.18;
    } else if (ph === "rise") {
      const k = clamp(pt / 0.45, 0, 1);
      rx = Math.PI * 2 * (1 - Math.pow(1 - k, 3));
      face = k > 0.3 ? -1 : this.called;
    }
    if (ph !== "shake") qb.position.x = 0;
    qb.position.y = this.QB.y + Math.sin(this.time * 1.6) * 0.25;
    this.qMesh.rotation.x = rx;
    // (turning while idle; back to face you, the short way, when it calls)
    if (ph === "end" || !this.live) this.qYaw += dt * 1.2;
    else {
      const d = ((((Math.sin(this.time * 0.9) * 0.08 - this.qYaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
      this.qYaw += d * Math.min(1, dt * 8);
    }
    this.qMesh.rotation.y = this.qYaw;
    this.qMesh.scale.setScalar(QS * (1 + jolt));
    if (face !== this.faceNow) {
      this.faceNow = face;
      this.front.map = face < 0 ? qTex() : this.faces[face];
    }
    // the bar, emptying from the right
    const BW = BAR_W;
    const k = clamp(barK, 0, 1);
    this.fill.visible = k > 0.001;
    this.fill.scale.x = Math.max(0.001, BW * k);
    this.fill.position.x = -BW / 2 + (BW * k) / 2;
    this.fill.material = k < 0.25 && Math.floor(this.time * 10) % 2 ? glow("#ffffff") : this.fillMats[this.safe];
    this.bar.visible = ph === "warn" || ph === "shake";
    this.halo.rotation.z = this.time * 0.4;
    const hs = QS * 2.05 * (1 + Math.sin(this.time * 3) * 0.03 + jolt);
    this.halo.scale.set(hs, hs, 1);
    this.halo.position.y = qb.position.y;
    (this.halo.material as THREE.MeshBasicMaterial).color.copy(face >= 0 ? this.cols[face] : this.gold);
  }

  /** The decor's life (the level's scenery), the spotlights, the belts. */
  private ambient(dt: number) {
    this.decor.update(dt, this.time);
    this.lights3();
    this.belts3();
  }

  /** The play camera: high three-quarter over the grid, leaning a little toward you (or the survivors). */
  private goal(eye: THREE.Vector3, at: THREE.Vector3) {
    let fx = 0,
      fz = 0,
      n = 0;
    const h = this.pl?.find((q) => q.p.human && !q.out);
    if (h) ((fx = h.a.pos.x), (fz = h.a.pos.z), (n = 1));
    else
      for (const q of this.pl ?? [])
        if (!q.out) {
          fx += q.a.pos.x;
          fz += q.a.pos.z;
          n++;
        }
    if (n) ((fx /= n), (fz /= n));
    const EYE = this.EYE,
      AT = this.AT;
    eye.set(EYE.x + fx * 0.16, EYE.y, EYE.z + fz * 0.1);
    at.set(AT.x + fx * 0.22, AT.y, AT.z + fz * 0.14);
    // the drop: a push in
    let push = 0;
    if (this.ph === "shake") push = (this.pt / SHAKE) * 0.6;
    else if (this.ph === "drop") push = this.pt < 0.8 ? 0.6 + Math.min(1, this.pt / 0.2) * 0.4 : Math.max(0, 1 - (this.pt - 0.8) / 0.45);
    if (push) eye.lerp(at, 0.14 * push);
    if (this.ph === "end" && this.over) {
      const w = this.pl[this.over[0]];
      if (!w.out) {
        const k = Math.min(1, this.pt / 0.8);
        // (the winner low in the frame, under the host's FINISH!)
        at.lerp(this.v.copy(w.a.pos).setY(w.a.pos.y + 3.2), k * 0.85);
        eye.lerp(this.v.set(w.a.pos.x, w.a.pos.y + 8.5, w.a.pos.z + 11), k * 0.75);
      }
    }
  }

  idle(dt: number, phase: "card" | "count", k: number) {
    this.time += dt;
    if (phase === "card") this.cam.orbit(this.at.set(0, 1.5, -2.5), 0.55 + k * 0.2, 30, 14);
    else {
      this.goal(this.eye, this.at);
      this.cam.to(this.eye, this.at, dt, 3.2);
    }
    this.cam.apply(dt);
    for (const q of this.pl) {
      q.a.physics(dt, 0, GRAV);
      q.a.face(0, dt, 3);
      q.a.sync(dt, this.time);
      if (q.marker) {
        q.marker.position.y = 2.5 * SCALE + Math.sin(this.time * 4) * 0.1;
        q.marker.rotation.y = this.time * 2.2;
      }
    }
    this.light(dt);
    this.renderTiles();
    this.block3(dt);
    this.ambient(dt);
    this.fx.update(dt);
  }

  update(dt: number, input: Input) {
    if (!this.live) {
      // GO: the level's twist, said once
      if (this.lv.dark) this.say(T("LIGHTS OUT!", "熄灯！"), "#ffb35c", 1.1, 60);
      else if (this.lv.belt) this.say(T("BELTS ON!", "传送带启动！"), "#ffb52e", 1.1, 60);
    }
    this.live = true;
    this.time += dt;
    if (!this.over) this.step(dt);
    else this.pt += dt;
    this.beltStep(dt);
    this.light(dt);
    this.players3(dt, this.over ? null : input);
    this.tiles3(dt);
    this.renderTiles();
    this.block3(dt);
    this.ambient(dt);
    this.fx.update(dt);
    // the ring of a hit, the words over the heads
    this.boomT += dt;
    const bk = Math.min(1, this.boomT / 0.34);
    this.boom.visible = bk < 1;
    if (bk < 1) {
      const r = 0.7 + 2.6 * (1 - Math.pow(1 - bk, 3));
      this.boom.scale.set(r, r, 1);
      this.boomM.opacity = (1 - bk) * 0.9;
    }
    for (const p of this.pops) p.t += dt;
    if (this.pops.length && this.pops[0].t > 0.9) this.pops.shift();
    if (this.bans.length) {
      const b = this.bans[0];
      b.t += dt;
      if (b.t >= b.d) this.bans.shift();
    }
    this.goal(this.eye, this.at);
    this.cam.to(this.eye, this.at, dt, this.ph === "drop" ? 5 : 3);
    this.cam.apply(dt);
  }

  view() {
    return this.w;
  }

  draw(g: CanvasRenderingContext2D) {
    const cam = this.w.camera;
    // the name tags, nudged up where two would overlap (the nearer one keeps its spot)
    const ts = this.tagXY;
    for (let i = 0; i < 4; i++) {
      const q = this.pl[i];
      const s = toScreen(q.a.head(this.v), cam);
      ts[i].x = s.x;
      ts[i].y = s.y - (q.p.human ? 8 : 0);
      ts[i].on = s.on && !q.out && !q.falling;
    }
    const byY = this.tagOrd.sort((a, b) => ts[b].y - ts[a].y);
    for (let a = 1; a < 4; a++)
      for (let b = 0; b < a; b++) {
        const A = ts[byY[a]],
          B = ts[byY[b]];
        if (!A.on || !B.on) continue;
        if (Math.abs(A.x - B.x) < 62 && A.y > B.y - 24) A.y = B.y - 24;
      }
    for (let i = 0; i < 4; i++) {
      const q = this.pl[i];
      if (q.out || q.falling) continue;
      const s = ts[i];
      if (s.on) tag(g, q.p, s.x, s.y);
      if (s.on && q.p.human && !this.over) this.bPip(g, q, s.x, s.y);
      // a shove winding up: a "!" in its colour over the tag, growing
      if (s.on && q.wind > 0) {
        const k = 1 - q.wind / WIND;
        shout(g, "!", s.x, s.y - 27 - k * 5, 22 + k * 14 + Math.sin(this.time * 40) * 2, q.p.color);
      }
      // an AI's "!" when it sees the colour (a "?!" when it panics)
      if (!q.p.human && this.ph === "warn" && this.pt > q.ai.react && this.pt < q.ai.react + 0.45) {
        const k = (this.pt - q.ai.react) / 0.45;
        g.globalAlpha = Math.min(1, (1 - k) * 3);
        shout(g, q.ai.panic ? "?!" : "!", s.x + 20, s.y - 18 - k * 8, 26 + Math.sin(k * Math.PI) * 8, q.ai.panic ? "#ff8ce0" : "#ffd23f");
        g.globalAlpha = 1;
      }
      if (q.safePop > 0 && !this.over && q.p.human) {
        const k = 1 - q.safePop;
        g.globalAlpha = Math.min(1, q.safePop * 3);
        shout(g, T("SAFE!", "安全！"), s.x, s.y - 26 - k * 26, 18, "#8ee35b");
        g.globalAlpha = 1;
      }
    }
    for (const p of this.pops) {
      const s = toScreen(this.v.set(p.x, p.y + p.t * 1.3, p.z), cam);
      if (!s.on) continue;
      s.y = Math.max(s.y, 78);
      g.globalAlpha = clamp(1 - (p.t - 0.5) / 0.4, 0, 1);
      shout(g, p.s, s.x, s.y, 20 + Math.min(1, p.t * 9) * 6, p.c);
      g.globalAlpha = 1;
    }
    const vals = this.pl.map((q) => String(q.survived));
    const sub = this.pl.map((q) => {
      if (q.out) return T(`fell in round ${q.outRound + 1}`, `第 ${q.outRound + 1} 轮落下`);
      if ((this.ph === "warn" || this.ph === "shake") && this.safeAt(q.a.pos.x, q.a.pos.z)) return T("SAFE ✓", "安全 ✓");
      return T("rounds", "轮");
    });
    corners(g, this.players, vals, { out: this.pl.map((q) => q.out), sub });
    this.sign(g);
    if (this.bans.length) {
      const b = this.bans[0];
      banner(g, b.s, b.t / b.d, b.c, b.y, b.size);
    }
  }

  /**
   * Bottom middle: the round; while a colour is called, the colour itself (its name, its symbol on a
   * chip: never the hue alone) over a bar of it that runs out with the time.
   */
  private sign(g: CanvasRenderingContext2D) {
    const r = Math.min(this.over ? this.round - 1 : this.round, ROUNDS - 1);
    const fin = r === ROUNDS - 1;
    const timed = !this.over && (this.ph === "warn" || this.ph === "shake");
    const pw = 272,
      ph = 46,
      px = W / 2 - pw / 2,
      // (over the host's fast-forward pill once you are out)
      py = H - 14 - ph - (this.humanOut() ? 50 : 0),
      cy = py + ph / 2;
    rr(g, px, py + 3, pw, ph, 23);
    g.fillStyle = "rgba(6,3,18,0.35)";
    g.fill();
    rr(g, px, py, pw, ph, 23);
    g.fillStyle = "rgba(14,10,34,0.86)";
    g.fill();
    if (timed) {
      const h = HUES[this.safe];
      const k = this.ph === "warn" ? clamp(1 - this.pt / WARN[this.round], 0, 1) : 0;
      const blink = this.ph === "shake" && Math.floor(this.time * 12) % 2 === 1;
      g.save();
      rr(g, px + 4, py + 4, pw - 8, ph - 8, 19);
      g.clip();
      g.fillStyle = blink ? "#ffffff" : h.hex;
      g.fillRect(px + 4, py + 4, Math.max(40, (pw - 8) * k), ph - 8);
      g.restore();
      // the chip: the colour's own symbol, white on the colour, ringed
      const cx = px + 24;
      g.beginPath();
      g.arc(cx, cy, 16, 0, Math.PI * 2);
      g.fillStyle = "#ffffff";
      g.fill();
      g.beginPath();
      g.arc(cx, cy, 13.5, 0, Math.PI * 2);
      g.fillStyle = h.hex;
      g.fill();
      g.fillStyle = "#ffffff";
      symbol(g, this.safe, cx, cy + (this.safe === 2 ? 1 : 0), 8.5);
      g.fill();
      shout(g, T(`${h.en}!`, `${h.zh}！`), W / 2 + 6, cy + 1, 20, "#ffffff", "rgba(10,8,24,0.92)");
      text(g, `${r + 1}/${ROUNDS}`, px + pw - 16, cy + 1, 13, "rgba(255,255,255,0.92)", "right", 900);
    } else {
      const label = fin ? T("FINAL ROUND", "最后一轮") : T(`ROUND ${r + 1} / ${ROUNDS}`, `第 ${r + 1} / ${ROUNDS} 轮`);
      text(g, label, W / 2, cy + 1, 17, fin ? "#ffd23f" : "#ffffff", "center", 900);
    }
    rr(g, px, py, pw, ph, 23);
    g.strokeStyle = fin ? "#ffd23f" : "rgba(255,255,255,0.22)";
    g.lineWidth = fin ? 2.5 : 1.5;
    g.stroke();
  }

  /** Your B beside your tag: filling while the shove comes back, lit (and a pop) once it is ready. */
  private bPip(g: CanvasRenderingContext2D, q: Pl, x: number, y: number) {
    g.font = `800 14px ${FONT}`;
    const px = x + (g.measureText(short(q.p)).width + 16) / 2 + 15;
    const ready = q.cd <= 0 && q.wind <= 0 && q.lunge <= 0;
    const r = 11 + q.ready * 5;
    g.beginPath();
    g.arc(px, y, r, 0, Math.PI * 2);
    g.fillStyle = "rgba(14,10,30,0.8)";
    g.fill();
    g.beginPath();
    if (ready) g.arc(px, y, r - 2.5, 0, Math.PI * 2);
    else {
      g.moveTo(px, y);
      g.arc(px, y, r - 2.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(1 - q.cd / SHOVE_CD, 0, 1));
      g.closePath();
    }
    g.fillStyle = ready ? q.p.color : "rgba(255,255,255,0.26)";
    g.fill();
    g.beginPath();
    g.arc(px, y, r, 0, Math.PI * 2);
    g.lineWidth = 2;
    g.strokeStyle = ready ? "#ffffff" : "rgba(255,255,255,0.3)";
    g.stroke();
    // (a touch screen's button shows the action, not a letter: the pip shows the same pictogram)
    const act = touchy() ? actsOf("tiles").b : undefined;
    if (act) actIcon(g, act, px, y, 14 + q.ready * 4, ready ? "#ffffff" : "rgba(255,255,255,0.55)");
    else text(g, "B", px, y + 1, 12 + q.ready * 4, ready ? "#ffffff" : "rgba(255,255,255,0.55)", "center", 900);
  }

  result() {
    return this.over;
  }

  /** You fell and the rivals play on: the host fast-forwards. */
  humanOut() {
    return !this.over && this.pl.some((q) => q.p.human && q.out) && this.pl.some((q) => !q.p.human && !q.out);
  }

  dispose() {
    // (the fists' glow rides on the snark, out of the scene once it goes)
    for (const q of this.pl) (q.a.dispose(), q.fistM.dispose());
    for (const t of this.faces) t.dispose();
    disposeScene(this.w.scene);
    if (import.meta.env.DEV) delete (window as unknown as { __tiles?: unknown }).__tiles;
  }
}

export const TILES: MiniDef = {
  key: "tiles",
  title: "SAFE BLOCK",
  titleZh: "安全方块",
  tag: "Stand on the colour the block calls, or drop into the void",
  tagZh: "站到方块喊出的颜色上，否则掉进虚空",
  help: "Arrows run, A jumps, B shoves a rival off. When the bar runs out, every other colour falls: last one standing wins.",
  helpZh: "方向键跑，A 跳，B 把对手推开。倒计时结束，其他颜色全部掉落：最后站着的人获胜。",
  pad: ["left", "right", "up", "down", "a", "b"],
  tap: false,
  color: "#8ee35b",
  song: "tense",
  ambience: "sea",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `tiles-${l.key}`, ...(l.song ? { song: l.song } : {}), ambience: l.ambience })),
  make: (players, rnd, variant) => new SafeBlock(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};
export default TILES;
