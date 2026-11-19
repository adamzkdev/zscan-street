/**
 * The Orchard Room's sound. A small adapter over the party's audio engine (src/audio/engine.ts:
 * its sfx bus, its "club" room reverb, its music and ambience buses, the ducking), so this file is
 * the only one to change if the engine does.
 *
 * - One-shots are synthesised once into AudioBuffers (a few variants each) and only played back:
 *   a card sliding off the deck and landing on the felt, a card turned over, the riffle and bridge
 *   of a shuffle, clay chips clacking (a bet sets down more of them the bigger it is), chips pushed
 *   over the felt, two knuckles on the rail for a check, cards slid to the muck, the dealer puck.
 * - Stings are played on a little electric piano and a vibraphone, with an upright bass and a ride
 *   cymbal: all in, your pot, a big pot, busting, your turn, the blinds going up.
 * - The room: diners' murmur (a real recording, low-passed as if across the club) and the Orchard
 *   Room's band on the stand (recordings in public/audio/music), ducked under the stings.
 *
 * Everything is silent while the page's sound switch is off.
 */
import { party, type Mixer } from "../../audio/engine";
import type { RoomKind } from "../../audio/kinds";
import { load, loopInto, type Playing } from "../../audio/samples";

// ---- rendering -----------------------------------------------------------------------------------

const TAU = Math.PI * 2;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A state-variable filter (topology-preserving), its cutoff settable per sample. */
class SVF {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private k = 1;
  lp = 0;
  bp = 0;
  hp = 0;
  constructor(private sr: number) {}
  set(fc: number, q: number) {
    const g = Math.tan((Math.PI * Math.min(fc, this.sr * 0.45)) / this.sr);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
    return this;
  }
  tick(x: number) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - this.k * v1 - v2;
    return this;
  }
}

/** A stereo render being written. */
class Out {
  readonly L: Float32Array;
  readonly R: Float32Array;
  readonly n: number;
  constructor(
    readonly sr: number,
    secs: number,
  ) {
    this.n = Math.ceil(secs * sr);
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
  }
  /** Adds x at frame i, panned -1…1. */
  add(i: number, x: number, pan = 0) {
    if (i < 0 || i >= this.n) return;
    this.L[i] += x * (pan > 0 ? 1 - pan : 1);
    this.R[i] += x * (pan < 0 ? 1 + pan : 1);
  }
  /** Frames [t0, t0 + dur) as seconds. */
  span(t0: number, dur: number, f: (i: number, t: number) => void) {
    const i0 = Math.max(0, Math.floor(t0 * this.sr)),
      i1 = Math.min(this.n, Math.ceil((t0 + dur) * this.sr));
    for (let i = i0; i < i1; i++) f(i, i / this.sr - t0);
  }
  buffer(ac: BaseAudioContext, gain = 1) {
    let peak = 0;
    for (let i = 0; i < this.n; i++) peak = Math.max(peak, Math.abs(this.L[i]), Math.abs(this.R[i]));
    const k = peak > 0 ? gain / peak : 0;
    const b = ac.createBuffer(2, this.n, this.sr);
    const l = b.getChannelData(0),
      r = b.getChannelData(1);
    for (let i = 0; i < this.n; i++) {
      l[i] = this.L[i] * k;
      r[i] = this.R[i] * k;
    }
    return b;
  }
}

// ---- the instruments (offline) -------------------------------------------------------------------

/** A clay chip on a chip: a click and a few short modes. */
function clack(o: Out, t0: number, amp: number, R: () => number, pan = 0) {
  const f = 2500 + R() * 700;
  const modes: [number, number, number][] = [
    [f, 0.016, 0.55],
    [f * 1.47, 0.011, 0.4],
    [f * 2.09, 0.007, 0.3],
    [f * 0.56, 0.01, 0.22],
  ];
  const ph = modes.map(() => R() * TAU);
  const hp = new SVF(o.sr).set(3500, 0.7);
  o.span(t0, 0.06, (i, t) => {
    let y = 0;
    for (let m = 0; m < 4; m++) y += Math.sin(TAU * modes[m][0] * t + ph[m]) * Math.exp(-t / modes[m][1]) * modes[m][2];
    const click = hp.tick((R() * 2 - 1) * Math.exp(-t / 0.0007)).hp * 0.9;
    o.add(i, (y + click) * amp, pan);
  });
}

