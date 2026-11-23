/**
 * The game's sounds (src/gta), synthesized on the street's own audio graph (so the sound button and
 * the fades still rule them): an engine (two detuned saws and a square through a low-pass, the
 * pitch on the revs, louder on the throttle), tyres (filtered noise while drifting), the nitrous'
 * hiss, a horn, crashes, the gear changes, and the little UI clicks.
 */
export interface AudioOut {
  ctx: AudioContext;
  out: AudioNode;
}

export class GtaSound {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
  private engine: { oscs: OscillatorNode[]; lp: BiquadFilterNode; gain: GainNode } | null = null;
  private tyres: { src: AudioBufferSourceNode; bp: BiquadFilterNode; gain: GainNode } | null = null;
  private hiss: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private horn: { oscs: OscillatorNode[]; gain: GainNode } | null = null;
  private noise: AudioBuffer | null = null;
  private sirenN: { o: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  volume = 1;

  constructor(private get: () => AudioOut | null) {}

  private ready() {
    const a = this.get();
    if (!a) return false;
    if (a.ctx !== this.ctx) {
      this.stopAll();
      this.ctx = a.ctx;
      this.out = a.out;
      const n = a.ctx.sampleRate * 2;
      this.noise = a.ctx.createBuffer(1, n, a.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return a.ctx.state === "running";
  }

  /** At the wheel each frame (or `null` off it: the engine winds down). */
  drive(s: { rpm: number; throttle: number; drift: number; nitro: boolean; speed: number } | null) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    if (!s) {
      if (this.engine) {
        const e = this.engine;
        e.gain.gain.setTargetAtTime(0, t, 0.15);
        setTimeout(() => e.oscs.forEach((o) => o.stop()), 900);
        this.engine = null;
      }
      if (this.tyres) {
        const y = this.tyres;
        y.gain.gain.setTargetAtTime(0, t, 0.1);
        setTimeout(() => y.src.stop(), 600);
        this.tyres = null;
      }
      if (this.hiss) {
        const h = this.hiss;
        h.gain.gain.setTargetAtTime(0, t, 0.1);
        setTimeout(() => h.src.stop(), 600);
        this.hiss = null;
      }
      return;
    }
    if (!this.engine) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 3;
      lp.connect(gain).connect(this.out!);
      const oscs = (["sawtooth", "sawtooth", "square"] as OscillatorType[]).map((type, i) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.detune.value = [0, 9, -1200][i];
        const g = ctx.createGain();
        g.gain.value = [0.5, 0.4, 0.35][i];
        o.connect(g).connect(lp);
        o.start();
        return o;
      });
      this.engine = { oscs, lp, gain };
    }
    const e = this.engine;
    const f = 38 + s.rpm * 150;
    for (const o of e.oscs) o.frequency.setTargetAtTime(f, t, 0.05);
    e.lp.frequency.setTargetAtTime(300 + s.rpm * 1500 + s.throttle * 900, t, 0.06);
    e.gain.gain.setTargetAtTime((0.05 + s.throttle * 0.07 + s.rpm * 0.05) * this.volume, t, 0.08);
    // the tyres
    const want = s.drift * Math.min(1, s.speed / 12);
    if (want > 0.02 && !this.tyres) this.tyres = this.loop(1800, 2.5);
    if (this.tyres) {
      this.tyres.gain.gain.setTargetAtTime(want * 0.16 * this.volume, t, 0.06);
      this.tyres.bp.frequency.setTargetAtTime(1400 + s.speed * 18, t, 0.1);
    }
    // the nitrous
    if (s.nitro && !this.hiss) {
      const l = this.loop(5200, 0.6);
      this.hiss = { src: l.src, gain: l.gain };
    }
    if (this.hiss) this.hiss.gain.gain.setTargetAtTime(s.nitro ? 0.07 * this.volume : 0, t, 0.08);
  }

  private loop(freq: number, q: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(bp).connect(gain).connect(this.out!);
    src.start();
    return { src, bp, gain };
  }

  /** The police sirens, by how near (0 … 1; 0 stops them). */
  siren(k: number) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    if (k <= 0.01) {
      if (this.sirenN) {
        const n = this.sirenN;
        n.gain.gain.setTargetAtTime(0, t, 0.2);
        setTimeout(() => (n.o.stop(), n.lfo.stop()), 1200);
        this.sirenN = null;
      }
      return;
    }
    if (!this.sirenN) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = 780;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const depth = ctx.createGain();
      depth.gain.value = 180;
      lfo.connect(depth).connect(o.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1800;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      o.connect(lp).connect(gain).connect(this.out!);
      o.start();
      lfo.start();
      this.sirenN = { o, lfo, gain };
    }
    this.sirenN.gain.gain.setTargetAtTime(k * 0.045 * this.volume, t, 0.15);
  }

  /** The horn, held. */
  hornOn(on: boolean) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    if (on && !this.horn) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2400;
      lp.connect(gain).connect(this.out!);
      const oscs = [392, 494].map((fr) => {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = fr;
        o.connect(lp);
        o.start();
        return o;
      });
      gain.gain.setTargetAtTime(0.07 * this.volume, t, 0.01);
      this.horn = { oscs, gain };
    } else if (!on && this.horn) {
      const h = this.horn;
      h.gain.gain.setTargetAtTime(0, t, 0.03);
      setTimeout(() => h.oscs.forEach((o) => o.stop()), 300);
      this.horn = null;
    }
  }

  /** A crash: a thump and some glass, by how hard. */
  crash(k: number) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const v = Math.min(1, k) * this.volume;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + 0.4);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = k > 0.5 ? 2500 : 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.22 * v, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18 + k * 0.3);
    src.connect(hp).connect(ng).connect(this.out!);
    src.start(t, Math.random());
    src.stop(t + 0.6);
  }

  /** A short tone: a UI click, a checkpoint, a reward. */
  blip(kind: "click" | "gate" | "reward" | "fail" | "smash" | "door") {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const notes: Record<typeof kind, [number, number, number][]> = {
      click: [[880, 0, 0.04]],
      door: [[220, 0, 0.08], [165, 0.07, 0.1]],
      gate: [[660, 0, 0.08], [990, 0.07, 0.12]],
      reward: [[523, 0, 0.1], [659, 0.09, 0.1], [784, 0.18, 0.1], [1047, 0.27, 0.22]],
      fail: [[392, 0, 0.14], [311, 0.13, 0.26]],
      smash: [[1400, 0, 0.05], [700, 0.03, 0.12]],
    };
    for (const [f, at, len] of notes[kind]) {
      const o = ctx.createOscillator();
      o.type = kind === "smash" ? "sawtooth" : "triangle";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + at);
      g.gain.linearRampToValueAtTime(0.12 * this.volume, t + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + at + len);
      o.connect(g).connect(this.out!);
      o.start(t + at);
      o.stop(t + at + len + 0.05);
    }
    if (kind === "smash") this.crash(0.5);
  }

  stopAll() {
    if (this.sirenN) (this.sirenN.o.stop(), this.sirenN.lfo.stop(), (this.sirenN = null));
    for (const o of this.engine?.oscs ?? []) o.stop();
    for (const o of this.horn?.oscs ?? []) o.stop();
    this.tyres?.src.stop();
    this.hiss?.src.stop();
    this.engine = this.tyres = this.hiss = this.horn = null;
  }
}
