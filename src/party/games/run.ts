/**
 * CONSENSUS RUN (共识大冲关): ZK PARTY's obstacle-course race, the flagship of its obstacle-show
 * games. Four zkSNARKs race a transaction's trip to FINALITY, on one of three courses (run-levels/):
 *
 * - SKY CHAIN (sky.ts): by day, floating over ZStreet. Out of the MEMPOOL, through the PROOF CHECK (two
 *   walls of doors: only the valid proofs break open, and those glint now and then), across the
 *   GOSSIP SWEEP (two spinning bars to hop), down the EQUIHASH HAMMERS bridge (four pendulums that fling
 *   you off), over the FORK CHOICE (three seesaws that tip under the crowd), through the UNCLE BLOCKS
 *   (tiles that crumble, platforms that slide) and up the FINALITY CLIMB (belts, bumpers). Two risky
 *   shortcuts: the SIDECHAIN pillars beside the hammers and the BOOST pad at the foot of the climb.
 * - NIGHT MARKET (market.ts): a neon street over a canal. Its twist: rows of shop shutters that slam
 *   down on a beat (a lamp over each: green open, blinking amber about to drop, red shut); a pier
 *   under swinging lanterns, sampans drifting on the canal, spinning lazy-susan tables, the last call.
 * - LOW ORBIT (orbit.ts): above the Earth. Its twist: low gravity (floaty jumps over wide gaps, and a
 *   knock flings you far) and meteors that strike where a red ring glows.
 *
 * Arrows run (screen-relative), A jumps (A again in the air: a dive, for the extra reach), B shoves
 * whoever is in front of you. Fall off and you're back at the last checkpoint after a beat. Places go
 * by the finish; the first one home starts a 20-second HURRY; at the time cap the others rank by how
 * far they got.
 *
 * The AIs read the course by skill: they watch the doors glint and follow the ones already broken,
 * time the sweeps, hammers and shutters (wrongly sometimes, or lose patience), balance the seesaws,
 * track the sliding platforms, dodge the meteors' rings, take a shortcut when greedy, and shove; they
 * also hesitate, mistime jumps, and panic after a knock.
 *
 * The course runs along +s (world −z: away from the camera); x is across it.
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { music } from "../music";
import { FONT, H, HUD, W, backOut, clamp, fpx, grow, overPad, padAir, rr, sfx, shout, sound, text, type Input, type IntroShot, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { Avatar, CamRig, Fx3, GEO, banner, canvasTex, clock, corners, disposeScene, glow, label, mixHex, qTex, tag, toScreen, toonSteps, turn, world } from "../k3";
import { badge, keycap, padBtn, tint, touchy } from "../hud";
import { actWord, actsOf } from "../acts";
import { Bake, Pieces, TAU, cel, lit, stripeTex, type Level, type Sec, type ShutRow } from "./run-levels/kit";
import { SKY } from "./run-levels/sky";
import { MARKET } from "./run-levels/market";
import { ORBIT } from "./run-levels/orbit";

export const RUN_LEVELS: Level[] = [SKY, MARKET, ORBIT];

// ---- the feel ------------------------------------------------------------------------------------

/** Running: top speed, grip on the ground and in the air. (Gravity and the jump are the level's.) */
const SPEED = 6.5;
const ACC = 42;
const AIR_ACC = 16;
/** The dive (forward speed, the lift it gives). */
const DIVE_V = 9.8;
const DIVE_UP = 3.4;
/** The body: radius, height, the step it walks up, the edge it still stands on. */
const RB = 0.45;
const BODY_H = 1.5;
const STEP = 0.45;
const FOOT = 0.16;
/** The step the falls are tuned at: a jump is as high at any frame rate as it is at 60 a second. */
const H0 = 1 / 60;
/** A late jump off an edge still counts; an early press is kept for the landing. */
const COYOTE = 0.12;
const BUFFER = 0.16;
/** The shove (B): wait, lunge time and speed, reach, the knock it gives, the guard after one. */
const SHOVE_CD = 1.1;
const SHOVE_T = 0.2;
const LUNGE = 4.2;
const SHOVE_REACH = 1.5;
const SHOVE_V = 8;
const GUARD = 1.0;
/** How hard a tilted seesaw slides you down. */
const SLIDE = 0.9;
const SCALE = 1.1;
/** The AI's jumps, by how much of full speed it keeps in the air (shorter hops ease off). */
const AIR_F = [1, 0.62, 0.32];
const ESCAPE = [0, 1, -1, 2, -2, 3, -3, 4].map((k) => (k * Math.PI) / 4);
const WAIST = 0.85 * SCALE;

// ---- the race ------------------------------------------------------------------------------------

const CAP = 75;
const HURRY = 20;

const M_RUN = 0,
  M_TUMBLE = 1,
  M_DIVE = 2,
  M_BELLY = 3,
  M_FALL = 4,
  M_DONE = 5,
  M_DAZE = 6;
const K_FLOOR = 0,
  K_DOOR = 1,
  K_POST = 2,
  K_SEESAW = 3,
  K_TILE = 4,
  K_MOVER = 5,
  K_BOOST = 6,
  K_SHUT = 7,
  K_DISC = 8;

/** The PROOF CHECK's walls: five doors between posts across −7.25…7.25. */
const DOOR_W = 2.6;
const POST_W = 0.25;
const WALL_D = 0.8;
const WALL_H = 3.6;
const doorX = (k: number) => -7.25 + POST_W + DOOR_W / 2 + k * (DOOR_W + POST_W);
/** The sweeps' bar: its height, its radius. */
const BAR_Y = 0.55;
const BAR_R = 0.3;
/** The hammers hang 7.6 m from 8.8 m up and swing ±0.85 rad. */
const HAM_L = 7.6;
const HAM_Y = 8.8;
const HAM_AMP = 0.85;
const HEAD_X = 0.95;
const HEAD_Y = 0.95;
const HEAD_S = 1.05;
/** A tile shakes this long once stepped on, then drops; it's back after a while. */
const TILE_SHAKE = 1.0;
const TILE_BACK = 2.4;
/** The climb (from its pad, c0): the belts, their pull, the bumpers, the boost pad and its ledge. */
const BELTS = [
  [6.5, 13],
  [17, 23.5],
];
const BELT_V = -3.6;
const BUMPERS = [
  [-2.2, 10],
  [3.4, 15.5],
  [0.2, 20.5],
  [4.0, 25],
];
const BUMP_R = 0.8;
const BUMP_H = 1.5;
const BOOST = { x0: -7.2, x1: -4.8, s0: 4, s1: 5.4 };
const LEDGE_X = -6.1;
/** A shutter: how long it takes to drop and to roll back up (s); its lamp warns this long before. */
const SH_DROP = 0.3;
const SH_RISE = 0.55;
const SH_WARN = 1.0;
/** A meteor's rock: how high it starts. */
const MET_Y = 34;

// ---- the pieces ----------------------------------------------------------------------------------

interface Surf {
  x0: number;
  x1: number;
  s0: number;
  s1: number;
  /** Its top at s0 and s1 (a ramp when they differ). */
  y0: number;
  y1: number;
  /** Thickness (its bottom under the top). */
  th: number;
  /** A conveyor's pull along s (m/s). */
  belt: number;
  kind: number;
  ref: number;
  on: boolean;
}
interface Door {
  sf: Surf;
  wall: number;
  k: number;
  cx: number;
  real: boolean;
  /** 0 shut, 1 broken through, 2 found invalid. */
  st: number;
  ph: number;
  shake: number;
}
interface Sweeper {
  cx: number;
  cs: number;
  R: number;
  n: number;
  w: number;
  ang: number;
}
interface Hammer {
  s: number;
  T: number;
  ph: number;
  th: number;
  x: number;
  y: number;
  vx: number;
  side: number;
}
interface Seesaw {
  cx: number;
  s0: number;
  s1: number;
  hw: number;
  ang: number;
  av: number;
  g: THREE.Group;
  sf: Surf;
}
interface Tile {
  sf: Surf;
  x: number;
  s: number;
  y: number;
  /** 0 solid, 1 shaking, 2 falling, 3 gone (back after a while). */
  st: number;
  t: number;
  vy: number;
}
interface Mover {
  sf: Surf;
  c: number;
  per: number;
  ph: number;
  amp: number;
  hw: number;
  x: number;
  dx: number;
  lane: number;
}
interface Shutter {
  sf: Surf;
  row: number;
  k: number;
  cx: number;
  w: number;
  per: number;
  ph: number;
  open: number;
  /** How far up it is (1 open, 0 shut) and its bottom's height. */
  h: number;
  bot: number;
  closing: boolean;
}
interface Disc {
  sf: Surf;
  cx: number;
  cs: number;
  R: number;
  w: number;
  ang: number;
}
interface Meteor {
  on: boolean;
  x: number;
  s: number;
  /** The ground's height there, the time to the strike, the warning's length, the blast. */
  y: number;
  t: number;
  T: number;
  R: number;
  /** Which seats saw it coming (a bit each). */
  seen: number;
  /** Where the rock comes from (its slant). */
  ox: number;
  os: number;
}
/** A row across the course the camera may sit behind (a wall of doors, a row of shutters): it goes glassy on its own. */
interface Row {
  s: number;
  /** Its frame (posts, lintel), its panels (the doors, the shutters), their ink. */
  frame: THREE.MeshToonMaterial;
  panel: THREE.MeshToonMaterial;
  ink: THREE.MeshBasicMaterial;
  op: number;
  walls: Bake;
  p: Pieces | null;
  cast: THREE.Object3D[];
}
interface Bumper {
  x: number;
  s: number;
  y: number;
  pulse: number;
}

/** An AI's head (the scripted human of the bench uses one too). */
interface Brain {
  k: number;
  start: number;
  aggr: number;
  lane: number;
  /** The door picked in each wall (−1: not yet). */
  door: number[];
  sc1: boolean;
  sc1Off: boolean;
  sc2: boolean;
  aim: number;
  tol: number;
  rolled: number;
  wait: number;
  panic: number;
  px: number;
  ps: number;
  jerr: number;
  /** At an edge (its misjudgement drawn), coming in late, the air speed of the jump taken. */
  edge: boolean;
  late: number;
  airF: number;
  /** The jump taken: its way (the air follows it). */
  jumped: boolean;
  jx: number;
  js: number;
  dive: boolean;
  hamFor: number;
  hamErr: number;
  hamWait: number;
  hamBlind: boolean;
  swPrev: number;
  swLead: number;
  swSeen: boolean;
  bumpSeen: number;
  /** The shutters: the row being read, the gate picked, the misjudgement, the wait, the next look. */
  gRow: number;
  gate: number;
  gErr: number;
  gWait: number;
  gLook: number;
  gBlind: boolean;
  gGo: number;
  tx: number;
  ts: number;
  hold: boolean;
  lastBest: number;
  stuck: number;
  wasHit: boolean;
}

interface Runner {
  i: number;
  p: Player;
  a: Avatar;
  tum: THREE.Group;
  b: Brain;
  x: number;
  y: number;
  s: number;
  /** The run (what the legs do) and the knock (what was done to you). */
  cx: number;
  cs: number;
  kx: number;
  ks: number;
  vy: number;
  yaw: number;
  spd: number;
  grounded: boolean;
  air: number;
  surf: Surf | null;
  /** The last ground's height (the camera, the fall). */
  gy: number;
  mode: number;
  mt: number;
  dived: boolean;
  launched: boolean;
  jbuf: number;
  shoveT: number;
  shoveCd: number;
  arms: number;
  guard: number;
  imm: number;
  ghost: number;
  cp: number;
  best: number;
  bestT: number;
  fin: number;
  sec: number;
  spinV: number;
  /** The next puff of dust from the feet. */
  dust: number;
  /** The intent this frame: where (x, s), A, B. */
  ix: number;
  is: number;
  aP: boolean;
  bP: boolean;
  st: { falls: number; hits: number; bonks: number; doors: number; shoves: number; sc1: boolean; sc2: boolean; fallAt: number[]; hitBy: string[] };
}

// ---- small helpers -------------------------------------------------------------------------------

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Color();
const INKC = "#1a1033";
const GLINT = new THREE.Color("#a8ffe0");
const WHITE = new THREE.Color("#ffffff");
const DOOR_COLS = ["#ff6b35", "#c4b1fc", "#3ec6ff", "#ff5fa2", "#8ee35b"];
/** A shutter's lamp: open, about to drop (blinking with the dark one), shut. */
const LAMP_GO = new THREE.Color("#3dff7a");
const LAMP_WARN = new THREE.Color("#ffb02e");
const LAMP_OFF = new THREE.Color("#5a3a10");
const LAMP_STOP = new THREE.Color("#ff2d4a");
const _c2 = new THREE.Color();

/** A falling snark's scream: a wobbling slide whistle down. */
function scream(pitch = 1, vol = 0.2) {
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
  o.frequency.setValueAtTime(980 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(150 * pitch, t + 1.1);
  lfo.frequency.value = 13;
  lg.gain.value = 50 * pitch;
  lfo.connect(lg).connect(o.frequency);
  f.type = "lowpass";
  f.frequency.value = 2300;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
  g.gain.setValueAtTime(vol, t + 0.65);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
  o.connect(f).connect(g).connect(bus);
  o.start(t);
  lfo.start(t);
  o.stop(t + 1.2);
  lfo.stop(t + 1.2);
}
/** A short synth note (a boing, a yelp). */
function note(f0: number, f1: number, dur: number, type: OscillatorType, vol: number) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const boing = (k = 1) => note(190 * k, 720 * k, 0.22, "sine", 0.45);
const hop = () => note(420, 820, 0.09, "triangle", 0.18);
const honk = () => (note(220, 150, 0.22, "square", 0.22), note(233, 160, 0.22, "sawtooth", 0.12));
const yelp = (k = 1) => note(700 * k, 1100 * k, 0.12, "square", 0.14);
/** A shutter starting down: a quick metal rattle. */
const rattle = () => (note(260, 120, 0.28, "square", 0.07), note(330, 140, 0.28, "sawtooth", 0.05));

// ---- the textures --------------------------------------------------------------------------------

function sigilTex() {
  return canvasTex(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = "#ffffff";
    // a mirrored 5×7 glyph with two eyes: a zkSNARK sigil, a valid proof's mark
    const bits = [0b101, 0b011, 0b110, 0b101, 0b111, 0b010, 0b101];
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 3; x++)
        if ((bits[y] >> x) & 1) {
          g.fillRect(8 + x * 8, 4 + y * 8, 7, 7);
          g.fillRect(8 + (4 - x) * 8, 4 + y * 8, 7, 7);
        }
    g.clearRect(16, 20, 7, 7);
    g.clearRect(40, 20, 7, 7);
  });
}
function crossTex() {
  return canvasTex(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = "#ffffff";
    g.lineCap = "round";
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(12, 12);
    g.lineTo(52, 52);
    g.moveTo(52, 12);
    g.lineTo(12, 52);
    g.stroke();
  });
}
function beltTex() {
  const t = canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = "#2a2440";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#3a3358";
      for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 2, 128);
      // chevrons pointing down the slope (toward +v… the texture scrolls)
      g.fillStyle = "#ffcf3a";
      for (const y0 of [12, 76]) {
        g.beginPath();
        g.moveTo(16, y0);
        g.lineTo(64, y0 + 30);
        g.lineTo(112, y0);
        g.lineTo(112, y0 + 16);
        g.lineTo(64, y0 + 46);
        g.lineTo(16, y0 + 16);
        g.closePath();
        g.fill();
      }
    },
    true,
  );
  return t;
}
function checkerTex() {
  return canvasTex(
    128,
    32,
    (g) => {
      for (let x = 0; x < 16; x++)
        for (let y = 0; y < 4; y++) {
          g.fillStyle = (x + y) % 2 ? "#15101f" : "#ffffff";
          g.fillRect(x * 8, y * 8, 8, 8);
        }
    },
    true,
  );
}
function shadowTex() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, "rgba(0,0,0,0.5)");
    gr.addColorStop(0.6, "rgba(0,0,0,0.28)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}
/** A shop shutter: corrugated steel (white: the gate's colour tints it), a handle at its foot. */
function shutTex() {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 16) {
      g.fillStyle = "#b9b3cc";
      g.fillRect(0, y + 10, 128, 5);
      g.fillStyle = "#dcd8ea";
      g.fillRect(0, y + 7, 128, 3);
    }
    g.fillStyle = "#4a4560";
    g.fillRect(46, 228, 36, 9);
  });
}
/** The bar at a shutter's foot (the edge that hits): black and yellow chevrons. */
function hazardTex() {
  return canvasTex(
    128,
    32,
    (g) => {
      g.fillStyle = "#ffd23f";
      g.fillRect(0, 0, 128, 32);
      g.fillStyle = "#1a1033";
      for (let x = -32; x < 160; x += 32) {
        g.beginPath();
        g.moveTo(x, 32);
        g.lineTo(x + 16, 32);
        g.lineTo(x + 48, 0);
        g.lineTo(x + 32, 0);
        g.closePath();
        g.fill();
      }
    },
    true,
  );
}
/** A lazy-susan table's top: lacquer, a ring of plates, arrows round the rim the way it turns. */
function discTex(ccw: boolean) {
  return canvasTex(256, 256, (g) => {
    g.translate(128, 128);
    if (!ccw) g.scale(-1, 1);
    g.fillStyle = "#ffd23f";
    g.beginPath();
    g.arc(0, 0, 128, 0, TAU);
    g.fill();
    // dark lacquer, a gold ring, the turning centre
    g.fillStyle = "#5a1426";
    g.beginPath();
    g.arc(0, 0, 104, 0, TAU);
    g.fill();
    g.strokeStyle = "#e0a93a";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(0, 0, 96, 0, TAU);
    g.stroke();
    g.fillStyle = "#e0a93a";
    g.beginPath();
    g.arc(0, 0, 40, 0, TAU);
    g.fill();
    g.fillStyle = "#7a1c30";
    g.beginPath();
    g.arc(0, 0, 32, 0, TAU);
    g.fill();
    // the plates
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(Math.cos(a) * 70, Math.sin(a) * 70, 17, 0, TAU);
      g.fill();
      g.fillStyle = ["#ff9a52", "#8ee35b", "#ffd23f"][i % 3];
      g.beginPath();
      g.arc(Math.cos(a) * 70, Math.sin(a) * 70, 9, 0, TAU);
      g.fill();
    }
    // the arrows round the rim
    g.fillStyle = "#1a1033";
    for (let i = 0; i < 10; i++) {
      g.save();
      g.rotate((i / 10) * TAU);
      g.beginPath();
      g.moveTo(116, -14);
      g.lineTo(126, 2);
      g.lineTo(116, 18);
      g.lineTo(108, 18);
      g.lineTo(117, 2);
      g.lineTo(108, -14);
      g.closePath();
      g.fill();
      g.restore();
    }
  });
}

// ---- the game ------------------------------------------------------------------------------------

