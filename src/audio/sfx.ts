/**
 * ZK PARTY's sound effects, synthesised (no files): each one is a recipe rendered once per audio
 * context into a few variants (different seeds: the sparkle of a coin, the grit of a hit), then
 * played back with a little pitch, level and pan variation, so a repeat never sounds the same.
 * The kit's `sfx` (src/party/kit.ts) plays these; `playSfx(name, opts)` is the general hook.
 *
 * CPU: a play is a buffer source, a gain, a panner and a send (4 nodes); a name can't stack more
 * than a few at once and there are at most 28 effects ringing. Rendering happens in idle time
 * after the mixer wakes (the hub's blips first), or on the first play.
 */
import { Noise, Osc, SVF, Sig, TAU, ad, bump, pan, rand, soft, type Rand } from "./dsp";
import { mixerFor, onMixer, party, type Mixer } from "./engine";

export type SfxName =
  | "tick"
  | "blip"
  | "count"
  | "go"
  | "coin"
  | "lose"
  | "hit"
  | "thud"
  | "whoosh"
  | "step"
  | "roll"
  | "fanfare"
  | "sad"
  | "star"
  | "chips"
  | "cheer"
  | "aww"
  | "splash"
  | "crack"
  | "gust"
  | "thunder"
  | "chime"
  | "register"
  | "dice";

interface Recipe {
  /** Length (s), sample rate (0: the context's), variants. */
  len: number;
  sr?: number;
  vars?: number;
  /** Level (linear, after a peak normalise), room send, random detune (± fraction), the ducking it asks. */
  gain: number;
  send?: number;
  vary?: number;
  duck?: [number, number, number];
  /** How many may ring at once. */
  poly?: number;
  make(s: Sig, r: Rand, v: number): void;
}

const P: [number, number] = [0, 0];

/** Bell partials (struck metal) at f, from t0, into s: ratios, levels and decays scaled. */
function bell(s: Sig, t0: number, f: number, amp: number, tau: number, p = 0, ratios = [1, 2.76, 5.4, 8.93], lv = [1, 0.45, 0.25, 0.12]) {
  const sr = s.sr;
  const i0 = Math.floor(t0 * sr);
  pan(p, P);
  const gl = P[0];
  const gr = P[1];
  for (let k = 0; k < ratios.length; k++) {
    const fk = f * ratios[k];
    if (fk > sr * 0.45) continue;
    const w = (TAU * fk) / sr;
    const tk = tau / (1 + k * 0.9);
    const n = Math.min(s.n - i0, Math.floor(tk * 7 * sr));
    const a = amp * lv[k];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const x = Math.sin(w * i) * a * Math.exp(-t / tk) * Math.min(1, t / 0.0015);
      s.L[i0 + i] += x * gl;
      s.R[i0 + i] += x * gr;
    }
  }
}

/** A pitched FM tone (a soft mallet / an electric bell): carrier f, modulator f·ratio, index decaying. */
function fm(s: Sig, t0: number, f: number, amp: number, tau: number, ratio: number, index: number, itau: number, p = 0, attack = 0.002) {
  const sr = s.sr;
  const i0 = Math.floor(t0 * sr);
  const n = Math.min(s.n - i0, Math.floor(tau * 7 * sr));
  const c = new Osc(sr);
  const m = new Osc(sr);
  pan(p, P);
  const gl = P[0];
  const gr = P[1];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const x = c.pm(f, m.sine(f * ratio) * index * Math.exp(-t / itau)) * amp * ad(t, attack, tau);
    s.L[i0 + i] += x * gl;
    s.R[i0 + i] += x * gr;
  }
}

/** A noise burst through a band-pass (fc, q), attack/decay, from t0. */
function burst(s: Sig, r: Rand, t0: number, fc: number, q: number, amp: number, tau: number, p = 0, attack = 0.0008, hp = false) {
  const sr = s.sr;
  const i0 = Math.floor(t0 * sr);
  if (i0 >= s.n) return;
  const n = Math.min(s.n - i0, Math.floor(tau * 7 * sr + attack * sr));
  const f = new SVF(sr, fc, q);
  pan(p, P);
  const gl = P[0];
  const gr = P[1];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    f.tick(r() * 2 - 1);
    const x = (hp ? f.hp : f.bpn()) * amp * ad(t, attack, tau);
    s.L[i0 + i] += x * gl;
    s.R[i0 + i] += x * gr;
  }
}

/** A kick-like thump: a sine falling from f0 to f1 (time constant ptau), decaying `tau`. */
function thump(s: Sig, t0: number, f0: number, f1: number, ptau: number, amp: number, tau: number, drive = 1) {
  const sr = s.sr;
  const i0 = Math.floor(t0 * sr);
  const n = Math.min(s.n - i0, Math.floor(tau * 7 * sr));
  const o = new Osc(sr, 0.25);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = f1 + (f0 - f1) * Math.exp(-t / ptau);
    const x = soft(o.sine(f) * drive) * amp * ad(t, 0.0015, tau);
    s.L[i0 + i] += x * 0.7071;
    s.R[i0 + i] += x * 0.7071;
  }
}

