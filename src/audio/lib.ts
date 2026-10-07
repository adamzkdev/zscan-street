/**
 * The building blocks of every soundscape (the recorded beds are in ./samples.ts):
 * a `Scene` (a fader, a dry bus and a reverb send through a generated impulse response, its
 * looping beds, its random one-shot "jobs" and its music sequencers), and the little instruments
 * the scenes are made of: noise beds, drones, wind, water, crowds, footsteps, bells, clanks…
 *
 * CPU: noise comes from three shared looping buffers (started at random offsets so layers do not
 * phase), a scene has at most one convolver, and one-shots stop themselves.
 */

export interface Bufs {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}
export type NoiseKind = keyof Bufs;

export function makeBufs(ctx: BaseAudioContext): Bufs {
  const len = ctx.sampleRate * 4;
  const mk = (fill: (d: Float32Array) => void) => {
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) fill(b.getChannelData(c));
    return b;
  };
  return {
    white: mk((d) => {
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }),
    pink: mk((d) => {
      let b0 = 0,
        b1 = 0,
        b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
    }),
    brown: mk((d) => {
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    }),
  };
}

/** A room's reverb: tail length (s), decay curve, how dark it is (0 dark … 1 bright), early slap (s). */
export interface Room {
  len: number;
  decay: number;
  tone: number;
  wet: number;
  slap?: number;
}

const irCache = new Map<string, AudioBuffer>();
/** A generated impulse response: decaying noise, darkened with a one-pole filter, optional slapback echoes. */
export function impulse(ctx: BaseAudioContext, r: Room) {
  const key = `${r.len}|${r.decay}|${r.tone}|${r.slap ?? 0}`;
  const hit = irCache.get(key);
  if (hit) return hit;
  const n = Math.floor(ctx.sampleRate * r.len);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  const a = 0.15 + r.tone * 0.8;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let y = 0;
    for (let i = 0; i < n; i++) {
      y += a * (Math.random() * 2 - 1 - y);
      d[i] = y * Math.pow(1 - i / n, r.decay);
    }
    // slapback echoes off far walls (a stadium bowl, a canyon of stone)
    if (r.slap) {
      for (let k = 1; k <= 3; k++) {
        const at = Math.floor(ctx.sampleRate * r.slap * k * (c ? 1.07 : 1));
        if (at < n) d[at] += 0.6 / k;
      }
    }
  }
  irCache.set(key, buf);
  return buf;
}

interface Job {
  name: string;
  next: number;
  min: number;
  max: number;
  fn: (t: number) => void;
}

/**
 * One soundscape: everything it plays goes through `out` (the cross-fade), either straight (`dry`)
 * or through its reverb (`wet`). Built when you walk in, faded out and torn down when you leave.
 */
export class Scene {
  readonly out: GainNode;
  readonly dry: GainNode;
  readonly wet: GainNode;
  readonly layers: string[] = [];
  private srcs: AudioScheduledSourceNode[] = [];
  private jobs: Job[] = [];
  private seqs: ((until: number) => void)[] = [];
  private verb: ConvolverNode | null = null;
  /** Named nodes a scene wants to reach later (a crowd's level for a goal swell, …). */
  readonly knobs: Record<string, AudioParam> = {};
  dead = false;
  /** Event handlers: `sound.event(name)` reaches the scene that is playing. */
  readonly on: Record<string, (t: number, arg?: unknown) => void> = {};

  constructor(
    readonly ctx: AudioContext,
    readonly bufs: Bufs,
    dest: AudioNode,
    readonly id: string,
    room: Room | null,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.dry = ctx.createGain();
    this.dry.connect(this.out);
    this.wet = ctx.createGain();
    if (room) {
      this.verb = ctx.createConvolver();
      this.verb.buffer = impulse(ctx, room);
      const back = ctx.createGain();
      back.gain.value = room.wet;
      this.wet.connect(this.verb).connect(back).connect(this.out);
    }
  }

  get now() {
    return this.ctx.currentTime;
  }

