/**
 * ZK PARTY's music, played live by WebAudio (no audio files): little arranged songs with chords,
 * a bass line, drums with fills, melodies with call and response, counter-lines, pads and arpeggios,
 * through the party mixer (src/audio/engine.ts: its hall reverb, chorus, glue and limiter), a
 * ping-pong delay and kick ducking. The voices: drums and struck instruments (electric piano, FM
 * bell, marimba, synth pluck, clavinet, slap bass) are rendered once into buffers
 * (src/audio/instruments.ts) and played back; pads and strings (three detuned saws, a swaying
 * filter, the chorus), the supersaw lead, brass, flute, the chip square, bass and sub play live.
 *
 * API (one player, `music`):
 * - `music.play(key | song)`: start a song from its intro (the host does it at GO). `music.stop(fade)`
 *   fades it out (seconds, default 0.25).
 * - Stages: every song plays in four, 0 intro (sparse), 1 main, 2 intense (more layers, busier drums),
 *   3 finale (a key change or a lift, driving). Changes land on bar lines, with a drum fill and a
 *   riser before and a crash on the downbeat. By itself a song goes intro → main after its intro
 *   bars and main → intense after ~25 s (on a 4-bar phrase line).
 * - `music.rate(k)`: tempo factor (1: the song's own). k ≥ 1.1 also lifts the song to its finale at the
 *   next bar (games call `music.rate(1.15)` for the last stretch). It never goes back down a stage.
 * - `music.stage(n)`: go to stage n at the next bar; the automatic intro → main → intense stops
 *   (a rate ≥ 1.1 still lifts to the finale). `music.stage()` returns the current stage.
 * - `music.sting(key, then?)`: a one-shot ("fanfare", "lose") over the music, which ducks under it;
 *   with `then`, the music is replaced by that song, which starts on the beat right as the sting
 *   ends (its last chord rings into it): `music.sting("fanfare", "podium")`. Returns the sting's
 *   length in seconds (0 when the sound is off; the `then` song still starts when it's switched on).
 * - `music.beat()`: the beat, for a game that follows it (a rhythm game): `{ bpm, t0, now, beat, bar,
 *   stage }` or null. Beat n sounds at `t0 + n * 60 / bpm` on the AudioContext clock (`sound().ac`)
 *   while the tempo holds; `now` is that clock as heard (output latency taken off) and `beat` the
 *   beats played so far (fractional, continuous across tempo changes; negative before the song
 *   starts). The object is reused: read it, don't keep it.
 * - `music.end()`: ends the song on its home chord at the next beat (a crash, the low drum, the chord
 *   ringing out) instead of a fade: the host does it at a game's finish.
 * - `music.prepare(key)`: renders a song's instruments in idle moments (the host, under the card).
 * - Every 8th bar of a game song gets a little drum fill and a light crash after it; a stage change
 *   gets a riser, a reversed cymbal, the stage's fill, a crash and (intense, finale) a sub drop.
 * - Ambient songs (lobby, standings, board, podium) walk a `form` of their stages and never get
 *   intense by themselves.
 *
 * The songs: race (kart), bouncy (playful), tense (ticking suspense), chase (galloping), lattice
 * (quantum mystery, space), funk (block-building groove), hero (heroic march), neon (night-city
 * synthwave), frost (the NU7 GRAND PRIX kart: a winter ride with sleigh bells), marina (the MARINA BAY kart: night-drive
 * synthwave); lobby (the hub), standings (between rounds), board (the board game), podium (after the
 * fanfare); stings fanfare (the winner) and lose (a cheeky sad trombone). At the podium:
 * `music.sting("fanfare", "podium")`; between rounds `music.play("standings")`; the hub
 * `music.play("lobby")`; the board `music.play("board")`.
 *
 * A game may pass its own `Song`: the old step format (`lead`/`bass`/`harm` MIDI steps, `drums`)
 * still plays, now with the new instruments, or the arranged format (`stages` of `Section`s, below).
 * Mute: the city's sound switch silences it at once and it resumes on the same bar.
 */
import { master } from "../audio/master";
import { mixerFor, party, type Mixer } from "../audio/engine";
import { BOOM, SWELL, drumBuffer, prepare, struck, type DrumKit, type Struck } from "../audio/instruments";

// ---- the song format -----------------------------------------------------------------------------

const PATCHES = ["pad", "strings", "glass", "keys", "bell", "marimba", "pluck", "clav", "lead", "flute", "square", "brass", "bass", "sub", "funk"] as const;
/** The instruments. */
export type Patch = (typeof PATCHES)[number];
const DRUMS = "kschozrw123y*";
/**
 * The drums: k kick, s snare, c clap, h hat, o open hat, z shaker, r rim tick, w wood tock, 1 2 3 toms
 * (high, mid, low), y crash; "*" a kit line whose characters are those letters (upper case: accent).
 */
export type Drum = "k" | "s" | "c" | "h" | "o" | "z" | "r" | "w" | "1" | "2" | "3" | "y" | "*";

/**
 * One line of a section. Patterns are tokens separated by spaces ("|" between bars is ignored), one
 * token per `r` sixteenths; "." a rest, "-" holds the note before. A pattern shorter than the
 * section repeats.
 */
export interface Part {
  /** The instrument (with n, h, b, a, c, m, or nothing: the chords held, a pad). */
  i?: Patch;
  /** A drum (with p). */
  d?: Drum;
  /** Notes: "E5 . G5 - F#5" (r: 2, eighths). */
  n?: string;
  /** A harmony under this melody (same notes as n): each note gets the chord tone a third or so below. */
  h?: string;
  /** Bass on the chords (r: 2): R root, 3 5 7 the chord's, 8 octave, 2 4 6 scale steps, < > a half-step under / over the next chord's root. */
  b?: string;
  /** Arpeggio on the chords (r: 1): 1, 2, 3… the voiced chord's notes upward (past the top: an octave up). */
  a?: string;
  /** Chord hits (r: 2): "x" the whole voiced chord. */
  c?: string;
  /**
   * A counter-line on the chords' guide tones (r: 2): each "x" plays the chord's 3rd or 7th (a
   * triad: its 3rd or 5th) nearest the line's last note, around F#4 (o: octaves): a line that always
   * fits and moves by step under the melody.
   */
  g?: string;
  /** Drum hits, one character a sixteenth: "x" hit, "X" accent, "g" ghost (spaces ignored). */
  p?: string;
  /** MIDI steps (the old format): 0 a rest, -1 hold (r: 1). */
  m?: number[];
  /** Sixteenths per token. */
  r?: number;
  /** Volume factor. */
  v?: number;
  /** Octaves up (or down). */
  o?: number;
}

/** One stage of a song: chords and parts, looped. */
export interface Section {
  /** Chords, one a bar ("Am F C G7"); "C,G" halves a bar, "C,D,E,F" quarters. Slash: "A/C#". */
  ch?: string;
  parts: Part[];
  /** Transposition in semitones (the finale's key change). */
  up?: number;
  /** The pads' brightness (low-pass, Hz); by stage when missing. */
  lp?: number;
}

export interface Song {
  bpm: number;
  /** Stages: intro, main, intense, finale (missing ones repeat the last). */
  stages?: Section[];
  /** Bars of intro before main (default: the intro's own length). */
  intro?: number;
  /** Seconds into the song when it gets intense (default 22: it lands within a phrase; 0: never). */
  intense?: number;
  /** Ambient songs: the stages in order, one loop each, then again from the second. */
  form?: number[];
  /** A sting: its first stage once. */
  once?: boolean;
  /** Delay of every second sixteenth, as a fraction of one (a 16th swing, 0.1–0.25). */
  swing?: number;
  /** Delay of every off-beat eighth, as a fraction of an eighth (a shuffle, 0.15–0.33). */
  shuffle?: number;
  /** The drum kit's voice. */
  kit?: "pop" | "soft" | "deep";
  /** The drum fill before a stage change: kit letters for the bar's last sixteenths. */
  fill?: string;
  /** Risers, fills and crashes at stage changes (default true; false for ambient songs). */
  fx?: boolean;
  /** How deep the kick ducks the rest (0..1). */
  duck?: number;
  /** Level trim. */
  level?: number;
  /** The old step format: lead, bass, harmony as MIDI steps (0 rest, -1 hold), drums "k.h.s.". */
  lead?: number[];
  bass?: number[];
  harm?: number[];
  drums?: string;
  wave?: OscillatorType;
}

// ---- writing helpers (song definitions only) -------------------------------------------------------

type X = Partial<Part>;
const N = (i: Patch, n: string, x?: X): Part => ({ i, n, ...x });
const H = (i: Patch, h: string, x?: X): Part => ({ i, h, ...x });
const B = (i: Patch, b: string, x?: X): Part => ({ i, b, ...x });
const A = (i: Patch, a: string, x?: X): Part => ({ i, a, ...x });
const C = (i: Patch, c: string, x?: X): Part => ({ i, c, ...x });
const G = (i: Patch, g: string, x?: X): Part => ({ i, g, ...x });
const PAD = (i: Patch = "pad", x?: X): Part => ({ i, ...x });
const D = (d: Drum, p: string, v?: number): Part => ({ d, p, v });
/** Bars of silence (a drum line's lead-in). */
const rest = (bars: number) => ".".repeat(16 * bars);
/** A hit on the first beat of every `bars` bars (crashes). */
const every = (bars: number) => "x" + ".".repeat(16 * bars - 1);

// ---- the songs -------------------------------------------------------------------------------------

/** Kart: bright pop-rock in D, a ♭VI–♭VII lift, E major for the last lap. */
const RACE_CH = "D A/C# Bm G Em A Bb,C D";
const RACE_MEL = `D5 . F#5 . A5 - - G5 | F#5 - E5 - C#5 . . . | B4 . D5 . F#5 - - E5 | D5 - B4 - G4 . A4 B4 |
  E5 . G5 . B5 - - A5 | G5 - F#5 - E5 . C#5 . | D5 - F5 - E5 - G5 - | F#5 - - - - - A4 C#5`;
const race: Song = {
  bpm: 150,
  fill: "s.s.sSSS",
  stages: [
    { ch: "D C G A", parts: [PAD("pad", { v: 0.8 }), B("bass", "R R R R R R R R", { v: 0.8 }), A("pluck", "1 . 2 . 3 . 2 . 1 . 2 . 3 . 4 .", { v: 0.7 }), D("k", "x... .... x... ...."), D("h", "..x. ..x. ..x. ..x.", 0.7)] },
    {
      ch: RACE_CH,
      parts: [PAD(), B("bass", "R R 8 R R R 8 5"), N("lead", RACE_MEL), D("k", "x... ..x. x... ...."), D("s", ".... x... .... x..."), D("h", "x.x. x.x. x.x. x.x.")],
    },
    {
      ch: RACE_CH,
      parts: [
        G("glass", "x - - - - - - -", { v: 0.6, o: 1 }),
        PAD(),
        B("bass", "R R 8 R R R 8 5"),
        N("lead", RACE_MEL),
        H("square", RACE_MEL, { v: 0.5 }),
        A("pluck", "1 2 3 4 3 2 3 4", { v: 0.6 }),
        D("k", "x... ..x. x.x. ...."),
        D("s", ".... x... .... x..x"),
        D("c", ".... x... .... x..."),
        D("h", "xgxg xgxg xgxg xgxg"),
        D("o", ".... .... .... ..x."),
      ],
    },
    {
      ch: RACE_CH,
      up: 2,
      parts: [
        G("strings", "x - - - x - - -", { v: 0.5, o: 1 }),
        PAD("strings"),
        B("bass", "R 8 R 8 R 8 R 8"),
        N("lead", RACE_MEL),
        N("brass", RACE_MEL, { o: -1, v: 0.55 }),
        H("square", RACE_MEL, { v: 0.5 }),
        A("pluck", "1 2 3 4 3 2 3 4", { v: 0.6 }),
        D("k", "x... x... x... x..."),
        D("s", ".... x... .... x..."),
        D("c", ".... x... .... x..."),
        D("h", "xg.g xg.g xg.g xg.g"),
        D("o", "..x. ..x. ..x. ..x."),
        D("y", every(8)),
      ],
    },
  ],
};

/** Coins, bumper balls: a bouncy, shuffling tune in F with marimba off-beats. */
const BOUNCY_CH = "F Dm Bb C F A7 Dm,G7 C7";
const BOUNCY_MEL = `F5 . A5 F5 C6 . A5 . | D6 . C6 A5 F5 - . . | D5 . F5 D5 Bb5 . F5 . | G5 . . E5 C5 - . . |
  F5 . A5 F5 C6 . A5 . | C#6 . A5 E5 G5 - . . | F5 . D5 A4 B4 . D5 . | E5 . G5 . Bb5 - A5 G5`;
