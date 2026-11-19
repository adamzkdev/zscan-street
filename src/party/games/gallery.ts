/**
 * NULLIFIER GALLERY (废止符靶场): ZK PARTY's aiming game, a carnival shooting gallery set up in the
 * yard of the ZEC STATE PENITENTIARY, where the transparent addresses are locked up. Four snarks stand at
 * the front rail, each behind a nullifier cannon; each one's crosshair, in their colour, roams the
 * gallery wall.
 *
 * Targets ride three tiered lanes (front, middle, back), swing on ropes and streak along a wire:
 * - the transparent addresses (P2PKH and P2SH locks, cracked t-addr padlocks, "PUBLIC" bullseye plates) are
 *   good to hit: they shatter into rusty voxels with a clank;
 * - shielded ORCHARD shields (glowing glacier hexagons) can't be broken: a hit
 *   costs points and stuns your cannon;
 * - a DUST ATTACK basket takes two hits (the first knocks it down into the lane in front, where
 *   anyone can steal it) and the TRACKER'S PROBE streaks across the top, fast and worth the most.
 *
 * Arrows move your crosshair (it starts slow for precision, speeds up while held and stops dead
 * on release); A fires a glowing nullifier with a short flight; B fires a charged bolt that pierces two
 * targets, then recharges. Hits in a row build a combo (×2 from the 5th, ×3 from the 15th); a miss
 * or a shield breaks it (a target a rival's shot reached first does not). A target hit by two players goes to the first shot to land.
 *
 * Three waves of ~15 s (slow pop-ups, sliding conveyors, the EXPOSURE RUSH with everything fast and
 * swinging), then a tally: most points wins (ties: more t-addrs nullified, then the best combo).
 *
 * The AIs (by skill): they pick targets by value, distance and time left, lead moving ones, move
 * their crosshair like a hand (a reaction delay, a springy approach that overshoots and corrects
 * when not so good), fire once steady, avoid targets a rival already has a shot on, and keep B
 * for a pierce or a prize. Weak ones sometimes take a shield for a key.
 *
 * Three levels (LEVELS below), the same rules and controls:
 * - PENITENTIARY YARD: dusk in the prison's yard, the booth as described above.
 * - ZEC LINE EXPRESS: the booth is an observation car of the ZEC LINE by day, ZStreet rushing past;
 *   the lanes are three goods trains running alongside (their cars slide by at their own speeds).
 *   The car's window pillars stand between you and them: a target behind a pillar can't be hit and
 *   a shot into a pillar clangs off it (a miss). No swingers: the trains are busier instead.
 * - ZK CEMETERY: night among the dead addresses' tombs. It is dark: every shot bursts into a flare
 *   where it lands (B's bolt into a big one), the wisp on the wire and the watchman's lantern light
 *   what they pass. Unlit, a shield is a dark shape like any lock (more of them here): light it, or
 *   gamble. The AIs misread unlit shields as the weaker eyes do, and prefer what they can see.
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { music, type SongKey } from "../music";
import { FONT, H, HUD, W, backOut, clamp, easeOut, fpx, rankBy, rng, rr, sound, text, zoom, type Input, type IntroShot, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { Avatar, CamRig, Fx3, GEO, banner, block, canvasTex, clock, clockK, corners, disposeScene, glow, label, outline, qBlock, short, skyDome, skyline, tag, toScreen, toon, world, type World } from "../k3";
import { INK, badge, crown, numeral, tint, toy } from "../hud";
import type { AmbienceKind } from "../../audio/kinds";

// ---- the rules in numbers ------------------------------------------------------------------------

/** The three waves (s): pop-ups, conveyors, the exposure rush. Then the tally. */
const WAVES = [15, 15, 16];
const W2 = WAVES[0];
const W3 = WAVES[0] + WAVES[1];
const PLAY = W3 + WAVES[2];
const TALLY = 3.6;
/** A's fire rate; B's recharge; the nullifier's flight (A, B); the stun a shield gives. */
const FIRE_CD = 0.26;
const CHARGE_CD = 4.2;
const TRAVEL = 0.17;
const TRAVEL_B = 0.11;
const STUN = 1.1;
/** The crosshair (HUD px/s): its first speed, how fast it gathers pace, its top speed. Release stops it dead. */
const AIM_V0 = 170;
const AIM_ACC = 1700;
const AIM_MAX = 760;
/** The grace round a target (px): a nullifier, the charged bolt. */
const GRACE = 6;
const GRACE_B = 15;
/** Where the crosshairs may go on the 960×540 HUD. */
const X0 = 24;
const X1 = 936;
const Y0 = 66;
const Y1 = 398;
/** Hits in a row for ×2, ×3. */
const C2 = 5;
const C3 = 15;
/** The lanes: depth, the targets' centre height when up, the conveyor's speed (m/s, its sign the way). */
const LANES = [
  { z: -1.5, y: 2.0, v: 2.3 },
  { z: -5, y: 4.3, v: -2.8 },
  { z: -8.5, y: 6.6, v: 3.3 },
] as const;
/** A lane target's drop below its full height when down (hidden behind its lane's board). */
const DROP = 2.15;
/** The board's top under a lane's targets. */
const BOARD = 0.62;
/** The swingers: their beam (z, height), the ropes' length, the four slots. */
const SW_Z = -3.3;
const SW_Y = 10.9;
const SW_L = 3.3;
const SW_X = [-7.6, -2.5, 2.5, 7.6];
/** The tracker's probe's wire. */
const WIRE_Z = -10.4;
const WIRE_Y = 9.3;
/** The play camera. */
const EYE = new THREE.Vector3(0, 7.2, 18);
const AT = new THREE.Vector3(0, 3.4, -4);
const FOV = 40;
/** The rail (the cannons on it), where the snarks stand, and their places along it by seat. */
const RAIL_Z = 4.4;
const RAIL_Y = 1.15;
const STAND_Z = 5.75;
const SEAT_X = [-1.5, 1.5, -4.3, 4.3];
const SIZE = 1.22;
/** The specials' times (s): the probes (warned 0.9 s ahead) and the baskets. */
const QUBITS = [9.5, 21, 27.5, 33, 37.5, 41.5, 44.6];
const BASKETS = [5, 11.5, 18, 24.5, 31.5, 37, 42];
/** The bench's balance runs: `&turbo=3` steps the game three times a frame (software WebGL is slow). */
const TURBO = typeof location !== "undefined" && location.pathname.includes("partylab") ? clamp(Math.round(Number(new URLSearchParams(location.search).get("turbo")) || 1), 1, 4) : 1;

// ---- the levels ----------------------------------------------------------------------------------

type GKind = "yard" | "train" | "dark";
interface GLevel {
  key: string;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  song: SongKey;
  ambience: AmbienceKind;
  kind: GKind;
  /** The sky (top, horizon) and the fog. */
  sky: [string, string];
  fog: [number, number];
  /** The pop-ups' pace by wave (s, ±30 %), the conveyors' spacing (m: least, plus up to), the shields' share by wave. */
  pop: number[];
  gap: number[];
  shield: number[];
  /** The rush's swingers on their beam. */
  swing: boolean;
  /** The waves: the strip's names, the announcer's calls (title, line under it, colour). */
  strip: [string, string][];
  calls: { s: [string, string]; sub: [string, string]; c: string }[];
}

const LEVELS: GLevel[] = [
  {
    key: "yard",
    title: "PENITENTIARY YARD",
    titleZh: "监狱大院",
    tag: "Dusk in the ZEC State Penitentiary's yard: pop-ups, sliding rows, then the swinging rush.",
    tagZh: "ZEC 州立监狱大院的黄昏：弹出靶、滑动靶排，最后是摇摆冲刺。",
    song: "neon",
    ambience: "city-night",
    kind: "yard",
    sky: ["#3446b8", "#ffb48a"],
    fog: [90, 320],
    pop: [0.22, 0.65, 0.38],
    gap: [2.7, 1.8],
    shield: [0.15, 0.2, 0.25],
    swing: true,
    strip: [
      ["T-ADDR", "透明"],
      ["ROWS", "滑排"],
      ["RUSH", "冲刺"],
    ],
    calls: [
      { s: ["WAVE 1: T-ADDRS!", "第 1 波：透明地址！"], sub: ["shatter the transparent locks · never the Orchard shields", "打碎透明锁 · 别碰 Orchard 护盾"], c: "#ff6b35" },
      { s: ["WAVE 2: CONVEYORS!", "第 2 波：传送带！"], sub: ["the rows are sliding", "靶排开始滑动"], c: "#a8d8e8" },
      { s: ["EXPOSURE RUSH!", "曝光冲刺！"], sub: ["everything fast · everything swinging", "全速 · 全摇摆"], c: "#ff6b35" },
    ],
  },
  {
    key: "express",
    title: "ZEC LINE EXPRESS",
    titleZh: "ZEC 线快车",
    tag: "Aboard the ZEC Line: goods trains roll alongside, and the window pillars block your shots.",
    tagZh: "搭上 ZEC 线：货车并排驶过，车窗立柱会挡住你的射击。",
    song: "chase",
    ambience: "train",
    kind: "train",
    sky: ["#3b8cff", "#c8ecff"],
    fog: [110, 360],
    pop: [0.2, 0.55, 0.3],
    gap: [2.4, 1.5],
    shield: [0.15, 0.2, 0.24],
    swing: false,
    strip: [
      ["DEPART", "发车"],
      ["TRAINS", "并行"],
      ["RUSH", "冲刺"],
    ],
    calls: [
      { s: ["ALL ABOARD!", "全体上车！"], sub: ["shoot through the windows · the pillars block", "从车窗射击 · 立柱会挡住"], c: "#ff6b35" },
      { s: ["TRAINS ALONGSIDE!", "列车并行！"], sub: ["the cars slide by", "车厢在滑过"], c: "#a8d8e8" },
      { s: ["FULL THROTTLE!", "全速前进！"], sub: ["everything fast · everything the other way", "全速 · 方向反转"], c: "#ff6b35" },
    ],
  },
  {
    key: "graveyard",
    title: "ZK CEMETERY",
    titleZh: "零知识墓园",
    tag: "Night in the ZK Cemetery: every shot lights a flare, and in the dark a shield looks like a lock.",
    tagZh: "零知识墓园的夜晚：每一枪都会点亮照明弹，黑暗中护盾和锁一模一样。",
    song: "tense",
    ambience: "city-night",
    kind: "dark",
    sky: ["#070614", "#2a1d52"],
    fog: [50, 190],
    pop: [0.22, 0.62, 0.36],
    gap: [2.6, 1.7],
    shield: [0.24, 0.28, 0.32],
    swing: true,
    strip: [
      ["RISE", "复苏"],
      ["MARCH", "游行"],
      ["RUSH", "冲刺"],
    ],
    calls: [
      { s: ["LIGHTS OUT!", "熄灯！"], sub: ["your shots light flares · in the dark a shield looks like a lock", "射击会点亮照明弹 · 黑暗中护盾像锁"], c: "#c4b1fc" },
      { s: ["THE PROCESSION!", "亡址游行！"], sub: ["the dead t-addrs march by", "死去的透明地址列队走过"], c: "#a8d8e8" },
      { s: ["MIDNIGHT RUSH!", "午夜冲刺！"], sub: ["everything fast · everything swinging", "全速 · 全摇摆"], c: "#ff6b35" },
    ],
  },
];

/** The express: the car's window pillars (x, half width), the plane they stand in, their height; the world's speed past it (m/s). */
const PIL_X = [-7.6, -2.6, 2.6, 7.6];
const PIL_HW = 0.75;
const PIL_Z = 1.8;
const PIL_TOP = 9.6;
const RUSH_V = 24;
/** The graveyard: a flare's life (s) and reach (m), a nullifier's and a bolt's; how lit a shield must be to be known for one. */
const FLARE_T = [2.4, 3.6];
const FLARE_R = [2.7, 4.6];
const LIT_K = 0.45;
/** A weak eye in the dark takes a shield for a lock this often (until it is lit). */
const darkMisread = (sk: number) => 0.12 + 0.5 * (1 - sk);

// ---- the targets ---------------------------------------------------------------------------------

const RSA = 0;
const ECDSA = 1;
const ED = 2;
const PLATE = 3;
const SHIELD = 4;
const BASKET = 5;
const QUBIT = 6;
const PTS = [10, 10, 10, 20, -20, 30, 50];
/** A target's hit radius (m) and the height of its hit centre over its body's centre. */
const RAD = [0.82, 0.82, 0.82, 0.68, 0.88, 0.95, 0.66];
const HC = [0.18, 0.18, 0.22, 0, 0, 0.12, 0];
/** What a target breaks into. */
const SHARDS: readonly (readonly string[])[] = [
  ["#c2452f", "#8e2f22", "#e0784a", "#5b2219", "#cfc8bc", "#9a9aa8"],
  ["#3e9a84", "#28695a", "#86d0b2", "#7d5230", "#cfc8bc", "#9a9aa8"],
  ["#b46a2f", "#7c4520", "#de9552", "#4a2a18", "#c4bcae", "#8f8a80"],
  ["#f3e4c6", "#e14a3b", "#ffffff", "#b9a27a"],
  ["#bff0ff", "#6cd0f0", "#ffffff", "#a8d8e8"],
  ["#d9bc8a", "#b08850", "#ff6b35", "#c4b1fc", "#a8d8e8"],
  ["#c4b1fc", "#ffffff", "#9d7bff", "#ff6b35", "#a8d8e8"],
];

/** A target's ways of moving. */
const LANE = 0;
const SWING = 1;
const STREAK = 2;
const FALL = 3;

interface Tgt {
  on: boolean;
  id: number;
  kind: number;
  mode: number;
  lane: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  /** Seconds before it sinks (lane targets). */
  hold: number;
  /** 0…1 risen (lane targets), or let down (swingers). */
  up: number;
  hp: number;
  /** A swinger: its slot, swing, speed, phase. */
  slot: number;
  amp: number;
  om: number;
  ph: number;
  /** Tilt (z), turn (y), the wobble of a hit. */
  rot: number;
  spin: number;
  wob: number;
  /** A fall: the lane it lands in. */
  tl: number;
  /** Leaving at the end (swingers pulled up). */
  away: boolean;
  /** On the HUD: centre, radius, speed (px, px/s), distance from the eye. */
  sx: number;
  sy: number;
  sr: number;
  svx: number;
  svy: number;
  dep: number;
  ok: boolean;
  /** Can be hit now. */
  live: boolean;
  /** Seats with a nullifier in flight at it (bits). */
  inbound: number;
  /** Seats whose eye takes this shield for a lock (bits: weak AIs). */
  misread: number;
  /** How lit it is (the graveyard; 1 elsewhere). */
  lit: number;
}

/** A flare burning where a shot landed (the graveyard). */
interface Flare {
  on: boolean;
  x: number;
  y: number;
  z: number;
  t: number;
  dur: number;
  r: number;
  c: THREE.Color;
}

interface Shot {
  on: boolean;
  seat: number;
  big: boolean;
  t: number;
  dur: number;
  /** Where it was aimed on the HUD, and what was under it then. */
  px: number;
  py: number;
  aim: number;
  ox: number;
  oy: number;
  oz: number;
  ex: number;
  ey: number;
  ez: number;
  /** Its flight now (for the trail). */
  x: number;
  y: number;
  z: number;
}

interface Pop {
  on: boolean;
  x: number;
  y: number;
  t: number;
  s: string;
  c: string;
  size: number;
}

interface Gun {
  i: number;
  p: Player;
  a: Avatar;
  /** The crosshair (HUD px) and its speed. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The human's pace along the held direction. */
  spd: number;
  /** The human's buffered presses (s left). */
  bufA: number;
  bufB: number;
  hx: number;
  hy: number;
  cd: number;
  bcd: number;
  stun: number;
  score: number;
  shown: number;
  hits: number;
  shots: number;
  shields: number;
  combo: number;
  best: number;
  /** The AI: its target (index, id), when it thinks again, its reaction, its aim error, its trigger, how long it has aimed. */
  goal: number;
  goalId: number;
  think: number;
  react: number;
  ex: number;
  ey: number;
  trig: number;
  aimT: number;
  /** The cannon: where it points (world), its kick, its muzzle. */
  dx: number;
  dy: number;
  dz: number;
  kick: number;
  mx: number;
  my: number;
  mz: number;
  hop: number;
  angryT: number;
  /** The bench's scripted human: where to aim, fire, charge (the advice the keys follow). */
  bgx: number;
  bgy: number;
  bgr: number;
  bblock: boolean;
  bfire: boolean;
  bcharge: boolean;
  /** The AI minds the window pillars for this target (a careless hand fires into them). */
  care: boolean;
}

// ---- sound ---------------------------------------------------------------------------------------