  /** A sound's way out: straight, and `wet` of it into the room. */
  send(node: AudioNode, wet = 0, pan = 0) {
    let n = node;
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      n.connect(p);
      n = p;
    }
    n.connect(this.dry);
    if (wet > 0 && this.verb) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      n.connect(g).connect(this.wet);
    }
    return node;
  }

  private kids: Scene[] = [];
  /** A sub-mix with its own fader (a fountain you walk up to), closed with this scene. */
  child(id: string) {
    const k = new Scene(this.ctx, this.bufs, this.dry, id, null);
    k.out.gain.value = 1;
    this.kids.push(k);
    return k;
  }

  keep(src: AudioScheduledSourceNode) {
    this.srcs.push(src);
    return src;
  }

  private closers: (() => void)[] = [];
  /** Something to let go of once the scene has faded out (a recording's source). */
  onClose(fn: () => void) {
    this.closers.push(fn);
  }

  /** Something that happens every `min`…`max` seconds (a gull, a door slam, a "shh"). */
  every(name: string, min: number, max: number, fn: (t: number) => void, first?: number) {
    this.jobs.push({ name, min, max, fn, next: this.now + (first ?? min + Math.random() * (max - min)) });
  }

  /** A sequencer, asked a few times a second to schedule its notes up to `until`. */
  seq(fn: (until: number) => void) {
    this.seqs.push(fn);
  }

  tick() {
    if (this.dead) return;
    const t = this.now;
    for (const j of this.jobs) {
      if (t < j.next) continue;
      j.next = t + j.min + Math.random() * (j.max - j.min);
      try {
        j.fn(t + 0.05 + Math.random() * 0.1);
      } catch {
        /* a one-shot never breaks the scene */
      }
    }
    for (const s of this.seqs) s(t + 0.8);
    for (const k of this.kids) k.tick();
  }

  fade(to: number, s: number) {
    const g = this.out.gain;
    const t = this.now;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + s);
  }

  /** Fade out, then stop every bed and let go of the nodes. */
  close(s: number) {
    this.fade(0, s);
    for (const k of this.kids) k.close(s);
    this.jobs = [];
    this.seqs = [];
    this.dead = true;
    setTimeout(
      () => {
        for (const src of this.srcs) {
          try {
            src.stop();
          } catch {
            /* already stopped */
          }
        }
        this.srcs = [];
        for (const fn of this.closers) fn();
        this.closers = [];
        this.out.disconnect();
      },
      s * 1000 + 200,
    );
  }
}

// ───────────────────────── beds (looping) ─────────────────────────

export interface BedOpts {
  kind?: NoiseKind;
  type?: BiquadFilterType;
  f?: number;
  q?: number;
  gain: number;
  wet?: number;
  pan?: number;
  /** Loudness wobble: rate (Hz) and depth (fraction of gain). */
  am?: [number, number][];
  /** Filter-frequency wander: rate (Hz) and depth (Hz). */
  fm?: [number, number];
  /** A second filter in series (formants, a hi-cut). */
  f2?: { type: BiquadFilterType; f: number; q?: number };
}

/** A looping noise bed: noise → filter(s) → gain (wobbling) → the scene. Returns the gain. */
export function bed(s: Scene, name: string, o: BedOpts) {
  const ctx = s.ctx;
  const src = ctx.createBufferSource();
  src.buffer = s.bufs[o.kind ?? "pink"];
  src.loop = true;
  let n: AudioNode = src;
  if (o.type) {
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.value = o.f ?? 1000;
    f.Q.value = o.q ?? 0.7;
    if (o.fm) lfo(s, o.fm[0], o.fm[1], f.frequency);
    n = n.connect(f);
  }
  if (o.f2) {
    const f = ctx.createBiquadFilter();
    f.type = o.f2.type;
    f.frequency.value = o.f2.f;
    f.Q.value = o.f2.q ?? 0.7;
    n = n.connect(f);
  }
  const g = ctx.createGain();
  g.gain.value = o.gain;
  for (const [rate, depth] of o.am ?? []) lfo(s, rate, o.gain * depth, g.gain);
  n.connect(g);
  s.send(g, o.wet ?? 0, o.pan ?? 0);
  src.start(0, Math.random() * 3.5);
  s.keep(src);
  s.layers.push(name);
  return g;
}

/** A slow sine LFO onto a parameter. */
export function lfo(s: Scene, rate: number, depth: number, param: AudioParam) {
  const o = s.ctx.createOscillator();
  o.frequency.value = rate * (0.9 + Math.random() * 0.2);
  const d = s.ctx.createGain();
  d.gain.value = depth;
  o.connect(d).connect(param);
  o.start(s.now + Math.random() * 0.5);
  s.keep(o);
  return o;
}

