/**
 * The music's sampled voices, synthesised in JS once per audio context (./dsp.ts) and then only
 * played back (a buffer source and a gain a note):
 * - drum kits (pop, soft, deep): kick (a body, a 2nd harmonic for phone speakers, a beater click),
 *   snares with a tuned shell and wires, a layered clap, 808-style metallic hats, a shaker, rim,
 *   wood block, three toms, a crash, a sub boom and a reversed cymbal swell; several variants of the
 *   busy ones (round robin), so a groove never machine-guns;
 * - struck instruments, multi-sampled every 4 semitones (a note plays its nearest zone, re-pitched
 *   ±2 semitones): an FM electric piano, an FM bell, a marimba (tuned bar modes and the mallet), a
 *   synth pluck (two detuned oscillators under a snapping filter), a clavinet, a slap bass.
 * Zones render on first use (a few ms each); `prepare()` renders a song's in idle time.
 */
import { Noise, Osc, SVF, Sig, TAU, ad, mtof, rand, soft, type Rand } from "./dsp";

export type DrumKit = 0 | 1 | 2;
/** The drums (index = the music's DRUMS letters k s c h o z r w 1 2 3 y), then the boom and the swell. */
export const BOOM = 12;
export const SWELL = 13;
/** Variants per drum (round robin). */
const DVARS = [2, 3, 2, 4, 2, 4, 2, 2, 1, 1, 1, 2, 1, 1];

type Render = (s: Sig, r: Rand, kit: DrumKit, v: number) => void;

function sine(s: Sig, f: (t: number) => number, amp: (t: number) => number, drive = 1, g = [0.7071, 0.7071]) {
  const o = new Osc(s.sr, 0.25);
  for (let i = 0; i < s.n; i++) {
    const t = i / s.sr;
    const a = amp(t);
    if (a < 1e-5 && t > 0.05) break;
    const x = soft(o.sine(f(t)) * drive) * a;
    s.L[i] += x * g[0];
    s.R[i] += x * g[1];
  }
}
function noise(s: Sig, r: Rand, type: "lp" | "bp" | "hp", fc: number, q: number, amp: (t: number) => number, stereo = 0) {
  const fl = new SVF(s.sr, fc, q);
  const fr = new SVF(s.sr, fc, q);
  for (let i = 0; i < s.n; i++) {
    const t = i / s.sr;
    const a = amp(t);
    if (a < 1e-5 && t > 0.05) break;
    const w = r() * 2 - 1;
    fl.tick(w);
    fr.tick(stereo ? r() * 2 - 1 : w);
    const pick = (f: SVF) => (type === "lp" ? f.lp : type === "hp" ? f.hp : f.bpn());
    s.L[i] += pick(fl) * a;
    s.R[i] += (stereo ? pick(fr) * stereo + pick(fl) * (1 - stereo) : pick(fl)) * a;
  }
}
/** 808-style metal: six square waves at inharmonic ratios, band-passed, a fast or slow decay. */
function metal(s: Sig, r: Rand, k: number, fc: number, tau: number, amp: number, noiseMix: number) {
  const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * k);
  const os = fr.map(() => new Osc(s.sr, r()));
  const bp = new SVF(s.sr, fc, 0.9);
  const hp = new SVF(s.sr, fc * 0.7, 0.7);
  const hp2 = new SVF(s.sr, fc * 0.7, 0.7);
  for (let i = 0; i < s.n; i++) {
    const t = i / s.sr;
    const e = ad(t, 0.0006, tau);
    if (e < 1e-5 && t > 0.01) break;
    let m = 0;
    for (let k = 0; k < 6; k++) m += os[k].pulse(fr[k], 0.5);
    const w = r() * 2 - 1;
    bp.tick(m * 0.16 + w * noiseMix);
    hp.tick(bp.bp);
    hp2.tick(bp.bp * 0.9 + (r() * 2 - 1) * noiseMix * 0.3);
    s.L[i] += hp.hp * e * amp;
    s.R[i] += hp2.hp * e * amp;
  }
}

