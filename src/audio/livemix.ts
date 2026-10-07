import type { Scene } from "./lib";
import { live, type LiveSource } from "./live";
import { load } from "./samples";

/**
 * The live music of the place you are in (./live.ts), mixed into its soundscape: every source on
 * your floor is a PannerNode at the player (HRTF, inverse distance), with a low-pass that closes as
 * you walk away (a band heard from across the room is mostly its bass); sources on another floor
 * that bleed into this one play muffled and unpanned. Recordings join where the performance is
 * (a piece started a minute ago is heard from its minute), cross-fade when a player changes piece,
 * and stop with the scene (mute, leaving the place, changing floor).
 */

/** Where the ear is: the walking camera. */
export interface Ear {
  position: { x: number; y: number; z: number };
  /** World matrix columns give the camera's forward (−z) and up (+y). */
  matrixWorld: { elements: ArrayLike<number> };
}

interface Voice {
  src: AudioBufferSourceNode | null;
  env: GainNode;
  version: number;
  dead: boolean;
}

interface Chan {
  s: LiveSource;
  out: GainNode;
  lp: BiquadFilterNode;
  panner: PannerNode | null;
  meter: AnalyserNode;
  buf: Float32Array<ArrayBuffer>;
  voice: Voice | null;
}

const MUSIC = "music/";

export class LiveMix {
  private chans: Chan[] = [];
  private unsub: () => void;
  private closed = false;

  constructor(private s: Scene, private place: string, private floor: number) {
    this.sync();
    this.unsub = live.subscribe(() => this.sync());
    s.onClose(() => this.close());
  }

  /** Channels for new sources, a cross-fade for every source that changed its piece. */
  private sync() {
    if (this.closed || this.s.dead) return;
    const list = live.of(this.place);
    // sources removed
    for (const c of this.chans.filter((c) => !list.includes(c.s))) this.drop(c);
    this.chans = this.chans.filter((c) => list.includes(c.s));
    for (const s of list) {
      const here = s.spec.floor === this.floor;
      const bleed = s.spec.bleed?.[this.floor];
      if (!here && !bleed) continue;
      let c = this.chans.find((x) => x.s === s);
      if (!c) {
        c = this.chan(s, here, bleed);
        this.chans.push(c);
      }
      if (!c.voice || c.voice.version !== s.version) this.start(c);
    }
  }

  private chan(s: LiveSource, here: boolean, bleed?: { level: number; lp: number }): Chan {
    const ctx = this.s.ctx;
    const out = ctx.createGain();
    out.gain.value = (s.spec.level ?? 1) * (here ? 1 : bleed!.level);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.4;
    lp.frequency.value = here ? 16000 : bleed!.lp;
    const meter = ctx.createAnalyser();
    meter.fftSize = 512;
    let panner: PannerNode | null = null;
    if (here) {
      panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = s.spec.ref ?? 2.5;
      panner.rolloffFactor = s.spec.rolloff ?? 1.1;
      panner.maxDistance = 200;
      setPos(panner, s.spec.x, s.spec.y, s.spec.z);
      out.connect(lp).connect(panner);
      this.s.send(panner, s.spec.wet ?? 0.25);
    } else {
      out.connect(lp);
      this.s.send(lp, 0.1);
    }
    return { s, out, lp, panner, meter, buf: new Float32Array(meter.fftSize), voice: null };
  }

