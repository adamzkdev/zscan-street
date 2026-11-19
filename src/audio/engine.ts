/**
 * ZK PARTY's audio engine (the hall, the board, the mini-games, the table games): one
 * AudioContext and its mixer.
 *
 *   music ─► music glue ─► duck ─┐
 *   ambience ────────────► duck ─┤
 *   sfx (src/audio/sfx.ts) ──────┼─► glue compressor ─► limiter ─► mute/volume ─► speakers
 *   bus (games' own sounds) ─────┤
 *   room reverb (sends) ─────────┘   hall reverb + chorus (the music's sends) go into music
 *
 * - `party()`: the live mixer (null while the page's sound switch, audio/master.ts, is off; the
 *   switch also fades everything out at once and lets the context sleep).
 * - Rooms: `room(kind)` sets the space the effects and the ambience ring in (outdoor, club, hall,
 *   space, cave), a convolution reverb on a generated impulse; `roomSend` / `hallSend` /
 *   `chorusSend` are the send buses.
 * - Ducking: `duck(depth, hold, release)` dips the music (and half as much the ambience) under a
 *   sting, a fanfare, a voice-like cue.
 * - Levels: `setVolume("music" | "sfx" | "amb", 0..1)`, kept in localStorage ("party.mix").
 *
 * CPU: two convolvers in all (the room and the music's hall), a chorus of two modulated delays, two
 * compressors. Sounds are rendered once into buffers (./dsp.ts) and played back by one source each.
 */
import { master } from "./master";
import type { RoomKind } from "./kinds";

/** A room's reverb: tail (s), T60 (s), brightness 0..1, pre-delay (s), return level, discrete echoes [s, gain]. */
interface RoomSpec {
  len: number;
  t60: number;
  bright: number;
  pre: number;
  level: number;
  echoes?: [number, number][];
}
export const ROOMS: Record<RoomKind, RoomSpec> = {
  // open air: a little early bounce off the arena, a far slap
  outdoor: { len: 1.3, t60: 0.85, bright: 0.75, pre: 0.008, level: 0.2, echoes: [[0.13, 0.16], [0.29, 0.07]] },
  club: { len: 1.1, t60: 0.8, bright: 0.5, pre: 0.005, level: 0.3 },
  hall: { len: 2.8, t60: 2.2, bright: 0.55, pre: 0.02, level: 0.3 },
  space: { len: 4.5, t60: 4, bright: 0.32, pre: 0.04, level: 0.36 },
  cave: { len: 3.4, t60: 2.8, bright: 0.3, pre: 0.022, level: 0.36, echoes: [[0.095, 0.32], [0.18, 0.22], [0.33, 0.13], [0.5, 0.07]] },
};

/** The buses' base levels (a full mix lands near −16 LUFS, music under −18, ambience near −30). */
const LEVEL = { music: 0.9, sfx: 0.62, amb: 0.5, bus: 0.5 };

export type MixKind = "music" | "sfx" | "amb";

const irCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
/** A generated impulse response: decorrelated noise, an exponential tail that darkens as it dies, early reflections and echoes. */
export function impulse(ac: BaseAudioContext, r: RoomSpec): AudioBuffer {
  let m = irCache.get(ac);
  if (!m) irCache.set(ac, (m = new Map()));
  const key = `${r.len}|${r.t60}|${r.bright}|${r.pre}|${r.echoes?.join() ?? ""}`;
  const hit = m.get(key);
  if (hit) return hit;
  const sr = ac.sampleRate;
  const n = Math.floor(sr * r.len);
  const buf = ac.createBuffer(2, n, sr);
  let seed = 0x9e3779b9;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
  const pre = Math.floor(sr * r.pre);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let y = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      // the tail darkens: the one-pole's cutoff falls from bright to dull
      const a = Math.min(0.95, (0.12 + r.bright * 0.8) * Math.exp(-t * 1.6 * (1.2 - r.bright)));
      y += a * (rnd() * 2 - 1 - y);
      // a soft onset (no click), then the decay (60 dB over t60)
      const on = Math.min(1, t / 0.006);
      d[i] = y * on * Math.exp((-6.91 * t) / r.t60);
    }
    // early reflections: a few sparse taps in the first 60 ms
    for (let k = 0; k < 7; k++) {
      const at = pre + Math.floor(sr * (0.004 + rnd() * 0.055));
      if (at < n) d[at] += (rnd() < 0.5 ? -1 : 1) * (0.5 - k * 0.05);
    }
    for (const [s, g] of r.echoes ?? []) {
      const at = Math.floor(sr * s * (c ? 1.06 : 1));
      // a smeared echo, not a single sample
      for (let j = 0; j < 40 && at + j < n; j++) d[at + j] += g * (rnd() * 2 - 1) * Math.exp(-j / 12) * 3;
    }
  }
  m.set(key, buf);
  return buf;
}