const DRUM_R: Render[] = [
  // 0 kick
  (s, r, kit) => {
    if (kit === 1) {
      sine(s, (t) => 54 + 70 * Math.exp(-t / 0.03), (t) => ad(t, 0.002, 0.13), 1.2);
      noise(s, r, "lp", 900, 0.7, (t) => 0.25 * ad(t, 0.001, 0.01));
      return;
    }
    const deep = kit === 2;
    const f1 = deep ? 44 : 50;
    sine(s, (t) => f1 + (deep ? 95 : 125) * Math.exp(-t / (deep ? 0.04 : 0.026)), (t) => ad(t, 0.0008, deep ? 0.42 : 0.15), deep ? 1.5 : 1.9);
    // the 2nd harmonic (phones can't play 50 Hz; this lets them imply it)
    sine(s, (t) => 2 * (f1 + 60 * Math.exp(-t / 0.03)), (t) => 0.22 * ad(t, 0.001, deep ? 0.12 : 0.06));
    noise(s, r, "hp", 3000, 0.7, (t) => 0.35 * ad(t, 0.0002, 0.003));
    sine(s, (t) => 1400 * Math.exp(-t / 0.01) + 300, (t) => 0.18 * ad(t, 0.0002, 0.005));
  },
  // 1 snare
  (s, r, kit, v) => {
    const k = 1 + (v - 1) * 0.02;
    if (kit === 1) {
      // brushes: a swish and a soft shell
      noise(s, r, "bp", 3200 * k, 0.6, (t) => ad(t, 0.012, 0.09), 0.4);
      sine(s, (t) => 190 * k, (t) => 0.3 * ad(t, 0.002, 0.04));
      return;
    }
    const deep = kit === 2;
    sine(s, (t) => (deep ? 165 : 190) * k * (1 + 0.1 * Math.exp(-t / 0.01)), (t) => 0.75 * ad(t, 0.0008, 0.055));
    sine(s, (t) => (deep ? 290 : 335) * k, (t) => 0.35 * ad(t, 0.0008, 0.035));
    noise(s, r, "bp", 5200 * k, 0.7, (t) => 0.9 * ad(t, 0.0008, deep ? 0.17 : 0.13), 0.3);
    noise(s, r, "hp", 1800, 0.7, (t) => 0.4 * ad(t, 0.0005, 0.02));
  },
  // 2 clap
  (s, r, kit, v) => {
    const gap = 0.009 + v * 0.002;
    const env = (t: number) => {
      let e = 0;
      for (let k = 0; k < 3; k++) e = Math.max(e, ad(t - k * gap, 0.0006, 0.005));
      return e + 0.8 * ad(t - 3 * gap, 0.001, kit === 1 ? 0.06 : 0.1);
    };
    noise(s, r, "bp", 1250, 1.3, env, 0.5);
    noise(s, r, "bp", 2400, 1.1, (t) => 0.4 * env(t), 0.5);
  },
  // 3 closed hat
  (s, r, kit, v) => {
    if (kit === 1) return noise(s, r, "bp", 7500 + v * 300, 0.9, (t) => ad(t, 0.0008, 0.02), 0.2);
    metal(s, r, 1 + v * 0.025, 10000, kit === 2 ? 0.024 : 0.018, 1, 0.25);
  },
  // 4 open hat
  (s, r, kit, v) => {
    if (kit === 1) return noise(s, r, "bp", 7000, 0.8, (t) => ad(t, 0.002, 0.12), 0.4);
    metal(s, r, 1 + v * 0.03, 9500, 0.16, 0.9, 0.3);
  },
  // 5 shaker
  (s, r, _k, v) => {
    noise(s, r, "bp", 6200 + v * 400, 1.1, (t) => (t < 0.012 ? t / 0.012 : Math.exp(-(t - 0.012) / 0.028)) * (0.8 + 0.2 * Math.sin(t * 900)), 0.5);
  },
  // 6 rim
  (s, r, _k, v) => {
    const k = 1 + v * 0.02;
    sine(s, () => 1700 * k, (t) => 0.7 * ad(t, 0.0003, 0.012));
    sine(s, () => 3150 * k, (t) => 0.35 * ad(t, 0.0003, 0.008));
    noise(s, r, "hp", 4000, 0.7, (t) => 0.3 * ad(t, 0.0002, 0.003));
  },
  // 7 wood block
  (s, _r, _k, v) => {
    const k = 1 + v * 0.03;
    sine(s, () => 1050 * k, (t) => 0.8 * ad(t, 0.0005, 0.03));
    sine(s, () => 2640 * k, (t) => 0.3 * ad(t, 0.0005, 0.012));
  },
  // 8–10 toms
  ...[230, 165, 112].map(
    (f0): Render =>
      (s, r) => {
        sine(s, (t) => f0 * (1 + 0.45 * Math.exp(-t / 0.025)), (t) => ad(t, 0.0008, 0.2), 1.4);
        sine(s, (t) => f0 * 1.6 * (1 + 0.3 * Math.exp(-t / 0.02)), (t) => 0.2 * ad(t, 0.0008, 0.06));
        noise(s, r, "lp", 3000, 0.7, (t) => 0.3 * ad(t, 0.0005, 0.012));
      },
  ),
  // 11 crash
  (s, r, _k, v) => {
    metal(s, r, 1.6 + v * 0.1, 7000, 0.75, 0.8, 0.55);
    noise(s, r, "hp", 5000, 0.6, (t) => 0.35 * ad(t, 0.001, 0.9), 1);
  },
  // 12 boom: a sub drop under a stage's downbeat
  (s, r) => {
    sine(s, (t) => 34 + 70 * Math.exp(-t / 0.12), (t) => ad(t, 0.002, 0.55), 1.4);
    sine(s, (t) => 2 * (34 + 70 * Math.exp(-t / 0.12)), (t) => 0.25 * ad(t, 0.002, 0.25));
    noise(s, r, "lp", 400, 0.7, (t) => 0.5 * ad(t, 0.001, 0.08));
  },
  // 13 swell: a cymbal played backwards, into a downbeat (the buffer's end)
  (s, r) => {
    const tmp = new Sig(s.sr, s.n / s.sr);
    metal(tmp, r, 1.7, 7500, 0.5, 0.7, 0.6);
    noise(tmp, r, "hp", 4000, 0.6, (t) => 0.4 * ad(t, 0.001, 0.5), 1);
    for (let i = 0; i < s.n; i++) {
      s.L[i] = tmp.L[s.n - 1 - i];
      s.R[i] = tmp.R[s.n - 1 - i];
    }
  },
];
const DRUM_LEN = [0.5, 0.45, 0.45, 0.15, 0.7, 0.16, 0.09, 0.14, 0.7, 0.7, 0.8, 3, 2, 1.2];
/** Level of each drum's buffer (after a peak normalise): the kit's balance. */
const DRUM_LV = [1, 0.8, 0.75, 0.4, 0.42, 0.34, 0.45, 0.5, 0.75, 0.75, 0.8, 0.42, 0.9, 0.4];