/** A soft thump on the felt (a card landing, a stack set down, a knuckle). */
function thump(o: Out, t0: number, amp: number, R: () => number, f = 900, body = 150, len = 0.012) {
  const lp = new SVF(o.sr).set(f, 0.8);
  o.span(t0, len * 6, (i, t) => {
    const n = lp.tick(R() * 2 - 1).lp * Math.exp(-t / len);
    const s = Math.sin(TAU * body * t * (1 - t * 2)) * Math.exp(-t / (len * 1.4)) * 0.5;
    o.add(i, (n + s) * amp);
  });
}

/** A swept band of noise (a card sliding, chips pushed over the felt). */
function swish(o: Out, t0: number, dur: number, f0: number, f1: number, q: number, amp: number, R: () => number, attack = 0.01, pan = 0) {
  const bp = new SVF(o.sr);
  o.span(t0, dur, (i, t) => {
    const u = t / dur;
    bp.set(f0 + (f1 - f0) * u, q).tick(R() * 2 - 1);
    const env = t < attack ? t / attack : Math.pow(1 - (t - attack) / (dur - attack), 1.6);
    o.add(i, bp.bp * env * amp, pan);
  });
}

/** One electric-piano note (two-operator FM: the tine's bell on the attack, then the warm body). */
function ep(o: Out, t0: number, m: number, amp: number, len = 1.6, pan = 0) {
  const f = mtof(m);
  const tau = 0.9 * Math.pow(440 / f, 0.3);
  o.span(t0, len, (i, t) => {
    const I = 1.4 * Math.exp(-t / 0.018) + 0.18;
    const env = (1 - Math.exp(-t / 0.0025)) * Math.exp(-t / tau) * (t > len - 0.15 ? (len - t) / 0.15 : 1);
    const y = Math.sin(TAU * f * t + I * Math.sin(TAU * 14 * f * t)) + 0.14 * Math.sin(TAU * 2 * f * t) * Math.exp(-t / 0.35);
    const trem = 0.13 * Math.sin(TAU * 4.6 * t);
    o.add(i, y * env * amp * (1 + trem), pan - 0.25);
    o.add(i, y * env * amp * (1 - trem) * 0.9, pan + 0.25);
  });
}

/** A vibraphone bar (motor on). */
function vibe(o: Out, t0: number, m: number, amp: number, len = 1.4, pan = 0) {
  const f = mtof(m);
  o.span(t0, len, (i, t) => {
    const env = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.75) * (t > len - 0.1 ? (len - t) / 0.1 : 1);
    const y = Math.sin(TAU * f * t) + 0.22 * Math.sin(TAU * 4 * f * t) * Math.exp(-t / 0.12) + 0.06 * Math.sin(TAU * 9.9 * f * t) * Math.exp(-t / 0.03);
    o.add(i, y * env * amp * (1 + 0.3 * Math.sin(TAU * 5.5 * t)), pan);
  });
}

/** An upright bass, plucked. */
function bass(o: Out, t0: number, m: number, amp: number, len = 1.2) {
  const f = mtof(m);
  const lp = new SVF(o.sr).set(380, 0.7);
  const R = rng(m * 31);
  o.span(t0, len, (i, t) => {
    const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.42) * (t > len - 0.1 ? (len - t) / 0.1 : 1);
    const y = Math.sin(TAU * f * t) + 0.45 * Math.sin(TAU * 2 * f * t) * Math.exp(-t / 0.25) + 0.18 * Math.sin(TAU * 3 * f * t) * Math.exp(-t / 0.12);
    const pluck = lp.tick(R() * 2 - 1).lp * Math.exp(-t / 0.02) * 0.6;
    o.add(i, (y * env + pluck) * amp);
  });
}