/** A brass-like note (3 detuned saws, a filter that opens with the swell). */
function brass(s: Sig, t0: number, f: number, dur: number, amp: number, p = 0, bright = 1) {
  const sr = s.sr;
  const i0 = Math.floor(t0 * sr);
  const n = Math.min(s.n - i0, Math.floor((dur + 0.25) * sr));
  const o = [new Osc(sr, 0.1), new Osc(sr, 0.5), new Osc(sr, 0.8)];
  const det = [1, 1.0045, 0.9962];
  const flt = new SVF(sr, 800, 0.9);
  pan(p, P);
  const gl = P[0];
  const gr = P[1];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = t < 0.03 ? t / 0.03 : t < dur ? 1 - 0.25 * Math.min(1, (t - 0.03) / 0.3) : 0.75 * Math.exp(-(t - dur) / 0.07);
    // a little scoop up into the note, and vibrato on long ones
    const fi = f * (1 - 0.012 * Math.exp(-t / 0.025)) * (1 + (t > 0.25 ? 0.004 * Math.sin(TAU * 5.5 * t) : 0));
    if ((i & 7) === 0) flt.set(Math.min(9000, f * 1.5 + (900 + 3200 * bright) * Math.min(1, env * 1.2)), 0.9);
    let x = 0;
    for (let k = 0; k < 3; k++) x += o[k].saw(fi * det[k]);
    x = flt.tick(x * 0.33) * amp * env;
    s.L[i0 + i] += x * gl;
    s.R[i0 + i] += x * gr;
  }
}

/** Crowd voices into s: n voices, a vowel's formants per group, a pitch contour, an envelope. */
function crowd(s: Sig, r: Rand, o: { n: number; f0: [number, number]; vowels: [number, number][]; t0: number; spread: number; att: number; hold: number; rel: number; glide: (t: number) => number; amp: number }) {
  const sr = s.sr;
  const groups = o.vowels.length;
  const vs: { osc: Osc; f: number; at: number; g: number; pl: number; pr: number; vib: number; vr: number; grp: number; fc: number; e: number }[] = [];
  for (let k = 0; k < o.n; k++) {
    pan(r() * 1.8 - 0.9, P);
    vs.push({ osc: new Osc(sr, r()), f: o.f0[0] + r() * (o.f0[1] - o.f0[0]), at: o.t0 + r() * o.spread, g: 0.5 + r() * 0.5, pl: P[0], pr: P[1], vib: 3.5 + r() * 3, vr: r() * TAU, grp: k % groups, fc: 0, e: 0 });
  }
  const fl = o.vowels.map(([f1, f2]) => [new SVF(sr, f1, 5), new SVF(sr, f2, 7), new SVF(sr, f1, 5), new SVF(sr, f2, 7)]);
  const sumL = new Float32Array(groups);
  const sumR = new Float32Array(groups);
  for (let i = 0; i < s.n; i++) {
    const t = i / sr;
    sumL.fill(0);
    sumR.fill(0);
    const upd = (i & 15) === 0;
    for (const v of vs) {
      const lt = t - v.at;
      if (lt < 0) continue;
      // (pitch and level move slowly: worked out every 16 samples)
      if (upd || v.fc === 0) {
        v.e = (lt < o.att ? lt / o.att : lt < o.att + o.hold ? 1 : Math.exp(-(lt - o.att - o.hold) / o.rel)) * v.g;
        v.fc = v.f * o.glide(lt) * (1 + 0.012 * Math.sin(TAU * v.vib * t + v.vr));
      }
      if (v.e < 0.001 && lt > o.att) continue;
      const x = v.osc.saw(v.fc) * v.e;
      sumL[v.grp] += x * v.pl;
      sumR[v.grp] += x * v.pr;
    }
    let L = 0;
    let R = 0;
    for (let g = 0; g < groups; g++) {
      const [a, b, c, d] = fl[g];
      a.tick(sumL[g]);
      b.tick(sumL[g]);
      c.tick(sumR[g]);
      d.tick(sumR[g]);
      L += a.bpn() + b.bpn() * 0.6;
      R += c.bpn() + d.bpn() * 0.6;
    }
    s.L[i] += L * o.amp;
    s.R[i] += R * o.amp;
  }
}