export class Mixer {
  /** The music's bus (songs connect here). */
  readonly music: GainNode;
  /** The ambience beds' bus. */
  readonly amb: GainNode;
  /** The sound effects' bus. */
  readonly sfx: GainNode;
  /** The games' own sounds (kit.ts sound().bus): straight into the mix, with a touch of the room. */
  readonly bus: GainNode;
  /** Send buses: the room (effects, ambience), the music's hall and chorus. */
  readonly roomSend: GainNode;
  readonly hallSend: GainNode;
  readonly chorusSend: GainNode;
  /** The mute (the page's sound switch) and master volume. */
  readonly out: GainNode;
  readonly glue: DynamicsCompressorNode;
  readonly limiter: DynamicsCompressorNode;
  private musicDuck: GainNode;
  private ambDuck: GainNode;
  private roomVerb: ConvolverNode;
  private roomOut: GainNode;
  private roomNow: RoomKind | null = null;
  private roomTimer = 0;
  private vol: Record<MixKind, number> = { music: 1, sfx: 1, amb: 1 };
  private meterNode: AnalyserNode | null = null;

  constructor(
    readonly ac: BaseAudioContext,
    dest: AudioNode,
  ) {
    try {
      const v = JSON.parse(localStorage.getItem("party.mix") ?? "{}") as Partial<Record<MixKind, number>>;
      for (const k of ["music", "sfx", "amb"] as const) if (typeof v[k] === "number") this.vol[k] = Math.max(0, Math.min(1, v[k]!));
    } catch {}
    const gain = (v: number) => {
      const g = ac.createGain();
      g.gain.value = v;
      return g;
    };
    this.out = gain(master.on ? 1 : 0);
    this.out.connect(dest);
    // the master: a gentle glue, then a brick-wall-ish limiter (a ceiling near −1 dBFS)
    this.limiter = ac.createDynamicsCompressor();
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.09;
    this.glue = ac.createDynamicsCompressor();
    this.glue.threshold.value = -16;
    this.glue.knee.value = 10;
    this.glue.ratio.value = 2;
    this.glue.attack.value = 0.012;
    this.glue.release.value = 0.22;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 28;
    hp.Q.value = 0.6;
    hp.connect(this.glue).connect(this.limiter).connect(this.out);
    // the buses
    this.musicDuck = gain(1);
    this.ambDuck = gain(1);
    this.musicDuck.connect(hp);
    this.ambDuck.connect(hp);
    this.music = gain(LEVEL.music * this.vol.music);
    this.music.connect(this.musicDuck);
    this.amb = gain(LEVEL.amb * this.vol.amb);
    this.amb.connect(this.ambDuck);
    this.sfx = gain(LEVEL.sfx * this.vol.sfx);
    this.sfx.connect(hp);
    this.bus = gain(LEVEL.bus);
    this.bus.connect(hp);
    // the room: one convolver, its impulse swapped by room()
    this.roomSend = gain(1);
    this.roomVerb = ac.createConvolver();
    this.roomOut = gain(0);
    this.roomSend.connect(this.roomVerb).connect(this.roomOut).connect(hp);
    const busRoom = gain(0.12);
    this.bus.connect(busRoom).connect(this.roomSend);
    this.room("outdoor");
    // the music's hall: a warm 2.3 s plate-like tail, into the music bus (it ducks with it)
    this.hallSend = gain(1);
    const hall = ac.createConvolver();
    hall.buffer = impulse(ac, { len: 2.4, t60: 2, bright: 0.62, pre: 0.014, level: 1 });
    const hallOut = gain(0.8);
    this.hallSend.connect(hall).connect(hallOut).connect(this.music);
    // the chorus: two delays swaying a few ms, hard left and right
    this.chorusSend = gain(1);
    for (let s = 0; s < 2; s++) {
      const d = ac.createDelay(0.05);
      d.delayTime.value = s ? 0.0175 : 0.0125;
      const lfo = ac.createOscillator();
      lfo.frequency.value = s ? 0.31 : 0.23;
      const depth = gain(s ? 0.0026 : 0.0021);
      lfo.connect(depth).connect(d.delayTime);
      lfo.start();
      const p = ac.createStereoPanner();
      p.pan.value = s ? 0.85 : -0.85;
      const g = gain(0.5);
      this.chorusSend.connect(d).connect(p).connect(g).connect(this.music);
    }
  }

  get now() {
    return this.ac.currentTime;
  }

