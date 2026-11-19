/**
 * HASH BEAT (哈希节拍): ZK PARTY's rhythm dance-off. Four zkSNARKs on four glowing dance pads, a
 * crowd, the lights, and a song of the level's own: the arrows are made from its tune (the low notes
 * ▼, then ◀, ▶, the high notes ▲, a piano's left to right), so every arrow falls on a real note of
 * the music. Three levels (the songs: beat-levels/tunes.ts):
 * - HASH ROUNDS: the Equihash club on a rooftop in IRONWOOD, ZStreet's nightlife quarter (A minor, 128): the LED
 *   floor, the lasers, the classic chart.
 * - MARINA DECK: a rooftop pool over Marina Bay while the sun sets (B minor tropical house, 116):
 *   the pads float on the pool round the DJ's island. Its long notes are HOLDS, neon trails: keep the
 *   key down to the tail for a bonus; let go early and the combo drops.
 * - WINTER FEST: Central Park in the snow, a round ice stage of two tiers under the bandstand's crown
 *   (E minor gallop, 140). WHITEOUT squalls (marked on the song's bar, announced a bar ahead as the
 *   frost creeps down) hide the top of the lane: the arrows show late.
 *
 * Everyone dances the same chart. The visitor reads it on the lane in the middle: arrows fall to the
 * line, the arrow key on the line scores (PERFECT, GREAT, GOOD); a wrong step or none is a MISS and a
 * stumble. A "HASH!" bar is the A button. The combo raises the multiplier (×2 at 10, ×3 at 20) and
 * the dance gets wilder with it. Each 20 in a row fires a SABOTAGE (once a round) at the best-scoring
 * rival: their next four arrows are scrambled into "?" blocks that show their arrow only late. The
 * best live combo from 30 on holds HASH FEVER: ×4, the spotlight and the crowd, until a miss or a
 * longer streak takes it.
 *
 * The song goes in three rounds, like the hash's sponge: ROUND 1 ABSORB (the verse, on the beat),
 * ROUND 2 PERMUTE (the chorus, off-beats), then the FINAL HASH (squeeze: double time). Then a tally;
 * the most points wins (ties: the best combo, then the PERFECTs).
 *
 * The clock is the audio's: music.ts's beat clock as heard now (music.beat(): its t0 and its now), so
 * the arrows, the judging and the music agree; a key is judged at its own event time, not at the
 * frame's. Silent (the sound off, the audio blocked, no beat) the same chart runs on the wall clock,
 * and if the sound comes back the song restarts at the right step. A visitor's steady lag is learnt
 * (auto-calibration).
 * The song is one stage played once (music.ts `once`), and the game never calls music.rate() or
 * music.stage(): the tempo and the bars are the chart's.
 *
 * The AIs (by skill): a hit chance and a timing jitter; weak ones fall into slumps (a miss makes the
 * next likelier), strong ones rarely miss but are never perfect.
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { FONT, H, HUD, W, backOut, clamp, easeOut, rankBy, rng, rr, sfx, sound, text, type Btn, type Input, type IntroShot, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { Avatar, CamRig, Fx3, GEO, banner, block, canvasTex, clock, corners, disposeScene, glow, outline, short, skyDome, skyline, tag, toScreen, toon, toonSteps, world } from "../k3";
import { INK, badge, crown, numeral, tint, touchy, toy } from "../hud";
import { actWord } from "../acts";
import { music, type Part, type Patch, type Song } from "../music";
import { ASTANA_TUNE, MARINA_TUNE, ROUNDS_TUNE, type Tune } from "./beat-levels/tunes";
import { markGlow } from "../post";
import { drawMark } from "../theme";
import type { AmbienceKind } from "../../audio/kinds";

/** A light (an LED, a bulb, a neon tube, lit windows): `w` of its colour feeds the stage's bloom (post.ts). */
const lit = <M extends THREE.Material>(m: M, w = 1) => markGlow(m, w);

// ---- the song ------------------------------------------------------------------------------------

/** The song's parts: intro, ROUND 1, ROUND 2, the break, the FINAL HASH, the last hit, the outro's silence. */
const S_INTRO = 0;
const S_VERSE = 1;
const S_CHORUS = 2;
const S_BREAK = 3;
const S_FINAL = 4;
const S_END = 5;

/** A level's song in time: its beat, a sixteenth, a bar (s), each part's first bar and length, its last hit. */
interface Clock {
  beat: number;
  step: number;
  bar: number;
  at: number[];
  bars: number[];
  nbars: number;
  /** When the tally comes (s): the last hit, rung out. */
  end: number;
}
function clockOf(t: Tune): Clock {
  const beat = 60 / t.bpm;
  const at: number[] = [];
  let n = 0;
  for (const b of t.bars) (at.push(n), (n += b));
  return { beat, step: beat / 4, bar: beat * 4, at, bars: t.bars, nbars: n, end: at[S_END] * beat * 4 + 0.9 };
}
/** The part a bar is in. */
function partIn(k: Clock, bar: number) {
  let p = 0;
  while (p + 1 < k.at.length && bar >= k.at[p + 1]) p++;
  return p;
}

const P = (s: string) => {
  const a = s
    .trim()
    .split(/\s+/)
    .map((t) => (t === "." ? 0 : t === "-" ? -1 : Number(t)));
  if (a.length !== 16) throw new Error(`HASH BEAT: a bar of the tune has ${a.length} steps`);
  return a;
};
/** The third under a note of the tune, in the key (under a leading note outside it, the fourth under). */
const thirdIn = (scale: Set<number>, m: number) => (!scale.has(m % 12) ? m - 4 : scale.has((m - 3) % 12) ? m - 3 : m - 4);

/** The song's lines: notes (MIDI a sixteenth: 0 a rest, −1 held) or a drum line, and how it plays. */
interface Line {
  i?: Patch;
  m?: number[];
  p?: string;
  v?: number;
  o?: number;
}
interface Composed {
  lines: Line[];
  lead: number[];
  hash: Set<number>;
}

/**
 * The whole song, a sixteenth a step, played straight through once (one stage, so the player never
 * jumps back to its top), and its tune and HASH steps for the chart.
 */
function compose(t: Tune, k: Clock): Composed {
  const N = k.nbars * 16;
  const z = () => new Array<number>(N).fill(0);
  const lead = z();
  const verse = z();
  const hook = z();
  const shine = z();
  const harm = z();
  const arp = z();
  const bass = z();
  const pads = [z(), z(), z()];
  const strings = [z(), z(), z()];
  const stab = [z(), z()];
  const kick: string[] = [];
  const snare: string[] = [];
  const hats: string[] = [];
  const perc: string[] = [];
  const crash = new Array<string>(N).fill(".");
  const hash = new Set<number>();
  const scale = new Set(t.scale);
  for (const [b, s] of t.hash) hash.add(b * 16 + s);
  const held = (arr: number[], at: number, m: number, len: number) => {
    arr[at] = m;
    for (let i = 1; i < len; i++) arr[at + i] = -1;
  };
  for (let bar = 0; bar < k.nbars; bar++) {
    const part = partIn(k, bar);
    const ch = t.chords[bar] ?? "";
    const at = bar * 16;
    const tune = t.lead[bar] ? P(t.lead[bar]) : null;
    if (tune)
      for (let i = 0; i < 16; i++) {
        lead[at + i] = tune[i];
        // the verse on its own voice, the chorus and the finale on the lead (a shine an octave over it at the end)
        (part === S_VERSE ? verse : hook)[at + i] = tune[i];
        if (part >= S_FINAL) shine[at + i] = tune[i];
        if (part === S_CHORUS || part >= S_FINAL) harm[at + i] = tune[i] > 0 ? thirdIn(scale, tune[i]) : tune[i] < 0 ? -1 : 0;
      }
    // the bass
    const r = t.root[ch] ?? 0;
    const bp = part === S_INTRO ? (bar === 0 ? "................" : "r.r.r.r.r.r.r.r.") : t.bass[part];
    for (let i = 0; i < 16; i++) {
      const c = bp[i];
      bass[at + i] = !r ? 0 : c === "r" ? r : c === "o" ? r + 12 : c === "-" ? -1 : 0;
    }
    // the chords held: pads under the intro, the verse and the chorus, strings under the finale
    const vo = t.voice[ch];
    if (vo && ((part === S_INTRO && bar === 1) || part === S_VERSE || part === S_CHORUS)) vo.forEach((m, j) => held(pads[j], at, m, 16));
    if (vo && (part === S_FINAL || part === S_END)) vo.forEach((m, j) => held(strings[j], at, m + 12, part === S_END ? 12 : 16));
    // arpeggios: rising into the verse, a sixteenth climb through the break
    if (part === S_INTRO && bar === 1) t.introArp.forEach((m, i) => (arp[at + i * 2] = m));
    if (part === S_BREAK) t.breakArp.forEach((m, i) => (arp[at + i] = m));
    // the drums
    kick.push(t.kick[part]);
    snare.push(bar === k.at[S_BREAK] - 1 ? t.fill : t.snare[part]);
    hats.push(part === S_INTRO && bar === 0 ? "................" : t.hats[part]);
    if (t.perc) perc.push(t.perc[part]);
  }
  // a crash on each round's first beat, and on every HASH! with a stab of the chord
  for (const b of [k.at[S_VERSE], k.at[S_CHORUS], k.at[S_FINAL]]) crash[b * 16] = "Y";
  for (const s of hash) {
    crash[s] = "Y";
    const r = t.root[t.chords[s >> 4]] ?? 45;
    held(stab[0], s, r + 24, 3);
    held(stab[1], s, r + 31, 3);
  }
  const I = t.inst;
  const v = t.vol ?? {};
  const lines: Line[] = [
    { i: I.verse, m: verse, v: v.verse ?? 1 },
    { i: I.hook, m: hook, v: v.hook ?? 0.85 },
    { i: I.shine, m: shine, v: v.shine ?? 0.28, o: 1 },
    { i: I.harm, m: harm, v: v.harm ?? 0.42 },
    { i: I.arp, m: arp, v: v.arp ?? 0.6 },
    ...pads.map((m) => ({ i: I.pad, m, v: v.pad ?? 0.32 })),
    ...strings.map((m) => ({ i: I.strings, m, v: v.strings ?? 0.26 })),
    { i: I.bass, m: bass, v: v.bass ?? 0.95 },
    ...stab.map((m) => ({ i: I.stab, m, v: v.stab ?? 0.55 })),
    { p: kick.join("") },
    { p: snare.join("") },
    { p: hats.join(""), v: v.hats ?? 0.75 },
    ...(t.perc ? [{ p: perc.join(""), v: v.perc ?? 0.5 }] : []),
    { p: crash.join(""), v: 0.8 },
  ];
  return { lines, lead, hash };
}

/** The song from this step on (0: from its top), for music.play(). */
function songFrom(t: Tune, c: Composed, step: number): Song {
  // (padded with rests to whole bars: the player loops a part to the section's length)
  const pad = (16 - (step % 16)) % 16;
  const parts: Part[] = c.lines.map((l) =>
    l.p !== undefined ? { d: "*", p: l.p.slice(step) + ".".repeat(pad), v: l.v } : { i: l.i, m: l.m!.slice(step).concat(new Array<number>(pad).fill(0)), v: l.v, o: l.o },
  );
  const song: Song = { bpm: t.bpm, stages: [{ parts }], once: true, kit: t.kit, duck: t.duck };
  if (t.swing) song.swing = t.swing;
  return song;
}

// ---- the chart -----------------------------------------------------------------------------------

const L = 0;
const D = 1;
const U = 2;
const R = 3;
const HASH = 4;
/** A note's state for a player. */
const PENDING = 0;
const PERFECT = 1;
const GREAT = 2;
const GOOD = 3;
const MISS = 4;
const VOID = 5;
/** The windows (seconds either side of the note), generous but fair. */
const W_PERFECT = 0.05;
const W_GREAT = 0.095;
const W_GOOD = 0.14;
const PTS = [0, 100, 70, 40, 0, 0];
/** A hold: its tail's points (× the multiplier), how early the key may come up, how long a gap in the key is forgiven. */
const PTS_HOLD = 50;
const HOLD_EARLY = 0.12;
const HOLD_GAP = 0.09;
/** A hold's state for a player: none (or not reached), held now, held to its end, dropped. */
const H_ON = 1;
const H_OK = 2;
const H_DROP = 3;
/** WHITEOUT: the share of the lane the frost covers (from the top). */
const FROST = 0.6;
/** Rules in numbers: a sabotage each 20 in a row (once a round), its four arrows, how far ahead they start, how late a "?" shows its arrow; HASH FEVER from 30. */
const SAB_EVERY = 20;
const SAB_N = 4;
const SAB_LEAD = 1.5;
const REVEAL = 0.5;
const FEVER_AT = 30;
/** The AIs decide each note this long before it. */
const HORIZON = 0.7;
/** The tally after the song's last hit. */
const TALLY = 3.4;
/** A pause longer than this (a dialog over the game, a hidden tab): the notes it swallowed count for no one. */
const GAP = 0.6;

interface Chart {
  t: Float64Array;
  dir: Int8Array;
  part: Int8Array;
  /** On the beat (a quarter) or between. */
  on: Uint8Array;
  /** A hold's length (s; 0 a tap). */
  len: Float32Array;
  /** In a WHITEOUT squall. */
  fog: Uint8Array;
  n: number;
}

/** The chart from the tune: the notes on the eighths (the verse's on the beats), their arrows from their pitch; long notes held where the level holds. */
function chartOf(tn: Tune, k: Clock, lead: number[], hash: Set<number>): Chart {
  const steps: number[] = [];
  const parts: number[] = [];
  for (const part of [S_VERSE, S_CHORUS, S_FINAL, S_END]) {
    const from = k.at[part] * 16;
    const to = from + k.bars[part] * 16;
    let last = -99;
    const gap = part === S_VERSE ? 4 : 2;
    for (let s = from; s < to; s++) {
      if (s % 2 || lead[s] <= 0 || s - last < gap) continue;
      if (part === S_VERSE && s % 4 && !hash.has(s)) continue;
      steps.push(s);
      parts.push(part);
      last = s;
    }
  }
  // each part's notes ranked by pitch and cut into four: ▼ the lowest quarter, ◀, ▶, ▲ the highest
  // (a pitch's place is the middle of its own notes' ranks: the same note, the same arrow)
  const cut = new Map<number, Map<number, number>>();
  for (const part of [S_VERSE, S_CHORUS, S_FINAL]) {
    const ps = steps.filter((s, i) => parts[i] === part && !hash.has(s)).map((s) => lead[s]);
    const m = new Map<number, number>();
    for (const p of new Set(ps)) {
      const below = ps.filter((x) => x < p).length;
      const same = ps.filter((x) => x === p).length;
      m.set(p, Math.min(3, Math.floor(((below + same / 2) / ps.length) * 4)));
    }
    cut.set(part, m);
  }
  cut.set(S_END, cut.get(S_FINAL)!);
  const n = steps.length;
  const c: Chart = { t: new Float64Array(n), dir: new Int8Array(n), part: new Int8Array(n), on: new Uint8Array(n), len: new Float32Array(n), fog: new Uint8Array(n), n };
  const ORDER = [D, L, R, U];
  for (let i = 0; i < n; i++) {
    const s = steps[i];
    c.t[i] = s * k.step;
    c.part[i] = parts[i];
    c.on[i] = s % 4 === 0 ? 1 : 0;
    if (hash.has(s)) c.dir[i] = HASH;
    else {
      c.dir[i] = ORDER[cut.get(parts[i])!.get(lead[s]) ?? 1];
      // a long note: held (how long it sounds)
      if (tn.hold) {
        let len = 1;
        while (lead[s + len] === -1) len++;
        if (len >= tn.hold) c.len[i] = len * k.step;
      }
    }
    const bar = s >> 4;
    if (tn.squalls?.some(([a, b]) => bar >= a && bar < b)) c.fog[i] = 1;
  }
  return c;
}

/** A level's song, composed and charted once. */
const BOOK = new Map<Tune, { k: Clock; c: Composed; ch: Chart }>();
function songOf(t: Tune) {
  let b = BOOK.get(t);
  if (!b) {
    const k = clockOf(t);
    const c = compose(t, k);
    b = { k, c, ch: chartOf(t, k, c.lead, c.hash) };
    BOOK.set(t, b);
  }
  return b;
}

// ---- the look ------------------------------------------------------------------------------------

const ACCENT = "#ff6b35";
const LILAC = "#c4b1fc";
const GLACIER = "#7fe3ff";
/** Each part's colour (the lane's rim, the progress bar). */
const PART_C = [GLACIER, GLACIER, LILAC, ACCENT, ACCENT, ACCENT, ACCENT];
/** A judgement's word and colour. */
const J_C = ["", "#7fe3ff", "#9cff6e", LILAC, "#ff3d5a", ""];
const J_EN = ["", "PERFECT", "GREAT", "GOOD", "MISS", ""];
const J_ZH = ["", "完美", "很好", "不错", "失误", ""];
/** The arrows on the beat (flare) and between (lilac); a scrambled one, glacier. */
const NOTE_C = ["#ff7a45", "#b48cff", "#59e6ff"];
/** The lane (960×540 HUD). */
const COL_W = 52;
const LANE_W = COL_W * 4;
const LANE_L = W / 2 - LANE_W / 2;
const TOP_Y = 96;
const HIT_Y = 430;
const NOTE = 44;
const colX = (d: number) => LANE_L + COL_W * (d + 0.5);
const SIZE = 1.25;

/** The arms' poses (right x, z, elbow; left x, z, elbow): ◀ ▼ ▲ ▶ HASH, and 9 a stumble. */
const POSES: (number[] | null)[] = [
  [-0.15, -1.5, -0.08, -0.45, 0.4, -1.55],
  [-0.95, -0.55, -0.2, -0.95, 0.55, -0.2],
  [-2.95, -0.32, -0.08, -2.95, 0.32, -0.08],
  [-0.45, -0.4, -1.55, -0.15, 1.5, -0.08],
  [-2.6, -0.75, -0.3, -2.6, 0.75, -0.3],
  null,
  null,
  null,
  null,
  [-1.25, -1.1, -0.7, 0.35, 0.95, -0.4],
];
const SPEAKER_X = [-11.2, 11.2];
const C_ACCENT = new THREE.Color(ACCENT);
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const C2 = (a: string, b: string) => [new THREE.Color(a), new THREE.Color(b)];

/**
 * A level: its song, its room (built by the game: club, marina or astana), where the pads stand (x, z,
 * the pad's top), the play camera, the card's swing round the room, the floor's and the beams'
 * colours by round, the middle of the floor the moving heads sweep.
 */
interface Level {
  key: string;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  ambience: AmbienceKind;
  tune: Tune;
  sky: [string, string];
  fog: [number, number];
  /** Seat order: you and blue inside, green and pink out on the wings. */
  pads: [number, number, number][];
  eye: THREE.Vector3;
  at: THREE.Vector3;
  orbit: { r: number; h: number; at: THREE.Vector3 };
  floor: THREE.Color[][];
  beam: THREE.Color[][];
  stageZ: number;
}

const LEVELS: Level[] = [
  {
    key: "rounds",
    title: "HASH ROUNDS",
    titleZh: "哈希轮",
    tag: "The Equihash club on an Ironwood rooftop: the LED floor, the lasers, the classic chart.",
    tagZh: "Ironwood 屋顶的 Equihash 俱乐部：LED 舞池、激光、经典谱面。",
    ambience: "club",
    tune: ROUNDS_TUNE,
    sky: ["#06051a", "#2c1550"],
    fog: [40, 190],
    pads: [
      [-3.3, 0.9, 0.24],
      [3.3, 0.9, 0.24],
      [-7.3, -0.3, 0.24],
      [7.3, -0.3, 0.24],
    ],
    eye: V3(0, 4.3, 12.8),
    at: V3(0, 1.75, 0),
    orbit: { r: 19, h: 9.5, at: V3(0, 2, -1) },
    floor: [C2("#2fb8ff", "#9b6cff"), C2("#9b6cff", "#ff4f9a"), C2("#ff6b35", "#ff2d55")],
    beam: [C2("#59e6ff", "#b48cff"), C2("#b48cff", "#ff5fa2"), C2(ACCENT, "#ff3d5a")],
    stageZ: 0.5,
  },
  {
    key: "marina",
    title: "MARINA DECK",
    titleZh: "滨海泳池甲板",
    tag: "Marina Bay, a rooftop pool at sunset: neon trails are HOLD notes: keep the key down to the end.",
    tagZh: "滨海湾，日落时的屋顶泳池：霓虹长条是长按音符：按住方向键直到尾端。",
    ambience: "sea",
    tune: MARINA_TUNE,
    sky: ["#2a2f7a", "#ff9a6a"],
    fog: [70, 300],
    pads: [
      [-3.4, 0.8, 0.24],
      [3.4, 0.8, 0.24],
      [-7.4, -1.7, 0.24],
      [7.4, -1.7, 0.24],
    ],
    eye: V3(0, 4.7, 13.2),
    at: V3(0, 1.55, -0.6),
    orbit: { r: 20, h: 8.5, at: V3(0, 1.5, -2) },
    floor: [C2("#19d3c5", "#2f8cff"), C2("#2f8cff", "#ff5fa2"), C2("#ff6b35", "#ffcf5a")],
    beam: [C2("#7dffe0", "#59c8ff"), C2("#b48cff", "#ff5fa2"), C2(ACCENT, "#ffd166")],
    stageZ: -0.5,
  },
  {
    key: "astana",
    title: "WINTER FEST",
    titleZh: "冬季音乐节",
    tag: "Central Park in the snow, a two-tier ice stage: WHITEOUT squalls hide the top of the lane.",
    tagZh: "雪中的中央公园，双层冰舞台：白毛风会遮住轨道上半部分。",
    ambience: "crowd",
    tune: ASTANA_TUNE,
    sky: ["#070d2e", "#28407a"],
    fog: [45, 210],
    pads: [
      [-3.0, 1.4, 0.24],
      [3.0, 1.4, 0.24],
      [-6.1, -2.3, 1.24],
      [6.1, -2.3, 1.24],
    ],
    eye: V3(0, 5.0, 13.6),
    at: V3(0, 1.9, -0.8),
    orbit: { r: 20, h: 10, at: V3(0, 2.2, -2) },
    floor: [C2("#59c8ff", "#d8f4ff"), C2("#9b6cff", "#59c8ff"), C2("#ffb347", "#ff6b35")],
    beam: [C2("#bfefff", "#59c8ff"), C2("#b48cff", "#7fe3ff"), C2("#ffd08a", ACCENT)],
    stageZ: 0,
  },
];

const UP = new THREE.Vector3(0, 1, 0);
/** A steady pseudo-random 0…1 for scenery (not the seed's: the game's draws stay the game's). */
const hash1 = (i: number) => {
  const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
};
/** MARINA DECK's sky: sunset (top, middle, horizon), then night. */
const SKY_M = ["#3b4aa6", "#ff8a6a", "#ffc98a", "#0b0c30", "#3a1d6e", "#c2507a"].map((c) => new THREE.Color(c));
const BULB_C = ["#ffd166", "#ff5fa2", "#7dffe0", "#ffffff", "#ff8a5c"];
const LANTERN_C = ["#ffcf7a", "#ffb347", "#ff8a5c", "#fff0c8"];
/** The fireworks' colours by level (club, marina, festival), the rockets' trails, the pyro, the flames. */
const FW_C = [
  ["#ff6b35", "#59e6ff", "#b48cff", "#ff5fa2", "#ffd166"],
  ["#ffd166", "#ff5fa2", "#7dffe0", "#ff8a5c", "#b48cff"],
  ["#ffd08a", "#7fe3ff", "#ffffff", "#ffb347", "#b48cff"],
].map((p) => p.map((c) => new THREE.Color(c).multiplyScalar(1.4)));
const GOLD_C = new THREE.Color("#ffc870");
const WHITE_C = new THREE.Color("#ffffff");
const PYRO_C = ["#fff2c0", "#ffd166", "#ffb347"].map((c) => new THREE.Color(c));
const FLAME_C = ["#ff9a3c", "#ff6a2a", "#ffd08a", "#ffb347"].map((c) => new THREE.Color(c).multiplyScalar(0.8));
/** MARINA DECK's clouds: lit by the sunset, then the night's. */
const CLOUD_M = [new THREE.Color("#ffb0a0"), new THREE.Color("#3a2a5e")];
/** WINTER FEST's fog: the night's, a squall's. */
const FOG_A = [new THREE.Color("#28407a"), new THREE.Color("#d6e8f8")];
const NUMS = Array.from({ length: 256 }, (_, i) => String(i));

/** The keys the game stamps itself (their event time); kit.ts's Input still has them too. */
const KEYS: Record<string, number> = { ArrowLeft: L, KeyA: L, KeyQ: L, ArrowDown: D, KeyS: D, ArrowUp: U, KeyW: U, KeyZ: U, ArrowRight: R, KeyD: R, Space: HASH, Enter: HASH, NumpadEnter: HASH };
const PAD_B: Record<string, number> = { left: L, down: D, up: U, right: R, a: HASH };
const BTN: Btn[] = ["left", "down", "up", "right", "a"];

const perfNow = () => performance.now() / 1000;
const LAB = typeof location !== "undefined" && /partylab/.test(location.pathname);
/** The arrow's turn on the canvas (drawn pointing up). */
const ROT = [-Math.PI / 2, Math.PI, 0, Math.PI / 2];