const R: Record<SfxName, Recipe> = {
  tick: {
    len: 0.09,
    vars: 2,
    gain: 0.64,
    send: 0.06,
    vary: 0.01,
    make(s, r, v) {
      const hi = v === 0;
      burst(s, r, 0, hi ? 3300 : 2300, 9, 1, 0.006, 0);
      bell(s, 0, hi ? 5200 : 3650, 0.35, 0.012, 0, [1, 1.53], [1, 0.4]);
      thump(s, 0, 1300, 900, 0.004, 0.25, 0.006);
    },
  },
  blip: {
    len: 0.2,
    vars: 3,
    gain: 0.36,
    send: 0.1,
    vary: 0.003,
    poly: 4,
    make(s, r, v) {
      const sr = s.sr;
      const c = new Osc(sr);
      const m = new Osc(sr);
      const h = new Osc(sr);
      const f = 784;
      const tilt = 0.9 + v * 0.1;
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        // a little "plip": the pitch settles from a fifth above in a few ms
        const fi = f * (1 + 0.5 * Math.exp(-t / 0.004));
        let x = c.pm(fi, m.sine(fi * 2) * 1.3 * Math.exp(-t / 0.025)) * ad(t, 0.0015, 0.05);
        x += h.sine(fi * 3) * 0.18 * tilt * ad(t, 0.001, 0.014);
        s.add(i, x * 0.9);
      }
      burst(s, r, 0, 7000, 1, 0.12, 0.0015, 0, 0.0003, true);
    },
  },
  count: {
    len: 0.6,
    vars: 2,
    gain: 0.42,
    send: 0.2,
    vary: 0.002,
    make(s, r) {
      fm(s, 0, 880, 0.75, 0.13, 3.01, 1.6, 0.05, -0.05);
      fm(s, 0, 440, 0.45, 0.16, 1, 0.8, 0.03, 0.05);
      bell(s, 0, 1760, 0.15, 0.06);
      burst(s, r, 0, 5000, 1.5, 0.15, 0.003);
    },
  },
  go: {
    len: 1.0,
    sr: 32000,
    vars: 2,
    gain: 0.66,
    send: 0.22,
    vary: 0.002,
    make(s, r) {
      thump(s, 0, 160, 48, 0.035, 0.9, 0.12, 1.6);
      const ch = [1046.5, 1318.5, 1568, 2093];
      ch.forEach((f, k) => brass(s, 0.0, f / 2, 0.22, 0.32, (k - 1.5) * 0.4, 1.3));
      ch.forEach((f, k) => fm(s, 0.005, f, 0.22, 0.3, 3.5, 1.2, 0.05, (k - 1.5) * 0.5));
      // a bright air rush up into it, and sparkle
      const sr = s.sr;
      const fl = new SVF(sr, 3000, 0.8);
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        if ((i & 15) === 0) fl.set(2500 + 6000 * Math.exp(-t / 0.25), 0.8);
        fl.tick(r() * 2 - 1);
        s.add(i, fl.hp * 0.25 * ad(t, 0.004, 0.18));
      }
    },
  },
  coin: {
    len: 0.6,
    vars: 4,
    gain: 0.25,
    send: 0.16,
    vary: 0.004,
    poly: 5,
    make(s, r) {
      const sr = s.sr;
      // two notes, a fourth apart: a chip pulse under a bright bell
      const notes: [number, number, number][] = [
        [0, 1318.5, 0.07],
        [0.068, 1760, 0.42],
      ];
      for (const [t0, f, d] of notes) {
        const o = new Osc(sr);
        const fl = new SVF(sr, 7000, 0.7);
        const i0 = Math.floor(t0 * sr);
        for (let i = 0; i + i0 < s.n; i++) {
          const t = i / sr;
          const e = t < d ? 1 - (0.3 * t) / d : 0.7 * Math.exp(-(t - d) / 0.045);
          if (e < 0.0005) break;
          s.add(i0 + i, fl.tick(o.pulse(f, 0.5)) * 0.2 * e * Math.min(1, t / 0.002));
        }
        fm(s, t0, f, 0.55, d > 0.1 ? 0.16 : 0.05, 3.5, 2, 0.02, 0.1);
        bell(s, t0, f * 2, 0.12, d > 0.1 ? 0.09 : 0.03, -0.1);
      }
      // the sparkle: tiny pings scattered over the tail
      for (let k = 0; k < 7; k++) bell(s, 0.08 + r() * 0.35, 4200 + r() * 4200, 0.05 + r() * 0.05, 0.03 + r() * 0.04, r() * 1.6 - 0.8, [1], [1]);
      burst(s, r, 0.07, 9000, 0.9, 0.06, 0.12, 0, 0.01);
    },
  },
  lose: {
    len: 0.7,
    vars: 2,
    gain: 0.27,
    send: 0.12,
    vary: 0.01,
    make(s) {
      const sr = s.sr;
      const o1 = new Osc(sr);
      const o2 = new Osc(sr, 0.3);
      const fl = new SVF(sr, 2000, 2.5);
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        const f = 330 * Math.pow(0.5, Math.min(1, t / 0.45)) * (1 + 0.02 * Math.sin(TAU * 8 * t));
        if ((i & 7) === 0) fl.set(300 + 2600 * Math.exp(-t / 0.18), 2.5);
        const x = fl.tick(o1.saw(f) + o2.pulse(f * 1.006, 0.35) * 0.6);
        s.add(i, soft(x * 1.4) * ad(t, 0.012, 0.22));
      }
    },
  },
  hit: {
    len: 0.4,
    vars: 4,
    gain: 1,
    send: 0.12,
    vary: 0.05,
    poly: 4,
    make(s, r) {
      const k = 0.92 + r() * 0.16;
      thump(s, 0, 210 * k, 58 * k, 0.025, 0.8, 0.075, 2.2);
      thump(s, 0, 420 * k, 150 * k, 0.015, 0.3, 0.03, 1.5);
      burst(s, r, 0, 1100 + r() * 800, 1.1, 1.7, 0.03, r() * 0.4 - 0.2);
      burst(s, r, 0, 4500, 0.8, 0.5, 0.004, 0, 0.0002, true);
      // grit: a short clipped buzz
      const sr = s.sr;
      const o = new Osc(sr);
      for (let i = 0; i < Math.floor(0.05 * sr); i++) {
        const t = i / sr;
        s.add(i, soft(o.saw(170 * k) * 3) * 0.18 * ad(t, 0.001, 0.012));
      }
    },
  },
  thud: {
    len: 0.7,
    vars: 4,
    gain: 0.6,
    send: 0.14,
    vary: 0.05,
    poly: 4,
    make(s, r) {
      const k = 0.9 + r() * 0.2;
      thump(s, 0, 120 * k, 40 * k, 0.04, 0.9, 0.14, 1.8);
      thump(s, 0, 260 * k, 110 * k, 0.03, 0.3, 0.05, 1.5);
      burst(s, r, 0, 650 * k, 1.2, 1, 0.035);
      const sr = s.sr;
      const n = new Noise(r);
      const fl = new SVF(sr, 280, 0.8);
      for (let i = 0; i < Math.floor(0.4 * sr); i++) {
        const t = i / sr;
        s.add(i, fl.tick(n.white()) * 0.9 * ad(t, 0.002, 0.07));
      }
      // debris settling
      for (let j = 0; j < 7; j++) burst(s, r, 0.03 + r() * 0.25, 1800 + r() * 2600, 4, 0.12 * (1 - j / 8), 0.006, r() * 1.4 - 0.7);
    },
  },
  whoosh: {
    len: 0.55,
    vars: 4,
    gain: 0.39,
    send: 0.2,
    vary: 0.06,
    poly: 3,
    make(s, r, v) {
      const sr = s.sr;
      const n = new Noise(r);
      const bp = new SVF(sr, 500, 1.3);
      const body = new SVF(sr, 450, 0.7);
      const dir = v % 2 ? 1 : -1;
      const peak = 0.16 + r() * 0.08;
      const top = 2000 + r() * 1400;
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        const e = t < peak ? Math.pow(t / peak, 1.6) : Math.exp(-(t - peak) / 0.09);
        if ((i & 15) === 0) bp.set(t < peak ? 350 + (top - 350) * (t / peak) : 800 + (top - 800) * Math.exp(-(t - peak) / 0.12), 1.3);
        const w = n.white();
        bp.tick(w + n.pink() * 0.5);
        body.tick(w);
        const x = (bp.bpn() * 0.85 + body.lp * 0.5) * e;
        pan(dir * (t / s.n) * sr * 1.4 - dir * 0.7, P);
        s.L[i] += x * P[0];
        s.R[i] += x * P[1];
      }
    },
  },
  step: {
    len: 0.16,
    vars: 3,
    gain: 0.3,
    send: 0.1,
    vary: 0.004,
    poly: 3,
    make(s, r) {
      // a soft wooden boop: a marimba bar and the tap of a foot
      fm(s, 0, 392, 0.8, 0.055, 3.9, 0.9, 0.012, 0, 0.0015);
      bell(s, 0, 392 * 4, 0.12, 0.012);
      burst(s, r, 0, 2400, 2, 0.15, 0.004);
    },
  },
  roll: {
    len: 0.08,
    vars: 6,
    gain: 0.62,
    send: 0.08,
    vary: 0.08,
    poly: 3,
    make(s, r) {
      // a die's clack on the board: two resonant modes and a knock
      burst(s, r, 0, 2300 + r() * 1300, 7, 0.9, 0.009, r() * 0.6 - 0.3);
      burst(s, r, 0.0015, 4200 + r() * 1800, 9, 0.5, 0.006, r() * 0.6 - 0.3);
      thump(s, 0, 700, 500, 0.01, 0.25, 0.008);
    },
  },
  fanfare: {
    len: 2.1,
    sr: 32000,
    vars: 1,
    gain: 0.5,
    send: 0.28,
    duck: [0.55, 1.4, 0.8],
    make(s, r) {
      // a party-game victory: a quick pick-up, a held fifth, a turn, the big home chord
      const line: [number, number, number][] = [
        [0, 392, 0.08],
        [0.1, 523.3, 0.08],
        [0.2, 659.3, 0.08],
        [0.3, 784, 0.24],
        [0.58, 659.3, 0.09],
        [0.7, 784, 0.1],
        [0.84, 1046.5, 0.95],
      ];
      for (const [t, f, d] of line) {
        brass(s, t, f, d, 0.5, 0.05, 1.2);
        brass(s, t, f / 2, d, 0.3, -0.2, 0.8);
      }
      // the section's chords under the end
      for (const [f, p] of [
        [261.6, -0.5],
        [329.6, 0.4],
        [392, -0.2],
        [523.3, 0.3],
      ] as const)
        brass(s, 0.84, f, 0.95, 0.24, p, 0.9);
      // timpani on the beats, a snare roll swelling into the crash
      for (const t of [0, 0.3, 0.84]) thump(s, t, 110, 65, 0.06, t === 0.84 ? 0.9 : 0.6, 0.25, 1.4);
      for (let k = 0; k < 14; k++) burst(s, r, 0.3 + k * 0.038, 2400 + r() * 600, 0.9, 0.12 + 0.3 * (k / 14), 0.02, r() * 0.4 - 0.2);
      // the crash: bright metal, long
      const sr = s.sr;
      const i0 = Math.floor(0.84 * sr);
      const hp = new SVF(sr, 5200, 0.6);
      const mo = [new Osc(sr), new Osc(sr), new Osc(sr), new Osc(sr)];
      for (let i = i0; i < s.n; i++) {
        const t = (i - i0) / sr;
        let m = 0;
        for (let k = 0; k < 4; k++) m += mo[k].pulse([587, 845, 1129, 1523][k]);
        hp.tick(r() * 2 - 1 + m * 0.15);
        s.L[i] += hp.hp * 0.3 * ad(t, 0.002, 0.55);
        s.R[i] += hp.hp * 0.28 * ad(t, 0.002, 0.6);
      }
      // sparkle on top
      [2093, 2637, 3136, 4186].forEach((f, k) => bell(s, 0.86 + k * 0.05, f, 0.12, 0.35, k % 2 ? 0.6 : -0.6));
    },
  },
  sad: {
    len: 1.7,
    sr: 32000,
    vars: 1,
    gain: 0.2,
    send: 0.2,
    duck: [0.5, 1.1, 0.7],
    make(s) {
      // a muted trombone, wah… wah… wah… waaah (the plunger opens and closes on each)
      const sr = s.sr;
      const notes: [number, number, number][] = [
        [0, 392, 0.22],
        [0.27, 370, 0.22],
        [0.54, 349.2, 0.22],
        [0.81, 329.6, 0.75],
      ];
      for (const [t0, f, d] of notes) {
        const i0 = Math.floor(t0 * sr);
        const o1 = new Osc(sr);
        const o2 = new Osc(sr, 0.4);
        const wah = new SVF(sr, 600, 4);
        for (let i = 0; i + i0 < s.n && i < (d + 0.15) * sr; i++) {
          const t = i / sr;
          const last = d > 0.5;
          const fi = f * (1 + (last && t > 0.2 ? 0.018 * Math.sin(TAU * 6 * (t - 0.2)) : 0)) * (1 - 0.03 * Math.exp(-t / 0.03));
          const open = last ? bump(Math.min(t, 0.3), 0, 0.6) * 0.6 + 0.4 * Math.sin(Math.min(1, t / d) * Math.PI) : Math.sin(Math.min(1, t / d) * Math.PI);
          if ((i & 7) === 0) wah.set(450 + 1500 * open, 3.5);
          const env = t < d ? Math.min(1, t / 0.03) : Math.exp(-(t - d) / 0.05);
          const x = wah.tick(o1.saw(fi) + o2.saw(fi * 1.004));
          s.add(i0 + i, soft(x * 1.6) * 0.5 * env);
        }
      }
    },
  },
  star: {
    len: 1.2,
    sr: 32000,
    vars: 2,
    gain: 0.36,
    send: 0.3,
    duck: [0.3, 0.5, 0.6],
    make(s, r, v) {
      // a celesta run up a major chord, a warm swell under, a shimmer
      const run = v ? [784, 987.8, 1174.7, 1568, 1975.5, 2349.3] : [880, 1108.7, 1318.5, 1760, 2217.5, 2637];
      run.forEach((f, k) => fm(s, k * 0.045, f, 0.32, 0.18 + k * 0.03, 4, 0.6, 0.03, (k / 5) * 1.2 - 0.6));
      const root = run[0] / 2;
      const sr = s.sr;
      const os = [new Osc(sr), new Osc(sr), new Osc(sr)];
      const hp = new SVF(sr, 7000, 0.7);
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        const sw = bump(t, 0, 1.1);
        const x = (os[0].sine(root) + os[1].sine(root * 1.26) * 0.7 + os[2].tri(root * 1.5) * 0.5) * 0.12 * sw;
        hp.tick(r() * 2 - 1);
        const sh = hp.hp * 0.06 * sw * (0.6 + 0.4 * Math.sin(TAU * 13 * t));
        s.L[i] += x + sh;
        s.R[i] += x - sh * 0.8;
      }
    },
  },
  chips: {
    len: 0.22,
    vars: 4,
    gain: 0.43,
    send: 0.08,
    vary: 0.04,
    make(s, r) {
      let t = 0;
      for (let k = 0; k < 3; k++) {
        const f = 3000 + r() * 800;
        bell(s, t, f, 0.5 - k * 0.1, 0.012, r() * 0.8 - 0.4, [1, 1.47, 2.09], [1, 0.6, 0.3]);
        burst(s, r, t, 5200, 2, 0.35, 0.004, 0);
        t += 0.035 + r() * 0.025;
      }
    },
  },
  cheer: {
    len: 2.8,
    sr: 16000,
    vars: 2,
    gain: 0.5,
    send: 0.3,
    duck: [0.25, 1.2, 1],
    make(s, r) {
      crowd(s, r, {
        n: 20,
        f0: [170, 420],
        vowels: [
          [760, 1250],
          [600, 1750],
          [820, 1450],
        ],
        t0: 0,
        spread: 0.3,
        att: 0.09,
        hold: 0.7,
        rel: 0.55,
        glide: (t) => 1 + 0.18 * Math.min(1, t / 0.25) - 0.1 * Math.max(0, t - 0.6),
        amp: 0.5,
      });
      // claps and two whistles
      for (let k = 0; k < 110; k++) {
        const t = 0.15 + r() * 2.3;
        burst(s, r, t, 1100 + r() * 1400, 1.4, 0.1 * (1 - (t - 0.15) / 2.6), 0.012, r() * 1.8 - 0.9);
      }
      const sr = s.sr;
      for (let w = 0; w < 2; w++) {
        const t0 = 0.2 + r() * 0.6;
        const f0 = 2100 + r() * 700;
        const o = new Osc(sr);
        const i0 = Math.floor(t0 * sr);
        pan(r() * 1.6 - 0.8, P);
        for (let i = 0; i < 0.7 * sr && i0 + i < s.n; i++) {
          const t = i / sr;
          const f = f0 * (1 + 0.25 * Math.sin(Math.min(1, t / 0.6) * Math.PI));
          const x = o.sine(f) * 0.07 * bump(t, 0, 0.7);
          s.L[i0 + i] += x * P[0];
          s.R[i0 + i] += x * P[1];
        }
      }
    },
  },
  aww: {
    len: 2.3,
    sr: 16000,
    vars: 2,
    gain: 0.48,
    send: 0.3,
    duck: [0.25, 1, 0.9],
    make(s, r) {
      crowd(s, r, {
        n: 18,
        f0: [210, 400],
        vowels: [
          [640, 980],
          [560, 900],
        ],
        t0: 0,
        spread: 0.22,
        att: 0.18,
        hold: 0.55,
        rel: 0.45,
        glide: (t) => 1.12 - 0.42 * Math.min(1, t / 1.2),
        amp: 0.55,
      });
    },
  },
  splash: {
    len: 1.2,
    sr: 32000,
    vars: 3,
    gain: 0.8,
    send: 0.18,
    vary: 0.06,
    make(s, r) {
      const sr = s.sr;
      const n = new Noise(r);
      const lp = new SVF(sr, 8000, 0.7);
      const wash = new SVF(sr, 1500, 0.8);
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        if ((i & 15) === 0) lp.set(1200 + 7000 * Math.exp(-t / 0.06), 0.7);
        const w = n.white();
        lp.tick(w);
        wash.tick(w);
        s.add(i, lp.lp * 0.9 * ad(t, 0.003, 0.08) + wash.bpn() * 0.2 * ad(t, 0.05, 0.3));
      }
      thump(s, 0, 200, 60, 0.03, 0.5, 0.07);
      // bubbles rising, droplets falling back
      for (let k = 0; k < 12; k++) {
        const t0 = 0.04 + r() * 0.5;
        const f0 = 350 + r() * 900;
        const o = new Osc(sr);
        const i0 = Math.floor(t0 * sr);
        pan(r() * 1.4 - 0.7, P);
        for (let i = 0; i < 0.06 * sr && i0 + i < s.n; i++) {
          const t = i / sr;
          const x = o.sine(f0 * (1 + 0.9 * (t / 0.06))) * 0.16 * ad(t, 0.002, 0.018);
          s.L[i0 + i] += x * P[0];
          s.R[i0 + i] += x * P[1];
        }
      }
      for (let k = 0; k < 9; k++) bell(s, 0.15 + r() * 0.8, 1400 + r() * 1800, 0.08, 0.02, r() * 1.6 - 0.8, [1], [1]);
    },
  },
  crack: {
    len: 1.2,
    sr: 32000,
    vars: 3,
    gain: 0.72,
    send: 0.3,
    vary: 0.04,
    make(s, r) {
      const sr = s.sr;
      burst(s, r, 0, 5000, 0.7, 1, 0.003, 0, 0.0002, true);
      // the ice's "pew": a dispersive chirp falling fast, then two smaller ones
      for (const [t0, a, f0] of [
        [0, 0.6, 4200],
        [0.05 + r() * 0.04, 0.35, 3400],
        [0.13 + r() * 0.08, 0.22, 2800],
      ] as const) {
        const o = new Osc(sr);
        const i0 = Math.floor(t0 * sr);
        for (let i = 0; i < 0.35 * sr && i0 + i < s.n; i++) {
          const t = i / sr;
          s.add(i0 + i, o.sine(500 + (f0 - 500) * Math.exp(-t / 0.05)) * a * ad(t, 0.0005, 0.07));
        }
      }
      // crackles, thinning out, and the sheet's low groan
      for (let k = 0; k < 22; k++) {
        const t = r() * r() * 0.8;
        burst(s, r, t, 2500 + r() * 4000, 3, 0.4 * (1 - t), 0.002, r() * 1.6 - 0.8);
      }
      thump(s, 0.02, 95, 60, 0.1, 0.3, 0.12);
    },
  },
  gust: {
    len: 2.4,
    sr: 32000,
    vars: 3,
    gain: 0.33,
    send: 0.12,
    vary: 0.08,
    make(s, r, v) {
      const sr = s.sr;
      const n = new Noise(r);
      const bp = new SVF(sr, 400, 2.2);
      const wh = new SVF(sr, 1200, 9);
      const body = new SVF(sr, 500, 0.6);
      const pk = 0.7 + r() * 0.4;
      const dir = v % 2 ? 1 : -1;
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        const e = t < pk ? Math.pow(t / pk, 1.5) : Math.exp(-(t - pk) / 0.45);
        if ((i & 15) === 0) {
          bp.set(300 + 700 * e + 80 * Math.sin(TAU * 1.3 * t), 2.2);
          wh.set(1000 + 700 * e, 9);
        }
        const p = n.pink();
        bp.tick(p);
        wh.tick(p);
        body.tick(n.white());
        const x = (bp.bpn() * 0.8 + wh.bpn() * 0.25 + body.lp * 0.6) * e;
        pan(dir * (t / 2.4 - 0.5) * 1.2, P);
        s.L[i] += x * P[0];
        s.R[i] += x * P[1];
      }
    },
  },
  thunder: {
    len: 4.6,
    sr: 24000,
    vars: 3,
    gain: 0.6,
    send: 0.3,
    duck: [0.2, 1.5, 1.5],
    make(s, r) {
      const sr = s.sr;
      const n = new Noise(r);
      const lo = new SVF(sr, 160, 0.7);
      const mid = new SVF(sr, 700, 0.6);
      const crack = new SVF(sr, 2500, 0.7);
      const rolls: [number, number, number][] = [];
      for (let k = 0; k < 6; k++) rolls.push([0.05 + r() * 2.6, 0.5 + r() * 1.3, 0.4 + r() * 0.6]);
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        let e = 0;
        for (const [a, d, g] of rolls) e += bump(t, a, a + d) * g;
        const b = n.brown();
        const w = n.white();
        lo.tick(b);
        mid.tick(w);
        crack.tick(w);
        const x = lo.lp * 1.6 * (e + 0.6 * ad(t, 0.02, 1.4)) + mid.lp * 0.35 * e * Math.exp(-t / 1.6) + crack.hp * 0.6 * ad(t, 0.0005, 0.03);
        s.L[i] += x;
        s.R[i] += x * 0.92 + mid.lp * 0.05 * e;
      }
    },
  },
  chime: {
    len: 2.4,
    sr: 32000,
    vars: 1,
    gain: 0.3,
    send: 0.35,
    duck: [0.35, 1.2, 0.8],
    make(s) {
      // the metro's three-tone chime (vibraphone bars, a slow tremolo)
      const sr = s.sr;
      [
        [0, 784],
        [0.34, 659.3],
        [0.68, 523.3],
      ].forEach(([t0, f], k) => {
        const i0 = Math.floor(t0 * sr);
        const c = new Osc(sr);
        const m = new Osc(sr);
        const o4 = new Osc(sr);
        pan((k - 1) * 0.25, P);
        for (let i = 0; i0 + i < s.n; i++) {
          const t = i / sr;
          const trem = 1 - 0.18 * (0.5 + 0.5 * Math.sin(TAU * 5.2 * t));
          const x = (c.pm(f, m.sine(f) * 0.6 * Math.exp(-t / 0.08)) * ad(t, 0.002, 0.7) + o4.sine(f * 4) * 0.2 * ad(t, 0.001, 0.08)) * trem * 0.5;
          s.L[i0 + i] += x * P[0];
          s.R[i0 + i] += x * P[1];
        }
      });
    },
  },
  register: {
    len: 1.4,
    sr: 32000,
    vars: 2,
    gain: 0.36,
    send: 0.2,
    make(s, r) {
      // ka-: the drawer's clunk and rattle; -ching: the bell and the coins
      thump(s, 0, 160, 90, 0.02, 0.5, 0.04, 1.5);
      burst(s, r, 0, 1500, 1.2, 0.6, 0.035);
      for (let k = 0; k < 5; k++) burst(s, r, 0.01 + r() * 0.09, 2800 + r() * 2500, 6, 0.25, 0.006, r() * 0.8 - 0.4);
      bell(s, 0.12, 2093, 0.45, 0.5, 0.2, [1, 1.262, 1.68, 2.76], [1, 0.7, 0.4, 0.2]);
      bell(s, 0.12, 2093 * 1.004, 0.3, 0.45, -0.2, [1, 1.5], [1, 0.4]);
      for (let k = 0; k < 8; k++) bell(s, 0.15 + r() * 0.35, 4000 + r() * 3000, 0.07, 0.025, r() * 1.4 - 0.7, [1, 1.41], [1, 0.5]);
    },
  },
  dice: {
    len: 0.9,
    vars: 3,
    gain: 0.72,
    send: 0.12,
    vary: 0.05,
    make(s, r) {
      // the throw: a soft landing, then the die tumbling to rest
      thump(s, 0, 300, 160, 0.01, 0.3, 0.02);
      let t = 0;
      let gap = 0.05;
      for (let k = 0; k < 11 && t < 0.8; k++) {
        const a = 0.7 * Math.pow(0.86, k);
        burst(s, r, t, 2200 + r() * 1500, 7, a, 0.008, r() * 0.8 - 0.4);
        burst(s, r, t + 0.001, 4300 + r() * 1500, 9, a * 0.5, 0.005, 0);
        t += gap * (0.7 + r() * 0.6);
        gap *= 1.12;
      }
    },
  },
};