const drumCache = new WeakMap<BaseAudioContext, Map<number, AudioBuffer[]>>();
/** A drum's buffer (kit, drum index, the hit count for the round robin). */
export function drumBuffer(ac: BaseAudioContext, kit: DrumKit, d: number, n: number): AudioBuffer {
  let m = drumCache.get(ac);
  if (!m) drumCache.set(ac, (m = new Map()));
  const key = kit * 32 + d;
  let vs = m.get(key);
  if (!vs) m.set(key, (vs = []));
  const v = n % DVARS[d];
  if (vs[v]) return vs[v];
  const s = new Sig(ac.sampleRate, DRUM_LEN[d] * (kit === 2 && d === 0 ? 2.4 : 1));
  DRUM_R[d](s, rand(0xd1 + d * 101 + v * 7 + kit * 3), kit, v);
  s.norm(0.9 * DRUM_LV[d]);
  if (d !== SWELL) s.edges(0.0003, 0.02);
  return (vs[v] = s.buffer(ac));
}

// ---- the struck instruments ----------------------------------------------------------------------

export type Struck = "keys" | "bell" | "marimba" | "pluck" | "clav" | "funk";
interface StruckDef {
  len: (f: number) => number;
  lv: number;
  /** Stereo (its own width); otherwise kept as one channel (half the memory). */
  stereo?: boolean;
  make(s: Sig, f: number, r: Rand): void;
}