/** A ride cymbal touched with a brush. */
function ride(o: Out, t0: number, amp: number, len = 1.6) {
  const R = rng(77);
  const hp = new SVF(o.sr).set(6500, 0.6);
  const modes = [5170, 6930, 8410, 10200];
  o.span(t0, len, (i, t) => {
    const env = Math.exp(-t / 0.55);
    let y = hp.tick(R() * 2 - 1).hp * 0.6;
    for (let k = 0; k < 4; k++) y += Math.sin(TAU * modes[k] * t + k) * 0.12 * Math.exp(-t / (0.35 + k * 0.1));
    o.add(i, y * env * amp, 0.3);
  });
}

/** A brushed snare roll that swells to `dur`. */
function roll(o: Out, dur: number, amp: number) {
  const R = rng(5);
  const bp = new SVF(o.sr).set(3800, 0.6);
  o.span(0, dur, (i, t) => {
    const u = t / dur;
    const am = 0.55 + 0.45 * Math.sin(TAU * (14 + 6 * u) * t);
    o.add(i, bp.tick(R() * 2 - 1).bp * (0.15 + 0.85 * u * u) * am * amp, Math.sin(t * 9) * 0.2);
  });
}

// ---- the bank ------------------------------------------------------------------------------------

type Name = "deal" | "flip" | "clack" | "shuffle" | "knock" | "muck" | "push" | "puck" | "allin" | "win" | "bigwin" | "bust" | "turn" | "level" | "ui" | "roll1" | "roll15" | "lose";
const VARIANTS: Partial<Record<Name, number>> = { deal: 4, flip: 3, clack: 8, knock: 2, muck: 2, push: 2 };