  /** The room the effects and the ambience ring in (cross-faded when it changes). */
  room(kind: RoomKind) {
    if (kind === this.roomNow) return;
    const r = ROOMS[kind];
    const ac = this.ac;
    const t = ac.currentTime;
    const set = () => {
      this.roomVerb.buffer = impulse(ac, r);
      this.roomOut.gain.cancelScheduledValues(ac.currentTime);
      this.roomOut.gain.setTargetAtTime(r.level, ac.currentTime, 0.08);
    };
    const first = this.roomNow === null;
    this.roomNow = kind;
    clearTimeout(this.roomTimer);
    if (first || typeof window === "undefined" || !(ac instanceof AudioContext)) {
      this.roomVerb.buffer = impulse(ac, r);
      this.roomOut.gain.setValueAtTime(r.level, t);
      return;
    }
    // (a convolver's buffer swaps with a click: fade its return out first)
    this.roomOut.gain.cancelScheduledValues(t);
    this.roomOut.gain.setTargetAtTime(0, t, 0.03);
    this.roomTimer = window.setTimeout(set, 140);
  }

  get roomKind() {
    return this.roomNow;
  }

  /**
   * Ducks the music under something (a sting, a fanfare, a voice): down by `depth` (0..1) in ~30 ms,
   * held `hold` s, back over `release` s. The ambience ducks half as much (`music` false: only the
   * ambience, by `depth`: under a song's own sting).
   */
  duck(depth = 0.5, hold = 0.3, release = 0.5, at?: number, music = true) {
    const t = Math.max(at ?? 0, this.ac.currentTime);
    for (const [g, k] of [
      [this.musicDuck, music ? depth : 0],
      [this.ambDuck, music ? depth * 0.5 : depth],
    ] as const) {
      if (!k) continue;
      const p = g.gain;
      p.cancelScheduledValues(t);
      p.setTargetAtTime(1 - k, t, 0.025);
      p.setTargetAtTime(1, t + 0.06 + hold, Math.max(0.02, release / 3));
    }
  }

  /** A bus's level, 0..1 (kept for the next visit). */
  setVolume(kind: MixKind, v: number) {
    this.vol[kind] = Math.max(0, Math.min(1, v));
    const node = kind === "music" ? this.music : kind === "sfx" ? this.sfx : this.amb;
    node.gain.setTargetAtTime(LEVEL[kind] * this.vol[kind], this.ac.currentTime, 0.05);
    try {
      localStorage.setItem("party.mix", JSON.stringify(this.vol));
    } catch {}
  }
  volume(kind: MixKind) {
    return this.vol[kind];
  }

  /** The bench: the mix's level now (RMS and peak, linear) off an analyser made on first use. */
  meter() {
    if (!this.meterNode) {
      this.meterNode = this.ac.createAnalyser();
      this.meterNode.fftSize = 4096;
      this.limiter.connect(this.meterNode);
    }
    const d = new Float32Array(this.meterNode.fftSize);
    this.meterNode.getFloatTimeDomainData(d);
    let s = 0;
    let p = 0;
    for (const v of d) ((s += v * v), (p = Math.max(p, Math.abs(v))));
    return { rms: Math.sqrt(s / d.length), peak: p };
  }
}

const mixers = new WeakMap<BaseAudioContext, Mixer>();
/** The mixer of a context (an offline one for the benches: it renders into its destination). */
export function mixerFor(ac: BaseAudioContext): Mixer {
  let m = mixers.get(ac);
  if (!m) mixers.set(ac, (m = new Mixer(ac, ac.destination)));
  return m;
}

let live: Mixer | null = null;
let watching = false;
const wakeHooks: ((m: Mixer) => void)[] = [];
/** Called once with the live mixer when it is made (the effects prepare their sounds). */
export function onMixer(f: (m: Mixer) => void) {
  if (live) f(live);
  else wakeHooks.push(f);
}

/** The live mixer (null while the sound is off). Wakes the context if the browser put it to sleep. */
export function party(): Mixer | null {
  if (!master.on) return null;
  if (!live) {
    try {
      const ac = new AudioContext({ latencyHint: "interactive" });
      live = new Mixer(ac, ac.destination);
      mixers.set(ac, live);
    } catch {
      return null;
    }
    if (!watching) {
      watching = true;
      master.watch((on) => {
        const m = live;
        if (!m) return;
        const ac = m.ac as AudioContext;
        m.out.gain.cancelScheduledValues(ac.currentTime);
        m.out.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.04);
        if (on) void ac.resume();
        // (silent: let the machine rest)
        else setTimeout(() => !master.on && ac.state === "running" && void ac.suspend(), 400);
      });
    }
    for (const f of wakeHooks.splice(0)) f(live);
  }
  const ac = live.ac as AudioContext;
  if (ac.state === "suspended") void ac.resume();
  return live;
}