  /** (Re)start a channel on its source's current track, from where the performance is. */
  private start(c: Chan) {
    const ctx = this.s.ctx;
    const old = c.voice;
    if (old) fadeOut(ctx, old, 1.6);
    const track = c.s.track;
    const env = ctx.createGain();
    env.gain.value = 0;
    env.connect(c.meter);
    env.connect(c.out);
    const v: Voice = { src: null, env, version: c.s.version, dead: false };
    c.voice = v;
    if (!track) return;
    void load(ctx, MUSIC + track).then((buf) => {
      if (!buf || v.dead || this.closed || this.s.dead) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const loop = c.s.spec.loop !== false;
      src.loop = loop;
      let at = c.s.elapsed;
      if (loop) at %= buf.duration;
      else if (at >= buf.duration - 0.2) return;
      src.connect(env);
      const t = ctx.currentTime + 0.03;
      src.start(t, Math.max(0, at));
      v.src = src;
      // from the top: the recording's own fade-in; joining mid-piece: a quick fade
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + (at < 0.5 ? 0.05 : 1.2));
    });
  }

  /** Every frame: the ear's position and heading, each player's distance muffle, the meters. */
  update(ear: Ear | null) {
    if (this.closed) return;
    const ctx = this.s.ctx;
    const t = ctx.currentTime;
    if (ear) {
      const l = ctx.listener;
      const p = ear.position;
      const e = ear.matrixWorld.elements;
      if (l.positionX) {
        l.positionX.setTargetAtTime(p.x, t, 0.03);
        l.positionY.setTargetAtTime(p.y, t, 0.03);
        l.positionZ.setTargetAtTime(p.z, t, 0.03);
        l.forwardX.setTargetAtTime(-e[8], t, 0.03);
        l.forwardY.setTargetAtTime(-e[9], t, 0.03);
        l.forwardZ.setTargetAtTime(-e[10], t, 0.03);
        l.upX.setTargetAtTime(e[4], t, 0.03);
        l.upY.setTargetAtTime(e[5], t, 0.03);
        l.upZ.setTargetAtTime(e[6], t, 0.03);
      } else {
        l.setPosition(p.x, p.y, p.z);
        l.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
      }
    }
    for (const c of this.chans) {
      const sp = c.s.spec;
      if (c.panner) {
        setPos(c.panner, sp.x, sp.y, sp.z, t);
        if (ear) {
          // across the room the highs go first (furniture, people, the air)
          const d = Math.hypot(ear.position.x - sp.x, ear.position.y - sp.y, ear.position.z - sp.z);
          const ref = sp.ref ?? 2.5;
          const k = Math.min(1, Math.max(0, (d - ref) / (ref * 8)));
          c.lp.frequency.setTargetAtTime(16000 * Math.pow(1800 / 16000, k), t, 0.15);
        }
      }
      c.meter.getFloatTimeDomainData(c.buf);
      let sum = 0;
      for (let i = 0; i < c.buf.length; i += 2) sum += c.buf[i] * c.buf[i];
      const rms = Math.sqrt(sum / (c.buf.length / 2));
      c.s.meter = Math.min(1, rms * 4);
      c.s.heardAt = performance.now() / 1000;
    }
  }

  /** What is playing (for tests). */
  get debug() {
    return this.chans.map((c) => ({ track: c.s.track, floor: c.s.spec.floor, positional: !!c.panner, meter: Math.round(c.s.meter * 1000) / 1000 }));
  }

  private drop(c: Chan) {
    if (c.voice) fadeOut(this.s.ctx, c.voice, 0.4);
    setTimeout(() => c.out.disconnect(), 600);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.unsub();
    // the scene fading out takes the mix with it; on a floor change only the players go
    for (const c of this.chans) if (c.voice) fadeOut(this.s.ctx, c.voice, this.s.dead ? 2.5 : 0.8);
  }
}

function setPos(p: PannerNode, x: number, y: number, z: number, t?: number) {
  if (p.positionX) {
    if (t === undefined) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else {
      p.positionX.setTargetAtTime(x, t, 0.05);
      p.positionY.setTargetAtTime(y, t, 0.05);
      p.positionZ.setTargetAtTime(z, t, 0.05);
    }
  } else p.setPosition(x, y, z);
}

function fadeOut(ctx: BaseAudioContext, v: Voice, s: number) {
  v.dead = true;
  const t = ctx.currentTime;
  v.env.gain.cancelScheduledValues(t);
  v.env.gain.setValueAtTime(v.env.gain.value, t);
  v.env.gain.linearRampToValueAtTime(0, t + s);
  setTimeout(() => stopVoice(v), s * 1000 + 150);
}

function stopVoice(v: Voice) {
  v.dead = true;
  try {
    v.src?.stop();
  } catch {
    /* already stopped */
  }
  v.env.disconnect();
}
