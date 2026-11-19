/**
 * PROOF OF DIG: a race down to the GENESIS block, 40 m under the grass, through a chunk of earth cut
 * away and floating over ZStreet. Four miners, four lanes two blocks wide, side by side, walled off
 * by brick nothing breaks: a cut-away mine where everyone sees everyone.
 *
 * ←→↓ swing the pick that way (hold to keep swinging, or tap fast to swing quicker). The deeper,
 * the harder: topsoil goes in one hit, clay three, stone four, amethyst five, magma six, granite
 * seven; sand veins and cracked rock go in one, and steel BEDROCK only gives to TNT, so each steel
 * slab is a choice of its gap. The golden NONCE blocks hold an item (the further behind, the
 * better): TNT, which A lobs the way you face into the first open cell up to three over (over the
 * wall, down the shaft of whoever is ahead of you next door) or plants under you when there is
 * none, blowing the two rows below; or a HASH RUSH, the next four blocks in one hit each. Some
 * nonces sit in the walls, dug at from both sides: whoever breaks it gets it.
 * The two middle lanes meet in the CAVE (a free drop, stalactites, a nonce on its floor), the outer
 * ones get a crumbly chute: bump a rival there to bonk them (and take a TNT), drop on one to stomp.
 * Every hazard warns first, and every cell about to be hit glows red: boulders wobble when their
 * floor goes, lava oozes out of a broken pocket, stalactites shake, and from 24 s the QUAKE shakes
 * rocks loose over the leaders. The first onto the GENESIS block wins; the others get a LAST CALL
 * of 4 s, then rank by depth (at the 60 s cap, everyone does).
 *
 * Three levels (dig-levels/): MEADOW MINE (the above, over ZStreet on a sunny day); ICE CAVE (a
 * winter night under Central Park in the snow: no steel, three open galleries on slick ice joining the two lanes of
 * each half, where a step glides on until something stops it and a glide into a rival SLAMS it
 * on, snow lids over short free drops, holes that freeze over, icicles, meltwater that freezes you); SUNKEN REEF (sunset off Marina Bay: two wide
 * trenches split by brain coral, and from 12 s the TIDE rises from GENESIS: under it your air runs
 * down, AIR pockets fill it, and out of air you gasp, dazed).
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { H, HUD, W, between, clamp, ease, fpx, grow, lerp, overPad, rng, rr, sfx, shout, sound, text, token, type Btn, type Input, type IntroShot, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { music } from "../music";
import { padBtn, touchy } from "../hud";
import { actsOf } from "../acts";
import { Avatar, CamRig, Fx3, GEO, banner, block, canvasTex, clock, coin, corners, disposeScene, glow, label, outline, qBlock, qTex, short, tag, toScreen, toon, toonSteps, world } from "../k3";
import { AIR, BACK, BEDROCK, BOULDER, COLS, CRUMB, EDGE, EMPTY, FRONT, GRANITE, GRASS, HALF, HC, HOT, ICE, LAVA, MAGMA, N, OBSID, QB, RIM, ROWS, SAND, SNOW, WALL, colX, footY, midY, type Box, type DigLevel, type GenKit, type Layer, type SceneKit, type TickKit } from "./dig-levels/common";
import { MEADOW } from "./dig-levels/meadow";
import { ICE_CAVE } from "./dig-levels/ice";
import { REEF } from "./dig-levels/reef";
import { bobbers, halos } from "./dig-levels/props";

// ---- the ground ------------------------------------------------------------------------------------

/** The planner's nodes: every cell, and the grass row over them (r = −1). */
const NN = COLS * (ROWS + 1);
const CAP = 60;
const GRACE = 4;
const QUAKE_T = 24;
/** The snarks at this size fit a 1 m cell. */
const S = 0.6;
const G = 40;
const GF = 30;
/** A swing every HOLD seconds while held; a fresh tap may come after MASH. */
const HOLD = 0.23;
const MASH = 0.16;
const MOVE_T = 0.14;
const CLIMB_T = 0.22;
/** A glide on the ice: this much longer for each cell past the first. */
const GLIDE_T = 0.075;
/** A hole dug in a gallery's ice floor freezes over this long after. */
const REFREEZE = 1.4;
/** The warnings: a boulder wobbles, lava oozes, a stalactite shakes, a quake rock loosens. */
const WOB = 0.65;
const OOZE = 1.0;
/** Lava spilling into an opened cell beside it (it cools there to obsidian, burning whoever stayed). */
const SPILL = 1.6;
const STAL_T = 0.75;
const LOOSE = 1.1;
/** A HASH RUSH: this many blocks in one hit each. */
const RUSH_N = 4;
const FUSE = 1.3;
/** Under the tide: seconds of air, the gasp when it runs out (and the air it leaves), a pocket's breath. */
const AIR_MAX = 6.5;
const GASP = 1.3;
const GASP_AIR = 2.6;
const FOV = 40;
const VIS = 2 * Math.tan((FOV / 2) * (Math.PI / 180));
/** The view: the whole width with room each side for the corner panels; ~11 rows tall. */
const DIST = 19.6 / (VIS * (W / H));
const HALF_H = (VIS * DIST) / 2;
const INF = 1e9;

/** Hits to break each (0: it does not break). */
const HP = [0, 1, 1, 1, 3, 4, 5, 6, 7, 4, 1, 1, 2, 5, 0, 0, 0, 2, 1, 1];
/** Which cell mesh draws it (−1: none; boulders and lava draw themselves). */
const MESH = [-1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 4, -1, 5, -1, 6, 7, 0, 8];
const plain = (t: number) => t >= GRASS && t <= MAGMA;
/** Which cell meshes take a colour per block (the rest show their texture as it is). */
const TINTED = [true, true, true, true, false, false, true, true, false];

/** The levels, in the hall's order. */
export const DIG_LEVELS: DigLevel[] = [MEADOW, ICE_CAVE, REEF];
const GOLD = "#ffcf2e";
const SANDC = new THREE.Color("#ffe6a0");
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
/** The faces (scene/ape/face.ts EXPR). */
const FACE = { happy: 2, surprised: 3, angry: 4, hurt: 7 };
const DIRB: Btn[] = ["left", "left", "right", "down"];
/** A kept tap (Miner.buf) that is the A button, not an arrow. */
const BUF_A = 4;
/** The particles made every few frames (their colours and moves, made once). */
const SANDS = ["#f2dca0", "#cdb27a"];
const FLAME = { speed: 1, up: 2.5, gravity: -2, size: 0.09, life: 0.35 };
const TRICKLE = { speed: 0.3, up: 0, gravity: 9, size: 0.06, life: 1.0 };
const EMBERS = { speed: 0.5, up: 1.5, gravity: -1, size: 0.07, life: 0.8 };
const RUSH_FIRE = ["#ff7a1a", "#ffd23f"];
const GLINT = ["#ffffff", "#fff4a0"];
const GOLD_UP = { speed: 0.2, up: 1.2, gravity: -0.6, size: 0.08, life: 1.4 };
const TWINKLE = { speed: 0.1, up: 0.2, gravity: 0, size: 0.09, life: 0.45 };
const ICE_SPRAY = ["#ffffff", "#cdeeff"];
const SPRAY = { speed: 1.4, up: 1.2, gravity: 6, size: 0.07, life: 0.35 };
const FROST = { speed: 0.4, up: 0.3, gravity: -0.5, size: 0.06, life: 0.5 };
const BUBBLES = ["#e6fbff", "#a8e8ff"];
const BUBBLE = { speed: 0.3, up: 1.2, gravity: -4, size: 0.08, life: 1.1, drag: 1 };

// the things that fall
const F_BOULDER = 0,
  F_LAVA = 1,
  F_TNT = 2,
  F_ROCK = 3,
  F_STAL = 4;
const VMAX = [14, 8, 9, 14, 14];

// ---- sound -----------------------------------------------------------------------------------------

let noiseBuf: AudioBuffer | null = null;
function hiss(dur: number, vol: number, freq: number, type: BiquadFilterType) {
  const s = sound();
  if (!s) return;
  const ac = s.ac;
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(s.bus);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.05);
}
function beep(f0: number, f1: number, dur: number, vol: number, type: OscillatorType = "square") {
  const s = sound();
  if (!s) return;
  const t = s.ac.currentTime;
  const o = s.ac.createOscillator();
  const g = s.ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(s.bus);
  o.start(t);
  o.stop(t + dur + 0.03);
}
const SND = {
  chunk: (hard: number) => (hiss(0.07, 0.3, 700 + hard * 260, "bandpass"), beep(170 - hard * 12, 80, 0.07, 0.2, "triangle")),
  crumble: () => (hiss(0.22, 0.4, 420, "lowpass"), beep(120, 50, 0.16, 0.28, "sine")),
  clank: () => (beep(1480, 1150, 0.17, 0.11), beep(2230, 1740, 0.17, 0.09)),
  boom: (v = 1) => (hiss(0.8, 0.9 * v, 380, "lowpass"), beep(95, 36, 0.55, 0.75 * v, "sine"), hiss(0.25, 0.35 * v, 2400, "highpass")),
  rumble: () => (hiss(1.4, 0.55, 140, "lowpass"), beep(55, 40, 1.2, 0.35, "sine")),
  sizzle: () => hiss(0.45, 0.3, 3200, "highpass"),
  yelp: () => beep(880, 260, 0.42, 0.16, "sawtooth"),
  fuse: () => hiss(0.035, 0.09, 5200, "highpass"),
  bonk: () => (beep(620, 300, 0.09, 0.3), hiss(0.06, 0.22, 1800, "bandpass")),
};

// ---- the players' minds ------------------------------------------------------------------------------

interface Brain {
  /** Seconds between swings. */
  rate: number;
  /** A pause between decisions. */
  think: number;
  /** How long a danger takes to be seen, and the chance it is dodged at all. */
  react: number;
  dodge: number;
  /** How wrong its sense of the rock is (0: it reads every block right). */
  noise: number;
  /** Seconds it would give up for a NONCE. */
  greed: number;
  /** How keen on bonks and bombs. */
  aggro: number;
  /** A wasted swing, a wander. */
  wrong: number;
  lapse: number;
}
const brainOf = (s: number, k: number): Brain => ({
  rate: lerp(0.35, 0.165, s),
  think: lerp(0.16, 0.04, s),
  react: lerp(0.8, 0.25, s),
  dodge: lerp(0.3, 0.9, s),
  noise: lerp(0.9, 0.08, s),
  greed: lerp(0.3, 1.5, s) * k,
  aggro: lerp(0.2, 0.75, s),
  wrong: lerp(0.035, 0.002, s),
  lapse: lerp(0.03, 0.003, s),
});
/** The bench's scripted visitor: a decent player's hands (held keys, some fast taps) and eyes. */
const HUMANLIKE: Brain = { rate: 0.24, think: 0.12, react: 0.5, dodge: 0.75, noise: 0.4, greed: 1.0, aggro: 0.6, wrong: 0.015, lapse: 0.015 };

interface Miner {
  i: number;
  p: Player;
  a: Avatar;
  brain: Brain;
  /** Its cell (r = −1: on the grass) and where its feet are. */
  c: number;
  r: number;
  x: number;
  y: number;
  vy: number;
  grounded: boolean;
  /** A step to the side (or a climb) under way, 0 → 1. */
  mv: number;
  mvT: number;
  mx0: number;
  mx1: number;
  my0: number;
  my1: number;
  climb: boolean;
  /** Which way it swings: a side (−1, 1), or down. */
  face: number;
  down: boolean;
  /** Since its last swing (s). */
  since: number;
  /** The way it means to dig (for the wind-up). */
  want: number;
  wantT: number;
  stun: number;
  immune: number;
  spin: number;
  angryT: number;
  tnt: number;
  rush: number;
  tntT: number;
  done: boolean;
  reachT: number;
  /** A tap that came too early, kept for a moment. */
  buf: number;
  bufT: number;
  /** Gliding on the ice that way (0: not). */
  glide: number;
  /** Seconds of air left (under the tide); whether it was warned; its bubbles. */
  air: number;
  airWarn: boolean;
  bubT: number;
  /** Under the water now. */
  wet: boolean;
  // the AI
  think: number;
  notice: number;
  dodgeOk: boolean;
  noise: Float32Array;
  noiseT: number;
  plan: { key: number; t: number; dir: number; hard: boolean; hunt: boolean };
  // the look
  swing: number;
  armX: number;
  lean: number;
  cheerT: number;
  expr: number;
  exprT: number;
  pop: string;
  popC: string;
  popBig: boolean;
  popT: number;
  hitId: number;
  jolt: number;
  pick: THREE.Mesh;
  flameT: number;
}

interface Faller {
  kind: number;
  c: number;
  x: number;
  y: number;
  vy: number;
  /** Shaking in place before it drops (s). */
  wait: number;
  fuse: number;
  owner: number;
  /** TNT planted in the floor: it stays, and blasts the row under `row`. */
  planted: boolean;
  row: number;
  /** A throw in the air (0 → 1), from (fx0, fy0) over to its column at `row`. */
  fly: number;
  fx0: number;
  fy0: number;
  dead: boolean;
  mesh: THREE.Group | null;
  rot: number;
}

class Dig implements Mini {
  private w: ReturnType<typeof world>;
  private cam: CamRig;
  private fx: Fx3;
  private ms: Miner[];
  private human: number;
  /** Each seat's start column (shuffled). */
  private lane: number[];
  private t = 0;
  private over: number[] | null = null;
  private winner = -1;
  private endAt = 0;
  private finished: number[] = [];
  // the grid: the block in each cell, the hits in it, a boulder's wobble (or lava's), a push's slide
  private g = new Uint8Array(N);
  private dmg = new Float32Array(N);
  private wob = new Float32Array(N);
  private slide = new Float32Array(N);
  private ver = 0;
  /** Gallery ice dug through, freezing over (when). */
  private thaw: number[] = [];
  private thawT = new Float32Array(N);
  private frostT = 0;
  private shown = new Int8Array(N).fill(-1);
  private meshes: THREE.InstancedMesh[] = [];
  private ink!: THREE.InstancedMesh;
  private bould!: THREE.InstancedMesh;
  private bouldInk!: THREE.InstancedMesh;
  private lava!: THREE.InstancedMesh;
  private lavaTex!: THREE.Texture;
  private hotMat!: THREE.MeshToonMaterial;
  private stalMesh!: THREE.InstancedMesh;
  private warn!: THREE.InstancedMesh;
  private warnMat!: THREE.MeshBasicMaterial;
  private cracks: THREE.Mesh[] = [];
  private crackTex: THREE.Texture[] = [];
  private tnts: THREE.Group[] = [];
  private pickGeo = new THREE.OctahedronGeometry(0.5, 0);
  private rockGeo = new THREE.IcosahedronGeometry(0.5, 0);
  private fallers: Faller[] = [];
  private stal: { c: number; r: number; bot: number; on: boolean; shake: number }[] = [];
  private qbs: THREE.Mesh[] = [];
  private prize!: THREE.Group;
  // the dangers: when each cell gets hit (s), by a falling thing or by a TNT (and whose)
  private dz = new Float32Array(N);
  private dzT = new Float32Array(N);
  private dzO = new Int8Array(N);
  private dropT = 0;
  // the planner
  private dist = new Float32Array(NN);
  private fdir = new Uint8Array(NN);
  private hN = new Int32Array(NN * 6);
  private hK = new Float32Array(NN * 6);
  private hn = 0;
  private rowBest = new Float32Array(ROWS + 1);
  private intent = { dir: 0, a: false, face: 0 };
  // the show
  private bans: { s: string; c: string; at: number }[] = [];
  private ban: { s: string; c: string; t: number } | null = null;
  private said = new Set<string>();
  private layerSaid = 1;
  /** The lane walls (by column), the level's layers. */
  private wallC = new Uint8Array(COLS);
  /** Wall cells that leave no brick behind when broken (a cave's, a gallery's, a well's). */
  private openC = new Uint8Array(N);
  private layers: Layer[];
  /** The rising tide: the row its surface is at (ROWS + 1: not in yet), and its look. */
  private tideRow = ROWS + 1;
  private tideMesh: THREE.Mesh | null = null;
  private foam: THREE.Mesh | null = null;
  private caust: THREE.Mesh | null = null;
  private caustTex: THREE.Texture | null = null;
  private iceMat: THREE.MeshToonMaterial | null = null;
  private spin: THREE.Object3D[] = [];
  private sparks: string[];
  private tk: TickKit;
  private lvTick: ((t: TickKit) => void) | null = null;
  /** The islets' bobbing, the lanterns' halos. */
  private bob: ((now: number) => void) | null = null;
  private glows: ((now: number) => void) | null = null;
  private quakeAt = QUAKE_T;
  private sped = false;
  private lastDir = 0;
  private trickle = 0;
  private fuseT = 0;
  private now = 0;
  /** What happened (the bench reads it). */
  readonly stats = { tnt: 0, plant: 0, blastHits: 0, direct: 0, bonk: 0, stomp: 0, boulder: 0, lava: 0, stal: 0, quake: 0, nonce: 0, rush: 0, steal: 0, push: 0, glide: 0, tackle: 0, refreeze: 0, air: 0, gasp: 0 };
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private sc = new THREE.Vector3();
  private col = new THREE.Color();
  private col2 = new THREE.Color();
  private eye = new THREE.Vector3();
  private at3 = new THREE.Vector3();

  constructor(
    private players: Player[],
    private rnd: Rnd,
    readonly lv: DigLevel,
  ) {
    this.w = world({ sky: lv.sky, fog: lv.fog, fov: FOV, night: lv.night });
    if (lv.hemi) (this.w.hemi.color.set(lv.hemi[0]), this.w.hemi.groundColor.set(lv.hemi[1]), (this.w.hemi.intensity = lv.hemi[2]));
    if (lv.sun) (this.w.sun.color.set(lv.sun[0]), (this.w.sun.intensity = lv.sun[1]));
    // (the cut face is a wall seen from the front: the sun stands in front of it, a little up and to the
    // left, so a dug cell is a lit niche with the shade of the block over it along its top and each miner's
    // shadow on its back; from overhead every hole would be black, its miner with it)
    this.w.sun.position.set(-18, 28, 45);
    if (lv.shade !== undefined) this.w.scene.userData.shadowK = lv.shade;
    // (a soft fill from the other side, in the level's tint: the blocks' right sides read, the face rounder)
    if (lv.fill) {
      const fl = new THREE.DirectionalLight(lv.fill[0], lv.fill[1]);
      fl.position.set(34, 6, 22);
      this.w.scene.add(fl);
    }
    this.layers = lv.layers;
    this.sparks = lv.pool.sparks;
    for (const c of lv.walls) this.wallC[c] = 1;
    const s = this.w.scene;
    this.human = players.findIndex((p) => p.human);
    const cols = [1, 4, 6, 9];
    for (let i = cols.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const x = cols[i];
      cols[i] = cols[j];
      cols[j] = x;
    }
    this.lane = cols;
    this.gen();
    this.build();
    for (let id = 0; id < N; id++) this.paint(id);
    this.ms = players.map((p, i) => this.miner(p, i));
    this.fx = new Fx3(s, 1100);
    this.tk = {
      dt: 0,
      now: 0,
      camY: 0,
      tideY: -1e9,
      burst: (x, y, z, n, colors, o) => this.fx.burst(this.v.set(x, y, z), n, colors, o),
    };
    this.cam = new CamRig(this.w.camera);
    this.cam.set(this.v.set(3, -32, 24), this.v2.set(0, -34, 0));
    // (the bench's scripted player: /partylab.html?g=dig&digbot)
    if (typeof location !== "undefined" && location.search.includes("digbot")) (window as unknown as { __dig: unknown }).__dig = this;
  }