/** A steady tone bed (mains hum, a drone): a few oscillators through one low-pass. */
export function drone(s: Scene, name: string, freqs: [number, number][], type: OscillatorType, lp: number, gain: number, wet = 0, am?: [number, number]) {
  const ctx = s.ctx;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.value = gain;
  if (am) lfo(s, am[0], gain * am[1], g.gain);
  for (const [freq, v] of freqs) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const og = ctx.createGain();
    og.gain.value = v;
    o.connect(og).connect(f);
    o.start();
    s.keep(o);
  }
  f.connect(g);
  s.send(g, wet);
  s.layers.push(name);
  return g;
}

/** Wind: band-passed pink noise wandering in pitch, with gusts; `howl` adds a whistling resonance. */
export function wind(s: Scene, level: number, howl = 0) {
  const g = bed(s, "wind", { kind: "pink", type: "bandpass", f: 520, q: 0.8, gain: level, fm: [0.09, 260], am: [[0.07, 0.45], [0.23, 0.2]] });
  bed(s, "wind-rumble", { kind: "brown", type: "lowpass", f: 160, gain: level * 0.8, am: [[0.05, 0.5]] });
  if (howl > 0) bed(s, "wind-howl", { kind: "white", type: "bandpass", f: 1150, q: 14, gain: level * howl, fm: [0.06, 380], am: [[0.11, 0.7]] });
  // gusts
  s.every("gust", 5, 11, (t) => {
    g.gain.setTargetAtTime(level * 2.1, t, 0.8);
    g.gain.setTargetAtTime(level, t + 2.2, 1.4);
  });
  return g;
}

/** A fountain or running water: hiss with a fast, irregular splash. */
export function fountain(s: Scene, level: number, wet = 0.2, pan = 0) {
  return [
    bed(s, "fountain", { kind: "white", type: "highpass", f: 1400, gain: level * 0.5, wet, pan, am: [[3.1, 0.25], [7.3, 0.18]], f2: { type: "lowpass", f: 7000 } }),
    bed(s, "fountain-body", { kind: "pink", type: "bandpass", f: 600, q: 0.6, gain: level * 0.7, wet, pan, am: [[1.7, 0.3], [0.4, 0.2]] }),
  ];
}

/** Water lapping on a quay or a pool's edge. */
export function lapping(s: Scene, level: number, wet = 0) {
  bed(s, "lapping", { kind: "brown", type: "lowpass", f: 520, gain: level, wet, am: [[0.31, 0.7], [0.53, 0.4]], fm: [0.21, 200] });
  s.every("slosh", 1.6, 4, (t) => burst(s, t, "pink", "bandpass", 700 + Math.random() * 500, 1.2, level * 0.5, 0.35, wet, Math.random() - 0.5));
}

/**
 * Voices: two formant bands of noise whose levels jump around like many conversations.
 * `level` 0..1, `bright` moves the formants up (an excited crowd).
 */
export function murmur(s: Scene, name: string, level: number, wet = 0.3, bright = 0) {
  const a = bed(s, name, { kind: "pink", type: "bandpass", f: 480 + bright * 300, q: 1.1, gain: level, wet, f2: { type: "lowpass", f: 2600 } });
  const b = bed(s, name + "-2", { kind: "white", type: "bandpass", f: 1300 + bright * 600, q: 1.6, gain: level * 0.35, wet });
  // conversations come and go
  s.every(name + "-ebb", 0.35, 0.9, (t) => {
    a.gain.setTargetAtTime(level * (0.55 + Math.random() * 0.7), t, 0.12);
    b.gain.setTargetAtTime(level * 0.35 * (0.4 + Math.random() * 0.9), t, 0.08);
  });
  return a;
}

// ───────────────────────── one-shots ─────────────────────────

/** An envelope: 0 → peak (attack) → hold → exponential release. */
export function envGain(s: Scene, t: number, peak: number, a: number, hold: number, r: number) {
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  return g;
}