function render(name: Name, v: number, ac: BaseAudioContext): AudioBuffer {
  const sr = ac.sampleRate;
  const R = rng(1000 + v * 97 + name.length * 13);
  let o: Out;
  switch (name) {
    case "deal": {
      // off the deck (a bright "fwip" that falls), then landing flat on the felt
      o = new Out(sr, 0.2);
      swish(o, 0, 0.085, 6200 - v * 300, 2600, 0.9, 0.7, R, 0.004);
      const land = 0.072 + R() * 0.02;
      thump(o, land, 0.55, R, 1300, 210, 0.006);
      swish(o, land, 0.05, 2400, 1600, 0.7, 0.25, R, 0.002);
      return o.buffer(ac, 0.7);
    }
    case "flip": {
      // two flaps of card stock, then it lies down
      o = new Out(sr, 0.16);
      const bp = new SVF(sr).set(3400 + v * 250, 1.1);
      o.span(0, 0.05, (i, t) => o.add(i, bp.tick(R() * 2 - 1).bp * Math.exp(-t / 0.006) * 0.5));
      const bp2 = new SVF(sr).set(3000 + v * 200, 1);
      o.span(0.032, 0.06, (i, t) => o.add(i, bp2.tick(R() * 2 - 1).bp * Math.exp(-t / 0.009)));
      thump(o, 0.06, 0.35, R, 900, 180, 0.007);
      return o.buffer(ac, 0.6);
    }
    case "clack": {
      o = new Out(sr, 0.07);
      clack(o, 0, 1, R);
      return o.buffer(ac, 0.8);
    }
    case "shuffle": {
      // a riffle (the halves left and right, faster in the middle), the bridge, the deck squared twice
      o = new Out(sr, 1.3);
      const n = 46;
      for (let k = 0; k < n; k++) {
        const u = k / n;
        const t = 0.06 + 0.58 * (u - 0.12 * Math.sin(u * Math.PI)) + R() * 0.004;
        const f = 2300 + R() * 2200;
        const bp = new SVF(sr).set(f, 4);
        const a = 0.25 + R() * 0.45;
        o.span(t, 0.012, (i, tt) => o.add(i, bp.tick(R() * 2 - 1).bp * Math.exp(-tt / 0.0016) * a, k % 2 ? 0.35 : -0.35));
      }
      swish(o, 0.06, 0.62, 2600, 3400, 0.6, 0.07, R, 0.05);
      for (let k = 0; k < 26; k++) {
        const t = 0.76 + k * 0.0075 + R() * 0.002;
        const bp = new SVF(sr).set(2800 + R() * 1500, 3);
        const a = 0.35 * (1 - k / 30);
        o.span(t, 0.01, (i, tt) => o.add(i, bp.tick(R() * 2 - 1).bp * Math.exp(-tt / 0.0014) * a));
      }
      swish(o, 0.76, 0.22, 3000, 2200, 0.6, 0.12, R, 0.01);
      thump(o, 1.04, 0.7, R, 700, 120, 0.01);
      thump(o, 1.15, 0.5, R, 700, 130, 0.009);
      return o.buffer(ac, 0.75);
    }
    case "knock": {
      // two knuckles on the padded rail: a low thud with a woody ring
      o = new Out(sr, 0.36);
      for (const [t0, a] of [
        [0, 1],
        [0.115 + v * 0.02, 0.8],
      ] as const) {
        const lp = new SVF(sr).set(1900, 0.7);
        o.span(t0, 0.2, (i, t) => {
          const f = 92 + 90 * Math.exp(-t / 0.011);
          const y = Math.sin(TAU * f * t) * Math.exp(-t / 0.034) * 0.9 + lp.tick(R() * 2 - 1).lp * Math.exp(-t / 0.004) * 0.7 + Math.sin(TAU * 410 * t) * Math.exp(-t / 0.028) * 0.22;
          o.add(i, y * a);
        });
      }
      return o.buffer(ac, 0.85);
    }
    case "muck": {
      // two cards slid face down over the felt
      o = new Out(sr, 0.32);
      swish(o, 0, 0.24, 2100, 1300, 0.6, 0.5, R, 0.03);
      thump(o, 0.2, 0.25, R, 800, 160, 0.008);
      return o.buffer(ac, 0.5);
    }
    case "push": {
      // a pile pushed over the felt, its chips knocking together
      o = new Out(sr, 0.5);
      const lp = new SVF(sr).set(1500, 0.6);
      o.span(0, 0.42, (i, t) => {
        const env = t < 0.06 ? t / 0.06 : Math.pow(1 - (t - 0.06) / 0.36, 1.4);
        o.add(i, lp.tick(R() * 2 - 1).lp * env * 0.55);
      });
      for (let k = 0; k < 7; k++) clack(o, 0.04 + R() * 0.36, 0.2 + R() * 0.25, R, (R() - 0.5) * 0.4);
      return o.buffer(ac, 0.6);
    }
    case "puck": {
      o = new Out(sr, 0.3);
      swish(o, 0, 0.18, 1800, 1100, 0.6, 0.35, R, 0.02);
      thump(o, 0.17, 0.6, R, 1600, 240, 0.006);
      return o.buffer(ac, 0.5);
    }
    case "allin": {
      // the band hits it: a low bass and a tom, a dark minor-ninth chord, the ride
      o = new Out(sr, 2.3);
      bass(o, 0, 33, 0.9, 1.6);
      o.span(0, 0.6, (i, t) => o.add(i, Math.sin(TAU * (52 + 30 * Math.exp(-t / 0.04)) * t) * Math.exp(-t / 0.22) * 0.8));
      [57, 60, 64, 67, 71].forEach((m, k) => ep(o, 0.02 + k * 0.012, m, 0.2, 2));
      ride(o, 0.01, 0.35, 1.8);
      return o.buffer(ac, 0.8);
    }
    case "win":
    case "bigwin": {
      // a major-ninth chord rolled up on the piano, the bass, the vibes on top
      const big = name === "bigwin";
      o = new Out(sr, big ? 3 : 2.4);
      bass(o, 0, 36, 0.8, 1.8);
      [60, 64, 67, 71, 74, 79].forEach((m, k) => ep(o, k * 0.07, m, 0.2, 2));
      vibe(o, 0.42, 79, 0.25, 1.6, 0.3);
      vibe(o, 0.56, 83, 0.2, 1.6, 0.3);
      if (big) {
        vibe(o, 0.7, 86, 0.18, 1.8, -0.2);
        ride(o, 0, 0.3, 2.2);
      }
      return o.buffer(ac, big ? 0.8 : 0.7);
    }
    case "bust":
    case "lose": {
      // F minor six, slow and soft, the bass sliding down
      o = new Out(sr, 2.4);
      bass(o, 0, name === "bust" ? 29 : 41, 0.7, 1.8);
      [53, 56, 60, 62].forEach((m, k) => ep(o, 0.05 + k * 0.09, m, 0.18, 2));
      if (name === "bust") vibe(o, 0.6, 68, 0.18, 1.6);
      return o.buffer(ac, name === "bust" ? 0.6 : 0.4);
    }
    case "turn": {
      o = new Out(sr, 1.3);
      vibe(o, 0, 76, 0.5, 1.1, -0.1);
      vibe(o, 0.1, 81, 0.45, 1.1, 0.1);
      return o.buffer(ac, 0.45);
    }
    case "level": {
      // the floor's service bell, twice
      o = new Out(sr, 1.6);
      for (const t0 of [0, 0.2])
        o.span(t0, 1.3, (i, t) => {
          const y = Math.sin(TAU * 2093 * t) * Math.exp(-t / 0.7) + 0.5 * Math.sin(TAU * 2093 * 2.76 * t) * Math.exp(-t / 0.25) + 0.25 * Math.sin(TAU * 2093 * 5.4 * t) * Math.exp(-t / 0.08);
          o.add(i, y * (1 - Math.exp(-t / 0.001)) * 0.5);
        });
      return o.buffer(ac, 0.45);
    }
    case "ui": {
      o = new Out(sr, 0.04);
      const hp = new SVF(sr).set(2500, 0.8);
      o.span(0, 0.03, (i, t) => o.add(i, (hp.tick(R() * 2 - 1).hp * Math.exp(-t / 0.0015) + Math.sin(TAU * 1900 * t) * Math.exp(-t / 0.006) * 0.5) * 0.7));
      return o.buffer(ac, 0.35);
    }
    case "roll1":
    case "roll15": {
      const d = name === "roll1" ? 1 : 1.5;
      o = new Out(sr, d + 1.4);
      roll(o, d, 0.5);
      ride(o, d, 0.45, 1.4);
      o.span(d, 0.5, (i, t) => o.add(i, Math.sin(TAU * (60 + 40 * Math.exp(-t / 0.03)) * t) * Math.exp(-t / 0.18) * 0.7));
      return o.buffer(ac, 0.7);
    }
  }
}

