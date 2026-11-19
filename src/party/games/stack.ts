/**
 * CHAIN STACK (区块叠叠高): the tallest chain wins. Four floating pads high over ZStreet, chained
 * together, and on each a chain of blocks rising from its GENESIS block. Each snark rides a little
 * mining rig over its own tower; the rig carries the next block in its claw, sliding it from side to
 * side. A drops it.
 *
 * Whatever hangs over the edge of the tower is sliced off and tumbles down past the city, so the
 * next block is that much narrower. A PERFECT drop (dead on, within a hand's width) keeps the size,
 * flashes and brings the next block a little sooner; from the third PERFECT in a row each one grows
 * the block back a little. A block dropped clean off the tower falls whole: the block is lost and the
 * rig spins a moment. The slot the block will land in glows brighter as the block comes over it.
 *
 * The chain's flavour: every block wears its height (and the player's own zkSNARK sigil); every 12 s
 * comes "BLOCK FOUND!", and each rig's next block is a golden Z-Block, three units tall (+3), that
 * lands whole and wide again if it lands on the tower at all; every sixth block is a heavy ORCHARD
 * slab, two units tall, that hangs on a cable and swings wider and faster through the middle.
 * B sends a REORG puff (telegraphed: it flies a moment) at the tallest rival: their NEXT block slides
 * faster and wider. A tower just reorged is FINALIZED for a few seconds (no stun-locks), and a REORG
 * never takes a block away. Escalation: the slider speeds up with the height, wind gusts sway the
 * towers and push the sliders after 25 s, and HURRY! for the last 10 s.
 *
 * At the bell the camera drops to the pads and a scan line climbs all four chains at once, the
 * heights counting up, each tower's number popping as the line passes its top. The tallest chain
 * wins; a tie goes to more PERFECTs.
 *
 * The AI: a drop timed with a jitter by skill (a tourist slices badly and sometimes misses; a pro hits
 * PERFECTs often but not always), a hesitation now and then (it lets a pass go by), shakier under a
 * REORG, in the wind and in the hurry; it sends REORGs more often, and better timed, with skill.
 *
 * Coordinates: the towers stand in a row along x (world), the camera looks down −z at them; y up,
 * the pads' tops at y = 0.
 *
 * Three levels (LEVELS below; their sets in stack-levels/): ZSTREET SKYLINE (the pads over the city
 * on a blue day, the wind after 25 s), ORBIT (station modules over the Earth: a block let go keeps
 * its slide while it floats down, a landing light on the top shows where; at 25 s the gravity drops)
 * and STORM AT SEA (four cargo ships rolling: each tower leans with its deck, its top swinging under
 * the rig, the glowing slot following it; at 25 s the storm breaks and they roll harder).
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { GLACIER, LILAC, sealOf } from "../theme";
import { FONT, H, W, backOut, clamp, easeOut, grow, lerp, rankBy, rng, rr, sfx, shout, sound, text, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { music, type SongKey } from "../music";
import { orbitSet } from "./stack-levels/orbit";
import { seaSet } from "./stack-levels/sea";
import { skylineLife } from "./stack-levels/skyline";
import type { StackCtx, StackLive } from "./stack-levels/types";
import { Avatar, CamRig, Fx3, GEO, banner, canvasTex, clock, corners, disposeScene, glow, label, outline, qBlock, short, tag, toScreen, toon, toonSteps, world } from "../k3";
import { INK, numeral, padBtn, tint, touchy, toy } from "../hud";
import { actsOf } from "../acts";
import type { AmbienceKind } from "../../audio/kinds";

// ---- the rules -----------------------------------------------------------------------------------

/** The play time (s); the wind from WIND_AT; HURRY! for the last 10 s; a block found every 12 s. */
const TIME = 45;
const WIND_AT = 25;
const HURRY_AT = TIME - 10;
const FOUND_EVERY = 12;
/** The end: "TIME!" held, the count, a beat on the winner (s). */
const TIME_HOLD = 1.0;
const TALLY_T = 4.6;
const WIN_HOLD = 0.9;
/** A unit of height (m), a fresh block's width (x) and every block's depth (z). */
const BH = 0.5;
const W0 = 2.4;
const DEP = 2.4;
/** A sliver thinner than this falls; the PERFECT window (m); the regrowth per PERFECT from the third in a row. */
const MINW = 0.2;
const PERF = 0.13;
const GROW = 0.24;
/** A Z-Block lands whole while its middle is over the tower (this much grace past the edge). */
const Q_GRACE = 0.3;
/** The slider: its half path from the top's middle (m); its speed (m/s) by height, and the cap. */
const AMP = 2.3;
const V0 = 2.7;
const VK = 0.055;
const VMAX = 5.6;
const HURRY_V = 1.08;
/** The heavy slab: every Nth block; its path and its speed through the middle. */
const HEAVY_EVERY = 6;
const HEAVY_A = 1.2;
const HEAVY_V = 1.15;
/** The block's bottom over the tower's top while it slides (m); the claw; the heavy slab's cable. */
const GAP = 0.85;
const CLAW = 0.36;
const CABLE = 0.5;
/** After a landing, the next block (s); a miss's spin (s); the fall. */
const RELOAD = 0.32;
/** After a PERFECT the next block comes quicker: a clean chain runs faster. */
const RELOAD_PERF = 0.2;
const STUN_T = 1.0;
const DROP_V = 5;
const DROP_G = 45;
/** REORG: its cooldown, its flight, the target's immunity after one, and what it does to the next block. */
const REORG_CD = 9;
const REORG_FLY = 0.75;
const REORG_IMMUNE = 4;
const REORG_V = 1.45;
const REORG_A = 1.3;
const REORG_FIRST = 3;
/** The AI by skill (tourist → pro): its timing jitter (s), a flub's chance, a hesitation's, how much the wind shakes it. */
const AI_SIG0 = 0.085;
const AI_SIG1 = 0.036;
const AI_FLUB0 = 0.05;
const AI_FLUB1 = 0.008;
const AI_HES0 = 0.14;
const AI_HES1 = 0.04;
const AI_WIND = 0.3;
/** The wind: a gust's length (s) and push (m), growing. */
const GUST_T = 2.6;
/** The pads: left to right, the seats (you second from the left), their spacing. */
const COLS = [2, 0, 1, 3];
const SPACE = 8.2;
const TX = [0, 1, 2, 3].map((s) => (COLS.indexOf(s) - 1.5) * SPACE);
/** The towers' blocks (each), and the sway's reference height (m). */
const MAXB = 90;
const REF = 20;

const HOLD = 0;
const DROP = 1;
const WAIT = 2;
const STUN = 3;

const NORMAL = 0;
const HEAVY = 1;
const QB = 2;
const GENESIS = 3;

const INK3 = 0x15101f;
const QCOL = "#ffcf2e";
const GEN_COL = "#3a3358";
const MILES = [10, 20, 30, 40, 50, 60, 70];

/** The REORG puff's trail. */
const TRAIL_C = [LILAC, "#ffffff"];
const TRAIL_O = { speed: 1, up: 0.5, size: 0.14, life: 0.45, gravity: 2 };

const LAB = typeof location !== "undefined" && /partylab/.test(location.pathname);

/**
 * A level: its sky, what turns up at 25 s (the wind, a gravity drop, the storm), its pads (hex modules
 * of this colour; none: its set gives the towers their bases), its clouds, its twist (a floating drop,
 * the decks rolling), how much shakier the AIs are here, its set (none: the city's, built here).
 */
interface Level {
  key: string;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  song: SongKey;
  ambience: AmbienceKind;
  sky: [string, string];
  fog: [number, number];
  late: "wind" | "gravity" | "storm";
  pad: string | null;
  clouds: string | null;
  /**
   * A block let go keeps some of its slide (k, capped: the landing spot always within the path's
   * reach) while it floats down: its first speed down, the gravity before and after 25 s.
   */
  float?: { v0: number; g: number; g2: number; k: number; cap: number };
  /** The decks roll: the swing (rad) from calm to the storm's height, the period (s). */
  roll?: { a0: number; a1: number; period: number };
  aiK: number;
  set?: (c: StackCtx) => StackLive;
}

const LEVELS: Level[] = [
  {
    key: "skyline",
    title: "ZSTREET SKYLINE",
    titleZh: "ZStreet 天际线",
    tag: "High over ZStreet on a blue day. The wind gets up after 25 s.",
    tagZh: "晴天里高悬 ZStreet 之上。25 秒后起风。",
    song: "funk",
    ambience: "city-day",
    sky: ["#3f9dff", "#d6f1ff"],
    fog: [60, 300],
    late: "wind",
    pad: "#463e6e",
    clouds: "#ffffff",
    aiK: 1,
  },
  {
    key: "orbit",
    title: "ORBIT",
    titleZh: "轨道",
    tag: "Over the Earth: a dropped block keeps its slide while it floats down. Drop on the landing light!",
    tagZh: "地球上空：落下的方块会带着滑动速度慢慢飘落。对准落点光标！",
    song: "neon",
    ambience: "space",
    sky: ["#04031a", "#1c1658"],
    fog: [500, 1600],
    late: "gravity",
    pad: "#c9cfdc",
    clouds: null,
    float: { v0: 1.0, g: 9, g2: 6, k: 0.6, cap: 2.4 },
    aiK: 1.08,
    set: orbitSet,
  },
  {
    key: "sea",
    title: "STORM AT SEA",
    titleZh: "海上风暴",
    tag: "Four ships rolling in a gale: your tower leans with the deck. Drop when the top swings under you!",
    tagZh: "四艘船在大风中摇晃：你的塔随甲板倾斜。等塔顶摆到下方再落！",
    song: "hero",
    ambience: "storm",
    sky: ["#141a2e", "#5b6782"],
    fog: [70, 260],
    late: "storm",
    pad: null,
    clouds: "#8a94a8",
    roll: { a0: 0.032, a1: 0.068, period: 3.6 },
    aiK: 1.1,
    set: seaSet,
  },
];

interface Blk {
  /** Its x range (from the tower's axis), its bottom and height (units), its kind, the number it wears. */
  x0: number;
  x1: number;
  y: number;
  hu: number;
  kind: number;
  num: number;
  color: THREE.Color;
}

interface Rig {
  i: number;
  p: Player;
  a: Avatar;
  /** The chain: its height (units, the score), the top's middle (from the axis) and width. */
  h: number;
  cx: number;
  w: number;
  blk: Blk[];
  spawned: number;
  perf: number;
  streak: number;
  best: number;
  miss: number;
  /** The block in hand: its state and time in it, kind, width, units. */
  st: number;
  stT: number;
  kind: number;
  bw: number;
  hu: number;
  /** Its motion: the phase, its rate, the half path, the speed through the middle, the side it set off from, a pendulum's or a ping-pong's. */
  ph: number;
  om: number;
  amp: number;
  vc: number;
  side: number;
  sine: boolean;
  /** Where it is: along its path (from the top's middle), with the wind (`x`), its heading, how far past the middle (`e`, along the heading). */
  base: number;
  x: number;
  dir: number;
  e: number;
  pe: number;
  reorg: boolean;
  reorgNext: boolean;
  qNext: boolean;
  /** The fall: the block's bottom over the top (m), its speed; where it was let go. */
  fy: number;
  fvy: number;
  dropX: number;
  zipFrom: number;
  /** The AI: where along its pass it lets go (m past the middle), passes it lets by, its next thought about B. */
  plan: number;
  skip: number;
  thinkB: number;
  /** REORG: the cooldown, the FINALIZED time left, a puff on its way to it. */
  cd: number;
  immune: number;
  incoming: number;
  /** A floating drop's slide (m/s along x), kept while it falls. */
  vxd: number;
  /** The look: the rig's height and x (world), its tilt, the new block's pop, the top's bounce and flash. */
  dy: number;
  dxw: number;
  vx: number;
  tilt: number;
  pop: number;
  squash: number;
  flash: number;
  /** A Z-Block's snap to the middle (m left to go). */
  snap: number;
  sw: number;
  swv: number;
  floorPrev: number;
  angryT: number;
  faceT: number;
  faceYaw: number;
  /** The tally: the height shown, topped out. */
  shown: number;
  topped: boolean;
  bump: number;
  // the rig's meshes
  drone: THREE.Group;
  rotors: THREE.Mesh[];
  cable: THREE.Mesh;
  shield: THREE.Mesh;
  ghost: THREE.Mesh;
  under: THREE.Mesh;
  /** Where a floating drop would come down now (a light on the top, and its path down to it). */
  mark: THREE.Mesh;
  path: THREE.Mesh;
}