  private miner(p: Player, i: number): Miner {
    const a = new Avatar(this.w.scene, p, { scale: S });
    const c = this.lane[i];
    a.pos.set(colX(c), 0, 0);
    a.yaw = 0;
    a.sync(0);
    // the pickaxe in the right fist: the handle down the forearm, a double-pointed head across its end
    const pk = new THREE.Group();
    block("#9b6b3d", 0.08, 0.84, 0.08, 0, -0.33, 0, pk);
    block(p.color, 0.11, 0.2, 0.11, 0, 0.02, 0, pk);
    const head = new THREE.Mesh(this.pickGeo, toon("#d9e1ec"));
    head.scale.set(0.17, 0.2, 0.92);
    head.position.set(0, -0.76, 0);
    outline(head, 0.03);
    pk.add(head);
    a.body.handR.add(pk);
    a.body.holdArms(true);
    const brain = brainOf(p.skill, 0.6 + this.rnd() * 0.9);
    return {
      i,
      p,
      a,
      brain,
      c,
      r: -1,
      x: colX(c),
      y: 0,
      vy: 0,
      grounded: true,
      mv: 1,
      mvT: MOVE_T,
      mx0: 0,
      mx1: 0,
      my0: 0,
      my1: 0,
      climb: false,
      face: c < COLS / 2 ? 1 : -1,
      down: true,
      since: 9,
      want: 0,
      wantT: 0,
      stun: 0,
      immune: 0,
      spin: 0,
      angryT: 0,
      tnt: 0,
      rush: 0,
      tntT: 0,
      done: false,
      reachT: 0,
      buf: 0,
      bufT: 0,
      glide: 0,
      air: AIR_MAX,
      airWarn: false,
      bubT: 0,
      wet: false,
      think: 0.15 + this.rnd() * 0.25,
      notice: -1,
      dodgeOk: false,
      noise: new Float32Array(N),
      noiseT: 0,
      plan: { key: -1, t: 0, dir: 0, hard: false, hunt: false },
      swing: 9,
      armX: -0.6,
      lean: 0,
      cheerT: 0,
      expr: 0,
      exprT: 0,
      pop: "",
      popC: "#fff",
      popBig: false,
      popT: 9,
      hitId: -1,
      jolt: 0,
      pick: head,
      flameT: 0,
    };
  }

  // ---- the level ---------------------------------------------------------------------------------

  private isWall(c: number) {
    return c >= 0 && c < COLS && this.wallC[c] === 1;
  }
  private layerOf(r: number) {
    const L = this.layers;
    for (let i = 0; i < L.length; i++) if (r < L[i].to) return i;
    return L.length - 1;
  }

