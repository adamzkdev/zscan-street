/**
 * Every sound of the party, synthesised with WebAudio (no files): `sfx.play("coin")`, and a little
 * procedural music sequencer: `music.play("paris")`, `music.stop()`.
 *
 * Browsers only start audio after a user gesture: `unlockAudio()` is wired to the first key/click.
 */
import { rng } from "./util";
import { party } from "../../../audio/engine";

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

/** (the party's mixer sets the overall level; these are the games' own balance) */
export const VOLUME = { music: 0.55, sfx: 0.8 };
export function setVolume(kind: "music" | "sfx", v: number) {
  VOLUME[kind] = v;
  if (kind === "music" && musicBus) musicBus.gain.value = v * 0.5;
  if (kind === "sfx" && sfxBus) sfxBus.gain.value = v;
}

/**
 * In ZStreet the games' sounds go into ZK PARTY's mixer (src/audio/engine.ts): its context, its
 * volume and its mute, its glue and limiter. None while the party's sound is off.
 */
function ctx(): AudioContext | null {
  if (ac) return ac;
  const mix = party();
  if (!mix) return null;
  ac = mix.ac as AudioContext;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master = ac.createGain();
  master.gain.value = 0.9;
  master.connect(comp).connect(mix.bus);
  sfxBus = ac.createGain();
  sfxBus.gain.value = VOLUME.sfx;
  sfxBus.connect(master);
  musicBus = ac.createGain();
  musicBus.gain.value = VOLUME.music * 0.5;
  musicBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

export function unlockAudio() {
  const c = ctx();
  if (c && c.state !== "running") void c.resume();
}
export const audioReady = () => !!ac && ac.state === "running";

// ------------------------------------------------------------------ primitives

interface ToneOpts {
  type?: OscillatorType;
  f: number;
  /** End frequency (exponential slide). */
  f1?: number;
  dur: number;
  gain?: number;
  at?: number;
  attack?: number;
  /** Vibrato depth (Hz) */
  vib?: number;
  bus?: AudioNode;
  filter?: number;
}

function tone(o: ToneOpts) {
  const c = ctx();
  if (!c || c.state !== "running") return;
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? "square";
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
  const g = c.createGain();
  const peak = o.gain ?? 0.2;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  let node: AudioNode = osc;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.filter;
    osc.connect(f);
    node = f;
  }
  if (o.vib) {
    const l = c.createOscillator();
    const lg = c.createGain();
    l.frequency.value = 7;
    lg.gain.value = o.vib;
    l.connect(lg).connect(osc.frequency);
    l.start(t0);
    l.stop(t0 + o.dur + 0.05);
  }
  node.connect(g).connect(o.bus ?? sfxBus!);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

function noise(o: { dur: number; gain?: number; at?: number; type?: BiquadFilterType; freq?: number; f1?: number; q?: number; bus?: AudioNode; attack?: number }) {
  const c = ctx();
  if (!c || c.state !== "running" || !noiseBuf) return;
  const t0 = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.type ?? "lowpass";
  f.frequency.setValueAtTime(o.freq ?? 2000, t0);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t0 + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f).connect(g).connect(o.bus ?? sfxBus!);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + o.dur + 0.05);
}

const N = (semi: number, base = 440) => base * Math.pow(2, semi / 12);
const vary = () => 0.97 + Math.random() * 0.06;

// ------------------------------------------------------------------ the catalogue