let bankCtx: BaseAudioContext | null = null;
const bank = new Map<string, AudioBuffer>();
function buf(ac: BaseAudioContext, name: Name, v = 0) {
  if (bankCtx !== ac) {
    bank.clear();
    bankCtx = ac;
  }
  const k = `${name}${v}`;
  let b = bank.get(k);
  if (!b) bank.set(k, (b = render(name, v, ac)));
  return b;
}

// ---- playing -------------------------------------------------------------------------------------

/** The room the engine was in before the Orchard Room (put back when the table closes). */
let enteredRoom: RoomKind | null = null;
const mix = (): Mixer | null => party();

const vr = () => Math.random();
interface PlayOpts {
  delay?: number;
  gain?: number;
  pan?: number;
  rate?: number;
  wet?: number;
}
/** The bench's fast mode plays hundreds of hands a minute: silent. */
let muted = false;
function play(name: Name, o: PlayOpts = {}) {
  if (muted) return;
  const m = mix();
  if (!m) return;
  const ac = m.ac;
  const n = VARIANTS[name] ?? 1;
  const src = ac.createBufferSource();
  src.buffer = buf(ac, name, n > 1 ? Math.floor(vr() * n) : 0);
  if (o.rate) src.playbackRate.value = o.rate;
  const g = ac.createGain();
  g.gain.value = o.gain ?? 1;
  src.connect(g);
  let tail: AudioNode = g;
  let p: StereoPannerNode | null = null;
  if (o.pan) {
    p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    g.connect(p);
    tail = p;
  }
  tail.connect(m.sfx);
  let w: GainNode | null = null;
  if (o.wet) {
    w = ac.createGain();
    w.gain.value = o.wet;
    tail.connect(w).connect(m.roomSend);
  }
  src.onended = () => {
    g.disconnect();
    p?.disconnect();
    w?.disconnect();
  };
  src.start(ac.currentTime + (o.delay ?? 0));
}