const OFFBEATS = ". x . x . x . x";
const bouncy: Song = {
  bpm: 126,
  level: 1.07,
  shuffle: 0.16,
  fill: "1.2.3.sS",
  stages: [
    { ch: "F Dm Bb C", parts: [B("sub", "R . 5 . R . 5 ."), C("marimba", OFFBEATS, { v: 0.75 }), D("k", "x... .... x... ...."), D("z", "x.x. x.x. x.x. x.x.", 0.8)] },
    {
      ch: BOUNCY_CH,
      parts: [
        PAD("pad", { v: 0.45 }),
        B("sub", "R . 5 . 8 . 5 ."),
        C("marimba", OFFBEATS, { v: 0.75 }),
        N("square", BOUNCY_MEL),
        D("k", "x... .... x... ...."),
        D("c", ".... x... .... x..."),
        D("z", "x.x. x.x. x.x. x.x."),
        D("r", ".... ..x. .... ..x.", 0.6),
      ],
    },
    {
      ch: BOUNCY_CH,
      parts: [
        G("flute", "x - - . x - - .", { v: 0.4 }),
        PAD("pad", { v: 0.45 }),
        B("sub", "R . 5 R 8 . 5 <"),
        C("marimba", OFFBEATS, { v: 0.75 }),
        N("square", BOUNCY_MEL),
        H("marimba", BOUNCY_MEL, { v: 0.6 }),
        D("k", "x... ..x. x... ...."),
        D("s", ".... x... .... x..."),
        D("c", ".... x... .... x..."),
        D("z", "xgxg xgxg xgxg xgxg"),
        D("r", ".... ..x. .... ..x.", 0.6),
        D("*", rest(3) + "........1.2.3.3."),
      ],
    },
    {
      ch: BOUNCY_CH,
      up: 2,
      parts: [
        G("strings", "x - - - x - - -", { v: 0.45 }),
        PAD("pad", { v: 0.5 }),
        B("sub", "R 8 5 8 R 8 5 <"),
        C("marimba", OFFBEATS, { v: 0.75 }),
        N("square", BOUNCY_MEL),
        N("bell", BOUNCY_MEL, { v: 0.45 }),
        H("marimba", BOUNCY_MEL, { v: 0.6 }),
        D("k", "x... x... x... x..."),
        D("c", ".... x... .... x..."),
        D("z", "xgxg xgxg xgxg xgxg"),
        D("o", "..x. ..x. ..x. ..x.", 0.8),
        D("y", every(8)),
      ],
    },
  ],
};

/** Bombs, falling floors: A minor, a ticking clock, a pulsing bass; up a half step at the end. */
const TENSE_CH = "Am F Dm E Am F Bb E7";
const TENSE_MEL = `A4 . . C5 B4 . A4 . | C5 - - - A4 - - - | D5 . . F5 E5 . D5 . | B4 - - - G#4 - - - |
  A4 . . C5 E5 . A5 . | C6 . A5 . F5 . C5 . | D5 - - - F5 - D5 - | E5 . G#4 . B4 . D5 .`;
const CLOCK = [D("r", "x... .... x... ....", 0.9), D("w", ".... x... .... x...", 0.9)];
const CLOCK8 = [D("r", "x... x... x... x...", 0.9), D("w", "..x. ..x. ..x. ..x.", 0.8)];
const GALLOP = "R . R R R . R R R . R R R . R R";
const tense: Song = {
  bpm: 136,
  fill: "2.2.3.33",
  stages: [
    { ch: "Am Am F E", parts: [PAD("strings", { v: 0.8 }), B("bass", "R . R . R . R .", { v: 0.8 }), ...CLOCK] },
    {
      ch: TENSE_CH,
      parts: [PAD("strings"), B("bass", "R R R R R R R R"), N("lead", TENSE_MEL), A("pluck", "1 . 3 . 2 . 3 .", { v: 0.5 }), ...CLOCK, D("k", "x... ..x. x... ...."), D("s", ".... x... .... x...", 0.8)],
    },
    {
      ch: TENSE_CH,
      parts: [
        G("strings", "x - - - - - - -", { v: 0.4, o: 1 }),
        PAD("strings"),
        B("bass", GALLOP, { r: 1 }),
        N("lead", TENSE_MEL),
        H("square", TENSE_MEL, { v: 0.45 }),
        A("pluck", "1 2 3 2 1 2 3 2", { v: 0.55 }),
        ...CLOCK8,
        D("k", "x..x ..x. x..x ..x."),
        D("s", ".... x... .... x..."),
        D("h", "xgxg xgxg xgxg xgxg", 0.8),
        D("*", rest(3) + "........2.2.3.3."),
      ],
    },
    {
      ch: TENSE_CH,
      up: 1,
      parts: [
        G("strings", "x - - - x - - -", { v: 0.45, o: 1 }),
        PAD("strings"),
        B("bass", GALLOP, { r: 1 }),
        N("lead", TENSE_MEL),
        N("brass", TENSE_MEL, { o: -1, v: 0.5 }),
        H("square", TENSE_MEL, { v: 0.45 }),
        A("pluck", "1 2 3 2 1 2 3 2", { v: 0.55 }),
        ...CLOCK8,
        D("k", "x... x... x... x..."),
        D("s", ".... x... .... x..."),
        D("c", ".... x... .... x..."),
        D("h", "xgxg xgxg xgxg xgxg", 0.8),
        D("o", "..x. ..x. ..x. ..x.", 0.7),
        D("y", every(4)),
      ],
    },
  ],
};

/** Runs, chases: a galloping E minor with brass stabs; F# minor at the end. */
const CHASE_CH = "Em C G D Em C Am B7";
const CHASE_MEL = `E5 . E5 F#5 G5 . B5 . | A5 - G5 - E5 - - . | D5 . D5 E5 G5 . B5 . | A5 - F#5 - D5 - - . |
  E5 . E5 F#5 G5 . B5 . | C6 - B5 - G5 - E5 . | A5 . C6 . B5 . A5 . | F#5 - - - D#5 . B4 .`;
const chase: Song = {
  bpm: 158,
  fill: "s.ss2.33",
  stages: [
    { ch: "Em C Am B7", parts: [PAD("strings", { v: 0.8 }), B("bass", GALLOP, { r: 1, v: 0.8 }), D("3", "x... x... x... x...", 0.7), D("h", "x.x. x.x. x.x. x.x.", 0.6)] },
    {
      ch: CHASE_CH,
      parts: [PAD("strings"), B("bass", GALLOP, { r: 1 }), N("lead", CHASE_MEL), D("k", "x... ..x. x... ...."), D("s", ".... x... .... x..."), D("h", "x.x. x.x. x.x. x.x.")],
    },
    {
      ch: CHASE_CH,
      parts: [
        G("brass", "x - - - - - - -", { v: 0.4, o: -1 }),
        PAD("strings"),
        B("bass", "R . 8 R R . 8 R R . 8 R R . 5 <", { r: 1 }),
        N("lead", CHASE_MEL),
        C("brass", "x . . x . . x .", { o: -1, v: 0.6 }),
        A("pluck", "1 2 3 4", { v: 0.5 }),
        D("k", "x... x.x. x... x.x."),
        D("s", ".... x... .... x..."),
        D("c", ".... x... .... x..."),
        D("h", "xgxg xgxg xgxg xgxg"),
        D("*", rest(3) + "........1.1.2.3."),
      ],
    },
    {
      ch: CHASE_CH,
      up: 2,
      parts: [
        G("strings", "x - - - x - - -", { v: 0.45, o: 1 }),
        PAD("strings"),
        B("bass", "R . 8 R R . 8 R R . 8 R R . 5 <", { r: 1 }),
        N("lead", CHASE_MEL),
        N("brass", CHASE_MEL, { o: -1, v: 0.5 }),
        C("brass", "x . . x . . x .", { o: -1, v: 0.5 }),
        A("pluck", "1 2 3 4", { v: 0.5 }),
        D("k", "x... x... x... x..."),
        D("s", ".... x... .... x..."),
        D("c", ".... x... .... x..."),
        D("h", "xgxg xgxg xgxg xgxg"),
        D("o", "..x. ..x. ..x. ..x.", 0.7),
        D("y", every(4)),
      ],
    },
  ],
};

/** Lattices, space: D minor with ninths, FM bells climbing like a lattice, a half-time beat. */
const LAT_CH = "Dm9 Bbmaj7 Gm9 A7sus4,A7 Dm9 Bbmaj7 Ebmaj7 A7";
const LAT_MEL = `A5 - - - E5 - F5 - | D5 - - - - - . . | Bb5 - - - A5 - G5 - | D5 - - - C#5 - - - |
  F5 - E5 - D5 - A5 - | A5 - - - F5 - - - | G5 - - - Bb5 - - - | A5 - - - C#5 - E5 -`;
const LAT_ARP = "1 3 2 4 3 5 4 6";
const lattice: Song = {
  bpm: 112,
  kit: "deep",
  swing: 0.08,
  fill: "r.r.2.3.",
  stages: [
    { ch: "Dm9 Bbmaj7 Gm9 A7sus4", parts: [PAD("glass"), A("bell", "1 . 3 . 2 . 4 . 3 . 5 . 4 . 2 .", { v: 0.65 }), B("sub", "R - - - - - - -"), D("z", "..x. ..x. ..x. ..x.", 0.5)] },
    {
      ch: LAT_CH,
      parts: [
        PAD("glass"),
        A("bell", LAT_ARP, { v: 0.6 }),
        B("sub", "R - - - . . R ."),
        N("flute", LAT_MEL),
        D("k", "x... .... ..x. ...."),
        D("c", ".... .... x... ...."),
        D("z", "..x. ..x. ..x. ..x.", 0.6),
        D("r", ".... .x.. .... ..x.", 0.5),
      ],
    },
    {
      ch: LAT_CH,
      parts: [
        G("bell", "x - - - - - - -", { v: 0.45, o: 1 }),
        PAD("glass", { v: 1.2 }),
        A("bell", LAT_ARP, { v: 0.6 }),
        A("pluck", "1 2 3 4", { o: -1, v: 0.45 }),
        B("sub", "R . . R . . 8 ."),
        N("flute", LAT_MEL),
        H("keys", LAT_MEL, { v: 0.5 }),
        D("k", "x... ..x. ..x. .x.."),
        D("c", ".... .... x... ...."),
        D("h", "x.x. x.x. x.x. x.x.", 0.7),
        D("z", "xgxg xgxg xgxg xgxg", 0.5),
        D("o", ".... .... .... ..x."),
      ],
    },
    {
      ch: LAT_CH,
      up: 2,
      parts: [
        G("bell", "x - - - x - - -", { v: 0.4, o: 1 }),
        PAD("glass", { v: 1.2 }),
        A("bell", LAT_ARP, { v: 0.6 }),
        A("pluck", "1 2 3 4", { o: -1, v: 0.45 }),
        B("sub", "R . 8 R . 8 R 8"),
        N("flute", LAT_MEL),
        N("bell", LAT_MEL, { v: 0.4 }),
        H("keys", LAT_MEL, { v: 0.5 }),
        D("k", "x... x... x... x..."),
        D("c", ".... x... .... x..."),
        D("h", "xgxg xgxg xgxg xgxg", 0.7),
        D("o", "..x. ..x. ..x. ..x.", 0.6),
        D("y", every(8)),
      ],
    },
  ],
};

/** Block building, mining: an E dorian funk groove, slap bass, clav and a horn riff. */
const FUNK_CH = "Em7 A7 Em7 A7 Cmaj7 Bm7 Am7 B7";
const FUNK_HORN = `. . E5 G5 . A5 B5 . | D6 . C#6 . A5 . . . | . . E5 G5 . A5 B5 . | G5 . E5 . . . . . |
  G5 . . E5 . G5 B5 . | A5 - - F#5 . D5 . . | C6 . B5 . A5 . E5 . | D#5 - - F#5 - A5 - .`;
const FUNK_BASS = "R . . R . . 8 . . R . 5 7 . 8 .";
const CLAV = ". . x . . x . . . . x . x . . .";
const funk: Song = {
  bpm: 108,
  level: 1.25,
  swing: 0.14,
  fill: "s.ss.sSS",
  stages: [
    { ch: "Em7 A7 Em7 A7", parts: [B("funk", FUNK_BASS, { r: 1 }), C("clav", CLAV, { r: 1, v: 0.75 }), D("h", "xgxg xgxg xgxg xgxg", 0.7), D("k", "x... .... ..x. ....")] },
    {
      ch: FUNK_CH,
      parts: [
        PAD("pad", { v: 0.35 }),
        B("funk", FUNK_BASS, { r: 1 }),
        C("clav", CLAV, { r: 1, v: 0.75 }),
        N("brass", FUNK_HORN),
        D("k", "x..x .... ..x. .x.."),
        D("s", ".... x..g .g.. x..g"),
        D("h", "xgxg xgxg xgxg xg.g"),
        D("o", ".... .... .... ..x."),
      ],
    },
    {
      ch: FUNK_CH,
      parts: [
        G("keys", ". . x - . . x -", { v: 0.55 }),
        PAD("pad", { v: 0.35 }),
        B("funk", FUNK_BASS, { r: 1 }),
        C("clav", CLAV, { r: 1, v: 0.75 }),
        N("brass", FUNK_HORN),
        H("brass", FUNK_HORN, { v: 0.6 }),
        A("pluck", "1 . 3 2 . 4 3 .", { o: 1, v: 0.4 }),
        D("k", "x..x .... ..x. .x.."),
        D("s", ".... x..g .g.. x..g"),
        D("c", ".... x... .... x..."),
        D("h", "xgxg xgxg xgxg xg.g"),
        D("o", ".... .... .... ..x."),
        D("z", "xgxg xgxg xgxg xgxg", 0.5),
      ],
    },
    {
      ch: FUNK_CH,
      up: 2,
      parts: [
        G("keys", ". . x - . . x -", { v: 0.55 }),
        PAD("strings", { v: 0.45 }),
        B("funk", FUNK_BASS, { r: 1 }),
        C("clav", CLAV, { r: 1, v: 0.75 }),
        N("brass", FUNK_HORN),
        H("brass", FUNK_HORN, { v: 0.6 }),
        A("pluck", "1 . 3 2 . 4 3 .", { o: 1, v: 0.4 }),
        D("k", "x... x... x... x..."),
        D("s", ".... x..g .g.. x..g"),
        D("c", ".... x... .... x..."),
        D("h", "xgxg xgxg xgxg xgxg"),
        D("o", "..x. ..x. ..x. ..x.", 0.7),
        D("y", every(8)),
      ],
    },
  ],
};