function beep(f: number, dur: number, type: OscillatorType = "square", vol = 0.3, slide = 0, delay = 0) {
  const s = sound();
  if (!s) return;
  const t = s.ac.currentTime + delay;
  const o = s.ac.createOscillator();
  const g = s.ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(s.bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}
let noiseBuf: AudioBuffer | null = null;
function hiss(dur: number, vol: number, hp = 1500, delay = 0) {
  const s = sound();
  if (!s) return;
  if (!noiseBuf || noiseBuf.sampleRate !== s.ac.sampleRate) {
    noiseBuf = s.ac.createBuffer(1, Math.floor(s.ac.sampleRate * 0.5), s.ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = s.ac.currentTime + delay;
  const src = s.ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = s.ac.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const g = s.ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(s.bus);
  src.start(t);
  src.stop(t + dur + 0.02);
}
const SND = {
  pew: (k: number) => (beep(980, 0.07, "square", 0.07 * k, 1.7), beep(1960, 0.05, "triangle", 0.05 * k, 1.3)),
  bolt: (k: number) => (beep(160, 0.26, "sawtooth", 0.13 * k, 4), hiss(0.2, 0.18 * k, 1800), beep(1320, 0.18, "square", 0.06 * k, 1.5, 0.05)),
  clank: (k: number) => (beep(1700 + Math.random() * 300, 0.06, "square", 0.11 * k), beep(560, 0.14, "triangle", 0.22 * k, 0.45), hiss(0.1, 0.26 * k, 3200), beep(2600, 0.09, "triangle", 0.05 * k, 0.8, 0.03)),
  buzz: (k: number) => (beep(92, 0.42, "sawtooth", 0.22 * k, 0.9), beep(97, 0.42, "square", 0.13 * k, 0.9), hiss(0.15, 0.12 * k, 600)),
  knock: (k: number) => (hiss(0.16, 0.3 * k, 400), beep(140, 0.2, "sine", 0.4 * k, 0.5), beep(880, 0.06, "square", 0.08 * k)),
  miss: (k: number) => beep(240, 0.08, "triangle", 0.06 * k, 0.7),
  combo: (n: number) => [660, 880, 1175, 1568].slice(0, n + 2).forEach((f, i) => beep(f, 0.09, "square", 0.14, 0, i * 0.05)),
  qubit: () => (beep(1250, 0.4, "triangle", 0.12, 2.1), beep(2500, 0.3, "sine", 0.05, 0.6, 0.2)),
  prize: (k: number) => [988, 1318, 1568, 1976].forEach((f, i) => beep(f, 0.12, "square", 0.16 * k, 0, i * 0.06)),
  wave: () => [523, 659, 784, 1046].forEach((f, i) => beep(f, i === 3 ? 0.3 : 0.1, "square", 0.18, 0, i * 0.08)),
  rush: () => [392, 523, 392, 523, 784].forEach((f, i) => beep(f, 0.1, "sawtooth", 0.14, 0, i * 0.09)),
};

// ---- the art: the targets' faces (one atlas), the booth's paints ----------------------------------

const CELL = 256;
const MARGIN = 24;
/** The atlas's cells: the five faces painted on target bodies. */
const CELL_OF = [0, 1, 2, 3, 4, 5];

function atlas() {
  return canvasTex(1024, 512, (g) => {
    const cell = (c: number, side: string, paint: (x: number, y: number, s: number) => void) => {
      const x = (c % 4) * CELL,
        y = Math.floor(c / 4) * CELL;
      g.fillStyle = side;
      g.fillRect(x, y, CELL, CELL);
      g.save();
      g.beginPath();
      g.rect(x + MARGIN, y + MARGIN, CELL - MARGIN * 2, CELL - MARGIN * 2);
      g.clip();
      paint(x + MARGIN, y + MARGIN, CELL - MARGIN * 2);
      g.restore();
    };
    const words = (s: string, x: number, y: number, size: number, fill: string, ink = "#2a1410", wide = 1) => {
      g.save();
      g.translate(x, y);
      g.scale(wide, 1.22);
      g.font = `900 ${size}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineWidth = size * 0.22;
      g.strokeStyle = ink;
      g.strokeText(s, 0, 0);
      g.fillStyle = fill;
      g.fillText(s, 0, 0);
      g.restore();
    };
    const keyhole = (x: number, y: number, s: number) => {
      g.fillStyle = "#1a1033";
      g.beginPath();
      g.arc(x, y, s * 0.075, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(x - s * 0.035, y);
      g.lineTo(x - s * 0.06, y + s * 0.16);
      g.lineTo(x + s * 0.06, y + s * 0.16);
      g.lineTo(x + s * 0.035, y);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, y, s * 0.11, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    };
    const lock = (x: number, y: number, s: number, light: string, body: string, dark: string, name: string, extra: () => void) => {
      const gr = g.createLinearGradient(0, y, 0, y + s);
      gr.addColorStop(0, light);
      gr.addColorStop(0.55, body);
      gr.addColorStop(1, dark);
      g.fillStyle = gr;
      g.fillRect(x, y, s, s);
      // rust: blotches and drips (fixed, so every lock of a kind is the same lock)
      let seed = name.length * 97 + 13;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 14; i++) {
        g.fillStyle = `rgba(${90 + r() * 60 | 0},${40 + r() * 30 | 0},${15 + r() * 20 | 0},${0.18 + r() * 0.25})`;
        const bx = x + r() * s,
          by = y + r() * s;
        g.beginPath();
        g.ellipse(bx, by, 6 + r() * 16, 4 + r() * 10, r() * 3, 0, Math.PI * 2);
        g.fill();
        if (r() < 0.5) g.fillRect(bx - 2, by, 4, 14 + r() * 30);
      }
      // the bevel
      g.fillStyle = "rgba(255,255,255,0.28)";
      g.fillRect(x, y, s, 9);
      g.fillRect(x, y, 9, s);
      g.fillStyle = "rgba(0,0,0,0.28)";
      g.fillRect(x, y + s - 9, s, 9);
      g.fillRect(x + s - 9, y, 9, s);
      // rivets
      for (const [rx, ry] of [
        [x + 22, y + 22],
        [x + s - 22, y + 22],
        [x + 22, y + s - 22],
        [x + s - 22, y + s - 22],
      ]) {
        g.fillStyle = "rgba(0,0,0,0.45)";
        g.beginPath();
        g.arc(rx + 1.5, ry + 2, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#d9d2c4";
        g.beginPath();
        g.arc(rx, ry, 7.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.arc(rx - 2.5, ry - 2.5, 2.5, 0, Math.PI * 2);
        g.fill();
      }
      extra();
      words(name, x + s / 2, y + s * 0.3, name.length > 4 ? 40 : 58, "#fff3dc", "#2a1410", name.length > 5 ? 0.86 : 1);
      keyhole(x + s / 2, y + s * 0.6, s);
    };
    // P2PKH: a brick-red lock
    cell(0, "#7d2a1f", (x, y, s) => lock(x, y, s, "#e2664a", "#c2452f", "#8e2f22", "P2PKH", () => {}));
    // P2SH: verdigris, a script's curve drawn on
    cell(1, "#24584b", (x, y, s) =>
      lock(x, y, s, "#64bfa4", "#3e9a84", "#28695a", "P2SH", () => {
        g.strokeStyle = "rgba(255,243,220,0.55)";
        g.lineWidth = 5;
        g.beginPath();
        for (let i = 0; i <= 40; i++) {
          const u = -1 + (i / 40) * 2.2;
          const v = Math.sqrt(Math.max(0, u * u * u - u + 1));
          const px = x + s * 0.5 + u * s * 0.28,
            py = y + s * 0.82 - v * s * 0.1;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.stroke();
      }),
    );
    // t-addr: a rusty padlock, cracked across
    cell(2, "#6a3a1a", (x, y, s) =>
      lock(x, y, s, "#d58a48", "#b46a2f", "#7c4520", "t-addr", () => {
        g.strokeStyle = "#2a1410";
        g.lineWidth = 6;
        g.lineJoin = "miter";
        g.beginPath();
        g.moveTo(x + s * 0.08, y + s * 0.48);
        g.lineTo(x + s * 0.3, y + s * 0.42);
        g.lineTo(x + s * 0.4, y + s * 0.56);
        g.lineTo(x + s * 0.62, y + s * 0.45);
        g.lineTo(x + s * 0.72, y + s * 0.6);
        g.lineTo(x + s * 0.95, y + s * 0.52);
        g.stroke();
        g.strokeStyle = "rgba(255,220,180,0.4)";
        g.lineWidth = 2;
        g.stroke();
      }),
    );
    // PUBLIC: a bullseye plate
    cell(3, "#b9a27a", (x, y, s) => {
      const cx = x + s / 2,
        cy = y + s / 2;
      const rings = ["#e14a3b", "#f6ead2", "#e14a3b", "#f6ead2"];
      for (let i = 0; i < rings.length; i++) {
        g.fillStyle = rings[i];
        g.beginPath();
        g.arc(cx, cy, (s / 2) * (1 - i * 0.2), 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(cx, cy, s / 2 - 2, 0, Math.PI * 2);
      g.stroke();
      words("PUBLIC", cx, cy - 6, 38, "#ffffff", "#5a1410", 0.9);
      words("t1…", cx, cy + 40, 30, "#ffffff", "#5a1410");
    });
    // ORCHARD: a glowing glacier hexagon, a halo of rings on it
    cell(4, "#1f6f9a", (x, y, s) => {
      const gr = g.createLinearGradient(x, y, x + s, y + s);
      gr.addColorStop(0, "#c8f4ff");
      gr.addColorStop(0.5, "#5cc8ef");
      gr.addColorStop(1, "#2384bd");
      g.fillStyle = gr;
      g.fillRect(x, y, s, s);
      // the halo: rings round the centre, points along each (Halo 2's proofs folding into one)
      g.strokeStyle = "rgba(8,40,90,0.5)";
      g.lineWidth = 2.5;
      for (let i = 1; i <= 5; i++) {
        const r = s * 0.1 * i;
        g.beginPath();
        g.arc(x + s / 2, y + s / 2, r, 0, Math.PI * 2);
        g.stroke();
        for (let k = 0; k < i * 4; k++) {
          const a = (k / (i * 4)) * Math.PI * 2 + i;
          g.fillStyle = (k + i) % 3 === 0 ? "#ffffff" : "rgba(255,255,255,0.7)";
          g.beginPath();
          g.arc(x + s / 2 + Math.cos(a) * r, y + s / 2 + Math.sin(a) * r, 4.5, 0, Math.PI * 2);
          g.fill();
        }
      }
      // the hexagon's own rim (the shape is the prism's: points up and down)
      const hx = (u: number, v: number) => [x + u * s, y + v * s] as const;
      const pts = [hx(0.5, 0.03), hx(0.97, 0.27), hx(0.97, 0.73), hx(0.5, 0.97), hx(0.03, 0.73), hx(0.03, 0.27)];
      g.strokeStyle = "#ffffff";
      g.lineWidth = 9;
      g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.closePath();
      g.stroke();
      words("ORCHARD", x + s / 2, y + s * 0.5, 34, "#ffffff", "#0d3a66", 0.9);
      // a tick: shielded, proven
      g.strokeStyle = "#0d3a66";
      g.lineWidth = 11;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(x + s * 0.4, y + s * 0.74);
      g.lineTo(x + s * 0.48, y + s * 0.82);
      g.lineTo(x + s * 0.62, y + s * 0.66);
      g.stroke();
      g.strokeStyle = "#ffffff";
      g.lineWidth = 5;
      g.stroke();
    });
    // DUST ATTACK: a wicker basket with its band
    cell(5, "#8a6a3e", (x, y, s) => {
      g.fillStyle = "#d9bc8a";
      g.fillRect(x, y, s, s);
      for (let j = 0; j < 9; j++)
        for (let i = 0; i < 9; i++) {
          g.fillStyle = (i + j) % 2 ? "#c49a5c" : "#e8cf9e";
          g.fillRect(x + i * (s / 9) + 2, y + j * (s / 9) + 2, s / 9 - 4, s / 9 - 4);
        }
      g.fillStyle = "#ff6b35";
      g.fillRect(x, y + s * 0.3, s, s * 0.42);
      g.fillStyle = "rgba(255,255,255,0.3)";
      g.fillRect(x, y + s * 0.3, s, 6);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(x, y + s * 0.72 - 6, s, 6);
      words("DUST", x + s / 2, y + s * 0.42, 40, "#ffffff", "#5a1e08");
      words("ATTACK", x + s / 2, y + s * 0.6, 40, "#ffffff", "#5a1e08", 0.92);
      g.fillStyle = "#6a4a26";
      g.font = `800 20px ${FONT}`;
      g.textAlign = "center";
      g.fillText("link later", x + s / 2, y + s * 0.86);
    });
  });
}

/** A geometry whose front faces (+z) show an atlas cell and whose other faces sample its rim colour. */
function atlasify(geo: THREE.BufferGeometry, cell: number) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const pos = geo.attributes.position,
    nor = geo.attributes.normal,
    uv = geo.attributes.uv;
  const cx = (cell % 4) * CELL,
    cy = Math.floor(cell / 4) * CELL;
  const u0 = (cx + MARGIN) / 1024,
    u1 = (cx + CELL - MARGIN) / 1024;
  const vt = 1 - (cy + MARGIN) / 512,
    vb = 1 - (cy + CELL - MARGIN) / 512;
  const su = (cx + 8) / 1024,
    sv = 1 - (cy + 8) / 512;
  for (let i = 0; i < pos.count; i++) {
    if (nor.getZ(i) > 0.7) {
      const fx = (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x);
      const fy = (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
      uv.setXY(i, u0 + fx * (u1 - u0), vb + fy * (vt - vb));
    } else uv.setXY(i, su, sv);
  }
  uv.needsUpdate = true;
  return geo;
}

/** The bodies' sizes (for the ink hulls): lock, plate, shield, basket. */
const LOCK = [1.32, 1.06, 0.44] as const;
/** Every target body's size against its art. */
const TS = 1.2;

function bodyGeo(kind: number): THREE.BufferGeometry {
  if (kind <= ED) return atlasify(new THREE.BoxGeometry(LOCK[0], LOCK[1], LOCK[2]), CELL_OF[kind]);
  if (kind === PLATE) return atlasify(new THREE.CylinderGeometry(0.68, 0.68, 0.24, 28).rotateX(Math.PI / 2), CELL_OF[kind]);
  if (kind === SHIELD) return atlasify(new THREE.CylinderGeometry(0.92, 0.92, 0.36, 6).rotateX(Math.PI / 2), CELL_OF[kind]);
  // the basket: a box, narrower at its foot
  const b = new THREE.BoxGeometry(1.56, 1.1, 0.86);
  const p = b.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setX(i, p.getX(i) * 0.74);
  return atlasify(b, CELL_OF[BASKET]);
}
/** Each body's ink hull scale (the outline's thickness over its size). */
const HULL = [LOCK, LOCK, LOCK, [1.36, 1.36, 0.24], [1.6, 1.84, 0.36], [1.56, 1.1, 0.86]].map(([w, h, d]) => new THREE.Vector3(1 + 0.1 / w, 1 + 0.1 / h, 1 + 0.1 / d));

/** A soft round glow (additive sprites: lights, trails, flashes). */
function glowTex() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,255,255,0.75)");
    gr.addColorStop(0.6, "rgba(255,255,255,0.18)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** Candy stripes (aslant on the posts, upright on the awning). */
function stripes(a: string, b: string, slant: boolean) {
  const t = canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = a;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = b;
      if (slant)
        for (let k = -2; k < 4; k++) {
          g.beginPath();
          g.moveTo(k * 64, 0);
          g.lineTo(k * 64 + 32, 0);
          g.lineTo(k * 64 + 32 + 128, 128);
          g.lineTo(k * 64 + 128, 128);
          g.fill();
        }
      else g.fillRect(64, 0, 64, 128);
      g.fillStyle = "rgba(255,255,255,0.18)";
      g.fillRect(0, 0, 128, 6);
    },
    true,
  );
  return t;
}

/** A lane's painted board: a deep ground, a band of waves or zigzags, a bright top stripe. */
function boardTex(base: string, band: string, top: string, kind: number) {
  return canvasTex(
    256,
    128,
    (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = band;
      if (kind === 0) {
        // waves (the old galleries' water)
        for (let r = 0; r < 2; r++) {
          g.beginPath();
          const y0 = 40 + r * 44;
          g.moveTo(0, y0 + 30);
          for (let x = 0; x <= 256; x += 4) g.lineTo(x, y0 + Math.sin((x / 256) * Math.PI * 4 + r) * 9);
          g.lineTo(256, y0 + 30);
          g.closePath();
          g.globalAlpha = r ? 0.55 : 0.9;
          g.fill();
        }
        g.globalAlpha = 1;
      } else if (kind === 1) {
        // zigzag
        g.beginPath();
        g.moveTo(0, 70);
        for (let x = 0; x <= 256; x += 32) g.lineTo(x, x % 64 ? 46 : 78);
        g.lineTo(256, 100);
        g.lineTo(0, 100);
        g.closePath();
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.25)";
        for (let x = 16; x < 256; x += 32) g.fillRect(x - 3, 108, 6, 6);
      } else {
        // pennants
        for (let x = 0; x < 256; x += 32) {
          g.beginPath();
          g.moveTo(x, 34);
          g.lineTo(x + 32, 34);
          g.lineTo(x + 16, 74);
          g.closePath();
          g.globalAlpha = (x / 32) % 2 ? 0.6 : 1;
          g.fill();
        }
        g.globalAlpha = 1;
        g.fillStyle = "rgba(255,255,255,0.18)";
        g.fillRect(0, 96, 256, 5);
      }
      g.fillStyle = top;
      g.fillRect(0, 0, 256, 22);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fillRect(0, 0, 256, 5);
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.fillRect(0, 22, 256, 4);
    },
    true,
  );
}

/** A conveyor's chevrons (scrolled while it runs). */
function chevronTex() {
  return canvasTex(
    64,
    32,
    (g) => {
      g.fillStyle = "#2a2440";
      g.fillRect(0, 0, 64, 32);
      g.fillStyle = "#4a4270";
      g.beginPath();
      g.moveTo(8, 2);
      g.lineTo(30, 16);
      g.lineTo(8, 30);
      g.lineTo(20, 30);
      g.lineTo(42, 16);
      g.lineTo(20, 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.2)";
      g.fillRect(0, 0, 64, 3);
    },
    true,
  );
}

/** The dust in a basket: glowing packets. */
const PACKETS = ["#c4b1fc", "#a8d8e8", "#ff6b35"];

/** Shows an instanced mesh's first `n` (and uploads them). */
function fin(m: THREE.InstancedMesh, n: number) {
  m.count = n;
  m.visible = n > 0;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
}

/** The aim helpers' common pace of an AI against yours (0.81 at 0.5, 0.96 at 0.9). */
const AI_PACE = [0.64, 0.2];
const aiPace = (sk: number) => AI_PACE[0] + AI_PACE[1] * sk;
/** An AI's reaction to a new target (s): a base, more the weaker it is. */
const AI_REACT = [0.2, 0.18];
/** Its first aim error (a share of the distance, the weaker the more), its trigger's tolerance (a share of the target's size). */
const AI_ERR = 0.2;
const AI_TOL = [0.42, 0.4];
/** It pulls the trigger only once its crosshair is this slow (px/s; a weak hand fires on the move). */
const AI_STEADY = [160, 360];
/** How hard its hand can speed up (px/s², a pro's more). */
const AI_ACC = [2600, 3600];
/** How much it shuns a target a rival already has a shot on, or a rival's crosshair is on (× skill). */
const AI_DODGE = [0.3, 0.15];
/** How much it prefers the target it already has (against dithering). */
const AI_STICK = 1.3;
/** The chance a shot slips off as it is fired (a base, more the weaker it is). */
const AI_FUMBLE = [0.15, 0.04];
/** A weak eye takes a shield for a lock this often. */
const misreadP = (sk: number) => (1 - sk) * (1 - sk) * 0.3;

// ---- the game ------------------------------------------------------------------------------------

class Gallery implements Mini {
  private w: World;
  private cam: CamRig;
  /** The play camera, never shaken: the crosshairs aim through it. */
  private aimCam = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 900);
  private focal: number;
  private fx: Fx3;
  private guns: Gun[];
  private tg: Tgt[] = [];
  private shots: Shot[] = [];
  private pops: Pop[] = [];
  private ids = 0;
  /** Play time, the clock of everything, the wave, the phase. */
  t = 0;
  private clk = 0;
  private wave = -1;
  private waveT = 0;
  private phase: "card" | "count" | "play" | "tally" = "card";
  private tallyT = 0;
  private final: number[] | null = null;
  private over: number[] | null = null;
  private post = 0;
  private popT = 0.2;
  private gap = [0, 0, 0];
  private swWait = [0, 0, 0, 0];
  private nextQ = 0;
  private nextB = 0;
  private warn = { on: false, side: 1, at: 0 };
  private hw: number[] = [];
  /** Each lane's height on the HUD (where its targets ride). */
  private laneSy: number[] = [];
  private wireHw = 16;
  private tenSaid = false;
  private say: { s: string; c: string; t: number; dur: number; size: number; sub: string } = { s: "", c: "#fff", t: 9, dur: 1, size: 58, sub: "" };
  private claims: { id: number; seat: number; t: number }[] = [];
  /** The newest basket (its tag shouts for a moment). */
  private fresh = -1;
  /** The bench's scripted human (its skill; 0: off). */
  botSkill = 0;

  // the instanced pieces
  private bodies: THREE.InstancedMesh[] = [];
  private hulls: THREE.InstancedMesh[] = [];
  private shackles!: THREE.InstancedMesh;
  private parts!: THREE.InstancedMesh;
  private qBall!: THREE.InstancedMesh;
  private qRing!: THREE.InstancedMesh;
  private glows!: THREE.InstancedMesh;
  private cores!: THREE.InstancedMesh;
  private bulbs!: THREE.InstancedMesh;
  private bulbAt: THREE.Vector3[] = [];
  private cBase!: THREE.InstancedMesh;
  private cBaseHull!: THREE.InstancedMesh;
  private cBarrel!: THREE.InstancedMesh;
  private cBarrelHull!: THREE.InstancedMesh;
  private cBand!: THREE.InstancedMesh;
  private cBall!: THREE.InstancedMesh;
  private chevrons: THREE.Texture[] = [];
  private qBlocks: THREE.Mesh[] = [];
  private searchlights: THREE.Object3D[] = [];
  private flashes: { on: boolean; x: number; y: number; z: number; t: number; dur: number; s: number; c: THREE.Color }[] = [];
  private trails: { x: number; y: number; z: number }[][] = [];
  /** How far each lane's paint scrolls per metre the lane moves (its texture's repeats over 34 m). */
  private chevK: number[] = [];
  // the express: the pillars on the HUD (per pillar: left edge at its foot and top, right edge at its foot and top: x, y), the world rushing past
  private pil: number[][] = [];
  private rushTex: THREE.Texture[] = [];
  private rushK: number[] = [];
  private rushes: { m: THREE.InstancedMesh; p: Float32Array; span: number; v: number }[] = [];
  private straps: THREE.InstancedMesh[] = [];
  // the graveyard: the flares, their lights, the watchman's lantern, the wisp's light
  private flares: Flare[] = Array.from({ length: 28 }, () => ({ on: false, x: 0, y: 0, z: 0, t: 0, dur: 1, r: 1, c: new THREE.Color() }));
  private flareLights: THREE.PointLight[] = [];
  private beam: THREE.Object3D | null = null;
  private beamLight: THREE.PointLight | null = null;
  private beamX = 0;
  private candles: THREE.Vector3[] = [];
  // the life round the booth: clouds, a flock, motes (lanterns, fireflies), wind streaks, the blimp, fog banks, the prison's windows
  private cloudsM: { m: THREE.InstancedMesh; p: Float32Array; v: number; span: number } | null = null;
  private flockM: { m: THREE.InstancedMesh; n: number; off: Float32Array; ph: Float32Array; kind: number } | null = null;
  private motes: { x: number; y: number; z: number; ph: number; c: string }[] = [];
  private streaks: { m: THREE.InstancedMesh; p: Float32Array } | null = null;
  private blimp: THREE.Object3D | null = null;
  private fogs: THREE.Texture[] = [];
  private winM: THREE.InstancedMesh | null = null;
  /** The yard's bunting: its flags (one draw), each one's place and turn (x, y, z, yaw). */
  private bunting: { m: THREE.InstancedMesh; p: Float32Array } | null = null;

  // scratch (no allocations in the frame loop)
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private q4 = new THREE.Quaternion();
  private e4 = new THREE.Euler();
  private s4 = new THREE.Vector3();
  private p4 = new THREE.Vector3();
  private col = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);
  private psx = 0;
  private psy = 0;
  private pdep = 1;

  constructor(
    private players: Player[],
    private rnd: Rnd,
    private L: GLevel,
  ) {
    const dark = L.kind === "dark";
    // (the stage's camera has the aim camera's lens: a crosshair on the HUD sits on what it aims at in the 3D)
    this.w = world({ sky: L.sky, fog: L.fog, night: dark, fov: FOV });
    const s = this.w.scene;
    this.w.sun.position.set(18, 40, 38);
    this.w.hemi.intensity = 1.9;
    if (L.kind === "train") {
      this.w.sun.position.set(-26, 44, 30);
      this.w.sun.intensity = 2.4;
      this.w.hemi.intensity = 1.75;
    } else if (dark) {
      // (a cold moon high behind, a dim sky; the rail's lanterns warm the booth)
      this.w.sun.position.set(-30, 40, -40);
      this.w.sun.color.set("#9fb2ff");
      this.w.sun.intensity = 0.75;
      this.w.hemi.intensity = 0.62;
    }
    this.aimCam.position.copy(EYE);
    this.aimCam.lookAt(AT);
    this.aimCam.updateMatrixWorld();
    this.focal = H / 2 / Math.tan(((FOV / 2) * Math.PI) / 180);
    // each lane's half width on screen (where its targets come in and leave)
    for (const L of LANES) {
      this.hw.push(this.halfWidth(L.y, L.z));
      this.proj(0, L.y, L.z);
      this.laneSy.push(this.psy);
    }
    this.wireHw = this.halfWidth(WIRE_Y, WIRE_Z);
    this.build();
    this.guns = players.map((p, i) => {
      const a = new Avatar(s, p, { scale: SIZE, marker: false });
      a.pos.set(SEAT_X[i], 0, STAND_Z);
      a.yaw = Math.PI;
      a.sync(0);
      this.proj(SEAT_X[i] * 1.8, LANES[1].y, LANES[1].z);
      return {
        i,
        p,
        a,
        x: this.psx,
        y: 250,
        vx: 0,
        vy: 0,
        spd: 0,
        bufA: 0,
        bufB: 0,
        hx: 0,
        hy: 0,
        cd: 0,
        bcd: 1.5,
        stun: 0,
        score: 0,
        shown: 0,
        hits: 0,
        shots: 0,
        shields: 0,
        combo: 0,
        best: 0,
        goal: -1,
        goalId: -1,
        think: 0,
        react: 0,
        ex: 0,
        ey: 0,
        trig: -1,
        aimT: 0,
        dx: 0,
        dy: 0,
        dz: -1,
        kick: 0,
        mx: SEAT_X[i],
        my: 1.8,
        mz: RAIL_Z - 1.2,
        hop: 0,
        angryT: 0,
        bgx: 0,
        bgy: 0,
        bgr: 0,
        bblock: false,
        bfire: false,
        bcharge: false,
        care: true,
      };
    });
    for (let k = 0; k < 56; k++)
      this.tg.push({ on: false, id: 0, kind: 0, mode: 0, lane: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, hold: 0, up: 0, hp: 1, slot: -1, amp: 0, om: 0, ph: 0, rot: 0, spin: 0, wob: 0, tl: 0, away: false, sx: 0, sy: 0, sr: 0, svx: 0, svy: 0, dep: 1, ok: false, live: false, inbound: 0, misread: 0, lit: 1 });
    for (let k = 0; k < 24; k++) {
      this.shots.push({ on: false, seat: 0, big: false, t: 0, dur: 1, px: 0, py: 0, aim: -1, ox: 0, oy: 0, oz: 0, ex: 0, ey: 0, ez: 0, x: 0, y: 0, z: 0 });
      this.trails.push([0, 1, 2, 3, 4].map(() => ({ x: 0, y: -50, z: 0 })));
    }
    for (let k = 0; k < 40; k++) this.pops.push({ on: false, x: 0, y: 0, t: 0, s: "", c: "#fff", size: 20 });
    for (let k = 0; k < 24; k++) this.flashes.push({ on: false, x: 0, y: 0, z: 0, t: 0, dur: 0.3, s: 1, c: new THREE.Color() });
    for (let k = 0; k < 8; k++) this.claims.push({ id: -1, seat: -1, t: -9 });
    this.fx = new Fx3(s, 1100);
    this.cam = new CamRig(this.w.camera);
    this.cam.set(new THREE.Vector3(-9, 12, 26), new THREE.Vector3(0, 4.5, -6));
    // the gallery is already stocked while the card is up (the clock waits)
    const xs = [-8.6, -3.2, 2.8, 8.2, -6, 0, 6, -9.5, -1.5, 4.5, 10.5];
    const ln = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2];
    const kd = [RSA, ECDSA, SHIELD, ED, ECDSA, PLATE, RSA, ED, RSA, SHIELD, ECDSA];
    for (let k = 0; k < xs.length; k++) {
      const t = this.spawn(kd[k], LANE, ln[k], xs[k]);
      if (t) ((t.hold = 2.2 + this.rnd() * 1.6), (t.up = 0.2 - k * 0.08));
    }
    this.project(0);
    if (typeof location !== "undefined" && /partylab/.test(location.pathname)) (window as unknown as Record<string, unknown>).__gallery = this;
  }

  // ---- the booth ---------------------------------------------------------------------------------

  private build() {
    if (this.L.kind === "train") this.express();
    else if (this.L.kind === "dark") this.graveyard();
    else this.yard();
    this.pieces();
    this.ambience();
  }

  /** The bulbs at bulbAt (one draw; they chase, flicker or glow steady in render). */
  private lightBulbs(size: number) {
    const at = this.bulbAt;
    this.bulbs = this.inst(GEO.ball, glow("#ffffff"), at.length, true);
    at.forEach((p, i) => {
      this.m4.compose(p, this.q4.identity(), this.s4.setScalar(size));
      this.bulbs.setMatrixAt(i, this.m4);
      this.bulbs.setColorAt(i, this.col.set("#fff3c4"));
    });
    this.bulbs.count = at.length;
    this.bulbs.visible = true;
  }

  /** PENITENTIARY YARD: the carnival booth in the prison's yard. */
  private yard() {
    const s = this.w.scene;
    // the dusk all round: violet overhead down to peach on the horizon (the fog's colour), long clouds; two rings of the city behind the walls
    skyDome(s, { sky: this.L.sky, clouds: 10, cloud: "#ffcdb2", cloudShade: "#c57c9c", stars: 70, haze: 0.45, rnd: rng(0x5a11) });
    skyline(s, { r: 175, n: 60, rnd: this.rnd, tall: 0.8 });
    skyline(s, { r: 232, n: 96, rnd: rng(0x5a12), tall: 1.15 });
    this.prison();
    // the ground: the yard's flagstones, the players' boards, the gallery's floor
    const flags = canvasTex(
      256,
      256,
      (g) => {
        g.fillStyle = "#463a70";
        g.fillRect(0, 0, 256, 256);
        for (let r = 0; r < 4; r++)
          for (let c = -1; c < 4; c++) {
            g.fillStyle = ["#5d4d8c", "#564684", "#635392", "#514180"][(r * 3 + c + 5) % 4];
            g.fillRect(c * 64 + (r % 2) * 32 + 2, r * 64 + 2, 60, 60);
            g.fillStyle = "rgba(255,255,255,0.07)";
            g.fillRect(c * 64 + (r % 2) * 32 + 2, r * 64 + 2, 60, 4);
          }
      },
      true,
    );
    flags.repeat.set(100, 100);
    const yardM = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: flags, gradientMap: toon("#fff").gradientMap }));
    yardM.rotation.x = -Math.PI / 2;
    yardM.scale.set(400, 400, 1);
    yardM.position.set(0, 0, -20);
    s.add(yardM);
    this.yardWings();
    const planks = canvasTex(
      128,
      128,
      (g) => {
        for (let i = 0; i < 4; i++) {
          g.fillStyle = ["#c98d55", "#b97d48", "#d29a62", "#bf8550"][i];
          g.fillRect(0, i * 32, 128, 32);
          g.fillStyle = "rgba(60,30,10,0.35)";
          g.fillRect(0, i * 32 + 29, 128, 3);
          g.fillRect((i * 53) % 128, i * 32, 3, 32);
        }
      },
      true,
    );
    planks.repeat.set(14, 4);
    const deck = new THREE.Mesh(GEO.box, new THREE.MeshToonMaterial({ map: planks, gradientMap: toon("#fff").gradientMap }));
    deck.scale.set(30, 0.3, 9);
    deck.position.set(0, 0.0, 9.0);
    s.add(deck);
    const check = canvasTex(
      64,
      64,
      (g) => {
        g.fillStyle = "#2b2266";
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = "#3d3290";
        g.fillRect(0, 0, 32, 32);
        g.fillRect(32, 32, 32, 32);
      },
      true,
    );
    check.repeat.set(14, 3);
    const floor = new THREE.Mesh(GEO.box, new THREE.MeshToonMaterial({ map: check, gradientMap: toon("#fff").gradientMap }));
    floor.scale.set(30, 0.2, 7);
    floor.position.set(0, 0, 1.0);
    s.add(floor);
    // the rail: candy stripes on its front, a cream top
    const railTex = stripes("#ff6b35", "#fff3e0", false);
    railTex.repeat.set(24, 1);
    const rail = new THREE.Mesh(GEO.box, new THREE.MeshToonMaterial({ map: railTex, gradientMap: toon("#fff").gradientMap }));
    rail.scale.set(23.5, RAIL_Y, 0.8);
    rail.position.set(0, RAIL_Y / 2, RAIL_Z);
    s.add(rail);
    outline(rail, 0.05);
    outline(block("#fff3e0", 23.9, 0.16, 1.05, 0, RAIL_Y + 0.08, RAIL_Z, s), 0.04);
    // the lanes: stepped boards, painted, a conveyor along each top
    const paints = [
      boardTex("#2c2a7a", "#4fb7e6", "#a8d8e8", 0),
      boardTex("#36246e", "#9d7bff", "#c4b1fc", 1),
      boardTex("#22406a", "#6dbf8a", "#ff6b35", 2),
    ];
    // (the boards run on past the lanes' 34 m, behind the flats at their ends: the same paint, as many repeats a metre)
    const LW = 46;
    LANES.forEach((L, l) => {
      const top = L.y - BOARD;
      paints[l].repeat.set((10 * LW) / 34, 1);
      const b = new THREE.Mesh(GEO.box, new THREE.MeshToonMaterial({ map: paints[l], gradientMap: toon("#fff").gradientMap }));
      b.scale.set(LW, top, 0.7);
      b.position.set(0, top / 2, L.z + 0.62);
      s.add(b);
      outline(b, 0.05);
      const ch = chevronTex();
      ch.repeat.set((40 * LW) / 34, 1);
      if (L.v < 0) ch.rotation = Math.PI;
      ch.center.set(0.5, 0.5);
      this.chevrons.push(ch);
      this.chevK.push(1 / (34 / 40));
      const c = new THREE.Mesh(GEO.box, new THREE.MeshToonMaterial({ map: ch, gradientMap: toon("#fff").gradientMap }));
      c.scale.set(LW, 0.24, 0.5);
      c.position.set(0, top + 0.12, L.z + 0.2);
      s.add(c);
    });
    // the frame: candy posts, the awning and its scalloped valance, the swingers' beam, the wire
    const postTex = stripes("#fff3e0", "#ff6b35", true);
    postTex.repeat.set(2, 7);
    const postMat = new THREE.MeshToonMaterial({ map: postTex, gradientMap: toon("#fff").gradientMap });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(GEO.cyl, postMat);
      p.scale.set(0.9, 11.2, 0.9);
      p.position.set(sx * 11.9, 5.6, 2.9);
      p.userData.noShadow = true;
      s.add(p);
      outline(p, 0.05);
      const cap = block("#9d7bff", 1.5, 0.5, 1.5, sx * 11.9, 11.3, 2.9, s);
      outline(cap, 0.05);
      const q = qBlock(1.2);
      q.position.set(sx * 11.9, 12.3, 2.9);
      s.add(q);
      this.qBlocks.push(q);
      // the far posts that hold the swing beam and the wire
      outline(block("#3a2c7a", 0.5, 11.6, 0.5, sx * 13.4, 5.8, SW_Z, s), 0.04);
      outline(block("#3a2c7a", 0.45, 10, 0.45, sx * (this.wireHw + 1.2), 5, WIRE_Z, s), 0.04);
      const rq = qBlock(0.75);
      rq.position.set(sx * 11.2, RAIL_Y + 0.55, RAIL_Z);
      s.add(rq);
      this.qBlocks.push(rq);
    }
    outline(block("#3a2c7a", 27.2, 0.4, 0.4, 0, SW_Y + 0.2, SW_Z, s), 0.04);
    block("#d9d2f0", (this.wireHw + 1.2) * 2, 0.06, 0.06, 0, WIRE_Y, WIRE_Z, s);
    const awnTex = stripes("#ff6b35", "#fff3e0", false);
    awnTex.repeat.set(16, 1);
    const awnMat = new THREE.MeshToonMaterial({ map: awnTex, gradientMap: toon("#fff").gradientMap, side: THREE.DoubleSide });
    const awn = new THREE.Mesh(GEO.box, awnMat);
    awn.scale.set(25.4, 0.2, 4.4);
    awn.rotation.x = -0.32;
    awn.position.set(0, 10.55, 2.6);
    // (its shadow would lie across the middle lane and its targets alone: every lane is lit alike)
    awn.userData.noShadow = true;
    s.add(awn);
    const scal = canvasTex(256, 64, (g) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? "#fff3e0" : "#ff6b35";
        g.fillRect(i * 64, 0, 64, 30);
        g.beginPath();
        g.arc(i * 64 + 32, 30, 32, 0, Math.PI);
        g.fill();
      }
      g.fillStyle = "rgba(0,0,0,0.15)";
      g.fillRect(0, 0, 256, 4);
    });
    scal.wrapS = THREE.RepeatWrapping;
    scal.repeat.set(7, 1);
    const val = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: scal, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
    val.scale.set(25.4, 1.25, 1);
    val.position.set(0, 9.55, 4.7);
    s.add(val);
    // the marquee (seen on the fly-over)
    const sign = canvasTex(1024, 256, (g) => {
      rr(g, 8, 8, 1008, 240, 60);
      g.fillStyle = "#1a1033";
      g.fill();
      rr(g, 22, 22, 980, 212, 48);
      const gr = g.createLinearGradient(0, 22, 0, 234);
      gr.addColorStop(0, "#3a2c86");
      gr.addColorStop(1, "#1d1450");
      g.fillStyle = gr;
      g.fill();
      for (let i = 0; i < 28; i++) {
        const a = i / 28;
        const x = 40 + a * 944;
        g.fillStyle = i % 2 ? "#ff6b35" : "#fff3c4";
        g.beginPath();
        g.arc(x, 36, 8, 0, Math.PI * 2);
        g.arc(x, 220, 8, 0, Math.PI * 2);
        g.fill();
      }
      // (the title shrinks to fit the board)
      g.font = `900 112px ${FONT}`;
      toy(g, "NULLIFIER GALLERY", 512, 118, Math.min(112, (112 * 900) / g.measureText("NULLIFIER GALLERY").width), "#ff6b35");
      toy(g, "ZEC STATE PENITENTIARY · 废止符靶场", 512, 186, 34, "#a8d8e8", { rim: false });
    });
    const marquee = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: sign, transparent: true }));
    marquee.scale.set(12, 3, 1);
    marquee.position.set(0, 12.4, 4.2);
    s.add(marquee);
    // bulbs along the valance, up the posts, along the rail and each lane's top
    const at = this.bulbAt;
    for (let x = -12; x <= 12.01; x += 1.0) at.push(new THREE.Vector3(x, 9.0, 4.75));
    for (const sx of [-1, 1]) for (let y = 0.9; y < 10.5; y += 0.95) at.push(new THREE.Vector3(sx * 11.9, y, 3.38));
    for (let x = -11.2; x <= 11.21; x += 1.12) at.push(new THREE.Vector3(x, RAIL_Y + 0.2, RAIL_Z + 0.56));
    this.lightBulbs(0.22);
    // a few toy props: crates of prizes at the rail's ends
    for (const sx of [-1, 1]) {
      outline(block("#ff6b35", 1.3, 1.3, 1.3, sx * 9.6, 0.65, 7.2, s), 0.05);
      outline(block("#c4b1fc", 1.0, 1.0, 1.0, sx * 9.9, 1.8, 7.3, s), 0.05);
    }
  }

  /**
   * A flat standing in front of each lane's ends, just past where its targets ride into the 16:9 frame: a wider
   * screen sees them come out from behind it, not out of thin air. `make` builds one (its middle, its size, the
   * side it is on, its lane).
   */
  private wings(make: (x: number, y: number, z: number, w: number, h: number, sx: number, lane: number) => void) {
    LANES.forEach((L, l) => {
      const h = L.y + 2.1;
      for (const sx of [-1, 1]) make(sx * (this.hw[l] + 0.95 + 3.2), h / 2, L.z + 1.05, 6.4, h, sx, l);
    });
  }

  /** The yard round the booth (the fly-over and the sides of a wide screen see it): candy flats at the lanes' ends, the probe's hutches on its wire, fairground tents, lamp posts, bunting from the booth's posts. */
  private yardWings() {
    const s = this.w.scene;
    const gm = toon("#fff").gradientMap;
    const ink = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    // (boxes of one colour each, in one draw, and their ink in another: x, y, z, w, h, d, colour)
    const boxes: [number, number, number, number, number, number, string][] = [];
    const batch = (geo: THREE.BufferGeometry, mat: THREE.Material, list: [number, number, number, number, number, number, string][], turn = 0, t = 0.05) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      const hull = new THREE.InstancedMesh(geo, ink, list.length);
      this.e4.set(0, turn, 0);
      this.q4.setFromEuler(this.e4);
      list.forEach(([x, y, z, w, h, d, c], i) => {
        this.m4.compose(this.v.set(x, y, z), this.q4, this.s4.set(w, h, d));
        m.setMatrixAt(i, this.m4);
        m.setColorAt(i, this.col.set(c));
        this.m4.compose(this.v, this.q4, this.s4.set(w + 2 * t, h + 2 * t, d + 2 * t));
        hull.setMatrixAt(i, this.m4);
      });
      // (the yard's dressing throws no shadow on the lanes)
      m.userData.noShadow = hull.userData.noShadow = true;
      s.add(m, hull);
      return m;
    };
    // the flats at the lanes' ends: candy stripes, a cap in the lane's colour, bulbs up the inner edge
    const flat = stripes("#ff6b35", "#fff3e0", false);
    flat.repeat.set(3, 1);
    const flats: [number, number, number, number, number, number, string][] = [];
    this.wings((x, y, z, w, h, sx, l) => {
      flats.push([x, y, z, w, h, 0.3, "#ffffff"]);
      boxes.push([x, h + 0.25, z, w + 0.4, 0.5, 0.5, ["#4fb7e6", "#9d7bff", "#6dbf8a"][l]]);
      for (let by = 0.8; by < h - 0.2; by += 1.0) this.bulbAt.push(new THREE.Vector3(x - sx * (w / 2 - 0.25), by, z + 0.2));
    });
    batch(GEO.box, new THREE.MeshToonMaterial({ map: flat, gradientMap: gm }), flats);
    // the probe's hutches: where it comes out on its wire
    for (const sx of [-1, 1]) {
      const hx = sx * (this.wireHw + 3.3);
      boxes.push([hx, WIRE_Y - 0.4, WIRE_Z + 0.9, 3.6, 2.6, 1.4, "#3a2c7a"]);
      boxes.push([hx, WIRE_Y + 1.1, WIRE_Z + 0.9, 4.0, 0.4, 1.8, "#c4b1fc"]);
      boxes.push([hx, (WIRE_Y - 1.7) / 2, WIRE_Z + 0.9, 0.5, WIRE_Y - 1.7, 0.5, "#3a2c7a"]);
      const lb = label("PROBE", 0.7, "#c4b1fc");
      lb.position.set(hx, WIRE_Y - 0.4, WIRE_Z + 1.62);
      s.add(lb);
    }
    // four fairground tents on the yard's sides: striped walls (a band of cream stripes on each face), a pyramid roof, a pennant
    const roofs: [number, number, number, number, number, number, string][] = [];
    const tent = (x: number, z: number, a: string, word: string, c: string) => {
      boxes.push([x, 1.7, z, 6, 3.4, 6, a]);
      for (let k = -2; k <= 2; k += 2) {
        boxes.push([x + k * 1.2, 1.7, z + 3.02, 1.2, 3.4, 0.1, "#fff3e0"]);
        boxes.push([x - Math.sign(x) * 3.02, 1.7, z + k * 1.2, 0.1, 3.4, 1.2, "#fff3e0"]);
      }
      boxes.push([x, 3.55, z, 6.5, 0.5, 6.5, "#fff3e0"]);
      roofs.push([x, 5.4, z, 9.4, 3.4, 9.4, a]);
      boxes.push([x, 7.7, z, 0.16, 1.6, 0.16, "#fff3e0"]);
      boxes.push([x + 0.6, 8.2, z, 1.1, 0.6, 0.1, c]);
      const lb = label(word, 0.8, "#fff3e0", "#1a1033");
      lb.position.set(x, 2.4, z + 3.12);
      s.add(lb);
    };
    tent(-24, -13, "#ff6b35", "POPCORN", "#c4b1fc");
    tent(24.5, -14, "#9d7bff", "PRIZES", "#ff6b35");
    tent(-27, 6, "#35b4c9", "TICKETS", "#ffd23f");
    tent(28, 5, "#ff6b35", "Z-COLA", "#a8d8e8");
    batch(GEO.cone, toon("#ffffff"), roofs, Math.PI / 4, 0.03);
    // lamp posts round the yard, their lamps lit
    const posts: [number, number][] = [
      [-19.5, -3],
      [19.5, -3],
      [-31, -22],
      [31, -22],
      [-18, 12],
      [18, 12],
      [-33, 14],
      [33, 14],
    ];
    const lamps = new THREE.InstancedMesh(GEO.ball, glow("#ffd9a8"), posts.length);
    posts.forEach(([x, z], i) => {
      boxes.push([x, 3.4, z, 0.28, 6.8, 0.28, "#2a2058"]);
      boxes.push([x, 6.9, z, 1.1, 0.24, 1.1, "#2a2058"]);
      this.m4.compose(this.v.set(x, 6.45, z), this.q4.identity(), this.s4.setScalar(0.7));
      lamps.setMatrixAt(i, this.m4);
    });
    s.add(lamps);
    batch(GEO.box, toon("#ffffff"), boxes);
    // bunting: from each front post's top out to a pole in the yard, its flags stirring
    const N = 13;
    const bm = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), N * 2);
    bm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bm.frustumCulled = false;
    bm.userData.noShadow = true;
    const bp = new Float32Array(N * 2 * 4);
    const BC = ["#ff6b35", "#fff3e0", "#9d7bff", "#ffd23f", "#35b4c9"];
    for (const sx of [-1, 1])
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N;
        const k = (sx > 0 ? N : 0) + i;
        bp[k * 4] = sx * (12.4 + u * 7.1);
        bp[k * 4 + 1] = 11.2 - u * 4.2 - Math.sin(u * Math.PI) * 1.3;
        bp[k * 4 + 2] = 2.9 - u * 5.9;
        bp[k * 4 + 3] = sx * 0.69;
        bm.setColorAt(k, this.col.set(BC[i % BC.length]));
      }
    s.add(bm);
    this.bunting = { m: bm, p: bp };
  }

  /** The targets and the cannons (every level). */
  private pieces() {
    const dark = this.L.kind === "dark";
    // the targets: a body (an atlas face) and its ink hull per kind, the shackles and handles, the
    // sticks and ropes, the probes; the probe cores, the glows (lights, trails, flashes, halos)
    // (in the dark the bodies take no light from the scene: each is as bright as its flares make it)
    const mat = dark ? new THREE.MeshBasicMaterial({ map: atlas() }) : new THREE.MeshToonMaterial({ map: atlas(), gradientMap: toon("#fff").gradientMap, emissive: 0x1a1030 });
    const ink = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    for (let k = 0; k <= BASKET; k++) {
      const geo = bodyGeo(k);
      const cap = k === BASKET ? 8 : 40;
      this.bodies.push(this.inst(geo, mat, cap, dark));
      this.hulls.push(this.inst(geo, ink, cap));
    }
    this.shackles = this.inst(new THREE.TorusGeometry(0.4, 0.11, 6, 14, Math.PI), dark ? glow("#ffffff") : toon("#ffffff"), 80, true);
    this.parts = this.inst(GEO.box, dark ? glow("#ffffff") : toon("#ffffff"), 200, true);
    this.qBall = this.inst(GEO.ball, new THREE.MeshToonMaterial({ color: "#c4b1fc", emissive: "#6a3cff", gradientMap: toon("#fff").gradientMap }), 8);
    this.qRing = this.inst(new THREE.TorusGeometry(0.62, 0.06, 6, 28), glow("#ffffff"), 16);
    this.cores = this.inst(GEO.ball, glow("#ffffff"), 32, true);
    const gm = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glows = this.inst(GEO.plane, gm, 700, true);
    this.glows.renderOrder = 5;
    // the cannons: a turret in the seat's colour, a cream barrel with a band, a glowing nullifier at its breech
    this.cBase = this.inst(GEO.box, toon("#ffffff"), 4, true);
    this.cBaseHull = this.inst(GEO.box, ink, 4);
    this.cBarrel = this.inst(new THREE.CylinderGeometry(0.24, 0.31, 1.8, 12), toon("#ffffff"), 4, true);
    this.cBarrelHull = this.inst(new THREE.CylinderGeometry(0.24, 0.31, 1.8, 12), ink, 4);
    this.cBand = this.inst(new THREE.CylinderGeometry(0.35, 0.35, 0.24, 12), toon("#ffffff"), 8, true);
    this.cBall = this.inst(GEO.ball, glow("#ffffff"), 4, true);
    for (const m of [this.cBase, this.cBaseHull, this.cBarrel, this.cBarrelHull, this.cBall]) ((m.count = 4), (m.visible = true));
    this.cBand.count = 8;
    this.cBand.visible = true;
  }

  /** The ZEC STATE PENITENTIARY behind the gallery: walls, towers, a keep with a broken padlock, barred lit windows, searchlights. */
  private prison() {
    const s = this.w.scene;
    const boxes: [number, number, number, number, number, number, string][] = [];
    const Z = -44;
    const wall = "#2e2462",
      tower = "#3a2e78",
      cap = "#4a3c92";
    boxes.push([0, 6.5, Z, 110, 13, 5, wall]);
    for (let x = -54; x <= 54; x += 2.6) boxes.push([x, 13.6, Z + 1.6, 1.3, 1.2, 1.4, wall]);
    for (const x of [-46, -26, 26, 46]) {
      boxes.push([x, 10, Z + 1, 7, 20, 7, tower]);
      boxes.push([x, 20.4, Z + 1, 8.6, 1.2, 8.6, cap]);
      for (const [dx, dz] of [
        [-3.6, -3.6],
        [0, -3.6],
        [3.6, -3.6],
        [-3.6, 3.6],
        [0, 3.6],
        [3.6, 3.6],
        [-3.6, 0],
        [3.6, 0],
      ])
        boxes.push([x + dx, 21.5, Z + 1 + dz, 1.3, 1.2, 1.3, cap]);
    }
    // the keep: taller, a gate, the broken padlock of the transparent addresses
    boxes.push([0, 12, Z + 2, 22, 24, 9, tower]);
    boxes.push([0, 24.6, Z + 2, 24, 1.4, 10.4, cap]);
    for (let x = -11; x <= 11; x += 2.75) boxes.push([x, 25.9, Z + 6.6, 1.4, 1.3, 1.4, cap]);
    boxes.push([0, 3.5, Z + 6.6, 7, 7, 0.6, "#1a1238"]);
    boxes.push([0, 10.4, Z + 6.9, 6.4, 5.2, 1.2, "#4e2618"]);
    // the yard's side walls, from the keep's wall past the booth, a tower half-way and one at each end (a wide screen and the fly-over see them, not an empty horizon)
    const SX = 40;
    for (const sx of [-1, 1]) {
      boxes.push([sx * SX, 6.5, -6, 5, 13, 76, wall]);
      for (let z = -42; z <= 31; z += 2.6) boxes.push([sx * (SX - 1.6), 13.6, z, 1.4, 1.2, 1.3, wall]);
      for (const z of [-6, 32]) {
        boxes.push([sx * (SX - 1), 10, z, 7, 20, 7, tower]);
        boxes.push([sx * (SX - 1), 20.4, z, 8.6, 1.2, 8.6, cap]);
        for (const [dx, dz] of [
          [-3.6, -3.6],
          [3.6, -3.6],
          [-3.6, 3.6],
          [3.6, 3.6],
          [0, -3.6],
          [0, 3.6],
          [-3.6, 0],
          [3.6, 0],
        ])
          boxes.push([sx * (SX - 1) + dx, 21.5, z + dz, 1.3, 1.2, 1.3, cap]);
      }
    }
    const n = boxes.length;
    const im = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), n);
    boxes.forEach(([x, y, z, w, h, d, c], i) => {
      this.m4.compose(this.v.set(x, y, z), this.q4.identity(), this.s4.set(w, h, d));
      im.setMatrixAt(i, this.m4);
      im.setColorAt(i, this.col.set(c));
    });
    s.add(im);
    // the padlock's shackle, thrown open
    const sh = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.55, 8, 18, Math.PI), toon("#8f8aa8"));
    sh.position.set(-0.9, 13.3, Z + 6.9);
    sh.rotation.z = 0.42;
    s.add(sh);
    outline(sh, 0.12);
    // its face: rusted through, PUBLIC on it, cracked in two
    const face = canvasTex(256, 208, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 208);
      gr.addColorStop(0, "#8a4a34");
      gr.addColorStop(1, "#4e2618");
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 208);
      g.fillStyle = "rgba(60,20,8,0.35)";
      for (let i = 0; i < 18; i++) g.fillRect((i * 53) % 240, (i * 37) % 190, 10 + (i % 3) * 6, 14 + (i % 4) * 8);
      g.fillStyle = "rgba(255,255,255,0.2)";
      g.fillRect(0, 0, 256, 10);
      toy(g, "PUBLIC", 128, 52, 46, "#d9a88a", { rim: false });
      g.fillStyle = "#1a1033";
      g.beginPath();
      g.arc(128, 120, 18, 0, Math.PI * 2);
      g.fill();
      g.fillRect(120, 120, 16, 44);
      // the crack
      g.strokeStyle = "#1a1033";
      g.lineWidth = 9;
      g.lineJoin = "miter";
      g.beginPath();
      g.moveTo(150, 0);
      g.lineTo(118, 64);
      g.lineTo(160, 100);
      g.lineTo(112, 150);
      g.lineTo(146, 208);
      g.stroke();
      g.strokeStyle = "#ffb070";
      g.lineWidth = 2.5;
      g.stroke();
    });
    const pf = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: face }));
    pf.scale.set(6.2, 5.0, 1);
    pf.position.set(0, 10.4, Z + 7.52);
    s.add(pf);
    const nm = label("ZEC STATE PENITENTIARY", 2.2, "#ffe0c4", "#1a1033");
    nm.position.set(0, 19.8, Z + 6.75);
    s.add(nm);
    // barred windows, some lit
    // (x, y, z; a fourth: on a side wall, facing across the yard, toward −x or +x)
    const wins: [number, number, number, number?][] = [];
    for (const x of [-46, -26, 26, 46]) for (const y of [8, 13, 17]) wins.push([x, y, Z + 4.6]);
    for (let x = -50; x <= 50; x += 6.5) if (Math.abs(x) > 13 && Math.abs(Math.abs(x) - 26) > 5 && Math.abs(Math.abs(x) - 46) > 5) wins.push([x, 9.6, Z + 2.6]);
    for (const x of [-7.5, 7.5]) for (const y of [8, 19]) wins.push([x, y, Z + 6.6]);
    const front = wins.length;
    for (const sx of [-1, 1]) {
      for (let z = -36; z <= 26; z += 6.2) if (Math.abs(z + 6) > 5) wins.push([sx * (SX - 2.6), 9.6, z, -sx]);
      for (const z of [-6, 32]) for (const y of [8, 13, 17]) wins.push([sx * (SX - 4.6), y, z, -sx]);
    }
    const wm = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), wins.length);
    const bars = new THREE.InstancedMesh(GEO.box, toon("#1a1238"), wins.length * 2);
    const WR = rng(0x5a13);
    wins.forEach(([x, y, z, side], i) => {
      this.m4.compose(this.v.set(x, y, z), this.q4.identity(), side ? this.s4.set(0.2, 2.2, 1.5) : this.s4.set(1.5, 2.2, 0.2));
      wm.setMatrixAt(i, this.m4);
      // (the keep's own windows keep the game's draws as they were; the side walls' have their own)
      wm.setColorAt(i, this.col.set((i < front ? this.rnd() : WR()) < 0.7 ? "#ffb070" : "#4a3a7a"));
      for (let b = 0; b < 2; b++) {
        if (side) this.m4.compose(this.v.set(x + side * 0.15, y, z - 0.4 + b * 0.8), this.q4.identity(), this.s4.set(0.12, 2.2, 0.14));
        else this.m4.compose(this.v.set(x - 0.4 + b * 0.8, y, z + 0.15), this.q4.identity(), this.s4.set(0.14, 2.2, 0.12));
        bars.setMatrixAt(i * 2 + b, this.m4);
      }
    });
    s.add(wm, bars);
    this.winM = wm;
    // searchlights sweeping the dusk from the towers
    const beamMat = new THREE.MeshBasicMaterial({ color: "#d8f4ff", transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beamGeo = new THREE.ConeGeometry(3.2, 38, 16, 1, true).translate(0, -19, 0);
    for (const x of [-26, 26]) {
      const piv = new THREE.Group();
      piv.position.set(x, 22, Z + 1);
      const cone = new THREE.Mesh(beamGeo, beamMat);
      cone.rotation.x = Math.PI;
      piv.add(cone);
      s.add(piv);
      this.searchlights.push(piv);
    }
  }

  /** A rail of the booth: a striped front, a cap on top (the cannons stand on it). */
  private railOf(tex: THREE.Texture, cap: string) {
    const s = this.w.scene;
    tex.repeat.set(24, 1);
    const rail = new THREE.Mesh(GEO.box, new THREE.MeshToonMaterial({ map: tex, gradientMap: toon("#fff").gradientMap }));
    rail.scale.set(23.5, RAIL_Y, 0.8);
    rail.position.set(0, RAIL_Y / 2, RAIL_Z);
    s.add(rail);
    outline(rail, 0.05);
    outline(block(cap, 23.9, 0.16, 1.05, 0, RAIL_Y + 0.08, RAIL_Z, s), 0.04);
  }

  /** Boxes that rush past (x wraps over `span`), one draw: p holds x, y, z, w, h, d an instance. */
  private rush(boxes: number[][], colors: string[], mat: THREE.Material, span: number, v: number) {
    const n = boxes.length;
    const m = new THREE.InstancedMesh(GEO.box, mat, n);
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const p = new Float32Array(n * 6);
    boxes.forEach((b, i) => {
      p.set(b, i * 6);
      m.setColorAt(i, this.col.set(colors[i % colors.length]));
    });
    this.w.scene.add(m);
    this.rushes.push({ m, p, span, v });
    this.moveRush(0);
  }

  /** The world past the express moves on (also on the card and at the tally: the train never stops). */
  private moveRush(dt: number) {
    for (let i = 0; i < this.rushTex.length; i++) this.rushTex[i].offset.x += RUSH_V * dt * this.rushK[i];
    for (const r of this.rushes) {
      const p = r.p;
      const half = r.span / 2;
      for (let i = 0; i < r.m.count; i++) {
        let x = p[i * 6] - r.v * dt;
        if (x < -half) x += r.span;
        p[i * 6] = x;
        this.m4.compose(this.p4.set(x, p[i * 6 + 1], p[i * 6 + 2]), this.q4.identity(), this.s4.set(p[i * 6 + 3], p[i * 6 + 4], p[i * 6 + 5]));
        r.m.setMatrixAt(i, this.m4);
      }
      r.m.instanceMatrix.needsUpdate = true;
    }
  }

  /** ZEC LINE EXPRESS: the observation car (its rail, window pillars and roof), three goods trains alongside, the city rushing past. */
  private express() {
    const s = this.w.scene;
    const gm = toon("#fff").gradientMap;
    const tm = (map: THREE.Texture) => new THREE.MeshToonMaterial({ map, gradientMap: gm });
    // a bright afternoon all round: blue down to a pale haze on the horizon (the fog's colour), fair-weather clouds
    skyDome(s, { sky: this.L.sky, clouds: 12, haze: 0.4, rnd: rng(0x7a11) });
    skyline(s, { r: 210, n: 64, rnd: this.rnd, tall: 1.1 });
    // the ground rushing by: ballast and sleepers between the tracks, then fields and hedges out to the city
    const ballast = canvasTex(
      128,
      64,
      (g) => {
        g.fillStyle = "#958ea6";
        g.fillRect(0, 0, 128, 64);
        for (let i = 0; i < 120; i++) {
          g.fillStyle = ["#aaa3bb", "#7a7390", "#bdb6cc", "#857e98"][i % 4];
          g.fillRect((i * 37) % 128, (i * 23 + (i >> 3)) % 64, 3 + (i % 4), 2 + (i % 3));
        }
        g.fillStyle = "#6a5040";
        for (let x = 0; x < 128; x += 32) g.fillRect(x + 4, 0, 11, 64);
        g.fillStyle = "rgba(255,255,255,0.18)";
        for (let x = 0; x < 128; x += 32) g.fillRect(x + 4, 0, 11, 3);
      },
      true,
    );
    ballast.repeat.set(400 / 3.2, 5);
    const bp = new THREE.Mesh(GEO.plane, tm(ballast));
    bp.rotation.x = -Math.PI / 2;
    bp.scale.set(400, 13, 1);
    bp.position.set(0, -0.25, -3.6);
    s.add(bp);
    this.rushTex.push(ballast);
    this.rushK.push(ballast.repeat.x / 400);
    const fields = canvasTex(
      256,
      256,
      (g) => {
        const greens = ["#7fcf5a", "#9bdc6a", "#6cc06a", "#c9dd72", "#8fd07e", "#b7e27c"];
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 4; j++) {
            g.fillStyle = greens[(i * 3 + j * 5) % greens.length];
            g.fillRect(i * 64, j * 64, 64, 64);
            g.fillStyle = "rgba(255,255,255,0.12)";
            for (let k = 0; k < 64; k += 8) g.fillRect(i * 64, j * 64 + k, 64, 3);
          }
        // the hedges between the fields (they show the speed)
        g.fillStyle = "#3f8a45";
        for (let i = 0; i < 4; i++) g.fillRect(i * 64, 0, 7, 256);
        g.fillStyle = "#4f9a52";
        for (let j = 0; j < 4; j++) g.fillRect(0, j * 64, 256, 5);
      },
      true,
    );
    fields.repeat.set(800 / 48, 300 / 48);
    const fp = new THREE.Mesh(GEO.plane, tm(fields));
    fp.rotation.x = -Math.PI / 2;
    fp.scale.set(800, 300, 1);
    fp.position.set(0, -0.3, -160);
    s.add(fp);
    this.rushTex.push(fields);
    this.rushK.push(fields.repeat.x / 800);
    // the goods trains: an open wagon's side a lane (ribs, a band, the bogies), sliding at the lane's own speed;
    // under the two back ones, the viaduct they run on (its piers rush past)
    const LIV = ["#ff6b35", "#9d7bff", "#35b4c9"];
    const viaduct = canvasTex(
      128,
      64,
      (g) => {
        g.fillStyle = "#d9d3e6";
        g.fillRect(0, 0, 128, 64);
        g.fillStyle = "#b9b1cc";
        g.fillRect(0, 0, 128, 7);
        g.fillStyle = "#6a6286";
        g.beginPath();
        g.ellipse(64, 64, 40, 42, 0, Math.PI, 0);
        g.fill();
        g.fillStyle = "#a79fbd";
        g.fillRect(0, 0, 6, 64);
        g.fillRect(122, 0, 6, 64);
      },
      true,
    );
    // (the lane is 34 m of a train three times as long, on a viaduct as long: a wide screen never sees their ends)
    const TL = 102;
    viaduct.repeat.set((TL * 5) / 34, 1);
    this.rushTex.push(viaduct);
    this.rushK.push(viaduct.repeat.x / TL);
    const viaMat = tm(viaduct);
    const CH = 1.75;
    LANES.forEach((L, l) => {
      const top = L.y - BOARD;
      const c = LIV[l];
      const wagon = canvasTex(
        512,
        128,
        (g) => {
          g.fillStyle = "#2a2440";
          g.fillRect(0, 0, 512, 128);
          // the car: 8.5 m, a coupling gap at its end
          g.fillStyle = c;
          g.fillRect(14, 6, 484, 100);
          g.fillStyle = tint(c, 0.35);
          g.fillRect(14, 6, 484, 9);
          g.fillStyle = tint(c, -0.22);
          for (let x = 40; x < 490; x += 46) g.fillRect(x, 15, 7, 91);
          g.fillStyle = "#fff6e8";
          g.fillRect(150, 40, 212, 30);
          g.font = "900 26px Geist, Roboto, sans-serif";
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillStyle = tint(c, -0.35);
          g.fillText(["Z-FREIGHT", "ZEC LINE", "ZEC 货运"][l], 256, 56);
          // the bogies
          g.fillStyle = "#1c1730";
          g.fillRect(14, 104, 484, 24);
          g.fillStyle = "#8a84a8";
          for (const bx of [70, 130, 380, 440]) {
            g.beginPath();
            g.arc(bx, 116, 13, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = "#1c1730";
          g.fillRect(0, 60, 14, 10);
          g.fillRect(498, 60, 14, 10);
        },
        true,
      );
      wagon.repeat.set((TL * 4) / 34, 1);
      this.chevrons.push(wagon);
      this.chevK.push(4 / 34);
      const car = new THREE.Mesh(GEO.box, tm(wagon));
      car.scale.set(TL, CH, 0.7);
      car.position.set(0, top - CH / 2, L.z + 0.62);
      s.add(car);
      outline(car, 0.05);
      if (top - CH > 0.2) {
        const via = new THREE.Mesh(GEO.box, viaMat);
        via.scale.set(TL, top - CH, 1.4);
        via.position.set(0, (top - CH) / 2, L.z + 0.4);
        s.add(via);
      }
    });
    // the catenary: the wire the probe rides, its masts rushing past
    block("#4a4466", 300, 0.07, 0.07, 0, WIRE_Y, WIRE_Z, s);
    block("#4a4466", 300, 0.05, 0.05, 0, WIRE_Y + 0.9, WIRE_Z - 0.4, s);
    const masts: number[][] = [];
    for (let i = 0; i < 16; i++) {
      const x = -128 + i * 16;
      masts.push([x, 6.1, -11.3, 0.42, 12.2, 0.42]);
      masts.push([x, WIRE_Y + 0.55, -10.8, 0.2, 0.2, 1.3]);
    }
    this.rush(masts, ["#6d6a8a"], toon("#ffffff"), 256, RUSH_V);
    // hedgerow trees, then the city's blocks, rushing past (further: slower on screen)
    const wtex = canvasTex(
      64,
      128,
      (g) => {
        g.fillStyle = "#fff";
        g.fillRect(0, 0, 64, 128);
        for (let y = 6; y < 128; y += 12)
          for (let x = 5; x < 64; x += 12) {
            g.fillStyle = (x * 7 + y * 3) % 5 === 0 ? "#e8f6ff" : "#8fa6c0";
            g.fillRect(x, y, 7, 7);
          }
      },
      true,
    );
    const trees: number[][] = [];
    for (let i = 0; i < 40; i++) {
      const sz = 2 + this.rnd() * 1.8;
      trees.push([-140 + i * 7 + this.rnd() * 3, sz * 0.55, -14 - this.rnd() * 6, sz, sz * 1.1, sz]);
    }
    this.rush(trees, ["#4faa4a", "#6cc35a", "#3d9447", "#7fcf62"], toon("#ffffff"), 280, RUSH_V);
    const blocks: number[][] = [];
    const pal = ["#f1e4d2", "#d4deee", "#f6cfa6", "#c3d0e2", "#e4d8f4", "#ffe7b8", "#ffb8a8", "#bde6d6"];
    for (let i = 0; i < 36; i++) {
      const h = 8 + this.rnd() * 18;
      const w = 5 + this.rnd() * 4;
      blocks.push([-144 + i * 8, h / 2 - 0.3, -30 - this.rnd() * 12, w, h, 6 + this.rnd() * 4]);
    }
    for (let i = 0; i < 24; i++) {
      const h = 14 + this.rnd() * 26;
      blocks.push([-144 + i * 12 + 4, h / 2 - 0.3, -54 - this.rnd() * 18, 8 + this.rnd() * 5, h, 9]);
    }
    this.rush(blocks, pal, new THREE.MeshToonMaterial({ map: wtex, gradientMap: gm }), 288, RUSH_V);
    // the car: its floor, the rail with the cannons, the sill and the window pillars, the header with its sign, the roof
    const floorTex = canvasTex(
      64,
      64,
      (g) => {
        g.fillStyle = "#4b4c7c";
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = "#5a5b8e";
        for (let y = 4; y < 64; y += 16) for (let x = 4; x < 64; x += 16) g.fillRect(x, y, 8, 8);
      },
      true,
    );
    floorTex.repeat.set(10, 5);
    const floor = new THREE.Mesh(GEO.box, tm(floorTex));
    floor.scale.set(28, 0.3, 13);
    floor.position.set(0, -0.15, 8.2);
    s.add(floor);
    block("#ffd23f", 28, 0.02, 0.25, 0, 0.01, PIL_Z + 0.55, s);
    this.railOf(stripes("#ff6b35", "#fff3e0", false), "#fff3e0");
    const white = "#f4f1fb";
    // the sill: panels, a flare stripe, the heater grilles
    const sillTex = canvasTex(
      256,
      64,
      (g) => {
        g.fillStyle = "#f2eef9";
        g.fillRect(0, 0, 256, 64);
        g.fillStyle = "#ff6b35";
        g.fillRect(0, 14, 256, 9);
        g.fillStyle = "#c4b1fc";
        g.fillRect(0, 24, 256, 3);
        g.fillStyle = "#d9d2ea";
        g.fillRect(0, 0, 256, 3);
        g.fillRect(126, 0, 3, 64);
        g.fillStyle = "#8d86a8";
        for (let x = 30; x < 110; x += 9) g.fillRect(x, 38, 5, 18);
        for (let x = 150; x < 230; x += 9) g.fillRect(x, 38, 5, 18);
      },
      true,
    );
    sillTex.repeat.set(7, 1);
    const sill = new THREE.Mesh(GEO.box, tm(sillTex));
    sill.scale.set(28, 1.0, 0.5);
    sill.position.set(0, 0.5, PIL_Z);
    s.add(sill);
    outline(sill, 0.04);
    // the pillars, a lilac stripe down each, dark window seals along their edges
    const seals = new THREE.InstancedMesh(GEO.box, toon("#3a3460"), PIL_X.length * 2 + 2);
    let ns = 0;
    for (const x of PIL_X) {
      // (the car's frame throws no shadow on the trains: the front one would ride in the roof's shade, the pillars' stripes over its targets)
      const pil = block(white, PIL_HW * 2, PIL_TOP, 0.5, x, PIL_TOP / 2, PIL_Z, s);
      pil.userData.noShadow = true;
      outline(pil, 0.05);
      block("#c4b1fc", 0.28, PIL_TOP - 1.4, 0.54, x, PIL_TOP / 2, PIL_Z, s);
      for (const sx of [-1, 1]) {
        this.m4.compose(this.v.set(x + sx * (PIL_HW + 0.06), (PIL_TOP - 0.85 + 1.0) / 2, PIL_Z + 0.05), this.q4.identity(), this.s4.set(0.12, PIL_TOP - 0.85 - 1.0, 0.4));
        seals.setMatrixAt(ns++, this.m4);
      }
    }
    // (and along the sill's top and the header's foot)
    for (const y of [1.06, PIL_TOP - 0.9]) {
      this.m4.compose(this.v.set(0, y, PIL_Z + 0.05), this.q4.identity(), this.s4.set(28, 0.12, 0.4));
      seals.setMatrixAt(ns++, this.m4);
    }
    s.add(seals);
    const header = block(white, 28, 0.85, 0.5, 0, PIL_TOP - 0.42, PIL_Z, s);
    header.userData.noShadow = true;
    outline(header, 0.04);
    // the car's ends: past the last window bay the wall is solid (a route map, a door to the next car, the
    // car's number). It starts just outside the 16:9 frame at the windows' depth: a wider screen sees the
    // car's own wall there, never the lanes' ends
    const x0 = Math.max(this.halfWidth(1.0, PIL_Z + 0.25), this.halfWidth(PIL_TOP - 0.85, PIL_Z + 0.25)) + 0.15;
    const bayW = 14.25 - x0;
    const bayH = PIL_TOP - 0.85 - 1.0;
    const map = canvasTex(384, 832, (g) => {
      g.fillStyle = "#f4f1fb";
      g.fillRect(0, 0, 384, 832);
      // the panel's seams, a lilac band and a flare one at the handrail's height
      g.fillStyle = "#d9d2ea";
      g.fillRect(0, 0, 384, 6);
      g.fillRect(0, 0, 6, 832);
      g.fillRect(378, 0, 6, 832);
      g.fillStyle = "#c4b1fc";
      g.fillRect(0, 730, 384, 16);
      g.fillStyle = "#ff6b35";
      g.fillRect(0, 752, 384, 8);
      // the route's map: the ZEC LINE's ring through the four districts, the next stop lit
      rr(g, 28, 60, 328, 356, 20);
      g.fillStyle = "#1a1033";
      g.fill();
      g.font = "900 34px Geist, Roboto, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ff6b35";
      g.fillText("ZEC LINE", 192, 100);
      g.strokeStyle = "#c4b1fc";
      g.lineWidth = 8;
      rr(g, 112, 140, 160, 120, 50);
      g.stroke();
      const stops: [number, number, string, string][] = [
        [192, 140, "O", "ORCHARD"],
        [272, 200, "I", "IRONWOOD"],
        [192, 260, "G", "GENESIS"],
        [112, 200, "D", "DOWNTOWN"],
      ];
      stops.forEach(([x, y, k, name], i) => {
        const next = k === "G";
        g.fillStyle = next ? "#ff6b35" : "#fff6e8";
        g.beginPath();
        g.arc(x, y, 15, 0, Math.PI * 2);
        g.fill();
        g.font = "900 18px Geist, Roboto, sans-serif";
        g.fillStyle = "#1a1033";
        g.fillText(k, x, y + 1);
        // (the key under the ring)
        const ly = 300 + i * 27;
        g.fillStyle = next ? "#ff6b35" : "#c4b1fc";
        g.fillText(k, 84, ly);
        g.textAlign = "left";
        g.fillStyle = next ? "#ffd9c4" : "#e8e6e0";
        g.fillText(next ? `${name}  ◀ NEXT` : name, 106, ly);
        g.textAlign = "center";
      });
      // the door to the next car: its leaf, its round window, the handle
      rr(g, 78, 452, 228, 250, 16);
      g.fillStyle = "#d9d2ea";
      g.fill();
      g.fillStyle = "#3a3460";
      g.beginPath();
      g.arc(192, 546, 44, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#8fb8e8";
      g.beginPath();
      g.arc(192, 546, 34, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.fillRect(170, 524, 26, 8);
      g.fillStyle = "#8d86a8";
      g.fillRect(270, 600, 14, 60);
      g.font = "900 26px Geist, Roboto, sans-serif";
      g.fillStyle = "#6a6286";
      g.fillText("CAR 03 · 三号车", 192, 794);
    });
    const bayMat = tm(map);
    for (const sx of [-1, 1]) {
      const bay = new THREE.Mesh(GEO.box, bayMat);
      bay.scale.set(bayW, bayH, 0.5);
      bay.position.set(sx * (x0 + bayW / 2), 1.0 + bayH / 2, PIL_Z);
      bay.userData.noShadow = true;
      s.add(bay);
      outline(bay, 0.05);
      // (a fire point by the door: the red box, its sign)
      outline(block("#e14a3b", 0.5, 1.1, 0.3, sx * (x0 + 0.55), 2.2, PIL_Z + 0.4, s), 0.04);
    }
    // the ceiling: panels, a light strip down each run, the vents
    const ceil = canvasTex(
      128,
      128,
      (g) => {
        g.fillStyle = "#ebe6f5";
        g.fillRect(0, 0, 128, 128);
        g.fillStyle = "#d4cde6";
        g.fillRect(0, 0, 128, 3);
        g.fillRect(0, 0, 3, 128);
        g.fillStyle = "#fffdf4";
        g.fillRect(20, 52, 88, 22);
        g.fillStyle = "#bdb5d6";
        for (let x = 24; x < 104; x += 10) g.fillRect(x, 96, 5, 16);
      },
      true,
    );
    ceil.repeat.set(9, 6);
    const roof = new THREE.Mesh(GEO.box, tm(ceil));
    roof.scale.set(28, 0.4, 19);
    roof.position.set(0, PIL_TOP + 0.2, PIL_Z + 9.3);
    roof.userData.noShadow = true;
    s.add(roof);
    // the handrail along the sill, the ads either side of the destination sign
    const bar = new THREE.Mesh(GEO.cyl, toon("#dcd8ea", "#2a2440"));
    bar.rotation.z = Math.PI / 2;
    bar.scale.set(0.12, 27.6, 0.12);
    bar.position.set(0, 1.12, PIL_Z + 0.42);
    s.add(bar);
    outline(bar, 0.02);
    const ad = (head: string, line: string, c: string) =>
      canvasTex(512, 72, (g) => {
        g.fillStyle = "#1a1033";
        g.fillRect(0, 0, 512, 72);
        g.fillStyle = c;
        g.fillRect(0, 0, 12, 72);
        g.font = "900 30px Geist, Roboto, sans-serif";
        g.textBaseline = "middle";
        g.fillStyle = c;
        g.fillText(head, 28, 26);
        g.font = "700 20px Geist, Roboto, sans-serif";
        g.fillStyle = "#e8e6e0";
        g.fillText(line, 28, 54);
      });
    [
      [-9.9, ad("SHIELD YOUR ZEC", "Orchard by default. Your keys.", "#ff6b35")],
      [9.9, ad("ZSCAN", "Every block, every pool, live", "#c4b1fc")],
    ].forEach(([x, tex]) => {
      const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex as THREE.Texture }));
      m.scale.set(4.8, 0.68, 1);
      m.position.set(x as number, PIL_TOP - 0.42, PIL_Z + 0.27);
      s.add(m);
    });
    const led = canvasTex(1024, 72, (g) => {
      g.fillStyle = "#120d22";
      g.fillRect(0, 0, 1024, 72);
      g.font = "900 44px Geist, Roboto, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = "#ffb347";
      g.shadowBlur = 12;
      g.fillStyle = "#ffc46b";
      g.fillText("ZEC LINE  ▶  GENESIS  ·  ZEC 线 下一站 创世", 512, 38);
    });
    const sign = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: led }));
    sign.scale.set(9.5, 0.66, 1);
    sign.position.set(0, PIL_TOP - 0.42, PIL_Z + 0.27);
    s.add(sign);
    // the straps swaying from the roof's rail
    block("#c9c4da", 26, 0.09, 0.09, 0, PIL_TOP - 0.12, 6.8, s);
    const strap = new THREE.InstancedMesh(GEO.box, toon("#ff8a4c"), 10);
    const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(0.17, 0.045, 6, 16), toon("#fff3e0"), 10);
    for (const m of [strap, ring]) ((m.frustumCulled = false), s.add(m));
    this.straps.push(strap, ring);
    // the Q-Blocks on the sill's ends
    for (const sx of [-1, 1]) {
      const q = qBlock(0.8);
      q.position.set(sx * 10.6, 1.5, PIL_Z);
      s.add(q);
      this.qBlocks.push(q);
    }
    // the ceiling's lights
    const at = this.bulbAt;
    for (const z of [3.2, 6.2, 9.4, 12.6]) for (let x = -11; x <= 11.01; x += 2.75) at.push(new THREE.Vector3(x, PIL_TOP - 0.05, z));
    this.lightBulbs(0.3);
    // the pillars on the HUD: each edge's foot and top, through the play camera (the face toward the car)
    for (const x of PIL_X) {
      const e: number[] = [];
      for (const ex of [x - PIL_HW, x + PIL_HW])
        for (const ey of [0, PIL_TOP]) {
          this.proj(ex, ey, PIL_Z + 0.25);
          e.push(this.psx, this.psy);
        }
      this.pil.push(e);
    }
  }

  /** On the express: whether a HUD spot is behind a window pillar (`pad` px wider; negative: narrower). */
  private blocked(sx: number, sy: number, pad: number) {
    if (this.L.kind !== "train") return false;
    for (const e of this.pil) {
      // (left edge foot x,y, top x,y; right edge foot x,y, top x,y)
      if (sy > e[1] + 4) continue;
      const kl = (sy - e[1]) / (e[3] - e[1]);
      const xl = e[0] + (e[2] - e[0]) * kl;
      const kr = (sy - e[5]) / (e[7] - e[5]);
      const xr = e[4] + (e[6] - e[4]) * kr;
      if (sx > xl - pad && sx < xr + pad) return true;
    }
    return false;
  }

  /** ZK CEMETERY: an old iron booth with lanterns, terraces of tombs, a dead tree's branch for the swingers, the crypt and the watchman's tower under the moon. */
  private graveyard() {
    const s = this.w.scene;
    const gm = toon("#fff").gradientMap;
    const tm = (map: THREE.Texture) => new THREE.MeshToonMaterial({ map, gradientMap: gm });
    // the night all round: stars and their milky band over a violet haze on the horizon (the fog's colour)
    skyDome(s, { sky: ["#05040f", this.L.sky[1]], stars: 620, band: true, haze: 0.5, rnd: rng(0x6a11) });
    skyline(s, { r: 200, n: 56, rnd: this.rnd, night: true, tall: 0.7 });
    // the moon and its halo
    const moon = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: "#fff1d6", fog: false }));
    moon.scale.setScalar(19);
    moon.position.set(-52, 21, -170);
    s.add(moon);
    const halo = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: glowTex(), color: "#8a7fe0", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.scale.setScalar(95);
    halo.position.set(-52, 21, -171);
    s.add(halo);
    // the ground, the deck, the earth under the lanes
    block("#1b1631", 170, 1, 170, 0, -0.5, -40, s);
    const planks = canvasTex(
      128,
      128,
      (g) => {
        for (let i = 0; i < 4; i++) {
          g.fillStyle = ["#5a4440", "#4c3936", "#634b45", "#52403c"][i];
          g.fillRect(0, i * 32, 128, 32);
          g.fillStyle = "rgba(20,10,10,0.45)";
          g.fillRect(0, i * 32 + 29, 128, 3);
          g.fillRect((i * 53) % 128, i * 32, 3, 32);
        }
      },
      true,
    );
    planks.repeat.set(14, 4);
    const deck = new THREE.Mesh(GEO.box, tm(planks));
    deck.scale.set(30, 0.3, 9);
    deck.position.set(0, 0, 9);
    s.add(deck);
    const earth = canvasTex(
      64,
      64,
      (g) => {
        g.fillStyle = "#22283a";
        g.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 40; i++) {
          g.fillStyle = i % 3 ? "#2b3a3c" : "#33294a";
          g.fillRect((i * 29) % 64, (i * 17) % 64, 4, 3);
        }
      },
      true,
    );
    earth.repeat.set(14, 3);
    const floor = new THREE.Mesh(GEO.box, tm(earth));
    floor.scale.set(30, 0.2, 7);
    floor.position.set(0, 0, 1);
    s.add(floor);
    // the rail: old iron, a lilac cap
    const iron = canvasTex(
      64,
      64,
      (g) => {
        g.fillStyle = "#1d1830";
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = "#3e355e";
        for (let x = 4; x < 64; x += 16) g.fillRect(x, 0, 6, 64);
        g.fillStyle = "#4e4474";
        g.fillRect(0, 26, 64, 5);
      },
      true,
    );
    this.railOf(iron, "#6a58a8");
    // the lanes: terraces of old stone, the epitaphs of dead addresses; a mist drifting along each (it shows the procession's way)
    const stone = canvasTex(
      256,
      128,
      (g) => {
        g.fillStyle = "#3a3556";
        g.fillRect(0, 0, 256, 128);
        for (let r = 0; r < 4; r++)
          for (let c = 0; c < 5; c++) {
            g.fillStyle = ["#443e66", "#3d3760", "#4a4470", "#36314f"][(r * 3 + c) % 4];
            g.fillRect(c * 52 + (r % 2) * 26 - 26 + 2, r * 32 + 2, 48, 28);
          }
        g.fillStyle = "rgba(70,140,90,0.35)";
        for (let i = 0; i < 9; i++) g.fillRect((i * 61) % 240, 100 + (i % 3) * 8, 18, 6);
        g.font = "800 12px Geist, Roboto, sans-serif";
        g.fillStyle = "rgba(200,190,255,0.16)";
        g.fillText("R.I.P. SPROUT · 2016–2020", 60, 54);
      },
      true,
    );
    stone.repeat.set((4 * 46) / 34, 1);
    const mistTex = canvasTex(
      256,
      64,
      (g) => {
        for (let i = 0; i < 9; i++) {
          const x = (i * 71) % 256,
            y = 26 + (i % 3) * 8,
            r = 22 + (i % 4) * 8;
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, "rgba(210,200,255,0.55)");
          gr.addColorStop(1, "rgba(210,200,255,0)");
          g.fillStyle = gr;
          g.fillRect(x - r, y - r, r * 2, r * 2);
          if (x + r > 256) g.fillRect(x - r - 256, y - r, r * 2, r * 2);
        }
      },
      true,
    );
    const stoneMat = tm(stone);
    const tombs: [number, number, number, number, number, number, number, string][] = [];
    LANES.forEach((L, l) => {
      const top = L.y - BOARD;
      // (the terraces run on past the lanes' 34 m, behind the mausoleums at their ends)
      const b = new THREE.Mesh(GEO.box, stoneMat);
      b.scale.set(46, top, 0.7);
      b.position.set(0, top / 2, L.z + 0.62);
      s.add(b);
      outline(b, 0.05);
      block("#2c2846", 46, 0.16, 0.9, 0, top + 0.02, L.z + 0.62, s);
      // (the moon catches the terrace's lip: a pale line along it, so each step reads in the dark)
      block("#7d74c8", 46, 0.07, 0.07, 0, top + 0.12, L.z + 1.04, s, glow("#7d74c8"));
      const mt = mistTex.clone();
      mt.repeat.set(5, 1);
      mt.needsUpdate = true;
      this.chevrons.push(mt);
      this.chevK.push(5 / 34);
      const mist = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: mt, transparent: true, opacity: 0.36, depthWrite: false }));
      mist.scale.set(34, 1.3, 1);
      mist.position.set(0, top + 0.18, L.z + 1.02);
      mist.renderOrder = 4;
      s.add(mist);
      // the row of graves behind the lane
      for (let x = -16 + l * 1.1; x <= 16; x += 3.3 + this.rnd() * 1.2) {
        const h = 0.7 + this.rnd() * 0.6;
        const w = 0.8 + this.rnd() * 0.35;
        const c = ["#3e3960", "#47416c", "#363253", "#4d4774"][Math.floor(this.rnd() * 4)];
        const tz = L.z - 1.15 - this.rnd() * 0.3;
        tombs.push([x + this.rnd() * 0.6, top + h / 2, tz, w, h, 0.26, (this.rnd() - 0.5) * 0.22, c]);
        if (this.rnd() < 0.3) tombs.push([x + 0.3, top + h + 0.25, tz, 0.9, 0.18, 0.2, 0, c]);
        if (this.rnd() < 0.45) this.candles.push(new THREE.Vector3(x + 0.7, top + 0.2, tz + 0.35));
      }
    });
    mistTex.dispose();
    // the dead tree whose branch the swingers hang from, the wisp's line
    const bark = "#2a1f2c";
    for (const sx of [-1, 1]) {
      outline(block(bark, 1.0, 11.8, 1.0, sx * 13.4, 5.9, SW_Z, s), 0.05);
      outline(block(bark, 1.8, 0.8, 1.8, sx * 13.4, 0.4, SW_Z, s), 0.05);
      outline(block("#2a1f2a", 0.5, 10, 0.5, sx * (this.wireHw + 1.2), 5, WIRE_Z, s), 0.04);
    }
    outline(block(bark, 27.6, 0.5, 0.5, 0, SW_Y + 0.2, SW_Z, s), 0.05);
    block("#7a6ab8", (this.wireHw + 1.2) * 2, 0.05, 0.05, 0, WIRE_Y, WIRE_Z, s);
    // the arch over the booth: two lantern posts, a crooked lintel, the sign
    const wood = "#3a2a2c";
    for (const sx of [-1, 1]) {
      outline(block(wood, 0.7, 11, 0.7, sx * 11.9, 5.5, 2.9, s), 0.05);
      outline(block("#1f1a2a", 1.0, 1.1, 1.0, sx * 11.9, 11.4, 2.9, s), 0.05);
      const q = qBlock(0.75);
      q.position.set(sx * 11.2, RAIL_Y + 0.55, RAIL_Z);
      s.add(q);
      this.qBlocks.push(q);
    }
    const lintel = block(wood, 25, 0.55, 0.6, 0, 10.5, 2.9, s);
    lintel.rotation.z = 0.025;
    outline(lintel, 0.05);
    const signTex = canvasTex(1024, 256, (g) => {
      rr(g, 8, 8, 1008, 240, 40);
      g.fillStyle = "#2a1d22";
      g.fill();
      rr(g, 22, 22, 980, 212, 30);
      g.fillStyle = "#4a3434";
      g.fill();
      g.fillStyle = "rgba(0,0,0,0.25)";
      for (let i = 0; i < 6; i++) g.fillRect(22, 40 + i * 34, 980, 4);
      toy(g, "ZK CEMETERY", 512, 112, 96, "#c4b1fc");
      toy(g, "NULLIFIER GALLERY · 零知识墓园", 512, 188, 34, "#ffb070", { rim: false });
    });
    const board = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
    board.scale.set(11, 2.75, 1);
    board.position.set(0, 12.1, 3.3);
    board.rotation.z = -0.03;
    s.add(board);
    // the far side: a terrace of the seven great sarcophagi, the crypt, obelisks, dead trees, the watchman's tower
    const Z = -44;
    const far: [number, number, number, number, number, number, number, string][] = [];
    const pale = "#4f4878",
      deep = "#3b3560";
    far.push([0, 2.5, -29, 48, 5, 7, 0, deep]);
    const names = ["SPROUT", "BCTV14", "TRUSTED SETUP", "P2PKH", "P2SH", "REUSED ADDRESS", "DUST ATTACK"];
    names.forEach((nm, i) => {
      const x = (i - 3) * 6.4;
      far.push([x, 5.7, -28.4, 4.6, 1.4, 2.2, 0, pale]);
      far.push([x, 6.6, -28.4, 4.9, 0.45, 2.5, 0, "#5d5690"]);
      const lb = label(nm, 0.42, "#d9d0ff", "#231c3c");
      lb.position.set(x, 5.65, -27.27);
      s.add(lb);
      this.candles.push(new THREE.Vector3(x + 2.0, 7.1, -27.6));
    });
    far.push([0, 7, Z, 24, 14, 10, 0, deep]);
    far.push([0, 14.6, Z, 27, 1.2, 12, 0, pale]);
    far.push([0, 15.8, Z, 21, 1.2, 10, 0, deep]);
    far.push([0, 16.9, Z, 14, 1.0, 9, 0, pale]);
    far.push([0, 17.8, Z, 7, 0.8, 8, 0, deep]);
    for (let x = -10; x <= 10.01; x += 4) far.push([x, 7.5, Z + 5.6, 1.4, 13, 1.4, 0, pale]);
    far.push([0, 3.6, Z + 5.2, 4.2, 7.2, 0.6, 0, "#120d22"]);
    for (let i = 0; i < 3; i++) far.push([0, 0.3 + i * 0.6, Z + 7.6 - i * 0.9, 12 - i * 2, 0.6, 1.2, 0, pale]);
    for (const x of [-21, -29, -37, 23, 31, 39]) {
      const h = 9 + ((Math.abs(x) * 7) % 6);
      far.push([x, h / 2, -32 - (x % 5), 1.8, h, 1.8, 0, pale]);
      far.push([x, h + 0.5, -32 - (x % 5), 1.0, 1.0, 1.0, 0.78, "#5d5690"]);
    }
    // dead trees: a trunk and crooked boughs
    for (const [tx, tz] of [
      [-25, -20],
      [-35, -16],
      [29, -18],
      [37, -24],
    ]) {
      far.push([tx, 6, tz, 1.1, 12, 1.1, 0, "#211a26"]);
      far.push([tx + 2, 10, tz, 4.6, 0.5, 0.5, 0.5, "#211a26"]);
      far.push([tx - 1.8, 8.6, tz, 4, 0.45, 0.45, -0.6, "#211a26"]);
      far.push([tx + 0.8, 12.6, tz, 2.6, 0.4, 0.4, 1.1, "#211a26"]);
    }
    // the watchman's tower
    const TX = 22,
      TZ = -36;
    far.push([TX, 11, TZ, 5, 22, 5, 0, deep]);
    far.push([TX, 24.4, TZ, 6.2, 0.6, 6.2, 0, pale]);
    far.push([TX, 27.4, TZ, 6.4, 0.6, 6.4, 0, pale]);
    for (const [dx, dz] of [
      [-2.9, -2.9],
      [2.9, -2.9],
      [-2.9, 2.9],
      [2.9, 2.9],
    ])
      far.push([TX + dx, 25.9, TZ + dz, 0.5, 2.6, 0.5, 0, pale]);
    for (const t of tombs) far.push(t);
    // the mausoleums at the terraces' ends: the dead keys march out of their doors (a wider screen sees them
    // come from behind a front of stone, not out of thin air); a candle by each door
    this.wings((x, y, z, w, h, sx, l) => {
      far.push([x, y, z, w, h, 0.6, 0, l % 2 ? deep : pale]);
      far.push([x, h + 0.3, z - 0.2, w + 0.8, 0.6, 1.6, 0, "#5d5690"]);
      far.push([x, h + 0.85, z - 0.2, w - 1.2, 0.5, 1.2, 0, pale]);
      far.push([x - sx * (w / 2 - 1.3), h - 2.2, z + 0.32, 1.9, 3.2, 0.1, 0, "#120d22"]);
      far.push([x - sx * (w / 2 - 1.3), h - 0.45, z + 0.34, 2.5, 0.3, 0.14, 0, "#6a62a4"]);
      this.candles.push(new THREE.Vector3(x - sx * (w / 2 - 2.9), h - 3.5, z + 0.5));
      this.candles.push(new THREE.Vector3(x + sx * 1.2, h + 1.2, z + 0.2));
    });
    // dead trees and leaning stones out on the sides (the fly-over and a wide screen look that way)
    const GR = rng(0x6a12);
    for (const sx of [-1, 1])
      for (let i = 0; i < 7; i++) {
        const tx = sx * (27 + GR() * 16),
          tz = 10 - i * 7 + GR() * 3,
          th = 7 + GR() * 6;
        if (i % 2) {
          far.push([tx, th / 2, tz, 0.9, th, 0.9, 0, "#211a26"]);
          far.push([tx + 1.6, th * 0.8, tz, 3.6, 0.42, 0.42, 0.5, "#211a26"]);
          far.push([tx - 1.5, th * 0.66, tz, 3.2, 0.4, 0.4, -0.6, "#211a26"]);
        } else {
          far.push([tx, 1.1, tz, 1.5, 2.2, 0.4, (GR() - 0.5) * 0.3, pale]);
          far.push([tx + 2.6, 0.8, tz + 1.5, 1.2, 1.6, 0.4, (GR() - 0.5) * 0.4, deep]);
        }
      }
    const im = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), far.length);
    far.forEach(([x, y, z, w, h, d, rz, c], i) => {
      this.e4.set(0, 0, rz);
      this.m4.compose(this.v.set(x, y, z), this.q4.setFromEuler(this.e4), this.s4.set(w, h, d));
      im.setMatrixAt(i, this.m4);
      im.setColorAt(i, this.col.set(c));
    });
    s.add(im);
    const nm = label("ZK CEMETERY", 2.0, "#e6dcff", "#1a1033");
    nm.position.set(0, 11.6, Z + 6.4);
    s.add(nm);
    block("#ffd9a0", 3.2, 2.0, 3.2, TX, 25.9, TZ, s, glow("#ffd9a0"));
    // its lantern's beam sweeping the lanes, and the light where it falls
    const beamMat = new THREE.MeshBasicMaterial({ color: "#ffe4b8", transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beamGeo = new THREE.ConeGeometry(2.8, 1, 18, 1, true).translate(0, -0.5, 0);
    const piv = new THREE.Group();
    piv.position.set(TX, 25.9, TZ);
    const cone = new THREE.Mesh(beamGeo, beamMat);
    cone.renderOrder = 6;
    piv.add(cone);
    s.add(piv);
    this.beam = piv;
    this.beamLight = new THREE.PointLight("#ffd9a0", 0, 11, 1.4);
    s.add(this.beamLight);
    // the flares' lights (the two newest), the rail's lantern warming the booth
    for (let i = 0; i < 2; i++) {
      const pl = new THREE.PointLight("#ffd0b0", 0, 10, 1.4);
      s.add(pl);
      this.flareLights.push(pl);
    }
    const lan = new THREE.PointLight("#ffb070", 34, 22, 1.25);
    lan.position.set(0, 6.5, 8.5);
    s.add(lan);
    // the lanterns (up the posts, along the rail) and the candles on the graves
    const at = this.bulbAt;
    for (const sx of [-1, 1]) for (const y of [3.4, 6.6, 9.6]) at.push(new THREE.Vector3(sx * 11.9, y, 3.32));
    for (const sx of [-1, 1]) at.push(new THREE.Vector3(sx * 11.9, 11.4, 2.9));
    for (let x = -10; x <= 10.01; x += 2.5) at.push(new THREE.Vector3(x, RAIL_Y + 0.22, RAIL_Z + 0.56));
    this.lightBulbs(0.26);
    // three flares already burning on the card (the fly-over sees the place)
    this.flare(-5, LANES[1].y, LANES[1].z + 0.3, 1, "#ffd0b0", 5.5);
    this.flare(6, LANES[2].y, LANES[2].z + 0.3, 1, "#c4b1fc", 6);
    this.flare(1, LANES[0].y, LANES[0].z + 0.3, 0, "#ffb070", 4.5);
  }

  /** A flare where a shot landed (the graveyard): `big` 1 for the bolt's; `dur` its life (default by size). */
  private flare(x: number, y: number, z: number, big: number, c: string, dur = 0) {
    if (this.L.kind !== "dark") return;
    let f = this.flares[0];
    for (const q of this.flares)
      if (!q.on) {
        f = q;
        break;
      } else if (q.t / q.dur > f.t / f.dur) f = q;
    f.on = true;
    f.x = x;
    f.y = y;
    f.z = z;
    f.t = 0;
    f.dur = dur || FLARE_T[big];
    f.r = FLARE_R[big];
    f.c.set(c).lerp(this.white, 0.55);
  }

  /** A flare's strength now (0…1): full, then it gutters out over its last 0.7 s. */
  private flareK(f: Flare) {
    return clamp((f.dur - f.t) / 0.7, 0, 1) * (f.t < 0.08 ? 0.6 + f.t * 5 : 1);
  }

  /** The graveyard's light on each target: the flares, the wisp, the watchman's beam (a known shield stays known). */
  private light(dt: number) {
    if (this.L.kind !== "dark") return;
    for (const f of this.flares) if (f.on && (f.t += dt) >= f.dur) f.on = false;
    this.beamX = Math.sin(this.clk * 0.21 + 0.6) * 13.5;
    for (const t of this.tg) {
      if (!t.on) continue;
      let lit = 0;
      if (t.kind === QUBIT) lit = 1;
      else {
        for (const f of this.flares) {
          if (!f.on) continue;
          const d = Math.hypot(t.x - f.x, t.y - f.y, (t.z - f.z) * 1.15);
          const k = clamp((f.r - d) / (f.r * 0.4), 0, 1) * this.flareK(f);
          if (k > lit) lit = k;
        }
        for (const q of this.tg)
          if (q.on && q.kind === QUBIT) {
            const d = Math.hypot(t.x - q.x, t.y - q.y, t.z - q.z);
            lit = Math.max(lit, clamp((3.4 - d) / 1.2, 0, 1));
          }
        lit = Math.max(lit, clamp((2.6 - Math.abs(t.x - this.beamX)) / 1.0, 0, 1) * 0.95);
      }
      t.lit = lit;
      if (lit >= LIT_K && t.kind === SHIELD) t.misread = 0;
    }
  }

  private inst(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, colors = false) {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.count = 0;
    m.visible = false;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colors) m.setColorAt(0, this.col.set(0xffffff));
    this.w.scene.add(m);
    return m;
  }

  // ---- screen and world --------------------------------------------------------------------------

  /** Where a point lands on the HUD through the play camera (into psx, psy, pdep). */
  private proj(x: number, y: number, z: number) {
    this.v.set(x, y, z).project(this.aimCam);
    this.psx = ((this.v.x + 1) / 2) * W;
    this.psy = ((1 - this.v.y) / 2) * H;
    const dx = x - EYE.x,
      dy = y - EYE.y,
      dz = z - EYE.z;
    this.pdep = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** The world point under a HUD spot, on the plane at depth z. */
  private rayAt(sx: number, sy: number, z: number, out: THREE.Vector3) {
    out.set((sx / W) * 2 - 1, 1 - (sy / H) * 2, 0.5).unproject(this.aimCam);
    out.sub(EYE);
    const k = (z - EYE.z) / out.z;
    return out.multiplyScalar(k).add(EYE);
  }

  /** The lane whose targets ride nearest this HUD height. */
  private laneAt(sy: number) {
    let best = 0;
    for (let l = 1; l < 3; l++) if (Math.abs(this.laneSy[l] - sy) < Math.abs(this.laneSy[best] - sy)) best = l;
    return best;
  }

  /** The x where a height/depth leaves the screen (a lane's half width). */
  private halfWidth(y: number, z: number) {
    let lo = 0,
      hi = 80;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      this.proj(m, y, z);
      if (this.psx < W) lo = m;
      else hi = m;
    }
    return lo;
  }

  // ---- the targets -------------------------------------------------------------------------------

  private spawn(kind: number, mode: number, lane: number, x: number): Tgt | null {
    let t: Tgt | null = null;
    for (const q of this.tg)
      if (!q.on) {
        t = q;
        break;
      }
    if (!t) return null;
    const L = LANES[lane];
    t.on = true;
    t.id = ++this.ids;
    t.kind = kind;
    t.mode = mode;
    t.lane = lane;
    t.x = x;
    t.y = L.y - DROP;
    t.z = L.z;
    t.vx = t.vy = t.vz = 0;
    t.age = 0;
    t.hold = 99;
    t.up = 0;
    t.hp = kind === BASKET ? 2 : 1;
    t.slot = -1;
    t.rot = t.spin = t.wob = 0;
    t.away = false;
    t.ok = false;
    t.live = false;
    t.inbound = 0;
    t.misread = 0;
    t.lit = 1;
    if (this.L.kind === "dark") {
      // (in the dark, until it is lit, a weak eye takes a shield for a lock; the light is worked out next frame)
      t.lit = 0;
      if (kind === SHIELD)
        for (let i = 0; i < 4; i++) {
          const sk = this.players[i].human ? this.botSkill : this.players[i].skill;
          if (sk > 0 && this.rnd() < darkMisread(sk)) t.misread |= 1 << i;
        }
    } else if (kind === SHIELD) for (let i = 0; i < 4; i++) if (!this.players[i].human && this.rnd() < misreadP(this.players[i].skill)) t.misread |= 1 << i;
    return t;
  }

  /** The wave's kind for a lane target. */
  private pick(lane: number) {
    const w = Math.max(0, this.wave);
    const r = this.rnd();
    const shield = this.L.shield[w];
    if (r < shield) return SHIELD;
    if (r < shield + (lane === 2 ? 0.2 : lane === 1 ? 0.1 : 0.04)) return PLATE;
    return [RSA, ECDSA, ED][Math.floor(this.rnd() * 3)];
  }

  /** Room in a lane at x (no target within `gap`). */
  private free(lane: number, x: number, gap: number) {
    for (const t of this.tg) if (t.on && t.mode === LANE && t.lane === lane && Math.abs(t.x - x) < gap) return false;
    return true;
  }

  private popUp() {
    const w = this.wave;
    const r = this.rnd();
    const lane = r < 0.36 ? 0 : r < 0.7 ? 1 : 2;
    for (let tries = 0; tries < 6; tries++) {
      const hw = this.hw[lane] - 1.3;
      const x = (this.rnd() * 2 - 1) * hw;
      if (!this.free(lane, x, 2.3)) continue;
      const t = this.spawn(this.pick(lane), LANE, lane, x);
      if (!t) return;
      t.hold = w === 0 ? 2.5 + this.rnd() * 0.9 : w === 1 ? 2.2 + this.rnd() * 0.8 : 1.35 + this.rnd() * 0.6;
      t.vx = w === 0 ? 0 : this.laneV(lane);
      return;
    }
  }

  private laneV(l: number) {
    return this.wave >= 2 ? -LANES[l].v * 1.55 : LANES[l].v;
  }

  private startWave(w: number) {
    this.wave = w;
    this.waveT = 0;
    // (a shower of sparks along the lanes as each wave opens)
    const conf = this.L.kind === "dark" ? ["#c4b1fc", "#ffb070", "#ffffff", "#7fe3ff"] : ["#ff6b35", "#ffd23f", "#ffffff", "#c4b1fc", "#a8d8e8"];
    LANES.forEach((L, l) => {
      for (let i = 0; i < 4; i++) this.fx.burst(this.v.set((i - 1.5) * this.hw[l] * 0.5, L.y + 1.2, L.z + 0.5), 10, conf, { speed: 4, up: 5, size: 0.14, life: 1.1, gravity: 9 });
    });
    const call = this.L.calls[w];
    const say = (dur: number, size: number) => this.announce(T(call.s[0], call.s[1]), call.c, dur, T(call.sub[0], call.sub[1]), size);
    if (w === 0) {
      say(this.L.kind === "yard" ? 1.8 : 2.4, 52);
    } else if (w === 1) {
      say(1.6, 50);
      SND.wave();
      // (the music follows the waves: main for the conveyors, intense for the rush, the finale for the last 10 s)
      music.stage(1);
      // every lane fills and starts to run
      LANES.forEach((_, l) => {
        let x = -this.hw[l] + 1 + this.rnd() * 2;
        while (x < this.hw[l] - 1) {
          if (this.free(l, x, 2.2)) {
            const t = this.spawn(this.pick(l), LANE, l, x);
            if (t) t.up = -this.rnd() * 0.6;
          }
          x += this.L.gap[0] + this.rnd() * this.L.gap[1];
        }
        this.gap[l] = 2 + this.rnd() * 2;
      });
      for (const t of this.tg) if (t.on && t.mode === LANE) t.vx = this.laneV(t.lane);
    } else {
      say(1.8, 54);
      SND.rush();
      music.stage(2);
      this.cam.shake(0.35);
      for (const t of this.tg) if (t.on && t.mode === LANE) t.vx = this.laneV(t.lane);
      this.swWait = [0.2, 0.7, 0.45, 0.95];
    }
  }

  private announce(s: string, c: string, dur: number, sub = "", size = 58) {
    this.say = { s, c, t: 0, dur, size, sub };
  }

  /** The waves' clockwork: pop-ups, conveyors, swingers, the probes and the baskets. */
  private director(dt: number) {
    const t = this.t;
    const nw = t < W2 ? 0 : t < W3 ? 1 : 2;
    if (nw !== this.wave) this.startWave(nw);
    this.waveT += dt;
    const w = this.wave;
    this.popT -= dt;
    if (this.popT <= 0) {
      const every = this.L.pop[w];
      this.popT = every * (0.7 + this.rnd() * 0.6);
      this.popUp();
    }
    if (w >= 1)
      for (let l = 0; l < 3; l++) {
        const v = this.laneV(l);
        this.gap[l] -= Math.abs(v) * dt;
        if (this.gap[l] <= 0) {
          this.gap[l] = this.L.gap[0] * (w === 2 ? 0.85 : 1) + this.rnd() * this.L.gap[1];
          const x = v > 0 ? -this.hw[l] - 1.6 : this.hw[l] + 1.6;
          if (this.free(l, x, 2.2)) {
            const q = this.spawn(this.pick(l), LANE, l, x);
            if (q) ((q.up = 1), (q.vx = v));
          }
        }
      }
    if (w === 2 && this.L.swing)
      for (let k = 0; k < 4; k++) {
        let busy = false;
        for (const q of this.tg) if (q.on && q.mode === SWING && q.slot === k) busy = true;
        if (busy) continue;
        this.swWait[k] -= dt;
        if (this.swWait[k] > 0) continue;
        this.swWait[k] = 1.1 + this.rnd() * 0.6;
        const r = this.rnd();
        const q = this.spawn(r < 0.24 ? SHIELD : r < 0.42 ? PLATE : [RSA, ECDSA, ED][Math.floor(this.rnd() * 3)], SWING, 1, SW_X[k]);
        if (q) {
          q.slot = k;
          q.amp = 0.38 + this.rnd() * 0.22;
          q.om = 2.3 + this.rnd() * 0.9;
          q.ph = this.rnd() * Math.PI * 2;
          q.up = 0;
          q.z = SW_Z;
        }
      }
    // the probe: warned, then away along the wire
    if (this.nextQ < QUBITS.length) {
      const at = QUBITS[this.nextQ];
      if (!this.warn.on && t >= at - 0.9) {
        this.warn.on = true;
        this.warn.side = this.rnd() < 0.5 ? -1 : 1;
        this.warn.at = at;
        SND.qubit();
        this.fx.burst(this.v.set(this.warn.side * (this.wireHw + 0.6), WIRE_Y, WIRE_Z), 16, ["#c4b1fc", "#ffffff", "#9d7bff"], { speed: 3, up: 2, size: 0.13, life: 0.8, gravity: 2 });
      }
      if (this.warn.on && t >= at) {
        this.warn.on = false;
        this.nextQ++;
        const q = this.spawn(QUBIT, STREAK, 2, this.warn.side * (this.wireHw + 1.5));
        if (q) {
          q.vx = -this.warn.side * (w === 2 ? 10.5 : 7.6);
          q.z = WIRE_Z;
          q.y = WIRE_Y;
          q.up = 1;
        }
      }
    }
    if (this.nextB < BASKETS.length && t >= BASKETS[this.nextB]) {
      this.nextB++;
      const lane = this.rnd() < 0.55 ? 2 : 1;
      const v = this.laneV(lane);
      const x = w === 0 ? (this.rnd() * 2 - 1) * (this.hw[lane] - 3) : v > 0 ? -this.hw[lane] - 1.6 : this.hw[lane] + 1.6;
      const q = this.spawn(BASKET, LANE, lane, x);
      if (q) {
        q.vx = w === 0 ? 0 : v * 0.8;
        q.hold = w === 0 ? 4.2 : 99;
        if (w > 0) q.up = 1;
      }
      if (q) {
        this.fresh = q.id;
        this.fx.burst(this.v.set(q.x, LANES[lane].y + 0.5, q.z + 0.4), 18, ["#ff8a3c", "#ffd23f", "#c4b1fc", "#ffffff"], { speed: 3.5, up: 4, size: 0.13, life: 0.9, gravity: 8 });
      }
      beep(784, 0.08, "triangle", 0.12);
      beep(1046, 0.12, "triangle", 0.12, 0, 0.08);
    }
    if (!this.tenSaid && t >= PLAY - 10) {
      this.tenSaid = true;
      music.rate(1.15);
      this.announce(T("10 SECONDS!", "最后 10 秒！"), "#ff5a5a", 1.4, "", 50);
      for (const sx of [-1, 1]) this.fx.burst(this.v.set(sx * 10.5, 8, 3), 26, ["#ff5a5a", "#ffd23f", "#ffffff"], { speed: 6, up: 5, size: 0.15, life: 1.0, gravity: 10 });
    }
  }

  /** How long a target stays hittable (s), about. */
  private timeLeft(t: Tgt) {
    if (t.mode === SWING) return t.away ? 0 : 99;
    if (t.mode === FALL) return 1.2;
    if (t.mode === STREAK) {
      const edge = t.vx > 0 ? this.wireHw - t.x : t.x + this.wireHw;
      return edge / Math.abs(t.vx || 1);
    }
    let left = t.hold + (1 - clamp(t.up, 0, 1)) * 0.25;
    if (t.vx) left = Math.min(left, (t.vx > 0 ? this.hw[t.lane] - t.x : t.x + this.hw[t.lane]) / Math.abs(t.vx));
    return left;
  }

  /** Moves every target (`run`: the clock runs; on the card they hold). */
  private moveTargets(dt: number, run: boolean) {
    for (const t of this.tg) {
      if (!t.on) continue;
      t.age += dt;
      t.wob = Math.max(0, t.wob - dt * 1.8);
      if (t.mode === LANE) {
        const L = LANES[t.lane];
        if (t.hold > 0) {
          t.up = Math.min(1, t.up + dt / 0.24);
          if (run) t.hold -= dt;
        } else {
          t.up -= dt / 0.22;
          if (t.up <= 0) {
            t.on = false;
            continue;
          }
        }
        if (run) t.x += t.vx * dt;
        const u = clamp(t.up, 0, 1);
        t.y = L.y - (1 - (t.hold > 0 ? backOut(u) : u)) * DROP;
        t.rot = 0;
        if (Math.abs(t.x) > this.hw[t.lane] + 2.2 && t.x * t.vx > 0) t.on = false;
      } else if (t.mode === SWING) {
        if (t.away) {
          t.up -= dt * 1.6;
          if (t.up <= 0) {
            t.on = false;
            continue;
          }
        } else t.up = Math.min(1, t.up + dt * 1.6);
        const a = t.amp * Math.sin(t.om * t.age + t.ph);
        const len = SW_L * easeOut(clamp(t.up, 0, 1)) + 0.95;
        t.x = SW_X[t.slot] + Math.sin(a) * len;
        t.y = SW_Y - Math.cos(a) * len;
        t.rot = a;
      } else if (t.mode === STREAK) {
        t.x += t.vx * dt;
        t.y = WIRE_Y - 0.55 + Math.sin(t.age * 6) * 0.45;
        t.spin += dt * 5;
        if (Math.abs(t.x) > this.wireHw + 2 && t.x * t.vx > 0) t.on = false;
      } else if (t.mode === FALL) {
        t.vy -= 22 * dt;
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        t.z += t.vz * dt;
        t.spin += dt * 9;
        const L = LANES[t.tl];
        if (t.vy < 0 && t.y <= L.y) {
          t.mode = LANE;
          t.lane = t.tl;
          t.y = L.y;
          t.z = L.z;
          t.up = 1;
          t.hold = 2.8;
          t.spin = 0;
          t.vx = this.wave >= 1 && !this.ended() ? this.laneV(t.lane) : 0;
          if (this.ended()) t.hold = 0;
          this.fx.burst(this.v.set(t.x, L.y - 0.5, L.z + 0.4), 10, ["#d9bc8a", "#ffffff"], { speed: 3, up: 2.5, size: 0.14 });
        }
      }
    }
  }

  private ended() {
    return this.phase === "tally";
  }

  /** Each target's place on the HUD (and whether it can be hit). */
  private project(dt: number) {
    for (const t of this.tg) {
      if (!t.on) continue;
      this.proj(t.x, t.y + HC[t.kind] * TS, t.z);
      if (t.ok && dt > 0) {
        const k = Math.min(1, dt * 14);
        t.svx += ((this.psx - t.sx) / dt - t.svx) * k;
        t.svy += ((this.psy - t.sy) / dt - t.svy) * k;
      } else t.svx = t.svy = 0;
      t.sx = this.psx;
      t.sy = this.psy;
      t.dep = this.pdep;
      t.sr = (RAD[t.kind] * TS * this.focal) / this.pdep;
      t.ok = true;
      const shown = t.mode === LANE ? t.y > LANES[t.lane].y - 0.8 : t.mode === SWING ? t.up > 0.6 && !t.away : true;
      // (on the express: not while its middle is behind a window pillar)
      t.live = shown && t.sx > -t.sr && t.sx < W + t.sr && !this.blocked(t.sx, t.sy, -0.25 * t.sr);
    }
  }

  /** A shield (one this eye knows for one) under a HUD spot now or when a nullifier fired now lands (a better eye looks further ahead). */
  private shieldAhead(px: number, py: number, bit: number, sk: number) {
    const ahead = TRAVEL * (0.3 + 0.9 * sk);
    for (const t of this.tg) {
      if (!t.on || t.kind !== SHIELD || (t.misread & bit) !== 0 || !t.ok) continue;
      if (!t.live && !(t.mode === SWING && t.up > 0.3)) continue;
      const r = t.sr + GRACE + 2;
      for (let s = 0; s <= 2; s++) {
        const dx = px - (t.sx + t.svx * ahead * s * 0.5),
          dy = py - (t.sy + t.svy * ahead * s * 0.5);
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
    return false;
  }

  /** The frontmost live target under a HUD spot (`skip`: one to look past), or -1. */
  private under(px: number, py: number, pad: number, skip = -1) {
    if (this.blocked(px, py, 0)) return -1;
    let best = -1,
      bd = 1e9;
    for (let k = 0; k < this.tg.length; k++) {
      const t = this.tg[k];
      if (!t.on || !t.live || k === skip) continue;
      const dx = px - t.sx,
        dy = py - t.sy,
        r = t.sr + pad;
      if (dx * dx + dy * dy > r * r) continue;
      if (t.dep < bd) ((bd = t.dep), (best = k));
    }
    return best;
  }

  // ---- shooting ----------------------------------------------------------------------------------

  private fire(g: Gun, big: boolean) {
    let s: Shot | null = null;
    for (const q of this.shots)
      if (!q.on) {
        s = q;
        break;
      }
    if (!s || g.cd > 0 || g.stun > 0 || (big && g.bcd > 0)) return;
    const k = this.under(g.x, g.y, big ? GRACE_B : GRACE);
    // (nothing there: it flies on to the lane under the crosshair, or into the pillar in the way)
    const zEnd = k >= 0 ? this.tg[k].z + 0.25 : this.blocked(g.x, g.y, 0) ? PIL_Z + 0.3 : LANES[this.laneAt(g.y)].z + 0.25;
    this.rayAt(g.x, g.y, zEnd, this.v2);
    s.on = true;
    s.seat = g.i;
    s.big = big;
    s.t = 0;
    s.dur = big ? TRAVEL_B : TRAVEL;
    s.px = g.x;
    s.py = g.y;
    // (what it was meant for: what's under it, or else the nearest thing close to it)
    let aim = k;
    if (aim < 0) {
      let bd = 1e9;
      for (let j = 0; j < this.tg.length; j++) {
        const t = this.tg[j];
        if (!t.on || !t.live) continue;
        const d = Math.hypot(t.sx - g.x, t.sy - g.y) - t.sr;
        if (d < 26 && d < bd) ((bd = d), (aim = j));
      }
    }
    s.aim = aim >= 0 ? this.tg[aim].id : -1;
    if (aim >= 0 && aim !== k) this.tg[aim].inbound |= 1 << g.i;
    if (k >= 0) this.tg[k].inbound |= 1 << g.i;
    s.ox = s.x = g.mx;
    s.oy = s.y = g.my;
    s.oz = s.z = g.mz;
    s.ex = this.v2.x;
    s.ey = this.v2.y;
    s.ez = this.v2.z;
    const tr = this.trails[this.shots.indexOf(s)];
    for (const p of tr) ((p.x = g.mx), (p.y = g.my), (p.z = g.mz));
    g.cd = FIRE_CD;
    if (big) g.bcd = CHARGE_CD;
    g.kick = 1;
    g.shots++;
    const me = g.p.human;
    this.fx.burst(this.v.set(g.mx, g.my, g.mz), big ? 14 : 6, [g.p.color, "#ffffff"], { speed: big ? 5 : 3, up: 1, size: big ? 0.16 : 0.11, life: 0.35, gravity: 4 });
    this.flash(g.mx, g.my, g.mz, big ? 1.8 : 1.0, g.p.color, 0.16);
    if (big) {
      SND.bolt(me ? 1 : 0.35);
      if (me) this.cam.shake(0.12);
    } else SND.pew(me ? 1 : 0.3);
  }

  private moveShots(dt: number) {
    for (let k = 0; k < this.shots.length; k++) {
      const s = this.shots[k];
      if (!s.on) continue;
      s.t += dt;
      const u = Math.min(1, s.t / s.dur);
      s.x = s.ox + (s.ex - s.ox) * u;
      s.y = s.oy + (s.ey - s.oy) * u + Math.sin(u * Math.PI) * 0.5;
      s.z = s.oz + (s.ez - s.oz) * u;
      const tr = this.trails[k];
      for (let i = tr.length - 1; i > 0; i--) ((tr[i].x = tr[i - 1].x), (tr[i].y = tr[i - 1].y), (tr[i].z = tr[i - 1].z));
      tr[0].x = s.x;
      tr[0].y = s.y;
      tr[0].z = s.z;
    }
    // the landings, first come first served (a target two shots reach goes to the first)
    for (;;) {
      let first: Shot | null = null;
      for (const s of this.shots) if (s.on && s.t >= s.dur && (!first || s.t - s.dur > first.t - first.dur)) first = s;
      if (!first) break;
      first.on = false;
      this.land(first);
    }
  }

  private land(s: Shot) {
    const g = this.guns[s.seat];
    const me = g.p.human;
    const bit = 1 << s.seat;
    for (const t of this.tg) if (t.on && t.id === s.aim) t.inbound &= ~bit;
    const pad = s.big ? GRACE_B : GRACE;
    let k = this.under(s.px, s.py, pad);
    // (in the graveyard every shot bursts into a flare where it lands)
    this.flare(k >= 0 ? this.tg[k].x : s.ex, k >= 0 ? this.tg[k].y : s.ey, k >= 0 ? this.tg[k].z + 0.3 : s.ez, s.big ? 1 : 0, g.p.color);
    if (k < 0 && this.blocked(s.px, s.py, 0)) {
      // into a window pillar: it clangs off (a miss)
      if (g.combo >= 3 || me) this.pop(s.px, s.py - 26, T("CLANG!", "当！"), "#d8d2f0", me ? 20 : 15);
      g.combo = 0;
      this.fx.burst(this.v.set(s.ex, s.ey, s.ez + 0.1), 12, ["#ffffff", "#fff3c4", "#c4b1fc"], { speed: 5, up: 2, size: 0.1, life: 0.35, gravity: 10 });
      this.flash(s.ex, s.ey, s.ez + 0.2, 1.4, "#ffffff", 0.14);
      beep(2200 + Math.random() * 300, 0.05, "square", me ? 0.1 : 0.04);
      beep(1250, 0.16, "triangle", me ? 0.12 : 0.05, 0.7);
      return;
    }
    if (k < 0) {
      // beaten to it? (a snipe doesn't break your combo: a real miss does)
      let sniped = false;
      for (const c of this.claims)
        if (c.id === s.aim && c.seat !== s.seat && this.clk - c.t < 0.6) {
          sniped = true;
          this.pop(s.px, s.py - 30, T("SNIPED!", "被抢了！"), "#ff5fa2", me ? 22 : 17);
          break;
        }
      if (!sniped) {
        if (g.combo >= 3) this.pop(s.px, s.py - 26, T("MISS", "落空"), "#c9c3e0", me ? 18 : 15);
        g.combo = 0;
      }
      this.fx.burst(this.v.set(s.ex, s.ey, s.ez), 6, ["#d8d2f0", "#8a84b0"], { speed: 2, up: 1.5, size: 0.12, life: 0.4 });
      SND.miss(me ? 1 : 0.3);
      return;
    }
    let n = 0;
    let first = -1;
    while (k >= 0) {
      const t = this.tg[k];
      if (t.kind === SHIELD) {
        // the first thing in the way is a shield: denied; a bolt that pierced a lock just stops on it
        if (n === 0) this.denied(g, t);
        else {
          t.wob = 0.6;
          this.fx.burst(this.v.set(t.x, t.y, t.z + 0.3), 10, ["#bff0ff", "#ffffff"], { speed: 4, up: 2, size: 0.12, life: 0.4 });
        }
        break;
      }
      this.hit(g, t, n > 0);
      n++;
      if (!s.big || n >= 2) break;
      first = k;
      k = this.under(s.px, s.py, pad, first);
      if (k >= 0 && this.tg[k].id === t.id) break;
    }
  }

  /** A hit on a key (or the basket's first knock): the points, the combo, the shatter. */
  private hit(g: Gun, t: Tgt, pierce: boolean) {
    const me = g.p.human;
    const kk = me ? 1 : 0.4;
    g.combo++;
    g.hits++;
    if (g.combo > g.best) g.best = g.combo;
    const mult = g.combo >= C3 ? 3 : g.combo >= C2 ? 2 : 1;
    if (g.combo === C2 || g.combo === C3) {
      this.pop(g.x, g.y + 34, `×${mult} ${T("COMBO!", "连击！")}`, g.p.color, me ? 22 : 16);
      this.fx.burst(this.v.set(g.mx, g.my + 0.4, g.mz), mult === 3 ? 34 : 22, [g.p.color, "#ffffff", "#ffd23f"], { speed: 5, up: 6, size: 0.15, life: 1.0, gravity: 12 });
      if (me) SND.combo(mult - 1);
      g.hop = 0.6;
    }
    // the basket's first hit knocks it down into the lane in front
    if (t.kind === BASKET && t.hp > 1) {
      t.hp = 1;
      const pts = 10;
      g.score += pts;
      this.pop(t.sx, t.sy - t.sr - 6, `${T("KNOCK!", "击落！")} +${pts}`, g.p.color, me ? 22 : 17);
      t.mode = FALL;
      t.tl = Math.max(0, t.lane - 1);
      const dur = 0.75;
      t.vy = 6.5;
      t.vz = (LANES[t.tl].z - t.z) / dur;
      t.vx = (this.rnd() - 0.5) * 2.5;
      t.wob = 1;
      this.fx.burst(this.v.set(t.x, t.y + 0.3, t.z + 0.4), 14, SHARDS[BASKET], { speed: 4, up: 3, size: 0.16 });
      SND.knock(kk);
      this.claim(t.id, g.i);
      if (me) this.cam.shake(0.1);
      return;
    }
    let pts = PTS[t.kind] * mult;
    let tag = "";
    if (t.mode === FALL) ((pts += 10), (tag = T("AIR SHOT ", "空中 ")));
    else if (t.mode === SWING) ((pts += 5), (tag = ""));
    if (pierce) tag = T("PIERCE ", "穿透 ");
    g.score += pts;
    this.claim(t.id, g.i);
    t.on = false;
    const big = t.kind >= BASKET;
    this.pop(t.sx, t.sy - t.sr * 0.6, `${tag}+${pts}`, g.p.color, (big ? 30 : 22) * (me ? 1 : 0.8));
    // the shatter: rusty voxels, a few big chunks, a flash in the shooter's colour
    const at = this.v.set(t.x, t.y, t.z + 0.3);
    this.fx.burst(at, big ? 34 : 24, SHARDS[t.kind], { speed: 5.5, up: 4, size: 0.2, life: 1.0, gravity: 20 });
    this.fx.burst(at, 4, SHARDS[t.kind], { speed: 3.5, up: 5, size: 0.42, life: 1.1, gravity: 22 });
    this.fx.burst(at, 8, [g.p.color, "#ffffff"], { speed: 7, up: 2, size: 0.1, life: 0.35, gravity: 2 });
    this.flash(t.x, t.y, t.z + 0.5, big ? 3.6 : 2.6, g.p.color, 0.28);
    if (t.kind === QUBIT) {
      SND.prize(kk);
      this.pop(t.sx, t.sy + 26, T("TRACKER'S PROBE!", "追踪者探针！"), "#c4b1fc", me ? 20 : 15);
      g.hop = 0.6;
      this.cam.shake(me ? 0.2 : 0.06);
    } else if (t.kind === BASKET) {
      SND.prize(kk);
      this.cam.shake(me ? 0.16 : 0.05);
    } else {
      SND.clank(kk);
      this.cam.shake(me ? 0.07 : 0.025);
    }
  }

  /** A shield hit: points off, the combo gone, the cannon stunned, an angry buzz. */
  private denied(g: Gun, t: Tgt) {
    const me = g.p.human;
    g.score = Math.max(0, g.score + PTS[SHIELD]);
    g.combo = 0;
    g.stun = STUN;
    g.shields++;
    g.angryT = STUN;
    g.a.hit();
    t.wob = 1;
    // (whoever took it for a lock knows better now)
    t.misread &= ~(1 << g.i);
    this.pop(t.sx, t.sy - t.sr - 4, `${PTS[SHIELD]}`, "#ff4d6d", me ? 26 : 19);
    this.pop(g.x, g.y + 32, T("DENIED!", "被拒！"), "#a8d8e8", me ? 20 : 15);
    const at = this.v.set(t.x, t.y, t.z + 0.45);
    this.fx.burst(at, 18, ["#bff0ff", "#ffffff", "#6cd0f0"], { speed: 6, up: 2, size: 0.12, life: 0.45, gravity: 6 });
    this.fx.burst(at, 8, ["#ff4d6d", "#ffffff"], { speed: 4, up: 1, size: 0.1, life: 0.3, gravity: 2 });
    this.flash(t.x, t.y, t.z + 0.5, 3.4, "#ff4d6d", 0.3);
    // the cannon fizzles
    this.fx.burst(this.v.set(g.mx, g.my, g.mz), 10, ["#3a3450", "#8a84b0", "#a8d8e8"], { speed: 1.5, up: 2.5, size: 0.2, life: 0.8, gravity: -2 });
    SND.buzz(me ? 1 : 0.35);
    this.cam.shake(me ? 0.28 : 0.06);
  }

  private claim(id: number, seat: number) {
    let old = this.claims[0];
    for (const c of this.claims) if (c.t < old.t) old = c;
    old.id = id;
    old.seat = seat;
    old.t = this.clk;
  }

  private pop(x: number, y: number, s: string, c: string, size: number) {
    let p = this.pops[0];
    for (const q of this.pops)
      if (!q.on) {
        p = q;
        break;
      } else if (q.t > p.t) p = q;
    p.on = true;
    p.x = x;
    p.y = y;
    p.t = 0;
    p.s = s;
    p.c = c;
    p.size = size;
  }

  private flash(x: number, y: number, z: number, s: number, c: string, dur: number) {
    let f = this.flashes[0];
    for (const q of this.flashes)
      if (!q.on) {
        f = q;
        break;
      } else if (q.t / q.dur > f.t / f.dur) f = q;
    f.on = true;
    f.x = x;
    f.y = y;
    f.z = z;
    f.t = 0;
    f.dur = dur;
    f.s = s;
    f.c.set(c);
  }

  // ---- the players -------------------------------------------------------------------------------

  /**
   * The human's crosshair: it starts slow (a tap is a nudge), gathers pace while held, stops dead on release.
   * A touch stick is analog: leaned part-way it tops out lower (a light lean is a fine aim, the rim the
   * keys' full pace); the keys always lean all the way.
   */
  private steer(g: Gun, dt: number, input: Input) {
    const ax = input.axis();
    if (ax.x || ax.y) {
      const l = Math.hypot(ax.x, ax.y);
      const dx = ax.x / l,
        dy = ax.y / l;
      if (dx * g.hx + dy * g.hy < 0.5) g.spd = AIM_V0;
      g.hx = dx;
      g.hy = dy;
      const top = l >= 0.98 ? AIM_MAX : AIM_MAX * (0.07 + 0.93 * l * l);
      g.spd = Math.min(top, g.spd + AIM_ACC * dt);
      const k = g.stun > 0 ? 0.45 : 1;
      g.vx = dx * g.spd * k;
      g.vy = dy * g.spd * k;
    } else {
      g.spd = 0;
      g.hx = g.hy = 0;
      g.vx = g.vy = 0;
    }
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    // (a press a moment early still fires, the instant the cannon is ready)
    if (input.pressed("a")) g.bufA = 0.14;
    if (input.pressed("b")) g.bufB = 0.14;
    g.bufA -= dt;
    g.bufB -= dt;
    if (g.stun > 0) g.bufA = g.bufB = 0;
    if (g.bufB > 0 && g.cd <= 0 && g.bcd <= 0) ((g.bufB = 0), this.fire(g, true));
    else if (g.bufA > 0 && g.cd <= 0) ((g.bufA = 0), this.fire(g, false));
    else if (g.bufB > 0 && g.bcd > 0) {
      // (not charged yet: a dry click)
      g.bufB = 0;
      beep(150, 0.05, "square", 0.08);
    }
  }

  /** Picks the best target for a gun: value over the time to reach it, if it stays long enough. */
  private choose(g: Gun, sk: number) {
    const bit = 1 << g.i;
    const pace = AIM_MAX * aiPace(sk);
    let best = -1,
      bv = 0;
    for (let k = 0; k < this.tg.length; k++) {
      const t = this.tg[k];
      if (!t.on || !t.ok) continue;
      if (!(t.live || (t.mode === LANE && t.hold > 0 && t.up > -0.2))) continue;
      if (t.sx < X0 || t.sx > X1 || t.sy < Y0 || t.sy > Y1) continue;
      if (t.inbound & bit) continue;
      if (t.kind === SHIELD && !(t.misread & bit)) continue;
      const d = Math.hypot(t.sx - g.x, t.sy - g.y);
      const reach = 0.12 + (1 - sk) * 0.25 + d / (pace * 0.7);
      if (this.timeLeft(t) < reach + TRAVEL + 0.08) continue;
      let v = t.kind === SHIELD ? 10 : t.kind === BASKET ? (t.hp > 1 ? 16 : 32) : PTS[t.kind];
      if (t.mode === FALL) v += 10;
      // (the graveyard: what it can see first; the express: one behind a pillar can wait)
      if (this.L.kind === "dark") v *= 0.55 + 0.45 * t.lit;
      else if (!t.live && this.L.kind === "train") v *= 0.8;
      if (t.inbound & ~bit) v *= 1 - AI_DODGE[0] * sk;
      for (const o of this.guns) if (o !== g && Math.hypot(o.x - t.sx, o.y - t.sy) < Math.min(90, d * 0.6)) v *= 1 - AI_DODGE[1] * sk;
      let sc = (v / (0.35 + reach)) * (1 + (this.rnd() - 0.5) * (1 - sk) * 0.7);
      if (k === g.goal) sc *= AI_STICK;
      if (sc > bv) ((bv = sc), (best = k));
    }
    return best;
  }

  /**
   * An AI's hand on its crosshair (or, with `drive` off, the advice for the bench's scripted human):
   * a target, a reaction, a springy approach that overshoots when not so good, a lead on movers, the
   * trigger once steady, B for a pierce or a prize.
   */
  private brain(g: Gun, dt: number, sk: number, drive: boolean) {
    const bit = 1 << g.i;
    g.think -= dt;
    let t = g.goal >= 0 ? this.tg[g.goal] : null;
    if (t && (!t.on || t.id !== g.goalId || (t.inbound & bit) !== 0)) {
      t = null;
      g.goal = -1;
    }
    // (a hand on the keys commits to its target; an AI's eye keeps shopping)
    if ((g.think <= 0 && drive) || !t) {
      g.think = 0.16 + (1 - sk) * 0.22 + this.rnd() * 0.1;
      const k = this.choose(g, sk);
      if (k !== g.goal) {
        g.goal = k;
        if (k >= 0) {
          const n = this.tg[k];
          g.goalId = n.id;
          const d = Math.hypot(n.sx - g.x, n.sy - g.y);
          if (!t) g.react = AI_REACT[0] + (1 - sk) * AI_REACT[1] + this.rnd() * 0.08;
          const e = d * (1 - sk) * AI_ERR + 4 * (1 - sk);
          g.ex = (this.rnd() * 2 - 1) * e;
          g.ey = (this.rnd() * 2 - 1) * e * 0.7;
          g.aimT = 0;
          g.trig = -1;
          g.care = this.rnd() < 0.3 + 0.7 * sk;
        }
        t = k >= 0 ? this.tg[k] : null;
      }
    }
    // where to: the target, led by its speed over the flight (a weak eye under-leads)
    let tx = g.x,
      ty = g.y;
    if (t) {
      const lead = (TRAVEL + 0.04) * (0.35 + 0.65 * sk);
      tx = t.sx + t.svx * lead;
      ty = t.sy + t.svy * lead;
    } else if (drive) {
      // nothing worth it: drift home
      this.proj(SEAT_X[g.i] * 1.8, LANES[1].y, LANES[1].z);
      tx = g.x + (this.psx - g.x) * 0.3;
      ty = g.y + (250 - g.y) * 0.3;
    }
    g.ex *= Math.exp(-(1.4 + 4.5 * sk) * dt);
    g.ey *= Math.exp(-(1.4 + 4.5 * sk) * dt);
    if (drive) {
      if (g.react > 0) {
        g.react -= dt;
        g.vx *= Math.exp(-9 * dt);
        g.vy *= Math.exp(-9 * dt);
      } else {
        const om = 7 + 9 * sk,
          ze = 0.42 + 0.5 * sk;
        let ax = om * om * (tx + g.ex - g.x) - 2 * ze * om * g.vx;
        let ay = om * om * (ty + g.ey - g.y) - 2 * ze * om * g.vy;
        // (a hand, not a spring: it can only speed up so fast)
        const amax = AI_ACC[0] + AI_ACC[1] * sk;
        const al = Math.hypot(ax, ay);
        if (al > amax) ((ax *= amax / al), (ay *= amax / al));
        g.vx += ax * dt;
        g.vy += ay * dt;
        const cap = AIM_MAX * aiPace(sk) * (g.stun > 0 ? 0.45 : 1);
        const sp = Math.hypot(g.vx, g.vy);
        if (sp > cap) ((g.vx *= cap / sp), (g.vy *= cap / sp));
      }
      if (g.stun > 0) {
        g.vx += Math.sin(this.clk * 37 + g.i) * 300 * dt;
        g.vy += Math.cos(this.clk * 29 + g.i) * 300 * dt;
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
    } else {
      g.bgx = tx;
      g.bgy = ty;
      g.bgr = t ? t.sr : 0;
      g.bblock = this.shieldAhead(g.x, g.y, bit, sk) || this.blocked(g.x, g.y, 3);
      g.bfire = false;
      g.bcharge = false;
    }
    // the trigger
    if (!t || g.stun > 0 || (drive && g.react > 0)) return;
    g.aimT += dt;
    const d = Math.hypot(tx - g.x, ty - g.y);
    const sp = Math.hypot(g.vx, g.vy);
    const tol = t.sr * (AI_TOL[0] + AI_TOL[1] * (1 - sk)) + 3;
    const steady = sp < AI_STEADY[0] + AI_STEADY[1] * (1 - sk);
    const impatient = g.aimT > 0.8 + sk * 0.9 && this.rnd() < dt * (1 - sk) * 3;
    if (g.trig < 0 && ((d < tol && steady) || impatient)) g.trig = drive ? 0.03 + (1 - sk) * 0.1 + this.rnd() * 0.05 : 0;
    if (g.trig < 0) return;
    g.trig -= dt;
    if (g.trig > 0 || g.cd > 0) return;
    // a shield in the way, or about to swing or slide into it? a good eye waits for it to pass
    const k = this.under(g.x, g.y, GRACE);
    if (this.shieldAhead(g.x, g.y, bit, sk) && this.rnd() < 0.25 + 0.75 * sk) {
      g.trig = -1;
      return;
    }
    // a window pillar in the way (the express): a careful hand waits for the target to come out
    if (g.care && this.blocked(g.x, g.y, 3)) {
      g.trig = -1;
      return;
    }
    let big = false;
    if (g.bcd <= 0) {
      const k2 = k >= 0 ? this.under(g.x, g.y, GRACE_B, k) : -1;
      const pierce = k2 >= 0 && this.tg[k2].kind !== SHIELD;
      big = (pierce && this.rnd() < 0.35 + 0.6 * sk) || ((t.kind === QUBIT || t.kind === BASKET) && this.rnd() < 0.3 + 0.5 * sk) || this.rnd() < 0.06 * (1 - sk);
    }
    g.trig = -1;
    if (drive) {
      // (now and then the hand twitches as it fires: even a pro misses one)
      if (this.rnd() < AI_FUMBLE[0] + AI_FUMBLE[1] * (1 - sk)) {
        const a = this.rnd() * Math.PI * 2,
          r = t.sr * (1.0 + this.rnd() * 0.6);
        g.x += Math.cos(a) * r;
        g.y += Math.sin(a) * r;
      }
      this.fire(g, big);
      g.aimT = 0;
      // (on to the next one while this one flies)
      g.think = 0;
    } else {
      g.bfire = !big;
      g.bcharge = big;
    }
  }

  private moveGuns(dt: number, input: Input, live: boolean) {
    for (const g of this.guns) {
      g.cd = Math.max(0, g.cd - dt);
      g.bcd = Math.max(0, g.bcd - dt);
      g.stun = Math.max(0, g.stun - dt);
      g.kick = Math.max(0, g.kick - dt * 6);
      g.hop = Math.max(0, g.hop - dt);
      g.angryT = Math.max(0, g.angryT - dt);
      if (live) {
        if (g.p.human) {
          if (this.botSkill > 0) this.brain(g, dt, this.botSkill, false);
          this.steer(g, dt, input);
        } else this.brain(g, dt, g.p.skill, true);
        g.x = clamp(g.x, X0, X1);
        g.y = clamp(g.y, Y0, Y1);
      }
      g.shown += (g.score - g.shown) * Math.min(1, dt * 10);
      if (Math.abs(g.score - g.shown) < 0.5) g.shown = g.score;
    }
  }

  /** The cannons point at their crosshairs; the snarks behind them lean into it. */
  private poseGuns(dt: number) {
    let n = 0;
    for (const g of this.guns) {
      const i = g.i;
      const px = SEAT_X[i],
        py = RAIL_Y + 1.05,
        pz = RAIL_Z;
      this.rayAt(g.x, g.y, LANES[1].z, this.v);
      const dx = this.v.x - px,
        dy = this.v.y - py,
        dz = this.v.z - pz;
      const l = Math.hypot(dx, dy, dz) || 1;
      const k = Math.min(1, dt * 18);
      g.dx += (dx / l - g.dx) * k;
      g.dy += (dy / l - g.dy) * k;
      g.dz += (dz / l - g.dz) * k;
      const dl = Math.hypot(g.dx, g.dy, g.dz) || 1;
      const ux = g.dx / dl,
        uy = g.dy / dl,
        uz = g.dz / dl;
      this.v2.set(ux, uy, uz);
      this.q4.setFromUnitVectors(this.up, this.v2);
      const back = g.kick * 0.22;
      // the turret
      this.e4.set(0, Math.atan2(ux, uz), 0);
      this.q4b.setFromEuler(this.e4);
      this.p4.set(px, RAIL_Y + 0.5, pz);
      this.m4.compose(this.p4, this.q4b, this.s4.set(0.86, 1.0, 0.86));
      this.cBase.setMatrixAt(i, this.m4);
      this.s4.set(0.86 + 0.1, 1.0 + 0.1, 0.86 + 0.1);
      this.m4.compose(this.p4, this.q4b, this.s4);
      this.cBaseHull.setMatrixAt(i, this.m4);
      this.cBase.setColorAt(i, this.col.set(g.stun > 0 ? "#6a6880" : g.p.color));
      // the barrel along the aim
      this.p4.set(px + ux * (0.62 - back), py + uy * (0.62 - back), pz + uz * (0.62 - back));
      this.m4.compose(this.p4, this.q4, this.s4.set(1, 1, 1));
      this.cBarrel.setMatrixAt(i, this.m4);
      this.cBarrel.setColorAt(i, this.col.set(g.stun > 0 ? "#8a8898" : "#f2eee6"));
      this.m4.compose(this.p4, this.q4, this.s4.set(1.18, 1.05, 1.18));
      this.cBarrelHull.setMatrixAt(i, this.m4);
      // its bands, the nullifier at its breech (brighter when B is charged)
      for (let b = 0; b < 2; b++) {
        const at = b ? 1.38 : 0.08;
        this.p4.set(px + ux * (at - back), py + uy * (at - back), pz + uz * (at - back));
        this.m4.compose(this.p4, this.q4, this.s4.set(1, 1, 1));
        this.cBand.setMatrixAt(n, this.m4);
        this.cBand.setColorAt(n++, this.col.set(g.p.color));
      }
      const ready = g.bcd <= 0;
      const pulse = 1 + Math.sin(this.clk * (ready ? 9 : 4) + i) * (ready ? 0.12 : 0.05);
      this.p4.set(px - ux * (0.4 + back * 0.5), py - uy * (0.4 + back * 0.5) + 0.06, pz - uz * (0.4 + back * 0.5));
      this.m4.compose(this.p4, this.q4b.identity(), this.s4.setScalar(0.42 * pulse * (ready ? 1.1 : 1)));
      this.cBall.setMatrixAt(i, this.m4);
      this.cBall.setColorAt(i, this.col.set(g.p.color).lerp(this.white, ready ? 0.35 + Math.sin(this.clk * 9) * 0.15 : 0));
      // the muzzle (where the nullifiers leave)
      g.mx = px + ux * 1.6;
      g.my = py + uy * 1.6;
      g.mz = pz + uz * 1.6;
      // the snark: faces its aim, hops for a combo, is cross when stunned
      const a = g.a;
      if (!this.final) {
        let d = Math.atan2(ux, uz) - Math.PI;
        d = ((((d + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
        a.face(Math.PI + d * 0.6, dt, 8);
      }
      a.angry = g.angryT > 0 || (this.over !== null && this.over[3] === i);
      if (g.hop > 0.55 && a.grounded) a.jump(5.5);
      a.physics(dt, 0);
      a.sync(dt);
    }
    for (const m of [this.cBase, this.cBaseHull, this.cBarrel, this.cBarrelHull, this.cBand, this.cBall]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
  private q4b = new THREE.Quaternion();
  private white = new THREE.Color("#ffffff");
  private night = new THREE.Color("#1a1530");

  // ---- the frame ---------------------------------------------------------------------------------

  idle(dt: number, phase: "card" | "count", k: number) {
    this.phase = phase;
    this.clk += dt;
    if (phase === "card") {
      if (this.L.kind === "train") {
        // (inside the car, under its roof: a slow walk along the windows, the world rushing past)
        this.cam.eye.set(-6 + Math.min(k, 12) * 0.55, 6.4, 15.5);
        this.cam.at.set(-1.5 + Math.min(k, 12) * 0.25, 3.6, -6);
      } else this.cam.orbit(this.v.set(0, 4.6, -4), -0.42 + Math.min(k, 12) * 0.035, 24, 8.5);
    } else this.cam.to(EYE, AT, dt, 3.2);
    this.cam.apply(dt);
    this.moveTargets(dt, false);
    this.light(dt);
    this.project(dt);
    this.moveGuns(dt, NO_INPUT, false);
    this.poseGuns(dt);
    this.fx.update(dt);
    this.render(dt);
  }

  update(dt: number, input: Input) {
    for (let k = 0; k < TURBO; k++) this.step(dt, input);
  }

  private step(dt: number, input: Input) {
    if (this.phase === "card" || this.phase === "count") {
      this.phase = "play";
      this.startWave(0);
      SND.wave();
    }
    this.clk += dt;
    if (this.phase === "play") {
      this.t += dt;
      this.director(dt);
      if (this.t >= PLAY) this.timeUp();
    } else {
      this.tallyT += dt;
      if (!this.final && this.tallyT >= 0.3) this.rank();
      if (this.final && this.tallyT >= 2.2 && this.tallyT - dt < 2.2) this.cheer();
      if (!this.over && this.tallyT >= TALLY) this.over = this.final;
      if (this.over) this.post += dt;
    }
    this.say.t += dt;
    for (const p of this.pops) if (p.on) p.t += dt;
    this.moveTargets(dt, true);
    this.light(dt);
    this.project(dt);
    this.moveGuns(dt, input, this.phase === "play");
    this.moveShots(dt);
    this.poseGuns(dt);
    if (this.final) this.celebrate(dt);
    this.fx.update(dt);
    this.cam.to(EYE, AT, dt, 3.2);
    this.cam.apply(dt);
    this.render(dt);
  }

  private timeUp() {
    this.phase = "tally";
    this.tallyT = 0;
    this.warn.on = false;
    music.rate(1);
    // the gallery closes: every lane target sinks, the swingers are pulled up
    for (const t of this.tg) {
      if (!t.on) continue;
      if (t.mode === LANE) t.hold = 0;
      else if (t.mode === SWING) t.away = true;
    }
    this.announce(T("TIME!", "时间到！"), "#ffffff", 1.2, "", 64);
    for (let i = 0; i < 5; i++) this.fx.burst(this.v.set((i - 2) * 4.5, 9, 2), 22, ["#ff6b35", "#ffd23f", "#ffffff", "#c4b1fc", "#a8d8e8", "#6dbf8a"], { speed: 5, up: 4, size: 0.16, life: 1.6, gravity: 7 });
  }

  private rank() {
    const sc = this.guns.map((g) => g.score);
    const tie = this.guns.map((g) => g.hits * 100 + g.best);
    this.final = rankBy(sc, tie);
  }

  private cheer() {
    const f = this.final!;
    const w = this.guns[f[0]];
    w.a.cheer(3.2);
    w.a.jump(8.5);
    this.fx.burst(this.v.set(w.a.pos.x, 2.6, w.a.pos.z), 50, [...this.players.map((p) => p.color), "#ffffff", "#c4b1fc"], { speed: 7, up: 8, size: 0.16, life: 1.6, gravity: 12 });
    if (w.p.human) SND.prize(1);
    else beep(523, 0.2, "triangle", 0.2);
  }

  /** After the tally: the winner turns to the camera and keeps cheering at the rail. */
  private celebrate(dt: number) {
    if (this.tallyT < 2.2 || !this.final) return;
    const w = this.guns[this.final[0]];
    w.a.face(0, dt, 6);
    if (w.a.grounded && Math.floor(this.tallyT * 1.6) !== Math.floor((this.tallyT - dt) * 1.6)) w.a.jump(6.5);
  }

  // ---- the instances -----------------------------------------------------------------------------

  private nPart = 0;
  private nGlow = 0;
  private counts = [0, 0, 0, 0, 0, 0];
  /** A coloured box of the targets' fittings (a stick, a rope, a packet). */
  private setPart(x: number, y: number, z: number, sx: number, sy: number, sz: number, rz: number, c: string, k = 1) {
    if (this.nPart >= 200) return;
    this.e4.set(0, 0, rz);
    this.m4.compose(this.p4.set(x, y, z), this.q4.setFromEuler(this.e4), this.s4.set(sx, sy, sz));
    this.parts.setMatrixAt(this.nPart, this.m4);
    this.parts.setColorAt(this.nPart++, this.col.set(c).multiplyScalar(k));
  }
  /** A soft glow facing the camera (`k` its strength: additive, so dimmer is fainter). */
  private setGlow(x: number, y: number, z: number, s: number, c: THREE.Color | string, k = 1) {
    if (this.nGlow >= 700) return;
    this.m4.compose(this.p4.set(x, y, z), this.w.camera.quaternion, this.s4.set(s, s, s));
    this.glows.setMatrixAt(this.nGlow, this.m4);
    (typeof c === "string" ? this.col.set(c) : this.col.copy(c)).multiplyScalar(Math.max(0, k));
    this.glows.setColorAt(this.nGlow++, this.col);
  }

  private render(dt: number) {
    const now = this.clk;
    const counts = this.counts;
    counts.fill(0);
    this.nPart = 0;
    this.nGlow = 0;
    let nSh = 0,
      nQ = 0,
      nRing = 0;
    const dark = this.L.kind === "dark";
    for (const t of this.tg) {
      if (!t.on) continue;
      // (in the graveyard: as bright as its light, a dark shape in a faint aura when unlit)
      const lit = dark ? t.lit : 1;
      const lk = 0.14 + 0.86 * lit;
      const wy = Math.sin(t.age * 31) * t.wob * 0.5;
      const flip = t.mode === LANE ? -(1 - clamp(t.up, 0, 1)) * 1.3 : 0;
      if (t.kind === QUBIT) {
        // the probe: a glowing ball in a turning ring, a halo, a streak behind it
        this.m4.compose(this.p4.set(t.x, t.y, t.z), this.q4.identity(), this.s4.setScalar(0.8));
        this.qBall.setMatrixAt(nQ++, this.m4);
        this.e4.set(1.1 + Math.sin(t.age * 3) * 0.3, t.spin, 0.4);
        this.m4.compose(this.p4, this.q4.setFromEuler(this.e4), this.s4.setScalar(1));
        this.qRing.setMatrixAt(nRing++, this.m4);
        this.e4.set(-0.4, t.spin * 1.3, 1.2);
        this.m4.compose(this.p4, this.q4.setFromEuler(this.e4), this.s4.setScalar(0.85));
        this.qRing.setMatrixAt(nRing++, this.m4);
        this.setGlow(t.x, t.y, t.z, 3.4 + Math.sin(now * 12) * 0.3, "#9d7bff", 0.9);
        for (let i = 1; i <= 6; i++) this.setGlow(t.x - t.vx * i * 0.035, WIRE_Y - 0.55 + Math.sin((t.age - i * 0.035) * 6) * 0.45, t.z, 1.6 - i * 0.18, "#c4b1fc", 0.8 - i * 0.11);
        continue;
      }
      const k = t.kind;
      this.e4.set(flip, t.spin + wy, t.rot + Math.sin(t.age * 23) * t.wob * 0.15);
      this.q4.setFromEuler(this.e4);
      this.p4.set(t.x, t.y, t.z);
      const n = counts[k]++;
      this.m4.compose(this.p4, this.q4, this.s4.set(TS, TS, TS));
      this.bodies[k].setMatrixAt(n, this.m4);
      if (dark) {
        this.bodies[k].setColorAt(n, this.col.copy(this.night).lerp(this.white, lit));
        if (lit < 0.98) this.setGlow(t.x, t.y, t.z - 0.45, 2.5, "#7a66d0", 0.34 * (1 - lit));
      }
      this.m4.compose(this.p4, this.q4, this.s4.copy(HULL[k]).multiplyScalar(TS));
      this.hulls[k].setMatrixAt(n, this.m4);
      // the shackle (a padlock's, thrown open on the cracked one) or the basket's handle
      if (k <= ED || k === BASKET) {
        const open = k === ED;
        const top = (k === BASKET ? 0.55 : LOCK[1] / 2) * TS;
        this.v2.set(open ? -0.17 : 0, top + (open ? 0.14 : -0.02), 0).applyQuaternion(this.q4).add(this.p4);
        this.e4.set(flip, t.spin + wy, t.rot + (open ? 0.5 : 0));
        this.m4.compose(this.v2, this.q4b.setFromEuler(this.e4), this.s4.setScalar((k === BASKET ? 1.45 : 1) * TS));
        if (nSh < 80) {
          this.shackles.setMatrixAt(nSh, this.m4);
          this.shackles.setColorAt(nSh++, this.col.set(k === BASKET ? "#b08850" : k === ED ? "#9a8a80" : "#c9c6d6").multiplyScalar(lk));
        }
      }
      if (k === BASKET) {
        // the dust inside: glowing data packets
        for (let i = 0; i < 3; i++) this.setPart(t.x + (i - 1) * 0.5, t.y + 0.74 + (i % 2) * 0.12, t.z, 0.4, 0.4, 0.4, t.rot + i * 0.4, PACKETS[i], lk);
      }
      if (k === SHIELD) this.setGlow(t.x, t.y, t.z - 0.3, 3.0 + Math.sin(now * 5 + t.id) * 0.25, t.wob > 0.05 ? "#ff4d6d" : "#5fd4ff", (0.75 + t.wob * 0.4) * (dark ? Math.max(lit, t.wob) : 1));
      // what holds it: a stick down behind its board, or a rope from the beam
      if (t.mode === LANE) this.setPart(t.x, t.y - 1.5, t.z - 0.12, 0.16, 2.2, 0.16, 0, "#8a5a33", lk);
      else if (t.mode === SWING) {
        // the rope, from the beam down to the body's top (along the swing)
        const len = Math.hypot(t.x - SW_X[t.slot], SW_Y - t.y) - 0.64 * TS;
        const sa = Math.sin(t.rot),
          ca = Math.cos(t.rot);
        this.setPart(SW_X[t.slot] + (sa * len) / 2, SW_Y - (ca * len) / 2, t.z, 0.07, len, 0.07, t.rot, "#f2eee6", dark ? 0.35 + 0.65 * lit : 1);
      }
    }
    for (let k = 0; k <= BASKET; k++) {
      const b = this.bodies[k],
        h = this.hulls[k];
      b.count = h.count = counts[k];
      b.visible = h.visible = counts[k] > 0;
      b.instanceMatrix.needsUpdate = h.instanceMatrix.needsUpdate = true;
      if (dark && b.instanceColor) b.instanceColor.needsUpdate = true;
    }
    // the shots: a white core, a halo and a trail in the shooter's colour
    let nCore = 0;
    for (let k = 0; k < this.shots.length; k++) {
      const s = this.shots[k];
      if (!s.on) continue;
      const c = this.players[s.seat].color;
      const r = s.big ? 0.42 : 0.26;
      this.m4.compose(this.p4.set(s.x, s.y, s.z), this.q4.identity(), this.s4.setScalar(r));
      this.cores.setMatrixAt(nCore, this.m4);
      this.cores.setColorAt(nCore++, this.col.set(c).lerp(this.white, 0.6));
      this.setGlow(s.x, s.y, s.z, s.big ? 2.6 : 1.5, c, 1);
      const tr = this.trails[k];
      for (let i = 1; i < tr.length; i++) this.setGlow(tr[i].x, tr[i].y, tr[i].z, (s.big ? 1.9 : 1.1) * (1 - i * 0.15), c, 0.75 - i * 0.13);
    }
    // the flashes
    for (const f of this.flashes) {
      if (!f.on) continue;
      f.t += dt;
      if (f.t >= f.dur) {
        f.on = false;
        continue;
      }
      const u = f.t / f.dur;
      this.setGlow(f.x, f.y, f.z, f.s * (0.5 + easeOut(u) * 0.8), f.c, (1 - u) * 1.2);
    }
    // the cannons' nullifiers glow, and the bulbs chase (the yard), shine (the car's ceiling) or flicker (the lanterns)
    for (const g of this.guns) this.setGlow(g.mx - g.dx * 2.0, g.my - g.dy * 2.0 + 0.06, g.mz - g.dz * 2.0, g.bcd <= 0 ? 1.3 : 0.9, g.p.color, g.bcd <= 0 ? 0.7 : 0.3);
    const step = Math.floor(now * 7);
    for (let i = 0; i < this.bulbAt.length; i++) {
      const p = this.bulbAt[i];
      if (this.L.kind === "train") {
        this.bulbs.setColorAt(i, this.col.set("#fffaf0"));
        continue;
      }
      if (dark) {
        const f = 0.75 + 0.25 * Math.sin(now * 13 + i * 2.1) * Math.sin(now * 7.3 + i);
        this.bulbs.setColorAt(i, this.col.set("#ffc27a").multiplyScalar(f));
        this.setGlow(p.x, p.y, p.z + 0.05, 1.5, "#ffb060", 0.42 * f);
        continue;
      }
      const on = (i + step) % 3 !== 0;
      const c = on ? ((i >> 1) % 3 === 0 ? "#ffd9a8" : (i >> 1) % 3 === 1 ? "#ffffff" : "#c4b1fc") : "#7a5a4a";
      this.bulbs.setColorAt(i, this.col.set(c));
      if (on) this.setGlow(p.x, p.y, p.z + 0.05, 0.9, c, 0.45);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    if (dark) this.night_(now);
    this.liven(dt, now);
    fin(this.shackles, nSh);
    fin(this.parts, this.nPart);
    fin(this.qBall, nQ);
    fin(this.qRing, nRing);
    fin(this.cores, nCore);
    fin(this.glows, this.nGlow);
    // the conveyors run, the Q-Blocks turn, the searchlights sweep
    for (let l = 0; l < 3; l++) if (this.wave >= 1 && this.phase === "play") this.chevrons[l].offset.x -= this.laneV(l) * dt * this.chevK[l];
    for (const q of this.qBlocks) q.rotation.y += dt * 1.2;
    if (this.L.kind === "train") this.ride(dt, now);
    this.searchlights.forEach((p, i) => {
      p.rotation.z = Math.sin(now * 0.5 + i * 2) * 0.6;
      p.rotation.x = -0.25 + Math.cos(now * 0.37 + i) * 0.15;
    });
  }

  // ---- the life around the booth (every level) ---------------------------------------------------

  /** Drifting clouds, one draw: three puffs a cloud (x, y, z, size); they drift along x at `v` and wrap over `span`. */
  private cloudBank(n: number, colors: string[], y0: number, y1: number, z0: number, z1: number, size: number, span: number, v: number) {
    const m = new THREE.InstancedMesh(GEO.box, this.L.kind === "dark" ? new THREE.MeshBasicMaterial({ color: "#ffffff", fog: false }) : glow("#ffffff"), n * 3);
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const p = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      p[i * 4] = -span / 2 + (i + this.rnd() * 0.6) * (span / n);
      p[i * 4 + 1] = y0 + this.rnd() * (y1 - y0);
      p[i * 4 + 2] = z0 + this.rnd() * (z1 - z0);
      p[i * 4 + 3] = size * (0.7 + this.rnd() * 0.6);
      for (let k = 0; k < 3; k++) m.setColorAt(i * 3 + k, this.col.set(colors[(i + k) % colors.length]));
    }
    this.w.scene.add(m);
    this.cloudsM = { m, p, v, span };
  }

  /** A flock (birds, crows, bats): a body and two flapping wings each, one draw. */
  private flockOf(n: number, color: string, kind: number) {
    const m = new THREE.InstancedMesh(GEO.box, toon(color), n * 3);
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const off = new Float32Array(n * 3);
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      off[i * 3] = (this.rnd() - 0.5) * 7;
      off[i * 3 + 1] = (this.rnd() - 0.5) * 2.2;
      off[i * 3 + 2] = (this.rnd() - 0.5) * 4;
      ph[i] = this.rnd() * Math.PI * 2;
    }
    this.w.scene.add(m);
    this.flockM = { m, n, off, ph, kind };
  }

  /** Each level's life: clouds, a flock, glowing motes, wind streaks, fog banks, a rim light. */
  private ambience() {
    const s = this.w.scene;
    const k = this.L.kind;
    if (k === "yard") {
      // a sunset: the low sun behind the prison, pink clouds, crows round the keep, sky lanterns rising from the yard
      const sun = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: "#ffd29a", fog: false }));
      sun.scale.setScalar(30);
      sun.position.set(38, 22, -200);
      s.add(sun);
      const halo = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: glowTex(), color: "#ff9a5a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      halo.scale.setScalar(150);
      halo.position.set(38, 22, -201);
      s.add(halo);
      this.cloudBank(12, ["#ffc6a6", "#ffb08e", "#f7a2bf", "#ffd9c0"], 26, 44, -150, -90, 9, 360, 1.4);
      this.flockOf(7, "#1e1838", 1);
      for (let i = 0; i < 12; i++) this.motes.push({ x: (this.rnd() - 0.5) * 50, y: 4 + this.rnd() * 12, z: -18 - this.rnd() * 14, ph: this.rnd() * 9, c: this.rnd() < 0.5 ? "#ffb35a" : "#ff8a4c" });
      const rim = new THREE.DirectionalLight("#ff9a6a", 1.1);
      rim.position.set(30, 18, -40);
      s.add(rim, rim.target);
    } else if (k === "train") {
      // a bright afternoon: clouds, a flock of gulls keeping pace, the wind streaking past, the ZStreet blimp far off
      this.cloudBank(14, ["#ffffff", "#f4f9ff", "#e9f3ff"], 30, 52, -170, -90, 10, 380, 3.2);
      this.flockOf(8, "#ffffff", 0);
      const sm = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }), 26);
      sm.frustumCulled = false;
      sm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const p = new Float32Array(26 * 4);
      for (let i = 0; i < 26; i++) {
        p[i * 4] = (this.rnd() - 0.5) * 90;
        p[i * 4 + 1] = i < 18 ? 7.2 + this.rnd() * 3.6 : 0.15 + this.rnd() * 0.5;
        p[i * 4 + 2] = i < 18 ? -12 - this.rnd() * 14 : 0.3 + this.rnd() * 0.9;
        p[i * 4 + 3] = 2.5 + this.rnd() * 4;
      }
      s.add(sm);
      this.streaks = { m: sm, p };
      const blimp = new THREE.Group();
      const env = new THREE.Mesh(GEO.ball, toon("#fff6ea", "#2a2040"));
      env.scale.set(22, 7, 7);
      blimp.add(env);
      outline(env, 0.03);
      const band = new THREE.Mesh(GEO.ball, toon("#ff6b35"));
      band.scale.set(22.3, 1.6, 7.3);
      blimp.add(band);
      block("#3a2c7a", 5, 1.6, 2, 0, -4, 0, blimp);
      for (const fy of [-1, 1]) block("#ff6b35", 3, 0.3, 3.2, -10.5, fy * 1.8, 0, blimp);
      const nm = label("ZSTREET", 2.4, "#ff6b35");
      nm.position.set(0, 0.6, 3.62);
      blimp.add(nm);
      blimp.position.set(-30, 30, -110);
      s.add(blimp);
      this.blimp = blimp;
    } else {
      // a moonlit night: the moon low in the left sky, ragged clouds across it, bats, fireflies, fog banks
      this.cloudBank(10, ["#2c2452", "#352c63", "#241e44"], 18, 34, -160, -120, 12, 300, 2.2);
      this.flockOf(9, "#0d0a18", 2);
      for (let i = 0; i < 22; i++) this.motes.push({ x: (this.rnd() - 0.5) * 28, y: 1.2 + this.rnd() * 7, z: -1 - this.rnd() * 11, ph: this.rnd() * 9, c: this.rnd() < 0.7 ? "#d9ff8a" : "#a8ffd8" });
      const fogTex = canvasTex(
        256,
        64,
        (g) => {
          for (let i = 0; i < 14; i++) {
            const x = (i * 53) % 256,
              y = 30 + (i % 3) * 7,
              r = 26 + (i % 4) * 9;
            const gr = g.createRadialGradient(x, y, 0, x, y, r);
            gr.addColorStop(0, "rgba(190,180,240,0.5)");
            gr.addColorStop(1, "rgba(190,180,240,0)");
            g.fillStyle = gr;
            g.fillRect(x - r, y - r, r * 2, r * 2);
            if (x + r > 256) g.fillRect(x - r - 256, y - r, r * 2, r * 2);
          }
        },
        true,
      );
      for (const [z, y, h, o, rep] of [
        [-17, 4.6, 5, 0.4, 3],
        [-33, 5.5, 8, 0.45, 2],
      ]) {
        const t = fogTex.clone();
        t.repeat.set(rep, 1);
        t.needsUpdate = true;
        this.fogs.push(t);
        const f = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: o, depthWrite: false }));
        f.scale.set(110, h, 1);
        f.position.set(0, y, z);
        s.add(f);
      }
      fogTex.dispose();
    }
  }

  /** The life moves: clouds drift, the flock flaps, motes float, the wind streaks, the windows flicker. */
  private liven(dt: number, now: number) {
    const c = this.cloudsM;
    if (c) {
      const half = c.span / 2;
      for (let i = 0; i < c.p.length / 4; i++) {
        let x = c.p[i * 4] + c.v * dt;
        if (x > half) x -= c.span;
        c.p[i * 4] = x;
        const y = c.p[i * 4 + 1],
          z = c.p[i * 4 + 2],
          s = c.p[i * 4 + 3];
        for (let k = 0; k < 3; k++) {
          const w = s * (k === 1 ? 1.35 : 0.95);
          this.m4.compose(this.p4.set(x + (k - 1) * s * 0.85, y + (k === 1 ? s * 0.22 : 0), z + k * 0.7), this.q4.identity(), this.s4.set(w, w * 0.45, w * 0.7));
          c.m.setMatrixAt(i * 3 + k, this.m4);
        }
      }
      c.m.instanceMatrix.needsUpdate = true;
    }
    const f = this.flockM;
    if (f) {
      // (0 gulls keeping pace with the train, 1 crows circling the keep, 2 bats crossing the sky in bursts)
      let cx = 0,
        cy = 0,
        cz = 0,
        dir = 1,
        flap = 7,
        sc = 0.5;
      if (f.kind === 0) ((cx = Math.sin(now * 0.11) * 18), (cy = 9.2 + Math.sin(now * 0.4) * 0.8), (cz = -27), (dir = Math.cos(now * 0.11) >= 0 ? 1 : -1), (flap = 5), (sc = 0.6));
      else if (f.kind === 1) ((cx = 0), (cy = 11.8 + Math.sin(now * 0.5) * 0.8), (cz = -33), (flap = 6), (sc = 0.75));
      else {
        const T = 9;
        const u = (now % T) / T;
        cx = -34 + u * 68;
        cy = 11.5 + Math.sin(u * 7) * 1.5;
        cz = -26;
        flap = 16;
        sc = 0.55;
      }
      for (let i = 0; i < f.n; i++) {
        let x = cx + f.off[i * 3],
          y = cy + f.off[i * 3 + 1] + Math.sin(now * 1.3 + f.ph[i]) * 0.4,
          z = cz + f.off[i * 3 + 2],
          yaw = dir > 0 ? 0 : Math.PI;
        if (f.kind === 1) {
          const a = now * 0.35 + f.ph[i];
          x = Math.cos(a) * (9 + f.off[i * 3] * 0.6);
          z = cz + Math.sin(a) * 5;
          yaw = -a;
        }
        const fl = Math.sin(now * flap + f.ph[i]) * 0.7;
        this.e4.set(0, yaw, 0);
        this.q4.setFromEuler(this.e4);
        this.m4.compose(this.p4.set(x, y, z), this.q4, this.s4.set(0.9 * sc, 0.32 * sc, 0.32 * sc));
        f.m.setMatrixAt(i * 3, this.m4);
        for (let w = 0; w < 2; w++) {
          const sg = w ? 1 : -1;
          this.e4.set(sg * fl, yaw, 0, "YXZ");
          this.q4b.setFromEuler(this.e4);
          this.v.set(0, 0, sg * 0.55 * sc).applyQuaternion(this.q4b);
          this.m4.compose(this.p4.set(x + this.v.x, y + this.v.y, z + this.v.z), this.q4b, this.s4.set(0.5 * sc, 0.06 * sc, 1.0 * sc));
          f.m.setMatrixAt(i * 3 + 1 + w, this.m4);
        }
      }
      this.e4.set(0, 0, 0, "XYZ");
      f.m.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      if (this.L.kind === "yard") {
        // (sky lanterns rising over the yard, then again from below)
        m.y += dt * 0.55;
        if (m.y > 17) ((m.y = 3), (m.x = (this.rnd() - 0.5) * 50));
        this.setGlow(m.x + Math.sin(now * 0.6 + m.ph) * 0.6, m.y, m.z, 1.5, m.c, 0.5 + 0.15 * Math.sin(now * 5 + m.ph));
        this.setGlow(m.x + Math.sin(now * 0.6 + m.ph) * 0.6, m.y, m.z + 0.05, 0.45, "#fff3c4", 0.9);
      } else {
        // (fireflies, blinking as they wander)
        const b = Math.max(0, Math.sin(now * 2.2 + m.ph));
        this.setGlow(m.x + Math.sin(now * 0.37 + m.ph) * 1.4, m.y + Math.sin(now * 0.53 + m.ph * 2) * 0.6, m.z, 0.55, m.c, b * 0.85);
      }
    }
    const st = this.streaks;
    if (st) {
      for (let i = 0; i < st.p.length / 4; i++) {
        let x = st.p[i * 4] - RUSH_V * 2.4 * dt;
        if (x < -45) x += 90;
        st.p[i * 4] = x;
        this.m4.compose(this.p4.set(x, st.p[i * 4 + 1], st.p[i * 4 + 2]), this.q4.identity(), this.s4.set(st.p[i * 4 + 3], 0.035, 0.035));
        st.m.setMatrixAt(i, this.m4);
      }
      st.m.instanceMatrix.needsUpdate = true;
    }
    if (this.blimp) {
      this.blimp.position.x = -40 + ((now * 1.6) % 90);
      this.blimp.position.y = 30 + Math.sin(now * 0.3) * 0.8;
    }
    const bu = this.bunting;
    if (bu) {
      // (each flag hangs from the string by its top edge and stirs in the evening's air)
      for (let i = 0; i < bu.p.length / 4; i++) {
        const a = Math.sin(now * 2.3 + i * 1.7) * 0.28 + Math.sin(now * 5.1 + i) * 0.08;
        this.e4.set(a, bu.p[i * 4 + 3], 0, "YXZ");
        this.q4.setFromEuler(this.e4);
        this.v.set(0, -0.36, 0).applyQuaternion(this.q4);
        this.m4.compose(this.p4.set(bu.p[i * 4] + this.v.x, bu.p[i * 4 + 1] + this.v.y, bu.p[i * 4 + 2] + this.v.z), this.q4, this.s4.set(0.5, 0.62, 0.05));
        bu.m.setMatrixAt(i, this.m4);
      }
      this.e4.set(0, 0, 0, "XYZ");
      bu.m.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < this.fogs.length; i++) this.fogs[i].offset.x += dt * (0.012 + i * 0.006);
    // the prison's windows: now and then one goes dark or lights up (the transparent addresses pacing their cells)
    const wn = this.winM;
    if (wn && Math.floor(now * 3) !== Math.floor((now - dt) * 3)) {
      const i = Math.floor(Math.random() * wn.count);
      wn.setColorAt(i, this.col.set(Math.random() < 0.7 ? (Math.random() < 0.5 ? "#ffb070" : "#ffd08a") : "#4a3a7a"));
      if (wn.instanceColor) wn.instanceColor.needsUpdate = true;
    }
  }

  /** The graveyard's lights: the flares (glows, the two newest light the stones), the watchman's beam, the candles. */
  private night_(now: number) {
    let a: Flare | null = null,
      b: Flare | null = null;
    for (let i = 0; i < this.flares.length; i++) {
      const f = this.flares[i];
      if (!f.on) continue;
      const k = this.flareK(f);
      const fl = 1 + Math.sin(now * 23 + i * 1.7) * 0.08 + Math.sin(now * 37 + i) * 0.05;
      this.setGlow(f.x, f.y, f.z, f.r * 1.15 * fl, f.c, 0.75 * k);
      this.setGlow(f.x, f.y, f.z + 0.05, 0.9 * fl, this.white, 0.9 * k);
      if (!a || f.t < a.t) ((b = a), (a = f));
      else if (!b || f.t < b.t) b = f;
    }
    [a, b].forEach((f, i) => {
      const pl = this.flareLights[i];
      if (!pl) return;
      pl.intensity = f ? 30 * this.flareK(f) : 0;
      if (f) (pl.position.set(f.x, f.y + 0.6, f.z + 1.2), pl.color.copy(f.c));
    });
    // the watchman's lantern: its beam on the lanes, its light where it falls
    if (this.beam) {
      const bx = this.beamX;
      this.v.set(bx, 3.0, -4.6).sub(this.beam.position);
      const len = this.v.length();
      this.beam.quaternion.setFromUnitVectors(this.v2.set(0, -1, 0), this.v.normalize());
      this.beam.children[0].scale.set(1, len, 1);
      if (this.beamLight) {
        this.beamLight.position.set(bx, 6.2, -3.2);
        this.beamLight.intensity = 26;
      }
      for (let l = 0; l < 3; l++) this.setGlow(bx, LANES[l].y - 0.3, LANES[l].z - 0.4, 4.2, "#ffe0a8", 0.16);
    }
    for (const sx of [-1, 1]) {
      const f = 0.8 + 0.2 * Math.sin(now * 9 + sx * 2) * Math.sin(now * 4.4 + sx);
      this.setGlow(sx * 3.4, 5.4, -38.3, 4.2 * f, "#ff9a40", 0.7);
      this.setGlow(sx * 3.4, 5.2, -38.2, 1.2, "#fff0c0", 0.9);
    }
    for (let i = 0; i < this.candles.length; i++) {
      const c = this.candles[i];
      const f = 0.7 + 0.3 * Math.sin(now * 11 + i * 3.3) * Math.sin(now * 5.1 + i);
      this.setGlow(c.x, c.y, c.z, 0.75, "#ffb060", 0.6 * f);
      this.setGlow(c.x, c.y - 0.05, c.z, 0.22, "#fff3c4", 0.9);
    }
  }

  /** The express rolls on: the world past it, the straps swaying. */
  private ride(dt: number, now: number) {
    this.moveRush(dt);
    const [strap, ring] = this.straps;
    if (!strap) return;
    for (let i = 0; i < 10; i++) {
      const x = -9 + i * 2;
      const a = Math.sin(now * 1.7 + i * 0.5) * 0.1 + Math.sin(now * 4.3 + i) * 0.03;
      this.e4.set(0, 0, a);
      this.q4.setFromEuler(this.e4);
      this.v.set(0, -0.42, 0).applyQuaternion(this.q4);
      this.m4.compose(this.p4.set(x + this.v.x, PIL_TOP - 0.12 + this.v.y, 6.8), this.q4, this.s4.set(0.07, 0.84, 0.05));
      strap.setMatrixAt(i, this.m4);
      this.v.set(0, -0.98, 0).applyQuaternion(this.q4);
      this.m4.compose(this.p4.set(x + this.v.x, PIL_TOP - 0.12 + this.v.y, 6.8), this.q4, this.s4.set(1, 1, 1));
      ring.setMatrixAt(i, this.m4);
    }
    strap.instanceMatrix.needsUpdate = ring.instanceMatrix.needsUpdate = true;
  }

  view() {
    return this.w;
  }

  /** The intro's own shots: a pass along the rail, the lanes beyond the cannons (the title lands on it), then the whole booth in its place from high in front (aboard the express: from the back of the car, along its windows). */
  intro(): IntroShot[] {
    if (this.L.kind === "train")
      return [
        { eye: [9.5, 3.4, 8], eye2: [5, 4.6, 9.5], at: [-7, 4.6, -4], at2: [-2, 4.4, -5], fov: 48, fov2: 44 },
        { eye: [-10.5, 7.2, 17.5], eye2: [1.5, 6.6, 16], at: [-3, 4.2, -6], at2: [1, 4, -6], fov: 50, fov2: 46, w: 1.2 },
      ];
    return [
      { eye: [-10.5, 4.6, 8.6], eye2: [8, 5.2, 9.6], at: [-4, 4.2, -5], at2: [3, 4.4, -5], fov: 47, fov2: 44 },
      { eye: [-19, 13, 33], eye2: [-8, 9.5, 26], at: [0, 6, -10], at2: [0, 5, -6], fov: 50, fov2: 46, w: 1.2 },
    ];
  }

  // ---- the HUD -----------------------------------------------------------------------------------

  draw(g: CanvasRenderingContext2D) {
    const play = this.phase === "play" || this.phase === "count";
    const tally = this.phase === "tally";
    // the snarks' name tags
    for (const gun of this.guns) {
      const s = toScreen(gun.a.head(this.v), this.w.camera);
      if (s.on) tag(g, gun.p, s.x, s.y + 10);
    }
    // the probe's warning at the edge it comes from
    if (this.warn.on) {
      const k = clamp((this.t - (this.warn.at - 0.9)) / 0.9, 0, 1);
      this.proj(this.warn.side * this.wireHw, WIRE_Y - 0.55, WIRE_Z);
      const x = this.warn.side > 0 ? W - 40 : 40,
        y = this.psy;
      const blink = Math.sin(this.clk * 22) > -0.2;
      g.save();
      g.globalAlpha = blink ? 1 : 0.4;
      g.translate(x, y);
      g.scale(this.warn.side, 1);
      g.beginPath();
      g.moveTo(14, -16);
      g.lineTo(-14, 0);
      g.lineTo(14, 16);
      g.closePath();
      g.lineWidth = 6;
      g.strokeStyle = INK;
      g.lineJoin = "round";
      g.stroke();
      g.fillStyle = "#c4b1fc";
      g.fill();
      g.restore();
      toy(g, T("PROBE!", "探针！"), x - this.warn.side * 64, y, 18 + k * 4, "#c4b1fc");
    }
    // the first seconds teach: shields are marked as ones to leave, the basket as a two-hitter; a
    // new basket calls out for a moment
    if (this.phase === "play") {
      const teach = clamp((7 - this.t) / 1.2, 0, 1);
      for (const t of this.tg) {
        if (!t.on || !t.live || (t.kind !== SHIELD && t.kind !== BASKET)) continue;
        // (in the dark only what is lit is told)
        if (t.lit < LIT_K) continue;
        const shout = t.kind === BASKET && t.id === this.fresh && t.age < 2.2;
        const a = shout ? clamp((2.2 - t.age) / 0.4, 0, 1) : teach;
        if (a <= 0) continue;
        const s = t.kind === SHIELD ? T("✕ LEAVE IT", "✕ 别打") : shout ? T("DUST ATTACK! ×2 HITS", "粉尘攻击！打 2 次") : T("2 HITS", "要打 2 次");
        g.save();
        g.globalAlpha = a;
        g.font = `900 11px ${FONT}`;
        const w = g.measureText(s).width + 12;
        // (the pill is as tall as its letters: they are grown on a small screen)
        const ph = fpx(11) + 7;
        const y = t.sy - t.sr - 5 - ph / 2;
        rr(g, t.sx - w / 2, y - ph / 2, w, ph, ph / 2);
        g.fillStyle = INK;
        g.fill();
        rr(g, t.sx - w / 2 + 1.5, y - ph / 2 + 1.5, w - 3, ph - 3, (ph - 3) / 2);
        g.fillStyle = t.kind === SHIELD ? "#ff4d6d" : "#ff8a3c";
        g.fill();
        text(g, s, t.sx, y + 0.5, 11, "#ffffff", "center", 900);
        g.restore();
      }
    }
    // the score pops
    for (const p of this.pops) {
      if (!p.on) continue;
      if (p.t > 1.0) {
        p.on = false;
        continue;
      }
      const u = p.t / 1.0;
      g.save();
      g.globalAlpha = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
      const sc = u < 0.12 ? backOut(u / 0.12) : 1;
      g.translate(p.x, p.y - easeOut(u) * 34);
      g.scale(sc, sc);
      toy(g, p.s, 0, 0, p.size, p.c);
      g.restore();
    }
    // the crosshairs (yours on top)
    if (play || (tally && this.tallyT < 0.5)) {
      const fade = this.phase === "count" ? 0.65 : tally ? 1 - this.tallyT / 0.5 : 1;
      for (const gun of this.guns) if (!gun.p.human) this.reticle(g, gun, fade);
      for (const gun of this.guns) if (gun.p.human) this.reticle(g, gun, fade);
    }
    // the corners: score, combo
    const top = Math.max(...this.guns.map((q) => q.score));
    const lead: number[] = [];
    if (top > 0) this.guns.forEach((q, i) => q.score === top && lead.push(i));
    corners(
      g,
      this.players,
      this.guns.map((q) => String(Math.round(q.shown))),
      {
        lead,
        sub: this.guns.map((q) => {
          if (q.stun > 0) return T("⚡ STUNNED", "⚡ 眩晕");
          const m = q.combo >= C3 ? 3 : q.combo >= C2 ? 2 : 1;
          if (q.combo >= 2) return `${T("COMBO", "连击")} ${q.combo}${m > 1 ? `  ×${m}` : ""}`;
          return T(`${q.hits} nullified`, `作废 ${q.hits}`);
        }),
      },
    );
    if (this.phase !== "card") clock(g, Math.max(0, PLAY - this.t));
    // the wave strip under the clock
    if (this.phase === "play") this.waveStrip(g);
    // the announcer
    const sy = this.say;
    if (sy.t < sy.dur) {
      const k = sy.t / sy.dur;
      banner(g, sy.s, k, sy.c, H * 0.25, sy.size);
      if (sy.sub && k > 0.12 && k < 0.9) {
        g.save();
        g.globalAlpha = clamp((k - 0.12) / 0.1, 0, 1) * clamp((0.9 - k) / 0.1, 0, 1);
        toy(g, sy.sub, W / 2, H * 0.25 + sy.size * 0.8, 20, "#ffffff", { rim: INK });
        g.restore();
      }
    }
    if (tally) this.tally(g);
  }

  /** Three pips under the clock: the waves, the current one lit. */
  private waveStrip(g: CanvasRenderingContext2D) {
    const names = this.L.strip;
    // (clear of the clock as drawn; on a small screen the whole strip grows from its top edge until its letters read)
    const y0 = 34 + 25 * clockK() + 4;
    zoom(g, W / 2, y0, fpx(10) / 10, () => {
      for (let i = 0; i < 3; i++) {
        const x = W / 2 - 64 + i * 64,
          y = y0 + 9;
        const on = i === this.wave;
        rr(g, x - 28, y - 9, 56, 18, 9);
        g.fillStyle = INK;
        g.fill();
        rr(g, x - 26, y - 7, 52, 14, 7);
        g.fillStyle = on ? (i === 2 ? "#ff6b35" : "#9d7bff") : i < this.wave ? "#4a4270" : "#2a2450";
        g.fill();
        text(g, T(names[i][0], names[i][1]), x, y + 0.5, 10, on ? "#ffffff" : "rgba(255,255,255,0.45)", "center", 900);
      }
    });
  }

  /** A crosshair in the seat's colour: a ring and four ticks; B's charge round it; the combo beside it. */
  private reticle(g: CanvasRenderingContext2D, gun: Gun, alpha: number) {
    const p = gun.p;
    const me = p.human;
    // (yours: a little bigger on a touch screen, where it is read at arm's length under a thumb's reach)
    const r = me ? (HUD.thumbs ? 22 : 19) : 14;
    const st = gun.stun > 0;
    const x = gun.x + (st ? Math.sin(this.clk * 70) * 2.5 : 0),
      y = gun.y;
    // (on a window pillar: greyed, a shot there would clang off it)
    const wall = this.blocked(gun.x, gun.y, 0);
    const col = st || wall ? "#8f8ca6" : p.color;
    g.save();
    g.globalAlpha = alpha * (me ? 1 : 0.92);
    g.lineCap = "round";
    const shape = () => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        g.moveTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6));
        g.lineTo(x + Math.cos(a) * (r + 7), y + Math.sin(a) * (r + 7));
      }
    };
    shape();
    g.lineWidth = me ? 8 : 6.5;
    g.strokeStyle = INK;
    g.stroke();
    if (me) {
      shape();
      g.lineWidth = 6;
      g.strokeStyle = "#ffffff";
      g.stroke();
    }
    shape();
    g.lineWidth = me ? 3.6 : 3.2;
    g.strokeStyle = col;
    g.stroke();
    // the dot
    g.beginPath();
    g.arc(x, y, me ? 3.4 : 2.6, 0, Math.PI * 2);
    g.fillStyle = INK;
    g.fill();
    g.beginPath();
    g.arc(x, y, me ? 2.2 : 1.6, 0, Math.PI * 2);
    g.fillStyle = "#ffffff";
    g.fill();
    // B: the charge filling round it, a bright ring when ready
    const ch = 1 - gun.bcd / CHARGE_CD;
    const rr2 = r + 11;
    if (ch < 1) {
      g.beginPath();
      g.arc(x, y, rr2, -Math.PI / 2, -Math.PI / 2 + ch * Math.PI * 2);
      g.lineWidth = 3;
      g.strokeStyle = "rgba(255,255,255,0.5)";
      g.stroke();
    } else if (me || gun.p.skill >= 0) {
      g.globalAlpha = alpha * (0.55 + Math.sin(this.clk * 8) * 0.3);
      g.beginPath();
      g.arc(x, y, rr2, 0, Math.PI * 2);
      g.lineWidth = me ? 3 : 2;
      g.strokeStyle = me ? "#3ec6ff" : tint(p.color, 0.4);
      g.stroke();
      g.globalAlpha = alpha;
    }
    // the name under it (yours: YOU), the combo beside it
    if (!me || alpha > 0) {
      const nm = short(p);
      g.font = `900 ${me ? 12 : 10}px ${FONT}`;
      const tw = g.measureText(nm).width + 10;
      // (as tall as its letters: they are grown on a small screen)
      const nh = fpx(me ? 11 : 9.5) + 5;
      rr(g, x - tw / 2, y + r + 9, tw, nh, nh / 2);
      g.fillStyle = INK;
      g.fill();
      text(g, nm, x, y + r + 9 + nh / 2 + 0.5, me ? 11 : 9.5, tint(p.color, 0.3), "center", 900);
    }
    const m = gun.combo >= C3 ? 3 : gun.combo >= C2 ? 2 : 1;
    if (m > 1 && !st) toy(g, `×${m}`, x + r + 16, y - r - 4, me ? 18 : 14, m === 3 ? "#ff6b35" : "#a8d8e8");
    if (st) {
      toy(g, "⚡", x + r + 10, y - r - 2, me ? 20 : 15, "#a8d8e8");
    } else if (wall && me) toy(g, "✕", x + r + 9, y - r - 1, 16, "#d8d2f0");
    g.restore();
  }

  /** The tally: a row each, the bars growing, the winner crowned. */
  private tally(g: CanvasRenderingContext2D) {
    const order = this.final;
    if (!order) return;
    const k = this.tallyT - 0.5;
    if (k <= 0) return;
    const bw = 540,
      bh = 250;
    const x0 = W / 2 - bw / 2;
    const y0 = 110 - (1 - easeOut(clamp(k / 0.35, 0, 1))) * 40;
    g.save();
    g.globalAlpha = clamp(k / 0.25, 0, 1) * (this.over ? clamp(1 - this.post / 0.35, 0, 1) : 1);
    rr(g, x0, y0 + 5, bw, bh, 22);
    g.fillStyle = "rgba(6,3,18,0.45)";
    g.fill();
    rr(g, x0 - 2, y0 - 2, bw + 4, bh + 4, 24);
    g.fillStyle = INK;
    g.fill();
    rr(g, x0 + 1, y0 + 1, bw - 2, bh - 2, 21);
    g.fillStyle = "#ffffff";
    g.fill();
    rr(g, x0 + 5, y0 + 5, bw - 10, bh - 10, 18);
    const gr = g.createLinearGradient(0, y0, 0, y0 + bh);
    gr.addColorStop(0, "#2e2370");
    gr.addColorStop(1, "#140e38");
    g.fillStyle = gr;
    g.fill();
    toy(g, T("NULLIFIED", "作废结算"), W / 2, y0 + 32, 30, "#ff6b35");
    let top = 1;
    for (const q of this.guns) top = Math.max(top, q.score);
    const barX = x0 + 150,
      barW = 250;
    order.forEach((seat, r) => {
      const q = this.guns[seat];
      const y = y0 + 80 + r * 42;
      const grow = clamp((k - 0.2 - r * 0.08) / 1.0, 0, 1);
      const crowned = r === 0 && this.tallyT > 2.2;
      if (crowned) {
        rr(g, x0 + 14, y - 19, bw - 28, 38, 14);
        g.fillStyle = `rgba(255,255,255,${0.1 + Math.sin(this.clk * 6) * 0.05})`;
        g.fill();
      }
      text(g, String(r + 1), x0 + 26, y + 1, 18, r === 0 ? "#ffb35a" : "rgba(255,255,255,0.6)", "center", 900);
      badge(g, q.p, x0 + 58, y, 30, {});
      text(g, short(q.p), x0 + 80, y - 5, 13, tint(q.p.color, 0.35), "left", 900);
      text(g, T(`${q.hits} t-addrs · best ×${q.best}`, `${q.hits} 个 · 最高连击 ${q.best}`), x0 + 80, y + 10, 9.5, "rgba(255,255,255,0.6)", "left", 700);
      rr(g, barX + 18, y - 9, barW + 4, 18, 7);
      g.fillStyle = INK;
      g.fill();
      const wv = (q.score / top) * barW * easeOut(grow);
      if (wv > 1) {
        g.fillStyle = q.p.color;
        g.fillRect(barX + 20, y - 7, wv, 14);
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.fillRect(barX + 20, y - 7, wv, 4);
      }
      numeral(g, String(Math.round(q.score * easeOut(grow))), x0 + bw - 22, y + 1, 22, crowned ? "#ffe0b0" : "#ffffff");
      if (crowned) crown(g, x0 + 58, y - 14, 20, Math.sin(this.clk * 5) * 1.5);
    });
    g.restore();
  }

  result() {
    return this.over;
  }

  humanOut() {
    return false;
  }

  dispose() {
    for (const g of this.guns) g.a.dispose();
    for (const t of this.chevrons) t.dispose();
    disposeScene(this.w.scene);
    music.rate(1);
    const win = window as unknown as Record<string, unknown>;
    if (win.__gallery === this) delete win.__gallery;
  }
}

/** The card and the 3-2-1 have no hands on the guns. */
const NO_INPUT = { axis: () => ({ x: 0, y: 0 }), pressed: () => false, held: () => false } as unknown as Input;

export const GALLERY: MiniDef = {
  key: "gallery",
  title: "NULLIFIER GALLERY",
  titleZh: "废止符靶场",
  tag: "Nullify the transparent addresses in the prison yard: shoot the P2PKH and P2SH locks, never the Orchard shields!",
  tagZh: "在监狱大院作废透明地址：射爆 P2PKH 和 P2SH 锁，千万别打 Orchard 护盾！",
  goal: "Shatter the transparent targets, spare the Orchard shields: the most points wins!",
  goalZh: "打碎透明靶，别碰 Orchard 护盾：得分最高者赢！",
  help: "Arrows aim your crosshair, A fires a nullifier. Shatter transparent locks (hits in a row multiply); glowing Orchard shields cost points and stun you. B: a charged bolt that pierces two. Grab the DUST ATTACK basket and the TRACKER'S PROBE!",
  helpZh: "方向键瞄准，A 键发射废止符。打碎透明锁（连续命中翻倍）；发光的 Orchard 护盾会扣分并让你眩晕。B 键：蓄力弹，可穿透两个靶。抢下「粉尘攻击」篮子和追踪者探针！",
  pad: ["left", "right", "up", "down", "a", "b"],
  tap: false,
  color: "#ff6b35",
  song: "neon",
  ambience: "city-night",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `gallery-${l.key}`, song: l.song, ambience: l.ambience })),
  make: (players, rnd, variant) => new Gallery(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};
export default GALLERY;