  /**
   * The level lays out the left half (its lanes A = columns 0, 1 and B = 3, 4, its walls), over
   * each layer's own rock; the grass goes on top, and the right half is its mirror (each seat's lane
   * is shuffled, so nobody owns the better one).
   */
  private gen() {
    const R = this.rnd;
    const g = this.g;
    const ok = (c: number, r: number) => c >= 0 && c < HC && r >= 0 && r < ROWS;
    const get = (c: number, r: number) => (ok(c, r) ? g[c + r * COLS] : BEDROCK);
    const set = (c: number, r: number, t: number) => {
      if (ok(c, r)) g[c + r * COLS] = t;
    };
    const soft = (c: number, r: number, t: number) => {
      if (plain(get(c, r))) set(c, r, t);
    };
    const pick = <X,>(a: X[]) => a[Math.floor(R() * a.length)];
    const any = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < HC; c++) set(c, r, this.isWall(c) ? WALL : this.layers[this.layerOf(r)].mat);
    const kit: GenKit = {
      R,
      set,
      get,
      soft,
      pick,
      any,
      vein: (c, a, b) => {
        for (let r = a; r <= b; r++) soft(c, r, SAND);
      },
      boulder: (c, r) => set(c, r, BOULDER),
      nonce: (c, r) => set(c, r, QB),
      slab: (row) => {
        for (const c of [0, 1, 3, 4]) set(c, row, BEDROCK);
        for (const L of [
          [0, 1],
          [3, 4],
        ]) {
          const gc = pick(L);
          set(gc, row, SAND);
          soft(gc, row + 1, SAND);
        }
      },
      stal: (c, r, bot) => void this.stal.push({ c, r, bot, on: true, shake: 0 }),
      open: (c, r) => {
        if (ok(c, r)) this.openC[c + r * COLS] = 1;
      },
    };
    this.lv.gen(kit);
    // (a wall cell the level opened stays open: a cave, a gallery, a well)
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < HC; c++) if (this.isWall(c) && g[c + r * COLS] === EMPTY) this.openC[c + r * COLS] = 1;
    for (let c = 0; c < HC; c++) if (!this.isWall(c) && g[c] !== EMPTY) set(c, 0, GRASS);
    // the right half: the mirror
    for (let r = 0; r < ROWS; r++) for (let c = HC; c < COLS; c++) ((g[c + r * COLS] = g[COLS - 1 - c + r * COLS]), (this.openC[c + r * COLS] = this.openC[COLS - 1 - c + r * COLS]));
    for (const st of this.stal.slice()) if (COLS - 1 - st.c !== st.c) this.stal.push({ c: COLS - 1 - st.c, r: st.r, bot: st.bot, on: true, shake: 0 });
  }

  // ---- the island --------------------------------------------------------------------------------

  private build() {
    const s = this.w.scene;
    const lv = this.lv;
    const cos = rng(9157);
    const earth: Box[] = [];
    const deco: Box[] = [];
    const lights: Box[] = [];
    const cones: Box[] = [];
    const put = (arr: Box[], x: number, y: number, z: number, w: number, h: number, d: number, c: string, rx = 0, rz = 0) => void arr.push({ x, y, z, w, h, d, c, rx, rz });
    const ZB = -FRONT - BACK / 2;
    const LS = this.layers;
    const last = LS.length - 1;
    // the layers: the back wall (darker: a dug cell reads as a hole) and the solid rims each side
    for (let li = 0; li < LS.length; li++) {
      const L = LS[li];
      const a = li === 0 ? 0 : LS[li - 1].to;
      const b = L.to;
      const cy = -(a + b) / 2;
      const h = b - a;
      put(earth, 0, cy, ZB, EDGE * 2, h, BACK, L.wall);
      for (const k of [-1, 1]) {
        put(earth, k * (HALF + RIM / 2), cy, 0, RIM, h, 1, L.c2);
        for (let r = a; r < b; r++) {
          if (li === 0 || cos() > 0.55) continue;
          const sz = 0.1 + cos() * 0.14;
          const ox = k * (HALF + 0.3 + cos() * (RIM - 0.6));
          const oy = -r - 0.2 - cos() * 0.6;
          if (L.shine && cos() < 0.6) put(lights, ox, oy, FRONT + 0.03, sz, sz * (li === last ? 0.45 : 1.3), 0.08, L.shine[Math.floor(cos() * L.shine.length)], 0, li === last ? (cos() - 0.5) * 1.2 : Math.PI / 4);
          else put(deco, ox, oy, FRONT + 0.04, sz, sz, 0.12, L.ore[Math.floor(cos() * L.ore.length)], 0, Math.PI / 4);
        }
      }
    }
    // the cave's back: deeper violet, crystals glowing on it
    const cv = lv.cave;
    if (cv) {
      put(earth, 0, -(cv.top + cv.bot + 1) / 2, -0.49, 5, cv.bot - cv.top + 1, 0.02, "#2a1d44");
      for (let k = 0; k < 14; k++) put(lights, (cos() - 0.5) * 4.6, -cv.top - 0.3 - cos() * 3.4, -0.46, 0.14 + cos() * 0.16, 0.3 + cos() * 0.4, 0.06, cos() < 0.5 ? "#8af0ff" : "#e7a6ff", 0, (cos() - 0.5) * 0.8);
    }
    // the galleries' backs: deep ice, frost crystals glowing on it
    for (const r of lv.galleries ?? [])
      for (const k of [-1, 1]) {
        put(earth, k * 3, midY(r), -0.49, 5, 1, 0.02, "#1c3a6a");
        for (let i = 0; i < 4; i++) put(lights, k * (1 + cos() * 4), midY(r) + (cos() - 0.5) * 0.6, -0.46, 0.1 + cos() * 0.12, 0.22 + cos() * 0.3, 0.05, cos() < 0.5 ? "#8af0ff" : "#ffffff", 0, (cos() - 0.5) * 0.8);
      }
    // the top
    for (const k of [-1, 1]) put(earth, k * (HALF + RIM / 2), 0.07, 0, RIM + 0.08, 0.14, 1.08, lv.top);
    put(earth, 0, 0.07, ZB, EDGE * 2 + 0.08, 0.14, BACK + 0.08, lv.top);
    // the GENESIS vault, and the rock under the island, narrowing to a point
    const zc = -BACK / 2;
    const ZD = BACK + 1;
    put(earth, 0, -ROWS - 0.7, zc, EDGE * 2, 1.4, ZD, GOLD);
    put(lights, 0, -ROWS - 0.06, FRONT + 0.02, HALF * 2, 0.09, 0.05, "#fff3a0");
    put(earth, 0, -ROWS - 2.15, zc, EDGE * 2 - 1.2, 1.5, ZD - 0.6, "#5a3a4a");
    put(earth, 0, -ROWS - 3.75, zc, EDGE * 2 - 4.4, 1.7, ZD - 1.6, "#4e3242");
    put(earth, 0, -ROWS - 5.6, zc, EDGE * 2 - 8.4, 2, ZD - 2.8, "#432a3a");
    put(earth, 0, -ROWS - 7.8, zc, 3.2, 2.4, 2.6, "#3a2433");
    // the rims: courses of rough stone of each layer's rock (no digging there), strata lines between
    const stones: Box[] = [];
    for (const k of [-1, 1])
      for (let j = 0; j < 2; j++) {
        let y = 0;
        while (y < ROWS - 0.05) {
          const h = Math.min(ROWS - y, 0.55 + cos() * 0.75);
          const L = LS[this.layerOf(Math.floor(y + h / 2))];
          const x = k * (HALF + 0.4 + j * 0.8) + (cos() - 0.5) * 0.05;
          const c = this.col.set(cos() < 0.5 ? L.c : L.c2).multiplyScalar(0.8 + cos() * 0.12);
          if (y > 0.2) stones.push({ x, y: -y - h / 2, z: 0.02, w: 0.74, h: h - 0.07, d: 1.04, c: "#" + c.getHexString() });
          y += h;
        }
      }
    for (let li = 0; li < LS.length - 1; li++) for (const k of [-1, 1]) put(deco, k * (HALF + RIM / 2), -LS[li].to, FRONT + 0.06, RIM, 0.09, 0.1, "#140c1c");
    // islets drifting round the island, each with the level's crown (a tree, a fir, a palm)
    const isles: (Box & { g: number })[] = [];
    const isle = (g: number, x: number, y: number, z: number, s: number) => {
      const b = (bx: number, by: number, bz: number, w: number, h: number, d: number, c: string, rz = 0) => isles.push({ x: x + bx, y: y + by, z: z + bz, w, h, d, c, rz, g });
      b(0, 0, 0, s, s * 0.7, s * 0.9, lv.isle[0]);
      b(0, -s * 0.55, 0, s * 0.62, s * 0.5, s * 0.55, lv.isle[0]);
      b(0, -s * 0.95, 0, s * 0.28, s * 0.35, s * 0.26, lv.isle[0]);
      b(0, s * 0.38, 0, s * 1.04, s * 0.1, s * 0.94, lv.isle[1]);
      const t = lv.crown;
      if (t === "tree") {
        b(s * 0.15, s * 0.62, 0, s * 0.1, s * 0.42, s * 0.1, "#7a5232");
        b(s * 0.15, s * 0.95, 0, s * 0.46, s * 0.36, s * 0.42, "#4fae3a");
        b(s * 0.15, s * 1.16, 0, s * 0.3, s * 0.2, s * 0.28, "#6cc24a");
        b(-s * 0.28, s * 0.5, s * 0.2, s * 0.09, s * 0.1, s * 0.09, "#ff5fa2");
      } else if (t === "fir") {
        b(-s * 0.1, s * 0.6, 0, s * 0.42, s * 0.24, s * 0.42, "#2f6a4a");
        b(-s * 0.1, s * 0.8, 0, s * 0.3, s * 0.22, s * 0.3, "#2f6a4a");
        b(-s * 0.1, s * 0.98, 0, s * 0.16, s * 0.2, s * 0.16, "#e8f2ff");
        b(s * 0.3, s * 0.48, s * 0.1, s * 0.3, s * 0.12, s * 0.3, "#ffffff");
      } else {
        for (let i = 0; i < 4; i++) b(s * 0.1 + i * s * 0.05, s * 0.5 + i * s * 0.2, 0, s * 0.09, s * 0.22, s * 0.09, "#a8784a");
        b(s * 0.38, s * 1.3, 0, s * 0.6, s * 0.06, s * 0.2, "#3fae4a", -0.4);
        b(0.0, s * 1.3, 0, s * 0.6, s * 0.06, s * 0.2, "#52c25a", 0.4);
        b(s * 0.2, s * 1.3, s * 0.2, s * 0.2, s * 0.06, s * 0.6, "#3fae4a");
      }
    };
    const spots: [number, number, number, number][] = [
      [-EDGE - 2.6, -9, -1.6, 1.4],
      [EDGE + 3.2, -16, -2.2, 1.1],
      [-EDGE - 3.6, -24, -2.6, 1.0],
      [EDGE + 2.5, -31, -1.8, 1.5],
      [-EDGE - 2.2, -37, -1.4, 1.2],
      [EDGE + 4.2, -4, -3.4, 0.9],
      [-EDGE - 5.5, -18, -5, 1.6],
      [EDGE + 5.8, -24, -5.5, 1.3],
      [-EDGE - 4.8, -44, -4, 1.4],
      [EDGE + 3.6, -43, -3, 1.0],
      // (bigger ones further out and further back: what a wider screen sees beside the island, and the
      // layers that slide past each other as the camera goes down)
      [-18.5, -3, -15, 2.6],
      [19, -14, -16, 2.2],
      [-27, -22, -30, 3.8],
      [28.5, -8, -31, 3.4],
      [-21, -34, -17, 2.4],
      [20.5, -27, -15, 2.0],
      [31, -38, -40, 4.4],
      [-33, -44, -42, 4.2],
      [-30, 4, -44, 3.6],
      [25, -47, -24, 2.8],
      [-15.5, -19, -9, 1.5],
      [16, -36, -10, 1.7],
    ];
    spots.forEach(([x, y, z, sz], g) => isle(g, x, y, z, sz));
    this.bob = bobbers(s, isles);
    // lanterns on the rims (a warm halo round each)
    const glowAt: [number, number, number, number, string][] = [];
    for (const r of [3, 11, 19, 27, 33])
      for (const k of [-1, 1]) {
        const gx = k * (HALF + RIM / 2);
        glowAt.push([gx, -r - 0.5, FRONT + 0.3, 1.5, "#ffb347"]);
        put(deco, gx, -r - 0.18, FRONT + 0.1, 0.08, 0.32, 0.08, "#3a2a20");
        put(lights, gx, -r - 0.5, FRONT + 0.14, 0.26, 0.3, 0.2, "#ffc23a");
        put(deco, gx, -r - 0.32, FRONT + 0.14, 0.32, 0.06, 0.26, "#3a2a20");
        put(deco, gx, -r - 0.68, FRONT + 0.14, 0.32, 0.06, 0.26, "#3a2a20");
      }
    // fences on the top over the walls
    for (const c of lv.walls) {
      const fx = colX(c);
      for (const dz of [-0.3, 0.3]) put(deco, fx, 0.5, dz, 0.16, 1.0, 0.16, lv.fence[0]);
      for (const fy of [0.35, 0.75]) put(deco, fx, fy, 0, 0.1, 0.12, 0.9, lv.fence[1]);
      put(deco, fx, 1.05, 0, 0.26, 0.12, 0.26, lv.fence[2]);
    }
    // up top: a headframe behind each start, its pennant in the seat's colour
    for (let i = 0; i < 4; i++) {
      const sx = colX(this.lane[i]);
      for (const k of [-1, 1]) put(deco, sx + k * 0.75, 1.1, -1.1, 0.16, 2.2, 0.16, lv.wood[0]);
      put(deco, sx, 2.2, -1.1, 1.8, 0.18, 0.2, lv.wood[1]);
      put(deco, sx, 1.9, -1.1, 0.3, 0.3, 0.1, "#3a2a20");
      put(deco, sx - 0.75 + 0.3, 2.65, -1.1, 0.5, 0.3, 0.05, this.players[i].color);
      put(deco, sx - 0.75, 2.5, -1.1, 0.05, 0.75, 0.05, "#5a3a20");
    }
    // the sign at the back
    put(deco, -2.6, 2.4, -4.4, 0.24, 4.8, 0.24, lv.wood[0]);
    put(deco, 2.6, 2.4, -4.4, 0.24, 4.8, 0.24, lv.wood[0]);
    put(deco, 0, 4.5, -4.3, 6.4, 1.5, 0.22, lv.sign[0]);
    put(deco, 0, 4.5, -4.35, 6.7, 1.75, 0.18, lv.sign[1]);
    // the level's own dressing
    const sk: SceneKit = { scene: s, cos, earth, deco, lights, cones, put, lane: this.lane, colors: this.players.map((p) => p.color), spin: this.spin };
    this.lvTick = lv.scenery(sk) || null;

    const inst = (arr: Box[], geo: THREE.BufferGeometry, mat: THREE.Material, hull = 0) => {
      const mesh = new THREE.InstancedMesh(geo, mat, arr.length);
      arr.forEach((b, i) => {
        this.e.set(b.rx ?? 0, 0, b.rz ?? 0);
        this.q.setFromEuler(this.e);
        this.m4.compose(this.v.set(b.x, b.y, b.z), this.q, this.sc.set(b.w + hull * 2, b.h + hull * 2, b.d + hull * 2));
        mesh.setMatrixAt(i, this.m4);
        if (!hull) mesh.setColorAt(i, this.col.set(b.c));
      });
      mesh.raycast = () => {};
      s.add(mesh);
      return mesh;
    };
    const inkMat = new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide });
    inst(earth, GEO.box, toon("#ffffff"));
    inst(earth, GEO.box, inkMat, 0.05);
    // (dressed stone: a bevel, one bedding line, two joints; no speckle)
    const cobble = canvasTex(32, 32, (g) => {
      g.fillStyle = "#d6d6d6";
      g.fillRect(0, 0, 32, 32);
      g.fillStyle = "#f2f2f2";
      g.fillRect(0, 0, 32, 3);
      g.fillRect(0, 0, 3, 32);
      g.fillRect(3, 17, 26, 2);
      g.fillStyle = "#a6a6a6";
      g.fillRect(0, 29, 32, 3);
      g.fillRect(29, 0, 3, 32);
      g.fillStyle = "#b8b8b8";
      g.fillRect(3, 15, 26, 2);
      g.fillRect(11, 3, 2, 12);
      g.fillRect(20, 19, 2, 10);
    });
    cobble.magFilter = THREE.NearestFilter;
    inst(stones, GEO.box, new THREE.MeshToonMaterial({ map: cobble, gradientMap: toonSteps() }));
    // the back of every cell: the rock behind, seen once it is dug out (dark, grainy)
    const backTex = canvasTex(32, 32, (g) => {
      g.fillStyle = "#9a9a9a";
      g.fillRect(0, 0, 32, 32);
      // (a few strata, the same in every cell: the hole reads as rock, quietly)
      g.fillStyle = "#868686";
      for (const [x, y, w] of [
        [4, 7, 12],
        [18, 13, 9],
        [6, 21, 15],
      ])
        g.fillRect(x, y, w, 2);
      g.fillStyle = "#a8a8a8";
      for (const [x, y, w] of [
        [16, 5, 8],
        [3, 15, 7],
        [22, 24, 6],
      ])
        g.fillRect(x, y, w, 2);
      g.fillStyle = "#6a6a6a";
      g.fillRect(0, 30, 32, 2);
      g.fillRect(30, 0, 2, 32);
    });
    backTex.magFilter = THREE.NearestFilter;
    const backs: Box[] = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const L = LS[this.layerOf(r)];
        const k = (c + r) % 2 ? 1.25 : 1.4;
        backs.push({ x: colX(c), y: midY(r), z: -0.485, w: 1, h: 1, d: 1, c: "#" + this.col.set(L.wall).multiplyScalar(k).getHexString() });
      }
    inst(backs, GEO.plane, new THREE.MeshToonMaterial({ map: backTex, gradientMap: toonSteps() }));
    // (and a golden glow round the GENESIS prize)
    glowAt.push([0, -ROWS - 0.72, FRONT + 0.5, 3.4, "#ffd23f"], [0, -ROWS - 0.1, FRONT + 0.1, 7, "#8a4a0c"]);
    this.glows = halos(s, glowAt);
    inst(deco, GEO.box, toon("#ffffff"));
    inst(lights, GEO.box, glow("#ffffff"));
    inst(cones, GEO.cone, toon("#ffffff"));

    // the blocks: six looks, each an instanced mesh over every cell (the cells not of that look at scale 0)
    const nearest = (t: THREE.Texture) => ((t.magFilter = THREE.NearestFilter), (t.minFilter = THREE.NearestFilter), (t.generateMipmaps = false), t);
    const edges = (g: CanvasRenderingContext2D, hi: string, lo: string) => {
      g.fillStyle = hi;
      g.fillRect(0, 0, 32, 3);
      g.fillRect(0, 0, 3, 32);
      g.fillStyle = lo;
      g.fillRect(0, 29, 32, 3);
      g.fillRect(29, 0, 3, 32);
    };
    const bevel = nearest(
      canvasTex(32, 32, (g) => {
        g.fillStyle = "#e4e4e4";
        g.fillRect(0, 0, 32, 32);
        edges(g, "#ffffff", "#a6a6a6");
        g.fillStyle = "#cdcdcd";
        for (const [px, py] of [
          [8, 9],
          [20, 6],
          [14, 18],
          [24, 22],
          [7, 24],
        ])
          g.fillRect(px, py, 3, 3);
      }),
    );
    // (the hard rock: cut in facets, a lighter half and a darker one across a cleft; no speckle)
    const speck = nearest(
      canvasTex(32, 32, (g) => {
        g.fillStyle = "#c2c2c2";
        g.fillRect(0, 0, 32, 32);
        g.fillStyle = "#e0e0e0";
        g.beginPath();
        g.moveTo(3, 3);
        g.lineTo(29, 3);
        g.lineTo(3, 29);
        g.fill();
        g.fillStyle = "#9a9a9a";
        for (let k = 0; k < 26; k += 2) g.fillRect(28 - k - 1, 3 + k, 2, 2);
        g.fillStyle = "#f6f6f6";
        g.fillRect(7, 7, 6, 2);
        g.fillRect(7, 7, 2, 6);
        g.fillStyle = "#a8a8a8";
        g.fillRect(19, 23, 6, 2);
        g.fillRect(23, 19, 2, 6);
        edges(g, "#f4f4f4", "#7e7e7e");
      }),
    );
    const crackLines = (g: CanvasRenderingContext2D, color: string, w: number, seed: number) => {
      const r = rng(seed);
      g.strokeStyle = color;
      g.lineWidth = w;
      g.lineCap = "round";
      for (let n = 0; n < 3; n++) {
        let x = 16 + (r() - 0.5) * 10;
        let y = 16 + (r() - 0.5) * 10;
        const a0 = r() * Math.PI * 2;
        g.beginPath();
        g.moveTo(x, y);
        for (let st = 0; st < 4; st++) {
          const a = a0 + (r() - 0.5) * 1.3;
          x += Math.cos(a) * 5;
          y += Math.sin(a) * 5;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    };
    const crumbTex = nearest(
      canvasTex(32, 32, (g) => {
        g.fillStyle = "#e8e8e8";
        g.fillRect(0, 0, 32, 32);
        edges(g, "#ffffff", "#b4b4b4");
        crackLines(g, "#6a5a48", 1.6, 5);
      }),
    );
    const hotTex = nearest(
      canvasTex(32, 32, (g) => {
        g.fillStyle = "#d0d0d0";
        g.fillRect(0, 0, 32, 32);
        edges(g, "#ececec", "#8a8a8a");
        crackLines(g, "#3a1010", 2.4, 11);
      }),
    );
    const hotGlow = nearest(
      canvasTex(32, 32, (g) => {
        g.fillStyle = "#000000";
        g.fillRect(0, 0, 32, 32);
        crackLines(g, "#ff8a1a", 2.4, 11);
        crackLines(g, "#ffe27a", 0.9, 11);
      }),
    );
    const bedTex = nearest(
      canvasTex(32, 32, (g) => {
        g.fillStyle = "#6c7384";
        g.fillRect(0, 0, 32, 32);
        g.fillStyle = "#565c6c";
        for (let k = -32; k < 32; k += 8) {
          g.beginPath();
          g.moveTo(k, 32);
          g.lineTo(k + 4, 32);
          g.lineTo(k + 36, 0);
          g.lineTo(k + 32, 0);
          g.fill();
        }
        edges(g, "#9aa2b4", "#353a46");
        g.fillStyle = "#d8dde8";
        for (const [px, py] of [
          [5, 5],
          [25, 5],
          [5, 25],
          [25, 25],
        ])
          g.fillRect(px, py, 3, 3);
      }),
    );
    const brick = nearest(
      canvasTex(32, 32, (g) => {
        g.fillStyle = "#cfcfcf";
        g.fillRect(0, 0, 32, 32);
        g.fillStyle = "#f2f2f2";
        for (const y of [0, 10, 21]) g.fillRect(0, y, 32, 2);
        for (const [x, y] of [
          [10, 2],
          [26, 2],
          [4, 12],
          [20, 12],
          [12, 23],
          [28, 23],
        ])
          g.fillRect(x, y, 2, y === 21 ? 9 : 9);
        g.fillStyle = "#a9a9a9";
        for (const y of [8, 19, 30]) g.fillRect(0, y, 32, 2);
      }),
    );
    const iceTex = nearest(
      canvasTex(32, 32, (g) => {
        g.fillStyle = "#dfe9f2";
        g.fillRect(0, 0, 32, 32);
        g.fillStyle = "#ffffff";
        for (const [x0, w] of [
          [4, 3],
          [11, 2],
          [19, 4],
        ]) {
          g.beginPath();
          g.moveTo(x0, 30);
          g.lineTo(x0 + w, 30);
          g.lineTo(x0 + w + 14, 2);
          g.lineTo(x0 + 14, 2);
          g.fill();
        }
        g.fillStyle = "#bccbd8";
        for (const [px, py] of [
          [7, 9],
          [24, 20],
          [14, 24],
        ])
          g.fillRect(px, py, 2, 2);
        edges(g, "#ffffff", "#9fb2c2");
      }),
    );
    const airTex = nearest(
      canvasTex(32, 32, (g) => {
        g.fillStyle = "#3a8fc0";
        g.fillRect(0, 0, 32, 32);
        edges(g, "#7cd0f2", "#1f5f86");
        for (const [bx, by, br] of [
          [11, 12, 6],
          [22, 9, 4],
          [20, 21, 5],
          [9, 24, 3],
        ]) {
          g.fillStyle = "rgba(220,250,255,0.85)";
          g.beginPath();
          g.arc(bx, by, br, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#4fb6e6";
          g.beginPath();
          g.arc(bx + 0.8, by + 0.8, br - 1.6, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#ffffff";
          g.fillRect(bx - br * 0.5, by - br * 0.5, 2, 2);
        }
      }),
    );
    this.hotMat = new THREE.MeshToonMaterial({ map: hotTex, emissive: 0xffffff, emissiveMap: hotGlow, gradientMap: toonSteps() });
    this.iceMat = new THREE.MeshToonMaterial({ map: iceTex, gradientMap: toonSteps(), emissive: 0x16304a });
    const mats: THREE.Material[] = [
      new THREE.MeshToonMaterial({ map: bevel, gradientMap: toonSteps() }),
      new THREE.MeshToonMaterial({ map: speck, gradientMap: toonSteps() }),
      new THREE.MeshToonMaterial({ map: crumbTex, gradientMap: toonSteps() }),
      this.hotMat,
      new THREE.MeshToonMaterial({ map: qTex(), gradientMap: toonSteps(), emissive: 0x4a3200 }),
      new THREE.MeshToonMaterial({ map: bedTex, gradientMap: toonSteps() }),
      new THREE.MeshToonMaterial({ map: brick, gradientMap: toonSteps() }),
      this.iceMat,
      new THREE.MeshToonMaterial({ map: airTex, gradientMap: toonSteps(), emissive: 0x1c5a7a }),
    ];
    const cellMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, colors: boolean) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      for (let i = 0; i < n; i++) {
        m.setMatrixAt(i, ZERO);
        if (colors) m.setColorAt(i, this.col.set(0xffffff));
      }
      m.frustumCulled = false;
      m.raycast = () => {};
      s.add(m);
      return m;
    };
    this.meshes = mats.map((mt, k) => cellMesh(GEO.box, mt, N, TINTED[k]));
    // (only the levels with ice or air pockets draw those)
    let ice = false;
    let air = false;
    for (let id = 0; id < N; id++) ((ice ||= this.g[id] === ICE), (air ||= this.g[id] === AIR));
    this.meshes[7].visible = ice || !!this.lv.ice;
    this.meshes[8].visible = air;
    this.ink = cellMesh(GEO.box, inkMat, N, false);
    // boulders (and quake rocks), their ink; lava; stalactites; the red warnings
    const rockMat = new THREE.MeshToonMaterial({ color: this.lv.rock, gradientMap: toonSteps() });
    this.bould = cellMesh(this.rockGeo, rockMat, 48, true);
    this.bouldInk = cellMesh(this.rockGeo, inkMat, 48, false);
    this.lavaTex = canvasTex(
      64,
      64,
      (g) => {
        const P = this.lv.pool.tex;
        g.fillStyle = P[0];
        g.fillRect(0, 0, 64, 64);
        const r = rng(3);
        for (let k = 0; k < 14; k++) {
          g.fillStyle = r() < 0.6 ? P[1] : P[2];
          g.beginPath();
          g.arc(r() * 64, r() * 64, 3 + r() * 7, 0, Math.PI * 2);
          g.fill();
        }
        for (let k = 0; k < 10; k++) {
          g.fillStyle = P[3];
          g.fillRect(r() * 64, r() * 64, 3, 3);
        }
      },
      true,
    );
    this.lava = cellMesh(GEO.box, new THREE.MeshBasicMaterial({ map: this.lavaTex }), 32, false);
    this.stalMesh = cellMesh(GEO.cone, this.lv.ice ? toon("#d8f4ff", "#2a5a8a") : toon("#7c6aa0", "#1a0f2e"), 12, false);
    const warnTex = canvasTex(64, 64, (g) => {
      g.fillStyle = "rgba(255,40,60,0.42)";
      g.beginPath();
      g.roundRect(3, 3, 58, 58, 10);
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = "#ff2a44";
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.beginPath();
      g.roundRect(8, 8, 48, 48, 7);
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.font = `900 34px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("!", 32, 34);
    });
    this.warnMat = new THREE.MeshBasicMaterial({ map: warnTex, transparent: true, depthWrite: false });
    this.warn = cellMesh(GEO.plane, this.warnMat, 96, false);
    this.warn.renderOrder = 4;
    // the tide: a sheet of sea over the cut face from its surface down, foam along the top
    if (this.lv.tide) {
      // (the sea lighter and clearer at its top, deeper blue down by GENESIS)
      const seaTex = canvasTex(4, 128, (g) => {
        const gr = g.createLinearGradient(0, 0, 0, 128);
        gr.addColorStop(0, "rgba(140,236,255,0.62)");
        gr.addColorStop(0.08, "rgba(60,190,245,0.46)");
        gr.addColorStop(1, "rgba(16,92,190,0.5)");
        g.fillStyle = gr;
        g.fillRect(0, 0, 4, 128);
      });
      this.tideMesh = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: seaTex, transparent: true, depthWrite: false }));
      this.tideMesh.renderOrder = 3;
      this.tideMesh.visible = false;
      s.add(this.tideMesh);
      // light rippling through the water (a tiled pattern of caustics, drifting)
      this.caustTex = canvasTex(
        128,
        128,
        (g) => {
          g.clearRect(0, 0, 128, 128);
          g.strokeStyle = "rgba(255,255,255,0.75)";
          g.lineCap = "round";
          const r = rng(41);
          for (let i = 0; i < 16; i++) {
            const x0 = r() * 128;
            const y0 = r() * 128;
            g.lineWidth = 1.5 + r() * 2.5;
            for (const dx of [-128, 0, 128])
              for (const dy of [-128, 0, 128]) {
                g.beginPath();
                g.moveTo(x0 + dx, y0 + dy);
                g.bezierCurveTo(x0 + dx + 20, y0 + dy - 18, x0 + dx + 34, y0 + dy + 16, x0 + dx + 52, y0 + dy + 2);
                g.stroke();
              }
          }
        },
        true,
      );
      this.caust = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.caustTex, color: "#bff4ff", transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.caust.renderOrder = 3;
      this.caust.visible = false;
      s.add(this.caust);
      this.foam = new THREE.Mesh(GEO.box, glow("#e6fbff", 0.9));
      this.foam.renderOrder = 3;
      this.foam.visible = false;
      s.add(this.foam);
    }

    // the cracks: one box over the block each miner hits, its texture the damage
    for (let k = 1; k <= 4; k++) {
      const cr = rng(31 + k);
      this.crackTex.push(
        canvasTex(64, 64, (g) => {
          g.strokeStyle = "rgba(25,12,20,0.85)";
          g.lineCap = "round";
          for (let n = 0; n < k * 2 + 1; n++) {
            let x = 32 + (cr() - 0.5) * 14;
            let y = 32 + (cr() - 0.5) * 14;
            const a0 = cr() * Math.PI * 2;
            g.lineWidth = 3.4 - n * 0.2;
            g.beginPath();
            g.moveTo(x, y);
            for (let st = 0; st < 3 + k; st++) {
              const a = a0 + (cr() - 0.5) * 1.1;
              x += Math.cos(a) * (5 + cr() * 5);
              y += Math.sin(a) * (5 + cr() * 5);
              g.lineTo(x, y);
            }
            g.stroke();
          }
        }),
      );
    }
    for (let i = 0; i < 4; i++) {
      const cm = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ map: this.crackTex[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      cm.visible = false;
      cm.renderOrder = 2;
      s.add(cm);
      this.cracks.push(cm);
    }
    // the TNT: a pool of red sticks, a fuse spark
    const tntTex = canvasTex(64, 64, (g) => {
      g.fillStyle = "#e3302a";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#b51d1d";
      for (const x of [20, 42]) g.fillRect(x, 0, 3, 64);
      g.fillStyle = "#fff4de";
      g.fillRect(0, 22, 64, 20);
      g.font = `900 19px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#1a1033";
      g.fillText("TNT", 32, 33);
    });
    const tntMat = new THREE.MeshToonMaterial({ map: tntTex, gradientMap: toonSteps() });
    for (let k = 0; k < 6; k++) {
      const gr = new THREE.Group();
      const body = new THREE.Mesh(GEO.box, tntMat);
      body.scale.set(0.42, 0.56, 0.42);
      outline(body, 0.03);
      gr.add(body);
      const spark = new THREE.Mesh(GEO.ball, glow("#fff3a0"));
      spark.scale.setScalar(0.16);
      spark.position.y = 0.38;
      gr.add(spark);
      gr.visible = false;
      s.add(gr);
      this.tnts.push(gr);
    }
    // the prize over GENESIS, the signs
    this.prize = coin(0.55);
    this.prize.position.set(0, -ROWS - 0.72, FRONT + 0.7);
    s.add(this.prize);
    const gen = label(T("GENESIS BLOCK", "创世区块"), 0.85, "#ffd23f", "rgba(30,12,22,0.85)");
    gen.position.set(0, -ROWS - 2.15, FRONT - 0.25);
    s.add(gen);
    const title = label("PROOF OF DIG", 1.05, this.lv.sign[2]);
    title.position.set(0, 4.52, -4.18);
    s.add(title);
    for (const d of [10, 20, 30]) {
      const l = label(`${d} m`, 0.42, "#ffffff", "rgba(20,12,30,0.6)");
      l.position.set(-(HALF + RIM / 2), -d + 0.5, FRONT + 0.04);
      l.scale.set(1.5, 0.38, 1);
      s.add(l);
    }
    for (const k of [-1, 1]) {
      const qb = qBlock(1.1);
      qb.position.set(k * 5.4, 5.2, -3.2);
      s.add(qb);
      this.qbs.push(qb);
    }
  }

  /** A block's colour: its layer, a checker so each block reads, a fixed small jitter. */
  private colorOf(id: number, t: number) {
    const c = id % COLS;
    const r = (id / COLS) | 0;
    const L = this.layers[this.layerOf(r)];
    const P = this.lv.pal;
    const odd = (c + r) % 2 === 1;
    const out = this.col;
    switch (t) {
      case SAND:
        out.set(odd ? L.c2 : L.c).lerp(SANDC, 0.55);
        break;
      case GRANITE:
        out.set(P.granite[odd ? 0 : 1]);
        break;
      case OBSID:
        out.set(P.obsid[odd ? 0 : 1]);
        break;
      case CRUMB:
        out.set(P.crumb[odd ? 0 : 1]);
        break;
      case HOT:
        out.set(P.hot[odd ? 0 : 1]);
        break;
      case ICE:
        out.set(P.ice[odd ? 0 : 1]);
        break;
      case SNOW:
        out.set(P.snow[odd ? 0 : 1]);
        break;
      case WALL:
        out.set(L.c2).multiplyScalar(0.7).lerp(this.col2.set("#3b3150"), 0.3);
        break;
      default:
        out.set(odd ? L.c2 : L.c);
    }
    return out.multiplyScalar(0.96 + (((id * 2654435761) >>> 0) % 997) / 997 * 0.08);
  }

  /** Show a cell as its block (squashed by a jolt), or as nothing. */
  private paint(id: number, sx = 1, sy = 1, dy = 0) {
    const t = this.g[id];
    const k = MESH[t];
    const was = this.shown[id];
    if (was >= 0 && was !== k) {
      this.meshes[was].setMatrixAt(id, ZERO);
      this.meshes[was].instanceMatrix.needsUpdate = true;
    }
    this.shown[id] = k;
    if (k >= 0) {
      const c = id % COLS;
      const r = (id / COLS) | 0;
      const m = this.meshes[k];
      this.q.identity();
      this.m4.compose(this.v.set(colX(c), midY(r) + dy, 0), this.q, this.sc.set(0.98 * sx, 0.98 * sy, 0.98 * sx));
      m.setMatrixAt(id, this.m4);
      m.instanceMatrix.needsUpdate = true;
      if (was !== k && TINTED[k]) {
        m.setColorAt(id, this.colorOf(id, t));
        m.instanceColor!.needsUpdate = true;
      }
      this.m4.compose(this.v, this.q, this.sc.set(1.05 * sx, 1.05 * sy, 1.05 * sx));
      this.ink.setMatrixAt(id, this.m4);
    } else this.ink.setMatrixAt(id, ZERO);
    this.ink.instanceMatrix.needsUpdate = true;
  }

  // ---- the grid ------------------------------------------------------------------------------------

  /** The block at a cell: air over the grass, steel past the sides and under the last row. */
  private at(c: number, r: number) {
    if (c < 0 || c >= COLS || r >= ROWS) return BEDROCK;
    if (r < 0) return this.isWall(c) ? WALL : EMPTY;
    return this.g[c + r * COLS];
  }
  /** Where something dropped into column c at row r comes to rest. */
  private settle(c: number, r: number) {
    while (r + 1 < ROWS && this.at(c, r + 1) === EMPTY) r++;
    return r;
  }
  private minerAt(c: number, r: number, self: Miner | null) {
    for (const m of this.ms) if (m !== self && !m.done && m.c === c && m.r === r) return m;
    return null;
  }
  private passable(c: number, r: number, self: Miner) {
    return r < ROWS && this.at(c, r) === EMPTY && !this.minerAt(c, r, self);
  }

  private depth(m: Miner) {
    if (m.done) return ROWS + 10 - this.finished.indexOf(m.i);
    const b = m.r + 1;
    const id = b < ROWS && b >= 0 ? m.c + b * COLS : -1;
    const fr = id >= 0 && HP[this.g[id]] > 0 ? Math.min(0.9, this.dmg[id] / HP[this.g[id]]) : 0;
    return m.r + 1 + fr;
  }
  private leader() {
    let best = this.ms[0];
    for (const m of this.ms) if (this.depth(m) > this.depth(best)) best = m;
    return best;
  }
  /** 0: in front … 3: last. */
  private rankOf(m: Miner) {
    const d = this.depth(m);
    let k = 0;
    for (const o of this.ms) if (o !== m && this.depth(o) > d) k++;
    return k;
  }
  private onScreen(y: number) {
    return Math.abs(y - this.cam.at.y) < HALF_H + 1;
  }

  private say(s: string, c = "#ffd23f") {
    if (this.bans.length < 3) this.bans.push({ s, c, at: this.now });
  }
  private popup(m: Miner, s: string, c: string, big = false) {
    m.pop = s;
    m.popC = c;
    m.popBig = big;
    m.popT = 0;
  }
  private face(m: Miner, e: number, t = 0.5) {
    m.expr = e;
    m.exprT = t;
  }

  // ---- the moves ---------------------------------------------------------------------------------

  /**
   * One miner's controls this frame: `dir` 1 left, 2 right, 3 down (`fresh`: just pressed), `act`
   * the A button. Returns whether something happened.
   */
  private control(m: Miner, dir: number, fresh: boolean, act: boolean) {
    if (m.done || this.over || m.stun > 0) return false;
    const ready = m.grounded && m.mv >= 1;
    if (act && m.tnt > 0 && ready) {
      this.useTnt(m);
      return true;
    }
    if (!dir || !ready) return false;
    return this.doDir(m, dir, fresh);
  }

  private doDir(m: Miner, dir: number, fresh: boolean) {
    const need = (m.p.human ? (fresh ? MASH : HOLD) : m.brain.rate) * (m.rush > 0 ? 0.85 : 1);
    if (dir === 3) {
      m.down = true;
      const r1 = m.r + 1;
      if (r1 >= ROWS) return false;
      const o = this.minerAt(m.c, r1, m);
      if (o) {
        if (m.since < need) return false;
        this.bonk(m, o, 0);
        return true;
      }
      const t = this.g[m.c + r1 * COLS];
      if (t === EMPTY || m.since < need) return false;
      this.strike(m, m.c, r1);
      return true;
    }
    const f = dir === 1 ? -1 : 1;
    m.face = f;
    m.down = false;
    const c1 = m.c + f;
    if (c1 < 0 || c1 >= COLS) return false;
    const o = this.minerAt(c1, m.r, m);
    if (o) {
      if (m.since < need) return false;
      this.bonk(m, o, f);
      return true;
    }
    const t = this.at(c1, m.r);
    if (t === EMPTY) {
      this.slideTo(m, c1, f);
      return true;
    }
    // a one-block step that does not break (steel), climbed; anything that breaks is dug
    if (HP[t] === 0 && t !== LAVA && m.r - 1 >= -1 && this.at(c1, m.r - 1) === EMPTY && this.at(m.c, m.r - 1) === EMPTY && !this.minerAt(c1, m.r - 1, m)) {
      this.walk(m, c1, m.r - 1, true);
      return true;
    }
    if (m.since < need) return false;
    // a boulder with room behind it: pushed
    if (t === BOULDER && this.at(c1 + f, m.r) === EMPTY && !this.minerAt(c1 + f, m.r, m)) {
      this.push(m, c1, f);
      return true;
    }
    this.strike(m, c1, m.r);
    return true;
  }

  /**
   * Where a step into the open cell (c, r), going f, ends: on ice it glides on while the way is open
   * (`self`: rivals stop it, but not that one; null: rivals are ignored, as the planner does).
   */
  private glideTo(c: number, r: number, f: number, self: Miner | null) {
    if (!this.lv.ice) return c;
    while (this.at(c, r + 1) === ICE && this.at(c + f, r) === EMPTY && !(self && this.minerAt(c + f, r, self))) c += f;
    return c;
  }

  /** A step to the side into the open cell c1, gliding on over the ice (into whoever it slams). */
  private slideTo(m: Miner, c1: number, f: number) {
    const ce = this.glideTo(c1, m.r, f, m);
    this.walk(m, ce, m.r, false);
    if (ce === c1) return;
    m.mvT = MOVE_T + GLIDE_T * Math.abs(ce - c1);
    m.glide = f;
    this.stats.glide++;
    if (this.onScreen(m.y)) hiss(0.18 + 0.05 * Math.abs(ce - c1), m.p.human ? 0.22 : 0.1, 5200, "highpass");
  }

  private walk(m: Miner, c: number, r: number, climb: boolean) {
    m.mx0 = m.x;
    m.mx1 = colX(c);
    m.my0 = m.y;
    m.my1 = footY(r);
    m.climb = climb;
    m.mv = 0;
    m.mvT = climb ? CLIMB_T : MOVE_T;
    m.c = c;
    m.r = r;
  }

  /** A swing at a block: a hit in it, or a clank off steel. */
  private strike(m: Miner, c: number, r: number) {
    const id = c + r * COLS;
    const t = this.g[id];
    m.since = 0;
    m.swing = 0;
    m.hitId = id;
    const me = m.p.human;
    const x = colX(c) - (c - m.c) * 0.42;
    const y = r === m.r ? midY(r) : midY(r) + 0.42;
    if (HP[t] === 0) {
      this.popup(m, t === LAVA ? T(this.lv.pool.en, this.lv.pool.zh) : t === WALL ? T("WALL!", "墙！") : T("STEEL!", "钢板！"), "#ff9a9a");
      this.face(m, FACE.surprised, 0.4);
      this.fx.burst(this.v.set(x, y, 0.55), 6, ["#ffffff", "#ffe27a"], { speed: 3, up: 3, size: 0.07, life: 0.3 });
      if (me) SND.clank();
      return;
    }
    this.dmg[id] += m.rush > 0 ? 99 : 1;
    if (m.rush > 0) m.rush--;
    m.jolt = 1;
    this.fx.burst(this.v.set(x, y, 0.55), 5, [this.hexOf(id), "#3a2a20"], { speed: 3, up: 3.5, size: 0.11, life: 0.5 });
    if (me) (SND.chunk(Math.min(4, HP[t] - 1)), this.cam.shake(0.035));
    if (this.dmg[id] >= HP[t]) this.breakCell(id, m);
  }

  private hexOf(id: number) {
    const t = this.g[id];
    if (t === QB) return GOLD;
    if (t === BEDROCK) return "#6c7384";
    return "#" + this.colorOf(id, t).getHexString();
  }

  /** A block gives way: its bits, and what was in it. */
  private breakCell(id: number, by: Miner | null, blast = false) {
    const t = this.g[id];
    const c = id % COLS;
    const r = (id / COLS) | 0;
    const hx = this.hexOf(id);
    // (a nonce set in a lane wall leaves the brick behind it)
    this.g[id] = this.isWall(c) && r >= 0 && !this.openC[id] ? WALL : EMPTY;
    this.dmg[id] = 0;
    this.wob[id] = 0;
    this.paint(id);
    this.ver++;
    this.fx.burst(this.v.set(colX(c), midY(r), 0.3), 10, [hx, hx, "#2a1a14"], { speed: 4.5, up: 3.5, size: 0.2, life: 0.8, gravity: 22 });
    if (by?.p.human) SND.crumble();
    if (t === QB && by) this.award(by, c, r);
    if (t === AIR) this.breathe(by, c, r, blast);
    // (a hole in a gallery's ice floor freezes over behind whoever dug it)
    if (t === ICE && this.lv.galleries?.includes(r - 1)) ((this.thawT[id] = this.t + REFREEZE), this.thaw.push(id));
  }

  /** The ICE CAVE's gallery floors heal: a hole freezes over a moment after it was dug (not on anyone in it). */
  private refreeze(dt: number) {
    if (!this.thaw.length) return;
    this.frostT -= dt;
    const puff = this.frostT <= 0;
    if (puff) this.frostT = 0.12;
    let w = 0;
    for (const id of this.thaw) {
      const c = id % COLS;
      const r = (id / COLS) | 0;
      if (this.g[id] !== EMPTY) continue;
      if (this.t < this.thawT[id]) {
        if (puff && this.onScreen(midY(r))) this.fx.burst(this.v.set(colX(c) + (Math.random() - 0.5) * 0.7, footY(r) + 0.92, 0.45), 2, ICE_SPRAY, FROST);
        this.thaw[w++] = id;
        continue;
      }
      let busy = !!this.minerAt(c, r, null);
      for (const f of this.fallers) if (!f.dead && f.c === c && Math.abs(f.y - midY(r)) < 1) busy = true;
      if (busy) {
        this.thawT[id] = this.t + 0.25;
        this.thaw[w++] = id;
        continue;
      }
      this.g[id] = ICE;
      this.dmg[id] = 0;
      this.paint(id);
      this.ver++;
      this.stats.refreeze++;
      this.fx.burst(this.v.set(colX(c), midY(r), 0.5), 10, ICE_SPRAY, { speed: 2.5, up: 2, size: 0.1, life: 0.5 });
      if (this.onScreen(midY(r))) (beep(1900, 2600, 0.07, 0.05, "triangle"), hiss(0.12, 0.08, 4200, "highpass"));
    }
    this.thaw.length = w;
  }

  /** An AIR pocket gives way: whoever broke it breathes deep (a blast just lets the bubbles go). */
  private breathe(m: Miner | null, c: number, r: number, blast: boolean) {
    this.fx.burst(this.v.set(colX(c), midY(r), 0.5), 22, ["#e6fbff", "#a8e8ff", "#ffffff"], { speed: 2.5, up: 4, gravity: -7, size: 0.13, life: 1.1, drag: 1.5 });
    if (!m || blast || m.done) return;
    this.stats.air++;
    const low = m.air < AIR_MAX * 0.5;
    m.air = AIR_MAX;
    m.airWarn = false;
    this.popup(m, T("AIR!", "空气！"), "#8af0ff", low);
    if (m.p.human) (beep(520, 1040, 0.16, 0.18, "sine"), beep(780, 1560, 0.14, 0.1, "sine"));
  }

  /**
   * A NONCE: TNT or a HASH RUSH (the further behind, the likelier the TNT, and the very last may
   * get two).
   */
  private award(m: Miner, c: number, r: number) {
    this.stats.nonce++;
    const rank = this.rankOf(m);
    const me = m.p.human;
    this.fx.burst(this.v.set(colX(c), midY(r), 0.5), 26, ["#ffd23f", "#fff4c4", "#ffb02e"], { speed: 6, up: 6, size: 0.14 });
    if (!this.said.has("nonce")) (this.said.add("nonce"), this.say(T(`${short(m.p)} FOUND A NONCE!`, `${short(m.p)} 找到随机数！`)));
    if (this.rnd() < [0.8, 0.6, 0.5, 0.45][rank]) {
      const n = rank === 3 && m.tnt === 0 && this.rnd() < 0.5 ? 2 : 1;
      m.tnt = Math.min(2, m.tnt + n);
      m.tntT = 0;
      this.popup(m, n > 1 ? "TNT ×2!" : "+TNT!", "#ff7a5a", true);
      if (me) (this.say(T("TNT! PRESS A", "炸药！按 A"), "#ff7a5a"), sfx.coin());
    } else {
      m.rush = RUSH_N;
      this.stats.rush++;
      this.popup(m, T("HASH RUSH!", "算力爆发！"), "#ffb347", true);
      if (me) (this.say(T("HASH RUSH ×4!", "算力爆发 ×4！"), "#ffb347"), sfx.star());
    }
    m.a.cheer(0.5);
    m.cheerT = 0.5;
  }

  private push(m: Miner, c1: number, f: number) {
    const from = c1 + m.r * COLS;
    const to = c1 + f + m.r * COLS;
    this.g[to] = BOULDER;
    this.g[from] = EMPTY;
    this.wob[from] = this.wob[to] = 0;
    this.slide[to] = -f;
    this.dmg[from] = 0;
    this.ver++;
    m.since = 0;
    m.swing = 0;
    this.stats.push++;
    this.walk(m, c1, m.r, false);
    this.fx.burst(this.v.set(colX(c1 + f), footY(m.r) + 0.1, 0.4), 8, ["#c9b48a", "#8a7a5a"], { speed: 2, up: 1.2, size: 0.12, life: 0.5 });
    if (m.p.human) SND.crumble();
  }

  /** A bump into a rival: dazed (and shoved on, with room), a TNT taken. */
  private bonk(m: Miner, o: Miner, f: number) {
    m.since = 0;
    m.swing = 0;
    const show = m.p.human || o.p.human;
    if (o.immune > 0 || o.stun > 0) {
      this.fx.burst(this.v.set((m.x + o.x) / 2, o.y + 0.6, 0.5), 4, ["#ffffff"], { speed: 2, up: 2, size: 0.07, life: 0.25 });
      return;
    }
    this.stats.bonk++;
    this.stun(o, 0.75, T("BONK!", "咚！"), "#ffd23f", 2.5);
    if (f && this.at(o.c + f, o.r) === EMPTY && !this.minerAt(o.c + f, o.r, o)) this.slideTo(o, o.c + f, f);
    if (o.tnt > 0) {
      o.tnt--;
      m.tnt = Math.min(2, m.tnt + 1);
      m.tntT = 0;
      this.stats.steal++;
      this.popup(m, T("STOLE TNT!", "抢到炸药！"), "#ff7a5a", true);
      if (m.p.human) this.say(T("STOLEN! PRESS A", "抢到了！按 A"), "#ff7a5a");
    }
    if (show) SND.bonk();
  }

  /** Dazed for `dur` s (a hop of `hop` m/s: a big one spins and yelps). */
  private stun(m: Miner, dur: number, word: string, color: string, hop: number) {
    if (m.mv < 1) {
      m.x = m.mx1;
      if (m.climb) ((m.y = m.my1), (m.climb = false));
      m.mv = 1;
    }
    m.stun = Math.max(m.stun, dur);
    m.immune = Math.max(m.immune, m.stun + 0.8);
    m.buf = 0;
    m.a.hit();
    m.angryT = 3;
    this.popup(m, word, color, true);
    this.face(m, FACE.hurt, dur);
    if (hop) {
      m.vy = hop;
      m.grounded = false;
    }
    if (hop > 4) m.spin = 13;
    this.fx.burst(this.v.set(m.x, m.y + 1.0, 0.4), 8, ["#ffd23f", "#ffffff"], { speed: 3, up: 3, size: 0.09, life: 0.5 });
    if (m.p.human) {
      this.cam.shake(0.25);
      if (hop > 4) SND.yelp();
      else sfx.hit();
    }
  }

  /** Where a TNT thrown from (c, r) toward f lands: the first open cell up to three over (walls and all), or −1. */
  private lob(c: number, r: number, f: number) {
    for (let k = 1; k <= 3; k++) {
      const cc = c + f * k;
      if (cc < 0 || cc >= COLS) return -1;
      if (this.at(cc, r) === EMPTY) return cc;
    }
    return -1;
  }

  /** A, with a TNT: lobbed the way it faces into the first open cell (over a wall too), or planted underfoot. */
  private useTnt(m: Miner, plant = false) {
    m.tnt--;
    m.since = 0;
    m.swing = 0;
    const tc = plant ? -1 : this.lob(m.c, m.r, m.face);
    const f = this.spawn(F_TNT, tc >= 0 ? tc : m.c, midY(m.r), 0, m.i);
    if (tc >= 0) {
      f.fuse = 5;
      f.row = m.r;
      f.fly = 0;
      f.fx0 = m.x + m.face * 0.3;
      f.fy0 = m.y + 0.9;
      f.x = f.fx0;
      f.y = f.fy0;
      this.stats.tnt++;
      this.popup(m, T("BOMBS AWAY!", "扔炸弹！"), "#ff7a5a");
      this.fx.burst(this.v.set(f.fx0, f.fy0, 0.6), 8, ["#ffd23f", "#ffffff", "#8a8590"], { speed: 2.5, up: 2, size: 0.1, life: 0.45 });
    } else {
      f.planted = true;
      f.row = m.r;
      f.fuse = FUSE;
      f.x = m.x;
      f.y = midY(m.r);
      this.stats.plant++;
      this.popup(m, T("PLANTED!", "埋好了！"), "#ff7a5a");
      this.fx.burst(this.v.set(m.x, footY(m.r) + 0.2, 0.5), 10, ["#ffd23f", "#ff7a1a", "#ffffff"], { speed: 2.5, up: 3, size: 0.08, life: 0.5 });
    }
    if (m.p.human) sfx.whoosh();
  }

  private spawn(kind: number, c: number, y: number, wait: number, owner: number): Faller {
    const f: Faller = { kind, c, x: colX(c), y, vy: 0, wait, fuse: 0, owner, planted: false, row: 0, fly: 1, fx0: 0, fy0: 0, dead: false, mesh: null, rot: Math.random() * 6 };
    if (kind === F_TNT) {
      f.mesh = this.tnts.find((t) => !t.visible) ?? null;
      if (f.mesh) f.mesh.visible = true;
    }
    this.fallers.push(f);
    return f;
  }

  // ---- the world moving ----------------------------------------------------------------------------

  /** Boulders over nothing wobble, then drop; lava over nothing oozes down; lava by an open cell spills into it and cools. */
  private gravity(dt: number) {
    const g = this.g;
    for (let r = ROWS - 1; r >= 0; r--)
      for (let c = 0; c < COLS; c++) {
        const id = c + r * COLS;
        const t = g[id];
        if (t !== BOULDER && t !== LAVA) continue;
        if (r + 1 < ROWS && g[id + COLS] === EMPTY) {
          this.wob[id] += dt;
          if (this.wob[id] >= (t === LAVA ? OOZE : WOB)) {
            g[id] = EMPTY;
            this.wob[id] = 0;
            this.paint(id);
            this.ver++;
            this.spawn(t === LAVA ? F_LAVA : F_BOULDER, c, midY(r), 0, -1);
            if (this.onScreen(midY(r))) (t === LAVA ? SND.sizzle() : SND.crumble());
          }
          continue;
        }
        if (t === LAVA) {
          const side = this.oozeSide(c, r);
          if (side >= 0) {
            this.wob[id] += dt;
            if (this.wob[id] >= SPILL) {
              this.wob[id] = 0;
              const to = side + r * COLS;
              const m = this.minerAt(side, r, null);
              // (it burns whoever is still there and the pocket cools; or it fills the cell and cools there)
              if (m) {
                this.burn(m);
                g[id] = this.lv.pool.cool;
                this.paint(id);
              } else {
                g[to] = this.lv.pool.cool;
                this.paint(to);
                this.fx.burst(this.v.set(colX(side), midY(r), 0.4), 10, this.lv.pool.steam, { speed: 2, up: 3, gravity: -3, size: 0.16, life: 0.8 });
                if (this.onScreen(midY(r))) SND.sizzle();
              }
              this.ver++;
            }
            continue;
          }
        }
        this.wob[id] = 0;
      }
  }
  private oozeSide(c: number, r: number) {
    const l = this.at(c - 1, r) === EMPTY;
    const rt = this.at(c + 1, r) === EMPTY;
    if (l && rt) return this.minerAt(c + 1, r, null) ? c + 1 : c - 1;
    return l ? c - 1 : rt ? c + 1 : -1;
  }

  private burn(m: Miner) {
    this.stats.lava++;
    const P = this.lv.pool;
    this.stun(m, 1.2, T(P.hurt[0], P.hurt[1]), P.hurtC, 6.5);
    this.fx.burst(this.v.set(m.x, m.y + 0.6, 0.4), 18, P.bits, { speed: 4, up: 5, size: 0.13, life: 0.7 });
    if (this.onScreen(m.y)) SND.sizzle();
  }

  private fall(dt: number) {
    for (const f of this.fallers) {
      if (f.dead) continue;
      if (f.kind === F_TNT) {
        f.fuse -= dt;
        if (f.fly < 1) {
          // (the throw: an arc over to its column, nothing hit on the way)
          f.fly = Math.min(1, f.fly + dt / (0.22 + Math.abs(colX(f.c) - f.fx0) * 0.06));
          const k = f.fly;
          f.x = lerp(f.fx0, colX(f.c), k);
          f.y = lerp(f.fy0, midY(f.row), k) + Math.sin(Math.PI * k) * 0.9;
          if (f.fly < 1) continue;
        }
        f.x += (colX(f.c) - f.x) * Math.min(1, dt * 14);
        if (f.fuse <= 0) {
          this.explode(f, f.planted ? f.row + 1 : Math.floor(-f.y));
          continue;
        }
        if (f.planted) continue;
      } else f.x += (colX(f.c) - f.x) * Math.min(1, dt * 14);
      if (f.wait > 0) {
        f.wait -= dt;
        continue;
      }
      // (the row it falls from: a long frame's drop can end inside the block under it, and must not go on through it)
      const r0 = Math.floor(-f.y);
      f.vy = Math.max(f.vy - GF * dt, -VMAX[f.kind]);
      f.y += f.vy * dt;
      for (const m of this.ms) {
        if (m.done || m.i === f.owner) continue;
        if (Math.abs(m.x - f.x) < 0.55 && f.y - 0.42 < m.y + 0.95 && f.y + 0.4 > m.y + 0.1) {
          this.hitBy(f, m);
          break;
        }
      }
      if (f.dead) continue;
      const land = this.settle(f.c, Math.min(r0, Math.floor(-f.y)));
      if (f.y <= midY(land)) {
        f.y = midY(land);
        this.landF(f, land);
      }
    }
    let w = 0;
    for (const f of this.fallers) if (!f.dead) this.fallers[w++] = f;
    else if (f.mesh) f.mesh.visible = false;
    this.fallers.length = w;
  }

  private hitBy(f: Faller, m: Miner) {
    if (f.kind === F_TNT) {
      this.stats.direct++;
      this.explode(f, m.r);
      return;
    }
    f.dead = true;
    if (f.kind === F_LAVA) {
      this.burn(m);
      return;
    }
    if (f.kind === F_BOULDER) this.stats.boulder++;
    else if (f.kind === F_STAL) this.stats.stal++;
    else this.stats.quake++;
    this.stun(m, 1.2, T("OUCH!", "哎哟！"), "#ffd23f", 3);
    this.fx.burst(this.v.set(f.x, f.y, 0.3), 16, ["#a2a9b8", "#6c7384", "#ffffff"], { speed: 5, up: 4, size: 0.18, life: 0.7 });
    if (this.onScreen(m.y)) SND.crumble();
  }

  private landF(f: Faller, row: number) {
    const id = row >= 0 ? f.c + row * COLS : -1;
    const sh = this.onScreen(f.y);
    if (f.kind === F_TNT) {
      this.explode(f, row);
      return;
    }
    f.dead = true;
    if (f.kind === F_BOULDER && id >= 0 && this.g[id] === EMPTY && !this.minerAt(f.c, row, null)) {
      this.g[id] = BOULDER;
      this.slide[id] = 0;
      this.ver++;
      this.fx.burst(this.v.set(f.x, f.y - 0.4, 0.3), 8, ["#c9b48a", "#8a7a5a"], { speed: 2.5, up: 1.5, size: 0.12, life: 0.5 });
      if (sh) sfx.thud();
      return;
    }
    if (f.kind === F_LAVA && id >= 0 && this.g[id] === EMPTY) {
      this.g[id] = this.lv.pool.cool;
      this.paint(id);
      this.ver++;
      this.fx.burst(this.v.set(f.x, f.y, 0.4), 12, this.lv.pool.steam, { speed: 2, up: 4, gravity: -3, size: 0.18, life: 0.9 });
      if (sh) SND.sizzle();
      return;
    }
    this.fx.burst(this.v.set(f.x, f.y, 0.3), 14, ["#a2a9b8", "#7c6aa0", "#6c7384"], { speed: 4, up: 3, size: 0.16, life: 0.6 });
    if (sh) sfx.thud();
  }

  /**
   * A TNT goes off at (c, r): every block round it gone (steel too; a nonce in it goes to the
   * thrower), whoever stands in the middle blown up and dazed long, whoever is next to it shaken.
   */
  private explode(f: Faller, r: number) {
    f.dead = true;
    const c = f.c;
    const owner = f.owner >= 0 ? this.ms[f.owner] : null;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
        const id = cc + rr * COLS;
        if (this.g[id] === EMPTY || this.g[id] === WALL) continue;
        this.breakCell(id, owner, true);
      }
    let human = false;
    for (const m of this.ms) {
      if (m.done || m === owner) continue;
      const d = Math.max(Math.abs(m.c - c), Math.abs(m.r - r));
      if (d > 1) continue;
      this.stats.blastHits++;
      if (m.p.human || owner?.p.human) human = true;
      if (d === 0) this.stun(m, 1.8, T("BOOM!", "轰！"), "#ff7a3c", 7);
      else this.stun(m, 0.9, T("OOF!", "呜！"), "#ffb07a", 3.5);
      if (owner && d === 0) ((owner.cheerT = 0.7), owner.a.cheer(0.7));
    }
    for (const o of this.fallers) {
      if (o === f || o.dead) continue;
      if (Math.abs(o.c - c) <= 1 && Math.abs(Math.floor(-o.y) - r) <= 1) {
        if (o.kind === F_TNT) o.fuse = Math.min(o.fuse, 0.12);
        else o.dead = true;
      }
    }
    for (const st of this.stal) if (st.on && Math.abs(st.c - c) <= 1 && Math.abs(st.r - r) <= 1) st.on = false;
    const at = this.v.set(colX(c), midY(r), 0.6);
    this.fx.burst(at, 46, ["#ff7a1a", "#ffd23f", "#ffffff", "#3a2a20"], { speed: 9, up: 5, size: 0.24, life: 0.9 });
    this.fx.burst(at, 14, ["#5a5560", "#8a8590"], { speed: 2.5, up: 3, gravity: -2, size: 0.4, life: 1.2, drag: 2 });
    const near = this.onScreen(midY(r));
    if (near) (this.cam.shake(human ? 0.5 : 0.25), SND.boom(human ? 1 : 0.6));
    if (human && owner?.p.human) this.say(T("DIRECT HIT!", "正中目标！"), "#ff7a3c");
  }

  /** The cave's stalactites shake when someone is under them, or their roof goes; then drop. */
  private stalactites(dt: number) {
    for (const st of this.stal) {
      if (!st.on) continue;
      if (st.shake > 0) {
        st.shake += dt;
        if (st.shake >= STAL_T) {
          st.on = false;
          this.spawn(F_STAL, st.c, midY(st.r) + 0.15, 0, -1);
        }
        continue;
      }
      let go = this.at(st.c, st.r - 1) === EMPTY;
      for (const m of this.ms) if (!m.done && m.c === st.c && m.r >= st.r && m.r <= st.bot) go = true;
      if (go) {
        st.shake = 0.001;
        this.fx.burst(this.v.set(colX(st.c), -st.r - 0.05, 0.3), 8, this.lv.ice ? ["#ffffff", "#cdeeff"] : SANDS, { speed: 0.8, up: 0, gravity: 9, size: 0.07, life: 0.8 });
        if (this.onScreen(midY(st.r))) SND.crumble();
      }
    }
  }

  /** From 24 s the QUAKE: every few seconds a rock works loose over a leader (sometimes anyone). */
  private quake() {
    const qk = this.lv.quake;
    if (!qk || this.t < this.quakeAt || this.endAt) return;
    if (!this.said.has("quake")) {
      this.said.add("quake");
      this.say(T(qk[0], qk[1]), "#ff9a3c");
      this.cam.shake(0.45);
      SND.rumble();
    }
    this.quakeAt = this.t + lerp(3.4, 2.1, clamp((this.t - QUAKE_T) / 24, 0, 1));
    const live = this.ms.filter((m) => !m.done && m.r >= 3);
    if (!live.length) return;
    const lead = this.leader();
    const m = !lead.done && lead.r >= 3 && this.rnd() < 0.55 ? lead : live[Math.floor(this.rnd() * live.length)];
    // the shaft over it: two open cells at least, the rock from up to four over its head
    let top = m.r - 1;
    let n = 0;
    while (top >= 0 && this.at(m.c, top) === EMPTY && n < 4) (top--, n++);
    if (n < 2) return;
    this.spawn(F_ROCK, m.c, midY(top + 1), LOOSE, -1);
    this.fx.burst(this.v.set(colX(m.c), footY(top), 0.3), 10, ["#c9b48a", "#8a7a5a"], { speed: 1.2, up: 0, gravity: 9, size: 0.1, life: 1 });
    if (this.onScreen(m.y)) (this.cam.shake(0.15), SND.rumble());
  }

  /**
   * The SUNKEN REEF's tide: from its start it comes up from the GENESIS block, faster later on. Under
   * it the air runs down; out of air, a miner gasps (dazed) and gets a little back; an AIR pocket fills it.
   */
  private tide(dt: number) {
    const td = this.lv.tide;
    if (!td) return;
    if (this.t >= td.delay) {
      if (!this.said.has("tide")) {
        this.said.add("tide");
        this.say(T("THE TIDE IS COMING IN!", "涨潮了！"), "#5fd8ff");
        this.say(T("UNDER WATER: GRAB AIR BUBBLES", "水下：抢气泡补气"), "#bff4ff");
        SND.rumble();
      }
      if (this.t >= td.fast && !this.said.has("tide2")) {
        this.said.add("tide2");
        this.say(T("THE TIDE RISES FASTER!", "潮水涨得更快了！"), "#5fd8ff");
      }
      this.tideRow = Math.max(td.top, this.tideRow - (this.t >= td.fast ? td.rate2 : td.rate) * dt);
    }
    const surf = -this.tideRow;
    for (const m of this.ms) {
      const was = m.wet;
      m.wet = !m.done && m.y + 0.8 < surf;
      if (m.wet && !was && this.onScreen(m.y)) this.fx.burst(this.v.set(m.x, m.y + 1, 0.5), 8, ["#e6fbff", "#a8e8ff"], { speed: 1.5, up: 2, gravity: -5, size: 0.1, life: 0.8 });
      if (!m.wet) {
        m.air = Math.min(AIR_MAX, m.air + dt * 2.5);
        if (m.air > 3.5) m.airWarn = false;
        continue;
      }
      m.air -= dt;
      if (m.air <= 0) {
        this.stats.gasp++;
        m.air = GASP_AIR;
        m.airWarn = false;
        this.stun(m, GASP, T("NO AIR!", "没气了！"), "#8af0ff", 2);
        this.fx.burst(this.v.set(m.x, m.y + 1, 0.5), 18, ["#e6fbff", "#a8e8ff", "#ffffff"], { speed: 2, up: 3, gravity: -6, size: 0.14, life: 1.0 });
        if (m.p.human) (this.say(T("OUT OF AIR!", "没气了！"), "#ff7a7a"), beep(300, 120, 0.4, 0.2, "sine"));
      } else if (m.air < 2.2 && !m.airWarn) {
        m.airWarn = true;
        if (m.p.human) (this.say(T("LOW AIR! BREAK A BUBBLE", "快没气了！打破气泡"), "#ff9a7a"), beep(880, 660, 0.12, 0.14), beep(880, 660, 0.12, 0.14));
      }
    }
  }

  /** The miners: a step under way, a fall, a landing (on a rival's head: a stomp), GENESIS. */
  private move(m: Miner, dt: number) {
    if (m.mv < 1) {
      m.mv = Math.min(1, m.mv + dt / m.mvT);
      const k = m.mv * m.mv * (3 - 2 * m.mv);
      m.x = lerp(m.mx0, m.mx1, k);
      if (m.climb) m.y = lerp(m.my0, m.my1, k) + Math.sin(Math.PI * k) * 0.3;
      if (m.mv < 1) return;
      m.x = m.mx1;
      if (m.climb) ((m.y = m.my1), (m.climb = false));
      // (a glide that runs into a rival slams it on along the ice)
      if (m.glide) {
        const f = m.glide;
        m.glide = 0;
        const o = this.minerAt(m.c + f, m.r, m);
        if (o && !this.over && m.stun <= 0 && o.immune <= 0 && o.stun <= 0) {
          this.stats.tackle++;
          this.bonk(m, o, f);
          this.popup(o, T("SLAM!", "撞飞！"), "#8af0ff", true);
          this.fx.burst(this.v.set((m.x + o.x) / 2, m.y + 0.5, 0.5), 12, ["#ffffff", "#bfe8ff", "#8af0ff"], { speed: 4, up: 3, size: 0.1, life: 0.5 });
          if (this.onScreen(m.y)) this.cam.shake(m.p.human || o.p.human ? 0.3 : 0.12);
        }
      }
    }
    if (m.done) {
      m.y = footY(ROWS - 1);
      return;
    }
    if (m.grounded) {
      if (!this.passable(m.c, m.r + 1, m)) return;
      m.grounded = false;
      m.vy = 0;
    }
    // (under the tide a fall is slow: no stomps down there)
    m.vy = m.wet ? Math.max(m.vy - G * 0.5 * dt, -9) : Math.max(m.vy - G * dt, -18);
    m.y += m.vy * dt;
    if (m.vy > 0) {
      // (blown up: no higher than the open cells over it)
      const top = this.at(m.c, m.r - 1) === EMPTY ? footY(m.r) + 1.2 : footY(m.r) + 0.12;
      if (m.y > top) ((m.y = top), (m.vy = 0));
      return;
    }
    while (m.y <= footY(m.r)) {
      if (m.r + 1 < ROWS && this.passable(m.c, m.r + 1, m)) {
        m.r++;
        m.reachT = this.t;
        continue;
      }
      this.landM(m);
      break;
    }
  }

  private landM(m: Miner) {
    const v = -m.vy;
    m.y = footY(m.r);
    m.vy = 0;
    m.grounded = true;
    if (v > 2) m.a.body.land(Math.min(8, v));
    if (v > 9) this.fx.burst(this.v.set(m.x, m.y + 0.05, 0.3), 6, ["#d9c7a4", "#a08a6a"], { speed: 2, up: 1.5, size: 0.08, life: 0.4 });
    const u = this.minerAt(m.c, m.r + 1, m);
    // (a real drop onto a rival: a stomp, a bounce, a TNT taken)
    if (u && v > 10 && u.immune <= 0 && u.stun <= 0) {
      this.stats.stomp++;
      this.stun(u, 0.7, T("STOMP!", "踩！"), "#7dff8a", 0);
      if (u.tnt > 0) ((u.tnt -= 1), (m.tnt = Math.min(2, m.tnt + 1)), (m.tntT = 0), this.stats.steal++, this.popup(m, T("STOLE TNT!", "抢到炸药！"), "#ff7a5a", true));
      m.vy = 6.5;
      m.grounded = false;
      if (m.p.human || u.p.human) SND.bonk();
    }
    if (m.r === ROWS - 1 && m.grounded && !this.over) this.arrive(m);
  }

  /** Onto the GENESIS block. */
  private arrive(m: Miner) {
    m.done = true;
    m.reachT = this.t;
    this.finished.push(m.i);
    m.cheerT = 4;
    m.a.cheer(4);
    m.tnt = 0;
    m.rush = 0;
    m.stun = 0;
    const first = this.finished.length === 1;
    this.fx.burst(this.v.set(m.x, m.y + 0.4, 0.5), first ? 70 : 30, ["#ffd23f", "#fff4c4", "#ffb02e", m.p.color], { speed: 8, up: 10, size: 0.18, life: 1.5 });
    if (first) {
      this.endAt = Math.min(CAP, this.t + GRACE);
      this.say(T(`${short(m.p)} STRUCK GENESIS!`, `${short(m.p)} 挖到创世区块！`));
      this.say(T("LAST CALL!", "最后机会！"), "#ff9a3c");
      this.prize.visible = false;
      sfx.star();
      sfx.coin();
      this.speed();
    } else if (m.p.human) (this.say(T(`${["", "2ND", "3RD", "4TH"][this.finished.length - 1]}!`, `第${this.finished.length}名！`), "#7dff8a"), sfx.coin());
  }

  /** Where every danger will strike, and when: the red glow, and what the AIs run from. */
  private hazards() {
    this.dz.fill(INF);
    this.dzT.fill(INF);
    this.dzO.fill(-1);
    for (let id = 0; id < N; id++) {
      const t = this.g[id];
      if (t !== BOULDER && t !== LAVA) continue;
      const c = id % COLS;
      const r = (id / COLS) | 0;
      if (r + 1 < ROWS && this.g[id + COLS] === EMPTY) this.drop(c, r + 1, (t === LAVA ? OOZE : WOB) - this.wob[id], -1);
      else if (t === LAVA && this.wob[id] > 0) {
        const s = this.oozeSide(c, r);
        if (s >= 0) this.dz[s + r * COLS] = Math.min(this.dz[s + r * COLS], SPILL - this.wob[id]);
      }
    }
    for (const st of this.stal) if (st.on && st.shake > 0) this.drop(st.c, st.r, STAL_T - st.shake, -1);
    for (const f of this.fallers) {
      if (f.dead) continue;
      const r0 = f.fly < 1 ? f.row : Math.floor(-f.y);
      if (f.kind !== F_TNT) this.drop(f.c, r0, Math.max(0, f.wait), -1);
      else if (f.planted) this.zone(f.c, f.row + 1, f.fuse, f.owner);
      else {
        const r = this.drop(f.c, r0, 0, f.owner);
        this.zone(f.c, r, this.dropT, f.owner);
      }
    }
  }
  /** A drop from row r0 down the open cells of column c, starting in t0 s: marks when it gets to each; returns where it lands (and dropT, when). */
  private drop(c: number, r0: number, t0: number, tnt: number) {
    let r = r0;
    for (;;) {
      const k = t0 + Math.sqrt((2 * Math.max(0, r - r0)) / GF);
      if (r >= 0 && r < ROWS) {
        const id = c + r * COLS;
        if (tnt < 0) this.dz[id] = Math.min(this.dz[id], k);
        else if (k < this.dzT[id]) ((this.dzT[id] = k), (this.dzO[id] = tnt));
      }
      if (r + 1 >= ROWS || this.at(c, r + 1) !== EMPTY) {
        this.dropT = k;
        return r;
      }
      r++;
    }
  }
  /** A TNT's blast: the 3 × 3 round (c, r), in t0 s. */
  private zone(c: number, r: number, t0: number, owner: number) {
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
        const id = cc + rr * COLS;
        if (t0 < this.dzT[id]) ((this.dzT[id] = t0), (this.dzO[id] = owner));
      }
  }
  /** How soon m's cell is hit (its own TNT does not count). */
  private threat(m: Miner, c: number, r: number) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return INF;
    const id = c + r * COLS;
    return Math.min(this.dz[id], this.dzO[id] === m.i ? INF : this.dzT[id]);
  }

  // ---- the AI --------------------------------------------------------------------------------------

  private hpush(n: number, k: number) {
    let i = this.hn++;
    const N2 = this.hN;
    const K = this.hK;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= k) break;
      N2[i] = N2[p];
      K[i] = K[p];
      i = p;
    }
    N2[i] = n;
    K[i] = k;
  }
  private hpop() {
    const N2 = this.hN;
    const K = this.hK;
    const top = N2[0];
    const n = N2[--this.hn];
    const k = K[this.hn];
    let i = 0;
    for (;;) {
      let j = i * 2 + 1;
      if (j >= this.hn) break;
      if (j + 1 < this.hn && K[j + 1] < K[j]) j++;
      if (K[j] >= k) break;
      N2[i] = N2[j];
      K[i] = K[j];
      i = j;
    }
    N2[i] = n;
    K[i] = k;
    return top;
  }

  /**
   * The quickest ways down from m (Dijkstra over resting spots: a swing costs its hits, a fall
   * nearly nothing, a block under a boulder or by lava a fright), seen through m's noise.
   */
  private search(m: Miner, B: Brain) {
    const dist = this.dist;
    const fdir = this.fdir;
    dist.fill(INF);
    fdir.fill(0);
    this.hn = 0;
    const start = m.c + (m.r + 1) * COLS;
    dist[start] = 0;
    this.hpush(start, 0);
    const rate = B.rate * (m.rush > 0 ? 0.85 : 1);
    const noise = m.noise;
    const g = this.g;
    const hit = (c: number, r: number) => {
      const id = c + r * COLS;
      const t = g[id];
      let k = (m.rush > 0 ? 1 : HP[t] - this.dmg[id]) * rate * noise[id];
      if (t === HOT) k += 1.8;
      if (r > 0 && (g[id - COLS] === BOULDER || g[id - COLS] === LAVA)) k += 0.9;
      return k;
    };
    const relax = (c: number, r: number, d: number, from: number, dir: number) => {
      const v = c + (r + 1) * COLS;
      if (r >= 0 && Math.min(this.dz[c + r * COLS], this.dzT[c + r * COLS]) < 1.8) d += 2;
      if (d < dist[v]) {
        dist[v] = d;
        fdir[v] = from === start ? dir : fdir[from];
        this.hpush(v, d);
      }
    };
    // (a drop down a shaft with a rival in it lands on its head: the polite ones shy from it)
    const rude = 3.6 * (1 - B.aggro);
    const ms = this.ms;
    const onHead = (c: number, a: number, b: number) => {
      for (const o of ms) if (o !== m && !o.done && o.c === c && o.r > a && o.r <= b) return rude;
      return 0;
    };
    // (a rival standing in the way: a wait, a bump; better to go round)
    const inWay = (c: number, r: number) => {
      for (const o of ms) if (o !== m && !o.done && o.c === c && o.r === r) return 1.1;
      return 0;
    };
    while (this.hn > 0) {
      const u = this.hpop();
      const d = dist[u];
      const c = u % COLS;
      const r = ((u / COLS) | 0) - 1;
      if (r === ROWS - 1) continue;
      if (r + 1 < ROWS) {
        const t = g[c + (r + 1) * COLS];
        if (HP[t] > 0) {
          let r2 = r + 1;
          while (r2 + 1 < ROWS && g[c + (r2 + 1) * COLS] === EMPTY) r2++;
          relax(c, r2, d + hit(c, r + 1) + (r2 - r) * 0.08 + (r2 > r + 1 ? onHead(c, r + 1, r2) : 0), u, 3);
        }
      }
      for (let f = -1; f <= 1; f += 2) {
        const c1 = c + f;
        if (c1 < 0 || c1 >= COLS) continue;
        const t = this.at(c1, r);
        const dd = f < 0 ? 1 : 2;
        if (t === EMPTY) {
          const ce = this.glideTo(c1, r, f, null);
          const r2 = this.settle(ce, r);
          relax(ce, r2, d + MOVE_T + GLIDE_T * Math.abs(ce - c1) + (r2 - r) * 0.08 + (r2 > r ? onHead(ce, r, r2) : 0) + inWay(c1, r), u, dd);
        } else if (HP[t] === 0 && t !== LAVA && r - 1 >= -1 && this.at(c1, r - 1) === EMPTY && this.at(c, r - 1) === EMPTY) relax(c1, r - 1, d + CLIMB_T, u, dd);
        else if (t === BOULDER && this.at(c1 + f, r) === EMPTY) relax(c1, this.settle(c1, r), d + rate + MOVE_T + 0.3, u, dd);
        else if (HP[t] > 0) {
          let r2 = r;
          while (r2 + 1 < ROWS && this.at(c1, r2 + 1) === EMPTY) r2++;
          relax(c1, r2, d + hit(c1, r) + MOVE_T + 0.05, u, dd);
        }
      }
    }
    const rb = this.rowBest;
    rb.fill(INF);
    for (let v = 0; v < NN; v++) {
      const r1 = (v / COLS) | 0;
      if (dist[v] < rb[r1]) rb[r1] = dist[v];
    }
  }

  /** Where m heads next: GENESIS, a nonce worth the detour, or (with a TNT) a rival's open shaft. */
  private route(m: Miner, B: Brain) {
    const P = m.plan;
    const key = m.c + (m.r + 1) * COLS + this.ver * NN + m.rush * 1e8 + m.tnt * 3e8 + (m.wet ? 7e8 : 0) + (m.air < AIR_MAX * 0.5 ? 1.4e9 : 0);
    if (P.key === key && this.t - P.t < 0.35) return P;
    if (this.t >= m.noiseT) {
      m.noiseT = this.t + 1.2;
      for (let i = 0; i < N; i++) m.noise[i] = 1 + B.noise * (this.rnd() - 0.3);
    }
    this.search(m, B);
    const dist = this.dist;
    const rate = B.rate;
    let goal = -1;
    let best = INF;
    for (let c = 0; c < COLS; c++) {
      const v = c + ROWS * COLS;
      if (dist[v] < best) ((best = dist[v]), (goal = v));
    }
    P.hunt = false;
    let atDir = 0;
    // a rival deeper in an open shaft within reach: go to its edge (and A there)
    if (m.tnt > 0)
      for (const o of this.ms) {
        if (o === m || o.done || o.r < m.r + 2 || Math.abs(o.c - m.c) > 4) continue;
        for (let rr = o.r - 1; rr >= Math.max(-1, o.r - 8); rr--) {
          if (this.at(o.c, rr) !== EMPTY) break;
          for (let nc = o.c - 3; nc <= o.c + 3; nc++) {
            if (nc === o.c || nc < 0 || nc >= COLS || this.lob(nc, rr, nc < o.c ? 1 : -1) !== o.c) continue;
            const v = nc + (rr + 1) * COLS;
            if (dist[v] < 2.6 && dist[v] - 9 < best) {
              best = dist[v] - 9;
              goal = v;
              P.hunt = true;
              atDir = 0;
            }
          }
        }
      }
    // a nonce (or, short of air, an AIR pocket) worth the detour
    if (!P.hunt) {
      const airK = this.airNeed(m, B);
      let qBest = 0;
      for (let id = 0; id < N; id++) {
        const gt = this.g[id];
        if (gt !== QB && (gt !== AIR || airK <= 0)) continue;
        const greed = gt === QB ? B.greed : airK;
        const qc = id % COLS;
        const qr = (id / COLS) | 0;
        for (let k = 0; k < 3; k++) {
          const nc = k === 0 ? qc : qc + (k === 1 ? -1 : 1);
          const nr = k === 0 ? qr - 1 : qr;
          if (nc < 0 || nc >= COLS) continue;
          const v = nc + (nr + 1) * COLS;
          if (dist[v] > 4.5) continue;
          const extra = dist[v] + (HP[gt] - this.dmg[id]) * rate - this.rowBest[nr + 1] - greed;
          if (extra < qBest - 0.01) ((qBest = extra), (goal = v), (atDir = k === 0 ? 3 : k === 1 ? 2 : 1));
        }
      }
    }
    const start = m.c + (m.r + 1) * COLS;
    P.dir = goal === start ? atDir : goal >= 0 ? this.fdir[goal] : 3;
    // (stuck: dig down anyway)
    if (!P.dir && !P.hunt) P.dir = 3;
    const tc = P.dir === 3 ? m.c : m.c + (P.dir === 1 ? -1 : 1);
    const tr = P.dir === 3 ? m.r + 1 : m.r;
    const tt = this.at(tc, tr);
    P.hard = P.dir === 3 && (tt === BEDROCK || HP[tt] >= 4 || (HP[tt] >= 3 && HP[this.at(tc, tr + 1)] >= 3));
    P.key = key;
    P.t = this.t;
    return P;
  }

  /** Seconds m would give up for a breath: none while it is dry and the tide is far below; more, the less air it has. */
  private airNeed(m: Miner, B: Brain) {
    if (!this.lv.tide || m.done) return 0;
    if (!m.wet && this.tideRow - m.r > 3) return 0;
    const k = 1 - m.air / AIR_MAX;
    // (the sharp ones see it coming; the dull ones only once they choke)
    const sense = lerp(0.5, 1.15, clamp(1 - B.noise, 0, 1));
    return (0.5 + 3.2 * k * k + (m.air < 2.2 ? 1.6 : 0)) * sense;
  }

  /** Is there a rival under the open cell (c1, m.r)? 2: the TNT drops right on one; 1: it lands by one. */
  private targetBelow(m: Miner, c1: number) {
    if (c1 < 0 || c1 >= COLS || this.at(c1, m.r) !== EMPTY) return 0;
    if (this.minerAt(c1, m.r, m)) return 2;
    let r = m.r;
    while (r + 1 < ROWS && this.at(c1, r + 1) === EMPTY) {
      r++;
      const o = this.minerAt(c1, r, m);
      if (o) return 2;
    }
    if (r === m.r) return 0;
    for (const o of this.ms) if (o !== m && !o.done && Math.abs(o.c - c1) <= 1 && Math.abs(o.r - r) <= 1) return 1;
    return 0;
  }

  /** Out of a danger's way within `tm` s: one or two steps aside. Returns the first step (0: none). */
  private escape(m: Miner, tm: number) {
    const rate = m.brain.rate;
    let bestK = INF;
    let bestD = 0;
    const cost = (c: number, r: number) => {
      const t = this.at(c, r);
      if (t === EMPTY) return MOVE_T;
      if (HP[t] === 0) return INF;
      return (m.rush > 0 ? 1 : HP[t] - this.dmg[c + r * COLS]) * rate + MOVE_T;
    };
    for (let f = -1; f <= 1; f += 2) {
      const d0 = f < 0 ? 1 : 2;
      const c1 = m.c + f;
      if (c1 < 0 || c1 >= COLS || this.minerAt(c1, m.r, m)) continue;
      const k1 = cost(c1, m.r);
      if (k1 > tm) continue;
      const ce = this.at(c1, m.r) === EMPTY ? this.glideTo(c1, m.r, f, m) : c1;
      const r1 = this.settle(ce, m.r);
      if (this.threat(m, ce, r1) > 2.5) {
        if (k1 < bestK) ((bestK = k1), (bestD = d0));
        continue;
      }
      if (ce !== c1) continue;
      const c2 = c1 + f;
      if (c2 < 0 || c2 >= COLS || r1 !== m.r) continue;
      const k2 = k1 + cost(c2, m.r);
      if (k2 > tm) continue;
      if (this.threat(m, c2, this.settle(c2, m.r)) > 2.5 && k2 < bestK) ((bestK = k2), (bestD = d0));
    }
    return bestD;
  }

  /** An AI's (or the scripted visitor's) next move: run, bomb, bonk, or dig its way. */
  private decide(m: Miner, B: Brain) {
    const it = this.intent;
    it.dir = 0;
    it.a = false;
    it.face = 0;
    // a danger over it: seen after a moment (or not at all), then run if it can
    const tm = this.threat(m, m.c, m.r);
    if (tm < 1.6) {
      if (m.notice < 0) {
        m.notice = B.react * (0.6 + this.rnd() * 0.8);
        m.dodgeOk = this.rnd() < B.dodge;
      }
      if (m.notice <= 0 && m.dodgeOk) {
        const d = this.escape(m, tm);
        if (d) {
          it.dir = d;
          return it;
        }
      }
    } else m.notice = -1;
    // a TNT and a rival under the open cell beside: bombs away
    if (m.tnt > 0)
      for (let side = 0; side < 2; side++) {
        const f = side ? -m.face : m.face;
        const tc = this.lob(m.c, m.r, f);
        if (tc < 0) continue;
        const k = this.targetBelow(m, tc);
        if (k === 2 || (k === 1 && this.rnd() < B.aggro * 0.5)) {
          if (this.rnd() < 0.55 + B.aggro * 0.45) {
            it.a = true;
            it.face = f;
            return it;
          }
          break;
        }
      }
    // a rival right beside: a bonk (surely when it carries a TNT)
    for (let f = -1; f <= 1; f += 2) {
      const o = this.minerAt(m.c + f, m.r, m);
      if (o && o.immune <= 0 && o.stun <= 0 && this.rnd() < (o.tnt > 0 ? 0.35 + B.aggro * 0.6 : B.aggro * 0.12)) {
        it.dir = f < 0 ? 1 : 2;
        return it;
      }
    }
    const P = this.route(m, B);
    // a TNT on hard ground, nobody to throw it at: planted
    if (m.tnt > 0 && !P.hunt && (P.hard || m.tntT > 12) && m.r >= 0) {
      it.a = true;
      it.face = 3;
      return it;
    }
    it.dir = P.dir;
    if (this.rnd() < B.wrong) it.dir = 1 + Math.floor(this.rnd() * 3);
    return it;
  }

  private stepAI(m: Miner, dt: number) {
    if (m.p.human || m.done || m.stun > 0) return;
    m.think -= dt;
    if (m.notice > 0) m.notice -= dt;
    if (!m.grounded || m.mv < 1 || m.think > 0) return;
    const B = m.brain;
    const it = this.decide(m, B);
    if (it.a) {
      if (it.face !== 3 && it.face) m.face = it.face;
      if (m.tnt > 0 && m.grounded && m.mv >= 1) this.useTnt(m, it.face === 3);
      m.think = B.think;
      return;
    }
    if (!it.dir) return;
    // (a dazed rival in the way: no use bumping it, wait a moment and think again)
    const o = it.dir === 3 ? this.minerAt(m.c, m.r + 1, m) : this.minerAt(m.c + (it.dir === 1 ? -1 : 1), m.r, m);
    if (o && (o.immune > 0 || o.stun > 0)) {
      m.think = B.think + 0.12;
      m.plan.key = -1;
      return;
    }
    m.want = it.dir;
    m.wantT = 0.35;
    if (this.control(m, it.dir, true, false)) {
      m.buf = 0;
      m.think = B.think * (0.6 + this.rnd() * 0.8);
      if (this.rnd() < B.lapse) m.think += 0.35 + this.rnd() * 0.5;
    }
  }

  /** The visitor's hands: the last arrow pressed wins; a tap swings at once (or as soon as it may). */
  private readHuman(m: Miner, input: Input) {
    let fresh = 0;
    for (let d = 1; d <= 3; d++) if (input.pressed(DIRB[d])) ((fresh = d), (this.lastDir = d));
    let held = 0;
    if (this.lastDir && input.held(DIRB[this.lastDir])) held = this.lastDir;
    else
      for (const d of [3, 1, 2])
        if (input.held(DIRB[d])) {
          held = this.lastDir = d;
          break;
        }
    m.want = held || fresh;
    if (input.pressed("a")) {
      // (A in the middle of a step or a fall: the TNT goes as soon as the feet are down)
      if (m.tnt > 0) {
        if (!this.control(m, 0, false, true) && m.stun <= 0) ((m.buf = BUF_A), (m.bufT = 0.18));
      } else if (!m.done && !this.over) sfx.tick();
    }
    // (a tap that came a moment too early is kept for one go, not more)
    if (fresh) {
      if (this.control(m, fresh, true, false)) m.buf = 0;
      else ((m.buf = fresh), (m.bufT = 0.18));
    } else if (m.buf && m.bufT > 0) {
      if (this.control(m, m.buf === BUF_A ? 0 : m.buf, true, m.buf === BUF_A)) m.buf = 0;
    } else if (held) this.control(m, held, false, false);
  }

  /** The bench's scripted visitor: what a decent player would press now (null: nothing to do yet). */
  bot(i = 0, like?: Partial<Brain>) {
    const m = this.ms[i];
    if (!m || m.done || this.over || m.stun > 0 || !m.grounded || m.mv < 1) return null;
    if (m.notice > 0) m.notice -= 1 / 60;
    const it = this.decide(m, like ? { ...HUMANLIKE, ...like } : HUMANLIKE);
    return { dir: it.dir, a: it.a, face: it.face, tnt: m.tnt, faceNow: m.down ? 3 : m.face };
  }

  // ---- the frame ---------------------------------------------------------------------------------

  update(dt: number, input: Input) {
    if (!this.over) {
      this.t += dt;
      for (const m of this.ms) {
        m.since += dt;
        m.stun = Math.max(0, m.stun - dt);
        m.immune = Math.max(0, m.immune - dt);
        m.bufT -= dt;
        m.tntT += m.tnt > 0 ? dt : 0;
      }
      if (this.human >= 0) this.readHuman(this.ms[this.human], input);
      for (const m of this.ms) this.stepAI(m, dt);
    }
    this.gravity(dt);
    this.refreeze(dt);
    this.fall(dt);
    this.stalactites(dt);
    if (!this.over) (this.quake(), this.tide(dt));
    for (const m of this.ms) this.move(m, dt);
    this.hazards();
    if (!this.over) {
      this.events();
      if (this.finished.length === 4 || (this.endAt > 0 && this.t >= this.endAt) || this.t >= CAP) this.end();
    }
    this.animate(dt);
    this.aim(dt, this.over ? 2.2 : 3.2);
    this.cam.apply(dt);
  }

  /** It is over: those on GENESIS in their order, then the rest by depth (the first to get there first). */
  private end() {
    const rest = this.ms
      .filter((m) => !m.done)
      .sort((a, b) => this.depth(b) - this.depth(a) || a.reachT - b.reachT || a.i - b.i)
      .map((m) => m.i);
    this.over = [...this.finished, ...rest];
    this.winner = this.over[0];
    const w = this.ms[this.winner];
    if (!w.done) {
      w.cheerT = 3;
      w.a.cheer(3);
      this.say(T(`${short(w.p)} DUG DEEPEST!`, `${short(w.p)} 挖得最深！`));
    }
    for (const m of this.ms) if (m !== w) m.angryT = 4;
  }

  private events() {
    const me = this.human >= 0 ? this.ms[this.human] : null;
    if (me && !me.done) {
      const li = this.layerOf(Math.max(0, me.r + 1));
      if (li > this.layerSaid) {
        this.layerSaid = li;
        const msg = this.lv.says[li];
        if (msg) (this.say(T(msg[0], msg[1]), msg[2]), this.fx.burst(this.v.set(me.x, me.y + 0.6, 0.6), 14, [this.layers[li].c, "#ffffff", ...(this.layers[li].shine ?? [])], { speed: 3, up: 3, size: 0.09, life: 0.7 }));
      }
    }
    const cv = this.lv.cave;
    const gl = this.lv.galleries;
    const cs = this.lv.caveSay;
    if (cs && !this.said.has("cave") && this.ms.some((m) => (cv ? m.r >= cv.top && m.r <= cv.bot && m.c >= 3 && m.c <= 7 : !!gl && gl.includes(m.r)))) {
      this.said.add("cave");
      this.say(T(cs[0], cs[1]), cs[2]);
    }
    const lead = this.leader();
    if (!this.said.has("near") && !lead.done && lead.r >= ROWS - 7) {
      this.said.add("near");
      this.say(T("6 TO GENESIS!", "距创世区块 6 格！"), "#ffd23f");
      this.speed();
    }
    if (!this.said.has("hurry") && this.t >= CAP - 10 && !this.endAt) {
      this.said.add("hurry");
      this.say(T("HURRY!", "快！"), "#ff5a5a");
      this.speed();
    }
  }

  private speed() {
    if (this.sped) return;
    this.sped = true;
    music.rate(1.15);
  }

  idle(dt: number, phase: "card" | "count", k: number) {
    if (phase === "card") {
      // the card: up the wall from the GENESIS block to the grass
      const u = ease(clamp(k / 3.2, 0, 1));
      this.cam.set(this.eye.set(lerp(4, 0.5, u), lerp(-33, 0.2, u), lerp(26, FRONT + DIST, u)), this.at3.set(0, lerp(-35, -1.2, u), 0));
    } else this.aim(dt, 2.4);
    this.hazards();
    this.animate(dt);
    this.cam.apply(dt);
  }

  // ---- the look ----------------------------------------------------------------------------------

  /** The camera: the whole width, following the visitor (or the leader) with more room below. */
  private aim(dt: number, k: number) {
    let D = DIST;
    let cy: number;
    let hx = 0;
    if (this.over) {
      const w = this.ms[this.winner];
      // (the winner low in the picture, under the FINISH)
      D = 10.5;
      cy = w.y + 1.7;
      hx = w.x * 0.6;
    } else {
      const f = this.human >= 0 ? this.ms[this.human] : this.leader();
      cy = clamp(f.y - 0.3, -ROWS + 2.6, -1.0);
      hx = f.x * 0.08;
    }
    this.cam.to(this.eye.set(hx, cy + 1.4, FRONT + D), this.at3.set(hx * 0.6, cy, 0), dt, k);
  }

  private animate(dt: number) {
    const now = (this.now += dt);
    for (const m of this.ms) {
      m.swing += dt;
      m.popT += dt;
      m.exprT -= dt;
      m.cheerT -= dt;
      m.angryT -= dt;
      m.wantT -= dt;
      if (!m.p.human && m.wantT <= 0) m.want = 0;
      const a = m.a;
      a.pos.set(m.x, m.y, 0);
      a.grounded = m.grounded;
      a.vy = m.vy;
      a.floor = footY(this.settle(m.c, Math.min(m.r, ROWS - 1)));
      let yaw: number;
      if (m.cheerT > 0 || m.done) yaw = 0;
      else if (m.stun > 0) yaw = m.face * 0.6 + Math.sin(now * 6 + m.i) * 0.5;
      else if (m.down) yaw = m.face * 0.38;
      else yaw = m.face * (m.want ? 1.25 : 0.7);
      a.face(yaw, dt, 12);
      if (m.spin > 0.2) ((a.yaw += m.spin * dt), (m.spin *= Math.exp(-2.5 * dt)));
      else m.spin = 0;
      a.angry = m.angryT > 0;
      const gliding = m.glide !== 0 && m.mv < 1;
      a.legs = m.mv < 1 && !gliding ? 4 : null;
      // ice spray off a glide; bubbles off a miner under the tide
      m.bubT -= dt;
      if (gliding && m.bubT <= 0) ((m.bubT = 0.045), this.fx.burst(this.v.set(m.x - m.glide * 0.2, m.y + 0.06, 0.25), 2, ICE_SPRAY, SPRAY));
      else if (m.wet && m.bubT <= 0) ((m.bubT = 0.3 + Math.random() * 0.35), this.fx.burst(this.v.set(m.x + m.face * 0.15, m.y + 0.95, 0.4), 1 + (m.air < 2.2 ? 2 : 0), BUBBLES, BUBBLE));
      a.sync(dt);
      this.pose(m, dt, now);
      // the block it hits, jolted
      if (m.jolt > 0) {
        m.jolt = Math.max(0, m.jolt - dt * 8);
        const j = m.jolt;
        if (m.hitId >= 0 && this.g[m.hitId] !== EMPTY) this.paint(m.hitId, 1 + 0.06 * j, 1 - 0.1 * j, -0.05 * j);
      }
      // HASH RUSH: the pick burns
      m.pick.material = m.rush > 0 ? glow("#ffb347") : toon("#d9e1ec");
      if (m.rush > 0) {
        m.flameT -= dt;
        if (m.flameT <= 0) {
          m.flameT = 0.06;
          m.pick.getWorldPosition(this.v);
          this.fx.burst(this.v, 2, RUSH_FIRE, FLAME);
        }
      }
      // the crack in the block it is on
      const cm = this.cracks[m.i];
      const id = m.hitId;
      const t = id >= 0 ? this.g[id] : EMPTY;
      const kk = HP[t] > 0 ? this.dmg[id] / HP[t] : 0;
      cm.visible = kk > 0.01 && !m.done;
      if (cm.visible) {
        (cm.material as THREE.MeshBasicMaterial).map = this.crackTex[Math.min(3, Math.floor(kk * 4))];
        cm.position.set(colX(id % COLS), midY((id / COLS) | 0) - 0.05 * m.jolt, 0);
        cm.scale.set(1.0, 1.0, 1.0);
      }
    }
    this.props(dt, now);
    // sand trickles from the cave's crumbly roof; embers off the hot rock
    this.trickle -= dt;
    if (this.trickle <= 0) {
      this.trickle = 0.22;
      const c = 3 + Math.floor(Math.random() * 5);
      const cv = this.lv.cave;
      if (cv && this.at(c, cv.roof) === CRUMB) this.fx.burst(this.v.set(colX(c) + (Math.random() - 0.5) * 0.8, -cv.roof - 1.02, (Math.random() - 0.5) * 0.6), 2, SANDS, TRICKLE);
      for (let k = 0; k < 4; k++) {
        const id = Math.floor(Math.random() * N);
        const t = this.g[id];
        const x = colX(id % COLS);
        const y = midY((id / COLS) | 0);
        if (!this.onScreen(y)) continue;
        if (t === LAVA || t === HOT) this.fx.burst(this.v.set(x, y + 0.3, 0.55), 2, this.sparks, EMBERS);
        else if (t === QB) this.fx.burst(this.v.set(x + (Math.random() - 0.5) * 0.7, y + (Math.random() - 0.5) * 0.7, 0.56), 1, GLINT, TWINKLE);
        else if (t === AIR) this.fx.burst(this.v.set(x + (Math.random() - 0.5) * 0.6, y + 0.3, 0.56), 1, BUBBLES, BUBBLE);
        else if (t === ICE && Math.random() < 0.4) this.fx.burst(this.v.set(x + (Math.random() - 0.5) * 0.8, y + 0.4, 0.56), 1, ICE_SPRAY, TWINKLE);
      }
    }
    // the tide's sheet and foam
    if (this.tideMesh && this.foam) {
      const top = -this.tideRow + Math.sin(now * 2.2) * 0.05;
      const bot = -ROWS - 1.45;
      const vis = top > bot + 0.05;
      this.tideMesh.visible = this.foam.visible = vis;
      if (this.caust && this.caustTex) {
        this.caust.visible = vis;
        if (vis) {
          this.caust.position.set(0, (top + bot) / 2, 0.64);
          this.caust.scale.set(EDGE * 2 + 0.3, top - bot, 1);
          this.caustTex.repeat.set((EDGE * 2) / 4.5, (top - bot) / 4.5);
          this.caustTex.offset.set(Math.sin(now * 0.3) * 0.2, now * 0.06);
        }
      }
      if (vis) {
        this.tideMesh.position.set(0, (top + bot) / 2, 0.62);
        this.tideMesh.scale.set(EDGE * 2 + 0.3, top - bot, 1);
        this.foam.position.set(0, top, 0.3);
        this.foam.scale.set(EDGE * 2 + 0.3, 0.13 + Math.sin(now * 5) * 0.03, 0.7);
      }
    }
    if (this.lvTick) ((this.tk.dt = dt), (this.tk.now = now), (this.tk.camY = this.cam.at.y), (this.tk.tideY = this.tideRow < ROWS ? -this.tideRow : -1e9), this.lvTick(this.tk));
    // (the stage's shadow map sits where the camera looks: on the wall at its height, not on the ground far below)
    this.w.scene.userData.shadowY = this.cam.at.y;
    this.prize.rotation.y += dt * 2.4;
    // gold motes rising off the GENESIS block while it is in sight
    if (this.prize.visible && this.onScreen(-ROWS) && Math.random() < dt * 8) this.fx.burst(this.v.set((Math.random() - 0.5) * 10, -ROWS + 0.05, 0.55), 1, GLINT, GOLD_UP);
    for (const qb of this.qbs) ((qb.rotation.y += dt * 1.2), (qb.position.y = 5.2 + Math.sin(now * 2 + qb.position.x) * 0.15));
    for (const o of this.spin) o.rotation.y += dt * 0.9;
    this.bob?.(now);
    this.glows?.(now);
    this.lavaTex.offset.y = (this.lavaTex.offset.y + dt * 0.12) % 1;
    this.hotMat.emissiveIntensity = 0.75 + Math.sin(now * 3) * 0.25;
    this.fx.update(dt);
    // the banners, one after the other
    if (this.ban) {
      this.ban.t += dt / 1.6;
      if (this.ban.t >= 1) this.ban = null;
    }
    // (one at a time; one that waited too long is stale, dropped)
    while (!this.ban && this.bans.length) {
      const b = this.bans.shift()!;
      if (now - b.at < 2.5) this.ban = { s: b.s, c: b.c, t: 0 };
    }
  }

  /** The things that move on their own: boulders, rocks, lava, stalactites, TNT, the red warnings. */
  private put(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) {
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.m4.compose(this.v.set(x, y, z), this.q, this.sc.set(sx, sy, sz));
    mesh.setMatrixAt(i, this.m4);
  }
  private nb = 0;
  private rock(x: number, y: number, s: number, rot: number, rz: number) {
    if (this.nb >= 48) return;
    this.put(this.bould, this.nb, x, y, 0, s, s * 0.92, s, rot * 0.7, rot, rz);
    this.put(this.bouldInk, this.nb, x, y, 0, s + 0.09, s * 0.92 + 0.09, s + 0.09, rot * 0.7, rot, rz);
    this.nb++;
  }

  private props(dt: number, now: number) {
    const put = this.put.bind(this);
    this.nb = 0;
    let nl = 0;
    let ns = 0;
    for (let id = 0; id < N; id++) {
      const t = this.g[id];
      if (t !== BOULDER && t !== LAVA) continue;
      const c = id % COLS;
      const r = (id / COLS) | 0;
      const w = this.wob[id];
      this.slide[id] *= Math.exp(-dt * 12);
      const sl = this.slide[id];
      const jig = w > 0 ? Math.sin(now * 46 + id) * 0.07 * (0.4 + w / WOB) : 0;
      if (t === BOULDER) this.rock(colX(c) + sl + jig, midY(r) - 0.04, 0.92, id * 1.3 - sl * 2, jig * 3 - sl * 2.5);
      else if (nl < 32) {
        const p = w > 0 ? 1 + Math.sin(now * 30) * 0.05 : 1 + Math.sin(now * 3 + id) * 0.02;
        put(this.lava, nl++, colX(c) + sl, midY(r), 0, 0.96 * p, 0.96 * p, 0.96);
      }
    }
    for (const f of this.fallers) {
      if (f.dead) continue;
      const jig = f.wait > 0 ? Math.sin(now * 50) * 0.07 : 0;
      if (f.kind === F_BOULDER || f.kind === F_ROCK) {
        f.rot += dt * (f.vy < 0 ? 5 : 0);
        this.rock(f.x + jig, f.y, f.kind === F_ROCK ? 0.72 : 0.92, f.rot, jig * 3);
      } else if (f.kind === F_LAVA && nl < 32) put(this.lava, nl++, f.x, f.y, 0, 0.8, 0.9 + Math.min(0.3, -f.vy * 0.03), 0.8);
      else if (f.kind === F_STAL && ns < 12) put(this.stalMesh, ns++, f.x, f.y, 0, 0.42, 0.9, 0.42, Math.PI, 0.6);
      else if (f.kind === F_TNT && f.mesh) {
        const lit = f.planted || f.fuse < 0.9;
        f.mesh.position.set(f.x, f.planted ? footY(f.row) + 0.18 : f.y - 0.05, f.fly < 1 ? 0.75 : 0.12);
        f.mesh.rotation.set(0, 0.4, f.planted ? 0 : Math.sin(now * 9) * 0.25);
        const s = lit ? 1 + Math.max(0, Math.sin(now * (f.fuse < 0.6 ? 40 : 18))) * 0.12 : 1;
        f.mesh.scale.setScalar(s);
        f.mesh.children[1].scale.setScalar(0.12 + Math.random() * 0.1);
      }
    }
    for (const st of this.stal) {
      if (!st.on || ns >= 12) continue;
      const jig = st.shake > 0 ? Math.sin(now * 55 + st.c) * 0.06 : 0;
      put(this.stalMesh, ns++, colX(st.c) + jig, -st.r - 0.42, 0, 0.42, 0.9, 0.42, Math.PI, 0.6);
    }
    this.bould.count = this.bouldInk.count = this.nb;
    this.lava.count = nl;
    this.stalMesh.count = ns;
    for (const m of [this.bould, this.bouldInk, this.lava, this.stalMesh]) m.instanceMatrix.needsUpdate = true;
    // the warnings: every cell something will hit within 1.7 s
    let nw = 0;
    for (let id = 0; id < N && nw < 96; id++) {
      const d = Math.min(this.dz[id], this.dzT[id]);
      if (d > 1.7) continue;
      const s = 0.9 + (1 - d / 1.7) * 0.08;
      put(this.warn, nw++, colX(id % COLS), midY((id / COLS) | 0), 0.55, s, s, 1);
    }
    this.warn.count = nw;
    this.warn.instanceMatrix.needsUpdate = true;
    this.warnMat.opacity = 0.55 + 0.4 * Math.sin(now * 16);
    // a fuse fizzing
    this.fuseT -= dt;
    if (this.fuseT <= 0) {
      this.fuseT = 0.12;
      for (const f of this.fallers)
        if (f.kind === F_TNT && !f.dead && this.onScreen(f.y)) {
          SND.fuse();
          break;
        }
    }
  }

  /** Arms up as the swing winds, down hard on the strike; dazed, a wobble; falling, arms up. */
  private pose(m: Miner, dt: number, t: number) {
    const b = m.a.body;
    const free = m.cheerT > 0;
    b.holdArms(!free);
    if (free) {
      b.root.rotation.x = 0;
      b.root.rotation.z = 0;
      return;
    }
    let target: number;
    let lean: number;
    let kk = 16;
    b.root.rotation.z = m.stun > 0 ? Math.sin(t * 7 + m.i) * 0.16 : 0;
    if (m.stun > 0) ((target = -0.3 + Math.sin(t * 9 + m.i) * 0.2), (lean = 0));
    else if (!m.grounded && m.vy < -3) ((target = -2.6 + Math.sin(t * 16 + m.i) * 0.35), (lean = -0.1));
    else if (m.glide && m.mv < 1) ((target = -1.45), (lean = -0.2), (b.root.rotation.z = -m.glide * 0.22));
    else if (m.swing < 0.09) ((target = -0.5), (lean = 0.24), (kk = 50));
    else if (m.want && !m.done) {
      const rate = m.p.human ? HOLD : m.brain.rate;
      const up = ease(clamp((m.swing - 0.06) / Math.max(0.08, rate - 0.06), 0, 1));
      target = lerp(-0.6, -3.0, up);
      lean = -0.12 * up;
    } else ((target = -0.65), (lean = 0.06));
    m.armX += (target - m.armX) * (1 - Math.exp(-kk * dt));
    m.lean += (lean - m.lean) * (1 - Math.exp(-14 * dt));
    b.armR.rotation.set(m.armX, 0, 0.34);
    b.armL.rotation.set(m.armX, 0, -0.34);
    b.foreArmR.rotation.set(-0.3, 0, 0);
    b.foreArmL.rotation.set(-0.3, 0, 0);
    b.root.rotation.x = m.lean;
    if (m.exprT > 0) b.puppet.motion.expr = m.expr;
    else if (m.stun > 0) b.puppet.motion.expr = FACE.hurt;
    else if (m.rush > 0) b.puppet.motion.expr = FACE.angry;
    else if (this.threat(m, m.c, m.r) < 1.2) b.puppet.motion.expr = FACE.surprised;
  }

  view() {
    return this.w;
  }

  /** The intro: the island whole, afloat over its world; then down the cut face to the GENESIS block. */
  intro(): IntroShot[] {
    return [
      { eye: [17, 13, 38], at: [0, -8, -1], eye2: [10, 3, 31], at2: [0, -6, -1], fov: 50, fov2: 46, w: 1.3 },
      { eye: [5, -5, 22], at: [0, -7, 0], eye2: [3.5, -33, 21], at2: [0, -36.5, 0], fov: 47, fov2: 44, w: 1 },
    ];
  }

  // ---- the HUD -------------------------------------------------------------------------------------

  /** A stick of TNT, drawn flat. */
  private tntIcon(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
    rr(g, x - s * 0.32, y - s * 0.5, s * 0.64, s, s * 0.12);
    g.fillStyle = "#1a1033";
    g.fill();
    rr(g, x - s * 0.26, y - s * 0.44, s * 0.52, s * 0.88, s * 0.1);
    g.fillStyle = "#e3302a";
    g.fill();
    g.fillStyle = "#fff4de";
    g.fillRect(x - s * 0.26, y - s * 0.1, s * 0.52, s * 0.2);
    g.strokeStyle = "#1a1033";
    g.lineWidth = Math.max(1.5, s * 0.08);
    g.beginPath();
    g.moveTo(x, y - s * 0.5);
    g.quadraticCurveTo(x + s * 0.2, y - s * 0.75, x + s * 0.12, y - s * 0.85);
    g.stroke();
    g.fillStyle = "#ffd23f";
    g.beginPath();
    g.arc(x + s * 0.12, y - s * 0.88, s * 0.12, 0, Math.PI * 2);
    g.fill();
  }

  /** The race down the right side: the layers, the steel, the cave, GENESIS, everyone's depth. */
  private gauge(g: CanvasRenderingContext2D) {
    const x = W - 46;
    // (a touch screen: under the stacked panels and clear of the A button)
    const y0 = HUD.thumbs ? 154 : 108;
    const y1 = HUD.thumbs ? 356 : 420;
    const at = (r: number) => y0 + (r / ROWS) * (y1 - y0);
    rr(g, x - 30, y0 - 18, 60, y1 - y0 + 52, 16);
    g.fillStyle = "rgba(12,9,28,0.66)";
    g.fill();
    let a = 0;
    for (const L of this.layers) {
      g.fillStyle = L.c;
      g.fillRect(x - 4, at(a), 8, at(L.to) - at(a));
      a = L.to;
    }
    const cv = this.lv.cave;
    if (cv) {
      g.fillStyle = "#1a1230";
      g.fillRect(x - 4, at(cv.top), 8, at(cv.bot + 1) - at(cv.top));
    }
    g.fillStyle = "#9fe4ff";
    for (const r of this.lv.galleries ?? []) g.fillRect(x - 8, at(r), 16, Math.max(3, at(r + 1) - at(r)));
    g.fillStyle = "#c8ccd8";
    for (const s of this.lv.slabs) g.fillRect(x - 7, at(s), 14, 2.5);
    // the tide coming up the gauge
    if (this.lv.tide && this.tideRow < ROWS) {
      const ty = at(Math.max(0, this.tideRow));
      g.fillStyle = "rgba(40,170,230,0.55)";
      g.fillRect(x - 11, ty, 22, y1 - ty);
      g.fillStyle = "#e6fbff";
      g.fillRect(x - 11, ty - 1, 22, 2);
    }
    g.fillStyle = GOLD;
    g.beginPath();
    g.arc(x, y1 + 14, 12, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#9a6200";
    g.lineWidth = 2;
    g.stroke();
    text(g, "Z", x, y1 + 15, 14, "#7a4a00", "center", 900);
    const offs = [-16, -5, 6, 17];
    const order = [...this.ms].sort((p, q) => (p.p.human ? 1 : 0) - (q.p.human ? 1 : 0));
    for (const m of order) {
      const yy = m.done ? y1 + 14 : at(clamp(this.depth(m), 0, ROWS));
      token(g, m.p, x + offs[m.i], yy, m.p.human ? 10 : 8, { shadow: false, ring: 2 });
    }
  }

  draw(g: CanvasRenderingContext2D) {
    const cam = this.w.camera;
    const now = this.now;
    for (const m of this.ms) {
      const s = toScreen(m.a.head(this.v), cam);
      if (!s.on || s.y < 60 || s.y > H - 20) continue;
      tag(g, m.p, s.x, s.y);
      // what it carries
      if (m.tnt > 0 && !m.done) {
        const ix = s.x + (m.p.human ? 34 : 28);
        this.tntIcon(g, ix, s.y, 18);
        if (m.tnt > 1) shout(g, "×2", ix + 16, s.y + 2, 12, "#ffffff");
      }
      // a danger over it
      const tm = this.threat(m, m.c, m.r);
      if (!m.done && m.stun <= 0 && tm < 1.4) {
        const bob = Math.sin(now * 20) * 2;
        g.beginPath();
        g.arc(s.x, s.y - 30 + bob, 12, 0, Math.PI * 2);
        g.fillStyle = "#ff2a44";
        g.fill();
        g.lineWidth = 2.5;
        g.strokeStyle = "#ffffff";
        g.stroke();
        text(g, "!", s.x, s.y - 29 + bob, 17, "#ffffff", "center", 900);
      }
      // its air, under the tide (or still filling back up)
      if (this.lv.tide && !m.done && (m.wet || m.air < AIR_MAX - 0.05)) this.airBar(g, m, s.x, s.y + (m.p.human ? 17 : 14), m.p.human ? 46 : 34);
      // dazed: stars round its head
      if (m.stun > 0) {
        const h = toScreen(this.v.set(m.x, m.y + 1.05, 0.2), cam);
        for (let k = 0; k < 3; k++) {
          const ang = now * 6 + (k * Math.PI * 2) / 3;
          shout(g, "★", h.x + Math.cos(ang) * 16, h.y + Math.sin(ang) * 5, 13, "#ffd23f");
        }
      }
      if (m.popT < 0.9) {
        g.globalAlpha = clamp((0.9 - m.popT) / 0.3, 0, 1);
        shout(g, m.pop, s.x, s.y - (m.p.human ? 34 : 30) - m.popT * 26, m.popBig ? (m.p.human ? 22 : 17) : m.p.human ? 17 : 14, m.popC);
        g.globalAlpha = 1;
      }
    }
    this.offscreen(g);
    const lead = this.leader();
    corners(
      g,
      this.players,
      this.ms.map((m) => (m.done ? `★${this.finished.indexOf(m.i) + 1}` : `${Math.max(0, m.r + 1)}m`)),
      {
        lead: this.depth(lead) > 0.5 ? [lead.i] : [],
        sub: this.ms.map((m) => (m.done ? T("GENESIS!", "创世！") : m.rush > 0 ? `${T("RUSH", "爆发")} ×${m.rush}` : m.tnt > 0 ? `TNT ×${m.tnt}` : m.stun > 0 ? T("DAZED", "晕了") : m.wet && m.air < 2.2 ? T("LOW AIR", "缺氧") : T(this.layers[this.layerOf(Math.max(0, Math.min(ROWS - 1, m.r + 1)))].en, this.layers[this.layerOf(Math.max(0, Math.min(ROWS - 1, m.r + 1)))].zh))),
      },
    );
    clock(g, this.endAt ? Math.max(0, this.endAt - this.t) : CAP - this.t);
    // (under the clock, which is a little taller on a small screen)
    if (this.endAt && !this.over) text(g, T("LAST CALL", "最后机会"), W / 2, HUD.min ? 74 : 66, 12, "#ffb27a", "center", 900);
    this.gauge(g);
    if (this.human >= 0 && !this.over) this.hand(g, this.ms[this.human]);
    if (this.ban) banner(g, this.ban.s, this.ban.t, this.ban.c, H * 0.2, 40);
  }

  /** A row of bubbles: the air left (red and shaking when it is nearly gone). */
  private airBar(g: CanvasRenderingContext2D, m: Miner, x: number, y: number, w: number) {
    const k = clamp(m.air / AIR_MAX, 0, 1);
    const low = m.air < 2.2;
    const jx = low && m.wet ? Math.sin(this.now * 40) * 1.5 : 0;
    rr(g, x - w / 2 - 3 + jx, y - 5, w + 6, 10, 5);
    g.fillStyle = "rgba(8,20,40,0.75)";
    g.fill();
    rr(g, x - w / 2 + jx, y - 2.5, Math.max(2, w * k), 5, 2.5);
    g.fillStyle = low ? "#ff5a5a" : "#5fd8ff";
    g.fill();
  }

  /** The visitor's item, left of the wall: A and what it does now; the first seconds, the keys. */
  private hand(g: CanvasRenderingContext2D, m: Miner) {
    const x = 84;
    const y = 262;
    rr(g, x - 66, y - 52, 132, 104, 18);
    g.fillStyle = "rgba(12,9,28,0.7)";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = m.tnt > 0 ? "#ff7a5a" : m.rush > 0 ? "#ffb347" : "rgba(255,255,255,0.18)";
    g.stroke();
    if (m.rush > 0) {
      shout(g, T("HASH RUSH", "算力爆发"), x, y - 22, 15, "#ffb347");
      rr(g, x - 46, y + 2, 92, 12, 6);
      g.fillStyle = "rgba(255,255,255,0.15)";
      g.fill();
      for (let k = 0; k < RUSH_N; k++) {
        rr(g, x - 46 + k * 24, y + 2, 20, 12, 5);
        g.fillStyle = k < m.rush ? "#ffb347" : "rgba(255,255,255,0.15)";
        g.fill();
      }
      text(g, T(`next ${m.rush}: 1 hit`, `接下来 ${m.rush} 块一击即碎`), x, y + 32, 11, "#ffffff", "center", 800);
    } else if (m.tnt > 0) {
      // (a touch screen's button shows the throw, not a letter: the same here)
      padBtn(g, "a", x - 34, y - 14, 16, touchy() ? actsOf("dig").a : undefined);
      for (let k = 0; k < m.tnt; k++) this.tntIcon(g, x + 4 + k * 26, y - 10, 30);
      const tc = this.lob(m.c, m.r, m.face);
      const what = tc >= 0 ? (m.face < 0 ? T("◀ THROW", "◀ 扔") : T("THROW ▶", "扔 ▶")) : T("▼ PLANT", "▼ 埋");
      shout(g, what, x, y + 30, 16, "#ff9a7a");
      // where it goes
      const p = toScreen(this.v.set(colX(tc >= 0 ? tc : m.c), tc >= 0 ? midY(m.r) : footY(m.r), 0.55), this.w.camera);
      if (p.on) {
        g.save();
        g.setLineDash([5, 4]);
        g.lineWidth = 2;
        g.strokeStyle = `rgba(255,122,90,${0.6 + Math.sin(this.now * 8) * 0.3})`;
        rr(g, p.x - 18, p.y - 18, 36, 36, 6);
        g.stroke();
        g.restore();
      }
    } else {
      g.globalAlpha = 0.6;
      g.fillStyle = GOLD;
      rr(g, x - 16, y - 36, 32, 32, 5);
      g.fill();
      text(g, "Z", x, y - 19, 20, "#9a6200", "center", 900);
      g.globalAlpha = 1;
      text(g, T("NONCE blocks:", "随机数方块："), x, y + 12, 11, "#ffffff", "center", 800);
      text(g, T("TNT or RUSH", "炸药或爆发"), x, y + 29, 11, "#ffd23f", "center", 800);
    }
    if (this.t < 6) {
      const a = clamp((6 - this.t) / 1.2, 0, 1);
      g.globalAlpha = a;
      // (a touch screen: over the arrows, not under them)
      const hy = overPad(H - 35, 34 * (fpx(14) / 14));
      grow(g, W / 2, hy, 14, () => {
        rr(g, W / 2 - 230, hy - 17, 460, 34, 17);
        g.fillStyle = "rgba(12,9,28,0.78)";
        g.fill();
        text(g, T("◀ ▶ ▼  dig that way · hold, or tap fast", "◀ ▶ ▼ 朝那边挖 · 按住或快速连按"), W / 2, hy, 14, "#ffffff", "center", 800);
      });
      g.globalAlpha = 1;
    }
  }

  /** Rivals out of the picture: a token on the top or bottom edge, and how far. */
  private offscreen(g: CanvasRenderingContext2D) {
    const cy = this.cam.at.y;
    // (a touch screen: the bottom ones stay in the room between the arrows and A, apart from each other)
    const placed: number[] = [];
    for (const m of this.ms) {
      if (m.p.human) continue;
      const above = m.y + 1 > cy + HALF_H - 0.6;
      const below = m.y < cy - HALF_H + 0.3;
      if (!above && !below) continue;
      const s = toScreen(this.v.set(m.x, cy, 0), this.w.camera);
      let x = above ? clamp(s.x, 230, W - 230) : between(clamp(s.x, 230, W - 230), 56);
      if (HUD.thumbs && !above) {
        for (let n = 0; n < 3 && placed.some((p) => Math.abs(p - x) < 60); n++) x = between(x + 60, 56);
        placed.push(x);
      }
      const y = above ? 96 : H - 86;
      token(g, m.p, x, y, 11, { shadow: false, ring: 2 });
      const d = Math.round(Math.abs(m.y - (this.human >= 0 ? this.ms[this.human].y : cy)));
      shout(g, `${above ? "▲" : "▼"}${d}m`, x, y + (above ? 22 : -22), 12, m.p.color);
    }
  }

  result() {
    return this.over;
  }

  dispose() {
    for (const m of this.ms) m.a.dispose();
    disposeScene(this.w.scene);
    for (const tx of this.crackTex) tx.dispose();
    this.pickGeo.dispose();
    this.rockGeo.dispose();
  }
}