/** Heroic: a brass march in C, a ♭VII on the way home; up a half step for the end. */
const HERO_CH = "C Em/B F G Am F Bb G";
const HERO_MEL = `C5 - - G4 C5 - - E5 G5 - - - - - - - | G5 - - F5 E5 - - - B4 - - - - - - - |
  A4 - - C5 F5 - - A5 C6 - - - - - - - | B5 - - A5 G5 - - - D5 - - - - - . . |
  C6 - - B5 A5 - - E5 A5 - - - - - - - | A5 - - G5 F5 - - C5 F5 - - - - - - - |
  D5 - - F5 Bb5 - - - - - - - F5 - - - | D5 - - - G5 - - - B4 - - - - - . .`;
const hero: Song = {
  bpm: 144,
  level: 1.1,
  fill: "3.3.ssSS",
  stages: [
    { ch: "F G Am G", parts: [PAD("strings", { v: 0.85 }), B("bass", "R - - - R - - -", { v: 0.8 }), D("3", "x... .... x... ....", 0.8), D("h", "..x. ..x. ..x. ..x.", 0.5)] },
    {
      ch: HERO_CH,
      parts: [
        PAD("strings"),
        B("bass", "R . 5 . R . 5 ."),
        N("brass", HERO_MEL, { r: 1 }),
        D("k", "x... .... x... ...."),
        D("s", ".... x... .... x..."),
        D("3", "x... .... x... ....", 0.7),
        D("h", "x.x. x.x. x.x. x.x."),
      ],
    },
    {
      ch: HERO_CH,
      parts: [
        G("strings", "x - - - - - - -", { v: 0.45, o: 1 }),
        PAD("strings"),
        B("bass", "R R 5 R 8 R 5 R"),
        N("brass", HERO_MEL, { r: 1 }),
        H("brass", HERO_MEL, { r: 1, v: 0.55 }),
        N("bell", HERO_MEL, { r: 1, v: 0.35 }),
        A("pluck", "1 2 3 2", { v: 0.45 }),
        D("k", "x... ..x. x... ...."),
        D("s", ".... x..g x.g. x.gg"),
        D("3", "x... .... x... ....", 0.7),
        D("h", "xgxg xgxg xgxg xgxg"),
      ],
    },
    {
      ch: HERO_CH,
      up: 1,
      parts: [
        G("strings", "x - - - x - - -", { v: 0.45, o: 1 }),
        PAD("strings"),
        B("bass", "R 8 R 8 R 8 R 8"),
        N("brass", HERO_MEL, { r: 1 }),
        H("brass", HERO_MEL, { r: 1, v: 0.55 }),
        N("lead", HERO_MEL, { r: 1, v: 0.45 }),
        N("bell", HERO_MEL, { r: 1, v: 0.35 }),
        A("pluck", "1 2 3 2", { v: 0.45 }),
        D("k", "x... x... x... x..."),
        D("s", ".... x..g x.g. x.gg"),
        D("c", ".... x... .... x..."),
        D("3", "x... .... x... ....", 0.7),
        D("h", "xgxg xgxg xgxg xgxg"),
        D("y", every(4)),
      ],
    },
  ],
};

/** Lasers at night: F# minor synthwave, octave bass, a long-delay lead. */
const NEON_CH = "F#m D A E F#m D Bm C#7";
const NEON_MEL = `F#5 - - - - - E5 F#5 | A5 - - - F#5 - - - | E5 - - - - - C#5 E5 | G#5 - - - B5 - - - |
  A5 - - - G#5 - F#5 - | F#5 - - - D5 - A4 - | B4 - - - D5 - F#5 - | G#4 - - - B4 - E#5 -`;
const NEON_ARP = "1 2 3 2 4 3 2 3";
const neon: Song = {
  bpm: 116,
  fill: "1.2.3.1.",
  stages: [
    { ch: "F#m D A E", parts: [PAD("pad", { v: 0.8 }), A("pluck", NEON_ARP, { v: 0.65 }), B("bass", "R - - - - - - -", { v: 0.8 }), D("k", "x... .... x... ....")] },
    {
      ch: NEON_CH,
      parts: [PAD(), A("pluck", NEON_ARP, { v: 0.6 }), B("bass", "R 8 R 8 R 8 R 8"), N("lead", NEON_MEL), D("k", "x... .... x... ...."), D("s", ".... x... .... x..."), D("h", "..x. ..x. ..x. ..x.")],
    },
    {
      ch: NEON_CH,
      parts: [
        G("glass", "x - - - - - - -", { v: 0.55 }),
        PAD(),
        A("pluck", NEON_ARP, { v: 0.6 }),
        B("bass", "R 8 R 8 R 8 R 8"),
        N("lead", NEON_MEL),
        H("square", NEON_MEL, { v: 0.45 }),
        D("k", "x... ..x. x... ...."),
        D("s", ".... x... .... x..."),
        D("c", ".... x... .... x..."),
        D("h", "xgxg xgxg xgxg xgxg"),
        D("*", rest(3) + "........1.1.2.3."),
      ],
    },
    {
      ch: NEON_CH,
      up: 2,
      parts: [
        G("strings", "x - - - x - - -", { v: 0.45, o: 1 }),
        PAD("strings"),
        A("pluck", NEON_ARP, { v: 0.6 }),
        B("bass", "R 8 R 8 R 8 R 8"),
        N("lead", NEON_MEL),
        N("brass", NEON_MEL, { o: -1, v: 0.45 }),
        H("square", NEON_MEL, { v: 0.45 }),
        D("k", "x... x... x... x..."),
        D("s", ".... x... .... x..."),
        D("c", ".... x... .... x..."),
        D("h", "xgxg xgxg xgxg xgxg"),
        D("o", "..x. ..x. ..x. ..x.", 0.7),
        D("y", every(8)),
      ],
    },
  ],
};

/** The NU7 GRAND PRIX kart: a driving E minor winter ride, a dombra-like pluck riff and sleigh bells; F# minor for the last lap. */
const FROST_CH = "Em C G D Em C Am B7";
const FROST_MEL = `E5 . G5 A5 B5 - A5 G5 | E5 - - - D5 E5 G5 . | E5 . G5 A5 B5 - D6 B5 | A5 - - - G5 A5 B5 . |
  B5 . A5 G5 E5 - G5 A5 | B5 - A5 - G5 - E5 . | C6 - B5 - A5 - G5 - | F#5 - - - D#5 - B4 -`;
const FROST_RIFF = "1 . 2 1 3 . 2 1";
const frost: Song = {
  bpm: 146,
  fill: "s.s.1.2.",
  stages: [
    { ch: "Em C G D", parts: [PAD("strings", { v: 0.75 }), A("pluck", FROST_RIFF, { v: 0.7 }), B("bass", "R . R . R . R .", { v: 0.8 }), D("z", "x.x. x.x. x.x. x.x.", 0.6), D("k", "x... .... x... ....")] },
    {
      ch: FROST_CH,
      parts: [PAD("strings"), A("pluck", FROST_RIFF, { v: 0.6 }), B("bass", "R R 8 R R R 5 R"), N("lead", FROST_MEL), D("k", "x... ..x. x... ...."), D("s", ".... x... .... x..."), D("z", "xxxx xxxx xxxx xxxx", 0.5)],
    },
    {
      ch: FROST_CH,
      parts: [
        G("strings", "x - - - x - - -", { v: 0.45 }),
        PAD("strings"),
        A("pluck", FROST_RIFF, { v: 0.6 }),
        B("bass", "R R 8 R R R 5 R"),
        N("lead", FROST_MEL),
        N("bell", FROST_MEL, { o: 1, v: 0.35 }),
        D("k", "x... ..x. x.x. ...."),
        D("s", ".... x... .... x..x"),
        D("h", "xgxg xgxg xgxg xgxg"),
        D("z", "xxxx xxxx xxxx xxxx", 0.5),
      ],
    },
    {
      ch: FROST_CH,
      up: 2,
      parts: [
        G("strings", "x - - - x - - -", { v: 0.45, o: 1 }),
        PAD("strings"),
        A("pluck", FROST_RIFF, { v: 0.6 }),
        B("bass", "R 8 R 8 R 8 R 8"),
        N("lead", FROST_MEL),
        N("brass", FROST_MEL, { o: -1, v: 0.5 }),
        N("bell", FROST_MEL, { o: 1, v: 0.35 }),
        D("k", "x... x... x... x..."),
        D("s", ".... x... .... x..."),
        D("c", ".... x... .... x..."),
        D("h", "xgxg xgxg xgxg xgxg"),
        D("y", every(8)),
      ],
    },
  ],
};

/** The MARINA BAY kart: night-drive synthwave in D minor, rain-glass arps and a gated lead; E minor at the end. */
const MARINA_CH = "Dm Bb F C Dm Bb Gm A7";
const MARINA_MEL = `D5 - - F5 A5 - - G5 | F5 - E5 - D5 - - - | D5 - - F5 A5 - C6 - | A5 - G5 - E5 - - - |
  F5 - - G5 A5 - - Bb5 | A5 - G5 - F5 - D5 - | G5 - F5 - E5 - D5 - | C#5 - - - E5 - A4 -`;
const MARINA_ARP = "1 2 3 4 3 2 3 4";
const marina: Song = {
  bpm: 132,
  fill: "1.2.3.ss",
  stages: [
    { ch: "Dm Bb F C", parts: [PAD("pad", { v: 0.8 }), A("glass", MARINA_ARP, { v: 0.6 }), B("sub", "R - - - R - - -", { v: 0.8 }), D("k", "x... .... x... ....")] },
    {
      ch: MARINA_CH,
      parts: [PAD(), A("glass", MARINA_ARP, { v: 0.55 }), B("bass", "R 8 R 8 R 8 R 8"), N("lead", MARINA_MEL), D("k", "x... .... x... ...."), D("s", ".... x... .... x..."), D("h", "..x. ..x. ..x. ..x.")],
    },
    {
      ch: MARINA_CH,
      parts: [
        G("strings", "x - - - - - - -", { v: 0.4, o: 1 }),
        PAD(),
        A("glass", MARINA_ARP, { v: 0.55 }),
        B("bass", "R 8 R 8 R 8 R 8"),
        N("lead", MARINA_MEL),
        H("square", MARINA_MEL, { v: 0.4 }),
        D("k", "x... ..x. x... ...."),
        D("s", ".... x... .... x..."),
        D("c", ".... x... .... x..."),
        D("h", "xgxg xgxg xgxg xgxg"),
      ],
    },
    {
      ch: MARINA_CH,
      up: 2,
      parts: [
        G("strings", "x - - - x - - -", { v: 0.45, o: 1 }),
        PAD("strings"),
        A("glass", MARINA_ARP, { v: 0.55 }),
        B("bass", "R 8 R 8 R 8 R 8"),
        N("lead", MARINA_MEL),
        N("brass", MARINA_MEL, { o: -1, v: 0.45 }),
        H("square", MARINA_MEL, { v: 0.4 }),
        D("k", "x... x... x... x..."),
        D("s", ".... x... .... x..."),
        D("h", "xgxg xgxg xgxg xgxg"),
        D("o", "..x. ..x. ..x. ..x.", 0.7),
        D("y", every(8)),
      ],
    },
  ],
};

/** The hub: a calm lo-fi loop in D (maj7 chords, soft keys, a flute now and then). */
const LOBBY_A = "Gmaj7 F#m7 Em7 Dmaj7 Gmaj7 F#m7 Em7 Dmaj7";
const LOBBY_B = "Bm7 Gmaj7 Em7 A7sus4 Bm7 Gmaj7 Em9 A7";
const LOBBY_FLUTE = `F#5 - - - E5 - D5 - | B4 - - - - - . . | G5 - - - F#5 - E5 - | D5 - - - - - . . |
  F#5 - - - A5 - B5 - | D6 - - - B5 - - - | F#5 - E5 - G5 - - - | E5 - - - C#5 - - -`;
