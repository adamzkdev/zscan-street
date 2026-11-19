/**
 * PROVE THE BLOCK (证明区块): ZK PARTY's memory race, on a floor of nine sigil pads under a giant
 * floating block. Every shielded Zcash transaction carries a zk proof; here the block shows the
 * proof to build, one zkSNARK sigil at a time (its pad rises, glows and sings its own note), then
 * hides it. Run onto the pads in that order: each right pad stamps your ink on it and lights a bead
 * over your head; a wrong pad buzzes, staggers you and starts your proof over (the pads you have
 * already stamped are safe to cross, every other one counts). B shoves: a short lunge with a wind-up
 * you can see, that knocks a rival aside and costs them a bead (then they're guarded a moment: no
 * stun-locks). The first to finish proves the block (+5 and its beads); everyone else banks the beads
 * they hold when it's proven. Four blocks that grow: SAPLING (3 sigils), ORCHARD (4), IRONWOOD
 * (5) and the LAST BLOCK (6), the pads shuffling before the last two. Stuck? After a while a HINT
 * fades in on the block, slowly, so a round never stalls; and every block has a time cap.
 *
 * The pads' sigils are zkSNARKs' sigils: theme.ts `sigilOf`, the mirrored 7×7 sigil
 * with its two eyes, nine distinct ones picked per game (the block names each: "SNARK #1234").
 *
 * The AIs remember the proof with errors by skill (a sigil swapped for a neighbour or for the
 * next one, a hesitation), path round the pads they must not touch (a little visibility graph over
 * the lanes), and the good ones shove whoever is ahead.
 *
 * Three levels (LEVELS below: a layout, its cameras, its twist, its set in sign-levels/):
 * PROOF POINT (the lilac plaza at dusk, the 3×3 grid), PARK CAROUSEL (a winter night in Central Park: the pads
 * in a ring round a middle one on a round plaza that TURNS while you run, and turns back after a
 * warning) and SPROUT RUIN (a storm over the ruins of Sprout, the first shielded pool: the pads in a diamond on a cracked octagon,
 * and the lights go OUT while you run: your lantern and the lightning show the pads).
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { sigilOf as zkSigil } from "../theme";
import { music, type SongKey } from "../music";
import { FONT, H, MONO, W, backOut, clamp, ease, rankBy, rng, rr, sfx, shout, sound, text, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { ASTANA_R, astanaSet } from "./sign-levels/astana";
import { pointWorld } from "./sign-levels/point";
import { RUIN_D, RUIN_H, ruinSet } from "./sign-levels/ruin";
import type { SetCtx, SetLive } from "./sign-levels/types";
import { Bobs, pools } from "./sign-levels/parts";
import { Avatar, CamRig, Fx3, GEO, banner, block, canvasTex, cornerSpot, corners, disposeScene, glow, outline, qBlock, short, tag, toScreen, toon, world, yawOf } from "../k3";
import { INK, badge, numeral, tint, touchy } from "../hud";
import { actIcon, actsOf } from "../acts";
import type { AmbienceKind } from "../../audio/kinds";

// ---- the arena -----------------------------------------------------------------------------------

/**
 * Nine pads on a 3×3 grid, each an island raised off the floor, with 2 m lanes between them (and
 * round them) to walk: their size, their spacing, their top's height.
 */
const NP = 9;
const PAD = 3.0;
const HALF = PAD / 2;
const PITCH = 5.0;
const PAD_Y = 0.45;
/**
 * A pad counts when you're clearly on it: your feet reach its middle (the glyph), or you've stood on
 * its top a beat. Brushing an edge does nothing. You're off it once past its edge.
 */
const CORE = 0.78;
const DWELL = 0.22;
const DWELL_IN = HALF - 0.25;
const OUT = 0.06;

// ---- the levels ----------------------------------------------------------------------------------

/**
 * A level: its nine slots (x, z in the arena's frame), the planner's waypoints (the lanes), the floor's
 * shape, the start line, its cameras, its time to sign (against the first level's), its twist, its set.
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
  slots: [number, number][];
  lanes: [number, number][];
  floor: { kind: "rect"; x0: number; x1: number; z0: number; z1: number } | { kind: "disc"; r: number } | { kind: "oct"; h: number; d: number };
  startZ: number;
  spots: number[];
  wide: { eye: [number, number, number]; at: [number, number, number]; fov: number };
  run: { y: number; z: number; fov: number };
  card: { r: number; h: number };
  capK: number;
  /** The table turns while they run: its speed per block (rad/s), how often it turns back (s). */
  spin?: { rate: number[]; flip: number };
  /** The lights go out while they run: a lantern's reach (m); the AIs a little less sure in the dark. */
  dark?: { reach: number; err: number; think: number };
  /** Its set (none: the lilac plaza, built here). */
  set?: (c: SetCtx) => SetLive;
}

/** PROOF POINT's lanes: the crossings of these (the planner's waypoints), the dotted lines of light. */
const LANES_X = [-7.4, -2.5, 2.5, 7.4];
const LANES_Z = [-7.4, -2.5, 2.5, 7.8];
const RING = 7.4;
const DIA = 4.1;
const circle = (n: number, r: number, a0: number): [number, number][] => Array.from({ length: n }, (_, k) => [Math.sin(a0 + (k * Math.PI * 2) / n) * r, -Math.cos(a0 + (k * Math.PI * 2) / n) * r]);

const LEVELS: Level[] = [
  {
    key: "point",
    title: "PROOF POINT",
    titleZh: "证明角",
    tag: "The lilac plaza at dusk: nine pads, wide lanes, a big block to read.",
    tagZh: "黄昏的淡紫广场：九块格子，宽敞的通道，一个大区块。",
    song: "tense",
    ambience: "city-day",
    sky: ["#2b1a78", "#ff9bc9"],
    fog: [70, 300],
    slots: Array.from({ length: NP }, (_, s) => [((s % 3) - 1) * PITCH, (Math.floor(s / 3) - 1) * PITCH] as [number, number]),
    lanes: Array.from({ length: 16 }, (_, k) => [LANES_X[k % 4], LANES_Z[k >> 2]] as [number, number]),
    floor: { kind: "rect", x0: -8.3, x1: 8.3, z0: -8.3, z1: 9.1 },
    startZ: 7.8,
    spots: [-5.4, -1.8, 1.8, 5.4],
    wide: { eye: [0, 18.5, 26], at: [0, 2, -3.5], fov: 40 },
    run: { y: 21, z: 21, fov: 34 },
    card: { r: 25, h: 13 },
    capK: 1,
  },
  {
    key: "astana",
    title: "PARK CAROUSEL",
    titleZh: "公园旋转广场",
    tag: "A winter night in Central Park: the round plaza turns while you run. Follow the sigil, not the spot!",
    tagZh: "中央公园的冬夜：你奔跑时圆形广场在旋转。认印记，别认位置！",
    song: "frost",
    ambience: "wind",
    sky: ["#081640", "#3a64ad"],
    fog: [110, 330],
    slots: Array.from({ length: NP }, (_, s) => (s === 4 ? [0, 0] : circle(8, RING, 0)[s < 4 ? s : s - 1])),
    lanes: [...circle(8, 3.9, Math.PI / 8), ...circle(8, RING, Math.PI / 8), ...circle(16, 10.4, 0)],
    floor: { kind: "disc", r: ASTANA_R },
    startZ: 10.2,
    spots: [-4.2, -1.4, 1.4, 4.2],
    wide: { eye: [0, 21.5, 29.5], at: [0, 1.5, -3.6], fov: 40 },
    run: { y: 24.5, z: 23.5, fov: 35 },
    card: { r: 28, h: 15 },
    capK: 1.12,
    spin: { rate: [0.2, 0.24, 0.28, 0.32], flip: 3.6 },
    set: astanaSet,
  },
  {
    key: "ruin",
    title: "SPROUT RUIN",
    titleZh: "Sprout 废墟",
    tag: "A storm over the Sprout ruins: the lights go out. Your lantern and the lightning show the pads.",
    tagZh: "风暴笼罩 Sprout 废墟：灯灭了。只有你的灯笼和闪电照亮格子。",
    song: "chase",
    ambience: "storm",
    sky: ["#0d0820", "#40265a"],
    fog: [90, 270],
    slots: Array.from({ length: NP }, (_, s) => [((s % 3) - Math.floor(s / 3)) * DIA, ((s % 3) + Math.floor(s / 3) - 2) * DIA] as [number, number]),
    lanes: [
      [DIA, 0], [-DIA, 0], [0, DIA], [0, -DIA],
      [DIA, 2 * DIA], [-DIA, 2 * DIA], [DIA, -2 * DIA], [-DIA, -2 * DIA],
      [2 * DIA, DIA], [-2 * DIA, DIA], [2 * DIA, -DIA], [-2 * DIA, -DIA],
      [DIA / 2, DIA / 2], [-DIA / 2, DIA / 2], [DIA / 2, -DIA / 2], [-DIA / 2, -DIA / 2],
      [1.5 * DIA, DIA / 2], [-1.5 * DIA, DIA / 2], [1.5 * DIA, -DIA / 2], [-1.5 * DIA, -DIA / 2],
      [DIA / 2, 1.5 * DIA], [-DIA / 2, 1.5 * DIA], [DIA / 2, -1.5 * DIA], [-DIA / 2, -1.5 * DIA],
      [1.5 * DIA, 1.5 * DIA], [-1.5 * DIA, 1.5 * DIA], [1.5 * DIA, -1.5 * DIA], [-1.5 * DIA, -1.5 * DIA],
      [0, 10.45], [0, -10.45], [10.45, 0], [-10.45, 0],
    ],
    floor: { kind: "oct", h: RUIN_H, d: RUIN_D },
    startZ: 10.7,
    spots: [-4.0, -1.4, 1.4, 4.0],
    wide: { eye: [0, 22, 30.5], at: [0, 1.5, -3.6], fov: 40 },
    run: { y: 25, z: 24, fov: 35 },
    card: { r: 29, h: 15 },
    capK: 1.12,
    dark: { reach: 4.6, err: 1.15, think: 0.05 },
    set: ruinSet,
  },
];

/** The snarks: size, body radius, run speed, grip. */
const SCALE = 1.3;
/** Over the head: the beads (this block's sigils), and the name tag above them. */
const BEAD_Y = 2.6;
const TAG_Y = 3.4;
const PR = 0.48;
const SPEED = 7.8;
const ACC = 16;
/** The shove (B): wind-up (telegraphed), lunge, wait; the knock it gives; the guard after it. */
const WIND = 0.2;
const LUNGE_T = 0.17;
const LUNGE_V = 10.5;
const SHOVE_CD = 1.35;
const KNOCK_T = 0.34;
const KNOCK_V = 5.4;
const GUARD_T = 1.4;
const CONTACT = 1.15;
const REACH = LUNGE_V * LUNGE_T + CONTACT;
/** A wrong pad: the stagger (no control), then a moment slowed. */
const STAGGER = 0.5;
const SLOW = 0.25;

/** The four blocks: sigils to prove, the pool it is named for, the reveal's beat, a shuffle before. */
interface Rd {
  len: number;
  lvl: string;
  step: number;
  shuffle: boolean;
}
const ROUNDS: Rd[] = [
  { len: 3, lvl: "SAPLING", step: 0.72, shuffle: false },
  { len: 4, lvl: "ORCHARD", step: 0.65, shuffle: false },
  { len: 5, lvl: "IRONWOOD", step: 0.58, shuffle: true },
  { len: 6, lvl: "IRONWOOD", step: 0.53, shuffle: true },
];
const MAXLEN = 6;
const BONUS = 5;
/** A block's time to prove, when its hint starts showing, how long the hint takes to come in. */
const capOf = (len: number) => 3.6 + 1.5 * len;
const hintAt = (len: number) => 1.8 + 0.5 * len;
const HINT_T = 3.2;
const INTRO = 1.0;
const SHUF_T = 0.9;
const END_T = 1.4;
const BANK_AT = 0.45;
const TALLY_T = 2.2;

/** The block: where it floats, its tilt toward the camera, its screen (canvas px). */
const BLOCK = new THREE.Vector3(0, 6.4, -12.2);
const TILT = -0.22;
const BW = 10.4,
  BH = 5.2,
  BD = 2.0;
const SW = 1024;
const SH = 464;
/** The chain the signed blocks join, to the left (nearest first). */
const CHAIN = [new THREE.Vector3(-7.9, 7.2, -12.6), new THREE.Vector3(-10.5, 6.1, -13.1), new THREE.Vector3(-12.9, 4.9, -13.6), new THREE.Vector3(-15.1, 3.6, -14.1)];
const LILAC = "#c4b1fc";
const FLARE = "#ff6b35";

/** The pads' colours (distinct at a glance on a phone) and their notes (C major pentatonic). */
const PADC = ["#ff7a1f", "#ffe03a", "#ff2e4d", "#ff6fd0", "#9b6bff", "#2f6bff", "#2fd9ff", "#4fe36e", "#f6f4ee"];
const WHITE = 8;
const TONES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];

// ---- sound ---------------------------------------------------------------------------------------

function osc(f: number, dur: number, type: OscillatorType, vol: number, delay = 0, slide = 0) {
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
/** A pad's bell: its note, a soft octave over it. */
function bell(i: number, dur = 0.42, vol = 0.36, delay = 0) {
  const f = TONES[i];
  osc(f, dur, "sine", vol, delay);
  osc(f * 2, dur * 0.6, "triangle", vol * 0.28, delay);
  osc(f * 3.01, dur * 0.25, "sine", vol * 0.1, delay);
}
/** A wrong pad: a low double buzz. */
function buzz(vol = 0.3) {
  osc(118, 0.3, "sawtooth", vol, 0, 0.8);
  osc(92, 0.34, "square", vol * 0.6, 0.02, 0.85);
}

// ---- the sigils: zkSNARKs' own --------------------------------------------------------------------

/** zkSNARK #id's sigil (1 a mark, 2 a second ink; theme.ts), if it has a figure worth a pad. */
function sigilOf(id: number): Uint8Array | null {
  const s = zkSigil(id);
  const g = new Uint8Array(49);
  let n = 0;
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 7; c++) {
      if (s[r][c] === 1) ((g[r * 7 + c] = 1), n++);
      else if (s[r][c] === 2) g[r * 7 + c] = 2;
    }
  return n >= 11 && n <= 27 ? g : null;
}
/** Nine zkSNARKs whose sigils differ from each other by at least 10 cells. */
function pickSigils(rnd: Rnd) {
  const out: { id: number; g: Uint8Array }[] = [];
  let id = 1 + Math.floor(rnd() * 9999);
  for (let n = 0; n < 5000 && out.length < NP; n++, id = (id % 10000) + 1) {
    const g = sigilOf(id);
    if (!g) continue;
    let ok = true;
    for (const o of out) {
      let d = 0;
      for (let k = 0; k < 49; k++) if ((g[k] === 1) !== (o.g[k] === 1)) d++;
      if (d < 10) {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ id, g });
  }
  // (never short in practice; a mirrored figure of its own if it were)
  while (out.length < NP) {
    const g = new Uint8Array(49);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 4; c++) if (rnd() < 0.45) g[r * 7 + c] = g[r * 7 + 6 - c] = 1;
    g[3 * 7 + 1] = g[4 * 7 + 1] = g[3 * 7 + 5] = g[4 * 7 + 5] = 2;
    out.push({ id: 0, g });
  }
  return out;
}

/** A glyph tile: a toy square of the pad's colour, the sigil on it in white (ink edges), the eyes dark. */
function paintTile(g: CanvasRenderingContext2D, x: number, y: number, s: number, i: number, glyph: Uint8Array) {
  const c = PADC[i];
  const white = i === WHITE;
  const r = s * 0.16;
  rr(g, x, y, s, s, r);
  g.fillStyle = INK;
  g.fill();
  const e = s * 0.045;
  rr(g, x + e, y + e, s - 2 * e, s - 2 * e, r - e);
  const gr = g.createLinearGradient(0, y, 0, y + s);
  gr.addColorStop(0, tint(c, white ? 0 : 0.34));
  gr.addColorStop(0.55, c);
  gr.addColorStop(1, tint(c, white ? -0.12 : -0.2));
  g.fillStyle = gr;
  g.fill();
  rr(g, x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, r * 0.6);
  g.fillStyle = white ? "rgba(40,24,90,0.07)" : "rgba(20,8,40,0.14)";
  g.fill();
  rr(g, x + s * 0.16, y + s * 0.065, s * 0.68, s * 0.045, s * 0.02);
  g.fillStyle = "rgba(255,255,255,0.42)";
  g.fill();
  const cell = s * 0.097;
  const gx = x + (s - 7 * cell) / 2;
  const gy = y + (s - 7 * cell) / 2 + s * 0.012;
  const o = cell * 0.17;
  const d = cell * 0.2;
  // the ink: an outline round the figure and a hard drop under it
  g.fillStyle = white ? "rgba(26,16,51,0.32)" : tint(c, -0.62);
  for (let k = 0; k < 49; k++) if (glyph[k]) g.fillRect(gx + (k % 7) * cell - o, gy + Math.floor(k / 7) * cell - o + d, cell + 2 * o, cell + 2 * o);
  g.fillStyle = white ? INK : "#ffffff";
  for (let k = 0; k < 49; k++) if (glyph[k] === 1) g.fillRect(gx + (k % 7) * cell, gy + Math.floor(k / 7) * cell, cell + 0.6, cell + 0.6);
  g.fillStyle = white ? FLARE : INK;
  for (let k = 0; k < 49; k++) if (glyph[k] === 2) g.fillRect(gx + (k % 7) * cell, gy + Math.floor(k / 7) * cell, cell + 0.6, cell + 0.6);
  // a glint in each eye
  g.fillStyle = "#ffffff";
  for (let k = 0; k < 42; k++) if (glyph[k] === 2 && glyph[k + 7] === 2) g.fillRect(gx + (k % 7) * cell + cell * 0.18, gy + Math.floor(k / 7) * cell + cell * 0.2, cell * 0.36, cell * 0.36);
}

