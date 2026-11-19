/**
 * HASH BEAT's songs, one a level (beat.ts composes them and charts their tunes). A song is seven
 * parts in bars: the intro, ROUND 1 ABSORB (the verse), ROUND 2 PERMUTE (the chorus), the break,
 * the FINAL HASH, the last hit, the outro's silence. Its tune is a MIDI note a sixteenth ("." a rest,
 * "-" held): the arrows are its notes (on the beats in the verse, on the eighths after), their
 * direction its pitch; the HASH! bars sit on chosen notes.
 */
import type { Patch } from "../../music";

export interface Tune {
  bpm: number;
  /** Bars a part: intro, verse, chorus, break, final, last hit, outro. */
  bars: number[];
  /** A chord a bar ("" none). */
  chords: string[];
  /** The bass's root of each chord (MIDI). */
  root: Record<string, number>;
  /** The chord held on the pads (three MIDI notes). */
  voice: Record<string, number[]>;
  /** The key's pitch classes (the harmony a third under the tune; a note outside it, a leading note, gets the fourth under). */
  scale: number[];
  /** The tune by bar: sixteen tokens. */
  lead: Record<number, string>;
  /** The HASH! hits: [bar, step] (on a note of the tune). */
  hash: [number, number][];
  /** By part: the bass (r root, o its octave, "-" held), the drums (a kit letter a sixteenth; upper case: accent). */
  bass: string[];
  kick: string[];
  snare: string[];
  hats: string[];
  /** A percussion line by part (shaker, wood, rim). */
  perc?: string[];
  /** The snare of the bar before the break. */
  fill: string;
  /** The intro's rising arpeggio (eighths) and the break's climb (sixteenths). */
  introArp: number[];
  breakArp: number[];
  /** An arrow's fall from the lane's top to the line, by part (s). */
  approach: number[];
  /** The instruments. */
  inst: { verse: Patch; hook: Patch; shine: Patch; harm: Patch; arp: Patch; pad: Patch; strings: Patch; bass: Patch; stab: Patch };
  /** Volume factors (default: the club's mix). */
  vol?: { verse?: number; hook?: number; shine?: number; harm?: number; arp?: number; pad?: number; strings?: number; bass?: number; stab?: number; hats?: number; perc?: number };
  kit: "pop" | "soft" | "deep";
  duck: number;
  /** Every second sixteenth late (the eighths, where the arrows are, stay straight). */
  swing?: number;
  /** Long notes of at least this many sixteenths are holds (none: taps only). */
  hold?: number;
  /** WHITEOUT squalls: bars [from, to). */
  squalls?: [number, number][];
}

// ---- HASH ROUNDS: the club's song (A minor, 128) ---------------------------------------------------