interface Piece {
  on: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  rz: number;
  wx: number;
  wz: number;
  sx: number;
  sy: number;
  t: number;
}

interface Puff {
  on: boolean;
  from: number;
  to: number;
  t: number;
  m: THREE.Mesh;
}

interface Pop {
  x: number;
  y: number;
  z: number;
  s: string;
  c: string;
  t: number;
  big: boolean;
}

interface Say {
  s: string;
  c: string;
  t: number;
  dur: number;
  size: number;
  y: number;
}

interface Gust {
  t0: number;
  dir: number;
  k: number;
}

// ---- sound ---------------------------------------------------------------------------------------

function beep(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}
/** The PERFECT notes, climbing with the streak. */
const NOTES = [523, 587, 659, 784, 880, 1046, 1175, 1318, 1568, 1760];

// ---- the decal atlas: the heights, the sigils, the words -----------------------------------------

const AT = 1024;
/** A cell of the atlas as a uv rectangle (u0, v0, du, dv) from its pixel box. */
const cellUv = (px: number, py: number, pw: number, ph: number): [number, number, number, number] => [px / AT, 1 - (py + ph) / AT, pw / AT, ph / AT];
/** Height n (0…99): 128 × 64, eight to a row. */
const numCell = (n: number) => cellUv((n % 8) * 128, Math.floor(n / 8) * 64, 128, 64);
const SIG_CELL = (s: number) => cellUv(s * 64, 13 * 64, 64, 64);
const MLDSA_CELL = cellUv(256, 13 * 64, 256, 64);
const GENESIS_CELL = cellUv(512, 13 * 64, 256, 64);
const Q_CELL = cellUv(0, 14 * 64, 128, 128);
const REORG_CELL = cellUv(128, 14 * 64, 256, 64);
const NUM_CELLS = Array.from({ length: 100 }, (_, n) => numCell(n));
const SIG_CELLS = [0, 1, 2, 3].map(SIG_CELL);

function paintAtlas(g: CanvasRenderingContext2D, sigils: number[][][]) {
  g.clearRect(0, 0, AT, AT);
  g.lineJoin = "round";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const word = (s: string, cx: number, cy: number, size: number, maxW: number) => {
    g.font = `900 ${size}px ${FONT}`;
    const fit = Math.min(size, (size * maxW) / Math.max(1, g.measureText(s).width));
    g.font = `900 ${fit}px ${FONT}`;
    g.lineWidth = fit * 0.22;
    g.strokeStyle = INK;
    g.strokeText(s, cx, cy + 2);
    g.fillStyle = INK;
    g.fillText(s, cx, cy + 3);
    g.fillStyle = "#ffffff";
    g.fillText(s, cx, cy);
  };
  for (let n = 0; n < 100; n++) word(String(n), (n % 8) * 128 + 64, Math.floor(n / 8) * 64 + 33, 48, 108);
  // the four sigils (7 × 7, mirrored): an ink edge, then white
  for (let s = 0; s < 4; s++) {
    const sig = sigils[s];
    const cs = 7.4;
    const ox = s * 64 + 32 - 3.5 * cs,
      oy = 13 * 64 + 32 - 3.5 * cs;
    g.fillStyle = INK;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (sig[y][x]) g.fillRect(ox + x * cs - 1.6, oy + y * cs - 1.6, cs + 3.2, cs + 3.2);
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        if (!sig[y][x]) continue;
        g.fillStyle = sig[y][x] === 2 ? "#ffffff" : "rgba(255,255,255,0.88)";
        g.fillRect(ox + x * cs + 0.4, oy + y * cs + 0.4, cs - 0.8, cs - 0.8);
      }
  }
  word("ORCHARD", 256 + 128, 13 * 64 + 33, 40, 236);
  word("GENESIS", 512 + 128, 13 * 64 + 33, 44, 236);
  word("REORG", 128 + 128, 14 * 64 + 33, 44, 236);
  // the Z-Block's face: a rim, rivets, the big Z
  const qx = 0,
    qy = 14 * 64;
  g.strokeStyle = "rgba(122,74,0,0.9)";
  g.lineWidth = 7;
  g.beginPath();
  g.roundRect(qx + 8, qy + 8, 112, 112, 16);
  g.stroke();
  g.fillStyle = "rgba(122,74,0,0.9)";
  for (const [x, y] of [
    [22, 22],
    [106, 22],
    [22, 106],
    [106, 106],
  ]) {
    g.beginPath();
    g.arc(qx + x, qy + y, 5, 0, Math.PI * 2);
    g.fill();
  }
  g.font = `900 86px ${FONT}`;
  g.fillStyle = "rgba(122,74,0,0.95)";
  g.fillText("Z", qx + 67, qy + 70);
  g.fillStyle = "#fff8de";
  g.fillText("Z", qx + 63, qy + 65);
}

// ---- small helpers -------------------------------------------------------------------------------

/** A ping-pong "cosine": 1 at 0, −1 at π, 1 at 2π, straight lines between. */
function tcos(u: number) {
  return u < Math.PI ? 1 - (2 * u) / Math.PI : -3 + (2 * u) / Math.PI;
}
const TAU = Math.PI * 2;

// ---- the game ------------------------------------------------------------------------------------

class Stack implements Mini {
  readonly w: ReturnType<typeof world>;
  private L: Level;
  private live: StackLive | null = null;
  /** The decks' roll now (rad), each ship's phase and period; the storm (0…1); the lightning. */
  private rolls = [0, 0, 0, 0];
  private rollPh = [0, 0, 0, 0];
  private rollP = [1, 1, 1, 1];
  private storm = 0;
  private flash = 0;
  private boltAt = 6;
  /** A floating drop's gravity now. */
  private fallG = DROP_G;
  private R: Rig[];
  private fx: Fx3;
  private cam: CamRig;
  /** The phase: before GO, playing, "TIME!", the count, the winner, over. */
  private ph: "pre" | "play" | "time" | "tally" | "win" = "pre";
  private t = 0;
  private pt = 0;
  private clk = 0;
  private over: number[] | null = null;
  private final: number[] = [0, 1, 2, 3];
  private human: number;
  private found = 0;
  private hurry = false;
  private windOn = false;
  private miles = 0;
  private gusts: Gust[] = [];
  private wind = 0;
  private warn = 0;
  private scan = 0;
  private scanMax = 0;
  private tick = 0;
  private flashHud = 0;
  private hurt = 0;
  private lastDt = 0;
  // the instanced blocks, their ink, their decals; the falling pieces
  private body: THREE.InstancedMesh;
  private ink: THREE.InstancedMesh;
  private dec: THREE.InstancedMesh;
  private decCell: THREE.InstancedBufferAttribute;
  private pieces: Piece[] = [];
  private pBody: THREE.InstancedMesh;
  private pInk: THREE.InstancedMesh;
  private nextPiece = 0;
  private clouds: THREE.InstancedMesh;
  private cloudData: { x: number; y: number; z: number; sx: number; sy: number; sz: number; v: number }[] = [];
  private streaks: THREE.InstancedMesh;
  private streakData: { x: number; y: number; z: number; l: number }[] = [];
  private bands: THREE.InstancedMesh;
  private bandLit = new Float32Array(MILES.length);
  private scanBar: THREE.Mesh;
  private puffs: Puff[] = [];
  private pops: Pop[] = [];
  private says: Say[] = [];
  private props: THREE.Object3D[] = [];
  private thrusters: THREE.Mesh[] = [];
  private vals = ["0", "0", "0", "0"];
  private subs = ["", "", "", ""];
  private lead: number[] = [];
  private hook: Record<string, unknown> | null = null;
  // scratch (no allocations per frame)
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q0 = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();
  private white = new THREE.Color("#ffffff");
  private lilac = new THREE.Color(LILAC);

