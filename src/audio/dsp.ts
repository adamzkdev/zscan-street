/**
 * A tiny offline DSP kit: ZK PARTY's sounds are synthesised once, in plain JS, into AudioBuffers
 * (drum kits, struck instruments, sound effects, ambience loops) and then only played back: a hit
 * costs one buffer source and a gain, however rich the sound. Everything here is allocation-free
 * per sample: oscillators with band-limited edges (polyBLEP), a state-variable filter that can be
 * swept per sample, one-pole filters, pink and brown noise, a seeded random.
 */

export const TAU = Math.PI * 2;
export type Rand = () => number;

/** A seeded random in [0, 1) (mulberry32). */
export function rand(seed: number): Rand {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const dbg = (db: number) => Math.pow(10, db / 20);
/** A soft clip (tanh-like, exact at 0 and ±3). */
export function soft(x: number) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

/** A stereo render: two channels of `n` frames at `sr`. */
export class Sig {
  readonly L: Float32Array<ArrayBuffer>;
  readonly R: Float32Array<ArrayBuffer>;
  readonly n: number;
  constructor(
    readonly sr: number,
    secs: number,
  ) {
    this.n = Math.max(1, Math.ceil(secs * sr));
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
  }
  /** Mono `x` at frame i, panned (gl, gr from pan()). */
  add(i: number, x: number, gl = 0.7071, gr = 0.7071) {
    this.L[i] += x * gl;
    this.R[i] += x * gr;
  }
  peak() {
    let p = 0;
    for (let i = 0; i < this.n; i++) {
      const a = Math.abs(this.L[i]);
      const b = Math.abs(this.R[i]);
      if (a > p) p = a;
      if (b > p) p = b;
    }
    return p;
  }
  /** Scales to a peak (linear). */
  norm(to = 0.89) {
    const p = this.peak();
    if (p < 1e-9) return this;
    const k = to / p;
    for (let i = 0; i < this.n; i++) {
      this.L[i] *= k;
      this.R[i] *= k;
    }
    return this;
  }
  /** Fades the first and last few ms (no clicks at the edges). */
  edges(a = 0.002, b = 0.01) {
    const na = Math.min(this.n, Math.floor(a * this.sr));
    const nb = Math.min(this.n, Math.floor(b * this.sr));
    for (let i = 0; i < na; i++) {
      const k = i / na;
      this.L[i] *= k;
      this.R[i] *= k;
    }
    for (let i = 0; i < nb; i++) {
      const k = i / nb;
      this.L[this.n - 1 - i] *= k;
      this.R[this.n - 1 - i] *= k;
    }
    return this;
  }
  /**
   * Makes it loop seamlessly: the last `x` seconds are cross-faded (equal power) into the first,
   * and dropped. Returns the loop (a new Sig).
   */
  loop(x: number) {
    const nx = Math.min(Math.floor(x * this.sr), Math.floor(this.n / 3));
    const m = this.n - nx;
    const out = new Sig(this.sr, m / this.sr);
    out.L.set(this.L.subarray(0, m));
    out.R.set(this.R.subarray(0, m));
    for (let i = 0; i < nx; i++) {
      const k = (i + 0.5) / nx;
      const a = Math.sin(k * Math.PI * 0.5);
      const b = Math.cos(k * Math.PI * 0.5);
      out.L[i] = this.L[i] * a + this.L[m + i] * b;
      out.R[i] = this.R[i] * a + this.R[m + i] * b;
    }
    return out;
  }
  buffer(ac: BaseAudioContext): AudioBuffer {
    const b = ac.createBuffer(2, this.n, this.sr);
    b.copyToChannel(this.L, 0);
    b.copyToChannel(this.R, 1);
    return b;
  }
}

/** Equal-power pan gains for p in -1..1, into `o` (no allocation). */
export function pan(p: number, o: [number, number] = [0, 0]) {
  const a = (Math.max(-1, Math.min(1, p)) + 1) * 0.25 * Math.PI;
  o[0] = Math.cos(a);
  o[1] = Math.sin(a);
  return o;
}

function blep(t: number, dt: number) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** An oscillator: call one waveform per sample with the frequency (Hz) now. */
export class Osc {
  p: number;
  constructor(
    readonly sr: number,
    phase = 0,
  ) {
    this.p = phase;
  }
  private step(f: number) {
    const dt = f / this.sr;
    this.p += dt;
    if (this.p >= 1) this.p -= Math.floor(this.p);
    return dt;
  }
  sine(f: number) {
    this.step(f);
    return Math.sin(TAU * this.p);
  }
  /** Phase-modulated sine (FM): `pm` in radians. */
  pm(f: number, pm: number) {
    this.step(f);
    return Math.sin(TAU * this.p + pm);
  }
  saw(f: number) {
    const dt = this.step(f);
    return 2 * this.p - 1 - blep(this.p, dt);
  }
  /** A pulse of width `w` (0.5 a square). */
  pulse(f: number, w = 0.5) {
    const dt = this.step(f);
    let v = this.p < w ? 1 : -1;
    v += blep(this.p, dt);
    let q = this.p + 1 - w;
    if (q >= 1) q -= 1;
    v -= blep(q, dt);
    return v;
  }
  tri(f: number) {
    this.step(f);
    return 1 - 4 * Math.abs(this.p - 0.5);
  }
}

/**
 * A state-variable filter (Simper's trapezoidal SVF): stable when swept every sample. `set()` the
 * cutoff and Q, `tick(x)`, then read `lp`, `bp`, `hp`.
 */
export class SVF {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private k = 1;
  lp = 0;
  bp = 0;
  hp = 0;
  constructor(
    readonly sr: number,
    fc = 1000,
    q = 0.707,
  ) {
    this.set(fc, q);
  }
  set(fc: number, q = 0.707) {
    const g = Math.tan((Math.PI * Math.max(10, Math.min(fc, this.sr * 0.45))) / this.sr);
    this.k = 1 / Math.max(0.05, q);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
    return this;
  }
  tick(v0: number) {
    const v3 = v0 - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = v0 - this.k * v1 - v2;
    return v2;
  }
  /** The band-pass, normalised to unity gain at the centre. */
  bpn() {
    return this.bp * this.k;
  }
}

/** A one-pole low-pass (call with the coefficient from `onePole(fc, sr)`). */
export class LP1 {
  y = 0;
  a: number;
  constructor(sr: number, fc: number) {
    this.a = onePole(fc, sr);
  }
  tick(x: number) {
    this.y += this.a * (x - this.y);
    return this.y;
  }
}
export const onePole = (fc: number, sr: number) => 1 - Math.exp((-TAU * fc) / sr);

/** Noise: white, pink (Kellet), brown; seeded. */
export class Noise {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private br = 0;
  constructor(readonly r: Rand) {}
  white() {
    return this.r() * 2 - 1;
  }
  pink() {
    const w = this.r() * 2 - 1;
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.22;
  }
  brown() {
    this.br = (this.br + 0.02 * (this.r() * 2 - 1)) / 1.02;
    return this.br * 3.5;
  }
}

/** Attack (linear) then an exponential fall with time constant `tau` (s), at time t (s). */
export const ad = (t: number, a: number, tau: number) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / tau));
/** A smooth bump from 0 at t=a to 1 and back to 0 at t=b (a Hann window). */
export const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : 0.5 - 0.5 * Math.cos((TAU * (t - a)) / (b - a)));

/**
 * Renders in slices, yielding to the page between them (a long ambience loop does not stall a
 * frame). `fill(i0, i1)` writes frames [i0, i1).
 */
export async function chunked(n: number, fill: (i0: number, i1: number) => void, budgetMs = 6) {
  let i = 0;
  while (i < n) {
    const t0 = performance.now();
    while (i < n && performance.now() - t0 < budgetMs) {
      const j = Math.min(n, i + 2048);
      fill(i, j);
      i = j;
    }
    if (i < n) await new Promise((r) => setTimeout(r, 0));
  }
}
