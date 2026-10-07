/**
 * Real recordings (public/audio, credits in public/audio/CREDITS.md): looping field-recording beds
 * and a few one-shots, fetched and decoded the first time a soundscape needs them, then cached.
 *
 * Each bed file holds one seamless loop of `LOOPS[name]` seconds (its tail already cross-faded into
 * its head) followed by half a second of wrap-around, so it loops over [LEAD, LEAD + period]: the
 * encoder's priming delay at the start never lands inside the loop.
 */
import type { Scene } from "./lib";

/** Bed name → its loop period (s). */
export const LOOPS: Record<string, number> = {
  "city-day": 28,
  "city-night": 28,
  "night-crickets": 26,
  rain: 26,
  birds: 28,
  shibuya: 28,
  stadium: 30,
  "crowd-arena": 30,
  museum: 28,
  lobby: 28,
  restaurant: 28,
  foyer: 28,
  mall: 28,
  waterfall: 26,
  office: 28,
  casino: 28,
  prison: 28,
  gulls: 28,
  harbour: 28,
  servers: 26,
  industry: 26,
  cave: 28,
  tuning: 30,
  clockwork: 24.75,
  wind: 27,
  waves: 28,
  pool: 28,
  paris: 28,
  arcade: 28,
  gym: 26,
  construction: 26,
  graveyard: 26,
  zombies: 12,
};
/** One-shots (played whole). */
export type Shot = "goal" | "bigben-bong" | "cell-door" | "ship-horn" | "foghorn" | "crossing-cuckoo" | "forklift" | "applause" | "crow" | "crow2" | "groan" | "groan2" | "groan3";
export type Bed = keyof typeof LOOPS;

const LEAD = 0.1;
const BASE = `${import.meta.env?.BASE_URL ?? "/"}audio/`;
const cache = new Map<string, Promise<AudioBuffer | null>>();
const ready = new Map<string, AudioBuffer>();

/** The decoded file (null if it could not be fetched or decoded; then that layer stays silent). */
export function load(ctx: BaseAudioContext, name: string): Promise<AudioBuffer | null> {
  let p = cache.get(name);
  if (!p) {
    p = fetch(`${BASE}${name}.m4a`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
      .then((a) => ctx.decodeAudioData(a))
      .then((b) => {
        ready.set(name, b);
        return b;
      })
      .catch((e) => {
        console.warn("sound: could not load", name, e);
        return null;
      });
    cache.set(name, p);
  }
  return p;
}

export interface PlayOpts {
  /** Low-pass (Hz): through a wall, from far away, under water. */
  lp?: number;
  /** High-pass (Hz). */
  hp?: number;
  pan?: number;
  rate?: number;
  /** Fade-in once loaded (s). */
  fadeIn?: number;
}

export interface Playing {
  /** The layer's level (automate it freely). */
  gain: GainNode;
  stop: (fade?: number) => void;
}

/** Filters and panner between a source and `dest`; returns the chain's input. */
function chain(ctx: BaseAudioContext, dest: AudioNode, o: PlayOpts): AudioNode {
  let head: AudioNode = dest;
  const link = (n: AudioNode) => {
    n.connect(head);
    head = n;
  };
  if (o.pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    link(p);
  }
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.lp;
    f.Q.value = 0.5;
    link(f);
  }
  if (o.hp) {
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = o.hp;
    link(f);
  }
  return head;
}

/**
 * A looping bed into `dest`, at `level`. Returns at once (its gain can be automated right away);
 * the sound fades in when its file has arrived, from a random point of the loop so a bed reused in
 * two places never sounds the same twice.
 */
export function loopInto(ctx: BaseAudioContext, dest: AudioNode, name: Bed, level: number, o: PlayOpts = {}, alive: () => boolean = () => true): Playing {
  const gain = ctx.createGain();
  gain.gain.value = level;
  const env = ctx.createGain();
  env.gain.value = 0;
  env.connect(gain).connect(chain(ctx, dest, o));
  let src: AudioBufferSourceNode | null = null;
  let stopped = false;
  void load(ctx, name).then((buf) => {
    if (!buf || stopped || !alive()) return;
    const period = LOOPS[name];
    src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = LEAD;
    src.loopEnd = Math.min(buf.duration, LEAD + period);
    if (o.rate) src.playbackRate.value = o.rate;
    src.connect(env);
    const t = ctx.currentTime + 0.02;
    src.start(t, LEAD + Math.random() * period * 0.95);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + (o.fadeIn ?? 1.2));
  });
  return {
    gain,
    stop(fade = 0.5) {
      stopped = true;
      const t = ctx.currentTime;
      env.gain.cancelScheduledValues(t);
      env.gain.setValueAtTime(env.gain.value, t);
      env.gain.linearRampToValueAtTime(0, t + fade);
      const s = src;
      setTimeout(() => {
        try {
          s?.stop();
        } catch {
          /* already stopped */
        }
        gain.disconnect();
      }, fade * 1000 + 100);
    },
  };
}

/** A one-shot into `dest` at time `t` (skipped if its file is not there yet; it is fetched for next time). */
export function shotInto(ctx: BaseAudioContext, dest: AudioNode, name: Shot, t: number, level: number, o: PlayOpts = {}) {
  const buf = ready.get(name);
  if (!buf) {
    void load(ctx, name);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (o.rate) src.playbackRate.value = o.rate;
  const g = ctx.createGain();
  g.gain.value = level;
  src.connect(g).connect(chain(ctx, dest, o));
  src.start(Math.max(t, ctx.currentTime));
  src.onended = () => g.disconnect();
}

/** Fetch these now (a scene's one-shots, so the first event is not silent). */
export function preload(ctx: BaseAudioContext, ...names: string[]) {
  for (const n of names) void load(ctx, n);
}

// ───────────────────────── in a Scene ─────────────────────────

/** A bed in a scene: stopped with the scene. `wet` sends some of it into the scene's room. */
export function loop(s: Scene, name: Bed, level: number, o: PlayOpts & { wet?: number } = {}): GainNode {
  const bus = s.ctx.createGain();
  s.send(bus, o.wet ?? 0);
  const p = loopInto(s.ctx, bus, name, level, o, () => !s.dead);
  s.onClose(() => p.stop(0.1));
  s.layers.push(name);
  return p.gain;
}

/** A one-shot in a scene. */
export function shot(s: Scene, name: Shot, t: number, level: number, o: PlayOpts & { wet?: number } = {}) {
  const bus = s.ctx.createGain();
  s.send(bus, o.wet ?? 0);
  shotInto(s.ctx, bus, name, t, level, o);
}
