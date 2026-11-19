/**
 * FORGERY GAP (伪造深渊): ZK PARTY's hidden-path crossing. Four zkSNARKs cross a wide field of
 * proven tiles floating over a gap, high above ZStreet. Every tile carries a proof glyph: the ones
 * with a valid proof hold, the FORGERIES (counterfeit notes, the bug Zcash quietly fixed in 2018)
 * shatter the moment you stand on them (a glitch, a short shake, then they burst) and you drop into
 * the rejection net far below, which flings you back to the last checkpoint.
 *
 * Nobody knows the true path at first: it is found together. A forgery that broke stays a hole; a
 * tile someone stood on safely glows (bright for a moment, faintly ever after). So whoever leads
 * takes the risk and the ones behind learn from it: test a tile yourself, wait for a rival to do it,
 * or shove a rival onto one (B) and watch what happens. Sharp eyes get a tell: a sloppy forgery's
 * glyph sits a little crooked and now and then glitches (a jump sideways, a magenta flash). Not every
 * forgery is sloppy, and the later stretches have fewer of them.
 *
 * Three stretches that grow, named after the shielded pools in order: SAPLING (4 tiles wide, 6 deep),
 * ORCHARD (6 × 7), IRONWOOD (8 × 8), a checkpoint pad between them; each wider, with fewer valid tiles
 * off the true path and fewer sloppy forgeries. EXPOSURE comes at 26 s: THE TRACKER's probe rig (a
 * chain-analysis bot that links transparent coins) rides along the field's side and its beam sweeps
 * from the start to the finish, breaking every transparent tile on the way (valid tiles until then:
 * they flash orange with a T-ADDR stamp before they go), so a path everyone trusted may be cut and
 * the stragglers must move. The first across ranks first; the game ends when three are across, or at
 * the 60 s cap, where the rest rank by how far they got (and who got there first).
 *
 * Three levels (forge-levels/levels.ts: a layout, a look, a twist each): SKYWAY (the above, over
 * ZStreet by day), SPROUT RUINS (a foggy night; a lighthouse's beam sweeps the field and shows the
 * forgeries in red where it shines; the fog rolls in at 30 s) and HALO SPIRE (a winding stair that
 * climbs a tower at sunset to its helipad; gusts, called by the windsocks, blow everyone sideways).
 * EXPOSURE and the transparent tiles are SKYWAY's alone.
 *
 * Arrows run (screen-relative), A jumps (over a hole, over a tile you don't trust, onto a tile you
 * know), B shoves: a short wind-up with an arrow on the floor, a lunge; whoever it meets slides about
 * a tile. A hop dodges it.
 *
 * The AIs (by skill): a memory of what held (the weak forget faint glows), the tell read more or less
 * often (and sometimes pinned on the wrong tile), a risk appetite and a hesitation at every unknown
 * tile, longer when a rival might try it first; they route over known tiles (jumping holes), and
 * greedily shove a rival standing in front of an unknown tile or a hole.
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { FONT, H, W, clamp, lerp, ord, rr, sfx, shout, sound, text, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { music } from "../music";
import { Avatar, CamRig, Fx3, GEO, banner, block, canvasTex, clock, corners, disposeScene, glow, label, outline, qBlock, tag, toScreen, toon, toonSteps, short, world, yawOf } from "../k3";
import { LEVELS, PITCH, plan, type ForgeLevel, type Pad, type Seg } from "./forge-levels/levels";
import { Decor } from "./forge-levels/decor";

// ---- the rules -----------------------------------------------------------------------------------

/** The time cap (s). */
const LIMIT = 60;
/** The tiles: their width, thickness (the pitch: levels.ts); how far into a tile its middle (the trigger) starts; how far past its side the feet still hold. */
const TILE = 1.84;
const TH = 0.55;
const EDGE = 0.3;
const FOOT = 0.16;
/** The snarks: gravity, run speed, grip on the ground and in the air, the jump, a press's grace before landing and after the edge, size, body radius. */
const G = 28;
const SPEED = 5.6;
const ACC = 40;
const AIR_ACC = 13;
const JUMP_V = 9.4;
const BUFFER = 0.13;
const COYOTE = 0.1;
const SCALE = 1.1;
const PR = 0.42;
/** Two bodies one in the other part at this speed each at most (m/s): one landing on another slides off it, it isn't thrown off its tile. */
const PART_V = 7;
/** B held a moment: pressed in the air or a moment before the shove is ready again, it still goes. */
const BBUF = 0.16;
/** A forgery's shake before it bursts (s); the grip left on it meanwhile (its glitch holds your feet). */
const SHAKE_T = 0.36;
const ROOT = 0.25;
/** The net below: its height, the bounce on it, the fling back up. */
const NET_Y = -11;
const NET_T = 0.45;
const LIFT_T = 1.05;
/** A sloppy forgery's glitch (s); how long a fresh glow shows to everyone (s). */
const GLITCH_T = 0.17;
/** The shortest wait between a sloppy forgery's glitches (s); the odds an AI catches one it looks at: TELL0 + TELL1 · skill². */
const GLITCH_GAP = 1.4;
const TELL0 = 0.02;
const TELL1 = 0.82;
const FRESH = 1.5;
/** SPROUT RUINS: the odds an AI reads a tile the lighthouse lights near it: a forgery's red (SEE_RED0 + SEE_RED1 · skill), a valid one (SEE_OK0 + SEE_OK1 · skill²); the odds it waits for the light. */
const SEE_RED0 = 0.25;
const SEE_RED1 = 0.08;
const SEE_OK0 = 0.04;
const SEE_OK1 = 0.12;
const SEE_WAIT0 = 0.25;
const SEE_WAIT1 = 0.2;
/** The shove: wind-up, lunge time and speed, reach, the knock (speed, time, its friction), the guard after it, the wait before the next. */
const WIND = 0.13;
const LUNGE = 0.16;
const LUNGE_V = 9.5;
const REACH = 1.0;
const KNOCK_V = 6.4;
const KNOCK_T = 0.4;
const KNOCK_F = 8;
const GUARD = 0.9;
const SHOVE_CD = 1.1;
const SEG_NAME = ["SAPLING", "ORCHARD", "IRONWOOD"];

const RUN = 0,
  FALL = 1,
  NET = 2,
  LIFT = 3,
  DONE = 4;
/** A tile: a valid proof, a valid transparent one (until EXPOSURE), a sloppy forgery (it has the tell), a clean forgery. */
const VALID = 0,
  LEGACY_K = 1,
  SLOPPY_K = 2;
const SOLID = 0,
  SHAKE = 1,
  GONE = 2,
  WARN = 3;
/** What an AI makes of a tile. */
const SAFE = 0,
  UNKNOWN = 1,
  SUSPECT = 2,
  BLOCKED = 3;
const NONE = -100;
const LAB = typeof location !== "undefined" && /partylab/.test(location.pathname);

// ---- the level being played ---------------------------------------------------------------------
// (one game at a time: make() sets these before the game is built; levels.ts has the data)

let LV: ForgeLevel = LEVELS[0];
let SEGS: Seg[] = [];
let PADS: Pad[] = [];
/** The tiles; the finish line (the course's length); the route finder's nodes at most. */
let NC = 0;
let END = 0;
let MAXN = 0;
let SEG_TOP: string[] = [];
let SEG_SIDE: string[] = [];
let SEG_INK: string[] = [];
/** EXPOSURE (SKYWAY's): the TRACKER BEAM starts (s; never elsewhere), its speed along the field (m/s), the warning a transparent tile gets before it breaks (s). */
let QDAY = Infinity;
let BEAM_V = 4.2;
let WARN_T = 1.5;
function useLevel(lv: ForgeLevel) {
  LV = lv;
  const L = plan(lv);
  SEGS = L.segs;
  PADS = L.pads;
  NC = L.nc;
  END = L.end;
  MAXN = L.maxn;
  SEG_TOP = lv.segTop;
  SEG_SIDE = lv.segSide;
  SEG_INK = lv.segInk;
  QDAY = lv.qday ? lv.qday.at : Infinity;
  BEAM_V = lv.qday?.v ?? 4.2;
  WARN_T = lv.qday?.warn ?? 1.5;
}
useLevel(LEVELS[0]);
/** The floor's height along the course (the pads', the stretches' climb), its middle across. */
function yAt(p: number) {
  for (const pd of PADS) if (p >= pd.p0 && p <= pd.p1) return pd.y;
  for (const s of SEGS) if (p >= s.p0 && p <= s.p1) return s.y0 + clamp((p - s.p0) / PITCH + 0.5, 0.5, s.rows + 0.5) * s.rise;
  return p < 0 ? 0 : PADS[3].y;
}
function xAt(p: number) {
  for (const s of SEGS) if (p >= s.p0 - 1 && p <= s.p1 + 1) return s.ox;
  for (const pd of PADS) if (p >= pd.p0 && p <= pd.p1) return pd.ox;
  return p < 0 ? PADS[0].ox : PADS[3].ox;
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
function hiss(dur: number, vol = 0.4, hp = 900, delay = 0) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(bus);
  src.start(ac.currentTime + delay);
}
/** A falling snark's scream: a wobbling slide down. */
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
  o.frequency.setValueAtTime(1080 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(140 * pitch, t + 1.1);
  lfo.frequency.value = 13;
  lg.gain.value = 50 * pitch;
  lfo.connect(lg).connect(o.frequency);
  f.type = "lowpass";
  f.frequency.value = 2400;
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
const fsx = {
  /** A forgery caught: a buzz and two digital chirps. */
  glitch: (v = 1) => (tone(150, 0.16, "sawtooth", 0.2 * v, 0.6), tone(2600, 0.04, "square", 0.07 * v, 0.4, 0.02), tone(1900, 0.05, "square", 0.06 * v, 0.4, 0.08)),
  shatter: (v = 1) => (hiss(0.42, 0.5 * v, 1500), hiss(0.25, 0.4 * v, 300, 0.03), tone(260, 0.3, "triangle", 0.3 * v, 0.35)),
  /** A tile held: a little two-note "verified". */
  chime: (k = 0) => (tone(988 + k * 45, 0.07, "triangle", 0.22), tone(1480 + k * 65, 0.13, "triangle", 0.16, 0, 0.05)),
  boing: (v = 1) => tone(140, 0.42, "sine", 0.42 * v, 2.7),
  launch: (v = 1) => (tone(220, 0.55, "triangle", 0.22 * v, 3.2), hiss(0.4, 0.12 * v, 3000)),
  siren: () => [0, 1, 2, 3].forEach((k) => tone(k % 2 ? 620 : 880, 0.26, "square", 0.15, 0, k * 0.28)),
  wind: () => tone(300, 0.12, "triangle", 0.15, 1.8),
  crack: (v = 1) => (tone(90, 0.3, "sawtooth", 0.18 * v, 0.6), hiss(0.2, 0.25 * v, 600)),
};

// ---- textures ------------------------------------------------------------------------------------

/** A signature's glyph: a mirrored 5×5 sigil in a rounded frame (white: the instance colour tints it). */
function sigilTex(seed: number) {
  return canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 8;
    rr(g, 12, 12, 104, 104, 22);
    g.stroke();
    let s = (seed * 7919 + 17) % 2147483647;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    g.fillStyle = "#ffffff";
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 3; x++) {
        if (r() < (x === 2 ? 0.72 : 0.52) || (y === 2 && x === 2)) {
          g.fillRect(29 + x * 14, 29 + y * 14, 12, 12);
          if (x < 2) g.fillRect(29 + (4 - x) * 14, 29 + y * 14, 12, 12);
        }
      }
  });
}

// ---- the players ---------------------------------------------------------------------------------

/** An AI's head (the scripted human's too, on the bench): what it knows, how it feels, what it wants. */
interface Brain {
  sk: number;
  /** 0 (careful) … 1 (a gambler). */
  risk: number;
  aggro: number;
  think: number;
  lastCell: number;
  /** When it last saw each tile hold (−1: never). */
  mem: Float32Array;
  /** It saw that tile glitch (or thinks it did). */
  sus: Uint8Array;
  /** Its own little taste per tile (so the four don't all try the same one). */
  noise: Float32Array;
  /** SPROUT RUINS: tiles it saw lit by the lighthouse without the red (valid, then). */
  shown: Uint8Array;
  /** HALO SPIRE: it braces for this gust (no jumps till it has blown over). */
  brace: boolean;
  /** The unknown tile it stands before, the wait left, the row it waited at. */
  frontier: number;
  wait: number;
  waitRow: number;
  /** A planned running jump: where to, from how far. */
  jumping: boolean;
  /** A jump's plan holds a moment (no second thoughts mid run-up). */
  lock: number;
  /** A jump pressed and not yet off the ground (no second thoughts before it is). */
  fired: number;
  jx: number;
  jp: number;
  jd: number;
  /** The tile it jumps to (−1: a pad). */
  jc: number;
  /** A hop to dodge a shove (countdown), the hop itself. */
  dodge: number;
  hop: number;
  /** Where it heads (x, p), slowing to stop there or not; a yaw to look at while it waits. */
  tx: number;
  tp: number;
  arrive: boolean;
  look: number;
  /** Its hands: the run (world, −1…1), a jump, a shove (and its aim). */
  mx: number;
  mz: number;
  jump: boolean;
  shove: boolean;
  sx: number;
  sz: number;
}

interface Mk {
  i: number;
  p: Player;
  a: Avatar;
  /** Between the avatar and the snark: turns round the hips (the tumble of a fall). */
  tumble: THREE.Group;
  arrow: THREE.Mesh;
  vx: number;
  vz: number;
  mode: number;
  modeT: number;
  /** This frame's wish to run (world, −1…1). */
  mx: number;
  mz: number;
  buffer: number;
  coyote: number;
  bbuf: number;
  /** What holds it up: a tile (≥ 0), a pad (−1 − k), NONE. */
  sup: number;
  /** The tile whose middle it stands in (−1). */
  cell: number;
  lastCell: number;
  lastSup: number;
  /** On a forgery's glitch: held by the feet, no jump. */
  rooted: boolean;
  /** The pad a fall sends it back to. */
  pad: number;
  /** The floor it last stood on (a climb's rows step up). */
  fy: number;
  best: number;
  bestT: number;
  lastP: number;
  fin: number;
  place: number;
  falls: number;
  cd: number;
  wind: number;
  lunge: number;
  aimX: number;
  aimZ: number;
  knock: number;
  guard: number;
  by: number;
  byT: number;
  spin: number;
  l0: THREE.Vector3;
  l1: THREE.Vector3;
  spotX: number;
  spotP: number;
  cheerT: number;
  ai: Brain | null;
}

// ---- the game ------------------------------------------------------------------------------------