  constructor(
    private players: Player[],
    private rnd: Rnd,
    level: Level,
  ) {
    this.L = level;
    this.w = world({ sky: level.sky, fog: level.fog });
    const s = this.w.scene;
    this.human = players.findIndex((p) => p.human);
    // (the sun straight in front and high: a block's shadow falls dead under it, on the tower's top and
    // down its face: where it is over the tower reads in its shadow too)
    this.w.sun.position.set(-4, 44, 32);
    if (level.float) this.fallG = level.float.g;
    for (let i = 0; i < 4; i++) ((this.rollPh[i] = rnd() * Math.PI * 2), (this.rollP[i] = (level.roll?.period ?? 1) * (0.86 + 0.28 * rnd())));

    // ---- the city far below, the sky round it (or the level's own set)
    const sctx = { scene: s, hemi: this.w.hemi, sun: this.w.sun, rnd, ink: new THREE.MeshBasicMaterial({ color: INK3, side: THREE.BackSide }), players, tx: TX };
    // (a set dresses with dice of its own: the same view every time, none of the game's)
    if (level.set) this.live = level.set(sctx);
    else {
      this.live = skylineLife({ ...sctx, rnd: rng(0x5c11) });
      // (the old ring of 76 towers drew five of the game's dice each here: the same draws, so a seed plays as it did)
      for (let k = 0; k < 76 * 5; k++) rnd();
    }

    // ---- the four pads (chained together over the city)
    const hex = new THREE.CylinderGeometry(2.25, 1.9, 0.8, 6);
    const plate = new THREE.CylinderGeometry(2.05, 2.05, 0.12, 6);
    for (let i = 0; i < 4 && level.pad; i++) {
      const p = players[i];
      const x = TX[i];
      const padBody = new THREE.Mesh(hex, toon(level.pad));
      padBody.position.set(x, -0.46, 0);
      padBody.rotation.y = Math.PI / 6;
      outline(padBody, 0.05, INK3);
      const top = new THREE.Mesh(plate, toon(tint(p.color, 0.1)));
      top.position.set(x, -0.04, 0);
      top.rotation.y = Math.PI / 6;
      // a ring of the seat's colour round the plate, and a thruster's glow under the pad
      const rim = new THREE.Mesh(GEO.ring, glow(p.color, 0.85));
      rim.rotation.x = -Math.PI / 2;
      rim.scale.setScalar(5.6);
      rim.position.set(x, -0.9, 0);
      const thr = new THREE.Mesh(GEO.cone, glow(tint(p.color, 0.35), 0.55));
      thr.rotation.x = Math.PI;
      thr.scale.set(1.2, 1.8, 1.2);
      thr.position.set(x, -1.75, 0);
      this.thrusters.push(thr);
      s.add(padBody, top, rim, thr);
    }
    // the chain between the pads (instanced links, a gentle sag)
    if (!level.set) {
      const link = new THREE.TorusGeometry(0.34, 0.1, 6, 14);
      const nL = 3 * 7;
      const links = new THREE.InstancedMesh(link, toon("#8d86b8"), nL);
      let k = 0;
      for (let gap = 0; gap < 3; gap++) {
        const xa = TX[COLS[gap]] + 2.05,
          xb = TX[COLS[gap + 1]] - 2.05;
        for (let j = 0; j < 7; j++) {
          const u = (j + 0.5) / 7;
          const x = lerp(xa, xb, u);
          const y = -0.75 - Math.sin(u * Math.PI) * 0.7;
          this.e.set(j % 2 ? Math.PI / 2 : 0, 0, 0);
          this.m.compose(this.p.set(x, y, 0), this.q.setFromEuler(this.e), this.s.set(1, 1, 1));
          links.setMatrixAt(k++, this.m);
        }
      }
      links.frustumCulled = false;
      s.add(links);
    }

    // ---- the height bands behind the row (10, 20, 30 …), with their numbers
    this.bands = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: GLACIER, transparent: true, opacity: 0.5, depthWrite: false }), MILES.length);
    this.bands.frustumCulled = false;
    for (let k = 0; k < MILES.length; k++) {
      const y = (MILES[k] + 1) * BH;
      this.m.compose(this.p.set(0, y, -DEP / 2 - 0.9), this.q0, this.s.set(SPACE * 4.1, 0.07, 0.07));
      this.bands.setMatrixAt(k, this.m);
      this.bands.setColorAt(k, this.c.set(GLACIER));
      for (const sx of [-1, 1]) {
        const l = label(String(MILES[k]), 0.62, "#ffffff", "rgba(26,16,51,0.55)");
        l.position.set(sx * (SPACE * 2.05 + 1.4), y, -DEP / 2 - 0.9);
        s.add(l);
      }
    }
    s.add(this.bands);
    // the count's scan line
    this.scanBar = new THREE.Mesh(GEO.box, glow("#ffffff", 0.85, true));
    this.scanBar.scale.set(SPACE * 4.2, 0.09, 0.09);
    this.scanBar.position.z = DEP / 2 + 0.3;
    this.scanBar.visible = false;
    s.add(this.scanBar);

    // ---- clouds (one instanced draw): some below the pads, most up where the towers will climb
    this.clouds = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ color: level.clouds ?? "#ffffff", emissive: level.clouds && level.clouds !== "#ffffff" ? 0x2a3040 : 0x4a5670, gradientMap: toonSteps() }), 90);
    this.clouds.frustumCulled = false;
    let ci = 0;
    for (let n = 0; n < 22 && ci < 86 && level.clouds; n++) {
      const low = n < 6;
      const x = (rnd() - 0.5) * 110;
      const y = low ? -20 - rnd() * 16 : 4 + n * 2.6 + rnd() * 4;
      const z = low ? -34 - rnd() * 60 : -22 - rnd() * 44;
      const parts = 3 + Math.floor(rnd() * 2);
      const v = 0.3 + rnd() * 0.5;
      for (let k = 0; k < parts; k++) {
        // (a cloud's shape: flat under, heaped in its middle; the low ones are the set's own now: they
        // draw their dice as before and are dropped)
        const heap = 1.1 + Math.sin(((k + 0.5) / parts) * Math.PI) * 1.5;
        const c = { x: x + (k - parts / 2) * 4.2, y: y + rnd() * 0.3, z: z + rnd() * 2, sx: (4 + rnd() * 4) * 1.3, sy: heap + rnd() * 0.8, sz: (3 + rnd() * 3) * 1.25, v };
        c.y += c.sy / 2;
        if (!low) (this.cloudData.push(c), ci++);
      }
    }
    this.clouds.count = this.cloudData.length;
    s.add(this.clouds);

    // ---- a few Z-Blocks floating about (dressing)
    for (let k = 0; k < 3; k++) {
      const qb = qBlock(1.3);
      qb.position.set([-21, 20, -27][k], [3, 9, 15][k], [-8, -6, -20][k]);
      s.add(qb);
      this.props.push(qb);
    }

    // ---- the blocks: one instanced body for every tower (and the four blocks in hand), its ink, its decals
    const NB = 4 * MAXB + 4;
    this.body = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), NB);
    this.ink = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: INK3, side: THREE.BackSide }), NB);
    for (let k = 0; k < NB; k++) {
      this.body.setMatrixAt(k, this.zero);
      this.ink.setMatrixAt(k, this.zero);
      this.body.setColorAt(k, this.white);
    }
    this.body.frustumCulled = this.ink.frustumCulled = false;
    s.add(this.body, this.ink);
    const sigils = players.map((p) => sealOf(p.id).sigil);
    const atlas = canvasTex(AT, AT, (g) => paintAtlas(g, sigils));
    const dGeo = new THREE.PlaneGeometry(1, 1);
    const ND = NB * 3;
    this.decCell = new THREE.InstancedBufferAttribute(new Float32Array(ND * 4), 4);
    dGeo.setAttribute("cell", this.decCell);
    const dMat = new THREE.MeshBasicMaterial({ map: atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    dMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec4 cell;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * cell.zw + cell.xy;\n#endif");
    };
    dMat.customProgramCacheKey = () => "chain-stack-decal";
    this.dec = new THREE.InstancedMesh(dGeo, dMat, ND);
    for (let k = 0; k < ND; k++) this.dec.setMatrixAt(k, this.zero);
    this.dec.frustumCulled = false;
    this.dec.renderOrder = 3;
    s.add(this.dec);

    // ---- the falling pieces (pooled)
    const NP = 44;
    this.pBody = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), NP);
    this.pInk = new THREE.InstancedMesh(GEO.box, this.ink.material as THREE.Material, NP);
    for (let k = 0; k < NP; k++) {
      this.pieces.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, wx: 0, wz: 0, sx: 1, sy: 1, t: 0 });
      this.pBody.setMatrixAt(k, this.zero);
      this.pInk.setMatrixAt(k, this.zero);
      this.pBody.setColorAt(k, this.white);
    }
    this.pBody.frustumCulled = this.pInk.frustumCulled = false;
    s.add(this.pBody, this.pInk);

    // ---- the wind's streaks
    this.streaks = new THREE.InstancedMesh(GEO.box, glow("#ffffff", 0.6), 40);
    this.streaks.frustumCulled = false;
    this.streaks.count = 0;
    for (let k = 0; k < 40; k++) this.streakData.push({ x: 0, y: 0, z: 0, l: 0 });
    s.add(this.streaks);

    // ---- the rigs and their snarks
    this.R = players.map((p, i) => this.makeRig(p, i));
    for (let k = 0; k < 4; k++) this.puffs.push(this.makePuff());

    // ---- the wind's gusts, planned (seeded)
    let gt = WIND_AT + 0.8;
    while (gt < TIME - 1 && level.late === "wind") {
      this.gusts.push({ t0: gt, dir: this.rnd() < 0.5 ? -1 : 1, k: lerp(0.5, 0.78, (gt - WIND_AT) / (TIME - WIND_AT)) });
      gt += 4.6 + this.rnd() * 1.6;
    }

    this.fx = new Fx3(s, 700);
    this.cam = new CamRig(this.w.camera);
    this.camGoal();
    this.cam.set(this.eye, this.at);
    // the genesis blocks, the first blocks in the claws
    for (const r of this.R) {
      this.addBlock(r, -W0 / 2, W0 / 2, 0, 1, GENESIS, 0);
      this.prep(r);
      r.side = -1;
      this.spawn(r);
      r.dy = this.droneGoal(r);
      r.floorPrev = r.dy + 0.16;
      r.a.pos.set(TX[r.i] + r.x, r.floorPrev, 0.1);
    }
    for (const r of this.R) this.place(r, 0);
    if (LAB) this.hook = (window as unknown as Record<string, unknown>).__stack = { ph: "pre" };
  }

  private makeRig(p: Player, i: number): Rig {
    const s = this.w.scene;
    const a = new Avatar(s, p, { scale: 0.8, ring: false, shadow: false });
    a.legs = 0;
    const drone = new THREE.Group();
    const pad = new THREE.Mesh(GEO.cyl, toon(p.color));
    pad.scale.set(1.8, 0.32, 1.8);
    outline(pad, 0.05, INK3);
    const cap = new THREE.Mesh(GEO.cyl, toon(tint(p.color, 0.45)));
    cap.scale.set(1.3, 0.06, 1.3);
    cap.position.y = 0.17;
    const arm = new THREE.Mesh(GEO.box, toon("#2c2550"));
    arm.scale.set(3.1, 0.12, 0.26);
    const rotors: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      const rot = new THREE.Mesh(GEO.box, glow("#ffffff", 0.65));
      rot.scale.set(1.15, 0.03, 0.16);
      rot.position.set(sx * 1.55, 0.13, 0);
      rotors.push(rot);
      drone.add(rot);
    }
    const under = new THREE.Mesh(GEO.ring, glow(p.color, 0.9, true));
    under.rotation.x = -Math.PI / 2;
    under.scale.setScalar(1.8);
    under.position.y = -0.2;
    const claw = new THREE.Mesh(GEO.box, toon("#2c2550"));
    claw.scale.set(0.6, 0.2, 0.6);
    claw.position.y = -0.26;
    const cable = new THREE.Mesh(GEO.box, toon("#2c2550"));
    cable.scale.set(0.13, CABLE, 0.13);
    cable.position.y = -CLAW - CABLE / 2;
    cable.visible = false;
    drone.add(pad, cap, arm, under, claw, cable);
    s.add(drone);
    // FINALIZED: a halo round the rig
    const shield = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.5, 40), glow(GLACIER, 0.7));
    shield.scale.setScalar(3.4);
    shield.visible = false;
    s.add(shield);
    // where the block will land: a ghost of the slot over the top
    const ghost = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
    ghost.visible = false;
    ghost.renderOrder = 2;
    s.add(ghost);
    // where a floating drop would land: a bright bar of light on the top
    const mark = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: tint(p.color, 0.2), transparent: true, opacity: 0.85, depthWrite: false }));
    mark.visible = false;
    mark.renderOrder = 3;
    s.add(mark);
    const path = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: tint(p.color, 0.55), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    path.visible = false;
    path.renderOrder = 3;
    s.add(path);
    return {
      i,
      p,
      a,
      h: 0,
      cx: 0,
      w: W0,
      blk: [],
      spawned: 0,
      perf: 0,
      streak: 0,
      best: 0,
      miss: 0,
      st: WAIT,
      stT: 0,
      kind: NORMAL,
      bw: W0,
      hu: 1,
      ph: 0,
      om: 0,
      amp: AMP,
      vc: V0,
      side: -1,
      sine: false,
      base: -AMP,
      x: -AMP,
      dir: 1,
      e: -AMP,
      pe: -1e9,
      reorg: false,
      reorgNext: false,
      qNext: false,
      fy: 0,
      fvy: 0,
      dropX: 0,
      zipFrom: -AMP,
      plan: 0,
      skip: 0,
      thinkB: 1 + i * 0.37,
      cd: REORG_FIRST + i * 0.2,
      immune: 0,
      incoming: 0,
      dy: 0,
      dxw: TX[i],
      vx: 0,
      tilt: 0,
      pop: 1,
      squash: 0,
      flash: 0,
      snap: 0,
      sw: 0,
      swv: 0,
      floorPrev: 0,
      angryT: 0,
      faceT: 0,
      faceYaw: 0,
      shown: 0,
      topped: false,
      bump: 0,
      drone,
      rotors,
      cable,
      shield,
      ghost,
      under,
      mark,
      path,
      vxd: 0,
    };
  }

  private makePuff(): Puff {
    const m = new THREE.Mesh(GEO.ball, toon(LILAC, "#4a3a8a"));
    m.scale.setScalar(0.8);
    outline(m, 0.05, INK3);
    m.visible = false;
    this.w.scene.add(m);
    return { on: false, from: 0, to: 0, t: 0, m };
  }

  // ---- the chain's rules -----------------------------------------------------------------------

  /** The slider's speed for this chain now (m/s). */
  private speed(r: Rig) {
    return Math.min(VMAX, V0 + VK * r.h) * (this.hurry ? HURRY_V : 1);
  }

  /** The top of a tower (m over the pad). */
  private topY(r: Rig) {
    return (1 + r.h) * BH;
  }

  /** What hangs under the rig: the claw, a heavy slab's cable, the block. */
  private hang(r: Rig) {
    return CLAW + (r.kind === HEAVY ? CABLE : 0) + r.hu * BH;
  }

  private droneGoal(r: Rig) {
    return this.topY(r) + GAP + this.hang(r);
  }

  /** The next block, decided as soon as the last one is gone: its kind, its size. */
  private prep(r: Rig) {
    let kind = NORMAL;
    if (r.qNext) ((kind = QB), (r.qNext = false));
    else if ((r.spawned + 1) % HEAVY_EVERY === 0) kind = HEAVY;
    this.setKind(r, kind);
  }

  private setKind(r: Rig, kind: number) {
    r.kind = kind;
    r.hu = kind === QB ? 3 : kind === HEAVY ? 2 : 1;
    r.bw = kind === QB ? W0 : r.w;
    this.setActiveDecals(r, r.reorgNext);
  }

  /** A new block in the claw, at the edge it zipped to: it slides back across. */
  private spawn(r: Rig) {
    r.spawned++;
    r.reorg = r.reorgNext;
    r.reorgNext = false;
    const v = this.speed(r) * (r.reorg ? REORG_V : 1);
    r.sine = r.kind === HEAVY;
    r.amp = AMP * (r.sine ? HEAVY_A : 1) * (r.reorg ? REORG_A : 1);
    r.vc = v * (r.sine ? HEAVY_V : 1);
    r.om = r.sine ? r.vc / r.amp : (Math.PI * r.vc) / (2 * r.amp);
    r.ph = 0;
    r.st = HOLD;
    r.stT = 0;
    r.pop = 0;
    r.pe = -1e9;
    this.motion(r);
    if (!r.p.human) this.planAI(r);
    this.setActiveDecals(r, r.reorg);
  }

  /** Where the block in hand is, from its phase (and the wind's push). */
  private motion(r: Rig) {
    const u = r.ph % TAU;
    const f = r.sine ? Math.cos(u) : tcos(u);
    r.base = r.side * r.amp * f;
    r.dir = u < Math.PI ? -r.side : r.side;
    r.x = r.cx + r.base + this.wind;
    // (how far past the middle it would come down, along its way: where it lands if it floats, against
    // the top where the deck has swung it)
    let lx = r.x;
    if (this.L.float) lx += this.slide(r) * this.fallTime(r);
    if (this.L.roll) lx -= this.swayAt(r, this.topY(r));
    r.e = (lx - r.cx) * r.dir;
  }

  /** The slide's speed now (m/s along x). */
  private velX(r: Rig) {
    const u = r.ph % TAU;
    return r.sine ? -r.side * r.amp * Math.sin(u) * r.om : r.dir * r.vc;
  }

  /** What a floating drop keeps of it. */
  private slide(r: Rig) {
    const f = this.L.float;
    return f ? clamp(this.velX(r) * f.k, -f.cap, f.cap) : 0;
  }

  /** A floating drop's time down from the claw to the top (s). */
  private fallTime(r: Rig) {
    const h = Math.max(0.05, r.dy - this.hang(r) - this.topY(r));
    const v0 = this.L.float ? this.L.float.v0 : DROP_V,
      g = this.fallG;
    return (-v0 + Math.sqrt(v0 * v0 + 2 * g * h)) / g;
  }

  /** Let go. */
  private drop(r: Rig) {
    r.st = DROP;
    r.stT = 0;
    r.dropX = r.x;
    r.fy = r.dy - this.hang(r) - this.topY(r);
    r.fvy = -DROP_V;
    r.vxd = 0;
    // (afloat: it keeps its slide, and falls slowly)
    if (this.L.float) ((r.fvy = -this.L.float.v0), (r.vxd = this.slide(r)));
    // (on a rolling deck: from here on it falls with the top, in the tower's frame)
    if (this.L.roll) r.dropX -= this.swayAt(r, this.topY(r));
    if (r.a.grounded) r.a.jump(4.5);
    if (r.p.human) beep(420, 0.05, "square", 0.14, 0.7);
  }

  /** The block lands: PERFECT, sliced, or off the tower. */
  private land(r: Rig) {
    const off = r.dropX - r.cx;
    const ao = Math.abs(off);
    const human = r.p.human;
    const topY = this.topY(r);
    const wx = TX[r.i] + this.swayAt(r, topY);
    let perfect = false;
    let nx = r.cx;
    let nw = r.w;
    let miss = false;
    if (r.kind === QB) {
      if (ao <= PERF) perfect = true;
      else if (ao >= r.w / 2 + Q_GRACE) miss = true;
      nw = W0;
    } else {
      const l = Math.max(r.cx - r.w / 2, r.dropX - r.bw / 2);
      const rt = Math.min(r.cx + r.w / 2, r.dropX + r.bw / 2);
      if (ao <= PERF) ((perfect = true), (nw = r.bw));
      else if (rt - l < MINW) miss = true;
      else {
        nx = (l + rt) / 2;
        nw = rt - l;
        // the overhang: sliced off, it tumbles away on its side
        const px0 = off > 0 ? rt : r.dropX - r.bw / 2;
        const px1 = off > 0 ? r.dropX + r.bw / 2 : l;
        this.piece(r, wx + (px0 + px1) / 2, topY + (r.hu * BH) / 2, px1 - px0, r.hu * BH, Math.sign(off), this.blockColor(r, r.kind, r.blk.length, this.c));
      }
    }
    if (miss) {
      r.streak = 0;
      r.miss++;
      this.piece(r, wx + r.dropX, topY + (r.hu * BH) / 2, r.bw, r.hu * BH, Math.sign(off) || 1, this.blockColor(r, r.kind, r.blk.length, this.c));
      this.popAt(r, T("MISS!", "落空！"), "#ff5d73", true);
      r.a.hit();
      r.angryT = 1.6;
      r.st = STUN;
      r.stT = 0;
      r.zipFrom = r.base;
      r.side = r.dir;
      this.prep(r);
      this.fx.burst(this.v.set(wx + r.dropX, topY + 0.3, 0.6), 14, ["#ffffff", r.p.color, "#8d86b8"], { speed: 4, up: 2, size: 0.16 });
      if (human) (sfx.lose(), this.cam.shake(0.35), (this.hurt = 1));
      return;
    }
    if (perfect) {
      r.perf++;
      r.streak++;
      r.best = Math.max(r.best, r.streak);
      r.flash = 1;
      let grew = false;
      if (r.kind !== QB && r.streak >= 3 && nw < W0 - 0.001) ((nw = Math.min(W0, nw + GROW)), (grew = true));
      this.popAt(r, r.streak >= 2 ? T(`PERFECT ×${r.streak}`, `完美 ×${r.streak}`) : T("PERFECT!", "完美！"), r.streak >= 3 ? "#7dffb2" : "#ffffff", r.streak >= 3);
      if (grew) this.popAt(r, T("GROW!", "变宽！"), "#7dffb2", false, 0.9);
      this.fx.burst(this.v.set(wx + nx, topY + r.hu * BH, DEP / 2), r.streak >= 3 ? 26 : 16, ["#ffffff", r.p.color, "#fff3b0"], { speed: 5, up: 3, size: 0.15, life: 0.7 });
      if (r.streak >= 3) r.a.cheer(1.2);
      if (human) {
        const n = NOTES[Math.min(NOTES.length - 1, r.streak - 1)];
        beep(n, 0.12, "square", 0.22);
        beep(n * 1.5, 0.16, "triangle", 0.16, 0, 0.06);
        if (grew) sfx.star();
        this.cam.shake(0.08);
      }
    } else {
      r.streak = 0;
      if (human) (sfx.hit(), this.cam.shake(0.14));
      if (r.kind !== QB && nw > r.w - 0.3 && human) this.popAt(r, T("GOOD", "不错"), "#cfe8ff", false);
    }
    if (r.kind === QB) {
      // the Z-Block lands whole and settles on the middle of the tower: wide again
      r.snap = perfect ? 0 : r.dropX - r.cx;
      this.popAt(r, "+3", QCOL, true, perfect ? 0.85 : 0);
      this.fx.burst(this.v.set(wx + r.cx, topY + 1.2, DEP / 2), 30, [QCOL, "#ffffff", "#ffe98a"], { speed: 6, up: 5, size: 0.18 });
      if (human) sfx.coin();
    } else if (r.kind === HEAVY) {
      this.fx.burst(this.v.set(wx + nx, topY, DEP / 2), 12, ["#ffffff", "#8d86b8"], { speed: 4, up: 1.5, size: 0.14 });
      if (human) sfx.thud();
    }
    const kind = r.kind;
    const before = r.h;
    r.h += r.hu;
    r.cx = nx;
    r.w = nw;
    this.addBlock(r, nx - nw / 2, nx + nw / 2, before + 1, r.hu, kind, r.h);
    r.squash = 1;
    // a milestone: the first chain past 10, 20, 30 …
    while (this.miles < MILES.length && r.h >= MILES[this.miles]) {
      const m = MILES[this.miles];
      this.bandLit[this.miles] = 1;
      this.say(T(`HEIGHT ${m}!`, `高度 ${m}！`), r.p.color, 1.5, 60);
      this.say(r.p.human ? T("you lead the race to the sky", "你领先冲上云霄") : T(`${short(r.p)} leads the race to the sky`, `${short(r.p)} 领先冲上云霄`), "#ffffff", 1.4, 22, 0.15, H * 0.32 + 50);
      if (this.human >= 0) sfx.coin();
      this.miles++;
    }
    if (human && r.h >= 10 && Math.floor(before / 10) !== Math.floor(r.h / 10) && this.R.some((o) => o !== r && o.h >= r.h)) this.popAt(r, String(Math.floor(r.h / 10) * 10) + "!", "#ffffff", true, 0.5);
    r.st = WAIT;
    r.stT = 0;
    r.zipFrom = r.base;
    r.side = r.dir;
    this.prep(r);
  }

  /** The AI's plan for this block: where along the pass it lets go, and whether it lets a pass by. */
  private planAI(r: Rig) {
    const s = r.p.skill;
    let sig = lerp(AI_SIG0, AI_SIG1, s);
    if (r.reorg) sig *= 1.3;
    if (this.windOn) sig *= 1 + AI_WIND * (1 - s);
    if (this.hurry) sig *= 1 + 0.25 * (1 - s);
    if (r.kind === HEAVY) sig *= 1.12;
    sig *= this.L.aiK;
    const bias = (1 - s) * 0.016;
    let e = (this.gauss() * sig + bias) * r.vc;
    // a flub: a press badly off now and then
    if (this.rnd() < lerp(AI_FLUB0, AI_FLUB1, s)) e += (this.rnd() < 0.5 ? -1 : 1) * r.bw * (0.45 + this.rnd() * 0.75);
    r.plan = clamp(e, -r.amp * 0.85, r.amp * 0.85);
    // a hesitation: lets the first pass by
    r.skip = this.rnd() < lerp(AI_HES0, AI_HES1, s) ? 1 : 0;
  }

  private gauss() {
    const u = Math.max(1e-6, this.rnd());
    const v = this.rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }

  /** The rival REORG would hit: the tallest chain but yours (ties: more PERFECTs, then nearer). */
  private targetOf(r: Rig) {
    let best: Rig | null = null;
    for (const o of this.R) {
      if (o === r) continue;
      if (!best || o.h > best.h || (o.h === best.h && o.perf > best.perf)) best = o;
    }
    return best!;
  }

  private fire(r: Rig) {
    const tg = this.targetOf(r);
    const pf = this.puffs[r.i];
    if (pf.on || r.cd > 0) return false;
    r.cd = REORG_CD;
    pf.on = true;
    pf.from = r.i;
    pf.to = tg.i;
    pf.t = 0;
    pf.m.visible = true;
    tg.incoming = REORG_FLY;
    r.faceT = 0.5;
    r.faceYaw = TX[tg.i] > TX[r.i] ? Math.PI / 2 : -Math.PI / 2;
    r.a.body.wave(0.6);
    this.popAt(r, "REORG!", LILAC, false, 0.6);
    if (r.p.human || tg.p.human) sfx.whoosh();
    if (tg.p.human) this.say(T("REORG INCOMING!", "REORG 来袭！"), LILAC, 1.1, 30, 0, H * 0.62);
    return true;
  }

  private puffHit(pf: Puff) {
    const tg = this.R[pf.to];
    const src = this.R[pf.from];
    pf.on = false;
    pf.m.visible = false;
    tg.incoming = 0;
    this.v.set(tg.dxw, tg.dy, 0.4);
    if (tg.immune > 0) {
      // FINALIZED: it bounces off
      this.fx.burst(this.v, 18, [GLACIER, "#ffffff"], { speed: 6, up: 2, size: 0.15 });
      this.popAt(tg, T("FINALIZED", "已最终确认"), GLACIER, false, 1.2);
      if (src.p.human || tg.p.human) beep(1200, 0.08, "square", 0.12, 1.4);
      return;
    }
    tg.reorgNext = true;
    tg.immune = REORG_IMMUNE;
    tg.angryT = 1.4;
    this.fx.burst(this.v, 34, [LILAC, "#ffffff", "#8a6bff"], { speed: 7, up: 3, size: 0.2, life: 0.9 });
    this.popAt(tg, T("REORGED!", "被重组！"), LILAC, true, 1.0);
    if (tg.p.human) (beep(300, 0.3, "sawtooth", 0.16, 0.5), this.cam.shake(0.25), (this.hurt = 0.7));
    else if (src.p.human) beep(880, 0.1, "square", 0.16, 1.5);
  }

  // ---- the frame -------------------------------------------------------------------------------

  idle(dt: number, phase: "card" | "count", k: number) {
    this.clk += dt;
    if (phase === "card") {
      const mid = this.topY(this.R[0]) + 3;
      this.cam.orbit(this.v.set(0, mid, 0), -0.75 + k * 0.1, 33, 7);
    } else {
      this.camGoal();
      this.cam.to(this.eye, this.at, dt, 3.2);
    }
    this.cam.apply(dt);
    this.animate(dt);
  }

  update(dt: number, input: Input) {
    this.clk += dt;
    this.lastDt = dt;
    if (this.ph === "pre") this.ph = "play";
    if (this.ph === "play") {
      this.t += dt;
      this.events();
      for (const r of this.R) this.step(r, dt, input);
      for (const pf of this.puffs) {
        if (!pf.on) continue;
        pf.t += dt;
        this.R[pf.to].incoming = Math.max(0, REORG_FLY - pf.t);
        if (pf.t >= REORG_FLY) this.puffHit(pf);
      }
      if (this.t >= TIME) this.bell();
    } else if (this.ph === "time") {
      this.pt += dt;
      if (this.pt >= TIME_HOLD) this.startTally();
    } else if (this.ph === "tally") {
      this.pt += dt;
      this.tally(dt);
    } else if (this.ph === "win") {
      this.pt += dt;
      if (this.pt >= WIN_HOLD && !this.over) this.over = this.final;
      const w = this.R[this.final[0]];
      if (w.a.grounded && Math.random() < dt * 2.2) w.a.jump(7);
    }
    this.animate(dt);
    // the camera
    if (this.ph === "play" || this.ph === "time") this.camGoal();
    else this.camTally();
    this.cam.to(this.eye, this.at, dt, this.ph === "play" ? 2.6 : 3.4);
    this.cam.apply(dt);
    if (this.hook) this.publish();
  }

  /** The clock's events: blocks found, the wind, the hurry. */
  private events() {
    const t = this.t;
    if (this.found < 3 && t >= FOUND_EVERY * (this.found + 1)) {
      this.found++;
      for (const r of this.R) {
        if (r.st === WAIT || r.st === STUN) this.setKind(r, QB);
        else r.qNext = true;
      }
      this.say(T("BLOCK FOUND!", "出块了！"), QCOL, 1.6, 66);
      this.say(T("next drop: a Z-BLOCK, +3, lands wide", "下一块：Z 方块，+3，落下就变宽"), "#ffffff", 1.5, 22, 0.15, H * 0.32 + 52);
      this.flashHud = 1;
      sfx.star();
    }
    if (!this.windOn && t >= WIND_AT) {
      this.windOn = true;
      const late = this.L.late;
      if (late === "wind") {
        this.say(T("WIND!", "起风了！"), GLACIER, 1.4, 62);
        this.say(T("gusts push the sliders: watch the block", "阵风会推动方块：看准再落"), "#ffffff", 1.3, 22, 0.15, H * 0.32 + 50);
      } else if (late === "gravity") {
        this.say(T("GRAVITY DROPS!", "重力变弱！"), "#7ff0ff", 1.4, 58);
        this.say(T("blocks float longer: drop on the landing light", "方块飘得更久：对准落点光标"), "#ffffff", 1.3, 22, 0.15, H * 0.32 + 50);
        if (this.L.float) this.fallG = this.L.float.g2;
        for (const r of this.R) this.fx.burst(this.v.set(r.dxw, r.dy - 0.4, 0.6), 22, ["#7ff0ff", "#ffffff", "#c4b1fc"], { speed: 4, up: 1, size: 0.14, life: 1.0, gravity: -0.5, drag: 1.5 });
      } else {
        for (const r of this.R) this.fx.burst(this.v.set(r.dxw, 0.4, 3.2), 26, ["#ffffff", "#cfe8ff", "#8fb8d8"], { speed: 6, up: 7, size: 0.18, life: 0.9, gravity: 14 });
        this.say(T("STORM!", "风暴来了！"), "#9fd0ff", 1.4, 62);
        this.say(T("the ships roll harder: watch the glowing slot", "船摇得更厉害：盯住发光的落位"), "#ffffff", 1.3, 22, 0.15, H * 0.32 + 50);
        this.flash = 1;
        beep(60, 0.9, "sawtooth", 0.2, 0.6);
      }
      sfx.whoosh();
    }
    // the storm grows (the decks roll harder), the lightning (its thunder a beat before)
    if (this.L.roll) {
      this.storm = t < WIND_AT ? (0.35 * t) / WIND_AT : Math.min(1, 0.6 + (0.4 * (t - WIND_AT)) / (TIME - WIND_AT));
      if (t >= this.boltAt - 0.6 && t - this.lastDt < this.boltAt - 0.6) beep(48, 0.8, "triangle", 0.18, 0.7);
      if (t >= this.boltAt) {
        this.flash = 1;
        this.boltAt = t + (this.windOn ? 3.5 : 6) + Math.random() * 3;
      }
    }
    if (!this.hurry && t >= HURRY_AT) {
      this.hurry = true;
      this.say(T("HURRY!", "快！"), "#ff6b35", 1.4, 74);
      music.rate(1.15);
      sfx.go();
    }
    // the gusts
    let wp = 0;
    let warn = 0;
    for (const g of this.gusts) {
      const u = (t - g.t0) / GUST_T;
      if (u > 0 && u < 1) {
        const s = Math.sin(Math.PI * u);
        wp += g.dir * g.k * s * s;
        warn = g.dir;
      } else if (u <= 0 && u > -1 / GUST_T) warn = g.dir;
    }
    if (warn && !this.warn && this.human >= 0) sfx.whoosh();
    this.warn = warn;
    this.wind = wp;
    if (t > TIME - 5 && Math.ceil(TIME - t) !== this.tick) ((this.tick = Math.ceil(TIME - t)), sfx.tick());
  }

  /** One rig's frame: its block, its REORG, the AI. */
  private step(r: Rig, dt: number, input: Input) {
    r.cd -= dt;
    r.immune -= dt;
    const human = r.p.human;
    if (r.st === HOLD) {
      // (your press is for the frame you saw: the block goes from where it was drawn, not a frame's slide further)
      if (human && input.pressed("a") && r.stT > 0.05) this.drop(r);
      else {
        r.stT += dt;
        r.ph += r.om * dt;
        this.motion(r);
        // (the AI lets go on the frame nearest its spot: half a frame's travel ahead counts)
        const ahead = r.e + r.vc * dt * 0.5;
        if (!human && r.stT > 0.1) {
          // (a new pass that starts past its spot, afloat or on a rolling deck: it aims just past the start)
          if (ahead < r.pe - r.amp && r.plan < ahead) r.plan = ahead + 0.04;
          if (r.pe < r.plan && ahead >= r.plan) {
            if (r.skip > 0) r.skip--;
            else this.drop(r);
          }
        }
        r.pe = ahead;
      }
    } else if (r.st === DROP) {
      // (it lands at its own instant, not at the frame's end: a floating drop slides on only until then,
      // so it comes down on the landing light at any frame rate)
      const g = this.L.float ? this.fallG : DROP_G;
      const fy = r.fy + r.fvy * dt - 0.5 * g * dt * dt;
      if (fy <= 0) {
        r.dropX += (r.vxd * (r.fvy + Math.sqrt(r.fvy * r.fvy + 2 * g * Math.max(0, r.fy)))) / g;
        r.fy = 0;
        this.land(r);
      } else {
        r.fy = fy;
        r.fvy -= g * dt;
        r.dropX += r.vxd * dt;
      }
    } else {
      r.stT += dt;
      if (r.st === STUN && r.stT >= STUN_T) ((r.st = WAIT), (r.stT = 0), (r.zipFrom = r.base));
      else if (r.st === WAIT) {
        const rl = r.streak > 0 ? RELOAD_PERF : RELOAD;
        const k = easeOut(Math.min(1, r.stT / rl));
        r.base = lerp(r.zipFrom, r.side * AMP * (r.kind === HEAVY ? HEAVY_A : 1) * (r.reorgNext ? REORG_A : 1), k);
        r.x = r.cx + r.base + this.wind;
        if (r.stT >= rl) this.spawn(r);
      }
    }
    // REORG
    if (human) {
      if (input.pressed("b")) {
        if (!this.fire(r)) beep(160, 0.08, "square", 0.12);
      }
    } else if (this.t > REORG_FIRST && r.cd <= 0 && (r.thinkB -= dt) <= 0) {
      const s = r.p.skill;
      r.thinkB = 0.35 + this.rnd() * 0.5;
      const tg = this.targetOf(r);
      // a pro fires at a rival ahead or close, not FINALIZED, while its block is still far from the
      // middle; a tourist whenever the mood takes it
      const sloppy = this.rnd() < (1 - s) * 0.5;
      const worth = tg.h >= r.h - 3 || sloppy;
      const open = tg.immune <= 0 || sloppy;
      const timing = sloppy || tg.st !== HOLD || tg.e < -0.8;
      if (worth && open && timing && this.rnd() < 0.12 + 0.4 * s) this.fire(r);
    }
  }

  /** The bell: the drops already falling land; the blocks still in hand are gone. */
  private bell() {
    this.ph = "time";
    this.pt = 0;
    this.wind = 0;
    this.warn = 0;
    for (const pf of this.puffs) ((pf.on = false), (pf.m.visible = false));
    for (const r of this.R) {
      r.incoming = 0;
      if (r.st === DROP) ((r.fy = 0), this.land(r));
      if (r.st === HOLD || r.st === WAIT || r.st === STUN) {
        this.v.set(r.dxw, r.dy - this.hang(r) * 0.6, 0.5);
        if (r.st === HOLD) this.fx.burst(this.v, 16, ["#ffffff", r.p.color], { speed: 4, up: 2, size: 0.15 });
      }
      r.st = WAIT;
      r.stT = 0;
      r.pop = 0;
      r.kind = NORMAL;
      r.hu = 1;
      r.reorgNext = false;
    }
    this.say(T("TIME!", "时间到！"), "#ffffff", 1.2, 84);
    music.rate(1);
    this.cam.shake(0.2);
  }

  private startTally() {
    this.ph = "tally";
    this.pt = 0;
    this.scan = 0;
    this.scanMax = Math.max(1, ...this.R.map((r) => r.h));
    this.final = rankBy(
      this.R.map((r) => r.h),
      this.R.map((r) => r.perf),
    );
    for (const r of this.R) ((r.shown = 0), (r.topped = false));
    this.scanBar.visible = true;
    this.say(T("CHAIN HEIGHT", "链高"), "#ffffff", TALLY_T + 0.6, 40, 0, 92);
    sfx.tick();
  }

  private tally(dt: number) {
    const u = clamp(this.pt / TALLY_T, 0, 1);
    this.scan = this.scanMax * (1 - Math.pow(1 - u, 2.1));
    const n = Math.floor(this.scan + 1e-6);
    let up = false;
    for (const r of this.R) {
      const v = Math.min(r.h, n);
      if (v !== r.shown) ((r.shown = v), (up = true));
      if (!r.topped && (this.scan >= r.h - 1e-6 || u >= 1)) {
        r.topped = true;
        r.shown = r.h;
        r.bump = 1;
        const place = this.final.indexOf(r.i);
        this.fx.burst(this.v.set(TX[r.i] + r.cx, this.topY(r) + 0.4, DEP / 2), 22 + (3 - place) * 8, [r.p.color, "#ffffff"], { speed: 6, up: 5, size: 0.18 });
        beep(392 + (3 - place) * 130, 0.16, "square", 0.2);
        if (place === 3) r.angryT = 3;
      }
    }
    if (up && (this.tick -= dt) <= 0) ((this.tick = 0.05), beep(300 + n * 9, 0.04, "square", 0.1));
    if (u >= 1) {
      this.ph = "win";
      this.pt = 0;
      const w = this.R[this.final[0]];
      const second = this.R[this.final[1]];
      w.a.cheer(3);
      w.a.jump(8);
      w.bump = 1;
      this.fx.burst(this.v.set(w.dxw, w.dy + 1, 0.5), 80, [w.p.color, "#ffffff", QCOL, LILAC], { speed: 9, up: 9, size: 0.22, life: 1.5, gravity: 9 });
      if (second.h === w.h) this.say(T("TIE! MORE PERFECTS WINS", "平局！完美多者胜"), "#ffffff", 1.6, 30, 0, H * 0.62);
      sfx.fanfare();
      this.cam.shake(0.25);
      this.scanBar.visible = false;
    }
  }

  // ---- the camera ------------------------------------------------------------------------------

  /** The play camera: the whole row; your rig and block always in, the leaders' tops if they fit. */
  private camGoal() {
    let lo = Infinity,
      hi = -Infinity;
    for (const r of this.R) {
      const y = this.topY(r);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    const hy = this.human >= 0 ? this.topY(this.R[this.human]) : hi;
    const bottom = Math.min(hy - 1.6, Math.max(lo - 0.6, hy - 8));
    const top = Math.max(hy + 4.4, hi + 4.4);
    const TAN = Math.tan((25 * Math.PI) / 180);
    let half = ((top - bottom) / 2) * 1.08 + 0.6;
    const D = clamp(half / TAN, 22, 31);
    half = D * TAN;
    let mid = (top + bottom) / 2;
    // (too tall a spread: your own top stays in)
    mid = clamp(mid, hy + 4.4 - half * 0.92, hy - 1.6 + half * 0.92);
    this.at.set(0, mid, 0);
    this.eye.set(0, mid + 3.4, D);
  }

  /** The count's camera: down at the pads, then up with the scan line, drifting to the towers still climbing. */
  private camTally() {
    const y = (1 + this.scan) * BH;
    const win = this.ph === "win";
    let sx = 0,
      n = 0;
    for (const r of this.R)
      if (win ? r.i === this.final[0] : !r.topped) {
        sx += TX[r.i];
        n++;
      }
    const x = n ? (sx / n) * (win ? 0.5 : 0.3) : 0;
    const D = win ? 17 : 23;
    this.at.set(x, y + 1.2, 0);
    this.eye.set(x, y + 3.8, D);
  }

  // ---- the look --------------------------------------------------------------------------------

  /** A tower's sway at height y (m): its top bends with the wind (or the deck tilts it, at sea). */
  private swayAt(r: Rig, y: number) {
    if (this.L.roll) return y * Math.tan(this.rolls[r.i]);
    const k = y / REF;
    return r.sw * k * k;
  }

  /** A block's lean at height y (rad). */
  private leanAt(r: Rig, y: number) {
    return this.L.roll ? -this.rolls[r.i] : (-2 * r.sw * y) / (REF * REF);
  }

  private blockColor(r: Rig, kind: number, k: number, c: THREE.Color) {
    if (kind === QB) return c.set(QCOL);
    if (kind === GENESIS) return c.set(GEN_COL);
    if (kind === HEAVY) return c.set(tint(r.p.color, -0.38));
    return c.set(tint(r.p.color, k % 2 ? 0.16 : -0.02));
  }

  private addBlock(r: Rig, x0: number, x1: number, y: number, hu: number, kind: number, num: number) {
    if (r.blk.length >= MAXB) {
      // (a chain that tall: the oldest above genesis merges away; never in practice)
      r.blk.splice(1, 1);
    }
    const b: Blk = { x0, x1, y, hu, kind, num, color: this.blockColor(r, kind, r.blk.length, new THREE.Color()) };
    r.blk.push(b);
    const k = r.blk.length - 1;
    this.body.setColorAt(r.i * MAXB + k, b.color);
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    this.blockDecalCells(r.i * MAXB + k, r.i, kind, num, x1 - x0);
  }

  /** The decal cells a block wears: its height and sigil (and its kind's word). */
  private blockDecalCells(slot: number, seat: number, kind: number, num: number, w: number) {
    const a = this.decCell.array as Float32Array;
    const set = (j: number, cell: readonly number[] | null) => {
      const o = (slot * 3 + j) * 4;
      if (!cell) ((a[o] = a[o + 1] = 0), (a[o + 2] = a[o + 3] = 0));
      else ((a[o] = cell[0]), (a[o + 1] = cell[1]), (a[o + 2] = cell[2]), (a[o + 3] = cell[3]));
    };
    const nc = NUM_CELLS[Math.min(99, num)];
    if (kind === GENESIS) (set(0, GENESIS_CELL), set(1, null), set(2, null));
    else if (kind === QB) (set(0, nc), set(1, Q_CELL), set(2, null));
    else if (kind === HEAVY) (set(0, nc), set(1, w >= 1.45 ? SIG_CELLS[seat] : null), set(2, MLDSA_CELL));
    else (set(0, nc), set(1, w >= 1.45 ? SIG_CELLS[seat] : null), set(2, null));
    this.decCell.needsUpdate = true;
  }

  private setActiveDecals(r: Rig, reorg: boolean) {
    const slot = 4 * MAXB + r.i;
    this.blockDecalCells(slot, r.i, r.kind, r.h + r.hu, r.bw);
    if (reorg) {
      const a = this.decCell.array as Float32Array;
      const o = (slot * 3 + 2) * 4;
      a[o] = REORG_CELL[0];
      a[o + 1] = REORG_CELL[1];
      a[o + 2] = REORG_CELL[2];
      a[o + 3] = REORG_CELL[3];
    }
  }

  /**
   * A block's body, ink and decals at (x, yc) world, `w` × `hgt`, leaning `lean` (rad), its decals
   * laid out by its kind.
   */
  private writeBlock(slot: number, x: number, yc: number, w: number, hgt: number, lean: number, kind: number) {
    this.e.set(0, 0, lean);
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, yc, 0), this.q, this.s.set(w, hgt, DEP));
    this.body.setMatrixAt(slot, this.m);
    this.m.compose(this.p, this.q, this.s.set(w + 0.1, hgt + 0.1, DEP + 0.1));
    this.ink.setMatrixAt(slot, this.m);
    const z = DEP / 2 + 0.015;
    const d0 = slot * 3;
    if (kind === GENESIS) {
      const dw = Math.min(w * 0.86, 1.7);
      this.decal(d0, x, yc, z, dw, dw / 4);
      this.dec.setMatrixAt(d0 + 1, this.zero);
      this.dec.setMatrixAt(d0 + 2, this.zero);
      return;
    }
    if (kind === QB) {
      const qs = Math.min(w * 0.7, hgt * 0.6);
      this.decal(d0 + 1, x, yc + hgt * 0.12, z, qs, qs);
      const nw = Math.min(w * 0.6, 0.62);
      this.decal(d0, x, yc - hgt * 0.36, z, nw, nw / 2);
      this.dec.setMatrixAt(d0 + 2, this.zero);
      return;
    }
    // the height (and the sigil beside it when there is room); a heavy slab's word above
    const rowY = kind === HEAVY ? yc - hgt * 0.2 : yc;
    const sig = w >= 1.45;
    const nw = Math.min(0.8, w * 0.84);
    const nh = nw / 2;
    if (sig) {
      this.decal(d0 + 1, x - 0.45, rowY, z, 0.44, 0.44);
      this.decal(d0, x + 0.2, rowY, z, nw, nh);
    } else {
      this.dec.setMatrixAt(d0 + 1, this.zero);
      this.decal(d0, x, rowY, z, nw, nh);
    }
    if (kind === HEAVY) {
      const ww = Math.min(w * 0.88, 1.5);
      this.decal(d0 + 2, x, yc + hgt * 0.24, z, ww, ww / 4);
    } else this.dec.setMatrixAt(d0 + 2, this.zero);
  }

  private decal(slot: number, x: number, y: number, z: number, w: number, h: number) {
    this.m.compose(this.v2.set(x, y, z), this.q, this.s.set(w, h, 1));
    this.dec.setMatrixAt(slot, this.m);
  }

  /** Every block of a tower where its sway puts it (and the newest one's bounce). */
  private place(r: Rig, dt: number) {
    const n = r.blk.length;
    for (let k = 0; k < n; k++) {
      const b = r.blk[k];
      let hgt = b.hu * BH;
      let yc = (b.y + b.hu / 2) * BH;
      let xc = (b.x0 + b.x1) / 2;
      const top = k === n - 1;
      if (top && r.squash > 0) {
        const s = Math.sin(r.squash * Math.PI) * 0.18;
        hgt *= 1 - s;
        yc = b.y * BH + hgt / 2;
      }
      if (top && r.snap) xc += r.snap;
      this.writeBlock(r.i * MAXB + k, TX[r.i] + xc + this.swayAt(r, yc), yc, b.x1 - b.x0, hgt, this.leanAt(r, yc), b.kind);
    }
    // the top's flash (a PERFECT)
    if (r.flash > 0 && n) {
      r.flash = Math.max(0, r.flash - dt * 3.2);
      this.c.copy(r.blk[n - 1].color).lerp(this.white, r.flash * 0.85);
      this.body.setColorAt(r.i * MAXB + n - 1, this.c);
      if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    }
  }

  /** A sliced-off piece (or a whole missed block), tumbling away down past the city. */
  private piece(r: Rig, x: number, y: number, w: number, h: number, side: number, color: THREE.Color) {
    const pc = this.pieces[this.nextPiece];
    const k = this.nextPiece;
    this.nextPiece = (this.nextPiece + 1) % this.pieces.length;
    pc.on = true;
    pc.x = x;
    pc.y = y;
    pc.z = 0;
    pc.vx = side * (1.6 + Math.random() * 1.4);
    pc.vy = 2 + Math.random() * 1.5;
    pc.vz = (Math.random() - 0.3) * 2;
    pc.rx = 0;
    pc.rz = 0;
    pc.wx = (Math.random() - 0.5) * 5;
    pc.wz = -side * (2 + Math.random() * 3);
    pc.sx = Math.max(0.05, w);
    pc.sy = h;
    pc.t = 0;
    this.pBody.setColorAt(k, color);
    if (this.pBody.instanceColor) this.pBody.instanceColor.needsUpdate = true;
    // (a chunk of dust where it broke off)
    this.fx.burst(this.v.set(x - side * w * 0.5, y, DEP / 2), 8, ["#ffffff", r.p.color], { speed: 3, up: 1.5, size: 0.12, life: 0.6 });
  }

  /** Everything that moves on its own: the rigs, the snarks, the towers' sway, the pieces, the clouds. */
  private animate(dt: number) {
    const t = this.clk;
    const playing = this.ph === "play";
    if (this.L.roll) {
      const amp = lerp(this.L.roll.a0, this.L.roll.a1, this.storm);
      for (let i = 0; i < 4; i++) this.rolls[i] = amp * Math.sin((TAU * t) / this.rollP[i] + this.rollPh[i]);
    }
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.live?.tick(dt, { t, roll: this.rolls, storm: this.storm, flash: this.flash, playing });
    // (the stage's shadow map sits where the camera looks: on the towers, not on the ground far below)
    this.w.scene.userData.shadowY = this.cam.at.y;
    for (const r of this.R) {
      // the sway: a spring toward the wind (taller, slower), a breath of idle motion
      const goal = this.wind * 1.1 + Math.sin(t * 1.3 + r.i * 1.7) * 0.03;
      const kk = 9 / (1 + r.h * 0.03);
      r.swv += ((goal - r.sw) * kk - r.swv * 2.2) * dt;
      r.sw += r.swv * dt;
      r.squash = Math.max(0, r.squash - dt * 5);
      if (r.snap) {
        const s = r.snap * Math.exp(-14 * dt);
        r.snap = Math.abs(s) < 0.01 ? 0 : s;
      }
      this.place(r, dt);
      // the rig: over the block's path, at its height
      const topY = this.topY(r);
      const goalY = this.droneGoal(r);
      r.dy += (goalY - r.dy) * (1 - Math.exp(-11 * dt));
      const swayTop = this.swayAt(r, topY);
      // (the rig: over the block in the city's wind; over its own path afloat and at sea, where the
      // block falls on its own: drifting, or with the tower's top)
      const own = !!(this.L.float || this.L.roll);
      const bx = r.st === DROP && !own ? r.dropX : r.x;
      const xw = TX[r.i] + bx + (this.L.roll ? 0 : swayTop);
      const bxw = r.st === DROP && own ? TX[r.i] + r.dropX + (this.L.roll ? swayTop : 0) : xw;
      r.vx = dt > 0 ? (xw - r.dxw) / dt : 0;
      r.dxw = xw;
      const stun = r.st === STUN && playing;
      r.tilt += (clamp(-r.vx * 0.016 - this.wind * 0.12, -0.2, 0.2) - r.tilt) * (1 - Math.exp(-8 * dt));
      const bob = Math.sin(t * 3.1 + r.i) * 0.05;
      r.drone.position.set(xw, r.dy + bob, 0);
      r.drone.rotation.z = r.tilt + (stun ? Math.sin(r.stT * 30) * 0.25 * (1 - r.stT / STUN_T) : 0);
      r.drone.rotation.y = stun ? r.stT * 14 : 0;
      for (let k = 0; k < 2; k++) r.rotors[k].rotation.y = t * (k ? 31 : -29);
      r.cable.visible = r.kind === HEAVY && (r.st === HOLD || r.st === WAIT);
      r.under.scale.setScalar(1.8 + Math.sin(t * 6 + r.i) * 0.1);
      // the block in hand
      const slot = 4 * MAXB + r.i;
      const hgt = r.hu * BH;
      const showHand = r.st === HOLD || r.st === DROP || (r.st === WAIT && r.stT > (r.streak > 0 ? RELOAD_PERF : RELOAD) * 0.55 && this.ph === "play");
      if (showHand && (this.ph === "play" || this.ph === "pre")) {
        if (r.st === HOLD) r.pop = Math.min(1, r.pop + dt / 0.16);
        else if (r.st === WAIT) r.pop = 0;
        const sc = r.st === WAIT ? 0.25 : r.st === HOLD ? Math.max(0.05, backOut(r.pop)) : 1;
        let yb: number;
        if (r.st === DROP) yb = topY + Math.max(0, r.fy);
        else yb = r.dy + bob - CLAW - (r.kind === HEAVY ? CABLE : 0) - hgt;
        const swing = r.kind === HEAVY && r.st === HOLD ? -Math.sin(r.ph % TAU) * 0.12 * r.side : 0;
        this.writeBlock(slot, bxw, yb + hgt / 2, r.bw * sc, hgt * sc, swing + (r.st === HOLD ? r.tilt * 0.3 : r.st === DROP && this.L.roll ? this.leanAt(r, topY) : 0), r.kind);
        // its colour: the kind's, a REORG's lilac shimmer
        this.blockColor(r, r.kind, r.blk.length, this.c);
        if (r.reorg) this.c.lerp(this.lilac, 0.45 + Math.sin(t * 14) * 0.2);
        if (r.st === WAIT) this.c.lerp(this.white, 0.7);
        this.body.setColorAt(slot, this.c);
        if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
      } else {
        this.body.setMatrixAt(slot, this.zero);
        this.ink.setMatrixAt(slot, this.zero);
        for (let j = 0; j < 3; j++) this.dec.setMatrixAt(slot * 3 + j, this.zero);
      }
      // the ghost of the slot it lands in
      r.ghost.visible = r.st === HOLD && (this.ph === "play" || this.ph === "pre");
      if (r.ghost.visible) {
        r.ghost.position.set(TX[r.i] + r.cx + swayTop, topY + (r.hu * BH) / 2, 0);
        r.ghost.scale.set(r.kind === QB ? r.w : r.bw, r.hu * BH, DEP);
        r.ghost.rotation.z = this.leanAt(r, topY);
        // (brighter as the block comes over it, or would land on it: the affordance of a good drop)
        const near = clamp(1 - Math.abs(r.e) / Math.max(0.35, r.bw * 0.6), 0, 1);
        (r.ghost.material as THREE.MeshBasicMaterial).opacity = 0.1 + near * near * 0.3;
      }
      // afloat: the landing light, where it would come down now
      r.mark.visible = r.path.visible = !!this.L.float && r.st === HOLD && (this.ph === "play" || this.ph === "pre");
      if (r.mark.visible) {
        const lx = TX[r.i] + r.x + this.slide(r) * this.fallTime(r) + swayTop;
        r.mark.position.set(lx, topY + 0.07, 0);
        r.mark.scale.set(r.bw, 0.14, DEP + 0.12);
        (r.mark.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.3 * Math.sin(t * 10);
        // (the path: from under the block to the light, the way it will drift)
        const y0 = r.dy - this.hang(r) - 0.05,
          y1 = topY + 0.14;
        const dx = lx - xw,
          dy = y1 - y0;
        r.path.position.set((xw + lx) / 2, (y0 + y1) / 2, DEP / 2 + 0.05);
        r.path.rotation.z = Math.atan2(-dx, dy);
        r.path.scale.set(0.07, Math.hypot(dx, dy), 0.07);
      }
      // FINALIZED's halo
      r.shield.visible = r.immune > 0 && playing;
      if (r.shield.visible) {
        r.shield.position.set(xw, r.dy + 0.9, 0.3);
        r.shield.rotation.z = t * 2;
        r.shield.scale.setScalar(3.4 + Math.sin(t * 8) * 0.12);
      }
      // the snark rides its rig
      const a = r.a;
      const floor = r.dy + bob + 0.16;
      a.pos.y += floor - r.floorPrev;
      r.floorPrev = floor;
      a.pos.x = xw;
      a.pos.z = 0.1;
      a.physics(dt, floor);
      r.faceT -= dt;
      a.face(r.faceT > 0 ? r.faceYaw : 0, dt, 10);
      r.angryT -= dt;
      a.angry = r.angryT > 0;
      a.sync(dt, t);
      r.bump = Math.max(0, r.bump - dt * 3);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.ink.instanceMatrix.needsUpdate = true;
    this.dec.instanceMatrix.needsUpdate = true;
    // the REORG puffs: an arc from rig to rig
    for (const pf of this.puffs) {
      if (!pf.on) continue;
      const a = this.R[pf.from],
        b = this.R[pf.to];
      const u = clamp(pf.t / REORG_FLY, 0, 1);
      const x = lerp(a.dxw, b.dxw, u);
      const y = lerp(a.dy + 0.9, b.dy + 0.6, u) + Math.sin(u * Math.PI) * 3.2;
      pf.m.position.set(x, y, 0.8);
      pf.m.scale.setScalar(0.7 + Math.sin(t * 20) * 0.08);
      pf.m.rotation.set(t * 5, t * 7, 0);
      if (Math.random() < 0.7) this.fx.burst(pf.m.position, 2, TRAIL_C, TRAIL_O);
    }
    // the falling pieces
    for (let k = 0; k < this.pieces.length; k++) {
      const pc = this.pieces[k];
      if (!pc.on) continue;
      pc.t += dt;
      pc.vy -= 22 * dt;
      pc.x += pc.vx * dt;
      pc.y += pc.vy * dt;
      pc.z += pc.vz * dt;
      pc.rx += pc.wx * dt;
      pc.rz += pc.wz * dt;
      if (pc.y < -75 || pc.t > 5) {
        pc.on = false;
        this.pBody.setMatrixAt(k, this.zero);
        this.pInk.setMatrixAt(k, this.zero);
        continue;
      }
      this.e.set(pc.rx, 0, pc.rz);
      this.q.setFromEuler(this.e);
      this.m.compose(this.p.set(pc.x, pc.y, pc.z), this.q, this.s.set(pc.sx, pc.sy, DEP));
      this.pBody.setMatrixAt(k, this.m);
      this.m.compose(this.p, this.q, this.s.set(pc.sx + 0.1, pc.sy + 0.1, DEP + 0.1));
      this.pInk.setMatrixAt(k, this.m);
    }
    this.pBody.instanceMatrix.needsUpdate = true;
    this.pInk.instanceMatrix.needsUpdate = true;
    // clouds drift (with the wind when it blows)
    for (let k = 0; k < this.cloudData.length; k++) {
      const c = this.cloudData[k];
      c.x += (c.v + this.wind * 6) * dt;
      if (c.x > 70) c.x -= 140;
      if (c.x < -70) c.x += 140;
      this.m.compose(this.p.set(c.x, c.y, c.z), this.q0, this.s.set(c.sx, c.sy, c.sz));
      this.clouds.setMatrixAt(k, this.m);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
    // the wind's streaks
    const gusting = this.wind !== 0 || this.warn !== 0;
    if (gusting) {
      const dir = this.wind !== 0 ? Math.sign(this.wind) : this.warn;
      const str = Math.min(1, Math.abs(this.wind) * 1.6 + 0.25);
      const n = Math.round(10 + str * 26);
      this.streaks.count = n;
      for (let k = 0; k < n; k++) {
        const s = this.streakData[k];
        if (s.l <= 0 || Math.abs(s.x - this.at.x) > 30) {
          s.x = this.at.x - dir * (20 + Math.random() * 20);
          s.y = this.at.y + (Math.random() - 0.4) * 18;
          s.z = -6 + Math.random() * 12;
          s.l = 1.5 + Math.random() * 3;
        }
        s.x += dir * (26 + str * 18) * dt;
        this.m.compose(this.p.set(s.x, s.y, s.z), this.q0, this.s.set(s.l * (0.6 + str), 0.05, 0.05));
        this.streaks.setMatrixAt(k, this.m);
      }
      this.streaks.instanceMatrix.needsUpdate = true;
    } else this.streaks.count = 0;
    // the bands light up as they are passed; the thrusters flicker; the Z-Blocks spin
    for (let k = 0; k < MILES.length; k++) {
      if (this.bandLit[k] <= 0) continue;
      this.bandLit[k] = Math.max(0.12, this.bandLit[k] - dt * 0.8);
      this.bands.setColorAt(k, this.c.set(GLACIER).lerp(this.white, this.bandLit[k]));
    }
    if (this.bands.instanceColor) this.bands.instanceColor.needsUpdate = true;
    for (let k = 0; k < this.thrusters.length; k++) this.thrusters[k].scale.y = 1.8 + Math.sin(t * 17 + k * 2) * 0.25;
    for (let k = 0; k < this.props.length; k++) ((this.props[k].rotation.y = t * (0.6 + k * 0.2)), (this.props[k].position.y += Math.sin(t * 1.4 + k) * 0.004));
    if (this.scanBar.visible) {
      this.scanBar.position.y = (1 + this.scan) * BH;
      this.scanBar.scale.y = 0.09 + Math.sin(t * 20) * 0.02;
    }
    this.fx.update(dt);
    this.flashHud = Math.max(0, this.flashHud - dt * 1.5);
    this.hurt = Math.max(0, this.hurt - dt * 2.2);
  }

  // ---- the HUD ---------------------------------------------------------------------------------

  private popAt(r: Rig, s: string, c: string, big: boolean, delay = 0) {
    this.pops.push({ x: TX[r.i] + r.cx, y: this.topY(r) + 0.2, z: DEP / 2, s, c, t: this.clk + delay * 0.3, big });
  }

  private say(s: string, c: string, dur = 1.5, size = 58, delay = 0, y = H * 0.32) {
    this.says.push({ s, c, t: this.clk + delay, dur, size, y });
  }

  view() {
    return this.w;
  }

  draw(g: CanvasRenderingContext2D) {
    const cam = this.w.camera;
    const counting = this.ph === "tally" || this.ph === "win";
    // the edges: red when you miss, lilac when a REORG comes for you
    if (this.flash > 0.05 && this.L.roll) {
      g.fillStyle = `rgba(230,236,255,${Math.min(0.45, this.flash * 0.5)})`;
      g.fillRect(0, 0, W, H);
    }
    const hr = this.human >= 0 ? this.R[this.human] : null;
    const inc = hr && hr.incoming > 0 ? 1 - hr.incoming / REORG_FLY : 0;
    if (this.hurt > 0 || inc > 0) {
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.38, W / 2, H / 2, W * 0.64);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, inc > 0 ? `rgba(196,177,252,${0.25 + inc * 0.3})` : `rgba(255,50,80,${0.4 * this.hurt})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
    // name tags over the snarks
    for (const r of this.R) {
      const s = toScreen(r.a.head(this.v), cam);
      if (s.on && !counting) tag(g, r.p, s.x, s.y);
    }
    // your REORG's target, marked (while it's ready)
    if (hr && this.ph === "play" && hr.cd <= 0) {
      const tg = this.targetOf(hr);
      const s = toScreen(this.v.set(tg.dxw, tg.dy + 0.6, 0.4), cam);
      if (s.on) this.reticle(g, s.x, s.y, tg.immune > 0);
    }
    // the floating words
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      const k = (this.clk - p.t) / 1.1;
      if (k >= 1) {
        this.pops.splice(i, 1);
        continue;
      }
      if (k < 0) continue;
      const s = toScreen(this.v.set(p.x, p.y, p.z), cam);
      if (!s.on) continue;
      const sc = backOut(Math.min(1, k * 5));
      g.globalAlpha = k > 0.78 ? (1 - k) / 0.22 : 1;
      shout(g, p.s, s.x, s.y - 8 - easeOut(Math.min(1, k * 1.6)) * 34, (p.big ? 28 : 20) * sc, p.c);
      g.globalAlpha = 1;
    }
    if (counting) this.tallyHud(g);
    // the corner panels: the heights, the PERFECT streaks
    let hi = 0;
    for (const r of this.R) hi = Math.max(hi, counting ? r.shown : r.h);
    this.lead.length = 0;
    for (const r of this.R) {
      const v = counting ? r.shown : r.h;
      this.vals[r.i] = String(v);
      if (hi > 0 && v === hi && (!counting || r.topped)) this.lead.push(r.i);
      this.subs[r.i] = r.streak >= 2 ? T(`PERFECT ×${r.streak}`, `完美 ×${r.streak}`) : r.perf ? T(`${r.perf} perfect`, `完美 ${r.perf}`) : "";
    }
    corners(g, this.players, this.vals, { lead: this.lead, sub: this.subs });
    if (this.ph === "play" || this.ph === "pre") {
      clock(g, TIME - this.t);
      this.blockTimer(g);
      if (hr) this.reorgButton(g, hr);
      if (this.warn || this.wind) this.windPill(g);
    }
    for (let i = this.says.length - 1; i >= 0; i--) {
      const b = this.says[i];
      const k = (this.clk - b.t) / b.dur;
      if (k >= 1) {
        this.says.splice(i, 1);
        continue;
      }
      if (k > 0) banner(g, b.s, k, b.c, b.y, b.size);
    }
  }

  /** Under the clock: the next block found (a 12 s ring of ticks). */
  private blockTimer(g: CanvasRenderingContext2D) {
    if (this.found >= 3) return;
    const next = FOUND_EVERY * (this.found + 1);
    const left = Math.max(0, next - this.t);
    const k = 1 - left / FOUND_EVERY;
    const x = W / 2,
      y = 78;
    const w = 150,
      h = 24;
    // (a small screen: the timer grows down from its top, under the clock, until its words read)
    grow(g, x, y - h / 2, 12, () => this.blockTimerAt(g, x, y, w, h, k, left));
  }
  private blockTimerAt(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, left: number) {
    g.save();
    rr(g, x - w / 2, y - h / 2 + 2, w, h, h / 2);
    g.fillStyle = "rgba(6,3,18,0.4)";
    g.fill();
    rr(g, x - w / 2, y - h / 2, w, h, h / 2);
    g.fillStyle = INK;
    g.fill();
    rr(g, x - w / 2 + 3, y - h / 2 + 3, (w - 6) * k, h - 6, (h - 6) / 2);
    g.fillStyle = left < 2 ? QCOL : "rgba(255,207,46,0.55)";
    g.fill();
    if (this.flashHud > 0) {
      g.globalAlpha = this.flashHud;
      rr(g, x - w / 2 - 3, y - h / 2 - 3, w + 6, h + 6, h / 2 + 3);
      g.lineWidth = 3;
      g.strokeStyle = QCOL;
      g.stroke();
      g.globalAlpha = 1;
    }
    text(g, T(`Z-BLOCK IN ${Math.ceil(left)}s`, `Z 方块 ${Math.ceil(left)} 秒`), x, y + 1, 12, "#ffffff", "center", 900);
    g.restore();
  }

  /** Your B: REORG at the tallest rival, its cooldown round the button. */
  private reorgButton(g: CanvasRenderingContext2D, r: Rig) {
    const x = W / 2 - 64,
      y = H - 34;
    const ready = r.cd <= 0;
    const tg = this.targetOf(r);
    g.save();
    rr(g, x - 26, y - 20, 196, 40, 20);
    g.fillStyle = "rgba(15,10,38,0.78)";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = ready ? LILAC : "rgba(255,255,255,0.18)";
    g.stroke();
    g.globalAlpha = ready ? 1 : 0.55;
    // (a touch screen's button shows the reorg, not a letter: the same here)
    padBtn(g, "b", x, y, 15, touchy() ? actsOf("stack").b : undefined);
    g.globalAlpha = 1;
    if (!ready) {
      const k = clamp(r.cd / REORG_CD, 0, 1);
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
      g.closePath();
      g.fillStyle = "rgba(10,6,30,0.6)";
      g.fill();
    }
    text(g, "REORG", x + 26, y - 7, 14, ready ? LILAC : "rgba(255,255,255,0.5)", "left", 900);
    const who = tg.immune > 0 ? T(`${short(tg.p)}: finalized`, `${short(tg.p)}：已确认`) : T(`▸ ${short(tg.p)} (tallest)`, `▸ ${short(tg.p)}（最高）`);
    text(g, ready ? who : T(`ready in ${Math.ceil(r.cd)}s`, `${Math.ceil(r.cd)} 秒后就绪`), x + 26, y + 9, 11, ready ? "#ffffff" : "rgba(255,255,255,0.5)", "left", 700);
    g.restore();
  }

  private reticle(g: CanvasRenderingContext2D, x: number, y: number, dim: boolean) {
    const t = this.clk;
    const r = 30 + Math.sin(t * 6) * 2;
    g.save();
    g.translate(x, y);
    g.rotate(t * 1.5);
    g.globalAlpha = dim ? 0.35 : 0.9;
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = LILAC;
    g.setLineDash([10, 7]);
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.fillStyle = LILAC;
      g.fillRect(r - 2, -2, 10, 4);
    }
    g.restore();
  }

  private windPill(g: CanvasRenderingContext2D) {
    const dir = this.wind !== 0 ? Math.sign(this.wind) : this.warn;
    const x = W / 2 + 150,
      y = 34;
    const k = Math.min(1, Math.abs(this.wind) * 1.4);
    g.save();
    rr(g, x - 44, y - 15, 88, 30, 15);
    g.fillStyle = `rgba(15,10,38,${0.6 + k * 0.25})`;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = GLACIER;
    g.stroke();
    const arrow = dir > 0 ? "▶▶" : "◀◀";
    text(g, dir > 0 ? `${T("GUST", "阵风")} ${arrow}` : `${arrow} ${T("GUST", "阵风")}`, x, y + 1, 13, GLACIER, "center", 900);
    g.restore();
  }

  /** The count: each tower's number climbing over its scan point, popping at its top. */
  private tallyHud(g: CanvasRenderingContext2D) {
    const cam = this.w.camera;
    for (const r of this.R) {
      const y = (1 + Math.min(r.h, this.scan)) * BH + 0.8;
      const s = toScreen(this.v.set(TX[r.i] + r.cx, y, DEP / 2), cam);
      if (!s.on) continue;
      const big = r.topped;
      const sz = (big ? 40 : 30) * (1 + r.bump * 0.35);
      const win = this.ph === "win" && r.i === this.final[0];
      numeral(g, String(r.shown), s.x, s.y - 10, win ? sz * 1.25 : sz, big ? tint(r.p.color, 0.25) : "#ffffff", "center");
      if (win) toy(g, r.p.human ? T("YOU WIN!", "你赢了！") : T(`${short(r.p)} WINS!`, `${short(r.p)} 获胜！`), s.x, s.y - 58, 26, r.p.color);
    }
  }

  private publish() {
    const h = this.hook!;
    const r = this.R[this.human >= 0 ? this.human : 0];
    h.ph = this.ph;
    h.t = this.t;
    h.dt = this.lastDt;
    h.pt = this.pt;
    h.reorg = r.reorg && r.st === HOLD && r.pop >= 1;
    h.st = r.st;
    h.e = r.e;
    h.dir = r.dir;
    h.v = r.vc;
    h.w = r.w;
    h.cd = r.cd;
    h.n = r.spawned;
    h.hs = this.R.map((o) => o.h).join(",");
  }

  result() {
    return this.over;
  }

  dispose() {
    for (const r of this.R) r.a.dispose();
    disposeScene(this.w.scene);
  }
}

export const STACK: MiniDef = {
  key: "stack",
  title: "CHAIN STACK",
  titleZh: "区块叠叠高",
  tag: "Drop your blocks dead on. The tallest chain wins!",
  tagZh: "看准时机落块，链最高者胜！",
  help: "A drops the block: line it up, the overhang is sliced off · 3 PERFECTs in a row grow it back · Z-Blocks +3 · B sends a REORG at the tallest rival · tallest chain in 45 s wins",
  helpZh: "A 键落块：对准你的塔，多出的部分会被切掉 · 连续 3 次完美会变宽 · Z 方块 +3 · B 向最高的对手发射 REORG · 45 秒内链最高者胜",
  pad: ["a", "b"],
  tap: true,
  color: "#ff6b35",
  song: "funk",
  ambience: "city-day",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `stack-${l.key}`, song: l.song, ambience: l.ambience })),
  make: (players, rnd, variant) => new Stack(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};
export default STACK;