export const ROUNDS_TUNE: Tune = {
  bpm: 128,
  bars: [2, 8, 8, 1, 7, 1, 2],
  chords: ["Am", "Am", "Am", "F", "C", "G", "Am", "F", "C", "E", "F", "G", "Am", "Am", "F", "G", "C", "E", "E", "Am", "F", "C", "G", "Am", "F", "E", "Am", "", ""],
  root: { Am: 45, F: 41, C: 48, G: 43, E: 40 },
  voice: { Am: [57, 60, 64], F: [57, 60, 65], C: [55, 60, 64], G: [55, 59, 62], E: [56, 59, 64] },
  scale: [9, 11, 0, 2, 4, 5, 7],
  lead: {
    2: "69 . . . 72 . . . 76 . . . 72 . . .",
    3: "77 . . . 76 . . . 72 . . . 69 . . .",
    4: "67 . . . 72 . . . 76 . 74 . 72 . . .",
    5: "71 . . . 74 . . . 79 - - - - - . .",
    6: "69 . . . 72 . . . 76 . . . 81 . . .",
    7: "77 . . . 76 . . . 77 . 76 . 72 . . .",
    8: "76 . . . 74 . . . 72 . . . 71 . . .",
    9: "68 . . . 71 . . . 76 - - - - - . .",
    10: "81 . 81 . 79 . . . 77 . . . 76 . 77 .",
    11: "79 . . . 74 . . . 79 . 81 . 83 . . .",
    12: "84 . . . 81 . . . 79 . 81 . 76 . . .",
    13: "76 . . . 74 . 72 . 69 - - - - - . .",
    14: "81 . 81 . 79 . . . 77 . . . 76 . 77 .",
    15: "79 . . . 74 . . . 79 . 81 . 83 . 84 .",
    16: "84 . . . 81 . 83 . 84 . . . 79 . 76 .",
    17: "83 . . . 80 . . . 76 - - - - - . .",
    19: "81 . 76 . 81 . 76 . 84 . 81 . 76 . 72 .",
    20: "77 . 72 . 77 . 72 . 81 . . . 79 . 77 .",
    21: "76 . 72 . 76 . 72 . 79 . 76 . 72 . 67 .",
    22: "71 . 74 . 79 . . . 83 - - - 79 . . .",
    23: "81 . 76 . 81 . 76 . 84 . 81 . 76 . 72 .",
    24: "77 . 72 . 77 . 72 . 81 . 79 . 77 . 76 .",
    25: "76 . 80 . 83 . 88 . 83 . . . 88 . . .",
    26: "81 - - - - - - - - - - - . . . .",
  },
  hash: [
    [5, 8],
    [9, 8],
    [10, 0],
    [13, 8],
    [14, 0],
    [17, 8],
    [19, 0],
    [21, 0],
    [22, 8],
    [23, 0],
    [25, 8],
    [26, 0],
  ],
  bass: ["", "r..r..r.r..r..o.", "r.o.r.o.r.o.r.o.", "r---------------", "rrorrrorrrorrror", "r-------........", "................"],
  kick: ["k...k...k...k...", "k.......k.k.....", "k...k...k...k...", "k...k...k...k.k.", "K...k...K...k...", "K...............", "................"],
  snare: ["................", "....s.......s...", "....C.......C...", "s...s...s.s.sSSS", "..s.C.s...s.C.s.", "................", "................"],
  hats: ["..h...h...h...h.", "..h...h...h...hh", "..o...o...o...o.", "................", "hhHhhhHhhhHhhhHh", "................", "................"],
  fill: "....C.......CsSS",
  introArp: [57, 60, 64, 69, 72, 76, 81, 84],
  breakArp: [64, 68, 71, 74, 76, 80, 83, 86, 88, 86, 83, 80, 76, 80, 83, 88],
  approach: [1.6, 1.55, 1.4, 1.3, 1.22, 1.22, 1.22],
  inst: { verse: "pluck", hook: "lead", shine: "bell", harm: "keys", arp: "glass", pad: "pad", strings: "strings", bass: "bass", stab: "brass" },
  kit: "deep",
  duck: 0.22,
};

// ---- MARINA DECK: tropical house on the pool deck (B minor, 116, swung sixteenths) -----------------