const SFX = {
  jump: () => tone({ type: "square", f: 300 * vary(), f1: 700, dur: 0.16, gain: 0.12, filter: 3000 }),
  land: () => noise({ dur: 0.1, gain: 0.25, freq: 600 }),
  coin: () => {
    tone({ type: "square", f: N(14), dur: 0.08, gain: 0.12 });
    tone({ type: "square", f: N(19), dur: 0.3, gain: 0.12, at: 0.07 });
  },
  coins: () => {
    for (let i = 0; i < 5; i++) tone({ type: "square", f: N(12 + i * 3), dur: 0.12, gain: 0.08, at: i * 0.05 });
  },
  lose_coins: () => {
    for (let i = 0; i < 4; i++) tone({ type: "square", f: N(10 - i * 3), dur: 0.12, gain: 0.08, at: i * 0.06 });
  },
  hit: () => {
    noise({ dur: 0.15, gain: 0.35, freq: 1800, f1: 300 });
    tone({ type: "sine", f: 180, f1: 60, dur: 0.18, gain: 0.35 });
  },
  bonk: () => {
    tone({ type: "triangle", f: 520 * vary(), f1: 180, dur: 0.14, gain: 0.3 });
    noise({ dur: 0.05, gain: 0.15, freq: 4000 });
  },
  boing: () => tone({ type: "sine", f: 200, f1: 600, dur: 0.25, gain: 0.25, vib: 30 }),
  whoosh: () => noise({ dur: 0.28, gain: 0.2, type: "bandpass", freq: 600, f1: 3000, q: 1.5, attack: 0.08 }),
  pop: () => tone({ type: "sine", f: 900 * vary(), f1: 300, dur: 0.08, gain: 0.3 }),
  explode: () => {
    noise({ dur: 0.9, gain: 0.55, freq: 1200, f1: 80 });
    tone({ type: "sine", f: 110, f1: 30, dur: 0.6, gain: 0.5 });
  },
  splash: () => {
    noise({ dur: 0.5, gain: 0.3, type: "bandpass", freq: 1500, f1: 400, q: 0.8 });
    tone({ type: "sine", f: 400, f1: 900, dur: 0.12, gain: 0.1 });
  },
  count: () => tone({ type: "square", f: N(3), dur: 0.18, gain: 0.16 }),
  go: () => {
    tone({ type: "square", f: N(15), dur: 0.5, gain: 0.16 });
    tone({ type: "square", f: N(22), dur: 0.5, gain: 0.1 });
  },
  whistle: () => tone({ type: "sine", f: 2600, dur: 0.5, gain: 0.18, vib: 60 }),
  buzzer: () => {
    tone({ type: "sawtooth", f: 120, dur: 0.45, gain: 0.18, filter: 900 });
    tone({ type: "sawtooth", f: 127, dur: 0.45, gain: 0.18, filter: 900 });
  },
  ding: () => {
    tone({ type: "sine", f: N(19), dur: 0.6, gain: 0.25 });
    tone({ type: "sine", f: N(26), dur: 0.5, gain: 0.1, at: 0.02 });
  },
  select: () => tone({ type: "square", f: N(7), dur: 0.05, gain: 0.07, filter: 3000 }),
  confirm: () => {
    tone({ type: "square", f: N(7), dur: 0.07, gain: 0.1 });
    tone({ type: "square", f: N(14), dur: 0.12, gain: 0.1, at: 0.06 });
  },
  back: () => {
    tone({ type: "square", f: N(10), dur: 0.07, gain: 0.08 });
    tone({ type: "square", f: N(3), dur: 0.1, gain: 0.08, at: 0.06 });
  },
  dice: () => tone({ type: "square", f: N(12 + Math.floor(Math.random() * 6)), dur: 0.04, gain: 0.06 }),
  diceStop: () => {
    noise({ dur: 0.08, gain: 0.3, freq: 2500 });
    tone({ type: "square", f: N(12), dur: 0.1, gain: 0.12 });
    tone({ type: "square", f: N(19), dur: 0.25, gain: 0.12, at: 0.08 });
  },
  step: () => tone({ type: "triangle", f: N(5) * vary(), f1: N(12), dur: 0.08, gain: 0.18 }),
  star: () => {
    const seq = [0, 4, 7, 12, 16, 19, 24];
    seq.forEach((s, i) => tone({ type: "square", f: N(s + 3), dur: 0.2, gain: 0.09, at: i * 0.07 }));
    tone({ type: "triangle", f: N(27), dur: 1.0, gain: 0.15, at: seq.length * 0.07, vib: 8 });
  },
  fanfare: () => {
    const seq: [number, number, number][] = [
      [0, 0, 0.12],
      [4, 0.12, 0.12],
      [7, 0.24, 0.12],
      [12, 0.36, 0.3],
      [7, 0.66, 0.12],
      [12, 0.78, 0.6],
    ];
    for (const [s, at, d] of seq) {
      tone({ type: "square", f: N(s + 3), dur: d + 0.05, gain: 0.1, at });
      tone({ type: "triangle", f: N(s - 9), dur: d + 0.05, gain: 0.15, at });
    }
  },
  lose: () => {
    [7, 6, 5, 4].forEach((s, i) => tone({ type: "square", f: N(s - 2), dur: i === 3 ? 0.6 : 0.22, gain: 0.1, at: i * 0.22, vib: i === 3 ? 6 : 0 }));
  },
  cheer: () => {
    for (let i = 0; i < 6; i++) noise({ dur: 0.9, gain: 0.06, type: "bandpass", freq: 800 + Math.random() * 1600, q: 3, at: Math.random() * 0.2, attack: 0.1 });
  },
  aww: () => tone({ type: "sawtooth", f: 380, f1: 220, dur: 0.8, gain: 0.08, filter: 1200, vib: 5 }),
  drum: () => {
    tone({ type: "sine", f: 160, f1: 50, dur: 0.25, gain: 0.5 });
    noise({ dur: 0.05, gain: 0.1, freq: 3000 });
  },
  tick: () => tone({ type: "square", f: 1800, dur: 0.025, gain: 0.06 }),
  laser: () => tone({ type: "sawtooth", f: 1400, f1: 200, dur: 0.18, gain: 0.1, filter: 4000 }),
  shoot: () => {
    noise({ dur: 0.12, gain: 0.3, freq: 3000, f1: 500 });
    tone({ type: "square", f: 600, f1: 150, dur: 0.1, gain: 0.1 });
  },
  zap: () => tone({ type: "sawtooth", f: 80, f1: 1600, dur: 0.15, gain: 0.12, vib: 200 }),
  crash: () => {
    noise({ dur: 0.5, gain: 0.4, freq: 5000, f1: 500 });
    tone({ type: "square", f: 90, f1: 40, dur: 0.3, gain: 0.2 });
  },
  bell: () => {
    tone({ type: "sine", f: N(24), dur: 1.2, gain: 0.2 });
    tone({ type: "sine", f: N(24) * 2.76, dur: 0.6, gain: 0.06 });
  },
  magic: () => {
    for (let i = 0; i < 8; i++) tone({ type: "sine", f: N(19 + i * 2), dur: 0.2, gain: 0.07, at: i * 0.04 });
  },
  slide: () => tone({ type: "sine", f: 800, f1: 200, dur: 0.35, gain: 0.15 }),
  thud: () => tone({ type: "sine", f: 120, f1: 40, dur: 0.2, gain: 0.45 }),
  squeak: () => tone({ type: "sine", f: 1200, f1: 1800, dur: 0.08, gain: 0.12 }),
  power: () => {
    for (let i = 0; i < 6; i++) tone({ type: "square", f: N(i * 4), dur: 0.08, gain: 0.08, at: i * 0.05 });
  },
  wrong: () => tone({ type: "square", f: 200, f1: 150, dur: 0.3, gain: 0.12 }),
  click: () => noise({ dur: 0.02, gain: 0.2, freq: 5000, type: "highpass" }),
  swing: () => noise({ dur: 0.18, gain: 0.18, type: "bandpass", freq: 1200, f1: 400, q: 2 }),
  rumble: () => noise({ dur: 1.2, gain: 0.3, freq: 200, f1: 60, attack: 0.2 }),
  wind: () => noise({ dur: 1.5, gain: 0.12, type: "bandpass", freq: 400, f1: 900, q: 2, attack: 0.4 }),
  engine: () => tone({ type: "sawtooth", f: 70, f1: 110, dur: 0.3, gain: 0.06, filter: 600 }),
  cash: () => {
    noise({ dur: 0.06, gain: 0.2, freq: 6000, type: "highpass" });
    tone({ type: "square", f: N(24), dur: 0.08, gain: 0.08, at: 0.05 });
    tone({ type: "square", f: N(28), dur: 0.3, gain: 0.08, at: 0.12 });
  },
  steal: () => {
    tone({ type: "sawtooth", f: N(5), f1: N(-7), dur: 0.4, gain: 0.08, filter: 2000 });
    tone({ type: "sine", f: N(17), dur: 0.1, gain: 0.08, at: 0.35 });
  },
  warp: () => tone({ type: "sine", f: 200, f1: 1600, dur: 0.5, gain: 0.15, vib: 40 }),
  heartbeat: () => {
    tone({ type: "sine", f: 70, f1: 40, dur: 0.12, gain: 0.5 });
    tone({ type: "sine", f: 70, f1: 40, dur: 0.12, gain: 0.35, at: 0.18 });
  },
};