class Run implements Mini {
  private w: ReturnType<typeof world>;
  private fx: Fx3;
  private cam: CamRig;
  private rs: Runner[];
  private surfs: Surf[] = [];
  private doors: Door[] = [];
  private sweeps: Sweeper[] = [];
  private hams: Hammer[] = [];
  private saws: Seesaw[] = [];
  private tiles: Tile[] = [];
  private movers: Mover[] = [];
  private bumps: Bumper[] = [];
  private shutters: Shutter[] = [];
  private discs: Disc[] = [];
  private mets: Meteor[] = [];
  /** Each shower's time to its next rock. */
  private metT: number[] = [];
  /** The fixed floors (the islands the AI aims for). */
  private slabSurfs: Surf[] = [];
  /** The level's numbers: gravity, the jump, the climb's start (NaN: none), the finish, the stretches. */
  private g: number;
  private jv: number;
  private c0: number;
  private finS: number;
  private finY: number;
  private secs: Sec[];
  /** The rows the camera may sit behind (each fades alone: the next one ahead stays solid, to be read). */
  private doorRows: Row[] = [];
  private shutRows: Row[] = [];
  /** The ground's height where the camera looks (the sun's shadow map aims at it: shadows.ts). */
  private shY = 0;
  /** The level's scenery animations. */
  private tick: ((now: number, dt: number) => void) | null = null;
  /** The floor query's hit (no allocation). */
  private hit: Surf | null = null;
  /** Play time, the hazards' clock, the HUD's clock. */
  t = 0;
  private ht = 0;
  private clk = 0;
  private cap = CAP;
  private over: number[] | null = null;
  private done: number[] = [];
  private warned = false;
  private started = false;
  private banners: { s: string; t: number; dur: number; c: string; size: number; y: number }[] = [];
  private pops: { seat: number; s: string; t: number; c: string; big: boolean }[] = [];
  private hurt = 0;
  private flagHit: boolean[];
  // the camera's follow
  private camI = 0;
  private camX = 0;
  private camS = 0;
  private camY = 0;
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();
  // the moving pieces' looks
  private ink: THREE.MeshBasicMaterial;
  private pSigil!: Pieces;
  private pCross!: Pieces;
  private pArm!: Pieces;
  private pHamArm!: Pieces;
  private pHead!: Pieces;
  private pCap!: Pieces;
  private pShadow!: Pieces;
  private pTile!: Pieces;
  private pMover!: Pieces;
  private pHull: Pieces | null = null;
  private hullY = 0;
  private pBump!: Pieces;
  private pBumpTop!: Pieces;
  private pFlag!: Pieces;
  private pLamp!: Pieces;
  private pBar!: Pieces;
  private pPad!: Pieces;
  private pRing!: Pieces;
  private pMetFill!: Pieces;
  private pRock!: Pieces;
  private pTrail!: Pieces;
  private discTops: THREE.Object3D[] = [];
  private pArc!: Pieces;
  private belt: THREE.Texture | null = null;
  /** What feet kick up here. */
  private dust: string[] = ["#ffffff", "#e8e0d0"];
  private gate!: THREE.Mesh;
  private boostGlow: THREE.Mesh | null = null;
  private pArcOn = false;
  /** The bench's hooks: stats of the race. */
  stats: Runner["st"][] = [];

  constructor(
    private players: Player[],
    private rnd: Rnd,
    readonly L: Level,
  ) {
    const lk = L.look;
    this.w = world({ sky: lk.sky, fog: lk.fog, night: lk.night, fov: 55 });
    if (lk.hemi) {
      this.w.hemi.color.set(lk.hemi[0]);
      this.w.hemi.groundColor.set(lk.hemi[1]);
      this.w.hemi.intensity = lk.hemi[2];
    }
    if (lk.sun) {
      this.w.sun.color.set(lk.sun[0]);
      this.w.sun.intensity = lk.sun[1];
    }
    this.g = L.grav;
    this.jv = L.jumpV;
    this.c0 = L.climb ?? NaN;
    this.finS = L.fin.s;
    this.finY = L.fin.y;
    this.secs = L.secs;
    this.flagHit = L.cps.map(() => false);
    if (lk.dust) this.dust = lk.dust;
    const s = this.w.scene;
    this.ink = new THREE.MeshBasicMaterial({ color: INKC, side: THREE.BackSide });
    this.fx = new Fx3(s, 900);
    this.build();
    this.cam = new CamRig(this.w.camera);
    this.rs = players.map((p, i) => this.makeRunner(p, i));
    this.stats = this.rs.map((r) => r.st);
    // (the bench: &runat=S starts the four at the last checkpoint before S, to look at a stretch)
    const at = typeof location !== "undefined" ? /[?&]runat=([\d.]+)/.exec(location.search) : null;
    if (at) {
      let ci = 0;
      L.cps.forEach((c, i) => c.s <= Number(at[1]) && (ci = i));
      const c = L.cps[ci];
      for (const r of this.rs) {
        r.cp = ci;
        r.x = c.x0 + ((r.i + 0.5) / 4) * (c.x1 - c.x0);
        r.s = c.s;
        r.y = r.gy = c.y;
        r.best = c.s;
        r.b.lastBest = c.s;
      }
      this.camS = c.s;
      this.camY = c.y;
    }
    this.hazards(0);
    this.render(0);
    this.cardCam(0);
    this.cam.apply(0);
    // (the bench's scripted human: &runbot puts the game where its key-presser can read it)
    if (typeof location !== "undefined" && location.search.includes("runbot")) (window as unknown as { __run?: unknown }).__run = this;
  }

  // ---- building ------------------------------------------------------------------------------------

  private surf(x0: number, x1: number, s0: number, s1: number, y0: number, y1: number, kind = K_FLOOR, ref = -1, th = 1.2, belt = 0): Surf {
    const sf: Surf = { x0, x1, s0, s1, y0, y1, th, belt, kind, ref, on: true };
    this.surfs.push(sf);
    return sf;
  }

  private build() {
    const L = this.L;
    const lk = L.look;
    const sc = this.w.scene;
    const rnd = this.rnd;
    const slabs = new Bake();
    const tiles = new Bake();
    const deco = new Bake();
    const lights = new Bake();
    // (a row's own frame, panels and ink: see-through while the camera is behind it, and only it)
    const mkRow = (s: number, map?: THREE.Texture): Row => ({
      s,
      frame: cel({ transparent: true }),
      panel: cel(map ? { transparent: true, map } : { transparent: true }),
      ink: new THREE.MeshBasicMaterial({ color: INKC, side: THREE.BackSide, transparent: true }),
      op: 1,
      walls: new Bake(),
      p: null,
      cast: [],
    });

    // the floors: a thick slab, its top in checker tiles, a bright lip and little lights at the edge
    const tileUp = (x0: number, x1: number, s0: number, s1: number, y0: number, y1: number, sec: number) => {
      const [c1, c2f, side] = L.pal[sec];
      // (a calm floor: the two checker tones stand closer than the palette's, so what runs on it pops)
      const c2 = mixHex(c1, c2f, lk.tileK ?? 0.55);
      const len = s1 - s0;
      const rise = y1 - y0;
      const ang = Math.atan2(rise, len);
      const Ln = Math.hypot(len, rise);
      const ym = (y0 + y1) / 2;
      const zm = -(s0 + s1) / 2;
      // the slab (its top 0.08 under the tiles), thick, its sides the stretch's dark
      const th = lk.slabTh;
      slabs.box(side, x1 - x0, th, Ln, (x0 + x1) / 2, ym - 0.08 - (th / 2) * Math.cos(ang), zm - (th / 2) * Math.sin(ang), ang);
      const nx = Math.max(1, Math.round((x1 - x0) / 2.1));
      const ns = Math.max(1, Math.round(Ln / 2.1));
      const tw = (x1 - x0) / nx;
      const tl = Ln / ns;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ns; j++) {
          const f = (j + 0.5) / ns;
          const x = x0 + (i + 0.5) * tw;
          tiles.box((i + j) % 2 ? c1 : c2, tw - 0.1, 0.14, tl - 0.1, x, y0 + rise * f - 0.06, -(s0 + len * f), ang);
        }
      // the lips along the sides, lights on them
      for (const [lx, sgn] of [
        [x0, -1],
        [x1, 1],
      ]) {
        deco.box(tint(c1, -0.25), 0.22, 0.2, Ln, lx + sgn * 0.02, ym - 0.04, zm, ang);
        if (lk.lips)
          for (let k = 1.2; k < len - 0.6; k += 3.2) {
            const f = k / len;
            lights.box(this.secs[sec].c, 0.22, 0.22, 0.22, lx, y0 + rise * f + 0.14, -(s0 + k));
          }
      }
      // under it: two glowing thrusters (it floats)
      if (lk.thrusters && len > 6 && x1 - x0 > 4)
        for (const fx of [0.3, 0.7]) {
          const s = s0 + len * fx;
          deco.box("#54486e", 1.2, 0.8, 1.2, (x0 + x1) / 2, y0 + rise * fx - th - 0.3, -s);
          lights.box(lk.jet ?? "#ff9a52", 0.8, 0.5, 0.8, (x0 + x1) / 2, y0 + rise * fx - th - 0.9, -s);
        }
    };
    for (const [x0, x1, s0, s1, y0, y1, sec] of L.slabs) {
      this.slabSurfs.push(this.surf(x0, x1, s0, s1, y0, y1));
      tileUp(x0, x1, s0, s1, y0, y1, sec);
    }
    for (const [x0, x1, s0, s1, top] of L.solid ?? []) this.surf(x0, x1, s0, s1, top, top, K_POST, -1, top + 4);
    // the sidechain pillars: tall posts down into the void
    if (L.pillars) {
      const px = L.pillars.x;
      for (const s of L.pillars.s) {
        this.surf(px - 0.8, px + 0.8, s - 0.8, s + 0.8, 0.5, 0.5);
        slabs.box("#ff6b35", 1.6, 0.3, 1.6, px, 0.35, -s);
        slabs.box("#3a2f62", 1.2, 6, 1.2, px, -2.8, -s);
        lights.box("#ffd23f", 0.3, 0.3, 0.3, px, 0.62, -s);
      }
    }

    // ---- PROOF CHECK: walls of five doors between posts, a lintel with the sign
    // (each wall goes glassy while the camera is behind it and you're through it)
    if (L.walls) {
      for (let wi = 0; wi < L.walls.length; wi++) {
        const wl = L.walls[wi];
        const row = mkRow(wl.s);
        const walls = row.walls;
        this.doorRows.push(row);
        const real = new Set<number>();
        while (real.size < wl.real) real.add(Math.floor(rnd() * 5));
        for (let k = 0; k < 5; k++) {
          const cx = doorX(k);
          const sf = this.surf(cx - DOOR_W / 2, cx + DOOR_W / 2, wl.s, wl.s + WALL_D, WALL_H, WALL_H, K_DOOR, this.doors.length, WALL_H);
          this.doors.push({ sf, wall: wi, k, cx, real: real.has(k), st: 0, ph: rnd() * TAU, shake: 0 });
        }
        for (let k = 0; k <= 5; k++) {
          const px = -7.25 + POST_W / 2 + k * (DOOR_W + POST_W);
          this.surf(px - POST_W / 2, px + POST_W / 2, wl.s, wl.s + WALL_D, WALL_H, WALL_H, K_POST, -1, WALL_H);
          walls.box(lk.post, POST_W + 0.08, WALL_H + 0.6, WALL_D + 0.16, px, (WALL_H + 0.6) / 2, -(wl.s + WALL_D / 2));
        }
        walls.box(lk.post, 15.2, 0.7, WALL_D + 0.3, 0, WALL_H + 0.55, -(wl.s + WALL_D / 2));
        walls.box("#ffd23f", 15.2, 0.12, 0.1, 0, WALL_H + 0.55, -(wl.s - 0.12));
      }
      for (const row of this.doorRows) row.p = new Pieces(sc, GEO.box, row.panel, 5, 0.04, row.ink);
      this.pSigil = new Pieces(sc, GEO.plane, new THREE.MeshBasicMaterial({ map: sigilTex(), transparent: true, depthWrite: false }), this.doors.length);
      this.pCross = new Pieces(sc, GEO.plane, new THREE.MeshBasicMaterial({ map: crossTex(), transparent: true, depthWrite: false, color: "#ff2d4a" }), this.doors.length);
      this.doors.forEach((d) => this.doorRows[d.wall].p!.tint(d.k, DOOR_COLS[d.k]));
    }

    // ---- the shutters: rows of shop gates between posts, a box over them each one rolls into, a lamp
    if (L.shutters) {
      const shut = shutTex();
      L.shutters.forEach((row: ShutRow, ri) => {
        const fr = mkRow(row.s, shut);
        const walls = fr.walls;
        this.shutRows.push(fr);
        const gw = (row.x1 - row.x0 - POST_W * (row.n + 1)) / row.n;
        const ph0 = rnd();
        for (let k = 0; k < row.n; k++) {
          const cx = row.x0 + POST_W + gw / 2 + k * (gw + POST_W);
          const sf = this.surf(cx - gw / 2, cx + gw / 2, row.s, row.s + WALL_D, WALL_H, WALL_H, K_SHUT, this.shutters.length, 0);
          const per = row.beat ? row.per[0] : row.per[k % row.per.length] * (0.94 + rnd() * 0.12);
          const off = row.beat === "wave" ? -k / row.n : row.beat === "back" ? k / row.n : row.beat === "checker" ? (k % 2) * 0.5 : 0;
          const ph = row.beat ? (((ph0 + off) % 1) + 1) % 1 : rnd();
          this.shutters.push({ sf, row: ri, k, cx, w: gw, per, ph, open: row.open, h: 1, bot: WALL_H, closing: false });
        }
        for (let k = 0; k <= row.n; k++) {
          const px = row.x0 + POST_W / 2 + k * (gw + POST_W);
          this.surf(px - POST_W / 2, px + POST_W / 2, row.s, row.s + WALL_D, WALL_H, WALL_H, K_POST, -1, WALL_H);
          walls.box(lk.post, POST_W + 0.08, WALL_H + 0.9, WALL_D + 0.16, px, (WALL_H + 0.9) / 2, -(row.s + WALL_D / 2));
        }
        walls.box(lk.post, row.x1 - row.x0 + 0.3, 1.0, WALL_D + 0.5, (row.x0 + row.x1) / 2, WALL_H + 0.5, -(row.s + WALL_D / 2));
        walls.box("#ffd23f", row.x1 - row.x0 + 0.3, 0.1, 0.1, (row.x0 + row.x1) / 2, WALL_H + 1.02, -(row.s - 0.2));
      });
      // (a row's gates share a colour, pale: steel under a tint; the lamps say what they do)
      const sc5 = ["#ffc2dc", "#bfe6ff", "#ffe0a6", "#cdf5b4", "#ddd2ff"];
      L.shutters.forEach((row, ri) => {
        const p = (this.shutRows[ri].p = new Pieces(sc, GEO.box, this.shutRows[ri].panel, row.n, 0.04, this.shutRows[ri].ink));
        for (let k = 0; k < row.n; k++) p.tint(k, sc5[ri % sc5.length]);
      });
      // the lamp over each gate, the same light on the street in front of it, the hazard bar at its foot
      this.pLamp = new Pieces(sc, GEO.box, lit(1), this.shutters.length);
      this.pPad = new Pieces(sc, GEO.box, lit(0.5), this.shutters.length);
      this.pPad.mesh.userData.noShadow = true;
      this.pBar = new Pieces(sc, GEO.box, cel({ map: hazardTex() }), this.shutters.length, 0.03, this.ink);
    }

    // ---- the sweeps: hubs, their striped arms, the ring each one sweeps
    if (L.sweeps) {
      const armMat = new THREE.MeshToonMaterial({ map: stripeTex("#ff3d5a", "#ffffff", 10), gradientMap: toonSteps() });
      let arms = 0;
      for (const d of L.sweeps) {
        this.sweeps.push({ ...d, ang: rnd() * TAU });
        arms += d.n;
        slabs.box("#ff3d5a", 1.5, 1.4, 1.5, d.cx, 0.6, -d.cs);
        deco.box("#ffffff", 1.0, 0.3, 1.0, d.cx, 1.4, -d.cs);
        const ring = new THREE.Mesh(GEO.ring, glow("#ff3d5a", 0.45));
        ring.rotation.x = -Math.PI / 2;
        ring.scale.setScalar((d.R + 0.3) * 2.02);
        ring.position.set(d.cx, 0.03, -d.cs);
        ring.renderOrder = 2;
        sc.add(ring);
      }
      this.pArm = new Pieces(sc, GEO.cyl, armMat, arms, 0.05, this.ink);
    }

