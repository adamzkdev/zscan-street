/**
 * The swing's sounds, all synthesized (nothing to load): the line thrown, the line taking your
 * weight, the air going past, a landing. Silent unless the street's sound is on (`enabled`).
 */
export class SwingSound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private rush: { gain: GainNode; filter: BiquadFilterNode } | null = null;

  constructor(private enabled: () => boolean = () => true) {}

  /** Wake the audio up (from a key or a press: browsers only let sound start from one). */
  start() {
    if (!this.enabled()) return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.7;
      const limit = this.ctx.createDynamicsCompressor();
      this.out.connect(limit).connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== "running") void this.ctx.resume();
  }

  private live() {
    const c = this.ctx;
    if (!c || !this.out) return null;
    if (!this.enabled()) {
      // (the street's sound switched off mid-swing: the rush stops at once)
      if (this.rush) this.rush.gain.gain.setTargetAtTime(0, c.currentTime, 0.05);
      return null;
    }
    return c;
  }

  private burst(level: number, pan: number, seconds: number, type: BiquadFilterType, from: number, to: number) {
    const c = this.live();
    if (!c || level <= 0.001) return;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + seconds);
    const g = c.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + seconds);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(this.out!);
    s.start(t, Math.random());
    s.stop(t + seconds + 0.02);
  }

  private tone(level: number, pan: number, seconds: number, type: OscillatorType, from: number, to: number) {
    const c = this.live();
    if (!c || level <= 0.001) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + seconds);
    const g = c.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + seconds);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(this.out!);
    o.start(t);
    o.stop(t + seconds + 0.02);
  }

  /** The line thrown: a quick zip, from the side of the hand that threw it. */
  cast(side = 1) {
    this.burst(0.24, 0.2 * side, 0.12, "highpass", 3800, 1500);
    this.tone(0.05, 0.2 * side, 0.09, "triangle", 1800, 500);
  }

  /** The line taking your weight. */
  taut(level: number) {
    this.tone(0.16 * level, 0.15, 0.16, "triangle", 260, 110);
    this.burst(0.1 * level, 0.15, 0.08, "bandpass", 1500, 700);
  }

  /** Feet on a roof or back on the street. */
  land(level: number) {
    this.burst(0.2 * Math.min(1.5, 0.5 + level), 0, 0.09, "lowpass", 420, 130);
  }

  /** The air going past, for as long as you are moving through it: 0 is silence, 1 flat out. */
  air(level: number) {
    const c = this.live();
    if (!c) return;
    if (!this.rush) {
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 0.7;
      const gain = c.createGain();
      gain.gain.value = 0;
      s.connect(filter).connect(gain).connect(this.out!);
      s.start();
      this.rush = { gain, filter };
    }
    const t = c.currentTime;
    this.rush.gain.gain.setTargetAtTime(Math.min(1, Math.max(0, level)) * 0.3, t, 0.12);
    this.rush.filter.frequency.setTargetAtTime(380 + level * 1300, t, 0.12);
  }

  /** Quiet now (back on the map, through a door). */
  hush() {
    if (this.ctx && this.rush) this.rush.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }
}