export type SfxName = keyof typeof SFX;
export const SFX_NAMES = Object.keys(SFX) as SfxName[];

const last = new Map<string, number>();
export const sfx = {
  /** Play a sound (the same one at most every 30 ms, so a flood of hits stays a sound). */
  play(name: SfxName) {
    if (!ac || ac.state !== "running") return;
    const now = performance.now();
    if (now - (last.get(name) ?? 0) < 30) return;
    last.set(name, now);
    SFX[name]();
  },
  /** A note (semitones from A4), for melodic feedback (combos, rhythm games). */
  note(semi: number, dur = 0.15, type: OscillatorType = "square", gain = 0.1) {
    tone({ type, f: N(semi), dur, gain });
  },
};

// ------------------------------------------------------------------ music

export type SongKey = "title" | "menu" | "lobby" | "paris" | "london" | "rome" | "amsterdam" | "mini" | "mini2" | "mini3" | "tense" | "results" | "finale" | "shop";

interface Song {
  bpm: number;
  /** Root (semitones from A4) and mode. */
  root: number;
  scale: number[];
  /** Chord degrees (0-based in the scale), one per bar. */
  prog: number[];
  lead: OscillatorType;
  swing?: number;
  /** Drum pattern density 0..1 */
  drums: number;
  seed: number;
  /** Bass style: "walk" | "pump" | "oom" */
  bass: "walk" | "pump" | "oom";
}

