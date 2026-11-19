/**
 * Z-BALL CUP (key `qball`): SHIELDED against TRANSPARENT, two on two. The visitor and a rival drawn
 * by the seed play one house (transparent in flare, shielded in lilac), the other two rivals the
 * other. Push the giant ⓩ ball into their goal: the most goals in 50 seconds wins, a tie goes to
 * overtime (next goal wins, 15 s at most).
 *
 *   arrows  run (screen-relative)
 *   A       jump; touching the ball in the air is a header
 *   B       a dive: it knocks a rival flat, or punts the ball if it meets it (then a moment down)
 *
 * Three grounds (the level data below: an arena shape, a scenery, a sky, a song, its own twist):
 * - SKY PITCH: floating high over ZStreet by day, cut corners; bumpers rise at 0:25, the pitch
 *   tilts one way then the other from 0:29.
 * - FROZEN LAKE: a winter-evening rink on Central Park's frozen lake, rounded corners; patches of blue
 *   ice where the snarks lose their grip and the ball runs on, and at 0:25 the BIG FREEZE spreads it over the
 *   midfield.
 * - MARINA ROOFTOP: a Marina Bay hotel's roof deck at night with no wall at the front: a ball over the
 *   edge restarts at the centre, a snark over it falls and comes back at its goal; from 0:29 the
 *   monsoon blows everything toward the edge.
 * Everywhere: a second ball at 0:15 and a golden ball worth 2 for the last 10 seconds. Each event is
 * announced and shown on the pitch before it happens.
 *
 * The AIs play by roles: one attacks (gets behind the ball, lines it up with the goal, dives
 * into it for the shot), one defends (between the ball and the goal, clears it wide, dives at a
 * rival pushing the ball at the goal). They react late, aim loosely and, when caught on the wrong
 * side of the ball near their own goal, sometimes panic and push it in themselves. On the roof they
 * keep off the edge (the abler ones by more).
 *
 * The order: the winning house's two (by goals, then touches), then the others; a draw at the cap
 * ranks all four by goals, then touches.
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { H, HUD, W, backOut, clamp, easeOut, grow, isLocal, rng, rr, sfx, sound, text, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { music, type SongKey } from "../music";
import { INK, badge, numeral, tint, toy } from "../hud";
import { Avatar, CamRig, Fx3, GEO, banner, blob, block, canvasTex, clock, clockK, disposeScene, glow, label, outline, qBlock, short, skyDome, skyline, tag, toScreen, toon, toonSteps, world, yawOf, type World } from "../k3";
import type { AmbienceKind } from "../../audio/kinds";

// ---- the match ------------------------------------------------------------------------------------

/** Regulation time, then the overtime's cap (s). */
const TIME = 50;
const OT_CAP = 15;
/** When things happen (s of play): the second ball lands, the bumpers rise, the tilt starts, the gold. */
const T2 = 15;
const T_BUMP = 25;
const T_TILT = 29;
const T_GOLD = 40;
/** How long each is announced before (s). */
const WARN = 1.6;

// ---- the pitch (x along it, the visitor's goal at −x; z toward the camera) -----------------------

const HL = 11.5;
const HD = 7;
/** The corners are cut: |x| + |z| ≤ HL + HD − CUT. */
const CUT = 2.6;
/** The goal: its mouth's half width, its depth, the crossbar's height; the posts' radius. */
const GW = 3.3;
const GD = 2.6;
const GH = 3.2;
const POST = 0.17;
const WALL = 1.0;
/** The tilt's slope (tan of ~7°). */
const SLOPE = 0.125;
const BUMPS: readonly [number, number][] = [
  [-3.7, -3.9],
  [3.7, 3.9],
  [-3.7, 3.9],
  [3.7, -3.9],
];
const BUMP_R = 0.75;
const CITY_Y = -70;

// ---- the levels -----------------------------------------------------------------------------------

/** The pitch's corners: cut (|x| + |z| ≤ HL + HD − corner), rounded (a quarter circle of radius corner), square. */
type Shape = "cut" | "round" | "rect";

/** One ground: its names, its music and sky, its shape, its twists. */
interface QLevel {
  key: string;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  song: SongKey;
  ambience: AmbienceKind;
  sky: [string, string];
  fog: [number, number];
  night: boolean;
  shape: Shape;
  corner: number;
  /** The near side (+z) has no wall: a ball or a snark over it falls off. */
  open: boolean;
  bumpers: boolean;
  tilt: boolean;
  ice: boolean;
  monsoon: boolean;
  /** The stage's finish for it (post.ts multipliers: the night's neon blooms more). */
  look?: { bloom?: number; ao?: number; grade?: number; exposure?: number };
}

const LEVELS: QLevel[] = [
  {
    key: "sky",
    title: "SKY PITCH",
    titleZh: "天空球场",
    tag: "High over ZStreet by day: bumpers rise at 0:25, then the pitch tilts one way and the other.",
    tagZh: "白天高悬在 ZStreet 上空：0:25 弹力柱升起，随后球场左右倾斜。",
    song: "hero",
    ambience: "crowd",
    sky: ["#3f9bff", "#bfe7ff"],
    fog: [56, 310],
    night: false,
    shape: "cut",
    corner: CUT,
    open: false,
    bumpers: true,
    tilt: true,
    ice: false,
    monsoon: false,
  },
  {
    key: "astana",
    title: "FROZEN LAKE",
    titleZh: "冰封湖面",
    tag: "Central Park's lake, frozen: on the blue ice you slide and the ball runs on; at 0:25 the big freeze.",
    tagZh: "中央公园结冰的湖面：蓝冰上人会打滑、球会滑远；0:25 大冰封。",
    song: "frost",
    ambience: "wind",
    sky: ["#25316c", "#f2a99f"],
    fog: [70, 250],
    night: false,
    shape: "round",
    corner: 4.4,
    open: false,
    bumpers: false,
    tilt: false,
    ice: true,
    monsoon: false,
    look: { bloom: 1.1, grade: 1.1 },
  },
  {
    key: "marina",
    title: "MARINA ROOFTOP",
    titleZh: "滨海屋顶",
    tag: "A Marina Bay roof deck at night with no front wall: over the edge you go; at 0:29 the monsoon.",
    tagZh: "滨海湾夜晚的屋顶球场，前面没有围墙：小心掉下去；0:29 季风来袭。",
    song: "marina",
    ambience: "city-night",
    sky: ["#0a0c2c", "#4c2b74"],
    fog: [110, 360],
    night: true,
    shape: "rect",
    corner: 0,
    open: true,
    bumpers: false,
    tilt: false,
    ice: false,
    monsoon: true,
    look: { bloom: 1.35, grade: 1.1 },
  },
];

/** The ice (the frozen lake): two patches from the kick-off, three more at the BIG FREEZE (x, z, radii; point-symmetric, fair to both houses). */
const ICE0: readonly [number, number, number, number][] = [
  [-5.6, 3.1, 2.7, 1.9],
  [5.6, -3.1, 2.7, 1.9],
];
const ICE1: readonly [number, number, number, number][] = [
  [0, 0, 5.4, 4.2],
  [-6.4, -3.4, 2.4, 1.8],
  [6.4, 3.4, 2.4, 1.8],
];
/** When the ice spreads; on it, the grip (the run's response, against 12) and the drags. */
const T_FREEZE = 25;
const ICE_GRIP = 1.7;
const ICE_BALL_DRAG = 0.1;
/** The monsoon (Marina): from when, how long; how hard it pushes a ball (m/s²) and drifts a snark (m/s). */
const T_MONSOON = 29;
const MONSOON_T = 8;
const WIND_BALL = 3.4;
const WIND_MON = 1.25;
/** Off the roof: a ball comes back this long after it went; a snark this long after it fell. */
const BALL_BACK = 1.1;
const MON_BACK = 2.0;
/** The puffs feet and balls kick up, by ground. */
const DUST_GRASS = ["#ffffff", "#d8f0c0", "#a8e080"];
const DUST_SNOW = ["#ffffff", "#e6f2ff", "#bfe0ff"];
const DUST_ROOF = ["#ffffff", "#bfe6ff", "#7fe3d4"];

// ---- the bodies ---------------------------------------------------------------------------------

/** The snarks' size, their radius, their run (m/s). */
const MS = 1.15;
const PR = 0.55;
const RUN = 7.4;
/** The ball: radius, gravity, how fast it goes against the one pushing it. */
const BR = 1.2;
const BG = 22;
const PUSH = 1.12;
/** The dive: speed, length, the time down after it, the wait before the next. */
const DIVE_V = 13.5;
const DIVE_T = 0.3;
const REC_T = 0.38;
const DIVE_CD = 0.5;
/** A goal's mouth as a snark can walk it: past this x it is in it; this far to the side at most (clear of the posts). */
const MOUTH_X = HL - PR - POST;
const MOUTH_Z = GW - PR - POST - 0.05;
/** How long a press of A or B waits for its moment (s). */
const JUMP_BUF = 0.12;
const DIVE_BUF = 0.15;
/** Knocked flat (s). */
const DOWN_T = 1.15;
/** A punt's and a header's speed (m/s); a ball this fast bowls a snark over. */
const PUNT = 15.5;
const HEAD_V = 10.5;
const BOWL = 9.5;

interface House {
  en: string;
  zh: string;
  color: string;
  deep: string;
  dark: string;
}
const MOVERS: House = { en: "TRANSPARENT", zh: "透明", color: "#ff6b35", deep: "#e9531f", dark: "#8a2c0c" };
const MAKERS: House = { en: "SHIELDED", zh: "屏蔽", color: "#c4b1fc", deep: "#8f6cf0", dark: "#46308f" };

type St = "run" | "dive" | "rec" | "down" | "joy" | "sulk" | "fall";

interface Mon {
  a: Avatar;
  /** The player in the house's colour (tags, badges). */
  p: Player;
  seat: number;
  team: number;
  human: boolean;
  sk: number;
  /** An AI's run against the visitor's. */
  spd: number;
  vx: number;
  vz: number;
  st: St;
  stT: number;
  cd: number;
  dx: number;
  dz: number;
  grace: number;
  headCd: number;
  goals: number;
  touches: number;
  // the AI
  role: number;
  think: number;
  tx: number;
  tz: number;
  pace: number;
  charge: boolean;
  aimN: number;
  panic: number;
  wrong: boolean;
  ball: number;
  atkBall: number;
  atkCost: number;
  dives: number;
  seen: number[];
  /** Times it went off the roof. */
  falls: number;
  // the look
  lean: number;
  spin: number;
  flip: number;
}

interface Ball {
  i: number;
  on: boolean;
  /** drop: falling in; play; net: scored; off: over the roof's edge. */
  st: "drop" | "play" | "net" | "off";
  t: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gold: boolean;
  last: number;
  /** Each house's last toucher, and when (play time). */
  lastBy: number[];
  lastAt: number[];
  touch: boolean[];
  g: THREE.Group;
  body: THREE.Mesh;
  shadow: THREE.Mesh;
  halo: THREE.Mesh;
  ring: THREE.Mesh;
  /** The gloss on its top (faces the camera, does not roll). */
  glint: THREE.Mesh;
}

/** The visitor's controls this frame. */
interface Ctl {
  x: number;
  z: number;
  /** A and B, pressed this long ago at most: a press a moment early (in the air, getting up, the dive still cooling) goes off when it can. */
  jump: number;
  dive: number;
}

// ---- sounds of its own ----------------------------------------------------------------------------

function beep(f: number, dur: number, type: OscillatorType = "sine", vol = 0.3, slide = 0, delay = 0) {
  const a = sound();
  if (!a) return;
  const t = a.ac.currentTime + delay;
  const o = a.ac.createOscillator();
  const g = a.ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.bus);
  o.start(t);
  o.stop(t + dur + 0.03);
}
/** The crowd: a roar swelling and dying away. */
function roar(vol = 0.45, dur = 1.8) {
  const a = sound();
  if (!a) return;
  const ac = a.ac;
  const t = ac.currentTime;
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = ac.createBufferSource();
  s.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1050;
  f.Q.value = 0.55;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(a.bus);
  s.start(t);
}
/** The referee's whistle (a trill on a high note). */
function whistle(len = 0.3, delay = 0) {
  const a = sound();
  if (!a) return;
  const ac = a.ac;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.frequency.value = 2650;
  const lfo = ac.createOscillator();
  lfo.frequency.value = 30;
  const lg = ac.createGain();
  lg.gain.value = 160;
  lfo.connect(lg).connect(o.frequency);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
  g.gain.setValueAtTime(0.2, t + len - 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(a.bus);
  o.start(t);
  lfo.start(t);
  o.stop(t + len + 0.02);
  lfo.stop(t + len + 0.02);
}
const boing = () => (beep(220, 0.22, "square", 0.16, 2.6), beep(440, 0.16, "sine", 0.18, 1.8, 0.02));
const alarm = () => [0, 0.22, 0.44].forEach((d) => beep(880, 0.14, "square", 0.14, 0.8, d));

// ---- what the card says (the teams are only known once the match is made) -----------------------

let live: { mate: string; us: House; them: House } | null = null;

// ---- textures --------------------------------------------------------------------------------------

/** The pitch's outline as a path on a canvas of `S` px a metre, `i` metres in from its edge (the level's shape). */
function edgePath(g: CanvasRenderingContext2D, L: QLevel, S: number, i: number) {
  const X = (x: number) => (x + HL) * S;
  const Z = (z: number) => (z + HD) * S;
  g.beginPath();
  if (L.shape === "cut") {
    const c = L.corner - i * 0.6;
    g.moveTo(X(-HL + i + c), Z(-HD + i));
    g.lineTo(X(HL - i - c), Z(-HD + i));
    g.lineTo(X(HL - i), Z(-HD + i + c));
    g.lineTo(X(HL - i), Z(HD - i - c));
    g.lineTo(X(HL - i - c), Z(HD - i));
    g.lineTo(X(-HL + i + c), Z(HD - i));
    g.lineTo(X(-HL + i), Z(HD - i - c));
    g.lineTo(X(-HL + i), Z(-HD + i + c));
    g.closePath();
  } else if (L.shape === "round") rr(g, X(-HL + i), Z(-HD + i), (2 * HL - 2 * i) * S, (2 * HD - 2 * i) * S, (L.corner - i) * S);
  else g.rect(X(-HL + i), Z(-HD + i), (2 * HL - 2 * i) * S, (2 * HD - 2 * i) * S);
}

/** The pitch from above: its surface (mown grass, packed snow, a roof's turf), its lines, each goal's area in its house's colour. */
function pitchTex(left: House, right: House, L: QLevel) {
  const S = 44;
  const w = Math.round(2 * HL * S);
  const h = Math.round(2 * HD * S);
  const X = (x: number) => (x + HL) * S;
  const Z = (z: number) => (z + HD) * S;
  const ice = L.key === "astana";
  const roof = L.key === "marina";
  const stripes = ice ? ["#dfeaf6", "#e8f1fa"] : roof ? ["#2f9a86", "#38a891"] : ["#5fbd50", "#6dc95c"];
  const lines = ice ? "#3f74c9" : "#ffffff";
  return canvasTex(w, h, (g) => {
    // what lies beyond the pitch's corners: the cream apron, a snowbank, the deck
    g.fillStyle = ice ? "#f6f9ff" : roof ? "#3a3654" : "#f1e4c8";
    g.fillRect(0, 0, w, h);
    g.save();
    edgePath(g, L, S, 0);
    g.clip();
    const n = 12;
    for (let k = 0; k < n; k++) {
      g.fillStyle = stripes[k % 2];
      g.fillRect((k * w) / n, 0, w / n + 1, h);
    }
    if (ice) {
      // skate marks: long faint arcs
      g.strokeStyle = "rgba(150,175,210,0.35)";
      g.lineWidth = 2;
      for (let k = 0; k < 40; k++) {
        const cx = ((k * 997) % w) | 0;
        const cy = ((k * 613) % h) | 0;
        g.beginPath();
        g.arc(cx, cy, 60 + ((k * 37) % 140), (k % 7) * 0.8, (k % 7) * 0.8 + 0.9);
        g.stroke();
      }
    }
    // the goal areas, washed in the house that keeps them
    for (const [side, hs] of [
      [-1, left],
      [1, right],
    ] as const) {
      g.save();
      g.beginPath();
      g.arc(X(side * HL), Z(0), 4.3 * S, side < 0 ? -Math.PI / 2 : Math.PI / 2, side < 0 ? Math.PI / 2 : (Math.PI * 3) / 2);
      g.closePath();
      g.globalAlpha = ice ? 0.42 : roof ? 0.5 : 0.34;
      g.fillStyle = hs.color;
      g.fill();
      g.restore();
    }
    // a big ⓩ in the centre
    g.fillStyle = ice ? "rgba(63,116,201,0.12)" : "rgba(255,255,255,0.16)";
    g.beginPath();
    g.arc(X(0), Z(0), 2.8 * S, 0, Math.PI * 2);
    g.fill();
    g.font = `900 ${3.3 * S}px Geist, Roboto, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = ice ? "rgba(63,116,201,0.3)" : "rgba(255,255,255,0.3)";
    g.fillText("Z", X(0), Z(0) + 0.15 * S);
    // the lines
    g.strokeStyle = lines;
    g.lineWidth = 0.15 * S;
    g.lineJoin = "round";
    const i = 0.42;
    edgePath(g, L, S, i);
    g.stroke();
    g.beginPath();
    g.moveTo(X(0), Z(-HD + i));
    g.lineTo(X(0), Z(HD - i));
    if (ice) {
      // (a rink's red centre line, its blue lines)
      g.strokeStyle = "#e0485a";
      g.lineWidth = 0.3 * S;
    }
    g.stroke();
    g.strokeStyle = lines;
    g.lineWidth = 0.15 * S;
    if (ice)
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(X(side * 3.9), Z(-HD + i));
        g.lineTo(X(side * 3.9), Z(HD - i));
        g.lineWidth = 0.26 * S;
        g.stroke();
        g.lineWidth = 0.15 * S;
      }
    g.beginPath();
    g.arc(X(0), Z(0), 2.8 * S, 0, Math.PI * 2);
    g.stroke();
    for (const side of [-1, 1]) {
      g.beginPath();
      g.arc(X(side * HL), Z(0), 4.3 * S, side < 0 ? -Math.PI / 2 : Math.PI / 2, side < 0 ? Math.PI / 2 : (Math.PI * 3) / 2);
      g.stroke();
      g.beginPath();
      g.arc(X(side * (HL - 6.2)), Z(0), 0.2 * S, 0, Math.PI * 2);
      g.fillStyle = lines;
      g.fill();
    }
    g.beginPath();
    g.arc(X(0), Z(0), 0.22 * S, 0, Math.PI * 2);
    g.fill();
    g.restore();
    if (roof) {
      // the open front: a hazard band along the edge
      const y0 = Z(HD - 0.55);
      g.save();
      g.beginPath();
      g.rect(0, y0, w, h - y0);
      g.clip();
      g.fillStyle = "#ffd23f";
      g.fillRect(0, y0, w, h - y0);
      g.fillStyle = "#1a1530";
      for (let x = -40; x < w + 40; x += 36) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + 18, h);
        g.lineTo(x + 18 + (h - y0), y0);
        g.lineTo(x + (h - y0), y0);
        g.closePath();
        g.fill();
      }
      g.restore();
    }
  });
}

/** The giant ball: cream with ⓩ coins (gold: a golden one with cream coins). */
function ballTex(gold: boolean) {
  return canvasTex(512, 256, (g) => {
    const base = gold ? "#ffc61a" : "#fdf8ec";
    const coinC = gold ? "#fff4cf" : "#ffcf2e";
    const rim = gold ? "#b57a00" : "#c98a00";
    const ink = gold ? "#8a5600" : "#9a6200";
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 256);
    // the caps and their seams
    g.fillStyle = coinC;
    g.fillRect(0, 0, 512, 30);
    g.fillRect(0, 226, 512, 30);
    g.fillStyle = rim;
    g.fillRect(0, 30, 512, 6);
    g.fillRect(0, 220, 512, 6);
    const coin = (x: number, y: number, rx: number, ry: number) => {
      for (const dx of [0, -512, 512]) {
        g.fillStyle = INK;
        g.beginPath();
        g.ellipse(x + dx, y, rx + 4, ry + 4, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = rim;
        g.beginPath();
        g.ellipse(x + dx, y, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = coinC;
        g.beginPath();
        g.ellipse(x + dx, y, rx * 0.8, ry * 0.8, 0, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.translate(x + dx, y);
        g.scale(rx / ry, 1);
        g.font = `900 ${ry * 1.25}px Geist, Roboto, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = ink;
        g.fillText("Z", 1.5, ry * 0.1 + 1.5);
        g.fillStyle = gold ? "#ffb800" : "#fff8dc";
        g.fillText("Z", 0, ry * 0.1);
        g.restore();
      }
    };
    for (let i = 0; i < 4; i++) coin(64 + i * 128, 128, 42, 42);
    for (let i = 0; i < 4; i++) {
      coin(i * 128, 62, 38, 24);
      coin(i * 128, 194, 38, 24);
    }
  });
}

/** A goal's net: a white mesh on nothing. */
function netTex() {
  return canvasTex(
    64,
    64,
    (g) => {
      g.clearRect(0, 0, 64, 64);
      g.strokeStyle = "rgba(255,255,255,0.95)";
      g.lineWidth = 5;
      g.strokeRect(0, 0, 64, 64);
    },
    true,
  );
}

/** The tilt's warning: big chevrons pointing downhill (−x). */
function arrowTex() {
  return canvasTex(512, 256, (g) => {
    g.clearRect(0, 0, 512, 256);
    g.lineJoin = "round";
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 4; i++) {
        const x = 60 + i * 120;
        const y = 64 + r * 128;
        g.beginPath();
        g.moveTo(x + 50, y - 46);
        g.lineTo(x, y);
        g.lineTo(x + 50, y + 46);
        g.lineTo(x + 78, y + 46);
        g.lineTo(x + 28, y);
        g.lineTo(x + 78, y - 46);
        g.closePath();
        g.fillStyle = "#ffd23f";
        g.fill();
        g.lineWidth = 6;
        g.strokeStyle = "#ff8a1f";
        g.stroke();
      }
  });
}

/** A patch of clear blue ice: glossy, a few glints and cracks (lies on the pitch, its edge soft). */
function iceTex() {
  return canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    gr.addColorStop(0, "rgba(176,232,255,0.96)");
    gr.addColorStop(0.82, "rgba(120,200,246,0.94)");
    gr.addColorStop(0.97, "rgba(90,176,236,0.9)");
    gr.addColorStop(1, "rgba(90,176,236,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.save();
    g.beginPath();
    g.arc(128, 128, 122, 0, Math.PI * 2);
    g.clip();
    // the gloss: slanted glints
    g.fillStyle = "rgba(255,255,255,0.55)";
    for (const [x, w] of [
      [60, 16],
      [92, 6],
      [150, 22],
      [188, 7],
    ]) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + w, 0);
      g.lineTo(x + w - 120, 256);
      g.lineTo(x - 120, 256);
      g.closePath();
      g.fill();
    }
    // the cracks
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      let x = 128 + Math.cos(k * 1.3) * 30;
      let y = 128 + Math.sin(k * 1.3) * 30;
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += Math.cos(k * 1.3 + j * 0.5) * 22;
        y += Math.sin(k * 1.3 - j * 0.4) * 22;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();
  });
}