/** n chips set down, one after the other (a pile landing), panned to where they land. */
function chipsDown(n: number, pan = 0, delay = 0, gain = 1, gap = 0.032) {
  let t = delay;
  for (let k = 0; k < n; k++) {
    play("clack", { delay: t, gain: gain * (0.55 + vr() * 0.45) * (k === n - 1 ? 1 : 0.8), pan, rate: 0.94 + vr() * 0.12, wet: 0.12 });
    t += gap * (0.6 + vr() * 0.8);
  }
}

/** How many clacks a bet is worth: a couple for a blind, a cascade for a big one. */
const clacksFor = (bbs: number) => Math.max(2, Math.min(12, Math.round(2 + Math.log2(1 + bbs) * 1.7)));

export const snd = {
  /** Silences the one-shots (the bench's fast mode). */
  mute(v: boolean) {
    muted = v;
  },
  /** A card slides off the deck and lands. */
  card: (pan = 0) => play("deal", { gain: 0.8, pan, rate: 0.96 + vr() * 0.08, wet: 0.1 }),
  /** A card turns over. */
  flip: (pan = 0, delay = 0) => play("flip", { gain: 0.75, pan, delay, rate: 0.95 + vr() * 0.1, wet: 0.08 }),
  /** The deck riffled, bridged and squared. */
  shuffle: () => play("shuffle", { gain: 0.8, wet: 0.12 }),
  /** A bet set down: `bbs` big blinds' worth (more chips, a longer cascade). */
  bet: (bbs: number, pan = 0) => {
    chipsDown(clacksFor(bbs), pan, 0, 0.9);
    if (bbs > 6) play("push", { gain: 0.35 + Math.min(0.4, bbs / 80), pan, wet: 0.08 });
  },
  /** A few chips (blinds, a rebuy). */
  chips: (n = 3, pan = 0) => chipsDown(n, pan, 0, 0.75),
  /** Bets swept into the pot. */
  sweep: () => {
    play("push", { gain: 0.75, wet: 0.1 });
    chipsDown(4, 0, 0.18, 0.5, 0.025);
  },
  /** The pot pushed to its winner (bigger pots, more chips). */
  pot: (bbs: number, pan = 0) => {
    play("push", { gain: 0.9, pan: pan * 0.6, wet: 0.1 });
    chipsDown(Math.min(14, 4 + Math.round(Math.log2(1 + bbs) * 1.5)), pan, 0.3, 0.7, 0.026);
  },
  /** Two knuckles on the rail. */
  check: (pan = 0) => play("knock", { gain: 0.9, pan, wet: 0.15 }),
  /** Cards pushed away. */
  fold: (pan = 0) => play("muck", { gain: 0.7, pan, wet: 0.08 }),
  /** All in: the band's hit, then the whole stack pushed in. */
  allin: (pan = 0) => {
    if (!muted) mix()?.duck(0.6, 1.2, 1.2);
    play("allin", { gain: 0.85, wet: 0.2 });
    play("push", { gain: 0.9, pan, delay: 0.05 });
    chipsDown(12, pan, 0.08, 0.8, 0.02);
  },
  /** The suspense before an all-in's turn or river. */
  drumroll: (dur = 1) => {
    mix()?.duck(0.7, dur, 1);
    play(dur > 1.2 ? "roll15" : "roll1", { gain: 0.7, wet: 0.2 });
  },
  /** Your turn. */
  turn: () => play("turn", { gain: 0.6, wet: 0.25 }),
  /** Your pot (`big`: a big one). */
  win: (big = false) => {
    mix()?.duck(0.55, big ? 1.8 : 1.2, 1.2);
    play(big ? "bigwin" : "win", { gain: 0.8, wet: 0.25 });
  },
  /** You lost a big pot. */
  lose: () => play("lose", { gain: 0.6, wet: 0.25 }),
  /** Out of the game. */
  bust: () => {
    mix()?.duck(0.6, 1.5, 1);
    play("bust", { gain: 0.75, wet: 0.25 });
  },
  /** The blinds go up. */
  level: () => play("level", { gain: 0.55, wet: 0.3 }),
  /** The dealer puck slides to its seat. */
  puck: (pan = 0) => play("puck", { gain: 0.6, pan, wet: 0.08 }),
  /** A click on the UI. */
  ui: () => play("ui", { gain: 0.6 }),
  /** Renders the bank ahead of the first hand (a few at a time, between frames). */
  warm() {
    const m = mix();
    if (!m) return;
    const todo: [Name, number][] = [];
    for (const nm of ["deal", "flip", "clack", "shuffle", "knock", "muck", "push", "puck", "turn", "ui", "allin", "win", "bigwin", "bust", "lose", "level", "roll1", "roll15"] as Name[])
      for (let v = 0; v < (VARIANTS[nm] ?? 1); v++) todo.push([nm, v]);
    // one at a time, when the page is idle (the stings take a few tens of ms each)
    const idle = (f: () => void) => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(() => f(), { timeout: 600 }) : setTimeout(f, 30));
    const step = () => {
      const next = todo.shift();
      if (!next) return;
      buf(m.ac, next[0], next[1]);
      idle(step);
    };
    window.setTimeout(() => idle(step), 400);
  },
};