const MAJ = [0, 2, 4, 5, 7, 9, 11];
const MIN = [0, 2, 3, 5, 7, 8, 10];
const MIX = [0, 2, 4, 5, 7, 9, 10];
const DOR = [0, 2, 3, 5, 7, 9, 10];

const SONGS: Record<SongKey, Song> = {
  title: { bpm: 128, root: 3, scale: MAJ, prog: [0, 5, 3, 4, 0, 5, 1, 4], lead: "square", drums: 0.8, seed: 11, bass: "pump" },
  menu: { bpm: 112, root: -2, scale: MAJ, prog: [0, 3, 4, 0, 5, 3, 1, 4], lead: "triangle", drums: 0.5, seed: 3, bass: "walk" },
  lobby: { bpm: 118, root: 0, scale: MIX, prog: [0, 6, 3, 0, 0, 6, 3, 4], lead: "square", drums: 0.6, seed: 7, bass: "walk", swing: 0.12 },
  paris: { bpm: 132, root: -4, scale: MAJ, prog: [0, 5, 1, 4, 0, 3, 4, 0], lead: "triangle", drums: 0.55, seed: 21, bass: "oom", swing: 0.18 },
  london: { bpm: 124, root: 2, scale: MIX, prog: [0, 3, 6, 0, 0, 3, 4, 4], lead: "square", drums: 0.75, seed: 33, bass: "pump" },
  rome: { bpm: 116, root: -3, scale: MAJ, prog: [0, 4, 5, 3, 0, 4, 3, 4], lead: "sawtooth", drums: 0.6, seed: 45, bass: "oom" },
  amsterdam: { bpm: 120, root: 5, scale: MAJ, prog: [0, 3, 0, 4, 5, 3, 1, 4], lead: "triangle", drums: 0.5, seed: 57, bass: "oom", swing: 0.1 },
  mini: { bpm: 150, root: 0, scale: MAJ, prog: [0, 0, 3, 4, 0, 5, 3, 4], lead: "square", drums: 0.9, seed: 61, bass: "pump" },
  mini2: { bpm: 142, root: 2, scale: DOR, prog: [0, 3, 0, 4, 0, 3, 6, 4], lead: "square", drums: 0.9, seed: 73, bass: "walk" },
  mini3: { bpm: 160, root: -5, scale: MIX, prog: [0, 6, 3, 0, 0, 6, 4, 4], lead: "sawtooth", drums: 1, seed: 85, bass: "pump" },
  tense: { bpm: 138, root: -1, scale: MIN, prog: [0, 0, 5, 4, 0, 0, 5, 6], lead: "sawtooth", drums: 0.85, seed: 97, bass: "pump" },
  results: { bpm: 104, root: 3, scale: MAJ, prog: [0, 3, 4, 0, 5, 3, 4, 0], lead: "triangle", drums: 0.4, seed: 101, bass: "oom" },
  finale: { bpm: 136, root: 1, scale: MAJ, prog: [0, 4, 5, 3, 0, 4, 3, 4], lead: "square", drums: 0.9, seed: 113, bass: "pump" },
  shop: { bpm: 100, root: 4, scale: MAJ, prog: [0, 5, 3, 4, 0, 5, 3, 4], lead: "triangle", drums: 0.35, seed: 127, bass: "walk", swing: 0.2 },
};

class Music {
  private timer: number | null = null;
  private song: Song | null = null;
  key: SongKey | null = null;
  private step = 0;
  private nextT = 0;
  private melody: number[][] = [];
  private gain: GainNode | null = null;
  private rate = 1;