export const MARINA_TUNE: Tune = {
  bpm: 116,
  bars: [2, 8, 8, 1, 7, 1, 2],
  chords: ["Bm", "G", "Bm", "G", "D", "A", "Bm", "G", "D", "A", "G", "A", "F#m", "Bm", "G", "A", "D", "F#", "F#", "Bm", "G", "D", "A", "Bm", "G", "F#", "Bm", "", ""],
  root: { Bm: 47, G: 43, D: 50, A: 45, "F#m": 42, "F#": 42 },
  voice: { Bm: [59, 62, 66], G: [59, 62, 67], D: [57, 62, 66], A: [57, 61, 64], "F#m": [57, 61, 66], "F#": [58, 61, 66] },
  scale: [11, 1, 2, 4, 6, 7, 9],
  lead: {
    2: "71 . . . 74 . . . 78 - - - - - . .",
    3: "79 . . . 78 . . . 74 . . . 71 . . .",
    4: "74 . . . 78 . . . 81 - - - - - . .",
    5: "79 . . . 78 . . . 76 - - - - - - .",
    6: "71 . . . 74 . . . 78 . . . 83 . . .",
    7: "81 . . . 79 . . . 78 . . . 74 . . .",
    8: "76 . . . 78 . . . 74 . . . 73 . . .",
    9: "73 . . . 76 . . . 81 - - - - - - .",
    10: "79 . 78 . 74 . . . 79 . 78 . 74 . . .",
    11: "76 . 78 . 81 - - - - - - . 76 . . .",
    12: "78 . 76 . 73 . . . 78 . 76 . 73 . . .",
    13: "74 . 76 . 78 - - - - - - - - - . .",
    14: "83 . 81 . 79 . 78 . 79 . 81 . 83 - - -",
    15: "81 . . . 76 . . . 81 . 83 . 85 . . .",
    16: "86 - - - - - . . 85 . 83 . 81 . . .",
    17: "82 . . . 78 . . . 73 - - - - - - .",
    19: "83 . 78 . 83 . 78 . 86 . 83 . 78 . 74 .",
    20: "79 . 74 . 79 . 74 . 83 - - - 81 . 79 .",
    21: "78 . 74 . 78 . 74 . 81 . 78 . 74 . 69 .",
    22: "73 . 76 . 81 . . . 85 - - - - - . .",
    23: "83 . 78 . 83 . 78 . 86 . 83 . 78 . 74 .",
    24: "79 . 74 . 79 . 74 . 83 . 81 . 79 . 78 .",
    25: "78 . 82 . 85 . 90 . 85 . . . 90 - - -",
    26: "83 - - - - - - - - - - - . . . .",
  },
  hash: [
    [5, 8],
    [9, 8],
    [14, 0],
    [17, 8],
    [19, 0],
    [21, 0],
    [23, 0],
    [25, 8],
    [26, 0],
  ],
  bass: ["", "r...r.r.r...o.r.", "r.o.r.o.r.o.r.o.", "r---------------", "r.rorr.or.rorr.o", "r-------........", "................"],
  kick: ["k.......k.......", "k...k...k...k...", "k...k...k...k...", "k...k...k...k.k.", "K...k...K...k...", "K...............", "................"],
  snare: ["................", "....c.......c...", "....C.......C...", "c...c...c.c.cCCC", "....C.......C.c.", "................", "................"],
  hats: ["..h...h...h...h.", "..o...o...o...o.", "..o...o...o...o.", "................", "..o.h.o.h.o.h.oo", "................", "................"],
  perc: ["z.z.z.z.z.z.z.z.", "z.w.z.z.z.w.z.z.", "zzwzzzwzzzwzzzwz", "................", "zzwzzzwzzzwzzzwz", "................", "................"],
  fill: "....C.......3321",
  introArp: [59, 62, 66, 71, 74, 78, 83, 86],
  breakArp: [66, 70, 73, 78, 82, 85, 90, 85, 82, 78, 73, 78, 82, 85, 90, 94],
  approach: [1.6, 1.6, 1.5, 1.4, 1.32, 1.32, 1.32],
  inst: { verse: "marimba", hook: "flute", shine: "glass", harm: "keys", arp: "marimba", pad: "pad", strings: "strings", bass: "sub", stab: "brass" },
  vol: { verse: 1, hook: 0.95, shine: 0.3, arp: 0.55, bass: 1, perc: 0.55 },
  kit: "pop",
  duck: 0.2,
  swing: 0.14,
  hold: 4,
};

// ---- WINTER FEST: a gallop in the snow in Central Park (E minor, 140) ---------------------------------------