export const DIG: MiniDef = {
  key: "dig",
  title: "PROOF OF DIG",
  titleZh: "挖矿证明",
  tag: "First to dig down to the GENESIS block wins: a sunny meadow, an ice cave under Central Park, a sunken reef off Marina Bay",
  tagZh: "第一个挖到创世区块者胜：晴天草地、中央公园地下冰洞、滨海湾外的沉没珊瑚礁",
  help: "◀ ▶ ▼ dig (tap fast to dig faster). NONCE blocks give TNT: A lobs it over the wall, down a rival's shaft. Red = run!",
  helpZh: "◀ ▶ ▼ 挖掘（连按挖得更快）。随机数方块给炸药：按 A 越墙扔进对手的矿井。红色 = 快躲！",
  pad: ["left", "right", "down", "a"],
  tap: false,
  color: "#ffb02e",
  song: "funk",
  ambience: "meadow",
  variants: DIG_LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `dig-${l.key}`, ...(l.song ? { song: l.song } : {}), ambience: l.ambience })),
  make: (players, rnd, variant) => new Dig(players, rnd, DIG_LEVELS.find((l) => l.key === variant) ?? DIG_LEVELS[Math.floor(rnd() * DIG_LEVELS.length) % DIG_LEVELS.length]),
};

export default DIG;