const STRUCK: Record<Struck, StruckDef> = {
  keys: {
    // an electric piano: 1:1 FM whose bark fades, a tine ping, a slow autopan
    len: (f) => Math.min(2.6, 1.2 + 200 / f),
    lv: 0.62,
    stereo: true,
    make(s, f) {
      const sr = s.sr;
      const c = new Osc(sr);
      const m = new Osc(sr);
      const tine = new Osc(sr);
      const tau = 1.3 * Math.pow(330 / f, 0.35);
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        const idx = 1.5 * Math.exp(-t / 0.18) + 0.22;
        const x = c.pm(f, m.sine(f) * idx) * ad(t, 0.0015, tau) + tine.sine(f * 7.02) * 0.12 * ad(t, 0.0005, 0.03);
        const p = 0.5 + 0.22 * Math.sin(TAU * 4.2 * t);
        s.L[i] += x * Math.cos(p * Math.PI * 0.5);
        s.R[i] += x * Math.sin(p * Math.PI * 0.5);
      }
    },
  },
  bell: {
    // an FM bell: an inharmonic 3.5 modulator, a struck partial, a long ring
    len: (f) => Math.min(3, 1.4 + 500 / f),
    lv: 0.5,
    make(s, f) {
      const sr = s.sr;
      const c = new Osc(sr);
      const m = new Osc(sr);
      const p2 = new Osc(sr);
      const tau = 0.9 * Math.pow(880 / f, 0.3);
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        const x = c.pm(f, m.sine(f * 3.5) * (2 * Math.exp(-t / 0.25) + 0.25)) * ad(t, 0.001, tau) + p2.sine(f * 2.76) * 0.25 * ad(t, 0.0008, tau * 0.25);
        s.L[i] += x * 0.7071;
        s.R[i] += x * 0.7071;
      }
    },
  },
  marimba: {
    // a bar's three modes (1, 3.93, 9.2) and the mallet's thud
    len: (f) => Math.min(1.4, 0.35 + 90 / f),
    lv: 0.62,
    make(s, f, r) {
      const sr = s.sr;
      const tau = Math.max(0.1, Math.min(0.7, 0.45 * Math.sqrt(220 / f)));
      const os = [new Osc(sr), new Osc(sr), new Osc(sr)];
      const lp = new SVF(sr, Math.min(9000, f * 6), 0.7);
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        let x = os[0].sine(f) * ad(t, 0.0015, tau) + (f * 3.93 < sr * 0.45 ? os[1].sine(f * 3.93) * 0.3 * ad(t, 0.001, tau / 4) : 0) + (f * 9.2 < sr * 0.45 ? os[2].sine(f * 9.2) * 0.08 * ad(t, 0.0008, tau / 12) : 0);
        x += lp.tick(r() * 2 - 1) * 0.25 * ad(t, 0.0005, 0.004);
        s.L[i] += x * 0.7071;
        s.R[i] += x * 0.7071;
      }
    },
  },
  pluck: {
    // two oscillators a few cents apart (one each side) under a filter that snaps shut
    len: (f) => Math.min(1.1, 0.5 + 60 / f),
    lv: 0.55,
    stereo: true,
    make(s, f) {
      const sr = s.sr;
      const a = new Osc(sr);
      const b = new Osc(sr, 0.37);
      const c = new Osc(sr, 0.71);
      const fa = new SVF(sr, 4000, 1.3);
      const fb = new SVF(sr, 4000, 1.3);
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        if ((i & 7) === 0) {
          const fc = f * 1.4 + 200 + 7000 * Math.exp(-t / 0.055);
          fa.set(fc, 1.3);
          fb.set(fc, 1.3);
        }
        const e = ad(t, 0.001, 0.3);
        const p = b.pulse(f * 1.0023, 0.42) * 0.4;
        s.L[i] += fa.tick(a.saw(f * 0.9977) * 0.7 + p) * e;
        s.R[i] += fb.tick(c.saw(f * 1.0015) * 0.7 + p) * e;
      }
    },
  },
  clav: {
    // a narrow pulse through a snappy resonant filter, the key's click
    len: () => 0.55,
    lv: 0.55,
    make(s, f, r) {
      const sr = s.sr;
      const o = new Osc(sr);
      const fl = new SVF(sr, 3000, 3);
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        if ((i & 7) === 0) fl.set(f * 2.5 + 3500 * Math.exp(-t / 0.04), 3);
        const x = fl.tick(o.pulse(f, 0.2)) * ad(t, 0.0008, 0.16) + (r() * 2 - 1) * 0.15 * ad(t, 0.0003, 0.002);
        s.L[i] += x * 0.7071;
        s.R[i] += x * 0.7071;
      }
    },
  },
  funk: {
    // a slap bass: the thumb's snap, a resonant filter closing, a sub under it
    len: () => 1.1,
    lv: 0.75,
    make(s, f, r) {
      const sr = s.sr;
      const a = new Osc(sr);
      const sub = new Osc(sr);
      const fl = new SVF(sr, 2000, 3.2);
      const n = new Noise(r);
      const sn = new SVF(sr, 2200, 1.4);
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        if ((i & 7) === 0) fl.set(f * 1.8 + 2800 * Math.exp(-t / 0.035) + 300 * Math.exp(-t / 0.3), 3.2);
        const e = t < 0.002 ? t / 0.002 : 0.35 + 0.65 * Math.exp(-(t - 0.002) / 0.12);
        const body = soft(fl.tick(a.saw(f)) * 1.6) * 0.8 + sub.sine(f) * 0.55;
        sn.tick(n.white());
        const x = body * e * Math.exp(-t / 0.9) + sn.bpn() * 0.5 * ad(t, 0.0003, 0.006);
        s.L[i] += x * 0.7071;
        s.R[i] += x * 0.7071;
      }
    },
  },
};