/** A soft round highlight (white to nothing): the ball's gloss, glows in the sky. */
function softTex() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** One mesh of several flat quads (each 4 corners), its uv in metres / `cell`. */
function quads(list: number[][][], cell: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const q of list) {
    const n = pos.length / 3;
    const w = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]) / cell;
    const h = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]) / cell;
    for (const p of q) pos.push(p[0], p[1], p[2]);
    uv.push(0, 0, w, 0, w, h, 0, h);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  ry?: number;
  c: string;
}
const UP = new THREE.Vector3(0, 1, 0);
/** Many boxes in one draw (their colours on a white toon); `ink` > 0: their ink hulls instead. */
function boxes(list: Box[], mat: THREE.Material, ink = 0) {
  const mesh = new THREE.InstancedMesh(GEO.box, mat, list.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  list.forEach((b, i) => {
    q.setFromAxisAngle(UP, b.ry ?? 0);
    mesh.setMatrixAt(i, m4.compose(p.set(b.x, b.y, b.z), q, s.set(b.w + ink * 2, b.h + ink * 2, b.d + ink * 2)));
    if (!ink) mesh.setColorAt(i, c.set(b.c));
  });
  mesh.raycast = () => {};
  return mesh;
}

// ---- the game ---------------------------------------------------------------------------------------

class QBall implements Mini {
  private w: World;
  private fx: Fx3;
  private cam: CamRig;
  private pitch = new THREE.Group();
  private mons: Mon[] = [];
  private teams: Mon[][] = [[], []];
  private human: Mon | null = null;
  /** This screen's player (the HUD's hints are for them). */
  private me: Mon | null = null;
  private house: House[];
  private balls: Ball[] = [];
  private score = [0, 0];
  private scorePop = [0, 0];
  /** Play time (s; slowed in a goal's slow motion). */
  private t = 0;
  private ot = false;
  private over: number[] | null = null;
  private winner = -1;
  private endT = 0;
  private phase: "card" | "count" | "play" = "card";
  private phaseK = 0;
  private cardT = 0;
  /** A goal: the slow motion (real s), the camera's punch-in on the goal at punchX, the white flash. */
  private slow = 0;
  private punch = 0;
  private punchX = 0;
  private flash = 0;
  private slope = 0;
  private slopeTo = 0;
  private tiltSide: number;
  private ev = { two: false, bumpWarn: false, bumpUp: false, tiltWarn: false, tilt1: false, flipWarn: false, tilt2: false, level: false, freezeWarn: false, freeze: false, windWarn: false, wind: false, calm: false, goldWarn: false, gold: false, end: false };
  /** The ice: the patches (x, z, radii), how far each has spread (0…1); the frost rings that warn of the freeze. */
  private ice: { x: number; z: number; rx: number; rz: number; k: number; to: number }[] = [];
  private iceMesh: THREE.InstancedMesh | null = null;
  private iceRim: THREE.InstancedMesh | null = null;
  private frostMat: THREE.MeshBasicMaterial | null = null;
  private frost: THREE.InstancedMesh | null = null;
  private freezeWarn = 0;
  /** The monsoon's push now (0 calm…1), the rain's streaks; the snow's flakes. */
  private wind = 0;
  private rain: THREE.InstancedMesh | null = null;
  private rainMat: THREE.MeshBasicMaterial | null = null;
  private drip: { x: number; y: number; z: number; v: number }[] = [];
  private snow: THREE.InstancedMesh | null = null;
  private flakes: { x: number; y: number; z: number; v: number; ph: number }[] = [];
  /** The roof's edge: its warning lights. */
  private edgeLights: THREE.InstancedMesh | null = null;
  /** The crowd's arms and the flags some of them wave; the pennants on the stand; the goals' nets (they bulge at a goal). */
  private arms!: THREE.InstancedMesh;
  private fanFlags!: THREE.InstancedMesh;
  private pennants!: THREE.InstancedMesh;
  private pennantAt: { x: number; y: number; z: number }[] = [];
  private nets: { m: THREE.Mesh; x0: number; k: number }[] = [];
  /** The level's living background (a blimp, boats, traffic, fireworks…), stepped every frame. */
  private ticks: ((dt: number, now: number) => void)[] = [];
  /** The scenery's own dice and clock (never the game's `rnd`, never the wall clock: the look is the same on every screen). */
  private deco = rng(0x9ba11);
  private clk = 0;
  private fwT = 0;
  /** The bumpers' rise, 0…1. */
  private bumpH = 0;
  private bumpPulse = [0, 0, 0, 0];
  private warnTilt = 0;
  private pendingGold = false;
  private drops: { at: number; x: number; z: number; gold: boolean; low?: boolean }[] = [];
  private banners: { s: string; c: string; t: number; d: number; y: number; size: number }[] = [];
  private pops: { x: number; y: number; z: number; s: string; c: string; t: number }[] = [];
  private cheer = [0, 0];
  private ctl: Ctl = { x: 0, z: 0, jump: 0, dive: 0 };
  // the scenery that moves
  private bumpBody!: THREE.InstancedMesh;
  private bumpInk!: THREE.InstancedMesh;
  private bumpBand!: THREE.InstancedMesh;
  private bumpCap!: THREE.InstancedMesh;
  private bumpRing!: THREE.InstancedMesh;
  private bumpRingMat!: THREE.MeshBasicMaterial;
  private arrows!: THREE.Group;
  private arrowMat!: THREE.MeshBasicMaterial;
  private fans!: THREE.InstancedMesh;
  private heads!: THREE.InstancedMesh;
  private fanAt: { x: number; y: number; z: number; team: number; ph: number }[] = [];
  private qbs: THREE.Mesh[] = [];
  private flags!: THREE.InstancedMesh;
  private goalGlow: THREE.Mesh[] = [];
  private aim!: THREE.Mesh;
  private ballMats: THREE.Material[] = [];
  private ringMats: THREE.MeshBasicMaterial[] = [];
  // scratch
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private eu = new THREE.Euler();
  private m4 = new THREE.Matrix4();
  private sc = new THREE.Vector3();
  private col = new THREE.Color();
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();

  constructor(
    private players: Player[],
    private rnd: Rnd,
    private L: QLevel,
  ) {
    this.w = world({ sky: L.sky, fog: L.fog, night: L.night, post: L.look });
    const s = this.w.scene;
    // the teams: the visitor (or seat 0) and a rival drawn by the seed, against the other two
    const lead = Math.max(0, players.findIndex((p) => p.human));
    const others = [0, 1, 2, 3].filter((i) => i !== lead);
    const mate = others[Math.floor(rnd() * 3)];
    const us = rnd() < 0.5 ? MOVERS : MAKERS;
    this.house = [us, us === MOVERS ? MAKERS : MOVERS];
    this.tiltSide = rnd() < 0.5 ? -1 : 1;
    live = players.some((p) => p.human) ? { mate: short(players[mate]), us: this.house[0], them: this.house[1] } : null;
    s.add(this.pitch);
    if (L.key === "astana") this.buildAstana();
    else if (L.key === "marina") this.buildMarina();
    else this.buildCity();
    this.buildPitch();
    this.buildStands();
    this.buildTwists();
    // the four: each in their house's colour (ring, marker, headband, tag)
    players.forEach((p, i) => {
      const team = i === lead || i === mate ? 0 : 1;
      const hs = this.house[team];
      const tp: Player = { ...p, color: hs.color, dark: hs.dark };
      const a = new Avatar(s, tp, { scale: MS });
      const hb = a.body.headBox;
      const band = block(hs.deep, hb.max.x - hb.min.x + 0.05, 0.1, hb.max.z - hb.min.z + 0.05, (hb.max.x + hb.min.x) / 2, hb.min.y + (hb.max.y - hb.min.y) * 0.8, (hb.max.z + hb.min.z) / 2, a.body.head);
      outline(band, 0.02);
      // the house's jersey over its body (sized to its zkSNARK's chest)
      const ch = a.body.chest;
      const shirt = block(hs.color, ch.w + 0.05, Math.max(0.16, ch.h * 0.62), ch.d + 0.05, 0, Math.max(0.08, ch.h * 0.31), 0, a.body.puppet.rig.bones[1]);
      outline(shirt, 0.02);
      const m: Mon = {
        a,
        p: tp,
        seat: i,
        team,
        human: p.human,
        sk: clamp(p.skill, 0, 1),
        spd: 0.8 + 0.2 * clamp(p.skill, 0, 1),
        vx: 0,
        vz: 0,
        st: "run",
        stT: 0,
        cd: 0,
        dx: 0,
        dz: 1,
        grace: 0,
        headCd: 0,
        goals: 0,
        touches: 0,
        role: 0,
        think: rnd() * 0.2,
        tx: 0,
        tz: 0,
        pace: 1,
        charge: false,
        aimN: 0,
        panic: 0,
        wrong: false,
        ball: -1,
        atkBall: -1,
        atkCost: 0,
        dives: 0,
        seen: [-1, -1, -1, -1],
        falls: 0,
        lean: 0,
        spin: 0,
        flip: 0,
      };
      this.mons.push(m);
      this.teams[team].push(m);
      if (p.human) this.human = m;
      if (isLocal(p)) this.me = m;
    });
    // the line-up: the lead forward, the mate back (the AI team: the abler one forward)
    for (let team = 0; team < 2; team++) {
      const ms = this.teams[team];
      if (team === 1 && ms[1].sk > ms[0].sk) ms.reverse();
      else if (team === 0 && ms[0].seat !== lead) ms.reverse();
      const sg = team === 0 ? -1 : 1;
      ms.forEach((m, k) => {
        m.role = k;
        m.a.pos.set(sg * (k === 0 ? 4.4 : 8.6), 0, (k === 0 ? 1.4 : -1.2) * -sg);
        m.a.yaw = yawOf(-sg, 0);
        m.tx = m.a.pos.x;
        m.tz = m.a.pos.z;
        m.a.sync(0);
      });
    }
    this.buildBalls();
    this.spawn(this.balls[0], 0, 0, false);
    const b0 = this.balls[0];
    b0.st = "play";
    b0.y = BR;
    this.fx = new Fx3(s, 1100);
    this.cam = new CamRig(this.w.camera);
    this.cam.set(new THREE.Vector3(-14, 9, 22), new THREE.Vector3(0, 0.5, 0));
    this.cam.apply(0);
  }

  // ---- building ----------------------------------------------------------------------------------

  private buildCity() {
    const s = this.w.scene;
    // (the scenery's own dice: the same city on every screen, and the game's `rnd` left alone)
    const R = rng(0x51c1);
    // late morning, the sun from the front and a little right: the shadows fall up the pitch, away from the camera, the goals' own into their nets
    this.w.sun.position.set(10, 40, 34);
    // the sky all round (the card's flight and the intro see the horizon), its sun where the light comes from
    skyDome(s, { sky: ["#2f86f2", "#bfe7ff"], clouds: 18, disc: { az: 106, el: 48, size: 8 }, haze: 0.45, rnd: R });
    // the streets far below: cool and calm (the pitch is the bright thing here), a pavement round each block, lanes, trees in the parks
    const tex = canvasTex(
      512,
      512,
      (g) => {
        g.fillStyle = "#a3aec4";
        g.fillRect(0, 0, 512, 512);
        const pal = ["#a4c69a", "#cdc5b6", "#bac9da", "#d3c2ad", "#9cc294", "#c7c1d8"];
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 4; j++) {
            const k = (i * 5 + j * 3) % pal.length;
            const x = i * 128 + 14;
            const y = j * 128 + 14;
            g.fillStyle = "#c3cbdb";
            g.fillRect(x - 4, y - 4, 108, 108);
            g.fillStyle = pal[k];
            g.fillRect(x, y, 100, 100);
            if (k % 4 === 0) {
              // a park: a path across it, round trees
              g.fillStyle = "#d9d2bd";
              g.fillRect(x + 46, y, 8, 100);
              g.fillStyle = "#7fae7c";
              for (let t = 0; t < 7; t++) {
                g.beginPath();
                g.arc(x + (t % 2 ? 76 : 24) + ((t * 13) % 9) - 4, y + 12 + t * 13, 8, 0, Math.PI * 2);
                g.fill();
              }
            }
          }
        // the lanes' dashes, the crossings at each corner
        g.fillStyle = "rgba(255,255,255,0.6)";
        for (let k = 0; k < 4; k++)
          for (let d = 20; d < 512; d += 32) {
            if (d % 128 < 14 || d % 128 > 114) continue;
            for (const o of k ? [k * 128] : [0, 512]) (g.fillRect(o - 1.5, d, 3, 14), g.fillRect(d, o - 1.5, 14, 3));
          }
      },
      true,
    );
    tex.repeat.set(30, 30);
    const ground = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps() }));
    ground.rotation.x = -Math.PI / 2;
    ground.scale.set(1500, 1500, 1);
    ground.position.y = CITY_Y;
    s.add(ground);
    const wtex = canvasTex(
      64,
      128,
      (g) => {
        g.fillStyle = "#fff";
        g.fillRect(0, 0, 64, 128);
        for (let y = 6; y < 128; y += 12)
          for (let x = 5; x < 64; x += 12) {
            // (pale glass on a pale wall: a far tower is a calm shape, not a grid)
            g.fillStyle = R() < 0.25 ? "#eef7ff" : "#b3c2d8";
            g.fillRect(x, y, 7, 7);
          }
      },
      true,
    );
    const cell = 12.5;
    const N = 24;
    const towers = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ map: wtex, gradientMap: toonSteps() }), N * N);
    const pal = ["#e6cfb6", "#afc6ea", "#e2bda2", "#a2bbe4", "#cdbfe8", "#e6d6a6", "#e0aea2", "#a6d6c6"];
    const c = new THREE.Color();
    let n = 0;
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        if (R() < 0.25) continue;
        const x = (i - N / 2 + 0.5) * cell;
        const z = (j - N / 2 + 0.5) * cell;
        const d = Math.hypot(x, z);
        const w = cell * (0.55 + R() * 0.2);
        const h = 4 + R() * R() * (d < 40 ? 16 : 40);
        towers.setMatrixAt(n, this.m4.compose(this.v.set(x, CITY_Y + h / 2, z), this.q.identity(), this.sc.set(w, h, w * (0.8 + R() * 0.4))));
        towers.setColorAt(n, c.set(pal[(i * 7 + j * 3) % pal.length]));
        n++;
      }
    towers.count = n;
    towers.raycast = () => {};
    s.add(towers);
    skyline(s, { r: 200, n: 80, y: CITY_Y, rnd: R, tall: 0.9 });
    // the air between the island and the streets: a veil of the sky's own blue, so the city sits back, paler
    // and cooler than the pitch (the tall towers and the clouds stand out of it)
    const veil = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ color: "#b2dbfb", transparent: true, opacity: 0.42, depthWrite: false, fog: false }));
    veil.rotation.x = -Math.PI / 2;
    veil.scale.set(1500, 1500, 1);
    veil.position.y = -33;
    veil.renderOrder = -5;
    veil.raycast = () => {};
    s.add(veil);
    // the clouds: broad flat banks drifting between the island and the city, a few high up (one draw)
    const puffs = 5;
    const nC = 30;
    // (a pale blue-grey body: the sun whitens its top, its sides keep their shape)
    const cl = new THREE.InstancedMesh(GEO.box, toon("#e7edf8", "#353f55"), nC * puffs);
    let k = 0;
    for (let i = 0; i < nC; i++) {
      const low = i < 22;
      const a = (i / 22) * Math.PI * 2 * 3 + R() * 0.5;
      const d = low ? 30 + ((i * 7) % 22) * 3.6 + R() * 6 : 100 + R() * 70;
      const cy = low ? -24 - R() * 16 : 20 + R() * 22;
      const kk = low ? 1.1 + R() * 1.1 : 1.6 + R();
      for (let p = 0; p < puffs; p++) {
        const big = p > 0 && p < 4;
        const w = (big ? 6.4 : 4.2) * kk;
        cl.setMatrixAt(k++, this.m4.compose(this.v.set(Math.cos(a) * d + (p - 2) * 3.6 * kk, cy + (big ? 0.7 : 0) * kk + (p === 2 ? 0.9 * kk : 0), Math.sin(a) * d + (R() - 0.5) * 3 * kk), this.q.identity(), this.sc.set(w, w * 0.46, w * 0.95)));
      }
    }
    cl.raycast = () => {};
    // (too far under the pitch to shade it, and nothing below them takes a shadow)
    cl.userData.noShadow = true;
    s.add(cl);
    this.ticks.push((dt) => void (cl.rotation.y += dt * 0.012));
    this.skyLife();
  }

  /** The sky pitch's life: the ZSTREET BLIMP circling under the island, balloons rising, a flock of birds, a waterfall off the rim, flower boxes and trees on the slab, the sun. */
  private skyLife() {
    const s = this.w.scene;
    const R = rng(0x51c2);
    // the blimp: an envelope striped in the houses' colours, its fins, a gondola, the name on both flanks, a blinking light
    const blimp = new THREE.Group();
    const env = new THREE.Mesh(GEO.ball, toon("#f6f1ff", "#2a2240"));
    env.scale.set(13, 4.4, 4.4);
    blimp.add(env);
    outline(env, 0.06);
    const band = new THREE.Mesh(GEO.cyl, toon("#ff6b35", "#3a1608"));
    band.rotation.z = Math.PI / 2;
    band.scale.set(4.5, 1.6, 4.5);
    band.position.x = -2.2;
    blimp.add(band);
    const band2 = new THREE.Mesh(GEO.cyl, toon("#c4b1fc", "#24164a"));
    band2.rotation.z = Math.PI / 2;
    band2.scale.set(4.2, 1.2, 4.2);
    band2.position.x = 2.2;
    blimp.add(band2);
    const finMat = toon("#ff6b35", "#3a1608");
    for (const [y, z, w, h, d] of [
      [1.6, 0, 2.4, 1.8, 0.25],
      [-1.6, 0, 2.4, 1.8, 0.25],
      [0, 1.6, 2.4, 0.25, 1.8],
      [0, -1.6, 2.4, 0.25, 1.8],
    ]) {
      const f = new THREE.Mesh(GEO.box, finMat);
      f.scale.set(w, h, d);
      f.position.set(-5.6, y, z);
      blimp.add(f);
    }
    const gond = block("#3a3358", 2.6, 0.8, 1.1, 0.4, -2.45, 0, blimp);
    outline(gond, 0.04);
    for (const side of [-1, 1]) {
      const nm = label("ZSTREET", 1.7, "#1a1033");
      nm.position.set(0.6, 0.2, side * 2.23);
      if (side < 0) nm.rotation.y = Math.PI;
      blimp.add(nm);
    }
    const beacon = new THREE.Mesh(GEO.ball, glow("#ff3b4f"));
    beacon.scale.setScalar(0.45);
    beacon.position.set(0, 2.3, 0);
    blimp.add(beacon);
    s.add(blimp);
    // the balloons, slowly rising and sinking at the sides
    const bal: [number, number, number, string][] = [
      [-30, -4, -26, "#ff6b35"],
      [33, -9, -20, "#c4b1fc"],
      [-36, -14, 4, "#6dbf8a"],
      [38, -2, 8, "#a8d8e8"],
    ];
    const envs = new THREE.InstancedMesh(GEO.ball, toon("#ffffff", "#1a1530"), bal.length);
    const baskets = new THREE.InstancedMesh(GEO.box, toon("#a8744a", "#2a1608"), bal.length);
    bal.forEach(([, , , c], i) => envs.setColorAt(i, this.col.set(c)));
    for (const m of [envs, baskets]) ((m.raycast = () => {}), (m.frustumCulled = false), s.add(m));
    // the gulls, a loose flock wheeling round the island under its rim (white on the city's haze: a body, two wings each)
    const nB = 14;
    const birds = new THREE.InstancedMesh(GEO.box, toon("#ffffff", "#5a6a8c"), nB * 3);
    birds.frustumCulled = false;
    birds.raycast = () => {};
    birds.userData.noShadow = true;
    s.add(birds);
    // the waterfall pouring off the rim, its mist
    const fallTex = canvasTex(
      64,
      256,
      (g) => {
        g.fillStyle = "#bfe9ff";
        g.fillRect(0, 0, 64, 256);
        for (let k = 0; k < 40; k++) {
          g.fillStyle = k % 3 ? "rgba(255,255,255,0.85)" : "rgba(120,200,240,0.7)";
          g.fillRect((k * 23) % 64, (k * 59) % 256, 3 + (k % 4) * 2, 30 + (k % 5) * 14);
        }
      },
      true,
    );
    fallTex.repeat.set(1, 3);
    const fall = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.92, depthWrite: false }));
    fall.scale.set(2.6, 34, 1);
    fall.position.set(-11.2, -17.5, HD + 1.4);
    // (what stands on the slab tilts with it)
    const P = this.pitch;
    P.add(fall);
    const lip = block("#7fd0f5", 2.8, 0.3, 0.9, -11.2, -0.62, HD + 1.0, P, glow("#a8e4ff"));
    lip.renderOrder = 2;
    // flower boxes along the near rim, two little trees on the corners past the goals
    const fb: Box[] = [];
    const fl: [number, number, number, string][] = [];
    for (let k = 0; k < 6; k++) {
      const x = -8 + k * 3.2 + (k > 2 ? 0.6 : 0);
      if (Math.abs(x + 11.2) < 2) continue;
      fb.push({ x, y: 0.2, z: HD + 0.9, w: 1.7, h: 0.4, d: 0.5, c: "#a8744a" });
      for (let j = 0; j < 4; j++) fl.push([x - 0.6 + j * 0.4, 0.5, HD + 0.9, ["#ff6b35", "#ffd23f", "#ff5fa2", "#c4b1fc"][(k + j) % 4]]);
    }
    for (const sx of [-1, 1]) fb.push({ x: sx * (HL + GD + 0.3), y: 0.9, z: -(HD + 4.6), w: 0.3, h: 1.8, d: 0.3, c: "#7a4a24" });
    P.add(boxes(fb, toon("#ffffff")));
    const flow = new THREE.InstancedMesh(GEO.ball, toon("#ffffff", "#2a1a30"), fl.length + 2);
    fl.forEach(([x, y, z, c], i) => {
      flow.setMatrixAt(i, this.m4.compose(this.v.set(x, y, z), this.q.identity(), this.sc.setScalar(0.42)));
      flow.setColorAt(i, this.col.set(c));
    });
    [-1, 1].forEach((sx, k) => {
      flow.setMatrixAt(fl.length + k, this.m4.compose(this.v.set(sx * (HL + GD + 0.3), 2.4, -(HD + 4.6)), this.q.identity(), this.sc.set(2.2, 2.0, 2.2)));
      flow.setColorAt(fl.length + k, this.col.set("#5fbf3e"));
    });
    flow.raycast = () => {};
    P.add(flow);
    const ph = R() * 6.3;
    let mist = 0;
    this.ticks.push((dt, now) => {
      const a = ph + now * 0.06;
      blimp.position.set(Math.cos(a) * 30, -9 + Math.sin(now * 0.4) * 0.8, -8 + Math.sin(a) * 22);
      blimp.rotation.y = -a - Math.PI / 2;
      beacon.visible = Math.floor(now * 1.5) % 2 === 0;
      bal.forEach(([x, y, z], i) => {
        const yy = y + Math.sin(now * 0.25 + i * 1.7) * 3;
        envs.setMatrixAt(i, this.m4.compose(this.v.set(x, yy, z), this.q.identity(), this.sc.set(4.2, 5, 4.2)));
        baskets.setMatrixAt(i, this.m4.compose(this.v.set(x, yy - 3.6, z), this.q.identity(), this.sc.set(1.2, 0.9, 1.2)));
      });
      envs.instanceMatrix.needsUpdate = true;
      baskets.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < nB; i++) {
        // (wide of the slab and under its rim: never between the camera and the pitch)
        const b = now * 0.3 + (i / nB) * 1.5 + (i % 2) * 3.1;
        const r = 30 + (i % 5) * 2.2;
        const x = Math.cos(b) * r * 1.15;
        const z = -8 + Math.sin(b) * r * 0.82;
        const y = -5 - (i % 4) * 1.6 + Math.sin(now * 0.9 + i) * 0.9;
        // (a few beats, then a glide)
        const flap = Math.sin(now * 9 + i * 2) * (Math.sin(now * 0.7 + i * 1.3) > -0.2 ? 0.7 : 0.12);
        const yaw = -b;
        this.q2.setFromAxisAngle(UP, yaw);
        birds.setMatrixAt(i * 3, this.m4.compose(this.v.set(x, y, z), this.q2, this.sc.set(0.2, 0.17, 0.62)));
        for (let k = 0; k < 2; k++) {
          const sd = k ? 1 : -1;
          this.q.setFromEuler(this.eu.set(0, yaw, sd * flap));
          this.v2.set(sd * (0.08 + 0.42 * Math.cos(flap)), 0.42 * Math.sin(flap), 0).applyQuaternion(this.q2);
          birds.setMatrixAt(i * 3 + 1 + k, this.m4.compose(this.v.set(x + this.v2.x, y + this.v2.y, z + this.v2.z), this.q, this.sc.set(0.84, 0.05, 0.3)));
        }
      }
      birds.instanceMatrix.needsUpdate = true;
      fallTex.offset.y -= dt * 1.6;
      if ((mist -= dt) <= 0) {
        mist = 0.12 + R() * 0.2;
        this.fx.burst(this.v.set(-11.2 + (R() - 0.5) * 2, -1.0, HD + 1.6), 2, ["#ffffff", "#cdeeff"], { speed: 1.4, up: 0.6, gravity: 3, size: 0.2, life: 0.7 });
      }
    });
  }

  /** Central Park on a winter evening: the snowfield round the rink on the frozen lake, the frozen river, the city lighting up, the NU7 TOWER holding its green orb, the ZK MALL's great tent, snowy pines, lanterns on strings. */
  private buildAstana() {
    const s = this.w.scene;
    const R = rng(0xa57a);
    this.w.hemi.color.set("#c8d2ff");
    this.w.hemi.groundColor.set("#6a5f8c");
    this.w.hemi.intensity = 1.35;
    this.w.sun.color.set("#ffb486");
    this.w.sun.intensity = 2.3;
    // the evening's warm key from the front left, high enough that the goals and the lanterns keep their
    // shadows off the ice (the snarks' and the ball's fall up the rink, away from the camera)
    this.w.sun.position.set(-13, 30, 34);
    // the dusk all round: the first stars, pink clouds, the sun going down where the light comes from
    skyDome(s, { sky: ["#25316c", "#f2a99f"], stars: 170, clouds: 10, cloud: "#ffd9c6", cloudShade: "#b17f9f", disc: { az: 69, el: 7, color: "#ffdcae", size: 9, glow: 6 }, haze: 0.5, rnd: R });
    // the moon coming up over the far side as the sun goes down behind the camera: a pale disc behind the
    // city's towers, where the card's flight and the intro look
    const moon = new THREE.Mesh(
      GEO.plane,
      new THREE.MeshBasicMaterial({
        map: canvasTex(128, 128, (g) => {
          const gr = g.createRadialGradient(64, 64, 26, 64, 64, 64);
          gr.addColorStop(0, "rgba(255,236,220,0.45)");
          gr.addColorStop(1, "rgba(255,236,220,0)");
          g.fillStyle = gr;
          g.fillRect(0, 0, 128, 128);
          g.fillStyle = "#fff3e4";
          g.beginPath();
          g.arc(64, 64, 30, 0, Math.PI * 2);
          g.fill();
          // (its seas: three flat patches)
          g.fillStyle = "#ecd2c8";
          for (const [x, y, r] of [
            [54, 57, 8],
            [75, 70, 6],
            [67, 46, 4],
          ]) {
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
          }
        }),
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    moon.scale.setScalar(112);
    moon.position.set(231, 63, -295);
    moon.lookAt(0, 10, 0);
    moon.renderOrder = -900;
    moon.raycast = () => {};
    moon.userData.noShadow = true;
    s.add(moon);
    // the snowfield: wind-blown drifts, their blue lee sides, sparkles (one tile of 20 m, seamless)
    const snowTex = canvasTex(
      512,
      512,
      (g) => {
        g.fillStyle = "#d3ddf1";
        g.fillRect(0, 0, 512, 512);
        const blob = (x: number, y: number, rx: number, ry: number, c: string, a: number) => {
          for (const ox of [-512, 0, 512])
            for (const oy of [-512, 0, 512]) {
              if (x + ox + rx < 0 || x + ox - rx > 512 || y + oy + ry < 0 || y + oy - ry > 512) continue;
              g.save();
              g.translate(x + ox, y + oy);
              g.scale(1, ry / rx);
              const gr = g.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
              gr.addColorStop(0, c.replace("A", String(a)));
              gr.addColorStop(1, c.replace("A", "0"));
              g.fillStyle = gr;
              g.fillRect(-rx, -rx, rx * 2, rx * 2);
              g.restore();
            }
        };
        for (let k = 0; k < 16; k++) {
          const x = R() * 512;
          const y = R() * 512;
          const rx = 70 + R() * 90;
          // (a drift: lit on its crest, blue in its lee)
          blob(x + rx * 0.2, y + rx * 0.16, rx, rx * 0.42, "rgba(150,170,220,A)", 0.3);
          blob(x, y, rx, rx * 0.4, "rgba(255,255,255,A)", 0.62);
        }
        for (let k = 0; k < 150; k++) {
          g.fillStyle = k % 5 ? "rgba(255,255,255,0.9)" : "rgba(190,205,240,0.7)";
          g.fillRect(Math.floor(R() * 510), Math.floor(R() * 510), 2, 2);
        }
      },
      true,
    );
    snowTex.repeat.set(45, 45);
    // (a shade cooler and darker than the rink and its deck: the evening's blue on the open snow, the warm light on the game)
    const snow = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: snowTex, color: "#bfcbea", emissive: "#1c2140", gradientMap: toonSteps() }));
    snow.rotation.x = -Math.PI / 2;
    snow.scale.set(900, 900, 1);
    snow.position.y = -0.86;
    s.add(snow);
    // the Sprout river, frozen, across the far side; the city beyond it, lit for the evening
    const river = new THREE.Mesh(GEO.plane, toon("#a9c9e6", "#1c2a4a"));
    river.rotation.x = -Math.PI / 2;
    river.scale.set(900, 26, 1);
    river.position.set(0, -0.84, -52);
    s.add(river);
    skyline(s, { r: 170, n: 80, y: -0.9, rnd: R, night: true, tall: 1.2 });
    const list: Box[] = [];
    // the NU7 TOWER: a white trunk of slender ribs flaring to a cradle round its green orb
    const tx = -30;
    const tz = -86;
    list.push({ x: tx, y: 1.2, z: tz, w: 14, h: 4, d: 14, c: "#e8ecf6" });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      for (let j = 0; j < 6; j++) {
        const y = 3 + j * 7.5;
        const r = 1.2 + Math.pow(j / 5, 2.2) * 3.4;
        list.push({ x: tx + Math.cos(a) * r, y: y + 3.75, z: tz + Math.sin(a) * r, w: 0.9, h: 7.8, d: 0.9, ry: -a, c: "#f6f8ff" });
      }
      // the cradle's fins
      list.push({ x: tx + Math.cos(a) * 4.9, y: 50.5, z: tz + Math.sin(a) * 4.9, w: 0.7, h: 6, d: 2.2, ry: -a, c: "#ffffff" });
    }
    // the ZK MALL: a great leaning cone, its spire; a dome, a few lit blocks by the river
    list.push({ x: 48, y: 4, z: -92, w: 46, h: 8, d: 30, c: "#6c6390" });
    list.push({ x: 8, y: 6, z: -70, w: 16, h: 12, d: 10, c: "#e7d9c4" });
    list.push({ x: -62, y: 9, z: -74, w: 12, h: 18, d: 12, c: "#c9d3ea" });
    s.add(boxes(list, toon("#ffffff")));
    const orb = new THREE.Mesh(GEO.ball, new THREE.MeshToonMaterial({ color: "#3ee08f", emissive: "#0f7a44", gradientMap: toonSteps() }));
    orb.scale.setScalar(8.6);
    orb.position.set(tx, 52.5, tz);
    s.add(orb);
    const halo = new THREE.Mesh(GEO.disc, glow("#8ff0bf", 0.28, true));
    halo.scale.setScalar(19);
    halo.position.set(tx, 52.5, tz - 4);
    s.add(halo);
    const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 22, 44, 28, 1), new THREE.MeshToonMaterial({ color: "#f1e2b8", emissive: "#5a4214", gradientMap: toonSteps() }));
    tent.position.set(48, 26, -96);
    tent.rotation.z = 0.12;
    s.add(tent);
    outline(tent, 0.25);
    // the winter market by the rink: round pavilions, their domed roofs in the festival's colours
    const yurts: [number, number, number, string][] = [
      [-23, -13, 1.2, "#ff6b35"],
      [-25, 2, 1.0, "#5fd4c4"],
      [-21, 12, 1.1, "#c4b1fc"],
      [23, -13, 1.15, "#c4b1fc"],
      [25, 2, 1.0, "#ff6b35"],
      [21, 12, 1.2, "#e8556a"],
    ];
    const wall = new THREE.InstancedMesh(GEO.cyl, toon("#f4ead8", "#2a2030"), yurts.length);
    const roof = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 16), toon("#ffffff", "#2a1a30"), yurts.length);
    const door = new THREE.InstancedMesh(GEO.box, glow("#ffc874"), yurts.length);
    yurts.forEach(([x, z, k, c], i) => {
      this.q.setFromAxisAngle(this.v2.set(0, 1, 0), Math.atan2(-x, -z));
      wall.setMatrixAt(i, this.m4.compose(this.v.set(x, -0.9 + 1.1 * k, z), this.q, this.sc.set(4.4 * k, 2.2 * k, 4.4 * k)));
      roof.setMatrixAt(i, this.m4.compose(this.v.set(x, -0.9 + 3.0 * k, z), this.q, this.sc.set(5.0 * k, 1.8 * k, 5.0 * k)));
      roof.setColorAt(i, this.col.set(c));
      // (the door turned to the rink, lit)
      door.setMatrixAt(i, this.m4.compose(this.v.set(x - Math.sign(x) * 2.2 * k, -0.9 + 0.8 * k, z), this.q.setFromAxisAngle(this.v2.set(0, 1, 0), Math.PI / 2), this.sc.set(1.0 * k, 1.5 * k, 0.1)));
    });
    for (const m of [wall, roof, door]) ((m.raycast = () => {}), s.add(m));
    // the pines round the park, snow on their tips (none in front of the play camera; a loose row behind it, for the shots that look back)
    const pines: [number, number, number, number][] = [];
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + R() * 0.12;
      const d = 30 + R() * 18;
      const x = Math.cos(a) * d * 1.25;
      const z = Math.sin(a) * d - 4;
      const k = 0.9 + R() * 0.7;
      const ry = R() * 3;
      if (z > 14 && Math.abs(x) < 30) continue;
      pines.push([x, z, k, ry]);
    }
    for (let i = 0; i < 13; i++) pines.push([-66 + i * 11 + R() * 5, 26 + R() * 30 + Math.abs(i - 6) * 1.5, 0.9 + R() * 0.8, R() * 3]);
    const nP = pines.length;
    const lo = new THREE.InstancedMesh(GEO.cone, toon("#2f6b52", "#0e2a22"), nP);
    const hi = new THREE.InstancedMesh(GEO.cone, toon("#3d8466", "#0e2a22"), nP);
    const cap = new THREE.InstancedMesh(GEO.cone, toon("#ffffff", "#3a4a6a"), nP);
    pines.forEach(([x, z, k, ry], i) => {
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), ry);
      lo.setMatrixAt(i, this.m4.compose(this.v.set(x, -0.9 + 2.6 * k, z), this.q, this.sc.set(4.6 * k, 5.6 * k, 4.6 * k)));
      hi.setMatrixAt(i, this.m4.compose(this.v.set(x, -0.9 + 5.6 * k, z), this.q, this.sc.set(3.3 * k, 4.4 * k, 3.3 * k)));
      cap.setMatrixAt(i, this.m4.compose(this.v.set(x, -0.9 + 7.4 * k, z), this.q, this.sc.set(1.6 * k, 1.6 * k, 1.6 * k)));
    });
    for (const m of [lo, hi, cap]) ((m.raycast = () => {}), s.add(m));
    // little festive pines along the near side, strung with bulbs
    const nN = 9;
    const small = new THREE.InstancedMesh(GEO.cone, toon("#2f7a5a", "#0e2a22"), nN * 2);
    const lights = new THREE.InstancedMesh(GEO.ball, glow("#ffffff"), nN * 5);
    const lc = ["#ffd18a", "#ff6b35", "#7fe3ff", "#c4b1fc", "#ff5fa2"];
    for (let i = 0; i < nN; i++) {
      const x = -17 + i * (34 / (nN - 1));
      const z = HD + 2.0 + (i % 2) * 0.6;
      const k = 0.48 + (i % 3) * 0.08;
      this.q.setFromAxisAngle(UP, i * 0.7);
      small.setMatrixAt(i * 2, this.m4.compose(this.v.set(x, -0.9 + 1.4 * k, z), this.q, this.sc.set(2.4 * k, 2.8 * k, 2.4 * k)));
      small.setMatrixAt(i * 2 + 1, this.m4.compose(this.v.set(x, -0.9 + 2.9 * k, z), this.q, this.sc.set(1.6 * k, 2.0 * k, 1.6 * k)));
      for (let j = 0; j < 5; j++) {
        const a = j * 1.9 + i;
        const h = 0.7 + j * 0.55;
        const r = (1.05 - j * 0.17) * k;
        lights.setMatrixAt(i * 5 + j, this.m4.compose(this.v.set(x + Math.cos(a) * r, -0.9 + h * k * 1.25, z + Math.sin(a) * r), this.q.identity(), this.sc.setScalar(0.16)));
        lights.setColorAt(i * 5 + j, this.col.set(lc[(i + j) % lc.length]));
      }
    }
    for (const m of [small, lights]) ((m.raycast = () => {}), s.add(m));
    // the lanterns on both ends and along the front, strings of bulbs between them
    const posts: Box[] = [];
    const heads: [number, number, number][] = [];
    const ends = HL + GD + 2.6;
    const at: [number, number][] = [
      [-ends, -9],
      [-ends, -2.5],
      [-ends, 4],
      [ends, -9],
      [ends, -2.5],
      [ends, 4],
    ];
    for (const [x, z] of at) {
      posts.push({ x, y: 1.0, z, w: 0.22, h: 3.8, d: 0.22, c: "#2c2a40" });
      posts.push({ x, y: 3.62, z, w: 0.86, h: 0.2, d: 0.86, c: "#2c2a40" });
      // (seen from above: snow on its cap, not a black square)
      posts.push({ x, y: 3.78, z, w: 0.74, h: 0.14, d: 0.74, c: "#f4f8ff" });
      heads.push([x, 3.2, z]);
    }
    s.add(boxes(posts, toon("#ffffff")));
    // each lantern's warm pool on the snow
    const pools = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: softTex(), color: "#ffb866", transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }), at.length);
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    at.forEach(([x, z], i) => pools.setMatrixAt(i, this.m4.compose(this.v.set(x, -0.8, z), flat, this.sc.set(7, 7, 1))));
    pools.raycast = () => {};
    pools.renderOrder = 1;
    s.add(pools);
    const lamp = new THREE.InstancedMesh(GEO.box, glow("#ffd18a"), heads.length);
    heads.forEach(([x, y, z], i) => lamp.setMatrixAt(i, this.m4.compose(this.v.set(x, y, z), this.q.identity(), this.sc.set(0.6, 0.66, 0.6))));
    lamp.raycast = () => {};
    s.add(lamp);
    const bulbs: [number, number, number][] = [];
    const string = (a: [number, number], b: [number, number]) => {
      for (let k = 1; k < 9; k++) {
        const u = k / 9;
        bulbs.push([a[0] + (b[0] - a[0]) * u, 3.3 - Math.sin(u * Math.PI) * 0.9, a[1] + (b[1] - a[1]) * u]);
      }
    };
    string(at[0], at[1]);
    string(at[1], at[2]);
    string(at[3], at[4]);
    string(at[4], at[5]);
    const bm = new THREE.InstancedMesh(GEO.ball, glow("#ffffff"), bulbs.length);
    const bc = ["#ffd18a", "#ff8a5c", "#a8e4ff", "#c4b1fc"];
    bulbs.forEach(([x, y, z], i) => {
      bm.setMatrixAt(i, this.m4.compose(this.v.set(x, y, z), this.q.identity(), this.sc.setScalar(0.2)));
      bm.setColorAt(i, this.col.set(bc[i % bc.length]));
    });
    bm.raycast = () => {};
    s.add(bm);
    // the bulbs twinkle, on the little pines and along the strings: a few dim at a time
    const sets: [THREE.InstancedMesh, THREE.Color[]][] = [
      [lights, Array.from({ length: nN * 5 }, (_, i) => new THREE.Color(lc[(Math.floor(i / 5) + (i % 5)) % lc.length]))],
      [bm, bulbs.map((_, i) => new THREE.Color(bc[i % bc.length]))],
    ];
    let wink = 0;
    this.ticks.push((dt, now) => {
      if ((wink -= dt) > 0) return;
      wink = 0.1;
      for (const [m, cs] of sets) {
        for (let i = 0; i < cs.length; i++) m.setColorAt(i, this.col.copy(cs[i]).multiplyScalar(Math.sin(now * 2.1 + i * 2.4) > -0.4 ? 1 : 0.3));
        m.instanceColor!.needsUpdate = true;
      }
    });
    this.astanaLife();
  }

  /** The park's festival round the rink: snowmen, the ⓩ sculpture carved in ice, bunting, smoke from the pavilions, fireworks over the river, the evening sun. */
  private astanaLife() {
    const s = this.w.scene;
    const R = rng(0xa57b);
    // snowmen by the snowbanks: two balls, a carrot, a hat, a scarf in a house's colour
    const men: [number, number, number][] = [
      [-17.6, -5, 1],
      [-18.6, 1.8, 0.85],
      [17.8, -4.2, 0.95],
      [18.4, 2.4, 0.8],
    ];
    const balls = new THREE.InstancedMesh(GEO.ball, toon("#ffffff", "#2a3050"), men.length * 2);
    const noses = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 8), toon("#ff7a2a", "#3a1404"), men.length);
    const hats = new THREE.InstancedMesh(GEO.cyl, toon("#2a2440"), men.length * 2);
    const scarves = new THREE.InstancedMesh(GEO.cyl, toon("#ffffff"), men.length);
    men.forEach(([x, z, k], i) => {
      const face = Math.atan2(-x, 8 - z);
      this.q.setFromAxisAngle(UP, face);
      balls.setMatrixAt(i * 2, this.m4.compose(this.v.set(x, -0.9 + 0.95 * k, z), this.q, this.sc.setScalar(2.0 * k)));
      balls.setMatrixAt(i * 2 + 1, this.m4.compose(this.v.set(x, -0.9 + 2.45 * k, z), this.q, this.sc.setScalar(1.35 * k)));
      this.v2.set(0, 0, 0.75 * k).applyQuaternion(this.q);
      this.q2.setFromAxisAngle(this.v.set(1, 0, 0), Math.PI / 2).premultiply(this.q);
      noses.setMatrixAt(i, this.m4.compose(this.v.set(x + this.v2.x, -0.9 + 2.45 * k, z + this.v2.z), this.q2, this.sc.set(0.22 * k, 0.6 * k, 0.22 * k)));
      hats.setMatrixAt(i * 2, this.m4.compose(this.v.set(x, -0.9 + 3.35 * k, z), this.q, this.sc.set(0.8 * k, 0.75 * k, 0.8 * k)));
      hats.setMatrixAt(i * 2 + 1, this.m4.compose(this.v.set(x, -0.9 + 3.0 * k, z), this.q, this.sc.set(1.2 * k, 0.08 * k, 1.2 * k)));
      scarves.setMatrixAt(i, this.m4.compose(this.v.set(x, -0.9 + 1.85 * k, z), this.q, this.sc.set(1.3 * k, 0.24 * k, 1.3 * k)));
      scarves.setColorAt(i, this.col.set(this.house[x < 0 ? 0 : 1].color));
    });
    for (const m of [balls, noses, hats, scarves]) ((m.raycast = () => {}), s.add(m));
    // the ⓩ sculpture in ice at the far corners: a ring, the Z (two bars, the diagonal) and its two ticks, on a block
    const iceMat = new THREE.MeshToonMaterial({ color: "#bfe9ff", emissive: "#2a6a9a", transparent: true, opacity: 0.88, gradientMap: toonSteps() });
    const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(1.5, 0.36, 10, 30), iceMat, 2);
    const ZB: [number, number, number, number][] = [
      [1.49, 0.36, 0.59, 0],
      [1.49, 0.36, -0.59, 0],
      [1.62, 0.34, 0, Math.atan2(1.18, 1.125)],
      [0.3, 0.27, 0.9, 0],
      [0.3, 0.27, -0.9, 0],
    ];
    const cube = new THREE.InstancedMesh(GEO.box, iceMat, 2 + 2 * ZB.length);
    const zAx = new THREE.Vector3(0, 0, 1);
    [-1, 1].forEach((sx, i) => {
      const x = sx * 19.5;
      const z = -11.5;
      this.q.setFromAxisAngle(UP, -sx * 0.5);
      ring.setMatrixAt(i, this.m4.compose(this.v.set(x, 2.2, z), this.q, this.sc.setScalar(1)));
      ZB.forEach(([w, h, y, rz], j) => {
        this.q2.setFromAxisAngle(zAx, rz).premultiply(this.q);
        cube.setMatrixAt(2 + i * ZB.length + j, this.m4.compose(this.v.set(x, 2.2 + y, z), this.q2, this.sc.set(w, h, 0.5)));
      });
      cube.setMatrixAt(i, this.m4.compose(this.v.set(x, -0.3, z), this.q, this.sc.set(3.6, 1.2, 2.2)));
    });
    for (const m of [ring, cube]) ((m.raycast = () => {}), s.add(m));
    // bunting along the stand's back and over both ends, in the festival's colours
    const flags: [number, number, number, number][] = [];
    const run = (x0: number, z0: number, x1: number, z1: number, y: number, n: number) => {
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        flags.push([x0 + (x1 - x0) * u, y - Math.sin(u * Math.PI) * 0.7, z0 + (z1 - z0) * u, Math.atan2(-(z1 - z0), x1 - x0)]);
      }
    };
    const ends = HL + GD + 2.6;
    run(-ends, -9, -ends, 4, 3.4, 12);
    run(ends, -9, ends, 4, 3.4, 12);
    const bunt = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 3), toon("#ffffff", "#201830"), flags.length);
    const bc = ["#ff6b35", "#5fd4c4", "#ffd23f", "#c4b1fc", "#e8556a"];
    flags.forEach(([x, y, z, ry], i) => {
      this.q.setFromEuler(this.eu.set(Math.PI, ry, 0));
      bunt.setMatrixAt(i, this.m4.compose(this.v.set(x, y - 0.25, z), this.q, this.sc.set(0.55, 0.6, 0.12)));
      bunt.setColorAt(i, this.col.set(bc[i % bc.length]));
    });
    bunt.raycast = () => {};
    s.add(bunt);
    const yurts = [
      [-23, -13, 1.2],
      [-25, 2, 1.0],
      [-21, 12, 1.1],
      [23, -13, 1.15],
      [25, 2, 1.0],
      [21, 12, 1.2],
    ];
    const fwC = [
      ["#ff6b35", "#ffd23f", "#ffffff"],
      ["#c4b1fc", "#ffffff", "#7fe3ff"],
      ["#5fd4c4", "#ffffff", "#ffd23f"],
    ];
    let puff = 0;
    this.ticks.push((dt) => {
      // smoke curling from the pavilions' crowns
      if ((puff -= dt) <= 0) {
        puff = 0.15 + R() * 0.2;
        const [x, z, k] = yurts[Math.floor(R() * yurts.length)];
        this.fx.burst(this.v.set(x, -0.9 + 3.9 * k, z), 1, ["#e8e4f0", "#cfc9de"], { speed: 0.3, up: 1.6, gravity: -0.6, size: 0.55, life: 2.2, drag: 0.6 });
      }
      // fireworks over the river and beyond the stand
      this.fwT -= dt;
      if (this.fwT <= 0) {
        this.fwT = 1.4 + R() * 2.2;
        const far = R() < 0.6;
        this.fx.burst(this.v.set((R() - 0.5) * (far ? 120 : 40), far ? 30 + R() * 18 : 12 + R() * 6, far ? -70 - R() * 30 : -24 - R() * 6), far ? 40 : 26, fwC[Math.floor(R() * 3)], { speed: far ? 14 : 7, up: 2, gravity: 4, size: far ? 0.7 : 0.3, life: 1.4 });
      }
    });
  }

  /** Marina Bay at night from a hotel's roof deck: the deck running on past the pitch over three towers, the city and the bay far below, light-trees glowing beyond the pool. */
  private buildMarina() {
    const s = this.w.scene;
    const R = rng(0x3a71);
    // the night all round: stars, the milky band, clouds lit from below by the city, the moon low over the far side
    // (where the card's flight and the intro look; the pitch's own light is its floodlights')
    skyDome(s, { sky: ["#0a0c2c", "#4c2b74"], stars: 650, band: true, clouds: 16, cloud: "#7d60b6", cloudShade: "#3b2a68", disc: { az: 250, el: 17, moon: true, size: 7 }, haze: 0.3, rnd: R });
    this.w.hemi.color.set("#cfc6ff");
    this.w.hemi.groundColor.set("#3a2a5a");
    this.w.hemi.intensity = 2.0;
    this.w.sun.color.set("#eef2ff");
    this.w.sun.intensity = 1.7;
    this.w.sun.position.set(12, 40, 30);
    const rim = new THREE.DirectionalLight("#ff6ad5", 0.7);
    rim.position.set(0, 12, -30);
    s.add(rim, rim.target);
    // the deck past the pitch, its long stone edge; the towers under it, windows lit
    const list: Box[] = [];
    const planks = canvasTex(
      128,
      128,
      (g) => {
        for (let k = 0; k < 8; k++) {
          g.fillStyle = ["#5a3d3a", "#4e3434", "#634440", "#553a38"][k % 4];
          g.fillRect(0, k * 16, 128, 16);
          g.fillStyle = "rgba(20,10,20,0.45)";
          g.fillRect(0, k * 16 + 14, 128, 2);
          g.fillRect((k * 45) % 128, k * 16, 2, 16);
        }
      },
      true,
    );
    planks.repeat.set(70, 12);
    const deck = new THREE.Mesh(GEO.box, new THREE.MeshToonMaterial({ map: planks, gradientMap: toonSteps() }));
    deck.scale.set(140, 1.0, 23);
    deck.position.set(0, -1.2, -4.5);
    s.add(deck);
    list.push({ x: 0, y: -0.74, z: HD - 0.2, w: 140, h: 0.12, d: 0.5, c: "#ffd23f" });
    // loungers and parasols along the deck's ends
    for (const sx of [-1, 1])
      for (let k = 0; k < 5; k++) {
        const x = sx * (22 + k * 6.5);
        list.push({ x, y: -0.45, z: -2, w: 1.1, h: 0.35, d: 2.4, c: "#f1e9dc" });
        list.push({ x: x + sx * 1.8, y: 1.0, z: -4, w: 0.14, h: 3.2, d: 0.14, c: "#e9e2f2" });
        list.push({ x: x + sx * 1.8, y: 2.6, z: -4, w: 3.2, h: 0.3, d: 3.2, c: k % 2 ? "#ff6b35" : "#c4b1fc" });
      }
    s.add(boxes(list, toon("#ffffff")));
    const win = canvasTex(
      64,
      128,
      (g) => {
        g.fillStyle = "#2a2850";
        g.fillRect(0, 0, 64, 128);
        for (let y = 4; y < 128; y += 8)
          for (let x = 3; x < 64; x += 8) {
            g.fillStyle = R() < 0.6 ? (R() < 0.7 ? "#ffe3a8" : "#bfe6ff") : "#3a3668";
            g.fillRect(x, y, 5, 5);
          }
      },
      true,
    );
    win.repeat.set(3, 18);
    const towerMat = new THREE.MeshToonMaterial({ map: win, emissiveMap: win, emissive: "#ffffff", emissiveIntensity: 0.55, gradientMap: toonSteps() });
    const towers = new THREE.InstancedMesh(GEO.box, towerMat, 3);
    [-46, 0, 46].forEach((x, i) => towers.setMatrixAt(i, this.m4.compose(this.v.set(x, -76, -5), this.q.setFromAxisAngle(this.v2.set(0, 1, 0), 0), this.sc.set(18, 150, 13))));
    towers.raycast = () => {};
    s.add(towers);
    // the city far below, the bay's dark water with the lights on it
    skyline(s, { r: 200, n: 90, y: -150, rnd: R, night: true, tall: 1.8 });
    skyline(s, { r: 130, n: 50, y: -150, rnd: R, night: true, tall: 2.6 });
    // (the district's tall ones, far off: they stand over the deck's level, so every horizon has lit towers in the haze)
    skyline(s, { r: 235, n: 72, y: -150, rnd: R, night: true, tall: 3.6 });
    // the low stars, between the towers (the dome's own fade out in the horizon's haze)
    const st = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#e4e8ff", fog: false }), 110);
    for (let i = 0; i < 110; i++) {
      const a = R() * Math.PI * 2;
      const e = 0.07 + R() * 0.55;
      this.q.setFromEuler(this.eu.set(R() * 3, R() * 3, 0));
      st.setMatrixAt(i, this.m4.compose(this.v.set(Math.cos(a) * Math.cos(e) * 330, Math.sin(e) * 330, Math.sin(a) * Math.cos(e) * 330), this.q, this.sc.setScalar(0.5 + R() * R() * 1.1)));
    }
    st.raycast = () => {};
    st.frustumCulled = false;
    st.userData.noShadow = true;
    s.add(st);
    const bay = new THREE.Mesh(
      GEO.plane,
      new THREE.MeshBasicMaterial({
        map: canvasTex(256, 256, (g) => {
          g.fillStyle = "#0d1238";
          g.fillRect(0, 0, 256, 256);
          for (let k = 0; k < 90; k++) {
            g.fillStyle = ["rgba(255,210,140,0.5)", "rgba(160,220,255,0.45)", "rgba(255,120,210,0.4)"][k % 3];
            g.fillRect(R() * 256, R() * 256, 2 + R() * 10, 1.5);
          }
        }),
      }),
    );
    bay.rotation.x = -Math.PI / 2;
    bay.scale.set(1200, 1200, 1);
    bay.position.y = -150;
    s.add(bay);
    // the infinity pool behind the far stand, glowing
    const pool = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#38d6e8", transparent: true, opacity: 0.85 }));
    pool.scale.set(70, 0.2, 2.8);
    pool.position.set(0, -0.62, -(HD + 7.0));
    s.add(pool);
    // the light-trees beyond it: trunks, glowing canopies
    const trees: [number, number, number][] = [
      [-30, -24, 16],
      [-13, -26, 20],
      [13, -26, 18],
      [30, -24, 15],
      [-48, -40, 22],
      [48, -40, 21],
    ];
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 2.2, 1, 10), toon("#5a3f86", "#1c0f30"), trees.length);
    const crown = new THREE.InstancedMesh(new THREE.CylinderGeometry(5.6, 1.2, 1, 14, 1, true), new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide }), trees.length);
    const cc = ["#ff5fd2", "#4fe3ff", "#c4b1fc", "#ff9a4a", "#4fe3ff", "#ff5fd2"];
    trees.forEach(([x, z, h], i) => {
      const y0 = -40;
      trunk.setMatrixAt(i, this.m4.compose(this.v.set(x, (y0 + h) / 2, z), this.q.identity(), this.sc.set(1, h - y0, 1)));
      crown.setMatrixAt(i, this.m4.compose(this.v.set(x, h + 1.4, z), this.q.identity(), this.sc.set(1, 2.8, 1)));
      crown.setColorAt(i, this.col.set(cc[i]));
    });
    for (const m of [trunk, crown]) ((m.raycast = () => {}), s.add(m));
    this.marinaLife(pool, crown, cc);
  }

  /** The roof's night: palms on the deck, searchlights sweeping, a drone show drawing a ⓩ, traffic and boats far below, the towers' beacons, the light-trees breathing, the pool shimmering. */
  private marinaLife(pool: THREE.Mesh, crown: THREE.InstancedMesh, cc: string[]) {
    const s = this.w.scene;
    const R = rng(0x3a72);
    // palms in planters along the deck past the goals
    const palms: [number, number][] = [
      [-17.2, -9],
      [-17.6, -2],
      [-17.2, 5],
      [17.2, -9],
      [17.6, -2],
      [17.2, 5],
    ];
    const pots = new THREE.InstancedMesh(GEO.box, toon("#e9e2f2", "#1c1430"), palms.length);
    const trunks = new THREE.InstancedMesh(GEO.cyl, toon("#a8744a", "#2a1608"), palms.length);
    const fronds = new THREE.InstancedMesh(GEO.box, toon("#3fbf6e", "#0c2a18"), palms.length * 6);
    palms.forEach(([x, z], i) => {
      pots.setMatrixAt(i, this.m4.compose(this.v.set(x, -0.2, z), this.q.identity(), this.sc.set(1.2, 0.9, 1.2)));
      this.q.setFromAxisAngle(this.v2.set(0, 0, 1), Math.sign(x) * 0.08);
      trunks.setMatrixAt(i, this.m4.compose(this.v.set(x + Math.sign(x) * 0.15, 1.9, z), this.q, this.sc.set(0.32, 3.6, 0.32)));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + i;
        this.q.setFromEuler(this.eu.set(0, -a, 0.45));
        this.q2.setFromAxisAngle(UP, -a);
        this.v2.set(1.0, 0, 0).applyQuaternion(this.q2);
        fronds.setMatrixAt(i * 6 + k, this.m4.compose(this.v.set(x + Math.sign(x) * 0.3 + this.v2.x, 3.55, z + this.v2.z), this.q, this.sc.set(2.1, 0.08, 0.55)));
      }
    });
    for (const m of [pots, trunks, fronds]) ((m.raycast = () => {}), s.add(m));
    // neon trim along the deck's far edge
    block("#c4b1fc", 140, 0.1, 0.12, 0, -0.66, -15.95, s, glow("#c4b1fc"));
    // searchlights from the deck's ends, sweeping the clouds
    const beamMat = new THREE.MeshBasicMaterial({ color: "#d8ecff", transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const beamGeo = new THREE.ConeGeometry(4, 120, 18, 1, true).translate(0, -60, 0);
    const beams: THREE.Mesh[] = [];
    for (const x of [-62, 62, 0]) {
      const b = new THREE.Mesh(beamGeo, beamMat);
      b.position.set(x, x === 0 ? -6 : 0, x === 0 ? -40 : -8);
      s.add(b);
      beams.push(b);
    }
    // the drone show: the ⓩ (a ring; the Z's two bars, its diagonal, a tick above and below), twinkling high over the bay
    const nD = 72;
    const zDots: [number, number][] = [];
    for (let k = 0; k < 7; k++) zDots.push([-6 + k * 2, 6.3], [-6 + k * 2, -6.3]);
    for (let k = 1; k < 6; k++) zDots.push([6 - k * 2, 6.3 - k * 2.1]);
    zDots.push([0, 8.4], [0, 10.4], [0, -8.4], [0, -10.4]);
    const nRing = nD - zDots.length;
    const drones = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), nD);
    for (let i = 0; i < nD; i++) {
      let x: number;
      let y: number;
      if (i < nRing) {
        const a = (i / nRing) * Math.PI * 2;
        x = Math.cos(a) * 16;
        y = Math.sin(a) * 16;
      } else [x, y] = zDots[i - nRing];
      drones.setMatrixAt(i, this.m4.compose(this.v.set(x, 70 + y, -170), this.q.identity(), this.sc.setScalar(1.1)));
    }
    drones.raycast = () => {};
    drones.frustumCulled = false;
    s.add(drones);
    // traffic far below: headlights and tail lights along the streets
    const nT = 64;
    const cars = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), nT);
    const lane: { x: number; z: number; dx: number; dz: number; v: number }[] = [];
    for (let i = 0; i < nT; i++) {
      const alongX = i % 2 === 0;
      const st = (Math.floor(i / 2) % 8) - 3.5;
      const dir = i % 4 < 2 ? 1 : -1;
      lane.push({ x: alongX ? (R() - 0.5) * 300 : st * 22 + dir * 1.2, z: alongX ? st * 20 + 10 + dir * 1.2 : (R() - 0.5) * 300, dx: alongX ? dir : 0, dz: alongX ? 0 : dir, v: 9 + R() * 6 });
      cars.setColorAt(i, this.col.set(dir > 0 ? "#fff1c8" : "#ff4040"));
    }
    cars.raycast = () => {};
    cars.frustumCulled = false;
    s.add(cars);
    // boats on the bay, their lights and wakes
    const nBo = 7;
    const hulls = new THREE.InstancedMesh(GEO.box, toon("#f2efe8", "#2a2440"), nBo);
    const lamps = new THREE.InstancedMesh(GEO.ball, glow("#ffd28a"), nBo);
    const boat: { x: number; z: number; v: number }[] = [];
    for (let i = 0; i < nBo; i++) boat.push({ x: (R() - 0.5) * 220, z: 40 + R() * 60, v: (R() < 0.5 ? -1 : 1) * (3 + R() * 3) });
    for (const m of [hulls, lamps]) ((m.raycast = () => {}), (m.frustumCulled = false), s.add(m));
    // the towers' beacons (and the deck's ends)
    const bea = new THREE.InstancedMesh(GEO.ball, glow("#ff3b4f"), 5);
    [
      [-70, 0.2, -4],
      [70, 0.2, -4],
      [-46, -0.6, 2],
      [46, -0.6, 2],
      [0, 0.4, -15.6],
    ].forEach(([x, y, z], i) => bea.setMatrixAt(i, this.m4.compose(this.v.set(x, y, z), this.q.identity(), this.sc.setScalar(0.6))));
    bea.raycast = () => {};
    s.add(bea);
    const poolMat = pool.material as THREE.MeshBasicMaterial;
    const crownC = cc.map((c) => new THREE.Color(c));
    this.ticks.push((dt, now) => {
      beams.forEach((b, i) => {
        b.rotation.set(Math.PI + Math.sin(now * 0.31 + i * 2.1) * 0.5, 0, Math.cos(now * 0.23 + i * 1.3) * 0.6);
      });
      for (let i = 0; i < nD; i++) {
        const tw = 0.5 + 0.5 * Math.sin(now * 3 + i * 0.7);
        this.col.set(i < nRing ? "#7fe3ff" : "#f4b728").multiplyScalar(0.55 + 0.45 * tw);
        drones.setColorAt(i, this.col);
      }
      drones.instanceColor!.needsUpdate = true;
      for (let i = 0; i < nT; i++) {
        const c = lane[i];
        c.x += c.dx * c.v * dt;
        c.z += c.dz * c.v * dt;
        if (c.x > 150) c.x -= 300;
        if (c.x < -150) c.x += 300;
        if (c.z > 150) c.z -= 300;
        if (c.z < -150) c.z += 300;
        cars.setMatrixAt(i, this.m4.compose(this.v.set(c.x, -149.4, c.z), this.q.identity(), this.sc.set(c.dx ? 2.2 : 0.9, 0.6, c.dz ? 2.2 : 0.9)));
      }
      cars.instanceMatrix.needsUpdate = true;
      boat.forEach((b, i) => {
        b.x += b.v * dt;
        if (b.x > 120) b.x -= 240;
        if (b.x < -120) b.x += 240;
        this.q.identity();
        hulls.setMatrixAt(i, this.m4.compose(this.v.set(b.x, -149.5, b.z), this.q, this.sc.set(7, 1.2, 2.4)));
        lamps.setMatrixAt(i, this.m4.compose(this.v.set(b.x, -148.4, b.z), this.q, this.sc.setScalar(1.2)));
      });
      hulls.instanceMatrix.needsUpdate = true;
      lamps.instanceMatrix.needsUpdate = true;
      bea.visible = Math.floor(now * 1.2) % 2 === 0;
      for (let i = 0; i < crownC.length; i++) {
        this.col.copy(crownC[i]).lerp(crownC[(i + 1) % crownC.length], 0.5 + 0.5 * Math.sin(now * 0.8 + i));
        crown.setColorAt(i, this.col);
      }
      crown.instanceColor!.needsUpdate = true;
      poolMat.color.setHSL(0.52 + Math.sin(now * 0.7) * 0.02, 0.75, 0.55 + Math.sin(now * 2.1) * 0.05);
    });
  }

  private buildPitch() {
    const P = this.pitch;
    const [L, R] = this.house;
    const side = (x: number) => (x < 0 ? L : R);
    const lv = this.L;
    // the pitch's surface
    const grass = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: pitchTex(L, R, lv), gradientMap: toonSteps() }));
    grass.rotation.x = -Math.PI / 2;
    grass.scale.set(2 * HL, 2 * HD, 1);
    P.add(grass);
    // the slab it lies on (a rim round it, room for the stand behind); in the sky, the island under it
    const list: Box[] = [];
    const sx = HL + GD + 0.9;
    const z0 = -(HD + 5.6);
    const z1 = lv.open ? HD + 0.02 : HD + 1.3;
    const rim = lv.key === "astana" ? ["#b07a4c", "#7a5032"] : lv.key === "marina" ? ["#4a4466", "#a8714a"] : ["#f3e7cc", "#6fcf4c"];
    list.push({ x: 0, y: -0.36, z: (z0 + z1) / 2, w: sx * 2, h: 0.7, d: z1 - z0, c: rim[0] });
    list.push({ x: 0, y: -0.78, z: (z0 + z1) / 2, w: sx * 2 + 0.3, h: 0.16, d: z1 - z0 + (lv.open ? 0 : 0.3), c: rim[1] });
    if (lv.key === "sky") {
      const tiers: [number, number, string][] = [
        [1.0, -1.5, "#b5793f"],
        [0.82, -2.9, "#9b6332"],
        [0.62, -4.3, "#83512a"],
        [0.42, -5.6, "#6b4223"],
        [0.22, -6.7, "#573519"],
      ];
      for (const [k, y, c] of tiers) list.push({ x: 0, y, z: (z0 + z1) / 2, w: sx * 2 * k, h: 1.5, d: (z1 - z0) * k, c });
      // hanging lumps and grass tufts round the rim
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const x = Math.cos(a) * sx * 0.95;
        const z = (z0 + z1) / 2 + Math.sin(a) * (z1 - z0) * 0.47;
        const s2 = 0.8 + ((i * 37) % 7) * 0.18;
        list.push({ x, y: -1.4 - s2 * 0.6, z, w: s2 * 1.6, h: s2 * 1.4, d: s2 * 1.5, ry: a, c: i % 3 ? "#a86c38" : "#7a4a24" });
        if (i % 2) list.push({ x: x * 1.01, y: -0.45, z: z * 1.01, w: 0.9, h: 0.5, d: 0.9, ry: a, c: "#5fbf3e" });
      }
    } else if (lv.key === "astana") {
      // snowbanks heaped round the rink
      for (let i = 0; i < 34; i++) {
        const a = (i / 34) * Math.PI * 2;
        const x = Math.cos(a) * (sx + 1.6);
        const z = (z0 + z1) / 2 + Math.sin(a) * ((z1 - z0) / 2 + 1.8);
        if (z > HD && Math.abs(x) < sx - 1) continue;
        const s2 = 0.7 + ((i * 37) % 7) * 0.12;
        list.push({ x, y: -0.6 + s2 * 0.3, z, w: s2 * 2.0, h: s2 * 0.8, d: s2 * 1.5, ry: a, c: i % 3 ? "#f7faff" : "#d6e2f3" });
      }
    }
    // the barriers: low walls in the house's colour of their half, a white rail on top (none on an open front)
    const wall: Box[] = [];
    const t = 0.6;
    const piece = (x0: number, z0b: number, x1: number, z1b: number, out: number) => {
      // a wall from (x0,z0b) to (x1,z1b), pushed `out` away from the pitch along its normal
      const mx = (x0 + x1) / 2;
      const mz = (z0b + z1b) / 2;
      const len = Math.hypot(x1 - x0, z1b - z0b);
      let nx = -(z1b - z0b) / len;
      let nz = (x1 - x0) / len;
      if (nx * mx + nz * mz < 0) ((nx = -nx), (nz = -nz));
      const ry = Math.atan2(-(z1b - z0b), x1 - x0);
      const hs = side(mx);
      wall.push({ x: mx + nx * out, y: WALL / 2 - 0.08, z: mz + nz * out, w: len + 0.25, h: WALL - 0.16, d: t, ry, c: hs.deep });
      wall.push({ x: mx + nx * out, y: WALL - 0.08, z: mz + nz * out, w: len + 0.32, h: 0.18, d: t + 0.1, ry, c: lv.key === "astana" ? "#f4f8ff" : "#ffffff" });
    };
    const c = lv.shape === "rect" ? 0 : lv.corner;
    const a = HL - c;
    const b = HD - c;
    for (const sz of [-1, 1]) {
      if (sz > 0 && lv.open) continue;
      piece(-a, sz * HD, 0, sz * HD, t / 2);
      piece(0, sz * HD, a, sz * HD, t / 2);
    }
    for (const sx2 of [-1, 1]) {
      piece(sx2 * HL, -b, sx2 * HL, -GW, t / 2);
      piece(sx2 * HL, GW, sx2 * HL, b, t / 2);
      for (const sz of [-1, 1]) {
        if (lv.shape === "cut") piece(sx2 * a, sz * HD, sx2 * HL, sz * b, t / 2);
        else if (lv.shape === "round") {
          // the rounded corner, in short straight boards round its arc
          const N = 6;
          for (let k = 0; k < N; k++) {
            const u0 = (k / N) * (Math.PI / 2);
            const u1 = ((k + 1) / N) * (Math.PI / 2);
            piece(sx2 * (a + Math.sin(u0) * c), sz * (b + Math.cos(u0) * c), sx2 * (a + Math.sin(u1) * c), sz * (b + Math.cos(u1) * c), t / 2);
          }
        }
      }
    }
    const wallMesh = boxes(wall, toon("#ffffff"));
    P.add(wallMesh);
    P.add(boxes(wall, new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide }), 0.035));
    P.add(boxes(list, toon("#ffffff")));
    // the far wall's boards: the cup, the two houses
    const boards: [string, number][] = [
      [T("Z-BALL CUP", "Z球杯"), 0],
      [T(L.en, L.zh), -HL / 2 - 0.6],
      [T(R.en, R.zh), HL / 2 + 0.6],
    ];
    for (const [s2, x] of boards) {
      const lb = label(s2, 0.55, "#ffffff");
      lb.position.set(x, WALL * 0.45, -HD + 0.02);
      P.add(lb);
    }
    // the goals: posts and bar in the keeper's house, a net, a glowing line, a sign over it
    const net = new THREE.MeshBasicMaterial({ map: netTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
    for (const sg of [-1, 1]) {
      const hs = side(sg);
      const x0 = sg * HL;
      const x1 = sg * (HL + GD);
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(GEO.cyl, toon("#ffffff"));
        post.scale.set(POST * 2, GH, POST * 2);
        post.position.set(x0, GH / 2, sz * GW);
        outline(post, 0.04);
        P.add(post);
      }
      const bar = new THREE.Mesh(GEO.box, toon(hs.deep));
      bar.scale.set(0.34, 0.34, GW * 2 + 0.34);
      bar.position.set(x0, GH, 0);
      outline(bar, 0.04);
      P.add(bar);
      const back = GH * 0.8;
      const ng = quads(
        [
          [
            [x1, 0, -GW],
            [x1, 0, GW],
            [x1, back, GW],
            [x1, back, -GW],
          ],
          [
            [x0, GH, -GW],
            [x0, GH, GW],
            [x1, back, GW],
            [x1, back, -GW],
          ],
          [
            [x0, 0, -GW],
            [x1, 0, -GW],
            [x1, back, -GW],
            [x0, GH, -GW],
          ],
          [
            [x0, 0, GW],
            [x1, 0, GW],
            [x1, back, GW],
            [x0, GH, GW],
          ],
        ],
        0.45,
      );
      const nm = new THREE.Mesh(ng, net);
      P.add(nm);
      this.nets.push({ m: nm, x0, k: 0 });
      // inside: a darker floor, the frame's back bars
      const floor = block(lv.key === "astana" ? "#c9dcef" : lv.key === "marina" ? "#24786a" : "#3f9a35", GD, 0.06, GW * 2, sg * (HL + GD / 2), 0.0, 0, P);
      floor.position.y = -0.02;
      const line = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ color: hs.color, transparent: true, opacity: 0.85, depthWrite: false }));
      line.rotation.x = -Math.PI / 2;
      line.scale.set(0.32, GW * 2, 1);
      line.position.set(x0, 0.03, 0);
      P.add(line);
      this.goalGlow.push(line);
      const sign = label(T(hs.en, hs.zh), 1.05, "#ffffff", hs.deep);
      sign.position.set(sg * (HL + GD * 0.45), GH + 1.25, 0);
      sign.rotation.x = -0.3;
      P.add(sign);
    }
    // the corner flags
    const flagList: Box[] = [];
    const poles: Box[] = [];
    for (const fx of [-1, 1])
      for (const fz of [-1, 1]) {
        // (a rounded corner: on its arc)
        const x = lv.shape === "round" ? fx * (a + (c - 0.6) * Math.SQRT1_2) : fx * (HL - 0.45);
        const z = lv.shape === "round" ? fz * (b + (c - 0.6) * Math.SQRT1_2) : fz * (HD - 0.45);
        poles.push({ x, y: 1.0, z, w: 0.1, h: 2.0, d: 0.1, c: "#ffffff" });
        flagList.push({ x: x - fx * 0.32, y: 1.75, z, w: 0.6, h: 0.42, d: 0.05, c: side(fx).deep });
      }
    P.add(boxes(poles, toon("#ffffff")));
    this.flags = boxes(flagList, toon("#ffffff"));
    P.add(this.flags);
    // the floodlights at the slab's corners, turned on the pitch
    const lp: Box[] = [];
    const lh: Box[] = [];
    const lg: Box[] = [];
    for (const fx of [-1, 1])
      for (const fz of [-1, 1]) {
        const x = fx * (HL + GD + 0.2);
        const z = fz < 0 ? -(HD + 5.0) : lv.open ? HD - 0.4 : HD + 0.7;
        const ry = Math.atan2(-x, -z) + Math.PI;
        const hgt = fz < 0 ? 11 : 8;
        lp.push({ x, y: hgt / 2, z, w: 0.35, h: hgt, d: 0.35, c: "#e8ecf4" });
        lh.push({ x, y: hgt + 0.6, z, w: 2.6, h: 1.5, d: 0.5, ry, c: "#3a3f5c" });
        lg.push({ x: x - Math.sin(ry) * 0.27, y: hgt + 0.6, z: z - Math.cos(ry) * 0.27, w: 2.3, h: 1.2, d: 0.05, ry, c: lv.key === "astana" ? "#ffd59a" : lv.key === "marina" ? "#e6f6ff" : "#fff8d0" });
      }
    // (thin masts: their shadows would only be bars across the goal mouths)
    for (const m of [boxes(lp, toon("#ffffff")), boxes(lh, toon("#ffffff"))]) ((m.userData.noShadow = true), P.add(m));
    P.add(boxes(lg, glow("#ffffff")));
    // (in the evening and at night the floodlights have a halo, turned to the camera)
    if (lv.key !== "sky") {
      const halo = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: softTex(), color: lv.key === "astana" ? "#ffcf8a" : "#cfe8ff", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }), lg.length);
      halo.frustumCulled = false;
      halo.raycast = () => {};
      halo.renderOrder = 6;
      P.add(halo);
      const at = lg.map((b) => new THREE.Vector3(b.x, b.y, b.z));
      this.ticks.push((_dt, now) => {
        at.forEach((p, i) => halo.setMatrixAt(i, this.m4.compose(p, this.w.camera.quaternion, this.sc.setScalar(5.5 + Math.sin(now * 2 + i) * 0.25))));
        halo.instanceMatrix.needsUpdate = true;
      });
    }
    // the bumpers (down until their time): pink posts, a glowing cap; their warning rings
    this.bumpBody = new THREE.InstancedMesh(GEO.cyl, toon("#ff5fa2", "#4a0f2a"), 4);
    this.bumpInk = new THREE.InstancedMesh(GEO.cyl, new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide }), 4);
    this.bumpBand = new THREE.InstancedMesh(GEO.cyl, toon("#ffffff"), 4);
    this.bumpCap = new THREE.InstancedMesh(GEO.cyl, glow("#ffe14d"), 4);
    this.bumpRingMat = new THREE.MeshBasicMaterial({ color: "#ff4f8f", transparent: true, opacity: 0, depthWrite: false });
    this.bumpRing = new THREE.InstancedMesh(GEO.ring, this.bumpRingMat, 4);
    for (const m of [this.bumpBody, this.bumpInk, this.bumpBand, this.bumpCap, this.bumpRing]) {
      m.raycast = () => {};
      P.add(m);
    }
    BUMPS.forEach(([x, z], i) => {
      this.q.setFromAxisAngle(this.v.set(1, 0, 0), -Math.PI / 2);
      this.bumpRing.setMatrixAt(i, this.m4.compose(this.v.set(x, 0.04, z), this.q, this.sc.set(BUMP_R * 2.6, BUMP_R * 2.6, 1)));
    });
    this.bumpRing.renderOrder = 3;
    this.placeBumpers(0);
    // the tilt's arrows
    this.arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex(), transparent: true, opacity: 0, depthWrite: false });
    this.arrows = new THREE.Group();
    const ap = new THREE.Mesh(GEO.plane, this.arrowMat);
    ap.rotation.x = -Math.PI / 2;
    ap.scale.set(12, 6, 1);
    ap.position.y = 0.05;
    ap.renderOrder = 3;
    this.arrows.add(ap);
    this.arrows.visible = false;
    P.add(this.arrows);
    // the Z-Blocks hovering over the far corners
    for (const fx of [-1, 1]) {
      const qb = qBlock(1.5);
      qb.position.set(fx * (HL + 1.2), 7.2, -(HD + 3.4));
      P.add(qb);
      this.qbs.push(qb);
    }
    // the visitor's aim: a little arrow on the ground ahead of them
    const tri = new THREE.CircleGeometry(0.32, 3);
    this.aim = new THREE.Mesh(tri, glow("#ffffff", 0.8));
    this.aim.rotation.order = "YXZ";
    this.aim.renderOrder = 3;
    this.aim.visible = false;
    this.w.scene.add(this.aim);
  }

  /** What a level adds on the pitch: the ice and the frost that warns of its spread, the snow; the roof's lit edge, the monsoon's rain. */
  private buildTwists() {
    const P = this.pitch;
    const s = this.w.scene;
    const lv = this.L;
    if (lv.ice) {
      for (const [x, z, rx, rz] of ICE0) this.ice.push({ x, z, rx, rz, k: 1, to: 1 });
      for (const [x, z, rx, rz] of ICE1) this.ice.push({ x, z, rx, rz, k: 0, to: 0 });
      const n = this.ice.length;
      this.iceMesh = new THREE.InstancedMesh(GEO.disc, new THREE.MeshBasicMaterial({ map: iceTex(), transparent: true, depthWrite: false }), n);
      this.iceRim = new THREE.InstancedMesh(new THREE.RingGeometry(0.475, 0.5, 48), glow("#ffffff", 0.75), n);
      this.frostMat = new THREE.MeshBasicMaterial({ color: "#f2fbff", transparent: true, opacity: 0, depthWrite: false });
      this.frost = new THREE.InstancedMesh(new THREE.RingGeometry(0.45, 0.5, 48), this.frostMat, ICE1.length);
      this.iceMesh.renderOrder = 2;
      this.iceRim.renderOrder = 3;
      this.frost.renderOrder = 3;
      const flat = this.q.setFromAxisAngle(this.v.set(1, 0, 0), -Math.PI / 2);
      ICE1.forEach(([x, z, rx, rz], i) => this.frost!.setMatrixAt(i, this.m4.compose(this.v.set(x, 0.05, z), flat, this.sc.set(rx * 2, rz * 2, 1))));
      this.frost.visible = false;
      for (const m of [this.iceMesh, this.iceRim, this.frost]) {
        m.raycast = () => {};
        P.add(m);
      }
      this.placeIce();
      // the snow falling over the rink (cosmetic)
      const N = 150;
      this.snow = new THREE.InstancedMesh(GEO.box, glow("#ffffff", 0.9), N);
      this.snow.frustumCulled = false;
      const D = this.deco;
      for (let i = 0; i < N; i++) this.flakes.push({ x: (D() - 0.5) * 56, y: D() * 24, z: -20 + D() * 38, v: 1.2 + D() * 1.4, ph: D() * 6.3 });
      s.add(this.snow);
    }
    if (lv.open) {
      // the open front: a glowing lip, the deck's face under it, warning lights blinking along it
      block("#ffd23f", 2 * (HL + GD + 0.9), 0.08, 0.14, 0, 0.02, HD + 0.02, P, glow("#ffd23f"));
      block("#2a2440", 2 * (HL + GD + 0.9), 0.62, 0.3, 0, -0.38, HD - 0.12, P);
      const n = 16;
      this.edgeLights = new THREE.InstancedMesh(GEO.ball, glow("#ffffff"), n);
      for (let i = 0; i < n; i++) {
        const x = -(HL + GD) + ((i + 0.5) / n) * 2 * (HL + GD);
        this.edgeLights.setMatrixAt(i, this.m4.compose(this.v.set(x, 0.12, HD + 0.08), this.q.identity(), this.sc.setScalar(0.24)));
        this.edgeLights.setColorAt(i, this.col.set("#ff3b4f"));
      }
      this.edgeLights.raycast = () => {};
      P.add(this.edgeLights);
    }
    if (lv.monsoon) {
      // the arrows of the wind: two more columns beside the tilt's (the group turns them toward the edge)
      for (const z of [-7.5, 7.5]) {
        const ap = new THREE.Mesh(GEO.plane, this.arrowMat);
        ap.rotation.x = -Math.PI / 2;
        ap.scale.set(12, 6, 1);
        ap.position.set(0, 0.05, z);
        ap.renderOrder = 3;
        this.arrows.add(ap);
      }
      // the rain: streaks slanting toward the edge
      const N = 170;
      this.rainMat = new THREE.MeshBasicMaterial({ color: "#bfe6ff", transparent: true, opacity: 0, depthWrite: false });
      this.rain = new THREE.InstancedMesh(GEO.box, this.rainMat, N);
      this.rain.frustumCulled = false;
      this.rain.visible = false;
      const D = this.deco;
      for (let i = 0; i < N; i++) this.drip.push({ x: (D() - 0.5) * 44, y: D() * 18, z: -16 + D() * 30, v: 16 + D() * 6 });
      s.add(this.rain);
    }
  }

  /** The ice patches as far as they have spread. */
  private placeIce() {
    if (!this.iceMesh || !this.iceRim) return;
    const flat = this.q.setFromAxisAngle(this.v.set(1, 0, 0), -Math.PI / 2);
    this.ice.forEach((p, i) => {
      const k = Math.max(0.001, p.k);
      this.iceMesh!.setMatrixAt(i, this.m4.compose(this.v.set(p.x, 0.012 + i * 0.002, p.z), flat, this.sc.set(p.rx * 2 * k, p.rz * 2 * k, 1)));
      this.iceRim!.setMatrixAt(i, this.m4.compose(this.v.set(p.x, 0.03 + i * 0.002, p.z), flat, this.sc.set(p.rx * 2 * k, p.rz * 2 * k, 1)));
    });
    this.iceMesh.instanceMatrix.needsUpdate = true;
    this.iceRim.instanceMatrix.needsUpdate = true;
  }

  /** What the feet and the ball kick up here: grass and dust, snow, the roof's spray. */
  private dust(): readonly string[] {
    return this.L.key === "astana" ? DUST_SNOW : this.L.key === "marina" ? DUST_ROOF : DUST_GRASS;
  }

  /** On the ice here? */
  private onIce(x: number, z: number) {
    for (const p of this.ice) {
      if (p.k < 0.05) continue;
      const dx = (x - p.x) / (p.rx * p.k);
      const dz = (z - p.z) / (p.rz * p.k);
      if (dx * dx + dz * dz < 1) return true;
    }
    return false;
  }

  private buildStands() {
    const P = this.pitch;
    // a stepped stand behind the far wall, the fans of each house on their half
    const st: Box[] = [];
    const len = 2 * (HL - 1.2);
    for (let i = 0; i < 3; i++) {
      const h = 0.75 + i * 0.75;
      st.push({ x: 0, y: h / 2, z: -(HD + 1.6 + i * 1.2), w: len, h, d: 1.2, c: i % 2 ? "#e9e4f7" : "#ffffff" });
    }
    st.push({ x: 0, y: 1.6, z: -(HD + 5.0), w: len + 0.6, h: 3.2, d: 0.4, c: "#5a4fa0" });
    P.add(boxes(st, toon("#ffffff")));
    const fur = ["#8a5a3a", "#6b4426", "#c9925c", "#3d2a1e", "#a8744a"];
    const bodies: Box[] = [];
    const heads: Box[] = [];
    for (let i = 0; i < 3; i++) {
      const top = 0.75 + i * 0.75;
      const z = -(HD + 1.6 + i * 1.2);
      for (let x = -HL + 1.8; x <= HL - 1.8; x += 0.95) {
        const team = x < 0 ? 0 : 1;
        const jx = x + (((i * 31 + x * 7) % 3) - 1) * 0.08;
        const col = tint(this.house[team].color, ((Math.abs(Math.round(x * 13 + i * 7)) % 5) - 2) * 0.09);
        bodies.push({ x: jx, y: top + 0.4, z, w: 0.56, h: 0.72, d: 0.42, c: col });
        heads.push({ x: jx, y: top + 1.0, z, w: 0.46, h: 0.44, d: 0.42, c: fur[Math.abs(Math.round(x * 3 + i)) % fur.length] });
        this.fanAt.push({ x: jx, y: top, z, team, ph: this.deco() * Math.PI * 2 });
      }
    }
    this.fans = boxes(bodies, toon("#ffffff"));
    this.heads = boxes(heads, toon("#ffffff"));
    P.add(this.fans, this.heads);
    // their arms (fur), the house flags every third one waves
    const nF = this.fanAt.length;
    this.arms = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), nF * 2);
    this.fanFlags = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), nF);
    for (let i = 0; i < nF; i++) {
      const c = this.col.set(fur[(i * 3) % fur.length]);
      this.arms.setColorAt(i * 2, c);
      this.arms.setColorAt(i * 2 + 1, c);
      this.fanFlags.setColorAt(i, this.col.set(i % 2 ? "#ffffff" : this.house[this.fanAt[i].team].deep));
    }
    for (const m of [this.arms, this.fanFlags]) ((m.raycast = () => {}), (m.frustumCulled = false), P.add(m));
    // pennants on poles along the stand's back wall
    const poles: Box[] = [];
    for (let x = -HL + 1.2; x <= HL - 1.2 + 0.01; x += (2 * HL - 2.4) / 7) {
      poles.push({ x, y: 3.9, z: -(HD + 5.0), w: 0.1, h: 1.6, d: 0.1, c: "#ffffff" });
      this.pennantAt.push({ x, y: 4.35, z: -(HD + 5.0) });
    }
    P.add(boxes(poles, toon("#ffffff")));
    this.pennants = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), this.pennantAt.length);
    this.pennantAt.forEach((p, i) => this.pennants.setColorAt(i, this.col.set(this.house[p.x < 0 ? 0 : 1].color)));
    this.pennants.raycast = () => {};
    P.add(this.pennants);
  }

  private buildBalls() {
    const plain = new THREE.MeshToonMaterial({ map: ballTex(false), gradientMap: toonSteps() });
    const gold = new THREE.MeshToonMaterial({ map: ballTex(true), gradientMap: toonSteps(), emissive: 0x6a4200 });
    this.ballMats.push(plain, gold);
    const glintMat = new THREE.MeshBasicMaterial({ map: softTex(), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(GEO.ball, plain);
      body.scale.setScalar(BR * 2);
      outline(body, 0.05);
      g.add(body);
      const halo = new THREE.Mesh(GEO.disc, glow("#ffd23f", 0.32, true));
      halo.scale.setScalar(BR * 3.3);
      halo.visible = false;
      g.add(halo);
      const glint = new THREE.Mesh(GEO.plane, glintMat);
      glint.scale.set(BR * 0.95, BR * 0.6, 1);
      glint.renderOrder = 4;
      g.add(glint);
      g.visible = false;
      const shadow = blob(BR * 0.95);
      shadow.rotation.order = "ZXY";
      shadow.visible = false;
      const rm = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthWrite: false });
      this.ringMats.push(rm);
      const ring = new THREE.Mesh(GEO.ring, rm);
      ring.rotation.order = "ZXY";
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(BR * 2.4);
      ring.renderOrder = 3;
      ring.visible = false;
      this.w.scene.add(g, shadow, ring);
      this.balls.push({ i, on: false, st: "play", t: 0, x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, gold: false, last: -1, lastBy: [-1, -1], lastAt: [-99, -99], touch: [false, false, false, false], g, body, shadow, halo, ring, glint });
    }
  }

  private placeBumpers(k: number) {
    BUMPS.forEach(([x, z], i) => {
      const p = 1 + this.bumpPulse[i] * 0.25;
      const h = 1.3 * Math.max(0.001, k);
      this.q.identity();
      const r2 = BUMP_R * 2 * p;
      this.bumpBody.setMatrixAt(i, this.m4.compose(this.v.set(x, h / 2 - 0.02, z), this.q, this.sc.set(r2, h, r2)));
      this.bumpInk.setMatrixAt(i, this.m4.compose(this.v.set(x, h / 2 - 0.02, z), this.q, this.sc.set(r2 + 0.1, h + 0.1, r2 + 0.1)));
      this.bumpBand.setMatrixAt(i, this.m4.compose(this.v.set(x, h * 0.52, z), this.q, this.sc.set(r2 + 0.03, h * 0.2, r2 + 0.03)));
      this.bumpCap.setMatrixAt(i, this.m4.compose(this.v.set(x, h + 0.04, z), this.q, this.sc.set(BUMP_R * 1.5 * p, 0.12 * Math.max(0.001, k), BUMP_R * 1.5 * p)));
    });
    for (const m of [this.bumpBody, this.bumpInk, this.bumpBand, this.bumpCap]) {
      m.instanceMatrix.needsUpdate = true;
      m.visible = k > 0.01;
    }
  }

  // ---- the frame ---------------------------------------------------------------------------------

  idle(dt: number, phase: "card" | "count", k: number) {
    this.phase = phase;
    this.phaseK = k;
    if (phase === "card") {
      this.cardT += dt;
      // a slow sweep low over the pitch, the two houses facing off
      this.cam.orbit(new THREE.Vector3(0, 0.6, 0), -0.75 + this.cardT * 0.1, 22, 7.5);
      if (this.cardT > 0.4 && this.cardT - dt <= 0.4) for (const m of this.mons) m.a.body.wave(1.4);
    } else {
      this.playCam(this.eye, this.at);
      this.cam.to(this.eye, this.at, dt, 2.6 + k * 4);
    }
    this.cam.apply(dt);
    for (const m of this.mons) {
      m.a.physics(dt, 0);
      m.a.sync(dt);
    }
    this.look(dt, 0);
  }

  update(dt: number, input: Input) {
    this.phase = "play";
    // the visitor's hands
    const c = this.ctl;
    const ax = input.axis();
    // (screen-relative: "up" runs away from the camera)
    let fx = this.cam.at.x - this.cam.eye.x;
    let fz = this.cam.at.z - this.cam.eye.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl;
    fz /= fl;
    let mx = -fz * ax.x + fx * -ax.y;
    let mz = fx * ax.x + fz * -ax.y;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) ((mx /= ml), (mz /= ml));
    c.x = mx;
    c.z = mz;
    if (input.pressed("a")) c.jump = JUMP_BUF;
    if (input.pressed("b")) c.dive = DIVE_BUF;
    // a goal's slow motion
    let k = 1;
    if (this.slow > 0) {
      this.slow -= dt;
      k = 0.3;
    }
    const gdt = dt * k;
    if (!this.over) {
      this.t += gdt;
      this.events();
    } else this.endT += dt;
    // the level's twists move on: the ice spreading, the monsoon rising and dying away
    if (this.ice.length) {
      let moved = false;
      for (const p of this.ice)
        if (p.k !== p.to) {
          p.k += clamp(p.to - p.k, -gdt, gdt);
          moved = true;
        }
      if (moved) this.placeIce();
    }
    if (this.L.monsoon) this.wind += clamp((this.ev.wind && !this.ev.calm && !this.over ? 1 : 0) - this.wind, -gdt * 1.5, gdt);
    const n = Math.max(1, Math.ceil(gdt / (1 / 60) - 1e-6));
    const h = gdt / n;
    for (let i = 0; i < n; i++) this.step(h);
    this.look(dt, gdt);
    // the camera: the pitch, gently after the play; punched in on a goal; on the winners at the end
    if (this.over && this.endT > 0.5 && this.winner >= 0) {
      const ws = this.teams[this.winner];
      const wx = (ws[0].a.pos.x + ws[1].a.pos.x) / 2;
      const wz = (ws[0].a.pos.z + ws[1].a.pos.z) / 2;
      this.cam.to(this.eye.set(wx * 0.8, 6.5, wz + 10.5), this.at.set(wx, 1.3, wz), dt, 2.2);
    } else if (this.punch > 0) {
      this.punch -= dt;
      this.cam.to(this.eye.set(this.punchX * 0.6, 7.5, 10.8), this.at.set(this.punchX * 0.9, 1.1, -0.4), dt, 5);
    } else {
      this.playCam(this.eye, this.at);
      this.cam.to(this.eye, this.at, dt, 2.5);
    }
    this.cam.apply(dt);
  }

  private playCam(eye: THREE.Vector3, at: THREE.Vector3) {
    let f = 0;
    let n = 0;
    for (const b of this.balls)
      if (b.on && b.st !== "net" && b.st !== "off") {
        f += b.x;
        n++;
      }
    if (this.human) {
      f += this.human.a.pos.x * 0.8;
      n += 0.8;
    }
    const cx = clamp(n ? (f / n) * 0.3 : 0, -2.6, 2.6);
    eye.set(cx, 16.5, 16.8);
    // (a touch screen: the view tips down until the pitch's near edge, at about 400 on the HUD, is above
    // the thumbs' buttons; the stand goes under the scoreboard instead)
    const lift = HUD.thumbs ? clamp((408 - HUD.top) * 0.052, 0, 2.4) : 0;
    at.set(cx, 0, 0.9 + lift);
  }

  // ---- the timeline -----------------------------------------------------------------------------

  private say(s: string, c: string, d = 1.6, y = H * 0.3, size = 58) {
    this.banners.push({ s, c, t: 0, d, y, size });
  }

  private events() {
    const t = this.t;
    const e = this.ev;
    if (!e.two && t >= T2 - 1.2) {
      e.two = true;
      const busy = this.balls.some((b) => b.on && Math.hypot(b.x, b.z) < 3.2);
      this.drops.push({ at: t, x: 0, z: busy ? (this.rnd() < 0.5 ? -3.2 : 3.2) : 0, gold: false });
      this.say(T("2 BALLS!", "两个球！"), "#ffd23f");
      sfx.star();
    }
    const lv = this.L;
    if (lv.bumpers && !e.bumpWarn && t >= T_BUMP - WARN) {
      e.bumpWarn = true;
      this.say(T("BUMPERS!", "弹力柱！"), "#ff5fa2");
      alarm();
    }
    if (lv.bumpers && !e.bumpUp && t >= T_BUMP) {
      e.bumpUp = true;
      sfx.thud();
      this.cam.shake(0.3);
      for (const [x, z] of BUMPS) this.fx.burst(this.v.set(x, 0.3, z), 16, ["#ff5fa2", "#ffe14d", "#ffffff"], { speed: 5, up: 5 });
    }
    if (lv.tilt && !e.tiltWarn && t >= T_TILT - WARN) {
      e.tiltWarn = true;
      this.warnTilt = WARN + 4;
      this.say(T("TILT!", "倾斜！"), "#ffe14d");
      this.arrowsTo(this.tiltSide);
      beep(110, 0.9, "sawtooth", 0.12, 0.7);
    }
    if (lv.tilt && !e.tilt1 && t >= T_TILT) {
      e.tilt1 = true;
      this.cam.shake(0.25);
      for (let k = 0; k < 8; k++) this.fx.burst(this.v.set(-HL + k * ((2 * HL) / 7), 0.2, (k % 2 ? 1 : -1) * (HD - 0.4)), 5, this.dust(), { speed: 2.5, up: 2, size: 0.16, life: 0.5 });
      this.slopeTo = -this.tiltSide * SLOPE;
    }
    if (lv.tilt && !e.flipWarn && t >= T_TILT + 4 - 1.2) {
      e.flipWarn = true;
      this.warnTilt = 1.2 + 4;
      this.arrowsTo(-this.tiltSide);
      this.say(T("TILT!", "倾斜！"), "#ffe14d", 1.2, H * 0.3, 46);
      beep(110, 0.9, "sawtooth", 0.12, 0.7);
    }
    if (lv.tilt && !e.tilt2 && t >= T_TILT + 4) {
      e.tilt2 = true;
      this.slopeTo = this.tiltSide * SLOPE;
    }
    if (lv.tilt && !e.level && t >= T_TILT + 8.2) {
      e.level = true;
      this.slopeTo = 0;
      this.warnTilt = 0;
    }
    // the ice spreads: frost rings first where it will be
    if (lv.ice && !e.freezeWarn && t >= T_FREEZE - WARN) {
      e.freezeWarn = true;
      this.freezeWarn = WARN;
      this.say(T("BIG FREEZE!", "大冰封！"), "#a8e4ff");
      this.say(T("the ice is spreading", "冰面正在蔓延"), "#ffffff", 1.6, H * 0.3 + 56, 30);
      [0, 0.25, 0.5].forEach((d, i) => beep(1760 - i * 220, 0.3, "triangle", 0.12, 1.4, d));
    }
    if (lv.ice && !e.freeze && t >= T_FREEZE) {
      e.freeze = true;
      for (const p of this.ice) p.to = 1;
      this.cam.shake(0.3);
      beep(2400, 0.5, "sine", 0.08, 0.5);
      beep(180, 0.6, "sawtooth", 0.1, 0.6);
      for (const [x, z, rx, rz] of ICE1) for (let k = 0; k < 4; k++) this.fx.burst(this.v.set(x + (Math.random() - 0.5) * rx, 0.3, z + (Math.random() - 0.5) * rz), 8, ["#ffffff", "#bfe9ff", "#8fd0f5"], { speed: 4, up: 3, size: 0.16 });
    }
    // the monsoon: the arrows and the rain first, then the gusts toward the open edge
    if (lv.monsoon && !e.windWarn && t >= T_MONSOON - WARN) {
      e.windWarn = true;
      this.warnTilt = WARN + MONSOON_T;
      this.arrows.rotation.y = Math.PI / 2;
      this.arrows.visible = true;
      this.say(T("MONSOON!", "季风来袭！"), "#7fe3ff");
      this.say(T("the wind blows to the edge", "风把一切吹向边缘"), "#ffffff", 1.6, H * 0.3 + 56, 30);
      beep(140, 1.2, "sawtooth", 0.1, 0.7);
    }
    if (lv.monsoon && !e.wind && t >= T_MONSOON) e.wind = true;
    if (lv.monsoon && !e.calm && t >= T_MONSOON + MONSOON_T) {
      e.calm = true;
      this.warnTilt = 0;
    }
    if (!e.goldWarn && t >= T_GOLD - 1.2) {
      e.goldWarn = true;
      this.say(T("GOLDEN BALL!", "黄金球！"), "#ffd23f", 2.0);
      this.say(T("worth 2 goals", "一球算两分"), "#ffffff", 2.0, H * 0.3 + 56, 30);
    }
    if (!e.gold && t >= T_GOLD) {
      e.gold = true;
      music.rate(1.15);
      // the ball nearest the centre turns to gold (or the next one to drop)
      let best: Ball | null = null;
      for (const b of this.balls) if (b.on && b.st !== "net" && b.st !== "off" && (!best || Math.hypot(b.x, b.z) < Math.hypot(best.x, best.z))) best = b;
      if (best) this.gild(best);
      else this.pendingGold = true;
    }
    if (!e.end && t >= TIME && !this.ot) {
      if (this.score[0] !== this.score[1]) this.end();
      else {
        this.ot = true;
        whistle(0.5);
        this.say(T("OVERTIME!", "加时！"), "#ff5a5a", 2.2);
        this.flash = 0.5;
        this.cam.shake(0.3);
        for (const x of [-HL, HL]) this.fx.burst(this.v.set(x, 2.5, 0), 30, ["#ff5a5a", "#ffffff", "#ffd23f"], { speed: 7, up: 7, size: 0.2, life: 1.2 });
        this.say(T("next goal wins", "下一球定胜负"), "#ffffff", 2.2, H * 0.3 + 56, 30);
        music.stage(3);
      }
    }
    if (this.ot && !this.over && t >= TIME + OT_CAP) this.end();
    // the drops due
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.at > t) continue;
      const b = this.balls.find((x) => !x.on);
      if (!b) continue;
      this.drops.splice(i, 1);
      // (a ball already sitting there: it lands beside it)
      if (this.balls.some((x) => x.on && x !== b && x.st !== "off" && Math.hypot(x.x - d.x, x.z - d.z) < 2.8)) d.z = d.z > 0 || (d.z === 0 && this.rnd() < 0.5) ? d.z - 3.2 : d.z + 3.2;
      this.spawn(b, d.x, d.z, d.gold || this.pendingGold, d.low ? 10 : 15);
      this.pendingGold = false;
    }
  }

  private arrowsTo(dir: number) {
    // (the chevrons point at −x; dir: the low side)
    this.arrows.rotation.y = dir < 0 ? 0 : Math.PI;
    this.arrows.visible = true;
  }

  private gild(b: Ball) {
    b.gold = true;
    b.body.material = this.ballMats[1];
    b.halo.visible = true;
    this.fx.burst(this.v.set(b.x, b.y, b.z), 40, ["#ffd23f", "#fff4c4", "#ffffff"], { speed: 7, up: 5 });
    sfx.star();
  }

  private spawn(b: Ball, x: number, z: number, gold: boolean, y = 15) {
    b.on = true;
    b.st = "drop";
    b.t = 0;
    b.x = x;
    b.z = z;
    b.y = y;
    b.vx = b.vz = 0;
    b.vy = -2;
    b.gold = gold;
    b.body.material = this.ballMats[gold ? 1 : 0];
    b.halo.visible = gold;
    b.last = -1;
    b.lastBy[0] = b.lastBy[1] = -1;
    b.lastAt[0] = b.lastAt[1] = -99;
    b.touch.fill(false);
    b.g.visible = true;
    b.g.scale.setScalar(1);
    b.body.quaternion.identity();
  }

  private end() {
    if (this.over) return;
    this.ev.end = true;
    this.backForBows();
    const [s0, s1] = this.score;
    this.winner = s0 === s1 ? -1 : s0 > s1 ? 0 : 1;
    const rank = (ms: Mon[]) => [...ms].sort((a, b) => b.goals - a.goals || b.touches - a.touches || a.seat - b.seat).map((m) => m.seat);
    this.over = this.winner < 0 ? rank(this.mons) : [...rank(this.teams[this.winner]), ...rank(this.teams[1 - this.winner])];
    whistle(0.18);
    whistle(0.18, 0.28);
    whistle(0.7, 0.56);
    // (under the host's FINISH)
    if (this.winner < 0) this.say(T("DRAW!", "平局！"), "#ffffff", 2.4, H * 0.78, 50);
    else {
      const hs = this.house[this.winner];
      this.say(T(`${hs.en} WINS!`, `${hs.zh} 获胜！`), hs.color, 2.4, H * 0.78, 50);
      this.cheer[this.winner] = 9;
      for (const m of this.teams[this.winner]) this.fx.burst(this.v.set(m.a.pos.x, 3.5, m.a.pos.z), 50, [hs.color, hs.deep, "#ffffff", "#ffd23f"], { speed: 8, up: 8, gravity: 9, size: 0.2, life: 1.6 });
    }
    for (const m of this.mons) {
      const won = this.winner < 0 ? false : m.team === this.winner;
      m.st = won ? "joy" : "sulk";
      m.stT = 99;
      if (won) (m.a.cheer(3), m.a.jump(9));
      else m.a.angry = true;
    }
    roar(0.5, 2.4);
  }

  /** (the end: anyone still falling off the roof is back for the bows) */
  private backForBows() {
    for (const m of this.mons) if (m.st === "fall" || m.a.pos.y < -0.5) this.respawn(m);
  }

  // ---- one step of the simulation -----------------------------------------------------------------

  private floorAt(x: number) {
    return x * this.slope;
  }
  private ownX(team: number) {
    return team === 0 ? -HL : HL;
  }

  private step(h: number) {
    if (!this.over) this.plan();
    for (const m of this.mons) this.control(m, h);
    this.ctl.jump = Math.max(0, this.ctl.jump - h);
    this.ctl.dive = Math.max(0, this.ctl.dive - h);
    for (const m of this.mons) this.move(m, h);
    this.monHits();
    for (const b of this.balls) if (b.on) this.ballStep(b, h);
    this.ballMon();
    this.ballBall();
    if (this.bumpH > 0.3) this.bumpers();
    // (a ball or a rival pushed some into the boards since the walls were seen to: out of them again)
    for (const m of this.mons) if (m.st !== "fall") this.bound(m.a.pos, PR);
  }

  /** Each house: who attacks, which ball each one plays. */
  private plan() {
    const reach = BR + PR;
    for (let team = 0; team < 2; team++) {
      const ms = this.teams[team];
      const own = this.ownX(team);
      const tgx = -own;
      let danger = -1;
      let dBest = Infinity;
      for (const b of this.balls) {
        if (!b.on || b.st !== "play") continue;
        const vin = own < 0 ? -b.vx : b.vx;
        const d = Math.hypot(b.x - own, b.z) - Math.max(0, vin) * 0.5;
        if (d < dBest) ((dBest = d), (danger = b.i));
      }
      for (const m of ms) {
        m.atkBall = -1;
        m.atkCost = Infinity;
        for (const b of this.balls) {
          if (!b.on || b.st !== "play") continue;
          let dx = tgx - b.x;
          let dz = -b.z;
          const dl = Math.hypot(dx, dz) || 1;
          dx /= dl;
          dz /= dl;
          const qx = b.x - dx * (reach + 0.3);
          const qz = b.z - dz * (reach + 0.3);
          let c = Math.hypot(m.a.pos.x - qx, m.a.pos.z - qz);
          if ((m.a.pos.x - b.x) * dx + (m.a.pos.z - b.z) * dz > 0) c += 2.5;
          if (m.st !== "run") c += 4;
          if (c < m.atkCost) ((m.atkCost = c), (m.atkBall = b.i));
        }
      }
      const hm = ms.find((m) => m.human);
      if (hm) {
        const p = ms.find((m) => m !== hm)!;
        // (the visitor's mate: the one who isn't going for the ball keeps the goal)
        p.role = hm.atkCost < p.atkCost + 1.2 ? 1 : 0;
      } else {
        const [a, d] = ms[0].role === 0 ? [ms[0], ms[1]] : [ms[1], ms[0]];
        if (d.atkCost + 2.2 < a.atkCost) ((a.role = 1), (d.role = 0));
      }
      for (const m of ms) m.ball = m.role === 0 ? m.atkBall : danger >= 0 ? danger : m.atkBall;
      // (overtime, the ball in their half: the keeper joins the attack)
      if (this.ot && danger >= 0 && (this.balls[danger].x - own) * (own < 0 ? 1 : -1) > HL + 1)
        for (const m of ms) if (!m.human && m.role === 1) ((m.role = 0), (m.ball = m.atkBall));
    }
  }

  private control(m: Mon, h: number) {
    m.cd = Math.max(0, m.cd - h);
    m.grace -= h;
    m.headCd -= h;
    m.panic -= h;
    if (m.st === "fall") {
      // off the roof: falling till it comes back at its goal
      m.stT -= h;
      if (m.stT <= 0) this.respawn(m);
      return;
    }
    const icy = this.ice.length > 0 && this.onIce(m.a.pos.x, m.a.pos.z);
    if (m.st !== "run") {
      m.stT -= h;
      if (m.st === "dive") {
        const k = 0.7 + 0.3 * Math.max(0, m.stT / DIVE_T);
        m.vx = m.dx * DIVE_V * k;
        m.vz = m.dz * DIVE_V * k;
        if (m.stT <= 0) ((m.st = "rec"), (m.stT = REC_T));
      } else {
        // (on the ice a body down or getting up slides on)
        const drag = (m.st === "down" ? 2.6 : m.st === "rec" ? 7 : 10) * (icy ? 0.3 : 1);
        const d = Math.exp(-drag * h);
        m.vx *= d;
        m.vz *= d;
        if (m.stT <= 0) {
          if (m.st === "rec") m.cd = DIVE_CD;
          if (m.st === "down") m.grace = 0.7;
          if (m.st === "sulk") m.a.angry = false;
          m.st = "run";
        }
      }
      return;
    }
    if (this.over) return;
    let ix = 0;
    let iz = 0;
    if (m.human) {
      ix = this.ctl.x;
      iz = this.ctl.z;
      if (this.ctl.jump > 0 && m.a.grounded) {
        this.ctl.jump = 0;
        this.jump(m);
      }
      if (this.ctl.dive > 0 && m.cd <= 0 && m.a.grounded) {
        this.ctl.dive = 0;
        const l = Math.hypot(ix, iz);
        if (l > 0.1) this.dive(m, ix / l, iz / l);
        else this.dive(m, Math.sin(m.a.yaw), Math.cos(m.a.yaw));
        if (m.st !== "run") return;
      }
    } else {
      m.think -= h;
      if (m.think <= 0) this.decide(m);
      if (m.st !== "run") return;
      // (on the roof: never aim past the edge; the abler keep further from it)
      if (this.L.open) m.tz = Math.min(m.tz, HD - 0.8 - 0.9 * m.sk);
      // (a goal's mouth: in and out of it by its front, round the posts, never into one from the side)
      const p = m.a.pos;
      let gx = m.tx;
      let gz = m.tz;
      const deepG = Math.abs(gx) > HL - PR;
      const deepM = Math.abs(p.x) > MOUTH_X && Math.abs(p.z) < GW;
      if (deepG) gz = clamp(gz, -MOUTH_Z, MOUTH_Z);
      if (deepM ? !deepG && Math.abs(gz) > MOUTH_Z : deepG && Math.abs(p.z) > MOUTH_Z) {
        gx = Math.sign(deepM ? p.x : gx) * (MOUTH_X - 0.25);
        gz = clamp(gz, -MOUTH_Z + 0.2, MOUTH_Z - 0.2);
      }
      const dx = gx - p.x;
      const dz = gz - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.12) {
        const k = Math.min(1, d / 0.8) * m.pace;
        ix = (dx / d) * k;
        iz = (dz / d) * k;
        if (!m.charge) [ix, iz] = this.skirt(m, ix, iz);
      }
    }
    const air = !m.a.grounded;
    const top = RUN * (m.human ? 1 : m.spd);
    // (on the ice the feet hardly grip: slow to start, slow to stop, slow to turn)
    const k = 1 - Math.exp(-(air ? 3 : icy ? ICE_GRIP : 12) * h);
    m.vx += (ix * top - m.vx) * k;
    m.vz += (iz * top - m.vz) * k;
    if (Math.hypot(ix, iz) > 0.15) m.a.face(yawOf(ix, iz), h, 16);
  }

  /** An AI on its way somewhere: round the balls, not through them (a pushed ball goes where it shouldn't). */
  private skirt(m: Mon, ix: number, iz: number): [number, number] {
    const p = m.a.pos;
    const near = BR + PR + 0.9;
    for (const b of this.balls) {
      if (!b.on || b.st !== "play") continue;
      const rx = p.x - b.x;
      const rz = p.z - b.z;
      const d = Math.hypot(rx, rz);
      if (d > near || d < 1e-3) continue;
      const nx = rx / d;
      const nz = rz / d;
      const into = ix * nx + iz * nz;
      if (into >= 0) continue;
      // (slide round it, the way the target lies; a little outward when brushing it)
      const k = Math.min(1, (near - d) / 0.9);
      const l0 = Math.hypot(ix, iz);
      ix -= nx * into * k;
      iz -= nz * into * k;
      ix += nx * 0.25 * k;
      iz += nz * 0.25 * k;
      const l1 = Math.hypot(ix, iz) || 1;
      ix = (ix / l1) * l0;
      iz = (iz / l1) * l0;
    }
    return [ix, iz];
  }

  private jump(m: Mon) {
    if (m.st !== "run" || !m.a.grounded) return;
    m.a.jump(9.5);
    this.fx.burst(this.v.set(m.a.pos.x, m.a.pos.y + 0.1, m.a.pos.z), 6, this.dust(), { speed: 2.2, up: 1.2, size: 0.14, life: 0.4 });
    if (m.human) sfx.blip(3);
  }

  private dive(m: Mon, dx: number, dz: number) {
    if (m.st !== "run" || m.cd > 0 || !m.a.grounded) return;
    if (m.human) {
      // (a little help: the ball or rival right ahead draws the dive onto it)
      let best = 0;
      let bx = 0;
      let bz = 0;
      const pull = (x: number, z: number) => {
        const ux = x - m.a.pos.x;
        const uz = z - m.a.pos.z;
        const d = Math.hypot(ux, uz);
        if (d < 0.2 || d > 3.8) return;
        const cos = (ux * dx + uz * dz) / d;
        if (cos < 0.72) return;
        const s = cos - d * 0.05;
        if (s > best) ((best = s), (bx = ux / d), (bz = uz / d));
      };
      for (const b of this.balls) if (b.on && b.st === "play") pull(b.x, b.z);
      for (const r of this.mons) if (r.team !== m.team && r.st !== "down") pull(r.a.pos.x, r.a.pos.z);
      if (best > 0) {
        dx = dx * 0.55 + bx * 0.45;
        dz = dz * 0.55 + bz * 0.45;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
      }
      sfx.whoosh();
    }
    m.st = "dive";
    m.stT = DIVE_T;
    m.dx = dx;
    m.dz = dz;
    this.fx.burst(this.v.set(m.a.pos.x, m.a.pos.y + 0.15, m.a.pos.z), 9, this.dust(), { speed: 3, up: 1.5, size: 0.16, life: 0.45, dir: this.v2.set(-dx, 0.2, -dz) });
    m.vx = dx * DIVE_V;
    m.vz = dz * DIVE_V;
    m.a.vy = 3.2;
    m.a.grounded = false;
    m.a.yaw = yawOf(dx, dz);
    m.dives++;
  }

  private knock(v: Mon, dx: number, dz: number, pow: number) {
    v.st = "down";
    v.stT = DOWN_T;
    v.vx = dx * pow;
    v.vz = dz * pow;
    v.a.vy = 5.5;
    v.a.grounded = false;
    v.a.hit();
    v.spin = (Math.random() < 0.5 ? -1 : 1) * 13;
    v.a.yaw = yawOf(-dx, -dz);
    this.fx.burst(v.a.head(this.v).setY(v.a.pos.y + 1.4), 16, ["#ffd23f", "#ffffff", this.house[v.team].color], { speed: 5, up: 4, size: 0.2 });
    sfx.hit();
    this.cam.shake(v.human ? 0.45 : 0.22);
    this.pops.push({ x: v.a.pos.x, y: v.a.pos.y + 2.2, z: v.a.pos.z, s: T("BONK!", "咚！"), c: "#ffd23f", t: 0 });
  }

  private knockable(v: Mon) {
    return v.st !== "down" && v.st !== "fall" && v.grace <= 0 && v.a.pos.y - this.floorAt(v.a.pos.x) < 0.5;
  }

  private bounceDiver(m: Mon) {
    m.st = "rec";
    m.stT = REC_T;
    m.vx = -m.dx * 2;
    m.vz = -m.dz * 2;
  }

  /** Keep a snark on the pitch: the walls, the cut corners; the goal mouths let it in (a keeper), the posts don't. */
  private bound(p: THREE.Vector3, r: number) {
    const lv = this.L;
    if (Math.abs(p.x) > HL) {
      p.z = clamp(p.z, -(GW - r), GW - r);
      p.x = clamp(p.x, -(HL + GD - r), HL + GD - r);
    } else {
      const xl = Math.abs(p.z) < GW - r ? HL + GD - r : HL - r;
      p.x = clamp(p.x, -xl, xl);
      // (an open front holds no one in)
      p.z = clamp(p.z, -HD + r, lv.open ? HD + 6 : HD - r);
      if (lv.shape === "cut") {
        const o = Math.abs(p.x) + Math.abs(p.z) - (HL + HD - lv.corner - r * Math.SQRT2);
        if (o > 0) {
          p.x -= Math.sign(p.x) * o * 0.5;
          p.z -= Math.sign(p.z) * o * 0.5;
        }
      } else if (lv.shape === "round") {
        const c = lv.corner;
        const qx = Math.abs(p.x) - (HL - c);
        const qz = Math.abs(p.z) - (HD - c);
        if (qx > 0 && qz > 0) {
          const d = Math.hypot(qx, qz);
          if (d > c - r) {
            p.x = Math.sign(p.x) * (HL - c + (qx / d) * (c - r));
            p.z = Math.sign(p.z) * (HD - c + (qz / d) * (c - r));
          }
        }
      }
    }
    for (const px of [-HL, HL])
      for (const pz of [-GW, GW]) {
        const dx = p.x - px;
        const dz = p.z - pz;
        const d = Math.hypot(dx, dz);
        const rr2 = r + POST;
        if (d < rr2 && d > 1e-4) {
          p.x = px + (dx / d) * rr2;
          p.z = pz + (dz / d) * rr2;
        }
      }
  }

  private move(m: Mon, h: number) {
    const p = m.a.pos;
    p.x += m.vx * h;
    p.z += m.vz * h;
    if (m.st === "fall") {
      m.a.physics(h, null);
      return;
    }
    // the monsoon drifts everyone toward the edge (a body down the most)
    if (this.wind > 0 && !this.over) p.z += WIND_MON * this.gust() * (m.st === "down" ? 1.7 : 1) * h;
    this.bound(p, PR);
    // over the roof's edge: off it goes
    if (this.L.open && p.z > HD + 0.12) {
      this.fallOff(m);
      m.a.physics(h, null);
      return;
    }
    m.a.physics(h, this.floorAt(p.x));
  }

  /** The monsoon's push now (0…1, in gusts). */
  private gust() {
    return this.wind * (0.72 + 0.28 * Math.sin(this.t * 2.3));
  }

  /** A snark over the edge of the roof: a scream, a spin, a fall; it comes back at its goal. */
  private fallOff(m: Mon) {
    m.st = "fall";
    m.stT = MON_BACK;
    m.falls++;
    m.a.grounded = false;
    m.a.vy = Math.max(m.a.vy, 3);
    m.vx *= 0.5;
    m.vz = Math.max(2.5, m.vz * 0.6);
    m.spin = (Math.random() < 0.5 ? -1 : 1) * 9;
    m.a.hit();
    m.a.angry = true;
    beep(980, 0.9, "triangle", 0.16, 0.3);
    beep(1320, 0.7, "sine", 0.06, 0.35, 0.05);
    this.pops.push({ x: m.a.pos.x, y: m.a.pos.y + 2.2, z: m.a.pos.z, s: T("WAAAH!", "哇啊啊！"), c: "#ffd23f", t: 0 });
    this.fx.burst(this.v.set(m.a.pos.x, 0.4, HD), 14, ["#ffd23f", this.house[m.team].color, "#ffffff"], { speed: 4, up: 3.5, size: 0.16, life: 0.6 });
    this.cam.shake(m.human ? 0.35 : 0.12);
  }

  /** Back from the fall: at its own goal, a puff, a moment safe. */
  private respawn(m: Mon) {
    const own = this.ownX(m.team);
    const p = m.a.pos;
    p.set(Math.sign(own) * (HL - 2.3), 0, (m.seat % 2 ? 1.4 : -1.4));
    m.vx = m.vz = 0;
    m.a.vy = 0;
    m.a.grounded = true;
    m.a.physics(0, this.floorAt(p.x));
    m.a.yaw = yawOf(-Math.sign(own), 0);
    m.st = "run";
    m.stT = 0;
    m.grace = 1.0;
    m.cd = 0.3;
    m.spin = 0;
    m.a.angry = false;
    this.fx.burst(this.v.set(p.x, 0.6, p.z), 22, [this.house[m.team].color, "#ffffff", "#ffd23f"], { speed: 4, up: 4 });
    if (m.human) sfx.blip(4);
  }

  private monHits() {
    const ms = this.mons;
    const r = PR * 1.8;
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const a = ms[i];
        const b = ms[j];
        const dx = b.a.pos.x - a.a.pos.x;
        const dz = b.a.pos.z - a.a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d >= r || d < 1e-4 || Math.abs(a.a.pos.y - b.a.pos.y) > 1.4 || a.st === "fall" || b.st === "fall") continue;
        const nx = dx / d;
        const nz = dz / d;
        if (a.st === "dive" && b.st === "dive") {
          this.bounceDiver(a);
          this.bounceDiver(b);
          sfx.hit();
          this.fx.burst(this.v.set((a.a.pos.x + b.a.pos.x) / 2, 1.0, (a.a.pos.z + b.a.pos.z) / 2), 16, ["#ffd23f", "#ffffff", "#ff8a3c"], { speed: 6, up: 3, size: 0.16, life: 0.45 });
          this.cam.shake(0.18);
        } else if (a.st === "dive" && a.team !== b.team && this.knockable(b)) {
          this.knock(b, a.dx, a.dz, 8);
          this.bounceDiver(a);
          continue;
        } else if (b.st === "dive" && b.team !== a.team && this.knockable(a)) {
          this.knock(a, b.dx, b.dz, 8);
          this.bounceDiver(b);
          continue;
        }
        const ov = (r - d) / 2;
        a.a.pos.x -= nx * ov;
        a.a.pos.z -= nz * ov;
        b.a.pos.x += nx * ov;
        b.a.pos.z += nz * ov;
      }
  }

  private ballStep(b: Ball, h: number) {
    b.t += h;
    if (b.st === "off") {
      // over the roof's edge: down it goes, out of sight; it comes back at the centre
      b.vy -= BG * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.z += b.vz * h;
      if (b.t > BALL_BACK - 0.05) {
        b.on = false;
        b.g.visible = false;
        b.shadow.visible = false;
      }
      return;
    }
    if (b.st === "net") {
      // in the net: it sinks back and pops
      b.vx *= Math.exp(-5 * h);
      b.vz *= Math.exp(-5 * h);
    }
    b.vy -= BG * h;
    // (past an open front there is nothing under it)
    const fl = this.L.open && b.z > HD ? -1e6 : this.floorAt(b.x) + BR;
    const ground = b.y <= fl + 0.05;
    if (ground && b.st !== "net") b.vx -= BG * this.slope * 0.6 * h;
    if (this.wind > 0 && b.st !== "net") b.vz += WIND_BALL * this.gust() * (ground ? 1 : 0.5) * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;
    if (this.L.open && b.z > HD + 0.4 && b.st !== "net") {
      this.overEdge(b);
      return;
    }
    if (b.y < fl) {
      b.y = fl;
      if (b.vy < -3.2) {
        if (b.st === "drop" || b.vy < -7) (sfx.thud(), this.cam.shake(b.st === "drop" ? 0.28 : 0.12));
        if (b.st !== "drop" && b.vy < -7) this.fx.burst(this.v.set(b.x, fl - BR + 0.1, b.z), 10, this.dust(), { speed: 3.5, up: 1.5, size: 0.16, life: 0.5 });
        if (b.st === "drop") this.fx.burst(this.v.set(b.x, fl - BR + 0.1, b.z), 18, ["#ffffff", "#d8f0c0", "#a8e080"], { speed: 5, up: 2 });
        b.vy = -b.vy * 0.48;
      } else b.vy = 0;
      if (b.st === "drop") b.st = "play";
    }
    const drag = ground ? (this.ice.length && this.onIce(b.x, b.z) ? ICE_BALL_DRAG : 0.5) : 0.08;
    const dd = Math.exp(-drag * h);
    b.vx *= dd;
    b.vz *= dd;
    // the posts
    for (const px of [-HL, HL])
      for (const pz of [-GW, GW]) {
        const dx = b.x - px;
        const dz = b.z - pz;
        const d = Math.hypot(dx, dz);
        const r = BR + POST;
        if (d < r && d > 1e-4) {
          const nx = dx / d;
          const nz = dz / d;
          b.x = px + nx * r;
          b.z = pz + nz * r;
          const vn = b.vx * nx + b.vz * nz;
          if (vn < 0) {
            b.vx -= nx * vn * 1.6;
            b.vz -= nz * vn * 1.6;
            if (vn < -5) {
              sfx.thud();
              this.goalGlow[px < 0 ? 0 : 1].scale.x = 0.9;
              this.fx.burst(this.v.set(px, b.y, pz), 14, ["#ffffff", "#ffd23f", "#fff4c4"], { speed: 5, up: 2.5, size: 0.14, life: 0.4 });
              this.cam.shake(0.14);
              this.pops.push({ x: px, y: GH + 0.8, z: pz, s: T("POST!", "中柱！"), c: "#ffffff", t: 0 });
            }
          }
        }
      }
    // the walls, the goals' nets (an open front has no wall)
    const lv = this.L;
    const inGoal = Math.abs(b.x) > HL;
    const zl = inGoal ? GW - BR * 0.98 : HD - BR;
    if (Math.abs(b.z) > zl && (inGoal || !lv.open || b.z < 0)) {
      const s = Math.sign(b.z);
      b.z = s * zl;
      if (b.vz * s > 6 && !inGoal) this.thump(b.x, b.y, s * HD, Math.abs(b.vz));
      if (b.vz * s > 0) b.vz = -b.vz * (inGoal ? 0.2 : 0.62);
    }
    const mouth = Math.abs(b.z) < GW;
    const xl = mouth ? HL + GD - BR : HL - BR;
    if (Math.abs(b.x) > xl) {
      const s = Math.sign(b.x);
      b.x = s * xl;
      if (b.vx * s > 6) this.thump(s * (xl + BR), b.y, b.z, Math.abs(b.vx));
      if (b.vx * s > 0) b.vx = -b.vx * (mouth ? 0.15 : 0.62);
    }
    if (!inGoal && lv.shape !== "rect") {
      // the corners: a cut one's slanted wall, a round one's arc
      let o = 0;
      let nx = 0;
      let nz = 0;
      if (lv.shape === "cut") {
        o = (Math.abs(b.x) + Math.abs(b.z) - (HL + HD - lv.corner)) / Math.SQRT2 + BR;
        nx = -Math.sign(b.x) / Math.SQRT2;
        nz = -Math.sign(b.z) / Math.SQRT2;
      } else {
        const c = lv.corner;
        const qx = Math.abs(b.x) - (HL - c);
        const qz = Math.abs(b.z) - (HD - c);
        if (qx > 0 && qz > 0) {
          const d = Math.hypot(qx, qz);
          o = d - (c - BR);
          nx = (-Math.sign(b.x) * qx) / d;
          nz = (-Math.sign(b.z) * qz) / d;
        }
      }
      if (o > 0) {
        b.x += nx * o;
        b.z += nz * o;
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) {
          b.vx -= nx * vn * 1.6;
          b.vz -= nz * vn * 1.6;
        }
      }
    }
    // in!
    if (b.st === "play" && Math.abs(b.x) > HL + 0.45 && Math.abs(b.z) < GW) this.goal(b, b.x > 0 ? 0 : 1);
    if (b.st === "net" && b.t > 0.75) {
      b.on = false;
      b.g.visible = false;
      b.shadow.visible = false;
      this.fx.burst(this.v.set(b.x, b.y, b.z), 30, b.gold ? ["#ffd23f", "#fff4c4"] : ["#ffcf2e", "#ffffff", "#fdf8ec"], { speed: 7, up: 6 });
    }
  }

  /** A ball over the roof's edge: gone, and back at the centre in a moment (a golden one still golden). */
  private overEdge(b: Ball) {
    b.st = "off";
    b.t = 0;
    b.vy = Math.min(b.vy, 0);
    this.drops.push({ at: this.t + BALL_BACK, x: 0, z: 0, gold: b.gold, low: true });
    this.pops.push({ x: b.x, y: 1.6, z: HD - 0.4, s: T("OUT!", "出界！"), c: "#ffd23f", t: 0 });
    this.fx.burst(this.v.set(b.x, 0.3, HD), 16, ["#ffd23f", "#1a1530", "#ffffff"], { speed: 4, up: 3, size: 0.16, life: 0.6 });
    beep(700, 0.7, "triangle", 0.12, 0.35);
    sfx.whoosh();
  }

  /** A ball slammed into a wall: a puff off the boards, a little shake when it was hard. */
  private thump(x: number, y: number, z: number, sp: number) {
    this.fx.burst(this.v.set(x, Math.max(0.6, y - 0.4), z), Math.min(16, 4 + sp), ["#ffffff", ...this.dust()], { speed: 3 + sp * 0.2, up: 2, size: 0.15, life: 0.45 });
    if (sp > 10) this.cam.shake(0.1);
  }

  private ballMon() {
    const reach = BR + PR;
    for (const b of this.balls) {
      if (!b.on || b.st === "net" || b.st === "off") continue;
      for (const m of this.mons) {
        const a = m.a;
        if (m.st === "fall") continue;
        const flat = m.st === "down" || m.st === "rec" || m.st === "dive";
        const top = a.pos.y + (flat ? 0.8 : 1.9);
        const dx = b.x - a.pos.x;
        const dz = b.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (b.y - BR > top || b.y + BR < a.pos.y - 0.1 || d >= reach) {
          b.touch[m.seat] = false;
          continue;
        }
        const nx = d > 1e-4 ? dx / d : Math.sin(a.yaw);
        const nz = d > 1e-4 ? dz / d : Math.cos(a.yaw);
        // from above: the ball comes down on a head
        if (b.vy < -5 && b.y - BR > a.pos.y + 1.0) {
          if (this.knockable(m) || m.st === "run") this.knock(m, -nx, -nz, 3);
          b.vy = 7;
          b.vx += nx * 2.5;
          b.vz += nz * 2.5;
          if (b.st === "drop") b.st = "play";
          continue;
        }
        if (!b.touch[m.seat]) {
          b.touch[m.seat] = true;
          if (!this.over) m.touches++;
          if (m.human) sfx.step(2);
        }
        b.last = m.seat;
        b.lastBy[m.team] = m.seat;
        b.lastAt[m.team] = this.t;
        if (b.st === "drop") b.st = "play";
        if (m.st === "dive") {
          // the punt
          let px = m.dx * 0.55 + nx * 0.45;
          let pz = m.dz * 0.55 + nz * 0.45;
          const l = Math.hypot(px, pz) || 1;
          px /= l;
          pz /= l;
          if (m.human) [px, pz] = this.assist(m, b, px, pz, 0.28);
          const sp = Math.max(PUNT, b.vx * px + b.vz * pz);
          b.vx = px * sp;
          b.vz = pz * sp;
          b.vy = 4.6;
          b.x = a.pos.x + nx * (reach + 0.02);
          b.z = a.pos.z + nz * (reach + 0.02);
          this.bounceDiver(m);
          sfx.thud();
          this.cam.shake(m.human ? 0.4 : 0.22);
          this.fx.burst(this.v.set(b.x - nx * BR, b.y, b.z - nz * BR), 22, ["#ffffff", "#ffd23f", this.house[m.team].color], { speed: 7, up: 3 });
          this.pops.push({ x: b.x, y: b.y + 1.6, z: b.z, s: T("WHAM!", "砰！"), c: this.house[m.team].color, t: 0 });
          continue;
        }
        if (!a.grounded && m.headCd <= 0 && m.st === "run" && b.y > a.pos.y + 0.6) {
          // the header
          let px = Math.sin(a.yaw) * 0.6 + nx * 0.4;
          let pz = Math.cos(a.yaw) * 0.6 + nz * 0.4;
          const l = Math.hypot(px, pz) || 1;
          px /= l;
          pz /= l;
          if (m.human) [px, pz] = this.assist(m, b, px, pz, 0.3);
          b.vx = px * HEAD_V;
          b.vz = pz * HEAD_V;
          b.vy = 5.6;
          m.headCd = 0.45;
          b.x = a.pos.x + nx * (reach + 0.02);
          b.z = a.pos.z + nz * (reach + 0.02);
          sfx.blip(6);
          this.fx.burst(this.v.set(b.x - nx * BR, b.y, b.z - nz * BR), 10, ["#ffffff", this.house[m.team].color], { speed: 4, up: 3 });
          continue;
        }
        // the push: the snark gives way more than the heavy ball, the ball takes its speed
        const ov = reach - d;
        a.pos.x -= nx * ov * 0.62;
        a.pos.z -= nz * ov * 0.62;
        b.x += nx * ov * 0.38;
        b.z += nz * ov * 0.38;
        const ballIn = -(b.vx * nx + b.vz * nz);
        if (ballIn > BOWL && this.knockable(m) && m.st === "run") {
          // bowled over by a fast ball
          this.knock(m, -nx, -nz, ballIn * 0.4);
          b.vx *= 0.65;
          b.vz *= 0.65;
          continue;
        }
        const want = (m.vx * nx + m.vz * nz) * PUSH;
        const has = b.vx * nx + b.vz * nz;
        if (want > has) {
          const j = want - has;
          b.vx += nx * j * 0.55;
          b.vz += nz * j * 0.55;
          m.vx -= nx * j * 0.18;
          m.vz -= nz * j * 0.18;
          if (j > 5) b.vy = Math.max(b.vy, 1.4);
        } else if (has < 0) {
          // (a ball rolling into a snark standing still: it stops it, mostly)
          b.vx -= nx * has * 1.15;
          b.vz -= nz * has * 1.15;
        }
      }
    }
  }

  /** Bend a shot of the visitor's a little toward the rival goal (when it already goes that way). */
  private assist(m: Mon, b: Ball, px: number, pz: number, k: number): [number, number] {
    const gx = -this.ownX(m.team);
    let ux = gx - b.x;
    let uz = -b.z;
    const ul = Math.hypot(ux, uz) || 1;
    ux /= ul;
    uz /= ul;
    if (px * ux + pz * uz < 0.25) return [px, pz];
    const x = px * (1 - k) + ux * k;
    const z = pz * (1 - k) + uz * k;
    const l = Math.hypot(x, z) || 1;
    return [x / l, z / l];
  }

  private ballBall() {
    const [a, b] = this.balls;
    if (!a.on || !b.on || a.st === "off" || b.st === "off") return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dy, dz);
    if (d >= BR * 2 || d < 1e-4) return;
    const nx = dx / d;
    const ny = dy / d;
    const nz = dz / d;
    const ov = (BR * 2 - d) / 2;
    a.x -= nx * ov;
    a.y -= ny * ov;
    a.z -= nz * ov;
    b.x += nx * ov;
    b.y += ny * ov;
    b.z += nz * ov;
    const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + (a.vz - b.vz) * nz;
    if (rel > 0) {
      const j = rel * 0.9;
      a.vx -= nx * j;
      a.vy -= ny * j;
      a.vz -= nz * j;
      b.vx += nx * j;
      b.vy += ny * j;
      b.vz += nz * j;
      if (rel > 4) {
        sfx.thud();
        this.fx.burst(this.v.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), 12, ["#ffcf2e", "#ffffff", "#fdf8ec"], { speed: 5, up: 2, size: 0.15, life: 0.4 });
      }
    }
  }

  private bumpers() {
    BUMPS.forEach(([x, z], i) => {
      for (const b of this.balls) {
        if (!b.on || b.st === "net" || b.st === "off" || b.y - BR > 1.3 + this.floorAt(x)) continue;
        const dx = b.x - x;
        const dz = b.z - z;
        const d = Math.hypot(dx, dz);
        const r = BR + BUMP_R;
        if (d >= r || d < 1e-4) continue;
        const nx = dx / d;
        const nz = dz / d;
        b.x = x + nx * r;
        b.z = z + nz * r;
        const vn = b.vx * nx + b.vz * nz;
        const out = Math.max(5.5, -vn * 0.9);
        b.vx += nx * (out - vn);
        b.vz += nz * (out - vn);
        this.bumpPulse[i] = 1;
        boing();
        this.fx.burst(this.v.set(b.x - nx * BR, 1, b.z - nz * BR), 10, ["#ff5fa2", "#ffe14d"], { speed: 5, up: 3 });
      }
      for (const m of this.mons) {
        const dx = m.a.pos.x - x;
        const dz = m.a.pos.z - z;
        const d = Math.hypot(dx, dz);
        const r = PR + BUMP_R;
        if (d >= r || d < 1e-4) continue;
        const nx = dx / d;
        const nz = dz / d;
        m.a.pos.x = x + nx * r;
        m.a.pos.z = z + nz * r;
        const vn = m.vx * nx + m.vz * nz;
        if (vn < 2) {
          m.vx += nx * (7 - vn);
          m.vz += nz * (7 - vn);
          if (m.st === "dive") this.bounceDiver(m);
          this.bumpPulse[i] = 1;
          if (m.human) boing();
        }
      }
    });
  }

  private goal(b: Ball, team: number) {
    b.st = "net";
    b.t = 0;
    if (this.over) return;
    const val = b.gold && !this.ot ? 2 : 1;
    this.score[team] += val;
    this.scorePop[team] = 1;
    // (theirs if one of them touched it in the last 3 s: a deflection off a defender is still their goal)
    const own = !(b.lastBy[team] >= 0 && this.t - b.lastAt[team] < 3);
    const scorer = own ? -1 : b.lastBy[team];
    if (scorer >= 0) this.mons[scorer].goals += val;
    const hs = this.house[team];
    const gx = b.x > 0 ? HL : -HL;
    // the show: slow motion, the camera punched in, confetti, the crowd up, one house dancing
    this.slow = 0.8;
    this.punch = 1.9;
    this.punchX = gx;
    this.flash = 1;
    this.cheer[team] = 3;
    this.goalGlow[gx < 0 ? 0 : 1].scale.x = 1.4;
    this.nets[gx < 0 ? 0 : 1].k = 1;
    const conf = [hs.color, hs.deep, "#ffffff", "#ffd23f"];
    for (let i = 0; i < 3; i++) this.fx.burst(this.v.set(gx, 1.5 + i, (i - 1) * 2), 45, conf, { speed: 9, up: 9, gravity: 9, life: 1.6, size: 0.22 });
    this.cam.shake(0.5);
    for (const m of this.mons) {
      if (m.st === "down" || m.st === "fall") continue;
      if (m.team === team) {
        m.st = "joy";
        m.stT = 1.1;
        m.a.cheer(1.5);
        if (m.seat === scorer && m.a.grounded) ((m.a.vy = 10), (m.a.grounded = false), (m.flip = 0.2), m.a.body.jump());
      } else {
        m.st = "sulk";
        m.stT = 1.1;
        m.a.angry = true;
      }
      m.vx *= 0.3;
      m.vz *= 0.3;
    }
    const who = scorer >= 0 ? (this.mons[scorer].human ? T("YOU SCORED!", "你进球了！") : short(this.players[scorer])) : "";
    this.say(own ? T("OWN GOAL!", "乌龙球！") : val > 1 ? T("GOLDEN GOAL!", "黄金进球！") : T("GOAL!", "进球！"), hs.color, 1.9, H * 0.3, 78);
    const sub = own ? T(`for ${hs.en}`, `${hs.zh} 得分`) : val > 1 ? T(`+2 · ${who}`, `+2 · ${who}`) : who;
    if (sub) this.say(sub, "#ffffff", 1.9, H * 0.3 + 66, 30);
    roar(0.55, 2.2);
    const mine = this.human ? this.human.team === team : true;
    if (mine) sfx.fanfare();
    else sfx.sad();
    if (this.ot) {
      this.end();
      return;
    }
    // the next ball: dropped on the side that conceded
    const want = this.t >= T2 - 1.2 ? 2 : 1;
    const have = this.balls.filter((x) => x.on && x.st !== "net" && x.st !== "off").length + this.drops.length;
    if (have < want) this.drops.push({ at: this.t + 1.2, x: (team === 0 ? 1 : -1) * 2.6, z: (this.rnd() - 0.5) * 3, gold: false });
  }

  // ---- the AI ------------------------------------------------------------------------------------

  private decide(m: Mon) {
    const sk = m.sk;
    m.think = 0.08 + (1 - sk) * 0.22 + this.rnd() * 0.08;
    m.pace = 1;
    const a = m.a.pos;
    const reach = BR + PR;
    // a dive coming at me: hop over it (the abler, the more often)
    for (const r of this.mons) {
      if (r.team === m.team || r.st !== "dive" || m.seen[r.seat] === r.dives) continue;
      const rx = a.x - r.a.pos.x;
      const rz = a.z - r.a.pos.z;
      const d = Math.hypot(rx, rz);
      if (d < 3.4 && (rx * r.dx + rz * r.dz) / (d || 1) > 0.8) {
        m.seen[r.seat] = r.dives;
        if (this.rnd() < 0.06 + 0.45 * sk) this.jump(m);
      }
    }
    // (the weaker ones dawdle now and then)
    if (this.rnd() < (1 - sk) * 0.05) {
      m.pace = 0.4;
      m.think += 0.3;
      return;
    }
    const own = this.ownX(m.team);
    const sg = m.team === 0 ? 1 : -1;
    const b = m.ball >= 0 ? this.balls[m.ball] : null;
    if (!b) {
      // no ball in play: wait by where the next one lands, on our side of it
      let x = 0;
      let z = 0;
      const dropping = this.balls.find((q) => q.on && q.st === "drop");
      if (dropping) ((x = dropping.x), (z = dropping.z));
      else if (this.drops.length) ((x = this.drops[0].x), (z = this.drops[0].z));
      m.tx = x - sg * (m.role === 0 ? 2.4 : 7.5);
      m.tz = z * 0.5;
      return;
    }
    // shove the carrier: a rival right at a ball, pushing it toward our goal, within a dive of me
    if (m.cd <= 0 && m.a.grounded) {
      for (const r of this.mons) {
        if (r.team === m.team || r.st !== "run") continue;
        const rx = r.a.pos.x + r.vx * 0.12 - a.x;
        const rz = r.a.pos.z + r.vz * 0.12 - a.z;
        const d = Math.hypot(rx, rz);
        if (d > 3.3 || d < 0.3) continue;
        let hot = false;
        for (const c of this.balls) {
          if (!c.on || c.st !== "play") continue;
          const ux = c.x - r.a.pos.x;
          const uz = c.z - r.a.pos.z;
          const du = Math.hypot(ux, uz);
          if (du > reach + 0.9) continue;
          const gx = own - c.x;
          const gz = -c.z;
          const dg = Math.hypot(gx, gz);
          if (dg < 15 && (ux * gx + uz * gz) / (du * dg || 1) > 0.3) hot = true;
        }
        if (hot && this.rnd() < 0.2 + 0.45 * sk) {
          const ang = Math.atan2(rx, rz) + (this.rnd() - 0.5) * (1 - sk) * 0.7;
          this.dive(m, Math.sin(ang), Math.cos(ang));
          return;
        }
      }
    }
    const lead = 0.12 + 0.22 * sk;
    const bx = b.x + b.vx * lead;
    const bz = b.z + b.vz * lead;
    if (m.role === 1) this.defend(m, b, bx, bz, own, sg, reach);
    else this.attack(m, b, bx, bz, own, reach);
    // a ball in the air right by me: a header
    if (m.a.grounded && b.y > this.floorAt(b.x) + BR + 0.8 && Math.hypot(b.x - a.x, b.z - a.z) < reach + 0.9 && this.rnd() < 0.15 + 0.5 * sk) this.jump(m);
  }

  private attack(m: Mon, b: Ball, bx: number, bz: number, own: number, reach: number) {
    const sk = m.sk;
    const a = m.a.pos;
    const tgx = -own;
    // aim: away from their keeper, the abler the nearer the post (plus a miss of its own)
    let keeperZ = 0;
    for (const r of this.mons) if (r.team !== m.team && r.role === 1) keeperZ = r.a.pos.z;
    if (this.rnd() < 0.08) m.aimN = (this.rnd() - 0.5) * (1 - sk) * 3.2;
    const aimZ = clamp(-Math.sign(keeperZ - bz * 0.3 || 1) * (GW - 1.0) * (0.25 + 0.6 * sk) + m.aimN, -GW + 0.6, GW - 0.6);
    let dx = tgx - bx;
    let dz = aimZ - bz;
    let dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    // (against a wall there's no room behind it: push it off the wall first)
    if (Math.abs(bz - dz * (reach + 0.3)) > HD - PR - 0.05) {
      dz = dz * 0.3 - Math.sign(bz) * 0.75;
      dl = Math.hypot(dx, dz) || 1;
      dx /= dl;
      dz /= dl;
    }
    const rx = a.x - bx;
    const rz = a.z - bz;
    const along = rx * dx + rz * dz;
    const side = -rx * dz + rz * dx;
    if (along > -reach * 0.5) {
      // not behind it: round it on my side, clear of it (out to its side first when in front of it;
      // on the roof, by the edge, round its inner side: the edge's side would shove it off)
      let s = side >= 0 ? 1 : -1;
      if (this.L.open && bz > HD - 3.2 && (bz + dx * s * (reach + 1.1) > bz) && sk > 0.3) s = -s;
      const back = along > reach * 0.3 ? -reach * 0.2 : reach * 0.9;
      m.tx = bx - dz * s * (reach + 1.1) - dx * back;
      m.tz = bz + dx * s * (reach + 1.1) - dz * back;
      m.charge = false;
    } else {
      const tol = 0.3 + (1 - sk) * 0.6;
      if (Math.abs(side) < tol) {
        m.tx = bx + dx * 3;
        m.tz = bz + dz * 3;
        m.charge = true;
      } else {
        m.tx = bx - dx * (reach + 0.2);
        m.tz = bz - dz * (reach + 0.2);
        m.charge = false;
      }
    }
    // the shot: a dive into it, close enough, lined up
    const dGoal = Math.hypot(tgx - b.x, b.z);
    const dBall = Math.hypot(rx, rz);
    if (m.cd <= 0 && m.a.grounded && dGoal < 9) {
      for (const r of this.mons) {
        if (r.team === m.team || r.st !== "run") continue;
        // (a rival keeping the goal right in front of the ball: clear the way)
        const kx = r.a.pos.x - bx;
        const kz = r.a.pos.z - bz;
        const kAlong = kx * dx + kz * dz;
        const kSide = Math.abs(-kx * dz + kz * dx);
        const qx = r.a.pos.x - a.x;
        const qz = r.a.pos.z - a.z;
        const dq = Math.hypot(qx, qz);
        if (kAlong > 0 && kAlong < reach + 1.4 && kSide < reach && dq < 3.6 && this.rnd() < 0.15 + 0.35 * sk) {
          this.dive(m, qx / dq, qz / dq);
          return;
        }
      }
    }
    const near = dGoal < 5 + 6 * sk + (this.ot ? 3 : 0);
    // (or a long one from further out, now and then, when it's lined up well; in overtime, more often)
    const long = !near && dGoal < 17 && Math.abs(side) < 0.35 && this.rnd() < (0.05 + 0.12 * sk) * (this.ot ? 2 : 1);
    if (m.charge && m.cd <= 0 && m.a.grounded && dBall < reach + 1.4 && (long || (near && this.rnd() < 0.25 + 0.5 * sk))) {
      const ang = Math.atan2(bx - a.x, bz - a.z) + (this.rnd() - 0.5) * (1 - sk) * 0.5;
      this.dive(m, Math.sin(ang), Math.cos(ang));
    }
  }

  private defend(m: Mon, b: Ball, bx: number, bz: number, own: number, sg: number, reach: number) {
    const sk = m.sk;
    const a = m.a.pos;
    const dg = Math.hypot(bx - own, bz);
    const vin = -(b.vx * sg);
    const threat = dg < 6.5 + 2.5 * sk || (vin > 3.5 && dg < 12);
    if (!threat) {
      // guard: a third of the way from our goal to the ball (the weaker ones a step off where they should be)
      m.wrong = false;
      if (this.rnd() < 0.06) m.aimN = (this.rnd() - 0.5) * (1 - sk) * 3.4;
      m.tx = own + (bx - own) * 0.3;
      m.tz = clamp(bz * 0.36 + m.aimN, -(GW - 0.2), GW - 0.2);
      m.tx = sg > 0 ? clamp(m.tx, own + 1.3, own + 7) : clamp(m.tx, own - 7, own - 1.3);
      m.charge = false;
      return;
    }
    // clear it: out from our goal, and wide (on the roof, the abler clear it away from the edge)
    let cx = sg * Math.max(sg * (bx - own), 3.2);
    const wide = this.L.open && bz > -1.5 && sk > 0.35 ? -1 : bz >= 0 ? 1 : -1;
    let cz = bz + wide * 1.3;
    const cl = Math.hypot(cx, cz) || 1;
    cx /= cl;
    cz /= cl;
    const rx = a.x - bx;
    const rz = a.z - bz;
    const goalSide = rx * cx + rz * cz < -reach * 0.35;
    if (!goalSide && !m.wrong) {
      m.wrong = true;
      // (caught on the wrong side near our goal: some panic and charge it straight, maybe in)
      if (dg < 7.5 && this.rnd() < 0.04 + 0.22 * (1 - sk)) m.panic = 0.7;
    }
    if (goalSide) m.wrong = false;
    const dBall = Math.hypot(rx, rz);
    if (m.panic > 0) {
      m.tx = bx;
      m.tz = bz;
      m.charge = true;
      if (m.cd <= 0 && m.a.grounded && dBall < reach + 1.5 && this.rnd() < 0.3) this.dive(m, -rx / (dBall || 1), -rz / (dBall || 1));
    } else if (goalSide) {
      m.tx = bx + cx * 3;
      m.tz = bz + cz * 3;
      m.charge = true;
      if (dg < 4.8 && m.cd <= 0 && m.a.grounded && dBall < reach + 1.3 && this.rnd() < 0.2 + 0.4 * sk) this.dive(m, -rx / (dBall || 1), -rz / (dBall || 1));
    } else {
      // get back goal-side: round the ball on my side of it (by the roof's edge: its inner side)
      const px = -cz;
      const pz = cx;
      let s = rx * px + rz * pz >= 0 ? 1 : -1;
      if (this.L.open && bz > HD - 3.2 && pz * s > 0 && sk > 0.3) s = -s;
      m.tx = bx - cx * (reach + 0.7) + px * s * (reach + 0.9);
      m.tz = bz - cz * (reach + 0.7) + pz * s * (reach + 0.9);
      m.charge = false;
    }
  }

  // ---- the look --------------------------------------------------------------------------------------

  private look(dt: number, gdt: number) {
    const now = (this.clk += Math.max(0, dt));
    // the pitch's tilt
    this.slope += clamp(this.slopeTo - this.slope, -dt * 0.22, dt * 0.22);
    const ang = Math.atan(this.slope);
    this.pitch.rotation.z = ang;
    this.warnTilt = Math.max(0, this.warnTilt - gdt);
    this.arrowMat.opacity = this.warnTilt > 0 ? 0.45 + 0.45 * Math.abs(Math.sin(now * 7)) : Math.max(0, this.arrowMat.opacity - dt * 2);
    this.arrows.visible = this.arrowMat.opacity > 0.01;
    // the bumpers: the warning rings, the rise, a squash when hit
    this.bumpRingMat.opacity = this.ev.bumpWarn && !this.ev.bumpUp ? 0.45 + 0.45 * Math.abs(Math.sin(now * 9)) : 0;
    this.bumpRing.visible = this.bumpRingMat.opacity > 0.01;
    let dirty = false;
    if (this.ev.bumpUp && this.bumpH < 1) {
      this.bumpH = Math.min(1, this.bumpH + gdt * 2.6);
      dirty = true;
    }
    for (let i = 0; i < 4; i++)
      if (this.bumpPulse[i] > 0) {
        this.bumpPulse[i] = Math.max(0, this.bumpPulse[i] - dt * 4);
        dirty = true;
      }
    if (dirty) this.placeBumpers(backOut(this.bumpH));
    this.weather(dt, gdt, now);
    // the snarks: lean (a dive, flat on the back, a sulk, tumbling off the roof), the spin when knocked
    for (const m of this.mons) {
      const a = m.a;
      if ((m.st === "down" || m.st === "fall") && !a.grounded) a.yaw += m.spin * dt;
      if (m.flip > 0) {
        m.flip -= dt;
        if (m.flip <= 0) a.body.jump();
      }
      const want = m.st === "dive" ? 1.3 : m.st === "rec" ? 1.45 : m.st === "down" ? -1.45 : m.st === "sulk" ? 0.32 : m.st === "fall" ? -1.0 + Math.sin(now * 11) * 0.5 : 0;
      m.lean += (want - m.lean) * Math.min(1, dt * (m.st === "run" ? 10 : 16));
      a.body.root.rotation.x = m.lean;
      a.body.root.position.y = Math.abs(m.lean) > 0.5 ? 0.26 * MS * Math.min(1, (Math.abs(m.lean) - 0.5) * 1.4) : 0;
      a.legs = m.st === "run" ? null : 0;
      a.sync(dt);
      // (their shadow and ring lie on the tilted pitch)
      if (a.shadow) ((a.shadow.rotation.order = "ZXY"), (a.shadow.rotation.z = ang));
      if (a.ring) ((a.ring.rotation.order = "ZXY"), (a.ring.rotation.z = ang));
      if (this.over && m.st === "joy" && a.grounded && Math.random() < dt * 1.6) (a.jump(8), a.cheer(1.5));
      // (a skid on the ice throws up a spray)
      if (this.ice.length && a.grounded && gdt > 0 && Math.hypot(m.vx, m.vz) > 3.5 && Math.random() < dt * 9 && this.onIce(a.pos.x, a.pos.z)) this.fx.burst(this.v.set(a.pos.x, 0.15, a.pos.z), 3, ["#ffffff", "#cdeeff"], { speed: 2.5, up: 2, size: 0.12, life: 0.4 });
    }
    // the visitor's aim arrow
    const hm = this.human;
    if (hm && this.phase === "play" && !this.over && hm.st === "run") {
      const p = hm.a.pos;
      const fx = Math.sin(hm.a.yaw);
      const fz = Math.cos(hm.a.yaw);
      this.aim.visible = true;
      this.aim.position.set(p.x + fx * 1.15, this.floorAt(p.x + fx * 1.15) + 0.06, p.z + fz * 1.15);
      // (the triangle's tip is its +x: turned to the yaw)
      this.aim.rotation.set(-Math.PI / 2, hm.a.yaw - Math.PI / 2, 0);
      this.aim.material = glow(hm.cd > 0 ? "#9aa0b8" : "#ffffff", 0.85);
    } else this.aim.visible = false;
    // the balls: rolling, the shadow, the halo, the landing ring
    for (const b of this.balls) {
      if (!b.on || b.st === "off") {
        b.ring.visible = false;
        if (b.on) {
          b.g.position.set(b.x, b.y, b.z);
          b.shadow.visible = false;
        }
        continue;
      }
      b.g.position.set(b.x, b.y, b.z);
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0.02 && gdt > 0) {
        this.v.set(b.vz, 0, -b.vx).normalize();
        this.q.setFromAxisAngle(this.v, (sp * gdt) / BR);
        b.body.quaternion.premultiply(this.q);
      }
      if (b.st === "net") b.g.scale.setScalar(Math.max(0.05, 1 - Math.max(0, b.t - 0.45) * 3));
      // (a ball flying fast leaves puffs behind it)
      if (sp > 11 && gdt > 0 && Math.random() < dt * 30) this.fx.burst(this.v.set(b.x - (b.vx / sp) * BR * 0.9, b.y, b.z - (b.vz / sp) * BR * 0.9), 2, b.gold ? ["#ffd23f", "#fff4c4"] : ["#ffffff", "#ffe9a8"], { speed: 0.6, up: 0.3, gravity: 0, size: 0.32, life: 0.35 });
      const fl = this.floorAt(b.x);
      const up = Math.max(0, b.y - BR - fl);
      b.shadow.visible = true;
      b.shadow.position.set(b.x, fl + 0.035, b.z);
      b.shadow.rotation.z = ang;
      const ss = BR * 2 * Math.max(0.35, 1 - up * 0.06);
      b.shadow.scale.set(ss, ss, 1);
      // the gloss: up and to the left, toward the camera, never rolling
      const cm = this.w.camera.matrixWorld.elements;
      b.glint.quaternion.copy(this.w.camera.quaternion);
      b.glint.position.set((-cm[0] * 0.42 + cm[4] * 0.5 + cm[8] * 0.85) * BR, (-cm[1] * 0.42 + cm[5] * 0.5 + cm[9] * 0.85) * BR, (-cm[2] * 0.42 + cm[6] * 0.5 + cm[10] * 0.85) * BR);
      b.halo.visible = b.gold;
      if (b.gold) {
        b.halo.quaternion.copy(this.w.camera.quaternion);
        b.halo.scale.setScalar(BR * (3.1 + Math.sin(now * 6) * 0.25));
        if (Math.random() < dt * 14) this.fx.burst(this.v.set(b.x + (Math.random() - 0.5) * 2, b.y + (Math.random() - 0.3) * 2, b.z + (Math.random() - 0.5) * 2), 2, ["#fff4c4", "#ffd23f"], { speed: 1, up: 1, gravity: 2, size: 0.14, life: 0.6 });
      }
      b.ring.visible = b.st === "drop";
      if (b.st === "drop") {
        b.ring.position.set(b.x, fl + 0.05, b.z);
        b.ring.rotation.z = ang;
        const k = 1 - clamp((b.y - BR) / 14, 0, 1);
        b.ring.scale.setScalar(BR * (2.2 + (1 - k) * 2.2));
        this.ringMats[b.i].opacity = 0.5 + 0.4 * Math.abs(Math.sin(now * 10));
        this.ringMats[b.i].color.set(b.gold ? "#ffd23f" : "#ffffff");
      }
    }
    // the goals' lines settle after a flash
    for (const gl of this.goalGlow) gl.scale.x += (0.32 - gl.scale.x) * Math.min(1, dt * 4);
    // the crowd bobbing, the scoring house's on its feet
    for (let i = 0; i < 2; i++) this.cheer[i] = Math.max(0, this.cheer[i] - dt);
    this.fanAt.forEach((f, i) => {
      const hype = this.cheer[f.team] > 0;
      const bob = hype ? Math.abs(Math.sin(now * 9 + f.ph)) * 0.55 : Math.abs(Math.sin(now * 3 + f.ph)) * 0.08;
      this.q.identity();
      this.fans.setMatrixAt(i, this.m4.compose(this.v.set(f.x, f.y + 0.4 + bob, f.z), this.q, this.sc.set(0.56, 0.72, 0.42)));
      this.heads.setMatrixAt(i, this.m4.compose(this.v.set(f.x, f.y + 1.0 + bob, f.z), this.q, this.sc.set(0.46, 0.44, 0.42)));
      // the arms: swinging low, both up and waving when their house scores (some always at it)
      const keen = (i * 7) % 5 === 0;
      for (let k = 0; k < 2; k++) {
        const sd = k ? 1 : -1;
        const up = hype || (keen && Math.sin(now * 1.3 + f.ph) > 0.2);
        const a = up ? sd * (2.6 + Math.sin(now * 10 + f.ph + k) * 0.35) : sd * (0.25 + Math.sin(now * 2 + f.ph) * 0.12);
        this.q.setFromAxisAngle(this.v2.set(0, 0, 1), a);
        this.v.set(f.x + sd * 0.34 - Math.sin(a) * 0.22, f.y + 0.68 + bob + -Math.cos(a) * 0.22, f.z);
        this.arms.setMatrixAt(i * 2 + k, this.m4.compose(this.v, this.q, this.sc.set(0.15, 0.48, 0.15)));
      }
      // a flag on a stick over every third head, waving
      if (i % 3 === 0) {
        const w = Math.sin(now * (hype ? 9 : 3.5) + f.ph) * 0.5;
        this.q.setFromAxisAngle(this.v2.set(0, 1, 0), w);
        this.fanFlags.setMatrixAt(i, this.m4.compose(this.v.set(f.x + 0.3, f.y + 1.75 + bob, f.z), this.q, this.sc.set(0.62, 0.4, 0.04)));
      } else this.fanFlags.setMatrixAt(i, this.m4.compose(this.v.set(0, -50, 0), this.q.identity(), this.sc.set(0, 0, 0)));
    });
    this.fans.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.arms.instanceMatrix.needsUpdate = true;
    this.fanFlags.instanceMatrix.needsUpdate = true;
    this.pennantAt.forEach((p, i) => {
      this.q.setFromAxisAngle(this.v2.set(0, 1, 0), Math.sin(now * 2.6 + i * 0.9) * 0.45);
      this.pennants.setMatrixAt(i, this.m4.compose(this.v.set(p.x + 0.45, p.y, p.z), this.q, this.sc.set(0.9, 0.55, 0.04)));
    });
    this.pennants.instanceMatrix.needsUpdate = true;
    // the nets bulge after a goal
    for (const n of this.nets) {
      if (n.k <= 0) continue;
      n.k = Math.max(0, n.k - dt * 1.6);
      const sx = 1 + Math.sin(n.k * Math.PI * 3) * 0.12 * n.k;
      n.m.scale.x = sx;
      n.m.position.x = n.x0 * (1 - sx);
    }
    for (const f of this.ticks) f(dt, now);
    for (const qb of this.qbs) {
      qb.rotation.y += dt * 1.1;
      qb.position.y = 7.2 + Math.sin(now * 1.6 + qb.position.x) * 0.3;
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    for (let i = 0; i < 2; i++) this.scorePop[i] = Math.max(0, this.scorePop[i] - dt * 1.6);
    for (const bn of this.banners) bn.t += dt;
    this.banners = this.banners.filter((bn) => bn.t < bn.d);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.9);
    this.fx.update(dt);
  }

  /** The level's weather and lights: the frost before the freeze, the snow; the rain of the monsoon, the edge's blinking lights. */
  private weather(dt: number, gdt: number, now: number) {
    if (this.frost && this.frostMat) {
      this.freezeWarn = Math.max(0, this.freezeWarn - gdt);
      const k = this.freezeWarn > 0 ? 1 - this.freezeWarn / WARN : 0;
      this.frostMat.opacity = this.freezeWarn > 0 ? 0.35 + 0.5 * Math.abs(Math.sin(now * 9)) : 0;
      this.frost.visible = this.freezeWarn > 0;
      if (this.frost.visible) {
        // (the rings close in on the patches to be)
        const flat = this.q.setFromAxisAngle(this.v.set(1, 0, 0), -Math.PI / 2);
        ICE1.forEach(([x, z, rx, rz], i) => this.frost!.setMatrixAt(i, this.m4.compose(this.v.set(x, 0.05, z), flat, this.sc.set(rx * 2 * (1.5 - 0.5 * k), rz * 2 * (1.5 - 0.5 * k), 1))));
        this.frost.instanceMatrix.needsUpdate = true;
      }
    }
    if (this.snow) {
      const gust = Math.sin(now * 0.4) * 0.8;
      this.flakes.forEach((f, i) => {
        f.y -= f.v * dt;
        f.x += (gust + Math.sin(now * 1.3 + f.ph) * 0.4) * dt;
        if (f.y < -0.8) ((f.y = 22 + this.deco() * 3), (f.x = (this.deco() - 0.5) * 56));
        this.snow!.setMatrixAt(i, this.m4.compose(this.v.set(f.x, f.y, f.z), this.q.identity(), this.sc.setScalar(0.13)));
      });
      this.snow.instanceMatrix.needsUpdate = true;
    }
    if (this.rain && this.rainMat) {
      const on = this.ev.windWarn && !this.ev.calm ? 1 : 0;
      this.rainMat.opacity += (on * 0.45 - this.rainMat.opacity) * Math.min(1, dt * 2);
      this.rain.visible = this.rainMat.opacity > 0.01;
      if (this.rain.visible) {
        const drift = 3 + this.wind * 9;
        const lean = Math.atan2(drift, 18);
        this.q.setFromAxisAngle(this.v2.set(1, 0, 0), lean);
        this.drip.forEach((d, i) => {
          d.y -= d.v * dt;
          d.z += drift * dt;
          if (d.y < -0.6 || d.z > 16) ((d.y = 12 + this.deco() * 7), (d.z = -16 + this.deco() * 26), (d.x = (this.deco() - 0.5) * 44));
          this.rain!.setMatrixAt(i, this.m4.compose(this.v.set(d.x, d.y, d.z), this.q, this.sc.set(0.05, 1.3, 0.05)));
        });
        this.rain.instanceMatrix.needsUpdate = true;
        if (this.wind > 0.3 && this.deco() < dt * 6) this.fx.burst(this.v.set((this.deco() - 0.5) * 2 * HL, 0.1, (this.deco() - 0.5) * 2 * HD), 3, ["#bfe6ff", "#ffffff"], { speed: 1.5, up: 1.5, size: 0.08, life: 0.35 });
      }
    }
    if (this.edgeLights) {
      // the lights along the edge chase toward it, faster in the monsoon
      const n = this.edgeLights.count;
      const sp = 3 + this.wind * 6;
      for (let i = 0; i < n; i++) {
        const on = (Math.floor(now * sp) + i) % 4 < 2;
        this.edgeLights.setColorAt(i, this.col.set(on ? (this.wind > 0.2 ? "#ffe14d" : "#ff3b4f") : "#5a1a2a"));
      }
      this.edgeLights.instanceColor!.needsUpdate = true;
    }
  }

  view() {
    return this.w;
  }

  // ---- the HUD -------------------------------------------------------------------------------------

  draw(g: CanvasRenderingContext2D) {
    const cam = this.w.camera;
    // the name tags, in the house's colour
    // (one by the far wall would sit on the scoreboard: it stops under it)
    const top = HUD.min ? 92 : 80;
    for (const m of this.mons) {
      const s = toScreen(m.a.head(this.v), cam);
      if (s.on) tag(g, m.p, s.x, s.x > 140 && s.x < W - 140 ? Math.max(top, s.y) : s.y);
    }
    this.pops.forEach((p, i) => {
      const s = toScreen(this.v.set(p.x, p.y, p.z), cam);
      if (!s.on) return;
      const k = p.t / 0.9;
      // (one close after another: stacked up)
      let lift = 0;
      for (let j = 0; j < i; j++) if (Math.abs(this.pops[j].x - p.x) + Math.abs(this.pops[j].z - p.z) < 3) lift += 26;
      g.save();
      g.globalAlpha = k > 0.65 ? (1 - k) / 0.35 : 1;
      const sz = 27 * (k < 0.15 ? backOut(k / 0.15) : 1);
      toy(g, p.s, s.x, s.y - k * 30 - lift, sz, p.c);
      g.restore();
    });
    // which goal is whose, for this screen's player: through the 3-2-1 and the first seconds
    if (this.me && !this.over) {
      const k = this.phase === "count" ? clamp(this.phaseK * 5, 0, 1) : this.phase === "play" ? clamp((3.4 - this.t) / 0.6, 0, 1) : 0;
      if (k > 0) this.drawSides(g, this.me, k);
    }
    this.drawBoard(g);
    if (this.phase === "count") this.drawIntro(g, this.phaseK);
    for (const bn of this.banners) banner(g, bn.s, bn.t / bn.d, bn.c, bn.y, bn.size);
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${(this.flash * 0.45).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
    }
  }

  /** Over each goal's mouth: the one to keep (dark, in the house's colour), the one to score in (gold, an arrow toward it, beating). */
  private drawSides(g: CanvasRenderingContext2D, me: Mon, k: number) {
    const hs = this.house[me.team];
    for (const sg of [-1, 1]) {
      const own = sg * this.ownX(me.team) > 0;
      const s = toScreen(this.v.set(sg * (HL - 0.4), 2.3, 0), this.w.camera);
      if (!s.on) continue;
      const word = own ? T("YOUR GOAL", "你的球门") : T("SCORE HERE", "攻这里");
      const beat = own ? 1 : 1 + Math.sin(this.clk * 7) * 0.05;
      grow(g, s.x, s.y, 13, () => {
        g.save();
        g.globalAlpha = k;
        g.translate(s.x, s.y);
        g.scale(beat, beat);
        g.font = "900 13px Geist, Roboto, sans-serif";
        const w = g.measureText(word).width + (own ? 24 : 40);
        rr(g, -w / 2, -9, w, 24, 12);
        g.fillStyle = "rgba(6,3,18,0.38)";
        g.fill();
        rr(g, -w / 2, -12, w, 24, 12);
        g.fillStyle = own ? "rgba(15,10,38,0.92)" : "#ffd23f";
        g.fill();
        g.lineWidth = 2.5;
        g.strokeStyle = own ? hs.color : INK;
        g.stroke();
        text(g, word, own ? 0 : -sg * 8, 1, 13, own ? "#ffffff" : INK, "center", 900);
        if (!own) {
          // (the arrow, toward that goal)
          const ax = sg * (w / 2 - 14);
          g.beginPath();
          g.moveTo(ax + sg * 5, 0);
          g.lineTo(ax - sg * 4, -6);
          g.lineTo(ax - sg * 4, 6);
          g.closePath();
          g.fillStyle = INK;
          g.fill();
        }
        g.restore();
      });
    }
  }

  /** The scoreboard: each house's two, its name, its goals, the clock between them. */
  private drawBoard(g: CanvasRenderingContext2D) {
    const cx = W / 2;
    const y = 11;
    const h = 50;
    const pw = 272;
    for (let team = 0; team < 2; team++) {
      const hs = this.house[team];
      const left = team === 0;
      // (clear of the clock, a little wider on a small screen)
      const gap = HUD.min ? Math.max(58, 56 * clockK() + 4) : 58;
      const x0 = left ? cx - gap - pw : cx + gap;
      g.save();
      rr(g, x0, y + 4, pw, h, 17);
      g.fillStyle = "rgba(6,3,18,0.38)";
      g.fill();
      rr(g, x0, y, pw, h, 17);
      const body = g.createLinearGradient(0, y, 0, y + h);
      body.addColorStop(0, "rgba(38,28,86,0.93)");
      body.addColorStop(1, "rgba(15,10,38,0.95)");
      g.fillStyle = body;
      g.fill();
      const wash = g.createLinearGradient(left ? x0 : x0 + pw, 0, left ? x0 + pw * 0.75 : x0 + pw * 0.25, 0);
      wash.addColorStop(0, hs.color);
      wash.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.38;
      g.fillStyle = wash;
      g.fill();
      g.globalAlpha = 1;
      g.lineWidth = 2.5;
      g.strokeStyle = hs.color;
      g.stroke();
      // the goals, on a tile by the clock
      const tw = 52;
      const tx = left ? x0 + pw - tw - 5 : x0 + 5;
      const pop = this.scorePop[team];
      g.save();
      g.translate(tx + tw / 2, y + h / 2);
      const ps = 1 + Math.sin(pop * Math.PI) * 0.25;
      g.scale(ps, ps);
      rr(g, -tw / 2, -h / 2 + 5, tw, h - 10, 12);
      const tg = g.createLinearGradient(0, -h / 2, 0, h / 2);
      tg.addColorStop(0, tint(hs.color, 0.2));
      tg.addColorStop(1, hs.deep);
      g.fillStyle = tg;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = INK;
      g.stroke();
      numeral(g, String(this.score[team]), 0, 1, 32, "#ffffff", "center");
      g.restore();
      // the two of them
      const ms = this.teams[team];
      ms.forEach((m, i) => {
        const bx = left ? x0 + 25 + i * 37 : x0 + pw - 25 - i * 37;
        badge(g, m.p, bx, y + h / 2, 31, { rim: m.human ? "#ffffff" : undefined });
      });
      const nx = left ? x0 + 25 + 37 + 23 : x0 + pw - 25 - 37 - 23;
      // (the long house name a size down: clear of the goals' tile)
      toy(g, T(hs.en, hs.zh), nx, y + 18, hs.en.length > 8 ? 15 : 18, hs.color, { align: left ? "left" : "right", rim: false });
      const names = ms.map((m) => short(m.p)).join(" · ");
      text(g, names, nx, y + 38, 11.5, "rgba(255,255,255,0.85)", left ? "left" : "right", 800);
      g.restore();
    }
    const left = this.ot ? TIME + OT_CAP - this.t : TIME - this.t;
    clock(g, Math.max(0, left), 36);
    // under the clock: overtime, the golden ball
    const chip = this.ot ? [T("OVERTIME", "加时"), "#ff4b5c"] : this.balls.some((b) => b.on && b.gold) ? [T("GOLD ×2", "黄金 ×2"), "#ffb800"] : null;
    if (chip) {
      g.save();
      g.font = "900 12px Geist, Roboto, sans-serif";
      const w = g.measureText(chip[0]).width + 22;
      rr(g, cx - w / 2, 64, w, 20, 10);
      g.fillStyle = chip[1];
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "#ffffff";
      g.stroke();
      text(g, chip[0], cx, 74.5, 12, "#ffffff", "center", 900);
      g.restore();
    }
  }

  /** On the 3-2-1: who plays with whom. */
  private drawIntro(g: CanvasRenderingContext2D, k: number) {
    const e = easeOut(clamp(k * 2.6, 0, 1));
    // (a touch screen: the bottom is the thumbs', so the teams line up under the scoreboard)
    const y = HUD.thumbs ? 136 : 452;
    for (let team = 0; team < 2; team++) {
      const hs = this.house[team];
      const left = team === 0;
      const cx = left ? W * 0.27 - (1 - e) * 420 : W * 0.73 + (1 - e) * 420;
      const w = 316;
      const h = 92;
      g.save();
      g.translate(cx, y);
      rr(g, -w / 2, -h / 2 + 5, w, h, 22);
      g.fillStyle = "rgba(6,3,18,0.45)";
      g.fill();
      rr(g, -w / 2, -h / 2, w, h, 22);
      const bg = g.createLinearGradient(0, -h / 2, 0, h / 2);
      bg.addColorStop(0, tint(hs.deep, -0.25));
      bg.addColorStop(1, tint(hs.dark, -0.3));
      g.fillStyle = bg;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = hs.color;
      g.stroke();
      toy(g, T(hs.en, hs.zh), 0, -h / 2 + 4, 30, hs.color);
      const ms = this.teams[team];
      ms.forEach((m, i) => {
        const x = (i - 0.5) * 148;
        badge(g, m.p, x - 42, 18, 40, { rim: m.human ? "#ffffff" : undefined });
        text(g, m.human ? T("YOU", "你") : short(m.p), x - 16, 18, 16, "#ffffff", "left", 900);
      });
      g.restore();
    }
    const vk = clamp((k - 0.15) * 4, 0, 1);
    if (vk > 0) {
      g.save();
      g.translate(W / 2, y + 4);
      g.scale(backOut(vk), backOut(vk));
      toy(g, "VS", 0, 0, 40, "#ffffff");
      g.restore();
    }
  }

  result() {
    return this.over;
  }

  dispose() {
    for (const m of this.mons) m.a.dispose();
    disposeScene(this.w.scene);
    // (the ball look not worn at the end is not in the scene any more)
    for (const m of this.ballMats) {
      (m as THREE.MeshToonMaterial).map?.dispose();
      m.dispose();
    }
    live = null;
  }
}