// ---- the bank and the player ---------------------------------------------------------------------

const banks = new WeakMap<BaseAudioContext, Map<SfxName, (AudioBuffer | undefined)[]>>();
function bankOf(ac: BaseAudioContext) {
  let b = banks.get(ac);
  if (!b) banks.set(ac, (b = new Map()));
  return b;
}

/** A recipe's variant as a buffer (rendered on first use). */
export function sfxBuffer(ac: BaseAudioContext, name: SfxName, v = 0): AudioBuffer {
  const b = bankOf(ac);
  const rc = R[name];
  let vs = b.get(name);
  if (!vs) b.set(name, (vs = new Array(rc.vars ?? 3)));
  const k = v % vs.length;
  const hit = vs[k];
  if (hit) return hit;
  const s = new Sig(rc.sr || ac.sampleRate, rc.len);
  rc.make(s, rand(0x51f3 + k * 7919 + name.length * 131), k);
  s.norm(0.9).edges(0.0005, 0.02);
  return (vs[k] = s.buffer(ac));
}

export interface PlayOpts {
  /** Pitch / speed factor (1 its own). */
  rate?: number;
  /** Level factor. */
  gain?: number;
  /** -1..1 (default: a little random spread). */
  pan?: number;
  /** Seconds from now. */
  delay?: number;
  /** Room send factor (1 the recipe's). */
  send?: number;
}