/** Zones: one every 4 semitones (MIDI 20, 24, … 108). */
const ZONE = 4;
const struckCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
/** The zone's buffer and the playback rate for MIDI note `m`. */
export function struck(ac: BaseAudioContext, inst: Struck, m: number): [AudioBuffer, number] {
  const z = Math.max(20, Math.min(108, Math.round(m / ZONE) * ZONE));
  let c = struckCache.get(ac);
  if (!c) struckCache.set(ac, (c = new Map()));
  const key = `${inst}${z}`;
  let b = c.get(key);
  if (!b) {
    const d = STRUCK[inst];
    const f = mtof(z);
    const s = new Sig(ac.sampleRate, d.len(f));
    d.make(s, f, rand(0x5eed + z));
    s.norm(0.9 * d.lv).edges(0.0002, 0.03);
    if (d.stereo) b = s.buffer(ac);
    else {
      b = ac.createBuffer(1, s.n, s.sr);
      b.copyToChannel(s.L, 0);
    }
    c.set(key, b);
  }
  return [b, Math.pow(2, (m - z) / 12)];
}

export const STRUCK_NAMES = Object.keys(STRUCK) as Struck[];

/** Renders, in idle moments, the drums of a kit and the zones these notes need. */
export function prepare(ac: BaseAudioContext, kit: DrumKit, notes: [Struck, number][]) {
  const jobs: (() => void)[] = [];
  for (let d = 0; d < DVARS.length; d++) for (let v = 0; v < DVARS[d]; v++) jobs.push(() => drumBuffer(ac, kit, d, v));
  const seen = new Set<string>();
  for (const [i, m] of notes) {
    const z = Math.round(m / ZONE) * ZONE;
    const k = `${i}${z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    jobs.push(() => struck(ac, i, m));
  }
  const w = typeof window !== "undefined" ? (window as unknown as { requestIdleCallback?: (f: () => void, o?: object) => void }) : null;
  const idle = (f: () => void) => (w?.requestIdleCallback ? w.requestIdleCallback(f, { timeout: 300 }) : setTimeout(f, 16));
  const next = () => {
    const t0 = performance.now();
    while (jobs.length && performance.now() - t0 < 6) jobs.shift()!();
    if (jobs.length) idle(next);
  };
  idle(next);
}