class Forge implements Mini {
  private w = world({ sky: LV.sky, fog: LV.fog, night: LV.night });
  private cam: CamRig;
  private fx: Fx3;
  private pl: Mk[];
  private t = 0;
  private over: number[] | null = null;
  private human: number;
  // the tiles (one entry per tile)
  private cs = new Uint8Array(NC);
  private cr = new Uint8Array(NC);
  private cc = new Uint8Array(NC);
  private cx = new Float32Array(NC);
  private cpp = new Float32Array(NC);
  /** Each tile's top (a climb's rows step up). */
  private cy = new Float32Array(NC);
  private kind = new Uint8Array(NC);
  private st = new Uint8Array(NC);
  private stT = new Float32Array(NC);
  private verAt = new Float32Array(NC).fill(-1);
  private verLast = new Float32Array(NC).fill(-1);
  private gNext = new Float32Array(NC);
  private gOn = new Float32Array(NC);
  private gDir = new Float32Array(NC);
  private tilt = new Float32Array(NC);
  private glyph = new Uint8Array(NC);
  private gIdx = new Uint16Array(NC);
  private lIdx = new Int16Array(NC).fill(-1);
  private onPath = new Uint8Array(NC);
  private legacyList: number[] = [];
  // their meshes (one instanced draw each)
  private mSlab!: THREE.InstancedMesh;
  private mInk!: THREE.InstancedMesh;
  private mTop!: THREE.InstancedMesh;
  private mDecal: THREE.InstancedMesh[] = [];
  private mGlow!: THREE.InstancedMesh;
  private mHole!: THREE.InstancedMesh;
  private mStamp!: THREE.InstancedMesh;
  private mShard!: THREE.InstancedMesh;
  // the shards of the broken ones
  private sh = { n: 0, x: new Float32Array(160), y: new Float32Array(160), z: new Float32Array(160), vx: new Float32Array(160), vy: new Float32Array(160), vz: new Float32Array(160), rx: new Float32Array(160), ry: new Float32Array(160), sx: new Float32Array(160), sy: new Float32Array(160), life: new Float32Array(160).fill(-1) };
  // the Tracker's probe rig, its beam
  private shor = new THREE.Group();
  private core!: THREE.Mesh;
  private curtain!: THREE.Mesh;
  private beamLine!: THREE.Mesh;
  private beamP = -6;
  private beamOn = false;
  private beamDone = false;
  private hum: { stop: () => void } | null = null;
  // SPROUT RUINS: the lighthouse's spot on the field (x, p, radius), each tile's light now, the red a forgery keeps a moment after, lit this pass
  private spotX = 0;
  private spotP = -2;
  private spotR = 0;
  private lit = new Float32Array(NC);
  private red = new Float32Array(NC);
  private litOn = new Uint8Array(NC);
  private lampHead: THREE.Object3D | null = null;
  private lampBeam: THREE.Mesh | null = null;
  private lampPool: THREE.Mesh | null = null;
  private lampLight: THREE.PointLight | null = null;
  private fogK = 0;
  /** How far ahead the AIs read a tell (m; the fog cuts it). */
  private sight = 7.5;
  private redPing = 0;
  // HALO SPIRE: the next gust (s), its side (±1), its phase (0 calm, 1 called, 2 blowing) and time in it, the wind now (−1…1)
  private gustAt = 0;
  private gustDir = 1;
  private gustPh = 0;
  private gustT = 0;
  private gustN = 0;
  private wind = 0;
  /** When the wind last blew (s). */
  private blownAt = -9;
  private socks: THREE.InstancedMesh | null = null;
  private sockAt: THREE.Vector3[] = [];
  private streaks: THREE.InstancedMesh | null = null;
  private stk = { x: new Float32Array(48), y: new Float32Array(48), z: new Float32Array(48), v: new Float32Array(48), life: new Float32Array(48).fill(-1), len: new Float32Array(48) };
  // the decor that moves
  private spinners: THREE.Object3D[] = [];
  private decor!: Decor;
  private caps!: THREE.InstancedMesh;
  private ripples: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
  private arrowGeo: THREE.BufferGeometry;
  // the news
  private news: { s: string; c: string; life: number; dur: number }[] = [];
  private pops: { s: string; c: string; x: number; y: number; z: number; life: number; max: number; size: number }[] = [];
  private said: Record<string, boolean> = {};
  // scratch (no allocations in the loops)
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private qFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private eu = new THREE.Euler();
  private col = new THREE.Color();
  private ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  private UP = new THREE.Vector3(0, 1, 0);
  private DOWN = new THREE.Vector3(0, -1, 0);
  private ZAX = new THREE.Vector3(0, 0, 1);
  private C = {
    top: SEG_TOP.map((c) => new THREE.Color(c)),
    ink: SEG_INK.map((c) => new THREE.Color(c)),
    mint: new THREE.Color("#c4ffe0"),
    mintInk: new THREE.Color("#0f9d58"),
    glow: new THREE.Color("#5dffa8"),
    red: new THREE.Color("#ff3355"),
    redD: new THREE.Color("#8a0a2a"),
    orange: new THREE.Color("#ffa23a"),
    magenta: new THREE.Color("#ff19c8"),
    white: new THREE.Color("#ffffff"),
    warm: new THREE.Color("#ffe2a0"),
  };
  // the route finder's scratch
  private dist = new Float64Array(MAXN);
  private prev = new Int16Array(MAXN);
  private pj = new Uint8Array(MAXN);
  private vis = new Uint8Array(MAXN);
  private rt = { next: -1, jump: 0, next2: -1, j2: 0 };
  /** The bench's numbers. */
  stats = { falls: [0, 0, 0, 0], tests: [0, 0, 0, 0], sloppy: [0, 0, 0, 0], seen: [0, 0, 0, 0], forged: 0, legacy: 0, shoves: 0, hits: 0, shoveFalls: 0, beamFalls: 0, gustFalls: 0, gusts: 0, lampRed: 0, lampOk: 0, fin: [-1, -1, -1, -1], why: [] as string[] };
  /** The bench: a brain for the human's seat too (its skill), its advice only (the script presses the keys), the script's delay (s). */
  botSkill = -1;
  botLead = 0;

  constructor(
    private players: Player[],
    private rnd: Rnd,
  ) {
    this.human = players.findIndex((p) => p.human);
    this.arrowGeo = arrowGeo();
    this.build();
    this.dress();
    this.makeTiles();
    this.fx = new Fx3(this.w.scene, 700);
    this.cam = new CamRig(this.w.camera);
    this.pl = players.map((p, i) => this.makeMk(p, i));
    this.camTarget(this.eye, this.at);
    this.cam.set(this.eye, this.at);
    this.writeTiles();
    if (LAB) (window as unknown as { forge?: unknown }).forge = this;
  }

  // ---- the course --------------------------------------------------------------------------------

  /** The tiles: a true path through each stretch (a random walk forward, sometimes sideways), a few other valid ones, the rest forged. */
  private build() {
    const r = this.rnd;
    for (const s of SEGS) {
      for (let row = 0; row < s.rows; row++)
        for (let c = 0; c < s.cols; c++) {
          const i = s.c0 + row * s.cols + c;
          this.cs[i] = s.k;
          this.cr[i] = row;
          this.cc[i] = c;
          this.cx[i] = s.ox + (c - (s.cols - 1) / 2) * PITCH;
          this.cpp[i] = s.p0 + (row + 0.5) * PITCH;
          this.cy[i] = s.y0 + (row + 1) * s.rise;
        }
      let col = Math.floor(r() * s.cols);
      for (let row = 0; row < s.rows; row++) {
        this.onPath[s.c0 + row * s.cols + col] = 1;
        if (row > 0 && r() < LV.wiggle[s.k]) {
          col += col === 0 ? 1 : col === s.cols - 1 ? -1 : r() < 0.5 ? -1 : 1;
          this.onPath[s.c0 + row * s.cols + col] = 1;
        }
        const q = r();
        if (q < 0.32 && col > 0) col--;
        else if (q < 0.64 && col < s.cols - 1) col++;
      }
      for (let j = 0; j < s.n; j++) {
        const i = s.c0 + j;
        if (this.onPath[i]) this.kind[i] = VALID;
        else if (r() < LV.extra[s.k]) this.kind[i] = r() < LV.legacy[s.k] ? LEGACY_K : VALID;
        else this.kind[i] = r() < LV.sloppy[s.k] ? SLOPPY_K : 3;
      }
    }
    for (let i = 0; i < NC; i++) {
      this.glyph[i] = Math.floor(r() * 4);
      // (a sloppy forgery's glyph sits a little crooked: the static half of the tell)
      this.tilt[i] = this.kind[i] === SLOPPY_K ? (r() < 0.5 ? -1 : 1) * (0.1 + r() * 0.06) : (r() - 0.5) * 0.03;
      this.gNext[i] = 1.2 + r() * 4;
      this.gDir[i] = r() < 0.5 ? -1 : 1;
      if (this.kind[i] === LEGACY_K) {
        this.lIdx[i] = this.legacyList.length;
        this.legacyList.push(i);
      }
    }
  }

  private makeMk(p: Player, i: number): Mk {
    const a = new Avatar(this.w.scene, p, { scale: SCALE });
    // (the snark hangs from a pivot at its hips: a fall tumbles head over heels)
    const tumble = new THREE.Group();
    tumble.position.y = 0.8 * SCALE;
    a.root.add(tumble);
    tumble.add(a.body.root);
    a.body.root.position.y = -0.8 * SCALE;
    a.pos.set(PADS[0].ox + (i - 1.5) * 1.8, 0, 2.4);
    a.yaw = Math.PI;
    a.sync(0);
    const arrow = new THREE.Mesh(this.arrowGeo, glow(p.color, 0.85));
    arrow.visible = false;
    arrow.renderOrder = 4;
    this.w.scene.add(arrow);
    return {
      i,
      p,
      a,
      tumble,
      arrow,
      vx: 0,
      vz: 0,
      mode: RUN,
      modeT: 0,
      mx: 0,
      mz: 0,
      buffer: 0,
      coyote: 0,
      bbuf: 0,
      sup: -1,
      cell: -1,
      lastCell: -1,
      lastSup: -1,
      rooted: false,
      pad: 0,
      fy: 0,
      best: -2.4,
      bestT: 0,
      lastP: -2.4,
      fin: -1,
      place: -1,
      falls: 0,
      cd: 0.5,
      wind: 0,
      lunge: 0,
      aimX: 0,
      aimZ: -1,
      knock: 0,
      guard: 0,
      by: -1,
      byT: -9,
      spin: 0,
      l0: new THREE.Vector3(),
      l1: new THREE.Vector3(),
      spotX: 0,
      spotP: 0,
      cheerT: 0,
      ai: p.human ? null : this.brain(p.skill),
    };
  }

  private brain(sk: number): Brain {
    const r = this.rnd;
    const noise = new Float32Array(NC);
    for (let c = 0; c < NC; c++) noise[c] = r() * 0.9;
    return {
      sk,
      risk: clamp(0.25 + r() * 0.5, 0, 1),
      aggro: clamp(0.35 + r() * 0.5, 0, 1),
      think: r() * 0.2,
      lastCell: -2,
      mem: new Float32Array(NC).fill(-1),
      sus: new Uint8Array(NC),
      noise,
      shown: new Uint8Array(NC),
      brace: false,
      frontier: -1,
      wait: 0,
      waitRow: -1,
      jumping: false,
      lock: 0,
      fired: 0,
      jx: 0,
      jp: 0,
      jc: -1,
      jd: 3.4,
      dodge: -1,
      hop: 0,
      tx: 0,
      tp: 0,
      arrive: true,
      look: NaN,
      mx: 0,
      mz: 0,
      jump: false,
      shove: false,
      sx: 0,
      sz: 0,
    };
  }

  // ---- the look ----------------------------------------------------------------------------------