/** A hidden glyph: a dark tile with a "?". */
function paintUnknown(g: CanvasRenderingContext2D, x: number, y: number, s: number, lit = false) {
  const r = s * 0.16;
  rr(g, x, y, s, s, r);
  g.fillStyle = INK;
  g.fill();
  const e = s * 0.045;
  rr(g, x + e, y + e, s - 2 * e, s - 2 * e, r - e);
  const gr = g.createLinearGradient(0, y, 0, y + s);
  gr.addColorStop(0, lit ? "#5b4bb5" : "#3b3078");
  gr.addColorStop(1, lit ? "#3a2c86" : "#251c52");
  g.fillStyle = gr;
  g.fill();
  g.font = `900 ${Math.round(s * 0.62)}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fillText("?", x + s / 2, y + s * 0.56);
  g.fillStyle = lit ? "#ffffff" : "rgba(196,177,252,0.75)";
  g.fillText("?", x + s / 2, y + s * 0.52);
}

// ---- textures made once --------------------------------------------------------------------------

function latticeTex() {
  return canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#3a2f7c";
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = "#33296f";
      g.fillRect(0, 0, 128, 128);
      g.fillRect(128, 128, 128, 128);
      g.strokeStyle = "rgba(196,177,252,0.26)";
      g.lineWidth = 3;
      for (const v of [0, 128]) {
        g.beginPath();
        g.moveTo(v + 1.5, 0);
        g.lineTo(v + 1.5, 256);
        g.moveTo(0, v + 1.5);
        g.lineTo(256, v + 1.5);
        g.stroke();
      }
      g.fillStyle = "rgba(214,200,255,0.8)";
      for (const x of [0, 128, 256]) for (const y of [0, 128, 256]) g.fillRect(x - 5, y - 5, 10, 10);
      g.fillStyle = "rgba(196,177,252,0.22)";
      for (const x of [64, 192]) for (const y of [64, 192]) g.fillRect(x - 3, y - 3, 6, 6);
    },
    true,
  );
}

/** An ink splat (white, tinted per instance; its rim darker). */
function splatTex() {
  return canvasTex(128, 128, (g) => {
    const blobs: [number, number, number][] = [[64, 64, 36]];
    let a = 0.3;
    for (let k = 0; k < 9; k++) {
      a += 0.55 + Math.random() * 0.4;
      const d = 34 + Math.random() * 14;
      blobs.push([64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 7 + Math.random() * 9]);
    }
    blobs.push([64 + 52, 64 - 30, 5], [64 - 50, 64 + 38, 4]);
    for (const [col, grow] of [
      ["#2a2a2a", 5],
      ["#ffffff", 0],
    ] as const) {
      g.fillStyle = col;
      for (const [x, y, r] of blobs) {
        g.beginPath();
        g.arc(x, y, r + grow, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath();
    g.ellipse(52, 50, 10, 6, -0.6, 0, Math.PI * 2);
    g.fill();
  });
}

function haloTex() {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

function beamTex() {
  return canvasTex(4, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.7, "rgba(255,255,255,0.45)");
    gr.addColorStop(1, "rgba(255,255,255,1)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 128);
  });
}

/** A hanging banner: a giant sigil and a slogan. */
function flagTex(glyph: Uint8Array, color: string, line: string) {
  return canvasTex(256, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, "#22184e");
    gr.addColorStop(1, "#140e30");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 512);
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 14);
    g.fillRect(0, 498, 256, 14);
    g.fillRect(0, 0, 10, 512);
    g.fillRect(246, 0, 10, 512);
    const cell = 26;
    const x0 = 128 - 3.5 * cell,
      y0 = 70;
    g.fillStyle = tint(color, -0.5);
    for (let k = 0; k < 49; k++) if (glyph[k]) g.fillRect(x0 + (k % 7) * cell - 3, y0 + Math.floor(k / 7) * cell + 4, cell + 6, cell + 6);
    for (let k = 0; k < 49; k++) {
      if (!glyph[k]) continue;
      g.fillStyle = glyph[k] === 2 ? "#ffffff" : color;
      g.fillRect(x0 + (k % 7) * cell, y0 + Math.floor(k / 7) * cell, cell + 0.5, cell + 0.5);
    }
    g.save();
    g.translate(128, 390);
    g.textAlign = "center";
    g.textBaseline = "middle";
    const words = line.split(" ");
    const half = Math.ceil(words.length / 2);
    const fit = (s: string, y: number, c: string) => {
      g.font = `900 34px ${FONT}`;
      const k = Math.min(34, (34 * 214) / Math.max(1, g.measureText(s).width));
      g.font = `900 ${k}px ${FONT}`;
      g.fillStyle = c;
      g.fillText(s, 0, y);
    };
    fit(words.slice(0, half).join(" "), -24, "#ffffff");
    fit(words.slice(half).join(" "), 24, color);
    g.restore();
  });
}

// ---- the planner's geometry ----------------------------------------------------------------------

/** Does the segment (x0,z0)→(x1,z1) cross the square of half-side h round (cx, cz)? */
function segHits(x0: number, z0: number, x1: number, z1: number, cx: number, cz: number, h: number) {
  let t0 = 0,
    t1 = 1;
  const dx = x1 - x0,
    dz = z1 - z0;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < cx - h || x0 > cx + h) return false;
  } else {
    let a = (cx - h - x0) / dx,
      b = (cx + h - x0) / dx;
    if (a > b) {
      const s = a;
      a = b;
      b = s;
    }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z0 < cz - h || z0 > cz + h) return false;
  } else {
    let a = (cz - h - z0) / dz,
      b = (cz + h - z0) / dz;
    if (a > b) {
      const s = a;
      a = b;
      b = s;
    }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}
/** How close the planner lets a path come to a pad it must not touch (the half-side it keeps out of: its body off the island). */
const AVOID = HALF + 0.3;
/** What crossing a pad it may cross (one it has stamped) costs a path, in metres: it keeps to the lanes when it can. */
const CROSS = 2.5;

// ---- the players ---------------------------------------------------------------------------------

interface Ai {
  /** What it remembers of the signature (pads), what it already tried at each step and found wrong. */
  mem: Int8Array;
  tried: Uint16Array;
  /** Before it moves at SIGN!, and a pause at a step (a hesitation if long). */
  react: number;
  think: number;
  /** Its path: waypoints (x, z), how many, the next; the pad it leads to; when to look again. */
  path: Float32Array;
  pn: number;
  pi: number;
  goal: number;
  replan: number;
  stuck: number;
  /** A shove it wants to give (a seat, -1 none). */
  want: number;
}

interface Run {
  a: Avatar;
  p: Player;
  vx: number;
  vz: number;
  /** Glyphs signed this block; the pad under it (-1 none); when it last signed one (the tie). */
  step: number;
  on: number;
  stepAt: number;
  /** Standing on a pad's top short of its middle: which pad, how long. */
  dwellPad: number;
  dwell: number;
  /** A wrong pad's stagger, the slow after it; a shove's knock, the guard after it. */
  stun: number;
  slow: number;
  knock: number;
  guard: number;
  /** The shove: cooldown, wind-up, lunge, aim, the human's B held a moment, the "ready" pop. */
  cd: number;
  wind: number;
  lunge: number;
  /** The lunge ended this frame (its far end still lands). */
  lend: boolean;
  sx: number;
  sz: number;
  bbuf: number;
  ready: number;
  /** The hop back to the start line. */
  hop: number;
  hx0: number;
  hz0: number;
  hx1: number;
  hz1: number;
  spin: number;
  lean: number;
  sq: number;
  angryT: number;
  jumpAt: number;
  /** The beads' pop, the stamps' size on each pad (0…1) and their kick. */
  beadPop: Float32Array;
  stamp: Float32Array;
  kick: Float32Array;
  arrow: THREE.Mesh;
  arrowM: THREE.MeshBasicMaterial;
  ai: Ai;
}

interface Pad {
  /** Its slot on the grid now (0…8), where it is, where a shuffle takes it from and to. */
  slot: number;
  x: number;
  z: number;
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  y: number;
  arc: number;
  /** Lit by the reveal, pressed by a foot, a red flash (wrong), a flash in a seat's colour (signed). */
  lit: number;
  press: number;
  red: number;
  flash: number;
  flashC: THREE.Color;
  top: THREE.Mesh;
  topM: THREE.MeshBasicMaterial;
  glyph: Uint8Array;
  id: number;
  /** Its tile for the HUD (64 px). */
  tile: HTMLCanvasElement;
}

type Ph = "intro" | "show" | "run" | "end" | "tally" | "done";

interface Pop {
  seat: number;
  s: string;
  c: string;
  t: number;
  big: boolean;
}

// ---- the game ------------------------------------------------------------------------------------

class Sign implements Mini {
  private w: ReturnType<typeof world>;
  /** The arena's frame: the floor, the pads, the snarks (it turns, on the carousel). */
  private table = new THREE.Group();
  private L: Level;
  private live: SetLive | null = null;
  /** The slots' places, each slot's neighbours (for a misremembered glyph), the planner's node count. */
  private sx = new Float32Array(NP);
  private sz = new Float32Array(NP);
  private nbr: number[][] = [];
  private nodes: number;
  /** The carousel: its angle, its turn (rad/s), the way it turns, the next turn back, its warning (0…1). */
  private theta = 0;
  private omega = 0;
  private spinDir = 1;
  private flipAt = 0;
  private warn = 0;
  private flips = 0;
  /** The dark: how dark (0…1), a lightning flash, the next one, its thunder, the lanterns' pools. */
  private dark = 0;
  private flash = 0;
  private boltAt = 0;
  private rumble = 0;
  private pools: THREE.InstancedMesh | null = null;
  private hemi0 = 1;
  private sun0 = 1;
  private cam: CamRig;
  private fx: Fx3;
  private run: Run[];
  private pads: Pad[] = [];
  /** Which pad sits in each slot. */
  private bySlot = new Int8Array(NP);
  private padCol: THREE.Color[] = PADC.map((c) => new THREE.Color(c));
  private body!: THREE.InstancedMesh;
  private ink!: THREE.InstancedMesh;
  private glowI!: THREE.InstancedMesh;
  private halo!: THREE.InstancedMesh;
  private moat!: THREE.InstancedMesh;
  private beam!: THREE.Mesh;
  private beamM!: THREE.MeshBasicMaterial;
  private beads!: THREE.InstancedMesh;
  private beadInk!: THREE.InstancedMesh;
  private stamps!: THREE.InstancedMesh;
  private bytes: THREE.InstancedMesh | null = null;
  /** The lilac plaza's background life (sparkles), the world under it. */
  private life: Bobs[] = [];
  private far: { tick(t: number): void } | null = null;
  private byteP!: Float32Array;
  private qbs: THREE.Mesh[] = [];
  private blockG = new THREE.Group();
  private scrCv: HTMLCanvasElement;
  private scr: CanvasRenderingContext2D;
  private scrTex: THREE.CanvasTexture;
  private scrKey = -1;
  private chain: { m: THREE.Mesh; mat: THREE.MeshToonMaterial; slot: number; on: boolean; t: number }[] = [];
  private links: THREE.Mesh[] = [];
  private unknown: HTMLCanvasElement;

  // the match
  private ph: Ph = "intro";
  private pt = 0;
  private ri = -1;
  private rd: Rd = ROUNDS[0];
  private seq = new Int8Array(MAXLEN);
  private len = 3;
  private showIdx = -1;
  private rt = 0;
  private hint = 0;
  private signer = -1;
  private banked = false;
  private hurried = false;
  private shuffling = false;
  private totals = [0, 0, 0, 0];
  private signs = [0, 0, 0, 0];
  private lastBeads = [0, 0, 0, 0];
  private perRound: number[][] = [[], [], [], []];
  private over: number[] | null = null;
  private post = 0;
  private height: number;
  private frame = 0;
  private lift = 0;

  // the look and the HUD
  private phase: "card" | "count" | "play" = "card";
  private clk = 0;
  private banners: { s: string; t: number; dur: number; c: string; size: number; y: number }[] = [];
  private pops: Pop[] = [];
  private bump = [0, 0, 0, 0];
  private hurt = 0;
  private cardT = 0;
  private cardPad = -1;
  readonly stats = { wrong: [0, 0, 0, 0], shoves: [0, 0, 0, 0], hits: [0, 0, 0, 0], onHuman: 0, playT: 0, rounds: [] as { signer: number; t: number; beads: number[] }[] };

  // scratch (no allocations in the loops)
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private sc = new THREE.Vector3();
  private c = new THREE.Color();
  private beadOff = new THREE.Color("#8f86bd");
  private red = new THREE.Color("#ff3d5a");
  private seatCol: THREE.Color[];
  private mx = 0;
  private mz = 0;
  private nx: Float32Array;
  private nz: Float32Array;
  private dist: Float32Array;
  private prev: Int8Array;
  private seen: Uint8Array;
  private forbid = new Uint8Array(NP);
  private chainOf: number[] = [];
  /** The bench (&signbot): game steps per frame (&turbo=N), and a scripted human's hand (sets mx, mz, botB). */
  private turbo = 1;
  bot: ((game: Sign, seat: number, dt: number) => void) | null = null;
  botB = false;

  constructor(
    private players: Player[],
    private rnd: Rnd,
    level: Level,
  ) {
    this.L = level;
    this.w = world({ sky: level.sky, fog: level.fog });
    const s = this.w.scene;
    const tb = this.table;
    s.add(tb);
    for (let k = 0; k < NP; k++) ((this.sx[k] = level.slots[k][0]), (this.sz[k] = level.slots[k][1]));
    // (a slot's neighbours: the slots about one step away, diagonals included)
    let near = Infinity;
    for (let a = 0; a < NP; a++) for (let b = a + 1; b < NP; b++) near = Math.min(near, Math.hypot(this.sx[a] - this.sx[b], this.sz[a] - this.sz[b]));
    for (let a = 0; a < NP; a++) {
      const list: number[] = [];
      for (let b = 0; b < NP; b++) if (b !== a && Math.hypot(this.sx[a] - this.sx[b], this.sz[a] - this.sz[b]) <= near * 1.45) list.push(b);
      this.nbr.push(list);
    }
    this.nodes = level.lanes.length + NP + 1;
    this.nx = new Float32Array(this.nodes);
    this.nz = new Float32Array(this.nodes);
    this.dist = new Float32Array(this.nodes);
    this.prev = new Int8Array(this.nodes);
    this.seen = new Uint8Array(this.nodes);
    this.cam = new CamRig(this.w.camera);
    this.seatCol = players.map((p) => new THREE.Color(p.color));
    this.height = Math.max(1, Math.floor((Date.now() - Date.UTC(2026, 8, 9, 8, 51, 57)) / 14000));
    // ---- the pads (the sigils are real zkSNARKs')
    const sig = pickSigils(rnd);
    const order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < NP; i++) {
      const slot = order[i];
      this.bySlot[slot] = i;
      const tex = canvasTex(256, 256, (g) => paintTile(g, 0, 0, 256, i, sig[i].g));
      const topM = new THREE.MeshBasicMaterial({ map: tex });
      const top = new THREE.Mesh(flat, topM);
      top.scale.set(PAD, 1, PAD);
      tb.add(top);
      const tile = document.createElement("canvas");
      tile.width = tile.height = 64;
      paintTile(tile.getContext("2d")!, 0, 0, 64, i, sig[i].g);
      this.pads.push({ slot, x: this.sx[slot], z: this.sz[slot], fx: 0, fz: 0, tx: this.sx[slot], tz: this.sz[slot], y: PAD_Y, arc: 0, lit: 0, press: 0, red: 0, flash: 0, flashC: new THREE.Color(), top, topM, glyph: sig[i].g, id: sig[i].id, tile });
    }
    this.unknown = document.createElement("canvas");
    this.unknown.width = this.unknown.height = 64;
    paintUnknown(this.unknown.getContext("2d")!, 0, 0, 64);
    const bodyM = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toon("#fff").gradientMap });
    this.body = new THREE.InstancedMesh(GEO.box, bodyM, NP);
    this.ink = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), NP);
    this.glowI = new THREE.InstancedMesh(flat, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), NP);
    this.halo = new THREE.InstancedMesh(flat, new THREE.MeshBasicMaterial({ color: 0xffffff, map: haloTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), NP);
    for (let i = 0; i < NP; i++) {
      this.body.setColorAt(i, this.c.set(PADC[i]).multiplyScalar(0.8));
      this.glowI.setColorAt(i, this.c.setRGB(0, 0, 0));
      this.halo.setColorAt(i, this.c.setRGB(0, 0, 0));
    }
    // (a dark moat round each island, so the lanes read as the way through)
    this.moat = new THREE.InstancedMesh(flat, new THREE.MeshBasicMaterial({ color: "#120c2c", transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), NP);
    this.moat.renderOrder = 1;
    this.glowI.renderOrder = 4;
    this.halo.renderOrder = 1;
    for (const m of [this.body, this.ink, this.glowI, this.halo, this.moat]) ((m.frustumCulled = false), (m.raycast = () => {}), tb.add(m));
    this.beamM = new THREE.MeshBasicMaterial({ map: beamTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 28, 1, true), this.beamM);
    this.beam.visible = false;
    tb.add(this.beam);
    // ---- the stamps (a splat per seat per pad, in a corner each) and the beads over the heads
    this.stamps = new THREE.InstancedMesh(flat, new THREE.MeshBasicMaterial({ map: splatTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), NP * 4);
    for (let k = 0; k < NP * 4; k++) this.stamps.setColorAt(k, this.c.set(players[k % 4].color));
    this.stamps.renderOrder = 5;
    this.beads = new THREE.InstancedMesh(GEO.ball, new THREE.MeshBasicMaterial({ color: 0xffffff }), 4 * MAXLEN);
    this.beadInk = new THREE.InstancedMesh(GEO.ball, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), 4 * MAXLEN);
    for (let k = 0; k < 4 * MAXLEN; k++) this.beads.setColorAt(k, this.beadOff);
    for (const m of [this.stamps, this.beads, this.beadInk]) ((m.frustumCulled = false), (m.raycast = () => {}), tb.add(m));
    if (level.set) this.live = level.set({ scene: s, table: tb, hemi: this.w.hemi, sun: this.w.sun, rnd, ink: new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), sig: sig.map((q) => q.g) });
    else this.dress(sig);
    this.hemi0 = this.w.hemi.intensity;
    this.sun0 = this.w.sun.intensity;
    // the lanterns' pools of light (in the dark)
    if (level.dark) {
      const pool = canvasTex(128, 128, (g) => {
        const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
        gr.addColorStop(0, "rgba(255,255,255,1)");
        gr.addColorStop(0.35, "rgba(255,255,255,0.6)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, 128);
      });
      this.pools = new THREE.InstancedMesh(flat, new THREE.MeshBasicMaterial({ map: pool, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 4);
      this.pools.renderOrder = 3;
      this.pools.frustumCulled = false;
      for (let k = 0; k < 4; k++) this.pools.setColorAt(k, this.c.set("#000000"));
      tb.add(this.pools);
    }
    // ---- the block and its screen
    this.scrCv = document.createElement("canvas");
    this.scrCv.width = SW;
    this.scrCv.height = SH;
    this.scr = this.scrCv.getContext("2d")!;
    this.scrTex = new THREE.CanvasTexture(this.scrCv);
    this.scrTex.colorSpace = THREE.SRGBColorSpace;
    this.scrTex.anisotropy = 4;
    this.buildBlock();
    // ---- the players, on the start line facing the block
    const arrowGeo = new THREE.ShapeGeometry(
      new THREE.Shape([new THREE.Vector2(-0.32, 0.55), new THREE.Vector2(0.32, 0.55), new THREE.Vector2(0.32, 1.7), new THREE.Vector2(0.75, 1.7), new THREE.Vector2(0, 2.75), new THREE.Vector2(-0.75, 1.7), new THREE.Vector2(-0.32, 1.7)]),
    ).rotateX(-Math.PI / 2);
    // (the shape points +y; laid flat it points −z: turned to face +z, the yaw's way)
    arrowGeo.rotateY(Math.PI);
    // (the snarks live in the arena's frame: Avatar only adds to its parent)
    const arena = tb as unknown as THREE.Scene;
    this.run = players.map((p, i) => {
      const a = new Avatar(arena, p, { marker: false, scale: SCALE });
      const x = level.spots[(i + 1) % 4];
      a.pos.set(x, 0, level.startZ);
      a.yaw = Math.PI;
      a.sync(0);
      const arrowM = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.8, depthWrite: false });
      const arrow = new THREE.Mesh(arrowGeo, arrowM);
      arrow.visible = false;
      arrow.renderOrder = 6;
      tb.add(arrow);
      const ai: Ai = { mem: new Int8Array(MAXLEN), tried: new Uint16Array(MAXLEN), react: 0, think: 0, path: new Float32Array(32), pn: 0, pi: 0, goal: -1, replan: 0, stuck: 0, want: -1 };
      return {
        a,
        p,
        vx: 0,
        vz: 0,
        step: 0,
        on: -1,
        stepAt: 0,
        dwellPad: -1,
        dwell: 0,
        stun: 0,
        slow: 0,
        knock: 0,
        guard: 0,
        cd: 0,
        wind: 0,
        lunge: 0,
        lend: false,
        sx: 0,
        sz: -1,
        bbuf: 0,
        ready: 0,
        hop: 0,
        hx0: x,
        hz0: level.startZ,
        hx1: x,
        hz1: level.startZ,
        spin: 0,
        lean: 0,
        sq: 0,
        angryT: 0,
        jumpAt: 0,
        beadPop: new Float32Array(MAXLEN),
        stamp: new Float32Array(NP),
        kick: new Float32Array(NP),
        arrow,
        arrowM,
        ai,
      };
    });
    this.fx = new Fx3(arena, 700);
    this.cam.set(new THREE.Vector3(0, 17, 26), new THREE.Vector3(0, 1, -2));
    this.placePads(0);
    this.paintScreen();
    if (location.search.includes("signbot")) {
      (window as unknown as { __sign: unknown }).__sign = this;
      this.turbo = clamp(Math.round(Number(new URLSearchParams(location.search).get("turbo") ?? 1)), 1, 6);
    }
  }

  // ---- the set -----------------------------------------------------------------------------------

  /** The floating platform, its rails and lights, the hanging banners, the city far below. */
  private dress(sig: { id: number; g: Uint8Array }[]) {
    const s = this.w.scene;
    // the light: the last of the day, low and warm from the front left (long shadows across the lanes,
    // away from the camera), the dusk sky's violet in the shade; the lamps bloom
    this.w.sun.position.set(-26, 30, 22);
    this.w.sun.color.set("#ffc9a0");
    this.w.sun.intensity = 2.15;
    this.w.hemi.color.set("#dccbff");
    this.w.hemi.groundColor.set("#5a3a80");
    this.w.hemi.intensity = 1.5;
    s.userData.post = { hot: 0.8 };
    const f = this.L.floor.kind === "rect" ? this.L.floor : { x0: -8.3, x1: 8.3, z0: -8.3, z1: 9.1 };
    const X0 = f.x0,
      X1 = f.x1,
      Z0 = f.z0,
      Z1 = f.z1;
    const fw = X1 - X0,
      fd = Z1 - Z0,
      cz = (Z0 + Z1) / 2;
    const floor = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: latticeTex(), gradientMap: toon("#fff").gradientMap }));
    (floor.material as THREE.MeshToonMaterial).map!.repeat.set(fw / 2.2, fd / 2.2);
    floor.rotation.x = -Math.PI / 2;
    floor.scale.set(fw, fd, 1);
    floor.position.set(0, 0.001, cz);
    s.add(floor);
    // the slab and the stepped island under it (one instanced draw, its ink another)
    const parts: { c: string; w: number; h: number; d: number; x: number; y: number; z: number; ink: number; lit?: boolean }[] = [];
    parts.push({ c: "#2a2160", w: fw + 0.5, h: 1.2, d: fd + 0.5, x: 0, y: -0.6, z: cz, ink: 0.1 });
    parts.push({ c: "#231a52", w: fw * 0.86, h: 1.6, d: fd * 0.86, x: 0, y: -2.0, z: cz, ink: 0.08 });
    parts.push({ c: "#1c1544", w: fw * 0.62, h: 1.8, d: fd * 0.62, x: 0, y: -3.6, z: cz, ink: 0.08 });
    parts.push({ c: "#161039", w: fw * 0.36, h: 2.2, d: fd * 0.36, x: 0, y: -5.5, z: cz, ink: 0.06 });
    // lit strips along the slab's sides
    parts.push({ c: LILAC, w: fw + 0.56, h: 0.14, d: 0.1, x: 0, y: -0.35, z: Z1 + 0.27, ink: 0, lit: true });
    parts.push({ c: LILAC, w: 0.1, h: 0.14, d: fd + 0.56, x: X0 - 0.27, y: -0.35, z: cz, ink: 0, lit: true });
    parts.push({ c: LILAC, w: 0.1, h: 0.14, d: fd + 0.56, x: X1 + 0.27, y: -0.35, z: cz, ink: 0, lit: true });
    // the lanes: lit dots along each one's middle, the way through between the islands
    for (const lx of LANES_X) for (let z = Z0 + 0.7; z <= Z1 - 0.6; z += 0.85) parts.push({ c: "#7564d8", w: 0.15, h: 0.03, d: 0.15, x: lx, y: 0.015, z, ink: 0, lit: true });
    for (const lz of LANES_Z) for (let x = X0 + 0.7; x <= X1 - 0.6; x += 0.85) if (LANES_X.every((lx) => Math.abs(lx - x) > 0.3)) parts.push({ c: "#7564d8", w: 0.15, h: 0.03, d: 0.15, x, y: 0.015, z: lz, ink: 0, lit: true });
    // the front edge: a low lit curb
    parts.push({ c: "#4a3d96", w: fw, h: 0.16, d: 0.3, x: 0, y: 0.08, z: Z1 - 0.15, ink: 0.04 });
    parts.push({ c: LILAC, w: fw, h: 0.06, d: 0.32, x: 0, y: 0.19, z: Z1 - 0.15, ink: 0, lit: true });
    // the rail: posts with lights round the edge (open at the front: the start line)
    let n = 0;
    const lamps: { x: number; y: number; z: number; r: number; c: string; a: number }[] = [];
    const post = (x: number, z: number) => {
      parts.push({ c: "#4a3d96", w: 0.3, h: 0.7, d: 0.3, x, y: 0.35, z, ink: 0.05 });
      const c = n++ % 2 ? FLARE : LILAC;
      parts.push({ c, w: 0.34, h: 0.22, d: 0.34, x, y: 0.82, z, ink: 0, lit: true });
      lamps.push({ x, y: 0.02, z, r: 1.3, c, a: 0.3 });
    };
    for (let x = X0 + 0.15; x <= X1 - 0.1; x += (fw - 0.3) / 7) post(x, Z0 + 0.15);
    for (let z = Z0 + 0.15 + (fd - 0.3) / 8; z <= Z1 - 0.1; z += (fd - 0.3) / 8) (post(X0 + 0.15, z), post(X1 - 0.15, z));
    // the rails between the posts (thin bars, lit)
    parts.push({ c: "#8f7fe0", w: fw - 0.3, h: 0.08, d: 0.08, x: 0, y: 0.62, z: Z0 + 0.15, ink: 0.03 });
    parts.push({ c: "#8f7fe0", w: 0.08, h: 0.08, d: fd - 0.3, x: X0 + 0.15, y: 0.62, z: cz, ink: 0.03 });
    parts.push({ c: "#8f7fe0", w: 0.08, h: 0.08, d: fd - 0.3, x: X1 - 0.15, y: 0.62, z: cz, ink: 0.03 });
    // the banners' poles, the pylons with the Q-Blocks
    for (const sx of [-1, 1]) {
      parts.push({ c: "#4a3d96", w: 0.35, h: 9.5, d: 0.35, x: sx * 12.2 - 1.7, y: 4.75 - 1.2, z: -3, ink: 0.06 });
      parts.push({ c: "#4a3d96", w: 0.35, h: 9.5, d: 0.35, x: sx * 12.2 + 1.7, y: 4.75 - 1.2, z: -3, ink: 0.06 });
      parts.push({ c: "#8f7fe0", w: 4.2, h: 0.3, d: 0.3, x: sx * 12.2, y: 8.2, z: -3, ink: 0.05 });
      // (a pennant's mast on each pole)
      for (const dx of [-1.7, 1.7]) parts.push({ c: "#8f7fe0", w: 0.1, h: 1.0, d: 0.1, x: sx * 12.2 + dx - 0.06, y: 8.8, z: -3, ink: 0.02 });
      // (each on a floating stone of its own)
      parts.push({ c: "#2a2160", w: 4.8, h: 0.8, d: 1.8, x: sx * 12.2, y: -1.6, z: -3, ink: 0.08 });
      parts.push({ c: "#1c1544", w: 2.8, h: 1.2, d: 1.1, x: sx * 12.2, y: -2.6, z: -3, ink: 0.06 });
      parts.push({ c: sx < 0 ? LILAC : FLARE, w: 4.9, h: 0.12, d: 0.1, x: sx * 12.2, y: -1.5, z: -3 + 0.92, ink: 0, lit: true });
    }
    const groups = new Map<string, typeof parts>();
    for (const p of parts) {
      const k = p.lit ? "lit" : "toon";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(p);
      if (p.ink) {
        if (!groups.has("ink")) groups.set("ink", []);
        groups.get("ink")!.push(p);
      }
    }
    const inkM = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    for (const [k, list] of groups) {
      const mat = k === "ink" ? inkM : k === "lit" ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toon("#fff").gradientMap });
      const mesh = new THREE.InstancedMesh(GEO.box, mat, list.length);
      list.forEach((p, i) => {
        const t = k === "ink" ? p.ink * 2 : 0;
        this.m4.compose(this.v.set(p.x, p.y, p.z), this.q.identity(), this.sc.set(p.w + t, p.h + t, p.d + t));
        mesh.setMatrixAt(i, this.m4);
        if (k !== "ink") mesh.setColorAt(i, this.c.set(p.c));
      });
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      s.add(mesh);
    }
    // the posts' lights on the floor
    pools(s, lamps);
    // (the set's own dice: the same plaza every time, and none of the game's)
    const cos = rng(0x51c7);
    // the world under and round the plaza: the woods, the creek, the city beyond, the dusk sky
    this.far = pointWorld(s, cos);
    // sparkles of proof dust round the plaza
    const sp: { x: number; y: number; z: number; s: number; c: string }[] = [];
    for (let k = 0; k < 44; k++) {
      const side = k % 4;
      const x = side < 2 ? (side ? 1 : -1) * (9.6 + cos() * 3) : (cos() - 0.5) * 22;
      const z = side < 2 ? (cos() - 0.5) * 20 : (side === 2 ? -1 : 1) * (9.8 + cos() * 2.5);
      sp.push({ x, y: 0.4 + cos() * 5, z, s: 0.1 + cos() * 0.08, c: [LILAC, "#ffffff", "#ff6fd0", "#a8d8e8"][k % 4] });
    }
    this.life.push(new Bobs(s, GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), sp, { bob: 0.35, twinkle: 0.9, drift: 0.3, speed: 0.7 }));
    // the two banners: a giant sigil each and a slogan
    const lines = [T("BIG PROOFS, SMALL WORRIES", "大证明 小烦恼"), T("SHIELDED SINCE BLOCK 0", "零号区块起 即屏蔽")];
    for (const k of [0, 1]) {
      const sx = k ? 1 : -1;
      const tex = flagTex(sig[k ? 4 : 0].g, k ? FLARE : LILAC, lines[k]);
      const flag = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      flag.scale.set(3.1, 6.2, 1);
      flag.position.set(sx * 12.2, 4.9, -3);
      flag.rotation.y = -sx * 0.32;
      s.add(flag);
    }
    // Z-Blocks over the far corners
    for (const [x, y, z] of [
      [-11, 12, -8.5],
      [11.2, 11.4, -9.5],
    ]) {
      const qb = qBlock(1.5);
      qb.position.set(x, y, z);
      s.add(qb);
      this.qbs.push(qb);
    }
    // proof bytes drifting up round the block (one draw)
    const NB = 44;
    this.bytes = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), NB);
    this.byteP = new Float32Array(NB * 5);
    const bc = [LILAC, FLARE, "#a8d8e8", "#ffffff", "#ff6fd0"];
    for (let k = 0; k < NB; k++) {
      this.byteP[k * 5] = (cos() * 2 - 1) * 12;
      this.byteP[k * 5 + 1] = cos() * 16 - 1;
      this.byteP[k * 5 + 2] = -11 - cos() * 7;
      this.byteP[k * 5 + 3] = 0.5 + cos() * 1.1;
      this.byteP[k * 5 + 4] = 0.12 + cos() * 0.2;
      this.bytes.setColorAt(k, this.c.set(bc[k % bc.length]));
    }
    this.bytes.frustumCulled = false;
    s.add(this.bytes);
    // (the old ring of 72 towers drew five of the game's dice each here: the same draws, so a seed plays as it did)
    for (let k = 0; k < 72 * 5; k++) this.rnd();
  }

  /** The block: a great dark cube with lilac edges, its screen, its crest; the chain it adds to. */
  private buildBlock() {
    const g = this.blockG;
    g.position.copy(BLOCK);
    g.rotation.x = TILT;
    this.w.scene.add(g);
    const bw = BW,
      bh = BH,
      bd = BD;
    const body = block("#241a52", bw, bh, bd, 0, 0, 0, g);
    outline(body, 0.14);
    // the bezel: lilac bars round the screen, flare corners
    const fz = bd / 2 + 0.06;
    for (const [w, h, x, y] of [
      [bw - 0.4, 0.22, 0, bh / 2 - 0.35],
      [bw - 0.4, 0.22, 0, -bh / 2 + 0.35],
      [0.22, bh - 0.7, -bw / 2 + 0.3, 0],
      [0.22, bh - 0.7, bw / 2 - 0.3, 0],
    ])
      block(LILAC, w, h, 0.12, x, y, fz, g, glow(LILAC));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) block(FLARE, 0.55, 0.55, 0.2, sx * (bw / 2 - 0.3), sy * (bh / 2 - 0.35), fz + 0.02, g, glow(FLARE));
    const scr = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.scrTex }));
    scr.scale.set(bw - 0.9, (bw - 0.9) * (SH / SW), 1);
    scr.position.set(0, 0, bd / 2 + 0.04);
    g.add(scr);
    // the crest: three keys of light on its roof
    const crest = ["#a8d8e8", FLARE, LILAC];
    for (let k = 0; k < 3; k++) {
      const m = block(crest[k], 0.75, 0.75, 0.75, (k - 1) * 1.4, bh / 2 + 0.65, 0, g, glow(crest[k]));
      outline(m, 0.05);
      block("#4a3d96", 0.16, 0.45, 0.16, (k - 1) * 1.4, bh / 2 + 0.18, 0, g);
    }
    // the chain: four little blocks, lit in their signer's colour as they join
    for (let k = 0; k < 4; k++) {
      const mat = new THREE.MeshToonMaterial({ color: "#3a3170", gradientMap: toon("#fff").gradientMap, emissive: new THREE.Color("#000") });
      const m = new THREE.Mesh(GEO.box, mat);
      m.scale.setScalar(2.0);
      outline(m, 0.08);
      m.visible = false;
      this.w.scene.add(m);
      this.chain.push({ m, mat, slot: -1, on: false, t: 0 });
    }
    // the links between the chain's places (shown once both ends are there)
    const ends = [BLOCK.clone().add(new THREE.Vector3(-bw / 2, 0.6, 0)), ...CHAIN];
    for (let k = 0; k < 4; k++) {
      const a = ends[k],
        b = ends[k + 1];
      const l = new THREE.Mesh(GEO.box, glow(LILAC));
      const d = a.distanceTo(b);
      l.scale.set(d, 0.16, 0.16);
      l.position.copy(a).add(b).multiplyScalar(0.5);
      l.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize());
      l.visible = false;
      this.w.scene.add(l);
      this.links.push(l);
    }
  }

  // ---- the block's screen ------------------------------------------------------------------------

  /** Repaint the screen when what it shows changes (never every frame). */
  private screen() {
    const st = this.phase === "card" ? 9 : ({ intro: 0, show: 1, run: 2, end: 3, tally: 4, done: 4 } as const)[this.ph];
    const hq = this.ph === "run" ? Math.round(this.hint * 8) : 0;
    const key = st * 100000 + (this.ri + 1) * 10000 + (this.showIdx + 1) * 1000 + hq * 100 + (this.signer + 1) * 10 + (this.shuffling ? 1 : 0);
    if (key === this.scrKey) return;
    this.scrKey = key;
    this.paintScreen();
  }

  private paintScreen() {
    const g = this.scr;
    const gr = g.createLinearGradient(0, 0, 0, SH);
    gr.addColorStop(0, "#1f1650");
    gr.addColorStop(1, "#0f0b28");
    g.fillStyle = gr;
    g.fillRect(0, 0, SW, SH);
    g.strokeStyle = "rgba(196,177,252,0.07)";
    g.lineWidth = 2;
    for (let x = 32; x < SW; x += 64) (g.beginPath(), g.moveTo(x, 64), g.lineTo(x, SH), g.stroke());
    for (let y = 96; y < SH; y += 64) (g.beginPath(), g.moveTo(0, y), g.lineTo(SW, y), g.stroke());
    g.fillStyle = "rgba(196,177,252,0.14)";
    g.fillRect(0, 0, SW, 62);
    g.fillStyle = LILAC;
    g.fillRect(0, 62, SW, 3);
    const rd = this.rd;
    const h = this.height + Math.max(0, this.ri);
    text(g, `BLOCK #${h.toLocaleString("en-US")}`, 26, 33, 30, LILAC, "left", 800, MONO);
    text(g, rd.lvl, SW - 26, 33, 30, FLARE, "right", 800, MONO);
    if (this.ri >= 0) text(g, `${this.ri + 1}/${ROUNDS.length}`, SW / 2, 33, 26, "rgba(255,255,255,0.55)", "center", 800, MONO);
    const big = (s: string, y: number, size: number, c: string, x = SW / 2) => {
      g.font = `900 ${size}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineWidth = size * 0.16;
      g.strokeStyle = INK;
      g.strokeText(s, x, y + size * 0.06);
      g.fillStyle = INK;
      g.fillText(s, x, y + size * 0.06);
      g.fillStyle = c;
      g.fillText(s, x, y);
    };
    // a row of slots: the proof's sigils (shown, hidden, ghosted by the hint)
    const row = (y: number, s: number, show: (k: number) => number) => {
      const gap = s * 0.16;
      const tw = this.len * s + (this.len - 1) * gap;
      let x = SW / 2 - tw / 2;
      for (let k = 0; k < this.len; k++, x += s + gap) {
        const a = show(k);
        if (a < 1) paintUnknown(g, x, y, s, false);
        if (a > 0) {
          g.globalAlpha = a;
          paintTile(g, x, y, s, this.seq[k], this.pads[this.seq[k]].glyph);
          g.globalAlpha = 1;
        }
        text(g, String(k + 1), x + s / 2, y + s + 18, 20, "rgba(196,177,252,0.7)", "center", 800, MONO);
      }
    };
    if (this.phase === "card" || this.ri < 0) {
      big(T("PROVE THE BLOCK", "证明区块"), 200, 84, "#ffffff");
      text(g, T("MEMORIZE · RUN · PROVE", "记住 · 奔跑 · 证明"), SW / 2, 300, 40, LILAC, "center", 800);
    } else if (this.ph === "intro") {
      if (this.shuffling) big(T("SHUFFLE!", "洗牌！"), 220, 120, FLARE);
      else {
        big(this.ri === ROUNDS.length - 1 ? T("LAST BLOCK", "最后一个区块") : T("NEW BLOCK", "新区块"), 190, 100, "#ffffff");
        text(g, T(`${this.len} SIGILS TO PROVE`, `要证明 ${this.len} 个印记`), SW / 2, 300, 42, LILAC, "center", 800);
      }
    } else if (this.ph === "show") {
      const k = this.showIdx;
      if (k >= 0) {
        const p = this.seq[k];
        rr(g, SW / 2 - 162, 74, 324, 324, 50);
        g.fillStyle = "#ffffff";
        g.fill();
        paintTile(g, SW / 2 - 150, 86, 300, p, this.pads[p].glyph);
        text(g, this.pads[p].id ? `SNARK` : "", SW / 2 + 300, 210, 30, "rgba(255,255,255,0.55)", "center", 800, MONO);
        text(g, this.pads[p].id ? `#${this.pads[p].id}` : "", SW / 2 + 300, 250, 34, "rgba(255,255,255,0.75)", "center", 800, MONO);
        big(`${k + 1}/${this.len}`, 236, 104, LILAC, SW / 2 - 300);
      } else big(T("WATCH!", "看好！"), 230, 140, "#ffffff");
      // (the slots: the one shown lit, the others hidden)
      const s = 44,
        gap = 10;
      const tw = this.len * s + (this.len - 1) * gap;
      let x = SW / 2 - tw / 2;
      for (let j = 0; j < this.len; j++, x += s + gap) {
        if (j === k) {
          rr(g, x - 4, 410 - 4, s + 8, s + 8, 12);
          g.fillStyle = "#ffffff";
          g.fill();
          paintTile(g, x, 410, s, this.seq[j], this.pads[this.seq[j]].glyph);
        } else paintUnknown(g, x, 410, s, false);
      }
    } else if (this.ph === "run") {
      big(T("PROVE!", "证明！"), 150, 120, FLARE);
      row(250, 104, () => clamp(this.hint, 0, 1) * 0.85);
      if (this.hint > 0.02) {
        rr(g, SW - 170, 84, 144, 44, 22);
        g.fillStyle = LILAC;
        g.fill();
        text(g, T("HINT", "提示"), SW - 98, 107, 26, INK, "center", 900);
      }
    } else if (this.ph === "end") {
      if (this.signer >= 0) {
        const p = this.players[this.signer];
        big(T("PROVEN!", "已证明！"), 140, 104, p.color);
        text(g, T(`BY ${short(p)}`, `证明者：${short(p)}`), SW / 2, 222, 38, "#ffffff", "center", 900);
      } else {
        big(T("TIME!", "时间到！"), 140, 104, "#ff5f6d");
        text(g, T("NO PROOF", "无人证明"), SW / 2, 222, 38, "#ffffff", "center", 900);
      }
      row(270, 96, () => 1);
    } else {
      big(T("FINAL TALLY", "最终统计"), 120, 80, "#ffffff");
      const order = rankBy(this.totals, this.tie());
      order.forEach((seat, k) => {
        const p = this.players[seat];
        const y = 196 + k * 64;
        rr(g, 180, y - 26, SW - 360, 52, 26);
        g.fillStyle = k === 0 ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.07)";
        g.fill();
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(220, y, 16, 0, Math.PI * 2);
        g.fill();
        text(g, short(p), 252, y + 1, 30, p.color, "left", 900);
        text(g, "■".repeat(this.signs[seat]), 560, y + 1, 26, LILAC, "left", 900);
        text(g, String(this.totals[seat]), SW - 210, y + 1, 36, "#ffffff", "right", 900);
      });
    }
    this.scrTex.needsUpdate = true;
  }

  // ---- the phases --------------------------------------------------------------------------------

  idle(dt: number, phase: "card" | "count", k: number) {
    this.phase = phase;
    this.clk += dt;
    if (phase === "card") {
      this.cam.orbit(this.v.set(0, 2.5, -2.5), -0.5 + k * 0.12, this.L.card.r, this.L.card.h);
      this.lens(this.L.wide.fov, 1);
      // the pads sing a little demo (without the sound)
      this.cardT -= dt;
      if (this.cardT <= 0) {
        this.cardT = 0.5;
        let p = Math.floor(Math.random() * NP);
        if (p === this.cardPad) p = (p + 4) % NP;
        this.cardPad = p;
      }
      for (let i = 0; i < NP; i++) this.pads[i].lit = i === this.cardPad ? Math.min(1, this.pads[i].lit + dt * 8) : Math.max(0, this.pads[i].lit - dt * 4);
    } else {
      if (this.cardPad >= 0) for (const p of this.pads) p.lit = Math.max(0, p.lit - dt * 4);
      this.playCam(dt, true);
    }
    this.cam.apply(dt);
    for (const r of this.run) {
      r.a.physics(dt, 0);
      r.a.face(Math.PI, dt, 6);
      r.a.sync(dt);
    }
    this.animate(dt);
    this.screen();
  }

  update(dt: number, input: Input) {
    for (let k = 0; k < this.turbo; k++) this.frameStep(dt, input);
  }

  private frameStep(dt: number, input: Input) {
    this.phase = "play";
    this.clk += dt;
    this.frame++;
    if (!this.over) ((this.stats.playT += dt), this.tick(dt));
    else this.post += dt;
    const ctl = this.ph === "run" && !this.over;
    for (let i = 0; i < 4; i++) this.move(i, dt, input, ctl);
    if (ctl) this.shoves();
    this.collide();
    // (a rotating order: two signing in the same frame is decided fairly)
    for (let n = 0; n < 4; n++) this.place((n + this.frame) % 4, dt);
    this.animate(dt);
    this.camera(dt);
    this.screen();
    for (let i = 0; i < 4; i++) this.bump[i] = Math.max(0, this.bump[i] - dt * 2.5);
    this.hurt = Math.max(0, this.hurt - dt * 1.8);
  }

  /** The match's clock: intro → show → run → end, four times, then the tally. */
  private tick(dt: number) {
    if (this.ri < 0) this.newRound();
    this.pt += dt;
    this.twists(dt);
    const rd = this.rd;
    switch (this.ph) {
      case "intro": {
        const dur = INTRO + (this.ri === 0 ? 0.7 : 0) + (rd.shuffle ? SHUF_T + 0.25 : 0);
        if (rd.shuffle && !this.shuffling && this.pt > 0.75 && this.pt < 0.75 + SHUF_T) this.startShuffle();
        if (this.shuffling) {
          const k = clamp((this.pt - 0.75) / SHUF_T, 0, 1);
          this.placePads(k);
          if (k >= 1) this.endShuffle();
        }
        if (this.pt >= dur) this.go("show");
        break;
      }
      case "show": {
        const k = Math.floor((this.pt - 0.3) / rd.step);
        const inStep = (this.pt - 0.3) - k * rd.step;
        if (k >= 0 && k < this.len && k !== this.showIdx) {
          this.showIdx = k;
          const p = this.seq[k];
          bell(p, 0.5, 0.42);
          this.fx.burst(this.v.set(this.pads[p].x, PAD_Y + 0.6, this.pads[p].z), 16, [PADC[p], "#ffffff"], { speed: 4, up: 6, size: 0.2, life: 0.7 });
        }
        for (let i = 0; i < NP; i++) {
          const on = k >= 0 && k < this.len && this.seq[k] === i && inStep < rd.step * 0.72;
          const pd = this.pads[i];
          pd.lit = on ? Math.min(1, pd.lit + dt * 14) : Math.max(0, pd.lit - dt * 7);
        }
        // the snarks watch the lit pad
        if (k >= 0 && k < this.len) {
          const pd = this.pads[this.seq[k]];
          for (const r of this.run) r.a.face(yawOf(pd.x - r.a.pos.x, pd.z - r.a.pos.z), dt, 5);
        }
        if (this.pt >= 0.3 + this.len * rd.step + 0.25) this.go("run");
        break;
      }
      case "run": {
        this.rt += dt;
        const ha = hintAt(this.len) * this.L.capK;
        this.hint = clamp((this.rt - ha) / HINT_T, 0, 1);
        if (this.hint > 0 && this.hint - dt / HINT_T <= 0) osc(1568, 0.25, "sine", 0.12);
        const cap = capOf(this.len) * this.L.capK;
        if (!this.hurried && cap - this.rt <= 3) {
          this.hurried = true;
          this.say(T("HURRY!", "快！"), "#ff5f6d", 0.9, 56);
          music.rate(1.25);
        }
        if (this.rt >= cap) this.endRound(-1);
        break;
      }
      case "end": {
        if (!this.banked && this.pt >= BANK_AT) this.bank();
        if (this.pt >= END_T) {
          if (this.ri < ROUNDS.length - 1) this.newRound();
          else this.go("tally");
        }
        break;
      }
      case "tally": {
        if (this.pt >= TALLY_T) this.finish();
        break;
      }
      default:
        break;
    }
  }

  /**
   * The level's twist, every frame of the match: the carousel turns while they run (and turns back,
   * after a warning: the bulbs flash, a horn), and winds back between blocks; the lights go out while
   * they run (a flicker first), the lightning (its thunder first) shows the floor a blink.
   */
  private twists(dt: number) {
    const L = this.L;
    const running = this.ph === "run" && !this.over;
    if (L.spin) {
      const sp = L.spin;
      if (running) {
        const left = this.flipAt - this.rt;
        const w = clamp(1 - left / 0.95, 0, 1);
        if (w > 0 && this.warn <= 0) {
          osc(196, 0.36, "sawtooth", 0.13, 0, 1.0);
          osc(262, 0.36, "sawtooth", 0.1, 0.12, 1.0);
          if (this.flips < 2 || this.players.some((p) => p.human)) this.say(T("TURNING BACK!", "要反转了！"), FLARE, 0.95, 40, H * 0.44);
        }
        this.warn = w;
        if (left <= 0) {
          this.spinDir = -this.spinDir;
          this.flipAt += sp.flip * (0.85 + 0.3 * this.rnd());
          this.flips++;
          this.warn = 0;
          sfx.whoosh();
          this.cam.shake(0.12);
          if (L.floor.kind === "disc")
            for (let k = 0; k < 10; k++) {
              const a = (k / 10) * Math.PI * 2;
              this.fx.burst(this.v.set(Math.cos(a) * (L.floor.r - 0.4), 0.35, Math.sin(a) * (L.floor.r - 0.4)), 5, ["#ffc83a", "#ffffff", FLARE], { speed: 3, up: 4.5, size: 0.15, life: 0.6, gravity: 9 });
            }
        }
        const goal = this.spinDir * sp.rate[Math.max(0, this.ri)];
        this.omega += (goal - this.omega) * (1 - Math.exp(-3.2 * dt));
        this.theta += this.omega * dt;
      } else {
        // (stopped, and wound back to where it started: the start line at the front again)
        this.warn = 0;
        this.omega += (0 - this.omega) * (1 - Math.exp(-6 * dt));
        const a = Math.atan2(Math.sin(this.theta), Math.cos(this.theta));
        this.theta = a * Math.exp(-3.4 * dt) + this.omega * dt;
        if (Math.abs(this.theta) < 1e-4) this.theta = 0;
      }
      this.table.rotation.y = this.theta;
    }
    if (L.dark) {
      if (running) {
        // the flicker, then out
        const k = this.rt;
        this.dark = k < 0.75 ? (Math.floor(k * 9) % 2 ? 0.85 : 0.2) * (k / 0.75) : Math.min(1, this.dark + dt * 3);
        if (k >= 0.75 && this.boltAt <= 0) this.boltAt = k + 1.6 + Math.random() * 1.2;
        if (this.boltAt > 0 && k >= this.boltAt - 0.7 && this.rumble <= 0) {
          this.rumble = 0.8;
          osc(55, 0.9, "sawtooth", 0.16, 0, 0.6);
          osc(41, 1.1, "triangle", 0.2, 0.05, 0.7);
        }
        if (this.boltAt > 0 && k >= this.boltAt) {
          this.flash = 1;
          this.boltAt = k + 2.4 + Math.random() * 1.8;
          this.rumble = 0;
          for (let j = 0; j < 3; j++) {
            const n = L.lanes[Math.floor(Math.random() * L.lanes.length)];
            this.fx.burst(this.v.set(n[0], 0.15, n[1]), 9, ["#f4e8ff", "#ff4fd8", "#3ff2d0"], { speed: 4, up: 3, size: 0.13, life: 0.45, gravity: 10 });
          }
          osc(1800, 0.08, "square", 0.08, 0, 0.3);
          this.cam.shake(0.14);
        }
      } else {
        this.dark = Math.max(0, this.dark - dt * 2.5);
        this.boltAt = 0;
      }
      this.rumble = Math.max(0, this.rumble - dt);
      this.flash = Math.max(0, this.flash - dt * 2.6);
      const lit = 1 - this.dark * (1 - Math.min(1, this.flash * 1.6));
      this.w.hemi.intensity = this.hemi0 * (0.16 + 0.84 * lit);
      this.w.sun.intensity = this.sun0 * (0.06 + 0.94 * lit);
    }
  }

  /** A point in the arena's frame, into the world's (the carousel turned). */
  private wv(v: THREE.Vector3) {
    if (this.theta === 0) return v;
    const c = Math.cos(this.theta),
      s = Math.sin(this.theta);
    const x = v.x,
      z = v.z;
    v.x = x * c + z * s;
    v.z = -x * s + z * c;
    return v;
  }

  private go(ph: Ph) {
    this.ph = ph;
    this.pt = 0;
    if (ph === "show") {
      this.showIdx = -1;
    } else if (ph === "run") {
      this.showIdx = -1;
      this.rt = 0;
      this.hint = 0;
      this.hurried = false;
      for (const p of this.pads) p.lit = 0;
      this.say(T("PROVE!", "证明！"), FLARE, 0.9, 92);
      sfx.go();
      // (the music plays while they run: the reveal is the pads' own notes)
      music.play(this.L.song);
      if (this.L.spin) {
        this.spinDir = this.ri % 2 ? -1 : 1;
        this.flipAt = this.L.spin.flip * (0.8 + 0.3 * this.rnd());
        this.warn = 0;
        if (this.ri === 0) this.say(T("THE PLAZA TURNS!", "广场转起来了！"), "#ffc83a", 1.3, 40, H * 0.46, 0.3);
      }
      if (this.L.dark) {
        this.boltAt = 0;
        if (this.ri === 0) this.say(T("LIGHTS OUT!", "熄灯了！"), "#ffe9b8", 1.3, 44, H * 0.46, 0.3);
        osc(140, 0.5, "square", 0.12, 0.2, 0.4);
      }
      music.rate(this.ri === ROUNDS.length - 1 ? 1.12 : 1 + this.ri * 0.03);
      for (let i = 0; i < 4; i++) this.brief(i);
    } else if (ph === "tally") {
      // everyone back to the front line, in their order (the leader in the middle), facing us
      const order = rankBy(this.totals, this.tie());
      const spot = [1, 2, 0, 3];
      order.forEach((seat, k) => {
        const r = this.run[seat];
        r.hx0 = r.a.pos.x;
        r.hz0 = r.a.pos.z;
        r.hx1 = this.L.spots[spot[k]];
        r.hz1 = this.L.startZ;
        r.stun = r.knock = r.wind = r.lunge = 0;
        r.hop = 0.62;
        r.a.vy = 0;
        r.a.grounded = true;
        r.a.jump(8.2);
      });
      sfx.chips();
      this.say(T("FINAL TALLY", "最终统计"), LILAC, 1.5, 44, 150);
    }
  }

  /** A new block: its proof, everyone back to the start line, the stamps washed off. */
  private newRound() {
    this.ri++;
    this.rd = ROUNDS[this.ri];
    this.len = this.rd.len;
    this.ph = "intro";
    this.pt = 0;
    this.signer = -1;
    this.banked = false;
    this.showIdx = -1;
    this.hint = 0;
    // the proof: distinct pads, never one straight after itself or a twin of the last block's start
    let n = 0;
    while (n < this.len) {
      const p = Math.floor(this.rnd() * NP);
      let dup = false;
      for (let k = 0; k < n; k++) if (this.seq[k] === p) dup = true;
      if (!dup) this.seq[n++] = p;
    }
    music.stop(0.25);
    for (let i = 0; i < 4; i++) {
      const r = this.run[i];
      r.step = 0;
      r.on = -1;
      r.stun = r.slow = r.knock = r.wind = r.lunge = 0;
      r.cd = 0.4;
      r.guard = 0;
      r.ai.want = -1;
      // (the start spots turn round each block: nobody keeps the best one)
      const x = this.L.spots[(i + 1 + this.ri) % 4];
      r.hx0 = r.a.pos.x;
      r.hz0 = r.a.pos.z;
      r.hx1 = x;
      r.hz1 = this.L.startZ;
      if (this.ri > 0) {
        r.hop = 0.62;
        r.a.vy = 0;
        r.a.grounded = true;
        r.a.jump(8.2);
      }
    }
    const last = this.ri === ROUNDS.length - 1;
    if (last) this.say(T("LAST BLOCK!", "最后一个区块！"), FLARE, 1.2, 74, H * 0.3);
    // (the first one after the host's GO!)
    this.say(`${this.rd.lvl} · ${T(`${this.len} SIGILS`, `${this.len} 个印记`)}`, LILAC, last ? 1.25 : 1.15, last ? 40 : 54, last ? H * 0.44 : H * 0.32, this.ri === 0 ? 0.8 : 0);
    osc(392, 0.12, "square", 0.18);
    osc(587, 0.18, "square", 0.18, 0.1);
  }

  private startShuffle() {
    this.shuffling = true;
    // a new place for every pad (none keeps its own)
    const to = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (;;) {
      for (let k = to.length - 1; k > 0; k--) {
        const j = Math.floor(this.rnd() * (k + 1));
        [to[k], to[j]] = [to[j], to[k]];
      }
      let fixed = 0;
      for (let i = 0; i < NP; i++) if (to[this.pads[i].slot] === this.pads[i].slot) fixed++;
      if (fixed <= 1) break;
    }
    for (let i = 0; i < NP; i++) {
      const p = this.pads[i];
      p.fx = p.x;
      p.fz = p.z;
      p.slot = to[p.slot];
      p.tx = this.sx[p.slot];
      p.tz = this.sz[p.slot];
      this.bySlot[p.slot] = i;
    }
    sfx.whoosh();
    osc(330, 0.5, "triangle", 0.2, 0, 2);
  }

  private endShuffle() {
    this.shuffling = false;
    for (const p of this.pads) {
      p.x = p.tx;
      p.z = p.tz;
      p.arc = 0;
      this.fx.burst(this.v.set(p.x, 0.2, p.z), 10, ["#ffffff", "#d8ccff"], { speed: 3.5, up: 1.4, gravity: 5, size: 0.22, life: 0.5, drag: 3 });
    }
    sfx.thud();
    this.cam.shake(0.25);
  }

  /** The pads along a shuffle (k 0…1): up, across, down; at 0, simply in place. */
  private placePads(k: number) {
    for (let i = 0; i < NP; i++) {
      const p = this.pads[i];
      if (!this.shuffling) {
        p.arc = 0;
        continue;
      }
      // (each a little after the other: a ripple)
      const d = (i % 3) * 0.06;
      const kk = clamp((k - d) / (1 - 0.12), 0, 1);
      const e = ease(kk);
      p.x = p.fx + (p.tx - p.fx) * e;
      p.z = p.fz + (p.tz - p.fz) * e;
      p.arc = Math.sin(kk * Math.PI) * 2.2;
    }
  }

  /** The block is signed (seat i), or the time ran out (-1). */
  private endRound(i: number) {
    this.signer = i;
    this.ph = "end";
    this.pt = 0;
    this.hint = 0;
    music.stop(0.4);
    for (let j = 0; j < 4; j++) this.lastBeads[j] = this.run[j].step;
    this.stats.rounds.push({ signer: i, t: +this.rt.toFixed(2), beads: this.run.map((r) => r.step) });
    if (i >= 0) {
      const r = this.run[i];
      this.signs[i]++;
      r.a.cheer(1.6);
      r.a.jump(10);
      r.jumpAt = 0.8;
      for (let j = 0; j < 4; j++) if (j !== i) this.run[j].angryT = 1.2;
      const p = this.players[i];
      this.say(T("BLOCK PROVEN!", "区块已证明！"), p.color, 1.5, 70);
      this.pops.push({ seat: i, s: p.human ? T("YOU PROVED IT!", "你证明了！") : T("PROVEN!", "证明了！"), c: p.color, t: this.clk, big: true });
      for (let k = 0; k < this.len; k++) bell(this.seq[k], 0.18, 0.22, k * 0.06);
      setTimeout(() => sfx.star(), this.len * 60);
      this.fx.burst(this.lv(this.v.copy(BLOCK).setZ(BLOCK.z + 1.6)), 60, [p.color, "#ffffff", LILAC, FLARE], { speed: 11, up: 5, size: 0.26, life: 1.3, gravity: 9 });
      this.fx.burst(this.v.set(r.a.pos.x, r.a.pos.y + 1.4, r.a.pos.z), 30, [p.color, "#ffffff"], { speed: 6, up: 6, size: 0.2, life: 1 });
      this.cam.shake(0.3);
      // a little block joins the chain in the signer's colour
      const cb = this.chain[this.chainOf.length];
      if (cb) {
        for (const o of this.chain) if (o.on) o.slot++;
        cb.on = true;
        cb.slot = 0;
        cb.t = -0.75;
        cb.m.visible = true;
        cb.m.position.copy(BLOCK);
        cb.m.scale.setScalar(0.3);
        cb.mat.color.set(p.color);
        cb.mat.emissive.set(p.color).multiplyScalar(0.25);
        this.chainOf.push(i);
      }
    } else {
      this.say(T("TIME!", "时间到！"), "#ff5f6d", 1.3, 80);
      sfx.lose();
    }
  }

  /** The block's points: its beads to everyone, +5 to its signer. */
  private bank() {
    this.banked = true;
    for (let i = 0; i < 4; i++) {
      const pts = this.lastBeads[i] + (i === this.signer ? BONUS : 0);
      this.perRound[i].push(pts);
      if (!pts) continue;
      this.totals[i] += pts;
      this.bump[i] = 1;
      this.pops.push({ seat: i, s: `+${pts}`, c: i === this.signer ? "#ffe680" : this.players[i].color, t: this.clk, big: i === this.signer });
    }
    sfx.coin();
  }

  /** A point in the world, into the arena's frame. */
  private lv(v: THREE.Vector3) {
    if (this.theta === 0) return v;
    const c = Math.cos(this.theta),
      s = Math.sin(this.theta);
    const x = v.x,
      z = v.z;
    v.x = x * c - z * s;
    v.z = x * s + z * c;
    return v;
  }

  private tie() {
    return this.totals.map((_, i) => this.signs[i] * 100 + this.lastBeads[i]);
  }

  private finish() {
    this.over = rankBy(this.totals, this.tie());
    this.ph = "done";
    const win = this.run[this.over[0]];
    win.a.cheer(3);
    win.a.jump(9.5);
    win.jumpAt = 0.8;
    this.run[this.over[3]].angryT = 9;
    this.fx.burst(this.v.set(win.a.pos.x, win.a.pos.y + 2, win.a.pos.z), 50, [win.p.color, "#ffffff", LILAC, FLARE], { speed: 8, up: 7, size: 0.24, life: 1.4 });
    if (location.search.includes("signbot")) console.info("[sign]", JSON.stringify({ order: this.over, totals: this.totals, signs: this.signs, stats: this.stats }));
  }

  // ---- the players -------------------------------------------------------------------------------

  /**
   * The pad seat i counts as on (-1: a lane): its middle reached, or its top stood on a beat (`live`:
   * it can step on things now; knocked or staggered, it gets a grace before an edge counts). Off once past the edge.
   */
  private padUnder(r: Run, dt: number, live: boolean) {
    const x = r.a.pos.x,
      z = r.a.pos.z;
    if (r.on >= 0) {
      const p = this.pads[r.on];
      if (Math.abs(x - p.x) <= HALF + OUT && Math.abs(z - p.z) <= HALF + OUT) return r.on;
    }
    if (this.shuffling) return -1;
    let over = -1;
    for (let i = 0; i < NP; i++) {
      const p = this.pads[i];
      const dx = Math.abs(x - p.x),
        dz = Math.abs(z - p.z);
      if (dx <= CORE && dz <= CORE) return i;
      if (dx <= DWELL_IN && dz <= DWELL_IN) over = i;
    }
    if (over !== r.dwellPad || !live) {
      r.dwellPad = over;
      r.dwell = live ? 0 : -0.45;
    } else r.dwell += dt;
    return over >= 0 && r.dwell >= DWELL ? over : -1;
  }

  private floorAt(x: number, z: number) {
    for (let i = 0; i < NP; i++) {
      const p = this.pads[i];
      if (p.arc > 0.05) continue;
      if (Math.abs(x - p.x) <= HALF && Math.abs(z - p.z) <= HALF) return p.y;
    }
    return 0;
  }

  /** Steps a seat onto pad p: the right glyph, a safe one (already stamped), or a wrong one. */
  private enter(i: number, p: number) {
    const r = this.run[i];
    const k = r.step;
    if (p === this.seq[k]) return this.correct(i, p);
    for (let j = 0; j < k; j++) if (this.seq[j] === p) return;
    this.wrong(i, p);
  }

  private correct(i: number, p: number) {
    const r = this.run[i],
      pl = this.players[i];
    r.beadPop[r.step] = 1;
    r.step++;
    r.stepAt = this.rt;
    r.kick[p] = 1;
    const pd = this.pads[p];
    pd.flash = 1;
    pd.flashC.set(pl.color);
    pd.press = 1;
    this.fx.burst(this.v.set(r.a.pos.x, pd.y + 0.15, r.a.pos.z), 12, [pl.color, "#ffffff", PADC[p]], { speed: 4.5, up: 3.5, size: 0.18, life: 0.55, gravity: 12 });
    if (pl.human) {
      bell(p, 0.34, 0.34);
      osc(150, 0.12, "sine", 0.3, 0, 0.55);
      this.cam.shake(0.06);
      if (r.step === this.len - 1 && this.len > 1) this.pops.push({ seat: i, s: T("1 MORE!", "还差 1 个！"), c: "#ffffff", t: this.clk, big: false });
    } else osc(TONES[p] * 0.5, 0.08, "triangle", 0.09);
    if (!pl.human) {
      // a pause before the next one (a real hesitation, now and then, the weaker ones)
      const s = pl.skill;
      r.ai.think = (1 - s) * 0.22 * this.rnd() + 0.09 + (this.L.dark?.think ?? 0);
      if (this.rnd() < (1 - s) * 0.4) r.ai.think += 0.35 + this.rnd() * 0.5 * (1 - s);
    }
    if (r.step >= this.len) this.endRound(i);
  }

  private wrong(i: number, p: number) {
    const r = this.run[i],
      pl = this.players[i];
    this.stats.wrong[i]++;
    const had = r.step;
    for (let k = 0; k < had; k++) r.beadPop[k] = -1;
    r.step = 0;
    r.stun = STAGGER;
    r.slow = STAGGER + SLOW;
    r.vx *= 0.15;
    r.vz *= 0.15;
    r.spin = (this.rnd() < 0.5 ? -1 : 1) * 9;
    r.a.hit();
    r.angryT = 1;
    r.sq = 1;
    const pd = this.pads[p];
    pd.red = 1;
    pd.press = 1;
    this.fx.burst(this.v.set(r.a.pos.x, pd.y + 1.6, r.a.pos.z), 10 + had * 5, ["#ff3d5a", "#ffffff", pl.color], { speed: 5, up: 4, size: 0.2, life: 0.6 });
    this.pops.push({ seat: i, s: pl.human ? T("WRONG SIGIL!", "错印记！") : "✗", c: "#ff5f6d", t: this.clk, big: pl.human });
    if (pl.human) {
      buzz(0.32);
      this.hurt = 1;
      this.cam.shake(0.22);
    } else {
      buzz(0.12);
      // what it learnt: that pad isn't the one (it may now remember the right one)
      const ai = r.ai;
      const k = this.memStep(i, p);
      if (k >= 0) {
        ai.tried[k] |= 1 << p;
        ai.mem[k] = this.rnd() < 0.5 + 0.45 * pl.skill ? this.seq[k] : this.confuse(k, ai.tried[k]);
      }
      ai.think = 0.15 + (1 - pl.skill) * 0.35;
      ai.goal = -1;
    }
  }

  /** Which step of its memory sent an AI to pad p (the step it was on when it stepped there). */
  private memStep(i: number, p: number) {
    const ai = this.run[i].ai;
    for (let k = 0; k < this.len; k++) if (ai.mem[k] === p) return k;
    return -1;
  }

  /** A misremembered glyph for step k: a neighbour on the grid, or the next one in the signature (an order slip). */
  private confuse(k: number, tried: number) {
    const t = this.seq[k];
    const cand: number[] = [];
    const ok = (p: number) => {
      if (p === t || tried & (1 << p)) return false;
      for (let j = 0; j < k; j++) if (this.seq[j] === p) return false;
      return true;
    };
    if (k + 1 < this.len && ok(this.seq[k + 1])) cand.push(this.seq[k + 1], this.seq[k + 1]);
    for (const ns of this.nbr[this.pads[t].slot]) {
      const p = this.bySlot[ns];
      if (ok(p)) cand.push(p);
    }
    if (!cand.length) return t;
    return cand[Math.floor(this.rnd() * cand.length)];
  }

  /** At PROVE!: what each AI remembers of the proof, and its reaction. */
  private brief(i: number) {
    const r = this.run[i],
      ai = r.ai,
      s = this.players[i].skill;
    ai.tried.fill(0);
    ai.goal = -1;
    ai.pn = ai.pi = 0;
    ai.stuck = 0;
    for (let k = 0; k < this.len; k++) {
      // (the good ones slip now and then on a long one; the weak ones often)
      const err = (0.03 + 0.34 * Math.pow(1 - s, 1.6)) * (1 + 0.3 * k) * (this.L.dark?.err ?? 1);
      ai.mem[k] = this.rnd() < err ? this.confuse(k, 0) : this.seq[k];
    }
    // (even the best take a moment to read the floor: no superhuman starts)
    ai.react = 0.26 + (1 - s) * 0.75 + this.rnd() * 0.2;
    ai.think = 0;
  }

  /** One seat's moves: the human's stick or an AI's brain, the shove, the knock, the stagger. */
  private move(i: number, dt: number, input: Input, ctl: boolean) {
    const r = this.run[i],
      a = r.a;
    r.cd -= dt;
    r.lend = false;
    const wasCd = r.cd + dt;
    if (r.p.human && wasCd > 0 && r.cd <= 0) r.ready = 1;
    r.ready = Math.max(0, r.ready - dt * 2.5);
    r.guard -= dt;
    r.bbuf -= dt;
    r.slow -= dt;
    let mx = 0,
      mz = 0;
    if (r.hop > 0) {
      // the hop back to the start line
      r.hop -= dt;
      const k = clamp(1 - r.hop / 0.62, 0, 1);
      a.pos.x = r.hx0 + (r.hx1 - r.hx0) * k;
      a.pos.z = r.hz0 + (r.hz1 - r.hz0) * k;
      a.face(Math.PI, dt, 10);
      r.vx = r.vz = 0;
      return;
    }
    if (r.stun > 0) {
      r.stun -= dt;
      const k = Math.exp(-6 * dt);
      r.vx *= k;
      r.vz *= k;
    } else if (r.knock > 0) {
      r.knock -= dt;
      const k = Math.exp(-3.2 * dt);
      r.vx *= k;
      r.vz *= k;
      if (r.knock <= 0) r.ai.goal = -1;
    } else if (r.lunge > 0) {
      const left = Math.min(dt, r.lunge);
      r.lunge -= dt;
      r.vx = r.sx * LUNGE_V;
      r.vz = r.sz * LUNGE_V;
      if (r.lunge <= 0) {
        // (the frame it ends on: at full speed for the stretch it still had, the brakes for the rest; it
        // carries and reaches as far at any frame rate)
        a.pos.x += r.vx * 0.75 * left;
        a.pos.z += r.vz * 0.75 * left;
        r.vx *= 0.25;
        r.vz *= 0.25;
        r.lend = true;
      }
    } else {
      if (ctl) {
        if (r.p.human && this.bot) {
          this.botB = false;
          this.bot(this, i, dt);
          mx = this.mx;
          mz = this.mz;
          if (this.botB && r.cd <= 0 && r.wind <= 0) {
            const ll = Math.hypot(mx, mz);
            if (ll > 0.2) this.windUp(i, mx / ll, mz / ll);
            else this.windUp(i, Math.sin(a.yaw), Math.cos(a.yaw));
          }
        } else if (r.p.human) {
          const ax = input.axis();
          // screen-relative: "up" runs away from the camera
          let fx = this.cam.at.x - this.cam.eye.x,
            fz = this.cam.at.z - this.cam.eye.z;
          const fl = Math.hypot(fx, fz) || 1;
          fx /= fl;
          fz /= fl;
          mx = -fz * ax.x - fx * ax.y;
          mz = fx * ax.x - fz * ax.y;
          const l = Math.hypot(mx, mz);
          if (l > 1) ((mx /= l), (mz /= l));
          // (on the carousel: the world's way, in the turning floor's frame)
          if (this.theta !== 0) {
            const c = Math.cos(this.theta),
              s = Math.sin(this.theta);
            const wx = mx;
            mx = wx * c - mz * s;
            mz = wx * s + mz * c;
          }
          if (input.pressed("b") || input.pressed("a")) r.bbuf = 0.16;
          if (r.bbuf > 0 && r.cd <= 0 && r.wind <= 0) {
            const ll = Math.hypot(mx, mz);
            if (ll > 0.2) this.windUp(i, mx / ll, mz / ll);
            else this.windUp(i, Math.sin(a.yaw), Math.cos(a.yaw));
          }
        } else {
          this.brain(i, dt);
          mx = this.mx;
          mz = this.mz;
          if (r.ai.want >= 0 && r.cd <= 0 && r.wind <= 0) {
            const o = this.run[r.ai.want].a.pos;
            const dx = o.x - a.pos.x,
              dz = o.z - a.pos.z;
            const l = Math.hypot(dx, dz) || 1;
            this.windUp(i, dx / l, dz / l);
          }
        }
      }
      if (r.wind > 0) {
        r.wind -= dt;
        mx *= 0.25;
        mz *= 0.25;
        if (r.wind <= 0) this.lunge(i);
      }
      const sp = r.p.human ? SPEED : SPEED * (0.8 + 0.2 * r.p.skill);
      const slow = r.slow > 0 ? 0.45 : 1;
      const k = 1 - Math.exp(-ACC * dt);
      r.vx += (mx * sp * slow - r.vx) * k;
      r.vz += (mz * sp * slow - r.vz) * k;
    }
    a.pos.x += r.vx * dt;
    a.pos.z += r.vz * dt;
  }

  // ---- the shove ---------------------------------------------------------------------------------

  private windUp(i: number, ax: number, az: number) {
    const r = this.run[i],
      a = r.a;
    // (a little help: the nearest rival in a cone round the aim)
    let best = -1,
      bd = REACH + 0.8;
    for (let j = 0; j < 4; j++) {
      if (j === i) continue;
      const o = this.run[j].a.pos;
      const dx = o.x - a.pos.x,
        dz = o.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bd && d > 1e-3 && (dx * ax + dz * az) / d > 0.7) ((best = j), (bd = d));
    }
    if (best >= 0) {
      const o = this.run[best].a.pos;
      const l = Math.hypot(o.x - a.pos.x, o.z - a.pos.z) || 1;
      ax = (o.x - a.pos.x) / l;
      az = (o.z - a.pos.z) / l;
    }
    r.sx = ax;
    r.sz = az;
    r.wind = WIND;
    r.bbuf = 0;
    r.ai.want = -1;
    r.cd = SHOVE_CD;
    this.stats.shoves[i]++;
    osc(230, 0.22, "square", r.p.human ? 0.14 : 0.07, 0, 2.4);
    // (one winding up at you: a warning blip)
    if (!r.p.human)
      for (const h of this.run) {
        if (!h.p.human) continue;
        const dx = h.a.pos.x - a.pos.x,
          dz = h.a.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < REACH + 0.8 && d > 1e-3 && (dx * ax + dz * az) / d > 0.7) (osc(1250, 0.05, "square", 0.18), osc(1250, 0.05, "square", 0.18, 0.09));
      }
  }

  private lunge(i: number) {
    const r = this.run[i],
      a = r.a;
    r.wind = 0;
    r.lunge = LUNGE_T;
    a.yaw = yawOf(r.sx, r.sz);
    this.fx.burst(this.v.set(a.pos.x - r.sx * 0.4, a.pos.y + 0.15, a.pos.z - r.sz * 0.4), 7, ["#ffffff", "#f1e8ff", r.p.color], { speed: 2.4, up: 1.2, gravity: 4, size: 0.18, life: 0.4, drag: 3 });
    sfx.whoosh();
  }

  /** The lunges that land: on whoever is in front (not one just shoved). */
  private shoves() {
    for (let i = 0; i < 4; i++) {
      const A = this.run[i];
      if (A.lunge <= 0 && !A.lend) continue;
      for (let j = 0; j < 4; j++) {
        if (j === i) continue;
        const B = this.run[j];
        if (B.hop > 0) continue;
        const dx = B.a.pos.x - A.a.pos.x,
          dz = B.a.pos.z - A.a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > CONTACT || d < 1e-4) continue;
        if (B.guard > 0) {
          // (guarded: it bounces off)
          A.lunge = 0;
          A.vx = -(dx / d) * 1.5;
          A.vz = -(dz / d) * 1.5;
          this.fx.burst(this.v.set(A.a.pos.x + (dx / d) * 0.6, B.a.pos.y + 1, A.a.pos.z + (dz / d) * 0.6), 8, ["#ffffff", "#bfe8ff"], { speed: 4, up: 2, size: 0.14, life: 0.4 });
          osc(900, 0.06, "triangle", 0.2);
          break;
        }
        this.landShove(i, j, dx / d, dz / d);
        break;
      }
    }
  }

  private landShove(i: number, j: number, nx: number, nz: number) {
    const A = this.run[i],
      B = this.run[j];
    let kx = A.sx * 0.7 + nx * 0.3,
      kz = A.sz * 0.7 + nz * 0.3;
    const kl = Math.hypot(kx, kz) || 1;
    kx /= kl;
    kz /= kl;
    B.vx = kx * KNOCK_V;
    B.vz = kz * KNOCK_V;
    if (B.a.grounded) {
      B.a.vy = 3;
      B.a.grounded = false;
    }
    B.knock = KNOCK_T;
    B.guard = GUARD_T;
    B.wind = B.lunge = 0;
    B.stun = 0;
    // (up again, it may shove straight back)
    B.cd = Math.min(Math.max(B.cd, 0), KNOCK_T + 0.15);
    B.spin = (this.rnd() < 0.5 ? -1 : 1) * 14;
    B.a.hit();
    B.angryT = 1.6;
    B.sq = 1;
    A.lunge = 0;
    A.vx = A.sx * 1.2;
    A.vz = A.sz * 1.2;
    this.stats.hits[i]++;
    if (B.p.human) this.stats.onHuman++;
    // a bead knocked loose
    const lost = this.ph === "run" && B.step > 0;
    if (lost) {
      B.step--;
      B.beadPop[B.step] = -1;
    }
    const mx = A.a.pos.x + nx * CONTACT * 0.55,
      mz = A.a.pos.z + nz * CONTACT * 0.55,
      y = B.a.pos.y;
    this.fx.burst(this.v.set(mx, y + 1.05, mz), 20, ["#ffffff", "#ffe27a", B.p.color, A.p.color], { speed: 6.5, up: 3, size: 0.2, life: 0.55, gravity: 12, dir: this.v2.set(kx * 2.5, 0, kz * 2.5) });
    if (lost) this.fx.burst(this.v.set(B.a.pos.x, y + 2.6, B.a.pos.z), 10, [B.p.color, "#ffffff"], { speed: 4, up: 4, size: 0.24, life: 0.7 });
    this.pops.push({ seat: j, s: lost ? T("BONK! −1", "砰！−1") : T("BONK!", "砰！"), c: A.p.color, t: this.clk, big: B.p.human || A.p.human });
    sfx.hit();
    osc(150, 0.2, "triangle", 0.45, 0, 0.45);
    this.cam.shake(A.p.human || B.p.human ? 0.3 : 0.12);
    if (B.p.human) this.hurt = Math.max(this.hurt, 0.7);
  }

  // ---- the AI ------------------------------------------------------------------------------------

  /** Seat i's wish this frame (this.mx/mz, ai.want): to its next remembered pad, round the others. */
  private brain(i: number, dt: number) {
    const r = this.run[i],
      ai = r.ai,
      s = r.p.skill,
      a = r.a;
    this.mx = this.mz = 0;
    if (ai.react > 0) return void (ai.react -= dt);
    if (ai.think > 0) return void (ai.think -= dt);
    // the hint coming in: it reads the rest of the signature off it, bit by bit
    if (this.hint > 0.3) for (let k = r.step; k < this.len; k++) if (ai.mem[k] !== this.seq[k] && this.rnd() < dt * (0.8 + s) * this.hint) ai.mem[k] = this.seq[k];
    const goal = ai.mem[r.step];
    ai.replan -= dt;
    if (goal !== ai.goal || ai.replan <= 0) this.plan(i, goal);
    // along the path
    let tx = 0,
      tz = 0;
    while (ai.pi < ai.pn) {
      tx = ai.path[ai.pi * 2];
      tz = ai.path[ai.pi * 2 + 1];
      if (ai.pi < ai.pn - 1 && Math.hypot(tx - a.pos.x, tz - a.pos.z) < 0.5) ai.pi++;
      else break;
    }
    let dx = tx - a.pos.x,
      dz = tz - a.pos.z;
    let l = Math.hypot(dx, dz);
    if (l < 1e-3) return;
    dx /= l;
    dz /= l;
    // (a little room round the others, sideways only, off the line it walks)
    for (let j = 0; j < 4; j++) {
      if (j === i) continue;
      const o = this.run[j].a.pos;
      const ox = a.pos.x - o.x,
        oz = a.pos.z - o.z;
      const d = Math.hypot(ox, oz);
      if (d < 1.4 && d > 1e-3 && -(ox * dx + oz * dz) / d > 0.3) {
        const side = ox * -dz + oz * dx >= 0 ? 1 : -1;
        const k = (1.4 - d) * 0.6;
        const px = -dz * side * k,
          pz = dx * side * k;
        dx += px;
        dz += pz;
      }
    }
    l = Math.hypot(dx, dz) || 1;
    this.mx = dx / l;
    this.mz = dz / l;
    // stuck (pushed about, boxed in): look again
    if (Math.hypot(r.vx, r.vz) < 0.8) ai.stuck += dt;
    else ai.stuck = 0;
    if (ai.stuck > 0.5) ((ai.stuck = 0), (ai.replan = 0));
    // a shove: at someone ahead of it in this block, or about to sign; the better ones more often
    if (r.cd <= 0 && ai.want < 0 && s > 0.3) {
      for (let j = 0; j < 4; j++) {
        if (j === i) continue;
        const o = this.run[j];
        if (o.guard > 0 || o.knock > 0 || o.hop > 0) continue;
        const ox = o.a.pos.x - a.pos.x,
          oz = o.a.pos.z - a.pos.z;
        const d = Math.hypot(ox, oz);
        if (d > REACH - 0.5) continue;
        const ahead = o.step > r.step || o.step >= this.len - 1;
        const inWay = d < 1.8 && (ox * this.mx + oz * this.mz) / Math.max(d, 1e-3) > 0.5;
        const rate = ahead && o.step > 0 ? (s - 0.3) * 2.4 : inWay ? (s - 0.3) * 1.2 : 0;
        if (rate > 0 && this.rnd() < rate * dt) {
          ai.want = j;
          break;
        }
      }
    }
  }

  /** A path for seat i to pad `goal`: Dijkstra over the lanes' crossings, never through a pad it mustn't touch. */
  private plan(i: number, goal: number) {
    const r = this.run[i],
      ai = r.ai,
      a = r.a;
    ai.goal = goal;
    ai.replan = 0.7;
    ai.pi = 0;
    const g = this.pads[goal];
    // standing on it already (it was knocked off its bead): off, and back on
    if (r.on === goal) {
      const dx = a.pos.x - g.x,
        dz = a.pos.z - g.z;
      let ex = a.pos.x,
        ez = a.pos.z;
      if (Math.abs(dx) > Math.abs(dz)) ex = g.x + Math.sign(dx || 1) * (HALF + 1.0);
      else ez = g.z + Math.sign(dz || 1) * (HALF + 1.0);
      ai.path[0] = ex;
      ai.path[1] = ez;
      ai.path[2] = g.x;
      ai.path[3] = g.z;
      ai.pn = 2;
      ai.replan = 1.2;
      return;
    }
    const f = this.forbid;
    f.fill(1);
    f[goal] = 0;
    for (let k = 0; k < r.step; k++) f[this.seq[k]] = 0;
    if (r.on >= 0) f[r.on] = 0;
    for (let p = 0; p < NP; p++) {
      const pd = this.pads[p];
      if (Math.abs(a.pos.x - pd.x) <= HALF && Math.abs(a.pos.z - pd.z) <= HALF) f[p] = 0;
    }
    const nx = this.nx,
      nz = this.nz;
    const lanes = this.L.lanes;
    const NL = lanes.length,
      ME = NL + NP,
      NODES = this.nodes;
    for (let k = 0; k < NL; k++) ((nx[k] = lanes[k][0]), (nz[k] = lanes[k][1]));
    for (let s = 0; s < NP; s++) ((nx[NL + s] = this.sx[s]), (nz[NL + s] = this.sz[s]));
    nx[ME] = a.pos.x;
    nz[ME] = a.pos.z;
    const target = NL + g.slot;
    // (standing in a lane close by a pad it mustn't touch: from where it stands, only the pad itself blocks)
    let near = 0;
    for (let p = 0; p < NP; p++) {
      const pd = this.pads[p];
      if (f[p] && Math.abs(a.pos.x - pd.x) <= AVOID && Math.abs(a.pos.z - pd.z) <= AVOID) near |= 1 << p;
    }
    // (-1: blocked by a pad it mustn't touch; else the extra cost of the pads it crosses on the way)
    const extra = (u: number, v: number) => {
      let e = 0;
      for (let p = 0; p < NP; p++) {
        const pd = this.pads[p];
        if (f[p]) {
          const h = (u === ME || v === ME) && near & (1 << p) ? HALF - 0.05 : AVOID;
          if (segHits(nx[u], nz[u], nx[v], nz[v], pd.x, pd.z, h)) return -1;
        } else if (p !== goal && p !== r.on && segHits(nx[u], nz[u], nx[v], nz[v], pd.x, pd.z, HALF)) e += CROSS;
      }
      return e;
    };
    const usable = (u: number) => u < NL || u === ME || u === target || (u >= NL && u < ME && !f[this.bySlot[u - NL]]);
    this.dist.fill(1e9);
    this.prev.fill(-1);
    this.seen.fill(0);
    this.dist[ME] = 0;
    for (;;) {
      let u = -1,
        bd = 1e9;
      for (let k = 0; k < NODES; k++) if (!this.seen[k] && this.dist[k] < bd && usable(k)) ((bd = this.dist[k]), (u = k));
      if (u < 0 || u === target) break;
      this.seen[u] = 1;
      for (let v = 0; v < NODES; v++) {
        if (this.seen[v] || v === u || !usable(v)) continue;
        const w = bd + Math.hypot(nx[v] - nx[u], nz[v] - nz[u]);
        if (w >= this.dist[v]) continue;
        const e = extra(u, v);
        if (e >= 0 && w + e < this.dist[v]) ((this.dist[v] = w + e), (this.prev[v] = u));
      }
    }
    if (this.prev[target] < 0) {
      // (no way round: straight for it)
      ai.path[0] = g.x;
      ai.path[1] = g.z;
      ai.pn = 1;
      return;
    }
    let n = 0;
    for (let u = target; u !== ME && u >= 0; u = this.prev[u]) n++;
    n = Math.min(n, 16);
    let k = n - 1;
    for (let u = target; u !== ME && u >= 0 && k >= 0; u = this.prev[u], k--) ((ai.path[k * 2] = nx[u]), (ai.path[k * 2 + 1] = nz[u]));
    ai.pn = n;
  }

  /** The bench's scripted human: the next waypoint toward pad `goal` for seat i (the AI's own planner). */
  route(i: number, goal: number) {
    const r = this.run[i];
    const save = r.ai.goal;
    this.plan(i, goal);
    r.ai.goal = save;
    const ai = r.ai;
    let k = 0;
    while (k < ai.pn - 1 && Math.hypot(ai.path[k * 2] - r.a.pos.x, ai.path[k * 2 + 1] - r.a.pos.z) < 0.5) k++;
    return [ai.path[k * 2], ai.path[k * 2 + 1]];
  }

  // ---- the world's rules -------------------------------------------------------------------------

  /** Bodies apart (a soft push, never through a hop). */
  private collide() {
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const A = this.run[i],
          B = this.run[j];
        if (A.hop > 0 || B.hop > 0) continue;
        const a = A.a.pos,
          b = B.a.pos;
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < PR * 2 && d > 1e-4) {
          const push = (PR * 2 - d) / 2;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
  }

  /** The walls, the floor (the pads' tops), the pad under the feet and what it means; the pose. */
  private place(i: number, dt: number) {
    const r = this.run[i],
      a = r.a,
      p = a.pos;
    const fl = this.L.floor;
    if (fl.kind === "rect") {
      if (p.x < fl.x0 + PR) ((p.x = fl.x0 + PR), (r.vx = Math.max(0, r.vx)));
      if (p.x > fl.x1 - PR) ((p.x = fl.x1 - PR), (r.vx = Math.min(0, r.vx)));
      if (p.z < fl.z0 + PR) ((p.z = fl.z0 + PR), (r.vz = Math.max(0, r.vz)));
      if (p.z > fl.z1 - PR) ((p.z = fl.z1 - PR), (r.vz = Math.min(0, r.vz)));
    } else if (fl.kind === "disc") {
      const d = Math.hypot(p.x, p.z),
        lim = fl.r - PR - 0.25;
      if (d > lim) {
        const nx = p.x / d,
          nz = p.z / d;
        p.x = nx * lim;
        p.z = nz * lim;
        const vn = r.vx * nx + r.vz * nz;
        if (vn > 0) ((r.vx -= vn * nx), (r.vz -= vn * nz));
      }
    } else {
      const h = fl.h - PR;
      if (p.x < -h) ((p.x = -h), (r.vx = Math.max(0, r.vx)));
      if (p.x > h) ((p.x = h), (r.vx = Math.min(0, r.vx)));
      if (p.z < -h) ((p.z = -h), (r.vz = Math.max(0, r.vz)));
      if (p.z > h) ((p.z = h), (r.vz = Math.min(0, r.vz)));
      // (the cut corners)
      const sx = Math.sign(p.x) || 1,
        sz = Math.sign(p.z) || 1;
      const over = (Math.abs(p.x) + Math.abs(p.z) - (fl.d - PR * Math.SQRT2)) / 2;
      if (over > 0) {
        p.x -= sx * over;
        p.z -= sz * over;
        const vn = (r.vx * sx + r.vz * sz) / Math.SQRT2;
        if (vn > 0) ((r.vx -= (vn * sx) / Math.SQRT2), (r.vz -= (vn * sz) / Math.SQRT2));
      }
    }
    a.physics(dt, this.floorAt(p.x, p.z));
    // the pad underfoot: stepping on one is a move (not while knocked, staggered or hopping)
    const live = this.ph === "run" && !this.over && r.stun <= 0 && r.knock <= 0 && r.hop <= 0;
    const on = this.padUnder(r, dt, live);
    if (on !== r.on) {
      r.on = on;
      if (on >= 0) {
        this.pads[on].press = Math.max(this.pads[on].press, 0.6);
        if (live) this.enter(i, on);
      }
    }
    // the winner's hops at the end, the signer's at its block
    if ((this.over && i === this.over[0]) || (this.ph === "end" && i === this.signer)) {
      r.jumpAt -= dt;
      if (r.jumpAt <= 0 && a.grounded) ((r.jumpAt = 0.7), a.jump(8.5));
    }
    const sp = Math.hypot(r.vx, r.vz);
    if (r.stun > 0 || r.knock > 0) {
      a.yaw += r.spin * dt;
      r.spin *= Math.exp(-3 * dt);
    } else if (r.wind > 0 || r.lunge > 0) a.face(yawOf(r.sx, r.sz), dt, 30);
    else if (sp > 0.6) a.face(yawOf(r.vx, r.vz), dt, 15);
    else if (this.ph === "end" || this.ph === "tally" || this.over) a.face(yawOf(-p.x * 0.3, this.cam.eye.z - p.z) - this.theta, dt, 4);
    a.legs = r.stun > 0 || r.knock > 0 ? 0 : null;
    r.angryT -= dt;
    a.angry = r.angryT > 0;
    const lean = r.wind > 0 ? -0.35 : r.lunge > 0 ? 0.6 : r.knock > 0 ? -0.4 : 0;
    r.lean += (lean - r.lean) * Math.min(1, 20 * dt);
    a.body.root.rotation.x = r.lean;
    r.sq = Math.max(0, r.sq - dt * 5);
    const q = Math.sin(r.sq * Math.PI) * 0.14;
    a.body.root.scale.set(SCALE * (1 + q), SCALE * (1 - q * 0.8), SCALE * (1 + q));
    a.sync(dt);
  }

  // ---- the look ----------------------------------------------------------------------------------

  /** The pads, the stamps, the beads, the arrows, the chain, the bytes: matrices and colours. */
  private animate(dt: number) {
    const t = this.clk;
    // the pads
    let beamPad = -1,
      beamK = 0;
    for (let i = 0; i < NP; i++) {
      const p = this.pads[i];
      let pressed = false;
      for (const r of this.run) if (r.on === i) pressed = true;
      p.press += ((pressed ? 0.6 : 0) - p.press) * Math.min(1, dt * 12);
      p.red = Math.max(0, p.red - dt * 2.4);
      p.flash = Math.max(0, p.flash - dt * 3);
      p.y = PAD_Y + p.lit * 0.38 + p.arc - p.press * 0.07;
      this.m4.compose(this.v.set(p.x, p.y - 0.45, p.z), this.q.identity(), this.sc.set(PAD, 0.9, PAD));
      this.body.setMatrixAt(i, this.m4);
      this.m4.compose(this.v.set(p.x, p.y - 0.46, p.z), this.q, this.sc.set(PAD + 0.14, 0.96, PAD + 0.14));
      this.ink.setMatrixAt(i, this.m4);
      p.top.position.set(p.x, p.y + 0.004, p.z);
      // (dimmer at rest, so a lit one sings out; in the dark, only near a lantern or in a flash)
      let lum = 0.86 + p.lit * 0.14;
      if (this.dark > 0 && this.L.dark) {
        const reach = this.L.dark.reach;
        let l = 0.07 + Math.min(1, this.flash * 1.6);
        for (const r of this.run) l = Math.max(l, clamp(1 - (Math.hypot(r.a.pos.x - p.x, r.a.pos.z - p.z) - 1.6) / (reach - 1.6), 0, 1));
        lum *= 1 - this.dark * (1 - Math.min(1, l));
      }
      p.topM.color.setRGB(lum, lum, lum);
      this.m4.compose(this.v.set(p.x, p.y + 0.012, p.z), this.q, this.sc.set(PAD, 1, PAD));
      this.glowI.setMatrixAt(i, this.m4);
      // (a light wash only: the glyph must stay readable while it's lit)
      this.c.copy(this.padCol[i]).multiplyScalar(p.lit * (i === WHITE ? 0.06 : 0.26));
      if (p.flash > 0) ((this.c.r += p.flashC.r * p.flash * 0.45), (this.c.g += p.flashC.g * p.flash * 0.45), (this.c.b += p.flashC.b * p.flash * 0.45));
      if (p.red > 0) ((this.c.r += p.red * 0.75), (this.c.g += p.red * 0.04), (this.c.b += p.red * 0.08));
      this.glowI.setColorAt(i, this.c);
      this.m4.compose(this.v.set(p.x, 0.02, p.z), this.q, this.sc.set(PAD * 2.1, 1, PAD * 2.1));
      this.halo.setMatrixAt(i, this.m4);
      this.m4.compose(this.v.set(p.x, 0.008, p.z), this.q, this.sc.set(PAD + 0.7, 1, PAD + 0.7));
      this.moat.setMatrixAt(i, this.m4);
      this.c.copy(this.padCol[i]).multiplyScalar(p.lit * 0.9);
      if (p.red > 0) this.c.setRGB(p.red * 0.9, 0.05, 0.1);
      else if (p.flash > p.lit) this.c.copy(p.flashC).multiplyScalar(p.flash * 0.7);
      this.halo.setColorAt(i, this.c);
      if (p.lit > beamK) ((beamK = p.lit), (beamPad = i));
    }
    for (const m of [this.body, this.ink, this.glowI, this.halo, this.moat]) m.instanceMatrix.needsUpdate = true;
    this.glowI.instanceColor!.needsUpdate = true;
    this.halo.instanceColor!.needsUpdate = true;
    // the reveal's beam of light over the lit pad
    this.beam.visible = beamK > 0.02;
    if (beamPad >= 0) {
      const p = this.pads[beamPad];
      this.beam.position.set(p.x, p.y + 7, p.z);
      this.beam.scale.set(PAD * (0.85 + 0.1 * beamK), 14, PAD * (0.85 + 0.1 * beamK));
      this.beamM.color.copy(this.padCol[beamPad]);
      this.beamM.opacity = beamK * 0.55;
    }
    // the stamps: a splat per seat in its own corner of each pad
    for (let i = 0; i < 4; i++) {
      const r = this.run[i];
      const ox = i % 2 ? 1 : -1,
        oz = i < 2 ? -1 : 1;
      for (let p = 0; p < NP; p++) {
        let on = false;
        if (this.ph !== "intro" || this.pt < 0.3) for (let k = 0; k < r.step; k++) if (this.seq[k] === p) on = true;
        r.stamp[p] += ((on ? 1 : 0) - r.stamp[p]) * Math.min(1, dt * (on ? 16 : 8));
        r.kick[p] = Math.max(0, r.kick[p] - dt * 4);
        const pd = this.pads[p];
        const s = r.stamp[p] < 0.01 ? 0 : r.stamp[p] * (1 + Math.sin(r.kick[p] * Math.PI) * 0.6) * 1.0;
        this.m4.compose(this.v.set(pd.x + ox * 0.98, pd.y + 0.02, pd.z + oz * 0.98), this.q.setFromAxisAngle(this.v2.set(0, 1, 0), i * 1.7 + p), this.sc.set(s, 1, s));
        this.stamps.setMatrixAt(p * 4 + i, this.m4);
      }
    }
    this.stamps.instanceMatrix.needsUpdate = true;
    // the beads over the heads
    const showBeads = this.phase === "play" && (this.ph === "run" || this.ph === "end" || this.ph === "show" || this.ph === "intro") && !this.over;
    for (let i = 0; i < 4; i++) {
      const r = this.run[i],
        a = r.a;
      for (let k = 0; k < MAXLEN; k++) {
        const idx = i * MAXLEN + k;
        let s = 0;
        if (showBeads && k < this.len) {
          const lit = k < r.step;
          r.beadPop[k] = r.beadPop[k] > 0 ? Math.max(0, r.beadPop[k] - dt * 3.5) : Math.min(0, r.beadPop[k] + dt * 3);
          const pop = r.beadPop[k];
          s = (lit ? 0.34 : 0.24) * (1 + Math.max(0, Math.sin(pop * Math.PI)) * 0.7);
          if (pop < 0) s *= 1 + Math.sin(-pop * Math.PI) * 0.5;
          this.beads.setColorAt(idx, lit ? this.seatCol[i] : pop < -0.05 ? this.red : this.beadOff);
        }
        const x = a.pos.x + (k - (this.len - 1) / 2) * 0.4;
        const y = a.pos.y + BEAD_Y + (k < r.step ? Math.sin(t * 6 + k) * 0.03 : 0);
        this.m4.compose(this.v.set(x, y, a.pos.z), this.q.identity(), this.sc.set(s, s, s));
        this.beads.setMatrixAt(idx, this.m4);
        this.m4.compose(this.v, this.q, this.sc.set(s + 0.07, s + 0.07, s + 0.07));
        this.beadInk.setMatrixAt(idx, this.m4);
      }
    }
    this.beads.instanceMatrix.needsUpdate = true;
    this.beads.instanceColor!.needsUpdate = true;
    this.beadInk.instanceMatrix.needsUpdate = true;
    // the shoves' floor arrows
    for (const r of this.run) {
      const on = r.wind > 0 || r.lunge > 0;
      r.arrow.visible = on;
      if (!on) continue;
      const k = r.wind > 0 ? 1 - r.wind / WIND : 1;
      r.arrow.position.set(r.a.pos.x, (r.a.floor ?? 0) + 0.05, r.a.pos.z);
      r.arrow.rotation.y = yawOf(r.sx, r.sz);
      r.arrow.scale.set(0.8 + 0.2 * k, 1, 0.6 + 0.4 * k);
      r.arrowM.opacity = 0.45 + 0.45 * k;
    }
    // the chain: the signed blocks drift to their places
    for (const cb of this.chain) {
      if (!cb.on) continue;
      cb.t += dt;
      const to = CHAIN[Math.min(cb.slot, CHAIN.length - 1)];
      // (it pops out of the block, then flies to its place)
      if (cb.t > 0 || cb.slot > 0) cb.m.position.lerp(to, 1 - Math.exp(-5 * dt));
      cb.m.position.y += Math.sin(t * 1.6 + cb.slot) * 0.004;
      const s = 2.0 * Math.min(1, 0.3 + Math.max(0, cb.t + 0.75) * 1.2);
      cb.m.scale.setScalar(s);
      cb.m.rotation.y = Math.sin(t * 0.7 + cb.slot) * 0.25;
    }
    for (let k = 0; k < 4; k++) this.links[k].visible = this.chainOf.length > k;
    // the bytes rising round the block, the Q-Blocks turning (the lilac plaza's)
    const B = this.byteP;
    if (this.bytes) {
      for (let k = 0; k < this.bytes.count; k++) {
        B[k * 5 + 1] += B[k * 5 + 3] * dt;
        if (B[k * 5 + 1] > 16) B[k * 5 + 1] = -1;
        const s = B[k * 5 + 4];
        this.m4.compose(this.v.set(B[k * 5] + Math.sin(t * 0.8 + k) * 0.3, B[k * 5 + 1], B[k * 5 + 2]), this.q.identity(), this.sc.set(s, s, s));
        this.bytes.setMatrixAt(k, this.m4);
      }
      this.bytes.instanceMatrix.needsUpdate = true;
    }
    for (let k = 0; k < this.qbs.length; k++) {
      const qb = this.qbs[k];
      qb.rotation.y = t * (0.9 + k * 0.3);
      qb.position.y = (k ? 11.4 : 12) + Math.sin(t * 1.4 + k * 2) * 0.35;
    }
    for (const b of this.life) b.tick(t);
    this.far?.tick(t);
    // the level's own set (snow, rain, bulbs), the lanterns' pools
    this.live?.tick(dt, { t, spin: this.omega, warn: this.warn, dark: this.dark, flash: this.flash, rumble: this.rumble, run: this.ph === "run" && !this.over });
    if (this.pools) {
      const reach = this.L.dark?.reach ?? 4;
      for (let i = 0; i < 4; i++) {
        const a = this.run[i].a;
        this.m4.compose(this.v.set(a.pos.x, (a.floor ?? 0) + 0.03, a.pos.z), this.q.identity(), this.sc.set(reach * 2.1, 1, reach * 2.1));
        this.pools.setMatrixAt(i, this.m4);
        this.c.set("#ffc878").multiplyScalar(this.dark * 0.26);
        this.pools.setColorAt(i, this.c);
      }
      this.pools.instanceMatrix.needsUpdate = true;
      if (this.pools.instanceColor) this.pools.instanceColor.needsUpdate = true;
    }
    // (the block hides while they run: it rises out of sight, and comes down for the next one)
    const up = this.phase === "play" && this.ph === "run" && !this.over ? 6 : 0;
    this.lift += (up - this.lift) * (1 - Math.exp(-(up ? 2.2 : 4) * dt));
    this.blockG.position.y = BLOCK.y + this.lift + Math.sin(t * 1.1) * 0.12;
    this.fx.update(dt);
  }

  /** The play cameras: wide (the block and the whole floor: the reveal), or close on the floor (the run). */
  private playCam(dt: number, wide: boolean) {
    const h = this.run.find((r) => r.p.human);
    const hx = h ? clamp(this.wv(this.v2.copy(h.a.pos)).x, -6, 6) : 0;
    const L = this.L;
    if (wide) {
      this.eye.fromArray(L.wide.eye);
      this.at.fromArray(L.wide.at);
    } else {
      this.eye.set(hx * 0.12, L.run.y, L.run.z);
      this.at.set(hx * 0.1, 0.5, 0.5);
    }
    this.cam.to(this.eye, this.at, dt, wide ? 2.6 : 3.2);
    this.lens(wide ? L.wide.fov : L.run.fov, dt);
  }

  private lens(fov: number, dt: number) {
    const c = this.w.camera;
    const f = c.fov + (fov - c.fov) * (1 - Math.exp(-3 * dt));
    if (Math.abs(f - c.fov) > 0.01) ((c.fov = f), c.updateProjectionMatrix());
  }

  private camera(dt: number) {
    if (this.over) {
      const p = this.wv(this.v2.copy(this.run[this.over[0]].a.pos));
      this.eye.set(p.x * 0.8, p.y + 6.4, p.z + 8.8);
      this.at.set(p.x * 0.9, p.y + 2.4, p.z - 2);
      this.cam.to(this.eye, this.at, dt, 3, 4.5);
    } else if (this.ph === "end" && this.signer >= 0 && this.pt < 0.95) {
      const p = this.wv(this.v2.copy(this.run[this.signer].a.pos));
      this.eye.set(p.x * 0.55, 12.5, p.z + 13);
      this.at.set(p.x * 0.7, 2.2, p.z - 3.5);
      this.cam.to(this.eye, this.at, dt, 2.4);
    } else this.playCam(dt, this.ph !== "run");
    this.cam.apply(dt);
  }

  view() {
    return this.w;
  }

  // ---- the HUD -----------------------------------------------------------------------------------

  private say(s: string, c: string, dur: number, size: number, y = H * 0.32, delay = 0) {
    this.banners.push({ s, t: this.clk + delay, dur, c, size, y });
  }

  draw(g: CanvasRenderingContext2D) {
    if (this.phase === "card") return;
    const cam = this.w.camera;
    // the lightning's white
    if (this.flash > 0.02 && this.dark > 0) {
      g.fillStyle = `rgba(235,225,255,${Math.min(0.55, this.flash * 0.6)})`;
      g.fillRect(0, 0, W, H);
    }
    if (this.hurt > 0) {
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, `rgba(255,40,60,${0.42 * this.hurt})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
    // the tags (the beads are 3D, under them), the hesitations, your B
    for (const r of this.run) {
      const s = toScreen(this.wv(r.a.head(this.v).setY(r.a.pos.y + TAG_Y)), cam);
      if (!s.on) continue;
      tag(g, r.p, s.x, s.y);
      if (r.p.human && this.ph === "run" && !this.over) this.bPip(g, r, s.x, s.y);
      if (!r.p.human && this.ph === "run" && (r.ai.think > 0.3 || r.ai.react > 0.45)) this.thinking(g, s.x + 26, s.y - 22);
    }
    // the floating words over the heads
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      const k = (this.clk - p.t) / 1.0;
      if (k >= 1) {
        this.pops.splice(i, 1);
        continue;
      }
      const s = toScreen(this.wv(this.run[p.seat].a.head(this.v).setY(this.run[p.seat].a.pos.y + TAG_Y)), cam);
      const sc = backOut(Math.min(1, k * 4));
      g.globalAlpha = k > 0.65 ? (1 - k) / 0.35 : 1;
      shout(g, p.s, s.x, s.y - 30 - k * 36, (p.big ? 30 : 20) * sc, p.c);
      g.globalAlpha = 1;
    }
    this.panels(g);
    this.title(g);
    if (!this.over && (this.ph === "run" || this.ph === "end")) this.strip(g);
    if (this.ph === "show") {
      const k = (Math.sin(this.clk * 8) + 1) / 2;
      g.save();
      g.globalAlpha = 0.8 + 0.2 * k;
      shout(g, T("WATCH THE BLOCK!", "看好区块！"), W / 2, H - 22, 20, "#ffffff");
      g.restore();
    }
    if (this.ph === "tally" && !this.over) this.board(g);
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

  /** The corners: the total; under the name, this block's beads. */
  private panels(g: CanvasRenderingContext2D) {
    let lead = 0;
    for (const v of this.totals) lead = Math.max(lead, v);
    const leads: number[] = [];
    if (lead > 0) for (let i = 0; i < 4; i++) if (this.totals[i] === lead) leads.push(i);
    corners(
      g,
      this.players,
      this.totals.map((v) => String(v)),
      { lead: leads },
    );
    const beads = this.ph === "run" || this.ph === "end" || this.ph === "show";
    for (let i = 0; i < 4; i++) {
      const [x, y] = cornerSpot(i);
      const r = this.run[i];
      if (beads)
        for (let k = 0; k < this.len; k++) {
          const lit = k < r.step;
          const bx = x + 66 + k * 13,
            by = y + 41;
          g.beginPath();
          g.arc(bx, by, lit ? 5.2 : 4.2, 0, Math.PI * 2);
          g.fillStyle = lit ? r.p.color : "rgba(255,255,255,0.14)";
          g.fill();
          g.lineWidth = 1.5;
          g.strokeStyle = lit ? "#ffffff" : "rgba(255,255,255,0.32)";
          g.stroke();
        }
      else if (this.ri >= 0) text(g, T(`${this.signs[i]} proven`, `证明 ${this.signs[i]}`), x + 60, y + 41, 11, "rgba(255,255,255,0.7)", "left", 700);
      if (this.bump[i] > 0) {
        g.save();
        g.globalAlpha = this.bump[i] * 0.8;
        rr(g, x - 2, y - 2, 200, 62, 19);
        g.lineWidth = 3;
        g.strokeStyle = "#ffe680";
        g.stroke();
        g.restore();
      }
    }
  }

  /** The block's title over the top: BLOCK 2/4 · ORCHARD · 4 SIGILS, and the time left to prove it. */
  private title(g: CanvasRenderingContext2D) {
    if (this.ri < 0) return;
    const s = `${T("BLOCK", "区块")} ${this.ri + 1}/${ROUNDS.length}  ·  ${this.rd.lvl}  ·  ${T(`${this.len} SIGILS`, `${this.len} 个印记`)}`;
    g.font = `900 15px ${FONT}`;
    const w = g.measureText(s).width + 40;
    const x = W / 2 - w / 2,
      y = 16;
    rr(g, x, y + 3, w, 30, 15);
    g.fillStyle = "rgba(6,3,18,0.4)";
    g.fill();
    rr(g, x, y, w, 30, 15);
    g.fillStyle = "rgba(24,16,60,0.9)";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = LILAC;
    g.stroke();
    text(g, s, W / 2, y + 15.5, 15, "#ffffff", "center", 900);
    // under it: what's happening, or the time left
    const y2 = y + 46;
    if (this.ph === "run" && !this.over) {
      const cap = capOf(this.len);
      const left = Math.max(0, cap - this.rt);
      const bw = 200;
      rr(g, W / 2 - bw / 2 - 3, y2 - 7, bw + 6, 14, 7);
      g.fillStyle = INK;
      g.fill();
      const f = left / cap;
      rr(g, W / 2 - bw / 2, y2 - 4, Math.max(8, bw * f), 8, 4);
      g.fillStyle = left <= 3 ? "#ff3d5a" : left <= 6 ? "#ffb02e" : LILAC;
      g.fill();
      numeral(g, String(Math.ceil(left)), W / 2 + bw / 2 + 12, y2 + 1, 17, left <= 3 ? "#ff8a96" : "#ffffff", "left");
      if (this.hint > 0.02) {
        rr(g, W / 2 - bw / 2 - 64, y2 - 11, 54, 22, 11);
        g.globalAlpha = Math.min(1, this.hint * 3);
        g.fillStyle = LILAC;
        g.fill();
        text(g, T("HINT", "提示"), W / 2 - bw / 2 - 37, y2 + 1, 12, INK, "center", 900);
        g.globalAlpha = 1;
      }
    }
  }

  /** Your proof along the bottom: the sigils you've stamped, the next one to find, the hint coming in. */
  private strip(g: CanvasRenderingContext2D) {
    const hi = this.run.findIndex((r) => r.p.human);
    if (hi < 0 || this.ri < 0) return;
    const r = this.run[hi];
    const s = 46,
      gap = 8;
    const tw = this.len * s + (this.len - 1) * gap;
    const x0 = W / 2 - tw / 2,
      y0 = H - 66;
    rr(g, x0 - 14, y0 - 24, tw + 28, s + 36, 16);
    g.fillStyle = "rgba(14,9,36,0.82)";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = this.ph === "run" ? tint(r.p.color, 0.1) : "rgba(196,177,252,0.5)";
    g.stroke();
    text(g, T("YOUR PROOF", "你的证明"), W / 2, y0 - 12, 11, "rgba(255,255,255,0.75)", "center", 900);
    for (let k = 0; k < this.len; k++) {
      const x = x0 + k * (s + gap);
      const p = this.seq[k];
      const tile = this.pads[p].tile;
      if (this.ph === "show") {
        if (k === this.showIdx) {
          const pop = backOut(clamp((this.pt - 0.3 - k * this.rd.step) / 0.18, 0, 1));
          const ss = s * (0.6 + 0.5 * pop);
          rr(g, x + s / 2 - ss / 2 - 3, y0 + s / 2 - ss / 2 - 3, ss + 6, ss + 6, 12);
          g.fillStyle = "#ffffff";
          g.fill();
          g.drawImage(tile, x + s / 2 - ss / 2, y0 + s / 2 - ss / 2, ss, ss);
        } else g.drawImage(this.unknown, x, y0, s, s);
      } else if (this.ph === "run") {
        if (k < r.step) {
          g.drawImage(tile, x, y0, s, s);
          g.beginPath();
          g.arc(x + s - 4, y0 + 5, 8, 0, Math.PI * 2);
          g.fillStyle = r.p.color;
          g.fill();
          g.lineWidth = 2;
          g.strokeStyle = "#ffffff";
          g.stroke();
          text(g, "✓", x + s - 4, y0 + 6, 10, "#ffffff", "center", 900);
        } else {
          const next = k === r.step;
          const pulse = next ? 1 + Math.sin(this.clk * 7) * 0.05 : 1;
          const ss = s * pulse;
          g.globalAlpha = next ? 1 : 0.7;
          g.drawImage(this.unknown, x + s / 2 - ss / 2, y0 + s / 2 - ss / 2, ss, ss);
          if (this.hint > 0) {
            g.globalAlpha = this.hint * 0.8 * (next ? 1 : 0.8);
            g.drawImage(tile, x + s / 2 - ss / 2, y0 + s / 2 - ss / 2, ss, ss);
          }
          g.globalAlpha = 1;
          if (next) {
            rr(g, x - 3, y0 - 3, s + 6, s + 6, 10);
            g.lineWidth = 2.5;
            g.strokeStyle = r.stun > 0 ? "#ff3d5a" : "#ffffff";
            g.stroke();
          }
        }
      } else if (this.ph === "end") g.drawImage(tile, x, y0, s, s);
      else g.drawImage(this.unknown, x, y0, s, s);
    }
  }

  /** The final tally: the four, best first, each block's points. */
  private board(g: CanvasRenderingContext2D) {
    const order = rankBy(this.totals, this.tie());
    const bw = 440,
      rh = 50;
    const x0 = W / 2 - bw / 2,
      y0 = 178;
    order.forEach((seat, k) => {
      const t = clamp((this.pt - 0.25 - k * 0.14) / 0.3, 0, 1);
      if (t <= 0) return;
      const p = this.players[seat];
      const y = y0 + k * (rh + 8);
      g.save();
      g.globalAlpha = t;
      g.translate((1 - backOut(t)) * -60, 0);
      rr(g, x0, y, bw, rh, 16);
      g.fillStyle = k === 0 ? "rgba(48,32,110,0.94)" : "rgba(18,12,44,0.9)";
      g.fill();
      g.lineWidth = k === 0 ? 3 : 2;
      g.strokeStyle = k === 0 ? "#ffe680" : tint(p.color, -0.1);
      g.stroke();
      badge(g, p, x0 + 30, y + rh / 2, 36);
      text(g, short(p), x0 + 58, y + rh / 2, 16, tint(p.color, 0.3), "left", 900);
      // each block's points (signed ones in a seal)
      for (let b = 0; b < this.perRound[seat].length; b++) {
        const bx = x0 + 178 + b * 46,
          by = y + rh / 2;
        const signed = this.stats.rounds[b]?.signer === seat;
        rr(g, bx - 18, by - 13, 36, 26, 8);
        g.fillStyle = signed ? p.color : "rgba(255,255,255,0.1)";
        g.fill();
        text(g, String(this.perRound[seat][b]), bx, by + 1, 14, signed ? INK : "rgba(255,255,255,0.8)", "center", 900);
      }
      numeral(g, String(this.totals[seat]), x0 + bw - 18, y + rh / 2, 28, "#ffffff");
      g.restore();
    });
  }

  /** Your B beside your tag: filling while the shove comes back, lit once it is ready. */
  private bPip(g: CanvasRenderingContext2D, r: Run, x: number, y: number) {
    g.font = `900 14px ${FONT}`;
    const px = x + (g.measureText(short(r.p)).width + 22) / 2 + 16;
    const ready = r.cd <= 0 && r.wind <= 0 && r.lunge <= 0;
    const rad = 11 + r.ready * 5;
    g.beginPath();
    g.arc(px, y, rad, 0, Math.PI * 2);
    g.fillStyle = "rgba(14,10,30,0.82)";
    g.fill();
    g.beginPath();
    if (ready) g.arc(px, y, rad - 2.5, 0, Math.PI * 2);
    else {
      g.moveTo(px, y);
      g.arc(px, y, rad - 2.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(1 - r.cd / SHOVE_CD, 0, 1));
      g.closePath();
    }
    g.fillStyle = ready ? "#3ec6ff" : "rgba(255,255,255,0.26)";
    g.fill();
    g.beginPath();
    g.arc(px, y, rad, 0, Math.PI * 2);
    g.lineWidth = 2;
    g.strokeStyle = ready ? "#ffffff" : "rgba(255,255,255,0.3)";
    g.stroke();
    // (a touch screen's button shows the shove, not a letter: the same here)
    const act = touchy() ? actsOf("sign").b : undefined;
    if (act) actIcon(g, act, px, y, 15 + r.ready * 5, ready ? "#ffffff" : "rgba(255,255,255,0.55)");
    else text(g, "B", px, y + 1, 12 + r.ready * 4, ready ? "#ffffff" : "rgba(255,255,255,0.55)", "center", 900);
  }

  /** A rival thinking: a little "?" bubble. */
  private thinking(g: CanvasRenderingContext2D, x: number, y: number) {
    const b = Math.sin(this.clk * 9) * 2;
    g.beginPath();
    g.arc(x, y + b, 11, 0, Math.PI * 2);
    g.fillStyle = "#ffffff";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = INK;
    g.stroke();
    g.beginPath();
    g.arc(x - 8, y + 12 + b, 3, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    text(g, "?", x, y + 1 + b, 15, INK, "center", 900);
  }

  result() {
    return this.over;
  }

  dispose() {
    music.stop();
    for (const r of this.run) r.a.dispose();
    for (const p of this.pads) p.topM.map?.dispose();
    this.scrTex.dispose();
    disposeScene(this.w.scene);
    if (location.search.includes("signbot")) delete (window as unknown as { __sign?: unknown }).__sign;
  }
}

export const SIGN: MiniDef = {
  key: "sign",
  title: "PROVE THE BLOCK",
  titleZh: "证明区块",
  tag: "Remember the proof. Race across the sigils. Prove it first!",
  tagZh: "记住证明，踩遍印记，抢先证明区块！",
  help: "Watch the block light its sigils, then step on the pads in that order. A wrong pad starts you over. B shoves a rival: they drop a bead. First to finish proves the block.",
  helpZh: "看区块依次点亮印记，然后按顺序踩上对应的格子。踩错就从头再来。B 键推开对手：他会掉一颗珠。最先完成者证明区块。",
  pad: ["left", "right", "up", "down", "b"],
  tap: false,
  color: LILAC,
  song: "tense",
  ambience: "city-day",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `sign-${l.key}`, song: l.song, ambience: l.ambience })),
  make: (players, rnd, variant) => new Sign(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};
export default SIGN;