/** An offscreen sprite, drawn once (2× for a sharp HUD). */
function sprite(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w * 2;
  c.height = h * 2;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  paint(g);
  return c;
}
/** A chunky arrow pointing up, `s` px, centred on 0, 0. */
function arrowPath(g: CanvasRenderingContext2D, s: number) {
  const k = s / 100;
  g.beginPath();
  g.moveTo(0, -46 * k);
  g.lineTo(44 * k, 0);
  g.lineTo(18 * k, 0);
  g.lineTo(18 * k, 42 * k);
  g.lineTo(-18 * k, 42 * k);
  g.lineTo(-18 * k, 0);
  g.lineTo(-44 * k, 0);
  g.closePath();
}

interface Sprites {
  /** [dir][0 on the beat, 1 between, 2 scrambled] */
  note: HTMLCanvasElement[][];
  /** [dir][0 idle, 1 lit] */
  recep: HTMLCanvasElement[][];
  hash: HTMLCanvasElement;
  hashRecep: HTMLCanvasElement;
  q: HTMLCanvasElement;
}
let SPR: Sprites | null = null;
function sprites(): Sprites {
  if (SPR) return SPR;
  const S = 52;
  const arrow = (dir: number, color: string, kind: "note" | "recep" | "lit") =>
    sprite(S, S, (g) => {
      g.translate(S / 2, S / 2);
      g.rotate(ROT[dir]);
      g.lineJoin = "round";
      if (kind === "recep") {
        // (where the arrows are hit: an empty arrow, bright enough to be found at a glance)
        arrowPath(g, NOTE);
        g.lineWidth = 7.5;
        g.strokeStyle = "rgba(10,6,28,0.92)";
        g.stroke();
        g.lineWidth = 3.2;
        g.strokeStyle = "rgba(255,255,255,0.92)";
        g.stroke();
        g.fillStyle = "rgba(20,14,48,0.55)";
        g.fill();
        return;
      }
      if (kind === "lit") {
        g.shadowColor = "#ffffff";
        g.shadowBlur = 14;
      }
      arrowPath(g, NOTE);
      g.lineWidth = 8;
      g.strokeStyle = INK;
      g.stroke();
      g.shadowBlur = 0;
      g.lineWidth = 3.5;
      g.strokeStyle = "#ffffff";
      g.stroke();
      const gr = g.createLinearGradient(0, -NOTE * 0.46, 0, NOTE * 0.42);
      gr.addColorStop(0, tint(color, 0.55));
      gr.addColorStop(0.5, color);
      gr.addColorStop(1, tint(color, -0.25));
      g.fillStyle = kind === "lit" ? "#ffffff" : gr;
      g.fill();
      if (kind === "note") {
        // a gloss on the head
        g.beginPath();
        g.moveTo(0, -36 * (NOTE / 100));
        g.lineTo(26 * (NOTE / 100), -8 * (NOTE / 100));
        g.lineTo(-26 * (NOTE / 100), -8 * (NOTE / 100));
        g.closePath();
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fill();
      }
    });
  const bar = (fill: string, label: string, ink: string, recep = false) =>
    sprite(LANE_W, 40, (g) => {
      const w = LANE_W - 8;
      if (recep) {
        rr(g, 4, 6, w, 28, 14);
        g.lineWidth = 6;
        g.strokeStyle = "rgba(10,6,28,0.85)";
        g.stroke();
        g.lineWidth = 2.5;
        g.strokeStyle = "rgba(255,255,255,0.5)";
        g.setLineDash([6, 5]);
        g.stroke();
        g.setLineDash([]);
        return;
      }
      rr(g, 4, 5, w, 30, 15);
      g.lineWidth = 7;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = 3;
      g.strokeStyle = "#ffffff";
      g.stroke();
      const gr = g.createLinearGradient(0, 5, 0, 35);
      gr.addColorStop(0, tint(fill, 0.5));
      gr.addColorStop(0.55, fill);
      gr.addColorStop(1, tint(fill, -0.2));
      g.fillStyle = gr;
      g.fill();
      rr(g, 18, 8, w - 28, 6, 3);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fill();
      g.font = `900 19px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineWidth = 5;
      g.strokeStyle = ink;
      g.strokeText(label, LANE_W / 2, 21);
      g.fillStyle = "#ffffff";
      g.fillText(label, LANE_W / 2, 21);
    });
  SPR = {
    note: [0, 1, 2, 3].map((d) => NOTE_C.map((c) => arrow(d, c, "note"))),
    recep: [0, 1, 2, 3].map((d) => [arrow(d, "#ffffff", "recep"), arrow(d, "#ffffff", "lit")]),
    hash: bar(ACCENT, "# HASH! #", "#7a2408"),
    hashRecep: bar("#fff", "", INK, true),
    q: bar("#5a3fd0", "? ? ? ?", "#1b0f4a"),
  };
  return SPR;
}

/** WHITEOUT's frost (drawn once): packed snow and ice crystals, a ragged melting edge at the bottom. */
let FROST_SPR: HTMLCanvasElement | null = null;
function frostSprite() {
  if (FROST_SPR) return FROST_SPR;
  const w = LANE_W + 16;
  const h = 300;
  FROST_SPR = sprite(w, h, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "rgba(246,252,255,1)");
    gr.addColorStop(0.78, "rgba(222,242,255,1)");
    gr.addColorStop(0.88, "rgba(196,230,255,0.85)");
    gr.addColorStop(1, "rgba(190,228,255,0)");
    g.fillStyle = gr;
    rr(g, 0, 0, w, h, 16);
    g.fill();
    // the crystals
    g.strokeStyle = "rgba(120,180,230,0.55)";
    g.lineWidth = 1.6;
    for (let i = 0; i < 26; i++) {
      const x = 12 + ((i * 71) % (w - 24));
      const y = 14 + ((i * 113) % (h * 0.75));
      const r = 4 + (i % 4) * 2.5;
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3;
        g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
        g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.stroke();
    }
    // the ragged edge: icicles
    g.fillStyle = "rgba(216,240,255,0.95)";
    for (let x = 4; x < w - 4; x += 13) {
      const l = 10 + ((x * 37) % 23);
      g.beginPath();
      g.moveTo(x, h * 0.86);
      g.lineTo(x + 6.5, h * 0.86 + l);
      g.lineTo(x + 13, h * 0.86);
      g.fill();
    }
  });
  return FROST_SPR;
}

// ---- the players ---------------------------------------------------------------------------------

interface Dancer {
  p: Player;
  a: Avatar;
  seat: number;
  human: boolean;
  /** The pad's centre, its top. */
  px: number;
  pz: number;
  py: number;
  score: number;
  shown: number;
  combo: number;
  best: number;
  /** PERFECT, GREAT, GOOD, MISS. */
  n: number[];
  /** The first note this player has not been judged on yet. */
  head: number;
  /** Rounds whose sabotage is spent (a bit each). */
  sab: number;
  /** The scramble on this player: its first and last notes' times (for the HUD). */
  scrFrom: number;
  scrTo: number;
  /** AI: a slump after a miss (0…1), a steady early or late lean (s). */
  slump: number;
  bias: number;
  // the dance
  pose: number;
  poseT: number;
  wild: number;
  stumble: number;
  flipAt: number;
  /** The pad's five panels' glow (◀ ▼ ▲ ▶ #). */
  lit: Float32Array;
  /** The arms now: right x, z, elbow; left x, z, elbow. */
  arm: Float32Array;
  /** The pop over the head: a judgement (1…4), or 6 SABOTAGE, 7 SCRAMBLED, 8 FEVER. */
  pop: number;
  popT: number;
  /** A hold under way (its note; −1 none), how long the key has been up in it; holds kept and dropped. */
  holding: number;
  hgap: number;
  holds: number;
  drops: number;
}

const POP_EN: Record<number, string> = { 6: "SABOTAGE!", 7: "SCRAMBLED!", 8: "HASH FEVER!", 9: "HOLD!", 10: "DROP" };
const POP_ZH: Record<number, string> = { 6: "捣乱！", 7: "被打乱！", 8: "哈希狂热！", 9: "长按成功！", 10: "断了" };
const POP_C: Record<number, string> = { 6: "#ff5fa2", 7: "#59e6ff", 8: ACCENT, 9: "#7dffe0", 10: "#ff3d5a" };

// ---- the shows' sparks ----------------------------------------------------------------------------

/** A soft round dot (sparks, haze, glints): white in the middle, gone at the edge. */
function dotTex() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.22, "rgba(255,255,255,0.75)");
    gr.addColorStop(0.55, "rgba(255,255,255,0.18)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/**
 * Glowing sparks (fireworks, the stage's pyro, a fire's flames, glints): additive dots that face the
 * camera, one draw, no fog (they shine through the night); each fades and flickers as it dies.
 */
class Sparks {
  readonly mesh: THREE.InstancedMesh;
  private a: Float32Array;
  private n = 0;
  private m = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(
    scene: THREE.Scene,
    private cap = 900,
  ) {
    this.a = new Float32Array(cap * 14);
    this.mesh = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: dotTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.setColorAt(0, this.c.set(0xffffff));
    scene.add(this.mesh);
  }

  /** One spark: where, its speed, how long it lives, how big (m), its colour, gravity, drag. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, c: THREE.Color, g = 6, drag = 0.6) {
    if (this.n >= this.cap) return;
    const o = this.n++ * 14;
    const a = this.a;
    a[o] = x;
    a[o + 1] = y;
    a[o + 2] = z;
    a[o + 3] = vx;
    a[o + 4] = vy;
    a[o + 5] = vz;
    a[o + 6] = 0;
    a[o + 7] = life;
    a[o + 8] = size;
    a[o + 9] = g;
    a[o + 10] = c.r;
    a[o + 11] = c.g;
    a[o + 12] = c.b;
    a[o + 13] = drag;
  }

  /** A shell bursting: n sparks out of a point in a sphere. */
  burst(x: number, y: number, z: number, n: number, speed: number, cols: THREE.Color[], life: number, size: number, g = 4) {
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const k = Math.sqrt(1 - u * u);
      const v = speed * (0.8 + Math.random() * 0.2);
      this.emit(x, y, z, Math.cos(t) * k * v, u * v, Math.sin(t) * k * v, life * (0.7 + Math.random() * 0.5), size, cols[i % cols.length], g, 1.3);
    }
  }

  update(dt: number, q: THREE.Quaternion) {
    const a = this.a;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * 14;
      const life = a[o + 6] + dt;
      if (life >= a[o + 7]) continue;
      const d = Math.exp(-a[o + 13] * dt);
      const vx = a[o + 3] * d,
        vy = a[o + 4] * d - a[o + 9] * dt,
        vz = a[o + 5] * d;
      const t = w * 14;
      a[t] = a[o] + vx * dt;
      a[t + 1] = a[o + 1] + vy * dt;
      a[t + 2] = a[o + 2] + vz * dt;
      a[t + 3] = vx;
      a[t + 4] = vy;
      a[t + 5] = vz;
      a[t + 6] = life;
      for (let j = 7; j < 14; j++) a[t + j] = a[o + j];
      const k = 1 - life / a[t + 7];
      // (hot: over 1 they bloom on the stage's finish)
      const f = k * (0.55 + 0.45 * k) * (0.7 + Math.random() * 0.3) * 1.6;
      const s = a[t + 8] * (0.45 + 0.55 * k);
      this.m.compose(this.v.set(a[t], a[t + 1], a[t + 2]), q, this.sc.set(s, s, s));
      this.mesh.setMatrixAt(w, this.m);
      this.mesh.setColorAt(w, this.c.setRGB(a[t + 10] * f, a[t + 11] * f, a[t + 12] * f));
      w++;
    }
    this.n = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---- the game ------------------------------------------------------------------------------------

class HashBeat implements Mini {
  private w: ReturnType<typeof world>;
  /** The level, its song in time. */
  private tune: Tune;
  private k: Clock;
  private comp: Composed;
  private cam: CamRig;
  private fx: Fx3;
  private dn: Dancer[];
  private human: number;
  /** The seat the lane shows (you; in a table of AIs, the first). */
  private laneSeat: number;
  private ch: Chart;
  private res: Int8Array;
  /** A scrambled arrow's new direction for a player (−1: none). */
  private scr: Int8Array;
  /** AI: its press's offset from the note (s); NaN: it misses it. */
  private plan: Float32Array;
  /** Holds: each player's state on each note (H_ON, H_OK, H_DROP); an AI's planned let-go (song s; NaN: it holds on). */
  private hold: Int8Array;
  private dropAt: Float32Array;
  /** WHITEOUT now: the frost's cover of the lane (0…1 of FROST), the squall's strength (0…1). */
  private frost = 0;
  private squall = 0;
  private squallSaid = -1;
  private planned = 0;
  /** The song clock: song time = performance seconds + off. */
  private off = 0;
  private audio = false;
  private t0a = 0;
  /** music.ts's beat 0 as it was when the song started (it moves if the music slips). */
  private musicT0 = -1;
  private lastP = 0;
  private lastCT = -1;
  private ctStill = 0;
  private resyncAt = 0;
  private started = false;
  /** Seconds of the game (cosmetic: the dance, the lights). */
  private clk = 0;
  /** The song's time this frame. */
  private now = -1;
  private part = S_INTRO;
  private feverSeat = -1;
  private tallyT = -1;
  private over: number[] | null = null;
  private post = 0;
  /** The visitor's learnt lag (s) and the hits it is learnt from. */
  private cal = 0;
  private calN = 0;
  /** Key presses stamped at their event (button, ms), since the last frame. */
  private evB = new Int8Array(64);
  private evT = new Float64Array(64);
  private evN = 0;
  private live = false;
  private offs: (() => void)[] = [];
  /** The lane: the receptors' flash, the last hit's flash per column, the judgement pop. */
  private recep = new Float32Array(5);
  private flash = new Float32Array(5);
  private flashC = ["", "", "", "", ""];
  private jPop = 0;
  private jPopT = -9;
  private jEarly = 0;
  private laneShake = 0;
  /** Announcements over the stage (FINAL HASH!, HASHED!). */
  private banners: { s: string; t: number; dur: number; c: string; y: number; size: number }[] = [];
  private winner = -1;
  // the scene's moving parts
  private tiles!: THREE.InstancedMesh;
  private tileX!: Float32Array;
  private tileZ!: Float32Array;
  private panels!: THREE.InstancedMesh;
  private hubs!: THREE.InstancedMesh;
  private eq: THREE.InstancedMesh | null = null;
  private beamGeo!: THREE.ConeGeometry;
  private beams: { m: THREE.Mesh; x: number; y: number; z: number; ph: number; mat: THREE.MeshBasicMaterial }[] = [];
  private lasers: THREE.InstancedMesh | null = null;
  private woofers: THREE.InstancedMesh | null = null;
  /** The crowd's feet. */
  private crowdY = -1.4;
  // the levels' rooms: the lights, the sky, what moves
  private keyLight: THREE.DirectionalLight | null = null;
  private rimL: THREE.DirectionalLight | null = null;
  private skyMat: THREE.ShaderMaterial | null = null;
  /** The festival's sky dome (it whitens with a squall). */
  private nightSky: THREE.MeshBasicMaterial | null = null;
  private sunDisc: THREE.Mesh | null = null;
  private ripTex: THREE.Texture | null = null;
  private wheel: THREE.Group | null = null;
  private canopy: THREE.InstancedMesh | null = null;
  private strips: THREE.InstancedMesh | null = null;
  private bulbs: THREE.InstancedMesh | null = null;
  private firLights: THREE.InstancedMesh | null = null;
  private snow: THREE.InstancedMesh | null = null;
  private flakes: Float32Array | null = null;
  // the show: sparks (fireworks, pyro, flames), the rockets in the air, the chart's HASH!es seen, the club's fountains
  private sparks!: Sparks;
  private rockets: { x: number; y: number; z: number; vx: number; vy: number; c: THREE.Color }[] = [];
  private fwBeat = -1;
  private hashSeen = 0;
  private pyro = [0, 0];
  private hazeM: THREE.InstancedMesh | null = null;
  private hazeP: Float32Array | null = null;
  private rimBase = 1.4;
  // the rooms' dressing that moves
  private towerNeon: THREE.InstancedMesh | null = null;
  private ticker: THREE.Texture | null = null;
  private blimp: THREE.Group | null = null;
  private ballMat: THREE.MeshBasicMaterial | null = null;
  private balls: THREE.Mesh[] = [];
  private specks: THREE.InstancedMesh | null = null;
  private floats: THREE.Mesh[] = [];
  private candles: THREE.InstancedMesh | null = null;
  private cloudMat: THREE.MeshBasicMaterial | null = null;
  private starMat: THREE.MeshBasicMaterial | null = null;
  private pits: [number, number, number][] = [];
  private fireAcc = 0;
  private iceL: THREE.InstancedMesh | null = null;
  private splashBeat = -1;
  /** The lasers' fans: their corners (± x, y, z) and tilt back. */
  private laserAt: [number, number, number, number] = [12.5, 5.3, -6.4, -0.35];
  private crowd!: { body: THREE.InstancedMesh; head: THREE.InstancedMesh; arm: THREE.InstancedMesh; stick: THREE.InstancedMesh; fig: { x: number; z: number; s: number; ph: number; stick: boolean; lean: number }[] };
  private spot!: THREE.Mesh;
  private spotMat!: THREE.MeshBasicMaterial;
  private orbs: { m: THREE.Mesh; from: number; to: number; t: number }[] = [];
  private noiseBuf: AudioBuffer | null = null;
  // scratch (no allocations per frame)
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private m4 = new THREE.Matrix4();
  private sc = new THREE.Vector3();
  private col = new THREE.Color();
  private eu = new THREE.Euler();
  private armT = new Float32Array(6);
  private valsL = ["", "", "", ""];
  private subL = ["", "", "", ""];
  private leadL: number[] = [];
  private keyL = [-1, -1, -1, -1];
  private subK = ["", "", "", ""];
  private pillC = ["", "", "", ""];
  private seatC: THREE.Color[];
  /** The order once the tally starts (the scores are final then). */
  private final: number[] | null = null;
  /** Test hook: the song's time from elsewhere (the Node bench), instead of the audio or the wall. */
  clockFn: (() => number) | null = null;

  constructor(
    private players: Player[],
    private rnd: Rnd,
    private lv: Level,
  ) {
    this.tune = lv.tune;
    const song = songOf(lv.tune);
    this.k = song.k;
    this.comp = song.c;
    this.ch = song.ch;
    this.w = world({ night: true, sky: lv.sky, fog: lv.fog, fov: 46 });
    // (the stage's finish for this room: the club's neon blooms hardest, the snow least)
    this.w.scene.userData.post = lv.key === "rounds" ? { bloom: 1.25 } : lv.key === "marina" ? { bloom: 1.05 } : { bloom: 0.9 };
    const n = this.ch.n;
    this.res = new Int8Array(n * 4);
    this.scr = new Int8Array(n * 4).fill(-1);
    this.plan = new Float32Array(n * 4).fill(NaN);
    this.hold = new Int8Array(n * 4);
    this.dropAt = new Float32Array(n * 4).fill(NaN);
    this.human = players.findIndex((p) => p.human);
    this.seatC = players.map((p) => new THREE.Color(p.color));
    this.laneSeat = this.human >= 0 ? this.human : 0;
    const s = this.w.scene;
    this.w.hemi.intensity = 1.35;
    this.w.sun.intensity = 0.9;
    this.w.sun.position.set(-20, 40, 30);
    // a key light from the crowd, a lilac rim from behind
    const key = new THREE.DirectionalLight("#ffe6d6", 1.25);
    key.position.set(4, 9, 20);
    const rim = new THREE.DirectionalLight("#b48cff", 1.4);
    rim.position.set(0, 10, -20);
    s.add(key, key.target, rim, rim.target);
    this.keyLight = key;
    this.rimL = rim;
    this.build();
    this.dn = players.map((p, i) => {
      const a = new Avatar(s, p, { scale: SIZE, marker: false, ring: false });
      const [px, pz, py] = lv.pads[i];
      a.pos.set(px, py, pz);
      a.floor = py;
      a.yaw = 0;
      a.body.holdArms(true);
      a.sync(0);
      return {
        p,
        a,
        seat: i,
        human: p.human,
        px,
        pz,
        py,
        score: 0,
        shown: 0,
        combo: 0,
        best: 0,
        n: [0, 0, 0, 0],
        head: 0,
        sab: 0,
        scrFrom: -9,
        scrTo: -9,
        slump: 0,
        bias: (rnd() - 0.5) * 0.03,
        pose: -1,
        poseT: 9,
        wild: 0,
        stumble: 0,
        flipAt: -1,
        lit: new Float32Array(5),
        arm: new Float32Array([-0.3, -0.25, -1.1, -0.3, 0.25, -1.1]),
        pop: 0,
        popT: -9,
        holding: -1,
        hgap: 0,
        holds: 0,
        drops: 0,
      };
    });
    this.fx = new Fx3(s, 700);
    this.cam = new CamRig(this.w.camera);
    this.cam.set(new THREE.Vector3(0, 9, 22), this.lv.at);
    if (typeof window !== "undefined" && this.human >= 0) this.listen();
    sprites();
    // (the bench: a scripted visitor reads the chart and the clock here)
    if (LAB) (window as unknown as { labBeat?: unknown }).labBeat = this;
  }

  // ---- the rooms ---------------------------------------------------------------------------------

  /** The level's room, then what every room has: the pads, the crowd, the fever's spotlight, the sabotage's orbs. */
  private build() {
    const s = this.w.scene;
    this.beamGeo = new THREE.ConeGeometry(1.0, 1, 20, 1, true);
    this.beamGeo.translate(0, -0.5, 0);
    if (this.lv.key === "marina") (this.buildMarina(), this.dressMarina());
    else if (this.lv.key === "astana") (this.buildAstana(), this.dressAstana());
    else (this.buildClub(), this.dressClub());
    this.sparks = new Sparks(s, 900);
    this.rimBase = this.rimL?.intensity ?? 1.4;
    this.buildPads();
    this.buildCrowd();
    // the spotlight on HASH FEVER's holder
    this.spotMat = new THREE.MeshBasicMaterial({ color: "#ffd0b8", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.spot = new THREE.Mesh(this.beamGeo, this.spotMat);
    this.spot.renderOrder = 6;
    this.spot.visible = false;
    s.add(this.spot);
    // the sabotage's orbs (a pool)
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(GEO.ball, glow("#ff5fa2"));
      m.scale.setScalar(0.45);
      m.visible = false;
      s.add(m);
      this.orbs.push({ m, from: 0, to: 0, t: -1 });
    }
  }

  /** The LED floor (or the pool's lights, the ice's): a tile at each spot, coloured each frame (one draw). */
  private makeTiles(xs: number[], zs: number[], y: number | number[], size: number, h = 0.06) {
    this.tileX = new Float32Array(xs);
    this.tileZ = new Float32Array(zs);
    this.tiles = new THREE.InstancedMesh(GEO.box, lit(new THREE.MeshBasicMaterial({ color: 0xffffff })), xs.length);
    for (let i = 0; i < xs.length; i++) {
      this.m4.compose(this.v.set(xs[i], typeof y === "number" ? y : y[i], zs[i]), this.q.identity(), this.sc.set(size, h, size));
      this.tiles.setMatrixAt(i, this.m4);
      this.tiles.setColorAt(i, this.col.set("#1a1430"));
    }
    this.w.scene.add(this.tiles);
  }

  /** A moving head on a truss and its beam (aimed each frame). */
  private beam(x: number, y: number, z: number, ph: number) {
    const mat = new THREE.MeshBasicMaterial({ color: "#59e6ff", transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.beamGeo, mat);
    m.position.set(x, y, z);
    m.renderOrder = 5;
    this.w.scene.add(m);
    this.beams.push({ m, x, y, z, ph, mat });
  }

  /** HASH ROUNDS: the Equihash club on an Ironwood rooftop, its LED floor, the wall of signs, the speakers, the truss, the lasers. */
  private buildClub() {
    const s = this.w.scene;
    // the night over the rooftops: a dome of small stars and their milky band, the city's violet glow on the horizon (the fog's colour)
    skyDome(s, { sky: this.lv.sky, stars: 420, band: true, haze: 0.55, rnd: rng(0xbea7) });
    skyline(s, { night: true, r: 115, y: -34, tall: 1.4, rnd: this.rnd });
    // the bright stars (voxels, nearer than the dome's)
    const stars = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), 90);
    for (let i = 0; i < 90; i++) {
      const a = this.rnd() * Math.PI * 2;
      const e = 0.12 + this.rnd() * 0.7;
      const r = 170;
      const sz = 0.35 + this.rnd() * 0.6;
      this.m4.compose(this.v.set(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r * 0.8, Math.sin(a) * Math.cos(e) * r), this.q.identity(), this.sc.set(sz, sz, sz));
      stars.setMatrixAt(i, this.m4);
    }
    s.add(stars);
    // the club's floor down where the crowd stands, the stage up on it
    block("#120e22", 40, 0.4, 16, 0, -1.6, 10, s);
    const stage = block("#1d1838", 25, 1.4, 10.5, 0, -0.7, -1.05, s);
    outline(stage, 0.05);
    block("#ff6b35", 25.1, 0.1, 0.12, 0, -0.06, 4.22, s, glow(ACCENT));
    block("#c4b1fc", 25.1, 0.08, 0.1, 0, -0.95, 4.22, s, glow(LILAC));
    // the LED floor: a tile a metre
    const xs: number[] = [];
    const zs: number[] = [];
    for (let z = -5.5; z <= 3.6; z += 1) for (let x = -12; x <= 12.01; x += 1) (xs.push(x), zs.push(z));
    this.makeTiles(xs, zs, 0, 0.92);
    // the back wall, its signs, the equaliser, a neon ⓩ
    const wall = block("#141026", 27, 5.2, 0.6, 0, 2.6, -6.6, s);
    outline(wall, 0.05);
    block("#fff", 27.1, 0.12, 0.12, 0, 5.2, -6.28, s, glow(ACCENT));
    const sign = (txt: string, sub: string, x: number, c: string) => {
      const tex = canvasTex(1024, 300, (g) => {
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = `900 150px ${FONT}`;
        g.shadowColor = c;
        g.shadowBlur = 38;
        g.lineWidth = 10;
        g.strokeStyle = c;
        g.strokeText(txt, 512, 120);
        g.shadowBlur = 16;
        g.fillStyle = "#ffffff";
        g.fillText(txt, 512, 120);
        g.font = `800 54px ${FONT}`;
        g.shadowBlur = 20;
        g.fillStyle = tint(c, 0.35);
        g.fillText(sub, 512, 245);
      });
      const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.scale.set(7.4, 2.17, 1);
      m.position.set(x, 3.75, -6.27);
      s.add(m);
    };
    sign("EQUIHASH", "CLUB · IRONWOOD", -7.2, "#59e6ff");
    sign("HASH ROUNDS", "哈希轮 · ROUNDS", 7.2, ACCENT);
    // (the ⓩ in neon: a ring, the Z's two bars and its diagonal, a tick above and below)
    const tri = glow("#59e6ff");
    const zRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 8, 48), tri);
    zRing.position.set(0, 3.4, -6.25);
    s.add(zRing);
    for (const [w, h, y, rz] of [
      [1.33, 0.2, 0.59, 0],
      [1.33, 0.2, -0.59, 0],
      [1.63, 0.2, 0, Math.atan2(1.18, 1.125)],
      [0.2, 0.4, 0.89, 0],
      [0.2, 0.4, -0.89, 0],
    ])
      block("#fff", w, h, 0.1, 0, 3.4 + y, -6.25, s, tri).rotation.z = rz;
    this.eq = new THREE.InstancedMesh(GEO.box, lit(new THREE.MeshBasicMaterial({ color: 0xffffff })), 34);
    for (let i = 0; i < 34; i++) this.eq.setColorAt(i, this.col.set(i % 2 ? "#59e6ff" : "#b48cff"));
    this.eq.position.z = -6.22;
    s.add(this.eq);
    // the speaker stacks at the back corners (their woofers thump with the kick)
    const cabs = new THREE.InstancedMesh(GEO.box, toon("#2c2648"), 8);
    this.woofers = new THREE.InstancedMesh(GEO.cyl, toon("#4a4270", "#140c30"), 8);
    const rings = new THREE.InstancedMesh(GEO.ring, glow("#b48cff", 0.55), 8);
    let k = 0;
    for (const x of SPEAKER_X)
      for (let j = 0; j < 4; j++) {
        const y = 0.75 + j * 1.45;
        this.m4.compose(this.v.set(x, y, -4.6), this.q.identity(), this.sc.set(2.1, 1.4, 1.5));
        cabs.setMatrixAt(k, this.m4);
        this.m4.compose(this.v.set(x, y, -3.84), this.q.setFromEuler(this.eu.set(Math.PI / 2, 0, 0)), this.sc.set(1.0, 0.1, 1.0));
        this.woofers.setMatrixAt(k, this.m4);
        this.m4.compose(this.v.set(x, y, -3.83), this.q.identity(), this.sc.set(1.25, 1.25, 1));
        rings.setMatrixAt(k, this.m4);
        k++;
      }
    s.add(cabs, this.woofers, rings);
    // the truss and its moving heads, their beams
    const truss = block("#2a2442", 24, 0.36, 0.36, 0, 6.6, -2.2, s);
    outline(truss, 0.04);
    for (const x of [-11.9, 11.9]) block("#2a2442", 0.36, 6.6, 0.36, x, 3.3, -2.2, s);
    const heads = new THREE.InstancedMesh(GEO.box, toon("#3a3358"), 6);
    [-8.6, -5.2, -1.8, 1.8, 5.2, 8.6].forEach((x, i) => {
      this.m4.compose(this.v.set(x, 6.22, -2.2), this.q.identity(), this.sc.set(0.5, 0.42, 0.5));
      heads.setMatrixAt(i, this.m4);
      this.beam(x, 6.05, -2.2, i * 1.3);
    });
    s.add(heads);
    // laser fans over the wall, into the sky
    this.lasers = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), 12);
    for (let i = 0; i < 12; i++) this.lasers.setColorAt(i, this.col.set(i % 3 === 0 ? ACCENT : i % 3 === 1 ? "#59e6ff" : "#b48cff"));
    this.lasers.frustumCulled = false;
    s.add(this.lasers);
  }

  // ---- the show: fireworks, pyro, flames, haze, glints ---------------------------------------------

  /** Rockets up from the city round the room (the bay, the square), toward the sides of the sky. */
  private launch(n: number) {
    const key = this.lv.key;
    const pal = FW_C[key === "marina" ? 1 : key === "astana" ? 2 : 0];
    const [x0, x1, z0, z1, y0, v] = key === "marina" ? [14, 62, -95, -140, -30, 28] : key === "astana" ? [12, 50, -80, -125, -1, 21] : [14, 50, -60, -95, -8, 20];
    for (let i = 0; i < n && this.rockets.length < 12; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.rockets.push({ x: side * (x0 + Math.random() * (x1 - x0)), y: y0, z: z0 + Math.random() * (z1 - z0), vx: -side * Math.random() * 2.5, vy: v * (0.88 + Math.random() * 0.24), c: pal[Math.floor(Math.random() * pal.length)] });
    }
  }

  /** The show on the music: a volley on every HASH! of the chart (the club: its pyro), a rocket every other beat of the final, a sky full at the crowning; the club's fountains, the festival's fires; the sparks fly. */
  private show(dt: number, now: number) {
    const ch = this.ch;
    const key = this.lv.key;
    const playing = this.started && this.tallyT < 0;
    if (playing)
      while (this.hashSeen < ch.n && ch.t[this.hashSeen] <= now) {
        const i = this.hashSeen++;
        if (ch.dir[i] !== HASH) continue;
        const part = ch.part[i];
        if (key === "rounds") {
          this.pyro[0] = this.pyro[1] = 0.45;
          if (part >= S_FINAL) this.launch(1);
        } else this.launch(part <= S_VERSE ? 1 : part === S_CHORUS ? 2 : 3);
      }
    const bn = Math.floor(now / this.k.beat);
    if (playing && this.part >= S_FINAL && bn !== this.fwBeat) {
      this.fwBeat = bn;
      if (bn % 2 === 0) this.launch(1);
    }
    if (this.winner >= 0 && Math.random() < dt * 3) this.launch(1);
    const S = this.sparks;
    const fs = key === "marina" ? 2.9 : key === "astana" ? 2.4 : 1.9;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.vy -= 9 * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      S.emit(r.x, r.y, r.z, 0, -1.5, 0, 0.45, fs * 0.5, GOLD_C, 2, 1);
      if (r.vy < 3) {
        S.burst(r.x, r.y, r.z, 44, 6 + 4 * fs, [r.c, r.c, WHITE_C], 1.7, fs, 3);
        S.burst(r.x, r.y, r.z, 10, 2.5 + 2 * fs, [WHITE_C], 0.9, fs * 0.8, 1);
        this.rockets[i] = this.rockets[this.rockets.length - 1];
        this.rockets.pop();
      }
    }
    // the club's cold-spark fountains at the stage's front corners
    if (key === "rounds")
      for (let k = 0; k < 2; k++) {
        if (this.pyro[k] <= 0) continue;
        this.pyro[k] -= dt;
        const x = k ? 11.4 : -11.4;
        for (let j = 0; j < 7; j++) S.emit(x + (Math.random() - 0.5) * 0.4, 0.1, 3.7, (Math.random() - 0.5) * 2.2, 8 + Math.random() * 5, (Math.random() - 0.5) * 1.2, 0.7 + Math.random() * 0.3, 0.26, PYRO_C[j % 3], 13, 0.3);
      }
    // the festival's fire pits: flames licking up, embers
    if (this.pits.length) {
      this.fireAcc += dt * 40;
      while (this.fireAcc >= 1) {
        this.fireAcc -= 1;
        for (const [x, y, z] of this.pits) {
          S.emit(x + (Math.random() - 0.5) * 0.7, y + 0.2, z + (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.5, 1.5 + Math.random() * 1.4, (Math.random() - 0.5) * 0.5, 0.45 + Math.random() * 0.3, 0.55 + Math.random() * 0.45, FLAME_C[Math.floor(Math.random() * 4)], -1.5, 1.6);
          if (Math.random() < 0.12) S.emit(x, y + 0.6, z, (Math.random() - 0.5) * 1.2, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 1.2, 1.4, 0.09, FLAME_C[2], -0.4, 0.4);
        }
      }
    }
    S.update(dt, this.w.camera.quaternion);
    // the haze drifting low over the floor
    const hz = this.hazeP;
    if (hz && this.hazeM) {
      const q = this.w.camera.quaternion;
      const n = hz.length / 5;
      const wind = this.lv.key === "astana" ? 0.6 + this.squall * 9 : 0.35;
      for (let i = 0; i < n; i++) {
        let x = hz[i * 5] + wind * (0.6 + (i % 3) * 0.2) * dt;
        if (x > 15) x -= 30;
        hz[i * 5] = x;
        const s = hz[i * 5 + 3] * (1 + Math.sin(this.clk * 0.6 + hz[i * 5 + 4]) * 0.15);
        this.m4.compose(this.v.set(x, hz[i * 5 + 1] + Math.sin(this.clk * 0.4 + i) * 0.08, hz[i * 5 + 2]), q, this.sc.set(s, s * 0.55, s));
        this.hazeM.setMatrixAt(i, this.m4);
      }
      this.hazeM.instanceMatrix.needsUpdate = true;
    }
  }

  /** A low haze of soft puffs (the club's smoke, the square's blown snow): one draw. */
  private hazeOf(n: number, x0: number, x1: number, z0: number, z1: number, y: number, size: number, c: string, k: number) {
    const m = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: dotTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), n);
    this.hazeP = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      this.hazeP[i * 5] = x0 + hash1(i * 3 + 1) * (x1 - x0);
      this.hazeP[i * 5 + 1] = y + hash1(i * 3 + 2) * 0.4;
      this.hazeP[i * 5 + 2] = z0 + hash1(i * 3 + 3) * (z1 - z0);
      this.hazeP[i * 5 + 3] = size * (0.7 + hash1(i + 77) * 0.6);
      this.hazeP[i * 5 + 4] = hash1(i + 9) * 6;
      m.setColorAt(i, this.col.set(c).multiplyScalar(k * (0.7 + hash1(i + 31) * 0.6)));
    }
    m.frustumCulled = false;
    m.renderOrder = 4;
    this.w.scene.add(m);
    this.hazeM = m;
  }

  // ---- the rooms' set dressing -----------------------------------------------------------------------

  /** A tower's lit windows (an unlit texture: they glow at night). */
  private windowsTex(base: string, lit: string[], dark: string, rx: number, ry: number) {
    const t = canvasTex(
      64,
      128,
      (g) => {
        g.fillStyle = base;
        g.fillRect(0, 0, 64, 128);
        for (let y = 5; y < 128; y += 10)
          for (let x = 4; x < 64; x += 10) {
            const h = hash1(x * 31 + y * 7);
            g.fillStyle = h < 0.45 ? lit[Math.floor(h * 20) % lit.length] : dark;
            g.fillRect(x, y, 6, 6);
          }
      },
      true,
    );
    t.repeat.set(rx, ry);
    return t;
  }

  /** HASH ROUNDS' extras: the rooftops round the club (towers, neon edges, billboards), a blimp, the LED ticker over the wall, two mirror balls and their glints, smoke on the stage. */
  private dressClub() {
    const s = this.w.scene;
    const tw: [number, number, number, number][] = [
      [-18.5, -19, 7, 13],
      [-26, -27, 9, 22],
      [-35, -17, 7, 11],
      [-12, -32, 8, 15],
      [18.5, -20, 7, 14],
      [27, -28, 9, 24],
      [36, -16, 7, 10],
      [12.5, -33, 8, 16],
    ];
    const tints = ["#b8a8ff", "#9fd8ff", "#ffb8d8", "#c8b8ff"];
    this.many(
      GEO.box,
      tw.map(([x, z, w, top], i) => [x, (top - 36) / 2, z, w, top + 36, w, tints[i % 4]]),
      lit(new THREE.MeshBasicMaterial({ map: this.windowsTex("#1a1438", ["#ffd9a0", "#bfe6ff", "#ffb3d9"], "#2a2450", 2, 9) }), 0.45),
    );
    const edges: [number, number, number, number, number, number, string][] = [];
    tw.forEach(([x, z, w, top], i) => {
      const c = ["#ff6b35", "#59e6ff", "#b48cff", "#ff5fa2"][i % 4];
      for (const sx of [-1, 1]) edges.push([x + sx * (w / 2 + 0.05), top - 6, z + w / 2 + 0.05, 0.18, 12, 0.18, c]);
      edges.push([x, top + 0.05, z + w / 2 + 0.05, w + 0.3, 0.22, 0.22, c]);
    });
    this.towerNeon = this.many(GEO.box, edges, lit(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    // the billboards on two towers' faces
    const board = (txt: string, sub: string, c: string, x: number, y: number, z: number) => {
      const tex = canvasTex(512, 192, (g) => {
        g.fillStyle = "#120c2a";
        rr(g, 4, 4, 504, 184, 26);
        g.fill();
        g.lineWidth = 8;
        g.strokeStyle = c;
        g.shadowColor = c;
        g.shadowBlur = 24;
        rr(g, 12, 12, 488, 168, 20);
        g.stroke();
        g.font = `900 84px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "#ffffff";
        g.fillText(txt, 256, 86);
        g.shadowBlur = 0;
        g.font = `800 34px ${FONT}`;
        g.fillStyle = tint(c, 0.45);
        g.fillText(sub, 256, 150);
      });
      const m = new THREE.Mesh(GEO.plane, lit(new THREE.MeshBasicMaterial({ map: tex }), 0.7));
      m.scale.set(7.2, 2.7, 1);
      m.position.set(x, y, z);
      s.add(m);
    };
    board("HALO&CO", "光环 · since NU5", "#b48cff", -18.5, 8.6, -15.4);
    board("Z COFFEE", "Sapling Spritz · 树苗", "#ff6b35", 18.5, 9.0, -16.4);
    // the ZSTREET BLIMP drifting over the city, its side screen lit
    this.blimp = new THREE.Group();
    const hull = new THREE.Mesh(GEO.ball, toon("#e8e6e0", "#2a2440"));
    hull.scale.set(15, 4.6, 4.6);
    this.blimp.add(hull);
    outline(hull, 0.06);
    const fins = new THREE.InstancedMesh(GEO.box, toon("#ff6b35", "#3a1404"), 4);
    [
      [0, 2.0, 0, 0],
      [0, -2.0, 0, 0],
      [0, 0, 2.0, 1],
      [0, 0, -2.0, 1],
    ].forEach(([, y, z, flat], i) => {
      this.m4.compose(this.v.set(-6.8, y * 0.8, z * 0.8), this.q.identity(), flat ? this.sc.set(2.6, 0.2, 2.2) : this.sc.set(2.6, 2.2, 0.2));
      fins.setMatrixAt(i, this.m4);
    });
    this.blimp.add(fins);
    this.blimp.add(block("#2a2440", 3.2, 0.9, 1.4, 0.5, -2.6, 0));
    const scr = canvasTex(512, 128, (g) => {
      g.fillStyle = "#0e0a22";
      g.fillRect(0, 0, 512, 128);
      g.font = `900 64px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      // (the two words side by side, centred together)
      const [a, b] = ["ZSTREET", "· HASH ·"];
      const [wa, wb] = [g.measureText(a).width, g.measureText(b).width];
      const x0 = 256 - (wa + 24 + wb) / 2;
      g.fillStyle = "#ff6b35";
      g.fillText(a, x0 + wa / 2, 66);
      g.fillStyle = "#c4b1fc";
      g.fillText(b, x0 + wa + 24 + wb / 2, 66);
    });
    const sm = new THREE.Mesh(GEO.plane, lit(new THREE.MeshBasicMaterial({ map: scr }), 0.7));
    sm.scale.set(10, 2.5, 1);
    sm.position.set(0, 0.2, 4.62);
    this.blimp.add(sm);
    this.blimp.position.set(-40, 12.5, -52);
    s.add(this.blimp);
    // the LED ticker along the wall's top
    this.ticker = canvasTex(
      1024,
      64,
      (g) => {
        g.fillStyle = "#07051a";
        g.fillRect(0, 0, 1024, 64);
        g.font = `900 40px ${FONT}`;
        g.textBaseline = "middle";
        const words = ["HASH ROUNDS", "✦", "EQUIHASH", "✦", "ABSORB · PERMUTE · SQUEEZE", "✦", "IRONWOOD", "✦"];
        let x = 10;
        words.forEach((w2, i) => {
          g.fillStyle = i % 4 === 0 ? "#ff6b35" : i % 4 === 2 ? "#59e6ff" : "#c4b1fc";
          g.fillText(w2, x, 34);
          x += g.measureText(w2).width + 26;
        });
      },
      true,
    );
    this.ticker.repeat.set(2.2, 1);
    const tk = new THREE.Mesh(GEO.plane, lit(new THREE.MeshBasicMaterial({ map: this.ticker }), 0.8));
    tk.scale.set(26.6, 0.72, 1);
    tk.position.set(0, 5.75, -6.28);
    s.add(tk);
    block("#2a2442", 27, 0.14, 0.3, 0, 6.18, -6.32, s);
    // two mirror balls under the truss, the glints they throw on the wall and the floor
    const mir = canvasTex(256, 128, (g) => {
      for (let y = 0; y < 128; y += 8)
        for (let x = 0; x < 256; x += 8) {
          const h = hash1(x * 3 + y * 11);
          const v = Math.floor(120 + h * 135);
          g.fillStyle = h > 0.93 ? "#ffffff" : `rgb(${v},${v},${Math.min(255, v + 20)})`;
          g.fillRect(x, y, 7, 7);
        }
    });
    this.ballMat = lit(new THREE.MeshBasicMaterial({ map: mir }), 0.35);
    for (const x of [-5.4, 5.4]) {
      const b = new THREE.Mesh(GEO.ball, this.ballMat);
      b.scale.setScalar(1.0);
      b.position.set(x, 5.6, -2.2);
      s.add(b);
      outline(b, 0.03);
      this.balls.push(b);
      block("#cfd0e0", 0.04, 0.6, 0.04, x, 6.25, -2.2, s);
    }
    this.specks = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: dotTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 48);
    this.specks.frustumCulled = false;
    this.specks.setColorAt(0, this.col.set("#fff"));
    s.add(this.specks);
    // smoke drifting low over the stage's front
    this.hazeOf(20, -13, 13, 1.2, 4.3, 0.25, 2.8, "#9a7aff", 0.075);
  }

  /** The club's life: the glints wheeling round with the balls, the ticker scrolling, the blimp, the towers' neon on the beat. */
  private tickClub(dt: number, now: number, kick: number, hype: number) {
    const t = this.clk;
    for (const b of this.balls) b.rotation.y += dt * 0.9;
    this.ballMat!.color.setScalar(0.75 + kick * 0.35 * hype);
    const sp = this.specks!;
    const q = this.q2.setFromEuler(this.eu.set(-Math.PI / 2, 0, 0));
    for (let i = 0; i < 48; i++) {
      const wall = i < 26;
      const a = hash1(i + 400) * 26 + t * (0.9 + (i % 3) * 0.15) * (i % 2 ? 1 : -1);
      const x = ((((a % 26) + 26) % 26) - 13) * 0.98;
      const tw = 0.5 + 0.5 * Math.sin(t * 7 + i * 1.7);
      if (wall) this.m4.compose(this.v.set(x, 0.6 + hash1(i + 600) * 4.3, -6.2), this.q.identity(), this.sc.setScalar(0.32 + tw * 0.18));
      else this.m4.compose(this.v.set(x * 0.9, 0.07, -5 + hash1(i + 800) * 8.4), q, this.sc.setScalar(0.4 + tw * 0.2));
      sp.setMatrixAt(i, this.m4);
      sp.setColorAt(i, this.col.setRGB(1, 0.95, 1).multiplyScalar((0.25 + 0.5 * tw) * (0.5 + hype * 0.6)));
    }
    sp.count = 48;
    sp.instanceMatrix.needsUpdate = true;
    sp.instanceColor!.needsUpdate = true;
    this.ticker!.offset.x += dt * 0.06;
    const bl = this.blimp!;
    bl.position.x += dt * 1.6;
    if (bl.position.x > 70) bl.position.x = -70;
    bl.position.y = 12.5 + Math.sin(t * 0.3) * 0.4;
    bl.rotation.z = Math.sin(t * 0.25) * 0.03;
    const tn = this.towerNeon!;
    const bt = Math.floor(now / this.k.beat);
    for (let i = 0; i < tn.count; i++) {
      const on = (i + bt) % 4 !== 0;
      this.col.set(["#ff6b35", "#59e6ff", "#b48cff", "#ff5fa2"][Math.floor(i / 3) % 4]).multiplyScalar(on ? 0.9 + kick * 0.3 : 0.25);
      tn.setColorAt(i, this.col);
    }
    tn.instanceColor!.needsUpdate = true;
  }

  /** MARINA DECK's extras: a swim-up bar, inflatables and candles on the water, sunset clouds, the night's stars. */
  private dressMarina() {
    const s = this.w.scene;
    // the swim-up bar in the pool's back corner: a round counter, a thatched roof, its neon
    const [bx, bz] = [-12.9, -8.4];
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.8, 1.2, 24), toon("#f4efe6", "#2a2018"));
    base.position.set(bx, 0.0, bz);
    s.add(base);
    outline(base, 0.04);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.98, 1.98, 0.16, 24), toon("#c98d55", "#2a1408"));
    top.position.set(bx, 0.66, bz);
    s.add(top);
    outline(top, 0.04);
    block("#8a5a34", 0.24, 2.2, 0.24, bx, 1.8, bz, s);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 0.9, 10), toon("#d9bc8a", "#3a2a10"));
    roof.position.set(bx, 3.3, bz);
    s.add(roof);
    outline(roof, 0.05);
    const neon = canvasTex(512, 128, (g) => {
      g.font = `900 58px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = "#ff5fa2";
      g.shadowBlur = 22;
      g.lineWidth = 6;
      g.strokeStyle = "#ff5fa2";
      g.strokeText("NULLIFIER", 256, 46);
      g.fillStyle = "#ffffff";
      g.fillText("NULLIFIER", 256, 46);
      g.font = `800 40px ${FONT}`;
      g.fillStyle = "#7dffe0";
      g.shadowColor = "#7dffe0";
      g.fillText("SOUR · BAR", 256, 100);
    });
    const nm = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: neon, transparent: true, depthWrite: false }));
    nm.scale.set(3.6, 0.9, 1);
    nm.position.set(bx, 2.45, bz + 2.0);
    s.add(nm);
    const bottles: [number, number, number, number, number, number, string][] = [];
    for (let i = 0; i < 7; i++) {
      const a = -0.4 + (i / 6) * 2.2 + Math.PI * 0.1;
      bottles.push([bx + Math.cos(a) * 1.55, 0.95, bz + Math.sin(a) * 1.55, 0.14, 0.45, 0.14, ["#7dffe0", "#ff5fa2", "#ffd166", "#ff8a5c"][i % 4]]);
    }
    this.many(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), bottles, lit(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    // inflatables drifting: two rings in the houses' colours, a beach ball
    const stripe = (a: string, b: string) =>
      canvasTex(
        256,
        32,
        (g) => {
          for (let i = 0; i < 8; i++) {
            g.fillStyle = i % 2 ? b : a;
            g.fillRect(i * 32, 0, 32, 32);
          }
        },
        true,
      );
    const ringGeo = new THREE.TorusGeometry(1.0, 0.38, 10, 28);
    const mk = (m: THREE.Mesh, x: number, z: number) => {
      m.position.set(x, 0.12, z);
      m.userData.at = [x, z, Math.random() * 6];
      s.add(m);
      outline(m, 0.04);
      this.floats.push(m);
    };
    const r1 = new THREE.Mesh(ringGeo, new THREE.MeshToonMaterial({ map: stripe("#ff6b35", "#fff3e0"), gradientMap: toonSteps() }));
    r1.rotation.x = -Math.PI / 2;
    mk(r1, -4.6, -7.8);
    const r2 = new THREE.Mesh(ringGeo, new THREE.MeshToonMaterial({ map: stripe("#c4b1fc", "#ffffff"), gradientMap: toonSteps() }));
    r2.rotation.x = -Math.PI / 2;
    mk(r2, 4.8, -8.4);
    const ball = new THREE.Mesh(GEO.ball, new THREE.MeshToonMaterial({ map: stripe("#ffd166", "#2fc6b8"), gradientMap: toonSteps() }));
    ball.scale.setScalar(1.1);
    mk(ball, 10.6, -6.4);
    // candles floating on the water round the island and along the edge
    const cs: [number, number, number, number, number, number, string][] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      cs.push([Math.cos(a) * 3.2, 0.1, -5.2 + Math.sin(a) * 3.2, 0.18, 0.24, 0.18, "#ffd9a0"]);
    }
    for (let i = 0; i < 12; i++) cs.push([-13.5 + i * 2.45, 0.1, -9.4, 0.18, 0.24, 0.18, "#ffd9a0"]);
    this.candles = this.many(GEO.box, cs, lit(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    // long clouds low over the bay, lit by the sunset (they darken with the night), and the stars coming out
    const cl: [number, number, number, number, number, number, string][] = [];
    for (let i = 0; i < 9; i++) cl.push([-160 + i * 40 + hash1(i) * 20, 14 + hash1(i + 3) * 22, -280 - hash1(i + 5) * 40, 34 + hash1(i + 7) * 30, 2.4 + hash1(i + 9) * 2, 6, "#ffffff"]);
    this.cloudMat = new THREE.MeshBasicMaterial({ color: "#ffb0a0", fog: false });
    this.many(GEO.box, cl, this.cloudMat);
    const st: [number, number, number, number, number, number, string][] = [];
    for (let i = 0; i < 70; i++) {
      const a = (hash1(i) - 0.5) * 2.6 - Math.PI / 2;
      const e = 0.25 + hash1(i + 99) * 0.6;
      const z2 = 0.6 + hash1(i + 7) * 0.7;
      st.push([Math.cos(a) * Math.cos(e) * 330, Math.sin(e) * 260, Math.sin(a) * Math.cos(e) * 330, z2, z2, z2, "#ffffff"]);
    }
    this.starMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.many(GEO.box, st, this.starMat);
  }

  /** A FESTIVAL's extras: market pavilions round the square, fire pits, ice lanterns, the moon, blown snow. */
  private dressAstana() {
    const s = this.w.scene;
    // the moon and its halo
    const halo = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: dotTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, color: "#7f98d8" }));
    halo.scale.set(80, 80, 1);
    halo.position.set(-95, 42, -235);
    s.add(halo);
    const moon = new THREE.Mesh(GEO.disc, lit(new THREE.MeshBasicMaterial({ color: "#eef4ff", fog: false }), 0.6));
    moon.scale.set(16, 16, 1);
    moon.position.set(-95, 42, -234);
    moon.lookAt(0, 5, 13);
    halo.lookAt(0, 5, 13);
    s.add(moon);
    // market pavilions round the square: candy-striped walls under a gold band, a roof, a lit door
    const felt = canvasTex(
      256,
      64,
      (g) => {
        g.fillStyle = "#f2ece0";
        g.fillRect(0, 0, 256, 64);
        g.fillStyle = "#c23a2e";
        for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 16, 64);
        g.fillStyle = "#ffcf5a";
        g.fillRect(0, 6, 256, 8);
      },
      true,
    );
    felt.repeat.set(3, 1);
    const yurts: [number, number, number][] = [
      [-12.2, -11.8, 1.0],
      [-16.0, -10.4, 1.15],
      [-19.8, -13.6, 1.3],
      [12.4, -12.0, 1.0],
      [16.2, -10.6, 1.15],
      [20.0, -13.8, 1.3],
    ];
    const walls: [number, number, number, number, number, number, string][] = [];
    const roofs: [number, number, number, number, number, number, string][] = [];
    const doors: [number, number, number, number, number, number, string, number][] = [];
    for (const [x, z, k] of yurts) {
      walls.push([x, -1.15 + 0.95 * k, z, 1.8 * k, 1.9 * k, 1.8 * k, "#ffffff"]);
      roofs.push([x, -1.15 + (1.9 + 0.6) * k, z, 2.05 * k, 1.3 * k, 2.05 * k, "#9a3a2a"]);
      const a = Math.atan2(-x, 13.6 - z);
      doors.push([x + Math.sin(a) * 0.9 * k, -1.15 + 0.6 * k, z + Math.cos(a) * 0.9 * k, 0.7 * k, 1.2 * k, 0.1, "#ffcf7a", a]);
    }
    this.many(new THREE.CylinderGeometry(0.5, 0.5, 1, 16), walls, new THREE.MeshToonMaterial({ map: felt, gradientMap: toonSteps(), emissive: "#1a1418" }));
    this.many(new THREE.ConeGeometry(0.5, 1, 16), roofs, toon("#ffffff", "#200804"));
    this.many(GEO.box, doors, lit(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    // fire pits by the stage: iron bowls, the flames are sparks
    this.pits = [
      [-9.7, -0.45, -2.6],
      [9.7, -0.45, -2.6],
    ];
    this.many(
      new THREE.CylinderGeometry(0.75, 0.45, 0.6, 12),
      this.pits.map(([x, y, z]) => [x, y - 0.1, z, 1, 1, 1, "#3a3440"]),
      toon("#ffffff", "#2a0e04"),
    );
    this.many(
      GEO.box,
      this.pits.map(([x, , z]) => [x, -0.95, z, 0.3, 0.5, 0.3, "#2a2a30"]),
    );
    // ice lanterns on the snow round the stage's front
    const ice: [number, number, number, number, number, number, string][] = [];
    for (let i = 0; i < 13; i++) {
      const a = Math.PI + 0.25 + (i / 12) * (Math.PI - 0.5);
      ice.push([Math.cos(a) * 8.85, -0.85, -2 - Math.sin(a) * 8.85, 0.5, 0.6, 0.5, "#ffffff"]);
    }
    this.iceL = this.many(GEO.box, ice, lit(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    // snow blowing low across the square
    this.hazeOf(22, -15, 15, 1, 9, -0.9, 3.2, "#cfe6ff", 0.06);
  }

  // ---- the rooms' builders' tools ------------------------------------------------------------------

  /** Many shapes of one kind in one draw: [x, y, z, sx, sy, sz, colour, turn y?]. */
  private many(geo: THREE.BufferGeometry, list: [number, number, number, number, number, number, string, number?][], mat: THREE.Material = toon("#ffffff")) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach(([x, y, z, w, h, d, c, ry], i) => {
      this.q.setFromAxisAngle(UP, ry ?? 0);
      this.m4.compose(this.v.set(x, y, z), this.q, this.sc.set(w, h, d));
      m.setMatrixAt(i, this.m4);
      m.setColorAt(i, this.col.set(c));
    });
    m.count = list.length;
    m.frustumCulled = false;
    this.w.scene.add(m);
    return m;
  }

  /** A sky dome whose three bands (top, middle, horizon) the level can change as the song goes. */
  private skyDome() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, low: { value: new THREE.Color() } },
      vertexShader: "varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader:
        "uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP; void main() { float h = vP.y; vec3 c = h > 0.06 ? mix(mid, top, smoothstep(0.06, 0.5, h)) : mix(low, mid, smoothstep(-0.1, 0.06, h)); gl_FragColor = vec4(c, 1.0); \n#include <colorspace_fragment>\n }",
      side: THREE.BackSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), this.skyMat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.w.scene.add(dome);
  }

  // ---- MARINA DECK: a rooftop pool over the bay, sunset turning to night -----------------------------

  private buildMarina() {
    const s = this.w.scene;
    const w = this.w;
    w.hemi.color.set("#ffd6c0");
    w.hemi.groundColor.set("#26386a");
    w.hemi.intensity = 1.25;
    w.sun.color.set("#ffb27a");
    w.sun.intensity = 1.5;
    w.sun.position.set(-40, 22, -60);
    this.keyLight!.color.set("#ffe2cc");
    this.rimL!.color.set("#ff8a6a");
    this.skyDome();
    // the setting sun and its glow, low over the bay
    const halo = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,236,190,1)");
      gr.addColorStop(0.25, "rgba(255,190,120,0.55)");
      gr.addColorStop(1, "rgba(255,120,90,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    this.sunDisc = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.sunDisc.scale.set(150, 150, 1);
    this.sunDisc.renderOrder = -9;
    s.add(this.sunDisc);
    // the city far below and round: a ring of towers rising past the roof, a nearer one below it, the bay
    skyline(s, { night: true, r: 170, n: 64, y: -46, tall: 1.6, rnd: this.rnd });
    skyline(s, { night: true, r: 105, n: 40, y: -52, tall: 0.8, rnd: this.rnd });
    block("#101a44", 600, 1, 600, 0, -54, 0, s, glow("#162457"));
    // the hotel we stand on: its tower under the deck (seen on the card's swing)
    const tower = canvasTex(
      64,
      128,
      (g) => {
        g.fillStyle = "#2c2f5a";
        g.fillRect(0, 0, 64, 128);
        for (let y = 4; y < 128; y += 8)
          for (let x = 3; x < 64; x += 8) {
            g.fillStyle = (x * 7 + y * 3) % 5 < 2 ? "#ffd9a0" : "#3d4478";
            g.fillRect(x, y, 5, 5);
          }
      },
      true,
    );
    tower.repeat.set(8, 6);
    const hotel = new THREE.Mesh(GEO.box, lit(new THREE.MeshBasicMaterial({ map: tower }), 0.4));
    hotel.scale.set(70, 60, 44);
    hotel.position.set(0, -32.6, -1);
    s.add(hotel);
    // the deck round the pool (the pool's back is the infinity edge: nothing but the drop)
    const deck: [number, number, number, number, number, number, string][] = [
      [-21.5, -1.15, -1, 13, 2.6, 22, "#c98d55"],
      [21.5, -1.15, -1, 13, 2.6, 22, "#c98d55"],
      [0, -1.15, 14.5, 56, 2.6, 11, "#c98d55"],
      // the coping, the pool's walls and floor
      [-15.4, 0.02, -0.75, 0.8, 0.3, 19.3, "#f4efe6"],
      [15.4, 0.02, -0.75, 0.8, 0.3, 19.3, "#f4efe6"],
      [0, 0.02, 9.0, 31.6, 0.3, 0.8, "#f4efe6"],
      [0, -1.12, -0.75, 30, 0.1, 19, "#0d4a66"],
      [0, -1.4, -10.2, 30.8, 2.6, 0.4, "#e8f6ff"],
      // the sun loungers along the back corners, their towels
      [-18.2, 0.42, -7.4, 1.0, 0.25, 2.3, "#ffffff"],
      [-20.0, 0.42, -7.4, 1.0, 0.25, 2.3, "#ffffff"],
      [18.2, 0.42, -7.4, 1.0, 0.25, 2.3, "#ffffff"],
      [20.0, 0.42, -7.4, 1.0, 0.25, 2.3, "#ffffff"],
      [-18.2, 0.58, -7.6, 0.8, 0.06, 1.6, "#ff6b35"],
      [-20.0, 0.58, -7.6, 0.8, 0.06, 1.6, "#2fc6b8"],
      [18.2, 0.58, -7.6, 0.8, 0.06, 1.6, "#ffd166"],
      [20.0, 0.58, -7.6, 0.8, 0.06, 1.6, "#ff5fa2"],
      // the DJ's booth on its island
      [0, 1.0, -5.0, 3.0, 1.1, 1.1, "#1d1838"],
      [0, 1.62, -5.0, 3.3, 0.14, 1.3, "#f4efe6"],
    ];
    const dk = this.many(GEO.box, deck);
    dk.raycast = () => {};
    // the deck's boards (teak planks, their joints), and the hotel's roof terrace round it: paving, the plant rooms
    // (the fly-over and a wide screen look down on them: boards and a roof, not a flat colour and a wall's windows)
    const planks = (rx: number, ry: number) => {
      const t = canvasTex(
        128,
        128,
        (g) => {
          for (let i = 0; i < 4; i++) {
            g.fillStyle = ["#cf9560", "#c0854f", "#d69c68", "#c68b56"][i];
            g.fillRect(0, i * 32, 128, 32);
            g.fillStyle = "rgba(70,36,12,0.4)";
            g.fillRect(0, i * 32 + 29, 128, 3);
            g.fillRect((i * 53 + 20) % 128, i * 32, 3, 29);
            g.fillStyle = "rgba(255,255,255,0.1)";
            g.fillRect(0, i * 32, 128, 3);
          }
        },
        true,
      );
      t.repeat.set(rx, ry);
      return new THREE.MeshToonMaterial({ map: t, gradientMap: toonSteps() });
    };
    for (const [x, z, w, d] of [
      [-21.5, -1, 13, 22],
      [21.5, -1, 13, 22],
      [0, 14.5, 56, 11],
    ]) {
      const top = new THREE.Mesh(GEO.plane, planks(w / 3.2, d / 3.2));
      top.rotation.x = -Math.PI / 2;
      top.scale.set(w, d, 1);
      top.position.set(x, 0.16, z);
      s.add(top);
    }
    const roofT = canvasTex(
      128,
      128,
      (g) => {
        g.fillStyle = "#3a3760";
        g.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 2; i++)
          for (let j = 0; j < 2; j++) {
            g.fillStyle = (i + j) % 2 ? "#444170" : "#403d68";
            g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
          }
      },
      true,
    );
    roofT.repeat.set(14, 9);
    const roofM = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: roofT, gradientMap: toonSteps(), emissive: "#120e24" }));
    roofM.rotation.x = -Math.PI / 2;
    roofM.scale.set(70.6, 44.6, 1);
    roofM.position.set(0, -2.55, -1);
    s.add(roofM);
    this.many(GEO.box, [
      [-31, -1.75, -17, 5, 1.6, 4, "#55527e"],
      [31, -1.75, -18, 5, 1.6, 4, "#55527e"],
      [-32, -1.95, 10, 3, 1.2, 6, "#4b4874"],
      [32, -1.95, 12, 3, 1.2, 6, "#4b4874"],
      [-24, -2.15, -19.5, 7, 0.8, 1.4, "#6a6794"],
      [24, -2.15, -19.5, 7, 0.8, 1.4, "#6a6794"],
    ]);
    // the DJ's island: a round platform in the water, a glowing rim
    const isl = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 1.5, 32), toon("#f4efe6", "#2a2018"));
    isl.position.set(0, -0.3, -5.2);
    s.add(isl);
    outline(isl, 0.04);
    block("#fff", 5.3, 0.06, 0.06, 0, 0.47, -4.42, s, glow("#7dffe0"));
    const islRim = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.07, 6, 40), glow("#7dffe0"));
    islRim.rotation.x = -Math.PI / 2;
    islRim.position.set(0, 0.03, -5.2);
    s.add(islRim);
    this.laserAt = [1.3, 1.75, -5.0, -0.32];
    this.lasers = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), 12);
    for (let i = 0; i < 12; i++) this.lasers.setColorAt(i, this.col.set(i % 3 === 0 ? "#7dffe0" : i % 3 === 1 ? "#ff5fa2" : "#ffd166"));
    this.lasers.frustumCulled = false;
    s.add(this.lasers);
    // the infinity edge: a line of light where the water spills over into the sky
    block("#fff", 30.4, 0.08, 0.14, 0, 0.03, -9.95, s, glow("#bffcff"));
    // the pool: its floor of lights under the water, the water, the ripples
    const xs: number[] = [];
    const zs: number[] = [];
    for (let z = -9.5; z <= 8.01; z += 1) for (let x = -14.5; x <= 14.51; x += 1) (xs.push(x), zs.push(z));
    this.makeTiles(xs, zs, -1.02, 0.9);
    const water = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ color: "#1aa6c4", transparent: true, opacity: 0.42, depthWrite: false }));
    water.rotation.x = -Math.PI / 2;
    water.scale.set(30, 19, 1);
    water.position.set(0, 0, -0.75);
    water.renderOrder = 1;
    s.add(water);
    this.ripTex = canvasTex(
      256,
      256,
      (g) => {
        g.strokeStyle = "rgba(255,255,255,0.5)";
        g.lineWidth = 2;
        for (let i = 0; i < 26; i++) {
          const x = (i * 97) % 256;
          const y = (i * 61) % 256;
          g.beginPath();
          g.ellipse(x, y, 16 + (i % 5) * 6, 5 + (i % 3) * 2, (i % 4) * 0.4, 0, Math.PI * 1.3);
          g.stroke();
        }
      },
      true,
    );
    this.ripTex.repeat.set(6, 4);
    const rip = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.ripTex, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    rip.rotation.x = -Math.PI / 2;
    rip.scale.set(30, 19, 1);
    rip.position.set(0, 0.01, -0.75);
    rip.renderOrder = 2;
    s.add(rip);
    // the supertrees: two on the pool's back corners, a grove far below in the gardens; trunks, a funnel
    // canopy of lattice (lit with the music), light strips up the trunks
    const trees: [number, number, number, number][] = [
      [-16.2, 0.15, -11.4, 8.0],
      [16.2, 0.15, -11.6, 8.3],
      [-44, -50, -52, 58],
      [-58, -50, -68, 50],
      [-36, -50, -74, 64],
      [48, -50, -72, 54],
    ];
    const trunk = new THREE.CylinderGeometry(0.45, 0.85, 1, 10);
    const cup = new THREE.CylinderGeometry(3.2, 0.55, 1.5, 14, 1, true);
    const tr: [number, number, number, number, number, number, string][] = [];
    const cps: [number, number, number, number, number, number, string][] = [];
    const strips: [number, number, number, number, number, number, string, number][] = [];
    trees.forEach(([x, y, z, h], i) => {
      const k = i < 2 ? 0.72 : h / 15;
      tr.push([x, y + h / 2, z, Math.max(k, 0.8), h, Math.max(k, 0.8), "#3a2a5a"]);
      cps.push([x, y + h + 0.6 * k, z, k, k, k, "#ffffff"]);
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * Math.PI * 2 + i;
        strips.push([x + Math.cos(a) * 0.62 * k, y + h * 0.55, z + Math.sin(a) * 0.62 * k, 0.09 * k, h * 0.8, 0.09 * k, "#ff5fa2", -a]);
      }
    });
    this.many(trunk, tr, toon("#ffffff", "#140c28"));
    this.many(cup, cps, new THREE.MeshToonMaterial({ color: "#5a3a7e", emissive: "#1a0c2a", side: THREE.DoubleSide, gradientMap: toonSteps() }));
    this.canopy = this.many(cup, cps.map(([x, y, z, a, b, c]) => [x, y + 0.02, z, a * 1.03, b * 1.04, c * 1.03, "#ff5fa2"]), new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.9 }));
    this.strips = this.many(GEO.box, strips, lit(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    // the moving heads hang under the near trees' canopies
    [-16.9, -15.5, 15.5, 16.9].forEach((x, i) => this.beam(x, 8.1, i < 2 ? -11.4 : -11.6, i * 1.7));
    // string lights from tree to tree over the pool, and down to the deck
    const bulbs: [number, number, number, number, number, number, string][] = [];
    const n = 34;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = -16.2 + u * 32.4;
      bulbs.push([x, 6.6 - Math.sin(u * Math.PI) * 2.8, -11.2, 0.22, 0.22, 0.22, "#fff"]);
    }
    for (const sx of [-1, 1])
      for (let i = 1; i < 12; i++) {
        const u = i / 12;
        bulbs.push([sx * (16.2 + u * 4), 6.6 - u * 4.4 - Math.sin(u * Math.PI) * 0.8, -11.2 + u * 7, 0.22, 0.22, 0.22, "#fff"]);
      }
    this.bulbs = this.many(GEO.ball, bulbs, lit(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    // palms and umbrellas on the deck's back corners
    const palm: [number, number, number, number, number, number, string, number][] = [];
    const leaf: [number, number, number, number, number, number, string, number][] = [];
    for (const [x, z, h] of [
      [-17.6, -9.6, 6.5],
      [17.8, -9.8, 7.2],
      [-23, -4, 6],
      [23.5, -3, 6.8],
    ]) {
      for (let j = 0; j < 6; j++) palm.push([x + Math.sin(j * 0.5) * 0.25, 0.15 + (j + 0.5) * (h / 6), z, 0.5, h / 6 + 0.04, 0.5, j % 2 ? "#8a5a34" : "#a0703f", j * 0.4]);
      for (let j = 0; j < 7; j++) {
        const a = (j / 7) * Math.PI * 2;
        leaf.push([x + Math.cos(a) * 1.4, h + 0.1 - 0.35, z + Math.sin(a) * 1.4, 3.0, 0.14, 0.75, j % 2 ? "#2f9a52" : "#3fb862", -a]);
      }
    }
    this.many(GEO.box, palm);
    this.many(GEO.box, leaf);
    const umb: [number, number, number, number, number, number, string, number][] = [
      [-19.1, 2.55, -4.6, 3.2, 1.0, 3.2, "#ff6b35", 0.3],
      [19.1, 2.55, -4.4, 3.2, 1.0, 3.2, "#2fc6b8", 0.5],
    ];
    this.many(GEO.cone, umb);
    this.many(GEO.box, [
      [-19.1, 1.1, -4.6, 0.12, 2.0, 0.12, "#f4efe6"],
      [19.1, 1.1, -4.4, 0.12, 2.0, 0.12, "#f4efe6"],
    ]);
    // the ZEC FLYER over the bay: a wheel of lights turning slowly
    this.wheel = new THREE.Group();
    this.wheel.position.set(-62, 10, -125);
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(19, 0.35, 6, 64), glow("#bfe6ff"));
    this.wheel.add(rim2);
    const spokes = new THREE.InstancedMesh(GEO.box, glow("#7fa8d8"), 16);
    const pods = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), 24);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI;
      this.q.setFromAxisAngle(this.v2.set(0, 0, 1), a);
      this.m4.compose(this.v.set(0, 0, 0), this.q, this.sc.set(0.18, 38, 0.18));
      spokes.setMatrixAt(i, this.m4);
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.m4.compose(this.v.set(Math.cos(a) * 19, Math.sin(a) * 19, 0), this.q.identity(), this.sc.set(1.6, 1.2, 1.2));
      pods.setMatrixAt(i, this.m4);
      pods.setColorAt(i, this.col.set(["#ffd166", "#ff5fa2", "#7dffe0"][i % 3]));
    }
    this.wheel.add(spokes, pods);
    s.add(this.wheel);
    this.many(GEO.box, [
      [-68, -22, -125, 1.4, 64, 1.4, "#3d4478", 0.0],
      [-56, -22, -125, 1.4, 64, 1.4, "#3d4478", 0.0],
    ]);
  }

  /** The pool deck as the song goes: the sun sets and the sky turns to night, the trees and the lights pulse, the wheel turns. */
  private tickMarina(dt: number, now: number, kick: number, hype: number) {
    const u = this.started ? clamp(now / this.k.end, 0, 1) : 0;
    const sm = this.skyMat!.uniforms;
    // (sunset → dusk → night)
    sm.top.value.copy(SKY_M[0]).lerp(SKY_M[3], u);
    sm.mid.value.copy(SKY_M[1]).lerp(SKY_M[4], u);
    sm.low.value.copy(SKY_M[2]).lerp(SKY_M[5], u);
    (this.w.scene.fog as THREE.Fog).color.copy(sm.low.value).lerp(sm.mid.value, 0.4);
    this.sunDisc!.position.set(-70, 26 - u * 40, -330);
    this.sunDisc!.quaternion.copy(this.w.camera.quaternion);
    this.w.sun.intensity = 1.5 - u * 0.9;
    this.w.hemi.intensity = 1.25 - u * 0.35;
    this.ripTex!.offset.x += dt * 0.02;
    this.ripTex!.offset.y += dt * 0.013;
    this.wheel!.rotation.z += dt * 0.05;
    // the canopies and the trunks' strips in the round's colours, on the kick
    const pal = this.lv.beam[this.part <= S_VERSE ? 0 : this.part === S_CHORUS ? 1 : 2];
    const bt = now / this.k.beat;
    for (let i = 0; i < 6; i++) {
      this.col.copy(pal[i % 2]).multiplyScalar(0.55 + 0.45 * kick * (0.5 + hype));
      this.canopy!.setColorAt(i, this.col);
      for (let j = 0; j < 6; j++) {
        const on = (Math.floor(bt * 2) + j) % 3 === 0;
        this.col.copy(pal[(i + j) % 2]).multiplyScalar(on ? 1 : 0.35);
        this.strips!.setColorAt(i * 6 + j, this.col);
      }
    }
    this.canopy!.instanceColor!.needsUpdate = true;
    this.strips!.instanceColor!.needsUpdate = true;
    this.chase(bt, hype, BULB_C);
    // the inflatables drift and bob, the candles float, the clouds lose the sun, the stars come out
    const t = this.clk;
    for (const f of this.floats) {
      const [x, z, ph] = f.userData.at as number[];
      f.position.set(x + Math.sin(t * 0.21 + ph) * 0.9, 0.12 + Math.sin(t * 1.7 + ph) * 0.06, z + Math.cos(t * 0.17 + ph) * 0.6);
      f.rotation.z += dt * 0.12;
    }
    const cd = this.candles!;
    for (let i = 0; i < cd.count; i++) {
      cd.getMatrixAt(i, this.m4);
      this.v.setFromMatrixPosition(this.m4);
      this.v.y = 0.1 + Math.sin(t * 1.9 + i) * 0.035;
      this.m4.setPosition(this.v);
      cd.setMatrixAt(i, this.m4);
      this.col.set("#ffd9a0").multiplyScalar(0.75 + 0.25 * Math.sin(t * 9 + i * 2.3));
      cd.setColorAt(i, this.col);
    }
    cd.instanceMatrix.needsUpdate = true;
    cd.instanceColor!.needsUpdate = true;
    this.cloudMat!.color.copy(CLOUD_M[0]).lerp(CLOUD_M[1], u);
    this.starMat!.opacity = clamp((u - 0.35) * 1.6, 0, 1);
    // the bathers splash on the downbeats when it's hot
    const b4 = Math.floor(bt / 2);
    if (this.started && hype > 0.55 && b4 !== this.splashBeat) {
      this.splashBeat = b4;
      const fig = this.crowd.fig;
      for (let k = 0; k < 3; k++) {
        const f = fig[Math.floor(Math.random() * fig.length)];
        this.fx.burst(this.v.set(f.x, 0.05, f.z), 6, ["#bff4ff", "#ffffff", "#5fd4e8"], { speed: 2.2, up: 3.2, size: 0.11, life: 0.6, gravity: 14 });
      }
    }
  }

  /** String lights chasing along their strings with the beat. */
  private chase(bt: number, hype: number, pal: string[]) {
    const b = this.bulbs!;
    const step = Math.floor(bt * 2);
    for (let i = 0; i < b.count; i++) {
      const on = (i + step) % 3 !== 0 || hype > 0.85;
      this.col.set(pal[(i >> 1) % pal.length]).multiplyScalar(on ? 1 : 0.3);
      b.setColorAt(i, this.col);
    }
    b.instanceColor!.needsUpdate = true;
  }

  // ---- WINTER FEST: Central Park, an ice stage under the bandstand's crown, snow ----------------------------------

  private buildAstana() {
    const s = this.w.scene;
    const w = this.w;
    w.hemi.color.set("#a8c0ff");
    w.hemi.groundColor.set("#2a2a48");
    w.hemi.intensity = 1.45;
    w.sun.color.set("#c4d6ff");
    w.sun.intensity = 0.85;
    w.sun.position.set(-30, 40, -20);
    this.keyLight!.color.set("#ffd8a8");
    this.keyLight!.intensity = 1.3;
    this.rimL!.color.set("#7fe3ff");
    // the night over the park: a dome of small stars and their milky band, snow clouds, the city's glow on the horizon (the fog's colour)
    this.nightSky = skyDome(s, { sky: this.lv.sky, stars: 480, band: true, clouds: 6, cloud: "#3a528c", cloudShade: "#22346a", haze: 0.5, rnd: rng(0xa57a) }).material as THREE.MeshBasicMaterial;
    // the bright stars (voxels, nearer than the dome's)
    const st: [number, number, number, number, number, number, string][] = [];
    for (let i = 0; i < 80; i++) {
      const a = hash1(i) * Math.PI * 2;
      const e = 0.15 + hash1(i + 99) * 0.7;
      const z = 0.3 + hash1(i + 7) * 0.5;
      st.push([Math.cos(a) * Math.cos(e) * 170, Math.sin(e) * 136, Math.sin(a) * Math.cos(e) * 170, z, z, z, "#ffffff"]);
    }
    this.many(GEO.box, st, lit(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 0.5));
    // the city, the snowy square, banks of snow
    skyline(s, { night: true, r: 150, n: 60, y: -1.15, tall: 0.8, rnd: this.rnd });
    block("#e6f0ff", 260, 1, 260, 0, -1.65, 0, s);
    const banks: [number, number, number, number, number, number, string, number][] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = 17 + hash1(i) * 6;
      const z = Math.sin(a) * r - 4;
      if (z > 8) continue;
      banks.push([Math.cos(a) * r * 1.2, -1.0, z, 2.5 + hash1(i + 3) * 3, 0.9 + hash1(i + 5), 2 + hash1(i + 9) * 2, i % 2 ? "#f4f8ff" : "#dbe8fa", a]);
    }
    this.many(GEO.box, banks);
    // the stage: a round ice disc, and behind on it a raised ring of ice (the second tier) round the back
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.3, 1.15, 48), toon("#bfe6ff", "#16324e"));
    disc.position.set(0, -0.575, -2);
    s.add(disc);
    outline(disc, 0.05);
    const ringT = new THREE.Mesh(new THREE.TorusGeometry(8.04, 0.07, 6, 64), glow("#7fe3ff"));
    ringT.rotation.x = -Math.PI / 2;
    ringT.position.set(0, 0.02, -2);
    s.add(ringT);
    const A0 = -0.3;
    const A1 = Math.PI + 0.3;
    const sh = new THREE.Shape();
    sh.absarc(0, 2, 8, A0, A1, false);
    sh.absarc(0, 2, 5.2, A1, A0, true);
    const tier = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 40 }), toon("#d8f2ff", "#16324e"));
    tier.rotation.x = -Math.PI / 2;
    s.add(tier);
    for (const r of [5.2, 8.0]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 6, 48, A1 - A0), glow(r < 6 ? "#ffd08a" : "#7fe3ff"));
      arc.rotation.set(-Math.PI / 2, 0, A0);
      arc.position.set(0, 1.02, -2);
      s.add(arc);
    }
    // the ice's lit tiles: on the disc in front of the ring, on the ring's top
    const xs: number[] = [];
    const zs: number[] = [];
    const ys: number[] = [];
    for (let z = -9.5; z <= 5.6; z += 1)
      for (let x = -7.5; x <= 7.51; x += 1) {
        const rx = x;
        const rz = -(z + 2);
        const r = Math.hypot(rx, rz);
        const a = Math.atan2(rz, rx);
        const inArc = a >= A0 || a <= A1 - Math.PI * 2;
        if (r < 4.9 || (r < 7.6 && !inArc)) (xs.push(x), zs.push(z), ys.push(0));
        else if (r > 5.6 && r < 7.6 && inArc) (xs.push(x), zs.push(z), ys.push(1.0));
      }
    this.makeTiles(xs, zs, ys, 0.86);
    // the bandstand's frame over the stage: the gold crown and its crossed bars, the roof ribs
    // down to the eave ring, the posts round the back, the drape hung behind
    const CZ = -2;
    const crown = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.26, 8, 40), toon("#ffcf5a", "#5a3a00"));
    crown.rotation.x = -Math.PI / 2;
    crown.position.set(0, 10.6, CZ);
    s.add(crown);
    outline(crown, 0.05);
    const wallRing = new THREE.Mesh(new THREE.TorusGeometry(8.7, 0.24, 8, 72), toon("#b8402e", "#3a0a04"));
    wallRing.rotation.x = -Math.PI / 2;
    wallRing.position.set(0, 6.6, CZ);
    s.add(wallRing);
    const bars: [number, number, number, number, number, number, string, number][] = [];
    for (const rot of [0, Math.PI / 2])
      for (const o of [-0.9, 0, 0.9]) bars.push([Math.cos(rot) * o, 10.62, CZ - Math.sin(rot) * o, 0.18, 0.18, 3.8 - Math.abs(o) * 0.9, "#ffcf5a", rot]);
    this.many(GEO.box, bars, toon("#ffffff", "#3a2600"));
    const NP = 24;
    const pm = new THREE.InstancedMesh(GEO.box, toon("#d9a066", "#2a1404"), NP + 9);
    for (let i = 0; i < NP; i++) {
      const a = (i / NP) * Math.PI * 2;
      const x0 = Math.cos(a) * 1.9,
        z0 = CZ - Math.sin(a) * 1.9,
        x1 = Math.cos(a) * 8.7,
        z1 = CZ - Math.sin(a) * 8.7;
      this.v.set((x0 + x1) / 2, (10.6 + 6.6) / 2, (z0 + z1) / 2);
      this.v2.set(x1 - x0, 6.6 - 10.6, z1 - z0);
      const len = this.v2.length();
      this.q.setFromUnitVectors(UP, this.v2.normalize());
      this.m4.compose(this.v, this.q, this.sc.set(0.14, len, 0.14));
      pm.setMatrixAt(i, this.m4);
    }
    // the wall posts round the back and sides (the front stays open)
    for (let i = 0; i < 9; i++) {
      const a = A0 - 0.05 + (i / 8) * (A1 - A0 + 0.1);
      this.m4.compose(this.v.set(Math.cos(a) * 8.7, 2.7, CZ - Math.sin(a) * 8.7), this.q.identity(), this.sc.set(0.32, 7.8, 0.32));
      pm.setMatrixAt(NP + i, this.m4);
    }
    pm.frustumCulled = false;
    s.add(pm);
    // the drape behind: deep red, a band of gold ⓩ marks, the festival's name
    const felt = canvasTex(2048, 512, (g) => {
      g.fillStyle = "#7a1c1c";
      g.fillRect(0, 0, 2048, 512);
      g.fillStyle = "#8f2622";
      for (let x = 0; x < 2048; x += 64) g.fillRect(x, 0, 32, 512);
      const band = (y: number) => {
        g.fillStyle = "#3a0c0c";
        g.fillRect(0, y - 34, 2048, 68);
        for (let x = 40; x < 2048; x += 80) drawMark(g, x, y, 58, "#ffcf5a", "#ffcf5a");
      };
      band(60);
      band(452);
      g.font = `900 120px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      for (const x of [420, 1628]) {
        g.lineWidth = 14;
        g.strokeStyle = "#2a0606";
        g.strokeText("WINTER FEST", x, 230);
        g.fillStyle = "#ffe2a0";
        g.fillText("WINTER FEST", x, 230);
        g.font = `800 56px ${FONT}`;
        g.fillStyle = "#ffcf5a";
        g.fillText("CENTRAL PARK · 冬季音乐节", x, 330);
        g.font = `900 120px ${FONT}`;
      }
    });
    // (seen from inside the arc: the picture flipped to read left to right)
    felt.wrapS = THREE.RepeatWrapping;
    felt.repeat.x = -1;
    const feltM = new THREE.Mesh(new THREE.CylinderGeometry(8.55, 8.55, 5.4, 40, 1, true, Math.PI - 1.35, 2.7), new THREE.MeshToonMaterial({ map: felt, side: THREE.DoubleSide, gradientMap: toonSteps(), emissive: "#2a0808" }));
    feltM.position.set(0, 3.9, CZ);
    s.add(feltM);
    // lanterns round the wall ring, strings of them down to the square
    const lan: [number, number, number, number, number, number, string][] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      // (none over the front, right over the camera)
      if (Math.sin(a) < -0.35) continue;
      lan.push([Math.cos(a) * 8.75, 6.2, CZ - Math.sin(a) * 8.75, 0.24, 0.3, 0.24, "#fff"]);
    }
    for (const sx of [-1, 1])
      for (let i = 1; i <= 12; i++) {
        const u = i / 13;
        lan.push([sx * (8.2 + u * 9), 6.3 - u * 5.4 - Math.sin(u * Math.PI) * 1.2, 2.2 + u * 3, 0.3, 0.36, 0.3, "#fff"]);
      }
    this.bulbs = this.many(GEO.ball, lan, lit(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    // the moving heads on the wall ring
    [-0.25, 0.35, 1.1, 2.05, 2.8, 3.4].forEach((a, i) => this.beam(Math.cos(a) * 8.4, 6.2, CZ - Math.sin(a) * 8.4, i * 1.4));
    // fir trees with lights on the square's sides
    const tiers: [number, number, number, number, number, number, string][] = [];
    const lights: [number, number, number, number, number, number, string][] = [];
    const firs: [number, number, number][] = [
      [-11.5, -5.5, 5.5],
      [-13.8, -1.0, 4.4],
      [-12.0, 3.4, 3.6],
      [11.6, -5.8, 5.8],
      [13.6, -1.4, 4.6],
      [12.2, 3.0, 3.8],
      [-17, -10, 7],
      [17.5, -11, 7.5],
    ];
    firs.forEach(([x, z, h], i) => {
      for (let t = 0; t < 3; t++) tiers.push([x, -1.15 + h * (0.28 + t * 0.26), z, h * (0.5 - t * 0.12), h * 0.42, h * (0.5 - t * 0.12), t === 2 ? "#e8f4ff" : t ? "#2a6a52" : "#1f5a46"]);
      for (let j = 0; j < 9; j++) {
        const a = j * 2.4 + i;
        const yy = 0.2 + (j / 9) * 0.65;
        const rr2 = h * 0.5 * (1 - yy) * 0.95;
        lights.push([x + Math.cos(a) * rr2, -1.15 + h * yy, z + Math.sin(a) * rr2, 0.16, 0.16, 0.16, "#fff"]);
      }
    });
    this.many(new THREE.ConeGeometry(1, 1, 8), tiers);
    this.firLights = this.many(GEO.ball, lights, lit(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    // two ice sculptures of the ⓩ mark at the stage's front corners (a ring, the Z and its two ticks)
    const ice = new THREE.MeshToonMaterial({ color: "#9fe4ff", emissive: "#2a6a9a", transparent: true, opacity: 0.82, gradientMap: toonSteps() });
    const qGeo = new THREE.TorusGeometry(1.15, 0.22, 10, 32);
    for (const sx of [-1, 1]) {
      const yaw = sx * -0.25;
      const [qx, qz] = [sx * 10.6, -4.6];
      const q = new THREE.Mesh(qGeo, ice);
      q.position.set(qx, 0.85, qz);
      q.rotation.set(0, yaw, 0);
      s.add(q);
      outline(q, 0.04, "#2f6f9f");
      // (the Z: two bars and the diagonal between their ends, a tick above and below, in the ring's plane)
      const zg = new THREE.Group();
      zg.position.set(qx, 0.85, qz);
      zg.rotation.y = yaw;
      s.add(zg);
      for (const [w, h, y, rz] of [
        [1.12, 0.27, 0.455, 0],
        [1.12, 0.27, -0.455, 0],
        [1.25, 0.25, 0, Math.atan2(0.91, 0.86)],
        [0.22, 0.3, 0.74, 0],
        [0.22, 0.3, -0.74, 0],
      ]) {
        const bar = block("#9fe4ff", w, h, 0.3, 0, y, 0, zg, ice);
        bar.rotation.z = rz;
        outline(bar, 0.04, "#2f6f9f");
      }
      block("#9fe4ff", 2.6, 0.5, 1.4, qx, -0.95, qz, s, toon("#cfeeff"));
    }
    // the far city's landmarks: the NU7 TOWER holding its green sphere, the ZK MALL's great tilted tent
    const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.3, 17, 12), toon("#f2f4f8", "#20283a"));
    bt.position.set(25, 7.35, -60);
    s.add(bt);
    const crownB = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 0.7, 4, 14, 1, true), new THREE.MeshToonMaterial({ color: "#f2f4f8", side: THREE.DoubleSide, gradientMap: toonSteps(), emissive: "#20283a" }));
    crownB.position.set(25, 17.6, -60);
    s.add(crownB);
    const orb = new THREE.Mesh(GEO.ball, toon("#3ee08f", "#0a5a30"));
    orb.scale.setScalar(4.2);
    orb.position.set(25, 19.9, -60);
    s.add(orb);
    const orbGlow = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: dotTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: "#3ee08f" }));
    orbGlow.scale.set(14, 14, 1);
    orbGlow.position.set(25, 19.9, -59);
    orbGlow.lookAt(0, 5, 13.6);
    s.add(orbGlow);
    const tent = new THREE.Mesh(new THREE.ConeGeometry(13, 30, 24, 1, true), new THREE.MeshBasicMaterial({ color: "#7fb4e0", transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    tent.position.set(-32, 13.85, -74);
    tent.rotation.z = 0.14;
    s.add(tent);
    const tentW = new THREE.Mesh(tent.geometry, new THREE.MeshBasicMaterial({ color: "#d8f0ff", wireframe: true }));
    tentW.position.copy(tent.position);
    tentW.rotation.copy(tent.rotation);
    s.add(tentW);
    // the snow: flakes falling, blown sideways (hard in a WHITEOUT)
    const NS = 280;
    this.snow = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }), NS);
    this.snow.frustumCulled = false;
    this.flakes = new Float32Array(NS * 4);
    for (let i = 0; i < NS; i++) {
      this.flakes[i * 4] = -20 + hash1(i) * 40;
      this.flakes[i * 4 + 1] = -1 + hash1(i + 500) * 15;
      this.flakes[i * 4 + 2] = -12 + hash1(i + 900) * 24;
      this.flakes[i * 4 + 3] = 0.8 + hash1(i + 1300) * 1.2;
    }
    s.add(this.snow);
  }

  /** The festival as the song goes: snow (a squall: blown hard, the air white), the lanterns and the firs' lights on the beat. */
  private tickAstana(dt: number, now: number, kick: number, hype: number) {
    this.squall += (this.frost - this.squall) * Math.min(1, dt * 2.5);
    const sq = this.squall;
    const fog = this.w.scene.fog as THREE.Fog;
    fog.near = 45 - sq * 34;
    fog.far = 210 - sq * 150;
    fog.color.copy(FOG_A[0]).lerp(FOG_A[1], sq);
    // (the sky goes with the air: pale in a squall, as the far ground does in its fog)
    this.nightSky?.color.setRGB(1 + sq * 3.2, 1 + sq * 3.4, 1 + sq * 2.6);
    const f = this.flakes!;
    const wind = 1.2 + sq * 13;
    const n = f.length / 4;
    for (let i = 0; i < n; i++) {
      let x = f[i * 4] + (wind + Math.sin(this.clk * 0.7 + i) * 0.6) * dt;
      let y = f[i * 4 + 1] - f[i * 4 + 3] * (1 + sq) * dt;
      if (y < -1.1) y += 15;
      if (x > 20) x -= 40;
      f[i * 4] = x;
      f[i * 4 + 1] = y;
      this.m4.compose(this.v.set(x, y, f[i * 4 + 2]), this.q.identity(), this.sc.set(0.08 + sq * 0.6, 0.08, 0.08));
      this.snow!.setMatrixAt(i, this.m4);
    }
    this.snow!.instanceMatrix.needsUpdate = true;
    const bt = now / this.k.beat;
    this.chase(bt, hype, LANTERN_C);
    const fl = this.firLights!;
    for (let i = 0; i < fl.count; i++) {
      const on = (i + Math.floor(bt)) % 4 !== 0;
      this.col.set(i % 3 ? "#ffd08a" : "#7fe3ff").multiplyScalar(on ? 0.6 + 0.4 * kick : 0.25);
      fl.setColorAt(i, this.col);
    }
    fl.instanceColor!.needsUpdate = true;
    const il = this.iceL!;
    for (let i = 0; i < il.count; i++) {
      this.col.set(i % 2 ? "#bff0ff" : "#ffe0b0").multiplyScalar(0.7 + 0.3 * Math.sin(this.clk * 3 + i * 1.3) + kick * 0.2);
      il.setColorAt(i, this.col);
    }
    il.instanceColor!.needsUpdate = true;
  }

  /** The pads: a base (the club's dark slab, a disc afloat, an ice hexagon), a rim of the seat's colour, five lit panels (one draw for the arrows, one for the hubs). */
  private buildPads() {
    const s = this.w.scene;
    const padTex = canvasTex(128, 128, (g) => {
      g.fillStyle = "#1c1730";
      rr(g, 6, 6, 116, 116, 22);
      g.fill();
      g.translate(64, 66);
      arrowPath(g, 92);
      g.fillStyle = "#ffffff";
      g.fill();
    });
    const hubTex = canvasTex(128, 128, (g) => {
      g.fillStyle = "#1c1730";
      rr(g, 6, 6, 116, 116, 22);
      g.fill();
      g.font = `900 92px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ffffff";
      g.fillText("#", 64, 70);
    });
    this.panels = new THREE.InstancedMesh(GEO.plane, lit(new THREE.MeshBasicMaterial({ map: padTex }), 0.8), 16);
    this.hubs = new THREE.InstancedMesh(GEO.plane, lit(new THREE.MeshBasicMaterial({ map: hubTex }), 0.8), 4);
    const flat = this.q2.setFromEuler(this.eu.set(-Math.PI / 2, 0, 0));
    // (◀ ▼ ▲ ▶: where the panel sits on the pad, the arrow's turn)
    const SPOT: [number, number, number][] = [
      [-0.78, 0, Math.PI / 2],
      [0, 0.78, Math.PI],
      [0, -0.78, 0],
      [0.78, 0, -Math.PI / 2],
    ];
    const key = this.lv.key;
    const disc = key === "marina" ? new THREE.CylinderGeometry(1.55, 1.4, 1, 28) : key === "astana" ? new THREE.CylinderGeometry(1.62, 1.62, 1, 6) : null;
    this.lv.pads.forEach(([px, pz, py], i) => {
      const rim = glow(this.players[i]?.color ?? "#fff");
      if (!disc) {
        const slab = block("#18142b", 2.5, py, 2.5, px, py / 2, pz, s);
        outline(slab, 0.04);
        block("#fff", 2.72, 0.1, 2.72, px, 0.06, pz, s, rim);
      } else {
        // a disc afloat on the pool (its glowing rim at the water), an ice hexagon on the stage's tier
        const h = key === "marina" ? 0.5 : 0.34;
        const base = new THREE.Mesh(disc, toon(key === "marina" ? "#f4efe6" : "#cfeeff", key === "marina" ? "#2a2018" : "#183a5a"));
        base.scale.set(1, h, 1);
        base.position.set(px, py - h / 2, pz);
        if (key === "astana") base.rotation.y = Math.PI / 6;
        s.add(base);
        outline(base, 0.04);
        const top = new THREE.Mesh(disc, toon("#1c1730"));
        top.scale.set(0.92, 0.02, 0.92);
        top.position.set(px, py + 0.001, pz);
        if (key === "astana") top.rotation.y = Math.PI / 6;
        s.add(top);
        const ring = new THREE.Mesh(disc, rim);
        ring.scale.set(1.09, 0.08, 1.09);
        ring.position.set(px, key === "marina" ? 0.02 : py - h + 0.12, pz);
        if (key === "astana") ring.rotation.y = Math.PI / 6;
        s.add(ring);
      }
      for (let d = 0; d < 4; d++) {
        const [ox, oz, yaw] = SPOT[d];
        this.q.setFromAxisAngle(this.v2.set(0, 1, 0), yaw).multiply(flat);
        this.m4.compose(this.v.set(px + ox, py + 0.012, pz + oz), this.q, this.sc.set(0.8, 0.8, 1));
        this.panels.setMatrixAt(i * 4 + d, this.m4);
        this.panels.setColorAt(i * 4 + d, this.col.set("#444"));
      }
      this.m4.compose(this.v.set(px, py + 0.012, pz), flat, this.sc.set(0.74, 0.74, 1));
      this.hubs.setMatrixAt(i, this.m4);
      this.hubs.setColorAt(i, this.col.set("#444"));
    });
    s.add(this.panels, this.hubs);
  }

  /** The crowd in front (the club's below the stage, the pool's waist-deep in the water, the festival's in the snow): blocky silhouettes, some with glow sticks (four draws). */
  private buildCrowd() {
    const s = this.w.scene;
    const key = this.lv.key;
    const N = key === "marina" ? 30 : 46;
    // (where they stand: rows from z0, a row apart, their feet at y)
    const [z0, dz, w] = key === "marina" ? [5.3, 1.25, 27] : key === "astana" ? [6.2, 1.25, 28] : [5.3, 1.25, 26];
    this.crowdY = key === "marina" ? -0.88 : key === "astana" ? -1.15 : -1.4;
    const fig: { x: number; z: number; s: number; ph: number; stick: boolean; lean: number }[] = [];
    for (let i = 0; i < N; i++) {
      const row = i % 3;
      fig.push({ x: -w / 2 + ((i * w) / N + this.rnd() * 0.5), z: z0 + row * dz + this.rnd() * 0.4, s: 0.9 + this.rnd() * 0.25, ph: this.rnd() * Math.PI * 2, stick: this.rnd() < 0.4, lean: (this.rnd() - 0.5) * 0.2 });
    }
    const body = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), N);
    const head = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), N);
    const arm = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), N * 2);
    const stick = new THREE.InstancedMesh(GEO.box, lit(new THREE.MeshBasicMaterial({ color: 0xffffff })), N);
    const shirts =
      key === "marina"
        ? ["#ff8a5c", "#2fc6b8", "#ffd166", "#ff5fa2", "#59c8ff", "#f4efe6"]
        : key === "astana"
          ? ["#b8322a", "#2f5fa8", "#e8dcc4", "#3a7a5a", "#7a3fa0", "#d98a2b"]
          : ["#2a2150", "#421d36", "#1b2f46", "#21422c", "#43291a", "#30204c"];
    // (at the festival: fur hats over the faces' fur)
    const furs = key === "astana" ? ["#5a3a28", "#e8e2d8", "#3a2a22", "#8a6a4a", "#2a2a30"] : ["#4a3328", "#5e3e2a", "#33241c", "#6e4c36", "#402c22"];
    const sticks = key === "astana" ? ["#ffd08a", "#7fe3ff", "#ffffff", "#ffb347", "#b48cff"] : [ACCENT, "#59e6ff", "#b48cff", "#9cff6e", "#ff5fa2"];
    for (let i = 0; i < N; i++) {
      body.setColorAt(i, this.col.set(shirts[i % shirts.length]));
      head.setColorAt(i, this.col.set(furs[(i * 7) % furs.length]));
      arm.setColorAt(i * 2, this.col.set(furs[(i * 7) % furs.length]));
      arm.setColorAt(i * 2 + 1, this.col.set(furs[(i * 7) % furs.length]));
      stick.setColorAt(i, this.col.set(sticks[i % sticks.length]));
    }
    for (const m of [body, head, arm, stick]) (m.frustumCulled = false), s.add(m);
    this.crowd = { body, head, arm, stick, fig };
  }

  // ---- the clock ---------------------------------------------------------------------------------

  /** What the speakers play now, on the AudioContext clock: music.ts's beat clock (its output latency taken off), else the context's own. */
  private heard(ac: AudioContext) {
    const b = music.beat();
    return b ? b.now : ac.currentTime - (ac.outputLatency || ac.baseLatency || 0);
  }

  /** Start the song at this step (0: from the top): the clock follows the audio if it plays. */
  private playFrom(step: number) {
    const a = sound();
    music.play(songFrom(this.tune, this.comp, step));
    const p = perfNow();
    this.musicT0 = -1;
    if (!a || a.ac.state !== "running") return false;
    // (music.ts's beat grid: its beat 0 is this step)
    const b = music.beat();
    const t0 = b && isFinite(b.t0) ? b.t0 : a.ac.currentTime + 0.06;
    this.musicT0 = t0;
    this.t0a = t0 - step * this.k.step;
    this.audio = true;
    this.lastCT = a.ac.currentTime;
    this.ctStill = 0;
    this.off = this.heard(a.ac) - this.t0a - p;
    return true;
  }

  private start() {
    this.started = true;
    this.live = true;
    const p = perfNow();
    this.lastP = p;
    if (!this.playFrom(0)) {
      this.audio = false;
      this.off = -(p + 0.06);
    }
    this.resyncAt = p + 0.5;
  }

  /** Keep the clock on the audio; on the wall when the audio stops; back on the audio (the song restarted at the right step) when it plays again. */
  private tickClock(p: number) {
    const a = sound();
    if (this.audio) {
      if (!a || a.ac.state !== "running") {
        this.audio = false;
        return;
      }
      const ct = a.ac.currentTime;
      if (ct === this.lastCT) {
        this.ctStill += p - this.lastP;
        if (this.ctStill > 0.3) this.audio = false;
        return;
      }
      this.ctStill = 0;
      this.lastCT = ct;
      // (no beat: the music stopped; the wall clock, and the check below brings the song back)
      const b = music.beat();
      if (!b) {
        this.audio = false;
        this.lastCT = -1;
        return;
      }
      // the chart on the music's own heard clock (eased: the context's clock moves in steps)
      const target = b.now - this.t0a - p;
      const d = target - this.off;
      if (Math.abs(d) > 0.08) this.off = target;
      else this.off += d * Math.min(1, (p - this.lastP) * 1.5);
      // the music slipped off the chart's grid (it skipped a stall, it was muted): back on it at the right step
      const now = p + this.off;
      if (p >= this.resyncAt && this.musicT0 > 0 && now > 0 && now < this.k.end - 1.5 && Math.abs(b.t0 - this.musicT0) > 0.04) {
        this.resyncAt = p + 0.5;
        this.playFrom(Math.max(1, Math.round((now + 0.08) / this.k.step)));
      }
    } else if (p >= this.resyncAt) {
      this.resyncAt = p + 0.5;
      if (!a || a.ac.state !== "running") {
        this.lastCT = -1;
        return;
      }
      const ct = a.ac.currentTime;
      const moving = this.lastCT >= 0 && ct > this.lastCT;
      this.lastCT = ct;
      const now = p + this.off;
      if (!moving || now > this.k.end - 1.5 || now < 0) return;
      // the sound is back: the song from the next step, and the chart onto its clock
      this.playFrom(Math.max(1, Math.round((now + 0.08) / this.k.step)));
    }
  }

  private songNow(p: number) {
    return this.clockFn ? this.clockFn() : p + this.off;
  }

  // ---- the input -----------------------------------------------------------------------------------

  private listen() {
    const push = (b: number, ms: number) => {
      if (!this.live || this.evN >= 64) return;
      const now = performance.now();
      this.evB[this.evN] = b;
      this.evT[this.evN] = Math.abs(ms - now) < 1000 ? ms : now;
      this.evN++;
    };
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const b = KEYS[e.code];
      if (b === undefined || (e.target as HTMLElement | null)?.closest?.("input,textarea")) return;
      push(b, e.timeStamp);
    };
    const pd = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-pad]") as HTMLElement | null;
      const b = el ? PAD_B[el.dataset.pad ?? ""] : undefined;
      if (b !== undefined) push(b, e.timeStamp);
    };
    window.addEventListener("keydown", kd, true);
    document.addEventListener("pointerdown", pd, true);
    this.offs.push(
      () => window.removeEventListener("keydown", kd, true),
      () => document.removeEventListener("pointerdown", pd, true),
    );
  }

  /** The visitor's presses this frame, at their own time (stamped ones first; the pad's others now). */
  private humanInput(input: Input, p: number) {
    const h = this.human;
    if (h < 0) return;
    let seen = 0;
    if (!this.clockFn)
      for (let k = 0; k < this.evN; k++) {
        const ms = this.evT[k];
        if (p * 1000 - ms > 600) continue;
        seen |= 1 << this.evB[k];
        this.press(h, this.evB[k], ms / 1000 + this.off);
      }
    this.evN = 0;
    for (let b = 0; b < 5; b++) if (input.pressed(BTN[b]) && !(seen & (1 << b))) this.press(h, b, this.now);
  }

  /** What this player must press for note i. */
  private need(i: number, s: number) {
    const x = this.scr[i * 4 + s];
    return x >= 0 ? x : this.ch.dir[i];
  }

  /** A press of button b at song time t by seat s (the visitor; the AIs judge their planned notes directly). */
  private press(s: number, b: number, t: number) {
    const d = this.dn[s];
    d.lit[b] = 1;
    if (s === this.laneSeat) this.recep[b] = 1;
    const tj = t - (d.human ? this.cal : 0);
    let cand = -1;
    for (let i = d.head; i < this.ch.n; i++) {
      const dt = tj - this.ch.t[i];
      if (dt < -W_GOOD) break;
      if (this.res[i * 4 + s] !== PENDING || dt > W_GOOD) continue;
      if (this.need(i, s) === b) {
        if (d.human) this.learn(t - this.ch.t[i]);
        this.judge(i, s, dt);
        return;
      }
      if (cand < 0 && Math.abs(dt) <= W_GREAT) cand = i;
    }
    // a wrong step right on a note: a miss (mashing never pays)
    if (cand >= 0) this.miss(cand, s);
    else this.pose(d, b, 0.5);
  }

  /** The visitor's steady lag, learnt slowly from the hits (±80 ms at most). */
  private learn(raw: number) {
    this.calN++;
    if (this.calN < 6) return;
    this.cal = clamp(this.cal + (raw - this.cal) * 0.12, -0.08, 0.08);
  }

  // ---- the judging ---------------------------------------------------------------------------------

  private mult(d: Dancer) {
    return this.feverSeat === d.seat ? 4 : d.combo >= 20 ? 3 : d.combo >= 10 ? 2 : 1;
  }

  private judge(i: number, s: number, dt: number) {
    const d = this.dn[s];
    const a = Math.abs(dt);
    const j = a <= W_PERFECT ? PERFECT : a <= W_GREAT ? GREAT : GOOD;
    this.res[i * 4 + s] = j;
    d.n[j - 1]++;
    d.combo++;
    d.best = Math.max(d.best, d.combo);
    const hash = this.ch.dir[i] === HASH;
    this.fever();
    d.score += PTS[j] * (hash ? 2 : 1) * this.mult(d);
    d.pop = j;
    d.popT = this.clk;
    const b = this.need(i, s);
    this.pose(d, b, 1);
    // a long note: now hold it to its tail
    if (this.ch.len[i] > 0 && !hash) {
      this.hold[i * 4 + s] = H_ON;
      d.holding = i;
      d.hgap = 0;
    }
    if (s === this.laneSeat) {
      this.jPop = j;
      this.jPopT = this.clk;
      this.jEarly = dt < -W_PERFECT ? -1 : dt > W_PERFECT ? 1 : 0;
      this.flash[b] = 1;
      this.flashC[b] = J_C[j];
    }
    if (d.human) {
      if (hash) this.clap();
      else if (j === PERFECT) this.tick(2400, 0.07);
      else this.tick(1800, 0.05);
      if (d.combo % 10 === 0) sfx.blip(Math.min(6, d.combo / 10));
    }
    // fx on the pad
    if (hash) {
      this.fx.burst(this.v.set(d.px, 1.2, d.pz), 18, [this.players[s].color, "#ffffff", ACCENT], { speed: 5, up: 6, size: 0.16 });
      if (d.human) this.cam.shake(0.12);
    } else if (j === PERFECT && d.combo >= 10) this.fx.burst(this.v.set(d.px, d.py + 0.3, d.pz), 6, [this.players[s].color, "#ffffff"], { speed: 3, up: 3, size: 0.1, life: 0.5 });
    else this.fx.burst(this.v.set(d.px, d.py + 0.2, d.pz), j === PERFECT ? 4 : 2, [this.players[s].color, "#ffffff"], { speed: 2.4, up: 2.4, size: 0.08, life: 0.4 });
    if (d.combo > 0 && d.combo % SAB_EVERY === 0) this.sabotage(s);
  }

  private miss(i: number, s: number) {
    const d = this.dn[s];
    if (this.res[i * 4 + s] !== PENDING) return;
    this.res[i * 4 + s] = MISS;
    d.n[3]++;
    const was = d.combo;
    d.combo = 0;
    if (this.feverSeat === s) this.fever();
    d.pop = MISS;
    d.popT = this.clk;
    d.stumble = 1;
    d.pose = -1;
    d.a.hit();
    d.a.angry = true;
    this.fx.burst(this.v.set(d.px, 0.4, d.pz), 8, ["#8a8784", "#5a566e"], { speed: 2.5, up: 2, size: 0.14, life: 0.6 });
    if (s === this.laneSeat) {
      this.jPop = MISS;
      this.jPopT = this.clk;
      this.laneShake = 1;
    }
    if (d.human) {
      this.scratch();
      if (was >= 10) this.cam.shake(0.18);
    }
  }

  /** HASH FEVER: the best live combo from 30, kept by its holder until a longer one or a miss. */
  private fever() {
    let best = -1;
    let bc = FEVER_AT - 1;
    const cur = this.feverSeat;
    if (cur >= 0 && this.dn[cur].combo >= FEVER_AT) ((best = cur), (bc = this.dn[cur].combo));
    for (const d of this.dn) if (d.combo > bc) ((best = d.seat), (bc = d.combo));
    if (best === cur) return;
    this.feverSeat = best;
    if (best < 0) return;
    const d = this.dn[best];
    d.pop = 8;
    d.popT = this.clk;
    this.fx.burst(this.v.set(d.px, 2.2, d.pz), 40, [ACCENT, "#ffffff", "#ff3d5a", "#ffb08a"], { speed: 7, up: 7 });
    if (d.human) sfx.star();
    this.roar(0.7);
  }

  /** 20 in a row: scramble the next arrows of the best-scoring rival (once a round each). */
  private sabotage(s: number) {
    const d = this.dn[s];
    const now = this.now;
    const round = this.part <= S_VERSE ? 0 : this.part === S_CHORUS ? 1 : 2;
    if (d.sab & (1 << round)) return;
    let tgt = -1;
    for (const o of this.dn) {
      if (o.seat === s || o.scrTo > now - 2 * this.k.bar) continue;
      if (tgt < 0 || o.score > this.dn[tgt].score) tgt = o.seat;
    }
    if (tgt < 0) return;
    let k = 0;
    let first = -1;
    let last = -1;
    for (let i = this.dn[tgt].head; i < this.ch.n && k < SAB_N; i++) {
      if (this.ch.t[i] < now + SAB_LEAD || this.ch.dir[i] === HASH || this.res[i * 4 + tgt] !== PENDING) continue;
      // (never the arrow it was)
      this.scr[i * 4 + tgt] = (this.ch.dir[i] + 1 + Math.floor(this.rnd() * 3)) % 4;
      if (first < 0) first = i;
      last = i;
      k++;
    }
    if (k === 0) return;
    d.sab |= 1 << round;
    const o = this.dn[tgt];
    o.scrFrom = this.ch.t[first];
    o.scrTo = this.ch.t[last];
    d.pop = 6;
    d.popT = this.clk;
    o.pop = 7;
    o.popT = this.clk + 0.45;
    const orb = this.orbs.find((x) => x.t < 0);
    if (orb) {
      orb.from = s;
      orb.to = tgt;
      orb.t = 0;
      orb.m.visible = true;
    }
    if (d.human || o.human) this.zap(d.human);
  }

  /** The AIs: each note decided a little before it (three draws a note whatever the outcome: a seed gives the same game), pressed at its time. */
  private ai() {
    const ch = this.ch;
    while (this.planned < ch.n && ch.t[this.planned] < this.now + HORIZON) {
      const i = this.planned++;
      for (const d of this.dn) {
        if (d.human) continue;
        const k = d.p.skill;
        const part = ch.part[i];
        let p = 0.74 + 0.21 * k;
        if (part === S_CHORUS) p -= 0.05 * (1 - k);
        else if (part >= S_FINAL) p -= 0.12 * (1 - k);
        if (ch.dir[i] === HASH) p += 0.04;
        p -= d.slump * 0.3 * (1 - k);
        const scr = this.scr[i * 4 + d.seat] >= 0;
        if (scr) p *= 0.7 + 0.2 * k;
        // (in a WHITEOUT the arrow shows late: a read in less time)
        const fog = ch.fog[i] === 1;
        if (fog) p -= 0.05 + 0.1 * (1 - k);
        const r1 = this.rnd();
        const u1 = this.rnd();
        const u2 = this.rnd();
        // (a level with holds: whether it lets go of this one too early, and when)
        const u3 = this.tune.hold ? this.rnd() : 1;
        if (r1 < p) {
          const sig = (0.07 - 0.042 * k) * (scr ? 1.3 : 1) * (fog ? 1.3 : 1);
          const g = Math.sqrt(-2 * Math.log(Math.max(1e-6, u1))) * Math.cos(2 * Math.PI * u2);
          this.plan[i * 4 + d.seat] = clamp(d.bias + g * sig, -0.16, 0.16);
          if (ch.len[i] > 0) {
            const pd = 0.04 + 0.2 * (1 - k) + d.slump * 0.1 * (1 - k);
            if (u3 < pd) this.dropAt[i * 4 + d.seat] = ch.t[i] + ch.len[i] * (0.25 + 0.55 * (u3 / pd));
          }
          d.slump *= 0.5;
        } else {
          this.plan[i * 4 + d.seat] = NaN;
          d.slump = 1;
        }
      }
    }
    for (const d of this.dn) {
      if (d.human) continue;
      for (let i = d.head; i < this.planned; i++) {
        if (ch.t[i] - 0.2 > this.now) break;
        if (this.res[i * 4 + d.seat] !== PENDING) continue;
        const off = this.plan[i * 4 + d.seat];
        if (off !== off) {
          // a planned miss: a wrong step on it (a third of the time), or nothing
          if (this.now >= ch.t[i] + 0.06 && (i + d.seat) % 3 === 0) this.miss(i, d.seat);
          continue;
        }
        if (this.now >= ch.t[i] + off) {
          if (Math.abs(off) > W_GOOD) this.miss(i, d.seat);
          else this.judge(i, d.seat, off);
        }
      }
    }
  }

  /** The holds under way: the visitor's key still down (a frame's gap forgiven), an AI's planned let-go; kept to the tail or dropped. */
  private holdsTick(input: Input, dt: number) {
    const ch = this.ch;
    for (const d of this.dn) {
      const i = d.holding;
      if (i < 0) continue;
      const b = this.need(i, d.seat);
      d.lit[b] = 1;
      d.pose = b;
      d.poseT = 0;
      if (d.seat === this.laneSeat) this.recep[b] = Math.max(this.recep[b], 0.6);
      if (this.now >= ch.t[i] + ch.len[i] - HOLD_EARLY) this.holdEnd(d, i, true);
      else if (d.human) {
        if (input.held(BTN[b])) d.hgap = 0;
        else if ((d.hgap += dt) > HOLD_GAP) this.holdEnd(d, i, false);
      } else {
        const at = this.dropAt[i * 4 + d.seat];
        if (at === at && this.now >= at) this.holdEnd(d, i, false);
      }
    }
  }

  /** A hold's end: kept (its points, a chime) or dropped (the combo gone, a stumble). */
  private holdEnd(d: Dancer, i: number, ok: boolean) {
    const s = d.seat;
    d.holding = -1;
    const b = this.need(i, s);
    if (ok) {
      this.hold[i * 4 + s] = H_OK;
      d.holds++;
      d.score += PTS_HOLD * this.mult(d);
      d.pop = 9;
      d.popT = this.clk;
      d.poseT = 0.3;
      this.fx.burst(this.v.set(d.px, d.py + 0.4, d.pz), 12, [this.players[s].color, "#7dffe0", "#ffffff"], { speed: 4, up: 4, size: 0.12, life: 0.6 });
      if (s === this.laneSeat) {
        this.flash[b] = 1;
        this.flashC[b] = "#7dffe0";
      }
      if (d.human) (this.tone(1568, 0.09, "triangle", 0.12), this.tone(2093, 0.12, "triangle", 0.09));
      return;
    }
    this.hold[i * 4 + s] = H_DROP;
    d.drops++;
    d.combo = 0;
    if (this.feverSeat === s) this.fever();
    d.pop = 10;
    d.popT = this.clk;
    d.stumble = 1;
    d.pose = -1;
    d.a.hit();
    d.a.angry = true;
    this.fx.burst(this.v.set(d.px, d.py + 0.3, d.pz), 8, ["#8a8784", "#5a566e"], { speed: 2.5, up: 2, size: 0.14, life: 0.6 });
    if (s === this.laneSeat) this.laneShake = 1;
    if (d.human) this.scratch();
  }

  /** WHITEOUT: the frost's cover of the lane (creeping down through the bar before a squall, full in it, melting after), the warning. */
  private weather(now: number) {
    const sq = this.tune.squalls;
    if (!sq) return;
    const bar = now / this.k.bar;
    let f = 0;
    for (const [a, b] of sq) {
      if (bar >= a - 1 && bar < a) {
        const u = bar - (a - 1);
        f = Math.max(f, u * u);
        if (this.squallSaid < a) {
          this.squallSaid = a;
          this.say(T("WHITEOUT!", "白毛风！"), 1.5, "#d8f4ff", H * 0.5, 56);
          this.noise(1.6, 0.22, 2400, 0.5, 0.4);
        }
      } else if (bar >= a && bar < b) f = 1;
      else if (bar >= b && bar < b + 0.5) f = Math.max(f, 1 - (bar - b) / 0.5);
    }
    this.frost = f;
  }

  /** Notes gone past the line unplayed: misses; the heads move on. */
  private sweep() {
    const ch = this.ch;
    for (const d of this.dn) {
      while (d.head < ch.n) {
        const i = d.head;
        const st = this.res[i * 4 + d.seat];
        if (st === PENDING) {
          if (this.now <= ch.t[i] + W_GOOD) break;
          this.miss(i, d.seat);
        }
        d.head++;
      }
    }
  }

  /** A long pause (a dialog, a hidden tab): what it swallowed counts for no one. */
  private voidGap(from: number, to: number) {
    for (let i = 0; i < this.ch.n; i++) {
      const t = this.ch.t[i];
      if (t < from - W_GOOD || t > to + 0.05) continue;
      for (let s = 0; s < 4; s++) if (this.res[i * 4 + s] === PENDING) this.res[i * 4 + s] = VOID;
    }
  }

  // ---- the frame -----------------------------------------------------------------------------------

  idle(dt: number, phase: "card" | "count", k: number) {
    this.clk += dt;
    if (phase === "card") {
      // a slow swing over the club, high, then lower
      const a = Math.sin(k * 0.35) * 0.55;
      const o = this.lv.orbit;
      this.cam.eye.set(o.at.x + Math.sin(a) * o.r, o.h - Math.min(3, k * 0.6), o.at.z + 1 + Math.cos(a) * o.r);
      this.cam.at.copy(o.at);
    } else this.cam.to(this.lv.eye, this.lv.at, dt, 3.2);
    this.cam.apply(dt);
    this.animate(dt, this.clk, 0.35);
  }

  update(dt: number, input: Input) {
    this.clk += dt;
    const p = perfNow();
    if (!this.started) this.start();
    else if (!this.clockFn && p - this.lastP > GAP) this.voidGap(this.lastP + this.off, p + this.off);
    if (!this.clockFn) this.tickClock(p);
    this.lastP = p;
    this.now = this.songNow(p);
    const now = this.now;
    this.part = partIn(this.k, Math.floor(Math.max(0, now) / this.k.bar));
    if (!this.over && this.tallyT < 0) {
      this.humanInput(input, p);
      this.ai();
      this.sweep();
      this.holdsTick(input, dt);
      this.weather(now);
      // the parts' announcements
      this.announce(now);
      if (now >= this.k.end) this.startTally();
    } else this.evN = 0;
    if (this.tallyT >= 0 && !this.over) {
      this.tallyT += dt;
      if (this.tallyT >= 2.0 && this.winner < 0) this.crown();
      if (this.tallyT >= TALLY) this.finish();
    }
    if (this.over) this.post += dt;
    // the shown scores catch up
    for (const d of this.dn) d.shown += (d.score - d.shown) * Math.min(1, dt * 9);
    // the camera: the stage; at the crowning, in on the winner
    if (this.winner >= 0) {
      // (the winner low in the frame, under the tally that has gone up out of the way)
      const d = this.dn[this.winner];
      this.v.set(d.px * 0.8, 2.3, d.pz + 7.6);
      this.v2.set(d.px * 0.92, 2.85, d.pz);
      this.cam.to(this.v, this.v2, dt, 2.2);
    } else {
      const pump = this.part === S_FINAL ? Math.pow(1 - this.beatPhase(now), 4) * 0.12 : 0;
      this.v.set(this.lv.eye.x, this.lv.eye.y, this.lv.eye.z - pump);
      this.cam.to(this.v, this.lv.at, dt, 3);
    }
    this.animate(dt, now, this.hype());
    this.cam.apply(dt);
    // the HUD's bits fade
    for (let b = 0; b < 5; b++) {
      this.recep[b] = Math.max(0, this.recep[b] - dt * 7);
      this.flash[b] = Math.max(0, this.flash[b] - dt * 4);
    }
    this.laneShake = Math.max(0, this.laneShake - dt * 5);
  }

  private announced = -1;
  private announce(now: number) {
    const bar = Math.floor(now / this.k.bar);
    if (now >= 0.15 && this.announced < 0) {
      this.announced = 0;
      this.say(T("ROUND 1 · ABSORB", "第一轮 · 吸收"), 2.3, GLACIER, H * 0.36, 46);
    }
    if (this.announced < 1 && bar >= this.k.at[S_CHORUS]) {
      this.announced = 1;
      sfx.whoosh();
    }
    if (this.announced < 2 && now >= this.k.at[S_BREAK] * this.k.bar - 0.1) {
      this.announced = 2;
      this.say(T("FINAL HASH!", "最终哈希！"), 1.45, ACCENT, H * 0.5, 64);
      this.roar(0.5);
      sfx.whoosh();
    }
    if (this.announced < 3 && now >= this.k.at[S_END] * this.k.bar + 0.25) {
      this.announced = 3;
      this.say(T("HASHED!", "哈希完成！"), 1.8, GLACIER, H * 0.42, 60);
      this.roar(1);
      for (const x of [-10, 10]) this.fx.burst(this.v.set(x, 1, 2), 40, [ACCENT, "#59e6ff", "#b48cff", "#ffffff", "#ff5fa2"], { speed: 6, up: 12, gravity: 9, life: 1.8, size: 0.2 });
    }
  }

  private say(s: string, dur: number, c: string, y: number, size: number) {
    this.banners.push({ s, t: this.clk, dur, c, y, size });
  }

  private startTally() {
    this.tallyT = 0;
    this.live = false;
    // (a hold still on as the song ends: kept)
    for (const d of this.dn) if (d.holding >= 0) this.holdEnd(d, d.holding, true);
    this.final = this.order();
    // (anything still open: a miss)
    for (const d of this.dn) for (let i = d.head; i < this.ch.n; i++) if (this.res[i * 4 + d.seat] === PENDING) this.res[i * 4 + d.seat] = MISS;
  }

  private order() {
    const sc = this.dn.map((d) => d.score);
    const tie = this.dn.map((d) => d.best * 1000 + d.n[0]);
    return rankBy(sc, tie);
  }

  /** The winner known: their dance, the crowd up, the lights on them. */
  private crown() {
    const o = this.final ?? this.order();
    this.winner = o[0];
    const w = this.dn[this.winner];
    w.a.body.holdArms(false);
    w.a.cheer(6);
    w.a.jump(9);
    w.flipAt = this.clk + 0.18;
    for (const d of this.dn) {
      d.score = Math.round(d.score);
      if (d.seat === this.winner) continue;
      if (d.seat === o[3]) ((d.a.angry = true), d.a.hit());
      else (d.a.body.holdArms(false), d.a.body.wave(2.5));
    }
    this.fx.burst(this.v.set(w.px, 2.5, w.pz), 60, [ACCENT, "#ffffff", "#59e6ff", "#b48cff", "#ff5fa2"], { speed: 8, up: 9, life: 1.6 });
    this.roar(1.2);
    if (w.human) sfx.star();
  }

  private finish() {
    this.over = this.final ?? this.order();
    for (const d of this.dn) d.a.angry = false;
  }

  // ---- the dance, the lights, the crowd ------------------------------------------------------------

  private beatPhase(t: number) {
    const b = t / this.k.beat;
    return b - Math.floor(b);
  }

  /** How wild the room is (0…1): the part, the combos, the fever. */
  private hype() {
    let h = [0.35, 0.45, 0.65, 0.75, 0.9, 1, 1][this.part] ?? 0.5;
    if (this.feverSeat >= 0) h = Math.min(1, h + 0.15);
    if (this.winner >= 0) h = 1;
    return h;
  }

  /** A dancer strikes a pose: the arrow's (0…3), the HASH (4); `k` how far (a stray press half). */
  private pose(d: Dancer, b: number, k: number) {
    d.pose = b;
    d.poseT = k < 1 ? 0.12 : 0;
    const a = d.a;
    const wild = d.wild;
    if (b === U && k >= 1) a.jump(3.6 + wild * 0.9);
    else if (b === D) a.body.land(5 + wild * 2);
    else if (b === HASH && k >= 1) {
      a.jump(6.5 + wild * 1.2);
      if (wild > 1.5 || this.feverSeat === d.seat) d.flipAt = this.clk + 0.14;
    }
  }

  /** The arms' target for a pose, into armT (right x, z, elbow; left x, z, elbow). */
  private armsFor(pose: number, t: number, wild: number) {
    const A = this.armT;
    const sw = Math.sin((t / this.k.beat) * Math.PI);
    const P6 = pose >= 0 && pose <= 9 ? POSES[pose] : null;
    if (P6) A.set(P6);
    else {
      // the groove: forearms up, pumping with the beat, higher as it gets wild
      const up = 0.3 + wild * 0.35;
      A[0] = -up - 0.28 * sw * (0.6 + wild * 0.3);
      A[1] = -0.25 - wild * 0.08;
      A[2] = -1.25;
      A[3] = -up + 0.28 * sw * (0.6 + wild * 0.3);
      A[4] = 0.25 + wild * 0.08;
      A[5] = -1.25;
    }
  }

  private animate(dt: number, now: number, hype: number) {
    const bp = this.beatPhase(now);
    const kick = Math.pow(1 - bp, 3);
    const playing = this.started && this.tallyT < 0;
    // the dancers
    for (const d of this.dn) {
      const a = d.a;
      d.poseT += dt;
      d.stumble = Math.max(0, d.stumble - dt * 2.2);
      const level = this.feverSeat === d.seat ? 3 : d.combo >= 20 ? 2 : d.combo >= 10 ? 1 : 0;
      d.wild += (level - d.wild) * Math.min(1, dt * 3);
      if (d.stumble <= 0.4 && d.popT < this.clk - 0.6) a.angry = false;
      for (let b = 0; b < 5; b++) d.lit[b] = Math.max(0, d.lit[b] - dt * 5);
      // the arms: the pose for a moment, then back to the groove
      const held = d.pose >= 0 && d.poseT < 0.3;
      const pk = held ? 1 : d.pose >= 0 ? clamp(1 - (d.poseT - 0.3) / 0.25, 0, 1) : 0;
      if (d.stumble > 0.5) this.armsFor(9, now, d.wild);
      else this.armsFor(-1, now, d.wild);
      if (pk > 0 && d.stumble <= 0.5) {
        const g0 = this.armT[0],
          g1 = this.armT[1],
          g2 = this.armT[2],
          g3 = this.armT[3],
          g4 = this.armT[4],
          g5 = this.armT[5];
        this.armsFor(d.pose, now, d.wild);
        const T6 = this.armT;
        T6[0] = g0 + (T6[0] - g0) * pk;
        T6[1] = g1 + (T6[1] - g1) * pk;
        T6[2] = g2 + (T6[2] - g2) * pk;
        T6[3] = g3 + (T6[3] - g3) * pk;
        T6[4] = g4 + (T6[4] - g4) * pk;
        T6[5] = g5 + (T6[5] - g5) * pk;
      }
      const ka = Math.min(1, dt * 22);
      for (let j = 0; j < 6; j++) d.arm[j] += (this.armT[j] - d.arm[j]) * ka;
      const body = a.body;
      body.armR.rotation.set(d.arm[0], 0, d.arm[1]);
      body.foreArmR.rotation.set(d.arm[2], 0, 0);
      body.armL.rotation.set(d.arm[3], 0, d.arm[4]);
      body.foreArmL.rotation.set(d.arm[5], 0, 0);
      // the body: a bounce on each beat, a sway, a lean into the pose; a stumble wobbles
      const groove = this.winner === d.seat ? 1.4 : 0.6 + d.wild * 0.3;
      const lean = (d.pose === L ? 0.17 : d.pose === R ? -0.17 : 0) * pk;
      const wob = Math.sin(this.clk * 26) * 0.22 * d.stumble;
      body.root.rotation.z = lean + Math.sin((now / this.k.beat) * Math.PI) * 0.05 * groove + wob;
      body.root.position.y = -kick * 0.07 * groove - (d.pose === D ? 0.16 * pk : 0);
      const yaw = (d.pose === L ? -0.38 : d.pose === R ? 0.38 : 0) * pk + Math.sin((now / this.k.beat) * Math.PI * 0.5) * 0.12 * d.wild;
      a.face(yaw, dt, 12);
      // a flip in the air (wild, the fever), a spin on a FEVER bar
      if (d.flipAt > 0 && this.clk >= d.flipAt) {
        d.flipAt = -1;
        if (!a.grounded) body.jump();
      }
      // the winner's dance: a hop every other beat, a flip every fourth
      if (this.winner === d.seat && a.grounded && bp < 0.15 && d.poseT > 0.4 && Math.floor(now / this.k.beat) % 2 === 0) {
        a.jump(6.5);
        d.pose = -1;
        d.poseT = 0;
        if (Math.floor(now / this.k.beat) % 4 === 0) d.flipAt = this.clk + 0.15;
      }
      if (playing && this.feverSeat === d.seat && bp < 0.1 && Math.floor(now / this.k.beat) % 8 === 2 && d.poseT > 0.35) body.release();
      a.physics(dt, d.py);
      a.sync(dt);
    }
    // the pads' panels
    const pc = this.col;
    for (const d of this.dn) {
      for (let b = 0; b < 4; b++) {
        pc.copy(this.seatC[d.seat]).multiplyScalar(0.5 + 0.18 * kick);
        const k = d.lit[b];
        pc.r += (1 - pc.r) * k;
        pc.g += (1 - pc.g) * k;
        pc.b += (1 - pc.b) * k;
        this.panels.setColorAt(d.seat * 4 + b, pc);
      }
      pc.copy(this.feverSeat === d.seat ? C_ACCENT : this.seatC[d.seat]).multiplyScalar(0.45 + 0.3 * kick);
      const k = d.lit[4];
      pc.r += (1 - pc.r) * k;
      pc.g += (1 - pc.g) * k;
      pc.b += (1 - pc.b) * k;
      this.hubs.setColorAt(d.seat, pc);
    }
    this.panels.instanceColor!.needsUpdate = true;
    this.hubs.instanceColor!.needsUpdate = true;
    this.floor(now, kick);
    this.lights(dt, now, kick, hype);
    this.crowdAnim(now, hype);
    if (this.lv.key === "marina") this.tickMarina(dt, now, kick, hype);
    else if (this.lv.key === "astana") this.tickAstana(dt, now, kick, hype);
    else this.tickClub(dt, now, kick, hype);
    // the rim light breathes with the kick
    if (this.rimL) this.rimL.intensity = this.rimBase * (0.85 + 0.35 * kick * hype);
    this.show(dt, now);
    // the sabotage orbs: an arc from the saboteur to the target
    for (const o of this.orbs) {
      if (o.t < 0) continue;
      o.t += dt / 0.6;
      if (o.t >= 1) {
        o.t = -1;
        o.m.visible = false;
        const d = this.dn[o.to];
        this.fx.burst(this.v.set(d.px, 2.4, d.pz), 26, ["#59e6ff", "#b48cff", "#ffffff"], { speed: 5, up: 4 });
        d.a.hit();
        continue;
      }
      const a = this.dn[o.from],
        b = this.dn[o.to];
      const k = o.t;
      o.m.position.set(a.px + (b.px - a.px) * k, 2.6 + Math.sin(k * Math.PI) * 3, a.pz + (b.pz - a.pz) * k);
    }
    this.fx.update(dt);
  }

  /** The LED floor: waves (ROUND 1), a flipping checkerboard (ROUND 2), rings from the middle (the FINAL HASH); a ring round the fever. */
  private floor(now: number, kick: number) {
    const part = this.part;
    const bt = now / this.k.beat;
    const bp = bt - Math.floor(bt);
    const pal = this.lv.floor[part <= S_VERSE || !this.started ? 0 : part === S_CHORUS || part === S_BREAK ? 1 : 2];
    const c1 = pal[0],
      c2 = pal[1];
    const fv = this.feverSeat >= 0 ? this.dn[this.feverSeat] : null;
    const col = this.col;
    for (let i = 0; i < this.tileX.length; i++) {
      const x = this.tileX[i],
        z = this.tileZ[i];
      let k: number;
      let mix: number;
      if (!this.started || part <= S_VERSE) {
        const w = Math.sin(x * 0.5 + z * 0.4 - bt * Math.PI * 0.5);
        mix = w * 0.5 + 0.5;
        k = 0.1 + 0.16 * mix + 0.22 * kick * (w > 0.35 ? 1 : 0);
      } else if (part === S_CHORUS || part === S_BREAK) {
        const odd = ((Math.round(x) + Math.round(z) + Math.floor(bt)) & 1) === 1;
        mix = odd ? 1 : 0;
        k = odd ? 0.16 + 0.42 * kick : 0.06;
      } else {
        const r = Math.hypot(x, z * 1.4);
        const ring = 1 - Math.min(1, Math.abs(r - bp * 13) / 1.3);
        mix = (Math.floor(r / 2) & 1) as number;
        k = 0.07 + 0.62 * ring + 0.08 * kick;
      }
      col.copy(c1).lerp(c2, mix).multiplyScalar(k);
      if (fv) {
        const r = Math.hypot(x - fv.px, z - fv.pz);
        const ring = 1 - Math.min(1, Math.abs(r - 2.2 - Math.sin(this.clk * 6) * 0.3) / 0.8);
        if (ring > 0) col.lerp(C_ACCENT, ring * 0.8);
      }
      this.tiles.setColorAt(i, col);
    }
    this.tiles.instanceColor!.needsUpdate = true;
  }

  private lights(dt: number, now: number, kick: number, hype: number) {
    const t = this.clk;
    const bt = now / this.k.beat;
    const part = this.part;
    // the beams: sweeping the stage, the part's colours; in the fever one follows its holder
    const bc = this.lv.beam[part <= S_VERSE ? 0 : part === S_CHORUS ? 1 : 2];
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i];
      const sweep = Math.sin(t * (0.6 + hype * 0.9) + b.ph) * (3 + hype * 2.5);
      let tx = b.x * 0.75 + sweep;
      let tz = this.lv.stageZ + Math.cos(t * 0.8 + b.ph) * 2.5;
      let ty = 0;
      if ((this.winner >= 0 || this.feverSeat >= 0) && i % 3 === 1) {
        const d = this.dn[this.winner >= 0 ? this.winner : this.feverSeat];
        tx = d.px + Math.sin(t * 3 + i) * 0.6;
        tz = d.pz + Math.cos(t * 3 + i) * 0.6;
        ty = d.py;
      }
      this.v.set(tx - b.x, ty - b.y, tz - b.z);
      const len = this.v.length();
      this.q.setFromUnitVectors(this.v2.set(0, -1, 0), this.v.normalize());
      b.m.quaternion.copy(this.q);
      b.m.scale.set(0.9 + hype * 0.4, len, 0.9 + hype * 0.4);
      b.mat.color.copy(bc[i % 2]);
      b.mat.opacity = (0.07 + 0.07 * hype + 0.06 * kick) * (this.winner >= 0 ? 0.6 : 1);
    }
    // the spotlight on the fever (or the winner)
    const sd = this.winner >= 0 ? this.dn[this.winner] : this.feverSeat >= 0 ? this.dn[this.feverSeat] : null;
    const target = sd ? 0.16 : 0;
    this.spotMat.opacity += (target - this.spotMat.opacity) * Math.min(1, dt * 4);
    this.spot.visible = this.spotMat.opacity > 0.01;
    if (sd) {
      this.spot.position.set(sd.px, sd.py + 9.26, sd.pz - 0.5);
      this.spot.quaternion.identity();
      this.spot.scale.set(1.25, 9.4, 1.25);
    }
    // the equaliser on the wall
    if (this.eq) {
    for (let i = 0; i < 34; i++) {
      const x = -12.4 + i * 0.75;
      const f = 0.5 + 0.5 * Math.sin(i * 1.7 + bt * Math.PI * (i % 3 === 0 ? 1 : 0.5));
      const h = 0.25 + (0.4 + 1.6 * hype) * (0.35 + 0.65 * f) * (0.55 + 0.45 * kick);
      this.m4.compose(this.v.set(x, 0.35 + h / 2, 0), this.q.identity(), this.sc.set(0.5, h, 0.12));
      this.eq.setMatrixAt(i, this.m4);
    }
    this.eq.instanceMatrix.needsUpdate = true;
    }
    // the woofers thump
    let k = 0;
    if (this.woofers) {
    for (const x of SPEAKER_X)
      for (let j = 0; j < 4; j++) {
        const s = 1.0 + kick * 0.12 * hype;
        this.m4.compose(this.v.set(x, 0.75 + j * 1.45, -3.84 + kick * 0.05), this.q.setFromEuler(this.eu.set(Math.PI / 2, 0, 0)), this.sc.set(s, 0.1, s));
        this.woofers.setMatrixAt(k++, this.m4);
      }
    this.woofers.instanceMatrix.needsUpdate = true;
    }
    // the lasers: two fans from the wall's top corners (the DJ's island, the canopy), opening with the hype
    const lz = this.laserAt;
    if (this.lasers) {
    for (let i = 0; i < 12; i++) {
      const side = i < 6 ? -1 : 1;
      const j = i % 6;
      const ang = side * (0.25 + j * 0.18 * (0.5 + hype)) + Math.sin(t * 1.3 + side) * 0.35;
      const on = hype > 0.5 || j % 2 === 0;
      const len = on ? 60 : 0.001;
      this.eu.set(lz[3], 0, ang);
      this.q.setFromEuler(this.eu);
      this.v2.set(0, len / 2, 0).applyQuaternion(this.q);
      this.m4.compose(this.v.set(side * lz[0] + this.v2.x, lz[1] + this.v2.y, lz[2] + this.v2.z), this.q, this.sc.set(0.06, len, 0.06));
      this.lasers.setMatrixAt(i, this.m4);
    }
    this.lasers.instanceMatrix.needsUpdate = true;
    }
  }

  private crowdAnim(now: number, hype: number) {
    const c = this.crowd;
    const bt = now / this.k.beat;
    const cheer = this.winner >= 0 || (this.announced >= 3 && this.now > this.k.at[S_END] * this.k.bar);
    const m4 = this.m4;
    const q = this.q;
    const zAxis = this.v2.set(0, 0, 1);
    for (let i = 0; i < c.fig.length; i++) {
      const f = c.fig[i];
      const ph = bt * Math.PI + f.ph * 0.15;
      const hop = Math.abs(Math.sin(ph)) * (0.06 + 0.22 * hype) * (cheer ? 1.6 : 1);
      const y0 = this.crowdY + hop;
      const s = f.s;
      q.setFromAxisAngle(zAxis, f.lean + Math.sin(ph * 0.5) * 0.06 * hype);
      m4.compose(this.v.set(f.x, y0 + 0.62 * s, f.z), q, this.sc.set(0.62 * s, 0.8 * s, 0.42 * s));
      c.body.setMatrixAt(i, m4);
      m4.compose(this.v.set(f.x, y0 + 1.27 * s, f.z), q, this.sc.set(0.5 * s, 0.46 * s, 0.46 * s));
      c.head.setMatrixAt(i, m4);
      // the arms: down and swinging when calm, pumping up on the beat when hyped, both up to cheer
      const pump = hype > 0.6 && (Math.floor(bt) + i) % 2 === 0;
      const ar = cheer ? -2.7 + Math.sin(this.clk * 9 + f.ph) * 0.3 : pump ? -2.5 - 0.3 * Math.sin(ph) : -0.25 - 0.2 * Math.sin(ph);
      const al = cheer ? 2.7 - Math.sin(this.clk * 9 + f.ph) * 0.3 : hype > 0.8 ? 2.4 + 0.3 * Math.sin(ph + 1) : 0.25 + 0.2 * Math.sin(ph + 1);
      for (let side = 0; side < 2; side++) {
        const a = side ? al : ar;
        const sx = f.x + (side ? 0.38 : -0.38) * s;
        const sy = y0 + 0.95 * s;
        q.setFromAxisAngle(zAxis, a);
        m4.compose(this.v.set(sx + Math.sin(a) * 0.28 * s, sy - Math.cos(a) * 0.28 * s, f.z), q, this.sc.set(0.15 * s, 0.56 * s, 0.15 * s));
        c.arm.setMatrixAt(i * 2 + side, m4);
        if (side === 1) {
          const on = f.stick && (cheer || hype > 0.55);
          m4.compose(this.v.set(sx + Math.sin(a) * 0.68 * s, sy - Math.cos(a) * 0.68 * s, f.z), q, on ? this.sc.set(0.07, 0.42, 0.07) : this.sc.set(0, 0, 0));
          c.stick.setMatrixAt(i, m4);
        }
      }
    }
    c.body.instanceMatrix.needsUpdate = true;
    c.head.instanceMatrix.needsUpdate = true;
    c.arm.instanceMatrix.needsUpdate = true;
    c.stick.instanceMatrix.needsUpdate = true;
  }

  // ---- sounds ----------------------------------------------------------------------------------------

  private tone(f: number, d: number, type: OscillatorType, vol: number, slide = 0) {
    const a = sound();
    if (!a) return;
    const t = a.ac.currentTime;
    const o = a.ac.createOscillator();
    const g = a.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.bus);
    o.start(t);
    o.stop(t + d + 0.02);
  }

  private noise(d: number, vol: number, freq: number, q: number, attack = 0.005) {
    const a = sound();
    if (!a) return;
    const ac = a.ac;
    if (!this.noiseBuf) {
      const n = Math.floor(ac.sampleRate * 2);
      this.noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
      const ch = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
    }
    const t = ac.currentTime;
    const s = ac.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f).connect(g).connect(a.bus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + d + 0.05);
  }

  private tick(f: number, vol: number) {
    this.tone(f, 0.03, "square", vol);
  }
  private clap() {
    this.noise(0.14, 0.55, 1500, 0.8);
    this.tone(110, 0.12, "sine", 0.4, 0.5);
  }
  private scratch() {
    this.tone(700, 0.16, "sawtooth", 0.16, 0.18);
  }
  private zap(mine: boolean) {
    this.tone(mine ? 300 : 1400, 0.3, "square", 0.18, mine ? 4 : 0.2);
    this.noise(0.25, 0.25, 3000, 2);
  }
  /** The crowd: a roar of noise. */
  private roar(k: number) {
    this.noise(1.2 + k, 0.18 + 0.2 * k, 900, 0.6, 0.12);
  }

  // ---- the HUD -----------------------------------------------------------------------------------------

  view() {
    return this.w;
  }

  /** The intro's own shots: a low pass along the front of the stage (the title lands on it), then the whole room from over the crowd, its sky behind. */
  intro(): IntroShot[] {
    const o = this.lv.orbit;
    const y = this.crowdY;
    return [
      { eye: [-9.5, y + 3.4, 9.2], eye2: [9, y + 3.9, 8.6], at: [-3, 2, -1], at2: [3, 2.2, -1], fov: 50, fov2: 46 },
      { eye: [-15, o.h + 2.5, o.r + 8], eye2: [-6.5, o.h, o.r + 3.5], at: [0, o.at.y + 1.6, o.at.z - 1], at2: [0, o.at.y + 1, o.at.z], fov: 52, fov2: 47, w: 1.2 },
    ];
  }

  draw(g: CanvasRenderingContext2D) {
    const cam = this.w.camera;
    const now = this.started ? this.now : -1;
    const tally = this.tallyT >= 0;
    // a WHITEOUT: the air goes white
    if (this.squall > 0.02) {
      g.fillStyle = `rgba(226,240,255,${(this.squall * 0.3).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
    }
    // the fever's warm edge (yours), the scramble's cold one
    const you = this.human >= 0 ? this.dn[this.human] : null;
    if (you && this.feverSeat === you.seat && !tally) {
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.66);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, `rgba(255,107,53,${0.22 + Math.sin(this.clk * 8) * 0.06})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
    // name tags and pops over the heads
    for (const d of this.dn) {
      const s = toScreen(d.a.head(this.v), cam);
      if (!s.on) continue;
      tag(g, d.p, s.x, s.y);
      this.headPop(g, d, s.x, s.y - 30);
      if (!tally && d.scrTo >= now && d.scrFrom - now < 3) this.scrambleMark(g, s.x + 34, s.y - 4);
      if (!tally && this.feverSeat === d.seat) this.feverMark(g, s.x - 34, s.y - 4);
    }
    this.panels2(g, now);
    if (!tally && this.started) {
      this.progress(g, now);
      this.lane(g, now);
      this.status(g);
    } else if (!this.started) this.progress(g, 0);
    // the announcements
    for (let i = this.banners.length - 1; i >= 0; i--) {
      const b = this.banners[i];
      const k = (this.clk - b.t) / b.dur;
      if (k >= 1) {
        this.banners.splice(i, 1);
        continue;
      }
      if (k > 0) banner(g, b.s, k, b.c, b.y, b.size);
    }
    if (tally) this.tally(g);
  }

  private headPop(g: CanvasRenderingContext2D, d: Dancer, x: number, y: number) {
    const k = (this.clk - d.popT) / (d.pop >= 6 ? 1.4 : 0.55);
    if (k < 0 || k >= 1 || !d.pop) return;
    const big = d.pop >= 6;
    const s = (big ? 20 : d.human ? 15 : 14) * backOut(Math.min(1, k * 5));
    const word = big ? T(POP_EN[d.pop], POP_ZH[d.pop]) : T(J_EN[d.pop], J_ZH[d.pop]);
    const c = big ? POP_C[d.pop] : J_C[d.pop];
    g.save();
    g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    toy(g, word, x, y - k * (big ? 26 : 14), s, c, { rim: big ? "#ffffff" : false });
    if (!big && d.pop !== MISS && d.combo >= 4) text(g, NUMS[d.combo] ?? "", x, y - k * 14 + s * 0.95, 11, "rgba(255,255,255,0.85)", "center", 900);
    g.restore();
  }

  private scrambleMark(g: CanvasRenderingContext2D, x: number, y: number) {
    const j = Math.sin(this.clk * 30) * 1.5;
    rr(g, x - 11 + j, y - 11, 22, 22, 6);
    g.fillStyle = "#5a3fd0";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "#ffffff";
    g.stroke();
    text(g, "?", x + j, y + 1, 15, "#ffffff", "center", 900);
  }

  private feverMark(g: CanvasRenderingContext2D, x: number, y: number) {
    const s = 1 + Math.sin(this.clk * 10) * 0.12;
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    // a flame
    g.beginPath();
    g.moveTo(0, -13);
    g.quadraticCurveTo(10, -2, 7, 6);
    g.quadraticCurveTo(4, 12, 0, 12);
    g.quadraticCurveTo(-4, 12, -7, 6);
    g.quadraticCurveTo(-10, -2, 0, -13);
    g.fillStyle = ACCENT;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "#ffffff";
    g.stroke();
    g.beginPath();
    g.arc(0, 5, 4, 0, Math.PI * 2);
    g.fillStyle = "#ffe0c8";
    g.fill();
    g.restore();
  }

  /** The corners: the score (counting up), a crown on the leader; by each, a pill with the combo and the multiplier (or the scramble, the fever). */
  private panels2(g: CanvasRenderingContext2D, now: number) {
    let top = 0;
    for (const d of this.dn) top = Math.max(top, d.score);
    const lead = this.leadL;
    lead.length = 0;
    for (const d of this.dn) {
      const i = d.seat;
      if (top > 0 && d.score === top) lead.push(i);
      const v = Math.round(d.shown);
      if (v !== this.keyL[i]) ((this.keyL[i] = v), (this.valsL[i] = String(v)));
    }
    const live = this.tallyT < 0 && this.started;
    if (live)
      for (const d of this.dn) {
        const i = d.seat;
        const scr = d.scrTo >= now && d.scrFrom - now < 3;
        const m = this.mult(d);
        const key = `${d.combo}|${m}|${scr ? 1 : 0}`;
        if (key !== this.subK[i]) {
          this.subK[i] = key;
          // (a touch screen: the panel's second line, so the short way)
          const tight = HUD.thumbs;
          this.subL[i] = scr ? T("? SCRAMBLED", "? 被打乱") : m === 4 ? (tight ? T(`FEVER ${d.combo}`, `狂热 ${d.combo}`) : T(`FEVER ×4 · ${d.combo}`, `狂热 ×4 · ${d.combo}`)) : d.combo >= 2 ? (tight ? `×${m} · ${d.combo}` : T(`×${m} · combo ${d.combo}`, `×${m} · 连击 ${d.combo}`)) : "";
          this.pillC[i] = scr ? "#5a3fd0" : m === 4 ? ACCENT : m === 3 ? "#e2458a" : m === 2 ? "#7a4fe0" : "#2e2850";
        }
      }
    // (a touch screen: the panels are stacked down the sides with the lanes between, so the combo
    // is each panel's second line rather than a pill beside it)
    if (HUD.thumbs) return void corners(g, this.players, this.valsL, { lead, sub: live ? this.subL : undefined });
    corners(g, this.players, this.valsL, { lead });
    if (!live) return;
    for (const d of this.dn) {
      const i = d.seat;
      const s = this.subL[i];
      if (!s) continue;
      const x = (i % 2 === 0 ? 14 : W - 14 - 196) + 58;
      const y = i < 2 ? 14 + 58 + 14 : H - 14 - 58 - 14;
      g.font = `900 11px ${FONT}`;
      const w = g.measureText(s).width + 20;
      rr(g, x - 2, y - 11, w + 4, 22, 11);
      g.fillStyle = INK;
      g.fill();
      rr(g, x, y - 9, w, 18, 9);
      g.fillStyle = this.pillC[i];
      g.fill();
      text(g, s, x + w / 2, y + 0.5, 11, "#ffffff", "center", 900);
    }
  }

  /** The song's progress under the clock: the three rounds, a playhead. */
  private progress(g: CanvasRenderingContext2D, now: number) {
    clock(g, Math.max(0, this.k.end - Math.max(0, now)));
    const x0 = LANE_L - 6;
    const w = LANE_W + 12;
    const y = 70;
    rr(g, x0 - 2, y - 2, w + 4, 12, 6);
    g.fillStyle = INK;
    g.fill();
    const segs = [
      [S_VERSE, GLACIER],
      [S_CHORUS, LILAC],
      [S_FINAL, ACCENT],
    ] as const;
    for (const [part, c] of segs) {
      const a = (this.k.at[part] * this.k.bar) / this.k.end;
      const b = Math.min(1, ((this.k.at[part] + this.k.bars[part] + (part === S_FINAL ? 1 : 0)) * this.k.bar) / this.k.end);
      const live = this.part === part || (part === S_FINAL && this.part >= S_FINAL);
      g.globalAlpha = live ? 1 : 0.45;
      g.fillStyle = c;
      g.fillRect(x0 + a * w + 1, y, (b - a) * w - 2, 8);
    }
    g.globalAlpha = 1;
    // the WHITEOUT squalls ahead, marked on the bar
    for (const [a, b] of this.tune.squalls ?? []) {
      const u0 = (a * this.k.bar) / this.k.end;
      const u1 = (b * this.k.bar) / this.k.end;
      g.fillStyle = "#f4fbff";
      g.fillRect(x0 + u0 * w, y - 1, (u1 - u0) * w, 10);
      text(g, "❄", x0 + ((u0 + u1) / 2) * w, y - 7, 10, "#d8f4ff", "center", 900);
    }
    const k = clamp(now / this.k.end, 0, 1);
    g.fillStyle = "rgba(10,6,28,0.55)";
    g.fillRect(x0 + k * w, y, (1 - k) * w, 8);
    rr(g, x0 + k * w - 3, y - 4, 6, 16, 3);
    g.fillStyle = "#ffffff";
    g.fill();
    // the part's name
    // (a touch screen: the panels are stacked down the sides, a wide one comes close to the bar: the short name)
    const name = HUD.thumbs
      ? this.part <= S_VERSE
        ? T("R1", "第一轮")
        : this.part === S_CHORUS
          ? T("R2", "第二轮")
          : T("FINAL", "最终")
      : this.part <= S_VERSE
        ? T("R1 · ABSORB", "第一轮 · 吸收")
        : this.part === S_CHORUS
          ? T("R2 · PERMUTE", "第二轮 · 置换")
          : T("FINAL HASH", "最终哈希");
    text(g, name, x0 + w + 10, y + 4, 11, PART_C[this.part], "left", 900);
  }

  /** The lane: the falling arrows to the line, the beat's lines, the receptors, the judgement. */
  private lane(g: CanvasRenderingContext2D, now: number) {
    const sp = sprites();
    const s = this.laneSeat;
    const d = this.dn[s];
    const shake = Math.sin(this.clk * 60) * 4 * this.laneShake;
    g.save();
    g.translate(shake, 0);
    const scr = d.scrTo >= now && d.scrFrom - now < 3;
    const rim = scr ? "#59e6ff" : this.feverSeat === s ? ACCENT : PART_C[this.part];
    // the glass: deeper toward the line, where the arrows are read
    rr(g, LANE_L - 8, TOP_Y - 14, LANE_W + 16, HIT_Y - TOP_Y + 46, 16);
    const glass = g.createLinearGradient(0, TOP_Y - 14, 0, HIT_Y + 32);
    glass.addColorStop(0, "rgba(9,6,24,0.6)");
    glass.addColorStop(0.55, "rgba(9,6,24,0.78)");
    glass.addColorStop(1, "rgba(7,4,20,0.9)");
    g.fillStyle = glass;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = rim;
    g.globalAlpha = 0.85;
    g.stroke();
    g.globalAlpha = 1;
    for (let c = 1; c < 4; c++) {
      g.fillStyle = "rgba(255,255,255,0.05)";
      g.fillRect(LANE_L + c * COL_W - 0.5, TOP_Y - 8, 1, HIT_Y - TOP_Y + 30);
    }
    g.save();
    rr(g, LANE_L - 8, TOP_Y - 14, LANE_W + 16, HIT_Y - TOP_Y + 46, 16);
    g.clip();
    // the beats' lines, the bars' brighter
    const b0 = Math.floor((now - 0.25) / this.k.beat);
    for (let b = b0; b < b0 + 20; b++) {
      const tb = b * this.k.beat;
      const pt = partIn(this.k, Math.floor(Math.max(0, tb) / this.k.bar));
      const y = HIT_Y - (tb - now) * ((HIT_Y - TOP_Y) / this.tune.approach[pt]);
      if (y < TOP_Y - 10) break;
      if (y > HIT_Y + 30) continue;
      const bar = b % 4 === 0;
      g.fillStyle = bar ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.06)";
      g.fillRect(LANE_L, y - (bar ? 1 : 0.5), LANE_W, bar ? 2 : 1);
      // the parts' starts: a marked line
      if (bar && b > 0 && (b / 4 === this.k.at[S_CHORUS] || b / 4 === this.k.at[S_FINAL])) {
        const c = b / 4 === this.k.at[S_CHORUS] ? LILAC : ACCENT;
        g.fillStyle = c;
        g.fillRect(LANE_L, y - 1.5, LANE_W, 3);
        text(g, b / 4 === this.k.at[S_CHORUS] ? T("ROUND 2", "第二轮") : T("FINAL", "最终"), LANE_L + LANE_W / 2, y - 10, 11, c, "center", 900);
      }
    }
    // the line: a bar of the round's colour across the lane, its glow under the receptors
    const lg = g.createLinearGradient(0, HIT_Y - 24, 0, HIT_Y + 24);
    lg.addColorStop(0, "rgba(255,255,255,0)");
    lg.addColorStop(0.5, "rgba(255,255,255,0.16)");
    lg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = lg;
    g.fillRect(LANE_L - 8, HIT_Y - 24, LANE_W + 16, 48);
    g.globalAlpha = 0.9;
    g.fillStyle = rim;
    g.fillRect(LANE_L - 8, HIT_Y - 1.5, LANE_W + 16, 3);
    g.globalAlpha = 1;
    // the receptors
    for (let c = 0; c < 4; c++) {
      const x = colX(c);
      const lit = this.recep[c];
      g.drawImage(sp.recep[c][0], x - 26, HIT_Y - 26, 52, 52);
      if (lit > 0) {
        g.globalAlpha = lit;
        g.drawImage(sp.recep[c][1], x - 26, HIT_Y - 26, 52, 52);
        g.globalAlpha = 1;
      }
    }
    if (this.recep[HASH] > 0) {
      g.globalAlpha = 0.3 + this.recep[HASH] * 0.7;
      g.drawImage(sp.hashRecep, LANE_L, HIT_Y - 20, LANE_W, 40);
      g.globalAlpha = 1;
    }
    // the notes, the latest first (the next on top)
    const ch = this.ch;
    let last = d.head;
    while (last < ch.n && ch.t[last] < now + this.tune.approach[ch.part[last]] + 0.05) last++;
    let first = d.head;
    while (first > 0 && ch.t[first - 1] > now - 0.4) first--;
    // the holds' neon trails under the heads (the one held now: from the line up to its tail, eaten as it goes)
    if (this.tune.hold) {
      for (let i = last - 1; i >= first; i--) {
        if (ch.len[i] <= 0 || i === d.holding) continue;
        const st = this.res[i * 4 + s];
        if (st !== PENDING && st !== MISS) continue;
        const sx = this.scr[i * 4 + s];
        const dt = ch.t[i] - now;
        if (sx >= 0 && dt > REVEAL) continue;
        const sp2 = (HIT_Y - TOP_Y) / this.tune.approach[ch.part[i]];
        this.trail(g, sx >= 0 ? sx : ch.dir[i], HIT_Y - dt * sp2, HIT_Y - (dt + ch.len[i]) * sp2, sx >= 0 ? 2 : ch.on[i] ? 0 : 1, st === MISS ? 0.3 : 1, false);
      }
      const h = d.holding;
      if (h >= 0) {
        const sp2 = (HIT_Y - TOP_Y) / this.tune.approach[ch.part[h]];
        const dir = this.need(h, s);
        this.trail(g, dir, HIT_Y, HIT_Y - (ch.t[h] + ch.len[h] - now) * sp2, this.scr[h * 4 + s] >= 0 ? 2 : ch.on[h] ? 0 : 1, 1, true);
        const pz = 52 * (1.06 + Math.sin(this.clk * 22) * 0.05);
        g.drawImage(sp.note[dir][this.scr[h * 4 + s] >= 0 ? 2 : ch.on[h] ? 0 : 1], colX(dir) - pz / 2, HIT_Y - pz / 2, pz, pz);
      }
    }
    for (let i = last - 1; i >= first; i--) {
      const st = this.res[i * 4 + s];
      if (st !== PENDING && st !== MISS) continue;
      const dt = ch.t[i] - now;
      const y = HIT_Y - dt * ((HIT_Y - TOP_Y) / this.tune.approach[ch.part[i]]);
      if (y < TOP_Y - 30) continue;
      const fade = y > HIT_Y ? clamp(1 - (y - HIT_Y) / 60, 0, 1) : clamp((y - TOP_Y + 30) / 40, 0, 1);
      g.globalAlpha = fade * (st === MISS ? 0.35 : 1);
      const sx = this.scr[i * 4 + s];
      if (ch.dir[i] === HASH) g.drawImage(sp.hash, LANE_L, y - 20, LANE_W, 40);
      else if (sx >= 0 && dt > REVEAL) {
        const j = Math.sin(this.clk * 40 + i) * 2;
        g.drawImage(sp.q, LANE_L + j, y - 20, LANE_W, 40);
      } else {
        const dir = sx >= 0 ? sx : ch.dir[i];
        const kind = sx >= 0 ? 2 : ch.on[i] ? 0 : 1;
        const pop = sx >= 0 && dt > REVEAL - 0.12 ? 1 + (dt - (REVEAL - 0.12)) * 3 : 1;
        const sz = 52 * pop;
        g.drawImage(sp.note[dir][kind], colX(dir) - sz / 2, y - sz / 2, sz, sz);
      }
    }
    g.globalAlpha = 1;
    // WHITEOUT: frost over the top of the lane, snow blowing through it
    if (this.frost > 0) this.frostOver(g);
    // the hits' flashes on the line
    for (let c = 0; c < 5; c++) {
      const f = this.flash[c];
      if (f <= 0) continue;
      const x = c === HASH ? W / 2 : colX(c);
      g.globalAlpha = f;
      g.strokeStyle = this.flashC[c] || "#fff";
      g.lineWidth = 4 * f;
      g.beginPath();
      if (c === HASH) g.ellipse(x, HIT_Y, LANE_W * 0.5 + (1 - f) * 20, 18 + (1 - f) * 16, 0, 0, Math.PI * 2);
      else g.arc(x, HIT_Y, 22 + (1 - f) * 18, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    g.restore();
    // the warning: a scramble is coming down the lane
    if (scr && now < d.scrFrom) {
      const blink = Math.sin(this.clk * 14) > 0;
      rr(g, LANE_L + 6, TOP_Y - 2, LANE_W - 12, 24, 12);
      g.fillStyle = blink ? "#5a3fd0" : "#3a2890";
      g.fill();
      text(g, T("SCRAMBLED! ? = surprise", "被打乱！? = 惊喜箭头"), W / 2, TOP_Y + 10.5, 11, "#ffffff", "center", 900);
    }
    // the combo in the lane, the judgement over the line
    if (d.combo >= 4) {
      g.globalAlpha = 0.9;
      numeral(g, NUMS[d.combo] ?? String(d.combo), W / 2, 214, 40, this.feverSeat === s ? "#ffd0b8" : "#ffffff", "center");
      text(g, T("COMBO", "连击"), W / 2, 246, 12, "rgba(255,255,255,0.75)", "center", 900);
      g.globalAlpha = 1;
    }
    const k = (this.clk - this.jPopT) / 0.5;
    if (k >= 0 && k < 1 && this.jPop) {
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const sz = 26 * backOut(Math.min(1, k * 6));
      toy(g, T(J_EN[this.jPop], J_ZH[this.jPop]), W / 2, HIT_Y - 74 - k * 8, sz, J_C[this.jPop]);
      if (this.jPop !== MISS && this.jPop !== PERFECT && this.jEarly) text(g, this.jEarly < 0 ? T("early", "早了") : T("late", "晚了"), W / 2, HIT_Y - 50, 11, "rgba(255,255,255,0.7)", "center", 800);
      g.globalAlpha = 1;
    }
    // the first bars: what to do
    if (now < this.k.at[S_VERSE] * this.k.bar) {
      const a = clamp((this.k.at[S_VERSE] * this.k.bar - now) / 1.2, 0, 1);
      g.globalAlpha = a;
      toy(g, T("ARROWS ON THE LINE", "箭头到线就按"), W / 2, 290, 15, "#ffffff", { rim: false });
      // (a touch screen: its button says what it does)
      toy(g, touchy() ? T(`${actWord("hash")} BUTTON ON HASH!`, `HASH! 按「${actWord("hash")}」`) : T("A ON HASH!", "HASH! 按 A"), W / 2, 318, 15, ACCENT, { rim: false });
      if (this.tune.hold) toy(g, T("HOLD THE NEON TRAILS", "霓虹长条要按住"), W / 2, 346, 15, "#7dffe0", { rim: false });
      if (this.tune.squalls) toy(g, T("❄ WHITEOUT: ARROWS SHOW LATE", "❄ 白毛风：箭头会晚出现"), W / 2, 346, 13, "#d8f4ff", { rim: false });
      g.globalAlpha = 1;
    }
    g.restore();
  }

  /** A hold's neon trail from its head (y0) up to its tail (y1), in its column; `held`: lit, being eaten at the line. */
  private trail(g: CanvasRenderingContext2D, dir: number, y0: number, y1: number, kind: number, alpha: number, held: boolean) {
    const top = Math.max(TOP_Y - 20, y1);
    if (y0 <= top) return;
    const x = colX(dir);
    const c = NOTE_C[kind];
    g.globalAlpha = alpha * (held ? 0.5 + Math.sin(this.clk * 18) * 0.12 : 0.32);
    rr(g, x - 17, top - 4, 34, y0 - top + 8, 17);
    g.fillStyle = c;
    g.fill();
    g.globalAlpha = alpha;
    rr(g, x - 10, top, 20, y0 - top, 10);
    g.fillStyle = held ? "#ffffff" : c;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
    rr(g, x - 3.5, top + 6, 7, Math.max(0, y0 - top - 12), 3.5);
    g.fillStyle = held ? c : "rgba(255,255,255,0.7)";
    g.fill();
    // the tail's cap
    if (y1 > TOP_Y - 20) {
      rr(g, x - 13, top - 5, 26, 10, 5);
      g.fillStyle = "#ffffff";
      g.fill();
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  /** The frost over the lane's top in a WHITEOUT (a crust of ice, its ragged edge, snow streaking through). */
  private frostOver(g: CanvasRenderingContext2D) {
    const f = this.frost;
    const cover = FROST * f * (HIT_Y - TOP_Y);
    const y0 = TOP_Y - 14;
    const y1 = TOP_Y + cover;
    const fr = frostSprite();
    g.drawImage(fr, LANE_L - 8, y0, LANE_W + 16, y1 - y0 + 34);
    // snow streaks blowing across
    g.fillStyle = "rgba(255,255,255,0.75)";
    for (let k = 0; k < 14; k++) {
      const yy = y0 + (k / 14) * (y1 - y0 + 20);
      const xx = LANE_L - 8 + ((this.clk * (260 + k * 23) + k * 97) % (LANE_W + 40)) - 20;
      g.fillRect(xx, yy, 14 + (k % 3) * 6, 2);
    }
    if (f > 0.6) {
      g.globalAlpha = clamp((f - 0.6) / 0.3, 0, 1) * (0.75 + Math.sin(this.clk * 6) * 0.2);
      toy(g, T("❄ WHITEOUT ❄", "❄ 白毛风 ❄"), W / 2, y1 - 26, 17, "#2a5d8a", { rim: "#ffffff" });
      g.globalAlpha = 1;
    }
  }

  /** Under the lane: your multiplier and the way to the next sabotage. */
  private status(g: CanvasRenderingContext2D) {
    const d = this.dn[this.laneSeat];
    const y = HIT_Y + 52;
    const m = this.mult(d);
    const x0 = LANE_L - 8;
    const w = LANE_W + 16;
    rr(g, x0, y - 13, w, 26, 13);
    g.fillStyle = "rgba(9,6,24,0.72)";
    g.fill();
    // the multiplier chip
    rr(g, x0 + 3, y - 10, 40, 20, 10);
    g.fillStyle = m === 4 ? ACCENT : m === 3 ? "#ff5fa2" : m === 2 ? "#b48cff" : "#3a3358";
    g.fill();
    text(g, `×${m}`, x0 + 23, y + 1, 13, "#ffffff", "center", 900);
    // the sabotage's charge: 20 in a row
    const round = this.part <= S_VERSE ? 0 : this.part === S_CHORUS ? 1 : 2;
    const spent = (d.sab & (1 << round)) !== 0;
    const fill = spent ? 1 : (d.combo % SAB_EVERY) / SAB_EVERY;
    const bx = x0 + 50;
    const bw = w - 58;
    rr(g, bx, y - 5, bw, 10, 5);
    g.fillStyle = "rgba(255,255,255,0.1)";
    g.fill();
    if (fill > 0) {
      rr(g, bx, y - 5, Math.max(10, bw * fill), 10, 5);
      g.fillStyle = spent ? "rgba(255,95,162,0.45)" : "#ff5fa2";
      g.fill();
    }
    text(g, spent ? T("SABOTAGE SENT", "已捣乱") : T("SABOTAGE", "捣乱"), bx + bw / 2, y + 0.5, 9, "#ffffff", "center", 900);
    if (Math.abs(this.cal) > 0.012 && this.human >= 0) text(g, T(`sync ${this.cal > 0 ? "+" : ""}${Math.round(this.cal * 1000)} ms`, `同步 ${this.cal > 0 ? "+" : ""}${Math.round(this.cal * 1000)} 毫秒`), W / 2, y + 22, 9, "rgba(255,255,255,0.4)", "center", 700);
  }

  /** The tally: a row each, the accuracy, the best combo, the points counting up; the winner crowned. */
  private tally(g: CanvasRenderingContext2D) {
    const k = this.tallyT - 0.35;
    if (k <= 0) return;
    const fade = this.over ? clamp(1 - this.post / 0.35, 0, 1) : 1;
    if (fade <= 0) return;
    const o = this.final ?? this.order();
    const bw = 520;
    const bh = 236;
    const x0 = W / 2 - bw / 2;
    const y0 = 112 - (1 - easeOut(clamp(k / 0.35, 0, 1))) * 40;
    g.save();
    // the winner crowned, the board goes up and small: the dance below it
    const up = this.winner >= 0 ? easeOut(clamp((this.tallyT - 2.15) / 0.45, 0, 1)) : 0;
    if (up > 0) {
      const sc = 1 - 0.4 * up;
      const cy = y0 + bh / 2;
      g.translate(W / 2, cy + (96 - cy) * up);
      g.scale(sc, sc);
      g.translate(-W / 2, -cy);
    }
    g.globalAlpha = clamp(k / 0.25, 0, 1) * fade;
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
    gr.addColorStop(0, "#2a1f66");
    gr.addColorStop(1, "#120c34");
    g.fillStyle = gr;
    g.fill();
    toy(g, T("THE TALLY", "结算"), W / 2, y0 + 28, 26, ACCENT);
    const hx = [x0 + 228, x0 + 302, x0 + 372];
    text(g, T("hits", "命中"), hx[0], y0 + 56, 10, "rgba(255,255,255,0.55)", "center", 800);
    text(g, T("perfect", "完美"), hx[1], y0 + 56, 10, "rgba(255,255,255,0.55)", "center", 800);
    text(g, T("best", "最高"), hx[2], y0 + 56, 10, "rgba(255,255,255,0.55)", "center", 800);
    const total = this.ch.n;
    o.forEach((seat, r) => {
      const d = this.dn[seat];
      const y = y0 + 84 + r * 38;
      const grow = clamp((k - 0.2 - r * 0.1) / 1.0, 0, 1);
      const crowned = r === 0 && this.winner >= 0;
      if (crowned) {
        rr(g, x0 + 14, y - 17, bw - 28, 34, 12);
        g.fillStyle = `rgba(255,107,53,${0.2 + Math.sin(this.clk * 6) * 0.06})`;
        g.fill();
      }
      text(g, String(r + 1), x0 + 28, y + 1, 17, r === 0 ? ACCENT : "rgba(255,255,255,0.6)", "center", 900);
      badge(g, d.p, x0 + 60, y, 28, {});
      text(g, short(d.p), x0 + 82, y + 1, 13, tint(d.p.color, 0.35), "left", 900);
      const hits = d.n[0] + d.n[1] + d.n[2];
      text(g, `${Math.round((hits / Math.max(1, total)) * 100 * easeOut(grow))}%`, hx[0], y + 1, 14, "#ffffff", "center", 900);
      text(g, String(Math.round(d.n[0] * easeOut(grow))), hx[1], y + 1, 14, J_C[PERFECT], "center", 900);
      text(g, String(d.best), hx[2], y + 1, 14, "#ffffff", "center", 900);
      numeral(g, String(Math.round(d.score * easeOut(grow))), x0 + bw - 22, y + 1, 21, crowned ? "#ffd0b8" : "#ffffff", "right");
      if (crowned) crown(g, x0 + 60, y - 13, 20, Math.sin(this.clk * 5) * 1.5);
    });
    g.restore();
  }

  result() {
    return this.over;
  }

  dispose() {
    if (LAB) (window as unknown as { labBeat?: unknown }).labBeat = null;
    this.live = false;
    for (const f of this.offs) f();
    this.offs = [];
    for (const d of this.dn) d.a.dispose();
    disposeScene(this.w.scene);
  }
}

export const BEAT_DEF: MiniDef = {
  key: "beat",
  title: "HASH BEAT",
  titleZh: "哈希节拍",
  tag: "A rhythm dance-off: the Equihash club, a Marina Bay pool deck, Central Park's winter fest. Dance to the beat!",
  tagZh: "节奏斗舞：Equihash 俱乐部、滨海湾泳池甲板、中央公园冬季音乐节。踩准节拍！",
  goal: "Dance to the beat: the most points wins!",
  goalZh: "跟着节拍跳舞：得分最高者赢！",
  help: "Press the arrow as it hits the line, A on a HASH! bar. Combos multiply your points and fire a SABOTAGE at the leader every 20 in a row; the best combo from 30 holds HASH FEVER (×4).",
  helpZh: "箭头到达判定线时按对应方向键，HASH! 条按 A。连击让得分翻倍，每连续 20 次向领先者发动捣乱；30 连击以上的最高连击者进入哈希狂热（×4）。",
  pad: ["left", "right", "up", "down", "a"],
  tap: false,
  // (each arrow is its own hit on the beat: four buttons, not a stick)
  stick: false,
  color: ACCENT,
  ambience: "club",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `beat-${l.key}`, ambience: l.ambience })),
  // (no level asked for: the seed draws one)
  make: (players, rnd, variant) => new HashBeat(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};
export default BEAT_DEF;