const LOBBY_BELL = `B4 - D5 - F#5 - - - | E5 - - - C#5 - - - | D5 - - - B4 - G4 - | A4 - - - - - . . |
  B4 - D5 - F#5 - A5 - | A5 - - - E5 - - - | G5 - F#5 - E5 - D5 - | C#5 - - - - - . .`;
const LOBBY_KEYS = "x - - . . x - .";
const LOBBY_DRUMS = [D("k", "x... ...x ..x. ....", 0.8), D("s", ".... x... .... x...", 0.6), D("h", "x.xg x.xg x.xg x.xg", 0.55)];
const lobby: Song = {
  bpm: 84,
  swing: 0.2,
  kit: "soft",
  fx: false,
  duck: 0.12,
  form: [0, 1, 2, 3, 2, 1],
  stages: [
    { ch: "Gmaj7 F#m7 Em7 Dmaj7", lp: 1400, parts: [C("keys", LOBBY_KEYS), PAD("glass", { v: 0.6 })] },
    { ch: LOBBY_A, lp: 1800, parts: [C("keys", LOBBY_KEYS), PAD("glass", { v: 0.6 }), B("sub", "R - - . . . 5 ."), ...LOBBY_DRUMS] },
    { ch: LOBBY_B, lp: 1800, parts: [C("keys", LOBBY_KEYS), PAD("glass", { v: 0.6 }), B("sub", "R - - . . . 5 ."), N("flute", LOBBY_FLUTE, { o: -1 }), ...LOBBY_DRUMS] },
    {
      ch: LOBBY_A,
      lp: 2000,
      parts: [C("keys", LOBBY_KEYS), PAD("glass", { v: 0.6 }), B("sub", "R - - . . . 5 ."), N("bell", LOBBY_BELL, { v: 0.75 }), A("pluck", "1 . . 2 . . 3 . . 4 . . 3 . 2 .", { v: 0.3 }), ...LOBBY_DRUMS],
    },
  ],
};

/** Between rounds: the lobby's lighter cousin in F, no kick, a bell tune every other time. */
const STAND_CH = "Bbmaj7 Am7 Gm7 Fmaj7 Bbmaj7 Am7 Gm7 C7sus4";
const STAND_MEL = `D5 - - - C5 - A4 - | C5 - - - - - . . | Bb4 - - - A4 - G4 - | A4 - - - - - . . |
  D5 - - - F5 - A5 - | E5 - - - C5 - - - | D5 - - - Bb4 - G4 - | C5 - - - - - . .`;
const STAND_KEYS = "x - - - . . x -";
const standings: Song = {
  bpm: 80,
  swing: 0.18,
  kit: "soft",
  fx: false,
  duck: 0,
  level: 1.05,
  form: [0, 1, 2, 1],
  stages: [
    { ch: "Bbmaj7 Am7 Gm7 Fmaj7", lp: 1300, parts: [C("keys", STAND_KEYS), PAD("glass", { v: 0.55 })] },
    { ch: STAND_CH, lp: 1500, parts: [C("keys", STAND_KEYS), PAD("glass", { v: 0.55 }), B("sub", "R - - - - - 5 -"), D("z", "x.x. x.x. x.x. x.x.", 0.45), D("r", ".... x... .... x...", 0.35)] },
    {
      ch: STAND_CH,
      lp: 1600,
      parts: [C("keys", STAND_KEYS), PAD("glass", { v: 0.55 }), B("sub", "R - - - - - 5 -"), N("bell", STAND_MEL, { v: 0.7 }), D("z", "x.x. x.x. x.x. x.x.", 0.45), D("r", ".... x... .... x...", 0.35)],
    },
  ],
};

/** The board game: a jaunty swung walk in G (marimba, flute, pizzicato, brushes). */
const BOARD_A = "G Em Am7 D7 G E7 Am7,D7 G";
const BOARD_B = "C Cm6 G/B E7 Am7 D7 G,Em Am7,D7";
const BOARD_MEL_A = `D5 . G5 . B5 . A5 G5 | E5 - - . G5 . E5 . | C5 . E5 . A5 . G5 E5 | F#5 - - - D5 . . . |
  D5 . G5 . B5 . D6 B5 | G#5 - - . B5 . G#5 . | A5 . C6 . F#5 . A5 . | G5 - - - - . . .`;
const BOARD_MEL_B = `E5 . G5 . C6 - - . | Eb5 . G5 . C6 - - . | D5 . G5 . B5 - - . | B5 . G#5 . E5 - D5 . |
  C5 . E5 . A5 . G5 . | F#5 . A5 . C6 - - . | B5 . D5 . E5 . G5 . | A5 - - . F#5 - - .`;
const WALK = "R 3 5 <";
const BRUSH = [D("k", "x... .... x... ....", 0.6), D("s", ".... x... .... x...", 0.45), D("z", "x.x. x.x. x.x. x.x.", 0.55)];
const board: Song = {
  bpm: 112,
  level: 1.2,
  shuffle: 0.3,
  kit: "soft",
  fx: false,
  duck: 0.1,
  form: [0, 1, 2, 3, 2],
  stages: [
    { ch: "G Em Am7 D7", lp: 1500, parts: [B("bass", WALK, { r: 4, v: 0.85 }), C("marimba", ". . x . . . x .", { v: 0.65 }), D("z", "x.x. x.x. x.x. x.x.", 0.5)] },
    { ch: BOARD_A, lp: 1800, parts: [B("bass", WALK, { r: 4 }), C("marimba", ". . x . . . x .", { v: 0.6 }), PAD("pad", { v: 0.3 }), N("flute", BOARD_MEL_A), ...BRUSH] },
    { ch: BOARD_B, lp: 1800, parts: [B("bass", WALK, { r: 4 }), C("pluck", ". . x . . . x .", { v: 0.55 }), PAD("pad", { v: 0.3 }), N("marimba", BOARD_MEL_B, { v: 1.3 }), ...BRUSH, D("w", "x... .... .... x...", 0.4)] },
    {
      ch: BOARD_A,
      lp: 2200,
      parts: [G("strings", "x - - - - - - -", { v: 0.32 }), B("bass", WALK, { r: 4 }), C("marimba", ". . x . . . x .", { v: 0.6 }), PAD("pad", { v: 0.3 }), N("flute", BOARD_MEL_A), H("bell", BOARD_MEL_A, { v: 0.45 }), ...BRUSH, D("r", ".... ..x. .... ..x.", 0.4)],
    },
  ],
};

/** The podium: a warm, unhurried victory lap in B♭ (after the fanfare, in the same key). */
const POD_A = "Bb F/A Gm7 Ebmaj7,F Bb F/A Gm7 Ebmaj7,F";
const POD_B = "Ebmaj7 F/Eb Dm7 Gm7 Cm7 F Bb/D Ebmaj7,F";
const POD_MEL = `D5 - F5 - Bb5 - - - | A5 - - - C6 - - - | Bb5 - - - G5 - F5 - | G5 - - - F5 - - - |
  D5 - F5 - Bb5 - D6 - | C6 - - - A5 - - - | Bb5 - - - D6 - C6 - | Bb5 - - - A5 - - -`;
const POD_LINE = `G5 - - - Bb5 - - - | A5 - - - C6 - - - | F5 - - - D5 - - - | Bb4 - - - D5 - - - |
  Eb5 - - - G5 - - - | F5 - - - A5 - - - | F5 - - - D5 - - - | Eb5 - - - C5 - - -`;
const POD_KEYS = "x - - x - - x -";
const POD_DRUMS = [D("k", "x... .... x... ....", 0.7), D("c", ".... x... .... x...", 0.55), D("z", "x.x. x.x. x.x. x.x.", 0.5)];
const podium: Song = {
  bpm: 100,
  swing: 0.1,
  kit: "soft",
  fx: false,
  duck: 0.12,
  form: [0, 1, 2, 3, 2],
  stages: [
    { ch: "Bb Ebmaj7,F", lp: 1500, parts: [PAD("strings", { v: 0.7 }), A("bell", "1 . 2 . 3 . 4 . 5 . 4 . 3 . 2 .", { v: 0.45 }), B("sub", "R - - - - - - -")] },
    { ch: POD_A, lp: 1900, parts: [PAD("strings", { v: 0.55 }), C("keys", POD_KEYS, { v: 0.8 }), B("sub", "R - - R - - 5 -"), N("bell", POD_MEL), ...POD_DRUMS] },
    { ch: POD_B, lp: 1900, parts: [PAD("strings", { v: 0.55 }), C("keys", POD_KEYS, { v: 0.8 }), B("sub", "R - - R - - 5 -"), N("flute", POD_LINE), ...POD_DRUMS] },
    {
      ch: POD_A,
      lp: 2300,
      parts: [
        G("strings", "x - - - - - - -", { v: 0.3, o: 1 }),
        PAD("strings", { v: 0.55 }),
        C("keys", POD_KEYS, { v: 0.8 }),
        B("sub", "R - - R - - 5 -"),
        N("bell", POD_MEL),
        H("flute", POD_MEL, { v: 0.5 }),
        A("pluck", "1 . 2 3 . 4 3 .", { o: 1, v: 0.3 }),
        ...POD_DRUMS,
        D("o", "..x. ..x. ..x. ..x.", 0.35),
      ],
    },
  ],
};

/** The winner's sting, in B♭ to lead into the podium: da, da-da DUM, ♭VI ♭VII I. */
const FAN_MEL = "F4 . F4 F4 Bb4 - - . D5 . D5 D5 F5 - - . | Db5 - - . Eb5 - - . F5 - - - - - - -";
const fanfare: Song = {
  bpm: 150,
  level: 1.3,
  once: true,
  fx: false,
  stages: [
    {
      ch: "Bb Gb,Ab,Bb,Bb",
      lp: 3200,
      parts: [
        N("brass", FAN_MEL, { r: 1 }),
        N("square", FAN_MEL, { r: 1, o: 1, v: 0.35 }),
        C("brass", "x . . . . . . . x . . . . . . . | x - - . x - - . x - - - - - - -", { r: 1, o: -1, v: 0.6 }),
        PAD("strings", { v: 0.8 }),
        B("bass", "R . . . . . . . R . . . . . . . | R - - . R - - . R - - - - - - -", { r: 1 }),
        A("bell", ". ".repeat(24) + "1 2 3 4 5 6 7 8", { v: 0.5 }),
        D("3", "x... x... x.x. xxxx | .... .... .... ....", 0.8),
        D("s", ".... .... gggx xxXX | .... .... .... ....", 0.8),
        D("k", "x... .... x... .... | X... X... X... ...."),
        D("y", ".... .... .... .... | x... x... X... ...."),
      ],
    },
  ],
};

/** The also-rans' sting: a cheeky sad trombone that still lands home in B♭. */
const lose: Song = {
  bpm: 132,
  level: 1.9,
  once: true,
  fx: false,
  stages: [
    {
      ch: "Gm,C7,F7,F7 Bb",
      lp: 1600,
      parts: [
        N("brass", "F4 - - . E4 - - . Eb4 - - - - - - - | D4 - - - - - - - - - - - . . . .", { r: 1 }),
        PAD("strings", { v: 0.6 }),
        B("sub", "R . . . R . . . R - - - - - - - | R - - - - - - - - - - - . . . .", { r: 1 }),
        D("w", "x... x... x... .... | .... .... .... ....", 0.6),
        D("3", ".... .... .... .... | x... .... .... ....", 0.6),
      ],
    },
  ],
};

export const SONGS = { race, bouncy, tense, chase, lattice, funk, hero, neon, frost, marina, lobby, standings, board, podium, fanfare, lose } satisfies Record<string, Song>;
export type SongKey = keyof typeof SONGS;

// ---- compiling a song to steps ----------------------------------------------------------------------