/** A burst of filtered noise. */
export function burst(s: Scene, t: number, kind: NoiseKind, type: BiquadFilterType, f: number, q: number, vol: number, dur: number, wet = 0, pan = 0, attack = 0.005) {
  const ctx = s.ctx;
  const src = ctx.createBufferSource();
  src.buffer = s.bufs[kind];
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.frequency.value = f;
  flt.Q.value = q;
  const g = envGain(s, t, vol, attack, 0, dur);
  src.connect(flt).connect(g);
  s.send(g, wet, pan);
  src.start(t, Math.random() * 3);
  src.stop(t + attack + dur + 0.05);
  return flt;
}

/** A tone, optionally sliding to `to`. */
export function tone(s: Scene, t: number, f: number, type: OscillatorType, vol: number, dur: number, wet = 0, o: { a?: number; hold?: number; to?: number; pan?: number; lp?: number; detune?: number } = {}) {
  const ctx = s.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (o.detune) osc.detune.value = o.detune;
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.a ?? 0.005) + (o.hold ?? 0) + dur * 0.8);
  const g = envGain(s, t, vol, o.a ?? 0.005, o.hold ?? 0, dur);
  let n: AudioNode = osc;
  if (o.lp) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = o.lp;
    n = n.connect(lp);
  }
  n.connect(g);
  s.send(g, wet, o.pan ?? 0);
  osc.start(t);
  osc.stop(t + (o.a ?? 0.005) + (o.hold ?? 0) + dur + 0.05);
}

/** A struck bell: a few inharmonic partials. */
export function bell(s: Scene, t: number, f: number, len: number, vol: number, wet = 0.3, pan = 0) {
  for (const [m, v] of [
    [1, 1],
    [2.76, 0.3],
    [5.4, 0.12],
  ])
    tone(s, t, f * m, "sine", vol * v, len / m ** 0.3, wet, { pan });
}

/** Metal struck hard: inharmonic ringing plus a crash of noise (a sword, a cell door, a wok). */
export function clank(s: Scene, t: number, base: number, vol: number, len: number, wet = 0.4, pan = 0) {
  for (const m of [1, 1.47, 2.09, 2.56, 3.43]) tone(s, t, base * m * (0.98 + Math.random() * 0.04), "sine", (vol * 0.5) / m, len / m ** 0.5, wet, { pan });
  burst(s, t, "white", "highpass", 2500, 0.7, vol * 0.8, 0.08, wet, pan);
}

/** A footstep: `hard` floor (marble, a click), `steel` (a ring), `soft` (carpet, a thud), `stone`. */
export function step(s: Scene, t: number, surface: "hard" | "steel" | "soft" | "stone", vol: number, wet: number, pan: number) {
  if (surface === "soft") return burst(s, t, "pink", "lowpass", 380, 0.7, vol * 0.8, 0.07, wet, pan);
  burst(s, t, "white", "bandpass", surface === "hard" ? 2600 : surface === "stone" ? 1500 : 1100, 1.6, vol, surface === "steel" ? 0.05 : 0.035, wet, pan);
  burst(s, t + 0.005, "pink", "lowpass", 260, 0.7, vol * 0.6, 0.06, wet, pan);
  if (surface === "steel") tone(s, t, 520 + Math.random() * 80, "triangle", vol * 0.25, 0.2, wet, { pan });
}

/** Someone walks past: 5–12 steps, passing from one side to the other. */
export function walker(s: Scene, t: number, surface: "hard" | "steel" | "soft" | "stone", vol: number, wet: number) {
  const n = 5 + Math.floor(Math.random() * 8);
  const pace = 0.48 + Math.random() * 0.14;
  const p0 = Math.random() * 2 - 1;
  const p1 = -p0 * 0.6;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const loud = vol * (0.4 + Math.sin(k * Math.PI) * 0.6);
    step(s, t + i * pace + Math.random() * 0.02, surface, loud, wet, p0 + (p1 - p0) * k);
  }
}

/** A voice-like vowel: a buzzing tone through two formants ("SHIELD", "ED", "OOH"). */
export function vowel(s: Scene, t: number, f0: number, dur: number, vol: number, formants: [number, number], wet = 0.3, voices = 1, pan = 0) {
  const ctx = s.ctx;
  const g = envGain(s, t, vol, 0.04, dur * 0.6, dur * 0.4);
  const f1 = ctx.createBiquadFilter();
  f1.type = "bandpass";
  f1.frequency.value = formants[0];
  f1.Q.value = 4;
  const f2 = ctx.createBiquadFilter();
  f2.type = "bandpass";
  f2.frequency.value = formants[1];
  f2.Q.value = 5;
  f1.connect(g);
  f2.connect(g);
  for (let i = 0; i < voices; i++) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f0 * (1 + (Math.random() - 0.5) * 0.06 * Math.min(1, voices - 1)), t);
    o.frequency.linearRampToValueAtTime(f0 * 0.94, t + dur);
    o.connect(f1);
    o.connect(f2);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
  s.send(g, wet, pan);
}