/** What rings now: per name, and in all (the voice limits). */
const ringing = new Map<string, number>();
let total = 0;
const lastVar = new Map<string, number>();
const MAX = 28;

/** Plays an effect on a mixer (the live one by default). */
export function playSfx(name: SfxName, o: PlayOpts = {}, m: Mixer | null = party()) {
  const rc = R[name];
  if (!m || !rc) return;
  const n = ringing.get(name) ?? 0;
  if (total >= MAX || n >= (rc.poly ?? 2)) return;
  const ac = m.ac;
  const vars = rc.vars ?? 3;
  // a variant, never the same twice in a row
  let v = Math.floor(Math.random() * vars);
  if (vars > 1 && v === lastVar.get(name)) v = (v + 1) % vars;
  lastVar.set(name, v);
  const buf = sfxBuffer(ac, name, v);
  const t = ac.currentTime + (o.delay ?? 0) + 0.005;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const vary = rc.vary ?? 0.02;
  src.playbackRate.value = Math.max(0.25, Math.min(4, (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * vary)));
  const g = ac.createGain();
  g.gain.value = rc.gain * (o.gain ?? 1) * (0.9 + Math.random() * 0.15);
  const p = ac.createStereoPanner();
  p.pan.value = o.pan ?? (Math.random() * 2 - 1) * 0.12;
  src.connect(g).connect(p).connect(m.sfx);
  const send = (rc.send ?? 0.12) * (o.send ?? 1);
  let sg: GainNode | null = null;
  if (send > 0.001) {
    sg = ac.createGain();
    sg.gain.value = send;
    p.connect(sg).connect(m.roomSend);
  }
  ringing.set(name, n + 1);
  total++;
  src.onended = () => {
    ringing.set(name, (ringing.get(name) ?? 1) - 1);
    total--;
    src.disconnect();
    g.disconnect();
    p.disconnect();
    sg?.disconnect();
  };
  src.start(t);
  if (rc.duck) m.duck(rc.duck[0], rc.duck[1], rc.duck[2], t);
}