/** One event on a step: a note (d 0, p the patch) or a drum hit (d 1, p the drum). */
interface Ev {
  d: 0 | 1;
  p: number;
  n: number[];
  len: number;
  v: number;
}
interface CSec {
  len: number;
  ev: Ev[][];
  up: number;
  lp: number;
  /** The first chord's voicing and bass (the ending lands on it). */
  home: number[];
  homeBass: number;
}
interface CSong {
  bpm: number;
  stages: CSec[];
  intro: number;
  intense: number;
  form: number[] | null;
  once: boolean;
  swing: number;
  shuffle: number;
  kit: number;
  fill: Ev[][];
  fx: boolean;
  duck: number;
  level: number;
}
interface Slot {
  s: number;
  l: number;
  root: number;
  iv: number[];
  voi: number[];
  bm: number;
}

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUAL: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  "7": [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  sus: [0, 5, 7],
  "7sus4": [0, 5, 7, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  "9": [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  "7b9": [0, 4, 7, 10, 13],
  "7#9": [0, 4, 7, 10, 15],
};
const mod12 = (x: number) => ((x % 12) + 12) % 12;
const warn = (s: string) => console.warn(`music: ${s}`);

function midiOf(tok: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(tok);
  if (!m) return (warn(`bad note "${tok}"`), 0);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}
const toks = (s: string) => s.replace(/\|/g, " ").trim().split(/\s+/).filter(Boolean);
/** A melody's tokens as MIDI steps (0 rest, -1 hold). */
const notes = (s: string) => toks(s).map((t) => (t === "." ? 0 : t === "-" ? -1 : midiOf(t)));

/** Close-position voicing of `pcs` nearest the last one (and the middle of the keyboard). */
function voice(pcs: number[], prev: number[] | null, center: number): number[] {
  let best: number[] = [];
  let cost = Infinity;
  const n = pcs.length;
  for (let r = 0; r < n; r++)
    for (let lo = center - 12; lo <= center + 6; lo++) {
      if (mod12(lo) !== pcs[r]) continue;
      const v = [lo];
      for (let j = 1; j < n; j++) {
        let x = v[j - 1] + 1;
        while (mod12(x) !== pcs[(r + j) % n]) x++;
        v.push(x);
      }
      let c = Math.abs((v[0] + v[n - 1]) / 2 - center) * 0.4;
      if (prev && prev.length === n) for (let j = 0; j < n; j++) c += Math.abs(v[j] - prev[j]);
      else if (prev) c += Math.abs(v.reduce((a, b) => a + b, 0) / n - prev.reduce((a, b) => a + b, 0) / prev.length) * n;
      if (c < cost) ((cost = c), (best = v));
    }
  return best;
}

function slots(ch: string | undefined): Slot[] {
  const out: Slot[] = [];
  if (!ch) return out;
  let prev: number[] | null = null;
  let bass = 40;
  toks(ch).forEach((bar, bi) => {
    const parts = bar.split(",");
    const l = 16 / parts.length;
    parts.forEach((sym, k) => {
      const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym);
      const q = m ? QUAL[m[2]] : undefined;
      if (!m || !q) return warn(`bad chord "${sym}"`);
      const root = mod12(PC[m[1][0]] + (m[1][1] === "#" ? 1 : m[1][1] === "b" ? -1 : 0));
      const bpc = m[3] ? mod12(PC[m[3][0]] + (m[3][1] === "#" ? 1 : m[3][1] === "b" ? -1 : 0)) : root;
      // pads: ninth chords rootless (the bass has the root), the rest whole; close position
      const ivs = q.length >= 5 ? q.slice(1) : q;
      const pcs = [...new Set(ivs.map((x) => mod12(root + x)))].sort((a, b) => a - b);
      const voi = voice(pcs, prev, 64);
      prev = voi;
      // the bass note nearest the last one, in E1..E2-ish
      let bm = 36 + bpc;
      while (bm - bass > 6 && bm - 12 >= 33) bm -= 12;
      while (bass - bm > 6 && bm + 12 <= 47) bm += 12;
      bass = bm;
      out.push({ s: bi * 16 + k * l, l, root, iv: q, voi, bm });
    });
  });
  return out;
}

function slotAt(sl: Slot[], step: number): number {
  if (!sl.length) return -1;
  const len = sl[sl.length - 1].s + sl[sl.length - 1].l;
  const s = step % len;
  for (let i = sl.length - 1; i >= 0; i--) if (sl[i].s <= s) return i;
  return 0;
}

function bassTone(sl: Slot, nx: Slot, tok: string): number {
  const R = sl.bm;
  const cr = R - mod12(R - sl.root);
  const has = (...xs: number[]) => xs.find((x) => sl.iv.includes(x));
  const up = (x: number) => {
    let m = cr + x;
    while (m < R) m += 12;
    return m;
  };
  let nb = nx.bm;
  while (nb - R > 7) nb -= 12;
  while (R - nb > 7) nb += 12;
  switch (tok) {
    case "R":
      return R;
    case "8":
      return R + 12;
    case "3":
      return up(has(3, 4, 5, 2) ?? 4);
    case "5":
      return up(has(7, 6, 8) ?? 7);
    case "7":
      return up(has(10, 11, 9) ?? 12);
    case "2":
    case "9":
      return up(2);
    case "4":
      return up(5);
    case "6":
      return up(9);
    case "<":
      return nb - 1;
    case ">":
      return nb + 1;
  }
  warn(`bad bass token "${tok}"`);
  return 0;
}

const cache = new WeakMap<Song, CSong>();
const PIDX = (i: Patch) => PATCHES.indexOf(i);

function compileSection(sec: Section, idx: number): CSec {
  const sl = slots(sec.ch);
  const chordLen = sl.length ? sl[sl.length - 1].s + sl[sl.length - 1].l : 0;
  // the loop: the chords or the longest pattern, whole bars
  let len = chordLen;
  const plen = (p: Part) => {
    const r = p.r ?? (p.a !== undefined || p.m || p.p !== undefined ? 1 : 2);
    const s = p.p !== undefined ? p.p.replace(/[\s|]/g, "").length : p.m ? p.m.length : toks(p.n ?? p.h ?? p.b ?? p.a ?? p.c ?? p.g ?? "").length * r;
    return [s, r] as const;
  };
  for (const p of sec.parts) len = Math.max(len, plen(p)[0]);
  len = Math.max(16, Math.ceil(len / 16) * 16);
  const ev: Ev[][] = Array.from({ length: len }, () => []);
  const push = (s: number, e: Ev) => s < len && ev[s].push(e);
  for (const p of sec.parts) {
    const [pl, r] = plen(p);
    if (!pl && (p.d || p.n !== undefined || p.h !== undefined || p.m || p.b !== undefined || p.a !== undefined || p.c !== undefined || p.g !== undefined)) continue;
    const v = p.v ?? 1;
    const o = 12 * (p.o ?? 0);
    if (pl && len % pl) warn(`stage ${idx}: a ${pl}-step pattern in a ${len}-step loop`);
    if (p.d) {
      const s = (p.p ?? "").replace(/[\s|]/g, "");
      for (let at = 0; at < len; at += s.length)
        for (let j = 0; j < s.length; j++) {
          const c = s[j];
          if (c === ".") continue;
          if (p.d === "*") {
            const k = DRUMS.indexOf(c.toLowerCase());
            if (k < 0 || k === 12) warn(`bad kit letter "${c}"`);
            else push(at + j, { d: 1, p: k, n: [], len: 1, v: v * (c !== c.toLowerCase() ? 1 : 0.78) });
          } else push(at + j, { d: 1, p: DRUMS.indexOf(p.d), n: [], len: 1, v: v * (c === "X" ? 1 : c === "g" ? 0.4 : 0.78) });
        }
      continue;
    }
    if (!p.i) continue;
    const pi = PIDX(p.i);
    if (p.n !== undefined || p.h !== undefined || p.m) {
      const seq = p.m ?? notes(p.n ?? p.h ?? "");
      for (let at = 0; at < len; at += pl)
        for (let j = 0; j < seq.length; j++) {
          const m = seq[j];
          if (m <= 0) continue;
          let h = 1;
          while (j + h < seq.length && seq[j + h] === -1) h++;
          const s = at + j * r;
          if (p.h === undefined) {
            push(s, { d: 0, p: pi, n: [m + o], len: h * r, v });
            continue;
          }
          // the harmony: the chord tone a third to a sixth below
          const k = slotAt(sl, s);
          if (k < 0) continue;
          const pcs = sl[k].iv.map((x) => mod12(sl[k].root + x));
          for (let x = m - 3; x >= m - 9; x--)
            if (pcs.includes(mod12(x))) {
              push(s, { d: 0, p: pi, n: [x + o], len: h * r, v });
              break;
            }
        }
      continue;
    }
    if (!sl.length) continue;
    if (p.g !== undefined) {
      const seq = toks(p.g);
      let last = 66 + o;
      for (let at = 0; at < len; at += pl)
        for (let j = 0; j < seq.length; j++) {
          if (seq[j] === "." || seq[j] === "-") continue;
          let h = 1;
          while (j + h < seq.length && seq[j + h] === "-") h++;
          const s = at + j * r;
          const cur = sl[slotAt(sl, s)];
          const third = cur.iv.find((x) => x === 3 || x === 4) ?? cur.iv.find((x) => x === 5 || x === 2) ?? 4;
          const sev = cur.iv.find((x) => x === 10 || x === 11 || x === 9) ?? 7;
          const pcs = [mod12(cur.root + third), mod12(cur.root + sev)];
          let best = last;
          let bd = 99;
          for (let x = 66 + o - 8; x <= 66 + o + 8; x++)
            if (pcs.includes(mod12(x)) && Math.abs(x - last) + Math.abs(x - 66 - o) * 0.25 < bd) ((bd = Math.abs(x - last) + Math.abs(x - 66 - o) * 0.25), (best = x));
          last = best;
          push(s, { d: 0, p: pi, n: [best], len: h * r, v });
        }
      continue;
    }
    if (p.b !== undefined || p.a !== undefined || p.c !== undefined) {
      const seq = toks(p.b ?? p.a ?? p.c ?? "");
      for (let at = 0; at < len; at += pl)
        for (let j = 0; j < seq.length; j++) {
          const t = seq[j];
          if (t === "." || t === "-") continue;
          let h = 1;
          while (j + h < seq.length && seq[j + h] === "-") h++;
          const s = at + j * r;
          const k = slotAt(sl, s);
          const cur = sl[k];
          let ns: number[];
          if (p.b !== undefined) ns = [bassTone(cur, sl[(k + 1) % sl.length], t)];
          else if (p.a !== undefined) {
            const d = Number(t) - 1;
            if (!(d >= 0)) {
              warn(`bad arpeggio token "${t}"`);
              continue;
            }
            ns = [cur.voi[d % cur.voi.length] + 12 * Math.floor(d / cur.voi.length)];
          } else ns = cur.voi.slice();
          push(s, { d: 0, p: pi, n: ns.map((x) => x + o), len: h * r, v });
        }
      continue;
    }
    // a pad: the chords held, a repeated chord tied over
    for (let at = 0; at < len; at += chordLen)
      for (let k = 0; k < sl.length; k++) {
        if (k > 0 && sl[k].voi.join() === sl[k - 1].voi.join()) continue;
        let l = sl[k].l;
        for (let j = k + 1; j < sl.length && sl[j].voi.join() === sl[k].voi.join(); j++) l += sl[j].l;
        push(at + sl[k].s, { d: 0, p: pi, n: sl[k].voi.map((x) => x + o), len: l, v });
      }
  }
  return { len, ev, up: sec.up ?? 0, lp: sec.lp ?? [1100, 1900, 2700, 3400][Math.min(3, idx)], home: sl[0]?.voi ?? [], homeBass: sl[0]?.bm ?? 36 };
}

/** The old step format, given stages: bass and harmony first, the lead from bar 3, a shaker, a bell. */
function legacy(s: Song): Section[] {
  const base: Part[] = [];
  if (s.bass) base.push({ i: "bass", m: s.bass });
  if (s.harm) base.push({ i: "pluck", m: s.harm, v: 0.8 });
  if (s.drums) base.push({ d: "*", p: s.drums });
  const lead: Part[] = s.lead ? [{ i: s.wave === "sawtooth" ? "lead" : s.wave === "triangle" || s.wave === "sine" ? "flute" : "square", m: s.lead }] : [];
  const shaker = D("z", "xgxg");
  const bell: Part[] = s.lead ? [{ i: "bell", m: s.lead, v: 0.4 }] : [];
  return [{ parts: base }, { parts: [...base, ...lead] }, { parts: [...base, ...lead, shaker] }, { parts: [...base, ...lead, shaker, ...bell] }];
}

function compile(s: Song): CSong {
  const hit = cache.get(s);
  if (hit) return hit;
  const old = !s.stages;
  const secs = (s.stages ?? legacy(s)).map(compileSection);
  while (secs.length < 4) secs.push(secs[secs.length - 1]);
  const fill: Ev[][] = [];
  for (const c of s.fill ?? "s.s.sSSS") {
    const k = DRUMS.indexOf(c.toLowerCase());
    fill.push(c === "." || k < 0 || k === 12 ? [] : [{ d: 1, p: k, n: [], len: 1, v: c !== c.toLowerCase() ? 1 : 0.75 }]);
  }
  const c: CSong = {
    bpm: s.bpm,
    stages: secs,
    intro: s.intro ?? (old ? 2 : secs[0].len / 16),
    intense: s.intense ?? 22,
    form: s.form ?? null,
    once: !!s.once,
    swing: s.swing ?? 0,
    shuffle: s.shuffle ?? 0,
    kit: ["pop", "soft", "deep"].indexOf(s.kit ?? "pop"),
    fill,
    fx: s.fx ?? !s.form,
    duck: s.duck ?? 0.3,
    level: s.level ?? 1,
  };
  cache.set(s, c);
  return c;
}

// ---- the engine ------------------------------------------------------------------------------------

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** Seconds scheduled ahead, and the scheduler's period (ms). */
const LOOK = 0.2;
const TICK = 40;
/** The music's level into the mixer's music bus (before a song's own trim). */
const VOL = 0.68;
/** The mix's trim before the bus (the stage lifts multiply it). */
const TRIM = 0.42;
/** A finished voice lets go of the graph (one shared handler: no closure per note). */
const END = function (this: AudioScheduledSourceNode) {
  this.disconnect();
};

interface Res {
  noise: AudioBuffer;
  soft: PeriodicWave;
  flute: PeriodicWave;
  chip: PeriodicWave;
  sub: PeriodicWave;
  drive: Float32Array<ArrayBuffer>;
}
const resources = new WeakMap<BaseAudioContext, Res>();
/** Per audio context, made once: a second of noise, the soft waveforms, a drive curve. */
function res(ac: BaseAudioContext): Res {
  let r = resources.get(ac);
  if (r) return r;
  const sr = ac.sampleRate;
  const noise = ac.createBuffer(1, sr, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const wave = (amp: (n: number) => number, cos = false) => {
    const re = new Float32Array(32);
    const im = new Float32Array(32);
    for (let n = 1; n < 32; n++) (cos ? re : im)[n] = amp(n);
    return ac.createPeriodicWave(re, im);
  };
  const drive = new Float32Array(1024);
  for (let i = 0; i < drive.length; i++) {
    const x = (i / (drive.length - 1)) * 2 - 1;
    drive[i] = Math.tanh(x * 1.8) / Math.tanh(1.8);
  }
  r = {
    noise,
    // a square with its edges rounded off (odd harmonics, falling fast)
    soft: wave((n) => (n % 2 ? Math.pow(n, -1.45) : 0)),
    flute: wave((n) => [0, 1, 0.24, 0.07, 0.035, 0.012][n] ?? 0),
    // a 25 % pulse: the bright, hollow chip lead
    chip: wave((n) => (Math.sin(Math.PI * n * 0.25) / n) * Math.pow(0.96, n), true),
    // a sub with its 2nd and 3rd harmonics (a phone's speaker can't play the fundamental)
    sub: wave((n) => [0, 1, 0.32, 0.1, 0.03][n] ?? 0),
    drive,
  };
  resources.set(ac, r);
  return r;
}

interface Ch {
  c: GainNode;
  l?: StereoPannerNode;
  r?: StereoPannerNode;
  f?: BiquadFilterNode;
  /** A shared vibrato (strings): connect it to an oscillator's detune. */
  vib?: GainNode;
}
/** Played from the instruments' samples (src/audio/instruments.ts): a buffer source a note. */
const SAMPLED: Partial<Record<Patch, Struck>> = { keys: "keys", bell: "bell", marimba: "marimba", pluck: "pluck", clav: "clav", funk: "funk" };
/** Damping after a sampled note's end (s, a time constant); -1 rings out. */
const DAMP: Record<Struck, number> = { keys: 0.12, bell: -1, marimba: -1, pluck: 0.18, clav: 0.03, funk: 0.05 };
// pan, reverb send, delay send, chorus send, stereo pair, a stage-driven low-pass
const CHAN: Record<Patch, [number, number, number, number, 0 | 1, 0 | 1]> = {
  pad: [0, 0.3, 0, 0.5, 1, 1],
  strings: [0, 0.36, 0, 0.45, 1, 1],
  glass: [0, 0.42, 0.1, 0.35, 1, 1],
  keys: [-0.18, 0.22, 0.05, 0.2, 0, 0],
  bell: [0.22, 0.34, 0.2, 0, 0, 0],
  marimba: [-0.25, 0.18, 0.04, 0, 0, 0],
  pluck: [0.28, 0.16, 0.26, 0.12, 0, 0],
  clav: [0.3, 0.08, 0, 0.12, 0, 0],
  lead: [0, 0.16, 0.18, 0.3, 0, 0],
  flute: [0.06, 0.28, 0.14, 0, 0, 0],
  square: [-0.08, 0.14, 0.14, 0.12, 0, 0],
  brass: [-0.1, 0.2, 0.04, 0.15, 0, 0],
  bass: [0, 0, 0, 0, 0, 0],
  sub: [0, 0, 0, 0, 0, 0],
  funk: [0, 0.03, 0, 0, 0, 0],
};
/** The instruments' levels against each other (melody up front, drums and bass under it). */
const GAIN: Record<Patch, number> = {
  pad: 1.5,
  strings: 1.5,
  glass: 1,
  keys: 0.42,
  bell: 0.3,
  marimba: 0.38,
  pluck: 0.36,
  clav: 0.4,
  lead: 1.35,
  flute: 1.3,
  square: 2,
  brass: 1.7,
  bass: 0.55,
  sub: 0.55,
  funk: 0.5,
};
/** The drums' level, by kit (pop, soft, deep). */
const DGAIN = [0.62, 0.7, 0.62];
/** The mix's lift by stage (intro, main, intense, finale), for songs that build. */
const LIFT = [0.8, 1, 1.12, 1.22];
/** A drum's mixer channel: kick, snare, clap, hats (h o z), percussion (r w toms), crash, risers. */
const DCH = [0, 1, 2, 3, 3, 3, 4, 4, 4, 4, 4, 5, 0, 6];
/** The little fills at the end of an 8-bar phrase (kit letters, the bar's last four sixteenths). */
const PFILL = [".ssS", "1.23", "s.2S", "..sS", "ss3."];

class Engine {
  readonly out: GainNode;
  readonly vol: number;
  /** [time, stage] at every change (the bench reads it). */
  readonly log: [number, number][] = [];
  stage = 0;
  done = false;
  /** The beat grid: the anchor now and the one before (a tempo change scheduled ahead). */
  aT: number;
  aB = 0;
  aS: number;
  pT: number;
  pB = 0;
  pS: number;
  solo: string[] | null = null;
  /** When it ends with a final chord (end()): the downbeat it lands on. */
  endAt = 0;
  /** When the last thing it plays has rung out (s, on the context's clock). */
  quietAt = Infinity;

  private nodes: AudioNode[] = [];
  private ch: (Ch | null)[] = PATCHES.map(() => null);
  private dch: (Ch | null)[] = [null, null, null, null, null, null, null];
  private duck: GainNode;
  private dry: GainNode;
  private pre: GainNode;
  /** The sends' level follows `out` (a song's reverb tail ducks and fades with it). */
  private fx: GainNode;
  private fxc: GainNode;
  private rev: GainNode;
  private cho: GainNode;
  private dly: GainNode;
  private dl: DelayNode;
  private dr: DelayNode;
  private r: Res;
  private k = 1;
  private pos = 0;
  private n = 0;
  private next: number;
  private t0: number;
  private want = -1;
  private manual = false;
  private barIn = 0;
  private formI = 0;
  private riserOn = false;
  private seed = 0x2f6b;
  private hits = new Uint16Array(16);
  private pfill = -1;
  private crashNext = false;

  constructor(
    readonly ac: BaseAudioContext,
    mix: Mixer,
    readonly song: CSong,
    start: number,
  ) {
    this.r = res(ac);
    this.next = this.t0 = this.aT = this.pT = start;
    this.aS = this.pS = 15 / song.bpm;
    const node = <T extends AudioNode>(x: T) => (this.nodes.push(x), x);
    const gain = (v: number) => {
      const g = node(ac.createGain());
      g.gain.value = v;
      return g;
    };
    // (the ambient songs sit a little lower: they play under talk and menus)
    this.vol = VOL * song.level * (song.form ? 0.88 : 1);
    this.out = gain(this.vol);
    this.out.connect(mix.music);
    const hp = node(ac.createBiquadFilter());
    hp.type = "highpass";
    hp.frequency.value = 30;
    const pre = gain(TRIM * (song.form || song.once ? 1 : LIFT[0]));
    this.pre = pre;
    pre.connect(hp).connect(this.out);
    this.duck = gain(1);
    this.dry = gain(1);
    this.duck.connect(pre);
    this.dry.connect(pre);
    // the sends: the mixer's hall and chorus (shared by every song), through `fx`
    this.fx = gain(this.vol * TRIM);
    this.fxc = gain(this.vol * TRIM);
    this.rev = gain(1);
    this.cho = gain(1);
    this.rev.connect(this.fx).connect(mix.hallSend);
    this.cho.connect(this.fxc).connect(mix.chorusSend);
    // a ping-pong delay, a dotted eighth (into the ducked mix: it breathes with the kick)
    this.dly = gain(1);
    this.dl = node(ac.createDelay(2));
    this.dr = node(ac.createDelay(2));
    this.dl.delayTime.value = this.dr.delayTime.value = 3 * this.aS;
    const pl = node(ac.createStereoPanner());
    const pr = node(ac.createStereoPanner());
    pl.pan.value = -0.65;
    pr.pan.value = 0.65;
    const fb = gain(0.34);
    const lp = node(ac.createBiquadFilter());
    lp.frequency.value = 2800;
    const dOut = gain(0.55);
    this.dly.connect(this.dl);
    this.dl.connect(pl).connect(dOut);
    this.dl.connect(this.dr);
    this.dr.connect(pr).connect(dOut);
    this.dr.connect(fb).connect(lp).connect(this.dl);
    dOut.connect(this.duck);
    this.log.push([start, 0]);
  }

  /** The tempo factor; ≥ 1.1 lifts to the finale. */
  setRate(k: number, now: number) {
    k = Math.max(0.5, Math.min(2, k));
    if (k !== this.k) {
      this.k = k;
      const d = (3 * 15) / (this.song.bpm * k);
      this.dl.delayTime.setTargetAtTime(d, now, 0.08);
      this.dr.delayTime.setTargetAtTime(d, now, 0.08);
    }
    if (k >= 1.1 && this.stage < 3 && this.want < 3 && !this.song.once) this.want = 3;
  }

  /** A stage at the next bar line (explicit: no more automatic steps). */
  request(n: number, manual: boolean) {
    if (this.song.once) return;
    this.want = Math.max(0, Math.min(3, Math.round(n)));
    if (manual) this.manual = true;
  }

  /** The music's own level (a sting ducks it): the dry mix and its sends together. */
  level(v: number, t: number, tc: number) {
    for (const p of [this.out.gain, this.fx.gain, this.fxc.gain]) {
      p.cancelScheduledValues(t);
      p.setTargetAtTime(p === this.out.gain ? v : v * TRIM, t, tc);
    }
  }
  /** Back to its own level after `t`. */
  restore(t: number, tc: number) {
    this.out.gain.setTargetAtTime(this.vol, t, tc);
    this.fx.gain.setTargetAtTime(this.vol * TRIM, t, tc);
    this.fxc.gain.setTargetAtTime(this.vol * TRIM, t, tc);
  }

  /** Fades out from `t`; nothing more is scheduled. */
  fade(t: number, secs: number) {
    this.done = true;
    this.quietAt = Math.min(this.quietAt, t + secs + 2.5);
    this.level(0, t, Math.max(0.01, secs) / 4);
  }

  /**
   * Ends on a final chord: the groove plays on to the next beat, where the stage's home chord
   * lands with a crash and rings out (the finish of a game).
   */
  end(now: number) {
    if (this.done || this.endAt) return;
    const spb = 15 / (this.song.bpm * this.k);
    const k = (4 - (this.pos & 3)) & 3;
    this.endAt = Math.max(this.next + k * spb, now + 0.04);
    if (this.song.once) this.endAt = now + 0.04;
  }

  /** Lets go of the whole graph. */
  dispose() {
    for (const n of this.nodes) n.disconnect();
    this.nodes.length = 0;
  }

  /** Back on time after a pause (muted, a hidden tab): if the next step is before `late`, it moves to `to`
   * and the song resumes where it was, never in a burst. */
  resync(late: number, to: number) {
    if (this.next >= late) return;
    const d = to - this.next;
    this.next += d;
    this.t0 += d;
    if (this.endAt) this.endAt += d;
    this.pT = this.aT = this.next;
    this.pB = this.aB = this.n / 4;
  }

  /** The one-shot's length in seconds. */
  length() {
    return (this.song.stages[0].len * 15) / this.song.bpm;
  }

  /** Schedules every step that starts before `until`. */
  pump(until: number) {
    const S = this.song;
    while (!this.done && this.next < until) {
      if (this.endAt && this.next >= this.endAt - 1e-4) {
        this.finale(this.endAt);
        return;
      }
      const spb = 15 / (S.bpm * this.k);
      if (spb !== this.aS) {
        this.pT = this.aT;
        this.pB = this.aB;
        this.pS = this.aS;
        this.aT = this.next;
        this.aB = this.n / 4;
        this.aS = spb;
      }
      const inBar = this.pos & 15;
      if (inBar === 0) this.bar(this.next, spb);
      const sec = S.stages[this.stage];
      const pend = this.want >= 0 && this.want !== this.stage && S.fx;
      if (pend && !this.riserOn && inBar <= 10) this.riser(this.next, this.next + (16 - inBar) * spb);
      const fillAt = pend ? inBar - (16 - S.fill.length) : -1;
      let t = this.next;
      if (inBar & 1) t += S.swing * spb;
      if ((inBar & 3) === 2) t += S.shuffle * 2 * spb;
      const acc = inBar % 4 === 0 ? 1 : inBar % 2 === 0 ? 0.9 : 0.82;
      const evs = sec.ev[this.pos];
      for (let i = 0; i < evs.length; i++) {
        const e = evs[i];
        const h = 0.94 + this.rnd() * 0.12;
        if (e.d) {
          if (fillAt < 0 || e.p === 11) this.hit(e.p, t + (this.rnd() - 0.5) * 0.003, e.v * h);
        } else for (let j = 0; j < e.n.length; j++) this.voice(e.p, t + (this.rnd() - 0.5) * 0.004, e.n[j] + sec.up, e.len * spb, e.v * acc * h);
      }
      if (fillAt >= 0) {
        const f = S.fill[fillAt];
        for (let i = 0; i < f.length; i++) this.hit(f[i].p, t, f[i].v * (0.75 + (0.25 * fillAt) / S.fill.length));
      } else if (this.pfill >= 0 && inBar >= 12) {
        // the phrase's little fill
        const c = PFILL[this.pfill][inBar - 12];
        const d = DRUMS.indexOf(c.toLowerCase());
        if (c !== "." && d >= 0) this.hit(d, t, (c === c.toLowerCase() ? 0.6 : 0.85) * (0.8 + 0.07 * (inBar - 12)));
      }
      this.pos++;
      this.n++;
      this.next += spb;
      if (this.pos >= sec.len) {
        this.pos = 0;
        if (S.once) {
          this.done = true;
          this.quietAt = this.next + 3;
        }
      }
    }
  }

  private rnd() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** A bar line: a waiting change lands; then whether this bar is the last before the next one. */
  private bar(t: number, spb: number) {
    const S = this.song;
    if (this.want >= 0) {
      const w = this.want;
      this.want = -1;
      if (w !== this.stage) this.go(w, t, spb);
    } else if (this.crashNext) this.hit(11, t, 0.45);
    this.crashNext = false;
    if (this.want < 0 && !this.manual && !S.once) {
      const last = this.pos + 16 >= S.stages[this.stage].len;
      if (S.form) {
        if (last) {
          this.formI = this.formI + 1 < S.form.length ? this.formI + 1 : Math.min(1, S.form.length - 1);
          this.want = S.form[this.formI];
        }
      } else if (this.stage === 0 && this.barIn + 1 >= S.intro) this.want = 1;
      else if (this.stage === 1 && S.intense > 0 && t + 16 * spb - this.t0 >= S.intense && (this.barIn + 1) % 4 === 0) this.want = 2;
      if (this.want >= 0 && this.want !== this.stage && S.fx) this.riser(t, t + 16 * spb);
    }
    // the last bar of an 8-bar phrase (and no change coming): a little fill, a light crash after it
    this.pfill = -1;
    if (S.fx && !S.once && this.stage >= 1 && this.want < 0 && this.barIn % 8 === 7) {
      this.pfill = (this.n >> 7) % PFILL.length;
      this.crashNext = true;
    }
    this.barIn++;
  }

  private go(w: number, t: number, spb: number) {
    const prev = this.stage;
    this.stage = w;
    this.pos = 0;
    this.barIn = 0;
    this.riserOn = false;
    if (w !== prev) this.log.push([t, w]);
    // the pads open up, the mix lifts
    const lp = this.song.stages[w].lp;
    if (!this.song.form) this.pre.gain.setTargetAtTime(TRIM * LIFT[w], t, spb * 3);
    for (const c of this.ch) if (c?.f) c.f.frequency.setTargetAtTime(lp, t, spb * 4);
    if (this.song.fx && w > prev) {
      this.hit(11, t, w === 1 ? 0.55 : 0.9);
      // the big moments land with a sub drop
      if (w >= 2) this.hit(BOOM, t, w === 3 ? 0.9 : 0.6);
    }
  }

  /** The ending: the home chord of the stage, with a crash, a low drum, the bass; then it rings out. */
  private finale(t: number) {
    this.done = true;
    const sec = this.song.stages[this.stage];
    const up = sec.up;
    const v = 1;
    this.hit(0, t, 1);
    this.hit(11, t, 1);
    this.hit(10, t, 0.8);
    if (this.song.fx) this.hit(BOOM, t, 0.7);
    const home = sec.home;
    const pad: Patch = this.ch[PIDX("strings")] || !this.ch[PIDX("pad")] ? "strings" : "pad";
    for (const m of home) {
      this.voice(PIDX(pad), t, m + up, 1.5, v);
      this.voice(PIDX("brass"), t, m + up, 0.9, 0.55);
    }
    if (home.length) {
      this.voice(PIDX("bell"), t, home[home.length - 1] + up + 12, 1.2, 0.8);
      this.voice(PIDX("bass"), t, sec.homeBass + up, 1.2, 1);
    }
    this.quietAt = t + 3.2;
    // (the tail fades a little early so nothing hangs)
    for (const p of [this.out.gain, this.fx.gain, this.fxc.gain]) p.setTargetAtTime(0, t + 1.6, 0.35);
  }

  // ---- the mixer

  private chan(p: number): Ch {
    const have = this.ch[p];
    if (have) return have;
    const name = PATCHES[p];
    const [pan, rev, dly, cho, st, lp] = CHAN[name];
    const c = this.mk(pan, rev, dly, cho, true, lp ? ["lowpass", this.song.stages[this.stage].lp, 0.6] : null, !!st, name === "bass" || name === "funk");
    // pads breathe: a slow sway of their low-pass; strings share one vibrato
    if (c.f && (name === "pad" || name === "glass")) {
      const l = this.ac.createOscillator();
      l.frequency.value = name === "pad" ? 0.11 : 0.07;
      const g = this.ac.createGain();
      g.gain.value = this.song.stages[this.stage].lp * 0.22;
      l.connect(g).connect(c.f.frequency);
      l.start();
      this.nodes.push(l, g);
    }
    if (name === "strings") {
      const l = this.ac.createOscillator();
      l.frequency.value = 5.3;
      const g = this.ac.createGain();
      g.gain.value = 7;
      l.connect(g);
      l.start();
      this.nodes.push(l, g);
      c.vib = g;
    }
    this.ch[p] = c;
    return c;
  }

  private dchan(i: number): Ch {
    const have = this.dch[i];
    if (have) return have;
    const soft = this.song.kit === 1;
    // pan, reverb, (no delay), filter
    const spec: [number, number, [BiquadFilterType, number, number] | null][] = [
      [0, 0, null],
      [0.05, soft ? 0.12 : 0.18, soft ? ["lowpass", 5000, 0.5] : null],
      [-0.05, 0.25, null],
      [0.18, 0.05, null],
      [-0.22, 0.15, null],
      [0, 0.3, null],
      [0, 0.45, null],
    ];
    const [pan, rev, filt] = spec[i];
    const c = this.mk(pan, rev, 0, 0, false, filt, false, false);
    this.dch[i] = c;
    return c;
  }

  private mk(pan: number, rev: number, dly: number, cho: number, ducked: boolean, filt: [BiquadFilterType, number, number] | null, stereo: boolean, drive: boolean): Ch {
    const ac = this.ac;
    const g = ac.createGain();
    this.nodes.push(g);
    let head: AudioNode = g;
    let f: BiquadFilterNode | undefined;
    if (filt) {
      f = ac.createBiquadFilter();
      f.type = filt[0];
      f.frequency.value = filt[1];
      f.Q.value = filt[2];
      head.connect(f);
      head = f;
      this.nodes.push(f);
    }
    if (drive) {
      // a warm drive (the bass's growl)
      const w = ac.createWaveShaper();
      w.curve = this.r.drive;
      head.connect(w);
      head = w;
      this.nodes.push(w);
    }
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    head.connect(p);
    p.connect(ducked ? this.duck : this.dry);
    this.nodes.push(p);
    for (const [amt, to] of [
      [rev, this.rev],
      [dly, this.dly],
      [cho, this.cho],
    ] as const) {
      if (!amt) continue;
      const s = ac.createGain();
      s.gain.value = amt;
      p.connect(s).connect(to);
      this.nodes.push(s);
    }
    const c: Ch = { c: g, f };
    if (stereo) {
      c.l = ac.createStereoPanner();
      c.r = ac.createStereoPanner();
      c.l.pan.value = -0.6;
      c.r.pan.value = 0.6;
      c.l.connect(g);
      c.r.connect(g);
      this.nodes.push(c.l, c.r);
    }
    return c;
  }

  // ---- the instruments

  private osc(type: OscillatorType | PeriodicWave, f: number, t: number, end: number, det = 0): OscillatorNode {
    const o = this.ac.createOscillator();
    if (typeof type === "string") o.type = type as OscillatorType;
    else o.setPeriodicWave(type);
    o.frequency.value = f;
    if (det) o.detune.value = det;
    o.start(t);
    o.stop(end);
    o.onended = END;
    return o;
  }

  /** Attack, decay to a sustain, release at the note's end. */
  private env(t: number, a: number, pk: number, sus: number, dec: number, dur: number, rel: number): GainNode {
    const g = this.ac.createGain();
    const p = g.gain;
    a = Math.min(a, dur * 0.5);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(pk, t + a);
    if (sus < 1) p.setTargetAtTime(pk * sus, t + a, dec);
    p.setTargetAtTime(0, t + dur, rel / 4);
    return g;
  }

  /** Vibrato that eases in, on a long note (one LFO for all of a voice's oscillators). */
  private vib(t: number, end: number, cents: number, os: OscillatorNode[]) {
    const l = this.osc("sine", 5.2, t, end);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0, t + 0.18);
    g.gain.linearRampToValueAtTime(cents, t + 0.5);
    l.connect(g);
    for (const o of os) g.connect(o.detune);
  }

  private lowpass(f0: number, f1: number, t: number, tc: number, q: number): BiquadFilterNode {
    const f = this.ac.createBiquadFilter();
    f.Q.value = q;
    f.frequency.setValueAtTime(Math.min(f0, 16000), t);
    f.frequency.setTargetAtTime(Math.min(f1, 16000), t + 0.002, tc);
    return f;
  }

  private voice(p: number, t: number, m: number, dur: number, v: number) {
    const name = PATCHES[p];
    if (this.solo && !this.solo.includes(name)) return;
    v *= GAIN[name];
    const ac = this.ac;
    const ch = this.chan(p);
    const smp = SAMPLED[name];
    if (smp) {
      // a struck instrument: its rendered zone, re-pitched; damped at the note's end (or let ring)
      const [buf, rate] = struck(ac, smp, m);
      const s = ac.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = rate;
      const g = ac.createGain();
      g.gain.value = v;
      s.connect(g).connect(ch.c);
      s.onended = END;
      s.start(t);
      const d = DAMP[smp];
      if (d >= 0) {
        g.gain.setValueAtTime(v, t + dur);
        g.gain.setTargetAtTime(0, t + dur, d);
        s.stop(t + dur + d * 6);
      }
      return;
    }
    const f = mtof(m);
    switch (name) {
      case "pad":
      case "strings": {
        // three saws a few cents apart: one each side and one in the middle, into the chorus
        const st = name === "strings";
        const A = st ? 0.16 : 0.4;
        const R = st ? 0.45 : 0.8;
        const end = t + dur + R * 1.3;
        const pk = (st ? 0.03 : 0.028) * v;
        const gl = this.env(t, A, pk, 1, 0, dur, R);
        const gr = this.env(t, A, pk, 1, 0, dur, R);
        const a = this.osc("sawtooth", f, t, end, -9);
        const b = this.osc("sawtooth", f, t, end, 9);
        const c = this.osc("sawtooth", f, t, end, 0);
        a.connect(gl);
        b.connect(gr);
        c.connect(gl);
        c.connect(gr);
        if (ch.vib) for (const o of [a, b, c]) ch.vib.connect(o.detune);
        gl.connect(ch.l!);
        gr.connect(ch.r!);
        break;
      }
      case "glass": {
        const end = t + dur + 1.3;
        for (let s = 0; s < 2; s++) this.osc(s ? "sine" : "triangle", s ? f * 2 : f, t, end, s ? 4 : -4).connect(this.env(t, 0.7, (s ? 0.035 : 0.085) * v, 1, 0, dur, 1.1)).connect(s ? ch.r! : ch.l!);
        break;
      }
      case "lead": {
        // a supersaw: five saws spread ±17 cents under a filter that settles after the attack
        const end = t + dur + 0.2;
        const fl = this.lowpass(Math.min(f * 12, 14000), f * 3.2 + 700, t, 0.12, 0.8);
        const g = this.env(t, 0.006, 0.034 * v, 0.72, 0.14, dur * 0.94, 0.09);
        const os = [-17, -7, 0, 7, 17].map((d) => this.osc("sawtooth", f, t, end, d));
        for (const o of os) o.connect(fl);
        if (dur > 0.36) this.vib(t, end, 12, os);
        fl.connect(g).connect(ch.c);
        break;
      }
      case "brass": {
        // three saws scooping up into the note, a filter that swells open
        const end = t + dur + 0.2;
        const fl = ac.createBiquadFilter();
        fl.Q.value = 1.6;
        const fp = fl.frequency;
        fp.setValueAtTime(f * 1.2 + 100, t);
        fp.linearRampToValueAtTime(Math.min(f * 5 + 1100, 14000), t + 0.07);
        fp.setTargetAtTime(f * 3 + 600, t + 0.07, 0.28);
        const g = this.env(t, 0.03, 0.055 * v, 0.85, 0.3, dur * 0.94, 0.12);
        const os = [-8, 0, 8].map((d) => {
          const o = this.osc("sawtooth", f, t, end, d);
          o.frequency.setValueAtTime(f * 0.985, t);
          o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
          o.connect(fl);
          return o;
        });
        if (dur > 0.38) this.vib(t, end, 9, os);
        fl.connect(g).connect(ch.c);
        break;
      }
      case "flute": {
        // a soft tone and the breath's chiff on its attack
        const end = t + dur + 0.2;
        const o = this.osc(this.r.flute, f, t, end);
        if (dur > 0.3) this.vib(t, end, 14, [o]);
        o.connect(this.env(t, 0.035, 0.15 * v, 0.85, 0.2, dur, 0.12)).connect(ch.c);
        const n = ac.createBufferSource();
        n.buffer = this.r.noise;
        n.start(t, this.rnd() * 0.8, 0.09);
        n.onended = END;
        const bp = ac.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = Math.min(9000, f * 2.2);
        bp.Q.value = 1.5;
        const ng = ac.createGain();
        ng.gain.setValueAtTime(0, t);
        ng.gain.linearRampToValueAtTime(0.06 * v, t + 0.012);
        ng.gain.setTargetAtTime(0, t + 0.012, 0.025);
        n.connect(bp).connect(ng).connect(ch.c);
        break;
      }
      case "square": {
        // the chip lead: a hollow 25 % pulse and a soft square a hair sharp under it
        const end = t + dur + 0.2;
        const o = this.osc(this.r.chip, f, t, end);
        const o2 = this.osc(this.r.soft, f, t, end, 6);
        const g = this.env(t, 0.005, 0.07 * v, 0.62, 0.18, dur * 0.9, 0.06);
        const g2 = ac.createGain();
        g2.gain.value = 0.55;
        o.connect(g);
        o2.connect(g2).connect(g);
        if (dur > 0.3) this.vib(t, end, 10, [o, o2]);
        g.connect(ch.c);
        break;
      }
      case "bass": {
        // a saw under a snapping filter and a sine sub, through the channel's drive
        const end = t + dur + 0.1;
        const g = this.env(t, 0.004, 0.2 * v, 0.8, 0.2, dur * 0.9, 0.05);
        this.osc("sawtooth", f, t, end).connect(this.lowpass(f * 8 + 400, f * 2.6 + 140, t, 0.06, 2.2)).connect(g);
        this.osc(this.r.sub, f, t, end).connect(g);
        g.connect(ch.c);
        break;
      }
      case "sub": {
        this.osc(this.r.sub, f, t, t + dur + 0.1)
          .connect(this.env(t, 0.012, 0.3 * v, 0.9, 0.3, dur * 0.95, 0.08))
          .connect(ch.c);
        break;
      }
    }
  }

  /** A drum (its index in DRUMS, or BOOM / SWELL): a rendered hit, round robin over its variants. */
  private hit(i: number, t: number, v: number) {
    if (this.solo && !this.solo.includes("drums")) return;
    const ac = this.ac;
    const kit = this.song.kit as DrumKit;
    v *= DGAIN[kit];
    const s = ac.createBufferSource();
    s.buffer = drumBuffer(ac, kit, i, this.hits[i]++);
    const g = ac.createGain();
    g.gain.value = v;
    s.connect(g).connect(this.dchan(DCH[i]).c);
    s.onended = END;
    s.start(t);
    if (i === 0) {
      const d = this.song.duck;
      if (d > 0) {
        const p = this.duck.gain;
        p.setTargetAtTime(1 - d * Math.min(1, v / DGAIN[kit]), t, 0.004);
        p.setTargetAtTime(1, t + 0.05, 0.09);
      }
    }
  }

  /** A noise sweep up to the bar line where the stage changes, and a reversed cymbal into it. */
  private riser(t0: number, t1: number) {
    this.riserOn = true;
    if (t1 - t0 < 0.35 || (this.solo && !this.solo.includes("drums"))) return;
    const ac = this.ac;
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 2.2;
    f.frequency.setValueAtTime(350, t0);
    f.frequency.exponentialRampToValueAtTime(6500, t1);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t1 - 0.02);
    g.gain.linearRampToValueAtTime(0, t1 + 0.01);
    const n = ac.createBufferSource();
    n.buffer = this.r.noise;
    n.loop = true;
    n.start(t0, this.rnd() * 0.9);
    n.stop(t1 + 0.03);
    n.onended = END;
    n.connect(f).connect(g).connect(this.dchan(6).c);
    // the swell ends right on the downbeat (it is 1.2 s long)
    if (t1 - 1.2 > ac.currentTime) this.hit(SWELL, t1 - 1.2, 0.7);
  }
}