// ---- the room ------------------------------------------------------------------------------------

/** The band's set (public/audio/music): the Orchard Room's own quartet first. */
const SET = ["music/jazz-dixie", "music/sax-solo", "music/jazz-combo", "music/piano-nocturne"];

/** The club around the table: the diners' murmur and the band on the stand (switchable). */
export class Room {
  private murmur: Playing | null = null;
  private band: { src: AudioBufferSourceNode; out: GainNode } | null = null;
  private track = 0;
  private alive = true;
  private timer = 0;
  musicOn = true;

  constructor() {
    try {
      this.musicOn = localStorage.getItem("lh.music") !== "0";
    } catch {}
  }

  /** Starts (or resumes after the first click: the browser keeps the sound asleep until then). */
  start() {
    const m = mix();
    if (!m || !this.alive) return;
    if (!enteredRoom) {
      enteredRoom = m.roomKind ?? "outdoor";
      m.room("club");
    }
    if (!this.murmur) this.murmur = loopInto(m.ac, m.amb, "restaurant", 0.55, { lp: 2300, hp: 140, fadeIn: 2 }, () => this.alive);
    if (this.musicOn && !this.band) void this.next(m);
  }

  private async next(m: Mixer) {
    const name = SET[this.track % SET.length];
    const b = await load(m.ac, name);
    if (!b || !this.alive || !this.musicOn || this.band) return;
    const ac = m.ac;
    const src = ac.createBufferSource();
    src.buffer = b;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 4200;
    const out = ac.createGain();
    const t = ac.currentTime + 0.05;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.32, t + 2.5);
    const wet = ac.createGain();
    wet.gain.value = 0.35;
    src.connect(lp).connect(out);
    out.connect(m.music);
    out.connect(wet).connect(m.roomSend);
    src.start(t);
    this.band = { src, out };
    src.onended = () => {
      if (this.band?.src !== src) return;
      out.disconnect();
      this.band = null;
      this.track++;
      // a breath between numbers
      this.timer = window.setTimeout(() => this.alive && this.musicOn && this.start(), 2600);
    };
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    try {
      localStorage.setItem("lh.music", on ? "1" : "0");
    } catch {}
    if (on) this.start();
    else this.stopBand(0.6);
  }

  private stopBand(fade: number) {
    const b = this.band;
    if (!b) return;
    this.band = null;
    const ac = b.out.context;
    b.out.gain.cancelScheduledValues(ac.currentTime);
    b.out.gain.setTargetAtTime(0, ac.currentTime, fade / 3);
    window.setTimeout(
      () => {
        try {
          b.src.stop();
        } catch {
          /* already stopped */
        }
        b.out.disconnect();
      },
      fade * 1000 + 200,
    );
  }

  stop() {
    this.alive = false;
    window.clearTimeout(this.timer);
    this.murmur?.stop(0.8);
    this.murmur = null;
    this.stopBand(0.8);
    const m = party();
    if (m && enteredRoom) m.room(enteredRoom);
    enteredRoom = null;
  }
}