/** The bench: an effect into an offline context's mixer at `at` seconds. */
export function sfxBounce(ctx: BaseAudioContext, name: SfxName, at = 0.05, o: PlayOpts = {}) {
  playSfx(name, { ...o, delay: at }, mixerFor(ctx));
}

export const SFX_NAMES = Object.keys(R) as SfxName[];

// the hub's sounds first, then the rest, one variant per idle moment
const ORDER: SfxName[] = ["blip", "tick", "count", "go", "coin", "whoosh", "hit", "thud", "star", "step", "roll", "lose", "fanfare", "chips", "sad", "dice", "chime", "register", "splash", "crack", "gust", "cheer", "aww", "thunder"];
onMixer((m) => {
  const jobs: [SfxName, number][] = [];
  for (const k of ORDER) for (let v = 0; v < (R[k].vars ?? 3); v++) jobs.push([k, v]);
  const idle = (f: () => void) => ((window as unknown as { requestIdleCallback?: (f: () => void, o?: object) => void }).requestIdleCallback ? (window as unknown as { requestIdleCallback: (f: () => void, o?: object) => void }).requestIdleCallback(f, { timeout: 500 }) : setTimeout(f, 30));
  const next = () => {
    const j = jobs.shift();
    if (!j) return;
    sfxBuffer(m.ac, j[0], j[1]);
    idle(next);
  };
  idle(next);
});