// ---- the player ------------------------------------------------------------------------------------

export interface Beat {
  /** The tempo now (the song's, times the rate). */
  bpm: number;
  /** Beat n sounds at t0 + n·60/bpm on the AudioContext clock (while the tempo holds). */
  t0: number;
  /** The AudioContext clock as heard now. */
  now: number;
  /** Beats played so far (fractional). */
  beat: number;
  bar: number;
  stage: number;
}

const songOf = (key: SongKey | Song) => compile(typeof key === "string" ? SONGS[key] : key);

/** The sampled notes and the kit of a song (to render them before they are needed). */
function needs(c: CSong): [Struck, number][] {
  const out: [Struck, number][] = [];
  const seen = new Set<number>();
  for (const sec of c.stages)
    for (const step of sec.ev)
      for (const e of step) {
        const s = e.d ? undefined : SAMPLED[PATCHES[e.p]];
        if (!s) continue;
        for (const m of e.n) {
          const k = e.p * 256 + m + sec.up;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push([s, m + sec.up]);
        }
      }
  return out;
}

class MusicPlayer {
  /** The key of the song playing ("" a game's own song), null when none. */
  playing: string | null = null;
  private eng: Engine | null = null;
  /** Songs ending (end()) or fading: pumped until they are done, let go once quiet. */
  private tails: Engine[] = [];
  private timer = 0;
  private muted = false;
  private parked: SongKey | Song | null = null;
  private gesture = false;
  private readonly B: Beat = { bpm: 0, t0: 0, now: 0, beat: 0, bar: 0, stage: 0 };