  play(key: SongKey, rate = 1) {
    if (this.key === key && this.timer && this.rate === rate) return;
    this.stop();
    const c = ctx();
    if (!c) return;
    this.key = key;
    this.rate = rate;
    this.song = SONGS[key];
    this.melody = this.compose(this.song);
    this.step = 0;
    this.gain = c.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(musicBus!);
    this.nextT = c.currentTime + 0.1;
    this.timer = window.setInterval(() => this.pump(), 25);
  }
  /** Faster (the last seconds of a mini-game). */
  speed(rate: number) {
    this.rate = rate;
  }
  stop(fade = 0.3) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.key = null;
    if (this.gain && ac) {
      const g = this.gain;
      g.gain.setTargetAtTime(0, ac.currentTime, fade / 3);
      setTimeout(() => g.disconnect(), fade * 1000 + 200);
    }
    this.gain = null;
  }

  /** A melody per bar: 8 sixteenth-note slots → semitone or NaN (rest), from the seed. */
  private compose(s: Song) {
    const r = rng(s.seed);
    const bars: number[][] = [];
    const rhythms = [
      [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0],
      [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      [1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 0],
      [1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    ];
    let deg = 4;
    const phrase: number[][] = [];
    for (let b = 0; b < 4; b++) {
      const rh = rhythms[Math.floor(r() * rhythms.length)];
      const bar: number[] = [];
      for (let i = 0; i < 16; i++) {
        if (!rh[i]) {
          bar.push(NaN);
          continue;
        }
        deg += Math.floor(r() * 5) - 2;
        deg = Math.max(0, Math.min(11, deg));
        bar.push(deg);
      }
      phrase.push(bar);
    }
    // A A' B A
    for (let rep = 0; rep < 2; rep++) for (const bar of phrase) bars.push(bar.map((d, i) => (rep && i > 11 && !isNaN(d) ? d + 1 : d)));
    return bars;
  }

  private pump() {
    const c = ac;
    const s = this.song;
    if (!c || !s || !this.gain) return;
    const sixteenth = 60 / (s.bpm * this.rate) / 4;
    while (this.nextT < c.currentTime + 0.12) {
      this.tick(this.step, this.nextT, sixteenth);
      const swing = s.swing && this.step % 2 === 0 ? s.swing : s.swing ? -s.swing : 0;
      this.nextT += sixteenth * (1 + swing);
      this.step++;
    }
  }

  private tick(step: number, t: number, six: number) {
    const s = this.song!;
    const c = ac!;
    const bus = this.gain!;
    const at = Math.max(0, t - c.currentTime);
    const bar = Math.floor(step / 16) % s.prog.length;
    const i = step % 16;
    const chordDeg = s.prog[bar];
    const sc = s.scale;
    const deg = (d: number) => sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    const root = s.root + deg(chordDeg);
    // drums
    if (s.drums > 0) {
      if (i % 4 === 0 && (i % 8 === 0 || s.drums > 0.7)) {
        tone({ type: "sine", f: 150, f1: 45, dur: 0.18, gain: 0.32, at, bus });
      }
      if (i % 8 === 4) noise({ dur: 0.12, gain: 0.12 * s.drums, freq: 2500, at, bus, type: "bandpass", q: 0.7 });
      if (i % 2 === 0 || (s.drums > 0.85 && Math.random() < 0.3)) noise({ dur: 0.03, gain: 0.04 * s.drums, freq: 8000, at, bus, type: "highpass" });
    }
    // bass
    const b = root - 24;
    if (s.bass === "pump" && i % 2 === 0) tone({ type: "triangle", f: N(i % 4 === 2 ? b + 12 : b), dur: six * 1.6, gain: 0.22, at, bus });
    if (s.bass === "walk" && i % 4 === 0) tone({ type: "triangle", f: N(b + [0, 4, 7, 9][i / 4]), dur: six * 3.5, gain: 0.24, at, bus });
    if (s.bass === "oom") {
      if (i % 8 === 0) tone({ type: "triangle", f: N(b), dur: six * 3, gain: 0.25, at, bus });
      if (i % 8 === 4) tone({ type: "triangle", f: N(b + 7), dur: six * 3, gain: 0.2, at, bus });
    }
    // chord stabs
    if (i === 0 || i === 6 || i === 10 || (s.bass === "oom" && i % 4 === 2)) {
      for (const k of [0, 2, 4]) tone({ type: "sawtooth", f: N(s.root + deg(chordDeg + k) - 12), dur: six * 1.8, gain: 0.03, at, bus, filter: 1400 });
    }
    // lead
    const mel = this.melody[bar % this.melody.length];
    const d = mel?.[i];
    if (d !== undefined && !isNaN(d)) {
      // keep the melody on chord-ish tones on strong beats
      const dd = i % 4 === 0 ? Math.round((d - chordDeg) / 2) * 2 + chordDeg : d;
      tone({ type: s.lead, f: N(s.root + deg(dd)), dur: six * 1.7, gain: s.lead === "sawtooth" ? 0.045 : s.lead === "square" ? 0.05 : 0.11, at, bus, filter: s.lead === "triangle" ? undefined : 3200 });
    }
  }
}

export const music = new Music();