// ---- the card --------------------------------------------------------------------------------------

const HELP = "2 vs 2, Shielded vs Transparent! Run with the arrows and shove the giant ⓩ ball into the rival goal. A: jump, header. B: dive: it knocks a rival flat or punts the ball.";
const HELP_ZH = "二对二：屏蔽队对透明队！方向键跑动，把巨型 ⓩ 球推进对方球门。A：跳、头球。B：飞扑：撞倒对手或大脚射门。";

export const QBALL: MiniDef = {
  key: "qball",
  title: "Z-BALL CUP",
  titleZh: "Z球杯",
  tag: "Shielded vs Transparent · 2 on 2 · most goals in 50 s: over ZStreet, on the frozen lake, on a Marina Bay roof",
  tagZh: "屏蔽对透明 · 二对二 · 50 秒进球多者胜：ZStreet 上空、冰封湖面、滨海湾屋顶",
  get help() {
    if (!live) return HELP;
    return `2 vs 2! You + ${live.mate} are team ${live.us.en}. Shove the giant ⓩ ball into team ${live.them.en}'s goal on the right. A: jump, header. B: dive: knock a rival flat or punt the ball.`;
  },
  get helpZh() {
    if (!live) return HELP_ZH;
    return `二对二！你和 ${live.mate} 是${live.us.zh}队。把巨型 ⓩ 球推进右边${live.them.zh}队的球门。A：跳、头球。B：飞扑：撞倒对手或大脚射门。`;
  },
  pad: ["left", "right", "up", "down", "a", "b"],
  tap: false,
  color: "#ff8a4c",
  song: "hero",
  ambience: "crowd",
  teams: true,
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `qball-${l.key}`, song: l.song, ambience: l.ambience })),
  make: (players, rnd, variant) => new QBall(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};

export default QBALL;