  constructor() {
    // switched back on: the song that was asked for while off starts
    master.watch((on) => {
      if (on && this.parked && !this.eng) this.play(this.parked);
    });
  }

  play(key: SongKey | Song, at?: number) {
    this.stop(0.15);
    const m = party();
    if (!m) {
      this.parked = key;
      return;
    }
    this.parked = null;
    const ac = m.ac as AudioContext;
    const c = songOf(key);
    prepare(ac, c.kit as DrumKit, needs(c));
    const e = new Engine(ac, m, c, Math.max(at ?? 0, ac.currentTime + 0.06));
    this.eng = e;
    this.playing = typeof key === "string" ? key : "";
    this.muted = false;
    this.run();
    // (no gesture yet: the context waits; the first tap or key wakes it)
    if (ac.state === "suspended" && !this.gesture) {
      this.gesture = true;
      const wake = () => {
        party();
        removeEventListener("pointerdown", wake, true);
        removeEventListener("keydown", wake, true);
      };
      addEventListener("pointerdown", wake, true);
      addEventListener("keydown", wake, true);
    }
  }

  /** Renders a song's instruments in idle moments (the host does it under the rules card). */
  prepare(key: SongKey | Song) {
    const m = party();
    if (!m) return;
    const c = songOf(key);
    prepare(m.ac, c.kit as DrumKit, needs(c));
  }