/** A shush from somewhere in the room. */
export function shh(s: Scene, t: number, vol: number, wet: number) {
  burst(s, t, "white", "bandpass", 3600 + Math.random() * 1200, 1.5, vol, 0.7 + Math.random() * 0.5, wet, Math.random() * 1.6 - 0.8, 0.12);
}

/** A water drop into a puddle. */
export function drip(s: Scene, t: number, vol: number, wet: number) {
  const f = 900 + Math.random() * 1400;
  tone(s, t, f, "sine", vol, 0.08, wet, { to: f * 2.2, pan: Math.random() * 1.6 - 0.8 });
}

/** A bird's chirp: a quick run of rising/falling sine whistles. */
export function bird(s: Scene, t: number, vol: number, pan: number) {
  const f = 2600 + Math.random() * 2400;
  const n = 2 + Math.floor(Math.random() * 5);
  const up = Math.random() < 0.5;
  for (let i = 0; i < n; i++) tone(s, t + i * (0.07 + Math.random() * 0.05), f * (0.9 + Math.random() * 0.2), "sine", vol, 0.06, 0.1, { to: up ? f * 1.4 : f * 0.7, pan });
}

/** Crickets: a chirping trill. */
export function cricket(s: Scene, t: number, vol: number, pan: number) {
  const f = 4300 + Math.random() * 900;
  const n = 3 + Math.floor(Math.random() * 4);
  for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) for (let i = 0; i < n; i++) tone(s, t + k * 0.45 + i * 0.035, f, "sine", vol, 0.022, 0.1, { pan });
}

/** A gull: a few falling, nasal cries. */
export function gull(s: Scene, t: number, vol: number, pan: number) {
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const f = 1500 + Math.random() * 300;
    const at = t + i * (0.28 + Math.random() * 0.1);
    tone(s, at, f, "sawtooth", vol, 0.22, 0.25, { to: f * 0.6, lp: 2600, pan });
  }
}

/** A referee's (or a guard's) whistle: a trill with a quick vibrato. */
export function whistle(s: Scene, t: number, vol: number, dur: number, wet = 0.3) {
  const ctx = s.ctx;
  const o = ctx.createOscillator();
  o.frequency.value = 2900;
  const v = ctx.createOscillator();
  v.frequency.value = 32;
  const vd = ctx.createGain();
  vd.gain.value = 120;
  v.connect(vd).connect(o.frequency);
  const g = envGain(s, t, vol, 0.01, dur, 0.05);
  o.connect(g);
  s.send(g, wet);
  o.start(t);
  v.start(t);
  o.stop(t + dur + 0.1);
  v.stop(t + dur + 0.1);
}

/** A drum: a sine kick sliding down plus a skin of noise. */
export function drum(s: Scene, t: number, f: number, vol: number, wet = 0.3, pan = 0) {
  tone(s, t, f * 1.8, "sine", vol, 0.35, wet, { to: f, pan });
  burst(s, t, "pink", "lowpass", 900, 0.7, vol * 0.4, 0.08, wet, pan);
}

/** A hand clap. */
export function clap(s: Scene, t: number, vol: number, wet = 0.3, spread = 3) {
  for (let i = 0; i < spread; i++) burst(s, t + i * 0.012, "white", "bandpass", 1100 + Math.random() * 500, 1.2, vol, 0.09, wet, Math.random() * 1.2 - 0.6);
}

/** A brass note: a saw whose filter opens at the attack (fanfare trumpets, a tuba, an air horn). */
export function brass(s: Scene, t: number, f: number, dur: number, vol: number, wet = 0.3, bright = 2400) {
  const ctx = s.ctx;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.linearRampToValueAtTime(bright, t + 0.06);
  lp.frequency.setTargetAtTime(bright * 0.6, t + 0.1, 0.2);
  const g = envGain(s, t, vol, 0.03, dur, 0.15);
  for (const det of [-6, 6]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    o.detune.value = det;
    o.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.3);
  }
  lp.connect(g);
  s.send(g, wet);
}