    // ---- the hammers: gantries over the bridge, arms, drum heads with caps, their shadows
    if (L.hams) {
      const [armC, headC, capC, gantry] = lk.ham ?? ["#cfd3e6", "#ff6b35", "#ffffff", "#3a3160"];
      for (const h of L.hams) {
        this.hams.push({ s: h.s, T: h.T, ph: h.ph, th: 0, x: 0, y: 0, vx: 0, side: 0 });
        for (const sx of [-9.8, 9.8]) slabs.box(gantry, 0.7, 13, 0.7, sx, HAM_Y - 4.6, -h.s);
        slabs.box(gantry, 20.3, 0.8, 0.9, 0, HAM_Y + 0.6, -h.s);
        deco.box(headC, 1.0, 0.7, 1.2, 0, HAM_Y, -h.s);
      }
      const n = this.hams.length;
      this.pHamArm = new Pieces(sc, GEO.box, cel(), n, 0.04, this.ink);
      for (let i = 0; i < n; i++) this.pHamArm.tint(i, armC);
      this.pHead = new Pieces(sc, GEO.cyl, cel(), n, 0.06, this.ink);
      for (let i = 0; i < n; i++) this.pHead.tint(i, headC);
      this.pCap = new Pieces(sc, GEO.cyl, cel({ map: qTex(), color: capC }), n * 2);
      this.pShadow = new Pieces(sc, GEO.plane, new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), n);
      this.pShadow.mesh.renderOrder = 2;
    }

    // ---- the seesaws: boards on fulcrums (each its own group: it tilts)
    if (L.saws) {
      const sawMat = cel({ color: "#a8386d" });
      const sawTop = cel({ map: stripeTex("#ff8cbf", "#ffc4de", 6) });
      const sawEdge = cel({ map: stripeTex("#ffd23f", "#1a1033", 10) });
      for (const d of L.saws) {
        const g = new THREE.Group();
        g.position.set(d.cx, 0, -(d.s0 + d.s1) / 2);
        sc.add(g);
        const len = d.s1 - d.s0;
        const board = new THREE.Mesh(GEO.box, sawMat);
        board.scale.set(d.hw * 2, 0.5, len);
        board.position.y = -0.25;
        g.add(board);
        const top = new THREE.Mesh(GEO.box, sawTop);
        top.rotation.y = Math.PI / 2;
        top.scale.set(len - 0.2, 0.06, d.hw * 2 - 0.2);
        top.position.y = -0.02;
        g.add(top);
        const ink = new THREE.Mesh(GEO.box, this.ink);
        ink.scale.set(d.hw * 2 + 0.1, 0.6, len + 0.1);
        ink.position.y = -0.25;
        g.add(ink);
        // the hazard stripes at the two ends that tip down
        for (const ex of [-1, 1]) {
          const st = new THREE.Mesh(GEO.box, sawEdge);
          st.scale.set(0.5, 0.08, len - 0.2);
          st.position.set(ex * (d.hw - 0.3), 0.0, 0);
          g.add(st);
        }
        // the fulcrum
        deco.box("#a8386d", 1.2, 2.4, len * 0.7, d.cx, -1.6, -(d.s0 + d.s1) / 2, 0, 0, Math.PI / 4);
        slabs.box("#54486e", 1.8, 0.6, len * 0.8, d.cx, -2.9, -(d.s0 + d.s1) / 2);
        const sf = this.surf(d.cx - d.hw, d.cx + d.hw, d.s0, d.s1, 0, 0, K_SEESAW, this.saws.length, 0.5);
        this.saws.push({ ...d, ang: 0, av: 0, g, sf });
      }
    }

    // ---- the tiles that crumble, the platforms that slide
    if (L.tiles) {
      const T2 = L.tiles.size / 2;
      for (const s of L.tiles.rows)
        for (const x of L.tiles.cols) {
          const sf = this.surf(x - T2, x + T2, s - T2, s + T2, 0, 0, K_TILE, this.tiles.length, 0.9);
          this.tiles.push({ sf, x, s, y: 0, st: 0, t: 0, vy: 0 });
        }
      this.pTile = new Pieces(sc, GEO.box, cel(), this.tiles.length, 0.04, this.ink);
      this.tiles.forEach((_, i) => this.pTile.tint(i, this.tileTone(i)));
    }
    if (L.lanes) {
      for (let li = 0; li < L.lanes.length; li++) {
        const ln = L.lanes[li];
        for (const c of ln.cs) {
          const sf = this.surf(c - ln.hw, c + ln.hw, ln.s0, ln.s1, 0, 0, K_MOVER, this.movers.length, 0.6);
          this.movers.push({ sf, c, per: ln.per, ph: ln.ph, amp: ln.amp, hw: ln.hw, x: c, dx: 0, lane: li });
        }
        // the rails they slide along (boats need none)
        if (!lk.hull) {
          deco.box(lk.post, 15.5, 0.25, 0.25, 0, -0.9, -(ln.s0 + 0.4));
          deco.box(lk.post, 15.5, 0.25, 0.25, 0, -0.9, -(ln.s1 - 0.4));
        }
      }
      const mc = lk.movers ?? ["#ffd23f", "#c4b1fc"];
      this.pMover = new Pieces(sc, GEO.box, cel(), this.movers.length, 0.05, this.ink);
      this.movers.forEach((m, i) => this.pMover.tint(i, mc[m.lane % mc.length]));
      if (lk.hull) {
        this.pHull = new Pieces(sc, GEO.box, cel({ color: lk.hull }), this.movers.length * 3, 0.05, this.ink);
        this.hullY = (L.water ?? -1.2) + 0.1;
      }
    }

    // ---- the turntables: a lacquered top that turns (its own group), its drum, its post
    if (L.discs) {
      const side = cel({ color: "#7a1426" });
      const tops = [cel({ map: discTex(true) }), cel({ map: discTex(false) })];
      for (const d of L.discs) {
        const sf = this.surf(d.cx - d.R, d.cx + d.R, d.cs - d.R, d.cs + d.R, 0, 0, K_DISC, this.discs.length, 0.6);
        this.discs.push({ ...d, sf, ang: rnd() * TAU });
        const drum = new THREE.Mesh(GEO.cyl, side);
        drum.scale.set(d.R * 2, 0.6, d.R * 2);
        drum.position.set(d.cx, -0.31, -d.cs);
        sc.add(drum);
        const ink = new THREE.Mesh(GEO.cyl, this.ink);
        ink.scale.set(d.R * 2 + 0.12, 0.66, d.R * 2 + 0.12);
        ink.position.copy(drum.position);
        sc.add(ink);
        const top = new THREE.Mesh(GEO.disc, tops[d.w > 0 ? 0 : 1]);
        top.rotation.x = -Math.PI / 2;
        top.scale.setScalar(d.R * 2);
        const g = new THREE.Group();
        g.position.set(d.cx, 0.005, -d.cs);
        g.add(top);
        sc.add(g);
        this.discTops.push(g);
        slabs.box(lk.post, 1.0, 6, 1.0, d.cx, -3.4, -d.cs);
      }
    }

    // ---- the meteors: a ring on the ground where one will strike, filling up; the rock; its trail
    if (L.meteors) {
      for (let i = 0; i < 8; i++) this.mets.push({ on: false, x: 0, s: 0, y: 0, t: 0, T: 1, R: 1, seen: 0, ox: 0, os: 0 });
      this.metT = L.meteors.map(() => 1.5 + rnd());
      this.pRing = new Pieces(sc, GEO.ring, glow("#ff3048", 0.9), 8);
      this.pRing.mesh.renderOrder = 3;
      this.pMetFill = new Pieces(sc, GEO.disc, glow("#ff5a3a", 0.35), 8);
      this.pMetFill.mesh.renderOrder = 3;
      this.pRock = new Pieces(sc, GEO.box, cel({ color: "#8a6f5a", emissive: 0x401808 }), 8, 0.06, this.ink);
      this.pTrail = new Pieces(sc, GEO.ball, glow("#ffb347", 0.8), 8 * 4);
      for (const m of [this.pRing, this.pMetFill, this.pRock, this.pTrail]) {
        for (let i = 0; i < m.n; i++) m.put(i, 0, -999, 0, 0, 0, 0);
        m.flush();
      }
    }

    // ---- the FINALITY CLIMB: the boost pad, belts, bumpers, the ledge's posts
    if (L.climb !== undefined) {
      const c0 = L.climb;
      const b0 = c0 + BOOST.s0,
        b1 = c0 + BOOST.s1;
      this.surf(BOOST.x0, BOOST.x1, b0, b1, 0.06, 0.06, K_BOOST, 0, 0.3);
      slabs.box("#a33d12", BOOST.x1 - BOOST.x0, 1.0, b1 - b0, (BOOST.x0 + BOOST.x1) / 2, -0.55, -(b0 + b1) / 2);
      deco.box("#ff6b35", BOOST.x1 - BOOST.x0 + 0.3, 0.12, b1 - b0 + 0.3, (BOOST.x0 + BOOST.x1) / 2, 0.01, -(b0 + b1) / 2);
      this.boostGlow = new THREE.Mesh(GEO.box, glow("#ffe36b"));
      this.boostGlow.scale.set(BOOST.x1 - BOOST.x0 - 0.5, 0.06, b1 - b0 - 0.5);
      this.boostGlow.position.set((BOOST.x0 + BOOST.x1) / 2, 0.08, -(b0 + b1) / 2);
      sc.add(this.boostGlow);
      // the boost's arc: dots showing where it throws you
      this.pArc = new Pieces(sc, GEO.ball, glow("#fff6b0"), 9);
      for (let i = 0; i < 9; i++) {
        const t = 0.08 + i * 0.085;
        this.pArc.put(i, LEDGE_X, 0.3 + 18 * t - 15 * t * t, -(b0 + 0.3 + 8.6 * t), 0.26, 0.26, 0.26);
      }
      this.pArc.flush();
      this.pArcOn = true;
      for (const [a, b] of BELTS) this.surf(-4.2, 6.2, c0 + a, c0 + b, this.ramp(c0 + a) + 0.03, this.ramp(c0 + b) + 0.03, K_FLOOR, -1, 0.3, BELT_V);
      this.belt = beltTex();
      this.belt.repeat.set(4, 3);
      const beltMat = new THREE.MeshToonMaterial({ map: this.belt, gradientMap: toonSteps() });
      for (const [a, b] of BELTS) {
        const s0 = c0 + a,
          s1 = c0 + b;
        const m = new THREE.Mesh(GEO.box, beltMat);
        const len = s1 - s0;
        const ang = Math.atan2(this.ramp(s1) - this.ramp(s0), len);
        m.scale.set(10.4, 0.08, Math.hypot(len, this.ramp(s1) - this.ramp(s0)));
        m.rotation.x = ang;
        m.position.set(1, (this.ramp(s0) + this.ramp(s1)) / 2 + 0.04, -(s0 + s1) / 2);
        sc.add(m);
        for (const ex of [-4.25, 6.25]) deco.box("#ffcf3a", 0.18, 0.18, len, ex, (this.ramp(s0) + this.ramp(s1)) / 2 + 0.09, -(s0 + s1) / 2, ang);
      }
      for (const [x, ds] of BUMPERS) this.bumps.push({ x, s: c0 + ds, y: this.ramp(c0 + ds), pulse: 0 });
      this.pBump = new Pieces(sc, GEO.cyl, cel(), this.bumps.length, 0.05, this.ink);
      this.pBumpTop = new Pieces(sc, GEO.cyl, glow("#ffffff"), this.bumps.length);
      this.bumps.forEach((b, i) => this.pBump.tint(i, i % 2 ? "#3ec6ff" : "#ff5fa2"));
      // (the ledge's posts, from under it down into the void)
      for (let s = c0 + 10; s < c0 + 28; s += 4.5) slabs.box("#3a2f62", 0.8, 8, 0.8, LEDGE_X, 4.6 + clamp((s - c0 - 8.6) / 19.4, 0, 1) * 1.4 - 5.4, -s);
    }
    // (the rows cast their shadows while they are solid: a see-through material would not on its own)
    for (const row of [...this.doorRows, ...this.shutRows]) {
      row.cast.push(row.walls.build(sc, GEO.box, row.frame, 0.04, row.ink).mesh, row.p!.mesh);
      for (const m of row.cast) m.castShadow = true;
    }

    // ---- the signs: an arch at each stretch with its name, the FINALITY gate
    for (const [s, x0, x1, y, en, zh, bg, h = 1.15, top = 8.1] of L.arches) {
      for (const px of [x0 - 0.7, x1 + 0.7]) slabs.box(lk.post, 0.6, top + 2, 0.6, px, y + top / 2 - 0.7, -s);
      slabs.box(lk.post, x1 - x0 + 2.0, 0.7, 0.7, (x0 + x1) / 2, y + top, -s);
      const lb = label(T(en, zh), h, "#ffffff", bg);
      lb.position.set((x0 + x1) / 2, y + top + 0.1, -s + 0.42);
      sc.add(lb);
    }
    // the finish line: a checker strip
    const F = L.fin;
    const fin = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: checkerTex(), polygonOffset: true, polygonOffsetFactor: -2 }));
    fin.rotation.x = -Math.PI / 2;
    fin.scale.set(F.x1 - F.x0, 1.6, 1);
    fin.position.set((F.x0 + F.x1) / 2, F.y + 0.03, -F.s);
    sc.add(fin);
    // the start gate: a bar that lifts at GO
    this.gate = new THREE.Mesh(GEO.box, cel({ map: stripeTex(lk.gate[0], lk.gate[1], 12) }));
    this.gate.scale.set(0.35, L.gateW, 0.35);
    this.gate.rotation.z = Math.PI / 2;
    this.gate.position.set(0, 1.0, -1.6);
    sc.add(this.gate);

    // ---- the checkpoint flags (they turn green once you've reached them)
    this.pFlag = new Pieces(sc, GEO.box, cel(), L.cps.length * 2);
    L.cps.forEach((cp, i) => {
      for (const side of [0, 1]) {
        const x = side ? cp.x1 + 1.4 : cp.x0 - 1.4;
        slabs.box("#ffffff", 0.14, 3.2, 0.14, x, cp.y + 1.6, -cp.s);
        this.pFlag.put(i * 2 + side, x + (side ? -0.55 : 0.55), cp.y + 2.85, -cp.s, 1.0, 0.6, 0.06);
        this.pFlag.tint(i * 2 + side, i === 0 ? "#8ee35b" : "#b8b3cc");
      }
    });
    this.pFlag.flush();

    // ---- the level's own dressing round the course
    const tick = L.scenery({ scene: sc, world: this.w, rnd, ink: this.ink, slabs, deco, lights, fx: this.fx });
    if (tick) this.tick = tick;

    slabs.build(sc, GEO.box, cel(), 0.05, this.ink);
    tiles.build(sc, GEO.box, cel());
    deco.build(sc, GEO.box, cel());
    lights.build(sc, GEO.box, lit(0.6));
  }

  /** The climb's ramp: its height at s (0 at its foot, 6 at the top). */
  private ramp(s: number) {
    return clamp(((s - this.c0 - 4) / 24) * 6, 0, 6);
  }
  private tileTone(i: number) {
    const tl = this.L.tiles!;
    return (i + Math.floor(i / tl.cols.length)) % 2 ? tl.colors[0] : tl.colors[1];
  }

  private makeRunner(p: Player, i: number): Runner {
    const sc = this.w.scene;
    const a = new Avatar(sc, p, { scale: SCALE, marker: p.human });
    const tum = new THREE.Group();
    tum.position.y = WAIST;
    a.root.add(tum);
    tum.add(a.body.root);
    a.body.root.position.y = -WAIST;
    const cp = this.L.cps[0];
    const x = cp.x0 + ((i + 0.5) / 4) * (cp.x1 - cp.x0);
    const k = clamp(p.skill, 0, 1);
    const rnd = this.rnd;
    const b: Brain = {
      k,
      start: 0.05 + rnd() * 0.4 * (1 - k),
      aggr: 0.6 + rnd() * 0.8,
      lane: rnd() * 2 - 1,
      door: [-1, -1],
      sc1: false,
      sc1Off: false,
      sc2: false,
      aim: 0,
      tol: 0.5,
      rolled: 0,
      wait: 0,
      panic: 0,
      px: 0,
      ps: 0,
      jerr: 0,
      edge: false,
      late: 0,
      airF: 1,
      jumped: false,
      jx: 0,
      js: 1,
      dive: false,
      hamFor: -1,
      hamErr: 0,
      hamWait: 0,
      hamBlind: false,
      swPrev: 0,
      swLead: 0.13,
      swSeen: true,
      bumpSeen: 0,
      gRow: -1,
      gate: -1,
      gErr: 0,
      gWait: 0,
      gLook: 0,
      gBlind: false,
      gGo: 0,
      tx: x,
      ts: 10,
      hold: false,
      lastBest: 0,
      stuck: 0,
      wasHit: false,
    };
    const r: Runner = {
      i,
      p,
      a,
      tum,
      b,
      x,
      y: 0,
      s: cp.s - 1,
      cx: 0,
      cs: 0,
      kx: 0,
      ks: 0,
      vy: 0,
      yaw: Math.PI,
      spd: p.human ? 1 : 0.9 + 0.1 * k,
      grounded: true,
      air: 0,
      surf: null,
      gy: 0,
      mode: M_RUN,
      mt: 0,
      dived: false,
      launched: false,
      jbuf: 0,
      shoveT: 0,
      shoveCd: 0,
      arms: 0,
      guard: 0,
      imm: 0,
      ghost: 0,
      cp: 0,
      best: 0,
      bestT: 0,
      fin: -1,
      sec: 0,
      spinV: 0,
      dust: 0,
      ix: 0,
      is: 0,
      aP: false,
      bP: false,
      st: { falls: 0, hits: 0, bonks: 0, doors: 0, shoves: 0, sc1: false, sc2: false, fallAt: [], hitBy: [] },
    };
    a.yaw = Math.PI;
    a.pos.set(r.x, r.y, -r.s);
    a.sync(0);
    return r;
  }

  // ---- the course's queries -----------------------------------------------------------------------

  private topOf(sf: Surf, x: number, s: number) {
    if (sf.kind === K_SEESAW) {
      const ss = this.saws[sf.ref];
      return (x - ss.cx) * Math.tan(ss.ang);
    }
    return sf.y0 === sf.y1 ? sf.y0 : sf.y0 + ((sf.y1 - sf.y0) * (s - sf.s0)) / (sf.s1 - sf.s0);
  }

  /** The highest ground at (x, s) no higher than `maxY` (−1e9: the void); its surface in `hit`. */
  private floor(x: number, s: number, maxY: number) {
    let best = -1e9;
    this.hit = null;
    for (const sf of this.surfs) {
      if (!sf.on || x < sf.x0 - FOOT || x > sf.x1 + FOOT || s < sf.s0 - FOOT || s > sf.s1 + FOOT) continue;
      if (sf.kind === K_DISC && !this.onDisc(sf, x, s, FOOT)) continue;
      const top = this.topOf(sf, clamp(x, sf.x0, sf.x1), clamp(s, sf.s0, sf.s1));
      if (top <= maxY && top > best) {
        best = top;
        this.hit = sf;
      }
    }
    return best;
  }

  /** A surface standing in the way of a body at height y (a wall, a door, a step too high). */
  private wall(x: number, s: number, y: number): Surf | null {
    for (const sf of this.surfs) {
      if (!sf.on || x < sf.x0 || x > sf.x1 || s < sf.s0 || s > sf.s1) continue;
      if (sf.kind === K_DISC && !this.onDisc(sf, x, s, 0)) continue;
      const top = this.topOf(sf, x, s);
      if (top > y + STEP && top - sf.th < y + BODY_H) return sf;
    }
    return null;
  }

  /**
   * The AI's look at the ground at (x, s), `ahead` seconds from now (the sliding platforms where
   * they'll be): its top, −1e9 for the void. Good eyes skip the tiles about to fall.
   */
  private look(x: number, s: number, ahead: number, k: number) {
    let best = -1e9;
    for (const sf of this.surfs) {
      if (!sf.on || s < sf.s0 - 0.05 || s > sf.s1 + 0.05) continue;
      let x0 = sf.x0,
        x1 = sf.x1;
      if (sf.kind === K_MOVER) {
        const m = this.movers[sf.ref];
        const nx = this.moverX(m, this.ht + ahead);
        x0 = nx - m.hw + 0.35;
        x1 = nx + m.hw - 0.35;
      } else if (sf.kind === K_TILE) {
        const tl = this.tiles[sf.ref];
        if (tl.st >= 2 || (tl.st === 1 && TILE_SHAKE - tl.t < 0.25 + 0.45 * k)) continue;
      } else if (sf.kind === K_DISC && !this.onDisc(sf, x, s, -0.3)) continue;
      if (x < x0 - 0.05 || x > x1 + 0.05) continue;
      const top = sf.kind === K_SEESAW ? this.topOf(sf, x, s) : this.topOf(sf, x, clamp(s, sf.s0, sf.s1));
      if (sf.kind === K_DOOR || sf.kind === K_POST || sf.kind === K_SHUT) {
        if (top > best) best = top;
        continue;
      }
      if (top > best) best = top;
    }
    return best;
  }

  private moverX(m: Mover, t: number) {
    return m.c + m.amp * Math.sin((t / m.per) * TAU + m.ph);
  }

  /** Within a turntable's round top (with a margin)? */
  private onDisc(sf: Surf, x: number, s: number, m: number) {
    const d = this.discs[sf.ref];
    const dx = x - d.cx,
      ds = s - d.cs;
    return dx * dx + ds * ds <= (d.R + m) * (d.R + m);
  }

  /** How far up a shutter is at time t (1 open, 0 shut): open, drop, shut, roll back up. */
  private shutH(sh: Shutter, t: number) {
    const u = (((t / sh.per + sh.ph) % 1) + 1) % 1;
    const o = sh.open,
      d = SH_DROP / sh.per,
      r = SH_RISE / sh.per;
    if (u < o) return 1;
    if (u < o + d) return 1 - (u - o) / d;
    if (u < 1 - r) return 0;
    return (u - (1 - r)) / r;
  }
  /** How long until it drops (−1: it's not open). */
  private shutLeft(sh: Shutter, t: number) {
    const u = (((t / sh.per + sh.ph) % 1) + 1) % 1;
    return u < sh.open ? (sh.open - u) * sh.per : -1;
  }

  private secOf(s: number) {
    let k = 0;
    for (let i = 0; i < this.secs.length; i++) if (s >= this.secs[i].s) k = i;
    return k;
  }

  // ---- the hazards ----------------------------------------------------------------------------------

  private hazards(dt: number) {
    const t = this.ht;
    for (const sw of this.sweeps) sw.ang += sw.w * dt;
    for (const h of this.hams) {
      const w = TAU / h.T;
      const ph = t * w + h.ph;
      h.th = HAM_AMP * Math.sin(ph);
      const dth = HAM_AMP * w * Math.cos(ph);
      h.x = HAM_L * Math.sin(h.th);
      h.y = HAM_Y - HAM_L * Math.cos(h.th);
      h.vx = HAM_L * Math.cos(h.th) * dth;
      // the whoosh as it sweeps the bridge's middle near you
      const side = h.x > 0 ? 1 : -1;
      if (side !== h.side) {
        h.side = side;
        const me = this.rs?.find((r) => r.p.human);
        if (me && Math.abs(me.s - h.s) < 9 && dt > 0 && this.started) sfx.whoosh();
      }
    }
    // the seesaws: the crowd's weight tips them; empty, they come back level
    for (const ss of this.saws) {
      let torque = 0;
      if (this.rs) for (const r of this.rs) if (r.grounded && r.surf === ss.sf) torque += r.x - ss.cx;
      const target = clamp(-torque * 0.055, -0.38, 0.38);
      ss.av += ((target - ss.ang) * 9 - ss.av * 3.2) * dt;
      ss.ang = clamp(ss.ang + ss.av * dt, -0.42, 0.42);
    }
    for (const m of this.movers) {
      const nx = this.moverX(m, t);
      m.dx = nx - m.x;
      m.x = nx;
      m.sf.x0 = nx - m.hw;
      m.sf.x1 = nx + m.hw;
    }
    for (const tl of this.tiles) {
      if (tl.st === 1) {
        tl.t += dt;
        if (tl.t > TILE_SHAKE) {
          tl.st = 2;
          tl.t = 0;
          tl.vy = 0;
          this.fx.burst(_v.set(tl.x, -0.3, -tl.s), 10, ["#7ec8ff", "#2f74ad", "#ffffff"], { speed: 3, up: 1, size: 0.25 });
        }
      } else if (tl.st === 2) {
        tl.vy -= this.g * 0.8 * dt;
        tl.y += tl.vy * dt;
        tl.sf.y0 = tl.sf.y1 = tl.y;
        if (tl.y < -3) tl.sf.on = false;
        if (tl.y < -40) ((tl.st = 3), (tl.t = 0));
      } else if (tl.st === 3) {
        tl.t += dt;
        if (tl.t > TILE_BACK) {
          tl.st = 0;
          tl.y = 0;
          tl.sf.y0 = tl.sf.y1 = 0;
          tl.sf.on = true;
          tl.t = 0;
        }
      }
    }
    for (const b of this.bumps) b.pulse = Math.max(0, b.pulse - dt * 3);
    for (const d of this.doors) d.shake = Math.max(0, d.shake - dt * 3);
    if (this.belt) this.belt.offset.y = (this.belt.offset.y - dt * 0.45) % 1;
    for (const d of this.discs) d.ang += d.w * dt;
    // the shutters: up, down on their beat (a rattle as one near you starts down, a clang at the foot)
    if (this.shutters.length) {
      const me = this.rs?.find((r) => r.p.human);
      for (const sh of this.shutters) {
        const h = this.shutH(sh, t);
        const was = sh.h;
        sh.closing = h < was - 1e-4;
        sh.h = h;
        sh.bot = h * WALL_H;
        sh.sf.th = WALL_H - sh.bot;
        sh.sf.on = sh.bot < BODY_H + 0.4;
        if (!this.started || dt <= 0 || Math.abs(this.camS - sh.sf.s0) > 14) continue;
        // (it hits the street: a clang of sparks and dust)
        if (was > 0 && h <= 0) {
          this.fx.burst(_v.set(sh.cx, 0.15, -(sh.sf.s0 - 0.2)), 7, ["#ffffff", "#cfc8e8", "#ffd23f"], { speed: 2.6, up: 1.2, size: 0.14, life: 0.4 });
          if (me && Math.abs(me.s - sh.sf.s0) < 11 && Math.abs(me.x - sh.cx) < 5) sfx.thud();
        }
        if (me && Math.abs(me.s - sh.sf.s0) < 11 && was >= 1 && h < 1) rattle();
      }
    }
    if (this.L.meteors && dt > 0) this.meteors(dt);
  }

  /** The meteor showers: a new strike now and then near someone (a ring warns), then the blast. */
  private meteors(dt: number) {
    const L = this.L;
    if (this.started && !this.over)
      L.meteors!.forEach((z, zi) => {
        this.metT[zi] -= dt;
        if (this.metT[zi] > 0) return;
        this.metT[zi] = z.every[0] + this.rnd() * (z.every[1] - z.every[0]);
        // (at someone in it, where they're heading, give or take; else nowhere)
        const in_ = this.rs.filter((r) => r.mode !== M_DONE && r.mode !== M_FALL && r.s > z.s0 - 2 && r.s < z.s1);
        if (!in_.length) return;
        const r = in_[Math.floor(this.rnd() * in_.length)];
        const lead = z.warn * (0.35 + this.rnd() * 0.5);
        const x = clamp(r.x + (r.cx + r.kx) * lead + (this.rnd() * 2 - 1) * 1.6, z.x0, z.x1);
        const s = clamp(r.s + (r.cs + r.ks) * lead + (this.rnd() * 2 - 1) * 1.6, z.s0, z.s1);
        const y = this.floor(x, s, 50);
        if (y < -1e8) return;
        const m = this.mets.find((q) => !q.on);
        if (!m) return;
        m.on = true;
        m.x = x;
        m.s = s;
        m.y = y;
        m.t = m.T = z.warn;
        m.R = z.R;
        m.ox = (this.rnd() * 2 - 1) * 10;
        m.os = -(8 + this.rnd() * 8);
        m.seen = 0;
        for (const q of this.rs) if (this.rnd() < 0.3 + 0.7 * q.b.k) m.seen |= 1 << q.i;
        const me = this.rs.find((q) => q.p.human);
        if (me && Math.abs(me.s - s) < 14) note(1400, 900, 0.18, "triangle", 0.08);
      });
    for (const m of this.mets) {
      if (!m.on) continue;
      m.t -= dt;
      if (m.t > 0) continue;
      m.on = false;
      this.blast(m);
    }
  }

  private blast(m: Meteor) {
    const at = _v.set(m.x, m.y + 0.4, -m.s);
    this.fx.burst(at, 34, ["#ffb347", "#ff5a3a", "#ffffff", "#8a6f5a"], { speed: 8, up: 6, size: 0.3 });
    const me = this.rs.find((q) => q.p.human);
    const near = !me || Math.abs(me.s - m.s) < 16;
    if (near) {
      sfx.thud();
      note(160, 40, 0.5, "sawtooth", 0.2);
      this.cam.shake(me && Math.hypot(me.x - m.x, me.s - m.s) < 6 ? 0.45 : 0.18);
    }
    for (const r of this.rs) {
      if (r.mode === M_FALL || r.mode === M_DONE || r.ghost > 0) continue;
      const dx = r.x - m.x,
        ds = r.s - m.s;
      const d = Math.hypot(dx, ds);
      if (d > m.R + RB || r.y > m.y + 2.2 || r.y < m.y - 1) continue;
      const nx = d > 0.05 ? dx / d : 0,
        ns = d > 0.05 ? ds / d : -1;
      const v = 6.5 - d * 1.2;
      this.knock(r, nx * v, ns * v, 5.5, 0.8, T("METEOR!", "陨石！"), "#ff5a3a");
    }
  }

  // ---- the play ------------------------------------------------------------------------------------

  idle(dt: number, phase: "card" | "count", k: number) {
    this.clk += dt;
    this.ht += dt;
    this.hazards(dt);
    for (const r of this.rs) {
      r.ix = r.is = 0;
      this.step(r, dt);
    }
    this.render(dt);
    if (phase === "card") this.cardCam(k);
    else {
      this.playEye(this.rs[this.camI], dt, true);
      this.cam.to(this.eye, this.at, dt, 2.2 + k * 3);
    }
    this.cam.apply(dt);
  }

  /** The intro cinematic's shots (host.ts → cine.ts): FINALITY's gate up the course, then a flight back down it to the start. */
  intro(): IntroShot[] {
    const F = this.finS;
    const y = this.finY;
    return [
      { eye: [13, y + 12, -(F - 24)], eye2: [7, y + 6.5, -(F - 14)], at: [0, y + 2.5, -(F + 3)], at2: [0, y + 2, -(F + 1)], fov: 52, fov2: 44, say: "FINALITY: the finish line", sayZh: "终局：终点线", chip: "THE GOAL", chipZh: "目标" },
      // (always looking back toward the start: it ends in front of the line, on their faces)
      { eye: [9, y * 0.8 + 10, -(F - 6)], via: [[8, y * 0.66 + 9, -F * 0.66], [7, y * 0.33 + 8, -F * 0.33]], eye2: [4, 5.5, -15], at: [0, y * 0.8, -(F - 32)], atVia: [[0, y * 0.5, -F * 0.66 + 26], [0, y * 0.2, -F * 0.33 + 26]], at2: [0, 1.2, 0], fov: 56, fov2: 50, w: 1.5 },
    ];
  }

  /** The card: a slow flight down the course from the finish back to the start. */
  private cardCam(sec: number) {
    const f = clamp(sec / 7, 0, 1);
    const e = f * f * (3 - 2 * f);
    const s = this.finS - 20.5 - e * (this.finS - 30.5);
    this.cam.eye.set(26 - e * 10, 30 - e * 12, -(s - 30));
    this.cam.at.set(0, 0, -(s + 6));
  }

  update(dt: number, input: Input) {
    if (!this.started) this.go();
    this.t += dt;
    this.ht += dt;
    this.clk += dt;
    this.hurt = Math.max(0, this.hurt - dt * 2);
    this.hazards(dt);
    for (const r of this.rs) {
      if (this.over || r.mode === M_FALL) {
        r.ix = r.is = 0;
        r.aP = r.bP = false;
        if (r.mode === M_DONE) this.strut(r, dt);
        continue;
      }
      if (r.mode === M_DONE) this.strut(r, dt);
      else if (r.p.human && !this.bots.has(r.i)) this.human(r, input);
      else this.think(r, dt);
    }
    for (const r of this.rs) this.step(r, dt);
    this.collide();
    for (const r of this.rs) this.events(r);
    this.rules();
    this.render(dt);
    this.camera(dt);
  }

  private go() {
    this.started = true;
    this.fx.burst(_v.set(0, 1.5, 1.6), 30, ["#ffffff", "#c4b1fc", "#ffd23f"], { speed: 6, up: 4 });
  }

  /** The human's arrows, turned by the camera (up: away from it), and the buttons. */
  private human(r: Runner, input: Input) {
    const ax = input.axis();
    this.axisTo(ax.x, ax.y);
    r.ix = this.mv.x;
    r.is = this.mv.s;
    r.aP = input.pressed("a");
    r.bP = input.pressed("b");
  }
  private mv = { x: 0, s: 0 };
  /** Screen arrows → a way on the course (x, s), from where the camera looks. */
  private axisTo(ax: number, ay: number) {
    const c = this.w.camera;
    let fx = this.cam.at.x - c.position.x,
      fz = this.cam.at.z - c.position.z;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l;
    fz /= l;
    // forward on the course (x, s) and right
    const Fx = fx,
      Fs = -fz;
    const Rx = -fz,
      Rs = -fx;
    let x = Rx * ax + Fx * -ay,
      s = Rs * ax + Fs * -ay;
    const m = Math.hypot(x, s);
    if (m > 1) ((x /= m), (s /= m));
    this.mv.x = x;
    this.mv.s = s;
  }

  /** A finisher jogs to its spot on the FINALITY platform, then turns to the camera. */
  private strut(r: Runner, dt: number) {
    const place = this.done.indexOf(r.i);
    const tx = -4.5 + place * 3,
      ts = this.finS + 4;
    const dx = tx - r.x,
      ds = ts - r.s;
    const d = Math.hypot(dx, ds);
    if (d > 0.35) {
      r.ix = (dx / d) * Math.min(1, d) * 0.6;
      r.is = (ds / d) * Math.min(1, d) * 0.6;
    } else {
      r.ix = r.is = 0;
      r.yaw += turn(r.yaw, 0) * Math.min(1, 5 * dt);
    }
  }

  // ---- a body on the course ----------------------------------------------------------------------

  private step(r: Runner, dt: number) {
    r.mt -= dt;
    r.shoveCd -= dt;
    r.guard -= dt;
    r.imm -= dt;
    r.ghost -= dt;
    r.jbuf -= dt;
    r.arms -= dt;
    if (r.mode === M_FALL) {
      r.vy = Math.max(-34, r.vy - this.g * dt);
      if (this.L.water !== undefined && r.y < this.L.water) {
        // (in the canal: sinking slowly)
        r.vy = Math.max(r.vy, -2.2);
        const kf = Math.exp(-6.3 * dt);
        r.kx *= kf;
        r.ks *= kf;
      }
      r.y += r.vy * dt;
      r.x += r.kx * dt;
      r.s += r.ks * dt;
      if (r.mt <= 0) this.respawn(r);
      return;
    }
    const g0 = r.grounded;
    if (r.mode === M_RUN) {
      if (r.aP) this.pressA(r);
      if (r.bP) this.pressB(r);
    }
    r.aP = r.bP = false;
    // the legs
    if (r.mode === M_RUN || r.mode === M_DONE) {
      let ix = r.ix,
        is = r.is;
      const l = Math.hypot(ix, is);
      if (l > 1) ((ix /= l), (is /= l));
      const top = SPEED * r.spd;
      const acc = (r.grounded ? ACC : AIR_ACC * (r.launched ? 0.35 : 1)) * dt;
      const ddx = ix * top - r.cx,
        dds = is * top - r.cs;
      const dl = Math.hypot(ddx, dds);
      if (dl <= acc) ((r.cx += ddx), (r.cs += dds));
      else ((r.cx += (ddx / dl) * acc), (r.cs += (dds / dl) * acc));
      if (l > 0.2) r.yaw += turn(r.yaw, Math.atan2(ix, -is)) * Math.min(1, 15 * dt);
    } else if (r.mode === M_DIVE) {
      // (a little steer in the dive)
      const l = Math.hypot(r.ix, r.is);
      if (l > 0.2) {
        const sp = Math.hypot(r.cx, r.cs);
        const want = Math.atan2(r.ix, -r.is);
        const cur = Math.atan2(r.cx, -r.cs);
        const nyaw = cur + clamp(turn(cur, want), -1.6 * dt, 1.6 * dt);
        r.cx = Math.sin(nyaw) * sp;
        r.cs = -Math.cos(nyaw) * sp;
        r.yaw = nyaw;
      }
    } else {
      const f = Math.exp(-(r.grounded ? (r.mode === M_BELLY ? 3.5 : 7) : 0.3) * dt);
      r.cx *= f;
      r.cs *= f;
    }
    // the knock fades: fast on the ground (slower mid-tumble: you skid), barely in the air
    const kf = Math.exp(-(r.grounded ? (r.mode === M_TUMBLE ? 2.6 : 5.5) : 0.12) * dt);
    r.kx *= kf;
    r.ks *= kf;
    // what the ground does to you
    let carry = 0,
      carryS = 0,
      belt = 0;
    const sf = r.grounded ? r.surf : null;
    if (sf) {
      belt = sf.belt;
      if (sf.kind === K_MOVER) carry = this.movers[sf.ref].dx;
      else if (sf.kind === K_DISC) {
        // (a turntable carries you round with it)
        const d = this.discs[sf.ref];
        const a = d.w * dt;
        const rx = r.x - d.cx,
          rs = r.s - d.cs;
        const c = Math.cos(a),
          sn = Math.sin(a);
        carry = rx * c - rs * sn - rx;
        carryS = rx * sn + rs * c - rs;
        r.yaw += a;
      }
      else if (sf.kind === K_SEESAW) r.kx += -this.g * Math.sin(this.saws[sf.ref].ang) * SLIDE * dt;
      else if (sf.kind === K_TILE) {
        const tl = this.tiles[sf.ref];
        if (tl.st === 0) ((tl.st = 1), (tl.t = 0));
      } else if (sf.kind === K_BOOST && r.mode === M_RUN && this.started) this.launch(r);
    }
    let lx = 0,
      ls = 0;
    if (r.shoveT > 0) {
      r.shoveT -= dt;
      lx = Math.sin(r.yaw) * LUNGE;
      ls = -Math.cos(r.yaw) * LUNGE;
    }
    // across, then along, each against the walls
    // (a long move, a hard knock on a slow frame, goes in short ones: never over a wall's thickness at once)
    let dx = (r.cx + r.kx + lx) * dt + carry;
    let ds = (r.cs + r.ks + ls + belt) * dt + carryS;
    const n = Math.min(6, Math.ceil(Math.max(Math.abs(dx), Math.abs(ds)) / 0.4)) || 1;
    dx /= n;
    ds /= n;
    for (let k = 0; k < n; k++) {
      if (dx) {
        const px = r.x + dx + (dx > 0 ? RB : -RB);
        const wl = this.wall(px, r.s - RB * 0.6, r.y) ?? this.wall(px, r.s + RB * 0.6, r.y);
        if (wl) {
          r.cx = 0;
          r.kx = -r.kx * 0.3;
          dx = 0;
        } else r.x += dx;
      }
      if (ds) {
        const ps = r.s + ds + (ds > 0 ? RB : -RB);
        const wl = this.wall(r.x - RB * 0.6, ps, r.y) ?? this.wall(r.x + RB * 0.6, ps, r.y);
        if (wl) {
          this.bumpWall(r, wl, ds > 0 ? 1 : -1);
          ds = 0;
        } else r.s += ds;
      }
    }
    // up and down
    const wasY = r.y;
    r.vy = Math.max(-34, r.vy - this.g * dt);
    // (the fall's own half step, so a short frame or a long one draws the same arc)
    let ny = r.y + (r.vy + 0.5 * this.g * (dt - H0)) * dt;
    const fl = this.floor(r.x, r.s, wasY + STEP);
    const fsf = this.hit;
    let land = false;
    if (fl > -1e8 && r.vy <= 0) {
      // (down onto it from above; on foot, up a step onto it)
      if (ny <= fl && (wasY >= fl - 0.1 || (g0 && wasY >= fl - STEP))) land = true;
      else if (g0 && ny > fl && ny - fl < 0.6) land = true;
    }
    if (land) {
      if (!g0) this.onLand(r, -r.vy);
      ny = fl;
      r.vy = 0;
      r.grounded = true;
      r.surf = fsf;
      r.air = 0;
      r.gy = fl;
      r.dived = false;
      r.launched = false;
    } else {
      r.grounded = false;
      r.surf = null;
      r.air += dt;
    }
    r.y = ny;
    // (running flat out kicks up a little dust)
    if (r.grounded && r.mode === M_RUN && r.cx * r.cx + r.cs * r.cs > 25) {
      r.dust -= dt;
      if (r.dust <= 0) {
        r.dust = 0.18 + Math.random() * 0.12;
        if (this.near(r)) this.fx.burst(_v.set(r.x - Math.sin(r.yaw) * 0.3, r.y + 0.05, -r.s + Math.cos(r.yaw) * 0.3), 2, this.dust, { speed: 1.2, up: 0.6, size: 0.12, life: 0.35 });
      }
    }
    if (r.grounded && r.jbuf > 0 && r.mode === M_RUN) ((r.jbuf = 0), this.jump(r));
    // the modes' ends
    if ((r.mode === M_TUMBLE || r.mode === M_DAZE) && r.mt <= 0 && r.grounded) {
      r.mode = M_RUN;
      r.b.wasHit = true;
    }
    if (r.mode === M_DIVE && r.grounded) ((r.mode = M_BELLY), (r.mt = 0.36));
    if (r.mode === M_BELLY && r.mt <= 0) r.mode = M_RUN;
  }

  private pressA(r: Runner) {
    if (r.grounded || (r.air < COYOTE && r.vy <= 0.1)) this.jump(r);
    else if (!r.dived && !(r.vy < -2 && this.floor(r.x, r.s, r.y + 0.01) > r.y - 0.9)) this.dive(r);
    else r.jbuf = BUFFER;
  }

  private jump(r: Runner) {
    r.vy = this.jv;
    r.grounded = false;
    r.surf = null;
    r.air = COYOTE;
    r.a.body.jump();
    if (r.p.human) hop();
    if (this.near(r)) this.fx.burst(_v.set(r.x, r.y + 0.06, -r.s), 4, this.dust, { speed: 1.8, up: 0.5, size: 0.14, life: 0.35 });
  }

  private dive(r: Runner) {
    r.mode = M_DIVE;
    r.dived = true;
    let dx = r.ix,
      ds = r.is;
    let l = Math.hypot(dx, ds);
    if (l < 0.3) ((dx = Math.sin(r.yaw)), (ds = -Math.cos(r.yaw)), (l = 1));
    dx /= l;
    ds /= l;
    const sp = Math.max(DIVE_V, r.cx * dx + r.cs * ds);
    r.cx = dx * sp;
    r.cs = ds * sp;
    r.kx *= 0.5;
    r.ks *= 0.5;
    r.vy = Math.max(r.vy + 1.5, DIVE_UP);
    r.yaw = Math.atan2(dx, -ds);
    if (r.p.human || this.near(r)) sfx.whoosh();
    this.fx.burst(_v.set(r.x, r.y + 0.6, -r.s), 6, ["#ffffff", r.p.color], { speed: 2, up: 0.5, size: 0.14, life: 0.4 });
  }

  private pressB(r: Runner) {
    if (r.shoveCd > 0) return;
    r.shoveT = SHOVE_T;
    r.shoveCd = SHOVE_CD;
    r.arms = 0.32;
    if (r.p.human) yelp(0.8);
  }

  private launch(r: Runner) {
    r.launched = true;
    r.vy = 18;
    r.grounded = false;
    r.surf = null;
    r.air = COYOTE;
    r.cs = 8.6;
    r.cx *= 0.5;
    r.kx *= 0.5;
    r.ks = 0;
    r.a.body.jump();
    r.st.sc2 = true;
    this.fx.burst(_v.set(r.x, 0.3, -r.s), 26, ["#ffe36b", "#ff6b35", "#ffffff"], { speed: 5, up: 7, size: 0.22 });
    if (r.p.human) {
      boing(1.4);
      this.say(T("BOOST!", "弹射！"), "#ffd23f", 1.1, 44, H * 0.3);
      this.cam.shake(0.25);
    } else if (this.near(r)) boing(1.3);
  }

  private onLand(r: Runner, v: number) {
    r.a.body.land(Math.min(8, v));
    if (v > 13) {
      this.fx.burst(_v.set(r.x, r.y + 0.1, -r.s), 10, this.dust, { speed: 3.4, up: 1.2, size: 0.2, life: 0.5 });
      if (r.p.human) sfx.thud();
    } else if (v > 6 && this.near(r)) this.fx.burst(_v.set(r.x, r.y + 0.08, -r.s), 5, this.dust, { speed: 2.2, up: 0.8, size: 0.15, life: 0.4 });
  }

  private bumpWall(r: Runner, wl: Surf, dir: number) {
    if (wl.kind === K_DOOR && dir > 0) {
      const d = this.doors[wl.ref];
      if (d.real) {
        // a valid proof: it bursts open
        d.st = 1;
        wl.on = false;
        r.cs *= 0.75;
        r.st.doors++;
        const at = _v.set(d.cx, 1.8, -(d.sf.s0 + 0.2));
        this.fx.burst(at, 40, ["#ffffff", "#9dffd8", DOOR_COLS[d.k]], { speed: 8, up: 4, size: 0.34, dir: _v2.set(0, 0, -5) });
        r.a.body.hit();
        if (r.p.human || this.near(r)) sfx.thud();
        if (r.p.human) {
          sfx.coin();
          this.cam.shake(0.3);
        }
        this.pop(r.i, T("VALID!", "有效！"), "#9dffd8", true);
        return;
      }
      // invalid: BONK, back you go (and now everyone can see it's fake)
      const first = d.st === 0;
      d.st = 2;
      d.shake = 1;
      r.cs = 0;
      r.ks = first ? -6.5 : -4;
      r.vy = first ? 4.5 : 3;
      r.grounded = false;
      r.surf = null;
      r.st.bonks++;
      if (first) ((r.mode = M_DAZE), (r.mt = 0.55), r.a.body.hit());
      this.fx.burst(_v.set(r.x, r.y + 1.5, -(d.sf.s0 - 0.2)), 14, ["#ff2d4a", "#ffffff", "#ffd23f"], { speed: 5, up: 3, size: 0.2 });
      if (r.p.human) {
        honk();
        this.cam.shake(0.35);
        this.hurt = 0.6;
      } else if (this.near(r)) honk();
      this.pop(r.i, T("INVALID!", "无效！"), "#ff5a6e", true);
      r.b.door[d.wall] = -1;
      return;
    }
    r.cs = 0;
    r.ks = -r.ks * 0.3;
  }

  /** Close enough to the camera to be heard. */
  private near(r: Runner) {
    return Math.abs(r.s - this.camS) < 14;
  }

  /** Knocked: no legs for a while, spinning, flung by (kx, ks, vy). */
  private knock(r: Runner, kx: number, ks: number, vy: number, t: number, what: string, c: string) {
    r.mode = M_TUMBLE;
    r.mt = t;
    r.kx = kx;
    r.ks = ks;
    r.vy = vy;
    r.cx = r.cs = 0;
    r.grounded = false;
    r.surf = null;
    r.imm = 0.4;
    r.shoveT = 0;
    r.spinV = (7 + this.rnd() * 5) * (this.rnd() < 0.5 ? -1 : 1);
    r.st.hits++;
    r.st.hitBy.push(`${what}@${Math.round(r.s)}`);
    r.a.body.hit();
    r.b.wasHit = true;
    this.fx.burst(_v.set(r.x, r.y + 1, -r.s), 18, [r.p.color, "#ffffff", c], { speed: 6, up: 4, size: 0.2 });
    if (r.p.human) {
      sfx.hit();
      scream(1 + this.rnd() * 0.2, 0.2);
      this.cam.shake(0.45);
      this.hurt = 1;
    } else if (this.near(r)) {
      sfx.hit();
      if (this.rnd() < 0.6) scream(1.2 + this.rnd() * 0.3, 0.1);
      this.cam.shake(0.12);
    }
    this.pop(r.i, what, c, r.p.human);
  }

  // ---- runners against the hazards and each other ----------------------------------------------

  private collide() {
    const rs = this.rs;
    for (const r of rs) {
      if (r.mode === M_FALL || r.mode === M_DONE || r.ghost > 0 || r.imm > 0) continue;
      // the sweeps' bars
      for (const sw of this.sweeps) {
        const rx = r.x - sw.cx,
          rs2 = r.s - sw.cs;
        const d = Math.hypot(rx, rs2);
        if (d > sw.R + RB || d < 0.3) continue;
        if (r.y > BAR_Y + BAR_R - 0.02 || r.y + BODY_H < BAR_Y - BAR_R) continue;
        for (let k = 0; k < sw.n; k++) {
          const a = sw.ang + (k * TAU) / sw.n;
          const ux = Math.cos(a),
            us = Math.sin(a);
          const p = rx * ux + rs2 * us;
          if (p < 0.5 || p > sw.R + 0.2) continue;
          const perp = -rx * us + rs2 * ux;
          if (Math.abs(perp) > BAR_R + RB) continue;
          const sg = sw.w > 0 ? 1 : -1;
          const tx = -us * sg,
            ts = ux * sg;
          const v = Math.abs(sw.w) * p * 0.7 + 3;
          r.x = sw.cx + ux * p + tx * (BAR_R + RB + 0.05);
          r.s = sw.cs + us * p + ts * (BAR_R + RB + 0.05);
          this.knock(r, tx * v, ts * v, 5.5, 0.7, T("SWEPT!", "扫飞！"), "#ffb02e");
          break;
        }
        if (r.mode === M_TUMBLE && r.imm > 0.3) break;
      }
      if (r.imm > 0) continue;
      // the hammers
      for (const h of this.hams) {
        if (Math.abs(r.s - h.s) > HEAD_S + RB) continue;
        if (Math.abs(r.x - h.x) > HEAD_X + RB) continue;
        if (r.y > h.y + HEAD_Y || r.y + BODY_H < h.y - HEAD_Y) continue;
        const dir = Math.abs(h.vx) > 0.5 ? Math.sign(h.vx) : Math.sign(r.x - h.x) || 1;
        const v = Math.max(9, Math.abs(h.vx) * 1.15);
        r.x = h.x + dir * (HEAD_X + RB + 0.02);
        this.knock(r, dir * v, -0.6, 7.5, 1.1, T("WHAM!", "砰！"), "#ff6b35");
        if (r.p.human || this.near(r)) sfx.thud();
        break;
      }
      if (r.imm > 0) continue;
      // a shutter coming down on you: thrown back out of it
      for (const sh of this.shutters) {
        if (sh.bot > r.y + BODY_H - 0.1 || Math.abs(r.x - sh.cx) > sh.w / 2 + RB * 0.4 || r.s + RB < sh.sf.s0 || r.s - RB > sh.sf.s1) continue;
        const back = r.s < (sh.sf.s0 + sh.sf.s1) / 2;
        r.s = back ? sh.sf.s0 - RB - 0.06 : sh.sf.s1 + RB + 0.06;
        r.x = clamp(r.x, sh.cx - sh.w / 2 + RB, sh.cx + sh.w / 2 - RB);
        r.st.bonks++;
        this.knock(r, (this.rnd() * 2 - 1) * 1.2, back ? -6.5 : 4, 4.5, 0.85, T("SLAM!", "砰！"), "#ff5a6e");
        if (r.p.human || this.near(r)) sfx.thud();
        break;
      }
      if (r.imm > 0) continue;
      // the bumpers
      for (let bi = 0; bi < this.bumps.length; bi++) {
        const b = this.bumps[bi];
        const dx = r.x - b.x,
          ds = r.s - b.s;
        const d = Math.hypot(dx, ds);
        if (d > BUMP_R + RB || r.y > b.y + BUMP_H) continue;
        const nx = d > 0.01 ? dx / d : 0,
          ns = d > 0.01 ? ds / d : -1;
        r.x = b.x + nx * (BUMP_R + RB + 0.05);
        r.s = b.s + ns * (BUMP_R + RB + 0.05);
        b.pulse = 1;
        r.b.bumpSeen |= 1 << bi;
        // (it throws you back down the slope more than off its side)
        const kx = nx * 0.6,
          ks = ns * 0.6 - 0.8;
        const kl = Math.hypot(kx, ks) || 1;
        this.knock(r, (kx / kl) * 8, (ks / kl) * 8, 5.5, 0.5, T("BOING!", "嘣！"), b.x > 1 ? "#3ec6ff" : "#ff5fa2");
        if (r.p.human || this.near(r)) boing();
        break;
      }
    }
    // the shoves
    for (const r of rs) {
      if (r.shoveT <= 0 || r.mode !== M_RUN) continue;
      const fx = Math.sin(r.yaw),
        fs = -Math.cos(r.yaw);
      for (const o of rs) {
        if (o === r || o.mode === M_FALL || o.mode === M_DONE || o.ghost > 0 || o.guard > 0) continue;
        const dx = o.x - r.x,
          ds = o.s - r.s;
        const d = Math.hypot(dx, ds);
        if (d > SHOVE_REACH || d < 0.01 || Math.abs(o.y - r.y) > 1.2) continue;
        if ((dx * fx + ds * fs) / d < 0.35) continue;
        r.shoveT = 0;
        r.cx *= 0.3;
        r.cs *= 0.3;
        r.st.shoves++;
        o.guard = GUARD;
        this.knock(o, fx * SHOVE_V + (dx / d) * 1.5, fs * SHOVE_V + (ds / d) * 1.5, 4.8, 0.5, T("SHOVED!", "被推！"), r.p.color);
        if (r.p.human) this.cam.shake(0.25);
        break;
      }
    }
    // bodies bump: pushed apart, a little knock when it's fast
    for (let i = 0; i < rs.length; i++) {
      const a = rs[i];
      if (a.mode === M_FALL || a.ghost > 0) continue;
      for (let j = i + 1; j < rs.length; j++) {
        const b = rs[j];
        if (b.mode === M_FALL || b.ghost > 0 || Math.abs(a.y - b.y) > 1.3) continue;
        const dx = b.x - a.x,
          ds = b.s - a.s;
        const d = Math.hypot(dx, ds);
        if (d >= RB * 2 || d < 1e-4) continue;
        const nx = dx / d,
          ns = ds / d;
        const push = (RB * 2 - d) / 2;
        a.x -= nx * push;
        a.s -= ns * push;
        b.x += nx * push;
        b.s += ns * push;
        const rel = (a.cx + a.kx - b.cx - b.kx) * nx + (a.cs + a.ks - b.cs - b.ks) * ns;
        if (rel > 4) {
          const k = (rel - 3) * 0.45;
          a.kx -= nx * k;
          a.ks -= ns * k;
          b.kx += nx * k;
          b.ks += ns * k;
          this.fx.burst(_v.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 1, -(a.s + b.s) / 2), 6, ["#ffffff", a.p.color, b.p.color], { speed: 3, up: 2, size: 0.14, life: 0.4 });
          if (a.p.human || b.p.human) sfx.blip(2);
        }
      }
    }
  }

  // ---- checkpoints, the finish, the falls ----------------------------------------------------------

  private events(r: Runner) {
    if (r.mode === M_FALL) return;
    if (r.mode !== M_DONE && (r.y < r.gy - 7 || (this.L.water !== undefined && r.y < this.L.water + 0.25))) return this.fall(r);
    if (r.mode === M_DONE) return;
    if (r.grounded) {
      const cps = this.L.cps;
      while (r.cp + 1 < cps.length && r.s >= cps[r.cp + 1].s - 0.5 && r.y > cps[r.cp + 1].y - 1) {
        r.cp++;
        if (r.p.human) this.checkpoint(r.cp);
      }
      if (r.s > r.best) ((r.best = Math.min(r.s, this.finS)), (r.bestT = this.t));
    }
    const sec = this.secOf(r.s);
    if (sec > r.sec) {
      r.sec = sec;
      if (r.p.human && sec >= 1) this.say(T(this.secs[sec].en, this.secs[sec].zh), this.secs[sec].c, 1.5, 36, H * 0.23);
    }
    if (r.s >= this.finS && r.y > this.finY - 1) this.finish(r);
  }

  private checkpoint(cp: number) {
    this.say(T("CHECKPOINT!", "检查点！"), "#8ee35b", 1.3, 50, H * 0.34);
    sfx.star();
    const c = this.L.cps[cp];
    this.fx.burst(_v.set((c.x0 + c.x1) / 2, c.y + 2.5, -c.s), 30, ["#8ee35b", "#ffffff", "#ffd23f"], { speed: 6, up: 5 });
    if (!this.flagHit[cp]) {
      this.flagHit[cp] = true;
      this.pFlag.tint(cp * 2, "#8ee35b");
      this.pFlag.tint(cp * 2 + 1, "#8ee35b");
      this.pFlag.flush();
    }
  }

  private fall(r: Runner) {
    r.mode = M_FALL;
    r.mt = 1.05;
    if (this.L.water !== undefined && r.y < this.L.water + 1) {
      // a splash in the canal
      this.fx.burst(_v.set(r.x, this.L.water + 0.1, -r.s), 26, this.L.look.splash ?? ["#ffffff", "#7ad8ff"], { speed: 4, up: 6, size: 0.24 });
      if (r.p.human || this.near(r)) note(900, 180, 0.3, "sine", 0.18);
    }
    r.st.falls++;
    r.st.fallAt.push(Math.round(r.s));
    r.shoveT = 0;
    if (r.p.human) {
      scream(1.05, 0.22);
      this.pop(r.i, T("OOPS!", "哎呀！"), "#ff8a96", true);
    } else if (this.near(r)) scream(1.25 + this.rnd() * 0.2, 0.09);
    if (r.b.sc1 && this.L.pillars && r.s > this.L.pillars.s[0] - 12 && r.s < this.L.pillars.exit[2]) r.b.sc1Off = true;
  }

  private respawn(r: Runner) {
    const c = this.L.cps[r.cp];
    r.x = c.x0 + ((r.i + 0.5) / 4) * (c.x1 - c.x0);
    r.s = c.s;
    // (dropped back in from a little above: lower where the fall is slow)
    r.y = c.y + 2.2 * Math.min(1, this.g / 30);
    r.gy = c.y;
    r.vy = 0;
    r.cx = r.cs = r.kx = r.ks = 0;
    r.mode = M_RUN;
    r.yaw = Math.PI;
    r.ghost = 1.3;
    r.grounded = false;
    r.surf = null;
    r.b.wasHit = true;
    r.b.dive = false;
    r.b.door = [-1, -1];
    r.b.hamFor = -1;
    r.b.gRow = -1;
    r.b.gate = -1;
    r.b.lastBest = r.s;
    r.b.stuck = 0;
    this.fx.burst(_v.set(r.x, r.y + 0.8, -r.s), 22, [r.p.color, "#ffffff"], { speed: 4, up: 3, size: 0.2 });
    if (r.p.human) sfx.blip(4);
  }

  private finish(r: Runner) {
    r.mode = M_DONE;
    r.fin = this.t;
    r.best = this.finS;
    this.done.push(r.i);
    const place = this.done.length - 1;
    r.a.cheer(3);
    this.fx.burst(_v.set(r.x, r.y + 1.5, -r.s), 50, ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#ffd23f", "#ffffff"], { speed: 9, up: 8, size: 0.24 });
    const pl = ["1ST!", "2ND!", "3RD!", "4TH!"][place];
    const plZh = ["第一！", "第二！", "第三！", "第四！"][place];
    if (r.p.human) {
      sfx.fanfare();
      this.say(T("FINALITY!", "最终确认！"), "#8ee35b", 2.2, 64, H * 0.3);
      this.say(T(pl, plZh), place === 0 ? "#ffd23f" : "#ffffff", 2.0, 40, H * 0.43, 0.25);
      this.cam.shake(0.3);
    } else {
      if (this.near(r)) sfx.coin();
      this.pop(r.i, T(pl, plZh), "#ffd23f", true);
    }
    if (place === 0) {
      this.cap = Math.min(this.cap, this.t + HURRY);
      const me = this.rs.find((q) => q.p.human);
      if (me && me.mode !== M_DONE) this.say(T("HURRY!", "快！"), "#ff5a6e", 1.6, 60, H * 0.32, 0.3);
      music.rate(1.12);
    }
  }

  private rules() {
    if (this.over) return;
    const left = this.cap - this.t;
    if (!this.warned && left <= 10) {
      this.warned = true;
      const me = this.rs.find((q) => q.p.human);
      if (!me || me.mode !== M_DONE) this.say(T("10 SECONDS!", "还剩 10 秒！"), "#ffb02e", 1.5, 50, H * 0.32);
      music.rate(1.18);
    }
    if (this.done.length >= 3 || this.t >= this.cap) this.end();
  }

  private end() {
    const rest = this.rs.filter((r) => r.mode !== M_DONE).sort((a, b) => b.best - a.best || a.bestT - b.bestT || a.i - b.i);
    this.over = [...this.done, ...rest.map((r) => r.i)];
    const w = this.rs[this.over[0]];
    if (w.mode !== M_DONE) w.a.cheer(3);
    if (this.t >= this.cap && this.done.length < 3) this.say(T("TIME!", "时间到！"), "#ffffff", 1.4, 56, H * 0.34);
  }

  // ---- the AIs --------------------------------------------------------------------------------------

  private keyAcc = 0;
  /** Seats the bench drives with an AI head through the human's controls. */
  bots = new Set<number>();
  /** Bench: give seat i an AI head of skill k (its keys are then pressed by the bench). */
  setSkill(i: number, k: number) {
    this.rs[i].b.k = k;
  }
  /** Bench: what seat i's head wants now (a way on the course, A, B), and that way as screen arrows. */
  intent(i: number, dt = 1 / 30) {
    const r = this.rs[i];
    this.think(r, dt);
    let ax = 0,
      ay = 0;
    if (Math.hypot(r.ix, r.is) > 0.3) {
      // (8-way, like keys): back through the camera
      const c = this.w.camera;
      let fx = this.cam.at.x - c.position.x,
        fz = this.cam.at.z - c.position.z;
      const l = Math.hypot(fx, fz) || 1;
      fx /= l;
      fz /= l;
      const F = [fx, -fz],
        R = [-fz, -fx];
      const up = r.ix * F[0] + r.is * F[1];
      const rt = r.ix * R[0] + r.is * R[1];
      // (between two key directions, the nearer more often: a player tapping the diagonal)
      const q = Math.atan2(up, rt) / (Math.PI / 4);
      const lo = Math.floor(q);
      this.keyAcc += q - lo;
      let pick = lo;
      if (this.keyAcc >= 1) ((this.keyAcc -= 1), (pick = lo + 1));
      const a = pick * (Math.PI / 4);
      ax = Math.round(Math.cos(a));
      ay = -Math.round(Math.sin(a));
    }
    return { ax, ay, mag: Math.min(1, Math.hypot(r.ix, r.is)), a: r.aP, b: r.bP, mode: r.mode, s: r.s };
  }

  private think(r: Runner, dt: number) {
    const b = r.b;
    const k = b.k;
    r.ix = r.is = 0;
    r.aP = r.bP = false;
    if (this.t < b.start) return;
    if (r.mode === M_DIVE) {
      r.ix = Math.sin(r.yaw);
      r.is = -Math.cos(r.yaw);
      return;
    }
    if (r.mode !== M_RUN) return;
    // a knock or a fall rattles the weak ones: a panicky dash
    if (b.wasHit) {
      b.wasHit = false;
      if (this.rnd() < 0.45 * (1 - k) && r.ghost <= 0) {
        b.panic = 0.25 + this.rnd() * 0.45;
        const a = this.rnd() * TAU;
        b.px = Math.cos(a);
        b.ps = Math.sin(a) * 0.5 + 0.5;
      }
    }
    // (a panic is a dash on the ground: in the air, the jump taken goes on)
    if (b.panic > 0) b.panic -= dt;
    if (b.panic > 0 && r.grounded) {
      if (this.floorOk(r, b.px, b.ps)) {
        r.ix = b.px;
        r.is = b.ps;
        if (this.rnd() < dt * 1.5) r.aP = true;
      }
      return;
    }
    if (b.wait > 0) {
      b.wait -= dt;
      return;
    }
    if (r.grounded && this.rnd() < dt * 0.06 * (1 - k)) b.wait = 0.15 + this.rnd() * 0.4;
    // stuck (pinned at an edge, a wall): try something else (progress counts from the last checkpoint)
    if (r.s > b.lastBest + 0.5) ((b.lastBest = r.s), (b.stuck = 0));
    else if (!b.hold) b.stuck += dt;
    if (b.stuck > 3.5) {
      b.stuck = 0;
      b.panic = 0.5;
      b.px = this.rnd() < 0.5 ? -1 : 1;
      b.ps = 0.3;
      // (stopped at a gap it can't clear from a standstill: back for a run-up, or it holds the edge for good)
      if (b.edge && r.grounded) ((b.px = 0), (b.ps = -1));
      b.door = [-1, -1];
      return;
    }
    this.plan(r, dt);
    let dx = b.tx - r.x,
      ds = b.ts - r.s;
    const l = Math.hypot(dx, ds) || 1;
    dx /= l;
    ds /= l;
    if (b.hold) {
      ds = r.s < b.ts - 0.25 ? 0.6 : r.s > b.ts + 0.4 ? -0.4 : 0;
      dx = Math.abs(b.tx - r.x) > 0.25 ? clamp(b.tx - r.x, -1, 1) : 0;
    }
    const wasLate = b.late > 0;
    b.late -= dt;
    if (!r.grounded) {
      // (late off the edge: a scrambled jump, if it's not too late)
      if (wasLate && b.late <= 0 && !b.jumped && r.air < COYOTE) {
        r.aP = true;
        b.jumped = true;
        b.jx = dx;
        b.js = ds;
        b.airF = 1;
        b.dive = true;
      }
      // in the air: as the jump was planned (a hop eases off), the dive at the top
      if (b.jumped) {
        r.ix = b.jx * b.airF;
        r.is = b.js * b.airF;
      } else {
        r.ix = dx;
        r.is = ds;
      }
      if (b.dive && r.vy < 1.5 && !r.dived) {
        r.aP = true;
        b.dive = false;
      }
      return;
    }
    b.jumped = false;
    b.airF = 1;
    // the ground ahead: carry on, hop up, jump a gap (a hop, a dive), or stop at the edge
    if ((dx || ds) && ds > -0.5) {
      const go = this.edge(r, dx, ds);
      if (!go) {
        const tl = r.surf && r.surf.kind === K_TILE ? this.tiles[r.surf.ref] : null;
        if (tl && tl.st >= 1 && this.escape(r)) return;
        // (hold the edge; slide along it toward where you're going if that's safe)
        const sx = Math.abs(b.tx - r.x) > 0.25 ? Math.sign(b.tx - r.x) : 0;
        ds = 0;
        dx = sx && this.floorOk(r, sx, 0) ? sx * 0.7 : 0;
        if (this.speedAlong(r, 0, 1) > 1.5) ds = -0.6;
      }
    }
    r.ix = dx;
    r.is = ds;
    // the sweeps: hop the bar when it comes
    this.watchSweeps(r);
    if (r.aP) ((b.jumped = true), (b.jx = r.ix), (b.js = r.is));
    // a shove for whoever is in front, more when they're near a drop
    if (r.shoveCd <= 0 && r.grounded && !r.aP) {
      const fx = Math.sin(r.yaw),
        fs = -Math.cos(r.yaw);
      for (const o of this.rs) {
        if (o === r || o.mode !== M_RUN || o.ghost > 0 || o.guard > 0 || Math.abs(o.y - r.y) > 1) continue;
        const ox = o.x - r.x,
          os = o.s - r.s;
        const d = Math.hypot(ox, os);
        if (d > 1.4 || d < 0.01 || (ox * fx + os * fs) / d < 0.5) continue;
        const edge = this.floorOk(o, 1, 0) && this.floorOk(o, -1, 0) ? 1 : 3;
        if (this.rnd() < dt * (0.15 + 0.85 * k) * b.aggr * edge) r.bP = true;
        break;
      }
    }
  }

  /** On a tile that's going: a jump any way that lands (ahead first). */
  private escape(r: Runner) {
    const b = r.b;
    for (const a of ESCAPE) {
      const dx = Math.sin(a),
        ds = Math.cos(a);
      for (const f of AIR_F)
        if (this.simJump(r, dx, ds, f, false)) {
          r.ix = dx;
          r.is = ds;
          r.aP = true;
          b.jumped = true;
          b.jx = dx;
          b.js = ds;
          b.airF = f;
          return true;
        }
    }
    return false;
  }

  private speedAlong(r: Runner, x: number, s: number) {
    return (r.cx + r.kx) * x + (r.cs + r.ks) * s;
  }

  /** Is there ground 1.4 m that way from r (x, s a unit way)? */
  private floorOk(r: Runner, x: number, s: number) {
    const l = Math.hypot(x, s) || 1;
    return this.look(r.x + (x / l) * 1.4, r.s + (s / l) * 1.4, 0, 0) > r.y - 1.2;
  }

  /** The edge ahead: true to carry on (a jump may be pressed), false to hold. */
  private edge(r: Runner, dx: number, ds: number) {
    const b = r.b;
    const sp = Math.hypot(r.cx, r.cs);
    const probe = 0.45 + sp * 0.1;
    const y = r.y;
    const near = this.look(r.x + dx * probe, r.s + ds * probe, 0, b.k);
    if (near > y - 1.2 && near <= y + STEP) {
      b.edge = false;
      return true;
    }
    if (near > y + STEP && near < y + 1.5) {
      // a step up: hop it
      r.aP = true;
      return true;
    }
    if (near >= y + 1.5) return true;
    // a gap. Once per edge: misjudge the run-up a little (the weak ones more), or come in late
    if (!b.edge) {
      b.edge = true;
      b.jerr = (this.rnd() * 1.3 - 0.3) * (1 - b.k) * 0.3;
      if (this.rnd() < 0.05 * (1 - b.k)) b.late = 0.08 + this.rnd() * 0.22;
    }
    if (b.late > 0) return true;
    // the jumps it could make: a full one, shorter hops (easing off in the air), a dive
    for (const f of AIR_F)
      if (this.simJump(r, dx, ds, f, false)) {
        r.aP = true;
        b.airF = f;
        b.dive = false;
        b.edge = false;
        return true;
      }
    if (this.simJump(r, dx, ds, 1, true)) {
      r.aP = true;
      b.airF = 1;
      b.dive = true;
      b.edge = false;
      return true;
    }
    // (not at the brink yet: run on, the jump may land from a step nearer; hold only where it can still
    // stop. Braking at the first look made every next jump shorter: it held the edge for good)
    const brink = 0.3 + (sp * sp) / (2 * ACC);
    if (brink < probe) {
      const g = this.look(r.x + dx * brink, r.s + ds * brink, 0, b.k);
      if (g > y - 1.2 && g <= y + STEP) return true;
    }
    return false;
  }

  /**
   * Would a jump now (holding the way `dx, ds` at `f` of full speed in the air, diving at the top if
   * `dive`) come down on solid ground, ahead, not on the very edge? (As the head judges its own speed.)
   */
  private simJump(r: Runner, dx: number, ds: number, f: number, dive: boolean) {
    const k = r.b.k;
    const err = 1 + r.b.jerr;
    let x = r.x,
      s = r.s,
      y = r.y,
      vx = (r.cx + r.kx) * err,
      vs = (r.cs + r.ks) * err,
      vy = this.jv,
      dived = false;
    const top = SPEED * r.spd * f;
    const h = 0.05;
    for (let t = h; t < 2.2; t += h) {
      if (dive && !dived && vy < 1.5) {
        dived = true;
        const sp = Math.max(DIVE_V, vx * dx + vs * ds);
        vx = dx * sp;
        vs = ds * sp;
        vy = Math.max(vy + 1.5, DIVE_UP);
      } else if (!dived) {
        const ax = dx * top - vx,
          as = ds * top - vs;
        const al = Math.hypot(ax, as);
        const acc = AIR_ACC * h;
        if (al > acc) ((vx += (ax / al) * acc), (vs += (as / al) * acc));
        else ((vx = dx * top), (vs = ds * top));
      }
      vy -= this.g * h;
      x += vx * h;
      s += vs * h;
      const py = y;
      y += vy * h;
      const g = this.look(x, s, t, k);
      if (g > py + STEP) return false;
      if (vy < 0 && g > -1e8 && y <= g && py >= g - 0.05) {
        // down: on ground that holds, past where we were, not on its lip
        if (g < r.y - 2.8 || (x - r.x) * dx + (s - r.s) * ds < 1.2) return false;
        const g2 = this.look(x + dx * 0.45, s + ds * 0.45, t, k);
        const g3 = this.look(x - dx * 0.3, s - ds * 0.3, t, k);
        return g2 > g - 0.5 && g3 > g - 0.5;
      }
      if (y < r.y - 3) return false;
    }
    return false;
  }

  /** Sweeps: jump when an arm is about to reach where you'll be. */
  private watchSweeps(r: Runner) {
    const b = r.b;
    let best = 99;
    for (const sw of this.sweeps) {
      const px = r.x + r.cx * 0.1,
        ps = r.s + r.cs * 0.1;
      const rx = px - sw.cx,
        rs = ps - sw.cs;
      const d = Math.hypot(rx, rs);
      if (d > sw.R + RB + 0.3 || d < 0.6) continue;
      const phi = Math.atan2(rs, rx);
      const half = (BAR_R + RB) / d;
      const sg = sw.w > 0 ? 1 : -1;
      for (let k = 0; k < sw.n; k++) {
        const a = sw.ang + (k * TAU) / sw.n;
        let del = ((((phi - a) * sg) % TAU) + TAU) % TAU;
        if (del > TAU - half) del = 0;
        const tt = Math.max(0, (del - half) / Math.abs(sw.w));
        if (tt < best) best = tt;
      }
    }
    if (best > b.swPrev + 0.25) {
      // a new bar coming: how well we read it
      b.swLead = 0.12 + (this.rnd() - 0.5) * 0.34 * (1 - b.k);
      b.swSeen = this.rnd() < 0.72 + 0.28 * b.k;
    }
    b.swPrev = best;
    if (best < 99 && best < b.swLead && b.swSeen) r.aP = true;
  }

  /** Where to go now (b.tx, b.ts) and whether to hold (b.hold), by the stretch's zone. */
  private plan(r: Runner, dt: number) {
    const b = r.b;
    const k = b.k;
    const s = r.s;
    const L = this.L;
    b.hold = false;
    b.ts = s + 8;
    b.tx = r.x;
    // the decisions about the shortcuts, once
    if (L.rolls) {
      if (s > L.rolls[0] && !(b.rolled & 1)) {
        b.rolled |= 1;
        b.sc1 = this.rnd() < 0.06 + 0.4 * k;
      }
      if (s > L.rolls[1] && !(b.rolled & 2)) {
        b.rolled |= 2;
        b.sc2 = this.rnd() < 0.08 + 0.45 * k;
        b.aim = (this.rnd() * 2 - 1) * (1 - k) * 1.0;
        b.tol = 0.3 + (1 - k) * 1.8;
        b.bumpSeen = 0;
        for (let i = 0; i < BUMPERS.length; i++) if (this.rnd() < 0.35 + 0.65 * k) b.bumpSeen |= 1 << i;
      }
    }
    let z = L.zones[L.zones.length - 1];
    for (const q of L.zones)
      if (s < q.s1) {
        z = q;
        break;
      }
    switch (z.k) {
      case "doors":
        this.planDoors(r, dt);
        break;
      case "go": {
        const cx = z.cx ?? 0;
        b.tx = z.sc1 && b.sc1 && s > z.sc1[0] ? z.sc1[1] : clamp(cx + b.lane * z.w, cx - z.lim, cx + z.lim);
        break;
      }
      case "sweep":
        // your lane; the sidechain runners take the far edge
        if (b.sc1 && !b.sc1Off && L.pillars) b.tx = L.pillars.x;
        else b.tx = z.narrow && s > z.narrow[0] ? clamp(b.lane * z.narrow[1], -z.narrow[2], z.narrow[2]) : b.lane * z.w;
        break;
      case "hams":
        this.planHams(r, dt, z.w, z.lim);
        break;
      case "saws":
        this.planSaws(r);
        break;
      case "blocks":
        this.planBlocks(r, z.sc2x);
        break;
      case "climb":
        this.planClimb(r);
        break;
      case "shut":
        this.planShut(r, dt, z.lim);
        break;
      case "discs":
        this.planDiscs(r);
        break;
      case "hops":
        this.planHops(r);
        break;
    }
    if (this.mets.length) this.dodge(r);
  }

  /** PROOF CHECK: pick a door, go at it. */
  private planDoors(r: Runner, dt: number) {
    const b = r.b;
    const k = b.k;
    const s = r.s;
    const W2 = this.L.walls!;
    const wi = s < W2[0].s + WALL_D + 0.3 ? 0 : 1;
    const wl = W2[wi];
    if (s > wl.s - 11) {
      let pick = b.door[wi];
      if (pick >= 0) {
        const d = this.doors[pick];
        // (a door broken open nearer than ours: the sharp ones switch)
        if (d.st === 0 && this.rnd() < dt * 2 * k) {
          const open = this.nearestDoor(wi, r.x, 1);
          if (open >= 0 && Math.abs(this.doors[open].cx - r.x) < Math.abs(d.cx - r.x)) pick = b.door[wi] = open;
        }
      }
      if (pick < 0 || this.doors[pick].st === 2) pick = b.door[wi] = this.pickDoor(r, wi);
      const d = this.doors[pick];
      b.tx = d.cx;
      // (square on to it before the wall)
      b.ts = wl.s + 4;
      if (Math.abs(r.x - d.cx) > 0.5 && s > wl.s - 2.2) b.ts = s + 0.6;
    } else b.tx = clamp(r.x, -5, 5);
  }

  /** The hammers: the sidechain (pillar to pillar) or the bridge, timing them. */
  private planHams(r: Runner, dt: number, w: number, lim: number) {
    const b = r.b;
    const k = b.k;
    const s = r.s;
    const P = this.L.pillars;
    if (P && b.sc1 && !b.sc1Off && r.x > P.x - 2.6) {
      b.tx = P.x;
      r.st.sc1 = true;
      if (s > P.exit[0]) ((b.tx = P.exit[1]), (b.ts = P.exit[2]));
      return;
    }
    b.tx = clamp(b.lane * w, -lim, lim);
    for (let hi = 0; hi < this.hams.length; hi++) {
      const h = this.hams[hi];
      if (s < h.s - 3.8 || s > h.s - 1.2) continue;
      if (b.hamFor !== hi) {
        b.hamFor = hi;
        b.hamErr = (this.rnd() * 2 - 1) * (1 - k) * 0.36;
        b.hamWait = 0;
        b.hamBlind = this.rnd() < 0.22 * (1 - k);
      }
      if (b.hamBlind || this.hamSafe(h, r, b.hamErr, k)) break;
      b.hamWait += dt;
      if (b.hamWait > 0.7 + 2.6 * k) break;
      b.hold = true;
      b.ts = h.s - 2.4;
      break;
    }
  }

  /** FORK CHOICE: onto the next board, balance it (the good ones walk to the high side). */
  private planSaws(r: Runner) {
    const b = r.b;
    const k = b.k;
    const s = r.s;
    let j = -1;
    for (let i = 0; i < this.saws.length; i++) if (s < this.saws[i].s1) ((j = i), (i = 99));
    if (j < 0) {
      b.tx = clamp(r.x, -3.5, 3.5);
      return;
    }
    const ss = this.saws[j];
    const on = r.surf === ss.sf;
    if (on) {
      const bal = Math.sign(ss.ang) * Math.min(3.0, Math.abs(ss.ang) * 14 * k);
      b.tx = clamp(ss.cx + bal + b.lane * 0.8, ss.cx - ss.hw + 1.1, ss.cx + ss.hw - 1.1);
      if (s > ss.s1 - 2.6) {
        const nx = j + 1 < this.saws.length ? this.saws[j + 1].cx : 0;
        b.tx = clamp(nx, ss.cx - ss.hw + 1.1, ss.cx + ss.hw - 1.1);
      }
    } else b.tx = clamp(ss.cx + b.lane * 1.2, ss.cx - ss.hw + 1.2, ss.cx + ss.hw - 1.2);
  }

  /** Where a lane's platforms will be when we get there: the nearest one to us. */
  private moverAim(r: Runner, lane: number) {
    const ln = this.L.lanes![lane];
    const tA = (ln.s0 + 1.5 - r.s) / SPEED + 0.35;
    let bx = r.x,
      bd = 99;
    for (const m of this.movers) {
      if (m.lane !== lane) continue;
      const px = this.moverX(m, this.ht + tA);
      if (Math.abs(px - r.x) < bd) ((bd = Math.abs(px - r.x)), (bx = px));
    }
    return bx;
  }

  /** Crumbling tiles and sliding platforms: a tile that holds; the platforms when they come. */
  private planBlocks(r: Runner, sc2x?: number) {
    const b = r.b;
    const s = r.s;
    const lanes = this.L.lanes ?? [];
    if (b.sc2 && sc2x !== undefined && lanes.length && s > lanes[lanes.length - 1].s1) {
      b.tx = sc2x;
      return;
    }
    let lane = -1;
    for (let i = 0; i < lanes.length; i++) if (s < lanes[i].s1 && s > lanes[i].s0 - 3.6) ((lane = i), (i = 99));
    if (lane >= 0 && s < lanes[lane].s0) {
      b.tx = this.moverAim(r, lane);
      return;
    }
    if (lane >= 0) {
      // on a platform: where's the next one (or the tiles, or the floor after)?
      const nl = lane + 1 < lanes.length && lanes[lane + 1].s0 - lanes[lane].s1 < 6 ? lane + 1 : -1;
      if (nl >= 0) b.tx = this.moverAim(r, nl);
      else {
        const row = this.nextRow(lanes[lane].s1);
        b.tx = row > 0 && row - lanes[lane].s1 < 6 ? this.tileCol(r, row) : clamp(r.x, -3.5, 3.5);
      }
      return;
    }
    const row = this.nextRow(s + 0.4);
    b.tx = row > 0 ? this.tileCol(r, row) : clamp(r.x, -4, 4);
  }

  /** The first row of tiles past s (−1: none). */
  private nextRow(s: number) {
    const rows = this.L.tiles?.rows;
    if (rows) for (const rs of rows) if (rs > s) return rs;
    return -1;
  }

  /** FINALITY CLIMB: the boost (lined up first), the ledge, or the ramp round the bumpers. */
  private planClimb(r: Runner) {
    const b = r.b;
    const s = r.s;
    const c0 = this.c0;
    if (r.launched || (r.y > 3.4 && r.x < -4.4)) {
      b.tx = LEDGE_X;
      b.ts = c0 + 40;
      return;
    }
    const B0 = c0 + BOOST.s0,
      B1 = c0 + BOOST.s1;
    if (b.sc2 && s < B1 && r.y < 1) {
      const px = -6 + b.aim;
      b.tx = px;
      // (line up on the pad's line first, then straight at it)
      if (s < c0 + 0.3) b.ts = c0 + 1.6;
      else if (Math.abs(r.x - px) > b.tol && s < B0 - 1) ((b.ts = Math.min(r.s, B0 - 1.6)), (b.hold = true));
      else b.ts = c0 + 12;
      return;
    }
    if (s > c0 + 27.5) {
      b.tx = clamp(r.x, -5, 5);
      b.ts = c0 + 40;
      return;
    }
    let tx = clamp(1 + b.lane * 2.8, -3.2, 5.2);
    for (let i = 0; i < this.bumps.length; i++) {
      const bp = this.bumps[i];
      if (bp.s - s < -0.5 || bp.s - s > 5 || !(b.bumpSeen & (1 << i))) continue;
      if (Math.abs(tx - bp.x) < 1.9) tx = bp.x + (bp.x > 1 ? -2.2 : 2.2);
    }
    b.tx = tx;
    b.ts = s + 6;
  }

  /** Is this shutter up (clear over a body) all the way from t0 to t1? */
  private shutClear(sh: Shutter, t0: number, t1: number) {
    for (let t = t0; t <= t1 + 1e-3; t += 0.05) if (this.shutH(sh, t) * WALL_H < BODY_H + 0.35) return false;
    return true;
  }

  /**
   * The shutters: for each gate of the row ahead, when could we run through it with it up all the
   * way (as we misjudge its beat by gErr)? Take the soonest, hold in front of it if it isn't now.
   */
  private planShut(r: Runner, dt: number, lim: number) {
    const b = r.b;
    const k = b.k;
    const s = r.s;
    const rows = this.L.shutters!;
    let ri = -1;
    for (let i = 0; i < rows.length; i++)
      if (s < rows[i].s + WALL_D + 0.5) {
        ri = i;
        break;
      }
    if (ri < 0 || s < rows[ri].s - 10) {
      b.tx = clamp(b.lane * 2.4, -lim, lim);
      return;
    }
    const row = rows[ri];
    if (b.gRow !== ri) {
      b.gRow = ri;
      b.gate = -1;
      b.gErr = (this.rnd() * 2 - 1) * (1 - k) * 0.6;
      b.gWait = 0;
      b.gLook = 0;
      // (now and then a weak one doesn't read the lamps at all: straight at the nearest gate)
      b.gBlind = this.rnd() < 0.3 * (1 - k) * (1 - k);
      b.gGo = 0;
    }
    if (b.gBlind) {
      if (b.gate < 0) {
        let bd = 1e9;
        for (let i = 0; i < this.shutters.length; i++) if (this.shutters[i].row === ri && Math.abs(this.shutters[i].cx - r.x) < bd) ((bd = Math.abs(this.shutters[i].cx - r.x)), (b.gate = i));
      }
      b.tx = this.shutters[b.gate].cx;
      b.ts = row.s + 5;
      return;
    }
    const v = SPEED * r.spd;
    const pass = (WALL_D + 2 * RB + 0.3) / v;
    const m = 0.04 + 0.14 * k;
    // (in it already, or too close to stop: through)
    if (b.gate >= 0 && s > row.s - 1.0) {
      b.tx = this.shutters[b.gate].cx;
      b.ts = row.s + 5;
      return;
    }
    b.gLook -= dt;
    if (b.gLook <= 0 || b.gate < 0) {
      b.gLook = 0.1 + (1 - k) * 0.15;
      let best = -1,
        bc = 1e9;
      for (let i = 0; i < this.shutters.length; i++) {
        const sh = this.shutters[i];
        if (sh.row !== ri) continue;
        const dx = Math.abs(sh.cx - r.x);
        const ds = Math.max(0, row.s - RB - 0.1 - s);
        const travel = Math.hypot(dx * 1.15, ds) / v + (dx > 0.6 && ds < 2 ? 0.25 : 0);
        // (the soonest we could go and get through clean: now, or after waiting a beat)
        let wait = -1;
        for (let w = 0; w < sh.per; w += 0.1) {
          const t0 = this.ht + b.gErr + w + travel;
          if (this.shutClear(sh, t0 - m, t0 + pass + m)) {
            wait = w;
            break;
          }
        }
        if (wait < 0) continue;
        const c = travel + wait + (i === b.gate ? -0.35 : 0);
        if (c < bc) ((bc = c), (best = i));
      }
      if (best >= 0) b.gate = best;
      else if (b.gate < 0) b.gate = this.shutters.findIndex((q) => q.row === ri);
    }
    const sh = this.shutters[b.gate];
    const dx = Math.abs(sh.cx - r.x);
    const ds = Math.max(0, row.s - RB - 0.1 - s);
    const travel = Math.hypot(dx * 1.15, ds) / v;
    const t0 = this.ht + b.gErr + travel;
    b.tx = sh.cx;
    if (this.shutClear(sh, t0 - m, t0 + pass + m) || b.gWait > 1.4 + 3.5 * k) {
      // (once it's clear, the slow ones take a moment to go)
      b.gGo += dt;
      if (b.gGo > (1 - k) * 0.35 || r.s < row.s - 4) {
        b.ts = row.s + 5;
        if (dx > 0.5 && s > row.s - 2.2) b.ts = s + 0.6;
        return;
      }
    } else b.gGo = 0;
    // not now: wait in front of it (the impatient ones go anyway after a while)
    b.hold = true;
    b.ts = row.s - 1.9;
    if (s > row.s - 2.6) b.gWait += dt;
  }

  /** The turntables: from one to the next (the floor after the last). */
  private planDiscs(r: Runner) {
    const b = r.b;
    const ds = this.discs;
    let j = -1;
    if (r.surf && r.surf.kind === K_DISC) j = r.surf.ref;
    let next = j + 1;
    if (j < 0) {
      next = ds.length;
      for (let i = 0; i < ds.length; i++)
        if (ds[i].cs + ds[i].R * 0.3 > r.s) {
          next = i;
          break;
        }
    }
    if (next < ds.length) {
      const d = ds[next];
      b.tx = d.cx + b.lane * 0.6;
      b.ts = d.cs - (j < 0 && r.s < d.cs - d.R ? d.R * 0.2 : 0);
    } else {
      const last = ds[ds.length - 1];
      b.tx = clamp(last.cx + b.lane, -3, 3);
      b.ts = last.cs + last.R + 5;
    }
  }

  /** Islands over the void: the next one ahead, a spot well onto it. */
  private planHops(r: Runner) {
    const b = r.b;
    const cur = r.surf && this.slabSurfs.includes(r.surf) ? r.surf : null;
    const from = cur ? cur.s1 - 0.2 : r.s + 0.3;
    let nx: Surf | null = null;
    for (const sf of this.slabSurfs) if (sf.s0 > from && sf.s0 - r.s < 16 && (!nx || sf.s0 < nx.s0)) nx = sf;
    if (!nx) {
      b.tx = clamp(r.x, -4, 4);
      return;
    }
    const m = Math.min(1.3, (nx.x1 - nx.x0) / 2 - 0.2);
    b.tx = clamp(r.x + b.lane * 0.8, nx.x0 + m, nx.x1 - m);
    b.ts = nx.s0 + Math.min(3, (nx.s1 - nx.s0) / 2);
  }

  /** A meteor's ring where we are (or will be) and it's about to hit: get out of it. */
  private dodge(r: Runner) {
    const b = r.b;
    const k = b.k;
    let ex = 0,
      es = 0,
      hit = false;
    for (const m of this.mets) {
      if (!m.on || !(m.seen & (1 << r.i)) || m.t > 0.35 + 1.0 * k) continue;
      const la = Math.min(m.t, 0.35);
      const px = r.x + r.cx * la,
        ps = r.s + r.cs * la;
      const dx = px - m.x,
        ds = ps - m.s;
      const d = Math.hypot(dx, ds);
      if (d > m.R + RB + 0.5) continue;
      hit = true;
      const w = 1 / Math.max(0.3, d);
      ex += (d > 0.05 ? dx : 0) * w;
      es += (d > 0.05 ? ds : 1) * w;
    }
    if (!hit) return;
    // (out the way it pushes, onward if that holds, or sideways)
    const l = Math.hypot(ex, es) || 1;
    ex /= l;
    es /= l;
    const opts: [number, number][] = [
      [ex, es],
      [ex, Math.abs(es)],
      [Math.sign(ex) || 1, 0.3],
      [-(Math.sign(ex) || 1), 0.3],
      [0, 1],
    ];
    for (const [ox, os] of opts)
      if (this.floorOk(r, ox, os)) {
        b.tx = r.x + ox * 3;
        b.ts = r.s + os * 3;
        b.hold = false;
        return;
      }
  }

  private tileCol(r: Runner, row: number) {
    let best = r.x,
      bd = 1e9;
    for (const tl of this.tiles) {
      if (tl.s !== row) continue;
      let c = Math.abs(tl.x - r.x);
      if (tl.st >= 2) c += 50;
      else if (tl.st === 1) c += 5 * r.b.k;
      if (c < bd) ((bd = c), (best = tl.x));
    }
    return best;
  }

  /** The nearest door of a wall in this state (−1: none). */
  private nearestDoor(wi: number, x: number, st: number) {
    let best = -1,
      bd = 1e9;
    for (let i = 0; i < this.doors.length; i++) {
      const d = this.doors[i];
      if (d.wall !== wi || d.st !== st) continue;
      const c = Math.abs(d.cx - x);
      if (c < bd) ((bd = c), (best = i));
    }
    return best;
  }

  /** A door to try: an open one (followers), one that glinted (sharp eyes), or a guess. */
  private pickDoor(r: Runner, wi: number) {
    const k = r.b.k;
    const open = this.nearestDoor(wi, r.x, 1);
    if (open >= 0 && this.rnd() < 0.45 + 0.5 * k) return open;
    const cand: number[] = [];
    for (let i = 0; i < this.doors.length; i++) if (this.doors[i].wall === wi && this.doors[i].st !== 2) cand.push(i);
    if (this.rnd() < 0.1 + 0.6 * k) {
      let best = -1,
        bd = 1e9;
      for (const i of cand)
        if (this.doors[i].real && Math.abs(this.doors[i].cx - r.x) < bd) ((bd = Math.abs(this.doors[i].cx - r.x)), (best = i));
      if (best >= 0) return best;
    }
    // a guess, likely a near one
    cand.sort((a, b) => Math.abs(this.doors[a].cx - r.x) - Math.abs(this.doors[b].cx - r.x));
    const n = Math.min(cand.length, 3);
    return cand[Math.floor(this.rnd() * this.rnd() * n)] ?? cand[0];
  }

  /** Will this hammer be clear of you while you run under it (as you misjudge it by `err` s)? */
  private hamSafe(h: Hammer, r: Runner, err: number, k: number) {
    const v = SPEED * r.spd;
    const lag = Math.hypot(r.cx, r.cs) < 2 ? 0.18 : 0;
    const z0 = h.s - HEAD_S - RB - 0.1,
      z1 = h.s + HEAD_S + RB + 0.1;
    const t0 = Math.max(0, (z0 - r.s) / v) + lag,
      t1 = (z1 - r.s) / v + lag;
    // (a margin either side: the sharp ones are more precise, not more timid)
    const m = 0.05 + 0.1 * k;
    const w = TAU / h.T;
    for (let t = t0 - m; t <= t1 + m; t += 0.04) {
      const th = HAM_AMP * Math.sin((this.ht + t + err) * w + h.ph);
      const hx = HAM_L * Math.sin(th),
        hy = HAM_Y - HAM_L * Math.cos(th);
      if (Math.abs(hx - r.x) < HEAD_X + RB + 0.15 && hy - HEAD_Y < r.y + BODY_H) return false;
    }
    return true;
  }

  // ---- the look ------------------------------------------------------------------------------------

  private render(dt: number) {
    const now = this.clk;
    // a row goes glassy while the camera is behind it and the one it follows is through it (the others
    // stay solid: the next one ahead is the one to read)
    const eyeS = -this.w.camera.position.z;
    const tgt = this.rs ? this.rs[this.camI] : null;
    for (const row of this.doorRows) this.fadeRow(row, eyeS, tgt, dt);
    for (const row of this.shutRows) this.fadeRow(row, eyeS, tgt, dt);
    this.shadowAim(dt);
    if (this.doors.length) this.renderDoors(now);
    // the shutters: rolled up into their box, or down (a hazard bar at the foot); the lamp over each and
    // the same light on the street in front of it (green, blinking amber, red)
    if (this.shutters.length) {
      this.shutters.forEach((sh, i) => {
        const row = this.shutRows[sh.row];
        const z = -(sh.sf.s0 + WALL_D / 2);
        const hgt = WALL_H - sh.bot;
        if (hgt < 0.05) row.p!.put(sh.k, sh.cx, WALL_H, z, 0, 0, 0);
        else row.p!.put(sh.k, sh.cx, sh.bot + hgt / 2, z, sh.w - 0.04, hgt, WALL_D - 0.2);
        if (hgt < 0.05 || row.op < 0.6) this.pBar.put(i, sh.cx, WALL_H, z, 0, 0, 0);
        else this.pBar.put(i, sh.cx, sh.bot + 0.17, z, sh.w - 0.02, 0.34, WALL_D - 0.08);
        const left = this.shutLeft(sh, this.ht);
        const c = left < 0 ? LAMP_STOP : left > SH_WARN ? LAMP_GO : Math.floor(now * 9) % 2 ? LAMP_WARN : LAMP_OFF;
        // (a row gone glassy is behind whoever the camera follows: its lights go out of the camera's face)
        const k = row.op < 0.6 ? 0 : 1;
        this.pLamp.put(i, sh.cx, WALL_H + 0.5, -(sh.sf.s0 - 0.3), Math.min(1.7, sh.w * 0.62) * k, 0.5 * k, 0.16 * k);
        this.pLamp.mesh.setColorAt(i, c);
        this.pPad.put(i, sh.cx, 0.04, -(sh.sf.s0 - 0.8), (sh.w - 0.5) * k, 0.05 * k, 0.9 * k);
        this.pPad.mesh.setColorAt(i, c);
      });
      for (const row of this.shutRows) row.p!.flush();
      this.pLamp.flush();
      this.pPad.flush();
      this.pBar.flush();
    }
    for (let i = 0; i < this.discs.length; i++) this.discTops[i].rotation.y = this.discs[i].ang;
    if (this.mets.length) this.renderMeteors();
    if (this.sweeps.length) this.renderSweeps();
    if (this.hams.length) this.renderHams();
    // the seesaws
    for (const ss of this.saws) ss.g.rotation.z = ss.ang;
    // the tiles: steady, shaking (going red), falling, gone
    if (this.tiles.length) {
      const size = this.L.tiles!.size;
      this.tiles.forEach((tl, i) => {
        if (tl.st === 3) return this.pTile.put(i, 0, 0, 0, 0, 0, 0);
        const sh = tl.st === 1 ? (Math.sin(now * 70 + i) * 0.06 * tl.t) / TILE_SHAKE : 0;
        this.pTile.put(i, tl.x + sh, tl.y - 0.45, -tl.s, size - 0.08, 0.9, size - 0.08, sh * 0.6, 0, sh);
        const base = this.tileTone(i);
        this.pTile.tint(i, tl.st === 1 ? (Math.floor(now * 10) % 2 ? "#ff6b6b" : base) : tl.st === 2 ? "#ff8a8a" : base);
      });
      this.pTile.flush();
    }
    if (this.movers.length) {
      this.movers.forEach((m, i) => this.pMover.put(i, m.x, -0.3, -(m.sf.s0 + m.sf.s1) / 2, m.hw * 2, 0.6, m.sf.s1 - m.sf.s0));
      this.pMover.flush();
      const hull = this.pHull;
      if (hull) {
        // (a punt: its hull down to the water, rocking a little; a raised end each side)
        const hy = this.hullY;
        this.movers.forEach((m, i) => {
          const len = m.sf.s1 - m.sf.s0;
          const rock = Math.sin(now * 2.2 + i * 1.7) * 0.03;
          const z = -(m.sf.s0 + m.sf.s1) / 2;
          hull.put(i * 3, m.x, (hy - 0.6) / 2, z, m.hw * 2 - 0.3, -0.6 - hy, len - 0.5, 0, 0, rock);
          for (const e of [1, 2]) hull.put(i * 3 + e, m.x + (e === 1 ? 1 : -1) * (m.hw + 0.15), -0.25, z, 0.5, 0.55, len * 0.7, 0, 0, (e === 1 ? -1 : 1) * 0.5);
        });
        hull.flush();
      }
    }
    if (this.bumps.length) {
      this.bumps.forEach((b, i) => {
        const k = 1 + b.pulse * 0.35 + Math.sin(now * 5 + i) * 0.03;
        this.pBump.put(i, b.x, b.y + BUMP_H / 2, -b.s, BUMP_R * 2 * k, BUMP_H, BUMP_R * 2 * k);
        this.pBumpTop.put(i, b.x, b.y + BUMP_H + 0.04, -b.s, BUMP_R * 1.4 * k, 0.1, BUMP_R * 1.4 * k);
      });
      this.pBump.flush();
      this.pBumpTop.flush();
    }
    if (this.boostGlow) this.boostGlow.visible = Math.floor(now * 4) % 2 === 0;
    if (this.pArcOn) this.pArc.mesh.visible = Math.floor(now * 3) % 3 !== 0;
    this.gate.position.y = this.started ? Math.min(8, this.gate.position.y + dt * 9) : 1.0;
    // the dressing
    this.tick?.(now, dt);
    // the snarks
    for (const r of this.rs) this.pose(r, dt);
  }

  /** A row across the course: glassy while the camera is behind it and the one it follows is through it. */
  private fadeRow(row: Row, eyeS: number, tgt: Runner | null, dt: number) {
    const want = tgt && eyeS < row.s + WALL_D && tgt.s > row.s + 0.3 && tgt.s - row.s < 12 ? 0.16 : 1;
    if (row.op === want) return;
    const op = Math.abs(want - row.op) < 0.01 ? want : row.op + (want - row.op) * Math.min(1, dt * 8);
    row.op = op;
    row.frame.opacity = row.panel.opacity = op;
    row.ink.opacity = op * op;
    const solid = op > 0.95;
    row.frame.depthWrite = row.panel.depthWrite = row.ink.depthWrite = solid;
    for (const m of row.cast) m.castShadow = solid;
  }

  /** The ground's height where the camera looks, for the sun's shadow map (shadows.ts): the course climbs. */
  private shadowAim(dt: number) {
    const cam = this.w.camera;
    cam.getWorldDirection(_v2);
    // (the floor some 14 m along its look; over a gap, the last one known)
    const s = -(cam.position.z + _v2.z * 14);
    let y = NaN;
    for (const sf of this.slabSurfs) {
      if (s < sf.s0 - 2 || s > sf.s1 + 2) continue;
      const top = this.topOf(sf, 0, clamp(s, sf.s0, sf.s1));
      if (!(y >= top)) y = top;
    }
    if (y === y) this.shY += (y - this.shY) * (dt > 0 ? Math.min(1, dt * 3) : 1);
    this.w.scene.userData.shadowY = this.shY;
  }

  /** The doors: shut ones stand (the invalid shake), the valid glint now and then. */
  private renderDoors(now: number) {
    this.doors.forEach((d, i) => {
      const z = -(d.sf.s0 + WALL_D / 2);
      const pDoor = this.doorRows[d.wall].p!;
      // (a wall gone glassy: its marks go with it)
      const seen = this.doorRows[d.wall].op > 0.6;
      if (d.st === 1) {
        pDoor.put(d.k, 0, 0, 0, 0, 0, 0);
        this.pSigil.put(i, 0, 0, 0, 0, 0, 0);
      } else {
        const sh = d.shake > 0 ? Math.sin(now * 60) * 0.08 * d.shake : 0;
        pDoor.put(d.k, d.cx + sh, WALL_H / 2, z, DOOR_W - 0.06, WALL_H - 0.04, WALL_D - 0.1);
        if (seen) this.pSigil.put(i, d.cx + sh, 2.1, -d.sf.s0 + 0.03, 1.5, 1.5, 1);
        else this.pSigil.put(i, 0, 0, 0, 0, 0, 0);
        let gl = 0;
        if (d.real && d.st === 0) {
          const ph = (now / 2.3 + d.ph / TAU) % 1;
          gl = ph < 0.16 ? Math.sin((ph / 0.16) * Math.PI) : 0;
        }
        _c.set("#2a1f55").lerp(GLINT, gl);
        this.pSigil.mesh.setColorAt(i, d.st === 2 ? _c.set("#5a1020") : _c);
        pDoor.mesh.setColorAt(d.k, d.st === 2 ? _c2.set("#7a6f8a") : _c2.set(DOOR_COLS[d.k]).lerp(WHITE, gl * 0.55));
      }
      if (d.st === 2 && seen) this.pCross.put(i, d.cx, 2.1, -d.sf.s0 + 0.05, 2.0, 2.0, 1);
      else this.pCross.put(i, 0, 0, 0, 0, 0, 0);
    });
    for (const row of this.doorRows) row.p!.flush();
    this.pSigil.flush();
    this.pCross.flush();
  }

  private renderSweeps() {
    // the sweeps' arms
    let ai = 0;
    for (const sw of this.sweeps)
      for (let k = 0; k < sw.n; k++) {
        const a = sw.ang + (k * TAU) / sw.n;
        const ux = Math.cos(a),
          us = Math.sin(a);
        const L = sw.R - 0.4;
        this.pArm.put(ai++, sw.cx + ux * (L / 2 + 0.4), BAR_Y, -(sw.cs + us * (L / 2 + 0.4)), BAR_R * 2, L, BAR_R * 2, 0, a, Math.PI / 2, "YZX");
      }
    this.pArm.flush();
  }

  private renderHams() {
    // the hammers
    this.hams.forEach((h, i) => {
      const z = -h.s;
      const sx = Math.sin(h.th),
        cy = Math.cos(h.th);
      this.pHamArm.put(i, (HAM_L / 2) * sx, HAM_Y - (HAM_L / 2) * cy, z, 0.28, HAM_L, 0.28, 0, 0, h.th);
      this.pHead.put(i, h.x, h.y, z, HEAD_Y * 2, HEAD_S * 2, HEAD_Y * 2, Math.PI / 2, 0, h.th, "ZXY");
      for (const e of [0, 1]) {
        const off = (e ? 1 : -1) * (HEAD_S + 0.02);
        this.pCap.put(i * 2 + e, h.x, h.y, z + off, HEAD_Y * 1.5, 0.06, HEAD_Y * 1.5, Math.PI / 2, 0, h.th, "ZXY");
      }
      const over = Math.abs(h.x) < 3.5 + HEAD_X;
      const hgt = h.y - HEAD_Y;
      const ss = over ? clamp(2.6 - hgt * 0.35, 0.8, 2.6) : 0;
      this.pShadow.put(i, h.x, 0.04, z, ss, ss * 1.1, 1, -Math.PI / 2, 0, 0);
    });
    this.pHamArm.flush();
    this.pHead.flush();
    this.pCap.flush();
    this.pShadow.flush();
  }

  /** The meteors: the ring filling up where it'll strike, the rock coming down its slant, its trail. */
  private renderMeteors() {
    this.mets.forEach((m, i) => {
      if (!m.on) {
        this.pRing.put(i, 0, -999, 0, 0, 0, 0);
        this.pMetFill.put(i, 0, -999, 0, 0, 0, 0);
        this.pRock.put(i, 0, -999, 0, 0, 0, 0);
        for (let k = 0; k < 4; k++) this.pTrail.put(i * 4 + k, 0, -999, 0, 0, 0, 0);
        return;
      }
      const f = 1 - m.t / m.T;
      const pulse = 1 + Math.sin(this.clk * 18) * 0.04 * f;
      const D = m.R * 2 * pulse;
      this.pRing.put(i, m.x, m.y + 0.05, -m.s, D * 1.25, D * 1.25, 1, -Math.PI / 2, 0, 0);
      this.pMetFill.put(i, m.x, m.y + 0.04, -m.s, D * f, D * f, 1, -Math.PI / 2, 0, 0);
      // (the rock falls along its slant, faster at the end)
      const e = f * f;
      const hx = m.x + m.ox * (1 - e),
        hy = m.y + MET_Y * (1 - e) + 0.4,
        hs = m.s + m.os * (1 - e);
      this.pRock.put(i, hx, hy, -hs, 1.3, 1.1, 1.2, this.clk * 3 + i, this.clk * 2, 0);
      for (let k = 0; k < 4; k++) {
        const b = (k + 1) * 0.07;
        const sz = 0.9 - k * 0.18;
        this.pTrail.put(i * 4 + k, hx + (m.ox / MET_Y) * b * MET_Y * 0.25, hy + b * 9, -(hs + (m.os / MET_Y) * b * MET_Y * 0.25), sz, sz, sz);
      }
    });
    this.pRing.flush();
    this.pMetFill.flush();
    this.pRock.flush();
    this.pTrail.flush();
  }

  private pose(r: Runner, dt: number) {
    const a = r.a;
    a.pos.set(r.x, r.y, -r.s);
    a.yaw = r.yaw;
    a.grounded = r.grounded;
    a.vy = r.vy;
    const fl = r.mode === M_FALL ? -1e9 : this.floor(r.x, r.s, r.y + 0.05);
    a.floor = fl > -1e8 && r.y - fl < 12 ? fl : null;
    a.legs = r.mode === M_TUMBLE || r.mode === M_FALL ? 8 : r.mode === M_DIVE || r.mode === M_BELLY || r.mode === M_DAZE ? 0 : null;
    a.sync(dt, this.clk);
    const tm = r.tum.rotation;
    const k = Math.min(1, 14 * dt);
    if (r.mode === M_TUMBLE || r.mode === M_FALL) {
      tm.x += r.spinV * dt * (r.grounded ? 0.4 : 1);
      tm.z = Math.sin(this.clk * 9 + r.i) * 0.5;
    } else {
      // back upright (the shortest way round from a spin)
      tm.x = tm.x % TAU;
      if (tm.x > Math.PI) tm.x -= TAU;
      if (tm.x < -Math.PI) tm.x += TAU;
      let want = 0;
      if (r.mode === M_DIVE) want = 1.25;
      else if (r.mode === M_BELLY) want = 1.45;
      else if (r.shoveT > 0) want = 0.45;
      else if (r.mode === M_RUN) want = Math.min(0.2, Math.hypot(r.cx, r.cs) * 0.025);
      tm.x += (want - tm.x) * k;
      tm.z = r.mode === M_DAZE ? Math.sin(this.clk * 14) * 0.22 : tm.z * (1 - k);
    }
    // the arms: out in a shove, ahead in a dive, flailing in a tumble
    const bd = a.body;
    const flail = r.mode === M_TUMBLE || r.mode === M_FALL;
    if (r.arms > 0 && r.mode === M_RUN) {
      bd.holdArms(true);
      bd.armR.rotation.set(-1.55, 0, 0.12);
      bd.armL.rotation.set(-1.55, 0, -0.12);
      bd.foreArmR.rotation.set(0, 0, 0);
      bd.foreArmL.rotation.set(0, 0, 0);
    } else if (r.mode === M_DIVE || r.mode === M_BELLY) {
      bd.holdArms(true);
      bd.armR.rotation.set(-2.9, 0, 0.15);
      bd.armL.rotation.set(-2.9, 0, -0.15);
      bd.foreArmR.rotation.set(0, 0, 0);
      bd.foreArmL.rotation.set(0, 0, 0);
    } else if (flail) {
      bd.holdArms(true);
      const f = this.clk * 24 + r.i;
      bd.armR.rotation.set(-2.6 + Math.sin(f) * 0.7, 0, -0.9);
      bd.armL.rotation.set(-2.6 + Math.sin(f + 2) * 0.7, 0, 0.9);
      bd.foreArmR.rotation.set(-0.3, 0, 0);
      bd.foreArmL.rotation.set(-0.3, 0, 0);
    } else bd.holdArms(false);
    // back from a fall: blinking a moment
    a.root.visible = !(r.ghost > 0 && Math.floor(this.clk * 14) % 2 === 0) && !(r.mode === M_FALL && (r.y < r.gy - 30 || (this.L.water !== undefined && r.y < this.L.water - 1.4)));
  }

  // ---- the camera ------------------------------------------------------------------------------------

  /** Who the camera rides with: you (until a beat after your finish), else the race's front. */
  private follow() {
    const me = this.rs.find((r) => r.p.human);
    if (me && (me.mode !== M_DONE || this.t - me.fin < 1.6)) return me.i;
    let best = this.camI,
      bs = -1;
    const cur = this.rs[this.camI];
    for (const r of this.rs) {
      if (r.mode === M_DONE) continue;
      const v = r.best + (r.i === this.camI ? 6 : 0);
      if (v > bs) ((bs = v), (best = r.i));
    }
    if (cur.mode === M_DONE && this.t - cur.fin < 1.6) return cur.i;
    return best;
  }

  private playEye(r: Runner, dt: number, snap = false) {
    const fallen = r.mode === M_FALL;
    const gy = fallen ? this.camY : r.grounded ? r.y : Math.max(r.gy, Math.min(r.y, r.gy + 1.4));
    const k = snap ? 1 : 1 - Math.exp(-5 * dt);
    this.camY += (gy - this.camY) * (snap ? 1 : 1 - Math.exp(-3 * dt));
    this.camX += (r.x - this.camX) * k;
    this.camS += (r.s + (fallen ? 0 : r.cs * 0.12) - this.camS) * k;
    this.eye.set(this.camX * 0.55, this.camY + 6.8, -(this.camS - 9.6));
    this.at.set(this.camX * 0.72, this.camY + 0.9, -(this.camS + 6.8));
  }

  private camera(dt: number) {
    if (this.over) {
      const w = this.rs[this.over[0]];
      const me = this.rs.find((r) => r.p.human);
      const r = me && me.mode === M_DONE ? me : w.mode === M_DONE ? w : this.rs[this.camI];
      if (r.mode === M_DONE) {
        this.eye.set(r.x * 0.5, r.y + 3.4, -(r.s - 6.5));
        this.at.set(r.x * 0.8, r.y + 1.2, -r.s);
        this.cam.to(this.eye, this.at, dt, 2.5);
      } else {
        this.playEye(r, dt);
        this.cam.to(this.eye, this.at, dt, 3.5);
      }
      this.cam.apply(dt);
      return;
    }
    const i = this.follow();
    if (i !== this.camI) this.camI = i;
    const r = this.rs[this.camI];
    if (r.mode === M_DONE && this.t - r.fin > 0.5) {
      // (home: close, in front of the finisher, who turns to face back down the course)
      this.eye.set(r.x * 0.5, r.y + 3.4, -(r.s - 6.5));
      this.at.set(r.x * 0.8, r.y + 1.2, -r.s);
      this.cam.to(this.eye, this.at, dt, 2.2);
      this.camS = r.s;
      this.camY = r.y;
    } else {
      this.playEye(r, dt);
      this.cam.to(this.eye, this.at, dt, 4, 6);
    }
    this.cam.apply(dt);
  }

  view() {
    return this.w;
  }

  // ---- the HUD ------------------------------------------------------------------------------------

  private say(s: string, c: string, dur: number, size: number, y = H * 0.32, delay = 0) {
    this.banners.push({ s, t: this.clk + delay, dur, c, size, y });
  }
  private pop(seat: number, s: string, c: string, big: boolean) {
    this.pops.push({ seat, s, t: this.clk, c, big });
  }

  /** The live places: the finishers by time, then the rest by how far they are. */
  private places() {
    const rest = this.rs.filter((r) => r.mode !== M_DONE).sort((a, b) => b.s + (b.mode === M_FALL ? -3 : 0) - (a.s + (a.mode === M_FALL ? -3 : 0)) || a.i - b.i);
    return [...this.done, ...rest.map((r) => r.i)];
  }

  draw(g: CanvasRenderingContext2D) {
    const cam = this.w.camera;
    if (this.hurt > 0) {
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, `rgba(255,40,60,${0.38 * this.hurt})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
    // the tags (dazed: stars round the head)
    for (const r of this.rs) {
      if (r.mode === M_FALL && r.y < r.gy - 4) continue;
      const sp = toScreen(r.a.head(_v).setY(r.y + 2.75 * SCALE), cam);
      if (!sp.on) continue;
      tag(g, r.p, sp.x, sp.y, r.ghost > 0 ? 0.6 : 1);
      if (r.mode === M_DAZE || (r.mode === M_TUMBLE && r.grounded)) {
        for (let k = 0; k < 3; k++) {
          const a = this.clk * 7 + (k * TAU) / 3;
          shout(g, "✦", sp.x + Math.cos(a) * 20, sp.y + 22 + Math.sin(a) * 6, 14, "#ffe36b");
        }
      }
    }
    // the words over the heads
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      const k = (this.clk - p.t) / 1.0;
      if (k >= 1) {
        this.pops.splice(i, 1);
        continue;
      }
      const r = this.rs[p.seat];
      const sp = toScreen(_v.set(r.x, r.y + 3.1 * SCALE, -r.s), cam);
      if (!sp.on) continue;
      const sc = backOut(Math.min(1, k * 4));
      g.globalAlpha = k > 0.65 ? (1 - k) / 0.35 : 1;
      shout(g, p.s, sp.x, sp.y - 26 - k * 34, (p.big ? 26 : 18) * sc, p.c);
      g.globalAlpha = 1;
    }
    this.panels(g);
    this.track(g);
    if (!this.over) clock(g, Math.max(0, this.cap - this.t));
    const me = this.rs.find((r) => r.p.human);
    if (me && this.started && this.t < 6 && !this.over) this.hints(g, this.t);
    if (me && me.mode === M_FALL && me.mt < 0.85) {
      g.save();
      g.globalAlpha = 0.85;
      shout(g, T("BACK TO THE CHECKPOINT…", "回到检查点…"), W / 2, H * 0.62, 22, "#ffffff");
      g.restore();
    }
    for (let i = this.banners.length - 1; i >= 0; i--) {
      const b = this.banners[i];
      const k = (this.clk - b.t) / b.dur;
      if (k >= 1) {
        this.banners.splice(i, 1);
        continue;
      }
      banner(g, b.s, k, b.c, b.y, b.size);
    }
  }

  /** The corners: each one's place (or ✓ and the time), the stretch they're on. */
  private panels(g: CanvasRenderingContext2D) {
    const pl = this.places();
    const vals = this.rs.map((r) => {
      const n = pl.indexOf(r.i);
      return r.mode === M_DONE ? `${r.fin.toFixed(1)}s` : ["1st", "2nd", "3rd", "4th"][n];
    });
    const sub = this.rs.map((r) => (r.mode === M_DONE ? T("FINAL ✓", "已确认 ✓") : r.mode === M_FALL ? T("OOPS…", "掉了…") : T(this.secs[this.secOf(r.s)].sh, this.secs[this.secOf(r.s)].shZh)));
    corners(g, this.players, vals, { lead: [pl[0]], sub });
  }

  /**
   * Where the course's bar sits along the bottom: between the two corner panels; on a touch screen
   * (those panels are up under the top ones) in the room between the thumbs, a little bigger.
   */
  private bar() {
    const b = this.barBox;
    b.x0 = 246;
    b.x1 = 714;
    b.k = 1;
    if (HUD.thumbs) {
      b.k = Math.min(1.25, HUD.k);
      b.x0 = Math.max(150, HUD.free[0] + padAir() + 16 * b.k);
      b.x1 = Math.min(810, HUD.free[1] - padAir() - 16 * b.k);
    }
    b.y = H - 11 - 19 * b.k;
    return b;
  }
  private barBox = { x0: 246, x1: 714, y: H - 30, k: 1 };

  /** The course along the bottom: the stretches in their colours, the four on it. */
  private track(g: CanvasRenderingContext2D) {
    const { x0, x1, y, k } = this.bar();
    const F = this.finS;
    const X = (s: number) => x0 + (clamp(s, 0, F) / F) * (x1 - x0);
    rr(g, x0 - 16 * k, y - 19 * k, x1 - x0 + 32 * k, 38 * k, 19 * k);
    g.fillStyle = "rgba(14,9,36,0.82)";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "rgba(255,255,255,0.25)";
    g.stroke();
    const secs = this.secs;
    for (let i = 0; i < secs.length; i++) {
      const a = X(Math.max(0, secs[i].s)),
        b = X(i + 1 < secs.length ? secs[i + 1].s : F);
      rr(g, a + 1, y - 4 * k, Math.max(2, b - a - 2), 8 * k, 4 * k);
      g.fillStyle = secs[i].c;
      g.fill();
    }
    // the checkpoints, the finish flag (a little chequered square)
    for (let i = 1; i < this.L.cps.length; i++) {
      const cx = X(this.L.cps[i].s);
      g.fillStyle = this.flagHit[i] ? "#8ee35b" : "rgba(255,255,255,0.55)";
      g.fillRect(cx - 1, y - 9 * k, 2, 18 * k);
    }
    const q = 4 * k;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 4; j++) {
        g.fillStyle = (i + j) % 2 ? "#15101f" : "#ffffff";
        g.fillRect(x1 - q * 0.5 + i * q, y - q * 2 + j * q, q, q);
      }
    // the four (you on top, bigger)
    const order = this.rs.slice().sort((a, b) => (a.p.human ? 1 : 0) - (b.p.human ? 1 : 0));
    for (const r of order) {
      const s = r.mode === M_DONE ? F : Math.max(0, r.mode === M_FALL ? r.best : r.s);
      const bx = X(s);
      const sz = (r.p.human ? 26 : 20) * k;
      badge(g, r.p, bx, y - (r.p.human ? 3 : 1) * k, sz, { dim: r.mode === M_FALL });
      if (r.mode === M_DONE) shout(g, "✓", bx + 10 * k, y - 12 * k, 13 * k, "#8ee35b");
    }
  }

  /** The first seconds: how to play, along the bottom. */
  private hints(g: CanvasRenderingContext2D, t: number) {
    const a = t < 0.3 ? t / 0.3 : t > 5.2 ? (6 - t) / 0.8 : 1;
    g.save();
    g.globalAlpha = clamp(a, 0, 1);
    // (a touch screen: the stick and the buttons say RUN, JUMP and SHOVE themselves; the strip keeps
    // the one move they don't, short enough for the room between the thumbs)
    const touch = touchy();
    const dive = touch ? T(`${actWord(actsOf("run").a!)} again in the air: DIVE`, `空中再按「${actWord(actsOf("run").a!)}」：飞扑`) : "";
    let w = 470;
    if (touch) {
      g.font = `900 12px ${FONT}`;
      w = Math.ceil(g.measureText(dive).width) + 62;
    }
    // (a small screen: the strip grows from its middle, so its words read and keep apart; it sits
    // over the course's bar, between the thumbs when it fits there, else above the pad)
    const k = fpx(12) / 12;
    const b = this.bar();
    let x = W / 2;
    let y = Math.min(H - 78, b.y - 19 * b.k - 8 - 18 * k);
    if (HUD.thumbs) {
      if (w * k <= HUD.free[1] - HUD.free[0] - 2 * padAir()) x = (HUD.free[0] + HUD.free[1]) / 2;
      else y = overPad(y, 36 * k);
    }
    grow(g, x, y, 12, () => this.hintsAt(g, x, y, w, dive));
    g.restore();
  }
  private hintsAt(g: CanvasRenderingContext2D, cx: number, y: number, w: number, dive: string) {
    rr(g, cx - w / 2, y - 18, w, 36, 18);
    g.fillStyle = "rgba(14,9,36,0.78)";
    g.fill();
    let x = cx - w / 2 + 22;
    if (dive) {
      padBtn(g, "a", x, y, 12, actsOf("run").a);
      text(g, dive, x + 20, y + 1, 12, "#fff", "left", 900);
      return;
    }
    keycap(g, "↑", x, y, 24, 24, { size: 13 });
    text(g, T("RUN", "跑"), x + 18, y + 1, 12, "#fff", "left", 900);
    x += 70;
    padBtn(g, "a", x, y, 12);
    text(g, T("JUMP", "跳"), x + 18, y + 1, 12, "#fff", "left", 900);
    x += 82;
    padBtn(g, "a", x, y, 12);
    text(g, T("again in the air: DIVE", "空中再按：飞扑"), x + 18, y + 1, 12, "#fff", "left", 900);
    x += 196;
    padBtn(g, "b", x, y, 12);
    text(g, T("SHOVE", "推"), x + 18, y + 1, 12, "#fff", "left", 900);
  }

  result() {
    return this.over;
  }

  humanOut() {
    const me = this.rs.find((r) => r.p.human);
    return !!me && me.mode === M_DONE && !this.over && !this.bots.has(me.i);
  }

  dispose() {
    if (typeof location !== "undefined" && location.search.includes("runbot")) delete (window as unknown as { __run?: unknown }).__run;
    for (const r of this.rs) r.a.dispose();
    disposeScene(this.w.scene);
  }
}

export const RUN: MiniDef = {
  key: "run",
  title: "CONSENSUS RUN",
  titleZh: "共识大冲关",
  tag: "Race your transaction to finality: over ZStreet, through a night market, in low orbit",
  tagZh: "带着你的交易冲向最终确认：ZStreet 上空、夜市、近地轨道",
  help: "Arrows run, A jumps (again in the air: dive), B shoves. Dodge what swings, sweeps and slams. First through FINALITY wins; fall off and you're back at the checkpoint.",
  helpZh: "方向键跑，A 跳（空中再按：飞扑），B 推人。躲开摆锤、横扫和落下的东西。最先冲过「最终确认」者胜；掉下去就回到检查点。",
  pad: ["left", "right", "up", "down", "a", "b"],
  tap: false,
  color: "#8ee35b",
  song: "bouncy",
  ambience: "city-day",
  variants: RUN_LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `run-${l.key}`, song: l.song, ambience: l.ambience })),
  make: (players, rnd, variant) => new Run(players, rnd, RUN_LEVELS.find((l) => l.key === variant) ?? RUN_LEVELS[Math.floor(rnd() * RUN_LEVELS.length) % RUN_LEVELS.length]),
};
export default RUN;