  private dress() {
    const s = this.w.scene;
    // the world round the course: the light, the backdrop, the pads' dressing, the life (decor.ts)
    this.decor = new Decor(this.w, LV, { segs: SEGS, pads: PADS, nc: NC, end: END, maxn: MAXN }, xAt, yAt);
    // the rejection net under the whole course
    const len = END + LV.finD + LV.startD + 10;
    const zc = -(END + LV.finD - LV.startD) / 2;
    const [nFill, nLine, nEdge] = LV.net;
    const netTex = canvasTex(
      64,
      64,
      (g) => {
        g.clearRect(0, 0, 64, 64);
        g.fillStyle = nFill;
        g.fillRect(0, 0, 64, 64);
        g.strokeStyle = nLine;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(64, 64);
        g.moveTo(64, 0);
        g.lineTo(0, 64);
        g.stroke();
      },
      true,
    );
    netTex.repeat.set(36 / 2.4, len / 2.4);
    const net = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: netTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    net.rotation.x = -Math.PI / 2;
    net.scale.set(36, len, 1);
    net.position.set(0, NET_Y - 0.02, zc);
    s.add(net);
    for (const sd of [-1, 1]) {
      block(nEdge, 0.35, 0.35, len, sd * 18, NET_Y, zc, s, glow(nEdge));
      block(nEdge, 36, 0.35, 0.35, 0, NET_Y, zc + (sd * len) / 2, s, glow(nEdge));
    }
    // pylons along the sides, a light on each (two draws; a windsock on each up the spire)
    const nP = 14;
    const [pPost, pCap0, pCap1] = LV.pylon;
    const pyl = new THREE.InstancedMesh(GEO.box, toon(pPost), nP);
    this.caps = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), nP);
    for (let i = 0; i < nP; i++) {
      const sd = i % 2 ? 1 : -1;
      const p = -3 + Math.floor(i / 2) * ((END + LV.finD) / 6.2);
      // (hugging the course: just outside whatever is that wide there)
      const pd = PADS.find((q) => p >= q.p0 && p <= q.p1);
      const sg = SEGS.find((q) => p >= q.p0 && p <= q.p1);
      const x = (pd ? pd.ox : sg ? sg.ox : xAt(p)) + sd * ((pd ? pd.w : sg ? sg.w : 16) / 2 + 2.6);
      const y = yAt(p);
      this.m4.compose(this.v1.set(x, y - 6, -p), this.q1.identity(), this.v2.set(0.6, 14.5, 0.6));
      pyl.setMatrixAt(i, this.m4);
      this.m4.compose(this.v1.set(x, y + 1.55, -p), this.q1.setFromAxisAngle(this.UP, 0.785), this.v2.set(0.6, 0.6, 0.6));
      this.caps.setMatrixAt(i, this.m4);
      this.caps.setColorAt(i, this.col.set(i % 4 < 2 ? pCap0 : pCap1));
      this.sockAt.push(new THREE.Vector3(x, y + 1.7, -p));
    }
    pyl.raycast = this.caps.raycast = () => {};
    s.add(pyl, this.caps);
    // the pads
    PADS.forEach((pd, k) => {
      const d = pd.p1 - pd.p0;
      const z = -(pd.p0 + pd.p1) / 2;
      const [top, side] = LV.pads[k === 0 ? 0 : k === 3 ? 2 : 1];
      outline(block(top, pd.w, 0.6, d, pd.ox, pd.y - 0.3, z, s), 0.06);
      block(side, pd.w - 1.4, 1.8, d - 0.9, pd.ox, pd.y - 1.5, z, s);
      if (k > 0) block("#ffd23f", pd.w, 0.62, 0.24, pd.ox, pd.y - 0.3, -(pd.p0 + 0.12), s);
      if (k < 3) block("#ffd23f", pd.w, 0.62, 0.24, pd.ox, pd.y - 0.3, -(pd.p1 - 0.12), s);
      const heli = k === 3 && !!LV.gust;
      const word = label(k === 0 ? T("START", "起点") : k === 3 ? T("VERIFIED!", "已验证！") : T("CHECKPOINT", "检查点"), k === 3 ? 1.5 : 1.05, k === 3 ? (heli ? "rgba(255,210,63,0.9)" : "rgba(150,90,0,0.75)") : "rgba(255,255,255,0.8)");
      word.rotation.x = -Math.PI / 2;
      word.position.set(pd.ox, pd.y + 0.02, k === 3 ? (heli ? z + d / 2 - 1.1 : z + 0.8) : z);
      s.add(word);
      if (heli) {
        // the helipad: a yellow ring, a big H
        const ring = new THREE.Mesh(GEO.ring, glow("#ffd23f"));
        ring.rotation.x = -Math.PI / 2;
        ring.scale.setScalar(8.2);
        ring.position.set(pd.ox, pd.y + 0.03, z - 0.9);
        s.add(ring);
        const H = label("H", 3.2, "rgba(255,255,255,0.92)");
        H.rotation.x = -Math.PI / 2;
        H.position.set(pd.ox, pd.y + 0.025, z - 0.9);
        s.add(H);
      }
      if (k < 3)
        for (const sd of [-1, 1]) {
          const x = pd.ox + sd * (pd.w / 2 - 0.35);
          const zz = -(pd.p1 - 0.45);
          outline(block("#2b1d6b", 0.26, 2.3, 0.26, x, pd.y + 1.15, zz, s), 0.04);
          const board = label(SEG_NAME[k], 0.62, "#ffffff", SEG_SIDE[k]);
          board.position.set(x - sd * 1.0, pd.y + 2.55, zz);
          board.rotation.x = -0.32;
          board.scale.set(2.2, 0.62, 1);
          s.add(board);
        }
    });
    // the finish arch, a Z-Block over it
    const fp = PADS[3];
    const fz = -(END + LV.finD - 1.2);
    const hw = Math.min(8.5, fp.w / 2 - 0.6);
    for (const sd of [-1, 1]) outline(block("#ffd23f", 0.7, 6, 0.7, fp.ox + sd * hw, fp.y + 3, fz, s), 0.06);
    outline(block("#ff6b35", hw * 2 + 0.8, 1.1, 0.8, fp.ox, fp.y + 6.3, fz, s), 0.06);
    const sign = label(T("VERIFIED ✓", "已验证 ✓"), 0.95, "#ffffff");
    sign.position.set(fp.ox, fp.y + 6.3, fz + 0.42);
    s.add(sign);
    const qb = qBlock(1.7);
    qb.position.set(fp.ox, fp.y + 8.6, fz);
    s.add(qb);
    this.spinners.push(qb);
    for (const sd of [-1, 1]) {
      const q = qBlock(1.1);
      q.position.set(PADS[0].ox + sd * (PADS[0].w / 2 + 1.6), 2.2, 2.6);
      s.add(q);
      this.spinners.push(q);
    }
    if (LV.qday) this.buildShor();
    if (LV.lamp) this.buildLamp();
    if (LV.gust) this.buildWind();
    // the ripples on the net
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: "#8ff6ff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(GEO.ring, mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      s.add(m);
      this.ripples.push({ m, mat, life: -1 });
    }
  }

  /** SPROUT RUINS: the lighthouse on its rock beside the field, its lamp, its beam, the pool of light it throws. */
  private buildLamp() {
    const s = this.w.scene;
    const p = END * 0.5;
    const x = xAt(p) - 17;
    const z = -p;
    outline(block("#3b3550", 6, 3, 6, x, -9.5, z, s), 0.08);
    [0, 1, 2, 3].forEach((k) => {
      const c = new THREE.Mesh(GEO.cyl, toon(k % 2 ? "#e8463c" : "#f4efe6"));
      c.scale.set(3.4 - k * 0.35, 4.2, 3.4 - k * 0.35);
      c.position.set(x, -6 + k * 4.2, z);
      outline(c, 0.06);
      s.add(c);
    });
    const gal = new THREE.Mesh(GEO.cyl, toon("#2b1d6b"));
    gal.scale.set(4.2, 0.4, 4.2);
    gal.position.set(x, 8.5, z);
    s.add(gal);
    const room = new THREE.Mesh(GEO.cyl, glow("#ffe7a8"));
    room.scale.set(2.2, 1.8, 2.2);
    room.position.set(x, 9.6, z);
    s.add(room);
    const roof = new THREE.Mesh(GEO.cone, toon("#e8463c"));
    roof.scale.set(3.2, 1.8, 3.2);
    roof.position.set(x, 11.4, z);
    outline(roof, 0.05);
    s.add(roof);
    const head = new THREE.Group();
    head.position.set(x, 9.6, z);
    const lens = block("#fff6d8", 0.9, 1.1, 1.2, 0, 0, 0.6, head, glow("#fff6d8"));
    outline(lens, 0.05, "#3b2a00");
    s.add(head);
    this.lampHead = head;
    // the beam: an open cone, its tip at the lamp (+y up its axis), stretched to the spot
    const cg = new THREE.CylinderGeometry(0.12, 1, 1, 24, 1, true);
    cg.translate(0, -0.5, 0);
    this.lampBeam = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: "#ffe2a0", transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.lampBeam.renderOrder = 6;
    s.add(this.lampBeam);
    const pt = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,236,190,0.6)");
      gr.addColorStop(0.55, "rgba(255,220,150,0.32)");
      gr.addColorStop(0.85, "rgba(255,200,120,0.12)");
      gr.addColorStop(1, "rgba(255,200,120,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    this.lampPool = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: pt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.lampPool.rotation.x = -Math.PI / 2;
    this.lampPool.renderOrder = 3;
    s.add(this.lampPool);
    this.lampLight = new THREE.PointLight("#ffd58a", 14, 11, 1.4);
    s.add(this.lampLight);
    this.spotR = LV.lamp!.r;
  }

  /** HALO SPIRE: a windsock on every pylon (one draw), the gust's streaks (one draw). */
  private buildWind() {
    const s = this.w.scene;
    const sg = new THREE.ConeGeometry(0.32, 1.5, 8, 1, true);
    // (its mouth at the pole, pointing +x)
    sg.rotateZ(-Math.PI / 2);
    sg.translate(0.75, 0, 0);
    this.socks = new THREE.InstancedMesh(sg, new THREE.MeshToonMaterial({ color: "#ff6a2a", side: THREE.DoubleSide, gradientMap: toonSteps() }), this.sockAt.length);
    this.socks.frustumCulled = false;
    this.socks.raycast = () => {};
    s.add(this.socks);
    this.streaks = new THREE.InstancedMesh(GEO.box, glow("#ffffff", 0.55, true), 48);
    this.streaks.frustumCulled = false;
    this.streaks.raycast = () => {};
    for (let i = 0; i < 48; i++) this.streaks.setMatrixAt(i, this.ZERO);
    s.add(this.streaks);
    this.gustAt = LV.gust!.first;
  }

  /** The Tracker's probe rig: a steel surveillance chandelier, a probe glowing under it, its beam. */
  private buildShor() {
    const g = this.shor;
    [3.0, 2.5, 2.0, 1.5].forEach((r, k) => {
      const d = new THREE.Mesh(GEO.cyl, toon("#9aa3b5", "#1e2330"));
      d.scale.set(r * 2, 0.3, r * 2);
      d.position.y = -k * 1.15;
      outline(d, 0.05);
      g.add(d);
    });
    const tubes = new THREE.InstancedMesh(GEO.cyl, toon("#4a5163"), 12);
    for (let i = 0; i < 12; i++) {
      const k = i % 3;
      const a = (i / 12) * Math.PI * 2;
      const r = [2.2, 1.7, 1.2][k];
      this.m4.compose(this.v1.set(Math.cos(a) * r, -0.58 - k * 1.15, Math.sin(a) * r), this.q1.identity(), this.v2.set(0.16, 1.15, 0.16));
      tubes.setMatrixAt(i, this.m4);
    }
    g.add(tubes);
    this.core = new THREE.Mesh(GEO.ball, glow("#ff4fd8"));
    this.core.scale.setScalar(1.2);
    this.core.position.y = -4.4;
    g.add(this.core);
    const halo = new THREE.Mesh(GEO.ring, glow("#ffb0f5", 0.75, true));
    halo.scale.setScalar(3.2);
    halo.position.y = -4.4;
    g.add(halo);
    this.spinners.push(halo);
    const plate = label(T("TRACKER", "追踪者"), 0.8, "#ffffff", "#7a1f9a");
    plate.scale.set(2.2, 0.7, 1);
    plate.position.set(0, 0.62, 3.05);
    g.add(plate);
    this.w.scene.add(g);
    g.position.set(-16, 9, -18);
    // the beam: a sheet of light across the field, a hot line on the floor
    const bt = canvasTex(128, 128, (c) => {
      const gr = c.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, "rgba(255,40,200,0)");
      gr.addColorStop(0.45, "rgba(240,30,190,0.22)");
      gr.addColorStop(0.85, "rgba(255,60,210,0.55)");
      gr.addColorStop(1, "rgba(255,190,245,0.9)");
      c.fillStyle = gr;
      c.fillRect(0, 0, 128, 128);
      // (scan lines: the beam reads as light, not as glass)
      c.globalCompositeOperation = "destination-out";
      for (let x = 0; x < 128; x += 8) {
        c.fillStyle = `rgba(0,0,0,${0.35 + ((x * 37) % 5) * 0.08})`;
        c.fillRect(x + 5, 0, 3, 128);
      }
    });
    this.curtain = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.curtain.renderOrder = 5;
    this.curtain.scale.set(27, 6.6, 1);
    this.curtain.visible = false;
    this.w.scene.add(this.curtain);
    this.beamLine = block("#ff3dd2", 27, 0.1, 0.6, 0, 0.06, 0, this.w.scene, glow("#ff3dd2"));
    this.beamLine.visible = false;
  }

  private makeTiles() {
    const s = this.w.scene;
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      m.frustumCulled = false;
      m.raycast = () => {};
      s.add(m);
      return m;
    };
    this.mSlab = inst(GEO.box, toon("#ffffff"), NC);
    this.mInk = inst(GEO.box, new THREE.MeshBasicMaterial({ color: "#15101f", side: THREE.BackSide }), NC);
    this.mTop = inst(GEO.box, toon("#ffffff"), NC);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < NC; i++) this.gIdx[i] = counts[this.glyph[i]]++;
    for (let gk = 0; gk < 4; gk++) {
      const m = inst(GEO.plane, new THREE.MeshBasicMaterial({ map: sigilTex(gk * 31 + 5), transparent: true, depthWrite: false }), counts[gk]);
      m.renderOrder = 2;
      this.mDecal.push(m);
    }
    const gt = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 8, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,0.9)");
      gr.addColorStop(0.7, "rgba(255,255,255,0.45)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    });
    this.mGlow = inst(GEO.plane, new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), NC);
    this.mGlow.renderOrder = 3;
    // a hole's rim: a square ring in hot red
    const sh = new THREE.Shape();
    const o = TILE / 2,
      ii = TILE / 2 - 0.16;
    sh.moveTo(-o, -o);
    sh.lineTo(o, -o);
    sh.lineTo(o, o);
    sh.lineTo(-o, o);
    sh.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-ii, -ii);
    hole.lineTo(-ii, ii);
    hole.lineTo(ii, ii);
    hole.lineTo(ii, -ii);
    hole.closePath();
    sh.holes.push(hole);
    const fg = new THREE.ShapeGeometry(sh);
    fg.rotateX(-Math.PI / 2);
    this.mHole = inst(fg, new THREE.MeshBasicMaterial({ color: "#ff2a55", transparent: true, opacity: 0.85, depthWrite: false }), NC);
    const stampTex = canvasTex(256, 128, (g) => {
      g.clearRect(0, 0, 256, 128);
      g.strokeStyle = "#ff7a1a";
      g.lineWidth = 10;
      rr(g, 10, 14, 236, 100, 18);
      g.stroke();
      g.font = `900 54px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ff7a1a";
      g.fillText("T-ADDR", 128, 66);
    });
    this.mStamp = inst(GEO.plane, new THREE.MeshBasicMaterial({ map: stampTex, transparent: true, depthWrite: false }), this.legacyList.length);
    this.mStamp.renderOrder = 3;
    this.mShard = inst(GEO.box, toon("#ffffff"), 160);
    for (let i = 0; i < NC; i++) {
      this.mSlab.setColorAt(i, this.col.set(SEG_SIDE[this.cs[i]]));
      this.mTop.setColorAt(i, this.C.top[this.cs[i]]);
      this.mDecal[this.glyph[i]].setColorAt(this.gIdx[i], this.C.ink[this.cs[i]]);
      this.mGlow.setColorAt(i, this.C.glow);
    }
    for (let i = 0; i < 160; i++) {
      this.mShard.setColorAt(i, this.C.white);
      this.mShard.setMatrixAt(i, this.ZERO);
    }
    for (let i = 0; i < this.mStamp.count; i++) this.mStamp.setMatrixAt(i, this.ZERO);
  }

  // ---- the loop ----------------------------------------------------------------------------------

  idle(dt: number, phase: "card" | "count", k: number) {
    const op = END * 0.42;
    if (phase === "card") this.cam.orbit(this.v1.set(xAt(op), yAt(op) - 3, -op), -0.78 + k * 0.07, 38, 24);
    else {
      this.camTarget(this.eye, this.at);
      this.cam.to(this.eye, this.at, dt, 3.2);
    }
    this.cam.apply(dt);
    for (const m of this.pl) {
      m.a.physics(dt, 0, G);
      this.pose(m, dt);
    }
    this.machine(dt);
    this.lamp(dt, false);
    this.gusts(dt, false);
    this.decor.update(dt, this.wind);
    this.decorate(dt);
    this.fx.update(dt);
    this.writeTiles();
  }

  update(dt: number, input: Input) {
    this.t += dt;
    if (this.botSkill >= 0 && this.human >= 0 && !this.pl[this.human].ai) this.pl[this.human].ai = this.brain(this.botSkill);
    this.timeline();
    for (const m of this.pl) this.control(m, input, dt);
    for (const m of this.pl) this.move(m, dt);
    this.collide(dt);
    this.tiles(dt);
    this.beam();
    this.machine(dt);
    this.lamp(dt, true);
    this.gusts(dt, true);
    this.shards(dt);
    this.decor.update(dt, this.wind);
    this.decorate(dt);
    this.fx.update(dt);
    for (const n of this.news.slice(0, 1)) n.life += dt;
    if (this.news.length && this.news[0].life >= this.news[0].dur) this.news.shift();
    for (const p of this.pops) p.life += dt;
    if (this.pops.length && this.pops[0].life >= this.pops[0].max) this.pops = this.pops.filter((p) => p.life < p.max);
    this.checkEnd();
    this.camTarget(this.eye, this.at);
    this.cam.to(this.eye, this.at, dt, 3.2);
    this.cam.apply(dt);
    this.writeTiles();
    for (const m of this.pl) this.pose(m, dt);
  }

  private timeline() {
    const t = this.t,
      s = this.said;
    if (!s.warn && t >= QDAY - 3.5) {
      s.warn = true;
      this.say(T("EXPOSURE IS COMING!", "曝光要来了！"), "#ffa23a", 1.5);
      fsx.siren();
    }
    if (!s.beam && t >= QDAY) {
      s.beam = true;
      this.beamOn = true;
      this.say(T("TRACKER BEAM!", "追踪光束！"), "#ff4fd8", 1.4);
      this.startHum();
      this.cam.shake(0.35);
    }
    if (LV.lamp && !s.fog && t >= LV.lamp.fogAt) {
      s.fog = true;
      this.say(T("FOG ROLLS IN!", "起雾了！"), "#9fb4ff", 1.4);
      fsx.wind();
      hiss(1.6, 0.18, 500);
      this.cam.shake(0.15);
      this.fx.burst(this.v1.copy(this.cam.at).setY(this.cam.at.y + 1.2), 30, ["#b8c4ff", "#8090d8", "#ffffff"], { speed: 5, up: 0.5, gravity: -0.4, size: 0.3, life: 1.6, drag: 1.5 });
    }
    if (!s.hurry && t >= LIMIT - 10) {
      s.hurry = true;
      this.say(T("HURRY!", "快！"), "#ff6b35", 1.2);
      music.rate(1.15);
    }
  }

  private checkEnd() {
    if (this.over) return;
    const fins = this.pl.filter((m) => m.fin >= 0).length;
    if (fins >= 3 || this.t >= LIMIT) {
      this.over = this.order();
      if (fins < 3) this.say(T("TIME!", "时间到！"), "#ffd23f", 1.2);
      this.stopHum();
      const w = this.pl[this.over[0]];
      if (w.fin < 0) w.a.cheer(3);
    }
  }

  /** The order: those across by their time, then the rest by how far they got (and who got there first). */
  private order() {
    return [0, 1, 2, 3].sort((a, b) => {
      const A = this.pl[a],
        B = this.pl[b];
      if (A.fin >= 0 || B.fin >= 0) {
        if (A.fin < 0) return 1;
        if (B.fin < 0) return -1;
        return A.fin - B.fin || a - b;
      }
      return B.best - A.best || A.bestT - B.bestT || a - b;
    });
  }

  // ---- the players' moves ------------------------------------------------------------------------

  private control(m: Mk, input: Input, dt: number) {
    m.mx = m.mz = 0;
    const b = m.ai;
    if (b) {
      b.think -= dt;
      if (b.think <= 0 || m.cell !== b.lastCell) {
        b.lastCell = m.cell;
        this.think(m);
      }
      this.steer(m, dt);
    }
    if (m.mode !== RUN || m.fin >= 0) return;
    if (m.p.human) {
      if (this.over) return;
      const ax = input.axis();
      let x = ax.x,
        z = ax.y;
      const l = Math.hypot(x, z);
      if (l > 1) ((x /= l), (z /= l));
      m.mx = x;
      m.mz = z;
      if (input.pressed("a")) m.buffer = BUFFER;
      // (B in the air, or a moment before the shove is ready: it goes as soon as it can)
      if (input.pressed("b")) m.bbuf = BBUF;
      if (m.bbuf > 0 && this.canShove(m)) ((m.bbuf = 0), this.humanShove(m));
    } else if (b) {
      m.mx = b.mx;
      m.mz = b.mz;
      if (b.jump) ((m.buffer = BUFFER), (b.jump = false));
      if (b.shove) ((b.shove = false), this.startShove(m, b.sx, b.sz));
    }
  }

  private move(m: Mk, dt: number) {
    const a = m.a;
    m.cd -= dt;
    m.guard -= dt;
    m.bbuf -= dt;
    if (m.mode === RUN) return this.run(m, dt);
    m.modeT += dt;
    if (m.mode === FALL) {
      const k = Math.exp(-0.7 * dt);
      m.vx *= k;
      m.vz *= k;
      a.pos.x += m.vx * dt;
      a.pos.z += m.vz * dt;
      a.physics(dt, NET_Y, G);
      if (a.grounded) {
        // the net: a bounce, a ripple
        m.mode = NET;
        m.modeT = 0;
        a.vy = 6.5;
        a.grounded = false;
        const v = this.loud(a.pos);
        if (v > 0.1) fsx.boing(v);
        if (m.p.human) this.cam.shake(0.22);
        this.fx.burst(this.v1.set(a.pos.x, NET_Y + 0.2, a.pos.z), 16, ["#8ff6ff", "#ffffff", m.p.color], { speed: 4, up: 3, gravity: 10, size: 0.18, life: 0.7 });
        this.ripple(a.pos.x, a.pos.z);
      }
    } else if (m.mode === NET) {
      const k = Math.exp(-3 * dt);
      m.vx *= k;
      m.vz *= k;
      a.pos.x += m.vx * dt;
      a.pos.z += m.vz * dt;
      a.physics(dt, NET_Y, G);
      if (m.modeT > NET_T && a.grounded) this.lift(m);
    } else if (m.mode === LIFT) {
      const k = Math.min(1, m.modeT / LIFT_T);
      const e = k * k * (3 - 2 * k);
      a.pos.lerpVectors(m.l0, m.l1, e);
      a.pos.y = lerp(m.l0.y, m.l1.y, e) + Math.sin(Math.PI * k) * 7;
      a.grounded = false;
      a.floor = null;
      a.face(Math.PI, dt, 6);
      if (Math.random() < 0.5) this.fx.burst(this.v1.set(a.pos.x, a.pos.y + 0.8, a.pos.z), 1, [m.p.color, "#ffffff"], { speed: 0.5, up: 0, gravity: 0, size: 0.16, life: 0.5 });
      if (k >= 1) {
        m.mode = RUN;
        a.pos.copy(m.l1);
        a.vy = 0;
        a.grounded = true;
        a.floor = m.fy = m.l1.y;
        a.body.land(5);
        m.vx = m.vz = 0;
        m.guard = 0.5;
        m.lastP = -a.pos.z;
        m.tumble.rotation.set(0, 0, 0);
        m.sup = this.support(a.pos.x, -a.pos.z);
        m.cell = -1;
        this.replan(m);
        this.fx.burst(this.v1.set(a.pos.x, a.pos.y + 0.1, a.pos.z), 10, ["#ffffff", "#d6c8ff"], { speed: 3, up: 1.5, gravity: 6, size: 0.18, life: 0.45, drag: 3 });
        const lv = this.loud(a.pos);
        if (m.p.human || lv > 0.5) tone(120, 0.14, "sine", 0.28 * (m.p.human ? 1 : lv), 0.55);
        if (m.p.human) this.cam.shake(0.15);
      }
    } else if (m.mode === DONE) {
      const dx = m.spotX - a.pos.x,
        dp = m.spotP + a.pos.z,
        d = Math.hypot(dx, dp);
      const f = d > 0.15 ? Math.min(1, d / 0.8) * 0.75 : 0;
      m.vx = f ? (dx / d) * SPEED * f : 0;
      m.vz = f ? (-dp / d) * SPEED * f : 0;
      a.pos.x += m.vx * dt;
      a.pos.z += m.vz * dt;
      a.physics(dt, PADS[3].y, G);
      if (f) a.face(yawOf(m.vx, m.vz), dt, 10);
      else a.face(0, dt, 4);
      m.cheerT -= dt;
      if (m.cheerT <= 0 && !f) {
        a.cheer(2);
        a.jump(6.5);
        m.cheerT = 2.4 + Math.random();
      }
    }
  }

  private run(m: Mk, dt: number) {
    const a = m.a;
    const grounded = a.grounded;
    if (m.knock > 0) m.knock -= dt;
    if (m.wind > 0) {
      m.wind -= dt;
      if (m.wind <= 0) m.lunge = LUNGE;
    }
    let dx = m.mx * SPEED,
      dz = m.mz * SPEED;
    let acc = grounded ? ACC : AIR_ACC;
    if (m.knock > 0) ((dx = 0), (dz = 0), (acc = KNOCK_F));
    if (m.wind > 0) ((dx *= 0.15), (dz *= 0.15));
    if (m.rooted) ((dx *= ROOT), (dz *= ROOT));
    // (a gust: the wind carries it, less on its feet than in the air)
    if (this.wind && LV.gust) dx += this.windAt(-a.pos.z) * (grounded ? LV.gust.ground : 1);
    if (m.lunge > 0) {
      m.lunge -= dt;
      m.vx = m.aimX * LUNGE_V;
      m.vz = m.aimZ * LUNGE_V;
      this.lungeHit(m);
      // (the lunge spent: it stumbles out of it, no jump straight off it)
      if (m.lunge <= 0) {
        m.vx *= 0.4;
        m.vz *= 0.4;
        m.buffer = 0;
      }
    } else {
      const ex = dx - m.vx,
        ez = dz - m.vz,
        el = Math.hypot(ex, ez),
        step = acc * dt;
      if (el <= step) ((m.vx = dx), (m.vz = dz));
      else ((m.vx += (ex / el) * step), (m.vz += (ez / el) * step));
    }
    a.pos.x += m.vx * dt;
    a.pos.z += m.vz * dt;
    if ((m.mx || m.mz) && m.knock <= 0 && m.wind <= 0 && m.lunge <= 0) a.face(yawOf(m.mx, m.mz), dt, 14);
    // the jump (a press a moment early, or a moment after the edge, still counts)
    m.coyote = grounded ? COYOTE : m.coyote - dt;
    if (m.buffer > 0) {
      m.buffer -= dt;
      if ((grounded || m.coyote > 0) && a.vy <= 0.5 && !m.rooted && m.knock <= 0 && m.wind <= 0 && m.lunge <= 0) {
        // (a jump with a direction held goes at a full run's speed that way, even from a standstill)
        const l = Math.hypot(m.mx, m.mz);
        if (l > 0.3) {
          const ux = m.mx / l,
            uz = m.mz / l;
          const sp = Math.max(m.vx * ux + m.vz * uz, SPEED * Math.min(1, l));
          m.vx = ux * sp;
          m.vz = uz * sp;
        }
        a.vy = JUMP_V;
        a.grounded = false;
        a.body.jump();
        m.buffer = 0;
        m.coyote = 0;
        if (m.p.human) sfx.blip(3);
      }
    }
    const p = -a.pos.z;
    m.sup = this.support(a.pos.x, p);
    // (once it has dropped into a hole, the next tile doesn't catch it; on its feet it steps up a row)
    let fl: number | null = null;
    if (m.sup !== NONE) {
      const f = this.floorOf(m.sup);
      if (a.pos.y >= f - (grounded ? 0.5 : 0.2)) fl = f;
    }
    a.physics(dt, fl, G);
    m.cell = a.grounded ? this.innerAt(a.pos.x, p) : -1;
    m.rooted = false;
    if (a.grounded && m.sup !== NONE) {
      m.lastSup = m.sup;
      m.fy = a.pos.y;
      if (m.cell >= 0) this.touch(m, m.cell);
      const c = m.sup;
      if (c >= 0 && this.st[c] === SHAKE && this.kind[c] >= SLOPPY_K) m.rooted = true;
      if (c < 0) {
        const k = -1 - c;
        if (k < 3 && k > m.pad) ((m.pad = k), this.checkpoint(m, k));
        if (k === 3) return this.finish(m);
      }
      if (p > m.best + 0.05) ((m.best = p), (m.bestT = this.t));
      m.lastP = p;
    }
    if (a.pos.y < m.fy - 0.9) this.fall(m);
  }

  /** The floor's height on a support: a tile's top, a pad's. */
  private floorOf(sup: number) {
    return sup >= 0 ? this.cy[sup] : PADS[-1 - sup].y;
  }

  /** Feet in a tile's middle: a valid one glows (everyone saw it hold), a forgery glitches and starts to go. */
  private touch(m: Mk, c: number) {
    const st = this.st[c];
    if (this.kind[c] >= SLOPPY_K) {
      if (st === SOLID) {
        this.st[c] = SHAKE;
        this.stT[c] = 0;
        this.stats.tests[m.i]++;
        if (this.kind[c] === SLOPPY_K) this.stats.sloppy[m.i]++;
        if (m.ai?.sus[c]) this.stats.seen[m.i]++;
        const v = this.loud(m.a.pos);
        if (v > 0.1) fsx.glitch(v);
        this.fx.burst(this.v1.set(this.cx[c], this.cy[c] + 0.25, -this.cpp[c]), 12, ["#ff19c8", "#1a1033", "#ffffff"], { speed: 3, up: 2.5, size: 0.15, life: 0.5 });
        if (m.p.human) this.cam.shake(0.18);
      }
      return;
    }
    if (st === GONE || st === SHAKE) return;
    this.verLast[c] = this.t;
    if (c === m.lastCell) return;
    m.lastCell = c;
    if (this.verAt[c] < 0) {
      this.verAt[c] = this.t;
      this.pop("✓", this.cx[c], this.cy[c] + 0.7, -this.cpp[c], "#5dffa8", 0.8, 22);
      this.fx.burst(this.v1.set(this.cx[c], this.cy[c] + 0.1, -this.cpp[c]), 8, ["#5dffa8", "#ffffff"], { speed: 2.4, up: 2, size: 0.12, life: 0.5 });
      if (m.p.human) (fsx.chime(this.cr[c]), this.cam.shake(0.05));
    } else if (m.p.human) sfx.step(this.cr[c]);
    this.noticeSafe(c, m.i);
  }

  private fall(m: Mk) {
    const a = m.a;
    m.mode = FALL;
    m.modeT = 0;
    m.falls++;
    this.stats.falls[m.i]++;
    m.rooted = false;
    m.knock = m.wind = m.lunge = 0;
    m.sup = NONE;
    m.cell = -1;
    this.replan(m);
    a.hit();
    m.spin = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3);
    m.pad = this.padFor(m.lastP);
    const ls = m.lastSup;
    const why = ls >= 0 && this.st[ls] === GONE ? (this.kind[ls] >= SLOPPY_K ? 1 : 2) : 0;
    const credit = m.by >= 0 && this.t - m.byT < 1.6 ? m.by : -1;
    if (why === 2) this.stats.beamFalls++;
    if (LV.gust && this.t - this.blownAt < 0.8) this.stats.gustFalls++;
    this.stats.why.push(`${m.i}@${this.t.toFixed(1)}:${["edge", "forged", "shor"][why]}${credit >= 0 ? "+shove" + credit : ""}`);
    const v = this.loud(a.pos);
    if (v > 0.15) scream(m.p.human ? 1 : 0.85 + m.i * 0.08, 0.2 * v);
    this.fx.burst(this.v1.set(a.pos.x, a.pos.y + 0.7, a.pos.z), 12, ["#ffffff", m.p.color, "#ffd23f"], { speed: 3.5, up: 2.5, gravity: 10, size: 0.16, life: 0.6 });
    if (!m.p.human && v > 0.65) this.cam.shake(0.08);
    if (m.p.human) {
      this.say(credit >= 0 ? T("SHOVED!", "被推下去了！") : why === 1 ? T("FORGED!", "伪造！") : why === 2 ? T("LINKED BY THE TRACKER!", "被追踪者关联了！") : T("WHOOPS!", "哎呀！"), "#ff3d5a", 1.1);
      this.cam.shake(0.5);
      sfx.lose();
    }
    if (credit >= 0) {
      this.stats.shoveFalls++;
      if (this.pl[credit].p.human) this.say(T("NICE SHOVE!", "推得漂亮！"), this.players[credit].color, 1.0);
    }
  }

  /** Its plans are void (it fell, it was knocked, it is back on a pad). */
  private replan(m: Mk) {
    const b = m.ai;
    if (!b) return;
    b.jumping = false;
    b.lock = b.fired = b.wait = b.hop = 0;
    b.dodge = -1;
    b.frontier = -1;
    b.think = 0;
    b.tx = m.a.pos.x;
    b.tp = -m.a.pos.z;
  }

  /** Off the net: flung back up in an arc to the last checkpoint. */
  private lift(m: Mk) {
    const k = m.pad,
      pd = PADS[k],
      s = SEGS[k];
    const half = Math.min(pd.w, s.w) / 2 - 1;
    const x = clamp(m.a.pos.x + (this.rnd() - 0.5) * 1.4, s.ox - half, s.ox + half);
    m.l0.copy(m.a.pos);
    m.l1.set(x, pd.y, -(pd.p1 - 1.3));
    m.mode = LIFT;
    m.modeT = 0;
    const v = this.loud(m.a.pos);
    if (v > 0.15 || m.p.human) fsx.launch(m.p.human ? 1 : v);
    if (m.p.human) this.cam.shake(0.12);
    this.fx.burst(this.v1.set(m.a.pos.x, NET_Y + 0.3, m.a.pos.z), 14, [m.p.color, "#ffffff", "#8ff6ff"], { speed: 3, up: 6, gravity: 6, size: 0.18, life: 0.7 });
  }

  private checkpoint(m: Mk, k: number) {
    this.fx.burst(this.v1.set(m.a.pos.x, 0.4, m.a.pos.z), 18, ["#3fd0a8", "#ffffff", "#ffd23f"], { speed: 4, up: 4, size: 0.16, life: 0.7 });
    if (m.p.human) {
      this.say(k === 1 ? T("CHECKPOINT!", "检查点！") : T("LAST STRETCH!", "最后一段！"), "#3fd0a8", 1.2);
      sfx.coin();
      this.cam.shake(0.12);
    } else if (this.loud(m.a.pos) > 0.5) tone(1175, 0.09, "triangle", 0.1);
  }

  private finish(m: Mk) {
    if (m.fin >= 0) return;
    m.fin = this.t;
    this.stats.fin[m.i] = +this.t.toFixed(2);
    m.mode = DONE;
    m.vx = m.vz = 0;
    m.rooted = false;
    m.best = Math.max(m.best, END);
    const place = this.pl.filter((o) => o.fin >= 0).length - 1;
    m.place = place;
    m.spotX = PADS[3].ox + (place - 1.5) * 2.4;
    m.spotP = END + 3.4;
    m.cheerT = 0.35;
    for (let k = 0; k < 3; k++) this.fx.burst(this.v1.set(PADS[3].ox - 6 + k * 6, PADS[3].y + 1, -(END + 1)), 22, ["#ffd23f", "#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#ffffff"], { speed: 6, up: 9, gravity: 9, size: 0.2, life: 1.3 });
    if (m.p.human) {
      this.say(place === 0 ? T("FIRST ACROSS!", "第一个过关！") : `${T("ACROSS!", "过关！")} ${ord(place).toUpperCase()}`, "#ffd23f", 1.6);
      sfx.fanfare();
      this.cam.shake(0.3);
    } else {
      if (place === 0) this.say(T(`${short(m.p)} IS ACROSS!`, `${short(m.p)} 过关了！`), m.p.color, 1.3);
      sfx.coin();
    }
  }

  private humanShove(m: Mk) {
    let ax = Math.sin(m.a.yaw),
      az = Math.cos(m.a.yaw);
    // (a soft aim: the nearest rival in front of it, within reach)
    let best = 2.3,
      tx = 0,
      tz = 0;
    for (const o of this.pl) {
      if (o === m || o.mode !== RUN || o.fin >= 0) continue;
      const dx = o.a.pos.x - m.a.pos.x,
        dz = o.a.pos.z - m.a.pos.z,
        d = Math.hypot(dx, dz);
      if (d < best && d > 0.01 && (dx * ax + dz * az) / d > 0.55) ((best = d), (tx = dx / d), (tz = dz / d));
    }
    if (best < 2.3) ((ax = tx), (az = tz));
    this.startShove(m, ax, az);
  }

  private canShove(m: Mk) {
    return m.mode === RUN && m.cd <= 0 && m.knock <= 0 && m.wind <= 0 && m.lunge <= 0 && m.a.grounded && !m.rooted;
  }

  private startShove(m: Mk, x: number, z: number) {
    if (!this.canShove(m)) return;
    m.wind = WIND;
    m.aimX = x;
    m.aimZ = z;
    m.cd = SHOVE_CD;
    m.a.yaw = yawOf(x, z);
    this.stats.shoves++;
    if (m.p.human) fsx.wind();
    // the ones it's aimed at may see it coming and hop
    for (const o of this.pl) {
      const b = o.ai;
      if (o === m || !b || o.mode !== RUN) continue;
      const dx = o.a.pos.x - m.a.pos.x,
        dz = o.a.pos.z - m.a.pos.z,
        d = Math.hypot(dx, dz);
      if (d < 2.8 && d > 0.01 && (dx * x + dz * z) / d > 0.5) b.dodge = this.rnd() < 0.12 + 0.6 * b.sk ? 0.04 + (1 - b.sk) * 0.2 + this.rnd() * 0.06 : -1;
    }
  }

  private lungeHit(m: Mk) {
    const hx = m.a.pos.x + m.aimX * 0.45,
      hz = m.a.pos.z + m.aimZ * 0.45;
    for (const o of this.pl) {
      if (o === m || o.mode !== RUN || o.fin >= 0 || o.guard > 0) continue;
      // (a hop goes over it)
      if (o.a.pos.y > o.fy + 0.45) continue;
      if (Math.hypot(o.a.pos.x - hx, o.a.pos.z - hz) > REACH) continue;
      o.knock = KNOCK_T;
      o.vx = m.aimX * KNOCK_V;
      o.vz = m.aimZ * KNOCK_V;
      o.guard = GUARD;
      o.by = m.i;
      o.byT = this.t;
      o.wind = o.lunge = 0;
      this.replan(o);
      o.a.hit();
      m.lunge = 0;
      m.vx *= 0.15;
      m.vz *= 0.15;
      this.stats.hits++;
      this.fx.burst(this.v1.set(o.a.pos.x, 1.1, o.a.pos.z), 14, ["#ffffff", "#ffd23f", m.p.color], { speed: 5, up: 3, size: 0.16, life: 0.5 });
      if (m.p.human || o.p.human) (sfx.hit(), this.cam.shake(0.3));
      else if (this.loud(o.a.pos) > 0.4) sfx.hit();
      this.pop(T("SHOVE!", "推！"), o.a.pos.x, 2.4, o.a.pos.z, m.p.color, 0.8, 18);
      return;
    }
  }

  /** Bodies bump (at about the same height). */
  private collide(dt: number) {
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const a = this.pl[i],
          b = this.pl[j];
        if ((a.mode !== RUN && a.mode !== DONE) || (b.mode !== RUN && b.mode !== DONE) || Math.abs(a.a.pos.y - b.a.pos.y) > 0.8) continue;
        const dx = b.a.pos.x - a.a.pos.x,
          dz = b.a.pos.z - a.a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d >= PR * 2 || d < 1e-4) continue;
        const nx = dx / d,
          nz = dz / d,
          lap = Math.min((PR * 2 - d) / 2, PART_V * dt);
        a.a.pos.x -= nx * lap;
        a.a.pos.z -= nz * lap;
        b.a.pos.x += nx * lap;
        b.a.pos.z += nz * lap;
        const vr = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (vr > 0) {
          a.vx -= nx * vr * 0.5;
          a.vz -= nz * vr * 0.5;
          b.vx += nx * vr * 0.5;
          b.vz += nz * vr * 0.5;
        }
      }
  }

  // ---- the tiles ---------------------------------------------------------------------------------

  /** What holds up a point (x, p): a pad (−1 − k), the nearest unbroken tile within a foot of it, or NONE. */
  private support(x: number, p: number): number {
    for (let k = 0; k < 4; k++) {
      const pd = PADS[k];
      if (p >= pd.p0 - FOOT && p <= pd.p1 + FOOT && Math.abs(x - pd.ox) <= pd.w / 2 + FOOT) return -1 - k;
    }
    const lim = TILE / 2 + FOOT;
    for (const s of SEGS) {
      if (p < s.p0 - 1 || p > s.p1 + 1) continue;
      const c0 = Math.floor((x - s.ox + s.w / 2) / PITCH),
        r0 = Math.floor((p - s.p0) / PITCH);
      let best = NONE,
        bd = Infinity;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const r = r0 + dr,
            c = c0 + dc;
          if (r < 0 || r >= s.rows || c < 0 || c >= s.cols) continue;
          const i = s.c0 + r * s.cols + c;
          if (this.st[i] === GONE) continue;
          const ex = Math.abs(x - this.cx[i]),
            ep = Math.abs(p - this.cpp[i]);
          if (ex <= lim && ep <= lim) {
            const d = Math.max(ex, ep);
            if (d < bd) ((bd = d), (best = i));
          }
        }
      if (best !== NONE) return best;
    }
    return NONE;
  }

  /** The tile whose middle (all but its rim) holds this point, or −1. */
  private innerAt(x: number, p: number) {
    for (const s of SEGS) {
      if (p < s.p0 || p >= s.p1) continue;
      const c = Math.floor((x - s.ox + s.w / 2) / PITCH),
        r = Math.floor((p - s.p0) / PITCH);
      if (c < 0 || c >= s.cols || r < 0 || r >= s.rows) return -1;
      const i = s.c0 + r * s.cols + c;
      const lim = PITCH / 2 - EDGE;
      return Math.abs(x - this.cx[i]) < lim && Math.abs(p - this.cpp[i]) < lim ? i : -1;
    }
    return -1;
  }

  private padFor(p: number) {
    for (let k = 2; k > 0; k--) if (p >= PADS[k].p0 - 0.5) return k;
    return 0;
  }

  private tiles(dt: number) {
    const t = this.t;
    for (let c = 0; c < NC; c++) {
      const st = this.st[c];
      if (st === SHAKE) {
        this.stT[c] += dt;
        if (this.stT[c] >= SHAKE_T) this.breakTile(c);
      } else if (st === WARN) this.stT[c] += dt;
      if (this.gOn[c] > 0) this.gOn[c] -= dt;
      if (this.kind[c] === SLOPPY_K && st === SOLID && t >= this.gNext[c]) {
        this.gOn[c] = GLITCH_T;
        this.gNext[c] = t + GLITCH_GAP + this.rnd() * GLITCH_GAP * 1.3;
        this.gDir[c] = -this.gDir[c];
        this.noticeTell(c);
      }
    }
  }

  private breakTile(c: number) {
    this.st[c] = GONE;
    const forged = this.kind[c] >= SLOPPY_K;
    if (forged) this.stats.forged++;
    else this.stats.legacy++;
    const x = this.cx[c],
      y = this.cy[c],
      z = -this.cpp[c];
    this.spawnShards(c);
    this.fx.burst(this.v1.set(x, y, z), 22, forged ? ["#ff19c8", "#ff3355", "#1a1033", SEG_TOP[this.cs[c]]] : ["#ffa23a", "#ffd23f", "#1a1033", SEG_TOP[this.cs[c]]], { speed: 5, up: 3, gravity: 16, size: 0.2, life: 0.9 });
    const v = this.loud(this.v1.set(x, 0, z));
    if (v > 0.1) fsx.shatter(v);
    this.pop(forged ? T("FORGED!", "伪造！") : "T-ADDR ✗", x, y + 0.9, z, forged ? "#ff3d5a" : "#ffa23a", 1.1, forged ? 24 : 20);
    if (forged && !this.said.forgery) ((this.said.forgery = true), this.say(T("COUNTERFEIT!", "伪钞！"), "#ff3d5a", 1.0));
    if (v > 0.7) this.cam.shake(0.12);
  }

  private spawnShards(c: number) {
    const S = this.sh;
    const x = this.cx[c],
      z = -this.cpp[c];
    for (let k = 0; k < 9; k++) {
      let j = -1;
      for (let q = 0; q < 160; q++)
        if (S.life[q] < 0) {
          j = q;
          break;
        }
      if (j < 0) return;
      const ox = ((k % 3) - 1) * 0.6,
        oz = (Math.floor(k / 3) - 1) * 0.6;
      S.x[j] = x + ox;
      S.y[j] = this.cy[c] - 0.25;
      S.z[j] = z + oz;
      S.vx[j] = ox * 2.2 + (Math.random() - 0.5) * 1.5;
      S.vy[j] = 1.5 + Math.random() * 2.5;
      S.vz[j] = oz * 2.2 + (Math.random() - 0.5) * 1.5;
      S.rx[j] = (Math.random() - 0.5) * 12;
      S.ry[j] = (Math.random() - 0.5) * 12;
      S.sx[j] = 0.5 + Math.random() * 0.15;
      S.sy[j] = 0.35 + Math.random() * 0.2;
      S.life[j] = 0;
      this.mShard.setColorAt(j, this.col.set(k % 3 === 1 ? SEG_SIDE[this.cs[c]] : SEG_TOP[this.cs[c]]));
    }
    if (this.mShard.instanceColor) this.mShard.instanceColor.needsUpdate = true;
  }

  private shards(dt: number) {
    const S = this.sh;
    for (let j = 0; j < 160; j++) {
      if (S.life[j] < 0) continue;
      S.life[j] += dt;
      S.vy[j] -= G * 0.8 * dt;
      S.x[j] += S.vx[j] * dt;
      S.y[j] += S.vy[j] * dt;
      S.z[j] += S.vz[j] * dt;
      if (S.life[j] > 2.4 || S.y[j] < NET_Y + 0.3) {
        S.life[j] = -1;
        this.mShard.setMatrixAt(j, this.ZERO);
        continue;
      }
      this.eu.set(S.life[j] * S.rx[j], S.life[j] * S.ry[j], 0);
      this.m4.compose(this.v1.set(S.x[j], S.y[j], S.z[j]), this.q1.setFromEuler(this.eu), this.v2.set(S.sx[j], S.sy[j], S.sx[j]));
      this.mShard.setMatrixAt(j, this.m4);
    }
    this.mShard.instanceMatrix.needsUpdate = true;
  }

  /** EXPOSURE: the TRACKER BEAM sweeps the field, transparent tiles flash and break as it passes. */
  private beam() {
    if (!this.beamOn || !LV.qday) return;
    this.beamP = -6 + (this.t - QDAY) * BEAM_V;
    for (const c of this.legacyList) {
      const st = this.st[c];
      if (st === SOLID && this.beamP >= this.cpp[c] - BEAM_V * WARN_T) {
        this.st[c] = WARN;
        this.stT[c] = 0;
      } else if (st === WARN && this.beamP >= this.cpp[c]) {
        this.st[c] = SHAKE;
        this.stT[c] = 0;
        const v = this.loud(this.v1.set(this.cx[c], 0, -this.cpp[c]));
        if (v > 0.2) fsx.crack(v);
        this.fx.burst(this.v1.set(this.cx[c], this.cy[c] + 0.2, -this.cpp[c]), 8, ["#ffa23a", "#ffd23f", "#ffffff"], { speed: 2.5, up: 2.5, size: 0.13, life: 0.5 });
      }
    }
    if (this.beamP > END + 6) {
      this.beamOn = false;
      this.beamDone = true;
      this.stopHum();
    }
  }

  /** The Tracker's rig: parked beside the field, over the start for EXPOSURE, along the beam, then away. */
  private machine(dt: number) {
    if (!LV.qday) return;
    const t = this.t,
      g = this.shor;
    let x = -16,
      y = 9 + Math.sin(t * 0.8) * 0.4,
      p = 18,
      k = 1.2;
    // (it rides the field's left side, under the camera's eye line: in view, never in the way)
    if (this.beamOn) ((x = -12.2), (y = 7.6 + Math.sin(t * 3) * 0.2), (p = this.beamP), (k = 12));
    else if (this.beamDone) ((x = -18), (y = 14), (p = END + 10));
    else if (t >= QDAY - 3.5) ((x = -12.2), (y = 7.6), (p = -6), (k = 2.2));
    g.position.lerp(this.v1.set(x, y, -p), 1 - Math.exp(-k * dt));
    g.rotation.y += dt * (this.beamOn ? 1.6 : 0.3);
    const hot = this.beamOn ? 1.2 + Math.sin(t * 30) * 0.15 : t >= QDAY - 3.5 && !this.beamDone ? 1 + Math.sin(t * 12) * 0.25 : 1;
    this.core.scale.setScalar(hot * 1.1);
    this.curtain.visible = this.beamLine.visible = this.beamOn;
    if (this.beamOn) {
      this.curtain.position.set(0, 2.4, g.position.z);
      this.curtain.scale.set(27 + Math.sin(t * 20) * 0.4, 4.8 + Math.sin(t * 13) * 0.15, 1);
      this.beamLine.position.set(0, 0.06, g.position.z);
      if (Math.random() < 0.5) this.fx.burst(this.v1.set((Math.random() - 0.5) * 20, 0.2, g.position.z), 1, ["#ff9cf0", "#ffffff"], { speed: 1.5, up: 3, gravity: 2, size: 0.14, life: 0.6 });
    }
  }

  /** The field's half width at p (a stretch's, a pad's). */
  private halfW(p: number) {
    for (const s of SEGS) if (p >= s.p0 && p <= s.p1) return s.w / 2;
    for (const pd of PADS) if (p >= pd.p0 && p <= pd.p1) return Math.min(8, pd.w / 2);
    return 5;
  }

  /** SPROUT RUINS: the lighthouse's spot sweeps the field (along it and back, across it as it goes) and lights the tiles under it: a forgery in its light shows red, and keeps it a moment. The fog rolls in later. */
  private lamp(dt: number, play: boolean) {
    const L = LV.lamp;
    if (!L) return;
    if (this.t >= L.fogAt && this.fogK < 1) {
      this.fogK = Math.min(1, this.fogK + dt / 3);
      const f = this.w.scene.fog as THREE.Fog | null;
      if (f) ((f.near = lerp(LV.fog[0], LV.fog[0] * 0.6, this.fogK)), (f.far = lerp(LV.fog[1], LV.fog[1] * 0.62, this.fogK)));
      this.spotR = lerp(L.r, L.r2, this.fogK);
      this.sight = lerp(7.5, 5, this.fogK);
    }
    this.redPing -= dt;
    this.spot(this.t);
    const x = this.spotX,
      p = this.spotP;
    const R = this.spotR;
    for (let c = 0; c < NC; c++) {
      const l = clamp((1 - Math.hypot(this.cx[c] - x, this.cpp[c] - p) / R) * 2.2, 0, 1);
      this.lit[c] = l;
      if (l > 0.5 && this.kind[c] >= SLOPPY_K && this.st[c] !== GONE) this.red[c] = 1;
      else if (this.red[c] > 0) this.red[c] = Math.max(0, this.red[c] - dt / 1.1);
      if (l > 0.5 && !this.litOn[c]) {
        this.litOn[c] = 1;
        if (play && this.st[c] === SOLID) this.shine(c);
      } else if (l < 0.15) this.litOn[c] = 0;
    }
    // the lamp turns to its spot; the beam, the pool, the light follow
    const z = -p;
    if (this.lampHead) this.lampHead.lookAt(x, 0, z);
    if (this.lampPool) {
      this.lampPool.position.set(x, 0.09, z);
      this.lampPool.scale.set(R * 2.6, R * 2.6, 1);
    }
    if (this.lampLight) this.lampLight.position.set(x, 3.4, z);
    const bm = this.lampBeam,
      hd = this.lampHead;
    if (bm && hd) {
      const d = this.v2.set(x, 0, z).sub(hd.position);
      const len = d.length();
      bm.position.copy(hd.position);
      bm.quaternion.setFromUnitVectors(this.DOWN, d.multiplyScalar(1 / len));
      bm.scale.set(R * 1.05, len, R * 1.05);
    }
  }

  /** A tile came into the light: the AIs nearby may read it (red: a forgery; plain: a valid one), and you hear a forgery near you. */
  private shine(c: number) {
    const forged = this.kind[c] >= SLOPPY_K;
    for (const o of this.pl) {
      const b = o.ai;
      if (!b || o.mode !== RUN || o.fin >= 0) continue;
      const dp = this.cpp[c] + o.a.pos.z;
      if (dp < -1 || dp > this.sight + 2 || Math.abs(this.cx[c] - o.a.pos.x) > 8) continue;
      if (forged) {
        if (this.rnd() < SEE_RED0 + SEE_RED1 * b.sk) ((b.sus[c] = 1), this.stats.lampRed++);
      } else if (this.rnd() < SEE_OK0 + SEE_OK1 * b.sk * b.sk) ((b.shown[c] = 1), this.stats.lampOk++);
    }
    const h = this.human >= 0 ? this.pl[this.human] : null;
    if (forged && h && h.mode === RUN && h.fin < 0 && this.redPing <= 0 && Math.hypot(this.cx[c] - h.a.pos.x, this.cpp[c] + h.a.pos.z) < 9) {
      this.redPing = 0.35;
      tone(196, 0.32, "triangle", 0.12, 0.7);
      this.fx.burst(this.v1.set(this.cx[c], this.cy[c] + 0.15, -this.cpp[c]), 6, ["#ff3355", "#ff9cb0"], { speed: 1.6, up: 2.2, gravity: 5, size: 0.12, life: 0.55 });
    }
  }

  /** The wind along x at p (m/s; stronger the higher up). */
  private windAt(p: number) {
    const g = LV.gust;
    if (!g || !this.wind) return 0;
    const k = p < SEGS[1].p0 ? 0 : p < SEGS[2].p0 ? 1 : 2;
    return this.wind * g.v[k];
  }

  /** HALO SPIRE: gusts, each one called first (the windsocks lift and turn, a whoosh, the HUD's arrows), then it blows; they come closer together as the game goes. */
  private gusts(dt: number, play: boolean) {
    const g = LV.gust;
    if (!g) return;
    const t = this.t;
    if (play && !this.over) {
      if (this.gustPh === 0 && t >= this.gustAt - g.warn) {
        this.gustPh = 1;
        this.gustT = 0;
        this.gustDir = this.rnd() < 0.5 ? -1 : 1;
        this.gustN++;
        this.stats.gusts++;
        // (who braces for it: no jumping till it has blown over)
        for (const m of this.pl) if (m.ai) m.ai.brace = this.rnd() < 0.3 + 0.55 * m.ai.sk;
        hiss(g.warn + 0.4, 0.16, 700);
        tone(170, g.warn, "sine", 0.09, 2.2);
        if (this.gustN === 1) this.say(T("WINDY UP HERE!", "上面风很大！"), "#ffd23f", 1.2);
      } else if (this.gustPh === 1 && t >= this.gustAt) {
        this.gustPh = 2;
        this.gustT = 0;
        hiss(g.dur + 0.3, 0.32, 260);
        tone(95, g.dur, "sawtooth", 0.05, 0.8);
        this.cam.shake(0.18);
        // (dust off everyone's feet, downwind)
        for (const m of this.pl)
          if (m.mode === RUN && m.fin < 0) this.fx.burst(this.v1.set(m.a.pos.x, m.a.pos.y + 0.2, m.a.pos.z), 7, ["#ffffff", "#ffe6dc", "#ffd0a0"], { speed: 1.4, up: 1.2, gravity: 2, size: 0.14, life: 0.8, drag: 1, dir: this.v2.set(this.gustDir * 6, 0, 0) });
      } else if (this.gustPh === 2 && this.gustT >= g.dur) {
        this.gustPh = 0;
        this.gustAt = t + lerp(g.gap0, g.gap1, clamp(t / 45, 0, 1));
        for (const m of this.pl) if (m.ai) m.ai.brace = false;
      }
      this.gustT += dt;
    } else if (this.over && this.gustPh) this.gustPh = 0;
    this.wind = this.gustPh === 2 ? this.gustDir * clamp(this.gustT / 0.25, 0, 1) * clamp((g.dur - this.gustT) / 0.35, 0, 1) : 0;
    if (this.wind) this.blownAt = t;
    // the windsocks: limp in the calm, lifting toward the gust once it's called, straight out and flapping while it blows
    const sk = this.socks;
    if (sk) {
      const lift = this.gustPh === 0 ? 0.06 : this.gustPh === 1 ? 0.3 + 0.45 * clamp(this.gustT / g.warn, 0, 1) : 0.97;
      for (let i = 0; i < this.sockAt.length; i++) {
        const fl = Math.sin(this.t * (this.gustPh === 2 ? 22 : 4) + i * 1.3) * (this.gustPh === 2 ? 0.08 : 0.05);
        this.q1.setFromAxisAngle(this.UP, (this.gustDir > 0 ? 0 : Math.PI) + fl);
        this.q2.setFromAxisAngle(this.ZAX, -(1 - lift) * 1.4 + fl);
        this.q1.multiply(this.q2);
        this.m4.compose(this.sockAt[i], this.q1, this.v2.set(1, 1 + (this.gustPh === 2 ? 0.08 * Math.sin(this.t * 30 + i) : 0), 1));
        sk.setMatrixAt(i, this.m4);
      }
      sk.instanceMatrix.needsUpdate = true;
    }
    // the streaks across the view
    const st = this.streaks;
    if (st) {
      const S = this.stk;
      const rate = this.gustPh === 2 ? 70 : this.gustPh === 1 ? 9 : 0;
      let spawn = Math.floor(rate * dt) + (Math.random() < (rate * dt) % 1 ? 1 : 0);
      for (let j = 0; j < 48; j++) {
        if (S.life[j] < 0) {
          if (spawn < 1) continue;
          spawn--;
          const at = this.cam.at;
          S.x[j] = at.x - this.gustDir * (12 + Math.random() * 6);
          S.y[j] = at.y + 0.4 + Math.random() * 5;
          S.z[j] = at.z - 9 + Math.random() * 17;
          S.v[j] = this.gustDir * (16 + Math.random() * 8);
          S.len[j] = 1.2 + Math.random() * 1.6;
          S.life[j] = 0;
        }
        S.life[j] += dt;
        S.x[j] += S.v[j] * dt;
        if (S.life[j] > 1.6) {
          S.life[j] = -1;
          st.setMatrixAt(j, this.ZERO);
          continue;
        }
        this.m4.compose(this.v1.set(S.x[j], S.y[j], S.z[j]), this.q1.identity(), this.v2.set(S.len[j], 0.05, 0.05));
        st.setMatrixAt(j, this.m4);
      }
      st.instanceMatrix.needsUpdate = true;
    }
  }

  private decorate(dt: number) {
    for (const s of this.spinners) s.rotation.y += dt * 1.4;
    for (const r of this.ripples) {
      if (r.life < 0) continue;
      r.life += dt;
      const k = r.life / 0.8;
      if (k >= 1) {
        r.life = -1;
        r.m.visible = false;
        continue;
      }
      r.m.scale.setScalar(1 + k * 5);
      r.mat.opacity = (1 - k) * 0.9;
    }
  }

  private ripple(x: number, z: number) {
    const r = this.ripples.find((q) => q.life < 0) ?? this.ripples[0];
    r.life = 0;
    r.m.visible = true;
    r.m.position.set(x, NET_Y + 0.05, z);
  }

  /** The tiles into their instanced meshes (every frame: shakes, glitches, glows). */
  private writeTiles() {
    const t = this.t,
      M = this.m4,
      P = this.v1,
      S = this.v2,
      Q = this.q1,
      C = this.C,
      col = this.col;
    for (let c = 0; c < NC; c++) {
      const sg = this.cs[c],
        x = this.cx[c],
        y = this.cy[c],
        z = -this.cpp[c],
        st = this.st[c];
      const dm = this.mDecal[this.glyph[c]],
        di = this.gIdx[c],
        li = this.lIdx[c];
      if (st === GONE) {
        this.mSlab.setMatrixAt(c, this.ZERO);
        this.mInk.setMatrixAt(c, this.ZERO);
        this.mTop.setMatrixAt(c, this.ZERO);
        this.mGlow.setMatrixAt(c, this.ZERO);
        dm.setMatrixAt(di, this.ZERO);
        if (li >= 0) this.mStamp.setMatrixAt(li, this.ZERO);
        M.compose(P.set(x, y - 0.03, z), Q.identity(), S.set(1, 1, 1));
        this.mHole.setMatrixAt(c, M);
        continue;
      }
      this.mHole.setMatrixAt(c, this.ZERO);
      let jx = 0,
        jz = 0,
        dy = 0,
        rz = 0;
      if (st === SHAKE) {
        const k = this.stT[c] / SHAKE_T;
        jx = Math.sin(t * 83 + c) * 0.07 * (0.5 + k);
        jz = Math.cos(t * 71 + c * 1.7) * 0.07 * (0.5 + k);
        dy = -k * 0.14;
        rz = Math.sin(t * 60 + c) * 0.06;
      } else if (st === WARN) jx = Math.sin(t * 45 + c) * 0.025;
      this.eu.set(rz, 0, -rz * 0.6);
      Q.setFromEuler(this.eu);
      M.compose(P.set(x + jx, y - TH / 2 + dy, z + jz), Q, S.set(TILE, TH, TILE));
      this.mSlab.setMatrixAt(c, M);
      M.compose(P, Q, S.set(TILE + 0.12, TH + 0.12, TILE + 0.12));
      this.mInk.setMatrixAt(c, M);
      M.compose(P.set(x + jx, y + dy - 0.025, z + jz), Q, S.set(TILE - 0.2, 0.07, TILE - 0.2));
      this.mTop.setMatrixAt(c, M);
      // the top's colour: its stretch's, mint once it held, red while a forgery goes, orange for a doomed key
      const ver = this.verAt[c] >= 0;
      const fresh = ver ? Math.exp(-(t - this.verLast[c]) / 2.5) : 0;
      col.copy(C.top[sg]);
      if (ver) col.lerp(C.mint, 0.5 + 0.45 * fresh);
      // (the ruins at night: dark but for the glows and the lighthouse's light, where a forgery shows red)
      const rd = LV.lamp ? this.red[c] : 0;
      if (LV.lamp) {
        const l = this.lit[c],
          dark = ver ? 0.8 : 0.36;
        col.multiplyScalar(dark + (1 - dark) * l);
        if (l > 0) col.lerp(C.warm, 0.2 * l);
        if (rd > 0) col.lerp(C.red, rd * (0.8 + 0.2 * Math.sin(t * 16)));
      }
      if (st === SHAKE) col.copy(this.kind[c] >= SLOPPY_K ? (Math.sin(t * 40) > 0 ? C.red : C.redD) : C.orange);
      else if (st === WARN) col.lerp(C.orange, 0.55 + 0.45 * Math.sin(this.stT[c] * 14));
      const gl = this.gOn[c] > 0;
      if (gl) col.lerp(C.magenta, 0.22);
      this.mTop.setColorAt(c, col);
      // the glyph (crooked on a sloppy forgery; a jump and a flash when it glitches)
      const gx = gl ? this.gDir[c] * 0.13 : 0;
      this.q2.setFromAxisAngle(this.UP, this.tilt[c] + (gl ? this.gDir[c] * 0.3 : 0));
      Q.multiplyQuaternions(this.q2, this.qFlat);
      const ds = gl ? 1.42 : 1.3;
      M.compose(P.set(x + jx + gx, y + dy + 0.022, z + jz), Q, S.set(ds, ds, 1));
      dm.setMatrixAt(di, M);
      dm.setColorAt(di, gl ? C.magenta : st === SHAKE || rd > 0.3 ? C.white : ver ? C.mintInk : C.ink[sg]);
      if (ver && st !== SHAKE) {
        const k = 0.28 + 0.6 * fresh;
        M.compose(P.set(x, y + 0.045, z), this.qFlat, S.set(TILE * 1.2, TILE * 1.2, 1));
        this.mGlow.setMatrixAt(c, M);
        this.mGlow.setColorAt(c, col.copy(C.glow).multiplyScalar(k));
      } else this.mGlow.setMatrixAt(c, this.ZERO);
      if (li >= 0) {
        if (st === WARN || st === SHAKE) {
          const k = 1 + Math.sin(t * 16) * 0.06;
          M.compose(P.set(x + jx, y + dy + 0.035, z + jz), this.qFlat, S.set(1.5 * k, 0.75 * k, 1));
          this.mStamp.setMatrixAt(li, M);
        } else this.mStamp.setMatrixAt(li, this.ZERO);
      }
    }
    for (const m of [this.mSlab, this.mInk, this.mTop, this.mGlow, this.mHole, this.mStamp, ...this.mDecal]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  // ---- the AI ------------------------------------------------------------------------------------

  /** Someone stood on tile c and it held: who noticed (the stander always; the others by skill). */
  private noticeSafe(c: number, by: number) {
    for (const o of this.pl) {
      const b = o.ai;
      if (!b) continue;
      if (o.i === by || this.rnd() < 0.35 + 0.65 * b.sk) b.mem[c] = this.t;
    }
  }

  /** A sloppy forgery glitched: who saw it (looking ahead, by skill; a weak eye may pin it on the next tile). */
  private noticeTell(c: number) {
    for (const o of this.pl) {
      const b = o.ai;
      if (!b || o.mode !== RUN || o.fin >= 0) continue;
      const dp = this.cpp[c] + o.a.pos.z;
      if (dp < -1 || dp > this.sight || Math.abs(this.cx[c] - o.a.pos.x) > 7) continue;
      if (this.rnd() >= TELL0 + TELL1 * b.sk * b.sk) continue;
      let k = c;
      if (this.rnd() < (1 - b.sk) * 0.4) {
        const s = SEGS[this.cs[c]];
        const cc = this.cc[c] + (this.rnd() < 0.5 ? -1 : 1);
        if (cc >= 0 && cc < s.cols) k = c - this.cc[c] + cc;
      }
      b.sus[k] = 1;
    }
  }

  /** What an AI makes of tile c. */
  private know(b: Brain, c: number) {
    const st = this.st[c];
    if (st === GONE || st === SHAKE || st === WARN) return BLOCKED;
    const vl = this.verLast[c];
    if (vl >= 0 && (this.t - vl < FRESH || (b.mem[c] >= 0 && this.t - b.mem[c] < 4 + 50 * b.sk * b.sk))) return SAFE;
    if (b.shown[c]) return SAFE;
    if (b.sus[c]) return SUSPECT;
    return UNKNOWN;
  }

  /** How bad a spot would be to land on, as this AI sees it: 0 safe … 3 a hole or the void. */
  private danger(b: Brain, x: number, p: number) {
    const c = this.innerAt(x, p);
    const s = c >= 0 ? c : this.support(x, p);
    if (s === NONE) return 3;
    if (s < 0) return 0;
    const k = this.know(b, s);
    return k === SAFE ? 0 : k === UNKNOWN ? 2 : k === SUSPECT ? 2.5 : 3;
  }

  private think(m: Mk) {
    const b = m.ai!,
      a = m.a;
    b.think = 0.08 + (1 - b.sk) * 0.2 + this.rnd() * 0.08;
    if (m.mode !== RUN || m.fin >= 0 || m.knock > 0 || !a.grounded) return;
    if ((b.jumping && b.lock > 0) || b.fired > 0) return;
    b.look = NaN;
    const px = a.pos.x,
      pp = -a.pos.z;
    // where it is: on a tile (that stretch), or on a pad (the stretch ahead)
    let s: Seg,
      start: number,
      cur = -1;
    // (on a tile's rim: it is still on the tile it came from, not on the one it leans over)
    let c = m.cell;
    const lc = m.lastCell;
    if (c < 0 && lc >= 0 && this.st[lc] !== GONE && Math.abs(px - this.cx[lc]) <= 1.45 && Math.abs(pp - this.cpp[lc]) <= 1.45) c = lc;
    if (c < 0 && m.sup >= 0) c = m.sup;
    // (on the rim of a tile it doesn't know, a pad's edge just behind: it is on the pad)
    let padK = m.sup < 0 && m.sup > NONE ? -1 - m.sup : -1;
    if (c >= 0 && c !== m.cell && this.know(b, c) !== SAFE)
      for (let k = 0; k < 3; k++) {
        const pd = PADS[k];
        if (pp >= pd.p0 - 0.9 && pp <= pd.p1 + 0.9 && Math.abs(px - pd.ox) <= pd.w / 2 + 0.3) ((padK = k), (c = -1));
      }
    if (c >= 0) {
      s = SEGS[this.cs[c]];
      start = c - s.c0;
      cur = c;
    } else if (padK >= 0 && padK < 3) {
      s = SEGS[padK];
      start = s.n;
    } else return;
    const r = this.route(b, s, start, px);
    b.jumping = false;
    b.arrive = true;
    const EN = s.n,
      EX = s.n + 1;
    if (r.next < 0) {
      b.tx = px;
      b.tp = pp;
      return;
    }
    if (r.next === EX) {
      const pad = PADS[s.k + 1];
      const tx = padX(pad, px, 1.2);
      if (r.jump) return this.planJump(m, tx, pad.p0 + 1.0, pad.y, cur, -1);
      b.tx = tx;
      b.tp = pad.p0 + (s.k === 2 ? 3 : 1.4);
      b.arrive = false;
      return;
    }
    if (r.next === EN) {
      const pad = PADS[s.k];
      b.tx = padX(pad, px, 1);
      b.tp = pad.p1 - 1;
      return;
    }
    const v = s.c0 + r.next;
    if (r.jump) {
      // (a gust called or blowing: one who braces doesn't leap; it holds its tile)
      if (b.brace && this.gustPh > 0) {
        b.tx = cur >= 0 ? this.cx[cur] : px;
        b.tp = cur >= 0 ? this.cpp[cur] : pp;
        return;
      }
      return this.planJump(m, this.cx[v], this.cpp[v], this.cy[v], cur, v);
    }
    if (this.know(b, v) !== SAFE) {
      // the frontier: a tile nobody has tried (or one it doesn't trust)
      const row = s.k * 16 + this.cr[v];
      if (b.frontier !== v) {
        b.frontier = v;
        b.wait = b.waitRow === row ? Math.min(b.wait, 0.25) : this.hesitate(m, v);
        b.waitRow = row;
      }
      const doomed = cur >= 0 && (this.st[cur] === WARN || this.st[cur] === SHAKE);
      if (b.wait > 0 && !doomed) {
        const off = m.p.human ? 0.34 : 0.45;
        if (cur >= 0) {
          b.tx = this.cx[cur] + clamp(this.cx[v] - this.cx[cur], -1, 1) * off;
          b.tp = this.cpp[cur] + clamp(this.cpp[v] - this.cpp[cur], -1, 1) * off;
        } else {
          const pad = PADS[s.k];
          b.tx = padX(pad, this.cx[v], 0.6);
          b.tp = pad.p1 - (m.p.human ? 0.75 : 0.45);
        }
        b.look = yawOf(this.cx[v] - px, -(this.cpp[v] - pp));
        this.greedy(m);
        return;
      }
      b.tx = this.cx[v];
      b.tp = this.cpp[v];
    } else {
      b.tx = this.cx[v];
      b.tp = this.cpp[v];
      if (r.next2 === EX || (r.next2 >= 0 && !r.j2 && this.know(b, s.c0 + r.next2) === SAFE)) b.arrive = false;
    }
    this.detour(m, s, cur, v);
    this.greedy(m);
  }

  /** Straight to the target unless that cuts across a hole (anyone sees that) or a tile it doesn't know (the careful ones): then via the middle of its own tile, or along the pad. */
  private detour(m: Mk, s: Seg, cur: number, v: number) {
    const b = m.ai!,
      a = m.a;
    const x0 = a.pos.x,
      p0 = -a.pos.z;
    // (off a pad onto a tile: from the pad's edge in front of it, like anyone would)
    if (cur < 0 && v >= 0 && Math.abs(x0 - this.cx[v]) > 0.9) {
      const pad = PADS[s.k];
      b.tx = padX(pad, this.cx[v], 0.6);
      b.tp = Math.min(p0, pad.p1 - 0.6);
      b.arrive = false;
      return;
    }
    const n = Math.max(4, Math.ceil(Math.hypot(b.tx - x0, b.tp - p0) / 0.22));
    for (let k = 1; k < n; k++) {
      const f = k / n;
      const x = lerp(x0, b.tx, f),
        p = lerp(p0, b.tp, f);
      const c = this.innerAt(x, p);
      if (this.support(x, p) === NONE || (c >= 0 && c !== cur && c !== v && b.sk > 0.4 && this.know(b, c) !== SAFE)) {
        if (cur >= 0) {
          b.tx = this.cx[cur];
          b.tp = this.cpp[cur];
        } else {
          const pad = PADS[s.k];
          b.tx = padX(pad, this.cx[v], 0.6);
          b.tp = pad.p1 - 0.5;
        }
        b.arrive = true;
        return;
      }
    }
  }

  /** A jump to (tx, tp): run at it and take off within reach (the jump carries a full run's speed). */
  private planJump(m: Mk, tx: number, tp: number, ty: number, cur: number, jc: number) {
    const b = m.ai!,
      a = m.a;
    b.jc = jc;
    // (a leap up a climb's rows flies shorter: it takes off nearer)
    b.jd = 3.85 + (ty !== m.fy ? flight(ty - m.fy) - flight(0) : 0) + (this.rnd() - 0.5) * (1 - b.sk) * 1.0 + (m.p.human ? SPEED * this.botLead : 0);
    b.jx = b.tx = tx;
    b.jp = b.tp = tp;
    b.arrive = true;
    // (too close for a jump to land there: back to the middle of its own tile first)
    if (Math.hypot(tx - a.pos.x, tp + a.pos.z) < 2.3 && cur >= 0) {
      b.tx = this.cx[cur];
      b.tp = this.cpp[cur];
      b.jumping = false;
      return;
    }
    b.jumping = true;
    b.lock = 1.0;
  }

  /** How long it waits before an unknown tile: by its nerve, longer when a rival beside it might try first, shorter when behind or late. */
  private hesitate(m: Mk, v: number) {
    const b = m.ai!,
      me = -m.a.pos.z;
    let w = lerp(1.15, 0.2, b.risk) * (0.55 + this.rnd() * 0.9);
    let lead = -1e9,
      mate = false;
    for (const o of this.pl) {
      if (o === m || o.fin >= 0) continue;
      const op = o.mode === RUN ? -o.a.pos.z : o.lastP;
      lead = Math.max(lead, op);
      if (o.mode === RUN && Math.abs(op - me) < 2.2 && Math.abs(o.a.pos.x - m.a.pos.x) < 5) mate = true;
    }
    if (mate) w *= 1.5;
    if (lead > me + 5) w *= 0.45;
    if (this.pl.some((o) => o.fin >= 0)) w *= 0.6;
    if (this.t > LIMIT - 18) w *= 0.5;
    // (the ruins: the lighthouse is about to shine there; a patient eye waits to see it)
    if (LV.lamp && this.rnd() < SEE_WAIT0 + SEE_WAIT1 * b.sk) {
      const eta = this.lampEta(v);
      if (eta >= 0) w = Math.max(w, eta + 0.2);
    }
    return w;
  }

  /** When the lighthouse will light tile c within the next 2.6 s (s; −1: not that soon). */
  private lampEta(c: number) {
    const x0 = this.spotX,
      p0 = this.spotP;
    let eta = -1;
    for (let k = 1; k <= 12 && eta < 0; k++) {
      this.spot(this.t + k * 0.22);
      if (Math.hypot(this.cx[c] - this.spotX, this.cpp[c] - this.spotP) < this.spotR * 0.55) eta = k * 0.22;
    }
    this.spotX = x0;
    this.spotP = p0;
    return eta;
  }

  /** Where the lighthouse's spot is at time tt (into spotX, spotP): along the field and back, across it as it goes. */
  private spot(tt: number) {
    const L = LV.lamp!;
    const u = (tt / L.along) % 1;
    const p = -2.5 + (u < 0.5 ? u * 2 : 2 - u * 2) * (END + 4);
    this.spotP = p;
    this.spotX = xAt(p) + Math.sin((tt / L.across) * Math.PI * 2) * Math.max(0, this.halfW(p) - 1.6);
  }

  /** A greedy shove: a rival within reach that would slide onto a tile nobody knows, into a hole, off the edge. */
  private greedy(m: Mk) {
    const b = m.ai!,
      a = m.a;
    if (m.cd > 0 || m.wind > 0 || m.lunge > 0 || !a.grounded || m.rooted) return;
    let best = 0,
      bx = 0,
      bz = 0,
      near = false;
    for (const o of this.pl) {
      if (o === m || o.mode !== RUN || o.fin >= 0 || o.guard > 0 || !o.a.grounded) continue;
      const dx = o.a.pos.x - a.pos.x,
        dz = o.a.pos.z - a.pos.z,
        d = Math.hypot(dx, dz);
      if (d > 1.45 || d < 0.05) continue;
      near = true;
      const ux = dx / d,
        uz = dz / d;
      let v = this.danger(b, o.a.pos.x + ux * 1.7, -(o.a.pos.z + uz * 1.7));
      if (v <= 0) continue;
      if (-o.a.pos.z > -a.pos.z - 0.5) v *= 1.25;
      // (a careful one won't lunge itself onto a tile it doesn't know)
      if (b.sk > 0.45 && this.danger(b, a.pos.x + ux * 1.6, -(a.pos.z + uz * 1.6)) > 0) v *= 0.3;
      if (v > best) ((best = v), (bx = ux), (bz = uz));
    }
    const go = best >= 2 ? b.aggro * (0.3 + 0.7 * b.sk) : best > 0 ? b.aggro * 0.12 : near ? b.aggro * 0.03 * (1 - b.sk) : 0;
    if (go && this.rnd() < go) {
      if (!best) {
        // (a weak one shoves for nothing: whoever is closest)
        for (const o of this.pl) {
          if (o === m || o.mode !== RUN) continue;
          const dx = o.a.pos.x - a.pos.x,
            dz = o.a.pos.z - a.pos.z,
            d = Math.hypot(dx, dz);
          if (d <= 1.45 && d > 0.05) ((bx = dx / d), (bz = dz / d));
        }
      }
      b.shove = true;
      b.sx = bx;
      b.sz = bz;
    }
  }

  /** The way across a stretch for this AI (Dijkstra over its tiles, the pad behind and the pad ahead; walks and jumps). */
  private route(b: Brain, s: Seg, start: number, px: number) {
    const n = s.n,
      N = n + 2,
      EN = n,
      EX = n + 1;
    const dist = this.dist,
      prev = this.prev,
      pj = this.pj,
      vis = this.vis;
    for (let k = 0; k < N; k++) ((dist[k] = Infinity), (prev[k] = -1), (pj[k] = 0), (vis[k] = 0));
    dist[start] = 0;
    const U = 2.4 + 3.4 * (1 - b.risk);
    for (;;) {
      let u = -1,
        best = Infinity;
      for (let k = 0; k < N; k++) if (!vis[k] && dist[k] < best) ((best = dist[k]), (u = k));
      if (u < 0 || u === EX) break;
      vis[u] = 1;
      const du = dist[u];
      if (u === EN) {
        for (let c = 0; c < s.cols; c++) {
          this.relax(b, s, u, c, du + 1 + Math.abs(this.cx[s.c0 + c] - px) * 0.22, 0, U);
          this.relax(b, s, u, s.cols + c, du + 3.6 + Math.abs(this.cx[s.c0 + s.cols + c] - px) * 0.22, 1, U);
        }
        continue;
      }
      const r = (u / s.cols) | 0,
        c = u % s.cols;
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++) {
          if (!dr && !dc) continue;
          const rr2 = r + dr,
            cc2 = c + dc;
          if (rr2 < 0 || rr2 >= s.rows || cc2 < 0 || cc2 >= s.cols) continue;
          const ar = Math.abs(dr),
            ac = Math.abs(dc);
          if (ar === 2 || ac === 2) {
            // jumps: two ahead (or back), straight or one aside; two aside in a row
            if ((ar === 2 && ac > 1) || (ac === 2 && ar > 0)) continue;
            this.relax(b, s, u, rr2 * s.cols + cc2, du + 3.4 + (dr < 0 ? 2 : 0), 1, U);
          } else {
            // (a diagonal step crosses the corner: it needs the two tiles beside it there, or it's a fall; without them, a hop from the middle)
            if (dr && dc && (this.st[s.c0 + r * s.cols + cc2] === GONE || this.st[s.c0 + rr2 * s.cols + c] === GONE)) {
              this.relax(b, s, u, rr2 * s.cols + cc2, du + 3.4 + (dr < 0 ? 2 : 0), 1, U);
              continue;
            }
            this.relax(b, s, u, rr2 * s.cols + cc2, du + (dr && dc ? 1.42 : 1) + (dr < 0 ? 0.8 : 0), 0, U);
          }
        }
      if (r === s.rows - 1 && du + 1 < dist[EX]) ((dist[EX] = du + 1), (prev[EX] = u), (pj[EX] = 0));
      if (r === s.rows - 2 && du + 3.6 < dist[EX]) ((dist[EX] = du + 3.6), (prev[EX] = u), (pj[EX] = 1));
      if (r === 0 && du + 1.8 < dist[EN]) ((dist[EN] = du + 1.8), (prev[EN] = u), (pj[EN] = 0));
    }
    const rt = this.rt;
    rt.next = rt.next2 = -1;
    rt.jump = rt.j2 = 0;
    if (!isFinite(dist[EX])) return rt;
    let v = EX,
      after = -1;
    while (prev[v] !== start) {
      if (prev[v] < 0) return rt;
      after = v;
      v = prev[v];
    }
    rt.next = v;
    rt.jump = pj[v];
    rt.next2 = after;
    rt.j2 = after >= 0 ? pj[after] : 0;
    return rt;
  }

  private relax(b: Brain, s: Seg, u: number, v: number, base: number, jump: number, U: number) {
    const c = s.c0 + v;
    const k = this.know(b, c);
    if (k === BLOCKED) return;
    let cost = base;
    if (k === UNKNOWN) cost += (U + b.noise[c] + (this.cc[c] === 0 || this.cc[c] === s.cols - 1 ? 0.35 : 0)) * (jump ? 2.1 : 1);
    else if (k === SUSPECT) cost += U * (3 + 10 * b.sk) * (jump ? 1.5 : 1);
    if (cost < this.dist[v]) ((this.dist[v] = cost), (this.prev[v] = u), (this.pj[v] = jump));
  }

  /** Its hands, every frame: run to its target, take off for a planned jump, hop a shove. */
  private steer(m: Mk, dt: number) {
    const b = m.ai!,
      a = m.a;
    b.mx = b.mz = 0;
    if (b.wait > 0) b.wait -= dt;
    if (b.lock > 0) b.lock -= dt;
    if (b.fired > 0) b.fired = a.grounded ? b.fired - dt : 0;
    if (m.mode !== RUN || m.knock > 0 || m.fin >= 0) return;
    if (b.dodge >= 0) {
      b.dodge -= dt;
      if (b.dodge < 0) ((b.jump = true), (b.hop = 0.45), (b.jumping = false));
    }
    if (b.hop > 0) {
      b.hop -= dt;
      if (b.hop <= 0) b.think = 0;
      return;
    }
    let tx = b.tx;
    // (waiting at an edge: it shifts its weight)
    if (b.wait > 0 && b.look === b.look) tx += Math.sin(this.t * 2.3 + m.i * 1.7) * 0.14;
    const dx = tx - a.pos.x,
      dp = b.tp + a.pos.z,
      d = Math.hypot(dx, dp);
    if (d > 0.07) {
      const f = (b.arrive ? Math.min(1, d / 0.75) : 1) * (0.8 + 0.2 * b.sk);
      b.mx = (dx / d) * f;
      b.mz = (-dp / d) * f;
    } else if (b.look === b.look && !m.p.human) a.face(b.look, dt, 6);
    // (a gust called: one who braces drops its run-up and thinks again)
    if (b.jumping && b.brace && this.gustPh > 0 && b.fired <= 0) ((b.jumping = false), (b.lock = 0), (b.think = 0));
    if (b.jumping && a.grounded) {
      const jd = Math.hypot(b.jx - a.pos.x, b.jp + a.pos.z);
      // (at its own tile's rim: off now, before the next step lands on a tile it doesn't trust, or on nothing)
      const ahead = 0.35 + (m.p.human ? SPEED * this.botLead : 0);
      const lx = a.pos.x + b.mx * ahead,
        lp = -(a.pos.z + b.mz * ahead);
      const lc = this.innerAt(lx, lp);
      const edge = this.support(lx, lp) === NONE || (lc >= 0 && lc !== b.jc && this.know(b, lc) !== SAFE);
      if (jd <= b.jd || edge) ((b.jump = true), (b.jumping = false), (b.fired = 0.08 + (m.p.human ? this.botLead : 0)));
    }
    // (nobody walks off into a hole it can see: it stops at the edge and thinks again)
    const look = 0.45 + (m.p.human ? SPEED * this.botLead : 0);
    if (a.grounded && !b.jumping && !b.jump && b.fired <= 0 && (b.mx || b.mz) && this.support(a.pos.x + b.mx * look, -(a.pos.z + b.mz * look)) === NONE) {
      b.mx = b.mz = 0;
      b.think = Math.min(b.think, 0.05);
    }
  }

  // ---- the camera, the news ----------------------------------------------------------------------

  /** The play camera: behind and above, on you (or the race once you're across), a glance at the leader ahead. */
  private camTarget(eye: THREE.Vector3, at: THREE.Vector3) {
    const h = this.human >= 0 ? this.pl[this.human] : null;
    let fp: number,
      fx = 0,
      fy = 0;
    if (h && h.fin < 0) {
      fp = Math.max(-2.5, -h.a.pos.z);
      fx = h.a.pos.x;
      if (h.mode === FALL || h.mode === NET) fy = Math.max(-3.5, (h.a.pos.y - yAt(fp)) * 0.3);
    } else {
      // (no one of yours on the field: the pack, between its front and its middle)
      let front = -1e9,
        sum = 0,
        sx = 0,
        n = 0;
      for (const m of this.pl) {
        if (m.fin >= 0 || m.mode !== RUN) continue;
        const p = -m.a.pos.z;
        front = Math.max(front, p);
        sum += p;
        sx += m.a.pos.x;
        n++;
      }
      if (n) {
        fp = (front + sum / n) / 2 - 1;
        fx = sx / n;
      } else {
        // (all of them in the air at once: where the one furthest along fell, not the finish)
        fp = END;
        let far = -1e9;
        for (const m of this.pl) if (m.fin < 0 && m.lastP > far) ((far = m.lastP), (fp = m.lastP - 1), (fx = m.a.pos.x));
      }
    }
    let lead = fp;
    for (const m of this.pl) if (m !== h && m.fin < 0 && m.mode === RUN) lead = Math.max(lead, -m.a.pos.z);
    fp += Math.min(3.5, (lead - fp) * 0.3);
    fp = clamp(fp, -1.5, END + 2);
    const mx = xAt(fp),
      base = yAt(fp);
    const x = mx + clamp(fx - mx, -9, 9) * 0.5;
    eye.set(x, base + 12.5 + fy * 0.3, -(fp - 10));
    at.set(x, base + fy, -(fp + 2.6));
  }

  private say(s: string, c: string, dur = 1.2) {
    if (this.news.length > 2) this.news.splice(1, 1);
    this.news.push({ s, c, life: 0, dur });
  }

  private pop(s: string, x: number, y: number, z: number, c: string, max: number, size: number) {
    if (this.pops.length > 14) this.pops.shift();
    this.pops.push({ s, c, x, y, z, life: 0, max, size });
  }

  /** How loud something there is for you (0…1): near you, or on screen. */
  private loud(at: THREE.Vector3) {
    const h = this.human >= 0 ? this.pl[this.human] : null;
    const ref = h && h.fin < 0 ? h.a.pos : this.cam.at;
    const d = Math.hypot(at.x - ref.x, at.z - ref.z);
    return clamp(1.15 - d / 14, 0.15, 1);
  }

  private startHum() {
    const s = sound();
    if (!s || this.hum) return;
    const { ac, bus } = s;
    const t = ac.currentTime;
    const g = ac.createGain();
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 520;
    const o1 = ac.createOscillator(),
      o2 = ac.createOscillator();
    o1.type = o2.type = "sawtooth";
    o1.frequency.value = 55;
    o2.frequency.value = 82.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.4);
    o1.connect(f);
    o2.connect(f);
    f.connect(g).connect(bus);
    o1.start(t);
    o2.start(t);
    this.hum = {
      stop: () => {
        const n = ac.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n);
        g.gain.exponentialRampToValueAtTime(0.0001, n + 0.3);
        o1.stop(n + 0.35);
        o2.stop(n + 0.35);
      },
    };
  }

  private stopHum() {
    this.hum?.stop();
    this.hum = null;
  }

  // ---- drawing -----------------------------------------------------------------------------------

  /** Each snark's pose: the tumble of a fall, the lean of a shove, the wobble on a forgery; its arrow. */
  private pose(m: Mk, dt: number) {
    const a = m.a,
      tb = m.tumble;
    if (m.mode === FALL || m.mode === NET) {
      tb.rotation.x += m.spin * dt * (m.mode === NET ? 0.35 : 1);
      tb.rotation.z = Math.sin(this.t * 9 + m.i) * 0.3;
    } else if (m.mode === LIFT) {
      tb.rotation.x = -clamp(m.modeT / LIFT_T, 0, 1) * Math.PI * 2;
      tb.rotation.z = 0;
    } else {
      const lean = m.wind > 0 ? -0.35 : m.lunge > 0 ? 0.45 : 0;
      tb.rotation.x += (lean - tb.rotation.x) * Math.min(1, 14 * dt);
      tb.rotation.z = m.knock > 0 || m.rooted ? Math.sin(this.t * 34 + m.i) * 0.3 : tb.rotation.z * Math.exp(-10 * dt);
    }
    a.angry = m.rooted || m.knock > 0 || m.mode === FALL;
    const on = m.wind > 0 || m.lunge > 0;
    m.arrow.visible = on;
    if (on) {
      m.arrow.position.set(a.pos.x, a.pos.y + 0.06, a.pos.z);
      m.arrow.rotation.y = yawOf(m.aimX, m.aimZ);
      m.arrow.scale.setScalar(m.wind > 0 ? 1 - (m.wind / WIND) * 0.45 : 1.1);
    }
    a.legs = m.rooted ? 1.4 : null;
    a.sync(dt);
  }

  view() {
    return this.w;
  }

  draw(g: CanvasRenderingContext2D) {
    const cam = this.w.camera;
    // the pop-ups over the field
    for (const q of this.pops) {
      const k = q.life / q.max;
      const s = toScreen(this.v1.set(q.x, q.y + k * 1.1, q.z), cam);
      if (!s.on) continue;
      g.globalAlpha = clamp(1 - k * k, 0, 1);
      shout(g, q.s, s.x, s.y, q.size * (1 + Math.max(0, 0.25 - k) * 1.2), q.c);
    }
    g.globalAlpha = 1;
    for (const m of this.pl) {
      if (m.a.pos.y < -7 && m.mode !== LIFT) continue;
      const s = toScreen(m.a.head(this.v1), cam);
      if (s.on) tag(g, m.p, s.x, s.y - 4);
    }
    const ord0 = this.over ?? this.order();
    const vals = this.pl.map((m) => (m.fin >= 0 ? ord(m.place).toUpperCase() : `${Math.round(clamp(m.best / END, 0, 0.99) * 100)}%`));
    const sub = this.pl.map((m) => (m.fin >= 0 ? T("ACROSS ✓", "已过关 ✓") : m.mode !== RUN ? T("FALLING…", "坠落中…") : SEG_NAME[Math.min(2, m.pad)]));
    corners(g, this.players, vals, { sub, lead: this.pl[ord0[0]].best > 0.5 ? [ord0[0]] : [] });
    clock(g, LIMIT - this.t);
    this.drawTrack(g);
    // EXPOSURE's countdown, then the beam
    const qt = QDAY - this.t;
    if (qt > 0 && qt <= 10) {
      const pulse = 0.75 + Math.sin(this.t * 8) * 0.25;
      g.globalAlpha = pulse;
      shout(g, `${T("EXPOSURE IN", "距曝光")} ${Math.ceil(qt)}`, W / 2, 101, 15, "#ffa23a");
      g.globalAlpha = 1;
    } else if (this.beamOn) shout(g, T("TRACKER BEAM: TRANSPARENT TILES BREAK!", "追踪光束：透明方块会碎！"), W / 2, 101, 14, "#ff7ae6");
    // the ruins: what the light does; the spire: the gust, called and blowing
    if (LV.lamp && this.t < 9 && this.human >= 0) {
      g.globalAlpha = clamp((9 - this.t) / 0.8, 0, 1);
      shout(g, T("IN THE LIGHT, FORGERIES SHOW RED", "灯光下，伪造的方块显出红色"), W / 2, 101, 14, "#ffd58a");
      g.globalAlpha = 1;
    }
    if (LV.gust && this.gustPh) {
      const ar = this.gustDir > 0 ? "▶ ▶ ▶" : "◀ ◀ ◀";
      const blow = this.gustPh === 2;
      g.globalAlpha = blow ? 1 : 0.6 + 0.4 * Math.sin(this.t * 14);
      shout(g, blow ? `${ar}  ${T("GUST!", "阵风！")}  ${ar}` : `${ar}  ${T("GUST COMING", "阵风要来了")}  ${ar}`, W / 2, 101, blow ? 18 : 15, blow ? "#ffffff" : "#ffd23f");
      g.globalAlpha = 1;
    }
    // the goal, for the first seconds
    if (this.t < 5 && this.human >= 0) {
      g.globalAlpha = clamp((5 - this.t) / 0.8, 0, 1) * clamp(this.t / 0.4, 0, 1);
      shout(g, T("CROSS TO THE FINISH · FORGERIES SHATTER!", "冲向终点 · 伪造的方块会碎！"), W / 2, H - 42, 17, "#ffffff");
      g.globalAlpha = 1;
    }
    const n = this.news[0];
    if (n) banner(g, n.s, n.life / n.dur, n.c);
  }

  /** The race along the course: the three stretches, the checkpoints, the four (you on top). */
  private drawTrack(g: CanvasRenderingContext2D) {
    const x0 = W / 2 - 150,
      x1 = W / 2 + 150,
      y = 76;
    const X = (p: number) => x0 + clamp(p / END, 0, 1) * (x1 - x0);
    g.save();
    rr(g, x0 - 12, y - 10, x1 - x0 + 24, 20, 10);
    g.fillStyle = "rgba(10,6,30,0.55)";
    g.fill();
    for (const s of SEGS) {
      g.fillStyle = SEG_TOP[s.k];
      g.fillRect(X(s.p0), y - 3, X(s.p1) - X(s.p0), 6);
    }
    for (let k = 1; k < 3; k++) {
      g.fillStyle = "#3fd0a8";
      g.fillRect(X(PADS[k].p0) - 1, y - 6, X(PADS[k].p1) - X(PADS[k].p0) + 2, 12);
    }
    // the finish: a little chequer
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? "#ffffff" : "#1a1033";
        g.fillRect(x1 + 2 + j * 4, y - 8 + i * 4, 4, 4);
      }
    const ids = [0, 1, 2, 3].filter((i) => i !== this.human);
    if (this.human >= 0) ids.push(this.human);
    for (const i of ids) {
      const m = this.pl[i];
      const p = m.fin >= 0 ? END : m.mode === RUN ? -m.a.pos.z : m.lastP;
      const r = m.p.human ? 7.5 : 5.5;
      g.globalAlpha = m.mode === RUN || m.mode === DONE ? 1 : 0.5;
      g.beginPath();
      g.arc(X(p), y + (m.mode === RUN || m.mode === DONE ? 0 : 5), r, 0, Math.PI * 2);
      g.fillStyle = m.p.color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = m.p.human ? "#ffffff" : "#1a1033";
      g.stroke();
      if (m.p.human) text(g, "▼", X(p), y - 15, 10, "#ffffff");
    }
    g.restore();
  }

  result() {
    return this.over;
  }

  humanOut() {
    return !this.over && this.human >= 0 && this.pl[this.human].fin >= 0;
  }

  dispose() {
    this.stopHum();
    for (const m of this.pl) m.a.dispose();
    disposeScene(this.w.scene);
    if (LAB) (window as unknown as { forge?: unknown }).forge = undefined;
  }
}

/** A spot on a pad, `m` in from its sides. */
function padX(pad: Pad, x: number, m: number) {
  return clamp(x, pad.ox - pad.w / 2 + m, pad.ox + pad.w / 2 - m);
}

/** How far a running jump flies (m) to land `dh` higher (a climb's rows; it lands on the way down). */
function flight(dh: number) {
  return (SPEED * (JUMP_V + Math.sqrt(Math.max(0, JUMP_V * JUMP_V - 2 * G * dh)))) / G;
}

/** The shove's floor arrow (pointing +z from the feet). */
function arrowGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.18, 0.35);
  s.lineTo(0.18, 0.35);
  s.lineTo(0.18, 1.15);
  s.lineTo(0.55, 1.15);
  s.lineTo(0, 1.85);
  s.lineTo(-0.55, 1.15);
  s.lineTo(-0.18, 1.15);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.PI);
  return g;
}

export const FORGE: MiniDef = {
  key: "forge",
  title: "FORGERY GAP",
  titleZh: "伪造深渊",
  tag: "Valid proofs hold. Counterfeit notes shatter.",
  tagZh: "有效证明稳如磐石，伪钞一踩就碎",
  help: "Cross the proven tiles: counterfeit notes shatter, broken ones stay holes, safe ones glow. A sloppy forgery flickers. A jumps, B shoves a rival onto a tile to test it. First across wins!",
  helpZh: "穿过证明方块：伪钞一踩就碎，碎了留下洞，踩过的安全方块会发光。粗糙的伪造品会闪烁。A 跳，B 把对手推上方块替你试。第一个过关的获胜！",
  pad: ["left", "right", "up", "down", "a", "b"],
  tap: false,
  color: "#ff4fd8",
  song: "tense",
  ambience: "city-day",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `forge-${l.key}`, song: l.song, ambience: l.ambience })),
  make: (players, rnd, variant) => {
    // (one of the levels: the one asked for, or one drawn by the seed; the layout is set before the game is built)
    useLevel(LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]);
    return new Forge(players, rnd);
  },
};
export default FORGE;