// ───────────────────────── music ─────────────────────────

export const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export type Instrument = "piano" | "strings" | "musette" | "pad" | "chip" | "harp" | "rhodes";

/** One note on one of the scenes' instruments. */
export function note(s: Scene, inst: Instrument, t: number, n: number, dur: number, vol: number, wet: number, pan = 0) {
  const f = midi(n);
  switch (inst) {
    case "piano":
      tone(s, t, f, "triangle", vol, 1.6 + Math.random() * 0.4, wet, { pan, lp: 2600 });
      tone(s, t, f * 2, "sine", vol * 0.25, 0.6, wet, { pan });
      break;
    case "rhodes":
      tone(s, t, f, "sine", vol, 1.8, wet, { pan });
      tone(s, t, f * 3, "sine", vol * 0.12, 0.35, wet, { pan });
      break;
    case "harp":
      tone(s, t, f, "triangle", vol, 1.2, wet, { pan });
      break;
    case "strings":
      tone(s, t, f, "sawtooth", vol, 0.5, wet, { a: Math.min(0.35, dur * 0.4), hold: dur * 0.6, lp: 1700, pan, detune: (Math.random() - 0.5) * 8 });
      break;
    case "musette":
      // two reeds tuned slightly apart: the accordion's beating "musette" tremolo
      tone(s, t, f, "sawtooth", vol, 0.12, wet, { a: 0.03, hold: dur, lp: 1900, pan });
      tone(s, t, f, "square", vol * 0.5, 0.12, wet, { a: 0.03, hold: dur, lp: 1600, pan, detune: 14 });
      break;
    case "pad":
      tone(s, t, f, "sine", vol, dur * 0.5, wet, { a: dur * 0.4, hold: dur * 0.3, pan });
      tone(s, t, f * 2, "triangle", vol * 0.15, dur * 0.5, wet, { a: dur * 0.4, hold: dur * 0.3, pan });
      break;
    case "chip":
      tone(s, t, f, "square", vol, dur, wet, { pan, lp: 3500 });
      break;
  }
}

/**
 * A little band: a chord progression (midi), a bass on the root, chords comped in `comp` pattern
 * (beat positions in a bar), an optional melody line chosen from the chord. `beats` per bar.
 */
export function band(
  s: Scene,
  name: string,
  o: {
    bpm: number;
    beats: number;
    chords: number[][];
    inst: Instrument;
    bassInst?: Instrument;
    vol: number;
    wet: number;
    comp: number[];
    compDur?: number;
    melody?: Instrument;
    melodyProb?: number;
    bars?: number;
    swish?: boolean;
  },
) {
  const beat = 60 / o.bpm;
  const bars = o.bars ?? 1;
  let next = s.now + 0.3;
  let k = 0;
  s.seq((until) => {
    while (next < until) {
      const chord = o.chords[Math.floor(k / bars) % o.chords.length];
      const t0 = next;
      // bass
      note(s, o.bassInst ?? "harp", t0, chord[0] - 12, beat * 1.5, o.vol * 0.9, o.wet * 0.5);
      if (o.beats >= 4 && Math.random() < 0.6) note(s, o.bassInst ?? "harp", t0 + beat * 2, chord[Math.random() < 0.5 ? 0 : 2] - 12, beat, o.vol * 0.7, o.wet * 0.5);
      // comping
      for (const at of o.comp) for (const n of chord.slice(1)) note(s, o.inst, t0 + at * beat + Math.random() * 0.015, n, beat * (o.compDur ?? 0.8), o.vol * 0.45, o.wet);
      // melody
      if (o.melody)
        for (let i = 0; i < o.beats * 2; i++) {
          if (Math.random() > (o.melodyProb ?? 0.35)) continue;
          const n = chord[1 + Math.floor(Math.random() * (chord.length - 1))] + 12;
          note(s, o.melody, t0 + i * beat * 0.5, n, beat * (0.5 + Math.random()), o.vol * 0.6, o.wet, 0.2);
        }
      if (o.swish) for (let b = 1; b < o.beats; b += 2) burst(s, t0 + b * beat, "white", "highpass", 6000, 0.7, o.vol * 0.25, 0.12, o.wet);
      next += beat * o.beats;
      k++;
    }
  });
  s.layers.push(name);
}