export const ASTANA_TUNE: Tune = {
  bpm: 140,
  bars: [2, 8, 8, 1, 8, 1, 2],
  chords: ["Em", "Em", "Em", "Em", "C", "D", "Em", "C", "Am", "B", "C", "D", "Em", "Em", "C", "D", "B", "B", "B", "Em", "D", "C", "B", "Em", "D", "C", "B", "Em", "", ""],
  root: { Em: 40, C: 48, D: 38, Am: 45, B: 47 },
  voice: { Em: [59, 64, 67], C: [60, 64, 67], D: [57, 62, 66], Am: [57, 60, 64], B: [59, 63, 66] },
  scale: [4, 6, 7, 9, 11, 0, 2],
  lead: {
    2: "76 . . 74 79 . . 76 83 . . 81 79 . . .",
    3: "76 . . 74 71 . . 74 76 - - - - - . .",
    4: "72 . . 74 76 . . 79 81 . . 79 76 . . .",
    5: "74 . . 76 78 . . 81 78 - - - - - . .",
    6: "76 . . 79 83 . . 81 79 . . 76 74 . . .",
    7: "72 . . 76 79 . . 84 83 . . 79 76 . . .",
    8: "81 . . 79 76 . . 72 69 . . 72 76 . . .",
    9: "75 . . 78 81 . . 78 75 - - - - - . .",
    10: "84 . 83 . 79 . 76 . 84 . 83 . 79 . 76 .",
    11: "86 . 84 . 81 . 78 . 81 . 83 . 84 . 86 .",
    12: "88 . 86 . 83 . 79 . 76 . 79 . 83 . 86 .",
    13: "83 . . . 79 . . . 76 - - - - - . .",
    14: "84 . 83 . 79 . 76 . 84 . 83 . 79 . 76 .",
    15: "86 . 84 . 81 . 78 . 86 . 88 . 90 . 86 .",
    16: "87 . 86 . 83 . 78 . 75 . 78 . 83 . 86 .",
    17: "87 . . . 83 . . . 78 - - - - - . .",
    19: "76 . 79 . 83 . 79 . 76 . 79 . 83 . 88 .",
    20: "86 . 81 . 78 . 81 . 86 . 81 . 78 . 74 .",
    21: "84 . 79 . 76 . 79 . 84 . 79 . 76 . 72 .",
    22: "75 . 78 . 83 . 87 . 86 - - - 83 . . .",
    23: "76 . 79 . 83 . 79 . 76 . 79 . 83 . 88 .",
    24: "86 . 81 . 78 . 81 . 86 . 88 . 90 . 86 .",
    25: "84 . 88 . 91 . 88 . 84 . 79 . 76 . 79 .",
    26: "75 . 78 . 83 . 87 . 90 . . . 87 . . .",
    27: "88 - - - - - - - - - - - . . . .",
  },
  hash: [
    [5, 8],
    [9, 8],
    [10, 0],
    [13, 8],
    [14, 0],
    [17, 8],
    [19, 0],
    [21, 0],
    [22, 8],
    [23, 0],
    [26, 8],
    [27, 0],
  ],
  bass: ["", "r..rr..rr..rr..o", "r.orr.orr.orr.or", "r---------------", "rrorrrorrrorrror", "r-------........", "................"],
  kick: ["k.......k.......", "k...k...k...k...", "k..kk...k..kk...", "k...k...k...k.k.", "K..kK...K..kK...", "K...............", "................"],
  snare: ["................", "....s.......s...", "....C.......C...", "s...s...s.s.sSSS", "..s.C.s...s.C.s.", "................", "................"],
  hats: ["..h...h...h...h.", "..h...h...h...hh", "..o...o...o...o.", "................", "hhHhhhHhhhHhhhHh", "................", "................"],
  perc: ["z.z.z.z.z.z.z.z.", "zzzzzzzzzzzzzzzz", "zzzzzzzzzzzzzzzz", "z.z.z.z.z.z.z.z.", "zzzzzzzzzzzzzzzz", "z...............", "................"],
  fill: "....C.......CsSS",
  introArp: [52, 55, 59, 64, 67, 71, 76, 79],
  breakArp: [59, 63, 66, 69, 71, 75, 78, 81, 83, 81, 78, 75, 71, 75, 78, 83],
  approach: [1.55, 1.5, 1.36, 1.28, 1.2, 1.2, 1.2],
  inst: { verse: "pluck", hook: "lead", shine: "bell", harm: "strings", arp: "pluck", pad: "pad", strings: "strings", bass: "bass", stab: "brass" },
  vol: { harm: 0.32, perc: 0.45 },
  kit: "pop",
  duck: 0.2,
  squalls: [
    [12, 14],
    [20, 22],
    [24, 26],
  ],
};