  /** Faster (the last lap): 1 is the song's own tempo; 1.1 and over also lifts to the finale. */
  rate(k: number) {
    const e = this.eng;
    if (e) e.setRate(k, e.ac.currentTime);
  }

  /** Go to a stage (0 intro, 1 main, 2 intense, 3 finale) at the next bar; no argument: the stage now. */
  stage(n?: number): number {
    const e = this.eng;
    if (!e) return -1;
    if (n !== undefined) e.request(n, true);
    return e.stage;
  }

  stop(fade = 0.25) {
    this.parked = null;
    this.playing = null;
    const e = this.eng;
    this.eng = null;
    if (!e) return;
    e.fade(e.ac.currentTime, fade);
    this.tails.push(e);
  }

  /**
   * Ends the song on its home chord (a crash, the low drum, the chord ringing ~1.5 s) at the next
   * beat, instead of a fade: the finish of a game. Nothing playing: nothing.
   */
  end() {
    this.parked = null;
    this.playing = null;
    const e = this.eng;
    this.eng = null;
    if (!e) return;
    e.end(e.ac.currentTime);
    this.tails.push(e);
    this.run();
  }

  /** A one-shot over the music (which ducks under it), or, with `then`, before that song. Its length (s). */
  sting(key: SongKey | Song, then?: SongKey | Song): number {
    const m = party();
    if (!m) {
      if (then) this.parked = then;
      return 0;
    }
    const ac = m.ac;
    const t = ac.currentTime + 0.03;
    const c = songOf(key);
    const e = new Engine(ac, m, c, t);
    const len = e.length();
    e.pump(t + len + 1);
    this.tails.push(e);
    this.run();
    // the ambience steps back while it plays
    m.duck(0.6, len * 0.8, 1.2, t, false);
    if (then) this.play(then, t + len);
    else if (this.eng) {
      this.eng.level(this.eng.vol * 0.28, t, 0.05);
      this.eng.restore(t + len, 0.5);
    }
    return len;
  }

  /** The beat, for a game that follows it (see the top of the file). Null when nothing plays. */
  beat(): Beat | null {
    const e = this.eng;
    if (!e) return null;
    const ac = e.ac as AudioContext;
    const now = ac.currentTime - (ac.outputLatency || ac.baseLatency || 0);
    const cur = now >= e.aT;
    const T = cur ? e.aT : e.pT;
    const b = cur ? e.aB : e.pB;
    const spb = (cur ? e.aS : e.pS) * 4;
    const B = this.B;
    B.bpm = 60 / spb;
    B.t0 = T - b * spb;
    B.now = now;
    B.beat = (now - B.t0) / spb;
    B.bar = Math.floor(B.beat / 4);
    B.stage = e.stage;
    return B;
  }

  private run() {
    if (!this.timer) this.timer = window.setInterval(this.tick, TICK);
    this.tick();
  }

  private tick = () => {
    const e = this.eng;
    const ac = e?.ac ?? this.tails[0]?.ac;
    if (!ac) {
      window.clearInterval(this.timer);
      this.timer = 0;
      return;
    }
    const now = ac.currentTime;
    // endings play on; quiet ones let go of their graph
    for (let i = this.tails.length - 1; i >= 0; i--) {
      const x = this.tails[i];
      if (!x.done) x.pump(now + LOOK);
      if (x.done && now > x.quietAt) {
        x.dispose();
        this.tails.splice(i, 1);
      }
    }
    if (!e) return;
    if (!master.on) {
      if (!this.muted) ((this.muted = true), e.level(0, now, 0.03));
      return;
    }
    if (this.muted) ((this.muted = false), e.restore(now, 0.05), e.resync(now + 0.05, now + 0.05));
    // (fallen behind: a hidden tab, a long frame) skip ahead rather than burst
    e.resync(now - 0.05, now + 0.02);
    e.pump(now + LOOK);
  };
}

/** The one music player. */
export const music = new MusicPlayer();

/**
 * The bench (tests only): renders a song into an OfflineAudioContext (through its mixer, so the
 * level is the one heard). `calls` are [seconds, "rate" | "stage" | "end", value]; it fades out at
 * `stopAt` (unless it ended). `solo` keeps only these instruments ("drums" for the drums). Returns the
 * stage changes [seconds, stage].
 */
export function bounce(ctx: BaseAudioContext, key: SongKey | Song, stopAt: number, calls: [number, "rate" | "stage" | "end", number][] = [], solo?: string[]): [number, number][] {
  const e = new Engine(ctx, mixerFor(ctx), songOf(key), 0.05);
  if (solo) e.solo = solo;
  let i = 0;
  for (let t = 0; t < stopAt && !e.done; t += 0.05) {
    while (i < calls.length && calls[i][0] <= t) {
      const [, what, v] = calls[i++];
      if (what === "rate") e.setRate(v, t);
      else if (what === "end") e.end(t);
      else e.request(v, true);
    }
    e.pump(t + LOOK);
  }
  if (!e.done) e.fade(stopAt, 0.6);
  return e.log;
}
